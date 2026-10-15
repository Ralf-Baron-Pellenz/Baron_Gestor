// ═══════════════════════════════════════════════════════════════════
//  Bapell Gestor Pro — Verificação de Licença (lado do APP)
//
//  Contém APENAS a chave PÚBLICA. Com ela dá para VERIFICAR uma chave,
//  mas é impossível CRIAR uma nova. Mesmo que alguém abra o app, não
//  consegue fabricar chaves válidas (isso exige a chave privada, que
//  fica só no seu Gerador de Chaves).
//
//  100% offline: nenhuma consulta a servidor.
// ═══════════════════════════════════════════════════════════════════

"use strict";

const crypto = require("crypto");
const core = require("./licenca-core");

// ═══════════════════════════════════════════════════════════════════
//  ⚠️  CHAVE PÚBLICA DO SEU APP
//
//  Esta DEVE ser a chave pública do MESMO par cuja chave PRIVADA está no
//  seu Gerador de Chaves. Se aqui estiver a chave de outro par (por ex.,
//  a de teste que veio no projeto), NENHUMA chave que você gerar vai
//  validar — todo cliente verá "chave inválida".
//
//  Como conferir: gere uma chave para o SEU próprio ID de Computador e
//  tente ativar. Se der "inválida", esta chave aqui não corresponde ao
//  seu gerador — substitua pela chave pública impressa pelo gerador.
// ═══════════════════════════════════════════════════════════════════
const CHAVE_PUBLICA_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA1yxUJqgIC66bNRYXJ1Z77qQs9b9KWwXZKZPyDg5es7M=
-----END PUBLIC KEY-----`;

// ── Carrega a chave pública UMA vez, no carregamento do módulo ──
// Duas vantagens:
//  1) Se o PEM estiver malformado (erro SEU de configuração), isso é
//     detectado AGORA, com uma mensagem clara, em vez de virar um
//     silencioso "chave inválida" que faz você culpar o cliente.
//  2) Não reparseia o PEM a cada verificação (o estaAtivado do main roda
//     no boot e a cada clique em notificação de lembrete).
let _PUB = null;
let _erroPub = "";
try {
  _PUB = crypto.createPublicKey(CHAVE_PUBLICA_PEM);
  if (_PUB.asymmetricKeyType !== "ed25519") {
    _erroPub =
      "A chave pública do app não é Ed25519 (tipo lido: " +
      _PUB.asymmetricKeyType +
      "). Verifique CHAVE_PUBLICA_PEM.";
    _PUB = null;
  }
} catch (e) {
  _erroPub =
    "CHAVE PÚBLICA DO APP INVÁLIDA (erro de configuração, não do cliente): " +
    (e && e.message ? e.message : String(e));
  _PUB = null;
}
if (_erroPub) {
  // Aparece no console do processo principal já no boot — para VOCÊ ver.
  console.error("[licenca-verify] " + _erroPub);
}

/** A chave pública embutida é utilizável? (para diagnóstico) */
function chavePublicaOk() {
  return !!_PUB;
}

/**
 * Verifica se uma chave digitada é válida para ESTE computador.
 *
 * @param {string} chave                 - chave de ativação digitada
 * @param {string} computerIdNormalizado - ID do computador normalizado (16 hex)
 * @returns {{ok:boolean, motivo:string, expira?:number, erroConfig?:boolean}}
 */
function verificarChave(chave, computerIdNormalizado) {
  // 0. A chave pública do PRÓPRIO app está utilizável?
  //    Se não, o problema é de configuração — NÃO é a chave do cliente.
  if (!_PUB) {
    return {
      ok: false,
      erroConfig: true,
      motivo:
        "Configuração de licença do aplicativo inválida. Contate o suporte. " +
        "(Detalhe técnico: " +
        _erroPub +
        ")",
    };
  }

  // 1. Desempacota (base32 → bytes) e confere versão/tamanho
  const pacote = core.desempacotarChave(chave);
  if (!pacote.ok) {
    return { ok: false, motivo: pacote.motivo };
  }

  // 2. Reconstrói a mensagem a partir do ID DESTA máquina + expiração da chave.
  //    A versão importa: a mensagem da v1 não tem o campo de tipo e precisa ser
  //    remontada exatamente como era, senão as chaves já vendidas não validam.
  let mensagem;
  try {
    mensagem = core.montarMensagem(
      computerIdNormalizado,
      pacote.expira,
      pacote.tipo,
      pacote.versao,
      // v3 leva os módulos na mensagem: é isso que os deixa cobertos pela
      // assinatura. Para v1 e v2 o parâmetro é ignorado, e a mensagem sai
      // exatamente como antes — as chaves já vendidas continuam validando.
      pacote.modulosBits,
      // v4 leva também o plano e o valor pago (cobertos pela assinatura:
      // ninguém troca o plano escolhido nem aumenta o próprio crédito).
      // Para v1, v2 e v3 é ignorado. Na chave de teste o valor é sempre 0.
      pacote.versao === 4
        ? { plano: pacote.plano, valorPago: pacote.valorPago || 0 }
        : undefined,
    );
  } catch (e) {
    // expira fora da faixa — chave corrompida na prática
    return { ok: false, motivo: "Chave incompleta ou corrompida." };
  }

  // 3. Confere a assinatura com a chave pública
  let assinaturaOk = false;
  try {
    assinaturaOk = crypto.verify(null, mensagem, _PUB, pacote.assinatura);
  } catch (e) {
    assinaturaOk = false;
  }
  if (!assinaturaOk) {
    return {
      ok: false,
      motivo: "Chave inválida ou não pertence a este computador.",
    };
  }

  // 4. Assinatura confere. A chave é AUTÊNTICA — daqui para baixo o que se
  //    decide é só se ela ainda está no prazo.
  const base = {
    autentica: true,
    versao: pacote.versao,
    tipo: pacote.tipo,
    rotuloTipo: core.rotuloTipo(pacote.tipo),
    expira: pacote.expira,
    diasRestantes: core.diasRestantes(pacote.expira),
    // ── Módulos liberados por esta chave ──────────────────────────
    // Vão junto do tipo, como informação SEPARADA: o app pergunta
    // "que tipo de chave é" e "o que ela libera" de forma independente,
    // e um módulo novo não exige mexer na lógica de tipos.
    //
    // Em chaves v1 e v2 vem tudo false — elas não têm o campo. Quem
    // decide o que fazer nesse caso é o app.
    modulos: pacote.modulos || core.bitsParaModulos(0),
    modulosBits: pacote.modulosBits || 0,
    // ── Plano e valor pago ────────────────────────────────────────
    // plano: o plano da licença PAGA ("anual", "vitalicia", "pro",
    //   "platinum") — pelo tipo e pelos módulos, a mesma regra de sempre
    //   (vale para v1–v4). Na chave de teste é null.
    // planoEscolhido: só na chave de TESTE v4 — o plano que o cliente
    //   pretende comprar. Não é pagamento: não gera crédito.
    // valorPago: em centavos, só na chave paga v4 (base do crédito no
    //   upgrade). null = a chave não traz o valor (v1, v2, v3 ou teste).
    plano: core.planoPorTipoEModulos(pacote.tipo, pacote.modulosBits || 0),
    planoEscolhido: pacote.versao === 4 && pacote.tipo === core.TIPO.TESTE && pacote.plano
      ? (core.plano(pacote.plano) || {}).id || null
      : null,
    valorPago: pacote.versao === 4 && pacote.tipo !== core.TIPO.TESTE ? pacote.valorPago : null,
  };
  base.rotuloPlano = base.plano
    ? core.rotuloPlano(base.plano)
    : base.planoEscolhido
      ? "Teste de 7 dias — plano escolhido: " + core.rotuloPlano(base.planoEscolhido)
      : base.rotuloTipo;

  if (pacote.expira !== 0) {
    const agora = Math.floor(Date.now() / 1000);
    if (agora > pacote.expira) {
      // "expirada" é diferente de "inválida": a chave é legítima, só venceu.
      // O app usa esta marca para abrir no modo bloqueado (com backup e notas
      // fiscais liberados) em vez de mandar o cliente para a tela de ativação
      // como se a chave fosse falsa.
      return Object.assign({}, base, {
        ok: false,
        expirada: true,
        motivo: "Esta licença expirou.",
      });
    }
  }

  return Object.assign({}, base, { ok: true, expirada: false, motivo: "" });
}

/**
 * Só confere se a chave é AUTÊNTICA (assinatura válida para esta máquina),
 * ignorando o prazo. Usado no boot para diferenciar três situações:
 * sem licença, licença vencida e licença ativa.
 */
function inspecionarChave(chave, computerIdNormalizado) {
  const r = verificarChave(chave, computerIdNormalizado);
  return {
    autentica: !!r.autentica,
    ativa: !!r.ok,
    expirada: !!r.expirada,
    erroConfig: !!r.erroConfig,
    motivo: r.motivo || "",
    tipo: r.tipo,
    rotuloTipo: r.rotuloTipo,
    expira: r.expira,
    versao: r.versao,
    diasRestantes: r.diasRestantes,
    // Os módulos precisam atravessar TODA a cadeia até a tela:
    //   verificarChave → inspecionarChave → situacaoLicenca (main.js)
    //     → preload → licenca-ui.js
    // Cada etapa monta o objeto campo a campo, então basta uma delas
    // esquecer para o módulo ficar bloqueado sem nenhum erro aparecer.
    modulos: r.modulos,
    modulosBits: r.modulosBits,
    // Plano, plano escolhido no teste e valor pago: o mesmo cuidado (o
    // cálculo do upgrade depende deles).
    plano: r.plano,
    planoEscolhido: r.planoEscolhido,
    valorPago: r.valorPago,
    rotuloPlano: r.rotuloPlano,
  };
}

module.exports = { verificarChave, inspecionarChave, chavePublicaOk };

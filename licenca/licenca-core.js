// ═══════════════════════════════════════════════════════════════════
//  Bapell Gestor Pro — Núcleo de Licença (regra ÚNICA e compartilhada)
//
//  Este arquivo NÃO contém segredos e NÃO lê hardware. Ele apenas define
//  o formato da chave, a forma de montar a "mensagem" que é assinada, os
//  planos comerciais e a regra do upgrade.
//
//  É usado por DOIS lados, que precisam concordar em tudo aqui:
//    • Gerador de Chaves (seu PC) — assina a mensagem com a chave PRIVADA.
//    • Bapell Gestor Pro (PC do cliente) — verifica a assinatura com a
//      chave PÚBLICA.
//
//  ⚠️  ESTE ARQUIVO PRECISA SER IDÊNTICO NOS DOIS PROJETOS.
//  Se as cópias divergirem, uma chave gerada de um lado pode não validar
//  do outro. Ao atualizar um, copie por cima do outro.
//
//  ── VERSÕES DO FORMATO ─────────────────────────────────────────────
//  v1 (antiga, ainda ACEITA):
//      [versao=1][expira: 4 bytes BE][assinatura: 64] = 69 bytes
//      mensagem assinada: "v1|<ID>|<expira>"
//      Todas as chaves v1 já emitidas eram vitalícias (o gerador antigo
//      gravava expira = 0 fixo).
//
//  v2 (com TIPO de licença, ainda ACEITA):
//      [versao=2][tipo: 1 byte][expira: 4 bytes BE][assinatura: 64] = 70 bytes
//      mensagem assinada: "v2|<ID>|<expira>|<tipo>"
//
//  v3 (com TIPO + MÓDULOS liberados, ainda ACEITA e ainda EMITIDA para a
//      chave de teste de 7 dias "comum", que continua igual):
//      [versao=3][tipo: 1][modulos: 2 BE][expira: 4][assinatura: 64] = 72 bytes
//      mensagem assinada: "v3|<ID>|<expira>|<tipo>|<modulos>"
//
//  v4 (atual, com TIPO + MÓDULOS + PLANO + VALOR PAGO):
//      [versao=4][tipo: 1][modulos: 2 BE][plano: 1][valorPago: 4 BE]
//      [expira: 4][assinatura: 64] = 77 bytes
//      mensagem assinada:
//        "v4|<ID>|<expira>|<tipo>|<modulos>|<plano>|<valorPago>"
//      • plano: o plano comercial da chave (PLANO, abaixo). Na chave paga,
//        é o plano vendido; na chave de TESTE, o plano que o cliente
//        pretende comprar (0 = nenhum escolhido).
//      • valorPago: o que o cliente pagou pela licença, em CENTAVOS. É a
//        base do crédito no upgrade. Na chave de teste é sempre 0: escolher
//        um plano no teste não é pagar por ele.
//
//  O app lê as QUATRO. Por isso subir a versão não derruba nenhum cliente
//  que já comprou. (Versões do app anteriores à v4 recusam a chave v4:
//  para ativar uma chave v4, o app precisa estar atualizado.)
//
//  ── POR QUE TUDO ISSO FICA DENTRO DA CHAVE ─────────────────────────
//  O campo é coberto pela assinatura. Guardar módulos, plano ou valor pago
//  num arquivo local (JSON, localStorage) daria uma proteção falsa —
//  bastaria editar um texto para liberar tudo ou inventar um crédito.
//
//  Os módulos são 2 bytes de bits: cada módulo licenciável ocupa 1 bit, o
//  que dá espaço para 16 módulos sem mudar o formato de novo.
// ═══════════════════════════════════════════════════════════════════

"use strict";

// Versão mais nova do formato. A chave paga e a chave de teste COM plano
// escolhido saem nela. Chamadas sem plano/valor (a chave de teste comum,
// as ferramentas antigas) continuam saindo em v3, exatamente como antes.
const VERSAO = 4;
const VERSAO_SEM_PLANO = 3;
const VERSOES_ACEITAS = [1, 2, 3, 4];

// Tamanho fixo da assinatura Ed25519 (sempre 64 bytes).
const TAM_ASSINATURA = 64;

// Tamanho total de cada formato, em bytes.
const TAM_CHAVE_V1 = 1 + 4 + TAM_ASSINATURA;                 // 69
const TAM_CHAVE_V2 = 1 + 1 + 4 + TAM_ASSINATURA;             // 70
const TAM_CHAVE_V3 = 1 + 1 + 2 + 4 + TAM_ASSINATURA;         // 72
const TAM_CHAVE_V4 = 1 + 1 + 2 + 1 + 4 + 4 + TAM_ASSINATURA; // 77
const TAM_CHAVE_BYTES = TAM_CHAVE_V3;                        // compatibilidade com código antigo

// Maior valor que cabe em 4 bytes sem sinal (limite do campo "expira").
const MAX_UINT32 = 4294967295; // 0xFFFFFFFF  (~ano 2106)

// ── Tipos de licença ───────────────────────────────────────────────
// O tipo vai DENTRO da chave e é coberto pela assinatura: não dá para
// alterar num arquivo local para virar vitalícia.
const TIPO = {
  VITALICIA: 0,
  TESTE: 1, // 7 dias (direito de teste antes da compra)
  ANUAL: 2, // 1 ano
};

const TIPOS_VALIDOS = [TIPO.VITALICIA, TIPO.TESTE, TIPO.ANUAL];

// ── Módulos licenciáveis ───────────────────────────────────────────
// Cada módulo ocupa UM BIT dentro do campo de 2 bytes da chave v3/v4.
//
// Para acrescentar um módulo no futuro: crie a chave aqui com o próximo
// bit livre (1 << 2, 1 << 3, …) e pronto — o formato da chave não muda e
// as chaves já emitidas continuam válidas.
//
// NUNCA reaproveite nem reordene um bit já usado: chaves vendidas
// guardam o número, e trocar o significado liberaria o módulo errado.
const MODULOS = {
  calculosPlanilhas: 1 << 0, // Processador de Planilha (vendas-import)
  // financeiroAvancado: 1 << 1,
  // relatoriosAvancados: 1 << 2,
};

const ROTULO_MODULO = {
  calculosPlanilhas: "Processador de Planilha",
};

// Os módulos Plus dos planos Pro e Platinum. Hoje são UM bit: no app, ele
// abre o Processador de Planilha, as Informações de Venda, o Gerador de
// EAN e o Gestor de Devoluções.
const MODULOS_PLUS = MODULOS.calculosPlanilhas;

// Maior valor que cabe no campo de 2 bytes.
const MAX_UINT16 = 65535;

/**
 * Converte a lista/objeto de módulos no número que vai na chave.
 * Aceita ["calculosPlanilhas"] ou { calculosPlanilhas: true }.
 */
function modulosParaBits(modulos) {
  if (modulos === undefined || modulos === null) return 0;
  if (typeof modulos === "number") {
    const n = Number(modulos);
    if (!Number.isInteger(n) || n < 0 || n > MAX_UINT16) {
      throw new Error("Máscara de módulos inválida: " + modulos);
    }
    return n;
  }
  const lista = Array.isArray(modulos)
    ? modulos
    : Object.keys(modulos).filter((k) => modulos[k]);

  let bits = 0;
  lista.forEach((nome) => {
    const bit = MODULOS[nome];
    if (bit === undefined) {
      // Falhar alto: um nome errado no gerador emitiria uma chave que
      // não libera nada, e o erro só apareceria no cliente.
      throw new Error("Módulo desconhecido: " + nome);
    }
    bits |= bit;
  });
  return bits;
}

/** Converte o número da chave num objeto { modulo: true/false }. */
function bitsParaModulos(bits) {
  const n = Number(bits) || 0;
  const out = {};
  Object.keys(MODULOS).forEach((nome) => {
    out[nome] = (n & MODULOS[nome]) !== 0;
  });
  return out;
}

function rotuloModulo(nome) {
  return ROTULO_MODULO[nome] || nome;
}

const ROTULO_TIPO = {
  0: "Vitalícia",
  1: "Teste de 7 dias",
  2: "Anual (1 ano)",
};

function rotuloTipo(tipo) {
  return ROTULO_TIPO[Number(tipo)] || "Desconhecida";
}

function _normalizarTipo(tipo) {
  if (tipo === undefined || tipo === null) return TIPO.VITALICIA;
  const n = Number(tipo);
  if (!Number.isInteger(n) || TIPOS_VALIDOS.indexOf(n) < 0) {
    throw new Error("Tipo de licença inválido: " + tipo);
  }
  return n;
}

// ═══════════════════════════════════════════════════════════════════
//  PLANOS COMERCIAIS
//
//  Os mesmos do modal de compra do app e dos Termos de Uso (Cláusula 5).
//  O código de cada plano vai na chave v4 — NUNCA reaproveite nem troque
//  um código já usado (as chaves vendidas guardam o número).
//
//  O preço é o de TABELA desta versão, em centavos. Ele NÃO vai na chave
//  (o que vai é o valor efetivamente pago, campo valorPago): mudar um
//  preço aqui não altera nenhuma chave emitida. O app usa a tabela para
//  mostrar os planos e para saber quanto custa o plano de destino num
//  upgrade; o Gerador, para sugerir o valor pago.
// ═══════════════════════════════════════════════════════════════════
const PLANO = {
  NENHUM: 0,   // chave de teste sem plano escolhido
  ANUAL: 1,    // Licença Anual
  VITALICIA: 2, // Licença Vitalícia
  PRO: 3,      // Pro (anual com os módulos Plus)
  PLATINUM: 4, // Platinum (vitalícia com os módulos Plus)
};

const PLANOS = [
  { id: "anual", codigo: PLANO.ANUAL, nome: "Licença Anual", tipo: TIPO.ANUAL, plus: false, precoCentavos: 41900 },
  { id: "vitalicia", codigo: PLANO.VITALICIA, nome: "Licença Vitalícia", tipo: TIPO.VITALICIA, plus: false, precoCentavos: 99700 },
  { id: "pro", codigo: PLANO.PRO, nome: "Pro", tipo: TIPO.ANUAL, plus: true, precoCentavos: 59990 },
  { id: "platinum", codigo: PLANO.PLATINUM, nome: "Platinum", tipo: TIPO.VITALICIA, plus: true, precoCentavos: 124990 },
];

// Para quais planos cada plano pode subir (Termos de Uso, Cláusula 9.1):
// da Licença Anual para a Vitalícia, o Pro ou o Platinum; do Pro ou da
// Licença Vitalícia para o Platinum. O Platinum é o mais completo.
const UPGRADES = {
  anual: ["vitalicia", "pro", "platinum"],
  vitalicia: ["platinum"],
  pro: ["platinum"],
  platinum: [],
};

/** O plano pelo id ("anual", "pro"…) ou pelo código da chave (1…4). */
function plano(idOuCodigo) {
  for (let i = 0; i < PLANOS.length; i++) {
    const p = PLANOS[i];
    if (p.id === idOuCodigo || p.codigo === Number(idOuCodigo)) return p;
  }
  return null;
}

/** Nome do plano ("Pro", "Platinum"…); "" se não houver. */
function rotuloPlano(idOuCodigo) {
  const p = plano(idOuCodigo);
  return p ? p.nome : "";
}

/**
 * O plano de uma licença PAGA pelo tipo e pelos módulos — a regra que o
 * app e o Gerador sempre usaram (vale também para v1, v2 e v3, que não
 * têm o campo de plano). Chave de teste não tem plano pago: devolve null.
 */
function planoPorTipoEModulos(tipo, modulosBits) {
  const t = Number(tipo);
  const plus = ((Number(modulosBits) || 0) & MODULOS_PLUS) === MODULOS_PLUS;
  if (t === TIPO.TESTE) return null;
  if (t === TIPO.ANUAL) return plus ? "pro" : "anual";
  if (t === TIPO.VITALICIA) return plus ? "platinum" : "vitalicia";
  return null;
}

function _normalizarPlano(codigo) {
  if (codigo === undefined || codigo === null || codigo === "") return PLANO.NENHUM;
  const n = Number(codigo);
  if (!Number.isInteger(n) || n < 0 || n > 255 || (n !== PLANO.NENHUM && !plano(n))) {
    throw new Error("Plano inválido: " + codigo);
  }
  return n;
}

// Valor em CENTAVOS: inteiro, de 0 até o limite do campo de 4 bytes.
function _normalizarValor(centavos) {
  if (centavos === undefined || centavos === null || centavos === "") return 0;
  const n = Number(centavos);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > MAX_UINT32) {
    throw new Error("Valor pago inválido (centavos inteiros, a partir de 0): " + centavos);
  }
  return n;
}

/**
 * Coerência entre o tipo, os módulos, o plano e o valor de uma chave v4.
 * Devolve "" quando está tudo certo, ou o motivo do problema.
 *
 *   • chave paga: o plano é obrigatório e precisa bater com o tipo e com
 *     os módulos Plus (Anual/Vitalícia sem, Pro/Platinum com);
 *   • chave de teste: sem módulos (o teste já libera tudo) e sem valor
 *     pago — escolher um plano no teste não significa ter pago por ele.
 */
function conferirPlano(tipo, modulosBits, codigoPlano, valorPago) {
  const t = Number(tipo);
  const m = Number(modulosBits) || 0;
  const c = Number(codigoPlano) || 0;
  const v = Number(valorPago) || 0;
  if (t === TIPO.TESTE) {
    if (m !== 0) return "A chave de teste não leva módulos: ela já libera tudo durante o teste.";
    if (v !== 0) return "A chave de teste não leva valor pago.";
    if (c !== PLANO.NENHUM && !plano(c)) return "Plano escolhido inválido.";
    return "";
  }
  const p = plano(c);
  if (!p) return "A chave paga precisa do plano vendido.";
  if (p.tipo !== t) return "O plano " + p.nome + " não combina com o tipo da chave.";
  const temPlus = (m & MODULOS_PLUS) === MODULOS_PLUS;
  if (p.plus !== temPlus) {
    return p.plus
      ? "O plano " + p.nome + " inclui os módulos Plus, e a chave não os libera."
      : "O plano " + p.nome + " não inclui os módulos Plus, e a chave os libera.";
  }
  return "";
}

// ═══════════════════════════════════════════════════════════════════
//  UPGRADE
//
//  Valor do upgrade = preço do plano desejado − crédito da licença atual.
//  Nunca negativo.
//
//  Crédito (regra comercial do Bapell):
//    • é o VALOR PAGO pela licença atual, gravado na chave (v4);
//    • só vale com a licença ATIVA — licença vencida não gera crédito;
//    • chave sem o valor pago (v1, v2, v3) não tem crédito automático;
//    • chave de teste não gera crédito (não é pagamento).
//  Só conta como upgrade a subida prevista em UPGRADES.
// ═══════════════════════════════════════════════════════════════════

/**
 * Orçamento de um upgrade.
 *
 * @param {object} origem  a licença paga atual:
 *        { plano: "anual"|"vitalicia"|"pro"|"platinum",
 *          ativa: boolean, valorPago: centavos | null }
 *        (null ou sem plano = não há licença paga: sem crédito)
 * @param {string} alvoId  o plano desejado
 * @returns {{ok, alvo, nome, precoCentavos, creditoCentavos, valorCentavos,
 *            upgrade, motivo}}
 *   upgrade: o alvo é uma subida prevista a partir do plano atual.
 *   motivo:  "" ou "sem-licenca-paga" | "vencida" | "sem-valor-pago" |
 *            "nao-e-upgrade" (por que o crédito é zero).
 */
function orcarUpgrade(origem, alvoId) {
  const alvo = plano(alvoId);
  if (!alvo) return { ok: false, motivo: "plano-invalido" };
  const preco = alvo.precoCentavos;
  const base = { ok: true, alvo: alvo.id, nome: alvo.nome, precoCentavos: preco, creditoCentavos: 0, valorCentavos: preco, upgrade: false, motivo: "" };

  const atual = origem && plano(origem.plano);
  if (!atual) return Object.assign(base, { motivo: "sem-licenca-paga" });

  const subida = (UPGRADES[atual.id] || []).indexOf(alvo.id) >= 0;
  if (!subida) return Object.assign(base, { motivo: "nao-e-upgrade" });
  base.upgrade = true;
  if (!origem.ativa) return Object.assign(base, { motivo: "vencida" });

  const pago = origem.valorPago;
  if (pago === null || pago === undefined || !Number.isFinite(Number(pago))) {
    return Object.assign(base, { motivo: "sem-valor-pago" });
  }
  const credito = Math.max(0, Math.round(Number(pago)));
  return Object.assign(base, {
    creditoCentavos: credito,
    valorCentavos: Math.max(0, preco - credito),
  });
}

// ── Expiração: validação estrita ───────────────────────────────────
// 0 = vitalícia. Qualquer outro valor precisa ser um inteiro finito
// dentro da faixa. O objetivo é NÃO deixar um erro no gerador (data mal
// parseada → NaN) virar silenciosamente uma licença vitalícia.
function _normalizarExpiracao(expiraEmSegundos) {
  if (expiraEmSegundos === 0 || expiraEmSegundos === undefined || expiraEmSegundos === null) {
    return 0; // vitalícia (ausência de validade é intencional)
  }
  const n = Number(expiraEmSegundos);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(
      "Expiração inválida (não é um número inteiro de segundos): " + expiraEmSegundos
    );
  }
  if (n < 0 || n > MAX_UINT32) {
    throw new Error("Expiração fora da faixa permitida: " + n);
  }
  return n;
}

// Coerência entre tipo e validade: só a vitalícia pode ter expira = 0.
// Sem esta checagem, um deslize no gerador emitiria um "teste de 7 dias"
// que nunca vence.
function _conferirCoerencia(tipo, expira) {
  if (tipo === TIPO.VITALICIA && expira !== 0) {
    throw new Error("Licença vitalícia não pode ter data de expiração.");
  }
  if (tipo !== TIPO.VITALICIA && expira === 0) {
    throw new Error("Licença com prazo precisa de uma data de expiração.");
  }
}

// ── Normalização do ID do Computador ───────────────────────────────
// O ID exibido tem traços (7F4A-93B2-8C17-55E1). Para assinar/validar
// usamos só os 16 caracteres hexadecimais, em maiúsculas. Os dois lados
// PRECISAM normalizar exatamente igual.
function normalizarComputerId(id) {
  return String(id || "").toUpperCase().replace(/[^0-9A-F]/g, "");
}

// ── Mensagem que é assinada ────────────────────────────────────────
// A assinatura cobre versão + ID do computador + expiração (+ tipo, na v2;
// + módulos, na v3; + plano e valor pago, na v4). Assim, uma chave só vale
// para AQUELE computador, com AQUELA validade, AQUELE tipo, AQUELES
// módulos e AQUELE plano/valor.
//
// O parâmetro `versao` existe para conseguir REVALIDAR chaves antigas: a
// mensagem delas precisa ser reconstruída exatamente como era, byte a
// byte. Sem `versao`, sai v4 quando vêm o plano/valor (`extra`) e v3
// quando não vêm — é assim que a chave de teste comum continua igual.
//
// extra (v4): { plano: código do plano, valorPago: centavos }
function montarMensagem(computerIdNormalizado, expiraEmSegundos, tipo, versao, mods, extra) {
  const v = versao === undefined || versao === null
    ? (extra ? VERSAO : VERSAO_SEM_PLANO)
    : Number(versao);
  const exp = _normalizarExpiracao(expiraEmSegundos);

  if (v === 1) {
    // Formato antigo: sem tipo. NÃO alterar — quebraria as chaves emitidas.
    return Buffer.from(`v1|${computerIdNormalizado}|${exp}`, "utf8");
  }

  const t = _normalizarTipo(tipo);

  if (v === 2) {
    // Formato v2: sem módulos. Mantido para reconferir chaves já emitidas.
    return Buffer.from(`v2|${computerIdNormalizado}|${exp}|${t}`, "utf8");
  }

  // v3: os módulos entram na mensagem, e por isso ficam cobertos pela
  // assinatura. Sem isso, alguém poderia trocar o campo na chave e
  // liberar módulos que não comprou.
  const m = _normalizarModulos(mods);
  if (v === 3) {
    return Buffer.from(`v3|${computerIdNormalizado}|${exp}|${t}|${m}`, "utf8");
  }

  // v4: plano e valor pago também cobertos pela assinatura — ninguém
  // consegue trocar o plano escolhido nem aumentar o próprio crédito.
  const e = extra || {};
  const c = _normalizarPlano(e.plano);
  const val = _normalizarValor(e.valorPago);
  return Buffer.from(`v4|${computerIdNormalizado}|${exp}|${t}|${m}|${c}|${val}`, "utf8");
}

function _normalizarModulos(modulos) {
  if (modulos === undefined || modulos === null) return 0;
  return modulosParaBits(modulos);
}

// ── Base32 (RFC 4648, sem padding) ─────────────────────────────────
// Alfabeto A–Z + 2–7. NOTA: este alfabeto CONTÉM O, I e L — que se
// confundem com 0, 1 e 1 na leitura. Por isso o decode faz um mapa de
// tolerância (0→O, 1→I, 8→B) antes de interpretar, para que um cliente
// que digite "0" no lugar de "O" ainda ative, em vez de receber "chave
// corrompida". Sem símbolos, para não atrapalhar copiar/colar por e-mail.
const ALFABETO32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// Confusões comuns de digitação → letra correta do alfabeto.
// (Só mapeia caracteres que NÃO existem no alfabeto: 0,1,8,9.)
const TOLERANCIA = { "0": "O", "1": "I", "8": "B", "9": "G" };

function base32Encode(buf) {
  let bits = 0;
  let valor = 0;
  let saida = "";
  for (let i = 0; i < buf.length; i++) {
    valor = (valor << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    saida += ALFABETO32[(valor << (5 - bits)) & 31];
  }
  return saida;
}

function base32Decode(texto) {
  // Maiúsculas, aplica tolerância de dígitos-confusos, remove o resto.
  let s = String(texto || "").toUpperCase();
  s = s.replace(/[0189]/g, (c) => TOLERANCIA[c] || "");
  const limpo = s.replace(/[^A-Z2-7]/g, "");

  let bits = 0;
  let valor = 0;
  const bytes = [];
  for (let i = 0; i < limpo.length; i++) {
    const idx = ALFABETO32.indexOf(limpo[i]);
    if (idx === -1) continue;
    valor = (valor << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// ── Empacotar / desempacotar a chave ───────────────────────────────
// Formata em blocos de 6 separados por "-" só para ficar legível.
//
// Sem `extra`, sai a chave v3 de sempre (byte a byte igual à de antes).
// Com `extra` ({ plano, valorPago }), sai a v4 — e a coerência entre tipo,
// módulos, plano e valor é conferida aqui, antes de existir a chave.
function empacotarChave(expiraEmSegundos, assinatura, tipo, modulos, extra) {
  if (!Buffer.isBuffer(assinatura) || assinatura.length !== TAM_ASSINATURA) {
    throw new Error("Assinatura com tamanho inválido.");
  }
  const exp = _normalizarExpiracao(expiraEmSegundos); // lança se inválido
  const t = _normalizarTipo(tipo);
  _conferirCoerencia(t, exp);
  const m = _normalizarModulos(modulos);

  let buf;
  if (!extra) {
    buf = Buffer.alloc(TAM_CHAVE_V3);
    buf.writeUInt8(VERSAO_SEM_PLANO, 0);
    buf.writeUInt8(t, 1);
    buf.writeUInt16BE(m, 2);
    buf.writeUInt32BE(exp, 4);
    assinatura.copy(buf, 8);
  } else {
    const c = _normalizarPlano(extra.plano);
    const val = _normalizarValor(extra.valorPago);
    const problema = conferirPlano(t, m, c, val);
    if (problema) throw new Error(problema);
    buf = Buffer.alloc(TAM_CHAVE_V4);
    buf.writeUInt8(VERSAO, 0);
    buf.writeUInt8(t, 1);
    buf.writeUInt16BE(m, 2);
    buf.writeUInt8(c, 4);
    buf.writeUInt32BE(val, 5);
    buf.writeUInt32BE(exp, 9);
    assinatura.copy(buf, 13);
  }
  const texto = base32Encode(buf);
  return texto.replace(/(.{6})(?=.)/g, "$1-"); // XXXXXX-XXXXXX-...
}

function desempacotarChave(chave) {
  const buf = base32Decode(chave);
  if (buf.length === 0) {
    return { ok: false, motivo: "Chave incompleta ou corrompida." };
  }

  const versao = buf.readUInt8(0);
  if (VERSOES_ACEITAS.indexOf(versao) < 0) {
    return { ok: false, motivo: "Versão de chave não suportada." };
  }

  // ── v1: formato antigo, sem tipo ──
  // Todas as chaves v1 emitidas eram vitalícias (expira = 0). Se por algum
  // motivo vier com prazo, é tratada como anual — nunca como vitalícia.
  if (versao === 1) {
    if (buf.length !== TAM_CHAVE_V1) {
      return { ok: false, motivo: "Chave incompleta ou corrompida." };
    }
    const expira = buf.readUInt32BE(1);
    return {
      ok: true,
      versao: 1,
      tipo: expira === 0 ? TIPO.VITALICIA : TIPO.ANUAL,
      expira,
      // Chave antiga não tem o campo: nenhum módulo licenciável vem nela.
      // Quem decide o que fazer com isso é o app, não este arquivo.
      modulosBits: 0,
      modulos: bitsParaModulos(0),
      // Sem os campos da v4: sem plano escolhido e sem valor pago.
      plano: PLANO.NENHUM,
      valorPago: null,
      assinatura: buf.subarray(5),
    };
  }

  // ── v2: com tipo, sem módulos ──
  if (versao === 2) {
    if (buf.length !== TAM_CHAVE_V2) {
      return { ok: false, motivo: "Chave incompleta ou corrompida." };
    }
    const tipo2 = buf.readUInt8(1);
    if (TIPOS_VALIDOS.indexOf(tipo2) < 0) {
      return { ok: false, motivo: "Tipo de licença desconhecido nesta chave." };
    }
    return {
      ok: true,
      versao: 2,
      tipo: tipo2,
      expira: buf.readUInt32BE(2),
      modulosBits: 0,
      modulos: bitsParaModulos(0),
      plano: PLANO.NENHUM,
      valorPago: null,
      assinatura: buf.subarray(6),
    };
  }

  // ── v3: com tipo E módulos ──
  if (versao === 3) {
    if (buf.length !== TAM_CHAVE_V3) {
      return { ok: false, motivo: "Chave incompleta ou corrompida." };
    }
    const tipo = buf.readUInt8(1);
    if (TIPOS_VALIDOS.indexOf(tipo) < 0) {
      return { ok: false, motivo: "Tipo de licença desconhecido nesta chave." };
    }
    const modulosBits = buf.readUInt16BE(2);
    return {
      ok: true,
      versao: 3,
      tipo,
      expira: buf.readUInt32BE(4),
      modulosBits,
      modulos: bitsParaModulos(modulosBits),
      plano: PLANO.NENHUM,
      valorPago: null,
      assinatura: buf.subarray(8),
    };
  }

  // ── v4: com tipo, módulos, plano e valor pago ──
  if (buf.length !== TAM_CHAVE_V4) {
    return { ok: false, motivo: "Chave incompleta ou corrompida." };
  }
  const tipo4 = buf.readUInt8(1);
  if (TIPOS_VALIDOS.indexOf(tipo4) < 0) {
    return { ok: false, motivo: "Tipo de licença desconhecido nesta chave." };
  }
  const modulos4 = buf.readUInt16BE(2);
  const codigo4 = buf.readUInt8(4);
  const valor4 = buf.readUInt32BE(5);
  if (codigo4 !== PLANO.NENHUM && !plano(codigo4)) {
    return { ok: false, motivo: "Plano desconhecido nesta chave." };
  }
  // Uma chave assinada nunca chega incoerente (o empacotar confere antes
  // de existir a chave). Se chegar, não é uma chave do Gerador: recusa.
  if (conferirPlano(tipo4, modulos4, codigo4, valor4)) {
    return { ok: false, motivo: "Chave inconsistente." };
  }
  return {
    ok: true,
    versao: 4,
    tipo: tipo4,
    expira: buf.readUInt32BE(9),
    modulosBits: modulos4,
    modulos: bitsParaModulos(modulos4),
    plano: codigo4,
    valorPago: tipo4 === TIPO.TESTE ? null : valor4,
    assinatura: buf.subarray(13),
  };
}

// ── Ajudantes de prazo (usados pelo app e pelo gerador) ────────────
const DIA_EM_SEGUNDOS = 86400;

/** Timestamp Unix (segundos) daqui a N dias, a partir de agora. */
function expiraEmDias(dias) {
  const n = Number(dias);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Quantidade de dias inválida: " + dias);
  }
  return Math.floor(Date.now() / 1000) + Math.round(n * DIA_EM_SEGUNDOS);
}

/**
 * Quantos dias faltam até expirar (arredondado para cima).
 * Vitalícia devolve Infinity; já vencida devolve 0 ou negativo.
 */
function diasRestantes(expira, agoraEmSegundos) {
  const exp = Number(expira) || 0;
  if (exp === 0) return Infinity;
  const agora = agoraEmSegundos || Math.floor(Date.now() / 1000);
  return Math.ceil((exp - agora) / DIA_EM_SEGUNDOS);
}

module.exports = {
  VERSAO,
  VERSAO_SEM_PLANO,
  VERSOES_ACEITAS,
  MODULOS,
  MODULOS_PLUS,
  modulosParaBits,
  bitsParaModulos,
  rotuloModulo,
  TAM_CHAVE_V3,
  TAM_CHAVE_V4,
  TAM_CHAVE_BYTES,
  TAM_CHAVE_V1,
  TAM_CHAVE_V2,
  TIPO,
  ROTULO_TIPO,
  rotuloTipo,
  // Planos comerciais e upgrade
  PLANO,
  PLANOS,
  UPGRADES,
  plano,
  rotuloPlano,
  planoPorTipoEModulos,
  conferirPlano,
  orcarUpgrade,
  DIA_EM_SEGUNDOS,
  normalizarComputerId,
  montarMensagem,
  empacotarChave,
  desempacotarChave,
  base32Encode,
  base32Decode,
  expiraEmDias,
  diasRestantes,
};

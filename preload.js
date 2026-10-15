// ═══════════════════════════════════════════════════════════════════
//  Bapell Gestor Pro — preload.js
//  Ponte segura entre o front (renderer) e o processo principal.
//  Mantém contextIsolation:true / nodeIntegration:false.
//
//  ── ESCOPO POR TELA ────────────────────────────────────────────────
//  Este arquivo roda em TODOS os frames (o main.js liga
//  nodeIntegrationInSubFrames para que as abas também tenham a ponte).
//  Por isso cada API só é exposta na tela que realmente precisa dela:
//  nenhuma tela recebe poder que não usa.
//
//    ativacao.html        → licencaAPI
//    shell.html           → shellAPI
//    lembretes.html       → lembretesAPI
//    lembrete-aviso.html  → avisoAPI (a janela de aviso de lembrete)
//    ajuda.html           → inicializacaoAPI
//    todas                → appAPI (só a versão, para o log de erros)
// ═══════════════════════════════════════════════════════════════════

"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Qual arquivo está sendo carregado neste frame.
function _arquivoAtual() {
  try {
    return (window.location.pathname || "").split("/").pop().toLowerCase();
  } catch (e) {
    return "";
  }
}

// Estamos no frame de topo ou dentro de uma aba (iframe)?
function _ehFramePrincipal() {
  try {
    return process.isMainFrame !== false;
  } catch (e) {
    return true;
  }
}

const ARQUIVO = _arquivoAtual();
const PRINCIPAL = _ehFramePrincipal();

// ═══════════════════════════════════════════════════════════════════
//  Versão do app — disponível em todas as telas
// ═══════════════════════════════════════════════════════════════════
// Síncrono de propósito: precisa estar pronto antes do error-handler.js,
// que é o primeiro script de cada página.
const VERSAO_KEY = "precifiq_app_versao";
let _versao = "?";
try {
  _versao = ipcRenderer.sendSync("app:versao-sync") || "?";
} catch (e) {
  _versao = "?";
}

// Espelha no localStorage a partir do frame principal. É a rede de
// segurança: se um dia nodeIntegrationInSubFrames for desligado, o
// preload volta a não rodar nas abas e o log ainda saberá a versão.
// (A gravação em si acontece logo abaixo, DEPOIS de instalar o storage de
// disco — senão iria para o localStorage nativo, que é substituído em seguida.)

contextBridge.exposeInMainWorld("appAPI", {
  versao: _versao,
  ehFramePrincipal: PRINCIPAL,
});

// ═══════════════════════════════════════════════════════════════════
//  Armazenamento em disco — substitui o localStorage
// ═══════════════════════════════════════════════════════════════════
// Os dados do app vivem num dados.json no disco (pasta do programa), não no
// armazenador interno do Chromium (limite de ~5 MB, escondido, some em
// reinstalação). Para não reescrever as ~92 chamadas de localStorage nas
// telas, substituímos o próprio window.localStorage por um que:
//   • lê de uma cópia em memória carregada do disco no arranque;
//   • grava cada mudança de volta no disco (via IPC, sem travar a UI).
// As telas continuam chamando localStorage.getItem/setItem igual.
(function instalarStorageDeDisco() {
  let dados = {};
  try {
    // Lê TODOS os dados do disco de uma vez, de forma síncrona, ANTES da página
    // usar o localStorage. Só o frame principal precisa; os iframes herdam via
    // a mesma origem file://, mas por segurança cada frame lê a sua cópia.
    dados = ipcRenderer.sendSync("disco:carregarTudo") || {};
  } catch (e) {
    dados = {};
  }

  // Objeto que imita a API do localStorage, gravando no disco.
  const storageDisco = {
    getItem: function (chave) {
      chave = String(chave);
      return Object.prototype.hasOwnProperty.call(dados, chave) ? dados[chave] : null;
    },
    setItem: function (chave, valor) {
      chave = String(chave);
      valor = String(valor);
      dados[chave] = valor;
      try { ipcRenderer.send("disco:set", chave, valor); } catch (e) {}
    },
    removeItem: function (chave) {
      chave = String(chave);
      delete dados[chave];
      try { ipcRenderer.send("disco:remove", chave); } catch (e) {}
    },
    clear: function () {
      dados = {};
      try { ipcRenderer.send("disco:clear"); } catch (e) {}
    },
    key: function (i) {
      const ks = Object.keys(dados);
      return i >= 0 && i < ks.length ? ks[i] : null;
    },
    get length() {
      return Object.keys(dados).length;
    },
  };

  // Substitui o window.localStorage pela versão de disco. Usa defineProperty
  // porque localStorage é uma propriedade só-leitura por padrão.
  try {
    Object.defineProperty(window, "localStorage", {
      value: storageDisco,
      writable: false,
      configurable: true,
    });
  } catch (e) {
    // Se não der para substituir (ambiente atípico), o app cai no localStorage
    // nativo — não quebra, só volta ao comportamento antigo.
    console.error("[preload] não foi possível instalar o storage de disco:", e);
  }

  // Expõe helpers para os arquivos pesados (logos, fotos, PDFs). O front usa
  // isso para tirar o base64 do dados.json e guardar como arquivo no disco.
  contextBridge.exposeInMainWorld("discoArquivos", {
    salvar: (id, dataUrl) => ipcRenderer.invoke("disco:salvarArquivo", id, dataUrl),
    ler: (nome) => ipcRenderer.invoke("disco:lerArquivo", nome),
    remover: (nome) => ipcRenderer.invoke("disco:removerArquivo", nome),
    // Monta a URL app:// que o <img src> pode usar direto (sem base64).
    url: (nome) => nome ? "app://arquivo/" + encodeURIComponent(nome) : "",
    // Pasta real dos dados no disco + tamanho, e abrir no Explorer (tela de Ajuda).
    info: () => ipcRenderer.invoke("disco:info"),
    abrirPasta: () => ipcRenderer.invoke("disco:abrirPasta"),
  });

  // Agora que o localStorage é o de disco, grava a versão do app (para o
  // error-handler carimbar no log). Vai para o dados.json, no frame principal.
  if (PRINCIPAL) {
    try { storageDisco.setItem(VERSAO_KEY, _versao); } catch (e) {}
  }
})();

// ═══════════════════════════════════════════════════════════════════
//  Licença — SOMENTE na tela de ativação
// ═══════════════════════════════════════════════════════════════════
// Antes era exposta a todas as telas, inclusive à casca de abas, que
// não faz ideia do que é uma licença. Agora só quem ativa tem acesso.
// A CONSULTA de status vai para TODAS as telas: cada uma precisa saber se
// deve se bloquear (licença vencida) ou avisar que o prazo está acabando.
const _licencaAPI = {
  status: () => ipcRenderer.invoke("licenca:status"),
  // Planos com os preços de tabela e o orçamento do upgrade. Vão para TODAS
  // as telas pelo mesmo motivo do status: o modal de compra abre em qualquer
  // uma (inclusive num módulo bloqueado). São só leitura: a tela diz QUAL
  // plano quer; preço, crédito e valor saem do processo principal,
  // calculados a partir da chave conferida.
  planos: () => ipcRenderer.invoke("licenca:planos"),
  orcamento: (alvoId) => ipcRenderer.invoke("licenca:orcamento", alvoId),
};

// A tela de ativação e o modal de renovação (que abre no dashboard e módulos
// quando a licença vence) precisam ATIVAR uma nova chave sem reinstalar. Por
// isso os poderes de ativar/copiar/continuar e a leitura da chave atual ficam
// disponíveis nessas telas. As demais só consultam status.
// A Ajuda entra na lista pelo botão "Alterar minha chave": quem troca de
// plano (ou renova) cola a chave nova ali mesmo, sem ir para a ativação.
const _TELAS_COM_RENOVACAO = [
  "ativacao.html", "index.html", "shell.html",
  "acoes-massa.html", "ean.html", "empresa.html", "financeiro.html",
  "lembretes.html", "registro-vendas.html", "vendas.html", "produto.html",
  "plataforma.html", "nf.html", "clientes.html", "calculos.html",
  "ajuda.html",
];

if (_TELAS_COM_RENOVACAO.indexOf(ARQUIVO) >= 0) {
  _licencaAPI.dadosMaquina = () => ipcRenderer.invoke("licenca:dadosMaquina");
  _licencaAPI.ativar = (chave) => ipcRenderer.invoke("licenca:ativar", chave);
  _licencaAPI.copiar = (texto) => ipcRenderer.invoke("licenca:copiar", texto);
  _licencaAPI.continuar = () => ipcRenderer.invoke("licenca:continuar");
  _licencaAPI.chaveAtual = () => ipcRenderer.invoke("licenca:chaveAtual");
}

contextBridge.exposeInMainWorld("licencaAPI", _licencaAPI);

// ═══════════════════════════════════════════════════════════════════
//  Casca de abas — SOMENTE no shell.html
// ═══════════════════════════════════════════════════════════════════
if (ARQUIVO === "shell.html") {
  contextBridge.exposeInMainWorld("shellAPI", {
    /**
     * Escuta pedidos do processo principal para abrir uma aba.
     * Devolve uma função para CANCELAR a escuta.
     *
     * Sem o cancelamento, cada chamada empilhava um ouvinte novo no
     * ipcRenderer (que avisa a partir de 10). Um reload da casca faria
     * a notificação de lembrete abrir 2, 3, 4 abas.
     */
    onAbrirAba: (cb) => {
      const handler = (_e, url) => cb(url);
      ipcRenderer.on("shell:abrir-aba", handler);
      return () => ipcRenderer.removeListener("shell:abrir-aba", handler);
    },
    /** Primeira execução no Windows: mostrar a dica de fixar na barra? */
    dicaFixar: () => ipcRenderer.invoke("app:dicaFixar"),
    /** A dica foi vista: não aparece mais. */
    dicaFixarVista: () => ipcRenderer.invoke("app:dicaFixarVista"),
  });
}

// ═══════════════════════════════════════════════════════════════════
//  Lembretes — SOMENTE na tela de lembretes
// ═══════════════════════════════════════════════════════════════════
// Esta tela vive dentro de um iframe. Sem nodeIntegrationInSubFrames no
// main.js, este bloco nunca rodaria e window.lembretesAPI seria undefined:
// o sync imediato não acontecia.
if (ARQUIVO === "lembretes.html") {
  contextBridge.exposeInMainWorld("lembretesAPI", {
    sync: () => ipcRenderer.invoke("lembretes:sync"),
  });
}

// ═══════════════════════════════════════════════════════════════════
//  Aviso de lembrete — SOMENTE na janela de aviso
// ═══════════════════════════════════════════════════════════════════
// A janela própria que aparece no canto da tela quando um lembrete vence
// (lembrete-aviso.html). Ela lê o lembrete do mesmo armazenamento do app
// e pede ao processo principal o que só ele faz: adiar, abrir o app na
// ficha do lembrete e se fechar.
if (ARQUIVO === "lembrete-aviso.html") {
  contextBridge.exposeInMainWorld("avisoAPI", {
    fila: () => ipcRenderer.invoke("aviso:fila"),
    /** Escuta a fila nova (outro lembrete venceu). Devolve o cancelamento. */
    aoMudarFila: (cb) => {
      const handler = (_e, fila) => cb(fila);
      ipcRenderer.on("aviso:fila", handler);
      return () => ipcRenderer.removeListener("aviso:fila", handler);
    },
    adiar: (chave, minutos, quando) => ipcRenderer.invoke("aviso:adiar", chave, minutos, quando),
    resolvido: (chave) => ipcRenderer.invoke("aviso:resolvido", chave),
    abrir: (chave) => ipcRenderer.invoke("aviso:abrir", chave),
    fechar: () => ipcRenderer.invoke("aviso:fechar"),
    altura: (px) => ipcRenderer.send("aviso:altura", px),
  });
}

// ═══════════════════════════════════════════════════════════════════
//  Abrir com o Windows — SOMENTE na tela de ajuda
// ═══════════════════════════════════════════════════════════════════
// A opção "Abrir ao inicializar" ficava na tela de lembretes e foi movida
// para a Ajuda. A ponte acompanha a tela: quem tem o botão é quem recebe o
// poder de ler e gravar a inicialização automática do Windows.
if (ARQUIVO === "ajuda.html") {
  contextBridge.exposeInMainWorld("inicializacaoAPI", {
    obter: () => ipcRenderer.invoke("lembretes:getAutoStart"),
    definir: (on) => ipcRenderer.invoke("lembretes:setAutoStart", on),
  });
}

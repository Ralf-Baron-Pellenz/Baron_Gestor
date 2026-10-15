// ═══════════════════════════════════════════
//  Bapell Gestor Pro — main.js (Electron entry)
// ═══════════════════════════════════════════

const {
  app, BrowserWindow, ipcMain, clipboard,
  Tray, Menu, Notification, nativeImage, shell, protocol, screen,
} = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const MachineId = require("./licenca/machine-id");
const { normalizarComputerId } = require("./licenca/licenca-core");
// O módulo inteiro também: os planos, os preços de tabela e o cálculo do
// upgrade vêm dele (a mesma fonte do Gerador de Chaves).
const LicencaCore = require("./licenca/licenca-core");
const { verificarChave, inspecionarChave } = require("./licenca/licenca-verify");
const DiscoStore = require("./disco-store");

// O protocolo app:// serve os arquivos pesados (logos, fotos, PDFs) direto do
// disco, sem carregar base64 gigante na memória da página. Precisa ser
// registrado como privilegiado ANTES do app ficar pronto.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } },
]);

let win = null;
let tray = null;
app.isQuitting = false;

// ── Caminhos dos dados (pasta de dados do app, gravável) ──
function _arqLicenca() { return path.join(app.getPath("userData"), "licenca.dat"); }
// A licença PAGA fica guardada aqui enquanto o cliente usa a nova chave de
// teste (a que traz o plano escolhido). Quando o teste acaba, ela volta a
// ser a licença do app. Ativar uma chave paga apaga este arquivo.
function _arqLicencaPaga() { return path.join(app.getPath("userData"), "licenca-paga.dat"); }
function _arqSolicitacao() { return path.join(app.getPath("userData"), "solicitacao.dat"); }
function _arqAvisados() { return path.join(app.getPath("userData"), "lembretes-avisados.json"); }
function _arqAdiados() { return path.join(app.getPath("userData"), "lembretes-adiados.json"); }
// Avisos à vista que ainda não tiveram resposta (o app pode fechar com a
// janela de aviso aberta): voltam na próxima abertura.
function _arqFila() { return path.join(app.getPath("userData"), "lembretes-fila.json"); }
function _iconePath() { return path.join(__dirname, "imagens/icon.ico"); }

// ── ID do computador (formatado e normalizado) desta máquina ──
function _computerIdAtual() {
  const fp = MachineId.obterFingerprint();          // instantâneo (cache do boot)
  const formatado = MachineId.computerIdFormatado(fp);
  return { formatado, normalizado: normalizarComputerId(formatado) };
}

// ── Situação da licença ────────────────────────────────────────────
// Três estados, não dois. A diferença entre "vencida" e "sem licença"
// é o que permite o app abrir em modo bloqueado (com Ajuda e Notas
// Fiscais liberadas para o cliente tirar o backup dele) em vez de
// mandá-lo para a tela de ativação como se a chave fosse falsa.
//
//   estado: "ativa" | "expirada" | "sem-licenca"

// Lê a chave gravada num arquivo ("" se não houver).
function _lerArquivoChave(arq) {
  try {
    return fs.readFileSync(arq, "utf8").trim();
  } catch (e) {
    return "";
  }
}

// A licença PAGA guardada durante um teste — conferida pela assinatura,
// como qualquer chave. Devolve { chave, r } ou null (sem arquivo, chave
// inautêntica, de outro computador ou que não é paga).
function _licencaPagaGuardada(normalizado) {
  const chave = _lerArquivoChave(_arqLicencaPaga());
  if (!chave) return null;
  const r = inspecionarChave(chave, normalizado);
  if (!r.autentica || r.tipo === LicencaCore.TIPO.TESTE || !r.plano) return null;
  return { chave, r };
}

// Resumo da licença paga guardada, para as telas (sem a chave em si).
function _resumoPagaGuardada(normalizado) {
  const g = _licencaPagaGuardada(normalizado);
  if (!g) return null;
  return {
    plano: g.r.plano,
    rotuloPlano: g.r.rotuloPlano,
    ativa: !!g.r.ativa,
    expirada: !!g.r.expirada,
    expira: g.r.expira,
    diasRestantes: g.r.diasRestantes,
    valorPago: g.r.valorPago === undefined ? null : g.r.valorPago,
  };
}

// Quando a chave instalada é de TESTE e o teste acabou (ou ela deixou de
// valer), a licença paga guardada volta a ser a licença do app. Devolve a
// chave restaurada, ou "" quando não há nada a restaurar.
function _restaurarPagaSeTesteAcabou(chaveAtual) {
  if (!fs.existsSync(_arqLicencaPaga())) return "";
  const { normalizado } = _computerIdAtual();
  if (chaveAtual) {
    const atual = inspecionarChave(chaveAtual, normalizado);
    if (atual.ativa) return "";                       // o teste continua: nada muda
    if (atual.autentica && atual.tipo !== LicencaCore.TIPO.TESTE) return ""; // já é uma paga
  }
  const guardada = _licencaPagaGuardada(normalizado);
  if (!guardada) return "";
  fs.writeFileSync(_arqLicenca(), guardada.chave);
  try { fs.unlinkSync(_arqLicencaPaga()); } catch (e) {}
  return guardada.chave;
}

// Plano e valor pago da chave — os dados do cálculo do upgrade. Vêm da
// chave conferida pela assinatura: mexer nos arquivos locais não muda o
// plano nem o crédito.
function _camposDePlano(r, normalizado) {
  const ehTeste = r.tipo === LicencaCore.TIPO.TESTE;
  return {
    versao: r.versao,
    plano: r.plano || null,                    // licença paga: o plano dela
    planoEscolhido: r.planoEscolhido || null,  // teste novo: o plano que o cliente pretende comprar
    valorPago: r.valorPago === undefined ? null : r.valorPago, // centavos (só chave paga v4)
    rotuloPlano: r.rotuloPlano || r.rotuloTipo,
    // Durante um teste: a licença paga que volta quando ele acabar.
    pagaGuardada: ehTeste ? _resumoPagaGuardada(normalizado) : null,
  };
}

function situacaoLicenca() {
  let chave = "";
  try {
    chave = fs.readFileSync(_arqLicenca(), "utf8").trim();
  } catch (e) {
    chave = "";
  }

  // O teste acabou e há uma licença paga guardada? Ela volta agora.
  try {
    const restaurada = _restaurarPagaSeTesteAcabou(chave);
    if (restaurada) chave = restaurada;
  } catch (e) {
    console.error("[licenca] não foi possível restaurar a licença paga:", e);
  }

  if (!chave) {
    return { estado: "sem-licenca", ativa: false, expirada: false, motivo: "" };
  }

  try {
    const { normalizado } = _computerIdAtual();
    const r = inspecionarChave(chave, normalizado);

    if (r.ativa) {
      return Object.assign({
        estado: "ativa", ativa: true, expirada: false, motivo: "",
        tipo: r.tipo, rotuloTipo: r.rotuloTipo,
        expira: r.expira, diasRestantes: r.diasRestantes,
        // ── Módulos liberados por esta chave ───────────────────────
        // PRECISA vir junto: o licenca-ui.js decide o acesso ao
        // Processador de Planilha por este campo. Como o retorno é
        // montado campo a campo, esquecer esta linha não dá erro —
        // o módulo simplesmente fica bloqueado para todo mundo.
        modulos: r.modulos,
        modulosBits: r.modulosBits,
      }, _camposDePlano(r, normalizado));
    }
    if (r.expirada) {
      return Object.assign({
        estado: "expirada", ativa: false, expirada: true, motivo: r.motivo,
        tipo: r.tipo, rotuloTipo: r.rotuloTipo,
        expira: r.expira, diasRestantes: r.diasRestantes,
        modulos: r.modulos,
        modulosBits: r.modulosBits,
      }, _camposDePlano(r, normalizado));
    }
    // Assinatura não confere (chave falsa, de outra máquina, corrompida)
    return { estado: "sem-licenca", ativa: false, expirada: false, motivo: r.motivo };
  } catch (e) {
    return { estado: "sem-licenca", ativa: false, expirada: false, motivo: String(e && e.message) };
  }
}

// Mantido para o código que já usava: continua respondendo "pode usar?".
function estaAtivado() {
  return situacaoLicenca().ativa;
}

// ── Código de Solicitação (9 chars, só identificação visual) ──
function _codigoSolicitacao() {
  try {
    const salvo = fs.readFileSync(_arqSolicitacao(), "utf8").trim();
    if (salvo && salvo.length === 9) return salvo;
  } catch (e) {}
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let cod = "";
  const rnd = crypto.randomBytes(9);
  for (let i = 0; i < 9; i++) cod += abc[rnd[i] % abc.length];
  try { fs.writeFileSync(_arqSolicitacao(), cod); } catch (e) {}
  return cod;
}

// ── Decide qual tela carregar: sistema (com abas) ou ativação ──
function carregarTelaCerta() {
  // Licença vencida ainda ENTRA no app: as telas é que se bloqueiam sozinhas,
  // deixando Ajuda (backup) e Notas Fiscais acessíveis. Mandar para a ativação
  // trancaria o cliente fora dos próprios dados.
  const sit = situacaoLicenca();
  const destino = (sit.ativa || sit.expirada) ? "shell.html" : "ativacao.html";
  win.loadFile(path.join(__dirname, destino)).catch((err) => {
    console.error("Falha ao carregar " + destino + ":", err);
  });
}

// ═══════════════════════════════════════════
//  LEMBRETES — alertas em segundo plano
// ═══════════════════════════════════════════
//
//  ── A NOTIFICAÇÃO ──────────────────────────────────────────────────
//  Quando um lembrete vence, abre uma janela PRÓPRIA do app no canto da
//  tela (lembrete-aviso.html): maior que o balão do Windows, sempre por
//  cima e funcionando com o sistema minimizado ou só na bandeja. Nela:
//  Concluir, Abrir o lembrete e Adiar ("lembrar de novo em" 5 min,
//  15 min, 30 min, 1 hora ou amanhã de manhã). Vários lembretes vencendo
//  juntos ficam na mesma janela, um de cada vez ("1 de 3").
//  Se a janela não puder ser criada, fica o balão do Windows de antes.
//
//  ── AVISADOS E ADIADOS ─────────────────────────────────────────────
//  Cada vencimento avisa uma vez (lembretes-avisados.json, chave
//  "id@dataHora": editar a data re-arma o aviso). Adiar guarda até quando
//  em lembretes-adiados.json; passado esse horário, o mesmo lembrete
//  avisa de novo. O lembrete em si não muda — continua "Vencido" na lista.
//  Os que estavam na janela sem resposta quando o app fechou (ou o
//  computador desligou) ficam em lembretes-fila.json e voltam a aparecer
//  na próxima abertura.

function _lerAvisados() {
  try {
    const a = JSON.parse(fs.readFileSync(_arqAvisados(), "utf8"));
    return Array.isArray(a) ? new Set(a) : new Set();
  } catch (e) { return new Set(); }
}
function _salvarAvisados(set) {
  try {
    // Mantém no máximo os 800 mais recentes para não crescer sem limite
    const arr = [...set].slice(-800);
    fs.writeFileSync(_arqAvisados(), JSON.stringify(arr));
  } catch (e) {}
}

// Adiamentos: { "id@dataHora": quando avisar de novo (ms) }
function _lerAdiados() {
  try {
    const o = JSON.parse(fs.readFileSync(_arqAdiados(), "utf8"));
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch (e) { return {}; }
}
function _salvarAdiados(obj) {
  try { fs.writeFileSync(_arqAdiados(), JSON.stringify(obj)); } catch (e) {}
}

// Lê os lembretes do localStorage (mesma base do restante do app)
async function _lerLembretes() {
  if (!win || win.webContents.isDestroyed()) return [];
  try {
    const raw = await win.webContents.executeJavaScript(
      "localStorage.getItem('precifiq_lembretes')", true
    );
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

// Verifica lembretes vencidos e avisa (uma vez por vencimento — e de novo
// quando um adiamento termina)
async function verificarLembretes() {
  const lembretes = await _lerLembretes();
  // Lista vazia (ou que não deu para ler agora — a tela recarregando, por
  // exemplo): não há o que avisar, e os adiamentos ficam como estão.
  if (!lembretes.length) return;
  const avisados = _lerAvisados();
  const adiados = _lerAdiados();
  const agora = Date.now();
  let mudouAvisados = false;
  let mudouAdiados = false;
  const existentes = new Set();
  const avisar = [];

  lembretes.forEach((l) => {
    if (!l || !l.id || !l.dataHora) return;
    const chave = l.id + "@" + l.dataHora; // muda se editar a data → re-arma
    existentes.add(chave);
    if (l.concluido || l.oculto) return;
    const t = new Date(l.dataHora).getTime();
    if (isNaN(t) || t > agora) return;

    if (adiados[chave]) {
      if (adiados[chave] > agora) return; // ainda adiado
      delete adiados[chave];              // o adiamento acabou: avisa de novo
      mudouAdiados = true;
      if (!avisados.has(chave)) { avisados.add(chave); mudouAvisados = true; }
      avisar.push(l);
      return;
    }
    if (avisados.has(chave)) return;
    avisados.add(chave);
    mudouAvisados = true;
    avisar.push(l);
  });

  // Adiamento de lembrete que sumiu ou mudou de data não serve mais.
  Object.keys(adiados).forEach((k) => {
    if (!existentes.has(k)) { delete adiados[k]; mudouAdiados = true; }
  });

  // Primeira conferência desde que o app abriu: os avisos que ficaram sem
  // resposta na sessão anterior voltam — na frente, que são os mais antigos.
  if (!_filaRestaurada) {
    _filaRestaurada = true;
    const porChave = new Map();
    lembretes.forEach((l) => { if (l && l.id && l.dataHora) porChave.set(l.id + "@" + l.dataHora, l); });
    const voltam = [];
    _lerFilaSalva().forEach((chave) => {
      const l = porChave.get(chave);
      if (!l || l.concluido || l.oculto) return;
      if (adiados[chave] && adiados[chave] > agora) return;
      if (!voltam.some((x) => x.id + "@" + x.dataHora === chave)) voltam.push(l);
    });
    if (voltam.length) {
      const novas = avisar.filter((l) => !voltam.some((x) => x.id === l.id && x.dataHora === l.dataHora));
      avisar.length = 0;
      voltam.concat(novas).forEach((l) => avisar.push(l));
    }
  }

  if (mudouAvisados) _salvarAvisados(avisados);
  if (mudouAdiados) _salvarAdiados(adiados);
  if (avisar.length) _avisarLembretes(avisar);
}

// ── A janela de aviso ──────────────────────────────────────────────
let janelaAviso = null;
let filaAvisos = []; // chaves "id@dataHora", na ordem em que venceram
const dadosAvisos = new Map(); // chave → lembrete (para a notificação de reserva)
let _filaRestaurada = false;

function _lerFilaSalva() {
  try {
    const a = JSON.parse(fs.readFileSync(_arqFila(), "utf8"));
    return Array.isArray(a) ? a.filter((k) => typeof k === "string" && k.indexOf("@") > 0) : [];
  } catch (e) { return []; }
}
function _salvarFila() {
  try { fs.writeFileSync(_arqFila(), JSON.stringify(filaAvisos)); } catch (e) {}
}

function _avisarLembretes(lista) {
  lista.forEach((l) => {
    const chave = l.id + "@" + l.dataHora;
    dadosAvisos.set(chave, l);
    if (filaAvisos.indexOf(chave) < 0) filaAvisos.push(chave);
  });
  _salvarFila();
  try {
    _abrirJanelaAviso();
  } catch (e) {
    console.error("[lembretes] janela de aviso indisponível, usando a notificação do Windows:", e);
    _reservaNativa();
  }
}

// A janela não abriu (ou o conteúdo dela falhou): os da fila vão para a
// notificação do Windows de antes, e a janela quebrada sai da tela.
function _reservaNativa() {
  const j = janelaAviso;
  janelaAviso = null;
  try { if (j && !j.isDestroyed()) j.destroy(); } catch (e) {}
  filaAvisos.forEach((chave) => {
    const l = dadosAvisos.get(chave);
    if (l) _notificacaoNativa(l);
  });
  filaAvisos = [];
  _salvarFila();
}

// A notificação do Windows de antes: só quando a janela própria falha.
function _notificacaoNativa(l) {
  try {
    if (!Notification.isSupported()) return;
    const partes = [];
    if (l.valor) partes.push(l.valorTipo === "rs" ? "R$ " + l.valor : l.valor);
    if (l.recebedor) partes.push(l.recebedor);
    if (l.empresaNome) partes.push(l.empresaNome);
    const n = new Notification({
      title: "Lembrete: " + l.titulo,
      body: partes.join("  •  ") || "Está na hora deste lembrete.",
      silent: false,
      icon: _iconePath(),
      // "never" impede a notificação de sumir sozinha após alguns segundos.
      timeoutType: "never",
    });
    n.on("click", () => _abrirLembreteNoApp(l.id));
    n.show();
  } catch (e) {}
}

// Mostra o app e abre a ficha do lembrete na tela de Lembretes.
function _abrirLembreteNoApp(id) {
  mostrarJanela();
  if (win && estaAtivado()) {
    win.webContents.send("shell:abrir-aba", "lembretes.html" + (id ? "?ver=" + encodeURIComponent(id) : ""));
  }
}

const AVISO_LARGURA = 420;
const AVISO_ALTURA_INICIAL = 260;
const AVISO_MARGEM = 16;

// A área útil do monitor onde está o app (ou o principal): o aviso fica
// no canto de baixo, à direita, acima da barra de tarefas.
function _areaDoAviso() {
  try {
    if (win && !win.isDestroyed() && win.isVisible()) {
      return screen.getDisplayMatching(win.getBounds()).workArea;
    }
  } catch (e) {}
  return screen.getPrimaryDisplay().workArea;
}

// Posiciona no canto do monitor escolhido quando a janela abriu. Se a
// pessoa arrastou a janela para outro lugar, ela fica onde foi deixada —
// só a altura muda, com a borda de baixo no mesmo ponto.
function _posicionarAviso(altura) {
  const j = janelaAviso;
  if (!j || j.isDestroyed()) return;
  let area = j._areaAviso || _areaDoAviso();
  const atual = j.getBounds();
  const ultimo = j._ultimoBounds;
  const movida = !!ultimo && (Math.abs(atual.x - ultimo.x) > 2 || Math.abs(atual.y - ultimo.y) > 2);
  if (movida) {
    try { area = screen.getDisplayMatching(atual).workArea; } catch (e) {}
  }
  const h = Math.max(160, Math.min(Math.round(altura), area.height - 2 * AVISO_MARGEM));
  let x;
  let y;
  if (movida) {
    x = Math.min(Math.max(atual.x, area.x), area.x + area.width - AVISO_LARGURA);
    y = Math.min(Math.max(atual.y + atual.height - h, area.y), area.y + area.height - h);
  } else {
    x = area.x + area.width - AVISO_LARGURA - AVISO_MARGEM;
    y = area.y + area.height - h - AVISO_MARGEM;
  }
  const novo = { x: Math.round(x), y: Math.round(y), width: AVISO_LARGURA, height: h };
  j.setBounds(novo);
  j._ultimoBounds = j.getBounds();
}

function _abrirJanelaAviso() {
  if (janelaAviso && !janelaAviso.isDestroyed()) {
    // Já aberta: só recebe a fila nova e volta para a frente.
    janelaAviso.webContents.send("aviso:fila", filaAvisos.slice());
    if (!janelaAviso.isVisible()) janelaAviso.showInactive();
    janelaAviso.moveTop();
    return;
  }
  janelaAviso = new BrowserWindow({
    width: AVISO_LARGURA,
    height: AVISO_ALTURA_INICIAL,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: "Lembrete — Bapell Gestor Pro",
    icon: _iconePath(),
    backgroundColor: "#1A2336",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // O mesmo preload das outras telas: ele expõe a esta janela só o
      // avisoAPI (ver o preload.js).
      preload: path.join(__dirname, "preload.js"),
      // O som do aviso toca sem a pessoa ter clicado antes.
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  const j = janelaAviso;
  // Acima até de janelas em tela cheia, como uma notificação.
  try { j.setAlwaysOnTop(true, "screen-saver"); } catch (e) {}
  j.setMenuBarVisibility(false);
  // O monitor do aviso é escolhido agora: depois, ele não pula de tela
  // quando o app muda de monitor ou vai para a bandeja.
  j._areaAviso = _areaDoAviso();
  _posicionarAviso(AVISO_ALTURA_INICIAL);
  j.loadFile(path.join(__dirname, "lembrete-aviso.html")).catch((err) => {
    console.error("Falha ao carregar o aviso de lembrete:", err);
    if (janelaAviso === j) _reservaNativa();
  });
  // A página do aviso não carregou ou caiu: a notificação do Windows
  // assume, e a janela vazia não fica presa por cima de tudo.
  j.webContents.on("did-fail-load", (_e, codigo, desc, _url, principal) => {
    if (principal === false || codigo === -3) return; // -3: navegação interrompida (não é falha)
    console.error("[lembretes] o aviso não carregou:", codigo, desc);
    if (janelaAviso === j) _reservaNativa();
  });
  j.webContents.on("render-process-gone", (_e, det) => {
    console.error("[lembretes] o aviso parou:", det && det.reason);
    if (janelaAviso === j) _reservaNativa();
  });
  // Aparece SEM roubar o foco de quem está digitando em outro programa.
  j.once("ready-to-show", () => {
    if (!j.isDestroyed()) j.showInactive();
  });
  j.on("closed", () => {
    // Só a janela atual mexe na fila: uma que já foi substituída (fechou
    // e uma nova abriu logo em seguida) não apaga os avisos da nova.
    if (janelaAviso !== j) return;
    janelaAviso = null;
    filaAvisos = [];
    dadosAvisos.clear();
    // O arquivo da fila não é apagado aqui: fechada sem resposta (o app
    // saindo, o Windows desligando), a fila volta na próxima abertura.
  });
  // Links nunca abrem dentro do aviso.
  j.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  j.webContents.on("will-navigate", (e) => e.preventDefault());
}

// Fecha a janela de aviso. A referência sai na hora: um lembrete que vença
// enquanto ela termina de fechar abre uma janela nova, em vez de ir para a
// que está fechando.
function _fecharJanelaAviso() {
  const j = janelaAviso;
  janelaAviso = null;
  try { if (j && !j.isDestroyed()) j.close(); } catch (e) {}
}

// Tira uma chave da fila; sem nada na fila, fecha a janela.
function _tirarDaFila(chave) {
  filaAvisos = filaAvisos.filter((c) => c !== chave);
  dadosAvisos.delete(chave);
  _salvarFila();
  if (!janelaAviso || janelaAviso.isDestroyed()) return;
  if (!filaAvisos.length) { _fecharJanelaAviso(); return; }
  janelaAviso.webContents.send("aviso:fila", filaAvisos.slice());
}

// ═══════════════════════════════════════════
//  Bandeja (tray)
// ═══════════════════════════════════════════

function mostrarJanela() {
  if (!win) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function criarTray() {
  if (tray) return;
  let img = nativeImage.createFromPath(_iconePath());
  if (img.isEmpty()) img = nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip("Bapell Gestor Pro");
  const menu = Menu.buildFromTemplate([
    { label: "Abrir Bapell Gestor Pro", click: mostrarJanela },
    { type: "separator" },
    { label: "Sair", click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on("double-click", mostrarJanela);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    icon: _iconePath(),
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Faz o preload.js rodar TAMBÉM dentro dos iframes (as abas do
      // shell.html). Sem isto, window.lembretesAPI era undefined na tela
      // de Lembretes: o sync imediato nunca acontecia e a opção "abrir com
      // o Windows" não tinha como funcionar.
      //
      // O nome engana: isto NÃO dá Node à página. nodeIntegration continua
      // false e contextIsolation continua true — a página só enxerga o que
      // o contextBridge expõe, e o preload expõe cada API só na tela dela.
      nodeIntegrationInSubFrames: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.maximize();
  win.show();

  // A barra de menu (File/Edit/View) fica escondida — o app tem visual próprio.
  // Isto NÃO desativa os atalhos de edição do menu instalado em _instalarMenuEdicao:
  // Ctrl+C/V/X/A continuam valendo mesmo com a barra oculta.
  win.setMenuBarVisibility(false);
  win.setAutoHideMenuBar(true);

  carregarTelaCerta();

 // ======================================================
// Controle de novas janelas
// ======================================================

const _externo = (url) => /^(https?|mailto):/i.test(url);

win.webContents.setWindowOpenHandler(({ url }) => {

  // Permite apenas janelas usadas para impressão/PDF
  if (
    !url ||
    url === "" ||
    url === "about:blank"
  ) {

    return {

      action: "allow",

      overrideBrowserWindowOptions: {

        width: 900,
        height: 820,

        show: true,

        autoHideMenuBar: true,

        backgroundColor: "#ffffff",

        icon: _iconePath(),

        webPreferences: {

          contextIsolation: true,

          sandbox: true,

          nodeIntegration: false,

          nodeIntegrationInSubFrames: false,

          enableRemoteModule: false,

          preload: undefined

        }

      }

    };

  }

  // Links externos continuam abrindo no navegador

  if (_externo(url)) {

    shell.openExternal(url);

    return { action: "deny" };

  }

  // Todo o restante permanece bloqueado

  return {

    action: "deny"

  };

});

// Remove menu das janelas de impressão

win.webContents.on("did-create-window", (child) => {

  child.setMenuBarVisibility(false);

});

  // Sem isto, um <a href="https://..."> SEM target="_blank" navegava o próprio
  // quadro e carregava o site externo DENTRO da aba, sem botão de voltar.
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith("file://")) return;   // navegação interna do app
    e.preventDefault();
    if (_externo(url)) shell.openExternal(url);
  });

  // ── Fechar no X → esconde na bandeja (continua rodando p/ os alertas) ──
  // Vai para a bandeja em silêncio, sem exibir nenhum aviso ao usuário.
  win.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  // ── Sistema de Zoom ──────────────────────────────────────────────
  // IMPORTANTE: usa before-input-event (LOCAL à janela), não globalShortcut.
  // globalShortcut registra atalho no nível do SISTEMA OPERACIONAL: como o app
  // agora vive na bandeja depois de fechar a janela, ele sequestrava
  // Ctrl+= / Ctrl+- / Ctrl+0 de TODOS os outros programas (navegador, Word,
  // VS Code) enquanto estivesse rodando — mesmo escondido.
  const ZOOM_STEP = 0.1, ZOOM_MIN = 0.5, ZOOM_MAX = 3.0;
  function clampZoom(level) { return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level)); }
  function applyZoom(level) { win.webContents.setZoomFactor(clampZoom(level)); }
  function zoomRelativo(delta) { applyZoom(win.webContents.getZoomFactor() + delta); }

  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (!(input.control || input.meta)) return;
    const k = String(input.key || "");
    if (k === "=" || k === "+") { event.preventDefault(); zoomRelativo(ZOOM_STEP); }
    else if (k === "-" || k === "_") { event.preventDefault(); zoomRelativo(-ZOOM_STEP); }
    else if (k === "0") { event.preventDefault(); applyZoom(1.0); }
  });

  win.webContents.on("zoom-changed", (_event, dir) => {
    if (dir === "in") zoomRelativo(ZOOM_STEP);
    if (dir === "out") zoomRelativo(-ZOOM_STEP);
  });

  // A janela foi destruída: zera a referência (senão mostrarJanela() usaria
  // um objeto morto e lançaria "Object has been destroyed").
  win.on("closed", () => { win = null; });

  // Menu de contexto nativo (botão direito) em qualquer campo de texto, igual
  // a um app nativo do Windows: Recortar, Copiar, Colar, Selecionar tudo.
  _instalarMenuContexto(win.webContents);
}

// ═══════════════════════════════════════════
//  COPIAR / COLAR — menu de edição + menu de contexto
// ═══════════════════════════════════════════
// Menu de aplicação só com o submenu "Edição" (roles nativos). Os roles trazem
// os atalhos Ctrl+X / Ctrl+C / Ctrl+V / Ctrl+A já traduzidos pelo sistema e
// ligados ao campo em foco. A barra fica escondida, mas os atalhos valem.
function _instalarMenuEdicao() {
  const template = [
    {
      label: "Edição",
      submenu: [
        { role: "undo", label: "Desfazer" },
        { role: "redo", label: "Refazer" },
        { type: "separator" },
        { role: "cut", label: "Recortar" },
        { role: "copy", label: "Copiar" },
        { role: "paste", label: "Colar" },
        { role: "delete", label: "Excluir" },
        { type: "separator" },
        { role: "selectAll", label: "Selecionar tudo" },
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Menu de contexto (botão direito). Só mostra as ações que fazem sentido no
// alvo: em campo editável aparece tudo; em texto comum, só Copiar/Selecionar.
// Vale também dentro dos iframes (as abas do shell) porque escutamos o
// context-menu do webContents da janela toda.
function _instalarMenuContexto(webContents) {
  webContents.on("context-menu", (_event, params) => {
    const editavel = params.isEditable;
    const temSelecao = !!(params.selectionText && params.selectionText.trim());
    const itens = [];

    if (editavel) {
      itens.push({ role: "cut", label: "Recortar", enabled: temSelecao });
      itens.push({ role: "copy", label: "Copiar", enabled: temSelecao });
      itens.push({ role: "paste", label: "Colar" });
      itens.push({ type: "separator" });
      itens.push({ role: "selectAll", label: "Selecionar tudo" });
    } else if (temSelecao) {
      itens.push({ role: "copy", label: "Copiar" });
      itens.push({ type: "separator" });
      itens.push({ role: "selectAll", label: "Selecionar tudo" });
    } else {
      // Sem seleção e fora de campo: ainda oferece "Selecionar tudo".
      itens.push({ role: "selectAll", label: "Selecionar tudo" });
    }

    const menu = Menu.buildFromTemplate(itens);
    menu.popup({ window: BrowserWindow.fromWebContents(webContents) || win });
  });
}


// ═══════════════════════════════════════════
//  IPC — ativação
// ═══════════════════════════════════════════

ipcMain.handle("licenca:dadosMaquina", () => {
  try {
    const { formatado } = _computerIdAtual();
    return {
      computerId: formatado,
      codigoSolicitacao: _codigoSolicitacao(),
      origem: MachineId.origem(),   // "hardware" | "fallback" | "dev"
    };
  } catch (e) {
    // Blindagem: antes, uma exceção aqui rejeitava o IPC e a tela ficava
    // em "—" para sempre, sem dizer por quê — tanto o ID quanto o código.
    console.error("[licenca:dadosMaquina]", e);
    return {
      computerId: "ERRO: " + (e && e.message ? e.message : String(e)),
      codigoSolicitacao: "-",
      origem: "erro",
    };
  }
});

ipcMain.handle("licenca:ativar", (_e, chave) => {
  try {
    const { normalizado } = _computerIdAtual();
    const nova = (chave || "").trim();
    const r = verificarChave(nova, normalizado);
    if (r.ok) {
      const ehTeste = r.tipo === LicencaCore.TIPO.TESTE;

      // ── Nova chave de teste sobre uma licença paga ──────────────
      // A nova chave de teste (a que traz o plano escolhido) não apaga a
      // licença PAGA ativa: ela fica guardada e volta quando o teste acabar.
      // A chave de teste antiga continua exatamente como antes.
      let guardou = false;
      if (ehTeste && r.planoEscolhido) {
        const atual = _lerArquivoChave(_arqLicenca());
        if (atual && atual !== nova) {
          const ra = inspecionarChave(atual, normalizado);
          if (ra.ativa && ra.tipo !== LicencaCore.TIPO.TESTE && ra.plano) {
            try { fs.writeFileSync(_arqLicencaPaga(), atual); guardou = true; }
            catch (err) {
              return { ok: false, motivo: "Não foi possível guardar a sua licença atual neste computador. Nada foi alterado." };
            }
          }
        }
      }

      try { fs.writeFileSync(_arqLicenca(), nova); }
      catch (err) {
        if (guardou) { try { fs.unlinkSync(_arqLicencaPaga()); } catch (e2) {} }
        return { ok: false, motivo: "Não foi possível salvar a licença neste computador." };
      }

      // Chave paga: ela é a licença do cliente agora — a guardada sai.
      if (!ehTeste) {
        try { fs.unlinkSync(_arqLicencaPaga()); } catch (err) {}
      }

      return Object.assign({}, r, {
        pagaGuardada: ehTeste ? _resumoPagaGuardada(normalizado) : null,
      });
    }
    return r;
  } catch (e) {
    // Sem isto o IPC rejeitava e o botão ficava preso em "Validando…".
    return { ok: false, motivo: "Falha ao validar: " + (e && e.message ? e.message : String(e)) };
  }
});

// Situação atual da licença — consultada por todas as telas para saber se
// bloqueiam módulos e se mostram aviso de vencimento próximo.
ipcMain.handle("licenca:status", () => {
  try {
    return situacaoLicenca();
  } catch (e) {
    return { estado: "sem-licenca", ativa: false, expirada: false, motivo: String(e && e.message) };
  }
});

ipcMain.handle("licenca:copiar", (_e, texto) => { clipboard.writeText(String(texto || "")); return true; });
ipcMain.handle("licenca:continuar", () => { carregarTelaCerta(); return true; });

// Retorna a chave atualmente instalada (só leitura). Usada pelo modal de
// renovação para preencher automaticamente o formulário de solicitação de
// nova chave. Não valida nem grava nada — apenas devolve o texto salvo.
ipcMain.handle("licenca:chaveAtual", () => {
  try {
    return fs.readFileSync(_arqLicenca(), "utf8").trim();
  } catch (e) {
    return ""; // sem chave instalada → formulário abre com o campo vazio
  }
});

// ── Planos e preços de tabela ─────────────────────────────────────
// Vêm do licenca-core.js (a mesma tabela do Gerador de Chaves). As telas
// mostram estes preços: nenhum valor de plano é digitado pelo usuário.
function _tabelaPlanos() {
  return LicencaCore.PLANOS.map((p) => ({
    id: p.id,
    nome: p.nome,
    precoCentavos: p.precoCentavos,
    plus: !!p.plus,
    vitalicia: p.tipo === LicencaCore.TIPO.VITALICIA,
    upgrades: (LicencaCore.UPGRADES[p.id] || []).slice(),
  }));
}

ipcMain.handle("licenca:planos", () => {
  try {
    return _tabelaPlanos();
  } catch (e) {
    return [];
  }
});

// ── Orçamento de upgrade ──────────────────────────────────────────
// Valor do upgrade = preço do plano desejado − crédito da licença atual,
// nunca negativo. Tudo calculado AQUI, a partir da chave conferida pela
// assinatura: o plano atual, o valor pago (crédito) e se a licença está
// ativa. A tela só informa QUAL plano quer — nunca preço nem crédito.
//
// A origem do crédito é a licença PAGA: a instalada ou, durante a nova
// chave de teste, a guardada. O teste em si não gera crédito: escolher um
// plano no teste não significa ter pago por ele.
function _orcamentoLicenca(alvoId) {
  const sit = situacaoLicenca();
  const ehTeste = sit.tipo === LicencaCore.TIPO.TESTE;

  let origem = null;
  if (!ehTeste && sit.plano && (sit.estado === "ativa" || sit.estado === "expirada")) {
    origem = {
      plano: sit.plano, rotuloPlano: sit.rotuloPlano,
      ativa: !!sit.ativa, expira: sit.expira, diasRestantes: sit.diasRestantes,
      valorPago: sit.valorPago === undefined ? null : sit.valorPago,
      guardada: false,
    };
  } else if (ehTeste && sit.pagaGuardada) {
    origem = Object.assign({}, sit.pagaGuardada, { guardada: true });
  }

  const itens = LicencaCore.PLANOS.map((p) => {
    const o = LicencaCore.orcarUpgrade(origem, p.id);
    o.escolhido = !!(ehTeste && sit.planoEscolhido === p.id);
    o.atual = !!(origem && origem.plano === p.id);
    o.vitalicia = p.tipo === LicencaCore.TIPO.VITALICIA;
    return o;
  });

  let alvo = null;
  if (alvoId !== undefined && alvoId !== null && alvoId !== "") {
    const id = String(alvoId);
    for (let i = 0; i < itens.length; i++) {
      if (itens[i].alvo === id) { alvo = itens[i]; break; }
    }
  }

  return {
    ok: true,
    estado: sit.estado,
    teste: ehTeste,
    planoEscolhido: ehTeste ? (sit.planoEscolhido || null) : null,
    origem: origem,
    upgrades: origem ? (LicencaCore.UPGRADES[origem.plano] || []).slice() : [],
    itens: itens,
    alvo: alvo,
  };
}

ipcMain.handle("licenca:orcamento", (_e, alvoId) => {
  try {
    return _orcamentoLicenca(alvoId);
  } catch (e) {
    return { ok: false, motivo: String(e && e.message ? e.message : e), itens: [], upgrades: [] };
  }
});

// ═══════════════════════════════════════════
//  IPC — informações do app
// ═══════════════════════════════════════════

// Síncrono de propósito: o preload lê isto antes da página carregar e
// deixa a versão disponível para o log de erros de todas as telas.
// É uma leitura de string curta; o custo é irrelevante.
ipcMain.on("app:versao-sync", (e) => {
  try { e.returnValue = app.getVersion(); }
  catch (err) { e.returnValue = "?"; }
});

ipcMain.handle("app:versao", () => {
  try { return app.getVersion(); } catch (e) { return "?"; }
});

// ═══════════════════════════════════════════
//  IPC — armazenamento em disco (dados.json + arquivos\)
// ═══════════════════════════════════════════

// SÍNCRONO: o preload lê TODOS os dados de uma vez, antes da página carregar,
// e popula o localStorage da página com eles. Assim as ~92 chamadas de
// localStorage nas telas continuam funcionando sem mudança, mas os dados
// vivem no disco.
ipcMain.on("disco:carregarTudo", (e) => {
  try { e.returnValue = DiscoStore.todos(); }
  catch (err) { e.returnValue = {}; }
});

// Gravações vêm de forma assíncrona (não travam a UI). O disco-store agrupa
// em rajada e grava atômico.
ipcMain.on("disco:set", (_e, chave, valor) => { DiscoStore.setItem(chave, valor); });
ipcMain.on("disco:remove", (_e, chave) => { DiscoStore.removeItem(chave); });
ipcMain.on("disco:clear", () => { DiscoStore.clear(); });

// Arquivos pesados (logos, fotos, PDFs): o app manda o base64, recebe de volta
// o nome do arquivo gravado (que guarda no lugar do base64).
ipcMain.handle("disco:salvarArquivo", (_e, id, dataUrl) => {
  return DiscoStore.salvarArquivo(id, dataUrl);
});
ipcMain.handle("disco:lerArquivo", (_e, nome) => {
  return DiscoStore.lerArquivo(nome);
});
ipcMain.handle("disco:removerArquivo", (_e, nome) => {
  return DiscoStore.removerArquivo(nome);
});

// Informações reais da pasta de dados no disco (caminho + tamanho), para a
// tela de Ajuda mostrar a verdade em vez do falso limite de 5 MB.
ipcMain.handle("disco:info", () => {
  try {
    const base = DiscoStore.info() || {};
    // Acrescenta o espaço REAL do disco onde ficam os dados. O DiscoStore só
    // sabe o tamanho da própria pasta; o espaço livre/total do disco só o
    // processo principal consegue ler (fs.statfs), não a tela.
    try {
      const alvo = base.pasta || app.getPath("userData");
      const st = fs.statfsSync(alvo);
      const totalDisco = st.blocks * st.bsize;
      const livreDisco = st.bavail * st.bsize;
      base.discoTotalBytes = totalDisco;
      base.discoLivreBytes = livreDisco;
      // "Disponível para o programa" = o que ainda cabe. Como os dados do app
      // já ocupam parte do usado, o que ele pode crescer é o espaço livre.
      base.discoUsadoBytes = totalDisco - livreDisco;
    } catch (e) {
      // Em ambiente sem statfs, devolve só o que o DiscoStore já tinha.
      base.discoTotalBytes = 0;
      base.discoLivreBytes = 0;
      base.discoUsadoBytes = 0;
    }
    return base;
  } catch (e) {
    return null;
  }
});

// Abre a pasta de dados no Explorer (botão "Abrir pasta" na Ajuda).
ipcMain.handle("disco:abrirPasta", () => {
  try {
    const p = DiscoStore.pastaBase();
    if (p) shell.openPath(p);
    return true;
  } catch (e) { return false; }
});

// ═══════════════════════════════════════════
//  IPC — lembretes
// ═══════════════════════════════════════════

ipcMain.handle("lembretes:sync", () => { verificarLembretes(); return true; });

// ── Janela de aviso (lembrete-aviso.html) ──
ipcMain.handle("aviso:fila", () => filaAvisos.slice());
// Adiar: avisa de novo daqui a N minutos (ou no horário pedido).
ipcMain.handle("aviso:adiar", (_e, chave, minutos, quando) => {
  chave = String(chave || "");
  if (!chave) return false;
  let ate = Number(quando) || 0;
  if (!(ate > Date.now())) ate = Date.now() + Math.max(1, Number(minutos) || 10) * 60000;
  const adiados = _lerAdiados();
  adiados[chave] = ate;
  _salvarAdiados(adiados);
  _tirarDaFila(chave);
  return true;
});
// Concluído (pela própria janela) ou dispensado: sai da fila.
ipcMain.handle("aviso:resolvido", (_e, chave) => { _tirarDaFila(String(chave || "")); return true; });
// Abrir: mostra o app com a ficha do lembrete.
ipcMain.handle("aviso:abrir", (_e, chave) => {
  chave = String(chave || "");
  const id = chave.split("@")[0];
  _abrirLembreteNoApp(id);
  _tirarDaFila(chave);
  return true;
});
// Fechar a janela (dispensa todos os da fila).
ipcMain.handle("aviso:fechar", () => {
  filaAvisos = [];
  dadosAvisos.clear();
  _salvarFila();
  _fecharJanelaAviso();
  return true;
});
// A janela mede o próprio conteúdo e pede a altura certa.
ipcMain.on("aviso:altura", (_e, altura) => { _posicionarAviso(Number(altura) || AVISO_ALTURA_INICIAL); });
ipcMain.handle("lembretes:getAutoStart", () => {
  try { return app.getLoginItemSettings().openAtLogin; } catch (e) { return false; }
});
ipcMain.handle("lembretes:setAutoStart", (_e, on) => {
  try { app.setLoginItemSettings({ openAtLogin: !!on }); return app.getLoginItemSettings().openAtLogin; }
  catch (e) { return false; }
});

// ═══════════════════════════════════════════

// ── Dica de "fixar na barra de tarefas" na PRIMEIRA execução ──
// O Windows (principalmente o 11 24H2) não permite fixar na barra de tarefas
// de forma programática — só o próprio usuário pode, com um clique. Então, na
// primeira vez que o app abre, mostramos uma dica simpática ensinando como
// fixar. Um arquivo-marca na pasta de dados garante que aparece uma vez só.
//
// A dica é uma janela do PRÓPRIO app (no visual e no tema dele), mostrada
// pela casca de abas (shell.html) — não mais a caixa de mensagem do
// Windows. A casca pergunta aqui se deve mostrá-la e avisa quando foi vista.
function _marcaDicaFixar() { return path.join(app.getPath("userData"), ".dica-fixar-mostrada"); }

ipcMain.handle("app:dicaFixar", () => {
  if (process.platform !== "win32") return false;
  try { return !fs.existsSync(_marcaDicaFixar()); } catch (e) { return false; }
});
ipcMain.handle("app:dicaFixarVista", () => {
  try { fs.writeFileSync(_marcaDicaFixar(), new Date().toISOString()); } catch (e) {}
  return true;
});

// Uma instância só: relançar foca a existente
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", mostrarJanela);

  app.whenReady().then(async () => {
    if (process.platform === "win32") app.setAppUserModelId("com.bapellgestorpro.app");
    // Menu de aplicação com os atalhos de edição padrão do Windows.
    // Antes usávamos setApplicationMenu(null), o que removia a barra File/Edit/
    // View — mas junto sumiam os atalhos Ctrl+C / Ctrl+V / Ctrl+X / Ctrl+A, que
    // no Electron vêm dos "roles" do menu Edit. Sem eles, copiar/colar falhava.
    // Aqui registramos só o menu Edição (com os roles nativos, que já trazem
    // recortar/copiar/colar/selecionar tudo em pt-BR do sistema) e escondemos a
    // barra: os atalhos continuam valendo, mas a barra não aparece.
    _instalarMenuEdicao();

    // Inicializa o armazenamento em disco (dados.json + pasta arquivos\) ANTES
    // de qualquer janela. É daqui que o preload vai ler os dados para popular a
    // página. Fica na pasta de dados do app (gravável, no HD/SSD da pessoa).
    DiscoStore.inicializar(app.getPath("userData"));

    // Serve os arquivos pesados via app://arquivo/<nome>. O app usa isso como
    // src das imagens em vez de base64 inline.
    protocol.handle("app", (request) => {
      try {
        const url = new URL(request.url);
        // app://arquivo/logo_abc.jpg  → host = "arquivo", pathname = "/logo_abc.jpg"
        const nome = decodeURIComponent(url.pathname.replace(/^\//, ""));
        const caminho = DiscoStore.caminhoArquivo(nome);
        if (caminho && fs.existsSync(caminho)) {
          const buf = fs.readFileSync(caminho);
          const ext = path.extname(caminho).toLowerCase();
          const mimes = {
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
            ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
            ".pdf": "application/pdf",
          };
          return new Response(buf, {
            headers: { "content-type": mimes[ext] || "application/octet-stream" },
          });
        }
        return new Response("", { status: 404 });
      } catch (e) {
        console.error("[protocol app://] erro:", e);
        return new Response("", { status: 500 });
      }
    });

    // Lê a placa-mãe UMA vez, aqui, de forma assíncrona. Depois disso o ID do
    // computador sai do cache em microssegundos.
    // Antes era execSync a CADA uso (boot, ativação, clique em notificação),
    // travando o processo principal por até 16s — o que fazia o "ID do
    // Computador" parecer vazio na tela de ativação.
    const idm = await MachineId.inicializar();
    console.log("[machine-id] ID lido de: " + idm.origem + " (" + idm.fontes.join(", ") + ")");

    criarTray();
    createWindow();

    // Na primeira execução, a casca de abas ensina a fixar na barra de
    // tarefas (ver "app:dicaFixar" acima).

    // Agendador de alertas: verifica a cada 30s
    setInterval(verificarLembretes, 30000);
    setTimeout(verificarLembretes, 5000);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else mostrarJanela();
    });
  });
}

app.on("before-quit", () => {
  app.isQuitting = true;
  // Garante que qualquer gravação pendente (em rajada) vá para o disco antes
  // de fechar — nada de lembrete ou cadastro perdido no último instante.
  try { DiscoStore.flush(); } catch (e) {}
});

// Com a bandeja, não encerra ao esconder a janela.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && app.isQuitting) app.quit();
});

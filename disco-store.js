// ══════════════════════════════════════════════════════════════
//  disco-store.js — Armazenamento em disco (processo principal)
//  Bapell Gestor Pro
//
//  Guarda TODOS os cadastros num único arquivo dados.json dentro de
//    AppData\Roaming\Bapell Gestor Pro\
//  e os arquivos pesados (logos, fotos, PDFs) na subpasta arquivos\.
//
//  Isto substitui o localStorage/IndexedDB do Chromium, que:
//    • tinha limite de ~5 MB (localStorage) e podia travar o salvamento;
//    • ficava escondido numa pasta de hash do Chromium, difícil de achar
//      e de fazer backup;
//    • podia ser apagado numa reinstalação/atualização do app.
//
//  Com este módulo, os dados ficam numa pasta visível do próprio programa,
//  no HD/SSD da pessoa — sem limite prático e fácil de copiar.
// ══════════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");

let _pastaBase = null; // AppData\Roaming\Bapell Gestor Pro
let _pastaArquivos = null; // .../arquivos
let _arquivoDados = null; // .../dados.json

// Cache em memória do dados.json (evita reler o disco a cada get).
let _cache = null;
let _saveAgendado = null;

// ── Inicialização ───────────────────────────────────────────────
// Recebe o caminho do userData (app.getPath("userData")).
function inicializar(userDataPath) {
  _pastaBase = userDataPath;
  _pastaArquivos = path.join(_pastaBase, "arquivos");
  _arquivoDados = path.join(_pastaBase, "dados.json");

  try {
    if (!fs.existsSync(_pastaBase)) fs.mkdirSync(_pastaBase, { recursive: true });
    if (!fs.existsSync(_pastaArquivos)) fs.mkdirSync(_pastaArquivos, { recursive: true });
  } catch (e) {
    console.error("[disco-store] falha ao criar pastas:", e);
  }

  _cache = _lerDadosDoDisco();
  return true;
}

function _lerDadosDoDisco() {
  try {
    if (fs.existsSync(_arquivoDados)) {
      const txt = fs.readFileSync(_arquivoDados, "utf8");
      const obj = JSON.parse(txt);
      if (obj && typeof obj === "object") return obj;
    }
  } catch (e) {
    console.error("[disco-store] dados.json ilegível, começando vazio:", e);
    // Preserva o arquivo corrompido para não perder nada, com um backup datado.
    try {
      if (fs.existsSync(_arquivoDados)) {
        fs.copyFileSync(_arquivoDados, _arquivoDados + ".corrompido-" + Date.now());
      }
    } catch (_) {}
  }
  return {};
}

// Grava o dados.json de forma ATÔMICA: escreve num temporário e renomeia.
// Assim, se faltar energia no meio, o arquivo antigo continua íntegro (não
// vira um JSON pela metade).
function _gravarDadosNoDisco() {
  if (!_arquivoDados) return false;
  try {
    const tmp = _arquivoDados + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(_cache), "utf8");
    fs.renameSync(tmp, _arquivoDados);
    return true;
  } catch (e) {
    console.error("[disco-store] falha ao gravar dados.json:", e);
    return false;
  }
}

// Agrupa gravações em rajada (várias chamadas setItem seguidas viram uma
// gravação só), mas garante que grava logo (120ms) para não perder dados.
function _agendarGravacao() {
  if (_saveAgendado) return;
  _saveAgendado = setTimeout(() => {
    _saveAgendado = null;
    _gravarDadosNoDisco();
  }, 120);
}

// Força a gravação imediata (usado ao fechar o app).
function flush() {
  if (_saveAgendado) { clearTimeout(_saveAgendado); _saveAgendado = null; }
  return _gravarDadosNoDisco();
}

// ── API de chave-valor (espelha o localStorage) ─────────────────
function getItem(chave) {
  if (!_cache) return null;
  return Object.prototype.hasOwnProperty.call(_cache, chave) ? _cache[chave] : null;
}

function setItem(chave, valor) {
  if (!_cache) _cache = {};
  _cache[String(chave)] = String(valor);
  _agendarGravacao();
  return true;
}

function removeItem(chave) {
  if (!_cache) return true;
  delete _cache[chave];
  _agendarGravacao();
  return true;
}

function clear() {
  _cache = {};
  _agendarGravacao();
  return true;
}

// Retorna todas as chaves/valores de uma vez (o preload usa para popular o
// localStorage da página no arranque).
function todos() {
  return _cache ? Object.assign({}, _cache) : {};
}

// ── API de arquivos pesados (logos, fotos, PDFs) ────────────────
// Guarda um arquivo a partir de um dataURL base64. Retorna o nome do arquivo
// gravado (que o app guarda no dados.json no lugar do base64 gigante).
function salvarArquivo(id, dataUrl) {
  if (!_pastaArquivos || !id) return null;
  try {
    const m = /^data:([^;]+);base64,(.*)$/s.exec(String(dataUrl));
    if (!m) return null;
    const mime = m[1];
    const b64 = m[2];
    const ext = _extDoMime(mime);
    const nome = _sanitizarNome(id) + ext;
    const caminho = path.join(_pastaArquivos, nome);
    fs.writeFileSync(caminho, Buffer.from(b64, "base64"));
    return nome;
  } catch (e) {
    console.error("[disco-store] falha ao salvar arquivo:", e);
    return null;
  }
}

// Lê um arquivo de volta como dataURL (para exibir no app).
function lerArquivo(nome) {
  if (!_pastaArquivos || !nome) return null;
  try {
    const caminho = path.join(_pastaArquivos, _sanitizarNome(nome, true));
    if (!fs.existsSync(caminho)) return null;
    const buf = fs.readFileSync(caminho);
    const mime = _mimeDaExt(path.extname(nome));
    return "data:" + mime + ";base64," + buf.toString("base64");
  } catch (e) {
    console.error("[disco-store] falha ao ler arquivo:", e);
    return null;
  }
}

function removerArquivo(nome) {
  if (!_pastaArquivos || !nome) return false;
  try {
    const caminho = path.join(_pastaArquivos, _sanitizarNome(nome, true));
    if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
    return true;
  } catch (e) {
    console.error("[disco-store] falha ao remover arquivo:", e);
    return false;
  }
}

// Caminho absoluto de um arquivo (para o protocolo app:// servir direto).
function caminhoArquivo(nome) {
  if (!_pastaArquivos || !nome) return null;
  return path.join(_pastaArquivos, _sanitizarNome(nome, true));
}

// ── Suporte a backup: listar e ler arquivos físicos em lote ─────
// Lista todos os arquivos da pasta "arquivos" (logos, fotos, PDFs, anexos).
// Retorna [{ nome, tamanho }] — sem conteúdo, para ser leve.
function listarArquivos() {
  if (!_pastaArquivos) return [];
  try {
    return fs.readdirSync(_pastaArquivos)
      .filter((nome) => {
        try { return fs.statSync(path.join(_pastaArquivos, nome)).isFile(); }
        catch (e) { return false; }
      })
      .map((nome) => {
        let tamanho = 0;
        try { tamanho = fs.statSync(path.join(_pastaArquivos, nome)).size; } catch (e) {}
        return { nome: nome, tamanho: tamanho };
      });
  } catch (e) {
    console.error("[disco-store] falha ao listar arquivos:", e);
    return [];
  }
}

// Lê um arquivo físico como base64 PURO (sem o prefixo data:), para
// empacotar no ZIP de backup sem inchar. Devolve { nome, mime, base64 } ou null.
function lerArquivoBinario(nome) {
  if (!_pastaArquivos || !nome) return null;
  try {
    const caminho = path.join(_pastaArquivos, _sanitizarNome(nome, true));
    if (!fs.existsSync(caminho)) return null;
    const buf = fs.readFileSync(caminho);
    return {
      nome: _sanitizarNome(nome, true),
      mime: _mimeDaExt(path.extname(nome)),
      base64: buf.toString("base64"),
    };
  } catch (e) {
    console.error("[disco-store] falha ao ler arquivo binário:", e);
    return null;
  }
}

// Grava um arquivo físico a partir de base64 PURO (usado na restauração do
// backup). Preserva o nome exato para não quebrar as referências dos produtos.
// Se já existir um arquivo com o mesmo nome, NÃO sobrescreve (evita perder
// dados atuais) e devolve o nome existente.
function gravarArquivoBinario(nome, base64) {
  if (!_pastaArquivos || !nome || base64 == null) return null;
  try {
    const nomeSan = _sanitizarNome(nome, true);
    const caminho = path.join(_pastaArquivos, nomeSan);
    if (fs.existsSync(caminho)) return nomeSan; // preserva o atual
    fs.writeFileSync(caminho, Buffer.from(base64, "base64"));
    return nomeSan;
  } catch (e) {
    console.error("[disco-store] falha ao gravar arquivo binário:", e);
    return null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────
// Impede path traversal: só permite o nome do arquivo, sem barras nem "..".
function _sanitizarNome(nome, comExtensao) {
  let n = String(nome).replace(/[\\/]/g, "").replace(/\.\./g, "");
  if (!comExtensao) n = n.replace(/[^a-zA-Z0-9_-]/g, "");
  else n = n.replace(/[^a-zA-Z0-9_.-]/g, "");
  return n;
}

function _extDoMime(mime) {
  const map = {
    "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png",
    "image/webp": ".webp", "image/gif": ".gif", "image/svg+xml": ".svg",
    "application/pdf": ".pdf", "text/xml": ".xml", "application/xml": ".xml",
  };
  return map[mime] || ".bin";
}

function _mimeDaExt(ext) {
  const map = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
    ".pdf": "application/pdf", ".xml": "application/xml",
  };
  return map[String(ext).toLowerCase()] || "application/octet-stream";
}

module.exports = {
  inicializar,
  flush,
  getItem, setItem, removeItem, clear, todos,
  salvarArquivo, lerArquivo, removerArquivo, caminhoArquivo,
  listarArquivos, lerArquivoBinario, gravarArquivoBinario,
  _pastaArquivos: () => _pastaArquivos,
};

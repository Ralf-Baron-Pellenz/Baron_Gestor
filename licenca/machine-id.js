// ═══════════════════════════════════════════════════════════════════
//  Bapell Gestor Pro — Identificação da Máquina
//
//  Lê um identificador estável do hardware (nº de série da placa-mãe +
//  UUID do sistema) e transforma num "ID do Computador".
//
//  Roda SOMENTE no processo principal do Electron (tem acesso ao Node).
//  Não contém segredos de assinatura.
//
//  ── COMO USAR ──────────────────────────────────────────────────────
//  Recomendado (rápido, não trava a janela):
//      await inicializar();      // uma vez, no boot
//      obterFingerprint();       // instantâneo, vem do cache
//
//  Também funciona SEM inicializar(): a primeira chamada a
//  obterFingerprint() faz a leitura de forma síncrona. É mais lenta
//  (bloqueia o processo principal por alguns segundos), mas NUNCA falha
//  por falta de inicialização. Este módulo não depende de ninguém
//  lembrar de chamar nada.
// ═══════════════════════════════════════════════════════════════════

"use strict";

const os = require("os");
const crypto = require("crypto");
const { exec, execSync } = require("child_process");

// ═══════════════════════════════════════════════════════════════════
//  ⚠️  ATENÇÃO — NÃO ALTERE A LINHA DO SALT ABAIXO.  ⚠️
//
//  O SALT entra no hash que gera o ID do Computador. Mudar UMA LETRA
//  faz TODAS as máquinas receberem um ID diferente — e TODAS as chaves
//  de licença já emitidas param de validar, sem recuperação possível
//  (o cliente cai na tela de ativação e a chave dele não funciona mais).
//
//  NÃO inclua este arquivo em localizar-e-substituir de nome de produto.
//  Só altere se a intenção for MESMO invalidar toda a base de licenças.
// ═══════════════════════════════════════════════════════════════════
const SALT = "BapellGestorPro::licenca::v1";

const TIMEOUT_MS = 8000;   // por chamada ao PowerShell
const TENTATIVAS = 2;      // protege contra falha transitória do WMI

// Valores que alguns fabricantes deixam em branco/placeholder.
// Se aceitos, várias máquinas do mesmo fabricante teriam o MESMO id
// e uma única chave ativaria todas elas.
const INVALIDOS = new Set([
  "", ".", "-", "0",
  "00000000-0000-0000-0000-000000000000",
  "ffffffff-ffff-ffff-ffff-ffffffffffff",
  "n/a", "na", "none", "null", "nil", "unknown", "invalid",
  "default string", "not specified", "not available", "not applicable",
  "to be filled by o.e.m.", "to be filled by oem",
  "system serial number", "system product name",
  "chassis serial number", "base board serial number",
  "oem", "x.x.x",
]);

function _ehValido(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  if (s === "" || s.length < 3) return false;
  if (INVALIDOS.has(s)) return false;
  if (/^0+$/.test(s)) return false;
  if (/^-+$/.test(s)) return false;
  return true;
}

const CMD_SERIAL = "(Get-CimInstance -Class Win32_BaseBoard).SerialNumber";
const CMD_UUID = "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID";

function _linhaDeComando(comando) {
  return `powershell -NoProfile -NonInteractive -Command "${comando}"`;
}

// ── PowerShell assíncrono (não bloqueia o processo principal) ──
function _ps(comando) {
  return new Promise((resolve) => {
    exec(
      _linhaDeComando(comando),
      { encoding: "utf8", timeout: TIMEOUT_MS, windowsHide: true },
      (err, stdout) => resolve(err ? "" : String(stdout || "").trim())
    );
  });
}

// ── PowerShell síncrono (só usado no caminho de compatibilidade) ──
function _psSync(comando) {
  try {
    return execSync(_linhaDeComando(comando), {
      encoding: "utf8",
      timeout: TIMEOUT_MS,
      windowsHide: true,
    }).trim();
  } catch (e) {
    return "";
  }
}

async function _psComRetry(comando) {
  for (let i = 0; i < TENTATIVAS; i++) {
    const r = await _ps(comando);
    if (_ehValido(r)) return r.trim();
  }
  return "";
}

function _psComRetrySync(comando) {
  for (let i = 0; i < TENTATIVAS; i++) {
    const r = _psSync(comando);
    if (_ehValido(r)) return r.trim();
  }
  return "";
}

// Junta as partes válidas na MESMA ordem, sempre — a ordem faz parte do hash.
function _montarPartes(serial, uuid) {
  const partes = [];
  const fontes = [];
  if (_ehValido(serial)) { partes.push("bb:" + serial); fontes.push("placa-mãe"); }
  if (_ehValido(uuid)) { partes.push("uuid:" + uuid); fontes.push("uuid"); }
  return { base: partes.join("|"), fontes };
}

// Fallback — usado quando o hardware não pode ser lido, e em macOS/Linux.
// ATENÇÃO: gera um ID DIFERENTE do de hardware. Se o cliente ativar com
// este e o WMI voltar a funcionar depois, o ID muda e a licença dele para
// de validar. Por isso a origem é registrada e exposta em `origem`.
function _fallbackGenerico() {
  const nics = os.networkInterfaces();
  let mac = "";
  for (const nome of Object.keys(nics)) {
    for (const ni of nics[nome] || []) {
      if (!ni.internal && ni.mac && ni.mac !== "00:00:00:00:00:00") { mac = ni.mac; break; }
    }
    if (mac) break;
  }
  return "host:" + os.hostname() + "|mac:" + mac;
}

function _hash(base) {
  return crypto.createHash("sha256").update(SALT + "::" + base).digest("hex");
}

// ── Cache: { fingerprint, origem, fontes } ──
// origem: "hardware" | "fallback" | "dev"
let _cache = null;

function _guardar(base, origem, fontes) {
  _cache = { fingerprint: _hash(base), origem, fontes };
  if (origem === "fallback") {
    console.warn(
      "[machine-id] Não foi possível ler a placa-mãe. Usando identificação " +
      "alternativa (nome do PC + MAC). O ID pode mudar se o WMI voltar a " +
      "funcionar — o que invalidaria a licença desta máquina."
    );
  }
  return _cache;
}

/**
 * Lê o hardware e calcula o fingerprint, sem bloquear o processo.
 * Chame UMA vez no boot, antes de criar a janela. Nunca lança.
 * @returns {Promise<{ok:boolean, origem:string, fontes:string[]}>}
 */
async function inicializar() {
  if (_cache) return _resumo();
  try {
    if (process.platform === "win32") {
      const [serial, uuid] = await Promise.all([
        _psComRetry(CMD_SERIAL),
        _psComRetry(CMD_UUID),
      ]);
      const { base, fontes } = _montarPartes(serial, uuid);
      if (base) _guardar(base, "hardware", fontes);
      else _guardar(_fallbackGenerico(), "fallback", ["host+mac"]);
    } else {
      _guardar(_fallbackGenerico(), "dev", ["host+mac"]);
    }
  } catch (e) {
    // Blindagem: nem o boot pode quebrar por causa disto.
    console.error("[machine-id] falha ao inicializar:", e);
    _guardar(_fallbackGenerico(), "fallback", ["host+mac"]);
  }
  return _resumo();
}

// Caminho de compatibilidade: usado se obterFingerprint() for chamado
// antes de inicializar(). Bloqueia, mas funciona.
function _inicializarSincrono() {
  try {
    if (process.platform === "win32") {
      const serial = _psComRetrySync(CMD_SERIAL);
      const uuid = _psComRetrySync(CMD_UUID);
      const { base, fontes } = _montarPartes(serial, uuid);
      if (base) return _guardar(base, "hardware", fontes);
      return _guardar(_fallbackGenerico(), "fallback", ["host+mac"]);
    }
    return _guardar(_fallbackGenerico(), "dev", ["host+mac"]);
  } catch (e) {
    console.error("[machine-id] falha na leitura síncrona:", e);
    return _guardar(_fallbackGenerico(), "fallback", ["host+mac"]);
  }
}

function _resumo() {
  return {
    ok: !!(_cache && _cache.fingerprint),
    origem: _cache ? _cache.origem : "nao-inicializado",
    fontes: _cache ? _cache.fontes : [],
  };
}

/** Já existe um fingerprint calculado? (não força o cálculo) */
function estaPronto() {
  return !!(_cache && _cache.fingerprint);
}

/** De onde veio o ID: "hardware" | "fallback" | "dev" | "nao-inicializado" */
function origem() {
  return _cache ? _cache.origem : "nao-inicializado";
}

/**
 * Fingerprint bruto (hex de 64 chars).
 * NUNCA lança: se inicializar() não rodou, faz a leitura síncrona aqui.
 */
function obterFingerprint() {
  if (!_cache) _inicializarSincrono();
  return _cache.fingerprint;
}

/**
 * ID do Computador exibido ao usuário: 16 hex → 4 blocos de 4.
 * Ex.: 7F4A-93B2-8C17-55E1
 */
function computerIdFormatado(fingerprintHex) {
  const s = (fingerprintHex || obterFingerprint()).slice(0, 16).toUpperCase();
  return s.replace(/(.{4})(?=.)/g, "$1-");
}

module.exports = {
  inicializar,
  estaPronto,
  origem,
  obterFingerprint,
  computerIdFormatado,
};

// ═══════════════════════════════════════════
//  Bapell Gestor Pro — utils.js
// ═══════════════════════════════════════════

"use strict";

// ── Escape de HTML (uma vez, para todo o arquivo) ──
// Impede que um nome de plataforma com < > & " quebre o HTML montado à mão
// (buildSidebar) ou injete marcação via toast.
function _escHtml(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PLATFORMS_CONFIG = [
  // Sem plataformas padrão: o app começa vazio e o usuário cadastra as suas.
  // As customizadas são carregadas do localStorage logo abaixo.
];

// Id fixo da loja padrão do sistema (item 4): a "Loja Física".
// É semeada automaticamente, pode ser editada, mas não pode ser ocultada
// nem excluída (as telas escondem esses botões para ela).
const LOJA_FISICA_ID = "loja_fisica";

// Carrega plataformas customizadas do localStorage para o array em memória.
function _loadCustomPlatforms() {
  // Recomeça do zero e repovoa — necessário para o recarregamento entre abas.
  PLATFORMS_CONFIG.length = 0;
  try {
    const saved = JSON.parse(localStorage.getItem("precifiq_custom_platforms")) || [];
    if (Array.isArray(saved)) {
      saved.forEach((p) => {
        if (p && p.id && !PLATFORMS_CONFIG.find((c) => c.id === p.id)) {
          PLATFORMS_CONFIG.push(p);
        }
      });
    }
  } catch (e) {}
  // Garante que a Loja Física sempre exista, mesmo em instalação nova.
  _garantirLojaFisica();
}

// Semeia a "Loja Física" se ela ainda não estiver na lista. Marca-a como
// protegida (não ocultável/excluível). A logo padrão vem de imagens/logo_loja.png,
// mas o usuário pode trocar por uma logoDataUrl ao editar a plataforma.
function _garantirLojaFisica() {
  if (PLATFORMS_CONFIG.find((p) => p.id === LOJA_FISICA_ID)) return;
  // Se o usuário editou a loja padrão antes (nome/logo), recupera do storage.
  let salva = null;
  try {
    const saved = JSON.parse(localStorage.getItem("precifiq_custom_platforms")) || [];
    if (Array.isArray(saved)) salva = saved.find((p) => p && p.id === LOJA_FISICA_ID) || null;
  } catch (e) {}
  PLATFORMS_CONFIG.unshift(salva || {
    id: LOJA_FISICA_ID,
    name: "Loja Física",
    custom: true,
    protegida: true, // não pode ser ocultada nem excluída
  });
}
_loadCustomPlatforms();

function getPlatformConfig(id) {
  return PLATFORMS_CONFIG.find((p) => p.id === id) || null;
}

function getPlatformLogoSrc(id) {
  const cfg = getPlatformConfig(id);
  if (!cfg) return "";
  // Plataformas customizadas guardam a imagem em base64 (logoDataUrl).
  if (cfg.logoDataUrl) return cfg.logoDataUrl;
  // Loja Física (item 4): sem logo customizada, usa o arquivo empacotado
  // imagens/logo_loja.png. Ao editar e escolher outra logo, o logoDataUrl
  // acima passa a valer e este caminho deixa de ser usado.
  if (cfg.id === LOJA_FISICA_ID) return "imagens/logo_loja.png";
  // Customizada SEM base64 (nenhuma logo escolhida, ou logo perdida): retorna
  // vazio para a tela usar o fallback de texto (iniciais do nome). NÃO tenta o
  // arquivo imagens/Logos/logo_<id>.png — esse arquivo nunca existe para
  // customizadas, e a tentativa gerava erro de <img> no console.
  if (cfg.custom) return "";
  // Plataforma padrão (não customizada): usa o arquivo empacotado no app.
  return `imagens/Logos/logo_${cfg.id}.${cfg.ext || "png"}`;
}

// Ajuda as telas a saber se uma plataforma é protegida (não ocultável/excluível).
function isPlatformProtegida(id) {
  if (id === LOJA_FISICA_ID) return true;
  const cfg = getPlatformConfig(id);
  return !!(cfg && cfg.protegida);
}

// ── Armazenamento de Produtos (IndexedDB + cache síncrono) ──────────────────
// A API pública (getProducts/saveProducts/etc.) é SÍNCRONA: lê de um cache em
// memória carregado no boot; as gravações vão para o IndexedDB em segundo
// plano (grande capacidade, ideal para imagens base64).

const LS_PREFIX = "precifiq_products_";
const IDB_NAME = "precifiq_db";
const IDB_STORE = "products"; // key: platformId → value: array de produtos
const IDB_VERSION = 1;

// Sino de sincronização entre abas. Como os produtos vivem no IndexedDB (e não
// no localStorage), o evento "storage" não dispara sozinho quando outra aba
// grava. Cada saveProducts bate este sino no localStorage; as OUTRAS abas
// ouvem via "storage" e recarregam do IndexedDB apenas a plataforma afetada.
const LS_SYNC_SINO = "precifiq_products_sync";

// Cache em memória: { platformId: [produtos...] }
let _productsCache = {};
let _idb = null;
let _idbReady = false;
let _abaId = String(Date.now()) + "_" + Math.random().toString(36).slice(2, 8);

// Abre (ou cria) o IndexedDB
function _openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
    // Outra aba pediu upgrade de versão e está esperando esta conexão fechar.
    req.onblocked = () => console.warn("IndexedDB bloqueado (outra aba tem versão anterior aberta)");
  });
}

/**
 * Grava um array de produtos de uma plataforma no IndexedDB.
 * Resolve só quando a transação REALMENTE completa.
 * @returns {Promise<boolean>} true se gravou, false se falhou
 */
function _idbPut(platformId, products) {
  return new Promise((resolve) => {
    if (!_idb) return resolve(false);
    try {
      const tx = _idb.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(products, platformId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        console.error("IndexedDB: transação falhou para", platformId, tx.error);
        resolve(false);
      };
      tx.onabort = () => {
        console.error("IndexedDB: transação abortada para", platformId, tx.error);
        resolve(false);
      };
    } catch (err) {
      console.error("Erro ao gravar no IndexedDB:", err);
      resolve(false);
    }
  });
}

/** Recarrega UMA plataforma do IndexedDB para o cache (uso: sync entre abas) */
function _idbReloadOne(platformId) {
  return new Promise((resolve) => {
    if (!_idb) return resolve();
    try {
      const tx = _idb.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(platformId);
      req.onsuccess = () => {
        const valor = req.result;
        if (Array.isArray(valor)) _productsCache[platformId] = valor;
        else delete _productsCache[platformId];
        resolve();
      };
      req.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

/**
 * Carrega TODO o conteúdo do IndexedDB para o cache em memória.
 * Usa openCursor (a spec não garante ordem pareada entre getAllKeys/getAll).
 */
function _idbLoadAll() {
  return new Promise((resolve) => {
    if (!_idb) return resolve();
    try {
      const tx = _idb.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const valor = cursor.value;
          _productsCache[cursor.key] = Array.isArray(valor) ? valor : [];
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => { console.error("Erro ao carregar do IndexedDB:", tx.error); resolve(); };
      tx.onabort = () => resolve();
    } catch (e) {
      console.error("Erro ao abrir transação de leitura:", e);
      resolve();
    }
  });
}

/**
 * Migra dados antigos do localStorage para o IndexedDB (uma única vez).
 * O localStorage só é apagado DEPOIS que a gravação no IndexedDB confirma.
 */
async function _migrarLocalStorage() {
  const candidatas = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(LS_PREFIX)) {
      const platformId = key.slice(LS_PREFIX.length);
      try {
        const produtos = JSON.parse(localStorage.getItem(key)) || [];
        if (!Array.isArray(produtos)) continue;
        candidatas.push({ key, platformId, produtos });
      } catch {
        console.warn("Dados corrompidos em", key, "— mantidos no localStorage");
      }
    }
  }

  for (const { key, platformId, produtos } of candidatas) {
    // Se o IndexedDB já tem dados dessa plataforma, MESCLA por id em vez de
    // descartar o localStorage: um produto que só exista no localStorage
    // (ex.: migração interrompida antes) seria perdido no "continue" anterior.
    if (_productsCache[platformId] && _productsCache[platformId].length > 0) {
      const existentes = _productsCache[platformId];
      const idsExistentes = new Set(existentes.map((p) => p && p.id));
      let mudou = false;
      produtos.forEach((p) => {
        if (p && !idsExistentes.has(p.id)) { existentes.push(p); mudou = true; }
      });
      if (mudou) {
        const ok = await _idbPut(platformId, existentes);
        if (ok) { try { localStorage.removeItem(key); } catch {} }
      } else {
        try { localStorage.removeItem(key); } catch {}
      }
      continue;
    }

    const gravou = await _idbPut(platformId, produtos);
    if (gravou) {
      _productsCache[platformId] = produtos;
      try { localStorage.removeItem(key); } catch {}
    } else {
      _productsCache[platformId] = produtos;
      console.error("Migração falhou para", platformId, "— dados preservados no localStorage");
    }
  }
}

// Inicialização: abre o IDB, carrega o cache e migra o localStorage.
let _storageInitPromise = null;
function initStorage() {
  if (_storageInitPromise) return _storageInitPromise;
  _storageInitPromise = (async () => {
    try {
      _idb = await _openIDB();
      await _idbLoadAll();
      await _migrarLocalStorage();
      _idbReady = true;
    } catch (err) {
      console.error("IndexedDB indisponível, usando fallback localStorage:", err);
      _idbReady = false;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LS_PREFIX)) {
          const pid = key.slice(LS_PREFIX.length);
          try { _productsCache[pid] = JSON.parse(localStorage.getItem(key)) || []; } catch {}
        }
      }
    }
  })();
  return _storageInitPromise;
}
initStorage();

// ── Sincronização entre abas ──
// Bate o sino: avisa as outras abas que uma plataforma mudou.
function _avisarOutrasAbas(platformId) {
  try {
    localStorage.setItem(LS_SYNC_SINO, JSON.stringify({
      aba: _abaId, pid: platformId, t: Date.now(),
    }));
  } catch (e) {}
}

// Ouve o sino das outras abas (o evento "storage" só dispara em OUTRAS abas).
window.addEventListener("storage", function (e) {
  if (e.key === LS_SYNC_SINO && e.newValue) {
    let info = null;
    try { info = JSON.parse(e.newValue); } catch (_) { return; }
    if (!info || info.aba === _abaId) return; // ignora o próprio eco
    // Recarrega do IndexedDB só a plataforma que mudou e redesenha, se a tela quiser.
    _idbReloadOne(info.pid).then(() => {
      if (typeof window.onProdutosAtualizados === "function") {
        try { window.onProdutosAtualizados(info.pid); } catch (_) {}
      }
    });
  }
  // Plataformas criadas/renomeadas/excluídas em outra aba: repovoa a config.
  if (e.key === "precifiq_custom_platforms" || e.key === "precifiq_deleted_platforms" || e.key === "precifiq_hidden_platforms") {
    _loadCustomPlatforms();
  }
});

// ── API pública (síncrona, lê do cache) ──
/** Retorna os produtos de uma plataforma (CÓPIA PROFUNDA, para não mutar o cache). */
function getProducts(platformId) {
  const lista = _productsCache[platformId];
  if (!Array.isArray(lista)) return [];
  try {
    return JSON.parse(JSON.stringify(lista));
  } catch (e) {
    console.error("Falha ao copiar produtos de", platformId, e);
    return [];
  }
}

/**
 * Versão de LEITURA para telas que só filtram/ordenam/exibem (nunca modificam
 * o produto), como a lista da plataforma. Faz uma cópia RASA de cada produto:
 * protege o cache contra reordenação/filtro (a tela recebe um array novo), mas
 * COMPARTILHA a referência dos campos — inclusive o `image` (base64), que não é
 * clonado. Isso elimina o deep-copy que levava ~238ms com 200 produtos, já que
 * clonar megabytes de base64 só para montar HTML era desperdício.
 * NÃO use para editar o produto: as alterações vazariam para o cache.
 */
function getProductsForReading(platformId) {
  const lista = _productsCache[platformId];
  if (!Array.isArray(lista)) return [];
  // Cópia rasa: novo array + novo objeto por produto, mas os valores (incluindo
  // o base64 de image) são a mesma referência. O render só lê, então é seguro.
  return lista.map((p) => (p && typeof p === "object" ? Object.assign({}, p) : p));
}

/** Conta os produtos SEM copiar (evita clonar MBs de base64 só para ler .length). */
function countProducts(platformId) {
  const lista = _productsCache[platformId];
  return Array.isArray(lista) ? lista.length : 0;
}

/** Conta os kits de todos os produtos de uma plataforma, sem copiar. */
function countKits(platformId) {
  const lista = _productsCache[platformId];
  if (!Array.isArray(lista)) return 0;
  return lista.reduce((acc, p) => acc + (Array.isArray(p && p.kits) ? p.kits.length : 0), 0);
}

/**
 * Gravações no IndexedDB ainda em andamento.
 *
 * O cache muda na hora, mas a gravação no disco termina depois. Quem
 * sai da tela logo após salvar (o Salvar do produto volta para a lista)
 * espera por elas com aguardarGravacoes(): uma gravação pendente pode
 * ser cancelada quando a página é descarregada — e, depois de salvar um
 * produto, gravam-se também os compostos e os outros com o mesmo SKU.
 */
var _gravacoesPendentes = new Set();
function _registrarGravacao(promessa) {
  if (!_gravacoesPendentes || !promessa || typeof promessa.then !== "function") return promessa;
  _gravacoesPendentes.add(promessa);
  const tirar = () => { _gravacoesPendentes.delete(promessa); };
  promessa.then(tirar, tirar);
  return promessa;
}

/**
 * Espera as gravações em andamento terminarem (no máximo `limiteMs`,
 * quando informado). Nunca falha: uma gravação com erro já avisou.
 * @returns {Promise<void>}
 */
function aguardarGravacoes(limiteMs) {
  const lista = _gravacoesPendentes ? Array.from(_gravacoesPendentes) : [];
  const todas = Promise.all(lista.map((p) => Promise.resolve(p).catch(() => false))).then(() => undefined);
  if (!limiteMs) return todas;
  return Promise.race([todas, new Promise((r) => setTimeout(r, limiteMs))]);
}

/**
 * Persiste os produtos de uma plataforma.
 * Guarda uma CÓPIA no cache (simétrico com getProducts): se o chamador
 * continuar mexendo no array depois de salvar, o cache não é afetado.
 * @returns {Promise<boolean>} true se persistiu
 */
function saveProducts(platformId, products) {
  const lista = Array.isArray(products) ? products : [];

  // Cópia defensiva: sem isto, o array do chamador e o cache ficam sendo o
  // MESMO objeto — mutação externa alteraria o cache sem passar por aqui.
  let copia;
  try { copia = JSON.parse(JSON.stringify(lista)); }
  catch (e) { copia = lista; }
  _productsCache[platformId] = copia;

  const _avisarFalha = (motivo) => {
    console.error("Falha ao salvar produtos de", platformId, motivo);
    if (typeof PrecifiqErros !== "undefined") {
      PrecifiqErros.registrar("Falha ao salvar produtos: " + platformId, String(motivo));
    }
    if (typeof showToast === "function") {
      showToast(
        "ATENÇÃO: não foi possível salvar no disco. Faça um backup e verifique o espaço livre.",
        "error", 8000
      );
    }
    return false;
  };

  if (_idbReady) {
    return _registrarGravacao(_idbPut(platformId, copia).then((ok) => {
      if (ok) { _avisarOutrasAbas(platformId); return true; }
      return _avisarFalha("IndexedDB recusou a gravação");
    }));
  }

  // IDB ainda não abriu: localStorage como rede de segurança
  try {
    localStorage.setItem(LS_PREFIX + platformId, JSON.stringify(copia));
    initStorage().then(() => { if (_idbReady) _idbPut(platformId, copia).then(() => _avisarOutrasAbas(platformId)); });
    return Promise.resolve(true);
  } catch (err) {
    return _registrarGravacao(initStorage()
      .then(() => (_idbReady ? _idbPut(platformId, copia) : false))
      .then((ok) => { if (ok) { _avisarOutrasAbas(platformId); return true; } return _avisarFalha(err); }));
  }
}

function getProductById(platformId, productId) {
  return getProducts(platformId).find((p) => p.id === productId) || null;
}

function upsertProduct(platformId, product) {
  const products = getProducts(platformId);
  const idx = products.findIndex((p) => p.id === product.id);
  if (idx >= 0) products[idx] = product;
  else products.push(product);
  return saveProducts(platformId, products);
}

function deleteProduct(platformId, productId) {
  return saveProducts(platformId, getProducts(platformId).filter((p) => p.id !== productId));
}

// Remove TODOS os produtos de uma plataforma, e as imagens deles do ImageStore.
function deletePlatformProducts(platformId) {
  // Antes de esquecer os produtos, coleta os ids de imagem para não deixar
  // órfãos ocupando espaço no ImageStore para sempre.
  const idsImagens = [];
  const lista = _productsCache[platformId];
  if (Array.isArray(lista)) {
    lista.forEach((p) => {
      if (p && Array.isArray(p._imageIds)) idsImagens.push.apply(idsImagens, p._imageIds);
      if (p && Array.isArray(p.kits)) {
        p.kits.forEach((k) => { if (k && Array.isArray(k._imageIds)) idsImagens.push.apply(idsImagens, k._imageIds); });
      }
    });
  }
  // O ImageStore só existe em algumas telas — remove apenas se disponível.
  if (idsImagens.length && typeof ImageStore !== "undefined" && ImageStore) {
    // removeMany faz tudo numa transação só; cai para remove() individual se
    // uma versão antiga do ImageStore não tiver o método.
    if (typeof ImageStore.removeMany === "function") {
      try { ImageStore.removeMany(idsImagens); } catch (_) {}
    } else if (typeof ImageStore.remove === "function") {
      idsImagens.forEach((imgId) => { try { ImageStore.remove(imgId); } catch (_) {} });
    }
  }

  delete _productsCache[platformId];
  try { localStorage.removeItem(LS_PREFIX + platformId); } catch {}

  return new Promise((resolve) => {
    if (!_idb) { _avisarOutrasAbas(platformId); return resolve(true); }
    try {
      const tx = _idb.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(platformId);
      tx.oncomplete = () => { _avisarOutrasAbas(platformId); resolve(true); };
      tx.onerror = () => { console.error("Erro ao excluir plataforma do IDB:", tx.error); resolve(false); };
      tx.onabort = () => resolve(false);
    } catch (err) {
      console.error("Erro ao excluir plataforma do IDB:", err);
      resolve(false);
    }
  });
}

// ID curto e único. 12 chars aleatórios (~4,7 sextilhões) + tempo, para
// evitar colisão mesmo criando muitos itens no mesmo milissegundo. Usa
// crypto quando disponível.
function generateId() {
  let aleat = "";
  try {
    if (window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint8Array(9);
      window.crypto.getRandomValues(arr);
      aleat = Array.from(arr, (b) => b.toString(36)).join("").slice(0, 12);
    }
  } catch (e) {}
  if (!aleat) aleat = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  return Date.now().toString(36) + "_" + aleat;
}

function getParam(key) {
  const qs = new URLSearchParams(window.location.search).get(key);
  if (qs !== null) return qs;
  const hash = new URLSearchParams(window.location.hash.replace(/^#\??/, "")).get(key);
  if (hash !== null) return hash;
  return null;
}

function formatBRL(value) {
  const n = parseFloat(value);
  if (!isFinite(n)) return "R$ 0,00"; // trata NaN, Infinity e -Infinity
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function showToast(message, type = "default", duration = 3000) {
  let container = document.getElementById("toastContainer");
  // Telas que não declaram o <div class="toast-container"> no HTML (o dashboard
  // e a ativação, por exemplo) perdiam TODOS os avisos em silêncio — inclusive
  // mensagens de erro, como "Informe o nome da plataforma". Em vez de desistir,
  // cria o container na hora (uma única vez por tela).
  if (!container) {
    if (!document.body) return; // página ainda sem body: nada a fazer
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const icons = { success: "✓", error: "✕", warning: "⚠", default: "ℹ" };
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  // Ícone via innerHTML (constante nossa), mensagem via textContent (dado
  // externo) — assim uma mensagem com < > não injeta marcação.
  const ico = document.createElement("span");
  ico.textContent = icons[type] || "ℹ";
  toast.appendChild(ico);
  toast.appendChild(document.createTextNode(" " + String(message == null ? "" : message)));
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

function setDateHeader(elId = "currentDate") {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

// Detecção de tela: em vez de inferir pela existência de window.goBack (frágil,
// some se alguém renomear a função), a página pode declarar explicitamente
// window.__telaProduto = true. Mantém o goBack como reserva de compatibilidade.
function _ehTelaProduto() {
  if (typeof window.__telaProduto === "boolean") return window.__telaProduto;
  return typeof window.goBack === "function";
}

function buildSidebar(currentPlatformId) {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  let hiddenPlatforms = [];
  try { hiddenPlatforms = JSON.parse(localStorage.getItem("precifiq_hidden_platforms")) || []; } catch (e) {}
  if (!Array.isArray(hiddenPlatforms)) hiddenPlatforms = [];

  let deletedPlatforms = [];
  try {
    deletedPlatforms = JSON.parse(localStorage.getItem("precifiq_deleted_platforms")) || [];
    if (!Array.isArray(deletedPlatforms)) deletedPlatforms = [];
  } catch (e) {}

  const ehTelaProduto = _ehTelaProduto();
  const backAction = ehTelaProduto ? "goBack()" : "window.location.href='index.html'";
  const backLabel = "Voltar";
  // O destino do "Voltar" em forma de endereço. O goBack() da tela de
  // produto não diz para onde vai; com o data-href, o menu lateral sabe o
  // destino para abrir em nova aba (botão direito, botão do meio ou
  // Ctrl+Clique). O clique normal continua chamando o goBack().
  const backHref = ehTelaProduto
    ? "plataforma.html?p=" + encodeURIComponent(currentPlatformId || "")
    : "index.html";

  const colapsado = localStorage.getItem("precifiq_sidebar_colapsada") === "1";
  sidebar.classList.toggle("sidebar-colapsada", colapsado);
  document.body.classList.toggle("sidebar-colapsada-body", colapsado);

  const setaSvg = `<svg class="sidebar-toggle-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
  const voltarSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`;
  const ajudaSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
  const ordenarSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
  const addSecaoSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
  const boxEstreita = "margin-left:auto; margin-right:auto;";

  let html = `
    <div class="sidebar-section sidebar-voltar-sep">
      <button class="sidebar-item-btn" onclick="${backAction}" data-href="${_escHtml(backHref)}" title="${backLabel}" style="${boxEstreita}">
        <span class="sidebar-btn-icon">${voltarSvg}</span>
        <span class="sidebar-label-txt">${backLabel}</span>
      </button>
    </div>
  `;

  if (ehTelaProduto) {
    // "Adicionar Seção" e "Ordenar Posição" num grupo compacto (style.css,
    // .sidebar-acoes-produto): menos espaço em volta e entre os dois.
    html += `
      <div class="sidebar-section sidebar-acoes-produto">
        <button type="button" class="sidebar-item-btn" id="btnAddSecao" title="Adicionar Seção" style="${boxEstreita}">
          <span class="sidebar-btn-icon">${addSecaoSvg}</span>
          <span class="sidebar-label-txt">Adicionar Seção</span>
        </button>
        <button type="button" class="sidebar-item-btn" id="btnOrdenarSecoes" title="Ordenar Posição" style="${boxEstreita}">
          <span class="sidebar-btn-icon">${ordenarSvg}</span>
          <span class="sidebar-label-txt">Ordenar Posição</span>
        </button>
      </div>
    `;
  }

  html += `
    <div class="sidebar-section">
      <div class="sidebar-title sidebar-label-txt" style="font-size:10px; font-weight:700; color:var(--clr-text-3); margin-bottom:8px;">PLATAFORMAS</div>
  `;

  PLATFORMS_CONFIG.forEach((platformObj) => {
    const platform = platformObj.id;
    const displayName = platformObj.name;
    if (hiddenPlatforms.includes(platform)) return;
    if (deletedPlatforms.includes(platform)) return;

    const isActive = platform === currentPlatformId;
    const activeClass = isActive ? "active" : "";
    const logoSrc = (typeof getPlatformLogoSrc === "function")
      ? getPlatformLogoSrc(platform)
      : `imagens/Logos/logo_${platform}.png`;

    // Tudo que vem do cadastro (nome, id, logo) é escapado: um nome com
    // aspas ou < > deixaria de ser apenas texto no HTML montado à mão.
    const nomeSeg = _escHtml(displayName);
    const idSeg = _escHtml(platform);
    const logoSeg = _escHtml(logoSrc);
    const iniciais = _escHtml(String(displayName || "").substring(0, 2).toUpperCase());

    html += `
      <a href="plataforma.html?p=${idSeg}" class="sidebar-item ${activeClass}" title="${nomeSeg}">
        <div class="sidebar-logo" style="border:1px solid var(--clr-border); overflow:hidden;">
          <img src="${logoSeg}"
               alt="${nomeSeg}"
               style="width:100%; height:100%; object-fit:cover; display:block;"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
          <span class="sidebar-fallback" style="display:none">${iniciais}</span>
        </div>
        <span class="sidebar-name sidebar-label-txt">${nomeSeg}</span>
      </a>
    `;
  });

  html += `</div>`;

  html += `
    <div class="sidebar-footer-index">
      <a href="ajuda.html" class="sidebar-item-btn" title="Central de Ajuda">
        <span class="sidebar-btn-icon">${ajudaSvg}</span>
        <span class="sidebar-label-txt">Ajuda</span>
      </a>
    </div>
  `;

  html += `
    <div class="sidebar-toggle-footer">
      <button class="sidebar-toggle-btn" onclick="toggleSidebar()" title="Abrir/Fechar menu" style="${boxEstreita}">
        ${setaSvg}
        <span class="sidebar-label-txt">&nbsp;Recolher menu</span>
      </button>
    </div>
  `;

  sidebar.innerHTML = html;
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  const colapsada = sidebar.classList.toggle("sidebar-colapsada");
  document.body.classList.toggle("sidebar-colapsada-body", colapsada);
  localStorage.setItem("precifiq_sidebar_colapsada", colapsada ? "1" : "0");
}

/* ═══════════════════════════════════════════
   FUNÇÕES PARA AÇÕES EM MASSA
   ═══════════════════════════════════════════ */

function getAllPlatformIds() {
  let deleted = [];
  try {
    deleted = JSON.parse(localStorage.getItem("precifiq_deleted_platforms")) || [];
    if (!Array.isArray(deleted)) deleted = [];
  } catch (e) { deleted = []; }
  return PLATFORMS_CONFIG.map((p) => p.id).filter((id) => !deleted.includes(id));
}

function findProductsBySku(sku) {
  const results = [];
  const searchSku = (sku || "").trim().toUpperCase();
  if (!searchSku) return results;
  getAllPlatformIds().forEach((platformId) => {
    const products = getProducts(platformId);
    products.forEach((product) => {
      if (product && (product.sku || "").trim().toUpperCase() === searchSku) {
        results.push({ platformId, product });
      }
    });
  });
  return results;
}

/* ═══════════════════════════════════════════
   RECÁLCULO DE UM PRODUTO SALVO
   Fora da ficha do produto (Ações em Massa, produtos compostos): o
   produto é recalculado pelos valores GRAVADOS, com o mesmo motor da
   ficha (calculadora.js) — unidade, kits e os Preços Extras que estão
   no modo de margem.
   ═══════════════════════════════════════════ */

/** Os inputs do motor a partir de um produto gravado. */
function _inputsDoProdutoSalvo(p) {
  function soma(categoria, tipo) {
    if (!Array.isArray(p.camposPersonalizados)) return 0;
    return p.camposPersonalizados
      .filter((c) => c && (c.categoria || 'venda') === categoria && (c.tipo || 'RS') === tipo)
      .reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
  }
  function pctPorBase(base) {
    if (!Array.isArray(p.camposPersonalizados)) return [];
    return p.camposPersonalizados
      .filter((c) => c && (c.categoria || 'venda') === 'custo' && c.tipo === 'PCT' && (c.base || 'custoTotal') === base)
      .map((c) => Number(c.valor) || 0);
  }
  return {
    custo:        Number(p.custo) || 0,
    embalagem:    Number(p.embalagem) || 0,
    etiqueta:     Number(p.etiqueta) || 0,
    fretePago:    Number(p.frete) || 0,
    // Impostos sobre o custo. Sem estas quatro linhas os valores seriam
    // gravados no produto, mas o recálculo feito aqui os ignoraria — o
    // preço final sairia como se todos fossem zero.
    ipiPct:       Number(p.ipi) || 0,
    difalPct:     Number(p.difal) || 0,
    stPct:        Number(p.st) || 0,
    aliquotaPct:  Number(p.aliquota) || 0,
    freteProduto: Number(p.freteProduto) || 0,
    taxaFixa:     Number(p.taxaFixa) || 0,
    impostoNF:    Number(p.impostoNF) || 0,
    taxa:         Number(p.taxa) || 0,
    margem:       Number(p.margem) || 0,
    margemTipo:   p.margemTipo || 'pct',
    extraCustoRS:  soma('custo', 'RS'),
    extraCustoPCT: 0,
    extraVendaRS:  soma('venda', 'RS'),
    extraVendaPCT: soma('venda', 'PCT'),
    custoPctSobreCustoTotal: pctPorBase('custoTotal'),
    custoPctSobrePrecoCusto: pctPorBase('precoCusto'),
  };
}

/** Os campos personalizados de um kit gravado: { extraRS, extraPCT }. */
function _extrasDoKitSalvo(kit) {
  const lista = Array.isArray(kit && kit.camposPersonalizados) ? kit.camposPersonalizados : [];
  return {
    extraRS: lista.filter((c) => c && (c.tipo || 'RS') === 'RS').reduce((a, c) => a + (Number(c.valor) || 0), 0),
    extraPCT: lista.filter((c) => c && c.tipo === 'PCT').reduce((a, c) => a + (Number(c.valor) || 0), 0),
  };
}

/** A plataforma é Mercado Livre? (a mesma regra da ficha) */
function _plataformaEhML(platformId) {
  if (typeof ehMercadoLivre !== 'function') return false;
  const cfg = typeof getPlatformConfig === 'function' ? getPlatformConfig(platformId) : null;
  return !!ehMercadoLivre(platformId, cfg && cfg.name);
}

/**
 * Preços Extras no modo de margem (Margem % ou Margem R$): o preço de
 * cada nível é refeito com os valores atuais do produto — no Mercado
 * Livre, o do Premium e o do Clássico, cada um com a sua comissão.
 * Os níveis no modo Preço (digitado) não mudam.
 *
 * Mesma conta da ficha: na unidade, calcularUnidade; no kit,
 * calcularKit — e a Margem R$ do kit é o lucro do kit inteiro.
 */
function _precosExtrasPelaMargem(alvo, inputs, ehML, kit) {
  if (!alvo || typeof calcularUnidade !== 'function') return;
  const qty = kit ? Math.max(1, parseInt(alvo.qty, 10) || 1) : 1;
  ['precoMinimo', 'precoIdeal', 'precoMaximo'].forEach((campo) => {
    const modo = alvo[campo + 'Modo'];
    if (modo !== 'pct' && modo !== 'rs') return;
    const bruto = alvo[campo + 'Margem'];
    const m = (bruto === null || bruto === undefined || bruto === '') ? null : Number(bruto);
    function preco(taxa) {
      if (m === null || !Number.isFinite(m)) return 0;
      const i = Object.assign({}, inputs, { margemTipo: modo === 'pct' ? 'pct' : 'fixed' });
      if (taxa !== null) i.taxa = Number(taxa) || 0;
      i.margem = (kit && modo === 'rs') ? m / qty : m;
      const r = kit
        ? calcularKit(i, qty, Number(alvo.frete) || 0, _extrasDoKitSalvo(alvo))
        : calcularUnidade(i);
      return r && !r.inviavel ? parseFloat((r.precoVenda || 0).toFixed(2)) : 0;
    }
    if (ehML) {
      alvo[campo] = preco(Number(inputs.__taxaPremium) || 0);
      alvo[campo + 'Classico'] = preco(Number(inputs.__taxaClassico) || 0);
    } else {
      alvo[campo] = preco(null);
    }
  });
}

/**
 * Recalcula um produto gravado: preço final, custo, lucro e margem da
 * unidade, cada kit e os Preços Extras que estão na margem. Devolve
 * quantos kits foram recalculados.
 */
function recalcularProdutoSalvo(p, ehML) {
  if (!p || typeof calcularUnidade !== 'function') return 0;
  const inputs = _inputsDoProdutoSalvo(p);
  const unit = calcularUnidade(inputs);
  p.finalPrice = parseFloat((unit.precoVenda || 0).toFixed(2));
  p.custo_calculado = parseFloat((unit.custoBase || 0).toFixed(2));
  p.lucro = parseFloat((unit.lucro || 0).toFixed(2));
  p.margemReal = parseFloat((unit.margemReal || 0).toFixed(2));

  // No Mercado Livre os Preços Extras usam a comissão de cada modalidade.
  const inputsPx = Object.assign({}, inputs, {
    __taxaPremium: Number(p.mlTaxaPremium) || 0,
    __taxaClassico: Number(p.mlTaxaClassico) || 0,
  });
  try { _precosExtrasPelaMargem(p, inputsPx, !!ehML, false); }
  catch (e) { console.error('[Preços Extras] recálculo do produto', e); }

  let kits = 0;
  if (Array.isArray(p.kits) && typeof calcularKit === 'function') {
    p.kits.forEach((kit) => {
      if (!kit || typeof kit !== 'object') return;
      const qty = parseInt(kit.qty, 10) || 1;
      const kitFrete = Number(kit.frete) || 0;
      const rk = calcularKit(inputs, qty, kitFrete, _extrasDoKitSalvo(kit));
      kit.price = parseFloat((rk.precoVenda || 0).toFixed(2));
      kit.custo = parseFloat((rk.custoBase || 0).toFixed(2));
      kit.lucro = parseFloat((rk.lucro || 0).toFixed(2));
      kit.margemReal = parseFloat((rk.margemReal || 0).toFixed(2));
      try { _precosExtrasPelaMargem(kit, inputsPx, !!ehML, true); }
      catch (e) { console.error('[Preços Extras] recálculo do kit', e); }
      kits++;
    });
  }
  return kits;
}

/**
 * PRODUTOS COMPOSTOS: depois que um produto muda, atualiza os produtos
 * compostos DA MESMA PLATAFORMA que o usam como item.
 *
 * Um composto guarda uma cópia de cada item (custoUnitario, nome, SKU,
 * imagem). Para cada composto que usa o produto:
 *   · o item recebe o custo, o nome, o SKU e a imagem atuais;
 *   · o custo do composto é refeito (soma de custo × quantidade);
 *   · o composto é recalculado — preço final, kits e Preços Extras na
 *     margem (recalcularProdutoSalvo);
 *   · e, se o custo dele mudou, quem usa ESTE composto como item é
 *     atualizado em seguida (composto dentro de composto), sem repetir
 *     nenhum (um ciclo não trava).
 *
 * O item é reconhecido pelo id do produto (prodId). Itens antigos, sem
 * id ou com o id de um produto que não existe mais, pelo SKU.
 *
 * @param {string} platformId  plataforma do produto que mudou
 * @param {string} sku         SKU do produto que mudou
 * @param {string} [prodId]    id do produto que mudou
 * @returns {{atualizados:number, nomes:string[], ids:Array}}
 */
function propagarDependencias(platformId, sku, prodId) {
  const res = { atualizados: 0, nomes: [], ids: [] };
  let produtos;
  try { produtos = getProducts(platformId) || []; }
  catch (e) { console.error('[Compostos] falha ao ler a plataforma', platformId, e); return res; }
  if (!Array.isArray(produtos) || !produtos.length) return res;

  const r = _propagarDependenciasNaLista(produtos, platformId, sku, prodId);
  if (!r.atualizados) return res;
  try { saveProducts(platformId, produtos); }
  catch (e) {
    console.error('[Compostos] falha ao salvar a plataforma', platformId, e);
    return res;
  }
  res.atualizados = r.atualizados;
  res.nomes = r.nomes;
  res.ids = r.ids;
  return res;
}

/**
 * O trabalho de propagarDependencias numa lista JÁ CARREGADA, sem ler nem
 * gravar: muda os compostos dentro de `produtos` e devolve quem mudou
 * (alterados). Quem chama grava a lista. É o que deixa as Ações em Massa
 * fazerem tudo de uma plataforma numa leitura e numa gravação só.
 */
function _propagarDependenciasNaLista(produtos, platformId, sku, prodId) {
  const res = { atualizados: 0, nomes: [], ids: [], alterados: [] };
  if (!Array.isArray(produtos) || !produtos.length) return res;

  const norm = (t) => String(t || '').trim().toUpperCase();
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const porId = new Map();
  produtos.forEach((p) => { if (p && p.id !== undefined && p.id !== null) porId.set(String(p.id), p); });
  const ehML = _plataformaEhML(platformId);

  let origem0 = prodId !== undefined && prodId !== null ? porId.get(String(prodId)) : null;
  if (!origem0 && norm(sku)) origem0 = produtos.find((p) => p && norm(p.sku) === norm(sku)) || null;
  if (!origem0) return res;

  const alterados = [];
  const fila = [origem0];
  const vistos = new Set();
  while (fila.length) {
    const origem = fila.shift();
    const chave = String(origem.id);
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    produtos.forEach((c) => {
      if (!c || c === origem || !Array.isArray(c.componentes) || !c.componentes.length) return;
      let mudou = false;
      c.componentes.forEach((item) => {
        if (!item) return;
        const idValido = item.prodId !== undefined && item.prodId !== null && porId.has(String(item.prodId));
        const usa = idValido
          ? String(item.prodId) === String(origem.id)
          : (norm(item.sku) !== '' && norm(item.sku) === norm(origem.sku));
        if (!usa) return;
        const custo = r2(origem.custo);
        if (r2(item.custoUnitario) !== custo) { item.custoUnitario = custo; mudou = true; }
        if (origem.name && item.name !== origem.name) { item.name = origem.name; mudou = true; }
        if (origem.sku !== undefined && (item.sku || '') !== (origem.sku || '')) { item.sku = origem.sku || ''; mudou = true; }
        if (typeof origem.image === 'string' && (item.image || '') !== origem.image) { item.image = origem.image; mudou = true; }
        if (!idValido && origem.id !== undefined) { item.prodId = origem.id; mudou = true; }
      });
      if (!mudou) return;
      const custoAntes = r2(c.custo);
      c.custo = r2(c.componentes.reduce((acc, it) => acc + ((Number(it && it.custoUnitario) || 0) * (Number(it && it.qty) || 0)), 0));
      try { recalcularProdutoSalvo(c, ehML); }
      catch (e) { console.error('[Compostos] falha ao recalcular', c && c.name, e); }
      c.updatedAt = Date.now();
      if (alterados.indexOf(c) < 0) alterados.push(c);
      // Composto dentro de composto: o custo deste mudou, então quem o
      // usa como item também precisa mudar.
      if (c.custo !== custoAntes) fila.push(c);
    });
  }

  if (!alterados.length) return res;
  res.atualizados = alterados.length;
  res.nomes = alterados.map((p) => p.name || p.sku || 'Produto');
  res.ids = alterados.map((p) => p.id);
  res.alterados = alterados;
  return res;
}

/**
 * MESMO SKU NA MESMA PLATAFORMA: o mesmo item em outro produto (outro
 * anúncio com o mesmo SKU) recebe o Preço de Custo novo.
 *
 * Só o Preço de Custo: ele é do item (o que se paga por ele) e vale para
 * todo anúncio desse SKU — é também o que os compostos copiam. Embalagem,
 * taxas, frete e margem são de cada anúncio: mudam por eles, ou pelas
 * Ações em Massa, que deixam escolher o campo.
 *
 * Produto composto fica de fora, dos dois lados: o custo dele é a soma
 * dos itens, não um valor digitado.
 *
 * Cada produto que muda é recalculado (preço, kits e Preços Extras na
 * margem) e leva junto os compostos que o usam (propagarDependencias).
 *
 * @param {string} platformId  plataforma do produto que mudou
 * @param {string} prodId      id do produto que mudou (já gravado)
 * @returns {{atualizados:number, nomes:string[], compostos:number, compostosNomes:string[], compostosIds:Array}}
 */
function sincronizarCustoDoSku(platformId, prodId) {
  const res = { atualizados: 0, nomes: [], compostos: 0, compostosNomes: [], compostosIds: [] };
  let produtos;
  try { produtos = getProducts(platformId) || []; }
  catch (e) { console.error('[Mesmo SKU] falha ao ler a plataforma', platformId, e); return res; }
  if (!Array.isArray(produtos) || produtos.length < 2) return res;

  const norm = (t) => String(t || '').trim().toUpperCase();
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const ehComposto = (p) => Array.isArray(p && p.componentes) && p.componentes.length > 0;

  const origem = produtos.find((p) => p && String(p.id) === String(prodId));
  if (!origem || ehComposto(origem) || !norm(origem.sku)) return res;

  const custo = r2(origem.custo);
  const ehML = _plataformaEhML(platformId);
  const alterados = [];
  produtos.forEach((p) => {
    if (!p || p === origem || ehComposto(p) || norm(p.sku) !== norm(origem.sku)) return;
    if (r2(p.custo) === custo) return;
    p.custo = custo;
    try { recalcularProdutoSalvo(p, ehML); }
    catch (e) { console.error('[Mesmo SKU] falha ao recalcular', p && p.name, e); }
    p.updatedAt = Date.now();
    alterados.push(p);
  });
  if (!alterados.length) return res;

  try { saveProducts(platformId, produtos); }
  catch (e) {
    console.error('[Mesmo SKU] falha ao salvar a plataforma', platformId, e);
    return res;
  }
  res.atualizados = alterados.length;
  res.nomes = alterados.map((p) => p.name || p.sku || 'Produto');

  // Os compostos que usam esses produtos (sem contar o mesmo duas vezes).
  const vistos = new Set();
  alterados.forEach((p) => {
    try {
      const r = propagarDependencias(platformId, p.sku, p.id);
      if (!r || !r.atualizados) return;
      r.nomes.forEach((n, i) => {
        const id = r.ids && r.ids[i] !== undefined ? r.ids[i] : n;
        if (vistos.has(String(id))) return;
        vistos.add(String(id));
        res.compostosNomes.push(n);
        res.compostosIds.push(id);
      });
    } catch (e) { console.error('[Mesmo SKU] falha ao propagar', p && p.name, e); }
  });
  res.compostos = res.compostosNomes.length;
  return res;
}

/**
 * Atualiza campos de um produto (por SKU) em várias plataformas.
 * Recalcula unidade + kits (e os Preços Extras na margem) e propaga o
 * custo para os produtos compostos de cada plataforma.
 */
function performMassUpdate(sku, updates, targetPlatforms) {
  const searchSku = (sku || '').trim().toUpperCase();
  if (!searchSku) {
    return { success: false, productsUpdated: 0, kitsRecalculated: 0, message: 'SKU não informado.' };
  }
  if (!updates || typeof updates !== 'object') {
    return { success: false, productsUpdated: 0, kitsRecalculated: 0, message: 'Nenhuma alteração informada.' };
  }

  const platformsToUpdate = targetPlatforms || getAllPlatformIds();
  let productsUpdated = 0;
  let kitsRecalculated = 0;
  // Cada composto conta uma vez, mesmo que use mais de um item alterado
  // (a chave é plataforma|id; o nome vai junto, na mesma posição).
  const compostosChaves = [];
  const compostosNomes = [];
  const compostosIds = [];

  platformsToUpdate.forEach((pId) => {
    let products;
    try { products = getProducts(pId) || []; }
    catch (e) { console.error('Falha ao ler produtos da plataforma', pId, e); return; }

    const ehML = _plataformaEhML(pId);
    const atualizadosAqui = [];
    products = products.map((p) => {
      if (!p || typeof p !== 'object') return p;
      if ((p.sku || '').trim().toUpperCase() === searchSku) {
        Object.keys(updates).forEach((key) => (p[key] = updates[key]));
        kitsRecalculated += recalcularProdutoSalvo(p, ehML);
        productsUpdated++;
        atualizadosAqui.push(p);
      }
      return p;
    });

    if (atualizadosAqui.length) {
      try { saveProducts(pId, products); }
      catch (e) { console.error('Falha ao salvar produtos da plataforma', pId, e); return; }

      // Os compostos desta plataforma que usam o item (e os compostos que
      // usam esses compostos) recebem o custo novo e recalculam tudo.
      // Depois de salvar: a propagação lê o que está gravado.
      if (updates.custo !== undefined) {
        atualizadosAqui.forEach((p) => {
          try {
            const r = propagarDependencias(pId, p.sku, p.id);
            if (r && r.atualizados) {
              r.nomes.forEach((n, i) => {
                const id = r.ids && r.ids[i] !== undefined ? r.ids[i] : n;
                const chave = pId + '|' + String(id);
                if (compostosChaves.indexOf(chave) >= 0) return;
                compostosChaves.push(chave);
                compostosNomes.push(n);
                compostosIds.push(id);
              });
            }
          } catch (e) { console.error('[Compostos] falha ao propagar', p && p.sku, e); }
        });
      }
    }
  });

  if (productsUpdated === 0) {
    return {
      success: false, productsUpdated: 0, kitsRecalculated: 0,
      message: `Nenhum produto com o SKU "${sku}" foi encontrado nas plataformas selecionadas.`,
    };
  }
  return {
    success: true, productsUpdated, kitsRecalculated,
    compostosAtualizados: compostosChaves.length, compostosNomes, compostosIds,
  };
}

/* ═══════════════════════════════════════════
   AÇÕES EM MASSA EM LOTE (sem travar a tela)

   POR QUE A TELA TRAVAVA
   A tela chamava o performMassUpdate uma vez para cada SKU em cada
   plataforma, tudo de uma vez, sem pausa. Cada chamada copiava a
   plataforma inteira (getProducts), gravava a plataforma inteira
   (saveProducts: outra cópia + IndexedDB) e, mudando o custo, lia e
   gravava tudo de novo para os compostos. Com N produtos, isso é N
   cópias e N gravações da lista inteira — e a tela não respondia até o
   fim (nem o "Processando..." do botão chegava a aparecer).

   O QUE MUDA AQUI
   · Cada plataforma é lida UMA vez, os SKUs são aplicados na mesma lista
     (na mesma ordem de antes) e a plataforma é gravada UMA vez no fim.
     Os compostos são atualizados na mesma lista (_propagarDependenciasNaLista),
     logo depois de cada SKU, como antes — o resultado é o mesmo do
     performMassUpdate SKU a SKU.
   · O trabalho é feito em fatias curtas: entre uma e outra, a tela respira
     (a animação gira, o progresso anda) e aoProgredir conta quantos SKUs
     já foram aplicados em cada plataforma — o progresso é real.
   · A gravação de cada plataforma é esperada: o resultado só aparece
     depois que os dados estão no disco.

   protegerCustoDeCompostos: o Preço de Custo nunca é gravado num produto
   composto (o custo dele é a soma dos componentes). Os outros campos dele
   mudam normalmente; se só o custo foi pedido, ele fica como está.
   ═══════════════════════════════════════════ */

/** Devolve a vez ao navegador: ele pinta a tela e atende cliques. */
function _cederVez() {
  return new Promise((resolve) => {
    let feito = false;
    const ok = () => { if (!feito) { feito = true; resolve(); } };
    // Janela minimizada: os timers ficam lentos (até 1 por segundo). A
    // mensagem de um MessageChannel não sofre esse freio.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && typeof MessageChannel === 'function') {
      try {
        const canal = new MessageChannel();
        canal.port1.onmessage = ok;
        canal.port2.postMessage(0);
        return;
      } catch (e) {}
    }
    setTimeout(ok, 0);
  });
}

/**
 * Aplica as Ações em Massa: os SKUs em cada plataforma, sem travar a tela.
 *
 * @param {string[]} skus                     SKUs, na ordem em que serão aplicados
 * @param {Object<string,Object>} updatesPorPlataforma  { idDaPlataforma: alterações }
 *        (cada plataforma com as chaves que ela entende; sem nada além do
 *        margemTipo, a plataforma é pulada — como antes)
 * @param {string[]} plataformas              ordem das plataformas
 * @param {object} [opcoes]
 *        aoProgredir({ etapa:"aplicando"|"gravando", plataforma, indicePlataforma,
 *                      totalPlataformas, skuAtual, totalSkus, feitos, total })
 *        protegerCustoDeCompostos (boolean)
 *        fatiaMs: quanto tempo trabalhar antes de devolver a vez (padrão 24)
 * @returns {Promise<{success, productsUpdated, kitsRecalculated, platformsAffected,
 *          compostos, compostosAtualizados, skusProcessados, custoIgnoradoCompostos,
 *          falhasAoGravar}>}
 */
async function performMassUpdateLote(skus, updatesPorPlataforma, plataformas, opcoes) {
  opcoes = opcoes || {};
  const fatiaMs = Number(opcoes.fatiaMs) > 0 ? Number(opcoes.fatiaMs) : 24;
  const avisar = typeof opcoes.aoProgredir === 'function' ? opcoes.aoProgredir : null;
  const proteger = !!opcoes.protegerCustoDeCompostos;
  const listaSkus = Array.isArray(skus) ? skus.slice() : [];
  const mapa = updatesPorPlataforma || {};
  const norm = (t) => String(t || '').trim().toUpperCase();
  const agora = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const ehComposto = (p) => Array.isArray(p && p.componentes) && p.componentes.length > 0;

  const res = {
    success: false, productsUpdated: 0, kitsRecalculated: 0, platformsAffected: [],
    compostos: [], compostosAtualizados: 0, skusProcessados: listaSkus.length,
    custoIgnoradoCompostos: 0, falhasAoGravar: [],
  };

  // Só as plataformas que têm o que receber (além do margemTipo).
  const plats = (Array.isArray(plataformas) ? plataformas : []).filter((pid) => {
    const u = mapa[pid];
    return !!u && Object.keys(u).filter((k) => k !== 'margemTipo').length > 0;
  });
  const total = plats.length * listaSkus.length;
  let feitos = 0;
  let inicioFatia = agora();
  // A ordem das plataformas afetadas é a de antes (SKU a SKU, plataforma a
  // plataforma): pelo primeiro SKU que alterou cada uma.
  const primeiroSku = {};

  const contar = (etapa, pi, si) => {
    if (!avisar) return;
    try {
      avisar({
        etapa, plataforma: plats[pi], indicePlataforma: pi + 1, totalPlataformas: plats.length,
        skuAtual: si, totalSkus: listaSkus.length, feitos, total,
      });
    } catch (e) { console.error('[Ações em Massa] aoProgredir', e); }
  };

  for (let pi = 0; pi < plats.length; pi++) {
    const pId = plats[pi];
    const updates = mapa[pId];
    contar('aplicando', pi, 0);

    let products;
    try { products = getProducts(pId) || []; }
    catch (e) {
      console.error('Falha ao ler produtos da plataforma', pId, e);
      feitos += listaSkus.length;
      continue;
    }

    const ehML = _plataformaEhML(pId);
    // Os produtos de cada SKU, na ordem da lista (a mesma do performMassUpdate).
    const porSku = new Map();
    products.forEach((p) => {
      if (!p || typeof p !== 'object') return;
      const k = norm(p.sku);
      if (!k) return;
      if (!porSku.has(k)) porSku.set(k, []);
      porSku.get(k).push(p);
    });

    let alterouPlataforma = false;
    for (let si = 0; si < listaSkus.length; si++) {
      const alvos = porSku.get(norm(listaSkus[si])) || [];
      const atualizadosAqui = [];
      alvos.forEach((p) => {
        let chaves = Object.keys(updates);
        if (proteger && updates.custo !== undefined && ehComposto(p)) {
          chaves = chaves.filter((k) => k !== 'custo');
          res.custoIgnoradoCompostos++;
          if (!chaves.filter((k) => k !== 'margemTipo').length) return;
        }
        chaves.forEach((key) => (p[key] = updates[key]));
        res.kitsRecalculated += recalcularProdutoSalvo(p, ehML);
        res.productsUpdated++;
        atualizadosAqui.push(p);
      });

      if (atualizadosAqui.length) {
        alterouPlataforma = true;
        res.success = true;
        if (primeiroSku[pId] === undefined) primeiroSku[pId] = si;
        // Mudou o custo: os compostos desta plataforma que usam o item (e
        // os compostos que usam esses compostos) — na mesma lista.
        if (updates.custo !== undefined) {
          atualizadosAqui.forEach((p) => {
            try {
              const r = _propagarDependenciasNaLista(products, pId, p.sku, p.id);
              if (!r || !r.atualizados) return;
              r.nomes.forEach((n, i) => {
                const chave = pId + '|' + (r.ids && r.ids[i] !== undefined ? r.ids[i] : n);
                if (res.compostos.indexOf(chave) < 0) res.compostos.push(chave);
              });
            } catch (e) { console.error('[Compostos] falha ao propagar', p && p.sku, e); }
          });
        }
      }

      feitos++;
      if (agora() - inicioFatia >= fatiaMs) {
        contar('aplicando', pi, si + 1);
        await _cederVez();
        inicioFatia = agora();
      }
    }

    if (alterouPlataforma) {
      if (res.platformsAffected.indexOf(pId) < 0) res.platformsAffected.push(pId);
      contar('gravando', pi, listaSkus.length);
      await _cederVez();
      let ok = false;
      try { ok = await saveProducts(pId, products); }
      catch (e) { console.error('Falha ao salvar produtos da plataforma', pId, e); ok = false; }
      if (!ok) res.falhasAoGravar.push(pId);
      inicioFatia = agora();
    }
  }

  res.platformsAffected.sort((x, y) => (primeiroSku[x] - primeiroSku[y]) || (plats.indexOf(x) - plats.indexOf(y)));
  res.compostosAtualizados = res.compostos.length;
  contar('fim', Math.max(0, plats.length - 1), listaSkus.length);
  return res;
}

/* ═══════════════════════════════════════════
   MÁSCARAS DE INPUT
   ═══════════════════════════════════════════
   Uso:
     Monetário  → classe "mask-money"   no <input>
     Percentual → classe "mask-percent" no <input>
   Aplicam-se no DOMContentLoaded e via _bindMasks(container) para conteúdo
   dinâmico. Esta é a implementação de referência do projeto (com limite de
   dígitos, controle de cursor e tratamento de paste); as telas serão
   migradas para usá-la no lugar das cópias locais.
   ═══════════════════════════════════════════ */

// ── MÁSCARA MONETÁRIA (caixa registradora) ──
function _applyMoneyMask(input) {
  const MAX_DIGITOS = 15; // acima disso, parseInt passa de MAX_SAFE_INTEGER
  function _format(raw) {
    let digits = String(raw).replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length > MAX_DIGITOS) digits = digits.slice(0, MAX_DIGITOS);
    const cents = parseInt(digits, 10);
    if (!isFinite(cents)) return "";
    const reais = cents / 100;
    return reais.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  input.addEventListener("input", function () {
    this.value = _format(this.value);
    this.setSelectionRange(this.value.length, this.value.length);
  });
  input.addEventListener("focus", function () {
    if (!this.value || this.value === "0,00") this.value = "";
  });
  input.addEventListener("blur", function () {
    if (!this.value.trim()) this.value = "0,00";
    else this.value = _format(this.value) || "0,00";
  });
}

// ── MÁSCARA PERCENTUAL (digitação livre, 2 casas no blur) ──
function _applyPercentMask(input) {
  const MAX_INT = 6; // teto de dígitos na parte inteira (até 999999,99)
  input.addEventListener("keydown", function (e) {
    const allowed = ["Backspace","Delete","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Tab","Home","End"];
    if (allowed.includes(e.key)) return;
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === ".") {
      e.preventDefault();
      const pos = this.selectionStart;
      if (!this.value.includes(",")) {
        this.value = this.value.slice(0, pos) + "," + this.value.slice(this.selectionEnd);
        this.setSelectionRange(pos + 1, pos + 1);
      }
      return;
    }
    if (e.key === ",") { if (this.value.includes(",")) e.preventDefault(); return; }
    if (!/^\d$/.test(e.key)) { e.preventDefault(); return; }
    // Limita a parte inteira (antes da vírgula) a MAX_INT dígitos
    const parteInteira = this.value.split(",")[0].replace(/\D/g, "");
    const semSelecao = this.selectionStart === this.selectionEnd;
    const cursorNaParteInteira = this.selectionStart <= this.value.indexOf(",") || !this.value.includes(",");
    if (semSelecao && cursorNaParteInteira && parteInteira.length >= MAX_INT) e.preventDefault();
  });
  input.addEventListener("paste", function (e) {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData("text");
    const clean = pasted.replace(/[^0-9,.]/g, "").replace(".", ",");
    const parts = clean.split(",");
    let inteira = parts[0].replace(/\D/g, "").slice(0, MAX_INT);
    const decimal = parts.length > 1 ? parts.slice(1).join("").replace(/\D/g, "") : "";
    const safe = parts.length > 1 ? inteira + "," + decimal : inteira;
    const pos = this.selectionStart;
    this.value = this.value.slice(0, pos) + safe + this.value.slice(this.selectionEnd);
    const newPos = pos + safe.length;
    this.setSelectionRange(newPos, newPos);
  });
  input.addEventListener("blur", function () {
    const raw = this.value.trim().replace(",", ".");
    if (!raw) return;
    const num = parseFloat(raw);
    if (isNaN(num)) { this.value = ""; return; }
    this.value = num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });
}

function _bindMasks(root) {
  const r = root || document;
  r.querySelectorAll("input.mask-money").forEach((el) => {
    if (!el.dataset.maskBound) { _applyMoneyMask(el); el.dataset.maskBound = "1"; }
  });
  r.querySelectorAll("input.mask-percent").forEach((el) => {
    if (!el.dataset.maskBound) { _applyPercentMask(el); el.dataset.maskBound = "1"; }
  });
}

document.addEventListener("DOMContentLoaded", () => _bindMasks(document));

/* ═══════════════════════════════════════════════════════════════════
   MÁSCARA NUMÉRICA COMPARTILHADA

   O número se forma pelos centavos, da direita para a esquerda, como
   numa maquininha:

        1  →  0,01        1265  →  12,65
       12  →  0,12      126500  →  1.265,00

   ── POR QUE AQUI ───────────────────────────────────────────────────
   Esta máscara nasceu dentro do produto.js. Ações em Massa, Dados da
   Empresa e Registro de Vendas precisam do mesmo comportamento, e o
   calculadora.js — onde ficam parseFormattedValue e formatMoneyBR —
   NÃO é carregado nessas telas. O utils.js é o único carregado em
   todas, então é aqui que a função mora.

   Copiar o código em cada tela criaria quatro versões da mesma lógica
   para manter, e a próxima correção esqueceria uma delas.

   ── O QUE NÃO RECEBE MÁSCARA ───────────────────────────────────────
   Campos de quantidade, CEP, CPF/CNPJ, telefone, número de casa e
   códigos. Digitar "123" no número da casa viraria "1,23". Por isso a
   ativação é por classe (.money-input / .percent-input) ou por
   data-mascara="moeda", nunca por varredura de todos os inputs.
   ═══════════════════════════════════════════════════════════════════ */

/** Converte o texto exibido em número. "1.265,00" → 1265 */
function numeroDeTextoBR(texto) {
  if (texto === null || texto === undefined) return 0;
  var s = String(texto).trim();
  if (!s) return 0;
  // Remove tudo que não seja dígito, vírgula, ponto ou sinal.
  s = s.replace(/[^\d,.-]/g, "");
  // No formato brasileiro o ponto é milhar e a vírgula é decimal.
  s = s.replace(/\./g, "").replace(",", ".");
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

/** Formata um número no padrão brasileiro com 2 casas. 1265 → "1.265,00" */
function textoBRdeNumero(valor) {
  var n = Number(valor);
  if (!isFinite(n)) n = 0;
  var neg = n < 0;
  var d = Math.round(Math.abs(n) * 100).toString();
  while (d.length < 3) d = "0" + d;
  var inteiros = d.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + inteiros + "," + d.slice(-2);
}

/**
 * Aplica a máscara de centavos a um input.
 * Chamar duas vezes no mesmo campo é seguro: a marca no dataset impede
 * que os eventos sejam ligados em duplicidade (o que faria o valor ser
 * reformatado duas vezes por tecla).
 */
function aplicarMascaraMoeda(el) {
  if (!el || el.dataset.mascaraAtiva === "1") return;
  el.dataset.mascaraAtiva = "1";

  // Limite de dígitos: sem ele, colar um código de barras estouraria o
  // MAX_SAFE_INTEGER no parse e viraria um valor sem sentido.
  var MAX_DIGITOS = 15;

  function mascarar(texto) {
    var d = String(texto).replace(/\D/g, "");
    d = d.replace(/^0+(?=\d)/, ""); // zeros à esquerda não somam nada
    if (d === "") return "";
    if (d.length > MAX_DIGITOS) d = d.slice(0, MAX_DIGITOS);
    while (d.length < 3) d = "0" + d;
    var inteiros = d.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return inteiros + "," + d.slice(-2);
  }

  function aoFim() {
    try {
      var f = el.value.length;
      el.setSelectionRange(f, f);
    } catch (e) {
      // Alguns tipos de input não aceitam setSelectionRange. O valor
      // continua correto; só o cursor pode ficar no início.
    }
  }

  el.addEventListener("input", function () {
    var novo = mascarar(el.value);
    if (novo === el.value) return;
    el.value = novo;
    // O cursor vai para o fim: a máscara cresce sempre pela direita, e
    // mantê-lo no meio faria o próximo dígito entrar no lugar errado.
    aoFim();
  });

  el.addEventListener("focus", aoFim);
}

/**
 * Liga a máscara em todos os campos marcados dentro de um escopo.
 * Chame depois de renderizar campos criados por JS.
 *
 * @param {Element|Document} [escopo=document] onde procurar
 * @returns {number} quantos campos foram ligados agora
 */
function ativarMascarasNumericas(escopo) {
  var raiz = escopo || document;
  var alvos = raiz.querySelectorAll(
    'input.money-input, input.percent-input, input[data-mascara="moeda"]'
  );
  var n = 0;
  for (var i = 0; i < alvos.length; i++) {
    // type="number" não aceita "1.265,00" e o navegador limparia o campo.
    if (alvos[i].type === "number") continue;
    if (alvos[i].dataset.mascaraAtiva === "1") continue;
    aplicarMascaraMoeda(alvos[i]);
    n++;
  }
  return n;
}


/* ═══════════════════════════════════════════════════════════════════
   IDENTIFICAÇÃO DO MERCADO LIVRE

   Movida para cá porque DUAS telas precisam dela: o cadastro do produto
   (que mostra o painel Premium/Clássico) e a lista de produtos (que
   agora mostra os dois preços na coluna Preço).

   Duplicar a regra faria as telas discordarem sobre a mesma plataforma:
   o cadastro trataria como Mercado Livre e a lista não, ou o contrário.
   ═══════════════════════════════════════════════════════════════════ */

const TERMOS_ML = ["mercadolivre", "mercadopago"];
//
// SIGLAS_ML: abreviações, exigem PALAVRA INTEIRA (não pedaço de palavra).
//   É o que impede "ML" de bater em "MLB" e "MP" de bater em "MPX".
//   "Mercado Pago" não possui anúncio Premium/Clássico; se não quiser o
//   painel nele, remova "mercadopago" acima e "mp"/"mpago" abaixo.
const SIGLAS_ML = ["ml", "mp", "meli", "mlivre", "mpago"];
//
// └────────────────────────────────────────────────────────────────┘

// Minúsculas, sem acento, só letras e números (tudo grudado).
// "Mercado Livre Full" → "mercadolivrefull"
function _mlIdentCompacta(texto) {
  return String(texto == null ? "" : texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Mesma limpeza, mas separando em palavras. Espaço, hífen, underline e
// ponto viram separador — é assim que "mercado_livre_m9x2k3" (o id gerado)
// e "ML Full" (o nome) viram listas de palavras comparáveis.
function _mlIdentPalavras(texto) {
  return String(texto == null ? "" : texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function ehMercadoLivre(id, nome) {
  const compactos = [_mlIdentCompacta(id), _mlIdentCompacta(nome)];
  if (compactos.some((t) => TERMOS_ML.some((termo) => t.indexOf(termo) >= 0))) {
    return true;
  }
  const palavras = _mlIdentPalavras(id).concat(_mlIdentPalavras(nome));
  if (palavras.some((p) => SIGLAS_ML.indexOf(p) >= 0)) return true;

  // Sigla escrita separada ("M L", "M. P.") vira duas palavras de uma letra
  // e escaparia da checagem acima. Aqui juntamos as letras soltas do começo
  // — "M P" → "mp" — sem afetar nomes normais, porque só entram palavras de
  // um caractere. ("MP X" continua fora: o "x" quebra o par.)
  const soltas = [];
  for (const p of palavras) {
    if (p.length === 1) soltas.push(p);
    else break;
  }
  return soltas.length >= 2 && SIGLAS_ML.indexOf(soltas.join("")) >= 0;
}


// Exposto para as telas. `id` e `nome` da plataforma; qualquer um dos
// dois pode identificar.
if (typeof window !== "undefined") {
  window.ehMercadoLivre = ehMercadoLivre;
}


// ═══════════════════════════════════════════
//  JANELAS DO APP — no lugar do alert() e do confirm() do sistema
// ═══════════════════════════════════════════
// A janela do sistema não segue o tema, aparece com o título do programa
// em vez de uma pergunta clara e trava a tela inteira. Estas usam o visual
// do app e devolvem uma Promise:
//
//   BapellModal.confirmar({ titulo, texto, botao, cancelar, perigo }) → true/false
//   BapellModal.avisar({ titulo, texto, botao, tipo })                 → (nada)
//
// `texto` é texto puro (vai escapado). `html` aceita marcação montada pelo
// próprio app — nunca algo digitado pela pessoa sem passar por _escHtml.
// tipo: "pergunta" (padrão do confirmar), "perigo", "aviso", "info", "sucesso".
(function () {
  if (typeof window === "undefined" || window.BapellModal) return;

  var ICONES = {
    pergunta: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    perigo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>',
    aviso: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
    sucesso: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
  };
  var _seq = 0;

  /**
   * Monta a janela e espera a resposta.
   * botoes: [{ rotulo, valor, estilo: "primario"|"secundario"|"perigo", foco }]
   * valorEsc: o que o Esc e o clique fora devolvem.
   */
  function _abrir(op) {
    return new Promise(function (resolve) {
      var tipo = ICONES[op.tipo] ? op.tipo : "info";
      var idTitulo = "bmTitulo" + ++_seq;
      var focoAntes = document.activeElement;

      var fundo = document.createElement("div");
      fundo.className = "modal-overlay bm-overlay";
      fundo.setAttribute("role", "alertdialog");
      fundo.setAttribute("aria-modal", "true");
      fundo.setAttribute("aria-labelledby", idTitulo);

      var corpo = op.html != null ? String(op.html) : (op.texto != null ? _escHtml(op.texto) : "");
      var botoes = (op.botoes || []).map(function (b, i) {
        var classe = b.estilo === "perigo" ? "btn-danger bm-btn" : b.estilo === "secundario" ? "btn-secondary bm-btn" : "btn-primary bm-btn";
        return '<button type="button" class="' + classe + '" data-bm="' + i + '">' + _escHtml(b.rotulo) + "</button>";
      }).join("");

      fundo.innerHTML =
        '<div class="modal bm-modal bm-modal--' + tipo + '">' +
          '<div class="bm-topo">' +
            '<span class="bm-ico">' + ICONES[tipo] + "</span>" +
            '<div class="modal-title bm-titulo" id="' + idTitulo + '">' + _escHtml(op.titulo || "") + "</div>" +
          "</div>" +
          (corpo ? '<div class="modal-subtitle bm-texto">' + corpo + "</div>" : "") +
          '<div class="modal-actions bm-acoes">' + botoes + "</div>" +
        "</div>";
      (document.body || document.documentElement).appendChild(fundo);

      var feito = false;
      function responder(valor) {
        if (feito) return;
        feito = true;
        document.removeEventListener("keydown", tecla, true);
        fundo.remove();
        try {
          if (focoAntes && focoAntes.isConnected && typeof focoAntes.focus === "function") {
            focoAntes.focus({ preventScroll: true });
          }
        } catch (e) {}
        resolve(valor);
      }
      function tecla(e) {
        // Duas janelas abertas (uma confirmação por cima de outra): só a de
        // cima responde ao teclado — um Esc fecha uma de cada vez.
        var todas = document.querySelectorAll(".bm-overlay");
        if (todas.length && todas[todas.length - 1] !== fundo) return;
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          responder(op.valorEsc);
          return;
        }
        // O Tab circula só pelos botões desta janela.
        if (e.key === "Tab") {
          var lista = Array.prototype.slice.call(fundo.querySelectorAll("button"));
          if (!lista.length) return;
          var i = lista.indexOf(document.activeElement);
          e.preventDefault();
          var prox = e.shiftKey ? (i <= 0 ? lista.length - 1 : i - 1) : (i < 0 || i >= lista.length - 1 ? 0 : i + 1);
          lista[prox].focus();
        }
      }
      document.addEventListener("keydown", tecla, true);
      fundo.addEventListener("mousedown", function (e) { if (e.target === fundo) responder(op.valorEsc); });
      Array.prototype.forEach.call(fundo.querySelectorAll("[data-bm]"), function (btn) {
        btn.addEventListener("click", function () {
          var b = op.botoes[Number(btn.getAttribute("data-bm"))];
          responder(b ? b.valor : op.valorEsc);
        });
      });
      // Foco: no botão marcado (nas ações sem volta, o "Cancelar").
      var iFoco = 0;
      (op.botoes || []).forEach(function (b, i) { if (b.foco) iFoco = i; });
      setTimeout(function () {
        var alvo = fundo.querySelector('[data-bm="' + iFoco + '"]');
        try { if (alvo) alvo.focus(); } catch (e) {}
      }, 30);
    });
  }

  function confirmar(op) {
    op = op || {};
    var perigo = !!op.perigo;
    return _abrir({
      tipo: op.tipo || (perigo ? "perigo" : "pergunta"),
      titulo: op.titulo || "Confirmar",
      texto: op.texto,
      html: op.html,
      valorEsc: false,
      botoes: [
        { rotulo: op.cancelar || "Cancelar", valor: false, estilo: "secundario", foco: perigo },
        { rotulo: op.botao || "Confirmar", valor: true, estilo: perigo ? "perigo" : "primario", foco: !perigo },
      ],
    });
  }

  function avisar(op) {
    op = op || {};
    return _abrir({
      tipo: op.tipo || "info",
      titulo: op.titulo || "Aviso",
      texto: op.texto,
      html: op.html,
      valorEsc: undefined,
      botoes: [{ rotulo: op.botao || "Entendi", valor: undefined, estilo: "primario", foco: true }],
    }).then(function () {});
  }

  /** Várias saídas: botoes [{ rotulo, valor, estilo }]; Esc devolve null. */
  function escolher(op) {
    op = op || {};
    return _abrir({
      tipo: op.tipo || "pergunta",
      titulo: op.titulo || "",
      texto: op.texto,
      html: op.html,
      valorEsc: null,
      botoes: op.botoes || [],
    });
  }

  window.BapellModal = { confirmar: confirmar, avisar: avisar, escolher: escolher };
})();


// ═══════════════════════════════════════════
//  CAMPO OBRIGATÓRIO EM VERMELHO
// ═══════════════════════════════════════════
// Quando falta preencher, o campo (e o nome dele) fica vermelho até a
// pessoa digitar — o olho acha o campo na hora, mesmo numa tela longa.
//
//   BapellCampos.exigir([{ el, vazio, msg, alvo }], { avisar })  → true se tudo ok
//   BapellCampos.marcar(el, mensagemOpcional)   BapellCampos.limpar(el)
//   BapellCampos.limparTodos(raiz)              BapellCampos.focar(el)
//
// el: o campo. alvo: o que fica vermelho, quando não é o próprio campo
// (um botão que abre um calendário, por exemplo). vazio: true/false ou
// uma função — sem ele, vale "o valor está em branco". avisar(msg): para a
// tela usar o próprio aviso em vez do showToast.
(function () {
  if (typeof window === "undefined" || window.BapellCampos) return;

  var SELETOR_GRUPO = ".field-group, .rv-field, .lem-form-grid > div, .mini, .form-group, .campo, .bsn-campo, .usr-campo";

  function _rotulo(el) {
    if (!el || !el.closest) return null;
    try {
      if (el.id) {
        var porFor = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]');
        if (porFor) return porFor;
      }
    } catch (e) {}
    var grupo = el.closest(SELETOR_GRUPO);
    if (!grupo) return null;
    var lab = grupo.querySelector(":scope > label");
    return lab || null;
  }

  /** Onde a mensagem entra: depois do campo — ou do conjunto dele (prefixo/sufixo). */
  function _ancora(el) {
    var wrap = el.closest(".input-addon-wrap, .rv-addon, .rv-sku-box, .rv-select-logo, .lem-valor-wrap, .lem-empresa-wrap, .lem-dt-wrap, .bsn-linha");
    return wrap || el;
  }

  function limpar(el) {
    if (!el) return;
    el.classList.remove("campo-erro", "campo-erro--pulso", "campo-erro--grupo");
    el.removeAttribute("aria-invalid");
    var lab = el._bcRotulo || _rotulo(el);
    if (lab) lab.classList.remove("rotulo-erro");
    if (el._bcMsg) { try { el._bcMsg.remove(); } catch (e) {} el._bcMsg = null; }
    if (el._bcSoltar) { el._bcSoltar(); el._bcSoltar = null; }
  }

  function marcar(el, msg, opcoes) {
    if (!el) return;
    limpar(el);
    el.classList.add("campo-erro");
    // Um grupo (lista de opções, caixa de campos) ganha um contorno em vez
    // da borda de campo.
    if (!/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName)) el.classList.add("campo-erro--grupo");
    el.setAttribute("aria-invalid", "true");
    // Reinicia a animação de destaque a cada nova tentativa de salvar.
    el.classList.remove("campo-erro--pulso");
    void el.offsetWidth;
    el.classList.add("campo-erro--pulso");
    var lab = _rotulo(el);
    if (lab) { lab.classList.add("rotulo-erro"); el._bcRotulo = lab; }
    if (msg) {
      var m = document.createElement("div");
      m.className = "campo-erro-msg";
      m.setAttribute("role", "alert");
      m.textContent = msg;
      var ancora = _ancora(el);
      if (ancora.parentNode) ancora.parentNode.insertBefore(m, ancora.nextSibling);
      el._bcMsg = m;
    }
    // Sai do vermelho assim que a pessoa mexer no campo. "campo" pode ser
    // outro elemento (o select ou o input escondido de um componente).
    var origem = (opcoes && opcoes.campo) || el;
    var resolvido = (opcoes && opcoes.resolvido) || function () {
      return String(origem.value == null ? "" : origem.value).trim() !== "";
    };
    function aoMudar() { if (resolvido()) limpar(el); }
    origem.addEventListener("input", aoMudar);
    origem.addEventListener("change", aoMudar);
    if (origem !== el) { el.addEventListener("click", aoMudar); }
    el._bcSoltar = function () {
      origem.removeEventListener("input", aoMudar);
      origem.removeEventListener("change", aoMudar);
      if (origem !== el) el.removeEventListener("click", aoMudar);
    };
  }

  function limparTodos(raiz) {
    var lista = (raiz || document).querySelectorAll(".campo-erro");
    Array.prototype.forEach.call(lista, function (el) { limpar(el); });
  }

  function focar(el) {
    if (!el) return;
    try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
    try { el.focus({ preventScroll: true }); } catch (e) {}
  }

  function _estaVazio(it) {
    if (typeof it.vazio === "function") return !!it.vazio();
    if (it.vazio != null) return !!it.vazio;
    return String(it.el.value == null ? "" : it.el.value).trim() === "";
  }

  /**
   * Confere os obrigatórios de uma vez: TODOS os que faltam ficam vermelhos,
   * o primeiro recebe o foco e um aviso diz o que falta.
   */
  function exigir(itens, opcoes) {
    opcoes = opcoes || {};
    var falhas = [];
    (itens || []).forEach(function (it) {
      if (!it || !it.el) return;
      var alvo = it.alvo || it.el;
      if (_estaVazio(it)) {
        marcar(alvo, opcoes.mensagemNoCampo ? it.msg : null, { campo: it.el, resolvido: it.resolvido });
        falhas.push({ alvo: alvo, msg: it.msg });
      } else if (alvo.classList.contains("campo-erro") && !it.manterErro) {
        limpar(alvo);
      }
    });
    if (!falhas.length) return true;
    if (opcoes.focar !== false) focar(falhas[0].alvo);
    var texto = falhas.length === 1
      ? (falhas[0].msg || "Preencha o campo destacado em vermelho.")
      : (falhas[0].msg ? falhas[0].msg + " Os campos que faltam estão em vermelho." : "Preencha os campos destacados em vermelho.");
    if (typeof opcoes.avisar === "function") opcoes.avisar(texto);
    else if (opcoes.avisar !== false && typeof showToast === "function") showToast(texto, "warning", 4200);
    return false;
  }

  window.BapellCampos = { exigir: exigir, marcar: marcar, limpar: limpar, limparTodos: limparTodos, focar: focar };
})();


// ═══════════════════════════════════════════
//  CPF E CNPJ — formato e dígitos verificadores
// ═══════════════════════════════════════════
// CNPJ alfanumérico (Receita Federal, a partir de julho de 2026): as 12
// primeiras posições aceitam letras e números; os 2 últimos (os dígitos
// verificadores) continuam números. O cálculo é o mesmo módulo 11 de
// sempre, com cada caractere valendo o código ASCII menos 48 (0–9 → 0–9,
// A → 17 … Z → 42) — por isso o CNPJ só de números continua valendo igual.
// Exemplo válido: 12.ABC.345/01DE-35.
//
//   BapellDoc.formatarCNPJ(v)  formatarCPF(v)  formatarCPFouCNPJ(v)
//   BapellDoc.validarCNPJ(v)   validarCPF(v)   validarCPFouCNPJ(v) → { valido, tipo, completo }
//   BapellDoc.ligar(input, "cnpj" | "cpf" | "cpfCnpj")  máscara + conferência ao sair
(function () {
  if (typeof window === "undefined" || window.BapellDoc) return;

  // Um CNPJ (inclusive alfanumérico) ou CPF já formatado, no meio de um
  // texto — "CNPJ: 12.345.678/0001-95", a linha copiada do Cartão CNPJ.
  var RE_CNPJ_FORMATADO = /[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}/;
  var RE_CPF_FORMATADO = /\d{3}\.\d{3}\.\d{3}-\d{2}/;
  // O nome do documento colado junto: "CNPJ:", "CPF nº", "CPF/CNPJ -".
  var RE_ROTULO = /^\s*(CNPJ|CPF)(\s*\/\s*(CNPJ|CPF))?\s*(N[º°O]\.?)?\s*[:\-–]?\s*/;

  /**
   * Só letras (maiúsculas) e números. Texto colado com o nome do documento
   * ("CNPJ: 12.345.678/0001-95") fica só com o documento — sem isso, as
   * letras do rótulo virariam um CNPJ alfanumérico que não existe.
   */
  function limpar(v) {
    var t = String(v == null ? "" : v).toUpperCase();
    var doc = _docNoTexto(t, RE_CNPJ_FORMATADO) || _docNoTexto(t, RE_CPF_FORMATADO);
    if (doc) return doc.replace(/[^0-9A-Z]/g, "");
    return t.replace(RE_ROTULO, "").replace(/[^0-9A-Z]/g, "");
  }

  // O documento formatado, solto no texto. Grudado em mais letras ou
  // números não conta: é alguém digitando além dele (um CNPJ que começou
  // com cara de CPF, por exemplo) — aí vale o texto todo.
  function _docNoTexto(t, re) {
    var m = re.exec(t);
    if (!m) return "";
    var antes = t.charAt(m.index - 1);
    var depois = t.charAt(m.index + m[0].length);
    if (/[0-9A-Z]/.test(antes) || /[0-9A-Z]/.test(depois)) return "";
    return m[0];
  }

  function formatarCNPJ(v) {
    var c = limpar(v);
    var p = "";
    for (var i = 0; i < c.length && p.length < 14; i++) {
      var ch = c.charAt(i);
      // Os dois últimos (dígitos verificadores) são sempre números.
      if (p.length >= 12 && !/[0-9]/.test(ch)) continue;
      p += ch;
    }
    var r = p.slice(0, 2);
    if (p.length > 2) r += "." + p.slice(2, 5);
    if (p.length > 5) r += "." + p.slice(5, 8);
    if (p.length > 8) r += "/" + p.slice(8, 12);
    if (p.length > 12) r += "-" + p.slice(12, 14);
    return r;
  }

  function formatarCPF(v) {
    var d = String(v == null ? "" : v).replace(/\D/g, "").slice(0, 11);
    var r = d.slice(0, 3);
    if (d.length > 3) r += "." + d.slice(3, 6);
    if (d.length > 6) r += "." + d.slice(6, 9);
    if (d.length > 9) r += "-" + d.slice(9, 11);
    return r;
  }

  /** Com letra ou mais de 11 caracteres é CNPJ; até 11 números, CPF. */
  function formatarCPFouCNPJ(v) {
    var c = limpar(v);
    if (/[A-Z]/.test(c) || c.length > 11) return formatarCNPJ(c);
    return formatarCPF(c);
  }

  function _dvCNPJ(base, pesos) {
    var soma = 0;
    for (var i = 0; i < base.length; i++) soma += (base.charCodeAt(i) - 48) * pesos[i];
    var resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }

  function validarCNPJ(v) {
    var c = limpar(v);
    if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return false;
    if (/^(.)\1{13}$/.test(c)) return false;
    var d1 = _dvCNPJ(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    var d2 = _dvCNPJ(c.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return c.slice(12) === String(d1) + String(d2);
  }

  function validarCPF(v) {
    var c = String(v == null ? "" : v).replace(/\D/g, "");
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    var soma = 0, i;
    for (i = 0; i < 9; i++) soma += Number(c.charAt(i)) * (10 - i);
    var d1 = (soma * 10) % 11;
    if (d1 === 10) d1 = 0;
    if (d1 !== Number(c.charAt(9))) return false;
    soma = 0;
    for (i = 0; i < 10; i++) soma += Number(c.charAt(i)) * (11 - i);
    var d2 = (soma * 10) % 11;
    if (d2 === 10) d2 = 0;
    return d2 === Number(c.charAt(10));
  }

  /** { valido, tipo: "cpf"|"cnpj"|null, completo } — vazio conta como válido. */
  function validarCPFouCNPJ(v) {
    var c = limpar(v);
    if (!c) return { valido: true, tipo: null, completo: false, vazio: true };
    if (!/[A-Z]/.test(c) && c.length <= 11) {
      return { valido: c.length === 11 && validarCPF(c), tipo: "cpf", completo: c.length === 11 };
    }
    return { valido: validarCNPJ(c), tipo: "cnpj", completo: c.length === 14 };
  }

  /** A mensagem para um documento que não confere (ou null se está ok). */
  function erroDe(v, tipoCampo) {
    var c = limpar(v);
    if (!c) return null;
    if (tipoCampo === "cnpj") {
      if (c.length < 14) return "CNPJ incompleto: são 14 caracteres.";
      return validarCNPJ(c) ? null : "CNPJ inválido. Confira os números e as letras.";
    }
    if (tipoCampo === "cpf") {
      if (c.length < 11) return "CPF incompleto: são 11 números.";
      return validarCPF(c) ? null : "CPF inválido. Confira os números.";
    }
    var r = validarCPFouCNPJ(c);
    if (r.valido) return null;
    if (r.tipo === "cpf") return r.completo ? "CPF inválido. Confira os números." : "CPF ou CNPJ incompleto.";
    return r.completo ? "CNPJ inválido. Confira os números e as letras." : "CNPJ incompleto: são 14 caracteres.";
  }

  function formatar(v, tipoCampo) {
    if (tipoCampo === "cnpj") return formatarCNPJ(v);
    if (tipoCampo === "cpf") return formatarCPF(v);
    return formatarCPFouCNPJ(v);
  }

  /**
   * Liga a máscara num campo e confere ao sair dele: documento que não
   * confere fica vermelho, com a explicação embaixo.
   * opcoes.aoMudar(valorFormatado): chamado a cada digitação.
   */
  function ligar(input, tipoCampo, opcoes) {
    if (!input || input.dataset.bdLigado === "1") return;
    input.dataset.bdLigado = "1";
    opcoes = opcoes || {};
    input.setAttribute("autocapitalize", "characters");
    input.setAttribute("spellcheck", "false");
    input.addEventListener("input", function () {
      var novo = formatar(input.value, tipoCampo);
      if (novo !== input.value) {
        input.value = novo;
        try { input.setSelectionRange(novo.length, novo.length); } catch (e) {}
      }
      if (typeof opcoes.aoMudar === "function") opcoes.aoMudar(novo);
    });
    input.addEventListener("blur", function () {
      _depoisDoClique(function () {
        if (!window.BapellCampos) return;
        var erro = erroDe(input.value, tipoCampo);
        if (erro) {
          window.BapellCampos.marcar(input, erro, {
            resolvido: function () { return !erroDe(input.value, tipoCampo); },
          });
          input._bdMarcou = true;
        } else if (input._bdMarcou) {
          // Só desfaz o vermelho que ele mesmo pôs: o de campo obrigatório
          // vazio (de quem salvou) continua até o campo ser preenchido.
          input._bdMarcou = false;
          if (input.classList.contains("campo-erro")) window.BapellCampos.limpar(input);
        }
      });
    });
  }

  // O aviso embaixo do campo empurra a tela para baixo. Se ele entrasse no
  // meio de um clique (o campo perde o foco no apertar do botão do mouse),
  // o botão clicado sairia de baixo do cursor e o clique se perderia
  // ("+ Adicionar Sócio", "Salvar"). Com o botão apertado, espera soltar.
  var _ponteiroAbaixo = false;
  var _esperandoSoltar = [];
  function _soltou() {
    _ponteiroAbaixo = false;
    if (!_esperandoSoltar.length) return;
    var fila = _esperandoSoltar.splice(0);
    // Depois do clique (que vem logo após soltar o botão).
    setTimeout(function () { fila.forEach(function (fn) { try { fn(); } catch (e) {} }); }, 0);
  }
  if (typeof document !== "undefined") {
    document.addEventListener("pointerdown", function () { _ponteiroAbaixo = true; }, true);
    document.addEventListener("pointerup", _soltou, true);
    document.addEventListener("pointercancel", _soltou, true);
  }
  function _depoisDoClique(fn) {
    if (!_ponteiroAbaixo) { fn(); return; }
    _esperandoSoltar.push(fn);
    // Botão solto fora da janela (o pointerup não chega aqui): não espera
    // para sempre.
    setTimeout(function () { if (_esperandoSoltar.length) _soltou(); }, 1500);
  }

  window.BapellDoc = {
    limpar: limpar,
    formatar: formatar,
    formatarCNPJ: formatarCNPJ,
    formatarCPF: formatarCPF,
    formatarCPFouCNPJ: formatarCPFouCNPJ,
    validarCNPJ: validarCNPJ,
    validarCPF: validarCPF,
    validarCPFouCNPJ: validarCPFouCNPJ,
    erroDe: erroDe,
    ligar: ligar,
  };
})();

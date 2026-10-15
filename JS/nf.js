// ═══════════════════════════════════════════
//  Bapell Gestor Pro — nf.js
//  Arquivo de Notas Fiscais por empresa
// ═══════════════════════════════════════════

const NF_LS_KEY = "precifiq_nf_empresas";
const EMPRESA_KEY_NF = "precifiq_empresa";

// ══════════════════════════════════════════
//  ARMAZENAMENTO DAS NOTAS (IndexedDB)
//  Banco próprio: as NFs têm campos que os documentos da
//  empresa não têm (número da nota, emitente).
//
//  ── ABERTURA SEM VERSÃO FIXA ─────────────────────────────
//  O banco "precifiq_notas" também é aberto pelo empresa.js (para
//  apagar as notas de uma empresa excluída). Uma versão antiga dele
//  criava o banco VAZIO na versão 1, sem a store — e aí abrir na 1
//  aqui não disparava o upgrade e nada gravava nem listava. O
//  conserto sobe a versão do banco para criar a store (por isso há
//  instalações com o banco na versão 2).
//
//  Por isso a abertura NUNCA fixa a versão: pedir uma versão menor
//  que a existente dá VersionError ("The requested version (1) is
//  less than the existing version (2)") e a tela não lista nenhuma
//  nota. Sem versão, o navegador abre na versão em que o banco
//  estiver (ou cria na 1, já com a store). Se faltar a store ou o
//  índice, sobe UMA versão só para criá-los. Os dados não são tocados.
// ══════════════════════════════════════════
const NotaStore = (function () {
  const DB_NAME = "precifiq_notas";
  const STORE = "notas";
  const INDICE = "empresaId";
  let _dbPromise = null;

  /** Cria a store e o índice que faltarem (só roda dentro de um upgrade). */
  function _criarEsquema(db, tx) {
    const store = db.objectStoreNames.contains(STORE)
      ? tx.objectStore(STORE)
      : db.createObjectStore(STORE, { keyPath: "id" });
    if (!store.indexNames.contains(INDICE)) {
      store.createIndex(INDICE, INDICE, { unique: false });
    }
  }

  /** A store e o índice que esta tela usa existem? */
  function _esquemaOk(db) {
    if (!db.objectStoreNames.contains(STORE)) return false;
    try {
      return db.transaction(STORE, "readonly").objectStore(STORE).indexNames.contains(INDICE);
    } catch (e) {
      return false;
    }
  }

  /** Abre o banco. Sem `versao`, na versão em que ele estiver; com, força o upgrade. */
  function _abrirBanco(versao) {
    return new Promise((resolve, reject) => {
      let req;
      try {
        req = versao ? indexedDB.open(DB_NAME, versao) : indexedDB.open(DB_NAME);
      } catch (e) {
        return reject(e);
      }
      req.onupgradeneeded = (e) => _criarEsquema(e.target.result, e.target.transaction);
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) =>
        reject((e.target && e.target.error) || new Error("Falha ao abrir banco de notas"));
      req.onblocked = () => console.warn("[NotaStore] abertura bloqueada por outra aba");
    });
  }

  async function _abrirComReparo() {
    let db = await _abrirBanco();

    // Banco existe, mas falta a store ou o índice: sobe uma versão para criar.
    if (!_esquemaOk(db)) {
      const proxima = db.version + 1;
      db.close();
      db = await _abrirBanco(proxima);
      if (!_esquemaOk(db)) {
        db.close();
        throw new Error("Não foi possível criar a estrutura do banco de notas.");
      }
      console.warn("[NotaStore] estrutura do banco de notas refeita (versão " + db.version + ").");
    }
    return db;
  }

  function _open() {
    if (_dbPromise) return _dbPromise;
    const promessa = _abrirComReparo().then(
      (db) => {
        // Se outra aba subir a versão do banco, esta conexão sai do caminho
        // (senão a outra fica travada) e a próxima chamada reabre na nova.
        const soltar = () => {
          if (_dbPromise === promessa) _dbPromise = null;
        };
        db.onversionchange = () => {
          try { db.close(); } catch (e) {}
          soltar();
        };
        db.onclose = soltar;
        return db;
      },
      (e) => {
        // NÃO cacheia a falha: um erro transitório de abertura ficava preso e
        // nenhuma nota gravava/lia até reiniciar. Zerando, a próxima tenta de novo.
        if (_dbPromise === promessa) _dbPromise = null;
        throw e;
      },
    );
    _dbPromise = promessa;
    return promessa;
  }

  /** Salva: {id, empresaId, nome, tipo, tamanho, numeroNf, emitente, responsavel, criadoEm, dataUrl} */
  async function salvar(registro) {
    const db = await _open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(registro);
      tx.oncomplete = () => resolve(registro);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Transação abortada"));
    });
  }

  /** Lista metadados (sem o dataUrl, que é pesado) */
  async function listar(empresaId) {
    const db = await _open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const idx = tx.objectStore(STORE).index("empresaId");
      const req = idx.getAll(empresaId);
      req.onsuccess = () => {
        const lista = (req.result || []).map((r) => ({
          id: r.id,
          empresaId: r.empresaId,
          nome: r.nome,
          tipo: r.tipo,
          tamanho: r.tamanho,
          numeroNf: r.numeroNf,
          emitente: r.emitente,
          responsavel: r.responsavel || "",
          criadoEm: r.criadoEm,
        }));
        resolve(lista);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /** Busca o registro completo (com dataUrl) */
  async function obter(id) {
    const db = await _open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function remover(id) {
    const db = await _open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Remove todas as notas de uma empresa */
  async function removerDaEmpresa(empresaId) {
    const db = await _open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const idx = tx.objectStore(STORE).index("empresaId");
      const req = idx.openCursor(IDBKeyRange.only(empresaId));
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // ── Métodos para o backup ──
  // Alias de obter (o backup usa .get). Retorna o registro completo.
  async function get(id) { return obter(id); }

  /** Grava um registro com id específico (importação de backup). */
  async function putWithId(id, registro) {
    if (!id) throw new Error("putWithId exige um id.");
    const reg = Object.assign({}, registro, { id });
    const db = await _open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(reg);
      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Transação abortada"));
    });
  }

  /** Retorna TODAS as notas como { id: registro } — para o backup exportar. */
  async function getAll() {
    const db = await _open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const out = {};
        (req.result || []).forEach((r) => { if (r && r.id) out[r.id] = r; });
        resolve(out);
      };
      req.onerror = () => reject(req.error);
    });
  }

  return { salvar, listar, obter, get, putWithId, getAll, remover, removerDaEmpresa };
})();

document.addEventListener("DOMContentLoaded", () => {
  if (typeof setDateHeader === "function") setDateHeader();

  // ══════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════
  const _esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const _genId = () =>
    typeof generateId === "function"
      ? generateId()
      : "id_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ── Obrigatórios em vermelho (utils.js) e responsável (senhas.js) ──
  // Os campos que faltam ficam vermelhos até serem preenchidos. Sem o
  // BapellCampos, fica só o aviso de sempre.
  function _exigir(itens) {
    if (window.BapellCampos) return window.BapellCampos.exigir(itens);
    const falta = itens.find((it) =>
      typeof it.vazio === "boolean" ? it.vazio : !String((it.el && it.el.value) || "").trim());
    if (falta) { showToast(falta.msg, "warning"); return false; }
    return true;
  }
  function _marcarErro(el) {
    if (!el || !window.BapellCampos) return;
    window.BapellCampos.marcar(el);
    window.BapellCampos.focar(el);
  }
  // O Responsável é escolhido entre os usuários de Dados da Empresa ›
  // Usuários e Senhas. Sem nenhum cadastrado, o campo fica vermelho e uma
  // janela leva ao cadastro.
  function _semUsuarios(select) {
    const U = window.BapellUsuarios;
    if (!U || U.listar().length) return false;
    _marcarErro(select);
    U.pedirCadastro();
    return true;
  }
  // Confere o responsável — quem tem senha só passa digitando a própria.
  // Resolve o usuário ({ id, nome }) ou null (cancelou).
  function _confirmarResponsavel(select, acao) {
    const U = window.BapellUsuarios;
    if (!U) return Promise.resolve(select.value ? { id: "", nome: select.value } : null);
    return U.confirmarResponsavel(select.value, { acao }).then((r) => {
      if (r.ok) return r.usuario;
      if (r.motivo === "vazio") { _marcarErro(select); showToast("Escolha o responsável.", "warning"); }
      return null;
    });
  }

  function _fmtData(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleDateString("pt-BR");
  }

  function _fmtTamanho(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  /** Ícone SVG conforme o tipo do arquivo */
  function _iconePorTipo(tipo, nome) {
    const t = (tipo || "").toLowerCase();
    const n = (nome || "").toLowerCase();
    const svg = (paths, cor) =>
      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${cor || "currentColor"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

    if (t.includes("pdf") || n.endsWith(".pdf"))
      return svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>', "var(--clr-danger)");
    if (t.includes("image") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(n))
      return svg('<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>', "var(--clr-primary)");
    if (/\.(xml)$/.test(n) || t.includes("xml"))
      return svg('<polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>', "var(--clr-warning)");
    if (/\.(xlsx?|csv)$/.test(n))
      return svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line>', "var(--clr-success)");
    return svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>');
  }

  function _fmtCNPJ(cnpj) {
    const d = String(cnpj || "").replace(/\D/g, "");
    if (d.length !== 14) return cnpj || "";
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }

  function _logoMini(logo, size) {
    const s = size || 30;
    if (logo) {
      return `<img src="${_esc(logo)}" alt="" style="width:${s}px;height:${s}px;border-radius:6px;object-fit:cover;border:1px solid var(--clr-border);flex-shrink:0;" />`;
    }
    return `<span style="width:${s}px;height:${s}px;border-radius:6px;background:var(--clr-surface-alt);border:1px solid var(--clr-border);display:inline-flex;align-items:center;justify-content:center;color:var(--clr-text-3);flex-shrink:0;"><svg width="${Math.round(s * 0.55)}" height="${Math.round(s * 0.55)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V7l8-4v18"></path><path d="M19 21V11l-6-4"></path></svg></span>`;
  }

  // ══════════════════════════════════════════
  //  EMPRESAS
  // ══════════════════════════════════════════
  function _carregarLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(NF_LS_KEY));
      if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
    } catch {}
    return { empresasLocais: [] };
  }

  function _salvarLocal(dados) {
    try {
      localStorage.setItem(NF_LS_KEY, JSON.stringify(dados));
      return true;
    } catch (e) {
      console.error("Falha ao salvar empresas de NF:", e);
      if (typeof PrecifiqErros !== "undefined") {
        PrecifiqErros.registrar("Falha ao salvar empresas de NF", String(e));
      }
      showToast("Não foi possível salvar a empresa.", "error");
      return false;
    }
  }

  function _todasEmpresas() {
    let cadastradas = [];
    try {
      const raw = JSON.parse(localStorage.getItem(EMPRESA_KEY_NF));
      if (raw && Array.isArray(raw.empresas)) {
        cadastradas = raw.empresas.map((e, i) => ({
          id: e.id,
          nome: e.nomeAba || e.nomeFantasia || e.razaoSocial || `Empresa ${i + 1}`,
          cnpj: e.cnpj || "",
          logo: e.logo || "",
          origem: "cadastro",
        }));
      }
    } catch {}

    const local = _carregarLocal();
    const locais = (Array.isArray(local.empresasLocais) ? local.empresasLocais : []).map((e) => ({
      ...e,
      origem: "local",
    }));

    return cadastradas.concat(locais);
  }

  // ══════════════════════════════════════════
  //  ESTADO
  // ══════════════════════════════════════════
  let empresaSelecionada = null;
  let notas = [];

  // ══════════════════════════════════════════
  //  ASIDE
  // ══════════════════════════════════════════
  function _renderEmpresas() {
    const cont = document.getElementById("listaEmpresas");
    if (!cont) return;

    const empresas = _todasEmpresas();

    if (empresas.length === 0) {
      cont.innerHTML = `<div class="sidebar-label-txt" style="font-size:12px;color:var(--clr-text-3);padding:10px 4px;text-align:center;">
        Nenhuma empresa cadastrada.
      </div>`;
      return;
    }

    cont.innerHTML = empresas
      .map((e) => {
        const ativa = empresaSelecionada && empresaSelecionada.id === e.id;
        return `
        <button type="button" class="empresa-item-btn ${ativa ? "ativa" : ""}" data-emp-id="${_esc(e.id)}" title="${_esc(e.nome)}">
          ${_logoMini(e.logo, 30)}
          <span class="sidebar-label-txt empresa-item-nome">${_esc(e.nome)}</span>
        </button>`;
      })
      .join("");

    cont.querySelectorAll(".empresa-item-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const emp = empresas.find((x) => x.id === btn.dataset.empId);
        if (emp) _selecionarEmpresa(emp);
      });
    });
  }

  async function _selecionarEmpresa(emp) {
    empresaSelecionada = emp;

    document.getElementById("nfVazio").style.display = "none";
    document.getElementById("nfConteudo").style.display = "block";
    document.getElementById("tituloEmpresa").textContent = emp.nome;

    const sub = document.getElementById("subtituloEmpresa");
    sub.textContent = emp.cnpj ? "· " + _fmtCNPJ(emp.cnpj) : "· CNPJ não informado";

    _renderEmpresas();
    await _carregarNotas();
  }

  // ══════════════════════════════════════════
  //  NOTAS
  // ══════════════════════════════════════════
  async function _carregarNotas() {
    if (!empresaSelecionada) return;
    try {
      notas = await NotaStore.listar(empresaSelecionada.id);
      // Mais recentes primeiro
      notas.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
    } catch (e) {
      console.error("Falha ao listar notas:", e);
      if (typeof PrecifiqErros !== "undefined") {
        PrecifiqErros.registrar("Falha ao listar notas fiscais", String(e));
      }
      showToast("Erro ao carregar as notas fiscais.", "error");
      notas = [];
    }
    _renderNotas();
  }

  function _renderNotas() {
    const tbody = document.getElementById("listaNotas");
    const vazio = document.getElementById("notasVazio");
    if (!tbody) return;

    const busca = (document.getElementById("inpBuscaNf").value || "").trim().toLowerCase();
    const filtradas = busca
      ? notas.filter(
          (n) =>
            (n.nome || "").toLowerCase().includes(busca) ||
            (n.numeroNf || "").toLowerCase().includes(busca) ||
            (n.emitente || "").toLowerCase().includes(busca) ||
            (n.responsavel || "").toLowerCase().includes(busca),
        )
      : notas;

    document.getElementById("contadorNotas").textContent =
      notas.length === 0 ? "" : `${notas.length} nota${notas.length !== 1 ? "s" : ""}`;

    tbody.innerHTML = "";
    vazio.style.display = filtradas.length === 0 ? "block" : "none";
    vazio.textContent = busca
      ? `Nenhuma nota encontrada para "${busca}".`
      : "Nenhuma nota fiscal anexada. Clique em Adicionar NF para começar.";

    filtradas.forEach((n) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div style="display:flex;align-items:center;gap:9px;min-width:0;">
            ${_iconePorTipo(n.tipo, n.nome)}
            <div style="min-width:0;">
              <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(n.nome)}</div>
              <div style="font-size:11px;color:var(--clr-text-3);">${_fmtTamanho(n.tamanho)}</div>
            </div>
          </div>
        </td>
        <td style="white-space:nowrap;font-family:monospace;font-weight:600;">${_esc(n.numeroNf || "—")}</td>
        <td>${_esc(n.emitente || "—")}</td>
        <td>${_esc(n.responsavel || "—")}</td>
        <td style="white-space:nowrap;color:var(--clr-text-3);font-size:12px;">${_fmtData(n.criadoEm)}</td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="nf-acao-btn" data-ver="${_esc(n.id)}" title="Ver documento">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            Ver
          </button>
          <button class="nf-acao-btn" data-editar="${_esc(n.id)}" title="Editar informações">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            Editar
          </button>
          <button class="nf-acao-btn danger" data-excluir="${_esc(n.id)}" title="Excluir nota">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Excluir
          </button>
        </td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-ver]").forEach((btn) => {
      btn.addEventListener("click", () => _verNota(btn.dataset.ver));
    });
    tbody.querySelectorAll("[data-editar]").forEach((btn) => {
      btn.addEventListener("click", () => _abrirModalEditar(btn.dataset.editar));
    });
    tbody.querySelectorAll("[data-excluir]").forEach((btn) => {
      btn.addEventListener("click", () => _confirmarExclusao(btn.dataset.excluir));
    });
  }

  // ══════════════════════════════════════════
  //  ADICIONAR NF
  // ══════════════════════════════════════════
  function _lerArquivoBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function _abrirModalAddNf(file) {
    const ex = document.getElementById("modalAddNf");
    if (ex) ex.remove();

    // Nome sugerido: o do arquivo, sem a extensão (o usuário pode renomear)
    const pontoIdx = file.name.lastIndexOf(".");
    const extensao = pontoIdx > 0 ? file.name.slice(pontoIdx) : "";
    const nomeBase = pontoIdx > 0 ? file.name.slice(0, pontoIdx) : file.name;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalAddNf";
    overlay.innerHTML = `
      <div class="modal" style="max-width:460px;width:90%;">
        <div class="modal-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>Anexar Nota Fiscal</span>
          <button type="button" id="nfX" style="background:transparent;border:none;color:var(--clr-text-3);font-size:22px;cursor:pointer;line-height:1;">✕</button>
        </div>

        <div class="nf-arquivo-info">
          ${_iconePorTipo(file.type, file.name)}
          <div style="min-width:0;flex:1;">
            <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(file.name)}</div>
            <div style="font-size:11px;color:var(--clr-text-3);">${_fmtTamanho(file.size)}</div>
          </div>
        </div>

        <div class="field-group" style="margin-bottom:var(--sp-md);">
          <label>Nome do arquivo <span style="color:var(--clr-danger);">*</span></label>
          <div style="display:flex;align-items:center;gap:6px;">
            <input type="text" id="nfNome" class="input-field" value="${_esc(nomeBase)}" style="flex:1;" />
            <span style="color:var(--clr-text-3);font-size:13px;font-weight:600;flex-shrink:0;">${_esc(extensao)}</span>
          </div>
        </div>

        <div class="field-group" style="margin-bottom:var(--sp-md);">
          <label>Número da NF <span style="color:var(--clr-danger);">*</span></label>
          <input type="text" id="nfNumero" class="input-field" placeholder="Ex: 687.957" inputmode="decimal" />
        </div>

        <div class="field-group" style="margin-bottom:var(--sp-md);">
          <label>Nome do emitente <span style="color:var(--clr-danger);">*</span></label>
          <input type="text" id="nfEmitente" class="input-field" placeholder="Quem emitiu a nota (fornecedor)" />
        </div>

        <div class="field-group" style="margin-bottom:var(--sp-lg);">
          <label for="nfResponsavel">Responsável <span style="color:var(--clr-danger);">*</span></label>
          <select id="nfResponsavel" class="input-field" title="Os usuários cadastrados em Dados da Empresa › Usuários e Senhas"></select>
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" id="nfCancelar">Cancelar</button>
          <button class="btn-primary" id="nfSalvar" style="padding:10px var(--sp-lg);font-size:14px;">Salvar Nota</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const fechar = () => {
      overlay.remove();
      document.getElementById("inputArquivoNf").value = "";
    };
    document.getElementById("nfX").addEventListener("click", fechar);
    document.getElementById("nfCancelar").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });

    // O número da NF pode vir com pontos de milhar (ex: 687.957)
    document.getElementById("nfNumero").addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/[^\d.]/g, "");
    });

    setTimeout(() => document.getElementById("nfNumero").focus(), 60);

    // Responsável: um dos usuários de Dados da Empresa › Usuários e Senhas.
    const selResp = document.getElementById("nfResponsavel");
    if (window.BapellUsuarios) window.BapellUsuarios.preencherSelect(selResp, { valor: "", vazio: "Selecione o responsável" });

    const btnSalvar = document.getElementById("nfSalvar");
    btnSalvar.addEventListener("click", async () => {
      if (btnSalvar.disabled) return;

      const nome = document.getElementById("nfNome").value.trim();
      const numeroNf = document.getElementById("nfNumero").value.trim();
      const emitente = document.getElementById("nfEmitente").value.trim();

      if (_semUsuarios(selResp)) return;
      if (!_exigir([
        { el: document.getElementById("nfNome"), msg: "Informe o nome do arquivo." },
        { el: document.getElementById("nfNumero"), msg: "Informe o número da NF." },
        { el: document.getElementById("nfEmitente"), msg: "Informe o nome do emitente." },
        { el: selResp, msg: "Escolha o responsável." },
      ])) return;

      // Quem tem senha só anexa digitando a própria senha.
      btnSalvar.disabled = true;
      const usuario = await _confirmarResponsavel(selResp, "anexar esta nota");
      if (!usuario) { btnSalvar.disabled = false; return; }
      // A janela foi fechada enquanto a senha era pedida: não grava.
      if (!overlay.isConnected) return;

      btnSalvar.textContent = "Salvando...";

      try {
        const dataUrl = await _lerArquivoBase64(file);
        await NotaStore.salvar({
          id: _genId(),
          empresaId: empresaSelecionada.id,
          nome: nome + extensao,
          tipo: file.type || "",
          tamanho: file.size,
          numeroNf,
          emitente,
          responsavel: usuario.nome,
          criadoEm: Date.now(),
          dataUrl,
        });
        fechar();
        await _carregarNotas();
        showToast("Nota fiscal anexada!", "success");
      } catch (e) {
        console.error("Falha ao salvar a nota:", e);
        if (typeof PrecifiqErros !== "undefined") {
          PrecifiqErros.registrar("Falha ao salvar nota fiscal", String(e));
        }
        showToast(
          e && e.name === "QuotaExceededError"
            ? "Armazenamento cheio. Libere espaço e tente novamente."
            : "Erro ao salvar a nota fiscal.",
          "error",
          5000,
        );
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar Nota";
      }
    });
  }

  // ══════════════════════════════════════════
  //  VER / BAIXAR
  // ══════════════════════════════════════════
  function _baixar(nota) {
    const a = document.createElement("a");
    a.href = nota.dataUrl;
    a.download = nota.nome || "nota-fiscal";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function _verNota(id) {
    let nota;
    try {
      nota = await NotaStore.obter(id);
    } catch (e) {
      console.error("Falha ao abrir a nota:", e);
      showToast("Erro ao abrir o arquivo.", "error");
      return;
    }
    if (!nota || !nota.dataUrl) {
      showToast("Arquivo não encontrado.", "error");
      return;
    }

    const t = (nota.tipo || "").toLowerCase();
    const n = (nota.nome || "").toLowerCase();
    const ehImagem = t.includes("image") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(n);
    const ehPdf = t.includes("pdf") || n.endsWith(".pdf");

    let conteudo;
    if (ehImagem) {
      conteudo = `<img src="${nota.dataUrl}" alt="${_esc(nota.nome)}"
        style="max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;box-shadow:0 4px 24px rgba(0,0,0,0.4);" />`;
    } else if (ehPdf) {
      conteudo = `<iframe src="${nota.dataUrl}" title="${_esc(nota.nome)}"
        style="width:90vw;height:82vh;border:none;border-radius:6px;background:#fff;"></iframe>`;
    } else {
      // XML, ZIP, DOCX e afins: o navegador não renderiza inline
      conteudo = `
        <div style="background:var(--clr-surface);border-radius:12px;padding:40px;text-align:center;max-width:420px;">
          <div style="margin-bottom:14px;display:flex;justify-content:center;transform:scale(2.2);">${_iconePorTipo(nota.tipo, nota.nome)}</div>
          <div style="font-size:16px;font-weight:700;color:var(--clr-text);margin:22px 0 6px;word-break:break-word;">${_esc(nota.nome)}</div>
          <div style="font-size:13px;color:var(--clr-text-3);margin-bottom:20px;">
            Este tipo de arquivo não pode ser exibido na tela.<br>Use o botão abaixo para baixá-lo.
          </div>
          <button type="button" id="visDownloadCentro" class="btn-primary" style="font-size:13px;">
            ⤓ &nbsp;Baixar Arquivo
          </button>
        </div>`;
    }

    const overlay = document.createElement("div");
    overlay.id = "visualizadorNf";
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:10002;display:flex;flex-direction:column;";
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;background:rgba(0,0,0,0.4);">
        <div style="min-width:0;">
          <div style="color:#fff;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${_esc(nota.nome)}
          </div>
          <div style="color:rgba(255,255,255,0.6);font-size:12px;">
            NF ${_esc(nota.numeroNf || "—")} · ${_esc(nota.emitente || "—")}${nota.responsavel ? " · " + _esc(nota.responsavel) : ""}
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-shrink:0;">
          <button type="button" id="visBaixar" class="btn-secondary" style="font-size:13px;padding:7px 14px;">
            ⤓ &nbsp;Baixar
          </button>
          <button type="button" id="visFechar" class="btn-secondary" style="font-size:13px;padding:7px 14px;">
            ✕ &nbsp;Fechar
          </button>
        </div>
      </div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;">
        ${conteudo}
      </div>`;
    document.body.appendChild(overlay);

    const fechar = () => {
      overlay.remove();
      document.removeEventListener("keydown", onEsc);
    };
    const onEsc = (e) => { if (e.key === "Escape") fechar(); };
    document.addEventListener("keydown", onEsc);

    document.getElementById("visFechar").addEventListener("click", fechar);
    document.getElementById("visBaixar").addEventListener("click", () => _baixar(nota));
    const btnCentro = document.getElementById("visDownloadCentro");
    if (btnCentro) btnCentro.addEventListener("click", () => _baixar(nota));
  }

  // ══════════════════════════════════════════
  //  EDITAR NF
  // ══════════════════════════════════════════
  async function _abrirModalEditar(id) {
    // Busca o registro completo: precisamos do dataUrl caso o arquivo
    // não seja trocado (o put() sobrescreve o registro inteiro).
    let nota;
    try {
      nota = await NotaStore.obter(id);
    } catch (e) {
      console.error("Falha ao carregar a nota para edição:", e);
      showToast("Erro ao abrir a nota.", "error");
      return;
    }
    if (!nota) return showToast("Nota não encontrada.", "error");

    const ex = document.getElementById("modalEditarNf");
    if (ex) ex.remove();

    const pontoIdx = (nota.nome || "").lastIndexOf(".");
    const extensaoAtual = pontoIdx > 0 ? nota.nome.slice(pontoIdx) : "";
    const nomeBase = pontoIdx > 0 ? nota.nome.slice(0, pontoIdx) : nota.nome || "";

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalEditarNf";
    overlay.innerHTML = `
      <div class="modal" style="max-width:460px;width:90%;">
        <div class="modal-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>Editar Nota Fiscal</span>
          <button type="button" id="edNfX" style="background:transparent;border:none;color:var(--clr-text-3);font-size:22px;cursor:pointer;line-height:1;">✕</button>
        </div>

        <div class="nf-arquivo-info">
          ${_iconePorTipo(nota.tipo, nota.nome)}
          <div style="min-width:0;flex:1;">
            <div id="edArquivoNome" style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(nota.nome)}</div>
            <div id="edArquivoTam" style="font-size:11px;color:var(--clr-text-3);">${_fmtTamanho(nota.tamanho)} · anexado em ${_fmtData(nota.criadoEm)}</div>
          </div>
          <button type="button" class="nf-acao-btn" id="edTrocarArquivo" title="Substituir o arquivo" style="margin:0;flex-shrink:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            Trocar
          </button>
        </div>
        <input type="file" id="edInputArquivo" style="display:none;" />

        <div class="field-group" style="margin-bottom:var(--sp-md);">
          <label>Nome do arquivo <span style="color:var(--clr-danger);">*</span></label>
          <div style="display:flex;align-items:center;gap:6px;">
            <input type="text" id="edNome" class="input-field" value="${_esc(nomeBase)}" style="flex:1;" />
            <span id="edExtensao" style="color:var(--clr-text-3);font-size:13px;font-weight:600;flex-shrink:0;">${_esc(extensaoAtual)}</span>
          </div>
        </div>

        <div class="field-group" style="margin-bottom:var(--sp-md);">
          <label>Número da NF <span style="color:var(--clr-danger);">*</span></label>
          <input type="text" id="edNumero" class="input-field" value="${_esc(nota.numeroNf || "")}" placeholder="Ex: 687.957" inputmode="decimal" />
        </div>

        <div class="field-group" style="margin-bottom:var(--sp-md);">
          <label>Nome do emitente <span style="color:var(--clr-danger);">*</span></label>
          <input type="text" id="edEmitente" class="input-field" value="${_esc(nota.emitente || "")}" placeholder="Quem emitiu a nota (fornecedor)" />
        </div>

        <div class="field-group" style="margin-bottom:var(--sp-lg);">
          <label>Data</label>
          <input type="date" id="edData" class="input-field" value="${_dataParaInput(nota.criadoEm)}" />
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" id="edCancelar">Cancelar</button>
          <button class="btn-primary" id="edSalvar" style="padding:10px var(--sp-lg);font-size:14px;">Salvar Alterações</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const fechar = () => overlay.remove();
    document.getElementById("edNfX").addEventListener("click", fechar);
    document.getElementById("edCancelar").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });

    document.getElementById("edNumero").addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/[^\d.]/g, "");
    });

    // Substituir o arquivo (opcional)
    let arquivoNovo = null;
    let extensaoFinal = extensaoAtual;
    const inputArq = document.getElementById("edInputArquivo");

    document.getElementById("edTrocarArquivo").addEventListener("click", () => inputArq.click());

    inputArq.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) {
        inputArq.value = "";
        return showToast("Arquivo muito grande (máximo 50 MB).", "error");
      }
      arquivoNovo = file;
      const i = file.name.lastIndexOf(".");
      extensaoFinal = i > 0 ? file.name.slice(i) : "";

      document.getElementById("edArquivoNome").textContent = file.name;
      document.getElementById("edArquivoTam").textContent = `${_fmtTamanho(file.size)} · novo arquivo`;
      document.getElementById("edExtensao").textContent = extensaoFinal;
      showToast("Arquivo selecionado. Salve para confirmar.", "success");
    });

    const btnSalvar = document.getElementById("edSalvar");
    btnSalvar.addEventListener("click", async () => {
      if (btnSalvar.disabled) return;

      const nome = document.getElementById("edNome").value.trim();
      const numeroNf = document.getElementById("edNumero").value.trim();
      const emitente = document.getElementById("edEmitente").value.trim();
      const dataStr = document.getElementById("edData").value;

      if (!nome) return showToast("Informe o nome do arquivo.", "warning");
      if (!numeroNf) return showToast("Informe o número da NF.", "warning");
      if (!emitente) return showToast("Informe o nome do emitente.", "warning");

      btnSalvar.disabled = true;
      btnSalvar.textContent = "Salvando...";

      try {
        // Mantém o arquivo original, a menos que o usuário tenha trocado
        let dataUrl = nota.dataUrl;
        let tipo = nota.tipo;
        let tamanho = nota.tamanho;

        if (arquivoNovo) {
          dataUrl = await _lerArquivoBase64(arquivoNovo);
          tipo = arquivoNovo.type || "";
          tamanho = arquivoNovo.size;
        }

        await NotaStore.salvar({
          id: nota.id,
          empresaId: nota.empresaId,
          nome: nome + extensaoFinal,
          tipo,
          tamanho,
          numeroNf,
          emitente,
          criadoEm: _inputParaData(dataStr, nota.criadoEm),
          dataUrl,
        });

        fechar();
        await _carregarNotas();
        showToast("Nota fiscal atualizada!", "success");
      } catch (e) {
        console.error("Falha ao atualizar a nota:", e);
        if (typeof PrecifiqErros !== "undefined") {
          PrecifiqErros.registrar("Falha ao editar nota fiscal", String(e));
        }
        showToast(
          e && e.name === "QuotaExceededError"
            ? "Armazenamento cheio. Libere espaço e tente novamente."
            : "Erro ao salvar as alterações.",
          "error",
          5000,
        );
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar Alterações";
      }
    });
  }

  /** Converte timestamp → "AAAA-MM-DD" para o input[type=date] */
  function _dataParaInput(ts) {
    const d = ts ? new Date(ts) : new Date();
    if (isNaN(d.getTime())) return "";
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  /**
   * Converte "AAAA-MM-DD" → timestamp, preservando a hora original.
   * Sem isso, editar a nota zeraria o horário e bagunçaria a ordenação
   * de notas anexadas no mesmo dia.
   */
  function _inputParaData(str, tsOriginal) {
    if (!str) return tsOriginal || Date.now();
    const [a, m, d] = str.split("-").map(Number);
    if (!a || !m || !d) return tsOriginal || Date.now();
    const original = tsOriginal ? new Date(tsOriginal) : new Date();
    const nova = new Date(a, m - 1, d, original.getHours(), original.getMinutes(), original.getSeconds());
    return nova.getTime();
  }

  // ══════════════════════════════════════════
  //  EDITAR
  // ══════════════════════════════════════════
  async function _abrirModalEditar(id) {
    let nota;
    try {
      nota = await NotaStore.obter(id);
    } catch (e) {
      console.error("Falha ao carregar a nota:", e);
      showToast("Erro ao carregar a nota.", "error");
      return;
    }
    if (!nota) return showToast("Nota não encontrada.", "error");

    const ex = document.getElementById("modalEditarNf");
    if (ex) ex.remove();

    // Separa nome e extensão (a extensão é preservada, como no anexo)
    const pontoIdx = (nota.nome || "").lastIndexOf(".");
    const extensao = pontoIdx > 0 ? nota.nome.slice(pontoIdx) : "";
    const nomeBase = pontoIdx > 0 ? nota.nome.slice(0, pontoIdx) : nota.nome || "";

    // Data em formato aceito pelo input[type=date]
    const dataIso = nota.criadoEm ? new Date(nota.criadoEm).toISOString().slice(0, 10) : "";

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalEditarNf";
    overlay.innerHTML = `
      <div class="modal" style="max-width:470px;width:90%;">
        <div class="modal-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>Editar Nota Fiscal</span>
          <button type="button" id="edX" style="background:transparent;border:none;color:var(--clr-text-3);font-size:22px;cursor:pointer;line-height:1;">✕</button>
        </div>

        <div class="nf-arquivo-info">
          ${_iconePorTipo(nota.tipo, nota.nome)}
          <div style="min-width:0;flex:1;">
            <div id="edArquivoNome" style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(nota.nome)}</div>
            <div id="edArquivoTam" style="font-size:11px;color:var(--clr-text-3);">${_fmtTamanho(nota.tamanho)}</div>
          </div>
          <button type="button" class="btn-secondary" id="edTrocarArquivo" style="font-size:11px;padding:5px 10px;flex-shrink:0;white-space:nowrap;">
            Trocar arquivo
          </button>
        </div>
        <input type="file" id="edInputArquivo" style="display:none;" />

        <div class="field-group" style="margin-bottom:var(--sp-md);">
          <label>Nome do arquivo <span style="color:var(--clr-danger);">*</span></label>
          <div style="display:flex;align-items:center;gap:6px;">
            <input type="text" id="edNome" class="input-field" value="${_esc(nomeBase)}" style="flex:1;" />
            <span id="edExtensao" style="color:var(--clr-text-3);font-size:13px;font-weight:600;flex-shrink:0;">${_esc(extensao)}</span>
          </div>
        </div>

        <div class="field-group" style="margin-bottom:var(--sp-md);">
          <label>Número da NF <span style="color:var(--clr-danger);">*</span></label>
          <input type="text" id="edNumero" class="input-field" value="${_esc(nota.numeroNf || "")}" placeholder="Ex: 687.957" inputmode="decimal" />
        </div>

        <div class="field-group" style="margin-bottom:var(--sp-md);">
          <label>Nome do emitente <span style="color:var(--clr-danger);">*</span></label>
          <input type="text" id="edEmitente" class="input-field" value="${_esc(nota.emitente || "")}" placeholder="Quem emitiu a nota" />
        </div>

        <div class="field-group" style="margin-bottom:var(--sp-md);">
          <label for="edResponsavel">Responsável <span style="color:var(--clr-danger);">*</span></label>
          <select id="edResponsavel" class="input-field" title="Os usuários cadastrados em Dados da Empresa › Usuários e Senhas"></select>
        </div>

        <div class="field-group" style="margin-bottom:var(--sp-lg);">
          <label>Data</label>
          <input type="date" id="edData" class="input-field" value="${dataIso}" />
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" id="edCancelar">Cancelar</button>
          <button class="btn-primary" id="edSalvar" style="padding:10px var(--sp-lg);font-size:14px;">Salvar Alterações</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const fechar = () => overlay.remove();
    document.getElementById("edX").addEventListener("click", fechar);
    document.getElementById("edCancelar").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });

    // Só dígitos e ponto no número da NF
    document.getElementById("edNumero").addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/[^\d.]/g, "");
    });

    // Trocar o arquivo (opcional): guarda o novo até salvar
    let novoArquivo = null;
    let novaExtensao = extensao;
    const inputArq = document.getElementById("edInputArquivo");
    document.getElementById("edTrocarArquivo").addEventListener("click", () => inputArq.click());
    inputArq.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) {
        inputArq.value = "";
        return showToast("Arquivo muito grande (máximo 50 MB).", "error");
      }
      novoArquivo = file;
      const pi = file.name.lastIndexOf(".");
      novaExtensao = pi > 0 ? file.name.slice(pi) : "";
      document.getElementById("edArquivoNome").textContent = file.name;
      document.getElementById("edArquivoTam").textContent = _fmtTamanho(file.size) + " · novo arquivo";
      document.getElementById("edExtensao").textContent = novaExtensao;
    });

    // Responsável: um dos usuários cadastrados; vem escolhido o da nota.
    const selResp = document.getElementById("edResponsavel");
    if (window.BapellUsuarios) window.BapellUsuarios.preencherSelect(selResp, { valor: nota.responsavel || "", vazio: "Selecione o responsável" });

    const btnSalvar = document.getElementById("edSalvar");
    btnSalvar.addEventListener("click", async () => {
      if (btnSalvar.disabled) return;

      const nome = document.getElementById("edNome").value.trim();
      const numeroNf = document.getElementById("edNumero").value.trim();
      const emitente = document.getElementById("edEmitente").value.trim();
      const dataStr = document.getElementById("edData").value;

      if (_semUsuarios(selResp)) return;
      if (!_exigir([
        { el: document.getElementById("edNome"), msg: "Informe o nome do arquivo." },
        { el: document.getElementById("edNumero"), msg: "Informe o número da NF." },
        { el: document.getElementById("edEmitente"), msg: "Informe o nome do emitente." },
        { el: selResp, msg: "Escolha o responsável." },
      ])) return;

      // Quem tem senha só salva digitando a própria senha.
      btnSalvar.disabled = true;
      const usuario = await _confirmarResponsavel(selResp, "salvar a alteração desta nota");
      if (!usuario) { btnSalvar.disabled = false; return; }
      // A janela foi fechada enquanto a senha era pedida: não grava.
      if (!overlay.isConnected) return;

      btnSalvar.textContent = "Salvando...";

      try {
        // Preserva o horário original; troca só a data se o usuário mexeu nela
        let criadoEm = nota.criadoEm;
        if (dataStr) {
          const [a, m, d] = dataStr.split("-").map(Number);
          const orig = new Date(nota.criadoEm || Date.now());
          criadoEm = new Date(a, m - 1, d, orig.getHours(), orig.getMinutes()).getTime();
        }

        const atualizado = {
          ...nota,
          nome: nome + novaExtensao,
          numeroNf,
          emitente,
          responsavel: usuario.nome,
          criadoEm,
          editadoEm: Date.now(),
        };

        // Se trocou o arquivo, substitui conteúdo, tipo e tamanho
        if (novoArquivo) {
          atualizado.dataUrl = await _lerArquivoBase64(novoArquivo);
          atualizado.tipo = novoArquivo.type || "";
          atualizado.tamanho = novoArquivo.size;
        }

        await NotaStore.salvar(atualizado);
        fechar();
        await _carregarNotas();
        showToast("Nota atualizada!", "success");
      } catch (e) {
        console.error("Falha ao atualizar a nota:", e);
        if (typeof PrecifiqErros !== "undefined") {
          PrecifiqErros.registrar("Falha ao atualizar nota fiscal", String(e));
        }
        showToast(
          e && e.name === "QuotaExceededError"
            ? "Armazenamento cheio. Libere espaço e tente novamente."
            : "Erro ao salvar as alterações.",
          "error",
          5000,
        );
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar Alterações";
      }
    });
  }

  // ══════════════════════════════════════════
  //  EXCLUIR
  // ══════════════════════════════════════════
  function _confirmarExclusao(id) {
    const nota = notas.find((n) => n.id === id);
    if (!nota) return;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px;width:90%;">
        <div class="modal-title">Excluir nota fiscal?</div>
        <div class="modal-subtitle" style="margin-bottom:var(--sp-lg);">
          O arquivo <strong>${_esc(nota.nome)}</strong>
          (NF ${_esc(nota.numeroNf || "—")}) será apagado permanentemente.
          Esta ação não pode ser desfeita.
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="cancelExcNf">Cancelar</button>
          <button class="btn-danger" id="confExcNf" style="padding:10px var(--sp-lg);font-size:14px;">Sim, excluir</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const fechar = () => overlay.remove();
    overlay.querySelector("#cancelExcNf").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });

    overlay.querySelector("#confExcNf").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await NotaStore.remover(id);
        fechar();
        await _carregarNotas();
        showToast("Nota fiscal excluída.", "warning");
      } catch (err) {
        console.error("Falha ao excluir a nota:", err);
        showToast("Erro ao excluir a nota.", "error");
        btn.disabled = false;
      }
    });
  }

  // ══════════════════════════════════════════
  //  MODAL: ADICIONAR EMPRESA
  // ══════════════════════════════════════════
  function _redimensionarImagem(file, maxLado, callback) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > maxLado || h > maxLado) {
          const escala = maxLado / Math.max(w, h);
          w = Math.round(w * escala);
          h = Math.round(h * escala);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL("image/png"));
      };
      img.onerror = () => showToast("Não foi possível ler a imagem.", "error");
      img.src = ev.target.result;
    };
    reader.onerror = () => showToast("Falha ao ler o arquivo.", "error");
    reader.readAsDataURL(file);
  }

  function _abrirModalAddEmpresa() {
    const ex = document.getElementById("modalAddEmpNf");
    if (ex) ex.remove();

    // Item 6: as empresas vêm do cadastro central (precifiq_empresa). Aqui só
    // escolhemos uma delas; criar empresa nova é feito na tela Empresas.
    let cadastradas = [];
    try {
      const raw = JSON.parse(localStorage.getItem(EMPRESA_KEY_NF));
      if (raw && Array.isArray(raw.empresas)) {
        cadastradas = raw.empresas.map((e, i) => ({
          id: e.id,
          nome: e.nomeAba || e.nomeFantasia || e.razaoSocial || `Empresa ${i + 1}`,
          cnpj: e.cnpj || "",
          logo: e.logo || "",
        }));
      }
    } catch (e) {}

    // Já selecionável no aside? Todas as cadastradas aparecem no aside, mas o
    // modal serve para reforçar a escolha. Mostramos todas (o clique seleciona).
    const listaHtml = cadastradas.length
      ? cadastradas.map((e, i) => `
          <div class="add-emp-nf-item" data-idx="${i}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--clr-surface-alt);border:1px solid var(--clr-border);border-radius:var(--r-md);cursor:pointer;margin-bottom:6px;">
            ${_logoMini(e.logo, 30)}
            <div style="min-width:0;flex:1;">
              <div style="font-size:14px;font-weight:600;color:var(--clr-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(e.nome)}</div>
              ${e.cnpj ? `<div style="font-size:11px;color:var(--clr-text-3);">${_esc(_fmtCNPJ(e.cnpj))}</div>` : ""}
            </div>
            <span style="font-size:11px;color:var(--clr-primary);font-weight:700;flex-shrink:0;">Usar</span>
          </div>`).join("")
      : `<div style="font-size:13px;color:var(--clr-text-3);text-align:center;padding:12px;">Nenhuma empresa cadastrada ainda.</div>`;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalAddEmpNf";
    overlay.innerHTML = `
      <div class="modal" style="max-width:460px;width:90%;max-height:85vh;display:flex;flex-direction:column;">
        <div class="modal-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>Adicionar Empresa</span>
          <button type="button" id="addEmpNfX" style="background:transparent;border:none;color:var(--clr-text-3);font-size:22px;cursor:pointer;line-height:1;">✕</button>
        </div>
        <div style="overflow-y:auto;flex:1;margin:12px 0;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--clr-text-3);margin-bottom:8px;">Empresas cadastradas</div>
          ${listaHtml}
          <div style="font-size:12px;color:var(--clr-text-2);background:var(--clr-surface-alt);border:1px solid var(--clr-border);border-radius:var(--r-md);padding:11px 13px;margin-top:14px;line-height:1.5;">
            As empresas ficam centralizadas no cadastro. Para criar uma nova,
            acesse a tela <strong>Dados da Empresa</strong>.
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="addEmpNfCancelar">Cancelar</button>
          <button class="btn-primary" id="addEmpNfCadastrar" style="padding:10px var(--sp-lg);font-size:14px;">Cadastrar nova empresa</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const fechar = () => overlay.remove();
    document.getElementById("addEmpNfX").addEventListener("click", fechar);
    document.getElementById("addEmpNfCancelar").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });

    // Escolher uma cadastrada → seleciona no arquivo de NF
    overlay.querySelectorAll(".add-emp-nf-item").forEach((el) => {
      el.addEventListener("click", () => {
        const emp = cadastradas[parseInt(el.dataset.idx)];
        fechar();
        _selecionarEmpresa({ ...emp, origem: "cadastro" });
      });
    });

    // Cadastrar nova → vai para a tela de Empresas
    document.getElementById("addEmpNfCadastrar").addEventListener("click", () => {
      window.location.href = "empresa.html";
    });
  }

  // ══════════════════════════════════════════
  //  LISTENERS
  // ══════════════════════════════════════════
  const inputArquivo = document.getElementById("inputArquivoNf");

  document.getElementById("btnAddNf").addEventListener("click", () => {
    if (!empresaSelecionada) return showToast("Selecione uma empresa primeiro.", "warning");
    inputArquivo.click();
  });

  inputArquivo.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // 50 MB: acima disso o base64 no IndexedDB fica impraticável
    if (file.size > 50 * 1024 * 1024) {
      showToast("Arquivo muito grande (máximo 50 MB).", "error");
      inputArquivo.value = "";
      return;
    }
    _abrirModalAddNf(file);
  });

  let buscaTimer;
  document.getElementById("inpBuscaNf").addEventListener("input", () => {
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(_renderNotas, 200);
  });

  document.getElementById("btnAddEmpresa").addEventListener("click", _abrirModalAddEmpresa);

  // Estado do menu lateral
  (function _aplicarEstadoSidebar() {
    const colapsado = localStorage.getItem("precifiq_sidebar_colapsada") === "1";
    const sb = document.getElementById("sidebar");
    if (sb) sb.classList.toggle("sidebar-colapsada", colapsado);
    document.body.classList.toggle("sidebar-colapsada-body", colapsado);
  })();

  _renderEmpresas();

  // Já entra com a primeira empresa selecionada — evita a tela vazia
  (function _selecionarPrimeira() {
    const empresas = _todasEmpresas();
    if (empresas.length > 0) _selecionarEmpresa(empresas[0]);
  })();
});

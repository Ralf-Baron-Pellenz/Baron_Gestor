// ═══════════════════════════════════════════
//  Bapell Gestor Pro — ean.js
//  Gerador de códigos EAN-13 (uso interno)
// ═══════════════════════════════════════════

const EAN_LS_KEY = "precifiq_eans";
const EMPRESA_KEY = "precifiq_empresa";

document.addEventListener("DOMContentLoaded", () => {
  if (typeof setDateHeader === "function") setDateHeader();

  // ══════════════════════════════════════════
  //  ALGORITMO EAN-13
  // ══════════════════════════════════════════

  /**
   * Dígito verificador do EAN-13 (algoritmo oficial GS1).
   * Soma ponderada dos 12 primeiros dígitos: peso 1 nas posições ímpares
   * (índice par) e peso 3 nas pares. DV = (10 - soma % 10) % 10.
   */
  function _dvEAN13(doze) {
    if (!/^\d{12}$/.test(doze)) return null;
    let soma = 0;
    for (let i = 0; i < 12; i++) {
      const d = parseInt(doze[i], 10);
      soma += i % 2 === 0 ? d : d * 3;
    }
    return (10 - (soma % 10)) % 10;
  }

  /**
   * Extrai o prefixo de 4 dígitos do CNPJ (posições 5 a 8 da raiz).
   * CNPJ alfanumérico (com letras na raiz): cada letra vira um dígito pelo
   * mesmo valor do cálculo dos dígitos verificadores (código ASCII − 48),
   * ficando com a unidade (A = 17 → 7, B = 18 → 8…). O CNPJ só de números
   * passa pelo caminho de sempre — o prefixo dele não muda, e os códigos já
   * gerados (e impressos) continuam batendo.
   */
  function _prefixoEmpresa(cnpj) {
    const c = window.BapellDoc
      ? window.BapellDoc.limpar(cnpj)
      : String(cnpj || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    if (/[A-Z]/.test(c)) {
      // Com letras, só o CNPJ alfanumérico completo forma o prefixo — um
      // pela metade fica como "sem CNPJ válido".
      if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return null;
      return c.slice(4, 8).split("").map((ch) => String((ch.charCodeAt(0) - 48) % 10)).join("");
    }
    const d = String(cnpj || "").replace(/\D/g, "");
    if (d.length < 8) return null;
    return d.slice(4, 8);
  }

  /**
   * Monta um EAN-13: 789 (Brasil) + prefixo do CNPJ (4) + item (5) + DV (1)
   * @returns {string|null} o código, ou null se os dados forem inválidos
   */
  function gerarEAN(cnpj, sequencial) {
    const pref = _prefixoEmpresa(cnpj);
    if (!pref) return null;
    const n = parseInt(sequencial, 10);
    if (!isFinite(n) || n < 0 || n > 99999) return null;
    const item = String(n).padStart(5, "0");
    const doze = "789" + pref + item;
    const dv = _dvEAN13(doze);
    if (dv === null) return null;
    return doze + dv;
  }

  /** Valida um EAN-13 completo (confere o dígito verificador) */
  function validarEAN(ean) {
    const s = String(ean || "").replace(/\D/g, "");
    if (s.length !== 13) return false;
    return _dvEAN13(s.slice(0, 12)) === parseInt(s[12], 10);
  }

  // ══════════════════════════════════════════
  //  ARMAZENAMENTO
  // ══════════════════════════════════════════

  // { [empresaId]: { proximoSeq: number, codigos: [{id, sku, ean, criadoEm, oculto}] } }
  function _carregar() {
    try {
      const raw = JSON.parse(localStorage.getItem(EAN_LS_KEY));
      if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
    } catch {}
    return {};
  }

  function _salvar(dados) {
    try {
      localStorage.setItem(EAN_LS_KEY, JSON.stringify(dados));
      return true;
    } catch (e) {
      console.error("Falha ao salvar EANs:", e);
      if (typeof PrecifiqErros !== "undefined") {
        PrecifiqErros.registrar("Falha ao salvar EANs", String(e));
      }
      showToast("Não foi possível salvar. Verifique o espaço disponível.", "error");
      return false;
    }
  }

  /** Lê as empresas cadastradas em "Dados da Empresa" */
  function _carregarEmpresas() {
    try {
      const raw = JSON.parse(localStorage.getItem(EMPRESA_KEY));
      if (raw && Array.isArray(raw.empresas)) return raw.empresas;
    } catch {}
    return [];
  }

  /** Empresas avulsas criadas nesta tela (com CNPJ próprio) */
  function _carregarEmpresasLocais() {
    const d = _carregar();
    return Array.isArray(d._empresasLocais) ? d._empresasLocais : [];
  }

  /** Todas as empresas: as de "Dados da Empresa" + as criadas aqui */
  function _todasEmpresas() {
    const cadastradas = _carregarEmpresas().map((e, i) => ({
      id: e.id,
      nome: e.nomeAba || e.nomeFantasia || e.razaoSocial || `Empresa ${i + 1}`,
      cnpj: e.cnpj || "",
      logo: e.logo || "",
      origem: "cadastro",
    }));
    const locais = _carregarEmpresasLocais().map((e) => ({ ...e, origem: "local" }));
    return cadastradas.concat(locais);
  }

  // ══════════════════════════════════════════
  //  ESTADO
  // ══════════════════════════════════════════
  let dados = _carregar();
  let empresaSelecionada = null;

  const _esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const _genId = () =>
    (typeof generateId === "function" ? generateId() : "id_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));

  // Campo obrigatório vazio (ou que não confere): fica vermelho até ser
  // corrigido (utils.js) e recebe o foco. `msg` aparece embaixo do campo.
  function _marcarErro(el, msg, resolvido) {
    if (!el) return;
    if (window.BapellCampos) {
      window.BapellCampos.marcar(el, msg || null, resolvido ? { resolvido } : undefined);
      window.BapellCampos.focar(el);
    } else {
      try { el.focus(); } catch (e) {}
    }
  }

  function _fmtCNPJ(cnpj) {
    // Alfanumérico (letras na raiz): o formato compartilhado do utils.js.
    const c = String(cnpj || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    if (/[A-Z]/.test(c) && c.length === 14 && window.BapellDoc) return window.BapellDoc.formatarCNPJ(c);
    const d = String(cnpj || "").replace(/\D/g, "");
    if (d.length !== 14) return cnpj || "";
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }

  function _fmtData(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function _logoMini(logo, size) {
    const s = size || 30;
    if (logo) {
      return `<img src="${_esc(logo)}" alt="" style="width:${s}px;height:${s}px;border-radius:6px;object-fit:cover;border:1px solid var(--clr-border);flex-shrink:0;" />`;
    }
    return `<span style="width:${s}px;height:${s}px;border-radius:6px;background:var(--clr-surface-alt);border:1px solid var(--clr-border);display:inline-flex;align-items:center;justify-content:center;color:var(--clr-text-3);flex-shrink:0;"><svg width="${Math.round(s * 0.55)}" height="${Math.round(s * 0.55)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V7l8-4v18"></path><path d="M19 21V11l-6-4"></path></svg></span>`;
  }

  // ══════════════════════════════════════════
  //  ASIDE — LISTA DE EMPRESAS
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
        const semCnpj = !_prefixoEmpresa(e.cnpj);
        return `
        <button type="button" class="empresa-item-btn ${ativa ? "ativa" : ""}" data-emp-id="${_esc(e.id)}"
                title="${_esc(e.nome)}${semCnpj ? " — sem CNPJ válido" : ""}">
          ${_logoMini(e.logo, 30)}
          <span class="sidebar-label-txt empresa-item-nome">${_esc(e.nome)}</span>
          ${semCnpj ? `<span class="sidebar-label-txt" title="CNPJ ausente ou inválido" style="margin-left:auto;color:var(--clr-warning);font-size:14px;flex-shrink:0;">!</span>` : ""}
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

  function _selecionarEmpresa(emp) {
    empresaSelecionada = emp;

    document.getElementById("eanVazio").style.display = "none";
    document.getElementById("eanConteudo").style.display = "block";

    const inpCnpj = document.getElementById("inpCnpj");
    inpCnpj.value = _fmtCNPJ(emp.cnpj) || "(sem CNPJ)";

    const semPrefixo = !_prefixoEmpresa(emp.cnpj);
    const btnGerar = document.getElementById("btnGerarEan");
    btnGerar.disabled = semPrefixo;
    document.getElementById("avisoSemCnpj").style.display = semPrefixo ? "flex" : "none";

    document.getElementById("tituloEmpresa").textContent = emp.nome;

    _renderEmpresas();
    _renderLista();
  }

  // ══════════════════════════════════════════
  //  GERAÇÃO
  // ══════════════════════════════════════════
  function _storeEmpresa(empId) {
    if (!dados[empId]) dados[empId] = { proximoSeq: 1, codigos: [] };
    if (!Array.isArray(dados[empId].codigos)) dados[empId].codigos = [];
    if (!isFinite(dados[empId].proximoSeq)) dados[empId].proximoSeq = 1;
    return dados[empId];
  }

  function _gerar() {
    if (!empresaSelecionada) return;

    const sku = document.getElementById("inpSku").value.trim();
    if (!sku) {
      showToast("Informe o SKU do produto.", "warning");
      _marcarErro(document.getElementById("inpSku"));
      return;
    }

    // ── Read-before-write (CRÍTICO) ──
    // Um EAN gerado aqui pode virar uma ETIQUETA IMPRESSA. Se duas abas lerem
    // proximoSeq=5 ao mesmo tempo, as duas gerariam o MESMO código para
    // produtos diferentes — dois rótulos físicos idênticos. Então relemos o
    // disco agora e mesclamos, garantindo que o proximoSeq considere o que a
    // outra aba já avançou.
    dados = _mesclarComDisco(dados);
    const store = _storeEmpresa(empresaSelecionada.id);

    // proximoSeq real = o maior entre o contador salvo e (maior sequência já
    // usada + 1). Assim, mesmo que o contador tenha ficado para trás, nunca
    // reusamos um número já emitido.
    store.proximoSeq = _proximoSeqSeguro(store);

    // SKU já tem código?
    const existente = store.codigos.find((c) => (c.sku || "").toLowerCase() === sku.toLowerCase());
    if (existente) {
      showToast(`Este SKU já tem o EAN ${existente.ean}.`, "warning", 4000);
      return;
    }

    if (store.proximoSeq > 99999) {
      showToast("Limite de 99.999 códigos atingido para esta empresa.", "error");
      return;
    }

    const ean = gerarEAN(empresaSelecionada.cnpj, store.proximoSeq);
    if (!ean) {
      showToast("Não foi possível gerar: CNPJ inválido.", "error");
      return;
    }

    // Rede extra: se por qualquer motivo este EAN já existir nesta empresa,
    // avança até um livre (não emite duplicado).
    if (store.codigos.some((c) => c.ean === ean)) {
      showToast("Conflito de sequência detectado. Tente gerar novamente.", "warning");
      store.proximoSeq++;
      _salvar(dados);
      return;
    }

    store.codigos.unshift({
      id: _genId(),
      sku,
      ean,
      criadoEm: Date.now(),
      oculto: false,
    });
    store.proximoSeq++;

    if (!_salvar(dados)) return;

    document.getElementById("inpSku").value = "";
    _renderLista();
    showToast(`EAN ${ean} gerado!`, "success");
  }

  // Mescla o `dados` em memória com o que está no disco (outra aba pode ter
  // gerado códigos). Para cada empresa: une os códigos por ean e mantém o
  // maior proximoSeq. Preserva _empresasLocais.
  function _mesclarComDisco(mem) {
    let disco = null;
    try { disco = JSON.parse(localStorage.getItem(EAN_LS_KEY)); } catch (_) { disco = null; }
    if (!disco || typeof disco !== "object" || Array.isArray(disco)) return mem;

    const out = Object.assign({}, disco, mem); // base disco, mem por cima

    Object.keys(disco).forEach((empId) => {
      if (empId === "_empresasLocais") return;
      const dDisco = disco[empId];
      const dMem = mem[empId];
      if (!dMem) { out[empId] = dDisco; return; }
      if (!dDisco) return;

      // une códigos por ean (sem duplicar)
      const porEan = new Map();
      (Array.isArray(dDisco.codigos) ? dDisco.codigos : []).forEach((c) => { if (c && c.ean) porEan.set(c.ean, c); });
      (Array.isArray(dMem.codigos) ? dMem.codigos : []).forEach((c) => { if (c && c.ean) porEan.set(c.ean, c); });
      const codigos = Array.from(porEan.values()).sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));

      out[empId] = {
        proximoSeq: Math.max(Number(dDisco.proximoSeq) || 1, Number(dMem.proximoSeq) || 1),
        codigos,
      };
    });

    // _empresasLocais: união por cnpj
    const locDisco = Array.isArray(disco._empresasLocais) ? disco._empresasLocais : [];
    const locMem = Array.isArray(mem._empresasLocais) ? mem._empresasLocais : [];
    if (locDisco.length || locMem.length) {
      const porCnpj = new Map();
      locDisco.concat(locMem).forEach((e) => { if (e && e.cnpj) porCnpj.set(e.cnpj, e); });
      out._empresasLocais = Array.from(porCnpj.values());
    }

    return out;
  }

  // Calcula um proximoSeq que NUNCA reusa: o maior entre o contador e a maior
  // sequência já usada + 1. A sequência é extraída do próprio EAN.
  function _proximoSeqSeguro(store) {
    let maiorUsada = 0;
    (Array.isArray(store.codigos) ? store.codigos : []).forEach((c) => {
      const seq = _seqDoEan(c && c.ean);
      if (seq > maiorUsada) maiorUsada = seq;
    });
    const contador = Number(store.proximoSeq) || 1;
    return Math.max(contador, maiorUsada + 1);
  }

  // Extrai o número de sequência embutido no EAN (os 5 dígitos antes do DV).
  function _seqDoEan(ean) {
    if (typeof ean !== "string" || ean.length !== 13) return 0;
    const seq = parseInt(ean.slice(7, 12), 10);
    return isFinite(seq) ? seq : 0;
  }

  // ══════════════════════════════════════════
  //  LISTA DE CÓDIGOS
  // ══════════════════════════════════════════
  function _renderLista() {
    const tbody = document.getElementById("listaEans");
    const vazio = document.getElementById("listaVazia");
    if (!tbody || !empresaSelecionada) return;

    const store = _storeEmpresa(empresaSelecionada.id);
    const busca = (document.getElementById("inpBusca").value || "").trim().toLowerCase();

    const visiveis = store.codigos
      .filter((c) => !c.oculto)
      .filter((c) => !busca || c.sku.toLowerCase().includes(busca) || c.ean.includes(busca));

    // Contador de ocultos
    const qtdOcultos = store.codigos.filter((c) => c.oculto).length;
    const badge = document.getElementById("badgeOcultos");
    if (badge) {
      badge.textContent = qtdOcultos;
      badge.style.display = qtdOcultos > 0 ? "inline-block" : "none";
    }

    tbody.innerHTML = "";
    vazio.style.display = visiveis.length === 0 ? "block" : "none";
    vazio.textContent = busca
      ? `Nenhum código encontrado para "${busca}".`
      : "Nenhum EAN gerado ainda. Informe um SKU e clique em Gerar EAN.";

    visiveis.forEach((c) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="white-space:nowrap;">${_esc(_fmtCNPJ(empresaSelecionada.cnpj))}</td>
        <td><strong>${_esc(c.sku)}</strong></td>
        <td style="white-space:nowrap;color:var(--clr-text-3);font-size:12px;">${_fmtData(c.criadoEm)}</td>
        <td style="font-family:monospace;font-size:14px;font-weight:700;letter-spacing:0.5px;">${_esc(c.ean)}</td>
        <td style="white-space:nowrap;">
          <button class="btn-copiar" data-ean="${_esc(c.ean)}" title="Copiar código">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Copiar
          </button>
        </td>
        <td style="text-align:right;position:relative;">
          <button class="ean-menu-btn" title="Opções" data-id="${_esc(c.id)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="12" cy="19" r="1.6"></circle></svg>
          </button>
          <div class="ean-menu-drop" style="display:none;">
            <button class="ean-menu-item" data-acao="ocultar" data-id="${_esc(c.id)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
              Ocultar
            </button>
            <button class="ean-menu-item danger" data-acao="excluir" data-id="${_esc(c.id)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Excluir
            </button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });

    _ligarAcoesLinha(tbody);
  }

  /**
   * Ancora um menu suspenso ao botão que o abriu.
   * Usa position:fixed porque a tabela e o modal têm overflow que
   * recortariam um dropdown posicionado de forma absoluta.
   */
  function _posicionarMenu(btn, drop) {
    const r = btn.getBoundingClientRect();
    const d = drop.getBoundingClientRect();
    const m = 6;

    let left = r.right - d.width;
    if (left < m) left = m;
    if (left + d.width > window.innerWidth - m) left = window.innerWidth - d.width - m;

    let top = r.bottom + 4;
    // Se não couber embaixo, abre para cima
    if (top + d.height > window.innerHeight - m) top = r.top - d.height - 4;
    if (top < m) top = m;

    drop.style.left = left + "px";
    drop.style.top = top + "px";

    // Correção: se um ancestral (ex.: .modal-overlay com backdrop-filter) virou
    // "bloco de contêiner", o position:fixed passa a ser relativo a ele — e não
    // ao viewport —, jogando o menu pro canto. Medimos onde ele realmente caiu
    // e compensamos a diferença para voltar às coordenadas de viewport.
    const depois = drop.getBoundingClientRect();
    const dx = depois.left - left;
    const dy = depois.top - top;
    if (dx || dy) {
      drop.style.left = left - dx + "px";
      drop.style.top = top - dy + "px";
    }
  }

  function _ligarAcoesLinha(container) {
    container.querySelectorAll(".btn-copiar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ean = btn.dataset.ean;
        try {
          await navigator.clipboard.writeText(ean);
          const original = btn.innerHTML;
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copiado`;
          setTimeout(() => (btn.innerHTML = original), 1500);
        } catch {
          showToast("Não foi possível copiar.", "error");
        }
      });
    });

    // Menu de 3 pontinhos
    // A tabela tem overflow-x:auto, que RECORTA um dropdown absoluto.
    // Por isso o menu usa position:fixed, com a posição calculada na abertura.
    container.querySelectorAll(".ean-menu-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const drop = btn.nextElementSibling;
        const abrindo = drop.style.display === "none";

        // Fecha todos os outros
        document.querySelectorAll(".ean-menu-drop").forEach((d) => (d.style.display = "none"));
        if (!abrindo) return;

        drop.style.display = "block";
        _posicionarMenu(btn, drop);
      });
    });

    container.querySelectorAll(".ean-menu-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = item.dataset.id;
        const acao = item.dataset.acao;
        item.closest(".ean-menu-drop").style.display = "none";
        if (acao === "ocultar") _ocultar(id, true);
        else if (acao === "excluir") _confirmarExclusao(id);
      });
    });
  }

  // Fecha menus ao clicar fora
  document.addEventListener("click", () => {
    document.querySelectorAll(".ean-menu-drop").forEach((d) => (d.style.display = "none"));
  });

  function _ocultar(id, oculto) {
    const store = _storeEmpresa(empresaSelecionada.id);
    const c = store.codigos.find((x) => x.id === id);
    if (!c) return;
    c.oculto = oculto;
    if (!_salvar(dados)) return;
    _renderLista();
    _renderModalOcultos();
    showToast(oculto ? "Código ocultado." : "Código restaurado.", "success");
  }

  function _confirmarExclusao(id) {
    const store = _storeEmpresa(empresaSelecionada.id);
    const c = store.codigos.find((x) => x.id === id);
    if (!c) return;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px;width:90%;">
        <div class="modal-title">Excluir EAN?</div>
        <div class="modal-subtitle" style="margin-bottom:var(--sp-lg);">
          O código <strong style="font-family:monospace;">${_esc(c.ean)}</strong>
          do SKU <strong>${_esc(c.sku)}</strong> será apagado.
          O número não será reutilizado. Esta ação não pode ser desfeita.
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="cancelExc">Cancelar</button>
          <button class="btn-danger" id="confExc" style="padding:10px var(--sp-lg);font-size:14px;">Sim, excluir</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const fechar = () => overlay.remove();
    overlay.querySelector("#cancelExc").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
    overlay.querySelector("#confExc").addEventListener("click", () => {
      store.codigos = store.codigos.filter((x) => x.id !== id);
      if (!_salvar(dados)) return;
      fechar();
      _renderLista();
      _renderModalOcultos();
      showToast("EAN excluído.", "warning");
    });
  }

  // ══════════════════════════════════════════
  //  MODAL: EANs OCULTOS
  // ══════════════════════════════════════════
  function _abrirModalOcultos() {
    if (!empresaSelecionada) return;
    document.getElementById("modalOcultos").style.display = "flex";
    _renderModalOcultos();
  }

  function _renderModalOcultos() {
    const cont = document.getElementById("listaOcultos");
    if (!cont || !empresaSelecionada) return;

    const store = _storeEmpresa(empresaSelecionada.id);
    const ocultos = store.codigos.filter((c) => c.oculto);

    if (ocultos.length === 0) {
      cont.innerHTML = `<div style="text-align:center;padding:30px;color:var(--clr-text-3);font-size:13px;">Nenhum código oculto.</div>`;
      return;
    }

    cont.innerHTML = ocultos
      .map(
        (c) => `
      <div class="oculto-linha">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:13px;">${_esc(c.sku)}</div>
          <div style="font-family:monospace;font-size:13px;color:var(--clr-text-2);">${_esc(c.ean)}</div>
          <div style="font-size:11px;color:var(--clr-text-3);">${_fmtData(c.criadoEm)}</div>
        </div>
        <div style="position:relative;flex-shrink:0;">
          <button class="ean-menu-btn" data-id="${_esc(c.id)}" title="Opções">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="12" cy="19" r="1.6"></circle></svg>
          </button>
          <div class="ean-menu-drop" style="display:none;">
            <button class="ean-menu-item" data-acao="desocultar" data-id="${_esc(c.id)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              Desocultar
            </button>
            <button class="ean-menu-item danger" data-acao="excluir" data-id="${_esc(c.id)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Excluir
            </button>
          </div>
        </div>
      </div>`,
      )
      .join("");

    cont.querySelectorAll(".ean-menu-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const drop = btn.nextElementSibling;
        const abrindo = drop.style.display === "none";
        document.querySelectorAll(".ean-menu-drop").forEach((d) => (d.style.display = "none"));
        if (!abrindo) return;
        drop.style.display = "block";
        _posicionarMenu(btn, drop);
      });
    });

    cont.querySelectorAll(".ean-menu-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = item.dataset.id;
        item.closest(".ean-menu-drop").style.display = "none";
        if (item.dataset.acao === "desocultar") _ocultar(id, false);
        else _confirmarExclusao(id);
      });
    });
  }

  // ══════════════════════════════════════════
  //  MODAL: ADICIONAR EMPRESA
  // ══════════════════════════════════════════
  function _abrirModalAddEmpresa() {
    const ex = document.getElementById("modalAddEmp");
    if (ex) ex.remove();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalAddEmp";
    overlay.innerHTML = `
      <div class="modal" style="max-width:440px;width:90%;">
        <div class="modal-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>Adicionar Empresa</span>
          <button type="button" id="addEmpX" style="background:transparent;border:none;color:var(--clr-text-3);font-size:22px;cursor:pointer;line-height:1;">✕</button>
        </div>
        <div class="modal-subtitle" style="margin-bottom:var(--sp-md);">
          Esta empresa fica disponível apenas no gerador de EAN.
        </div>

        <div class="field-group" style="margin-bottom:var(--sp-md);">
          <label>Nome da empresa <span style="color:var(--clr-danger);">*</span></label>
          <input type="text" id="novaEmpNome" class="input-field" placeholder="Ex: Minha Loja LTDA" />
        </div>

        <div class="field-group" style="margin-bottom:var(--sp-md);">
          <label>CNPJ <span style="color:var(--clr-danger);">*</span></label>
          <input type="text" id="novaEmpCnpj" class="input-field" placeholder="00.000.000/0000-00" maxlength="18" />
          <small id="cnpjHint" style="font-size:11px;color:var(--clr-text-3);margin-top:4px;display:block;">Usado para formar o prefixo do código.</small>
        </div>

        <div class="field-group" style="margin-bottom:var(--sp-lg);">
          <label>Logo (opcional)</label>
          <div style="display:flex;align-items:center;gap:12px;">
            <span id="novaEmpPreview">${_logoMini("", 44)}</span>
            <input type="file" id="novaEmpLogo" accept="image/*" class="input-field" style="flex:1;" />
          </div>
          <small style="font-size:11px;color:var(--clr-text-3);margin-top:4px;display:block;">A imagem é redimensionada automaticamente.</small>
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" id="addEmpCancelar">Cancelar</button>
          <button class="btn-primary" id="addEmpSalvar" style="padding:10px var(--sp-lg);font-size:14px;">Adicionar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const fechar = () => overlay.remove();
    document.getElementById("addEmpX").addEventListener("click", fechar);
    document.getElementById("addEmpCancelar").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });

    // Máscara de CNPJ
    const inpCnpj = document.getElementById("novaEmpCnpj");
    const hint = document.getElementById("cnpjHint");
    // CNPJ alfanumérico também: letras nas 12 primeiras posições (utils.js).
    inpCnpj.addEventListener("input", () => {
      let v;
      let out;
      if (window.BapellDoc) {
        out = window.BapellDoc.formatarCNPJ(inpCnpj.value);
        v = window.BapellDoc.limpar(out);
      } else {
        v = inpCnpj.value.replace(/\D/g, "").slice(0, 14);
        out = v;
        if (v.length > 2) out = v.slice(0, 2) + "." + v.slice(2);
        if (v.length > 5) out = out.slice(0, 6) + "." + v.slice(5);
        if (v.length > 8) out = out.slice(0, 10) + "/" + v.slice(8);
        if (v.length > 12) out = out.slice(0, 15) + "-" + v.slice(12);
      }
      if (out !== inpCnpj.value) inpCnpj.value = out;

      // Com letras, o prefixo só sai com o CNPJ completo.
      const pref = /[A-Z]/.test(v) && v.length < 14 ? null : _prefixoEmpresa(v);
      if (pref) {
        hint.textContent = `Prefixo do código: 789${pref}`;
        hint.style.color = "var(--clr-success)";
      } else {
        hint.textContent = "Usado para formar o prefixo do código.";
        hint.style.color = "var(--clr-text-3)";
      }
    });

    // Logo com redimensionamento
    let logoBase64 = "";
    document.getElementById("novaEmpLogo").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      _redimensionarImagem(file, 120, (dataUrl) => {
        logoBase64 = dataUrl;
        document.getElementById("novaEmpPreview").innerHTML =
          `<img src="${dataUrl}" alt="" style="width:44px;height:44px;border-radius:6px;object-fit:cover;border:1px solid var(--clr-border);" />`;
      });
    });

    // Ao sair do campo, confere os dígitos (fica vermelho se não conferir).
    if (window.BapellDoc) window.BapellDoc.ligar(inpCnpj, "cnpj");

    document.getElementById("addEmpSalvar").addEventListener("click", () => {
      const inpNome = document.getElementById("novaEmpNome");
      const nome = inpNome.value.trim();
      // Só letras e números (o CNPJ alfanumérico guarda as letras).
      const cnpjDigitos = window.BapellDoc
        ? window.BapellDoc.limpar(inpCnpj.value)
        : inpCnpj.value.replace(/\D/g, "");

      if (!nome) {
        _marcarErro(inpNome);
        return showToast("Informe o nome da empresa.", "warning");
      }
      if (cnpjDigitos.length !== 14) {
        _marcarErro(inpCnpj, "CNPJ incompleto: são 14 caracteres.", () =>
          (window.BapellDoc ? window.BapellDoc.limpar(inpCnpj.value) : inpCnpj.value.replace(/\D/g, "")).length === 14);
        return showToast("Informe o CNPJ completo (14 caracteres).", "warning");
      }
      if (window.BapellDoc && !window.BapellDoc.validarCNPJ(cnpjDigitos)) {
        _marcarErro(inpCnpj, "CNPJ inválido. Confira os números e as letras.", () =>
          window.BapellDoc.validarCNPJ(inpCnpj.value));
        return showToast("CNPJ inválido. Confira os números e as letras.", "warning");
      }
      if (!_prefixoEmpresa(cnpjDigitos)) return showToast("CNPJ inválido para gerar o código.", "error");

      const nova = {
        id: "eanemp_" + _genId(),
        nome,
        cnpj: cnpjDigitos,
        logo: logoBase64,
      };

      if (!Array.isArray(dados._empresasLocais)) dados._empresasLocais = [];
      dados._empresasLocais.push(nova);
      if (!_salvar(dados)) return;

      fechar();
      _renderEmpresas();
      _selecionarEmpresa({ ...nova, origem: "local" });
      showToast(`Empresa "${nome}" adicionada!`, "success");
    });
  }

  /** Redimensiona uma imagem para caber no aside, mantendo proporção */
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

  // ══════════════════════════════════════════
  //  LISTENERS
  // ══════════════════════════════════════════
  document.getElementById("btnGerarEan").addEventListener("click", _gerar);
  // Enter no SKU = clicar em "Gerar EAN": se o botão pedir usuário e senha
  // (Usuários e Senhas › Senha nos botões), o Enter também pede.
  document.getElementById("inpSku").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const btn = document.getElementById("btnGerarEan");
    if (btn && !btn.disabled) btn.click();
    else _gerar();
  });

  let buscaTimer;
  document.getElementById("inpBusca").addEventListener("input", () => {
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(_renderLista, 200);
  });

  document.getElementById("btnAddEmpresa").addEventListener("click", _abrirModalAddEmpresa);
  document.getElementById("btnEansOcultos").addEventListener("click", _abrirModalOcultos);

  const modalOcultos = document.getElementById("modalOcultos");
  document.getElementById("fecharOcultos").addEventListener("click", () => (modalOcultos.style.display = "none"));
  modalOcultos.addEventListener("click", (e) => {
    if (e.target === modalOcultos) modalOcultos.style.display = "none";
  });

  // Estado do menu lateral
  (function _aplicarEstadoSidebar() {
    const colapsado = localStorage.getItem("precifiq_sidebar_colapsada") === "1";
    const sb = document.getElementById("sidebar");
    if (sb) sb.classList.toggle("sidebar-colapsada", colapsado);
    document.body.classList.toggle("sidebar-colapsada-body", colapsado);
  })();

  _renderEmpresas();

  // Já entra com a primeira empresa selecionada — evita a tela vazia.
  // Prioriza uma que tenha CNPJ válido; se nenhuma tiver, seleciona a primeira
  // mesmo assim (a tela mostra o aviso explicando o que falta).
  (function _selecionarPrimeira() {
    const empresas = _todasEmpresas();
    if (empresas.length === 0) return;
    const comCnpj = empresas.find((e) => _prefixoEmpresa(e.cnpj));
    _selecionarEmpresa(comCnpj || empresas[0]);
  })();
});

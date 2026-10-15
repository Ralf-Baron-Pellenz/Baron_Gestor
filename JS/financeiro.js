// ═══════════════════════════════════════════
//  Bapell Gestor Pro — Controle Financeiro (DRE)
//  Dados isolados em localStorage: precifiq_dre
// ═══════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  const LS_KEY = "precifiq_dre";
  const _container = _carregarContainer();
  let _store = _storeAtivo();
  let movimentacoes = _store.movimentacoes;
  let periodoAtual = "mes";
  let graficoPizza = null;
  let graficoBarras = null;
  let graficoLucro = null;
  let graficoCanais = null;
  let graficoFluxo = null;
  let graficoCascata = null;

  // Extrato: ordem das colunas e quantas linhas aparecem (o "Mostrar mais"
  // acrescenta outro tanto). Com centenas de lançamentos, desenhar todos de
  // uma vez deixava a tela pesada e comprida demais.
  const PASSO_EXTRATO = 25;
  let _limiteExtrato = PASSO_EXTRATO;
  let _ordemExtrato = { campo: "data", dir: "desc" };

  // Grupos do DRE abertos (Deduções, Despesas). Fica guardado neste
  // computador — é só uma preferência de visualização.
  const LS_DRE_ABERTOS = "precifiq_fin_dre_abertos";
  const _dreAbertos = new Set((function () {
    try { const a = JSON.parse(localStorage.getItem(LS_DRE_ABERTOS)); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  })());

  // Estrutura de um store de empresa (dados financeiros isolados)
  function _storeVazio() {
    return _aplicarPadroes({
      movimentacoes: [], camposOcultos: [], secoesCustom: [], ordemSecoes: [],
      meta: 0, camposVenda: [], camposDespesa: [],
      // Guarda o VALOR de meta que já gerou comemoração (confete).
      // Serve para não repetir a festa a cada render nem ao recarregar a página.
      metaComemorada: 0,
    });
  }

  function _normalizarStore(raw) {
    return _aplicarPadroes({
      movimentacoes: raw.movimentacoes || [],
      camposOcultos: (raw.camposOcultos || []).slice(),
      secoesCustom: raw.secoesCustom || [],
      ordemSecoes: raw.ordemSecoes || [],
      meta: raw.meta || 0,
      camposVenda: raw.camposVenda || [],
      camposDespesa: raw.camposDespesa || [],
      metaComemorada: raw.metaComemorada || 0,
      padroesOcultos: raw.padroesOcultos || 0,
    });
  }

  /**
   * Campos que começam OCULTOS (o padrão do formulário).
   *   Versão 1: no Registrar Entrada, Taxa Canal/Cartão e Custo Frete.
   * Vale para as empresas novas e, uma vez, para as que já existiam. O
   * store guarda a versão aplicada (padroesOcultos): se a pessoa mostrar
   * esses campos em Configurar Campos, eles não voltam a sumir.
   * (Função, e não constante: roda antes de o restante do arquivo carregar.)
   */
  function _aplicarPadroes(store) {
    const VERSAO = 1;
    const CHAVES = ["formcampo_venda-taxa", "formcampo_venda-frete"];
    if ((store.padroesOcultos || 0) >= VERSAO) return store;
    if (!Array.isArray(store.camposOcultos)) store.camposOcultos = [];
    CHAVES.forEach((k) => { if (store.camposOcultos.indexOf(k) < 0) store.camposOcultos.push(k); });
    store.padroesOcultos = VERSAO;
    return store;
  }

  // Container multi-empresa: { empresas:[{id,nome,logo}], ativaId, dados:{[id]:store}, seguranca, senhaPerguntada }
  function _carregarContainer() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY));
      // Já é o novo formato multi-empresa
      if (raw && raw.dados && Array.isArray(raw.empresas)) {
        return raw;
      }
      // Formato anterior (store único) → migra para empresa "Minha Empresa"
      if (raw && typeof raw === "object" && Array.isArray(raw.movimentacoes)) {
        const id = "emp_migrada";
        return {
          empresas: [{ id, nome: "Minha Empresa", logo: "" }],
          ativaId: id,
          dados: { [id]: _normalizarStore(raw) },
          seguranca: raw.seguranca || null,
          senhaPerguntada: raw.senhaPerguntada || false,
        };
      }
      // Formato array antigo (dreSistema ou array puro)
      const arr = Array.isArray(raw) ? raw : JSON.parse(localStorage.getItem("dreSistema"));
      if (Array.isArray(arr)) {
        const id = "emp_migrada";
        const s = _storeVazio(); s.movimentacoes = arr;
        return { empresas: [{ id, nome: "Minha Empresa", logo: "" }], ativaId: id, dados: { [id]: s }, seguranca: null, senhaPerguntada: false };
      }
    } catch (e) {}
    // Vazio: sem nenhuma empresa cadastrada
    return { empresas: [], ativaId: null, dados: {}, seguranca: null, senhaPerguntada: false };
  }

  function _storeAtivo() {
    if (!_container.ativaId || !_container.dados[_container.ativaId]) {
      return _storeVazio();
    }
    return _normalizarStore(_container.dados[_container.ativaId]);
  }

  function _salvar() {
    _store.movimentacoes = movimentacoes;
    if (_container.ativaId) {
      _container.dados[_container.ativaId] = _store;
    }
    return _gravarContainer();
  }

  // Gravação única e segura do container. Todos os pontos que persistem devem
  // passar por aqui — antes, 3 lugares faziam localStorage.setItem direto, sem
  // try/catch: se a cota estourasse, a empresa existia em memória mas não no
  // disco, e o usuário não era avisado.
  function _gravarContainer() {
    try {
      // Read-before-write: outra aba pode ter mexido no container (criar
      // empresa, lançar movimentação) desde que esta carregou. Mesclar por id
      // evita que um save aqui apague o que a outra aba gravou.
      let noDisco = null;
      try { noDisco = JSON.parse(localStorage.getItem(LS_KEY)); } catch (_) { noDisco = null; }

      if (noDisco && noDisco.dados && Array.isArray(noDisco.empresas)) {
        const porId = new Map();
        noDisco.empresas.forEach((e) => { if (e && e.id) porId.set(e.id, e); });
        _container.empresas.forEach((e) => { if (e && e.id) porId.set(e.id, e); });
        if (Array.isArray(_container._excluidas)) {
          _container._excluidas.forEach((id) => { porId.delete(id); });
        }
        _container.empresas = Array.from(porId.values());

        // Mescla os stores de dados: mantém os desta aba, traz do disco os que
        // esta aba não tem (empresas criadas em outra aba).
        Object.keys(noDisco.dados).forEach((id) => {
          if (!(id in _container.dados) && !(Array.isArray(_container._excluidas) && _container._excluidas.includes(id))) {
            _container.dados[id] = noDisco.dados[id];
          }
        });

        if (!_container.empresas.find((e) => e.id === _container.ativaId)) {
          _container.ativaId = _container.empresas[0] ? _container.empresas[0].id : null;
        }
      }

      // A senha agora é do senhas.js, que mantém aqui uma CÓPIA do hash do
      // Administrador e da escolha dos módulos bloqueados (é o precifiq_dre
      // que vai no backup). Esta aba não pode gravar por cima uma cópia
      // velha, carregada antes de a senha mudar: vale sempre a atual.
      if (window.BapellSenhas && typeof window.BapellSenhas.espelho === "function") {
        _container.seguranca = window.BapellSenhas.espelho();
      } else if (window.BapellSenhas && typeof window.BapellSenhas.hashAdmin === "function") {
        const hashAtual = window.BapellSenhas.hashAdmin();
        _container.seguranca = hashAtual ? { hash: hashAtual } : null;
      }

      const paraGravar = Object.assign({}, _container);
      delete paraGravar._excluidas; // marcador de sessão, não vai ao disco
      localStorage.setItem(LS_KEY, JSON.stringify(paraGravar));
      return true;
    } catch (e) {
      // O financeiro guarda logos em base64: a cota pode estourar.
      // Sem este aviso, o lançamento se perde em silêncio.
      console.error("Falha ao salvar o financeiro:", e);
      if (typeof PrecifiqErros !== "undefined") {
        PrecifiqErros.registrar("Falha ao salvar financeiro", e && e.stack ? e.stack : String(e));
      }
      showToast(
        e && e.name === "QuotaExceededError"
          ? "Armazenamento cheio. Remova logos grandes ou faça um backup."
          : "Não foi possível salvar. Tente novamente.",
        "error",
        5000,
      );
      return false;
    }
  }


  function _temEmpresa() {
    return _container.empresas && _container.empresas.length > 0 && _container.ativaId;
  }

  function _empresaAtiva() {
    return (_container.empresas || []).find((e) => e.id === _container.ativaId) || null;
  }

  // ══════════════════════════════════════════
  //  GESTÃO DE EMPRESAS (multi-empresa)
  // ══════════════════════════════════════════
  function _logoMini(logo, size) {
    const s = size || 26;
    if (logo) {
      return `<img src="${logo}" alt="" style="width:${s}px; height:${s}px; border-radius:5px; object-fit:cover; border:1px solid var(--clr-border);" />`;
    }
    return `<span style="width:${s}px; height:${s}px; border-radius:5px; background:var(--clr-surface-alt); border:1px solid var(--clr-border); display:inline-flex; align-items:center; justify-content:center; color:var(--clr-text-3);"><svg width="${Math.round(s*0.55)}" height="${Math.round(s*0.55)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V7l8-4v18"></path><path d="M19 21V11l-6-4"></path></svg></span>`;
  }

  function _renderSeletorEmpresa() {
    const box = document.getElementById("empresaAtivaBox");
    const logoEl = document.getElementById("empresaAtivaLogo");
    const nomeEl = document.getElementById("empresaAtivaNome");
    const lista = document.getElementById("listaEmpresasDropdown");
    if (!box) return;

    const ativa = _empresaAtiva();
    box.style.display = ativa ? "flex" : "none";
    if (ativa) {
      if (logoEl) logoEl.innerHTML = _logoMini(ativa.logo, 28);
      if (nomeEl) nomeEl.textContent = ativa.nome || "Empresa";
      box.title = ativa.nome || "Empresa";
    }

    // Lista de empresas (abre pela setinha)
    if (lista) {
      const temp = _container.empresas || [];
      lista.innerHTML = temp
        .map((e) => {
          const isAtiva = e.id === _container.ativaId;
          return `
            <button type="button" class="empresa-lista-item" data-emp-id="${e.id}"
              style="display:flex; align-items:center; gap:8px; width:100%; background:${isAtiva ? "var(--clr-primary-lt)" : "transparent"}; border:none; cursor:pointer; padding:8px 10px; font-size:13px; font-weight:600; text-align:left; color:${isAtiva ? "var(--clr-primary)" : "var(--clr-text)"};">
              ${_logoMini(e.logo, 22)}
              <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${_esc(e.nome || "Empresa")}</span>
            </button>`;
        })
        .join("");

      lista.querySelectorAll(".empresa-lista-item").forEach((item) => {
        item.addEventListener("click", (ev) => {
          ev.stopPropagation();
          lista.style.display = "none";
          _girarSeta(false);
          const novoId = item.dataset.empId;
          if (novoId && novoId !== _container.ativaId) _trocarEmpresa(novoId);
        });
      });
    }

    _ligarControlesEmpresa();
  }

  function _girarSeta(aberto) {
    const seta = document.getElementById("setaTrocarEmpresa");
    if (seta) seta.style.transform = aberto ? "rotate(180deg)" : "rotate(0deg)";
  }

  // Liga setinha (trocar) e 3 pontinhos (opções) uma única vez
  function _ligarControlesEmpresa() {
    const btnSeta = document.getElementById("btnTrocarEmpresa");
    const lista = document.getElementById("listaEmpresasDropdown");
    const btnMenu = document.getElementById("btnMenuEmpresa");
    const menuDrop = document.getElementById("menuEmpresaDropdown");

    if (btnSeta && lista && !btnSeta.dataset.bound) {
      btnSeta.dataset.bound = "1";
      btnSeta.addEventListener("click", (e) => {
        e.stopPropagation();
        const sb = document.getElementById("sidebar");
        if (sb && sb.classList.contains("sidebar-colapsada")) {
          if (typeof toggleSidebar === "function") toggleSidebar();
          return;
        }
        if (menuDrop) menuDrop.style.display = "none";
        const abrindo = lista.style.display === "none";
        lista.style.display = abrindo ? "block" : "none";
        _girarSeta(abrindo);
      });
    }

    if (btnMenu && menuDrop && !btnMenu.dataset.bound) {
      btnMenu.dataset.bound = "1";
      btnMenu.addEventListener("click", (e) => {
        e.stopPropagation();
        if (lista) { lista.style.display = "none"; _girarSeta(false); }
        menuDrop.style.display = menuDrop.style.display === "none" ? "block" : "none";
      });
    }

    // Fecha ambos ao clicar fora
    if (!document.body.dataset.boundEmpresaOutside) {
      document.body.dataset.boundEmpresaOutside = "1";
      document.addEventListener("click", (e) => {
        const l = document.getElementById("listaEmpresasDropdown");
        const m = document.getElementById("menuEmpresaDropdown");
        const bs = document.getElementById("btnTrocarEmpresa");
        const bm = document.getElementById("btnMenuEmpresa");
        if (l && !l.contains(e.target) && (!bs || !bs.contains(e.target))) {
          l.style.display = "none";
          _girarSeta(false);
        }
        if (m && !m.contains(e.target) && (!bm || !bm.contains(e.target))) {
          m.style.display = "none";
        }
      });
    }

    // Com o menu colapsado, clicar na logo expande
    const boxEl = document.getElementById("empresaAtivaBox");
    if (boxEl && !boxEl.dataset.boundClick) {
      boxEl.dataset.boundClick = "1";
      boxEl.addEventListener("click", () => {
        const sb = document.getElementById("sidebar");
        if (sb && sb.classList.contains("sidebar-colapsada")) {
          if (typeof toggleSidebar === "function") toggleSidebar();
        }
      });
    }
  }

  function _trocarEmpresa(id) {
    // Salva a atual antes de trocar
    _salvar();
    _container.ativaId = id;
    _store = _storeAtivo();
    movimentacoes = _store.movimentacoes;
    _gravarContainer();
    _limiteExtrato = PASSO_EXTRATO;
    // Re-render tudo
    _popularCanais();
    _renderCamposExtra("venda");
    _renderCamposExtra("despesa");
    _renderSecoesCustom();
    _aplicarVisibilidade();
    _renderSeletorEmpresa();
    atualizarTela();
  }

  // Modal para adicionar empresa (das cadastradas ou nova avulsa)
  function _abrirModalAddEmpresa() {
    const ex = document.getElementById("modalAddEmpresaFin");
    if (ex) ex.remove();

    // Item 6: as empresas vêm EXCLUSIVAMENTE do cadastro (precifiq_empresa).
    // Guardamos o id de origem para vincular firmemente (origemEmpresaId), em
    // vez de casar só por nome.
    let cadastradas = [];
    try {
      const emp = JSON.parse(localStorage.getItem("precifiq_empresa"));
      if (emp && Array.isArray(emp.empresas)) {
        cadastradas = emp.empresas.map((e) => ({
          id: e.id,
          nome: e.nomeAba || e.nomeFantasia || e.razaoSocial || "Empresa",
          logo: e.logo || "",
        }));
      }
    } catch (e) {}

    // Remove as que já estão no financeiro. Casa por id (vínculo firme) e,
    // para empresas antigas sem vínculo, também por nome — assim nada duplica.
    const idsUsados = new Set(
      (_container.empresas || []).map((e) => e.origemEmpresaId).filter(Boolean),
    );
    const nomesUsados = new Set(
      (_container.empresas || []).map((e) => (e.nome || "").toLowerCase()),
    );
    const disponiveis = cadastradas.filter(
      (e) => !idsUsados.has(e.id) && !nomesUsados.has((e.nome || "").toLowerCase()),
    );

    const listaHtml = disponiveis.length
      ? disponiveis.map((e, i) => `
          <div class="add-emp-item" data-idx="${i}" style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:var(--clr-surface-alt); border:1px solid var(--clr-border); border-radius:var(--r-md); cursor:pointer; margin-bottom:6px;">
            ${_logoMini(e.logo, 30)}
            <span style="font-size:14px; font-weight:600; color:var(--clr-text);">${_esc(e.nome)}</span>
            <span style="margin-left:auto; font-size:11px; color:var(--clr-primary); font-weight:700;">Usar</span>
          </div>`).join("")
      : `<div style="font-size:13px; color:var(--clr-text-3); text-align:center; padding:12px;">Nenhuma empresa cadastrada disponível.</div>`;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalAddEmpresaFin";
    overlay.innerHTML = `
      <div class="modal" style="max-width:460px; width:90%; max-height:85vh; display:flex; flex-direction:column;">
        <div class="modal-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Adicionar Empresa</span>
          <button type="button" id="addEmpFecharX" style="background:transparent; border:none; color:var(--clr-text-3); font-size:22px; cursor:pointer; line-height:1;">✕</button>
        </div>
        <div style="overflow-y:auto; flex:1; margin:12px 0;">
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--clr-text-3); margin-bottom:8px;">Empresas cadastradas</div>
          ${listaHtml}
          <div style="font-size:12px; color:var(--clr-text-2); background:var(--clr-surface-alt); border:1px solid var(--clr-border); border-radius:var(--r-md); padding:11px 13px; margin-top:14px; line-height:1.5;">
            As empresas ficam centralizadas no cadastro. Para criar uma nova,
            acesse a tela <strong>Dados da Empresa</strong>.
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="addEmpCancelar">Cancelar</button>
          <button class="btn-primary" id="addEmpCadastrar" style="padding:10px var(--sp-lg); font-size:14px;">Cadastrar nova empresa</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const fechar = () => overlay.remove();
    document.getElementById("addEmpFecharX").addEventListener("click", fechar);
    document.getElementById("addEmpCancelar").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });

    // Escolher empresa cadastrada → entra no financeiro com o vínculo de origem
    overlay.querySelectorAll(".add-emp-item").forEach((el) => {
      el.addEventListener("click", () => {
        const emp = disponiveis[parseInt(el.dataset.idx)];
        _adicionarEmpresa(emp.nome, emp.logo, emp.id);
        fechar();
      });
    });

    // Cadastrar nova → vai para a tela de Empresas (não cria avulsa aqui)
    document.getElementById("addEmpCadastrar").addEventListener("click", () => {
      window.location.href = "empresa.html";
    });
  }

  // Comprime uma imagem para caber com folga no localStorage: redimensiona
  // para no máx. 400x400 e exporta como JPEG. Mesma abordagem do empresa.js.
  function _comprimirLogo(file, callback) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 400;
        let { width, height } = img;
        if (width > height && width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
        else if (height > MAX) { width = Math.round(width * MAX / height); height = MAX; }
        try {
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          callback(canvas.toDataURL("image/jpeg", 0.82));
        } catch (e) {
          // Se o canvas falhar, cai no original (melhor logo grande que nenhuma)
          callback(ev.target.result);
        }
      };
      img.onerror = () => callback(ev.target.result);
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function _adicionarEmpresa(nome, logo, origemEmpresaId) {
    // id com componente aleatório: "emp_" + tempo só por timestamp colidia se
    // duas empresas fossem criadas no mesmo milissegundo (era o id mais fraco
    // do projeto). generateId() do utils traz aleatoriedade.
    const id = (typeof generateId === "function")
      ? "emp_" + generateId()
      : "emp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    // origemEmpresaId liga esta empresa do DRE ao cadastro em precifiq_empresa.
    // Com o vínculo firme, o registro de vendas e o PDF acham o emitente por id
    // (não só por nome), e a deduplicação na próxima abertura do modal é exata.
    const nova = { id, nome, logo: logo || "" };
    if (origemEmpresaId) nova.origemEmpresaId = origemEmpresaId;
    _container.empresas.push(nova);
    _container.dados[id] = _storeVazio();
    _container.ativaId = id;
    _store = _storeAtivo();
    movimentacoes = _store.movimentacoes;
    _gravarContainer();
    _popularCanais();
    _renderCamposExtra("venda");
    _renderCamposExtra("despesa");
    _renderSecoesCustom();
    _aplicarVisibilidade();
    _renderSeletorEmpresa();
    _atualizarEstadoVazio();
    atualizarTela();
    showToast(`Empresa "${nome}" adicionada!`, "success");
  }

  // Mostra/esconde o conteúdo conforme houver empresa ativa
  function _atualizarEstadoVazio() {
    const temEmp = _temEmpresa();
    const vazio = document.getElementById("finEmptyState");
    const conteudo = document.getElementById("finConteudo");
    if (vazio) vazio.style.display = temEmp ? "none" : "block";
    if (conteudo) conteudo.style.display = temEmp ? "block" : "none";
    // Sem empresa não há formulário onde pôr um campo.
    const addCampos = document.getElementById("btnAddCamposFin");
    if (addCampos) addCampos.hidden = !temEmp;
  }

  function _excluirEmpresa() {
    const ativa = _empresaAtiva();
    if (!ativa) return;

    const ex = document.getElementById("modalExcluirEmp");
    if (ex) ex.remove();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalExcluirEmp";
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px; width:90%;">
        <div class="modal-title">Excluir empresa?</div>
        <div class="modal-subtitle" style="margin-bottom:var(--sp-lg);">
          Todos os lançamentos e configurações de <strong>${_esc(ativa.nome)}</strong> serão apagados permanentemente. Esta ação não pode ser desfeita.
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="excEmpCancelar">Cancelar</button>
          <button class="btn-danger" id="excEmpConfirmar" style="padding:10px var(--sp-lg); font-size:14px;">Sim, excluir</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const fechar = () => overlay.remove();
    document.getElementById("excEmpCancelar").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
    document.getElementById("excEmpConfirmar").addEventListener("click", () => {
      const id = _container.ativaId;
      // Marca a empresa como excluída ANTES de gravar. O _gravarContainer()
      // faz read-before-write: ele lê o container do disco e mescla as empresas
      // de volta (proteção contra outra aba sobrescrever). Sem esta marca, a
      // empresa que acabou de sair da memória volta do disco na própria
      // gravação — a exclusão avisava "excluída" e nada era apagado.
      if (!Array.isArray(_container._excluidas)) _container._excluidas = [];
      if (id && _container._excluidas.indexOf(id) < 0) _container._excluidas.push(id);
      _container.empresas = _container.empresas.filter((e) => e.id !== id);
      delete _container.dados[id];
      _container.ativaId = _container.empresas.length ? _container.empresas[0].id : null;
      _store = _storeAtivo();
      movimentacoes = _store.movimentacoes;
      _gravarContainer();
      _popularCanais();
      _renderCamposExtra("venda");
      _renderCamposExtra("despesa");
      _renderSecoesCustom();
      _aplicarVisibilidade();
      _renderSeletorEmpresa();
      _atualizarEstadoVazio();
      atualizarTela();
      fechar();
      showToast(`Empresa "${ativa.nome}" excluída.`, "success");
    });
  }

  // ── Formatação ──
  /**
   * Converte qualquer entrada em número FINITO.
   * Sem isso, um lançamento com valor corrompido (string, null, Infinity)
   * contamina todos os KPIs — o painel inteiro exibe "NaN" ou "∞".
   */
  const _n = (v) => {
    const num = typeof v === "number" ? v : parseFloat(v);
    return isFinite(num) ? num : 0;
  };

  /** Escapa texto para inserção segura em HTML (usar sempre, sem exceção) */
  const _esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  // Formata em BRL. Valores não-finitos viram R$ 0,00 (antes exibia "R$ ∞" e "R$ NaN").
  // O sinal de menos tipográfico ("−R$ 10,00"): não se separa do valor na
  // quebra de linha, como o hífen fazia.
  // Arredonda nos centavos antes: um resto como −0,001 virava "−R$ 0,00".
  const fmt = (v) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.round(_n(v) * 100) / 100 || 0).replace(/^-/, "\u2212");
  const fmtData = (iso) => {
    if (!iso) return "";
    const [a, m, d] = iso.split("-");
    return `${d}/${m}/${a}`;
  };
  // Porcentagem no formato brasileiro: 12,3%
  const fmtPct = (v, casas) =>
    _n(v).toLocaleString("pt-BR", { minimumFractionDigits: casas == null ? 1 : casas, maximumFractionDigits: casas == null ? 1 : casas }).replace(/^-/, "\u2212") + "%";
  // Valor curto para eixos e rótulos: R$ 12,5 mil · R$ 1,2 mi
  const fmtCurto = (v) => {
    const n = _n(v), a = Math.abs(n), sinal = n < 0 ? "\u2212" : "";
    if (a >= 1e6) return sinal + "R$ " + (a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
    if (a >= 1e3) return sinal + "R$ " + (a / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
    return sinal + "R$ " + a.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  };

  // ── Datas (sempre em "AAAA-MM-DD", como nos lançamentos) ──
  const _p2 = (n) => String(n).padStart(2, "0");
  const _isoDe = (d) => `${d.getFullYear()}-${_p2(d.getMonth() + 1)}-${_p2(d.getDate())}`;
  const _dataDe = (iso) => { const [a, m, d] = String(iso).split("-").map(Number); return new Date(a, (m || 1) - 1, d || 1); };
  const _somarDias = (iso, dias) => { const d = _dataDe(iso); d.setDate(d.getDate() + dias); return _isoDe(d); };
  const _diasEntre = (ini, fim) => Math.round((_dataDe(fim) - _dataDe(ini)) / 86400000);
  const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const MESES_NOME = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  // "2026-10" → "out/26"
  const _rotuloMes = (chave) => { const [a, m] = chave.split("-"); return `${MESES_ABREV[Number(m) - 1]}/${a.slice(2)}`; };
  // Lê um input money (formato BR) → número
  const val = (id) => {
    const el = document.getElementById(id);
    if (!el) return 0;
    if (typeof parseFormattedValue === "function") return parseFormattedValue(el.value) || 0;
    return parseFloat((el.value || "").replace(/\./g, "").replace(",", ".")) || 0;
  };

  // Unidade selecionada para taxa e imposto (rs = R$, pct = %)
  const unidades = { taxa: "rs", imposto: "rs" };

  // Modo de entrada do valor: false = Bruto (padrão), true = Líquido direto
  let modoLiquido = false;

  // Resolve o valor real (em R$) de um campo que pode ser R$ ou %
  // % incide sobre o Valor Bruto do pedido
  function _valorResolvido(campo) {
    // Campo oculto (Configurar Campos) não entra na conta.
    if (_campoOculto("venda-" + campo)) return 0;
    const bruto = val("venda-bruto");
    const v = val("venda-" + campo);
    if (unidades[campo] === "pct") return (bruto * v) / 100;
    return v;
  }

  // O campo do formulário está oculto em Configurar Campos? (Taxa e Frete
  // começam ocultos — ver _aplicarPadroes.) Oculto, ele não conta: o que
  // não aparece não pode descontar nada sem a pessoa ver.
  function _campoOculto(id) {
    return (_store.camposOcultos || []).indexOf("formcampo_" + id) >= 0;
  }
  const _valFrete = () => (_campoOculto("venda-frete") ? 0 : val("venda-frete"));

  if (typeof setDateHeader === "function") setDateHeader();

  // Popula o "Canal de Venda" com as plataformas do sistema (respeitando ocultas)
  function _popularCanais() {
    const sel = document.getElementById("venda-canal");
    if (!sel) return;
    let ocultas = [];
    try { ocultas = JSON.parse(localStorage.getItem("precifiq_hidden_platforms")) || []; } catch (e) {}
    const lista = (typeof PLATFORMS_CONFIG !== "undefined" ? PLATFORMS_CONFIG : [])
      .filter((p) => !ocultas.includes(p.id));
    const anterior = sel.value;
    sel.innerHTML = lista.map((p) => `<option value="${_esc(p.name)}">${_esc(p.name)}</option>`).join("");
    // Opção genérica extra
    sel.innerHTML += `<option value="Outro">Outro</option>`;
    if (anterior) sel.value = anterior;
  }
  _popularCanais();

  // ── Alternância Valor Bruto / Valor Líquido ──
  function _aplicarModoBrutoLiquido() {
    const label = document.getElementById("labelValorPrincipal");
    const btn = document.getElementById("btnToggleBrutoLiquido");
    const camposBloquear = ["venda-taxa", "venda-frete", "venda-imposto"];
    const togglesUnidade = document.querySelectorAll('.fin-toggle-unidade[data-toggle="taxa"] button, .fin-toggle-unidade[data-toggle="imposto"] button');

    if (label) label.textContent = modoLiquido ? "Valor Líquido (R$)" : "Valor Bruto (R$)";
    if (btn) {
      // O visual (ligado/desligado) vem do financeiro.css (.fin-toggle-bl.ativo).
      btn.classList.toggle("ativo", modoLiquido);
      btn.setAttribute("aria-pressed", modoLiquido ? "true" : "false");
      btn.title = modoLiquido ? "Modo Líquido ativo — clique para voltar a Bruto" : "Alternar para Valor Líquido";
    }

    camposBloquear.forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.disabled = modoLiquido;
      if (modoLiquido) input.value = "";
      const fg = input.closest(".field-group");
      if (fg) fg.style.opacity = modoLiquido ? "0.45" : "1";
    });
    // Desabilita também os botões de unidade R$/%
    togglesUnidade.forEach((b) => { b.disabled = modoLiquido; b.style.cursor = modoLiquido ? "not-allowed" : "pointer"; });

    _atualizarPreviewLiquido();
  }

  const _btnToggleBL = document.getElementById("btnToggleBrutoLiquido");
  if (_btnToggleBL) {
    _btnToggleBL.addEventListener("click", () => {
      modoLiquido = !modoLiquido;
      _aplicarModoBrutoLiquido();
    });
  }

  // ══════════════════════════════════════════
  //  CAMPOS EXTRAS (Venda e Despesa)
  //  Entram no cálculo: em venda somam nas deduções,
  //  em despesa somam no valor total.
  // ══════════════════════════════════════════
  function _renderCamposExtra(tipo) {
    const container = document.getElementById(tipo === "venda" ? "camposExtraVenda" : "camposExtraDespesa");
    if (!container) return;
    const lista = tipo === "venda" ? _store.camposVenda : _store.camposDespesa;
    container.innerHTML = "";

    (lista || []).forEach((campo) => {
      const info = _tipoInfo(campo.tipo);
      const fg = document.createElement("div");
      fg.className = "field-group";
      const somaCalc = (campo.tipo === "money" || campo.tipo === "percent");
      fg.innerHTML = `
        <label style="display:flex; justify-content:space-between; align-items:center;">
          <span>${_escExtra(campo.rotulo)}${somaCalc ? '<span style="font-size:9px; color:var(--clr-text-3); font-weight:600;"> (no cálculo)</span>' : ""}</span>
          <button type="button" class="btn-rm-extra" data-id="${campo.id}" style="background:transparent; border:none; color:var(--clr-danger); cursor:pointer; font-size:10px;">Excluir</button>
        </label>
        <div class="input-addon-wrap ${info.suffix ? "input-addon-wrap-suffix" : ""}">
          ${info.prefix ? `<span class="input-prefix">${info.prefix}</span>` : ""}
          <input type="text" class="input-field extra-input" data-id="${campo.id}" inputmode="${info.inputmode}" placeholder="${info.placeholder}" />
          ${info.suffix ? `<span class="input-suffix">${info.suffix}</span>` : ""}
        </div>
      `;
      const input = fg.querySelector(".extra-input");
      // A prévia do formulário (receita líquida / total da saída) acompanha
      // os campos que entram no cálculo.
      const aoMudarValor = tipo === "venda" ? _atualizarPreviewLiquido : _atualizarPreviewSaida;
      if (campo.tipo === "money") {
        // Máscara em tempo real (formata enquanto digita)
        _mascaraMoneyTempoReal(input);
        input.addEventListener("input", aoMudarValor);
      } else if (campo.tipo === "percent") {
        input.addEventListener("input", aoMudarValor);
        input.addEventListener("blur", () => {
          if (input.value.trim() === "") return;
          input.value = formatPercentBR(parseFormattedValue(input.value));
          aoMudarValor();
        });
      } else if (campo.tipo === "number") {
        input.addEventListener("input", () => { input.value = input.value.replace(/[^\d]/g, ""); });
      }
      fg.querySelector(".btn-rm-extra").addEventListener("click", () => {
        if (tipo === "venda") _store.camposVenda = _store.camposVenda.filter((c) => c.id !== campo.id);
        else _store.camposDespesa = _store.camposDespesa.filter((c) => c.id !== campo.id);
        _salvar();
        _renderCamposExtra(tipo);
        if (tipo === "venda") _atualizarPreviewLiquido();
        else _atualizarPreviewSaida();
      });
      container.appendChild(fg);
    });
  }

  function _escExtra(s) { return _esc(s); }

  // Soma o valor (em R$) dos campos extras de venda que entram no cálculo
  function _totalExtrasVenda() {
    const bruto = val("venda-bruto");
    let total = 0;
    (_store.camposVenda || []).forEach((campo) => {
      const input = document.querySelector(`#camposExtraVenda .extra-input[data-id="${campo.id}"]`);
      if (!input) return;
      const v = typeof parseFormattedValue === "function" ? parseFormattedValue(input.value) || 0 : 0;
      if (campo.tipo === "money") total += v;
      else if (campo.tipo === "percent") total += (bruto * v) / 100;
    });
    return total;
  }

  // Coleta os valores dos campos extras para guardar no lançamento
  function _coletarExtras(tipo) {
    const lista = tipo === "venda" ? _store.camposVenda : _store.camposDespesa;
    const containerId = tipo === "venda" ? "camposExtraVenda" : "camposExtraDespesa";
    const out = [];
    (lista || []).forEach((campo) => {
      const input = document.querySelector(`#${containerId} .extra-input[data-id="${campo.id}"]`);
      out.push({ rotulo: campo.rotulo, tipo: campo.tipo, valor: input ? input.value : "" });
    });
    return out;
  }

  function _limparExtras(tipo) {
    const containerId = tipo === "venda" ? "camposExtraVenda" : "camposExtraDespesa";
    document.querySelectorAll(`#${containerId} .extra-input`).forEach((i) => (i.value = ""));
  }

  // Preenche os campos extras do formulário com os valores guardados num
  // lançamento (casando pelo nome e pelo tipo do campo). Devolve os que
  // foram casados.
  function _preencherExtras(tipo, gravados) {
    const lista = tipo === "venda" ? _store.camposVenda : _store.camposDespesa;
    const containerId = tipo === "venda" ? "camposExtraVenda" : "camposExtraDespesa";
    const usados = [];
    (lista || []).forEach((campo) => {
      const input = document.querySelector(`#${containerId} .extra-input[data-id="${campo.id}"]`);
      if (!input) return;
      const g = (gravados || []).find((e) => e && e.rotulo === campo.rotulo && e.tipo === campo.tipo && usados.indexOf(e) < 0);
      input.value = g ? String(g.valor || "") : "";
      if (g) usados.push(g);
    });
    return usados;
  }

  _renderCamposExtra("venda");
  _renderCamposExtra("despesa");

  // Toggle R$/% dos campos taxa e imposto
  document.querySelectorAll(".fin-toggle-unidade").forEach((tg) => {
    const campo = tg.dataset.toggle; // "taxa" ou "imposto"
    tg.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        tg.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        unidades[campo] = btn.dataset.un;
        // Atualiza o prefixo/sufixo visual
        const prefix = document.getElementById("venda-" + campo + "-prefix");
        if (prefix) prefix.textContent = btn.dataset.un === "pct" ? "%" : "R$";
        _atualizarPreviewLiquido();
      });
    });
  });

  // Datas atuais nos formulários
  // Data local (o toISOString é UTC: depois das 21h no Brasil já dava amanhã).
  const hoje = _isoDe(new Date());
  document.getElementById("venda-data").value = hoje;
  document.getElementById("despesa-data").value = hoje;

  /**
   * Aplica máscara de dinheiro EM TEMPO REAL num input.
   *
   * O usuário digita só dígitos e a formatação aparece na hora:
   * 3 → 0,03 | 30 → 0,30 | 30000000 → 300.000,00
   *
   * O cursor é mantido no fim (comportamento esperado deste tipo de campo).
   * Antes a formatação só acontecia no blur, e a pessoa digitava às cegas.
   */
  function _mascaraMoneyTempoReal(el) {
    if (!el || el.dataset.maskBound === "1") return;
    el.dataset.maskBound = "1";

    const MAX_DIGITOS = 15; // acima disso o parseInt perde precisão

    const formatar = (bruto) => {
      let digitos = String(bruto).replace(/\D/g, "");
      if (!digitos) return "";
      if (digitos.length > MAX_DIGITOS) digitos = digitos.slice(0, MAX_DIGITOS);
      const centavos = parseInt(digitos, 10);
      if (!isFinite(centavos)) return "";
      return (centavos / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    };

    el.addEventListener("input", () => {
      const antes = el.value;
      const depois = formatar(antes);
      if (antes !== depois) {
        el.value = depois;
        // Cursor sempre no fim: o valor é reescrito por completo
        el.setSelectionRange(depois.length, depois.length);
      }
    });

    // Ao sair, garante o formato (ex: campo colado de fora)
    el.addEventListener("blur", () => {
      if (el.value.trim() === "") return;
      if (typeof formatMoneyBR === "function" && typeof parseFormattedValue === "function") {
        el.value = formatMoneyBR(parseFormattedValue(el.value));
      }
    });
  }

  /** Aplica a máscara a todos os .money-input de um container (ou do documento) */
  function _aplicarMascarasMoney(container) {
    (container || document).querySelectorAll(".money-input").forEach(_mascaraMoneyTempoReal);
  }

  // ── Máscara money nos inputs da tela ──
  _aplicarMascarasMoney();
  document.querySelectorAll(".money-input").forEach((el) => {
    el.addEventListener("input", _atualizarPreviewLiquido);
  });

  function _atualizarPreviewLiquido() {
    const valorPrincipal = val("venda-bruto");
    const box = document.getElementById("vendaLiquidoPreview");
    if (!box) return;
    if (modoLiquido) {
      // O valor digitado já é o líquido final — nada mais desconta
      box.innerHTML = `Receita líquida: <strong>${fmt(valorPrincipal)}</strong>`;
      box.classList.remove("negativo");
      return;
    }
    const ded = _valorResolvido("taxa") + _valFrete() + _valorResolvido("imposto") + _totalExtrasVenda();
    const liq = valorPrincipal - ded;
    box.innerHTML = `Receita líquida: <strong>${fmt(liq)}</strong>`;
    // Deduções maiores que o valor: a prévia fica vermelha (o lançamento
    // não passa — ver adicionarVenda).
    box.classList.toggle("negativo", liq < 0);
  }

  // Soma (em R$) dos campos extras da saída que entram no cálculo: os de R$
  // somam direto; os de % incidem sobre o valor da saída.
  function _totalExtrasDespesa(valor) {
    let total = 0;
    (_store.camposDespesa || []).forEach((campo) => {
      const input = document.querySelector(`#camposExtraDespesa .extra-input[data-id="${campo.id}"]`);
      if (!input) return;
      const v = typeof parseFormattedValue === "function" ? parseFormattedValue(input.value) || 0 : 0;
      if (campo.tipo === "money") total += v;
      else if (campo.tipo === "percent") total += (valor * v) / 100;
    });
    return total;
  }

  // Prévia do Registrar Saída: o valor mais os campos extras do cálculo.
  function _atualizarPreviewSaida() {
    const box = document.getElementById("despesaTotalPreview");
    if (!box) return;
    const valor = val("despesa-valor");
    box.innerHTML = `Total da saída: <strong>${fmt(valor + _totalExtrasDespesa(valor))}</strong>`;
  }

  // ══════════════════════════════════════════
  //  OBRIGATÓRIOS E RESPONSÁVEL
  // ══════════════════════════════════════════
  // Os campos que faltam ficam vermelhos até serem preenchidos
  // (BapellCampos, do utils.js). Sem ele, fica só o aviso de sempre.
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

  // O Responsável é escolhido entre os usuários cadastrados em Dados da
  // Empresa › Usuários e Senhas (BapellUsuarios, do senhas.js).
  function _preencherResponsaveis() {
    const U = window.BapellUsuarios;
    if (!U) return;
    ["venda-responsavel", "despesa-responsavel"].forEach((id) => {
      const sel = document.getElementById(id);
      if (sel) U.preencherSelect(sel, { vazio: "Selecione quem está lançando" });
    });
  }

  // Sem nenhum usuário cadastrado não há quem escolher: o campo fica
  // vermelho e uma janela leva ao cadastro.
  function _semUsuarios(select) {
    const U = window.BapellUsuarios;
    if (!U || U.listar().length) return false;
    _marcarErro(select);
    U.pedirCadastro();
    return true;
  }

  // Confere o responsável escolhido — quem tem senha só passa digitando a
  // própria. Resolve o usuário ({ id, nome }) ou null (cancelou).
  function _confirmarResponsavel(select, acao) {
    const U = window.BapellUsuarios;
    if (!U) return Promise.resolve(select.value ? { id: "", nome: select.value } : null);
    return U.confirmarResponsavel(select.value, { acao }).then((r) => {
      if (r.ok) return r.usuario;
      if (r.motivo === "vazio") {
        _marcarErro(select);
        showToast("Escolha o responsável pelo lançamento.", "warning");
      }
      return null;
    });
  }

  // ══════════════════════════════════════════
  //  LANÇAMENTOS
  // ══════════════════════════════════════════
  // Um lançamento por vez: enquanto a senha do responsável é pedida, um
  // segundo clique (ou Enter) em "Lançar" não lança de novo.
  let _lancando = false;
  function _lancar(promessa, aoConfirmar) {
    _lancando = true;
    return promessa.then(
      (usuario) => { _lancando = false; aoConfirmar(usuario); },
      (e) => { _lancando = false; throw e; }
    );
  }

  // "Registrar Entrada" (internamente o lançamento continua sendo do tipo
  // "Venda": é o que o Registro de Vendas, o Processador e o backup usam).
  function adicionarVenda() {
    if (_lancando) return;
    const data = document.getElementById("venda-data").value;
    const canal = document.getElementById("venda-canal").value;
    const valorPrincipal = val("venda-bruto");
    const selResp = document.getElementById("venda-responsavel");
    // Descrição opcional; sem ela, fica "Venda <canal>" como sempre foi.
    const elDesc = document.getElementById("venda-desc");
    const descDigitada = elDesc ? elDesc.value.trim() : "";

    if (_semUsuarios(selResp)) return;
    // O valor e o responsável: os que faltam ficam vermelhos.
    if (!_exigir([
      { el: document.getElementById("venda-bruto"), vazio: !(valorPrincipal > 0),
        msg: `O ${modoLiquido ? "Valor Líquido" : "Valor Bruto"} deve ser maior que zero.` },
      { el: selResp, msg: "Escolha o responsável pelo lançamento." },
    ])) return;

    let bruto, taxa, frete, imposto, deducoes;

    if (modoLiquido) {
      // Valor digitado é o líquido final — nada desconta
      bruto = valorPrincipal;
      taxa = 0; frete = 0; imposto = 0; deducoes = 0;
    } else {
      taxa = _valorResolvido("taxa");
      frete = _valFrete();
      imposto = _valorResolvido("imposto");
      bruto = valorPrincipal;
      deducoes = taxa + frete + imposto + _totalExtrasVenda();

      // Deduções acima do bruto gerariam uma venda com líquido negativo.
      // O painel mostraria faturamento positivo e lucro despencando, sem
      // deixar claro de onde veio.
      if (deducoes > bruto) {
        return showToast(
          `As deduções (${fmt(deducoes)}) superam o valor bruto (${fmt(bruto)}). Revise taxa, frete e impostos.`,
          "error",
          5000,
        );
      }
    }

    const camposExtras = modoLiquido ? [] : _coletarExtras("venda");
    const eraLiquido = modoLiquido;

    // A senha do responsável (se ele tiver) vem antes de gravar.
    _lancar(_confirmarResponsavel(selResp, "lançar esta entrada"), (usuario) => {
      if (!usuario) return;
      const agora = _idNovo();
      movimentacoes.push({
        id: agora,
        tipo: "Venda",
        data,
        canalCategoria: canal,
        descricao: descDigitada || `Venda ${canal}`,
        bruto,
        deducoes,
        taxasDetalhes: { taxa, frete, imposto },
        camposExtras,
        liquido: bruto - deducoes,
        modoLiquido: eraLiquido,
        responsavel: usuario.nome,
        criadoEm: agora,
        atualizadoEm: agora,
        editado: false,
      });
      ["venda-bruto", "venda-taxa", "venda-frete", "venda-imposto", "venda-desc"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      selResp.value = "";
      _limparExtras("venda");
      _atualizarPreviewLiquido();
      _salvar();
      atualizarTela();
      _destacarNoExtrato(agora);
      showToast("Entrada lançada!", "success");
    });
  }

  function adicionarDespesa() {
    if (_lancando) return;
    const data = document.getElementById("despesa-data").value;
    const categoria = document.getElementById("despesa-categoria").value;
    const desc = document.getElementById("despesa-desc").value.trim();
    const valor = val("despesa-valor");
    const selResp = document.getElementById("despesa-responsavel");

    if (_semUsuarios(selResp)) return;
    // Descrição, valor e responsável: os que faltam ficam vermelhos.
    if (!_exigir([
      { el: document.getElementById("despesa-desc"), msg: "Preencha a descrição e o valor." },
      { el: document.getElementById("despesa-valor"), vazio: !(valor > 0), msg: "Preencha a descrição e o valor." },
      { el: selResp, msg: "Escolha o responsável pelo lançamento." },
    ])) return;

    // Campos extras que entram no cálculo (R$ e % sobre o valor)
    const extraDespesa = _totalExtrasDespesa(valor);
    const valorTotal = valor + extraDespesa;
    const camposExtras = _coletarExtras("despesa");

    // A senha do responsável (se ele tiver) vem antes de gravar.
    _lancar(_confirmarResponsavel(selResp, "lançar esta saída"), (usuario) => {
      if (!usuario) return;
      const agora = _idNovo();
      movimentacoes.push({
        id: agora,
        tipo: "Despesa",
        data,
        canalCategoria: categoria,
        descricao: desc,
        bruto: 0,
        deducoes: 0,
        camposExtras,
        liquido: -valorTotal,
        responsavel: usuario.nome,
        criadoEm: agora,
        atualizadoEm: agora,
        editado: false,
      });
      document.getElementById("despesa-desc").value = "";
      document.getElementById("despesa-valor").value = "";
      selResp.value = "";
      _limparExtras("despesa");
      _atualizarPreviewSaida();
      _salvar();
      atualizarTela();
      _destacarNoExtrato(agora);
      showToast("Saída lançada!", "success");
    });
  }

  // Id de lançamento novo: o horário em milissegundos (como sempre foi),
  // sem repetir um que já exista.
  function _idNovo() {
    let id = Date.now();
    while (movimentacoes.some((m) => m && m.id === id)) id++;
    return id;
  }

  // Pisca a linha recém-lançada no extrato (se ela estiver à vista).
  function _destacarNoExtrato(id) {
    const tr = document.querySelector(`#tabela-corpo tr[data-id="${id}"]`);
    if (!tr) return;
    tr.classList.remove("fin-linha-nova");
    void tr.offsetWidth; // reinicia a animação
    tr.classList.add("fin-linha-nova");
  }

  // Excluir pede confirmação: antes, um clique no lixo apagava na hora,
  // sem volta.
  function deletar(id) {
    const m = movimentacoes.find((x) => x.id === id);
    if (!m) return;
    const executar = () => {
      movimentacoes = movimentacoes.filter((x) => x.id !== id);
      _salvar();
      atualizarTela();
      showToast("Lançamento excluído.", "success");
    };
    if (!window.BapellModal || typeof window.BapellModal.confirmar !== "function") { executar(); return; }
    const isVenda = m.tipo === "Venda";
    const valor = isVenda ? _n(m.bruto) : Math.abs(_n(m.liquido));
    window.BapellModal.confirmar({
      perigo: true,
      titulo: "Excluir este lançamento?",
      html: `<strong>${_esc(m.descricao || (isVenda ? "Entrada" : "Saída"))}</strong> — ${fmt(valor)}, de ${_esc(fmtData(m.data)) || "data não informada"}.<br>` +
        "Ele sai do extrato e de todos os números do painel. Esta ação não pode ser desfeita.",
      botao: "Excluir",
      cancelar: "Cancelar",
    }).then((sim) => { if (sim) executar(); });
  }

  // "Duplicar": copia o lançamento para o formulário (com a data de hoje),
  // para lançar de novo uma conta que se repete — aluguel, assinatura...
  // Nada é gravado até clicar em Lançar.
  function duplicar(id) {
    const m = movimentacoes.find((x) => x.id === id);
    if (!m) return;
    const hojeIso = _isoDe(new Date());
    const preencherMoney = (elId, v) => {
      const el = document.getElementById(elId);
      if (el) el.value = _n(v) > 0 ? formatMoneyBR(_n(v)) : "";
    };
    let foco = null;
    let trocouModo = false;
    // Valores do original que caíram em campos ocultos (não são copiados:
    // campo oculto não entra na conta).
    const naoCopiados = [];
    if (m.tipo === "Venda") {
      if (modoLiquido !== !!m.modoLiquido) { modoLiquido = !!m.modoLiquido; _aplicarModoBrutoLiquido(); trocouModo = true; }
      document.getElementById("venda-data").value = hojeIso;
      const selCanal = document.getElementById("venda-canal");
      if (selCanal) {
        if (m.canalCategoria && !Array.from(selCanal.options).some((o) => o.value === m.canalCategoria)) {
          const o = document.createElement("option");
          o.value = m.canalCategoria; o.textContent = m.canalCategoria;
          selCanal.appendChild(o);
        }
        selCanal.value = m.canalCategoria || selCanal.value;
      }
      const elDesc = document.getElementById("venda-desc");
      if (elDesc) elDesc.value = m.descricao && m.descricao !== `Venda ${m.canalCategoria}` ? m.descricao : "";
      preencherMoney("venda-bruto", m.bruto);
      // Taxa e imposto voltam em R$ (o valor gravado já é em reais).
      ["taxa", "imposto"].forEach((campo) => {
        const tg = document.querySelector(`.fin-toggle-unidade[data-toggle="${campo}"] button[data-un="rs"]`);
        if (tg && unidades[campo] !== "rs") tg.click();
      });
      if (!m.modoLiquido) {
        const det = m.taxasDetalhes || {};
        const temDet = det.taxa != null || det.frete != null || det.imposto != null;
        const casados = _preencherExtras("venda", m.camposExtras);
        // As deduções além de taxa, frete e imposto (campos extras): as dos
        // campos que ainda existem voltam neles; o que sobrar (campo já
        // excluído) entra na Taxa — o líquido da cópia fica igual.
        let resto = 0;
        if (temDet) {
          const outras = Math.max(0, _n(m.deducoes) - (_n(det.taxa) + _n(det.frete) + _n(det.imposto)));
          let somaCasados = 0;
          casados.forEach((e) => {
            const v = typeof parseFormattedValue === "function" ? parseFormattedValue(e.valor) || 0 : 0;
            if (e.tipo === "money") somaCasados += v;
            else if (e.tipo === "percent") somaCasados += (_n(m.bruto) * v) / 100;
          });
          resto = Math.max(0, Math.round((outras - somaCasados) * 100) / 100);
        }
        const porCampo = (campo, valor) => {
          if (_campoOculto("venda-" + campo)) {
            if (_n(valor) > 0.004) naoCopiados.push(campo);
            preencherMoney("venda-" + campo, 0);
            return;
          }
          preencherMoney("venda-" + campo, valor);
        };
        porCampo("taxa", (temDet ? _n(det.taxa) : _n(m.deducoes)) + resto);
        porCampo("frete", temDet ? det.frete : 0);
        porCampo("imposto", temDet ? det.imposto : 0);
      } else {
        _preencherExtras("venda", []);
      }
      _atualizarPreviewLiquido();
      foco = document.getElementById("venda-bruto");
    } else {
      document.getElementById("despesa-data").value = hojeIso;
      const selCat = document.getElementById("despesa-categoria");
      if (selCat && Array.from(selCat.options).some((o) => o.value === m.canalCategoria)) selCat.value = m.canalCategoria;
      document.getElementById("despesa-desc").value = m.descricao || "";
      // O total gravado inclui os campos extras do cálculo. Os que ainda
      // existem no formulário voltam preenchidos e saem do valor; os que
      // não existem mais ficam dentro do valor (o total não muda).
      const casados = _preencherExtras("despesa", m.camposExtras);
      let somaRs = 0, somaPct = 0;
      casados.forEach((e) => {
        const v = typeof parseFormattedValue === "function" ? parseFormattedValue(e.valor) || 0 : 0;
        if (e.tipo === "money") somaRs += v;
        else if (e.tipo === "percent") somaPct += v;
      });
      const base = (Math.abs(_n(m.liquido)) - somaRs) / (1 + somaPct / 100);
      preencherMoney("despesa-valor", Math.max(0, Math.round(base * 100) / 100));
      _atualizarPreviewSaida();
      foco = document.getElementById("despesa-valor");
    }
    const card = foco && foco.closest(".fin-form-card");
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => { try { if (foco) foco.focus({ preventScroll: true }); } catch (e) {} }, 350);
    const nomes = { taxa: "a taxa", frete: "o frete", imposto: "o imposto" };
    const listaNomes = naoCopiados.map((c) => nomes[c]);
    const textoNaoCopiados = listaNomes.length
      ? ` ${(listaNomes.length > 1 ? listaNomes.slice(0, -1).join(", ") + " e " + listaNomes[listaNomes.length - 1] : listaNomes[0]).replace(/^./, (x) => x.toUpperCase())} do original não ${listaNomes.length > 1 ? "foram copiados: estão ocultos" : "foi copiado: está oculto"} (Configurar Campos).`
      : "";
    showToast(
      "Copiado para o formulário, com a data de hoje" +
        (trocouModo ? (modoLiquido ? " (no modo Valor Líquido)" : " (no modo Valor Bruto)") : "") +
        ". Confira e clique em Lançar." + textoNaoCopiados,
      "success",
      textoNaoCopiados ? 6500 : 4500,
    );
  }

  // Edição via modal
  function editar(id) {
    const m = movimentacoes.find((x) => x.id === id);
    if (!m) return;

    const ex = document.getElementById("modalEditarLanc");
    if (ex) ex.remove();

    const isVenda = m.tipo === "Venda";

    // Opções de canal/categoria conforme o tipo
    let opcoesSelect = "";
    const selFonte = document.getElementById(isVenda ? "venda-canal" : "despesa-categoria");
    if (selFonte) {
      opcoesSelect = Array.from(selFonte.options)
        .map((o) => `<option value="${_esc(o.value)}" ${o.value === m.canalCategoria ? "selected" : ""}>${_esc(o.textContent)}</option>`)
        .join("");
    }
    // Garante que o valor atual esteja na lista mesmo se não estiver no select
    if (selFonte && !Array.from(selFonte.options).some((o) => o.value === m.canalCategoria)) {
      opcoesSelect = `<option value="${_esc(m.canalCategoria)}" selected>${_esc(m.canalCategoria)}</option>` + opcoesSelect;
    }

    // Ao editar, os três componentes da dedução aparecem SEPARADOS (taxa, frete,
    // imposto) — como já acontece no formulário de adicionar venda. Vendas
    // antigas, gravadas antes desta mudança, não têm o detalhamento salvo em
    // taxasDetalhes; nesse caso o total antigo entra no campo Taxa e o usuário
    // redistribui se quiser. Assim nenhum valor histórico se perde.
    const _det = m.taxasDetalhes || {};
    const _temDetalhe = m.taxasDetalhes &&
      (m.taxasDetalhes.taxa != null || m.taxasDetalhes.frete != null || m.taxasDetalhes.imposto != null);
    const _taxa = _temDetalhe ? (_det.taxa || 0) : (m.deducoes || 0);
    const _frete = _temDetalhe ? (_det.frete || 0) : 0;
    const _imposto = _temDetalhe ? (_det.imposto || 0) : 0;
    // O que as deduções têm além de taxa, frete e imposto: os campos extras
    // do cálculo (comissão etc.). Não aparecem para editar, mas continuam
    // descontados — antes, salvar a edição apagava esse desconto.
    const _outras = _temDetalhe ? Math.max(0, _n(m.deducoes) - (_n(_det.taxa) + _n(_det.frete) + _n(_det.imposto))) : 0;

    const camposValor = isVenda
      ? `
        <div class="field-group" style="grid-column: span 2;"><label>Valor Bruto (R$)</label><div class="input-addon-wrap"><span class="input-prefix">R$</span><input type="text" inputmode="decimal" id="edit-bruto" class="input-field money-input" value="${formatMoneyBR(m.bruto)}" /></div></div>
        <div class="field-group"><label>Taxa (R$)</label><div class="input-addon-wrap"><span class="input-prefix">R$</span><input type="text" inputmode="decimal" id="edit-taxa" class="input-field money-input" value="${formatMoneyBR(_taxa)}" /></div></div>
        <div class="field-group"><label>Frete (R$)</label><div class="input-addon-wrap"><span class="input-prefix">R$</span><input type="text" inputmode="decimal" id="edit-frete" class="input-field money-input" value="${formatMoneyBR(_frete)}" /></div></div>
        <div class="field-group" style="grid-column: span 2;"><label>Imposto (R$)</label><div class="input-addon-wrap"><span class="input-prefix">R$</span><input type="text" inputmode="decimal" id="edit-imposto" class="input-field money-input" value="${formatMoneyBR(_imposto)}" /></div></div>
        ${_outras > 0.004 ? `<div class="fin-dica-campo" style="grid-column: span 2; margin:0;">Outras deduções (campos extras): <strong>${fmt(_outras)}</strong> — continuam descontadas.</div>` : ""}`
      : `
        <div class="field-group" style="grid-column: span 2;"><label>Valor (R$)</label><div class="input-addon-wrap"><span class="input-prefix">R$</span><input type="text" inputmode="decimal" id="edit-valor" class="input-field money-input" value="${formatMoneyBR(Math.abs(m.liquido))}" /></div></div>`;

    // A descrição de uma entrada é opcional. A que o app gera sozinho
    // ("Venda <canal>") acompanha o canal se ele for trocado; a escrita pela
    // pessoa (ou vinda do Registro de Vendas / Processador) é mantida.
    const descAuto = isVenda && (m.descricao || "") === `Venda ${m.canalCategoria}`;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalEditarLanc";
    overlay.innerHTML = `
      <div class="modal" style="max-width:480px; width:90%;">
        <div class="modal-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Editar ${isVenda ? "Entrada" : "Saída"}</span>
          <button type="button" id="editFecharX" style="background:transparent; border:none; color:var(--clr-text-3); font-size:22px; cursor:pointer; line-height:1;" aria-label="Fechar">✕</button>
        </div>
        <div class="fin-form-grid" style="margin-top:12px;">
          <div class="fin-linha-data">
            <div class="field-group"><label>Data</label><input type="date" id="edit-data" class="input-field" value="${_esc(m.data || "")}" /></div>
            <div class="field-group"><label>${isVenda ? "Canal de Venda" : "Categoria"}</label><select id="edit-canal" class="input-field">${opcoesSelect}</select></div>
          </div>
          ${isVenda
            ? `<div class="field-group" style="grid-column: span 2;"><label>Descrição <span class="fin-opcional">(opcional)</span></label><input type="text" id="edit-desc" class="input-field" maxlength="120" value="${_esc(descAuto ? "" : (m.descricao || ""))}" placeholder="Venda ${_esc(m.canalCategoria || "")}" /></div>`
            : `<div class="field-group" style="grid-column: span 2;"><label>Descrição</label><input type="text" id="edit-desc" class="input-field" value="${(m.descricao || "").replace(/"/g, "&quot;")}" /></div>`}
          ${camposValor}
          <div class="field-group" style="grid-column: span 2;"><label for="edit-responsavel">Responsável pela alteração <span style="color:var(--clr-danger);">*</span></label><select id="edit-responsavel" class="input-field"></select></div>
        </div>
        <div class="modal-actions" style="margin-top:16px;">
          <button class="btn-secondary" id="editCancelar">Cancelar</button>
          <button class="btn-primary" id="editSalvar" style="padding:10px var(--sp-lg); font-size:14px;">Salvar Alterações</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // A data com o mesmo calendário dos formulários (datepicker.js).
    if (window.Datepicker && typeof window.Datepicker.enhance === "function") {
      try { window.Datepicker.enhance(document.getElementById("edit-data")); } catch (e) {}
    }

    // Máscara money nos inputs do modal
    // Máscara em tempo real também no modal
    _aplicarMascarasMoney(overlay);

    // Quem está alterando: um dos usuários cadastrados (começa sem nenhum
    // escolhido, como antes começava em branco).
    const selResp = document.getElementById("edit-responsavel");
    if (window.BapellUsuarios) window.BapellUsuarios.preencherSelect(selResp, { valor: "", vazio: "Selecione quem está alterando" });

    const fechar = () => overlay.remove();
    document.getElementById("editFecharX").addEventListener("click", fechar);
    document.getElementById("editCancelar").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });

    let salvando = false;
    document.getElementById("editSalvar").addEventListener("click", () => {
      if (salvando) return;
      if (_semUsuarios(selResp)) return;

      // Lê e confere tudo ANTES de mexer no lançamento: um erro no meio do
      // caminho não pode deixar a data ou o canal trocados pela metade.
      const novaData = document.getElementById("edit-data").value || m.data;
      const novoCanal = document.getElementById("edit-canal").value;
      let novo;
      if (isVenda) {
        const elBruto = document.getElementById("edit-bruto");
        const bruto = parseFormattedValue(elBruto.value) || 0;
        const taxa = parseFormattedValue(document.getElementById("edit-taxa").value) || 0;
        const frete = parseFormattedValue(document.getElementById("edit-frete").value) || 0;
        const imposto = parseFormattedValue(document.getElementById("edit-imposto").value) || 0;
        const ded = taxa + frete + imposto + _outras;
        if (!_exigir([
          { el: elBruto, vazio: !(bruto > 0), msg: "O valor bruto deve ser maior que zero." },
          { el: selResp, msg: "Escolha o responsável pela alteração." },
        ])) return;
        if (taxa < 0 || frete < 0 || imposto < 0) return showToast("Taxa, frete e imposto não podem ser negativos.", "warning");
        // Dedução maior que o bruto geraria uma venda com líquido negativo,
        // derrubando o lucro sem que a origem fique evidente no painel.
        if (ded > bruto) return showToast(_outras > 0.004 ? "As deduções (taxa, frete, imposto e campos extras) não podem ser maiores que o valor bruto." : "A soma de taxa, frete e imposto não pode ser maior que o valor bruto.", "warning");
        const elDescV = document.getElementById("edit-desc");
        novo = { bruto, taxa, frete, imposto, ded, desc: elDescV ? elDescV.value.trim() : "" };
      } else {
        const elValor = document.getElementById("edit-valor");
        const elDesc = document.getElementById("edit-desc");
        const valor = parseFormattedValue(elValor.value) || 0;
        const desc = elDesc.value.trim();
        if (!_exigir([
          { el: elDesc, msg: "Preencha a descrição e o valor." },
          { el: elValor, vazio: !(valor > 0), msg: "Preencha a descrição e o valor." },
          { el: selResp, msg: "Escolha o responsável pela alteração." },
        ])) return;
        novo = { valor, desc };
      }

      salvando = true;
      _confirmarResponsavel(selResp, "salvar a alteração").then((usuario) => {
        salvando = false;
        // A janela da edição foi fechada enquanto a senha era pedida: nada muda.
        if (!usuario || !overlay.isConnected) return;
        m.data = novaData;
        m.canalCategoria = novoCanal;
        if (isVenda) {
          m.bruto = novo.bruto;
          // Guarda o detalhamento (alimenta os gráficos do dashboard) e o total.
          // Antes, editar atualizava só o total e os gráficos ficavam com o
          // detalhamento antigo — agora os dois andam juntos.
          m.taxasDetalhes = { taxa: novo.taxa, frete: novo.frete, imposto: novo.imposto };
          m.deducoes = novo.ded;
          m.liquido = novo.bruto - novo.ded;
          m.descricao = novo.desc || `Venda ${m.canalCategoria}`;
        } else {
          m.descricao = novo.desc;
          m.liquido = -novo.valor;
        }
        // Marca como editado, troca o responsável e atualiza o horário
        m.responsavel = usuario.nome;
        m.editado = true;
        m.atualizadoEm = Date.now();

        _salvar();
        atualizarTela();
        fechar();
        showToast("Lançamento atualizado.", "success");
      });
    });
  }

  // ══════════════════════════════════════════
  //  FILTRO DE PERÍODO
  // ══════════════════════════════════════════
  // Filtro de período específico do extrato (independente do topo)
  function _dentroPeriodoExtrato(m, periodo) {
    if (periodo === "todos") return true;
    if (!m.data) return false;
    const agora = new Date();
    const [ano, mes] = String(m.data).split("-");
    if (periodo === "mes") {
      return parseInt(ano) === agora.getFullYear() && parseInt(mes) === agora.getMonth() + 1;
    }
    if (periodo === "ano") {
      return parseInt(ano) === agora.getFullYear();
    }
    if (periodo === "custom") {
      const ini = (document.getElementById("extratoInicio") || {}).value;
      const fim = (document.getElementById("extratoFim") || {}).value;
      const dia = String(m.data).slice(0, 10);
      if (ini && dia < ini) return false;
      if (fim && dia > fim) return false;
      return true;
    }
    return true;
  }

  // Intervalo [ini, fim] de um período, em "AAAA-MM-DD" (inclusive). Um lado
  // null fica aberto. "mes" e "ano" pegam o mês/ano INTEIRO (inclusive o
  // que foi lançado com data à frente), como sempre foi.
  function _intervalo(periodo) {
    const h = new Date();
    const y = h.getFullYear(), mo = h.getMonth();
    switch (periodo) {
      case "mes": return { ini: _isoDe(new Date(y, mo, 1)), fim: _isoDe(new Date(y, mo + 1, 0)) };
      case "mesAnterior": return { ini: _isoDe(new Date(y, mo - 1, 1)), fim: _isoDe(new Date(y, mo, 0)) };
      case "ano": return { ini: `${y}-01-01`, fim: `${y}-12-31` };
      case "12m": return { ini: _isoDe(new Date(y, mo - 11, 1)), fim: _isoDe(new Date(y, mo + 1, 0)) };
      case "custom": {
        const ini = (document.getElementById("periodoInicio") || {}).value || null;
        const fim = (document.getElementById("periodoFim") || {}).value || null;
        // Datas trocadas (o fim antes do início): vale o intervalo entre elas.
        if (ini && fim && fim < ini) return { ini: fim, fim: ini };
        return { ini, fim };
      }
      default: return { ini: null, fim: null }; // "tudo"
    }
  }

  // O período de comparação (o "anterior" dos indicadores e do DRE):
  //   · Mês atual  → o mesmo trecho do mês passado (1º até o dia de hoje);
  //   · Mês passado → o mês antes dele;
  //   · Ano atual  → o mesmo trecho do ano passado (1º/jan até hoje);
  //   · 12 meses   → os 12 meses anteriores;
  //   · Personalizado → o mesmo número de dias, logo antes do início;
  //   · Tudo       → sem comparação (null).
  function _intervaloComparacao(periodo) {
    const h = new Date();
    const y = h.getFullYear(), mo = h.getMonth();
    const diasNoMes = (ano, mes) => new Date(ano, mes + 1, 0).getDate();
    // O dia de referência do "até hoje": hoje — ou o último lançamento do
    // período, se houver algum com data à frente (uma conta agendada para o
    // dia 28 compara com o mês passado até o dia 28, não só até hoje).
    const referencia = (iv) => {
      const ult = _ultimaData(iv);
      return ult && ult > _isoDe(h) ? _dataDe(ult) : h;
    };
    switch (periodo) {
      case "mes": {
        const ref = referencia(_intervalo("mes"));
        const ant = new Date(y, mo - 1, 1);
        return { ini: _isoDe(ant), fim: _isoDe(new Date(ant.getFullYear(), ant.getMonth(), Math.min(ref.getDate(), diasNoMes(ant.getFullYear(), ant.getMonth())))) };
      }
      case "mesAnterior": return { ini: _isoDe(new Date(y, mo - 2, 1)), fim: _isoDe(new Date(y, mo - 1, 0)) };
      case "ano": {
        const ref = referencia(_intervalo("ano"));
        return { ini: `${y - 1}-01-01`, fim: _isoDe(new Date(y - 1, ref.getMonth(), Math.min(ref.getDate(), diasNoMes(y - 1, ref.getMonth())))) };
      }
      case "12m": return { ini: _isoDe(new Date(y, mo - 23, 1)), fim: _isoDe(new Date(y, mo - 11, 0)) };
      case "custom": {
        const iv = _intervalo("custom");
        if (!iv.ini || !iv.fim || iv.fim < iv.ini) return null;
        const dias = _diasEntre(iv.ini, iv.fim) + 1;
        const fim = _somarDias(iv.ini, -1);
        return { ini: _somarDias(fim, -(dias - 1)), fim };
      }
      default: return null;
    }
  }

  // A data do lançamento ("AAAA-MM-DD"; um horário junto é ignorado).
  const _diaDe = (m) => String((m && m.data) || "").slice(0, 10);

  const _dentroDe = (m, iv) => {
    if (!iv || (!iv.ini && !iv.fim)) return true;
    if (!m || !m.data) return false;
    const dia = _diaDe(m);
    if (iv.ini && dia < iv.ini) return false;
    if (iv.fim && dia > iv.fim) return false;
    return true;
  };

  // A data do último lançamento dentro de um intervalo, ou null.
  function _ultimaData(iv) {
    let ult = null;
    movimentacoes.forEach((m) => {
      if (!m || !m.data || !_dentroDe(m, iv)) return;
      const dia = _diaDe(m);
      if (!ult || dia > ult) ult = dia;
    });
    return ult;
  }

  // Um intervalo em texto: "01/10/2026 a 31/10/2026", "outubro de 2026"...
  function _textoIntervalo(iv, curto) {
    if (!iv || (!iv.ini && !iv.fim)) return "todo o histórico";
    if (iv.ini && !iv.fim) return "desde " + fmtData(iv.ini);
    if (!iv.ini && iv.fim) return "até " + fmtData(iv.fim);
    const a = _dataDe(iv.ini), b = _dataDe(iv.fim);
    const mesInteiro = a.getDate() === 1 && b.getDate() === new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate();
    if (mesInteiro && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
      return curto ? `${MESES_ABREV[a.getMonth()]}/${a.getFullYear()}` : `${MESES_NOME[a.getMonth()]} de ${a.getFullYear()}`;
    }
    // Meses inteiros: o ano todo ("2026") ou "nov/2025 a out/2026".
    if (mesInteiro) {
      if (a.getMonth() === 0 && b.getMonth() === 11 && a.getFullYear() === b.getFullYear()) return curto ? String(a.getFullYear()) : `ano de ${a.getFullYear()}`;
      return `${MESES_ABREV[a.getMonth()]}/${a.getFullYear()} a ${MESES_ABREV[b.getMonth()]}/${b.getFullYear()}`;
    }
    if (curto && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
      return `${a.getDate()} a ${b.getDate()} ${MESES_ABREV[a.getMonth()]}/${String(a.getFullYear()).slice(2)}`;
    }
    if (curto) return `${fmtData(iv.ini).slice(0, 5)}/${String(a.getFullYear()).slice(2)} a ${fmtData(iv.fim).slice(0, 5)}/${String(b.getFullYear()).slice(2)}`;
    return `${fmtData(iv.ini)} a ${fmtData(iv.fim)}`;
  }

  const ROTULOS_PERIODO = {
    mes: "Mês atual", mesAnterior: "Mês passado", ano: "Ano atual",
    "12m": "Últimos 12 meses", tudo: "Todo o período", custom: "Período personalizado",
  };

  // A comparação numa frase ("em relação ao mesmo período do mês passado").
  function _rotuloComparacao(ivAnt) {
    if (!ivAnt) return "";
    switch (periodoAtual) {
      case "mes": return "ao mesmo período do mês passado";
      case "mesAnterior": { const d = _dataDe(ivAnt.ini); return `a ${MESES_NOME[d.getMonth()]} de ${d.getFullYear()}`; }
      case "ano": return "ao mesmo período do ano passado";
      case "12m": return "aos 12 meses anteriores";
      default: return `ao período anterior (${_textoIntervalo(ivAnt)})`;
    }
  }

  function _dentroDoPeriodo(m) {    if (periodoAtual === "tudo") return true;
    if (!m.data) return false;
    // Todos os períodos viram um intervalo de datas (o "Mês atual" é o mês
    // inteiro, o "Ano atual" o ano inteiro — o mesmo de antes).
    return _dentroDe(m, _intervalo(periodoAtual));
  }

  // ══════════════════════════════════════════
  //  ATUALIZAR TELA
  // ══════════════════════════════════════════

  // Categorias das saídas: o código gravado no lançamento → o nome na tela.
  const CATEGORIAS_SAIDA = {
    CMV: "Custo de produto (CMV)", Operacional: "Despesas operacionais", Fixa: "Despesas fixas",
    Software: "Softwares", Marketing: "Marketing e anúncios", Perdas: "Perdas", Outros: "Outros",
    // Lançada pelo Gestor de Devoluções (imposto das devoluções não reembolsadas).
    "DEVOLUÇÃO": "Devoluções",
  };
  // Cores dos canais: as mesmas no gráfico "Receita por Canal" e na tabela
  // "Desempenho por Canal".
  const PALETA_CANAIS = ["#3b82f6", "#16a34a", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#ef4444", "#64748b", "#eab308", "#14b8a6"];

  /**
   * Soma uma lista de lançamentos em todos os números da tela. As contas
   * são as de sempre:
   *   despesas totais = deduções das vendas + saídas que não são CMV;
   *   lucro líquido   = faturamento − CMV − despesas totais.
   */
  function _resumir(lista) {
    const r = {
      faturamento: 0, deducoes: 0, taxa: 0, frete: 0, imposto: 0, outrasDed: 0,
      cmv: 0, oper: 0, fixa: 0, soft: 0, mkt: 0, perdas: 0, devolucoes: 0, outros: 0, despesasOutras: 0,
      qtdVendas: 0, qtdSaidas: 0, porCanal: {}, porDiaSemana: [0, 0, 0, 0, 0, 0, 0], porCategoria: {},
    };
    (lista || []).forEach((m) => {
      // _n() garante número finito: um único lançamento corrompido
      // (string, null, undefined) tornaria TODOS os KPIs "NaN".
      if (!m || typeof m !== "object") return;
      if (m.tipo === "Venda") {
        const bruto = _n(m.bruto), ded = _n(m.deducoes);
        r.faturamento += bruto;
        r.deducoes += ded;
        r.qtdVendas++;
        let t = 0, f = 0, i = 0;
        if (m.taxasDetalhes) {
          t = _n(m.taxasDetalhes.taxa); f = _n(m.taxasDetalhes.frete); i = _n(m.taxasDetalhes.imposto);
        }
        r.taxa += t; r.frete += f; r.imposto += i;
        // O que sobra das deduções: campos extras do cálculo, ou vendas
        // antigas, gravadas sem o detalhamento.
        r.outrasDed += Math.max(0, ded - (t + f + i));
        const canal = m.canalCategoria || "Sem canal";
        const c = r.porCanal[canal] || (r.porCanal[canal] = { bruto: 0, ded: 0, qtd: 0 });
        c.bruto += bruto; c.ded += ded; c.qtd++;
        if (m.data) {
          const ds = _dataDe(_diaDe(m)).getDay();
          if (ds >= 0 && ds <= 6) r.porDiaSemana[ds] += bruto;
        }
      } else {
        const v = Math.abs(_n(m.liquido));
        r.qtdSaidas++;
        switch (m.canalCategoria) {
          case "CMV": r.cmv += v; break;
          case "Operacional": r.oper += v; break;
          case "Fixa": r.fixa += v; break;
          case "Software": r.soft += v; break;
          case "Marketing": r.mkt += v; break;
          case "Perdas": r.perdas += v; break;
          case "DEVOLUÇÃO": r.devolucoes += v; break;
          default: r.outros += v;
        }
        if (m.canalCategoria !== "CMV") r.despesasOutras += v;
        const cat = m.canalCategoria || "Outros";
        r.porCategoria[cat] = (r.porCategoria[cat] || 0) + v;
      }
    });
    r.despesasTotais = r.deducoes + r.despesasOutras;
    r.receitaLiquida = r.faturamento - r.deducoes;
    r.lucroBruto = r.receitaLiquida - r.cmv;
    r.lucro = r.faturamento - r.cmv - r.despesasTotais;
    r.margem = r.faturamento > 0 ? (r.lucro / r.faturamento) * 100 : 0;
    r.margemBruta = r.faturamento > 0 ? (r.lucroBruto / r.faturamento) * 100 : 0;
    r.ticket = r.qtdVendas > 0 ? r.faturamento / r.qtdVendas : 0;
    r.saidas = r.cmv + r.despesasOutras;
    r.vazio = r.qtdVendas === 0 && r.qtdSaidas === 0;
    return r;
  }

  // Os números de cada mês ("AAAA-MM"), de todos os lançamentos.
  function _porMes() {
    const grupos = {};
    movimentacoes.forEach((m) => {
      if (!m || !m.data) return;
      const k = String(m.data).slice(0, 7);
      (grupos[k] || (grupos[k] = [])).push(m);
    });
    const out = {};
    Object.keys(grupos).forEach((k) => { out[k] = _resumir(grupos[k]); });
    return out;
  }

  const _chaveMes = (d) => `${d.getFullYear()}-${_p2(d.getMonth() + 1)}`;
  function _mesMais(chave, n) {
    const [a, m] = chave.split("-").map(Number);
    return _chaveMes(new Date(a, m - 1 + n, 1));
  }
  function _listaMeses(ini, fim) {
    const out = [];
    let k = ini, guarda = 0;
    while (k <= fim && guarda++ < 600) { out.push(k); k = _mesMais(k, 1); }
    return out;
  }

  // Os meses dos gráficos mensais: os do período escolhido. Um período
  // curto (um mês) mostra os 12 meses até ele, para dar contexto; um período
  // que vai além de hoje para no mês atual (a não ser que haja lançamento
  // com data à frente).
  function _mesesDoGrafico(porMes) {
    const atual = _chaveMes(new Date());
    const comDados = Object.keys(porMes).sort();
    const iv = _intervalo(periodoAtual);
    let fim = iv.fim ? iv.fim.slice(0, 7) : (comDados.length && comDados[comDados.length - 1] > atual ? comDados[comDados.length - 1] : atual);
    if (fim > atual) {
      const ultimo = comDados.filter((k) => k <= fim).pop();
      fim = ultimo && ultimo > atual ? ultimo : atual;
    }
    let ini = iv.ini ? iv.ini.slice(0, 7) : (comDados[0] || fim);
    if (ini > fim) ini = fim;
    let lista = _listaMeses(ini, fim);
    if (lista.length < 6 && periodoAtual !== "ano") lista = _listaMeses(_mesMais(fim, -11), fim);
    if (lista.length > 36) lista = lista.slice(-36);
    return lista;
  }

  function atualizarTela() {
    const iv = _intervalo(periodoAtual);
    const ivAnt = _intervaloComparacao(periodoAtual);
    const filtradas = movimentacoes.filter(_dentroDoPeriodo);
    const cur = _resumir(filtradas);
    const ant = ivAnt ? _resumir(movimentacoes.filter((m) => _dentroDe(m, ivAnt))) : null;
    const porMes = _porMes();
    const meses = _mesesDoGrafico(porMes);

    _renderInfoPeriodo(iv, ivAnt, filtradas.length);
    _renderKpis(cur, ant, ivAnt, porMes, meses[meses.length - 1]);
    _renderExtrato();
    _renderGraficos({ cur, porMes, meses, iv, filtradas });
    _renderMeta();
    _renderInsights({ cur, ant, iv, ivAnt });
    _renderDre(cur, ant, ivAnt);
    _renderCanais(cur);
    _renderSugestoesSaida();
    _renderAtalhosSaida();
  }

  // ── Título e linha do período ──
  function _renderInfoPeriodo(iv, ivAnt, qtd) {
    const emp = _empresaAtiva();
    const sub = document.getElementById("finSubtitulo");
    if (sub) {
      sub.innerHTML = emp
        ? `<strong>${_esc(emp.nome || "Empresa")}</strong> · ${_esc(ROTULOS_PERIODO[periodoAtual] || "")}` +
          (periodoAtual === "tudo" ? "" : ` · ${_esc(_textoIntervalo(iv, periodoAtual === "ano"))}`)
        : "";
    }
    const info = document.getElementById("finPeriodoInfo");
    if (info) {
      const partes = [`<span>Mostrando <strong>${_esc(_textoIntervalo(iv))}</strong></span>`];
      partes.push(ivAnt
        ? `<span>Comparando com <strong>${_esc(_textoIntervalo(ivAnt))}</strong></span>`
        : `<span>Sem comparação neste período</span>`);
      partes.push(`<span>${qtd} lançamento${qtd === 1 ? "" : "s"}</span>`);
      info.innerHTML = partes.join('<span class="fin-periodo__sep" aria-hidden="true">•</span>');
    }
  }

  // ── Indicadores ──
  /**
   * Variação em relação ao período anterior.
   * maiorEhMelhor: subir é bom (faturamento) ou ruim (custos)?
   * pontos: diferença em pontos percentuais (a margem).
   */
  function _delta(atual, anterior, maiorEhMelhor, pontos) {
    if (anterior == null) return null;
    // Nada nos dois períodos: não há o que comparar.
    if (Math.abs(atual) < 0.005 && Math.abs(anterior) < 0.005) return null;
    if (pontos) {
      const dif = atual - anterior;
      if (Math.abs(dif) < 0.05) return { texto: "= 0,0 p.p.", classe: "" };
      return {
        texto: (dif > 0 ? "▲ " : "▼ ") + Math.abs(dif).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " p.p.",
        classe: (dif > 0) === maiorEhMelhor ? "bom" : "ruim",
      };
    }
    if (Math.abs(anterior) < 0.005) {
      if (Math.abs(atual) < 0.005) return { texto: "= 0%", classe: "" };
      return { texto: "—", classe: "", semBase: true };
    }
    const pct = ((atual - anterior) / Math.abs(anterior)) * 100;
    if (Math.abs(pct) < 0.05) return { texto: "= 0%", classe: "" };
    const abs = Math.abs(pct);
    return {
      texto: (pct > 0 ? "▲ " : "▼ ") + (abs >= 1000 ? "999%+" : fmtPct(abs, abs >= 100 ? 0 : 1)),
      classe: (pct > 0) === maiorEhMelhor ? "bom" : "ruim",
    };
  }

  // Minigráfico (SVG) dos valores de cada mês. Escala do menor ao maior
  // valor da série; uma série reta fica no meio.
  // parcial: o último mês ainda não terminou — o trecho final fica
  // tracejado (a queda ali é do mês incompleto, não de um mês ruim).
  function _sparkline(valores, parcial) {
    if (!valores.length) return "";
    const w = 120, h = 40, folga = 4;
    const max = Math.max.apply(null, valores), min = Math.min.apply(null, valores);
    const faixa = max - min;
    const passo = valores.length > 1 ? w / (valores.length - 1) : w;
    const pts = valores.map((v, i) => [i * passo, faixa ? folga + (h - 2 * folga) * (1 - (v - min) / faixa) : h / 2]);
    if (pts.length === 1) pts.push([w, pts[0][1]]);
    const caminho = (lista) => lista.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const linha = caminho(pts);
    const tracejar = parcial && valores.length >= 2;
    const cheia = tracejar ? caminho(pts.slice(0, -1)) : linha;
    const gid = "finSpark" + Math.random().toString(36).slice(2, 9);
    const traco = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"';
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" focusable="false">` +
      `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="currentColor" stop-opacity="0.26"></stop><stop offset="1" stop-color="currentColor" stop-opacity="0"></stop>` +
      `</linearGradient></defs>` +
      `<path d="${linha} L ${w} ${h} L 0 ${h} Z" fill="url(#${gid})" stroke="none"></path>` +
      `<path d="${cheia}" ${traco}></path>` +
      (tracejar ? `<path d="${caminho(pts.slice(-2))}" ${traco} stroke-dasharray="3 4" opacity="0.8"></path>` : "") +
      `</svg>`;
  }

  function _renderKpis(c, a, ivAnt, porMes, mesFim) {
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set("card-faturamento", fmt(c.faturamento));
    set("card-cmv", fmt(c.cmv));
    set("card-despesas", fmt(c.despesasTotais));
    set("card-lucro", fmt(c.lucro));
    set("card-margem", fmtPct(c.margem));
    set("card-ticket", fmt(c.ticket));

    // Lucro e margem: verde no positivo, vermelho no negativo (o card todo
    // acompanha — ícone, faixa e minigráfico).
    const corLucro = c.lucro >= 0 ? "var(--clr-success)" : "var(--clr-danger)";
    ["card-lucro", "card-margem"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.color = corLucro;
      const card = el.closest(".fin-card");
      if (card) card.dataset.tom = c.lucro >= 0 ? "sucesso" : "perigo";
    });

    const pctFat = (v) => (c.faturamento > 0 ? fmtPct((v / c.faturamento) * 100, 0) + " do faturamento" : "");
    set("sub-faturamento", `${c.qtdVendas} entrada${c.qtdVendas === 1 ? "" : "s"}`);
    set("sub-cmv", pctFat(c.cmv));
    set("sub-despesas", pctFat(c.despesasTotais));
    set("sub-lucro", c.qtdVendas > 0 ? `${fmt(c.lucro / c.qtdVendas)} por venda` : "");
    set("sub-margem", c.faturamento > 0 ? `Margem bruta ${fmtPct(c.margemBruta)}` : "");
    set("sub-ticket", c.qtdVendas > 0 ? `${fmt(c.receitaLiquida / c.qtdVendas)} líquido` : "");

    const rotuloAnt = ivAnt ? _textoIntervalo(ivAnt, true) : "";
    const kpis = [
      { id: "faturamento", atual: c.faturamento, ant: a && a.faturamento, bom: true, f: fmt, mes: (r) => r.faturamento },
      { id: "cmv", atual: c.cmv, ant: a && a.cmv, bom: false, f: fmt, mes: (r) => r.cmv },
      { id: "despesas", atual: c.despesasTotais, ant: a && a.despesasTotais, bom: false, f: fmt, mes: (r) => r.despesasTotais },
      { id: "lucro", atual: c.lucro, ant: a && a.lucro, bom: true, f: fmt, mes: (r) => r.lucro },
      { id: "margem", atual: c.margem, ant: a && a.margem, bom: true, f: (v) => fmtPct(v), pontos: true, mes: (r) => r.margem },
      { id: "ticket", atual: c.ticket, ant: a && a.ticket, bom: true, f: fmt, mes: (r) => r.ticket },
    ];
    // Os 6 meses até o fim do período, para os minigráficos. O mês atual
    // ainda está em andamento (a não ser no último dia).
    const meses = _listaMeses(_mesMais(mesFim, -5), mesFim);
    const hoje = new Date();
    const mesEmAndamento = mesFim === _chaveMes(hoje) && hoje.getDate() < new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    kpis.forEach((k) => {
      const el = document.getElementById("delta-" + k.id);
      if (el) {
        const d = a ? _delta(k.atual, k.ant, k.bom, k.pontos) : null;
        el.textContent = d ? d.texto : "";
        el.className = "fin-delta" + (d && d.classe ? " " + d.classe : "");
        el.title = d
          ? (d.semBase ? `Sem valor em ${rotuloAnt} para comparar` : `Antes: ${k.f(k.ant)} (${rotuloAnt})`)
          : "";
      }
      const sp = document.getElementById("spark-" + k.id);
      if (sp) {
        const valores = meses.map((mk) => (porMes[mk] ? _n(k.mes(porMes[mk])) : 0));
        sp.innerHTML = _sparkline(valores, mesEmAndamento);
        sp.title = meses.map((mk, i) => `${_rotuloMes(mk)}: ${k.f(valores[i])}${mesEmAndamento && i === meses.length - 1 ? " (até hoje)" : ""}`).join("\n");
      }
    });
  }

  // ── Extrato ──
  // Ícones das linhas do extrato
  const ICO_ENTRADA = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="17" y1="7" x2="7" y2="17"></line><polyline points="17 17 7 17 7 7"></polyline></svg>';
  const ICO_SAIDA = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>';
  const ICO_COPIAR = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  const ICO_EDITAR = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>';
  const ICO_LIXO = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

  // Popula o filtro com TODAS as opções disponíveis:
  // canais de venda (do select, respeita plataformas ocultas) + categorias de despesa + as já usadas
  function _popularFiltroCategoria() {
    const selCat = document.getElementById("filtroCategoria");
    if (!selCat) return;
    const opcoes = new Set();
    const selCanal = document.getElementById("venda-canal");
    if (selCanal) Array.from(selCanal.options).forEach((o) => opcoes.add(o.value));
    const selDesp = document.getElementById("despesa-categoria");
    if (selDesp) Array.from(selDesp.options).forEach((o) => opcoes.add(o.value));
    // Categorias já usadas em lançamentos (caso alguma tenha sido removida do select)
    movimentacoes.forEach((m) => { if (m && m.canalCategoria) opcoes.add(m.canalCategoria); });
    const cats = [...opcoes].sort((x, y) => String(x).localeCompare(String(y), "pt-BR"));
    const catAtual = selCat.value;
    const html = '<option value="todos">Todas as categorias</option>' +
      cats.map((c) => `<option value="${_esc(c)}">${_esc(CATEGORIAS_SAIDA[c] && c !== "Outros" ? CATEGORIAS_SAIDA[c] : c)}</option>`).join("");
    if (selCat.innerHTML !== html) selCat.innerHTML = html;
    selCat.value = cats.includes(catAtual) || catAtual === "todos" ? catAtual : "todos";
  }

  // Os lançamentos do extrato: período do painel + filtros + busca, na
  // ordem escolhida.
  function _listaExtrato() {
    const busca = ((document.getElementById("buscaExtrato") || {}).value || "").toLowerCase().trim();
    const fTipo = (document.getElementById("filtroTipo") || {}).value || "todos";
    const fCat = (document.getElementById("filtroCategoria") || {}).value || "todos";
    const fPer = (document.getElementById("filtroPeriodoExtrato") || {}).value || "todos";
    // "Período do painel" segue os chips do alto; os outros períodos do
    // extrato valem SOZINHOS (antes os dois se somavam: com "Mês passado" no
    // painel e "Mês atual" no extrato, a lista ficava sempre vazia).
    const lista = movimentacoes
      .filter((m) => m && typeof m === "object")
      .filter((m) => (fPer === "todos" ? _dentroDoPeriodo(m) : _dentroPeriodoExtrato(m, fPer)))
      .filter((m) => fTipo === "todos" || m.tipo === fTipo)
      .filter((m) => fCat === "todos" || m.canalCategoria === fCat)
      .filter((m) =>
        !busca ||
        (m.descricao || "").toLowerCase().includes(busca) ||
        (m.canalCategoria || "").toLowerCase().includes(busca) ||
        (m.responsavel || "").toLowerCase().includes(busca)
      );
    const { campo, dir } = _ordemExtrato;
    const sinal = dir === "asc" ? 1 : -1;
    const valor = (m) => {
      if (campo === "bruto") return m.tipo === "Venda" ? _n(m.bruto) : Math.abs(_n(m.liquido));
      if (campo === "liquido") return _n(m.liquido);
      return 0;
    };
    const quando = (m) => _n(m.criadoEm) || _n(m.id);
    return lista.sort((x, y) => {
      if (campo !== "data") {
        const d = valor(x) - valor(y);
        if (d) return d * sinal;
      } else {
        const dx = String(x.data || ""), dy = String(y.data || "");
        if (dx !== dy) return (dx < dy ? -1 : 1) * sinal;
      }
      // Empate: o lançado por último primeiro.
      return quando(y) - quando(x);
    });
  }

  function _renderExtrato() {
    const tbody = document.getElementById("tabela-corpo");
    if (!tbody) return;
    _popularFiltroCategoria();
    const lista = _listaExtrato();

    document.querySelectorAll(".fin-extrato th.fin-ordenavel").forEach((th) => {
      const ativo = th.dataset.ordem === _ordemExtrato.campo;
      th.classList.toggle("asc", ativo && _ordemExtrato.dir === "asc");
      th.classList.toggle("desc", ativo && _ordemExtrato.dir === "desc");
      th.setAttribute("aria-sort", ativo ? (_ordemExtrato.dir === "asc" ? "ascending" : "descending") : "none");
      th.title = "Ordenar por " + th.textContent.trim().toLowerCase();
    });

    const vazio = document.getElementById("extratoVazio");
    if (vazio) vazio.style.display = lista.length === 0 ? "block" : "none";

    // Totais do que está filtrado
    let entradas = 0, saidas = 0;
    lista.forEach((m) => {
      if (m.tipo === "Venda") entradas += _n(m.liquido);
      else saidas += Math.abs(_n(m.liquido));
    });
    const saldo = entradas - saidas;
    const resumo = document.getElementById("extratoResumo");
    if (resumo) {
      resumo.innerHTML = lista.length
        ? `<span class="fin-resumo-pill"><strong>${lista.length}</strong> lançamento${lista.length === 1 ? "" : "s"}</span>` +
          `<span class="fin-resumo-pill fin-resumo-pill--entrada" title="Soma do líquido das entradas">Entradas <strong>${fmt(entradas)}</strong></span>` +
          `<span class="fin-resumo-pill fin-resumo-pill--saida">Saídas <strong>${fmt(saidas)}</strong></span>` +
          `<span class="fin-resumo-pill fin-resumo-pill--saldo ${saldo < 0 ? "negativo" : "positivo"}">Saldo <strong>${fmt(saldo)}</strong></span>`
        : "";
    }

    const visiveis = lista.slice(0, _limiteExtrato);
    tbody.innerHTML = visiveis.map((m) => {
      const isVenda = m.tipo === "Venda";
      // Data + hora da última alteração (ou criação)
      const ts = m.atualizadoEm || m.criadoEm;
      const hora = ts ? new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
      const origem = m.origemVendaId ? "Registro de Vendas" : (m.origem === "vendas-import" ? "Processador" : (m.origem === "devolucoes" ? "Gestor de Devoluções" : ""));
      const nada = '<span class="fin-valor-nada">—</span>';
      return `<tr data-id="${_esc(m.id)}">
        <td class="fin-extrato-data">${_esc(fmtData(m.data)) || nada}${hora ? `<br><span class="fin-extrato-hora">${hora}</span>` : ""}</td>
        <td><span class="fin-badge ${isVenda ? "fin-badge-venda" : "fin-badge-despesa"}" title="${isVenda ? "Entrada" : "Saída"}">${isVenda ? ICO_ENTRADA : ICO_SAIDA}${_esc(m.canalCategoria || (isVenda ? "Entrada" : "Saída"))}</span></td>
        <td class="fin-extrato-desc">${_esc(m.descricao)}${m.editado ? '<span class="fin-tag fin-tag--editado" title="Lançamento editado">editado</span>' : ""}${origem ? `<span class="fin-tag fin-tag--origem" title="Lançado pelo ${origem}">${origem}</span>` : ""}</td>
        <td>${_esc(m.responsavel || "—")}</td>
        <td class="num">${isVenda ? fmt(m.bruto) : nada}</td>
        <td class="num${isVenda && _n(m.deducoes) ? " fin-valor-ded" : ""}">${isVenda && _n(m.deducoes) ? "\u2212 " + fmt(m.deducoes) : nada}</td>
        <td class="num ${isVenda ? "fin-valor-entrada" : "fin-valor-saida"}">${fmt(m.liquido)}</td>
        <td class="fin-acoes">
          <button type="button" class="fin-acao-btn" data-dup="${_esc(m.id)}" title="Duplicar: copia para o formulário" aria-label="Duplicar">${ICO_COPIAR}</button><button type="button" class="fin-acao-btn" data-edit="${_esc(m.id)}" title="Editar" aria-label="Editar">${ICO_EDITAR}</button><button type="button" class="fin-acao-btn danger" data-del="${_esc(m.id)}" title="Excluir" aria-label="Excluir">${ICO_LIXO}</button>
        </td>
      </tr>`;
    }).join("");

    const mais = document.getElementById("extratoMais");
    if (mais) {
      const resta = lista.length - visiveis.length;
      mais.hidden = resta <= 0;
      const cont = document.getElementById("extratoContagem");
      if (cont) cont.textContent = `Mostrando ${visiveis.length} de ${lista.length}`;
      const btn = document.getElementById("btnExtratoMais");
      if (btn) btn.textContent = `Mostrar mais ${Math.min(PASSO_EXTRATO, Math.max(resta, 0))}`;
    }
  }

  // O id do lançamento a partir do data-* do botão (o id pode ser número
  // ou texto, conforme quem lançou).
  function _idDe(txt) {
    const m = movimentacoes.find((x) => x && String(x.id) === String(txt));
    return m ? m.id : null;
  }

  // ── Sugestões da Descrição (Registrar Saída) ──
  function _renderSugestoesSaida() {
    const dl = document.getElementById("finSugestoesSaida");
    if (!dl) return;
    const cont = {};
    movimentacoes.forEach((m) => {
      if (!m || m.tipo === "Venda" || !m.descricao) return;
      const d = String(m.descricao).trim();
      if (d) cont[d] = (cont[d] || 0) + 1;
    });
    const html = Object.keys(cont)
      .sort((x, y) => cont[y] - cont[x] || x.localeCompare(y, "pt-BR"))
      .slice(0, 40)
      .map((d) => `<option value="${_esc(d)}"></option>`)
      .join("");
    if (dl.innerHTML !== html) dl.innerHTML = html;
  }

  // ── "Lançar de novo" (Registrar Saída) ──
  // As saídas que se repetem nos últimos 4 meses (aluguel, luz, ERP...):
  // um clique copia a mais recente para o formulário (ver duplicar).
  function _renderAtalhosSaida() {
    const caixa = document.getElementById("finAtalhosSaida");
    const lista = document.getElementById("finAtalhosSaidaLista");
    if (!caixa || !lista) return;
    const desde = _somarDias(_isoDe(new Date()), -120);
    const grupos = {};
    movimentacoes.forEach((m) => {
      if (!m || m.tipo === "Venda" || !m.descricao || !m.data || _diaDe(m) < desde) return;
      const k = String(m.descricao).trim().toLowerCase();
      if (!k) return;
      const g = grupos[k] || (grupos[k] = { n: 0, ultimo: null });
      g.n++;
      if (!g.ultimo || String(m.data) > String(g.ultimo.data) || (m.data === g.ultimo.data && _n(m.criadoEm) > _n(g.ultimo.criadoEm))) g.ultimo = m;
    });
    const top = Object.values(grupos)
      .filter((g) => g.n >= 2)
      .sort((x, y) => y.n - x.n || String(y.ultimo.data).localeCompare(String(x.ultimo.data)))
      .slice(0, 4);
    caixa.hidden = !top.length;
    lista.innerHTML = top.map((g) => {
      const m = g.ultimo;
      const cat = CATEGORIAS_SAIDA[m.canalCategoria] || m.canalCategoria || "";
      return `<button type="button" class="fin-atalho" data-dup="${_esc(m.id)}" title="${_esc(`Copiar para o formulário: ${m.descricao} — ${fmt(Math.abs(_n(m.liquido)))}${cat ? ` (${cat})` : ""}`)}">` +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>' +
        `<span>${_esc(m.descricao)}</span></button>`;
    }).join("");
  }

  // ── DRE do período ──
  let _ultimoDre = null;
  const _fmtDre = (v) => (v < -0.004 ? "− " + fmt(-v) : fmt(v));
  const ICO_SETA_DRE = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>';

  function _renderDre(c, a, ivAnt) {
    _ultimoDre = { c, a, ivAnt };
    const corpo = document.getElementById("finDreCorpo");
    const tabela = document.getElementById("finDre");
    if (!corpo || !tabela) return;
    tabela.classList.toggle("sem-comparacao", !a);
    const fat = c.faturamento;
    const ant = (campo, sinal) => (a ? sinal * _n(a[campo]) : null);

    const linhas = [
      { id: "rec", conta: "Receita bruta de vendas", v: c.faturamento, va: ant("faturamento", 1), cls: "dre-receita" },
      { id: "ded", conta: "(−) Deduções das vendas", v: -c.deducoes, va: ant("deducoes", -1), cls: "dre-custo", custo: true, filhos: [
        { conta: "Taxas de canal e cartão", v: -c.taxa, va: ant("taxa", -1) },
        { conta: "Fretes", v: -c.frete, va: ant("frete", -1) },
        { conta: "Impostos", v: -c.imposto, va: ant("imposto", -1) },
        { conta: "Outras deduções", v: -c.outrasDed, va: ant("outrasDed", -1) },
      ] },
      { id: "recliq", conta: "(=) Receita líquida", v: c.receitaLiquida, va: ant("receitaLiquida", 1), cls: "dre-receita", tipo: "subtotal" },
      { id: "cmv", conta: "(−) CMV (custo dos produtos)", v: -c.cmv, va: ant("cmv", -1), cls: "dre-custo", custo: true },
      { id: "lb", conta: "(=) Lucro bruto", v: c.lucroBruto, va: ant("lucroBruto", 1), cls: "dre-resultado" + (c.lucroBruto < 0 ? " negativo" : ""), tipo: "subtotal" },
      { id: "desp", conta: "(−) Despesas operacionais", v: -c.despesasOutras, va: ant("despesasOutras", -1), cls: "dre-custo", custo: true, filhos: [
        { conta: "Operacionais (embalagens, etiquetas)", v: -c.oper, va: ant("oper", -1) },
        { conta: "Fixas (aluguel, luz, salários)", v: -c.fixa, va: ant("fixa", -1) },
        { conta: "Softwares (ERP, loja, domínio)", v: -c.soft, va: ant("soft", -1) },
        { conta: "Marketing e anúncios", v: -c.mkt, va: ant("mkt", -1) },
        { conta: "Perdas", v: -c.perdas, va: ant("perdas", -1) },
        { conta: "Devoluções", v: -c.devolucoes, va: ant("devolucoes", -1) },
        { conta: "Outros", v: -c.outros, va: ant("outros", -1) },
      ] },
      { id: "res", conta: "(=) Resultado líquido", v: c.lucro, va: ant("lucro", 1), cls: "dre-resultado" + (c.lucro < 0 ? " negativo" : ""), tipo: "total" },
    ];

    const variacao = (v, va, custo) => {
      if (va == null) return { txt: "", cls: "neutro", titulo: "" };
      const atual = custo ? Math.abs(v) : v, antes = custo ? Math.abs(va) : va;
      if (Math.abs(antes) < 0.005) return { txt: Math.abs(atual) < 0.005 ? "—" : "novo", cls: "neutro", titulo: "Sem valor no período anterior" };
      const pct = ((atual - antes) / Math.abs(antes)) * 100;
      if (Math.abs(pct) < 0.05) return { txt: "0%", cls: "neutro", titulo: "" };
      const bom = custo ? pct < 0 : pct > 0;
      const abs = Math.abs(pct);
      return { txt: (pct > 0 ? "▲ " : "▼ ") + (abs >= 1000 ? "999%+" : fmtPct(abs, abs >= 100 ? 0 : 1)), cls: bom ? "bom" : "ruim", titulo: "" };
    };
    const celulas = (l, custo) => {
      // Custos aparecem como a parte da receita que consomem; os
      // resultados, com o sinal (um prejuízo de 20% da receita: −20,0%).
      const pct = fat > 0 ? ((custo ? Math.abs(l.v) : l.v) / fat) * 100 : 0;
      const vr = variacao(l.v, l.va, custo);
      return `<td class="num fin-dre-valor">${_fmtDre(l.v)}</td>` +
        `<td class="num fin-dre-col-pct"><span class="fin-dre-pct">${fat > 0 ? fmtPct(pct) : "—"}<span class="fin-dre-barra" aria-hidden="true"><i style="width:${Math.min(100, Math.abs(pct)).toFixed(1)}%"></i></span></span></td>` +
        `<td class="num fin-dre-col-ant">${l.va == null ? "—" : _fmtDre(l.va)}</td>` +
        `<td class="num fin-dre-col-var"><span class="fin-var ${vr.cls}"${vr.titulo ? ` title="${vr.titulo}"` : ""}>${vr.txt}</span></td>`;
    };

    let html = "";
    linhas.forEach((l) => {
      const filhos = (l.filhos || []).filter((f) => Math.abs(f.v) >= 0.005 || (f.va != null && Math.abs(f.va) >= 0.005));
      const grupo = filhos.length > 0;
      const aberto = grupo && _dreAbertos.has(l.id);
      const classes = [l.cls, l.tipo === "subtotal" ? "dre-subtotal" : "", l.tipo === "total" ? "dre-total" : "", grupo ? "dre-grupo" : "", aberto ? "aberto" : ""].filter(Boolean).join(" ");
      const attrs = grupo ? ` data-grupo="${l.id}" tabindex="0" role="button" aria-expanded="${aberto}" title="${aberto ? "Recolher" : "Ver o detalhe"}"` : "";
      html += `<tr class="${classes}"${attrs}><td class="fin-dre-conta">${grupo ? `<span class="fin-dre-seta">${ICO_SETA_DRE}</span>` : ""}${l.conta}</td>${celulas(l, !!l.custo)}</tr>`;
      if (aberto) {
        filhos.forEach((f) => {
          html += `<tr class="dre-filho ${l.cls}" data-pai="${l.id}"><td class="fin-dre-conta">${f.conta}</td>${celulas(f, true)}</tr>`;
        });
      }
    });
    corpo.innerHTML = html;

    // Nota embaixo da tabela: as margens
    let nota = tabela.parentElement.querySelector(".fin-dre-nota");
    if (!nota) {
      nota = document.createElement("div");
      nota.className = "fin-dre-nota";
      tabela.parentElement.appendChild(nota);
    }
    nota.innerHTML = fat > 0
      ? `<span>Margem bruta: <strong>${fmtPct(c.margemBruta)}</strong></span>` +
        `<span>Margem líquida: <strong>${fmtPct(c.margem)}</strong></span>` +
        `<span>${c.qtdVendas} entrada${c.qtdVendas === 1 ? "" : "s"} e ${c.qtdSaidas} saída${c.qtdSaidas === 1 ? "" : "s"}</span>`
      : `<span>Sem entradas no período${c.qtdSaidas ? ` — ${c.qtdSaidas} saída${c.qtdSaidas === 1 ? "" : "s"} lançada${c.qtdSaidas === 1 ? "" : "s"}` : ""}.</span>`;

    const info = document.getElementById("dreInfo");
    if (info) info.textContent = ivAnt ? `Comparado com ${_textoIntervalo(ivAnt)}` : "";
    const btn = document.getElementById("btnDreDetalhar");
    if (btn) {
      const tudo = ["ded", "desp"].every((g) => _dreAbertos.has(g));
      btn.textContent = tudo ? "Resumir" : "Detalhar tudo";
      btn.setAttribute("aria-pressed", tudo ? "true" : "false");
    }
  }

  function _alternarGrupoDre(id, abrir) {
    const abre = abrir == null ? !_dreAbertos.has(id) : abrir;
    if (abre) _dreAbertos.add(id); else _dreAbertos.delete(id);
    try { localStorage.setItem(LS_DRE_ABERTOS, JSON.stringify([..._dreAbertos])); } catch (e) {}
    if (_ultimoDre) _renderDre(_ultimoDre.c, _ultimoDre.a, _ultimoDre.ivAnt);
  }

  // ── Desempenho por canal ──
  function _renderCanais(c) {
    const corpo = document.getElementById("finCanaisCorpo");
    const tabela = document.getElementById("finCanais");
    const vazio = document.getElementById("finCanaisVazio");
    if (!corpo || !tabela) return;
    const canais = Object.entries(c.porCanal).sort((x, y) => y[1].bruto - x[1].bruto);
    let tfoot = tabela.querySelector("tfoot");
    if (!canais.length) {
      corpo.innerHTML = "";
      if (tfoot) tfoot.remove();
      tabela.hidden = true;
      if (vazio) vazio.hidden = false;
      return;
    }
    tabela.hidden = false;
    if (vazio) vazio.hidden = true;
    const fat = c.faturamento;
    corpo.innerHTML = canais.map(([nome, v], i) => {
      const cor = PALETA_CANAIS[i % PALETA_CANAIS.length];
      const fica = v.bruto > 0 ? ((v.bruto - v.ded) / v.bruto) * 100 : 0;
      const part = fat > 0 ? (v.bruto / fat) * 100 : 0;
      return `<tr>
        <td><span class="fin-canal-ponto" style="--cor:${cor}"></span>${_esc(nome)}</td>
        <td class="num">${v.qtd}</td>
        <td class="num">${fmt(v.bruto)}</td>
        <td class="num${v.ded ? " fin-valor-ded" : ""}">${v.ded ? "\u2212 " + fmt(v.ded) : '<span class="fin-valor-nada">—</span>'}</td>
        <td class="num">${fmt(v.bruto - v.ded)}</td>
        <td class="num"><span class="fin-var ${fica >= 85 ? "bom" : fica < 70 ? "ruim" : "neutro"}">${fmtPct(fica, 0)}</span></td>
        <td class="num">${fmt(v.qtd ? v.bruto / v.qtd : 0)}</td>
        <td><div class="fin-part"><span class="fin-part__barra"><i style="width:${part.toFixed(1)}%; --cor:${cor}"></i></span><span class="fin-part__pct">${fmtPct(part, part < 10 ? 1 : 0)}</span></div></td>
      </tr>`;
    }).join("");
    if (!tfoot) { tfoot = document.createElement("tfoot"); tabela.appendChild(tfoot); }
    const ficaTotal = fat > 0 ? ((fat - c.deducoes) / fat) * 100 : 0;
    tfoot.innerHTML = `<tr>
      <td>Total</td><td class="num">${c.qtdVendas}</td><td class="num">${fmt(fat)}</td>
      <td class="num${c.deducoes ? " fin-valor-ded" : ""}">${c.deducoes ? "\u2212 " + fmt(c.deducoes) : "—"}</td>
      <td class="num">${fmt(c.receitaLiquida)}</td><td class="num">${fmtPct(ficaTotal, 0)}</td>
      <td class="num">${fmt(c.ticket)}</td><td></td></tr>`;
  }

  // ══════════════════════════════════════════
  //  META DE FATURAMENTO
  // ══════════════════════════════════════════
  // ══════════════════════════════════════════
  //  CONFETE (comemoração ao bater a meta)
  // ══════════════════════════════════════════

  /**
   * Explosão de confete em canvas, sem dependências externas
   * (ideal para o app offline). Combina uma explosão central com duas
   * rajadas vindas das laterais de baixo. Dura ~2,6s e se limpa sozinha.
   */
  function _dispararConfete() {
    // Remove qualquer confete anterior que ainda esteja na tela
    const anterior = document.getElementById("confeteCanvas");
    if (anterior) anterior.remove();

    const canvas = document.createElement("canvas");
    canvas.id = "confeteCanvas";
    canvas.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999999999;";
    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const L = window.innerWidth;
    const A = window.innerHeight;
    canvas.width = L * dpr;
    canvas.height = A * dpr;
    ctx.scale(dpr, dpr);

    const CORES = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#ec4899", "#eab308"];
    const GRAVIDADE = 0.14;   // puxa as peças para baixo
    const ARRASTO = 0.992;    // atrito do ar — deixa o movimento mais suave
    const DURACAO = 2600;     // ~2,6s (dentro da faixa 2–3s pedida)

    // Emite um leque de partículas a partir de uma origem (ox,oy).
    // Ângulos em radianos: 0 = direita, -PI/2 = para cima (no canvas, y cresce para baixo).
    function _emitir(ox, oy, qtd, angMin, angMax, forcaMin, forcaMax) {
      const arr = [];
      for (let i = 0; i < qtd; i++) {
        const ang = angMin + Math.random() * (angMax - angMin);
        const forca = forcaMin + Math.random() * (forcaMax - forcaMin);
        arr.push({
          x: ox, y: oy,
          vx: Math.cos(ang) * forca,
          vy: Math.sin(ang) * forca,
          largura: 6 + Math.random() * 6,
          altura: 9 + Math.random() * 7,
          cor: CORES[(Math.random() * CORES.length) | 0],
          giro: Math.random() * Math.PI * 2,
          velGiro: -0.2 + Math.random() * 0.4,
        });
      }
      return arr;
    }

    const pecas = [
      // Explosão central: leque amplo para cima (esquerda → topo → direita)
      ..._emitir(L / 2, A * 0.42, 90, -Math.PI * 0.95, -Math.PI * 0.05, 7, 15),
      // Rajada da lateral esquerda: sobe para a direita (para dentro)
      ..._emitir(0, A * 0.72, 32, -Math.PI * 0.5, -Math.PI * 0.05, 9, 16),
      // Rajada da lateral direita: sobe para a esquerda (para dentro)
      ..._emitir(L, A * 0.72, 32, -Math.PI * 0.95, -Math.PI * 0.5, 9, 16),
    ];

    const inicio = performance.now();
    let rafId;

    function quadro(agora) {
      const decorrido = agora - inicio;
      ctx.clearRect(0, 0, L, A);

      // Some suavemente nos últimos 700ms
      const opacidade = decorrido > DURACAO - 700 ? Math.max(0, (DURACAO - decorrido) / 700) : 1;
      ctx.globalAlpha = opacidade;

      let vivos = 0;
      pecas.forEach((p) => {
        p.vx *= ARRASTO;
        p.vy = p.vy * ARRASTO + GRAVIDADE;
        p.x += p.vx;
        p.y += p.vy;
        p.giro += p.velGiro;
        if (p.y < A + 30) vivos++;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.giro);
        ctx.fillStyle = p.cor;
        ctx.fillRect(-p.largura / 2, -p.altura / 2, p.largura, p.altura);
        ctx.restore();
      });

      if (decorrido < DURACAO && vivos > 0) {
        rafId = requestAnimationFrame(quadro);
      } else {
        cancelAnimationFrame(rafId);
        canvas.remove();
      }
    }
    rafId = requestAnimationFrame(quadro);
  }

  /**
   * Decide se deve comemorar (confete) ao renderizar a meta.
   *
   * Regra: comemora UMA vez por VALOR de meta atingido.
   *  - `_store.metaComemorada` guarda o valor de meta que já rendeu festa.
   *  - Se a meta foi batida e ainda não comemoramos ESTE valor → dispara e grava.
   *  - Se o progresso caiu abaixo da meta → limpa a marca, liberando nova
   *    comemoração quando reatingir.
   *
   * Assim:
   *  - não repete a cada render nem ao recarregar a página (é persistido);
   *  - volta a comemorar se a meta mudar de valor (marca deixa de bater);
   *  - volta a comemorar se cair abaixo e subir de novo.
   */
  function _talvezComemorar(meta, bateu) {
    const jaComemorada = _store.metaComemorada || 0;

    if (bateu) {
      if (jaComemorada !== meta) {
        _store.metaComemorada = meta;
        _salvar();
        _dispararConfete();
        showToast("Meta batida! Parabéns!", "success", 4000);
      }
    } else if (jaComemorada) {
      // Ficou abaixo da meta: libera nova comemoração para quando reatingir
      _store.metaComemorada = 0;
      _salvar();
    }
  }

  // O faturamento do mês atual — a meta é MENSAL. Antes ela recebia o
  // faturamento do período escolhido: com "Ano atual" ou "Tudo", o ano
  // inteiro era comparado com a meta de um mês (e o confete disparava).
  function _faturamentoDoMes(ateHoje) {
    const iv = _intervalo("mes");
    if (ateHoje) iv.fim = _isoDe(new Date());
    return movimentacoes.reduce((s, m) => (m && m.tipo === "Venda" && _dentroDe(m, iv) ? s + _n(m.bruto) : s), 0);
  }

  function _renderMeta() {
    const meta = _store.meta || 0;
    const atualEl = document.getElementById("metaAtual");
    const alvoEl = document.getElementById("metaAlvo");
    const barra = document.getElementById("metaBarra");
    const pctEl = document.getElementById("metaPct");
    const projEl = document.getElementById("metaProjecao");
    if (!atualEl) return;

    const faturamento = _faturamentoDoMes(false);
    atualEl.textContent = fmt(faturamento);
    if (meta > 0) {
      const pctReal = (faturamento / meta) * 100;
      const pct = Math.min(100, pctReal);
      alvoEl.textContent = "Meta: " + fmt(meta);
      barra.style.width = pct + "%";
      barra.style.background = "";
      barra.classList.toggle("batida", pctReal >= 100);
      pctEl.textContent = fmtPct(pctReal, 0) + " da meta" + (pctReal >= 100 ? " — meta batida!" : "");

      // Ritmo do mês: o faturado até hoje, dividido pelos dias que passaram,
      // projetado até o último dia.
      if (projEl) {
        const hoje = new Date();
        const dia = hoje.getDate();
        const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
        const ateHoje = _faturamentoDoMes(true);
        if (pctReal >= 100) {
          projEl.innerHTML = `Passou da meta em <strong>${fmt(faturamento - meta)}</strong>`;
        } else {
          let txt = `Faltam <strong>${fmt(meta - faturamento)}</strong>`;
          if (dia >= 3 && dia < diasMes && ateHoje > 0) {
            txt += ` · no ritmo atual, o mês fecha em <strong>${fmt((ateHoje / dia) * diasMes)}</strong>`;
          }
          projEl.innerHTML = txt;
        }
      }

      // Compara o faturamento REAL com a meta (o pct acima é capado em 100%)
      _talvezComemorar(meta, faturamento >= meta);
    } else {
      alvoEl.textContent = "Meta: não definida";
      barra.style.width = "0%";
      barra.style.background = "";
      barra.classList.remove("batida");
      pctEl.textContent = "";
      if (projEl) projEl.textContent = "Defina uma meta para acompanhar o mês";
      // Sem meta: zera a marca para permitir festa quando uma nova for criada
      if (_store.metaComemorada) { _store.metaComemorada = 0; _salvar(); }
    }
  }

  function _definirMeta() {
    const ex = document.getElementById("modalMeta");
    if (ex) ex.remove();
    const atual = _store.meta || 0;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalMeta";
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px; width:90%;">
        <div class="modal-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Meta de Faturamento</span>
          <button type="button" id="metaFecharX" style="background:transparent; border:none; color:var(--clr-text-3); font-size:22px; cursor:pointer; line-height:1;">✕</button>
        </div>
        <div class="modal-subtitle" style="margin-bottom:var(--sp-md);">Defina quanto você pretende faturar no mês. Deixe em branco (ou zero) para remover a meta.</div>
        <div class="field-group" style="margin-bottom:var(--sp-md);">
          <label>Meta (R$)</label>
          <div class="input-addon-wrap"><span class="input-prefix">R$</span><input type="text" inputmode="decimal" id="metaInput" class="input-field money-input" value="${atual > 0 ? formatMoneyBR(atual) : ""}" placeholder="0,00" /></div>
        </div>
        <div class="modal-actions">
          ${atual > 0 ? `<button class="btn-danger" id="metaRemover" style="font-size:13px; margin-right:auto;">Remover meta</button>` : ""}
          <button class="btn-secondary" id="metaCancelar">Cancelar</button>
          <button class="btn-primary" id="metaSalvar" style="padding:10px var(--sp-lg); font-size:14px;">Salvar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = document.getElementById("metaInput");
    _mascaraMoneyTempoReal(input);
    setTimeout(() => input.focus(), 60);

    const fechar = () => overlay.remove();
    document.getElementById("metaFecharX").addEventListener("click", fechar);
    document.getElementById("metaCancelar").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
    if (document.getElementById("metaRemover")) {
      document.getElementById("metaRemover").addEventListener("click", () => {
        _store.meta = 0; _salvar(); atualizarTela(); fechar();
        showToast("Meta removida.", "success");
      });
    }
    document.getElementById("metaSalvar").addEventListener("click", () => {
      const n = parseFormattedValue(input.value) || 0;
      _store.meta = n;
      _salvar(); atualizarTela(); fechar();
      showToast(n > 0 ? "Meta definida!" : "Meta removida.", "success");
    });
  }

  // ══════════════════════════════════════════
  //  INSIGHTS AUTOMÁTICOS
  // ══════════════════════════════════════════
  function _renderInsights(d) {
    const lista = document.getElementById("insightsLista");
    if (!lista) return;
    const c = d.cur, a = d.ant;

    // Ícones SVG (18x18, stroke currentColor) por tipo de insight
    const _ic = (nome) => {
      const svgs = {
        dados: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>',
        prejuizo: '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline>',
        subida: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline>',
        alerta: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
        ok: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
        cmv: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>',
        cartao: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line>',
        casa: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>',
        trofeu: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>',
        grafico: '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>',
        dinheiro: '<line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>',
        joia: '<polyline points="20 6 9 17 4 12"></polyline>',
        projecao: '<path d="M3 3v18h18"></path><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path>',
        alvo: '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>',
        carteira: '<path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"></path><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4z"></path>',
        calendario: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
        megafone: '<path d="m3 11 18-5v12L3 14v-3z"></path><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"></path>',
      };
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${svgs[nome] || svgs.dados}</svg>`;
    };

    // tipo: perigo | aviso | sucesso | info | neutro. A prioridade decide a
    // ordem: primeiro o que pede atenção, depois o que vai bem.
    const lista_ = [];
    const add = (tipo, icone, titulo, texto, prioridade) => lista_.push({ tipo, icone, titulo, texto, p: prioridade });
    const desenhar = (it) =>
      `<div class="fin-insight fin-insight--${it.tipo}">` +
        `<span class="fin-insight__ico">${_ic(it.icone)}</span>` +
        `<div class="fin-insight__corpo"><div class="fin-insight__titulo">${it.titulo}</div><div class="fin-insight__texto">${it.texto}</div></div>` +
      "</div>";
    const contador = document.getElementById("insightsContador");

    if (c.faturamento === 0 && c.despesasTotais === 0 && c.cmv === 0) {
      lista.innerHTML = desenhar({ tipo: "neutro", icone: "dados", titulo: "Sem dados no período", texto: "Registre entradas e saídas para ver as análises deste período." });
      if (contador) contador.hidden = true;
      return;
    }

    const fat = c.faturamento;
    const pctFat = (v) => (fat > 0 ? (v / fat) * 100 : 0);
    // "ao mesmo período do mês passado", "a setembro de 2026"...
    const emRelacao = _rotuloComparacao(d.ivAnt);
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

    // ── Resultado e margem ──
    if (fat > 0) {
      if (c.margem < 0) add("perigo", "prejuizo", "Prejuízo no período", `As saídas passaram as entradas em <strong>${fmt(-c.lucro)}</strong> (margem ${fmtPct(c.margem)}). Revise custos, taxas e preços.`, 100);
      else if (c.margem < 10) add("aviso", "alerta", "Margem de lucro baixa", `Sua margem está em <strong>${fmtPct(c.margem)}</strong>. Para e-commerce, o ideal costuma ficar acima de 10–15%.`, 80);
      else if (c.margem >= 20) add("sucesso", "ok", "Margem saudável", `Margem de <strong>${fmtPct(c.margem)}</strong>: ficaram <strong>${fmt(c.lucro)}</strong> de lucro no período.`, 40);
      else add("sucesso", "dinheiro", "Lucro no período", `Lucro de <strong>${fmt(c.lucro)}</strong> (margem ${fmtPct(c.margem)}). Continue acompanhando de perto.`, 36);
    } else if (c.saidas > 0) {
      add("aviso", "alerta", "Saídas sem entradas", `Há <strong>${fmt(c.saidas)}</strong> em saídas e nenhuma entrada no período.`, 85);
    }

    // ── Comparação com o período anterior ──
    if (a && fat > 0 && a.faturamento > 0) {
      const v = ((fat - a.faturamento) / a.faturamento) * 100;
      if (Math.abs(v) >= 5) {
        add(v > 0 ? "sucesso" : "aviso", v > 0 ? "subida" : "prejuizo", v > 0 ? "Faturamento em alta" : "Faturamento em queda",
          `${v > 0 ? "Cresceu" : "Caiu"} <strong>${fmtPct(Math.abs(v), 0)}</strong> em relação ${_esc(emRelacao)} (${fmt(a.faturamento)} → ${fmt(fat)}).`, v > 0 ? 50 : 70);
      }
    }
    if (a && !a.vazio) {
      const dif = c.lucro - a.lucro;
      if (Math.abs(dif) >= Math.max(50, Math.abs(a.lucro) * 0.1)) {
        add(dif > 0 ? "sucesso" : "aviso", dif > 0 ? "subida" : "prejuizo", dif > 0 ? "Resultado melhor que antes" : "Resultado pior que antes",
          `O resultado ${dif > 0 ? "melhorou" : "piorou"} <strong>${fmt(Math.abs(dif))}</strong> em relação ${_esc(emRelacao)} (${fmt(a.lucro)} → ${fmt(c.lucro)}).`, dif > 0 ? 45 : 72);
      }
    }
    if (a && a.ticket > 0 && c.ticket > 0) {
      const v = ((c.ticket - a.ticket) / a.ticket) * 100;
      if (Math.abs(v) >= 8) {
        add(v > 0 ? "sucesso" : "aviso", v > 0 ? "subida" : "prejuizo", v > 0 ? "Ticket médio subiu" : "Ticket médio caiu",
          `Cada venda trouxe em média <strong>${fmt(c.ticket)}</strong> (${v > 0 ? "+" : "−"}${fmtPct(Math.abs(v), 0)} em relação ${_esc(emRelacao)}).`, v > 0 ? 32 : 54);
      }
    }

    // ── O mês atual: projeção e meta ──
    if (periodoAtual === "mes") {
      const hoje = new Date();
      const dia = hoje.getDate();
      const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
      const ateHoje = _faturamentoDoMes(true);
      const meta = _store.meta || 0;
      if (dia >= 3 && dia < diasMes && ateHoje > 0) {
        const ritmo = ateHoje / dia;
        add("info", "projecao", "Projeção do mês",
          `No ritmo atual (<strong>${fmt(ritmo)}</strong> por dia), o mês deve fechar com cerca de <strong>${fmt(ritmo * diasMes)}</strong> de faturamento.`, 49);
      }
      if (meta > 0) {
        const fatMes = _faturamentoDoMes(false);
        if (fatMes >= meta) {
          add("sucesso", "trofeu", "Meta do mês batida", `Você já faturou <strong>${fmtPct((fatMes / meta) * 100, 0)}</strong> da meta de ${fmt(meta)}.`, 47);
        } else if (dia <= diasMes) {
          const restam = diasMes - dia + 1;
          add("info", "alvo", "Meta do mês", `Faltam <strong>${fmt(meta - fatMes)}</strong>: cerca de <strong>${fmt((meta - fatMes) / restam)}</strong> por dia nos ${restam} dia${restam === 1 ? "" : "s"} que restam.`, 48);
        }
      }
    }

    // ── Ponto de equilíbrio ──
    // Margem de contribuição: o que sobra de cada R$ vendido depois das
    // deduções e do custo do produto. As despesas fixas (e os softwares)
    // são pagas com essa sobra.
    const fixos = c.fixa + c.soft;
    const mc = fat > 0 ? (c.receitaLiquida - c.cmv) / fat : 0;
    if (fixos > 0 && fat > 0) {
      if (mc > 0) {
        const pe = fixos / mc;
        if (fat >= pe) add("sucesso", "alvo", "Ponto de equilíbrio atingido", `Com margem de contribuição de ${fmtPct(mc * 100)}, faturar <strong>${fmt(pe)}</strong> já paga as despesas fixas (${fmt(fixos)}) — e você faturou ${fmt(fat)}.`, 30);
        else add("aviso", "alvo", "Abaixo do ponto de equilíbrio", `Para pagar as despesas fixas (${fmt(fixos)}), é preciso faturar <strong>${fmt(pe)}</strong> no período. Faltam <strong>${fmt(pe - fat)}</strong>.`, 75);
      } else {
        add("perigo", "alerta", "Vendas não cobrem os custos", "Depois das taxas e do custo do produto, as vendas não deixam sobra para pagar as despesas fixas. Revise preços e custos.", 95);
      }
    }

    // ── Pesos sobre o faturamento ──
    if (fat > 0 && c.cmv / fat > 0.5) add("aviso", "cmv", "Custo de produto alto", `O CMV consome <strong>${fmtPct(pctFat(c.cmv), 0)}</strong> do faturamento. Negocie com fornecedores ou revise os preços.`, 65);
    if (fat > 0 && c.deducoes / fat > 0.2) add("aviso", "cartao", "Taxas, fretes e impostos pesados", `Eles levam <strong>${fmtPct(pctFat(c.deducoes), 0)}</strong> das vendas (${fmt(c.deducoes)}). Avalie os canais mais rentáveis.`, 60);
    if (fat > 0 && c.fixa / fat > 0.3) add("aviso", "casa", "Despesas fixas altas", `As despesas fixas somam <strong>${fmtPct(pctFat(c.fixa), 0)}</strong> do faturamento. Cuidado com o ponto de equilíbrio.`, 62);
    if (fat > 0 && c.perdas / fat > 0.02) add("aviso", "alerta", "Perdas acima do normal", `As perdas somam <strong>${fmt(c.perdas)}</strong> (${fmtPct(pctFat(c.perdas))} do faturamento).`, 52);
    if (fat > 0 && c.mkt > 0) {
      const retorno = fat / c.mkt;
      add(retorno < 3 ? "aviso" : "info", "megafone", "Retorno do marketing",
        `Cada <strong>R$ 1,00</strong> em marketing e anúncios correspondeu a <strong>${fmt(retorno)}</strong> de faturamento no período.`, retorno < 3 ? 56 : 27);
    }

    // ── Canais ──
    const canais = Object.entries(c.porCanal).sort((x, y) => y[1].bruto - x[1].bruto);
    if (canais.length && fat > 0) {
      const [nome, v] = canais[0];
      const part = pctFat(v.bruto);
      add("info", "trofeu", "Canal campeão", `<strong>${_esc(nome)}</strong> responde por ${fmtPct(part, 0)} do faturamento (${fmt(v.bruto)} em ${v.qtd} venda${v.qtd === 1 ? "" : "s"}).`, 38);
      if (canais.length >= 2 && part >= 70 && c.qtdVendas >= 5) {
        add("aviso", "alerta", "Dependência de um canal", `${fmtPct(part, 0)} das vendas vêm de <strong>${_esc(nome)}</strong>. Uma mudança de regra ou de taxa nele afeta quase todo o faturamento.`, 57);
      }
      if (canais.length >= 3) add("info", "grafico", "Vendas diversificadas", `Você vende por <strong>${canais.length} canais</strong>. Diversificar reduz riscos.`, 20);
      const custo = canais.filter(([, x]) => x.bruto > 0 && x.qtd >= 2).map(([n, x]) => [n, x.ded / x.bruto]).sort((x, y) => y[1] - x[1]);
      if (custo.length >= 2 && custo[0][1] - custo[custo.length - 1][1] >= 0.05) {
        const caro = custo[0], barato = custo[custo.length - 1];
        add("info", "cartao", "Quanto custa vender em cada canal",
          `Em <strong>${_esc(caro[0])}</strong>, taxas, fretes e impostos levam ${fmtPct(caro[1] * 100, 0)} de cada venda; em <strong>${_esc(barato[0])}</strong>, ${fmtPct(barato[1] * 100, 0)}.`, 42);
      }
    }

    // ── Saídas e dias de venda ──
    const cats = Object.entries(c.porCategoria).sort((x, y) => y[1] - x[1]);
    if (cats.length && c.saidas > 0) {
      const [cat, v] = cats[0];
      add("neutro", "carteira", "Maior gasto do período", `<strong>${_esc(CATEGORIAS_SAIDA[cat] || cat)}</strong>: ${fmt(v)} (${fmtPct((v / c.saidas) * 100, 0)} das saídas).`, 25);
    }
    if (c.qtdVendas >= 10) {
      const tot = c.porDiaSemana.reduce((s, x) => s + x, 0);
      const max = Math.max.apply(null, c.porDiaSemana);
      const i = c.porDiaSemana.indexOf(max);
      if (tot > 0 && max / tot >= 0.18) add("info", "calendario", "Melhor dia de vendas", `<strong>${cap(DIAS_SEMANA[i])}</strong> concentra ${fmtPct((max / tot) * 100, 0)} do faturamento do período.`, 22);
    }

    lista_.sort((x, y) => y.p - x.p);
    const mostrar = lista_.slice(0, 12);
    lista.innerHTML = mostrar.length
      ? mostrar.map(desenhar).join("")
      : desenhar({ tipo: "sucesso", icone: "joia", titulo: "Tudo em ordem", texto: "Tudo em ordem por aqui. Continue registrando seus lançamentos." });
    if (contador) {
      contador.hidden = !mostrar.length;
      contador.textContent = String(mostrar.length);
      contador.title = `${mostrar.length} análise${mostrar.length === 1 ? "" : "s"} do período`;
    }
  }

  // ══════════════════════════════════════════
  //  GRÁFICOS (cores adaptadas ao tema)
  // ══════════════════════════════════════════
  function _corTema(varName, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return v || fallback;
  }

  // Uma cor do tema com transparência ("#4C8DF6" + 0.2 → "rgba(...)").
  function _alfa(cor, a) {
    const c = String(cor || "").trim();
    const m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return c;
    let h = m[1];
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  // "Sem dados" por cima de um gráfico vazio.
  function _marcarVazio(canvas, vazio, texto) {
    const box = canvas && canvas.parentElement;
    if (!box) return;
    let aviso = box.querySelector(".fin-chart-vazio");
    if (vazio) {
      if (!aviso) {
        aviso = document.createElement("div");
        aviso.className = "fin-chart-vazio";
        box.appendChild(aviso);
      }
      aviso.textContent = texto || "Sem dados no período";
    } else if (aviso) {
      aviso.remove();
    }
  }

  // Gráfico sem nenhum dado: some (fica só o "Sem dados"), em vez de
  // mostrar eixos vazios com "R$ 0, R$ 1, R$ 1...".
  function _seVazio(grafico, canvas, vazio, texto) {
    _marcarVazio(canvas, vazio, texto);
    if (vazio && grafico) { grafico.destroy(); return null; }
    return grafico;
  }

  // Texto no meio das roscas (o total).
  function _pluginCentro(linha1, linha2, cores) {
    return {
      id: "finCentro",
      afterDraw(chart) {
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || !meta.data.length) return;
        const arco = meta.data[0];
        const { ctx } = chart;
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = cores.texto;
        ctx.font = "800 15px Sora, sans-serif";
        ctx.fillText(linha1, arco.x, arco.y - 8);
        ctx.fillStyle = cores.texto3;
        ctx.font = "600 11px 'DM Sans', sans-serif";
        ctx.fillText(linha2, arco.x, arco.y + 11);
        ctx.restore();
      },
    };
  }

  // Linha tracejada da meta no gráfico mensal.
  function _pluginMeta(valor, cor, rotulo) {
    return {
      id: "finMeta",
      afterDatasetsDraw(chart) {
        if (!(valor > 0)) return;
        const y = chart.scales.y;
        if (!y || valor > y.max || valor < y.min) return;
        const { ctx, chartArea } = chart;
        const py = y.getPixelForValue(valor);
        ctx.save();
        ctx.strokeStyle = cor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(chartArea.left, py);
        ctx.lineTo(chartArea.right, py);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = cor;
        ctx.font = "700 10.5px 'DM Sans', sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(rotulo, chartArea.right - 4, py - 3);
        ctx.restore();
      },
    };
  }

  // Valores escritos em cima das barras da cascata.
  function _pluginRotulosCascata(valores, cor) {
    return {
      id: "finRotulos",
      afterDatasetsDraw(chart) {
        const meta = chart.getDatasetMeta(0);
        if (!meta) return;
        const { ctx } = chart;
        ctx.save();
        ctx.fillStyle = cor;
        ctx.font = "700 10.5px 'DM Sans', sans-serif";
        ctx.textAlign = "center";
        meta.data.forEach((barra, i) => {
          const v = valores[i];
          if (v == null) return;
          const topo = Math.min(barra.y, barra.base);
          ctx.textBaseline = "bottom";
          ctx.fillText(fmtCurto(v), barra.x, topo - 4);
        });
        ctx.restore();
      },
    };
  }

  // Os blocos de tempo do "Fluxo de Caixa": por dia (até 45 dias), por
  // semana (até ~6 meses) ou por mês.
  function _blocosFluxo(iv, filtradas) {
    const datas = filtradas.filter((m) => m && m.data).map(_diaDe).sort();
    const hojeIso = _isoDe(new Date());
    let ini = iv.ini || datas[0] || hojeIso;
    let fim = iv.fim || (datas.length && datas[datas.length - 1] > hojeIso ? datas[datas.length - 1] : hojeIso);
    // Um período que vai além de hoje (o mês ou o ano atual) para hoje — ou
    // no último lançamento com data à frente.
    if (fim > hojeIso) {
      const ultimo = datas.filter((d) => d <= fim).pop();
      fim = ultimo && ultimo > hojeIso ? ultimo : hojeIso;
    }
    if (fim < ini) fim = ini;
    const dias = _diasEntre(ini, fim) + 1;
    let modo = dias <= 45 ? "dia" : dias <= 190 ? "semana" : "mes";
    const blocos = [];
    if (modo === "dia") {
      for (let i = 0; i < dias; i++) {
        const d = _somarDias(ini, i);
        blocos.push({ ini: d, fim: d, rotulo: fmtData(d).slice(0, 5), titulo: fmtData(d) });
      }
    } else if (modo === "semana") {
      // Semanas de segunda a domingo
      const d0 = _dataDe(ini);
      const recuo = (d0.getDay() + 6) % 7;
      let s = _somarDias(ini, -recuo);
      while (s <= fim) {
        const e = _somarDias(s, 6);
        blocos.push({ ini: s, fim: e, rotulo: fmtData(s).slice(0, 5), titulo: `Semana de ${fmtData(s < ini ? ini : s)} a ${fmtData(e > fim ? fim : e)}` });
        s = _somarDias(s, 7);
      }
    } else {
      _listaMeses(ini.slice(0, 7), fim.slice(0, 7)).forEach((k) => {
        const [a, m] = k.split("-").map(Number);
        blocos.push({ ini: `${k}-01`, fim: _isoDe(new Date(a, m, 0)), rotulo: _rotuloMes(k), titulo: `${MESES_NOME[m - 1]} de ${a}` });
      });
      if (blocos.length > 36) blocos.splice(0, blocos.length - 36);
    }
    return { modo, blocos };
  }

  function _renderGraficos(d) {
    if (typeof Chart === "undefined") return;
    const c = d.cur;
    const textColor = _corTema("--clr-text-2", "#94a3b8");
    const text3 = _corTema("--clr-text-3", "#64748b");
    const textoForte = _corTema("--clr-text", "#e2e8f0");
    const gridColor = _alfa(_corTema("--clr-border", "#334155"), 0.55);
    const corOk = _corTema("--clr-success", "#16a34a");
    const corRuim = _corTema("--clr-danger", "#ef4444");
    const corPrim = _corTema("--clr-primary", "#3b82f6");
    const corAviso = _corTema("--clr-warning", "#f59e0b");
    const superficie = _corTema("--clr-surface", "#1e293b");
    const borda = _corTema("--clr-border", "#334155");

    Chart.defaults.font.family = "'DM Sans', sans-serif";
    Chart.defaults.color = textColor;

    // Dica do mouse com as cores do tema.
    const tooltip = (extra) => Object.assign({
      backgroundColor: superficie,
      titleColor: textoForte,
      bodyColor: textColor,
      borderColor: borda,
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8,
      boxPadding: 4,
      titleFont: { weight: "700" },
    }, extra || {});
    const eixos = (extraY) => ({
      x: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false }, border: { color: gridColor } },
      y: Object.assign({ ticks: { color: textColor, font: { size: 11 }, callback: (v) => fmtCurto(v) }, grid: { color: gridColor }, border: { display: false } }, extraY || {}),
    });

    // Rótulos dos meses e a linha "de ... a ..." dos gráficos mensais.
    const meses = d.meses;
    const rotulos = meses.map(_rotuloMes);
    document.querySelectorAll(".fin-meses-info").forEach((el) => {
      el.textContent = meses.length > 1 ? `${_rotuloMes(meses[0])} a ${_rotuloMes(meses[meses.length - 1])}` : (meses[0] ? _rotuloMes(meses[0]) : "");
    });
    const doMes = (k, campo) => (d.porMes[k] ? _n(d.porMes[k][campo]) : 0);

    // ── Para onde vai o dinheiro? (rosca: deduções e saídas) ──
    const ctxPEl = document.getElementById("graficoPizza");
    if (ctxPEl) {
      if (graficoPizza) graficoPizza.destroy();
      const fatias = [
        ["CMV", c.cmv, "#f59e0b"], ["Impostos", c.imposto, "#ef4444"], ["Taxas", c.taxa, "#f97316"],
        ["Fretes", c.frete, "#fb7185"], ["Outras deduções", c.outrasDed, "#fda4af"], ["Operacional", c.oper, "#14b8a6"],
        ["Fixas", c.fixa, "#6366f1"], ["Software", c.soft, "#0ea5e9"], ["Marketing", c.mkt, "#a855f7"],
        ["Perdas", c.perdas, "#e11d48"], ["Devoluções", c.devolucoes, "#d97706"], ["Outros", c.outros, "#94a3b8"],
      ].filter((f) => f[1] > 0.004).sort((x, y) => y[1] - x[1]);
      const total = fatias.reduce((s, f) => s + f[1], 0);
      graficoPizza = new Chart(ctxPEl.getContext("2d"), {
        type: "doughnut",
        data: {
          labels: fatias.map((f) => f[0]),
          datasets: [{ data: fatias.map((f) => f[1]), backgroundColor: fatias.map((f) => f[2]), borderWidth: 2, borderColor: superficie, hoverOffset: 6 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "66%",
          plugins: {
            legend: {
              position: "right",
              labels: {
                color: textColor, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle", font: { size: 11.5 }, padding: 10,
                generateLabels: (chart) => {
                  const base = Chart.overrides.doughnut.plugins.legend.labels.generateLabels(chart);
                  return base.map((l, i) => Object.assign(l, { text: `${l.text}  ${total > 0 ? fmtPct((fatias[i][1] / total) * 100, 0) : ""}` }));
                },
              },
            },
            tooltip: tooltip({ callbacks: { label: (ctx) => ` ${ctx.label}: ${fmt(ctx.parsed)} (${total > 0 ? fmtPct((ctx.parsed / total) * 100) : "0%"})` } }),
          },
        },
        plugins: total > 0 ? [_pluginCentro(fmtCurto(total), "saídas e deduções", { texto: textoForte, texto3: text3 })] : [],
      });
      graficoPizza = _seVazio(graficoPizza, ctxPEl, total <= 0, "Sem saídas no período");
    }

    // ── Entradas x Saídas (mensal) ──
    const ctxBEl = document.getElementById("graficoBarras");
    if (ctxBEl) {
      if (graficoBarras) graficoBarras.destroy();
      const entradas = meses.map((k) => doMes(k, "faturamento"));
      const saidas = meses.map((k) => doMes(k, "deducoes") + doMes(k, "saidas"));
      const meta = _store.meta || 0;
      graficoBarras = new Chart(ctxBEl.getContext("2d"), {
        type: "bar",
        data: {
          labels: rotulos,
          datasets: [
            { label: "Entradas (faturamento)", data: entradas, backgroundColor: _alfa(corOk, 0.85), hoverBackgroundColor: corOk, borderRadius: 5, maxBarThickness: 26 },
            { label: "Saídas (custos, despesas e deduções)", data: saidas, backgroundColor: _alfa(corRuim, 0.8), hoverBackgroundColor: corRuim, borderRadius: 5, maxBarThickness: 26 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { labels: { color: textColor, usePointStyle: true, pointStyle: "rectRounded", boxWidth: 10, font: { size: 11 } } },
            tooltip: tooltip({
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label.split(" (")[0]}: ${fmt(ctx.parsed.y)}`,
                footer: (itens) => {
                  const e = itens.find((x) => x.datasetIndex === 0), s = itens.find((x) => x.datasetIndex === 1);
                  return e && s ? `Resultado: ${fmt(e.parsed.y - s.parsed.y)}` : "";
                },
              },
            }),
          },
          scales: eixos({ beginAtZero: true }),
        },
        plugins: [_pluginMeta(meta, corAviso, meta > 0 ? "Meta " + fmtCurto(meta) : "")],
      });
      graficoBarras = _seVazio(graficoBarras, ctxBEl, !entradas.some((v) => v > 0) && !saidas.some((v) => v > 0), "Sem lançamentos nestes meses");
    }

    // ── Evolução do Lucro Líquido (mensal) ──
    // O lucro de cada mês é o mesmo do card: faturamento − deduções − CMV
    // − despesas. (Antes o gráfico não descontava as deduções das vendas e
    // mostrava um lucro maior que o do card.)
    const ctxLucroEl = document.getElementById("graficoLucro");
    if (ctxLucroEl) {
      if (graficoLucro) graficoLucro.destroy();
      const lucroPorMes = meses.map((k) => doMes(k, "lucro"));
      const margemPorMes = meses.map((k) => doMes(k, "margem"));
      graficoLucro = new Chart(ctxLucroEl.getContext("2d"), {
        type: "line",
        data: {
          labels: rotulos,
          datasets: [{
            label: "Lucro Líquido",
            data: lucroPorMes,
            borderColor: corPrim,
            borderWidth: 2.5,
            fill: { target: "origin", above: _alfa(corOk, 0.16), below: _alfa(corRuim, 0.16) },
            cubicInterpolationMode: "monotone",
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: lucroPorMes.map((v) => (v >= 0 ? corOk : corRuim)),
            pointBorderColor: superficie,
            pointBorderWidth: 1.5,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: tooltip({
              callbacks: {
                label: (ctx) => ` Lucro: ${fmt(ctx.parsed.y)}`,
                afterLabel: (ctx) => (doMes(meses[ctx.dataIndex], "faturamento") > 0 ? ` Margem: ${fmtPct(margemPorMes[ctx.dataIndex])}` : ""),
              },
            }),
          },
          scales: eixos(),
        },
      });
      graficoLucro = _seVazio(graficoLucro, ctxLucroEl, !lucroPorMes.some((v) => Math.abs(v) > 0.004), "Sem lançamentos nestes meses");
    }

    // ── Receita por Canal (rosca) ──
    // Faturamento bruto de cada canal no período, do maior para o menor; as
    // cores são as mesmas da tabela "Desempenho por Canal".
    const ctxCanaisEl = document.getElementById("graficoCanais");
    if (ctxCanaisEl) {
      if (graficoCanais) graficoCanais.destroy();
      const canaisOrdenados = Object.entries(c.porCanal || {}).map(([k, v]) => [k, v.bruto]).sort((x, y) => y[1] - x[1]);
      const total = canaisOrdenados.reduce((s, x) => s + x[1], 0);
      graficoCanais = new Chart(ctxCanaisEl.getContext("2d"), {
        type: "doughnut",
        data: {
          labels: canaisOrdenados.map((x) => x[0]),
          datasets: [{
            data: canaisOrdenados.map((x) => x[1]),
            backgroundColor: canaisOrdenados.map((_, i) => PALETA_CANAIS[i % PALETA_CANAIS.length]),
            borderWidth: 2, borderColor: superficie, hoverOffset: 6,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "66%",
          plugins: {
            legend: {
              position: "right",
              labels: {
                color: textColor, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle", font: { size: 11.5 }, padding: 10,
                generateLabels: (chart) => {
                  const base = Chart.overrides.doughnut.plugins.legend.labels.generateLabels(chart);
                  return base.map((l, i) => Object.assign(l, { text: `${l.text}  ${total > 0 ? fmtPct((canaisOrdenados[i][1] / total) * 100, 0) : ""}` }));
                },
              },
            },
            tooltip: tooltip({ callbacks: { label: (ctx) => ` ${ctx.label}: ${fmt(ctx.parsed)} (${total > 0 ? fmtPct((ctx.parsed / total) * 100) : "0%"})` } }),
          },
        },
        plugins: total > 0 ? [_pluginCentro(fmtCurto(total), "faturamento", { texto: textoForte, texto3: text3 })] : [],
      });
      graficoCanais = _seVazio(graficoCanais, ctxCanaisEl, total <= 0, "Sem entradas no período");
    }

    // ── Fluxo de Caixa do Período ──
    // Entradas (o líquido das vendas) para cima, saídas para baixo, e o
    // saldo acumulado — que termina igual ao lucro do período.
    const ctxFluxoEl = document.getElementById("graficoFluxo");
    if (ctxFluxoEl) {
      if (graficoFluxo) graficoFluxo.destroy();
      const { modo, blocos } = _blocosFluxo(d.iv, d.filtradas);
      const ent = blocos.map(() => 0), sai = blocos.map(() => 0);
      d.filtradas.forEach((m) => {
        if (!m || !m.data) return;
        const dia = _diaDe(m);
        // Busca binária: os blocos estão em ordem
        let lo = 0, hi = blocos.length - 1, achou = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (dia < blocos[mid].ini) hi = mid - 1;
          else if (dia > blocos[mid].fim) lo = mid + 1;
          else { achou = mid; break; }
        }
        if (achou < 0) return;
        if (m.tipo === "Venda") ent[achou] += _n(m.liquido);
        else sai[achou] += Math.abs(_n(m.liquido));
      });
      // O que ficou antes do primeiro bloco (no "Tudo" com muitos anos, o
      // gráfico mostra os últimos 36 meses): o saldo parte dele, e termina
      // igual ao lucro do período.
      let acc = 0;
      if (blocos.length) {
        d.filtradas.forEach((m) => {
          if (m && m.data && _diaDe(m) < blocos[0].ini) acc += m.tipo === "Venda" ? _n(m.liquido) : -Math.abs(_n(m.liquido));
        });
      }
      const saldo = blocos.map((_, i) => (acc += ent[i] - sai[i]));
      graficoFluxo = new Chart(ctxFluxoEl.getContext("2d"), {
        type: "bar",
        data: {
          labels: blocos.map((b) => b.rotulo),
          datasets: [
            { type: "bar", label: "Entradas (líquido)", data: ent, backgroundColor: _alfa(corOk, 0.8), hoverBackgroundColor: corOk, borderRadius: 4, maxBarThickness: 22, stack: "fluxo", order: 2 },
            { type: "bar", label: "Saídas", data: sai.map((v) => -v), backgroundColor: _alfa(corRuim, 0.75), hoverBackgroundColor: corRuim, borderRadius: 4, maxBarThickness: 22, stack: "fluxo", order: 2 },
            { type: "line", label: "Saldo acumulado", data: saldo, borderColor: corPrim, backgroundColor: corPrim, borderWidth: 2.5, cubicInterpolationMode: "monotone", pointRadius: blocos.length > 40 ? 0 : 2.5, pointHoverRadius: 5, order: 1 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { labels: { color: textColor, usePointStyle: true, boxWidth: 8, boxHeight: 8, font: { size: 11 } } },
            tooltip: tooltip({
              callbacks: {
                title: (itens) => (itens.length ? blocos[itens[0].dataIndex].titulo : ""),
                label: (ctx) => ` ${ctx.dataset.label}: ${fmt(ctx.datasetIndex === 1 ? Math.abs(ctx.parsed.y) : ctx.parsed.y)}`,
              },
            }),
          },
          scales: {
            x: { stacked: true, ticks: { color: textColor, font: { size: 10.5 }, maxRotation: 0, autoSkipPadding: 8 }, grid: { display: false }, border: { color: gridColor } },
            // Um eixo só: as barras e o saldo na mesma escala (com dois
            // eixos, o zero de cada um ficava numa altura).
            y: { stacked: true, ticks: { color: textColor, font: { size: 11 }, callback: (v) => fmtCurto(v) }, grid: { color: (ctx) => (ctx.tick && ctx.tick.value === 0 ? _alfa(textColor, 0.55) : gridColor) }, border: { display: false } },
          },
        },
      });
      const info = document.getElementById("fluxoInfo");
      if (info) {
        const porQue = { dia: "Por dia", semana: "Por semana", mes: "Por mês" }[modo];
        info.textContent = `${porQue} · saldo do período: ${fmt(saldo.length ? saldo[saldo.length - 1] : 0)}`;
      }
      graficoFluxo = _seVazio(graficoFluxo, ctxFluxoEl, !ent.some((v) => v > 0) && !sai.some((v) => v > 0), "Sem lançamentos no período");
    }

    // ── Do faturamento ao lucro (cascata, dentro do DRE) ──
    const ctxCascEl = document.getElementById("graficoCascata");
    if (ctxCascEl) {
      if (graficoCascata) graficoCascata.destroy();
      const passos = [
        ["Receita", [0, c.faturamento], c.faturamento, corPrim],
        ["Deduções", [c.faturamento - c.deducoes, c.faturamento], -c.deducoes, _alfa(corRuim, 0.7)],
        ["CMV", [c.receitaLiquida - c.cmv, c.receitaLiquida], -c.cmv, _alfa(corAviso, 0.85)],
        ["Despesas", [c.lucroBruto - c.despesasOutras, c.lucroBruto], -c.despesasOutras, _alfa(corRuim, 0.85)],
        ["Lucro", [0, c.lucro], c.lucro, c.lucro >= 0 ? corOk : corRuim],
      ];
      graficoCascata = new Chart(ctxCascEl.getContext("2d"), {
        type: "bar",
        data: {
          labels: passos.map((p) => p[0]),
          datasets: [{ data: passos.map((p) => p[1]), backgroundColor: passos.map((p) => p[3]), borderRadius: 5, borderSkipped: false, maxBarThickness: 46 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 18 } },
          plugins: {
            legend: { display: false },
            tooltip: tooltip({ callbacks: { label: (ctx) => ` ${_fmtDre(passos[ctx.dataIndex][2])}` } }),
          },
          scales: Object.assign(eixos({ grace: "8%" }), {
            x: { ticks: { color: textColor, font: { size: 11 }, maxRotation: 0, autoSkip: false }, grid: { display: false }, border: { color: gridColor } },
          }),
        },
        plugins: [_pluginRotulosCascata(passos.map((p) => p[2]), textColor)],
      });
      graficoCascata = _seVazio(graficoCascata, ctxCascEl, c.faturamento <= 0 && c.saidas <= 0 && c.deducoes <= 0, "Sem lançamentos no período");
    }
  }

  // ══════════════════════════════════════════
  //  EXPORTAR / IMPORTAR
  // ══════════════════════════════════════════
  // Exporta um relatório em PDF via impressão: indicadores com a
  // comparação, o DRE, os canais, os destaques e o extrato do período.
  function exportarPDF() {
    const iv = _intervalo(periodoAtual);
    const ivAnt = _intervaloComparacao(periodoAtual);
    const filtradas = movimentacoes.filter(_dentroDoPeriodo);
    const c = _resumir(filtradas);
    const a = ivAnt ? _resumir(movimentacoes.filter((m) => _dentroDe(m, ivAnt))) : null;
    const emp = _empresaAtiva();
    const kpi = (id) => (document.getElementById(id) || {}).textContent || "";
    const delta = (id) => {
      const el = document.getElementById("delta-" + id);
      return el && el.textContent ? `<div class="kpi-d ${el.classList.contains("bom") ? "bom" : el.classList.contains("ruim") ? "ruim" : ""}">${_esc(el.textContent)}</div>` : "";
    };

    const rows = [...filtradas]
      .sort((x, y) => String(y.data || "").localeCompare(String(x.data || "")) || (_n(y.criadoEm) - _n(x.criadoEm)))
      .map((m) => {
        const isVenda = m.tipo === "Venda";
        return `<tr>
          <td>${_esc(fmtData(m.data))}</td>
          <td>${isVenda ? "Entrada" : "Saída"} · ${_esc(m.canalCategoria || "")}</td>
          <td>${_esc(m.descricao)}${m.editado ? " (editado)" : ""}</td>
          <td>${_esc(m.responsavel || "—")}</td>
          <td class="n">${isVenda ? fmt(m.bruto) : "—"}</td>
          <td class="n">${isVenda ? fmt(m.deducoes) : "—"}</td>
          <td class="n" style="color:${isVenda ? "#15803d" : "#b91c1c"};">${fmt(m.liquido)}</td>
        </tr>`;
      })
      .join("");

    // DRE, com todos os detalhes abertos
    const fat = c.faturamento;
    // Custos: a parte da receita que consomem; resultados: com o sinal.
    const pct = (v, custo) => (fat > 0 ? fmtPct(((custo ? Math.abs(v) : v) / fat) * 100) : "—");
    const linhaDre = (conta, v, va, cls) =>
      `<tr class="${cls || ""}"><td>${conta}</td><td class="n">${_fmtDre(v)}</td><td class="n">${pct(v, cls !== "forte" && cls !== "total")}</td>${a ? `<td class="n">${va == null ? "—" : _fmtDre(va)}</td>` : ""}</tr>`;
    const ant = (campo, s) => (a ? s * _n(a[campo]) : null);
    const dre = [
      linhaDre("Receita bruta de vendas", c.faturamento, ant("faturamento", 1), "forte"),
      linhaDre("(−) Deduções sobre vendas", -c.deducoes, ant("deducoes", -1)),
      linhaDre("&nbsp;&nbsp;&nbsp;Taxas de canal e cartão", -c.taxa, ant("taxa", -1), "filho"),
      linhaDre("&nbsp;&nbsp;&nbsp;Fretes", -c.frete, ant("frete", -1), "filho"),
      linhaDre("&nbsp;&nbsp;&nbsp;Impostos", -c.imposto, ant("imposto", -1), "filho"),
      c.outrasDed || (a && a.outrasDed) ? linhaDre("&nbsp;&nbsp;&nbsp;Outras deduções", -c.outrasDed, ant("outrasDed", -1), "filho") : "",
      linhaDre("(=) Receita líquida", c.receitaLiquida, ant("receitaLiquida", 1), "forte"),
      linhaDre("(−) Custo dos produtos vendidos (CMV)", -c.cmv, ant("cmv", -1)),
      linhaDre("(=) Lucro bruto", c.lucroBruto, ant("lucroBruto", 1), "forte"),
      linhaDre("(−) Despesas operacionais", -c.despesasOutras, ant("despesasOutras", -1)),
      [["Operacionais", "oper"], ["Fixas", "fixa"], ["Softwares", "soft"], ["Marketing e anúncios", "mkt"], ["Perdas", "perdas"], ["Devoluções", "devolucoes"], ["Outros", "outros"]]
        .filter(([, k]) => c[k] || (a && a[k]))
        .map(([nome, k]) => linhaDre("&nbsp;&nbsp;&nbsp;" + nome, -c[k], ant(k, -1), "filho")).join(""),
      linhaDre("(=) Resultado líquido do período", c.lucro, ant("lucro", 1), "total"),
    ].join("");

    const canais = Object.entries(c.porCanal).sort((x, y) => y[1].bruto - x[1].bruto).map(([nome, v]) =>
      `<tr><td>${_esc(nome)}</td><td class="n">${v.qtd}</td><td class="n">${fmt(v.bruto)}</td><td class="n">${fmt(v.ded)}</td><td class="n">${fmt(v.bruto - v.ded)}</td><td class="n">${fat > 0 ? fmtPct((v.bruto / fat) * 100) : "—"}</td></tr>`
    ).join("");

    const destaques = Array.from(document.querySelectorAll("#insightsLista .fin-insight")).slice(0, 8).map((el) => {
      const t = el.querySelector(".fin-insight__titulo"), x = el.querySelector(".fin-insight__texto");
      return `<li><strong>${t ? _esc(t.textContent) : ""}</strong> — ${x ? _esc(x.textContent) : ""}</li>`;
    }).join("");

    const periodoLabel = ROTULOS_PERIODO[periodoAtual] || "";
    const win = window.open("", "_blank");
    if (!win) { showToast("Não foi possível abrir o relatório.", "error"); return; }
    win.document.write(`
      <html><head><title>Relatório Financeiro${emp ? " — " + _esc(emp.nome) : ""}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 30px; color: #1e293b; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .5px; color: #475569; margin: 26px 0 10px; }
        .sub { color: #64748b; font-size: 13px; margin-bottom: 20px; }
        .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 8px; }
        .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
        .kpi-t { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: bold; }
        .kpi-v { font-size: 20px; font-weight: bold; margin-top: 4px; }
        .kpi-d { font-size: 11px; margin-top: 4px; color: #64748b; }
        .kpi-d.bom { color: #15803d; } .kpi-d.ruim { color: #b91c1c; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; }
        th { background: #f8fafc; text-transform: uppercase; font-size: 10px; color: #64748b; }
        .n { text-align: right; white-space: nowrap; }
        tr.forte td { font-weight: bold; }
        tr.filho td { color: #475569; font-size: 11px; }
        tr.total td { font-weight: bold; font-size: 13px; background: #f1f5f9; }
        ul { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.6; }
        .rodape { margin-top: 24px; font-size: 10px; color: #94a3b8; }
        @media print { body { padding: 0; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
      </style></head><body>
        <h1>Relatório Financeiro${emp ? " — " + _esc(emp.nome) : ""}</h1>
        <div class="sub">${_esc(periodoLabel)} · ${_esc(_textoIntervalo(iv))}${ivAnt ? ` · comparado com ${_esc(_textoIntervalo(ivAnt))}` : ""} · Gerado em ${new Date().toLocaleDateString("pt-BR")}</div>
        <div class="kpis">
          <div class="kpi"><div class="kpi-t">Faturamento Bruto</div><div class="kpi-v">${kpi("card-faturamento")}</div>${delta("faturamento")}</div>
          <div class="kpi"><div class="kpi-t">CMV (Estoque)</div><div class="kpi-v">${kpi("card-cmv")}</div>${delta("cmv")}</div>
          <div class="kpi"><div class="kpi-t">Despesas Totais</div><div class="kpi-v">${kpi("card-despesas")}</div>${delta("despesas")}</div>
          <div class="kpi"><div class="kpi-t">Lucro Líquido</div><div class="kpi-v">${kpi("card-lucro")}</div>${delta("lucro")}</div>
          <div class="kpi"><div class="kpi-t">Margem de Lucro</div><div class="kpi-v">${kpi("card-margem")}</div>${delta("margem")}</div>
          <div class="kpi"><div class="kpi-t">Ticket Médio</div><div class="kpi-v">${kpi("card-ticket")}</div>${delta("ticket")}</div>
        </div>
        <h2>DRE do período</h2>
        <table>
          <thead><tr><th>Conta</th><th class="n">Valor</th><th class="n">% da receita</th>${a ? '<th class="n">Período anterior</th>' : ""}</tr></thead>
          <tbody>${dre}</tbody>
        </table>
        ${canais ? `<h2>Desempenho por canal</h2>
        <table>
          <thead><tr><th>Canal</th><th class="n">Vendas</th><th class="n">Faturamento</th><th class="n">Taxas, fretes e impostos</th><th class="n">Receita líquida</th><th class="n">Participação</th></tr></thead>
          <tbody>${canais}</tbody>
        </table>` : ""}
        ${destaques ? `<h2>Destaques</h2><ul>${destaques}</ul>` : ""}
        <h2>Lançamentos</h2>
        <table>
          <thead><tr><th>Data</th><th>Tipo/Canal</th><th>Descrição</th><th>Responsável</th><th class="n">Bruto</th><th class="n">Deduções</th><th class="n">Líquido</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" style="text-align:center; padding:20px;">Sem lançamentos no período</td></tr>'}</tbody>
        </table>
        <div class="rodape">Bapell Gestor Pro · Controle Financeiro</div>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); }, 400);
    showToast("Gerando PDF...", "success");
  }

  // ── Planilha do extrato (Excel) ──
  // A biblioteca de planilhas (a mesma do Processador) só é carregada aqui,
  // na primeira exportação: a tela abre sem esse peso.
  let _promessaXlsx = null;
  function _carregarXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (_promessaXlsx) return _promessaXlsx;
    _promessaXlsx = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "JS/xlsx.full.min.js";
      s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error("Biblioteca de planilhas indisponível")));
      s.onerror = () => { _promessaXlsx = null; reject(new Error("Falha ao carregar a biblioteca de planilhas")); };
      document.head.appendChild(s);
    });
    return _promessaXlsx;
  }

  function _baixarArquivo(conteudo, nome, tipo) {
    const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Os lançamentos que estão no extrato (com os filtros), em planilha:
  // aba "Extrato" e aba "DRE". Sem a biblioteca, sai um CSV (abre no Excel).
  function exportarPlanilha() {
    const lista = _listaExtrato();
    if (!lista.length) {
      showToast("Nenhum lançamento no extrato para exportar.", "warning");
      return;
    }
    const emp = _empresaAtiva();
    const slug = String((emp && emp.nome) || "empresa").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "empresa";
    const nomeBase = `financeiro-${slug}-${_isoDe(new Date())}`;
    const r2 = (v) => Math.round(_n(v) * 100) / 100;
    const cab = ["Data", "Tipo", "Canal / Categoria", "Descrição", "Responsável", "Valor bruto", "Deduções", "Líquido", "Editado"];
    const linhas = lista.map((m) => {
      const isVenda = m.tipo === "Venda";
      const [ano, mes, dia] = String(m.data || "").slice(0, 10).split("-").map(Number);
      return [
        // A data vai como o número de dia do Excel (dia inteiro, sem hora):
        // assim o fuso não mexe nela e fórmulas que comparam datas batem.
        ano ? { dia: Math.round((Date.UTC(ano, (mes || 1) - 1, dia || 1) - Date.UTC(1899, 11, 30)) / 86400000) } : "",
        isVenda ? "Entrada" : "Saída",
        m.canalCategoria || "",
        m.descricao || "",
        m.responsavel || "",
        isVenda ? r2(m.bruto) : "",
        isVenda ? r2(m.deducoes) : "",
        r2(m.liquido),
        m.editado ? "sim" : "",
      ];
    });

    const csv = () => {
      const celula = (v) => {
        if (v && typeof v === "object" && v.dia != null) {
          const d = new Date(Date.UTC(1899, 11, 30) + v.dia * 86400000);
          return `${_p2(d.getUTCDate())}/${_p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
        }
        if (typeof v === "number") return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
        const t = String(v == null ? "" : v);
        return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
      };
      const texto = [cab].concat(linhas).map((l) => l.map(celula).join(";")).join("\r\n");
      _baixarArquivo("﻿" + texto, nomeBase + ".csv", "text/csv;charset=utf-8");
      showToast("Extrato exportado (CSV).", "success");
    };

    _carregarXlsx().then((XLSX) => {
      const ws = XLSX.utils.aoa_to_sheet([cab].concat(linhas.map((l) => [l[0] && l[0].dia != null ? l[0].dia : l[0]].concat(l.slice(1)))));
      const ref = XLSX.utils.decode_range(ws["!ref"]);
      for (let R = 1; R <= ref.e.r; R++) {
        [5, 6, 7].forEach((C) => {
          const cel = ws[XLSX.utils.encode_cell({ r: R, c: C })];
          if (cel && typeof cel.v === "number") cel.z = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
        });
        const d = ws[XLSX.utils.encode_cell({ r: R, c: 0 })];
        if (d && typeof d.v === "number") d.z = "dd/mm/yyyy";
      }
      ws["!cols"] = [{ wch: 11 }, { wch: 9 }, { wch: 20 }, { wch: 40 }, { wch: 16 }, { wch: 14 }, { wch: 13 }, { wch: 14 }, { wch: 8 }];
      ws["!autofilter"] = { ref: ws["!ref"] };

      // Aba DRE: o mesmo do quadro "DRE do Período" (o período do painel).
      const c = _resumir(movimentacoes.filter(_dentroDoPeriodo));
      const fat = c.faturamento;
      // Custos: a parte da receita que consomem; resultados: com o sinal.
      const pctR = (v, resultado) => (fat > 0 ? Math.round(((resultado ? v : Math.abs(v)) / fat) * 10000) / 10000 : "");
      const neg = (v) => -r2(v) || 0; // sem "−0"
      const dre = [
        ["Conta", "Valor", "% da receita"],
        ["Receita bruta de vendas", r2(c.faturamento), pctR(c.faturamento)],
        ["(−) Deduções sobre vendas", neg(c.deducoes), pctR(c.deducoes)],
        ["    Taxas de canal e cartão", neg(c.taxa), pctR(c.taxa)],
        ["    Fretes", neg(c.frete), pctR(c.frete)],
        ["    Impostos", neg(c.imposto), pctR(c.imposto)],
        ["    Outras deduções", neg(c.outrasDed), pctR(c.outrasDed)],
        ["(=) Receita líquida", r2(c.receitaLiquida), pctR(c.receitaLiquida, true)],
        ["(−) Custo dos produtos vendidos (CMV)", neg(c.cmv), pctR(c.cmv)],
        ["(=) Lucro bruto", r2(c.lucroBruto), pctR(c.lucroBruto, true)],
        ["(−) Despesas operacionais", neg(c.despesasOutras), pctR(c.despesasOutras)],
        ["    Operacionais", neg(c.oper), pctR(c.oper)],
        ["    Fixas", neg(c.fixa), pctR(c.fixa)],
        ["    Softwares", neg(c.soft), pctR(c.soft)],
        ["    Marketing e anúncios", neg(c.mkt), pctR(c.mkt)],
        ["    Perdas", neg(c.perdas), pctR(c.perdas)],
        ["    Devoluções", neg(c.devolucoes), pctR(c.devolucoes)],
        ["    Outros", neg(c.outros), pctR(c.outros)],
        ["(=) Resultado líquido do período", r2(c.lucro), pctR(c.lucro, true)],
        [],
        ["Período", `${ROTULOS_PERIODO[periodoAtual] || ""} — ${_textoIntervalo(_intervalo(periodoAtual))}`],
        ["Empresa", (emp && emp.nome) || ""],
      ];
      const wsDre = XLSX.utils.aoa_to_sheet(dre);
      for (let R = 1; R <= 18; R++) {
        const v = wsDre[XLSX.utils.encode_cell({ r: R, c: 1 })];
        if (v && typeof v.v === "number") v.z = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
        const p = wsDre[XLSX.utils.encode_cell({ r: R, c: 2 })];
        if (p && typeof p.v === "number") p.z = "0.0%";
      }
      wsDre["!cols"] = [{ wch: 40 }, { wch: 16 }, { wch: 13 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Extrato");
      XLSX.utils.book_append_sheet(wb, wsDre, "DRE");
      XLSX.writeFile(wb, nomeBase + ".xlsx", { compression: true });
      showToast(`Planilha gerada com ${lista.length} lançamento${lista.length === 1 ? "" : "s"}.`, "success");
    }).catch((e) => {
      console.warn("[Financeiro] planilha em CSV:", e && e.message);
      csv();
    });
  }

  // ══════════════════════════════════════════
  //  CONFIGURAR CAMPOS (ocultar/mostrar blocos)
  // ══════════════════════════════════════════
  function _aplicarVisibilidade() {
    const ocultos = _store.camposOcultos || [];
    // Blocos inteiros (gráficos, extrato)
    document.querySelectorAll("[data-bloco]").forEach((el) => {
      el.style.display = ocultos.includes("bloco_" + el.dataset.bloco) ? "none" : "";
    });
    // Cards KPI individuais
    document.querySelectorAll("[data-kpi]").forEach((el) => {
      el.style.display = ocultos.includes("kpi_" + el.dataset.kpi) ? "none" : "";
    });
    // Campos de venda/despesa (marcados por id do input)
    _CAMPOS_FORM.forEach((c) => {
      const input = document.getElementById(c.id);
      if (input) {
        const fg = input.closest(".field-group");
        if (fg) fg.style.display = ocultos.includes("formcampo_" + c.id) ? "none" : "";
      }
    });
    // Campos das seções custom
    document.querySelectorAll("[data-campo-key]").forEach((el) => {
      el.style.display = ocultos.includes(el.dataset.campoKey) ? "none" : "";
    });
    _balancearKpis();
  }

  /**
   * Colunas dos cards de indicadores: divide os cards VISÍVEIS em linhas
   * equilibradas pela largura disponível (6 → 3 + 3; 5 → 3 + 2; 4 → 2 + 2
   * ou 4 numa linha), em vez de deixar um card sozinho embaixo.
   */
  const KPI_LARGURA_MIN = 215;
  function _balancearKpis() {
    const grade = document.getElementById("finCards");
    if (!grade) return;
    const n = Array.from(grade.querySelectorAll("[data-kpi]")).filter((el) => el.style.display !== "none").length;
    const largura = grade.clientWidth;
    if (!n || !largura) return;
    const gap = 16;
    const cabem = Math.max(1, Math.floor((largura + gap) / (KPI_LARGURA_MIN + gap)));
    const linhas = Math.ceil(n / Math.min(cabem, n));
    const colunas = String(Math.ceil(n / linhas));
    // Só mexe quando muda: trocar as colunas muda a altura da grade, e a
    // grade é observada (ver abaixo).
    if (grade.style.getPropertyValue("--kpi-cols") !== colunas) grade.style.setProperty("--kpi-cols", colunas);
  }
  // A largura da grade muda com a janela e com o menu lateral. A conta vai
  // para o quadro seguinte (requestAnimationFrame): mudar as colunas dentro
  // do próprio aviso do ResizeObserver gera o erro "ResizeObserver loop",
  // que o error-handler.js mostraria como "erro inesperado".
  let _quadroKpis = 0;
  const _agendarKpis = () => {
    if (_quadroKpis) return;
    _quadroKpis = requestAnimationFrame(() => { _quadroKpis = 0; _balancearKpis(); });
  };
  if (typeof ResizeObserver === "function") {
    const _gradeKpis = document.getElementById("finCards");
    let _larguraKpis = -1;
    if (_gradeKpis) new ResizeObserver((entradas) => {
      const w = Math.round(entradas[0] && entradas[0].contentRect ? entradas[0].contentRect.width : _gradeKpis.clientWidth);
      if (w === _larguraKpis) return; // só a altura mudou (efeito das colunas)
      _larguraKpis = w;
      _agendarKpis();
    }).observe(_gradeKpis);
  } else {
    window.addEventListener("resize", _agendarKpis);
  }

  // Campos dos formulários de Entrada e Saída (para o Configurar Campos).
  // O id do campo é a chave guardada ("formcampo_<id>"): não muda.
  const _CAMPOS_FORM = [
    { id: "venda-canal", label: "Entrada: Canal", grupo: "venda" },
    { id: "venda-desc", label: "Entrada: Descrição", grupo: "venda" },
    { id: "venda-bruto", label: "Entrada: Valor Bruto", grupo: "venda" },
    { id: "venda-taxa", label: "Entrada: Taxa Canal/Cartão", grupo: "venda" },
    { id: "venda-frete", label: "Entrada: Custo Frete", grupo: "venda" },
    { id: "venda-imposto", label: "Entrada: Impostos", grupo: "venda" },
    { id: "despesa-categoria", label: "Saída: Categoria", grupo: "despesa" },
    { id: "despesa-desc", label: "Saída: Descrição", grupo: "despesa" },
    { id: "despesa-valor", label: "Saída: Valor", grupo: "despesa" },
  ];

  function _abrirModalConfig() {
    const existing = document.getElementById("modalConfigFin");
    if (existing) existing.remove();
    const ocultos = _store.camposOcultos || [];
    const isOc = (k) => ocultos.includes(k);
    const btnVis = (key) =>
      `<button type="button" class="btn-cfg-vis btn-secondary" data-key="${key}" style="font-size:11px; padding:4px 14px; min-height:auto;">${isOc(key) ? "Mostrar" : "Ocultar"}</button>`;

    // Grupo KPIs (expansível, cards individuais)
    let kpiItems = "";
    document.querySelectorAll("[data-kpi]").forEach((el) => {
      const key = "kpi_" + el.dataset.kpi;
      kpiItems += `<div class="cfg-item"><span style="font-size:13px; font-weight:600;">${el.dataset.kpiNome}</span>${btnVis(key)}</div>`;
    });

    // Grupos de campos de venda e despesa
    const campos = (grupo) => _CAMPOS_FORM.filter((c) => c.grupo === grupo)
      .map((c) => `<div class="cfg-item"><span style="font-size:13px; font-weight:600;">${c.label.split(": ")[1]}</span>${btnVis("formcampo_" + c.id)}</div>`)
      .join("");

    // Blocos "esconder tudo" (gráficos e extrato)
    const blocoSimples = (bloco, nome) =>
      `<div class="cfg-item" style="background:var(--clr-surface-alt);">
        <span style="font-size:13px; font-weight:600;">${nome}</span>${btnVis("bloco_" + bloco)}</div>`;

    // Seções custom
    let customHtml = "";
    (_store.secoesCustom || []).forEach((secao) => {
      if (!secao.campos || !secao.campos.length) return;
      customHtml += `<div class="cfg-grupo"><div class="cfg-grupo-head"><span style="font-size:13px; font-weight:700;">Seção: ${_esc(secao.titulo || "Sem nome")}</span><span class="cfg-seta">▼</span></div><div class="cfg-grupo-body">`;
      customHtml += secao.campos.map((campo) =>
        `<div class="cfg-item"><span style="font-size:13px; font-weight:600;">${_esc(campo.rotulo || "Campo")}</span>${btnVis("campo_" + campo.id)}</div>`
      ).join("");
      customHtml += `</div></div>`;
    });

    // Senha unificada (JS/senhas.js): Administrador e Colaborador, geridas
    // na tela "Usuários e Senhas". Sem o senhas.js, a senha antiga do Financeiro.
    const senhasUnificadas = !!(window.BapellSenhas && typeof window.BapellSenhas.abrirGerenciador === "function");
    const temSenha = senhasUnificadas
      ? _financeiroBloqueado()
      : !!(_container.seguranca && _container.seguranca.hash);
    const rotuloSenha = senhasUnificadas
      ? (temSenha
          ? "Protegido por senha (Administrador e Colaborador)"
          : (window.BapellSenhas.protegido() ? "Desbloqueado: abre sem senha" : "Proteger com senha"))
      : (temSenha ? "Senha de acesso ativada" : "Proteger com senha");
    const botaoSenha = senhasUnificadas ? "Usuários e Senhas" : (temSenha ? "Alterar / Remover" : "Definir senha");

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalConfigFin";
    overlay.innerHTML = `
      <div class="modal" style="max-width:520px; width:90%; max-height:85vh; display:flex; flex-direction:column;">
        <div class="modal-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Configurar Campos</span>
          <button type="button" id="btnFecharCfgFin" style="background:transparent; border:none; color:var(--clr-text-3); font-size:22px; cursor:pointer; line-height:1;">✕</button>
        </div>
        <div class="modal-subtitle">Expanda os grupos para ocultar itens específicos.</div>
        <div style="overflow-y:auto; flex:1; margin:12px 0;">

          <div class="cfg-grupo">
            <div class="cfg-grupo-head"><span style="font-size:13px; font-weight:700;">Cards de Indicadores (KPIs)</span><span class="cfg-seta">▼</span></div>
            <div class="cfg-grupo-body">${kpiItems}</div>
          </div>

          <div class="cfg-grupo">
            <div class="cfg-grupo-head"><span style="font-size:13px; font-weight:700;">Registrar Entrada</span><span class="cfg-seta">▼</span></div>
            <div class="cfg-grupo-body">${campos("venda")}</div>
          </div>

          <div class="cfg-grupo">
            <div class="cfg-grupo-head"><span style="font-size:13px; font-weight:700;">Registrar Saída</span><span class="cfg-seta">▼</span></div>
            <div class="cfg-grupo-body">${campos("despesa")}</div>
          </div>

          <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--clr-text-3); margin:14px 0 8px;">Blocos inteiros</div>
          ${blocoSimples("insights", "Insights do Período")}
          ${blocoSimples("dre", "DRE do Período")}
          ${blocoSimples("canais", "Desempenho por Canal")}
          ${blocoSimples("graficos", "Gráficos de Análise")}
          ${blocoSimples("extrato", "Extrato de Lançamentos")}

          ${customHtml ? `<div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--clr-text-3); margin:14px 0 8px;">Seções personalizadas</div>${customHtml}` : ""}

          <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--clr-text-3); margin:16px 0 8px;">Segurança</div>
          <div class="cfg-item" style="background:var(--clr-surface-alt);">
            <span style="font-size:13px; font-weight:600;">${rotuloSenha}</span>
            <button type="button" id="btnConfigSenha" class="btn-secondary" style="font-size:11px; padding:4px 14px; min-height:auto;">${botaoSenha}</button>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-primary" id="btnFecharCfgFin2" style="padding:10px var(--sp-lg);font-size:14px;">Concluído</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Accordion
    overlay.querySelectorAll(".cfg-grupo-head").forEach((head) => {
      head.addEventListener("click", () => head.parentElement.classList.toggle("aberto"));
    });

    const fechar = () => overlay.remove();
    overlay.querySelectorAll(".btn-cfg-vis").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        if (!_store.camposOcultos) _store.camposOcultos = [];
        const idx = _store.camposOcultos.indexOf(key);
        if (idx >= 0) { _store.camposOcultos.splice(idx, 1); btn.textContent = "Ocultar"; }
        else { _store.camposOcultos.push(key); btn.textContent = "Mostrar"; }
        _salvar();
        _aplicarVisibilidade();
      });
    });
    document.getElementById("btnConfigSenha").addEventListener("click", () => {
      fechar();
      // As senhas agora ficam na tela Usuários e Senhas; o "Voltar" de lá
      // traz de volta para cá.
      if (senhasUnificadas) window.location.href = "usuarios.html?voltar=financeiro.html";
      else _abrirModalDefinirSenha();
    });
    document.getElementById("btnFecharCfgFin").addEventListener("click", fechar);
    document.getElementById("btnFecharCfgFin2").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
  }

  // ══════════════════════════════════════════
  //  SEÇÕES PERSONALIZADAS + ORDENAÇÃO
  // ══════════════════════════════════════════
  function _escSec(s) { return _esc(s); }
  function _genId() {
    if (typeof generateId === "function") return generateId();
    return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function _tipoInfo(tipo) {
    switch (tipo) {
      case "money":  return { prefix: "R$", suffix: "", placeholder: "0,00", inputmode: "decimal" };
      case "percent":return { prefix: "", suffix: "%", placeholder: "0", inputmode: "decimal" };
      case "number": return { prefix: "", suffix: "", placeholder: "0", inputmode: "numeric" };
      default:       return { prefix: "", suffix: "", placeholder: "Digite...", inputmode: "text" };
    }
  }

  function _renderSecoesCustom() {
    const container = document.getElementById("secoesCustomContainer");
    if (!container) return;
    container.innerHTML = "";
    if (!_store.secoesCustom) _store.secoesCustom = [];

    _store.secoesCustom.forEach((secao) => {
      const card = document.createElement("div");
      card.className = "card mb-lg";
      card.style.width = "100%";
      card.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px;">
          <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
            <span class="card-title-dot"></span>
            <input type="text" class="input-field secao-titulo-input" value="${_escSec(secao.titulo)}" placeholder="Título da seção"
                   style="font-size:15px; font-weight:700; border:1px solid transparent; background:transparent; padding:4px 6px; flex:1; min-width:0;" />
          </div>
          <button type="button" class="btn-secondary secao-remover" style="font-size:12px; padding:6px 12px; flex-shrink:0;">Remover Seção</button>
        </div>
        <div class="secao-campos" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:12px;"></div>
        <button type="button" class="btn-secondary secao-add-campo" style="font-size:13px; margin-top:12px;">+ &nbsp;Adicionar Campo</button>
      `;

      const tit = card.querySelector(".secao-titulo-input");
      tit.addEventListener("input", (e) => { secao.titulo = e.target.value; _salvar(); });
      tit.addEventListener("focus", () => tit.style.borderColor = "var(--clr-border)");
      tit.addEventListener("blur", () => tit.style.borderColor = "transparent");

      card.querySelector(".secao-remover").addEventListener("click", () => {
        _store.secoesCustom = _store.secoesCustom.filter((s) => s.id !== secao.id);
        _salvar(); _renderSecoesCustom();
      });
      card.querySelector(".secao-add-campo").addEventListener("click", () => {
        _abrirModalTipoCampo((tipo, rotulo) => {
          if (!secao.campos) secao.campos = [];
          secao.campos.push({ id: _genId(), rotulo, valor: "", tipo });
          _salvar(); _renderSecoesCustom();
        });
      });

      const campos = card.querySelector(".secao-campos");
      (secao.campos || []).forEach((campo) => {
        const info = _tipoInfo(campo.tipo);
        const fg = document.createElement("div");
        fg.className = "field-group";
        fg.dataset.campoKey = "campo_" + campo.id;
        fg.innerHTML = `
          <label style="display:flex; justify-content:space-between; align-items:center;">
            <span>${_escSec(campo.rotulo)}</span>
            <button type="button" class="btn-rm-campo" style="background:transparent; border:none; color:var(--clr-danger); cursor:pointer; font-size:10px;">Excluir</button>
          </label>
          <div class="input-addon-wrap ${info.suffix ? "input-addon-wrap-suffix" : ""}">
            ${info.prefix ? `<span class="input-prefix">${info.prefix}</span>` : ""}
            <input type="text" class="input-field secao-campo-input" inputmode="${info.inputmode}" value="${_escSec(campo.valor)}" placeholder="${info.placeholder}" />
            ${info.suffix ? `<span class="input-suffix">${info.suffix}</span>` : ""}
          </div>
        `;
        const input = fg.querySelector(".secao-campo-input");
        input.addEventListener("input", (e) => { campo.valor = e.target.value; _salvar(); });
        if (campo.tipo === "money" || campo.tipo === "percent") {
          input.addEventListener("blur", () => {
            if (input.value.trim() === "") return;
            const n = parseFormattedValue(input.value);
            input.value = campo.tipo === "money" ? formatMoneyBR(n) : formatPercentBR(n);
            campo.valor = input.value; _salvar();
          });
        } else if (campo.tipo === "number") {
          input.addEventListener("input", () => { input.value = input.value.replace(/[^\d]/g, ""); campo.valor = input.value; });
        }
        fg.querySelector(".btn-rm-campo").addEventListener("click", () => {
          secao.campos = secao.campos.filter((c) => c.id !== campo.id);
          _salvar(); _renderSecoesCustom();
        });
        campos.appendChild(fg);
      });

      container.appendChild(card);
    });
    _aplicarVisibilidade();
  }

  // opcoes (todas opcionais): titulo, subtitulo, dica (o que entra no
  // cálculo) e exemplo (o placeholder do nome).
  function _abrirModalTipoCampo(onConfirm, opcoes) {
    opcoes = opcoes || {};
    const ex = document.getElementById("modalTipoCampo");
    if (ex) ex.remove();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalTipoCampo";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${_esc(opcoes.titulo || "Novo Campo")}</div>
        <div class="modal-subtitle" style="margin-bottom: var(--sp-lg);">${_esc(opcoes.subtitulo || "Escolha o tipo e dê um nome ao campo.")}</div>
        ${opcoes.dica ? `<div class="fin-dica-campo">${opcoes.dica}</div>` : ""}
        <div class="field-group" style="margin-bottom: var(--sp-md);">
          <label>Nome do Campo</label>
          <input type="text" id="inputRotuloCampo" class="input-field" placeholder="${_esc(opcoes.exemplo || "Ex: Meta do mês")}" />
        </div>
        <div class="field-group" style="margin-bottom: var(--sp-lg);">
          <label>Tipo</label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <button type="button" class="btn-secondary tipo-opt active" data-tipo="text">Texto</button>
            <button type="button" class="btn-secondary tipo-opt" data-tipo="money">R$ (dinheiro)</button>
            <button type="button" class="btn-secondary tipo-opt" data-tipo="percent">% (porcentagem)</button>
            <button type="button" class="btn-secondary tipo-opt" data-tipo="number">Número</button>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="cancelTipoCampo">Cancelar</button>
          <button class="btn-primary" id="confirmTipoCampo" style="padding:10px var(--sp-lg);font-size:14px;">Adicionar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    let tipo = "text";
    const input = document.getElementById("inputRotuloCampo");
    const fechar = () => overlay.remove();
    overlay.querySelectorAll(".tipo-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        overlay.querySelectorAll(".tipo-opt").forEach((b) => { b.classList.remove("active"); b.style.borderColor = ""; b.style.color = ""; });
        btn.classList.add("active"); btn.style.borderColor = "var(--clr-primary)"; btn.style.color = "var(--clr-primary)";
        tipo = btn.dataset.tipo;
      });
    });
    const p = overlay.querySelector(".tipo-opt.active");
    if (p) { p.style.borderColor = "var(--clr-primary)"; p.style.color = "var(--clr-primary)"; }
    const confirmar = () => {
      const r = input.value.trim();
      if (!_exigir([{ el: input, msg: "Digite o nome do campo." }])) return;
      fechar(); onConfirm(tipo, r);
    };
    document.getElementById("cancelTipoCampo").addEventListener("click", fechar);
    document.getElementById("confirmTipoCampo").addEventListener("click", confirmar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirmar();
      else if (e.key === "Escape") { e.preventDefault(); fechar(); }
    });
    setTimeout(() => input.focus(), 60);
  }

  // ══════════════════════════════════════════
  //  "+ ADICIONAR CAMPOS" (botão único, ao lado do título)
  //
  //  Substitui os dois botões que ficavam dentro do Registrar Entrada e
  //  do Registrar Saída — como na tela do produto: primeiro a área, depois
  //  o mesmo "Novo Campo" de antes. Os campos continuam guardados onde
  //  sempre estiveram (camposVenda / camposDespesa).
  // ══════════════════════════════════════════
  function _novoCampoVenda() {
    _abrirModalTipoCampo((tipo, rotulo) => {
      if (!_store.camposVenda) _store.camposVenda = [];
      _store.camposVenda.push({ id: _genId(), rotulo, tipo });
      _salvar();
      _renderCamposExtra("venda");
      _aplicarVisibilidade();
      _atualizarPreviewLiquido();
      showToast(`Campo "${rotulo}" adicionado ao Registrar Entrada.`, "success");
    }, {
      titulo: "Novo campo — Registrar Entrada",
      exemplo: "Ex: Comissão do vendedor, Nº do pedido",
      dica: "Campos <strong>R$</strong> e <strong>%</strong> entram no cálculo: são descontados do valor bruto, como a taxa e o frete (o % incide sobre o valor bruto). Texto e número são só informação.",
    });
  }

  function _novoCampoDespesa() {
    _abrirModalTipoCampo((tipo, rotulo) => {
      if (!_store.camposDespesa) _store.camposDespesa = [];
      _store.camposDespesa.push({ id: _genId(), rotulo, tipo });
      _salvar();
      _renderCamposExtra("despesa");
      _aplicarVisibilidade();
      _atualizarPreviewSaida();
      showToast(`Campo "${rotulo}" adicionado ao Registrar Saída.`, "success");
    }, {
      titulo: "Novo campo — Registrar Saída",
      exemplo: "Ex: Juros, Multa, Nº da nota",
      dica: "Campos <strong>R$</strong> e <strong>%</strong> entram no cálculo: são somados ao valor da saída (o % incide sobre o valor). Texto e número são só informação.",
    });
  }

  const AREAS_CAMPOS_FIN = [
    { id: "entrada", nome: "Registrar Entrada", desc: "Vendas e recebimentos: comissões, taxas extras, nº do pedido...", tile: "sucesso",
      icone: '<line x1="17" y1="7" x2="7" y2="17"></line><polyline points="17 17 7 17 7 7"></polyline>', acao: _novoCampoVenda },
    { id: "saida", nome: "Registrar Saída", desc: "Custos e despesas: juros, multas, nº da nota...", tile: "perigo",
      icone: '<line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline>', acao: _novoCampoDespesa },
  ];

  // A escolha da área (mesmo visual da tela do produto: .escolha-area).
  function _abrirEscolhaCampos() {
    if (!_temEmpresa()) {
      showToast("Adicione uma empresa primeiro.", "warning");
      return;
    }
    const ex = document.getElementById("modalEscolhaCamposFin");
    if (ex) ex.remove();
    const fundo = document.createElement("div");
    fundo.className = "modal-overlay escolha-area";
    fundo.id = "modalEscolhaCamposFin";
    fundo.setAttribute("role", "dialog");
    fundo.setAttribute("aria-modal", "true");
    fundo.innerHTML =
      '<div class="modal escolha-area__modal">' +
        '<div class="modal-header">' +
          "<h3>Adicionar campo personalizado</h3>" +
          '<button type="button" class="modal-close" id="eaFecharFin" aria-label="Fechar">&times;</button>' +
        "</div>" +
        '<p class="escolha-area__sub">Em qual formulário o campo deve aparecer?</p>' +
        '<div class="escolha-area__lista">' +
          AREAS_CAMPOS_FIN.map((a) =>
            `<button type="button" class="escolha-area__item fin-area" data-area="${a.id}">` +
              `<span class="fin-ico-tile fin-ico-tile--${a.tile}" aria-hidden="true"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${a.icone}</svg></span>` +
              `<span class="fin-area__textos"><span class="escolha-area__nome">${a.nome}</span><span class="escolha-area__desc">${a.desc}</span></span>` +
            "</button>"
          ).join("") +
        "</div>" +
      "</div>";
    document.body.appendChild(fundo);

    const fechar = () => {
      fundo.remove();
      document.removeEventListener("keydown", aoTeclar, true);
    };
    function aoTeclar(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(); }
    }
    document.addEventListener("keydown", aoTeclar, true);
    fundo.querySelector("#eaFecharFin").addEventListener("click", fechar);
    fundo.addEventListener("mousedown", (e) => { if (e.target === fundo) fechar(); });
    fundo.querySelectorAll(".escolha-area__item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const area = AREAS_CAMPOS_FIN.find((a) => a.id === btn.dataset.area);
        fechar();
        if (area) area.acao();
      });
    });
    setTimeout(() => {
      const primeiro = fundo.querySelector(".escolha-area__item");
      if (primeiro) try { primeiro.focus(); } catch (e) {}
    }, 50);
  }

  function _adicionarSecao() {
    if (!_store.secoesCustom) _store.secoesCustom = [];
    _store.secoesCustom.push({ id: _genId(), titulo: "Nova Seção", campos: [] });
    _salvar(); _renderSecoesCustom();
    setTimeout(() => {
      const c = document.getElementById("secoesCustomContainer");
      if (c && c.lastElementChild) {
        c.lastElementChild.scrollIntoView({ behavior: "smooth", block: "center" });
        const t = c.lastElementChild.querySelector(".secao-titulo-input");
        if (t) t.focus();
      }
    }, 60);
  }

  // Ordenação das seções custom (as fixas do financeiro não reordenam aqui)
  function _abrirModalOrdenarSecoes() {
    const secoes = (_store.secoesCustom || []).map((s) => ({ id: s.id, nome: s.titulo || "Seção sem nome" }));
    if (!secoes.length) { showToast("Nenhuma seção personalizada para ordenar.", "warning"); return; }
    const ex = document.getElementById("modalOrdenarSecoes");
    if (ex) ex.remove();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalOrdenarSecoes";
    overlay.innerHTML = `
      <div class="modal" style="max-width:460px; width:90%;">
        <div class="modal-title">Ordenar Posição das Seções</div>
        <div class="modal-subtitle" style="margin-bottom: var(--sp-lg);">Arraste pelo ícone <strong>☰</strong> para reordenar suas seções.</div>
        <div id="listaOrdenarSecoes" style="display:flex; flex-direction:column; gap:8px; max-height:50vh; overflow-y:auto;">
          ${secoes.map((s) => `
            <div class="ordenar-secao-item" draggable="true" data-sec-id="${s.id}"
                 style="display:flex; align-items:center; gap:12px; padding:12px 14px; background:var(--clr-surface-alt); border:1px solid var(--clr-border); border-radius:var(--r-md); cursor:grab; user-select:none;">
              <span style="color:var(--clr-text-3); font-size:16px; line-height:1;">☰</span>
              <span style="font-size:14px; font-weight:600; color:var(--clr-text);">${_esc(s.nome)}</span>
            </div>
          `).join("")}
        </div>
        <div class="modal-actions" style="margin-top: var(--sp-lg);">
          <button class="btn-secondary" id="cancelOrdenar">Cancelar</button>
          <button class="btn-primary" id="salvarOrdenar" style="padding:10px var(--sp-lg);font-size:14px;">Salvar Ordem</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const lista = document.getElementById("listaOrdenarSecoes");
    let dragEl = null;
    lista.querySelectorAll(".ordenar-secao-item").forEach((item) => {
      item.addEventListener("dragstart", () => { dragEl = item; item.style.opacity = "0.4"; });
      item.addEventListener("dragend", () => { item.style.opacity = "1"; dragEl = null; });
      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        const alvo = e.currentTarget;
        if (!dragEl || dragEl === alvo) return;
        const rect = alvo.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) lista.insertBefore(dragEl, alvo);
        else lista.insertBefore(dragEl, alvo.nextSibling);
      });
    });
    const fechar = () => overlay.remove();
    document.getElementById("cancelOrdenar").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
    document.getElementById("salvarOrdenar").addEventListener("click", () => {
      const novaOrdem = Array.from(lista.querySelectorAll(".ordenar-secao-item")).map((el) => el.dataset.secId);
      _store.secoesCustom.sort((a, b) => novaOrdem.indexOf(a.id) - novaOrdem.indexOf(b.id));
      _salvar(); _renderSecoesCustom(); fechar();
      showToast("Ordem atualizada!", "success");
    });
  }

  // ══════════════════════════════════════════
  //  SEGURANÇA / SENHA (SHA-256 via Web Crypto)
  // ══════════════════════════════════════════
  async function _hash(texto) {
    const enc = new TextEncoder().encode(texto);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Só o mínimo de 4 caracteres — a mesma regra de todas as senhas do app.
  function _validarForcaSenha(senha) {
    if (String(senha || "").length < 4) return "A senha deve ter no mínimo 4 caracteres.";
    return null;
  }

  // Modal para DEFINIR / ALTERAR / REMOVER senha (via Configurar Campos)
  function _abrirModalDefinirSenha() {
    const temSenha = !!(_container.seguranca && _container.seguranca.hash);
    const ex = document.getElementById("modalSenhaDef");
    if (ex) ex.remove();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalSenhaDef";
    overlay.innerHTML = `
      <div class="modal" style="max-width:420px; width:90%;">
        <div class="modal-title">${temSenha ? "Alterar / Remover Senha" : "Definir Senha de Acesso"}</div>
        <div class="modal-subtitle" style="margin-bottom:var(--sp-md);">Mínimo de 4 caracteres.</div>
        ${temSenha ? `
        <div class="field-group" style="margin-bottom:var(--sp-md);">
          <label>Senha atual</label>
          <input type="password" id="senhaAtual" class="input-field" placeholder="Digite a senha atual" />
        </div>` : ""}
        <div class="field-group" style="margin-bottom:var(--sp-md);">
          <label>${temSenha ? "Nova senha" : "Senha"}</label>
          <input type="password" id="senhaNova" class="input-field" placeholder="Nova senha" />
        </div>
        <div class="field-group" style="margin-bottom:var(--sp-md);">
          <label>Confirmar senha</label>
          <input type="password" id="senhaConf" class="input-field" placeholder="Repita a senha" />
        </div>
        <div class="modal-actions" style="justify-content:space-between;">
          ${temSenha ? `<button class="btn-danger" id="btnRemoverSenha" style="font-size:13px;">Remover senha</button>` : `<span></span>`}
          <div style="display:flex; gap:8px;">
            <button class="btn-secondary" id="btnCancelSenha">Cancelar</button>
            <button class="btn-primary" id="btnSalvarSenha" style="padding:10px var(--sp-lg);font-size:14px;">Salvar</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const fechar = () => overlay.remove();

    document.getElementById("btnCancelSenha").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });

    if (temSenha) {
      document.getElementById("btnRemoverSenha").addEventListener("click", async () => {
        const atual = document.getElementById("senhaAtual").value;
        if (!atual) { _marcarErro(document.getElementById("senhaAtual")); return showToast("Digite a senha atual.", "warning"); }
        const h = await _hash(atual);
        if (h !== _container.seguranca.hash) return showToast("Senha atual incorreta.", "error");
        _container.seguranca = null;
        _salvar();
        fechar();
        showToast("Senha removida.", "success");
      });
    }

    document.getElementById("btnSalvarSenha").addEventListener("click", async () => {
      if (temSenha) {
        const atual = document.getElementById("senhaAtual").value;
        const h = await _hash(atual);
        if (h !== _container.seguranca.hash) return showToast("Senha atual incorreta.", "error");
      }
      const nova = document.getElementById("senhaNova").value;
      const conf = document.getElementById("senhaConf").value;
      const erro = _validarForcaSenha(nova);
      if (erro) { _marcarErro(document.getElementById("senhaNova")); return showToast(erro, "warning"); }
      if (nova !== conf) { _marcarErro(document.getElementById("senhaConf")); return showToast("As senhas não coincidem.", "error"); }
      _container.seguranca = { hash: await _hash(nova) };
      _salvar();
      fechar();
      showToast(temSenha ? "Senha alterada!" : "Senha definida!", "success");
    });
  }

  // Senha unificada (JS/senhas.js): o Controle Financeiro é um dos módulos
  // com switch em "Usuários e Senhas". Pede senha só se houver a senha do
  // Administrador E ele estiver bloqueado (o padrão).
  function _financeiroBloqueado() {
    const s = window.BapellSenhas;
    if (!s) return false;
    if (typeof s.moduloProtegido === "function") return s.moduloProtegido("financeiro");
    return typeof s.protegido === "function" && s.protegido();
  }

  // O texto do convite do 1º acesso: os módulos que a senha criada vai
  // proteger — os bloqueados em "Usuários e Senhas" e sempre o Financeiro,
  // que é quem está perguntando.
  function _textoConviteSenha() {
    let nomes = ["Controle Financeiro", "Processador de Planilhas", "Ações em Massa"];
    try {
      if (typeof window.BapellSenhas.modulos === "function") {
        nomes = window.BapellSenhas.modulos()
          .filter((m) => m.bloqueado || m.id === "financeiro")
          .map((m) => m.nome);
      }
    } catch (e) {}
    const lista = nomes.length > 1
      ? nomes.slice(0, -1).join(", ") + " e " + nomes[nomes.length - 1]
      : nomes[0];
    return "Crie a senha do Administrador. Ela passa a proteger: " + lista + ". " +
      "Em Dados da Empresa › Usuários e Senhas você escolhe quais módulos ficam bloqueados e cria a senha do Colaborador.";
  }

  // ── GATE de acesso: roda ao abrir a página ──
  async function _gateAcesso() {
    const seg = _container.seguranca;
    const conteudo = document.querySelector(".app-layout");

    // ── Senha unificada (JS/senhas.js) ──
    // A senha do Controle Financeiro virou a senha do Administrador, e o
    // Colaborador ganhou a sua. A tela de acesso é a MESMA dos outros
    // módulos bloqueados, aberta pelo senhas.js (declarado no <head> desta
    // página): aqui só se espera a liberação. Com o Financeiro desbloqueado
    // em "Usuários e Senhas", ele abre direto.
    const senhasUnificadas = !!(window.BapellSenhas && typeof window.BapellSenhas.protegido === "function");
    if (senhasUnificadas && _financeiroBloqueado()) {
      return window.BapellSenhas.exigirAcesso("o Controle Financeiro", "financeiro");
    }

    // Já tem senha → pede para desbloquear
    // (caminho antigo: só vale se o senhas.js não estiver presente)
    if (!senhasUnificadas && seg && seg.hash) {
      return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.style.zIndex = "99999";
        overlay.innerHTML = `
          <div class="modal" style="max-width:380px; width:90%;">
            <div class="modal-title" style="display:flex; align-items:center; gap:8px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Acesso Protegido</div>
            <div class="modal-subtitle" style="margin-bottom:var(--sp-md);">Digite a senha para acessar o Controle Financeiro.</div>
            <div class="field-group" style="margin-bottom:var(--sp-md);">
              <input type="password" id="gateSenha" class="input-field" placeholder="Senha" autofocus />
            </div>
            <div id="gateAviso" style="display:none; font-size:12px; color:var(--clr-danger); margin-bottom:var(--sp-md);"></div>
            <div class="modal-actions" style="justify-content:space-between;">
              <button class="btn-secondary" id="gateVoltar">Voltar ao Início</button>
              <button class="btn-primary" id="gateEntrar" style="padding:10px var(--sp-lg);font-size:14px;">Entrar</button>
            </div>
          </div>
        `;
        // Esconde o conteúdo por completo (blur sozinho ainda deixa ler os números)
        if (conteudo) conteudo.style.visibility = "hidden";
        document.body.appendChild(overlay);
        const input = document.getElementById("gateSenha");
        const aviso = document.getElementById("gateAviso");
        const btnEntrar = document.getElementById("gateEntrar");
        setTimeout(() => input && input.focus(), 60);

        // Freio contra tentativa exaustiva: atraso crescente a cada erro
        let tentativas = 0;

        const tentar = async () => {
          if (btnEntrar.disabled) return;
          const h = await _hash(input.value);
          if (h === seg.hash) {
            overlay.remove();
            if (conteudo) conteudo.style.visibility = "";
            resolve(true);
            return;
          }

          tentativas++;
          input.value = "";

          if (tentativas >= 3) {
            // Bloqueia por alguns segundos, aumentando a cada 3 erros
            const espera = Math.min(30, 3 * Math.floor(tentativas / 3)) * 1000;
            btnEntrar.disabled = true;
            input.disabled = true;
            let restante = Math.round(espera / 1000);
            aviso.style.display = "block";
            aviso.textContent = `Senha incorreta. Aguarde ${restante}s para tentar de novo.`;
            const tick = setInterval(() => {
              restante--;
              if (restante <= 0) {
                clearInterval(tick);
                btnEntrar.disabled = false;
                input.disabled = false;
                aviso.style.display = "none";
                input.focus();
              } else {
                aviso.textContent = `Senha incorreta. Aguarde ${restante}s para tentar de novo.`;
              }
            }, 1000);
          } else {
            showToast("Senha incorreta.", "error");
            input.focus();
          }
        };
        btnEntrar.addEventListener("click", tentar);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") tentar(); });
        document.getElementById("gateVoltar").addEventListener("click", () => {
          resolve(false);
          window.location.href = "index.html";
        });
      });
    }

    // Primeiro acesso (nunca perguntou) → oferece criar senha
    // Com o senhas.js, a senha criada aqui é a do Administrador, que
    // protege os módulos bloqueados — o convite diz quais.
    const semSenha = senhasUnificadas ? !window.BapellSenhas.protegido() : !_container.seguranca;
    if (semSenha && !_container.senhaPerguntada) {
      const tituloConvite = senhasUnificadas ? "Proteger os módulos com senha?" : "Proteger o Controle Financeiro?";
      const textoConvite = senhasUnificadas
        ? _textoConviteSenha()
        : "Deseja criar uma senha para acessar este módulo? Você pode definir depois em Configurar Campos.";
      return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.style.zIndex = "99999";
        overlay.innerHTML = `
          <div class="modal" style="max-width:420px; width:90%;">
            <div class="modal-title">${tituloConvite}</div>
            <div class="modal-subtitle" style="margin-bottom:var(--sp-lg);">${textoConvite}</div>
            <div id="gateNovaSenhaWrap" style="display:none;">
              <div class="field-group" style="margin-bottom:var(--sp-md);">
                <label>Senha (mínimo de 4 caracteres)</label>
                <input type="password" id="gateNova" class="input-field" placeholder="Senha" />
              </div>
              <div class="field-group" style="margin-bottom:var(--sp-md);">
                <label>Confirmar senha</label>
                <input type="password" id="gateNovaConf" class="input-field" placeholder="Repita a senha" />
              </div>
            </div>
            <div class="modal-actions" style="justify-content:space-between;">
              <button class="btn-secondary" id="gateSemSenha">Não usar senha</button>
              <button class="btn-primary" id="gateCriarSenha" style="padding:10px var(--sp-lg);font-size:14px;">Criar senha</button>
            </div>
          </div>
        `;
        document.body.appendChild(overlay);

        let modoCriar = false;
        document.getElementById("gateCriarSenha").addEventListener("click", async () => {
          // A senha do Administrador é criada junto com as perguntas de
          // segurança (no mínimo 3), na janela do senhas.js — são elas que
          // recuperam o acesso se a senha for esquecida.
          if (senhasUnificadas && typeof window.BapellSenhas.criarAdmin === "function") {
            const criou = await window.BapellSenhas.criarAdmin({ bloquear: ["financeiro"] });
            if (!criou) return; // desistiu: o convite continua aberto
            _container.senhaPerguntada = true;
            _salvar();
            overlay.remove();
            showToast("Senha do Administrador criada! Os módulos bloqueados passam a pedir senha.", "success");
            resolve(true);
            return;
          }
          if (!modoCriar) {
            modoCriar = true;
            document.getElementById("gateNovaSenhaWrap").style.display = "block";
            document.getElementById("gateNova").focus();
            return;
          }
          const nova = document.getElementById("gateNova").value;
          const conf = document.getElementById("gateNovaConf").value;
          const erro = _validarForcaSenha(nova);
          if (erro) { _marcarErro(document.getElementById("gateNova")); return showToast(erro, "warning"); }
          if (nova !== conf) { _marcarErro(document.getElementById("gateNovaConf")); return showToast("As senhas não coincidem.", "error"); }
          if (senhasUnificadas) {
            let gravou = false;
            try {
              gravou = await window.BapellSenhas.definirAdmin(nova, ["financeiro"]);
            } catch (e) {
              return showToast((e && e.message) || "Não foi possível criar a senha.", "error");
            }
            if (!gravou) return; // o senhas.js já avisou o motivo (disco cheio)
          } else {
            _container.seguranca = { hash: await _hash(nova) };
          }
          _container.senhaPerguntada = true;
          _salvar();
          overlay.remove();
          showToast(
            senhasUnificadas
              ? "Senha do Administrador criada! Os módulos bloqueados passam a pedir senha."
              : "Senha criada! O módulo está protegido.",
            "success",
          );
          resolve(true);
        });
        document.getElementById("gateSemSenha").addEventListener("click", () => {
          _container.senhaPerguntada = true;
          _salvar();
          overlay.remove();
          resolve(true);
        });
      });
    }

    return Promise.resolve(true);
  }

  // ══════════════════════════════════════════
  //  LISTENERS
  // ══════════════════════════════════════════
  document.getElementById("btnLancarVenda").addEventListener("click", adicionarVenda);
  document.getElementById("btnLancarDespesa").addEventListener("click", adicionarDespesa);

  // Filtros e busca do extrato: só a tabela é redesenhada (antes cada
  // letra digitada na busca refazia a tela toda, gráficos inclusive).
  // Mudou o filtro, a lista volta para as primeiras linhas.
  const _aoFiltrarExtrato = () => { _limiteExtrato = PASSO_EXTRATO; _renderExtrato(); };
  document.getElementById("buscaExtrato").addEventListener("input", _aoFiltrarExtrato);
  const _fTipo = document.getElementById("filtroTipo");
  if (_fTipo) _fTipo.addEventListener("change", _aoFiltrarExtrato);
  const _fCat = document.getElementById("filtroCategoria");
  if (_fCat) _fCat.addEventListener("change", _aoFiltrarExtrato);
  const _fPer = document.getElementById("filtroPeriodoExtrato");
  if (_fPer) _fPer.addEventListener("change", () => {
    const cst = document.getElementById("periodoExtratoCustom");
    if (cst) cst.style.display = _fPer.value === "custom" ? "flex" : "none";
    _aoFiltrarExtrato();
  });
  const _eIni = document.getElementById("extratoInicio");
  if (_eIni) _eIni.addEventListener("change", _aoFiltrarExtrato);
  const _eFim = document.getElementById("extratoFim");
  if (_eFim) _eFim.addEventListener("change", _aoFiltrarExtrato);
  document.getElementById("btnExportar").addEventListener("click", exportarPDF);
  const _btnPlanilha = document.getElementById("btnExportarExtrato");
  if (_btnPlanilha) _btnPlanilha.addEventListener("click", exportarPlanilha);

  // Ações das linhas do extrato (um ouvinte só, na tabela).
  const _corpoExtrato = document.getElementById("tabela-corpo");
  if (_corpoExtrato) _corpoExtrato.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-del], button[data-edit], button[data-dup]");
    if (!btn || !_corpoExtrato.contains(btn)) return;
    if (btn.dataset.del != null) { const id = _idDe(btn.dataset.del); if (id != null) deletar(id); }
    else if (btn.dataset.edit != null) { const id = _idDe(btn.dataset.edit); if (id != null) editar(id); }
    else if (btn.dataset.dup != null) { const id = _idDe(btn.dataset.dup); if (id != null) duplicar(id); }
  });

  // Ordenar o extrato pelo cabeçalho (Data, Valor Bruto, Líquido).
  document.querySelectorAll(".fin-extrato th.fin-ordenavel").forEach((th) => {
    th.tabIndex = 0;
    const ordenar = () => {
      const campo = th.dataset.ordem;
      if (_ordemExtrato.campo === campo) _ordemExtrato.dir = _ordemExtrato.dir === "desc" ? "asc" : "desc";
      else _ordemExtrato = { campo, dir: "desc" };
      _renderExtrato();
    };
    th.addEventListener("click", ordenar);
    th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ordenar(); } });
  });

  const _btnMais = document.getElementById("btnExtratoMais");
  if (_btnMais) _btnMais.addEventListener("click", () => { _limiteExtrato += PASSO_EXTRATO; _renderExtrato(); });

  // DRE: abrir/fechar os grupos (Deduções, Despesas)
  const _corpoDre = document.getElementById("finDreCorpo");
  if (_corpoDre) {
    _corpoDre.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-grupo]");
      if (tr) _alternarGrupoDre(tr.dataset.grupo);
    });
    _corpoDre.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const tr = e.target.closest("tr[data-grupo]");
      if (!tr) return;
      e.preventDefault();
      const id = tr.dataset.grupo;
      _alternarGrupoDre(id);
      const novo = _corpoDre.querySelector(`tr[data-grupo="${id}"]`);
      if (novo) novo.focus();
    });
  }
  const _btnDre = document.getElementById("btnDreDetalhar");
  if (_btnDre) _btnDre.addEventListener("click", () => {
    const abrir = !["ded", "desp"].every((g) => _dreAbertos.has(g));
    ["ded", "desp"].forEach((g) => (abrir ? _dreAbertos.add(g) : _dreAbertos.delete(g)));
    _alternarGrupoDre("ded", abrir);
  });

  // "Lançar de novo": copia a saída escolhida para o formulário.
  const _atalhosSaida = document.getElementById("finAtalhosSaidaLista");
  if (_atalhosSaida) _atalhosSaida.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-dup]");
    if (!btn) return;
    const id = _idDe(btn.dataset.dup);
    if (id != null) duplicar(id);
  });

  // Prévia do Registrar Saída
  const _valorSaida = document.getElementById("despesa-valor");
  if (_valorSaida) _valorSaida.addEventListener("input", _atualizarPreviewSaida);

  // Descrição da saída escolhida entre as já usadas: a categoria vem junto
  // (a do lançamento mais recente com essa descrição).
  const _descSaida = document.getElementById("despesa-desc");
  if (_descSaida) _descSaida.addEventListener("change", () => {
    const d = _descSaida.value.trim().toLowerCase();
    if (!d) return;
    const igual = movimentacoes
      .filter((m) => m && m.tipo !== "Venda" && String(m.descricao || "").trim().toLowerCase() === d)
      .sort((x, y) => String(y.data || "").localeCompare(String(x.data || "")) || (_n(y.criadoEm) - _n(x.criadoEm)))[0];
    const sel = document.getElementById("despesa-categoria");
    if (igual && sel && Array.from(sel.options).some((o) => o.value === igual.canalCategoria)) sel.value = igual.canalCategoria;
  });

  // Enter num campo do formulário lança (como clicar em Lançar). Fica de
  // fora o campo com sugestões: lá o Enter escolhe a sugestão.
  function _enterLanca(botaoId, fn) {
    const btn = document.getElementById(botaoId);
    const card = btn && btn.closest(".fin-form-card");
    if (!card) return;
    card.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.isComposing || e.repeat) return;
      const t = e.target;
      if (!t || t.tagName !== "INPUT" || t.getAttribute("list")) return;
      e.preventDefault();
      t.blur(); // formata o valor (máscara) antes de ler
      // Pelo próprio botão: se ele pedir usuário e senha (Usuários e
      // Senhas › Senha nos botões), o Enter também pede.
      if (typeof btn.click === "function") btn.click();
      else fn();
    });
  }
  _enterLanca("btnLancarVenda", adicionarVenda);
  _enterLanca("btnLancarDespesa", adicionarDespesa);

  // Chips de período
  document.getElementById("periodoChips").querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.getElementById("periodoChips").querySelectorAll(".filter-chip")
        .forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      periodoAtual = chip.dataset.periodo;
      document.getElementById("periodoCustom").style.display =
        periodoAtual === "custom" ? "flex" : "none";
      _limiteExtrato = PASSO_EXTRATO;
      atualizarTela();
    });
  });
  document.getElementById("periodoInicio").addEventListener("change", () => { _limiteExtrato = PASSO_EXTRATO; atualizarTela(); });
  document.getElementById("periodoFim").addEventListener("change", () => { _limiteExtrato = PASSO_EXTRATO; atualizarTela(); });

  // Expandir/recolher extrato
  const btnCollapse = document.getElementById("btnCollapseExtrato");
  if (btnCollapse) {
    btnCollapse.addEventListener("click", () => {
      const body = document.getElementById("extratoBody");
      const recolhido = body.style.display === "none";
      body.style.display = recolhido ? "" : "none";
      btnCollapse.classList.toggle("recolhido", !recolhido);
    });
  }

  // Re-render gráficos ao trocar tema (observa o atributo data-theme)
  new MutationObserver(() => atualizarTela()).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  document.getElementById("btnConfigCampos").addEventListener("click", _abrirModalConfig);
  document.getElementById("btnAddSecao").addEventListener("click", _adicionarSecao);
  const _btnOrd = document.getElementById("btnOrdenarSecoes");
  if (_btnOrd) _btnOrd.addEventListener("click", _abrirModalOrdenarSecoes);

  const _btnMeta = document.getElementById("btnDefinirMeta");
  if (_btnMeta) _btnMeta.addEventListener("click", _definirMeta);

  // O "+ Adicionar Campos" único (ao lado do título) e os antigos de cada
  // formulário — que ficam escondidos, mas continuam funcionando.
  const _btnAddCampos = document.getElementById("btnAddCamposFin");
  if (_btnAddCampos) _btnAddCampos.addEventListener("click", _abrirEscolhaCampos);

  const _btnAddCampoVenda = document.getElementById("btnAddCampoVenda");
  if (_btnAddCampoVenda) _btnAddCampoVenda.addEventListener("click", _novoCampoVenda);

  const _btnAddCampoDespesa = document.getElementById("btnAddCampoDespesa");
  if (_btnAddCampoDespesa) _btnAddCampoDespesa.addEventListener("click", _novoCampoDespesa);

  // ── Listeners de empresa ──
  // (setinha e 3 pontinhos são ligados em _ligarControlesEmpresa)
  const _btnAddEmpVazio = document.getElementById("btnAddEmpresaVazio");
  if (_btnAddEmpVazio) _btnAddEmpVazio.addEventListener("click", _abrirModalAddEmpresa);

  // "Adicionar empresa" dentro do menu de 3 pontinhos
  const _btnAddEmp = document.getElementById("btnAddEmpresa");
  if (_btnAddEmp) _btnAddEmp.addEventListener("click", () => {
    const menu = document.getElementById("menuEmpresaDropdown");
    if (menu) menu.style.display = "none";
    _abrirModalAddEmpresa();
  });

  const _btnExcEmp = document.getElementById("btnExcluirEmpresa");
  if (_btnExcEmp) _btnExcEmp.addEventListener("click", () => {
    const menu = document.getElementById("menuEmpresaDropdown");
    if (menu) menu.style.display = "none";
    _excluirEmpresa();
  });

  // Aplica o estado salvo do menu lateral
  (function _aplicarEstadoSidebar() {
    const colapsado = localStorage.getItem("precifiq_sidebar_colapsada") === "1";
    const sb = document.getElementById("sidebar");
    if (sb) sb.classList.toggle("sidebar-colapsada", colapsado);
    document.body.classList.toggle("sidebar-colapsada-body", colapsado);
  })();

  // ══════════════════════════════════════════
  //  INICIALIZAÇÃO
  // ══════════════════════════════════════════
  // A senha é verificada ANTES de renderizar os números.
  // Antes, atualizarTela() rodava primeiro e o painel ficava visível
  // (apenas desfocado) atrás do modal — bastava um print para ler tudo.
  (async function _iniciar() {
    const liberado = await _gateAcesso();
    if (liberado === false) return; // usuário saiu pelo "Voltar ao Início"

    _preencherResponsaveis();
    _renderSeletorEmpresa();
    _atualizarEstadoVazio();
    _renderSecoesCustom();
    _aplicarVisibilidade();
    _atualizarPreviewSaida();
    atualizarTela();
  })();

  // ── Propagação entre abas ──
  // Se outra aba lançar movimentação, criar empresa ou trocar a ativa, esta
  // recarrega do disco — exceto se houver edição em andamento aqui.
  window.addEventListener("storage", (e) => {
    if (e.key !== LS_KEY || !e.newValue) return;
    const status = document.getElementById("financeiroStatus");
    const editando = status && status.textContent.indexOf("não salvas") >= 0;
    if (editando) return;

    let novo = null;
    try { novo = JSON.parse(e.newValue); } catch (_) { return; }
    if (!novo || !novo.dados || !Array.isArray(novo.empresas)) return;

    const idExibida = _container.ativaId;
    _container.empresas = novo.empresas;
    _container.dados = novo.dados;
    _container.ativaId = novo.empresas.find((x) => x.id === idExibida) ? idExibida : novo.ativaId;
    _store = _storeAtivo();
    movimentacoes = _store.movimentacoes;
    _renderSeletorEmpresa();
    _atualizarEstadoVazio();
    _renderSecoesCustom();
    _aplicarVisibilidade();
    atualizarTela();
  });
});
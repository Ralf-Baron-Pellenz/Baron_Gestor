// ═══════════════════════════════════════════
//  Precificador — plataforma.js
//  v1.5 — Persistência de filtro/ordenação
// ═══════════════════════════════════════════

document.addEventListener("DOMContentLoaded", async () => {
  // Aguarda o IndexedDB carregar os produtos para o cache antes de renderizar
  if (typeof initStorage === "function") await initStorage();

  const platformId = getParam("p");

  if (!platformId || !getPlatformConfig(platformId)) {
    window.location.href = "index.html";
    return;
  }

  const cfg = getPlatformConfig(platformId);

  setDateHeader();

  buildSidebar(platformId);

  // Aplica o estado salvo do menu lateral (recolhido/expandido)
  (function _aplicarEstadoSidebar() {
    const colapsado = localStorage.getItem("precifiq_sidebar_colapsada") === "1";
    const sb = document.getElementById("sidebar");
    if (sb) sb.classList.toggle("sidebar-colapsada", colapsado);
    document.body.classList.toggle("sidebar-colapsada-body", colapsado);
  })();

  document.title = `Precificador — ${cfg.name}`;
  document.getElementById("platformBreadcrumb").textContent = cfg.name;
  document.getElementById("pageTitle").textContent = cfg.name;

  // ── Logo da plataforma no topo ──────────────
  const logoContainer =
    document.getElementById("platformLogoImg").parentElement;

  // Borda no container para delimitar a imagem em qualquer tema
  logoContainer.style.border = "1px solid var(--clr-border)";
  logoContainer.style.borderRadius = "10px";
  logoContainer.style.overflow = "hidden";

  logoContainer.innerHTML = `
    <img id="platformLogoImg"
         src="${getPlatformLogoSrc(platformId)}"
         alt="${cfg.name}"
         style="
           width: 100%;
           height: 100%;
           object-fit: cover;
           border-radius: 10px;
           background: transparent;
           padding: 0;
           display: block;
         ">
  `;

  const logoImg = document.getElementById("platformLogoImg");

  logoImg.onerror = function () {
    this.outerHTML = `
      <div style="
        width: 72px;
        height: 72px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        font-family: 'Sora', sans-serif;
        font-size: 20px;
        font-weight: 700;
        color: var(--clr-primary);
      ">
        ${cfg.name.slice(0, 2).toUpperCase()}
      </div>
    `;
  };

  // Criar novo produto — limpa session para não carregar produto antigo
  document.getElementById("btnNovoProduto").addEventListener("click", () => {
    sessionStorage.setItem("current_platform", platformId);
    sessionStorage.removeItem("current_product");
    sessionStorage.removeItem("current_product_id");
    sessionStorage.setItem("current_isnew", "1");
    window.location.href = `produto.html?p=${platformId}&new=1`;
  });

  // ── Criar Kit ─────────────────────────
  document.getElementById("btnCriarKit").addEventListener("click", () => {
    sessionStorage.setItem("current_platform", platformId);
    sessionStorage.removeItem("current_product");
    sessionStorage.removeItem("current_product_id");
    sessionStorage.setItem("current_isnew", "1");
    sessionStorage.setItem("current_is_kit", "1");
    window.location.href = `produto.html?p=${platformId}&new=1&kit=1`;
  });

  // ── Clonar em Massa (botão da barra de ações) ─────────────────────────
  // Antes era um item do menu de três pontos de cada produto. Agora é um botão
  // próprio na toolbar. Entra no modo de seleção com o carrinho vazio — o
  // usuário marca os produtos que quer clonar direto na lista. A lógica de
  // clonagem em si (modal, destinos, execução) permanece igual.
  // O botão do topo virou "Opções Em Massa": abre o menu, e é a opção
  // escolhida que decide o que a barra de seleção vai fazer. O modo de
  // seleção em si é o mesmo das três ações.
  let _acaoMassa = "clonar";

  // ══════════════════════════════════════════
  //  PERSISTÊNCIA E FILTROS (busca + tipo + ordenação)
  // ══════════════════════════════════════════
  const FILTER_KEY = `precifiq_filter_${platformId}`;
  // O filtro escolhido (tipos + ordenação) fica salvo e vira o padrão das
  // listas de produtos: abrir de novo — esta ou outra plataforma — mostra a
  // lista como ela foi deixada. A busca continua só desta aba e desta tela.
  const FILTRO_PADRAO_KEY = "precifiq_filtro_produtos";
  const TIPOS_FILTRO = ["simples", "kits", "compostos"];
  const ORDENS = ["name_asc", "name_desc", "price_desc", "price_asc", "recent", "oldest"];
  const searchInputEl = document.getElementById("searchInput");

  // Kits que casaram com a busca, por id de produto. Preenchido a cada
  // filtragem e lido na montagem da linha, para desenhar a hierarquia.
  let _kitsEncontrados = Object.create(null);

  // A plataforma aberta é o Mercado Livre? Decidido UMA vez, pela mesma
  // regra do cadastro (utils.js), e não por comparação de texto aqui —
  // duas regras fariam as telas discordarem sobre a mesma plataforma.
  const _ehML = (function () {
    if (typeof ehMercadoLivre !== "function") return false;
    let nome = "";
    try {
      const cfg = getPlatformConfig(platformId);
      nome = (cfg && cfg.name) || "";
    } catch (e) {}
    return ehMercadoLivre(platformId, nome);
  })();
  const sortSelectEl = document.getElementById("sortSelect");
  const btnClearSearch = document.getElementById("btnClearSearch");
  const filterChipsEl = document.getElementById("filterChips");

  // Tipos marcados no Filtrar. Vazio = "Todos". Mais de um = soma (um
  // produto aparece se for de QUALQUER um dos tipos marcados).
  let activeTypes = [];

  /** Escapa texto para inserção segura em HTML (usar em TODO innerHTML) */
  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Só os tipos conhecidos, sem repetir. */
  function _tiposValidos(lista) {
    if (!Array.isArray(lista)) return [];
    return TIPOS_FILTRO.filter((t) => lista.indexOf(t) >= 0);
  }

  /** Reflete os tipos marcados nos chips e no contador do botão Filtrar. */
  function _refletirChips() {
    if (filterChipsEl) {
      filterChipsEl.querySelectorAll(".filter-chip").forEach((chip) => {
        const tipo = chip.dataset.filter;
        const ativo = tipo === "all" ? activeTypes.length === 0 : activeTypes.indexOf(tipo) >= 0;
        chip.classList.toggle("active", ativo);
        chip.setAttribute("aria-pressed", ativo ? "true" : "false");
      });
    }
    // O botão Filtrar mostra quantos filtros estão valendo — com a lista
    // salva como padrão, a pessoa vê de cara que há um filtro ligado.
    const btn = document.getElementById("btnFiltrar");
    if (btn) {
      let badge = btn.querySelector(".filtro-contador");
      const n = activeTypes.length + (sortSelectEl.value && sortSelectEl.value !== "name_asc" ? 1 : 0);
      if (n > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "filtro-contador";
          btn.appendChild(badge);
        }
        badge.textContent = String(n);
        btn.title = n === 1 ? "1 filtro ativo" : n + " filtros ativos";
      } else {
        if (badge) badge.remove();
        btn.removeAttribute("title");
      }
    }
  }

  function _loadFilterState() {
    // O padrão salvo (tipos + ordenação), válido para todas as listas.
    let padrao = null;
    try { padrao = JSON.parse(localStorage.getItem(FILTRO_PADRAO_KEY)); } catch (e) { padrao = null; }
    // A sessão desta tela: a busca (e, de versões antigas, o tipo único).
    let sessao = null;
    try { sessao = JSON.parse(sessionStorage.getItem(FILTER_KEY)); } catch (e) { sessao = null; }

    if (sessao) searchInputEl.value = sessao.search || "";
    if (padrao && typeof padrao === "object") {
      activeTypes = _tiposValidos(padrao.tipos);
      sortSelectEl.value = ORDENS.indexOf(padrao.sort) >= 0 ? padrao.sort : "name_asc";
    } else if (sessao) {
      // Estado antigo (um tipo só, guardado só na sessão).
      activeTypes = _tiposValidos(sessao.type && sessao.type !== "all" ? [sessao.type] : []);
      sortSelectEl.value = ORDENS.indexOf(sessao.sort) >= 0 ? sessao.sort : "name_asc";
    }
    _refletirChips();
    _padraoGravado = _padraoAtual();
  }

  // O padrão (tipos + ordenação) só é gravado quando muda: redesenhar a
  // lista (a cada letra da busca) não regrava nada, e uma outra aba aberta
  // não passa por cima da escolha feita aqui.
  let _padraoGravado = "";
  function _padraoAtual() {
    return JSON.stringify({ tipos: activeTypes.slice(), sort: sortSelectEl.value });
  }

  function _saveFilterState() {
    try {
      sessionStorage.setItem(
        FILTER_KEY,
        JSON.stringify({
          search: searchInputEl.value,
          sort: sortSelectEl.value,
          types: activeTypes.slice(),
        }),
      );
    } catch (e) {}
    const padrao = _padraoAtual();
    if (padrao === _padraoGravado) return;
    try {
      localStorage.setItem(FILTRO_PADRAO_KEY, padrao);
      _padraoGravado = padrao;
    } catch (e) {}
  }

  _loadFilterState();

  // ── Render loop ────────────────────────────
  function render() {
    _saveFilterState();

    const products = getProducts(platformId);
    const count = products.length;

    document.getElementById("pageSubtitle").textContent =
      count === 0
        ? "Nenhum produto cadastrado"
        : count === 1
          ? "1 produto cadastrado"
          : `${count} produtos cadastrados`;

    const query = (searchInputEl.value || "").toLowerCase().trim();
    const sort = sortSelectEl.value;

    // Mostra/oculta o botão limpar
    if (btnClearSearch) {
      btnClearSearch.style.display = query ? "flex" : "none";
    }

    // Guarda, para cada produto, quais SKUs de KIT casaram com a busca.
    // É o que permite mostrar a hierarquia "produto principal → kit
    // pesquisado" sem duplicar o produto na lista.
    _kitsEncontrados = Object.create(null);

    let filtered = products.filter((p) => {
      // Filtro por texto
      if (query) {
        const match =
          (p.name || "").toLowerCase().includes(query) ||
          (p.sku || "").toLowerCase().includes(query) ||
          (p.prodId || "").toLowerCase().includes(query);

        // A busca também alcança os SKUs dos kits vinculados. Sem isto,
        // procurar pelo SKU de um kit não encontrava nada — o produto
        // existia, mas ficava invisível.
        const kitsCasados = (p.kits || []).filter((k) =>
          k && String(k.sku || "").toLowerCase().includes(query)
        );

        if (!match && !kitsCasados.length) return false;

        // Só os kits que casaram entram na hierarquia. Se o termo bateu no
        // produto principal (e não num kit), nada é listado embaixo — a
        // lista continua como sempre foi.
        if (kitsCasados.length) _kitsEncontrados[p.id] = kitsCasados;
      }
      // Filtro por tipo: com mais de um marcado, o produto aparece se for
      // de qualquer um deles.
      if (activeTypes.length) {
        const kitCount = (p.kits || []).length;
        const compCount = (p.componentes || []).length;
        const ehDoTipo = {
          simples: kitCount === 0 && compCount === 0,
          kits: kitCount > 0,
          compostos: compCount > 0,
        };
        if (!activeTypes.some((t) => ehDoTipo[t])) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      switch (sort) {
        case "name_asc":
          return (a.name || "").localeCompare(b.name || "");
        case "name_desc":
          return (b.name || "").localeCompare(a.name || "");
        case "price_desc":
          return (b.finalPrice || 0) - (a.finalPrice || 0);
        case "price_asc":
          return (a.finalPrice || 0) - (b.finalPrice || 0);
        case "recent":
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        case "oldest":
          return (a.createdAt || a.updatedAt || 0) - (b.createdAt || b.updatedAt || 0);
        default:
          return 0;
      }
    });

    const filterLabels = {
      simples: "simples",
      kits: "com kits",
      compostos: "compostos",
    };
    const rotulos = activeTypes.map((t) => filterLabels[t]).filter(Boolean);
    const suffix = rotulos.length
      ? " " + (rotulos.length === 1 ? rotulos[0] : rotulos.slice(0, -1).join(", ") + " ou " + rotulos[rotulos.length - 1])
      : "";

    const _rl = document.getElementById("resultsLabel");
    if (_rl) {
      _rl.textContent = query
        ? `${filtered.length} resultado${filtered.length !== 1 ? "s" : ""} para "${_esc(query)}"`
        : `Mostrando ${filtered.length} produto${filtered.length !== 1 ? "s" : ""}${suffix}`;
    }

    renderList(filtered);
  }

  // ── Renderiza lista ────────────────────────
  /**
   * Cabeçalho das colunas: Foto · Descrição · Sku · Preço.
   *
   * Fica FORA do #productList, logo antes dele. Se ficasse dentro, o
   * innerHTML = "" do renderList o apagaria a cada busca — e ele teria de
   * ser recriado toda vez, inclusive no estado vazio, onde não faz sentido.
   *
   * Usa a MESMA grade das linhas (.product-row), então as colunas ficam
   * alinhadas por construção, e não por medidas repetidas nos dois lugares.
   */
  function _atualizarCabecalhoLista(temProdutos) {
    const list = document.getElementById("productList");
    if (!list || !list.parentNode) return;

    let head = document.getElementById("productListHead");
    if (!head) {
      head = document.createElement("div");
      head.id = "productListHead";
      head.className = "product-list-head";
      // A célula vazia do início existe para o modo de seleção, em que a
      // linha ganha o checkbox como primeiro filho. Sem ela o cabeçalho
      // ficaria com um filho a menos e TODAS as colunas deslocariam uma
      // posição — "Foto" caindo sobre a descrição, e assim por diante.
      head.innerHTML =
        '<span class="plh-check" aria-hidden="true"></span>' +
        '<span class="plh-foto">Foto</span>' +
        '<span class="plh-desc">Descrição</span>' +
        '<span class="plh-sku">Sku</span>' +
        '<span class="plh-tipo">Tipo</span>' +
        '<span class="plh-preco">Preço</span>' +
        '<span class="plh-acoes" aria-hidden="true"></span>';
      list.parentNode.insertBefore(head, list);
    }
    // Sem produtos, o cabeçalho sozinho sobre o estado vazio fica estranho.
    head.style.display = temProdutos ? "" : "none";
    // Em modo de seleção as linhas ganham a coluna do checkbox; o
    // cabeçalho precisa da mesma coluna para não sair do lugar.
    head.classList.toggle("com-selecao", !!_modoSelecao);
    head.classList.toggle("com-ml", _ehML);
  }

  // ═══════════════════════════════════════════════════════════════
  //  PREÇO NA LISTA
  //
  //  Fora do Mercado Livre: um preço só, como sempre foi.
  //
  //  No Mercado Livre o produto tem DOIS preços de venda, porque a taxa
  //  do anúncio Premium é diferente da do Clássico. Mostrar só um deles
  //  seria mostrar o número errado metade das vezes.
  //
  //  Os preços NÃO estão salvos no produto — o que fica salvo são as
  //  TAXAS (mlTaxaPremium / mlTaxaClassico). Então a lista recalcula com
  //  a mesma função da tela de cadastro: é o que garante que os dois
  //  lugares mostrem o mesmo valor.
  // ═══════════════════════════════════════════════════════════════
  function _precoHtml(product) {
    const simples = product.finalPrice ? formatBRL(product.finalPrice) : "—";

    if (!_ehML) return simples;
    if (typeof calcularUnidade !== "function") {
      // Sem a calculadora carregada não dá para recalcular. Mostra o preço
      // normal em vez de sumir com a informação.
      return simples;
    }

    const tPrem = Number(product.mlTaxaPremium) || 0;
    const tClas = Number(product.mlTaxaClassico) || 0;
    // Sem taxas cadastradas os dois valores seriam idênticos: repetir o
    // mesmo número duas vezes só ocuparia espaço.
    if (!tPrem && !tClas) return simples;

    let prem, clas;
    try {
      const base = _inputsDoProduto(product);
      prem = calcularUnidade(Object.assign({}, base, { taxa: tPrem }));
      clas = calcularUnidade(Object.assign({}, base, { taxa: tClas }));
    } catch (e) {
      return simples;
    }

    // A faixa do Premium leva uma classe própria: é a que ganha cor, por
    // ser o anúncio que rende mais. Sem a marcação, o CSS não teria como
    // diferenciar as duas linhas.
    const linha = (rot, v, ehPremium) =>
      '<span class="prc-linha' + (ehPremium ? " prc-linha--premium" : "") + '">' +
        '<span class="prc-rot">' + rot + "</span>" +
        '<span class="prc-val">' + (v > 0 ? formatBRL(v) : "—") + "</span>" +
      "</span>";

    return '<span class="prc-ml">' +
      linha("Premium", prem && prem.precoVenda, true) +
      linha("Clássico", clas && clas.precoVenda, false) +
      "</span>";
  }

  /**
   * Monta os inputs de cálculo a partir do produto salvo.
   * Mesmos campos que o utils.js usa ao recalcular em massa — se um campo
   * faltar aqui, o preço da lista sai diferente do preço do cadastro.
   */
  function _inputsDoProduto(p) {
    const soma = (cat, tipo) =>
      Array.isArray(p.camposPersonalizados)
        ? p.camposPersonalizados
            .filter((c) => (c.categoria || "venda") === cat && (c.tipo || "RS") === tipo)
            .reduce((a, c) => a + (Number(c.valor) || 0), 0)
        : 0;
    const pctPorBase = (base) =>
      Array.isArray(p.camposPersonalizados)
        ? p.camposPersonalizados
            .filter((c) => (c.categoria || "venda") === "custo" && c.tipo === "PCT" &&
              (c.base || "custoTotal") === base)
            .map((c) => Number(c.valor) || 0)
        : [];

    return {
      custo: Number(p.custo) || 0,
      embalagem: Number(p.embalagem) || 0,
      etiqueta: Number(p.etiqueta) || 0,
      fretePago: Number(p.frete) || 0,
      ipiPct: Number(p.ipi) || 0,
      difalPct: Number(p.difal) || 0,
      stPct: Number(p.st) || 0,
      aliquotaPct: Number(p.aliquota) || 0,
      freteProduto: Number(p.freteProduto) || 0,
      taxaFixa: Number(p.taxaFixa) || 0,
      impostoNF: Number(p.impostoNF) || 0,
      taxa: Number(p.taxa) || 0,
      margem: Number(p.margem) || 0,
      margemTipo: p.margemTipo || "pct",
      extraCustoRS: soma("custo", "RS"),
      extraCustoPCT: 0,
      extraVendaRS: soma("venda", "RS"),
      extraVendaPCT: soma("venda", "PCT"),
      custoPctSobreCustoTotal: pctPorBase("custoTotal"),
      custoPctSobrePrecoCusto: pctPorBase("precoCusto"),
    };
  }

  function renderList(products) {
    const list = document.getElementById("productList");
    list.innerHTML = "";
    // A lista carrega a marca do modo de seleção: é ela que muda a grade
    // das linhas E do cabeçalho de uma vez só.
    list.classList.toggle("com-selecao", !!_modoSelecao);
    // Coluna de preço mais larga quando há dois valores por linha.
    list.classList.toggle("com-ml", _ehML);
    _atualizarCabecalhoLista(products.length > 0);

    if (products.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg></div>
          <div class="empty-state-title">Nenhum produto encontrado</div>
          <p class="empty-state-text">
            ${
              searchInputEl.value
                ? "Tente outros termos de busca."
                : `Clique em <strong>Criar Novo Produto</strong> para começar a precificar.`
            }
          </p>
          <button class="btn-primary" onclick="
            sessionStorage.setItem('current_platform','${platformId}');
            sessionStorage.removeItem('current_product');
            sessionStorage.removeItem('current_product_id');
            sessionStorage.setItem('current_isnew','1');
            window.location.href='produto.html?p=${platformId}&new=1'">
            + &nbsp;Criar Primeiro Produto
          </button>
          ${
            searchInputEl.value
              ? ""
              : `<button type="button" class="btn-secondary empty-state-planilha" data-importar-planilha>
            Adicionar pela Planilha
          </button>`
          }
        </div>`;
      return;
    }

    products.forEach((product, i) => {
      list.appendChild(buildProductRow(product, i));
    });
  }

  // ── Constrói linha de produto ──────────────
  // ══════════════════════════════════════════
  //  CLONAGEM EM MASSA
  // ══════════════════════════════════════════
  let _modoSelecao = false;
  const _selecionados = new Set();

  function _alternarSelecao(id, marcado) {
    if (marcado) _selecionados.add(id); else _selecionados.delete(id);
    const linha = document.querySelector('.product-row[data-pid="' + id + '"]');
    if (linha) linha.classList.toggle("selecionado", marcado);
    _atualizarBarraSelecao();
  }

  // Ids atualmente à vista (respeita busca e filtro): "selecionar todos" nunca
  // marca um produto que o usuário não está vendo.
  function _idsVisiveis() {
    return Array.prototype.map.call(
      document.querySelectorAll("#productList .product-row[data-pid]"),
      (el) => el.dataset.pid,
    );
  }

  function _atualizarBarraSelecao() {
    const conta = document.getElementById("selecaoConta");
    const todos = document.getElementById("selecaoTodos");
    const n = _selecionados.size;
    if (conta) conta.textContent = n === 1 ? "1 selecionado" : n + " selecionados";

    // Só o botão da ação escolhida aparece, e todos seguem a mesma
    // regra: habilitado quando há algo marcado.
    const botoes = {
      clonar: document.getElementById("btnClonarSelecionados"),
      duplicar: document.getElementById("btnDuplicarSelecionados"),
      excluir: document.getElementById("btnExcluirSelecionados"),
    };
    Object.keys(botoes).forEach(function (k) {
      const b = botoes[k];
      if (!b) return;
      b.style.display = k === _acaoMassa ? "" : "none";
      b.disabled = n === 0;
    });
    if (todos) {
      const visiveis = _idsVisiveis();
      const marcados = visiveis.filter((id) => _selecionados.has(id)).length;
      todos.checked = visiveis.length > 0 && marcados === visiveis.length;
      todos.indeterminate = marcados > 0 && marcados < visiveis.length;
    }
  }

  function _entrarModoSelecao(ligar, idInicial) {
    _modoSelecao = ligar;
    _selecionados.clear();
    if (ligar && idInicial) _selecionados.add(idInicial);
    const bar = document.getElementById("selecaoMassaBar");
    if (bar) bar.style.display = ligar ? "flex" : "none";
    render();
    _atualizarBarraSelecao();
  }

  function _ligarClonagemEmMassa() {
    const cancelar = document.getElementById("btnCancelarSelecao");
    if (cancelar) cancelar.addEventListener("click", () => _entrarModoSelecao(false));

    const todos = document.getElementById("selecaoTodos");
    if (todos) todos.addEventListener("change", () => {
      const visiveis = _idsVisiveis();
      if (todos.checked) visiveis.forEach((id) => _selecionados.add(id));
      else visiveis.forEach((id) => _selecionados.delete(id));
      document.querySelectorAll("#productList .product-row").forEach((linha) => {
        const marcado = _selecionados.has(linha.dataset.pid);
        linha.classList.toggle("selecionado", marcado);
        const inp = linha.querySelector(".product-row-check input");
        if (inp) inp.checked = marcado;
      });
      _atualizarBarraSelecao();
    });

    const clonar = document.getElementById("btnClonarSelecionados");
    if (clonar) clonar.addEventListener("click", () => {
      const produtos = _produtosSelecionados();
      if (!produtos.length) return;
      openModalClonarEmMassa(produtos);
    });

    const duplicar = document.getElementById("btnDuplicarSelecionados");
    if (duplicar) duplicar.addEventListener("click", async () => {
      if (duplicar.disabled) return;
      const produtos = _produtosSelecionados();
      if (!produtos.length) return;
      duplicar.disabled = true;
      let feitos = 0;
      for (const prod of produtos) {
        try {
          // A MESMA regra do "Duplicar" do menu de cada produto —
          // inclusive a cópia das imagens —, só que sem redirecionar.
          await _criarCopiaMesmaPlataforma(prod);
          feitos++;
        } catch (err) {
          console.error("Falha ao duplicar em massa:", prod && prod.sku, err);
        }
      }
      showToast(
        feitos === produtos.length
          ? feitos + " produto(s) duplicado(s)."
          : feitos + " de " + produtos.length + " duplicados — veja o console.",
        feitos ? "success" : "error",
      );
      _entrarModoSelecao(false);
    });

    const excluir = document.getElementById("btnExcluirSelecionados");
    if (excluir) excluir.addEventListener("click", () => {
      if (excluir.disabled) return;
      const produtos = _produtosSelecionados();
      if (!produtos.length) return;
      confirmDeleteEmMassa(produtos);
    });
  }

  /** Os produtos marcados, já lidos do banco. */
  function _produtosSelecionados() {
    const produtos = getProducts(platformId).filter((p) => _selecionados.has(p.id));
    if (!produtos.length) showToast("Nenhum produto selecionado.", "warning");
    return produtos;
  }

  /**
   * Kits compostos que usam algum dos produtos como componente — em
   * qualquer plataforma. Excluir esses produtos deixa os kits com o
   * custo errado, e isso precisa ser dito antes.
   */
  function _compostosAfetados(produtos) {
    const ids = produtos.map((p) => p.id);
    const skus = produtos.map((p) => (p.sku || "").trim().toUpperCase()).filter(Boolean);
    const achados = [];
    let plataformas = [];
    try { plataformas = getAllPlatformIds() || []; } catch (e) { plataformas = [platformId]; }
    plataformas.forEach((pid) => {
      (getProducts(pid) || []).forEach((p) => {
        if (!Array.isArray(p.componentes) || !p.componentes.length) return;
        if (ids.indexOf(p.id) >= 0) return;   // o próprio, que vai sumir
        const usa = p.componentes.some(
          (c) => ids.indexOf(c.prodId) >= 0 || skus.indexOf((c.sku || "").trim().toUpperCase()) >= 0,
        );
        if (usa) achados.push(p.name || p.sku || "(sem nome)");
      });
    });
    return achados;
  }

  /** Confirmação da exclusão em massa. */
  function confirmDeleteEmMassa(produtos) {
    const compostos = _compostosAfetados(produtos);
    const lista = produtos.slice(0, 12).map((p) => `<li>${_esc(p.name || p.sku || "(sem nome)")}</li>`).join("")
      + (produtos.length > 12
        ? `<li style="list-style:none;margin-left:-20px;color:var(--clr-text-3);">… e mais ${produtos.length - 12}</li>`
        : "");

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">Excluir ${produtos.length} produto(s)?</div>
        <ul style="margin:0 0 var(--sp-md);padding-left:20px;font-size:13px;color:var(--clr-text-2);max-height:180px;overflow-y:auto;">
          ${lista}
        </ul>
        ${compostos.length ? `
        <div style="margin-bottom:var(--sp-md);padding:11px 13px;border:1px solid rgba(224,162,61,.35);border-radius:10px;background:rgba(224,162,61,.08);font-size:12.5px;line-height:1.5;color:var(--clr-text-2);">
          <strong style="color:#E0A23D;">Atenção:</strong>
          ${compostos.length === 1
            ? `o kit composto <em>${_esc(compostos[0])}</em> usa`
            : `${compostos.length} kits compostos usam`}
          algum destes produtos como componente.
          Depois da exclusão, ${compostos.length === 1 ? "esse kit fica" : "esses kits ficam"}
          com o custo errado e ${compostos.length === 1 ? "precisará" : "precisarão"} ser revisto.
        </div>` : ""}
        <div class="modal-subtitle" style="margin-bottom: var(--sp-lg);">
          Esta ação não pode ser desfeita.
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="cancelDeleteMassa">Cancelar</button>
          <button class="btn-danger" style="padding:10px var(--sp-lg);font-size:14px;" id="confirmDeleteMassa">
            Sim, excluir
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector("#cancelDeleteMassa").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector("#confirmDeleteMassa").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;

      let feitos = 0;
      for (const prod of produtos) {
        try {
          // As imagens saem ANTES do produto: depois os ids se perdem.
          await _removerImagensDoProduto(prod);
        } catch (err) {
          console.error("Falha ao remover imagens do produto:", err);
        }
        try {
          deleteProduct(platformId, prod.id);
          feitos++;
        } catch (err) {
          console.error("Falha ao excluir:", prod && prod.sku, err);
        }
      }

      overlay.remove();
      showToast(
        feitos === produtos.length
          ? feitos + " produto(s) excluído(s)."
          : feitos + " de " + produtos.length + " excluídos — veja o console.",
        feitos ? "warning" : "error",
      );
      _entrarModoSelecao(false);
    });
  }

  function buildProductRow(product, index) {
    const row = document.createElement("div");
    row.className = "product-row";
    row.style.animationDelay = `${index * 0.04}s`;
    row.dataset.pid = product.id;
    if (_modoSelecao) {
      row.classList.add("selecionavel");
      if (_selecionados.has(product.id)) row.classList.add("selecionado");
    }

    const kitCount = (product.kits || []).length;
    const compCount = (product.componentes || []).length;
    const price = _precoHtml(product);

    // Todos os campos vindos do usuário passam por _esc: um nome com aspas
    // quebrava o atributo alt="..."; um com < renderizava HTML na lista.
    const imgHtml = product.image
      ? `<img src="${_esc(product.image)}" alt="${_esc(product.name)}" onerror="this.style.display='none'" style="width:100%; height:100%; object-fit:cover; display:block;" />`
      : `<span class="product-row-img-placeholder"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg></span>`;

    // O SKU saiu daqui: agora tem coluna própria, alinhada ao cabeçalho.
    // O meta guarda o que sobra (o ID), e some quando não há nada.
    const metaParts = [];
    if (product.prodId) metaParts.push(`ID: ${_esc(product.prodId)}`);

    // As etiquetas alimentam a coluna "Tipo". A classificação NÃO é nova:
    // usa exatamente o mesmo critério que os filtros desta tela já usam —
    // `componentes` para composto e `kits` para quem tem kit. Quando não há
    // nenhum dos dois, o produto é "Normal".
    //
    // Um produto pode ser composto E ter kits: nesse caso as duas etiquetas
    // aparecem, empilhadas na coluna, sem descartar informação.
    let tagsHtml = "";
    if (compCount > 0) {
      tagsHtml += `<span class="product-row-composto">Composto</span>`;
    }
    if (kitCount > 0) {
      tagsHtml += `<span class="product-row-kits">${kitCount} kit${kitCount > 1 ? "s" : ""}</span>`;
    }

    // Quando a busca casou com o SKU de um KIT, a linha mostra a relação:
    // o produto principal fica discreto em cima e o kit encontrado ganha
    // destaque embaixo, deixando claro a quem ele pertence.
    //
    //     AQUECEDOR KOMECO ...        ← principal, opaco
    //        └ SKU: TESTE2            ← o kit pesquisado
    //
    // Só os kits que casaram aparecem: listar todos poluiria a lista e
    // esconderia justamente o que a pessoa procurou.
    const kitsAchados = _kitsEncontrados[product.id] || [];
    let hierarquiaHtml = "";
    if (kitsAchados.length) {
      hierarquiaHtml =
        '<div class="product-row-kit-filhos">' +
        kitsAchados.map((k) => {
          const qtd = Number(k.qty) || 0;
          const preco = k.price ? formatBRL(k.price) : "";
          return '<div class="product-row-kit-filho">' +
            '<span class="product-row-kit-ramo" aria-hidden="true"></span>' +
            '<span class="product-row-kit-sku">' + _esc(k.sku || "sem SKU") + "</span>" +
            (qtd ? '<span class="product-row-kit-qtd">' + qtd + " un</span>" : "") +
            (preco ? '<span class="product-row-kit-preco">' + preco + "</span>" : "") +
            "</div>";
        }).join("") +
        "</div>";
    }

    // Uma coluna por informação, na mesma ordem do cabeçalho.
    // As etiquetas (Composto / N kits) entraram na coluna da Descrição:
    // como coluna própria elas ficariam vazias na maioria das linhas e
    // abririam um vão entre a descrição e o SKU.
    row.innerHTML = `
      <div class="product-row-img" style="border:1px solid var(--clr-border); overflow:hidden;">${imgHtml}</div>
      <div class="product-row-info${kitsAchados.length ? " tem-kit-achado" : ""}">
        <div class="product-row-name" title="${_esc(product.name || "Produto sem nome")}">${_esc(product.name || "Produto sem nome")}</div>
        ${metaParts.length ? `<div class="product-row-meta">${metaParts.join(" · ")}</div>` : ""}
        ${hierarquiaHtml}
      </div>
      <div class="product-row-sku">${product.sku ? _esc(product.sku) : '<span class="sem-sku">—</span>'}</div>
      <div class="product-row-tipo">${tagsHtml || '<span class="product-row-simples">Simples</span>'}</div>
      <div class="product-row-price">${price}</div>
      <div class="product-menu-wrap">
        <button class="product-menu-btn" title="Opções" aria-label="Opções">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2"></circle>
            <circle cx="12" cy="12" r="2"></circle>
            <circle cx="12" cy="19" r="2"></circle>
          </svg>
        </button>
        <div class="product-menu" style="display:none;">
          <button class="product-menu-item duplicate-btn" data-id="${product.id}">
            <span class="product-menu-ico">⎘</span> Duplicar
          </button>
          <button class="product-menu-item clone-btn" data-id="${product.id}">
            <span class="product-menu-ico">⧉</span> Clonar
          </button>
          <button class="product-menu-item danger delete-btn" data-id="${product.id}">
            <span class="product-menu-ico">✕</span> Excluir
          </button>
        </div>
      </div>
    `;

    if (_modoSelecao) {
      const marca = document.createElement("label");
      marca.className = "product-row-check";
      marca.innerHTML = '<input type="checkbox"' + (_selecionados.has(product.id) ? " checked" : "") + ">";
      marca.querySelector("input").addEventListener("change", (ev) => {
        ev.stopPropagation();
        _alternarSelecao(product.id, ev.target.checked);
      });
      marca.addEventListener("click", (ev) => ev.stopPropagation());
      row.insertBefore(marca, row.firstChild);
    }

    row.addEventListener("click", (e) => {
      // No modo de seleção a linha alterna a marcação em vez de abrir o produto.
      if (_modoSelecao) {
        const inp = row.querySelector(".product-row-check input");
        if (inp) { inp.checked = !inp.checked; _alternarSelecao(product.id, inp.checked); }
        return;
      }
      if (
        e.target.closest(".delete-btn") ||
        e.target.closest(".clone-btn") ||
        e.target.closest(".duplicate-btn") ||
        e.target.closest(".product-menu-btn")
      )
        return;
      sessionStorage.setItem("current_platform", platformId);
      sessionStorage.setItem("current_product", product.id);
      sessionStorage.setItem("current_product_id", product.id);
      sessionStorage.setItem("current_isnew", "0");
      window.location.href = `produto.html?p=${platformId}&id=${product.id}`;
    });

    // Menu de três pontinhos: abre/fecha
    const menuWrap = row.querySelector(".product-menu-wrap");
    const menuBtn = row.querySelector(".product-menu-btn");
    const menu = row.querySelector(".product-menu");
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const aberto = menu.style.display === "block";
      // Fecha outros menus abertos e reseta z-index das linhas
      document.querySelectorAll(".product-menu").forEach((m) => (m.style.display = "none"));
      document.querySelectorAll(".product-row").forEach((r) => (r.style.zIndex = ""));
      if (!aberto) {
        menu.style.display = "block";
        row.style.position = "relative";
        row.style.zIndex = "6000";
      } else {
        menu.style.display = "none";
      }
    });
    menu.addEventListener("click", (e) => e.stopPropagation());

    row.querySelector(".delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      menu.style.display = "none";
      confirmDelete(product);
    });

    row.querySelector(".clone-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      menu.style.display = "none";
      openModalClonar(product);
    });

    row.querySelector(".duplicate-btn").addEventListener("click", async (e) => {
      e.stopPropagation();
      menu.style.display = "none";
      const btn = e.currentTarget;
      // A duplicação copia imagens (assíncrono). Sem esta trava, um duplo
      // clique criaria dois produtos.
      if (btn.dataset.processando === "1") return;
      btn.dataset.processando = "1";
      try {
        await duplicarProdutoMesmaPlataforma(product);
      } catch (err) {
        console.error("Falha ao duplicar produto:", err);
        if (typeof PrecifiqErros !== "undefined") {
          PrecifiqErros.registrar("Falha ao duplicar produto", String(err));
        }
        showToast("Erro ao duplicar o produto.", "error");
      } finally {
        btn.dataset.processando = "0";
      }
    });

    return row;
  }

  // ── Modal Excluir ──────────────────────────
  /**
   * Remove as imagens de um produto do ImageStore.
   * Sem isso, excluir um produto deixava as imagens órfãs no IndexedDB
   * para sempre — acumulando espaço a cada exclusão.
   */
  async function _removerImagensDoProduto(product) {
    if (typeof ImageStore === "undefined") return;
    const ids = Array.isArray(product._imageIds) ? product._imageIds : [];
    for (const id of ids) {
      if (id && ImageStore.isImageId(id)) {
        try { await ImageStore.remove(id); } catch (e) { /* já removida */ }
      }
    }
  }

  function confirmDelete(product) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">Excluir produto?</div>
        <div class="modal-subtitle" style="margin-bottom: var(--sp-lg);">
          Tem certeza que deseja excluir
          <strong>${_esc(product.name || "este produto")}</strong>?
          Esta ação não pode ser desfeita.
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="cancelDelete">Cancelar</button>
          <button class="btn-danger" style="padding:10px var(--sp-lg);font-size:14px;" id="confirmDeleteBtn">
            Sim, excluir
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay
      .querySelector("#cancelDelete")
      .addEventListener("click", () => overlay.remove());

    overlay.querySelector("#confirmDeleteBtn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;

      // Apaga as imagens ANTES de remover o produto (depois perderíamos os ids)
      try {
        await _removerImagensDoProduto(product);
      } catch (err) {
        console.error("Falha ao remover imagens do produto:", err);
      }

      deleteProduct(platformId, product.id);
      overlay.remove();
      showToast(`"${product.name || "Produto"}" excluído.`, "warning");
      render();
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // ── Modal Clonar ───────────────────────────
  function openModalClonar(product) {
    // Não oferece como destino as plataformas que foram excluídas na tela inicial
    let _apagadas = [];
    try {
      _apagadas = JSON.parse(localStorage.getItem("precifiq_deleted_platforms")) || [];
      if (!Array.isArray(_apagadas)) _apagadas = [];
    } catch (e) {}
    const destinos = PLATFORMS_CONFIG.filter(
      (p) => p.id !== platformId && !_apagadas.includes(p.id)
    );
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const opcoesHtml = destinos
      .map(
        (p) => `
      <button class="clone-destino-btn" data-destino="${p.id}">
        <span class="clone-destino-icon">
          <img src="${getPlatformLogoSrc(p.id)}" alt="${_esc(p.name)}"
            onerror="this.style.display='none';this.nextElementSibling.style.display='inline'"/>
          <span style="display:none;font-size:10px;font-weight:700;color:var(--clr-primary);">
            ${_esc(String(p.name || "").slice(0, 2).toUpperCase())}
          </span>
        </span>
        <span class="clone-destino-name">${_esc(p.name)}</span>
        <span class="clone-destino-arrow">→</span>
      </button>`,
      )
      .join("");

    overlay.innerHTML = `
      <div class="modal" style="width:480px;max-width:94vw;">
        <div class="modal-title">Clonar Produto</div>
        <div class="modal-subtitle" style="margin-bottom:var(--sp-lg);">
          Selecione a plataforma de destino para
          <strong>${_esc(product.name || "este produto")}</strong>.
          Todos os dados e kits serão copiados.
        </div>
        <div class="clone-destinos-grid">${opcoesHtml}</div>
        <div class="modal-actions" style="margin-top:var(--sp-lg);">
          <button class="btn-secondary" id="cancelClonar">Cancelar</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay
      .querySelector("#cancelClonar")
      .addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    overlay.querySelectorAll(".clone-destino-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const destino = btn.dataset.destino;
        if (!destino) {
          showToast("Plataforma de destino inválida.", "error");
          return;
        }
        // Trava contra duplo clique: a clonagem copia imagens (assíncrono)
        if (btn.dataset.processando === "1") return;
        btn.dataset.processando = "1";
        const textoOriginal = btn.textContent;
        btn.textContent = "Clonando...";

        try {
          await clonarProduto(product, destino);
          overlay.remove();
        } catch (err) {
          console.error("Falha ao clonar produto:", err);
          if (typeof PrecifiqErros !== "undefined") {
            PrecifiqErros.registrar("Falha ao clonar produto", String(err));
          }
          showToast("Erro ao clonar o produto.", "error");
          btn.dataset.processando = "0";
          btn.textContent = textoOriginal;
        }
      });
    });
  }

  // ── Modal Clonar em massa ──────────────────
  function openModalClonarEmMassa(produtos) {
    let _apagadas = [];
    try {
      _apagadas = JSON.parse(localStorage.getItem("precifiq_deleted_platforms")) || [];
      if (!Array.isArray(_apagadas)) _apagadas = [];
    } catch (e) {}
    const destinos = PLATFORMS_CONFIG.filter(
      (p) => p.id !== platformId && !_apagadas.includes(p.id),
    );

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const opcoesHtml = destinos.length
      ? destinos.map((p) => `
          <button class="clone-destino-btn" data-destino="${p.id}">
            <span class="clone-destino-icon">
              <img src="${getPlatformLogoSrc(p.id)}" alt="${_esc(p.name)}"
                onerror="this.style.display='none';this.nextElementSibling.style.display='inline'"/>
              <span style="display:none;font-size:10px;font-weight:700;color:var(--clr-primary);">
                ${_esc(String(p.name || "").slice(0, 2).toUpperCase())}
              </span>
            </span>
            <span class="clone-destino-name">${_esc(p.name)}</span>
            <span class="clone-destino-arrow">→</span>
          </button>`).join("")
      : `<p class="text-muted" style="font-size:13px;">Nenhuma outra plataforma cadastrada para receber os clones.</p>`;

    const nomes = produtos.slice(0, 5).map((p) => _esc(p.name || "sem nome")).join(", ");
    const resto = produtos.length > 5 ? ` e mais ${produtos.length - 5}` : "";

    overlay.innerHTML = `
      <div class="modal" style="width:520px;max-width:94vw;">
        <div class="modal-title">Clonar ${produtos.length} produto${produtos.length > 1 ? "s" : ""}</div>
        <div class="modal-subtitle" style="margin-bottom:var(--sp-lg);">
          Escolha a plataforma de destino.<br>
          <span style="font-size:12.5px;">${nomes}${resto}.</span>
        </div>
        <div class="clone-destinos-grid">${opcoesHtml}</div>
        <div id="cloneMassaProgresso" style="display:none; margin-top:var(--sp-md); font-size:13px; color:var(--clr-text-2);"></div>
        <div class="modal-actions" style="margin-top:var(--sp-lg);">
          <button class="btn-secondary" id="cancelClonarMassa">Cancelar</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    const fechar = () => overlay.remove();
    overlay.querySelector("#cancelClonarMassa").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });

    overlay.querySelectorAll(".clone-destino-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const destino = btn.dataset.destino;
        if (!destino) { showToast("Plataforma de destino inválida.", "error"); return; }
        if (overlay.dataset.processando === "1") return;
        overlay.dataset.processando = "1";

        const prog = overlay.querySelector("#cloneMassaProgresso");
        const cancelarBtn = overlay.querySelector("#cancelClonarMassa");
        if (cancelarBtn) cancelarBtn.disabled = true;
        overlay.querySelectorAll(".clone-destino-btn").forEach((b) => (b.disabled = true));
        if (prog) prog.style.display = "block";

        // Clona um por vez: cada clone copia imagens (assíncrono) e grava no
        // disco. Em paralelo, as gravações se atropelariam.
        let ok = 0;
        const falhas = [];
        for (let i = 0; i < produtos.length; i++) {
          if (prog) prog.textContent = `Clonando ${i + 1} de ${produtos.length}…`;
          try {
            await clonarProduto(produtos[i], destino, true);
            ok++;
          } catch (err) {
            falhas.push(produtos[i].name || produtos[i].sku || "sem nome");
            if (typeof PrecifiqErros !== "undefined") {
              PrecifiqErros.registrar("Falha ao clonar em massa", String(err));
            }
          }
        }

        fechar();
        _entrarModoSelecao(false);

        if (falhas.length === 0) {
          showToast(`${ok} produto${ok > 1 ? "s" : ""} clonado${ok > 1 ? "s" : ""} com sucesso!`, "success");
        } else if (ok > 0) {
          showToast(`${ok} clonado(s), ${falhas.length} com erro: ${falhas.slice(0, 3).join(", ")}.`, "warning", 6000);
        } else {
          showToast("Não foi possível clonar os produtos.", "error");
        }
      });
    });
  }

  // ── Executa clonagem — deep copy completo ──
  /**
   * Copia as imagens de um produto no ImageStore, gerando NOVOS ids.
   *
   * Sem isso, o clone apontaria para os mesmos ids do original. Ao trocar a
   * imagem do produto original, produto.js remove os ids antigos do banco —
   * e o clone ficaria sem imagem, apontando para um id inexistente.
   *
   * @returns {Promise<string[]>} novos ids (ou os originais, se falhar)
   */
  async function _duplicarImagens(idsOriginais) {
    if (!Array.isArray(idsOriginais) || idsOriginais.length === 0) return [];
    if (typeof ImageStore === "undefined") return idsOriginais.slice();

    const novos = [];
    for (const id of idsOriginais) {
      if (!id || !ImageStore.isImageId(id)) continue;
      try {
        const base64 = await ImageStore.get(id);
        if (base64) {
          const novoId = await ImageStore.put(base64);
          novos.push(novoId);
        }
      } catch (e) {
        console.error("Falha ao duplicar imagem", id, e);
      }
    }
    return novos;
  }

  /**
   * @param {boolean} [silencioso] Na clonagem em massa não mostra o toast de
   * cada produto nem redireciona: quem chama cuida do resumo no final.
   * Sem isso, o primeiro clone já navegaria para a outra plataforma e os
   * demais nunca aconteceriam.
   */
  async function clonarProduto(product, destinoId, silencioso) {
    if (!destinoId) {
      showToast("Destino não informado.", "error");
      return;
    }

    const clone = JSON.parse(JSON.stringify(product));

    clone.id = generateId();
    clone.platformId = destinoId;
    clone.createdAt = Date.now();
    clone.updatedAt = Date.now();

    clone.kits = (clone.kits || []).map((kit) => ({
      ...kit,
      id: generateId(),
    }));

    // Campos personalizados também precisam de ids próprios
    // (o duplicarProdutoMesmaPlataforma já fazia isso; aqui faltava)
    if (Array.isArray(clone.camposPersonalizados)) {
      clone.camposPersonalizados = clone.camposPersonalizados.map((campo) => ({
        ...campo,
        id: generateId(),
      }));
    }

    // Imagens próprias: nunca compartilhar ids do ImageStore entre produtos
    const novosIds = await _duplicarImagens(product._imageIds || product.images);
    clone._imageIds = novosIds;
    clone.images = novosIds;
    // A miniatura (base64) pode ser copiada direto — é só cache de exibição
    clone.image = product.image || "";

    upsertProduct(destinoId, clone);

    if (silencioso) return true;

    const destinoCfg = getPlatformConfig(destinoId);
    const nomeDestino = destinoCfg ? destinoCfg.name : destinoId;
    showToast(
      `Clonado para ${nomeDestino} com ${clone.kits.length} kit(s)!`,
      "success",
    );

    setTimeout(() => {
      window.location.href = `plataforma.html?p=${destinoId}`;
    }, 1400);
  }

  /**
   * Cria a cópia do produto na mesma plataforma e GRAVA — sem navegar.
   *
   * A parte que redireciona ficou de fora de propósito: ela serve ao
   * "Duplicar" de um produto só, do menu da linha. Na duplicação em
   * massa, redirecionar no primeiro item abandonaria o resto.
   *
   * Assim as duas rotas partem da MESMA regra de cópia (nome, SKU,
   * ids novos dos kits e campos, imagens duplicadas).
   */
  async function _criarCopiaMesmaPlataforma(product) {
    const clone = JSON.parse(JSON.stringify(product));

    clone.id = generateId();
    clone.name = `Cópia de ${product.name || "Produto"}`;
    clone.sku = product.sku ? `${product.sku}-copia` : "";
    clone.createdAt = Date.now();
    clone.updatedAt = Date.now();

    if (clone.kits) {
      clone.kits = clone.kits.map((kit) => ({ ...kit, id: generateId() }));
    }
    if (clone.camposPersonalizados) {
      clone.camposPersonalizados = clone.camposPersonalizados.map((campo) => ({
        ...campo,
        id: generateId(),
      }));
    }

    // Imagens próprias (ver comentário em _duplicarImagens)
    const novosIds = await _duplicarImagens(product._imageIds || product.images);
    clone._imageIds = novosIds;
    clone.images = novosIds;
    clone.image = product.image || "";

    upsertProduct(platformId, clone);
    return clone;
  }

  /** Duplicar UM produto, pelo menu da linha: copia e abre a cópia. */
  async function duplicarProdutoMesmaPlataforma(product) {
    const clone = await _criarCopiaMesmaPlataforma(product);

    sessionStorage.setItem("current_product", clone.id);
    sessionStorage.setItem("current_product_id", clone.id);
    sessionStorage.setItem("current_isnew", "0");

    showToast(`Produto duplicado! Redirecionando...`, "success");
    window.location.href = `produto.html?p=${platformId}&id=${clone.id}`;
  }

  // ── Busca e ordenação ──────────────────────
  let searchTimeout;
  searchInputEl.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(render, 200);
  });
  sortSelectEl.addEventListener("change", render);

  // Botão limpar busca
  if (btnClearSearch) {
    btnClearSearch.addEventListener("click", () => {
      searchInputEl.value = "";
      searchInputEl.focus();
      render();
    });
  }

  // Chips de filtro por tipo: dá para marcar mais de um (Simples, Com Kits,
  // Compostos). "Todos" desmarca os outros; desmarcar o último volta a
  // "Todos". O menu fica aberto para combinar com a ordenação.
  if (filterChipsEl) {
    filterChipsEl.querySelectorAll(".filter-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const tipo = chip.dataset.filter;
        if (tipo === "all") {
          activeTypes = [];
        } else if (activeTypes.indexOf(tipo) >= 0) {
          activeTypes = activeTypes.filter((t) => t !== tipo);
        } else {
          activeTypes = _tiposValidos(activeTypes.concat(tipo));
        }
        _refletirChips();
        render();
      });
    });
  }

  // ── Dropdowns Filtrar / Ordenar ────────────
  function _setupDropdown(btnId, menuId) {
    const btn = document.getElementById(btnId);
    const menu = document.getElementById(menuId);
    if (!btn || !menu) return;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const aberto = menu.style.display === "block";
      // Fecha todos os outros dropdowns antes de abrir
      document.querySelectorAll(".dropdown-menu").forEach((m) => (m.style.display = "none"));
      menu.style.display = aberto ? "none" : "block";
    });

    // Não fecha ao clicar dentro do menu
    menu.addEventListener("click", (e) => e.stopPropagation());
  }

  _setupDropdown("btnFiltrar", "filtrarMenu");
  _setupDropdown("btnClonarMassaTop", "massaMenu");

  // Cada opção escolhe a ação e entra no modo de seleção — o mesmo
  // modo para as três.
  document.querySelectorAll("#massaOptions [data-massa]").forEach((opt) => {
    opt.addEventListener("click", () => {
      _acaoMassa = opt.dataset.massa;
      const menu = document.getElementById("massaMenu");
      if (menu) menu.style.display = "none";
      _entrarModoSelecao(true);
    });
  });
  // O antigo botão "Ordenar" deixou de existir: suas opções agora vivem dentro
  // do menu do "Filtrar", abaixo de uma linha divisória.

  // Fecha os dropdowns ao clicar fora
  document.addEventListener("click", () => {
    document.querySelectorAll(".dropdown-menu").forEach((m) => (m.style.display = "none"));
    document.querySelectorAll(".product-menu").forEach((m) => (m.style.display = "none"));
  });

  // Marca a opção de ordenação ativa visualmente
  function _marcarOrdenacaoAtiva() {
    document.querySelectorAll(".ordenar-option[data-sort]").forEach((opt) => {
      opt.classList.toggle("active", opt.dataset.sort === sortSelectEl.value);
    });
  }

  // Botões de ordenação → atualizam o select oculto e re-renderizam.
  // Como a ordenação agora vive dentro do menu do Filtrar, fechamos esse menu.
  document.querySelectorAll(".ordenar-option[data-sort]").forEach((opt) => {
    opt.addEventListener("click", () => {
      sortSelectEl.value = opt.dataset.sort;
      _marcarOrdenacaoAtiva();
      _refletirChips();
      const filtrarMenu = document.getElementById("filtrarMenu");
      if (filtrarMenu) filtrarMenu.style.display = "none";
      render();
    });
  });

  // Limpar: volta ao padrão de fábrica (todos os tipos, Nome A→Z).
  const btnLimparFiltros = document.getElementById("btnLimparFiltros");
  if (btnLimparFiltros) {
    btnLimparFiltros.addEventListener("click", () => {
      activeTypes = [];
      sortSelectEl.value = "name_asc";
      _marcarOrdenacaoAtiva();
      _refletirChips();
      render();
    });
  }
  _marcarOrdenacaoAtiva();
  _ligarClonagemEmMassa();

  // Gerenciar Imagens (JS/gerenciador-imagens.js): uma imagem excluída sai
  // dos produtos — a lista se redesenha para a miniatura acompanhar.
  document.addEventListener("bapell:imagens-alteradas", () => render());

  // Adicionar pela Planilha (JS/importar-produtos.js): os produtos novos
  // aparecem na lista assim que são gravados.
  document.addEventListener("bapell:produtos-importados", () => render());

  render();
});

// ═══════════════════════════════════════════
//  Bapell Gestor Pro — acoes-massa.js
//  v3.0 — Seleção dinâmica de plataformas
// ═══════════════════════════════════════════

document.addEventListener("DOMContentLoaded", async () => {
  // ── Máscara numérica ──────────────────────────────────────────────
  // Formata o valor conforme o usuário digita, pelos centavos:
  // 1 → 0,01 · 12 → 0,12 · 1265 → 12,65 · 126500 → 1.265,00.
  // A função vive no utils.js, compartilhada com as demais telas.
  // Alcança apenas .money-input e .percent-input: campos de quantidade,
  // CEP, CPF/CNPJ e telefone ficam de fora de propósito.
  if (typeof ativarMascarasNumericas === "function") ativarMascarasNumericas();

  if (typeof initStorage === "function") await initStorage();

  setDateHeader();

  // Aplica o estado salvo do menu lateral (colapsado ou aberto)
  (function _aplicarEstadoSidebar() {
    const colapsado = localStorage.getItem("precifiq_sidebar_colapsada") === "1";
    const sb = document.getElementById("sidebar");
    if (sb) sb.classList.toggle("sidebar-colapsada", colapsado);
    document.body.classList.toggle("sidebar-colapsada-body", colapsado);
  })();

  const skuInput       = document.getElementById("skuInput");
  const btnAplicar     = document.getElementById("btnAplicar");
  const resultadoBox   = document.getElementById("resultadoBox");
  const skuPreview     = document.getElementById("skuPreview");
  const chkSelectAll   = document.getElementById("chkSelectAll");
  const platformCont   = document.getElementById("platformSelectionContainer");

  // Se algum elemento essencial não existir, aborta com aviso claro
  // (evita "botão que não faz nada" no app empacotado)
  if (!skuInput || !btnAplicar || !resultadoBox || !skuPreview || !chkSelectAll || !platformCont) {
    console.error("acoes-massa: elementos essenciais não encontrados no HTML.");
    if (typeof PrecifiqErros !== "undefined") {
      PrecifiqErros.registrar("acoes-massa: HTML incompleto", "Elemento essencial ausente");
    }
    if (typeof showToast === "function") {
      showToast("Erro ao carregar a tela. Reinicie o aplicativo.", "error");
    }
    return;
  }

  // ══════════════════════════════════════════
    // TOGGLE R$ / % DO CAMPO MARGEM
    // O campo espelha o tipo de margem do produto: se la esta em %, entra %;
    // se esta em R$, entra R$. O usuario tambem pode trocar aqui, e o tipo
    // escolhido e gravado no produto ao aplicar.
    let _massMargemTipo = "pct";
    const _btnMargemPct = document.getElementById("btnMassMargemPct");
    const _btnMargemFixed = document.getElementById("btnMassMargemFixed");
    const _valMargemEl = document.getElementById("valMargem");
    const _margemSuffix = document.getElementById("valMargemSuffix");
    const _margemPrefix = document.getElementById("valMargemPrefix");

    function _aplicarMargemTipoMassa(tipo) {
      _massMargemTipo = tipo === "fixed" ? "fixed" : "pct";
      if (_btnMargemPct) _btnMargemPct.classList.toggle("active", _massMargemTipo === "pct");
      if (_btnMargemFixed) _btnMargemFixed.classList.toggle("active", _massMargemTipo === "fixed");
      // Mostra o R$ (prefixo, à esquerda) OU o % (sufixo, à direita)
      if (_margemSuffix) _margemSuffix.hidden = _massMargemTipo !== "pct";
      if (_margemPrefix) _margemPrefix.hidden = _massMargemTipo !== "fixed";
      // Alterna a classe do wrapper para o CSS dar o padding certo:
      // - % → input-addon-wrap-suffix (padding à direita, para o %)
      // - R$ → só input-addon-wrap (padding à esquerda, para o prefixo R$)
      const _wrap = _valMargemEl ? _valMargemEl.closest(".input-addon-wrap") : null;
      if (_wrap) {
        _wrap.classList.toggle("input-addon-wrap-suffix", _massMargemTipo === "pct");
      }
      if (_valMargemEl) {
        _valMargemEl.classList.remove("money-input", "percent-input");
        _valMargemEl.classList.add(_massMargemTipo === "fixed" ? "money-input" : "percent-input");
      }
    }

    if (_btnMargemPct) _btnMargemPct.addEventListener("click", () => _aplicarMargemTipoMassa("pct"));
    if (_btnMargemFixed) _btnMargemFixed.addEventListener("click", () => _aplicarMargemTipoMassa("fixed"));
    _aplicarMargemTipoMassa("pct");

  //  LISTA DINÂMICA DE PLATAFORMAS
  // ══════════════════════════════════════════

  function _buildPlatformList() {
    platformCont.innerHTML = "";

    // Respeita as plataformas ocultas definidas na tela inicial
    let hiddenPlatforms = [];
    try {
      hiddenPlatforms = JSON.parse(localStorage.getItem("precifiq_hidden_platforms")) || [];
      if (!Array.isArray(hiddenPlatforms)) hiddenPlatforms = [];
    } catch (e) {
      hiddenPlatforms = [];
    }

    let allIds = [];
    try {
      allIds = (getAllPlatformIds() || []).filter((id) => !hiddenPlatforms.includes(id));
    } catch (e) {
      console.error("Falha ao listar plataformas:", e);
    }

    if (allIds.length === 0) {
      platformCont.innerHTML =
        '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--clr-text-3); font-size:13px;">' +
        "Nenhuma plataforma disponível. Verifique se há plataformas ocultas na tela inicial." +
        "</div>";
      return;
    }

    allIds.forEach((platformId) => {
      const cfg  = getPlatformConfig(platformId);
      const name = cfg ? cfg.name : platformId;
      const logoSrc = getPlatformLogoSrc(platformId);

      const item = document.createElement("label");
      item.className = "platform-select-item";
      item.title = name;
      item.innerHTML = `
        <input type="checkbox" class="platform-chk" value="${_escapeHtml(platformId)}" checked />
        <div class="platform-select-inner">
          <div class="platform-select-logo">
            <img src="${logoSrc}" alt="${_escapeHtml(name)}"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <span class="platform-select-fallback" style="display:none">
              ${_escapeHtml(name.substring(0, 2).toUpperCase())}
            </span>
          </div>
          <span class="platform-select-name">${_escapeHtml(name)}</span>
        </div>
      `;
      platformCont.appendChild(item);
    });

    // Sincroniza o "Selecionar Todas" — liga o listener UMA única vez
    if (!platformCont.dataset.boundChange) {
      platformCont.dataset.boundChange = "1";
      platformCont.addEventListener("change", () => {
        const all  = _getAllPlatformCheckboxes();
        const checked = all.filter((c) => c.checked);
        chkSelectAll.checked       = all.length > 0 && checked.length === all.length;
        chkSelectAll.indeterminate = checked.length > 0 && checked.length < all.length;
      });
    }
  }

  function _getAllPlatformCheckboxes() {
    return Array.from(platformCont.querySelectorAll("input.platform-chk"));
  }

  /**
   * A linha da Taxa mostra Premium e Clássico quando o Mercado Livre
   * está entre os destinos, e o campo único quando há alguma plataforma
   * que não é ML. Com os dois tipos selecionados, aparecem os três.
   */
  function _ajustarCamposDeTaxa() {
    const ids = _getSelectedPlatformIds();
    const temML = ids.some(_ehML);
    const temOutras = ids.some(function (pid) { return !_ehML(pid); });
    const ml = document.getElementById("taxaMlWrap");
    const comum = document.getElementById("taxaComumWrap");
    if (ml) ml.style.display = temML ? "" : "none";
    if (comum) comum.style.display = temOutras ? "" : "none";
  }

  function _getSelectedPlatformIds() {
    return _getAllPlatformCheckboxes()
      .filter((c) => c.checked)
      .map((c) => c.value);
  }

  // Botão "Selecionar Todas"
  chkSelectAll.addEventListener("change", () => {
    _getAllPlatformCheckboxes().forEach((c) => (c.checked = chkSelectAll.checked));
    _ajustarCamposDeTaxa();
  });

  _buildPlatformList(); // renderiza na inicialização

  // Cada plataforma marcada ou desmarcada pode mudar quais campos de taxa
  // fazem sentido. O listener é ligado DEPOIS da lista existir.
  _getAllPlatformCheckboxes().forEach(function (c) {
    c.addEventListener("change", _ajustarCamposDeTaxa);
  });
  _ajustarCamposDeTaxa();

  // ══════════════════════════════════════════
  //  VISIBILIDADE DOS CAMPOS (checkboxes de campo)
  // ══════════════════════════════════════════

  const fieldControls = [
    { checkboxId: "chkCusto",        wrapperId: "groupCusto"        },
    { checkboxId: "chkEtiqueta",     wrapperId: "groupEtiqueta"     },
    { checkboxId: "chkEmbalagem",    wrapperId: "groupEmbalagem"    },
    { checkboxId: "chkFrete",        wrapperId: "groupFrete"        },
    // Impostos sobre o custo — mesmo mecanismo dos demais campos percentuais.
    { checkboxId: "chkIpi",          wrapperId: "groupIpi"          },
    { checkboxId: "chkDifal",        wrapperId: "groupDifal"        },
    { checkboxId: "chkSt",           wrapperId: "groupSt"           },
    { checkboxId: "chkAliquota",     wrapperId: "groupAliquota"     },
    { checkboxId: "chkImposto",      wrapperId: "groupImposto"      },
    { checkboxId: "chkTaxa",         wrapperId: "groupTaxa"         },
    { checkboxId: "chkTaxaFixa",     wrapperId: "groupTaxaFixa"     },
    { checkboxId: "chkFreteProduto", wrapperId: "groupFreteProduto" },
    { checkboxId: "chkMargem",       wrapperId: "groupMargem"       },
  ];

  fieldControls.forEach(({ checkboxId, wrapperId }) => {
    const checkbox = document.getElementById(checkboxId);
    const wrapper  = document.getElementById(wrapperId);
    if (checkbox && wrapper) {
      wrapper.classList.remove("show");
      checkbox.addEventListener("change", () => {
        wrapper.classList.toggle("show", checkbox.checked);
      });
    }
  });

  // ══════════════════════════════════════════
  //  PREVIEW DO SKU (busca em tempo real)
  // ══════════════════════════════════════════

  let _previewTimeout;

  // ── Produto composto (kit) ────────────────────────────────────
  // Um produto é COMPOSTO quando tem componentes: o custo dele não é digitado,
  // é a soma (custoUnitario × qty) dos componentes. Deixar alterar o custo em
  // massa gravaria um valor solto, que o próximo recálculo desfaz — e no meio
  // tempo o preço e a margem saem errados. Por isso o campo fica bloqueado.
  function _ehComposto(prod) {
    return !!(prod && Array.isArray(prod.componentes) && prod.componentes.length > 0);
  }

  // Bloqueia (ou libera) o campo "Preço de Custo" na tela.
  function _travarCampoCusto(travar) {
    const chk    = document.getElementById("chkCusto");
    const inp    = document.getElementById("valCusto");
    const grupo  = document.getElementById("groupCusto");
    const label  = chk ? chk.closest(".mass-checkbox-label") : null;
    const motivo = "Produto composto: o custo vem dos componentes.";

    if (travar) {
      if (chk) { chk.checked = false; chk.disabled = true; }
      if (inp) { inp.value = ""; inp.disabled = true; }
      if (grupo) grupo.classList.remove("show");
      if (label) {
        label.style.opacity = "0.5";
        label.style.cursor = "not-allowed";
        label.title = motivo;
      }
    } else {
      if (chk) chk.disabled = false;
      if (inp) inp.disabled = false;
      if (label) {
        label.style.opacity = "";
        label.style.cursor = "";
        label.title = "";
      }
    }
  }

  // Aviso explicando o bloqueio, exibido dentro do preview do SKU.
  function _avisoCompostoHtml() {
    return `
      <div style="
        margin-top:10px; display:flex; align-items:flex-start; gap:8px;
        background: var(--clr-warning-lt);
        border: 1px solid var(--clr-warning);
        border-radius: 8px;
        padding: 10px 12px;
      ">
        <span style="display:inline-flex; color:var(--clr-warning); flex-shrink:0; margin-top:1px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></span>
        <span style="font-size:12.5px; color:var(--clr-text); line-height:1.45;">
          <strong>Produto composto (kit).</strong> O preço de custo é calculado a partir dos componentes,
          por isso o campo <strong>Preço de Custo</strong> está bloqueado.
          Para mudar o custo, altere o custo dos componentes — o kit recalcula sozinho.
        </span>
      </div>
    `;
  }

  function _renderSkuPreview(sku) {
    const term = (sku || "").trim();

    if (!term) {
      skuPreview.style.display = "none";
      skuPreview.innerHTML = "";
      _travarCampoCusto(false);
      return;
    }

    const results = findProductsBySku(term);

    if (results.length === 0) {
      _travarCampoCusto(false);
      skuPreview.style.display = "block";
      skuPreview.innerHTML = `
        <div style="
          display:flex; align-items:center; gap:10px;
          background: var(--clr-danger-lt);
          border: 1px solid var(--clr-danger);
          border-radius: var(--r-md);
          padding: 12px 16px;
        ">
          <span style="display:inline-flex; color:var(--clr-danger);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></span>
          <span style="font-size:13px; color:var(--clr-text);">
            Nenhum produto encontrado com o SKU <strong>${_escapeHtml(term)}</strong>.
          </span>
        </div>
      `;
      return;
    }

    const first       = results[0].product;

    // Se o SKU for um produto composto em QUALQUER plataforma encontrada,
    // bloqueia o campo de custo (a aplicação em massa atinge todas elas).
    const temComposto = results.some((r) => _ehComposto(r.product));
    _travarCampoCusto(temComposto);

    // Espelha a margem do produto no campo: mesmo valor e mesmo tipo (R$ ou %).
    // Assim o usuario ve como esta hoje e so muda se quiser.
    try {
      const tipoProduto = (first.margemTipo === "fixed") ? "fixed" : "pct";
      _aplicarMargemTipoMassa(tipoProduto);
      if (_valMargemEl) {
        const m = Number(first.margem) || 0;
        if (m > 0) {
          // Formata conforme o tipo: R$ com 2 casas, % como esta
          if (tipoProduto === "fixed" && typeof formatMoneyBR === "function") {
            _valMargemEl.value = formatMoneyBR(m);
          } else if (typeof formatPercentBR === "function") {
            _valMargemEl.value = formatPercentBR(m);
          } else {
            _valMargemEl.value = String(m).replace(".", ",");
          }
        }
      }
    } catch (e) {}

    const imageHtml   = first.image
      ? `<img src="${first.image}" alt="${_escapeHtml(first.name || "")}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;border:1px solid var(--clr-border);" />`
      : `<div style="width:48px;height:48px;background:var(--clr-surface-alt);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--clr-text-3);border:1px solid var(--clr-border);"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg></div>`;

    const platformsHtml = results
      .map((r) => {
        const cfg  = getPlatformConfig(r.platformId);
        const name = cfg ? cfg.name : r.platformId;
        return `<span style="
          display:inline-flex; align-items:center;
          background: var(--clr-surface-alt);
          border: 1px solid var(--clr-border);
          border-radius: 999px;
          padding: 3px 10px;
          font-size: 11px;
          font-weight: 600;
          color: var(--clr-text-2);
        ">${_escapeHtml(name)}</span>`;
      })
      .join(" ");

    skuPreview.style.display = "block";
    skuPreview.innerHTML = `
      <div style="
        display:flex; align-items:center; gap:14px;
        background: var(--clr-success-lt);
        border: 1px solid var(--clr-success);
        border-radius: var(--r-md);
        padding: 14px 16px;
      ">
        ${imageHtml}
        <div style="flex:1; min-width:0;">
          <div style="font-size:14px; font-weight:700; color:var(--clr-text); display:flex; align-items:center; gap:6px;">
            <span style="display:inline-flex; color:var(--clr-success);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${_escapeHtml(first.name || "Produto sem nome")}
            </span>
          </div>
          <div style="font-size:12px; color:var(--clr-text-2); margin-top:2px;">
            Encontrado em <strong>${results.length}</strong> plataforma${results.length > 1 ? "s" : ""}
            ${first.finalPrice ? ` · Preço atual: <strong>${formatBRL(first.finalPrice)}</strong>` : ""}
          </div>
          <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;">
            ${platformsHtml}
          </div>
          ${temComposto ? _avisoCompostoHtml() : ""}
        </div>
      </div>
    `;
  }

  function _escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  // ══════════════════════════════════════════
  //  VÁRIOS SKUs  ·  TODOS OS PRODUTOS
  //
  //  Antes era um SKU por vez. Agora cada SKU digitado vira uma
  //  etiqueta, e existe a opção de atingir o catálogo inteiro das
  //  plataformas escolhidas.
  //
  //  A aplicação usa o performMassUpdateLote (utils.js): a mesma regra
  //  do performMassUpdate, SKU a SKU, mas cada plataforma é lida e
  //  gravada uma vez só e o trabalho é feito em fatias — a tela não
  //  trava e mostra o andamento (ver _processarAplicacao).
  // ══════════════════════════════════════════
  const chkTodos = document.getElementById("chkTodosProdutos");
  const skuChips = document.getElementById("skuChips");
  const skuArea = document.getElementById("skuArea");
  let _skus = [];

  function _normalizarSku(txt) {
    return String(txt || "").trim().toUpperCase();
  }

  function _adicionarSku(txt) {
    // Aceita vários de uma vez, separados por vírgula, ponto-e-vírgula
    // ou quebra de linha — dá para colar uma lista inteira.
    String(txt || "").split(/[,;\n\t]+/).forEach(function (parte) {
      const sku = _normalizarSku(parte);
      if (!sku) return;
      if (_skus.indexOf(sku) >= 0) return;   // sem repetir
      _skus.push(sku);
    });
    _renderChips();
  }

  function _removerSku(sku) {
    _skus = _skus.filter(function (s) { return s !== sku; });
    _renderChips();
  }

  function _renderChips() {
    if (!skuChips) return;
    skuChips.innerHTML = _skus.map(function (sku) {
      return '<span class="sku-chip">' + _escapeHtml(sku) +
        '<button type="button" class="sku-chip__x" data-sku="' + _escapeHtml(sku) +
        '" title="Remover">&times;</button></span>';
    }).join("");
    skuChips.querySelectorAll("[data-sku]").forEach(function (b) {
      b.addEventListener("click", function () { _removerSku(b.dataset.sku); });
    });
    // A prévia mostra o produto quando há um SKU só; com vários, não faz
    // sentido mostrar um deles como se fosse o alvo.
    if (_skus.length === 1) _renderSkuPreview(_skus[0]);
    else if (skuPreview) skuPreview.style.display = "none";
  }

  /** Os SKUs que serão atualizados, já considerando "todos os produtos". */
  function _skusParaAplicar(plataformas) {
    if (chkTodos && chkTodos.checked) {
      const todos = [];
      const vistos = new Set();
      plataformas.forEach(function (pid) {
        _produtosParaLer(pid).forEach(function (prod) {
          const sku = _normalizarSku(prod && prod.sku);
          if (sku && !vistos.has(sku)) { vistos.add(sku); todos.push(sku); }
        });
      });
      return todos;
    }
    return _skus.slice();
  }

  // Só para LER os produtos (contar, achar SKUs): a cópia rasa do utils.js,
  // sem copiar as imagens de cada produto. A cópia completa (getProducts)
  // fica para quem altera.
  function _produtosParaLer(pid) {
    try {
      return (typeof getProductsForReading === "function" ? getProductsForReading(pid) : getProducts(pid)) || [];
    } catch (e) {
      return [];
    }
  }

  // ══════════════════════════════════════════
  //  TRÊS PONTINHOS NOS CARTÕES DE PLATAFORMA
  //
  //  Os cartões já existem (montados pelo _buildPlatformList). Aqui só
  //  se acrescenta o menu a cada um — sem tocar na montagem original.
  //
  //  O menu traz todos os produtos daquela loja para a lista de SKUs, e
  //  dá para usar em quantas lojas quiser: os SKUs se somam.
  // ══════════════════════════════════════════

  function _fecharMenusDeLoja() {
    document.querySelectorAll(".plat-menu.aberto").forEach(function (m) {
      m.classList.remove("aberto");
    });
  }

  function _montarMenusDasPlataformas() {
    _getAllPlatformCheckboxes().forEach(function (chk) {
      const cartao = chk.closest("label") || chk.parentElement;
      if (!cartao || cartao.querySelector(".plat-pontos")) return;
      const pid = chk.value || chk.dataset.pid;
      if (!pid) return;

      cartao.classList.add("plat-com-menu");

      const pontos = document.createElement("button");
      pontos.type = "button";
      pontos.className = "plat-pontos";
      pontos.title = "Opções desta loja";
      pontos.setAttribute("aria-label", "Opções desta loja");
      pontos.textContent = "⋮";

      const menu = document.createElement("span");
      menu.className = "plat-menu";
      menu.innerHTML =
        '<button type="button" class="plat-menu__acao" data-acao="add">Selecionar todos os produtos</button>' +
        '<button type="button" class="plat-menu__acao" data-acao="rem">Remover os SKUs desta loja</button>';

      // O cartão inteiro é um label: um clique nele marcaria a
      // plataforma. Por isso tudo aqui para o evento antes disso.
      const segurar = function (e) { e.preventDefault(); e.stopPropagation(); };
      pontos.addEventListener("click", function (e) {
        segurar(e);
        const jaAberto = menu.classList.contains("aberto");
        _fecharMenusDeLoja();
        if (!jaAberto) menu.classList.add("aberto");
      });
      menu.addEventListener("click", segurar);

      menu.querySelectorAll("[data-acao]").forEach(function (b) {
        b.addEventListener("click", function (e) {
          segurar(e);
          _fecharMenusDeLoja();
          if (chkTodos && chkTodos.checked) {
            showToast("Desmarque a seleção global para escolher por loja.", "warning");
            return;
          }
          const skusDaLoja = (getProducts(pid) || [])
            .map(function (prod) { return _normalizarSku(prod.sku); })
            .filter(Boolean);

          if (b.dataset.acao === "add") {
            const antes = _skus.length;
            // Todos de uma vez (um por linha): as etiquetas são desenhadas
            // uma vez só. Um por um, a lista era redesenhada a cada SKU — com
            // centenas de produtos, a tela parava.
            _adicionarSku(skusDaLoja.join("\n"));
            const novos = _skus.length - antes;
            showToast(
              novos ? novos + " SKU(s) adicionado(s)." : "Todos os SKUs desta loja já estavam na lista.",
              novos ? "success" : "info",
            );
          } else {
            const antes = _skus.length;
            _skus = _skus.filter(function (sku) { return skusDaLoja.indexOf(sku) < 0; });
            _renderChips();
            showToast((antes - _skus.length) + " SKU(s) removido(s).", "info");
          }
        });
      });

      cartao.appendChild(pontos);
      cartao.appendChild(menu);
    });
  }

  document.addEventListener("click", _fecharMenusDeLoja);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") _fecharMenusDeLoja();
  });

  _montarMenusDasPlataformas();

  // A pílula de seleção global copia a ALTURA REAL do campo de SKU ao
  // lado. Fixar um número no CSS quebraria se o tema mudasse a altura
  // dos campos; aqui ela acompanha sozinha.
  (function _igualarAlturaSelGlobal() {
    // O acabamento do campo de SKU está no INVÓLUCRO (borda e raio), e
    // não no input. É dele que a pílula copia, para os dois ficarem
    // idênticos mesmo se o tema mudar.
    const campo = document.getElementById("skuInput");
    const inv = campo && campo.closest(".input-addon-wrap");
    const pilula = document.getElementById("selGlobal");
    if (!campo || !inv || !pilula) return;
    const ajustar = function () {
      const cs = getComputedStyle(inv);
      const h = Math.round(inv.getBoundingClientRect().height);
      if (h > 0) pilula.style.setProperty("--sel-global-altura", h + "px");
      if (cs.borderTopLeftRadius) pilula.style.borderRadius = cs.borderTopLeftRadius;
      if (cs.borderTopWidth) pilula.style.borderWidth = cs.borderTopWidth;
      if (cs.borderTopStyle && cs.borderTopStyle !== "none") pilula.style.borderStyle = cs.borderTopStyle;
      // O fundo também vem do invólucro — mas só o estado normal: com o
      // campo em foco ele muda de cor, e a pílula não deve acompanhar.
      if (!inv.contains(document.activeElement)) {
        if (cs.backgroundColor) pilula.style.backgroundColor = cs.backgroundColor;
        if (cs.borderTopColor) pilula.style.borderColor = cs.borderTopColor;
      }
    };
    ajustar();
    setTimeout(ajustar, 300);
    window.addEventListener("resize", ajustar);
  })();

  if (chkTodos) {
    chkTodos.addEventListener("change", function () {
      const todos = chkTodos.checked;
      if (skuArea) skuArea.style.opacity = todos ? "0.45" : "";
      if (skuArea) skuArea.style.pointerEvents = todos ? "none" : "";
      if (todos && skuPreview) skuPreview.style.display = "none";
      else _renderChips();
    });
  }

  // Enter ou vírgula adicionam; Backspace no campo vazio remove o último.
  skuInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      _adicionarSku(skuInput.value);
      skuInput.value = "";
      if (skuPreview) skuPreview.style.display = "none";
    } else if (e.key === "Backspace" && !skuInput.value && _skus.length) {
      _removerSku(_skus[_skus.length - 1]);
    }
  });
  // Sair do campo com algo digitado também adiciona: ninguém deveria
  // perder um SKU por ter esquecido o Enter.
  skuInput.addEventListener("blur", function () {
    if (skuInput.value.trim()) {
      _adicionarSku(skuInput.value);
      skuInput.value = "";
    }
  });

  skuInput.addEventListener("input", () => {
    clearTimeout(_previewTimeout);
    _previewTimeout = setTimeout(() => _renderSkuPreview(skuInput.value), 250);
  });

  // ══════════════════════════════════════════
  //  BOTÃO APLICAR
  // ══════════════════════════════════════════

  // ── Obrigatórios em vermelho (utils.js) ──
  // O que falta fica vermelho até ser resolvido. "resolvido" diz quando
  // sair do vermelho (num grupo de opções, por exemplo, ao marcar uma).
  function _marcarErro(el, resolvido) {
    if (!el || !window.BapellCampos) return;
    window.BapellCampos.marcar(el, null, resolvido ? { resolvido: resolvido } : undefined);
    window.BapellCampos.focar(el);
  }

  // "Selecionar Todas" marca as plataformas por código (sem o evento de
  // cada caixa): a lista sai do vermelho por aqui também.
  chkSelectAll.addEventListener("change", function () {
    if (window.BapellCampos && platformCont.classList.contains("campo-erro") && _getSelectedPlatformIds().length > 0) {
      window.BapellCampos.limpar(platformCont);
    }
  });

  // Ações em massa em andamento: nada de aplicar de novo até terminar.
  let _processando = false;

  btnAplicar.addEventListener("click", () => {
    if (_processando) {
      showToast("Aguarde: as alterações ainda estão sendo aplicadas.", "warning");
      return;
    }
    // Valida SKU
    // O que estiver digitado e ainda não virou etiqueta também conta.
    if (skuInput.value.trim() && !(chkTodos && chkTodos.checked)) {
      _adicionarSku(skuInput.value);
      skuInput.value = "";
    }

    // Valida plataformas ANTES dos SKUs: "todos os produtos" depende delas.
    const selectedPlatforms = _getSelectedPlatformIds();
    if (selectedPlatforms.length === 0) {
      showToast("Selecione pelo menos uma plataforma de destino.", "warning");
      _marcarErro(platformCont, function () { return _getSelectedPlatformIds().length > 0; });
      return;
    }

    const skusAlvo = _skusParaAplicar(selectedPlatforms);
    if (skusAlvo.length === 0) {
      showToast(
        chkTodos && chkTodos.checked
          ? "Nenhum produto encontrado nas plataformas selecionadas."
          : "Informe pelo menos um SKU.",
        "error",
      );
      if (!(chkTodos && chkTodos.checked)) {
        _marcarErro(skuInput, function () { return _skus.length > 0 || !!skuInput.value.trim(); });
        skuInput.focus();
      }
      return;
    }
    const sku = skusAlvo[0];

    // Monta objeto de atualizações.
    // Um campo marcado mas VAZIO não deve gravar 0 (zeraria o valor do produto).
    const updates = {};
    const camposVazios = [];
    const elsVazios = []; // os campos marcados e em branco: ficam vermelhos

    // Mapa: checkbox → input → chave gravada no produto
    const CAMPOS = [
      { chk: "chkCusto",        val: "valCusto",        chave: "custo",        nome: "Preço de Custo" },
      { chk: "chkEtiqueta",     val: "valEtiqueta",     chave: "etiqueta",     nome: "Etiqueta" },
      { chk: "chkEmbalagem",    val: "valEmbalagem",    chave: "embalagem",    nome: "Embalagem" },
      { chk: "chkFrete",        val: "valFrete",        chave: "frete",        nome: "Frete Pago" },
      // As chaves abaixo (ipi, difal, st, aliquota) são exatamente as mesmas
      // que o produto.js grava ao salvar um produto. Usar outro nome criaria
      // um segundo conjunto de campos que a tela de Produto não leria.
      { chk: "chkIpi",          val: "valIpi",          chave: "ipi",          nome: "IPI" },
      { chk: "chkDifal",        val: "valDifal",        chave: "difal",        nome: "DIFAL" },
      { chk: "chkSt",           val: "valSt",           chave: "st",           nome: "ST" },
      { chk: "chkAliquota",     val: "valAliquota",     chave: "aliquota",     nome: "Alíquota" },
      { chk: "chkImposto",      val: "valImposto",      chave: "impostoNF",    nome: "Imposto NF" },
      // A Taxa Plataforma NÃO entra aqui: ela é tratada logo abaixo,
      // porque muda de nome conforme a plataforma (Premium e Clássico no
      // Mercado Livre, campo único nas demais).
      { chk: "chkTaxaFixa",     val: "valTaxaFixa",     chave: "taxaFixa",     nome: "Taxa Fixa" },
      { chk: "chkMargem",       val: "valMargem",       chave: "margem",       nome: "Margem de Lucro" },
      { chk: "chkFreteProduto", val: "valFreteProduto", chave: "freteProduto", nome: "Frete do Produto" },
    ];

    for (const campo of CAMPOS) {
      const chk = document.getElementById(campo.chk);
      const inp = document.getElementById(campo.val);
      if (!chk || !inp || !chk.checked) continue;

      const bruto = inp.value.trim();
      if (bruto === "") {
        camposVazios.push(campo.nome);
        elsVazios.push(inp);
        continue;
      }
      const val = parseFormattedValue(bruto);
      if (!isFinite(val)) {
        camposVazios.push(campo.nome);
        elsVazios.push(inp);
        continue;
      }
      if (val < 0) {
        showToast(`"${campo.nome}" não pode ser negativo.`, "error");
        _marcarErro(inp);
        inp.focus();
        return;
      }
      updates[campo.chave] = val;
      // Se o campo for a margem, grava também o tipo (R$ ou %) escolhido no
      // toggle, para o produto passar a usar essa unidade.
      if (campo.chave === "margem") {
        updates.margemTipo = _massMargemTipo;
      }
    }

    // Trava de segurança, além do campo já vir desabilitado: produto composto
    // tem o custo derivado dos componentes. Se o custo chegar aqui por qualquer
    // caminho, descarta — gravá-lo produziria um valor que o próximo recálculo
    // desfaz, deixando preço e margem errados nesse meio tempo.
    //
    // Antes, só o PRIMEIRO SKU era conferido: com vários SKUs (ou "todos os
    // produtos"), os compostos dos outros recebiam o custo digitado — e um
    // primeiro SKU composto tirava o custo de todos os outros. Agora vale
    // produto a produto: o processamento pula o custo de cada composto
    // (protegerCustoDeCompostos). Aqui, se TODOS os produtos atingidos são
    // compostos, o custo sai já, com o mesmo aviso de antes.
    if (updates.custo !== undefined) {
      const alvoSkus = new Set(skusAlvo);
      let atingidos = 0;
      let compostos = 0;
      selectedPlatforms.forEach(function (pid) {
        _produtosParaLer(pid).forEach(function (prod) {
          if (!prod || !alvoSkus.has(_normalizarSku(prod.sku))) return;
          atingidos++;
          if (_ehComposto(prod)) compostos++;
        });
      });
      if (atingidos > 0 && compostos === atingidos) {
        delete updates.custo;
        showToast(
          'Produto composto: o "Preço de Custo" vem dos componentes e não foi alterado.',
          "warning",
          5000,
        );
      }
    }

    // Se marcou o campo mas não digitou nada, avisa em vez de zerar silenciosamente
    if (camposVazios.length > 0) {
      showToast(
        `Preencha o valor de: ${camposVazios.join(", ")}. Campos vazios não são aplicados.`,
        "warning",
        5000,
      );
      if (window.BapellCampos) {
        elsVazios.forEach(function (el) { window.BapellCampos.marcar(el); });
        window.BapellCampos.focar(elsVazios[0]);
      }
      return;
    }

    // ── Taxa da Plataforma ──
    // Guardada com nomes provisórios (__taxa*): na hora de aplicar, cada
    // plataforma recebe a chave que ela entende.
    const chkTaxaEl = document.getElementById("chkTaxa");
    if (chkTaxaEl && chkTaxaEl.checked) {
      const temML = selectedPlatforms.some(_ehML);
      const temOutras = selectedPlatforms.some(function (pid) { return !_ehML(pid); });
      const ler = function (id) {
        const el = document.getElementById(id);
        if (!el) return undefined;
        const txt = String(el.value || "").trim();
        if (txt === "") return undefined;
        const n = parseFormattedValue(txt);
        return Number.isFinite(n) ? n : undefined;
      };

      const prem = ler("valTaxaPremium");
      const clas = ler("valTaxaClassico");
      const comum = ler("valTaxa");

      if (temML && prem === undefined && clas === undefined) camposVazios.push("Taxa Plataforma (Premium/Clássico)");
      if (temOutras && comum === undefined) camposVazios.push("Taxa Plataforma");

      if (prem !== undefined) updates.__taxaPremium = prem;
      if (clas !== undefined) updates.__taxaClassico = clas;
      if (comum !== undefined) updates.__taxaComum = comum;
    }


    if (Object.keys(updates).length === 0) {
      showToast("Selecione pelo menos um campo para atualizar.", "warning");
      _marcarErro(document.querySelector(".mass-cols"), function () {
        return !!document.querySelector(".mass-cols .mass-checkbox:checked");
      });
      return;
    }

    // Confirmação: a operação altera vários produtos e NÃO pode ser desfeita.
    // (Aqui havia um findProductsBySku(sku) cujo resultado não era usado: ele
    // copiava TODAS as plataformas, com as imagens, a cada clique em Salvar.)
    const _alvos = new Set(skusAlvo);
    const nasSelecionadas = selectedPlatforms.filter(function (pid) {
      return _produtosParaLer(pid).some(function (prod) {
        return !!prod && _alvos.has((prod.sku || "").trim().toUpperCase());
      });
    });
    if (nasSelecionadas.length === 0) {
      showToast(
        skusAlvo.length === 1
          ? `Nenhum produto com o SKU "${skusAlvo[0]}" nas plataformas selecionadas.`
          : "Nenhum dos SKUs informados existe nas plataformas selecionadas.",
        "warning",
      );
      return;
    }
    const resumoCampos = Object.keys(updates).filter((k) => k !== "margemTipo").length;

    // Abre o modal de confirmação (substitui o confirm nativo). O processamento
    // real acontece em _processarAplicacao(), chamado quando o usuário confirma.
    _abrirModalConfirmacao({
      sku: (chkTodos && chkTodos.checked)
        ? "todos os produtos"
        : (skusAlvo.length === 1 ? skusAlvo[0] : skusAlvo.length + " SKUs"),
      qtdCampos: resumoCampos,
      qtdProdutos: skusAlvo.length,
      qtdPlataformas: selectedPlatforms.length,
      onConfirmar: function (responsavel) {
        _processarAplicacao(skusAlvo, updates, selectedPlatforms, responsavel);
      },
    });
  });

  // ══════════════════════════════════════════
  //  MODAL DE CONFIRMAÇÃO (no lugar do confirm nativo)
  // ══════════════════════════════════════════
  const _modal = document.getElementById("massConfirmModal");
  const _modalList = document.getElementById("massModalList");
  const _modalConfirm = document.getElementById("massModalConfirm");
  const _modalSub = document.getElementById("massModalSub");
  // Quem está aplicando: um dos usuários de Dados da Empresa › Usuários e
  // Senhas. Quem tem senha só aplica digitando a própria senha.
  const _modalResp = document.getElementById("massResponsavel");
  let _modalOnConfirm = null;

  function _abrirModalConfirmacao(dados) {
    if (!_modal) {
      // Se por algum motivo o modal não existir, pergunta numa janela do
      // app (no lugar do confirm nativo) para não travar.
      const perguntar = window.BapellModal
        ? window.BapellModal.confirmar({
            titulo: "Aplicar as alterações?",
            texto: `Aplicar ${dados.qtdCampos} campo(s) ao SKU "${dados.sku}"? ` +
              `Isso afetará ${dados.qtdProdutos} produto(s) em ${dados.qtdPlataformas} plataforma(s). ` +
              `Esta ação não pode ser desfeita.`,
            botao: "Aplicar alterações",
          })
        : Promise.resolve(false);
      perguntar.then(function (ok) { if (ok && dados.onConfirmar) dados.onConfirmar(""); });
      return;
    }
    if (_modalResp && window.BapellUsuarios) {
      window.BapellUsuarios.preencherSelect(_modalResp, { valor: "", vazio: "Selecione quem está aplicando" });
    }
    if (_modalResp && window.BapellCampos) window.BapellCampos.limpar(_modalResp);
    // Preenche o resumo
    if (_modalSub) {
      _modalSub.textContent = `Revise antes de aplicar ao SKU "${dados.sku}". Esta ação recalcula preços e kits.`;
    }
    if (_modalList) {
      _modalList.innerHTML =
        `<li><span>Campos a alterar</span><strong>${dados.qtdCampos}</strong></li>` +
        `<li><span>Produtos afetados</span><strong>${dados.qtdProdutos}</strong></li>` +
        `<li><span>Plataformas</span><strong>${dados.qtdPlataformas}</strong></li>`;
    }
    _modalOnConfirm = dados.onConfirmar || null;
    _modal.hidden = false;
  }

  function _fecharModal() {
    if (_modal) _modal.hidden = true;
    _modalOnConfirm = null;
  }

  if (_modal) {
    // Botão confirmar: antes, o responsável (e a senha dele, se tiver).
    let _confirmando = false;
    if (_modalConfirm) {
      _modalConfirm.addEventListener("click", function () {
        if (_confirmando || _processando) return;
        const fn = _modalOnConfirm;
        const U = window.BapellUsuarios;
        if (!_modalResp || !U) {
          _fecharModal();
          if (fn) fn("");
          return;
        }
        if (!U.listar().length) {
          _marcarErro(_modalResp);
          U.pedirCadastro();
          return;
        }
        if (window.BapellCampos && !window.BapellCampos.exigir([{ el: _modalResp, msg: "Escolha quem está aplicando as alterações." }])) return;
        _confirmando = true;
        U.confirmarResponsavel(_modalResp.value, { acao: "aplicar estas alterações" }).then(function (r) {
          _confirmando = false;
          // A janela foi fechada enquanto a senha era pedida: nada é aplicado.
          if (_modal.hidden) return;
          if (!r.ok) {
            if (r.motivo === "vazio") _marcarErro(_modalResp);
            return;
          }
          _fecharModal();
          if (fn) fn(r.usuario.nome);
        }, function () { _confirmando = false; });
      });
    }
    // Fecha ao clicar em cancelar ou no fundo
    _modal.querySelectorAll("[data-mass-close]").forEach(function (el) {
      el.addEventListener("click", _fecharModal);
    });
    // Fecha com Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !_modal.hidden) _fecharModal();
    });
  }

  // ══════════════════════════════════════════
  //  PROCESSAMENTO (roda após confirmar no modal)
  // ══════════════════════════════════════════
  /**
   * Mercado Livre? Usa a MESMA função do resto do app (utils.js), para
   * não existirem duas regras de identificação que possam divergir.
   */
  function _ehML(pid) {
    if (typeof ehMercadoLivre !== "function") return false;
    const cfg = (typeof getPlatformConfig === "function") ? getPlatformConfig(pid) : null;
    return !!ehMercadoLivre(pid, cfg && cfg.name);
  }

  /**
   * As atualizações para UMA plataforma.
   *
   * A taxa de plataforma é o único campo que muda de nome conforme o
   * destino: no Mercado Livre são duas (Premium e Clássico), nas demais
   * é uma só. Cada plataforma recebe só as chaves que ela entende — sem
   * isto, um campo do ML iria parar num produto de Loja Física.
   */
  function _updatesDaPlataforma(updates, pid) {
    const u = Object.assign({}, updates);
    delete u.__taxaPremium;
    delete u.__taxaClassico;
    delete u.__taxaComum;

    if (_ehML(pid)) {
      delete u.taxa;   // no ML quem vale são as duas modalidades
      if (updates.__taxaPremium !== undefined) u.mlTaxaPremium = updates.__taxaPremium;
      if (updates.__taxaClassico !== undefined) u.mlTaxaClassico = updates.__taxaClassico;
    } else if (updates.__taxaComum !== undefined) {
      u.taxa = updates.__taxaComum;
    }
    return u;
  }

  /** As chaves do `updates` em nomes legíveis, para o histórico. */
  function _camposDoResumo(updates) {
    const nomes = {
      custo: "Preço de Custo", embalagem: "Embalagem", etiqueta: "Etiqueta",
      frete: "Frete Pago", ipi: "IPI (%)", difal: "DIFAL (%)", st: "ST (%)",
      aliquota: "Alíquota (%)", freteProduto: "Frete do Produto",
      taxaFixa: "Taxa Fixa", impostoNF: "Imposto NF (%)", margem: "Margem",
      margemTipo: "Tipo de margem",
      __taxaComum: "Taxa Plataforma (%)",
      __taxaPremium: "Taxa Mercado Livre — Premium (%)",
      __taxaClassico: "Taxa Mercado Livre — Clássico (%)",
    };
    return Object.keys(updates).map(function (k) {
      return { nome: nomes[k] || k, valor: updates[k] };
    });
  }

  // ══════════════════════════════════════════
  //  CARREGANDO: "Processando ações em massa..."
  //
  //  Aparece assim que o processamento começa e só sai quando ele termina
  //  (com o resultado) ou falha (com o aviso de erro). Cobre a tela: nada
  //  por trás pode ser clicado — nem o Salvar de novo. A barra mostra o
  //  andamento real: quantos SKUs já foram aplicados em cada plataforma.
  // ══════════════════════════════════════════
  const _proc = document.getElementById("massProcModal");
  const _procEtapa = document.getElementById("massProcEtapa");
  const _procBarra = document.getElementById("massProcBarra");
  const _procFill = document.getElementById("massProcFill");
  const _procNum = document.getElementById("massProcNum");
  let _procFocoAntes = null;

  function _nomeDaPlataforma(pid) {
    const cfg = (typeof getPlatformConfig === "function") ? getPlatformConfig(pid) : null;
    return (cfg && cfg.name) || pid || "";
  }

  // Enquanto processa, o Tab não sai da janela (nada por trás recebe foco).
  function _procTecla(e) {
    if (!_processando) return;
    if (e.key === "Tab" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function _mostrarCarregando() {
    if (!_proc) return;
    _procFocoAntes = document.activeElement;
    if (_procEtapa) _procEtapa.textContent = "Preparando os produtos…";
    if (_procNum) _procNum.textContent = "";
    if (_procFill) _procFill.style.width = "0%";
    if (_procBarra) {
      _procBarra.setAttribute("aria-valuenow", "0");
      _procBarra.classList.add("mass-proc__barra--espera");
    }
    _proc.hidden = false;
    document.addEventListener("keydown", _procTecla, true);
    try { _proc.querySelector(".mass-proc__card").focus({ preventScroll: true }); } catch (e) {}
  }

  function _atualizarCarregando(info) {
    if (!_proc || !info) return;
    const nome = _nomeDaPlataforma(info.plataforma);
    const plataforma = info.totalPlataformas > 1
      ? nome + " (plataforma " + info.indicePlataforma + " de " + info.totalPlataformas + ")"
      : nome;
    if (_procEtapa) {
      _procEtapa.textContent = info.etapa === "gravando"
        ? "Gravando as alterações: " + plataforma
        : (info.etapa === "fim" ? "Concluindo…" : "Aplicando em " + plataforma);
    }
    if (_procNum && info.totalSkus > 0) {
      const n = info.etapa === "aplicando" ? Math.min(info.skuAtual, info.totalSkus) : info.totalSkus;
      _procNum.textContent = "SKU " + n.toLocaleString("pt-BR") + " de " + info.totalSkus.toLocaleString("pt-BR") +
        (info.etapa === "aplicando" ? "" : " aplicados");
    }
    if (info.total > 0) {
      const pct = Math.max(0, Math.min(100, Math.round((info.feitos / info.total) * 100)));
      if (_procFill) _procFill.style.width = pct + "%";
      if (_procBarra) {
        _procBarra.setAttribute("aria-valuenow", String(pct));
        _procBarra.classList.remove("mass-proc__barra--espera");
      }
    }
  }

  function _esconderCarregando() {
    document.removeEventListener("keydown", _procTecla, true);
    if (_proc) _proc.hidden = true;
    try { if (_procFocoAntes && _procFocoAntes.isConnected) _procFocoAntes.focus({ preventScroll: true }); } catch (e) {}
    _procFocoAntes = null;
  }

  /**
   * Deixa a janela de carregamento aparecer ANTES do trabalho começar.
   * (Com a janela do app minimizada o requestAnimationFrame não roda: o
   * tempo-limite segue em frente.)
   */
  function _esperarPintura() {
    return new Promise(function (resolve) {
      let feito = false;
      const ok = function () { if (!feito) { feito = true; resolve(); } };
      try { requestAnimationFrame(function () { setTimeout(ok, 0); }); } catch (e) {}
      setTimeout(ok, 80);
    });
  }

  async function _processarAplicacao(skus, updates, selectedPlatforms, responsavel) {
    if (_processando) return;
    _processando = true;
    const textoOriginal = btnAplicar.textContent;
    btnAplicar.disabled = true;
    btnAplicar.textContent = "Processando...";
    const _btnCancelar = document.getElementById("btnCancelarMassa");
    if (_btnCancelar) _btnCancelar.disabled = true;
    _mostrarCarregando();

    let result;
    try {
      await _esperarPintura();
      // As alterações de cada plataforma (a taxa muda de nome conforme ela).
      const porPlataforma = {};
      selectedPlatforms.forEach(function (pid) { porPlataforma[pid] = _updatesDaPlataforma(updates, pid); });
      // Cada plataforma é lida e gravada uma vez, e o trabalho é feito em
      // fatias: a tela continua respondendo (utils.js, performMassUpdateLote).
      // O resultado é o mesmo de antes, SKU a SKU — e o Preço de Custo não é
      // gravado em produto composto.
      result = await performMassUpdateLote(skus, porPlataforma, selectedPlatforms, {
        aoProgredir: _atualizarCarregando,
        protegerCustoDeCompostos: true,
      });
    } catch (e) {
      console.error("Falha na atualização em massa:", e);
      if (typeof PrecifiqErros !== "undefined") {
        PrecifiqErros.registrar("Falha em performMassUpdateLote", e && e.stack ? e.stack : String(e));
      }
      showToast("Erro ao aplicar as alterações. Nenhum dado foi perdido.", "error", 6000);
      return;
    } finally {
      _esconderCarregando();
      _processando = false;
      btnAplicar.disabled = false;
      btnAplicar.textContent = textoOriginal;
      if (_btnCancelar) _btnCancelar.disabled = false;
    }

    // Gravação recusada pelo disco: o saveProducts já avisou; aqui fica o
    // registro de quais plataformas.
    if (result.falhasAoGravar && result.falhasAoGravar.length) {
      console.error("[Ações em Massa] não gravou:", result.falhasAoGravar);
    }
    // Compostos atingidos: o Preço de Custo deles não mudou (vem dos itens).
    if (result.custoIgnoradoCompostos > 0) {
      showToast(
        (result.custoIgnoradoCompostos === 1
          ? "1 produto composto não recebeu"
          : result.custoIgnoradoCompostos + " produtos compostos não receberam") +
          ' o "Preço de Custo" digitado: o custo deles vem dos componentes.',
        "warning",
        6000,
      );
    }

    // Registro do que foi feito, para o histórico no fim da tela.
    try {
      const nomes = function (ids) {
        return ids.map(function (pid) {
          const cfg = (typeof getPlatformConfig === "function") ? getPlatformConfig(pid) : null;
          return (cfg && cfg.name) || pid;
        });
      };
      _histGravar({
        quando: Date.now(),
        alvo: (chkTodos && chkTodos.checked)
          ? "Todos os produtos"
          : (skus.length === 1 ? "SKU " + skus[0] : skus.length + " SKUs"),
        skus: skus.slice(0, 40),
        plataformas: nomes(result.platformsAffected.length ? result.platformsAffected : selectedPlatforms),
        campos: _camposDoResumo(updates),
        produtosAtualizados: result.productsUpdated || 0,
        kitsRecalculados: result.kitsRecalculated || 0,
        compostosAtualizados: result.compostosAtualizados || 0,
        responsavel: responsavel || "",
      });
    } catch (e) {
      console.error("[Ações em Massa] falha ao gravar o histórico:", e);
    }

    _renderResultado(result, result.platformsAffected.length ? result.platformsAffected : selectedPlatforms);
  }

  /**
   * O resultado aparece num MODAL, por cima da tela, com um botão que
   * fecha e devolve ao formulário. Antes ele era um quadro no meio da
   * página, que podia passar despercebido abaixo da dobra.
   *
   * O quadro antigo (#resultadoBox) continua no HTML e recebe o mesmo
   * conteúdo: se o modal não existir, nada se perde.
   */
  const _resultModal = document.getElementById("massResultModal");
  const _resultOk = document.getElementById("massResultOk");

  // ══════════════════════════════════════════
  //  HISTÓRICO DAS ATUALIZAÇÕES
  //
  //  Guarda as últimas 9, com o que foi alterado em cada uma. Fica no
  //  localStorage: é um registro da tela, não do produto.
  // ══════════════════════════════════════════
  const HIST_KEY = "precifiq_massa_historico";
  const HIST_MAX = 9;

  function _histLer() {
    try {
      const bruto = JSON.parse(localStorage.getItem(HIST_KEY) || "[]");
      return Array.isArray(bruto) ? bruto : [];
    } catch (e) {
      console.error("[Ações em Massa] histórico ilegível:", e);
      return [];
    }
  }

  function _histGravar(registro) {
    const lista = _histLer();
    lista.unshift(registro);
    try {
      localStorage.setItem(HIST_KEY, JSON.stringify(lista.slice(0, HIST_MAX)));
    } catch (e) {
      console.error("[Ações em Massa] não consegui gravar o histórico:", e);
    }
    _histRender();
  }

  function _histRender() {
    const box = document.getElementById("historicoBox");
    const lista = document.getElementById("historicoLista");
    if (!box || !lista) return;
    const itens = _histLer();
    if (!itens.length) { box.style.display = "none"; return; }
    box.style.display = "block";
    lista.innerHTML = itens.map(function (r, i) {
      const d = new Date(r.quando);
      const data = d.toLocaleDateString("pt-BR") + " às " +
        d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      return '<button type="button" class="hist-item" data-hist="' + i + '">' +
        '<span class="hist-item__data">' + data + "</span>" +
        '<span class="hist-item__resumo">' +
          _escapeHtml(r.alvo) + " · " + r.campos.length + " campo(s)" +
          (r.responsavel ? " · " + _escapeHtml(r.responsavel) : "") +
        "</span>" +
        '<span class="hist-item__num">' + r.produtosAtualizados + " produto(s)</span>" +
        "</button>";
    }).join("");
    lista.querySelectorAll("[data-hist]").forEach(function (b) {
      b.addEventListener("click", function () { _histDetalhe(itens[parseInt(b.dataset.hist, 10)]); });
    });
  }

  function _histDetalhe(r) {
    const modal = document.getElementById("histDetalheModal");
    const alvo = document.getElementById("histDetalheConteudo");
    if (!modal || !alvo || !r) return;
    const d = new Date(r.quando);
    alvo.innerHTML =
      '<h3 style="margin:0 0 4px;">Detalhes da atualização</h3>' +
      '<div class="hist-det__data">' + d.toLocaleString("pt-BR") + "</div>" +
      (r.responsavel
        ? '<div class="hist-det__bloco"><span class="hist-det__rot">Responsável</span><div>' + _escapeHtml(r.responsavel) + "</div></div>"
        : "") +
      '<div class="hist-det__bloco"><span class="hist-det__rot">Produtos alvo</span>' +
        "<div>" + _escapeHtml(r.alvo) + "</div>" +
        (r.skus && r.skus.length && r.skus.length <= 40
          ? '<div class="hist-det__skus">' + r.skus.map(_escapeHtml).join(", ") + "</div>" : "") +
      "</div>" +
      '<div class="hist-det__bloco"><span class="hist-det__rot">Plataformas</span><div>' +
        (r.plataformas || []).map(_escapeHtml).join(", ") + "</div></div>" +
      '<div class="hist-det__bloco"><span class="hist-det__rot">Campos alterados</span>' +
        '<table class="hist-det__tabela"><tbody>' +
        r.campos.map(function (c) {
          return "<tr><td>" + _escapeHtml(c.nome) + "</td><td><strong>" + _escapeHtml(String(c.valor)) + "</strong></td></tr>";
        }).join("") +
        "</tbody></table></div>" +
      '<div class="hist-det__bloco"><span class="hist-det__rot">Resultado</span><div>' +
        r.produtosAtualizados + " produto(s) atualizado(s) · " +
        r.kitsRecalculados + " kit(s) recalculado(s)" +
        (r.compostosAtualizados > 0 ? " · " + r.compostosAtualizados + " composto(s) atualizado(s)" : "") +
        "</div></div>";
    modal.style.display = "flex";
  }

  const _histOk = document.getElementById("histDetalheOk");
  const _histModal = document.getElementById("histDetalheModal");
  if (_histOk) _histOk.addEventListener("click", function () { _histModal.style.display = "none"; });
  if (_histModal) _histModal.addEventListener("mousedown", function (e) {
    if (e.target === _histModal) _histModal.style.display = "none";
  });
  _histRender();

  /**
   * Devolve a tela ao estado inicial depois de concluir.
   *
   * Sem isto, a pessoa via os campos ainda marcados com os valores
   * antigos e podia aplicar de novo sem perceber.
   */
  function _limparTela() {
    _skus = [];
    if (chkTodos) chkTodos.checked = false;
    if (skuArea) { skuArea.style.opacity = ""; skuArea.style.pointerEvents = ""; }
    if (skuInput) skuInput.value = "";
    _renderChips();
    if (skuPreview) skuPreview.style.display = "none";

    fieldControls.forEach(function (c) {
      const chk = document.getElementById(c.checkboxId);
      const wrap = document.getElementById(c.wrapperId);
      if (chk) chk.checked = false;
      if (wrap) wrap.classList.remove("show");
    });
    document.querySelectorAll("#massForm input.input-field, .mass-input-wrapper input.input-field")
      .forEach(function (i) { i.value = ""; });
    resultadoBox.style.display = "none";
    // Sem produtos escolhidos, nada de produto composto: o "Preço de Custo"
    // volta a ficar disponível.
    _travarCampoCusto(false);
    _ajustarCamposDeTaxa();
  }

  function _fecharResultado() {
    if (_resultModal) _resultModal.style.display = "none";
    _limparTela();
  }

  // ── "Cancelar" (barra fixa do canto inferior direito) ──
  // Limpa o que foi preenchido (produtos escolhidos, campos marcados e
  // valores), como depois de concluir. Nada é aplicado aos produtos.
  function _temAlgoPreenchido() {
    if (_skus.length || (skuInput && skuInput.value.trim()) || (chkTodos && chkTodos.checked)) return true;
    return fieldControls.some(function (c) {
      const chk = document.getElementById(c.checkboxId);
      return !!(chk && chk.checked);
    });
  }
  const _btnCancelarMassa = document.getElementById("btnCancelarMassa");
  if (_btnCancelarMassa) {
    _btnCancelarMassa.addEventListener("click", function () {
      if (!_temAlgoPreenchido()) {
        showToast("Não há nada preenchido para cancelar.", "default", 2600);
        return;
      }
      const limpar = function () {
        _limparTela();
        showToast("Alterações canceladas: nada foi aplicado aos produtos.", "success", 3000);
      };
      if (window.BapellModal && typeof window.BapellModal.confirmar === "function") {
        window.BapellModal.confirmar({
          titulo: "Cancelar as alterações?",
          texto: "Os produtos escolhidos e os campos preenchidos serão limpos. Nada foi aplicado aos produtos.",
          botao: "Cancelar alterações",
          cancelar: "Continuar editando",
          perigo: true,
        }).then(function (sim) { if (sim) limpar(); });
      } else {
        limpar();
      }
    });
  }
  if (_resultOk) _resultOk.addEventListener("click", _fecharResultado);
  if (_resultModal) {
    _resultModal.addEventListener("mousedown", function (e) {
      if (e.target === _resultModal) _fecharResultado();
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && _resultModal && _resultModal.style.display !== "none") {
      _fecharResultado();
    }
  });

  function _renderResultado(result, selectedPlatforms) {
    const alvoModal = document.getElementById("massResultConteudo");
    const conteudo = alvoModal || document.getElementById("resultadoConteudo");
    if (alvoModal && _resultModal) {
      _resultModal.style.display = "flex";
      resultadoBox.style.display = "none";
    } else {
      resultadoBox.style.display = "block";
    }
    if (!conteudo) return;

    if (!result.success) {
      conteudo.innerHTML = `
        <div style="text-align:center; padding:20px 0;">
          <div style="margin-bottom:12px; display:flex; justify-content:center;"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--clr-warning)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></div>
          <h3 style="color:var(--clr-warning); margin:0 0 8px 0;">SKU não encontrado</h3>
          <p style="color:var(--clr-text-2);">${result.message || "Nenhum produto encontrado com esse SKU nas plataformas selecionadas."}</p>
        </div>
      `;
      showToast(result.message || "SKU não encontrado.", "warning");
      return;
    }

    // Monta badge das plataformas afetadas
    const platformBadges = selectedPlatforms.map((id) => {
      const cfg  = getPlatformConfig(id);
      const name = cfg ? cfg.name : id;
      return `<span style="
        display:inline-flex; align-items:center;
        background: var(--clr-surface-alt);
        border: 1px solid var(--clr-border);
        border-radius: 999px;
        padding: 3px 10px;
        font-size: 11px;
        font-weight: 600;
        color: var(--clr-text-2);
        margin: 2px;
      ">${_escapeHtml(name)}</span>`;
    }).join("");

    conteudo.innerHTML = `
      <div style="text-align:center; padding: 12px 0 24px;">
        <div style="margin-bottom:12px; display:flex; justify-content:center;"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--clr-success)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div>
        <h3 style="color:var(--clr-success); margin:0 0 20px 0;">Atualização concluída!</h3>
      </div>

      <div class="stat-grid">
        <div class="stat-item">
          <span class="stat-number">${selectedPlatforms.length}</span>
          <span class="stat-label">Plataformas selecionadas</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">${result.productsUpdated}</span>
          <span class="stat-label">Produtos atualizados</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">${result.kitsRecalculated ?? 0}</span>
          <span class="stat-label">Kits recalculados</span>
        </div>
      </div>

      <div style="margin-top:20px;">
        <div style="font-size:12px; color:var(--clr-text-3); margin-bottom:8px; font-weight:600; text-transform:uppercase;">
          Plataformas afetadas:
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:4px;">
          ${platformBadges}
        </div>
      </div>

      <div style="margin-top:16px; text-align:center; font-size:13px; color:var(--clr-text-2);">
        Preços finais, lucros e margens foram recalculados${result.kitsRecalculated > 0 ? ", incluindo os kits" : ""}.
        ${result.compostosAtualizados > 0
          ? `<br>${result.compostosAtualizados === 1 ? "1 produto composto que usa estes itens também foi atualizado" : result.compostosAtualizados + " produtos compostos que usam estes itens também foram atualizados"} (custo, preço, kits e Preços Extras).`
          : ""}
        ${result.custoIgnoradoCompostos > 0
          ? `<br>O Preço de Custo digitado não foi gravado ${result.custoIgnoradoCompostos === 1 ? "em 1 produto composto" : "em " + result.custoIgnoradoCompostos + " produtos compostos"}: o custo de um composto é a soma dos componentes.`
          : ""}
      </div>
    `;

    showToast(
      `${result.productsUpdated} produto(s) atualizado(s)` +
        (result.kitsRecalculated > 0 ? ` e ${result.kitsRecalculated} kit(s) recalculado(s)` : "") +
        (result.compostosAtualizados > 0 ? `; ${result.compostosAtualizados} composto(s) atualizado(s)` : "") +
        `.`,
      "success",
    );

    _renderChips();
  }

  // Aplica máscara de formatação (R$ 1.000,00 / %) aos campos de valor
  function _aplicarMascaraAcoes() {
    document.querySelectorAll(".money-input, .percent-input").forEach((el) => {
      const isMoney = el.classList.contains("money-input");
      el.addEventListener("input", () => {
        el.value = el.value.replace(/[^\d.,]/g, "");
      });
      el.addEventListener("blur", () => {
        if (el.value.trim() === "") return;
        const n = parseFormattedValue(el.value);
        el.value = isMoney ? formatMoneyBR(n) : formatPercentBR(n);
      });
      el.addEventListener("focus", () => {
        const n = parseFormattedValue(el.value);
        el.value = n === 0 ? "" : String(n).replace(".", ",");
      });
    });
  }
  _aplicarMascaraAcoes();

  setTimeout(() => skuInput.focus(), 300);
});

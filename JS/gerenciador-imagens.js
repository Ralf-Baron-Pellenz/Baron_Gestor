/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — gerenciador-imagens.js
   Gerenciar Imagens: todas as imagens salvas no Bapell, num lugar só

   ── ONDE FICA ───────────────────────────────────────────────────────
   Botão "Gerenciar Imagens" no cabeçalho da lista de produtos de cada
   plataforma (plataforma.html), no canto direito. Este arquivo liga o
   botão sozinho (#btnGerenciarImagens) e também expõe
   BapellImagens.abrir() para outras telas.

   ── O QUE FAZ ───────────────────────────────────────────────────────
   Modal grande (cerca de 80% da tela), no tema escolhido (Claro, Padrão
   e Dark), com TODAS as imagens do banco de imagens (ImageStore), de
   todos os produtos e plataformas:
   · busca pelo nome da imagem, pelo nome do produto ou pelo SKU;
   · filtros Todas / Em uso / Sem uso (as que só ocupam espaço);
   · em cada imagem: ampliar, renomear e excluir.
   Mesma grade, mesmos cards e mesmos botões da galeria "Usar imagem já
   anexada" da tela do produto — as classes de CSS são as mesmas.

   ── EXCLUIR ─────────────────────────────────────────────────────────
   Pede confirmação mostrando a miniatura e os produtos que usam a
   imagem. Confirmado, a imagem sai do banco e de todos esses produtos
   (images/_imageIds); se ela era a miniatura da lista (image), a
   próxima imagem do produto assume. A tela avisa com o evento
   "bapell:imagens-alteradas" (a lista de produtos se redesenha).

   Depende de: utils.js (getAllPlatformIds, getProducts, saveProducts,
   getPlatformConfig, showToast) e imagestore.js (ImageStore).
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";
  if (window.BapellImagens) return;

  var ICO_AMPLIAR =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>';
  var ICO_RENOMEAR =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>';
  var ICO_LIXEIRA =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>';
  var ICO_X =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>';

  // ══════════════════════════════════════════
  //  UTILITÁRIOS
  // ══════════════════════════════════════════
  function _esc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function _avisar(msg, tipo) {
    if (typeof showToast === "function") showToast(msg, tipo || "default");
  }

  function _registrarFalha(contexto, err) {
    console.error("[Gerenciar Imagens] " + contexto, err);
    try {
      if (typeof PrecifiqErros !== "undefined") {
        PrecifiqErros.registrar("Gerenciar Imagens: " + contexto, String((err && err.stack) || err));
      }
    } catch (e) {}
  }

  /**
   * Limpa o nome da imagem — a mesma regra da tela do produto: tira o
   * que o sistema de arquivos não aceita e evita nomes que quebram caminho.
   */
  function _sanitizarNome(nome) {
    var n = String(nome || "").trim();
    n = n.replace(/[\\/\\\\:*?"<>|]/g, "-");
    n = n.replace(/[\x00-\x1f\x7f]/g, "");
    n = n.replace(/\s+/g, " ").replace(/\.+$/, "").trim();
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(n)) n = "_" + n;
    if (n.length > 120) n = n.slice(0, 120);
    return n;
  }

  /** Tamanho aproximado de um dataURL base64, em bytes. */
  function _bytesDoDataUrl(dataUrl) {
    var s = String(dataUrl || "");
    var virgula = s.indexOf(",");
    var b64 = virgula >= 0 ? s.slice(virgula + 1) : s;
    var pad = /==$/.test(b64) ? 2 : (/=$/.test(b64) ? 1 : 0);
    return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
  }

  function _formatarBytes(n) {
    if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB";
    if (n >= 1024) return Math.max(1, Math.round(n / 1024)) + " KB";
    return n + " B";
  }

  function _plataformas() {
    try {
      return (typeof getAllPlatformIds === "function" && getAllPlatformIds()) || [];
    } catch (e) {
      return [];
    }
  }

  function _produtosDe(pid) {
    try {
      return (typeof getProductsForReading === "function" ? getProductsForReading(pid) : getProducts(pid)) || [];
    } catch (e) {
      return [];
    }
  }

  function _idsDoProduto(pr) {
    return Array.isArray(pr._imageIds) ? pr._imageIds : (Array.isArray(pr.images) ? pr.images : []);
  }

  /**
   * Onde cada imagem está em uso: { imgId: [{ nome, sku, plataforma }] },
   * pelos produtos salvos de todas as plataformas.
   */
  function _usosDasImagens() {
    var mapa = Object.create(null);
    _plataformas().forEach(function (pid) {
      var cfgP = typeof getPlatformConfig === "function" ? getPlatformConfig(pid) : null;
      var nomePlat = (cfgP && cfgP.name) || pid;
      _produtosDe(pid).forEach(function (pr) {
        if (!pr) return;
        var vistos = Object.create(null); // o mesmo id duas vezes no produto conta uma
        _idsDoProduto(pr).forEach(function (id) {
          if (!id || vistos[id] || !ImageStore.isImageId(id)) return;
          vistos[id] = true;
          (mapa[id] = mapa[id] || []).push({
            nome: pr.name || pr.sku || "Produto sem nome",
            sku: pr.sku || "",
            plataforma: nomePlat,
          });
        });
      });
    });
    return mapa;
  }

  // ══════════════════════════════════════════
  //  JANELAS AUXILIARES (ampliar, renomear, confirmar exclusão)
  // ══════════════════════════════════════════
  /** Abre a imagem em tamanho grande. */
  function _ampliar(item) {
    var fundo = document.createElement("div");
    fundo.className = "galeria-zoom";
    fundo.innerHTML =
      '<div class="galeria-zoom__caixa">' +
        '<img src="' + _esc(item.data) + '" alt="' + _esc(item.nome || "") + '" />' +
        '<div class="galeria-zoom__nome">' + _esc(item.nome || item.produto || "Imagem sem nome") + "</div>" +
      "</div>" +
      '<button type="button" class="galeria-zoom__x" aria-label="Fechar">&times;</button>';
    document.body.appendChild(fundo);

    function fechar() {
      fundo.remove();
      document.removeEventListener("keydown", aoTeclar, true);
    }
    function aoTeclar(e) {
      // Só o Esc fecha, e para aqui: o gerenciador de trás continua aberto.
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(); }
    }
    document.addEventListener("keydown", aoTeclar, true);
    fundo.addEventListener("click", function (e) {
      if (!e.target.closest(".galeria-zoom__caixa")) fechar();
    });
  }

  /** Pergunta o novo nome de uma imagem. Resolve com o nome ou null. */
  function _perguntarNovoNome(item) {
    return new Promise(function (resolve) {
      var atual = item.nome || "";
      var fundo = document.createElement("div");
      // Mesma camada da confirmação de exclusão: um acima do gerenciador.
      fundo.className = "modal-overlay exc-img";
      fundo.setAttribute("role", "dialog");
      fundo.setAttribute("aria-modal", "true");
      fundo.setAttribute("aria-labelledby", "renImgTitulo");
      fundo.innerHTML =
        '<div class="modal exc-img__modal">' +
          '<div class="exc-img__topo">' +
            '<div class="exc-img__icone gerir-img__icone-neutro" aria-hidden="true">' +
              '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>' +
            "</div>" +
            '<h3 id="renImgTitulo">Renomear imagem</h3>' +
          "</div>" +
          '<div class="exc-img__alvo">' +
            '<img src="' + _esc(item.data) + '" alt="" />' +
            '<span class="exc-img__nome">' + _esc(atual || item.produto || "Imagem sem nome") + "</span>" +
          "</div>" +
          '<div class="field-group" style="margin:14px 0 0;">' +
            '<label for="renImgNome">Novo nome</label>' +
            '<input type="text" id="renImgNome" class="input-field" autocomplete="off" maxlength="120" />' +
            '<small class="img-nome-dica">Use o SKU do produto: é o que torna a imagem fácil de achar na busca.</small>' +
          "</div>" +
          '<div class="exc-img__botoes">' +
            '<button type="button" class="btn-secondary" data-acao="cancelar">Cancelar</button>' +
            '<button type="button" class="btn-primary" data-acao="salvar">Salvar nome</button>' +
          "</div>" +
        "</div>";
      document.body.appendChild(fundo);

      var campo = fundo.querySelector("#renImgNome");
      campo.value = atual;

      var respondido = false;
      function responder(valor) {
        if (respondido) return;
        respondido = true;
        document.removeEventListener("keydown", aoTeclar, true);
        fundo.remove();
        resolve(valor);
      }
      function confirmar() {
        var nome = _sanitizarNome(campo.value);
        if (!nome) {
          _avisar("Informe um nome para a imagem.", "warning");
          // Fica vermelho até ser preenchido (utils.js).
          if (window.BapellCampos) {
            window.BapellCampos.marcar(campo, null, {
              resolvido: function () { return !!_sanitizarNome(campo.value); },
            });
            window.BapellCampos.focar(campo);
          } else {
            campo.focus();
          }
          return;
        }
        responder(nome);
      }
      function aoTeclar(e) {
        // Captura: Esc e Enter respondem AQUI e não chegam ao gerenciador.
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          responder(null);
        } else if (e.key === "Enter" && document.activeElement === campo) {
          e.preventDefault();
          e.stopPropagation();
          confirmar();
        }
      }
      document.addEventListener("keydown", aoTeclar, true);
      fundo.addEventListener("mousedown", function (e) { if (e.target === fundo) responder(null); });
      fundo.querySelector('[data-acao="cancelar"]').addEventListener("click", function () { responder(null); });
      fundo.querySelector('[data-acao="salvar"]').addEventListener("click", confirmar);
      setTimeout(function () { try { campo.focus(); campo.select(); } catch (e) {} }, 30);
    });
  }

  /**
   * Confirmação de exclusão: miniatura, nome e os produtos que usam a
   * imagem. O foco começa em "Cancelar" (ação sem volta); Esc e clique
   * fora cancelam sem fechar o gerenciador de trás.
   */
  function _confirmarExclusao(item, usos) {
    return new Promise(function (resolve) {
      var nome = item.nome || item.produto || "Imagem sem nome";
      var nomes = usos.map(function (u) { return u.nome + " (" + u.plataforma + ")"; });
      var lista = nomes.slice(0, 6).map(function (n) { return "<li>" + _esc(n) + "</li>"; }).join("") +
        (nomes.length > 6 ? '<li class="exc-img__mais">… e mais ' + (nomes.length - 6) + "</li>" : "");

      var fundo = document.createElement("div");
      fundo.className = "modal-overlay exc-img";
      fundo.setAttribute("role", "dialog");
      fundo.setAttribute("aria-modal", "true");
      fundo.setAttribute("aria-labelledby", "excImgTitulo");
      fundo.innerHTML =
        '<div class="modal exc-img__modal">' +
          '<div class="exc-img__topo">' +
            '<div class="exc-img__icone" aria-hidden="true">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>' +
            "</div>" +
            '<h3 id="excImgTitulo">Excluir imagem</h3>' +
          "</div>" +
          '<div class="exc-img__alvo">' +
            '<img src="' + _esc(item.data) + '" alt="" />' +
            '<span class="exc-img__nome">' + _esc(nome) + "</span>" +
          "</div>" +
          (usos.length
            ? '<div class="exc-img__aviso">' +
                "<strong>Esta imagem está em " +
                  (usos.length === 1 ? "1 produto" : usos.length + " produtos") + ":</strong>" +
                "<ul>" + lista + "</ul>" +
                "<p>Ao excluir, " + (usos.length === 1 ? "esse produto fica" : "esses produtos ficam") +
                  " sem esta imagem.</p>" +
              "</div>"
            : '<p class="exc-img__livre">Nenhum produto está usando esta imagem.</p>') +
          '<p class="exc-img__final">Esta ação não pode ser desfeita.</p>' +
          '<div class="exc-img__botoes">' +
            '<button type="button" class="btn-secondary" data-acao="cancelar">Cancelar</button>' +
            '<button type="button" class="btn-danger exc-img__excluir" data-acao="excluir">Excluir imagem</button>' +
          "</div>" +
        "</div>";
      document.body.appendChild(fundo);

      var respondido = false;
      function responder(valor) {
        if (respondido) return;
        respondido = true;
        document.removeEventListener("keydown", aoTeclar, true);
        fundo.remove();
        resolve(valor);
      }
      function aoTeclar(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); responder(false); }
      }
      document.addEventListener("keydown", aoTeclar, true);
      fundo.addEventListener("mousedown", function (e) { if (e.target === fundo) responder(false); });
      fundo.querySelector('[data-acao="cancelar"]').addEventListener("click", function () { responder(false); });
      fundo.querySelector('[data-acao="excluir"]').addEventListener("click", function () { responder(true); });
      setTimeout(function () {
        var c = fundo.querySelector('[data-acao="cancelar"]');
        if (c) try { c.focus(); } catch (e) {}
      }, 30);
    });
  }

  // ══════════════════════════════════════════
  //  EXCLUIR DE VEZ
  // ══════════════════════════════════════════
  /**
   * Tira a imagem de todos os produtos salvos, em todas as plataformas:
   * o id sai de `images` e `_imageIds`; se ela era a miniatura da lista
   * (`image`, cópia do base64 da 1ª imagem), a próxima assume o lugar.
   * @returns {Promise<string[]>} as plataformas que mudaram
   */
  async function _tirarDosProdutos(imgId, dataRemovida) {
    var mudaram = [];
    if (!imgId || typeof saveProducts !== "function" || typeof getProducts !== "function") return mudaram;

    var plataformas = _plataformas();
    for (var p = 0; p < plataformas.length; p++) {
      var pid = plataformas[p];
      var lista;
      try { lista = getProducts(pid) || []; } catch (e) { continue; }
      var mudou = false;

      for (var i = 0; i < lista.length; i++) {
        var pr = lista[i];
        if (!pr) continue;
        var noIds = Array.isArray(pr._imageIds) && pr._imageIds.indexOf(imgId) >= 0;
        var noImages = Array.isArray(pr.images) && pr.images.indexOf(imgId) >= 0;
        if (!noIds && !noImages) continue;

        if (Array.isArray(pr._imageIds)) pr._imageIds = pr._imageIds.filter(function (x) { return x !== imgId; });
        if (Array.isArray(pr.images)) pr.images = pr.images.filter(function (x) { return x !== imgId; });

        if (dataRemovida && pr.image === dataRemovida) {
          var restantes = Array.isArray(pr._imageIds) ? pr._imageIds : (pr.images || []);
          var proxima = restantes.find(function (x) { return ImageStore.isImageId(x); });
          var base64 = "";
          if (proxima) {
            try { base64 = (await ImageStore.get(proxima)) || ""; } catch (e) { base64 = ""; }
          }
          pr.image = base64;
        }
        mudou = true;
      }

      if (mudou) {
        try {
          await saveProducts(pid, lista);
          mudaram.push(pid);
        } catch (e) {
          _registrarFalha("falha ao atualizar os produtos de " + pid, e);
        }
      }
    }
    return mudaram;
  }

  /** Confirma e exclui. @returns {Promise<boolean>} true se excluiu */
  async function _excluir(item) {
    var confirmado = await _confirmarExclusao(item, item.usos || []);
    if (!confirmado) return false;

    try {
      await ImageStore.remove(item.id);
    } catch (e) {
      _registrarFalha("falha ao excluir", e);
      _avisar("Não foi possível excluir a imagem.", "error");
      return false;
    }

    // A imagem já saiu do banco. Tirar a referência dos produtos não pode
    // transformar a exclusão em erro: no pior caso, o produto se ajusta
    // sozinho na próxima vez que for aberto (o carregamento ignora ids
    // que não existem mais).
    var plataformas = [];
    try {
      plataformas = await _tirarDosProdutos(item.id, item.data);
    } catch (e) {
      _registrarFalha("falha ao tirar a imagem excluída dos produtos", e);
    }
    try {
      document.dispatchEvent(new CustomEvent("bapell:imagens-alteradas", {
        detail: { excluida: item.id, plataformas: plataformas },
      }));
    } catch (e) {}
    _avisar("Imagem excluída.", "success");
    return true;
  }

  // ══════════════════════════════════════════
  //  O GERENCIADOR
  // ══════════════════════════════════════════
  async function abrir() {
    if (document.getElementById("modalGerirImg")) return;
    if (typeof ImageStore === "undefined") {
      _avisar("O banco de imagens não está disponível nesta tela.", "error");
      return;
    }
    var focoAntes = document.activeElement;

    var overlay = document.createElement("div");
    // Classes do app: o tema (Claro, Padrão e Dark) vem junto, sem cor fixa.
    overlay.className = "modal-overlay gerir-img";
    overlay.id = "modalGerirImg";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "gerirImgTitulo");
    overlay.innerHTML =
      '<div class="modal galeria-img-modal gerir-img-modal">' +
        '<div class="gerir-img-topo">' +
          "<div>" +
            '<div class="modal-title" id="gerirImgTitulo">Gerenciar Imagens</div>' +
            '<div class="modal-subtitle gerir-img-resumo" id="gerirImgResumo">Carregando imagens…</div>' +
          "</div>" +
          '<button type="button" class="gerir-img-x" id="gerirImgX" title="Fechar" aria-label="Fechar">' + ICO_X + "</button>" +
        "</div>" +
        '<div class="gerir-img-barra">' +
          '<input type="text" id="gerirImgBusca" class="input-field" ' +
            'placeholder="Buscar pelo nome da imagem, produto ou SKU…" autocomplete="off" />' +
          '<div class="gerir-img-filtros" role="group" aria-label="Filtrar imagens">' +
            '<button type="button" class="gerir-img-filtro ativo" data-filtro="todas" aria-pressed="true">Todas <span>0</span></button>' +
            '<button type="button" class="gerir-img-filtro" data-filtro="em-uso" aria-pressed="false">Em uso <span>0</span></button>' +
            '<button type="button" class="gerir-img-filtro" data-filtro="sem-uso" aria-pressed="false">Sem uso <span>0</span></button>' +
          "</div>" +
        "</div>" +
        '<div class="galeria-img-grid gerir-img-grid" id="gerirImgGrid">' +
          '<p class="galeria-img-vazio">Carregando imagens…</p>' +
        "</div>" +
        '<div class="gerir-img-rodape">' +
          '<span class="gerir-img-dica">Clique numa imagem para ampliar. Uma imagem anexada agora aparece aqui depois que o produto é salvo.</span>' +
          '<button type="button" class="btn-secondary" id="gerirImgFechar">Fechar</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(overlay);

    var grid = overlay.querySelector("#gerirImgGrid");
    var busca = overlay.querySelector("#gerirImgBusca");
    var resumo = overlay.querySelector("#gerirImgResumo");
    var filtros = Array.prototype.slice.call(overlay.querySelectorAll(".gerir-img-filtro"));
    var filtro = "todas";
    var itens = [];

    function fechar() {
      document.removeEventListener("keydown", aoTeclar);
      overlay.remove();
      try { if (focoAntes && focoAntes.isConnected) focoAntes.focus({ preventScroll: true }); } catch (e) {}
    }
    function aoTeclar(e) {
      // As janelas por cima (ampliar, renomear, excluir) respondem ao Esc
      // na captura e param o evento: ele só chega aqui sem nenhuma delas.
      if (e.key === "Escape" && document.getElementById("modalGerirImg")) fechar();
    }
    document.addEventListener("keydown", aoTeclar);
    overlay.querySelector("#gerirImgX").addEventListener("click", fechar);
    overlay.querySelector("#gerirImgFechar").addEventListener("click", fechar);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) fechar(); });

    // Os produtos precisam estar carregados: sem eles, toda imagem pareceria
    // "sem uso" — e alguém poderia excluir uma que está num produto.
    try {
      if (typeof initStorage === "function") await initStorage();
    } catch (err) {
      _registrarFalha("falha ao carregar os produtos", err);
    }

    var todas = [];
    try {
      todas = (await ImageStore.listar()) || [];
    } catch (err) {
      _registrarFalha("falha ao listar", err);
      resumo.textContent = "Não foi possível carregar as imagens.";
      grid.innerHTML = '<p class="galeria-img-vazio">Não foi possível carregar as imagens.</p>';
      return;
    }
    if (!document.getElementById("modalGerirImg")) return; // fechou enquanto carregava

    var usos = _usosDasImagens();
    itens = todas.map(function (im) {
      var lista = usos[im.id] || [];
      var primeiro = lista[0] || {};
      return {
        id: im.id,
        data: im.data,
        nome: im.nome || "",
        // Identifica imagens sem nome pelo primeiro produto que as usa.
        produto: primeiro.nome || "",
        sku: primeiro.sku || "",
        usos: lista,
        bytes: _bytesDoDataUrl(im.data),
      };
    });
    // Mais recentes primeiro: o id começa pelo carimbo de tempo.
    itens.sort(function (a, b) { return a.id < b.id ? 1 : (a.id > b.id ? -1 : 0); });

    function textoDeBusca(i) {
      return [i.nome].concat(i.usos.map(function (u) { return u.nome + " " + u.sku; })).join(" ").toLowerCase();
    }

    function acharItem(id) { return itens.find(function (x) { return x.id === id; }); }

    function render(q) {
      var termo = String(q == null ? busca.value : q).trim().toLowerCase();
      var emUso = itens.filter(function (i) { return i.usos.length > 0; }).length;
      var contagem = { "todas": itens.length, "em-uso": emUso, "sem-uso": itens.length - emUso };
      filtros.forEach(function (b) {
        var f = b.dataset.filtro;
        b.querySelector("span").textContent = contagem[f];
        b.classList.toggle("ativo", f === filtro);
        b.setAttribute("aria-pressed", f === filtro ? "true" : "false");
      });

      var totalBytes = itens.reduce(function (s, i) { return s + i.bytes; }, 0);
      resumo.textContent = itens.length
        ? (itens.length === 1 ? "1 imagem" : itens.length + " imagens") +
          " salvas no Bapell · " + _formatarBytes(totalBytes) +
          (contagem["sem-uso"] ? " · " + contagem["sem-uso"] + " sem uso" : "")
        : "Nenhuma imagem salva no Bapell.";

      if (!itens.length) {
        grid.innerHTML = '<p class="galeria-img-vazio">Nenhuma imagem salva ainda. ' +
          "As imagens anexadas aos produtos aparecem aqui.</p>";
        return;
      }

      var lista = itens;
      if (filtro === "em-uso") lista = lista.filter(function (i) { return i.usos.length > 0; });
      else if (filtro === "sem-uso") lista = lista.filter(function (i) { return !i.usos.length; });
      if (termo) lista = lista.filter(function (i) { return textoDeBusca(i).indexOf(termo) >= 0; });

      if (!lista.length) {
        var msg;
        if (termo) msg = "Nenhuma imagem encontrada para “" + _esc(q == null ? busca.value : q) + "”.";
        else if (filtro === "sem-uso") msg = "Todas as imagens estão em uso em algum produto.";
        else msg = "Nenhuma imagem está em uso nos produtos.";
        grid.innerHTML = '<p class="galeria-img-vazio">' + msg + "</p>";
        return;
      }

      grid.innerHTML = lista.map(function (i) {
        var titulo = i.nome || i.produto || "Imagem sem nome";
        var uso;
        if (!i.usos.length) uso = "Sem uso";
        else if (i.usos.length === 1) uso = i.usos[0].nome;
        else uso = "Em " + i.usos.length + " produtos";
        var ondeUsa = i.usos.slice(0, 8).map(function (u) { return u.nome + " (" + u.plataforma + ")"; });
        var dica = titulo + " · " + _formatarBytes(i.bytes) + "\n" +
          (i.usos.length
            ? "Em uso em: " + ondeUsa.join(", ") + (i.usos.length > 8 ? " e mais " + (i.usos.length - 8) : "")
            : "Não está em nenhum produto.");
        return '<div class="galeria-img-card gerir-img-card" data-id="' + _esc(i.id) + '" ' +
            'role="button" tabindex="0" title="' + _esc(dica) + '">' +
            '<span class="galeria-img-thumb">' +
              '<img src="' + _esc(i.data) + '" alt="" loading="lazy" ' +
                "onerror=\"this.style.display='none'\" />" +
              '<span class="galeria-img-acoes">' +
                '<button type="button" class="galeria-img-acao" data-ampliar="' + _esc(i.id) + '" ' +
                  'title="Ampliar" aria-label="Ampliar imagem">' + ICO_AMPLIAR + "</button>" +
                '<button type="button" class="galeria-img-acao" data-renomear="' + _esc(i.id) + '" ' +
                  'title="Renomear" aria-label="Renomear imagem">' + ICO_RENOMEAR + "</button>" +
                '<button type="button" class="galeria-img-acao galeria-img-acao--del" data-excluir="' + _esc(i.id) + '" ' +
                  'title="Excluir do Bapell" aria-label="Excluir imagem">' + ICO_LIXEIRA + "</button>" +
              "</span>" +
            "</span>" +
            '<span class="galeria-img-nome">' + _esc(titulo) + "</span>" +
            '<span class="galeria-img-sub gerir-img-uso' + (i.usos.length ? "" : " gerir-img-uso--livre") + '">' +
              _esc(uso) + "</span>" +
          "</div>";
      }).join("");

      grid.querySelectorAll(".gerir-img-card").forEach(function (card) {
        card.addEventListener("click", function (e) {
          if (e.target.closest(".galeria-img-acao")) return;
          var item = acharItem(card.dataset.id);
          if (item) _ampliar(item);
        });
        card.addEventListener("keydown", function (e) {
          if (e.target !== card) return;
          var item = acharItem(card.dataset.id);
          if (!item) return;
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); _ampliar(item); }
          else if (e.key === "Delete") { e.preventDefault(); excluir(item); }
        });
      });
      grid.querySelectorAll("[data-ampliar]").forEach(function (b) {
        b.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var item = acharItem(b.dataset.ampliar);
          if (item) _ampliar(item);
        });
      });
      grid.querySelectorAll("[data-renomear]").forEach(function (b) {
        b.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var item = acharItem(b.dataset.renomear);
          if (item) renomear(item);
        });
      });
      grid.querySelectorAll("[data-excluir]").forEach(function (b) {
        b.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var item = acharItem(b.dataset.excluir);
          if (item) excluir(item);
        });
      });
    }

    async function renomear(item) {
      var novo = await _perguntarNovoNome(item);
      if (!novo || novo === item.nome) return;
      try {
        var ok = await ImageStore.setNome(item.id, novo);
        if (!ok) throw new Error("imagem não encontrada");
      } catch (e) {
        _registrarFalha("falha ao renomear", e);
        _avisar("Não foi possível renomear a imagem.", "error");
        return;
      }
      item.nome = novo;
      render(busca.value);
      _avisar("Nome da imagem atualizado.", "success");
    }

    async function excluir(item) {
      var excluiu = await _excluir(item);
      if (!excluiu) return;
      var pos = itens.indexOf(item);
      if (pos >= 0) itens.splice(pos, 1);
      if (!document.getElementById("modalGerirImg")) return;
      render(busca.value);
      if (!overlay.contains(document.activeElement)) {
        var primeiro = grid.querySelector(".gerir-img-card");
        try { (primeiro || busca).focus({ preventScroll: true }); } catch (e) {}
      }
    }

    filtros.forEach(function (b) {
      b.addEventListener("click", function () {
        filtro = b.dataset.filtro;
        render(busca.value);
      });
    });
    var t;
    busca.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () { render(busca.value); }, 120);
    });

    render("");
    setTimeout(function () { try { busca.focus(); } catch (e) {} }, 60);
  }

  window.BapellImagens = { abrir: abrir };

  // Liga o botão da tela (cabeçalho da lista de produtos).
  function _ligarBotao() {
    var btn = document.getElementById("btnGerenciarImagens");
    if (!btn || btn.getAttribute("data-ligado") === "1") return;
    btn.setAttribute("data-ligado", "1");
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      abrir();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", _ligarBotao, { once: true });
  else _ligarBotao();
})();

/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — tutorial_core.js
   Controlador central dos tutoriais interativos (tour guiado)

   Cada tela tem o seu arquivo (tutorial_index.js, tutorial_produto.js…)
   que só DESCREVE os passos e chama BapellTutorial.registrar(). Toda a
   mecânica vive aqui, num lugar só:
     • escurece a tela e destaca apenas o elemento do passo atual;
     • posiciona a caixa de explicação ao lado dele (com seta);
     • rola a página até o elemento, com animação suave;
     • bloqueia cliques, teclado e rolagem no resto da tela;
     • salva o progresso e só inicia sozinho na primeira vez.

   O tutorial NÃO mexe na lógica das telas:
     • não chama funções da página, não dispara cliques, não grava dados
       da página — só lê o DOM para saber onde cada coisa está;
     • quando um passo precisa mostrar uma área que está escondida (a
       "vitrine"), o estilo original é guardado e devolvido exatamente
       como estava ao sair do passo.

   Progresso (localStorage), uma chave por tutorial:
     precifiq_tutorial_<id> = {"estado":"concluido"|"pulado","em":<ms>}
   É uma chave por tutorial, e não um objeto único, porque cada aba do
   app tem a sua cópia do armazenamento: com um objeto só, duas abas
   gravando em momentos diferentes apagariam o progresso uma da outra.

   Reiniciar: a Central de Ajuda abre a tela com ?tutorial=1. O parâmetro
   é retirado da barra de endereço logo que lido, para não ficar salvo
   numa aba fixada nem reabrir o tutorial ao recarregar.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  // Carregado duas vezes na mesma tela: a primeira cópia vale.
  if (window.BapellTutorial) return;

  // ══════════════════════════════════════════
  //  CONSTANTES
  // ══════════════════════════════════════════
  var PREFIXO = "precifiq_tutorial_";
  var PARAM = "tutorial";

  var ESPERA_INICIAL = 650; // respiro depois que a tela monta
  var LIMITE_PRONTO = 6000; // espera máxima pelo "pronto" da tela
  var MARGEM = 14; // distância mínima entre a caixa e a borda da janela
  var DISTANCIA = 16; // distância entre o destaque e a caixa
  var DUR_FOCO = 420; // igual à transição do .btu-foco no CSS
  var DUR_SAIDA = 150; // fade-out da caixa entre um passo e outro

  // Faixas fixas que cobrem a página (o destaque não deve ficar embaixo
  // delas e a rolagem precisa compensar a altura).
  var FAIXAS_TOPO = [".main-header"];
  var FAIXAS_BASE = [".stats-bar", ".action-bar", "#empresaSaveBar"];

  // Janelas do sistema: com alguma aberta, o tutorial espera ela fechar.
  var SELETOR_JANELAS = [
    ".modal-overlay",
    ".rv-modal",
    ".mass-modal",
    ".mass-result-modal",
    ".lem-modal-overlay",
    ".vi-modal",
    ".calc-modal-overlay",
    ".galeria-zoom",
    ".om-modal",
    "[aria-modal='true']",
  ].join(",");

  // Avisos da licença: têm prioridade sobre o tutorial.
  var SELETOR_LICENCA = ".lic-modulo-modal, .lic-modal-overlay";
  var SELETOR_BLOQUEIO = ".lic-tela-bloqueada";

  var reduzirMovimento = false;
  try {
    reduzirMovimento = !!(
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch (e) {}

  // ══════════════════════════════════════════
  //  ÍCONES (mesmo traço dos ícones do menu)
  // ══════════════════════════════════════════
  function svg(corpo, tam) {
    tam = tam || 18;
    return (
      '<svg width="' + tam + '" height="' + tam + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true" focusable="false">' + corpo + "</svg>"
    );
  }

  var ICONES = {
    index:
      '<rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect>' +
      '<rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect>',
    plataforma:
      '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line>' +
      '<path d="M16 10a4 4 0 0 1-8 0"></path>',
    produto:
      '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>' +
      '<polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>',
    "acoes-massa":
      '<path d="M16 3l4 4-4 4"></path><path d="M20 7H4"></path><path d="M8 21l-4-4 4-4"></path><path d="M4 17h16"></path>',
    "registro-vendas":
      '<circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>' +
      '<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>',
    vendas: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line>',
    devolucoes: '<polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>',
    empresa:
      '<rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><path d="M9 22v-4h6v4"></path>' +
      '<path d="M8 6h.01"></path><path d="M16 6h.01"></path><path d="M8 10h.01"></path><path d="M16 10h.01"></path>' +
      '<path d="M8 14h.01"></path><path d="M16 14h.01"></path>',
    financeiro:
      '<circle cx="12" cy="12" r="10"></circle><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path><path d="M12 18V6"></path>',
    processador:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline>' +
      '<line x1="12" y1="3" x2="12" y2="15"></line>',
    calculos:
      '<rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="8" y1="6" x2="16" y2="6"></line>' +
      '<line x1="16" y1="10" x2="16.01" y2="10"></line><line x1="12" y1="10" x2="12.01" y2="10"></line>' +
      '<line x1="8" y1="10" x2="8.01" y2="10"></line><line x1="16" y1="14" x2="16.01" y2="14"></line>' +
      '<line x1="12" y1="14" x2="12.01" y2="14"></line><line x1="8" y1="14" x2="8.01" y2="14"></line>' +
      '<line x1="16" y1="18" x2="16.01" y2="18"></line><line x1="12" y1="18" x2="12.01" y2="18"></line>' +
      '<line x1="8" y1="18" x2="8.01" y2="18"></line>',
    ean:
      '<path d="M3 5v14"></path><path d="M6 5v14"></path><path d="M10 5v14"></path><path d="M14 5v14"></path>' +
      '<path d="M17 5v14"></path><path d="M21 5v14"></path>',
    lembretes: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>',
    nf:
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>' +
      '<line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line>',
    ok: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
    guia: '<circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>',
    ajuda: '<circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line>',
    seta: '<polyline points="9 18 15 12 9 6"></polyline>',
    check: '<polyline points="20 6 9 17 4 12"></polyline>',
    refazer: '<polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>',
    play: '<polygon points="6 4 19 12 6 20 6 4"></polygon>',
  };

  function icone(nome, tam) {
    return svg(ICONES[nome] || ICONES.guia, tam);
  }

  // ══════════════════════════════════════════
  //  CATÁLOGO (a lista que aparece na Central de Ajuda)
  //  plataforma: a tela precisa de ?p=<id>; "ml" prefere Mercado Livre.
  // ══════════════════════════════════════════
  var CATALOGO = [
    { id: "index", nome: "Painel inicial", pagina: "index.html",
      desc: "Plataformas, módulos do menu, lojas ocultas e tema." },
    { id: "plataforma", nome: "Plataforma", pagina: "plataforma.html", plataforma: "qualquer",
      desc: "Lista de produtos: busca, filtros, kits e opções em massa." },
    { id: "produto", nome: "Produto", pagina: "produto.html", plataforma: "ml", extra: "new=1",
      desc: "Custo, taxas, margem, preço final, kits e preços extras." },
    { id: "acoes-massa", nome: "Ações em Massa", pagina: "acoes-massa.html",
      desc: "Atualize custo, taxas e margem de vários produtos e lojas." },
    { id: "registro-vendas", nome: "Registro de Vendas", pagina: "registro-vendas.html",
      desc: "Clientes, pedidos, filtros e histórico de vendas." },
    { id: "devolucoes", nome: "Gestor de Devoluções", pagina: "devolucoes.html",
      desc: "Devoluções, reembolsos, prejuízo e lançamento no financeiro." },
    { id: "vendas", nome: "Informações de Venda", pagina: "vendas.html",
      desc: "Parcelamento, descontos e logística da operação." },
    { id: "empresa", nome: "Dados da Empresa", pagina: "empresa.html",
      desc: "Cadastro, impostos, sócios, documentos, usuários e senhas." },
    { id: "usuarios", nome: "Usuários e Senhas", pagina: "usuarios.html",
      desc: "Os responsáveis dos lançamentos e as senhas de acesso." },
    { id: "financeiro", nome: "Controle Financeiro", pagina: "financeiro.html",
      desc: "DRE, indicadores, lançamentos, empresas e exportações." },
    { id: "processador", nome: "Processador de Planilhas", pagina: "vendas-import.html",
      desc: "Da planilha da plataforma ao relatório por SKU." },
    { id: "calculos", nome: "Central de Cálculos", pagina: "calculos.html",
      desc: "Categorias, busca, favoritos, histórico e calculadoras." },
    { id: "ean", nome: "Gerador de EAN", pagina: "ean.html",
      desc: "Códigos de barras únicos por empresa e SKU." },
    { id: "lembretes", nome: "Lembretes", pagina: "lembretes.html",
      desc: "Avisos com data e hora, com uma janela de aviso na hora certa." },
    { id: "nf", nome: "Notas Fiscais", pagina: "nf.html",
      desc: "Guarde, organize e encontre as notas de cada empresa." },
  ];

  // ══════════════════════════════════════════
  //  UTILITÁRIOS
  // ══════════════════════════════════════════
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function limitar(v, min, max) {
    if (max < min) return min;
    return Math.min(Math.max(v, min), max);
  }

  function registrarFalha(msg, e) {
    try {
      var detalhe = e && e.stack ? e.stack : String(e || "");
      if (window.PrecifiqErros && typeof window.PrecifiqErros.registrar === "function") {
        window.PrecifiqErros.registrar("Tutorial: " + msg, detalhe);
      } else if (window.console) {
        console.warn("[Tutorial] " + msg, e || "");
      }
    } catch (x) {}
  }

  function avisar(msg, tipo) {
    try {
      if (typeof window.showToast === "function") window.showToast(msg, tipo || "default", 4200);
    } catch (e) {}
  }

  // ══════════════════════════════════════════
  //  PROGRESSO
  // ══════════════════════════════════════════
  function lerEstado(id) {
    try {
      var bruto = localStorage.getItem(PREFIXO + id);
      if (!bruto) return null;
      var o = JSON.parse(bruto);
      if (o && (o.estado === "concluido" || o.estado === "pulado")) return o;
      return null;
    } catch (e) {
      return null;
    }
  }

  function gravarEstado(id, estado) {
    if (!id || (estado !== "concluido" && estado !== "pulado")) return;
    try {
      localStorage.setItem(PREFIXO + id, JSON.stringify({ estado: estado, em: Date.now() }));
    } catch (e) {
      registrarFalha("não foi possível salvar o progresso de " + id, e);
    }
  }

  function apagarEstado(id) {
    try {
      localStorage.removeItem(PREFIXO + id);
    } catch (e) {}
  }

  // ══════════════════════════════════════════
  //  PEDIDO VINDO DA CENTRAL DE AJUDA (?tutorial=1)
  //  Lido e retirado da URL já na carga do script.
  // ══════════════════════════════════════════
  var pedidoPelaUrl = false;
  (function lerPedido() {
    try {
      var busca = window.location.search || "";
      if (busca.length < 2) return;
      var resto = [];
      busca
        .slice(1)
        .split("&")
        .forEach(function (parte) {
          if (!parte) return;
          var nome = parte.split("=")[0];
          try {
            nome = decodeURIComponent(nome);
          } catch (e) {}
          if (nome === PARAM) pedidoPelaUrl = true;
          else resto.push(parte);
        });
      if (!pedidoPelaUrl) return;
      var nova = window.location.pathname + (resto.length ? "?" + resto.join("&") : "") + window.location.hash;
      try {
        history.replaceState(history.state, document.title, nova);
      } catch (e) {}
    } catch (e) {}
  })();

  // ══════════════════════════════════════════
  //  DOM: visibilidade, alvos e retângulos
  // ══════════════════════════════════════════
  var ativo = null; // o tour em andamento (um por vez)

  function dentroDoTour(el) {
    return !!(el && el.closest && el.closest(".btu-raiz"));
  }

  function visivel(el) {
    if (!el || el.nodeType !== 1 || !el.isConnected) return false;
    if (!el.getClientRects().length) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) return false;
    var cs = window.getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.visibility !== "collapse";
  }

  function primeiroVisivel(sel) {
    var lista;
    try {
      lista = document.querySelectorAll(sel);
    } catch (e) {
      return null;
    }
    for (var i = 0; i < lista.length; i++) {
      if (!dentroDoTour(lista[i]) && visivel(lista[i])) return lista[i];
    }
    return null;
  }

  /**
   * Resolve o "alvo" de um passo em uma lista de elementos visíveis.
   *   "seletor"             → o primeiro elemento visível
   *   Element               → ele mesmo, se visível
   *   ["a", "b", fn]        → alternativas: a primeira que existir
   *   [el1, el2] (Elements) → união: o destaque abraça todos
   *   function              → chamada na hora; o retorno é resolvido
   */
  function resolver(alvo, prof) {
    prof = prof || 0;
    if (alvo == null || prof > 5) return null;
    if (typeof alvo === "function") {
      var r;
      try {
        r = alvo();
      } catch (e) {
        registrarFalha("alvo de passo falhou", e);
        return null;
      }
      return resolver(r, prof + 1);
    }
    if (typeof alvo === "string") {
      var el = primeiroVisivel(alvo);
      return el ? [el] : null;
    }
    if (alvo.nodeType === 1) {
      return visivel(alvo) && !dentroDoTour(alvo) ? [alvo] : null;
    }
    if (typeof alvo.length === "number") {
      var arr = Array.prototype.slice.call(alvo);
      if (!arr.length) return null;
      var soElementos = arr.every(function (x) {
        return x && x.nodeType === 1;
      });
      if (soElementos) {
        var vis = arr.filter(function (x) {
          return visivel(x) && !dentroDoTour(x);
        });
        return vis.length ? vis : null;
      }
      for (var i = 0; i < arr.length; i++) {
        var achou = resolver(arr[i], prof + 1);
        if (achou) return achou;
      }
    }
    return null;
  }

  // Existe no DOM, mesmo escondido? (usado para passos com vitrine)
  function existeNoDom(alvo) {
    if (alvo == null) return false;
    if (typeof alvo === "function") return true; // só dá para saber na hora
    if (typeof alvo === "string") {
      try {
        return !!document.querySelector(alvo);
      } catch (e) {
        return false;
      }
    }
    if (alvo.nodeType === 1) return alvo.isConnected;
    if (typeof alvo.length === "number") {
      for (var i = 0; i < alvo.length; i++) if (existeNoDom(alvo[i])) return true;
    }
    return false;
  }

  function retanguloDe(els) {
    var t = Infinity, l = Infinity, b = -Infinity, d = -Infinity;
    for (var i = 0; i < els.length; i++) {
      if (!els[i] || !els[i].isConnected) continue;
      var r = els[i].getBoundingClientRect();
      if (r.width < 1 && r.height < 1) continue;
      t = Math.min(t, r.top);
      l = Math.min(l, r.left);
      b = Math.max(b, r.bottom);
      d = Math.max(d, r.right);
    }
    if (t === Infinity) return null;
    return { top: t, left: l, bottom: b, right: d, width: d - l, height: b - t };
  }

  function posicaoFixa(el) {
    var p = window.getComputedStyle(el).position;
    return p === "fixed" || p === "sticky";
  }

  function contem(pai, els) {
    return els.some(function (e) {
      return pai === e || pai.contains(e);
    });
  }

  // Faixas fixas da janela: cabeçalho no topo, barras de ação na base.
  // Guardadas como retângulos porque uma faixa só conta para o alvo que
  // ela cobre de fato — a barra de painéis do dashboard, por exemplo, não
  // passa por baixo do menu lateral.
  function medirFaixas() {
    var H = window.innerHeight;
    var topo = [], base = [];
    FAIXAS_TOPO.forEach(function (sel) {
      var lista = document.querySelectorAll(sel);
      for (var i = 0; i < lista.length; i++) {
        var el = lista[i];
        if (!visivel(el) || !posicaoFixa(el)) continue;
        var r = el.getBoundingClientRect();
        if (r.top <= 2 && r.bottom < H * 0.4) topo.push({ el: el, left: r.left, right: r.right, borda: r.bottom });
      }
    });
    FAIXAS_BASE.forEach(function (sel) {
      var lista = document.querySelectorAll(sel);
      for (var i = 0; i < lista.length; i++) {
        var el = lista[i];
        if (!visivel(el) || !posicaoFixa(el)) continue;
        var r = el.getBoundingClientRect();
        if (r.top > H * 0.55 && r.bottom >= H - 48) base.push({ el: el, left: r.left, right: r.right, borda: r.top });
      }
    });
    return { topo: topo, base: base };
  }

  // Quanto as faixas fixas cobrem, no topo e na base, a coluna do alvo.
  function faixasSobre(r, els) {
    var H = window.innerHeight;
    var f = (ativo && ativo.faixas) || medirFaixas();
    var topo = 0, base = 0;
    f.topo.forEach(function (b) {
      if (contem(b.el, els) || b.right <= r.left || b.left >= r.right) return;
      topo = Math.max(topo, b.borda);
    });
    f.base.forEach(function (b) {
      if (contem(b.el, els) || b.right <= r.left || b.left >= r.right) return;
      base = Math.max(base, H - b.borda);
    });
    return { topo: topo, base: base };
  }

  // Contêineres com rolagem própria entre o alvo e a janela (ex.: o menu lateral).
  function containeresDeRolagem(el) {
    var lista = [];
    var p = el ? el.parentElement : null;
    while (p && p !== document.body && p !== document.documentElement) {
      var cs = window.getComputedStyle(p);
      var rolaY = /(auto|scroll|overlay)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1;
      var rolaX = /(auto|scroll|overlay)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 1;
      if (rolaY || rolaX) lista.push(p);
      p = p.parentElement;
    }
    return lista;
  }

  // Faixas "grudadas" (position: sticky) dentro de um contêiner com rolagem,
  // como o rodapé do menu lateral (Ajuda / Recolher menu).
  function grudadasDe(c, els) {
    var topo = 0, base = 0;
    for (var i = 0; i < c.children.length; i++) {
      var filho = c.children[i];
      if (contem(filho, els)) continue;
      var cs = window.getComputedStyle(filho);
      if (cs.position !== "sticky" || cs.display === "none") continue;
      var h = filho.getBoundingClientRect().height;
      if (cs.bottom !== "auto") base += h;
      else if (cs.top !== "auto") topo += h;
    }
    return { topo: topo, base: base };
  }

  function containeresDoAlvo(els) {
    if (ativo && ativo.contsDe === els[0] && ativo.conts) return ativo.conts;
    var lista = containeresDeRolagem(els[0]).map(function (c) {
      var g = grudadasDe(c, els);
      return { el: c, topo: g.topo, base: g.base };
    });
    if (ativo) {
      ativo.contsDe = els[0];
      ativo.conts = lista;
    }
    return lista;
  }

  // Área da janela em que o alvo aparece de fato: sem as faixas fixas que o
  // cobrem e dentro dos contêineres com rolagem em que ele está.
  function areaLivre(els) {
    var W = window.innerWidth, H = window.innerHeight;
    var r = retanguloDe(els) || { left: 0, right: W };
    var f = faixasSobre(r, els);
    var a = { top: f.topo, left: 0, bottom: H - f.base, right: W, faixas: f };
    containeresDoAlvo(els).forEach(function (c) {
      var rc = c.el.getBoundingClientRect();
      var topo = rc.top + c.el.clientTop;
      var esq = rc.left + c.el.clientLeft;
      a.top = Math.max(a.top, topo + c.topo);
      a.bottom = Math.min(a.bottom, topo + c.el.clientHeight - c.base);
      a.left = Math.max(a.left, esq);
      a.right = Math.min(a.right, esq + c.el.clientWidth);
    });
    return a;
  }

  // Retângulo do destaque: o alvo + respiro, recortado pela área livre
  // (senão o "buraco" mostraria parte do cabeçalho ou de um rodapé fixo
  // por cima do alvo).
  function areaDoFoco(els, passo) {
    var r = retanguloDe(els);
    if (!r) return null;
    var pad = passo && typeof passo.espaco === "number" ? passo.espaco : 8;
    var W = window.innerWidth, H = window.innerHeight;
    var a = areaLivre(els);

    var top = Math.max(r.top - pad, a.top + 3, 3);
    var left = Math.max(r.left - pad, a.left + 1, 3);
    var right = Math.min(r.right + pad, a.right - 1, W - 3);
    var bottom = Math.min(r.bottom + pad, a.bottom - 3, H - 3);

    // Alvo encoberto (ex.: rolagem que não chegou): não recorta, para o
    // destaque não virar uma linha.
    if (bottom - top < 12 || right - left < 12) {
      top = r.top - pad;
      left = r.left - pad;
      right = r.right + pad;
      bottom = r.bottom + pad;
    }
    return { top: top, left: left, width: right - left, height: bottom - top };
  }

  function raioDe(els, passo) {
    if (passo && typeof passo.raio === "number") return passo.raio;
    var pad = passo && typeof passo.espaco === "number" ? passo.espaco : 8;
    if (els.length !== 1) return 14;
    var cs = window.getComputedStyle(els[0]);
    var bruto = cs.borderTopLeftRadius || "0";
    var raio = parseFloat(bruto) || 0;
    if (/%$/.test(bruto)) {
      var rr = els[0].getBoundingClientRect();
      raio = (Math.min(rr.width, rr.height) * raio) / 100;
    }
    return limitar(raio + pad * 0.6, 8, 24);
  }

  function diferente(a, b) {
    if (!a || !b) return true;
    return (
      Math.abs(a.top - b.top) > 0.5 ||
      Math.abs(a.left - b.left) > 0.5 ||
      Math.abs(a.width - b.width) > 0.5 ||
      Math.abs(a.height - b.height) > 0.5
    );
  }

  // Alguma janela do sistema aberta? (o tutorial espera)
  function janelaAberta() {
    if (document.querySelector(SELETOR_LICENCA)) return true;
    var lista;
    try {
      lista = document.querySelectorAll(SELETOR_JANELAS);
    } catch (e) {
      return false;
    }
    for (var i = 0; i < lista.length; i++) {
      var el = lista[i];
      if (dentroDoTour(el)) continue;
      if (!visivel(el)) continue;
      var cs = window.getComputedStyle(el);
      if (parseFloat(cs.opacity) < 0.05) continue;
      return true;
    }
    return false;
  }

  function telaVisivel() {
    // Aba inativa do app = iframe com display:none → janela de tamanho zero.
    return (
      document.visibilityState !== "hidden" &&
      window.innerWidth > 240 &&
      window.innerHeight > 200
    );
  }

  // ══════════════════════════════════════════
  //  REGISTRO E INÍCIO AUTOMÁTICO
  // ══════════════════════════════════════════
  var registrados = {};

  function registrar(def) {
    if (!def || !def.id) return;
    registrados[def.id] = def;
    if (def.automatico === false && !pedidoPelaUrl) return;
    agendar(def);
  }

  function agendar(def) {
    var forcado = pedidoPelaUrl;
    if (!forcado && lerEstado(def.id)) return; // já visto: só pela Central de Ajuda

    var inicioEspera = null;

    function tentar() {
      if (ativo) return;
      // Módulo fora da licença: a tela inteira está coberta. Sem tutorial.
      if (document.querySelector(SELETOR_BLOQUEIO)) return;
      if (!forcado && lerEstado(def.id)) return;

      if (!telaVisivel() || janelaAberta()) {
        setTimeout(tentar, 500);
        return;
      }

      var pronto = true;
      if (typeof def.pronto === "function") {
        try {
          pronto = !!def.pronto();
        } catch (e) {
          pronto = false;
        }
      }
      if (!pronto) {
        if (inicioEspera === null) inicioEspera = Date.now();
        // A tela demorou demais: começa com o que já existe (os passos
        // sem elemento na tela são pulados).
        if (Date.now() - inicioEspera < LIMITE_PRONTO) {
          setTimeout(tentar, 250);
          return;
        }
      }
      iniciar(def, { automatico: !forcado });
    }

    function comecar() {
      setTimeout(tentar, ESPERA_INICIAL);
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", comecar, { once: true });
    } else {
      comecar();
    }
  }

  // ══════════════════════════════════════════
  //  MONTAGEM DA CAMADA
  // ══════════════════════════════════════════
  function montar() {
    var raiz = document.createElement("div");
    raiz.className = "btu-raiz";
    raiz.innerHTML =
      '<div class="btu-bloqueio" aria-hidden="true"></div>' +
      '<div class="btu-foco btu-foco--vazio" aria-hidden="true"></div>' +
      '<div class="btu-balao" role="dialog" aria-modal="true" aria-labelledby="btuTitulo" aria-describedby="btuTexto">' +
      '<span class="btu-seta" aria-hidden="true" hidden></span>' +
      '<div class="btu-progresso" aria-hidden="true"><span class="btu-progresso-barra"></span></div>' +
      '<div class="btu-cabeca"><span class="btu-rotulo"></span><span class="btu-contador"></span></div>' +
      '<div class="btu-icone" aria-hidden="true"></div>' +
      '<div class="btu-titulo" id="btuTitulo" role="heading" aria-level="2"></div>' +
      '<div class="btu-texto" id="btuTexto" aria-live="polite"></div>' +
      '<div class="btu-dica" hidden><kbd>←</kbd> <kbd>→</kbd> navegar &nbsp;·&nbsp; <kbd>Esc</kbd> pular</div>' +
      '<div class="btu-rodape">' +
      '<button type="button" class="btu-btn btu-btn--pular" data-btu-acao="pular">Pular</button>' +
      '<div class="btu-rodape-dir">' +
      '<button type="button" class="btu-btn btu-btn--sec" data-btu-acao="anterior">Anterior</button>' +
      '<button type="button" class="btu-btn btu-btn--pri" data-btu-acao="proximo">Próximo</button>' +
      "</div></div></div>";
    document.body.appendChild(raiz);

    var dom = {
      raiz: raiz,
      bloqueio: raiz.querySelector(".btu-bloqueio"),
      foco: raiz.querySelector(".btu-foco"),
      balao: raiz.querySelector(".btu-balao"),
      seta: raiz.querySelector(".btu-seta"),
      barra: raiz.querySelector(".btu-progresso-barra"),
      rotulo: raiz.querySelector(".btu-rotulo"),
      contador: raiz.querySelector(".btu-contador"),
      icone: raiz.querySelector(".btu-icone"),
      titulo: raiz.querySelector(".btu-titulo"),
      texto: raiz.querySelector(".btu-texto"),
      dica: raiz.querySelector(".btu-dica"),
      pular: raiz.querySelector('[data-btu-acao="pular"]'),
      anterior: raiz.querySelector('[data-btu-acao="anterior"]'),
      proximo: raiz.querySelector('[data-btu-acao="proximo"]'),
    };

    // Destaque começa no centro, fechado: o véu cobre tudo.
    aplicarGeometria(dom.foco, centroVazio(), 18, false);

    // Força o estilo inicial antes da transição de entrada.
    void raiz.offsetWidth;
    raiz.classList.add("btu-raiz--visivel");
    return dom;
  }

  // ══════════════════════════════════════════
  //  OUVINTES (bloqueio de interação)
  // ══════════════════════════════════════════
  function ligarOuvintes() {
    var d = ativo.dom;
    ativo.ouvintes = [];

    function ouvir(alvo, tipo, fn, opcoes) {
      alvo.addEventListener(tipo, fn, opcoes);
      ativo.ouvintes.push([alvo, tipo, fn, opcoes]);
    }

    // Botões da caixa
    ouvir(d.balao, "click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-btu-acao]") : null;
      if (!b || b.disabled) return;
      e.preventDefault();
      var acao = b.getAttribute("data-btu-acao");
      if (acao === "proximo") avancar();
      else if (acao === "anterior") voltar();
      else if (acao === "pular") encerrar("pulado");
    });

    // Cliques fora da caixa: nada acontece na tela; a caixa chama atenção.
    ["mousedown", "pointerdown", "touchstart"].forEach(function (tipo) {
      ouvir(
        d.bloqueio,
        tipo,
        function (e) {
          if (e.cancelable) e.preventDefault(); // mantém o foco na caixa e evita auto-rolagem
          if (tipo === "mousedown") chamarAtencao();
        },
        { passive: false },
      );
    });
    ["click", "dblclick", "auxclick", "contextmenu", "dragstart"].forEach(function (tipo) {
      ouvir(d.bloqueio, tipo, function (e) {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    // Rolagem: só a do texto da caixa (quando o texto é longo).
    function rolagem(e) {
      var txt = e.target && e.target.closest ? e.target.closest(".btu-texto") : null;
      if (txt && txt.scrollHeight > txt.clientHeight + 1) return;
      if (e.cancelable) e.preventDefault();
    }
    ouvir(d.raiz, "wheel", rolagem, { passive: false });
    ouvir(d.raiz, "touchmove", rolagem, { passive: false });

    // Teclado: capturado na janela, antes de qualquer atalho da tela.
    ouvir(window, "keydown", aoTeclar, true);
    ouvir(window, "keyup", aoTeclar, true);
    ouvir(window, "keypress", aoTeclar, true);

    // Foco não sai da caixa.
    ouvir(document, "focusin", function (e) {
      if (!ativo) return;
      if (ativo.dom.balao.contains(e.target)) return;
      focarBotao();
    }, true);

    ouvir(window, "resize", function () {
      if (!ativo) return;
      ativo.faixas = medirFaixas();
      ativo.contsDe = null;
      if (!ativo.els) {
        aplicarGeometria(ativo.dom.foco, centroVazio(), 18, false);
        posicionar();
      }
      // com alvo, o acompanhamento por quadro já reposiciona tudo
    });
  }

  function desligarOuvintes(a) {
    (a.ouvintes || []).forEach(function (o) {
      try {
        o[0].removeEventListener(o[1], o[2], o[3]);
      } catch (e) {}
    });
    a.ouvintes = [];
  }

  function parar(e) {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }

  function aoTeclar(e) {
    if (!ativo) return;
    var dom = ativo.dom;
    var dentro = dom.balao.contains(e.target);
    var noBotao = dentro && e.target.closest && e.target.closest("button");
    var k = e.key;
    var modificador = e.ctrlKey || e.metaKey || e.altKey;
    var funcao = /^F\d{1,2}$/.test(k || "");

    // Atalhos do sistema (Ctrl+…, F5, F12): não chegam à tela, mas o
    // navegador continua tratando (recarregar, zoom, ferramentas).
    if (modificador || funcao) {
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      return;
    }

    if (e.type === "keydown") {
      // Tecla segurada: um passo por toque, sem disparar vários de uma vez.
      if (e.repeat && k !== "Tab") {
        parar(e);
        return;
      }
      if (k === "Escape" || k === "Esc") {
        parar(e);
        encerrar("pulado");
        return;
      }
      if (k === "ArrowRight" || k === "PageDown") {
        parar(e);
        avancar();
        return;
      }
      if (k === "ArrowLeft" || k === "PageUp") {
        parar(e);
        voltar();
        return;
      }
      if (k === "Tab") {
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        prenderTab(e);
        return;
      }
      if ((k === "Enter" || k === " ") && noBotao) {
        // O próprio botão focado age (clique nativo); a tela não vê a tecla.
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        return;
      }
      if (k === "Enter") {
        parar(e);
        avancar();
        return;
      }
      parar(e);
      return;
    }

    // keyup / keypress
    if ((k === "Enter" || k === " ") && noBotao) {
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      return;
    }
    parar(e);
  }

  function botoesFocaveis() {
    var d = ativo.dom;
    return [d.pular, d.anterior, d.proximo].filter(function (b) {
      return b && !b.hidden && !b.disabled;
    });
  }

  function prenderTab(e) {
    var lista = botoesFocaveis();
    if (!lista.length) {
      e.preventDefault();
      return;
    }
    var i = lista.indexOf(document.activeElement);
    var prox;
    if (e.shiftKey) prox = i <= 0 ? lista[lista.length - 1] : lista[i - 1];
    else prox = i < 0 || i >= lista.length - 1 ? lista[0] : lista[i + 1];
    e.preventDefault();
    try {
      prox.focus({ preventScroll: true });
    } catch (x) {}
  }

  function focarBotao() {
    if (!ativo) return;
    var b = ativo.dom.proximo;
    try {
      if (document.activeElement !== b) b.focus({ preventScroll: true });
    } catch (e) {}
  }

  var _atencaoTimer = null;
  function chamarAtencao() {
    if (!ativo) return;
    var b = ativo.dom.balao;
    b.classList.remove("btu-balao--atencao");
    void b.offsetWidth;
    b.classList.add("btu-balao--atencao");
    clearTimeout(_atencaoTimer);
    _atencaoTimer = setTimeout(function () {
      b.classList.remove("btu-balao--atencao");
    }, 700);
    focarBotao();
  }

  // Um aviso da licença surgiu no meio do tour: ele tem prioridade. O tour
  // sai sem salvar progresso e volta sozinho quando o aviso for fechado.
  function vigiarLicenca() {
    if (typeof MutationObserver !== "function") return;
    var obs = new MutationObserver(function (lista) {
      if (!ativo) return;
      for (var i = 0; i < lista.length; i++) {
        var nos = lista[i].addedNodes;
        for (var j = 0; j < nos.length; j++) {
          var n = nos[j];
          if (!n || n.nodeType !== 1 || !n.matches) continue;
          if (n.matches(SELETOR_BLOQUEIO)) {
            encerrar("silencioso");
            return;
          }
          if (n.matches(SELETOR_LICENCA)) {
            var def = ativo.def, avulso = ativo.avulso;
            encerrar("silencioso");
            if (!avulso && registrados[def.id]) agendar(def);
            return;
          }
        }
      }
    });
    obs.observe(document.body, { childList: true });
    ativo.observador = obs;
  }

  // ══════════════════════════════════════════
  //  CICLO DO TOUR
  // ══════════════════════════════════════════
  function aplicavel(p) {
    if (!p || typeof p !== "object") return false;
    if (typeof p.se === "function") {
      try {
        if (!p.se()) return false;
      } catch (e) {
        return false;
      }
    }
    if (p.alvo == null) return true; // passo central (abertura / encerramento)
    if (p.seAusente === "centro") return true;
    if (p.vitrine) return existeNoDom(p.alvo);
    return !!resolver(p.alvo);
  }

  function iniciar(def, opcoes) {
    opcoes = opcoes || {};
    if (ativo || !def || !document.body) return false;

    var lista;
    try {
      lista = typeof def.passos === "function" ? def.passos() : def.passos;
    } catch (e) {
      registrarFalha("não foi possível montar os passos de " + def.id, e);
      return false;
    }
    if (!Array.isArray(lista)) return false;
    var passos = lista.filter(aplicavel);
    if (!passos.length) return false;

    ativo = {
      def: def,
      passos: passos,
      indice: -1,
      token: 0,
      avulso: !!opcoes.avulso,
      automatico: !!opcoes.automatico,
      vitrines: [],
      els: null,
      area: null,
      areaFoco: null,
      raio: 18,
      animando: false,
      faixas: medirFaixas(),
      rolagemInicial: window.scrollY || window.pageYOffset || 0,
      focoAnterior: document.activeElement,
      W: window.innerWidth,
      H: window.innerHeight,
    };

    try {
      ativo.dom = montar();
      ligarOuvintes();
      vigiarLicenca();
      ligarRolagemSegura();
      if (typeof def.aoIniciar === "function") {
        try {
          def.aoIniciar();
        } catch (e) {
          registrarFalha("aoIniciar de " + def.id, e);
        }
      }
      acompanhar();
      irPara(0, 1);
    } catch (e) {
      registrarFalha("falha ao iniciar " + def.id, e);
      encerrar("silencioso");
      return false;
    }
    return true;
  }

  function avancar() {
    if (!ativo) return;
    if (ativo.indice >= ultimoExibivel()) {
      encerrar("concluido");
      return;
    }
    irPara(ativo.indice + 1, 1);
  }

  function voltar() {
    if (!ativo || ativo.indice <= 0) return;
    irPara(ativo.indice - 1, -1);
  }

  // Índice do último passo que ainda pode aparecer (para o "Finalizar").
  function ultimoExibivel() {
    for (var i = ativo.passos.length - 1; i > ativo.indice; i--) {
      var p = ativo.passos[i];
      if (p.alvo == null || p.seAusente === "centro" || p.vitrine) return i;
      if (resolver(p.alvo)) return i;
    }
    return ativo.indice;
  }

  function temAnterior() {
    for (var i = ativo.indice - 1; i >= 0; i--) {
      var p = ativo.passos[i];
      if (p.alvo == null || p.seAusente === "centro" || p.vitrine) return true;
      if (resolver(p.alvo)) return true;
    }
    return false;
  }

  function localizar(indice, direcao) {
    for (var i = indice; i >= 0 && i < ativo.passos.length; i += direcao) {
      var p = ativo.passos[i];
      trocarVitrines(p);
      if (p.alvo == null) return { indice: i, els: null };
      var els = resolver(p.alvo);
      if (els || p.seAusente === "centro") return { indice: i, els: els };
    }
    return null;
  }

  function irPara(indice, direcao) {
    if (!ativo) return;
    var token = ++ativo.token;
    var primeiro = ativo.indice < 0;

    esconderBalao(primeiro ? 0 : DUR_SAIDA, function () {
      if (!ativo || token !== ativo.token) return;

      var anterior = ativo.indice >= 0 ? ativo.passos[ativo.indice] : null;
      chamarGancho(anterior, "aoSair");

      var achado = localizar(indice, direcao);
      if (!achado && direcao < 0 && ativo.indice >= 0) achado = localizar(ativo.indice, 1);
      if (!achado) {
        encerrar("concluido");
        return;
      }

      ativo.indice = achado.indice;
      var passo = ativo.passos[achado.indice];
      if (chamarGancho(passo, "aoEntrar") && passo.alvo != null) {
        achado.els = resolver(passo.alvo); // o gancho pode ter mudado a tela
      }
      ativo.els = achado.els;
      ativo.faixas = medirFaixas();
      ativo.contsDe = null;
      var medida = preencherBalao(passo);

      rolarAte(achado.els, medida, function () {
        if (!ativo || token !== ativo.token) return;
        moverFoco(achado.els, passo, medida, function () {
          if (!ativo || token !== ativo.token) return;
          mostrarBalao();
        });
      });
    });
  }

  function chamarGancho(passo, nome) {
    if (!passo || typeof passo[nome] !== "function") return false;
    try {
      passo[nome]();
      return true;
    } catch (e) {
      registrarFalha(nome + " de um passo falhou", e);
      return false;
    }
  }

  // ══════════════════════════════════════════
  //  VITRINE — mostra por um instante uma área escondida
  //  { alvo: "#id", display: "flex", classe: "aberto" }
  //  { alvo: "#id", ocultar: true }  → esconde (ex.: um aviso de "vazio"
  //                                    que ficaria por cima da área mostrada)
  // ══════════════════════════════════════════
  function normalizarVitrine(v) {
    if (!v) return [];
    var lista = Array.isArray(v) ? v : [v];
    return lista
      .map(function (item) {
        if (typeof item === "string") return { alvo: item };
        return item && item.alvo ? item : null;
      })
      .filter(Boolean);
  }

  function trocarVitrines(passo) {
    var novas = normalizarVitrine(passo && passo.vitrine);
    var els = novas.map(function (v) {
      if (v.alvo && v.alvo.nodeType === 1) return v.alvo;
      try {
        return document.querySelector(v.alvo);
      } catch (e) {
        return null;
      }
    });

    // Devolve as que o novo passo não usa (na ordem inversa da aplicação)
    for (var i = ativo.vitrines.length - 1; i >= 0; i--) {
      var reg = ativo.vitrines[i];
      if (els.indexOf(reg.el) < 0) {
        restaurarVitrine(reg);
        ativo.vitrines.splice(i, 1);
      }
    }

    // Aplica as novas (as que já estão aplicadas ficam como estão)
    novas.forEach(function (v, idx) {
      var el = els[idx];
      if (!el) return;
      var jaAplicada = ativo.vitrines.some(function (r) {
        return r.el === el;
      });
      if (jaAplicada) return;
      var reg = { el: el };
      if (v.classe && !el.classList.contains(v.classe)) {
        el.classList.add(v.classe);
        reg.classe = v.classe;
      }
      var escondido = window.getComputedStyle(el).display === "none";
      if (v.ocultar ? !escondido : v.display !== false && escondido) {
        reg.display = {
          valor: el.style.getPropertyValue("display"),
          prioridade: el.style.getPropertyPriority("display"),
        };
        el.style.setProperty("display", v.ocultar ? "none" : v.display || "block", "important");
      }
      if (reg.classe || reg.display) ativo.vitrines.push(reg);
    });
  }

  function restaurarVitrine(reg) {
    try {
      if (reg.display) {
        if (reg.display.valor) reg.el.style.setProperty("display", reg.display.valor, reg.display.prioridade);
        else reg.el.style.removeProperty("display");
      }
      if (reg.classe) reg.el.classList.remove(reg.classe);
    } catch (e) {}
  }

  function restaurarTodasVitrines(a) {
    for (var i = a.vitrines.length - 1; i >= 0; i--) restaurarVitrine(a.vitrines[i]);
    a.vitrines = [];
  }

  // ══════════════════════════════════════════
  //  ROLAGEM ATÉ O ALVO
  // ══════════════════════════════════════════
  // A rolagem usa scroll-padding: o navegador desconta o cabeçalho fixo,
  // as barras de rodapé e os rodapés grudados (como o do menu lateral) ao
  // centralizar o alvo. Tudo é devolvido como estava ao fim do tour.
  function ligarRolagemSegura() {
    document.documentElement.classList.add("btu-rolagem");
    ativo.paddings = [];
  }

  function ajustarRolagemSegura(els, livre) {
    var html = document.documentElement;
    html.style.setProperty("--btu-topo", Math.round(livre.faixas.topo + 16) + "px");
    html.style.setProperty("--btu-base", Math.round(livre.faixas.base + 16) + "px");

    containeresDoAlvo(els).forEach(function (c) {
      if (!c.topo && !c.base) return;
      var jaTem = ativo.paddings.some(function (p) {
        return p.el === c.el;
      });
      if (!jaTem) {
        ativo.paddings.push({
          el: c.el,
          topo: c.el.style.getPropertyValue("scroll-padding-top"),
          base: c.el.style.getPropertyValue("scroll-padding-bottom"),
        });
      }
      c.el.style.setProperty("scroll-padding-top", Math.round(c.topo + 10) + "px");
      c.el.style.setProperty("scroll-padding-bottom", Math.round(c.base + 10) + "px");
    });
  }

  // Guarda a rolagem original dos contêineres (menu lateral, painéis) para
  // devolver ao fim do tour. A da janela é guardada no início.
  function guardarRolagens(els) {
    if (!ativo.rolagens) ativo.rolagens = [];
    containeresDoAlvo(els).forEach(function (c) {
      var ja = ativo.rolagens.some(function (r) {
        return r.el === c.el;
      });
      if (!ja) ativo.rolagens.push({ el: c.el, top: c.el.scrollTop, left: c.el.scrollLeft });
    });
  }

  function devolverRolagens(a) {
    var comportamento = reduzirMovimento ? "instant" : "smooth";
    (a.rolagens || []).forEach(function (r) {
      try {
        if (r.el.isConnected) r.el.scrollTo({ top: r.top, left: r.left, behavior: comportamento });
      } catch (e) {}
    });
    try {
      window.scrollTo({ top: a.rolagemInicial, left: 0, behavior: comportamento });
    } catch (e) {}
  }

  function desligarRolagemSegura(a) {
    var html = document.documentElement;
    html.classList.remove("btu-rolagem");
    html.style.removeProperty("--btu-topo");
    html.style.removeProperty("--btu-base");
    (a.paddings || []).forEach(function (p) {
      try {
        if (p.topo) p.el.style.setProperty("scroll-padding-top", p.topo);
        else p.el.style.removeProperty("scroll-padding-top");
        if (p.base) p.el.style.setProperty("scroll-padding-bottom", p.base);
        else p.el.style.removeProperty("scroll-padding-bottom");
      } catch (e) {}
    });
    a.paddings = [];
  }

  // O alvo (ou algum ancestral) é fixo na tela? Então rolar a janela não o move.
  function fixoNaTela(el) {
    for (var p = el; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      if (window.getComputedStyle(p).position === "fixed") return true;
    }
    return false;
  }

  function rolarAte(els, medida, pronto) {
    if (!els || !els.length) {
      pronto();
      return;
    }
    var r = retanguloDe(els);
    if (!r) {
      pronto();
      return;
    }
    var W = window.innerWidth, H = window.innerHeight;
    var livre = areaLivre(els);
    var livreTopo = livre.top + 10, livreBase = livre.bottom - 10;
    var livreAltura = livreBase - livreTopo;
    var cabe = r.height <= livreAltura;
    var jaVisivel =
      r.top >= livreTopo && r.bottom <= livreBase && r.left >= livre.left - 1 && r.right <= livre.right + 1;

    // Alvo largo, sem espaço para a caixa nos lados: o ideal é o alvo e a
    // caixa empilhados (caixa acima ou abaixo). Se couber, rola para isso.
    var bw = medida ? medida.largura : 0, bh = medida ? medida.altura : 0;
    var cabeDoLado =
      r.left - DISTANCIA - bw >= MARGEM || r.right + DISTANCIA + bw <= W - MARGEM;
    var soJanela = !containeresDoAlvo(els).length && !fixoNaTela(els[0]);
    var empilhar = medida && !cabeDoLado && soJanela && r.height + DISTANCIA + bh <= livreAltura;
    if (empilhar && jaVisivel) {
      var cabeAbaixo = r.bottom + DISTANCIA + bh <= H - MARGEM;
      var cabeAcima = r.top - DISTANCIA - bh >= MARGEM;
      if (cabeAbaixo || cabeAcima) {
        pronto();
        return;
      }
    } else if (jaVisivel || (!cabe && r.top >= livreTopo - 2 && r.top <= livreTopo + 60)) {
      // Já está na tela (ou é maior que ela e já começa no topo).
      pronto();
      return;
    }

    ajustarRolagemSegura(els, livre);
    guardarRolagens(els);

    var comportamento = reduzirMovimento ? "instant" : "smooth";
    try {
      if (empilhar) {
        // Alvo em cima, caixa embaixo, o conjunto centralizado na tela.
        var bloco = r.height + DISTANCIA + bh;
        var topoDesejado = Math.max(livreTopo, (H - bloco) / 2);
        window.scrollBy({ top: r.top - topoDesejado, left: 0, behavior: comportamento });
      } else if (els.length === 1) {
        els[0].scrollIntoView({ block: cabe ? "center" : "start", inline: "nearest", behavior: comportamento });
      } else {
        // União de elementos: centraliza o conjunto pela rolagem da janela.
        var alvoY = cabe ? r.top + r.height / 2 - (livreTopo + livreBase) / 2 : r.top - livreTopo;
        window.scrollBy({ top: alvoY, left: 0, behavior: comportamento });
      }
    } catch (e) {
      try {
        els[0].scrollIntoView();
      } catch (x) {}
    }
    esperarRolagem(els, pronto);
  }

  // Espera o alvo parar de se mexer (fim da rolagem suave).
  function esperarRolagem(els, pronto) {
    var t0 = Date.now();
    var ultimo = null, estavel = 0, moveu = false, feito = false;

    function concluir() {
      if (feito) return;
      feito = true;
      clearTimeout(reserva);
      pronto();
    }
    // Reserva: se os quadros pararem (aba escondida), segue mesmo assim.
    var reserva = setTimeout(concluir, 1500);

    function quadro() {
      if (feito || !ativo) return;
      var r = retanguloDe(els);
      var chave = r ? Math.round(r.top) + ":" + Math.round(r.left) : "";
      if (chave === ultimo) estavel++;
      else {
        if (ultimo !== null) moveu = true;
        estavel = 0;
        ultimo = chave;
      }
      var t = Date.now() - t0;
      if ((moveu && estavel >= 4) || (!moveu && t > 240) || t > 1200) {
        concluir();
        return;
      }
      requestAnimationFrame(quadro);
    }
    requestAnimationFrame(quadro);
  }

  // ══════════════════════════════════════════
  //  DESTAQUE (o "buraco" no véu)
  // ══════════════════════════════════════════
  function centroVazio() {
    return { top: window.innerHeight / 2, left: window.innerWidth / 2, width: 0, height: 0 };
  }

  function aplicarGeometria(el, a, raio, animar) {
    el.classList.toggle("btu-sem-transicao", !animar || reduzirMovimento);
    el.style.transform = "translate(" + a.left.toFixed(1) + "px, " + a.top.toFixed(1) + "px)";
    el.style.width = Math.max(0, a.width).toFixed(1) + "px";
    el.style.height = Math.max(0, a.height).toFixed(1) + "px";
    if (raio != null) el.style.borderRadius = raio.toFixed(1) + "px";
  }

  function moverFoco(els, passo, medida, pronto) {
    var foco = ativo.dom.foco;
    var bruta = els ? areaDoFoco(els, passo) : null;
    var plano = bruta ? calcularPlano(bruta, medida.largura, medida.altura, passo) : null;
    var area = bruta ? comCorte(bruta, plano) : null;
    var geo = area || centroVazio();
    var raio = els ? raioDe(els, passo) : 18;
    var mudou = diferente(ativo.areaFoco, geo);

    ativo.areaBruta = bruta;
    ativo.plano = plano;
    ativo.area = area;
    ativo.raio = raio;
    ativo.areaFoco = geo;
    ativo.W = window.innerWidth;
    ativo.H = window.innerHeight;

    foco.classList.remove("btu-foco--pulso");
    foco.classList.toggle("btu-foco--vazio", !area);

    if (!mudou) {
      aplicarGeometria(foco, geo, raio, false);
      if (area) pulsar(foco);
      pronto();
      return;
    }

    ativo.animando = true;
    aplicarGeometria(foco, geo, raio, true);
    setTimeout(
      function () {
        if (!ativo) return;
        ativo.animando = false;
        if (area) pulsar(foco);
        pronto();
      },
      reduzirMovimento ? 0 : DUR_FOCO,
    );
  }

  function pulsar(foco) {
    if (reduzirMovimento) return;
    foco.classList.remove("btu-foco--pulso");
    void foco.offsetWidth;
    foco.classList.add("btu-foco--pulso");
  }

  // Acompanha o alvo a cada quadro: se a tela mudar (imagem que carregou,
  // lista que re-renderizou, janela redimensionada), o destaque e a caixa
  // vão junto, sem animação.
  function acompanhar() {
    if (!ativo) return;
    ativo.raf = requestAnimationFrame(acompanhar);
    if (ativo.animando || ativo.trocando || !ativo.els) return;

    var passo = ativo.passos[ativo.indice];
    if (!passo) return;
    var soltos = ativo.els.some(function (el) {
      return !el.isConnected;
    });
    if (soltos) {
      var novos = resolver(passo.alvo);
      if (!novos) return;
      ativo.els = novos;
    }
    var bruta = areaDoFoco(ativo.els, passo);
    if (!bruta) return;
    var W = window.innerWidth, H = window.innerHeight;
    if (!diferente(bruta, ativo.areaBruta) && W === ativo.W && H === ativo.H) return;

    var b = ativo.dom.balao;
    var plano = calcularPlano(bruta, b.offsetWidth, b.offsetHeight, passo);
    var area = comCorte(bruta, plano);
    ativo.areaBruta = bruta;
    ativo.plano = plano;
    ativo.area = area;
    ativo.areaFoco = area;
    ativo.W = W;
    ativo.H = H;
    aplicarGeometria(ativo.dom.foco, area, ativo.raio, false);
    posicionar();
  }

  // ══════════════════════════════════════════
  //  CAIXA DE EXPLICAÇÃO
  // ══════════════════════════════════════════
  function esconderBalao(ms, depois) {
    if (!ativo) return;
    var b = ativo.dom.balao;
    ativo.trocando = true;
    if (!ms || !b.classList.contains("btu-balao--visivel")) {
      b.classList.remove("btu-balao--visivel");
      depois();
      return;
    }
    b.classList.remove("btu-balao--visivel");
    setTimeout(depois, reduzirMovimento ? 0 : ms);
  }

  function textoDoPasso(passo) {
    var t = passo.texto;
    if (typeof t === "function") {
      try {
        t = t(ativo.els ? ativo.els[0] : null, ativo.els);
      } catch (e) {
        registrarFalha("texto de um passo falhou", e);
        t = "";
      }
    }
    return t == null ? "" : String(t);
  }

  // Preenche a caixa (ainda invisível). Feito ANTES da rolagem, para o
  // tamanho dela entrar na conta de onde o alvo deve parar na tela.
  function preencherBalao(passo) {
    var a = ativo, d = a.dom;
    var i = a.indice, n = a.passos.length;
    var centro = !a.els;
    var ultimo = i >= ultimoExibivel();
    var primeiro = !temAnterior();

    d.balao.classList.toggle("btu-balao--centro", centro);
    d.rotulo.textContent = a.def.tela || "Tutorial";
    d.contador.textContent = i + 1 + " de " + n;
    d.barra.style.width = (((i + 1) / n) * 100).toFixed(2) + "%";

    d.icone.innerHTML = centro ? icone(passo.icone || a.def.icone || a.def.id, 24) : "";
    d.titulo.textContent = passo.titulo || "";
    d.texto.innerHTML = textoDoPasso(passo);
    d.texto.scrollTop = 0;
    d.dica.hidden = i !== 0;

    d.anterior.hidden = primeiro;
    d.pular.hidden = ultimo;

    var rotulo;
    if (ultimo) rotulo = passo.botao || "Finalizar";
    else if (i === 0 && centro) rotulo = passo.botao || "Começar";
    else rotulo = passo.botao || "Próximo";
    d.proximo.innerHTML = esc(rotulo) + (ultimo ? icone("check", 15) : icone("seta", 15));
    return { largura: d.balao.offsetWidth, altura: d.balao.offsetHeight };
  }

  function mostrarBalao() {
    var a = ativo, d = a.dom;
    posicionar();
    a.trocando = false;

    // Próximo quadro: a caixa entra a partir do lado do alvo.
    requestAnimationFrame(function () {
      if (!ativo || ativo !== a) return;
      d.balao.classList.add("btu-balao--visivel");
      focarBotao();
    });
  }

  function posicionar() {
    if (!ativo) return;
    var d = ativo.dom, b = d.balao;
    var W = window.innerWidth, H = window.innerHeight;
    var bw = b.offsetWidth, bh = b.offsetHeight;
    var area = ativo.area;

    if (!ativo.els || !area || !ativo.plano) {
      b.style.left = Math.round(Math.max(MARGEM, (W - bw) / 2)) + "px";
      b.style.top = Math.round(Math.max(MARGEM, (H - bh) / 2)) + "px";
      b.setAttribute("data-lado", "centro");
      d.seta.hidden = true;
      return;
    }

    var escolha = ativo.plano;
    b.style.left = escolha.left + "px";
    b.style.top = escolha.top + "px";
    b.setAttribute("data-lado", escolha.lado);

    if (escolha.seta) {
      d.seta.hidden = false;
      d.seta.setAttribute("data-lado", escolha.lado);
      if (escolha.lado === "abaixo" || escolha.lado === "acima") {
        d.seta.style.left = limitar(area.left + area.width / 2 - escolha.left, 22, bw - 22) + "px";
        d.seta.style.top = "";
      } else {
        d.seta.style.top = limitar(area.top + area.height / 2 - escolha.top, 22, bh - 22) + "px";
        d.seta.style.left = "";
      }
    } else {
      d.seta.hidden = true;
    }
  }

  /**
   * Decide onde a caixa fica em relação ao destaque.
   *   1. num dos lados, na ordem de preferência, sem cobrir o alvo;
   *   2. alvo alto e largo demais para qualquer lado: "espiar" — o
   *      destaque mostra a parte de cima do alvo e a caixa fica embaixo,
   *      com o destaque terminando logo acima dela (corte);
   *   3. último caso: o ponto que menos cobre o alvo, sem seta.
   */
  function calcularPlano(area, bw, bh, passo) {
    var W = window.innerWidth, H = window.innerHeight;
    var ordem = ordemDosLados(area, passo && passo.lado, W);
    for (var k = 0; k < ordem.length; k++) {
      var pos = calcularLado(ordem[k], area, bw, bh, W, H);
      if (pos.cabe) return pos;
    }
    var topoBalao = H - bh - MARGEM;
    var corte = topoBalao - DISTANCIA;
    if (area.top + 90 <= corte && area.top + area.height > corte) {
      var cx = area.left + area.width / 2;
      return {
        lado: "abaixo",
        left: Math.round(limitar(cx - bw / 2, MARGEM, W - bw - MARGEM)),
        top: Math.round(topoBalao),
        seta: true,
        corte: corte,
      };
    }
    return melhorSobreposto(area, bw, bh, W, H);
  }

  function comCorte(area, plano) {
    if (!plano || typeof plano.corte !== "number") return area;
    var altura = Math.min(area.height, plano.corte - area.top);
    return { top: area.top, left: area.left, width: area.width, height: Math.max(12, altura) };
  }

  function ordemDosLados(a, preferido, W) {
    var largo = a.width > W * 0.45;
    var ordem;
    if (!largo && a.left + a.width < W * 0.36) ordem = ["direita", "abaixo", "acima", "esquerda"];
    else if (!largo && a.left > W * 0.64) ordem = ["esquerda", "abaixo", "acima", "direita"];
    else ordem = ["abaixo", "acima", "direita", "esquerda"];
    if (preferido && preferido !== "auto" && ordem.indexOf(preferido) >= 0) {
      ordem = [preferido].concat(
        ordem.filter(function (x) {
          return x !== preferido;
        }),
      );
    }
    return ordem;
  }

  function calcularLado(lado, a, bw, bh, W, H) {
    var cx = a.left + a.width / 2, cy = a.top + a.height / 2;
    var left, top, cabe;
    if (lado === "abaixo") {
      top = a.top + a.height + DISTANCIA;
      left = cx - bw / 2;
      cabe = top + bh <= H - MARGEM;
    } else if (lado === "acima") {
      top = a.top - DISTANCIA - bh;
      left = cx - bw / 2;
      cabe = top >= MARGEM;
    } else if (lado === "direita") {
      left = a.left + a.width + DISTANCIA;
      top = cy - bh / 2;
      cabe = left + bw <= W - MARGEM;
    } else {
      left = a.left - DISTANCIA - bw;
      top = cy - bh / 2;
      cabe = left >= MARGEM;
    }
    left = limitar(left, MARGEM, W - bw - MARGEM);
    top = limitar(top, MARGEM, H - bh - MARGEM);
    return { lado: lado, left: Math.round(left), top: Math.round(top), cabe: cabe, seta: true };
  }

  // Nenhum lado comporta a caixa (alvo enorme): escolhe o ponto que
  // cobre menos o alvo, sem seta.
  function melhorSobreposto(a, bw, bh, W, H) {
    var cands = ["abaixo", "acima", "direita", "esquerda"].map(function (l) {
      return calcularLado(l, a, bw, bh, W, H);
    });
    cands.push({ lado: "sobre", left: Math.round(W - bw - MARGEM), top: Math.round(H - bh - MARGEM) });
    cands.push({ lado: "sobre", left: Math.round(MARGEM), top: Math.round(H - bh - MARGEM) });
    var melhor = null, menor = Infinity;
    cands.forEach(function (c) {
      var ix = Math.max(0, Math.min(c.left + bw, a.left + a.width) - Math.max(c.left, a.left));
      var iy = Math.max(0, Math.min(c.top + bh, a.top + a.height) - Math.max(c.top, a.top));
      var sobra = ix * iy;
      if (sobra < menor - 1) {
        menor = sobra;
        melhor = c;
      }
    });
    melhor = melhor || cands[cands.length - 2];
    return { lado: melhor.lado === "sobre" ? "sobre" : melhor.lado, left: melhor.left, top: melhor.top, seta: menor < 1 };
  }

  // ══════════════════════════════════════════
  //  ENCERRAMENTO
  // ══════════════════════════════════════════
  function encerrar(motivo) {
    if (!ativo) return;
    var a = ativo;
    ativo = null;
    a.token++;

    chamarGancho(a.passos[a.indice], "aoSair");
    if (!a.avulso && (motivo === "concluido" || motivo === "pulado")) gravarEstado(a.def.id, motivo);

    try {
      cancelAnimationFrame(a.raf);
    } catch (e) {}
    if (a.observador) {
      try {
        a.observador.disconnect();
      } catch (e) {}
    }
    desligarOuvintes(a);
    restaurarTodasVitrines(a);
    desligarRolagemSegura(a);

    var raiz = a.dom && a.dom.raiz;
    if (raiz) {
      raiz.classList.remove("btu-raiz--visivel");
      raiz.classList.add("btu-raiz--saindo");
      setTimeout(
        function () {
          if (raiz.parentNode) raiz.parentNode.removeChild(raiz);
        },
        reduzirMovimento ? 0 : 280,
      );
    }

    // Devolve a tela como estava: rolagem e foco.
    if (motivo !== "silencioso") devolverRolagens(a);
    try {
      var f = a.focoAnterior;
      if (f && f !== document.body && f.isConnected && typeof f.focus === "function") f.focus({ preventScroll: true });
      else if (document.activeElement && dentroDoTour(document.activeElement)) document.activeElement.blur();
    } catch (e) {}

    if (typeof a.def.aoEncerrar === "function") {
      try {
        a.def.aoEncerrar(motivo);
      } catch (e) {
        registrarFalha("aoEncerrar de " + a.def.id, e);
      }
    }

    if (!a.avulso) {
      if (motivo === "concluido") {
        avisar("Tutorial concluído. Para rever, abra Ajuda › Tutoriais interativos.", "success");
      } else if (motivo === "pulado") {
        avisar("Tutorial pulado. Ele continua disponível em Ajuda › Tutoriais interativos.", "default");
      }
    }
  }

  // ══════════════════════════════════════════
  //  CENTRAL DE AJUDA — lista de tutoriais
  // ══════════════════════════════════════════
  function plataformaParaTutorial(preferirML) {
    var ids = [];
    try {
      if (typeof window.getAllPlatformIds === "function") ids = window.getAllPlatformIds() || [];
    } catch (e) {
      ids = [];
    }
    var ocultas = [];
    try {
      ocultas = JSON.parse(localStorage.getItem("precifiq_hidden_platforms")) || [];
    } catch (e) {
      ocultas = [];
    }
    if (!Array.isArray(ocultas)) ocultas = [];
    var visiveis = ids.filter(function (id) {
      return ocultas.indexOf(id) < 0;
    });
    if (!visiveis.length) visiveis = ids;

    if (preferirML && typeof window.ehMercadoLivre === "function") {
      for (var i = 0; i < visiveis.length; i++) {
        var cfg = null;
        try {
          cfg = typeof window.getPlatformConfig === "function" ? window.getPlatformConfig(visiveis[i]) : null;
        } catch (e) {}
        try {
          if (window.ehMercadoLivre(visiveis[i], cfg && cfg.name)) return visiveis[i];
        } catch (e) {}
      }
    }
    var semLoja = visiveis.filter(function (id) {
      return id !== "loja_fisica";
    });
    return semLoja[0] || visiveis[0] || "loja_fisica";
  }

  function urlDoTutorial(id) {
    var item = null;
    for (var i = 0; i < CATALOGO.length; i++) if (CATALOGO[i].id === id) item = CATALOGO[i];
    if (!item) return null;
    var params = [];
    if (item.plataforma) {
      params.push("p=" + encodeURIComponent(plataformaParaTutorial(item.plataforma === "ml")));
    }
    if (item.extra) params.push(item.extra);
    params.push(PARAM + "=1");
    return item.pagina + "?" + params.join("&");
  }

  function rotuloEstado(est) {
    if (!est) return { cls: "novo", txt: "Ainda não visto" };
    if (est.estado === "concluido") return { cls: "concluido", txt: "Concluído" };
    return { cls: "pulado", txt: "Pulado" };
  }

  function montarPainelAjuda(el) {
    el = el || document.getElementById("tutoriaisPainel");
    if (!el) return;

    function render() {
      var concluidos = 0;
      var cartoes = CATALOGO.map(function (t) {
        var est = lerEstado(t.id);
        if (est && est.estado === "concluido") concluidos++;
        var r = rotuloEstado(est);
        var acao = est ? "Rever" : "Ver agora";
        return (
          '<article class="btu-cartao" data-estado="' + r.cls + '">' +
          '<div class="btu-cartao-topo">' +
          '<span class="btu-cartao-icone">' + icone(t.id, 18) + "</span>" +
          '<div class="btu-cartao-textos">' +
          '<div class="btu-cartao-nome">' + esc(t.nome) + "</div>" +
          '<div class="btu-cartao-desc">' + esc(t.desc) + "</div>" +
          "</div></div>" +
          '<div class="btu-cartao-rodape">' +
          '<span class="btu-selo btu-selo--' + r.cls + '">' +
          (r.cls === "concluido" ? icone("check", 12) : '<span class="btu-selo-ponto"></span>') +
          esc(r.txt) + "</span>" +
          '<button type="button" class="btu-cartao-btn" data-btu-ver="' + esc(t.id) + '">' +
          esc(acao) + icone("seta", 14) + "</button>" +
          "</div></article>"
        );
      }).join("");

      var total = CATALOGO.length;
      el.innerHTML =
        '<div class="btu-painel">' +
        '<div class="btu-painel-topo">' +
        '<div class="btu-painel-progresso">' +
        '<div class="btu-painel-numeros"><strong>' + concluidos + "</strong> de " + total +
        " tutoriais concluídos</div>" +
        '<div class="btu-painel-trilho"><span style="width:' + ((concluidos / total) * 100).toFixed(1) + '%"></span></div>' +
        "</div>" +
        '<button type="button" class="btu-painel-reset" data-btu-reset="1" title="Os tutoriais voltam a abrir sozinhos na primeira visita a cada tela">' +
        icone("refazer", 14) + "Mostrar todos de novo</button>" +
        "</div>" +
        '<div class="btu-painel-grade">' + cartoes + "</div>" +
        "</div>";
    }

    render();

    if (!el.__btuLigado) {
      el.__btuLigado = true;
      el.addEventListener("click", function (e) {
        var ver = e.target.closest ? e.target.closest("[data-btu-ver]") : null;
        if (ver) {
          var url = urlDoTutorial(ver.getAttribute("data-btu-ver"));
          if (url) window.location.href = url;
          return;
        }
        var reset = e.target.closest ? e.target.closest("[data-btu-reset]") : null;
        if (reset) {
          CATALOGO.forEach(function (t) {
            apagarEstado(t.id);
          });
          render();
          avisar("Pronto: cada tutorial volta a abrir sozinho na primeira visita à tela.", "success");
        }
      });
    }
  }

  // ══════════════════════════════════════════
  //  API PÚBLICA
  // ══════════════════════════════════════════
  window.BapellTutorial = {
    versao: 1,

    /** Registra o tutorial da tela e agenda o início automático. */
    registrar: registrar,

    /** Inicia o tutorial registrado com este id (ignora o progresso). */
    iniciar: function (id) {
      var def = registrados[id];
      return def ? iniciar(def, {}) : false;
    },

    /** Tour avulso (ex.: "Como usar" de uma calculadora). Não salva progresso. */
    iniciarAvulso: function (def) {
      return iniciar(def, { avulso: true });
    },

    /** Há um tour na tela agora? */
    emAndamento: function () {
      return !!ativo;
    },

    /** Encerra o tour em andamento sem salvar progresso. */
    fechar: function () {
      encerrar("silencioso");
    },

    estado: lerEstado,
    esquecer: apagarEstado,
    esquecerTodos: function () {
      CATALOGO.forEach(function (t) {
        apagarEstado(t.id);
      });
    },
    catalogo: function () {
      return CATALOGO.map(function (t) {
        return { id: t.id, nome: t.nome, desc: t.desc, pagina: t.pagina };
      });
    },
    urlDe: urlDoTutorial,
    montarPainelAjuda: montarPainelAjuda,

    /** Ajudantes para os arquivos de cada tela. */
    util: {
      esc: esc,
      icone: icone,
      visivel: visivel,
      /** Primeiro elemento visível de cada seletor, destacados juntos. */
      uniao: function () {
        var sels = Array.prototype.slice.call(arguments);
        return function () {
          var els = [];
          sels.forEach(function (s) {
            var el = primeiroVisivel(s);
            if (el) els.push(el);
          });
          return els.length ? els : null;
        };
      },
      /** Todos os elementos visíveis do seletor, destacados juntos. */
      todos: function (sel) {
        return function () {
          var els = [];
          try {
            Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
              if (visivel(el) && !dentroDoTour(el)) els.push(el);
            });
          } catch (e) {}
          return els.length ? els : null;
        };
      },
      /** O primeiro "filho" visível dentro do primeiro "pai" visível. */
      dentro: function (paiSel, filhoSel) {
        return function () {
          var pai = primeiroVisivel(paiSel);
          if (!pai) return null;
          var lista = pai.querySelectorAll(filhoSel);
          for (var i = 0; i < lista.length; i++) if (visivel(lista[i])) return lista[i];
          return null;
        };
      },
    },
  };

  // Central de Ajuda: monta a lista se o espaço dela existir nesta tela.
  function montarSeHouver() {
    if (document.getElementById("tutoriaisPainel")) montarPainelAjuda();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", montarSeHouver, { once: true });
  } else {
    montarSeHouver();
  }
})();

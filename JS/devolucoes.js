// ═══════════════════════════════════════════════════════════════════
//  Bapell Gestor Pro — Gestor de Devoluções (devolucoes.html)
//
//  ── DE ONDE VEM CADA DADO (só leitura) ─────────────────────────────
//    Empresas ....... localStorage "precifiq_empresa" (Dados da Empresa).
//                     O imposto usa o campo impostoPorNota de cada uma —
//                     o mesmo que o Processador de Planilhas usa.
//    Lojas .......... as plataformas cadastradas (PLATFORMS_CONFIG, do
//                     utils.js), menos as ocultas — a mesma regra do
//                     "Canal de Venda" do Controle Financeiro — e as
//                     excluídas.
//    Produtos ....... getProductsForReading(lojaId), do utils.js. A busca
//                     acha produtos e kits da loja escolhida pela SKU,
//                     como nas Ações em Massa. LEITURA EXIGE initStorage()
//                     ANTES: os produtos vivem no IndexedDB.
//    Preço .......... o preço atual do produto na loja (finalPrice; no kit,
//                     price). No Mercado Livre, Premium e Clássico, com a
//                     mesma conta da lista de produtos (calculadora.js).
//
//  ── O QUE ESTA TELA GRAVA ──────────────────────────────────────────
//    "precifiq_devolucoes" ....... as devoluções (chave nova)
//    "precifiq_devolucoes_futuras" as devoluções a caminho (registradas
//                                  antes de chegar) e a situação de cada
//                                  uma: aguardando ou já lançada
//    "precifiq_devolucoes_tela" .. a empresa e a loja usadas por último
//                                  (só preferência da tela)
//    "precifiq_dre" .............. só ao exportar (ou ao atualizar/remover
//                                  um lançamento exportado): uma saída na
//                                  categoria DEVOLUÇÃO, no formato que o
//                                  financeiro.js já usa no Registrar Saída
//    "precifiq_lembretes" ........ só ao criar o lembrete de uma devolução
//                                  futura: um lembrete no mesmo formato da
//                                  tela Lembretes (lembretes.js), que o
//                                  avisa como qualquer outro
//
//  ── AS TRÊS TELAS (menu lateral) ───────────────────────────────────
//    Lançamento de devoluções ... a tela de sempre (painel e lista)
//    Registrar futuras .......... o formulário da janela de lançamento,
//                                 trazido para a tela (o mesmo #mdCorpo),
//                                 com menos campos obrigatórios
//    Acompanhar devoluções ...... as futuras: "Lançar" abre a janela de
//                                 lançamento já preenchida; ao salvar, a
//                                 futura passa a "lançada" (não lança duas
//                                 vezes)
//    O responsável (lançamento e registro) é um dos usuários de Usuários e
//    Senhas (window.BapellUsuarios, do senhas.js), gravado pelo nome e id.
//
//  ── A CONTA DA DEVOLUÇÃO ───────────────────────────────────────────
//    Valor da devolução = valor do produto × quantidade
//    Imposto            = valor da devolução × % de imposto da empresa
//                         (só quando "Gerou imposto fiscal?" = Sim)
//    Valor extra        = o que se pagou a mais pela devolução (o frete,
//                         por exemplo), com o motivo; opcional
//    Plataforma NÃO reembolsou → prejuízo = o imposto + o valor extra
//    Plataforma reembolsou     → prejuízo = só o valor extra; o VALOR
//                                REEMBOLSADO (o que a plataforma devolveu
//                                de fato: a venda menos as taxas) entra em
//                                "Total de reembolsos" e o imposto (sempre
//                                sobre o valor cheio) fica registrado, mas
//                                não conta
//    Aguardando (a plataforma ainda não decidiu) → conta como NÃO até a
//                                resposta: o imposto entra no prejuízo e o
//                                reembolso fica zero. Ao mudar para Sim ou
//                                Não, a conta se acerta sozinha.
//    O valor exportado para o Financeiro é o prejuízo.
// ═══════════════════════════════════════════════════════════════════

(function () {
  "use strict";

  var LS = "precifiq_devolucoes";
  var LS_TELA = "precifiq_devolucoes_tela";
  var LS_EMPRESA = "precifiq_empresa";
  var LS_DRE = "precifiq_dre";
  var LS_OCULTAS = "precifiq_hidden_platforms";
  var LS_EXCLUIDAS = "precifiq_deleted_platforms";
  var LS_FUT = "precifiq_devolucoes_futuras";
  // A mesma chave (e o mesmo formato) da tela Lembretes.
  var LS_LEMBRETES = "precifiq_lembretes";

  // A categoria (tag) das saídas lançadas por esta tela no Controle
  // Financeiro. O mesmo texto está no <select> do Registrar Saída.
  var CATEGORIA_FIN = "DEVOLUÇÃO";
  var ORIGEM_FIN = "devolucoes";

  var ESTADOS = {
    avariado: "Avariado",
    danificado: "Danificado",
    bom: "Bom estado",
    garantia: "Garantia",
    outros: "Outros",
  };

  // Linhas da lista por vez ("Mostrar mais" acrescenta outro tanto).
  var PASSO = 30;
  var MAX_SUGESTOES = 12;

  var $ = function (id) {
    return document.getElementById(id);
  };

  // ─────────────────────────────────────────────
  //  ÍCONES
  // ─────────────────────────────────────────────
  function svg(corpo, tam, extra) {
    tam = tam || 16;
    return (
      '<svg width="' +
      tam +
      '" height="' +
      tam +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="' +
      (extra || 2) +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      corpo +
      "</svg>"
    );
  }
  var I_CAIXA =
    '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>';
  var I_EXPORTAR =
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line>';
  var I_OK =
    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>';
  var I_AVISO =
    '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>';
  var I_EDITAR =
    '<path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>';
  var I_LIXO =
    '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>';
  var I_INFO =
    '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>';
  var I_PREDIO =
    '<path d="M3 21h18"></path><path d="M5 21V7l8-4v18"></path><path d="M19 21V11l-6-4"></path>';
  var I_TODAS =
    '<rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect>';
  var I_ALERTA_MINI =
    '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>';
  var I_NOTA =
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line>';
  var I_RECEBER =
    '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>';
  var I_SINO =
    '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>';
  var I_MAIS =
    '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line>';

  // ─────────────────────────────────────────────
  //  UTILITÁRIOS
  // ─────────────────────────────────────────────
  function lerLS(chave, padrao) {
    try {
      var v = JSON.parse(localStorage.getItem(chave));
      return v === null || v === undefined ? padrao : v;
    } catch (e) {
      return padrao;
    }
  }

  function gravarLS(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
      return true;
    } catch (e) {
      registrarErro("gravar " + chave, e);
      aviso(
        "Não foi possível salvar. O armazenamento pode estar cheio — faça um backup e verifique o espaço livre.",
        "error",
        7000,
      );
      return false;
    }
  }

  function registrarErro(contexto, e) {
    try {
      if (
        typeof PrecifiqErros !== "undefined" &&
        PrecifiqErros &&
        typeof PrecifiqErros.registrar === "function"
      ) {
        PrecifiqErros.registrar(
          "Devoluções: " + contexto,
          e && e.stack ? e.stack : String(e),
        );
        return;
      }
    } catch (_) {}
    console.error("[Devoluções]", contexto, e);
  }

  function aviso(msg, tipo, ms) {
    if (typeof showToast === "function")
      showToast(msg, tipo || "default", ms || 3600);
    else console.log("[" + (tipo || "info") + "]", msg);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Arredonda para centavos, cortando o resíduo do ponto flutuante. */
  function cent(n) {
    var v = Number(n);
    if (!isFinite(v)) return 0;
    return Math.round(v * 100) / 100;
  }

  function brl(n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    if (typeof formatBRL === "function") return formatBRL(cent(v));
    return (
      "R$ " +
      cent(v).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  function pct(n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return (
      v.toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }) + "%"
    );
  }

  function inteiro(n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return Math.round(v).toLocaleString("pt-BR");
  }

  /** Texto com dinheiro no formato BR ("1.265,00") → número. */
  function numeroDoTexto(txt) {
    if (typeof numeroDeTextoBR === "function") return numeroDeTextoBR(txt);
    var s = String(txt == null ? "" : txt)
      .replace(/[^\d,.-]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  /** Número → texto do campo de dinheiro ("1.265,00"). */
  function textoDoNumero(n) {
    if (typeof textoBRdeNumero === "function") return textoBRdeNumero(n);
    return cent(n).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /**
   * A porcentagem de imposto guardada em Dados da Empresa. O campo é texto:
   * pode vir "6", "6,5", "6.5" ou "6,50%". Vazio ou inválido → null.
   */
  function porcentagemDe(txt) {
    if (txt === null || txt === undefined) return null;
    if (typeof txt === "number") return isFinite(txt) && txt >= 0 ? txt : null;
    var s = String(txt)
      .trim()
      .replace(/[^\d,.-]/g, "");
    if (!s) return null;
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) && n >= 0 ? n : null;
  }

  function p2(n) {
    return String(n).padStart(2, "0");
  }
  function isoDe(d) {
    return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
  }
  function hojeISO() {
    return isoDe(new Date());
  }
  function dataValida(iso) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""));
  }
  function fmtData(iso) {
    if (!dataValida(iso)) return "";
    var p = String(iso).split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
  }
  function fmtDataHora(ms) {
    if (!ms) return "";
    try {
      var d = new Date(ms);
      return (
        d.toLocaleDateString("pt-BR") +
        " às " +
        d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      );
    } catch (e) {
      return "";
    }
  }

  function normSku(t) {
    return String(t || "")
      .trim()
      .toUpperCase();
  }
  function normTxt(t) {
    var s = String(t || "").toLowerCase();
    try {
      s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    } catch (e) {}
    return s.trim();
  }

  function novoId() {
    if (typeof generateId === "function") return "dev_" + generateId();
    return (
      "dev_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 10)
    );
  }

  function iniciais(nome) {
    var partes = String(nome || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!partes.length) return "?";
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (
      partes[0].charAt(0) + partes[partes.length - 1].charAt(0)
    ).toUpperCase();
  }

  function logoMini(logo, tam, nome) {
    var s = tam || 30;
    if (logo) {
      return (
        '<img class="dev-logo-mini" src="' +
        esc(logo) +
        '" alt="" style="width:' +
        s +
        "px;height:" +
        s +
        'px;" />'
      );
    }
    return (
      '<span class="dev-logo-mini dev-logo-mini--vazio" style="width:' +
      s +
      "px;height:" +
      s +
      'px;" title="' +
      esc(nome || "") +
      '">' +
      svg(I_PREDIO, Math.round(s * 0.55)) +
      "</span>"
    );
  }

  // ─────────────────────────────────────────────
  //  PREFERÊNCIAS DA TELA
  // ─────────────────────────────────────────────
  function lerPref() {
    var p = lerLS(LS_TELA, null);
    return p && typeof p === "object" ? p : {};
  }
  function gravarPref(mudanca) {
    var p = lerPref();
    Object.keys(mudanca).forEach(function (k) {
      p[k] = mudanca[k];
    });
    try {
      localStorage.setItem(LS_TELA, JSON.stringify(p));
    } catch (e) {}
  }

  // ─────────────────────────────────────────────
  //  EMPRESAS (cadastro central — só leitura)
  // ─────────────────────────────────────────────
  function listarEmpresas() {
    var raw = lerLS(LS_EMPRESA, null);
    var lista = raw && Array.isArray(raw.empresas) ? raw.empresas : [];
    return lista
      .filter(function (e) {
        return e && e.id;
      })
      .map(function (e, i) {
        return {
          id: e.id,
          nome:
            e.nomeAba ||
            e.nomeFantasia ||
            e.razaoSocial ||
            "Empresa " + (i + 1),
          cnpj: e.cnpj || "",
          logo: e.logo || "",
          // O mesmo campo do Processador de Planilhas ("Meus Impostos").
          imposto: porcentagemDe(e.impostoPorNota),
        };
      });
  }
  function empresaPorId(id) {
    if (!id) return null;
    return (
      listarEmpresas().find(function (e) {
        return e.id === id;
      }) || null
    );
  }

  // ─────────────────────────────────────────────
  //  LOJAS (plataformas — só leitura)
  // ─────────────────────────────────────────────
  // A mesma lista do "Canal de Venda" do Controle Financeiro: as
  // plataformas do sistema, sem as ocultas. As excluídas também ficam fora.
  function listarLojas() {
    if (typeof _loadCustomPlatforms === "function") {
      // Outra tela pode ter criado ou renomeado uma loja desde que esta abriu.
      try {
        _loadCustomPlatforms();
      } catch (e) {}
    }
    var ocultas = lerLS(LS_OCULTAS, []);
    var excluidas = lerLS(LS_EXCLUIDAS, []);
    if (!Array.isArray(ocultas)) ocultas = [];
    if (!Array.isArray(excluidas)) excluidas = [];
    var config =
      typeof PLATFORMS_CONFIG !== "undefined" ? PLATFORMS_CONFIG : [];
    return config
      .filter(function (p) {
        return (
          p && p.id && ocultas.indexOf(p.id) < 0 && excluidas.indexOf(p.id) < 0
        );
      })
      .map(function (p) {
        var logo = "";
        try {
          logo =
            typeof getPlatformLogoSrc === "function"
              ? getPlatformLogoSrc(p.id)
              : "";
        } catch (e) {}
        return { id: p.id, nome: p.name || p.id, logo: logo };
      });
  }
  function lojaPorId(id) {
    if (!id) return null;
    var config =
      typeof PLATFORMS_CONFIG !== "undefined" ? PLATFORMS_CONFIG : [];
    var p = config.find(function (x) {
      return x && x.id === id;
    });
    if (!p) return null;
    var logo = "";
    try {
      logo =
        typeof getPlatformLogoSrc === "function"
          ? getPlatformLogoSrc(p.id)
          : "";
    } catch (e) {}
    return { id: p.id, nome: p.name || p.id, logo: logo };
  }
  function lojaEhML(id) {
    try {
      if (typeof _plataformaEhML === "function") return !!_plataformaEhML(id);
      if (typeof ehMercadoLivre === "function") {
        var l = lojaPorId(id);
        return !!ehMercadoLivre(id, l && l.nome);
      }
    } catch (e) {}
    return false;
  }

  function logoLoja(id, nome, tam) {
    var l = lojaPorId(id);
    var src = l ? l.logo : "";
    var s = tam || 24;
    var ini = esc(
      String(nome || (l && l.nome) || "")
        .substring(0, 2)
        .toUpperCase(),
    );
    if (src) {
      // Logo que não carrega vira as iniciais (lidas do data-ini: assim um
      // apóstrofo no nome não quebra o código do onerror).
      return (
        '<span class="dev-loja__logo" data-ini="' +
        ini +
        '" style="width:' +
        s +
        "px;height:" +
        s +
        'px;"><img src="' +
        esc(src) +
        '" alt="" ' +
        "onerror=\"this.parentNode.textContent=this.parentNode.getAttribute('data-ini')\" /></span>"
      );
    }
    return (
      '<span class="dev-loja__logo" style="width:' +
      s +
      "px;height:" +
      s +
      'px;">' +
      ini +
      "</span>"
    );
  }

  // ─────────────────────────────────────────────
  //  PRODUTOS E PREÇOS
  // ─────────────────────────────────────────────
  var _storagePronto = false;

  /** Os produtos da loja, só para leitura (cópia rasa, sem clonar as imagens). */
  function produtosDaLoja(lojaId) {
    if (!lojaId) return [];
    try {
      if (typeof getProductsForReading === "function")
        return getProductsForReading(lojaId) || [];
      if (typeof getProducts === "function") return getProducts(lojaId) || [];
    } catch (e) {
      registrarErro("ler produtos de " + lojaId, e);
    }
    return [];
  }

  /**
   * O preço atual do produto (ou do kit) na loja.
   * Fora do Mercado Livre: o preço final gravado (finalPrice; no kit, price)
   * — o mesmo que a lista de produtos mostra.
   * No Mercado Livre, com as taxas do anúncio cadastradas: o preço do
   * Premium e o do Clássico, com a mesma conta da lista de produtos
   * (calcularUnidade/calcularKit, com a comissão de cada modalidade).
   */
  function precosDe(p, kit, ehML) {
    var r = { preco: 0, premium: 0, classico: 0, ml: false };
    r.preco = cent(kit ? Number(kit.price) || 0 : Number(p.finalPrice) || 0);
    if (!ehML) return r;
    var tp = Number(p.mlTaxaPremium) || 0;
    var tc = Number(p.mlTaxaClassico) || 0;
    if (!tp && !tc) return r;
    if (
      typeof calcularUnidade !== "function" ||
      typeof _inputsDoProdutoSalvo !== "function"
    )
      return r;
    try {
      var base = _inputsDoProdutoSalvo(p);
      var calc = function (taxa) {
        var i = Object.assign({}, base, { taxa: taxa });
        var res;
        if (kit) {
          var qty = Math.max(1, parseInt(kit.qty, 10) || 1);
          var extras =
            typeof _extrasDoKitSalvo === "function"
              ? _extrasDoKitSalvo(kit)
              : { extraRS: 0, extraPCT: 0 };
          res = calcularKit(i, qty, Number(kit.frete) || 0, extras);
        } else {
          res = calcularUnidade(i);
        }
        return res && !res.inviavel ? cent(res.precoVenda || 0) : 0;
      };
      r.premium = calc(tp);
      r.classico = calc(tc);
      r.ml = r.premium > 0 || r.classico > 0;
    } catch (e) {
      registrarErro("preço Mercado Livre", e);
    }
    return r;
  }

  /**
   * Tudo o que dá para escolher numa loja: cada produto e cada kit dele
   * (o kit tem SKU e preço próprios). Montado sob demanda e guardado
   * enquanto a janela está aberta.
   */
  var _cacheOpcoes = {};
  function opcoesDaLoja(lojaId) {
    if (!lojaId) return [];
    if (_cacheOpcoes[lojaId]) return _cacheOpcoes[lojaId];
    var ehML = lojaEhML(lojaId);
    var out = [];
    produtosDaLoja(lojaId).forEach(function (p) {
      if (!p || typeof p !== "object") return;
      var composto = Array.isArray(p.componentes) && p.componentes.length > 0;
      var nome = p.name || "Produto sem nome";
      out.push({
        chave: String(p.id) + "|",
        produtoId: p.id,
        kitId: null,
        kitQtd: 0,
        sku: p.sku || "",
        nome: nome,
        imagem: typeof p.image === "string" ? p.image : "",
        composto: composto,
        precos: precosDe(p, null, ehML),
      });
      (Array.isArray(p.kits) ? p.kits : []).forEach(function (k) {
        if (!k || typeof k !== "object") return;
        var qtd = Math.max(1, parseInt(k.qty, 10) || 1);
        out.push({
          chave: String(p.id) + "|" + String(k.id),
          produtoId: p.id,
          kitId: k.id,
          kitQtd: qtd,
          sku: k.sku || "",
          nome: nome,
          imagem:
            typeof k.image === "string" && k.image
              ? k.image
              : typeof p.image === "string"
                ? p.image
                : "",
          composto: composto,
          precos: precosDe(p, k, ehML),
        });
      });
    });
    _cacheOpcoes[lojaId] = out;
    return out;
  }

  function opcaoPorIds(lojaId, produtoId, kitId) {
    if (!lojaId || produtoId === undefined || produtoId === null) return null;
    var chave =
      String(produtoId) +
      "|" +
      (kitId === undefined || kitId === null ? "" : String(kitId));
    return (
      opcoesDaLoja(lojaId).find(function (o) {
        return o.chave === chave;
      }) || null
    );
  }

  /**
   * A busca pela SKU, conforme se digita: SKU igual primeiro, depois as que
   * começam com o texto, depois as que o contêm. O nome do produto também
   * vale, depois das SKUs.
   */
  function buscarOpcoes(lojaId, termo) {
    var t = normSku(termo);
    if (!t) return [];
    var tn = normTxt(termo);
    var lista = [];
    opcoesDaLoja(lojaId).forEach(function (o) {
      var sku = normSku(o.sku);
      var nota = -1;
      if (sku && sku === t) nota = 0;
      else if (sku && sku.indexOf(t) === 0) nota = 1;
      else if (sku && sku.indexOf(t) > 0) nota = 2;
      else if (normTxt(o.nome).indexOf(tn) >= 0) nota = 3;
      if (nota >= 0) lista.push({ o: o, nota: nota });
    });
    lista.sort(function (a, b) {
      if (a.nota !== b.nota) return a.nota - b.nota;
      var sa = normSku(a.o.sku),
        sb = normSku(b.o.sku);
      if (sa.length !== sb.length) return sa.length - sb.length;
      return sa.localeCompare(sb, "pt-BR");
    });
    return lista.map(function (x) {
      return x.o;
    });
  }

  function marcarTrecho(texto, termo) {
    var s = String(texto || "");
    var t = String(termo || "").trim();
    if (!t) return esc(s);
    var i = s.toUpperCase().indexOf(t.toUpperCase());
    if (i < 0) return esc(s);
    return (
      esc(s.slice(0, i)) +
      "<mark>" +
      esc(s.slice(i, i + t.length)) +
      "</mark>" +
      esc(s.slice(i + t.length))
    );
  }

  function imagemHtml(src, tam) {
    var s = tam || 40;
    if (src) {
      return (
        '<img src="' +
        esc(src) +
        '" alt="" loading="lazy" onerror="this.remove()" />'
      );
    }
    return svg(I_CAIXA, Math.round(s * 0.5), 1.8);
  }

  /** A imagem atual do produto (na lista: o produto pode ter mudado de foto). */
  function imagemDe(d, mapas) {
    var mapa = mapas[d.lojaId];
    if (!mapa) {
      mapa = mapas[d.lojaId] = {};
      produtosDaLoja(d.lojaId).forEach(function (p) {
        if (p) mapa[String(p.id)] = p;
      });
    }
    var p = mapa[String(d.produtoId)];
    if (!p) return "";
    if (d.kitId !== null && d.kitId !== undefined && Array.isArray(p.kits)) {
      var k = p.kits.find(function (x) {
        return x && String(x.id) === String(d.kitId);
      });
      if (k && typeof k.image === "string" && k.image) return k.image;
    }
    return typeof p.image === "string" ? p.image : "";
  }

  // ─────────────────────────────────────────────
  //  A CONTA DA DEVOLUÇÃO
  // ─────────────────────────────────────────────
  /**
   * A conta de uma devolução, sempre pelos dados gravados nela.
   *   total     = valor do produto × quantidade
   *   imposto   = total × alíquota (só quando gerou imposto)
   *   extra     = o valor extra pago pela devolução (frete, por exemplo)
   *   prejuízo  = o imposto + o extra, quando a plataforma NÃO reembolsou;
   *               só o extra, quando reembolsou (o reembolso é do produto:
   *               o que se pagou a mais continua saindo do bolso)
   *   reembolso = o valor reembolsado informado, quando a plataforma
   *               reembolsou (devoluções de antes do campo: o total)
   *   O imposto é sempre sobre o valor cheio da venda (total).
   */
  function calcular(d) {
    var valor = cent(d && d.valorUnitario);
    var qtd = Math.max(0, parseInt(d && d.quantidade, 10) || 0);
    var total = cent(valor * qtd);
    var gerou = !!(d && d.gerouImposto);
    var aliquota = gerou ? Math.max(0, Number(d.aliquota) || 0) : 0;
    var imposto = gerou ? cent((total * aliquota) / 100) : 0;
    // Só "Sim" é reembolso. "Aguardando" conta como "Não" até a resposta.
    var reembolsou = !!(d && d.reembolsou === true);
    var extra = Math.max(0, cent(d && d.valorExtra));
    var valorReemb = Math.max(0, cent(d && d.valorReembolsado));
    var impostoNoPrejuizo = reembolsou ? 0 : imposto;
    return {
      valor: valor,
      qtd: qtd,
      total: total,
      aliquota: aliquota,
      imposto: imposto,
      reembolsou: reembolsou,
      extra: extra,
      prejuizoImposto: impostoNoPrejuizo,
      prejuizo: cent(impostoNoPrejuizo + extra),
      reembolso: reembolsou ? (valorReemb > 0 ? valorReemb : total) : 0,
    };
  }

  // ─────────────────────────────────────────────
  //  ARMAZENAMENTO
  // ─────────────────────────────────────────────
  /**
   * "Plataforma reembolsou?": true (Sim), false (Não), "aguardando" (a
   * plataforma ainda não decidiu) ou null (sem resposta).
   */
  function reembolsoDe(v) {
    return v === true
      ? true
      : v === false
        ? false
        : v === "aguardando"
          ? "aguardando"
          : null;
  }

  function normalizar(d) {
    if (!d || typeof d !== "object" || !d.id) return null;
    var simNao = function (v) {
      return v === true ? true : v === false ? false : null;
    };
    return {
      id: String(d.id),
      criadoEm: Number(d.criadoEm) || Date.now(),
      atualizadoEm: Number(d.atualizadoEm) || Number(d.criadoEm) || Date.now(),
      empresaId: d.empresaId || "",
      empresaNome: d.empresaNome || "",
      lojaId: d.lojaId || "",
      lojaNome: d.lojaNome || "",
      produtoId: d.produtoId === undefined ? null : d.produtoId,
      kitId: d.kitId === undefined ? null : d.kitId,
      kitQtd: Math.max(0, parseInt(d.kitQtd, 10) || 0),
      sku: d.sku || "",
      produtoNome: d.produtoNome || "",
      anuncio:
        d.anuncio === "premium" || d.anuncio === "classico" ? d.anuncio : "",
      valorUnitario: cent(d.valorUnitario),
      quantidade: Math.max(1, parseInt(d.quantidade, 10) || 1),
      gerouImposto: simNao(d.gerouImposto),
      aliquota: Math.max(0, Number(d.aliquota) || 0),
      numeroVenda: d.numeroVenda || "",
      reputacao: simNao(d.reputacao),
      reembolsou: reembolsoDe(d.reembolsou),
      // Quanto a plataforma devolveu de fato (só com reembolso). Zero nas
      // devoluções de antes deste campo: o reembolso continua sendo o total.
      valorReembolsado:
        d.reembolsou === true ? Math.max(0, cent(d.valorReembolsado)) : 0,
      estado: ESTADOS[d.estado] ? d.estado : "outros",
      dataChegada: dataValida(d.dataChegada) ? d.dataChegada : "",
      observacoes: d.observacoes || "",
      // O valor extra pago pela devolução (frete, por exemplo) e o motivo.
      // Devoluções de antes deste campo ficam com zero.
      valorExtra: Math.max(0, cent(d.valorExtra)),
      motivoExtra: typeof d.motivoExtra === "string" ? d.motivoExtra : "",
      numeroErp: d.numeroErp || "",
      exportacao:
        d.exportacao &&
        typeof d.exportacao === "object" &&
        d.exportacao.lancamentoId != null
          ? d.exportacao
          : null,
      // Quem lançou (um dos usuários de Usuários e Senhas): o nome, como nos
      // outros módulos, e o id, para achar o usuário mesmo se mudar de nome.
      responsavel: typeof d.responsavel === "string" ? d.responsavel : "",
      responsavelId: typeof d.responsavelId === "string" ? d.responsavelId : "",
      // Lançada a partir de uma devolução futura (Acompanhar devoluções).
      origemFuturaId: d.origemFuturaId ? String(d.origemFuturaId) : "",
    };
  }

  function carregar() {
    var raw = lerLS(LS, null);
    var lista =
      raw && Array.isArray(raw.devolucoes)
        ? raw.devolucoes
        : Array.isArray(raw)
          ? raw
          : [];
    return lista.map(normalizar).filter(Boolean);
  }

  function gravar(lista) {
    return gravarLS(LS, { versao: 1, devolucoes: lista });
  }

  // ── Devoluções futuras (a caminho) ──
  // Os mesmos campos da devolução, quase todos opcionais (é o que se sabe
  // antes de o produto chegar), mais a previsão de chegada e a situação:
  //   "aguardando" — ainda não chegou (pode ser lançada)
  //   "lancada"    — virou a devolução devolucaoId (não lança de novo)
  function normalizarFutura(f) {
    if (!f || typeof f !== "object" || !f.id) return null;
    var simNao = function (v) {
      return v === true ? true : v === false ? false : null;
    };
    var lancada = f.status === "lancada";
    return {
      id: String(f.id),
      criadoEm: Number(f.criadoEm) || Date.now(),
      atualizadoEm: Number(f.atualizadoEm) || Number(f.criadoEm) || Date.now(),
      status: lancada ? "lancada" : "aguardando",
      empresaId: f.empresaId || "",
      empresaNome: f.empresaNome || "",
      lojaId: f.lojaId || "",
      lojaNome: f.lojaNome || "",
      produtoId: f.produtoId === undefined ? null : f.produtoId,
      kitId: f.kitId === undefined ? null : f.kitId,
      kitQtd: Math.max(0, parseInt(f.kitQtd, 10) || 0),
      sku: f.sku || "",
      produtoNome: f.produtoNome || "",
      anuncio:
        f.anuncio === "premium" || f.anuncio === "classico" ? f.anuncio : "",
      valorUnitario: Math.max(0, cent(f.valorUnitario)),
      quantidade: Math.max(1, parseInt(f.quantidade, 10) || 1),
      gerouImposto: simNao(f.gerouImposto),
      reputacao: simNao(f.reputacao),
      reembolsou: reembolsoDe(f.reembolsou),
      valorReembolsado:
        f.reembolsou === true ? Math.max(0, cent(f.valorReembolsado)) : 0,
      estado: ESTADOS[f.estado] ? f.estado : "",
      previsaoChegada: dataValida(f.previsaoChegada) ? f.previsaoChegada : "",
      numeroVenda: f.numeroVenda || "",
      numeroErp: f.numeroErp || "",
      observacoes: f.observacoes || "",
      valorExtra: Math.max(0, cent(f.valorExtra)),
      motivoExtra: typeof f.motivoExtra === "string" ? f.motivoExtra : "",
      responsavel: typeof f.responsavel === "string" ? f.responsavel : "",
      responsavelId: typeof f.responsavelId === "string" ? f.responsavelId : "",
      devolucaoId: lancada && f.devolucaoId ? String(f.devolucaoId) : "",
      lancadaEm: lancada ? Number(f.lancadaEm) || 0 : 0,
      lancadaPor:
        lancada && typeof f.lancadaPor === "string" ? f.lancadaPor : "",
      lembreteId: f.lembreteId ? String(f.lembreteId) : "",
      lembreteEm: typeof f.lembreteEm === "string" ? f.lembreteEm : "",
    };
  }

  function carregarFuturas() {
    var raw = lerLS(LS_FUT, null);
    var lista = raw && Array.isArray(raw.futuras) ? raw.futuras : [];
    return lista.map(normalizarFutura).filter(Boolean);
  }

  function gravarFuturas(lista) {
    return gravarLS(LS_FUT, { versao: 1, futuras: lista });
  }

  function novoIdFutura() {
    if (typeof generateId === "function") return "devf_" + generateId();
    return (
      "devf_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 10)
    );
  }

  // ── Lembretes (a mesma lista da tela Lembretes) ──
  function lerLembretes() {
    var a = lerLS(LS_LEMBRETES, []);
    return Array.isArray(a) ? a : [];
  }
  /** Um id no mesmo estilo do lembretes.js. */
  function novoIdLembrete() {
    return (
      "lem_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 10)
    );
  }
  /** "2026-10-15T09:00" → "15/10/2026 às 09:00". */
  function fmtDataHoraLembrete(dh) {
    var s = String(dh || "");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return "";
    return fmtData(s.slice(0, 10)) + " às " + s.slice(11, 16);
  }

  // ─────────────────────────────────────────────
  //  CONTROLE FINANCEIRO (ponte)
  //  O financeiro tem a PRÓPRIA lista de empresas (precifiq_dre), com ids
  //  dele. A ponte é a mesma do Registro de Vendas: primeiro o vínculo
  //  firme (origemEmpresaId), depois o nome — e, achando pelo nome, o
  //  vínculo é gravado; sem nenhuma, a empresa é criada lá.
  // ─────────────────────────────────────────────
  function storeVazio() {
    return {
      movimentacoes: [],
      camposOcultos: [],
      secoesCustom: [],
      ordemSecoes: [],
      meta: 0,
      camposVenda: [],
      camposDespesa: [],
      metaComemorada: 0,
    };
  }

  /**
   * O container do financeiro. Formato antigo (de antes das várias
   * empresas) não é tocado: o financeiro migra sozinho ao abrir, e gravar
   * por cima dele apagaria lançamentos.
   * @returns {object|null} null quando está num formato antigo
   */
  function lerContainerDre() {
    var raw = lerLS(LS_DRE, null);
    if (
      raw &&
      typeof raw === "object" &&
      raw.dados &&
      Array.isArray(raw.empresas)
    )
      return raw;
    if (
      raw &&
      (Array.isArray(raw) ||
        (typeof raw === "object" && Array.isArray(raw.movimentacoes)))
    )
      return null;
    if (lerLS("dreSistema", null)) return null;
    return {
      empresas: [],
      ativaId: null,
      dados: {},
      seguranca: null,
      senhaPerguntada: false,
    };
  }

  function salvarContainerDre(c) {
    return gravarLS(LS_DRE, c);
  }

  function normNome(t) {
    return String(t || "")
      .trim()
      .toLowerCase();
  }

  /** O id da empresa no financeiro que corresponde à do cadastro (cria se faltar). */
  function empresaNoDre(cont, empresaId, nome, logo) {
    if (!Array.isArray(cont.empresas)) cont.empresas = [];
    if (!cont.dados || typeof cont.dados !== "object") cont.dados = {};
    var alvo = cont.empresas.find(function (e) {
      return e && e.origemEmpresaId === empresaId;
    });
    if (!alvo) {
      var n = normNome(nome);
      alvo = cont.empresas.find(function (e) {
        return e && !e.origemEmpresaId && normNome(e.nome) === n;
      });
      if (alvo) alvo.origemEmpresaId = empresaId;
    }
    if (!alvo) {
      var id =
        typeof generateId === "function"
          ? "emp_" + generateId()
          : "emp_" +
            Date.now().toString(36) +
            "_" +
            Math.random().toString(36).slice(2, 8);
      alvo = {
        id: id,
        nome: nome || "Empresa",
        logo: logo || "",
        origemEmpresaId: empresaId,
      };
      cont.empresas.push(alvo);
      cont.dados[id] = storeVazio();
      if (!cont.ativaId) cont.ativaId = id;
    }
    if (!cont.dados[alvo.id] || typeof cont.dados[alvo.id] !== "object")
      cont.dados[alvo.id] = storeVazio();
    if (!Array.isArray(cont.dados[alvo.id].movimentacoes))
      cont.dados[alvo.id].movimentacoes = [];
    return alvo;
  }

  /** O lançamento exportado de uma devolução, se ainda existir no financeiro. */
  function acharLancamento(cont, d) {
    if (!cont || !d || !d.exportacao) return null;
    var exp = d.exportacao;
    var procurar = function (empId) {
      var st = cont.dados && cont.dados[empId];
      if (!st || !Array.isArray(st.movimentacoes)) return null;
      for (var i = 0; i < st.movimentacoes.length; i++) {
        var m = st.movimentacoes[i];
        if (m && String(m.id) === String(exp.lancamentoId))
          return { empId: empId, store: st, idx: i, mov: m };
      }
      return null;
    };
    var achado = exp.dreEmpresaId ? procurar(exp.dreEmpresaId) : null;
    if (achado) return achado;
    // Plano B: o lançamento guarda de qual devolução veio.
    var ids = Object.keys(cont.dados || {});
    for (var j = 0; j < ids.length; j++) {
      var st = cont.dados[ids[j]];
      if (!st || !Array.isArray(st.movimentacoes)) continue;
      for (var k = 0; k < st.movimentacoes.length; k++) {
        var m = st.movimentacoes[k];
        if (
          m &&
          m.origemDevolucaoId === d.id &&
          String(m.id) === String(exp.lancamentoId)
        ) {
          return { empId: ids[j], store: st, idx: k, mov: m };
        }
      }
    }
    return null;
  }

  /**
   * Situação da devolução no financeiro:
   *   "nao"       — nunca exportada
   *   "ok"        — exportada, com o valor de hoje
   *   "diferente" — exportada, mas o prejuízo mudou depois
   *   "perdido"   — exportada, mas o lançamento foi excluído no financeiro
   */
  function situacaoFin(d, cont) {
    if (!d.exportacao) return "nao";
    var achado = acharLancamento(cont, d);
    if (!achado) return "perdido";
    var valorLa = cent(Math.abs(Number(achado.mov.liquido) || 0));
    return valorLa === calcular(d).prejuizo ? "ok" : "diferente";
  }

  function descricaoPadrao(d) {
    var partes = ["Devolução"];
    var prod = d.produtoNome || "produto";
    if (d.kitQtd > 1) prod += " (kit " + d.kitQtd + " un)";
    partes.push(prod + (d.sku ? " — SKU " + d.sku : ""));
    if (d.numeroVenda) partes.push("venda nº " + d.numeroVenda);
    // O valor extra entra no valor lançado: a descrição diz qual foi.
    var extra = calcular(d).extra;
    if (extra > 0)
      partes.push(
        "valor extra " +
          brl(extra) +
          (d.motivoExtra ? " (" + d.motivoExtra + ")" : ""),
      );
    return partes.join(" — ").slice(0, 160);
  }

  /** Cria a saída DEVOLUÇÃO no container (não grava; quem chama grava). */
  function criarLancamento(cont, d, op) {
    var c = calcular(d);
    var emp = empresaPorId(d.empresaId);
    var alvo = empresaNoDre(
      cont,
      d.empresaId,
      emp ? emp.nome : d.empresaNome,
      emp ? emp.logo : "",
    );
    var store = cont.dados[alvo.id];
    var agora = Date.now();
    var id = agora;
    var usado = function (x) {
      return store.movimentacoes.some(function (m) {
        return m && m.id === x;
      });
    };
    while (usado(id) || (op.idsUsados && op.idsUsados.indexOf(id) >= 0)) id++;
    if (op.idsUsados) op.idsUsados.push(id);
    // A mesma forma de uma saída lançada pelo Registrar Saída, com a
    // categoria DEVOLUÇÃO e a origem (para o extrato mostrar de onde veio).
    store.movimentacoes.push({
      id: id,
      tipo: "Despesa",
      data: op.data,
      canalCategoria: CATEGORIA_FIN,
      descricao: op.descricao,
      bruto: 0,
      deducoes: 0,
      camposExtras: [],
      liquido: -c.prejuizo,
      responsavel: op.responsavel || "",
      criadoEm: agora,
      atualizadoEm: agora,
      editado: false,
      origem: ORIGEM_FIN,
      origemDevolucaoId: d.id,
    });
    d.exportacao = {
      lancamentoId: id,
      dreEmpresaId: alvo.id,
      empresaFin: alvo.nome,
      em: agora,
      valor: c.prejuizo,
      data: op.data,
      responsavel: op.responsavel || "",
      descricao: op.descricao,
    };
    return { empresaFin: alvo, ativa: cont.ativaId === alvo.id };
  }

  // ─────────────────────────────────────────────
  //  ESTADO DA TELA
  // ─────────────────────────────────────────────
  var devolucoes = [];
  var empresaAtiva = ""; // "" = todas as empresas
  var ordem = { campo: "chegada", dir: "desc" };
  var limite = PASSO;
  var _destacar = null; // id da linha a piscar no próximo desenho
  var futuras = []; // as devoluções a caminho
  var vista = "lancamento"; // a tela à vista: lancamento, registrar, acompanhar
  var VISTAS = ["lancamento", "registrar", "acompanhar"];
  var _destacarFut = null; // id da futura a piscar no próximo desenho

  var CAMPOS_FILTRO = [
    "fBusca",
    "fEmpresa",
    "fLoja",
    "fEstado",
    "fReembolso",
    "fImposto",
    "fReputacao",
    "fFinanceiro",
    "fDe",
    "fAte",
  ];

  function lerFiltros() {
    var v = function (id) {
      var el = $(id);
      return el ? String(el.value || "") : "";
    };
    return {
      busca: normTxt(v("fBusca")),
      empresa: v("fEmpresa"),
      loja: v("fLoja"),
      estado: v("fEstado"),
      reembolso: v("fReembolso"),
      imposto: v("fImposto"),
      reputacao: v("fReputacao"),
      financeiro: v("fFinanceiro"),
      de: v("fDe"),
      ate: v("fAte"),
    };
  }

  function simNaoBate(filtro, valor) {
    if (!filtro) return true;
    if (filtro === "sim") return valor === true;
    if (filtro === "nao") return valor === false;
    if (filtro === "aguardando") return valor === "aguardando";
    return true;
  }

  /** As devoluções que atendem a TODOS os filtros ao mesmo tempo. */
  function filtrar(lista, f, cont) {
    return lista.filter(function (d) {
      if (f.empresa && d.empresaId !== f.empresa) return false;
      if (f.loja && d.lojaId !== f.loja) return false;
      if (f.estado && d.estado !== f.estado) return false;
      if (!simNaoBate(f.reembolso, d.reembolsou)) return false;
      if (!simNaoBate(f.imposto, d.gerouImposto)) return false;
      if (!simNaoBate(f.reputacao, d.reputacao)) return false;
      if (f.de || f.ate) {
        if (!d.dataChegada) return false;
        if (f.de && d.dataChegada < f.de) return false;
        if (f.ate && d.dataChegada > f.ate) return false;
      }
      if (f.financeiro) {
        var prej = calcular(d).prejuizo;
        var sit = situacaoFin(d, cont);
        if (f.financeiro === "exportada" && sit !== "ok" && sit !== "diferente")
          return false;
        if (
          f.financeiro === "pendente" &&
          !(prej > 0 && (sit === "nao" || sit === "perdido"))
        )
          return false;
        if (f.financeiro === "sem-prejuizo" && prej > 0) return false;
      }
      if (f.busca) {
        var alvo = normTxt(
          [
            d.sku,
            d.produtoNome,
            d.numeroVenda,
            d.numeroErp,
            d.observacoes,
            d.lojaNome,
            d.empresaNome,
            ESTADOS[d.estado] || "",
            d.responsavel,
            d.motivoExtra,
          ].join(" "),
        );
        if (alvo.indexOf(f.busca) < 0) return false;
      }
      return true;
    });
  }

  function ordenar(lista) {
    var sinal = ordem.dir === "asc" ? 1 : -1;
    var quando = function (d) {
      return d.dataChegada || isoDe(new Date(d.criadoEm));
    };
    return lista.slice().sort(function (a, b) {
      var r = 0;
      if (ordem.campo === "valor") r = calcular(a).total - calcular(b).total;
      else if (ordem.campo === "prejuizo")
        r = calcular(a).prejuizo - calcular(b).prejuizo;
      else {
        var qa = quando(a),
          qb = quando(b);
        r = qa < qb ? -1 : qa > qb ? 1 : 0;
      }
      if (r) return r * sinal;
      return (b.criadoEm || 0) - (a.criadoEm || 0);
    });
  }

  // ─────────────────────────────────────────────
  //  MENU LATERAL: EMPRESAS
  // ─────────────────────────────────────────────
  function renderEmpresas() {
    var cont = $("listaEmpresas");
    if (!cont) return;
    var empresas = listarEmpresas();
    var contagem = {};
    devolucoes.forEach(function (d) {
      contagem[d.empresaId] = (contagem[d.empresaId] || 0) + 1;
    });

    if (!empresas.length) {
      cont.innerHTML =
        '<div class="sidebar-label-txt dev-emp-vazio">Nenhuma empresa cadastrada.</div>';
      return;
    }

    var itens = [
      { id: "", nome: "Todas as empresas", todas: true, n: devolucoes.length },
    ].concat(
      empresas.map(function (e) {
        return { id: e.id, nome: e.nome, logo: e.logo, n: contagem[e.id] || 0 };
      }),
    );
    cont.innerHTML = itens
      .map(function (e) {
        var ativa = e.id === empresaAtiva;
        return (
          '<button type="button" class="empresa-item-btn' +
          (ativa ? " ativa" : "") +
          '" data-emp-id="' +
          esc(e.id) +
          '" ' +
          'title="' +
          esc(e.nome) +
          '"' +
          (ativa ? ' aria-current="true"' : "") +
          ">" +
          (e.todas
            ? '<span class="dev-emp-todas-ico">' + svg(I_TODAS, 15) + "</span>"
            : logoMini(e.logo, 30, e.nome)) +
          '<span class="sidebar-label-txt empresa-item-nome">' +
          esc(e.nome) +
          "</span>" +
          '<span class="sidebar-label-txt dev-emp-contagem" title="Devoluções registradas">' +
          inteiro(e.n) +
          "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  function escolherEmpresa(id) {
    empresaAtiva = id || "";
    var sel = $("fEmpresa");
    if (sel) {
      if (
        empresaAtiva &&
        !Array.prototype.some.call(sel.options, function (o) {
          return o.value === empresaAtiva;
        })
      ) {
        preencherFiltrosOpcoes();
      }
      sel.value = empresaAtiva;
    }
    gravarPref({ empresa: empresaAtiva });
    limite = PASSO;
    render();
  }

  // ─────────────────────────────────────────────
  //  FILTROS: opções e estado
  // ─────────────────────────────────────────────
  function preencherFiltrosOpcoes() {
    var selEmp = $("fEmpresa");
    var selLoja = $("fLoja");
    if (selEmp) {
      var atual = selEmp.value;
      var vistas = {};
      var ops = listarEmpresas().map(function (e) {
        vistas[e.id] = true;
        return { id: e.id, nome: e.nome };
      });
      // Empresas que saíram do cadastro mas têm devoluções continuam filtráveis.
      devolucoes.forEach(function (d) {
        if (d.empresaId && !vistas[d.empresaId]) {
          vistas[d.empresaId] = true;
          ops.push({
            id: d.empresaId,
            nome: (d.empresaNome || "Empresa") + " (removida)",
          });
        }
      });
      selEmp.innerHTML =
        '<option value="">Todas as empresas</option>' +
        ops
          .map(function (o) {
            return (
              '<option value="' + esc(o.id) + '">' + esc(o.nome) + "</option>"
            );
          })
          .join("");
      selEmp.value = ops.some(function (o) {
        return o.id === atual;
      })
        ? atual
        : "";
    }
    if (selLoja) {
      var atualL = selLoja.value;
      var vistasL = {};
      var opsL = listarLojas().map(function (l) {
        vistasL[l.id] = true;
        return { id: l.id, nome: l.nome };
      });
      devolucoes.forEach(function (d) {
        if (d.lojaId && !vistasL[d.lojaId]) {
          vistasL[d.lojaId] = true;
          var l = lojaPorId(d.lojaId);
          opsL.push({
            id: d.lojaId,
            nome: l ? l.nome : (d.lojaNome || "Loja") + " (removida)",
          });
        }
      });
      selLoja.innerHTML =
        '<option value="">Todas as lojas</option>' +
        opsL
          .map(function (o) {
            return (
              '<option value="' + esc(o.id) + '">' + esc(o.nome) + "</option>"
            );
          })
          .join("");
      selLoja.value = opsL.some(function (o) {
        return o.id === atualL;
      })
        ? atualL
        : "";
    }
  }

  /** O que aparece aceso: o campo (ou o botão do calendário, nas datas). */
  function alvoVisual(el) {
    if (!el) return null;
    if (el.type === "date") {
      var wrap = el.closest(".dtp-wrap");
      var btn = wrap ? wrap.querySelector(".dtp-field") : null;
      if (btn) return btn;
    }
    return el;
  }

  function atualizarIndicadoresFiltros() {
    var n = 0;
    CAMPOS_FILTRO.forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var ativo = String(el.value || "").trim() !== "";
      if (ativo) n++;
      var v = alvoVisual(el);
      if (v) v.classList.toggle("dev-filtro-ativo", ativo);
    });
    var cont = $("filtrosAtivos");
    if (cont) {
      cont.hidden = !n;
      cont.textContent = n === 1 ? "1 ativo" : n + " ativos";
    }
    var btn = $("btnLimparFiltros");
    if (btn) btn.disabled = !n;
    return n;
  }

  function limparFiltros() {
    CAMPOS_FILTRO.forEach(function (id) {
      var el = $(id);
      if (el) el.value = "";
    });
    empresaAtiva = "";
    gravarPref({ empresa: "" });
    limite = PASSO;
    render();
  }

  // ─────────────────────────────────────────────
  //  CARDS
  // ─────────────────────────────────────────────
  function renderCards(lista, total, nFiltros) {
    var unidades = 0,
      prejuizo = 0,
      comPrejuizo = 0,
      reembolso = 0,
      nReemb = 0;
    var nAguard = 0;
    var comImposto = 0,
      extras = 0,
      nExtras = 0;
    var porProduto = {},
      porLoja = {};
    lista.forEach(function (d) {
      var c = calcular(d);
      unidades += c.qtd * (d.kitQtd > 1 ? d.kitQtd : 1);
      prejuizo += c.prejuizo;
      if (c.prejuizo > 0) comPrejuizo++;
      if (c.prejuizoImposto > 0) comImposto++;
      if (c.extra > 0) {
        extras += c.extra;
        nExtras++;
      }
      if (c.reembolsou) {
        reembolso += c.reembolso;
        nReemb++;
      }
      if (d.reembolsou === "aguardando") nAguard++;
      var chaveP = normSku(d.sku) || "#" + normTxt(d.produtoNome);
      var pp =
        porProduto[chaveP] ||
        (porProduto[chaveP] = {
          nome: d.produtoNome,
          sku: d.sku,
          n: 0,
          un: 0,
          ult: 0,
        });
      pp.n++;
      pp.un += c.qtd;
      if ((d.criadoEm || 0) > pp.ult) {
        pp.ult = d.criadoEm || 0;
        pp.nome = d.produtoNome || pp.nome;
      }
      var chaveL = d.lojaId || "#" + normTxt(d.lojaNome);
      var pl =
        porLoja[chaveL] ||
        (porLoja[chaveL] = { id: d.lojaId, nome: d.lojaNome, n: 0 });
      pl.n++;
    });

    var n = lista.length;
    $("kpiTotal").textContent = inteiro(n);
    $("kpiTotalSub").textContent = n
      ? unidades === 1
        ? "1 unidade devolvida"
        : inteiro(unidades) + " unidades devolvidas"
      : "Nenhuma devolução " + (nFiltros ? "com estes filtros" : "registrada");

    // Mais frequente = mais registros; empate, mais unidades.
    var rankP = Object.keys(porProduto)
      .map(function (k) {
        return porProduto[k];
      })
      .sort(function (a, b) {
        return (
          b.n - a.n ||
          b.un - a.un ||
          String(a.nome).localeCompare(String(b.nome), "pt-BR")
        );
      });
    var topP = rankP[0];
    var elP = $("kpiProduto");
    if (topP) {
      // A SKU no lugar do nome (sem SKU, o nome); o nome fica só ao parar o mouse.
      elP.textContent = topP.sku || topP.nome || "Produto";
      elP.title =
        (topP.sku ? "SKU " + topP.sku : "") +
        (topP.nome ? (topP.sku ? " — " : "") + topP.nome : "");
      $("kpiProdutoSub").textContent =
        (topP.n === 1 ? "1 devolução" : inteiro(topP.n) + " devoluções") +
        " · " +
        inteiro(topP.un) +
        " un.";
    } else {
      elP.textContent = "—";
      elP.title = "";
      $("kpiProdutoSub").textContent = "";
    }
    // O 2º e o 3º lugares.
    var elRank = $("kpiProdutoLista");
    if (elRank) {
      var resto = rankP.slice(1, 3);
      elRank.hidden = !resto.length;
      elRank.innerHTML = resto
        .map(function (p) {
          var nomeP = p.sku || p.nome || "Produto";
          return (
            '<li title="' +
            esc(
              (p.sku ? "SKU " + p.sku : "") +
                (p.nome ? (p.sku ? " — " : "") + p.nome : "") +
                " · " +
                (p.n === 1 ? "1 devolução" : inteiro(p.n) + " devoluções") +
                " · " +
                inteiro(p.un) +
                " un.",
            ) +
            '">' +
            '<span class="dev-card__ranking-nome">' +
            esc(nomeP) +
            "</span>" +
            '<span class="dev-card__ranking-n">' +
            inteiro(p.n) +
            "</span></li>"
          );
        })
        .join("");
    }

    var topL = Object.keys(porLoja)
      .map(function (k) {
        return porLoja[k];
      })
      .sort(function (a, b) {
        return (
          b.n - a.n || String(a.nome).localeCompare(String(b.nome), "pt-BR")
        );
      })[0];
    var elL = $("kpiLoja");
    if (topL) {
      var l = lojaPorId(topL.id);
      elL.textContent = l ? l.nome : topL.nome || "Loja";
      elL.title = elL.textContent;
      $("kpiLojaSub").textContent =
        (topL.n === 1 ? "1 devolução" : inteiro(topL.n) + " devoluções") +
        " · " +
        pct(Math.round((topL.n / n) * 1000) / 10) +
        " do total";
    } else {
      elL.textContent = "—";
      elL.title = "";
      $("kpiLojaSub").textContent = "";
    }

    var elPrej = $("kpiPrejuizo");
    elPrej.textContent = brl(prejuizo);
    elPrej.classList.toggle("tem-valor", prejuizo > 0);
    // O prejuízo é o imposto sem reembolso mais os valores extras.
    var qtdDev = function (k) {
      return k === 1 ? "1 devolução" : inteiro(k) + " devoluções";
    };
    var subPrej = $("kpiPrejuizoSub");
    extras = cent(extras);
    if (!comPrejuizo) {
      subPrej.textContent =
        "Sem prejuízo" + (n ? " nas devoluções listadas" : "");
      subPrej.title = "";
    } else if (!(extras > 0)) {
      subPrej.textContent =
        "Imposto de " + qtdDev(comImposto) + " sem reembolso";
      subPrej.title = "";
    } else if (comImposto) {
      subPrej.textContent = "Impostos + " + brl(extras) + " em valores extras";
      subPrej.title =
        "Imposto de " +
        qtdDev(comImposto) +
        " sem reembolso e " +
        brl(extras) +
        " em valores extras de " +
        qtdDev(nExtras) +
        ".";
    } else {
      subPrej.textContent = "Valores extras de " + qtdDev(nExtras);
      subPrej.title =
        brl(extras) + " em valores extras de " + qtdDev(nExtras) + ".";
    }

    var elR = $("kpiReembolsos");
    elR.textContent = brl(reembolso);
    elR.classList.toggle("tem-valor", reembolso > 0);
    $("kpiReembolsosSub").textContent =
      (nReemb
        ? (nReemb === 1
            ? "1 devolução reembolsada"
            : inteiro(nReemb) + " devoluções reembolsadas") + " pela plataforma"
        : "Nenhuma devolução reembolsada") +
      // As que esperam a decisão da plataforma.
      (nAguard ? " · " + inteiro(nAguard) + " aguardando" : "");

    var nota = $("devCardsNota");
    if (nota) {
      nota.innerHTML = nFiltros
        ? "Os números consideram os filtros abaixo: <strong>" +
          inteiro(n) +
          "</strong> de " +
          inteiro(total) +
          " devoluç" +
          (total === 1 ? "ão" : "ões") +
          "."
        : "";
    }
  }

  // ─────────────────────────────────────────────
  //  LISTAGEM
  // ─────────────────────────────────────────────
  /** A etiqueta do valor extra (as duas listas); ao parar o mouse, o valor e o motivo. */
  function tagExtra(valor, motivo) {
    var titulo =
      "Valor extra de " +
      brl(valor) +
      (motivo ? " — " + motivo : "") +
      ". Entra no prejuízo.";
    return (
      '<span class="dev-tag dev-tag--extra" title="' +
      esc(titulo) +
      '">' +
      svg(I_MAIS, 11) +
      "Extra</span>"
    );
  }

  function botaoFinanceiro(d, sit, c) {
    if (sit === "ok") {
      return (
        '<button type="button" class="dev-acao dev-acao--feito" data-fin="' +
        esc(d.id) +
        '" title="Lançada no Controle Financeiro em ' +
        esc(fmtData(d.exportacao.data) || fmtDataHora(d.exportacao.em)) +
        " (" +
        esc(brl(d.exportacao.valor)) +
        ')" aria-label="Lançada no Controle Financeiro">' +
        svg(I_OK, 15) +
        "</button>"
      );
    }
    if (sit === "diferente") {
      return (
        '<button type="button" class="dev-acao dev-acao--aviso" data-fin="' +
        esc(d.id) +
        '" title="O prejuízo mudou depois do lançamento no Controle Financeiro. Clique para atualizar." aria-label="Atualizar o lançamento no Controle Financeiro">' +
        svg(I_AVISO, 15) +
        "</button>"
      );
    }
    if (c.prejuizo <= 0) {
      return (
        '<button type="button" class="dev-acao dev-acao--inativo" data-fin="' +
        esc(d.id) +
        '" title="' +
        esc(
          c.reembolsou
            ? "Reembolsada pela plataforma: sem prejuízo para lançar no Financeiro."
            : "Sem imposto nem valor extra: sem prejuízo para lançar no Financeiro.",
        ) +
        '" aria-label="Sem prejuízo para lançar">' +
        svg(I_EXPORTAR, 15) +
        "</button>"
      );
    }
    var titulo =
      sit === "perdido"
        ? "O lançamento desta devolução foi excluído no Controle Financeiro. Clique para lançar de novo."
        : "Exportar para o Controle Financeiro (saída DEVOLUÇÃO)";
    return (
      '<button type="button" class="dev-acao dev-acao--fin" data-fin="' +
      esc(d.id) +
      '" title="' +
      esc(titulo) +
      '" aria-label="Exportar para o Controle Financeiro">' +
      svg(I_EXPORTAR, 15) +
      "</button>"
    );
  }

  function linhaHtml(d, cont, mapas) {
    var c = calcular(d);
    var sit = situacaoFin(d, cont);
    var nada = '<span class="dev-valor-nada">—</span>';
    var img = imagemDe(d, mapas);
    var meta = [];
    if (d.sku) meta.push("SKU " + esc(d.sku));
    if (d.numeroVenda) meta.push("Venda nº " + esc(d.numeroVenda));
    if (d.numeroErp) meta.push("ERP " + esc(d.numeroErp));
    if (d.responsavel) meta.push("Resp. " + esc(d.responsavel));
    var tags = [];
    if (d.kitQtd > 1)
      tags.push(
        '<span class="dev-tag dev-tag--kit">Kit ' + d.kitQtd + " un</span>",
      );
    if (d.anuncio)
      tags.push(
        '<span class="dev-tag">' +
          (d.anuncio === "premium" ? "Premium" : "Clássico") +
          "</span>",
      );
    if (d.reputacao === true)
      tags.push(
        '<span class="dev-tag dev-tag--reputacao" title="A devolução afetou a reputação na plataforma">' +
          svg(I_ALERTA_MINI, 11) +
          "Reputação</span>",
      );
    if (d.observacoes)
      tags.push(
        '<span class="dev-tag dev-tag--obs" title="' +
          esc(d.observacoes) +
          '">' +
          svg(I_NOTA, 11) +
          "Obs.</span>",
      );
    if (c.extra > 0) tags.push(tagExtra(c.extra, d.motivoExtra));
    if (sit === "ok" || sit === "diferente")
      tags.push(
        '<span class="dev-tag dev-tag--fin" title="Lançada no Controle Financeiro como DEVOLUÇÃO">Financeiro</span>',
      );
    if (sit === "perdido")
      tags.push(
        '<span class="dev-tag dev-tag--alerta" title="O lançamento foi excluído no Controle Financeiro">Lançamento excluído</span>',
      );

    var l = lojaPorId(d.lojaId);
    var nomeLoja = l ? l.nome : d.lojaNome || "—";
    var emp = empresaPorId(d.empresaId);
    var nomeEmp = emp ? emp.nome : d.empresaNome || "";

    var impostoHtml;
    if (!d.gerouImposto)
      impostoHtml = nada + '<span class="dev-sub-num">sem imposto</span>';
    else if (c.reembolsou)
      impostoHtml =
        '<span class="dev-riscado" title="Registrado, mas não conta: a plataforma reembolsou">' +
        esc(brl(c.imposto)) +
        '</span><span class="dev-sub-num">não conta</span>';
    else
      impostoHtml =
        esc(brl(c.imposto)) +
        '<span class="dev-sub-num">' +
        esc(pct(c.aliquota)) +
        "</span>";

    // Quantidade embaixo do valor; reembolso embaixo do prejuízo.
    var valorSub =
      inteiro(c.qtd) +
      (d.kitQtd > 1 ? (c.qtd === 1 ? " kit" : " kits") : "") +
      " × " +
      brl(c.valor);
    var prejuizoHtml =
      (c.prejuizo > 0
        ? '<span class="dev-prejuizo">' + esc(brl(c.prejuizo)) + "</span>"
        : '<span class="dev-prejuizo--zero">' + esc(brl(0)) + "</span>") +
      (c.extra > 0
        ? '<span class="dev-sub-num dev-sub-num--extra" title="' +
          esc("Valor extra" + (d.motivoExtra ? ": " + d.motivoExtra : "")) +
          '">com ' +
          esc(brl(c.extra)) +
          " extra</span>"
        : "") +
      (d.reembolsou === true
        ? '<span class="dev-sub-num dev-sub-num--reemb" title="' +
          esc(
            "A plataforma reembolsou " +
              brl(c.reembolso) +
              (c.reembolso !== c.total
                ? " (valor da venda: " + brl(c.total) + ")"
                : ""),
          ) +
          '">reembolso ' +
          esc(brl(c.reembolso)) +
          "</span>"
        : d.reembolsou === "aguardando"
          ? '<span class="dev-sub-num dev-sub-num--aguardando" title="A plataforma ainda não decidiu o reembolso: por enquanto, conta como sem reembolso">aguardando reembolso</span>'
          : '<span class="dev-sub-num">sem reembolso</span>');

    return (
      '<tr data-id="' +
      esc(d.id) +
      '"' +
      (_destacar === d.id ? ' class="dev-linha-nova"' : "") +
      ">" +
      '<td class="dev-td-prod"><div class="dev-prod"><span class="dev-prod__img">' +
      imagemHtml(img, 40) +
      "</span>" +
      '<div class="dev-prod__txt"><div class="dev-prod__nome" title="' +
      esc(d.produtoNome) +
      '">' +
      esc(d.produtoNome || "Produto") +
      "</div>" +
      (meta.length
        ? '<div class="dev-prod__meta">' + meta.join(" · ") + "</div>"
        : "") +
      (tags.length
        ? '<div class="dev-prod__tags">' + tags.join("") + "</div>"
        : "") +
      "</div></div></td>" +
      '<td><div class="dev-loja">' +
      logoLoja(d.lojaId, nomeLoja, 24) +
      '<div class="dev-loja__txt"><div class="dev-loja__nome">' +
      esc(nomeLoja) +
      "</div>" +
      (!empresaAtiva && nomeEmp
        ? '<div class="dev-loja__emp">' + esc(nomeEmp) + "</div>"
        : "") +
      "</div></div></td>" +
      "<td>" +
      (d.dataChegada ? esc(fmtData(d.dataChegada)) : nada) +
      "</td>" +
      '<td><span class="dev-tag dev-estado" data-estado="' +
      esc(d.estado) +
      '">' +
      esc(ESTADOS[d.estado] || "Outros") +
      "</span></td>" +
      '<td class="num">' +
      esc(brl(c.total)) +
      '<span class="dev-sub-num">' +
      esc(valorSub) +
      "</span></td>" +
      '<td class="num">' +
      impostoHtml +
      "</td>" +
      '<td class="num">' +
      prejuizoHtml +
      "</td>" +
      '<td class="dev-col-acoes"><div class="dev-acoes">' +
      botaoFinanceiro(d, sit, c) +
      '<button type="button" class="dev-acao" data-editar="' +
      esc(d.id) +
      '" title="Editar" aria-label="Editar">' +
      svg(I_EDITAR, 15) +
      "</button>" +
      '<button type="button" class="dev-acao danger" data-excluir="' +
      esc(d.id) +
      '" title="Excluir" aria-label="Excluir">' +
      svg(I_LIXO, 15) +
      "</button>" +
      "</div></td>" +
      "</tr>"
    );
  }

  function renderLista(lista, cont, total, nFiltros) {
    var corpo = $("devCorpo");
    if (!corpo) return;
    var ordenada = ordenar(lista);
    var visiveis = ordenada.slice(0, limite);
    var mapas = {};
    corpo.innerHTML = visiveis
      .map(function (d) {
        return linhaHtml(d, cont, mapas);
      })
      .join("");
    _destacar = null;

    document
      .querySelectorAll(".dev-tabela th.dev-ordenavel")
      .forEach(function (th) {
        var ativo = th.dataset.ordem === ordem.campo;
        th.classList.toggle("asc", ativo && ordem.dir === "asc");
        th.classList.toggle("desc", ativo && ordem.dir === "desc");
        th.setAttribute(
          "aria-sort",
          ativo ? (ordem.dir === "asc" ? "ascending" : "descending") : "none",
        );
        th.title = "Ordenar por " + th.textContent.trim().toLowerCase();
      });

    var vazio = $("devVazio");
    var tabela = document.querySelector(".dev-tabela-wrap");
    if (vazio) vazio.hidden = lista.length > 0;
    if (tabela) tabela.style.display = lista.length ? "" : "none";
    if (!lista.length && vazio) {
      if (total && nFiltros) {
        $("devVazioTitulo").textContent = "Nenhuma devolução com estes filtros";
        $("devVazioTexto").innerHTML =
          "Mude ou limpe os filtros para ver as outras devoluções.";
      } else {
        $("devVazioTitulo").textContent = "Nenhuma devolução registrada";
        $("devVazioTexto").innerHTML =
          "Clique em <strong>Adicionar Devolução</strong> para registrar a primeira.";
      }
    }

    var cont2 = $("listaContagem");
    if (cont2) cont2.textContent = lista.length ? inteiro(lista.length) : "";

    var mais = $("devMais");
    if (mais) {
      var resta = ordenada.length - visiveis.length;
      mais.hidden = resta <= 0;
      $("devMaisContagem").textContent =
        "Mostrando " +
        inteiro(visiveis.length) +
        " de " +
        inteiro(ordenada.length);
      $("btnMostrarMais").textContent =
        "Mostrar mais " + inteiro(Math.min(PASSO, Math.max(resta, 0)));
    }

    // Exportar em lote: só faz sentido com algo pendente na lista.
    var pendentes = lista.filter(function (d) {
      var s = situacaoFin(d, cont);
      return calcular(d).prejuizo > 0 && (s === "nao" || s === "perdido");
    }).length;
    var btnLote = $("btnExportarLote");
    if (btnLote) {
      btnLote.disabled = !pendentes;
      btnLote.title = pendentes
        ? "Lança no Controle Financeiro, como saída DEVOLUÇÃO, " +
          (pendentes === 1
            ? "a devolução"
            : "as " + pendentes + " devoluções") +
          " da lista com prejuízo ainda não exportada" +
          (pendentes === 1 ? "" : "s")
        : "Nenhuma devolução da lista com prejuízo para exportar";
    }
  }

  function renderSubtitulo() {
    var sub = $("devSubtitulo");
    if (!sub) return;
    var emp = empresaAtiva ? empresaPorId(empresaAtiva) : null;
    var nome = empresaAtiva
      ? emp
        ? emp.nome
        : "Empresa removida do cadastro"
      : "Todas as empresas";
    var n = empresaAtiva
      ? devolucoes.filter(function (d) {
          return d.empresaId === empresaAtiva;
        }).length
      : devolucoes.length;
    sub.innerHTML =
      "<strong>" +
      esc(nome) +
      "</strong> · " +
      (n === 1
        ? "1 devolução registrada"
        : inteiro(n) + " devoluções registradas");
  }

  function render() {
    var empresas = listarEmpresas();
    var semNada = !empresas.length && !devolucoes.length;
    var blocoSem = $("devSemEmpresa");
    var conteudo = $("devConteudo");
    if (blocoSem) blocoSem.hidden = !semNada;
    if (conteudo) conteudo.hidden = semNada;

    // A empresa escolhida no menu e o filtro "Empresa" são o mesmo estado.
    var selEmp = $("fEmpresa");
    if (selEmp && selEmp.value !== empresaAtiva) {
      if (
        !Array.prototype.some.call(selEmp.options, function (o) {
          return o.value === empresaAtiva;
        })
      )
        empresaAtiva = "";
      selEmp.value = empresaAtiva;
    }

    renderEmpresas();
    renderSubtitulo();
    var nFiltros = atualizarIndicadoresFiltros();
    var cont = lerContainerDre();
    var lista = filtrar(devolucoes, lerFiltros(), cont);
    renderCards(lista, devolucoes.length, nFiltros);
    renderLista(lista, cont, devolucoes.length, nFiltros);
    // As devoluções futuras (a lista de Acompanhar e o contador do menu).
    renderNav();
    renderFuturas();
  }

  // ─────────────────────────────────────────────
  //  JANELAS (abrir / fechar)
  // ─────────────────────────────────────────────
  var _focoAntes = null;
  function abrirJanela(id, focoEm) {
    var ov = $(id);
    if (!ov) return;
    _focoAntes = document.activeElement;
    ov.hidden = false;
    document.body.classList.add("dev-modal-aberto");
    setTimeout(function () {
      try {
        // Se a pessoa já clicou num campo da janela, o foco fica onde ela pôs.
        if (
          ov.contains(document.activeElement) &&
          document.activeElement !== ov
        )
          return;
        var alvo = focoEm
          ? typeof focoEm === "string"
            ? $(focoEm)
            : focoEm
          : ov.querySelector("select, input, button");
        if (alvo && !alvo.disabled) alvo.focus();
      } catch (e) {}
    }, 40);
  }
  function fecharJanela(id) {
    var ov = $(id);
    if (!ov || ov.hidden) return;
    ov.hidden = true;
    if (window.BapellCampos) window.BapellCampos.limparTodos(ov);
    if (!document.querySelector(".dev-overlay:not([hidden])"))
      document.body.classList.remove("dev-modal-aberto");
    try {
      if (_focoAntes && _focoAntes.isConnected)
        _focoAntes.focus({ preventScroll: true });
    } catch (e) {}
  }
  function janelaAberta(id) {
    var ov = $(id);
    return !!(ov && !ov.hidden);
  }

  // ─────────────────────────────────────────────
  //  JANELA: ADICIONAR / EDITAR DEVOLUÇÃO
  // ─────────────────────────────────────────────
  var form = null; // estado da janela

  function formVazio() {
    return {
      id: null,
      original: null,
      opcao: null, // produto/kit escolhido (opção da busca)
      orfao: null, // devolução antiga cujo produto saiu do cadastro
      anuncio: "",
      gerouImposto: null,
      reputacao: null,
      reembolsou: null,
      estado: "",
      aliquota: null, // a % usada (null = a da empresa, na hora)
      aliquotaEmpresaDe: "",
      valorManual: false,
      sugestoes: [],
      sugAtiva: -1,
      modo: "lancar", // "lancar" (a janela) ou "futura" (Registrar futuras)
      futuraId: null, // a devolução futura sendo lançada ou editada
      assinatura: "", // os dados ao abrir (para saber se algo mudou)
    };
  }

  /** O formulário vai para a janela de lançamento ou para a tela Registrar. */
  function moverCorpo(onde) {
    var corpo = $("mdCorpo");
    var host = onde === "tela" ? $("fdFormHost") : $("mdCorpoHost");
    if (corpo && host && corpo.parentNode !== host) host.appendChild(corpo);
  }

  /** O que muda no formulário entre o lançamento e o registro de futura. */
  function aplicarModo() {
    var futura = !!(form && form.modo === "futura");
    var corpo = $("mdCorpo");
    if (corpo) corpo.classList.toggle("dev-modo-futura", futura);
    var rot = $("mdChegadaRotulo");
    if (rot)
      rot.textContent = futura
        ? "Previsão de chegada"
        : "Data de chegada do produto";
  }

  /** Empresa e loja que um formulário novo já traz escolhidas. */
  function padraoNovo() {
    var pref = lerPref();
    var empresas = listarEmpresas();
    var emp =
      empresaAtiva && empresaPorId(empresaAtiva)
        ? empresaAtiva
        : empresas.length === 1
          ? empresas[0].id
          : pref.empresaForm && empresaPorId(pref.empresaForm)
            ? pref.empresaForm
            : "";
    var loja =
      pref.loja &&
      listarLojas().some(function (l) {
        return l.id === pref.loja;
      })
        ? pref.loja
        : "";
    return { empresa: emp, loja: loja };
  }

  /** Os campos de texto em branco (a quantidade volta para 1). */
  function limparCampos() {
    $("mdSku").value = "";
    $("mdValor").value = "";
    $("mdQtd").value = "1";
    $("mdVenda").value = "";
    $("mdErp").value = "";
    $("mdChegada").value = "";
    $("mdObs").value = "";
    $("mdExtra").value = "";
    $("mdExtraMotivo").value = "";
    $("mdValorReemb").value = "";
  }

  function preencherSelectEmpresa(valor) {
    var sel = $("mdEmpresa");
    var empresas = listarEmpresas();
    var html =
      '<option value="">' +
      (empresas.length ? "Selecione a empresa" : "Nenhuma empresa cadastrada") +
      "</option>";
    var vistas = {};
    empresas.forEach(function (e) {
      vistas[e.id] = true;
      html += '<option value="' + esc(e.id) + '">' + esc(e.nome) + "</option>";
    });
    // Editando uma devolução de empresa que saiu do cadastro: ela continua na lista.
    if (
      valor &&
      !vistas[valor] &&
      form &&
      form.original &&
      form.original.empresaId === valor
    ) {
      html +=
        '<option value="' +
        esc(valor) +
        '">' +
        esc((form.original.empresaNome || "Empresa") + " (removida)") +
        "</option>";
    }
    sel.innerHTML = html;
    sel.value = valor || "";
    atualizarLogoEmpresa();
  }

  function preencherSelectLoja(valor) {
    var sel = $("mdLoja");
    var lojas = listarLojas();
    var html =
      '<option value="">' +
      (lojas.length ? "Selecione a loja" : "Nenhuma loja cadastrada") +
      "</option>";
    var vistas = {};
    lojas.forEach(function (l) {
      vistas[l.id] = true;
      html += '<option value="' + esc(l.id) + '">' + esc(l.nome) + "</option>";
    });
    if (
      valor &&
      !vistas[valor] &&
      form &&
      form.original &&
      form.original.lojaId === valor
    ) {
      var l = lojaPorId(valor);
      html +=
        '<option value="' +
        esc(valor) +
        '">' +
        esc(
          l
            ? l.nome + " (oculta)"
            : (form.original.lojaNome || "Loja") + " (removida)",
        ) +
        "</option>";
    }
    sel.innerHTML = html;
    sel.value = valor || "";
    atualizarLogoLoja();
  }

  function atualizarLogoEmpresa() {
    var box = $("mdEmpresaLogo");
    if (!box) return;
    var emp = empresaPorId($("mdEmpresa").value);
    box.innerHTML =
      emp && emp.logo
        ? '<img src="' + esc(emp.logo) + '" alt="" />'
        : svg(I_PREDIO, 20, 1.8);
  }

  function atualizarLogoLoja() {
    var box = $("mdLojaLogo");
    if (!box) return;
    var id = $("mdLoja").value;
    var l = lojaPorId(id);
    if (l && l.logo)
      box.innerHTML =
        '<img src="' + esc(l.logo) + '" alt="" onerror="this.remove()" />';
    else if (l) box.textContent = String(l.nome).substring(0, 2).toUpperCase();
    else
      box.innerHTML = svg(
        '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path>',
        20,
        1.8,
      );
  }

  function marcarEscolha(grupoId, valor) {
    var g = $(grupoId);
    if (!g) return;
    // As perguntas da janela são listas de opções (<select>).
    if (g.tagName === "SELECT") {
      g.value = valor || "";
      if (window.BapellCampos && g.classList.contains("campo-erro") && valor)
        window.BapellCampos.limpar(g);
      return;
    }
    g.querySelectorAll("button[data-valor]").forEach(function (b) {
      var on = b.dataset.valor === valor;
      b.classList.toggle("ativo", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    if (window.BapellCampos && g.classList.contains("campo-erro") && valor)
      window.BapellCampos.limpar(g);
  }
  function simNaoParaValor(v) {
    return v === true ? "sim" : v === false ? "nao" : "";
  }
  /** A opção da lista "Plataforma reembolsou?" (com Aguardando). */
  function reembolsoParaValor(v) {
    return v === "aguardando" ? "aguardando" : simNaoParaValor(v);
  }

  function abrirDevolucao(d) {
    // O formulário pode estar na tela Registrar futuras: volta para a janela.
    moverCorpo("janela");
    form = formVazio();
    aplicarModo();
    if (d) {
      form.id = d.id;
      form.original = JSON.parse(JSON.stringify(d));
      form.anuncio = d.anuncio || "";
      form.gerouImposto = d.gerouImposto;
      form.reputacao = d.reputacao;
      form.reembolsou = d.reembolsou;
      form.estado = d.estado;
      form.aliquota = d.gerouImposto ? d.aliquota : null;
      form.aliquotaEmpresaDe = d.empresaId;
      form.valorManual = true; // o valor gravado vale; não troca pelo preço de hoje
      $("mdTitulo").textContent = "Editar devolução";
      $("mdSub").innerHTML =
        "Registrada em " +
        esc(fmtDataHora(d.criadoEm)) +
        (d.atualizadoEm && d.atualizadoEm !== d.criadoEm
          ? " · alterada em " + esc(fmtDataHora(d.atualizadoEm))
          : "") +
        ".";
      $("mdSalvar").textContent = "Salvar alterações";
      preencherSelectEmpresa(d.empresaId);
      preencherSelectLoja(d.lojaId);
      var op = opcaoPorIds(d.lojaId, d.produtoId, d.kitId);
      if (op) form.opcao = op;
      else form.orfao = { nome: d.produtoNome, sku: d.sku, kitQtd: d.kitQtd };
      $("mdSku").value = d.sku || "";
      $("mdValor").value = textoDoNumero(d.valorUnitario);
      $("mdQtd").value = String(d.quantidade);
      $("mdVenda").value = d.numeroVenda || "";
      $("mdErp").value = d.numeroErp || "";
      $("mdChegada").value = d.dataChegada || "";
      $("mdObs").value = d.observacoes || "";
      $("mdExtra").value = d.valorExtra > 0 ? textoDoNumero(d.valorExtra) : "";
      $("mdExtraMotivo").value = d.motivoExtra || "";
      // Reembolsada antes deste campo: vem o total (o que valia até aqui),
      // para conferir e corrigir.
      $("mdValorReemb").value =
        d.reembolsou === true
          ? textoDoNumero(
              d.valorReembolsado > 0 ? d.valorReembolsado : calcular(d).total,
            )
          : "";
    } else {
      $("mdTitulo").textContent = "Adicionar Devolução";
      $("mdSub").innerHTML =
        'Preencha os dados da devolução. Os campos com <span class="dev-obrig">*</span> são obrigatórios.';
      $("mdSalvar").textContent = "Salvar devolução";
      var padrao = padraoNovo();
      preencherSelectEmpresa(padrao.empresa);
      preencherSelectLoja(padrao.empresa ? padrao.loja : "");
      limparCampos();
      $("mdChegada").value = hojeISO();
    }
    // Responsável: o gravado na devolução; numa nova, o último que lançou.
    preencherResponsavel(
      $("mdResponsavel"),
      d
        ? d.responsavelId &&
          window.BapellUsuarios &&
          window.BapellUsuarios.obter(d.responsavelId)
          ? d.responsavelId
          : d.responsavel || ""
        : lerPref().responsavelLanc || "",
    );
    // A opção de acompanhar no Financeiro volta marcada a cada abertura.
    $("mdAtualizarFin").checked = true;
    marcarEscolha("mdImposto", simNaoParaValor(form.gerouImposto));
    marcarEscolha("mdReputacao", simNaoParaValor(form.reputacao));
    marcarEscolha("mdReembolso", reembolsoParaValor(form.reembolsou));
    marcarEscolha("mdEstado", form.estado);
    mostrarValorReemb();
    fecharSugestoes();
    atualizarEstadoLoja();
    renderProdutoEscolhido();
    atualizarForm();
    abrirJanela(
      "modalDevolucao",
      d
        ? "mdValor"
        : $("mdEmpresa").value
          ? $("mdLoja").value
            ? "mdSku"
            : "mdLoja"
          : "mdEmpresa",
    );
  }

  /** Empresa e loja escolhidas liberam a busca do produto. */
  function atualizarEstadoLoja() {
    var temEmp = !!$("mdEmpresa").value;
    var temLoja = !!$("mdLoja").value;
    $("mdLoja").disabled = !temEmp;
    var sku = $("mdSku");
    sku.disabled = !(temEmp && temLoja);
    var dica = $("mdSkuDica");
    if (!temEmp)
      dica.innerHTML =
        "Escolha a <strong>empresa</strong> e depois a <strong>loja</strong> para buscar o produto.";
    else if (!temLoja)
      dica.innerHTML =
        "Escolha a <strong>loja</strong> para buscar os produtos dela.";
    else {
      var n = opcoesDaLoja($("mdLoja").value).length;
      dica.innerHTML = n
        ? "Digite a SKU (ou parte dela): os produtos e kits desta loja aparecem enquanto você digita."
        : "Esta loja ainda não tem produtos cadastrados.";
    }
  }

  function renderProdutoEscolhido() {
    var campo = $("mdProdutoCampo");
    var box = $("mdProduto");
    var o = form.opcao;
    if (!o && !form.orfao) {
      campo.hidden = true;
      box.innerHTML = "";
      atualizarRotuloQtd(0);
      return;
    }
    campo.hidden = false;
    if (!o) {
      box.className = "dev-produto dev-produto--orfao";
      box.innerHTML =
        '<span class="dev-produto__img">' +
        svg(I_CAIXA, 24, 1.8) +
        "</span>" +
        '<div class="dev-produto__txt"><div class="dev-produto__nome">' +
        esc(form.orfao.nome || "Produto") +
        "</div>" +
        '<div class="dev-produto__meta">' +
        (form.orfao.sku ? "<span>SKU " + esc(form.orfao.sku) + "</span>" : "") +
        (form.orfao.kitQtd > 1
          ? '<span class="dev-tag dev-tag--kit">Kit ' +
            form.orfao.kitQtd +
            " un</span>"
          : "") +
        "</div>" +
        '<div class="dev-produto__meta">Este produto não está mais no cadastro desta loja. Os dados salvos continuam; para trocar, busque outra SKU.</div></div>';
      atualizarRotuloQtd(form.orfao.kitQtd);
      return;
    }
    box.className = "dev-produto";
    var p = o.precos;
    var meta = [];
    if (o.sku) meta.push("<span>SKU " + esc(o.sku) + "</span>");
    if (o.kitId !== null)
      meta.push(
        '<span class="dev-tag dev-tag--kit">Kit ' + o.kitQtd + " un</span>",
      );
    if (o.composto) meta.push('<span class="dev-tag">Composto</span>');
    var precoTxt = p.ml
      ? ""
      : "<span>Preço atual: <strong>" +
        esc(p.preco > 0 ? brl(p.preco) : "não calculado") +
        "</strong></span>";
    if (precoTxt) meta.push(precoTxt);
    var anuncio = "";
    if (p.ml) {
      anuncio =
        '<div class="dev-produto__anuncio" role="group" aria-label="Anúncio do Mercado Livre">' +
        (p.premium > 0
          ? '<button type="button" class="dev-anuncio-btn' +
            (form.anuncio === "premium" ? " ativo" : "") +
            '" data-anuncio="premium">Premium <strong>' +
            esc(brl(p.premium)) +
            "</strong></button>"
          : "") +
        (p.classico > 0
          ? '<button type="button" class="dev-anuncio-btn' +
            (form.anuncio === "classico" ? " ativo" : "") +
            '" data-anuncio="classico">Clássico <strong>' +
            esc(brl(p.classico)) +
            "</strong></button>"
          : "") +
        "</div>";
    }
    box.innerHTML =
      '<span class="dev-produto__img">' +
      imagemHtml(o.imagem, 52) +
      "</span>" +
      '<div class="dev-produto__txt"><div class="dev-produto__nome" title="' +
      esc(o.nome) +
      '">' +
      esc(o.nome) +
      "</div>" +
      '<div class="dev-produto__meta">' +
      meta.join("") +
      "</div>" +
      anuncio +
      "</div>" +
      '<button type="button" class="dev-btn-mini dev-produto__trocar" id="mdTrocarProduto">Trocar</button>';
    atualizarRotuloQtd(o.kitId !== null ? o.kitQtd : 0);
  }

  function atualizarRotuloQtd(kitQtd) {
    var rot = $("mdQtdRotulo");
    var dica = $("mdQtdDica");
    if (kitQtd > 1) {
      rot.innerHTML =
        'Quantidade devolvida (kits) <span class="dev-obrig dev-obrig--lancar">*</span>';
      dica.textContent =
        "Cada kit tem " + kitQtd + " unidades. O valor do produto é o do kit.";
    } else {
      rot.innerHTML =
        'Quantidade devolvida <span class="dev-obrig dev-obrig--lancar">*</span>';
      dica.textContent = "";
    }
  }

  /** Preço do produto escolhido conforme o anúncio (no Mercado Livre). */
  function precoEscolhido() {
    var o = form.opcao;
    if (!o) return 0;
    if (o.precos.ml) {
      if (form.anuncio === "classico" && o.precos.classico > 0)
        return o.precos.classico;
      if (o.precos.premium > 0) return o.precos.premium;
      return o.precos.classico;
    }
    return o.precos.preco;
  }

  function escolherOpcao(o) {
    form.opcao = o;
    form.orfao = null;
    if (o.precos.ml)
      form.anuncio = o.precos.premium > 0 ? "premium" : "classico";
    else form.anuncio = "";
    $("mdSku").value = o.sku || "";
    var preco = precoEscolhido();
    $("mdValor").value = preco > 0 ? textoDoNumero(preco) : "";
    form.valorManual = false;
    if (window.BapellCampos) {
      window.BapellCampos.limpar($("mdSku"));
      if (preco > 0) window.BapellCampos.limpar($("mdValor"));
    }
    fecharSugestoes();
    renderProdutoEscolhido();
    atualizarForm();
    if (!(preco > 0)) {
      aviso(
        "Este produto está sem preço calculado na loja. Informe o valor.",
        "warning",
        4200,
      );
      try {
        $("mdValor").focus();
      } catch (e) {}
    } else {
      try {
        $("mdQtd").focus();
        $("mdQtd").select();
      } catch (e) {}
    }
  }

  function limparProduto() {
    form.opcao = null;
    form.orfao = null;
    form.anuncio = "";
    renderProdutoEscolhido();
  }

  // ── Sugestões da busca por SKU ──
  function fecharSugestoes() {
    var box = $("mdSugestoes");
    if (box) {
      box.hidden = true;
      box.innerHTML = "";
    }
    if (form) {
      form.sugestoes = [];
      form.sugAtiva = -1;
    }
    var inp = $("mdSku");
    if (inp) inp.setAttribute("aria-expanded", "false");
  }

  function renderSugestoes() {
    var box = $("mdSugestoes");
    var inp = $("mdSku");
    var lojaId = $("mdLoja").value;
    var termo = inp.value;
    if (!lojaId || !String(termo).trim()) {
      fecharSugestoes();
      return;
    }
    var todas = buscarOpcoes(lojaId, termo);
    form.sugestoes = todas.slice(0, MAX_SUGESTOES);
    // SKU exata: já fica destacada (Enter escolhe).
    form.sugAtiva =
      form.sugestoes.length && normSku(form.sugestoes[0].sku) === normSku(termo)
        ? 0
        : -1;
    if (!form.sugestoes.length) {
      box.innerHTML =
        '<div class="dev-sug-vazio">Nenhum produto desta loja com a SKU <strong>' +
        esc(String(termo).trim()) +
        "</strong>.</div>";
    } else {
      box.innerHTML =
        form.sugestoes
          .map(function (o, i) {
            var p = o.precos;
            var preco = p.ml
              ? p.premium > 0
                ? brl(p.premium) + "<small>Premium</small>"
                : brl(p.classico) + "<small>Clássico</small>"
              : p.preco > 0
                ? brl(p.preco)
                : "—";
            return (
              '<button type="button" class="dev-sug' +
              (i === form.sugAtiva ? " ativo" : "") +
              '" data-sug="' +
              i +
              '" role="option" aria-selected="' +
              (i === form.sugAtiva) +
              '">' +
              '<span class="dev-prod__img">' +
              imagemHtml(o.imagem, 40) +
              "</span>" +
              '<span class="dev-sug__txt"><span class="dev-sug__nome" style="display:block;">' +
              esc(o.nome) +
              "</span>" +
              '<span class="dev-sug__meta"><span class="dev-sug__sku">' +
              (o.sku ? marcarTrecho(o.sku, termo) : "sem SKU") +
              "</span>" +
              (o.kitId !== null
                ? '<span class="dev-tag dev-tag--kit">Kit ' +
                  o.kitQtd +
                  " un</span>"
                : "") +
              (o.composto ? '<span class="dev-tag">Composto</span>' : "") +
              "</span></span>" +
              '<span class="dev-sug__preco">' +
              preco +
              "</span></button>"
            );
          })
          .join("") +
        (todas.length > MAX_SUGESTOES
          ? '<div class="dev-sug-vazio">Mais ' +
            (todas.length - MAX_SUGESTOES) +
            " resultado(s): continue digitando a SKU.</div>"
          : "");
    }
    box.hidden = false;
    inp.setAttribute("aria-expanded", "true");
  }

  function moverSugestao(passo) {
    if (!form.sugestoes.length) return;
    var n = form.sugestoes.length;
    form.sugAtiva =
      form.sugAtiva < 0
        ? passo > 0
          ? 0
          : n - 1
        : (form.sugAtiva + passo + n) % n;
    $("mdSugestoes")
      .querySelectorAll(".dev-sug")
      .forEach(function (b) {
        var on = Number(b.dataset.sug) === form.sugAtiva;
        b.classList.toggle("ativo", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
        if (on) {
          try {
            b.scrollIntoView({ block: "nearest" });
          } catch (e) {}
        }
      });
  }

  // ── A % de imposto em uso na janela ──
  function aliquotaEmUso() {
    var empId = $("mdEmpresa").value;
    if (form.aliquota !== null && form.aliquotaEmpresaDe === empId)
      return form.aliquota;
    var emp = empresaPorId(empId);
    return emp && emp.imposto !== null ? emp.imposto : 0;
  }

  /** Os dados da janela no formato da devolução (sem gravar). */
  function dadosDaJanela() {
    var empId = $("mdEmpresa").value;
    var lojaId = $("mdLoja").value;
    var emp = empresaPorId(empId);
    var loja = lojaPorId(lojaId);
    var o = form.opcao;
    var orig = form.original || {};
    var mesmaLoja = orig.lojaId === lojaId;
    return {
      id: form.id || "",
      empresaId: empId,
      empresaNome: emp
        ? emp.nome
        : orig.empresaId === empId
          ? orig.empresaNome
          : "",
      lojaId: lojaId,
      lojaNome: loja ? loja.nome : mesmaLoja ? orig.lojaNome : "",
      produtoId: o
        ? o.produtoId
        : form.orfao && mesmaLoja
          ? orig.produtoId
          : null,
      kitId: o ? o.kitId : form.orfao && mesmaLoja ? orig.kitId : null,
      kitQtd: o
        ? o.kitId !== null
          ? o.kitQtd
          : 0
        : form.orfao
          ? form.orfao.kitQtd || 0
          : 0,
      sku: o ? o.sku : form.orfao ? form.orfao.sku : "",
      produtoNome: o ? o.nome : form.orfao ? form.orfao.nome : "",
      anuncio:
        o && o.precos.ml ? form.anuncio : form.orfao ? orig.anuncio || "" : "",
      valorUnitario: cent(numeroDoTexto($("mdValor").value)),
      quantidade: parseInt($("mdQtd").value, 10) || 0,
      gerouImposto: form.gerouImposto,
      aliquota: form.gerouImposto ? aliquotaEmUso() : 0,
      numeroVenda: String($("mdVenda").value || "").trim(),
      reputacao: form.reputacao,
      reembolsou: form.reembolsou,
      valorReembolsado:
        form.reembolsou === true
          ? Math.max(0, cent(numeroDoTexto($("mdValorReemb").value)))
          : 0,
      estado: form.estado,
      dataChegada: dataValida($("mdChegada").value) ? $("mdChegada").value : "",
      observacoes: String($("mdObs").value || "").trim(),
      valorExtra: Math.max(0, cent(numeroDoTexto($("mdExtra").value))),
      motivoExtra: String($("mdExtraMotivo").value || "").trim(),
      numeroErp: String($("mdErp").value || "").trim(),
    };
  }

  /** Recalcula a caixa do imposto, a conta e o aviso do Financeiro. */
  function atualizarForm() {
    if (!form) return;
    var d = dadosDaJanela();
    var c = calcular(d);

    // Caixa do imposto
    var info = $("mdImpostoInfo");
    if (form.gerouImposto === true) {
      var emp = empresaPorId(d.empresaId);
      var empHoje = emp && emp.imposto !== null ? emp.imposto : null;
      var usandoSalva =
        form.aliquota !== null && form.aliquotaEmpresaDe === d.empresaId;
      var html = "";
      var avisoCls = false;
      if (!d.empresaId) {
        html =
          "Escolha a empresa: o imposto usa a porcentagem de imposto por nota cadastrada nela.";
      } else if (!usandoSalva && empHoje === null) {
        avisoCls = true;
        html =
          "A empresa <strong>" +
          esc(emp ? emp.nome : d.empresaNome) +
          "</strong> não tem a porcentagem de imposto por nota preenchida. " +
          'O imposto fica <strong>R$ 0,00</strong>. Preencha em <a href="empresa.html">Dados da Empresa</a> (Situação Cadastral e Regime Tributário).';
      } else {
        html =
          "Imposto de <strong>" +
          esc(pct(c.aliquota)) +
          "</strong> sobre " +
          esc(brl(c.total)) +
          " = <strong>" +
          esc(brl(c.imposto)) +
          "</strong>" +
          (usandoSalva
            ? " — a porcentagem gravada nesta devolução."
            : " — a porcentagem de imposto por nota de <strong>" +
              esc(emp ? emp.nome : "") +
              "</strong> (Dados da Empresa).");
        if (
          usandoSalva &&
          empHoje !== null &&
          Math.abs(empHoje - form.aliquota) > 0.0001
        ) {
          html +=
            " Hoje a empresa está com <strong>" +
            esc(pct(empHoje)) +
            '</strong>. <button type="button" class="dev-btn-mini" id="mdUsarAliquota" style="height:26px;margin-left:4px;">Usar ' +
            esc(pct(empHoje)) +
            "</button>";
        }
        if (c.reembolsou)
          html +=
            "<br>Como a plataforma reembolsou, o imposto fica registrado, mas <strong>não entra no prejuízo</strong>.";
      }
      info.className =
        "dev-campo dev-campo--cheio dev-info-imposto" +
        (avisoCls ? " dev-info-imposto--aviso" : "");
      info.innerHTML =
        svg(avisoCls ? I_AVISO : I_INFO, 16) + "<div>" + html + "</div>";
      info.hidden = false;
    } else {
      info.hidden = true;
      info.innerHTML = "";
    }

    // A conta ao vivo
    $("mdResValor").textContent = brl(c.total);
    $("mdResValorDet").textContent =
      c.qtd > 0 ? inteiro(c.qtd) + " × " + brl(c.valor) : "";
    $("mdResImposto").textContent =
      form.gerouImposto === true ? brl(c.imposto) : brl(0);
    $("mdResImpostoDet").textContent =
      form.gerouImposto === true
        ? pct(c.aliquota) + (c.reembolsou ? " · não conta (reembolso)" : "")
        : form.gerouImposto === false
          ? "não gerou imposto"
          : "responda se gerou imposto";
    $("mdResExtra").textContent = brl(c.extra);
    $("mdResExtraDet").textContent =
      c.extra > 0 ? d.motivoExtra || "informe o motivo" : "sem valor extra";
    $("mdResPrejuizo").textContent = brl(c.prejuizo);
    var detPrej;
    if (form.reembolsou === "aguardando")
      detPrej =
        c.prejuizo > 0
          ? "aguardando a plataforma: conta como sem reembolso"
          : "aguardando a plataforma";
    else if (form.reembolsou !== true && form.reembolsou !== false)
      detPrej = "responda se a plataforma reembolsou";
    else if (c.extra > 0) {
      // O valor extra entra sempre; o imposto, só sem reembolso.
      detPrej =
        c.prejuizoImposto > 0
          ? "o imposto + o valor extra"
          : form.reembolsou === true
            ? "reembolsada: só o valor extra"
            : "sem imposto: só o valor extra";
    } else {
      detPrej =
        form.reembolsou === true
          ? "reembolsada: sem prejuízo"
          : c.prejuizo > 0
            ? "o imposto, sem reembolso"
            : "sem imposto, sem prejuízo";
    }
    $("mdResPrejuizoDet").textContent = detPrej;
    // Reembolsou e o valor ainda não foi digitado: zero (não o total da venda).
    var reembNaJanela =
      c.reembolsou && !(d.valorReembolsado > 0) ? 0 : c.reembolso;
    $("mdResReembolso").textContent = brl(reembNaJanela);
    $("mdResReembolsoDet").textContent = !c.reembolsou
      ? form.reembolsou === "aguardando"
        ? "aguardando a plataforma"
        : ""
      : !(d.valorReembolsado > 0)
        ? "informe o valor reembolsado"
        : d.valorReembolsado !== c.total
          ? "pago pela plataforma (venda: " + brl(c.total) + ")"
          : "pago pela plataforma";
    document
      .querySelector(".dev-resumo__item--prejuizo")
      .classList.toggle("zero", !(c.prejuizo > 0));
    document
      .querySelector(".dev-resumo__item--reembolso")
      .classList.toggle("zero", !(reembNaJanela > 0));

    atualizarAvisoFinanceiro(d, c);
  }

  /**
   * Editando uma devolução que já está no Financeiro: diz o que muda lá e
   * deixa escolher se o lançamento acompanha.
   */
  function atualizarAvisoFinanceiro(d, c) {
    var caixa = $("mdAvisoFin");
    var orig = form.original;
    caixa.hidden = true;
    form.acaoFin = null;
    if (!orig || !orig.exportacao) return;
    var cont = lerContainerDre();
    var achado = cont ? acharLancamento(cont, orig) : null;
    if (!achado) return;
    var valorLa = cent(Math.abs(Number(achado.mov.liquido) || 0));
    var quando =
      fmtData(orig.exportacao.data) || fmtDataHora(orig.exportacao.em);
    var empFin =
      (
        cont.empresas.find(function (e) {
          return e && e.id === achado.empId;
        }) || {}
      ).nome ||
      orig.exportacao.empresaFin ||
      "";
    var texto, rotulo, acao;
    if (d.empresaId && d.empresaId !== orig.empresaId) {
      texto =
        "Esta devolução foi lançada no Controle Financeiro de <strong>" +
        esc(empFin) +
        "</strong> (" +
        esc(brl(valorLa)) +
        ", " +
        esc(quando) +
        "). A empresa mudou.";
      rotulo =
        "Remover esse lançamento ao salvar (depois, exporte de novo para a nova empresa)";
      acao = "remover";
    } else if (c.prejuizo === valorLa) {
      caixa.hidden = false;
      $("mdAvisoFinTexto").innerHTML =
        "Lançada no Controle Financeiro de <strong>" +
        esc(empFin) +
        "</strong> em " +
        esc(quando) +
        ": " +
        esc(brl(valorLa)) +
        ". O valor continua o mesmo.";
      $("mdAtualizarFin").parentNode.hidden = true;
      return;
    } else if (c.prejuizo > 0) {
      texto =
        "O prejuízo mudou de <strong>" +
        esc(brl(valorLa)) +
        "</strong> para <strong>" +
        esc(brl(c.prejuizo)) +
        "</strong>. O lançamento de " +
        esc(quando) +
        " está no Controle Financeiro de <strong>" +
        esc(empFin) +
        "</strong>.";
      rotulo = "Atualizar também o lançamento no Controle Financeiro ao salvar";
      acao = "atualizar";
    } else {
      texto =
        "Agora a devolução não tem prejuízo, mas há um lançamento de <strong>" +
        esc(brl(valorLa)) +
        "</strong> (" +
        esc(quando) +
        ") no Controle Financeiro de <strong>" +
        esc(empFin) +
        "</strong>.";
      rotulo = "Remover o lançamento do Controle Financeiro ao salvar";
      acao = "remover";
    }
    caixa.hidden = false;
    $("mdAvisoFinTexto").innerHTML = texto;
    $("mdAtualizarFin").parentNode.hidden = false;
    $("mdAtualizarFinRotulo").textContent = rotulo;
    form.acaoFin = acao;
  }

  /** O campo "Valor reembolsado" aparece só com "Plataforma reembolsou?" = Sim, ao lado da lista (35% / 65%). */
  function mostrarValorReemb() {
    var sim = !!(form && form.reembolsou === true);
    var campo = $("mdValorReembCampo");
    if (campo) campo.hidden = !sim;
    var linha = $("mdReembLinha");
    if (linha) linha.classList.toggle("com-valor", sim);
    if (!sim && window.BapellCampos)
      window.BapellCampos.limpar($("mdValorReemb"));
  }

  /** O valor extra e o motivo, como estão nos campos agora. */
  function extraNosCampos() {
    return {
      valor: Math.max(0, cent(numeroDoTexto($("mdExtra").value))),
      motivo: String($("mdExtraMotivo").value || "").trim(),
    };
  }

  /**
   * O valor extra é opcional; no lançamento, o valor e o motivo andam
   * juntos: um sem o outro não se explica depois, na lista e no Financeiro.
   * (No registro de futura, não: pode-se saber um antes do outro.)
   */
  function itensValorExtra(d) {
    var semValor = function () {
      var x = extraNosCampos();
      return !(x.valor > 0) && !!x.motivo;
    };
    var semMotivo = function () {
      var x = extraNosCampos();
      return x.valor > 0 && !x.motivo;
    };
    return [
      {
        el: $("mdExtra"),
        vazio: !(d.valorExtra > 0) && !!d.motivoExtra,
        resolvido: function () {
          return !semValor();
        },
        msg: "Informe o valor extra ou apague o motivo dele.",
      },
      {
        el: $("mdExtraMotivo"),
        vazio: d.valorExtra > 0 && !d.motivoExtra,
        resolvido: function () {
          return !semMotivo();
        },
        msg: "Informe o motivo do valor extra (por exemplo, frete da devolução).",
      },
    ];
  }

  /** Mexeu num dos dois campos do valor extra: o vermelho do outro sai, se já resolveu. */
  function revisarErrosExtra() {
    if (!window.BapellCampos) return;
    var x = extraNosCampos();
    var campoValor = $("mdExtra"),
      campoMotivo = $("mdExtraMotivo");
    if (
      campoValor.classList.contains("campo-erro") &&
      !(!(x.valor > 0) && x.motivo)
    )
      window.BapellCampos.limpar(campoValor);
    if (
      campoMotivo.classList.contains("campo-erro") &&
      !(x.valor > 0 && !x.motivo)
    )
      window.BapellCampos.limpar(campoMotivo);
  }

  function validar(d) {
    var itens = [
      { el: $("mdEmpresa"), msg: "Escolha a empresa da devolução." },
      { el: $("mdLoja"), msg: "Escolha a loja da devolução." },
      {
        el: $("mdSku"),
        vazio: !(form.opcao || form.orfao),
        msg: "Busque a SKU e escolha o produto devolvido.",
      },
      {
        el: $("mdValor"),
        vazio: !(d.valorUnitario > 0),
        msg: "Informe o valor do produto.",
      },
      {
        el: $("mdQtd"),
        vazio: !(
          d.quantidade >= 1 &&
          String($("mdQtd").value).indexOf(".") < 0 &&
          String($("mdQtd").value).indexOf(",") < 0
        ),
        msg: "Informe a quantidade devolvida (número inteiro, a partir de 1).",
      },
      {
        el: $("mdImposto"),
        vazio: form.gerouImposto === null,
        msg: "Responda se a devolução gerou imposto fiscal.",
      },
      {
        el: $("mdReputacao"),
        vazio: form.reputacao === null,
        msg: "Responda se a devolução afetou a reputação.",
      },
      {
        el: $("mdReembolso"),
        vazio: form.reembolsou === null,
        msg: "Responda se a plataforma reembolsou.",
      },
    ];
    // Reembolsou: quanto a plataforma devolveu (a venda menos as taxas).
    if (form.reembolsou === true) {
      itens.push({
        el: $("mdValorReemb"),
        vazio: !(d.valorReembolsado > 0),
        resolvido: function () {
          return cent(numeroDoTexto($("mdValorReemb").value)) > 0;
        },
        msg: "Informe o valor que a plataforma reembolsou.",
      });
    }
    itens.push({
      el: $("mdEstado"),
      vazio: !form.estado,
      msg: "Escolha o estado do produto.",
    });
    // Valor extra (opcional): o valor e o motivo andam juntos.
    itens = itens.concat(itensValorExtra(d));
    var selResp = $("mdResponsavel");
    if (window.BapellUsuarios && selResp) {
      itens.push({
        el: selResp,
        vazio: !selResp.value || selResp.value === "__cadastrar__",
        msg: "Escolha o responsável pelo lançamento.",
      });
    }
    if (window.BapellCampos) return window.BapellCampos.exigir(itens);
    var falta = itens.find(function (it) {
      return it.vazio !== undefined
        ? it.vazio
        : String(it.el.value || "").trim() === "";
    });
    if (falta) {
      aviso(falta.msg, "warning", 4200);
      return false;
    }
    return true;
  }

  var _salvando = false;
  function salvarDevolucao() {
    if (!form || _salvando) return;
    if (form.modo === "futura") {
      salvarFutura();
      return;
    }
    var d = dadosDaJanela();
    // Sem nenhum usuário cadastrado não há responsável: pede o cadastro.
    var U = window.BapellUsuarios;
    var selResp = $("mdResponsavel");
    if (U && !U.listar().length) {
      if (window.BapellCampos) window.BapellCampos.marcar(selResp);
      U.pedirCadastro();
      return;
    }
    if (!validar(d)) return;

    // Mesma venda e mesma SKU na mesma loja: provavelmente repetida.
    // Na edição, só pergunta se a venda, a SKU ou a loja mudaram — a
    // repetição já conhecida não precisa ser confirmada a cada alteração.
    var orig = form.original;
    var mudouChave =
      !orig ||
      orig.lojaId !== d.lojaId ||
      normSku(orig.sku) !== normSku(d.sku) ||
      String(orig.numeroVenda || "")
        .trim()
        .toLowerCase() !== d.numeroVenda.toLowerCase();
    var repetida =
      d.numeroVenda && mudouChave
        ? devolucoes.find(function (x) {
            return (
              x.id !== d.id &&
              x.lojaId === d.lojaId &&
              normSku(x.sku) === normSku(d.sku) &&
              String(x.numeroVenda).trim().toLowerCase() ===
                d.numeroVenda.toLowerCase()
            );
          })
        : null;
    var seguir = Promise.resolve(true);
    if (repetida && window.BapellModal) {
      seguir = window.BapellModal.confirmar({
        tipo: "aviso",
        titulo: "Devolução repetida?",
        html:
          "Já existe uma devolução da venda nº <strong>" +
          esc(d.numeroVenda) +
          "</strong> com a SKU <strong>" +
          esc(d.sku) +
          "</strong> nesta loja" +
          (repetida.dataChegada
            ? " (chegada em " + esc(fmtData(repetida.dataChegada)) + ")"
            : "") +
          ". Salvar mesmo assim?",
        botao: "Salvar mesmo assim",
        cancelar: "Voltar",
      });
    }
    _salvando = true;
    seguir.then(
      function (ok) {
        if (!ok || !form) {
          _salvando = false;
          return;
        }
        if (!U) {
          _salvando = false;
          gravarDevolucao(d);
          return;
        }
        // O responsável escolhido; quem tem senha confirma digitando a dele.
        var formAntes = form;
        U.confirmarResponsavel(selResp.value, {
          acao: form.futuraId
            ? "lançar esta devolução"
            : "salvar esta devolução",
        }).then(
          function (r) {
            _salvando = false;
            // A janela foi fechada (ou trocou de devolução) enquanto a senha era pedida.
            if (form !== formAntes || !janelaAberta("modalDevolucao")) return;
            if (!r.ok) {
              if (r.motivo === "vazio" && window.BapellCampos)
                window.BapellCampos.marcar(selResp);
              return;
            }
            d.responsavel = r.usuario.nome;
            d.responsavelId = r.usuario.id;
            gravarDevolucao(d);
          },
          function () {
            _salvando = false;
          },
        );
      },
      function () {
        _salvando = false;
      },
    );
  }

  function gravarDevolucao(d) {
    var agora = Date.now();
    var lista = carregar();
    var idx = d.id
      ? lista.findIndex(function (x) {
          return x.id === d.id;
        })
      : -1;
    var antes = idx >= 0 ? lista[idx] : form.original || null;

    // Lançando uma devolução futura: confere (relendo) se ela já não foi
    // lançada — em outra aba, por exemplo. A mesma futura não vira duas.
    var futuraId = form.futuraId || null;
    var futLista = null,
      futIdx = -1;
    if (futuraId) {
      futLista = carregarFuturas();
      futIdx = futLista.findIndex(function (x) {
        return x.id === futuraId;
      });
      var fx = futIdx >= 0 ? futLista[futIdx] : null;
      if (
        fx &&
        fx.status === "lancada" &&
        fx.devolucaoId &&
        lista.some(function (x) {
          return x.id === fx.devolucaoId;
        })
      ) {
        aviso(
          "Esta devolução futura já foi lançada" +
            (fx.lancadaPor ? " por " + fx.lancadaPor : "") +
            (fx.lancadaEm ? " em " + fmtDataHora(fx.lancadaEm) : "") +
            ". Ela não é lançada duas vezes.",
          "warning",
          6500,
        );
        return;
      }
    }

    var reg = normalizar(
      Object.assign({}, d, {
        id: d.id || novoId(),
        criadoEm: antes ? antes.criadoEm : agora,
        atualizadoEm: agora,
        exportacao: antes ? antes.exportacao : null,
        origemFuturaId: antes ? antes.origemFuturaId : futuraId || "",
      }),
    );
    if (!reg) return;

    // O lançamento no Financeiro acompanha, se a pessoa deixou marcado.
    var msgFin = "";
    if (
      form.acaoFin &&
      antes &&
      antes.exportacao &&
      $("mdAtualizarFin").checked
    ) {
      var cont = lerContainerDre();
      var achado = cont ? acharLancamento(cont, antes) : null;
      if (achado) {
        var c = calcular(reg);
        if (form.acaoFin === "atualizar" && c.prejuizo > 0) {
          achado.mov.liquido = -c.prejuizo;
          achado.mov.atualizadoEm = agora;
          achado.mov.editado = true;
          if (!salvarContainerDre(cont)) return;
          reg.exportacao = Object.assign({}, reg.exportacao, {
            valor: c.prejuizo,
          });
          msgFin =
            " O lançamento no Controle Financeiro foi atualizado para " +
            brl(c.prejuizo) +
            ".";
        } else if (form.acaoFin === "remover") {
          achado.store.movimentacoes.splice(achado.idx, 1);
          if (!salvarContainerDre(cont)) return;
          reg.exportacao = null;
          msgFin = " O lançamento foi removido do Controle Financeiro.";
        }
      }
    }

    if (idx >= 0) lista[idx] = reg;
    else lista.push(reg);
    if (!gravar(lista)) return;
    devolucoes = lista;
    var pref = { loja: reg.lojaId, empresaForm: reg.empresaId };
    // O último responsável do lançamento (o da exportação é outra preferência).
    if (reg.responsavelId) pref.responsavelLanc = reg.responsavelId;
    gravarPref(pref);

    // A futura lançada muda de situação: sai de "aguardando".
    var futLancada = null;
    var msgFut = "";
    if (futuraId && futLista && futIdx >= 0) {
      futLista[futIdx] = normalizarFutura(
        Object.assign({}, futLista[futIdx], {
          status: "lancada",
          devolucaoId: reg.id,
          lancadaEm: agora,
          lancadaPor: reg.responsavel,
          atualizadoEm: agora,
        }),
      );
      if (gravarFuturas(futLista)) {
        futuras = futLista;
        futLancada = futLista[futIdx];
        _destacarFut = futLancada.id;
        msgFut = " A devolução futura passou para Já lançadas.";
      }
    } else if (futuraId) {
      msgFut = " (A devolução futura dela tinha sido excluída.)";
    }

    _destacar = reg.id;
    var editando = !!d.id;
    fecharJanela("modalDevolucao");
    form = null;
    preencherFiltrosOpcoes();
    render();
    aviso(
      (editando
        ? "Devolução atualizada."
        : futuraId
          ? "Devolução lançada."
          : "Devolução registrada.") +
        msgFin +
        msgFut,
      "success",
      msgFin || msgFut ? 5200 : 3200,
    );
    if (futLancada) perguntarConcluirLembrete(futLancada);
  }

  // ─────────────────────────────────────────────
  //  EXCLUIR
  // ─────────────────────────────────────────────
  function excluirDevolucao(id) {
    var d = devolucoes.find(function (x) {
      return x.id === id;
    });
    if (!d) return;
    var cont = lerContainerDre();
    var achado = cont && d.exportacao ? acharLancamento(cont, d) : null;
    var resumo =
      "<strong>" +
      esc(d.produtoNome || "Produto") +
      "</strong>" +
      (d.sku ? " (SKU " + esc(d.sku) + ")" : "") +
      (d.numeroVenda ? ", venda nº " + esc(d.numeroVenda) : "") +
      ".";

    var executar = function (tirarDoFin) {
      if (tirarDoFin && achado) {
        var c2 = lerContainerDre();
        var a2 = c2 ? acharLancamento(c2, d) : null;
        if (a2) {
          a2.store.movimentacoes.splice(a2.idx, 1);
          if (!salvarContainerDre(c2)) return;
        }
      }
      var lista = carregar().filter(function (x) {
        return x.id !== id;
      });
      if (!gravar(lista)) return;
      devolucoes = lista;
      preencherFiltrosOpcoes();
      render();
      aviso(
        tirarDoFin && achado
          ? "Devolução excluída, e o lançamento saiu do Controle Financeiro."
          : "Devolução excluída.",
        "success",
      );
    };

    if (!window.BapellModal) {
      executar(false);
      return;
    }
    if (achado) {
      window.BapellModal.escolher({
        tipo: "perigo",
        titulo: "Excluir esta devolução?",
        html:
          resumo +
          "<br>Ela foi lançada no Controle Financeiro (" +
          esc(brl(Math.abs(Number(achado.mov.liquido) || 0))) +
          "). " +
          "Quer tirar o lançamento de lá também? Esta ação não pode ser desfeita.",
        botoes: [
          { rotulo: "Cancelar", valor: null, estilo: "secundario", foco: true },
          {
            rotulo: "Excluir só a devolução",
            valor: "so",
            estilo: "secundario",
          },
          { rotulo: "Excluir as duas", valor: "ambas", estilo: "perigo" },
        ],
      }).then(function (r) {
        if (r === "so") executar(false);
        else if (r === "ambas") executar(true);
      });
      return;
    }
    window.BapellModal.confirmar({
      perigo: true,
      titulo: "Excluir esta devolução?",
      html:
        resumo +
        "<br>Ela sai da lista e dos números do painel. Esta ação não pode ser desfeita.",
      botao: "Excluir",
      cancelar: "Cancelar",
    }).then(function (sim) {
      if (sim) executar(false);
    });
  }

  // ─────────────────────────────────────────────
  //  EXPORTAR PARA O CONTROLE FINANCEIRO
  // ─────────────────────────────────────────────
  var exportando = null; // { ids: [], lote: bool }

  function formatoAntigoFinanceiro() {
    aviso(
      "O Controle Financeiro está num formato antigo. Abra a tela do Controle Financeiro uma vez, para ele se atualizar, e exporte de novo.",
      "warning",
      7000,
    );
  }

  /**
   * O <select> de responsável (os usuários de Usuários e Senhas).
   * valor: o id ou o nome a deixar escolhido; sem ele, o último usado.
   */
  function preencherResponsavel(sel, valor) {
    if (!sel) return;
    var U = window.BapellUsuarios;
    if (U && typeof U.preencherSelect === "function") {
      U.preencherSelect(sel, {
        valor: valor !== undefined ? valor || "" : lerPref().responsavel || "",
      });
      return;
    }
    sel.innerHTML = '<option value="">Sem usuários</option>';
  }

  function abrirExportar(ids, lote) {
    var cont = lerContainerDre();
    if (!cont) {
      formatoAntigoFinanceiro();
      return;
    }
    var itens = ids
      .map(function (id) {
        return devolucoes.find(function (x) {
          return x.id === id;
        });
      })
      .filter(Boolean);
    if (!itens.length) return;
    exportando = {
      ids: itens.map(function (d) {
        return d.id;
      }),
      lote: !!lote,
    };

    var total = itens.reduce(function (s, d) {
      return s + calcular(d).prejuizo;
    }, 0);
    var resumo = $("meResumo");
    if (!lote) {
      var d = itens[0];
      var c = calcular(d);
      var emp = empresaPorId(d.empresaId);
      var loja = lojaPorId(d.lojaId);
      // Sem valor extra, a saída é o imposto (a linha de sempre). Com ele,
      // a saída é o imposto (se contar) mais o valor extra: as duas linhas.
      var linhasConta =
        '<div class="dev-exp-linha"><span>Imposto</span><strong>' +
        esc(pct(c.aliquota)) +
        " de " +
        esc(brl(c.total)) +
        "</strong></div>";
      if (c.extra > 0) {
        var impTxt = !d.gerouImposto
          ? "não gerou imposto"
          : c.reembolsou
            ? "não conta (a plataforma reembolsou)"
            : brl(c.imposto) +
              " (" +
              pct(c.aliquota) +
              " de " +
              brl(c.total) +
              ")";
        var extraTxt =
          brl(c.extra) + (d.motivoExtra ? " — " + d.motivoExtra : "");
        linhasConta =
          '<div class="dev-exp-linha"><span>Imposto</span><strong>' +
          esc(impTxt) +
          "</strong></div>" +
          '<div class="dev-exp-linha"><span>Valor extra</span><strong title="' +
          esc(extraTxt) +
          '">' +
          esc(extraTxt) +
          "</strong></div>";
      }
      resumo.innerHTML =
        '<div class="dev-exp-linha"><span>Produto</span><strong title="' +
        esc(d.produtoNome) +
        '">' +
        esc(d.produtoNome) +
        (d.sku ? " — " + esc(d.sku) : "") +
        "</strong></div>" +
        '<div class="dev-exp-linha"><span>Empresa</span><strong>' +
        esc(emp ? emp.nome : d.empresaNome) +
        "</strong></div>" +
        '<div class="dev-exp-linha"><span>Loja</span><strong>' +
        esc(loja ? loja.nome : d.lojaNome) +
        "</strong></div>" +
        (d.numeroVenda
          ? '<div class="dev-exp-linha"><span>Venda</span><strong>nº ' +
            esc(d.numeroVenda) +
            "</strong></div>"
          : "") +
        linhasConta +
        '<div class="dev-exp-total"><span>Saída a lançar</span><strong>' +
        esc(brl(c.prejuizo)) +
        "</strong></div>" +
        '<div class="dev-exp-nota">Categoria <span class="dev-tag-fin">' +
        esc(CATEGORIA_FIN) +
        "</span> no Registrar Saída da empresa.</div>";
      $("meTitulo").textContent = "Exportar para o Controle Financeiro";
      $("meDescCampo").hidden = false;
      $("meDataCampo").hidden = false;
      $("meDataLoteCampo").hidden = true;
      $("meDescricao").value = descricaoPadrao(d);
      $("meData").value = d.dataChegada || hojeISO();
      $("meConfirmar").textContent = "Lançar saída";
    } else {
      var porEmp = {};
      itens.forEach(function (d) {
        var emp = empresaPorId(d.empresaId);
        var nome = emp ? emp.nome : d.empresaNome || "Empresa";
        var g = porEmp[nome] || (porEmp[nome] = { n: 0, v: 0 });
        g.n++;
        g.v += calcular(d).prejuizo;
      });
      resumo.innerHTML =
        Object.keys(porEmp)
          .sort()
          .map(function (nome) {
            var g = porEmp[nome];
            return (
              '<div class="dev-exp-linha"><span>' +
              esc(nome) +
              "</span><strong>" +
              (g.n === 1 ? "1 devolução" : g.n + " devoluções") +
              " · " +
              esc(brl(g.v)) +
              "</strong></div>"
            );
          })
          .join("") +
        '<div class="dev-exp-total"><span>' +
        (itens.length === 1 ? "1 saída" : itens.length + " saídas") +
        "</span><strong>" +
        esc(brl(total)) +
        "</strong></div>" +
        '<div class="dev-exp-nota">Cada devolução vira uma saída própria, com a categoria <span class="dev-tag-fin">' +
        esc(CATEGORIA_FIN) +
        "</span>, no Controle Financeiro da empresa dela. Ficam de fora as devoluções sem prejuízo e as já exportadas.</div>";
      $("meTitulo").textContent =
        "Exportar " +
        (itens.length === 1 ? "1 devolução" : itens.length + " devoluções") +
        " para o Financeiro";
      $("meDescCampo").hidden = true;
      $("meDataCampo").hidden = true;
      $("meDataLoteCampo").hidden = false;
      marcarEscolha("meDataLote", "chegada");
      $("meConfirmar").textContent =
        itens.length === 1
          ? "Lançar saída"
          : "Lançar " + itens.length + " saídas";
    }
    preencherResponsavel($("meResponsavel"));
    $("meConfirmar").disabled = false;
    abrirJanela("modalExportar", lote ? "meResponsavel" : "meDescricao");
  }

  var _confirmandoExport = false;
  function confirmarExportar() {
    if (!exportando || _confirmandoExport) return;
    var lote = exportando.lote;
    var itensValid = [];
    if (!lote) {
      itensValid.push({
        el: $("meDescricao"),
        msg: "Preencha a descrição do lançamento.",
      });
      var dtWrap = $("meData").closest(".dtp-wrap");
      itensValid.push({
        el: $("meData"),
        alvo: dtWrap
          ? dtWrap.querySelector(".dtp-field") || $("meData")
          : $("meData"),
        vazio: !dataValida($("meData").value),
        msg: "Escolha a data do lançamento.",
      });
    }
    var sel = $("meResponsavel");
    var U = window.BapellUsuarios;
    if (U && !U.listar().length) {
      if (window.BapellCampos) window.BapellCampos.marcar(sel);
      U.pedirCadastro();
      return;
    }
    itensValid.push({
      el: sel,
      vazio: !sel.value || sel.value === "__cadastrar__",
      msg: "Escolha quem vai lançar no Controle Financeiro.",
    });
    if (window.BapellCampos && !window.BapellCampos.exigir(itensValid)) return;
    if (!window.BapellCampos) {
      var falta = itensValid.find(function (it) {
        return it.vazio !== undefined
          ? it.vazio
          : !String(it.el.value || "").trim();
      });
      if (falta) {
        aviso(falta.msg, "warning");
        return;
      }
    }
    if (!U) {
      gravarExportacao("");
      return;
    }
    _confirmandoExport = true;
    U.confirmarResponsavel(sel.value, {
      acao: "lançar no Controle Financeiro",
    }).then(
      function (r) {
        _confirmandoExport = false;
        if (!exportando) return; // a janela foi fechada enquanto a senha era pedida
        if (r.ok) gravarExportacao(r.usuario.nome, r.usuario.id);
        else if (r.motivo === "vazio" && window.BapellCampos)
          window.BapellCampos.marcar(sel);
      },
      function () {
        _confirmandoExport = false;
      },
    );
  }

  function gravarExportacao(responsavel, responsavelId) {
    if (!exportando) return;
    var cont = lerContainerDre();
    if (!cont) {
      formatoAntigoFinanceiro();
      return;
    }
    var lista = carregar();
    var lote = exportando.lote;
    var dataLote = lote
      ? (($("meDataLote").querySelector("button.ativo") || {}).dataset || {})
          .valor || "chegada"
      : "";
    var idsUsados = [];
    var feitos = [];
    var empresasFin = {};
    var hoje = hojeISO();

    exportando.ids.forEach(function (id) {
      var d = lista.find(function (x) {
        return x.id === id;
      });
      if (!d) return;
      var c = calcular(d);
      if (!(c.prejuizo > 0)) return;
      var sit = situacaoFin(d, cont);
      if (lote && (sit === "ok" || sit === "diferente")) return; // já está lá
      var r = criarLancamento(cont, d, {
        data: lote
          ? dataLote === "hoje"
            ? hoje
            : d.dataChegada || hoje
          : $("meData").value,
        descricao: lote
          ? descricaoPadrao(d)
          : String($("meDescricao").value || "")
              .trim()
              .slice(0, 160),
        responsavel: responsavel,
        idsUsados: idsUsados,
      });
      empresasFin[r.empresaFin.id] = r.empresaFin.nome;
      feitos.push(d);
    });

    if (!feitos.length) {
      aviso(
        "Nada para lançar: as devoluções escolhidas não têm prejuízo ou já estão no Controle Financeiro.",
        "warning",
        5200,
      );
      fecharJanela("modalExportar");
      exportando = null;
      return;
    }
    $("meConfirmar").disabled = true;
    if (!salvarContainerDre(cont)) {
      $("meConfirmar").disabled = false;
      return;
    }
    if (!gravar(lista)) {
      $("meConfirmar").disabled = false;
      return;
    }
    if (responsavelId) gravarPref({ responsavel: responsavelId });
    devolucoes = lista;
    var total = feitos.reduce(function (s, d) {
      return s + calcular(d).prejuizo;
    }, 0);
    var nomes = Object.keys(empresasFin).map(function (k) {
      return empresasFin[k];
    });
    var ativaFora = Object.keys(empresasFin).some(function (k) {
      return cont.ativaId !== k;
    });
    _destacar = feitos.length === 1 ? feitos[0].id : null;
    fecharJanela("modalExportar");
    exportando = null;
    render();
    aviso(
      (feitos.length === 1
        ? "Saída DEVOLUÇÃO de " + brl(total)
        : feitos.length + " saídas DEVOLUÇÃO (" + brl(total) + ")") +
        " lançada" +
        (feitos.length === 1 ? "" : "s") +
        " no Controle Financeiro de " +
        nomes.join(", ") +
        "." +
        (ativaFora ? " Selecione a empresa no Financeiro para ver." : ""),
      "success",
      6500,
    );
  }

  /** O botão do Financeiro na linha: exportar, ou ver/atualizar o que já foi. */
  function acaoFinanceiro(id) {
    var d = devolucoes.find(function (x) {
      return x.id === id;
    });
    if (!d) return;
    var cont = lerContainerDre();
    if (!cont) {
      formatoAntigoFinanceiro();
      return;
    }
    var c = calcular(d);
    var sit = situacaoFin(d, cont);
    if (sit === "nao" || sit === "perdido") {
      if (!(c.prejuizo > 0)) {
        if (window.BapellModal) {
          window.BapellModal.avisar({
            tipo: "info",
            titulo: "Sem prejuízo para lançar",
            texto: c.reembolsou
              ? "A plataforma reembolsou esta devolução e não há valor extra: o prejuízo é zero. O imposto fica registrado aqui, mas não vai para o Controle Financeiro."
              : "Esta devolução não gerou imposto nem tem valor extra, então não tem prejuízo para lançar no Controle Financeiro.",
          });
        }
        return;
      }
      abrirExportar([d.id], false);
      return;
    }
    var achado = acharLancamento(cont, d);
    var valorLa = achado ? cent(Math.abs(Number(achado.mov.liquido) || 0)) : 0;
    var info =
      "Lançada em " +
      esc(fmtData(d.exportacao.data) || fmtDataHora(d.exportacao.em)) +
      " no Controle Financeiro de <strong>" +
      esc(d.exportacao.empresaFin || "") +
      "</strong>: <strong>" +
      esc(brl(valorLa)) +
      "</strong>, categoria " +
      esc(CATEGORIA_FIN) +
      (d.exportacao.responsavel
        ? ", por " + esc(d.exportacao.responsavel)
        : "") +
      ".";
    if (!window.BapellModal) return;
    if (sit === "ok") {
      window.BapellModal.avisar({
        tipo: "sucesso",
        titulo: "Já está no Controle Financeiro",
        html: info,
      });
      return;
    }
    // O prejuízo mudou depois do lançamento.
    var zerou = !(c.prejuizo > 0);
    window.BapellModal.escolher({
      tipo: "aviso",
      titulo: "O prejuízo mudou",
      html:
        info +
        "<br>Hoje o prejuízo desta devolução é <strong>" +
        esc(brl(c.prejuizo)) +
        "</strong>.",
      botoes: [
        { rotulo: "Deixar como está", valor: null, estilo: "secundario" },
        {
          rotulo: zerou
            ? "Remover o lançamento"
            : "Atualizar para " + brl(c.prejuizo),
          valor: "sim",
          estilo: zerou ? "perigo" : "primario",
          foco: true,
        },
      ],
    }).then(function (r) {
      if (r !== "sim") return;
      var c2 = lerContainerDre();
      var lista = carregar();
      var dd = lista.find(function (x) {
        return x.id === id;
      });
      var a2 = c2 && dd ? acharLancamento(c2, dd) : null;
      if (!a2) {
        aviso(
          "O lançamento não foi encontrado no Controle Financeiro.",
          "warning",
        );
        render();
        return;
      }
      var cc = calcular(dd);
      if (cc.prejuizo > 0) {
        a2.mov.liquido = -cc.prejuizo;
        a2.mov.atualizadoEm = Date.now();
        a2.mov.editado = true;
        dd.exportacao = Object.assign({}, dd.exportacao, {
          valor: cc.prejuizo,
        });
      } else {
        a2.store.movimentacoes.splice(a2.idx, 1);
        dd.exportacao = null;
      }
      if (!salvarContainerDre(c2)) return;
      if (!gravar(lista)) return;
      devolucoes = lista;
      _destacar = id;
      render();
      aviso(
        cc.prejuizo > 0
          ? "Lançamento atualizado para " + brl(cc.prejuizo) + "."
          : "Lançamento removido do Controle Financeiro.",
        "success",
      );
    });
  }

  function exportarLote() {
    var cont = lerContainerDre();
    if (!cont) {
      formatoAntigoFinanceiro();
      return;
    }
    var lista = filtrar(devolucoes, lerFiltros(), cont).filter(function (d) {
      var s = situacaoFin(d, cont);
      return calcular(d).prejuizo > 0 && (s === "nao" || s === "perdido");
    });
    if (!lista.length) {
      if (window.BapellModal) {
        window.BapellModal.avisar({
          tipo: "info",
          titulo: "Nada para exportar",
          texto:
            "Nenhuma devolução da lista tem prejuízo ainda não exportado. As reembolsadas e as sem imposto, quando não têm valor extra, não têm prejuízo; as já exportadas aparecem com o sinal verde.",
        });
      }
      return;
    }
    abrirExportar(
      ordenar(lista).map(function (d) {
        return d.id;
      }),
      true,
    );
  }

  // ─────────────────────────────────────────────
  //  ADICIONAR EMPRESA (escolher do cadastro)
  // ─────────────────────────────────────────────
  function abrirEmpresas() {
    var empresas = listarEmpresas();
    var lista = $("mempLista");
    lista.innerHTML = empresas.length
      ? empresas
          .map(function (e) {
            return (
              '<button type="button" class="dev-emp-opcao" data-usar-emp="' +
              esc(e.id) +
              '">' +
              logoMini(e.logo, 30, e.nome) +
              '<span class="dev-emp-opcao__nome">' +
              esc(e.nome) +
              "</span>" +
              '<span class="dev-emp-opcao__acao">' +
              (e.id === empresaAtiva ? "Selecionada" : "Usar") +
              "</span></button>"
            );
          })
          .join("")
      : '<div class="dev-emp-vazio">Nenhuma empresa cadastrada ainda.</div>';
    abrirJanela("modalEmpresas", empresas.length ? null : "mempCadastrar");
  }

  /** Sem empresa no cadastro não há devolução: leva a Dados da Empresa. */
  function pedirCadastroEmpresa() {
    if (!window.BapellModal) return;
    window.BapellModal.confirmar({
      tipo: "aviso",
      titulo: "Cadastre uma empresa",
      texto:
        "As devoluções são registradas por empresa, e o imposto usa a porcentagem de imposto por nota dela. Cadastre a empresa em Dados da Empresa.",
      botao: "Ir para Dados da Empresa",
      cancelar: "Agora não",
    }).then(function (sim) {
      if (sim) window.location.href = "empresa.html";
    });
  }

  // ─────────────────────────────────────────────
  //  AS TRÊS TELAS (menu lateral)
  // ─────────────────────────────────────────────
  function idDaSecao(v) {
    return "vista" + v.charAt(0).toUpperCase() + v.slice(1);
  }

  /**
   * Mostra uma das telas do Gestor. Saindo de "Registrar futuras", o
   * formulário volta para a janela de lançamento (quem chama já perguntou
   * se o que estava preenchido podia ser descartado).
   * opcoes.futura: na tela Registrar, a futura a editar (null = nova).
   */
  function mostrarVista(v, opcoes) {
    opcoes = opcoes || {};
    if (VISTAS.indexOf(v) < 0) v = "lancamento";
    var antes = vista;
    vista = v;
    VISTAS.forEach(function (id) {
      var sec = $(idDaSecao(id));
      if (sec) sec.hidden = id !== v;
    });
    document.querySelectorAll(".dev-nav-btn[data-vista]").forEach(function (b) {
      var on = b.dataset.vista === v;
      b.classList.toggle("ativo", on);
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    if (antes === "registrar" && v !== "registrar") {
      if (form && form.modo === "futura") {
        fecharSugestoes();
        form = null;
      }
      if (window.BapellCampos)
        window.BapellCampos.limparTodos($("vistaRegistrar"));
      moverCorpo("janela");
    }
    if (
      v === "registrar" &&
      (opcoes.futura !== undefined ||
        antes !== "registrar" ||
        !form ||
        form.modo !== "futura")
    ) {
      iniciarFormFutura(opcoes.futura || null);
      focarFormFutura();
    }
    renderNav();
    renderFuturas();
    try {
      window.scrollTo(0, 0);
    } catch (e) {}
  }

  /** Os dados do formulário, para saber se algo mudou desde que abriu. */
  function assinaturaForm() {
    var d = dadosDaJanela();
    return JSON.stringify([
      d.empresaId,
      d.lojaId,
      d.produtoId,
      d.kitId,
      d.sku,
      String($("mdSku").value || "").trim(),
      d.anuncio,
      d.valorUnitario,
      String($("mdQtd").value || ""),
      d.gerouImposto,
      d.reputacao,
      d.reembolsou,
      d.valorReembolsado,
      d.estado,
      d.dataChegada,
      d.numeroVenda,
      d.numeroErp,
      d.observacoes,
      d.valorExtra,
      d.motivoExtra,
    ]);
  }

  /** A tela Registrar tem um registro (ou uma edição) que ainda não foi salvo? */
  function formFuturaSujo() {
    return (
      vista === "registrar" &&
      !!form &&
      form.modo === "futura" &&
      assinaturaForm() !== form.assinatura
    );
  }

  /** Pergunta antes de descartar o que está preenchido na tela Registrar. */
  function podeSairDoRegistro() {
    if (!formFuturaSujo() || !window.BapellModal) return Promise.resolve(true);
    var editando = !!form.futuraId;
    return window.BapellModal.escolher({
      tipo: "aviso",
      titulo: editando
        ? "Descartar as alterações?"
        : "Descartar o registro em andamento?",
      texto: editando
        ? "As alterações desta devolução futura ainda não foram salvas."
        : "A devolução futura que você está preenchendo ainda não foi registrada.",
      botoes: [
        {
          rotulo: editando ? "Continuar editando" : "Continuar registrando",
          valor: false,
          estilo: "secundario",
          foco: true,
        },
        { rotulo: "Descartar", valor: true, estilo: "perigo" },
      ],
    }).then(function (r) {
      return r === true;
    });
  }

  // ─────────────────────────────────────────────
  //  REGISTRAR FUTURAS DEVOLUÇÕES
  //  O formulário é o da janela de lançamento (#mdCorpo), trazido para a
  //  tela: a busca pela SKU, os preços, as perguntas e a conta são os
  //  mesmos. Muda o que é obrigatório e onde a devolução é gravada.
  // ─────────────────────────────────────────────
  /** Preenche o formulário com uma devolução futura (para lançar ou editar). */
  function preencherFormComFutura(f, modo) {
    preencherSelectEmpresa(empresaPorId(f.empresaId) ? f.empresaId : "");
    var lojaOk =
      !!f.lojaId &&
      listarLojas().some(function (l) {
        return l.id === f.lojaId;
      });
    preencherSelectLoja($("mdEmpresa").value && lojaOk ? f.lojaId : "");
    form.opcao = null;
    form.orfao = null;
    form.anuncio = "";
    var lojaAtual = $("mdLoja").value;
    if (
      lojaAtual &&
      lojaAtual === f.lojaId &&
      f.produtoId !== null &&
      f.produtoId !== undefined
    ) {
      var op = opcaoPorIds(lojaAtual, f.produtoId, f.kitId);
      if (op) form.opcao = op;
      else form.orfao = { nome: f.produtoNome, sku: f.sku, kitQtd: f.kitQtd };
    }
    if (form.opcao && form.opcao.precos.ml) {
      form.anuncio =
        f.anuncio === "classico" && form.opcao.precos.classico > 0
          ? "classico"
          : form.opcao.precos.premium > 0
            ? "premium"
            : "classico";
    }
    limparCampos();
    // SKU sem produto escolhido (digitada no registro): fica no campo, para buscar.
    $("mdSku").value = f.sku || "";
    if (f.valorUnitario > 0) {
      $("mdValor").value = textoDoNumero(f.valorUnitario);
      form.valorManual = true;
    } else {
      var preco = precoEscolhido();
      $("mdValor").value = preco > 0 ? textoDoNumero(preco) : "";
      form.valorManual = false;
    }
    $("mdQtd").value = String(f.quantidade || 1);
    $("mdVenda").value = f.numeroVenda || "";
    $("mdErp").value = f.numeroErp || "";
    $("mdObs").value = f.observacoes || "";
    $("mdExtra").value = f.valorExtra > 0 ? textoDoNumero(f.valorExtra) : "";
    $("mdExtraMotivo").value = f.motivoExtra || "";
    // No lançamento, a chegada é a de verdade (hoje, para mudar se preciso).
    $("mdChegada").value =
      modo === "futura" ? f.previsaoChegada || "" : hojeISO();
    form.gerouImposto = f.gerouImposto;
    form.reputacao = f.reputacao;
    form.reembolsou = f.reembolsou;
    form.estado = f.estado || "";
    form.aliquota = null; // vale a % de imposto da empresa na hora
    form.aliquotaEmpresaDe = "";
    marcarEscolha("mdImposto", simNaoParaValor(form.gerouImposto));
    marcarEscolha("mdReputacao", simNaoParaValor(form.reputacao));
    marcarEscolha("mdReembolso", reembolsoParaValor(form.reembolsou));
    marcarEscolha("mdEstado", form.estado);
    $("mdValorReemb").value =
      f.reembolsou === true && f.valorReembolsado > 0
        ? textoDoNumero(f.valorReembolsado)
        : "";
    mostrarValorReemb();
    fecharSugestoes();
    atualizarEstadoLoja();
    renderProdutoEscolhido();
    atualizarForm();
  }

  /** Prepara a tela Registrar: formulário novo (f = null) ou edição de f. */
  function iniciarFormFutura(f) {
    moverCorpo("tela");
    form = formVazio();
    form.modo = "futura";
    form.futuraId = f ? f.id : null;
    aplicarModo();
    $("mdAtualizarFin").checked = true;
    if (f) {
      preencherFormComFutura(f, "futura");
    } else {
      var padrao = padraoNovo();
      preencherSelectEmpresa(padrao.empresa);
      preencherSelectLoja(padrao.empresa ? padrao.loja : "");
      limparCampos();
      marcarEscolha("mdImposto", "");
      marcarEscolha("mdReputacao", "");
      marcarEscolha("mdReembolso", "");
      marcarEscolha("mdEstado", "");
      mostrarValorReemb();
      fecharSugestoes();
      atualizarEstadoLoja();
      renderProdutoEscolhido();
      atualizarForm();
    }
    var U = window.BapellUsuarios;
    preencherResponsavel(
      $("fdResponsavel"),
      f
        ? f.responsavelId && U && U.obter(f.responsavelId)
          ? f.responsavelId
          : f.responsavel || ""
        : lerPref().responsavelLanc || "",
    );
    $("fdCardTituloTxt").textContent = f
      ? "Editar devolução futura"
      : "Nova devolução a caminho";
    var tag = $("fdEditando");
    tag.hidden = !f;
    tag.textContent = f
      ? "Registrada em " +
        fmtDataHora(f.criadoEm) +
        (f.responsavel ? " por " + f.responsavel : "")
      : "";
    $("fdSalvar").textContent = f
      ? "Salvar alterações"
      : "Registrar devolução futura";
    $("fdCancelar").textContent = f ? "Cancelar edição" : "Limpar";
    if (window.BapellCampos)
      window.BapellCampos.limparTodos($("vistaRegistrar"));
    form.assinatura = assinaturaForm();
    renderSubtituloFut();
  }

  /** O foco no primeiro campo que falta (empresa, loja ou SKU). */
  function focarFormFutura() {
    var alvo = !$("mdEmpresa").value
      ? "mdEmpresa"
      : !$("mdLoja").value
        ? "mdLoja"
        : "mdSku";
    setTimeout(function () {
      try {
        var el = $(alvo);
        if (vista === "registrar" && el && !el.disabled)
          el.focus({ preventScroll: true });
      } catch (e) {}
    }, 60);
  }

  /** "Limpar" (registro novo) ou "Cancelar edição" (volta para Acompanhar). */
  function cancelarFutura() {
    if (!form || form.modo !== "futura") return;
    var editando = !!form.futuraId;
    podeSairDoRegistro().then(function (ok) {
      if (!ok) return;
      if (editando) {
        if (form) form.assinatura = assinaturaForm();
        mostrarVista("acompanhar");
      } else {
        iniciarFormFutura(null);
        focarFormFutura();
      }
    });
  }

  /** Produto, SKU digitada, nº da venda ou nº no ERP: algo que identifique. */
  function identResolvido() {
    return (
      !!(form && (form.opcao || form.orfao)) ||
      !!String($("mdSku").value || "").trim() ||
      !!String($("mdVenda").value || "").trim() ||
      !!String($("mdErp").value || "").trim()
    );
  }

  var _salvandoFut = false;
  function salvarFutura() {
    if (!form || form.modo !== "futura" || _salvandoFut) return;
    if (!listarEmpresas().length) {
      pedirCadastroEmpresa();
      return;
    }
    var d = dadosDaJanela();
    // Uma SKU digitada sem escolher o produto (ele pode não estar cadastrado
    // ainda) também vale: ela fica no registro e volta no lançamento.
    var skuDigitada =
      !form.opcao && !form.orfao ? String($("mdSku").value || "").trim() : "";
    if (skuDigitada) d.sku = skuDigitada;
    var U = window.BapellUsuarios;
    var selResp = $("fdResponsavel");
    if (U && !U.listar().length) {
      if (window.BapellCampos) window.BapellCampos.marcar(selResp);
      U.pedirCadastro();
      return;
    }
    var temIdent = identResolvido();
    var qtdTxt = String($("mdQtd").value || "").trim();
    var qtdOk =
      !qtdTxt ||
      (d.quantidade >= 1 && qtdTxt.indexOf(".") < 0 && qtdTxt.indexOf(",") < 0);
    var msgIdent = "Informe o produto (SKU) ou o número da venda.";
    var itens = [
      { el: $("mdEmpresa"), msg: "Escolha a empresa da devolução." },
      { el: $("mdLoja"), msg: "Escolha a loja da devolução." },
      {
        el: $("mdSku"),
        vazio: !temIdent,
        resolvido: identResolvido,
        msg: msgIdent,
      },
      {
        el: $("mdVenda"),
        vazio: !temIdent,
        resolvido: identResolvido,
        msg: msgIdent,
      },
      {
        el: $("mdQtd"),
        vazio: !qtdOk,
        msg: "A quantidade devolvida é um número inteiro, a partir de 1.",
      },
    ];
    if (U)
      itens.push({
        el: selResp,
        vazio: !selResp.value || selResp.value === "__cadastrar__",
        msg: "Escolha o responsável pelo registro.",
      });
    if (window.BapellCampos) {
      if (!window.BapellCampos.exigir(itens)) return;
    } else {
      var falta = itens.find(function (it) {
        return it.vazio !== undefined
          ? it.vazio
          : !String(it.el.value || "").trim();
      });
      if (falta) {
        aviso(falta.msg, "warning", 4200);
        return;
      }
    }

    // Mesma venda e mesma SKU, aguardando na mesma loja: provavelmente repetida.
    var origF = form.futuraId
      ? futuras.find(function (x) {
          return x.id === form.futuraId;
        })
      : null;
    var mudouChave =
      !origF ||
      origF.lojaId !== d.lojaId ||
      normSku(origF.sku) !== normSku(d.sku) ||
      String(origF.numeroVenda || "")
        .trim()
        .toLowerCase() !== d.numeroVenda.toLowerCase();
    var repetida =
      d.numeroVenda && mudouChave
        ? futuras.find(function (x) {
            return (
              x.id !== form.futuraId &&
              x.status === "aguardando" &&
              x.lojaId === d.lojaId &&
              normSku(x.sku) === normSku(d.sku) &&
              String(x.numeroVenda).trim().toLowerCase() ===
                d.numeroVenda.toLowerCase()
            );
          })
        : null;
    var seguir = Promise.resolve(true);
    if (repetida && window.BapellModal) {
      seguir = window.BapellModal.confirmar({
        tipo: "aviso",
        titulo: "Devolução futura repetida?",
        html:
          "Já há uma devolução a caminho da venda nº <strong>" +
          esc(d.numeroVenda) +
          "</strong>" +
          (d.sku ? " com a SKU <strong>" + esc(d.sku) + "</strong>" : "") +
          " nesta loja, aguardando a chegada. Registrar mesmo assim?",
        botao: "Registrar mesmo assim",
        cancelar: "Voltar",
      });
    }
    _salvandoFut = true;
    var formAntes = form;
    seguir.then(
      function (ok) {
        if (!ok || form !== formAntes) {
          _salvandoFut = false;
          return;
        }
        if (!U) {
          _salvandoFut = false;
          gravarFutura(d, null);
          return;
        }
        // Quem tem senha confirma digitando a dele (como no lançamento).
        U.confirmarResponsavel(selResp.value, {
          acao: form.futuraId
            ? "salvar esta devolução futura"
            : "registrar esta devolução futura",
        }).then(
          function (r) {
            _salvandoFut = false;
            if (form !== formAntes || vista !== "registrar") return;
            if (!r.ok) {
              if (r.motivo === "vazio" && window.BapellCampos)
                window.BapellCampos.marcar(selResp);
              return;
            }
            gravarFutura(d, r.usuario);
          },
          function () {
            _salvandoFut = false;
          },
        );
      },
      function () {
        _salvandoFut = false;
      },
    );
  }

  function gravarFutura(d, usuario) {
    var agora = Date.now();
    var lista = carregarFuturas();
    var idx = form.futuraId
      ? lista.findIndex(function (x) {
          return x.id === form.futuraId;
        })
      : -1;
    if (form.futuraId && idx < 0) {
      // Excluída em outra aba enquanto era editada: o que está na tela fica,
      // e o próximo clique registra como nova.
      form.futuraId = null;
      $("fdCardTituloTxt").textContent = "Nova devolução a caminho";
      $("fdEditando").hidden = true;
      $("fdSalvar").textContent = "Registrar devolução futura";
      $("fdCancelar").textContent = "Limpar";
      aviso(
        "Esta devolução futura foi excluída. Os dados continuam na tela: clique de novo para registrá-la como nova.",
        "warning",
        7000,
      );
      return;
    }
    var antes = idx >= 0 ? lista[idx] : null;
    if (antes && antes.status === "lancada") {
      aviso(
        "Esta devolução futura já foi lançada e não muda mais. Para corrigir os dados, edite a devolução em Lançamento de devoluções.",
        "warning",
        7000,
      );
      return;
    }
    // Produto que saiu do cadastro (órfão): os ids gravados continuam.
    var manterProduto = !!(form.orfao && antes && antes.lojaId === d.lojaId);
    var reg = normalizarFutura({
      id: antes ? antes.id : novoIdFutura(),
      criadoEm: antes ? antes.criadoEm : agora,
      atualizadoEm: agora,
      status: "aguardando",
      empresaId: d.empresaId,
      empresaNome: d.empresaNome,
      lojaId: d.lojaId,
      lojaNome: d.lojaNome,
      produtoId: manterProduto ? antes.produtoId : d.produtoId,
      kitId: manterProduto ? antes.kitId : d.kitId,
      kitQtd: d.kitQtd,
      sku: d.sku,
      produtoNome: d.produtoNome,
      anuncio: manterProduto ? antes.anuncio : d.anuncio,
      valorUnitario: d.valorUnitario,
      quantidade: d.quantidade,
      gerouImposto: d.gerouImposto,
      reputacao: d.reputacao,
      reembolsou: d.reembolsou,
      valorReembolsado: d.valorReembolsado,
      estado: d.estado,
      previsaoChegada: d.dataChegada,
      numeroVenda: d.numeroVenda,
      numeroErp: d.numeroErp,
      observacoes: d.observacoes,
      valorExtra: d.valorExtra,
      motivoExtra: d.motivoExtra,
      responsavel: usuario ? usuario.nome : antes ? antes.responsavel : "",
      responsavelId: usuario ? usuario.id : antes ? antes.responsavelId : "",
      lembreteId: antes ? antes.lembreteId : "",
      lembreteEm: antes ? antes.lembreteEm : "",
    });
    if (!reg) return;
    if (idx >= 0) lista[idx] = reg;
    else lista.push(reg);
    if (!gravarFuturas(lista)) return;
    futuras = lista;
    var pref = { loja: reg.lojaId, empresaForm: reg.empresaId };
    if (reg.responsavelId) pref.responsavelLanc = reg.responsavelId;
    gravarPref(pref);
    _destacarFut = reg.id;
    if (antes) {
      form.assinatura = assinaturaForm();
      mostrarVista("acompanhar");
      aviso("Devolução futura atualizada.", "success");
    } else {
      iniciarFormFutura(null);
      focarFormFutura();
      renderNav();
      aviso(
        "Devolução futura registrada. Ela está em Acompanhar devoluções, aguardando a chegada.",
        "success",
        4600,
      );
    }
  }

  // ─────────────────────────────────────────────
  //  ACOMPANHAR DEVOLUÇÕES
  // ─────────────────────────────────────────────
  /** O nome do produto; sem produto escolhido, "Produto a definir" (a SKU e a venda vão embaixo). */
  function nomeDaFutura(f) {
    return f.produtoNome || "Produto a definir";
  }

  /** A devolução lançada a partir da futura (se ainda existir). */
  function devolucaoDaFutura(f) {
    if (!f || f.status !== "lancada" || !f.devolucaoId) return null;
    return (
      devolucoes.find(function (x) {
        return x.id === f.devolucaoId;
      }) || null
    );
  }

  /** O lembrete criado para a futura (se ainda existir na tela Lembretes). */
  function lembreteDaFutura(f, porId) {
    if (!f || !f.lembreteId) return null;
    if (porId) return porId[f.lembreteId] || null;
    return (
      lerLembretes().find(function (l) {
        return l && l.id === f.lembreteId;
      }) || null
    );
  }

  /** O número ao lado de "Acompanhar devoluções": as que aguardam chegada. */
  function renderNav() {
    var n = futuras.filter(function (f) {
      return f.status === "aguardando";
    }).length;
    var b = $("navAcompanharContagem");
    if (b) {
      b.hidden = !n;
      b.textContent = n > 99 ? "99+" : inteiro(n);
    }
    var btn = $("navAcompanhar");
    if (btn)
      btn.title =
        "Acompanhar devoluções" +
        (n
          ? " — " +
            (n === 1
              ? "1 aguardando chegada"
              : inteiro(n) + " aguardando chegada")
          : "");
  }

  function renderSubtituloFut() {
    var emp = empresaAtiva ? empresaPorId(empresaAtiva) : null;
    var nome = empresaAtiva
      ? emp
        ? emp.nome
        : "Empresa removida do cadastro"
      : "Todas as empresas";
    var daEmp = futuras.filter(function (f) {
      return !empresaAtiva || f.empresaId === empresaAtiva;
    });
    var ag = daEmp.filter(function (f) {
      return f.status === "aguardando";
    }).length;
    var la = daEmp.length - ag;
    var sub = $("dfSubtitulo");
    if (sub) {
      sub.innerHTML =
        "<strong>" +
        esc(nome) +
        "</strong> · " +
        (ag === 1
          ? "1 aguardando chegada"
          : inteiro(ag) + " aguardando chegada") +
        " · " +
        (la === 1 ? "1 já lançada" : inteiro(la) + " já lançadas");
    }
    var sub2 = $("fdSubtitulo");
    if (sub2) {
      var agTodas = futuras.filter(function (f) {
        return f.status === "aguardando";
      }).length;
      sub2.innerHTML =
        "Devoluções que ainda estão a caminho" +
        (agTodas
          ? " · <strong>" + inteiro(agTodas) + "</strong> aguardando chegada"
          : "");
    }
  }

  function filtrarFuturas() {
    var busca = normTxt(($("dfBusca") || {}).value || "");
    var sit = ($("dfSituacao") || {}).value || "";
    return futuras.filter(function (f) {
      if (empresaAtiva && f.empresaId !== empresaAtiva) return false;
      if (sit && f.status !== sit) return false;
      if (busca) {
        var alvo = normTxt(
          [
            f.sku,
            f.produtoNome,
            f.numeroVenda,
            f.numeroErp,
            f.observacoes,
            f.lojaNome,
            f.empresaNome,
            f.responsavel,
            f.motivoExtra,
          ].join(" "),
        );
        if (alvo.indexOf(busca) < 0) return false;
      }
      return true;
    });
  }

  /** Aguardando primeiro (a previsão mais próxima em cima); depois as lançadas. */
  function ordenarFuturas(lista) {
    return lista.slice().sort(function (a, b) {
      var la = a.status === "lancada",
        lb = b.status === "lancada";
      if (la !== lb) return la ? 1 : -1;
      if (la) return (b.lancadaEm || 0) - (a.lancadaEm || 0);
      var pa = a.previsaoChegada || "9999-99-99",
        pb = b.previsaoChegada || "9999-99-99";
      if (pa !== pb) return pa < pb ? -1 : 1;
      return (a.criadoEm || 0) - (b.criadoEm || 0);
    });
  }

  function linhaFuturaHtml(f, ctx) {
    var nada = '<span class="dev-valor-nada">—</span>';
    var dev = devolucaoDaFutura(f);
    var lancada = f.status === "lancada";
    var lem = lembreteDaFutura(f, ctx.lembretes);
    var lemAberto = !!(lem && !lem.concluido);
    var c = calcular({
      valorUnitario: f.valorUnitario,
      quantidade: f.quantidade,
    });
    var nome = nomeDaFutura(f);
    var meta = [];
    if (f.sku) meta.push("SKU " + esc(f.sku));
    if (f.numeroVenda) meta.push("Venda nº " + esc(f.numeroVenda));
    if (f.numeroErp) meta.push("ERP " + esc(f.numeroErp));
    var tags = [];
    if (f.kitQtd > 1)
      tags.push(
        '<span class="dev-tag dev-tag--kit">Kit ' + f.kitQtd + " un</span>",
      );
    if (f.estado)
      tags.push(
        '<span class="dev-tag dev-estado" data-estado="' +
          esc(f.estado) +
          '">' +
          esc(ESTADOS[f.estado]) +
          "</span>",
      );
    if (f.observacoes)
      tags.push(
        '<span class="dev-tag dev-tag--obs" title="' +
          esc(f.observacoes) +
          '">' +
          svg(I_NOTA, 11) +
          "Obs.</span>",
      );
    if (f.valorExtra > 0) tags.push(tagExtra(f.valorExtra, f.motivoExtra));
    if (lem) {
      tags.push(
        '<button type="button" class="dev-tag dev-tag--lembrete" data-ver-lembrete="' +
          esc(lem.id) +
          '" title="Abrir este lembrete na tela Lembretes">' +
          svg(I_SINO, 11) +
          "Lembrete " +
          esc(fmtDataHoraLembrete(lem.dataHora).replace(" às ", " ")) +
          (lem.concluido ? " (concluído)" : "") +
          "</button>",
      );
    }

    var l = lojaPorId(f.lojaId);
    var nomeLoja = l ? l.nome : f.lojaNome || "—";
    var emp = empresaPorId(f.empresaId);
    var nomeEmp = emp ? emp.nome : f.empresaNome || "";

    var valorHtml =
      c.total > 0
        ? esc(brl(c.total)) +
          '<span class="dev-sub-num">' +
          esc(
            inteiro(c.qtd) +
              (f.kitQtd > 1 ? (c.qtd === 1 ? " kit" : " kits") : "") +
              " × " +
              brl(c.valor),
          ) +
          "</span>"
        : nada +
          '<span class="dev-sub-num">' +
          esc(
            inteiro(c.qtd) +
              (f.kitQtd > 1
                ? c.qtd === 1
                  ? " kit"
                  : " kits"
                : c.qtd === 1
                  ? " unidade"
                  : " unidades"),
          ) +
          "</span>";
    // O valor extra (frete da devolução, por exemplo) embaixo do valor.
    if (f.valorExtra > 0) {
      valorHtml +=
        '<span class="dev-sub-num dev-sub-num--extra" title="' +
        esc("Valor extra" + (f.motivoExtra ? ": " + f.motivoExtra : "")) +
        '">+ ' +
        esc(brl(f.valorExtra)) +
        " extra</span>";
    }
    var respHtml = f.responsavel
      ? '<span class="dev-resp-nome">' +
        esc(f.responsavel) +
        '</span><span class="dev-sub-num">registrou em ' +
        esc(fmtData(isoDe(new Date(f.criadoEm)))) +
        "</span>"
      : nada;

    var sit,
      sitTxt,
      sitSub = "";
    if (lancada && dev) {
      sit = "lancada";
      sitTxt = "Lançada";
      sitSub =
        (f.lancadaEm ? fmtData(isoDe(new Date(f.lancadaEm))) : "") +
        (f.lancadaPor ? " · " + f.lancadaPor : "");
    } else if (lancada) {
      sit = "excluida";
      sitTxt = "Devolução excluída";
      sitSub = "pode ser lançada de novo";
    } else if (f.previsaoChegada && f.previsaoChegada < ctx.hoje) {
      sit = "atrasada";
      sitTxt = "Atrasada";
      sitSub = "a previsão já passou";
    } else {
      sit = "aguardando";
      sitTxt = "Aguardando chegada";
    }

    var acoes = "";
    if (lancada && dev) {
      acoes +=
        '<button type="button" class="dev-acao dev-acao--feito" data-ver-dev="' +
        esc(f.id) +
        '" title="Ver a devolução lançada" aria-label="Ver a devolução lançada">' +
        svg(I_OK, 15) +
        "</button>";
    } else {
      acoes +=
        '<button type="button" class="dev-acao dev-acao--lancar" data-lancar="' +
        esc(f.id) +
        '" title="' +
        esc(
          lancada
            ? "A devolução lançada foi excluída. Clique para lançar de novo."
            : "O produto chegou? Lance a devolução (o lançamento abre já preenchido)",
        ) +
        '" aria-label="Lançar a devolução">' +
        svg(I_RECEBER, 15) +
        "</button>";
    }
    acoes +=
      '<button type="button" class="dev-acao' +
      (lemAberto ? " dev-acao--lembrete-on" : "") +
      (lancada && dev ? " dev-acao--inativo" : "") +
      '" data-lembrete="' +
      esc(f.id) +
      '" title="' +
      esc(
        lancada && dev
          ? "Já lançada: não precisa mais de lembrete"
          : lemAberto
            ? "Lembrete em " +
              fmtDataHoraLembrete(lem.dataHora) +
              ". Clique para abrir ou criar outro."
            : "Criar um lembrete na tela Lembretes",
      ) +
      '" aria-label="Lembrete">' +
      svg(I_SINO, 15) +
      "</button>";
    acoes +=
      '<button type="button" class="dev-acao' +
      (lancada ? " dev-acao--inativo" : "") +
      '" data-editar-fut="' +
      esc(f.id) +
      '" title="' +
      esc(
        lancada
          ? "Já lançada: os dados são corrigidos na devolução, em Lançamento de devoluções"
          : "Editar",
      ) +
      '" aria-label="Editar">' +
      svg(I_EDITAR, 15) +
      "</button>";
    acoes +=
      '<button type="button" class="dev-acao danger" data-excluir-fut="' +
      esc(f.id) +
      '" title="Excluir" aria-label="Excluir">' +
      svg(I_LIXO, 15) +
      "</button>";

    return (
      '<tr data-fut-id="' +
      esc(f.id) +
      '"' +
      (_destacarFut === f.id ? ' class="dev-linha-nova"' : "") +
      ">" +
      '<td class="dev-td-prod"><div class="dev-prod"><span class="dev-prod__img">' +
      imagemHtml(imagemDe(f, ctx.mapas), 40) +
      "</span>" +
      '<div class="dev-prod__txt"><div class="dev-prod__nome" title="' +
      esc(nome) +
      '">' +
      esc(nome) +
      "</div>" +
      (meta.length
        ? '<div class="dev-prod__meta">' + meta.join(" · ") + "</div>"
        : "") +
      (tags.length
        ? '<div class="dev-prod__tags">' + tags.join("") + "</div>"
        : "") +
      "</div></div></td>" +
      '<td><div class="dev-loja">' +
      logoLoja(f.lojaId, nomeLoja, 24) +
      '<div class="dev-loja__txt"><div class="dev-loja__nome">' +
      esc(nomeLoja) +
      "</div>" +
      (!empresaAtiva && nomeEmp
        ? '<div class="dev-loja__emp">' + esc(nomeEmp) + "</div>"
        : "") +
      "</div></div></td>" +
      "<td>" +
      (f.previsaoChegada ? esc(fmtData(f.previsaoChegada)) : nada) +
      "</td>" +
      '<td class="num">' +
      valorHtml +
      "</td>" +
      '<td class="dev-td-resp">' +
      respHtml +
      "</td>" +
      '<td><span class="dev-tag dev-sit" data-sit="' +
      sit +
      '">' +
      esc(sitTxt) +
      "</span>" +
      (sitSub ? '<span class="dev-sit-sub">' + esc(sitSub) + "</span>" : "") +
      "</td>" +
      '<td class="dev-col-acoes"><div class="dev-acoes">' +
      acoes +
      "</div></td>" +
      "</tr>"
    );
  }

  function renderFuturas() {
    var corpo = $("dfCorpo");
    if (!corpo) return;
    renderSubtituloFut();
    var lista = ordenarFuturas(filtrarFuturas());
    var porId = {};
    lerLembretes().forEach(function (l) {
      if (l && l.id) porId[l.id] = l;
    });
    var ctx = { mapas: {}, lembretes: porId, hoje: hojeISO() };
    corpo.innerHTML = lista
      .map(function (f) {
        return linhaFuturaHtml(f, ctx);
      })
      .join("");
    if (vista === "acompanhar") _destacarFut = null;

    var wrap = $("dfTabelaWrap");
    if (wrap) wrap.style.display = lista.length ? "" : "none";
    var vazio = $("dfVazio");
    if (vazio) {
      vazio.hidden = lista.length > 0;
      if (!lista.length) {
        var busca = String(($("dfBusca") || {}).value || "").trim();
        var sit = ($("dfSituacao") || {}).value || "";
        var daEmp = futuras.some(function (f) {
          return !empresaAtiva || f.empresaId === empresaAtiva;
        });
        var titulo, texto;
        if (!futuras.length) {
          titulo = "Nenhuma devolução a caminho";
          texto =
            "Use <strong>Registrar futura devolução</strong> quando souber de uma devolução que ainda não chegou.";
        } else if (busca) {
          titulo = "Nenhuma devolução futura com essa busca";
          texto = "Mude ou limpe a busca para ver as outras.";
        } else if (!daEmp) {
          titulo = "Nenhuma devolução futura desta empresa";
          texto =
            "Escolha <strong>Todas as empresas</strong> no menu lateral para ver as das outras.";
        } else if (sit === "aguardando") {
          titulo = "Nenhuma devolução aguardando chegada";
          texto =
            "As que já chegaram e foram lançadas estão em <strong>Já lançadas</strong>, na lista de situação.";
        } else if (sit === "lancada") {
          titulo = "Nenhuma devolução futura lançada ainda";
          texto =
            "Quando o produto chegar, use o botão de lançar na linha da devolução.";
        } else {
          titulo = "Nenhuma devolução a caminho";
          texto =
            "Use <strong>Registrar futura devolução</strong> quando souber de uma devolução que ainda não chegou.";
        }
        $("dfVazioTitulo").textContent = titulo;
        $("dfVazioTexto").innerHTML = texto;
      }
    }
    var cont = $("dfContagem");
    if (cont) cont.textContent = lista.length ? inteiro(lista.length) : "";
  }

  /** "Lançar": a janela de lançamento abre com os dados da futura. */
  function lancarFutura(id) {
    var f = futuras.find(function (x) {
      return x.id === id;
    });
    if (!f) return;
    if (devolucaoDaFutura(f)) {
      verDevolucaoDaFutura(id);
      return;
    }
    if (!listarEmpresas().length) {
      pedirCadastroEmpresa();
      return;
    }
    abrirDevolucao(null);
    form.futuraId = f.id;
    preencherFormComFutura(f, "lancar");
    // Responsável: o último usado; sem ele, quem registrou a futura.
    if (!$("mdResponsavel").value) {
      var U = window.BapellUsuarios;
      preencherResponsavel(
        $("mdResponsavel"),
        f.responsavelId && U && U.obter(f.responsavelId)
          ? f.responsavelId
          : f.responsavel || "",
      );
    }
    $("mdTitulo").textContent = "Lançar devolução recebida";
    $("mdSub").innerHTML =
      "Registrada como futura em " +
      esc(fmtDataHora(f.criadoEm)) +
      (f.responsavel
        ? " por <strong>" + esc(f.responsavel) + "</strong>"
        : "") +
      '. Confira os dados, complete o que falta (<span class="dev-obrig">*</span>) e salve para lançar.';
    $("mdSalvar").textContent = "Lançar devolução";
    // O foco no primeiro campo que falta.
    var alvo = !$("mdEmpresa").value
      ? "mdEmpresa"
      : !$("mdLoja").value
        ? "mdLoja"
        : !(form.opcao || form.orfao)
          ? "mdSku"
          : !(cent(numeroDoTexto($("mdValor").value)) > 0)
            ? "mdValor"
            : form.gerouImposto === null
              ? "mdImposto"
              : form.reputacao === null
                ? "mdReputacao"
                : form.reembolsou === null
                  ? "mdReembolso"
                  : form.reembolsou === true &&
                      !(cent(numeroDoTexto($("mdValorReemb").value)) > 0)
                    ? "mdValorReemb"
                    : !form.estado
                      ? "mdEstado"
                      : f.valorExtra > 0 && !String(f.motivoExtra || "").trim()
                        ? "mdExtraMotivo"
                        : !(f.valorExtra > 0) &&
                            String(f.motivoExtra || "").trim()
                          ? "mdExtra"
                          : !$("mdResponsavel").value
                            ? "mdResponsavel"
                            : "mdSalvar";
    setTimeout(function () {
      try {
        var el = $(alvo);
        if (el && !el.disabled && janelaAberta("modalDevolucao")) el.focus();
      } catch (e) {}
    }, 60);
  }

  /** A devolução lançada a partir da futura, na janela de edição. */
  function verDevolucaoDaFutura(id) {
    var f = futuras.find(function (x) {
      return x.id === id;
    });
    var dev = f ? devolucaoDaFutura(f) : null;
    if (!dev) {
      aviso("A devolução lançada não está mais na lista.", "warning");
      render();
      return;
    }
    // Abrir a devolução é o mesmo que o botão Editar da lista: se ele pede
    // usuário e senha (Senha nos botões), aqui também pede.
    var S = window.BapellSenhas;
    var exigir =
      S && typeof S.exigirBotao === "function"
        ? S.exigirBotao("dev:editar")
        : Promise.resolve(true);
    exigir.then(function (ok) {
      if (ok) abrirDevolucao(dev);
    });
  }

  function editarFutura(id) {
    var f = futuras.find(function (x) {
      return x.id === id;
    });
    if (!f) return;
    if (f.status === "lancada") {
      if (window.BapellModal) {
        window.BapellModal.avisar({
          tipo: "info",
          titulo: "Devolução já lançada",
          texto: devolucaoDaFutura(f)
            ? "Esta devolução futura já virou uma devolução lançada. Para corrigir os dados, edite a devolução em Lançamento de devoluções (ou pelo botão de ver, na linha)."
            : "A devolução lançada a partir desta futura foi excluída. Para registrá-la de novo, use o botão de lançar na linha.",
        });
      }
      return;
    }
    mostrarVista("registrar", { futura: f });
  }

  function excluirFutura(id) {
    var f = futuras.find(function (x) {
      return x.id === id;
    });
    if (!f) return;
    var dev = devolucaoDaFutura(f);
    var lem = lembreteDaFutura(f);
    var html =
      "<strong>" +
      esc(f.produtoNome || (f.sku ? "SKU " + f.sku : "Devolução futura")) +
      "</strong>" +
      (f.numeroVenda ? ", venda nº " + esc(f.numeroVenda) : "") +
      ".<br>" +
      (dev
        ? "Ela sai só do acompanhamento: a devolução lançada continua em Lançamento de devoluções."
        : "Ela sai do acompanhamento. Esta ação não pode ser desfeita.") +
      (lem && !lem.concluido
        ? "<br>O lembrete dela continua na tela Lembretes."
        : "");
    var executar = function () {
      var lista = carregarFuturas().filter(function (x) {
        return x.id !== id;
      });
      if (!gravarFuturas(lista)) return;
      futuras = lista;
      render();
      aviso("Devolução futura excluída.", "success");
    };
    if (!window.BapellModal) {
      executar();
      return;
    }
    window.BapellModal.confirmar({
      perigo: true,
      titulo: "Excluir esta devolução futura?",
      html: html,
      botao: "Excluir",
      cancelar: "Cancelar",
    }).then(function (sim) {
      if (sim) executar();
    });
  }

  // ─────────────────────────────────────────────
  //  LEMBRETE DA DEVOLUÇÃO FUTURA
  //  Gravado na lista da tela Lembretes, no formato dela (lembretes.js):
  //  aparece lá, avisa na hora e pode ser editado, concluído ou excluído
  //  como qualquer outro. A futura guarda o id do lembrete.
  // ─────────────────────────────────────────────
  var lembrando = null; // id da futura da janela do lembrete

  function tituloLembretePadrao(f) {
    var oque =
      f.produtoNome ||
      (f.sku
        ? "SKU " + f.sku
        : f.numeroVenda
          ? "venda nº " + f.numeroVenda
          : "produto");
    return ("Devolução a caminho: " + oque).slice(0, 120);
  }

  function obsLembretePadrao(f) {
    var linhas = ["Devolução registrada no Gestor de Devoluções."];
    var prod = f.produtoNome || "";
    if (f.sku) prod += prod ? " (SKU " + f.sku + ")" : "SKU " + f.sku;
    if (f.kitQtd > 1) prod += " — kit " + f.kitQtd + " un";
    if (prod) linhas.push("Produto: " + prod);
    var loja = lojaPorId(f.lojaId);
    var emp = empresaPorId(f.empresaId);
    var onde = [];
    if (loja || f.lojaNome)
      onde.push("Loja: " + (loja ? loja.nome : f.lojaNome));
    if (emp || f.empresaNome)
      onde.push("Empresa: " + (emp ? emp.nome : f.empresaNome));
    if (onde.length) linhas.push(onde.join(" · "));
    var nums = [];
    if (f.numeroVenda) nums.push("Venda nº " + f.numeroVenda);
    if (f.numeroErp) nums.push("ERP " + f.numeroErp);
    if (nums.length) linhas.push(nums.join(" · "));
    var c = calcular({
      valorUnitario: f.valorUnitario,
      quantidade: f.quantidade,
    });
    linhas.push(
      "Quantidade: " +
        inteiro(c.qtd) +
        (f.kitQtd > 1 ? (c.qtd === 1 ? " kit" : " kits") : "") +
        (c.total > 0 ? " · Valor da devolução: " + brl(c.total) : ""),
    );
    if (f.valorExtra > 0)
      linhas.push(
        "Valor extra: " +
          brl(f.valorExtra) +
          (f.motivoExtra ? " (" + f.motivoExtra + ")" : ""),
      );
    if (f.previsaoChegada)
      linhas.push("Previsão de chegada: " + fmtData(f.previsaoChegada));
    if (f.observacoes) linhas.push("Observações: " + f.observacoes);
    return linhas.join("\n").slice(0, 1000);
  }

  function preencherHoras() {
    var h = $("mlHora"),
      m = $("mlMin");
    if (!h || !m || h.options.length) return;
    var hh = "",
      mm = "",
      i;
    for (i = 0; i < 24; i++)
      hh += '<option value="' + p2(i) + '">' + p2(i) + "</option>";
    for (i = 0; i < 60; i++)
      mm += '<option value="' + p2(i) + '">' + p2(i) + "</option>";
    h.innerHTML = hh;
    m.innerHTML = mm;
  }

  /** A tela Lembretes abre a ficha pelo ?ver= (o mesmo caminho da notificação). */
  function abrirNoLembretes(lemId) {
    window.location.href =
      "lembretes.html" + (lemId ? "?ver=" + encodeURIComponent(lemId) : "");
  }

  function abrirLembrete(id) {
    var f = futuras.find(function (x) {
      return x.id === id;
    });
    if (!f) return;
    if (devolucaoDaFutura(f)) {
      if (window.BapellModal) {
        window.BapellModal.avisar({
          tipo: "info",
          titulo: "Devolução já lançada",
          texto:
            "Esta devolução já chegou e foi lançada: não precisa mais de lembrete.",
        });
      }
      return;
    }
    var existente = lembreteDaFutura(f);
    if (!existente || !window.BapellModal) {
      montarJanelaLembrete(f);
      return;
    }
    window.BapellModal.escolher({
      tipo: "info",
      titulo: "Esta devolução já tem um lembrete",
      html:
        "<strong>" +
        esc(existente.titulo || "Lembrete") +
        "</strong>, para " +
        esc(fmtDataHoraLembrete(existente.dataHora) || "—") +
        (existente.concluido ? " (concluído)" : "") +
        ". Quer abrir esse lembrete ou criar outro?",
      botoes: [
        { rotulo: "Cancelar", valor: null, estilo: "secundario" },
        { rotulo: "Abrir em Lembretes", valor: "abrir", estilo: "secundario" },
        {
          rotulo: "Criar outro",
          valor: "novo",
          estilo: "primario",
          foco: true,
        },
      ],
    }).then(function (r) {
      if (r === "abrir") abrirNoLembretes(existente.id);
      else if (r === "novo") montarJanelaLembrete(f);
    });
  }

  function montarJanelaLembrete(f) {
    lembrando = f.id;
    preencherHoras();
    var loja = lojaPorId(f.lojaId);
    var emp = empresaPorId(f.empresaId);
    var c = calcular({
      valorUnitario: f.valorUnitario,
      quantidade: f.quantidade,
    });
    var linha = function (rotulo, valor) {
      return (
        '<div class="dev-exp-linha"><span>' +
        esc(rotulo) +
        '</span><strong title="' +
        esc(valor) +
        '">' +
        esc(valor) +
        "</strong></div>"
      );
    };
    $("mlResumo").innerHTML =
      linha(
        "Produto",
        f.produtoNome
          ? f.produtoNome + (f.sku ? " — " + f.sku : "")
          : f.sku
            ? "SKU " + f.sku + " (produto a definir)"
            : "A definir",
      ) +
      linha("Loja", loja ? loja.nome : f.lojaNome || "—") +
      linha("Empresa", emp ? emp.nome : f.empresaNome || "—") +
      (f.numeroVenda ? linha("Venda", "nº " + f.numeroVenda) : "") +
      linha(
        "Previsão de chegada",
        f.previsaoChegada ? fmtData(f.previsaoChegada) : "não informada",
      ) +
      (f.valorExtra > 0
        ? linha(
            "Valor extra",
            brl(f.valorExtra) + (f.motivoExtra ? " — " + f.motivoExtra : ""),
          )
        : "") +
      (c.total > 0
        ? '<div class="dev-exp-nota">O valor da devolução (' +
          esc(brl(c.total)) +
          ") vai no campo Valor do lembrete.</div>"
        : "");

    // Data: a previsão de chegada (se ainda não passou); sem ela, amanhã.
    // Hora: 9h — ou a próxima hora cheia, se for hoje e as 9h já passaram.
    var hoje = hojeISO();
    var amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    var data =
      f.previsaoChegada && f.previsaoChegada >= hoje
        ? f.previsaoChegada
        : isoDe(amanha);
    var hora = 9;
    if (data === hoje) {
      hora = Math.max(9, new Date().getHours() + 1);
      if (hora > 23) {
        data = isoDe(amanha);
        hora = 9;
      }
    }
    $("mlData").value = data;
    $("mlHora").value = p2(hora);
    $("mlMin").value = "00";
    $("mlTituloLembrete").value = tituloLembretePadrao(f);
    $("mlObs").value = obsLembretePadrao(f);

    // "Quem colocou": opcional, como na tela Lembretes; vem quem registrou.
    var sel = $("mlCriadoPor");
    var U = window.BapellUsuarios;
    var quem =
      f.responsavelId && U && U.obter(f.responsavelId)
        ? f.responsavelId
        : f.responsavel || "";
    if (U) {
      U.preencherSelect(sel, {
        valor: quem,
        vazio: "Ninguém (opcional)",
        opcional: true,
      });
    } else {
      sel.innerHTML =
        '<option value="">' +
        esc(f.responsavel || "Ninguém (opcional)") +
        "</option>";
      sel.setAttribute("data-legado", f.responsavel || "");
    }
    $("mlConfirmar").disabled = false;
    abrirJanela("modalLembrete", "mlTituloLembrete");
  }

  function confirmarLembrete() {
    if (!lembrando) return;
    var lista = carregarFuturas();
    var idx = lista.findIndex(function (x) {
      return x.id === lembrando;
    });
    if (idx < 0) {
      fecharJanela("modalLembrete");
      lembrando = null;
      futuras = lista;
      render();
      aviso("Esta devolução futura não existe mais.", "warning");
      return;
    }
    var f = lista[idx];
    var titulo = String($("mlTituloLembrete").value || "").trim();
    var data = $("mlData").value;
    var dtWrap = $("mlData").closest(".dtp-wrap");
    var itens = [
      { el: $("mlTituloLembrete"), msg: "Informe o título do lembrete." },
      {
        el: $("mlData"),
        alvo: dtWrap
          ? dtWrap.querySelector(".dtp-field") || $("mlData")
          : $("mlData"),
        vazio: !dataValida(data),
        msg: "Escolha a data do lembrete.",
      },
    ];
    if (window.BapellCampos) {
      if (!window.BapellCampos.exigir(itens)) return;
    } else if (!titulo || !dataValida(data)) {
      aviso(!titulo ? itens[0].msg : itens[1].msg, "warning");
      return;
    }
    // Quem colocou: o usuário escolhido; um nome antigo continua.
    var sel = $("mlCriadoPor");
    var quem = "";
    if (sel.value && sel.value !== "__cadastrar__" && window.BapellUsuarios) {
      var u = window.BapellUsuarios.obter(sel.value);
      if (u) quem = u.nome;
    }
    if (!quem) quem = sel.getAttribute("data-legado") || "";

    var emp = empresaPorId(f.empresaId);
    var c = calcular({
      valorUnitario: f.valorUnitario,
      quantidade: f.quantidade,
    });
    // Os mesmos campos que a tela Lembretes grava (lembretes.js › salvar).
    var lem = Object.assign(
      {
        id: novoIdLembrete(),
        concluido: false,
        oculto: false,
        criadoEm: new Date().toISOString(),
      },
      {
        titulo: titulo,
        recebedor: "",
        valorTipo: "rs",
        valor: c.total > 0 ? textoDoNumero(c.total) : "",
        dataHora: data + "T" + $("mlHora").value + ":" + $("mlMin").value,
        empresaId: emp ? emp.id : "",
        empresaNome: emp ? emp.nome : "",
        criadoPor: quem,
        observacoes: String($("mlObs").value || "").trim(),
        // De qual devolução futura ele veio (a tela Lembretes não usa).
        origemDevolucaoFuturaId: f.id,
      },
    );
    var arr = lerLembretes();
    arr.push(lem);
    $("mlConfirmar").disabled = true;
    if (!gravarLS(LS_LEMBRETES, arr)) {
      $("mlConfirmar").disabled = false;
      return;
    }
    lista[idx] = normalizarFutura(
      Object.assign({}, f, {
        lembreteId: lem.id,
        lembreteEm: lem.dataHora,
        atualizadoEm: Date.now(),
      }),
    );
    if (gravarFuturas(lista)) futuras = lista;
    _destacarFut = f.id;
    fecharJanela("modalLembrete");
    lembrando = null;
    render();
    aviso(
      "Lembrete criado para " +
        fmtDataHoraLembrete(lem.dataHora) +
        ". Ele está na tela Lembretes.",
      "success",
      5200,
    );
  }

  /** Lançou a futura e o lembrete dela ainda está aberto: concluir? */
  function perguntarConcluirLembrete(f) {
    if (!f || !f.lembreteId || !window.BapellModal) return;
    var lem = lembreteDaFutura(f);
    if (!lem || lem.concluido) return;
    window.BapellModal.confirmar({
      tipo: "pergunta",
      titulo: "Concluir o lembrete desta devolução?",
      html:
        "A devolução chegou e foi lançada. O lembrete <strong>" +
        esc(lem.titulo || "Lembrete") +
        "</strong> (" +
        esc(fmtDataHoraLembrete(lem.dataHora) || "sem data") +
        ") ainda está aberto na tela Lembretes.",
      botao: "Concluir o lembrete",
      cancelar: "Deixar aberto",
    }).then(function (sim) {
      if (!sim) return;
      var arr = lerLembretes();
      var l = arr.find(function (x) {
        return x && x.id === lem.id;
      });
      if (!l) return;
      l.concluido = true;
      if (gravarLS(LS_LEMBRETES, arr)) {
        render();
        aviso("Lembrete concluído.", "success");
      }
    });
  }

  // ─────────────────────────────────────────────
  //  EVENTOS
  // ─────────────────────────────────────────────
  function ligarEventos() {
    // Menu lateral
    $("listaEmpresas").addEventListener("click", function (e) {
      var b = e.target.closest("[data-emp-id]");
      if (b) escolherEmpresa(b.dataset.empId);
    });
    $("btnAddEmpresa").addEventListener("click", abrirEmpresas);
    $("mempLista").addEventListener("click", function (e) {
      var b = e.target.closest("[data-usar-emp]");
      if (!b) return;
      fecharJanela("modalEmpresas");
      escolherEmpresa(b.dataset.usarEmp);
    });
    $("mempCadastrar").addEventListener("click", function () {
      window.location.href = "empresa.html";
    });
    var irEmp = $("btnIrEmpresa");
    if (irEmp)
      irEmp.addEventListener("click", function () {
        window.location.href = "empresa.html";
      });

    // Adicionar
    $("btnAddDevolucao").addEventListener("click", function () {
      if (!listarEmpresas().length) {
        pedirCadastroEmpresa();
        return;
      }
      abrirDevolucao(null);
    });

    // ── As três telas (menu lateral) ──
    document.querySelectorAll(".dev-nav-btn[data-vista]").forEach(function (b) {
      b.addEventListener("click", function () {
        mostrarVista(b.dataset.vista);
      });
    });
    // Saindo da tela Registrar com dados não salvos (outra tela, um atalho,
    // Voltar, Ajuda): pergunta antes de descartar.
    var SAIDAS =
      "#sidebar .sidebar-voltar-sep button, #sidebar [data-vista], #sidebar [data-atalho], " +
      "#sidebar .sidebar-footer-index a, .main-header a.brand, #fdIrAcompanhar";
    var _saidaLiberada = false;
    document.addEventListener(
      "click",
      function (e) {
        if (_saidaLiberada || !e.target || !e.target.closest) return;
        var alvo = e.target.closest(SAIDAS);
        if (
          !alvo ||
          alvo.getAttribute("data-vista") === "registrar" ||
          !formFuturaSujo()
        )
          return;
        e.preventDefault();
        e.stopImmediatePropagation();
        podeSairDoRegistro().then(function (ok) {
          if (!ok) return;
          if (form && form.modo === "futura")
            form.assinatura = assinaturaForm(); // descartado: pode sair
          _saidaLiberada = true;
          try {
            alvo.click();
          } finally {
            _saidaLiberada = false;
          }
        });
      },
      true,
    );

    // ── Registrar futuras devoluções ──
    $("fdIrAcompanhar").addEventListener("click", function () {
      mostrarVista("acompanhar");
    });
    $("fdSalvar").addEventListener("click", salvarFutura);
    $("fdCancelar").addEventListener("click", cancelarFutura);
    // Enter num campo de texto registra (pelo próprio botão, que pode pedir senha).
    $("vistaRegistrar").addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.repeat) return;
      var t = e.target;
      if (
        !t ||
        t.id === "mdSku" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "BUTTON" ||
        t.tagName === "SELECT"
      )
        return;
      if (t.tagName !== "INPUT" || t.type === "checkbox") return;
      e.preventDefault();
      try {
        t.blur();
      } catch (er) {} // formata o valor (máscara) antes de ler
      var b = $("fdSalvar");
      if (b && !b.disabled) b.click();
    });
    // Produto (SKU) ou nº da venda: preencher um tira o vermelho dos dois.
    ["mdSku", "mdVenda", "mdErp"].forEach(function (id) {
      $(id).addEventListener("input", function () {
        if (
          !form ||
          form.modo !== "futura" ||
          !window.BapellCampos ||
          !identResolvido()
        )
          return;
        window.BapellCampos.limpar($("mdSku"));
        window.BapellCampos.limpar($("mdVenda"));
      });
    });

    // ── Acompanhar devoluções ──
    $("dfNova").addEventListener("click", function () {
      mostrarVista("registrar", { futura: null });
    });
    var dfTimer = null;
    $("dfBusca").addEventListener("input", function () {
      clearTimeout(dfTimer);
      dfTimer = setTimeout(renderFuturas, 180);
    });
    $("dfSituacao").addEventListener("change", renderFuturas);
    $("dfCorpo").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (b && b.dataset.lancar) {
        lancarFutura(b.dataset.lancar);
        return;
      }
      if (b && b.dataset.verDev) {
        verDevolucaoDaFutura(b.dataset.verDev);
        return;
      }
      if (b && b.dataset.lembrete) {
        abrirLembrete(b.dataset.lembrete);
        return;
      }
      if (b && b.dataset.verLembrete) {
        abrirNoLembretes(b.dataset.verLembrete);
        return;
      }
      if (b && b.dataset.editarFut) {
        editarFutura(b.dataset.editarFut);
        return;
      }
      if (b && b.dataset.excluirFut) {
        excluirFutura(b.dataset.excluirFut);
        return;
      }
      if (b) return;
      // Clique na linha: aguardando → Editar; lançada → ver a devolução
      // (pelo botão da linha: se ele pedir senha, pede).
      var tr = e.target.closest("tr[data-fut-id]");
      var f = tr
        ? futuras.find(function (x) {
            return x.id === tr.dataset.futId;
          })
        : null;
      if (!f) return;
      var be =
        f.status === "lancada"
          ? tr.querySelector("[data-ver-dev]")
          : tr.querySelector("[data-editar-fut]");
      if (be) be.click();
    });
    $("mlConfirmar").addEventListener("click", confirmarLembrete);

    // Filtros: qualquer mudança refaz painel e lista (todos combinados).
    var aoFiltrar = function () {
      limite = PASSO;
      render();
    };
    var buscaTimer = null;
    $("fBusca").addEventListener("input", function () {
      clearTimeout(buscaTimer);
      buscaTimer = setTimeout(aoFiltrar, 180);
    });
    [
      "fLoja",
      "fEstado",
      "fReembolso",
      "fImposto",
      "fReputacao",
      "fFinanceiro",
      "fDe",
      "fAte",
    ].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("change", aoFiltrar);
    });
    $("fEmpresa").addEventListener("change", function () {
      escolherEmpresa($("fEmpresa").value);
    });
    $("btnLimparFiltros").addEventListener("click", limparFiltros);

    // Lista
    document
      .querySelectorAll(".dev-tabela th.dev-ordenavel")
      .forEach(function (th) {
        th.addEventListener("click", function () {
          var campo = th.dataset.ordem;
          if (ordem.campo === campo)
            ordem.dir = ordem.dir === "asc" ? "desc" : "asc";
          else ordem = { campo: campo, dir: "desc" };
          render();
        });
      });
    $("devCorpo").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (b && b.dataset.fin) {
        acaoFinanceiro(b.dataset.fin);
        return;
      }
      if (b && b.dataset.editar) {
        abrir(b.dataset.editar);
        return;
      }
      if (b && b.dataset.excluir) {
        excluirDevolucao(b.dataset.excluir);
        return;
      }
      if (b) return;
      // Clique na linha = o botão Editar dela (se ele pedir senha, pede).
      var tr = e.target.closest("tr[data-id]");
      var be = tr && tr.querySelector("[data-editar]");
      if (be) be.click();
      else if (tr) abrir(tr.dataset.id);
    });
    function abrir(id) {
      var d = devolucoes.find(function (x) {
        return x.id === id;
      });
      if (d) abrirDevolucao(d);
    }
    $("btnMostrarMais").addEventListener("click", function () {
      limite += PASSO;
      render();
    });
    $("btnExportarLote").addEventListener("click", exportarLote);

    // ── Janela da devolução ──
    $("mdEmpresa").addEventListener("change", function () {
      atualizarLogoEmpresa();
      atualizarEstadoLoja();
      atualizarForm();
    });
    $("mdLoja").addEventListener("change", function () {
      atualizarLogoLoja();
      // Trocou de loja: o produto escolhido era da loja anterior.
      var o = form.opcao;
      if (o || form.orfao) {
        limparProduto();
        $("mdSku").value = "";
        $("mdValor").value = "";
        form.valorManual = false;
      }
      _cacheOpcoes = {};
      atualizarEstadoLoja();
      atualizarForm();
      if ($("mdLoja").value) {
        try {
          $("mdSku").focus();
        } catch (e) {}
      }
    });

    var skuTimer = null;
    $("mdSku").addEventListener("input", function () {
      // Mexeu na SKU depois de escolher: a escolha anterior deixa de valer.
      if (form.opcao && normSku($("mdSku").value) !== normSku(form.opcao.sku)) {
        limparProduto();
        atualizarForm();
      } else if (
        form.orfao &&
        normSku($("mdSku").value) !== normSku(form.orfao.sku)
      ) {
        limparProduto();
        atualizarForm();
      }
      clearTimeout(skuTimer);
      skuTimer = setTimeout(renderSugestoes, 120);
    });
    $("mdSku").addEventListener("focus", function () {
      if (String($("mdSku").value).trim() && !form.opcao) renderSugestoes();
    });
    $("mdSku").addEventListener("keydown", function (e) {
      var aberta = !$("mdSugestoes").hidden;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!aberta) renderSugestoes();
        else moverSugestao(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (aberta) moverSugestao(-1);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (aberta && form.sugAtiva >= 0 && form.sugestoes[form.sugAtiva])
          escolherOpcao(form.sugestoes[form.sugAtiva]);
        else if (aberta && form.sugestoes.length === 1)
          escolherOpcao(form.sugestoes[0]);
        return;
      }
      if (e.key === "Escape" && aberta) {
        e.preventDefault();
        e.stopPropagation();
        fecharSugestoes();
      }
    });
    $("mdSku").addEventListener("blur", function () {
      setTimeout(function () {
        var ativo = document.activeElement;
        if (!ativo || !ativo.closest || !ativo.closest("#mdSugestoes"))
          fecharSugestoes();
      }, 150);
    });
    // mousedown: escolhe antes de o campo perder o foco e a lista fechar.
    $("mdSugestoes").addEventListener("mousedown", function (e) {
      var b = e.target.closest("[data-sug]");
      if (!b) return;
      e.preventDefault();
      var o = form.sugestoes[Number(b.dataset.sug)];
      if (o) escolherOpcao(o);
    });

    $("mdProduto").addEventListener("click", function (e) {
      var an = e.target.closest("[data-anuncio]");
      if (an) {
        form.anuncio = an.dataset.anuncio;
        var preco = precoEscolhido();
        if (preco > 0) $("mdValor").value = textoDoNumero(preco);
        form.valorManual = false;
        renderProdutoEscolhido();
        atualizarForm();
        return;
      }
      if (e.target.closest("#mdTrocarProduto")) {
        limparProduto();
        $("mdSku").value = "";
        atualizarForm();
        try {
          $("mdSku").focus();
        } catch (er) {}
      }
    });

    $("mdValor").addEventListener("input", function () {
      form.valorManual = true;
      atualizarForm();
    });
    $("mdValorReemb").addEventListener("input", atualizarForm);
    // Valor extra e motivo: entram na conta ao vivo (o motivo vai embaixo do valor extra).
    ["mdExtra", "mdExtraMotivo"].forEach(function (id) {
      $(id).addEventListener("input", function () {
        revisarErrosExtra();
        atualizarForm();
      });
    });
    $("mdQtd").addEventListener("input", atualizarForm);
    $("mdQtd").addEventListener("blur", function () {
      var n = parseInt($("mdQtd").value, 10);
      if (n >= 1) $("mdQtd").value = String(n);
    });

    // As perguntas (linha 4) são listas de opções: Sim / Não.
    var ligarSimNao = function (grupoId, campo) {
      $(grupoId).addEventListener("change", function () {
        if (!form) return;
        var v = $(grupoId).value;
        form[campo] = v === "sim" ? true : v === "nao" ? false : null;
        // "Plataforma reembolsou?" também tem "Aguardando".
        if (campo === "reembolsou" && v === "aguardando")
          form.reembolsou = "aguardando";
        if (
          campo === "gerouImposto" &&
          form.gerouImposto &&
          form.aliquotaEmpresaDe !== $("mdEmpresa").value
        ) {
          form.aliquota = null; // vale a da empresa escolhida
        }
        marcarEscolha(grupoId, v);
        if (campo === "reembolsou") {
          mostrarValorReemb();
          // Sim: o foco vai para o valor reembolsado, se ainda estiver vazio.
          if (
            form.reembolsou === true &&
            !String($("mdValorReemb").value || "").trim()
          ) {
            try {
              $("mdValorReemb").focus();
            } catch (er) {}
          }
        }
        atualizarForm();
      });
    };
    ligarSimNao("mdImposto", "gerouImposto");
    ligarSimNao("mdReputacao", "reputacao");
    ligarSimNao("mdReembolso", "reembolsou");
    $("mdEstado").addEventListener("change", function () {
      if (!form) return;
      form.estado = ESTADOS[$("mdEstado").value] ? $("mdEstado").value : "";
      marcarEscolha("mdEstado", form.estado);
    });
    $("mdImpostoInfo").addEventListener("click", function (e) {
      if (!e.target.closest("#mdUsarAliquota")) return;
      var emp = empresaPorId($("mdEmpresa").value);
      if (emp && emp.imposto !== null) {
        form.aliquota = emp.imposto;
        form.aliquotaEmpresaDe = emp.id;
        atualizarForm();
      }
    });

    $("mdSalvar").addEventListener("click", salvarDevolucao);

    // ── Janela de exportar ──
    $("meDataLote").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-valor]");
      if (b) marcarEscolha("meDataLote", b.dataset.valor);
    });
    $("meConfirmar").addEventListener("click", confirmarExportar);

    // Fechar janelas: X, Cancelar, clique no fundo e Esc.
    [
      "modalDevolucao",
      "modalExportar",
      "modalEmpresas",
      "modalLembrete",
    ].forEach(function (id) {
      var ov = $(id);
      ov.addEventListener("click", function (e) {
        if (e.target.closest("[data-fechar]")) {
          fechar(id);
          return;
        }
      });
      ov.addEventListener("mousedown", function (e) {
        // Clique no fundo fecha só as janelas pequenas: na da devolução,
        // um clique fora do lugar descartaria o que foi preenchido.
        if (e.target === ov && id !== "modalDevolucao") fechar(id);
      });
    });
    function fechar(id) {
      if (id === "modalExportar") exportando = null;
      if (id === "modalLembrete") lembrando = null;
      if (id === "modalDevolucao") {
        fecharSugestoes();
        form = null;
      }
      fecharJanela(id);
    }
    // Uma janela do app por cima (confirmação, senha, cadastro de usuário)?
    // Só conta a que está à vista: algumas ficam no DOM depois de fechadas.
    function camadaPorCima() {
      var els = document.querySelectorAll(
        ".bm-overlay, .bsn-camada, .usr-modal-fundo, .bsn-portao",
      );
      for (var i = 0; i < els.length; i++) {
        if (els[i].hidden) continue;
        try {
          if (
            els[i].getClientRects().length &&
            getComputedStyle(els[i]).display !== "none"
          )
            return true;
        } catch (er) {
          return true;
        }
      }
      return false;
    }
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      // Uma janela de confirmação do app por cima: ela responde primeiro.
      if (camadaPorCima()) return;
      if (document.querySelector(".dtp-pop.aberto")) return;
      var abertas = [
        "modalLembrete",
        "modalExportar",
        "modalEmpresas",
        "modalDevolucao",
      ].filter(janelaAberta);
      if (!abertas.length) return;
      e.preventDefault();
      fechar(abertas[0]);
    });
    // Enter num campo de texto da janela salva (o da SKU escolhe a sugestão).
    // Pelo próprio botão: se ele pedir usuário e senha (Usuários e Senhas ›
    // Senha nos botões), o Enter também pede.
    $("modalDevolucao").addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.repeat) return;
      var t = e.target;
      if (
        !t ||
        t.id === "mdSku" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "BUTTON" ||
        t.tagName === "SELECT"
      )
        return;
      if (t.tagName !== "INPUT" || t.type === "checkbox") return;
      e.preventDefault();
      try {
        t.blur();
      } catch (er) {} // formata o valor (máscara) antes de ler
      var b = $("mdSalvar");
      if (b && !b.disabled) b.click();
    });

    // Outra aba mudou alguma coisa (no navegador; no app, ao reabrir a tela).
    window.addEventListener("storage", function (e) {
      if (!e.key) return;
      if (e.key === LS) {
        devolucoes = carregar();
        preencherFiltrosOpcoes();
        render();
      } else if (e.key === LS_FUT || e.key === LS_LEMBRETES) {
        futuras = carregarFuturas();
        renderNav();
        renderFuturas();
      } else if (
        e.key === LS_EMPRESA ||
        e.key === LS_DRE ||
        e.key === LS_OCULTAS ||
        e.key === LS_EXCLUIDAS ||
        e.key === "precifiq_custom_platforms"
      ) {
        _cacheOpcoes = {};
        preencherFiltrosOpcoes();
        render();
      }
    });
    // Produtos salvos em outra aba (o sino do utils.js).
    window.onProdutosAtualizados = function () {
      _cacheOpcoes = {};
      if (!janelaAberta("modalDevolucao")) render();
    };
  }

  // ─────────────────────────────────────────────
  //  INÍCIO
  // ─────────────────────────────────────────────
  function aplicarEstadoSidebar() {
    var colapsado = false;
    try {
      colapsado = localStorage.getItem("precifiq_sidebar_colapsada") === "1";
    } catch (e) {}
    var sb = $("sidebar");
    if (sb) sb.classList.toggle("sidebar-colapsada", colapsado);
    document.body.classList.toggle("sidebar-colapsada-body", colapsado);
  }

  function iniciar() {
    if (typeof setDateHeader === "function") setDateHeader();
    aplicarEstadoSidebar();
    devolucoes = carregar();
    futuras = carregarFuturas();
    var pref = lerPref();
    empresaAtiva =
      pref.empresa && empresaPorId(pref.empresa) ? pref.empresa : "";
    if (typeof ativarMascarasNumericas === "function")
      ativarMascarasNumericas($("modalDevolucao"));
    preencherFiltrosOpcoes();
    ligarEventos();
    render();

    // Os produtos (fotos da lista e busca por SKU) vivem no IndexedDB:
    // desenha de novo quando o cache deles estiver carregado.
    if (typeof initStorage === "function") {
      initStorage().then(
        function () {
          _storagePronto = true;
          _cacheOpcoes = {};
          if (
            form &&
            (janelaAberta("modalDevolucao") ||
              (vista === "registrar" && form.modo === "futura"))
          ) {
            var limpo = form.modo === "futura" && !formFuturaSujo();
            if (!form.opcao && form.orfao && form.original) {
              var op = opcaoPorIds(
                form.original.lojaId,
                form.original.produtoId,
                form.original.kitId,
              );
              if (op && $("mdLoja").value === form.original.lojaId) {
                form.opcao = op;
                form.orfao = null;
                renderProdutoEscolhido();
              }
            }
            // Uma devolução futura aberta antes de os produtos carregarem.
            var fx =
              !form.opcao && form.futuraId
                ? futuras.find(function (x) {
                    return x.id === form.futuraId;
                  })
                : null;
            if (
              fx &&
              fx.produtoId !== null &&
              $("mdLoja").value === fx.lojaId
            ) {
              var opf = opcaoPorIds(fx.lojaId, fx.produtoId, fx.kitId);
              if (opf) {
                form.opcao = opf;
                form.orfao = null;
                renderProdutoEscolhido();
              }
            }
            atualizarEstadoLoja();
            // O produto achado agora não é uma alteração da pessoa.
            if (limpo) form.assinatura = assinaturaForm();
          }
          render();
        },
        function (e) {
          registrarErro("initStorage", e);
        },
      );
    }
  }

  // API mínima para o tutorial e para testes (só leitura).
  window.BapellDevolucoes = {
    versao: 1,
    chave: LS,
    chaveFuturas: LS_FUT,
    categoriaFinanceiro: CATEGORIA_FIN,
    calcular: calcular,
    listar: function () {
      return carregar();
    },
    listarFuturas: function () {
      return carregarFuturas();
    },
    vista: function () {
      return vista;
    },
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();

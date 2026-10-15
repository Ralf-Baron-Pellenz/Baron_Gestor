// ═══════════════════════════════════════════════════════════════════
//  Bapell Gestor Pro — exportar-produtos.js
//  "Exportar para Planilha" (lista de produtos de cada plataforma):
//  preenche a planilha de qualquer sistema com os produtos do Bapell.
//
//  ── O CAMINHO ──────────────────────────────────────────────────────
//    1. Modelo ....... Bling, Mercado Livre, outra planilha ou uma
//                      configuração salva
//    2. Planilha ..... a planilha que vai ser preenchida (.xlsx, .xlsm,
//                      .xls ou .csv)
//    3. Campos ....... onde vai cada campo do Bapell: reconhecido pelos
//                      títulos da planilha (ou pelo modelo) e ajustável;
//                      "Adicionar Campo" põe qualquer outro campo, com a
//                      célula inicial e a final
//    4. Conferência .. os produtos, o que fazer com as linhas que já
//                      existem e o arquivo final
//
//  ── O ARQUIVO GERADO ───────────────────────────────────────────────
//    É a MESMA planilha anexada, com os produtos escritos nas células
//    escolhidas. No .xlsx/.xlsm só as células escritas mudam (direto no
//    XML do arquivo): formatação, listas de opções, outras abas e macros
//    ficam como estavam. O .csv mantém o separador, as aspas e a
//    codificação (UTF-8 ou Latin-1). O .xls é regravado pela biblioteca
//    de planilhas e pode perder formatação (é avisado).
//
//  ── NADA É PREENCHIDO EM SILÊNCIO ──────────────────────────────────
//    O que o reconhecimento não tem certeza (título parecido, unidade do
//    peso desconhecida, coluna do modelo com outro título) entra
//    DESMARCADO e só é usado se a pessoa marcar. Antes de gerar, a
//    conferência mostra o destino de cada produto.
// ═══════════════════════════════════════════════════════════════════

(function () {
  "use strict";

  var IMP = window.BapellImportarProdutos;
  var $ = function (id) { return document.getElementById(id); };

  // As funções de planilha do importar-produtos.js (as mesmas regras).
  if (!IMP || !IMP.util) {
    console.error("[Exportar para Planilha] importar-produtos.js não carregado.");
    return;
  }
  var U = IMP.util;
  var esc = U.esc, normTxt = U.normTxt, normSku = U.normSku, arred = U.arred, fmtNum = U.fmtNum,
    fmtBRL = U.fmtBRL, plural = U.plural, indiceDaColuna = U.indiceDaColuna, colunaDoIndice = U.colunaDoIndice,
    celula = U.celula, textoDe = U.textoDe, numeroDe = U.numeroDe, carregarXlsx = U.carregarXlsx, svg = U.svg;
  var I = U.icones;
  var I_MAIS = '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>';
  var I_LIXO = '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>';
  var I_EXPORTAR = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>';

  var CONFIG_KEY = "precifiq_export_planilhas";
  var MAX_LINHA = 1048576;
  var MAX_COL = 16384;
  var PASSO_LISTA = 100;
  var PASSOS = ["Modelo", "Planilha", "Campos", "Conferência"];

  function aviso(msg, tipo, ms) {
    if (typeof showToast === "function") showToast(msg, tipo || "default", ms || 3800);
  }
  function registrarErro(contexto, e) {
    try {
      if (typeof PrecifiqErros !== "undefined" && PrecifiqErros && typeof PrecifiqErros.registrar === "function") {
        PrecifiqErros.registrar("Exportar para Planilha: " + contexto, e && e.stack ? e.stack : String(e));
        return;
      }
    } catch (_) {}
    console.error("[Exportar para Planilha]", contexto, e);
  }
  function dataLocal() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  // ─────────────────────────────────────────────
  //  CÉLULAS
  // ─────────────────────────────────────────────
  /** "c2", "$C$2" → { col: "C", ci: 2, linha: 2, ref: "C2" }. Inválida → null. */
  function lerCelula(txt) {
    var s = String(txt == null ? "" : txt).toUpperCase().replace(/[\s$]/g, "");
    var m = s.match(/^([A-Z]{1,3})(\d{1,7})$/);
    if (!m) return null;
    var ci = indiceDaColuna(m[1]);
    var linha = parseInt(m[2], 10);
    if (ci < 0 || ci >= MAX_COL || linha < 1 || linha > MAX_LINHA) return null;
    return { col: m[1], ci: ci, linha: linha, ref: m[1] + linha };
  }
  function refDe(ci, linha) { return colunaDoIndice(ci) + linha; }

  /** Última linha e coluna que têm célula de verdade (não confia só no !ref). */
  var _extensoes = new WeakMap();
  function extensao(sheet) {
    if (!sheet) return { ultimaLinha: 0, ultimaColuna: -1 };
    var guardada = _extensoes.get(sheet);
    if (guardada) return guardada;
    var r = extensaoCalculada(sheet);
    _extensoes.set(sheet, r);
    return r;
  }
  function extensaoCalculada(sheet) {
    var ul = 0, uc = -1;
    Object.keys(sheet).forEach(function (k) {
      if (k.charAt(0) === "!") return;
      var c = lerCelula(k);
      if (!c) return;
      var cel = sheet[k];
      if (!cel || (cel.v == null && cel.f == null && (cel.w == null || cel.w === ""))) return;
      if (c.linha > ul) ul = c.linha;
      if (c.ci > uc) uc = c.ci;
    });
    return { ultimaLinha: ul, ultimaColuna: uc };
  }
  function temValor(sheet, ref) {
    var c = sheet ? sheet[ref] : null;
    if (!c) return false;
    if (c.f != null) return true;
    return textoDe(c).trim() !== "";
  }

  // ─────────────────────────────────────────────
  //  CAMPOS DO BAPELL QUE PODEM IR PARA A PLANILHA
  // ─────────────────────────────────────────────
  // tipo: texto | codigo | dinheiro | pct | numero | peso | medida
  // termos/evitar: como o título da coluna costuma aparecer (sem acento),
  // para o reconhecimento automático. Campo sem termos só entra pelo
  // "Adicionar Campo".
  var S_ID = "Identificação do Produto";
  var S_DIM = "Dimensões (Unidade)";
  var S_CUSTO = "Formação do Custo Total";
  var S_VENDA = "Variáveis de Venda & Plataforma";
  var S_MARGEM = "Margem de Lucro";
  var S_FINAL = "Valor Final de Venda — Unidade";
  var S_EXTRAS = "Preços Extras";

  // Os campos que a pessoa pode renomear em "Configurar Campos" (campos.js):
  // id do campo na ficha → id aqui.
  var RENOMEAVEIS = {
    productName: "nome", productSku: "sku", productId: "prodId",
    custoCusto: "custo", custoEmbalagem: "embalagem", custoEtiqueta: "etiqueta", custoFrete: "frete",
    custoIpi: "ipi", custoDifal: "difal", custoSt: "st", custoAliquota: "aliquota",
    freteProduto: "freteProduto", taxaFixa: "taxaFixa", taxaPlataforma: "taxa", impostoNF: "impostoNF",
  };

  function num(v) { var n = Number(v); return isFinite(n) ? n : null; }
  function calc(ctx) { return ctx.calc || {}; }

  function camposFixos(ehML) {
    var lista = [
      { id: "nome", rotulo: "Nome do Produto", secao: S_ID, tipo: "texto",
        termos: ["nome do produto", "nome", "descricao do produto", "descricao", "titulo do anuncio", "titulo", "produto"],
        evitar: ["complementar", "curta", "fornecedor", "categoria", "variacao", "marca", "modelo", "imagem", "url", "link", "embalagem", "status", "loja", "cliente"],
        valor: function (p) { return p.name; } },
      { id: "sku", rotulo: "SKU Principal", secao: S_ID, tipo: "texto",
        termos: ["sku", "codigo sku", "codigo do produto", "codigo", "cod", "referencia", "ref"],
        evitar: ["pai", "fornecedor", "universal", "barras", "gtin", "ean", "ncm", "cest", "anuncio", "servico", "integracao", "variacao", "categoria", "marca", "cliente", "lista"],
        valor: function (p) { return p.sku; } },
      { id: "prodId", rotulo: "ID do Produto (EAN/GTIN)", secao: S_ID, tipo: "codigo",
        termos: ["gtin ean", "gtin", "ean", "codigo de barras", "codigo universal de produto", "codigo universal", "id do produto"],
        evitar: ["embalagem", "tributavel", "caixa"],
        valor: function (p) { return p.prodId; } },
      { id: "peso", rotulo: "Peso (g)", secao: S_DIM, tipo: "peso",
        termos: ["peso bruto", "peso", "peso liquido"], evitar: ["embalagem", "caixa", "volume"],
        valor: function (p) { return num(p.peso); } },
      { id: "altura", rotulo: "Altura (cm)", secao: S_DIM, tipo: "medida",
        termos: ["altura"], evitar: ["embalagem", "caixa", "volume"], valor: function (p) { return num(p.altura); } },
      { id: "largura", rotulo: "Largura (cm)", secao: S_DIM, tipo: "medida",
        termos: ["largura"], evitar: ["embalagem", "caixa", "volume"], valor: function (p) { return num(p.largura); } },
      { id: "comprimento", rotulo: "Comprimento (cm)", secao: S_DIM, tipo: "medida",
        termos: ["comprimento", "profundidade"], evitar: ["embalagem", "caixa", "volume"], valor: function (p) { return num(p.comprimento); } },

      { id: "custo", rotulo: "Preço de Custo", secao: S_CUSTO, tipo: "dinheiro",
        termos: ["preco de custo", "valor de custo", "custo unitario", "custo", "valor de compra", "preco de compra", "custo de compra"], evitar: ["frete", "envio", "total", "medio"],
        valor: function (p) { return num(p.custo); } },
      { id: "embalagem", rotulo: "Embalagem", secao: S_CUSTO, tipo: "dinheiro",
        termos: ["custo de embalagem", "custo da embalagem", "embalagem"],
        evitar: ["gtin", "ean", "codigo", "peso", "largura", "altura", "comprimento", "profundidade", "unidade", "tipo", "quantidade", "itens"],
        valor: function (p) { return num(p.embalagem); } },
      { id: "etiqueta", rotulo: "Etiqueta", secao: S_CUSTO, tipo: "dinheiro",
        termos: ["custo de etiqueta", "etiqueta"], evitar: ["codigo", "tipo"], valor: function (p) { return num(p.etiqueta); } },
      { id: "frete", rotulo: "Frete Pago", secao: S_CUSTO, tipo: "dinheiro",
        termos: ["frete pago", "frete de compra", "frete"], evitar: ["gratis", "produto", "venda", "tipo", "modalidade", "classe"],
        valor: function (p) { return num(p.frete); } },
      { id: "ipi", rotulo: "IPI (%)", secao: S_CUSTO, tipo: "pct",
        termos: ["ipi", "aliquota de ipi", "aliquota ipi"], evitar: ["valor", "fixo", "classe", "enquadramento", "codigo"],
        valor: function (p) { return num(p.ipi); } },
      { id: "difal", rotulo: "DIFAL (%)", secao: S_CUSTO, tipo: "pct", termos: ["difal"], evitar: ["valor"], valor: function (p) { return num(p.difal); } },
      { id: "st", rotulo: "ST (%)", secao: S_CUSTO, tipo: "pct", termos: ["icms st", "st", "substituicao tributaria"], evitar: ["valor", "base"],
        valor: function (p) { return num(p.st); } },
      { id: "aliquota", rotulo: "Alíquota (%)", secao: S_CUSTO, tipo: "pct", termos: ["aliquota", "aliquota icms"], evitar: ["ipi", "st", "valor"],
        valor: function (p) { return num(p.aliquota); } },
      { id: "custoTotal", rotulo: "Custo Total da Unidade", secao: S_CUSTO, tipo: "dinheiro", calculado: true,
        termos: ["custo total da unidade", "custo total"], evitar: ["frete"],
        valor: function (p, ctx) { return num(calc(ctx).custoTotalDisplay); } },

      { id: "freteProduto", rotulo: "Frete do Produto", secao: S_VENDA, tipo: "dinheiro",
        termos: ["frete do produto", "frete de venda", "custo de envio"], evitar: ["gratis", "tipo", "modalidade"],
        valor: function (p) { return num(p.freteProduto); } },
      { id: "taxaFixa", rotulo: "Taxa Fixa da Plataforma", secao: S_VENDA, tipo: "dinheiro",
        termos: ["taxa fixa da plataforma", "taxa fixa"], evitar: [], valor: function (p) { return num(p.taxaFixa); } },
      { id: "taxa", rotulo: "Taxa da Plataforma (%)", secao: S_VENDA, tipo: "pct",
        termos: ["taxa da plataforma", "taxa de venda", "comissao", "taxa"], evitar: ["fixa", "frete", "juros"],
        valor: function (p) { return num(p.taxa); } },
      { id: "impostoNF", rotulo: "Imposto NF (%)", secao: S_VENDA, tipo: "pct",
        termos: ["imposto nf", "imposto da nota", "imposto"], evitar: ["ipi", "st", "difal", "valor", "renda"],
        valor: function (p) { return num(p.impostoNF); } },

      { id: "margemPct", rotulo: "Margem Desejada (%)", secao: S_MARGEM, tipo: "pct",
        termos: ["margem desejada", "margem"], evitar: ["real", "contribuicao", "valor"],
        valor: function (p) { return (p.margemTipo || "pct") === "rs" ? null : num(p.margem); } },
      { id: "margemRS", rotulo: "Margem Desejada (R$)", secao: S_MARGEM, tipo: "dinheiro",
        termos: [], evitar: [], valor: function (p) { return (p.margemTipo || "pct") === "rs" ? num(p.margem) : null; } },
      { id: "lucro", rotulo: "Lucro por Unidade", secao: S_MARGEM, tipo: "dinheiro", calculado: true,
        termos: ["lucro"], evitar: ["margem"], valor: function (p, ctx) { return num(calc(ctx).lucro); } },
      { id: "margemReal", rotulo: "Margem Real (%)", secao: S_MARGEM, tipo: "pct", calculado: true,
        termos: ["margem real"], evitar: [], valor: function (p, ctx) { return num(calc(ctx).margemReal); } },

      { id: "precoVenda", rotulo: ehML ? "Preço de Venda (o da ficha)" : "Preço de Venda", secao: S_FINAL, tipo: "dinheiro",
        termos: ["preco de venda", "valor de venda", "preco venda", "preco unitario", "valor unitario", "preco"],
        evitar: ["custo", "promoc", "minimo", "maximo", "ideal", "frete", "atacado", "antigo", "compra", "ipi", "icms", "imposto", "desconto", "sugerido", "de lista"],
        valor: function (p) { return num(p.finalPrice); } },
    ];
    if (ehML) {
      lista.push(
        { id: "precoPremium", rotulo: "Preço de Venda — Premium", secao: S_FINAL, tipo: "dinheiro", calculado: true,
          termos: ["preco premium", "premium"], evitar: [], valor: function (p, ctx) { return ctx.prem; } },
        { id: "precoClassico", rotulo: "Preço de Venda — Clássico", secao: S_FINAL, tipo: "dinheiro", calculado: true,
          termos: ["preco classico", "classico"], evitar: [], valor: function (p, ctx) { return ctx.clas; } }
      );
    }
    var sufixo = ehML ? " (Premium)" : "";
    lista.push(
      { id: "precoMinimo", rotulo: "Preço Mínimo" + sufixo, secao: S_EXTRAS, tipo: "dinheiro", termos: ["preco minimo"], evitar: [],
        valor: function (p) { return num(p.precoMinimo); } },
      { id: "precoIdeal", rotulo: "Preço Ideal" + sufixo, secao: S_EXTRAS, tipo: "dinheiro", termos: ["preco ideal"], evitar: [],
        valor: function (p) { return num(p.precoIdeal); } },
      { id: "precoMaximo", rotulo: "Preço Máximo" + sufixo, secao: S_EXTRAS, tipo: "dinheiro", termos: ["preco maximo"], evitar: [],
        valor: function (p) { return num(p.precoMaximo); } }
    );
    if (ehML) {
      lista.push(
        { id: "precoMinimoClassico", rotulo: "Preço Mínimo (Clássico)", secao: S_EXTRAS, tipo: "dinheiro", termos: [], evitar: [],
          valor: function (p) { return num(p.precoMinimoClassico); } },
        { id: "precoIdealClassico", rotulo: "Preço Ideal (Clássico)", secao: S_EXTRAS, tipo: "dinheiro", termos: [], evitar: [],
          valor: function (p) { return num(p.precoIdealClassico); } },
        { id: "precoMaximoClassico", rotulo: "Preço Máximo (Clássico)", secao: S_EXTRAS, tipo: "dinheiro", termos: [], evitar: [],
          valor: function (p) { return num(p.precoMaximoClassico); } }
      );
    }
    return lista;
  }

  /** Os campos personalizados que os produtos desta plataforma têm. */
  function camposPersonalizados(produtos) {
    var out = [];
    var vistos = Object.create(null);
    function add(id, def) { if (vistos[id]) return; vistos[id] = true; def.id = id; def.personalizado = true; def.termos = def.termos || []; def.evitar = []; out.push(def); }
    (produtos || []).forEach(function (p) {
      (Array.isArray(p.camposIdentificacao) ? p.camposIdentificacao : []).forEach(function (c) {
        var k = normTxt(c && c.nome);
        if (!k) return;
        add("cid:" + k, { rotulo: String(c.nome).trim(), secao: S_ID, tipo: "texto", termos: [k],
          valor: function (pp) {
            var x = (pp.camposIdentificacao || []).find(function (y) { return y && normTxt(y.nome) === k; });
            return x ? x.texto : null;
          } });
      });
      (Array.isArray(p.camposPersonalizados) ? p.camposPersonalizados : []).forEach(function (c) {
        var k = normTxt(c && c.nome);
        if (!k) return;
        var cat = (c.categoria || "venda") === "custo" ? "custo" : "venda";
        add((cat === "custo" ? "cpc:" : "cpv:") + k, {
          rotulo: String(c.nome).trim() + (c.tipo === "PCT" ? " (%)" : " (R$)"),
          secao: cat === "custo" ? S_CUSTO : S_VENDA, tipo: c.tipo === "PCT" ? "pct" : "dinheiro", termos: [k],
          valor: function (pp) {
            var x = (pp.camposPersonalizados || []).find(function (y) { return y && (y.categoria || "venda") === cat && normTxt(y.nome) === k; });
            return x ? num(x.valor) : null;
          } });
      });
      (Array.isArray(p.secoesCustom) ? p.secoesCustom : []).forEach(function (s) {
        var ts = normTxt(s && s.titulo);
        (Array.isArray(s && s.campos) ? s.campos : []).forEach(function (c) {
          var kr = normTxt(c && c.rotulo);
          if (!kr) return;
          var numerico = c.tipo === "money" || c.tipo === "percent" || c.tipo === "number";
          add("sec:" + ts + "|" + kr, {
            rotulo: String(c.rotulo).trim(), secao: String(s.titulo || "Seção personalizada").trim(),
            tipo: c.tipo === "money" ? "dinheiro" : c.tipo === "percent" ? "pct" : c.tipo === "number" ? "numero" : "texto",
            termos: [kr],
            valor: function (pp) {
              var sec = (pp.secoesCustom || []).find(function (y) { return y && normTxt(y.titulo) === ts; });
              var x = sec && (sec.campos || []).find(function (y) { return y && normTxt(y.rotulo) === kr; });
              if (!x) return null;
              if (!numerico) return x.valor;
              var n = numeroDe({ t: "s", v: String(x.valor == null ? "" : x.valor) });
              return n == null || isNaN(n) ? null : n;
            } });
        });
      });
    });
    return out;
  }

  /** Rótulos renomeados em "Configurar Campos" desta plataforma. */
  function rotulosDaPlataforma(pid) {
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem("precifiq_field_cfg_" + pid)) || {}; } catch (e) { cfg = {}; }
    var out = {};
    if (!cfg || typeof cfg !== "object") return out;
    Object.keys(RENOMEAVEIS).forEach(function (k) {
      var c = cfg[k];
      if (c && typeof c === "object" && c.label && String(c.label).trim()) out[RENOMEAVEIS[k]] = String(c.label).trim();
    });
    return out;
  }

  function montarCatalogo(pid, ehML, produtos) {
    var renom = rotulosDaPlataforma(pid);
    var lista = camposFixos(ehML).map(function (c) {
      if (renom[c.id] && normTxt(renom[c.id]) !== normTxt(c.rotulo)) {
        c.rotuloPadrao = c.rotulo;
        c.rotulo = renom[c.id];
        c.termos = [normTxt(renom[c.id])].concat(c.termos);
      }
      return c;
    });
    return lista.concat(camposPersonalizados(produtos));
  }

  // ─────────────────────────────────────────────
  //  RECONHECIMENTO PELOS TÍTULOS
  // ─────────────────────────────────────────────
  /** Título → texto comparável: sem acento, minúsculo, pontuação vira espaço. */
  function normTitulo(t) {
    return normTxt(t).replace(/[^a-z0-9%]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function temPalavra(t, termo) {
    if (!termo) return false;
    var i = (" " + t + " ").indexOf(" " + termo + " ");
    return i >= 0;
  }
  // Nota a partir da qual o título é considerado certo (abaixo: "parecido").
  var FORTE = 50;
  function prepararCampo(c) {
    if (!c._t) {
      c._t = (c.termos || []).map(normTitulo).filter(Boolean);
      c._e = (c.evitar || []).map(normTitulo).filter(Boolean);
    }
    return c;
  }
  /** O título pronto para comparar: com e sem as unidades (kg, cm, %, R$). */
  function prepararTitulo(titulo) {
    var t = normTitulo(titulo);
    var s = t.replace(/%/g, " ").replace(/\b(kg|g|gr|gramas|cm|mm|m|metros|r|rs|un|und)\b/g, " ").replace(/\s+/g, " ").trim();
    return { t: t, s: s };
  }
  /**
   * Quanto um título casa com o campo: 0 = não casa; 100 = igual;
   * 60 = começa com o termo; 30 = tem o termo no meio (parecido).
   * O termo mais específico (o primeiro da lista) desempata.
   */
  function notaPreparada(pt, campo) {
    var t = pt.t, semUnid = pt.s;
    if (!t || t.length > 60 || !campo._t.length) return 0;
    for (var e = 0; e < campo._e.length; e++) {
      var ev = campo._e[e];
      if (temPalavra(t, ev) || (ev.length > 4 && t.indexOf(ev) >= 0)) return 0;
    }
    var melhor = 0;
    for (var i = 0; i < campo._t.length; i++) {
      var tt = campo._t[i];
      var n = 0;
      if (semUnid === tt || t === tt) n = 100;
      else if (semUnid.indexOf(tt + " ") === 0 || t.indexOf(tt + " ") === 0) n = 60;
      else if (temPalavra(semUnid, tt) || temPalavra(t, tt)) n = 30;
      if (n) n -= Math.min(i, 9) * 0.1;
      if (n > melhor) melhor = n;
    }
    return melhor;
  }
  function notaTitulo(titulo, campo) { return notaPreparada(prepararTitulo(titulo), prepararCampo(campo)); }
  function unidadeDoTitulo(titulo, tipo) {
    var t = " " + normTitulo(titulo) + " ";
    if (tipo === "peso") {
      if (/ (kg|quilo|quilos|kilo|kilos) /.test(t)) return "kg";
      if (/ (g|gr|grama|gramas) /.test(t)) return "g";
      return "";
    }
    if (tipo === "medida") {
      if (/ (mm|milimetro|milimetros) /.test(t)) return "mm";
      if (/ (cm|centimetro|centimetros) /.test(t)) return "cm";
      if (/ (m|metro|metros) /.test(t)) return "m";
      return "";
    }
    return "";
  }
  function precisaUnidade(campo) { return campo && (campo.tipo === "peso" || campo.tipo === "medida"); }
  function unidadePadrao(campo) { return campo.tipo === "peso" ? "g" : campo.tipo === "medida" ? "cm" : ""; }

  /** Os textos acima da célula inicial (o título da coluna). */
  function tituloAcima(sheet, ci, linha) {
    for (var L = linha - 1; L >= Math.max(1, linha - 8); L--) {
      var t = textoDe(celula(sheet, colunaDoIndice(ci), L)).trim();
      if (t && t.length <= 80) return { texto: t, linha: L };
    }
    return null;
  }
  function titulosAcima(sheet, ci, linha) {
    var out = [];
    for (var L = linha - 1; L >= Math.max(1, linha - 8); L--) {
      var t = textoDe(celula(sheet, colunaDoIndice(ci), L)).trim();
      if (t) out.push(t);
    }
    return out;
  }

  /**
   * A linha de títulos da aba: a que tem mais títulos reconhecidos com
   * certeza (entre as 25 primeiras). Devolve { linha, achados[] } —
   * achados: { ci, campo, nota, titulo } (uma coluna por campo).
   */
  function reconhecerTitulos(sheet, catalogo, ateLinha) {
    var ext = extensao(sheet);
    var ultCol = Math.min(ext.ultimaColuna, 300);
    var ultLin = Math.min(ext.ultimaLinha, ateLinha || 25);
    var melhor = { linha: 0, fortes: 0, achados: [] };
    var reconheciveis = catalogo.filter(function (c) { return c.termos && c.termos.length; }).map(prepararCampo);
    for (var L = 1; L <= ultLin; L++) {
      var pares = [];
      for (var ci = 0; ci <= ultCol; ci++) {
        var t = textoDe(celula(sheet, colunaDoIndice(ci), L)).trim();
        if (!t || t.length > 60) continue;
        var pt = prepararTitulo(t);
        reconheciveis.forEach(function (campo) {
          var n = notaPreparada(pt, campo);
          if (n > 0) pares.push({ ci: ci, campo: campo, nota: n, titulo: t });
        });
      }
      // Cada coluna fica com um campo e cada campo com uma coluna (o melhor par primeiro).
      pares.sort(function (a, b) { return b.nota - a.nota || a.ci - b.ci; });
      var colUsada = Object.create(null), campoUsado = Object.create(null), achados = [];
      pares.forEach(function (pr) {
        if (colUsada[pr.ci] || campoUsado[pr.campo.id]) return;
        colUsada[pr.ci] = true;
        campoUsado[pr.campo.id] = true;
        achados.push(pr);
      });
      var fortes = achados.filter(function (a) { return a.nota >= FORTE; }).length;
      if (fortes > melhor.fortes) melhor = { linha: L, fortes: fortes, achados: achados };
    }
    return melhor.fortes >= 2 ? melhor : { linha: 0, fortes: melhor.fortes, achados: melhor.fortes ? melhor.achados : [], linhaFraca: melhor.linha };
  }

  // ─────────────────────────────────────────────
  //  MODELOS E CONFIGURAÇÕES SALVAS
  // ─────────────────────────────────────────────
  // As mesmas posições do "Adicionar pela Planilha" (importar-produtos.js).
  var DO_IMPORTADOR = { nome: "nome", sku: "sku", ean: "prodId", custo: "custo", peso: "peso", largura: "largura", altura: "altura", comprimento: "comprimento" };
  var MODELOS = {
    bling: { id: "bling", nome: "Bling", desc: "A planilha de produtos do Bling (a de importação ou uma exportada de lá). Os produtos entram a partir da linha 2." },
    ml: { id: "ml", nome: "Mercado Livre", desc: "A planilha de anúncios do Mercado Livre. Os produtos entram a partir da linha 7." },
    outra: { id: "outra", nome: "Outra planilha", desc: "A planilha de qualquer sistema ou plataforma. O Bapell reconhece os títulos das colunas e você ajusta o resto." },
  };
  function posicoesDoModelo(id) {
    var m = IMP.modelos && IMP.modelos[id];
    if (!m) return null;
    var colunas = {};
    Object.keys(m.colunas || {}).forEach(function (k) { if (DO_IMPORTADOR[k]) colunas[DO_IMPORTADOR[k]] = m.colunas[k]; });
    var buscar = (m.buscar || []).map(function (k) { return DO_IMPORTADOR[k]; }).filter(Boolean);
    return { inicio: m.inicio, colunas: colunas, buscar: buscar, pesoUnidade: m.pesoUnidade || "g", traz: m.traz || [] };
  }

  function lerConfigs() {
    var lista = [];
    try { lista = JSON.parse(localStorage.getItem(CONFIG_KEY)) || []; } catch (e) { lista = []; }
    return Array.isArray(lista) ? lista.filter(function (c) { return c && c.id && Array.isArray(c.mapas); }) : [];
  }
  function gravarConfigs(lista) {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(lista)); return true; }
    catch (e) { registrarErro("salvar configuração", e); return false; }
  }

  // ─────────────────────────────────────────────
  //  LEITURA DA PLANILHA MODELO
  // ─────────────────────────────────────────────
  var _promessaJszip = null;
  function carregarJszip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (_promessaJszip) return _promessaJszip;
    _promessaJszip = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "JS/jszip.min.js";
      s.onload = function () { if (window.JSZip) resolve(window.JSZip); else reject(new Error("Biblioteca de compactação indisponível")); };
      s.onerror = function () { _promessaJszip = null; reject(new Error("Falha ao carregar JS/jszip.min.js")); };
      document.head.appendChild(s);
    });
    return _promessaJszip;
  }

  function lerBytes(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function (e) { resolve(e.target.result); };
      r.onerror = function () { reject(r.error || new Error("Falha ao ler o arquivo")); };
      r.readAsArrayBuffer(file);
    });
  }

  function tipoDoArquivo(nome) {
    var n = String(nome || "").toLowerCase();
    if (/\.(xlsx|xlsm)$/.test(n)) return "xlsx";
    if (/\.xls$/.test(n)) return "xls";
    if (/\.(csv|txt)$/.test(n)) return "csv";
    return "";
  }

  // ── CSV: lido e regravado aqui, para manter separador, aspas e codificação ──
  function decodificar(bytes) {
    var u8 = new Uint8Array(bytes);
    var bom = u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf;
    try {
      var t = new TextDecoder("utf-8", { fatal: true }).decode(u8);
      if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
      return { texto: t, codificacao: "utf-8", bom: bom };
    } catch (e) {
      return { texto: new TextDecoder("windows-1252").decode(u8), codificacao: "windows-1252", bom: false };
    }
  }
  function separadorDe(texto) {
    var primeira = "", dentro = false;
    for (var i = 0; i < texto.length; i++) {
      var ch = texto.charAt(i);
      if (ch === '"') dentro = !dentro;
      if (!dentro && (ch === "\n" || ch === "\r")) { if (primeira.trim()) break; primeira = ""; continue; }
      primeira += ch;
    }
    var cont = { ";": 0, ",": 0, "\t": 0 };
    dentro = false;
    for (var j = 0; j < primeira.length; j++) {
      var c = primeira.charAt(j);
      if (c === '"') dentro = !dentro;
      else if (!dentro && cont[c] != null) cont[c]++;
    }
    if (cont[";"] >= cont[","] && cont[";"] >= cont["\t"] && cont[";"] > 0) return ";";
    if (cont["\t"] > cont[","]) return "\t";
    return cont[","] > 0 ? "," : ";";
  }
  function lerCsv(texto) {
    var sep = separadorDe(texto);
    var linhas = [], linha = [], campo = "", dentro = false, foiAspas = false;
    var totalCampos = 0, comAspas = 0;
    function fechaCampo() { linha.push(campo); totalCampos++; if (foiAspas) comAspas++; campo = ""; foiAspas = false; }
    function fechaLinha() { fechaCampo(); linhas.push(linha); linha = []; }
    for (var i = 0; i < texto.length; i++) {
      var ch = texto.charAt(i);
      if (dentro) {
        if (ch === '"') {
          if (texto.charAt(i + 1) === '"') { campo += '"'; i++; }
          else dentro = false;
        } else campo += ch;
        continue;
      }
      if (ch === '"' && campo === "") { dentro = true; foiAspas = true; continue; }
      if (ch === sep) { fechaCampo(); continue; }
      if (ch === "\r") { if (texto.charAt(i + 1) === "\n") i++; fechaLinha(); continue; }
      if (ch === "\n") { fechaLinha(); continue; }
      campo += ch;
    }
    var terminaComQuebra = /\r?\n$/.test(texto) || /\r$/.test(texto);
    if (campo !== "" || linha.length || foiAspas) fechaLinha();
    return {
      linhas: linhas, sep: sep, eol: texto.indexOf("\r\n") >= 0 ? "\r\n" : "\n",
      aspasEmTudo: totalCampos > 0 && comAspas >= totalCampos * 0.9, terminaComQuebra: terminaComQuebra,
    };
  }
  /** O separador decimal que a planilha já usa (ou o do separador de colunas). */
  function decimalDoCsv(csv) {
    var virg = 0, pto = 0;
    for (var i = 0; i < csv.linhas.length && i < 300; i++) {
      csv.linhas[i].forEach(function (v) {
        if (/^-?\d+,\d+$/.test(v)) virg++;
        else if (/^-?\d+\.\d+$/.test(v)) pto++;
      });
    }
    if (virg > pto) return ",";
    if (pto > virg) return ".";
    return csv.sep === "," ? "." : ",";
  }
  function abaDoCsv(linhas) {
    var sheet = {};
    var ul = 0, uc = 0;
    linhas.forEach(function (lin, r) {
      lin.forEach(function (v, c) {
        if (v === "" || v == null) return;
        sheet[refDe(c, r + 1)] = { t: "s", v: v, w: v };
        if (r + 1 > ul) ul = r + 1;
        if (c > uc) uc = c;
      });
    });
    sheet["!ref"] = "A1:" + refDe(Math.max(uc, 0), Math.max(ul, 1));
    return sheet;
  }

  function lerModelo(file) {
    var tipo = tipoDoArquivo(file.name);
    if (!tipo) return Promise.reject(new Error("nao-planilha"));
    return Promise.all([carregarXlsx(), lerBytes(file)]).then(function (r) {
      var XLSX = r[0], bytes = r[1];
      var arq = { nome: file.name, tipo: tipo, bytes: bytes, abas: [], sheets: {}, csv: null };
      if (tipo === "csv") {
        var dec = decodificar(bytes);
        var csv = lerCsv(dec.texto);
        csv.codificacao = dec.codificacao;
        csv.bom = dec.bom;
        csv.decimal = decimalDoCsv(csv);
        arq.csv = csv;
        arq.abas = ["Planilha"];
        arq.sheets = { Planilha: abaDoCsv(csv.linhas) };
        return arq;
      }
      var wb = XLSX.read(new Uint8Array(bytes), { type: "array", cellFormula: true, cellDates: false });
      if (!wb || !wb.SheetNames || !wb.SheetNames.length) throw new Error("planilha sem abas");
      arq.abas = wb.SheetNames.slice();
      arq.sheets = wb.Sheets;
      return arq;
    });
  }

  // ─────────────────────────────────────────────
  //  ESTADO
  // ─────────────────────────────────────────────
  var st = null;
  var _uid = 0;
  function novoUid() { return "m" + ++_uid; }

  function estadoNovo(pid) {
    var ehML = false;
    try { ehML = typeof _plataformaEhML === "function" ? !!_plataformaEhML(pid) : false; } catch (e) {}
    var produtos = [];
    try { produtos = (typeof getProductsForReading === "function" ? getProductsForReading(pid) : getProducts(pid)) || []; }
    catch (e) { produtos = []; }
    produtos = produtos.filter(function (p) { return p && p.id; });
    var catalogo = montarCatalogo(pid, ehML, produtos);
    var catIdx = Object.create(null);
    catalogo.forEach(function (c) { catIdx[c.id] = c; });
    return {
      pid: pid, ehML: ehML, passo: 1, modelo: null, config: null, arq: null, aba: "", linhaTitulos: 0,
      inicio: 2, mapas: [], catalogo: catalogo, catIdx: catIdx, produtos: produtos,
      desmarcados: Object.create(null), busca: "", limite: PASSO_LISTA,
      modo: "", addFim: false, zeroVazio: true, salvar: { marcado: false, nome: "" },
      ctx: new Map(), gerando: false, sugestaoConfig: null, mudouMapa: false,
    };
  }

  function ctxDe(p) {
    var c = st.ctx.get(p.id);
    if (c) return c;
    c = { calc: null, prem: null, clas: null };
    var base = null;
    try {
      if (typeof _inputsDoProdutoSalvo === "function" && typeof calcularUnidade === "function") {
        base = _inputsDoProdutoSalvo(p);
        c.calc = calcularUnidade(base);
      }
    } catch (e) { c.calc = null; }
    if (st.ehML) {
      var tp = Number(p.mlTaxaPremium) || 0, tc = Number(p.mlTaxaClassico) || 0;
      if (!tp && !tc) { c.prem = num(p.finalPrice); c.clas = num(p.finalPrice); }
      else if (base) {
        try { c.prem = num(calcularUnidade(Object.assign({}, base, { taxa: tp })).precoVenda); } catch (e) {}
        try { c.clas = num(calcularUnidade(Object.assign({}, base, { taxa: tc })).precoVenda); } catch (e) {}
      }
    }
    st.ctx.set(p.id, c);
    return c;
  }

  /**
   * O valor que vai para a célula: { t: "n", v } | { t: "s", v } | null.
   * null = nada a escrever (campo vazio; ou zerado com "deixar vazio").
   */
  function valorDaCelula(mapa, p) {
    var campo = st.catIdx[mapa.campo];
    if (!campo) return null;
    var bruto;
    try { bruto = campo.valor(p, ctxDe(p)); } catch (e) { bruto = null; }
    if (campo.tipo === "texto" || campo.tipo === "codigo") {
      var s = bruto == null ? "" : String(bruto).trim();
      return s ? { t: "s", v: s } : null;
    }
    var n = Number(bruto);
    if (bruto == null || bruto === "" || !isFinite(n)) return null;
    if (campo.tipo === "peso") {
      if ((mapa.unidade || "g") === "kg") n = arred(n / 1000, 4);
      else n = arred(n, 2);
    } else if (campo.tipo === "medida") {
      var u = mapa.unidade || "cm";
      n = u === "mm" ? arred(n * 10, 2) : u === "m" ? arred(n / 100, 4) : arred(n, 2);
    } else {
      n = arred(n, 2);
    }
    if (n === 0 && st.zeroVazio) return null;
    return { t: "n", v: n };
  }
  function valorParaTela(mapa, p) {
    var v = valorDaCelula(mapa, p);
    if (!v) return "";
    if (v.t === "s") return v.v;
    var campo = st.catIdx[mapa.campo];
    if (campo.tipo === "dinheiro") return fmtBRL(v.v);
    if (campo.tipo === "pct") return fmtNum(v.v, 2) + "%";
    if (campo.tipo === "peso") return fmtNum(v.v, 4) + " " + (mapa.unidade || "g");
    if (campo.tipo === "medida") return fmtNum(v.v, 4) + " " + (mapa.unidade || "cm");
    return fmtNum(v.v, 4);
  }

  function abaAtual() { return st.arq ? st.arq.sheets[st.aba] : null; }

  // ─────────────────────────────────────────────
  //  MAPEAMENTOS DE PARTIDA
  // ─────────────────────────────────────────────
  function mapa(campo, ref, extra) {
    return Object.assign({ uid: novoUid(), campo: campo, inicio: ref, fim: "", unidade: "", usar: true, nota: { tipo: "manual" } }, extra || {});
  }

  /** Sugestões pelos títulos: campos ainda sem lugar, desmarcadas. */
  function acrescentarSugestoes(rec, mapas, inicio, todasDesmarcadas) {
    var colUsada = Object.create(null), campoUsado = Object.create(null);
    mapas.forEach(function (m) { var c = lerCelula(m.inicio); if (c) colUsada[c.ci] = true; campoUsado[m.campo] = true; });
    (rec.achados || []).forEach(function (a) {
      if (colUsada[a.ci] || campoUsado[a.campo.id]) return;
      var forte = a.nota >= FORTE && !todasDesmarcadas;
      var unid = precisaUnidade(a.campo) ? unidadeDoTitulo(a.titulo, a.campo.tipo) : "";
      var usar = forte && (!precisaUnidade(a.campo) || !!unid);
      mapas.push(mapa(a.campo.id, refDe(a.ci, inicio), {
        unidade: unid || unidadePadrao(a.campo),
        usar: usar,
        nota: usar ? { tipo: "titulo", titulo: a.titulo }
          : { tipo: precisaUnidade(a.campo) && !unid && forte ? "unidade" : "sugestao", titulo: a.titulo },
      }));
      colUsada[a.ci] = true;
      campoUsado[a.campo.id] = true;
    });
  }

  function mapearOutra() {
    var sheet = abaAtual();
    var rec = reconhecerTitulos(sheet, st.catalogo);
    st.linhaTitulos = rec.linha || 0;
    st.inicio = rec.linha ? rec.linha + 1 : Math.max(2, (rec.linhaFraca || 1) + 1);
    var mapas = [];
    // Sem uma linha de títulos clara (menos de 2 reconhecidos com certeza),
    // o que achou entra só como sugestão, desmarcado.
    acrescentarSugestoes(rec, mapas, st.inicio, !rec.linha);
    st.mapas = ordenarMapas(mapas);
  }

  function mapearModelo(id) {
    var pos = posicoesDoModelo(id);
    var sheet = abaAtual();
    st.inicio = pos.inicio;
    // A linha dos títulos: a que mais reconhece, acima da 1ª linha de produtos.
    var rec = reconhecerTitulos(sheet, st.catalogo, pos.inicio - 1);
    st.linhaTitulos = rec.linha || (pos.inicio - 1);
    var mapas = [];
    var colUsada = Object.create(null);
    var pendentes = [];
    Object.keys(pos.colunas).forEach(function (cid) {
      var campo = st.catIdx[cid];
      if (!campo) return;
      var ci = indiceDaColuna(pos.colunas[cid]);
      var titulos = titulosAcima(sheet, ci, pos.inicio);
      var unid = campo.tipo === "peso" ? pos.pesoUnidade : campo.tipo === "medida" ? "cm" : "";
      if (!titulos.length) {
        mapas.push(mapa(cid, refDe(ci, pos.inicio), { unidade: unid, nota: { tipo: "posicao" } }));
        colUsada[ci] = true;
      } else if (titulos.some(function (t) { return notaTitulo(t, campo) > 0; })) {
        mapas.push(mapa(cid, refDe(ci, pos.inicio), { unidade: unid, nota: { tipo: "ok", titulo: titulos[0] } }));
        colUsada[ci] = true;
      } else {
        pendentes.push({ campo: campo, ci: ci, unid: unid, titulo: titulos[0] });
      }
    });
    // Coluna do modelo com outro título: procura o campo pelos títulos.
    pendentes.forEach(function (pd) {
      var achado = (rec.achados || []).filter(function (a) { return a.campo.id === pd.campo.id && !colUsada[a.ci]; })[0];
      if (achado && achado.nota >= FORTE) {
        mapas.push(mapa(pd.campo.id, refDe(achado.ci, pos.inicio), { unidade: pd.unid,
          nota: { tipo: "ajustado", de: colunaDoIndice(pd.ci), titulo: achado.titulo } }));
        colUsada[achado.ci] = true;
      } else {
        // Não dá para ter certeza: fica no lugar do modelo, desmarcado.
        mapas.push(mapa(pd.campo.id, refDe(pd.ci, pos.inicio), { unidade: pd.unid, usar: false,
          nota: { tipo: "confira", titulo: pd.titulo } }));
        colUsada[pd.ci] = true;
      }
    });
    // Campos sem posição fixa (o EAN do Mercado Livre): pelo título.
    pos.buscar.forEach(function (cid) {
      if (mapas.some(function (m) { return m.campo === cid; })) return;
      var achado = (rec.achados || []).filter(function (a) { return a.campo.id === cid && !colUsada[a.ci]; })[0];
      if (achado && achado.nota >= FORTE) {
        mapas.push(mapa(cid, refDe(achado.ci, pos.inicio), { nota: { tipo: "titulo", titulo: achado.titulo } }));
        colUsada[achado.ci] = true;
      }
    });
    // Outros campos que a planilha tem: sugeridos, desmarcados.
    acrescentarSugestoes(rec, mapas, pos.inicio, true);
    st.mapas = ordenarMapas(mapas);
  }

  function mapearConfig(cfg) {
    var sheet = abaAtual();
    st.inicio = cfg.inicio || 2;
    st.linhaTitulos = cfg.linhaTitulos || 0;
    if (cfg.zeroVazio === false) st.zeroVazio = false;
    st.mapas = ordenarMapas((cfg.mapas || []).map(function (m) {
      var campo = st.catIdx[m.campo];
      var c = lerCelula(m.inicio);
      if (!campo) return mapa(m.campo, m.inicio, { fim: m.fim || "", unidade: m.unidade || "", usar: false, nota: { tipo: "semcampo" } });
      var agora = c ? tituloAcima(sheet, c.ci, c.linha) : null;
      var antes = m.titulo || "";
      var igual = normTitulo(agora ? agora.texto : "") === normTitulo(antes);
      return mapa(m.campo, m.inicio, {
        fim: m.fim || "", unidade: m.unidade || unidadePadrao(campo), usar: igual && m.usar !== false,
        nota: igual ? { tipo: "salva" } : { tipo: "mudou", antes: antes, titulo: agora ? agora.texto : "" },
      });
    }));
  }

  function ordenarMapas(mapas) {
    return mapas.sort(function (a, b) {
      var ca = lerCelula(a.inicio), cb = lerCelula(b.inicio);
      if (!ca || !cb) return 0;
      return ca.ci - cb.ci || ca.linha - cb.linha;
    });
  }

  function mapearDoZero() {
    st.mudouMapa = false;
    if (st.config) mapearConfig(st.config);
    else if (st.modelo === "outra") mapearOutra();
    else mapearModelo(st.modelo);
  }

  /** Configuração salva com os mesmos títulos desta planilha (para sugerir). */
  function configParecida() {
    var sheet = abaAtual();
    if (!sheet) return null;
    var melhor = null;
    lerConfigs().forEach(function (cfg) {
      if (cfg.aba && st.arq.abas.indexOf(cfg.aba) < 0 && st.arq.abas.length > 1) return;
      var comTitulo = (cfg.mapas || []).filter(function (m) { return m.titulo; });
      if (comTitulo.length < 2) return;
      var iguais = comTitulo.filter(function (m) {
        var c = lerCelula(m.inicio);
        var t = c ? tituloAcima(sheet, c.ci, c.linha) : null;
        return t && normTitulo(t.texto) === normTitulo(m.titulo);
      }).length;
      var taxa = iguais / comTitulo.length;
      if (taxa >= 0.6 && (!melhor || taxa > melhor.taxa)) melhor = { cfg: cfg, taxa: taxa };
    });
    return melhor ? melhor.cfg : null;
  }

  // ─────────────────────────────────────────────
  //  PLANO DE ESCRITA (o que vai em cada célula)
  // ─────────────────────────────────────────────
  function mapasEmUso() { return st.mapas.filter(function (m) { return m.usar; }); }
  function produtosMarcados() { return st.produtos.filter(function (p) { return !st.desmarcados[p.id]; }); }

  /** Confere as células dos campos marcados. Devolve { erros[], geo[] }. */
  function geometria() {
    var erros = [], geo = [];
    mapasEmUso().forEach(function (m) {
      var campo = st.catIdx[m.campo];
      var nome = campo ? campo.rotulo : m.campo;
      if (!campo) { erros.push("O campo de uma linha não existe nesta plataforma: desmarque ou remova a linha."); return; }
      var a = lerCelula(m.inicio);
      if (!a) { erros.push("Célula inicial inválida em " + esc(nome) + ": use a letra da coluna e o número da linha (ex.: C2)."); return; }
      var b = null, dir = "v";
      if (String(m.fim || "").trim()) {
        b = lerCelula(m.fim);
        if (!b) { erros.push("Célula final inválida em " + esc(nome) + " (ex.: C500)."); return; }
        if (b.ci === a.ci && b.linha >= a.linha) dir = "v";
        else if (b.linha === a.linha && b.ci > a.ci) dir = "h";
        else { erros.push("Em " + esc(nome) + ", a célula final precisa estar na mesma coluna, abaixo da inicial (ex.: " + a.col + a.linha + " até " + a.col + (a.linha + 99) + "), ou na mesma linha, à direita."); return; }
      }
      geo.push({ m: m, campo: campo, a: a, b: b, dir: dir,
        cap: b ? (dir === "v" ? b.linha - a.linha + 1 : b.ci - a.ci + 1) : (MAX_LINHA - a.linha + 1) });
    });
    if (!mapasEmUso().length) erros.push("Marque ao menos um campo para exportar.");
    return { erros: erros, geo: geo };
  }

  /** As linhas que já têm dados nas colunas dos campos (a partir da 1ª linha de produtos). */
  function linhasComDados(geo) {
    var sheet = abaAtual();
    var verticais = geo.filter(function (g) { return g.dir === "v"; });
    if (!verticais.length || !sheet) return [];
    var de = Math.min.apply(null, verticais.map(function (g) { return g.a.linha; }));
    var ext = extensao(sheet);
    var linhas = [];
    for (var L = de; L <= ext.ultimaLinha; L++) {
      if (verticais.some(function (g) { return L >= g.a.linha && (!g.b || L <= g.b.linha) && temValor(sheet, refDe(g.a.ci, L)); })) linhas.push(L);
    }
    return linhas;
  }

  function planejar() {
    var g = geometria();
    var plano = { erros: g.erros.slice(), avisos: [], escritas: new Map(), limpar: [], destino: new Map(), modo: "lista",
      existentes: [], geo: g.geo, naoAchados: 0, achados: 0, produtos: produtosMarcados() };
    if (g.erros.length) return plano;
    var sheet = abaAtual();
    var prods = plano.produtos;
    var n = prods.length;
    if (!n) { plano.erros.push("Marque ao menos um produto."); return plano; }

    plano.existentes = linhasComDados(g.geo);
    var temHoriz = g.geo.some(function (x) { return x.dir === "h"; });
    if (plano.existentes.length) {
      if (!st.modo) plano.erros.push("A planilha já tem dados nas linhas dos produtos: escolha abaixo o que fazer com eles.");
      plano.modo = st.modo || "";
    }
    var ultimaComDados = plano.existentes.length ? plano.existentes[plano.existentes.length - 1] : 0;

    // Linhas começando em lugares diferentes: o produto 1 ficaria em linhas diferentes.
    var inicios = {};
    g.geo.filter(function (x) { return x.dir === "v"; }).forEach(function (x) { inicios[x.a.linha] = true; });
    if (Object.keys(inicios).length > 1) {
      plano.avisos.push("Os campos começam em linhas diferentes (" + Object.keys(inicios).join(", ") + "): cada produto vai ocupar linhas diferentes em cada coluna. Confira as células iniciais.");
    }

    var dono = new Map(); // ref → rótulo do campo (para achar sobreposição)
    function escreve(ref, mp, p) {
      var outro = dono.get(ref);
      if (outro && outro !== mp.campo.rotulo) {
        plano.erros.push("Os campos " + esc(outro) + " e " + esc(mp.campo.rotulo) + " caem na mesma célula (" + ref + "). Mude a célula de um deles.");
        return;
      }
      dono.set(ref, mp.campo.rotulo);
      var v = valorDaCelula(mp.m, p);
      if (v) plano.escritas.set(ref, v);
      // "Escrever por cima": a linha era de outro produto — campo vazio
      // neste produto apaga a célula, para não ficar o valor do antigo.
      else if (plano.modo === "sobre") plano.escritas.set(ref, { t: "vazio" });
    }

    if (plano.modo === "sku") {
      var gs = g.geo.filter(function (x) { return x.campo.id === "sku" && x.dir === "v"; })[0];
      if (!gs) { plano.erros.push("Para atualizar pelo SKU, marque o campo SKU numa coluna da planilha."); return plano; }
      if (temHoriz) { plano.erros.push("Atualizar pelo SKU só funciona com os campos em colunas (célula final abaixo da inicial)."); return plano; }
      var indice = Object.create(null);
      var ate = gs.b ? gs.b.linha : extensao(sheet).ultimaLinha;
      for (var L = gs.a.linha; L <= ate; L++) {
        var k = normSku(textoDe(celula(sheet, gs.a.col, L)));
        if (k) (indice[k] = indice[k] || []).push(L);
      }
      var proxima = Math.max(ultimaComDados, gs.a.linha - 1) + 1;
      var linhaDe = Object.create(null), repetidos = 0;
      prods.forEach(function (p) {
        var linhas = p.sku ? indice[normSku(p.sku)] : null;
        if (linhas && linhas.length) {
          plano.achados++;
          if (linhas.some(function (Lx) { return linhaDe[Lx]; })) repetidos++;
          linhas.forEach(function (Lx) { linhaDe[Lx] = true; });
          plano.destino.set(p.id, { tipo: "atualiza", linhas: linhas });
          linhas.forEach(function (Lx) { g.geo.forEach(function (x) { escreve(refDe(x.a.ci, Lx), x, p); }); });
        } else if (st.addFim) {
          plano.naoAchados++;
          var Ln = proxima++;
          plano.destino.set(p.id, { tipo: "novo", linhas: [Ln] });
          g.geo.forEach(function (x) {
            if (x.b && Ln > x.b.linha) { plano.erros.push(esc(x.campo.rotulo) + " vai só até a linha " + x.b.linha + ": não cabem os produtos novos. Aumente a célula final."); return; }
            escreve(refDe(x.a.ci, Ln), x, p);
          });
        } else {
          plano.naoAchados++;
          plano.destino.set(p.id, { tipo: "fora" });
        }
      });
      if (repetidos) plano.avisos.push(plural(repetidos, "produto marcado tem", "produtos marcados têm") + " o mesmo SKU de outro: a linha fica com os dados do último. Desmarque o que não deve ir.");
    } else {
      if (plano.modo === "substituir") plano.limpar = plano.existentes.slice();
      g.geo.forEach(function (x) {
        if (n > x.cap) {
          plano.erros.push(esc(x.campo.rotulo) + " tem espaço para " + plural(x.cap, "produto", "produtos") + " (" + x.a.ref + " até " + x.b.ref + ") e há " + n + " marcados. Aumente a célula final ou desmarque produtos.");
        }
      });
      if (plano.erros.length) return plano;
      prods.forEach(function (p, i) {
        var dest = null;
        g.geo.forEach(function (x) {
          var ref = x.dir === "v" ? refDe(x.a.ci, x.a.linha + i) : refDe(x.a.ci + i, x.a.linha);
          if (!dest) dest = x.dir === "v" ? { tipo: "linha", linhas: [x.a.linha + i] } : { tipo: "coluna", col: colunaDoIndice(x.a.ci + i) };
          escreve(ref, x, p);
        });
        plano.destino.set(p.id, dest);
      });
    }

    // Células mescladas e fórmulas que vão ser substituídas.
    var mescladas = 0, formulas = 0;
    var merges = (sheet && sheet["!merges"]) || [];
    plano.escritas.forEach(function (v, ref) {
      var c = lerCelula(ref);
      if (sheet && sheet[ref] && sheet[ref].f != null) formulas++;
      for (var i = 0; i < merges.length; i++) {
        var mg = merges[i];
        if (c.linha - 1 >= mg.s.r && c.linha - 1 <= mg.e.r && c.ci >= mg.s.c && c.ci <= mg.e.c && !(c.linha - 1 === mg.s.r && c.ci === mg.s.c)) { mescladas++; break; }
      }
    });
    if (formulas) plano.avisos.push(plural(formulas, "célula com fórmula vai", "células com fórmula vão") + " receber o valor do produto no lugar da fórmula.");
    // Intervalo numa linha que já tinha valores (o das colunas é tratado acima, nas linhas existentes).
    if (plano.modo === "lista") {
      var ocupadas = 0;
      plano.escritas.forEach(function (v, ref) { if (temValor(sheet, ref)) ocupadas++; });
      if (ocupadas) plano.avisos.push(ocupadas === 1 ? "1 célula de destino já tem valor e vai ser substituída pelo dado do produto."
        : fmtNum(ocupadas, 0) + " células de destino já têm valor e vão ser substituídas pelos dados dos produtos.");
    }
    if (mescladas) plano.avisos.push(plural(mescladas, "célula de destino está mesclada", "células de destino estão mescladas") + " com outra: o valor pode não aparecer. Confira as células.");
    return plano;
  }

  // ─────────────────────────────────────────────
  //  GERAR O ARQUIVO
  // ─────────────────────────────────────────────
  var NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  var NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var NS_PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
  var NS_CT = "http://schemas.openxmlformats.org/package/2006/content-types";
  var NS_XML = "http://www.w3.org/XML/1998/namespace";

  function xmlDoc(txt) {
    var doc = new DOMParser().parseFromString(txt, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("XML da planilha ilegível");
    return doc;
  }
  function xmlTexto(doc) {
    var s = new XMLSerializer().serializeToString(doc);
    if (!/^<\?xml/.test(s)) s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + s;
    return s;
  }
  function resolver(base, alvo) {
    alvo = String(alvo || "");
    if (alvo.charAt(0) === "/") return alvo.slice(1);
    var partes = (base ? base.split("/") : []).concat(alvo.split("/"));
    var out = [];
    partes.forEach(function (p) { if (!p || p === ".") return; if (p === "..") out.pop(); else out.push(p); });
    return out.join("/");
  }
  function relsDe(caminho) {
    var i = caminho.lastIndexOf("/");
    return (i >= 0 ? caminho.slice(0, i + 1) : "") + "_rels/" + caminho.slice(i + 1) + ".rels";
  }
  function filhos(el, nome) {
    var out = [];
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && n.localName === nome) out.push(n);
    return out;
  }
  function textoXml(s) {
    // Caracteres que o XML não aceita (controle) saem.
    return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");
  }

  /** Strings compartilhadas (sharedStrings.xml). */
  function Sst(doc) {
    this.doc = doc;
    this.raiz = doc.documentElement;
    this.ns = this.raiz.namespaceURI || NS_MAIN;
    this.prefixo = this.raiz.prefix;
    this.si = filhos(this.raiz, "si");
    this.mapa = null;
    this.mais = 0;
    this.menos = 0;
    this.novos = 0;
  }
  Sst.prototype.el = function (n) { return this.doc.createElementNS(this.ns, this.prefixo ? this.prefixo + ":" + n : n); };
  Sst.prototype.indice = function (texto) {
    if (!this.mapa) {
      this.mapa = new Map();
      var self = this;
      this.si.forEach(function (si, i) {
        var partes = [];
        filhos(si, "t").forEach(function (t) { partes.push(t.textContent); });
        filhos(si, "r").forEach(function (r) { filhos(r, "t").forEach(function (t) { partes.push(t.textContent); }); });
        var k = partes.join("");
        if (!self.mapa.has(k)) self.mapa.set(k, i);
      });
    }
    this.mais++;
    if (this.mapa.has(texto)) return this.mapa.get(texto);
    var si = this.el("si"), t = this.el("t");
    t.textContent = texto;
    if (/^\s|\s$|\n/.test(texto)) t.setAttributeNS(NS_XML, "xml:space", "preserve");
    si.appendChild(t);
    this.raiz.appendChild(si);
    this.si.push(si);
    var idx = this.si.length - 1;
    this.mapa.set(texto, idx);
    this.novos++;
    return idx;
  };
  Sst.prototype.finalizar = function () {
    if (!this.mais && !this.menos) return false;
    if (this.raiz.hasAttribute("uniqueCount") || this.novos) this.raiz.setAttribute("uniqueCount", String(this.si.length));
    if (this.raiz.hasAttribute("count")) {
      var c = (parseInt(this.raiz.getAttribute("count"), 10) || 0) + this.mais - this.menos;
      this.raiz.setAttribute("count", String(Math.max(c, this.si.length)));
    }
    return true;
  };

  function faixa(ref) {
    var p = String(ref || "").split(":");
    var a = lerCelula(p[0]), b = lerCelula(p[1] || p[0]);
    return a && b ? { c1: a.ci, l1: a.linha, c2: b.ci, l2: b.linha } : null;
  }

  /** Edita as células de UMA aba direto no XML, sem tocar no resto. */
  function EditorDeAba(doc, sst) {
    this.doc = doc;
    this.raiz = doc.documentElement;
    this.ns = this.raiz.namespaceURI || NS_MAIN;
    this.prefixo = this.raiz.prefix;
    this.sst = sst;
    this.sheetData = filhos(this.raiz, "sheetData")[0];
    if (!this.sheetData) throw new Error("aba sem sheetData");
    this.linhas = new Map();
    this.ordem = [];
    var n = 0, self = this;
    filhos(this.sheetData, "row").forEach(function (row) {
      var r = parseInt(row.getAttribute("r"), 10);
      if (!(r > 0)) { r = n + 1; row.setAttribute("r", String(r)); }
      n = r;
      self.linhas.set(r, { el: row, cels: null });
      self.ordem.push(r);
    });
    // Estilo de coluna (<cols>): célula nova numa coluna formatada herda o formato.
    this.colEstilos = [];
    var cols = filhos(this.raiz, "cols")[0];
    if (cols) filhos(cols, "col").forEach(function (c) {
      var s = c.getAttribute("style");
      if (s) self.colEstilos.push({ min: parseInt(c.getAttribute("min"), 10), max: parseInt(c.getAttribute("max"), 10), s: s });
    });
    // Fórmulas de matriz: escrever dentro da área delas exige soltar a fórmula.
    this.matrizes = [];
    Array.prototype.forEach.call(doc.getElementsByTagNameNS(this.ns, "f"), function (f) {
      var t = f.getAttribute("t");
      if ((t === "array" || t === "dataTable") && f.getAttribute("ref")) {
        var fx = faixa(f.getAttribute("ref"));
        if (fx) self.matrizes.push({ f: f, fx: fx });
      }
    });
    this.compartilhadas = new Set();
    this.mexeuFormula = false;
    this.ext = null;
  }
  EditorDeAba.prototype.el = function (n) { return this.doc.createElementNS(this.ns, this.prefixo ? this.prefixo + ":" + n : n); };
  EditorDeAba.prototype.linha = function (r, criar) {
    var info = this.linhas.get(r);
    if (info || !criar) return info || null;
    var row = this.el("row");
    row.setAttribute("r", String(r));
    // Posição em ordem (busca binária na lista de linhas).
    var lo = 0, hi = this.ordem.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (this.ordem[mid] < r) lo = mid + 1; else hi = mid; }
    var depois = lo < this.ordem.length ? this.linhas.get(this.ordem[lo]).el : null;
    this.sheetData.insertBefore(row, depois);
    this.ordem.splice(lo, 0, r);
    info = { el: row, cels: null };
    this.linhas.set(r, info);
    return info;
  };
  EditorDeAba.prototype.celulas = function (info) {
    if (info.cels) return info.cels;
    var m = new Map(), n = -1, r = info.el.getAttribute("r");
    filhos(info.el, "c").forEach(function (c) {
      var ref = lerCelula(c.getAttribute("r"));
      var ci = ref ? ref.ci : n + 1;
      if (!ref) c.setAttribute("r", refDe(ci, parseInt(r, 10)));
      n = ci;
      m.set(ci, c);
    });
    info.cels = m;
    return m;
  };
  EditorDeAba.prototype.celula = function (r, ci, criar) {
    var info = this.linha(r, criar);
    if (!info) return null;
    var cels = this.celulas(info);
    var c = cels.get(ci);
    if (c || !criar) return c || null;
    c = this.el("c");
    c.setAttribute("r", refDe(ci, r));
    // Estilo: o da linha (se formatada) ou o da coluna.
    var s = null;
    var cf = info.el.getAttribute("customFormat");
    if ((cf === "1" || cf === "true") && info.el.getAttribute("s")) s = info.el.getAttribute("s");
    if (!s) for (var i = 0; i < this.colEstilos.length; i++) {
      var ce = this.colEstilos[i];
      if (ci + 1 >= ce.min && ci + 1 <= ce.max) { s = ce.s; break; }
    }
    if (s) c.setAttribute("s", s);
    var depois = null;
    cels.forEach(function (el, k) { if (k > ci && (!depois || k < depois.k)) depois = { k: k, el: el }; });
    info.el.insertBefore(c, depois ? depois.el : null);
    cels.set(ci, c);
    info.el.removeAttribute("spans"); // a dica de colunas da linha mudou
    return c;
  };
  EditorDeAba.prototype.antesDeMudar = function (c, ci, r) {
    if (this.sst && c.getAttribute("t") === "s" && filhos(c, "v").length) this.sst.menos++;
    var f = filhos(c, "f")[0];
    if (f) {
      this.mexeuFormula = true;
      if (f.getAttribute("t") === "shared" && f.hasAttribute("ref")) this.compartilhadas.add(f.getAttribute("si"));
    }
    for (var i = 0; i < this.matrizes.length; i++) {
      var mx = this.matrizes[i];
      if (mx.f.parentNode && ci >= mx.fx.c1 && ci <= mx.fx.c2 && r >= mx.fx.l1 && r <= mx.fx.l2) {
        mx.f.parentNode.removeChild(mx.f);
        this.mexeuFormula = true;
      }
    }
  };
  EditorDeAba.prototype.esvaziar = function (c) {
    while (c.firstChild) c.removeChild(c.firstChild);
    c.removeAttribute("t");
  };
  EditorDeAba.prototype.escrever = function (ref, val) {
    var a = lerCelula(ref);
    if (val.t === "vazio") {
      var existente = this.celula(a.linha, a.ci, false);
      if (existente && (existente.firstChild || existente.getAttribute("t"))) {
        this.antesDeMudar(existente, a.ci, a.linha);
        this.esvaziar(existente);
      }
      return;
    }
    var c = this.celula(a.linha, a.ci, true);
    this.antesDeMudar(c, a.ci, a.linha);
    this.esvaziar(c);
    if (val.t === "n") {
      var v = this.el("v");
      v.textContent = String(val.v);
      c.appendChild(v);
    } else {
      var texto = textoXml(val.v);
      if (this.sst) {
        var idx = this.sst.indice(texto);
        c.setAttribute("t", "s");
        var vv = this.el("v");
        vv.textContent = String(idx);
        c.appendChild(vv);
      } else {
        c.setAttribute("t", "inlineStr");
        var is = this.el("is"), t = this.el("t");
        t.textContent = texto;
        if (/^\s|\s$|\n/.test(texto)) t.setAttributeNS(NS_XML, "xml:space", "preserve");
        is.appendChild(t);
        c.appendChild(is);
      }
    }
    this.estender(a.ci, a.linha);
  };
  /** Apaga os valores de uma linha (fórmulas e formatação ficam). */
  EditorDeAba.prototype.limparLinha = function (r) {
    var info = this.linha(r, false);
    if (!info) return;
    var self = this;
    this.celulas(info).forEach(function (c, ci) {
      if (filhos(c, "f").length) return;
      if (!c.firstChild && !c.getAttribute("t")) return;
      self.antesDeMudar(c, ci, r);
      self.esvaziar(c);
    });
  };
  EditorDeAba.prototype.estender = function (ci, r) {
    if (!this.ext) this.ext = { c1: ci, l1: r, c2: ci, l2: r };
    else {
      this.ext.c1 = Math.min(this.ext.c1, ci); this.ext.c2 = Math.max(this.ext.c2, ci);
      this.ext.l1 = Math.min(this.ext.l1, r); this.ext.l2 = Math.max(this.ext.l2, r);
    }
  };
  EditorDeAba.prototype.finalizar = function () {
    var self = this;
    // Fórmula compartilhada cuja célula-mestre foi substituída: as outras
    // células dela ficam com o último valor calculado (sem a fórmula).
    if (this.compartilhadas.size) {
      Array.prototype.slice.call(this.doc.getElementsByTagNameNS(this.ns, "f")).forEach(function (f) {
        if (f.getAttribute("t") === "shared" && self.compartilhadas.has(f.getAttribute("si")) && f.parentNode) f.parentNode.removeChild(f);
      });
    }
    // <dimension>: cobre o que foi escrito.
    if (this.ext) {
      var dim = filhos(this.raiz, "dimension")[0];
      if (dim) {
        var fx = faixa(dim.getAttribute("ref")) || { c1: this.ext.c1, l1: this.ext.l1, c2: this.ext.c2, l2: this.ext.l2 };
        var c1 = Math.min(fx.c1, this.ext.c1), l1 = Math.min(fx.l1, this.ext.l1), c2 = Math.max(fx.c2, this.ext.c2), l2 = Math.max(fx.l2, this.ext.l2);
        dim.setAttribute("ref", refDe(c1, l1) + (c1 === c2 && l1 === l2 ? "" : ":" + refDe(c2, l2)));
      }
    }
  };

  function gerarXlsx(arq, plano) {
    return carregarJszip().then(function (JSZip) {
      return JSZip.loadAsync(arq.bytes);
    }).then(function (zip) {
      var ler = function (p) { var f = zip.file(p); return f ? f.async("string") : Promise.resolve(null); };
      var wbPath = "xl/workbook.xml", wbDoc, wbRels, wbRelsPath, sheetPath, sstPath = null, calcPath = null, calcRel = null, ctDoc = null;
      return ler("_rels/.rels").then(function (txt) {
        if (txt) {
          var rels = xmlDoc(txt);
          Array.prototype.forEach.call(rels.getElementsByTagNameNS(NS_PKG, "Relationship"), function (r) {
            if (/\/officeDocument$/.test(r.getAttribute("Type") || "")) wbPath = resolver("", r.getAttribute("Target"));
          });
        }
        return Promise.all([ler(wbPath), ler(relsDe(wbPath)), ler("[Content_Types].xml")]);
      }).then(function (r) {
        if (!r[0] || !r[1]) throw new Error("Não achei as abas dentro do arquivo .xlsx.");
        wbDoc = xmlDoc(r[0]);
        wbRelsPath = relsDe(wbPath);
        wbRels = xmlDoc(r[1]);
        if (r[2]) ctDoc = xmlDoc(r[2]);
        var base = wbPath.indexOf("/") >= 0 ? wbPath.slice(0, wbPath.lastIndexOf("/")) : "";
        var rid = null;
        Array.prototype.forEach.call(wbDoc.getElementsByTagNameNS(NS_MAIN, "sheet"), function (s) {
          if (s.getAttribute("name") === plano.aba) rid = s.getAttributeNS(NS_REL, "id") || s.getAttribute("r:id");
        });
        Array.prototype.forEach.call(wbRels.getElementsByTagNameNS(NS_PKG, "Relationship"), function (rel) {
          var tipo = rel.getAttribute("Type") || "";
          if (rel.getAttribute("Id") === rid) sheetPath = resolver(base, rel.getAttribute("Target"));
          if (/\/sharedStrings$/.test(tipo)) sstPath = resolver(base, rel.getAttribute("Target"));
          if (/\/calcChain$/.test(tipo)) { calcPath = resolver(base, rel.getAttribute("Target")); calcRel = rel; }
        });
        if (!sheetPath) throw new Error("Não achei a aba " + plano.aba + " dentro do arquivo.");
        return Promise.all([ler(sheetPath), sstPath ? ler(sstPath) : Promise.resolve(null)]);
      }).then(function (r) {
        var shDoc = xmlDoc(r[0]);
        var sst = r[1] ? new Sst(xmlDoc(r[1])) : null;
        var ed = new EditorDeAba(shDoc, sst);
        plano.limpar.forEach(function (L) { ed.limparLinha(L); });
        plano.escritas.forEach(function (v, ref) { ed.escrever(ref, v); });
        ed.finalizar();
        zip.file(sheetPath, xmlTexto(shDoc));
        if (sst && sst.finalizar()) zip.file(sstPath, xmlTexto(sst.doc));
        // Fórmula mexida: a ordem de cálculo guardada (calcChain) fica velha —
        // sai do arquivo e o Excel a refaz ao abrir.
        if (ed.mexeuFormula && calcPath) {
          zip.remove(calcPath);
          if (calcRel && calcRel.parentNode) calcRel.parentNode.removeChild(calcRel);
          zip.file(wbRelsPath, xmlTexto(wbRels));
          if (ctDoc) {
            Array.prototype.forEach.call(ctDoc.getElementsByTagNameNS(NS_CT, "Override"), function (o) {
              if (o.getAttribute("PartName") === "/" + calcPath && o.parentNode) o.parentNode.removeChild(o);
            });
            zip.file("[Content_Types].xml", xmlTexto(ctDoc));
          }
        }
        var macro = /\.xlsm$/i.test(arq.nome);
        return zip.generateAsync({
          type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 },
          mimeType: macro ? "application/vnd.ms-excel.sheet.macroEnabled.12" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      });
    });
  }

  // ── CSV ──
  var CP1252 = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
    0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94,
    0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
  function codificar1252(texto) {
    var out = new Uint8Array(texto.length);
    for (var i = 0; i < texto.length; i++) {
      var c = texto.charCodeAt(i);
      if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) out[i] = c;
      else if (CP1252[c] != null) out[i] = CP1252[c];
      else out[i] = 0x3f; // "?" — caractere que o Latin-1 não tem
    }
    return out;
  }
  function numeroCsv(v, dec) {
    var s = String(v);
    if (/e/i.test(s)) s = Number(v).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    return dec === "," ? s.replace(".", ",") : s;
  }
  function campoCsv(v, csv) {
    var s = v == null ? "" : String(v);
    if (csv.aspasEmTudo || s.indexOf(csv.sep) >= 0 || /["\r\n]/.test(s) || /^\s|\s$/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function gerarCsv(arq, plano) {
    var csv = arq.csv;
    var linhas = csv.linhas.map(function (l) { return l.slice(); });
    plano.limpar.forEach(function (L) { if (linhas[L - 1]) linhas[L - 1] = linhas[L - 1].map(function () { return ""; }); });
    var largura = 0;
    linhas.forEach(function (l) { largura = Math.max(largura, l.length); });
    plano.escritas.forEach(function (v, ref) {
      var a = lerCelula(ref);
      while (linhas.length < a.linha) linhas.push([]);
      var l = linhas[a.linha - 1];
      while (l.length <= a.ci) l.push("");
      l[a.ci] = v.t === "vazio" ? "" : v.t === "n" ? numeroCsv(v.v, csv.decimal) : v.v;
      largura = Math.max(largura, l.length);
    });
    // Linhas apagadas no fim do arquivo (as antigas, depois dos produtos)
    // saem: num CSV, linha só com separadores vira "produto sem dados".
    while (linhas.length > 1 && linhas[linhas.length - 1].every(function (v) { return v === ""; })) linhas.pop();
    // Linhas novas com o mesmo número de colunas das outras.
    linhas = linhas.map(function (l) { while (l.length < largura) l.push(""); return l; });
    var texto = linhas.map(function (l) { return l.map(function (v) { return campoCsv(v, csv); }).join(csv.sep); }).join(csv.eol);
    if (csv.terminaComQuebra) texto += csv.eol;
    var bytes;
    if (csv.codificacao === "windows-1252") bytes = codificar1252(texto);
    else {
      var corpo = new TextEncoder().encode(texto);
      if (csv.bom) { bytes = new Uint8Array(corpo.length + 3); bytes.set([0xef, 0xbb, 0xbf], 0); bytes.set(corpo, 3); }
      else bytes = corpo;
    }
    return Promise.resolve(new Blob([bytes], { type: "text/csv;charset=" + (csv.codificacao === "windows-1252" ? "windows-1252" : "utf-8") }));
  }

  // ── XLS (formato antigo): regravado pela biblioteca de planilhas ──
  function gerarXls(arq, plano) {
    return carregarXlsx().then(function (XLSX) {
      var wb = XLSX.read(new Uint8Array(arq.bytes), { type: "array", cellFormula: true, cellStyles: true });
      var sheet = wb.Sheets[plano.aba];
      if (!sheet) throw new Error("Não achei a aba " + plano.aba + ".");
      if (plano.limpar.length) {
        var limpar = new Set(plano.limpar);
        Object.keys(sheet).forEach(function (k) {
          if (k.charAt(0) === "!") return;
          var c = lerCelula(k);
          if (c && limpar.has(c.linha) && sheet[k] && sheet[k].f == null) delete sheet[k];
        });
      }
      var fx = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
      plano.escritas.forEach(function (v, ref) {
        var a = lerCelula(ref);
        if (v.t === "vazio") { delete sheet[ref]; return; }
        sheet[ref] = v.t === "n" ? { t: "n", v: v.v } : { t: "s", v: v.v };
        fx.s.r = Math.min(fx.s.r, a.linha - 1); fx.s.c = Math.min(fx.s.c, a.ci);
        fx.e.r = Math.max(fx.e.r, a.linha - 1); fx.e.c = Math.max(fx.e.c, a.ci);
      });
      sheet["!ref"] = XLSX.utils.encode_range(fx);
      var out = XLSX.write(wb, { bookType: "xls", type: "array" });
      return new Blob([out], { type: "application/vnd.ms-excel" });
    });
  }

  function nomeDeSaida(arq) {
    var nome = String(arq.nome || "planilha");
    var i = nome.lastIndexOf(".");
    var base = i > 0 ? nome.slice(0, i) : nome;
    var ext = i > 0 ? nome.slice(i) : ".xlsx";
    return base + " - Bapell " + dataLocal() + ext;
  }
  function baixar(blob, nome) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  // ─────────────────────────────────────────────
  //  JANELA
  // ─────────────────────────────────────────────
  function abrir(pid) {
    if (!pid) { aviso("Abra a lista de uma plataforma para exportar os produtos.", "warning"); return; }
    if ($("epJanela") || $("ipJanela")) return;
    st = estadoNovo(pid);
    var ov = document.createElement("div");
    ov.className = "modal-overlay ip-overlay ep-overlay";
    ov.id = "epJanela";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-labelledby", "epTitulo");
    ov.innerHTML =
      '<div class="modal ip-modal ep-modal">' +
        '<div class="ip-topo">' +
          '<span class="ip-topo__ico">' + svg(I_EXPORTAR, 20) + "</span>" +
          '<div class="ip-topo__txt">' +
            '<div class="modal-title ip-titulo" id="epTitulo">Exportar produtos para planilha</div>' +
            '<div class="ip-sub" id="epSub"></div>' +
          "</div>" +
          '<button type="button" class="ip-fechar" id="epFechar" aria-label="Fechar">' + svg(I.x, 18, 2.4) + "</button>" +
        "</div>" +
        '<ol class="ip-passos" id="epPassos" aria-label="Etapas"></ol>' +
        '<div class="ip-corpo" id="epCorpo"></div>' +
        '<div class="ip-rodape" id="epRodape"></div>' +
      "</div>";
    document.body.appendChild(ov);
    document.body.classList.add("ep-aberta");
    $("epFechar").addEventListener("click", fechar);
    document.addEventListener("keydown", aoTeclar, true);
    document.addEventListener("dragover", bloquearSoltar, false);
    document.addEventListener("drop", bloquearSoltar, false);
    desenhar();
  }

  function bloquearSoltar(e) {
    if (!$("epJanela")) return;
    if (e.target && e.target.closest && e.target.closest("#epSoltar")) return;
    e.preventDefault();
  }
  function fechar() {
    var ov = $("epJanela");
    if (!ov) return;
    if (st && st.gerando) return;
    ov.remove();
    document.body.classList.remove("ep-aberta");
    document.removeEventListener("keydown", aoTeclar, true);
    document.removeEventListener("dragover", bloquearSoltar, false);
    document.removeEventListener("drop", bloquearSoltar, false);
    st = null;
  }
  function aoTeclar(e) {
    if (e.key !== "Escape" || !$("epJanela")) return;
    if (document.querySelector(".bm-overlay, .bsn-camada")) return;
    e.preventDefault();
    e.stopPropagation();
    var add = $("epAdd");
    if (add && !add.hidden) { fecharAdicionar(); return; }
    fechar();
  }

  function nomePlataforma(pid) {
    var c = typeof getPlatformConfig === "function" ? getPlatformConfig(pid) : null;
    return c ? c.name || pid : pid;
  }
  function nomeDoModelo() {
    if (st.config) return "a configuração " + st.config.nome;
    return st.modelo ? (st.modelo === "outra" ? "outra planilha" : "o modelo " + MODELOS[st.modelo].nome) : "";
  }

  function desenhar() {
    if (!st) return;
    $("epSub").innerHTML = st.modelo
      ? "Produtos de <strong>" + esc(nomePlataforma(st.pid)) + "</strong> · " + esc(nomeDoModelo()) + (st.arq ? " · " + esc(st.arq.nome) : "")
      : "Preencha a planilha de qualquer sistema com os produtos de <strong>" + esc(nomePlataforma(st.pid)) + "</strong>.";
    $("epPassos").innerHTML = PASSOS.map(function (nome, i) {
      var n = i + 1;
      var cls = n < st.passo ? "feito" : n === st.passo ? "atual" : "";
      return '<li class="ip-passo ' + cls + '"' + (n === st.passo ? ' aria-current="step"' : "") + ">" +
        '<span class="ip-passo__n">' + (n < st.passo ? svg(I.ok, 13, 3) : n) + "</span>" +
        '<span class="ip-passo__nome">' + nome + "</span></li>";
    }).join("");
    $("epCorpo").scrollTop = 0;
    if (st.passo === 1) desenharModelo();
    else if (st.passo === 2) desenharPlanilha();
    else if (st.passo === 3) desenharCampos();
    else desenharConferencia();
  }
  function rodape(esq, dir) {
    $("epRodape").innerHTML = '<div class="ip-rodape__esq">' + (esq || "") + '</div><div class="ip-rodape__dir">' + (dir || "") + "</div>";
  }
  function ligarRodape(acoes) {
    $("epRodape").querySelectorAll("[data-ep]").forEach(function (b) {
      b.addEventListener("click", function () {
        var fn = acoes[b.getAttribute("data-ep")];
        if (fn) fn();
      });
    });
  }

  // ── 1. Modelo ──
  function desenharModelo() {
    if (!st.produtos.length) {
      $("epCorpo").innerHTML = '<div class="ep-vazio-plat">' + svg(I.info, 18) + "<span>Esta plataforma ainda não tem produtos para exportar.</span></div>";
      rodape('<button type="button" class="btn-secondary" data-ep="cancelar">Fechar</button>', "");
      ligarRodape({ cancelar: fechar });
      return;
    }
    var cartao = function (m) {
      var pos = m.id !== "outra" ? posicoesDoModelo(m.id) : null;
      var sigla = m.id === "bling" ? "B" : m.id === "ml" ? "ML" : svg(I.planilha, 22);
      var chips = pos ? pos.traz.map(function (t) { return '<span class="ip-chip">' + esc(t.replace(" (se a planilha tiver)", "").replace("(kg → g)", "(g → kg)")) + "</span>"; }).join("")
        : '<span class="ip-chip">Reconhece os títulos</span><span class="ip-chip">+ qualquer campo</span>';
      return '<button type="button" class="ip-origem" data-modelo="' + m.id + '">' +
        '<span class="ip-origem__logo ip-origem__logo--' + m.id + '"><span class="ip-origem__sigla">' + sigla + "</span></span>" +
        '<span class="ip-origem__txt"><span class="ip-origem__nome">' + esc(m.nome) + '</span><span class="ip-origem__desc">' + esc(m.desc) + "</span>" +
        '<span class="ip-origem__traz">' + chips + "</span></span>" +
        '<span class="ip-origem__seta">' + svg(I.seta, 18) + "</span></button>";
    };
    var cfgs = lerConfigs();
    var salvas = cfgs.length
      ? '<div class="ip-bloco ep-salvas"><div class="ip-bloco__tit">Configurações salvas</div><ul class="ep-salvas__lista">' +
        cfgs.map(function (c) {
          var base = MODELOS[c.base] ? MODELOS[c.base].nome : "Outra planilha";
          var data = c.atualizadoEm ? new Date(c.atualizadoEm).toLocaleDateString("pt-BR") : "";
          return '<li class="ep-salva"><button type="button" class="ep-salva__usar" data-config="' + esc(c.id) + '">' +
            '<span class="ep-salva__nome">' + esc(c.nome) + "</span>" +
            '<span class="ep-salva__meta">' + esc(base) + " · " + plural((c.mapas || []).length, "campo", "campos") + (data ? " · salva em " + data : "") + "</span>" +
            '<span class="ep-salva__seta">' + svg(I.seta, 16) + "</span></button>" +
            '<button type="button" class="ep-icone-btn" data-apagar-config="' + esc(c.id) + '" aria-label="Excluir a configuração ' + esc(c.nome) + '" title="Excluir">' + svg(I_LIXO, 15) + "</button></li>";
        }).join("") + "</ul></div>"
      : "";
    $("epCorpo").innerHTML =
      '<p class="ip-intro">Para qual planilha vão os produtos? Os modelos já sabem onde fica cada campo; em qualquer um você muda o lugar dos campos e acrescenta outros.</p>' +
      '<div class="ip-origens ep-origens">' + cartao(MODELOS.bling) + cartao(MODELOS.ml) + cartao(MODELOS.outra) + "</div>" +
      salvas +
      '<p class="ip-nota">' + svg(I.info, 14) + "<span>Você anexa a planilha na próxima etapa e o Bapell a preenche — o arquivo original não muda; sai uma cópia preenchida.</span></p>";
    rodape('<button type="button" class="btn-secondary" data-ep="cancelar">Cancelar</button>', "");
    ligarRodape({ cancelar: fechar });
    $("epCorpo").querySelectorAll("[data-modelo]").forEach(function (b) {
      b.addEventListener("click", function () { escolherModelo(b.getAttribute("data-modelo"), null); });
    });
    $("epCorpo").querySelectorAll("[data-config]").forEach(function (b) {
      b.addEventListener("click", function () {
        var cfg = lerConfigs().filter(function (c) { return c.id === b.getAttribute("data-config"); })[0];
        if (cfg) escolherModelo(MODELOS[cfg.base] ? cfg.base : "outra", cfg);
      });
    });
    $("epCorpo").querySelectorAll("[data-apagar-config]").forEach(function (b) {
      b.addEventListener("click", function () { apagarConfig(b.getAttribute("data-apagar-config")); });
    });
    setTimeout(function () { var b = $("epCorpo") && $("epCorpo").querySelector("[data-modelo]"); if (b) try { b.focus(); } catch (e) {} }, 40);
  }

  function apagarConfig(id) {
    var cfg = lerConfigs().filter(function (c) { return c.id === id; })[0];
    if (!cfg) return;
    var feito = function (ok) {
      if (!ok || !st) return;
      gravarConfigs(lerConfigs().filter(function (c) { return c.id !== id; }));
      aviso("Configuração " + cfg.nome + " excluída.", "success");
      desenhar();
    };
    if (window.BapellModal) window.BapellModal.confirmar({ titulo: "Excluir a configuração?", texto: "A configuração " + cfg.nome + " deixa de aparecer aqui. As planilhas já geradas não mudam.", botao: "Excluir", perigo: true }).then(feito);
    else feito(true);
  }

  function escolherModelo(id, cfg) {
    if (!MODELOS[id]) return;
    var trocou = st.modelo !== id || st.config !== cfg;
    st.modelo = id;
    st.config = cfg || null;
    if (trocou && st.arq) {
      // Mesma planilha, outro modelo: refaz os campos.
      mapearDoZero();
    }
    st.salvar = { marcado: false, nome: cfg ? cfg.nome : "" };
    st.passo = 2;
    desenhar();
  }

  // ── 2. Planilha ──
  function desenharPlanilha() {
    var titulo = st.config ? "a planilha da configuração <strong>" + esc(st.config.nome) + "</strong>"
      : st.modelo === "outra" ? "a planilha que vai receber os produtos" : "a planilha do <strong>" + esc(MODELOS[st.modelo].nome) + "</strong>";
    $("epCorpo").innerHTML =
      '<p class="ip-intro">Escolha ' + titulo + ". " + (st.modelo !== "outra" ? esc(MODELOS[st.modelo].desc) : "Pode ser a planilha de importação de qualquer sistema ou plataforma.") + "</p>" +
      '<label class="ip-soltar" id="epSoltar" tabindex="0">' +
        '<input type="file" id="epArquivo" accept=".xlsx,.xlsm,.xls,.csv,.txt" />' +
        '<span class="ip-soltar__ico">' + svg(I.upload, 28, 1.8) + "</span>" +
        '<span class="ip-soltar__titulo">Arraste a planilha para cá ou clique para escolher</span>' +
        '<span class="ip-soltar__sub">Arquivos .xlsx, .xlsm, .xls ou .csv</span>' +
      "</label>" +
      '<p class="ip-nota">' + svg(I.info, 14) + "<span>No .xlsx e no .csv o arquivo gerado mantém tudo da planilha (formatação, listas de opções, outras abas) e só recebe os produtos. O .xls antigo pode perder a formatação — se puder, salve-o como .xlsx antes.</span></p>" +
      '<div class="ip-erro" id="epErroArquivo" hidden></div>';
    rodape('<button type="button" class="btn-secondary" data-ep="voltar">' + svg(I.voltar, 15) + " Voltar</button>",
      st.arq ? '<span class="ip-rodape__info">Planilha atual: <strong>' + esc(st.arq.nome) + "</strong></span>" +
        '<button type="button" class="btn-primary" data-ep="seguir">Continuar com ela ' + svg(I.seta, 15) + "</button>" : "");
    ligarRodape({
      voltar: function () { st.passo = 1; desenhar(); },
      seguir: function () { if (!st.mapas.length) mapearDoZero(); st.passo = 3; desenhar(); },
    });
    var zona = $("epSoltar"), input = $("epArquivo");
    input.addEventListener("change", function () { if (input.files && input.files[0]) carregarArquivo(input.files[0]); });
    zona.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    zona.addEventListener("dragover", function (e) { e.preventDefault(); zona.classList.add("arrastando"); });
    zona.addEventListener("dragleave", function () { zona.classList.remove("arrastando"); });
    zona.addEventListener("drop", function (e) {
      e.preventDefault();
      zona.classList.remove("arrastando");
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) carregarArquivo(f);
    });
  }
  function erroArquivo(msg) {
    var box = $("epErroArquivo");
    if (!box) { aviso(msg, "error", 6000); return; }
    box.hidden = false;
    box.innerHTML = svg(I.aviso, 16) + "<span>" + esc(msg) + "</span>";
  }
  function carregarArquivo(file) {
    if (!st) return;
    if (!tipoDoArquivo(file.name)) { erroArquivo("Esse arquivo não é uma planilha. Escolha um arquivo .xlsx, .xlsm, .xls ou .csv."); return; }
    var zona = $("epSoltar");
    if (zona) { zona.classList.add("lendo"); zona.querySelector(".ip-soltar__titulo").textContent = "Lendo " + file.name + "…"; }
    lerModelo(file).then(function (arq) {
      if (!st) return;
      st.arq = arq;
      // A aba: a da configuração, a que tem mais títulos reconhecidos, ou a 1ª.
      st.aba = arq.abas[0];
      if (st.config && st.config.aba && arq.abas.indexOf(st.config.aba) >= 0) st.aba = st.config.aba;
      else if (arq.abas.length > 1) {
        var melhor = -1;
        arq.abas.forEach(function (n) {
          var r = reconhecerTitulos(arq.sheets[n], st.catalogo);
          if (r.fortes > melhor) { melhor = r.fortes; st.aba = n; }
        });
      }
      st.modo = "";
      st.desmarcados = Object.create(null);
      mapearDoZero();
      st.sugestaoConfig = !st.config ? configParecida() : null;
      st.passo = 3;
      desenhar();
    }).catch(function (err) {
      registrarErro("ler a planilha", err);
      if (zona) { zona.classList.remove("lendo"); zona.querySelector(".ip-soltar__titulo").textContent = "Arraste a planilha para cá ou clique para escolher"; }
      erroArquivo("Não foi possível abrir a planilha. Confira se o arquivo não está corrompido ou protegido por senha.");
    });
  }

  // ── 3. Campos ──
  function opcoesUnidade(campo, atual) {
    var ops = campo.tipo === "peso" ? [["g", "em gramas"], ["kg", "em kg (divide por 1.000)"]]
      : [["cm", "em cm"], ["mm", "em mm"], ["m", "em metros"]];
    return ops.map(function (o) { return '<option value="' + o[0] + '"' + (atual === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("");
  }
  function situacaoHtml(m) {
    var n = m.nota || {};
    switch (n.tipo) {
      case "ok": return '<span class="ip-sit ip-sit--ok">' + svg(I.ok, 12, 3) + "Confere com o título</span>";
      case "posicao": return '<span class="ip-sit">Posição do modelo</span>';
      case "titulo": return '<span class="ip-sit ip-sit--ok">' + svg(I.ok, 12, 3) + "Reconhecido pelo título</span>";
      case "ajustado": return '<span class="ip-sit ip-sit--aviso">' + svg(I.aviso, 12) + "Ajustado: no modelo era a " + esc(n.de) + "</span>";
      case "confira": return '<span class="ip-sit ip-sit--aviso">' + svg(I.aviso, 12) + "Título diferente — confira e marque</span>";
      case "sugestao": return '<span class="ip-sit ip-sit--info">Sugestão — marque para usar</span>';
      case "unidade": return '<span class="ip-sit ip-sit--aviso">' + svg(I.aviso, 12) + "Confira a unidade e marque</span>";
      case "salva": return '<span class="ip-sit ip-sit--ok">' + svg(I.ok, 12, 3) + "Da configuração salva</span>";
      case "mudou": return '<span class="ip-sit ip-sit--aviso" title="Antes: ' + esc(n.antes || "sem título") + '">' + svg(I.aviso, 12) + "O título mudou — confira e marque</span>";
      case "semcampo": return '<span class="ip-sit ip-sit--aviso">' + svg(I.aviso, 12) + "Campo que esta plataforma não tem</span>";
      case "confirmado": return '<span class="ip-sit ip-sit--ok">' + svg(I.ok, 12, 3) + "Confirmado por você</span>";
      default: return '<span class="ip-sit ip-sit--info">Escolhido por você</span>';
    }
  }
  function primeiroProduto() { return produtosMarcados()[0] || st.produtos[0] || null; }

  function linhaMapaHtml(m) {
    var campo = st.catIdx[m.campo];
    var sheet = abaAtual();
    var a = lerCelula(m.inicio);
    var tit = a && sheet ? tituloAcima(sheet, a.ci, a.linha) : null;
    var p = primeiroProduto();
    var ex = campo && p ? valorParaTela(m, p) : "";
    var rot = campo ? campo.rotulo : "(campo removido) " + m.campo;
    var secao = campo ? campo.secao + (campo.calculado ? " · calculado" : "") : "";
    return '<tr data-uid="' + m.uid + '" class="' + (m.usar ? "" : "ep-desligado") + '">' +
      '<td class="ep-usar"><input type="checkbox" data-usar="' + m.uid + '"' + (m.usar ? " checked" : "") + (campo ? "" : " disabled") + ' aria-label="Usar ' + esc(rot) + '" /></td>' +
      '<td class="ip-campo"><strong>' + esc(rot) + '</strong><span class="ip-campo__destino">' + esc(secao) + "</span>" +
        (campo && precisaUnidade(campo) ? '<select class="input-field ip-unidade ep-unidade" data-unid="' + m.uid + '" aria-label="Unidade na planilha">' + opcoesUnidade(campo, m.unidade || unidadePadrao(campo)) + "</select>" : "") +
      "</td>" +
      '<td class="ep-cel-td"><input type="text" class="input-field ep-cel" data-inicio="' + m.uid + '" value="' + esc(m.inicio) + '" maxlength="10" autocomplete="off" spellcheck="false" aria-label="Célula inicial de ' + esc(rot) + '" /></td>' +
      '<td class="ep-cel-td"><input type="text" class="input-field ep-cel" data-fim="' + m.uid + '" value="' + esc(m.fim || "") + '" maxlength="10" autocomplete="off" spellcheck="false" placeholder="opcional" aria-label="Célula final de ' + esc(rot) + '" /></td>' +
      '<td class="ip-titulo-col">' + (tit ? esc(tit.texto) : '<span class="ip-muda">sem título</span>') + "</td>" +
      '<td class="ip-exemplo">' + (ex ? esc(ex) : '<span class="ip-muda">vazio</span>') + "</td>" +
      '<td class="ip-sit-col">' + situacaoHtml(m) + "</td>" +
      '<td class="ep-acao"><button type="button" class="ep-icone-btn" data-remover="' + m.uid + '" aria-label="Remover ' + esc(rot) + '" title="Remover">' + svg(I.x, 14, 2.4) + "</button></td>" +
      "</tr>";
  }

  function opcoesCatalogo(selecionado) {
    var porSecao = [];
    var idx = Object.create(null);
    st.catalogo.forEach(function (c) {
      if (!idx[c.secao]) { idx[c.secao] = []; porSecao.push({ secao: c.secao, campos: idx[c.secao] }); }
      idx[c.secao].push(c);
    });
    return '<option value="">Escolha o campo…</option>' + porSecao.map(function (g) {
      return '<optgroup label="' + esc(g.secao) + '">' + g.campos.map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (c.id === selecionado ? " selected" : "") + ">" + esc(c.rotulo) + (c.calculado ? " (calculado)" : "") + "</option>";
      }).join("") + "</optgroup>";
    }).join("");
  }

  function desenharCampos() {
    var arq = st.arq;
    var abas = arq.abas.length > 1
      ? '<label class="ep-aba-sel">Aba <select class="input-field" id="epAba">' + arq.abas.map(function (n) {
          return '<option value="' + esc(n) + '"' + (n === st.aba ? " selected" : "") + ">" + esc(n) + "</option>";
        }).join("") + "</select></label>"
      : "";
    var sugestao = st.sugestaoConfig
      ? '<div class="ep-banner">' + svg(I.info, 16) + '<span>Esta planilha tem os mesmos títulos da configuração salva <strong>' + esc(st.sugestaoConfig.nome) + "</strong>.</span>" +
        '<button type="button" class="btn-secondary" id="epUsarSugestao">Usar a configuração ' + esc(st.sugestaoConfig.nome) + "</button></div>"
      : "";
    var semTitulos = st.modelo === "outra" && !st.config && !st.linhaTitulos
      ? '<div class="ep-banner ep-banner--aviso">' + svg(I.aviso, 16) + "<span>Não reconheci os títulos desta planilha. Use <strong>Adicionar Campo</strong> para dizer onde vai cada campo.</span></div>"
      : "";
    $("epCorpo").innerHTML =
      '<p class="ip-intro">Onde vai cada campo do Bapell na planilha. ' +
        (st.config ? "As células vêm da configuração salva." : st.modelo === "outra" ? "Os campos foram reconhecidos pelos títulos das colunas." : "As células vêm do modelo do " + esc(MODELOS[st.modelo].nome) + " e foram conferidas pelos títulos.") +
        " O que não tem certeza fica desmarcado: confira e marque. A célula final é opcional — em branco, vai até acabarem os produtos.</p>" +
      sugestao + semTitulos +
      '<div class="ip-bloco ip-linhas ep-linhas">' + abas +
        '<label for="epInicio">Os produtos começam na linha</label>' +
        '<input type="number" class="input-field" id="epInicio" min="1" step="1" value="' + st.inicio + '" />' +
        (st.linhaTitulos ? '<span class="ip-dica">Títulos encontrados na linha ' + st.linhaTitulos + ". Mudar a linha inicial muda a célula inicial de todos os campos.</span>" : '<span class="ip-dica">Mudar a linha inicial muda a célula inicial de todos os campos.</span>') +
      "</div>" +
      '<div class="ep-barra">' +
        '<span class="ep-barra__conta" id="epConta"></span>' +
        '<button type="button" class="btn-secondary ep-btn-add" id="epBtnAdd">' + svg(I_MAIS, 15, 2.4) + " Adicionar Campo</button>" +
      "</div>" +
      '<div class="ep-add" id="epAdd" hidden>' +
        '<div class="ep-add__linha">' +
          '<label class="ep-add__campo">Campo do Bapell<select class="input-field" id="epAddCampo">' + opcoesCatalogo("") + "</select></label>" +
          '<label>Célula inicial<input type="text" class="input-field ep-cel" id="epAddInicio" maxlength="10" placeholder="Ex.: F' + st.inicio + '" autocomplete="off" spellcheck="false" /></label>' +
          '<label>Célula final <small>(opcional)</small><input type="text" class="input-field ep-cel" id="epAddFim" maxlength="10" placeholder="opcional" autocomplete="off" spellcheck="false" /></label>' +
          '<label id="epAddUnidWrap" hidden>Na planilha<select class="input-field" id="epAddUnid"></select></label>' +
          '<div class="ep-add__botoes"><button type="button" class="btn-primary" id="epAddOk">Adicionar</button><button type="button" class="btn-secondary" id="epAddCancelar">Cancelar</button></div>' +
        "</div>" +
        '<div class="ip-dica" id="epAddDica">Ex.: para o Preço de Custo na coluna F a partir da linha ' + st.inicio + ", informe F" + st.inicio + ". A célula final (F500) limita até onde preencher.</div>" +
        '<div class="ip-erro" id="epAddErro" hidden></div>' +
      "</div>" +
      '<div class="ip-tabela-wrap"><table class="ip-tabela ep-tabela">' +
        '<thead><tr><th class="ep-usar">Usar</th><th>Campo do Bapell</th><th>Célula inicial</th><th>Célula final</th><th>Título na planilha</th><th>Exemplo (1º produto)</th><th></th><th></th></tr></thead>' +
        '<tbody id="epMapas"></tbody>' +
      "</table></div>" +
      '<div class="ip-vazio" id="epMapasVazio" hidden>Nenhum campo ainda. Clique em <strong>Adicionar Campo</strong>.</div>' +
      '<div class="ip-erro" id="epErroCampos" hidden></div>';
    var refazer = st.config ? "Voltar à configuração salva" : st.modelo === "outra" ? "Reconhecer de novo" : "Voltar ao modelo";
    rodape('<button type="button" class="btn-secondary" data-ep="voltar">' + svg(I.voltar, 15) + " Voltar</button>" +
      '<button type="button" class="ip-link" data-ep="refazer">' + refazer + "</button>",
      '<button type="button" class="btn-primary" data-ep="conferir">Conferir os produtos ' + svg(I.seta, 15) + "</button>");
    ligarRodape({
      voltar: function () { st.passo = 2; desenhar(); },
      refazer: function () { mapearDoZero(); desenharCampos(); },
      conferir: conferirCampos,
    });
    desenharMapas();
    ligarCampos();
  }

  function desenharMapas() {
    var corpo = $("epMapas");
    if (!corpo) return;
    corpo.innerHTML = st.mapas.map(linhaMapaHtml).join("");
    $("epMapasVazio").hidden = st.mapas.length > 0;
    var usados = mapasEmUso().length;
    $("epConta").textContent = plural(usados, "campo marcado", "campos marcados") + " de " + st.mapas.length;
  }
  function mapaPorUid(uid) { return st.mapas.filter(function (m) { return m.uid === uid; })[0] || null; }
  function atualizarLinhaMapa(m) {
    var tr = $("epMapas") && $("epMapas").querySelector('tr[data-uid="' + m.uid + '"]');
    if (!tr) return;
    var tmp = document.createElement("tbody");
    tmp.innerHTML = linhaMapaHtml(m);
    var nova = tmp.firstChild;
    // Mantém o campo em edição (para não perder o cursor).
    var ativo = document.activeElement;
    var chave = ativo && tr.contains(ativo) ? (ativo.getAttribute("data-inicio") ? "data-inicio" : ativo.getAttribute("data-fim") ? "data-fim" : null) : null;
    ["ip-titulo-col", "ip-exemplo", "ip-sit-col"].forEach(function (cl) {
      var a = tr.querySelector("." + cl), b = nova.querySelector("." + cl);
      if (a && b) a.innerHTML = b.innerHTML;
    });
    tr.className = nova.className;
    var cb = tr.querySelector("[data-usar]");
    if (cb) cb.checked = m.usar;
    if (!chave) {
      var ini = tr.querySelector("[data-inicio]"), fim = tr.querySelector("[data-fim]");
      if (ini) ini.value = m.inicio;
      if (fim) fim.value = m.fim || "";
    }
    var usados = mapasEmUso().length;
    $("epConta").textContent = plural(usados, "campo marcado", "campos marcados") + " de " + st.mapas.length;
  }

  function ligarCampos() {
    var corpo = $("epCorpo");
    var aba = $("epAba");
    if (aba) aba.addEventListener("change", function () {
      st.aba = aba.value;
      mapearDoZero();
      st.sugestaoConfig = !st.config ? configParecida() : null;
      desenharCampos();
    });
    var ini = $("epInicio");
    ini.addEventListener("change", function () {
      var n = parseInt(ini.value, 10);
      if (!(n >= 1 && n <= MAX_LINHA)) { ini.value = st.inicio; return; }
      st.inicio = n;
      st.mudouMapa = true;
      st.mapas.forEach(function (m) {
        var a = lerCelula(m.inicio);
        if (!a) return;
        m.inicio = a.col + n;
        var b = lerCelula(m.fim);
        if (b && b.ci === a.ci && b.linha < n) m.fim = "";
      });
      desenharMapas();
    });
    var sug = $("epUsarSugestao");
    if (sug) sug.addEventListener("click", function () {
      st.config = st.sugestaoConfig;
      st.sugestaoConfig = null;
      st.salvar = { marcado: false, nome: st.config.nome };
      mapearDoZero();
      desenhar();
    });
    var tbody = $("epMapas");
    tbody.addEventListener("change", function (e) {
      var t = e.target;
      var m = mapaPorUid(t.getAttribute("data-usar") || t.getAttribute("data-unid") || t.getAttribute("data-inicio") || t.getAttribute("data-fim"));
      if (!m) return;
      st.mudouMapa = true;
      if (t.hasAttribute("data-usar")) {
        m.usar = t.checked;
        // Marcar uma sugestão (ou um campo para conferir) é a confirmação.
        var conferir = { sugestao: 1, confira: 1, unidade: 1, mudou: 1 };
        if (m.usar && m.nota && conferir[m.nota.tipo]) m.nota = { tipo: "confirmado", titulo: m.nota.titulo };
        atualizarLinhaMapa(m);
        return;
      }
      if (t.hasAttribute("data-unid")) { m.unidade = t.value; if (m.nota && m.nota.tipo === "unidade") { m.nota = { tipo: "titulo", titulo: m.nota.titulo }; } atualizarLinhaMapa(m); return; }
    });
    tbody.addEventListener("input", function (e) {
      var t = e.target;
      var uid = t.getAttribute("data-inicio") || t.getAttribute("data-fim");
      var m = mapaPorUid(uid);
      if (!m) return;
      st.mudouMapa = true;
      if (window.BapellCampos) window.BapellCampos.limpar(t);
      var txt = t.value.trim();
      if (t.hasAttribute("data-inicio")) {
        var a = lerCelula(txt);
        if (!a) return;
        m.inicio = a.ref;
      } else {
        if (txt && !lerCelula(txt)) return;
        m.fim = txt ? lerCelula(txt).ref : "";
      }
      if (m.nota && m.nota.tipo !== "semcampo") m.nota = { tipo: "manual" };
      atualizarLinhaMapa(m);
    });
    tbody.addEventListener("focusout", function (e) {
      var t = e.target;
      if (!t.hasAttribute || !(t.hasAttribute("data-inicio") || t.hasAttribute("data-fim"))) return;
      var c = lerCelula(t.value);
      if (c) t.value = c.ref;
    });
    tbody.addEventListener("click", function (e) {
      var b = e.target.closest("[data-remover]");
      if (!b) return;
      st.mapas = st.mapas.filter(function (m) { return m.uid !== b.getAttribute("data-remover"); });
      st.mudouMapa = true;
      desenharMapas();
    });
    $("epBtnAdd").addEventListener("click", abrirAdicionar);
    $("epAddCancelar").addEventListener("click", fecharAdicionar);
    $("epAddOk").addEventListener("click", confirmarAdicionar);
    $("epAddCampo").addEventListener("change", sugerirCelula);
    ["epAddInicio", "epAddFim"].forEach(function (id) {
      $(id).addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); confirmarAdicionar(); } });
      $(id).addEventListener("input", function () { if (window.BapellCampos) window.BapellCampos.limpar($(id)); });
    });
    corpo.querySelector(".ep-tabela").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.classList.contains("ep-cel")) { e.preventDefault(); e.target.blur(); }
    });
  }

  // ── Adicionar Campo ──
  function abrirAdicionar() {
    var box = $("epAdd");
    box.hidden = false;
    $("epAddCampo").value = "";
    $("epAddInicio").value = "";
    $("epAddFim").value = "";
    $("epAddUnidWrap").hidden = true;
    $("epAddErro").hidden = true;
    $("epAddDica").textContent = "Ex.: para o Preço de Custo na coluna F a partir da linha " + st.inicio + ", informe F" + st.inicio + ". A célula final (F500) limita até onde preencher.";
    $("epBtnAdd").disabled = true;
    setTimeout(function () { try { $("epAddCampo").focus(); } catch (e) {} }, 30);
  }
  function fecharAdicionar() {
    var box = $("epAdd");
    if (!box) return;
    box.hidden = true;
    $("epBtnAdd").disabled = false;
    try { $("epBtnAdd").focus(); } catch (e) {}
  }
  /** Ao escolher o campo: sugere a coluna pelo título (se a planilha tiver). */
  function sugerirCelula() {
    var campo = st.catIdx[$("epAddCampo").value];
    var wrap = $("epAddUnidWrap");
    if (!campo) { wrap.hidden = true; return; }
    if (precisaUnidade(campo)) {
      wrap.hidden = false;
      $("epAddUnid").innerHTML = opcoesUnidade(campo, unidadePadrao(campo));
    } else wrap.hidden = true;
    var sheet = abaAtual();
    var usadas = Object.create(null);
    st.mapas.forEach(function (m) { var c = lerCelula(m.inicio); if (c) usadas[c.ci] = true; });
    var linhaT = st.linhaTitulos || st.inicio - 1;
    var melhor = null;
    if (linhaT >= 1 && sheet) {
      var ext = extensao(sheet);
      for (var ci = 0; ci <= Math.min(ext.ultimaColuna, 300); ci++) {
        if (usadas[ci]) continue;
        var t = textoDe(celula(sheet, colunaDoIndice(ci), linhaT)).trim();
        var n = t ? notaTitulo(t, campo) : 0;
        if (n > 0 && (!melhor || n > melhor.n)) melhor = { ci: ci, n: n, t: t };
      }
    }
    if (melhor) {
      $("epAddInicio").value = refDe(melhor.ci, st.inicio);
      if (precisaUnidade(campo)) {
        var u = unidadeDoTitulo(melhor.t, campo.tipo);
        if (u) $("epAddUnid").value = u;
      }
      $("epAddDica").textContent = "Sugestão pelo título \"" + melhor.t + "\" (coluna " + colunaDoIndice(melhor.ci) + "). Confira antes de adicionar.";
    } else {
      $("epAddInicio").value = "";
      $("epAddDica").textContent = "Informe a célula da 1ª linha de produtos na coluna onde vai " + campo.rotulo + " (ex.: F" + st.inicio + ").";
    }
  }
  function confirmarAdicionar() {
    var erro = $("epAddErro");
    var falha = function (msg, el) {
      erro.hidden = false;
      erro.innerHTML = svg(I.aviso, 16) + "<span>" + msg + "</span>";
      if (el && window.BapellCampos) window.BapellCampos.marcar(el);
    };
    var campo = st.catIdx[$("epAddCampo").value];
    if (!campo) return falha("Escolha o campo do Bapell.", $("epAddCampo"));
    var a = lerCelula($("epAddInicio").value);
    if (!a) return falha("Informe a célula inicial com a letra da coluna e o número da linha (ex.: F" + st.inicio + ").", $("epAddInicio"));
    var fimTxt = $("epAddFim").value.trim();
    var b = fimTxt ? lerCelula(fimTxt) : null;
    if (fimTxt && !b) return falha("Célula final inválida (ex.: " + a.col + (a.linha + 99) + ").", $("epAddFim"));
    if (b && !((b.ci === a.ci && b.linha >= a.linha) || (b.linha === a.linha && b.ci > a.ci))) {
      return falha("A célula final precisa estar na mesma coluna, abaixo da inicial (ex.: " + a.col + (a.linha + 99) + "), ou na mesma linha, à direita.", $("epAddFim"));
    }
    var ocupada = st.mapas.filter(function (m) { var c = lerCelula(m.inicio); return m.usar && c && c.ref === a.ref; })[0];
    if (ocupada) return falha("A célula " + a.ref + " já é de " + esc((st.catIdx[ocupada.campo] || {}).rotulo || ocupada.campo) + ". Escolha outra ou desmarque aquele campo.", $("epAddInicio"));
    var m = mapa(campo.id, a.ref, { fim: b ? b.ref : "", unidade: precisaUnidade(campo) ? $("epAddUnid").value : "", nota: { tipo: "manual" } });
    st.mapas.push(m);
    st.mudouMapa = true;
    fecharAdicionar();
    desenharMapas();
    var tr = $("epMapas").querySelector('tr[data-uid="' + m.uid + '"]');
    if (tr) { tr.classList.add("ep-novo"); try { tr.scrollIntoView({ block: "nearest" }); } catch (e) {} }
  }

  function erroCampos(msgs) {
    var box = $("epErroCampos");
    if (!box) return;
    box.hidden = !msgs.length;
    box.innerHTML = msgs.length ? svg(I.aviso, 16) + "<span>" + msgs.join("<br>") + "</span>" : "";
  }
  function conferirCampos() {
    // Células digitadas e ainda inválidas.
    var invalidas = [];
    $("epMapas").querySelectorAll(".ep-cel").forEach(function (inp) {
      var v = inp.value.trim();
      var ehFim = inp.hasAttribute("data-fim");
      if ((!ehFim && !lerCelula(v)) || (ehFim && v && !lerCelula(v))) {
        var m = mapaPorUid(inp.getAttribute("data-inicio") || inp.getAttribute("data-fim"));
        if (m && m.usar) { invalidas.push(inp); if (window.BapellCampos) window.BapellCampos.marcar(inp); }
      }
    });
    var msgs = [];
    if (invalidas.length) msgs.push("Há células inválidas (marcadas em vermelho): use a letra da coluna e o número da linha, como C2.");
    var g = geometria();
    msgs = msgs.concat(g.erros);
    if (!msgs.length) {
      // Duas linhas marcadas na mesma célula inicial.
      var vistos = Object.create(null);
      g.geo.forEach(function (x) {
        if (vistos[x.a.ref]) msgs.push("Os campos " + esc(vistos[x.a.ref]) + " e " + esc(x.campo.rotulo) + " começam na mesma célula (" + x.a.ref + ").");
        vistos[x.a.ref] = x.campo.rotulo;
      });
    }
    if (msgs.length) { erroCampos(msgs); return; }
    erroCampos([]);
    st.limite = PASSO_LISTA;
    st.passo = 4;
    desenhar();
  }

  // ── 4. Conferência ──
  function desenharConferencia() {
    var nomeArq = nomeDeSaida(st.arq);
    var podeSalvar = !!st.config || st.mudouMapa || st.modelo === "outra";
    if (!st.salvar.nome) st.salvar.nome = st.config ? st.config.nome : String(st.arq.nome).replace(/\.[^.]+$/, "");
    // Tudo dentro de #epConf: os cliques são ouvidos nele (e não no
    // #epCorpo, que fica de uma etapa para outra e acumularia ouvintes).
    $("epCorpo").innerHTML = '<div id="epConf">' +
      '<div class="ep-destino" id="epDestino"></div>' +
      '<div class="ep-existentes" id="epExistentes" hidden></div>' +
      '<div class="ip-bloco ep-opcoes">' +
        '<div class="ip-bloco__tit">Valores zerados</div>' +
        '<div class="ep-radios">' +
          '<label class="ep-radio"><input type="radio" name="epZero" value="vazio"' + (st.zeroVazio ? " checked" : "") + " /> <span>Deixar a célula vazia <small>(recomendado: custo, preço ou medida zerados costumam ser campos não preenchidos)</small></span></label>" +
          '<label class="ep-radio"><input type="radio" name="epZero" value="zero"' + (st.zeroVazio ? "" : " checked") + " /> <span>Escrever 0</span></label>" +
        "</div>" +
      "</div>" +
      '<div class="ep-avisos" id="epAvisos" hidden></div>' +
      '<div class="ip-filtros ep-filtros">' +
        '<input type="search" class="input-field ep-busca" id="epBusca" placeholder="Buscar por nome ou SKU" value="' + esc(st.busca) + '" />' +
        '<span class="ip-filtros__acoes"><button type="button" class="ip-link" data-acao="marcar">Marcar todos</button><button type="button" class="ip-link" data-acao="desmarcar">Desmarcar todos</button></span>' +
      "</div>" +
      '<div class="ip-tabela-wrap"><table class="ip-tabela ep-tabela-prod"><thead id="epProdCab"></thead><tbody id="epProdCorpo"></tbody></table></div>' +
      '<div class="ip-vazio" id="epProdVazio" hidden>Nenhum produto com essa busca.</div>' +
      '<div class="ip-mais" id="epMais" hidden><span id="epMaisTxt"></span><button type="button" class="btn-secondary" data-acao="mais">Mostrar mais</button></div>' +
      (podeSalvar
        ? '<div class="ep-salvar">' +
            '<label class="ep-check"><input type="checkbox" id="epSalvarCfg"' + (st.salvar.marcado ? " checked" : "") + " /> <span>" +
              (st.config ? "Guardar as mudanças na configuração <strong>" + esc(st.config.nome) + "</strong>" : "Salvar esta configuração para a próxima vez, com o nome") + "</span></label>" +
            (st.config ? "" : '<input type="text" class="input-field ep-salvar__nome" id="epSalvarNome" maxlength="60" value="' + esc(st.salvar.nome) + '" aria-label="Nome da configuração" />') +
          "</div>"
        : "") +
      '<div class="ip-erro" id="epErro" hidden></div>' +
      "</div>";
    rodape('<button type="button" class="btn-secondary" data-ep="voltar">' + svg(I.voltar, 15) + " Voltar aos campos</button>",
      '<span class="ip-rodape__info" title="' + esc(nomeArq) + '">Arquivo: <strong>' + esc(nomeArq) + "</strong></span>" +
      '<button type="button" class="btn-primary" id="epExportar">' + svg(I_EXPORTAR, 15) + " Exportar</button>");
    ligarRodape({ voltar: function () { st.passo = 3; desenhar(); } });
    $("epExportar").addEventListener("click", exportar);

    $("epConf").querySelectorAll('input[name="epZero"]').forEach(function (r) {
      r.addEventListener("change", function () { st.zeroVazio = r.value === "vazio" && r.checked ? true : r.value === "zero" && r.checked ? false : st.zeroVazio; atualizarConferencia(); });
    });
    $("epBusca").addEventListener("input", function () { st.busca = $("epBusca").value; st.limite = PASSO_LISTA; desenharProdutos(planejar()); });
    $("epConf").addEventListener("click", function (e) {
      var b = e.target.closest("[data-acao]");
      if (!b) return;
      var acao = b.getAttribute("data-acao");
      if (acao === "mais") { st.limite += PASSO_LISTA; desenharProdutos(planejar()); return; }
      filtrados().forEach(function (p) { if (acao === "marcar") delete st.desmarcados[p.id]; else st.desmarcados[p.id] = true; });
      atualizarConferencia();
    });
    $("epProdCorpo").addEventListener("change", function (e) {
      var cb = e.target.closest("[data-marcar]");
      if (!cb) return;
      if (cb.checked) delete st.desmarcados[cb.getAttribute("data-marcar")]; else st.desmarcados[cb.getAttribute("data-marcar")] = true;
      atualizarConferencia();
    });
    var cfgCb = $("epSalvarCfg");
    if (cfgCb) cfgCb.addEventListener("change", function () { st.salvar.marcado = cfgCb.checked; });
    var cfgNome = $("epSalvarNome");
    if (cfgNome) cfgNome.addEventListener("input", function () { st.salvar.nome = cfgNome.value; if (window.BapellCampos) window.BapellCampos.limpar(cfgNome); });
    atualizarConferencia();
  }

  function filtrados() {
    var q = normTxt(st.busca);
    if (!q) return st.produtos;
    return st.produtos.filter(function (p) { return normTxt(p.name).indexOf(q) >= 0 || normTxt(p.sku).indexOf(q) >= 0; });
  }

  function atualizarConferencia() {
    var plano = planejar();
    var n = plano.produtos.length;
    var verticais = plano.geo.filter(function (x) { return x.dir === "v"; });
    // Destino
    var onde = "";
    if (plano.modo === "sku") onde = "atualizando as linhas pelo SKU";
    else if (verticais.length && n) {
      var de = Math.min.apply(null, verticais.map(function (x) { return x.a.linha; }));
      onde = n === 1 ? "na linha " + de : "nas linhas " + de + " a " + (de + n - 1);
    }
    $("epDestino").innerHTML = svg(I.planilha, 16) + "<span>" + (st.arq.abas.length > 1 || st.arq.tipo !== "csv" ? "Aba <strong>" + esc(st.aba) + "</strong> · " : "") +
      "<strong>" + plural(n, "produto marcado", "produtos marcados") + "</strong> de " + st.produtos.length + " · " +
      plural(plano.geo.length, "campo", "campos") + (onde ? " · " + onde : "") + "</span>";
    // Linhas que já têm dados
    var box = $("epExistentes");
    if (plano.existentes.length) {
      var ex = plano.existentes;
      var faixaTxt = ex.length === 1 ? "na linha " + ex[0] : "em " + ex.length + " linhas (da " + ex[0] + " à " + ex[ex.length - 1] + ")";
      var temSku = plano.geo.some(function (x) { return x.campo.id === "sku" && x.dir === "v"; });
      box.hidden = false;
      box.innerHTML =
        '<div class="ep-existentes__tit">' + svg(I.aviso, 16) + "<span>A planilha já tem dados " + faixaTxt + " nas colunas dos campos. O que fazer com eles?</span></div>" +
        '<div class="ep-modos">' +
          opcaoModo("sku", "Atualizar as linhas pelo SKU",
            temSku ? "Cada produto vai na linha que tem o mesmo SKU." + (st.modo === "sku" ? " " + plural(plano.achados, "produto encontrado", "produtos encontrados") + (plano.naoAchados ? ", " + plural(plano.naoAchados, "não está", "não estão") + " na planilha." : ".") : "")
              : "Precisa do campo SKU marcado numa coluna.", !temSku) +
          opcaoModo("substituir", "Substituir as linhas antigas", "Apaga o conteúdo dessas linhas (inteiras) e escreve os produtos a partir da linha " + (verticais.length ? Math.min.apply(null, verticais.map(function (x) { return x.a.linha; })) : "") + ".") +
          opcaoModo("sobre", "Escrever por cima, sem apagar", "Escreve os produtos a partir da 1ª linha só nas colunas dos campos; o resto das linhas fica como está.") +
        "</div>" +
        (st.modo === "sku" ? '<label class="ep-check ep-check--sub"><input type="checkbox" id="epAddFim"' + (st.addFim ? " checked" : "") + " /> <span>Acrescentar no fim da planilha os produtos que não estão nela</span></label>" : "");
      box.querySelectorAll('input[name="epModo"]').forEach(function (r) {
        r.addEventListener("change", function () { if (r.checked) { st.modo = r.value; atualizarConferencia(); } });
      });
      var af = $("epAddFim");
      if (af) af.addEventListener("change", function () { st.addFim = af.checked; atualizarConferencia(); });
    } else {
      box.hidden = true;
      box.innerHTML = "";
    }
    // Avisos e erros
    var av = $("epAvisos");
    av.hidden = !plano.avisos.length;
    av.innerHTML = plano.avisos.map(function (a) { return '<div class="ep-aviso">' + svg(I.aviso, 14) + "<span>" + a + "</span></div>"; }).join("");
    var erro = $("epErro");
    var errosVis = plano.erros.filter(function (e) { return !/escolha abaixo o que fazer/.test(e); });
    erro.hidden = !errosVis.length;
    erro.innerHTML = errosVis.length ? svg(I.aviso, 16) + "<span>" + errosVis.join("<br>") + "</span>" : "";
    var b = $("epExportar");
    var conta = plano.modo === "sku" ? plano.achados + (st.addFim ? plano.naoAchados : 0) : n;
    b.disabled = !!plano.erros.length || !conta;
    b.innerHTML = svg(I_EXPORTAR, 15) + " " + (conta ? "Exportar " + plural(conta, "produto", "produtos") : "Exportar");
    desenharProdutos(plano);
  }
  function opcaoModo(valor, titulo, desc, desativado) {
    return '<label class="ep-modo' + (st.modo === valor ? " marcado" : "") + (desativado ? " desativado" : "") + '">' +
      '<input type="radio" name="epModo" value="' + valor + '"' + (st.modo === valor ? " checked" : "") + (desativado ? " disabled" : "") + " />" +
      '<span class="ep-modo__txt"><strong>' + titulo + "</strong><small>" + desc + "</small></span></label>";
  }

  function desenharProdutos(plano) {
    var colunas = plano.geo.filter(function (x) { return x.campo.id !== "nome" && x.campo.id !== "sku"; }).slice(0, 4);
    $("epProdCab").innerHTML = "<tr><th class=\"ip-prod__check\"></th><th>Produto</th>" +
      colunas.map(function (x) { return '<th class="' + (x.campo.tipo === "texto" || x.campo.tipo === "codigo" ? "" : "num") + '">' + esc(x.campo.rotulo) + " <small>(" + x.a.col + ")</small></th>"; }).join("") +
      "<th>Vai para</th></tr>";
    var lista = filtrados();
    var vis = lista.slice(0, st.limite);
    $("epProdCorpo").innerHTML = vis.map(function (p) {
      var marcado = !st.desmarcados[p.id];
      var d = plano.destino.get(p.id);
      var vai = !marcado ? '<span class="ip-tag ip-tag--fora">Desmarcado</span>'
        : !d ? '<span class="ip-muda">—</span>'
        : d.tipo === "atualiza" ? '<span class="ip-tag ip-tag--novo">' + (d.linhas.length === 1 ? "Atualiza a linha " + d.linhas[0] : "Atualiza as linhas " + d.linhas.join(", ")) + "</span>"
        : d.tipo === "novo" ? '<span class="ip-tag ip-tag--pulado">Linha nova ' + d.linhas[0] + "</span>"
        : d.tipo === "fora" ? '<span class="ip-tag ip-tag--fora">SKU não está na planilha — fica de fora</span>'
        : d.tipo === "coluna" ? "Coluna " + d.col
        : "Linha " + d.linhas[0];
      return '<tr class="' + (marcado ? "" : "ep-desligado") + '"><td class="ip-prod__check"><input type="checkbox" data-marcar="' + esc(p.id) + '"' + (marcado ? " checked" : "") + ' aria-label="Exportar ' + esc(p.name || p.sku || "") + '" /></td>' +
        '<td class="ip-prod__nome"><div class="ip-prod__titulo">' + (p.name ? esc(p.name) : '<span class="ip-muda">(sem nome)</span>') + '</div><div class="ip-prod__meta">' + (p.sku ? "SKU " + esc(p.sku) : '<span class="ip-aviso-txt">sem SKU</span>') + "</div></td>" +
        colunas.map(function (x) {
          var v = valorParaTela(x.m, p);
          return '<td class="' + (x.campo.tipo === "texto" || x.campo.tipo === "codigo" ? "" : "num") + '">' + (v ? esc(v) : '<span class="ip-muda">vazio</span>') + "</td>";
        }).join("") +
        "<td>" + vai + "</td></tr>";
    }).join("");
    $("epProdVazio").hidden = lista.length > 0;
    var resta = lista.length - vis.length;
    $("epMais").hidden = resta <= 0;
    $("epMaisTxt").textContent = "Mostrando " + fmtNum(vis.length, 0) + " de " + fmtNum(lista.length, 0);
  }

  function salvarConfig() {
    if (!st.salvar.marcado) return null;
    var nome = String(st.config ? st.config.nome : st.salvar.nome || "").trim();
    if (!nome) return null;
    var sheet = abaAtual();
    var mapas = st.mapas.filter(function (m) { return st.catIdx[m.campo] && lerCelula(m.inicio); }).map(function (m) {
      var a = lerCelula(m.inicio);
      var t = tituloAcima(sheet, a.ci, a.linha);
      return { campo: m.campo, inicio: a.ref, fim: m.fim || "", unidade: m.unidade || "", usar: !!m.usar, titulo: t ? t.texto : "" };
    });
    var lista = lerConfigs();
    var agora = Date.now();
    var existente = st.config ? lista.filter(function (c) { return c.id === st.config.id; })[0]
      : lista.filter(function (c) { return normTxt(c.nome) === normTxt(nome); })[0];
    var cfg = existente || { id: "exp_" + agora.toString(36) + Math.random().toString(36).slice(2, 7), criadoEm: agora };
    Object.assign(cfg, { nome: nome, base: st.modelo, aba: st.aba, inicio: st.inicio, linhaTitulos: st.linhaTitulos, zeroVazio: st.zeroVazio, mapas: mapas, atualizadoEm: agora });
    if (!existente) lista.push(cfg);
    return gravarConfigs(lista) ? cfg : null;
  }

  function exportar() {
    if (!st || st.gerando) return;
    var plano = planejar();
    if (plano.erros.length) { atualizarConferencia(); return; }
    var nomeInp = $("epSalvarNome");
    if (st.salvar.marcado && !st.config && !String(st.salvar.nome || "").trim()) {
      if (nomeInp && window.BapellCampos) window.BapellCampos.marcar(nomeInp);
      aviso("Dê um nome à configuração ou desmarque Salvar.", "warning");
      return;
    }
    st.gerando = true;
    var b = $("epExportar");
    b.disabled = true;
    b.textContent = "Gerando a planilha…";
    plano.aba = st.aba;
    var gerar = st.arq.tipo === "xlsx" ? gerarXlsx : st.arq.tipo === "csv" ? gerarCsv : gerarXls;
    var nome = nomeDeSaida(st.arq);
    Promise.resolve().then(function () { return gerar(st.arq, plano); }).then(function (blob) {
      baixar(blob, nome);
      var cfg = salvarConfig();
      var qtd = plano.modo === "sku" ? plano.achados + (st.addFim ? plano.naoAchados : 0) : plano.produtos.length;
      var resumo = {
        nome: nome, produtos: qtd, campos: plano.geo.length, aba: st.aba, modo: plano.modo,
        foraSku: plano.modo === "sku" && !st.addFim ? plano.naoAchados : 0, limpas: plano.limpar.length, config: cfg ? cfg.nome : "",
      };
      st.gerando = false;
      fechar();
      try { document.dispatchEvent(new CustomEvent("bapell:produtos-exportados", { detail: resumo })); } catch (e) {}
      var html = "<ul class=\"ip-resultado\">" +
        "<li><strong>" + esc(nome) + "</strong></li>" +
        "<li>" + plural(resumo.produtos, "produto", "produtos") + " · " + plural(resumo.campos, "campo", "campos") + (resumo.aba ? " · aba " + esc(resumo.aba) : "") + "</li>" +
        (resumo.modo === "sku" ? "<li>Linhas atualizadas pelo SKU" + (resumo.foraSku ? "; " + plural(resumo.foraSku, "produto ficou de fora", "produtos ficaram de fora") + " (SKU que não está na planilha)" : "") + "</li>" : "") +
        (resumo.limpas ? "<li>" + plural(resumo.limpas, "linha antiga apagada", "linhas antigas apagadas") + " antes de escrever</li>" : "") +
        (resumo.config ? "<li>Configuração <strong>" + esc(resumo.config) + "</strong> salva</li>" : "") +
        "</ul>Confira o arquivo antes de enviar para a plataforma.";
      if (window.BapellModal) window.BapellModal.avisar({ tipo: "sucesso", titulo: "Planilha gerada", html: html, botao: "Ok" });
      else aviso("Planilha gerada: " + nome, "success", 6000);
    }).catch(function (e) {
      registrarErro("gerar a planilha", e);
      if (st) {
        st.gerando = false;
        atualizarConferencia();
      }
      aviso("Não foi possível gerar a planilha: " + (e && e.message ? e.message : "erro desconhecido") + ".", "error", 7000);
    });
  }

  // ─────────────────────────────────────────────
  //  ENTRADA
  // ─────────────────────────────────────────────
  // O item do menu Opções Em Massa. Em captura: o menu não deixa o clique
  // subir até o documento.
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("#btnExportarPlanilha, [data-exportar-planilha]") : null;
    if (!b) return;
    e.preventDefault();
    var menu = $("massaMenu");
    if (menu) menu.style.display = "none";
    abrir(typeof getParam === "function" ? getParam("p") : null);
  }, true);

  window.BapellExportarProdutos = {
    abrir: abrir,
    _interno: { lerCelula: lerCelula, notaTitulo: notaTitulo, normTitulo: normTitulo, lerCsv: lerCsv, reconhecerTitulos: reconhecerTitulos,
      unidadeDoTitulo: unidadeDoTitulo, codificar1252: codificar1252 },
  };
})();

// ═══════════════════════════════════════════════════════════════════
//  Bapell Gestor Pro — Central de Cálculos
//  LOTE 2: FINANCEIRO, MARGENS, LUCROS E METAS
//
//  Este arquivo contém SOMENTE as definições das calculadoras deste lote.
//  Quem renderiza, busca, calcula e guarda favoritos/histórico é o motor,
//  em JS/calculos.js. Aqui não existe motor nem lógica de interface.
//
//  ── COMO REGISTRAR ─────────────────────────────────────────────────
//  O motor expõe window.CentralCalculos. Este arquivo apenas chama
//  .registrar([...]) passando os objetos. A ordem de carregamento está
//  definida no calculos.html: o motor primeiro, os lotes depois, e a
//  interface só é montada no DOMContentLoaded — quando todos os lotes
//  já se registraram.
//
//  ── FORMATO DE UMA CALCULADORA ─────────────────────────────────────
//    id      identificador único e PERMANENTE (favoritos e histórico
//            gravam este id; mudar quebra os dados do usuário)
//    cat     categoria exibida no menu
//    nome    título
//    desc    descrição curta
//    chaves  (opcional) palavras-chave extras para a busca
//    campos  lista criada com campo(id, label, tipo)
//            tipos: "money" (R$), "percent" (%), "number", "integer"
//    calc    função que devolve:
//              { principal: {label, valor}, linhas: [{label, valor}],
//                resultadoBruto, obs? }
//    explica texto da fórmula usada
//
//  Os auxiliares campo(), val(), brl(), pct() e num() vêm do motor —
//  não os redefina aqui.
// ═══════════════════════════════════════════════════════════════════

(function () {
  "use strict";

  var API = window.CentralCalculos;
  if (!API) {
    console.error("[Calculos/lote2_financeiro.js] Motor nao encontrado. " +
      "Verifique se JS/calculos.js e carregado ANTES deste arquivo no calculos.html.");
    return;
  }

  var campo = API.campo, val = API.val, brl = API.brl, pct = API.pct, num = API.num;

  API.registrar([
    // ---------- FINANCEIRO ----------
  // ───────── FINANCEIRO ─────────
      {
        id: "margem-lucro", cat: "Financeiro", nome: "Margem de Lucro",
        desc: "Descubra o percentual de lucro sobre o preço de venda.",
        campos: [campo("custo", "Custo do produto", "money"), campo("venda", "Preço de venda", "money")],
        calc: function () {
          var c = val("custo"), v = val("venda");
          var lucro = v - c;
          var margem = v > 0 ? (lucro / v) * 100 : 0;
          return {
            principal: { label: "Margem de lucro", valor: pct(margem) },
            linhas: [
              { label: "Lucro por unidade", valor: brl(lucro) },
              { label: "Custo", valor: brl(c) },
              { label: "Venda", valor: brl(v) },
            ],
            resultadoBruto: margem,
          };
        },
        explica: "Margem = (Preço de venda − Custo) ÷ Preço de venda × 100. Mede quanto do preço final é lucro.",
      },
  {
        id: "markup", cat: "Financeiro", nome: "Markup",
        desc: "Calcule o preço de venda aplicando um markup sobre o custo.",
        campos: [campo("custo", "Custo do produto", "money"), campo("markup", "Markup desejado", "percent")],
        calc: function () {
          var c = val("custo"), m = val("markup");
          var venda = c * (1 + m / 100);
          return {
            principal: { label: "Preço de venda", valor: brl(venda) },
            linhas: [
              { label: "Lucro (markup)", valor: brl(venda - c) },
              { label: "Custo", valor: brl(c) },
            ],
            resultadoBruto: venda,
          };
        },
        explica: "Preço = Custo × (1 + Markup ÷ 100). O markup é aplicado sobre o custo, diferente da margem (sobre a venda).",
      },
  {
        id: "lucro-liquido", cat: "Financeiro", nome: "Lucro Líquido",
        desc: "Receita menos custos, despesas e impostos.",
        campos: [
          campo("receita", "Receita total", "money"),
          campo("custos", "Custos (CMV)", "money"),
          campo("despesas", "Despesas", "money"),
          campo("impostos", "Impostos", "money"),
        ],
        calc: function () {
          var r = val("receita"), c = val("custos"), d = val("despesas"), i = val("impostos");
          var liq = r - c - d - i;
          var margem = r > 0 ? (liq / r) * 100 : 0;
          return {
            principal: { label: "Lucro líquido", valor: brl(liq) },
            linhas: [
              { label: "Margem líquida", valor: pct(margem) },
              { label: "Receita", valor: brl(r) },
              { label: "Total de saídas", valor: brl(c + d + i) },
            ],
            resultadoBruto: liq,
          };
        },
        explica: "Lucro líquido = Receita − Custos − Despesas − Impostos.",
      },
  {
        id: "roi", cat: "Financeiro", nome: "ROI (Retorno sobre Investimento)",
        desc: "Quanto você ganhou em relação ao que investiu.",
        campos: [campo("ganho", "Ganho obtido", "money"), campo("investido", "Valor investido", "money")],
        calc: function () {
          var g = val("ganho"), inv = val("investido");
          var lucro = g - inv;
          var roi = inv > 0 ? (lucro / inv) * 100 : 0;
          return {
            principal: { label: "ROI", valor: pct(roi) },
            linhas: [{ label: "Lucro", valor: brl(lucro) }, { label: "Investido", valor: brl(inv) }],
            resultadoBruto: roi,
          };
        },
        explica: "ROI = (Ganho − Investimento) ÷ Investimento × 100.",
      },
  {
        id: "roas", cat: "Financeiro", nome: "ROAS (Retorno sobre Anúncios)",
        desc: "Receita gerada para cada real gasto em anúncios.",
        campos: [campo("receita", "Receita com anúncios", "money"), campo("gasto", "Gasto em anúncios", "money")],
        calc: function () {
          var r = val("receita"), g = val("gasto");
          var roas = g > 0 ? r / g : 0;
          return {
            principal: { label: "ROAS", valor: num(roas) + "x" },
            linhas: [
              { label: "Para cada R$ 1 investido", valor: brl(roas) + " de retorno" },
              { label: "Lucro sobre o anúncio", valor: brl(r - g) },
            ],
            resultadoBruto: roas,
          };
        },
        explica: "ROAS = Receita ÷ Gasto com anúncios. Acima de 1 significa que o anúncio se pagou.",
      },
  {
        id: "ponto-equilibrio", cat: "Financeiro", nome: "Ponto de Equilíbrio",
        desc: "Quantas unidades vender para cobrir os custos.",
        campos: [
          campo("fixos", "Custos fixos totais", "money"),
          campo("preco", "Preço de venda unitário", "money"),
          campo("varunit", "Custo variável unitário", "money"),
        ],
        calc: function () {
          var f = val("fixos"), p = val("preco"), cv = val("varunit");
          var margContrib = p - cv;
          var unidades = margContrib > 0 ? f / margContrib : 0;
          return {
            principal: { label: "Ponto de equilíbrio", valor: num(Math.ceil(unidades), 0) + " unidades" },
            linhas: [
              { label: "Margem de contribuição", valor: brl(margContrib) },
              { label: "Faturamento no equilíbrio", valor: brl(Math.ceil(unidades) * p) },
            ],
            resultadoBruto: unidades,
          };
        },
        explica: "Unidades = Custos fixos ÷ (Preço − Custo variável unitário). É quanto vender para não ter prejuízo.",
      },
  {
        id: "ticket-medio", cat: "Financeiro", nome: "Ticket Médio",
        desc: "Valor médio por venda.",
        campos: [campo("faturamento", "Faturamento total", "money"), campo("vendas", "Número de vendas", "integer")],
        calc: function () {
          var f = val("faturamento"), v = val("vendas");
          var ticket = v > 0 ? f / v : 0;
          return {
            principal: { label: "Ticket médio", valor: brl(ticket) },
            linhas: [{ label: "Faturamento", valor: brl(f) }, { label: "Vendas", valor: num(v, 0) }],
            resultadoBruto: ticket,
          };
        },
        explica: "Ticket médio = Faturamento ÷ Número de vendas.",
      },
  {
        id: "cmv", cat: "Financeiro", nome: "CMV (Custo da Mercadoria Vendida)",
        desc: "Custo total das mercadorias que você vendeu.",
        campos: [
          campo("inicial", "Estoque inicial", "money"),
          campo("compras", "Compras no período", "money"),
          campo("final", "Estoque final", "money"),
        ],
        calc: function () {
          var ei = val("inicial"), c = val("compras"), ef = val("final");
          var cmv = ei + c - ef;
          return {
            principal: { label: "CMV", valor: brl(cmv) },
            linhas: [{ label: "Estoque inicial + compras", valor: brl(ei + c) }, { label: "Estoque final", valor: brl(ef) }],
            resultadoBruto: cmv,
          };
        },
        explica: "CMV = Estoque inicial + Compras − Estoque final.",
      },
    // ---------- CONVERSÕES ----------
  // ───────── MARGENS / CONVERSÕES ─────────
      {
        id: "margem-para-markup", cat: "Conversões", nome: "Margem → Markup",
        desc: "Converta um percentual de margem no markup equivalente.",
        campos: [campo("margem", "Margem (%)", "percent")],
        calc: function () {
          var m = val("margem");
          var markup = m < 100 && m >= 0 ? (m / (100 - m)) * 100 : 0;
          return {
            principal: { label: "Markup equivalente", valor: pct(markup) },
            linhas: [{ label: "Margem informada", valor: pct(m) }],
            resultadoBruto: markup,
            obs: m >= 100 ? "Margem deve ser menor que 100%." : "",
          };
        },
        explica: "Markup = Margem ÷ (100 − Margem) × 100.",
      },
  {
        id: "desconto", cat: "Conversões", nome: "Desconto",
        desc: "Preço final após aplicar um desconto.",
        campos: [campo("valor", "Valor original", "money"), campo("desc", "Desconto (%)", "percent")],
        calc: function () {
          var v = val("valor"), d = val("desc");
          var final = v * (1 - d / 100);
          return {
            principal: { label: "Valor com desconto", valor: brl(final) },
            linhas: [{ label: "Você economiza", valor: brl(v - final) }],
            resultadoBruto: final,
          };
        },
        explica: "Final = Valor × (1 − Desconto ÷ 100).",
      },
  {
        id: "acrescimo", cat: "Conversões", nome: "Acréscimo",
        desc: "Preço final após aplicar um acréscimo.",
        campos: [campo("valor", "Valor original", "money"), campo("acr", "Acréscimo (%)", "percent")],
        calc: function () {
          var v = val("valor"), a = val("acr");
          var final = v * (1 + a / 100);
          return {
            principal: { label: "Valor com acréscimo", valor: brl(final) },
            linhas: [{ label: "Acréscimo em R$", valor: brl(final - v) }],
            resultadoBruto: final,
          };
        },
        explica: "Final = Valor × (1 + Acréscimo ÷ 100).",
      },
  {
        id: "porcentagem", cat: "Conversões", nome: "Porcentagem de um Valor",
        desc: "Quanto é X% de um valor.",
        campos: [campo("perc", "Percentual (%)", "percent"), campo("valor", "Sobre o valor", "money")],
        calc: function () {
          var p = val("perc"), v = val("valor");
          var r = v * (p / 100);
          return {
            principal: { label: pct(p) + " de " + brl(v), valor: brl(r) },
            linhas: [],
            resultadoBruto: r,
          };
        },
        explica: "Resultado = Valor × (Percentual ÷ 100).",
      },
  {
        id: "diferenca-percentual", cat: "Conversões", nome: "Diferença Percentual",
        desc: "Variação percentual entre dois valores.",
        campos: [campo("de", "De (valor inicial)", "money"), campo("para", "Para (valor final)", "money")],
        calc: function () {
          var a = val("de"), b = val("para");
          var dif = a > 0 ? ((b - a) / a) * 100 : 0;
          return {
            principal: { label: "Variação", valor: pct(dif) },
            linhas: [{ label: "Diferença em R$", valor: brl(b - a) }],
            resultadoBruto: dif,
            obs: dif >= 0 ? "Aumento." : "Redução.",
          };
        },
        explica: "Variação = (Final − Inicial) ÷ Inicial × 100.",
      },
  {
        id: "regra-de-tres", cat: "Conversões", nome: "Regra de Três Simples",
        desc: "Se A está para B, X está para quanto?",
        campos: [
          campo("a", "Se este valor (A)", "number"),
          campo("b", "corresponde a (B)", "number"),
          campo("x", "então este valor (X)", "number"),
        ],
        calc: function () {
          var a = val("a"), b = val("b"), x = val("x");
          var r = a > 0 ? (b * x) / a : 0;
          return {
            principal: { label: "Corresponde a", valor: num(r) },
            linhas: [{ label: "Proporção", valor: num(a) + " : " + num(b) }],
            resultadoBruto: r,
          };
        },
        explica: "X_resultado = (B × X) ÷ A. Regra de três direta.",
      },
    // ---------- MARGENS E LUCRO ----------
    {
      id: "margem-bruta", cat: "Financeiro", nome: "Margem Bruta",
      desc: "Receita menos o custo das mercadorias, em percentual.",
      chaves: ["margem bruta", "CMV", "lucro bruto"],
      campos: [campo("mb_rec", "Receita", "money"), campo("mb_cmv", "Custo das mercadorias (CMV)", "money")],
      calc: function () {
        var r = val("mb_rec"), c = val("mb_cmv");
        var bruto = r - c, m = r > 0 ? bruto / r * 100 : 0;
        return {
          principal: { label: "Margem bruta", valor: pct(m) },
          linhas: [{ label: "Lucro bruto", valor: brl(bruto) }, { label: "Receita", valor: brl(r) }, { label: "CMV", valor: brl(c) }],
          resultadoBruto: m,
        };
      },
      explica: "Margem bruta = (Receita − CMV) ÷ Receita × 100. Não considera despesas operacionais.",
    },
    {
      id: "margem-liquida", cat: "Financeiro", nome: "Margem Líquida",
      desc: "O que sobra depois de tudo, em percentual da receita.",
      chaves: ["margem líquida", "lucro líquido", "resultado"],
      campos: [campo("mln_rec", "Receita", "money"), campo("mln_lucro", "Lucro líquido", "money")],
      calc: function () {
        var r = val("mln_rec"), l = val("mln_lucro");
        var m = r > 0 ? l / r * 100 : 0;
        return {
          principal: { label: "Margem líquida", valor: pct(m) },
          linhas: [{ label: "Lucro líquido", valor: brl(l) }, { label: "Receita", valor: brl(r) }],
          resultadoBruto: m,
        };
      },
      explica: "Margem líquida = Lucro líquido ÷ Receita × 100.",
    },
    {
      id: "margem-contribuicao", cat: "Financeiro", nome: "Margem de Contribuição",
      desc: "Quanto cada venda contribui para pagar os custos fixos.",
      chaves: ["margem de contribuição", "custo variável", "contribuição"],
      campos: [campo("mc_preco", "Preço de venda", "money"), campo("mc_var", "Custo variável por unidade", "money")],
      calc: function () {
        var p = val("mc_preco"), v = val("mc_var");
        var mc = p - v, pctMc = p > 0 ? mc / p * 100 : 0;
        return {
          principal: { label: "Margem de contribuição", valor: brl(mc) },
          linhas: [{ label: "Em percentual", valor: pct(pctMc) }, { label: "Preço", valor: brl(p) }, { label: "Custo variável", valor: brl(v) }],
          resultadoBruto: mc,
        };
      },
      explica: "Margem de contribuição = Preço − Custo variável. É o que sobra para cobrir os custos fixos e gerar lucro.",
    },
    {
      id: "lucro-sobre-custo", cat: "Financeiro", nome: "Lucro sobre o Custo",
      desc: "Percentual de lucro calculado em cima do custo (markup).",
      chaves: ["lucro sobre custo", "markup", "remarcação"],
      campos: [campo("lsc_custo", "Custo", "money"), campo("lsc_venda", "Preço de venda", "money")],
      calc: function () {
        var c = val("lsc_custo"), v = val("lsc_venda");
        var l = v - c, p = c > 0 ? l / c * 100 : 0;
        return {
          principal: { label: "Lucro sobre o custo", valor: pct(p) },
          linhas: [
            { label: "Lucro", valor: brl(l) },
            { label: "Lucro sobre a venda (margem)", valor: pct(v > 0 ? l / v * 100 : 0) },
          ],
          obs: "Este é o markup. Não confunda com margem, que divide pelo preço de venda.",
          resultadoBruto: p,
        };
      },
      explica: "Lucro sobre o custo = (Venda − Custo) ÷ Custo × 100.",
    },
    // ---------- PONTO DE EQUILÍBRIO ----------
    {
      id: "pe-contabil", cat: "Financeiro", nome: "Ponto de Equilíbrio Contábil",
      desc: "Quantas unidades vender para o lucro ser zero.",
      chaves: ["ponto de equilíbrio", "break even", "empatar", "contábil"],
      campos: [
        campo("pec_fixo", "Custos fixos do período", "money"),
        campo("pec_preco", "Preço de venda por unidade", "money"),
        campo("pec_var", "Custo variável por unidade", "money"),
      ],
      calc: function () {
        var f = val("pec_fixo"), mc = val("pec_preco") - val("pec_var");
        if (mc <= 0) return { principal: { label: "Ponto de equilíbrio", valor: "—" }, linhas: [], obs: "O preço precisa ser maior que o custo variável, senão nenhuma quantidade cobre os custos fixos.", resultadoBruto: 0 };
        var q = f / mc;
        return {
          principal: { label: "Unidades para empatar", valor: num(Math.ceil(q), 0) },
          linhas: [
            { label: "Margem de contribuição", valor: brl(mc) },
            { label: "Faturamento no equilíbrio", valor: brl(Math.ceil(q) * val("pec_preco")) },
            { label: "Cálculo exato", valor: num(q) },
          ],
          resultadoBruto: Math.ceil(q),
        };
      },
      explica: "Quantidade = Custos fixos ÷ (Preço − Custo variável).",
    },
    {
      id: "pe-financeiro", cat: "Financeiro", nome: "Ponto de Equilíbrio Financeiro",
      desc: "Como o contábil, mas ignorando despesas que não saem do caixa.",
      chaves: ["ponto de equilíbrio financeiro", "caixa", "depreciação"],
      campos: [
        campo("pef_fixo", "Custos fixos do período", "money"),
        campo("pef_naocaixa", "Despesas que não saem do caixa (depreciação)", "money"),
        campo("pef_preco", "Preço por unidade", "money"),
        campo("pef_var", "Custo variável por unidade", "money"),
      ],
      calc: function () {
        var f = val("pef_fixo") - val("pef_naocaixa"), mc = val("pef_preco") - val("pef_var");
        if (mc <= 0) return { principal: { label: "Ponto de equilíbrio", valor: "—" }, linhas: [], obs: "O preço precisa ser maior que o custo variável.", resultadoBruto: 0 };
        var q = f / mc;
        return {
          principal: { label: "Unidades para empatar no caixa", valor: num(Math.max(0, Math.ceil(q)), 0) },
          linhas: [
            { label: "Custos fixos em caixa", valor: brl(f) },
            { label: "Margem de contribuição", valor: brl(mc) },
          ],
          resultadoBruto: Math.max(0, Math.ceil(q)),
        };
      },
      explica: "Quantidade = (Custos fixos − Despesas não desembolsáveis) ÷ Margem de contribuição.",
    },
    {
      id: "pe-economico", cat: "Financeiro", nome: "Ponto de Equilíbrio Econômico",
      desc: "Quantidade que cobre os custos e ainda entrega o lucro desejado.",
      chaves: ["ponto de equilíbrio econômico", "lucro mínimo", "custo de oportunidade"],
      campos: [
        campo("pee_fixo", "Custos fixos do período", "money"),
        campo("pee_lucro", "Lucro desejado no período", "money"),
        campo("pee_preco", "Preço por unidade", "money"),
        campo("pee_var", "Custo variável por unidade", "money"),
      ],
      calc: function () {
        var f = val("pee_fixo") + val("pee_lucro"), mc = val("pee_preco") - val("pee_var");
        if (mc <= 0) return { principal: { label: "Ponto de equilíbrio", valor: "—" }, linhas: [], obs: "O preço precisa ser maior que o custo variável.", resultadoBruto: 0 };
        var q = f / mc;
        return {
          principal: { label: "Unidades necessárias", valor: num(Math.ceil(q), 0) },
          linhas: [
            { label: "Total a cobrir", valor: brl(f) },
            { label: "Faturamento necessário", valor: brl(Math.ceil(q) * val("pee_preco")) },
          ],
          resultadoBruto: Math.ceil(q),
        };
      },
      explica: "Quantidade = (Custos fixos + Lucro desejado) ÷ Margem de contribuição.",
    },
    // ---------- INDICADORES ----------
    {
      id: "cac", cat: "Financeiro", nome: "CAC (Custo de Aquisição de Cliente)",
      desc: "Quanto custa conquistar um cliente novo.",
      chaves: ["CAC", "aquisição", "marketing", "custo por cliente"],
      campos: [
        campo("cac_inv", "Investimento em marketing e vendas", "money"),
        campo("cac_cli", "Clientes novos conquistados", "integer"),
      ],
      calc: function () {
        var i = val("cac_inv"), c = val("cac_cli");
        if (c <= 0) return { principal: { label: "CAC", valor: "—" }, linhas: [], obs: "Informe a quantidade de clientes conquistados.", resultadoBruto: 0 };
        var cac = i / c;
        return {
          principal: { label: "CAC", valor: brl(cac) },
          linhas: [{ label: "Investimento", valor: brl(i) }, { label: "Clientes", valor: num(c, 0) }],
          resultadoBruto: cac,
        };
      },
      explica: "CAC = Investimento em marketing e vendas ÷ Número de clientes novos.",
    },
    {
      id: "ltv", cat: "Financeiro", nome: "LTV (Valor do Cliente no Tempo)",
      desc: "Quanto um cliente deixa de lucro ao longo do relacionamento.",
      chaves: ["LTV", "lifetime value", "valor do cliente"],
      campos: [
        campo("ltv_ticket", "Ticket médio", "money"),
        campo("ltv_freq", "Compras por ano", "number"),
        campo("ltv_anos", "Anos de relacionamento", "number"),
        campo("ltv_margem", "Margem de lucro", "percent"),
      ],
      calc: function () {
        var v = val("ltv_ticket") * val("ltv_freq") * val("ltv_anos");
        var ltv = v * val("ltv_margem") / 100;
        return {
          principal: { label: "LTV", valor: brl(ltv) },
          linhas: [{ label: "Receita total do cliente", valor: brl(v) }, { label: "Margem aplicada", valor: pct(val("ltv_margem")) }],
          resultadoBruto: ltv,
        };
      },
      explica: "LTV = Ticket médio × Compras por ano × Anos × Margem ÷ 100.",
    },
    {
      id: "ltv-cac", cat: "Financeiro", nome: "Relação LTV / CAC",
      desc: "Se vale a pena o que você gasta para conquistar clientes.",
      chaves: ["LTV CAC", "relação", "saúde", "aquisição"],
      campos: [campo("lc_ltv", "LTV", "money"), campo("lc_cac", "CAC", "money")],
      calc: function () {
        var l = val("lc_ltv"), c = val("lc_cac");
        if (c <= 0) return { principal: { label: "LTV / CAC", valor: "—" }, linhas: [], obs: "Informe um CAC maior que zero.", resultadoBruto: 0 };
        var r = l / c;
        return {
          principal: { label: "LTV / CAC", valor: num(r) + "x" },
          linhas: [{ label: "LTV", valor: brl(l) }, { label: "CAC", valor: brl(c) }, { label: "Lucro por cliente", valor: brl(l - c) }],
          obs: r < 1 ? "Abaixo de 1x você gasta mais para conquistar do que o cliente devolve." : null,
          resultadoBruto: r,
        };
      },
      explica: "Relação = LTV ÷ CAC. Quanto maior, melhor o retorno do investimento em aquisição.",
    },
    {
      id: "rentabilidade", cat: "Financeiro", nome: "Rentabilidade",
      desc: "Lucro em relação ao capital investido no negócio.",
      chaves: ["rentabilidade", "retorno", "capital"],
      campos: [campo("rent_lucro", "Lucro do período", "money"), campo("rent_cap", "Capital investido", "money")],
      calc: function () {
        var l = val("rent_lucro"), c = val("rent_cap");
        if (c <= 0) return { principal: { label: "Rentabilidade", valor: "—" }, linhas: [], obs: "Informe o capital investido.", resultadoBruto: 0 };
        var r = l / c * 100;
        return {
          principal: { label: "Rentabilidade", valor: pct(r) },
          linhas: [{ label: "Lucro", valor: brl(l) }, { label: "Capital", valor: brl(c) }],
          resultadoBruto: r,
        };
      },
      explica: "Rentabilidade = Lucro ÷ Capital investido × 100.",
    },
    {
      id: "payback", cat: "Financeiro", nome: "Payback Simples",
      desc: "Em quanto tempo o investimento se paga.",
      chaves: ["payback", "retorno", "tempo", "investimento"],
      campos: [campo("pb_inv", "Investimento", "money"), campo("pb_mes", "Retorno por mês", "money")],
      calc: function () {
        var i = val("pb_inv"), m = val("pb_mes");
        if (m <= 0) return { principal: { label: "Payback", valor: "—" }, linhas: [], obs: "O retorno mensal precisa ser maior que zero.", resultadoBruto: 0 };
        var meses = i / m;
        return {
          principal: { label: "Payback", valor: num(meses, 1) + " meses" },
          linhas: [
            { label: "Em anos", valor: num(meses / 12, 1) },
            { label: "Arredondado", valor: num(Math.ceil(meses), 0) + " meses" },
          ],
          resultadoBruto: meses,
        };
      },
      explica: "Payback = Investimento ÷ Retorno mensal. Não considera juros nem inflação.",
    },
    // ---------- CUSTOS ----------
    {
      id: "custo-unitario", cat: "Financeiro", nome: "Custo Unitário",
      desc: "Custo de cada unidade a partir do total.",
      chaves: ["custo unitário", "por unidade", "rateio"],
      campos: [campo("cu_total", "Custo total", "money"), campo("cu_qtd", "Quantidade", "integer")],
      calc: function () {
        var t = val("cu_total"), q = val("cu_qtd");
        if (q <= 0) return { principal: { label: "Custo unitário", valor: "—" }, linhas: [], obs: "Informe uma quantidade maior que zero.", resultadoBruto: 0 };
        var c = t / q;
        return {
          principal: { label: "Custo unitário", valor: brl(c) },
          linhas: [{ label: "Custo total", valor: brl(t) }, { label: "Quantidade", valor: num(q, 0) }],
          resultadoBruto: c,
        };
      },
      explica: "Custo unitário = Custo total ÷ Quantidade.",
    },
    {
      id: "custo-total-fv", cat: "Financeiro", nome: "Custo Total (fixo + variável)",
      desc: "Soma dos custos fixos com os variáveis de um período.",
      chaves: ["custo total", "custo fixo", "custo variável"],
      campos: [
        campo("ctf_fixo", "Custos fixos", "money"),
        campo("ctf_var", "Custo variável por unidade", "money"),
        campo("ctf_qtd", "Quantidade produzida ou vendida", "integer"),
      ],
      calc: function () {
        var f = val("ctf_fixo"), v = val("ctf_var"), q = val("ctf_qtd");
        var varTotal = v * q, total = f + varTotal;
        return {
          principal: { label: "Custo total", valor: brl(total) },
          linhas: [
            { label: "Custos fixos", valor: brl(f) },
            { label: "Custos variáveis", valor: brl(varTotal) },
            { label: "Custo por unidade", valor: q > 0 ? brl(total / q) : "—" },
          ],
          resultadoBruto: total,
        };
      },
      explica: "Custo total = Custos fixos + (Custo variável × Quantidade).",
    },
    {
      id: "custo-medio", cat: "Financeiro", nome: "Custo Médio Ponderado",
      desc: "Custo médio de duas compras do mesmo item com preços diferentes.",
      chaves: ["custo médio", "ponderado", "estoque", "média"],
      campos: [
        campo("cmp_q1", "Quantidade — compra 1", "number"),
        campo("cmp_v1", "Custo unitário — compra 1", "money"),
        campo("cmp_q2", "Quantidade — compra 2", "number"),
        campo("cmp_v2", "Custo unitário — compra 2", "money"),
      ],
      calc: function () {
        var q1 = val("cmp_q1"), q2 = val("cmp_q2");
        var total = q1 * val("cmp_v1") + q2 * val("cmp_v2"), qt = q1 + q2;
        if (qt <= 0) return { principal: { label: "Custo médio", valor: "—" }, linhas: [], obs: "Informe ao menos uma quantidade.", resultadoBruto: 0 };
        var m = total / qt;
        return {
          principal: { label: "Custo médio", valor: brl(m) },
          linhas: [{ label: "Valor total", valor: brl(total) }, { label: "Quantidade total", valor: num(qt) }],
          resultadoBruto: m,
        };
      },
      explica: "Custo médio = (Q1 × V1 + Q2 × V2) ÷ (Q1 + Q2). É a média ponderada pelas quantidades.",
    },
    // ---------- RECEITA E METAS ----------
    {
      id: "receita-liquida", cat: "Financeiro", nome: "Receita Líquida",
      desc: "Receita bruta menos devoluções, descontos e impostos.",
      chaves: ["receita líquida", "receita bruta", "deduções"],
      campos: [
        campo("rl_bruta", "Receita bruta", "money"),
        campo("rl_dev", "Devoluções e cancelamentos", "money"),
        campo("rl_desc", "Descontos concedidos", "money"),
        campo("rl_imp", "Impostos sobre venda", "money"),
      ],
      calc: function () {
        var b = val("rl_bruta");
        var ded = val("rl_dev") + val("rl_desc") + val("rl_imp");
        var liq = b - ded;
        return {
          principal: { label: "Receita líquida", valor: brl(liq) },
          linhas: [
            { label: "Receita bruta", valor: brl(b) },
            { label: "Total de deduções", valor: brl(ded) },
            { label: "Deduções sobre a bruta", valor: pct(b > 0 ? ded / b * 100 : 0) },
          ],
          resultadoBruto: liq,
        };
      },
      explica: "Receita líquida = Receita bruta − Devoluções − Descontos − Impostos sobre venda.",
    },
    {
      id: "meta-faturamento-margem", cat: "Financeiro", nome: "Faturamento para um Lucro Alvo",
      desc: "Quanto faturar para atingir determinado lucro, dada a margem.",
      chaves: ["meta de faturamento", "lucro alvo", "quanto faturar"],
      campos: [campo("mfm_lucro", "Lucro desejado", "money"), campo("mfm_margem", "Margem líquida média", "percent")],
      calc: function () {
        var l = val("mfm_lucro"), m = val("mfm_margem");
        if (m <= 0) return { principal: { label: "Faturamento necessário", valor: "—" }, linhas: [], obs: "A margem precisa ser maior que zero.", resultadoBruto: 0 };
        var f = l / (m / 100);
        return {
          principal: { label: "Faturamento necessário", valor: brl(f) },
          linhas: [
            { label: "Lucro desejado", valor: brl(l) },
            { label: "Por mês (12 meses)", valor: brl(f / 12) },
          ],
          resultadoBruto: f,
        };
      },
      explica: "Faturamento = Lucro desejado ÷ (Margem ÷ 100).",
    },
    {
      id: "variacao-periodos", cat: "Financeiro", nome: "Comparar Dois Períodos",
      desc: "Crescimento ou queda entre dois períodos.",
      chaves: ["comparar períodos", "crescimento", "variação", "mês anterior"],
      campos: [campo("vp_ant", "Período anterior", "money"), campo("vp_atual", "Período atual", "money")],
      calc: function () {
        var a = val("vp_ant"), b = val("vp_atual");
        if (a <= 0) return { principal: { label: "Variação", valor: "—" }, linhas: [], obs: "O período anterior precisa ser maior que zero para calcular a variação percentual.", resultadoBruto: 0 };
        var v = (b - a) / a * 100;
        return {
          principal: { label: "Variação", valor: pct(v) },
          linhas: [
            { label: "Diferença", valor: brl(b - a) },
            { label: "Anterior", valor: brl(a) },
            { label: "Atual", valor: brl(b) },
          ],
          obs: v < 0 ? "Houve queda em relação ao período anterior." : null,
          resultadoBruto: v,
        };
      },
      explica: "Variação = (Atual − Anterior) ÷ Anterior × 100.",
    },
  ]);
})();

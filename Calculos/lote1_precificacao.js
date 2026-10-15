// ═══════════════════════════════════════════════════════════════════
//  Bapell Gestor Pro — Central de Cálculos
//  LOTE 1: PRECIFICAÇÃO, E-COMMERCE E MARKETPLACES
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
    console.error("[Calculos/lote1_precificacao.js] Motor nao encontrado. " +
      "Verifique se JS/calculos.js e carregado ANTES deste arquivo no calculos.html.");
    return;
  }

  var campo = API.campo, val = API.val, brl = API.brl, pct = API.pct, num = API.num;

  API.registrar([
    // ---------- MARKETPLACE ----------
  // ───────── MARKETPLACE ─────────
      {
        id: "taxa-marketplace", cat: "Marketplace", nome: "Repasse do Marketplace",
        desc: "Quanto você recebe após comissão e taxa fixa.",
        campos: [
          campo("venda", "Preço de venda", "money"),
          campo("comissao", "Comissão (%)", "percent"),
          campo("fixa", "Taxa fixa", "money"),
          campo("frete", "Frete que você paga", "money"),
        ],
        calc: function () {
          var v = val("venda"), c = val("comissao"), f = val("fixa"), fr = val("frete");
          var comissaoRs = v * (c / 100);
          var liq = v - comissaoRs - f - fr;
          return {
            principal: { label: "Você recebe", valor: brl(liq) },
            linhas: [
              { label: "Comissão", valor: brl(comissaoRs) },
              { label: "Taxa fixa", valor: brl(f) },
              { label: "Frete", valor: brl(fr) },
            ],
            resultadoBruto: liq,
            obs: "Estimativa. Cada marketplace tem regras próprias de frete e comissão — confira na plataforma.",
          };
        },
        explica: "Repasse = Venda − (Venda × Comissão%) − Taxa fixa − Frete.",
      },
    // ---------- PRECIFICAÇÃO ----------
    {
      id: "preco-margem-desejada", cat: "Precificação", nome: "Preço com Margem Desejada",
      desc: "Preço de venda para atingir uma margem sobre o preço final.",
      chaves: ["preço de venda", "margem", "precificar", "markup"],
      campos: [campo("pmd_custo", "Custo total do produto", "money"), campo("pmd_margem", "Margem desejada", "percent")],
      calc: function () {
        var c = val("pmd_custo"), m = val("pmd_margem");
        if (m >= 100) return { principal: { label: "Preço de venda", valor: "—" }, linhas: [], obs: "A margem precisa ser menor que 100%. Margem é calculada sobre o preço de venda, então 100% seria um preço infinito.", resultadoBruto: 0 };
        var preco = c / (1 - m / 100);
        return {
          principal: { label: "Preço de venda", valor: brl(preco) },
          linhas: [
            { label: "Custo", valor: brl(c) },
            { label: "Lucro por unidade", valor: brl(preco - c) },
            { label: "Margem obtida", valor: pct(preco > 0 ? ((preco - c) / preco) * 100 : 0) },
          ],
          resultadoBruto: preco,
        };
      },
      explica: "Preço = Custo ÷ (1 − Margem ÷ 100). A margem incide sobre o PREÇO, por isso o custo é dividido.",
    },
    {
      id: "preco-markup-mult", cat: "Precificação", nome: "Markup Multiplicador",
      desc: "Multiplique o custo por um fator para chegar ao preço.",
      chaves: ["markup", "multiplicador", "fator"],
      campos: [campo("pmm_custo", "Custo do produto", "money"), campo("pmm_fator", "Fator multiplicador", "number")],
      calc: function () {
        var c = val("pmm_custo"), f = val("pmm_fator");
        var preco = c * f;
        return {
          principal: { label: "Preço de venda", valor: brl(preco) },
          linhas: [
            { label: "Custo", valor: brl(c) },
            { label: "Lucro", valor: brl(preco - c) },
            { label: "Margem sobre a venda", valor: pct(preco > 0 ? ((preco - c) / preco) * 100 : 0) },
          ],
          resultadoBruto: preco,
        };
      },
      explica: "Preço = Custo × Fator. Fator 2 dobra o custo (100% de markup, 50% de margem).",
    },
    {
      id: "preco-markup-div", cat: "Precificação", nome: "Markup Divisor",
      desc: "Divida o custo pelo divisor para chegar ao preço.",
      chaves: ["markup", "divisor"],
      campos: [campo("pmv_custo", "Custo do produto", "money"), campo("pmv_div", "Divisor (0 a 1)", "number")],
      calc: function () {
        var c = val("pmv_custo"), d = val("pmv_div");
        if (d <= 0) return { principal: { label: "Preço de venda", valor: "—" }, linhas: [], obs: "O divisor precisa ser maior que zero. Ele representa a fatia do preço que sobra depois dos percentuais (ex.: 0,60).", resultadoBruto: 0 };
        var preco = c / d;
        return {
          principal: { label: "Preço de venda", valor: brl(preco) },
          linhas: [{ label: "Custo", valor: brl(c) }, { label: "Lucro", valor: brl(preco - c) }],
          resultadoBruto: preco,
        };
      },
      explica: "Preço = Custo ÷ Divisor. O divisor é 1 menos a soma dos percentuais sobre a venda.",
    },
    {
      id: "preco-minimo", cat: "Precificação", nome: "Preço Mínimo sem Prejuízo",
      desc: "Menor preço que ainda cobre custo, taxas e impostos.",
      chaves: ["preço mínimo", "prejuízo", "empate", "break even"],
      campos: [
        campo("pmin_custo", "Custo do produto", "money"),
        campo("pmin_extra", "Embalagem + frete pago", "money"),
        campo("pmin_fixa", "Taxa fixa da plataforma", "money"),
        campo("pmin_com", "Comissão", "percent"),
        campo("pmin_imp", "Imposto", "percent"),
      ],
      calc: function () {
        var c = val("pmin_custo"), e = val("pmin_extra"), f = val("pmin_fixa");
        var pctTot = val("pmin_com") + val("pmin_imp");
        if (pctTot >= 100) return { principal: { label: "Preço mínimo", valor: "—" }, linhas: [], obs: "Comissão + imposto somam 100% ou mais: não existe preço que cubra os custos.", resultadoBruto: 0 };
        var preco = (c + e + f) / (1 - pctTot / 100);
        return {
          principal: { label: "Preço mínimo", valor: brl(preco) },
          linhas: [
            { label: "Custos fixos por unidade", valor: brl(c + e + f) },
            { label: "Percentuais somados", valor: pct(pctTot) },
            { label: "Valor dos percentuais", valor: brl(preco * pctTot / 100) },
          ],
          obs: "Neste preço o lucro é exatamente zero. Qualquer valor abaixo dá prejuízo.",
          resultadoBruto: preco,
        };
      },
      explica: "Preço mínimo = (Custo + Extras + Taxa fixa) ÷ (1 − (Comissão + Imposto) ÷ 100).",
    },
    {
      id: "preco-completo", cat: "Precificação", nome: "Preço Completo (comissão + taxa fixa + frete + imposto)",
      desc: "Preço final considerando todos os custos e a margem desejada.",
      chaves: ["preço completo", "marketplace", "comissão", "frete", "imposto", "margem"],
      campos: [
        campo("pc_custo", "Custo do produto", "money"),
        campo("pc_emb", "Embalagem", "money"),
        campo("pc_frete", "Frete pago por você", "money"),
        campo("pc_fixa", "Taxa fixa", "money"),
        campo("pc_com", "Comissão", "percent"),
        campo("pc_imp", "Imposto", "percent"),
        campo("pc_margem", "Margem desejada", "percent"),
      ],
      calc: function () {
        var fixos = val("pc_custo") + val("pc_emb") + val("pc_frete") + val("pc_fixa");
        var p = val("pc_com") + val("pc_imp") + val("pc_margem");
        if (p >= 100) return { principal: { label: "Preço de venda", valor: "—" }, linhas: [], obs: "Comissão + imposto + margem somam 100% ou mais. Reduza algum percentual.", resultadoBruto: 0 };
        var preco = fixos / (1 - p / 100);
        var com = preco * val("pc_com") / 100, imp = preco * val("pc_imp") / 100;
        return {
          principal: { label: "Preço de venda", valor: brl(preco) },
          linhas: [
            { label: "Custos fixos", valor: brl(fixos) },
            { label: "Comissão", valor: brl(com) },
            { label: "Imposto", valor: brl(imp) },
            { label: "Lucro", valor: brl(preco - fixos - com - imp) },
          ],
          resultadoBruto: preco,
        };
      },
      explica: "Preço = Custos fixos ÷ (1 − (Comissão + Imposto + Margem) ÷ 100).",
    },
    {
      id: "preco-lucro-alvo", cat: "Precificação", nome: "Preço para um Lucro em R$",
      desc: "Qual preço cobrar para sobrar um valor exato por venda.",
      chaves: ["lucro alvo", "quanto cobrar", "lucro líquido"],
      campos: [
        campo("pla_custo", "Custos fixos por unidade", "money"),
        campo("pla_fixa", "Taxa fixa", "money"),
        campo("pla_pct", "Comissão + imposto", "percent"),
        campo("pla_lucro", "Lucro desejado por venda", "money"),
      ],
      calc: function () {
        var base = val("pla_custo") + val("pla_fixa") + val("pla_lucro"), p = val("pla_pct");
        if (p >= 100) return { principal: { label: "Preço de venda", valor: "—" }, linhas: [], obs: "Os percentuais somam 100% ou mais.", resultadoBruto: 0 };
        var preco = base / (1 - p / 100);
        return {
          principal: { label: "Preço de venda", valor: brl(preco) },
          linhas: [
            { label: "Lucro garantido", valor: brl(val("pla_lucro")) },
            { label: "Percentuais", valor: brl(preco * p / 100) },
            { label: "Margem resultante", valor: pct(preco > 0 ? val("pla_lucro") / preco * 100 : 0) },
          ],
          resultadoBruto: preco,
        };
      },
      explica: "Preço = (Custos + Taxa fixa + Lucro desejado) ÷ (1 − Percentuais ÷ 100).",
    },
    {
      id: "lucro-apos-taxas", cat: "Precificação", nome: "Lucro Após Todas as Taxas",
      desc: "Quanto sobra de verdade em uma venda.",
      chaves: ["lucro real", "quanto sobra", "líquido"],
      campos: [
        campo("lat_venda", "Preço de venda", "money"),
        campo("lat_custo", "Custo do produto", "money"),
        campo("lat_extra", "Embalagem + frete", "money"),
        campo("lat_fixa", "Taxa fixa", "money"),
        campo("lat_com", "Comissão", "percent"),
        campo("lat_imp", "Imposto", "percent"),
      ],
      calc: function () {
        var v = val("lat_venda");
        var com = v * val("lat_com") / 100, imp = v * val("lat_imp") / 100;
        var lucro = v - val("lat_custo") - val("lat_extra") - val("lat_fixa") - com - imp;
        return {
          principal: { label: "Lucro líquido", valor: brl(lucro) },
          linhas: [
            { label: "Preço de venda", valor: brl(v) },
            { label: "Comissão", valor: brl(com) },
            { label: "Imposto", valor: brl(imp) },
            { label: "Margem líquida", valor: pct(v > 0 ? lucro / v * 100 : 0) },
          ],
          obs: lucro < 0 ? "Atenção: esta venda dá prejuízo." : null,
          resultadoBruto: lucro,
        };
      },
      explica: "Lucro = Venda − Custo − Extras − Taxa fixa − Comissão − Imposto.",
    },
    {
      id: "margem-apos-taxas", cat: "Precificação", nome: "Margem Após Taxas",
      desc: "Margem percentual real depois de descontar tudo.",
      chaves: ["margem real", "margem líquida"],
      campos: [
        campo("mat_venda", "Preço de venda", "money"),
        campo("mat_custo", "Custos por unidade", "money"),
        campo("mat_fixa", "Taxa fixa", "money"),
        campo("mat_pct", "Comissão + imposto", "percent"),
      ],
      calc: function () {
        var v = val("mat_venda");
        var desc = v * val("mat_pct") / 100;
        var lucro = v - val("mat_custo") - val("mat_fixa") - desc;
        var m = v > 0 ? lucro / v * 100 : 0;
        return {
          principal: { label: "Margem líquida", valor: pct(m) },
          linhas: [{ label: "Lucro", valor: brl(lucro) }, { label: "Descontos percentuais", valor: brl(desc) }],
          resultadoBruto: m,
        };
      },
      explica: "Margem = Lucro ÷ Preço de venda × 100, já descontadas taxas e impostos.",
    },
    {
      id: "desconto-maximo", cat: "Precificação", nome: "Desconto Máximo Possível",
      desc: "Maior desconto sem cair abaixo da margem mínima.",
      chaves: ["desconto máximo", "promoção", "margem mínima"],
      campos: [
        campo("dm_venda", "Preço atual", "money"),
        campo("dm_custo", "Custos por unidade", "money"),
        campo("dm_fixa", "Taxa fixa", "money"),
        campo("dm_pct", "Comissão + imposto", "percent"),
        campo("dm_min", "Margem mínima aceita", "percent"),
      ],
      calc: function () {
        var atual = val("dm_venda"), c = val("dm_custo") + val("dm_fixa");
        var p = val("dm_pct") + val("dm_min");
        if (p >= 100) return { principal: { label: "Desconto máximo", valor: "—" }, linhas: [], obs: "Percentuais + margem mínima somam 100% ou mais.", resultadoBruto: 0 };
        var pisoPreco = c / (1 - p / 100);
        var desc = atual - pisoPreco;
        var descPct = atual > 0 ? desc / atual * 100 : 0;
        return {
          principal: { label: "Desconto máximo", valor: pct(Math.max(0, descPct)) },
          linhas: [
            { label: "Preço mínimo", valor: brl(pisoPreco) },
            { label: "Desconto em R$", valor: brl(Math.max(0, desc)) },
          ],
          obs: desc < 0 ? "O preço atual já está abaixo do mínimo para essa margem." : null,
          resultadoBruto: Math.max(0, descPct),
        };
      },
      explica: "Preço mínimo = Custos ÷ (1 − (Percentuais + Margem mínima) ÷ 100). O desconto é a diferença até o preço atual.",
    },
    {
      id: "preco-promocional", cat: "Precificação", nome: "Simulação de Preço Promocional",
      desc: "Veja o lucro ao aplicar um desconto.",
      chaves: ["promoção", "desconto", "black friday"],
      campos: [
        campo("pp_venda", "Preço normal", "money"),
        campo("pp_desc", "Desconto", "percent"),
        campo("pp_custo", "Custos por unidade", "money"),
        campo("pp_pct", "Comissão + imposto", "percent"),
      ],
      calc: function () {
        var v = val("pp_venda"), novo = v * (1 - val("pp_desc") / 100);
        var lucroAntes = v - val("pp_custo") - v * val("pp_pct") / 100;
        var lucroDepois = novo - val("pp_custo") - novo * val("pp_pct") / 100;
        return {
          principal: { label: "Preço promocional", valor: brl(novo) },
          linhas: [
            { label: "Lucro antes", valor: brl(lucroAntes) },
            { label: "Lucro na promoção", valor: brl(lucroDepois) },
            { label: "Perda de lucro", valor: brl(lucroAntes - lucroDepois) },
            { label: "Margem na promoção", valor: pct(novo > 0 ? lucroDepois / novo * 100 : 0) },
          ],
          obs: lucroDepois < 0 ? "Nesta promoção a venda dá prejuízo." : null,
          resultadoBruto: novo,
        };
      },
      explica: "Preço promocional = Preço × (1 − Desconto ÷ 100). O lucro é recalculado sobre o novo preço.",
    },
    {
      id: "impacto-custo", cat: "Precificação", nome: "Impacto de Aumento de Custo",
      desc: "O que muda no lucro quando o fornecedor aumenta o preço.",
      chaves: ["aumento de custo", "fornecedor", "impacto"],
      campos: [
        campo("ic_venda", "Preço de venda", "money"),
        campo("ic_antes", "Custo atual", "money"),
        campo("ic_depois", "Novo custo", "money"),
      ],
      calc: function () {
        var v = val("ic_venda"), a = val("ic_antes"), d = val("ic_depois");
        var la = v - a, ld = v - d;
        return {
          principal: { label: "Nova margem", valor: pct(v > 0 ? ld / v * 100 : 0) },
          linhas: [
            { label: "Margem anterior", valor: pct(v > 0 ? la / v * 100 : 0) },
            { label: "Lucro anterior", valor: brl(la) },
            { label: "Novo lucro", valor: brl(ld) },
            { label: "Diferença", valor: brl(ld - la) },
            { label: "Aumento do custo", valor: pct(a > 0 ? (d - a) / a * 100 : 0) },
          ],
          resultadoBruto: v > 0 ? ld / v * 100 : 0,
        };
      },
      explica: "Compara lucro e margem antes e depois da mudança de custo, mantendo o mesmo preço de venda.",
    },
    {
      id: "impacto-taxa", cat: "Precificação", nome: "Impacto de Mudança de Taxa",
      desc: "Diferença no lucro quando a plataforma muda a comissão.",
      chaves: ["mudança de taxa", "comissão", "impacto"],
      campos: [
        campo("it_venda", "Preço de venda", "money"),
        campo("it_antes", "Taxa atual", "percent"),
        campo("it_depois", "Nova taxa", "percent"),
      ],
      calc: function () {
        var v = val("it_venda");
        var ta = v * val("it_antes") / 100, td = v * val("it_depois") / 100;
        return {
          principal: { label: "Diferença no lucro", valor: brl(ta - td) },
          linhas: [
            { label: "Taxa atual em R$", valor: brl(ta) },
            { label: "Nova taxa em R$", valor: brl(td) },
            { label: "Variação", valor: pct(val("it_depois") - val("it_antes")) + " em pontos" },
          ],
          obs: td > ta ? "A nova taxa reduz o seu lucro nesse valor por venda." : null,
          resultadoBruto: ta - td,
        };
      },
      explica: "Diferença = (Preço × Taxa antiga) − (Preço × Taxa nova).",
    },
    {
      id: "comparar-precos", cat: "Precificação", nome: "Comparar Dois Cenários de Venda",
      desc: "Qual das duas opções deixa mais dinheiro no bolso.",
      chaves: ["comparar", "cenário", "plataforma", "qual compensa"],
      campos: [
        campo("cp_v1", "Cenário A — preço", "money"),
        campo("cp_t1", "Cenário A — taxas totais", "percent"),
        campo("cp_f1", "Cenário A — taxa fixa", "money"),
        campo("cp_v2", "Cenário B — preço", "money"),
        campo("cp_t2", "Cenário B — taxas totais", "percent"),
        campo("cp_f2", "Cenário B — taxa fixa", "money"),
        campo("cp_custo", "Custo do produto (igual nos dois)", "money"),
      ],
      calc: function () {
        var c = val("cp_custo");
        var l1 = val("cp_v1") - val("cp_v1") * val("cp_t1") / 100 - val("cp_f1") - c;
        var l2 = val("cp_v2") - val("cp_v2") * val("cp_t2") / 100 - val("cp_f2") - c;
        var melhor = l1 === l2 ? "Empate" : (l1 > l2 ? "Cenário A" : "Cenário B");
        return {
          principal: { label: "Melhor cenário", valor: melhor },
          linhas: [
            { label: "Lucro no cenário A", valor: brl(l1) },
            { label: "Lucro no cenário B", valor: brl(l2) },
            { label: "Diferença", valor: brl(Math.abs(l1 - l2)) },
          ],
          resultadoBruto: Math.max(l1, l2),
        };
      },
      explica: "Calcula o lucro líquido de cada cenário e compara. Use para decidir entre plataformas ou modalidades de anúncio.",
    },
    {
      id: "preco-kit", cat: "Precificação", nome: "Preço de Kit",
      desc: "Preço de um kit a partir do custo unitário e da quantidade.",
      chaves: ["kit", "combo", "multipack"],
      campos: [
        campo("pk_custo", "Custo de 1 unidade", "money"),
        campo("pk_qtd", "Unidades no kit", "integer"),
        campo("pk_extra", "Custo extra do kit (embalagem)", "money"),
        campo("pk_fixa", "Taxa fixa", "money"),
        campo("pk_pct", "Comissão + imposto", "percent"),
        campo("pk_margem", "Margem desejada", "percent"),
      ],
      calc: function () {
        var q = val("pk_qtd");
        var custoKit = val("pk_custo") * q + val("pk_extra") + val("pk_fixa");
        var p = val("pk_pct") + val("pk_margem");
        if (p >= 100) return { principal: { label: "Preço do kit", valor: "—" }, linhas: [], obs: "Percentuais somam 100% ou mais.", resultadoBruto: 0 };
        var preco = custoKit / (1 - p / 100);
        return {
          principal: { label: "Preço do kit", valor: brl(preco) },
          linhas: [
            { label: "Custo do kit", valor: brl(custoKit) },
            { label: "Preço por unidade", valor: q > 0 ? brl(preco / q) : "—" },
            { label: "Lucro do kit", valor: brl(preco - custoKit - preco * val("pk_pct") / 100) },
          ],
          resultadoBruto: preco,
        };
      },
      explica: "Custo do kit = Custo unitário × Quantidade + Extras. Preço = Custo ÷ (1 − Percentuais ÷ 100).",
    },
    {
      id: "produto-vs-kit", cat: "Precificação", nome: "Produto Avulso x Kit",
      desc: "Compare o lucro por unidade nas duas formas de vender.",
      chaves: ["kit", "avulso", "comparar", "combo"],
      campos: [
        campo("pvk_pu", "Preço avulso (1 unidade)", "money"),
        campo("pvk_pk", "Preço do kit", "money"),
        campo("pvk_qtd", "Unidades no kit", "integer"),
        campo("pvk_custo", "Custo de 1 unidade", "money"),
        campo("pvk_pct", "Comissão + imposto", "percent"),
      ],
      calc: function () {
        var q = val("pvk_qtd"), c = val("pvk_custo"), p = val("pvk_pct") / 100;
        var lucroAvulso = val("pvk_pu") * (1 - p) - c;
        var lucroKit = val("pvk_pk") * (1 - p) - c * q;
        var porUnid = q > 0 ? lucroKit / q : 0;
        return {
          principal: { label: "Lucro por unidade no kit", valor: brl(porUnid) },
          linhas: [
            { label: "Lucro vendendo avulso", valor: brl(lucroAvulso) },
            { label: "Lucro total do kit", valor: brl(lucroKit) },
            { label: "Diferença por unidade", valor: brl(porUnid - lucroAvulso) },
          ],
          obs: porUnid < lucroAvulso ? "O kit rende menos por unidade — compensa apenas se aumentar o volume." : null,
          resultadoBruto: porUnid,
        };
      },
      explica: "Compara o lucro de uma unidade vendida sozinha com o lucro médio por unidade dentro do kit.",
    },
    // ---------- MARKETPLACES ----------
    {
      id: "mkt-comissao-fixa", cat: "Marketplace", nome: "Comissão + Taxa Fixa",
      desc: "Quanto a plataforma retém de uma venda.",
      chaves: ["comissão", "taxa fixa", "marketplace", "retenção"],
      campos: [
        campo("mcf_venda", "Preço de venda", "money"),
        campo("mcf_com", "Comissão", "percent"),
        campo("mcf_fixa", "Taxa fixa", "money"),
      ],
      calc: function () {
        var v = val("mcf_venda"), com = v * val("mcf_com") / 100, f = val("mcf_fixa");
        var total = com + f;
        return {
          principal: { label: "Total retido", valor: brl(total) },
          linhas: [
            { label: "Comissão", valor: brl(com) },
            { label: "Taxa fixa", valor: brl(f) },
            { label: "Você recebe", valor: brl(v - total) },
            { label: "Retenção sobre a venda", valor: pct(v > 0 ? total / v * 100 : 0) },
          ],
          resultadoBruto: total,
        };
      },
      explica: "Retenção = (Preço × Comissão ÷ 100) + Taxa fixa. Informe as taxas da sua plataforma.",
    },
    {
      id: "mkt-liquido", cat: "Marketplace", nome: "Lucro Líquido no Marketplace",
      desc: "Resultado final de uma venda com todos os descontos.",
      chaves: ["líquido", "marketplace", "quanto recebo", "repasse"],
      campos: [
        campo("ml_venda", "Preço de venda", "money"),
        campo("ml_com", "Comissão", "percent"),
        campo("ml_fixa", "Taxa fixa", "money"),
        campo("ml_frete", "Frete por sua conta", "money"),
        campo("ml_imp", "Imposto", "percent"),
        campo("ml_custo", "Custo do produto", "money"),
      ],
      calc: function () {
        var v = val("ml_venda");
        var com = v * val("ml_com") / 100, imp = v * val("ml_imp") / 100;
        var repasse = v - com - val("ml_fixa") - val("ml_frete");
        var lucro = repasse - imp - val("ml_custo");
        return {
          principal: { label: "Lucro líquido", valor: brl(lucro) },
          linhas: [
            { label: "Repasse da plataforma", valor: brl(repasse) },
            { label: "Comissão", valor: brl(com) },
            { label: "Imposto", valor: brl(imp) },
            { label: "Margem líquida", valor: pct(v > 0 ? lucro / v * 100 : 0) },
          ],
          obs: lucro < 0 ? "Atenção: esta venda dá prejuízo." : null,
          resultadoBruto: lucro,
        };
      },
      explica: "Repasse = Venda − Comissão − Taxa fixa − Frete. Lucro = Repasse − Imposto − Custo.",
    },
    {
      id: "mkt-premium-classico", cat: "Marketplace", nome: "Comparar Duas Modalidades de Anúncio",
      desc: "Simule dois tipos de anúncio com comissões diferentes.",
      chaves: ["premium", "clássico", "modalidade", "anúncio", "comparar"],
      campos: [
        campo("mpc_venda", "Preço de venda", "money"),
        campo("mpc_custo", "Custo total por unidade", "money"),
        campo("mpc_fixa", "Taxa fixa (igual nas duas)", "money"),
        campo("mpc_a", "Modalidade A — comissão", "percent"),
        campo("mpc_b", "Modalidade B — comissão", "percent"),
      ],
      calc: function () {
        var v = val("mpc_venda"), c = val("mpc_custo"), f = val("mpc_fixa");
        var la = v - v * val("mpc_a") / 100 - f - c;
        var lb = v - v * val("mpc_b") / 100 - f - c;
        return {
          principal: { label: "Diferença de lucro", valor: brl(Math.abs(la - lb)) },
          linhas: [
            { label: "Lucro na modalidade A", valor: brl(la) },
            { label: "Lucro na modalidade B", valor: brl(lb) },
            { label: "Margem A", valor: pct(v > 0 ? la / v * 100 : 0) },
            { label: "Margem B", valor: pct(v > 0 ? lb / v * 100 : 0) },
          ],
          obs: "Informe as comissões da sua plataforma. Esta ferramenta não assume taxas de nenhum marketplace.",
          resultadoBruto: Math.abs(la - lb),
        };
      },
      explica: "Calcula o lucro com cada comissão informada e mostra a diferença entre as duas modalidades.",
    },
    {
      id: "mkt-preco-repasse", cat: "Marketplace", nome: "Preço para Receber um Valor Exato",
      desc: "Quanto cobrar para o repasse ser o valor que você quer.",
      chaves: ["repasse", "receber", "quanto cobrar", "líquido desejado"],
      campos: [
        campo("mpr_alvo", "Quanto quer receber", "money"),
        campo("mpr_com", "Comissão", "percent"),
        campo("mpr_fixa", "Taxa fixa", "money"),
      ],
      calc: function () {
        var alvo = val("mpr_alvo"), com = val("mpr_com"), f = val("mpr_fixa");
        if (com >= 100) return { principal: { label: "Preço a cobrar", valor: "—" }, linhas: [], obs: "A comissão precisa ser menor que 100%.", resultadoBruto: 0 };
        var preco = (alvo + f) / (1 - com / 100);
        return {
          principal: { label: "Preço a cobrar", valor: brl(preco) },
          linhas: [
            { label: "Comissão", valor: brl(preco * com / 100) },
            { label: "Taxa fixa", valor: brl(f) },
            { label: "Você recebe", valor: brl(preco - preco * com / 100 - f) },
          ],
          resultadoBruto: preco,
        };
      },
      explica: "Preço = (Valor desejado + Taxa fixa) ÷ (1 − Comissão ÷ 100).",
    },
    // ---------- METAS DE E-COMMERCE ----------
    {
      id: "meta-vendas", cat: "Precificação", nome: "Vendas Necessárias para uma Meta",
      desc: "Quantas vendas para atingir o faturamento desejado.",
      chaves: ["meta", "quantas vendas", "faturamento", "ticket médio"],
      campos: [
        campo("mv_meta", "Faturamento desejado", "money"),
        campo("mv_ticket", "Ticket médio", "money"),
      ],
      calc: function () {
        var meta = val("mv_meta"), t = val("mv_ticket");
        if (t <= 0) return { principal: { label: "Vendas necessárias", valor: "—" }, linhas: [], obs: "Informe um ticket médio maior que zero.", resultadoBruto: 0 };
        var q = meta / t;
        return {
          principal: { label: "Vendas necessárias", valor: num(Math.ceil(q), 0) },
          linhas: [
            { label: "Cálculo exato", valor: num(q) },
            { label: "Por dia (30 dias)", valor: num(Math.ceil(q / 30), 0) },
            { label: "Por semana", valor: num(Math.ceil(q / 4.3), 0) },
          ],
          resultadoBruto: Math.ceil(q),
        };
      },
      explica: "Vendas = Faturamento desejado ÷ Ticket médio, arredondado para cima.",
    },
    {
      id: "meta-lucro-qtd", cat: "Precificação", nome: "Vendas Necessárias para um Lucro",
      desc: "Quantas vendas para atingir o lucro desejado.",
      chaves: ["meta de lucro", "quantas vendas", "lucro desejado"],
      campos: [
        campo("mlq_meta", "Lucro desejado", "money"),
        campo("mlq_unit", "Lucro médio por venda", "money"),
      ],
      calc: function () {
        var meta = val("mlq_meta"), u = val("mlq_unit");
        if (u <= 0) return { principal: { label: "Vendas necessárias", valor: "—" }, linhas: [], obs: "O lucro por venda precisa ser maior que zero.", resultadoBruto: 0 };
        var q = meta / u;
        return {
          principal: { label: "Vendas necessárias", valor: num(Math.ceil(q), 0) },
          linhas: [
            { label: "Cálculo exato", valor: num(q) },
            { label: "Por dia (30 dias)", valor: num(Math.ceil(q / 30), 0) },
          ],
          resultadoBruto: Math.ceil(q),
        };
      },
      explica: "Vendas = Lucro desejado ÷ Lucro por venda, arredondado para cima.",
    },
  ]);
})();

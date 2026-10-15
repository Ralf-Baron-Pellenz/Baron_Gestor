// ═══════════════════════════════════════════════════════════════════
//  Bapell Gestor Pro — Central de Cálculos
//  LOTE 4: FRETE, CUBAGEM, PESO E LOGÍSTICA
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
    console.error("[Calculos/lote4_logistica.js] Motor nao encontrado. " +
      "Verifique se JS/calculos.js e carregado ANTES deste arquivo no calculos.html.");
    return;
  }

  var campo = API.campo, val = API.val, brl = API.brl, pct = API.pct, num = API.num;

  API.registrar([
    // ---------- FRETE ----------
  // ───────── FRETE ─────────
      {
        id: "peso-cubico", cat: "Frete", nome: "Peso Cúbico (Cubagem)",
        desc: "Peso volumétrico usado por transportadoras.",
        campos: [
          campo("alt", "Altura (cm)", "number"),
          campo("larg", "Largura (cm)", "number"),
          campo("comp", "Comprimento (cm)", "number"),
          campo("fator", "Fator de cubagem", "number", { placeholder: "Ex: 6000 (aéreo) ou 300" }),
        ],
        calc: function () {
          var a = val("alt"), l = val("larg"), c = val("comp"), f = val("fator") || 6000;
          var vol = a * l * c;
          var pesoCub = vol / f;
          return {
            principal: { label: "Peso cúbico", valor: num(pesoCub, 3) + " kg" },
            linhas: [
              { label: "Volume", valor: num(vol, 0) + " cm³" },
              { label: "Fator usado", valor: num(f, 0) },
            ],
            resultadoBruto: pesoCub,
          };
        },
        explica: "Peso cúbico = (Altura × Largura × Comprimento) ÷ Fator. O fator varia por transportadora (comum: 6000 para aéreo).",
      },
  {
        id: "peso-faturado", cat: "Frete", nome: "Peso Faturado",
        desc: "O maior entre o peso real e o cúbico — é o que a transportadora cobra.",
        campos: [
          campo("real", "Peso real (kg)", "number"),
          campo("cubico", "Peso cúbico (kg)", "number"),
        ],
        calc: function () {
          var r = val("real"), c = val("cubico");
          var faturado = Math.max(r, c);
          return {
            principal: { label: "Peso faturado", valor: num(faturado, 3) + " kg" },
            linhas: [
              { label: "Peso real", valor: num(r, 3) + " kg" },
              { label: "Peso cúbico", valor: num(c, 3) + " kg" },
            ],
            resultadoBruto: faturado,
            obs: faturado === c && c > r ? "O peso cúbico prevaleceu." : "O peso real prevaleceu.",
          };
        },
        explica: "Peso faturado = maior valor entre peso real e peso cúbico.",
      },
  {
        id: "rateio-frete", cat: "Frete", nome: "Rateio de Frete",
        desc: "Divida o frete total entre os itens do pedido.",
        campos: [campo("frete", "Frete total", "money"), campo("itens", "Quantidade de itens", "integer")],
        calc: function () {
          var f = val("frete"), i = val("itens");
          var porItem = i > 0 ? f / i : 0;
          return {
            principal: { label: "Frete por item", valor: brl(porItem) },
            linhas: [{ label: "Frete total", valor: brl(f) }, { label: "Itens", valor: num(i, 0) }],
            resultadoBruto: porItem,
          };
        },
        explica: "Frete por item = Frete total ÷ Quantidade de itens.",
      },
    {
      id: "log-custo-por-kg", cat: "Frete", nome: "Custo por Kg e por Grama",
      desc: "Quanto custa cada quilo do que você envia.",
      chaves: ["custo por kg", "grama", "peso", "frete"],
      campos: [campo("lck_valor", "Valor total pago", "money"), campo("lck_peso", "Peso total (kg)", "number")],
      calc: function () {
        var v = val("lck_valor"), p = val("lck_peso");
        if (p <= 0) return { principal: { label: "Custo por kg", valor: "—" }, linhas: [], obs: "Informe um peso maior que zero.", resultadoBruto: 0 };
        return { principal: { label: "Custo por kg", valor: brl(v / p) },
          linhas: [{ label: "Custo por grama", valor: brl(v / (p * 1000)) }, { label: "Custo por 100 g", valor: brl(v / (p * 10)) }],
          resultadoBruto: v / p };
      },
      explica: "Custo por kg = Valor total ÷ Peso em kg.",
    },
    {
      id: "log-frete-unidade", cat: "Frete", nome: "Frete por Unidade",
      desc: "Divide o frete de um pedido pelas peças enviadas.",
      chaves: ["frete unitario", "por unidade", "pedido"],
      campos: [campo("lfu_frete", "Frete total do pedido", "money"), campo("lfu_qtd", "Quantidade de itens", "integer")],
      calc: function () {
        var f = val("lfu_frete"), q = val("lfu_qtd");
        if (q <= 0) return { principal: { label: "Frete por unidade", valor: "—" }, linhas: [], obs: "Informe uma quantidade maior que zero.", resultadoBruto: 0 };
        return { principal: { label: "Frete por unidade", valor: brl(f / q) },
          linhas: [{ label: "Frete total", valor: brl(f) }, { label: "Itens", valor: num(q, 0) }],
          resultadoBruto: f / q };
      },
      explica: "Frete por unidade = Frete total ÷ Quantidade de itens.",
    },
    {
      id: "log-rateio-proporcional", cat: "Frete", nome: "Rateio de Frete Proporcional ao Valor",
      desc: "Divide o frete entre 3 produtos conforme o valor de cada um.",
      chaves: ["rateio", "proporcional", "frete", "dividir"],
      campos: [campo("lrp_frete", "Frete total", "money"), campo("lrp_v1", "Valor do produto 1", "money"),
               campo("lrp_v2", "Valor do produto 2", "money"), campo("lrp_v3", "Valor do produto 3", "money")],
      calc: function () {
        var f = val("lrp_frete"), a = val("lrp_v1"), b = val("lrp_v2"), c = val("lrp_v3");
        var t = a + b + c;
        if (t <= 0) return { principal: { label: "Rateio", valor: "—" }, linhas: [], obs: "A soma dos valores precisa ser maior que zero.", resultadoBruto: 0 };
        return { principal: { label: "Frete do produto 1", valor: brl(f * a / t) },
          linhas: [{ label: "Frete do produto 2", valor: brl(f * b / t) },
                   { label: "Frete do produto 3", valor: brl(f * c / t) },
                   { label: "Rateio igualitário (cada um)", valor: brl(f / 3) }],
          resultadoBruto: f * a / t };
      },
      explica: "Cada produto recebe: Frete × (Valor do produto ÷ Soma dos valores).",
    },
    {
      id: "log-frete-pct-venda", cat: "Frete", nome: "Frete como % da Venda",
      desc: "Peso do frete no preço e o impacto na margem.",
      chaves: ["frete percentual", "impacto do frete", "margem"],
      campos: [campo("lfp_venda", "Preço de venda", "money"), campo("lfp_frete", "Frete", "money"), campo("lfp_custo", "Custo do produto", "money")],
      calc: function () {
        var v = val("lfp_venda"), f = val("lfp_frete"), c = val("lfp_custo");
        if (v <= 0) return { principal: { label: "Frete sobre a venda", valor: "—" }, linhas: [], obs: "Informe um preço de venda maior que zero.", resultadoBruto: 0 };
        var semFrete = (v - c) / v * 100, comFrete = (v - c - f) / v * 100;
        return { principal: { label: "Frete sobre a venda", valor: pct(f / v * 100) },
          linhas: [{ label: "Margem sem o frete", valor: pct(semFrete) },
                   { label: "Margem com o frete", valor: pct(comFrete) },
                   { label: "Margem consumida", valor: pct(semFrete - comFrete) + " em pontos" }],
          resultadoBruto: f / v * 100 };
      },
      explica: "Frete% = Frete ÷ Preço × 100. A diferença entre as duas margens mostra quanto o frete consome.",
    },
    {
      id: "log-cubagem-total", cat: "Frete", nome: "Cubagem e Volume do Pedido",
      desc: "Volume em m³ e cm³ a partir das medidas.",
      chaves: ["cubagem", "volume", "m3", "caixa", "medidas"],
      campos: [campo("lct_c", "Comprimento (cm)", "number"), campo("lct_l", "Largura (cm)", "number"),
               campo("lct_a", "Altura (cm)", "number"), campo("lct_q", "Quantidade de caixas", "integer")],
      calc: function () {
        var q = Math.max(1, val("lct_q"));
        var cm3 = val("lct_c") * val("lct_l") * val("lct_a");
        var total = cm3 * q;
        return { principal: { label: "Volume total", valor: num(total / 1000000, 4) + " m³" },
          linhas: [{ label: "Volume de 1 caixa", valor: num(cm3, 0) + " cm³" },
                   { label: "Volume total em cm³", valor: num(total, 0) },
                   { label: "Volume em litros", valor: num(total / 1000, 2) }],
          resultadoBruto: total / 1000000 };
      },
      explica: "Volume = C × L × A. Em centímetros, divida por 1.000.000 para obter m³.",
    },
    {
      id: "log-peso-real-vs-cubado", cat: "Frete", nome: "Peso Real x Peso Cubado",
      desc: "Qual dos dois a transportadora vai cobrar.",
      chaves: ["peso cubado", "peso real", "peso faturado", "comparar"],
      campos: [campo("lpr_peso", "Peso real (kg)", "number"), campo("lpr_c", "Comprimento (cm)", "number"),
               campo("lpr_l", "Largura (cm)", "number"), campo("lpr_a", "Altura (cm)", "number"),
               campo("lpr_fator", "Fator de cubagem", "number")],
      calc: function () {
        var f = val("lpr_fator");
        if (f <= 0) return { principal: { label: "Peso cobrado", valor: "—" }, linhas: [], obs: "Informe o fator de cubagem da transportadora (ex.: 6000 ou 5000).", resultadoBruto: 0 };
        var real = val("lpr_peso");
        var cubado = (val("lpr_c") * val("lpr_l") * val("lpr_a")) / f;
        var cobrado = Math.max(real, cubado);
        return { principal: { label: "Peso cobrado", valor: num(cobrado, 3) + " kg" },
          linhas: [{ label: "Peso real", valor: num(real, 3) + " kg" },
                   { label: "Peso cubado", valor: num(cubado, 3) + " kg" },
                   { label: "Qual prevalece", valor: cubado > real ? "O cubado" : "O real" }],
          obs: "O fator varia por transportadora e modal. Confirme o seu antes de precificar.",
          resultadoBruto: cobrado };
      },
      explica: "Peso cubado = (C × L × A) ÷ Fator. Cobra-se o maior entre o real e o cubado.",
    },
    {
      id: "log-preco-com-frete", cat: "Frete", nome: "Preço com Frete Incluso",
      desc: "Embuta o frete no preço mantendo a margem.",
      chaves: ["frete gratis", "frete incluso", "embutir"],
      campos: [campo("lpf_custo", "Custo do produto", "money"), campo("lpf_frete", "Frete a embutir", "money"),
               campo("lpf_pct", "Comissão + imposto", "percent"), campo("lpf_margem", "Margem desejada", "percent")],
      calc: function () {
        var base = val("lpf_custo") + val("lpf_frete");
        var p = val("lpf_pct") + val("lpf_margem");
        if (p >= 100) return { principal: { label: "Preço com frete", valor: "—" }, linhas: [], obs: "Os percentuais somam 100% ou mais.", resultadoBruto: 0 };
        var preco = base / (1 - p / 100);
        return { principal: { label: "Preço com frete incluso", valor: brl(preco) },
          linhas: [{ label: "Custo + frete", valor: brl(base) },
                   { label: "Frete embutido", valor: brl(val("lpf_frete")) },
                   { label: "Peso do frete no preço", valor: pct(preco > 0 ? val("lpf_frete") / preco * 100 : 0) }],
          resultadoBruto: preco };
      },
      explica: "Preço = (Custo + Frete) ÷ (1 − Percentuais ÷ 100).",
    },
  ]);
})();

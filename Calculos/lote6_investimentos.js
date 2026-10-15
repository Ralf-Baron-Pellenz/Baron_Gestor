// ═══════════════════════════════════════════════════════════════════
//  Bapell Gestor Pro — Central de Cálculos
//  LOTE 6: JUROS, INVESTIMENTOS E EMPRÉSTIMOS
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
    console.error("[Calculos/lote6_investimentos.js] Motor nao encontrado. " +
      "Verifique se JS/calculos.js e carregado ANTES deste arquivo no calculos.html.");
    return;
  }

  var campo = API.campo, val = API.val, brl = API.brl, pct = API.pct, num = API.num;

  API.registrar([
    // ---------- INVESTIMENTOS ----------
  // ───────── INVESTIMENTOS ─────────
      {
        id: "juros-simples", cat: "Investimentos", nome: "Juros Simples",
        desc: "Montante com juros simples.",
        campos: [
          campo("capital", "Capital inicial", "money"),
          campo("taxa", "Taxa (% ao período)", "percent"),
          campo("tempo", "Tempo (períodos)", "number"),
        ],
        calc: function () {
          var c = val("capital"), t = val("taxa") / 100, n = val("tempo");
          var juros = c * t * n;
          return {
            principal: { label: "Montante final", valor: brl(c + juros) },
            linhas: [{ label: "Juros ganhos", valor: brl(juros) }, { label: "Capital", valor: brl(c) }],
            resultadoBruto: c + juros,
          };
        },
        explica: "Montante = Capital × (1 + Taxa × Tempo). Juros sempre sobre o capital inicial.",
      },
  {
        id: "juros-compostos", cat: "Investimentos", nome: "Juros Compostos",
        desc: "Montante com juros sobre juros.",
        campos: [
          campo("capital", "Capital inicial", "money"),
          campo("taxa", "Taxa (% ao período)", "percent"),
          campo("tempo", "Tempo (períodos)", "number"),
        ],
        calc: function () {
          var c = val("capital"), t = val("taxa") / 100, n = val("tempo");
          var montante = c * Math.pow(1 + t, n);
          return {
            principal: { label: "Montante final", valor: brl(montante) },
            linhas: [{ label: "Juros ganhos", valor: brl(montante - c) }, { label: "Capital", valor: brl(c) }],
            resultadoBruto: montante,
          };
        },
        explica: "Montante = Capital × (1 + Taxa)^Tempo. Os juros incidem sobre o total acumulado.",
      },
    // ---------- EMPRÉSTIMOS ----------
  // ───────── EMPRÉSTIMOS ─────────
      {
        id: "financiamento-price", cat: "Empréstimos", nome: "Financiamento (Tabela Price)",
        desc: "Parcela fixa de um financiamento.",
        campos: [
          campo("valor", "Valor financiado", "money"),
          campo("taxa", "Juros ao mês (%)", "percent"),
          campo("meses", "Número de meses", "integer"),
        ],
        calc: function () {
          var v = val("valor"), j = val("taxa") / 100, n = val("meses");
          var parcela;
          if (n <= 0) parcela = 0;
          else if (j === 0) parcela = v / n;
          else parcela = (v * j * Math.pow(1 + j, n)) / (Math.pow(1 + j, n) - 1);
          var total = parcela * n;
          return {
            principal: { label: "Parcela mensal", valor: brl(parcela) },
            linhas: [
              { label: "Total pago", valor: brl(total) },
              { label: "Total de juros", valor: brl(total - v) },
            ],
            resultadoBruto: parcela,
          };
        },
        explica: "Tabela Price: parcelas fixas. Parcela = V × [i(1+i)^n] ÷ [(1+i)^n − 1].",
      },
    {
      id: "inv-valor-futuro", cat: "Investimentos", nome: "Valor Futuro com Aportes",
      desc: "Quanto rende um investimento com depósitos mensais.",
      chaves: ["valor futuro", "aporte", "acumulado", "poupança"],
      campos: [campo("ivf_cap", "Valor inicial", "money"), campo("ivf_aporte", "Aporte por período", "money"),
               campo("ivf_taxa", "Taxa por período", "percent"), campo("ivf_n", "Períodos", "integer")],
      calc: function () {
        var c = val("ivf_cap"), a = val("ivf_aporte"), i2 = val("ivf_taxa") / 100, n = Math.max(0, Math.round(val("ivf_n")));
        var fv;
        if (i2 === 0) fv = c + a * n;
        else fv = c * Math.pow(1 + i2, n) + a * ((Math.pow(1 + i2, n) - 1) / i2);
        var investido = c + a * n;
        return { principal: { label: "Valor futuro", valor: brl(fv) },
          linhas: [{ label: "Total investido", valor: brl(investido) },
                   { label: "Rendimento", valor: brl(fv - investido) },
                   { label: "Rentabilidade", valor: pct(investido > 0 ? (fv - investido) / investido * 100 : 0) }],
          resultadoBruto: fv };
      },
      explica: "VF = C × (1+i)^n + Aporte × (((1+i)^n − 1) ÷ i).",
    },
    {
      id: "inv-valor-presente", cat: "Investimentos", nome: "Valor Presente",
      desc: "Quanto vale hoje um valor que você receberá no futuro.",
      chaves: ["valor presente", "desconto", "trazer a valor presente"],
      campos: [campo("ivp_fv", "Valor no futuro", "money"), campo("ivp_taxa", "Taxa por período", "percent"), campo("ivp_n", "Períodos", "integer")],
      calc: function () {
        var fv = val("ivp_fv"), i2 = val("ivp_taxa") / 100, n = Math.max(0, Math.round(val("ivp_n")));
        var pv = fv / Math.pow(1 + i2, n);
        if (!isFinite(pv)) return { principal: { label: "Valor presente", valor: "—" }, linhas: [], obs: "Taxa inválida.", resultadoBruto: 0 };
        return { principal: { label: "Valor presente", valor: brl(pv) },
          linhas: [{ label: "Valor futuro", valor: brl(fv) }, { label: "Desconto aplicado", valor: brl(fv - pv) }],
          resultadoBruto: pv };
      },
      explica: "VP = VF ÷ (1 + i)^n.",
    },
    {
      id: "inv-conversao-taxa", cat: "Investimentos", nome: "Converter Taxa Mensal e Anual",
      desc: "Equivalência composta entre períodos.",
      chaves: ["taxa mensal", "taxa anual", "converter taxa", "equivalente"],
      campos: [campo("ict_taxa", "Taxa informada", "percent"), campo("ict_sentido", "1 = mensal→anual, 2 = anual→mensal", "integer")],
      calc: function () {
        var t = val("ict_taxa") / 100, modo = Math.round(val("ict_sentido"));
        var r, lbl;
        if (modo === 2) { r = (Math.pow(1 + t, 1 / 12) - 1) * 100; lbl = "Taxa mensal equivalente"; }
        else { r = (Math.pow(1 + t, 12) - 1) * 100; lbl = "Taxa anual equivalente"; }
        if (!isFinite(r)) return { principal: { label: lbl, valor: "—" }, linhas: [], obs: "Taxa inválida.", resultadoBruto: 0 };
        return { principal: { label: lbl, valor: pct(r, 4) },
          linhas: [{ label: "Taxa informada", valor: pct(val("ict_taxa"), 4) },
                   { label: "Se fosse simples (×12 ou ÷12)", valor: pct(modo === 2 ? val("ict_taxa") / 12 : val("ict_taxa") * 12, 4) }],
          obs: "A equivalência composta é a correta. A conta simples de ×12 superestima o ano.",
          resultadoBruto: r };
      },
      explica: "Mensal→anual: (1+i)^12 − 1. Anual→mensal: (1+i)^(1/12) − 1.",
    },
    {
      id: "inv-inflacao", cat: "Investimentos", nome: "Corrigir Valor pela Inflação",
      desc: "Quanto um valor precisa virar para manter o poder de compra.",
      chaves: ["inflacao", "corrigir", "poder de compra", "reajuste"],
      campos: [campo("iif_valor", "Valor original", "money"), campo("iif_taxa", "Inflação por período", "percent"), campo("iif_n", "Períodos", "integer")],
      calc: function () {
        var v = val("iif_valor"), i2 = val("iif_taxa") / 100, n = Math.max(0, Math.round(val("iif_n")));
        var corr = v * Math.pow(1 + i2, n);
        return { principal: { label: "Valor corrigido", valor: brl(corr) },
          linhas: [{ label: "Perda de poder de compra", valor: brl(corr - v) },
                   { label: "Inflação acumulada", valor: pct((Math.pow(1 + i2, n) - 1) * 100) }],
          resultadoBruto: corr };
      },
      explica: "Corrigido = Valor × (1 + inflação)^períodos.",
    },
    {
      id: "emp-sac", cat: "Empréstimos", nome: "Financiamento SAC",
      desc: "Amortização constante: parcelas decrescentes.",
      chaves: ["sac", "financiamento", "amortização", "parcela"],
      campos: [campo("esac_valor", "Valor financiado", "money"), campo("esac_taxa", "Juros por período", "percent"), campo("esac_n", "Número de parcelas", "integer")],
      calc: function () {
        var pv = val("esac_valor"), i2 = val("esac_taxa") / 100, n = Math.round(val("esac_n"));
        if (n <= 0) return { principal: { label: "Primeira parcela", valor: "—" }, linhas: [], obs: "Informe o número de parcelas.", resultadoBruto: 0 };
        var amort = pv / n;
        var primeira = amort + pv * i2;
        var ultima = amort + amort * i2;
        var totalJuros = 0;
        for (var k = 0; k < n; k++) totalJuros += (pv - amort * k) * i2;
        return { principal: { label: "Primeira parcela", valor: brl(primeira) },
          linhas: [{ label: "Última parcela", valor: brl(ultima) },
                   { label: "Amortização fixa", valor: brl(amort) },
                   { label: "Total de juros", valor: brl(totalJuros) },
                   { label: "Total pago", valor: brl(pv + totalJuros) }],
          obs: "No SAC a amortização é fixa e a parcela cai a cada mês.",
          resultadoBruto: primeira };
      },
      explica: "Amortização = Valor ÷ n. Parcela k = Amortização + Saldo devedor × juros.",
    },
    {
      id: "emp-comparar", cat: "Empréstimos", nome: "Comparar Duas Propostas",
      desc: "Qual financiamento custa menos no total.",
      chaves: ["comparar", "proposta", "financiamento", "qual compensa"],
      campos: [campo("ecp_p1", "Proposta A — parcela", "money"), campo("ecp_n1", "Proposta A — nº de parcelas", "integer"),
               campo("ecp_p2", "Proposta B — parcela", "money"), campo("ecp_n2", "Proposta B — nº de parcelas", "integer"),
               campo("ecp_valor", "Valor financiado (igual nas duas)", "money")],
      calc: function () {
        var t1 = val("ecp_p1") * val("ecp_n1"), t2 = val("ecp_p2") * val("ecp_n2");
        var v = val("ecp_valor");
        var melhor = t1 === t2 ? "Empate" : (t1 < t2 ? "Proposta A" : "Proposta B");
        return { principal: { label: "Mais barata", valor: melhor },
          linhas: [{ label: "Total da proposta A", valor: brl(t1) },
                   { label: "Total da proposta B", valor: brl(t2) },
                   { label: "Diferença", valor: brl(Math.abs(t1 - t2)) },
                   { label: "Juros da A", valor: brl(t1 - v) },
                   { label: "Juros da B", valor: brl(t2 - v) }],
          resultadoBruto: Math.min(t1, t2) };
      },
      explica: "Total pago = Parcela × Número de parcelas. Compara o desembolso total das duas.",
    },
    {
      id: "emp-custo-total", cat: "Empréstimos", nome: "Custo Total do Empréstimo",
      desc: "Quanto você paga além do que pegou.",
      chaves: ["custo total", "juros totais", "emprestimo"],
      campos: [campo("ect_valor", "Valor emprestado", "money"), campo("ect_parcela", "Valor da parcela", "money"), campo("ect_n", "Número de parcelas", "integer")],
      calc: function () {
        var v = val("ect_valor"), p = val("ect_parcela"), n = Math.round(val("ect_n"));
        var total = p * n, juros = total - v;
        return { principal: { label: "Total pago", valor: brl(total) },
          linhas: [{ label: "Juros pagos", valor: brl(juros) },
                   { label: "Juros sobre o valor", valor: pct(v > 0 ? juros / v * 100 : 0) },
                   { label: "Custo por parcela", valor: n > 0 ? brl(juros / n) : "—" }],
          resultadoBruto: total };
      },
      explica: "Total = Parcela × n. Juros = Total − Valor emprestado.",
    },
  ]);
})();

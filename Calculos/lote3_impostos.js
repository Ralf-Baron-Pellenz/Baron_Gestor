// ═══════════════════════════════════════════════════════════════════
//  Bapell Gestor Pro — Central de Cálculos
//  LOTE 3: IMPOSTOS, TRIBUTOS E MEIOS DE PAGAMENTO
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
    console.error("[Calculos/lote3_impostos.js] Motor nao encontrado. " +
      "Verifique se JS/calculos.js e carregado ANTES deste arquivo no calculos.html.");
    return;
  }

  var campo = API.campo, val = API.val, brl = API.brl, pct = API.pct, num = API.num;

  API.registrar([
    // ---------- CARTÃO ----------
  // ───────── CARTÃO / RECEBIMENTO ─────────
      {
        id: "valor-liquido-maquina", cat: "Cartão", nome: "Valor Líquido da Maquininha",
        desc: "Quanto você recebe após a taxa da maquininha.",
        campos: [campo("venda", "Valor da venda", "money"), campo("taxa", "Taxa da maquininha (%)", "percent")],
        calc: function () {
          var v = val("venda"), t = val("taxa");
          var liq = v * (1 - t / 100);
          return {
            principal: { label: "Você recebe", valor: brl(liq) },
            linhas: [{ label: "Taxa descontada", valor: brl(v - liq) }],
            resultadoBruto: liq,
          };
        },
        explica: "Líquido = Venda × (1 − Taxa ÷ 100).",
      },
  {
        id: "preco-repassar-taxa", cat: "Cartão", nome: "Preço para Repassar a Taxa",
        desc: "Quanto cobrar para receber o valor cheio após a taxa.",
        campos: [campo("desejado", "Valor que quer receber", "money"), campo("taxa", "Taxa (%)", "percent")],
        calc: function () {
          var d = val("desejado"), t = val("taxa");
          var preco = t < 100 ? d / (1 - t / 100) : 0;
          return {
            principal: { label: "Cobre do cliente", valor: brl(preco) },
            linhas: [{ label: "Taxa embutida", valor: brl(preco - d) }],
            resultadoBruto: preco,
            obs: t >= 100 ? "Taxa deve ser menor que 100%." : "",
          };
        },
        explica: "Preço = Valor desejado ÷ (1 − Taxa ÷ 100). Embute a taxa no preço.",
      },
  {
        id: "antecipacao", cat: "Cartão", nome: "Antecipação de Recebíveis",
        desc: "Valor líquido ao antecipar um recebimento.",
        campos: [campo("valor", "Valor a antecipar", "money"), campo("taxa", "Taxa de antecipação (%)", "percent")],
        calc: function () {
          var v = val("valor"), t = val("taxa");
          var liq = v * (1 - t / 100);
          return {
            principal: { label: "Valor antecipado", valor: brl(liq) },
            linhas: [{ label: "Custo da antecipação", valor: brl(v - liq) }],
            resultadoBruto: liq,
          };
        },
        explica: "Líquido = Valor × (1 − Taxa ÷ 100).",
      },
  {
        id: "parcelamento", cat: "Cartão", nome: "Valor da Parcela",
        desc: "Valor de cada parcela com ou sem juros.",
        campos: [
          campo("total", "Valor total", "money"),
          campo("parcelas", "Número de parcelas", "integer"),
          campo("juros", "Juros ao mês (%)", "percent", { placeholder: "0 para sem juros" }),
        ],
        calc: function () {
          var t = val("total"), n = val("parcelas"), j = val("juros") / 100;
          var parcela;
          if (n <= 0) parcela = 0;
          else if (j === 0) parcela = t / n;
          else parcela = (t * j * Math.pow(1 + j, n)) / (Math.pow(1 + j, n) - 1);
          var totalPago = parcela * n;
          return {
            principal: { label: "Valor da parcela", valor: brl(parcela) },
            linhas: [
              { label: n + "x de", valor: brl(parcela) },
              { label: "Total pago", valor: brl(totalPago) },
              { label: "Juros totais", valor: brl(totalPago - t) },
            ],
            resultadoBruto: parcela,
          };
        },
        explica: "Sem juros: Total ÷ Parcelas. Com juros: sistema Price (parcelas fixas).",
      },
    // ---------- IMPOSTOS ----------
  // ───────── IMPOSTOS (com aviso) ─────────
      {
        id: "simples-estimado", cat: "Impostos", nome: "Simples Nacional (estimativa)",
        desc: "Estimativa do imposto pela alíquota efetiva.",
        campos: [
          campo("faturamento", "Faturamento do mês", "money"),
          campo("aliquota", "Alíquota efetiva (%)", "percent", { placeholder: "Do seu anexo/faixa" }),
        ],
        calc: function () {
          var f = val("faturamento"), a = val("aliquota");
          var imposto = f * (a / 100);
          return {
            principal: { label: "Imposto estimado", valor: brl(imposto) },
            linhas: [{ label: "Faturamento", valor: brl(f) }, { label: "Sobra", valor: brl(f - imposto) }],
            resultadoBruto: imposto,
            obs: "ESTIMATIVA. A alíquota do Simples depende do anexo, faixa e fator R. Confirme com seu contador.",
          };
        },
        explica: "Imposto = Faturamento × Alíquota efetiva. A alíquota efetiva vem da tabela do seu anexo do Simples.",
        aviso: true,
      },
  {
        id: "icms-estimado", cat: "Impostos", nome: "ICMS sobre Venda (estimativa)",
        desc: "Estimativa do ICMS por alíquota.",
        campos: [
          campo("valor", "Valor da operação", "money"),
          campo("aliquota", "Alíquota do ICMS (%)", "percent"),
        ],
        calc: function () {
          var v = val("valor"), a = val("aliquota");
          var icms = v * (a / 100);
          return {
            principal: { label: "ICMS estimado", valor: brl(icms) },
            linhas: [{ label: "Base de cálculo", valor: brl(v) }],
            resultadoBruto: icms,
            obs: "ESTIMATIVA. A alíquota de ICMS varia por estado, produto (NCM) e tipo de operação. Confirme com seu contador.",
          };
        },
        explica: "ICMS = Base de cálculo × Alíquota. Cálculo simplificado, sem ST, DIFAL ou reduções.",
        aviso: true,
      },
  {
        id: "difal", cat: "Impostos", nome: "DIFAL (Diferencial de Alíquota)",
        desc: "Diferença entre a alíquota interna do destino e a interestadual.",
        campos: [
          campo("valor", "Valor da operação", "money"),
          campo("interna", "Alíquota interna do destino (%)", "percent"),
          campo("inter", "Alíquota interestadual (%)", "percent", { placeholder: "4, 7 ou 12" }),
        ],
        calc: function () {
          var v = val("valor"), ai = val("interna"), ae = val("inter");
          var difal = v * ((ai - ae) / 100);
          return {
            principal: { label: "DIFAL a recolher", valor: brl(difal) },
            linhas: [
              { label: "Diferença de alíquota", valor: pct(ai - ae) },
              { label: "Base de cálculo", valor: brl(v) },
            ],
            resultadoBruto: difal,
            obs: "Cálculo simplificado. Alguns estados exigem base dupla e adicional de FECP — confira a regra do estado de destino.",
          };
        },
        explica: "DIFAL = Valor × (Alíquota interna do destino − Alíquota interestadual). Devido em vendas para outro estado a consumidor final.",
        aviso: true,
      },
  {
        id: "st", cat: "Impostos", nome: "ICMS-ST (Substituição Tributária)",
        desc: "ICMS retido por substituição tributária usando MVA.",
        campos: [
          campo("valor", "Valor do produto", "money"),
          campo("mva", "MVA / IVA-ST (%)", "percent"),
          campo("aliqinter", "Alíquota da operação própria (%)", "percent"),
          campo("aliqinterna", "Alíquota interna do destino (%)", "percent"),
        ],
        calc: function () {
          var v = val("valor"), mva = val("mva"), ap = val("aliqinter"), ai = val("aliqinterna");
          var icmsProprio = v * (ap / 100);
          var baseST = v * (1 + mva / 100);
          var icmsST = baseST * (ai / 100) - icmsProprio;
          if (icmsST < 0) icmsST = 0;
          return {
            principal: { label: "ICMS-ST a recolher", valor: brl(icmsST) },
            linhas: [
              { label: "Base de cálculo ST", valor: brl(baseST) },
              { label: "ICMS próprio", valor: brl(icmsProprio) },
            ],
            resultadoBruto: icmsST,
            obs: "A MVA varia por produto e estado. Alguns casos têm MVA ajustada para operações interestaduais.",
          };
        },
        explica: "ICMS-ST = (Valor × (1 + MVA%) × Alíquota interna) − ICMS próprio. A MVA é definida por convênio/protocolo por produto.",
        aviso: true,
      },
  {
        id: "iss", cat: "Impostos", nome: "ISS (Serviços)",
        desc: "Imposto sobre serviços, definido pelo município.",
        campos: [
          campo("valor", "Valor do serviço", "money"),
          campo("aliquota", "Alíquota do ISS (%)", "percent", { placeholder: "2 a 5" }),
        ],
        calc: function () {
          var v = val("valor"), a = val("aliquota");
          var iss = v * (a / 100);
          return {
            principal: { label: "ISS estimado", valor: brl(iss) },
            linhas: [{ label: "Base de cálculo", valor: brl(v) }, { label: "Líquido", valor: brl(v - iss) }],
            resultadoBruto: iss,
          };
        },
        explica: "ISS = Valor do serviço × Alíquota. A alíquota é municipal (entre 2% e 5%) e varia por tipo de serviço.",
        aviso: true,
      },
  {
        id: "ipi", cat: "Impostos", nome: "IPI",
        desc: "Imposto sobre Produtos Industrializados, por alíquota da TIPI.",
        campos: [
          campo("valor", "Valor do produto", "money"),
          campo("aliquota", "Alíquota do IPI (%)", "percent"),
        ],
        calc: function () {
          var v = val("valor"), a = val("aliquota");
          var ipi = v * (a / 100);
          return {
            principal: { label: "IPI", valor: brl(ipi) },
            linhas: [{ label: "Valor com IPI", valor: brl(v + ipi) }],
            resultadoBruto: ipi,
          };
        },
        explica: "IPI = Valor × Alíquota. A alíquota vem da TIPI e depende do NCM do produto.",
        aviso: true,
      },
  {
        id: "lucro-presumido", cat: "Impostos", nome: "Lucro Presumido (estimativa)",
        desc: "IRPJ e CSLL sobre a base presumida do faturamento.",
        campos: [
          campo("faturamento", "Faturamento do período", "money"),
          campo("presuncao", "Presunção de lucro (%)", "percent", { placeholder: "8, 16 ou 32" }),
        ],
        calc: function () {
          var f = val("faturamento"), p = val("presuncao");
          var base = f * (p / 100);
          var irpj = base * 0.15;
          var csll = base * 0.09;
          return {
            principal: { label: "IRPJ + CSLL estimado", valor: brl(irpj + csll) },
            linhas: [
              { label: "Base presumida", valor: brl(base) },
              { label: "IRPJ (15%)", valor: brl(irpj) },
              { label: "CSLL (9%)", valor: brl(csll) },
            ],
            resultadoBruto: irpj + csll,
            obs: "Não inclui PIS, COFINS, adicional de IRPJ (10% sobre o que exceder R$ 20 mil/mês) nem outros tributos. A presunção varia por atividade.",
          };
        },
        explica: "Base = Faturamento × Presunção. IRPJ = Base × 15%, CSLL = Base × 9%. A presunção depende da atividade (comércio 8%, serviços 32%).",
        aviso: true,
      },
  {
        id: "pis-cofins", cat: "Impostos", nome: "PIS e COFINS (estimativa)",
        desc: "PIS e COFINS sobre o faturamento pela alíquota do seu regime.",
        campos: [
          campo("faturamento", "Faturamento", "money"),
          campo("pis", "Alíquota PIS (%)", "percent", { placeholder: "0,65 ou 1,65" }),
          campo("cofins", "Alíquota COFINS (%)", "percent", { placeholder: "3 ou 7,6" }),
        ],
        calc: function () {
          var f = val("faturamento"), p = val("pis"), c = val("cofins");
          var vPis = f * (p / 100), vCofins = f * (c / 100);
          return {
            principal: { label: "PIS + COFINS", valor: brl(vPis + vCofins) },
            linhas: [
              { label: "PIS", valor: brl(vPis) },
              { label: "COFINS", valor: brl(vCofins) },
            ],
            resultadoBruto: vPis + vCofins,
            obs: "No regime cumulativo: PIS 0,65% e COFINS 3%. No não cumulativo: 1,65% e 7,6%, mas com direito a créditos. Confirme seu regime.",
          };
        },
        explica: "PIS = Faturamento × Alíquota PIS; COFINS = Faturamento × Alíquota COFINS. As alíquotas dependem do regime (cumulativo ou não cumulativo).",
        aviso: true,
      },
    {
      id: "trib-valor-liquido", cat: "Impostos", nome: "Valor Líquido Após Imposto",
      desc: "Quanto sobra depois de descontar a alíquota.",
      chaves: ["liquido", "imposto", "desconto", "aliquota"],
      aviso: true,
      campos: [campo("tvl_bruto", "Valor bruto", "money"), campo("tvl_aliq", "Alíquota", "percent")],
      calc: function () {
        var b = val("tvl_bruto"), a = val("tvl_aliq");
        var imp = b * a / 100;
        return { principal: { label: "Valor líquido", valor: brl(b - imp) },
          linhas: [{ label: "Valor bruto", valor: brl(b) }, { label: "Imposto", valor: brl(imp) }],
          resultadoBruto: b - imp };
      },
      explica: "Líquido = Bruto − (Bruto × Alíquota ÷ 100).",
    },
    {
      id: "trib-valor-bruto", cat: "Impostos", nome: "Valor Bruto para um Líquido Desejado",
      desc: "Quanto faturar para sobrar um valor exato.",
      chaves: ["bruto", "por dentro", "gross up", "liquido desejado"],
      aviso: true,
      campos: [campo("tvb_liq", "Líquido desejado", "money"), campo("tvb_aliq", "Alíquota", "percent")],
      calc: function () {
        var l = val("tvb_liq"), a = val("tvb_aliq");
        if (a >= 100) return { principal: { label: "Valor bruto", valor: "—" }, linhas: [], obs: "A alíquota precisa ser menor que 100%.", resultadoBruto: 0 };
        var b = l / (1 - a / 100);
        return { principal: { label: "Valor bruto", valor: brl(b) },
          linhas: [{ label: "Imposto", valor: brl(b - l) }, { label: "Líquido", valor: brl(l) }],
          resultadoBruto: b };
      },
      explica: "Bruto = Líquido ÷ (1 − Alíquota ÷ 100). É o cálculo 'por dentro'.",
    },
    {
      id: "trib-aliquota-efetiva", cat: "Impostos", nome: "Alíquota Efetiva",
      desc: "Percentual real de imposto sobre o faturamento.",
      chaves: ["aliquota efetiva", "carga tributaria", "percentual real"],
      aviso: true,
      campos: [campo("tae_fat", "Faturamento", "money"), campo("tae_imp", "Total de impostos pagos", "money")],
      calc: function () {
        var f = val("tae_fat"), im = val("tae_imp");
        if (f <= 0) return { principal: { label: "Alíquota efetiva", valor: "—" }, linhas: [], obs: "Informe o faturamento.", resultadoBruto: 0 };
        return { principal: { label: "Alíquota efetiva", valor: pct(im / f * 100) },
          linhas: [{ label: "Faturamento", valor: brl(f) }, { label: "Impostos", valor: brl(im) },
                   { label: "Sobra após impostos", valor: brl(f - im) }],
          resultadoBruto: im / f * 100 };
      },
      explica: "Alíquota efetiva = Impostos pagos ÷ Faturamento × 100.",
    },
    {
      id: "trib-base-calculo", cat: "Impostos", nome: "Base de Cálculo e Valor do Imposto",
      desc: "Aplica uma alíquota sobre uma base, com redução opcional.",
      chaves: ["base de calculo", "reducao", "imposto"],
      aviso: true,
      campos: [campo("tbc_valor", "Valor da operação", "money"), campo("tbc_red", "Redução da base", "percent"), campo("tbc_aliq", "Alíquota", "percent")],
      calc: function () {
        var v = val("tbc_valor"), r = val("tbc_red"), a = val("tbc_aliq");
        var base = v * (1 - r / 100);
        var imp = base * a / 100;
        return { principal: { label: "Valor do imposto", valor: brl(imp) },
          linhas: [{ label: "Base de cálculo", valor: brl(base) },
                   { label: "Redução aplicada", valor: brl(v - base) },
                   { label: "Alíquota efetiva sobre a operação", valor: pct(v > 0 ? imp / v * 100 : 0) }],
          resultadoBruto: imp };
      },
      explica: "Base = Valor × (1 − Redução ÷ 100). Imposto = Base × Alíquota ÷ 100.",
    },
    {
      id: "trib-comparar-aliquotas", cat: "Impostos", nome: "Comparar Duas Alíquotas",
      desc: "Diferença de imposto entre dois cenários.",
      chaves: ["comparar", "aliquota", "regime", "simulacao"],
      aviso: true,
      campos: [campo("tca_valor", "Valor base", "money"), campo("tca_a", "Alíquota A", "percent"), campo("tca_b", "Alíquota B", "percent")],
      calc: function () {
        var v = val("tca_valor");
        var ia = v * val("tca_a") / 100, ib = v * val("tca_b") / 100;
        return { principal: { label: "Diferença", valor: brl(Math.abs(ia - ib)) },
          linhas: [{ label: "Imposto com a alíquota A", valor: brl(ia) },
                   { label: "Imposto com a alíquota B", valor: brl(ib) },
                   { label: "Menor carga", valor: ia === ib ? "Iguais" : (ia < ib ? "Alíquota A" : "Alíquota B") }],
          resultadoBruto: Math.abs(ia - ib) };
      },
      explica: "Compara Valor × Alíquota nos dois cenários. Simulação matemática, não recomendação de regime.",
    },
    {
      id: "trib-imposto-sobre-lucro", cat: "Impostos", nome: "Imposto sobre o Lucro",
      desc: "Aplica uma alíquota sobre o lucro apurado.",
      chaves: ["imposto sobre lucro", "irpj", "csll"],
      aviso: true,
      campos: [campo("til_rec", "Receita", "money"), campo("til_cust", "Custos e despesas", "money"), campo("til_aliq", "Alíquota sobre o lucro", "percent")],
      calc: function () {
        var l = val("til_rec") - val("til_cust");
        var imp = l > 0 ? l * val("til_aliq") / 100 : 0;
        return { principal: { label: "Imposto sobre o lucro", valor: brl(imp) },
          linhas: [{ label: "Lucro apurado", valor: brl(l) },
                   { label: "Lucro após o imposto", valor: brl(l - imp) }],
          obs: l <= 0 ? "Sem lucro no período: não há base para o imposto neste cálculo." : null,
          resultadoBruto: imp };
      },
      explica: "Lucro = Receita − Custos. Imposto = Lucro × Alíquota ÷ 100, quando o lucro é positivo.",
    },
    // ---------- CARTÕES E MEIOS DE PAGAMENTO ----------
    {
      id: "cart-bruto-para-liquido", cat: "Cartão", nome: "Quanto Cobrar para Receber X",
      desc: "Preço que garante o líquido desejado após a taxa.",
      chaves: ["cartao", "taxa", "quanto cobrar", "liquido"],
      campos: [campo("cbl_liq", "Quanto quer receber", "money"), campo("cbl_taxa", "Taxa da maquininha", "percent")],
      calc: function () {
        var l = val("cbl_liq"), t = val("cbl_taxa");
        if (t >= 100) return { principal: { label: "Cobrar", valor: "—" }, linhas: [], obs: "A taxa precisa ser menor que 100%.", resultadoBruto: 0 };
        var b = l / (1 - t / 100);
        return { principal: { label: "Cobrar", valor: brl(b) },
          linhas: [{ label: "Taxa", valor: brl(b - l) }, { label: "Você recebe", valor: brl(l) },
                   { label: "Acréscimo sobre o líquido", valor: pct(l > 0 ? (b - l) / l * 100 : 0) }],
          resultadoBruto: b };
      },
      explica: "Cobrar = Líquido ÷ (1 − Taxa ÷ 100).",
    },
    {
      id: "cart-comparar-pagamentos", cat: "Cartão", nome: "Comparar Formas de Pagamento",
      desc: "Qual meio de pagamento deixa mais líquido.",
      chaves: ["comparar", "pix", "debito", "credito", "forma de pagamento"],
      campos: [campo("ccp_valor", "Valor da venda", "money"),
               campo("ccp_t1", "Forma A — taxa", "percent"), campo("ccp_f1", "Forma A — taxa fixa", "money"),
               campo("ccp_t2", "Forma B — taxa", "percent"), campo("ccp_f2", "Forma B — taxa fixa", "money")],
      calc: function () {
        var v = val("ccp_valor");
        var a = v - v * val("ccp_t1") / 100 - val("ccp_f1");
        var b = v - v * val("ccp_t2") / 100 - val("ccp_f2");
        return { principal: { label: "Melhor forma", valor: a === b ? "Empate" : (a > b ? "Forma A" : "Forma B") },
          linhas: [{ label: "Líquido na forma A", valor: brl(a) },
                   { label: "Líquido na forma B", valor: brl(b) },
                   { label: "Diferença", valor: brl(Math.abs(a - b)) }],
          resultadoBruto: Math.max(a, b) };
      },
      explica: "Líquido = Valor − (Valor × Taxa%) − Taxa fixa, para cada forma.",
    },
    {
      id: "cart-impacto-taxa-lucro", cat: "Cartão", nome: "Impacto da Taxa no Lucro",
      desc: "Quanto a maquininha consome da sua margem.",
      chaves: ["impacto", "taxa", "margem", "maquininha"],
      campos: [campo("citl_venda", "Preço de venda", "money"), campo("citl_custo", "Custo do produto", "money"), campo("citl_taxa", "Taxa", "percent")],
      calc: function () {
        var v = val("citl_venda"), c = val("citl_custo"), t = v * val("citl_taxa") / 100;
        var semTaxa = v - c, comTaxa = v - c - t;
        return { principal: { label: "Lucro após a taxa", valor: brl(comTaxa) },
          linhas: [{ label: "Lucro sem a taxa", valor: brl(semTaxa) },
                   { label: "Taxa em R$", valor: brl(t) },
                   { label: "Margem consumida", valor: pct(semTaxa > 0 ? t / semTaxa * 100 : 0) + " do lucro" }],
          resultadoBruto: comTaxa };
      },
      explica: "A taxa incide sobre a VENDA, mas consome o LUCRO — por isso o impacto percentual é maior do que a taxa.",
    },
    {
      id: "cart-parcelado-liquido", cat: "Cartão", nome: "Venda Parcelada — Líquido por Parcela",
      desc: "Quanto entra por mês numa venda parcelada.",
      chaves: ["parcelado", "parcela", "recebimento", "fluxo"],
      campos: [campo("cpl_valor", "Valor da venda", "money"), campo("cpl_n", "Número de parcelas", "integer"), campo("cpl_taxa", "Taxa total", "percent")],
      calc: function () {
        var v = val("cpl_valor"), n = Math.max(1, Math.round(val("cpl_n")));
        var liq = v - v * val("cpl_taxa") / 100;
        return { principal: { label: "Líquido por parcela", valor: brl(liq / n) },
          linhas: [{ label: "Líquido total", valor: brl(liq) },
                   { label: "Taxa retida", valor: brl(v - liq) },
                   { label: "Parcela cobrada do cliente", valor: brl(v / n) },
                   { label: "Prazo para receber tudo", valor: num(n, 0) + " meses" }],
          obs: "Considera recebimento parcelado. Se você antecipa, use a calculadora de antecipação.",
          resultadoBruto: liq / n };
      },
      explica: "Líquido = Valor − Taxa. Dividido pelo número de parcelas, dá o que entra por mês.",
    },
  ]);
})();

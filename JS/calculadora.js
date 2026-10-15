// ═══════════════════════════════════════════
//  Bapell Gestor Pro — calculadora.js
//  v4.0 — Divisão de Campos: Custo vs Venda
// ═══════════════════════════════════════════
"use strict";
/**
 * Extrai o valor numérico de um input (string formatada → número).
 *
 * Regras (padrão brasileiro):
 *  1. Se houver VÍRGULA, ela é o separador decimal e os pontos são de milhar.
 *     "1.500,00" → 1500    |  "10,50" → 10.5
 *  2. Sem vírgula, o ponto é ambíguo. Resolve-se pelo número de dígitos:
 *     - Um único ponto com grupo final de EXATAMENTE 3 dígitos, OU vários
 *       pontos todos com grupos de 3 → separador de MILHAR.
 *       "1.500" → 1500    |  "1.234.567" → 1234567
 *     - Um único ponto com outro número de dígitos → separador DECIMAL.
 *       "1.5" → 1.5       |  "10.50" → 10.5   |  "0.97" → 0.97
 *     - VÁRIOS pontos que NÃO formam padrão de milhar (ex.: "1.234.56",
 *       hábito de quem digita milhar na mão e erra) → o ÚLTIMO ponto é o
 *       decimal e os anteriores são milhar: "1.234.56" → 1234.56.
 *       Antes, o parseFloat parava no 2º ponto e devolvia 1.234 — um custo
 *       de R$ 1.234,56 virava R$ 1,23.
 */
function parseFormattedValue(val) {
  if (typeof val === 'number') return isFinite(val) ? val : 0;
  if (val === null || val === undefined || val === '') return 0;
  const str = String(val).trim();
  if (str === '') return 0;
  // Caso 1: vírgula presente → decimal BR, pontos são milhar
  if (str.includes(',')) {
    return parseFloat(
      str.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
    ) || 0;
  }
  // Caso 2: sem vírgula, mas com ponto(s)
  if (str.includes('.')) {
    const negativo = str.trim().startsWith('-');
    const limpo = str.replace(/[^\d.]/g, '');
    const partes = limpo.split('.');
    if (partes.length > 1 && partes[0].length > 0) {
      const gruposDepois = partes.slice(1);
      const todosMilhar = gruposDepois.every((p) => p.length === 3);
      if (todosMilhar) {
        // "1.500" ou "1.234.567" → milhar puro
        const n = parseFloat(partes.join('')) || 0;
        return negativo ? -n : n;
      }
      if (partes.length > 2) {
        // Vários pontos que NÃO são todos milhar (ex.: "1.234.56"):
        // último grupo = decimal, o resto = milhar.
        const decimal = gruposDepois[gruposDepois.length - 1];
        const inteiroPartes = partes.slice(0, -1);
        const n = parseFloat(inteiroPartes.join('') + '.' + decimal) || 0;
        return negativo ? -n : n;
      }
      // Um único ponto com grupo != 3 dígitos → decimal comum, cai no fim
    }
  }
  return parseFloat(str) || 0;
}
/**
 * Formata um número para o padrão monetário brasileiro SEM o "R$".
 * Não-finitos (NaN, Infinity) viram "0,00".
 */
function formatMoneyBR(val) {
  const n = parseFloat(val);
  if (!isFinite(n)) return "0,00";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** Formata percentual mantendo as casas digitadas (até 2), sem forçar ",00". */
function formatPercentBR(val) {
  const n = parseFloat(String(val).replace(",", "."));
  if (!isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
/**
 * formatBRL de reserva: normalmente vem do utils.js (carregado antes). Só é
 * definida aqui se não existir, para a calculadora nunca quebrar por ordem
 * de scripts. Ambas tratam não-finitos como "R$ 0,00".
 */
function _formatBRL(value) {
  if (typeof formatBRL === "function") return formatBRL(value);
  const n = parseFloat(value);
  if (!isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
/** Extrai os campos personalizados de um kit isolado. Inválidos viram 0. */
function extractCustomFields(container) {
  let extraRS = 0;
  let extraPCT = 0;
  if (!container) return { extraRS, extraPCT };
  container.querySelectorAll(".custom-field-input").forEach((el) => {
    const tipo = el.dataset.cfTipo || "RS";
    const valor = parseFormattedValue(el.value);
    if (!isFinite(valor)) return;
    if (tipo === "RS")  extraRS  += valor;
    if (tipo === "PCT") extraPCT += valor;
  });
  return { extraRS, extraPCT };
}
/** Lê os inputs principais da calculadora da tela atual. */
function getCalcInputs() {
  function val(id) {
    const el = document.getElementById(id);
    if (el && el.dataset.campoOculto === "1") return 0; // campo oculto não soma
    return el && el.value !== "" ? parseFormattedValue(el.value) : 0;
  }
  function activeToggle() {
    // Restringe ao container da margem para não pegar um .toggle-btn.active de
    // outro componente (ex.: modal de campo personalizado) que exista na tela.
    const escopo = document.getElementById("margemToggle") || document;
    const btn = escopo.querySelector(".toggle-btn.active");
    return btn ? btn.dataset.type || "pct" : "pct";
  }
  let extraCustoRS  = 0;
  let extraVendaRS  = 0;
  let extraVendaPCT = 0;
  const custoPctSobreCustoTotal = [];
  const custoPctSobrePrecoCusto = [];
  document.querySelectorAll(".custom-field-input").forEach((el) => {
    if (!el.closest('.kit-card')) {
      const tipo  = el.dataset.cfTipo || "RS";
      const cat   = el.dataset.cfCategoria || "venda";
      const valor = parseFormattedValue(el.value);
      if (cat === "custo") {
        if (tipo === "RS")  extraCustoRS  += valor;
        if (tipo === "PCT") {
          const base = el.dataset.cfBase || "custoTotal";
          if (base === "precoCusto") custoPctSobrePrecoCusto.push(valor);
          else custoPctSobreCustoTotal.push(valor);
        }
      } else {
        if (tipo === "RS")  extraVendaRS  += valor;
        if (tipo === "PCT") extraVendaPCT += valor;
      }
    }
  });
  return {
    custo:        val("custoCusto"),
    embalagem:    val("custoEmbalagem"),
    etiqueta:     val("custoEtiqueta"),
    fretePago:    val("custoFrete"),
    // Cascata de imposto sobre o custo (cada uma sobre o resultado da anterior):
    // Impostos sobre o custo. IPI, DIFAL e ST têm base fixa no Preço de Custo;
    // a Alíquota incide sobre o Custo Total da Unidade. Campos fixos da seção.
    ipiPct:       val("custoIpi"),
    difalPct:     val("custoDifal"),
    stPct:        val("custoSt"),
    aliquotaPct:  val("custoAliquota"),
    freteProduto: val("freteProduto"),
    taxaFixa:     val("taxaFixa"),
    impostoNF:    val("impostoNF"),
    taxa:         val("taxaPlataforma"),
    margem:       val("margemValor"),
    margemTipo:   activeToggle(),
    extraCustoRS,
    extraVendaRS,
    extraVendaPCT,
    custoPctSobreCustoTotal,
    custoPctSobrePrecoCusto
  };
}
/* ══════════════════════════════════════════════════════════════
   HELPERS DE CÁLCULO (compartilhados por unidade e kit)
   ══════════════════════════════════════════════════════════════ */
// Soma máxima de (overhead + margem). Acima disso o divisor fica tão pequeno
// que o preço explode — matematicamente inviável.
const LIMITE_PERCENTUAL = 99;
function _num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) ? n : 0;
}
function _r2(v) {
  return isFinite(v) ? parseFloat(v.toFixed(2)) : 0;
}
function _custoTotalUnidade(inputs, custo, embalagem, etiqueta, fretePago, extraCustoRS) {
  const subtotal = custo + embalagem + etiqueta + fretePago + extraCustoRS;
  const ipi      = _num(inputs.ipiPct);
  const difal    = _num(inputs.difalPct);
  const st       = _num(inputs.stPct);
  const aliquota = _num(inputs.aliquotaPct);

  // IPI, DIFAL e ST têm base FIXA no Preço de Custo (o valor puro digitado). Não
  // mudam de base nem sofrem influência um do outro.
  const valorIpi   = custo * (ipi / 100);
  const valorDifal = custo * (difal / 100);
  const valorSt    = custo * (st / 100);

  // Custo da unidade com tudo somado, ANTES da alíquota.
  let custoBaseRS = subtotal + valorIpi + valorDifal + valorSt;

  // Adicionais personalizados de custo (lógica existente, inalterada). Entram
  // antes da alíquota para comporem o Custo Total da Unidade.
  const pctSobrePreco = Array.isArray(inputs.custoPctSobrePrecoCusto) ? inputs.custoPctSobrePrecoCusto : [];
  const pctSobreTotal = Array.isArray(inputs.custoPctSobreCustoTotal) ? inputs.custoPctSobreCustoTotal : [];
  let acrescimo = 0;
  pctSobrePreco.forEach((p) => { acrescimo += custo * (_num(p) / 100); });
  pctSobreTotal.forEach((p) => { acrescimo += custoBaseRS * (_num(p) / 100); });
  custoBaseRS = custoBaseRS + acrescimo;

  // A Alíquota incide sobre o Custo Total da Unidade já atualizado (com todos
  // os valores acima somados).
  const valorAliquota = custoBaseRS * (aliquota / 100);

  return custoBaseRS + valorAliquota;
}

/**
 * Soma, em reais, apenas os impostos aplicados ao custo (IPI + DIFAL + ST +
 * Alíquota). Não altera o custo total; serve só para exibir o campo
 * "Total em Impostos". Usa exatamente as mesmas bases da _custoTotalUnidade:
 * IPI/DIFAL/ST sobre o Preço de Custo e a Alíquota sobre o Custo Total.
 */
function _totalImpostosCusto(inputs, custo, embalagem, etiqueta, fretePago, extraCustoRS) {
  const ipi      = _num(inputs.ipiPct);
  const difal    = _num(inputs.difalPct);
  const st       = _num(inputs.stPct);
  const aliquota = _num(inputs.aliquotaPct);

  const valorIpi   = custo * (ipi / 100);
  const valorDifal = custo * (difal / 100);
  const valorSt    = custo * (st / 100);

  // Base da alíquota = mesmo custo total (antes da alíquota) usado na função
  // principal, para o valor bater exatamente.
  const subtotal = custo + embalagem + etiqueta + fretePago + extraCustoRS;
  let custoBaseRS = subtotal + valorIpi + valorDifal + valorSt;
  const pctSobrePreco = Array.isArray(inputs.custoPctSobrePrecoCusto) ? inputs.custoPctSobrePrecoCusto : [];
  const pctSobreTotal = Array.isArray(inputs.custoPctSobreCustoTotal) ? inputs.custoPctSobreCustoTotal : [];
  let acrescimo = 0;
  pctSobrePreco.forEach((p) => { acrescimo += custo * (_num(p) / 100); });
  pctSobreTotal.forEach((p) => { acrescimo += custoBaseRS * (_num(p) / 100); });
  custoBaseRS = custoBaseRS + acrescimo;
  const valorAliquota = custoBaseRS * (aliquota / 100);

  return valorIpi + valorDifal + valorSt + valorAliquota;
}
/**
 * Núcleo da precificação. Usado por unidade (qty=1) e kit (qty=N).
 *
 * `inviavel` distingue dois casos que a UI trata diferente:
 *   - motivo "percentual": taxas+margem ≥ limite → preço explodiria (erro).
 *   - motivo "semCusto": custo zero e sem margem fixa → não há o que precificar
 *     (não é erro; é campo ainda vazio). A UI não deve gritar nesse caso.
 */
function _precificar(custoParaPreco, overheadPct, margem, margemTipo, qty, custoBase, custoTotalDisplay) {
  const _zero = (motivo) => ({
    precoVenda: 0,
    lucro: 0,
    margemReal: 0,
    custoBase: _r2(custoBase),
    custoTotalDisplay: _r2(custoTotalDisplay),
    inviavel: true,
    motivo: motivo || "percentual",
  });
  let precoVenda, lucro;
  if (margemTipo === 'pct') {
    const somaPercentual = overheadPct + margem;
    if (somaPercentual >= LIMITE_PERCENTUAL) return _zero("percentual");
    const divisor = 1 - somaPercentual / 100;
    precoVenda = custoParaPreco / divisor;
    lucro = precoVenda * (margem / 100);
  } else {
    if (overheadPct >= LIMITE_PERCENTUAL) return _zero("percentual");
    const divisorBase = 1 - overheadPct / 100;
    const lucroTotal = margem * qty;
    precoVenda = (custoParaPreco + lucroTotal) / divisorBase;
    lucro = lucroTotal;
  }
  if (!isFinite(precoVenda) || !isFinite(lucro)) return _zero("percentual");
  // Preço zero por ausência de custo E de margem: não é erro de configuração,
  // é entrada ainda incompleta. Marca com motivo próprio para a UI não avisar.
  if (precoVenda <= 0 && custoParaPreco <= 0 && (margemTipo !== 'rs' || margem <= 0)) {
    return _zero("semCusto");
  }
  precoVenda = Math.max(0, precoVenda);
  lucro = Math.max(0, lucro);
  const margemReal = precoVenda > 0 ? (lucro / precoVenda) * 100 : 0;
  return {
    precoVenda: _r2(precoVenda),
    lucro: _r2(lucro),
    margemReal: _r2(margemReal),
    custoBase: _r2(custoBase),
    custoTotalDisplay: _r2(custoTotalDisplay),
    inviavel: false,
    motivo: "",
  };
}
/** FÓRMULA UNIDADE */
/* ═══════════════════════════════════════════════════════════════════
   REGRA DA TAXA FIXA DA PLATAFORMA

   A taxa fixa só é cobrada quando o VALOR DE VENDA daquela configuração
   fica até R$ 79,00. Acima disso, a plataforma não cobra — e o sistema
   também não pode somá-la ao custo.

   A decisão é POR CONFIGURAÇÃO, não por produto:
     · a unidade pode cobrar e o kit de 2 não;
     · no Mercado Livre, o Premium pode cobrar e o Clássico não,
       porque cada modalidade tem a sua própria taxa e o seu preço.

   ── POR QUE ISSO NÃO É UM SIMPLES "IF" ────────────────────────────
   A taxa fixa entra no CUSTO que forma o preço:

       preço = (custo + taxaFixa + …) / (1 − percentuais)

   Ou seja: a taxa muda o próprio valor que decide se ela deve existir.
   Há uma faixa em que os dois caminhos se contradizem — sem a taxa o
   preço fica até 79 (logo deveria cobrar), e com a taxa passa de 79
   (logo não deveria).

   Exemplo real, com overhead de 20% e margem de 20%:
       custo R$ 45  →  sem taxa R$ 75,00   ·   com taxa R$ 83,33

   Nesse conflito o sistema COBRA a taxa. É a escolha conservadora:
   anunciar mais caro e a plataforma não cobrar faz o lojista receber
   a mais; anunciar mais barato e ela cobrar faz receber a menos — e
   ele só descobre quando o dinheiro cai.
   ═══════════════════════════════════════════════════════════════════ */

const LIMITE_TAXA_FIXA = 79;

/**
 * Decide se a taxa fixa entra, e devolve o resultado já calculado.
 *
 * @param {number} taxaFixa   valor cadastrado pelo usuário
 * @param {function} calcular recebe a taxa a aplicar e devolve o resultado
 * @returns {object} resultado de _precificar, com `taxaFixaAplicada`
 */
function _comRegraDaTaxaFixa(taxaFixa, calcular) {
  // Sem taxa cadastrada não há o que decidir.
  if (!taxaFixa || taxaFixa <= 0) {
    const r = calcular(0);
    r.taxaFixaAplicada = 0;
    r.taxaFixaIsenta = false;
    return r;
  }

  // 1ª passada SEM a taxa: mostra o preço mínimo possível daquela
  // configuração. Se ele já passa do limite, a taxa está fora.
  const sem = calcular(0);
  if (!sem.inviavel && sem.precoVenda > LIMITE_TAXA_FIXA) {
    sem.taxaFixaAplicada = 0;
    sem.taxaFixaIsenta = true; // isento por ultrapassar o limite
    return sem;
  }

  // Até o limite (ou inviável de calcular): a taxa entra.
  const com = calcular(taxaFixa);
  com.taxaFixaAplicada = taxaFixa;
  com.taxaFixaIsenta = false;
  return com;
}

function calcularUnidade(inputs) {
  const custo        = _num(inputs.custo);
  const embalagem    = _num(inputs.embalagem);
  const etiqueta     = _num(inputs.etiqueta);
  const fretePago    = _num(inputs.fretePago);
  const freteProduto = _num(inputs.freteProduto);
  const taxaFixa     = _num(inputs.taxaFixa);
  const impostoNF    = _num(inputs.impostoNF);
  const taxa         = _num(inputs.taxa);
  const margem       = _num(inputs.margem);
  const margemTipo   = inputs.margemTipo || "pct";
  const extraCustoRS  = _num(inputs.extraCustoRS);
  const extraVendaRS  = _num(inputs.extraVendaRS);
  const extraVendaPCT = _num(inputs.extraVendaPCT);
  const custoTotalDisplay = _custoTotalUnidade(inputs, custo, embalagem, etiqueta, fretePago, extraCustoRS);
  const overheadPct = impostoNF + taxa + extraVendaPCT;

  // A taxa fixa deixou de ser somada direto: quem decide se ela entra é
  // a regra do limite, que precisa do preço para responder.
  return _comRegraDaTaxaFixa(taxaFixa, function (tf) {
    const custoBase = custoTotalDisplay + freteProduto + tf + extraVendaRS;
    return _precificar(custoBase, overheadPct, margem, margemTipo, 1, custoBase, custoTotalDisplay);
  });
}
/**
 * FÓRMULA KIT
 * O kit herda os campos da unidade. Os % de CUSTO entram no custo da unidade
 * (igual a calcularUnidade) e só depois são multiplicados pela quantidade.
 */
// ATENÇÃO: a composição de custo e percentuais abaixo está espelhada em
// lucroNoPreco(). Um campo novo que entrar aqui precisa entrar lá também,
// senão os Preços Extras voltam a divergir do preço sugerido.
function calcularKit(inputs, qty, kitFrete, kitExtras) {
  const custo      = _num(inputs.custo);
  const embalagem  = _num(inputs.embalagem);
  const etiqueta   = _num(inputs.etiqueta);
  const fretePago  = _num(inputs.fretePago);
  const taxaFixa   = _num(inputs.taxaFixa);
  const impostoNF  = _num(inputs.impostoNF);
  const taxa       = _num(inputs.taxa);
  const margem     = _num(inputs.margem);
  const margemTipo = inputs.margemTipo || "pct";
  const quantidade = Math.max(1, parseInt(qty, 10) || 1);
  const freteDoKit = _num(kitFrete);
  const extraCustoRS  = _num(inputs.extraCustoRS);
  const extraVendaRS  = _num(inputs.extraVendaRS);
  const extraVendaPCT = _num(inputs.extraVendaPCT);
  const kitExtraRS  = kitExtras ? _num(kitExtras.extraRS) : 0;
  const kitExtraPCT = kitExtras ? _num(kitExtras.extraPCT) : 0;
  const custoTotalDaUnidade = _custoTotalUnidade(inputs, custo, embalagem, etiqueta, fretePago, extraCustoRS);
  const custoBaseKit = custoTotalDaUnidade * quantidade;
  const overheadPct = impostoNF + taxa + extraVendaPCT + kitExtraPCT;

  // O preço avaliado é o do KIT INTEIRO, não o da unidade: um kit de 2 a
  // R$ 120 passa do limite e fica isento, mesmo que a unidade a R$ 60
  // continue cobrando. É exatamente o caso do enunciado.
  return _comRegraDaTaxaFixa(taxaFixa, function (tf) {
    const custoParaPreco = custoBaseKit + freteDoKit + tf + extraVendaRS + kitExtraRS;
    // custoTotalDisplay do kit = custo total do kit (× quantidade), não por
    // unidade — é o que faz sentido exibir na linha "Custo" do card do kit.
    return _precificar(custoParaPreco, overheadPct, margem, margemTipo, quantidade, custoBaseKit, custoBaseKit);
  });
}
/* ═══════════════════════════════════════════════════════════════════
   LUCRO AO VENDER POR UM PREÇO DADO

   Responde "se eu vender por X, quanto sobra?" — a pergunta dos Preços
   Extras. É o INVERSO do calcularUnidade/calcularKit: lá a margem é
   dada e o preço é calculado; aqui o preço é dado e o lucro é calculado.

   ── POR QUE MORA AQUI ─────────────────────────────────────────────
   Antes esta conta ficava no produto.js, escrita à parte. Ela divergiu
   do motor em dois pontos, sem ninguém perceber:
     · ignorava os campos personalizados do KIT;
     · cobrava a taxa fixa sempre, mesmo acima de R$ 79,00.

   Agora ela monta o custo e os percentuais com EXATAMENTE as mesmas
   leituras do calcularUnidade/calcularKit — mesmos campos, mesma
   ordem, mesma função de custo total. Uma mudança futura no motor
   precisa ser espelhada aqui, e o comentário no calcularKit avisa.

   ── A TAXA FIXA ───────────────────────────────────────────────────
   Aqui não existe o conflito circular do motor: o preço já é conhecido.
   A regra se aplica direto — até R$ 79,00 cobra, acima não cobra.

   @param {object} inputs    getCalcInputs(), já com a taxa da modalidade
   @param {number} preco     preço de venda (do kit inteiro, se for kit)
   @param {object} [kit]     { qty, frete, extras } — omitir para unidade
   @returns {{lucro:number, margem:number, inviavel:boolean}}
   ═══════════════════════════════════════════════════════════════════ */
function lucroNoPreco(inputs, preco, kit) {
  const custo        = _num(inputs.custo);
  const embalagem    = _num(inputs.embalagem);
  const etiqueta     = _num(inputs.etiqueta);
  const fretePago    = _num(inputs.fretePago);
  const taxaFixa     = _num(inputs.taxaFixa);
  const impostoNF    = _num(inputs.impostoNF);
  const taxa         = _num(inputs.taxa);
  const extraCustoRS  = _num(inputs.extraCustoRS);
  const extraVendaRS  = _num(inputs.extraVendaRS);
  const extraVendaPCT = _num(inputs.extraVendaPCT);
  const p = _num(preco);

  const custoTotalDaUnidade = _custoTotalUnidade(inputs, custo, embalagem, etiqueta, fretePago, extraCustoRS);

  let custoSemTaxaFixa, overheadPct;
  if (kit) {
    // Mesma composição do calcularKit: custo × quantidade, frete DO KIT
    // (e não o do produto), mais os campos próprios do kit.
    const quantidade  = Math.max(1, parseInt(kit.qty, 10) || 1);
    const kitExtraRS  = kit.extras ? _num(kit.extras.extraRS) : 0;
    const kitExtraPCT = kit.extras ? _num(kit.extras.extraPCT) : 0;
    custoSemTaxaFixa = custoTotalDaUnidade * quantidade + _num(kit.frete) + extraVendaRS + kitExtraRS;
    overheadPct = impostoNF + taxa + extraVendaPCT + kitExtraPCT;
  } else {
    // Mesma composição do calcularUnidade.
    custoSemTaxaFixa = custoTotalDaUnidade + _num(inputs.freteProduto) + extraVendaRS;
    overheadPct = impostoNF + taxa + extraVendaPCT;
  }

  if (overheadPct >= LIMITE_PERCENTUAL) {
    return { lucro: 0, margem: 0, inviavel: true };
  }

  const tf = (taxaFixa > 0 && p <= LIMITE_TAXA_FIXA) ? taxaFixa : 0;
  const lucro = p * (1 - overheadPct / 100) - (custoSemTaxaFixa + tf);

  // ── Comparação com a margem DESEJADA ─────────────────────────────
  // O lucro acima é o real, e não depende da margem: numa venda por X,
  // o que entra e o que sai é o mesmo qualquer que seja a margem que a
  // pessoa quer. O que a margem muda é quanto ela ESPERAVA lucrar — e é
  // isso que se compara aqui.
  //
  // A regra é a mesma do _precificar:
  //   · margem em %  → percentual SOBRE O PREÇO de venda;
  //   · margem em R$ → valor por unidade, multiplicado pela quantidade.
  //
  // Sem margem desejada informada, não há com o que comparar: os dois
  // campos voltam null e a tela não mostra a comparação.
  const margemDesejada = _num(inputs.margem);
  const qtdDesejada = kit ? Math.max(1, parseInt(kit.qty, 10) || 1) : 1;
  let lucroDesejado = null, diferencaDesejada = null;
  if (margemDesejada > 0) {
    lucroDesejado = inputs.margemTipo === "pct"
      ? p * (margemDesejada / 100)
      : margemDesejada * qtdDesejada;
    diferencaDesejada = _r2(lucro - lucroDesejado);
    lucroDesejado = _r2(lucroDesejado);
  }

  return {
    lucro: _r2(lucro),
    margem: p > 0 ? _r2((lucro / p) * 100) : 0,
    inviavel: false,
    lucroDesejado: lucroDesejado,
    diferencaDesejada: diferencaDesejada,
  };
}

// ── Atualiza resultado da unidade + preenche "Custo Total" ──
// O aviso de "margem inviável" vive AQUI (UI), não no cálculo. Só avisa no
// caso "percentual" (erro real); "semCusto" é campo vazio e fica quieto.
let _avisouInviavel = false;
function atualizarResultadoUnidade() {
  const inputs = getCalcInputs();
  const result = calcularUnidade(inputs);
  if (result.inviavel && result.motivo === "percentual") {
    if (!_avisouInviavel && typeof showToast === "function") {
      _avisouInviavel = true;
      showToast("Taxas + margem não podem chegar a " + LIMITE_PERCENTUAL + "%.", "error");
      setTimeout(() => (_avisouInviavel = false), 4000);
    }
  } else {
    _avisouInviavel = false;
  }
  _setText("resultadoUnidade", _formatBRL(result.precoVenda));
  _setText("bkCustoTotal",     _formatBRL(result.custoTotalDisplay));
  _setText("bkLucro",          _formatBRL(result.lucro));
  _setText("bkMargem",         result.margemReal.toFixed(1) + "%");
  const elCustoTotal = document.getElementById("custoTotal");
  if (elCustoTotal) elCustoTotal.value = _formatBRL(result.custoTotalDisplay);

  // Total em Impostos: soma dos impostos aplicados ao custo (IPI+DIFAL+ST+Alíquota).
  const elImpostos = document.getElementById("custoTotalImpostos");
  if (elImpostos) {
    const totalImp = _totalImpostosCusto(
      inputs,
      _num(inputs.custo), _num(inputs.embalagem), _num(inputs.etiqueta),
      _num(inputs.fretePago), _num(inputs.extraCustoRS)
    );
    elImpostos.value = _formatBRL(totalImp);
  }

  atualizarTodosKits(inputs);
  return result;
}
// ── Aplica o resultado de um kit num card (evita duplicar a lógica) ──
function _aplicarResultadoNoCard(card, result) {
  const valEl    = card.querySelector(".kit-result-value");
  const custoEl  = card.querySelector(".kit-custo-display");
  const lucroEl  = card.querySelector(".kit-lucro-display");
  const margemEl = card.querySelector(".kit-margem-display");
  if (custoEl)  custoEl.value        = _formatBRL(result.custoBase);
  if (lucroEl)  lucroEl.textContent  = _formatBRL(result.lucro);
  if (margemEl) margemEl.textContent = `Margem: ${result.margemReal.toFixed(1)}%`;
  if (valEl)    valEl.textContent    = _formatBRL(result.precoVenda);
  card.dataset.price = result.precoVenda.toFixed(2);
}
// Recalcula UM card de kit (lê frete/qty/extras do próprio card).
function _recalcularCard(card, inputs) {
  const qty = Math.max(1, parseInt(card.dataset.qty, 10) || 1);
  const freteInput = card.querySelector(".kit-frete-input");
  const freteKit   = freteInput ? parseFormattedValue(freteInput.value) : 0;
  const kitExtras  = extractCustomFields(card);
  const result     = calcularKit(inputs, qty, freteKit, kitExtras);
  _aplicarResultadoNoCard(card, result);
  return result;
}
// ── Recalcula todos os cards de kit ──
function atualizarTodosKits(inputs) {
  if (!inputs) inputs = getCalcInputs();
  document.querySelectorAll(".kit-card[data-qty]").forEach((card) => {
    _recalcularCard(card, inputs);
  });
}
function _setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
// ── Gatilho global de recálculo ──
// Reusa _recalcularCard/atualizarResultadoUnidade (uma só implementação).
document.addEventListener("input", function (e) {
  if (!e.target || !e.target.classList) return;
  const ehCampoCustom = e.target.classList.contains("custom-field-input");
  const ehFreteKit    = e.target.classList.contains("kit-frete-input");
  if (!ehCampoCustom && !ehFreteKit) return;
  const card = e.target.closest(".kit-card");
  if (!card) {
    // Campo da UNIDADE → recalcula unidade + todos os kits
    if (typeof atualizarResultadoUnidade === "function") atualizarResultadoUnidade();
    return;
  }
  // Campo de um KIT específico → recalcula só aquele card
  _recalcularCard(card, getCalcInputs());
});

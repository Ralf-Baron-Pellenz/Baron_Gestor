// ═══════════════════════════════════════════════════════════════════
//  Bapell Gestor Pro — Importar Vendas
//
//  Fluxo:  EMPRESA → PLATAFORMA → PLANILHA → SKU → PRODUTO → CUSTO
//          → TAXAS → LÍQUIDO → VALOR REAL FINAL → IMPOSTOS → FINANCEIRO
//
//  ── DE ONDE VEM CADA DADO (só leitura; nada é alterado) ────────────
//    Empresas ....... localStorage "precifiq_empresa"
//                     usa o campo impostoPorNota de cada empresa
//    Plataformas .... localStorage "precifiq_custom_platforms"
//                     (menos as ocultas e as excluídas)
//    Produtos ....... getProducts(platformId), do utils.js
//                     LEITURA EXIGE initStorage() ANTES: os produtos vivem
//                     em IndexedDB e o cache em memória nasce vazio.
//    Financeiro ..... localStorage "precifiq_dre"
//
//  ── O QUE ESTA TELA GRAVA ──────────────────────────────────────────
//    "precifiq_vendas_import" .... histórico de importações (chave nova)
//    "precifiq_dre" .............. só ao exportar, acrescentando UMA
//                                  movimentação no formato que o
//                                  financeiro.js já usa
//
//  A PLANILHA NÃO É GUARDADA. Ela é lida em memória, os totais são
//  extraídos e o arquivo é descartado.
//
//  ── COMO AS TAXAS SÃO OBTIDAS ──────────────────────────────────────
//  Não são inventadas nem somadas de configuração: saem da diferença
//  entre o Valor Bruto e o Valor Recebido, os dois lidos da planilha.
//  É o que a plataforma efetivamente reteve naquelas vendas.
// ═══════════════════════════════════════════════════════════════════

(function () {
  "use strict";

  var LS_EMPRESA = "precifiq_empresa";
  var LS_PLATAFORMAS = "precifiq_custom_platforms";
  var LS_PLAT_OCULTAS = "precifiq_hidden_platforms";
  var LS_PLAT_EXCLUIDAS = "precifiq_deleted_platforms";
  var LS_DRE = "precifiq_dre";
  var LS_IMPORTACOES = "precifiq_vendas_import";

  // Custo usado quando o SKU não é encontrado nos produtos da plataforma.
  //
  // Zero, e não um valor arbitrário: um custo inventado se mistura aos custos
  // reais e o total fica errado sem que ninguém perceba. Com zero o número
  // fica visivelmente alto, a linha é destacada na tabela e o aviso diz
  // quantos SKUs faltam cadastrar — o erro fica evidente em vez de disfarçado.
  var CUSTO_PADRAO = 0;

  var $ = function (id) { return document.getElementById(id); };

  var estado = {
    workbook: null,      // planilha em memória; descartada ao sair da tela
    nomeArquivo: "",
    resultado: null,     // último processamento
    salvo: false,
  };

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
      console.error("Falha ao gravar", chave, e);
      aviso("Não foi possível salvar. O armazenamento pode estar cheio.", "error");
      return false;
    }
  }

  function aviso(msg, tipo, ms) {
    if (typeof showToast === "function") showToast(msg, tipo || "default", ms);
    else console.log("[" + (tipo || "info") + "]", msg);
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
    return "R$ " + v.toLocaleString("pt-BR", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }

  /**
   * Número no padrão brasileiro, sem símbolo de moeda. Usado nos totais
   * que não são dinheiro — a quantidade de unidades, por exemplo.
   * Inteiros saem sem casas decimais: "5", não "5,00".
   */
  function num(n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    var casas = Number.isInteger(v) ? 0 : 2;
    return v.toLocaleString("pt-BR", {
      minimumFractionDigits: casas, maximumFractionDigits: casas,
    });
  }

  function pct(n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return v.toLocaleString("pt-BR", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }) + "%";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /**
   * Converte o texto de uma célula em número.
   * Trata os dois formatos que aparecem em planilha de marketplace:
   *   "1.234,56" (brasileiro) e "1234.56" (exportação bruta).
   * Também remove "R$", espaços e o separador de milhar.
   */
  function numeroDeCelula(valor) {
    if (valor === null || valor === undefined || valor === "") return null;
    if (typeof valor === "number") return isFinite(valor) ? valor : null;

    var s = String(valor).trim();
    if (!s) return null;
    // Negativo entre parênteses, comum em exportações: (10,00) = -10,00
    var negativo = /^\(.*\)$/.test(s) || s.indexOf("-") === 0;
    s = s.replace(/[^\d,.]/g, "");
    if (!s) return null;

    var temVirgula = s.indexOf(",") >= 0;
    var temPonto = s.indexOf(".") >= 0;
    if (temVirgula && temPonto) {
      // O que vier por último é o decimal.
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (temVirgula) {
      s = s.replace(",", ".");
    }
    var n = parseFloat(s);
    if (!isFinite(n)) return null;
    return negativo ? -Math.abs(n) : n;
  }

  /**
   * Interpreta uma referência de célula como "H7" ou "AB102".
   * @returns {{col:string, lin:number}|null}
   */
  function lerReferencia(txt) {
    if (!txt) return null;
    var m = String(txt).trim().toUpperCase().replace(/\$/g, "").match(/^([A-Z]{1,3})(\d{1,7})$/);
    if (!m) return null;
    return { col: m[1], lin: parseInt(m[2], 10) };
  }

  /**
   * Valida um intervalo (ex.: H7 até H100) e devolve a lista de células.
   * As duas pontas precisam estar na MESMA coluna: um intervalo que muda de
   * coluna quase sempre é erro de digitação, e somar em diagonal produziria
   * um total errado em silêncio.
   */
  function montarIntervalo(iniTxt, fimTxt, rotulo) {
    var a = lerReferencia(iniTxt);
    var b = lerReferencia(fimTxt);
    if (!a || !b) {
      return { erro: 'Informe o intervalo de "' + rotulo + '" no formato H7 até H100.' };
    }
    if (a.col !== b.col) {
      return {
        erro: 'O intervalo de "' + rotulo + '" começa na coluna ' + a.col +
          " e termina na coluna " + b.col + ". As duas pontas precisam ser da mesma coluna.",
      };
    }
    var ini = Math.min(a.lin, b.lin);
    var fim = Math.max(a.lin, b.lin);
    var celulas = [];
    for (var i = ini; i <= fim; i++) celulas.push(a.col + i);
    return { col: a.col, ini: ini, fim: fim, celulas: celulas };
  }

  /**
   * Interpreta uma lista de colunas como "AQ, AT, AV".
   * Aceita vírgula, ponto e vírgula ou espaço como separador, e ignora
   * dígitos digitados por engano ("AQ7" vira "AQ") — a linha vem do
   * intervalo do Valor Bruto, não daqui.
   * @returns {{cols:string[]}|{erro:string}}
   */
  function lerColunas(txt) {
    var bruto = String(txt || "").toUpperCase();
    var partes = bruto.split(/[^A-Z0-9]+/).filter(Boolean);
    if (!partes.length) {
      return { erro: "Informe ao menos uma coluna de taxas. Ex.: AQ, AT, AV" };
    }
    var cols = [], vistas = Object.create(null);
    for (var i = 0; i < partes.length; i++) {
      var m = partes[i].match(/^([A-Z]{1,3})\d*$/);
      if (!m) {
        return {
          erro: '"' + partes[i] + '" não é uma coluna válida. ' +
            "Use apenas letras, separadas por vírgula. Ex.: AQ, AT, AV",
        };
      }
      // Coluna repetida seria somada duas vezes e inflaria o desconto.
      if (vistas[m[1]]) continue;
      vistas[m[1]] = true;
      cols.push(m[1]);
    }
    return { cols: cols };
  }

  /** Número da linha correspondente à i-ésima célula de um intervalo. */
  function linhaDe(intervalo, i) {
    return intervalo.ini + i;
  }

  function valorDaCelula(sheet, ref) {
    var c = sheet[ref];
    if (!c) return null;
    // .v é o valor bruto; .w é o texto já formatado pelo Excel.
    if (c.v !== undefined && c.v !== null) return c.v;
    if (c.w !== undefined) return c.w;
    return null;
  }

  // ─────────────────────────────────────────────
  //  EMPRESAS E PLATAFORMAS (leitura)
  // ─────────────────────────────────────────────
  function carregarEmpresas() {
    var raw = lerLS(LS_EMPRESA, null);
    var lista = raw && Array.isArray(raw.empresas) ? raw.empresas : [];
    return lista.map(function (e, i) {
      return {
        id: e.id,
        nome: e.nomeAba || e.nomeFantasia || e.razaoSocial || "Empresa " + (i + 1),
        cnpj: e.cnpj || "",
        // Campo criado na tela de Dados da Empresa. É o percentual aplicado
        // sobre o faturamento bruto em "Meus Impostos".
        imposto: numeroDeCelula(e.impostoPorNota) || 0,
      };
    });
  }

  function carregarPlataformas() {
    var custom = lerLS(LS_PLATAFORMAS, []);
    var ocultas = lerLS(LS_PLAT_OCULTAS, []);
    var excluidas = lerLS(LS_PLAT_EXCLUIDAS, []);
    if (!Array.isArray(custom)) custom = [];
    return custom
      .filter(function (p) {
        return p && p.id &&
          excluidas.indexOf(p.id) < 0 &&
          ocultas.indexOf(p.id) < 0;
      })
      .map(function (p) { return { id: p.id, nome: p.name || p.nome || p.id }; });
  }

  function preencherSelect(sel, itens, textoVazio) {
    if (!sel) return;
    var atual = sel.value;
    sel.innerHTML = '<option value="">' + esc(textoVazio || "Selecione...") + "</option>";
    itens.forEach(function (it) {
      var o = document.createElement("option");
      o.value = it.id;
      o.textContent = it.nome;
      sel.appendChild(o);
    });
    if (atual && itens.some(function (i) { return i.id === atual; })) sel.value = atual;
  }

  function empresaSelecionada() {
    var id = $("viEmpresa").value;
    return carregarEmpresas().find(function (e) { return e.id === id; }) || null;
  }

  function plataformaSelecionada() {
    var id = $("viPlataforma").value;
    return carregarPlataformas().find(function (p) { return p.id === id; }) || null;
  }

  // ─────────────────────────────────────────────
  //  PRODUTOS: busca de custo por SKU
  // ─────────────────────────────────────────────
  /**
   * Monta um índice SKU → custo com os produtos da plataforma escolhida.
   * A busca é EXCLUSIVA da plataforma: produtos de outras não entram, para
   * o mesmo SKU em duas plataformas não trazer o custo errado.
   *
   * O SKU é normalizado (maiúsculas, sem espaços nas pontas) porque a
   * planilha costuma vir com variação de caixa em relação ao cadastro.
   */
  /**
   * Custo Total da Unidade de um produto.
   *
   * NÃO é o "Preço de Custo" puro (campo custoCusto). É o total que a tela de
   * Produto mostra em "Custo Total da Unidade":
   *
   *     Preço de Custo + Embalagem + Etiqueta + Frete Pago
   *     + IPI + DIFAL + ST + Alíquota + Campos Personalizados de custo
   *
   * Usar só o Preço de Custo subestimava o custo e fazia o Valor Real Final
   * parecer maior do que é.
   *
   * A conta não é refeita aqui: quando o produto já tem `custo_calculado`
   * (gravado pelas Ações em Massa), ele é usado direto. Caso contrário,
   * chamamos a MESMA função do app — calcularUnidade(), do calculadora.js —
   * para não existir uma segunda fórmula de custo que possa divergir da
   * oficial com o tempo.
   */
  function custoTotalUnidade(p) {
    if (!p) return 0;

    // O campo custo_calculado do produto NÃO é usado: o utils.js o grava a
    // partir do custoBase, que já vem somado com frete do produto e taxa fixa.
    // Aproveitá-lo traria de volta o mesmo custo inflado.

    // 2) Recalcula com a função oficial.
    //
    // Usa custoTotalDisplay, NÃO custoBase. No calculadora.js:
    //
    //   custoTotalDisplay = custo + embalagem + etiqueta + frete pago
    //                       + IPI + DIFAL + ST + Alíquota + extras de custo
    //   custoBase         = custoTotalDisplay + freteProduto + taxaFixa
    //                       + extras de VENDA
    //
    // O custoBase existe para precificar: soma variáveis de venda que NÃO são
    // custo do produto. Usá-lo inflava o custo unitário (R$ 30 no lugar de
    // R$ 20) e o Valor Real Final aparecia negativo sem motivo.
    // O custoTotalDisplay é exatamente o que a tela de Produto exibe em
    // "Custo Total da Unidade".
    if (typeof calcularUnidade === "function") {
      try {
        var r = calcularUnidade(inputsDoProduto(p));
        var base = numeroDeCelula(r && r.custoTotalDisplay);
        if (base !== null && base > 0) return base;
      } catch (e) {
        console.warn("[Importar Vendas] Falha ao recalcular o custo de", p.sku, e);
      }
    }

    // 3) Último recurso: soma direta dos campos de custo. Só acontece se o
    //    calculadora.js não estiver carregado — a tela avisa no console.
    var soma = (numeroDeCelula(p.custo) || 0) +
      (numeroDeCelula(p.embalagem) || 0) +
      (numeroDeCelula(p.etiqueta) || 0) +
      (numeroDeCelula(p.frete) || 0);
    return soma;
  }

  /** Monta os inputs do cálculo a partir do produto salvo. */
  function inputsDoProduto(p) {
    return {
      custo: numeroDeCelula(p.custo) || 0,
      embalagem: numeroDeCelula(p.embalagem) || 0,
      etiqueta: numeroDeCelula(p.etiqueta) || 0,
      fretePago: numeroDeCelula(p.frete) || 0,
      ipiPct: numeroDeCelula(p.ipi) || 0,
      difalPct: numeroDeCelula(p.difal) || 0,
      stPct: numeroDeCelula(p.st) || 0,
      aliquotaPct: numeroDeCelula(p.aliquota) || 0,
      freteProduto: numeroDeCelula(p.freteProduto) || 0,
      taxaFixa: numeroDeCelula(p.taxaFixa) || 0,
      impostoNF: numeroDeCelula(p.impostoNF) || 0,
      taxa: numeroDeCelula(p.taxa) || 0,
      margem: numeroDeCelula(p.margem) || 0,
      margemTipo: p.margemTipo || "pct",
      extraCustoRS: somaCampos(p, "custo", "RS"),
      extraCustoPCT: 0,
      extraVendaRS: somaCampos(p, "venda", "RS"),
      extraVendaPCT: somaCampos(p, "venda", "PCT"),
      custoPctSobreCustoTotal: pctPorBase(p, "custoTotal"),
      custoPctSobrePrecoCusto: pctPorBase(p, "precoCusto"),
    };
  }

  function somaCampos(p, categoria, tipo) {
    if (!Array.isArray(p.camposPersonalizados)) return 0;
    return p.camposPersonalizados
      .filter(function (c) {
        return (c.categoria || "venda") === categoria && (c.tipo || "RS") === tipo;
      })
      .reduce(function (a, c) { return a + (numeroDeCelula(c.valor) || 0); }, 0);
  }

  function pctPorBase(p, base) {
    if (!Array.isArray(p.camposPersonalizados)) return [];
    return p.camposPersonalizados
      .filter(function (c) {
        return (c.categoria || "venda") === "custo" && c.tipo === "PCT" &&
          (c.base || "custoTotal") === base;
      })
      .map(function (c) { return numeroDeCelula(c.valor) || 0; });
  }

  function indiceCustos(platformId) {
    var idx = Object.create(null);
    if (typeof getProducts !== "function") return idx;
    if (typeof calcularUnidade !== "function") {
      console.warn(
        "[Importar Vendas] calculadora.js não carregado: o custo cairá na soma " +
        "simples dos campos, sem impostos nem campos personalizados."
      );
    }
    var produtos = getProducts(platformId) || [];
    produtos.forEach(function (p) {
      if (!p) return;
      var custo = custoTotalUnidade(p);
      var sku = String(p.sku || "").trim().toUpperCase();
      if (sku && idx[sku] === undefined) idx[sku] = custo;
      // Kits têm SKU próprio e custo próprio: também entram no índice.
      if (Array.isArray(p.kits)) {
        p.kits.forEach(function (k) {
          if (!k) return;
          var ks = String(k.sku || "").trim().toUpperCase();
          if (!ks || idx[ks] !== undefined) return;
          var qtd = numeroDeCelula(k.quantidade) || numeroDeCelula(k.qty) || 1;
          var kc = numeroDeCelula(k.custo_calculado);
          if (kc === null || kc <= 0) kc = numeroDeCelula(k.custo);
          idx[ks] = (kc !== null && kc > 0) ? kc : custo * qtd;
        });
      }
    });
    return idx;
  }

  // ─────────────────────────────────────────────
  //  PLANILHA
  // ─────────────────────────────────────────────
  function lerArquivo(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          // codepage 65001 (UTF-8): relatórios em CSV costumam vir em UTF-8
          // SEM BOM, e sem isso o leitor assume a codificação do sistema —
          // "Número do pedido" chegava como "NÃºmero do pedido", quebrando a
          // detecção automática pelos títulos. Para .xlsx o parâmetro é
          // ignorado, então serve para os dois formatos.
          var wb = XLSX.read(new Uint8Array(e.target.result), {
            type: "array", codepage: 65001, raw: false,
          });
          resolve(wb);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsArrayBuffer(file);
    });
  }

  function aoEscolherArquivo(file) {
    if (!file) return;
    if (typeof XLSX === "undefined") {
      mostrarErro(
        "A biblioteca de leitura de planilhas não foi carregada. " +
        "Verifique se o arquivo JS/xlsx.full.min.js existe e está no index de scripts."
      );
      return;
    }
    $("viArquivoNome").textContent = file.name;
    lerArquivo(file).then(function (wb) {
      estado.workbook = wb;
      estado.nomeArquivo = file.name;
      var abas = wb.SheetNames || [];
      var sel = $("viAbaPlanilha");
      sel.innerHTML = "";
      abas.forEach(function (nome) {
        var o = document.createElement("option");
        o.value = nome; o.textContent = nome;
        sel.appendChild(o);
      });
      $("viAbaWrap").style.display = abas.length > 1 ? "" : "none";
      // Com a planilha em mãos, o passo 3 passa a fazer sentido.
      $("viCardIntervalos").style.display = "";
      mostrarInfoPlanilha();
      limparErro();
      try {
        $("viCardIntervalos").scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) {}
    }).catch(function (err) {
      console.error(err);
      estado.workbook = null;
      $("viCardIntervalos").style.display = "none";
    regras = [];
    seqRegra = 0;
    renderRegras();
      mostrarErro("Não foi possível abrir a planilha. Confira se o arquivo não está corrompido ou protegido por senha.");
    });
  }

  function mostrarInfoPlanilha() {
    var box = $("viPlanilhaInfo");
    var sheet = abaAtual();
    if (!sheet) { box.style.display = "none"; return; }
    var ref = sheet["!ref"] || "";
    var linhas = 0, colunas = "";
    var m = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (m) { linhas = parseInt(m[4], 10); colunas = m[1] + " até " + m[3]; }
    box.style.display = "";
    box.innerHTML =
      "<strong>Planilha carregada.</strong> Colunas de " + esc(colunas) +
      ", até a linha " + linhas + ". Use isso como referência ao preencher os intervalos abaixo.";
    sugerirIntervalos(sheet, linhas);
  }

  /**
   * Tenta preencher os intervalos sozinho, lendo os títulos das colunas.
   *
   * Existe porque o erro mais provável nesta tela é apontar a coluna errada —
   * e o resultado sai plausível, sem nada indicando que está errado. Uma
   * sugestão automática elimina a maior parte desses enganos.
   *
   * É apenas SUGESTÃO: os campos continuam editáveis e nada é preenchido por
   * cima do que o usuário já digitou.
   */
  function sugerirIntervalos(sheet, ultimaLinha) {
    // Termos procurados no título de cada coluna, em ordem de preferência.
    // Termos procurados no título de cada coluna, do mais específico para o
    // mais genérico. A ordem importa: "quantidade de itens" precisa vencer
    // "quantidade de pacotes", senão o Magalu marcava a coluna errada e o
    // custo saía calculado sobre o número de caixas, não de peças.
    var ALVOS = [
      { ini: "viBrutoIni", fim: "viBrutoFim",
        termos: ["receita por produtos", "valor total do item", "valor bruto do pedido",
                 "valor bruto", "receita total", "valor total"] },
      { ini: "viLiquidoIni", fim: "viLiquidoFim", modo: "liquido",
        termos: ["voce recebeu", "você recebeu", "valor liquido", "valor líquido",
                 "valor a receber", "repasse", "total (brl)", "total (r$)"] },
      { lista: "viTaxaCols", modo: "taxa",
        termos: ["tarifa de venda", "comissao", "comissão", "taxa de venda",
                 "tarifas", "taxas"] },
      { ini: "viSkuIni", fim: "viSkuFim",
        termos: ["codigo sku", "código sku", "sku"] },
      { ini: "viQtdIni", fim: "viQtdFim",
        termos: ["quantidade de itens", "unidades", "qtd de itens", "quantidade"] },
    ];

    // Procura a linha de cabeçalho: a primeira, entre as 15 iniciais, que
    // tenha pelo menos 5 células preenchidas.
    var COLS = [];
    for (var a = 65; a <= 90; a++) COLS.push(String.fromCharCode(a));
    for (var b = 65; b <= 90; b++) {
      for (var c = 65; c <= 90; c++) COLS.push(String.fromCharCode(b) + String.fromCharCode(c));
    }

    var linhaCab = 0, melhor = 0;
    for (var L = 1; L <= Math.min(15, ultimaLinha); L++) {
      var preenchidas = 0;
      for (var i = 0; i < COLS.length && i < 70; i++) {
        var v = valorDaCelula(sheet, COLS[i] + L);
        if (v !== null && String(v).trim() !== "") preenchidas++;
      }
      if (preenchidas > melhor && preenchidas >= 5) { melhor = preenchidas; linhaCab = L; }
    }
    if (!linhaCab) return;

    var primeiraDados = linhaCab + 1;
    var achou = 0;
    // Uma coluna não pode servir a dois campos. Sem este controle, num
    // relatório que só traz variações do bruto (o do Magalu tem quatro), a
    // MESMA coluna virava "Valor Bruto" e "Valor Recebido": as taxas davam
    // zero e o resultado saía inflado, sem nenhum aviso.
    var usadas = Object.create(null);
    var achouLiquido = false, achouTaxa = false;

    ALVOS.forEach(function (alvo) {
      // Alvo de LISTA (as colunas de taxa): guarda só as letras.
      if (alvo.lista) {
        var campo = $(alvo.lista);
        if (!campo || campo.value.trim()) return;
        var achadas = [];
        for (var t2 = 0; t2 < alvo.termos.length; t2++) {
          for (var i2 = 0; i2 < COLS.length && i2 < 70; i2++) {
            if (usadas[COLS[i2]] || achadas.indexOf(COLS[i2]) >= 0) continue;
            var v2 = valorDaCelula(sheet, COLS[i2] + linhaCab);
            if (v2 === null) continue;
            if (String(v2).toLowerCase().indexOf(alvo.termos[t2]) >= 0) {
              achadas.push(COLS[i2]);
            }
          }
        }
        if (!achadas.length) return;
        achadas.forEach(function (c) { usadas[c] = true; });
        campo.value = achadas.join(", ");
        achou++;
        achouTaxa = true;
        return;
      }
      // Não sobrescreve o que o usuário já digitou.
      if ($(alvo.ini).value.trim() || $(alvo.fim).value.trim()) return;
      var col = null;
      for (var t = 0; t < alvo.termos.length && !col; t++) {
        for (var i = 0; i < COLS.length && i < 70; i++) {
          if (usadas[COLS[i]]) continue;
          var v = valorDaCelula(sheet, COLS[i] + linhaCab);
          if (v === null) continue;
          var titulo = String(v).toLowerCase().trim();
          if (titulo.indexOf(alvo.termos[t]) >= 0) { col = COLS[i]; break; }
        }
      }
      if (!col) return;
      usadas[col] = true;
      $(alvo.ini).value = col + primeiraDados;
      $(alvo.fim).value = col + ultimaLinha;
      achou++;
      if (alvo.modo === "liquido") achouLiquido = true;
      if (alvo.modo === "taxa") achouTaxa = true;
    });

    // Escolhe o modo conforme o que a planilha realmente tem.
    //
    // Só decide quando ALGUMA coluna foi reconhecida agora. Esta função pode
    // rodar mais de uma vez (ao trocar de aba da planilha, por exemplo) e, na
    // segunda passada, os campos já estão preenchidos: nada casa, achou fica
    // zero e o modo seria rebaixado para "pct" — apagando o acerto da
    // primeira passada e exigindo uma comissão que a planilha não precisa.
    if (!achou) return;

    var modo = achouLiquido ? "liquido" : (achouTaxa ? "taxa" : "pct");
    $("viModoLiquido").value = modo;
    aplicarModo();

    {
      var texto = achou + " intervalo(s) foram preenchidos automaticamente pelos " +
        "títulos da planilha. Confira antes de processar.";
      if (modo === "pct") {
        texto += " Esta planilha não traz o valor recebido nem as taxas: " +
          "informe a comissão da plataforma.";
      }
      aviso(texto, modo === "pct" ? "warning" : "success", 7000);
    }
  }

  /** Mostra apenas os campos do modo escolhido. */
  function aplicarModo() {
    var modo = $("viModoLiquido").value;
    document.querySelectorAll("[data-modo]").forEach(function (el) {
      el.style.display = el.dataset.modo === modo ? "" : "none";
    });
  }

  function abaAtual() {
    if (!estado.workbook) return null;
    var nome = $("viAbaPlanilha").value || (estado.workbook.SheetNames || [])[0];
    return estado.workbook.Sheets ? estado.workbook.Sheets[nome] : null;
  }

  function mostrarErro(msg) {
    var el = $("viErro");
    el.style.display = "";
    el.innerHTML = esc(msg);
  }

  // ── Obrigatórios em vermelho (utils.js) ──
  // O que falta fica vermelho até ser preenchido; o primeiro recebe o foco.
  function marcarCampos(els, resolvido) {
    els = (els || []).filter(Boolean);
    if (!els.length || !window.BapellCampos) return;
    els.forEach(function (el) {
      window.BapellCampos.marcar(el, null, resolvido ? { resolvido: resolvido } : undefined);
    });
    window.BapellCampos.focar(els[0]);
  }

  /** Um intervalo (ex.: H7 até H100) que não deu certo: as pontas erradas. */
  function marcarIntervalo(idIni, idFim) {
    var a = $(idIni), b = $(idFim);
    if (!a || !b) return;
    var alvos = [];
    if (!lerReferencia(a.value)) alvos.push(a);
    if (!lerReferencia(b.value)) alvos.push(b);
    // As duas são referências válidas, mas de colunas diferentes.
    if (!alvos.length) alvos = [a, b];
    marcarCampos(alvos);
  }

  function limparErro() {
    var el = $("viErro");
    el.style.display = "none";
    el.textContent = "";
  }

  // ═══════════════════════════════════════════════════════════════
  //  PERSONALIZAÇÃO DOS CÁLCULOS
  //
  //  Camada de ajuste que roda DEPOIS da soma, sobre os totais:
  //
  //    vendas → agregação → TOTAIS → regras → totais ajustados
  //                                            → Valor Real Final
  //                                            → exportação
  //
  //  As regras nunca tocam nas vendas individuais nem no relatório por
  //  SKU. Elas rodam na ordem em que o usuário as criou, e o resultado
  //  de uma fica disponível para as seguintes.
  // ═══════════════════════════════════════════════════════════════

  // Totais que uma regra pode ALTERAR ou USAR como valor.
  // A ordem aqui é a ordem dos menus na tela.
  var CAMPOS_TOTAIS = [
    { id: "bruto",    nome: "Valor Bruto",       tipo: "money" },
    { id: "liquido",  nome: "Valor Recebido",    tipo: "money" },
    { id: "taxas",    nome: "Taxas / Descontos", tipo: "money" },
    { id: "custo",    nome: "Custo Total",       tipo: "money" },
    { id: "final",    nome: "Valor Real Final",  tipo: "money" },
    { id: "unidades", nome: "Quantidade",        tipo: "num"   },
  ];

  var OPERACOES = [
    { id: "somar",     rotulo: "Somar (+)",         sinal: "+" },
    { id: "subtrair",  rotulo: "Subtrair (−)",      sinal: "−" },
    { id: "multiplicar", rotulo: "Multiplicar (×)", sinal: "×" },
    { id: "dividir",   rotulo: "Dividir (÷)",       sinal: "÷" },
    { id: "definir",   rotulo: "Substituir por (=)", sinal: "=" },
  ];

  // Cada regra criada pelo usuário. A ordem do array é a ordem de execução.
  var regras = [];
  var seqRegra = 0;

  function novaRegra() {
    seqRegra++;
    return {
      id: "r" + seqRegra,
      nome: "Regra " + seqRegra,
      alvo: "bruto",        // qual total será alterado
      op: "subtrair",       // operação
      origem: "manual",     // manual | coluna | total
      valorTipo: "pct",     // quando origem = manual: money | pct | num
      valor: "",            // quando origem = manual
      coluna: "",           // quando origem = coluna (letra, ex.: "F")
      totalRef: "bruto",    // quando origem = total (inclui regras anteriores)
    };
  }

  /**
   * Soma uma coluna inteira da planilha, nas MESMAS linhas do Valor Bruto.
   * É assim que "Frete da coluna F" vira um número: o total daquela coluna,
   * não o valor de uma venda — coerente com a regra de que tudo aqui opera
   * sobre agregados.
   */
  function somarColuna(sheet, letra, rBruto) {
    if (!sheet || !letra || !rBruto) return 0;
    var soma = 0;
    for (var i = rBruto.ini; i <= rBruto.fim; i++) {
      var v = numeroDeCelula(valorDaCelula(sheet, letra + i));
      if (v !== null) soma += v;
    }
    return soma;
  }

  /**
   * Aplica todas as regras sobre os totais.
   *
   * @param {Object} totais  {bruto, liquido, taxas, custo, final, unidades}
   * @param {Object} ctx     { sheet, rBruto } para ler colunas da planilha
   * @returns {{totais:Object, passos:Array, erros:Array}}
   */
  function aplicarRegras(totais, ctx) {
    var t = {
      bruto: totais.bruto, liquido: totais.liquido, taxas: totais.taxas,
      custo: totais.custo, final: totais.final, unidades: totais.unidades,
    };
    var passos = [], erros = [];
    // Resultado de cada regra, para as seguintes usarem como entrada.
    var resultados = Object.create(null);

    // "final" e "taxas" são derivados. Enquanto ninguém mexer neles
    // diretamente, acompanham as mudanças de bruto/liquido/custo. Depois de
    // uma regra alterá-los, passam a valer o que a regra deixou — senão o
    // recálculo apagaria em silêncio o que o usuário acabou de definir.
    var fixados = Object.create(null);

    function derivar() {
      if (!fixados.taxas) t.taxas = cent(t.bruto - t.liquido);
      if (!fixados.final) t.final = cent(t.liquido - t.custo);
    }

    for (var i = 0; i < regras.length; i++) {
      var r = regras[i];
      var alvoDef = CAMPOS_TOTAIS.find(function (c) { return c.id === r.alvo; });
      if (!alvoDef) { erros.push(r.nome + ": campo a alterar não encontrado."); continue; }

      var antes = t[r.alvo];
      var operando = 0;
      var descricao = "";

      if (r.origem === "manual") {
        var bruto = numeroDeCelula(r.valor);
        if (bruto === null) {
          erros.push(r.nome + ": informe o valor.");
          continue;
        }
        if (r.valorTipo === "pct") {
          // Percentual SEMPRE sobre o campo que está sendo alterado.
          operando = antes * bruto / 100;
          descricao = pct(bruto) + " de " + alvoDef.nome;
        } else {
          operando = bruto;
          descricao = r.valorTipo === "money" ? brl(bruto) : num(bruto);
        }
      } else if (r.origem === "coluna") {
        var lc = lerColunas(r.coluna);
        if (lc.erro) { erros.push(r.nome + ": " + lc.erro); continue; }
        operando = 0;
        for (var c = 0; c < lc.cols.length; c++) {
          operando += somarColuna(ctx.sheet, lc.cols[c], ctx.rBruto);
        }
        descricao = "coluna " + lc.cols.join(" + ") + " (" + brl(operando) + ")";
      } else {
        // Outro total do sistema, ou o resultado de uma regra anterior.
        if (resultados[r.totalRef] !== undefined) {
          operando = resultados[r.totalRef];
          descricao = "resultado de " + r.totalRef;
        } else if (t[r.totalRef] !== undefined) {
          operando = t[r.totalRef];
          var def = CAMPOS_TOTAIS.find(function (c) { return c.id === r.totalRef; });
          descricao = (def ? def.nome : r.totalRef) + " (" + brl(operando) + ")";
        } else {
          erros.push(r.nome + ": o valor de origem não existe.");
          continue;
        }
      }

      var depois;
      if (r.op === "somar") depois = antes + operando;
      else if (r.op === "subtrair") depois = antes - operando;
      else if (r.op === "multiplicar") depois = antes * operando;
      else if (r.op === "dividir") {
        if (operando === 0) {
          erros.push(r.nome + ": não é possível dividir por zero. A regra foi ignorada.");
          continue;
        }
        depois = antes / operando;
      } else if (r.op === "definir") depois = operando;
      else { erros.push(r.nome + ": operação desconhecida."); continue; }

      if (!isFinite(depois)) {
        erros.push(r.nome + ": o resultado não é um número válido. A regra foi ignorada.");
        continue;
      }

      depois = cent(depois);
      t[r.alvo] = depois;
      fixados[r.alvo] = true;
      resultados[r.id] = depois;
      resultados[r.nome] = depois;

      var opDef = OPERACOES.find(function (o) { return o.id === r.op; });
      passos.push({
        nome: r.nome,
        texto: alvoDef.nome + " " + (opDef ? opDef.sinal : "?") + " " + descricao,
        antes: antes, depois: depois, alvo: r.alvo, alvoNome: alvoDef.nome,
        moeda: alvoDef.tipo === "money",
      });

      derivar();
    }

    derivar();
    return { totais: t, passos: passos, erros: erros };
  }

  // ── Interface das regras ──────────────────────────────────────

  function opcoesTotais(selecionado, ateIndice) {
    var html = "";
    CAMPOS_TOTAIS.forEach(function (c) {
      html += '<option value="' + c.id + '"' +
        (c.id === selecionado ? " selected" : "") + ">" + esc(c.nome) + "</option>";
    });
    // Resultados das regras ANTERIORES. Só elas: uma regra não pode usar o
    // resultado de outra que ainda não rodou.
    for (var i = 0; i < ateIndice; i++) {
      var r = regras[i];
      html += '<option value="' + esc(r.id) + '"' +
        (r.id === selecionado ? " selected" : "") + ">Resultado de " + esc(r.nome) + "</option>";
    }
    return html;
  }

  function renderRegras() {
    var host = $("viRegrasLista");
    if (!host) return;
    $("viRegrasVazio").style.display = regras.length ? "none" : "";

    host.innerHTML = regras.map(function (r, i) {
      var ops = OPERACOES.map(function (o) {
        return '<option value="' + o.id + '"' + (o.id === r.op ? " selected" : "") +
          ">" + esc(o.rotulo) + "</option>";
      }).join("");

      return '<div class="vi-regra" data-i="' + i + '">' +
        '<div class="vi-regra-topo">' +
          '<span class="vi-regra-n">' + (i + 1) + "</span>" +
          '<input type="text" class="input-field vi-regra-nome" value="' + esc(r.nome) +
            '" data-campo="nome" placeholder="Nome da regra" />' +
          '<button type="button" class="vi-regra-remover" data-remover="' + i +
            '" aria-label="Remover regra">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>' +
          "</button>" +
        "</div>" +

        '<div class="vi-regra-corpo">' +
          '<label class="vi-regra-campo"><span>Alterar</span>' +
            '<select class="input-field" data-campo="alvo">' + opcoesTotais(r.alvo, 0) + "</select>" +
          "</label>" +

          '<label class="vi-regra-campo vi-regra-op"><span>Operação</span>' +
            '<select class="input-field" data-campo="op">' + ops + "</select>" +
          "</label>" +

          '<label class="vi-regra-campo"><span>Usando</span>' +
            '<select class="input-field" data-campo="origem">' +
              '<option value="manual"' + (r.origem === "manual" ? " selected" : "") + ">Um valor que eu informo</option>" +
              '<option value="coluna"' + (r.origem === "coluna" ? " selected" : "") + ">O total de uma coluna da planilha</option>" +
              '<option value="total"' + (r.origem === "total" ? " selected" : "") + ">Outro total já calculado</option>" +
            "</select>" +
          "</label>" +

          // Manual: tipo + valor
          '<label class="vi-regra-campo vi-regra-so-manual" style="' +
            (r.origem === "manual" ? "" : "display:none;") + '"><span>Tipo</span>' +
            '<select class="input-field" data-campo="valorTipo">' +
              '<option value="money"' + (r.valorTipo === "money" ? " selected" : "") + ">R$</option>" +
              '<option value="pct"' + (r.valorTipo === "pct" ? " selected" : "") + ">%</option>" +
              '<option value="num"' + (r.valorTipo === "num" ? " selected" : "") + ">Número</option>" +
            "</select>" +
          "</label>" +
          '<label class="vi-regra-campo vi-regra-so-manual" style="' +
            (r.origem === "manual" ? "" : "display:none;") + '"><span>Valor</span>' +
            '<input type="text" class="input-field" data-campo="valor" value="' + esc(r.valor) +
              '" placeholder="0,00" inputmode="decimal" />' +
          "</label>" +

          // Coluna da planilha
          '<label class="vi-regra-campo vi-regra-so-coluna" style="' +
            (r.origem === "coluna" ? "" : "display:none;") + '"><span>Coluna</span>' +
            '<input type="text" class="input-field vi-regra-col" data-campo="coluna" value="' +
              esc(r.coluna) + '" placeholder="F" autocomplete="off" />' +
          "</label>" +

          // Outro total
          '<label class="vi-regra-campo vi-regra-so-total" style="' +
            (r.origem === "total" ? "" : "display:none;") + '"><span>Qual</span>' +
            '<select class="input-field" data-campo="totalRef">' + opcoesTotais(r.totalRef, i) + "</select>" +
          "</label>" +
        "</div>" +

        '<p class="vi-regra-previa" data-previa="' + i + '"></p>' +
      "</div>";
    }).join("");

    // Um listener por regra, delegando pelo atributo data-campo.
    host.querySelectorAll(".vi-regra").forEach(function (box) {
      var i = +box.dataset.i;
      box.querySelectorAll("[data-campo]").forEach(function (el) {
        el.addEventListener("input", function () {
          var campo = el.dataset.campo;
          var v = el.value;
          if (campo === "coluna") {
            v = v.toUpperCase().replace(/[^A-Z]/g, "");
            el.value = v;
          }
          regras[i][campo] = v;
          if (campo === "origem") renderRegras();
          else atualizarPrevias();
        });
      });
      box.querySelector("[data-remover]").addEventListener("click", function () {
        regras.splice(i, 1);
        renderRegras();
      });
    });

    atualizarPrevias();
  }

  /**
   * Mostra o que cada regra vai fazer, em texto.
   * Quando já há um resultado processado, mostra também os números reais —
   * é a diferença entre "confio que está certo" e "vejo que está certo".
   */
  function atualizarPrevias() {
    var base = estado.resultado ? estado.resultado.totaisOriginais : null;
    var previa = base
      ? aplicarRegras(base, { sheet: abaAtual(), rBruto: estado.rBruto })
      : null;

    regras.forEach(function (r, i) {
      var el = document.querySelector('[data-previa="' + i + '"]');
      if (!el) return;
      var passo = previa && previa.passos.find(function (p) { return p.nome === r.nome; });
      if (passo) {
        el.className = "vi-regra-previa ok";
        el.textContent = passo.texto + "  →  " +
          (passo.moeda ? brl(passo.antes) : num(passo.antes)) + " vira " +
          (passo.moeda ? brl(passo.depois) : num(passo.depois));
      } else {
        var alvoDef = CAMPOS_TOTAIS.find(function (c) { return c.id === r.alvo; });
        var opDef = OPERACOES.find(function (o) { return o.id === r.op; });
        el.className = "vi-regra-previa";
        el.textContent = (alvoDef ? alvoDef.nome : "?") + " " +
          (opDef ? opDef.sinal : "?") + " " +
          (r.origem === "manual"
            ? (r.valor || "…") + (r.valorTipo === "pct" ? "%" : r.valorTipo === "money" ? " (R$)" : "")
            : r.origem === "coluna"
              ? "coluna " + (r.coluna || "…")
              : "outro total");
      }
    });
  }

  // ─────────────────────────────────────────────
  //  PROCESSAMENTO
  // ─────────────────────────────────────────────
  function processar() {
    limparErro();
    $("viResultado").style.display = "none";
    estado.resultado = null;
    estado.salvo = false;

    var empresa = empresaSelecionada();
    if (!empresa) { mostrarErro("Selecione a empresa antes de processar."); marcarCampos([$("viEmpresa")]); return; }
    var plataforma = plataformaSelecionada();
    if (!plataforma) { mostrarErro("Selecione a plataforma antes de processar."); marcarCampos([$("viPlataforma")]); return; }

    var sheet = abaAtual();
    if (!sheet) {
      mostrarErro("Escolha a planilha de vendas antes de processar.");
      marcarCampos([$("viUpload")], function () { return !!abaAtual(); });
      return;
    }

    var rBruto = montarIntervalo($("viBrutoIni").value, $("viBrutoFim").value, "Valor Bruto");
    if (rBruto.erro) { mostrarErro(rBruto.erro); marcarIntervalo("viBrutoIni", "viBrutoFim"); return; }
    // O valor recebido vem de um dos três modos. Nenhum formato de planilha
    // é presumido: o usuário diz o que o arquivo dele tem.
    var modo = $("viModoLiquido").value;
    var rLiq = null, colsTaxa = null, pctComissao = 0, taxaFixa = 0;

    if (modo === "liquido") {
      rLiq = montarIntervalo($("viLiquidoIni").value, $("viLiquidoFim").value, "Valor Recebido");
      if (rLiq.erro) { mostrarErro(rLiq.erro); marcarIntervalo("viLiquidoIni", "viLiquidoFim"); return; }
    } else if (modo === "taxa") {
      // Várias colunas somadas. As LINHAS são as mesmas do Valor Bruto, então
      // não há como desalinhar os intervalos — e a Shopee, que separa o
      // desconto em três colunas, funciona sem nenhum caso especial no código.
      var lc = lerColunas($("viTaxaCols").value);
      if (lc.erro) { mostrarErro(lc.erro); marcarCampos([$("viTaxaCols")]); return; }
      colsTaxa = lc.cols;
    } else {
      pctComissao = numeroDeCelula($("viPctComissao").value) || 0;
      taxaFixa = numeroDeCelula($("viTaxaFixa").value) || 0;
      if (pctComissao <= 0 && taxaFixa <= 0) {
        mostrarErro(
          "Informe a comissão da plataforma. Sem ela não há como saber quanto " +
          "sobrou de cada venda — esta planilha não traz o valor recebido."
        );
        marcarCampos([$("viPctComissao")]);
        return;
      }
      if (pctComissao >= 100) {
        mostrarErro("A comissão precisa ser menor que 100%.");
        marcarCampos([$("viPctComissao")]);
        return;
      }
    }

    var rSku = montarIntervalo($("viSkuIni").value, $("viSkuFim").value, "SKU");
    if (rSku.erro) { mostrarErro(rSku.erro); marcarIntervalo("viSkuIni", "viSkuFim"); return; }

    // Unidades vendidas é OBRIGATÓRIO.
    //
    // Antes era opcional e, sem ele, o sistema contava uma unidade por linha.
    // Numa planilha real do Mercado Livre isso erra: 32 linhas do mesmo SKU
    // podem representar 39 unidades. O custo saía menor que o verdadeiro e o
    // Valor Real Final aparecia MAIOR do que de fato é — o pior tipo de erro,
    // porque parece certo e faz o lojista achar que lucrou mais.
    var rQtd = montarIntervalo($("viQtdIni").value, $("viQtdFim").value, "Unidades Vendidas");
    if (rQtd.erro) { mostrarErro(rQtd.erro); marcarIntervalo("viQtdIni", "viQtdFim"); return; }

    // Os intervalos precisam ter o mesmo tamanho: cada linha é uma venda, e
    // linhas desalinhadas cruzariam o bruto de uma venda com o SKU de outra.
    var n = rBruto.celulas.length;
    // O modo "taxa" não entra aqui: suas colunas usam as linhas do Valor Bruto.
    if ((rLiq && rLiq.celulas.length !== n) ||
        rSku.celulas.length !== n || rQtd.celulas.length !== n) {
      mostrarErro(
        "Os intervalos têm tamanhos diferentes (" + n + " no Valor Bruto" +
        (rLiq ? ", " + rLiq.celulas.length + " no Valor Recebido" : "") +
        ", " + rSku.celulas.length + " no SKU e " + rQtd.celulas.length +
        " nas Unidades). Todos precisam começar e terminar nas mesmas linhas."
      );
      return;
    }

    // Validação: a coluna indicada precisa conter mesmo valores financeiros.
    // Sem isso, apontar a coluna errada somaria zero e o relatório sairia
    // errado em silêncio — que é justamente o que o escopo proíbe.
    var amostraBruto = 0;
    for (var t = 0; t < rBruto.celulas.length; t++) {
      if (numeroDeCelula(valorDaCelula(sheet, rBruto.celulas[t])) !== null) amostraBruto++;
    }
    if (amostraBruto === 0) {
      mostrarErro(
        "Célula incorreta. Por favor, abra a planilha, verifique com exatidão a coluna " +
        "correta e edite o mapeamento da plataforma. " +
        "Nenhum valor numérico foi encontrado em " + rBruto.col + rBruto.ini +
        " até " + rBruto.col + rBruto.fim + "."
      );
      return;
    }

    var custos = indiceCustos(plataforma.id);
    var porSku = Object.create(null);
    var totalBruto = 0, totalLiquido = 0, linhasValidas = 0, linhasIgnoradas = 0;
    var semSku = 0;

    for (var i = 0; i < n; i++) {
      var bruto = numeroDeCelula(valorDaCelula(sheet, rBruto.celulas[i]));
      var skuRaw = valorDaCelula(sheet, rSku.celulas[i]);
      var sku = String(skuRaw == null ? "" : skuRaw).trim();

      // O valor recebido, conforme o modo escolhido.
      var liquido = null;
      if (modo === "liquido") {
        liquido = numeroDeCelula(valorDaCelula(sheet, rLiq.celulas[i]));
      } else if (modo === "taxa") {
        // Soma TODAS as colunas informadas nesta linha. A Shopee separa em
        // comissão, taxa de serviço e frete; outras plataformas podem ter
        // uma só, ou cinco — a conta é a mesma.
        var somaTx = 0;
        for (var ct = 0; ct < colsTaxa.length; ct++) {
          var tx = numeroDeCelula(valorDaCelula(sheet, colsTaxa[ct] + linhaDe(rBruto, i)));
          // Descontos costumam vir negativos na planilha. O sinal é ignorado:
          // o que importa é o quanto saiu.
          if (tx !== null) somaTx += Math.abs(tx);
        }
        if (bruto !== null) liquido = bruto - somaTx;
      } else if (bruto !== null) {
        // Estimativa: comissão percentual mais taxa fixa por venda.
        liquido = bruto - (bruto * pctComissao / 100) - taxaFixa;
      }

      // Linha sem valor nenhum é espaço em branco no fim do intervalo:
      // ignorada em silêncio, não é erro.
      if (bruto === null && liquido === null && !sku) { linhasIgnoradas++; continue; }

      if (bruto === null) bruto = 0;
      if (liquido === null) liquido = 0;

      // Unidades da linha. Célula vazia ou zerada conta como 1: é melhor
      // subestimar uma linha isolada do que descartar a venda inteira.
      var q = numeroDeCelula(valorDaCelula(sheet, rQtd.celulas[i]));
      var qtd = q === null || q <= 0 ? 1 : q;

      if (!sku) { sku = "(sem SKU)"; semSku++; }
      var chave = sku.toUpperCase();

      if (!porSku[chave]) {
        var achou = custos[chave] !== undefined;
        porSku[chave] = {
          sku: sku, qtd: 0, bruto: 0, liquido: 0,
          custoUnit: achou ? custos[chave] : CUSTO_PADRAO,
          encontrado: achou,
        };
      }
      porSku[chave].qtd += qtd;
      porSku[chave].bruto += bruto;
      porSku[chave].liquido += liquido;

      totalBruto += bruto;
      totalLiquido += liquido;
      linhasValidas++;
    }

    if (linhasValidas === 0) {
      mostrarErro("Nenhuma venda foi encontrada nos intervalos informados. Confira as linhas de início e fim.");
      return;
    }

    var itens = Object.keys(porSku).map(function (k) {
      var it = porSku[k];
      it.custoTotal = it.custoUnit * it.qtd;
      it.taxas = it.bruto - it.liquido;
      it.final = it.liquido - it.custoTotal;
      return it;
    }).sort(function (a, b) { return b.bruto - a.bruto; });

    var totalCusto = itens.reduce(function (s, it) { return s + it.custoTotal; }, 0);
    var naoEncontrados = itens.filter(function (it) { return !it.encontrado; });

    estado.resultado = {
      empresaId: empresa.id, empresaNome: empresa.nome,
      plataformaId: plataforma.id, plataformaNome: plataforma.nome,
      arquivo: estado.nomeArquivo,
      modo: modo,
      estimado: modo === "pct",
      pctComissao: pctComissao,
      taxaFixa: taxaFixa,
      intervalos: {
        bruto: rBruto.col + rBruto.ini + ":" + rBruto.col + rBruto.fim,
        liquido: rLiq ? rLiq.col + rLiq.ini + ":" + rLiq.col + rLiq.fim : null,
        taxa: colsTaxa ? colsTaxa.join(", ") + " (linhas do Valor Bruto)" : null,
        sku: rSku.col + rSku.ini + ":" + rSku.col + rSku.fim,
        qtd: rQtd.col + rQtd.ini + ":" + rQtd.col + rQtd.fim,
      },
      // Arredondados para centavos: somar dezenas de linhas em ponto flutuante
      // deixa resíduo (1399.3100000000004), que apareceria no histórico.
      // Preenchidos logo abaixo, depois das regras de personalização.
      totais: null,
      totaisOriginais: null,
      ajustes: null,
      linhasValidas: linhasValidas,
      linhasIgnoradas: linhasIgnoradas,
      semSku: semSku,
      naoEncontrados: naoEncontrados.length,
      itens: itens,
      criadoEm: Date.now(),
    };

    // ── Totais brutos, antes de qualquer regra ──
    var unidades = itens.reduce(function (a, it) { return a + it.qtd; }, 0);
    var originais = {
      bruto: cent(totalBruto),
      taxas: cent(totalBruto - totalLiquido),
      liquido: cent(totalLiquido),
      custo: cent(totalCusto),
      final: cent(totalLiquido - totalCusto),
      unidades: unidades,
    };

    // ── Camada de personalização ──
    // Só aqui, depois da agregação. As vendas individuais e o relatório por
    // SKU acima não são tocados.
    var ajuste = aplicarRegras(originais, { sheet: sheet, rBruto: rBruto });

    estado.rBruto = rBruto;
    estado.resultado.totaisOriginais = originais;
    estado.resultado.totais = ajuste.totais;
    estado.resultado.ajustes = {
      passos: ajuste.passos,
      erros: ajuste.erros,
      // Guarda a configuração das regras junto com a importação, para o
      // histórico registrar COMO aqueles números foram obtidos.
      regras: JSON.parse(JSON.stringify(regras)),
    };

    renderResultado();
    atualizarPrevias();
    aviso(linhasValidas + " vendas processadas em " + itens.length + " SKUs.", "success");
  }

  function renderResultado() {
    var r = estado.resultado;
    if (!r) return;
    var t = r.totais;

    // O que o cliente vê: vendeu, recebeu, sobrou. As taxas da plataforma
    // continuam sendo calculadas e gravadas no histórico, mas não aparecem
    // na tela. O custo dos produtos vira a legenda do resultado — é o que
    // explica a diferença entre o que a plataforma pagou e o que sobrou.
    $("viMBruto").textContent = brl(t.bruto);
    $("viMLiquido").textContent = brl(t.liquido);
    $("viMCusto").textContent = brl(t.custo);
    $("viMFinal").textContent = brl(t.final);

    // Quantas unidades formaram esse custo. Ajuda a conferir de relance:
    // se o número de peças não bater com o esperado, o custo também não vai.
    var unidades = r.itens.reduce(function (a, it) { return a + it.qtd; }, 0);
    $("viMCustoSub").textContent = unidades > 0
      ? unidades + (unidades === 1 ? " unidade vendida" : " unidades vendidas")
      : "";

    var caixa = $("viMFinal").closest(".vi-etapa-final");
    if (caixa) caixa.classList.toggle("negativo", t.final < 0);

    $("viResumoCusto").textContent =
      r.linhasValidas + (r.linhasValidas === 1 ? " venda em " : " vendas em ") +
      r.itens.length + (r.itens.length === 1 ? " produto" : " produtos diferentes");

    // Quando há regras, a tela mostra de onde saiu cada número ajustado.
    // Sem isso o total mudaria e ninguém saberia por quê.
    var boxAj = $("viAjustes");
    if (r.ajustes && r.ajustes.passos.length) {
      var o = r.totaisOriginais;
      boxAj.style.display = "";
      boxAj.innerHTML =
        '<div class="vi-ajustes-titulo">Regras aplicadas sobre os totais</div>' +
        '<ol class="vi-ajustes-lista">' +
        r.ajustes.passos.map(function (p) {
          return "<li><span>" + esc(p.texto) + "</span><strong>" +
            (p.moeda ? brl(p.antes) : num(p.antes)) + " → " +
            (p.moeda ? brl(p.depois) : num(p.depois)) + "</strong></li>";
        }).join("") +
        "</ol>" +
        '<div class="vi-ajustes-rodape">Sem as regras, o Valor Real Final seria ' +
        brl(o.final) + ".</div>";
    } else {
      boxAj.style.display = "none";
      boxAj.innerHTML = "";
    }

    var av = $("viAvisoSku");
    var partes = [];
    if (r.naoEncontrados > 0) {
      partes.push(
        "<strong>" + r.naoEncontrados + " SKU(s) sem cadastro em " +
        esc(r.plataformaNome) + ".</strong> Eles entraram com custo zero, " +
        "então o Valor Real Final está maior do que o real. Cadastre esses " +
        "produtos e importe de novo."
      );
    }
    if (r.semSku > 0) {
      partes.push(r.semSku + " linha(s) sem SKU foram agrupadas em “(sem SKU)”.");
    }
    if (r.linhasIgnoradas > 0) {
      partes.push(r.linhasIgnoradas + " linha(s) em branco foram ignoradas.");
    }
    if (r.ajustes && r.ajustes.erros.length) {
      partes.push("<strong>Regras com problema:</strong> " +
        r.ajustes.erros.map(esc).join(" "));
    }
    if (r.estimado) {
      partes.push(
        "<strong>Valores estimados.</strong> Esta planilha não informa quanto " +
        "a plataforma reteve. O valor recebido foi calculado com " +
        pct(r.pctComissao) + " de comissão" +
        (r.taxaFixa > 0 ? " mais " + brl(r.taxaFixa) + " de taxa fixa por venda" : "") +
        " — confira com o extrato da plataforma antes de lançar no financeiro."
      );
    }
    if (partes.length) {
      av.style.display = "";
      av.innerHTML = partes.join("<br>");
    } else {
      av.style.display = "none";
    }

    var tb = $("viTbody");
    tb.innerHTML = r.itens.map(function (it) {
      return "<tr" + (it.encontrado ? "" : ' class="vi-sem-produto"') + ">" +
        "<td>" + esc(it.sku) + (it.encontrado ? "" : ' <span class="vi-tag">sem cadastro</span>') + "</td>" +
        '<td class="num">' + it.qtd + "</td>" +
        '<td class="num">' + brl(it.bruto) + "</td>" +
        '<td class="num">' + brl(it.liquido) + "</td>" +
        '<td class="num">' + brl(it.custoUnit) + "</td>" +
        '<td class="num">' + brl(it.custoTotal) + "</td>" +
        '<td class="num ' + (it.final < 0 ? "vi-neg" : "vi-pos") + '">' + brl(it.final) + "</td>" +
        "</tr>";
    }).join("");

    $("viTfoot").innerHTML =
      "<tr><th>Totais</th>" +
      '<th class="num">' + r.itens.reduce(function (s, i) { return s + i.qtd; }, 0) + "</th>" +
      '<th class="num">' + brl(t.bruto) + "</th>" +
      '<th class="num">' + brl(t.liquido) + "</th>" +
      '<th class="num">—</th>' +
      '<th class="num">' + brl(t.custo) + "</th>" +
      '<th class="num ' + (t.final < 0 ? "vi-neg" : "vi-pos") + '">' + brl(t.final) + "</th></tr>";

    // Subtítulo do modal: de onde vieram estes números.
    $("viModalSub").textContent =
      r.empresaNome + " · " + r.plataformaNome +
      (r.arquivo ? " · " + r.arquivo : "");

    abrirResultado();
  }

  /**
   * Abre o modal do resultado.
   * O corpo da página trava a rolagem enquanto ele está aberto: sem isso,
   * rolar dentro da tabela arrastaria a página atrás quando a lista acaba.
   */
  function abrirResultado() {
    $("viResultado").style.display = "flex";
    document.body.style.overflow = "hidden";
    // Foco no botão de fechar: quem usa teclado entra no modal, e não
    // continua navegando pelo formulário escondido atrás.
    setTimeout(function () { try { $("viFechar").focus(); } catch (e) {} }, 40);
  }

  /**
   * Fecha o modal. O resultado NÃO é descartado: continua em estado.resultado
   * para poder salvar ou exportar depois, e o formulário fica como estava —
   * ajustar uma célula e processar de novo não exige redigitar nada.
   */
  function fecharResultado() {
    $("viResultado").style.display = "none";
    document.body.style.overflow = "";
  }

  // ─────────────────────────────────────────────
  //  HISTÓRICO DE IMPORTAÇÕES
  // ─────────────────────────────────────────────
  function carregarImportacoes() {
    var d = lerLS(LS_IMPORTACOES, null);
    if (!d || !Array.isArray(d.importacoes)) return { importacoes: [] };
    return d;
  }

  /**
   * Grava a importação no histórico.
   * @param {boolean} [silencioso] true quando chamada de dentro da
   *        exportação: não mostra aviso próprio nem reclama de já estar salva.
   * @returns {string|null} o id do registro, para a exportação usar.
   */
  function salvarImportacao(silencioso) {
    if (!estado.resultado) {
      if (!silencioso) aviso("Processe uma planilha antes de salvar.", "warning");
      return null;
    }
    if (estado.salvo) {
      if (!silencioso) aviso("Esta importação já foi salva.", "warning");
      return estado.idSalvo || null;
    }

    var dados = carregarImportacoes();
    var r = estado.resultado;
    var registro = {
      id: "imp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      empresaId: r.empresaId, empresaNome: r.empresaNome,
      plataformaId: r.plataformaId, plataformaNome: r.plataformaNome,
      arquivo: r.arquivo,
      intervalos: r.intervalos,
      totais: r.totais,
      // Os totais antes das regras e a configuração usada. Sem isso o
      // histórico mostraria um número ajustado sem dizer como se chegou nele.
      totaisOriginais: r.totaisOriginais,
      ajustes: r.ajustes,
      linhasValidas: r.linhasValidas,
      naoEncontrados: r.naoEncontrados,
      // Guarda o relatório por SKU, mas NÃO a planilha: ela já cumpriu o papel.
      itens: r.itens.map(function (it) {
        return {
          sku: it.sku, qtd: it.qtd, bruto: it.bruto, taxas: it.taxas,
          liquido: it.liquido, custoTotal: it.custoTotal, final: it.final,
          encontrado: it.encontrado,
        };
      }),
      exportadoDre: false,
      // Uma importação pode ser exportada várias vezes. Cada exportação
      // entra aqui; a importação continua sendo UM registro só.
      exportacoes: [],
      criadoEm: Date.now(),
    };
    dados.importacoes.unshift(registro);
    if (!gravarLS(LS_IMPORTACOES, dados)) return null;

    estado.salvo = true;
    estado.idSalvo = registro.id;
    if (!silencioso) aviso("Importação salva.", "success");
    renderHistorico();
    preencherSelectsHistorico();
    return registro.id;
  }

  function renderHistorico() {
    var host = $("viHistLista");
    if (!host) return;
    var dados = carregarImportacoes();
    var filtroEmp = $("viHistEmpresa").value;
    var busca = ($("viHistBusca").value || "").trim().toLowerCase();

    var lista = dados.importacoes.filter(function (imp) {
      if (filtroEmp && imp.empresaId !== filtroEmp) return false;
      if (!busca) return true;
      return (imp.plataformaNome + " " + imp.empresaNome + " " + (imp.arquivo || ""))
        .toLowerCase().indexOf(busca) >= 0;
    });

    if (!lista.length) {
      host.innerHTML = '<div class="vi-vazio">Nenhuma importação salva ainda.</div>';
      return;
    }

    host.innerHTML = lista.map(function (imp) {
      var d = new Date(imp.criadoEm);
      return '<div class="vi-hist-item" data-imp="' + esc(imp.id) + '">' +
        '<div class="vi-hist-topo">' +
          "<div><strong>" + esc(imp.empresaNome) + "</strong> · " + esc(imp.plataformaNome) +
          '<div class="vi-hist-data">' + d.toLocaleDateString("pt-BR") + " às " +
          d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) +
          (imp.arquivo ? " · " + esc(imp.arquivo) : "") + "</div></div>" +
          "<div>" + (imp.exportadoDre
            ? '<span class="vi-badge ok">Exportado' +
              (imp.exportacoes && imp.exportacoes.length > 1
                ? " " + imp.exportacoes.length + "×" : "") + "</span>"
            : '<span class="vi-badge">Não exportado</span>') + "</div>" +
        "</div>" +
        '<div class="vi-hist-nums">' +
          "<div><span>Bruto</span><strong>" + brl(imp.totais.bruto) + "</strong></div>" +
          "<div><span>Taxas</span><strong>" + brl(imp.totais.taxas) + "</strong></div>" +
          "<div><span>Líquido</span><strong>" + brl(imp.totais.liquido) + "</strong></div>" +
          "<div><span>Custo</span><strong>" + brl(imp.totais.custo) + "</strong></div>" +
          "<div><span>Valor Real Final</span><strong class='" +
            (imp.totais.final < 0 ? "vi-neg" : "vi-pos") + "'>" + brl(imp.totais.final) + "</strong></div>" +
        "</div>" +
        '<div class="vi-hist-acoes">' +
          '<button class="btn-accent vi-hist-exportar" data-id="' + esc(imp.id) +
            '">Exportar para o Financeiro</button>' +
          '<button class="btn-secondary vi-hist-ver" data-id="' + esc(imp.id) + '">Ver SKUs</button>' +
          '<button class="btn-danger vi-hist-excluir" data-id="' + esc(imp.id) + '">Excluir</button>' +
        "</div>" +
        (imp.exportacoes && imp.exportacoes.length
          ? '<div class="vi-hist-exps">' + imp.exportacoes.map(function (e) {
              var d2 = new Date(e.em);
              return "<span>" + d2.toLocaleDateString("pt-BR") + " · " +
                esc(e.rotulo) + " · " + brl(e.quantia) +
                (e.responsavel ? " · " + esc(e.responsavel) : "") + "</span>";
            }).join("") + "</div>"
          : "") +
        '<div class="vi-hist-detalhe" id="det_' + esc(imp.id) + '" style="display:none;"></div>' +
        "</div>";
    }).join("");

    host.querySelectorAll(".vi-hist-exportar").forEach(function (b) {
      b.addEventListener("click", function () { abrirModalExport("historico", b.dataset.id); });
    });
    host.querySelectorAll(".vi-hist-ver").forEach(function (b) {
      b.addEventListener("click", function () { alternarDetalhe(b.dataset.id); });
    });
    host.querySelectorAll(".vi-hist-excluir").forEach(function (b) {
      b.addEventListener("click", function () { excluirImportacao(b.dataset.id); });
    });
  }

  function alternarDetalhe(id) {
    var box = $("det_" + id);
    if (!box) return;
    if (box.style.display !== "none") { box.style.display = "none"; return; }
    var imp = carregarImportacoes().importacoes.find(function (i) { return i.id === id; });
    if (!imp) return;
    box.style.display = "";
    box.innerHTML =
      '<div class="vi-tabela-wrap"><table class="vi-tabela"><thead><tr>' +
      "<th>SKU</th><th class='num'>Qtd</th><th class='num'>Bruto</th>" +
      "<th class='num'>Líquido</th>" +
      "<th class='num'>Custo</th><th class='num'>Final</th></tr></thead><tbody>" +
      imp.itens.map(function (it) {
        return "<tr><td>" + esc(it.sku) + "</td>" +
          '<td class="num">' + it.qtd + "</td>" +
          '<td class="num">' + brl(it.bruto) + "</td>" +
          '<td class="num">' + brl(it.liquido) + "</td>" +
          '<td class="num">' + brl(it.custoTotal) + "</td>" +
          '<td class="num">' + brl(it.final) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function excluirImportacao(id) {
    var dados = carregarImportacoes();
    var antes = dados.importacoes.length;
    dados.importacoes = dados.importacoes.filter(function (i) { return i.id !== id; });
    if (dados.importacoes.length === antes) return;
    if (!gravarLS(LS_IMPORTACOES, dados)) return;
    aviso("Importação excluída.", "warning");
    renderHistorico();
    renderImpostos();
  }

  // ─────────────────────────────────────────────
  //  MEUS IMPOSTOS
  // ─────────────────────────────────────────────
  function renderImpostos() {
    var id = $("viImpEmpresa").value;
    var metricas = $("viImpMetricas");
    var vazio = $("viImpVazio");
    var tabela = $("viImpTabelaWrap");

    if (!id) {
      metricas.style.display = "none";
      tabela.style.display = "none";
      vazio.style.display = "";
      vazio.textContent = "Selecione uma empresa para ver os faturamentos importados.";
      return;
    }

    var empresa = carregarEmpresas().find(function (e) { return e.id === id; });
    if (!empresa) return;

    var periodo = $("viImpPeriodo").value;
    var agora = new Date();
    var lista = carregarImportacoes().importacoes.filter(function (imp) {
      if (imp.empresaId !== id) return false;
      var d = new Date(imp.criadoEm);
      if (periodo === "mes") {
        return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
      }
      if (periodo === "ano") return d.getFullYear() === agora.getFullYear();
      return true;
    });

    if (!lista.length) {
      metricas.style.display = "none";
      tabela.style.display = "none";
      vazio.style.display = "";
      vazio.textContent = "Nenhuma importação salva para esta empresa no período escolhido.";
      return;
    }

    var bruto = lista.reduce(function (s, i) { return s + (i.totais.bruto || 0); }, 0);
    var imposto = bruto * (empresa.imposto / 100);

    vazio.style.display = "none";
    metricas.style.display = "";
    tabela.style.display = "";
    $("viImpBruto").textContent = brl(bruto);
    $("viImpPct").textContent = empresa.imposto > 0 ? pct(empresa.imposto) : "não informada";
    $("viImpValor").textContent = brl(imposto);

    $("viImpTbody").innerHTML = lista.map(function (imp) {
      var d = new Date(imp.criadoEm);
      return "<tr><td>" + d.toLocaleDateString("pt-BR") + "</td>" +
        "<td>" + esc(imp.plataformaNome) + "</td>" +
        '<td class="num">' + brl(imp.totais.bruto) + "</td>" +
        '<td class="num">' + brl((imp.totais.bruto || 0) * (empresa.imposto / 100)) + "</td></tr>";
    }).join("");
  }

  // ─────────────────────────────────────────────
  //  EXPORTAÇÃO PARA O FINANCEIRO (DRE)
  // ─────────────────────────────────────────────
  // Tempo entre a confirmação e a volta ao início. Existe para o aviso de
  // sucesso ser lido: fechar na hora deixaria a pessoa sem saber se deu
  // certo, e a tela já teria mudado quando ela fosse olhar.
  var ESPERA_VOLTAR = 2000;
  var voltando = null;

  /**
   * Limpa a tela e volta ao início, depois de uma pausa.
   *
   * @param {"importar"|"historico"} destino  para qual aba voltar
   * @param {boolean} [manterFormulario] true quando só salvou: aí o
   *        formulário continua preenchido, para poder exportar em seguida.
   */
  function voltarAoInicio(destino, manterFormulario) {
    // Um clique já em andamento não é reiniciado por outro: sem isto, dois
    // cliques seguidos agendariam duas voltas e a segunda limparia a tela
    // depois que o usuário já tivesse começado outra coisa.
    if (voltando) return;

    // Trava só Salvar e Exportar durante a espera: clicar de novo gravaria
    // em duplicidade. "Voltar e ajustar" fica ATIVO de propósito — é a saída
    // de quem se arrependeu, e travá-la prenderia a pessoa por dois segundos
    // sem nenhum motivo.
    [$("viSalvar"), $("viExportar")].forEach(function (b) {
      if (b) b.disabled = true;
    });

    voltando = setTimeout(function () {
      voltando = null;
      [$("viSalvar"), $("viExportar")].forEach(function (b) {
        if (b) b.disabled = false;
      });
      fecharModalExport();
      fecharResultado();
      if (!manterFormulario) limparFormulario();
      renderHistorico();
      preencherSelectsHistorico();
      trocarAba(destino);
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {}
    }, ESPERA_VOLTAR);
  }

  // ═══════════════════════════════════════════════════════════════
  //  EXPORTAÇÃO PARA O FINANCEIRO
  //
  //  Serve a DOIS caminhos, com o mesmo modal e a mesma gravação:
  //
  //    a) logo depois de processar uma planilha;
  //    b) a partir de uma importação já salva, dias depois, sem
  //       precisar da planilha de novo.
  //
  //  O que muda entre eles é só para onde a tela volta no fim.
  // ═══════════════════════════════════════════════════════════════

  // Os três valores que podem ser lançados no Financeiro.
  var VALORES_EXPORT = [
    { id: "bruto",   rotulo: "Você vendeu",       ajuda: "o total antes de qualquer desconto" },
    { id: "liquido", rotulo: "A plataforma pagou", ajuda: "depois das taxas da plataforma" },
    { id: "final",   rotulo: "Sobrou para você",   ajuda: "depois das taxas e do custo dos produtos" },
  ];

  // Quem está sendo exportado agora. Guarda o registro e a origem, para o
  // fim do fluxo saber para onde voltar.
  var exportando = null;

  /**
   * Monta o objeto de exportação a partir do resultado em tela ou de um
   * registro salvo. Os dois têm a mesma forma, então daqui para frente o
   * fluxo é idêntico.
   */
  function dadosParaExport(reg) {
    return {
      empresaId: reg.empresaId, empresaNome: reg.empresaNome,
      plataformaId: reg.plataformaId, plataformaNome: reg.plataformaNome,
      totais: reg.totais,
      arquivo: reg.arquivo || "",
    };
  }

  /**
   * @param {"atual"|"historico"} origem  de onde veio a exportação
   * @param {string} [idSalvo]  id do registro, quando vem do histórico
   */
  function abrirModalExport(origem, idSalvo) {
    var dados = null, registroId = null;

    if (origem === "historico") {
      var reg = carregarImportacoes().importacoes.find(function (i) { return i.id === idSalvo; });
      if (!reg) { aviso("Importação não encontrada.", "warning"); return; }
      dados = dadosParaExport(reg);
      registroId = reg.id;
      $("viExpTitulo").textContent = "Exportar importação salva";
    } else {
      if (!estado.resultado) { aviso("Processe uma planilha antes de exportar.", "warning"); return; }
      dados = dadosParaExport(estado.resultado);
      registroId = estado.idSalvo || null;
      $("viExpTitulo").textContent = "Exportar para o Financeiro";
    }

    exportando = { origem: origem, dados: dados, registroId: registroId };

    $("viExportResumo").innerHTML =
      "Lançamento em <strong>" + esc(dados.empresaNome) + "</strong>, canal " +
      "<strong>" + esc(dados.plataformaNome) + "</strong>." +
      (dados.arquivo ? "<br>Importação de " + esc(dados.arquivo) : "");

    // Os três valores, com o número de cada um à mostra: a escolha é feita
    // olhando a cifra, não decorando qual rótulo corresponde a quê.
    $("viExpValores").innerHTML = VALORES_EXPORT.map(function (v, i) {
      return '<label class="vi-esc-opc">' +
        '<input type="radio" name="viExpValor" value="' + v.id + '"' +
          (i === VALORES_EXPORT.length - 1 ? " checked" : "") + " />" +
        '<span class="vi-esc-txt"><span class="vi-esc-rot">' + esc(v.rotulo) + "</span>" +
        '<span class="vi-esc-ajuda">' + esc(v.ajuda) + "</span></span>" +
        '<span class="vi-esc-val">' + brl(dados.totais[v.id]) + "</span>" +
      "</label>";
    }).join("");

    // Responsável: um dos usuários de Dados da Empresa › Usuários e Senhas.
    var selResp = $("viExpResponsavel");
    if (window.BapellUsuarios) window.BapellUsuarios.preencherSelect(selResp, { valor: "", vazio: "Selecione quem está lançando" });
    else selResp.value = "";
    if (window.BapellCampos) window.BapellCampos.limparTodos($("viModalExport"));
    $("viExpObs").value = "";
    $("viModalExport").style.display = "flex";
    // Acima do modal de resultado (z-index 90), senão abriria atrás dele.
    $("viModalExport").style.zIndex = "100";
    setTimeout(function () { $("viExpResponsavel").focus(); }, 60);
  }

  function fecharModalExport() {
    $("viModalExport").style.display = "none";
    exportando = null;
  }

  /**
   * Cancelar durante a espera desfaz a volta agendada.
   * Sem isto, quem clicasse em Cancelar logo depois de exportar veria a tela
   * se limpar sozinha dois segundos depois, sem entender por quê.
   */
  function cancelarVolta() {
    if (!voltando) return;
    clearTimeout(voltando);
    voltando = null;
    [$("viSalvar"), $("viExportar")].forEach(function (b) {
      if (b) b.disabled = false;
    });
  }

  /**
   * Cria UMA movimentação no Controle Financeiro.
   *
   * ── A ESTRUTURA DO precifiq_dre ────────────────────────────────────
   * O financeiro NÃO guarda um store por id de empresa do cadastro. Ele
   * mantém empresas PRÓPRIAS, com ids gerados por ele:
   *
   *   {
   *     empresas: [ { id: "emp_xxx", nome: "Casa & Mais", logo: "" } ],
   *     ativaId:  "emp_xxx",
   *     dados:    { "emp_xxx": { movimentacoes: [...], ... } }
   *   }
   *
   * O vínculo entre as duas telas é feito pelo NOME da empresa, que é
   * como o próprio financeiro faz ao importar empresas do cadastro.
   */
  var _confirmandoExport = false;
  function exportarParaDre() {
    if (!exportando || _confirmandoExport) return;

    var escolhido = document.querySelector('input[name="viExpValor"]:checked');
    if (!escolhido) {
      aviso("Escolha qual valor será lançado.", "warning");
      marcarCampos([$("viExpValores")], function () { return !!document.querySelector('input[name="viExpValor"]:checked'); });
      return;
    }

    // Responsável: escolhido entre os usuários; quem tem senha só lança
    // digitando a própria senha.
    var sel = $("viExpResponsavel");
    var U = window.BapellUsuarios;
    if (U && !U.listar().length) {
      marcarCampos([sel]);
      U.pedirCadastro();
      return;
    }
    if (!sel.value || sel.value === "__cadastrar__") {
      aviso("Escolha quem vai lançar.", "warning");
      marcarCampos([sel]);
      return;
    }
    if (!U) { gravarExportacao(sel.value); return; }
    _confirmandoExport = true;
    U.confirmarResponsavel(sel.value, { acao: "lançar no Controle Financeiro" }).then(function (r) {
      _confirmandoExport = false;
      // A janela foi fechada enquanto a senha era pedida: não lança.
      if (!exportando) return;
      if (r.ok) gravarExportacao(r.usuario.nome);
      else if (r.motivo === "vazio") marcarCampos([sel]);
    }, function () { _confirmandoExport = false; });
  }

  function gravarExportacao(responsavel) {
    if (!exportando) return;
    var d = exportando.dados;
    var escolhido = document.querySelector('input[name="viExpValor"]:checked');
    if (!escolhido) return;
    var qual = escolhido.value;
    var valorDef = VALORES_EXPORT.find(function (v) { return v.id === qual; });
    var obs = $("viExpObs").value.trim();

    var cont = lerLS(LS_DRE, null);

    // Container inexistente ou em formato antigo. O financeiro migra os
    // formatos antigos sozinho ao abrir, então aqui só tratamos o vazio —
    // gravar por cima de um formato antigo apagaria lançamentos.
    if (!cont || typeof cont !== "object" || !cont.dados || !Array.isArray(cont.empresas)) {
      if (cont && (Array.isArray(cont) || Array.isArray(cont.movimentacoes))) {
        aviso(
          "O Controle Financeiro está em um formato antigo. Abra a tela de " +
          "Controle Financeiro uma vez para ele se atualizar e tente exportar de novo.",
          "warning", 7000
        );
        return;
      }
      cont = { empresas: [], ativaId: null, dados: {}, seguranca: null, senhaPerguntada: false };
    }

    // Procura a empresa pelo NOME (mesma regra do financeiro).
    var alvo = String(d.empresaNome || "").trim().toLowerCase();
    var emp = cont.empresas.find(function (e) {
      return String(e.nome || "").trim().toLowerCase() === alvo;
    });

    if (!emp) {
      var novoId = typeof generateId === "function"
        ? "emp_" + generateId()
        : "emp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      emp = { id: novoId, nome: d.empresaNome, logo: "" };
      cont.empresas.push(emp);
      cont.dados[novoId] = {
        movimentacoes: [], camposOcultos: [], secoesCustom: [], ordemSecoes: [],
        meta: 0, camposVenda: [], camposDespesa: [], metaComemorada: 0,
      };
      if (!cont.ativaId) cont.ativaId = novoId;
    }

    var store = cont.dados[emp.id];
    if (!store || typeof store !== "object") {
      store = cont.dados[emp.id] = {
        movimentacoes: [], camposOcultos: [], secoesCustom: [], ordemSecoes: [],
        meta: 0, camposVenda: [], camposDespesa: [], metaComemorada: 0,
      };
    }
    if (!Array.isArray(store.movimentacoes)) store.movimentacoes = [];

    var agora = Date.now();
    var hoje = new Date();
    var data = hoje.getFullYear() + "-" +
      String(hoje.getMonth() + 1).padStart(2, "0") + "-" +
      String(hoje.getDate()).padStart(2, "0");

    // Arredonda para centavos: a soma de dezenas de linhas em ponto
    // flutuante deixa resíduo, que ficaria salvo no financeiro.
    var valorFinal = cent(d.totais[qual] || 0);

    store.movimentacoes.push({
      id: agora,
      tipo: "Venda",
      data: data,
      canalCategoria: d.plataformaNome,
      descricao: "Importação de vendas — " + d.plataformaNome +
        " (" + valorDef.rotulo + ")" + (obs ? " — " + obs : ""),
      // Entra em modo líquido: o valor já vem pronto da importação, e sem
      // isso o financeiro aplicaria deduções de novo sobre ele.
      bruto: valorFinal,
      deducoes: 0,
      taxasDetalhes: { taxa: 0, frete: 0, imposto: 0 },
      camposExtras: [],
      liquido: valorFinal,
      modoLiquido: true,
      responsavel: responsavel,
      criadoEm: agora,
      atualizadoEm: agora,
      editado: false,
      origem: "vendas-import",
      valorExportado: qual,
    });

    if (!gravarLS(LS_DRE, cont)) return;

    // ── Registra a exportação NA importação salva ──
    // A mesma importação pode ser exportada mais de uma vez. Ela continua
    // sendo UM registro: as exportações entram numa lista dentro dele, em
    // vez de duplicar a importação a cada lançamento.
    var idReg = exportando.registroId;
    if (exportando.origem === "atual" && !idReg) {
      idReg = salvarImportacao(true); // salva antes, sem sair da tela
    }
    if (idReg) {
      var dados = carregarImportacoes();
      var reg = dados.importacoes.find(function (i) { return i.id === idReg; });
      if (reg) {
        reg.exportadoDre = true;
        if (!Array.isArray(reg.exportacoes)) reg.exportacoes = [];
        reg.exportacoes.push({
          em: agora, valor: qual, rotulo: valorDef.rotulo,
          quantia: valorFinal, responsavel: responsavel, obs: obs,
        });
        gravarLS(LS_IMPORTACOES, dados);
      }
    }

    var voltouPara = exportando.origem;
    fecharModalExport();

    aviso(
      valorDef.rotulo + " (" + brl(valorFinal) + ") lançado em " + emp.nome + "." +
      (cont.ativaId === emp.id ? "" : " Selecione essa empresa no Financeiro para vê-lo."),
      "success", 6000
    );

    // Volta ao início depois da pausa. Do histórico, volta para a lista de
    // importações salvas; do resultado, para a tela de anexar planilha.
    voltarAoInicio(voltouPara === "historico" ? "historico" : "importar", false);
  }

  // ─────────────────────────────────────────────
  //  ABAS E EVENTOS
  // ─────────────────────────────────────────────
  function trocarAba(nome) {
    document.querySelectorAll(".vi-tab").forEach(function (b) {
      b.classList.toggle("ativa", b.dataset.aba === nome);
    });
    document.querySelectorAll(".vi-aba").forEach(function (s) {
      s.classList.toggle("ativa", s.dataset.aba === nome);
    });
    if (nome === "historico") renderHistorico();
    if (nome === "impostos") renderImpostos();
  }

  function preencherSelectsHistorico() {
    var empresas = carregarEmpresas();
    preencherSelect($("viHistEmpresa"), empresas, "Todas as empresas");
    preencherSelect($("viImpEmpresa"), empresas, "Selecione...");
  }

  function limparFormulario() {
    estado.workbook = null;
    estado.nomeArquivo = "";
    estado.resultado = null;
    estado.salvo = false;
    $("viArquivo").value = "";
    $("viArquivoNome").textContent = "Nenhum arquivo escolhido";
    $("viPlanilhaInfo").style.display = "none";
    $("viAbaWrap").style.display = "none";
    $("viCardIntervalos").style.display = "none";
    ["viBrutoIni", "viBrutoFim", "viLiquidoIni", "viLiquidoFim",
     "viTaxaCols", "viPctComissao", "viTaxaFixa",
     "viSkuIni", "viSkuFim", "viQtdIni", "viQtdFim"].forEach(function (id) {
      if ($(id)) $(id).value = "";
    });
    fecharResultado();
    limparErro();
  }

  function ligarEventos() {
    document.querySelectorAll(".vi-tab").forEach(function (b) {
      b.addEventListener("click", function () { trocarAba(b.dataset.aba); });
    });

    $("viUpload").addEventListener("click", function () { $("viArquivo").click(); });
    $("viArquivo").addEventListener("change", function (e) {
      aoEscolherArquivo(e.target.files[0]);
    });
    $("viAbaPlanilha").addEventListener("change", mostrarInfoPlanilha);
    $("viModoLiquido").addEventListener("change", aplicarModo);

    $("viAddRegra").addEventListener("click", function () {
      regras.push(novaRegra());
      renderRegras();
    });

    $("viProcessar").addEventListener("click", processar);
    $("viLimpar").addEventListener("click", limparFormulario);

    // Três formas de sair do resultado: o X, o botão "Voltar e ajustar" e a
    // tecla Esc. Clicar no fundo NÃO fecha: um clique fora do lugar durante
    // a conferência descartaria a tela sem querer.
    // O ícone de ajuda mora dentro do botão Salvar: clicar nele não deve
    // salvar. O clique para aqui antes de chegar ao botão.
    document.querySelectorAll(".vi-ajuda-mini").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
      });
      // Espaço e Enter no ícone também não disparam o botão.
      el.addEventListener("keydown", function (e) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
        }
      });
    });

    $("viFechar").addEventListener("click", function () {
      cancelarVolta();
      fecharResultado();
    });
    $("viVoltar").addEventListener("click", function () {
      cancelarVolta();
      fecharResultado();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && $("viResultado").style.display === "flex") {
        fecharResultado();
      }
    });
    $("viSalvar").addEventListener("click", function () {
      var id = salvarImportacao(false);
      // Salvou: o aviso aparece, e dois segundos depois a tela volta ao
      // início. O formulário é limpo junto — a importação já está guardada
      // e pode ser exportada depois pelas Importações Salvas.
      if (id) voltarAoInicio("historico", false);
    });
    $("viExportar").addEventListener("click", function () { abrirModalExport("atual"); });

    $("viExpCancelar").addEventListener("click", function () {
      cancelarVolta();
      fecharModalExport();
    });
    $("viExpConfirmar").addEventListener("click", exportarParaDre);
    $("viModalExport").addEventListener("click", function (e) {
      if (e.target === $("viModalExport")) fecharModalExport();
    });

    $("viEmpresa").addEventListener("change", function () {
      var e = empresaSelecionada();
      $("viEmpresaInfo").textContent = e
        ? (e.imposto > 0
            ? "Imposto por nota: " + pct(e.imposto)
            : "Sem porcentagem de imposto cadastrada. Preencha em Dados da Empresa.")
        : "—";
    });

    $("viPlataforma").addEventListener("change", function () {
      var p = plataformaSelecionada();
      if (!p) { $("viPlataformaInfo").textContent = "—"; return; }
      var qtd = typeof getProducts === "function" ? (getProducts(p.id) || []).length : 0;
      $("viPlataformaInfo").textContent =
        qtd + " produto(s) cadastrados — os SKUs serão procurados só aqui.";
    });

    $("viHistEmpresa").addEventListener("change", renderHistorico);
    var t;
    $("viHistBusca").addEventListener("input", function () {
      clearTimeout(t); t = setTimeout(renderHistorico, 200);
    });

    $("viImpEmpresa").addEventListener("change", renderImpostos);
    $("viImpPeriodo").addEventListener("change", renderImpostos);

    // Referências de célula sempre em maiúsculas, para "h7" virar "H7".
    // Só os campos de REFERÊNCIA de célula viram maiúsculas. Os de comissão
    // e taxa fixa são valores e precisam aceitar vírgula.
    ["viBrutoIni", "viBrutoFim", "viLiquidoIni", "viLiquidoFim",
     "viSkuIni", "viSkuFim", "viQtdIni", "viQtdFim"].forEach(function (id) {
      if (!$(id)) return;
      $(id).addEventListener("input", function (e) {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      });
    });
    // A lista de colunas mantém vírgula e espaço como separadores.
    $("viTaxaCols").addEventListener("input", function (e) {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9,; ]/g, "");
    });
    // Comissão e taxa fixa recebem a máscara numérica do app.
    if (typeof ativarMascarasNumericas === "function") ativarMascarasNumericas();
  }

  // ─────────────────────────────────────────────
  //  INICIALIZAÇÃO
  // ─────────────────────────────────────────────
  var jaIniciou = false;

  function iniciar() {
    // Guarda contra inicialização repetida. Se iniciar() rodasse duas vezes,
    // cada listener seria ligado em duplicidade e um clique em "Adicionar
    // Campo de Cálculo" criaria DUAS regras — um bug silencioso e difícil de
    // rastrear, porque a tela continua parecendo normal.
    if (jaIniciou) return;
    jaIniciou = true;

    if (typeof setDateHeader === "function") setDateHeader();

    // O estado do menu lateral segue o mesmo das outras telas.
    try {
      var colapsado = localStorage.getItem("precifiq_sidebar_colapsada") === "1";
      var sb = $("sidebar");
      if (sb) sb.classList.toggle("sidebar-colapsada", colapsado);
      document.body.classList.toggle("sidebar-colapsada-body", colapsado);
    } catch (e) {}

    var empresas = carregarEmpresas();
    var plataformas = carregarPlataformas();
    preencherSelect($("viEmpresa"), empresas);
    preencherSelect($("viPlataforma"), plataformas);
    preencherSelectsHistorico();

    if (!empresas.length) {
      aviso("Nenhuma empresa cadastrada. Cadastre uma em Dados da Empresa.", "warning", 6000);
    }
    if (!plataformas.length) {
      aviso("Nenhuma plataforma cadastrada. Cadastre uma na tela inicial.", "warning", 6000);
    }

    ligarEventos();
    renderHistorico();
  }

  // Os produtos vivem em IndexedDB: sem aguardar o initStorage() o
  // getProducts() devolveria lista vazia e TODO SKU cairia no custo padrão.
  document.addEventListener("DOMContentLoaded", function () {
    if (typeof initStorage === "function") {
      initStorage().then(iniciar).catch(function (e) {
        console.error("Falha ao iniciar o armazenamento:", e);
        iniciar(); // a tela abre mesmo assim; os custos é que ficam indisponíveis
      });
    } else {
      iniciar();
    }
  });
})();

// ═══════════════════════════════════════════════════════════════════
//  Bapell Gestor Pro — importar-produtos.js
//  "Adicionar pela Planilha" (lista de produtos de cada plataforma):
//  cadastro de produtos em massa a partir da planilha do Bling, do
//  Mercado Livre ou de QUALQUER outra plataforma ou sistema (Amazon,
//  Shopee, Magalu, uma planilha própria…).
//
//  ── O CAMINHO ──────────────────────────────────────────────────────
//    1. Origem ....... Bling, Mercado Livre, Outra planilha ou uma
//                      configuração salva (no Mercado Livre, antes de
//                      seguir, o aviso de baixar a planilha com o SKU)
//    2. Planilha ..... .xlsx, .xls ou .csv (o CSV em UTF-8 ou Latin-1)
//    3. Campos ....... a célula de cada campo: a do modelo (conferida
//                      pelos títulos da planilha) ou a reconhecida pelos
//                      títulos (Outra planilha); tudo editável. "Adicionar
//                      Campo" inclui qualquer outro campo do Bapell, com a
//                      célula inicial e a final
//    4. Conferência .. os produtos lidos, as plataformas que vão recebê-los
//                      e o que fica de fora (SKU já cadastrado, sem nome…)
//
//  ── O QUE É LIDO ───────────────────────────────────────────────────
//    Sempre na lista: Nome (em MAIÚSCULAS), SKU, EAN/GTIN (vai para o
//    "ID do Produto"), Preço de Custo, Peso (em gramas — kg é convertido)
//    e Largura, Altura e Comprimento (em cm — mm e m são convertidos).
//    Pelo "Adicionar Campo": custos, impostos, taxas, margem, Preços
//    Extras, os campos personalizados da plataforma, um campo de texto
//    novo e o Preço de Venda. Campo que a planilha não tem fica como no
//    cadastro de um produto novo; valor inválido é ignorado e avisado,
//    nunca adivinhado.
//
//  ── PREÇO DE VENDA ─────────────────────────────────────────────────
//    Entra sempre DESMARCADO: quem decide é a pessoa. Marcado, o Bapell
//    calcula a margem que dá aquele preço com o custo e as taxas do
//    produto — em % (sobre o preço, o padrão) ou em R$, à escolha na
//    linha do campo — pelo mesmo motor da ficha (lucroNoPreco e
//    calcularUnidade, do calculadora.js). Desmarcado, o preço sai da
//    margem, como sempre.
//
//  ── NADA É PREENCHIDO EM SILÊNCIO ──────────────────────────────────
//    O que o reconhecimento não tem certeza (título parecido, unidade
//    desconhecida, título que mudou desde a configuração salva) entra
//    DESMARCADO e só é lido se a pessoa marcar.
//
//  ── COMO GRAVA ─────────────────────────────────────────────────────
//    O produto tem a MESMA forma de um produto novo salvo pela ficha
//    (produto.js), com o preço calculado pelo mesmo motor (calculadora.js)
//    e gravado pelo mesmo caminho (saveProducts, do utils.js): uma
//    gravação por plataforma. SKU já cadastrado na plataforma é pulado.
//
//  ── CONFIGURAÇÕES SALVAS ───────────────────────────────────────────
//    "precifiq_import_planilhas" (as da exportação ficam em outra chave):
//    [{ id, nome, base, abas[], inicio, fim, mapas[{ campo, rotulo, ini,
//    fim, unidade, usar, titulo }], criadoEm, atualizadoEm }]
// ═══════════════════════════════════════════════════════════════════

(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  // Linhas lidas por planilha, no máximo (uma planilha com formatação até
  // a linha 1.000.000 não trava a tela).
  var MAX_LINHAS = 20000;
  // Linhas da conferência desenhadas por vez ("Mostrar mais" acrescenta).
  var PASSO_LISTA = 100;
  // Configurações salvas do "Adicionar pela Planilha".
  var CONFIG_KEY = "precifiq_import_planilhas";
  // Última linha de uma planilha do Excel.
  var MAX_LINHA_XL = 1048576;
  // Valor da opção "Novo campo de texto" do Adicionar Campo.
  var NOVO_TEXTO = "__novo_texto__";

  // ─────────────────────────────────────────────
  //  CAMPOS DO CADASTRO (os 8 de sempre)
  // ─────────────────────────────────────────────
  // termos: como o título da coluna costuma aparecer (sem acento, em
  // minúsculas). evitar: títulos parecidos que NÃO são o campo.
  // São os usados para conferir as colunas dos modelos (Bling e ML).
  var CAMPOS = [
    { id: "nome", rotulo: "Nome do Produto", destino: "Identificação do Produto › Nome do Produto",
      termos: ["descricao", "titulo", "nome do produto", "nome"],
      evitar: ["complementar", "curta", "fornecedor", "categoria", "embalagem", "status", "variacao"] },
    { id: "sku", rotulo: "SKU", destino: "Identificação do Produto › SKU Principal",
      termos: ["sku", "codigo"],
      evitar: ["pai", "fornecedor", "universal", "barras", "gtin", "ean", "ncm", "cest", "anuncio", "servico", "integracao", "variacao"] },
    { id: "ean", rotulo: "EAN/GTIN", destino: "Identificação do Produto › ID do Produto",
      termos: ["gtin", "ean", "codigo universal", "codigo de barras"],
      evitar: ["embalagem"] },
    { id: "custo", rotulo: "Preço de Custo", destino: "Formação do Custo Total › Preço de Custo",
      termos: ["preco de custo", "custo"],
      evitar: ["frete", "envio"] },
    { id: "peso", rotulo: "Peso", destino: "Dimensões (Unidade) › Peso (g)",
      termos: ["peso bruto", "peso"],
      evitar: ["liquido"] },
    { id: "largura", rotulo: "Largura", destino: "Dimensões (Unidade) › Largura (cm)",
      termos: ["largura"], evitar: ["embalagem"] },
    { id: "altura", rotulo: "Altura", destino: "Dimensões (Unidade) › Altura (cm)",
      termos: ["altura"], evitar: ["embalagem"] },
    { id: "comprimento", rotulo: "Comprimento", destino: "Dimensões (Unidade) › Comprimento (cm)",
      termos: ["profundidade", "comprimento"], evitar: ["embalagem"] },
  ];
  function campoPorId(id) {
    for (var i = 0; i < CAMPOS.length; i++) if (CAMPOS[i].id === id) return CAMPOS[i];
    return null;
  }

  // ─────────────────────────────────────────────
  //  MODELOS DAS PLANILHAS
  // ─────────────────────────────────────────────
  // inicio: a linha em que os produtos começam. colunas: a coluna de cada
  // campo (as posições informadas para cada plataforma). buscar: campos
  // sem posição fixa, procurados só pelo título da coluna.
  // (A exportação — exportar-produtos.js — lê estas mesmas posições.)
  var MODELOS = {
    bling: {
      id: "bling",
      nome: "Bling",
      inicio: 2,
      colunas: { sku: "B", nome: "C", custo: "L", peso: "S", ean: "T", largura: "V", altura: "W", comprimento: "X" },
      buscar: [],
      pesoUnidade: "kg",
      desc: "A planilha de produtos exportada do Bling. Os produtos começam na linha 2.",
      traz: ["Nome", "SKU", "EAN/GTIN", "Preço de custo", "Peso (kg → g)", "Largura, altura e profundidade"],
    },
    ml: {
      id: "ml",
      nome: "Mercado Livre",
      inicio: 7,
      colunas: { sku: "E", nome: "F", largura: "AC", altura: "AD", comprimento: "AE" },
      // O GTIN/EAN não tem posição fixa: é procurado pelo título da coluna.
      buscar: ["ean"],
      pesoUnidade: "g",
      desc: "A planilha de anúncios baixada do Mercado Livre, com a opção SKU marcada. Os produtos começam na linha 7.",
      traz: ["Título", "SKU", "EAN/GTIN (se a planilha tiver)", "Largura, altura e profundidade"],
    },
  };

  // A terceira origem: qualquer outra planilha. Fica fora de MODELOS (que
  // são as posições fixas do Bling e do Mercado Livre).
  var ORIGEM_OUTRA = {
    id: "outra",
    nome: "Outra planilha",
    desc: "A planilha de produtos ou de anúncios de qualquer plataforma ou sistema — Amazon, Shopee, Magalu ou uma planilha sua. O Bapell procura os títulos das colunas e você ajusta o resto.",
    traz: ["Reconhece os títulos", "Células à sua escolha", "Qualquer campo do Bapell"],
  };
  function origemPorId(id) { return id === "outra" ? ORIGEM_OUTRA : MODELOS[id] || null; }

  // ─────────────────────────────────────────────
  //  UTILITÁRIOS
  // ─────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function aviso(msg, tipo, ms) {
    if (typeof showToast === "function") showToast(msg, tipo || "default", ms || 3800);
  }

  function registrarErro(contexto, e) {
    try {
      if (typeof PrecifiqErros !== "undefined" && PrecifiqErros && typeof PrecifiqErros.registrar === "function") {
        PrecifiqErros.registrar("Adicionar pela Planilha: " + contexto, e && e.stack ? e.stack : String(e));
        return;
      }
    } catch (_) {}
    console.error("[Adicionar pela Planilha]", contexto, e);
  }

  /** Minúsculas, sem acento, espaços simples. */
  function normTxt(t) {
    var s = String(t == null ? "" : t).toLowerCase();
    try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return s.replace(/\s+/g, " ").trim();
  }
  function normSku(t) { return String(t == null ? "" : t).trim().toUpperCase(); }

  function arred(n, casas) {
    var f = Math.pow(10, casas == null ? 2 : casas);
    return Math.round(n * f) / f;
  }

  function fmtNum(n, casas) {
    var v = Number(n);
    if (!isFinite(v)) return "";
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas == null ? 2 : casas });
  }
  function fmtBRL(n) {
    if (typeof formatBRL === "function") return formatBRL(n);
    return "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function plural(n, um, varios) { return n === 1 ? "1 " + um : fmtNum(n, 0) + " " + varios; }

  // ── Colunas: "A" ↔ 0 ──
  function indiceDaColuna(letras) {
    var s = String(letras || "").toUpperCase();
    var n = 0;
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }
  function colunaDoIndice(i) {
    var s = "";
    var n = i + 1;
    while (n > 0) {
      var r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }
  /** "b", "B2", " ac 7 " → "B", "B", "AC". Inválido → null. Vazio → "". */
  function lerColuna(txt) {
    var s = String(txt == null ? "" : txt).toUpperCase().replace(/[\s$]/g, "");
    if (!s) return "";
    var m = s.match(/^([A-Z]{1,3})\d*$/);
    if (!m) return null;
    if (indiceDaColuna(m[1]) > 16383) return null; // além da última coluna do Excel (XFD)
    return m[1];
  }

  /**
   * Uma célula digitada: "c2", "$C$2" → { col: "C", ci: 2, linha: 2, ref: "C2" }.
   * Só a letra ("C") vale na linha `linhaPadrao` (sem ela, é inválida).
   * Vazio → "". Inválido → null.
   */
  function lerRef(txt, linhaPadrao) {
    var s = String(txt == null ? "" : txt).toUpperCase().replace(/[\s$]/g, "");
    if (!s) return "";
    var m = s.match(/^([A-Z]{1,3})(\d{1,7})?$/);
    if (!m) return null;
    var ci = indiceDaColuna(m[1]);
    if (ci < 0 || ci > 16383) return null;
    var linha = m[2] ? parseInt(m[2], 10) : linhaPadrao;
    if (!(linha >= 1) || linha > MAX_LINHA_XL) return null;
    return { col: m[1], ci: ci, linha: linha, ref: m[1] + linha };
  }

  // ── Células ──
  function celula(sheet, col, linha) {
    return sheet ? sheet[col + linha] || null : null;
  }

  /** O texto de uma célula, como aparece na planilha. */
  function textoDe(c) {
    if (!c) return "";
    if (c.t === "e" || c.t === "z") return "";
    if (c.t === "n") {
      if (typeof c.v === "number" && isFinite(c.v)) {
        if (Number.isInteger(c.v) && Math.abs(c.v) < 9007199254740992) return String(c.v);
        return c.w != null ? String(c.w) : String(c.v);
      }
      return "";
    }
    if (c.t === "b") return c.v ? "VERDADEIRO" : "FALSO";
    if (c.v != null) return String(c.v);
    if (c.w != null) return String(c.w);
    return "";
  }

  /**
   * O número de uma célula. Entende "1.234,56", "1234.56", "R$ 12,50",
   * "0,500" e células numéricas. Vazia → null; texto que não é número → NaN.
   */
  function numeroDe(c) {
    if (!c) return null;
    if (c.t === "n") return typeof c.v === "number" && isFinite(c.v) ? c.v : NaN;
    var s = textoDe(c).trim();
    if (!s) return null;
    var neg = /^\(.*\)$/.test(s) || /^-/.test(s);
    var limpo = s.replace(/r\$|brl|kg|cm|g\b/gi, "").replace(/\s/g, "");
    if (!/^[(-]?[\d.,]+\)?$/.test(limpo)) return NaN;
    limpo = limpo.replace(/[()\-]/g, "");
    var temV = limpo.indexOf(",") >= 0;
    var temP = limpo.indexOf(".") >= 0;
    if (temV && temP) {
      if (limpo.lastIndexOf(",") > limpo.lastIndexOf(".")) limpo = limpo.replace(/\./g, "").replace(",", ".");
      else limpo = limpo.replace(/,/g, "");
    } else if (temV) {
      if ((limpo.match(/,/g) || []).length > 1) return NaN;
      limpo = limpo.replace(",", ".");
    } else if (temP && (limpo.match(/\./g) || []).length > 1) {
      // "1.234.567": separador de milhar.
      limpo = limpo.replace(/\./g, "");
    }
    var n = parseFloat(limpo);
    if (!isFinite(n)) return NaN;
    return neg ? -n : n;
  }

  /**
   * O número de uma célula de qualquer campo: como o numeroDe, aceitando
   * também a unidade junto do número ("15%", "120 mm", "1,5 m", "3 un").
   */
  function numeroDeCampo(c) {
    if (!c) return null;
    if (c.t === "n") return numeroDe(c);
    var s = textoDe(c).trim();
    if (!s) return null;
    var limpo = s.replace(/^(r\$|brl)\s*/i, "")
      .replace(/\s*(kg|kgs|gr|grs|gramas|g|mm|cm|mts|metros|m|%|un|und|unid|unidades)\.?$/i, "")
      .trim();
    if (!limpo) return NaN;
    return numeroDe({ t: "s", v: limpo });
  }

  /** O percentual de uma célula. A célula do Excel formatada em % (0,15) vale 15. */
  function pctDe(c) {
    if (!c) return null;
    if (c.t === "n" && typeof c.v === "number" && isFinite(c.v) && (/%/.test(String(c.w || "")) || /%/.test(String(c.z || "")))) {
      return arred(c.v * 100, 6);
    }
    return numeroDeCampo(c);
  }

  /** O EAN/GTIN de uma célula: só dígitos, como texto (os zeros à esquerda contam). */
  function eanDe(c) {
    if (!c) return "";
    if (c.t === "n" && typeof c.v === "number" && isFinite(c.v)) {
      var inteiro = Number.isInteger(c.v) ? String(c.v) : "";
      var w = c.w != null ? String(c.w).trim() : "";
      if (/^\d+$/.test(w) && w.length >= inteiro.length) return w;
      return inteiro || w;
    }
    return textoDe(c).replace(/\s+/g, "").trim();
  }

  /** Confere o dígito verificador de um GTIN (8, 12, 13 ou 14 dígitos). */
  function digitoGtinOk(cod) {
    var d = String(cod);
    var soma = 0;
    for (var i = d.length - 2, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) soma += Number(d.charAt(i)) * peso;
    return (10 - (soma % 10)) % 10 === Number(d.charAt(d.length - 1));
  }

  function gerarId() {
    return typeof generateId === "function" ? generateId() : "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // ─────────────────────────────────────────────
  //  BIBLIOTECA DE PLANILHAS (carrega só quando precisa)
  // ─────────────────────────────────────────────
  // A mesma do Processador de Planilhas e da planilha do Financeiro.
  var _promessaXlsx = null;
  function carregarXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (_promessaXlsx) return _promessaXlsx;
    _promessaXlsx = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "JS/xlsx.full.min.js";
      s.onload = function () { if (window.XLSX) resolve(window.XLSX); else reject(new Error("Biblioteca de planilhas indisponível")); };
      s.onerror = function () { _promessaXlsx = null; reject(new Error("Falha ao carregar a biblioteca de planilhas")); };
      document.head.appendChild(s);
    });
    return _promessaXlsx;
  }

  /**
   * Lê o arquivo. O CSV é decodificado aqui: o do Bling costuma vir em
   * Latin-1 e, lido como UTF-8, "Descrição" virava "DescriÃ§Ã£o". Nele os
   * valores ficam como texto (raw): sem isso, "07891234567890" perdia o
   * zero da frente e "0,500" podia virar outro número.
   */
  function lerArquivo(file) {
    return carregarXlsx().then(function (XLSX) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function (e) {
          try {
            var bytes = new Uint8Array(e.target.result);
            var nome = String(file.name || "").toLowerCase();
            var wb;
            if (/\.(csv|txt)$/.test(nome)) {
              var texto;
              try { texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
              catch (er) { texto = new TextDecoder("windows-1252").decode(bytes); }
              if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
              wb = XLSX.read(texto, { type: "string", raw: true });
            } else {
              wb = XLSX.read(bytes, { type: "array", raw: false, cellDates: false });
            }
            resolve(wb);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = function () { reject(reader.error || new Error("Falha ao ler o arquivo")); };
        reader.readAsArrayBuffer(file);
      });
    });
  }

  // ─────────────────────────────────────────────
  //  ANÁLISE DA PLANILHA (modelos)
  // ─────────────────────────────────────────────
  /** Última linha e última coluna com conteúdo declarado na aba. */
  function limitesDaAba(sheet) {
    var ref = sheet && sheet["!ref"];
    var m = ref ? String(ref).match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/) : null;
    if (!m) return { ultimaLinha: 0, ultimaColuna: 0 };
    var colFim = m[3] || m[1];
    var linFim = parseInt(m[4] || m[2], 10);
    return { ultimaLinha: linFim, ultimaColuna: indiceDaColuna(colFim) };
  }

  /** Os textos de uma coluna nas linhas de cabeçalho (antes da 1ª linha de produtos). */
  function titulosDaColuna(sheet, col, inicio) {
    var achados = [];
    var de = Math.max(1, inicio - 8);
    for (var L = inicio - 1; L >= de; L--) {
      var t = textoDe(celula(sheet, col, L)).trim();
      if (t) achados.push(t);
    }
    return achados; // do mais perto da 1ª linha para cima
  }

  /** O texto que representa o título da coluna (o que casa com o campo, se houver). */
  function tituloDaColuna(sheet, col, inicio, campo) {
    var lista = titulosDaColuna(sheet, col, inicio);
    if (!lista.length) return "";
    if (campo) {
      for (var i = 0; i < lista.length; i++) if (casaComCampo(lista[i], campo) > 0) return lista[i];
    }
    // Sem um que case: o mais curto entre os mais próximos (o título, não a instrução).
    var curtos = lista.filter(function (t) { return t.length <= 60; });
    return (curtos[0] || lista[0]).slice(0, 80);
  }

  /** Quanto um título casa com o campo: 0 = não casa; maior = melhor. */
  function casaComCampo(titulo, campo) {
    var t = normTxt(titulo);
    if (!t) return 0;
    for (var e = 0; e < campo.evitar.length; e++) if (t.indexOf(campo.evitar[e]) >= 0) return 0;
    var melhor = 0;
    for (var i = 0; i < campo.termos.length; i++) {
      var termo = campo.termos[i];
      var nota = 0;
      if (t === termo) nota = 100;
      else if (t.indexOf(termo) === 0) nota = 60;
      else if (t.indexOf(termo) > 0) nota = 30;
      if (nota) nota -= i; // termo mais específico primeiro
      if (nota > melhor) melhor = nota;
    }
    return melhor;
  }

  /** Procura, pelos títulos, a coluna de um campo. Ignora as colunas em `usadas`. */
  function procurarColuna(sheet, campo, inicio, usadas) {
    var lim = limitesDaAba(sheet);
    var ultima = Math.min(lim.ultimaColuna, 400);
    var melhor = null, nota = 0;
    for (var i = 0; i <= ultima; i++) {
      var col = colunaDoIndice(i);
      if (usadas[col]) continue;
      var lista = titulosDaColuna(sheet, col, inicio);
      for (var k = 0; k < lista.length; k++) {
        var n = casaComCampo(lista[k], campo);
        if (n > nota) { nota = n; melhor = { col: col, titulo: lista[k] }; }
      }
    }
    return melhor;
  }

  /** A aba tem cara do modelo? (os títulos das colunas do modelo casam) */
  function abaCasaComModelo(sheet, modelo) {
    var acertos = 0, testados = 0;
    Object.keys(modelo.colunas).forEach(function (id) {
      var campo = campoPorId(id);
      var lista = titulosDaColuna(sheet, modelo.colunas[id], modelo.inicio);
      if (!lista.length) return;
      testados++;
      for (var k = 0; k < lista.length; k++) if (casaComCampo(lista[k], campo) > 0) { acertos++; return; }
    });
    return testados > 0 && acertos >= Math.min(2, testados);
  }

  /** A aba tem alguma linha preenchida a partir de `inicio`? */
  function abaTemDados(sheet, inicio) {
    var lim = limitesDaAba(sheet);
    return lim.ultimaLinha >= inicio;
  }

  /**
   * As abas lidas por padrão: as que têm cara do modelo (o Mercado Livre
   * separa os anúncios em uma aba por categoria). Nenhuma? A primeira com
   * linhas depois do cabeçalho.
   */
  function abasSugeridas(wb, modelo) {
    var nomes = wb.SheetNames || [];
    var casam = nomes.filter(function (n) { return abaCasaComModelo(wb.Sheets[n], modelo); });
    if (casam.length) return casam;
    for (var i = 0; i < nomes.length; i++) if (abaTemDados(wb.Sheets[nomes[i]], modelo.inicio)) return [nomes[i]];
    return nomes.length ? [nomes[0]] : [];
  }

  /**
   * As colunas de partida: as do modelo, conferidas pelo título.
   *   ok        — o título da coluna do modelo é o do campo
   *   sem-titulo — a coluna não tem título: fica a posição do modelo
   *   ajustado  — o título estava em outra coluna: ela é usada (e avisada)
   *   confira   — o título da coluna do modelo é outro e não achei o campo
   *   titulo    — campo sem posição fixa, achado pelo título
   *   ausente   — campo que o modelo não traz (ou não achei pelo título)
   */
  function mapeamentoInicial(sheet, modelo) {
    var colunas = {}, situacao = {};
    var usadas = Object.create(null);
    // Primeiro os que conferem: as colunas deles ficam reservadas.
    var pendentes = [];
    CAMPOS.forEach(function (campo) {
      var col = modelo.colunas[campo.id];
      if (!col) return;
      var lista = titulosDaColuna(sheet, col, modelo.inicio);
      var confere = lista.some(function (t) { return casaComCampo(t, campo) > 0; });
      if (!lista.length) { colunas[campo.id] = col; situacao[campo.id] = { tipo: "sem-titulo" }; usadas[col] = true; }
      else if (confere) { colunas[campo.id] = col; situacao[campo.id] = { tipo: "ok" }; usadas[col] = true; }
      else pendentes.push(campo);
    });
    pendentes.forEach(function (campo) {
      var col = modelo.colunas[campo.id];
      var achado = procurarColuna(sheet, campo, modelo.inicio, usadas);
      if (achado) {
        colunas[campo.id] = achado.col;
        situacao[campo.id] = { tipo: "ajustado", de: col, titulo: achado.titulo };
        usadas[achado.col] = true;
      } else {
        colunas[campo.id] = col;
        situacao[campo.id] = { tipo: "confira", titulo: tituloDaColuna(sheet, col, modelo.inicio) };
        usadas[col] = true;
      }
    });
    CAMPOS.forEach(function (campo) {
      if (colunas[campo.id]) return;
      if (modelo.buscar.indexOf(campo.id) >= 0) {
        var achado = procurarColuna(sheet, campo, modelo.inicio, usadas);
        if (achado) {
          colunas[campo.id] = achado.col;
          situacao[campo.id] = { tipo: "titulo", titulo: achado.titulo };
          usadas[achado.col] = true;
          return;
        }
      }
      colunas[campo.id] = "";
      situacao[campo.id] = { tipo: "ausente", buscado: modelo.buscar.indexOf(campo.id) >= 0 };
    });
    return { colunas: colunas, situacao: situacao };
  }

  // ─────────────────────────────────────────────
  //  CATÁLOGO: OS CAMPOS DO BAPELL QUE A PLANILHA PODE PREENCHER
  // ─────────────────────────────────────────────
  // tipo ....... texto | codigo | dinheiro | pct | numero | peso | medida
  // nucleo ..... um dos 8 campos de CAMPOS (sempre na lista da etapa Campos)
  // prop ....... a propriedade do produto que recebe o valor
  // soML/naoML . só nas plataformas do Mercado Livre / só nas outras
  // margem ..... "pct" | "rs": a Margem Desejada, e em que tipo
  // preco ...... "unico" | "premium" | "classico": o Preço de Venda (o
  //              Bapell calcula a margem que dá esse preço)
  // max ........ limite (exclusivo) dos percentuais de venda e da margem
  // aplicar .... os campos personalizados: cria o campo no produto
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

  // Os campos que a pessoa pode renomear (e ocultar) em "Configurar
  // Campos" (campos.js): id do campo na ficha → [id aqui, nome padrão].
  var RENOMEAVEIS = {
    productName: ["nome", "Nome do Produto"], productSku: ["sku", "SKU Principal"], productId: ["ean", "ID do Produto"],
    custoCusto: ["custo", "Preço de Custo"], custoEmbalagem: ["embalagem", "Embalagem"], custoEtiqueta: ["etiqueta", "Etiqueta"],
    custoFrete: ["frete", "Frete Pago"], custoIpi: ["ipi", "IPI (%)"], custoDifal: ["difal", "DIFAL (%)"], custoSt: ["st", "ST (%)"],
    custoAliquota: ["aliquota", "Alíquota (%)"], freteProduto: ["freteProduto", "Frete do Produto"],
    taxaFixa: ["taxaFixa", "Taxa Fixa Da Plataforma"], taxaPlataforma: ["taxa", "Taxa Da Plataforma (%)"], impostoNF: ["impostoNF", "Imposto NF (%)"],
  };
  // Não podem ser ocultados (campos.js: ocultavel false).
  var NAO_OCULTAVEIS = { productName: true, custoCusto: true };

  function camposFixos(ehML) {
    var semEmb = ["embalagem", "caixa", "volume", "package"];
    var nucleo = {
      nome: { secao: S_ID, tipo: "texto",
        termos: ["nome do produto", "nome", "descricao do produto", "descricao", "titulo do anuncio", "titulo", "produto", "nome do item", "item name", "product name", "title", "name"],
        evitar: ["complementar", "curta", "fornecedor", "categoria", "variacao", "marca", "modelo", "imagem", "url", "link", "embalagem", "status", "loja", "cliente", "id", "codigo"] },
      sku: { secao: S_ID, tipo: "texto",
        termos: ["sku", "codigo sku", "seller sku", "sku do vendedor", "codigo do produto", "codigo", "cod", "referencia", "ref"],
        evitar: ["pai", "parent", "fornecedor", "universal", "barras", "gtin", "ean", "ncm", "cest", "anuncio", "servico", "integracao", "variacao", "categoria", "marca", "cliente", "lista"] },
      ean: { secao: S_ID, tipo: "codigo",
        termos: ["gtin ean", "gtin", "ean", "codigo de barras", "codigo universal de produto", "codigo universal", "barcode", "upc"],
        evitar: ["embalagem", "tributavel", "caixa", "tipo"] },
      custo: { secao: S_CUSTO, tipo: "dinheiro",
        termos: ["preco de custo", "valor de custo", "custo unitario", "custo", "valor de compra", "preco de compra", "custo de compra", "cost price", "unit cost", "cost"],
        evitar: ["frete", "envio", "total", "medio", "embalagem", "etiqueta"] },
      peso: { secao: S_DIM, tipo: "peso",
        termos: ["peso bruto", "peso", "peso liquido", "item weight", "weight"], evitar: semEmb.concat(["cubado"]) },
      largura: { secao: S_DIM, tipo: "medida", termos: ["largura", "width"], evitar: semEmb },
      altura: { secao: S_DIM, tipo: "medida", termos: ["altura", "height"], evitar: semEmb },
      comprimento: { secao: S_DIM, tipo: "medida", termos: ["comprimento", "profundidade", "length", "depth"], evitar: semEmb },
    };
    var lista = CAMPOS.map(function (c) {
      var n = nucleo[c.id];
      return { id: c.id, rotulo: c.rotulo, destino: c.destino, secao: n.secao, tipo: n.tipo, nucleo: true,
        termos: n.termos.slice(), evitar: n.evitar.slice() };
    });
    function ext(def) { def.destino = def.secao + " › " + def.rotulo; return def; }
    lista.push(
      ext({ id: "embalagem", rotulo: "Embalagem", secao: S_CUSTO, tipo: "dinheiro", prop: "embalagem",
        termos: ["custo de embalagem", "custo da embalagem", "embalagem"],
        evitar: ["gtin", "ean", "codigo", "peso", "largura", "altura", "comprimento", "profundidade", "unidade", "tipo", "quantidade", "itens"] }),
      ext({ id: "etiqueta", rotulo: "Etiqueta", secao: S_CUSTO, tipo: "dinheiro", prop: "etiqueta",
        termos: ["custo de etiqueta", "custo da etiqueta", "etiqueta"], evitar: ["codigo", "tipo", "modelo"] }),
      ext({ id: "frete", rotulo: "Frete Pago", secao: S_CUSTO, tipo: "dinheiro", prop: "frete",
        termos: ["frete pago", "frete de compra", "frete do fornecedor"], evitar: ["gratis", "venda", "tipo", "modalidade", "classe"] }),
      ext({ id: "ipi", rotulo: "IPI (%)", secao: S_CUSTO, tipo: "pct", prop: "ipi",
        termos: ["ipi", "aliquota de ipi", "aliquota ipi"], evitar: ["valor", "fixo", "classe", "enquadramento", "codigo"] }),
      ext({ id: "difal", rotulo: "DIFAL (%)", secao: S_CUSTO, tipo: "pct", prop: "difal", termos: ["difal"], evitar: ["valor"] }),
      ext({ id: "st", rotulo: "ST (%)", secao: S_CUSTO, tipo: "pct", prop: "st",
        termos: ["icms st", "substituicao tributaria"], evitar: ["valor", "base"] }),
      ext({ id: "aliquota", rotulo: "Alíquota (%)", secao: S_CUSTO, tipo: "pct", prop: "aliquota",
        termos: ["aliquota", "aliquota icms", "aliquota de icms"], evitar: ["ipi", "st", "valor"] }),
      ext({ id: "freteProduto", rotulo: "Frete do Produto", secao: S_VENDA, tipo: "dinheiro", prop: "freteProduto",
        termos: ["frete do produto", "frete de venda", "custo de envio"], evitar: ["gratis", "tipo", "modalidade"] }),
      ext({ id: "taxaFixa", rotulo: "Taxa Fixa da Plataforma", secao: S_VENDA, tipo: "dinheiro", prop: "taxaFixa",
        termos: ["taxa fixa da plataforma", "taxa fixa", "tarifa fixa"], evitar: [] })
    );
    if (ehML) {
      lista.push(
        ext({ id: "mlTaxaPremium", rotulo: "Taxa Premium (%)", secao: S_VENDA, tipo: "pct", prop: "mlTaxaPremium", soML: true, max: 100,
          termos: ["taxa premium", "tarifa premium", "comissao premium"], evitar: [] }),
        ext({ id: "mlTaxaClassico", rotulo: "Taxa Clássico (%)", secao: S_VENDA, tipo: "pct", prop: "mlTaxaClassico", soML: true, max: 100,
          termos: ["taxa classico", "tarifa classico", "comissao classico"], evitar: [] })
      );
    } else {
      lista.push(ext({ id: "taxa", rotulo: "Taxa da Plataforma (%)", secao: S_VENDA, tipo: "pct", prop: "taxa", naoML: true, max: 100,
        termos: ["taxa da plataforma", "taxa de venda", "tarifa de venda", "comissao"], evitar: ["fixa", "frete", "juros"] }));
    }
    lista.push(
      ext({ id: "impostoNF", rotulo: "Imposto NF (%)", secao: S_VENDA, tipo: "pct", prop: "impostoNF", max: 100,
        termos: ["imposto nf", "imposto da nota", "imposto sobre a venda", "imposto nota fiscal"], evitar: ["ipi", "st", "difal", "valor", "renda"] }),
      ext({ id: "margemPct", rotulo: "Margem Desejada (%)", secao: S_MARGEM, tipo: "pct", margem: "pct", max: 100,
        termos: ["margem desejada", "margem de lucro", "margem"], evitar: ["real", "contribuicao", "valor", "r", "rs", "reais"] }),
      ext({ id: "margemRS", rotulo: "Margem Desejada (R$)", secao: S_MARGEM, tipo: "dinheiro", margem: "rs",
        termos: ["margem r", "margem rs", "margem em reais", "lucro desejado"], evitar: [] }),
      ext({ id: "precoVenda", rotulo: ehML ? "Preço de Venda (Premium)" : "Preço de Venda", secao: S_FINAL, tipo: "dinheiro", preco: ehML ? "premium" : "unico",
        termos: ["preco de venda", "valor de venda", "preco venda", "preco unitario", "valor unitario", "preco por", "preco", "sale price", "your price", "standard price", "price"],
        evitar: ["custo", "promoc", "minimo", "maximo", "ideal", "frete", "atacado", "antigo", "compra", "ipi", "icms", "imposto", "desconto", "sugerido", "de lista", "cost", "shipping"] })
    );
    if (ehML) {
      lista.push(ext({ id: "precoVendaClassico", rotulo: "Preço de Venda (Clássico)", secao: S_FINAL, tipo: "dinheiro", preco: "classico", soML: true,
        termos: ["preco classico"], evitar: [] }));
    }
    var suf = ehML ? " (Premium)" : "";
    lista.push(
      ext({ id: "precoMinimo", rotulo: "Preço Mínimo" + suf, secao: S_EXTRAS, tipo: "dinheiro", prop: "precoMinimo", termos: ["preco minimo"], evitar: [] }),
      ext({ id: "precoIdeal", rotulo: "Preço Ideal" + suf, secao: S_EXTRAS, tipo: "dinheiro", prop: "precoIdeal", termos: ["preco ideal"], evitar: [] }),
      ext({ id: "precoMaximo", rotulo: "Preço Máximo" + suf, secao: S_EXTRAS, tipo: "dinheiro", prop: "precoMaximo", termos: ["preco maximo"], evitar: [] })
    );
    if (ehML) {
      lista.push(
        ext({ id: "precoMinimoClassico", rotulo: "Preço Mínimo (Clássico)", secao: S_EXTRAS, tipo: "dinheiro", prop: "precoMinimoClassico", soML: true, termos: [], evitar: [] }),
        ext({ id: "precoIdealClassico", rotulo: "Preço Ideal (Clássico)", secao: S_EXTRAS, tipo: "dinheiro", prop: "precoIdealClassico", soML: true, termos: [], evitar: [] }),
        ext({ id: "precoMaximoClassico", rotulo: "Preço Máximo (Clássico)", secao: S_EXTRAS, tipo: "dinheiro", prop: "precoMaximoClassico", soML: true, termos: [], evitar: [] })
      );
    }
    return lista;
  }

  /**
   * Um campo de texto da Identificação do Produto (camposIdentificacao).
   * `novo`: criado agora pelo "Adicionar Campo" (não existe em produto
   * nenhum desta plataforma).
   */
  function campoTexto(nome, novo) {
    var k = normTxt(nome);
    var rot = String(nome).replace(/\s+/g, " ").trim();
    return {
      id: "cid:" + k, rotulo: rot, secao: S_ID, destino: S_ID + " › " + rot + (novo ? " (campo novo)" : ""),
      tipo: "texto", personalizado: true, novo: !!novo, termos: [k], evitar: [],
      aplicar: function (p, v) {
        if (!Array.isArray(p.camposIdentificacao)) p.camposIdentificacao = [];
        var texto = v == null ? "" : String(v);
        var x = p.camposIdentificacao.filter(function (y) { return y && normTxt(y.nome) === k; })[0];
        if (x) x.texto = texto;
        else p.camposIdentificacao.push({ id: gerarId(), nome: rot, texto: texto });
      },
    };
  }

  /** O valor de um campo de seção personalizada, como a ficha guarda (texto). */
  function valorDeSecao(tipo, v) {
    if (v == null || v === "") return "";
    if (tipo === "text") return String(v);
    var n = Number(v);
    if (!isFinite(n)) return "";
    if (tipo === "money") return typeof formatMoneyBR === "function" ? formatMoneyBR(n) : fmtNum(n, 2);
    if (tipo === "percent") return typeof formatPercentBR === "function" ? formatPercentBR(n) : fmtNum(n, 2);
    return Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
  }

  /** Os campos personalizados que os produtos desta plataforma têm. */
  function camposPersonalizados(produtos) {
    var out = [];
    var vistos = Object.create(null);
    function add(def) { if (vistos[def.id]) return; vistos[def.id] = true; out.push(def); }
    (produtos || []).forEach(function (p) {
      if (!p) return;
      (Array.isArray(p.camposIdentificacao) ? p.camposIdentificacao : []).forEach(function (c) {
        if (c && normTxt(c.nome)) add(campoTexto(c.nome, false));
      });
      (Array.isArray(p.camposPersonalizados) ? p.camposPersonalizados : []).forEach(function (c) {
        var k = normTxt(c && c.nome);
        if (!k) return;
        var cat = (c.categoria || "venda") === "custo" ? "custo" : "venda";
        var tipo = c.tipo === "PCT" ? "PCT" : "RS";
        var base = cat === "custo" ? (c.base || "custoTotal") : null;
        var nome = String(c.nome).replace(/\s+/g, " ").trim();
        var rot = nome + (tipo === "PCT" ? " (%)" : " (R$)");
        var secao = cat === "custo" ? S_CUSTO : S_VENDA;
        add({
          id: (cat === "custo" ? "cpc:" : "cpv:") + k, rotulo: rot, secao: secao, destino: secao + " › " + rot,
          tipo: tipo === "PCT" ? "pct" : "dinheiro", personalizado: true, termos: [k], evitar: [],
          aplicar: function (pp, v) {
            if (!Array.isArray(pp.camposPersonalizados)) pp.camposPersonalizados = [];
            var valor = v == null ? 0 : v;
            var x = pp.camposPersonalizados.filter(function (y) { return y && (y.categoria || "venda") === cat && normTxt(y.nome) === k; })[0];
            if (x) x.valor = valor;
            else pp.camposPersonalizados.push({ id: gerarId(), nome: nome, tipo: tipo, valor: valor, categoria: cat, base: base });
          },
        });
      });
      (Array.isArray(p.secoesCustom) ? p.secoesCustom : []).forEach(function (s) {
        if (!s) return;
        var ts = normTxt(s.titulo);
        var tituloSec = String(s.titulo || "").replace(/\s+/g, " ").trim() || "Seção personalizada";
        (Array.isArray(s.campos) ? s.campos : []).forEach(function (c) {
          var kr = normTxt(c && c.rotulo);
          if (!kr) return;
          var tipoSec = c.tipo === "money" || c.tipo === "percent" || c.tipo === "number" ? c.tipo : "text";
          var rot = String(c.rotulo).replace(/\s+/g, " ").trim();
          add({
            id: "sec:" + ts + "|" + kr, rotulo: rot, secao: tituloSec, destino: tituloSec + " › " + rot,
            tipo: tipoSec === "money" ? "dinheiro" : tipoSec === "percent" ? "pct" : tipoSec === "number" ? "numero" : "texto",
            personalizado: true, termos: [kr], evitar: [],
            aplicar: function (pp, v) {
              if (!Array.isArray(pp.secoesCustom)) pp.secoesCustom = [];
              var sec = pp.secoesCustom.filter(function (y) { return y && normTxt(y.titulo) === ts; })[0];
              if (!sec) { sec = { id: gerarId(), titulo: tituloSec, campos: [] }; pp.secoesCustom.push(sec); }
              if (!Array.isArray(sec.campos)) sec.campos = [];
              var valor = valorDeSecao(tipoSec, v);
              var x = sec.campos.filter(function (y) { return y && normTxt(y.rotulo) === kr; })[0];
              if (x) x.valor = valor;
              else sec.campos.push({ id: gerarId(), rotulo: rot, valor: valor, tipo: tipoSec });
            },
          });
        });
      });
    });
    return out;
  }

  /** Nomes trocados e campos ocultos em "Configurar Campos" desta plataforma. */
  function configCampos(pid) {
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem("precifiq_field_cfg_" + pid)) || {}; } catch (e) { cfg = {}; }
    var out = { rotulos: {}, ocultos: {} };
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return out;
    Object.keys(RENOMEAVEIS).forEach(function (k) {
      var c = cfg[k];
      if (!c || typeof c !== "object") return;
      var id = RENOMEAVEIS[k][0];
      var padrao = RENOMEAVEIS[k][1];
      if (c.label && String(c.label).trim() && normTxt(c.label) !== normTxt(padrao)) out.rotulos[id] = String(c.label).trim();
      if (c.oculto && !NAO_OCULTAVEIS[k]) out.ocultos[id] = true;
    });
    return out;
  }

  function montarCatalogo(pid, ehML, produtos) {
    var cc = configCampos(pid);
    var lista = camposFixos(ehML).map(function (c) {
      var novo = cc.rotulos[c.id];
      if (novo) {
        // O EAN continua "EAN/GTIN" na lista; o destino mostra o nome novo.
        if (c.id !== "ean") c.rotulo = novo;
        c.destino = c.secao + " › " + novo;
        c.termos = [normTxt(novo)].concat(c.termos);
      }
      if (cc.ocultos[c.id]) c.oculto = true;
      return c;
    });
    return lista.concat(camposPersonalizados(produtos));
  }

  // ─────────────────────────────────────────────
  //  RECONHECIMENTO PELOS TÍTULOS (qualquer planilha)
  // ─────────────────────────────────────────────
  /** Título → texto comparável: sem acento, minúsculo, pontuação vira espaço. */
  function normTitulo(t) {
    return normTxt(t).replace(/[^a-z0-9%]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function temPalavra(t, termo) {
    if (!termo) return false;
    return (" " + t + " ").indexOf(" " + termo + " ") >= 0;
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
  function precisaUnidade(c) { return !!c && (c.tipo === "peso" || c.tipo === "medida"); }
  // O Preço de Venda tem, no lugar da unidade, o tipo da margem calculada.
  function temSeletor(c) { return precisaUnidade(c) || !!(c && c.preco); }
  function unidadePadrao(c) { return !c ? "" : c.tipo === "peso" ? "g" : c.tipo === "medida" ? "cm" : c.preco ? "pct" : ""; }

  /**
   * A linha de títulos da aba: a que tem mais títulos reconhecidos com
   * certeza (até `ateLinha`, 25 por padrão). Devolve { linha, fortes,
   * achados[] } — achados: { ci, campo, nota, titulo } (uma coluna por
   * campo). Menos de 2 certos: linha 0 (sem linha de títulos clara).
   */
  function reconhecerTitulos(sheet, catalogo, ateLinha) {
    var lim = limitesDaAba(sheet);
    var ultCol = Math.min(lim.ultimaColuna, 300);
    var ultLin = Math.min(lim.ultimaLinha, ateLinha == null ? 25 : ateLinha);
    var melhor = { linha: 0, fortes: 0, achados: [] };
    var reconheciveis = catalogo.filter(function (c) { return c.termos && c.termos.length; }).map(prepararCampo);
    for (var L = 1; L <= ultLin; L++) {
      var pares = [];
      for (var ci = 0; ci <= ultCol; ci++) {
        var t = textoDe(celula(sheet, colunaDoIndice(ci), L)).trim();
        if (!t || t.length > 60) continue;
        var pt = prepararTitulo(t);
        for (var k = 0; k < reconheciveis.length; k++) {
          var n = notaPreparada(pt, reconheciveis[k]);
          if (n > 0) pares.push({ ci: ci, campo: reconheciveis[k], nota: n, titulo: t });
        }
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
    return melhor.fortes >= 2 ? melhor
      : { linha: 0, fortes: melhor.fortes, achados: melhor.fortes ? melhor.achados : [], linhaFraca: melhor.linha };
  }

  // ─────────────────────────────────────────────
  //  CONFIGURAÇÕES SALVAS
  // ─────────────────────────────────────────────
  function lerConfigs() {
    var lista = [];
    try { lista = JSON.parse(localStorage.getItem(CONFIG_KEY)) || []; } catch (e) { lista = []; }
    return Array.isArray(lista) ? lista.filter(function (c) { return c && c.id && c.nome && Array.isArray(c.mapas); }) : [];
  }
  function gravarConfigs(lista) {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(lista)); return true; }
    catch (e) { registrarErro("salvar configuração", e); return false; }
  }

  // ─────────────────────────────────────────────
  //  LEITURA DOS PRODUTOS
  // ─────────────────────────────────────────────
  /**
   * Lê os produtos das abas escolhidas com os campos marcados.
   * cfg: { abas, inicio, fim, porCampo{ id → mapa }, extras[mapa] }, cada
   * mapa: { campo, entry, col, off, fimLinha, unidade } — off: quantas
   * linhas a célula inicial do campo está abaixo (ou acima) da linha em
   * que os produtos começam.
   * Cada linha vira { chave, aba, linha, nome, sku, ean, custo, peso,
   * largura, altura, comprimento, valores{}, avisos[], bloqueio }.
   */
  function lerProdutos(wb, cfg) {
    var linhas = [];
    var vazias = 0, cortadas = false;
    var vistosSku = Object.create(null);
    var vistosNome = Object.create(null);
    var todos = Object.keys(cfg.porCampo).map(function (k) { return cfg.porCampo[k]; }).concat(cfg.extras);

    cfg.abas.forEach(function (nomeAba) {
      var sheet = wb.Sheets[nomeAba];
      if (!sheet) return;
      var vaziasSeguidas = 0;
      var lim = limitesDaAba(sheet);
      // Até onde ler: a última linha de algum campo (respeitando a célula
      // final de cada um) e, se informada, a última linha da tela.
      var fim = 0;
      todos.forEach(function (m) {
        var ult = lim.ultimaLinha;
        if (m.fimLinha && m.fimLinha < ult) ult = m.fimLinha;
        fim = Math.max(fim, ult - m.off);
      });
      if (cfg.fim && cfg.fim < fim) fim = cfg.fim;
      for (var L = cfg.inicio; L <= fim; L++) {
        if (linhas.length >= MAX_LINHAS) { cortadas = true; break; }
        var r = lerLinha(sheet, L, cfg);
        if (!r) {
          vazias++;
          // Formatação até o fim da planilha: depois de 10.000 linhas vazias
          // seguidas, não há mais produto.
          if (++vaziasSeguidas > 10000) break;
          continue;
        }
        vaziasSeguidas = 0;
        r.aba = nomeAba;
        r.linha = L;
        r.chave = nomeAba + "!" + L;
        if (!r.nome) r.bloqueio = "sem-nome";
        // A linha de total que muitas planilhas têm no fim (sem SKU, com
        // "TOTAL" no lugar do nome): entra DESMARCADA, e a pessoa decide.
        if (r.nome && !r.sku && /^(sub ?)?(total|totais)( geral)?\b/.test(normTxt(r.nome))) {
          r.pareceTotal = true;
          r.avisos.push("Parece a linha de total da planilha: ficou desmarcada");
        }
        // Repetido na própria planilha: fica o primeiro (com nome). Com SKU,
        // pelo SKU; sem SKU, pelo nome.
        var onde = (cfg.abas.length > 1 ? nomeAba + ", " : "") + L;
        if (r.sku && !r.bloqueio) {
          var k = normSku(r.sku);
          if (vistosSku[k]) {
            r.bloqueio = "repetido";
            r.avisos.push("SKU repetido na planilha (já está na linha " + vistosSku[k] + ")");
          } else {
            vistosSku[k] = onde;
          }
        } else if (!r.sku && !r.bloqueio) {
          var kn = normTxt(r.nome);
          if (vistosNome[kn]) {
            r.bloqueio = "repetido";
            r.avisos.push("Produto sem SKU repetido na planilha (o mesmo nome está na linha " + vistosNome[kn] + ")");
          } else {
            vistosNome[kn] = onde;
          }
        }
        linhas.push(r);
      }
      // As vazias depois do último produto não são "linhas vazias ignoradas":
      // são só o fim da planilha.
      vazias -= vaziasSeguidas;
    });
    return { linhas: linhas, vazias: Math.max(0, vazias), cortadas: cortadas, extras: cfg.extras };
  }

  function lerLinha(sheet, L, cfg) {
    var r = { nome: "", sku: "", ean: "", custo: null, peso: null, largura: null, altura: null, comprimento: null,
      valores: {}, avisos: [], bloqueio: null };
    var temAlgo = false;
    function cel(m) {
      if (!m) return null;
      var linha = L + m.off;
      if (linha < 1 || (m.fimLinha && linha > m.fimLinha)) return null;
      return celula(sheet, m.col, linha);
    }
    var c = function (id) { return cel(cfg.porCampo[id]); };

    // Nome: espaços simples e MAIÚSCULAS.
    var nome = textoDe(c("nome")).replace(/\s+/g, " ").trim();
    if (nome) { temAlgo = true; r.nome = nome.toLocaleUpperCase("pt-BR"); }

    var sku = textoDe(c("sku")).trim();
    if (sku) { temAlgo = true; r.sku = sku; }

    var ean = eanDe(c("ean"));
    if (ean) {
      temAlgo = true;
      // Só um GTIN de verdade (8, 12, 13 ou 14 dígitos, com o dígito
      // verificador certo) vai para o ID do Produto. O resto é avisado.
      if (/^\d+$/.test(ean) && [8, 12, 13, 14].indexOf(ean.length) >= 0 && digitoGtinOk(ean)) {
        r.ean = ean;
      } else if (/^\d+$/.test(ean) && [8, 12, 13, 14].indexOf(ean.length) >= 0) {
        r.avisos.push("EAN/GTIN ignorado: o dígito verificador de " + ean + " não confere");
      } else {
        r.avisos.push("EAN/GTIN inválido ignorado: " + ean.slice(0, 30));
      }
    }

    // Números: inválido ou negativo é ignorado (fica como num produto novo).
    function numero(id, rotulo, conv) {
      var m = cfg.porCampo[id];
      var cl = cel(m);
      if (!cl) return;
      var n = numeroDeCampo(cl);
      if (n === null) return;
      temAlgo = true;
      if (isNaN(n) || n < 0) {
        r.avisos.push(rotulo + " inválido ignorado: " + textoDe(cl).slice(0, 30));
        return;
      }
      r[id] = conv(n, m.unidade);
    }
    var medida = function (n, u) { return arred(u === "mm" ? n / 10 : u === "m" ? n * 100 : n, 2); };
    numero("custo", "Preço de custo", function (n) { return arred(n, 2); });
    numero("peso", "Peso", function (n, u) { return arred(u === "kg" ? n * 1000 : n, 2); });
    numero("largura", "Largura", medida);
    numero("altura", "Altura", medida);
    numero("comprimento", "Comprimento", medida);

    // Os outros campos (Adicionar Campo). Campo personalizado marcado e
    // vazio na linha: é criado no produto, vazio (todos os produtos da
    // importação ficam com os mesmos campos).
    cfg.extras.forEach(function (m) {
      var e = m.entry;
      var personalizado = typeof e.aplicar === "function";
      var cl = cel(m);
      var txt = textoDe(cl).trim();
      if (!txt) { if (personalizado) r.valores[e.id] = null; return; }
      temAlgo = true;
      if (e.tipo === "texto" || e.tipo === "codigo") { r.valores[e.id] = txt.replace(/\s+/g, " ").slice(0, 500); return; }
      var n = e.tipo === "pct" ? pctDe(cl) : numeroDeCampo(cl);
      if (n === null) { if (personalizado) r.valores[e.id] = null; return; }
      if (isNaN(n) || n < 0 || (e.max && n >= e.max)) {
        r.avisos.push(e.rotulo + " inválido ignorado: " + txt.slice(0, 30));
        if (personalizado) r.valores[e.id] = null;
        return;
      }
      // O Preço de Venda vai com o tipo da margem que sai dele.
      r.valores[e.id] = e.preco
        ? { v: arred(n, 2), tipo: m.unidade === "rs" ? "rs" : "pct" }
        : arred(n, e.tipo === "numero" ? 4 : 2);
    });

    return temAlgo ? r : null;
  }

  // ─────────────────────────────────────────────
  //  PLATAFORMAS E PRODUTOS JÁ CADASTRADOS
  // ─────────────────────────────────────────────
  function plataformasDisponiveis() {
    var apagadas = [];
    try {
      apagadas = JSON.parse(localStorage.getItem("precifiq_deleted_platforms")) || [];
      if (!Array.isArray(apagadas)) apagadas = [];
    } catch (e) { apagadas = []; }
    var cfg = typeof PLATFORMS_CONFIG !== "undefined" ? PLATFORMS_CONFIG : [];
    return cfg.filter(function (p) { return p && p.id && apagadas.indexOf(p.id) < 0; })
      .map(function (p) {
        var logo = "";
        try { logo = typeof getPlatformLogoSrc === "function" ? getPlatformLogoSrc(p.id) : ""; } catch (e) {}
        return { id: p.id, nome: p.name || p.id, logo: logo };
      });
  }

  /** O que já existe numa plataforma: SKUs dos produtos, SKUs dos kits e nomes. */
  function indiceDaPlataforma(pid) {
    var lista = [];
    try { lista = typeof getProductsForReading === "function" ? getProductsForReading(pid) : getProducts(pid); }
    catch (e) { lista = []; }
    var idx = { skus: Object.create(null), kits: Object.create(null), nomes: Object.create(null) };
    (lista || []).forEach(function (p) {
      if (!p) return;
      var s = normSku(p.sku);
      if (s) idx.skus[s] = p.name || s;
      (Array.isArray(p.kits) ? p.kits : []).forEach(function (k) {
        var ks = normSku(k && k.sku);
        if (ks) idx.kits[ks] = p.name || ks;
      });
      var n = normTxt(p.name);
      if (n) idx.nomes[n] = true;
    });
    return idx;
  }

  /**
   * A situação de uma linha numa plataforma:
   *   novo | sku (SKU de produto já cadastrado) | kit (SKU de um kit) |
   *   nome (sem SKU, mas o mesmo nome já está cadastrado)
   */
  function situacaoNaPlataforma(r, idx) {
    if (r.sku) {
      var s = normSku(r.sku);
      if (idx.skus[s]) return "sku";
      if (idx.kits[s]) return "kit";
      return "novo";
    }
    if (r.nome && idx.nomes[normTxt(r.nome)]) return "nome";
    return "novo";
  }

  // ─────────────────────────────────────────────
  //  O PRODUTO A GRAVAR
  // ─────────────────────────────────────────────
  /**
   * A mesma forma de um produto novo salvo pela ficha (produto.js), com
   * só os campos da planilha preenchidos. O preço sai do mesmo motor.
   * catIdx (opcional): o catálogo, para os outros campos (r.valores).
   * saida (opcional): recebe { preco, margem, aviso, classico } quando
   * a margem foi calculada pelo Preço de Venda.
   */
  function montarProduto(r, pid, ehML, agora, catIdx, saida) {
    var p = {
      id: typeof generateId === "function" ? generateId() : "p_" + agora.toString(36) + Math.random().toString(36).slice(2, 10),
      platformId: pid,
      name: r.nome,
      sku: r.sku || "",
      prodId: r.ean || "",
      image: "",
      images: [],
      _imageIds: [],
      peso: r.peso || 0,
      altura: r.altura || 0,
      largura: r.largura || 0,
      comprimento: r.comprimento || 0,
      custo: r.custo || 0,
      embalagem: 0,
      etiqueta: 0,
      frete: 0,
      ipi: 0,
      difal: 0,
      st: 0,
      aliquota: 0,
      freteProduto: 0,
      taxaFixa: 0,
      impostoNF: 0,
      taxa: 0,
      margem: 0,
      margemTipo: "pct",
      finalPrice: 0,
      kits: [],
      componentes: [],
      camposPersonalizados: [],
      camposIdentificacao: [],
      secoesCustom: [],
      ordemSecoes: [],
      precoMinimo: 0,
      precoIdeal: 0,
      precoMaximo: 0,
      createdAt: agora,
      updatedAt: agora,
    };
    if (ehML) {
      p.mlTaxaPremium = 0;
      p.mlTaxaClassico = 0;
      p.precoMinimoClassico = 0;
      p.precoIdealClassico = 0;
      p.precoMaximoClassico = 0;
    }
    if (catIdx && r.valores) aplicarValores(p, r.valores, catIdx, ehML, saida);
    try {
      if (typeof calcularUnidade === "function" && typeof _inputsDoProdutoSalvo === "function") {
        var res = calcularUnidade(_inputsDoProdutoSalvo(p));
        p.finalPrice = res && isFinite(res.precoVenda) ? parseFloat(res.precoVenda.toFixed(2)) : 0;
      }
    } catch (e) {
      registrarErro("preço do produto importado", e);
      p.finalPrice = 0;
    }
    return p;
  }

  /** Os outros campos no produto. O Preço de Venda vira a margem (por último). */
  function aplicarValores(p, vals, idx, ehML, saida) {
    var preco = null, precoClassico = null, mPct = null, mRS = null;
    Object.keys(vals).forEach(function (id) {
      var e = idx[id];
      if (!e) return;
      if ((e.soML && !ehML) || (e.naoML && ehML)) return;
      var v = vals[id];
      if (typeof e.aplicar === "function") {
        try { e.aplicar(p, v); } catch (er) { registrarErro("campo " + e.rotulo, er); }
        return;
      }
      if (v == null || v === "") return;
      if (e.preco) {
        // { v, tipo }: o preço e o tipo da margem calculada ("pct" | "rs").
        var pv = typeof v === "object" ? v : { v: Number(v), tipo: "pct" };
        if (e.preco === "classico") precoClassico = pv; else preco = pv;
        return;
      }
      if (e.margem === "pct") { mPct = v; return; }
      if (e.margem === "rs") { mRS = v; return; }
      if (e.prop) p[e.prop] = v;
    });
    if (mPct != null) { p.margemTipo = "pct"; p.margem = mPct; }
    else if (mRS != null) { p.margemTipo = "rs"; p.margem = mRS; }
    var alvo = preco && preco.v > 0 ? { v: preco.v, tipo: preco.tipo, classico: false }
      : precoClassico && precoClassico.v > 0 ? { v: precoClassico.v, tipo: precoClassico.tipo, classico: true } : null;
    if (!alvo) return;
    var mg = margemDoPreco(p, alvo.v, ehML, alvo.classico, alvo.tipo);
    p.margemTipo = mg.tipo;
    p.margem = mg.margem;
    if (saida) {
      saida.preco = alvo.v; saida.margem = mg.margem; saida.tipo = mg.tipo; saida.aviso = mg.aviso;
      saida.classico = alvo.classico && ehML;
    }
  }

  /**
   * A margem que dá `preco` com o custo e as taxas do produto, com 2 casas
   * (como a ficha guarda). tipo "pct": em %, sobre o preço; "rs": o lucro
   * em reais por unidade. No Mercado Livre, com a taxa Premium (ou a
   * Clássico). Entre as margens de 2 casas vizinhas, fica a que dá o preço
   * mais perto do da planilha.
   * Sem custo nenhum, a margem em % não chega a preço nenhum (o preço do
   * Bapell é o custo dividido por 1 − taxas − margem): avisa.
   */
  function margemDoPreco(p, preco, ehML, classico, tipo) {
    var out = { margem: 0, tipo: tipo === "rs" ? "rs" : "pct", aviso: "" };
    if (typeof lucroNoPreco !== "function" || typeof _inputsDoProdutoSalvo !== "function") {
      out.aviso = "Não foi possível calcular a margem: a margem ficou 0";
      return out;
    }
    try {
      var base = _inputsDoProdutoSalvo(p);
      if (ehML) base.taxa = Number(classico ? p.mlTaxaClassico : p.mlTaxaPremium) || 0;
      base.margem = 0;
      base.margemTipo = "pct";
      var r = lucroNoPreco(base, preco, null);
      if (!r || r.inviavel) { out.aviso = "As taxas passam do limite: a margem ficou 0"; return out; }
      if (!(r.lucro > 0)) { out.aviso = "O preço " + fmtBRL(preco) + " não cobre o custo e as taxas: a margem ficou 0"; return out; }
      var m = out.tipo === "rs" ? arred(r.lucro, 2) : arred((r.lucro / preco) * 100, 2);
      if (typeof calcularUnidade === "function") {
        var melhor = m, dif = Infinity, algumPreco = false;
        [m - 0.01, m, m + 0.01].forEach(function (cand) {
          cand = arred(cand, 2);
          if (!(cand > 0) || (out.tipo === "pct" && cand >= 100)) return;
          try {
            var res = calcularUnidade(Object.assign({}, base, { margem: cand, margemTipo: out.tipo }));
            if (!res || !(res.precoVenda > 0)) return;
            algumPreco = true;
            var d = Math.abs(res.precoVenda - preco);
            if (d < dif - 1e-9) { dif = d; melhor = cand; }
          } catch (e) {}
        });
        if (!algumPreco) {
          out.aviso = out.tipo === "pct"
            ? "Sem custo no produto, nenhuma margem em % chega a esse preço: a margem ficou 0 (importe o custo ou use a margem em R$)"
            : "Não foi possível calcular a margem: a margem ficou 0";
          return out;
        }
        m = melhor;
      }
      out.margem = m;
    } catch (e) {
      registrarErro("margem pelo preço de venda", e);
      out.margem = 0;
      out.aviso = "Não foi possível calcular a margem: a margem ficou 0";
    }
    return out;
  }

  function plataformaEhML(pid) {
    try { if (typeof _plataformaEhML === "function") return !!_plataformaEhML(pid); } catch (e) {}
    return false;
  }

  // ─────────────────────────────────────────────
  //  ESTADO DA JANELA
  // ─────────────────────────────────────────────
  var st = null;
  var _uid = 0;
  function novoUid() { return "m" + ++_uid; }

  function estadoNovo(pid) {
    var ehML = plataformaEhML(pid);
    var produtos = [];
    try { produtos = (typeof getProductsForReading === "function" ? getProductsForReading(pid) : getProducts(pid)) || []; }
    catch (e) { produtos = []; }
    var catalogo = montarCatalogo(pid, ehML, produtos);
    var catIdx = Object.create(null);
    catalogo.forEach(function (c) { catIdx[c.id] = c; });
    return {
      plataforma: pid,
      ehML: ehML,
      passo: 1,
      modelo: null,      // "bling" | "ml" | "outra"
      config: null,      // a configuração salva em uso
      wb: null,
      arquivo: "",
      abas: [],
      inicio: 2,
      fim: null,
      linhaTitulos: 0,
      mapas: [],
      catalogo: catalogo,
      catIdx: catIdx,
      sugestaoConfig: null,
      mudouMapa: false,
      salvar: { marcado: false, nome: "" },
      leitura: null,
      destinos: [pid],
      desmarcados: Object.create(null),
      filtro: "todos",
      limite: PASSO_LISTA,
      gravando: false,
    };
  }

  // ─────────────────────────────────────────────
  //  ÍCONES
  // ─────────────────────────────────────────────
  function svg(corpo, tam, traco) {
    tam = tam || 16;
    return '<svg width="' + tam + '" height="' + tam + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' +
      (traco || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + corpo + "</svg>";
  }
  var I_PLANILHA = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line><line x1="12" y1="11" x2="12" y2="19"></line>';
  var I_UPLOAD = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line>';
  var I_X = '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>';
  var I_OK = '<polyline points="20 6 9 17 4 12"></polyline>';
  var I_AVISO = '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>';
  var I_INFO = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>';
  var I_SETA = '<polyline points="9 18 15 12 9 6"></polyline>';
  var I_VOLTAR = '<polyline points="15 18 9 12 15 6"></polyline>';
  var I_MAIS = '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>';
  var I_LIXO = '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>';

  // ─────────────────────────────────────────────
  //  JANELA
  // ─────────────────────────────────────────────
  var PASSOS = ["Origem", "Planilha", "Campos", "Conferência"];

  function abrir(pid) {
    if (!pid) {
      aviso("Abra a lista de uma plataforma para adicionar produtos.", "warning");
      return;
    }
    if ($("ipJanela")) return;
    st = estadoNovo(pid);
    var ov = document.createElement("div");
    ov.className = "modal-overlay ip-overlay";
    ov.id = "ipJanela";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-labelledby", "ipTitulo");
    ov.innerHTML =
      '<div class="modal ip-modal">' +
        '<div class="ip-topo">' +
          '<span class="ip-topo__ico">' + svg(I_PLANILHA, 20) + "</span>" +
          '<div class="ip-topo__txt">' +
            '<div class="modal-title ip-titulo" id="ipTitulo">Adicionar produtos pela planilha</div>' +
            '<div class="ip-sub" id="ipSub"></div>' +
          "</div>" +
          '<button type="button" class="ip-fechar" id="ipFechar" aria-label="Fechar">' + svg(I_X, 18, 2.4) + "</button>" +
        "</div>" +
        '<ol class="ip-passos" id="ipPassos" aria-label="Etapas"></ol>' +
        '<div class="ip-corpo" id="ipCorpo"></div>' +
        '<div class="ip-rodape" id="ipRodape"></div>' +
      "</div>";
    document.body.appendChild(ov);
    document.body.classList.add("ip-aberta");
    $("ipFechar").addEventListener("click", fechar);
    document.addEventListener("keydown", aoTeclar, true);
    // Arquivo solto fora da área: no Electron, sem isto, a janela abriria o
    // arquivo no lugar do app.
    document.addEventListener("dragover", bloquearSoltar, false);
    document.addEventListener("drop", bloquearSoltar, false);
    desenhar();
  }

  function bloquearSoltar(e) {
    if (!$("ipJanela")) return;
    if (e.target && e.target.closest && e.target.closest("#ipSoltar")) return;
    e.preventDefault();
  }

  function fechar() {
    var ov = $("ipJanela");
    if (!ov) return;
    if (st && st.gravando) return;
    ov.remove();
    var av = $("ipAvisoML");
    if (av) av.remove();
    document.body.classList.remove("ip-aberta");
    document.removeEventListener("keydown", aoTeclar, true);
    document.removeEventListener("dragover", bloquearSoltar, false);
    document.removeEventListener("drop", bloquearSoltar, false);
    st = null;
  }

  function aoTeclar(e) {
    if (e.key !== "Escape" || !$("ipJanela")) return;
    // Uma janela do app por cima (confirmação, senha): ela responde primeiro.
    if (document.querySelector(".bm-overlay, .bsn-camada")) return;
    if ($("ipAvisoML")) { e.preventDefault(); e.stopPropagation(); fecharAvisoML(false); return; }
    // O painel "Adicionar Campo" aberto: o Esc fecha só ele.
    var add = $("ipAdd");
    if (add && !add.hidden) { e.preventDefault(); e.stopPropagation(); fecharAdicionar(); return; }
    e.preventDefault();
    e.stopPropagation();
    fechar();
  }

  function nomePlataforma(pid) {
    var c = typeof getPlatformConfig === "function" ? getPlatformConfig(pid) : null;
    return c ? c.name || pid : pid;
  }

  function desenhar() {
    if (!st) return;
    var o = origemPorId(st.modelo);
    var arq = st.arquivo ? " · " + esc(st.arquivo) : "";
    $("ipSub").innerHTML = st.config
      ? "Configuração <strong>" + esc(st.config.nome) + "</strong>" + (o ? " (" + esc(o.nome) + ")" : "") + arq
      : st.modelo === "outra" ? "<strong>Outra planilha</strong>" + arq
      : o ? "Planilha do <strong>" + esc(o.nome) + "</strong>" + arq
      : "Cadastre vários produtos de uma vez a partir da planilha do Bling, do Mercado Livre ou de qualquer outra plataforma.";
    $("ipPassos").innerHTML = PASSOS.map(function (nome, i) {
      var n = i + 1;
      var cls = n < st.passo ? "feito" : n === st.passo ? "atual" : "";
      return '<li class="ip-passo ' + cls + '"' + (n === st.passo ? ' aria-current="step"' : "") + '>' +
        '<span class="ip-passo__n">' + (n < st.passo ? svg(I_OK, 13, 3) : n) + "</span>" +
        '<span class="ip-passo__nome">' + nome + "</span></li>";
    }).join("");
    var corpo = $("ipCorpo");
    corpo.scrollTop = 0;
    if (st.passo === 1) desenharOrigem();
    else if (st.passo === 2) desenharPlanilha();
    else if (st.passo === 3) desenharCampos();
    else desenharConferencia();
  }

  function rodape(esquerda, direita) {
    $("ipRodape").innerHTML =
      '<div class="ip-rodape__esq">' + (esquerda || "") + "</div>" +
      '<div class="ip-rodape__dir">' + (direita || "") + "</div>";
  }

  // ── 1. Origem ──
  function desenharOrigem() {
    var cartao = function (m) {
      var logo = m.id === "ml" ? logoML() : m.id === "outra" ? svg(I_PLANILHA, 22) : '<span class="ip-origem__sigla">B</span>';
      return '<button type="button" class="ip-origem" data-modelo="' + m.id + '"' + (st.modelo === m.id && !st.config ? ' aria-pressed="true"' : "") + ">" +
        '<span class="ip-origem__logo ip-origem__logo--' + m.id + '">' + logo + "</span>" +
        '<span class="ip-origem__txt">' +
          '<span class="ip-origem__nome">' + esc(m.nome) + "</span>" +
          '<span class="ip-origem__desc">' + esc(m.desc) + "</span>" +
          '<span class="ip-origem__traz">' + m.traz.map(function (t) { return '<span class="ip-chip">' + esc(t) + "</span>"; }).join("") + "</span>" +
        "</span>" +
        '<span class="ip-origem__seta">' + svg(I_SETA, 18) + "</span>" +
      "</button>";
    };
    var cfgs = lerConfigs();
    var salvas = cfgs.length
      ? '<div class="ip-bloco ip-salvas"><div class="ip-bloco__tit">Configurações salvas</div><ul class="ip-salvas__lista">' +
        cfgs.map(function (c) {
          var o = origemPorId(c.base);
          var data = c.atualizadoEm ? new Date(c.atualizadoEm).toLocaleDateString("pt-BR") : "";
          return '<li class="ip-salva"><button type="button" class="ip-salva__usar" data-config="' + esc(c.id) + '">' +
            '<span class="ip-salva__nome">' + esc(c.nome) + "</span>" +
            '<span class="ip-salva__meta">' + esc(o ? o.nome : "Outra planilha") + " · " + plural((c.mapas || []).length, "campo", "campos") + (data ? " · salva em " + data : "") + "</span>" +
            '<span class="ip-salva__seta">' + svg(I_SETA, 16) + "</span></button>" +
            '<button type="button" class="ip-icone-btn" data-apagar-config="' + esc(c.id) + '" aria-label="Excluir a configuração ' + esc(c.nome) + '" title="Excluir">' + svg(I_LIXO, 15) + "</button></li>";
        }).join("") + "</ul></div>"
      : "";
    $("ipCorpo").innerHTML =
      '<p class="ip-intro">De onde vem a planilha? O Bling e o Mercado Livre já têm as colunas configuradas; qualquer outra planilha é lida pelos títulos das colunas. ' +
      "Você confere tudo antes de cadastrar.</p>" +
      '<div class="ip-origens ip-origens--tres">' + cartao(MODELOS.bling) + cartao(MODELOS.ml) + cartao(ORIGEM_OUTRA) + "</div>" +
      salvas +
      '<p class="ip-nota">' + svg(I_INFO, 14) + "<span>Os modelos trazem o nome, o SKU, o EAN/GTIN, o preço de custo, o peso e as medidas. " +
      "Na etapa Campos, <strong>Adicionar Campo</strong> inclui qualquer outro campo do Bapell — custos, taxas, margem, preço de venda, campos personalizados —, " +
      "com a célula inicial e a final. O que não vier da planilha fica como num produto novo.</span></p>";
    rodape('<button type="button" class="btn-secondary" data-ip="cancelar">Cancelar</button>', "");
    ligarRodape();
    $("ipCorpo").querySelectorAll("[data-modelo]").forEach(function (b) {
      b.addEventListener("click", function () { escolherModelo(b.getAttribute("data-modelo"), null); });
    });
    $("ipCorpo").querySelectorAll("[data-config]").forEach(function (b) {
      b.addEventListener("click", function () {
        var cfg = lerConfigs().filter(function (c) { return c.id === b.getAttribute("data-config"); })[0];
        if (cfg) escolherModelo(origemPorId(cfg.base) ? cfg.base : "outra", cfg);
      });
    });
    $("ipCorpo").querySelectorAll("[data-apagar-config]").forEach(function (b) {
      b.addEventListener("click", function () { apagarConfig(b.getAttribute("data-apagar-config")); });
    });
    setTimeout(function () { var b = $("ipCorpo") && $("ipCorpo").querySelector("[data-modelo]"); if (b) try { b.focus(); } catch (e) {} }, 40);
  }

  function logoML() {
    // A logo da plataforma Mercado Livre cadastrada, se houver.
    var cfg = typeof PLATFORMS_CONFIG !== "undefined" ? PLATFORMS_CONFIG : [];
    for (var i = 0; i < cfg.length; i++) {
      var p = cfg[i];
      if (p && typeof ehMercadoLivre === "function" && ehMercadoLivre(p.id, p.name)) {
        var src = "";
        try { src = getPlatformLogoSrc(p.id); } catch (e) {}
        if (src) return '<img src="' + esc(src) + '" alt="" onerror="this.parentNode.innerHTML=\'<span class=&quot;ip-origem__sigla&quot;>ML</span>\'" />';
      }
    }
    return '<span class="ip-origem__sigla">ML</span>';
  }

  function apagarConfig(id) {
    var cfg = lerConfigs().filter(function (c) { return c.id === id; })[0];
    if (!cfg) return;
    var feito = function (ok) {
      if (!ok || !st) return;
      gravarConfigs(lerConfigs().filter(function (c) { return c.id !== id; }));
      if (st.config && st.config.id === id) st.config = null;
      if (st.sugestaoConfig && st.sugestaoConfig.id === id) st.sugestaoConfig = null;
      aviso("Configuração " + cfg.nome + " excluída.", "success");
      desenhar();
    };
    if (window.BapellModal && typeof window.BapellModal.confirmar === "function") {
      window.BapellModal.confirmar({
        titulo: "Excluir a configuração?",
        texto: "A configuração " + cfg.nome + " deixa de aparecer aqui. Os produtos já cadastrados não mudam.",
        botao: "Excluir", perigo: true,
      }).then(feito);
    } else feito(true);
  }

  function escolherModelo(id, cfg) {
    if (!origemPorId(id)) return;
    var seguir = function () {
      var trocou = st.modelo !== id || st.config !== (cfg || null);
      st.modelo = id;
      st.config = cfg || null;
      if (trocou) {
        st.salvar = { marcado: false, nome: cfg ? cfg.nome : "" };
        // A planilha já lida continua: só os campos são refeitos.
        if (st.wb) {
          mapearDoZero();
          st.sugestaoConfig = st.config ? null : configParecida();
        }
      }
      st.passo = 2;
      desenhar();
    };
    if (id === "ml") abrirAvisoML(seguir);
    else seguir();
  }

  // ── Aviso do Mercado Livre (antes de seguir) ──
  var _aoConfirmarML = null;
  function abrirAvisoML(depois) {
    _aoConfirmarML = depois;
    var ov = document.createElement("div");
    ov.className = "modal-overlay ip-aviso-ml";
    ov.id = "ipAvisoML";
    ov.setAttribute("role", "alertdialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-labelledby", "ipAvisoMLTit");
    ov.innerHTML =
      '<div class="modal ip-aviso-ml__modal">' +
        '<div class="ip-aviso-ml__topo">' +
          '<span class="ip-aviso-ml__ico">' + svg(I_AVISO, 22) + "</span>" +
          '<div class="modal-title" id="ipAvisoMLTit">Antes de baixar a planilha no Mercado Livre</div>' +
        "</div>" +
        '<div class="ip-aviso-ml__texto">' +
          "<p>Na hora de baixar a planilha de anúncios no Mercado Livre, <strong>marque a opção SKU</strong>.</p>" +
          "<p>Sem ela, a planilha vem sem o SKU dos anúncios — e é o SKU que relaciona cada produto ao Bapell " +
          "(é por ele que o sistema sabe o que já está cadastrado, e é ele que as Ações em Massa, o Processador de " +
          "Planilhas e as outras telas usam para achar o produto).</p>" +
          "<p>Se a sua planilha foi baixada sem o SKU, baixe de novo com a opção marcada.</p>" +
        "</div>" +
        '<label class="ip-aviso-ml__check"><input type="checkbox" id="ipAvisoMLCheck" /> ' +
          "<span>Entendi: a planilha foi baixada com a opção <strong>SKU</strong> marcada.</span></label>" +
        '<div class="modal-actions">' +
          '<button type="button" class="btn-secondary" id="ipAvisoMLVoltar">Voltar</button>' +
          '<button type="button" class="btn-primary" id="ipAvisoMLSeguir" disabled>Continuar</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(ov);
    var check = $("ipAvisoMLCheck");
    var seguir = $("ipAvisoMLSeguir");
    check.addEventListener("change", function () { seguir.disabled = !check.checked; });
    seguir.addEventListener("click", function () { if (check.checked) fecharAvisoML(true); });
    $("ipAvisoMLVoltar").addEventListener("click", function () { fecharAvisoML(false); });
    setTimeout(function () { try { check.focus(); } catch (e) {} }, 40);
  }
  function fecharAvisoML(confirmado) {
    var ov = $("ipAvisoML");
    if (ov) ov.remove();
    var fn = _aoConfirmarML;
    _aoConfirmarML = null;
    if (confirmado && fn) fn();
  }

  // ── 2. Planilha ──
  function desenharPlanilha() {
    var intro;
    if (st.config) {
      intro = "Escolha a planilha para a configuração <strong>" + esc(st.config.nome) + "</strong>. As células vêm dela e são conferidas pelos títulos.";
    } else if (st.modelo === "outra") {
      intro = "Escolha a planilha de produtos ou de anúncios — de qualquer plataforma ou sistema (Amazon, Shopee, Magalu, uma planilha sua…). " +
        "Na próxima etapa o Bapell procura os títulos das colunas e você confere.";
    } else {
      var m = MODELOS[st.modelo];
      intro = "Escolha a planilha do <strong>" + esc(m.nome) + "</strong>. " + esc(m.desc);
    }
    $("ipCorpo").innerHTML =
      '<p class="ip-intro">' + intro + "</p>" +
      '<label class="ip-soltar" id="ipSoltar" tabindex="0">' +
        '<input type="file" id="ipArquivo" accept=".xlsx,.xls,.csv,.txt" />' +
        '<span class="ip-soltar__ico">' + svg(I_UPLOAD, 28, 1.8) + "</span>" +
        '<span class="ip-soltar__titulo">Arraste a planilha para cá ou clique para escolher</span>' +
        '<span class="ip-soltar__sub">Arquivos .xlsx, .xls ou .csv</span>' +
      "</label>" +
      '<div class="ip-erro" id="ipErroArquivo" hidden></div>';
    rodape('<button type="button" class="btn-secondary" data-ip="voltar">' + svg(I_VOLTAR, 15) + " Voltar</button>",
      st.wb ? '<span class="ip-rodape__info">Planilha atual: <strong>' + esc(st.arquivo) + "</strong></span>" +
        '<button type="button" class="btn-primary" data-ip="seguir">Continuar com ela ' + svg(I_SETA, 15) + "</button>" : "");
    ligarRodape();
    var zona = $("ipSoltar");
    var input = $("ipArquivo");
    input.addEventListener("change", function () { if (input.files && input.files[0]) carregarArquivo(input.files[0]); });
    zona.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
    });
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
    var box = $("ipErroArquivo");
    if (!box) { aviso(msg, "error", 6000); return; }
    box.hidden = false;
    box.innerHTML = svg(I_AVISO, 16) + "<span>" + esc(msg) + "</span>";
  }

  function carregarArquivo(file) {
    if (!st) return;
    if (!/\.(xlsx|xls|csv|txt)$/i.test(file.name || "")) {
      erroArquivo("Esse arquivo não é uma planilha. Escolha um arquivo .xlsx, .xls ou .csv.");
      return;
    }
    var zona = $("ipSoltar");
    if (zona) {
      zona.classList.add("lendo");
      zona.querySelector(".ip-soltar__titulo").textContent = "Lendo " + file.name + "…";
    }
    lerArquivo(file).then(function (wb) {
      if (!st) return;
      if (!wb || !wb.SheetNames || !wb.SheetNames.length) throw new Error("planilha sem abas");
      st.wb = wb;
      st.arquivo = file.name;
      mapearDoZero();
      st.sugestaoConfig = st.config ? null : configParecida();
      st.desmarcados = Object.create(null);
      st.passo = 3;
      desenhar();
    }).catch(function (err) {
      registrarErro("ler a planilha", err);
      if (zona) {
        zona.classList.remove("lendo");
        zona.querySelector(".ip-soltar__titulo").textContent = "Arraste a planilha para cá ou clique para escolher";
      }
      erroArquivo("Não foi possível abrir a planilha. Confira se o arquivo não está corrompido ou protegido por senha.");
    });
  }

  // ─────────────────────────────────────────────
  //  OS CAMPOS DE PARTIDA (mapas)
  // ─────────────────────────────────────────────
  // Um mapa: { uid, campo, ini ("C2" ou ""), fim ("C500" ou ""), unidade,
  // usar, nota{ tipo, … } }. Os 8 campos de CAMPOS estão sempre na lista,
  // nesta ordem; os outros vêm depois (os reconhecidos e os adicionados).
  function novoMapa(campo, ini, extra) {
    return Object.assign({ uid: novoUid(), campo: campo, ini: ini || "", fim: "", unidade: "", usar: !!ini, nota: { tipo: "manual" } }, extra || {});
  }
  function mapasDoNucleo(nota) {
    return CAMPOS.map(function (c) {
      return novoMapa(c.id, "", { unidade: unidadePadrao(st.catIdx[c.id]), usar: false, nota: Object.assign({}, nota) });
    });
  }
  function primeiraAba() {
    return st.wb && st.abas.length ? st.wb.Sheets[st.abas[0]] : null;
  }

  /** Bling / Mercado Livre: as colunas do modelo, conferidas pelo título. */
  function mapearModelo() {
    var m = MODELOS[st.modelo];
    st.abas = abasSugeridas(st.wb, m);
    st.inicio = m.inicio;
    st.fim = null;
    var sheet = primeiraAba();
    var base = mapeamentoInicial(sheet, m);
    var mapas = CAMPOS.map(function (campo) {
      var col = base.colunas[campo.id];
      var entry = st.catIdx[campo.id];
      var unid = campo.id === "peso" ? m.pesoUnidade : unidadePadrao(entry);
      return novoMapa(campo.id, col ? col + st.inicio : "", { unidade: unid, usar: !!col, nota: base.situacao[campo.id] || { tipo: "manual" } });
    });
    // Os outros campos que a planilha tem: sugeridos, desmarcados.
    var rec = sheet ? reconhecerTitulos(sheet, st.catalogo, st.inicio - 1) : { linha: 0, achados: [] };
    st.linhaTitulos = rec.linha || 0;
    acrescentarSugestoes(rec, mapas, true);
    st.mapas = mapas;
  }

  /** Outra planilha: a linha de títulos e os campos, pelos títulos. */
  function mapearOutra() {
    var sheet = primeiraAba();
    var rec = sheet ? reconhecerTitulos(sheet, st.catalogo, 25) : { linha: 0, achados: [] };
    st.linhaTitulos = rec.linha || 0;
    st.inicio = rec.linha ? rec.linha + 1 : Math.max(2, (rec.linhaFraca || 1) + 1);
    st.fim = null;
    var mapas = mapasDoNucleo({ tipo: "ausente", outra: true });
    // Sem uma linha de títulos clara (menos de 2 reconhecidos com certeza),
    // o que achou entra só como sugestão, desmarcado.
    acrescentarSugestoes(rec, mapas, !rec.linha);
    st.mapas = mapas;
  }

  /**
   * Os campos reconhecidos que ainda não têm célula. Os do núcleo vão na
   * linha deles; os outros entram depois. Na dúvida, desmarcados. O Preço
   * de Venda entra SEMPRE desmarcado (quem decide é a pessoa).
   */
  function acrescentarSugestoes(rec, mapas, todasDesmarcadas) {
    var colUsada = Object.create(null), comCelula = Object.create(null);
    mapas.forEach(function (m) {
      var a = lerRef(m.ini, st.inicio);
      if (a) { colUsada[a.ci] = true; comCelula[m.campo] = true; }
    });
    var novos = [];
    (rec.achados || []).forEach(function (a) {
      var e = a.campo;
      if (colUsada[a.ci] || comCelula[e.id]) return;
      var forte = a.nota >= FORTE;
      var unid = precisaUnidade(e) ? unidadeDoTitulo(a.titulo, e.tipo) : "";
      var usar = forte && !todasDesmarcadas && !e.preco && (!precisaUnidade(e) || !!unid);
      var nota = e.preco ? { tipo: "preco", titulo: a.titulo }
        : usar ? { tipo: "titulo", titulo: a.titulo }
        : { tipo: precisaUnidade(e) && !unid && forte && !todasDesmarcadas ? "unidade" : "sugestao", titulo: a.titulo };
      var dados = { ini: colunaDoIndice(a.ci) + st.inicio, fim: "", unidade: unid || unidadePadrao(e), usar: usar, nota: nota };
      var existente = mapas.filter(function (m) { return m.campo === e.id; })[0];
      if (existente) Object.assign(existente, dados);
      else novos.push({ ci: a.ci, m: novoMapa(e.id, dados.ini, dados) });
      colUsada[a.ci] = true;
      comCelula[e.id] = true;
    });
    novos.sort(function (x, y) { return x.ci - y.ci; }).forEach(function (n) { mapas.push(n.m); });
  }

  /** Uma configuração salva: as células dela, conferidas pelos títulos. */
  function mapearConfig(cfg) {
    st.inicio = cfg.inicio >= 1 ? cfg.inicio : 2;
    st.fim = cfg.fim >= 1 ? cfg.fim : null;
    st.linhaTitulos = 0;
    var sheet = primeiraAba();
    var mapas = mapasDoNucleo({ tipo: "manual" });
    if (MODELOS[cfg.base]) {
      var pu = mapas.filter(function (m) { return m.campo === "peso"; })[0];
      if (pu) pu.unidade = MODELOS[cfg.base].pesoUnidade;
    }
    (cfg.mapas || []).forEach(function (sm) {
      if (!sm || !sm.campo) return;
      var entry = st.catIdx[sm.campo];
      if (!entry && /^cid:/.test(sm.campo) && sm.rotulo) entry = registrarCampoTexto(sm.rotulo, false);
      var a = lerRef(sm.ini, st.inicio);
      var dados;
      if (!entry || !a) {
        dados = { ini: a ? a.ref : "", fim: "", unidade: sm.unidade || "", usar: false, nota: { tipo: "semcampo", rotulo: sm.rotulo || sm.campo } };
      } else {
        var agora = tituloDoMapa(sheet, { campo: sm.campo, ini: a.ref });
        var igual = normTitulo(agora) === normTitulo(sm.titulo || "");
        var b = sm.fim ? lerRef(sm.fim) : null;
        dados = {
          ini: a.ref, fim: b && b.ci === a.ci && b.linha >= a.linha ? b.ref : "",
          unidade: temSeletor(entry) ? (sm.unidade || unidadePadrao(entry)) : "",
          usar: igual && sm.usar !== false,
          nota: igual ? { tipo: "salva" } : { tipo: "mudou", antes: sm.titulo || "", titulo: agora },
        };
      }
      var ex = mapas.filter(function (m) { return m.campo === sm.campo; })[0];
      if (ex) Object.assign(ex, dados);
      else mapas.push(novoMapa(sm.campo, dados.ini, dados));
    });
    st.mapas = mapas;
  }

  /** As abas de "Outra planilha": a que tem mais títulos reconhecidos e as iguais a ela. */
  function abasDaOutra(wb) {
    var nomes = wb.SheetNames || [];
    if (!nomes.length) return [];
    var recs = {};
    var melhor = nomes[0];
    nomes.forEach(function (n) {
      recs[n] = reconhecerTitulos(wb.Sheets[n], st.catalogo, 25);
      if (recs[n].fortes > recs[melhor].fortes) melhor = n;
    });
    if (!recs[melhor].fortes) {
      for (var i = 0; i < nomes.length; i++) if (abaTemDados(wb.Sheets[nomes[i]], 2)) return [nomes[i]];
      return [nomes[0]];
    }
    if (!recs[melhor].linha) return [melhor];
    // Abas com a mesma linha de títulos e os mesmos campos nas mesmas
    // colunas (como as categorias da planilha do Mercado Livre).
    var assinatura = function (r) {
      return r.linha + "|" + r.achados.filter(function (a) { return a.nota >= FORTE; })
        .map(function (a) { return a.campo.id + "@" + a.ci; }).sort().join(",");
    };
    var alvo = assinatura(recs[melhor]);
    return nomes.filter(function (n) { return recs[n].linha && assinatura(recs[n]) === alvo; });
  }

  function abasDaConfig(cfg) {
    var nomes = st.wb.SheetNames || [];
    // O Mercado Livre muda os nomes das abas (uma por categoria) a cada
    // planilha baixada: valem as abas no formato da planilha de anúncios.
    if (cfg.base === "ml") return abasSugeridas(st.wb, MODELOS.ml);
    var abas = (cfg.abas || []).filter(function (n) { return nomes.indexOf(n) >= 0; });
    if (abas.length) return nomes.filter(function (n) { return abas.indexOf(n) >= 0; });
    if (MODELOS[cfg.base]) return abasSugeridas(st.wb, MODELOS[cfg.base]);
    return abasDaOutra(st.wb);
  }

  function mapearDoZero() {
    st.mudouMapa = false;
    st.leitura = null;
    if (st.config) {
      st.abas = abasDaConfig(st.config);
      mapearConfig(st.config);
    } else if (st.modelo === "outra") {
      st.abas = abasDaOutra(st.wb);
      mapearOutra();
    } else {
      mapearModelo();
    }
  }

  /** Configuração salva com os mesmos títulos desta planilha (para sugerir). */
  function configParecida() {
    if (!st || !st.wb) return null;
    var melhor = null;
    lerConfigs().forEach(function (cfg) {
      var nomeAba = (cfg.abas || []).filter(function (n) { return st.wb.Sheets[n]; })[0];
      var sheet = nomeAba ? st.wb.Sheets[nomeAba] : primeiraAba();
      if (!sheet) return;
      var comTitulo = (cfg.mapas || []).filter(function (m) { return m && m.titulo && m.ini; });
      if (comTitulo.length < 2) return;
      var iguais = comTitulo.filter(function (m) {
        return normTitulo(tituloDoMapa(sheet, { campo: m.campo, ini: m.ini })) === normTitulo(m.titulo);
      }).length;
      var taxa = iguais / comTitulo.length;
      if (taxa >= 0.6 && (!melhor || taxa > melhor.taxa)) melhor = { cfg: cfg, taxa: taxa };
    });
    return melhor ? melhor.cfg : null;
  }

  /** O "Novo campo de texto" do Adicionar Campo (ou o de uma configuração salva). */
  function registrarCampoTexto(nome, novo) {
    var e = campoTexto(nome, novo);
    if (st.catIdx[e.id]) return st.catIdx[e.id];
    st.catalogo.push(e);
    st.catIdx[e.id] = e;
    return e;
  }

  // ─────────────────────────────────────────────
  //  3. CAMPOS
  // ─────────────────────────────────────────────
  function rotuloDoMapa(m) {
    var e = st.catIdx[m.campo];
    if (e) return e.rotulo;
    return (m.nota && m.nota.rotulo) || m.campo;
  }

  /** O título da coluna de um mapa (o que casa com o campo, se houver). */
  function tituloDoMapa(sheet, m) {
    var a = lerRef(m.ini, st ? st.inicio : 2);
    if (!a || !sheet) return "";
    var lista = titulosDaColuna(sheet, a.col, a.linha);
    if (!lista.length) return "";
    var nucleo = campoPorId(m.campo);
    var e = st ? st.catIdx[m.campo] : null;
    for (var i = 0; i < lista.length; i++) {
      if ((nucleo && casaComCampo(lista[i], nucleo) > 0) || (e && notaTitulo(lista[i], e) > 0)) return lista[i].slice(0, 80);
    }
    // Sem um que case: o mais curto entre os mais próximos (o título, não a instrução).
    var curtos = lista.filter(function (t) { return t.length <= 60; });
    return (curtos[0] || lista[0]).slice(0, 80);
  }

  function fmtValor(e, v) {
    if (v == null || v === "") return "";
    if (e.tipo === "texto" || e.tipo === "codigo") return String(v);
    if (e.tipo === "dinheiro") return fmtBRL(v);
    if (e.tipo === "pct") return fmtNum(v, 2) + "%";
    return fmtNum(v, 4);
  }

  /** O 1º valor preenchido da coluna do campo (para conferir), já convertido. */
  function exemploDoMapa(m) {
    var e = st.catIdx[m.campo];
    var a = lerRef(m.ini, st.inicio);
    if (!e || !a) return "";
    var sheet = primeiraAba();
    if (!sheet) return "";
    var lim = limitesDaAba(sheet);
    var fim = Math.min(lim.ultimaLinha, a.linha + 60);
    var b = m.fim ? lerRef(m.fim) : null;
    if (b && b.ci === a.ci && b.linha < fim) fim = b.linha;
    for (var L = a.linha; L <= fim; L++) {
      var cel = celula(sheet, a.col, L);
      var txt = textoDe(cel).trim();
      if (!txt) continue;
      if (e.id === "nome") return txt.replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
      if (e.id === "sku") return txt;
      if (e.id === "ean") return eanDe(cel);
      if (e.tipo === "texto" || e.tipo === "codigo") return txt.replace(/\s+/g, " ").slice(0, 80);
      var n = e.tipo === "pct" ? pctDe(cel) : numeroDeCampo(cel);
      if (n === null) continue;
      if (isNaN(n)) return txt.slice(0, 40) + " (não é número)";
      if (e.tipo === "peso") return m.unidade === "kg" ? fmtNum(n, 3) + " kg → " + fmtNum(n * 1000, 2) + " g" : fmtNum(n, 2) + " g";
      if (e.tipo === "medida") {
        if (m.unidade === "mm") return fmtNum(n, 2) + " mm → " + fmtNum(n / 10, 2) + " cm";
        if (m.unidade === "m") return fmtNum(n, 3) + " m → " + fmtNum(n * 100, 2) + " cm";
        return fmtNum(n, 2) + " cm";
      }
      return fmtValor(e, n);
    }
    return "";
  }

  function situacaoHtml(m) {
    var n = m.nota || {};
    var e = st.catIdx[m.campo];
    var o = origemPorId(st.modelo);
    if (n.tipo === "semcampo") return '<span class="ip-sit ip-sit--aviso">' + svg(I_AVISO, 12) + "Campo que esta plataforma não tem</span>";
    if (n.tipo === "mudou") return '<span class="ip-sit ip-sit--aviso" title="Antes: ' + esc(n.antes || "sem título") + '">' + svg(I_AVISO, 12) + "O título mudou — confira e marque</span>";
    if (e && e.preco) {
      return m.usar
        ? '<span class="ip-sit ip-sit--info">Calcula a margem ' + (m.unidade === "rs" ? "em R$" : "em %") + " por este preço</span>"
        : '<span class="ip-sit ip-sit--muda">Marque para usar: o Bapell calcula a margem que dá este preço</span>';
    }
    switch (n.tipo) {
      case "ok": return '<span class="ip-sit ip-sit--ok">' + svg(I_OK, 12, 3) + "Confere com o título</span>";
      case "sem-titulo": return '<span class="ip-sit">Posição do modelo</span>';
      case "titulo": return '<span class="ip-sit ip-sit--info">Achado pelo título</span>';
      case "ajustado": return '<span class="ip-sit ip-sit--aviso" title="No modelo, a coluna ' + esc(n.de) + '">' + svg(I_AVISO, 12) +
        "Ajustado: no modelo era a " + esc(n.de) + "</span>";
      case "confira": return '<span class="ip-sit ip-sit--aviso">' + svg(I_AVISO, 12) + "Título diferente — confira</span>";
      case "sugestao": return '<span class="ip-sit ip-sit--info">Sugestão — marque para usar</span>';
      case "unidade": return '<span class="ip-sit ip-sit--aviso">' + svg(I_AVISO, 12) + "Confira a unidade e marque</span>";
      case "salva": return '<span class="ip-sit ip-sit--ok">' + svg(I_OK, 12, 3) + "Da configuração salva</span>";
      case "confirmado": return '<span class="ip-sit ip-sit--ok">' + svg(I_OK, 12, 3) + "Confirmado por você</span>";
      case "novo": return '<span class="ip-sit ip-sit--info">Campo novo: criado em cada produto</span>';
      case "manual": return m.ini ? '<span class="ip-sit ip-sit--info">Escolhida por você</span>' : '<span class="ip-sit">Não importar</span>';
      case "ausente":
        if (m.ini) return '<span class="ip-sit ip-sit--info">Escolhida por você</span>';
        if (n.outra || n.buscado) return '<span class="ip-sit ip-sit--muda">Não achei pelo título</span>';
        return '<span class="ip-sit ip-sit--muda">' + (MODELOS[st.modelo] && MODELOS[st.modelo].colunas[m.campo] ? "" : "Fora do modelo do " + esc(o ? o.nome : "")) + "</span>";
      default: return "";
    }
  }

  function opcoesUnidade(e, atual) {
    var ops = e.preco
      ? [["pct", "calcular a margem em %"], ["rs", "calcular a margem em R$"]]
      : e.tipo === "peso"
      ? [["kg", "em kg (converte para g)"], ["g", "em gramas"]]
      : [["cm", "em cm"], ["mm", "em mm (converte para cm)"], ["m", "em metros (converte para cm)"]];
    return ops.map(function (o) { return '<option value="' + o[0] + '"' + (atual === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("");
  }

  function linhaMapaHtml(m) {
    var e = st.catIdx[m.campo];
    var sheet = primeiraAba();
    var rot = rotuloDoMapa(m);
    var titulo = e && m.ini ? tituloDoMapa(sheet, m) : "";
    var exemplo = e ? exemploDoMapa(m) : "";
    var ehNome = m.campo === "nome";
    var unidade = e && temSeletor(e)
      ? '<select class="input-field ip-unidade ip-unidade-campo"' + (e.id === "peso" ? ' id="ipPesoUnidade"' : "") + ' data-unidade="' + m.uid +
        '" aria-label="' + (e.preco ? "Tipo da margem calculada pelo " + esc(rot) : "Unidade de " + esc(rot) + " na planilha") + '">' +
        opcoesUnidade(e, m.unidade || unidadePadrao(e)) + "</select>"
      : "";
    var destino = e ? e.destino + (e.oculto ? " (oculto nesta plataforma)" : "") : "Campo que esta plataforma não tem";
    return '<tr data-uid="' + m.uid + '" data-campo="' + esc(m.campo) + '" class="' + (m.usar || ehNome ? "" : "ip-desligado") + '">' +
      '<td class="ip-usar"><input type="checkbox" data-usar="' + m.uid + '"' + (m.usar || ehNome ? " checked" : "") +
        (ehNome || !e ? " disabled" : "") + ' aria-label="Usar ' + esc(rot) + '" /></td>' +
      '<td class="ip-campo"><strong>' + esc(rot) + '</strong><span class="ip-campo__destino">' + esc(destino) + "</span>" + unidade + "</td>" +
      '<td class="ip-cel-td"><input type="text" class="input-field ip-cel" data-ini="' + m.uid + '" data-col="' + esc(m.campo) + '" value="' + esc(m.ini) +
        '" maxlength="10" autocomplete="off" spellcheck="false" placeholder="—" aria-label="Célula inicial de ' + esc(rot) + '" /></td>' +
      '<td class="ip-cel-td"><input type="text" class="input-field ip-cel" data-fim="' + m.uid + '" value="' + esc(m.fim || "") +
        '" maxlength="10" autocomplete="off" spellcheck="false" placeholder="opcional" aria-label="Célula final de ' + esc(rot) + '" /></td>' +
      '<td class="ip-titulo-col">' + (titulo ? esc(titulo) : '<span class="ip-muda">' + (m.ini ? "sem título" : "—") + "</span>") + "</td>" +
      '<td class="ip-exemplo">' + (exemplo ? esc(exemplo) : '<span class="ip-muda">' + (m.ini ? "vazia" : "—") + "</span>") + "</td>" +
      '<td class="ip-sit-col">' + situacaoHtml(m) + "</td>" +
      '<td class="ip-acao">' + (campoPorId(m.campo) ? "" : '<button type="button" class="ip-icone-btn" data-remover="' + m.uid +
        '" aria-label="Remover ' + esc(rot) + '" title="Remover">' + svg(I_X, 14, 2.4) + "</button>") + "</td>" +
    "</tr>";
  }

  var DICA_ADD = "Escolha o campo do Bapell e informe onde ele começa e onde termina na planilha. Ex.: o Preço de Custo na coluna F, " +
    "da linha 2 à 500 — célula inicial F2 e final F500. A final é opcional: em branco, vai até o último produto.";

  function desenharCampos() {
    var nomes = st.wb.SheetNames || [];
    var ultima = 0;
    st.abas.forEach(function (n) { ultima = Math.max(ultima, limitesDaAba(st.wb.Sheets[n]).ultimaLinha); });
    var abasHtml = nomes.length > 1
      ? '<div class="ip-bloco"><div class="ip-bloco__tit">Abas lidas</div><div class="ip-abas">' +
          nomes.map(function (n) {
            var marc = st.abas.indexOf(n) >= 0;
            var lin = limitesDaAba(st.wb.Sheets[n]).ultimaLinha;
            return '<label class="ip-aba' + (marc ? " marcada" : "") + '"><input type="checkbox" data-aba="' + esc(n) + '"' + (marc ? " checked" : "") +
              " /> <span>" + esc(n) + '</span><small>até a linha ' + fmtNum(lin, 0) + "</small></label>";
          }).join("") +
        "</div>" +
        (st.modelo === "ml" ? '<div class="ip-dica">O Mercado Livre separa os anúncios em uma aba por categoria: ficam marcadas as abas no formato da planilha de anúncios.</div>' : "") +
        "</div>"
      : "";
    var origemTxt = st.config
      ? "As células vêm da configuração salva <strong>" + esc(st.config.nome) + "</strong> e foram conferidas pelos títulos da planilha."
      : st.modelo === "outra"
        ? "O Bapell procurou os títulos das colunas: o que reconheceu com certeza já está marcado; o resto fica desmarcado, para você conferir."
        : "As células abaixo vêm do modelo do <strong>" + esc(MODELOS[st.modelo].nome) + "</strong> e foram conferidas pelos títulos da planilha.";
    var sugestao = st.sugestaoConfig
      ? '<div class="ip-banner">' + svg(I_INFO, 16) + '<span>Esta planilha tem os mesmos títulos da configuração salva <strong>' + esc(st.sugestaoConfig.nome) + "</strong>.</span>" +
        '<button type="button" class="btn-secondary" id="ipUsarSugestao">Usar a configuração ' + esc(st.sugestaoConfig.nome) + "</button></div>"
      : "";
    var semTitulos = st.modelo === "outra" && !st.config && !st.linhaTitulos
      ? '<div class="ip-banner ip-banner--aviso">' + svg(I_AVISO, 16) + "<span>Não reconheci os títulos desta planilha. Informe a célula de cada campo " +
        "(ex.: C2, ou só a letra da coluna) ou use <strong>Adicionar Campo</strong>.</span></div>"
      : "";
    $("ipCorpo").innerHTML =
      '<p class="ip-intro">' + origemTxt + " Para mudar, digite a célula (ex.: C2) ou só a letra da coluna; para não importar um campo, desmarque. " +
      "Em <strong>Adicionar Campo</strong> você inclui qualquer outro campo do Bapell, com a célula inicial e a final.</p>" +
      sugestao + semTitulos +
      abasHtml +
      '<div class="ip-bloco ip-linhas">' +
        '<label for="ipInicio">Os produtos começam na linha</label>' +
        '<input type="number" class="input-field" id="ipInicio" min="1" step="1" value="' + st.inicio + '" />' +
        '<label for="ipFim">e vão até a linha</label>' +
        '<input type="number" class="input-field" id="ipFim" min="1" step="1" value="' + (st.fim || "") + '" placeholder="' + (ultima || "fim") + '" />' +
        '<span class="ip-dica">Em branco: até o fim da planilha' + (ultima ? " (linha " + fmtNum(ultima, 0) + ")" : "") + ". " +
          (st.linhaTitulos ? "Títulos encontrados na linha " + st.linhaTitulos + ". " : "") +
          "Mudar a linha inicial muda a célula inicial de todos os campos.</span>" +
      "</div>" +
      '<div class="ip-barra">' +
        '<span class="ip-barra__conta" id="ipConta"></span>' +
        '<button type="button" class="btn-secondary ip-btn-add" id="ipAddAbrir">' + svg(I_MAIS, 15, 2.4) + " Adicionar Campo</button>" +
      "</div>" +
      '<div class="ip-add" id="ipAdd" hidden>' +
        '<div class="ip-add__linha">' +
          '<label class="ip-add__campo"><span>Campo do Bapell</span><select class="input-field" id="ipAddCampo"></select></label>' +
          '<label class="ip-add__nome" id="ipAddNomeWrap" hidden><span>Nome do campo novo</span><input type="text" class="input-field" id="ipAddNome" maxlength="40" placeholder="Ex.: Marca, ASIN, NCM" autocomplete="off" /></label>' +
          '<label><span>Célula inicial</span><input type="text" class="input-field ip-cel" id="ipAddIni" maxlength="10" placeholder="Ex.: F' + st.inicio + '" autocomplete="off" spellcheck="false" /></label>' +
          '<label><span>Célula final <small>(opcional)</small></span><input type="text" class="input-field ip-cel" id="ipAddFim" maxlength="10" placeholder="Ex.: F500" autocomplete="off" spellcheck="false" /></label>' +
          '<label id="ipAddUnidWrap" hidden><span id="ipAddUnidRot">Na planilha</span><select class="input-field" id="ipAddUnid"></select></label>' +
          '<div class="ip-add__botoes"><button type="button" class="btn-primary" id="ipAddOk">Adicionar</button>' +
            '<button type="button" class="btn-secondary" id="ipAddCancelar">Cancelar</button></div>' +
        "</div>" +
        '<div class="ip-dica" id="ipAddDica"></div>' +
        '<div class="ip-erro" id="ipAddErro" hidden></div>' +
      "</div>" +
      '<div class="ip-tabela-wrap"><table class="ip-tabela ip-tabela--mapas">' +
        '<thead><tr><th class="ip-usar">Usar</th><th>Campo do Bapell</th><th>Célula inicial</th><th>Célula final</th>' +
          "<th>Título na planilha</th><th>Exemplo (1º produto)</th><th>Situação</th><th></th></tr></thead>" +
        '<tbody id="ipCamposCorpo"></tbody>' +
      "</table></div>" +
      '<div class="ip-avisos-campos" id="ipAvisosCampos" hidden></div>' +
      '<div class="ip-erro" id="ipErroCampos" hidden></div>';
    var refazer = st.config ? "Voltar à configuração salva" : st.modelo === "outra" ? "Reconhecer de novo" : "Voltar às colunas do modelo";
    rodape(
      '<button type="button" class="btn-secondary" data-ip="voltar">' + svg(I_VOLTAR, 15) + " Voltar</button>" +
      '<button type="button" class="ip-link" data-ip="restaurar">' + refazer + "</button>",
      '<button type="button" class="btn-primary" data-ip="conferir">Conferir os produtos ' + svg(I_SETA, 15) + "</button>"
    );
    ligarRodape();
    desenharMapas();
    ligarCampos();
  }

  function contarCampos() {
    var el = $("ipConta");
    if (!el) return;
    var usados = st.mapas.filter(function (m) { return (m.usar || m.campo === "nome") && m.ini && st.catIdx[m.campo]; }).length;
    el.textContent = plural(usados, "campo marcado", "campos marcados") + " de " + st.mapas.length;
  }

  function desenharMapas() {
    var corpo = $("ipCamposCorpo");
    if (!corpo) return;
    corpo.innerHTML = st.mapas.map(linhaMapaHtml).join("");
    contarCampos();
    avisosDosCampos();
  }

  function mapaPorUid(uid) { return st.mapas.filter(function (m) { return m.uid === uid; })[0] || null; }

  function atualizarLinhaMapa(m) {
    var tr = $("ipCamposCorpo") && $("ipCamposCorpo").querySelector('tr[data-uid="' + m.uid + '"]');
    if (!tr) return;
    var tmp = document.createElement("tbody");
    tmp.innerHTML = linhaMapaHtml(m);
    var nova = tmp.firstChild;
    ["ip-titulo-col", "ip-exemplo", "ip-sit-col"].forEach(function (cl) {
      var a = tr.querySelector("." + cl), b = nova.querySelector("." + cl);
      if (a && b) a.innerHTML = b.innerHTML;
    });
    tr.className = nova.className;
    var cb = tr.querySelector("[data-usar]");
    if (cb) cb.checked = m.usar || m.campo === "nome";
    // Mantém o que está sendo digitado (para não perder o cursor).
    var ativo = document.activeElement;
    var ini = tr.querySelector("[data-ini]"), fim = tr.querySelector("[data-fim]");
    if (ini && ini !== ativo) ini.value = m.ini;
    if (fim && fim !== ativo) fim.value = m.fim || "";
    contarCampos();
    avisosDosCampos();
  }

  /** Avisos que não impedem seguir: linhas diferentes, preço e margem juntos. */
  function avisosDosCampos() {
    var box = $("ipAvisosCampos");
    if (!box) return;
    var usados = st.mapas.filter(function (m) { return (m.usar || m.campo === "nome") && st.catIdx[m.campo] && lerRef(m.ini, st.inicio); });
    var msgs = [];
    var fora = usados.filter(function (m) { return lerRef(m.ini, st.inicio).linha !== st.inicio; });
    if (fora.length) {
      msgs.push("Nem todos os campos começam na linha " + st.inicio + ": " + fora.slice(0, 4).map(function (m) {
        return esc(rotuloDoMapa(m)) + " começa na " + lerRef(m.ini, st.inicio).linha;
      }).join("; ") + (fora.length > 4 ? "…" : "") + ". Cada produto é lido na mesma distância da célula inicial de cada campo — confira se é isso mesmo.");
    }
    var tem = function (fn) { return usados.some(function (m) { return fn(st.catIdx[m.campo]); }); };
    if (tem(function (e) { return e.preco; }) && tem(function (e) { return e.margem; })) {
      msgs.push("Preço de Venda e Margem Desejada marcados: vale o preço — a margem é calculada a partir dele.");
    }
    if (tem(function (e) { return e.preco === "classico"; }) && tem(function (e) { return e.preco && e.preco !== "classico"; })) {
      msgs.push("Preço de Venda Premium e Clássico marcados: vale o Premium (o Clássico só quando o Premium estiver vazio).");
    }
    if (tem(function (e) { return e.margem === "pct"; }) && tem(function (e) { return e.margem === "rs"; })) {
      msgs.push("Margem em % e em R$ marcadas: vale a em % (a em R$ só quando a em % estiver vazia).");
    }
    box.hidden = !msgs.length;
    box.innerHTML = msgs.map(function (a) { return '<div class="ip-aviso-linha">' + svg(I_AVISO, 14) + "<span>" + a + "</span></div>"; }).join("");
  }

  /** Muda a linha inicial: a célula inicial de todos os campos vai junto. */
  function moverInicio(n) {
    st.inicio = n;
    st.mapas.forEach(function (m) {
      var a = lerRef(m.ini, n);
      if (!a) return;
      m.ini = a.col + n;
      var b = m.fim ? lerRef(m.fim) : null;
      if (b && b.ci === a.ci && b.linha < n) m.fim = "";
    });
    st.leitura = null;
    st.mudouMapa = true;
  }

  function ligarCampos() {
    var corpo = $("ipCorpo");
    var tbody = $("ipCamposCorpo");
    var marcar = { sugestao: 1, confira: 1, unidade: 1, mudou: 1 };
    tbody.addEventListener("change", function (e) {
      var t = e.target;
      var m = mapaPorUid(t.getAttribute("data-usar") || t.getAttribute("data-unidade"));
      if (!m) return;
      st.mudouMapa = true;
      st.leitura = null;
      if (t.hasAttribute("data-usar")) {
        if (m.campo === "nome") { t.checked = true; return; }
        m.usar = t.checked;
        // Marcar uma sugestão (ou um campo para conferir) é a confirmação.
        if (m.usar && m.nota && marcar[m.nota.tipo]) m.nota = { tipo: "confirmado", titulo: m.nota.titulo };
        atualizarLinhaMapa(m);
        // Marcado sem célula: o cursor vai para ela.
        if (m.usar && !m.ini) { var inp = tbody.querySelector('[data-ini="' + m.uid + '"]'); if (inp) try { inp.focus(); } catch (er) {} }
        return;
      }
      if (t.hasAttribute("data-unidade")) {
        m.unidade = t.value;
        // Escolher a unidade é a confirmação do campo. (No Preço de Venda é
        // o tipo da margem: usar o preço continua sendo marcar o campo.)
        var ePreco = st.catIdx[m.campo] && st.catIdx[m.campo].preco;
        if (m.ini && !ePreco) {
          m.usar = true;
          if (m.nota && marcar[m.nota.tipo]) m.nota = { tipo: "confirmado", titulo: m.nota.titulo };
        }
        atualizarLinhaMapa(m);
      }
    });
    tbody.addEventListener("input", function (e) {
      var t = e.target;
      var ehIni = t.hasAttribute("data-ini");
      if (!ehIni && !t.hasAttribute("data-fim")) return;
      var m = mapaPorUid(t.getAttribute(ehIni ? "data-ini" : "data-fim"));
      if (!m) return;
      if (window.BapellCampos) window.BapellCampos.limpar(t);
      st.mudouMapa = true;
      st.leitura = null;
      if (ehIni) {
        var a = lerRef(t.value, st.inicio);
        if (a === null) return; // ainda digitando ou inválido: confere no "Conferir"
        if (a === "") {
          m.ini = "";
          if (m.campo !== "nome") m.usar = false;
        } else {
          m.ini = a.ref;
          if (st.catIdx[m.campo]) m.usar = true;
        }
        if (m.nota && m.nota.tipo !== "semcampo" && m.nota.tipo !== "novo") m.nota = { tipo: "manual" };
      } else {
        var txt = t.value.trim();
        if (!txt) m.fim = "";
        else {
          var b = lerRef(txt);
          if (!b) return;
          m.fim = b.ref;
        }
      }
      atualizarLinhaMapa(m);
    });
    tbody.addEventListener("focusout", function (e) {
      var t = e.target;
      if (!t.hasAttribute || !(t.hasAttribute("data-ini") || t.hasAttribute("data-fim"))) return;
      var c = t.hasAttribute("data-ini") ? lerRef(t.value, st.inicio) : lerRef(t.value);
      if (c) t.value = c.ref;
    });
    tbody.addEventListener("click", function (e) {
      var b = e.target.closest("[data-remover]");
      if (!b) return;
      st.mapas = st.mapas.filter(function (m) { return m.uid !== b.getAttribute("data-remover") || !!campoPorId(m.campo); });
      st.mudouMapa = true;
      st.leitura = null;
      desenharMapas();
    });
    corpo.querySelector(".ip-tabela--mapas").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.classList && e.target.classList.contains("ip-cel")) { e.preventDefault(); e.target.blur(); }
    });

    var ini = $("ipInicio"), fim = $("ipFim");
    ini.addEventListener("change", function () {
      var n = parseInt(ini.value, 10);
      if (!(n >= 1 && n <= MAX_LINHA_XL)) return; // confere no "Conferir"
      if (n === st.inicio) return;
      moverInicio(n);
      desenharMapas();
    });
    fim.addEventListener("change", function () {
      var n = parseInt(fim.value, 10);
      st.fim = n >= 1 ? n : null;
      st.leitura = null;
    });
    corpo.querySelectorAll("[data-aba]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var nome = cb.getAttribute("data-aba");
        var ordem = st.wb.SheetNames || [];
        var set = st.abas.slice();
        if (cb.checked) { if (set.indexOf(nome) < 0) set.push(nome); }
        else set = set.filter(function (n) { return n !== nome; });
        st.abas = ordem.filter(function (n) { return set.indexOf(n) >= 0; });
        cb.closest(".ip-aba").classList.toggle("marcada", cb.checked);
        st.leitura = null;
        desenharMapas();
      });
    });
    var sug = $("ipUsarSugestao");
    if (sug) sug.addEventListener("click", function () {
      var cfg = st.sugestaoConfig;
      if (!cfg) return;
      st.config = cfg;
      st.modelo = origemPorId(cfg.base) ? cfg.base : "outra";
      st.sugestaoConfig = null;
      st.salvar = { marcado: false, nome: cfg.nome };
      mapearDoZero();
      desenhar();
    });

    // Adicionar Campo
    $("ipAddAbrir").addEventListener("click", abrirAdicionar);
    $("ipAddCancelar").addEventListener("click", fecharAdicionar);
    $("ipAddOk").addEventListener("click", confirmarAdicionar);
    $("ipAddCampo").addEventListener("change", function () {
      if (window.BapellCampos) window.BapellCampos.limpar($("ipAddCampo"));
      sugerirCelula();
    });
    ["ipAddIni", "ipAddFim", "ipAddNome"].forEach(function (id) {
      $(id).addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); confirmarAdicionar(); } });
      $(id).addEventListener("input", function () { if (window.BapellCampos) window.BapellCampos.limpar($(id)); });
    });
    ["ipAddIni", "ipAddFim"].forEach(function (id) {
      $(id).addEventListener("blur", function () {
        var c = id === "ipAddIni" ? lerRef($(id).value, st.inicio) : lerRef($(id).value);
        if (c) $(id).value = c.ref;
      });
    });
  }

  // ── Adicionar Campo ──
  function opcoesCatalogo() {
    var grupos = [], idx = Object.create(null);
    var comCelula = Object.create(null);
    st.mapas.forEach(function (m) { if (m.ini && (m.usar || m.campo === "nome")) comCelula[m.campo] = m.ini; });
    st.catalogo.forEach(function (c) {
      if (!idx[c.secao]) { idx[c.secao] = []; grupos.push({ secao: c.secao, campos: idx[c.secao] }); }
      idx[c.secao].push(c);
    });
    return '<option value="">Escolha o campo…</option>' + grupos.map(function (g) {
      var ops = g.campos.map(function (c) {
        var extra = comCelula[c.id] ? " — já na lista (" + comCelula[c.id] + ")" : c.oculto ? " (oculto nesta plataforma)" : "";
        return '<option value="' + esc(c.id) + '">' + esc(c.rotulo + extra) + "</option>";
      }).join("");
      if (g.secao === S_ID) ops += '<option value="' + NOVO_TEXTO + '">+ Novo campo de texto…</option>';
      return '<optgroup label="' + esc(g.secao) + '">' + ops + "</optgroup>";
    }).join("");
  }

  function abrirAdicionar() {
    var box = $("ipAdd");
    if (!box) return;
    $("ipAddCampo").innerHTML = opcoesCatalogo();
    $("ipAddCampo").value = "";
    $("ipAddNome").value = "";
    $("ipAddIni").value = "";
    $("ipAddFim").value = "";
    $("ipAddNomeWrap").hidden = true;
    $("ipAddUnidWrap").hidden = true;
    $("ipAddErro").hidden = true;
    $("ipAddDica").textContent = DICA_ADD;
    ["ipAddCampo", "ipAddNome", "ipAddIni", "ipAddFim"].forEach(function (id) { if (window.BapellCampos) window.BapellCampos.limpar($(id)); });
    box.hidden = false;
    $("ipAddAbrir").disabled = true;
    setTimeout(function () { try { $("ipAddCampo").focus(); } catch (e) {} }, 30);
  }
  function fecharAdicionar() {
    var box = $("ipAdd");
    if (!box) return;
    box.hidden = true;
    $("ipAddAbrir").disabled = false;
    try { $("ipAddAbrir").focus(); } catch (e) {}
  }

  /** Ao escolher o campo: a célula que ele já tem, ou a sugerida pelo título. */
  function sugerirCelula() {
    var val = $("ipAddCampo").value;
    var novo = val === NOVO_TEXTO;
    var e = novo ? null : st.catIdx[val];
    var dica = $("ipAddDica");
    $("ipAddNomeWrap").hidden = !novo;
    $("ipAddErro").hidden = true;
    var wrap = $("ipAddUnidWrap");
    if (e && temSeletor(e)) {
      wrap.hidden = false;
      $("ipAddUnidRot").textContent = e.preco ? "Margem" : "Na planilha";
      $("ipAddUnid").innerHTML = opcoesUnidade(e, unidadePadrao(e));
    } else wrap.hidden = true;
    $("ipAddFim").value = "";
    if (novo) {
      $("ipAddIni").value = "";
      dica.textContent = "Dê um nome ao campo (ex.: Marca, ASIN, NCM): ele é criado na Identificação do Produto de cada produto, " +
        "só como informação (não entra em cálculo). Depois, a célula inicial e, se quiser, a final.";
      setTimeout(function () { try { $("ipAddNome").focus(); } catch (er) {} }, 30);
      return;
    }
    if (!e) { $("ipAddIni").value = ""; dica.textContent = DICA_ADD; return; }
    var existente = st.mapas.filter(function (m) { return m.campo === e.id && m.ini; })[0];
    if (existente) {
      $("ipAddIni").value = existente.ini;
      $("ipAddFim").value = existente.fim || "";
      if (temSeletor(e)) $("ipAddUnid").value = existente.unidade || unidadePadrao(e);
      dica.textContent = e.rotulo + " já está na lista (célula " + existente.ini + "). Adicionar troca a célula" + (existente.usar ? "." : " e marca o campo.");
      return;
    }
    // A coluna sugerida pelo título (fora as já usadas).
    var sheet = primeiraAba();
    var usadas = Object.create(null);
    st.mapas.forEach(function (m) { var c = lerRef(m.ini, st.inicio); if (c && (m.usar || m.campo === "nome")) usadas[c.ci] = true; });
    var melhor = null;
    if (sheet && st.inicio > 1) {
      var lim = limitesDaAba(sheet);
      for (var ci = 0; ci <= Math.min(lim.ultimaColuna, 300); ci++) {
        if (usadas[ci]) continue;
        var lista = titulosDaColuna(sheet, colunaDoIndice(ci), st.inicio);
        for (var k = 0; k < lista.length; k++) {
          var n = notaTitulo(lista[k], e);
          if (n > 0 && (!melhor || n > melhor.n)) melhor = { ci: ci, n: n, t: lista[k] };
        }
      }
    }
    var final = e.preco ? " O Bapell calcula a margem que dá este preço." : "";
    if (melhor) {
      $("ipAddIni").value = colunaDoIndice(melhor.ci) + st.inicio;
      if (precisaUnidade(e)) {
        var u = unidadeDoTitulo(melhor.t, e.tipo);
        if (u) $("ipAddUnid").value = u;
      }
      dica.textContent = "Sugestão pelo título \"" + melhor.t.slice(0, 60) + "\" (coluna " + colunaDoIndice(melhor.ci) + "). Confira antes de adicionar." + final;
    } else {
      $("ipAddIni").value = "";
      dica.textContent = "Informe a célula da 1ª linha de produtos na coluna de " + e.rotulo + " (ex.: F" + st.inicio + ") e, se quiser, a última (ex.: F500)." + final;
    }
  }

  function confirmarAdicionar() {
    var erro = $("ipAddErro");
    erro.hidden = true;
    var falha = function (msg, el) {
      erro.hidden = false;
      erro.innerHTML = svg(I_AVISO, 16) + "<span>" + msg + "</span>";
      if (el && window.BapellCampos) window.BapellCampos.marcar(el);
      if (el) try { el.focus(); } catch (e) {}
    };
    var val = $("ipAddCampo").value;
    var novo = val === NOVO_TEXTO;
    var nomeNovo = novo ? $("ipAddNome").value.replace(/\s+/g, " ").trim() : "";
    var e = novo ? null : st.catIdx[val];
    if (!novo && !e) return falha("Escolha o campo do Bapell.", $("ipAddCampo"));
    if (novo && !nomeNovo) return falha("Dê um nome ao campo novo (ex.: Marca).", $("ipAddNome"));
    if (novo && !normTxt(nomeNovo)) return falha("Use letras ou números no nome do campo.", $("ipAddNome"));
    var a = lerRef($("ipAddIni").value, st.inicio);
    if (!a) return falha("Informe a célula inicial (ex.: F" + st.inicio + ") ou só a letra da coluna (ex.: F).", $("ipAddIni"));
    var fimTxt = $("ipAddFim").value.trim();
    var b = fimTxt ? lerRef(fimTxt) : null;
    if (fimTxt && !b) return falha("Célula final inválida (ex.: " + a.col + (a.linha + 99) + ").", $("ipAddFim"));
    if (b && (b.ci !== a.ci || b.linha < a.linha)) {
      return falha("A célula final precisa estar na mesma coluna, abaixo da inicial (ex.: " + a.ref + " até " + a.col + (a.linha + 99) + ").", $("ipAddFim"));
    }
    var idAlvo = novo ? "cid:" + normTxt(nomeNovo) : e.id;
    var ocupada = st.mapas.filter(function (m) {
      if (m.campo === idAlvo || !(m.usar || m.campo === "nome")) return false;
      var c = lerRef(m.ini, st.inicio);
      return c && c.ci === a.ci;
    })[0];
    if (ocupada) return falha("A coluna " + a.col + " já é de " + esc(rotuloDoMapa(ocupada)) + ". Escolha outra ou desmarque aquele campo.", $("ipAddIni"));
    if (novo) e = st.catIdx[idAlvo] || registrarCampoTexto(nomeNovo, true);
    var dados = {
      ini: a.ref, fim: b ? b.ref : "", unidade: temSeletor(e) ? $("ipAddUnid").value : "", usar: true,
      nota: e.novo ? { tipo: "novo" } : { tipo: "manual" },
    };
    var m = st.mapas.filter(function (x) { return x.campo === e.id; })[0];
    if (m) Object.assign(m, dados);
    else { m = novoMapa(e.id, dados.ini, dados); st.mapas.push(m); }
    st.mudouMapa = true;
    st.leitura = null;
    fecharAdicionar();
    desenharMapas();
    var tr = $("ipCamposCorpo").querySelector('tr[data-uid="' + m.uid + '"]');
    if (tr) { tr.classList.add("ip-novo"); try { tr.scrollIntoView({ block: "nearest" }); } catch (er) {} }
  }

  function restaurar() {
    mapearDoZero();
    st.sugestaoConfig = st.config ? null : configParecida();
    desenhar();
  }

  function erroCampos(msg) {
    var box = $("ipErroCampos");
    if (!box) return;
    box.hidden = !msg;
    box.innerHTML = msg ? svg(I_AVISO, 16) + "<span>" + msg + "</span>" : "";
  }

  /** Confere os campos e lê os produtos. */
  function conferir() {
    erroCampos("");
    var corpo = $("ipCorpo");
    var marcarErro = function (el) { if (el && window.BapellCampos) window.BapellCampos.marcar(el); };
    var falhas = [];
    // A linha inicial primeiro (ela move as células).
    var ini = parseInt($("ipInicio").value, 10);
    var iniOk = ini >= 1 && ini <= MAX_LINHA_XL;
    if (!iniOk) { marcarErro($("ipInicio")); falhas.push("Informe a linha em que os produtos começam."); }
    else if (ini !== st.inicio) { moverInicio(ini); desenharMapas(); }

    var invalidos = 0, semCelula = [], finsRuins = [], repetida = null, semNome = false;
    var porCol = Object.create(null);
    var porCampo = {}, extras = [];
    st.mapas.forEach(function (m) {
      var e = st.catIdx[m.campo];
      var ehNome = m.campo === "nome";
      if (!e || (!m.usar && !ehNome)) return;
      var inpIni = corpo.querySelector('[data-ini="' + m.uid + '"]');
      var inpFim = corpo.querySelector('[data-fim="' + m.uid + '"]');
      var a = lerRef(inpIni ? inpIni.value : m.ini, st.inicio);
      if (a === null) { invalidos++; marcarErro(inpIni); return; }
      if (a === "") {
        marcarErro(inpIni);
        if (ehNome) semNome = true; else semCelula.push(e.rotulo);
        return;
      }
      m.ini = a.ref;
      var fimTxt = inpFim ? inpFim.value.trim() : (m.fim || "");
      var b = null;
      if (fimTxt) {
        b = lerRef(fimTxt);
        if (!b) {
          finsRuins.push("Célula final inválida em " + esc(e.rotulo) + " (ex.: " + a.col + (a.linha + 99) + ").");
          marcarErro(inpFim);
          return;
        }
        if (b.ci !== a.ci || b.linha < a.linha) {
          finsRuins.push("Em " + esc(e.rotulo) + ", a célula final precisa estar na mesma coluna, abaixo da inicial (ex.: " + a.ref + " até " + a.col + (a.linha + 99) + ").");
          marcarErro(inpFim);
          return;
        }
        m.fim = b.ref;
      } else m.fim = "";
      if (porCol[a.col]) {
        marcarErro(inpIni);
        if (!repetida) repetida = { col: a.col, outro: porCol[a.col], este: e.rotulo };
        return;
      }
      porCol[a.col] = e.rotulo;
      var lido = { campo: m.campo, entry: e, col: a.col, off: a.linha - st.inicio, fimLinha: b ? b.linha : 0, unidade: m.unidade || unidadePadrao(e) };
      if (e.nucleo) porCampo[m.campo] = lido; else extras.push(lido);
    });
    if (invalidos) falhas.push("Use a célula (ex.: B2) ou só a letra da coluna (ex.: B).");
    if (repetida) falhas.push("A coluna " + esc(repetida.col) + " está em dois campos (" + esc(repetida.outro) + " e " + esc(repetida.este) + "). Cada campo precisa da sua coluna.");
    if (semNome) falhas.push("Informe a célula (ou a coluna) do <strong>Nome do Produto</strong>: sem ela não há o que cadastrar.");
    if (semCelula.length) falhas.push("Informe a célula de " + semCelula.map(esc).join(", ") + " (ex.: C" + st.inicio + ") ou desmarque " + (semCelula.length > 1 ? "esses campos." : "o campo."));
    falhas = falhas.concat(finsRuins);
    var fimTxt = String($("ipFim").value || "").trim();
    var fim = parseInt(fimTxt, 10);
    if (fimTxt && !(fim >= 1)) {
      marcarErro($("ipFim"));
      falhas.push("A última linha precisa ser um número (ou fique em branco).");
    } else if (fimTxt && iniOk && fim < st.inicio) {
      marcarErro($("ipFim"));
      falhas.push("A última linha vem antes da primeira.");
    } else st.fim = fimTxt ? fim : null;
    if (!st.abas.length) falhas.push("Marque ao menos uma aba da planilha.");
    if (falhas.length) { erroCampos(falhas.join(" ")); return; }

    var leitura;
    try {
      leitura = lerProdutos(st.wb, { abas: st.abas, inicio: st.inicio, fim: st.fim, porCampo: porCampo, extras: extras });
    } catch (e) {
      registrarErro("ler os produtos", e);
      erroCampos("Não foi possível ler os produtos desta planilha.");
      return;
    }
    if (!leitura.linhas.length) {
      erroCampos("Nenhum produto foi encontrado a partir da linha " + st.inicio + ". Confira a linha inicial, as abas e as células.");
      return;
    }
    st.leitura = leitura;
    st.desmarcados = Object.create(null);
    leitura.linhas.forEach(function (r) { if (r.pareceTotal) st.desmarcados[r.chave] = true; });
    st.filtro = "todos";
    st.limite = PASSO_LISTA;
    st.passo = 4;
    desenhar();
  }

  // ─────────────────────────────────────────────
  //  4. CONFERÊNCIA
  // ─────────────────────────────────────────────
  /** Para cada linha, a situação em cada plataforma escolhida e se vai ser cadastrada. */
  function analisar() {
    var idx = {};
    st.destinos.forEach(function (pid) { idx[pid] = indiceDaPlataforma(pid); });
    var porPlataforma = {};
    st.destinos.forEach(function (pid) { porPlataforma[pid] = { novos: 0, pulados: 0 }; });
    var total = { cadastrar: 0, linhasCadastrar: 0, puladas: 0, bloqueadas: 0, comAviso: 0 };
    st.leitura.linhas.forEach(function (r) {
      r._sit = {};
      r._vai = [];
      st.destinos.forEach(function (pid) {
        var s = situacaoNaPlataforma(r, idx[pid]);
        r._sit[pid] = s;
        if (r.bloqueio) return;
        if (s === "novo") {
          if (!st.desmarcados[r.chave]) { r._vai.push(pid); porPlataforma[pid].novos++; total.cadastrar++; }
        } else {
          porPlataforma[pid].pulados++;
        }
      });
      if (r.avisos.length) total.comAviso++;
      if (r.bloqueio) total.bloqueadas++;
      else if (r._vai.length) total.linhasCadastrar++;
      else if (st.destinos.length && st.destinos.every(function (pid) { return r._sit[pid] !== "novo"; })) total.puladas++;
    });
    return { porPlataforma: porPlataforma, total: total };
  }

  function categoriaDaLinha(r) {
    if (r.bloqueio) return "fora";
    if (!st.destinos.length) return "fora";
    var algumNovo = st.destinos.some(function (pid) { return r._sit[pid] === "novo"; });
    if (!algumNovo) return "pulado";
    if (st.desmarcados[r.chave]) return "fora";
    return "cadastrar";
  }

  function situacaoLinhaHtml(r) {
    if (r.bloqueio === "sem-nome") return '<span class="ip-tag ip-tag--fora">Sem nome — não será cadastrado</span>';
    if (r.bloqueio === "repetido") return '<span class="ip-tag ip-tag--fora">Repetido na planilha</span>';
    if (!st.destinos.length) return '<span class="ip-tag ip-tag--fora">Escolha a plataforma</span>';
    var partes = [];
    var novos = st.destinos.filter(function (pid) { return r._sit[pid] === "novo"; });
    var ja = st.destinos.filter(function (pid) { return r._sit[pid] !== "novo"; });
    if (novos.length) {
      partes.push(st.desmarcados[r.chave]
        ? '<span class="ip-tag ip-tag--fora">Desmarcado</span>'
        : '<span class="ip-tag ip-tag--novo">Novo' + (st.destinos.length > 1 && ja.length ? " em " + esc(novos.map(nomePlataforma).join(", ")) : "") + "</span>");
    }
    ja.forEach(function (pid) {
      var s = r._sit[pid];
      var txt = s === "sku" ? "SKU já cadastrado" : s === "kit" ? "SKU de um kit já cadastrado" : "Mesmo nome já cadastrado (sem SKU)";
      partes.push('<span class="ip-tag ip-tag--pulado" title="Não é cadastrado nesta plataforma">' + txt +
        (st.destinos.length > 1 ? " em " + esc(nomePlataforma(pid)) : "") + " — pula</span>");
    });
    return partes.join("");
  }

  function medidas(r) {
    var p = [r.largura, r.altura, r.comprimento];
    if (p.every(function (x) { return x == null; })) return '<span class="ip-muda">—</span>';
    return p.map(function (x) { return x == null ? "—" : fmtNum(x, 2); }).join(" × ") + ' <span class="ip-muda">cm</span>';
  }

  /** O Preço de Venda da linha e a margem que ele dá (na 1ª plataforma escolhida). */
  function previaPreco(r) {
    var tem = st.leitura.extras.some(function (m) { return m.entry.preco && r.valores[m.entry.id] != null; });
    if (!tem) return null;
    var pid = st.destinos[0] || st.plataforma;
    if (!r._prev) r._prev = {};
    if (!r._prev[pid]) {
      var saida = {};
      try { montarProduto(r, pid, plataformaEhML(pid), 0, st.catIdx, saida); } catch (e) { registrarErro("prévia da margem", e); }
      r._prev[pid] = saida;
    }
    return { pid: pid, s: r._prev[pid] };
  }

  /**
   * Os outros campos lidos na linha, embaixo do nome: o Preço de Venda e a
   * margem que ele dá (numa linha só) e os demais, em sequência.
   */
  function outrosHtml(r) {
    var html = "";
    var prev = previaPreco(r);
    if (prev && prev.s && prev.s.preco) {
      var onde = st.destinos.length > 1 ? " <small>(em " + esc(nomePlataforma(prev.pid)) + ")</small>" : "";
      html += '<div class="ip-outros__preco"><span class="ip-outros__rot">' + (prev.s.classico ? "Preço Clássico" : "Preço de Venda") + ":</span> " +
        esc(fmtBRL(prev.s.preco)) + (prev.s.aviso
          ? ' <span class="ip-aviso-txt">— ' + esc(prev.s.aviso) + "</span>"
          : " → margem <strong>" + esc(prev.s.tipo === "rs" ? fmtBRL(prev.s.margem) : fmtNum(prev.s.margem, 2) + "%") + "</strong>") + onde + "</div>";
    }
    var itens = [];
    st.leitura.extras.forEach(function (m) {
      var e = m.entry;
      if (e.preco) return;
      var v = r.valores[e.id];
      if (v == null || v === "") return;
      itens.push('<span class="ip-outros__item"><span class="ip-outros__rot">' + esc(e.rotulo) + ":</span> " + esc(fmtValor(e, v)) + "</span>");
    });
    if (itens.length) {
      var max = 5;
      var resto = itens.length - max;
      html += '<div class="ip-outros__lista">' + itens.slice(0, max).join('<span class="ip-outros__sep"> · </span>') +
        (resto > 0 ? '<span class="ip-outros__sep"> · </span><span class="ip-outros__mais">+ ' + plural(resto, "campo", "campos") + "</span>" : "") + "</div>";
    }
    return html ? '<div class="ip-prod__outros">' + html + "</div>" : "";
  }

  function linhaProdutoHtml(r) {
    var cat = categoriaDaLinha(r);
    var podeMarcar = !r.bloqueio && st.destinos.length && st.destinos.some(function (pid) { return r._sit[pid] === "novo"; });
    var marcado = podeMarcar && !st.desmarcados[r.chave];
    var onde = (st.abas.length > 1 ? esc(r.aba) + " · " : "") + "linha " + r.linha;
    return '<tr class="ip-prod ip-prod--' + cat + '" data-chave="' + esc(r.chave) + '">' +
      '<td class="ip-prod__check"><input type="checkbox" data-marcar="' + esc(r.chave) + '"' + (marcado ? " checked" : "") +
        (podeMarcar ? "" : " disabled") + ' aria-label="Cadastrar ' + esc(r.nome || r.sku || onde) + '" /></td>' +
      '<td class="ip-prod__nome"><div class="ip-prod__titulo">' + (r.nome ? esc(r.nome) : '<span class="ip-muda">(sem nome)</span>') + "</div>" +
        '<div class="ip-prod__meta">' + (r.sku ? "SKU " + esc(r.sku) : '<span class="ip-aviso-txt">sem SKU</span>') + " · " + onde + "</div>" +
        (st.leitura.extras.length ? outrosHtml(r) : "") +
        (r.avisos.length ? '<ul class="ip-prod__avisos">' + r.avisos.map(function (a) { return "<li>" + svg(I_AVISO, 11) + esc(a) + "</li>"; }).join("") + "</ul>" : "") +
      "</td>" +
      '<td class="ip-prod__ean">' + (r.ean ? esc(r.ean) : '<span class="ip-muda">—</span>') + "</td>" +
      '<td class="num">' + (r.custo != null ? esc(fmtBRL(r.custo)) : '<span class="ip-muda">—</span>') + "</td>" +
      '<td class="num">' + (r.peso != null ? esc(fmtNum(r.peso, 2)) + ' <span class="ip-muda">g</span>' : '<span class="ip-muda">—</span>') + "</td>" +
      '<td class="num ip-prod__medidas">' + medidas(r) + "</td>" +
      '<td class="ip-prod__sit">' + situacaoLinhaHtml(r) + "</td>" +
    "</tr>";
  }

  function desenharConferencia() {
    var plats = plataformasDisponiveis();
    var temExtras = st.leitura.extras.length > 0;
    var podeSalvar = st.modelo === "outra" || !!st.config || st.mudouMapa;
    if (!st.salvar.nome) st.salvar.nome = st.config ? st.config.nome : String(st.arquivo || "").replace(/\.[^.]+$/, "").slice(0, 60);
    $("ipCorpo").innerHTML =
      '<div class="ip-bloco">' +
        '<div class="ip-bloco__tit">Cadastrar em</div>' +
        '<div class="ip-destinos" id="ipDestinos">' +
          plats.map(function (p) {
            var marc = st.destinos.indexOf(p.id) >= 0;
            var ini = esc(String(p.nome).slice(0, 2).toUpperCase());
            return '<label class="ip-destino' + (marc ? " marcado" : "") + '">' +
              '<input type="checkbox" data-destino="' + esc(p.id) + '"' + (marc ? " checked" : "") + " />" +
              '<span class="ip-destino__logo" data-ini="' + ini + '">' + (p.logo ? '<img src="' + esc(p.logo) + '" alt="" onerror="this.parentNode.textContent=this.parentNode.getAttribute(\'data-ini\')" />' : ini) + "</span>" +
              '<span class="ip-destino__txt"><span class="ip-destino__nome">' + esc(p.nome) + (p.id === st.plataforma ? ' <small>(esta)</small>' : "") + "</span>" +
              '<span class="ip-destino__conta" data-conta="' + esc(p.id) + '"></span></span>' +
            "</label>";
          }).join("") +
        "</div>" +
      "</div>" +
      '<div class="ip-aviso-sku" id="ipAvisoSku" hidden></div>' +
      '<div class="ip-avisos-campos ip-avisos-conf" id="ipAvisosConf" hidden></div>' +
      '<div class="ip-resumo" id="ipResumo"></div>' +
      '<div class="ip-filtros" role="tablist" id="ipFiltros">' +
        [["todos", "Todos"], ["cadastrar", "Serão cadastrados"], ["pulado", "Já cadastrados"], ["fora", "Fora da importação"], ["aviso", "Com aviso"]]
          .map(function (f) { return '<button type="button" role="tab" class="ip-filtro' + (st.filtro === f[0] ? " ativo" : "") + '" data-filtro="' + f[0] + '">' + f[1] + ' <span data-qtd="' + f[0] + '"></span></button>'; }).join("") +
        '<span class="ip-filtros__acoes"><button type="button" class="ip-link" data-ip="marcar-todos">Marcar todos</button>' +
        '<button type="button" class="ip-link" data-ip="desmarcar-todos">Desmarcar todos</button></span>' +
      "</div>" +
      '<div class="ip-tabela-wrap ip-tabela-wrap--prod"><table class="ip-tabela ip-tabela--prod' + (temExtras ? " ip-tabela--prod-outros" : "") + '">' +
        '<thead><tr><th class="ip-prod__check"></th><th>Produto' + (temExtras ? " <small>e os outros campos</small>" : "") + "</th>" +
          '<th>EAN/GTIN <small>(ID do Produto)</small></th><th class="num">Custo</th><th class="num">Peso</th><th class="num">L × A × C</th>' +
          "<th>Situação</th></tr></thead>" +
        '<tbody id="ipProdCorpo"></tbody>' +
      "</table></div>" +
      '<div class="ip-vazio" id="ipProdVazio" hidden>Nenhum produto neste filtro.</div>' +
      '<div class="ip-mais" id="ipMais" hidden><span id="ipMaisTxt"></span><button type="button" class="btn-secondary" data-ip="mais">Mostrar mais</button></div>' +
      (podeSalvar
        ? '<div class="ip-salvar">' +
            '<label class="ip-check"><input type="checkbox" id="ipSalvarCfg"' + (st.salvar.marcado ? " checked" : "") + " /> <span>" +
              (st.config ? "Guardar as mudanças na configuração <strong>" + esc(st.config.nome) + "</strong>" : "Salvar esta configuração para a próxima vez, com o nome") + "</span></label>" +
            (st.config ? "" : '<input type="text" class="input-field ip-salvar__nome" id="ipSalvarNome" maxlength="60" value="' + esc(st.salvar.nome) + '" aria-label="Nome da configuração" />') +
          "</div>"
        : "");
    rodape(
      '<button type="button" class="btn-secondary" data-ip="voltar">' + svg(I_VOLTAR, 15) + " Voltar aos campos</button>",
      '<button type="button" class="btn-primary" id="ipCadastrar">Cadastrar</button>'
    );
    ligarRodape();
    $("ipCadastrar").addEventListener("click", cadastrar);
    $("ipDestinos").addEventListener("change", function (e) {
      var cb = e.target.closest("[data-destino]");
      if (!cb) return;
      var id = cb.getAttribute("data-destino");
      var ordem = plats.map(function (p) { return p.id; });
      var set = st.destinos.slice();
      if (cb.checked) { if (set.indexOf(id) < 0) set.push(id); } else set = set.filter(function (x) { return x !== id; });
      st.destinos = ordem.filter(function (x) { return set.indexOf(x) >= 0; });
      cb.closest(".ip-destino").classList.toggle("marcado", cb.checked);
      st.limite = PASSO_LISTA;
      atualizarConferencia();
    });
    $("ipFiltros").addEventListener("click", function (e) {
      var b = e.target.closest("[data-filtro]");
      if (!b) return;
      st.filtro = b.getAttribute("data-filtro");
      st.limite = PASSO_LISTA;
      $("ipFiltros").querySelectorAll("[data-filtro]").forEach(function (x) { x.classList.toggle("ativo", x === b); });
      atualizarConferencia();
    });
    $("ipProdCorpo").addEventListener("change", function (e) {
      var cb = e.target.closest("[data-marcar]");
      if (!cb) return;
      var k = cb.getAttribute("data-marcar");
      if (cb.checked) delete st.desmarcados[k]; else st.desmarcados[k] = true;
      atualizarConferencia(true);
    });
    var cfgCb = $("ipSalvarCfg");
    if (cfgCb) cfgCb.addEventListener("change", function () { st.salvar.marcado = cfgCb.checked; });
    var cfgNome = $("ipSalvarNome");
    if (cfgNome) cfgNome.addEventListener("input", function () { st.salvar.nome = cfgNome.value; if (window.BapellCampos) window.BapellCampos.limpar(cfgNome); });
    atualizarConferencia();
  }

  /** Campos que não valem em alguma das plataformas escolhidas. */
  function avisosDosDestinos() {
    var box = $("ipAvisosConf");
    if (!box) return;
    var msgs = [];
    var ml = st.destinos.filter(plataformaEhML);
    var outras = st.destinos.filter(function (pid) { return !plataformaEhML(pid); });
    st.leitura.extras.forEach(function (m) {
      var e = m.entry;
      if (e.soML && outras.length) {
        msgs.push("<strong>" + esc(e.rotulo) + "</strong> só existe no Mercado Livre: em " + esc(outras.map(nomePlataforma).join(", ")) + " fica como num produto novo.");
      }
      if (e.naoML && ml.length) {
        msgs.push("<strong>" + esc(e.rotulo) + "</strong> não vale no Mercado Livre (lá são as taxas Premium e Clássico): em " + esc(ml.map(nomePlataforma).join(", ")) + " fica como num produto novo.");
      }
    });
    box.hidden = !msgs.length;
    box.innerHTML = msgs.map(function (a) { return '<div class="ip-aviso-linha">' + svg(I_AVISO, 14) + "<span>" + a + "</span></div>"; }).join("");
  }

  function atualizarConferencia(manterLista) {
    var a = analisar();
    // Contas por plataforma
    document.querySelectorAll("#ipDestinos [data-conta]").forEach(function (el) {
      var pid = el.getAttribute("data-conta");
      var c = a.porPlataforma[pid];
      el.textContent = c ? plural(c.novos, "novo", "novos") + (c.pulados ? " · " + plural(c.pulados, "já cadastrado", "já cadastrados") : "") : "";
    });
    // Resumo
    var l = st.leitura;
    var t = a.total;
    var partes = [];
    partes.push("<strong>" + plural(l.linhas.length, "produto lido", "produtos lidos") + "</strong>");
    if (st.destinos.length) partes.push(plural(t.linhasCadastrar, "será cadastrado", "serão cadastrados"));
    if (t.puladas) partes.push(plural(t.puladas, "já cadastrado (pula)", "já cadastrados (pulam)"));
    if (t.bloqueadas) partes.push(plural(t.bloqueadas, "fica de fora", "ficam de fora"));
    if (t.comAviso) partes.push(plural(t.comAviso, "com aviso", "com aviso"));
    if (l.vazias) partes.push(plural(l.vazias, "linha vazia ignorada", "linhas vazias ignoradas"));
    $("ipResumo").innerHTML = partes.join(" · ") +
      (l.cortadas ? '<div class="ip-aviso-txt">A planilha passa de ' + fmtNum(MAX_LINHAS, 0) + " produtos: só os " + fmtNum(MAX_LINHAS, 0) + " primeiros foram lidos.</div>" : "");
    // Planilha do Mercado Livre sem SKU: o aviso de antes, agora com a planilha em mãos.
    var semSku = l.linhas.filter(function (r) { return !r.sku; }).length;
    var avSku = $("ipAvisoSku");
    if (semSku && (st.modelo === "ml" || semSku === l.linhas.length)) {
      avSku.hidden = false;
      avSku.innerHTML = svg(I_AVISO, 16) + "<span>" + (semSku === l.linhas.length
        ? "<strong>Nenhum produto tem SKU.</strong> " + (st.modelo === "ml" ? "A planilha parece ter sido baixada sem a opção SKU marcada no Mercado Livre. " : "") +
          "Sem o SKU, só dá para saber se o produto já está cadastrado pelo nome. Se puder, baixe a planilha de novo com o SKU."
        : plural(semSku, "produto está", "produtos estão") + " sem SKU. Sem ele, o produto só é reconhecido pelo nome.") + "</span>";
    } else {
      avSku.hidden = true;
      avSku.innerHTML = "";
    }
    avisosDosDestinos();
    // Contagem dos filtros
    var conta = { todos: l.linhas.length, cadastrar: 0, pulado: 0, fora: 0, aviso: 0 };
    l.linhas.forEach(function (r) {
      conta[categoriaDaLinha(r)]++;
      if (r.avisos.length) conta.aviso++;
    });
    document.querySelectorAll("#ipFiltros [data-qtd]").forEach(function (el) {
      el.textContent = fmtNum(conta[el.getAttribute("data-qtd")] || 0, 0);
    });
    // Botão
    var b = $("ipCadastrar");
    var n = t.linhasCadastrar;
    b.disabled = !t.cadastrar;
    b.textContent = !st.destinos.length ? "Escolha a plataforma"
      : !n ? "Nada para cadastrar"
      : "Cadastrar " + plural(n, "produto", "produtos") + (st.destinos.length > 1 ? " (" + plural(t.cadastrar, "cadastro", "cadastros") + ")" : "");
    if (manterLista) {
      // Só redesenha a situação das linhas (o clique no checkbox não move a lista).
      var porChave = Object.create(null);
      l.linhas.forEach(function (x) { porChave[x.chave] = x; });
      document.querySelectorAll("#ipProdCorpo tr[data-chave]").forEach(function (tr) {
        var r = porChave[tr.getAttribute("data-chave")];
        if (!r) return;
        tr.className = "ip-prod ip-prod--" + categoriaDaLinha(r);
        tr.querySelector(".ip-prod__sit").innerHTML = situacaoLinhaHtml(r);
      });
      return;
    }
    desenharListaProdutos();
  }

  function linhasDoFiltro() {
    return st.leitura.linhas.filter(function (r) {
      if (st.filtro === "todos") return true;
      if (st.filtro === "aviso") return r.avisos.length > 0;
      return categoriaDaLinha(r) === st.filtro;
    });
  }

  function desenharListaProdutos() {
    var lista = linhasDoFiltro();
    var vis = lista.slice(0, st.limite);
    $("ipProdCorpo").innerHTML = vis.map(linhaProdutoHtml).join("");
    $("ipProdVazio").hidden = lista.length > 0;
    var resta = lista.length - vis.length;
    $("ipMais").hidden = resta <= 0;
    $("ipMaisTxt").textContent = "Mostrando " + fmtNum(vis.length, 0) + " de " + fmtNum(lista.length, 0);
  }

  function marcarTodos(marcar) {
    var lista = linhasDoFiltro();
    lista.forEach(function (r) {
      if (marcar) delete st.desmarcados[r.chave];
      else if (!r.bloqueio) st.desmarcados[r.chave] = true;
    });
    atualizarConferencia();
  }

  // ── Configuração salva ──
  function salvarConfig() {
    if (!st.salvar.marcado) return null;
    var nome = String(st.config ? st.config.nome : st.salvar.nome || "").replace(/\s+/g, " ").trim();
    if (!nome) return null;
    var sheet = primeiraAba();
    var mapas = st.mapas.filter(function (m) { return st.catIdx[m.campo] && lerRef(m.ini, st.inicio); }).map(function (m) {
      var a = lerRef(m.ini, st.inicio);
      return {
        campo: m.campo, rotulo: st.catIdx[m.campo].rotulo, ini: a.ref, fim: m.fim || "", unidade: m.unidade || "",
        usar: !!(m.usar || m.campo === "nome"), titulo: tituloDoMapa(sheet, m),
      };
    });
    var lista = lerConfigs();
    var agora = Date.now();
    var existente = st.config
      ? lista.filter(function (c) { return c.id === st.config.id; })[0]
      : lista.filter(function (c) { return normTxt(c.nome) === normTxt(nome); })[0];
    var cfg = existente || { id: "imp_" + agora.toString(36) + Math.random().toString(36).slice(2, 7), criadoEm: agora };
    Object.assign(cfg, { nome: nome, base: st.modelo, abas: st.abas.slice(), inicio: st.inicio, fim: st.fim || null, mapas: mapas, atualizadoEm: agora });
    if (!existente) lista.push(cfg);
    return gravarConfigs(lista) ? cfg : null;
  }

  // ── Gravação ──
  function cadastrar() {
    if (!st || st.gravando) return;
    var a = analisar();
    if (!a.total.cadastrar) return;
    var nomeInp = $("ipSalvarNome");
    if (st.salvar.marcado && !st.config && !String(st.salvar.nome || "").trim()) {
      if (nomeInp && window.BapellCampos) window.BapellCampos.marcar(nomeInp);
      aviso("Dê um nome à configuração ou desmarque Salvar.", "warning");
      return;
    }
    st.gravando = true;
    var b = $("ipCadastrar");
    b.disabled = true;
    b.textContent = "Cadastrando…";
    var agora = Date.now();
    var resultado = [];
    var promessas = [];
    var comPreco = 0, avisosPreco = 0, emPct = 0;
    try {
      st.destinos.forEach(function (pid) {
        var ehML = plataformaEhML(pid);
        var novos = [];
        st.leitura.linhas.forEach(function (r) {
          if (r._vai.indexOf(pid) < 0) return;
          var saida = {};
          novos.push(montarProduto(r, pid, ehML, agora + novos.length, st.catIdx, saida));
          if (saida.preco) {
            comPreco++;
            if (saida.aviso) avisosPreco++;
            else if (saida.tipo !== "rs") emPct++;
          }
        });
        if (!novos.length) return;
        var lista = getProducts(pid).concat(novos);
        promessas.push(Promise.resolve(saveProducts(pid, lista)));
        resultado.push({ pid: pid, nome: nomePlataforma(pid), novos: novos, pulados: a.porPlataforma[pid].pulados });
      });
    } catch (e) {
      registrarErro("montar os produtos", e);
      st.gravando = false;
      aviso("Não foi possível cadastrar os produtos. Nada foi gravado.", "error", 6000);
      atualizarConferencia();
      return;
    }

    var usouExtras = st.leitura.extras.length > 0;
    Promise.all(promessas).then(function (oks) {
      var falhou = oks.some(function (ok) { return ok === false; });
      // Compostos que usam algum destes SKUs como item (em itens antigos,
      // sem o id do produto): a mesma atualização do Salvar da ficha.
      resultado.forEach(function (res) { propagarParaCompostos(res.pid, res.novos); });
      var cfg = null;
      if (st) {
        try { cfg = salvarConfig(); } catch (e) { registrarErro("salvar configuração", e); }
      }
      var totalNovos = resultado.reduce(function (s, r) { return s + r.novos.length; }, 0);
      if (st) st.gravando = false;
      fechar();
      try { document.dispatchEvent(new CustomEvent("bapell:produtos-importados", { detail: { plataformas: resultado.map(function (r) { return r.pid; }) } })); } catch (e) {}
      var nota = comPreco
        ? "A margem de " + plural(comPreco, "cadastro", "cadastros") + " foi calculada a partir do preço de venda da planilha" +
          (emPct ? " (com a margem em % de 2 casas, o preço no Bapell pode variar alguns centavos)" : "") +
          (avisosPreco ? "; em " + plural(avisosPreco, "cadastro", "cadastros") + " não deu para chegar ao preço (sem custo, ou preço abaixo do custo e das taxas), e a margem ficou 0" : "") + "."
        : usouExtras
          ? "O preço de venda foi calculado pelo mesmo motor da ficha, com os campos importados. Ajuste o que faltar na ficha do produto ou nas <strong>Ações em Massa</strong>."
          : "O preço de venda foi calculado só com o preço de custo. Ajuste taxas e margem na ficha do produto ou nas <strong>Ações em Massa</strong>.";
      var html = "<ul class=\"ip-resultado\">" + resultado.map(function (r) {
        return "<li><strong>" + esc(r.nome) + "</strong>: " + plural(r.novos.length, "produto cadastrado", "produtos cadastrados") +
          (r.pulados ? " · " + plural(r.pulados, "já cadastrado ficou como estava", "já cadastrados ficaram como estavam") : "") + "</li>";
      }).join("") +
        (cfg ? "<li>Configuração <strong>" + esc(cfg.nome) + "</strong> salva</li>" : "") +
        "</ul>" + nota;
      if (window.BapellModal) {
        window.BapellModal.avisar({
          tipo: falhou ? "aviso" : "sucesso",
          titulo: falhou ? "Cadastro com falha ao gravar" : plural(totalNovos, "produto cadastrado", "produtos cadastrados"),
          html: falhou ? "Alguma plataforma não foi gravada no disco. Faça um backup e verifique o espaço livre.<br>" + html : html,
          botao: "Ok",
        });
      } else {
        aviso(plural(totalNovos, "produto cadastrado", "produtos cadastrados"), "success", 5000);
      }
    }).catch(function (e) {
      registrarErro("gravar os produtos", e);
      if (st) st.gravando = false;
      aviso("Não foi possível gravar os produtos. Faça um backup e verifique o espaço livre.", "error", 7000);
      if (st) atualizarConferencia();
    });
  }

  function propagarParaCompostos(pid, novos) {
    if (typeof propagarDependencias !== "function") return;
    try {
      var lista = typeof getProductsForReading === "function" ? getProductsForReading(pid) : [];
      var skusDeItens = Object.create(null);
      lista.forEach(function (p) {
        (p && Array.isArray(p.componentes) ? p.componentes : []).forEach(function (c) {
          var s = normSku(c && c.sku);
          if (s) skusDeItens[s] = true;
        });
      });
      novos.forEach(function (p) {
        if (p.sku && skusDeItens[normSku(p.sku)]) propagarDependencias(pid, p.sku, p.id);
      });
    } catch (e) {
      registrarErro("atualizar compostos", e);
    }
  }

  // ── Rodapé ──
  function ligarRodape() {
    $("ipRodape").querySelectorAll("[data-ip]").forEach(function (b) {
      b.addEventListener("click", function () {
        var acao = b.getAttribute("data-ip");
        if (acao === "cancelar") fechar();
        else if (acao === "voltar") { st.passo = Math.max(1, st.passo - 1); desenhar(); }
        else if (acao === "restaurar") restaurar();
        else if (acao === "conferir") conferir();
        else if (acao === "seguir") { if (!st.mapas.length) mapearDoZero(); st.passo = 3; desenhar(); }
      });
    });
    var corpo = $("ipCorpo");
    corpo.querySelectorAll("[data-ip]").forEach(function (b) {
      b.addEventListener("click", function () {
        var acao = b.getAttribute("data-ip");
        if (acao === "mais") { st.limite += PASSO_LISTA; desenharListaProdutos(); }
        else if (acao === "marcar-todos") marcarTodos(true);
        else if (acao === "desmarcar-todos") marcarTodos(false);
      });
    });
  }

  // ─────────────────────────────────────────────
  //  ENTRADAS
  // ─────────────────────────────────────────────
  // O item "Adicionar pela Planilha" do menu Opções Em Massa e o botão do
  // estado vazio da lista (data-importar-planilha).
  // Em captura: o menu Opções Em Massa não deixa o clique subir até o
  // documento (ele não fecha ao clicar dentro).
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("#btnImportarPlanilha, [data-importar-planilha]") : null;
    if (!b) return;
    e.preventDefault();
    var menu = $("massaMenu");
    if (menu) menu.style.display = "none";
    abrir(typeof getParam === "function" ? getParam("p") : null);
  }, true);

  // Para os testes e para outras telas (só o necessário).
  // `util`: as funções de planilha que a exportação (exportar-produtos.js)
  // reaproveita — as mesmas regras de colunas, células e números.
  window.BapellImportarProdutos = {
    abrir: abrir,
    modelos: MODELOS,
    _interno: {
      numeroDe: numeroDe, eanDe: eanDe, lerColuna: lerColuna, digitoGtinOk: digitoGtinOk, montarProduto: montarProduto,
      lerRef: lerRef, numeroDeCampo: numeroDeCampo, pctDe: pctDe, margemDoPreco: margemDoPreco, reconhecerTitulos: reconhecerTitulos,
      montarCatalogo: montarCatalogo, chaveConfigs: CONFIG_KEY,
    },
    util: {
      esc: esc, normTxt: normTxt, normSku: normSku, arred: arred, fmtNum: fmtNum, fmtBRL: fmtBRL, plural: plural,
      indiceDaColuna: indiceDaColuna, colunaDoIndice: colunaDoIndice, lerColuna: lerColuna,
      celula: celula, textoDe: textoDe, numeroDe: numeroDe, limitesDaAba: limitesDaAba,
      carregarXlsx: carregarXlsx, svg: svg, registrarErro: registrarErro,
      icones: { planilha: I_PLANILHA, upload: I_UPLOAD, x: I_X, ok: I_OK, aviso: I_AVISO, info: I_INFO, seta: I_SETA, voltar: I_VOLTAR },
    },
  };
})();

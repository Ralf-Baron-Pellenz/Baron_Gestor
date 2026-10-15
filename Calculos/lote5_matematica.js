// ═══════════════════════════════════════════════════════════════════
//  Bapell Gestor Pro — Central de Cálculos
//  LOTE 5: MATEMÁTICA, GEOMETRIA E ESTATÍSTICA
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
    console.error("[Calculos/lote5_matematica.js] Motor nao encontrado. " +
      "Verifique se JS/calculos.js e carregado ANTES deste arquivo no calculos.html.");
    return;
  }

  var campo = API.campo, val = API.val, brl = API.brl, pct = API.pct, num = API.num;

  API.registrar([
    // ---------- MATEMÁTICA ----------
    {
      id: "mat-porcentagem-de", cat: "Matemática", nome: "Quanto é X% de um Valor",
      desc: "Calcula a porcentagem de um número.",
      chaves: ["porcentagem", "percentual", "quanto e"],
      campos: [campo("mpd_pct", "Percentual", "percent"), campo("mpd_valor", "Valor", "number")],
      calc: function () {
        var r = val("mpd_valor") * val("mpd_pct") / 100;
        return { principal: { label: "Resultado", valor: num(r) },
          linhas: [{ label: "Valor original", valor: num(val("mpd_valor")) }, { label: "Restante", valor: num(val("mpd_valor") - r) }],
          resultadoBruto: r };
      },
      explica: "Resultado = Valor × Percentual ÷ 100.",
    },
    {
      id: "mat-qual-pct", cat: "Matemática", nome: "X é Quantos % de Y",
      desc: "Descobre que percentual um número representa de outro.",
      chaves: ["porcentagem", "representa", "proporção"],
      campos: [campo("mqp_parte", "Parte", "number"), campo("mqp_total", "Total", "number")],
      calc: function () {
        var t = val("mqp_total");
        if (t === 0) return { principal: { label: "Percentual", valor: "—" }, linhas: [], obs: "O total não pode ser zero.", resultadoBruto: 0 };
        var r = val("mqp_parte") / t * 100;
        return { principal: { label: "Percentual", valor: pct(r) }, linhas: [{ label: "Parte", valor: num(val("mqp_parte")) }, { label: "Total", valor: num(t) }], resultadoBruto: r };
      },
      explica: "Percentual = Parte ÷ Total × 100.",
    },
    {
      id: "mat-regra-tres-composta", cat: "Matemática", nome: "Regra de Três Composta",
      desc: "Proporção com duas grandezas relacionadas.",
      chaves: ["regra de tres", "proporção", "composta"],
      campos: [
        campo("r3c_a1", "Grandeza 1 — valor conhecido", "number"),
        campo("r3c_a2", "Grandeza 1 — valor procurado", "number"),
        campo("r3c_b1", "Grandeza 2 — valor conhecido", "number"),
        campo("r3c_b2", "Grandeza 2 — valor procurado", "number"),
        campo("r3c_res", "Resultado conhecido", "number"),
      ],
      calc: function () {
        var a1 = val("r3c_a1"), a2 = val("r3c_a2"), b1 = val("r3c_b1"), b2 = val("r3c_b2"), r = val("r3c_res");
        if (a1 === 0 || b1 === 0) return { principal: { label: "Resultado", valor: "—" }, linhas: [], obs: "Os valores conhecidos não podem ser zero.", resultadoBruto: 0 };
        var x = r * (a2 / a1) * (b2 / b1);
        return { principal: { label: "Resultado", valor: num(x) },
          linhas: [{ label: "Fator da grandeza 1", valor: num(a2 / a1, 4) }, { label: "Fator da grandeza 2", valor: num(b2 / b1, 4) }],
          obs: "Assume as duas grandezas diretamente proporcionais.", resultadoBruto: x };
      },
      explica: "x = Resultado × (A2 ÷ A1) × (B2 ÷ B1), para grandezas diretamente proporcionais.",
    },
    {
      id: "mat-media", cat: "Matemática", nome: "Média Simples",
      desc: "Média de até 6 valores.",
      chaves: ["media", "aritmética"],
      campos: [campo("md_1", "Valor 1", "number"), campo("md_2", "Valor 2", "number"), campo("md_3", "Valor 3", "number"),
               campo("md_4", "Valor 4 (opcional)", "number"), campo("md_5", "Valor 5 (opcional)", "number"), campo("md_6", "Valor 6 (opcional)", "number")],
      calc: function () {
        var ids = ["md_1", "md_2", "md_3", "md_4", "md_5", "md_6"], v = [];
        for (var i = 0; i < ids.length; i++) {
          var el = document.getElementById(ids[i]);
          if (el && String(el.value).trim() !== "") v.push(val(ids[i]));
        }
        if (!v.length) return { principal: { label: "Média", valor: "—" }, linhas: [], obs: "Informe ao menos um valor.", resultadoBruto: 0 };
        var soma = v.reduce(function (a, b) { return a + b; }, 0);
        return { principal: { label: "Média", valor: num(soma / v.length) },
          linhas: [{ label: "Valores informados", valor: num(v.length, 0) }, { label: "Soma", valor: num(soma) }],
          resultadoBruto: soma / v.length };
      },
      explica: "Média = Soma dos valores ÷ Quantidade de valores.",
    },
    {
      id: "mat-media-ponderada", cat: "Matemática", nome: "Média Ponderada",
      desc: "Média em que cada valor tem um peso.",
      chaves: ["media ponderada", "peso"],
      campos: [campo("mp_v1", "Valor 1", "number"), campo("mp_p1", "Peso 1", "number"),
               campo("mp_v2", "Valor 2", "number"), campo("mp_p2", "Peso 2", "number"),
               campo("mp_v3", "Valor 3", "number"), campo("mp_p3", "Peso 3", "number")],
      calc: function () {
        var soma = val("mp_v1") * val("mp_p1") + val("mp_v2") * val("mp_p2") + val("mp_v3") * val("mp_p3");
        var pesos = val("mp_p1") + val("mp_p2") + val("mp_p3");
        if (pesos === 0) return { principal: { label: "Média ponderada", valor: "—" }, linhas: [], obs: "A soma dos pesos não pode ser zero.", resultadoBruto: 0 };
        return { principal: { label: "Média ponderada", valor: num(soma / pesos) },
          linhas: [{ label: "Soma dos produtos", valor: num(soma) }, { label: "Soma dos pesos", valor: num(pesos) }],
          resultadoBruto: soma / pesos };
      },
      explica: "Média = Σ(Valor × Peso) ÷ Σ(Pesos).",
    },
    {
      id: "mat-potencia", cat: "Matemática", nome: "Potência",
      desc: "Base elevada a um expoente.",
      chaves: ["potencia", "elevado", "expoente"],
      campos: [campo("pot_base", "Base", "number"), campo("pot_exp", "Expoente", "number")],
      calc: function () {
        var r = Math.pow(val("pot_base"), val("pot_exp"));
        if (!isFinite(r)) return { principal: { label: "Resultado", valor: "—" }, linhas: [], obs: "Resultado fora do alcance de cálculo.", resultadoBruto: 0 };
        return { principal: { label: "Resultado", valor: num(r, 4) }, linhas: [], resultadoBruto: r };
      },
      explica: "Resultado = Base ^ Expoente.",
    },
    {
      id: "mat-raiz", cat: "Matemática", nome: "Raiz Quadrada e Cúbica",
      desc: "Raízes de um número.",
      chaves: ["raiz", "quadrada", "cubica"],
      campos: [campo("rz_n", "Número", "number")],
      calc: function () {
        var n = val("rz_n");
        var q = n >= 0 ? Math.sqrt(n) : null;
        var c = Math.cbrt(n);
        return { principal: { label: "Raiz quadrada", valor: q === null ? "—" : num(q, 4) },
          linhas: [{ label: "Raiz cúbica", valor: num(c, 4) }],
          obs: n < 0 ? "Raiz quadrada de número negativo não existe nos reais. A cúbica existe." : null,
          resultadoBruto: q === null ? 0 : q };
      },
      explica: "Raiz quadrada = √n. Raiz cúbica = ∛n (aceita negativos).",
    },
    {
      id: "mat-eq-primeiro-grau", cat: "Matemática", nome: "Equação do 1º Grau",
      desc: "Resolve ax + b = 0.",
      chaves: ["equação", "primeiro grau", "incógnita"],
      campos: [campo("e1_a", "Coeficiente a", "number"), campo("e1_b", "Coeficiente b", "number")],
      calc: function () {
        var a = val("e1_a"), b = val("e1_b");
        if (a === 0) return { principal: { label: "x", valor: "—" }, linhas: [], obs: b === 0 ? "Infinitas soluções (0 = 0)." : "Sem solução: 'a' não pode ser zero.", resultadoBruto: 0 };
        var x = -b / a;
        return { principal: { label: "x", valor: num(x, 4) }, linhas: [{ label: "Verificação (a·x + b)", valor: num(a * x + b, 4) }], resultadoBruto: x };
      },
      explica: "De ax + b = 0, temos x = −b ÷ a.",
    },
    {
      id: "mat-bhaskara", cat: "Matemática", nome: "Equação do 2º Grau (Bhaskara)",
      desc: "Resolve ax² + bx + c = 0.",
      chaves: ["bhaskara", "segundo grau", "delta", "discriminante", "raizes"],
      campos: [campo("bk_a", "Coeficiente a", "number"), campo("bk_b", "Coeficiente b", "number"), campo("bk_c", "Coeficiente c", "number")],
      calc: function () {
        var a = val("bk_a"), b = val("bk_b"), c = val("bk_c");
        if (a === 0) return { principal: { label: "Raízes", valor: "—" }, linhas: [], obs: "Com a = 0 não é equação do 2º grau. Use a de 1º grau.", resultadoBruto: 0 };
        var d = b * b - 4 * a * c;
        if (d < 0) return { principal: { label: "Raízes", valor: "Nenhuma real" }, linhas: [{ label: "Delta", valor: num(d, 4) }], obs: "Delta negativo: não há raízes reais.", resultadoBruto: d };
        var x1 = (-b + Math.sqrt(d)) / (2 * a), x2 = (-b - Math.sqrt(d)) / (2 * a);
        return { principal: { label: "x₁", valor: num(x1, 4) },
          linhas: [{ label: "x₂", valor: num(x2, 4) }, { label: "Delta", valor: num(d, 4) },
                   { label: "Tipo", valor: d === 0 ? "Raiz única (dupla)" : "Duas raízes distintas" }],
          resultadoBruto: x1 };
      },
      explica: "Delta = b² − 4ac. x = (−b ± √Delta) ÷ 2a.",
    },
    {
      id: "mat-mmc-mdc", cat: "Matemática", nome: "MMC e MDC",
      desc: "Mínimo múltiplo comum e máximo divisor comum.",
      chaves: ["mmc", "mdc", "multiplo", "divisor"],
      campos: [campo("mm_a", "Número 1", "integer"), campo("mm_b", "Número 2", "integer")],
      calc: function () {
        var a = Math.abs(Math.round(val("mm_a"))), b = Math.abs(Math.round(val("mm_b")));
        if (a === 0 || b === 0) return { principal: { label: "MDC", valor: "—" }, linhas: [], obs: "Informe dois números inteiros diferentes de zero.", resultadoBruto: 0 };
        function mdc(x, y) { while (y) { var t = y; y = x % y; x = t; } return x; }
        var d = mdc(a, b), m = a / d * b;
        return { principal: { label: "MDC", valor: num(d, 0) },
          linhas: [{ label: "MMC", valor: num(m, 0) }, { label: "Números", valor: num(a, 0) + " e " + num(b, 0) }],
          resultadoBruto: d };
      },
      explica: "MDC pelo algoritmo de Euclides. MMC = (a × b) ÷ MDC.",
    },
    {
      id: "mat-arredondar", cat: "Matemática", nome: "Arredondar e Truncar",
      desc: "Arredonda ou corta casas decimais.",
      chaves: ["arredondar", "truncar", "casas decimais"],
      campos: [campo("ar_n", "Número", "number"), campo("ar_casas", "Casas decimais", "integer")],
      calc: function () {
        var n = val("ar_n"), c = Math.max(0, Math.min(10, Math.round(val("ar_casas"))));
        var f = Math.pow(10, c);
        var arred = Math.round(n * f) / f;
        var trunc = (n < 0 ? Math.ceil(n * f) : Math.floor(n * f)) / f;
        return { principal: { label: "Arredondado", valor: num(arred, c) },
          linhas: [{ label: "Truncado", valor: num(trunc, c) }, { label: "Para cima", valor: num(Math.ceil(n * f) / f, c) }, { label: "Para baixo", valor: num(Math.floor(n * f) / f, c) }],
          resultadoBruto: arred };
      },
      explica: "Arredondar segue a regra do 0,5. Truncar simplesmente corta as casas excedentes.",
    },
    // ---------- GEOMETRIA ----------
    {
      id: "geo-area-retangulo", cat: "Geometria", nome: "Área e Perímetro do Retângulo",
      desc: "Retângulo e quadrado (lados iguais).",
      chaves: ["area", "perimetro", "retangulo", "quadrado"],
      campos: [campo("gar_b", "Base", "number"), campo("gar_h", "Altura", "number")],
      calc: function () {
        var b = val("gar_b"), h = val("gar_h");
        return { principal: { label: "Área", valor: num(b * h) },
          linhas: [{ label: "Perímetro", valor: num(2 * (b + h)) }, { label: "Diagonal", valor: num(Math.sqrt(b * b + h * h), 4) }],
          resultadoBruto: b * h };
      },
      explica: "Área = Base × Altura. Perímetro = 2 × (Base + Altura). Diagonal = √(b² + h²).",
    },
    {
      id: "geo-area-triangulo", cat: "Geometria", nome: "Área do Triângulo",
      desc: "A partir da base e da altura.",
      chaves: ["area", "triangulo"],
      campos: [campo("gat_b", "Base", "number"), campo("gat_h", "Altura", "number")],
      calc: function () {
        var r = val("gat_b") * val("gat_h") / 2;
        return { principal: { label: "Área", valor: num(r) }, linhas: [], resultadoBruto: r };
      },
      explica: "Área = (Base × Altura) ÷ 2.",
    },
    {
      id: "geo-circulo", cat: "Geometria", nome: "Círculo — Área e Circunferência",
      desc: "A partir do raio.",
      chaves: ["circulo", "area", "circunferencia", "raio", "pi"],
      campos: [campo("gc_r", "Raio", "number")],
      calc: function () {
        var r = val("gc_r");
        return { principal: { label: "Área", valor: num(Math.PI * r * r, 4) },
          linhas: [{ label: "Circunferência", valor: num(2 * Math.PI * r, 4) }, { label: "Diâmetro", valor: num(2 * r) }],
          resultadoBruto: Math.PI * r * r };
      },
      explica: "Área = π × r². Circunferência = 2 × π × r.",
    },
    {
      id: "geo-trapezio", cat: "Geometria", nome: "Área do Trapézio",
      desc: "A partir das duas bases e da altura.",
      chaves: ["trapezio", "area"],
      campos: [campo("gt_B", "Base maior", "number"), campo("gt_b", "Base menor", "number"), campo("gt_h", "Altura", "number")],
      calc: function () {
        var r = (val("gt_B") + val("gt_b")) * val("gt_h") / 2;
        return { principal: { label: "Área", valor: num(r) }, linhas: [], resultadoBruto: r };
      },
      explica: "Área = (Base maior + Base menor) × Altura ÷ 2.",
    },
    {
      id: "geo-volume-caixa", cat: "Geometria", nome: "Volume do Paralelepípedo",
      desc: "Caixa retangular e cubo.",
      chaves: ["volume", "caixa", "cubo", "paralelepipedo"],
      campos: [campo("gvc_c", "Comprimento", "number"), campo("gvc_l", "Largura", "number"), campo("gvc_a", "Altura", "number")],
      calc: function () {
        var c = val("gvc_c"), l = val("gvc_l"), a = val("gvc_a");
        var v = c * l * a;
        return { principal: { label: "Volume", valor: num(v) },
          linhas: [{ label: "Área da superfície", valor: num(2 * (c * l + c * a + l * a)) }],
          obs: "Em centímetros, o volume sai em cm³. Divida por 1.000.000 para m³.",
          resultadoBruto: v };
      },
      explica: "Volume = Comprimento × Largura × Altura.",
    },
    {
      id: "geo-volume-cilindro", cat: "Geometria", nome: "Volume do Cilindro",
      desc: "A partir do raio e da altura.",
      chaves: ["volume", "cilindro"],
      campos: [campo("gvl_r", "Raio da base", "number"), campo("gvl_h", "Altura", "number")],
      calc: function () {
        var v = Math.PI * Math.pow(val("gvl_r"), 2) * val("gvl_h");
        return { principal: { label: "Volume", valor: num(v, 4) }, linhas: [], resultadoBruto: v };
      },
      explica: "Volume = π × r² × Altura.",
    },
    {
      id: "geo-volume-esfera-cone", cat: "Geometria", nome: "Volume da Esfera e do Cone",
      desc: "Dois sólidos a partir do raio.",
      chaves: ["volume", "esfera", "cone"],
      campos: [campo("gve_r", "Raio", "number"), campo("gve_h", "Altura (para o cone)", "number")],
      calc: function () {
        var r = val("gve_r"), h = val("gve_h");
        var esfera = (4 / 3) * Math.PI * Math.pow(r, 3);
        var cone = (1 / 3) * Math.PI * r * r * h;
        return { principal: { label: "Volume da esfera", valor: num(esfera, 4) },
          linhas: [{ label: "Volume do cone", valor: num(cone, 4) }],
          resultadoBruto: esfera };
      },
      explica: "Esfera = (4 ÷ 3) × π × r³. Cone = (1 ÷ 3) × π × r² × Altura.",
    },
    {
      id: "geo-pitagoras", cat: "Geometria", nome: "Teorema de Pitágoras",
      desc: "Hipotenusa ou cateto de um triângulo retângulo.",
      chaves: ["pitagoras", "hipotenusa", "cateto", "triangulo retangulo"],
      campos: [campo("gp_a", "Cateto A", "number"), campo("gp_b", "Cateto B", "number")],
      calc: function () {
        var a = val("gp_a"), b = val("gp_b");
        var h = Math.sqrt(a * a + b * b);
        return { principal: { label: "Hipotenusa", valor: num(h, 4) },
          linhas: [{ label: "Área do triângulo", valor: num(a * b / 2, 4) }, { label: "Perímetro", valor: num(a + b + h, 4) }],
          resultadoBruto: h };
      },
      explica: "Hipotenusa = √(A² + B²).",
    },
    // ---------- ESTATÍSTICA ----------
    {
      id: "est-mediana-moda", cat: "Estatística", nome: "Mediana, Moda e Amplitude",
      desc: "Analisa uma lista de até 8 valores.",
      chaves: ["mediana", "moda", "amplitude", "estatistica"],
      campos: [campo("emm_1", "Valor 1", "number"), campo("emm_2", "Valor 2", "number"), campo("emm_3", "Valor 3", "number"), campo("emm_4", "Valor 4", "number"),
               campo("emm_5", "Valor 5 (opcional)", "number"), campo("emm_6", "Valor 6 (opcional)", "number"), campo("emm_7", "Valor 7 (opcional)", "number"), campo("emm_8", "Valor 8 (opcional)", "number")],
      calc: function () {
        var v = [];
        for (var i = 1; i <= 8; i++) {
          var el = document.getElementById("emm_" + i);
          if (el && String(el.value).trim() !== "") v.push(val("emm_" + i));
        }
        if (!v.length) return { principal: { label: "Mediana", valor: "—" }, linhas: [], obs: "Informe ao menos um valor.", resultadoBruto: 0 };
        var ord = v.slice().sort(function (a, b) { return a - b; });
        var meio = Math.floor(ord.length / 2);
        var mediana = ord.length % 2 ? ord[meio] : (ord[meio - 1] + ord[meio]) / 2;
        var cont = {}, moda = null, maxC = 0;
        ord.forEach(function (x) { cont[x] = (cont[x] || 0) + 1; if (cont[x] > maxC) { maxC = cont[x]; moda = x; } });
        var soma = ord.reduce(function (a, b) { return a + b; }, 0);
        return { principal: { label: "Mediana", valor: num(mediana) },
          linhas: [{ label: "Média", valor: num(soma / ord.length) },
                   { label: "Moda", valor: maxC > 1 ? num(moda) : "sem moda" },
                   { label: "Amplitude", valor: num(ord[ord.length - 1] - ord[0]) },
                   { label: "Menor / Maior", valor: num(ord[0]) + " / " + num(ord[ord.length - 1]) }],
          resultadoBruto: mediana };
      },
      explica: "Mediana é o valor central da lista ordenada. Moda é o mais repetido. Amplitude = Maior − Menor.",
    },
    {
      id: "est-desvio-padrao", cat: "Estatística", nome: "Variância e Desvio Padrão",
      desc: "Dispersão de até 6 valores.",
      chaves: ["desvio padrao", "variancia", "dispersao"],
      campos: [campo("edp_1", "Valor 1", "number"), campo("edp_2", "Valor 2", "number"), campo("edp_3", "Valor 3", "number"),
               campo("edp_4", "Valor 4 (opcional)", "number"), campo("edp_5", "Valor 5 (opcional)", "number"), campo("edp_6", "Valor 6 (opcional)", "number")],
      calc: function () {
        var v = [];
        for (var i = 1; i <= 6; i++) {
          var el = document.getElementById("edp_" + i);
          if (el && String(el.value).trim() !== "") v.push(val("edp_" + i));
        }
        if (v.length < 2) return { principal: { label: "Desvio padrão", valor: "—" }, linhas: [], obs: "Informe ao menos dois valores.", resultadoBruto: 0 };
        var media = v.reduce(function (a, b) { return a + b; }, 0) / v.length;
        var somaQ = v.reduce(function (a, b) { return a + Math.pow(b - media, 2); }, 0);
        var varPop = somaQ / v.length, varAm = somaQ / (v.length - 1);
        return { principal: { label: "Desvio padrão (amostral)", valor: num(Math.sqrt(varAm), 4) },
          linhas: [{ label: "Desvio padrão (populacional)", valor: num(Math.sqrt(varPop), 4) },
                   { label: "Variância amostral", valor: num(varAm, 4) },
                   { label: "Média", valor: num(media) }],
          obs: "Use o amostral quando os valores são uma amostra; o populacional quando são o conjunto inteiro.",
          resultadoBruto: Math.sqrt(varAm) };
      },
      explica: "Variância = Σ(x − média)² ÷ n (populacional) ou ÷ (n−1) (amostral). Desvio padrão = √Variância.",
    },
    {
      id: "est-taxa-crescimento", cat: "Estatística", nome: "Taxa de Crescimento entre Períodos",
      desc: "Compara dois períodos e projeta a média.",
      chaves: ["crescimento", "comparar periodos", "variação", "evolução"],
      campos: [campo("etc_ini", "Valor no período inicial", "number"), campo("etc_fim", "Valor no período final", "number"), campo("etc_per", "Quantidade de períodos", "integer")],
      calc: function () {
        var a = val("etc_ini"), b = val("etc_fim"), n = Math.max(1, Math.round(val("etc_per")));
        if (a === 0) return { principal: { label: "Crescimento", valor: "—" }, linhas: [], obs: "O valor inicial não pode ser zero.", resultadoBruto: 0 };
        var total = (b - a) / a * 100;
        var medio = (Math.pow(b / a, 1 / n) - 1) * 100;
        return { principal: { label: "Crescimento total", valor: pct(total) },
          linhas: [{ label: "Crescimento médio por período", valor: isFinite(medio) ? pct(medio) : "—" },
                   { label: "Diferença absoluta", valor: num(b - a) }],
          resultadoBruto: total };
      },
      explica: "Total = (Final − Inicial) ÷ Inicial × 100. Médio = ((Final ÷ Inicial)^(1÷n) − 1) × 100.",
    },
  ]);
})();

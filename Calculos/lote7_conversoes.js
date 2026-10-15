// ═══════════════════════════════════════════════════════════════════
//  Bapell Gestor Pro — Central de Cálculos
//  LOTE 7: CONVERSÕES DE UNIDADES
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
    console.error("[Calculos/lote7_conversoes.js] Motor nao encontrado. " +
      "Verifique se JS/calculos.js e carregado ANTES deste arquivo no calculos.html.");
    return;
  }

  var campo = API.campo, val = API.val, brl = API.brl, pct = API.pct, num = API.num;

  API.registrar([
    // ───────── CONVERSOR UNIVERSAL ─────────
    // Uma calculadora por GRANDEZA, com origem e destino escolhidos pelo
    // usuário. Isso evita centenas de calculadoras quase iguais ("cm → pol",
    // "pol → cm", "cm → m"...) e cobre TODOS os sentidos de conversão.
    //
    // Cada unidade guarda seu fator para a unidade base do grupo. Converter é
    // sempre: valor × fator(origem) ÷ fator(destino). Como o fator nunca é
    // zero, não há divisão por zero possível aqui.
    {
      id: "conv-comprimento", cat: "Conversões", nome: "Converter Comprimento",
      desc: "Converta entre: 1=Milímetro, 2=Centímetro, 3=Metro, 4=Quilômetro, 5=Polegada, 6=Pé, 7=Jarda, 8=Milha, 9=Milha náutica.",
      chaves: ["milímetro", "centímetro", "metro", "quilômetro", "polegada", "pé", "jarda", "milha", "milha náutica", "conversão", "converter"],
      campos: [
        campo("cvcomprimento_v", "Valor", "number"),
        campo("cvcomprimento_de", "De (1 a 9)", "integer"),
        campo("cvcomprimento_para", "Para (1 a 9)", "integer"),
      ],
      calc: function () {
        var U = [{ s: "mm", n: "Milímetro", f: 0.001 }, { s: "cm", n: "Centímetro", f: 0.01 }, { s: "m", n: "Metro", f: 1 }, { s: "km", n: "Quilômetro", f: 1000 }, { s: "pol", n: "Polegada", f: 0.0254 }, { s: "pe", n: "Pé", f: 0.3048 }, { s: "jarda", n: "Jarda", f: 0.9144 }, { s: "milha", n: "Milha", f: 1609.344 }, { s: "nmi", n: "Milha náutica", f: 1852 }];
        var v = val("cvcomprimento_v");
        var de = Math.round(val("cvcomprimento_de")), para = Math.round(val("cvcomprimento_para"));
        if (de < 1 || de > U.length || para < 1 || para > U.length) {
          return {
            principal: { label: "Resultado", valor: "—" },
            linhas: U.map(function (u, i) { return { label: String(i + 1), valor: u.n }; }),
            obs: "Escolha os números das unidades de origem e destino, conforme a lista acima.",
            resultadoBruto: 0,
          };
        }
        var a = U[de - 1], b = U[para - 1];
        var r = v * a.f / b.f;
        return {
          principal: { label: a.n + " → " + b.n, valor: num(r, 6) + " " + b.s },
          linhas: [
            { label: "Valor original", valor: num(v, 6) + " " + a.s },
            { label: "Unidade base", valor: num(v * a.f, 6) + " (metro)" },
            { label: "Fator aplicado", valor: num(a.f / b.f, 8) },
          ],
          resultadoBruto: r,
        };
      },
      explica: "Cada unidade tem um fator em relação ao metro. Resultado = Valor × fator da origem ÷ fator do destino.",
    },
    {
      id: "conv-peso", cat: "Conversões", nome: "Converter Peso",
      desc: "Converta entre: 1=Miligrama, 2=Grama, 3=Quilograma, 4=Tonelada, 5=Libra, 6=Onça.",
      chaves: ["miligrama", "grama", "quilograma", "tonelada", "libra", "onça", "conversão", "converter"],
      campos: [
        campo("cvpeso_v", "Valor", "number"),
        campo("cvpeso_de", "De (1 a 6)", "integer"),
        campo("cvpeso_para", "Para (1 a 6)", "integer"),
      ],
      calc: function () {
        var U = [{ s: "mg", n: "Miligrama", f: 0.000001 }, { s: "g", n: "Grama", f: 0.001 }, { s: "kg", n: "Quilograma", f: 1 }, { s: "t", n: "Tonelada", f: 1000 }, { s: "lb", n: "Libra", f: 0.45359237 }, { s: "oz", n: "Onça", f: 0.028349523125 }];
        var v = val("cvpeso_v");
        var de = Math.round(val("cvpeso_de")), para = Math.round(val("cvpeso_para"));
        if (de < 1 || de > U.length || para < 1 || para > U.length) {
          return {
            principal: { label: "Resultado", valor: "—" },
            linhas: U.map(function (u, i) { return { label: String(i + 1), valor: u.n }; }),
            obs: "Escolha os números das unidades de origem e destino, conforme a lista acima.",
            resultadoBruto: 0,
          };
        }
        var a = U[de - 1], b = U[para - 1];
        var r = v * a.f / b.f;
        return {
          principal: { label: a.n + " → " + b.n, valor: num(r, 6) + " " + b.s },
          linhas: [
            { label: "Valor original", valor: num(v, 6) + " " + a.s },
            { label: "Unidade base", valor: num(v * a.f, 6) + " (quilograma)" },
            { label: "Fator aplicado", valor: num(a.f / b.f, 8) },
          ],
          resultadoBruto: r,
        };
      },
      explica: "Cada unidade tem um fator em relação ao quilograma. Resultado = Valor × fator da origem ÷ fator do destino.",
    },
    {
      id: "conv-area", cat: "Conversões", nome: "Converter Área",
      desc: "Converta entre: 1=Milímetro quadrado, 2=Centímetro quadrado, 3=Metro quadrado, 4=Quilômetro quadrado, 5=Hectare, 6=Acre.",
      chaves: ["milímetro quadrado", "centímetro quadrado", "metro quadrado", "quilômetro quadrado", "hectare", "acre", "conversão", "converter"],
      campos: [
        campo("cvarea_v", "Valor", "number"),
        campo("cvarea_de", "De (1 a 6)", "integer"),
        campo("cvarea_para", "Para (1 a 6)", "integer"),
      ],
      calc: function () {
        var U = [{ s: "mm2", n: "Milímetro quadrado", f: 0.000001 }, { s: "cm2", n: "Centímetro quadrado", f: 0.0001 }, { s: "m2", n: "Metro quadrado", f: 1 }, { s: "km2", n: "Quilômetro quadrado", f: 1000000 }, { s: "ha", n: "Hectare", f: 10000 }, { s: "acre", n: "Acre", f: 4046.8564224 }];
        var v = val("cvarea_v");
        var de = Math.round(val("cvarea_de")), para = Math.round(val("cvarea_para"));
        if (de < 1 || de > U.length || para < 1 || para > U.length) {
          return {
            principal: { label: "Resultado", valor: "—" },
            linhas: U.map(function (u, i) { return { label: String(i + 1), valor: u.n }; }),
            obs: "Escolha os números das unidades de origem e destino, conforme a lista acima.",
            resultadoBruto: 0,
          };
        }
        var a = U[de - 1], b = U[para - 1];
        var r = v * a.f / b.f;
        return {
          principal: { label: a.n + " → " + b.n, valor: num(r, 6) + " " + b.s },
          linhas: [
            { label: "Valor original", valor: num(v, 6) + " " + a.s },
            { label: "Unidade base", valor: num(v * a.f, 6) + " (metro quadrado)" },
            { label: "Fator aplicado", valor: num(a.f / b.f, 8) },
          ],
          resultadoBruto: r,
        };
      },
      explica: "Cada unidade tem um fator em relação ao metro quadrado. Resultado = Valor × fator da origem ÷ fator do destino.",
    },
    {
      id: "conv-volume", cat: "Conversões", nome: "Converter Volume",
      desc: "Converta entre: 1=Mililitro, 2=Litro, 3=Metro cúbico, 4=Centímetro cúbico, 5=Galão (US), 6=Quart (US), 7=Pint (US), 8=Xícara (US).",
      chaves: ["mililitro", "litro", "metro cúbico", "centímetro cúbico", "galão (us)", "quart (us)", "pint (us)", "xícara (us)", "conversão", "converter"],
      campos: [
        campo("cvvolume_v", "Valor", "number"),
        campo("cvvolume_de", "De (1 a 8)", "integer"),
        campo("cvvolume_para", "Para (1 a 8)", "integer"),
      ],
      calc: function () {
        var U = [{ s: "ml", n: "Mililitro", f: 0.001 }, { s: "l", n: "Litro", f: 1 }, { s: "m3", n: "Metro cúbico", f: 1000 }, { s: "cm3", n: "Centímetro cúbico", f: 0.001 }, { s: "galao", n: "Galão (US)", f: 3.785411784 }, { s: "quart", n: "Quart (US)", f: 0.946352946 }, { s: "pint", n: "Pint (US)", f: 0.473176473 }, { s: "xicara", n: "Xícara (US)", f: 0.2365882365 }];
        var v = val("cvvolume_v");
        var de = Math.round(val("cvvolume_de")), para = Math.round(val("cvvolume_para"));
        if (de < 1 || de > U.length || para < 1 || para > U.length) {
          return {
            principal: { label: "Resultado", valor: "—" },
            linhas: U.map(function (u, i) { return { label: String(i + 1), valor: u.n }; }),
            obs: "Escolha os números das unidades de origem e destino, conforme a lista acima.",
            resultadoBruto: 0,
          };
        }
        var a = U[de - 1], b = U[para - 1];
        var r = v * a.f / b.f;
        return {
          principal: { label: a.n + " → " + b.n, valor: num(r, 6) + " " + b.s },
          linhas: [
            { label: "Valor original", valor: num(v, 6) + " " + a.s },
            { label: "Unidade base", valor: num(v * a.f, 6) + " (litro)" },
            { label: "Fator aplicado", valor: num(a.f / b.f, 8) },
          ],
          resultadoBruto: r,
        };
      },
      explica: "Cada unidade tem um fator em relação ao litro. Resultado = Valor × fator da origem ÷ fator do destino.",
    },
    {
      id: "conv-tempo", cat: "Conversões", nome: "Converter Tempo",
      desc: "Converta entre: 1=Segundo, 2=Minuto, 3=Hora, 4=Dia, 5=Semana, 6=Mês (30 dias), 7=Ano (365 dias).",
      chaves: ["segundo", "minuto", "hora", "dia", "semana", "mês (30 dias)", "ano (365 dias)", "conversão", "converter"],
      campos: [
        campo("cvtempo_v", "Valor", "number"),
        campo("cvtempo_de", "De (1 a 7)", "integer"),
        campo("cvtempo_para", "Para (1 a 7)", "integer"),
      ],
      calc: function () {
        var U = [{ s: "seg", n: "Segundo", f: 1 }, { s: "min", n: "Minuto", f: 60 }, { s: "hora", n: "Hora", f: 3600 }, { s: "dia", n: "Dia", f: 86400 }, { s: "semana", n: "Semana", f: 604800 }, { s: "mes", n: "Mês (30 dias)", f: 2592000 }, { s: "ano", n: "Ano (365 dias)", f: 31536000 }];
        var v = val("cvtempo_v");
        var de = Math.round(val("cvtempo_de")), para = Math.round(val("cvtempo_para"));
        if (de < 1 || de > U.length || para < 1 || para > U.length) {
          return {
            principal: { label: "Resultado", valor: "—" },
            linhas: U.map(function (u, i) { return { label: String(i + 1), valor: u.n }; }),
            obs: "Escolha os números das unidades de origem e destino, conforme a lista acima.",
            resultadoBruto: 0,
          };
        }
        var a = U[de - 1], b = U[para - 1];
        var r = v * a.f / b.f;
        return {
          principal: { label: a.n + " → " + b.n, valor: num(r, 6) + " " + b.s },
          linhas: [
            { label: "Valor original", valor: num(v, 6) + " " + a.s },
            { label: "Unidade base", valor: num(v * a.f, 6) + " (segundo)" },
            { label: "Fator aplicado", valor: num(a.f / b.f, 8) },
          ],
          resultadoBruto: r,
        };
      },
      explica: "Cada unidade tem um fator em relação ao segundo. Resultado = Valor × fator da origem ÷ fator do destino.",
    },
    {
      id: "conv-velocidade", cat: "Conversões", nome: "Converter Velocidade",
      desc: "Converta entre: 1=Metro por segundo, 2=Quilômetro por hora, 3=Milha por hora, 4=Nó.",
      chaves: ["metro por segundo", "quilômetro por hora", "milha por hora", "nó", "conversão", "converter"],
      campos: [
        campo("cvvelocidade_v", "Valor", "number"),
        campo("cvvelocidade_de", "De (1 a 4)", "integer"),
        campo("cvvelocidade_para", "Para (1 a 4)", "integer"),
      ],
      calc: function () {
        var U = [{ s: "ms", n: "Metro por segundo", f: 1 }, { s: "kmh", n: "Quilômetro por hora", f: 0.2777777777777778 }, { s: "mph", n: "Milha por hora", f: 0.44704 }, { s: "no", n: "Nó", f: 0.5144444444444445 }];
        var v = val("cvvelocidade_v");
        var de = Math.round(val("cvvelocidade_de")), para = Math.round(val("cvvelocidade_para"));
        if (de < 1 || de > U.length || para < 1 || para > U.length) {
          return {
            principal: { label: "Resultado", valor: "—" },
            linhas: U.map(function (u, i) { return { label: String(i + 1), valor: u.n }; }),
            obs: "Escolha os números das unidades de origem e destino, conforme a lista acima.",
            resultadoBruto: 0,
          };
        }
        var a = U[de - 1], b = U[para - 1];
        var r = v * a.f / b.f;
        return {
          principal: { label: a.n + " → " + b.n, valor: num(r, 6) + " " + b.s },
          linhas: [
            { label: "Valor original", valor: num(v, 6) + " " + a.s },
            { label: "Unidade base", valor: num(v * a.f, 6) + " (metro por segundo)" },
            { label: "Fator aplicado", valor: num(a.f / b.f, 8) },
          ],
          resultadoBruto: r,
        };
      },
      explica: "Cada unidade tem um fator em relação ao metro por segundo. Resultado = Valor × fator da origem ÷ fator do destino.",
    },
    {
      id: "conv-energia", cat: "Conversões", nome: "Converter Energia",
      desc: "Converta entre: 1=Joule, 2=Quilojoule, 3=Quilowatt-hora, 4=Caloria, 5=Quilocaloria.",
      chaves: ["joule", "quilojoule", "quilowatt-hora", "caloria", "quilocaloria", "conversão", "converter"],
      campos: [
        campo("cvenergia_v", "Valor", "number"),
        campo("cvenergia_de", "De (1 a 5)", "integer"),
        campo("cvenergia_para", "Para (1 a 5)", "integer"),
      ],
      calc: function () {
        var U = [{ s: "j", n: "Joule", f: 1 }, { s: "kj", n: "Quilojoule", f: 1000 }, { s: "kwh", n: "Quilowatt-hora", f: 3600000 }, { s: "cal", n: "Caloria", f: 4.184 }, { s: "kcal", n: "Quilocaloria", f: 4184 }];
        var v = val("cvenergia_v");
        var de = Math.round(val("cvenergia_de")), para = Math.round(val("cvenergia_para"));
        if (de < 1 || de > U.length || para < 1 || para > U.length) {
          return {
            principal: { label: "Resultado", valor: "—" },
            linhas: U.map(function (u, i) { return { label: String(i + 1), valor: u.n }; }),
            obs: "Escolha os números das unidades de origem e destino, conforme a lista acima.",
            resultadoBruto: 0,
          };
        }
        var a = U[de - 1], b = U[para - 1];
        var r = v * a.f / b.f;
        return {
          principal: { label: a.n + " → " + b.n, valor: num(r, 6) + " " + b.s },
          linhas: [
            { label: "Valor original", valor: num(v, 6) + " " + a.s },
            { label: "Unidade base", valor: num(v * a.f, 6) + " (joule)" },
            { label: "Fator aplicado", valor: num(a.f / b.f, 8) },
          ],
          resultadoBruto: r,
        };
      },
      explica: "Cada unidade tem um fator em relação ao joule. Resultado = Valor × fator da origem ÷ fator do destino.",
    },
    {
      id: "conv-pressao", cat: "Conversões", nome: "Converter Pressão",
      desc: "Converta entre: 1=Pascal, 2=Quilopascal, 3=Bar, 4=PSI, 5=Atmosfera.",
      chaves: ["pascal", "quilopascal", "bar", "psi", "atmosfera", "conversão", "converter"],
      campos: [
        campo("cvpressao_v", "Valor", "number"),
        campo("cvpressao_de", "De (1 a 5)", "integer"),
        campo("cvpressao_para", "Para (1 a 5)", "integer"),
      ],
      calc: function () {
        var U = [{ s: "pa", n: "Pascal", f: 1 }, { s: "kpa", n: "Quilopascal", f: 1000 }, { s: "bar", n: "Bar", f: 100000 }, { s: "psi", n: "PSI", f: 6894.757293168361 }, { s: "atm", n: "Atmosfera", f: 101325 }];
        var v = val("cvpressao_v");
        var de = Math.round(val("cvpressao_de")), para = Math.round(val("cvpressao_para"));
        if (de < 1 || de > U.length || para < 1 || para > U.length) {
          return {
            principal: { label: "Resultado", valor: "—" },
            linhas: U.map(function (u, i) { return { label: String(i + 1), valor: u.n }; }),
            obs: "Escolha os números das unidades de origem e destino, conforme a lista acima.",
            resultadoBruto: 0,
          };
        }
        var a = U[de - 1], b = U[para - 1];
        var r = v * a.f / b.f;
        return {
          principal: { label: a.n + " → " + b.n, valor: num(r, 6) + " " + b.s },
          linhas: [
            { label: "Valor original", valor: num(v, 6) + " " + a.s },
            { label: "Unidade base", valor: num(v * a.f, 6) + " (pascal)" },
            { label: "Fator aplicado", valor: num(a.f / b.f, 8) },
          ],
          resultadoBruto: r,
        };
      },
      explica: "Cada unidade tem um fator em relação ao pascal. Resultado = Valor × fator da origem ÷ fator do destino.",
    },
    {
      id: "conv-potencia", cat: "Conversões", nome: "Converter Potência",
      desc: "Converta entre: 1=Watt, 2=Quilowatt, 3=HP (mecânico), 4=CV (métrico).",
      chaves: ["watt", "quilowatt", "hp (mecânico)", "cv (métrico)", "conversão", "converter"],
      campos: [
        campo("cvpotencia_v", "Valor", "number"),
        campo("cvpotencia_de", "De (1 a 4)", "integer"),
        campo("cvpotencia_para", "Para (1 a 4)", "integer"),
      ],
      calc: function () {
        var U = [{ s: "w", n: "Watt", f: 1 }, { s: "kw", n: "Quilowatt", f: 1000 }, { s: "hp", n: "HP (mecânico)", f: 745.6998715822702 }, { s: "cv", n: "CV (métrico)", f: 735.49875 }];
        var v = val("cvpotencia_v");
        var de = Math.round(val("cvpotencia_de")), para = Math.round(val("cvpotencia_para"));
        if (de < 1 || de > U.length || para < 1 || para > U.length) {
          return {
            principal: { label: "Resultado", valor: "—" },
            linhas: U.map(function (u, i) { return { label: String(i + 1), valor: u.n }; }),
            obs: "Escolha os números das unidades de origem e destino, conforme a lista acima.",
            resultadoBruto: 0,
          };
        }
        var a = U[de - 1], b = U[para - 1];
        var r = v * a.f / b.f;
        return {
          principal: { label: a.n + " → " + b.n, valor: num(r, 6) + " " + b.s },
          linhas: [
            { label: "Valor original", valor: num(v, 6) + " " + a.s },
            { label: "Unidade base", valor: num(v * a.f, 6) + " (watt)" },
            { label: "Fator aplicado", valor: num(a.f / b.f, 8) },
          ],
          resultadoBruto: r,
        };
      },
      explica: "Cada unidade tem um fator em relação ao watt. Resultado = Valor × fator da origem ÷ fator do destino.",
    },
    {
      id: "conv-dados", cat: "Conversões", nome: "Converter Dados",
      desc: "Converta entre: 1=Bit, 2=Byte, 3=Kilobyte (1024), 4=Megabyte, 5=Gigabyte, 6=Terabyte.",
      chaves: ["bit", "byte", "kilobyte (1024)", "megabyte", "gigabyte", "terabyte", "conversão", "converter"],
      campos: [
        campo("cvdados_v", "Valor", "number"),
        campo("cvdados_de", "De (1 a 6)", "integer"),
        campo("cvdados_para", "Para (1 a 6)", "integer"),
      ],
      calc: function () {
        var U = [{ s: "bit", n: "Bit", f: 0.125 }, { s: "byte", n: "Byte", f: 1 }, { s: "kb", n: "Kilobyte (1024)", f: 1024 }, { s: "mb", n: "Megabyte", f: 1048576 }, { s: "gb", n: "Gigabyte", f: 1073741824 }, { s: "tb", n: "Terabyte", f: 1099511627776 }];
        var v = val("cvdados_v");
        var de = Math.round(val("cvdados_de")), para = Math.round(val("cvdados_para"));
        if (de < 1 || de > U.length || para < 1 || para > U.length) {
          return {
            principal: { label: "Resultado", valor: "—" },
            linhas: U.map(function (u, i) { return { label: String(i + 1), valor: u.n }; }),
            obs: "Escolha os números das unidades de origem e destino, conforme a lista acima.",
            resultadoBruto: 0,
          };
        }
        var a = U[de - 1], b = U[para - 1];
        var r = v * a.f / b.f;
        return {
          principal: { label: a.n + " → " + b.n, valor: num(r, 6) + " " + b.s },
          linhas: [
            { label: "Valor original", valor: num(v, 6) + " " + a.s },
            { label: "Unidade base", valor: num(v * a.f, 6) + " (byte)" },
            { label: "Fator aplicado", valor: num(a.f / b.f, 8) },
          ],
          resultadoBruto: r,
        };
      },
      explica: "Cada unidade tem um fator em relação ao byte. Resultado = Valor × fator da origem ÷ fator do destino.",
    },
    {
      id: "conv-temperatura", cat: "Conversões", nome: "Converter Temperatura",
      desc: "Converta entre: 1=Celsius, 2=Fahrenheit, 3=Kelvin.",
      chaves: ["celsius", "fahrenheit", "kelvin", "temperatura", "grau", "conversão"],
      campos: [
        campo("cvtemp_v", "Valor", "number"),
        campo("cvtemp_de", "De (1 a 3)", "integer"),
        campo("cvtemp_para", "Para (1 a 3)", "integer"),
      ],
      calc: function () {
        // Temperatura NÃO é conversão por fator: as escalas têm zeros
        // diferentes. Por isso tudo passa por Celsius com soma e subtração.
        var N = ["Celsius", "Fahrenheit", "Kelvin"], S = ["°C", "°F", "K"];
        var v = val("cvtemp_v");
        var de = Math.round(val("cvtemp_de")), para = Math.round(val("cvtemp_para"));
        if (de < 1 || de > 3 || para < 1 || para > 3) {
          return {
            principal: { label: "Resultado", valor: "—" },
            linhas: [{ label: "1", valor: "Celsius" }, { label: "2", valor: "Fahrenheit" }, { label: "3", valor: "Kelvin" }],
            obs: "Escolha 1, 2 ou 3 para origem e destino.",
            resultadoBruto: 0,
          };
        }
        var c = de === 1 ? v : (de === 2 ? (v - 32) * 5 / 9 : v - 273.15);
        var r = para === 1 ? c : (para === 2 ? c * 9 / 5 + 32 : c + 273.15);
        return {
          principal: { label: N[de - 1] + " → " + N[para - 1], valor: num(r, 2) + " " + S[para - 1] },
          linhas: [
            { label: "Valor original", valor: num(v, 2) + " " + S[de - 1] },
            { label: "Em Celsius", valor: num(c, 2) + " °C" },
          ],
          obs: para === 3 && r < 0 ? "Kelvin negativo não existe fisicamente — confira o valor informado." : null,
          resultadoBruto: r,
        };
      },
      explica: "C = (F − 32) × 5/9 e C = K − 273,15. A conversão passa sempre por Celsius.",
    },
  ]);
})();

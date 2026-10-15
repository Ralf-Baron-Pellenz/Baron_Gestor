// ═══════════════════════════════════════════════════════════════════
//  Bapell Gestor Pro — Central de Cálculos
//  LOTE 8: RH, DATAS, TEMPO E PRODUTIVIDADE
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
    console.error("[Calculos/lote8_rh_datas.js] Motor nao encontrado. " +
      "Verifique se JS/calculos.js e carregado ANTES deste arquivo no calculos.html.");
    return;
  }

  var campo = API.campo, val = API.val, brl = API.brl, pct = API.pct, num = API.num;

  API.registrar([
    // ---------- RH ----------
  // ───────── RH / SALÁRIOS ─────────
      {
        id: "comissao", cat: "RH", nome: "Comissão sobre Vendas",
        desc: "Valor da comissão de um vendedor.",
        campos: [campo("vendas", "Total vendido", "money"), campo("perc", "Comissão (%)", "percent")],
        calc: function () {
          var v = val("vendas"), p = val("perc");
          var com = v * (p / 100);
          return {
            principal: { label: "Comissão", valor: brl(com) },
            linhas: [{ label: "Sobre vendas de", valor: brl(v) }],
            resultadoBruto: com,
          };
        },
        explica: "Comissão = Total vendido × (Percentual ÷ 100).",
      },
  {
        id: "hora-extra", cat: "RH", nome: "Hora Extra",
        desc: "Valor das horas extras com adicional.",
        campos: [
          campo("salario", "Salário mensal", "money"),
          campo("jornada", "Horas mensais", "number", { placeholder: "Ex: 220" }),
          campo("horas", "Horas extras", "number"),
          campo("adicional", "Adicional (%)", "percent", { placeholder: "Ex: 50" }),
        ],
        calc: function () {
          var s = val("salario"), j = val("jornada") || 220, h = val("horas"), a = val("adicional");
          var valorHora = j > 0 ? s / j : 0;
          var valorExtra = valorHora * (1 + a / 100) * h;
          return {
            principal: { label: "Total de horas extras", valor: brl(valorExtra) },
            linhas: [
              { label: "Valor da hora normal", valor: brl(valorHora) },
              { label: "Valor da hora extra", valor: brl(valorHora * (1 + a / 100)) },
            ],
            resultadoBruto: valorExtra,
            obs: "Estimativa simplificada. Não considera reflexos (DSR, encargos).",
          };
        },
        explica: "Hora extra = (Salário ÷ Jornada) × (1 + Adicional%) × Horas extras.",
      },
    // ---------- RH ----------
    {
      id: "rh-valor-hora", cat: "RH", nome: "Valor da Hora de Trabalho",
      desc: "Converte salário mensal em valor por hora e por dia.",
      chaves: ["valor hora", "salario", "hora", "mensal"],
      campos: [campo("rvh_sal", "Salário mensal", "money"), campo("rvh_h", "Horas por semana", "number")],
      calc: function () {
        var s2 = val("rvh_sal"), h = val("rvh_h");
        if (h <= 0) return { principal: { label: "Valor da hora", valor: "—" }, linhas: [], obs: "Informe as horas semanais.", resultadoBruto: 0 };
        var mensais = h * 5;
        var hora = s2 / mensais;
        return { principal: { label: "Valor da hora", valor: brl(hora) },
          linhas: [{ label: "Horas no mês (base 5 semanas)", valor: num(mensais, 1) },
                   { label: "Valor do dia (8 h)", valor: brl(hora * 8) },
                   { label: "Valor do minuto", valor: brl(hora / 60) }],
          obs: "Estimativa. A base legal de horas mensais pode variar conforme a jornada contratada.",
          resultadoBruto: hora };
      },
      explica: "Horas mensais ≈ Horas semanais × 5. Valor da hora = Salário ÷ Horas mensais.",
    },
    {
      id: "rh-salario-proporcional", cat: "RH", nome: "Salário Proporcional aos Dias",
      desc: "Salário de quem trabalhou parte do mês.",
      chaves: ["proporcional", "dias trabalhados", "admissão"],
      campos: [campo("rsp_sal", "Salário mensal cheio", "money"), campo("rsp_dias", "Dias trabalhados", "integer")],
      calc: function () {
        var s2 = val("rsp_sal"), d = Math.max(0, Math.min(30, val("rsp_dias")));
        var v = s2 / 30 * d;
        return { principal: { label: "Salário proporcional", valor: brl(v) },
          linhas: [{ label: "Valor do dia", valor: brl(s2 / 30) }, { label: "Dias considerados", valor: num(d, 0) }],
          obs: "Simulação com base em 30 dias. Não substitui o cálculo da folha nem considera descontos legais.",
          resultadoBruto: v };
      },
      explica: "Proporcional = (Salário ÷ 30) × Dias trabalhados.",
    },
    {
      id: "rh-decimo-terceiro", cat: "RH", nome: "13º Salário Proporcional",
      desc: "Estimativa pelos meses trabalhados no ano.",
      chaves: ["13", "decimo terceiro", "gratificacao natalina"],
      campos: [campo("rdt_sal", "Salário mensal", "money"), campo("rdt_meses", "Meses trabalhados no ano", "integer")],
      calc: function () {
        var s2 = val("rdt_sal"), m = Math.max(0, Math.min(12, val("rdt_meses")));
        var v = s2 / 12 * m;
        return { principal: { label: "13º proporcional", valor: brl(v) },
          linhas: [{ label: "1ª parcela (50%)", valor: brl(v / 2) }, { label: "2ª parcela (50%)", valor: brl(v / 2) }],
          obs: "Valor BRUTO. Não inclui INSS, IRRF nem outras deduções. Confirme com o contador.",
          resultadoBruto: v };
      },
      explica: "13º = (Salário ÷ 12) × Meses trabalhados. Mês com 15 dias ou mais costuma contar integralmente.",
    },
    {
      id: "rh-ferias", cat: "RH", nome: "Férias + 1/3 Constitucional",
      desc: "Estimativa do valor bruto das férias.",
      chaves: ["ferias", "um terco", "1/3"],
      campos: [campo("rf_sal", "Salário mensal", "money"), campo("rf_dias", "Dias de férias", "integer")],
      calc: function () {
        var s2 = val("rf_sal"), d = Math.max(0, Math.min(30, val("rf_dias")));
        var base = s2 / 30 * d;
        var terco = base / 3;
        return { principal: { label: "Total bruto", valor: brl(base + terco) },
          linhas: [{ label: "Férias", valor: brl(base) }, { label: "Adicional de 1/3", valor: brl(terco) }],
          obs: "Valor BRUTO, sem INSS e IRRF. Simulação — confirme com o contador.",
          resultadoBruto: base + terco };
      },
      explica: "Férias = (Salário ÷ 30) × Dias. Adicional = Férias ÷ 3.",
    },
    {
      id: "rh-custo-funcionario", cat: "RH", nome: "Custo Estimado do Funcionário",
      desc: "Salário mais encargos que você informar.",
      chaves: ["custo funcionario", "encargos", "folha"],
      campos: [campo("rcf_sal", "Salário mensal", "money"), campo("rcf_enc", "Encargos", "percent"),
               campo("rcf_bene", "Benefícios mensais", "money")],
      calc: function () {
        var s2 = val("rcf_sal"), e = s2 * val("rcf_enc") / 100, b = val("rcf_bene");
        var total = s2 + e + b;
        return { principal: { label: "Custo mensal", valor: brl(total) },
          linhas: [{ label: "Encargos", valor: brl(e) }, { label: "Benefícios", valor: brl(b) },
                   { label: "Custo anual", valor: brl(total * 12) },
                   { label: "Custo por hora (220 h)", valor: brl(total / 220) }],
          obs: "Os encargos variam conforme regime tributário e categoria. Informe o seu percentual — esta ferramenta não presume nenhum.",
          resultadoBruto: total };
      },
      explica: "Custo = Salário + (Salário × Encargos%) + Benefícios.",
    },
    // ---------- DATAS E TEMPO ----------
    {
      id: "dt-diferenca-datas", cat: "Datas", nome: "Diferença entre Duas Datas",
      desc: "Dias, semanas e meses entre duas datas.",
      chaves: ["diferenca", "datas", "dias entre", "prazo"],
      campos: [campo("ddd_ini", "Data inicial", "date"), campo("ddd_fim", "Data final", "date")],
      calc: function () {
        var a = document.getElementById("ddd_ini"), b = document.getElementById("ddd_fim");
        var d1 = a && a.value ? new Date(a.value + "T00:00:00") : null;
        var d2 = b && b.value ? new Date(b.value + "T00:00:00") : null;
        if (!d1 || !d2 || isNaN(d1) || isNaN(d2)) return { principal: { label: "Diferença", valor: "—" }, linhas: [], obs: "Informe as duas datas.", resultadoBruto: 0 };
        var dias = Math.round((d2 - d1) / 86400000);
        return { principal: { label: "Diferença", valor: num(Math.abs(dias), 0) + " dias" },
          linhas: [{ label: "Semanas", valor: num(Math.abs(dias) / 7, 1) },
                   { label: "Meses aproximados", valor: num(Math.abs(dias) / 30.44, 1) },
                   { label: "Anos aproximados", valor: num(Math.abs(dias) / 365.25, 2) },
                   { label: "Sentido", valor: dias < 0 ? "A data final é anterior" : "A data final é posterior" }],
          resultadoBruto: Math.abs(dias) };
      },
      explica: "Diferença em dias = (Data final − Data inicial) ÷ 86.400.000 ms.",
    },
    {
      id: "dt-somar-dias", cat: "Datas", nome: "Somar ou Subtrair Dias",
      desc: "Data futura ou passada a partir de uma data.",
      chaves: ["somar dias", "subtrair", "prazo", "vencimento"],
      campos: [campo("dsd_data", "Data base", "date"), campo("dsd_dias", "Dias a somar (negativo subtrai)", "integer")],
      calc: function () {
        var e = document.getElementById("dsd_data");
        var d = e && e.value ? new Date(e.value + "T00:00:00") : null;
        if (!d || isNaN(d)) return { principal: { label: "Data final", valor: "—" }, linhas: [], obs: "Informe a data base.", resultadoBruto: 0 };
        var n = Math.round(val("dsd_dias"));
        var r = new Date(d.getTime() + n * 86400000);
        var semana = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][r.getDay()];
        var p = function (x) { return String(x).padStart(2, "0"); };
        return { principal: { label: "Data final", valor: p(r.getDate()) + "/" + p(r.getMonth() + 1) + "/" + r.getFullYear() },
          linhas: [{ label: "Dia da semana", valor: semana }, { label: "Dias aplicados", valor: num(n, 0) }],
          resultadoBruto: r.getTime() };
      },
      explica: "Soma o número de dias à data informada. Valores negativos voltam no tempo.",
    },
    {
      id: "dt-idade", cat: "Datas", nome: "Idade / Tempo Decorrido",
      desc: "Anos, meses e dias desde uma data.",
      chaves: ["idade", "tempo decorrido", "aniversario"],
      campos: [campo("did_nasc", "Data inicial", "date")],
      calc: function () {
        var e = document.getElementById("did_nasc");
        var d = e && e.value ? new Date(e.value + "T00:00:00") : null;
        if (!d || isNaN(d)) return { principal: { label: "Tempo decorrido", valor: "—" }, linhas: [], obs: "Informe a data.", resultadoBruto: 0 };
        var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        var anos = hoje.getFullYear() - d.getFullYear();
        var meses = hoje.getMonth() - d.getMonth();
        var dias = hoje.getDate() - d.getDate();
        if (dias < 0) { meses--; dias += new Date(hoje.getFullYear(), hoje.getMonth(), 0).getDate(); }
        if (meses < 0) { anos--; meses += 12; }
        var totalDias = Math.round((hoje - d) / 86400000);
        return { principal: { label: "Tempo decorrido", valor: num(anos, 0) + " anos, " + num(meses, 0) + " meses e " + num(dias, 0) + " dias" },
          linhas: [{ label: "Total em dias", valor: num(totalDias, 0) }, { label: "Total em meses", valor: num(anos * 12 + meses, 0) }],
          resultadoBruto: anos };
      },
      explica: "Calcula a diferença até a data de hoje em anos, meses e dias.",
    },
    {
      id: "dt-dias-uteis", cat: "Datas", nome: "Dias Úteis entre Datas",
      desc: "Conta apenas de segunda a sexta.",
      chaves: ["dias uteis", "util", "semana", "prazo"],
      campos: [campo("ddu_ini", "Data inicial", "date"), campo("ddu_fim", "Data final", "date")],
      calc: function () {
        var a = document.getElementById("ddu_ini"), b = document.getElementById("ddu_fim");
        var d1 = a && a.value ? new Date(a.value + "T00:00:00") : null;
        var d2 = b && b.value ? new Date(b.value + "T00:00:00") : null;
        if (!d1 || !d2 || isNaN(d1) || isNaN(d2)) return { principal: { label: "Dias úteis", valor: "—" }, linhas: [], obs: "Informe as duas datas.", resultadoBruto: 0 };
        if (d2 < d1) { var t = d1; d1 = d2; d2 = t; }
        var uteis = 0, total = 0, cur = new Date(d1);
        var limite = 0;
        while (cur <= d2 && limite++ < 20000) {
          var dw = cur.getDay();
          if (dw !== 0 && dw !== 6) uteis++;
          total++;
          cur = new Date(cur.getTime() + 86400000);
        }
        return { principal: { label: "Dias úteis", valor: num(uteis, 0) },
          linhas: [{ label: "Dias corridos", valor: num(total, 0) }, { label: "Fins de semana", valor: num(total - uteis, 0) }],
          obs: "Não considera feriados nacionais, estaduais ou municipais.",
          resultadoBruto: uteis };
      },
      explica: "Percorre o intervalo dia a dia e conta apenas de segunda a sexta.",
    },
    {
      id: "dt-converter-horas", cat: "Datas", nome: "Converter Horas e Minutos",
      desc: "Transforma entre horas decimais e horas:minutos.",
      chaves: ["horas", "minutos", "converter tempo", "decimal"],
      campos: [campo("dch_h", "Horas", "integer"), campo("dch_m", "Minutos", "integer")],
      calc: function () {
        var h = val("dch_h"), m = val("dch_m");
        var totalMin = h * 60 + m;
        var dec = totalMin / 60;
        return { principal: { label: "Horas decimais", valor: num(dec, 4) },
          linhas: [{ label: "Total em minutos", valor: num(totalMin, 0) },
                   { label: "Total em segundos", valor: num(totalMin * 60, 0) },
                   { label: "Formato h:min", valor: num(Math.floor(totalMin / 60), 0) + "h" + String(Math.round(totalMin % 60)).padStart(2, "0") }],
          resultadoBruto: dec };
      },
      explica: "Horas decimais = (Horas × 60 + Minutos) ÷ 60. Útil para folha de ponto.",
    },
    // ---------- PRODUTIVIDADE ----------
    {
      id: "prod-por-hora", cat: "Produtividade", nome: "Produtividade por Hora",
      desc: "Peças, vendas ou faturamento por hora trabalhada.",
      chaves: ["produtividade", "por hora", "rendimento"],
      campos: [campo("pph_qtd", "Quantidade produzida ou vendida", "number"), campo("pph_horas", "Horas trabalhadas", "number")],
      calc: function () {
        var q = val("pph_qtd"), h = val("pph_horas");
        if (h <= 0) return { principal: { label: "Por hora", valor: "—" }, linhas: [], obs: "Informe as horas trabalhadas.", resultadoBruto: 0 };
        return { principal: { label: "Por hora", valor: num(q / h) },
          linhas: [{ label: "Por minuto", valor: num(q / (h * 60), 4) },
                   { label: "Em 8 horas", valor: num(q / h * 8) },
                   { label: "Em 220 horas (mês)", valor: num(q / h * 220) }],
          resultadoBruto: q / h };
      },
      explica: "Produtividade = Quantidade ÷ Horas trabalhadas.",
    },
    {
      id: "prod-metas-periodo", cat: "Produtividade", nome: "Meta Diária, Semanal e Mensal",
      desc: "Divide uma meta mensal nos períodos menores.",
      chaves: ["meta", "diaria", "semanal", "mensal", "quebrar meta"],
      campos: [campo("pmp_meta", "Meta do mês", "money"), campo("pmp_dias", "Dias de trabalho no mês", "integer")],
      calc: function () {
        var m = val("pmp_meta"), d = Math.max(1, Math.round(val("pmp_dias")));
        return { principal: { label: "Meta por dia", valor: brl(m / d) },
          linhas: [{ label: "Meta por semana", valor: brl(m / (d / 5)) },
                   { label: "Meta do mês", valor: brl(m) },
                   { label: "Dias de trabalho", valor: num(d, 0) }],
          resultadoBruto: m / d };
      },
      explica: "Meta diária = Meta mensal ÷ Dias de trabalho. A semanal considera 5 dias úteis.",
    },
    {
      id: "prod-custo-hora", cat: "Produtividade", nome: "Custo por Hora da Operação",
      desc: "Quanto custa cada hora do seu negócio funcionando.",
      chaves: ["custo hora", "operacao", "despesa fixa"],
      campos: [campo("pch_desp", "Despesas fixas do mês", "money"), campo("pch_horas", "Horas de operação no mês", "number")],
      calc: function () {
        var d = val("pch_desp"), h = val("pch_horas");
        if (h <= 0) return { principal: { label: "Custo por hora", valor: "—" }, linhas: [], obs: "Informe as horas de operação.", resultadoBruto: 0 };
        return { principal: { label: "Custo por hora", valor: brl(d / h) },
          linhas: [{ label: "Custo por minuto", valor: brl(d / (h * 60)) },
                   { label: "Custo por dia (8 h)", valor: brl(d / h * 8) }],
          resultadoBruto: d / h };
      },
      explica: "Custo por hora = Despesas fixas ÷ Horas de operação no mês.",
    },
  ]);
})();

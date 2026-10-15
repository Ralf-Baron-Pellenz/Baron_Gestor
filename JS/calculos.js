// ═══════════════════════════════════════════════════════════════════
//  Bapell Gestor Pro — Central de Cálculos
//  MOTOR: renderização, busca, favoritos, histórico e cálculo.
//
//  ── ARQUITETURA ────────────────────────────────────────────────────
//  As DEFINIÇÕES das calculadoras não moram mais aqui. Elas ficam em
//  arquivos separados por assunto, dentro da pasta Calculos/:
//
//        Calculos/lote1_precificacao.js   ─┐
//        Calculos/lote2_financeiro.js      │
//        Calculos/lote3_impostos.js        │  cada um chama
//        Calculos/lote4_logistica.js       ├─ CentralCalculos.registrar([...])
//        Calculos/lote5_matematica.js      │
//        Calculos/lote6_investimentos.js   │
//        Calculos/lote7_conversoes.js      │
//        Calculos/lote8_rh_datas.js       ─┘
//                      ↓
//                   CALCS  →  MOTOR (este arquivo)
//
//  Todos alimentam o MESMO array CALCS. Para o usuário continua sendo
//  uma Central única: as categorias, a busca, os favoritos e o histórico
//  atravessam os lotes sem distinção de arquivo.
//
//  ── POR QUE A INICIALIZAÇÃO MUDOU ──────────────────────────────────
//  Antes o motor fazia `else init()` — inicializava na hora se o
//  documento já estivesse pronto. Com os lotes em arquivos separados
//  isso viraria tela vazia: o motor montaria a interface antes de os
//  lotes se registrarem. Agora a inicialização SEMPRE espera o
//  DOMContentLoaded, que dispara depois de todos os <script> da página.
//
//  ── PARA ADICIONAR UMA CALCULADORA ─────────────────────────────────
//  Abra o arquivo do lote correspondente e acrescente um objeto. Este
//  arquivo não precisa ser tocado.
// ═══════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  // ── Helpers de formatação ──
  function brl(v) {
    var n = Number(v);
    if (!isFinite(n)) n = 0;
    try { return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
    catch (e) { return "R$ " + n.toFixed(2).replace(".", ","); }
  }
  function pct(v, casas) {
    var n = Number(v);
    if (!isFinite(n)) n = 0;
    return n.toFixed(casas == null ? 2 : casas).replace(".", ",") + "%";
  }
  function num(v, casas) {
    var n = Number(v);
    if (!isFinite(n)) n = 0;
    return n.toLocaleString("pt-BR", { minimumFractionDigits: casas == null ? 2 : casas, maximumFractionDigits: casas == null ? 2 : casas });
  }
  // Lê valor "cru" de um input aceitando vírgula ou ponto
  function val(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    var s = String(el.value == null ? "" : el.value).trim().replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  // ── Tipos de campo ──
  // money (R$), percent (%), number, integer
  function campo(id, label, tipo, extra) {
    return Object.assign({ id: id, label: label, tipo: tipo || "number" }, extra || {});
  }

  // ═══════════════════════════════════════════════════════════════════
  //  REGISTRO DAS CALCULADORAS
  //  Começa vazio: os arquivos de Calculos/ preenchem via registrar().
  // ═══════════════════════════════════════════════════════════════════
  var CALCS = [];

  // Guarda os ids já usados para barrar duplicidade. Dois lotes com o
  // mesmo id fariam favoritos e histórico apontarem para a calculadora
  // errada — por isso o segundo é recusado, e não sobrescreve o primeiro.
  var IDS = Object.create(null);

  /**
   * Registra as calculadoras de um lote.
   * @param {Array|Object} lista um objeto ou um array de objetos.
   * @returns {number} quantas foram efetivamente registradas.
   */
  function registrar(lista) {
    if (!lista) return 0;
    if (!Array.isArray(lista)) lista = [lista];
    var aceitas = 0;
    for (var i = 0; i < lista.length; i++) {
      var c = lista[i];
      if (!c || typeof c !== "object") continue;
      if (!c.id || !c.nome || typeof c.calc !== "function") {
        console.error("[Central de Cálculos] Calculadora ignorada: precisa de id, nome e calc().", c);
        continue;
      }
      if (IDS[c.id]) {
        console.error("[Central de Cálculos] ID duplicado ignorado: \"" + c.id + "\".");
        continue;
      }
      IDS[c.id] = true;
      if (!c.cat) c.cat = "Outros";
      CALCS.push(c);
      aceitas++;
    }
    return aceitas;
  }

  // API que os arquivos de Calculos/ usam. Expõe também os auxiliares,
  // para que nenhum lote precise redefinir brl(), pct(), val() etc.
  window.CentralCalculos = {
    registrar: registrar,
    campo: campo, val: val, brl: brl, pct: pct, num: num,
    // Só leitura, para depuração no console.
    lista: function () { return CALCS.slice(); },
  };

  // Lista de categorias na ordem desejada (as que existem em CALCS)
  var ORDEM_CAT = ["Financeiro", "Impostos", "Marketplace", "Cartão", "Frete", "Conversões", "RH", "Investimentos", "Empréstimos"];

  // ═══════════════════════════════════════════════════════════
  //  ESTADO E PERSISTÊNCIA
  // ═══════════════════════════════════════════════════════════
  var LS_HIST = "precifiq_calc_historico";
  var LS_FAV = "precifiq_calc_favoritos";

  function lerLS(chave, fallback) {
    try { var v = JSON.parse(localStorage.getItem(chave)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function salvarLS(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) {}
  }

  var favoritos = lerLS(LS_FAV, []);      // array de ids de calculadora
  var historico = lerLS(LS_HIST, []);     // array de cálculos salvos

  function ehFav(id) { return favoritos.indexOf(id) >= 0; }
  function toggleFav(id) {
    var i = favoritos.indexOf(id);
    if (i >= 0) favoritos.splice(i, 1); else favoritos.push(id);
    salvarLS(LS_FAV, favoritos);
    renderMenu();
  }

  function gerarId() {
    return "calc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }
  function calcPorId(id) {
    for (var i = 0; i < CALCS.length; i++) if (CALCS[i].id === id) return CALCS[i];
    return null;
  }

  // ═══════════════════════════════════════════════════════════
  //  RENDER: MENU LATERAL (categorias, favoritos, busca)
  // ═══════════════════════════════════════════════════════════
  var termoBusca = "";
  var calcAtual = null;

  function calcsFiltradas() {
    if (!termoBusca) return CALCS;
    var t = termoBusca.toLowerCase();
    return CALCS.filter(function (c) {
      // Além de nome, descrição e categoria, a busca olha o campo opcional
      // `chaves` — palavras que o usuário digitaria mas que não aparecem no
      // texto visível (ex.: "ICMS" numa calculadora chamada "Imposto sobre
      // circulação"). Calculadora sem `chaves` continua funcionando igual.
      var chaves = Array.isArray(c.chaves) ? c.chaves.join(" ") : (c.chaves || "");
      var alvo = (c.nome + " " + (c.desc || "") + " " + c.cat + " " + chaves).toLowerCase();
      return alvo.indexOf(t) >= 0;
    });
  }

  function renderMenu() {
    var host = document.getElementById("calcMenu");
    if (!host) return;
    var lista = calcsFiltradas();
    var html = "";

    // Favoritos (só quando não está buscando)
    if (!termoBusca && favoritos.length) {
      html += grupoHtml("Favoritos", favoritos.map(calcPorId).filter(Boolean), true);
    }
    // Categorias
    var cats = ORDEM_CAT.filter(function (cat) {
      return lista.some(function (c) { return c.cat === cat; });
    });
    // categorias fora da ordem conhecida
    lista.forEach(function (c) { if (cats.indexOf(c.cat) < 0) cats.push(c.cat); });

    cats.forEach(function (cat) {
      var doCat = lista.filter(function (c) { return c.cat === cat; });
      if (doCat.length) html += grupoHtml(cat, doCat);
    });

    if (!lista.length) {
      html = '<div class="calc-menu-vazio">Nenhuma calculadora encontrada.</div>';
    }
    host.innerHTML = html;

    host.querySelectorAll("[data-calc-id]").forEach(function (el) {
      el.addEventListener("click", function () { abrirCalc(el.dataset.calcId); });
    });
    host.querySelectorAll("[data-fav-id]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleFav(el.dataset.favId);
      });
    });
  }

  // Ícones SVG de favorito (padrão do sistema: stroke, viewBox 24, sem emoji).
  // Vazia = contorno; Cheia = preenchida (favoritado).
  var SVG_ESTRELA_VAZIA =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
  var SVG_ESTRELA_CHEIA =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';

  function _iconeFav(fav) { return fav ? SVG_ESTRELA_CHEIA : SVG_ESTRELA_VAZIA; }

  function grupoHtml(titulo, calcs, tituloComIcone) {
    var itens = calcs.map(function (c) {
      var ativo = calcAtual && calcAtual.id === c.id ? " ativo" : "";
      var favClasse = ehFav(c.id) ? " marcado" : "";
      return (
        '<div class="calc-menu-item' + ativo + '" data-calc-id="' + c.id + '">' +
          '<span class="calc-menu-item-nome">' + esc(c.nome) + "</span>" +
          '<button class="calc-menu-fav' + favClasse + '" data-fav-id="' + c.id + '" title="Favoritar" aria-label="Favoritar">' + _iconeFav(ehFav(c.id)) + "</button>" +
        "</div>"
      );
    }).join("");
    var tituloHtml = tituloComIcone
      ? '<span class="calc-grupo-ico-fav">' + SVG_ESTRELA_CHEIA + "</span>" + esc(titulo)
      : esc(titulo);
    return (
      '<div class="calc-menu-grupo">' +
        '<div class="calc-menu-grupo-titulo">' + tituloHtml + "</div>" +
        itens +
      "</div>"
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  RENDER: CALCULADORA NO CENTRO
  // ═══════════════════════════════════════════════════════════
  function abrirCalc(id) {
    var c = calcPorId(id);
    if (!c) return;
    calcAtual = c;

    var host = document.getElementById("calcCentro");
    var camposHtml = c.campos.map(function (f) {
      // Campo de DATA: usa <input type="date"> nativo, sem máscara nem prefixo.
      // As calculadoras de datas leem o valor direto pelo id (formato AAAA-MM-DD),
      // por isso ele não passa pelo val(), que é numérico.
      if (f.tipo === "date") {
        return (
          '<div class="calc-campo">' +
            '<label for="' + f.id + '">' + esc(f.label) + "</label>" +
            '<div class="calc-inp-wrap">' +
              '<input type="date" id="' + f.id + '" autocomplete="off" />' +
            "</div>" +
          "</div>"
        );
      }

      var ph = f.placeholder || (f.tipo === "money" ? "0,00" : "0");
      var prefixo = f.tipo === "money" ? '<span class="calc-inp-prefixo">R$</span>' : "";
      var sufixo = f.tipo === "percent" ? '<span class="calc-inp-sufixo">%</span>' : "";
      var wrapCls = "calc-inp-wrap" + (f.tipo === "money" ? " tem-prefixo" : "") + (f.tipo === "percent" ? " tem-sufixo" : "");
      return (
        '<div class="calc-campo">' +
          '<label for="' + f.id + '">' + esc(f.label) + "</label>" +
          '<div class="' + wrapCls + '">' + prefixo +
            '<input type="text" inputmode="decimal" id="' + f.id + '" placeholder="' + esc(ph) + '" autocomplete="off" />' +
          sufixo + "</div>" +
        "</div>"
      );
    }).join("");

    var avisoHtml = c.aviso
      ? '<div class="calc-aviso">' +
          '<div class="calc-aviso-icone">!</div>' +
          '<div class="calc-aviso-texto">' +
            '<strong>Pesquise a alíquota do seu estado antes de calcular.</strong>' +
            ' As alíquotas de imposto mudam conforme o estado, o produto (NCM) e o regime da sua empresa. ' +
            'Consulte a SEFAZ do seu estado ou o site do CONFAZ, e confirme com seu contador — este cálculo é uma estimativa e não substitui a orientação profissional.' +
          "</div>" +
        "</div>"
      : "";

    host.innerHTML =
      '<div class="calc-card">' +
        '<div class="calc-card-head">' +
          '<div>' +
            '<div class="calc-card-cat">' + esc(c.cat) + "</div>" +
            '<h2 class="calc-card-titulo">' + esc(c.nome) + "</h2>" +
            '<p class="calc-card-desc">' + esc(c.desc) + "</p>" +
          "</div>" +
          '<button class="calc-fav-grande' + (ehFav(c.id) ? " marcado" : "") + '" id="calcFavGrande" title="Favoritar" aria-label="Favoritar">' + _iconeFav(ehFav(c.id)) + "</button>" +
        "</div>" +
        avisoHtml +
        '<div class="calc-campos">' + camposHtml + "</div>" +
        '<div class="calc-acoes-calc">' +
          '<button class="btn-primary" id="calcCalcular">Calcular</button>' +
          '<button class="calc-btn-limpar" id="calcLimpar">Limpar</button>' +
        "</div>" +
        '<div class="calc-resultado" id="calcResultado" style="display:none;"></div>' +
        '<div class="calc-explica"><strong>Como é calculado:</strong> ' + esc(c.explica || "") + "</div>" +
      "</div>";

    // Eventos
    document.getElementById("calcCalcular").addEventListener("click", function () { calcular(c); });
    document.getElementById("calcLimpar").addEventListener("click", function () {
      c.campos.forEach(function (f) { var el = document.getElementById(f.id); if (el) el.value = ""; });
      document.getElementById("calcResultado").style.display = "none";
    });
    document.getElementById("calcFavGrande").addEventListener("click", function () {
      toggleFav(c.id);
      var fav = ehFav(c.id);
      this.innerHTML = _iconeFav(fav);
      this.classList.toggle("marcado", fav);
    });
    // Enter em qualquer campo calcula
    c.campos.forEach(function (f) {
      var el = document.getElementById(f.id);
      if (el) el.addEventListener("keydown", function (e) { if (e.key === "Enter") calcular(c); });
    });
    // Máscara monetária EM TEMPO REAL para campos "money": cada dígito
    // digitado empurra o valor da direita para a esquerda, sempre com duas
    // casas decimais e padrão brasileiro (1 → 0,01; 100 → 1,00; 100000 → 1.000,00).
    // Campos "percent" continuam formatando ao sair (blur).
    c.campos.forEach(function (f) {
      var el = document.getElementById(f.id);
      if (!el) return;
      // Data não recebe máscara numérica: o próprio <input type="date"> já
      // valida e formata conforme o idioma do sistema.
      if (f.tipo === "date") return;

      if (f.tipo === "money") {
        el.addEventListener("input", function () {
          // Mantém só os dígitos e monta o valor tratando os 2 últimos como centavos.
          var digitos = (el.value || "").replace(/\D/g, "");
          if (digitos === "") { el.value = ""; return; }
          // Remove zeros à esquerda para não crescer sem limite, mas preserva
          // ao menos 1 dígito (que vira centavo).
          digitos = digitos.replace(/^0+(?=\d)/, "");
          var valorNum = parseInt(digitos, 10) / 100;
          el.value = num(valorNum);
          // Mantém o cursor no fim (o valor é reconstruído a cada tecla).
          try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {}
        });
      } else if (f.tipo === "percent") {
        el.addEventListener("blur", function () {
          if (el.value.trim() === "") return;
          var s = el.value.replace(/\./g, "").replace(",", ".");
          var n = parseFloat(s);
          if (!isFinite(n)) return;
          el.value = String(n).replace(".", ",");
        });
      }
    });

    renderMenu(); // atualiza o "ativo" no menu
  }

  var ultimoResultado = null;

  function calcular(c) {
    var r;
    try { r = c.calc(); } catch (e) { r = null; }
    if (!r) return;
    ultimoResultado = { calc: c, resultado: r };

    var box = document.getElementById("calcResultado");
    var linhasHtml = (r.linhas || []).map(function (l) {
      return '<div class="calc-res-linha"><span>' + esc(l.label) + "</span><strong>" + esc(l.valor) + "</strong></div>";
    }).join("");
    var obsHtml = r.obs ? '<div class="calc-res-obs">' + esc(r.obs) + "</div>" : "";

    box.innerHTML =
      '<div class="calc-res-principal">' +
        '<span class="calc-res-principal-label">' + esc(r.principal.label) + "</span>" +
        '<span class="calc-res-principal-valor">' + esc(r.principal.valor) + "</span>" +
      "</div>" +
      (linhasHtml ? '<div class="calc-res-linhas">' + linhasHtml + "</div>" : "") +
      obsHtml +
      '<div class="calc-res-acoes">' +
        '<button class="calc-mini-btn" id="calcCopiar">Copiar resultado</button>' +
        '<button class="calc-mini-btn" id="calcSalvar">Salvar cálculo</button>' +
        '<button class="calc-mini-btn" id="calcImprimir">Imprimir</button>' +
      "</div>";
    box.style.display = "block";

    document.getElementById("calcCopiar").addEventListener("click", function () {
      var txt = c.nome + " — " + r.principal.label + ": " + r.principal.valor;
      copiar(txt);
    });
    document.getElementById("calcSalvar").addEventListener("click", function () { abrirModalSalvar(c, r); });
    document.getElementById("calcImprimir").addEventListener("click", function () { imprimir(c, r); });
  }

  // ═══════════════════════════════════════════════════════════
  //  SALVAR / HISTÓRICO
  // ═══════════════════════════════════════════════════════════
  function abrirModalSalvar(c, r) {
    var ov = document.createElement("div");
    ov.className = "calc-modal-overlay";
    ov.innerHTML =
      '<div class="calc-modal">' +
        '<div class="calc-modal-titulo">Salvar cálculo</div>' +
        '<div class="calc-campo"><label>Nome</label><div class="calc-inp-wrap"><input type="text" id="salvarNome" placeholder="Ex: ICMS Produto A" value="' + esc(c.nome) + '" /></div></div>' +
        '<div class="calc-campo"><label>Descrição (opcional)</label><div class="calc-inp-wrap"><input type="text" id="salvarDesc" placeholder="Uma nota sobre este cálculo" /></div></div>' +
        '<div class="calc-campo"><label>Tags (separe por vírgula)</label><div class="calc-inp-wrap"><input type="text" id="salvarTags" placeholder="Ex: agosto, produto-a" /></div></div>' +
        '<div class="calc-modal-acoes">' +
          '<button class="calc-btn-limpar" id="salvarCancelar">Cancelar</button>' +
          '<button class="btn-primary" id="salvarConfirmar">Salvar</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); });
    ov.querySelector("#salvarCancelar").addEventListener("click", function () { ov.remove(); });
    ov.querySelector("#salvarConfirmar").addEventListener("click", function () {
      var nome = (ov.querySelector("#salvarNome").value || "").trim() || c.nome;
      var desc = (ov.querySelector("#salvarDesc").value || "").trim();
      var tags = (ov.querySelector("#salvarTags").value || "").split(",").map(function (t) { return t.trim(); }).filter(Boolean);
      var item = {
        id: gerarId(),
        calcId: c.id,
        nome: nome,
        categoria: c.cat,
        desc: desc,
        tags: tags,
        resultadoLabel: r.principal.label,
        resultadoValor: r.principal.valor,
        linhas: r.linhas || [],
        data: new Date().toISOString(),
      };
      historico.unshift(item);
      salvarLS(LS_HIST, historico);
      ov.remove();
      renderHistorico();
      toast("Cálculo salvo!");
    });
    setTimeout(function () { ov.querySelector("#salvarNome").focus(); }, 40);
  }

  var buscaHist = "";
  function renderHistorico() {
    var host = document.getElementById("calcHistLista");
    if (!host) return;
    var lista = historico;
    if (buscaHist) {
      var t = buscaHist.toLowerCase();
      lista = lista.filter(function (h) {
        return (h.nome + " " + h.categoria + " " + (h.tags || []).join(" ")).toLowerCase().indexOf(t) >= 0;
      });
    }
    if (!lista.length) {
      host.innerHTML = '<div class="calc-hist-vazio">' + (historico.length ? "Nada encontrado." : "Nenhum cálculo salvo ainda.<br>Faça um cálculo e clique em “Salvar”.") + "</div>";
      return;
    }
    host.innerHTML = lista.map(function (h) {
      var d = new Date(h.data);
      var dataTxt = ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear();
      var tagsHtml = (h.tags || []).map(function (t) { return '<span class="calc-hist-tag">' + esc(t) + "</span>"; }).join("");
      return (
        '<div class="calc-hist-card" data-hist-id="' + h.id + '">' +
          '<div class="calc-hist-card-top">' +
            '<span class="calc-hist-cat">' + esc(h.categoria) + "</span>" +
            '<div class="calc-hist-acoes">' +
              '<button data-hist-acao="duplicar" data-id="' + h.id + '" title="Duplicar">⧉</button>' +
              '<button data-hist-acao="excluir" data-id="' + h.id + '" title="Excluir">✕</button>' +
            "</div>" +
          "</div>" +
          '<div class="calc-hist-nome">' + esc(h.nome) + "</div>" +
          '<div class="calc-hist-res">' + esc(h.resultadoLabel) + ": <strong>" + esc(h.resultadoValor) + "</strong></div>" +
          (h.desc ? '<div class="calc-hist-desc">' + esc(h.desc) + "</div>" : "") +
          (tagsHtml ? '<div class="calc-hist-tags">' + tagsHtml + "</div>" : "") +
          '<div class="calc-hist-data">' + dataTxt + "</div>" +
        "</div>"
      );
    }).join("");

    // Abrir a calculadora ao clicar no card
    host.querySelectorAll(".calc-hist-card").forEach(function (el) {
      el.addEventListener("click", function () {
        var h = historico.find(function (x) { return x.id === el.dataset.histId; });
        if (h && calcPorId(h.calcId)) abrirCalc(h.calcId);
      });
    });
    // Ações
    host.querySelectorAll("[data-hist-acao]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = b.dataset.id, acao = b.dataset.histAcao;
        if (acao === "excluir") {
          historico = historico.filter(function (x) { return x.id !== id; });
          salvarLS(LS_HIST, historico);
          renderHistorico();
        } else if (acao === "duplicar") {
          var orig = historico.find(function (x) { return x.id === id; });
          if (orig) {
            var copia = Object.assign({}, orig, { id: gerarId(), nome: orig.nome + " (cópia)", data: new Date().toISOString() });
            historico.unshift(copia);
            salvarLS(LS_HIST, historico);
            renderHistorico();
          }
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  UTILIDADES: copiar, imprimir, toast
  // ═══════════════════════════════════════════════════════════
  function copiar(txt) {
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(txt);
      else {
        var ta = document.createElement("textarea");
        ta.value = txt; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); ta.remove();
      }
      toast("Copiado!");
    } catch (e) { toast("Não foi possível copiar."); }
  }

  function imprimir(c, r) {
    var linhas = (r.linhas || []).map(function (l) { return l.label + ": " + l.valor; }).join("<br>");
    var w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      "<html><head><title>" + esc(c.nome) + '</title><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;padding:40px;color:#111;">' +
      "<h1>" + esc(c.nome) + "</h1><p>" + esc(c.desc) + "</p><hr>" +
      "<h2>" + esc(r.principal.label) + ": " + esc(r.principal.valor) + "</h2>" +
      "<p>" + linhas + "</p>" +
      (r.obs ? "<p><em>" + esc(r.obs) + "</em></p>" : "") +
      "<hr><small>Bapell Gestor Pro — Central de Cálculos — " + new Date().toLocaleString("pt-BR") + "</small>" +
      "</body></html>"
    );
    w.document.close();
    w.print();
  }

  function toast(msg) {
    var t = document.createElement("div");
    t.className = "calc-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("visivel"); }, 10);
    setTimeout(function () { t.classList.remove("visivel"); setTimeout(function () { t.remove(); }, 300); }, 2200);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ═══════════════════════════════════════════════════════════
  //  INICIALIZAÇÃO
  // ═══════════════════════════════════════════════════════════
  function init() {
    // data no header
    var dt = document.getElementById("currentDate");
    if (dt) { var d = new Date(); dt.textContent = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }); }

    // busca do menu
    var busca = document.getElementById("calcBusca");
    if (busca) busca.addEventListener("input", function () { termoBusca = busca.value.trim(); renderMenu(); });

    // busca do histórico
    var bh = document.getElementById("calcHistBusca");
    if (bh) bh.addEventListener("input", function () { buscaHist = bh.value.trim(); renderHistorico(); });

    if (!CALCS.length) {
      console.error("[Central de Cálculos] Nenhuma calculadora registrada. " +
        "Verifique se os arquivos de Calculos/ estão sendo carregados no calculos.html, " +
        "DEPOIS de JS/calculos.js.");
    }

    renderMenu();
    renderHistorico();

    // abre a primeira calculadora por padrão (ou a última recente)
    var inicial = CALCS[0] && CALCS[0].id;
    if (inicial) abrirCalc(inicial);
  }

  // A interface só é montada quando TODOS os <script> da página já rodaram —
  // ou seja, quando os lotes de Calculos/ já se registraram. O antigo
  // `else init()` inicializava na hora e produziria uma Central vazia.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    // Documento já pronto (script carregado tarde): adia um ciclo para não
    // correr na frente de outros scripts da mesma página.
    setTimeout(init, 0);
  }
})();

/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — lembrete-aviso.js
   A janela de aviso de lembrete (lembrete-aviso.html).

   O processo principal (main.js) abre esta janela no canto da tela quando
   um ou mais lembretes vencem e manda a FILA: as chaves "id@dataHora" dos
   que venceram. Aqui cada um aparece de uma vez ("1 de 3"), lido do mesmo
   armazenamento do app (precifiq_lembretes), com:
     · Concluir        — marca o lembrete como concluído;
     · Abrir lembrete  — mostra o app com a ficha do lembrete;
     · Lembrar de novo — adia o aviso (5 min, 15 min, 30 min, 1 hora ou
                         amanhã às 9h); o lembrete não muda;
     · ✕               — dispensa este aviso.
   Sem nada na fila, o processo principal fecha a janela.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var API = window.avisoAPI;
  var LS_KEY = "precifiq_lembretes";

  var fila = [];        // chaves "id@dataHora"
  var indice = 0;       // qual da fila está à vista
  var ocupado = false;  // uma ação em andamento (evita clique duplo)

  var SVG = {
    valor: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
    pessoa: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
    empresa: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><path d="M9 22v-4h6v4"></path></svg>',
    autor: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>',
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ── Dados ──────────────────────────────────────────────────────────
  function lerLembretes() {
    try {
      var a = JSON.parse(localStorage.getItem(LS_KEY));
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  /** O lembrete de uma chave — null se sumiu, mudou de data ou já foi resolvido. */
  function lembreteDa(chave) {
    var arroba = chave.indexOf("@");
    if (arroba < 0) return null;
    var id = chave.slice(0, arroba);
    var dataHora = chave.slice(arroba + 1);
    var l = lerLembretes().find(function (x) { return x && x.id === id; });
    if (!l || l.dataHora !== dataHora || l.concluido || l.oculto) return null;
    return l;
  }

  /**
   * Lembretes protegido por senha (Dados da Empresa › Usuários e Senhas):
   * concluir fica para dentro do app, depois da senha. O aviso continua
   * avisando, e "Abrir lembrete" leva à tela (que pede a senha).
   * Vale para o módulo bloqueado e para o botão "Concluir um lembrete"
   * marcado em Senha nos botões (lá ele pede usuário e senha).
   */
  function lembretesProtegido() {
    try {
      var s = JSON.parse(localStorage.getItem("precifiq_senhas"));
      if (!(s && s.admin)) return false;
      if (s.modulos && s.modulos.lembretes === true) return true;
      var b = JSON.parse(localStorage.getItem("precifiq_senha_botoes"));
      return !!(b && b.ativo && b.botoes && b.botoes["lem:concluir"] === true);
    } catch (e) { return false; }
  }

  // ── Textos ─────────────────────────────────────────────────────────
  function doisDig(n) { return ("0" + n).slice(-2); }

  /** "hoje às 14:30 · há 5 min", "ontem às 09:00", "02/10/2026 às 09:00". */
  function textoQuando(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return { texto: "", minutos: 0 };
    var agora = new Date();
    var hora = doisDig(d.getHours()) + ":" + doisDig(d.getMinutes());
    var hoje0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
    var dia0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var dias = Math.round((hoje0 - dia0) / 86400000);
    var quando;
    if (dias === 0) quando = "hoje às " + hora;
    else if (dias === 1) quando = "ontem às " + hora;
    else quando = doisDig(d.getDate()) + "/" + doisDig(d.getMonth() + 1) + "/" + d.getFullYear() + " às " + hora;
    var minutos = Math.max(0, Math.floor((agora - d) / 60000));
    var ha = "";
    if (minutos < 1) ha = "agora";
    else if (minutos < 60) ha = "há " + minutos + " min";
    else if (minutos < 24 * 60) ha = "há " + Math.floor(minutos / 60) + " h";
    return { texto: "Venceu " + quando + (ha ? " · " + ha : ""), minutos: minutos };
  }

  function meta(classe, svg, texto) {
    return '<span class="av-meta' + (classe ? " " + classe : "") + '" title="' + esc(texto) + '">' + svg + "<span>" + esc(texto) + "</span></span>";
  }

  // ── Tela ───────────────────────────────────────────────────────────
  /** Tira da fila o que já não precisa de aviso (concluído em outra tela…). */
  function limparFila() {
    var validas = [];
    fila.forEach(function (chave) {
      if (lembreteDa(chave)) validas.push(chave);
      else if (API) API.resolvido(chave);
    });
    fila = validas;
    if (indice >= fila.length) indice = Math.max(0, fila.length - 1);
  }

  function render() {
    limparFila();
    var chave = fila[indice];
    var l = chave ? lembreteDa(chave) : null;
    if (!l) { medir(); return; } // fila vazia: o processo principal fecha a janela

    var q = textoQuando(l.dataHora);
    // Mais de 1 hora de atraso: o aviso fica vermelho, como o "Vencido".
    $("aviso").classList.toggle("av--atrasado", q.minutos >= 60);
    $("avTitulo").textContent = l.titulo || "Lembrete";
    $("avSelo").textContent = q.minutos >= 60 ? "Vencido" : "Agora";
    $("avQuandoTxt").textContent = q.texto;

    var metas = "";
    if (l.valor) metas += meta("av-meta--valor", SVG.valor, l.valorTipo === "rs" ? "R$ " + l.valor : l.valor);
    if (l.recebedor) metas += meta("", SVG.pessoa, l.recebedor);
    if (l.empresaNome) metas += meta("", SVG.empresa, l.empresaNome);
    if (l.criadoPor) metas += meta("", SVG.autor, "Por " + l.criadoPor);
    $("avMetas").innerHTML = metas;

    var obs = $("avObs");
    obs.hidden = !l.observacoes;
    obs.textContent = l.observacoes || "";

    var protegido = lembretesProtegido();
    $("avConcluir").hidden = protegido;
    $("aviso").classList.toggle("av--protegido", protegido);

    var nav = $("avNav");
    nav.hidden = fila.length < 2;
    $("avContador").textContent = (indice + 1) + " de " + fila.length;
    $("avAnterior").disabled = indice === 0;
    $("avProximo").disabled = indice >= fila.length - 1;
    $("avDispensar").title = fila.length > 1 ? "Dispensar este aviso" : "Fechar";
    $("avDispensar").setAttribute("aria-label", $("avDispensar").title);
    document.title = "Lembrete: " + (l.titulo || "");
    medir();
  }

  /** A janela acompanha a altura do conteúdo. */
  function medir() {
    if (!API) return;
    requestAnimationFrame(function () {
      var h = $("aviso").getBoundingClientRect().height;
      API.altura(Math.ceil(h));
    });
  }

  // ── Som ────────────────────────────────────────────────────────────
  // Dois toques curtos, gerados aqui mesmo (sem arquivo de áudio).
  function tocar() {
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      var ctx = new C();
      [[880, 0], [1318.5, 0.17]].forEach(function (n) {
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        var t = ctx.currentTime + n[1];
        o.type = "sine";
        o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.6);
      });
      setTimeout(function () { try { ctx.close(); } catch (e) {} }, 1300);
    } catch (e) {}
  }

  function receberFila(nova) {
    var anterior = fila[indice];
    var antes = fila.slice();
    fila = Array.isArray(nova) ? nova.slice() : [];
    // Novo é o que não estava na fila — inclusive um lembrete adiado que
    // voltou com a janela ainda aberta: ele vai para a frente, com som.
    var novas = fila.filter(function (c) { return antes.indexOf(c) < 0; });
    if (novas.length) {
      // Chegou lembrete novo: ele vai para a frente.
      indice = fila.indexOf(novas[0]);
      tocar();
    } else {
      var i = fila.indexOf(anterior);
      indice = i >= 0 ? i : Math.min(indice, Math.max(0, fila.length - 1));
    }
    ocupado = false;
    render();
  }

  // ── Ações ──────────────────────────────────────────────────────────
  function atual() { return fila[indice] || ""; }

  function concluir() {
    var chave = atual();
    if (!chave || ocupado || lembretesProtegido()) return;
    var arroba = chave.indexOf("@");
    var id = chave.slice(0, arroba);
    var lista = lerLembretes();
    var l = lista.find(function (x) { return x && x.id === id; });
    if (l) {
      l.concluido = true;
      try { localStorage.setItem(LS_KEY, JSON.stringify(lista)); }
      catch (e) { console.error("[Aviso] não foi possível concluir o lembrete:", e); return; }
    }
    ocupado = true;
    API.resolvido(chave);
  }

  function abrir() {
    var chave = atual();
    if (!chave || ocupado) return;
    ocupado = true;
    API.abrir(chave);
  }

  function adiar(minutos, amanha) {
    var chave = atual();
    if (!chave || ocupado) return;
    var quando = 0;
    if (amanha) {
      var d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      quando = d.getTime();
    }
    ocupado = true;
    API.adiar(chave, minutos, quando);
  }

  function dispensar() {
    var chave = atual();
    if (!chave) { API.fechar(); return; }
    if (ocupado) return;
    ocupado = true;
    API.resolvido(chave);
  }

  function ligar() {
    if (!API) {
      console.error("[Aviso] avisoAPI indisponível: esta janela só funciona dentro do app.");
      return;
    }
    $("avConcluir").addEventListener("click", concluir);
    $("avAbrir").addEventListener("click", abrir);
    $("avDispensar").addEventListener("click", dispensar);
    $("avAnterior").addEventListener("click", function () { if (indice > 0) { indice--; render(); } });
    $("avProximo").addEventListener("click", function () { if (indice < fila.length - 1) { indice++; render(); } });
    Array.prototype.forEach.call(document.querySelectorAll("#avAdiar .av-chip"), function (b) {
      b.addEventListener("click", function () {
        adiar(Number(b.getAttribute("data-min")) || 0, b.getAttribute("data-amanha") === "1");
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); dispensar(); }
    });
    // O lembrete mudou no app (concluído, editado, excluído): acompanha.
    window.addEventListener("storage", function (e) {
      if (e.key === LS_KEY || e.key === "precifiq_senhas" || e.key === null) render();
      if (e.key === "precifiq_theme" && e.newValue) {
        document.documentElement.setAttribute("data-theme", e.newValue);
      }
    });
    // "há 5 min" envelhece: atualiza a cada minuto.
    setInterval(render, 60000);

    API.aoMudarFila(receberFila);
    API.fila().then(receberFila);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ligar);
  else ligar();
})();

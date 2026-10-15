/* ══════════════════════════════════════════════════════════════
   DATEPICKER reutilizável — Bapell Gestor Pro
   Aprimora todo <input type="date"> (exceto os com data-no-picker):
   esconde o calendário nativo e coloca um próprio, bonito.
   Mantém o .value do input intacto e dispara "change"/"input",
   então nenhuma lógica existente precisa mudar.
   ══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  var aberto = null; // popup atualmente aberto

  function pad(n) { return ("0" + n).slice(-2); }
  function hojeISO() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function fmtBR(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    if (p.length < 3) return "";
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  function svgCal() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>';
  }

  function fecharTodos() {
    if (aberto) { aberto.classList.remove("aberto"); aberto = null; }
  }

  function enhance(input) {
    if (input.__dtp) return;
    input.__dtp = true;

    // Envolve o input e o esconde (mantém no DOM para guardar o valor)
    var wrap = document.createElement("span");
    wrap.className = "dtp-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.style.display = "none";

    // Botão-gatilho com a cara de campo (herda classes/estilo do input)
    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = (input.className || "") + " dtp-field";
    var inl = input.getAttribute("style") || "";
    inl = inl.replace(/display\s*:\s*none;?/i, "");
    trigger.setAttribute("style", inl);
    trigger.innerHTML = '<span class="dtp-label"></span>' + svgCal();
    wrap.appendChild(trigger);

    // Popup
    var pop = document.createElement("div");
    pop.className = "dtp-pop";
    pop.innerHTML =
      '<div class="dtp-head">' +
        '<button type="button" class="dtp-nav" data-nav="-1">‹</button>' +
        '<span class="dtp-tit"></span>' +
        '<button type="button" class="dtp-nav" data-nav="1">›</button>' +
      '</div>' +
      '<div class="dtp-dows"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div>' +
      '<div class="dtp-grid"></div>' +
      '<div class="dtp-foot">' +
        '<button type="button" data-hoje>Hoje</button>' +
        '<button type="button" data-limpar>Limpar</button>' +
      '</div>';
    wrap.appendChild(pop);

    var labelEl = trigger.querySelector(".dtp-label");
    var titEl = pop.querySelector(".dtp-tit");
    var gridEl = pop.querySelector(".dtp-grid");
    var view = { y: 0, m: 0 };

    function syncLabel() {
      var v = input.value;
      if (v) { labelEl.textContent = fmtBR(v); labelEl.classList.remove("vazio"); }
      else { labelEl.textContent = "dd/mm/aaaa"; labelEl.classList.add("vazio"); }
    }

    // Espelha alterações programáticas de .value no rótulo
    var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    try {
      Object.defineProperty(input, "value", {
        get: function () { return desc.get.call(this); },
        set: function (x) { desc.set.call(this, x); syncLabel(); },
        configurable: true,
      });
    } catch (e) {}

    function renderCal() {
      titEl.textContent = MESES[view.m] + " " + view.y;
      gridEl.innerHTML = "";
      var primeiro = new Date(view.y, view.m, 1).getDay();
      var dias = new Date(view.y, view.m + 1, 0).getDate();
      var selISO = input.value;
      var hj = hojeISO();
      var i;
      for (i = 0; i < primeiro; i++) {
        var vazio = document.createElement("div");
        vazio.className = "dtp-day vazio";
        gridEl.appendChild(vazio);
      }
      for (var d = 1; d <= dias; d++) {
        var iso = view.y + "-" + pad(view.m + 1) + "-" + pad(d);
        var b = document.createElement("button");
        b.type = "button";
        b.className = "dtp-day";
        b.textContent = d;
        if (iso === hj) b.classList.add("hoje");
        if (iso === selISO) b.classList.add("sel");
        (function (isoDia) { b.addEventListener("click", function () { setData(isoDia); }); })(iso);
        gridEl.appendChild(b);
      }
    }

    function posicionar() {
      pop.classList.remove("acima", "direita");
      var r = trigger.getBoundingClientRect();
      var direita = r.left + 268 > window.innerWidth;
      if (r.bottom + 360 > _limiteDeBaixo(r, direita) && r.top > 360) pop.classList.add("acima");
      if (direita) pop.classList.add("direita");
    }
    // Onde o calendário pode ir até embaixo: o fim da janela — ou o topo da
    // barra fixa "Cancelar / Salvar" (canto inferior direito), quando ela
    // ficaria por cima dele.
    function _limiteDeBaixo(r, direita) {
      var lim = window.innerHeight;
      try {
        var barra = document.querySelector(".barra-salvar");
        if (!barra) return lim;
        var rb = barra.getBoundingClientRect();
        if (!rb.height || getComputedStyle(barra).visibility === "hidden") return lim;
        var esq = direita ? r.right - 268 : r.left;
        if (esq < rb.right && esq + 268 > rb.left) lim = Math.min(lim, rb.top - 8);
      } catch (e) {}
      return lim;
    }
    function abrir() {
      fecharTodos();
      var base = input.value ? new Date(input.value + "T00:00") : new Date();
      if (isNaN(base)) base = new Date();
      view.y = base.getFullYear(); view.m = base.getMonth();
      renderCal();
      posicionar();
      pop.classList.add("aberto");
      aberto = pop;
    }
    function fechar() { pop.classList.remove("aberto"); if (aberto === pop) aberto = null; }

    function setData(iso) {
      input.value = iso; // dispara nosso setter → atualiza rótulo
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      fechar();
    }

    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      if (pop.classList.contains("aberto")) fechar(); else abrir();
    });
    pop.addEventListener("click", function (e) {
      var nav = e.target.closest("[data-nav]");
      if (nav) {
        view.m += parseInt(nav.dataset.nav, 10);
        if (view.m < 0) { view.m = 11; view.y--; }
        if (view.m > 11) { view.m = 0; view.y++; }
        renderCal();
        return;
      }
      if (e.target.closest("[data-hoje]")) { setData(hojeISO()); return; }
      if (e.target.closest("[data-limpar]")) {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        fechar();
        return;
      }
    });

    syncLabel();
  }

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".dtp-wrap")) fecharTodos();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") fecharTodos(); });

  function init() {
    var campos = document.querySelectorAll('input[type="date"]:not([data-no-picker])');
    for (var i = 0; i < campos.length; i++) enhance(campos[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // Exposto caso queira aprimorar campos criados depois
  window.Datepicker = { enhance: enhance, init: init };
})();

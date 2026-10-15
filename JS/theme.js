// ═══════════════════════════════════════════
//  Bapell Gestor Pro — theme.js
//  Sistema de troca de tema (Claro / Padrão / Dark)
// ═══════════════════════════════════════════

(function () {
  "use strict";

  var THEME_KEY = "precifiq_theme";
  var THEMES = ["light", "dark", "midnight"];

  function getCurrentTheme() {
    try {
      var saved = localStorage.getItem(THEME_KEY);
      return THEMES.indexOf(saved) >= 0 ? saved : "dark";
    } catch (e) {
      return "dark";
    }
  }

  // aplica o tema no documento. persistir=false é usado quando a mudança
  // veio de OUTRA aba (via storage), para não regravar e evitar eco.
  function applyTheme(theme, persistir) {
    if (THEMES.indexOf(theme) < 0) theme = "dark";
    document.documentElement.setAttribute("data-theme", theme);

    if (persistir !== false) {
      try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    }

    // Atualiza o estado visual dos botões, se existirem nesta página
    var botoes = document.querySelectorAll(".theme-btn[data-theme-value]");
    for (var i = 0; i < botoes.length; i++) {
      botoes[i].classList.toggle("active", botoes[i].dataset.themeValue === theme);
    }
  }

  function vincular() {
    // Reforça o tema (já aplicado via script inline no <head>)
    applyTheme(getCurrentTheme());

    // Vincula os botões do seletor, se presentes na página
    var botoes = document.querySelectorAll(".theme-btn[data-theme-value]");
    for (var i = 0; i < botoes.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          applyTheme(btn.dataset.themeValue);
          if (typeof showToast === "function") {
            var labels = { light: "Modo Claro", dark: "Modo Padrão", midnight: "Modo Dark Absoluto" };
            showToast("Tema alterado para " + labels[btn.dataset.themeValue] + ".", "success");
          }
        });
      })(botoes[i]);
    }
  }

  // Propaga a troca de tema entre TODAS as telas abertas ao mesmo tempo.
  // O evento 'storage' dispara nos OUTROS contextos de mesma origem (as
  // outras abas e a casca), então cada um se atualiza sem regravar.
  // Sem isto, trocar o tema numa aba deixava as demais — e a barra de
  // abas — no tema antigo até reiniciar o app.
  window.addEventListener("storage", function (e) {
    if (e.key === THEME_KEY) applyTheme(getCurrentTheme(), false);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", vincular);
  } else {
    vincular();
  }
})();

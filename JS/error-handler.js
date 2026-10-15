/* ══════════════════════════════════════════════════════════════
   ERROR HANDLER — Captura global de erros
   ══════════════════════════════════════════════════════════════
   Num app empacotado (.exe) o usuário não tem console (F12).
   Sem isso, um erro vira "tela branca" ou "botão que não faz nada"
   e você não tem como investigar.

   Este módulo:
     1. Captura exceções não tratadas e promises rejeitadas
     2. Captura falha de carregamento de recurso (script/img)
     3. Avisa o usuário de forma visível (sem jargão técnico)
     4. Guarda um histórico dos últimos erros para diagnóstico
     5. Permite exportar o log, já carimbado com a versão do app

   Deve ser o PRIMEIRO script carregado em cada página.
   ══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const LOG_KEY = "precifiq_error_log";
  const VERSAO_KEY = "precifiq_app_versao"; // gravada pelo preload.js no boot
  const MAX_ERROS = 50;                     // guarda os últimos 50
  const SAVE_DEBOUNCE_MS = 400;             // agrupa gravações em rajada

  // ── Versão do app ──
  // Vem do processo principal (app.getVersion) via preload. Nas abas o
  // preload não roda, então o valor é lido do localStorage, que o preload
  // preencheu no frame principal antes de tudo carregar.
  function _versaoApp() {
    try {
      if (window.appAPI && window.appAPI.versao) return window.appAPI.versao;
    } catch (e) {}
    try {
      return localStorage.getItem(VERSAO_KEY) || "desconhecida";
    } catch (e) {
      return "desconhecida";
    }
  }

  // ── Armazenamento do log ──
  function _lerLog() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOG_KEY));
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  // O log vive em memória e é descarregado em rajada.
  // Antes, CADA erro fazia: JSON.parse(~127KB) + push + JSON.stringify(~127KB)
  // + setItem síncrono. Um erro dentro de um laço de render (200 iterações)
  // travava o app mais que o próprio erro.
  let _logMem = null;
  let _saveAgendado = false;

  function _gravarErro(registro) {
    if (!_logMem) _logMem = _lerLog();

    // Erro idêntico ao anterior (típico de laço): conta em vez de empilhar.
    const ult = _logMem[_logMem.length - 1];
    if (
      ult &&
      ult.tipo === registro.tipo &&
      ult.mensagem === registro.mensagem &&
      ult.tela === registro.tela
    ) {
      ult.repeticoes = (ult.repeticoes || 1) + 1;
      ult.ultimaVez = registro.quando;
    } else {
      _logMem.push(registro);
      while (_logMem.length > MAX_ERROS) _logMem.shift();
    }
    _agendarSave();
  }

  function _agendarSave() {
    if (_saveAgendado) return;
    _saveAgendado = true;
    setTimeout(_salvarAgora, SAVE_DEBOUNCE_MS);
  }

  function _salvarAgora() {
    _saveAgendado = false;
    if (!_logMem) return;
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(_logMem));
    } catch (e) {
      // Se nem o log consegue gravar (cota cheia), não há o que fazer
      console.error("Não foi possível gravar o log de erros:", e);
    }
  }

  // Descarrega o que estiver pendente antes de a página morrer.
  // setItem é síncrono, então isto funciona em beforeunload.
  window.addEventListener("beforeunload", function () {
    if (_saveAgendado) _salvarAgora();
  });

  // ── Aviso visual ao usuário ──
  let _avisoVisivel = false;

  function _avisarUsuario(mensagemCurta) {
    // Evita empilhar avisos em caso de erro repetido (ex: dentro de um loop)
    if (_avisoVisivel) return;
    _avisoVisivel = true;
    setTimeout(() => (_avisoVisivel = false), 5000);

    // Usa o toast do sistema, se disponível
    if (typeof showToast === "function") {
      showToast(mensagemCurta, "error", 6000);
      return;
    }

    // Fallback: banner simples, caso o erro tenha ocorrido antes do utils.js
    const div = document.createElement("div");
    div.style.cssText =
      "position:fixed; bottom:20px; right:20px; z-index:2147483647;" +
      "background:#7f1d1d; color:#fff; padding:12px 16px; border-radius:8px;" +
      "font-family:system-ui,sans-serif; font-size:13px; max-width:340px;" +
      "box-shadow:0 6px 20px rgba(0,0,0,0.35);";
    div.textContent = mensagemCurta;
    document.body && document.body.appendChild(div);
    setTimeout(() => div.remove(), 6000);
  }

  // ── Monta o registro do erro ──
  let _dentroDoConsolePatch = false; // trava anti-recursão

  function _registrar(tipo, msg, detalhe) {
    const registro = {
      quando: new Date().toISOString(),
      tela: location.pathname.split("/").pop() || "index.html",
      tipo: tipo,
      mensagem: String(msg || "").slice(0, 500),
      detalhe: String(detalhe || "").slice(0, 2000),
    };
    _gravarErro(registro);
    // Usa o console.error ORIGINAL (guardado abaixo) para não reentrar no patch.
    _dentroDoConsolePatch = true;
    try { _consoleErroOriginal.call(console, `[${tipo}]`, msg, detalhe); }
    finally { _dentroDoConsolePatch = false; }
    return registro;
  }

  // ── Captura TODOS os console.error do app ──
  // Havia ~25 console.error espalhados pelos módulos (utils, nf, empresa,
  // produto…). No .exe o usuário não tem console, então esses erros
  // desapareciam. Em vez de reescrever cada chamada, interceptamos console.error:
  // cada chamada continua indo ao console (útil no dev) E entra no log de
  // diagnóstico (útil no .exe). A trava evita que o _registrar acima reentre.
  const _consoleErroOriginal = (window.console && console.error) ? console.error.bind(console) : function () {};
  if (window.console) {
    console.error = function () {
      _consoleErroOriginal.apply(console, arguments);
      if (_dentroDoConsolePatch) return; // veio do próprio _registrar: não duplica
      try {
        const partes = Array.prototype.map.call(arguments, function (a) {
          if (a instanceof Error) return a.message + (a.stack ? "\n" + a.stack : "");
          if (typeof a === "object") { try { return JSON.stringify(a); } catch (_) { return String(a); } }
          return String(a);
        });
        const texto = partes.join(" ");
        _gravarErro({
          quando: new Date().toISOString(),
          tela: location.pathname.split("/").pop() || "index.html",
          tipo: "console",
          mensagem: texto.slice(0, 500),
          detalhe: texto.slice(0, 2000),
        });
      } catch (_) { /* nunca deixa o logger derrubar o app */ }
    };
  }

  // ── 1. Exceções não tratadas + falha de recurso ──
  // O terceiro parâmetro (capture) é OBRIGATÓRIO aqui: o evento "error" de
  // RECURSO (um <script> ou <img> que não carrega) dispara no elemento e
  // NÃO faz bubbling. Sem capture, o ramo de recurso abaixo era código
  // morto — a mensagem "Um componente do sistema não carregou" nunca
  // aparecia, justamente no cenário de "botão que não faz nada".
  window.addEventListener(
    "error",
    function (evento) {
      // Erros de carregamento de recurso (img, script) têm target, não message
      if (evento.target && evento.target !== window && evento.target.tagName) {
        const tag = evento.target.tagName.toLowerCase();
        const src = evento.target.src || evento.target.href || "";
        _registrar("recurso", `Falha ao carregar <${tag}>`, src);
        // Só avisa se for um script (crítico); imagem quebrada é menos grave
        if (tag === "script") {
          _avisarUsuario("Um componente do sistema não carregou. Reinicie o aplicativo.");
        }
        return;
      }

      const local = evento.filename
        ? `${evento.filename.split("/").pop()}:${evento.lineno}:${evento.colno}`
        : "desconhecido";
      const stack = evento.error && evento.error.stack ? evento.error.stack : local;
      _registrar("exceção", evento.message, stack);
      _avisarUsuario("Ocorreu um erro inesperado. Se persistir, exporte o log em Ajuda.");
    },
    true
  );

  // ── 2. Promises rejeitadas sem catch ──
  window.addEventListener("unhandledrejection", function (evento) {
    const motivo = evento.reason;
    const msg = motivo && motivo.message ? motivo.message : String(motivo);
    const stack = motivo && motivo.stack ? motivo.stack : "";
    _registrar("promise", msg, stack);
    _avisarUsuario("Uma operação falhou em segundo plano. Verifique se os dados foram salvos.");
  });

  // ══════════════════════════════════════════
  //  API pública (usada na tela de Ajuda)
  // ══════════════════════════════════════════
  window.PrecifiqErros = {
    /** Retorna os erros registrados (mais recentes por último) */
    listar: function () {
      return _logMem ? _logMem.slice() : _lerLog();
    },

    /** Quantos erros estão registrados */
    contar: function () {
      return (_logMem ? _logMem : _lerLog()).length;
    },

    /** Versão do app (para diagnóstico) */
    versao: _versaoApp,

    /** Apaga o histórico */
    limpar: function () {
      try {
        _logMem = [];
        _saveAgendado = false;
        localStorage.removeItem(LOG_KEY);
        return true;
      } catch {
        return false;
      }
    },

    /** Baixa o log como arquivo .txt para diagnóstico */
    exportar: function () {
      _salvarAgora(); // garante que nada pendente fique de fora
      const log = _logMem ? _logMem : _lerLog();
      if (log.length === 0) {
        if (typeof showToast === "function") showToast("Nenhum erro registrado.", "success");
        return;
      }
      const linhas = [
        "BAPELL GESTOR PRO — LOG DE ERROS",
        "Versão do app: " + _versaoApp(),
        "Gerado em: " + new Date().toLocaleString("pt-BR"),
        "Navegador: " + navigator.userAgent,
        "Total de erros: " + log.length,
        "=".repeat(70),
        "",
      ];
      log.forEach((e, i) => {
        linhas.push(`[${i + 1}] ${new Date(e.quando).toLocaleString("pt-BR")}`);
        if (e.repeticoes > 1) {
          linhas.push(
            `Repetiu: ${e.repeticoes}x (última: ${new Date(e.ultimaVez).toLocaleString("pt-BR")})`
          );
        }
        linhas.push(`Tela: ${e.tela}`);
        linhas.push(`Tipo: ${e.tipo}`);
        linhas.push(`Mensagem: ${e.mensagem}`);
        if (e.detalhe) linhas.push(`Detalhe:\n${e.detalhe}`);
        linhas.push("-".repeat(70));
      });

      const blob = new Blob([linhas.join("\n")], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bapell-erros-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    /** Registra um erro manualmente (para try/catch do seu código) */
    registrar: function (msg, detalhe) {
      return _registrar("manual", msg, detalhe);
    },
  };
})();

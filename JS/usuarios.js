/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — usuarios.js
   Tela "Usuários e Senhas" (usuarios.html), aberta por Dados da Empresa.

   ── O QUE ESTA TELA FAZ ─────────────────────────────────────────────
   · Usuários: cadastrar, alterar e excluir. Cada um tem nome e, se
     quiser, senha (mínimo de 4 caracteres). São as pessoas que aparecem
     no campo "Responsável" das outras telas.
   · O Master (o administrador principal) é o primeiro da lista. Dele só
     se muda o nome que aparece; a senha é a do Administrador (no quadro
     das senhas) e ele não pode ser excluído.
   · Senhas de acesso: a parte que era o modal "Redefinir Senhas" (as
     senhas do Administrador e do Colaborador e os módulos protegidos),
     agora dentro da tela.

   Os dados e as regras ficam no JS/senhas.js (BapellUsuarios e
   BapellSenhas); aqui é só a tela. Com a senha do Administrador criada,
   o senhas.js (data-admin) pede a senha dele antes de mostrar qualquer
   coisa — a do Colaborador não abre esta tela.

   ── QUANDO OUTRA TELA MANDA CADASTRAR ───────────────────────────────
   O Registro de Vendas (por exemplo) abre esta tela numa aba nova, com
   ?voltar=registro-vendas.html&aba=<a aba de origem>. O "Voltar" fecha
   esta aba e volta para lá, com o formulário ainda preenchido.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var U = window.BapellUsuarios;
  var S = window.BapellSenhas;

  // Nome de cada tela que pode mandar cadastrar, para o caminho de volta.
  var NOMES_TELAS = {
    "registro-vendas.html": "Registro de Vendas",
    "financeiro.html": "Controle Financeiro",
    "nf.html": "Notas Fiscais",
    "acoes-massa.html": "Ações em Massa",
    "vendas-import.html": "Processador de Planilhas",
    "lembretes.html": "Lembretes",
    "empresa.html": "Dados da Empresa",
    "devolucoes.html": "Gestor de Devoluções",
  };

  var ICO_EDITAR =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
  var ICO_EXCLUIR =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';
  var ICO_CADEADO =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
  var ICO_X =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>';

  function $(id) { return document.getElementById(id); }

  function _esc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function _avisar(msg, tipo, ms) {
    if (typeof showToast === "function") showToast(msg, tipo || "default", ms || 3200);
  }

  function _iniciais(nome) {
    var partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return "?";
    var a = partes[0].charAt(0);
    var b = partes.length > 1 ? partes[partes.length - 1].charAt(0) : "";
    return (a + b).toUpperCase();
  }

  /** Para comparar nomes: sem acento e sem diferença de maiúsculas. */
  function _chave(n) {
    var t = String(n == null ? "" : n).replace(/\s+/g, " ").trim().toLowerCase();
    try { t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
    return t;
  }

  function _quando(ms) {
    if (!ms) return "";
    try { return new Date(ms).toLocaleDateString("pt-BR"); } catch (e) { return ""; }
  }

  // ══════════════════════════════════════════
  //  CAMINHO DE VOLTA
  // ══════════════════════════════════════════
  function _parametro(nome) {
    try { return new URLSearchParams(location.search).get(nome) || ""; } catch (e) { return ""; }
  }

  /** A tela que mandou cadastrar (registro-vendas.html…) ou "". */
  function _telaDeOrigem() {
    var v = _parametro("voltar");
    return /^[a-z0-9-]+\.html$/i.test(v) ? v.toLowerCase() : "";
  }

  function _voltar() {
    if (S && typeof S.sairDaTelaAdmin === "function") { S.sairDaTelaAdmin("empresa.html"); return; }
    window.location.href = _telaDeOrigem() || "empresa.html";
  }

  /** O aviso no topo: "volte para o Registro de Vendas". */
  function _atualizarRetorno() {
    var origem = _telaDeOrigem();
    var faixa = $("usrRetorno");
    if (!faixa) return;
    if (!origem || origem === "empresa.html") { faixa.hidden = true; return; }
    var nomeTela = NOMES_TELAS[origem] || "a tela anterior";
    var temUsuarios = U && U.listar().length > 0;
    $("usrRetornoTxt").innerHTML = temUsuarios
      ? "Pronto para continuar? Volte para <strong>" + _esc(nomeTela) + "</strong> e escolha o responsável."
      : "Cadastre ao menos um usuário e depois volte para <strong>" + _esc(nomeTela) + "</strong> para continuar.";
    $("usrRetornoBtn").textContent = "Voltar para " + nomeTela;
    faixa.hidden = false;
    faixa.classList.toggle("usr-retorno--pronto", !!temUsuarios);
  }

  // ══════════════════════════════════════════
  //  LISTA DE USUÁRIOS
  // ══════════════════════════════════════════
  function renderLista() {
    var lista = U ? U.listar() : [];
    var box = $("usrLista");
    $("usrContador").textContent = String(lista.length);
    $("usrVazio").hidden = lista.length > 0;
    box.hidden = lista.length === 0;
    var nomesComuns = {};
    lista.forEach(function (u) { if (!u.master) nomesComuns[_chave(u.nome)] = true; });
    box.innerHTML = lista.map(function (u) {
      if (u.master) return _linhaMaster(u, !!nomesComuns[_chave(u.nome)]);
      var detalhe = u.temSenha
        ? '<span class="usr-selo usr-selo--senha">' + ICO_CADEADO + " Com senha</span>"
        : '<span class="usr-selo">Sem senha</span>';
      var desde = u.criadoEm ? '<span class="usr-linha__desde">Desde ' + _esc(_quando(u.criadoEm)) + "</span>" : "";
      return (
        '<div class="usr-linha" data-id="' + _esc(u.id) + '">' +
          '<span class="usr-avatar" aria-hidden="true">' + _esc(_iniciais(u.nome)) + "</span>" +
          '<div class="usr-linha__txt">' +
            '<span class="usr-linha__nome">' + _esc(u.nome) + "</span>" +
            '<span class="usr-linha__meta">' + detalhe + desde + "</span>" +
          "</div>" +
          '<div class="usr-linha__acoes">' +
            '<button type="button" class="usr-acao" data-a="editar" title="Editar ' + _esc(u.nome) + '">' + ICO_EDITAR + "<span>Editar</span></button>" +
            '<button type="button" class="usr-acao usr-acao--perigo" data-a="excluir" title="Excluir ' + _esc(u.nome) + '">' + ICO_EXCLUIR + "<span>Excluir</span></button>" +
          "</div>" +
        "</div>"
      );
    }).join("");
    _atualizarRetorno();
  }

  /**
   * O Master: o primeiro da lista, com o selo e sem "Excluir". A senha dele
   * é a do Administrador (definida no quadro das senhas).
   */
  function _linhaMaster(u, nomeRepetido) {
    var senha = u.temSenha
      ? '<span class="usr-selo usr-selo--senha">' + ICO_CADEADO + " Senha do Administrador</span>"
      : '<span class="usr-selo" title="Crie a senha do Administrador no quadro Senhas de acesso">Sem senha</span>';
    var aviso = nomeRepetido
      ? '<span class="usr-selo usr-selo--alerta" title="Há outro usuário com este nome. Mude o nome de um deles.">Nome repetido</span>'
      : "";
    return (
      '<div class="usr-linha usr-linha--master" data-id="' + _esc(u.id) + '">' +
        '<span class="usr-avatar usr-avatar--master" aria-hidden="true">' + _esc(_iniciais(u.nome)) + "</span>" +
        '<div class="usr-linha__txt">' +
          '<span class="usr-linha__nome">' + _esc(u.nome) + "</span>" +
          '<span class="usr-linha__meta"><span class="usr-selo usr-selo--master">Master</span>' + senha + aviso +
            '<span class="usr-linha__desde">Administrador principal</span></span>' +
        "</div>" +
        '<div class="usr-linha__acoes">' +
          '<button type="button" class="usr-acao" data-a="editar" title="Mudar o nome do Master">' + ICO_EDITAR + "<span>Editar</span></button>" +
        "</div>" +
      "</div>"
    );
  }

  function _aoClicarLista(e) {
    var btn = e.target.closest(".usr-acao");
    if (!btn) return;
    var linha = btn.closest(".usr-linha");
    var u = linha ? U.obter(linha.getAttribute("data-id")) : null;
    if (!u) { renderLista(); return; }
    if (btn.getAttribute("data-a") === "editar") abrirModal(u);
    else if (!u.master) excluir(u); // o Master não é excluído
  }

  function excluir(u) {
    var texto = "Ele sai da lista de responsáveis. Os lançamentos que já têm o nome dele continuam como estão.";
    var confirmar = window.BapellModal
      ? window.BapellModal.confirmar({
          titulo: 'Excluir o usuário "' + u.nome + '"?',
          texto: texto,
          botao: "Excluir usuário",
          perigo: true,
        })
      : Promise.resolve(false);
    confirmar.then(function (sim) {
      if (!sim) return;
      if (U.remover(u.id)) {
        _avisar('Usuário "' + u.nome + '" excluído.', "success");
        renderLista();
      }
    });
  }

  // ══════════════════════════════════════════
  //  JANELA DE CADASTRO / EDIÇÃO
  // ══════════════════════════════════════════
  function abrirModal(u) {
    if ($("usrModal")) return;
    var editando = !!u;
    // O Master: só o nome (a senha é a do Administrador, no quadro das senhas).
    var master = !!(u && u.master);
    var focoAntes = document.activeElement;
    var min = (U && U.minimoSenha) || 4;

    var fundo = document.createElement("div");
    fundo.className = "modal-overlay usr-modal-fundo";
    fundo.id = "usrModal";
    fundo.setAttribute("role", "dialog");
    fundo.setAttribute("aria-modal", "true");
    fundo.setAttribute("aria-labelledby", "usrModalTitulo");
    fundo.innerHTML =
      '<div class="modal usr-modal">' +
        '<div class="usr-modal__topo">' +
          '<div class="modal-title" id="usrModalTitulo">' + (master ? "Editar o Master" : (editando ? "Editar usuário" : "Novo usuário")) + "</div>" +
          '<button type="button" class="bsn-x" id="usrModalX" title="Fechar" aria-label="Fechar">' + ICO_X + "</button>" +
        "</div>" +
        '<div class="modal-subtitle usr-modal__sub">' +
          (master
            ? "O Master é o administrador principal do sistema. Escolha o nome que aparece no campo Responsável e nas " +
              "confirmações. Ele continua sendo o administrador: a senha é a do Administrador, no quadro Senhas de acesso."
            : (editando
              ? "Altere o nome ou a senha. Deixe a senha em branco para manter a atual."
              : "O nome aparece no campo Responsável. A senha é opcional.")) +
        "</div>" +
        '<div class="usr-campos">' +
          '<div class="field-group usr-campo usr-campo--cheio">' +
            '<label for="usrNome">Nome *</label>' +
            '<input type="text" id="usrNome" class="input-field" maxlength="60" autocomplete="off" placeholder="' +
              (master ? "Ex.: Carlos" : "Ex.: Maria Souza") + '" />' +
          "</div>" +
          (master ? "" :
          '<div class="field-group usr-campo">' +
            '<label for="usrSenha">' + (editando && u.temSenha ? "Nova senha" : "Senha") + "</label>" +
            '<input type="password" id="usrSenha" class="input-field" autocomplete="new-password" placeholder="' +
              (editando && u.temSenha ? "Em branco: mantém a atual" : "Opcional") + '" />' +
          "</div>" +
          '<div class="field-group usr-campo">' +
            '<label for="usrSenhaConf">Confirmar senha</label>' +
            '<input type="password" id="usrSenhaConf" class="input-field" autocomplete="new-password" />' +
          "</div>") +
        "</div>" +
        (master ? "" :
        '<small class="bsn-dica usr-dica">Mínimo de ' + min + " caracteres. Com senha, ela é pedida sempre que este usuário " +
          "for escolhido como responsável de um lançamento.</small>") +
        (editando && u.temSenha && !master
          ? '<label class="bsn-check usr-remover-senha">' +
              '<input type="checkbox" id="usrRemoverSenha" />' +
              '<span class="bsn-check__txt"><strong>Remover a senha deste usuário</strong>' +
              "<small>Ele passa a ser aceito como responsável sem digitar senha.</small></span>" +
            "</label>"
          : "") +
        '<div class="modal-actions">' +
          '<button type="button" class="btn-secondary" id="usrCancelar">Cancelar</button>' +
          '<button type="button" class="btn-primary" id="usrSalvar">' + (editando ? "Salvar alterações" : "Cadastrar usuário") + "</button>" +
        "</div>" +
      "</div>";
    document.body.appendChild(fundo);

    var inpNome = $("usrNome");
    var inpSenha = $("usrSenha");
    var inpConf = $("usrSenhaConf");
    var chkRemover = $("usrRemoverSenha");
    var btnSalvar = $("usrSalvar");
    inpNome.value = editando ? u.nome : "";

    // Marcar "remover a senha" desliga os campos de senha nova.
    if (chkRemover) {
      chkRemover.addEventListener("change", function () {
        inpSenha.disabled = inpConf.disabled = chkRemover.checked;
        if (chkRemover.checked) {
          inpSenha.value = inpConf.value = "";
          if (window.BapellCampos) { window.BapellCampos.limpar(inpSenha); window.BapellCampos.limpar(inpConf); }
        }
      });
    }

    function fechar() {
      document.removeEventListener("keydown", tecla, true);
      fundo.remove();
      try { if (focoAntes && focoAntes.isConnected) focoAntes.focus({ preventScroll: true }); } catch (e) {}
    }
    function tecla(e) {
      // Uma confirmação por cima (Esc dela) não fecha esta janela.
      if (document.querySelector(".bm-overlay, .bsn-camada")) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(); }
    }
    document.addEventListener("keydown", tecla, true);
    $("usrModalX").addEventListener("click", fechar);
    $("usrCancelar").addEventListener("click", fechar);
    fundo.addEventListener("mousedown", function (e) { if (e.target === fundo) fechar(); });
    [inpNome, inpSenha, inpConf].forEach(function (inp) {
      if (!inp) return; // o Master não tem os campos de senha
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); salvar(); } });
    });

    function erroNoCampo(el, msg) {
      _avisar(msg, "warning", 4200);
      if (window.BapellCampos) {
        window.BapellCampos.marcar(el);
        window.BapellCampos.focar(el);
      } else {
        try { el.focus(); } catch (e) {}
      }
    }

    function salvar() {
      if (btnSalvar.disabled) return;
      var nome = inpNome.value;
      var senha = master || (chkRemover && chkRemover.checked) ? "" : inpSenha.value;
      var conf = master || (chkRemover && chkRemover.checked) ? "" : inpConf.value;
      var msgNome = master ? "Informe o nome do Master." : "Informe o nome do usuário.";

      // Nome obrigatório (em vermelho, como em todas as telas).
      if (window.BapellCampos) {
        if (!window.BapellCampos.exigir([{ el: inpNome, msg: msgNome }])) return;
      } else if (!String(nome).trim()) {
        erroNoCampo(inpNome, msgNome);
        return;
      }
      if (senha || conf) {
        var erroSenha = U.validarSenha(senha);
        if (erroSenha) { erroNoCampo(inpSenha, erroSenha); return; }
        if (senha !== conf) { erroNoCampo(inpConf, "A confirmação não confere com a senha."); return; }
      }

      btnSalvar.disabled = true;
      U.salvar({
        id: editando ? u.id : null,
        nome: nome,
        senha: senha,
        removerSenha: !!(chkRemover && chkRemover.checked),
      }).then(function (r) {
        btnSalvar.disabled = false;
        if (!r.ok) {
          var alvo = r.campo === "senha" && inpSenha ? inpSenha : inpNome;
          erroNoCampo(alvo, r.erro || "Não foi possível salvar o usuário.");
          return;
        }
        fechar();
        _avisar(master
          ? 'Nome do Master atualizado: "' + r.usuario.nome + '".'
          : (editando ? "Usuário atualizado." : 'Usuário "' + r.usuario.nome + '" cadastrado.'), "success");
        renderLista();
      }, function (err) {
        btnSalvar.disabled = false;
        console.error("[Usuários] falha ao salvar:", err);
        _avisar("Não foi possível salvar o usuário.", "error");
      });
    }
    btnSalvar.addEventListener("click", salvar);

    setTimeout(function () { try { inpNome.focus(); inpNome.select(); } catch (e) {} }, 60);
  }

  // ══════════════════════════════════════════
  //  INÍCIO
  // ══════════════════════════════════════════
  // O quadro das senhas e o da "Senha nos botões" (salvos juntos).
  function montarSenhas() {
    if (S && typeof S.montarGerenciador === "function") {
      S.montarGerenciador($("usrGerenciador"), { botoes: $("usrBotoes") });
    }
  }

  // Redesenha as senhas sem passar por cima do que está sendo alterado.
  function remontarSenhasSePuder() {
    var ger = document.getElementById("bsnGerenciadorTela");
    if (ger && ger.getAttribute("data-alterado") === "1") return;
    if (document.querySelector("#usrGerenciador .bsn-campos input:focus, #usrGerenciador .bsn-perguntas input:focus")) return;
    montarSenhas();
  }

  function montar() {
    renderLista();
    montarSenhas();
    // O quadro das senhas é montado de novo a cada Salvar/Cancelar: a linha
    // do Master acompanha (a senha dele é a do Administrador).
    var ger = $("usrGerenciador");
    if (ger && typeof MutationObserver === "function") {
      new MutationObserver(function () { renderLista(); }).observe(ger, { childList: true });
    }
    if (U) {
      U.aoMudar(renderLista);
      // Quem tem senha confirma os botões protegidos: o aviso do quadro
      // "Senha nos botões" acompanha a lista de usuários.
      U.aoMudar(remontarSenhasSePuder);
    }
    // A senha do Administrador mudou em outra aba (criada ou removida), ou
    // a escolha dos botões: o bloco das senhas acompanha — sem passar por
    // cima do que está sendo digitado ou alterado aqui.
    window.addEventListener("storage", function (e) {
      if (!S || (e.key !== "precifiq_senhas" && e.key !== S.chaveBotoes)) return;
      // A tela abriu sem senha e, em outra aba, a do Administrador foi
      // criada: a partir de agora ela pede a senha (recarrega no portão).
      if (e.key === "precifiq_senhas" && _abertaSemSenha && S.protegido()) { location.reload(); return; }
      if (e.key === "precifiq_senhas") renderLista();
      remontarSenhasSePuder();
    });
  }

  // Aberta quando ainda não havia a senha do Administrador?
  var _abertaSemSenha = false;

  function ligar() {
    if (typeof setDateHeader === "function") setDateHeader();
    $("usrVoltar").addEventListener("click", _voltar);
    $("usrRetornoBtn").addEventListener("click", _voltar);
    ["usrNovo", "usrNovoAside", "usrNovoVazio"].forEach(function (id) {
      var b = $(id);
      if (b) b.addEventListener("click", function () { abrirModal(null); });
    });
    $("usrLista").addEventListener("click", _aoClicarLista);

    if (!U || !S) {
      console.error("[Usuários] JS/senhas.js não carregou: a tela não tem como funcionar.");
      _avisar("Não foi possível carregar os usuários.", "error", 6000);
      return;
    }
    // Com a senha do Administrador criada, espera ela ser digitada.
    _abertaSemSenha = !S.protegido();
    S.aguardarAcesso().then(function (liberado) {
      if (liberado) montar();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ligar);
  else ligar();
})();

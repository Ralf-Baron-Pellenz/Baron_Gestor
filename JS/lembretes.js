/* ══════════════════════════════════════════════════════════════
   LEMBRETES — Bapell Gestor Pro
   Aside (visões) + modal criar/editar + calendário/relógio próprios.
   Dados em localStorage (precifiq_lembretes) → entram no backup.
   Alertas disparados pelo processo principal (main.js).
   ══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var LS_KEY = "precifiq_lembretes";
  var EMPRESA_KEY = "precifiq_empresa";
  var MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  var vista = "proximos";
  var editandoId = null;
  var valorTipo = "rs";

  // Estado do calendário
  var calAno, calMes;      // mês exibido
  var selAno = null, selMes = null, selDia = null; // dia escolhido

  function $(id) { return document.getElementById(id); }

  function _setData() {
    var el = $("currentDate");
    if (el) el.textContent = new Date().toLocaleDateString("pt-BR");
  }

  // ── Storage ──
  function lerLembretes() {
    try { var a = JSON.parse(localStorage.getItem(LS_KEY)); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function salvarLembretes(arr) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(arr));
    } catch (e) {
      // Sem este try/catch (o pior caso do projeto), um lembrete se perdia em
      // silêncio se a cota estourasse — e lembrete é justamente o que não pode
      // sumir sem aviso.
      console.error("Falha ao salvar lembretes:", e);
      if (typeof PrecifiqErros !== "undefined") {
        PrecifiqErros.registrar("Falha ao salvar lembretes", String(e));
      }
      toast(
        e && e.name === "QuotaExceededError"
          ? "Armazenamento cheio. Faça um backup e libere espaço."
          : "Não foi possível salvar o lembrete.",
        "erro"
      );
      return false;
    }
    if (window.lembretesAPI && window.lembretesAPI.sync) window.lembretesAPI.sync();
    return true;
  }
  function lerEmpresas() {
    // Mesma origem e mapeamento dos outros módulos (DRE, Vendas, NF): as
    // empresas do cadastro guardam o nome em nomeAba/nomeFantasia/razaoSocial,
    // não em "nome". Sem normalizar aqui, a lista aparecia vazia.
    try {
      var raw = JSON.parse(localStorage.getItem(EMPRESA_KEY));
      if (raw && Array.isArray(raw.empresas)) {
        return raw.empresas.map(function (e, i) {
          return {
            id: e.id,
            nome: e.nomeAba || e.nomeFantasia || e.razaoSocial || ("Empresa " + (i + 1)),
          };
        });
      }
    } catch (e) {}
    return [];
  }
  function gerarId() {
    // 5 chars aleatórios colidiam se 2 lembretes fossem criados no mesmo ms.
    return "lem_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]; }); }

  // Ícones SVG usados nos cartões (14px, herdam a cor do texto)
  var SVG_META = {
    relogio: '<svg class="lem-meta-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg>',
    pessoa: '<svg class="lem-meta-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
    empresa: '<svg class="lem-meta-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><path d="M9 22v-4h6v4"></path><line x1="8" y1="6" x2="8.01" y2="6"></line><line x1="16" y1="6" x2="16.01" y2="6"></line><line x1="8" y1="10" x2="8.01" y2="10"></line><line x1="16" y1="10" x2="16.01" y2="10"></line><line x1="8" y1="14" x2="8.01" y2="14"></line><line x1="16" y1="14" x2="16.01" y2="14"></line></svg>',
    autor: '<svg class="lem-meta-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>',
  };

  // ── Toast ──
  function toast(msg, tipo) {
    var cont = $("toastContainer"); if (!cont) return;
    var t = document.createElement("div");
    t.className = "toast toast-" + (tipo || "info");
    t.textContent = msg;
    cont.appendChild(t);
    setTimeout(function () { t.classList.add("show"); }, 10);
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 2600);
  }

  // ── Máscara de valor (R$) ──
  function mascaraMoeda(v) {
    var d = String(v).replace(/\D/g, "");
    if (!d) return "";
    d = (parseInt(d, 10) / 100).toFixed(2);
    return d.replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  function aplicarValorTipo(tipo) {
    valorTipo = tipo;
    var btns = document.querySelectorAll("#lemValorToggle button");
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("active", btns[i].dataset.tipo === tipo);
    var inp = $("lemValor");
    if (tipo === "rs") { inp.placeholder = "0,00"; inp.value = mascaraMoeda(inp.value); }
    else { inp.placeholder = "Ex: 3 caixas, pendente…"; }
  }

  // ── Empresa: selecionar OU digitar ──
  function resolverEmpresaId(nome) {
    var alvo = (nome || "").trim().toLowerCase();
    if (!alvo) return "";
    var e = lerEmpresas().find(function (x) { return (x.nome || "").trim().toLowerCase() === alvo; });
    return e ? e.id : "";
  }
  function montarMenuEmpresa(filtro) {
    var menu = $("lemEmpresaMenu");
    var termo = (filtro || "").trim().toLowerCase();
    var todas = lerEmpresas();
    var empresas = todas.filter(function (e) { return !termo || (e.nome || "").toLowerCase().includes(termo); });
    var html = '<button type="button" class="lem-empresa-opt nenhuma" data-nome="">Nenhuma empresa</button>';
    empresas.forEach(function (e) { html += '<button type="button" class="lem-empresa-opt" data-nome="' + esc(e.nome) + '">' + esc(e.nome) + "</button>"; });
    // Item 6: as empresas vêm do cadastro central. Se o termo digitado não
    // casa com nenhuma cadastrada, em vez de "salvar como texto" oferecemos
    // cadastrar (leva à tela Empresas). Se NÃO há nenhuma empresa cadastrada,
    // também mostramos a opção de cadastro.
    if ((termo && !empresas.length) || todas.length === 0) {
      html += '<button type="button" class="lem-empresa-opt lem-empresa-cadastrar" data-cadastrar="1" style="color:var(--clr-primary);font-weight:700;">+ Cadastrar nova empresa</button>';
    }
    menu.innerHTML = html;
    menu.querySelectorAll(".lem-empresa-opt").forEach(function (opt) {
      opt.addEventListener("click", function () {
        if (opt.dataset.cadastrar) { window.location.href = "empresa.html"; return; }
        $("lemEmpresa").value = opt.dataset.nome || "";
        menu.classList.remove("aberto");
      });
    });
  }
  function popularFiltroEmpresa() {
    var sel = $("lemFiltroEmpresa"); var atual = sel.value;
    var html = '<option value="">Todas</option>';
    lerEmpresas().forEach(function (e) { html += '<option value="' + esc(e.id) + '">' + esc(e.nome) + "</option>"; });
    html += '<option value="__nenhuma__">Sem empresa</option>';
    sel.innerHTML = html; sel.value = atual;
  }

  // ── Calendário / relógio próprios ──
  function preencherSelectsHora() {
    var h = $("lemHora"), m = $("lemMin"), i, o;
    var hh = ""; for (i = 0; i < 24; i++) { o = ("0" + i).slice(-2); hh += '<option value="' + o + '">' + o + "</option>"; }
    var mm = ""; for (i = 0; i < 60; i++) { o = ("0" + i).slice(-2); mm += '<option value="' + o + '">' + o + "</option>"; }
    h.innerHTML = hh; m.innerHTML = mm;
  }
  function renderCalendario() {
    $("lemCalTitulo").textContent = MESES[calMes] + " " + calAno;
    var grid = $("lemCalGrid");
    grid.innerHTML = "";
    var primeiro = new Date(calAno, calMes, 1).getDay(); // 0=Dom
    var dias = new Date(calAno, calMes + 1, 0).getDate();
    var hoje = new Date();
    var i;
    for (i = 0; i < primeiro; i++) {
      var vazio = document.createElement("div");
      vazio.className = "lem-cal-day vazio";
      grid.appendChild(vazio);
    }
    for (var d = 1; d <= dias; d++) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "lem-cal-day";
      b.textContent = d;
      if (d === hoje.getDate() && calMes === hoje.getMonth() && calAno === hoje.getFullYear()) b.classList.add("hoje");
      if (selDia === d && selMes === calMes && selAno === calAno) b.classList.add("sel");
      (function (dia) {
        b.addEventListener("click", function () {
          selAno = calAno; selMes = calMes; selDia = dia;
          renderCalendario();
        });
      })(d);
      grid.appendChild(b);
    }
  }
  function abrirPicker() {
    // se nada selecionado, começa no mês atual
    var base = (selAno != null) ? new Date(selAno, selMes, selDia) : new Date();
    calAno = base.getFullYear(); calMes = base.getMonth();
    renderCalendario();
    $("lemDTPop").classList.add("aberto");
  }
  function fecharPicker() { $("lemDTPop").classList.remove("aberto"); }
  function confirmarPicker() {
    if (selDia == null) { toast("Escolha um dia no calendário", "info"); return; }
    atualizarCampoDT();
    // A data escolhida resolve o campo vermelho (se estava).
    if (window.BapellCampos && $("lemDTField").classList.contains("campo-erro")) window.BapellCampos.limpar($("lemDTField"));
    // Recalcula o selo de status do formulário com a data escolhida.
    if (typeof _atualizarBadgeForm === "function") {
      var iso = valorDT();
      _atualizarBadgeForm(iso ? { dataHora: iso } : null);
    }
    fecharPicker();
  }
  function atualizarCampoDT() {
    var lbl = $("lemDTLabel");
    if (selDia == null) { lbl.textContent = "Escolher data e hora"; lbl.classList.add("vazio"); return; }
    var hh = $("lemHora").value, mm = $("lemMin").value;
    var dd = ("0" + selDia).slice(-2), mo = ("0" + (selMes + 1)).slice(-2);
    lbl.textContent = dd + "/" + mo + "/" + selAno + "  às  " + hh + ":" + mm;
    lbl.classList.remove("vazio");
  }
  function valorDT() {
    if (selDia == null) return "";
    var dd = ("0" + selDia).slice(-2), mo = ("0" + (selMes + 1)).slice(-2);
    return selAno + "-" + mo + "-" + dd + "T" + $("lemHora").value + ":" + $("lemMin").value;
  }
  function setDT(iso) {
    if (!iso) { selAno = selMes = selDia = null; $("lemHora").value = "09"; $("lemMin").value = "00"; atualizarCampoDT(); return; }
    var d = new Date(iso);
    if (isNaN(d)) { selAno = selMes = selDia = null; atualizarCampoDT(); return; }
    selAno = d.getFullYear(); selMes = d.getMonth(); selDia = d.getDate();
    $("lemHora").value = ("0" + d.getHours()).slice(-2);
    $("lemMin").value = ("0" + d.getMinutes()).slice(-2);
    atualizarCampoDT();
  }

  // ── Status ──
  // Diferença em DIAS DE CALENDÁRIO entre agora e a data do lembrete.
  // Usa o início do dia (00:00) dos dois lados, então "amanhã" é sempre o dia
  // seguinte no calendário, independente da hora — 23h de hoje e 1h de amanhã
  // não contam como "menos de 1 dia".
  function _diasAteVencimento(iso) {
    var alvo = new Date(iso);
    if (isNaN(alvo)) return null;
    var hoje0 = new Date();
    hoje0.setHours(0, 0, 0, 0);
    var alvo0 = new Date(alvo.getFullYear(), alvo.getMonth(), alvo.getDate());
    return Math.round((alvo0 - hoje0) / 86400000);
  }
  // Status do lembrete. Além de concluído/vencido/próximo, devolve estados de
  // proximidade calculados pela data: vence hoje, amanhã, em 2 ou em 3 dias.
  // Passado o vencimento (data/hora <= agora), volta a ser "vencido".
  function statusDe(l) {
    if (l.concluido) return "concluido";
    if (!l.dataHora) return "proximo";
    if (new Date(l.dataHora).getTime() <= Date.now()) return "vencido";
    var dias = _diasAteVencimento(l.dataHora);
    if (dias === 0) return "hoje";
    if (dias === 1) return "amanha";
    if (dias === 2) return "dois_dias";
    if (dias === 3) return "tres_dias";
    return "proximo";
  }
  // Rótulo e classe CSS de cada status (usado nos cards e no modal de visão).
  // As classes de proximidade têm cor própria (definidas no CSS), do azul
  // (mais longe) ao vermelho (vence hoje).
  function statusInfo(st) {
    switch (st) {
      case "concluido":  return { txt: "Concluído",     classe: "concluido" };
      case "vencido":    return { txt: "Vencido",        classe: "vencido" };
      case "hoje":       return { txt: "Vence hoje",     classe: "vence-hoje" };
      case "amanha":     return { txt: "Vence amanhã",   classe: "vence-amanha" };
      case "dois_dias":  return { txt: "Vence em 2 dias", classe: "vence-2d" };
      case "tres_dias":  return { txt: "Vence em 3 dias", classe: "vence-3d" };
      default:           return { txt: "Próximo",        classe: "proximo" };
    }
  }

  // ── "Quem colocou": um dos usuários de Dados da Empresa › Usuários e
  // Senhas. É opcional; um nome antigo, de antes dos usuários existirem,
  // continua aparecendo e é mantido se ninguém for escolhido.
  function preencherQuemColocou(valor) {
    var sel = $("lemCriadoPor");
    if (!sel) return;
    if (window.BapellUsuarios) {
      window.BapellUsuarios.preencherSelect(sel, { valor: valor || "", vazio: "Ninguém (opcional)", opcional: true });
    } else {
      sel.innerHTML = '<option value="">' + esc(valor || "Ninguém (opcional)") + "</option>";
      sel.setAttribute("data-legado", valor || "");
    }
  }
  function lerQuemColocou() {
    var sel = $("lemCriadoPor");
    if (!sel) return "";
    if (sel.value && sel.value !== "__cadastrar__" && window.BapellUsuarios) {
      var u = window.BapellUsuarios.obter(sel.value);
      if (u) return u.nome;
    }
    return sel.getAttribute("data-legado") || "";
  }

  // ── Modal criar/editar ──
  function abrirModal(l) {
    editandoId = l ? l.id : null;
    $("lemModalTitulo").textContent = l ? "Editar lembrete" : "Novo lembrete";
    $("lemSalvar").textContent = l ? "Salvar alterações" : "Salvar lembrete";
    limparMsg();

    $("lemTitulo").value = l ? (l.titulo || "") : "";
    $("lemRecebedor").value = l ? (l.recebedor || "") : "";
    aplicarValorTipo(l ? (l.valorTipo || "rs") : "rs");
    $("lemValor").value = l ? (l.valor || "") : "";
    $("lemEmpresa").value = l ? (l.empresaNome || "") : "";
    preencherQuemColocou(l ? (l.criadoPor || "") : "");
    $("lemObs").value = l ? (l.observacoes || "") : "";
    setDT(l ? l.dataHora : "");
    if (window.BapellCampos) window.BapellCampos.limparTodos($("lemModal"));

    // Badge de status (só leitura) no formulário. Ao editar mostra o status
    // real; ao criar mostra um estado neutro até haver data.
    _atualizarBadgeForm(l);

    $("lemModal").classList.add("aberto");
    setTimeout(function () { $("lemTitulo").focus(); }, 50);
  }
  // Atualiza o selo de status dentro do formulário conforme o lembrete atual
  // (ou o que está sendo montado). Reflete os status novos e suas cores.
  function _atualizarBadgeForm(l) {
    var badge = $("lemStatusBadge");
    if (!badge) return;
    var st = l ? statusDe(l) : "proximo";
    var info = statusInfo(st);
    badge.textContent = l ? info.txt : "Novo";
    badge.className = "lem-badge " + (l ? info.classe : "proximo");
  }
  function fecharModal() {
    $("lemModal").classList.remove("aberto");
    fecharPicker();
    $("lemEmpresaMenu").classList.remove("aberto");
    editandoId = null;
  }

  // ── Modal de VISUALIZAÇÃO (só leitura) ──
  // Abre ao clicar no card. Mostra os dados do lembrete de forma organizada,
  // seguindo o mesmo visual do modal de criar/editar, sem entrar na edição.
  // Tem atalhos para Editar, Concluir/Reabrir e Fechar.
  function abrirVisualizacao(l) {
    var ex = document.getElementById("lemViewModal");
    if (ex) ex.remove();

    var st = statusDe(l);
    var info = statusInfo(st);
    var valor = fmtValor(l);

    // Uma "linha" de informação: rótulo em cima, valor embaixo, com ícone.
    function linha(icone, rotulo, valorHtml) {
      if (valorHtml == null || valorHtml === "") return "";
      return '<div class="lem-view-row">' +
        '<div class="lem-view-row-label">' + (icone || "") + '<span>' + esc(rotulo) + '</span></div>' +
        '<div class="lem-view-row-value">' + valorHtml + '</div>' +
      '</div>';
    }

    var linhas = "";
    // Empresa e Status vêm logo no topo (mesma prioridade do formulário).
    linhas += linha(SVG_META.empresa, "Empresa", l.empresaNome ? esc(l.empresaNome) : '<span class="lem-view-vazio">Sem empresa</span>');
    linhas += linha("", "Status", '<span class="lem-badge ' + info.classe + '">' + info.txt + '</span>');
    linhas += linha(SVG_META.relogio, "Data e hora", esc(fmtDataHoraBR(l.dataHora)));
    if (valor) linhas += linha("", "Valor", esc(valor));
    if (l.recebedor) linhas += linha(SVG_META.pessoa, "Recebedor", esc(l.recebedor));
    if (l.criadoPor) linhas += linha(SVG_META.autor, "Quem colocou", esc(l.criadoPor));
    if (l.observacoes) linhas += linha("", "Observações", '<div class="lem-view-obs">' + esc(l.observacoes) + '</div>');

    var overlay = document.createElement("div");
    // Centralizado na tela (o de criar/editar, mais alto, abre no topo).
    overlay.className = "lem-modal-overlay lem-modal-overlay--centro aberto";
    overlay.id = "lemViewModal";
    overlay.innerHTML =
      '<div class="lem-modal lem-view-modal">' +
        '<div class="lem-modal-head">' +
          '<span class="lem-modal-title">' + esc(l.titulo || "Lembrete") + '</span>' +
          '<button class="lem-modal-close" id="lemViewClose" title="Fechar">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>' +
          '</button>' +
        '</div>' +
        '<div class="lem-view-body">' + linhas + '</div>' +
        '<div class="lem-modal-actions">' +
          '<button class="btn-secondary" id="lemViewConcluir">' + (l.concluido ? "Reabrir" : "Concluir") + '</button>' +
          '<button class="btn-primary" id="lemViewEditar">Editar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    function fecharView() { overlay.remove(); }
    document.getElementById("lemViewClose").addEventListener("click", fecharView);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) fecharView(); });
    document.getElementById("lemViewEditar").addEventListener("click", function () {
      fecharView();
      var atual = lerLembretes().find(function (x) { return x.id === l.id; });
      if (atual) abrirModal(atual);
    });
    document.getElementById("lemViewConcluir").addEventListener("click", function () {
      fecharView();
      comId(l.id, function (x) { x.concluido = !x.concluido; });
    });
  }
  function mostrarMsg(txt, erro) {
    var m = $("lemFormMsg");
    m.style.display = "block";
    m.textContent = txt;
    m.style.background = erro ? "var(--clr-danger-lt)" : "var(--clr-success-lt, rgba(34,197,94,.14))";
    m.style.border = "1px solid " + (erro ? "var(--clr-danger)" : "var(--clr-success)");
    m.style.color = "var(--clr-text)";
  }
  function limparMsg() { $("lemFormMsg").style.display = "none"; }

  function salvar() {
    limparMsg();
    var titulo = $("lemTitulo").value.trim();
    var dataHora = valorDT();
    // Título e data/hora: os que faltam ficam vermelhos (a data é o botão
    // que abre o calendário).
    var faltando = [
      { el: $("lemTitulo"), msg: "Informe o título do lembrete." },
      { el: $("lemDTField"), vazio: !dataHora, msg: "Escolha a data e a hora.",
        resolvido: function () { return !!valorDT(); } },
    ];
    if (window.BapellCampos) {
      if (!window.BapellCampos.exigir(faltando, { avisar: function (m) { mostrarMsg(m, true); } })) return;
    } else {
      if (!titulo) { mostrarMsg("Informe o título do lembrete.", true); return; }
      if (!dataHora) { mostrarMsg("Escolha a data e a hora.", true); return; }
    }

    var empresaNome = $("lemEmpresa").value.trim();
    // Item 6: a empresa é opcional, mas se informada precisa existir no cadastro
    // central. Não gravamos mais texto livre de empresa inventada.
    var empresaId = resolverEmpresaId(empresaNome);
    if (empresaNome && !empresaId) {
      mostrarMsg('Empresa "' + empresaNome + '" não está cadastrada. Escolha uma da lista ou deixe em branco.', true);
      if (window.BapellCampos) {
        window.BapellCampos.marcar($("lemEmpresa"), null, { resolvido: function () {
          var n = $("lemEmpresa").value.trim();
          return !n || !!resolverEmpresaId(n);
        } });
        window.BapellCampos.focar($("lemEmpresa"));
      }
      return;
    }
    var dados = {
      titulo: titulo,
      recebedor: $("lemRecebedor").value.trim(),
      valorTipo: valorTipo,
      valor: $("lemValor").value.trim(),
      dataHora: dataHora,
      empresaId: empresaId,
      empresaNome: empresaNome,
      criadoPor: lerQuemColocou(),
      observacoes: $("lemObs").value.trim(),
    };

    var arr = lerLembretes();
    if (editandoId) {
      var idx = arr.findIndex(function (x) { return x.id === editandoId; });
      if (idx >= 0) arr[idx] = Object.assign({}, arr[idx], dados);
      salvarLembretes(arr);
      toast("Lembrete atualizado", "success");
    } else {
      arr.push(Object.assign({ id: gerarId(), concluido: false, oculto: false, criadoEm: new Date().toISOString() }, dados));
      salvarLembretes(arr);
      toast("Lembrete salvo", "success");
    }
    fecharModal();
    render();
  }

  // Clonar: cria uma cópia idêntica do lembrete, já salva, como um novo item
  // ativo (não concluído, não oculto). Mantém título, empresa, data, valor etc.
  function clonarLembrete(id) {
    var arr = lerLembretes();
    var orig = arr.find(function (x) { return x.id === id; });
    if (!orig) return;
    var copia = Object.assign({}, orig, {
      id: gerarId(),
      concluido: false,
      oculto: false,
      criadoEm: new Date().toISOString(),
    });
    arr.push(copia);
    salvarLembretes(arr);
    render();
    toast("Lembrete clonado", "success");
  }

  // Repetir: abre o formulário de criação já preenchido com os dados do
  // lembrete, mas como NOVO (editandoId nulo). O usuário escolhe a nova data e
  // salva — vira um lembrete separado, sem alterar o original.
  function repetirLembrete(l) {
    abrirModal(null); // abre em modo "novo" (título/botão de criação)
    $("lemTitulo").value = l.titulo || "";
    $("lemRecebedor").value = l.recebedor || "";
    aplicarValorTipo(l.valorTipo || "rs");
    $("lemValor").value = l.valor || "";
    $("lemEmpresa").value = l.empresaNome || "";
    preencherQuemColocou(l.criadoPor || "");
    $("lemObs").value = l.observacoes || "";
    // Data começa em branco de propósito: o objetivo do "Repetir" é justamente
    // escolher a nova data. O selo de status fica neutro até a data ser posta.
    setDT("");
    _atualizarBadgeForm(null);
    setTimeout(function () { $("lemTitulo").focus(); }, 50);
  }
  function comId(id, fn) {
    var arr = lerLembretes();
    var l = arr.find(function (x) { return x.id === id; });
    if (!l) return;
    fn(l, arr);
    salvarLembretes(arr);
    render();
  }

  // ── Render ──
  function fmtDataHoraBR(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  function fmtValor(l) {
    if (!l.valor) return "";
    return l.valorTipo === "rs" ? "R$ " + l.valor : l.valor;
  }

  // Os status de proximidade (hoje/amanhã/2d/3d) são lembretes que ainda NÃO
  // venceram — para os filtros e contadores, entram junto de "próximo".
  function _ehProximo(st) {
    return st === "proximo" || st === "hoje" || st === "amanha" ||
           st === "dois_dias" || st === "tres_dias";
  }

  function passaVista(l) {
    var st = statusDe(l);
    switch (vista) {
      case "proximos": return !l.oculto && _ehProximo(st);
      case "vencidos": return !l.oculto && st === "vencido";
      case "concluidos": return !l.oculto && st === "concluido";
      case "ocultos": return !!l.oculto;
      // "todos" mostra tudo que está ativo, MENOS os concluídos: um lembrete
      // concluído sai da tela inicial e só reaparece no filtro "Concluídos".
      // "Todos" lista absolutamente todos os lembretes cadastrados, sem
      // exceção: próximos, vencidos, concluídos E ocultos.
      case "todos": return true;
    }
    return true;
  }

  function atualizarContadores() {
    var arr = lerLembretes();
    var c = { proximos: 0, vencidos: 0, concluidos: 0, ocultos: 0, todos: 0 };
    arr.forEach(function (l) {
      // "Todos" agora conta absolutamente todos os lembretes, sem exceção.
      c.todos++;
      if (l.oculto) { c.ocultos++; return; }
      var st = statusDe(l);
      if (st === "vencido") c.vencidos++;
      else if (st === "concluido") c.concluidos++;
      else if (_ehProximo(st)) c.proximos++;
    });
    Object.keys(c).forEach(function (k) {
      var el = document.querySelector('.lem-badge-count[data-count="' + k + '"]');
      if (el) el.textContent = c[k];
    });
  }

  function render() {
    atualizarContadores();
    var arr = lerLembretes();
    var empFiltro = $("lemFiltroEmpresa").value;
    var ini = $("lemFiltroIni").value;
    var fim = $("lemFiltroFim").value;
    var busca = $("lemBusca").value.trim().toLowerCase();

    var itens = arr.filter(function (l) {
      if (!passaVista(l)) return false;
      if (empFiltro === "__nenhuma__" && l.empresaId) return false;
      if (empFiltro && empFiltro !== "__nenhuma__" && l.empresaId !== empFiltro) return false;
      var dia = (l.dataHora || "").slice(0, 10);
      if (ini && dia && dia < ini) return false;
      if (fim && dia && dia > fim) return false;
      if (busca) {
        var alvo = (l.titulo + " " + (l.recebedor || "") + " " + (l.empresaNome || "")).toLowerCase();
        if (!alvo.includes(busca)) return false;
      }
      return true;
    });

    itens.sort(function (a, b) { return new Date(a.dataHora) - new Date(b.dataHora); });

    var cont = $("lemLista");
    cont.innerHTML = "";
    $("lemVazio").style.display = itens.length ? "none" : "block";

    itens.forEach(function (l) {
      var st = statusDe(l);
      var info = statusInfo(st);
      var badge = info.classe;
      var badgeTxt = info.txt;
      var valor = fmtValor(l);
      var metas = [];
      metas.push('<span class="item">' + SVG_META.relogio + fmtDataHoraBR(l.dataHora) + "</span>");
      if (l.recebedor) metas.push('<span class="item">' + SVG_META.pessoa + esc(l.recebedor) + "</span>");
      if (l.empresaNome) metas.push('<span class="item">' + SVG_META.empresa + esc(l.empresaNome) + "</span>");
      if (l.criadoPor) metas.push('<span class="item">' + SVG_META.autor + esc(l.criadoPor) + "</span>");

      var card = document.createElement("div");
      card.className = "lem-card " + info.classe + (l.oculto ? " oculto" : "");
      card.innerHTML =
        '<div class="lem-card-main">' +
          '<div class="lem-card-top">' +
            '<span class="lem-card-titulo">' + esc(l.titulo) + "</span>" +
            (valor ? '<span class="lem-card-valor">' + esc(valor) + "</span>" : "") +
            '<span class="lem-badge ' + badge + '">' + badgeTxt + "</span>" +
            (l.oculto ? '<span class="lem-badge cinza">Oculto</span>' : "") +
          "</div>" +
          '<div class="lem-card-meta">' + metas.join("") + "</div>" +
          (l.observacoes ? '<div class="lem-card-obs"><strong>Observação:</strong> ' + esc(l.observacoes) + "</div>" : "") +
        "</div>" +
        '<div class="lem-card-actions">' +
          '<button class="lem-menu-btn" data-a="menu" title="Ações">' +
            '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="12" cy="19" r="1.6"></circle></svg>' +
          "</button>" +
          '<div class="lem-menu">' +
            '<button class="lem-menu-item" data-a="concluir">' + (l.concluido ? "Reabrir" : "Concluir") + "</button>" +
            '<button class="lem-menu-item" data-a="clonar">Clonar</button>' +
            '<button class="lem-menu-item" data-a="repetir">Repetir</button>' +
            '<button class="lem-menu-item" data-a="ocultar">' + (l.oculto ? "Mostrar" : "Ocultar") + "</button>" +
            '<button class="lem-menu-item" data-a="editar">Editar</button>' +
            '<button class="lem-menu-item danger" data-a="excluir">Excluir</button>' +
          "</div>" +
        "</div>";

      var menuEl = card.querySelector(".lem-menu");
      function fecharMenu() { menuEl.classList.remove("aberto"); }
      // Clicar no corpo do card abre a VISUALIZAÇÃO (só leitura). Cliques no
      // menu de ações (três pontos) e seus itens são ignorados aqui.
      card.querySelector(".lem-card-main").addEventListener("click", function () {
        var atual = lerLembretes().find(function (x) { return x.id === l.id; });
        if (atual) abrirVisualizacao(atual);
      });
      card.querySelector('[data-a="menu"]').addEventListener("click", function (e) {
        e.stopPropagation();
        var jaAberto = menuEl.classList.contains("aberto");
        document.querySelectorAll(".lem-menu.aberto").forEach(function (m) { m.classList.remove("aberto"); });
        if (!jaAberto) menuEl.classList.add("aberto");
      });
      card.querySelector('[data-a="concluir"]').addEventListener("click", function () { fecharMenu(); comId(l.id, function (x) { x.concluido = !x.concluido; }); });
      // Clonar: cria uma cópia idêntica na hora (mesmos dados, nova como não
      // concluída/não oculta), já salva. Cópia rápida sem abrir formulário.
      card.querySelector('[data-a="clonar"]').addEventListener("click", function () {
        fecharMenu();
        clonarLembrete(l.id);
      });
      // Repetir: abre o formulário já preenchido com os dados deste lembrete,
      // como um NOVO lembrete, para escolher a nova data e salvar.
      card.querySelector('[data-a="repetir"]').addEventListener("click", function () {
        fecharMenu();
        var atual = lerLembretes().find(function (x) { return x.id === l.id; });
        if (atual) repetirLembrete(atual);
      });
      card.querySelector('[data-a="ocultar"]').addEventListener("click", function () { fecharMenu(); comId(l.id, function (x) { x.oculto = !x.oculto; }); });
      card.querySelector('[data-a="editar"]').addEventListener("click", function () { fecharMenu(); var atual = lerLembretes().find(function (x) { return x.id === l.id; }); if (atual) abrirModal(atual); });
      card.querySelector('[data-a="excluir"]').addEventListener("click", function () {
        fecharMenu();
        // Janela do app no lugar do confirm() do sistema. O foco começa em
        // "Cancelar" e o Esc cancela: excluir continua exigindo decisão.
        var perguntar = window.BapellModal
          ? window.BapellModal.confirmar({
              titulo: "Excluir o lembrete?",
              texto: '"' + (l.titulo || "Lembrete") + '" será apagado. Esta ação não pode ser desfeita.',
              botao: "Excluir lembrete",
              perigo: true,
            })
          : Promise.resolve(false);
        perguntar.then(function (sim) {
          if (!sim) return;
          comId(l.id, function (x, arr2) { var i = arr2.indexOf(x); if (i >= 0) arr2.splice(i, 1); });
          toast("Lembrete excluído");
        });
      });
      cont.appendChild(card);
    });
  }

  // ── Ligações ──
  function ligar() {
    _setData();
    preencherSelectsHora();
    $("lemHora").value = "09"; $("lemMin").value = "00";
    popularFiltroEmpresa();

    // aside: trocar visão
    document.querySelectorAll(".sidebar-item-btn.lem-vista").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll(".sidebar-item-btn.lem-vista").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        vista = b.dataset.vista;
        $("lemViewTitle").textContent = b.querySelector(".sidebar-label-txt").textContent;
        render();
      });
    });

    // abrir modal
    $("btnNovo").addEventListener("click", function () { abrirModal(null); });
    $("lemModalClose").addEventListener("click", fecharModal);
    $("lemCancelar").addEventListener("click", fecharModal);
    $("lemSalvar").addEventListener("click", salvar);
    $("lemModal").addEventListener("click", function (e) { if (e.target === $("lemModal")) fecharModal(); });

    // valor
    $("lemValor").addEventListener("input", function () { if (valorTipo === "rs") this.value = mascaraMoeda(this.value); });
    document.querySelectorAll("#lemValorToggle button").forEach(function (b) { b.addEventListener("click", function () { aplicarValorTipo(b.dataset.tipo); }); });

    // empresa combobox
    var inpEmp = $("lemEmpresa");
    inpEmp.addEventListener("focus", function () { montarMenuEmpresa(inpEmp.value); $("lemEmpresaMenu").classList.add("aberto"); });
    inpEmp.addEventListener("input", function () { montarMenuEmpresa(inpEmp.value); $("lemEmpresaMenu").classList.add("aberto"); });

    // calendário
    $("lemDTPop").addEventListener("click", function (e) { e.stopPropagation(); });
    $("lemDTField").addEventListener("click", function (e) { e.stopPropagation(); if ($("lemDTPop").classList.contains("aberto")) fecharPicker(); else abrirPicker(); });
    $("lemCalPrev").addEventListener("click", function () { calMes--; if (calMes < 0) { calMes = 11; calAno--; } renderCalendario(); });
    $("lemCalNext").addEventListener("click", function () { calMes++; if (calMes > 11) { calMes = 0; calAno++; } renderCalendario(); });
    $("lemDTOk").addEventListener("click", confirmarPicker);

    // fechar popups ao clicar fora
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".lem-empresa-wrap")) $("lemEmpresaMenu").classList.remove("aberto");
      if (!e.target.closest(".lem-dt-wrap")) fecharPicker();
      if (!e.target.closest(".lem-card-actions")) {
        document.querySelectorAll(".lem-menu.aberto").forEach(function (m) { m.classList.remove("aberto"); });
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      // Uma confirmação ou a senha por cima tratam o próprio Esc.
      if (document.querySelector(".bm-overlay, .bsn-camada")) return;
      fecharPicker(); fecharModal();
      var vis = document.getElementById("lemViewModal");
      if (vis) vis.remove();
    });

    // filtros toolbar
    ["lemFiltroEmpresa", "lemFiltroIni", "lemFiltroFim"].forEach(function (id) { $(id).addEventListener("change", render); });
    $("lemBusca").addEventListener("input", render);

    render();
    // Reavalia "próximo → vencido" a cada minuto. Mas NÃO redesenha se o
    // usuário está com um menu de 3 pontinhos, o modal ou o date-picker aberto
    // — antes, o render() no meio da interação fechava o que estava aberto.
    setInterval(function () {
      var menuAberto = document.querySelector(".lem-menu.aberto");
      var modalAberto = document.querySelector(".lem-modal-overlay.aberto, #lemModal.aberto");
      var pickerAberto = document.querySelector(".lem-dt-pop.aberto");
      if (menuAberto || modalAberto || pickerAberto) return;
      render();
    }, 60000);

    // ── Autostart: "Abrir com o Windows" ──
    _ligarAutostart();

    // Outra janela mudou os lembretes — a notificação concluiu um, por
    // exemplo: a lista acompanha (se nada estiver aberto aqui).
    window.addEventListener("storage", function (e) {
      if (e.key !== LS_KEY && e.key !== null) return;
      var aberto = document.querySelector(".lem-menu.aberto, .lem-modal-overlay.aberto, #lemModal.aberto, .lem-dt-pop.aberto");
      if (!aberto) render();
    });

    // A notificação pediu para abrir um lembrete (?ver=<id>): abre a ficha.
    // O ?ver= sai do endereço — recarregar a aba não abre a ficha de novo.
    var verId = "";
    try { verId = new URLSearchParams(location.search).get("ver") || ""; } catch (e) {}
    if (verId) {
      try { history.replaceState(null, "", location.pathname); } catch (e) {}
      abrirPorId(verId);
    }
  }

  /**
   * Abre a ficha de um lembrete. Chamado pela notificação, que pode
   * encontrar esta tela já aberta (o shell chama direto).
   * Com a tela trancada pela senha do módulo, a ficha espera a liberação —
   * ela não pode aparecer por cima da tela de senha.
   */
  function abrirPorId(id) {
    var S = window.BapellSenhas;
    if (S && typeof S.aguardarAcesso === "function") {
      S.aguardarAcesso().then(function (liberado) {
        if (liberado) _abrirFicha(id);
      });
      return true;
    }
    return _abrirFicha(id);
  }

  function _abrirFicha(id) {
    var l = lerLembretes().find(function (x) { return x.id === id; });
    if (!l) { toast("Este lembrete não existe mais.", "info"); return false; }
    // Um lembrete sendo criado ou editado aqui: pergunta antes de descartar.
    if ($("lemModal").classList.contains("aberto")) {
      if (window.BapellModal) {
        window.BapellModal.confirmar({
          tipo: "aviso",
          titulo: "Descartar o lembrete em edição?",
          texto: "Você está criando ou editando um lembrete. Para abrir \"" + (l.titulo || "o lembrete") +
            "\", o que foi preenchido e não salvo será descartado.",
          botao: "Descartar e abrir",
          cancelar: "Continuar editando",
        }).then(function (sim) { if (sim) _mostrarFicha(l); });
        return true;
      }
    }
    _mostrarFicha(l);
    return true;
  }

  function _mostrarFicha(l) {
    // A ficha aparece em cima da lista certa: muda para "Todos" se o
    // lembrete não estiver na visão atual.
    if (!passaVista(l)) {
      var btnTodos = document.querySelector('.sidebar-item-btn.lem-vista[data-vista="todos"]');
      if (btnTodos) btnTodos.click();
    }
    fecharModal();
    abrirVisualizacao(l);
  }
  window.BapellLembretes = { abrir: abrirPorId };

  // Liga o toggle "abrir com o Windows". O backend (main.js) e a ponte
  // (preload) já existem; esta função religa a UI que havia sumido numa
  // reescrita anterior. Depende de nodeIntegrationInSubFrames (já ativado)
  // para que window.lembretesAPI exista dentro do iframe da aba.
  function _ligarAutostart() {
    var wrap = $("lemAutostart");
    var check = $("lemAutostartCheck");
    if (!wrap || !check) return;

    if (!window.lembretesAPI || !window.lembretesAPI.getAutoStart) {
      // Fora do Electron (ex.: navegador) ou ponte indisponível: esconde a opção
      wrap.style.display = "none";
      return;
    }

    // Estado inicial vem do sistema operacional
    Promise.resolve(window.lembretesAPI.getAutoStart())
      .then(function (on) { check.checked = !!on; })
      .catch(function () { wrap.style.display = "none"; });

    check.addEventListener("change", function () {
      var desejado = check.checked;
      Promise.resolve(window.lembretesAPI.setAutoStart(desejado))
        .then(function (confirmado) {
          check.checked = !!confirmado; // reflete o que o SO aceitou
          toast(confirmado ? "O app abrirá junto com o Windows." : "Abertura automática desligada.", "ok");
        })
        .catch(function () {
          check.checked = !desejado; // reverte se falhou
          toast("Não foi possível alterar essa configuração.", "erro");
        });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ligar);
  else ligar();
})();

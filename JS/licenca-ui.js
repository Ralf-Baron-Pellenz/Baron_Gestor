// ═══════════════════════════════════════════════════════════════════
//  Bapell Gestor Pro — Guarda de Licença (interface)
//
//  Arquivo ÚNICO, incluído por todas as telas. Ele consulta a situação da
//  licença e decide o que a tela pode fazer:
//
//    • licença ATIVA  → não faz nada (só avisa se o prazo está acabando)
//    • licença VENCIDA → bloqueia os módulos pagos e libera o essencial
//
//  ── POR QUE NÃO TRANCA TUDO ────────────────────────────────────────
//  Os produtos, notas e o financeiro são do CLIENTE. Vencido o prazo ele
//  perde o uso do sistema, não o acesso aos próprios dados. Por isso
//  Ajuda (onde fica o backup) e Notas Fiscais continuam abertas.
//
//  ── ONDE FICA A TRAVA DE VERDADE ───────────────────────────────────
//  Aqui é só a interface. Quem manda é a assinatura da chave, conferida
//  no processo principal (licenca-verify.js). Este arquivo é a cara da
//  regra, não a regra.
//
//  ── COMO O MÓDULO BLOQUEADO SE COMPORTA ────────────────────────────
//  O clique NÃO é mais barrado no dashboard. O cliente navega normalmente
//  até o módulo e recebe lá a tela de aviso, que explica a situação e traz
//  os botões de renovar e de exportar backup. Barrar o clique no menu
//  deixava a impressão de sistema quebrado: clicava e nada acontecia.
//  O cadeado no menu continua, mas agora é só sinalização.
// ═══════════════════════════════════════════════════════════════════

"use strict";

(function () {
  // Telas que continuam acessíveis com a licença vencida.
  // Usuários e Senhas entra junto com as Notas Fiscais: uma nota precisa
  // de um responsável, e é lá que os usuários são cadastrados.
  const TELAS_LIVRES = [
    "index.html",
    "shell.html",
    "ajuda.html",
    "nf.html",
    "usuarios.html",
    "ativacao.html",
  ];

  // ── Módulos que continuam liberados no menu (data-modid) ───────────
  // ATENÇÃO: aqui a lista é de LIBERADOS, não de bloqueados.
  //
  // Antes existia uma lista de bloqueados, escrita à mão. O problema é que
  // todo módulo novo nascia FORA dela e ficava sem cadeado até alguém
  // lembrar de incluir — foi o que aconteceu com a Central de Cálculos e
  // com Clientes. Invertendo a lógica, módulo novo já nasce bloqueado e o
  // esquecimento passa a ser seguro: no máximo tranca algo de mais, nunca
  // libera algo de menos.
  const MODULOS_LIVRES = ["nf", "ajuda"];

  // Quando avisar que o prazo está acabando, por tipo de licença.
  // 1 = Teste de 7 dias   ·   2 = Anual
  const AVISOS_POR_TIPO = { 1: [1], 2: [7, 2] };

  // ═══════════════════════════════════════════════════════════════
  //  MÓDULOS LICENCIÁVEIS
  //
  //  TIPO da chave e MÓDULOS liberados são coisas SEPARADAS. O tipo diz
  //  por quanto tempo a licença vale; os módulos dizem o que ela inclui.
  //  Uma chave vitalícia pode não ter um módulo, e uma anual pode ter.
  //
  //  Para licenciar um módulo novo: registre as telas dele aqui
  //  (TELAS_LICENCIADAS e NOME_TELA), o que ele libera (TELAS_DO_MODULO),
  //  os planos que o incluem (PLANOS_DO_MODULO) e o bit correspondente
  //  no licenca-core.js.
  // ═══════════════════════════════════════════════════════════════

  // tela (arquivo) → nome do módulo na chave
  //
  // Um módulo da chave pode abrir MAIS DE UMA tela. O "calculosPlanilhas"
  // é o pacote dos planos "com Processador": Processador de Planilha,
  // Informações de Venda, Gerador de EAN e Gestor de Devoluções. As telas
  // entram e saem juntas. A chave não muda (é o mesmo bit): quem já comprou
  // um plano com o Processador ganha as outras telas sem trocar de chave.
  const TELAS_LICENCIADAS = {
    "vendas-import.html": "calculosPlanilhas",
    "vendas.html": "calculosPlanilhas",
    "ean.html": "calculosPlanilhas",
    "devolucoes.html": "calculosPlanilhas",
  };

  const NOME_MODULO = {
    calculosPlanilhas: "Processador de Planilha",
  };

  // Nome de cada TELA, para os avisos: quem abre o Gerador de EAN precisa
  // ler "Gerador de EAN", e não o nome do pacote.
  const NOME_TELA = {
    "vendas-import.html": "Processador de Planilha",
    "vendas.html": "Informações de Venda",
    "ean.html": "Gerador de EAN",
    "devolucoes.html": "Gestor de Devoluções",
  };

  // O que cada módulo da chave libera, na ordem em que aparece nos planos.
  const TELAS_DO_MODULO = {
    calculosPlanilhas: [
      "Processador de Planilha",
      "Informações de Venda",
      "Gerador de EAN",
      "Gestor de Devoluções",
    ],
  };

  // Os planos que incluem cada módulo, com o nome que aparece no modal
  // de compra. "Pro" é o anual com os módulos Plus (antes "Anual +
  // Processador"); "Platinum", o vitalício com eles (antes "Vitalícia +
  // Processador") — o pacote cresceu e o nome antigo não cabia mais.
  const PLANOS_DO_MODULO = {
    calculosPlanilhas: ["Pro", "Platinum"],
  };

  function _nomeDaTela(arquivo, modulo) {
    return NOME_TELA[arquivo] || NOME_MODULO[modulo] || "desta tela";
  }

  // "A, B e C" (ou "A, B ou C").
  function _juntar(itens, conj) {
    if (itens.length <= 1) return itens.join("");
    return itens.slice(0, -1).join(", ") + " " + conj + " " + itens[itens.length - 1];
  }

  // "Processador de Planilha, Informações de Venda, Gerador de EAN e Gestor de Devoluções"
  function _listaDoModulo(modulo) {
    return _juntar(TELAS_DO_MODULO[modulo] || [NOME_MODULO[modulo] || modulo], "e");
  }

  // "<strong>Pro</strong> ou <strong>Platinum</strong>"
  function _planosHtml(modulo, conj) {
    const planos = PLANOS_DO_MODULO[modulo] || [];
    return _juntar(
      planos.map(function (p) { return "<strong>" + _esc(p) + "</strong>"; }),
      conj,
    );
  }

  // Tipos da chave (os mesmos do licenca-core.js):
  // 0 = Vitalícia · 1 = Teste de 7 dias · 2 = Anual.
  const TIPO_VITALICIA = 0;
  const TIPO_TESTE = 1;
  const TIPO_ANUAL = 2;

  // ── Chaves v1 e v2 (emitidas antes dos módulos existirem) ────────
  //
  // Elas não têm o campo de módulos: chegam aqui com tudo `false`. Este
  // valor decide o que fazer com quem já comprou.
  //
  //   false → o módulo novo exige uma chave nova que o inclua.
  //   true  → quem já tem chave ganha o módulo junto.
  //
  // É uma decisão COMERCIAL, não técnica. Está isolada nesta linha
  // justamente para poder ser trocada sem mexer em mais nada.
  const MODULOS_LIBERADOS_EM_CHAVES_ANTIGAS = false;

  // Lembra que o aviso do período de teste já foi confirmado, para não
  // reaparecer a cada visita. Por tela, e só nesta sessão do aplicativo:
  // numa licença de teste de 7 dias, lembrar "para sempre" faria o aviso
  // sumir no segundo dia e o cliente esquecer que o prazo existe.
  //
  // A marca é "módulo:tela" porque um módulo abre mais de uma tela: cada
  // uma avisa uma vez, com o próprio nome.
  const CIENTE_KEY = "precifiq_modulo_ciente";

  function _marcaCiente(modulo, arquivo) {
    return modulo + ":" + (arquivo || "");
  }

  function _jaConfirmou(marca) {
    try {
      return (sessionStorage.getItem(CIENTE_KEY) || "").split(",").indexOf(marca) >= 0;
    } catch (e) {
      return false;
    }
  }

  function _marcarConfirmado(marca) {
    try {
      const atual = (sessionStorage.getItem(CIENTE_KEY) || "").split(",").filter(Boolean);
      if (atual.indexOf(marca) < 0) atual.push(marca);
      sessionStorage.setItem(CIENTE_KEY, atual.join(","));
    } catch (e) {}
  }

  /**
   * Decide o acesso a um módulo licenciável.
   *
   * @returns {"liberado"|"teste"|"bloqueado"}
   *   liberado  → a chave inclui o módulo
   *   teste     → chave de 7 dias: libera, mas avisa
   *   bloqueado → a chave não inclui o módulo
   */
  function _acessoAoModulo(st, modulo) {
    // Chave de teste tem acesso completo, por definição. Não é "módulo
    // incluído": é o direito de experimentar tudo antes de comprar.
    if (Number(st.tipo) === TIPO_TESTE) return "teste";

    // O campo não veio. Acontece com chave v1/v2 (não existia) e também
    // se o preload estiver desatualizado e não repassar `modulos`.
    //
    // O aviso no console é proposital: sem ele, um preload antigo faria
    // TODO módulo licenciável parecer não contratado, e ninguém saberia
    // por quê. É o mesmo cuidado que este arquivo já toma logo acima.
    if (!st.modulos || typeof st.modulos !== "object") {
      console.warn(
        "[Licenca] a chave nao traz a lista de modulos. " +
          "Chaves antigas (v1/v2) sao assim por natureza. " +
          "DENTRO do .exe, verifique se o preload repassa o campo 'modulos'.",
      );
      return MODULOS_LIBERADOS_EM_CHAVES_ANTIGAS ? "liberado" : "bloqueado";
    }

    return st.modulos[modulo] === true ? "liberado" : "bloqueado";
  }

  /**
   * Modal OBRIGATÓRIO do período de teste.
   *
   * Só sai pelo botão "Estou ciente": sem fechar clicando fora, sem ESC,
   * e sem alcançar o conteúdo por trás. O objetivo é que ninguém comece a
   * usar o módulo achando que ele faz parte da licença que comprou.
   */
  function _modalTeste(modulo, arquivo, aoConfirmar) {
    _injetarEstilo();
    const nome = _nomeDaTela(arquivo, modulo);

    const fundo = document.createElement("div");
    fundo.className = "lic-modulo-modal";
    fundo.setAttribute("role", "dialog");
    fundo.setAttribute("aria-modal", "true");
    fundo.innerHTML =
      '<div class="lic-modulo-modal__card">' +
        '<div class="lic-modulo-modal__tag">Período de teste</div>' +
        "<h2>Módulo " + _esc(nome) + " liberado para teste</h2>" +
        "<p>Você está usando uma <strong>chave de teste de 7 dias</strong>, " +
        "que dá acesso completo ao sistema — inclusive a este módulo.</p>" +
        "<p>Quando o período de teste terminar, este módulo deixará de " +
        "abrir. Para continuar usando, será necessário ter uma chave " +
        (PLANOS_DO_MODULO[modulo]
          ? _planosHtml(modulo, "ou") + ", os planos que incluem " +
            _esc(_listaDoModulo(modulo)) + ".</p>"
          : "<strong>de 1 ano ou vitalícia que inclua este módulo</strong>.</p>") +
        '<button class="lic-modulo-modal__ok" id="licModuloCiente">Estou ciente</button>' +
      "</div>";
    document.body.appendChild(fundo);

    // Trava a rolagem do fundo: sem isso dá para ler o módulo por trás.
    const overflowAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const btn = fundo.querySelector("#licModuloCiente");

    // ESC, Tab e qualquer tecla de atalho param aqui. O Tab é devolvido
    // ao botão para o foco não escapar para o conteúdo de trás.
    function prender(e) {
      if (e.key === "Escape" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        btn.focus();
      }
    }
    document.addEventListener("keydown", prender, true);

    // Clicar no fundo NÃO fecha: é justamente o gesto reflexo de quem
    // quer pular o aviso.
    fundo.addEventListener("mousedown", function (e) {
      if (e.target === fundo) {
        e.preventDefault();
        e.stopPropagation();
        btn.focus();
      }
    });

    btn.addEventListener("click", function () {
      document.removeEventListener("keydown", prender, true);
      document.body.style.overflow = overflowAntes;
      fundo.remove();
      _marcarConfirmado(_marcaCiente(modulo, arquivo));
      if (typeof aoConfirmar === "function") aoConfirmar();
    });

    setTimeout(function () { try { btn.focus(); } catch (e) {} }, 60);
  }

  /** Tela de bloqueio do módulo não contratado. */
  function _bloquearModuloNaoContratado(modulo, arquivo) {
    _injetarEstilo();
    const nome = _nomeDaTela(arquivo, modulo);
    const div = document.createElement("div");
    div.className = "lic-tela-bloqueada";
    div.innerHTML =
      '<div class="lic-tela-bloqueada__card">' +
      '<span style="display:inline-flex;color:#ef4444;">' +
      ICO_CADEADO.replace('width="15" height="15"', 'width="40" height="40"') +
      "</span>" +
      "<h2>O módulo " + _esc(nome) + " não está na sua licença</h2>" +
      "<p>Sua licença está <strong>ativa</strong>, mas não inclui este módulo.<br><br>" +
      (PLANOS_DO_MODULO[modulo]
        ? "Ele faz parte dos planos " + _planosHtml(modulo, "e") + ", que incluem " +
          _esc(_listaDoModulo(modulo)) + ". "
        : "Para usá-lo, é necessário uma chave que inclua este módulo. ") +
      "Fale com o suporte para adicionar.</p>" +
      '<div class="lic-tela-bloqueada__acoes">' +
      '<button class="lic-faixa__btn" id="licModuloContratar" style="border-color:var(--clr-primary,#4c8df6);color:var(--clr-primary,#4c8df6);">Falar com o suporte</button>' +
      '<button class="lic-faixa__btn" id="licModuloVoltar">Voltar ao início</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(div);

    // O modal de compra abre com o cabeçalho de quem está com a licença
    // ATIVA e só quer acrescentar o módulo — não com "Sua licença expirou".
    const bC = document.getElementById("licModuloContratar");
    if (bC)
      bC.addEventListener("click", function () {
        _abrirModalRenovacao({ modulo: modulo, nome: nome });
      });
    const bV = document.getElementById("licModuloVoltar");
    if (bV)
      bV.addEventListener("click", function () {
        window.location.href = "index.html";
      });
  }

  /**
   * Aplica a regra de módulo na tela atual, se ela for licenciada.
   * @returns {boolean} true quando a tela foi bloqueada.
   */
  function _aplicarRegraDeModulo(st) {
    const arquivo = _arquivoAtual();
    const modulo = TELAS_LICENCIADAS[arquivo];
    if (!modulo) return false; // tela sem módulo licenciável

    const acesso = _acessoAoModulo(st, modulo);

    if (acesso === "bloqueado") {
      _bloquearModuloNaoContratado(modulo, arquivo);
      return true;
    }
    if (acesso === "teste" && !_jaConfirmou(_marcaCiente(modulo, arquivo))) {
      _modalTeste(modulo, arquivo);
    }
    return false;
  }

  function _arquivoAtual() {
    try {
      return (
        (window.location.pathname || "").split("/").pop().toLowerCase() ||
        "index.html"
      );
    } catch (e) {
      return "";
    }
  }

  function _esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : s;
    return d.innerHTML;
  }

  function _dataBR(expira) {
    if (!expira) return "";
    const d = new Date(expira * 1000);
    const p = (n) => String(n).padStart(2, "0");
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  // Centavos → "R$ 1.249,90" (o formato dos preços do modal de compra).
  function _reais(centavos) {
    let n = Math.round(Number(centavos) || 0);
    const neg = n < 0;
    n = Math.abs(n);
    const inteiro = String(Math.floor(n / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const cent = String(n % 100).padStart(2, "0");
    return (neg ? "-" : "") + "R$ " + inteiro + "," + cent;
  }

  // ── Estilos injetados (não dependem de nenhum CSS do projeto) ──────
  function _injetarEstilo() {
    if (document.getElementById("licencaGuardaEstilo")) return;
    const st = document.createElement("style");
    st.id = "licencaGuardaEstilo";
    st.textContent = `
      .lic-faixa {
        display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
        padding: 12px 16px; margin: 0 0 18px;
        border-radius: 12px; font-size: 13.5px; line-height: 1.5;
      }
      .lic-faixa--bloqueio {
        background: rgba(239, 68, 68, 0.12);
        border: 1px solid #ef4444; color: var(--clr-text, #e2e8f0);
      }
      .lic-faixa--aviso {
        background: rgba(245, 158, 11, 0.12);
        border: 1px solid #f59e0b; color: var(--clr-text, #e2e8f0);
      }
      .lic-faixa__ico { display: inline-flex; flex-shrink: 0; }
      .lic-faixa__txt { flex: 1; min-width: 220px; }
      .lic-faixa__btn {
        border: 1px solid currentColor; background: transparent; color: inherit;
        font: inherit; font-weight: 600; font-size: 12.5px;
        padding: 7px 14px; border-radius: 8px; cursor: pointer; white-space: nowrap;
      }
      /* Módulo bloqueado: fica esmaecido como aviso visual, MAS continua
         clicável — o cliente navega e recebe a explicação na tela de destino.
         Por isso o cursor é de mão, e não de "proibido". */
      .lic-bloqueado {
        opacity: .55; position: relative; filter: grayscale(1);
        cursor: pointer !important;
      }
      .lic-bloqueado:hover { opacity: .78; }
      .lic-cadeado {
        position: absolute; top: 6px; right: 8px;
        display: inline-flex; color: #ef4444; pointer-events: none;
      }
      .lic-tela-bloqueada {
        position: fixed; inset: 0; z-index: 2147483000;
        background: var(--clr-bg, #0f172a);
        display: flex; align-items: center; justify-content: center; padding: 24px;
      }
      .lic-tela-bloqueada__card {
        max-width: 460px; text-align: center;
        background: var(--clr-surface, #1e293b);
        border: 1px solid var(--clr-border, #334155);
        border-radius: 16px; padding: 32px 28px;
      }
      .lic-tela-bloqueada__card h2 {
        margin: 16px 0 8px; font-size: 19px; color: var(--clr-text, #e2e8f0);
      }
      .lic-tela-bloqueada__card p {
        margin: 0 0 20px; font-size: 14px; line-height: 1.6;
        color: var(--clr-text-2, #94a3b8);
      }
      .lic-tela-bloqueada__acoes {
        display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;
      }

      /* ── Modal obrigatório do período de teste ──
         z-index acima de tudo, inclusive do modal de renovação: este
         aviso precisa ser o primeiro a ser visto e não pode ficar atrás
         de nada. Cores vindas das variáveis, para acompanhar os temas. */
      .lic-modulo-modal {
        position: fixed; inset: 0; z-index: 2147483640;
        background: rgba(0,0,0,.72);
        -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px);
        display: flex; align-items: center; justify-content: center;
        padding: 24px;
      }
      .lic-modulo-modal__card {
        max-width: 470px; width: 100%;
        background: var(--clr-surface, #1e293b);
        border: 1px solid var(--clr-border, #334155);
        border-radius: 16px; padding: 28px;
        box-shadow: 0 24px 60px rgba(0,0,0,.45);
      }
      .lic-modulo-modal__tag {
        display: inline-block; margin-bottom: 12px;
        padding: 4px 12px; border-radius: 20px;
        background: rgba(245,158,11,.14);
        border: 1px solid rgba(245,158,11,.45);
        color: #f59e0b; font-size: 11.5px; font-weight: 700;
      }
      .lic-modulo-modal__card h2 {
        margin: 0 0 14px; font-size: 19px;
        color: var(--clr-text, #e2e8f0);
      }
      .lic-modulo-modal__card p {
        margin: 0 0 12px; font-size: 14px; line-height: 1.65;
        color: var(--clr-text-2, #94a3b8);
      }
      .lic-modulo-modal__card strong { color: var(--clr-text, #e2e8f0); }
      .lic-modulo-modal__ok {
        margin-top: 10px; width: 100%;
        padding: 12px 18px; border: none; border-radius: 10px;
        background: var(--clr-primary, #4c8df6); color: #fff;
        font-size: 14.5px; font-weight: 700; font-family: inherit;
        cursor: pointer;
      }
      .lic-modulo-modal__ok:focus-visible {
        outline: 2px solid var(--clr-text, #e2e8f0); outline-offset: 2px;
      }

      /* ── Modal de renovação ── */
      .lic-modal-overlay {
        position: fixed; inset: 0; z-index: 2147483600;
        background: rgba(0,0,0,.62);
        -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px);
        display: flex; align-items: center; justify-content: center;
        padding: 24px; overflow-y: auto;
      }
      .lic-modal {
        width: 100%; max-width: 680px; margin: auto;
        background: var(--clr-surface, #1A2336);
        border: 1px solid var(--clr-border, #38445E);
        border-radius: 20px; padding: 28px;
        box-shadow: 0 30px 80px rgba(0,0,0,.55);
        animation: licRise .28s cubic-bezier(.22,1,.36,1) both;
      }
      @keyframes licRise { from{opacity:0;transform:translateY(16px);} to{opacity:1;transform:translateY(0);} }
      .lic-modal__head { display:flex; align-items:flex-start; gap:14px; margin-bottom:20px; }
      .lic-modal__ico {
        flex-shrink:0; width:44px; height:44px; border-radius:12px;
        background: rgba(239,68,68,.14); color:#ef4444;
        display:flex; align-items:center; justify-content:center;
      }
      .lic-modal__titulo { font-size:20px; font-weight:800; color:var(--clr-text,#DCE3EE); margin:0 0 4px; font-family:"Sora",sans-serif; }
      .lic-modal__sub { font-size:13.5px; color:var(--clr-text-2,#97A3BA); margin:0; line-height:1.55; }
      .lic-modal__fechar {
        margin-left:auto; background:transparent; border:none; color:var(--clr-text-3,#67738D);
        font-size:22px; cursor:pointer; line-height:1; padding:2px 6px; border-radius:6px;
      }
      .lic-modal__fechar:hover { background:var(--clr-surface-alt,#232E45); color:var(--clr-text,#DCE3EE); }
      .lic-modal__bloco { margin-bottom:20px; }
      .lic-modal__bloco-tit {
        font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.7px;
        color:var(--clr-text-3,#67738D); margin:0 0 10px;
      }
      /* Planos */
      /* ── Planos ────────────────────────────────────────────────────
         São QUATRO agora, em duas famílias: com e sem o pacote do
         Processador (Processador de Planilha, Informações de Venda,
         Gerador de EAN e Gestor de Devoluções). Em vez de quatro cartões soltos disputando atenção, os
         dois grupos ficam separados por um rótulo — assim a comparação
         que importa (anual x vitalícia) acontece dentro de cada família,
         e a diferença entre elas é uma decisão só. */
      .lic-planos { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      .lic-planos-grupo { margin-bottom:16px; }
      .lic-planos-grupo:last-child { margin-bottom:0; }
      .lic-grupo-tit {
        display:flex; align-items:center; gap:9px; margin:0 0 10px;
        font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.7px;
        color:var(--clr-text-3,#67738D);
      }
      .lic-grupo-tit--pro { color:var(--clr-primary,#4C8DF6); }
      /* Aviso abaixo dos planos: o que os Termos de Uso pedem em destaque
         no ambiente de contratação (Cláusulas 6, 7, 11 e 51). */
      .lic-planos-nota {
        margin:0; font-size:12px; line-height:1.55;
        color:var(--clr-text-2,#97A3BA);
      }
      .lic-grupo-tit::after {
        content:""; flex:1; height:1px; background:var(--clr-border,#38445E);
      }
      .lic-plano {
        border:1px solid var(--clr-border,#38445E); border-radius:14px; padding:16px;
        background:var(--clr-surface-alt,#232E45); position:relative;
        transition:border-color .15s, transform .15s, box-shadow .15s;
      }
      .lic-plano:hover { transform:translateY(-2px); }
      .lic-plano--destaque { border-color:var(--clr-primary,#4C8DF6); box-shadow:0 0 0 1px var(--clr-primary,#4C8DF6); }

      /* Os planos COM o módulo. O fundo em degradê e a borda azulada
         separam a família à primeira vista, sem precisar ler. */
      .lic-plano--pro {
        border-color:rgba(76,141,246,.45);
        background:
          linear-gradient(160deg, rgba(76,141,246,.13), rgba(76,141,246,0) 62%),
          var(--clr-surface-alt,#232E45);
      }
      .lic-plano--pro:hover { border-color:var(--clr-primary,#4C8DF6); }
      /* O mais completo: leve brilho para ser o ponto de chegada do olho. */
      .lic-plano--top {
        border-color:var(--clr-primary,#4C8DF6);
        box-shadow:0 0 0 1px var(--clr-primary,#4C8DF6), 0 10px 30px rgba(76,141,246,.20);
      }

      .lic-plano__selo {
        position:absolute; top:-9px; right:14px; background:var(--clr-primary,#4C8DF6); color:#fff;
        font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.5px;
        padding:2px 10px; border-radius:999px;
      }
      .lic-plano__selo--ouro {
        background:linear-gradient(135deg,#f59e0b,#d97706);
        box-shadow:0 3px 10px rgba(245,158,11,.35);
      }
      .lic-plano__nome { font-size:14.5px; font-weight:700; color:var(--clr-text,#DCE3EE); margin:0 0 6px; }
      .lic-plano__preco { font-size:26px; font-weight:800; color:var(--clr-primary,#4C8DF6); font-family:"Sora",sans-serif; margin:0 0 12px; }
      .lic-plano__preco small { font-size:12px; font-weight:600; color:var(--clr-text-3,#67738D); }
      .lic-plano__lista { list-style:none; margin:0; padding:0; }
      .lic-plano__lista li { font-size:12.5px; color:var(--clr-text-2,#97A3BA); padding:4px 0 4px 20px; position:relative; }
      .lic-plano__lista li::before { content:"✓"; position:absolute; left:0; color:var(--clr-success,#3FB87A); font-weight:800; }
      /* O item que justifica o preço maior fica em destaque na lista. */
      .lic-plano__lista li.destaque { color:var(--clr-text,#DCE3EE); font-weight:600; }
      .lic-plano__lista li.destaque::before { color:var(--clr-primary,#4C8DF6); }

      @media (max-width: 620px) {
        .lic-planos { grid-template-columns:1fr; }
      }
      /* PIX */
      .lic-pix {
        display:flex; align-items:center; gap:12px; flex-wrap:wrap;
        background:var(--clr-surface-alt,#232E45); border:1px solid var(--clr-border,#38445E);
        border-radius:12px; padding:14px 16px;
      }
      .lic-pix__info { flex:1; min-width:180px; }
      .lic-pix__rot { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:var(--clr-text-3,#67738D); }
      .lic-pix__val { font-size:18px; font-weight:700; color:var(--clr-text,#DCE3EE); font-family:"Sora",sans-serif; letter-spacing:.5px; }
      /* Passos */
      .lic-passos { margin:0; padding-left:20px; }
      .lic-passos li { font-size:12.5px; color:var(--clr-text-2,#97A3BA); padding:3px 0; line-height:1.5; }
      /* Botões */
      .lic-acoes { display:flex; gap:10px; flex-wrap:wrap; }
      .lic-btn {
        display:inline-flex; align-items:center; justify-content:center; gap:7px;
        padding:12px 20px; border-radius:11px; font:inherit; font-size:14px; font-weight:600;
        cursor:pointer; border:1px solid transparent; transition:background .15s, border-color .15s, transform .1s;
      }
      .lic-btn:active { transform:scale(.98); }
      .lic-btn--primario { background:var(--clr-primary,#4C8DF6); color:#fff; box-shadow:0 6px 18px var(--clr-primary-lt,#25406E); }
      .lic-btn--primario:hover { background:var(--clr-primary-hover,#6BA2F8); }
      .lic-btn--secundario { background:transparent; border-color:var(--clr-border,#38445E); color:var(--clr-text-2,#97A3BA); }
      .lic-btn--secundario:hover { background:var(--clr-surface-alt,#232E45); color:var(--clr-text,#DCE3EE); }
      /* Área "já tenho a chave" */
      .lic-ativar { margin-top:16px; padding-top:18px; border-top:1px solid var(--clr-border,#38445E); display:none; }
      .lic-ativar.aberta { display:block; }
      .lic-ativar__campo {
        width:100%; padding:12px 14px; background:var(--clr-surface-alt,#232E45);
        border:1px solid var(--clr-border,#38445E); border-radius:11px; color:var(--clr-text,#DCE3EE);
        font:inherit; font-size:15px; letter-spacing:1px; outline:none; margin-bottom:10px; box-sizing:border-box;
      }
      .lic-ativar__campo:focus { border-color:var(--clr-primary,#4C8DF6); }
      .lic-ativar__msg { font-size:12.5px; margin-top:10px; min-height:16px; }
      .lic-ativar__msg--erro { color:var(--clr-danger,#E0625F); }
      .lic-ativar__msg--ok { color:var(--clr-success,#3FB87A); }
      .lic-ativar__campo--erro { border-color:var(--clr-danger,#E0625F) !important; box-shadow:0 0 0 3px rgba(224,98,95,.2); }
      @media (max-width:560px){ .lic-planos{grid-template-columns:1fr;} }

      /* Cabeçalho do modal da chave: neutro (renovar ou mudar de plano). */
      .lic-modal__ico--chave { background:rgba(76,141,246,.14); color:var(--clr-primary,#4C8DF6); }
      .lic-plano__desc { margin:-2px 0 8px; font-size:11.5px; font-weight:600; color:var(--clr-text-3,#67738D); }

      /* ── Módulo fora do plano (dashboard) ──
         A chave está ativa, mas não inclui os módulos Plus: o botão fica
         mais apagado e na cor de destaque, com um "+" (Plus) no ícone.
         Continua clicável — a tela do módulo explica e oferece o upgrade. */
      .lic-fora-plano .sidebar-item-btn { opacity:.58; color:var(--clr-accent,#E0A23D); }
      .lic-fora-plano .sidebar-item-btn:hover {
        opacity:.95; color:var(--clr-accent,#E0A23D);
        border-color:var(--clr-accent,#E0A23D);
      }
      .lic-fora-plano .sidebar-btn-icon { position:relative; }
      .lic-plano-tag {
        position:absolute; top:-6px; right:-4px;
        display:flex; align-items:center; justify-content:center;
        width:12px; height:12px; border-radius:50%;
        background:var(--clr-accent,#E0A23D); color:#fff;
        font-size:10.5px; font-weight:800; line-height:1;
        box-shadow:0 0 0 2px var(--clr-surface,#1B2436);
        pointer-events:none;
      }

      /* ── Alterar minha chave (Central de Ajuda) ──
         Letras um pouco maiores que nos outros avisos da licença: é uma
         janela de leitura (plano atual, os outros planos e o que fazer). */
      .lic-modal.lic-troca { max-width:640px; }
      .lic-troca .lic-modal__titulo { font-size:22px; }
      .lic-troca .lic-modal__sub { font-size:14.5px; }
      .lic-troca .lic-modal__fechar { font-size:24px; }
      .lic-troca .lic-btn { font-size:15px; padding:13px 22px; }
      .lic-escada { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:6px 0 20px; }
      .lic-degrau {
        position:relative; padding:15px 16px 14px; border:1px solid var(--clr-border,#38445E);
        border-radius:12px; background:var(--clr-surface-alt,#232E45); opacity:.5;
      }
      .lic-degrau__nome { font-size:16px; font-weight:700; color:var(--clr-text,#DCE3EE); }
      .lic-degrau__desc { margin-top:4px; font-size:13.5px; line-height:1.45; color:var(--clr-text-3,#67738D); }
      .lic-degrau__tag {
        position:absolute; top:-10px; right:12px; padding:2px 10px; border-radius:999px;
        font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.5px;
      }
      .lic-degrau--atual { opacity:1; border-color:var(--clr-primary,#4C8DF6); box-shadow:0 0 0 1px var(--clr-primary,#4C8DF6); }
      .lic-degrau--atual .lic-degrau__tag { background:var(--clr-primary,#4C8DF6); color:#fff; }
      .lic-degrau--upgrade { opacity:1; border-style:dashed; border-color:var(--clr-accent,#E0A23D); }
      .lic-degrau--upgrade .lic-degrau__tag { background:var(--clr-accent,#E0A23D); color:#fff; }
      .lic-troca__msg { margin:0 0 22px; font-size:15.5px; line-height:1.65; color:var(--clr-text-2,#97A3BA); }
      .lic-troca__msg strong { color:var(--clr-text,#DCE3EE); }
      .lic-troca--max .lic-modal__ico { background:rgba(245,158,11,.16); color:#f59e0b; }
      .lic-troca__acoes { justify-content:flex-end; }
      @media (max-width:520px){ .lic-escada{grid-template-columns:1fr;} }

      /* ── Upgrade: crédito e valor a pagar ──
         Os valores vêm do processo principal (licenca:orcamento),
         calculados a partir da chave conferida: a tela só mostra. */
      .lic-orc {
        margin:0 0 14px; padding:12px 14px; border-radius:12px;
        font-size:13px; line-height:1.55; color:var(--clr-text-2,#97A3BA);
        border:1px solid var(--clr-border,#38445E); background:var(--clr-surface-alt,#232E45);
      }
      .lic-orc[hidden], .lic-pagar[hidden], .lic-plano__up[hidden] { display:none; }
      .lic-orc strong { color:var(--clr-text,#DCE3EE); }
      .lic-orc--ok { border-color:rgba(63,184,122,.55); background:rgba(63,184,122,.10); }
      .lic-orc--alerta { border-color:rgba(245,158,11,.55); background:rgba(245,158,11,.10); }
      .lic-orc--info { border-color:rgba(76,141,246,.45); background:rgba(76,141,246,.08); }
      .lic-plano__up {
        margin:-6px 0 12px; padding:8px 10px; border-radius:10px;
        background:rgba(63,184,122,.10); border:1px solid rgba(63,184,122,.40);
        font-size:12px; line-height:1.45; color:var(--clr-text-2,#97A3BA);
      }
      .lic-plano__up strong { display:block; font-size:17px; color:var(--clr-success,#3FB87A); font-family:"Sora",sans-serif; }
      .lic-plano__selo--esq { right:auto; left:14px; }
      .lic-plano__selo--verde { background:var(--clr-success,#3FB87A); }
      .lic-plano--clicavel { cursor:pointer; }
      .lic-plano--clicavel:focus-visible { outline:2px solid var(--clr-primary,#4C8DF6); outline-offset:2px; }
      .lic-plano--sel { border-color:var(--clr-success,#3FB87A) !important; box-shadow:0 0 0 2px var(--clr-success,#3FB87A) !important; }
      .lic-pagar {
        margin:0 0 12px; padding:14px 16px; border-radius:12px;
        border:1px solid var(--clr-success,#3FB87A); background:rgba(63,184,122,.08);
      }
      .lic-pagar__rot { font-size:12.5px; font-weight:600; color:var(--clr-text-2,#97A3BA); }
      .lic-pagar__val { font-size:26px; font-weight:800; color:var(--clr-text,#DCE3EE); font-family:"Sora",sans-serif; margin:2px 0 4px; }
      .lic-pagar__det { font-size:12.5px; line-height:1.5; color:var(--clr-text-2,#97A3BA); }
      .lic-pagar__det strong { color:var(--clr-text,#DCE3EE); }
      /* Alterar minha chave: o valor de cada plano na escada. */
      .lic-degrau__valor { margin-top:8px; font-size:13.5px; color:var(--clr-text-2,#97A3BA); }
      .lic-degrau__valor strong { color:var(--clr-success,#3FB87A); font-size:15px; }
      .lic-degrau__valor s { margin-left:6px; color:var(--clr-text-3,#67738D); }
      .lic-degrau--clicavel { cursor:pointer; transition:transform .15s, border-color .15s; }
      .lic-degrau--clicavel:hover { transform:translateY(-2px); border-style:solid; }
      .lic-degrau--clicavel:focus-visible { outline:2px solid var(--clr-primary,#4C8DF6); outline-offset:2px; }
      .lic-degrau--escolhido .lic-degrau__tag { background:var(--clr-success,#3FB87A); color:#fff; }
      @media (prefers-reduced-motion: reduce) { .lic-degrau--clicavel:hover { transform:none; } }
    `;
    document.head.appendChild(st);
  }

  // ── Configuração comercial (valores temporários) ──
  // Chave PIX: o e-mail do Bapell Gestor Pro.
  var LIC_PIX_CHAVE = "bapellgestorpro@gmail.com";
  var LIC_PIX_ROTULO = "PIX (e-mail)";
  var LIC_FORM_URL =
    "https://docs.google.com/forms/d/e/1FAIpQLSf6BcgW3nLCL_nJ4lOGnUjGtVMpg7KeDJfg1fEUsGcBzhwKYA/viewform?usp=publish-editor";
  var LIC_FORM_ENTRY = "entry.30111011";

  const ICO_CADEADO =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
  const ICO_CHAVE =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5"></circle><path d="M10.7 12.3 21 2"></path><path d="m16 7 3 3"></path><path d="m19 4 2 2"></path></svg>';
  const ICO_ALERTA =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';

  // ── Faixa no topo do conteúdo ──────────────────────────────────────
  function _mostrarFaixa(tipo, html) {
    if (document.getElementById("licFaixa")) return;
    const alvo =
      document.querySelector(".main-content") ||
      document.querySelector(".dashboard-main") ||
      document.body;
    const faixa = document.createElement("div");
    faixa.id = "licFaixa";
    faixa.className = "lic-faixa lic-faixa--" + tipo;
    faixa.innerHTML = html;
    alvo.insertBefore(faixa, alvo.firstChild);
  }

  // ── Sinalização dos módulos no dashboard ───────────────────────────
  //  Apenas marca visualmente (esmaecido + cadeado). NÃO barra o clique:
  //  quem explica a situação é a tela de destino, que tem espaço para o
  //  aviso completo e para o botão de backup.
  function _bloquearModulos() {
    // Botões do menu lateral.
    //
    // O seletor procura SÓ pelo data-modid. Antes ele exigia também a classe
    // .module-nav-item, que não existe mais no HTML do dashboard (hoje é
    // .sidebar-item-btn) — resultado: não encontrava nada e nenhum módulo
    // recebia cadeado. Sem a classe no seletor, uma futura troca de classe
    // não quebra o bloqueio de novo.
    const itens = document.querySelectorAll("[data-modid]");
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      const id = ((item.dataset && item.dataset.modid) || "").toLowerCase();
      if (!id || MODULOS_LIVRES.indexOf(id) >= 0) continue;
      _marcarBloqueado(item);
    }

    // Cartões de plataforma (levam à tela de produto)
    const grid = document.getElementById("platformsGrid");
    if (grid) grid.classList.add("lic-bloqueado");

    // Adicionar plataforma / lojas ocultas
    ["btnAddPlatform", "btnHiddenPlatforms", "btnCadastrarPrimeira"].forEach(
      function (id) {
        const b = document.getElementById(id);
        if (b) b.classList.add("lic-bloqueado");
      },
    );
  }

  function _marcarBloqueado(item) {
    if (item.classList.contains("lic-bloqueado")) return;
    item.classList.add("lic-bloqueado");
    item.title = "Licença vencida — renove para voltar a usar este módulo";
    // O cadeado é posicionado em relação ao próprio botão.
    let pos = "";
    try {
      pos = window.getComputedStyle(item).position;
    } catch (e) {}
    if (!pos || pos === "static") item.style.position = "relative";
    if (!item.querySelector(".lic-cadeado")) {
      const c = document.createElement("span");
      c.className = "lic-cadeado";
      c.innerHTML = ICO_CADEADO;
      item.appendChild(c);
    }
  }

  // ── Tela inteira bloqueada (ao abrir um módulo pago) ────────────────
  function _bloquearTelaInteira() {
    _injetarEstilo();
    const div = document.createElement("div");
    div.className = "lic-tela-bloqueada";
    div.innerHTML =
      '<div class="lic-tela-bloqueada__card">' +
      '<span style="display:inline-flex;color:#ef4444;">' +
      ICO_CADEADO.replace('width="15" height="15"', 'width="40" height="40"') +
      "</span>" +
      "<h2>Módulo bloqueado</h2>" +
      "<p>Sua licença venceu. Este módulo ficará indisponível até a renovação.<br><br>" +
      "Seus dados continuam salvos neste computador — você pode exportar um backup dos seus dados na tela de Ajuda.</p>" +
      '<div class="lic-tela-bloqueada__acoes">' +
      '<button class="lic-faixa__btn" id="licTelaRenovar" style="border-color:var(--clr-primary,#4c8df6);color:var(--clr-primary,#4c8df6);">Renovar licença</button>' +
      '<button class="lic-faixa__btn" id="licIrAjuda" style="border-color:var(--clr-primary,#4c8df6);color:var(--clr-primary,#4c8df6);">Exportar backup</button>' +
      '<button class="lic-faixa__btn" id="licVoltarInicio">Voltar ao início</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(div);

    const bRen = document.getElementById("licTelaRenovar");
    if (bRen) bRen.addEventListener("click", _abrirModalRenovacao);
    const b = document.getElementById("licIrAjuda");
    if (b)
      b.addEventListener("click", function () {
        window.location.href = "ajuda.html";
      });
    // Sem este botão o cliente ficava preso na tela coberta, já que o menu
    // lateral também fica atrás da cobertura.
    const bV = document.getElementById("licVoltarInicio");
    if (bV)
      bV.addEventListener("click", function () {
        window.location.href = "index.html";
      });
  }

  // ── Avisos de vencimento próximo ───────────────────────────────────
  function _avisarSeVencendo(st) {
    const dias = Number(st.diasRestantes);
    if (!isFinite(dias)) return; // vitalícia
    const marcos = AVISOS_POR_TIPO[Number(st.tipo)];
    if (!marcos || marcos.indexOf(dias) < 0) return;

    _injetarEstilo();
    const quando = dias === 1 ? "amanhã" : "em " + dias + " dias";

    // Nova chave de teste (com o plano escolhido): diz o que acontece no fim
    // do teste — a volta à licença paga guardada e o plano a comprar.
    const guardada = st.pagaGuardada;
    if (Number(st.tipo) === TIPO_TESTE && (guardada || st.planoEscolhido)) {
      const escolhido = _nomePlano(st.planoEscolhido);
      _mostrarFaixa(
        "aviso",
        '<span class="lic-faixa__ico" style="color:#f59e0b;">' +
          ICO_ALERTA +
          "</span>" +
          '<span class="lic-faixa__txt"><strong>Seu período de teste termina ' +
          quando +
          "</strong> (" +
          _dataBR(st.expira) +
          ")." +
          (guardada && guardada.rotuloPlano
            ? " Depois dele, o sistema volta para a sua licença paga (<strong>" + _esc(guardada.rotuloPlano) + "</strong>)."
            : "") +
          (escolhido
            ? " Para continuar com o plano escolhido (<strong>" + _esc(escolhido) + "</strong>), faça a compra."
            : " Renove para continuar usando o sistema sem interrupção.") +
          "</span>",
      );
      return;
    }

    _mostrarFaixa(
      "aviso",
      '<span class="lic-faixa__ico" style="color:#f59e0b;">' +
        ICO_ALERTA +
        "</span>" +
        '<span class="lic-faixa__txt"><strong>Sua licença vence ' +
        quando +
        "</strong>" +
        " (" +
        _esc(st.rotuloTipo || "") +
        " — " +
        _dataBR(st.expira) +
        ")." +
        " Renove para continuar usando o sistema sem interrupção.</span>",
    );
  }

  // Ativação só existe na tela de ativação: o preload expõe licencaAPI.ativar
  // apenas lá, de propósito (nenhuma outra tela precisa gravar licença).
  function _podeAtivarAqui() {
    return !!(
      window.licencaAPI && typeof window.licencaAPI.ativar === "function"
    );
  }

  // ── Modal de renovação completo ────────────────────────────────────
  //
  // `extra` só vem da tela de módulo não contratado ({ modulo, nome }): aí
  // a licença está ATIVA e o cabeçalho fala em acrescentar o módulo. Nos
  // demais usos (licença vencida) chega o evento do clique, ou nada, e o
  // cabeçalho é o de sempre.
  function _abrirModalRenovacao(extra) {
    if (document.getElementById("licModalOverlay")) return;
    _injetarEstilo();

    var ctx = extra && typeof extra.nome === "string" ? extra : null;
    // Abrir já com o campo da chave à vista ("Inserir nova chave").
    var abrirAtivacao = !!(extra && extra.ativar === true);
    // O mesmo texto serve para quem renova uma licença vencida e para quem
    // muda de plano (upgrade): nenhum dos dois casos é dito como o único.
    var tituloModal = "Nova chave de ativação";
    var subModal =
      "Para <strong>renovar</strong> a licença ou <strong>mudar de plano</strong>, escolha o plano, " +
      "faça o pagamento e solicite a sua chave. " +
      "<strong>Não é preciso reinstalar</strong> e <strong>nenhum dado será perdido</strong> — " +
      "ao inserir a chave nova, o sistema é atualizado na hora.";
    if (ctx) {
      tituloModal = "Acrescente o módulo " + ctx.nome + " à sua licença";
      subModal =
        "Sua licença está <strong>ativa</strong>. " +
        (PLANOS_DO_MODULO[ctx.modulo]
          ? "O módulo faz parte dos planos " + _planosHtml(ctx.modulo, "e") +
            ", que incluem " + _esc(_listaDoModulo(ctx.modulo)) + ". "
          : "") +
        "<strong>Não é preciso reinstalar</strong> e <strong>nenhum dado será perdido</strong> — " +
        "ao inserir a nova chave, o módulo é liberado na hora.";
    }

    // Quando a tela atual não pode ativar, o botão leva à tela de ativação
    // em vez de abrir um campo que iria falhar com "indisponível nesta tela".
    var podeAtivar = _podeAtivarAqui();
    var rotuloJaTenho = "Já tenho minha chave";

    var ov = document.createElement("div");
    ov.className = "lic-modal-overlay";
    ov.id = "licModalOverlay";
    ov.innerHTML =
      '<div class="lic-modal" role="dialog" aria-modal="true">' +
      '<div class="lic-modal__head">' +
      '<span class="lic-modal__ico lic-modal__ico--chave">' + ICO_CHAVE + "</span>" +
      "<div>" +
      '<h2 class="lic-modal__titulo">' + _esc(tituloModal) + "</h2>" +
      '<p class="lic-modal__sub">' + subModal + "</p>" +
      "</div>" +
      '<button class="lic-modal__fechar" id="licModalX" title="Fechar">✕</button>' +
      "</div>" +
      // Planos
      '<div class="lic-modal__bloco">' +
      '<div class="lic-modal__bloco-tit">Escolha seu plano</div>' +
      // Crédito da licença atual no upgrade (preenchido pelo orçamento).
      '<div class="lic-orc" id="licOrcAviso" hidden></div>' +

      // ── Família 1: planos sem o módulo ──
      // O título diz o que falta (os módulos Plus), e não "Sistema
      // completo": os Termos de Uso dizem que nem todo plano inclui todos
      // os módulos, e a oferta precisa dizer o mesmo.
      '<div class="lic-planos-grupo">' +
      '<div class="lic-grupo-tit">Licença Anual e Vitalícia — sem os módulos Plus</div>' +
      '<div class="lic-planos">' +
      '<div class="lic-plano" data-plano="anual">' +
      '<div class="lic-plano__nome">Licença Anual</div>' +
      '<div class="lic-plano__desc">365 dias de uso</div>' +
      '<div class="lic-plano__preco"><span class="lic-plano__valor">R$ 419,00</span> <small>/ano</small></div>' +
      '<div class="lic-plano__up" hidden></div>' +
      '<ul class="lic-plano__lista">' +
      "<li>365 dias de utilização</li>" +
      "<li>Atualizações inclusas</li>" +
      "<li>Suporte durante a validade</li>" +
      "</ul>" +
      "</div>" +
      '<div class="lic-plano" data-plano="vitalicia">' +
      '<div class="lic-plano__nome">Licença Vitalícia</div>' +
      '<div class="lic-plano__desc">Uso permanente</div>' +
      '<div class="lic-plano__preco"><span class="lic-plano__valor">R$ 997,00</span> <small>único</small></div>' +
      '<div class="lic-plano__up" hidden></div>' +
      '<ul class="lic-plano__lista">' +
      "<li>Uso permanente</li>" +
      // "da versão adquirida": a vitalícia não inclui versões futuras nem
      // módulos novos vendidos à parte (Termos de Uso, Cláusulas 7 e 11).
      "<li>Atualizações da versão adquirida</li>" +
      "<li>Paga uma vez, usa sempre</li>" +
      "</ul>" +
      "</div>" +
      "</div>" +
      "</div>" +

      // ── Família 2: planos COM os módulos Plus (Pro e Platinum) ──
      // O que muda entre as duas famílias é o pacote de módulos, e ele
      // aparece em destaque na lista de cada cartão. Repetir os benefícios
      // comuns deixa claro que nada se perde ao subir de plano.
      '<div class="lic-planos-grupo">' +
      '<div class="lic-grupo-tit lic-grupo-tit--pro">Pro e Platinum — com os módulos Plus</div>' +
      '<div class="lic-planos">' +
      '<div class="lic-plano lic-plano--pro" data-plano="pro">' +
      '<div class="lic-plano__nome">Pro</div>' +
      '<div class="lic-plano__desc">Anual, com os módulos Plus</div>' +
      '<div class="lic-plano__preco"><span class="lic-plano__valor">R$ 599,90</span> <small>/ano</small></div>' +
      '<div class="lic-plano__up" hidden></div>' +
      '<ul class="lic-plano__lista">' +
      '<li class="destaque">Processador de Planilha</li>' +
      '<li class="destaque">Informações de Venda</li>' +
      '<li class="destaque">Gerador de EAN</li>' +
      '<li class="destaque">Gestor de Devoluções</li>' +
      "<li>365 dias de utilização</li>" +
      "<li>Atualizações inclusas</li>" +
      "<li>Suporte durante a validade</li>" +
      "</ul>" +
      "</div>" +
      '<div class="lic-plano lic-plano--pro lic-plano--top" data-plano="platinum">' +
      '<span class="lic-plano__selo lic-plano__selo--ouro">Mais completo</span>' +
      '<div class="lic-plano__nome">Platinum</div>' +
      '<div class="lic-plano__desc">Vitalícia, com os módulos Plus</div>' +
      '<div class="lic-plano__preco"><span class="lic-plano__valor">R$ 1.249,90</span> <small>único</small></div>' +
      '<div class="lic-plano__up" hidden></div>' +
      '<ul class="lic-plano__lista">' +
      '<li class="destaque">Processador de Planilha</li>' +
      '<li class="destaque">Informações de Venda</li>' +
      '<li class="destaque">Gerador de EAN</li>' +
      '<li class="destaque">Gestor de Devoluções</li>' +
      "<li>Uso permanente</li>" +
      "<li>Atualizações da versão adquirida</li>" +
      "<li>Sem mensalidade</li>" +
      "</ul>" +
      "</div>" +
      "</div>" +
      "</div>" +
      // Mesmo aviso dos Termos de Uso, à vista de quem escolhe o plano.
      '<p class="lic-planos-nota"><strong>Importante:</strong> nem todo plano inclui todos os módulos. ' +
      "A Licença Vitalícia e o Platinum valem para a versão adquirida: versões futuras do sistema e " +
      "novos módulos vendidos separadamente não estão incluídos automaticamente. " +
      "As condições completas estão nos Termos de Uso.</p>" +
      "</div>" +
      // PIX
      '<div class="lic-modal__bloco">' +
      '<div class="lic-modal__bloco-tit">Pagamento via PIX</div>' +
      // Valor a pagar pelo plano clicado (preço − crédito, quando houver).
      '<div class="lic-pagar" id="licPagar" hidden aria-live="polite"></div>' +
      '<div class="lic-pix">' +
      '<div class="lic-pix__info">' +
      '<div class="lic-pix__rot">' + _esc(LIC_PIX_ROTULO) + "</div>" +
      '<div class="lic-pix__val">' +
      _esc(LIC_PIX_CHAVE) +
      "</div>" +
      "</div>" +
      '<button class="lic-btn lic-btn--secundario" id="licPixCopiar">Copiar PIX</button>' +
      "</div>" +
      "</div>" +
      // Passo a passo
      '<div class="lic-modal__bloco">' +
      '<div class="lic-modal__bloco-tit">Como obter a nova chave</div>' +
      '<ol class="lic-passos">' +
      '<li id="licPasso1">Escolha um dos quatro planos acima.</li>' +
      "<li>Efetue o pagamento via PIX.</li>" +
      "<li>Clique em <strong>Solicitar Nova Chave</strong> e preencha o formulário.</li>" +
      "<li>Anexe o comprovante do pagamento.</li>" +
      "<li>Aguarde a validação.</li>" +
      "<li>Receba sua nova chave e ative em <strong>" +
      _esc(rotuloJaTenho) +
      "</strong>.</li>" +
      "</ol>" +
      "</div>" +
      // Ações principais
      '<div class="lic-acoes">' +
      '<button class="lic-btn lic-btn--primario" id="licSolicitar">Solicitar Nova Chave</button>' +
      '<button class="lic-btn lic-btn--secundario" id="licJaTenho">' +
      _esc(rotuloJaTenho) +
      "</button>" +
      "</div>" +
      // Área de ativação (expansível)
      '<div class="lic-ativar" id="licAtivarArea">' +
      '<div class="lic-modal__bloco-tit">Ativar nova chave</div>' +
      '<input type="text" class="lic-ativar__campo" id="licChaveInput" ' +
      'placeholder="Cole aqui sua nova chave de ativação" autocomplete="off" spellcheck="false" />' +
      '<div class="lic-acoes">' +
      '<button class="lic-btn lic-btn--primario" id="licAtivarBtn">Ativar</button>' +
      "</div>" +
      '<div class="lic-ativar__msg" id="licAtivarMsg"></div>' +
      "</div>" +
      "</div>";

    document.body.appendChild(ov);

    // Fecha ao clicar fora ou no X
    ov.addEventListener("click", function (e) {
      if (e.target === ov) _fecharModal();
    });
    document
      .getElementById("licModalX")
      .addEventListener("click", _fecharModal);

    // Copiar PIX
    document
      .getElementById("licPixCopiar")
      .addEventListener("click", function () {
        var btn = this;
        _copiarTexto(LIC_PIX_CHAVE);
        var orig = btn.textContent;
        btn.textContent = "Copiado!";
        setTimeout(function () {
          btn.textContent = orig;
        }, 1800);
      });

    // Solicitar nova chave → abre o Google Forms com a chave atual preenchida
    document
      .getElementById("licSolicitar")
      .addEventListener("click", _abrirFormulario);

    // Já tenho minha chave → expande a área ou leva à tela de ativação
    document
      .getElementById("licJaTenho")
      .addEventListener("click", function () {
        if (!_podeAtivarAqui()) {
          window.location.href = "ativacao.html";
          return;
        }
        var area = document.getElementById("licAtivarArea");
        area.classList.add("aberta");
        var inp = document.getElementById("licChaveInput");
        if (inp) inp.focus();
      });

    // Ativar
    document
      .getElementById("licAtivarBtn")
      .addEventListener("click", _ativarNovaChave);
    document
      .getElementById("licChaveInput")
      .addEventListener("keydown", function (e) {
        if (e.key === "Enter") _ativarNovaChave();
      });

    // "Inserir nova chave" (Alterar minha chave): já abre no campo.
    if (abrirAtivacao) {
      var bJa = document.getElementById("licJaTenho");
      if (bJa) bJa.click();
      var areaAt = document.getElementById("licAtivarArea");
      if (areaAt && areaAt.classList.contains("aberta")) {
        setTimeout(function () { try { areaAt.scrollIntoView({ block: "nearest" }); } catch (e) {} }, 60);
      }
    }

    // Preços de tabela, crédito e valor do upgrade: vêm do processo
    // principal. { plano: "pro" } (vindo de "Alterar minha chave") já
    // abre com aquele plano escolhido.
    _carregarOrcamento(ov, extra && typeof extra.plano === "string" ? extra.plano : "");
  }

  function _fecharModal() {
    var ov = document.getElementById("licModalOverlay");
    if (ov) ov.remove();
  }

  // ── Orçamento do upgrade no modal de compra ────────────────────────
  //
  // Valor do upgrade = preço do plano desejado − crédito da licença atual,
  // nunca negativo. O cálculo é do processo principal (licenca:orcamento),
  // a partir da chave conferida pela assinatura: o plano atual, o valor
  // pago e se a licença está ativa. Esta tela só mostra o resultado.
  //
  // Sem a ponte (fora do app), o modal fica como sempre foi: os preços de
  // tabela escritos no HTML e os cartões sem clique.

  function _nomeOrigem(o) {
    return o && o.origem ? (o.origem.rotuloPlano || _nomePlano(o.origem.plano)) : "";
  }

  // "Licença Vitalícia, Pro ou Platinum" — os planos para os quais dá para subir.
  function _listaUpgrades(o) {
    return _juntar((o.upgrades || []).map(_nomePlano).filter(Boolean), "ou");
  }

  /** O aviso do crédito, acima dos planos: { tipo, html } ou null. */
  function _avisoDoOrcamento(o) {
    const origem = o.origem;
    const nome = _esc(_nomeOrigem(o));
    const escolhido = o.planoEscolhido ? _esc(_nomePlano(o.planoEscolhido)) : "";
    const fraseEscolhido = escolhido ? " No teste, você escolheu o plano <strong>" + escolhido + "</strong>." : "";

    if (origem && (o.upgrades || []).length) {
      if (!origem.ativa) {
        return {
          tipo: "alerta",
          html: "Sua licença " + (origem.guardada ? "paga" : "atual") + " (<strong>" + nome + "</strong>) venceu. " +
            "Licença vencida não gera crédito: os valores abaixo são os de tabela." + fraseEscolhido,
        };
      }
      if (origem.valorPago === null || origem.valorPago === undefined) {
        return {
          tipo: "alerta",
          html: "Sua chave atual (<strong>" + nome + "</strong>) não traz o valor pago, então o crédito do upgrade " +
            "não pode ser calculado aqui. Fale com o suporte antes de pagar o upgrade." + fraseEscolhido,
        };
      }
      return {
        tipo: "ok",
        html: (origem.guardada
            ? "Você está no período de teste. Sua licença paga (<strong>" + nome + "</strong>) está guardada e " +
              "volta a valer quando o teste terminar. Num upgrade para " + _esc(_listaUpgrades(o)) +
              ", o valor que você pagou por ela (<strong>" + _reais(origem.valorPago) + "</strong>) é descontado do preço. "
            : "Num upgrade para " + _esc(_listaUpgrades(o)) + ", o valor que você pagou pela sua licença atual (<strong>" +
              nome + "</strong>, <strong>" + _reais(origem.valorPago) + "</strong>) é descontado do preço. ") +
          "O valor com o desconto aparece em cada plano." + fraseEscolhido,
      };
    }
    if (o.teste && escolhido) {
      return {
        tipo: "info",
        html: "No teste, você escolheu o plano <strong>" + escolhido + "</strong>. O teste não é pagamento " +
          "e não gera crédito: o valor é o de tabela.",
      };
    }
    return null;
  }

  /** A linha de explicação do valor a pagar, conforme o motivo do crédito. */
  function _detalheDoValor(o, it) {
    const nome = _esc(_nomeOrigem(o));
    if (it.upgrade && it.creditoCentavos > 0) {
      return "Preço do plano " + _reais(it.precoCentavos) + " − crédito de <strong>" +
        _reais(it.creditoCentavos) + "</strong>, o valor pago pela sua licença " +
        (o.origem && o.origem.guardada ? "guardada" : "atual") + " (" + nome + ").";
    }
    switch (it.motivo) {
      case "vencida":
        return "Valor de tabela: a sua licença (" + nome + ") venceu, e licença vencida não gera crédito.";
      case "sem-valor-pago":
        return "Valor de tabela: a chave atual não traz o valor pago. Fale com o suporte antes de pagar o upgrade.";
      case "nao-e-upgrade":
        if (it.atual) {
          return it.vitalicia
            ? "Este já é o seu plano."
            : "Renovação do seu plano: valor de tabela.";
        }
        return (o.upgrades || []).length
          ? "Valor de tabela: o crédito da licença atual vale só no upgrade para " + _esc(_listaUpgrades(o)) + "."
          : "Valor de tabela.";
      case "sem-licenca-paga":
        return o.teste
          ? "Valor de tabela: o período de teste não gera crédito."
          : "Valor de tabela.";
      default:
        return "Valor de tabela.";
    }
  }

  function _selecionarPlano(ov, o, it) {
    const cards = ov.querySelectorAll(".lic-plano[data-plano]");
    for (let i = 0; i < cards.length; i++) {
      const sel = cards[i].getAttribute("data-plano") === it.alvo;
      cards[i].classList.toggle("lic-plano--sel", sel);
      cards[i].setAttribute("aria-pressed", sel ? "true" : "false");
    }
    const box = ov.querySelector("#licPagar");
    if (!box) return;
    box.innerHTML =
      '<div class="lic-pagar__rot">Valor a pagar pelo plano ' + _esc(it.nome) + "</div>" +
      '<div class="lic-pagar__val">' + _esc(_reais(it.valorCentavos)) + "</div>" +
      '<div class="lic-pagar__det">' + _detalheDoValor(o, it) + "</div>";
    box.hidden = false;
  }

  async function _carregarOrcamento(ov, planoInicial) {
    if (!window.licencaAPI || typeof window.licencaAPI.orcamento !== "function") return;
    let o = null;
    try { o = await window.licencaAPI.orcamento(); } catch (e) { o = null; }
    // O modal pode ter sido fechado enquanto o orçamento chegava.
    if (!o || !o.ok || !Array.isArray(o.itens) || !ov || !document.body.contains(ov)) return;

    const itens = {};
    o.itens.forEach(function (it) { if (it && it.ok && it.alvo) itens[it.alvo] = it; });

    const cards = ov.querySelectorAll(".lic-plano[data-plano]");
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const it = itens[card.getAttribute("data-plano")];
      if (!it) continue;

      // Preço de tabela: o mesmo do Gerador de Chaves (licenca-core.js).
      const val = card.querySelector(".lic-plano__valor");
      if (val) val.textContent = _reais(it.precoCentavos);

      // Selo: o plano atual (ou o guardado) e o escolhido no teste.
      const selo = it.atual
        ? (o.origem && o.origem.guardada ? "Sua licença" : "Seu plano")
        : (it.escolhido ? "Escolhido no teste" : "");
      if (selo && !card.querySelector(".lic-plano__selo--esq")) {
        const s = document.createElement("span");
        s.className = "lic-plano__selo lic-plano__selo--esq" + (it.escolhido && !it.atual ? " lic-plano__selo--verde" : "");
        s.textContent = selo;
        card.insertBefore(s, card.firstChild);
      }

      // Upgrade com crédito: o valor para este cliente, já com o desconto.
      const up = card.querySelector(".lic-plano__up");
      if (up && it.upgrade && it.creditoCentavos > 0) {
        up.innerHTML =
          "No upgrade, para você" +
          "<strong>" + _esc(_reais(it.valorCentavos)) + "</strong>" +
          "Crédito de " + _esc(_reais(it.creditoCentavos)) + " já descontado";
        up.hidden = false;
      }

      // O cartão passa a ser clicável: mostra o valor a pagar no PIX.
      card.classList.add("lic-plano--clicavel");
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-pressed", "false");
      card.addEventListener("click", function () { _selecionarPlano(ov, o, it); });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          _selecionarPlano(ov, o, it);
        }
      });
    }

    const passo1 = ov.querySelector("#licPasso1");
    if (passo1) passo1.textContent = "Escolha um dos quatro planos acima (clique no plano para ver o valor a pagar).";

    const aviso = _avisoDoOrcamento(o);
    const elAviso = ov.querySelector("#licOrcAviso");
    if (aviso && elAviso) {
      elAviso.className = "lic-orc lic-orc--" + aviso.tipo;
      elAviso.innerHTML = aviso.html;
      elAviso.hidden = false;
    }

    // Plano já marcado: o pedido, o escolhido no teste ou o único upgrade.
    let ini = planoInicial && itens[planoInicial] ? planoInicial : "";
    if (!ini && o.planoEscolhido && itens[o.planoEscolhido]) ini = o.planoEscolhido;
    if (!ini && o.origem && o.origem.ativa && (o.upgrades || []).length === 1 && itens[o.upgrades[0]]) {
      ini = o.upgrades[0];
    }
    if (ini) _selecionarPlano(ov, o, itens[ini]);
  }

  function _copiarTexto(txt) {
    // Usa a ponte do app quando existe (Electron); senão, a área de transferência do navegador.
    try {
      if (window.licencaAPI && typeof window.licencaAPI.copiar === "function") {
        window.licencaAPI.copiar(txt);
        return;
      }
    } catch (e) {}
    try {
      navigator.clipboard && navigator.clipboard.writeText(txt);
    } catch (e) {}
  }

  async function _abrirFormulario() {
    // O preenchimento automático da chave depende de licencaAPI.chaveAtual,
    // que hoje NÃO existe no preload nem no main. Sem ela o formulário abre
    // normalmente, só sem o campo preenchido — o cliente digita à mão.
    var chave = "";
    try {
      if (
        window.licencaAPI &&
        typeof window.licencaAPI.chaveAtual === "function"
      ) {
        chave = (await window.licencaAPI.chaveAtual()) || "";
      }
    } catch (e) {
      chave = "";
    }

    var url = LIC_FORM_URL;
    if (chave) {
      url += "&" + LIC_FORM_ENTRY + "=" + encodeURIComponent(chave);
    }
    // Abre no navegador padrão (no Electron, shell.openExternal via <a> target=_blank
    // é interceptado; usar window.open cobre os dois ambientes).
    try {
      window.open(url, "_blank");
    } catch (e) {
      window.location.href = url;
    }
  }

  async function _ativarNovaChave() {
    var inp = document.getElementById("licChaveInput");
    var msg = document.getElementById("licAtivarMsg");
    var btn = document.getElementById("licAtivarBtn");
    if (!inp || !msg) return;

    var chave = (inp.value || "").trim();
    msg.className = "lic-ativar__msg";
    inp.classList.remove("lic-ativar__campo--erro");
    if (!chave) {
      msg.className = "lic-ativar__msg lic-ativar__msg--erro";
      msg.textContent = "Cole a chave de ativação primeiro.";
      // Campo obrigatório em vermelho, até a pessoa colar a chave.
      inp.classList.add("lic-ativar__campo--erro");
      inp.addEventListener("input", function limpar() {
        inp.classList.remove("lic-ativar__campo--erro");
        inp.removeEventListener("input", limpar);
      });
      try { inp.focus(); } catch (e) {}
      return;
    }
    if (!_podeAtivarAqui()) {
      // Em vez de deixar o cliente num beco sem saída, leva à tela que ativa.
      msg.className = "lic-ativar__msg";
      msg.textContent = "Abrindo a tela de ativação…";
      setTimeout(function () {
        window.location.href = "ativacao.html";
      }, 700);
      return;
    }

    btn.disabled = true;
    var orig = btn.textContent;
    btn.textContent = "Validando…";
    try {
      var r = await window.licencaAPI.ativar(chave);
      if (r && r.ok) {
        msg.className = "lic-ativar__msg lic-ativar__msg--ok";
        msg.textContent = "Chave válida! Desbloqueando o sistema…";
        // Nova chave de teste sobre uma licença paga: a paga ficou guardada.
        var guardada = r.pagaGuardada && r.pagaGuardada.rotuloPlano ? r.pagaGuardada : null;
        if (guardada) {
          msg.textContent =
            "Chave de teste válida! Sua licença paga (" + guardada.rotuloPlano +
            ") fica guardada e volta a valer quando o teste terminar. Desbloqueando o sistema…";
        }
        // Recarrega a tela certa (desbloqueada), sem reinstalar nem perder dados.
        setTimeout(function () {
          if (
            window.licencaAPI &&
            typeof window.licencaAPI.continuar === "function"
          ) {
            window.licencaAPI.continuar();
          } else {
            window.location.reload();
          }
        }, guardada ? 2600 : 900);
      } else {
        btn.disabled = false;
        btn.textContent = orig;
        msg.className = "lic-ativar__msg lic-ativar__msg--erro";
        msg.textContent =
          r && r.motivo ? r.motivo : "Chave inválida para este computador.";
      }
    } catch (e) {
      btn.disabled = false;
      btn.textContent = orig;
      msg.className = "lic-ativar__msg lic-ativar__msg--erro";
      msg.textContent = "Falha ao validar a chave. Tente novamente.";
    }
  }

  // ── Módulos fora do plano (dashboard) ──────────────────────────────
  // Licença ATIVA que não inclui os módulos Plus: no menu do dashboard, o
  // botão de cada um deles fica mais apagado, na cor de destaque, com a
  // etiqueta "Plus". O clique continua valendo: a tela do módulo explica a
  // situação e oferece o upgrade (como sempre fez).
  function _sinalizarModulosForaDoPlano(st) {
    const itens = document.querySelectorAll("[data-modid]");
    // Com a licença ativa, nada mais desta tela injeta os estilos — sem
    // eles, o módulo fora do plano ficaria igual aos outros.
    _injetarEstilo();
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      const id = ((item.dataset && item.dataset.modid) || "").toLowerCase();
      const arquivo = id + ".html";
      const modulo = TELAS_LICENCIADAS[arquivo];
      if (!modulo || _acessoAoModulo(st, modulo) !== "bloqueado") continue;
      item.classList.add("lic-fora-plano");
      const btn = item.querySelector(".sidebar-item-btn") || item;
      btn.title = _nomeDaTela(arquivo, modulo) + " — faz parte dos módulos Plus, nos planos " +
        _juntar(PLANOS_DO_MODULO[modulo] || [], "e") + ". Não está no seu plano.";
      // Um "+" (de Plus) no canto do ícone: não tira espaço do nome e
      // continua à vista com o menu recolhido. A explicação está na dica.
      if (!btn.querySelector(".lic-plano-tag")) {
        const tag = document.createElement("span");
        tag.className = "lic-plano-tag";
        tag.setAttribute("aria-hidden", "true");
        tag.textContent = "+";
        (btn.querySelector(".sidebar-btn-icon") || btn).appendChild(tag);
      }
    }
  }

  // ── "Alterar minha chave" (Central de Ajuda) ───────────────────────
  // Mostra o plano da chave instalada e o que dá para fazer a partir dele:
  // renovar, subir de plano ou inserir uma chave nova.
  const PLANOS = [
    { id: "anual", nome: "Licença Anual", desc: "365 dias · sem os módulos Plus" },
    { id: "vitalicia", nome: "Licença Vitalícia", desc: "Uso permanente · sem os módulos Plus" },
    { id: "pro", nome: "Pro", desc: "Anual · com os módulos Plus" },
    { id: "platinum", nome: "Platinum", desc: "Vitalícia · com os módulos Plus" },
  ];
  // De cada plano, para quais vale a pena subir.
  const UPGRADES = {
    teste: ["anual", "vitalicia", "pro", "platinum"],
    anual: ["vitalicia", "pro", "platinum"],
    pro: ["platinum"],
    vitalicia: ["platinum"],
    platinum: [],
  };
  const ICO_TROFEU =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"></path><path d="M17 5h3v2a3 3 0 0 1-3 3"></path><path d="M7 5H4v2a3 3 0 0 0 3 3"></path></svg>';

  /** O plano da chave: anual, vitalicia, pro, platinum, teste — ou null. */
  function _planoDaChave(st) {
    if (!st || st.estado === "sem-licenca" || (!st.ativa && !st.expirada)) return null;
    let tipo = Number(st.tipo);
    // Sem o tipo (não deveria acontecer): a vitalícia é a que não expira.
    if (st.tipo == null || !isFinite(tipo)) tipo = Number(st.expira) ? TIPO_ANUAL : TIPO_VITALICIA;
    const comModulos = !!(st.modulos && st.modulos.calculosPlanilhas === true);
    if (tipo === TIPO_TESTE) return "teste";
    if (tipo === TIPO_VITALICIA) return comModulos ? "platinum" : "vitalicia";
    return comModulos ? "pro" : "anual";
  }

  function _nomePlano(id) {
    if (id === "teste") return "Teste de 7 dias";
    const p = PLANOS.find(function (x) { return x.id === id; });
    return p ? p.nome : "";
  }

  /** A mensagem de cada situação: título, texto (HTML montado aqui) e se há upgrade. */
  function _mensagemDoPlano(plano, st) {
    const vence = st && Number(st.expira) ? _dataBR(st.expira) : "";
    const dias = st && typeof st.diasRestantes === "number" && isFinite(st.diasRestantes) ? st.diasRestantes : null;
    const prazo = vence
      ? " Vence em <strong>" + _esc(vence) + "</strong>" + (dias != null && dias >= 0 ? " (" + dias + (dias === 1 ? " dia" : " dias") + ")" : "") + "."
      : "";
    if (st && st.expirada) {
      return {
        titulo: "Sua licença venceu",
        texto: "O seu plano era <strong>" + _esc(_nomePlano(plano)) + "</strong>. Renove o mesmo plano ou aproveite para " +
          "escolher outro — <strong>seus dados continuam salvos</strong> e o sistema volta na hora em que a chave nova for inserida.",
      };
    }
    switch (plano) {
      case "platinum":
        return {
          // Sem "todos os módulos" nem "nada acima dele": um módulo novo pode
          // ser vendido à parte (Termos de Uso, Cláusula 7).
          titulo: "Parabéns! Você tem o plano mais completo",
          texto: "Seu plano é o <strong>Platinum</strong>: vitalício e com os módulos Plus disponíveis hoje — " +
            "Processador de Planilha, Informações de Venda, Gerador de EAN e Gestor de Devoluções. É o plano mais completo atualmente: " +
            "é só aproveitar.",
          max: true,
        };
      case "pro":
        return {
          titulo: "Seu plano: Pro",
          texto: "Anual, com os módulos Plus." + prazo + " Para não precisar renovar todo ano, faça o upgrade para o " +
            "<strong>Platinum</strong> — vitalício, com os mesmos módulos.",
        };
      case "vitalicia":
        return {
          titulo: "Seu plano: Licença Vitalícia",
          texto: "Uso permanente do sistema, sem os módulos Plus. Para ter o Processador de Planilha, as " +
            "Informações de Venda, o Gerador de EAN e o Gestor de Devoluções, faça o upgrade para o <strong>Platinum</strong>.",
        };
      case "anual":
        return {
          titulo: "Seu plano: Licença Anual",
          texto: "Uso do sistema por 365 dias, sem os módulos Plus." + prazo + " Faça o upgrade para o <strong>Pro</strong> " +
            "(anual, com os módulos Plus), para a <strong>Licença Vitalícia</strong> (sem renovar) ou para o " +
            "<strong>Platinum</strong>, o mais completo.",
        };
      case "teste": {
        // Nova chave de teste: traz o plano que o cliente pretende comprar
        // e, se havia uma licença paga, ela ficou guardada.
        const escolhido = st && st.planoEscolhido ? _nomePlano(st.planoEscolhido) : "";
        const guardada = st && st.pagaGuardada && st.pagaGuardada.rotuloPlano ? st.pagaGuardada.rotuloPlano : "";
        return {
          titulo: "Você está no período de teste",
          texto: "A chave de teste libera o sistema completo por 7 dias." + prazo +
            (escolhido
              ? " Plano escolhido: <strong>" + _esc(escolhido) + "</strong>. O teste não é pagamento: para continuar " +
                "com ele depois do teste, é preciso comprá-lo."
              : " Escolha um plano para continuar usando depois do teste.") +
            (guardada
              ? " Sua licença paga (<strong>" + _esc(guardada) + "</strong>) está guardada e volta a valer quando o teste terminar."
              : ""),
        };
      }
      default:
        return {
          titulo: "Nenhuma licença ativa",
          texto: "Não foi possível ler a licença deste computador. Se você já tem uma chave, insira-a abaixo.",
        };
    }
  }

  function _fecharTroca() {
    const ov = document.getElementById("licTrocaOverlay");
    if (ov) ov.remove();
    document.removeEventListener("keydown", _teclaTroca, true);
  }
  function _teclaTroca(e) {
    if (e.key === "Escape" && document.getElementById("licTrocaOverlay") && !document.getElementById("licModalOverlay")) {
      e.preventDefault();
      _fecharTroca();
    }
  }

  /** O crédito da licença atual no upgrade, numa frase (ou ""). */
  function _fraseDeCredito(orc) {
    if (!orc || !orc.origem || !(orc.upgrades || []).length) return "";
    const o = orc.origem;
    if (!o.ativa) return " Licença vencida não gera crédito: os valores são os de tabela.";
    if (o.valorPago === null || o.valorPago === undefined) {
      return " Esta chave não traz o valor pago: fale com o suporte para calcular o crédito do upgrade antes de pagar.";
    }
    return " Num upgrade, o valor que você pagou pela licença " + (o.guardada ? "guardada" : "atual") +
      " (<strong>" + _esc(_reais(o.valorPago)) + "</strong>) é descontado do preço do novo plano.";
  }

  async function alterarChave() {
    if (document.getElementById("licTrocaOverlay")) return;
    _injetarEstilo();
    let st = null;
    if (window.licencaAPI && typeof window.licencaAPI.status === "function") {
      try { st = await window.licencaAPI.status(); } catch (e) { st = null; }
    }
    // Orçamento do upgrade (preço, crédito e valor), do processo principal.
    let orc = null;
    if (window.licencaAPI && typeof window.licencaAPI.orcamento === "function") {
      try { orc = await window.licencaAPI.orcamento(); } catch (e) { orc = null; }
      if (!orc || !orc.ok || !Array.isArray(orc.itens)) orc = null;
    }
    // Dois cliques rápidos não abrem a janela duas vezes.
    if (document.getElementById("licTrocaOverlay")) return;
    const itens = {};
    if (orc) orc.itens.forEach(function (it) { if (it && it.ok && it.alvo) itens[it.alvo] = it; });

    const plano = _planoDaChave(st);
    // Durante a nova chave de teste, a licença paga guardada é a base da
    // escada: o upgrade parte dela (e o crédito também).
    const guardada = plano === "teste" && st && st.pagaGuardada && st.pagaGuardada.plano ? st.pagaGuardada : null;
    const base = guardada ? guardada.plano : plano;
    const escolhido = plano === "teste" && st && st.planoEscolhido ? st.planoEscolhido : "";
    const msg = _mensagemDoPlano(plano, st);
    msg.texto += _fraseDeCredito(orc);
    const upgrades = (st && st.expirada) ? PLANOS.map(function (p) { return p.id; }) : (UPGRADES[base] || PLANOS.map(function (p) { return p.id; }));
    const temUpgrade = upgrades.length > 0;

    const escada = PLANOS.map(function (p) {
      const atual = p.id === base;
      const up = !atual && upgrades.indexOf(p.id) >= 0;
      const ehEscolhido = !atual && p.id === escolhido;
      let tag = atual
        ? (guardada ? "Sua licença" : "Seu plano")
        : (up ? ((st && st.expirada) || base === "teste" || !base ? "Disponível" : "Upgrade") : "");
      if (ehEscolhido) tag = "Escolhido no teste";
      // O valor de cada plano disponível: com o crédito já descontado no
      // upgrade, ou o preço de tabela.
      const it = itens[p.id];
      let valor = "";
      if (it && up) {
        valor = it.upgrade && it.creditoCentavos > 0
          ? "Por <strong>" + _esc(_reais(it.valorCentavos)) + "</strong><s>" + _esc(_reais(it.precoCentavos)) + "</s>"
          : "<strong>" + _esc(_reais(it.precoCentavos)) + "</strong>";
      }
      const clicavel = up && !!it;
      return '<div class="lic-degrau' + (atual ? " lic-degrau--atual" : "") + (up ? " lic-degrau--upgrade" : "") +
        (ehEscolhido ? " lic-degrau--escolhido" : "") + (clicavel ? " lic-degrau--clicavel" : "") + '"' +
        (clicavel ? ' data-plano="' + _esc(p.id) + '" role="button" tabindex="0" title="Ver o valor a pagar e como pagar"' : "") + ">" +
        (tag ? '<span class="lic-degrau__tag">' + _esc(tag) + "</span>" : "") +
        '<div class="lic-degrau__nome">' + _esc(p.nome) + "</div>" +
        '<div class="lic-degrau__desc">' + _esc(p.desc) + "</div>" +
        (valor ? '<div class="lic-degrau__valor">' + valor + "</div>" : "") +
      "</div>";
    }).join("");

    const ov = document.createElement("div");
    ov.className = "lic-modal-overlay";
    ov.id = "licTrocaOverlay";
    ov.innerHTML =
      '<div class="lic-modal lic-troca' + (msg.max ? " lic-troca--max" : "") + '" role="dialog" aria-modal="true" aria-labelledby="licTrocaTitulo">' +
        '<div class="lic-modal__head">' +
          '<span class="lic-modal__ico lic-modal__ico--chave">' + (msg.max ? ICO_TROFEU : ICO_CHAVE) + "</span>" +
          "<div>" +
            '<h2 class="lic-modal__titulo" id="licTrocaTitulo">' + _esc(msg.titulo) + "</h2>" +
            '<p class="lic-modal__sub">Alterar minha chave' + (plano && plano !== "teste" ? " · plano atual: " + _esc(_nomePlano(plano)) : "") +
              (guardada ? " · licença guardada: " + _esc(_nomePlano(guardada.plano)) : "") + "</p>" +
          "</div>" +
          '<button class="lic-modal__fechar" id="licTrocaX" title="Fechar">✕</button>' +
        "</div>" +
        '<div class="lic-escada">' + escada + "</div>" +
        '<p class="lic-troca__msg">' + msg.texto + "</p>" +
        '<div class="lic-acoes lic-troca__acoes">' +
          (temUpgrade
            ? '<button class="lic-btn lic-btn--secundario" id="licTrocaInserir">Inserir nova chave</button>' +
              '<button class="lic-btn lic-btn--primario" id="licTrocaPlanos">' + ((st && st.expirada) ? "Renovar ou mudar de plano" : "Ver planos e fazer upgrade") + "</button>"
            : '<button class="lic-btn lic-btn--secundario" id="licTrocaInserir">Inserir outra chave</button>' +
              '<button class="lic-btn lic-btn--primario" id="licTrocaOk">Fechar</button>') +
        "</div>" +
      "</div>";
    document.body.appendChild(ov);

    ov.addEventListener("click", function (e) { if (e.target === ov) _fecharTroca(); });
    document.addEventListener("keydown", _teclaTroca, true);
    document.getElementById("licTrocaX").addEventListener("click", _fecharTroca);
    const bOk = document.getElementById("licTrocaOk");
    if (bOk) bOk.addEventListener("click", _fecharTroca);
    const bPlanos = document.getElementById("licTrocaPlanos");
    if (bPlanos) bPlanos.addEventListener("click", function () { _fecharTroca(); _abrirModalRenovacao(); });
    document.getElementById("licTrocaInserir").addEventListener("click", function () {
      _fecharTroca();
      _abrirModalRenovacao({ ativar: true });
    });
    // Clicar num plano disponível abre o modal de compra com ele escolhido:
    // o valor a pagar já aparece junto do PIX.
    const degraus = ov.querySelectorAll(".lic-degrau--clicavel[data-plano]");
    for (let i = 0; i < degraus.length; i++) {
      const id = degraus[i].getAttribute("data-plano");
      const abrir = function () { _fecharTroca(); _abrirModalRenovacao({ plano: id }); };
      degraus[i].addEventListener("click", abrir);
      degraus[i].addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); }
      });
    }
    setTimeout(function () {
      const alvo = document.getElementById("licTrocaPlanos") || document.getElementById("licTrocaOk");
      try { if (alvo) alvo.focus(); } catch (e) {}
    }, 60);
  }

  // ── Aplicação do bloqueio ──────────────────────────────────────────
  function _aplicarBloqueio(st) {
    _injetarEstilo();
    const arquivo = _arquivoAtual();

    // Numa tela paga: cobre tudo e explica.
    if (TELAS_LIVRES.indexOf(arquivo) < 0) {
      _bloquearTelaInteira();
      return;
    }

    // No dashboard: sinaliza os módulos e explica o que continua disponível.
    const rotulo = st.rotuloTipo ? " (" + _esc(st.rotuloTipo) + ")" : "";
    _mostrarFaixa(
      "bloqueio",
      '<span class="lic-faixa__ico" style="color:#ef4444;">' +
        ICO_ALERTA +
        "</span>" +
        '<span class="lic-faixa__txt">' +
        "<strong>Licença vencida" +
        rotulo +
        ".</strong> " +
        "É necessário adquirir uma nova chave para continuar usando o sistema. " +
        "<strong>Seus dados continuam salvos</strong> — ao inserir uma nova chave, o sistema é desbloqueado na hora." +
        "</span>" +
        '<button class="lic-faixa__btn" id="licBtnRenovar" style="border-color:var(--clr-primary,#4c8df6);color:var(--clr-primary,#4c8df6);">Renovar licença</button>' +
        '<button class="lic-faixa__btn" id="licBtnAjuda">Exportar backup</button>',
    );
    const bR = document.getElementById("licBtnRenovar");
    if (bR) bR.addEventListener("click", _abrirModalRenovacao);
    const b = document.getElementById("licBtnAjuda");
    if (b)
      b.addEventListener("click", function () {
        window.location.href = "ajuda.html";
      });

    if (arquivo === "index.html") _bloquearModulos();

    // Abre o modal automaticamente na tela inicial, uma vez por sessão, para
    // o cliente ver o caminho de renovação assim que entra.
    if (arquivo === "index.html" || arquivo === "shell.html") {
      try {
        if (!sessionStorage.getItem("licModalMostrado")) {
          sessionStorage.setItem("licModalMostrado", "1");
          setTimeout(_abrirModalRenovacao, 600);
        }
      } catch (e) {}
    }
  }

  // ── Início ─────────────────────────────────────────────────────────
  async function iniciar() {
    // Fora do .exe (Live Server) não existe licencaAPI: não bloqueia nada,
    // senão o desenvolvimento ficaria travado.
    //
    // O aviso no console é proposital: DENTRO do .exe, licencaAPI ausente
    // significa preload desatualizado — e sem esse aviso o sistema fica sem
    // nenhum bloqueio de forma silenciosa, que foi exatamente o que ocorreu.
    if (!window.licencaAPI || typeof window.licencaAPI.status !== "function") {
      console.warn(
        "[Licenca] licencaAPI indisponivel nesta tela - nenhum bloqueio sera aplicado. " +
          "Fora do .exe isto e esperado. DENTRO do .exe, indica preload.js desatualizado.",
      );
      return;
    }

    let st = null;
    try {
      st = await window.licencaAPI.status();
    } catch (e) {
      console.warn(
        "[Licenca] falha ao consultar o status - nada sera bloqueado:",
        e && e.message,
      );
      return; // falha ao consultar não pode virar bloqueio indevido
    }
    if (!st) {
      console.warn(
        "[Licenca] status retornou vazio - nada sera bloqueado. " +
          "Verifique o handler licenca:status no main.js.",
      );
      return;
    }

    if (st.expirada) {
      _aplicarBloqueio(st);
      return;
    }

    if (st.ativa) {
      // A regra de MÓDULO vem antes do aviso de prazo: se a tela está
      // bloqueada por não estar na licença, avisar "faltam 7 dias" em
      // cima disso só confunde.
      const bloqueou = _aplicarRegraDeModulo(st);
      if (bloqueou) return;
      // No dashboard, os módulos que a chave não inclui ficam apagados.
      if (_arquivoAtual() === "index.html") _sinalizarModulosForaDoPlano(st);
      _avisarSeVencendo(st);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }

  // Exposto para as telas que queiram consultar o mesmo estado.
  window.LicencaGuarda = {
    iniciar: iniciar,
    TELAS_LIVRES: TELAS_LIVRES,
    MODULOS_LIVRES: MODULOS_LIVRES,
    TELAS_LICENCIADAS: TELAS_LICENCIADAS,
    // Exposto para testes e para telas que queiram consultar o mesmo
    // critério — sem duplicar a regra em outro lugar.
    acessoAoModulo: _acessoAoModulo,
    // "Alterar minha chave" (Central de Ajuda): o plano atual e o upgrade.
    alterarChave: alterarChave,
    planoDaChave: _planoDaChave,
    // O modal de planos e da chave nova ({ ativar: true } já abre no campo).
    abrirPlanos: function (op) { _abrirModalRenovacao(op && op.ativar ? { ativar: true } : undefined); },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — senhas.js
   Senhas de acesso dos módulos protegidos (Administrador e Colaborador)

   ── O QUE ESTE ARQUIVO FAZ ─────────────────────────────────────────
   · Guarda as duas senhas em "precifiq_senhas":
       admin        → só o HASH (SHA-256), como o Financeiro já fazia;
       colaborador  → o texto, porque o Administrador precisa VER a senha
                      para passá-la adiante (ela pode ser gerada sozinha
                      a cada abertura do app);
       gerarAoAbrir → gera uma senha nova de colaborador a cada abertura;
       modulos      → quais módulos pedem senha ({ id: true/false }).
                      Sem escolha salva, valem os padrões de MODULOS:
                      Controle Financeiro, Processador de Planilhas e
                      Ações em Massa bloqueados (como já era).
   · Tela de acesso dos módulos bloqueados. Uma senha só no campo: o
     sistema descobre sozinho se é a do Administrador ou a do
     Colaborador, e libera assim que ela confere.
   · Senhas de acesso (tela "Usuários e Senhas", que se abre por Dados da
     Empresa): as duas senhas e a lista de módulos, cada um com o seu
     switch. Só abre com a senha do Administrador — o colaborador não vê
     nem troca as senhas. A mesma parte ainda abre em janela (modal) pelo
     Configurar Campos do Controle Financeiro.
   · Usuários (BapellUsuarios, "precifiq_usuarios"): nome e, se quiser,
     senha. São as pessoas que aparecem no campo "Responsável" do Registro
     de Vendas, do Controle Financeiro, das Notas Fiscais, das Ações em
     Massa e do Processador de Planilhas. Quem tem senha só é aceito como
     responsável digitando a própria senha. A senha de um usuário NÃO abre
     os módulos protegidos — isso continua sendo das duas senhas acima.
   · O Master (id fixo "usr_master"): o administrador principal, como
     usuário. É o primeiro da lista de Usuários e do campo Responsável, com
     o nome que se quiser (padrão "Administrador"). Trocar o nome não muda
     a identidade, a senha (a do Administrador) nem os poderes; ele não
     pode ser excluído e nenhum usuário pode ter o mesmo nome. Na janela
     "Usuário e senha" dos botões, é ele quem aparece no lugar de
     "Administrador".
   · Todas as senhas (Administrador, Colaborador e usuários) pedem só um
     mínimo de 4 caracteres.
   · A senha do Administrador também fica guardada embaralhada (admin.
     texto), para o "Mostrar" e o "Copiar" da linha "Senha atual" — como a
     do Colaborador. A conferência continua sendo pelo hash.
   · Perguntas de segurança (recuperacao): cinco perguntas; no cadastro da
     senha do Administrador, pelo menos 3 respondidas. Esqueceu a senha?
     "Esqueci a senha do Administrador" (na tela de acesso) pede uma das
     perguntas e, com a resposta certa, uma senha nova. Tudo no próprio
     computador — sem internet. A resposta é guardada só como hash, num
     formato padrão (sem acento, sem maiúsculas, sem pontuação).
   · Senha nos botões ("precifiq_senha_botoes"): na tela Usuários e
     Senhas, o Administrador escolhe — tela a tela — os botões que pedem
     usuário e senha antes de agir (o Salvar dos Produtos, o Excluir de um
     lançamento...). Quem clica escolhe o próprio nome (os usuários com
     senha) ou o Master (pelo nome dele) e digita a senha. Vale com a senha do
     Administrador criada; as telas da lista carregam este arquivo.

   ── A SENHA QUE JÁ EXISTIA ─────────────────────────────────────────
   Antes, só o Controle Financeiro tinha senha (em precifiq_dre →
   seguranca.hash). Na primeira leitura, ela vira a senha do
   Administrador — mesmo hash, então quem já tinha continua entrando com
   a mesma senha.
   Dali em diante, o hash do Administrador — e a escolha dos módulos
   bloqueados — continuam ESPELHADOS nesse mesmo lugar: é o precifiq_dre
   que vai no backup, então um backup restaurado num computador sem senha
   traz a senha e os bloqueios atuais (e não uns antigos). Num computador que já tem senha, vale a dele — a cópia é que
   se ajusta. "Remover proteção" anota qual senha saiu (removida), para
   uma cópia velha dela não trazer a proteção de volta. E, se um dia este
   arquivo faltar, o Financeiro segue protegido pela senha certa. A senha
   do Colaborador fica só aqui: no outro computador, basta criar ou gerar
   outra.

   ── COMO UMA TELA PEDE PROTEÇÃO ─────────────────────────────────────
       <script src="JS/senhas.js" data-modulo="financeiro"></script>
   no <head> (o id é um dos de MODULOS). Com a senha do Administrador
   definida e o módulo bloqueado, o conteúdo (.app-layout) some antes de
   ser pintado e a tela de acesso aparece; senão, nada acontece.
   A tela pode esperar a liberação com BapellSenhas.aguardarAcesso().
       <script src="JS/senhas.js" data-admin="1"></script>
   é a tela que só o Administrador abre (Usuários e Senhas): com a senha
   do Administrador criada, só ela libera — a do Colaborador não.
   (O data-proteger="…" da versão anterior continua valendo: o módulo é
   achado pelo nome do arquivo da tela.)
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";
  if (window.BapellSenhas) return;

  var CHAVE = "precifiq_senhas";
  var CHAVE_DRE = "precifiq_dre";
  // sessionStorage do shell: some quando o app fecha e sobrevive a um
  // recarregamento. É o que distingue "o app abriu agora" de "a tela
  // recarregou" — o mesmo recurso que o licenca-ui.js usa para mostrar
  // avisos uma vez por sessão do aplicativo.
  var SESSAO = "precifiq_senhas_abertura";
  // Sem 0/O, 1/I/L: a senha é lida em voz alta ou copiada à mão.
  var ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var TAM_GERADA = 8;
  // Todas as senhas — Administrador, Colaborador e usuários — pedem só
  // este mínimo de caracteres, sem exigir maiúscula, número ou símbolo.
  var MIN_SENHA = 4;
  var MIN_COLABORADOR = MIN_SENHA;

  // Módulos que podem pedir senha, na ordem da lista do "Redefinir
  // Senhas". padrao: bloqueado enquanto ninguém escolheu — os três que já
  // pediam senha continuam pedindo. Ficam de fora o Painel inicial (é para
  // onde a tela de senha manda de volta), a Ajuda, a Central de Cálculos
  // (sem dados guardados) e Plataformas/Produtos (a senha seria pedida a
  // cada produto aberto).
  var MODULOS = [
    { id: "financeiro", nome: "Controle Financeiro", tela: "o Controle Financeiro",
      pagina: "financeiro.html", desc: "DRE, lançamentos e indicadores.", padrao: true },
    { id: "processador", nome: "Processador de Planilhas", tela: "o Processador de Planilhas",
      pagina: "vendas-import.html", desc: "Planilhas de vendas das plataformas.", padrao: true },
    { id: "acoes-massa", nome: "Ações em Massa", tela: "as Ações em Massa",
      pagina: "acoes-massa.html", desc: "Custo, taxas e margem de vários produtos.", padrao: true },
    { id: "registro-vendas", nome: "Registro de Vendas", tela: "o Registro de Vendas",
      pagina: "registro-vendas.html", desc: "Clientes, pedidos e histórico de vendas.", padrao: false },
    { id: "nf", nome: "Notas Fiscais", tela: "as Notas Fiscais",
      pagina: "nf.html", desc: "As notas guardadas de cada empresa.", padrao: false },
    { id: "empresa", nome: "Dados da Empresa", tela: "os Dados da Empresa",
      pagina: "empresa.html", desc: "Cadastro, impostos, sócios e documentos.", padrao: false },
    { id: "vendas", nome: "Informações de Venda", tela: "as Informações de Venda",
      pagina: "vendas.html", desc: "Parcelamento, descontos e logística.", padrao: false },
    { id: "ean", nome: "Gerador de EAN", tela: "o Gerador de EAN",
      pagina: "ean.html", desc: "Códigos de barras por empresa e SKU.", padrao: false },
    { id: "lembretes", nome: "Lembretes", tela: "os Lembretes",
      pagina: "lembretes.html", desc: "Avisos com data e hora.", padrao: false },
    { id: "devolucoes", nome: "Gestor de Devoluções", tela: "o Gestor de Devoluções",
      pagina: "devolucoes.html", desc: "Devoluções, reembolsos e prejuízo.", padrao: false },
  ];

  // ── Perguntas de segurança (recuperar a senha do Administrador) ──
  // Os ids ficam gravados: não mudam. O texto pode ser ajustado.
  var PERGUNTAS = [
    { id: "pet", texto: "Qual o nome do seu primeiro animal de estimação?" },
    { id: "apelido", texto: "Qual era o seu apelido de infância?" },
    { id: "escola", texto: "Qual o nome da sua primeira escola?" },
    { id: "amigo", texto: "Qual o nome do seu melhor amigo de infância?" },
    { id: "carro", texto: "Qual o modelo do seu primeiro carro?" },
  ];
  var MIN_PERGUNTAS = 3; // respondidas, no mínimo, junto da senha do Administrador
  var MIN_RESPOSTA = 2; // caracteres da resposta já no formato padrão
  // Erros na recuperação ficam guardados (recarregar a tela não zera): do
  // 3º erro em diante, espera 1 minuto, depois 2, 4, 8... até 30.
  var CHAVE_RECUP = "precifiq_senhas_recup";
  // Embaralha a senha do Administrador guardada para o "Mostrar"/"Copiar".
  // Não é criptografia (e não tem relação com a licença): só evita que a
  // senha fique escrita como texto no armazenamento.
  var EMBARALHO = "BapellGestorPro::senha-adm";

  var ICO_CADEADO =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
  var ICO_CHAVE =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5"></circle><path d="M10.7 12.3 21 2"></path><path d="m16 7 3 3"></path><path d="m19 4 2 2"></path></svg>';
  var ICO_X =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>';
  // Cadeado fechado / aberto da lista de módulos.
  var ICO_CADEADO_MINI =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
  var ICO_ABERTO_MINI =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>';

  var script = document.currentScript;
  // O módulo desta tela (id de MODULOS) ou null se ela não pede senha.
  var moduloDaTela = _moduloDaTela(script);
  // Tela que só o Administrador abre (data-admin="1"): Usuários e Senhas.
  var telaSoAdmin = !!(script && script.getAttribute("data-admin") === "1");
  // A cópia no Financeiro falhou nesta tela (disco cheio): o conserto
  // automático em _ler() para de tentar — gravar é só quando alguém salva.
  var _espelhoFalhou = false;

  // ══════════════════════════════════════════
  //  ARMAZENAMENTO
  // ══════════════════════════════════════════
  // removida: o hash da senha do Administrador que foi REMOVIDA de
  // propósito ("Remover proteção"). A cópia antiga dela que ainda estiver
  // no precifiq_dre (gravação atrasada, disco cheio) não pode trazer a
  // proteção de volta sozinha.
  // modulos: null = ninguém escolheu ainda (valem os padrões de MODULOS).
  // recuperacao: as respostas das perguntas de segurança (hash + sal),
  // ou null. Ficam guardadas mesmo se a proteção for removida: são da
  // pessoa, e valem de novo quando a senha for criada outra vez.
  function _vazio() {
    return { versao: 1, admin: null, colaborador: null, gerarAoAbrir: false, modulos: null, removida: null, migrado: true, recuperacao: null };
  }

  function _normalizar(o) {
    var e = _vazio();
    if (o.admin && typeof o.admin.hash === "string" && o.admin.hash) {
      e.admin = { hash: o.admin.hash, definidaEm: o.admin.definidaEm || null, origem: o.admin.origem || "" };
      // A senha embaralhada só vale para o hash com que foi guardada.
      if (typeof o.admin.texto === "string" && o.admin.texto && o.admin.textoDe === o.admin.hash.slice(0, 16)) {
        e.admin.texto = o.admin.texto;
        e.admin.textoDe = o.admin.textoDe;
      }
    }
    e.recuperacao = _normalizarRecuperacao(o.recuperacao);
    if (e.admin && o.colaborador && typeof o.colaborador.senha === "string" && o.colaborador.senha) {
      e.colaborador = {
        senha: o.colaborador.senha,
        definidaEm: o.colaborador.definidaEm || null,
        origem: o.colaborador.origem === "auto" ? "auto" : "manual",
      };
    }
    e.gerarAoAbrir = !!(e.admin && o.gerarAoAbrir);
    // A escolha dos módulos fica guardada mesmo sem senha: se a proteção
    // for removida e ligada de novo, os mesmos módulos voltam a pedir.
    e.modulos = _normalizarModulos(o.modulos);
    e.removida = !e.admin && typeof o.removida === "string" && o.removida ? o.removida : null;
    return e;
  }

  // ══════════════════════════════════════════
  //  SENHA DO ADMINISTRADOR EMBARALHADA
  //  (para o "Mostrar" e o "Copiar" da linha "Senha atual")
  // ══════════════════════════════════════════
  function _embaralhar(texto) {
    try {
      var b = new TextEncoder().encode(String(texto));
      var k = new TextEncoder().encode(EMBARALHO);
      var s = "";
      for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i] ^ k[i % k.length]);
      return btoa(s);
    } catch (e) { return null; }
  }

  function _desembaralhar(cod) {
    try {
      var s = atob(String(cod));
      var k = new TextEncoder().encode(EMBARALHO);
      var b = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) ^ k[i % k.length];
      return new TextDecoder().decode(b);
    } catch (e) { return null; }
  }

  /** O registro da senha do Administrador (hash + a senha embaralhada). */
  function _novoAdmin(hash, senha, origem) {
    var a = { hash: hash, definidaEm: Date.now(), origem: origem || "manual" };
    var cod = senha ? _embaralhar(senha) : null;
    if (cod) {
      a.texto = cod;
      a.textoDe = String(hash).slice(0, 16);
    }
    return a;
  }

  /**
   * A senha atual do Administrador em texto, ou null quando não há como
   * mostrar: criada antes desta versão, herdada do Financeiro ou trazida
   * por um backup (que leva só o hash).
   */
  function _textoAdmin(estado) {
    var a = estado && estado.admin;
    if (!a || !a.texto || a.textoDe !== String(a.hash).slice(0, 16)) return null;
    return _desembaralhar(a.texto);
  }

  // ══════════════════════════════════════════
  //  PERGUNTAS DE SEGURANÇA
  // ══════════════════════════════════════════
  function _perguntaPorId(id) {
    for (var i = 0; i < PERGUNTAS.length; i++) if (PERGUNTAS[i].id === id) return PERGUNTAS[i];
    return null;
  }

  /**
   * O formato padrão de uma resposta: sem acentos, tudo minúsculo, sem
   * pontuação e com um espaço só entre as palavras. "São  Paulo!" e
   * "sao paulo" viram a mesma resposta.
   */
  function _normalizarResposta(t) {
    var s = String(t == null ? "" : t);
    try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function _hashResposta(sal, normalizada) {
    return _hash("resp:" + sal + ":" + normalizada);
  }

  /** Só perguntas conhecidas, cada uma com sal e hash. Nenhuma → null. */
  function _normalizarRecuperacao(r) {
    if (!r || typeof r !== "object" || !r.respostas || typeof r.respostas !== "object") return null;
    var respostas = {};
    var n = 0;
    PERGUNTAS.forEach(function (p) {
      var x = r.respostas[p.id];
      if (x && typeof x.sal === "string" && x.sal && typeof x.hash === "string" && x.hash) {
        respostas[p.id] = { sal: x.sal, hash: x.hash };
        n++;
      }
    });
    return n ? { respostas: respostas, definidaEm: r.definidaEm || null } : null;
  }

  /** Para comparar duas versões das respostas (a daqui e a cópia do backup). */
  function _assinaturaRec(r) {
    if (!r || !r.respostas) return "";
    return Object.keys(r.respostas).sort().map(function (k) { return k + ":" + r.respostas[k].hash; }).join("|");
  }

  /** Os ids das perguntas respondidas, na ordem da lista. */
  function _respondidas(estado) {
    var r = estado && estado.recuperacao;
    if (!r || !r.respostas) return [];
    return PERGUNTAS.filter(function (p) { return !!r.respostas[p.id]; }).map(function (p) { return p.id; });
  }

  /**
   * Respostas digitadas ({ id: texto }) → { id: {sal, hash} } das que têm
   * o mínimo de caracteres (as em branco ficam de fora). Nenhuma → null.
   */
  function _hashRespostas(mapa) {
    if (!mapa || typeof mapa !== "object") return Promise.resolve(null);
    var ids = PERGUNTAS.map(function (p) { return p.id; }).filter(function (id) {
      return _normalizarResposta(mapa[id]).length >= MIN_RESPOSTA;
    });
    if (!ids.length) return Promise.resolve(null);
    return Promise.all(ids.map(function (id) {
      var sal = _idAleatorio("", 16);
      return _hashResposta(sal, _normalizarResposta(mapa[id])).then(function (h) {
        return { id: id, sal: sal, hash: h };
      });
    })).then(function (lista) {
      var r = {};
      lista.forEach(function (x) { r[x.id] = { sal: x.sal, hash: x.hash }; });
      return r;
    });
  }

  /** As respostas guardadas com as novas por cima (as outras continuam). */
  function _juntarRespostas(atual, novas) {
    var respostas = {};
    if (atual && atual.respostas) Object.keys(atual.respostas).forEach(function (k) { respostas[k] = atual.respostas[k]; });
    Object.keys(novas || {}).forEach(function (k) { respostas[k] = novas[k]; });
    return { respostas: respostas, definidaEm: Date.now() };
  }

  /** Confere a resposta de uma pergunta (no formato padrão). */
  function verificarResposta(id, texto) {
    var e = _ler();
    var r = e.recuperacao && e.recuperacao.respostas && e.recuperacao.respostas[id];
    var norm = _normalizarResposta(texto);
    if (!r || !norm) return Promise.resolve(false);
    return _hashResposta(r.sal, norm).then(function (h) { return h === r.hash; });
  }

  // ── Erros na recuperação (guardados: recarregar não zera) ──
  function _lerTentativas() {
    try {
      var o = JSON.parse(localStorage.getItem(CHAVE_RECUP));
      if (o && typeof o === "object") return { erros: Math.max(0, o.erros | 0), ate: Number(o.ate) || 0 };
    } catch (e) {}
    return { erros: 0, ate: 0 };
  }

  function _errouRecuperacao() {
    var t = _lerTentativas();
    t.erros++;
    if (t.erros >= 3) t.ate = Date.now() + Math.min(30, Math.pow(2, t.erros - 3)) * 60000;
    try { localStorage.setItem(CHAVE_RECUP, JSON.stringify(t)); } catch (e) {}
    return t;
  }

  function _acertouRecuperacao() {
    try { localStorage.removeItem(CHAVE_RECUP); } catch (e) {}
  }

  /** Milissegundos de espera antes de poder tentar de novo (0 = pode). */
  function _esperaRecuperacao() {
    return Math.max(0, _lerTentativas().ate - Date.now());
  }

  // ══════════════════════════════════════════
  //  MÓDULOS
  // ══════════════════════════════════════════
  function _moduloPorId(id) {
    for (var i = 0; i < MODULOS.length; i++) if (MODULOS[i].id === id) return MODULOS[i];
    return null;
  }

  function _moduloDaTela(s) {
    if (!s) return null;
    var id = s.getAttribute("data-modulo");
    if (id) return _moduloPorId(id) ? id : null;
    if (!s.hasAttribute("data-proteger")) return null;
    var arquivo = "";
    try { arquivo = decodeURIComponent(location.pathname.split("/").pop() || "").toLowerCase(); } catch (e) {}
    for (var i = 0; i < MODULOS.length; i++) if (MODULOS[i].pagina === arquivo) return MODULOS[i].id;
    return null;
  }

  /** Só ids conhecidos, só true/false. Nada escolhido → null. */
  function _normalizarModulos(m) {
    if (!m || typeof m !== "object") return null;
    var r = {};
    var algum = false;
    MODULOS.forEach(function (mod) {
      if (typeof m[mod.id] === "boolean") { r[mod.id] = m[mod.id]; algum = true; }
    });
    return algum ? r : null;
  }

  /** O módulo está marcado para pedir senha (com ou sem senha criada). */
  function _bloqueado(estado, id) {
    var m = estado && estado.modulos;
    if (m && typeof m[id] === "boolean") return m[id];
    var mod = _moduloPorId(id);
    return !!(mod && mod.padrao);
  }

  /** A escolha completa, módulo a módulo, com os padrões preenchidos. */
  function _mapaModulos(estado) {
    var r = {};
    MODULOS.forEach(function (mod) { r[mod.id] = _bloqueado(estado, mod.id); });
    return r;
  }

  function _registrarFalha(contexto, err) {
    try {
      if (typeof PrecifiqErros !== "undefined") {
        PrecifiqErros.registrar("Senhas: " + contexto, err && err.stack ? err.stack : String(err));
        return;
      }
    } catch (e) {}
    console.error("[Senhas] " + contexto, err);
  }

  function _avisar(msg, tipo, ms) {
    if (typeof showToast === "function") showToast(msg, tipo || "default", ms || 3200);
  }

  /**
   * O campo com problema fica vermelho até a pessoa mexer nele (utils.js,
   * BapellCampos) e recebe o foco — sem focar quando semFoco (um segundo
   * campo marcado junto com o primeiro).
   */
  function _marcarCampo(el, msg, semFoco) {
    if (!el) return;
    try {
      if (window.BapellCampos) {
        window.BapellCampos.marcar(el, msg || null);
        if (!semFoco) window.BapellCampos.focar(el);
        return;
      }
    } catch (e) {}
    if (!semFoco) { try { el.focus(); } catch (e) {} }
  }

  /**
   * Estado atual. Na primeira vez, herda a senha do Controle Financeiro.
   *
   * Depois disso, a cópia no precifiq_dre só decide num caso: aqui não há
   * senha do Administrador e lá há uma que não foi removida de propósito.
   * Foi um backup restaurado que a trouxe (é por lá que ela viaja) — ela
   * passa a valer, como sempre valeu no Financeiro, junto com a escolha
   * dos módulos bloqueados que veio com ela. Nos outros casos quem se
   * ajusta é a cópia: a senha atual nunca volta a ser uma antiga, a
   * proteção nunca some sozinha e a que foi removida não volta sozinha.
   */
  function _ler() {
    var bruto = null;
    try { bruto = localStorage.getItem(CHAVE); } catch (e) { bruto = null; }
    var estado = null;
    if (bruto) {
      try {
        var obj = JSON.parse(bruto);
        if (obj && typeof obj === "object") estado = _normalizar(obj);
      } catch (err) {
        // Ilegível: NÃO sobrescreve (o conteúdo pode ser recuperado de um
        // backup). Segue com o que dá para herdar do Financeiro.
        _registrarFalha("precifiq_senhas ilegível", err);
        return _herdarDoFinanceiro();
      }
    }

    var fin = _lerFinanceiro();
    if (!estado) {
      estado = _herdarDoFinanceiro(fin);
      _gravar(estado, fin);
      return estado;
    }
    if (!estado.admin) {
      if (fin.hash && fin.hash !== estado.removida) {
        estado.admin = { hash: fin.hash, definidaEm: null, origem: "financeiro" };
        if (fin.modulos) estado.modulos = fin.modulos;
        // As perguntas de segurança viajam junto (backup restaurado).
        if (fin.recuperacao) estado.recuperacao = fin.recuperacao;
        estado.removida = null;
        _gravar(estado, fin);
      } else if (fin.hash && !_espelhoFalhou) {
        // Cópia velha da senha removida (a limpeza dela atrasou ou falhou).
        _espelharNoFinanceiro(estado, fin);
      }
    } else if (fin.dre && !_espelhoFalhou &&
               (fin.hash !== estado.admin.hash || !_mesmoMapa(fin.modulos, _mapaModulos(estado)) ||
                _assinaturaRec(fin.recuperacao) !== _assinaturaRec(estado.recuperacao))) {
      _espelharNoFinanceiro(estado, fin);
    }
    return estado;
  }

  /** Dois mapas de módulos iguais (null só é igual a null). */
  function _mesmoMapa(a, b) {
    if (!a || !b) return !a && !b;
    for (var i = 0; i < MODULOS.length; i++) {
      var id = MODULOS[i].id;
      if (!!a[id] !== !!b[id]) return false;
    }
    return true;
  }

  /**
   * O precifiq_dre, o hash e a escolha dos módulos guardados nele, sem
   * mudar nada. Só um objeto guarda a senha: o formato antigo em lista
   * não tem onde (e o Financeiro o converte sozinho ao abrir).
   */
  function _lerFinanceiro() {
    var r = { dre: null, hash: null, modulos: null, recuperacao: null };
    try {
      var bruto = localStorage.getItem(CHAVE_DRE);
      if (!bruto) return r;
      var dre = JSON.parse(bruto);
      if (!dre || typeof dre !== "object" || Array.isArray(dre)) return r;
      r.dre = dre;
      if (dre.seguranca && typeof dre.seguranca.hash === "string" && dre.seguranca.hash) {
        r.hash = dre.seguranca.hash;
        r.modulos = _normalizarModulos(dre.seguranca.modulos);
        r.recuperacao = _normalizarRecuperacao(dre.seguranca.recuperacao);
      }
    } catch (err) {}
    return r;
  }

  function _herdarDoFinanceiro(lido) {
    var e = _vazio();
    var fin = lido || _lerFinanceiro();
    if (fin.hash) {
      e.admin = { hash: fin.hash, definidaEm: null, origem: "financeiro" };
      e.modulos = fin.modulos;
      e.recuperacao = fin.recuperacao || null;
    }
    return e;
  }

  /**
   * O que vai para o precifiq_dre → seguranca: o hash do Administrador, a
   * escolha dos módulos (completa, com os padrões) e as respostas das
   * perguntas de segurança (só os hashes) — para um backup restaurado em
   * outro computador também poder recuperar a senha. Sem senha, nada.
   * (A senha embaralhada NÃO vai: o backup leva só o hash.)
   */
  function _copiaDoEstado(estado) {
    if (!estado || !estado.admin) return null;
    var c = { hash: estado.admin.hash, modulos: _mapaModulos(estado) };
    if (estado.recuperacao) c.recuperacao = estado.recuperacao;
    return c;
  }

  function _gravar(estado, lido) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch (err) {
      _registrarFalha("falha ao gravar", err);
      _avisar("Não foi possível salvar as senhas. Verifique o espaço em disco.", "error", 6000);
      return false;
    }
    // A cópia no Financeiro serve ao backup. Se ela falhar (disco cheio),
    // o que vale já está gravado acima — e uma cópia velha não volta a
    // valer sozinha (ver _ler e "removida").
    _espelharNoFinanceiro(estado, lido);
    return true;
  }

  /**
   * Cópia do hash do Administrador — e da escolha dos módulos — onde o
   * Financeiro guardava a senha dele (precifiq_dre → seguranca). Só mexe
   * nesse campo, só se o Financeiro já existir e só se algo mudou. Não
   * cria o precifiq_dre: um registro novo ali impediria o Financeiro de
   * converter dados de versões antigas ao abrir.
   * @returns {boolean} false se precisava gravar e não conseguiu
   */
  function _espelharNoFinanceiro(estado, lido) {
    var fin = lido || _lerFinanceiro();
    var copia = _copiaDoEstado(estado);
    var hash = copia ? copia.hash : null;
    var mapa = copia ? copia.modulos : null;
    var rec = copia ? copia.recuperacao || null : null;
    if (!fin.dre || (fin.hash === hash && (!hash || (_mesmoMapa(fin.modulos, mapa) &&
        _assinaturaRec(fin.recuperacao) === _assinaturaRec(rec))))) return true;
    fin.dre.seguranca = copia;
    try {
      localStorage.setItem(CHAVE_DRE, JSON.stringify(fin.dre));
      fin.hash = hash;
      fin.modulos = mapa;
      fin.recuperacao = rec;
      _espelhoFalhou = false;
      return true;
    } catch (err) {
      // Uma vez por tela: o conserto automático (_ler) não insiste.
      if (!_espelhoFalhou) _registrarFalha("falha ao copiar a senha para o Financeiro", err);
      _espelhoFalhou = true;
      return false;
    }
  }

  // ══════════════════════════════════════════
  //  REGRAS
  // ══════════════════════════════════════════
  function _hash(texto) {
    var dados = new TextEncoder().encode(String(texto));
    return crypto.subtle.digest("SHA-256", dados).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    });
  }

  /** Só o mínimo de caracteres (sem exigir maiúscula, número ou símbolo). */
  function validarSenhaAdmin(senha) {
    senha = String(senha || "");
    if (senha.length < MIN_SENHA) return "A senha do Administrador deve ter no mínimo " + MIN_SENHA + " caracteres.";
    return null;
  }

  function validarSenhaColaborador(senha) {
    senha = String(senha || "");
    if (senha.trim().length < MIN_COLABORADOR) {
      return "A senha do Colaborador deve ter no mínimo " + MIN_COLABORADOR + " caracteres.";
    }
    return null;
  }

  /** Senha aleatória de 8 caracteres, fácil de ditar (sem 0/O nem 1/I). */
  function gerarSenha() {
    var bytes = new Uint8Array(TAM_GERADA);
    try { crypto.getRandomValues(bytes); }
    catch (e) { for (var k = 0; k < bytes.length; k++) bytes[k] = Math.floor(Math.random() * 256); }
    var s = "";
    // 256 é múltiplo de 32 (o tamanho do alfabeto): o resto não vicia.
    for (var i = 0; i < bytes.length; i++) s += ALFABETO[bytes[i] % ALFABETO.length];
    return s;
  }

  /** Existe a senha do Administrador (a proteção está ligada). */
  function protegido() {
    return !!_ler().admin;
  }

  /**
   * O módulo pede senha agora: há senha do Administrador E o módulo está
   * bloqueado. Id desconhecido → false.
   */
  function moduloProtegido(id) {
    if (!_moduloPorId(id)) return false;
    var e = _ler();
    return !!e.admin && _bloqueado(e, id);
  }

  /**
   * A lista dos módulos com a escolha atual (bloqueado = marcado para pedir
   * senha; só vale de fato com a senha do Administrador criada).
   */
  function modulos() {
    var e = _ler();
    return MODULOS.map(function (mod) {
      return { id: mod.id, nome: mod.nome, desc: mod.desc, pagina: mod.pagina, bloqueado: _bloqueado(e, mod.id) };
    });
  }

  /**
   * Confere uma senha. O campo é um só: descobre sozinho de quem ela é.
   * @returns {Promise<"admin"|"colaborador"|null>}
   */
  function verificar(texto) {
    var e = _ler();
    texto = String(texto == null ? "" : texto);
    if (!e.admin || !texto) return Promise.resolve(null);
    return _hash(texto).then(function (h) {
      if (h === e.admin.hash) return "admin";
      if (e.colaborador && texto === e.colaborador.senha) return "colaborador";
      return null;
    });
  }

  /**
   * Define a senha do Administrador (usado também pelo 1º acesso do
   * Financeiro). bloquear: ids de módulos que precisam ficar bloqueados
   * com ela — quem cria a senha pelo Financeiro quer o Financeiro protegido.
   */
  function definirAdmin(senha, bloquear, respostas) {
    var erro = validarSenhaAdmin(senha);
    if (erro) return Promise.reject(new Error(erro));
    var atual = _ler();
    if (atual.colaborador && atual.colaborador.senha === senha) {
      return Promise.reject(new Error("A senha do Administrador precisa ser diferente da senha do Colaborador."));
    }
    // respostas (opcional): { idDaPergunta: "texto" } — as perguntas de
    // segurança respondidas junto (ver criarAdmin).
    return Promise.all([_hash(senha), _hashRespostas(respostas)]).then(function (r) {
      var h = r[0];
      var e = _ler();
      e.admin = _novoAdmin(h, senha, "manual");
      e.removida = null;
      if (r[1]) e.recuperacao = _juntarRespostas(e.recuperacao, r[1]);
      if (Array.isArray(bloquear) && bloquear.length) {
        var mapa = _mapaModulos(e);
        bloquear.forEach(function (id) { if (_moduloPorId(id)) mapa[id] = true; });
        e.modulos = mapa;
      }
      return _gravar(e);
    });
  }

  /**
   * Chamado pelo shell ao abrir o app. Com a opção ligada, troca a senha
   * do colaborador uma vez por abertura — recarregar uma tela não conta.
   * @returns {boolean} true se gerou uma senha nova
   */
  function renovarAoAbrir() {
    try {
      if (sessionStorage.getItem(SESSAO)) return false;
      sessionStorage.setItem(SESSAO, String(Date.now()));
    } catch (err) {
      return false;
    }
    var e = _ler();
    if (!e.admin || !e.gerarAoAbrir) return false;
    e.colaborador = { senha: gerarSenha(), definidaEm: Date.now(), origem: "auto" };
    return _gravar(e);
  }

  /** Resumo para outras telas — sem expor a senha do colaborador. */
  function resumo() {
    var e = _ler();
    return {
      protegido: !!e.admin,
      temColaborador: !!e.colaborador,
      gerarAoAbrir: !!e.gerarAoAbrir,
      bloqueados: MODULOS.filter(function (mod) { return _bloqueado(e, mod.id); }).map(function (mod) { return mod.id; }),
      perguntasRespondidas: _respondidas(e).length,
    };
  }

  /**
   * O hash atual do Administrador (ou null). Só para o Financeiro manter a
   * cópia dele no precifiq_dre igual à daqui ao gravar — é um hash, não a
   * senha, e já está no mesmo armazenamento que a tela lê.
   */
  function hashAdmin() {
    var e = _ler();
    return e.admin ? e.admin.hash : null;
  }

  /**
   * A cópia que fica em precifiq_dre → seguranca: { hash, modulos } ou
   * null. O Financeiro grava esta ao salvar — e não a que ele carregou ao
   * abrir, que pode estar velha —, para o backup levar a senha e a
   * escolha dos módulos atuais.
   */
  function espelho() {
    return _copiaDoEstado(_ler());
  }

  // ══════════════════════════════════════════
  //  UTILITÁRIOS DE TELA
  // ══════════════════════════════════════════
  function _esc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function _quando(ms) {
    if (!ms) return "";
    try {
      var d = new Date(ms);
      return d.toLocaleDateString("pt-BR") + " às " +
        d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch (e) { return ""; }
  }

  function _aoCarregar(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true });
    else fn();
  }

  function _copiar(texto) {
    function viaCampo() {
      var t = document.createElement("textarea");
      t.value = texto;
      t.setAttribute("readonly", "");
      t.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
      document.body.appendChild(t);
      t.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      t.remove();
      return ok;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(texto).then(function () { return true; }, function () { return viaCampo(); });
      }
    } catch (e) {}
    return Promise.resolve(viaCampo());
  }

  /**
   * Freio contra tentativa exaustiva — a mesma regra do Financeiro: do 3º
   * erro em diante, CADA erro trava o campo por alguns segundos (3s, e
   * mais 3s a cada 3 erros, até 30s).
   * Devolve a função que registra um erro; errou.total() diz quantos já foram.
   */
  function _criarFreio(input, botao, aviso) {
    var erros = 0;
    function errou(mensagem) {
      erros++;
      input.value = "";
      if (erros >= 3) {
        var restante = Math.min(30, 3 * Math.floor(erros / 3));
        botao.disabled = true;
        input.disabled = true;
        aviso.hidden = false;
        aviso.textContent = "Senha incorreta. Aguarde " + restante + "s para tentar de novo.";
        var tique = setInterval(function () {
          restante--;
          if (restante <= 0) {
            clearInterval(tique);
            botao.disabled = false;
            input.disabled = false;
            aviso.hidden = true;
            try { input.focus(); } catch (e) {}
          } else {
            aviso.textContent = "Senha incorreta. Aguarde " + restante + "s para tentar de novo.";
          }
        }, 1000);
      } else {
        aviso.hidden = false;
        aviso.textContent = mensagem || "Senha incorreta.";
        try { input.focus(); } catch (e) {}
      }
    }
    errou.total = function () { return erros; };
    return errou;
  }

  // ══════════════════════════════════════════
  //  TELA DE ACESSO DOS MÓDULOS PROTEGIDOS
  // ══════════════════════════════════════════
  var _promessaAcesso = null;

  function _travarConteudo(travar) {
    document.documentElement.classList.toggle("bsn-trancado", !!travar);
  }

  /**
   * Pede a senha para entrar no módulo. Resolve true quando libera e
   * false se a pessoa voltar ao início. Sem a senha do Administrador, ou
   * com o módulo desbloqueado, libera direto.
   * @param {string} [nomeModulo] como o módulo aparece no texto ("o Controle Financeiro")
   * @param {string} [idModulo]   id de MODULOS; sem ele, o módulo desta tela
   */
  function exigirAcesso(nomeModulo, idModulo) {
    if (_promessaAcesso) return _promessaAcesso;
    var id = idModulo || moduloDaTela;
    var mod = _moduloPorId(id);
    if (!mod || !moduloProtegido(id)) return Promise.resolve(true);
    _travarConteudo(true);
    _promessaAcesso = new Promise(function (resolve) {
      _aoCarregar(function () { _mostrarPortao(nomeModulo || mod.tela, id, resolve); });
    });
    return _promessaAcesso;
  }

  /** Para a tela esperar a liberação feita pelo data-modulo (ou data-admin). */
  function aguardarAcesso() {
    return _promessaAcesso || Promise.resolve(true);
  }

  /**
   * Tela que só o Administrador abre (Usuários e Senhas). Com a senha do
   * Administrador criada, pede a dele — a do Colaborador não libera. Sem
   * senha nenhuma, libera direto: é nessa tela que a primeira é criada.
   * @param {string} [nomeTela] como a tela aparece no texto ("Usuários e Senhas")
   * @param {string} [voltarPara] para onde o "Voltar" leva (padrão: Dados da Empresa)
   */
  function exigirAdmin(nomeTela, voltarPara) {
    if (_promessaAcesso) return _promessaAcesso;
    if (!protegido()) return Promise.resolve(true);
    _travarConteudo(true);
    _promessaAcesso = new Promise(function (resolve) {
      _aoCarregar(function () {
        _mostrarPortao(nomeTela || "Usuários e Senhas", null, resolve, {
          soAdmin: true,
          voltar: voltarPara || _voltarDaUrl() || "empresa.html",
        });
      });
    });
    return _promessaAcesso;
  }

  /** O ?voltar=tela.html do endereço, se for uma tela do próprio app. */
  function _voltarDaUrl() {
    try {
      var v = new URLSearchParams(location.search).get("voltar") || "";
      return /^[a-z0-9-]+\.html$/i.test(v) ? v : "";
    } catch (e) { return ""; }
  }

  /**
   * Sai da tela só do Administrador. Aberta numa aba nova por outra tela
   * (?aba=<id da aba de origem>), fecha esta aba e volta para aquela — o
   * que estava preenchido lá continua. Senão, vai para o ?voltar= ou para
   * o destino padrão.
   */
  function sairDaTelaAdmin(destinoPadrao) {
    try {
      var aba = new URLSearchParams(location.search).get("aba");
      var abas = window.parent && window.parent !== window ? window.parent.BapellAbas : null;
      if (aba && abas && typeof abas.existe === "function" && abas.existe(aba)) {
        abas.fechar(abas.idDe(window), aba);
        return;
      }
    } catch (e) {}
    window.location.href = _voltarDaUrl() || destinoPadrao || "empresa.html";
  }

  /**
   * A janela de senha que tranca a tela.
   * opcoes.soAdmin: só a senha do Administrador libera (a do Colaborador
   * é recusada com explicação); opcoes.voltar: destino do "Voltar".
   */
  function _mostrarPortao(nomeModulo, idModulo, resolve, opcoes) {
    opcoes = opcoes || {};
    var soAdmin = !!opcoes.soAdmin;
    // A proteção continua valendo? (Mudou em outra aba, por exemplo.)
    function precisaSenha() { return soAdmin ? protegido() : moduloProtegido(idModulo); }
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay bsn-portao";
    // Abaixo dos avisos de licença (como a tela de senha do Financeiro):
    // um módulo bloqueado pela licença mostra o bloqueio por cima.
    overlay.style.zIndex = "99999";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "bsnPortaoTitulo");
    overlay.innerHTML =
      '<div class="modal bsn-portao__modal">' +
        '<div class="modal-title bsn-portao__titulo" id="bsnPortaoTitulo">' +
          (soAdmin ? ICO_CHAVE + " " + _esc(nomeModulo) : ICO_CADEADO + " Acesso Protegido") + "</div>" +
        (soAdmin
          ? '<div class="modal-subtitle bsn-portao__sub">Só o <strong>Administrador</strong> abre esta tela. ' +
              "Digite a senha do Administrador para continuar.</div>"
          : '<div class="modal-subtitle bsn-portao__sub">Digite a senha do <strong>Administrador</strong> ou do ' +
              "<strong>Colaborador</strong> para acessar " + _esc(nomeModulo) + ".</div>") +
        '<div class="field-group bsn-portao__campo">' +
          '<input type="password" id="gateSenha" class="input-field" placeholder="' +
            (soAdmin ? "Senha do Administrador" : "Senha") + '" ' +
            'autocomplete="current-password" aria-label="' + (soAdmin ? "Senha do Administrador" : "Senha") + '" />' +
        "</div>" +
        '<div id="gateAviso" class="bsn-aviso" role="alert" hidden></div>' +
        '<button type="button" class="bsn-esqueci" id="gateEsqueci">Esqueci a senha do Administrador</button>' +
        '<div class="modal-actions bsn-portao__acoes">' +
          '<button type="button" class="btn-secondary" id="gateVoltar">' + (soAdmin ? "Voltar" : "Voltar ao Início") + "</button>" +
          '<button type="button" class="btn-primary" id="gateEntrar">Entrar</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(overlay);

    var input = overlay.querySelector("#gateSenha");
    var aviso = overlay.querySelector("#gateAviso");
    var btnEntrar = overlay.querySelector("#gateEntrar");
    var errou = _criarFreio(input, btnEntrar, aviso);
    var liberado = false;
    var espera = null;
    // Conferências automáticas (sem Enter) que não bateram. Passando do
    // limite — ou depois de 3 erros confirmados — a tela só confere com
    // Enter/Entrar, que passam pelo freio. Sem isso, dava para testar
    // senhas à vontade sem nunca apertar Enter.
    var LIMITE_AUTO = 10;
    var autoSemAcerto = 0;

    // A partir daqui a senha só é conferida no Enter: o campo avisa.
    function soComEnter() {
      input.placeholder = "Digite a senha e aperte Enter";
    }

    function liberar(papel) {
      if (liberado) return;
      liberado = true;
      clearTimeout(espera);
      window.removeEventListener("storage", aoMudarSenhas);
      overlay.remove();
      _travarConteudo(false);
      if (papel) {
        // Com a senha do Administrador, quem entrou é o Master: aparece o nome dele.
        _avisar("Acesso liberado (" + (papel === "admin" ? nomeMaster() : "Colaborador") + ").", "success", 2600);
      }
      resolve(true);
    }

    // A proteção foi removida — ou este módulo foi desbloqueado — em outra
    // aba enquanto esta esperava: não há mais o que conferir, então libera.
    function aoMudarSenhas(e) {
      if (e.key === CHAVE && !liberado && !precisaSenha()) liberar(null);
    }
    window.addEventListener("storage", aoMudarSenhas);

    // Na tela só do Administrador, a senha do Colaborador não serve.
    var MSG_SO_ADMIN = "Esta é a senha do Colaborador. Esta tela abre só com a senha do Administrador.";
    function serve(papel) { return soAdmin ? papel === "admin" : !!papel; }

    function tentar() {
      if (liberado || btnEntrar.disabled) return;
      clearTimeout(espera); // a conferência automática pendente fica sem efeito
      if (!precisaSenha()) { liberar(null); return; }
      var valor = input.value;
      if (!valor) { aviso.hidden = false; aviso.textContent = "Digite a senha."; input.focus(); return; }
      verificar(valor).then(function (papel) {
        if (liberado) return;
        if (serve(papel)) { liberar(papel); return; }
        errou(papel === "colaborador" ? MSG_SO_ADMIN : undefined);
        if (errou.total() >= 3) soComEnter();
      }, function (err) {
        _registrarFalha("falha ao conferir a senha", err);
        aviso.hidden = false;
        aviso.textContent = "Não foi possível conferir a senha. Tente de novo.";
      });
    }

    // Verificação automática: libera assim que a senha digitada confere,
    // sem precisar apertar Entrar. Nenhuma senha tem menos de MIN_SENHA
    // caracteres, então o que é mais curto nem é conferido. Um erro só
    // conta no freio quando a pessoa confirma (Enter ou Entrar) — senão
    // cada letra seria uma tentativa.
    input.addEventListener("input", function () {
      if (!aviso.hidden && !btnEntrar.disabled) aviso.hidden = true;
      clearTimeout(espera);
      var valor = input.value;
      if (valor.length < MIN_SENHA) return;
      if (autoSemAcerto >= LIMITE_AUTO || errou.total() >= 3) return;
      espera = setTimeout(function () {
        verificar(valor).then(function (papel) {
          if (liberado) return;
          if (!serve(papel)) {
            autoSemAcerto++;
            if (autoSemAcerto >= LIMITE_AUTO) soComEnter();
            if (papel === "colaborador" && input.value === valor) { aviso.hidden = false; aviso.textContent = MSG_SO_ADMIN; }
            return;
          }
          if (input.value === valor) liberar(papel);
        }, function () {});
      }, 180);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); tentar(); }
    });
    btnEntrar.addEventListener("click", tentar);
    // Esqueceu a senha do Administrador: uma das perguntas de segurança e,
    // com a resposta certa, uma senha nova — e a tela abre.
    overlay.querySelector("#gateEsqueci").addEventListener("click", function () {
      if (liberado) return;
      _recuperarAdmin().then(function (ok) {
        if (liberado) return;
        if (ok) liberar(null);
        else { try { input.focus(); } catch (e) {} }
      });
    });
    overlay.querySelector("#gateVoltar").addEventListener("click", function () {
      liberado = true;
      clearTimeout(espera);
      window.removeEventListener("storage", aoMudarSenhas);
      resolve(false);
      if (soAdmin) sairDaTelaAdmin(opcoes.voltar);
      else window.location.href = "index.html";
    });
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
  }

  // ══════════════════════════════════════════
  //  REDEFINIR SENHAS (Dados da Empresa)
  // ══════════════════════════════════════════
  /** Janela pequena de confirmação, no visual do app. Resolve true/false. */
  function _confirmar(opcoes) {
    return new Promise(function (resolve) {
      var fundo = document.createElement("div");
      fundo.className = "modal-overlay bsn-camada";
      fundo.setAttribute("role", "dialog");
      fundo.setAttribute("aria-modal", "true");
      fundo.innerHTML =
        '<div class="modal bsn-confirma">' +
          '<div class="modal-title">' + _esc(opcoes.titulo) + "</div>" +
          '<div class="modal-subtitle">' + opcoes.texto + "</div>" +
          '<div class="modal-actions">' +
            '<button type="button" class="btn-secondary" data-r="nao">Cancelar</button>' +
            '<button type="button" class="' + (opcoes.perigo ? "btn-danger bsn-btn-perigo" : "btn-primary") +
              '" data-r="sim">' + _esc(opcoes.botao || "Confirmar") + "</button>" +
          "</div>" +
        "</div>";
      document.body.appendChild(fundo);
      var feito = false;
      function responder(v) {
        if (feito) return;
        feito = true;
        document.removeEventListener("keydown", tecla, true);
        fundo.remove();
        resolve(v);
      }
      function tecla(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); responder(false); }
      }
      document.addEventListener("keydown", tecla, true);
      fundo.addEventListener("mousedown", function (e) { if (e.target === fundo) responder(false); });
      fundo.querySelector('[data-r="nao"]').addEventListener("click", function () { responder(false); });
      fundo.querySelector('[data-r="sim"]').addEventListener("click", function () { responder(true); });
      // O foco começa em Cancelar: são ações sem volta.
      setTimeout(function () { try { fundo.querySelector('[data-r="nao"]').focus(); } catch (e) {} }, 30);
    });
  }

  /** Pede a senha do Administrador antes de mostrar as senhas. */
  function _pedirSenhaAdmin() {
    return new Promise(function (resolve) {
      var fundo = document.createElement("div");
      fundo.className = "modal-overlay bsn-camada";
      fundo.setAttribute("role", "dialog");
      fundo.setAttribute("aria-modal", "true");
      fundo.setAttribute("aria-labelledby", "bsnConfTitulo");
      fundo.innerHTML =
        '<div class="modal bsn-portao__modal">' +
          '<div class="modal-title bsn-portao__titulo" id="bsnConfTitulo">' + ICO_CHAVE + " Senhas de acesso</div>" +
          '<div class="modal-subtitle bsn-portao__sub">Só o <strong>Administrador</strong> pode ver e mudar as senhas. ' +
            "Digite a senha do Administrador para continuar.</div>" +
          '<div class="field-group bsn-portao__campo">' +
            '<input type="password" id="bsnConfSenha" class="input-field" placeholder="Senha do Administrador" ' +
              'autocomplete="current-password" aria-label="Senha do Administrador" />' +
          "</div>" +
          '<div id="bsnConfAviso" class="bsn-aviso" role="alert" hidden></div>' +
          '<button type="button" class="bsn-esqueci" data-r="esqueci">Esqueci a senha do Administrador</button>' +
          '<div class="modal-actions bsn-portao__acoes">' +
            '<button type="button" class="btn-secondary" data-r="nao">Cancelar</button>' +
            '<button type="button" class="btn-primary" data-r="sim">Continuar</button>' +
          "</div>" +
        "</div>";
      document.body.appendChild(fundo);

      var input = fundo.querySelector("#bsnConfSenha");
      var aviso = fundo.querySelector("#bsnConfAviso");
      var btn = fundo.querySelector('[data-r="sim"]');
      var errou = _criarFreio(input, btn, aviso);
      var feito = false;

      function responder(v) {
        if (feito) return;
        feito = true;
        document.removeEventListener("keydown", tecla, true);
        fundo.remove();
        resolve(v);
      }
      function tecla(e) {
        // A recuperação aberta por cima cuida do próprio Esc.
        if (document.querySelector(".bsn-recup")) return;
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); responder(false); }
      }
      function tentar() {
        if (feito || btn.disabled) return;
        // Proteção removida em outra aba enquanto esta janela esperava.
        if (!protegido()) { responder(true); return; }
        if (!input.value) { aviso.hidden = false; aviso.textContent = "Digite a senha do Administrador."; input.focus(); return; }
        verificar(input.value).then(function (papel) {
          if (papel === "admin") responder(true);
          else if (papel === "colaborador") errou("Esta é a senha do Colaborador. Para mudar as senhas, use a do Administrador.");
          else errou();
        }, function (err) {
          _registrarFalha("falha ao conferir a senha do Administrador", err);
          aviso.hidden = false;
          aviso.textContent = "Não foi possível conferir a senha. Tente de novo.";
        });
      }
      document.addEventListener("keydown", tecla, true);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); tentar(); } });
      btn.addEventListener("click", tentar);
      fundo.querySelector('[data-r="nao"]').addEventListener("click", function () { responder(false); });
      fundo.querySelector('[data-r="esqueci"]').addEventListener("click", function () {
        if (feito) return;
        _recuperarAdmin().then(function (ok) {
          if (feito) return;
          if (ok) responder(true);
          else { try { input.focus(); } catch (e) {} }
        });
      });
      fundo.addEventListener("mousedown", function (e) { if (e.target === fundo) responder(false); });
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
    });
  }

  // ══════════════════════════════════════════
  //  PERGUNTAS DE SEGURANÇA — FORMULÁRIO
  // ══════════════════════════════════════════
  /** O Tab circula só dentro da janela (o que está atrás não recebe foco). */
  function _prenderTab(fundo, e) {
    var itens = Array.prototype.filter.call(
      fundo.querySelectorAll("input, select, button, textarea"),
      function (el) { return !el.disabled && el.offsetParent !== null; }
    );
    e.preventDefault();
    if (!itens.length) return;
    var i = itens.indexOf(document.activeElement);
    var prox = e.shiftKey ? (i <= 0 ? itens.length - 1 : i - 1) : (i < 0 || i >= itens.length - 1 ? 0 : i + 1);
    itens[prox].focus();
  }

  function _textoSelo(n) {
    return n + " de " + PERGUNTAS.length + (n === 1 ? " respondida" : " respondidas");
  }

  /**
   * As cinco perguntas de segurança num formulário.
   *   prefixo: começo dos ids dos campos ("bsnResp_");
   *   respondidas: ids já respondidos (o campo em branco mantém a resposta);
   *   fechado: só o resumo, com "Alterar respostas" para abrir as perguntas.
   */
  function _htmlPerguntas(prefixo, respondidas, fechado) {
    respondidas = respondidas || [];
    var n = respondidas.length;
    var ok = n >= MIN_PERGUNTAS;
    var itens = PERGUNTAS.map(function (p) {
      var feita = respondidas.indexOf(p.id) >= 0;
      return '<div class="field-group bsn-pergunta' + (feita ? " bsn-pergunta--feita" : "") + '">' +
        '<label for="' + prefixo + p.id + '">' + _esc(p.texto) +
          (feita ? ' <span class="bsn-pergunta__ok">✓ respondida</span>' : "") + "</label>" +
        '<input type="text" id="' + prefixo + p.id + '" class="input-field" data-pergunta="' + p.id + '" ' +
          'autocomplete="off" spellcheck="false" maxlength="80" placeholder="' +
          (feita ? "Respondida — em branco, mantém a resposta" : "Sua resposta") + '" />' +
      "</div>";
    }).join("");
    return '<div class="bsn-perguntas' + (ok ? "" : " bsn-perguntas--alerta") + (fechado ? " bsn-perguntas--fechado" : "") + '">' +
      '<div class="bsn-perguntas__topo">' +
        '<span class="bsn-perguntas__tit">Perguntas de segurança</span>' +
        '<span class="bsn-selo ' + (ok ? "bsn-selo--ok" : "bsn-selo--alerta") + '" data-rec-selo>' + _textoSelo(n) + "</span>" +
      "</div>" +
      '<p class="bsn-perguntas__txt">' +
        (ok
          ? "Recuperam o acesso se você esquecer a senha do Administrador: basta responder uma delas."
          : "<strong>Obrigatório:</strong> responda pelo menos " + MIN_PERGUNTAS + " das " + PERGUNTAS.length +
            ". Se você esquecer a senha do Administrador, uma delas recupera o acesso.") +
        " Maiúsculas, minúsculas e acentos não fazem diferença." +
      "</p>" +
      (fechado ? '<button type="button" class="bsn-mini bsn-perguntas__alterar" data-rec-abrir>Alterar respostas</button>' : "") +
      '<div class="bsn-perguntas__lista">' + itens + "</div>" +
    "</div>";
  }

  /**
   * O que foi digitado nas perguntas:
   *   respostas: { id: texto } das preenchidas (com o mínimo de caracteres);
   *   curta: o primeiro campo com resposta curta demais (ou null);
   *   vazias: os campos em branco de perguntas ainda sem resposta;
   *   total: quantas ficam respondidas (as guardadas + as novas).
   */
  function _lerPerguntas(raiz, respondidas) {
    var r = { respostas: {}, curta: null, vazias: [], total: 0 };
    respondidas = respondidas || [];
    var inputs = raiz ? raiz.querySelectorAll("[data-pergunta]") : [];
    Array.prototype.forEach.call(inputs, function (inp) {
      var id = inp.getAttribute("data-pergunta");
      var t = inp.value;
      if (String(t).trim()) {
        if (_normalizarResposta(t).length < MIN_RESPOSTA) { if (!r.curta) r.curta = inp; return; }
        r.respostas[id] = t;
      } else if (respondidas.indexOf(id) < 0) {
        r.vazias.push(inp);
      }
    });
    var ids = {};
    respondidas.forEach(function (id) { ids[id] = 1; });
    Object.keys(r.respostas).forEach(function (id) { ids[id] = 1; });
    r.total = Object.keys(ids).length;
    return r;
  }

  /** As perguntas estão em ordem para salvar? { ok, msg, campo }. */
  function _validarPerguntas(lido) {
    if (lido.curta) {
      return { ok: false, campo: lido.curta, msg: "Resposta muito curta: use pelo menos " + MIN_RESPOSTA + " letras ou números." };
    }
    if (lido.total < MIN_PERGUNTAS) {
      return {
        ok: false,
        campo: lido.vazias[0] || null,
        msg: "Responda pelo menos " + MIN_PERGUNTAS + " das " + PERGUNTAS.length + " perguntas de segurança — são elas " +
          "que recuperam o acesso se você esquecer a senha do Administrador.",
      };
    }
    return { ok: true };
  }

  /** O resumo (selo) acompanha o que é digitado; "Alterar respostas" abre a lista. */
  function _ligarPerguntas(raiz, respondidas) {
    var caixa = raiz && raiz.querySelector(".bsn-perguntas");
    if (!caixa) return;
    var selo = caixa.querySelector("[data-rec-selo]");
    var abrir = caixa.querySelector("[data-rec-abrir]");
    if (abrir) {
      abrir.addEventListener("click", function () {
        _abrirPerguntas(caixa);
        var primeiro = caixa.querySelector("[data-pergunta]");
        try { if (primeiro) primeiro.focus(); } catch (e) {}
      });
    }
    caixa.addEventListener("input", function () {
      var lido = _lerPerguntas(caixa, respondidas);
      var ok = lido.total >= MIN_PERGUNTAS;
      caixa.classList.toggle("bsn-perguntas--alerta", !ok);
      if (selo) {
        selo.textContent = _textoSelo(lido.total);
        selo.classList.toggle("bsn-selo--ok", ok);
        selo.classList.toggle("bsn-selo--alerta", !ok);
      }
    });
  }

  function _abrirPerguntas(caixaOuRaiz) {
    var caixa = caixaOuRaiz && caixaOuRaiz.classList && caixaOuRaiz.classList.contains("bsn-perguntas")
      ? caixaOuRaiz : (caixaOuRaiz && caixaOuRaiz.querySelector(".bsn-perguntas"));
    if (!caixa) return;
    caixa.classList.remove("bsn-perguntas--fechado");
    var b = caixa.querySelector("[data-rec-abrir]");
    if (b) b.remove();
  }

  function _tempoTexto(ms) {
    var s = Math.max(1, Math.ceil(ms / 1000));
    var m = Math.floor(s / 60);
    var r = s % 60;
    if (!m) return r + " s";
    return m + " min" + (r ? " " + r + " s" : "");
  }

  // ══════════════════════════════════════════
  //  ESQUECI A SENHA DO ADMINISTRADOR
  // ══════════════════════════════════════════
  /**
   * Uma das perguntas de segurança e, com a resposta certa, uma senha nova
   * do Administrador. Tudo neste computador, sem internet.
   * Resolve true quando a senha nova foi gravada (ou se a proteção já não
   * existe mais) e false se a pessoa desistir.
   */
  function _recuperarAdmin() {
    if (document.querySelector(".bsn-recup")) return Promise.resolve(false);
    if (!protegido()) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var ids = _respondidas(_ler());
      var focoAntes = document.activeElement;
      var fundo = document.createElement("div");
      fundo.className = "modal-overlay bsn-camada bsn-recup";
      fundo.setAttribute("role", "dialog");
      fundo.setAttribute("aria-modal", "true");
      fundo.setAttribute("aria-labelledby", "bsnRecupTitulo");
      var corpo;
      if (!ids.length) {
        corpo =
          '<div class="modal-subtitle bsn-portao__sub">Nenhuma pergunta de segurança foi cadastrada, então a senha do ' +
            "Administrador não pode ser recuperada por aqui.</div>" +
          '<p class="bsn-recup__nota">As perguntas ficam em <strong>Dados da Empresa › Usuários e Senhas</strong>, junto da senha ' +
            "do Administrador. Se a senha do Colaborador estiver ativa, ela continua abrindo os módulos protegidos (mas não a " +
            "tela Usuários e Senhas).</p>" +
          '<div class="modal-actions"><button type="button" class="btn-primary" data-r="fechar">Fechar</button></div>';
      } else {
        corpo =
          '<div class="bsn-recup__passo" data-passo="1">' +
            '<div class="modal-subtitle bsn-portao__sub">Escolha uma das suas <strong>perguntas de segurança</strong> e digite a ' +
              "resposta. Maiúsculas, minúsculas e acentos não fazem diferença.</div>" +
            '<div class="field-group bsn-portao__campo"><label for="bsnRecupPergunta">Pergunta</label>' +
              '<select id="bsnRecupPergunta" class="input-field">' +
                ids.map(function (id) { return '<option value="' + id + '">' + _esc(_perguntaPorId(id).texto) + "</option>"; }).join("") +
              "</select></div>" +
            '<div class="field-group bsn-portao__campo"><label for="bsnRecupResposta">Resposta</label>' +
              '<input type="text" id="bsnRecupResposta" class="input-field" autocomplete="off" spellcheck="false" maxlength="80" /></div>' +
            '<div id="bsnRecupAviso" class="bsn-aviso" role="alert" hidden></div>' +
            '<div class="modal-actions bsn-portao__acoes">' +
              '<button type="button" class="btn-secondary" data-r="nao">Cancelar</button>' +
              '<button type="button" class="btn-primary" id="bsnRecupContinuar">Continuar</button>' +
            "</div>" +
          "</div>" +
          '<div class="bsn-recup__passo" data-passo="2" hidden>' +
            '<div class="modal-subtitle bsn-portao__sub">Resposta certa. Agora crie a <strong>nova senha do Administrador</strong>.</div>' +
            '<div class="field-group bsn-portao__campo"><label for="bsnRecupNova">Nova senha</label>' +
              '<input type="password" id="bsnRecupNova" class="input-field" autocomplete="new-password" /></div>' +
            '<div class="field-group bsn-portao__campo"><label for="bsnRecupConf">Confirmar a nova senha</label>' +
              '<input type="password" id="bsnRecupConf" class="input-field" autocomplete="new-password" /></div>' +
            '<small class="bsn-dica">Mínimo de ' + MIN_SENHA + " caracteres. As perguntas de segurança continuam as mesmas.</small>" +
            '<div id="bsnRecupAviso2" class="bsn-aviso" role="alert" hidden></div>' +
            '<div class="modal-actions bsn-portao__acoes">' +
              '<button type="button" class="btn-secondary" data-r="nao">Cancelar</button>' +
              '<button type="button" class="btn-primary" id="bsnRecupSalvar">Salvar nova senha</button>' +
            "</div>" +
          "</div>";
      }
      fundo.innerHTML =
        '<div class="modal bsn-portao__modal bsn-recup__modal">' +
          '<div class="modal-title bsn-portao__titulo" id="bsnRecupTitulo">' + ICO_CHAVE + " Recuperar o acesso</div>" +
          corpo +
        "</div>";
      document.body.appendChild(fundo);

      var feito = false;
      var conferida = false; // a resposta certa veio antes da senha nova
      var tique = null;
      function responder(v) {
        if (feito) return;
        feito = true;
        clearInterval(tique);
        document.removeEventListener("keydown", tecla, true);
        fundo.remove();
        try { if (!v && focoAntes && focoAntes.isConnected) focoAntes.focus({ preventScroll: true }); } catch (e) {}
        resolve(v);
      }
      function tecla(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); responder(false); return; }
        if (e.key === "Tab") _prenderTab(fundo, e);
      }
      document.addEventListener("keydown", tecla, true);
      fundo.addEventListener("mousedown", function (e) { if (e.target === fundo) responder(false); });
      Array.prototype.forEach.call(fundo.querySelectorAll('[data-r="nao"], [data-r="fechar"]'), function (b) {
        b.addEventListener("click", function () { responder(false); });
      });
      if (!ids.length) {
        setTimeout(function () { try { fundo.querySelector('[data-r="fechar"]').focus(); } catch (e) {} }, 60);
        return;
      }

      var sel = fundo.querySelector("#bsnRecupPergunta");
      var resp = fundo.querySelector("#bsnRecupResposta");
      var aviso = fundo.querySelector("#bsnRecupAviso");
      var btnCont = fundo.querySelector("#bsnRecupContinuar");
      var nova = fundo.querySelector("#bsnRecupNova");
      var conf = fundo.querySelector("#bsnRecupConf");
      var aviso2 = fundo.querySelector("#bsnRecupAviso2");
      var btnSalvar = fundo.querySelector("#bsnRecupSalvar");

      function travar(sim) { sel.disabled = resp.disabled = btnCont.disabled = !!sim; }
      // Muitas respostas erradas: espera (o prazo fica guardado — recarregar
      // a tela não zera). Devolve true enquanto precisa esperar.
      function conferirEspera() {
        var ms = _esperaRecuperacao();
        if (ms <= 0) {
          clearInterval(tique);
          tique = null;
          if (aviso.getAttribute("data-espera") === "1") {
            travar(false);
            aviso.hidden = true;
            aviso.removeAttribute("data-espera");
            try { resp.focus(); } catch (e) {}
          }
          return false;
        }
        travar(true);
        aviso.hidden = false;
        aviso.setAttribute("data-espera", "1");
        aviso.textContent = "Muitas respostas erradas. Tente de novo em " + _tempoTexto(ms) + ".";
        if (!tique) tique = setInterval(conferirEspera, 1000);
        return true;
      }
      function continuar() {
        if (feito || btnCont.disabled) return;
        if (conferirEspera()) return;
        // Em branco ou só sinais ("!!!"): nenhuma resposta guardada é assim
        // (todas têm pelo menos MIN_RESPOSTA letras ou números) — pede a
        // resposta sem contar como erro.
        if (_normalizarResposta(resp.value).length < MIN_RESPOSTA) {
          aviso.hidden = false;
          aviso.textContent = resp.value.trim()
            ? "Digite a resposta com pelo menos " + MIN_RESPOSTA + " letras ou números."
            : "Digite a resposta.";
          _marcarCampo(resp);
          return;
        }
        btnCont.disabled = true;
        verificarResposta(sel.value, resp.value).then(function (ok) {
          if (feito) return;
          btnCont.disabled = false;
          if (ok) {
            conferida = true;
            _acertouRecuperacao();
            fundo.querySelector('[data-passo="1"]').hidden = true;
            fundo.querySelector('[data-passo="2"]').hidden = false;
            setTimeout(function () { try { nova.focus(); } catch (e) {} }, 30);
            return;
          }
          var t = _errouRecuperacao();
          resp.value = "";
          if (conferirEspera()) return;
          var faltam = 3 - t.erros;
          aviso.hidden = false;
          aviso.textContent = "Resposta incorreta." + (faltam > 0
            ? " Depois de mais " + faltam + (faltam === 1 ? " erro" : " erros") + ", será preciso esperar para tentar de novo."
            : "");
          try { resp.focus(); } catch (e) {}
        }, function (err) {
          btnCont.disabled = false;
          _registrarFalha("falha ao conferir a resposta de segurança", err);
          aviso.hidden = false;
          aviso.textContent = "Não foi possível conferir a resposta. Tente de novo.";
        });
      }
      function salvar() {
        if (feito || !conferida || btnSalvar.disabled) return;
        var senha = nova.value;
        var erro = validarSenhaAdmin(senha);
        if (erro) { aviso2.hidden = false; aviso2.textContent = erro; _marcarCampo(nova); return; }
        if (senha !== conf.value) {
          aviso2.hidden = false;
          aviso2.textContent = "A confirmação não confere com a nova senha.";
          _marcarCampo(conf);
          return;
        }
        var atual = _ler();
        if (atual.colaborador && atual.colaborador.senha === senha) {
          aviso2.hidden = false;
          aviso2.textContent = "A senha do Administrador precisa ser diferente da senha do Colaborador.";
          _marcarCampo(nova);
          return;
        }
        btnSalvar.disabled = true;
        _hash(senha).then(function (h) {
          if (feito) return;
          var e = _ler();
          e.admin = _novoAdmin(h, senha, "recuperacao");
          e.removida = null;
          if (_gravar(e)) {
            _avisar("Senha do Administrador redefinida. Guarde a nova senha.", "success", 4500);
            responder(true);
          } else {
            btnSalvar.disabled = false;
          }
        }, function (err) {
          btnSalvar.disabled = false;
          _registrarFalha("falha ao gravar a nova senha do Administrador", err);
          aviso2.hidden = false;
          aviso2.textContent = "Não foi possível salvar a nova senha. Tente de novo.";
        });
      }
      btnCont.addEventListener("click", continuar);
      resp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); continuar(); } });
      resp.addEventListener("input", function () {
        if (!aviso.hidden && aviso.getAttribute("data-espera") !== "1") aviso.hidden = true;
      });
      btnSalvar.addEventListener("click", salvar);
      [nova, conf].forEach(function (inp) {
        inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); salvar(); } });
        inp.addEventListener("input", function () { if (!aviso2.hidden) aviso2.hidden = true; });
      });
      conferirEspera();
      setTimeout(function () { try { (resp.disabled ? sel : resp).focus(); } catch (e) {} }, 60);
    });
  }

  // ══════════════════════════════════════════
  //  CRIAR A SENHA DO ADMINISTRADOR (com as perguntas)
  // ══════════════════════════════════════════
  /**
   * A senha do Administrador e as perguntas de segurança (pelo menos 3),
   * numa janela. Usada pelo convite do Controle Financeiro ("Proteger os
   * módulos com senha?").
   * opcoes.bloquear: ids de módulos que ficam bloqueados com ela.
   * Resolve true quando a senha foi criada e false se a pessoa desistir.
   */
  function criarAdmin(opcoes) {
    opcoes = opcoes || {};
    if (document.querySelector(".bsn-criar")) return Promise.resolve(false);
    return new Promise(function (resolve) {
      var respondidas = _respondidas(_ler());
      var focoAntes = document.activeElement;
      var fundo = document.createElement("div");
      fundo.className = "modal-overlay bsn-camada bsn-criar";
      fundo.setAttribute("role", "dialog");
      fundo.setAttribute("aria-modal", "true");
      fundo.setAttribute("aria-labelledby", "bsnCriarTitulo");
      fundo.innerHTML =
        '<div class="modal bsn-criar__modal">' +
          '<div class="modal-title bsn-portao__titulo" id="bsnCriarTitulo">' + ICO_CHAVE + " Criar a senha do Administrador</div>" +
          '<div class="modal-subtitle bsn-portao__sub">Ela abre os módulos protegidos e a tela <strong>Usuários e Senhas</strong>. ' +
            "Responda também as perguntas de segurança: são elas que recuperam o acesso se você esquecer a senha.</div>" +
          '<div class="bsn-criar__corpo">' +
            '<div class="bsn-campos">' +
              '<div class="field-group"><label for="bsnCriarSenha">Senha</label>' +
                '<input type="password" id="bsnCriarSenha" class="input-field" autocomplete="new-password" /></div>' +
              '<div class="field-group"><label for="bsnCriarConf">Confirmar senha</label>' +
                '<input type="password" id="bsnCriarConf" class="input-field" autocomplete="new-password" /></div>' +
            "</div>" +
            '<small class="bsn-dica">Mínimo de ' + MIN_SENHA + " caracteres.</small>" +
            _htmlPerguntas("bsnCriarResp_", respondidas, false) +
          "</div>" +
          '<div id="bsnCriarAviso" class="bsn-aviso bsn-criar__aviso" role="alert" hidden></div>' +
          '<div class="modal-actions">' +
            '<button type="button" class="btn-secondary" data-r="nao">Cancelar</button>' +
            '<button type="button" class="btn-primary" data-r="sim">Criar senha</button>' +
          "</div>" +
        "</div>";
      document.body.appendChild(fundo);
      _ligarPerguntas(fundo, respondidas);

      var inpSenha = fundo.querySelector("#bsnCriarSenha");
      var inpConf = fundo.querySelector("#bsnCriarConf");
      var aviso = fundo.querySelector("#bsnCriarAviso");
      var btn = fundo.querySelector('[data-r="sim"]');
      var feito = false;
      function responder(v) {
        if (feito) return;
        feito = true;
        document.removeEventListener("keydown", tecla, true);
        fundo.remove();
        try { if (focoAntes && focoAntes.isConnected) focoAntes.focus({ preventScroll: true }); } catch (e) {}
        resolve(v);
      }
      function tecla(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); responder(false); return; }
        if (e.key === "Tab") _prenderTab(fundo, e);
      }
      function mostrar(msg) {
        aviso.hidden = false;
        aviso.textContent = msg;
      }
      function criar() {
        if (feito || btn.disabled) return;
        var senha = inpSenha.value;
        var erro = validarSenhaAdmin(senha);
        if (erro) { mostrar(erro); _marcarCampo(inpSenha); return; }
        if (senha !== inpConf.value) { mostrar("A confirmação não confere com a senha."); _marcarCampo(inpConf); return; }
        var lido = _lerPerguntas(fundo, respondidas);
        var v = _validarPerguntas(lido);
        if (!v.ok) { mostrar(v.msg); if (v.campo) _marcarCampo(v.campo); return; }
        btn.disabled = true;
        definirAdmin(senha, opcoes.bloquear, lido.respostas).then(function (ok) {
          if (feito) return;
          if (!ok) { btn.disabled = false; return; } // _gravar já avisou (disco cheio)
          responder(true);
        }, function (err) {
          btn.disabled = false;
          mostrar((err && err.message) || "Não foi possível criar a senha.");
        });
      }
      document.addEventListener("keydown", tecla, true);
      fundo.addEventListener("mousedown", function (e) { if (e.target === fundo) responder(false); });
      fundo.querySelector('[data-r="nao"]').addEventListener("click", function () { responder(false); });
      btn.addEventListener("click", criar);
      fundo.addEventListener("input", function () { if (!aviso.hidden) aviso.hidden = true; });
      [inpSenha, inpConf].forEach(function (inp) {
        inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); criar(); } });
      });
      setTimeout(function () { try { inpSenha.focus(); } catch (e) {} }, 60);
    });
  }

  /** Abre as senhas de acesso em janela. Com senha definida, pede a do Administrador. */
  function abrirGerenciador() {
    if (document.getElementById("bsnGerenciador") || document.querySelector(".bsn-camada")) return;
    if (protegido()) {
      _pedirSenhaAdmin().then(function (ok) { if (ok) _mostrarGerenciador(); });
    } else {
      _mostrarGerenciador();
    }
  }

  /**
   * As senhas de acesso DENTRO de uma tela (Usuários e Senhas), em vez de
   * janela. A tela já foi liberada pela senha do Administrador
   * (data-admin), então não pede de novo.
   * @param {HTMLElement} destino onde montar
   * @param {object} [opcoes] botoes: onde montar a "Senha nos botões"
   */
  function montarGerenciador(destino, opcoes) {
    if (!destino || destino.nodeType !== 1) return;
    _mostrarGerenciador(destino, opcoes);
  }

  /** A linha de baixo da "Senha atual" do Administrador. */
  function _quandoAdmin(admin, temTexto) {
    var q = "";
    if (admin && admin.definidaEm) {
      q = (admin.origem === "recuperacao" ? "Redefinida pela recuperação em " : "Definida em ") + _quando(admin.definidaEm) + ".";
    }
    if (!temTexto) q += (q ? " " : "") + "Para poder mostrar e copiar a senha aqui, defina-a de novo em Nova senha.";
    return _esc(q);
  }

  /**
   * As duas senhas (com as perguntas de segurança), os módulos protegidos
   * e — na tela — a "Senha nos botões".
   * Sem destino: em janela (modal). Com destino: dentro dele, na tela —
   * aí não há "fechar": salvar, cancelar ou remover redesenha o bloco, e o
   * "Cancelar" e o "Salvar" ficam na barra fixa do canto inferior direito.
   */
  function _mostrarGerenciador(destino, opcoes) {
    var naTela = !!(destino && destino.nodeType === 1);
    if (naTela) {
      if (opcoes) destino._bsnOpcoes = opcoes;
      opcoes = destino._bsnOpcoes || {};
    } else {
      opcoes = {};
    }
    var destinoBotoes = naTela && opcoes.botoes && opcoes.botoes.nodeType === 1 ? opcoes.botoes : null;
    var e = _ler();
    var temAdmin = !!e.admin;
    var colab = e.colaborador;
    var respondidas = _respondidas(e);
    var textoAdmin = _textoAdmin(e);
    var focoAntes = document.activeElement;

    var seloAdmin = temAdmin
      ? '<span class="bsn-selo bsn-selo--ok">Definida</span>'
      : '<span class="bsn-selo">Ainda não definida</span>';
    var seloColab = colab
      ? '<span class="bsn-selo bsn-selo--ok">Ativa</span>'
      : '<span class="bsn-selo">Nenhuma</span>';

    // Lista dos módulos, cada um com o seu switch (marcado = bloqueado).
    var mapaModulos = _mapaModulos(e);
    var listaModulos = MODULOS.map(function (mod) {
      var bloq = !!mapaModulos[mod.id];
      return '<label class="bsn-modulo' + (bloq ? " bsn-modulo--bloq" : "") + '">' +
          '<span class="bsn-modulo__ico" aria-hidden="true">' + (bloq ? ICO_CADEADO_MINI : ICO_ABERTO_MINI) + "</span>" +
          '<span class="bsn-modulo__txt"><strong>' + _esc(mod.nome) + "</strong><small>" + _esc(mod.desc) + "</small></span>" +
          '<span class="bsn-modulo__estado">' + (bloq ? "Bloqueado" : "Desbloqueado") + "</span>" +
          '<input type="checkbox" class="bsn-switch__input" role="switch" data-modulo="' + _esc(mod.id) + '"' +
            (bloq ? " checked" : "") + ' aria-label="Bloquear ' + _esc(mod.nome) + '" />' +
          '<span class="bsn-switch" aria-hidden="true"><span class="bsn-switch__bola"></span></span>' +
        "</label>";
    }).join("");

    // A senha atual do Administrador: a mesma linha da do Colaborador.
    var blocoAtualAdmin = temAdmin
      ? '<div class="bsn-atual bsn-atual--admin">' +
          '<span class="bsn-atual__rot">Senha atual</span>' +
          '<code class="bsn-atual__val" id="bsnAdminAtual" data-oculta="1">••••••••</code>' +
          '<button type="button" class="bsn-mini" id="bsnAdminMostrar"' + (textoAdmin ? "" : " disabled") + ">Mostrar</button>" +
          '<button type="button" class="bsn-mini" id="bsnAdminCopiar"' + (textoAdmin ? "" : " disabled") + ">Copiar</button>" +
          '<button type="button" class="bsn-mini bsn-mini--perigo" id="bsnAdminRemover">Remover</button>' +
          (_quandoAdmin(e.admin, !!textoAdmin) ? '<span class="bsn-atual__quando">' + _quandoAdmin(e.admin, !!textoAdmin) + "</span>" : "") +
        "</div>"
      : "";

    var blocoAtual = colab
      ? '<div class="bsn-atual">' +
          '<span class="bsn-atual__rot">Senha atual</span>' +
          '<code class="bsn-atual__val" id="bsnColabAtual" data-oculta="1">••••••••</code>' +
          '<button type="button" class="bsn-mini" id="bsnMostrar">Mostrar</button>' +
          '<button type="button" class="bsn-mini" id="bsnCopiar">Copiar</button>' +
          '<button type="button" class="bsn-mini bsn-mini--perigo" id="bsnRemoverColab">Remover</button>' +
          (colab.definidaEm
            ? '<span class="bsn-atual__quando">' +
                (colab.origem === "auto" ? "Gerada automaticamente em " : "Definida em ") + _esc(_quando(colab.definidaEm)) +
              "</span>"
            : "") +
        "</div>"
      : "";

    var htmlTopo =
        '<div class="bsn-topo">' +
          '<span class="bsn-topo__ico">' + ICO_CHAVE + "</span>" +
          '<div class="bsn-topo__txt">' +
            '<div class="modal-title" id="bsnTitulo">Senhas de acesso</div>' +
            '<div class="modal-subtitle bsn-topo__sub">As senhas do Administrador e do Colaborador e os módulos ' +
              "que pedem senha ao abrir.</div>" +
          "</div>" +
          '<button type="button" class="bsn-x" id="bsnX" title="Fechar" aria-label="Fechar">' + ICO_X + "</button>" +
        "</div>";

    var htmlCorpo =
        '<div class="bsn-corpo">' +
          '<div class="bsn-coluna">' +
          '<section class="bsn-bloco" id="bsnBlocoAdmin">' +
            '<div class="bsn-bloco__topo"><span class="bsn-bloco__tit">Senha do Administrador</span>' + seloAdmin + "</div>" +
            '<p class="bsn-bloco__txt">' +
              (temAdmin
                ? "Acesso completo. É a única que abre esta tela. Deixe em branco para manter a atual."
                : "Crie a senha do Administrador para ligar a proteção dos módulos.") +
            "</p>" +
            blocoAtualAdmin +
            '<div class="bsn-campos">' +
              '<div class="field-group"><label for="bsnAdminNova">' + (temAdmin ? "Nova senha" : "Senha") + "</label>" +
                '<input type="password" id="bsnAdminNova" class="input-field" autocomplete="new-password" /></div>' +
              '<div class="field-group"><label for="bsnAdminConf">Confirmar senha</label>' +
                '<input type="password" id="bsnAdminConf" class="input-field" autocomplete="new-password" /></div>' +
            "</div>" +
            '<small class="bsn-dica">Mínimo de ' + MIN_SENHA + " caracteres.</small>" +
            _htmlPerguntas("bsnResp_", respondidas, temAdmin && respondidas.length >= MIN_PERGUNTAS) +
          "</section>" +

          '<section class="bsn-bloco" id="bsnBlocoColab">' +
            '<div class="bsn-bloco__topo"><span class="bsn-bloco__tit">Senha do Colaborador</span>' + seloColab + "</div>" +
            '<p class="bsn-bloco__txt">Para quem ajuda no dia a dia: abre os módulos protegidos, mas não esta tela. ' +
              "Pode ser trocada quantas vezes for preciso.</p>" +
            blocoAtual +
            '<div class="field-group bsn-colab-nova">' +
              '<label for="bsnColabNova">' + (colab ? "Nova senha do colaborador" : "Senha do colaborador") + "</label>" +
              '<div class="bsn-linha">' +
                '<input type="text" id="bsnColabNova" class="input-field" autocomplete="off" spellcheck="false" ' +
                  'placeholder="' + (colab ? "Deixe em branco para manter a atual" : "Digite ou gere uma senha") + '" />' +
                '<button type="button" class="btn-secondary bsn-gerar" id="bsnGerar">Gerar</button>' +
              "</div>" +
              '<small class="bsn-dica">Mínimo de ' + MIN_COLABORADOR + " caracteres. Diferente da senha do Administrador.</small>" +
            "</div>" +
            '<label class="bsn-check">' +
              '<input type="checkbox" id="bsnAuto"' + (e.gerarAoAbrir ? " checked" : "") + " />" +
              '<span class="bsn-check__txt">' +
                "<strong>Gerar automaticamente uma nova senha do colaborador sempre que o aplicativo abrir</strong>" +
                "<small>Marcado: a cada abertura do Bapell uma senha nova substitui a anterior — é aqui que você vê qual é. " +
                "Desmarcado: a senha atual continua valendo.</small>" +
              "</span>" +
            "</label>" +
          "</section>" +
          "</div>" +

          '<div class="bsn-coluna">' +
          '<section class="bsn-bloco bsn-bloco--modulos" id="bsnBlocoModulos">' +
            '<div class="bsn-bloco__topo"><span class="bsn-bloco__tit">Módulos protegidos</span>' +
              '<span class="bsn-selo" id="bsnSeloModulos"></span></div>' +
            '<p class="bsn-bloco__txt"><strong>Bloqueado:</strong> pede a senha do Administrador ou a do Colaborador ao abrir. ' +
              "<strong>Desbloqueado:</strong> abre direto.</p>" +
            '<div class="bsn-modulos">' + listaModulos + "</div>" +
            (temAdmin
              ? ""
              : '<small class="bsn-dica">Os bloqueios passam a valer quando a senha do Administrador for criada.</small>') +
          "</section>" +
          "</div>" +
        "</div>";

    // Na tela, o "Cancelar" e o "Salvar" ficam na barra fixa (abaixo); o
    // rodapé do quadro fica só com o "Remover proteção".
    var htmlRodape =
        '<div class="bsn-rodape' + (naTela && !temAdmin ? " bsn-rodape--vazio" : "") + '">' +
          (temAdmin ? '<button type="button" class="bsn-remover" id="bsnRemoverTudo">Remover proteção</button>' : "<span></span>") +
          (naTela
            ? ""
            : '<div class="bsn-rodape__dir">' +
                '<button type="button" class="btn-secondary" id="bsnCancelar">Cancelar</button>' +
                '<button type="button" class="btn-primary" id="bsnSalvar">Salvar</button>' +
              "</div>") +
        "</div>";

    var raiz;
    var barra = null;
    var raizBotoes = null;
    if (naTela) {
      raiz = document.createElement("div");
      raiz.className = "bsn-tela";
      raiz.id = "bsnGerenciadorTela";
      raiz.innerHTML = htmlCorpo + htmlRodape;
      destino.innerHTML = "";
      destino.appendChild(raiz);

      // A "Senha nos botões", no quadro dela, salva junto.
      if (destinoBotoes) {
        raizBotoes = document.createElement("div");
        raizBotoes.className = "bsn-botoes";
        raizBotoes.id = "bsnBotoes";
        raizBotoes.innerHTML = _htmlBotoes(_lerBotoes(), temAdmin);
        destinoBotoes.innerHTML = "";
        destinoBotoes.appendChild(raizBotoes);
      }

      // Barra fixa do canto inferior direito: direto no <body> (um quadro
      // animado em volta prenderia o position:fixed dentro dele).
      var velha = document.getElementById("bsnBarraSalvar");
      if (velha) velha.remove();
      barra = document.createElement("div");
      barra.id = "bsnBarraSalvar";
      barra.className = "action-bar barra-salvar";
      barra.setAttribute("role", "region");
      barra.setAttribute("aria-label", "Salvar ou cancelar");
      barra.innerHTML =
        '<span class="action-bar-info" id="bsnBarraInfo"></span>' +
        '<div class="action-bar-btns">' +
          '<button type="button" class="btn-secondary" id="bsnCancelar">Cancelar</button>' +
          '<button type="button" class="btn-primary" id="bsnSalvar">✓ Salvar</button>' +
        "</div>";
      document.body.appendChild(barra);
      document.body.classList.add("tem-barra-salvar");
    } else {
      raiz = document.createElement("div");
      raiz.className = "modal-overlay bsn-geren";
      raiz.id = "bsnGerenciador";
      raiz.setAttribute("role", "dialog");
      raiz.setAttribute("aria-modal", "true");
      raiz.setAttribute("aria-labelledby", "bsnTitulo");
      raiz.innerHTML = '<div class="modal bsn-modal">' + htmlTopo + htmlCorpo + htmlRodape + "</div>";
      document.body.appendChild(raiz);
    }

    var $ = function (sel) {
      return raiz.querySelector(sel) || (barra && barra.querySelector(sel)) || (raizBotoes && raizBotoes.querySelector(sel));
    };
    var adminNova = $("#bsnAdminNova");
    var adminConf = $("#bsnAdminConf");
    var colabNova = $("#bsnColabNova");
    var chkAuto = $("#bsnAuto");
    var btnSalvar = $("#bsnSalvar");
    _ligarPerguntas(raiz, respondidas);

    var alterado = false;
    if (naTela) {
      // Alteração ainda não salva: a tela não redesenha por cima dela
      // quando as senhas mudam em outra aba (usuarios.js) — e a barra avisa.
      var marcarAlterado = function () {
        alterado = true;
        raiz.setAttribute("data-alterado", "1");
        var info = barra && barra.querySelector("#bsnBarraInfo");
        if (info) {
          info.textContent = "● Alterações não salvas";
          info.style.color = "var(--clr-accent)";
        }
      };
      raiz.addEventListener("input", marcarAlterado);
      raiz.addEventListener("change", marcarAlterado);
      if (raizBotoes) _ligarBotoes(raizBotoes, marcarAlterado);
    }

    // Na janela: fecha. Na tela: não há o que fechar.
    function fechar() {
      if (naTela) return;
      document.removeEventListener("keydown", tecla);
      raiz.remove();
      try { if (focoAntes && focoAntes.isConnected) focoAntes.focus({ preventScroll: true }); } catch (err) {}
    }
    // Depois de salvar ou remover: na janela, fecha; na tela, redesenha
    // com o estado novo.
    function concluir() {
      if (naTela) _mostrarGerenciador(destino);
      else fechar();
    }
    // Remover a senha do colaborador: redesenha nos dois casos.
    function recomecar() {
      if (naTela) { _mostrarGerenciador(destino); return; }
      fechar();
      _mostrarGerenciador();
    }
    function tecla(ev) {
      // As janelas por cima (confirmações) param o Esc na captura.
      if (ev.key === "Escape" && document.getElementById("bsnGerenciador") && !document.querySelector(".bsn-camada, .bm-overlay")) fechar();
    }
    if (naTela) {
      // "Cancelar": volta ao que está salvo (com alteração, pergunta antes).
      $("#bsnCancelar").addEventListener("click", function () {
        if (!alterado) {
          _mostrarGerenciador(destino);
          _avisar("Não há alterações para cancelar.", "default", 2600);
          return;
        }
        _confirmar({
          titulo: "Cancelar as alterações?",
          texto: "O que foi alterado nas senhas, nos módulos e nos botões e ainda não foi salvo volta a ser como estava.",
          botao: "Cancelar alterações",
          perigo: true,
        }).then(function (sim) {
          if (!sim) return;
          _mostrarGerenciador(destino);
          _avisar("Alterações canceladas: voltou o que estava salvo.", "success", 2800);
        });
      });
    } else {
      document.addEventListener("keydown", tecla);
      $("#bsnX").addEventListener("click", fechar);
      $("#bsnCancelar").addEventListener("click", fechar);
      raiz.addEventListener("mousedown", function (ev) { if (ev.target === raiz) fechar(); });
    }

    $("#bsnGerar").addEventListener("click", function () {
      colabNova.value = gerarSenha();
      colabNova.focus();
      colabNova.select();
      if (naTela) raiz.dispatchEvent(new Event("input"));
    });

    // Ligar a opção sem nenhuma senha de colaborador: já sugere uma, para
    // que exista uma senha valendo desde agora (e visível antes de salvar).
    chkAuto.addEventListener("change", function () {
      if (chkAuto.checked && !colab && !colabNova.value) colabNova.value = gerarSenha();
    });

    // Switches dos módulos: o texto, o cadeado e a contagem acompanham.
    var switches = Array.prototype.slice.call(raiz.querySelectorAll(".bsn-modulo .bsn-switch__input"));
    var seloModulos = $("#bsnSeloModulos");
    function contarBloqueados() {
      var n = switches.filter(function (s) { return s.checked; }).length;
      seloModulos.textContent = n === 0 ? "Nenhum bloqueado" : n === 1 ? "1 bloqueado" : n + " bloqueados";
      seloModulos.classList.toggle("bsn-selo--ok", n > 0);
    }
    switches.forEach(function (s) {
      s.addEventListener("change", function () {
        var linha = s.closest(".bsn-modulo");
        linha.classList.toggle("bsn-modulo--bloq", s.checked);
        linha.querySelector(".bsn-modulo__estado").textContent = s.checked ? "Bloqueado" : "Desbloqueado";
        linha.querySelector(".bsn-modulo__ico").innerHTML = s.checked ? ICO_CADEADO_MINI : ICO_ABERTO_MINI;
        contarBloqueados();
      });
    });
    contarBloqueados();

    // A senha atual do Administrador: Mostrar, Copiar e Remover.
    if (temAdmin) {
      var campoAdmin = $("#bsnAdminAtual");
      var btnMostrarAdmin = $("#bsnAdminMostrar");
      if (textoAdmin) {
        btnMostrarAdmin.addEventListener("click", function () {
          var oculta = campoAdmin.getAttribute("data-oculta") === "1";
          campoAdmin.textContent = oculta ? textoAdmin : "••••••••";
          campoAdmin.setAttribute("data-oculta", oculta ? "0" : "1");
          btnMostrarAdmin.textContent = oculta ? "Ocultar" : "Mostrar";
        });
        $("#bsnAdminCopiar").addEventListener("click", function () {
          _copiar(textoAdmin).then(function (ok) {
            _avisar(ok ? "Senha do Administrador copiada." : "Não foi possível copiar.", ok ? "success" : "error");
          });
        });
      } else {
        btnMostrarAdmin.title = "Disponível depois de definir a senha de novo";
        $("#bsnAdminCopiar").title = "Disponível depois de definir a senha de novo";
      }
      $("#bsnAdminRemover").addEventListener("click", function () {
        _removerProtecao("Remover a senha do Administrador?");
      });
    }

    if (colab) {
      var campoAtual = $("#bsnColabAtual");
      $("#bsnMostrar").addEventListener("click", function () {
        var oculta = campoAtual.getAttribute("data-oculta") === "1";
        campoAtual.textContent = oculta ? colab.senha : "••••••••";
        campoAtual.setAttribute("data-oculta", oculta ? "0" : "1");
        this.textContent = oculta ? "Ocultar" : "Mostrar";
      });
      $("#bsnCopiar").addEventListener("click", function () {
        _copiar(colab.senha).then(function (ok) {
          _avisar(ok ? "Senha do colaborador copiada." : "Não foi possível copiar.", ok ? "success" : "error");
        });
      });
      $("#bsnRemoverColab").addEventListener("click", function () {
        _confirmar({
          titulo: "Remover a senha do colaborador?",
          texto: "Os módulos protegidos passam a abrir só com a senha do Administrador." +
            (e.gerarAoAbrir ? " Com a geração automática ligada, uma nova senha será criada na próxima abertura do app." : ""),
          botao: "Remover senha",
          perigo: true,
        }).then(function (sim) {
          if (!sim) return;
          var atual = _ler();
          atual.colaborador = null;
          if (_gravar(atual)) {
            _avisar("Senha do colaborador removida.", "success");
            recomecar();
          }
        });
      });
    }

    // Remover a senha do Administrador = remover a proteção (sem ela, a do
    // Colaborador também sai). As perguntas de segurança e as escolhas dos
    // módulos e dos botões ficam guardadas para quando houver senha de novo.
    function _removerProtecao(titulo) {
      _confirmar({
        titulo: titulo || "Remover a proteção por senha?",
        texto: "As senhas do Administrador e do Colaborador serão apagadas: todos os módulos passam a abrir sem senha e " +
          "os botões escolhidos em Senha nos botões deixam de pedir usuário e senha. A escolha dos módulos e dos botões " +
          "fica guardada para quando você criar uma senha de novo.",
        botao: "Remover proteção",
        perigo: true,
      }).then(function (sim) {
        if (!sim) return;
        var antes = _ler();
        var semProtecao = _vazio();
        // Guarda QUAL senha foi removida: uma cópia dela que sobrar no
        // precifiq_dre não traz a proteção de volta.
        semProtecao.removida = antes.admin ? antes.admin.hash : null;
        semProtecao.modulos = antes.modulos;
        semProtecao.recuperacao = antes.recuperacao;
        if (_gravar(semProtecao)) {
          _avisar("Proteção removida: os módulos abrem sem senha.", "success", 4200);
          concluir();
        }
      });
    }

    var btnRemoverTudo = $("#bsnRemoverTudo");
    if (btnRemoverTudo) {
      btnRemoverTudo.addEventListener("click", function () { _removerProtecao(); });
    }

    btnSalvar.addEventListener("click", function () {
      if (btnSalvar.disabled) return;
      var novaAdmin = adminNova.value;
      var confAdmin = adminConf.value;
      var novaColab = colabNova.value;

      if (!temAdmin && !novaAdmin) {
        _avisar("Crie a senha do Administrador para ligar a proteção.", "warning");
        _marcarCampo(adminNova);
        if (!confAdmin) _marcarCampo(adminConf, null, true);
        return;
      }
      if (novaAdmin || confAdmin) {
        var erroAdmin = validarSenhaAdmin(novaAdmin);
        if (erroAdmin) { _avisar(erroAdmin, "warning", 4200); _marcarCampo(adminNova); return; }
        if (novaAdmin !== confAdmin) { _avisar("A confirmação não confere com a nova senha do Administrador.", "error"); _marcarCampo(adminConf); return; }
      }
      if (novaColab) {
        var erroColab = validarSenhaColaborador(novaColab);
        if (erroColab) { _avisar(erroColab, "warning", 4200); _marcarCampo(colabNova); return; }
        if (novaAdmin && novaColab === novaAdmin) {
          _avisar("A senha do Colaborador precisa ser diferente da senha do Administrador.", "error", 4200);
          _marcarCampo(colabNova);
          return;
        }
      }

      // Perguntas de segurança: com a senha do Administrador, pelo menos 3
      // respondidas (as já guardadas contam). Conferidas depois das senhas:
      // um erro de senha aparece primeiro.
      var caixaPerguntas = raiz.querySelector(".bsn-perguntas");
      var lidoPerg = _lerPerguntas(caixaPerguntas, respondidas);

      btnSalvar.disabled = true;
      var hashNovoAdmin = novaAdmin ? _hash(novaAdmin) : Promise.resolve(null);
      var hashColab = novaColab ? _hash(novaColab) : Promise.resolve(null);
      Promise.all([hashNovoAdmin, hashColab]).then(function (h) {
        var atual = _ler();
        var hashAdminFinal = h[0] || (atual.admin && atual.admin.hash);
        if (h[1] && h[1] === hashAdminFinal) {
          _avisar("A senha do Colaborador precisa ser diferente da senha do Administrador.", "error", 4200);
          btnSalvar.disabled = false;
          _marcarCampo(colabNova);
          return;
        }
        // A nova senha do Administrador também não pode ser a do colaborador
        // que continua valendo: quem conhece a do colaborador passaria a ter
        // acesso de Administrador.
        if (h[0] && !novaColab && atual.colaborador && atual.colaborador.senha === novaAdmin) {
          _avisar("A nova senha do Administrador precisa ser diferente da senha do Colaborador.", "error", 4200);
          btnSalvar.disabled = false;
          _marcarCampo(adminNova);
          return;
        }
        var vPerg = _validarPerguntas(lidoPerg);
        if (!vPerg.ok) {
          btnSalvar.disabled = false;
          _abrirPerguntas(caixaPerguntas);
          _avisar(vPerg.msg, "warning", 6500);
          if (vPerg.campo) _marcarCampo(vPerg.campo);
          else if (caixaPerguntas) { try { caixaPerguntas.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (err) {} }
          return;
        }
        return _hashRespostas(lidoPerg.respostas).then(function (hr) { gravarTudo(h, hr); });
      }).catch(function (err) {
        _registrarFalha("falha ao salvar as senhas", err);
        _avisar("Não foi possível salvar as senhas.", "error");
        btnSalvar.disabled = false;
      });

      // Grava tudo de uma vez: as senhas, as respostas, os módulos e os botões.
      function gravarTudo(h, hr) {
        var atual = _ler();
        if (h[0]) {
          atual.admin = _novoAdmin(h[0], novaAdmin, "manual");
          atual.removida = null;
        }
        if (hr) atual.recuperacao = _juntarRespostas(atual.recuperacao, hr);
        if (novaColab) {
          atual.colaborador = { senha: novaColab, definidaEm: Date.now(), origem: "manual" };
        }
        atual.gerarAoAbrir = chkAuto.checked;
        if (atual.gerarAoAbrir && !atual.colaborador) {
          atual.colaborador = { senha: gerarSenha(), definidaEm: Date.now(), origem: "auto" };
        }
        var mapa = {};
        switches.forEach(function (s) { mapa[s.getAttribute("data-modulo")] = s.checked; });
        atual.modulos = mapa;
        var nBloq = switches.filter(function (s) { return s.checked; }).length;
        var cfgBotoes = raizBotoes ? _lerBotoesDoForm(raizBotoes) : null;
        if (_gravar(atual) && (!cfgBotoes || _gravarBotoes(cfgBotoes))) {
          var msg;
          if (!nBloq) msg = temAdmin ? "Alterações salvas. Nenhum módulo pede senha agora." : "Senhas criadas. Nenhum módulo está bloqueado.";
          else msg = temAdmin ? "Alterações salvas." : "Proteção ligada: os módulos bloqueados passam a pedir senha.";
          _avisar(msg, "success", 3600);
          concluir();
        } else {
          btnSalvar.disabled = false;
        }
      }
    });

    // Na janela, o foco já vai para a senha; na tela, não rouba o foco.
    if (!naTela) {
      setTimeout(function () {
        try { (temAdmin ? colabNova : adminNova).focus(); } catch (err) {}
      }, 60);
    }
  }

  // ══════════════════════════════════════════
  //  SENHA NOS BOTÕES
  //  O Administrador escolhe, tela a tela, os botões que pedem usuário e
  //  senha antes de agir. Quem clica escolhe o próprio nome (os usuários
  //  com senha) ou "Administrador" e digita a senha; o clique só segue
  //  com a senha certa.
  // ══════════════════════════════════════════
  var CHAVE_BOTOES = "precifiq_senha_botoes";
  var SESSAO_ULTIMO = "precifiq_botoes_ultimo"; // quem confirmou por último
  var VALOR_ADMIN = "__admin__";

  // As telas e os botões que podem pedir senha. id: a chave gravada (não
  // muda); sel: o seletor do botão na tela (vale para todos os iguais,
  // como o "Excluir" de cada linha). A ordem é a da lista em Usuários e
  // Senhas. pedir (opcional): para o botão que abre e fecha um painel,
  // diz se ESTE clique pede a senha — só o que abre; fechar passa direto.
  var TELAS_BOTOES = [
    { pagina: "produto.html", nome: "Produtos", botoes: [
      { id: "produto:salvar", nome: "Salvar", sel: "#btnSalvar" },
      { id: "produto:add-kit", nome: "Adicionar Kit", sel: "#btnAddKit" },
      { id: "produto:excluir-kit", nome: "Excluir um kit (✕ do kit)", sel: ".btn-remove-kit" },
      { id: "produto:add-imagem", nome: "Adicionar imagem", sel: ".carousel-add, .gallery-slot-add" },
      { id: "produto:remover-imagem", nome: "Remover imagem", sel: ".carousel-remove" },
      { id: "produto:add-campos", nome: "Adicionar Campos", sel: ".btn-add-campos-unico" },
      { id: "produto:config-campos", nome: "Configurar Campos", sel: ".btn-editar-campos" },
      { id: "produto:add-secao", nome: "Adicionar Seção", sel: "#btnAddSecao" },
      { id: "produto:ordenar", nome: "Ordenar Posição", sel: "#btnOrdenarSecoes" },
    ] },
    { pagina: "plataforma.html", nome: "Lista de produtos (plataforma)", botoes: [
      { id: "plat:criar-produto", nome: "Criar Produto", sel: "#btnNovoProduto" },
      { id: "plat:criar-kit", nome: "Criar Kit", sel: "#btnCriarKit" },
      { id: "plat:duplicar", nome: "Duplicar um produto", sel: ".duplicate-btn" },
      { id: "plat:clonar", nome: "Clonar um produto para outra plataforma", sel: ".clone-btn" },
      { id: "plat:excluir", nome: "Excluir um produto", sel: ".delete-btn" },
      { id: "plat:massa", nome: "Opções Em Massa (clonar, duplicar, excluir)", sel: "#btnClonarMassaTop",
        pedir: function () { return _painelFechado("massaMenu"); } },
      { id: "plat:imagens", nome: "Gerenciar Imagens", sel: "#btnGerenciarImagens" },
      { id: "plat:importar", nome: "Adicionar pela Planilha (cadastrar os produtos)", sel: "#ipCadastrar" },
      { id: "plat:exportar", nome: "Exportar para Planilha (gerar o arquivo)", sel: "#epExportar" },
    ] },
    { pagina: "index.html", nome: "Painel inicial", botoes: [
      { id: "index:add-plataforma", nome: "Adicionar Plataforma", sel: "#btnAddPlatform, #btnCadastrarPrimeira" },
      { id: "index:editar-plataforma", nome: "Editar uma plataforma", sel: '[data-action="edit"]' },
      { id: "index:ocultar-plataforma", nome: "Ocultar uma plataforma", sel: '[data-action="toggle-hide"]' },
      { id: "index:excluir-plataforma", nome: "Excluir uma plataforma", sel: '[data-action="delete"]' },
      // O mesmo botão vira "Concluir ordenação": só pede ao começar.
      { id: "index:reordenar", nome: "Reordenar módulos", sel: "#btnReorderModules",
        pedir: function (el) { return !el.classList.contains("ativo"); } },
      { id: "index:modulos-ocultos", nome: "Módulos ocultos", sel: "#btnHideModules",
        pedir: function () { return _painelFechado("hiddenModulesSection"); } },
      { id: "index:lojas-ocultas", nome: "Lojas Ocultas", sel: "#btnHiddenPlatforms",
        pedir: function () { return _painelFechado("hiddenSection"); } },
    ] },
    { pagina: "acoes-massa.html", nome: "Ações em Massa", botoes: [
      { id: "massa:salvar", nome: "Salvar (aplicar as alterações)", sel: "#btnAplicar" },
    ] },
    { pagina: "registro-vendas.html", nome: "Registro de Vendas", botoes: [
      { id: "rv:salvar", nome: "Salvar venda", sel: "#btnSalvarVenda" },
      { id: "rv:pdf", nome: "Gerar PDF (orçamento)", sel: "#btnGerarPDF" },
      { id: "rv:limpar", nome: "Limpar", sel: "#btnLimparVenda" },
      { id: "rv:add-produto", nome: "Adicionar produto", sel: "#btnAddProduto" },
      { id: "rv:salvar-edicao", nome: "Salvar alterações de uma venda", sel: "#evSalvar" },
      { id: "rv:pdf-venda", nome: "PDF de uma venda lançada", sel: ".rv-mini-btn[data-pdf]" },
      { id: "rv:excluir", nome: "Excluir uma venda", sel: ".rv-mini-btn[data-del]" },
    ] },
    { pagina: "vendas.html", nome: "Informações de Venda", botoes: [
      { id: "vendas:salvar", nome: "Salvar", sel: "#btnSalvarVendas" },
      { id: "vendas:add-desconto", nome: "Adicionar regra de desconto", sel: "#btnAddDesconto" },
      { id: "vendas:add-envio", nome: "Adicionar Forma de Envio", sel: "#btnClonarModalidade" },
      { id: "vendas:config", nome: "Configurar Campos", sel: "#btnConfigCampos" },
      { id: "vendas:add-secao", nome: "Adicionar Seção", sel: "#btnAddSecao" },
      { id: "vendas:ordenar", nome: "Ordenar Posição", sel: "#btnOrdenarSecoes" },
    ] },
    { pagina: "empresa.html", nome: "Dados da Empresa", botoes: [
      { id: "empresa:salvar", nome: "Salvar", sel: "#btnSalvarEmpresa" },
      { id: "empresa:add", nome: "Adicionar Empresa", sel: "#btnAddEmpresa, #btnAddEmpresaEmpty" },
      { id: "empresa:excluir", nome: "Excluir empresa", sel: "#btnExcluirEmpresa" },
      { id: "empresa:documentos", nome: "Documentos", sel: "#btnDocumentos" },
      { id: "empresa:add-socio", nome: "Adicionar Sócio", sel: "#btnAddSocio" },
      { id: "empresa:config", nome: "Configurar Campos", sel: "#btnConfigCampos" },
      { id: "empresa:add-secao", nome: "Adicionar Seção", sel: "#btnAddSecao" },
      { id: "empresa:ordenar", nome: "Ordenar Posição", sel: "#btnOrdenarSecoes" },
    ] },
    { pagina: "financeiro.html", nome: "Controle Financeiro", botoes: [
      { id: "fin:entrada", nome: "Lançar Entrada", sel: "#btnLancarVenda" },
      { id: "fin:saida", nome: "Lançar Saída", sel: "#btnLancarDespesa" },
      { id: "fin:editar", nome: "Editar um lançamento (extrato)", sel: "#tabela-corpo [data-edit]" },
      { id: "fin:duplicar", nome: "Duplicar um lançamento (extrato)", sel: "#tabela-corpo [data-dup]" },
      { id: "fin:excluir", nome: "Excluir um lançamento (extrato)", sel: "#tabela-corpo [data-del]" },
      { id: "fin:pdf", nome: "Exportar PDF", sel: "#btnExportar" },
      { id: "fin:planilha", nome: "Planilha do extrato", sel: "#btnExportarExtrato" },
      { id: "fin:meta", nome: "Definir meta", sel: "#btnDefinirMeta" },
      { id: "fin:add-campos", nome: "Adicionar Campos", sel: "#btnAddCamposFin" },
      { id: "fin:config", nome: "Configurar Campos", sel: "#btnConfigCampos" },
      { id: "fin:add-secao", nome: "Adicionar Seção", sel: "#btnAddSecao" },
      { id: "fin:add-empresa", nome: "Adicionar empresa", sel: "#btnAddEmpresa, #btnAddEmpresaVazio" },
      { id: "fin:excluir-empresa", nome: "Excluir empresa", sel: "#btnExcluirEmpresa" },
    ] },
    { pagina: "nf.html", nome: "Notas Fiscais", botoes: [
      { id: "nf:add", nome: "Adicionar NF", sel: "#btnAddNf" },
      { id: "nf:editar", nome: "Editar as informações de uma nota", sel: "[data-editar]" },
      { id: "nf:excluir", nome: "Excluir uma nota", sel: "[data-excluir]" },
      { id: "nf:add-empresa", nome: "Adicionar Empresa", sel: "#btnAddEmpresa" },
    ] },
    { pagina: "vendas-import.html", nome: "Processador de Planilhas", botoes: [
      { id: "vi:processar", nome: "Processar Planilha", sel: "#viProcessar" },
      { id: "vi:salvar", nome: "Salvar Importação", sel: "#viSalvar" },
      { id: "vi:exportar", nome: "Exportar para o Financeiro", sel: "#viExportar" },
      { id: "vi:salvar-exportacao", nome: "Salvar Exportação", sel: "#viExpConfirmar" },
      { id: "vi:add-regra", nome: "Adicionar Campo de Cálculo", sel: "#viAddRegra" },
      { id: "vi:limpar", nome: "Limpar", sel: "#viLimpar" },
      { id: "vi:excluir", nome: "Excluir uma importação salva", sel: ".vi-hist-excluir" },
    ] },
    { pagina: "ean.html", nome: "Gerador de EAN", botoes: [
      { id: "ean:gerar", nome: "Gerar EAN", sel: "#btnGerarEan" },
      { id: "ean:ocultar", nome: "Ocultar um EAN", sel: '.ean-menu-item[data-acao="ocultar"]' },
      { id: "ean:excluir", nome: "Excluir um EAN", sel: '.ean-menu-item[data-acao="excluir"]' },
      { id: "ean:add-empresa", nome: "Adicionar Empresa", sel: "#btnAddEmpresa" },
    ] },
    { pagina: "devolucoes.html", nome: "Gestor de Devoluções", botoes: [
      { id: "dev:add", nome: "Adicionar devolução", sel: "#btnAddDevolucao" },
      { id: "dev:salvar", nome: "Salvar devolução (nova ou editada)", sel: "#mdSalvar" },
      { id: "dev:editar", nome: "Editar uma devolução", sel: "#devCorpo [data-editar]" },
      { id: "dev:excluir", nome: "Excluir uma devolução", sel: "#devCorpo [data-excluir]" },
      { id: "dev:financeiro", nome: "Lançar no Controle Financeiro (uma devolução)", sel: "#devCorpo [data-fin]" },
      { id: "dev:exportar-lote", nome: "Lançar pendentes no Controle Financeiro", sel: "#btnExportarLote" },
      { id: "dev:add-empresa", nome: "Adicionar Empresa", sel: "#btnAddEmpresa" },
      { id: "dev:futura-salvar", nome: "Registrar devolução futura (nova ou editada)", sel: "#fdSalvar" },
      { id: "dev:futura-lancar", nome: "Lançar uma devolução futura", sel: "#dfCorpo [data-lancar]" },
      { id: "dev:futura-editar", nome: "Editar uma devolução futura", sel: "#dfCorpo [data-editar-fut]" },
      { id: "dev:futura-excluir", nome: "Excluir uma devolução futura", sel: "#dfCorpo [data-excluir-fut]" },
      { id: "dev:futura-lembrete", nome: "Criar lembrete de uma devolução futura", sel: "#dfCorpo [data-lembrete]" },
    ] },
    { pagina: "lembretes.html", nome: "Lembretes", botoes: [
      { id: "lem:novo", nome: "Novo lembrete", sel: "#btnNovo" },
      { id: "lem:salvar", nome: "Salvar lembrete", sel: "#lemSalvar" },
      { id: "lem:editar", nome: "Editar um lembrete", sel: '.lem-menu-item[data-a="editar"], #lemViewEditar' },
      { id: "lem:concluir", nome: "Concluir um lembrete", sel: '.lem-menu-item[data-a="concluir"], #lemViewConcluir' },
      { id: "lem:excluir", nome: "Excluir um lembrete", sel: '.lem-menu-item[data-a="excluir"]' },
    ] },
    { pagina: "ajuda.html", nome: "Central de Ajuda", botoes: [
      { id: "ajuda:importar", nome: "Importar Banco de Dados (restaurar backup)", sel: "#btnImportarBackup" },
      { id: "ajuda:exportar", nome: "Exportar Banco de Dados (backup)", sel: "#btnExportarBackup" },
      { id: "ajuda:limpar-erros", nome: "Limpar histórico de erros", sel: "#btnLimparErros" },
      { id: "ajuda:chave", nome: "Alterar minha chave", sel: "#btnAlterarChave" },
      { id: "ajuda:inicializar", nome: "Abrir ao inicializar", sel: "#btnInicializar" },
    ] },
  ];

  var ICO_SETA =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  /** O painel (menu, lista lateral) do botão está fechado agora? */
  function _painelFechado(id) {
    var el = document.getElementById(id);
    if (!el) return true;
    try { return el.style.display === "none" || window.getComputedStyle(el).display === "none"; }
    catch (e) { return true; }
  }

  // Cliques que não acionam o botão em que estão: o "?" de ajuda dentro do
  // "Salvar Importação" só mostra a explicação — não pede senha.
  var IGNORAR_CLIQUE = ".vi-ajuda-mini, [data-sem-senha]";

  function _botaoPorId(id) {
    for (var i = 0; i < TELAS_BOTOES.length; i++) {
      var lista = TELAS_BOTOES[i].botoes;
      for (var j = 0; j < lista.length; j++) if (lista[j].id === id) return lista[j];
    }
    return null;
  }

  /** A escolha guardada: { ativo, botoes: { id: true } } (só ids conhecidos). */
  function _lerBotoes() {
    var cfg = { ativo: false, botoes: {} };
    try {
      var o = JSON.parse(localStorage.getItem(CHAVE_BOTOES));
      if (o && typeof o === "object") {
        cfg.ativo = !!o.ativo;
        if (o.botoes && typeof o.botoes === "object") {
          Object.keys(o.botoes).forEach(function (k) {
            if (o.botoes[k] === true && _botaoPorId(k)) cfg.botoes[k] = true;
          });
        }
      }
    } catch (e) {}
    return cfg;
  }

  function _gravarBotoes(cfg) {
    try {
      localStorage.setItem(CHAVE_BOTOES, JSON.stringify({ versao: 1, ativo: !!cfg.ativo, botoes: cfg.botoes || {} }));
      return true;
    } catch (err) {
      _registrarFalha("falha ao gravar a senha nos botões", err);
      _avisar("Não foi possível salvar os botões que pedem senha. Verifique o espaço em disco.", "error", 6000);
      return false;
    }
  }

  /**
   * Quem pode confirmar um botão: os usuários com senha e o Master (com a
   * senha do Administrador). O Master aparece com o nome escolhido — se um
   * usuário antigo tiver o mesmo nome, com "(Master)" para diferenciar.
   */
  function _quemConfirma() {
    var lista = listarUsuarios().filter(function (u) { return !u.master && u.temSenha; }).map(function (u) {
      return { valor: u.id, nome: u.nome };
    });
    if (protegido()) {
      var nome = nomeMaster();
      var igual = lista.some(function (q) { return _chaveNome(q.nome) === _chaveNome(nome); });
      lista.push({ valor: VALOR_ADMIN, nome: igual ? nome + " (Master)" : nome });
    }
    return lista;
  }

  function _paginaAtual() {
    var arq = "";
    try { arq = decodeURIComponent(location.pathname.split("/").pop() || "").toLowerCase(); } catch (e) {}
    return arq || "index.html";
  }

  function _telaDosBotoes(pagina) {
    for (var i = 0; i < TELAS_BOTOES.length; i++) if (TELAS_BOTOES[i].pagina === pagina) return TELAS_BOTOES[i];
    return null;
  }

  /** O botão (do catálogo desta tela) pede usuário e senha agora? */
  function botaoProtegido(id) {
    var cfg = _lerBotoes();
    return !!(cfg.ativo && cfg.botoes[id] && protegido());
  }

  /**
   * Para outro caminho que faz o mesmo que um botão marcado (trocar de
   * empresa salva a atual, como o Salvar): pede usuário e senha como o
   * botão pediria. Resolve true na hora quando o botão não pede.
   */
  function exigirBotao(id, opcoes) {
    var item = _botaoPorId(id);
    if (!item || !botaoProtegido(id) || !_quemConfirma().length) return Promise.resolve(true);
    return _pedirUsuarioESenha(item, opcoes);
  }

  // O clique que foi liberado pela senha passa direto (é refeito pelo app).
  var _cliqueLiberado = null;

  /**
   * Na tela da lista, um clique (em captura, antes de qualquer outro) num
   * botão marcado para de seguir e pede usuário e senha; com a senha
   * certa, o mesmo botão é clicado de novo. Atalhos de teclado que
   * apertam o botão (Enter num botão, Ctrl+S que chama o .click()) passam
   * pelo mesmo caminho.
   */
  function _ligarSenhaNosBotoes() {
    var tela = _telaDosBotoes(_paginaAtual());
    if (!tela) return;
    document.addEventListener("click", function (ev) {
      if (_cliqueLiberado) return;
      var alvo = ev.target;
      if (!alvo || typeof alvo.closest !== "function") return;
      try { if (alvo.closest(IGNORAR_CLIQUE)) return; } catch (e) {}
      var cfg = null;
      var item = null;
      var el = null;
      for (var i = 0; i < tela.botoes.length; i++) {
        var b = tela.botoes[i];
        var achado = null;
        try { achado = alvo.closest(b.sel); } catch (e) { achado = null; }
        if (!achado) continue;
        if (!cfg) cfg = _lerBotoes();
        if (!cfg.ativo) return;
        if (!cfg.botoes[b.id]) continue;
        item = b;
        el = achado;
        break;
      }
      if (!item) return;
      // Sem a senha do Administrador, a escolha não vale (como os módulos).
      if (!protegido()) return;
      // Ninguém poderia confirmar: não trava o botão.
      if (!_quemConfirma().length) return;
      // Botão que abre e fecha: fechar (ou concluir) não pede a senha.
      if (typeof item.pedir === "function") {
        var pede = true;
        try { pede = item.pedir(el) !== false; } catch (e) { pede = true; }
        if (!pede) return;
      }
      ev.preventDefault();
      ev.stopImmediatePropagation();
      _pedirUsuarioESenha(item).then(function (ok) {
        if (!ok) return;
        if (!el.isConnected) {
          _avisar('Clique de novo em "' + item.nome + '".', "warning", 3200);
          return;
        }
        _cliqueLiberado = el;
        try { el.click(); } finally { _cliqueLiberado = null; }
      });
    }, true);
  }

  /**
   * A janela "Usuário e senha" de um botão protegido. Resolve true/false.
   * opcoes.motivo: uma frase antes do texto padrão (quando a janela vem de
   * outro caminho que faz o mesmo que o botão — trocar de empresa salva a
   * atual, como o Salvar).
   */
  function _pedirUsuarioESenha(item, opcoes) {
    opcoes = opcoes || {};
    if (document.querySelector(".bsn-botao-senha")) return Promise.resolve(false);
    return new Promise(function (resolve) {
      var quem = _quemConfirma();
      var ultimo = "";
      try { ultimo = sessionStorage.getItem(SESSAO_ULTIMO) || ""; } catch (e) {}
      if (!quem.some(function (q) { return q.valor === ultimo; })) ultimo = quem[0] ? quem[0].valor : "";
      var focoAntes = document.activeElement;
      var fundo = document.createElement("div");
      fundo.className = "modal-overlay bsn-camada bsn-botao-senha";
      fundo.setAttribute("role", "dialog");
      fundo.setAttribute("aria-modal", "true");
      fundo.setAttribute("aria-labelledby", "bsnBotaoTitulo");
      fundo.innerHTML =
        '<div class="modal bsn-portao__modal">' +
          '<div class="modal-title bsn-portao__titulo" id="bsnBotaoTitulo">' + ICO_CADEADO + " Usuário e senha</div>" +
          '<div class="modal-subtitle bsn-portao__sub">' + (opcoes.motivo ? _esc(opcoes.motivo) + " " : "") +
            "O botão <strong>" + _esc(item.nome) + "</strong> pede usuário e senha. " +
            "Escolha quem está fazendo isto e digite a senha.</div>" +
          '<div class="field-group bsn-portao__campo"><label for="bsnBotaoUsuario">Usuário</label>' +
            '<select id="bsnBotaoUsuario" class="input-field">' +
              quem.map(function (q) {
                return '<option value="' + _esc(q.valor) + '"' + (q.valor === ultimo ? " selected" : "") + ">" + _esc(q.nome) + "</option>";
              }).join("") +
            "</select></div>" +
          '<div class="field-group bsn-portao__campo"><label for="bsnBotaoSenha">Senha</label>' +
            '<input type="password" id="bsnBotaoSenha" class="input-field" autocomplete="off" /></div>' +
          '<div id="bsnBotaoAviso" class="bsn-aviso" role="alert" hidden></div>' +
          '<div class="modal-actions bsn-portao__acoes">' +
            '<button type="button" class="btn-secondary" data-r="nao">Cancelar</button>' +
            '<button type="button" class="btn-primary" data-r="sim">Confirmar</button>' +
          "</div>" +
        "</div>";
      document.body.appendChild(fundo);
      // Os cliques nesta janela não chegam à tela de trás. Lá, um clique
      // "fora" fecha o menu aberto (o "⋯" de uma plataforma, as Opções Em
      // Massa): clicar no campo da senha fecharia o menu do botão protegido
      // antes de ele ser refeito, e o Confirmar fecharia o painel que
      // acabou de abrir.
      ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend"].forEach(function (tipo) {
        fundo.addEventListener(tipo, function (e) { e.stopPropagation(); });
      });

      var sel = fundo.querySelector("#bsnBotaoUsuario");
      var input = fundo.querySelector("#bsnBotaoSenha");
      var aviso = fundo.querySelector("#bsnBotaoAviso");
      var btn = fundo.querySelector('[data-r="sim"]');
      var errou = _criarFreio(input, btn, aviso);
      var feito = false;
      function responder(v) {
        if (feito) return;
        feito = true;
        document.removeEventListener("keydown", tecla, true);
        fundo.remove();
        try { if (focoAntes && focoAntes.isConnected) focoAntes.focus({ preventScroll: true }); } catch (e) {}
        resolve(v);
      }
      function tecla(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); responder(false); return; }
        if (e.key === "Tab") _prenderTab(fundo, e);
      }
      function tentar() {
        if (feito || btn.disabled) return;
        var valor = sel.value;
        var senha = input.value;
        if (!senha) {
          aviso.hidden = false;
          aviso.textContent = "Digite a senha.";
          _marcarCampo(input);
          return;
        }
        var conferir = valor === VALOR_ADMIN
          ? verificar(senha).then(function (papel) { return papel === "admin"; })
          : verificarSenhaUsuario(valor, senha).then(function (ok) {
              var u = obterUsuario(valor);
              return !!(ok && u && u.temSenha);
            });
        conferir.then(function (ok) {
          if (feito) return;
          if (ok) {
            try { sessionStorage.setItem(SESSAO_ULTIMO, valor); } catch (e) {}
            responder(true);
          } else {
            errou("Senha incorreta.");
          }
        }, function (err) {
          _registrarFalha("falha ao conferir a senha do botão", err);
          aviso.hidden = false;
          aviso.textContent = "Não foi possível conferir a senha. Tente de novo.";
        });
      }
      document.addEventListener("keydown", tecla, true);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); tentar(); } });
      input.addEventListener("input", function () { if (!aviso.hidden && !btn.disabled) aviso.hidden = true; });
      sel.addEventListener("change", function () { input.value = ""; try { input.focus(); } catch (e) {} });
      btn.addEventListener("click", tentar);
      fundo.querySelector('[data-r="nao"]').addEventListener("click", function () { responder(false); });
      fundo.addEventListener("mousedown", function (e) { if (e.target === fundo) responder(false); });
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
    });
  }

  // ── A escolha dos botões, na tela Usuários e Senhas ──
  function _htmlBotoes(cfg, temAdmin) {
    var comSenha = listarUsuarios().filter(function (u) { return !u.master && u.temSenha; }).length;
    var total = Object.keys(cfg.botoes).length;
    var avisos = "";
    if (!temAdmin) {
      avisos += '<p class="bsn-nota bsn-nota--alerta">Passa a valer quando a senha do Administrador for criada (no quadro acima).</p>';
    }
    if (!comSenha) {
      avisos += '<p class="bsn-nota">Nenhum usuário tem senha: por enquanto, só o Master (<strong>' + _esc(nomeMaster()) +
        "</strong>, com a senha do Administrador) confirma os botões. Para os outros confirmarem, dê uma senha a eles no " +
        "quadro <strong>Usuários</strong>.</p>";
    }
    var telas = TELAS_BOTOES.map(function (t) {
      var marcados = t.botoes.filter(function (b) { return !!cfg.botoes[b.id]; }).length;
      return '<details class="bsn-tela-botoes"' + (marcados ? " open" : "") + ' data-tela="' + _esc(t.pagina) + '">' +
        '<summary class="bsn-tela-botoes__topo">' +
          '<span class="bsn-tela-botoes__nome">' + _esc(t.nome) + "</span>" +
          '<span class="bsn-tela-botoes__qtd' + (marcados ? " bsn-tela-botoes__qtd--on" : "") + '" data-qtd>' +
            marcados + " de " + t.botoes.length + "</span>" +
          '<span class="bsn-tela-botoes__seta">' + ICO_SETA + "</span>" +
        "</summary>" +
        '<div class="bsn-tela-botoes__corpo">' +
          '<div class="bsn-tela-botoes__acoes">' +
            '<button type="button" class="bsn-mini" data-todos="1">Marcar todos</button>' +
            '<button type="button" class="bsn-mini" data-todos="0">Desmarcar todos</button>' +
          "</div>" +
          '<div class="bsn-tela-botoes__lista">' +
            t.botoes.map(function (b) {
              return '<label class="bsn-botao-item"><input type="checkbox" data-botao="' + _esc(b.id) + '"' +
                (cfg.botoes[b.id] ? " checked" : "") + " /><span>" + _esc(b.nome) + "</span></label>";
            }).join("") +
          "</div>" +
        "</div>" +
      "</details>";
    }).join("");
    return '<div class="usr-card__topo bsn-botoes__topo">' +
        '<div class="usr-card__tit">' +
          '<div class="card-title" style="margin:0;"><span class="card-title-dot"></span> Senha nos botões ' +
            '<span class="usr-contador" id="bsnBotoesTotal">' + total + "</span></div>" +
          '<p class="usr-card__sub">Escolha os botões que pedem <strong>usuário e senha</strong> antes de agir — o Salvar dos ' +
            "Produtos, o Excluir de um lançamento... Quem clicar escolhe o próprio nome e digita a própria senha (os " +
            "usuários com senha e o Master, com a senha do Administrador). Os outros botões continuam como estão.</p>" +
        "</div>" +
        '<label class="bsn-mestre">' +
          '<span class="bsn-mestre__txt" id="bsnBotoesEstado">' + (cfg.ativo ? "Ligado" : "Desligado") + "</span>" +
          '<input type="checkbox" class="bsn-switch__input" id="bsnBotoesAtivo" role="switch"' + (cfg.ativo ? " checked" : "") +
            ' aria-label="Pedir usuário e senha nos botões marcados" />' +
          '<span class="bsn-switch" aria-hidden="true"><span class="bsn-switch__bola"></span></span>' +
        "</label>" +
      "</div>" +
      (avisos ? '<div class="bsn-botoes__avisos">' + avisos + "</div>" : "") +
      '<div class="bsn-telas' + (cfg.ativo ? "" : " bsn-telas--off") + '">' + telas + "</div>";
  }

  function _ligarBotoes(raizBotoes, aoMudar) {
    function contar() {
      var total = 0;
      Array.prototype.forEach.call(raizBotoes.querySelectorAll(".bsn-tela-botoes"), function (d) {
        var caixas = d.querySelectorAll("[data-botao]");
        var n = Array.prototype.filter.call(caixas, function (c) { return c.checked; }).length;
        total += n;
        var q = d.querySelector("[data-qtd]");
        if (q) {
          q.textContent = n + " de " + caixas.length;
          q.classList.toggle("bsn-tela-botoes__qtd--on", n > 0);
        }
      });
      var t = raizBotoes.querySelector("#bsnBotoesTotal");
      if (t) t.textContent = String(total);
    }
    raizBotoes.addEventListener("change", function (ev) {
      var alvo = ev.target;
      if (alvo && alvo.id === "bsnBotoesAtivo") {
        var est = raizBotoes.querySelector("#bsnBotoesEstado");
        if (est) est.textContent = alvo.checked ? "Ligado" : "Desligado";
        var telas = raizBotoes.querySelector(".bsn-telas");
        if (telas) telas.classList.toggle("bsn-telas--off", !alvo.checked);
      }
      contar();
      aoMudar();
    });
    raizBotoes.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest("[data-todos]") : null;
      if (!b) return;
      var d = b.closest(".bsn-tela-botoes");
      var marcar = b.getAttribute("data-todos") === "1";
      Array.prototype.forEach.call(d.querySelectorAll("[data-botao]"), function (c) { c.checked = marcar; });
      contar();
      aoMudar();
    });
  }

  function _lerBotoesDoForm(raizBotoes) {
    var mestre = raizBotoes.querySelector("#bsnBotoesAtivo");
    var cfg = { ativo: !!(mestre && mestre.checked), botoes: {} };
    Array.prototype.forEach.call(raizBotoes.querySelectorAll("[data-botao]"), function (c) {
      if (c.checked) cfg.botoes[c.getAttribute("data-botao")] = true;
    });
    return cfg;
  }

  // ══════════════════════════════════════════
  //  USUÁRIOS — quem aparece no campo "Responsável"
  // ══════════════════════════════════════════
  // Cadastrados na tela Usuários e Senhas. Cada um tem nome e, se quiser,
  // senha (guardada só como hash, com um "sal" próprio: nem o
  // Administrador vê a senha de um usuário — ele pode trocar ou remover).
  // Quem tem senha só é aceito como responsável de um lançamento digitando
  // a própria senha. A senha de um usuário não abre módulo protegido.
  var CHAVE_USUARIOS = "precifiq_usuarios";
  var MAX_NOME_USUARIO = 60;
  var EVENTO_USUARIOS = "bapell:usuarios";

  // ── O MASTER ──────────────────────────────────────────────────────
  // O administrador principal, como usuário: aparece na lista de Usuários
  // e no campo Responsável, com o nome que se quiser ("Carlos" no lugar de
  // "Administrador"). O nome é só o que aparece: a identidade dele é o id
  // fixo abaixo, e a senha e os poderes continuam sendo os do
  // Administrador (precifiq_senhas) — trocar o nome não muda nada disso.
  // Não pode ser excluído. O nome fica no mesmo "precifiq_usuarios"
  // (campo master); sem ele, vale o padrão.
  var MASTER_ID = "usr_master";
  var MASTER_NOME_PADRAO = "Administrador";

  function _usuariosVazio() { return { versao: 1, usuarios: [], master: _normalizarMaster(null) }; }

  function _normalizarMaster(m) {
    var nome = m && typeof m === "object" ? _limparNome(m.nome) : "";
    if (!nome) return { nome: MASTER_NOME_PADRAO, alteradoEm: null, padrao: true };
    return { nome: nome, alteradoEm: (m && m.alteradoEm) || null, padrao: false };
  }

  function _limparNome(n) {
    return String(n == null ? "" : n).replace(/\s+/g, " ").trim().slice(0, MAX_NOME_USUARIO);
  }

  /** Para comparar nomes: sem acento, sem diferença de maiúsculas. */
  function _chaveNome(n) {
    var t = _limparNome(n).toLowerCase();
    try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return t;
  }

  function _lerUsuarios() {
    var bruto = null;
    try { bruto = localStorage.getItem(CHAVE_USUARIOS); } catch (e) { bruto = null; }
    if (!bruto) return _usuariosVazio();
    var obj;
    try {
      obj = JSON.parse(bruto);
    } catch (err) {
      // Ilegível: NÃO sobrescreve (pode ser recuperado de um backup).
      _registrarFalha("precifiq_usuarios ilegível", err);
      var v = _usuariosVazio();
      v.ilegivel = true;
      return v;
    }
    var lista = obj && Array.isArray(obj.usuarios) ? obj.usuarios : (Array.isArray(obj) ? obj : []);
    var vistos = {};
    var usuarios = [];
    lista.forEach(function (u) {
      if (!u || typeof u !== "object" || !u.id) return;
      var id = String(u.id);
      if (id === MASTER_ID) return; // id reservado do Master
      var nome = _limparNome(u.nome);
      if (!nome || vistos[id]) return;
      vistos[id] = true;
      var senha = null;
      if (u.senha && typeof u.senha.hash === "string" && u.senha.hash && typeof u.senha.sal === "string") {
        senha = { hash: u.senha.hash, sal: u.senha.sal, definidaEm: u.senha.definidaEm || null };
      }
      usuarios.push({ id: id, nome: nome, senha: senha, criadoEm: u.criadoEm || null, alteradoEm: u.alteradoEm || null });
    });
    var master = _normalizarMaster(obj && !Array.isArray(obj) ? obj.master : null);
    return { versao: 1, usuarios: usuarios, master: master };
  }

  function _gravarUsuarios(estado) {
    if (estado.ilegivel) {
      _avisar("Os usuários salvos não puderam ser lidos e não foram alterados. Restaure um backup em Ajuda.", "error", 6500);
      return false;
    }
    var dados = { versao: 1, usuarios: estado.usuarios };
    // O nome do Master só é gravado quando foi escolhido (sem ele, o padrão).
    if (estado.master && !estado.master.padrao) {
      dados.master = { nome: estado.master.nome, alteradoEm: estado.master.alteradoEm || null };
    }
    try {
      localStorage.setItem(CHAVE_USUARIOS, JSON.stringify(dados));
    } catch (err) {
      _registrarFalha("falha ao gravar os usuários", err);
      _avisar("Não foi possível salvar os usuários. Verifique o espaço em disco.", "error", 6000);
      return false;
    }
    _avisarMudancaUsuarios();
    return true;
  }

  /** Avisa ESTA tela (o evento "storage" do navegador só chega às outras). */
  function _avisarMudancaUsuarios() {
    try { document.dispatchEvent(new CustomEvent(EVENTO_USUARIOS)); } catch (e) {}
  }

  function _idAleatorio(prefixo, tam) {
    var bytes = new Uint8Array(tam);
    try { crypto.getRandomValues(bytes); }
    catch (e) { for (var k = 0; k < bytes.length; k++) bytes[k] = Math.floor(Math.random() * 256); }
    return prefixo + Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  function _hashUsuario(sal, senha) { return _hash(sal + ":" + senha); }

  /** O que as telas enxergam: nunca o hash. */
  function _publico(u) {
    return { id: u.id, nome: u.nome, temSenha: !!u.senha, criadoEm: u.criadoEm, alteradoEm: u.alteradoEm, master: false };
  }

  /**
   * O Master como as telas o enxergam. A senha dele é a do Administrador:
   * "temSenha" acompanha a proteção (com a senha do Administrador criada,
   * escolher o Master como responsável pede essa senha).
   */
  function _publicoMaster(m) {
    m = m || _normalizarMaster(null);
    return { id: MASTER_ID, nome: m.nome, temSenha: protegido(), criadoEm: null, alteradoEm: m.alteradoEm || null, master: true };
  }

  /** O nome que aparece para o Master ("Administrador", se ninguém trocou). */
  function nomeMaster() {
    return _lerUsuarios().master.nome;
  }

  /** É o Master? (pelo id, ou por um usuário público) */
  function ehMaster(valor) {
    if (valor && typeof valor === "object") return valor.id === MASTER_ID || valor.master === true;
    return String(valor) === MASTER_ID;
  }

  /** Os usuários: o Master primeiro, os outros em ordem alfabética. */
  function listarUsuarios() {
    var est = _lerUsuarios();
    var outros = est.usuarios.map(_publico).sort(function (a, b) {
      return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
    });
    return [_publicoMaster(est.master)].concat(outros);
  }

  function obterUsuario(id) {
    if (id == null || id === "") return null;
    var est = _lerUsuarios();
    if (String(id) === MASTER_ID) return _publicoMaster(est.master);
    var u = est.usuarios.find(function (x) { return x.id === String(id); });
    return u ? _publico(u) : null;
  }

  // Pelo nome (os lançamentos guardam o nome). Os usuários vêm antes do
  // Master: um nome antigo igual ao dele continua sendo de quem era.
  function usuarioPorNome(nome) {
    var k = _chaveNome(nome);
    if (!k) return null;
    var est = _lerUsuarios();
    var u = est.usuarios.find(function (x) { return _chaveNome(x.nome) === k; });
    if (u) return _publico(u);
    return _chaveNome(est.master.nome) === k ? _publicoMaster(est.master) : null;
  }

  /** Pelo id ou, sem ele, pelo nome — os lançamentos guardam o nome. */
  function acharUsuario(valor) {
    return obterUsuario(valor) || usuarioPorNome(valor);
  }

  function validarSenhaUsuario(senha) {
    senha = String(senha || "");
    if (senha.length < MIN_SENHA) return "A senha do usuário deve ter no mínimo " + MIN_SENHA + " caracteres.";
    return null;
  }

  /**
   * Cria (sem id) ou altera um usuário.
   * dados: { id, nome, senha (nova; em branco mantém a atual), removerSenha }
   * @returns {Promise<{ok:boolean, erro?:string, campo?:string, usuario?:object}>}
   */
  function salvarUsuario(dados) {
    dados = dados || {};
    var nome = _limparNome(dados.nome);
    // O Master: só o nome muda (a senha é a do Administrador, no quadro
    // Senhas de acesso). Senha e "remover senha" que vierem são ignoradas.
    if (dados.id != null && String(dados.id) === MASTER_ID) {
      if (!nome) return Promise.resolve({ ok: false, campo: "nome", erro: "Informe o nome do Master." });
      return Promise.resolve(_salvarNomeMaster(nome));
    }
    if (!nome) return Promise.resolve({ ok: false, campo: "nome", erro: "Informe o nome do usuário." });
    var senha = dados.senha != null ? String(dados.senha) : "";
    if (senha) {
      var erroSenha = validarSenhaUsuario(senha);
      if (erroSenha) return Promise.resolve({ ok: false, campo: "senha", erro: erroSenha });
    }
    function repetido(est) {
      var k = _chaveNome(nome);
      return est.usuarios.some(function (u) { return u.id !== dados.id && _chaveNome(u.nome) === k; });
    }
    // O nome do Master também conta: dois com o mesmo nome no campo
    // Responsável não teriam como ser diferenciados.
    function doMaster(est) { return _chaveNome(est.master.nome) === _chaveNome(nome); }
    var MSG_MASTER = 'Já existe um usuário chamado "' + nome + '": é o Master (o administrador principal).';
    if (repetido(_lerUsuarios())) {
      return Promise.resolve({ ok: false, campo: "nome", erro: 'Já existe um usuário chamado "' + nome + '".' });
    }
    if (doMaster(_lerUsuarios())) return Promise.resolve({ ok: false, campo: "nome", erro: MSG_MASTER });
    var sal = senha ? _idAleatorio("", 16) : null;
    var calc = senha ? _hashUsuario(sal, senha) : Promise.resolve(null);
    return calc.then(function (hash) {
      // Relê: outra aba pode ter mudado a lista enquanto o hash era feito.
      var est = _lerUsuarios();
      if (repetido(est)) return { ok: false, campo: "nome", erro: 'Já existe um usuário chamado "' + nome + '".' };
      if (doMaster(est)) return { ok: false, campo: "nome", erro: MSG_MASTER };
      var agora = Date.now();
      var u;
      if (dados.id) {
        u = est.usuarios.find(function (x) { return x.id === String(dados.id); });
        if (!u) return { ok: false, erro: "Este usuário não existe mais. Atualize a tela." };
        u.nome = nome;
      } else {
        u = { id: _idAleatorio("usr_", 6), nome: nome, senha: null, criadoEm: agora, alteradoEm: null };
        est.usuarios.push(u);
      }
      if (hash) u.senha = { hash: hash, sal: sal, definidaEm: agora };
      else if (dados.removerSenha) u.senha = null;
      u.alteradoEm = agora;
      if (!_gravarUsuarios(est)) return { ok: false, erro: "Não foi possível salvar o usuário." };
      return { ok: true, usuario: _publico(u) };
    });
  }

  /**
   * Troca o nome que aparece para o Master. Só o nome: o id, a senha (a do
   * Administrador) e os poderes ficam como estão. Os lançamentos que já
   * têm o nome antigo continuam com ele, como os de qualquer usuário.
   */
  function _salvarNomeMaster(nome) {
    var est = _lerUsuarios();
    var k = _chaveNome(nome);
    if (est.usuarios.some(function (u) { return _chaveNome(u.nome) === k; })) {
      return { ok: false, campo: "nome", erro: 'Já existe um usuário chamado "' + nome + '". O Master precisa de um nome só dele.' };
    }
    est.master = { nome: nome, alteradoEm: Date.now(), padrao: false };
    if (!_gravarUsuarios(est)) return { ok: false, erro: "Não foi possível salvar o nome do Master." };
    return { ok: true, usuario: _publicoMaster(est.master) };
  }

  /** Apaga o usuário. Os lançamentos que já têm o nome dele continuam iguais. */
  function removerUsuario(id) {
    if (String(id) === MASTER_ID) return false; // o Master não sai
    var est = _lerUsuarios();
    var antes = est.usuarios.length;
    est.usuarios = est.usuarios.filter(function (u) { return u.id !== String(id); });
    if (est.usuarios.length === antes) return false;
    return _gravarUsuarios(est);
  }

  /** Confere a senha de um usuário (sem senha → sempre true). */
  function verificarSenhaUsuario(id, texto) {
    // O Master: a senha é a do Administrador (a do Colaborador não serve).
    // Sem a senha do Administrador criada, ele não tem senha.
    if (String(id) === MASTER_ID) {
      if (!protegido()) return Promise.resolve(true);
      return verificar(texto).then(function (papel) { return papel === "admin"; });
    }
    var u = _lerUsuarios().usuarios.find(function (x) { return x.id === String(id); });
    if (!u) return Promise.resolve(false);
    if (!u.senha) return Promise.resolve(true);
    return _hashUsuario(u.senha.sal, String(texto == null ? "" : texto)).then(function (h) {
      return h === u.senha.hash;
    });
  }

  /** Chama fn sempre que a lista de usuários mudar (nesta tela ou em outra aba). */
  function aoMudarUsuarios(fn) {
    if (typeof fn !== "function") return function () {};
    function local() { fn(); }
    function outraAba(e) { if (e.key === CHAVE_USUARIOS || e.key === null) fn(); }
    document.addEventListener(EVENTO_USUARIOS, local);
    window.addEventListener("storage", outraAba);
    return function () {
      document.removeEventListener(EVENTO_USUARIOS, local);
      window.removeEventListener("storage", outraAba);
    };
  }

  // ── Telas: o <select> de Responsável ─────────────────────────────
  /**
   * Preenche um <select> com os usuários. O value de cada opção é o id.
   * opcoes.valor: id ou nome a deixar escolhido (um lançamento antigo
   * guarda só o nome). Um nome que não é de usuário cadastrado aparece na
   * primeira linha — "Fulano (não cadastrado)" — com valor vazio: a pessoa
   * vê quem era e escolhe um usuário cadastrado para salvar.
   * opcoes.vazio: o texto da primeira linha.
   * opcoes.opcional: campo que pode ficar sem ninguém (o nome antigo
   * aparece só como "Fulano (não cadastrado)" — a tela decide se o mantém,
   * lendo o atributo data-legado).
   * A última linha da lista é "+ Cadastrar usuário…": escolhida com o
   * mouse, abre o cadastro (ver _ligarOpcaoCadastrar).
   */
  // Valor e texto da linha que abre o cadastro, dentro da lista.
  var VALOR_CADASTRAR = "__cadastrar__";
  var ROTULO_CADASTRAR = "+ Cadastrar usuário…";
  // Teclas que só passeiam pela lista. No Windows, com a lista fechada, elas
  // trocam a escolha NA HORA (o "change" dispara a cada seta): passar pela
  // linha do cadastro não pode abrir nada.
  var TECLAS_NAVEGAR = /^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown)$/;

  // Os <select> que acompanham a lista de usuários. Os que saíram da tela
  // (o modal fechou) deixam de ouvir na próxima vez que um campo é montado.
  var _selectsOuvindo = [];
  function _varrerSelects() {
    _selectsOuvindo = _selectsOuvindo.filter(function (r) {
      if (r.select.isConnected) return true;
      r.soltar();
      r.select.removeAttribute("data-usr");
      return false;
    });
  }

  function preencherSelect(select, opcoes) {
    if (!select) return;
    _varrerSelects();
    opcoes = opcoes || {};
    select._usrOpcoes = { vazio: opcoes.vazio, opcional: opcoes.opcional };
    var valor = opcoes.valor != null ? String(opcoes.valor) : (select.value || select.getAttribute("data-legado") || "");
    // A linha do cadastro nunca fica escolhida: vale o que estava antes dela.
    if (valor === VALOR_CADASTRAR) valor = select._usrAnterior || select.getAttribute("data-legado") || "";
    var lista = listarUsuarios();
    var escolhido = valor ? acharUsuario(valor) : null;
    var legado = valor && !escolhido && valor.indexOf("usr_") !== 0 ? valor : "";
    var primeira = legado
      ? legado + (opcoes.opcional ? " (não cadastrado)" : " (não cadastrado) — escolha um usuário")
      : (lista.length ? (opcoes.vazio || "Selecione o responsável") : "Nenhum usuário cadastrado");
    var html = '<option value="">' + _esc(primeira) + "</option>";
    lista.forEach(function (u) {
      html += '<option value="' + _esc(u.id) + '">' + _esc(u.nome) + "</option>";
    });
    // A última linha abre o cadastro. O <hr> desenha um separador na lista
    // aberta (o Chromium do app aceita <hr> dentro do <select>; onde não
    // aceitar, ele só some).
    html += "<hr>" + '<option value="' + VALOR_CADASTRAR + '" class="usr-opt-cadastrar">' + _esc(ROTULO_CADASTRAR) + "</option>";
    select.innerHTML = html;
    select.value = escolhido ? escolhido.id : "";
    select._usrAnterior = select.value;
    if (legado) select.setAttribute("data-legado", legado);
    else select.removeAttribute("data-legado");
    select.classList.toggle("usr-select--vazio", !lista.length);
    _limparPendente(select);
    _tirarAtalhoAntigo(select);
    _ligarOpcaoCadastrar(select);

    if (select.getAttribute("data-usr") !== "1") {
      select.setAttribute("data-usr", "1");
      // A lista muda em outra aba (alguém cadastrou um usuário): atualiza
      // mantendo o que está escolhido. O campo que saiu da tela (o modal
      // fechou) deixa de ouvir — se voltar, preencherSelect liga de novo.
      var registro = { select: select, soltar: function () {} };
      registro.soltar = aoMudarUsuarios(function () {
        if (!select.isConnected) { _varrerSelects(); return; }
        var op = select._usrOpcoes || {};
        preencherSelect(select, { valor: select.value || select.getAttribute("data-legado") || "", vazio: op.vazio, opcional: op.opcional });
        _escolherRecemCadastrado(select);
      });
      _selectsOuvindo.push(registro);
    }
  }

  /**
   * A linha "+ Cadastrar usuário…" da lista.
   *   · escolhida com o mouse (ou com Enter na lista aberta): abre o
   *     cadastro, e a lista volta a mostrar quem estava escolhido;
   *   · alcançada pelas setas com a lista fechada (no Windows a escolha
   *     muda a cada seta): não abre nada — fica à vista, e o Enter abre.
   *     Saindo do campo, volta para quem estava antes.
   * O valor "__cadastrar__" nunca chega às telas: os eventos dela param
   * aqui (os ouvintes de captura, no próprio campo, rodam antes dos delas).
   */
  function _ligarOpcaoCadastrar(select) {
    if (select._usrCadLigado) return;
    select._usrCadLigado = true;
    function guardarAnterior() {
      if (select.value !== VALOR_CADASTRAR) select._usrAnterior = select.value;
    }
    select.addEventListener("focus", guardarAnterior);
    // A lista vai abrir com a linha do cadastro à vista (chegou-se a ela
    // pelas setas): volta antes para quem estava escolhido. Sem isso, clicar
    // de novo na mesma linha não dispara "change" e nada aconteceria.
    function antesDeAbrir() {
      if (select.value === VALOR_CADASTRAR) {
        select.value = select._usrAnterior || "";
        _limparPendente(select);
      }
    }
    // O mouse abre a lista: a escolha que vier agora é do mouse, não das
    // setas usadas um instante antes.
    select.addEventListener("mousedown", function () {
      antesDeAbrir();
      guardarAnterior();
      select._usrTeclaEm = 0;
    });
    select.addEventListener("keydown", function (e) {
      // Alt+↓/↑ e F4 abrem a lista (não passeiam por ela).
      if ((e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) || e.key === "F4") {
        antesDeAbrir();
        select._usrTeclaEm = 0;
        return;
      }
      if (TECLAS_NAVEGAR.test(e.key) ||
          (e.key && e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        select._usrTeclaEm = Date.now();
        return;
      }
      if ((e.key === "Enter" || e.key === " ") && select.value === VALOR_CADASTRAR) {
        e.preventDefault();
        e.stopPropagation();
        _acionarCadastro(select);
      }
    });
    select.addEventListener("input", function (e) {
      if (select.value === VALOR_CADASTRAR) e.stopImmediatePropagation();
    }, true);
    select.addEventListener("change", function (e) {
      if (select.value !== VALOR_CADASTRAR) {
        select._usrAnterior = select.value;
        _limparPendente(select);
        return;
      }
      e.stopImmediatePropagation();
      if (Date.now() - (select._usrTeclaEm || 0) < 700) {
        _marcarPendente(select);
        return;
      }
      _acionarCadastro(select);
    }, true);
    select.addEventListener("blur", function () {
      if (select.value === VALOR_CADASTRAR) select.value = select._usrAnterior || "";
      select._usrTeclaEm = 0;
      _limparPendente(select);
    });
  }

  function _marcarPendente(select) {
    if (select._usrTituloAntes == null) select._usrTituloAntes = select.getAttribute("title") || "";
    select.setAttribute("title", "Pressione Enter para cadastrar um usuário");
    select.classList.add("usr-select--cadastrar");
  }
  function _limparPendente(select) {
    if (select._usrTituloAntes != null) {
      if (select._usrTituloAntes) select.setAttribute("title", select._usrTituloAntes);
      else select.removeAttribute("title");
      select._usrTituloAntes = null;
    }
    select.classList.remove("usr-select--cadastrar");
  }

  // Abre o cadastro a partir da lista. Quem estava escolhido continua; o
  // usuário cadastrado em seguida entra já escolhido, se o campo estiver
  // vazio (ver _escolherRecemCadastrado).
  function _acionarCadastro(select) {
    select.value = select._usrAnterior && select._usrAnterior !== VALOR_CADASTRAR ? select._usrAnterior : "";
    _limparPendente(select);
    select._usrAguardando = {
      ids: listarUsuarios().map(function (u) { return u.id; }),
      em: Date.now(),
    };
    var abrir = window.BapellUsuarios && typeof window.BapellUsuarios.abrirCadastro === "function"
      ? window.BapellUsuarios.abrirCadastro : abrirCadastroUsuarios;
    abrir();
  }

  // Voltando do cadastro: se o campo ficou vazio e apareceu UM usuário novo,
  // ele já vem escolhido (e a tela fica sabendo, pelo "change").
  function _escolherRecemCadastrado(select) {
    var esp = select._usrAguardando;
    if (!esp) return;
    if (Date.now() - esp.em > 30 * 60 * 1000) { select._usrAguardando = null; return; }
    var novos = listarUsuarios().filter(function (u) { return esp.ids.indexOf(u.id) < 0; });
    if (!novos.length) return;
    select._usrAguardando = null;
    if (select.value || novos.length !== 1) return;
    select.value = novos[0].id;
    select._usrAnterior = select.value;
    try { select.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
  }

  // Versões anteriores punham o atalho "+ Cadastrar usuário" embaixo do
  // campo. A linha voltou para dentro da lista; um atalho que tenha ficado
  // na tela sai.
  function _tirarAtalhoAntigo(select) {
    var atalho = select._usrAtalho;
    if (atalho && atalho.parentNode) atalho.parentNode.removeChild(atalho);
    select._usrAtalho = null;
  }

  /** O usuário escolhido num <select> preenchido por preencherSelect (ou null). */
  function usuarioDoSelect(select) {
    if (!select || !select.value || select.value === VALOR_CADASTRAR) return null;
    return obterUsuario(select.value);
  }

  /**
   * Abre a tela de cadastro. Dentro das abas do app, abre numa aba nova
   * ao lado — o formulário desta tela continua preenchido — e o "Voltar"
   * de lá fecha a aba e volta para esta. Fora delas, troca de tela.
   */
  function abrirCadastroUsuarios() {
    var aqui = "";
    try { aqui = decodeURIComponent(location.pathname.split("/").pop() || "").toLowerCase(); } catch (e) {}
    var voltar = /^[a-z0-9-]+\.html$/.test(aqui) && aqui !== "usuarios.html" ? aqui : "";
    try {
      var abas = window.parent && window.parent !== window ? window.parent.BapellAbas : null;
      if (abas && typeof abas.abrir === "function" && typeof abas.idDe === "function") {
        var minha = abas.idDe(window);
        abas.abrir("usuarios.html?" + (voltar ? "voltar=" + encodeURIComponent(voltar) + "&" : "") +
          (minha ? "aba=" + encodeURIComponent(minha) : ""));
        return;
      }
    } catch (e) {}
    window.location.href = "usuarios.html" + (voltar ? "?voltar=" + encodeURIComponent(voltar) : "");
  }

  /** Sem nenhum usuário: explica e leva ao cadastro. */
  function pedirCadastroUsuario() {
    var titulo = "Cadastre um usuário";
    var texto = "Os lançamentos precisam de um responsável, escolhido entre os usuários cadastrados. " +
      "Cadastre os usuários em Dados da Empresa › Usuários e Senhas.";
    if (window.BapellModal && typeof window.BapellModal.confirmar === "function") {
      return window.BapellModal.confirmar({
        tipo: "aviso", titulo: titulo, texto: texto, botao: "Cadastrar usuário", cancelar: "Agora não",
      }).then(function (sim) { if (sim) abrirCadastroUsuarios(); return sim; });
    }
    return _confirmar({ titulo: titulo, texto: _esc(texto), botao: "Cadastrar usuário" }).then(function (sim) {
      if (sim) abrirCadastroUsuarios();
      return sim;
    });
  }

  /**
   * Antes de gravar um lançamento: confere o responsável.
   *   · nenhum usuário cadastrado → pede o cadastro;
   *   · nenhum escolhido          → { ok:false, motivo:"vazio" } (a tela
   *                                 deixa o campo vermelho);
   *   · usuário com senha         → pede a senha dele.
   * opcoes.acao: o que vai ser feito, para o texto ("lançar esta venda").
   * @returns {Promise<{ok:boolean, usuario?:object, motivo?:string}>}
   */
  function confirmarResponsavel(valor, opcoes) {
    opcoes = opcoes || {};
    if (!listarUsuarios().length) {
      pedirCadastroUsuario();
      return Promise.resolve({ ok: false, motivo: "sem-usuarios" });
    }
    var u = valor ? acharUsuario(valor) : null;
    if (!u) return Promise.resolve({ ok: false, motivo: "vazio" });
    if (!u.temSenha) return Promise.resolve({ ok: true, usuario: u });
    return _pedirSenhaUsuario(u, opcoes.acao).then(function (ok) {
      return ok ? { ok: true, usuario: u } : { ok: false, motivo: "cancelado" };
    });
  }

  /** A janela que pede a senha do usuário escolhido como responsável. */
  function _pedirSenhaUsuario(u, acao) {
    // Uma de cada vez: um segundo Enter no botão de lançar, antes de a
    // janela pegar o foco, não abre outra (nem lança duas vezes).
    if (document.querySelector(".usr-senha")) return Promise.resolve(false);
    return new Promise(function (resolve) {
      var fundo = document.createElement("div");
      fundo.className = "modal-overlay bsn-camada usr-senha";
      fundo.setAttribute("role", "dialog");
      fundo.setAttribute("aria-modal", "true");
      fundo.setAttribute("aria-labelledby", "usrSenhaTitulo");
      fundo.innerHTML =
        '<div class="modal bsn-portao__modal">' +
          '<div class="modal-title bsn-portao__titulo" id="usrSenhaTitulo">' + ICO_CADEADO + " Senha de " + _esc(u.nome) + "</div>" +
          '<div class="modal-subtitle bsn-portao__sub"><strong>' + _esc(u.nome) + "</strong> é o responsável. " +
            "Digite a senha de " + _esc(u.nome) + " para " + _esc(acao || "continuar") + "." +
            (u.master ? " Como Master, a senha é a do Administrador." : "") + "</div>" +
          '<div class="field-group bsn-portao__campo">' +
            '<input type="password" id="usrSenhaCampo" class="input-field" placeholder="Senha de ' + _esc(u.nome) + '" ' +
              'autocomplete="off" aria-label="Senha de ' + _esc(u.nome) + '" />' +
          "</div>" +
          '<div id="usrSenhaAviso" class="bsn-aviso" role="alert" hidden></div>' +
          '<div class="modal-actions bsn-portao__acoes">' +
            '<button type="button" class="btn-secondary" data-r="nao">Cancelar</button>' +
            '<button type="button" class="btn-primary" data-r="sim">Confirmar</button>' +
          "</div>" +
        "</div>";
      document.body.appendChild(fundo);

      var input = fundo.querySelector("#usrSenhaCampo");
      var aviso = fundo.querySelector("#usrSenhaAviso");
      var btn = fundo.querySelector('[data-r="sim"]');
      var errou = _criarFreio(input, btn, aviso);
      var feito = false;
      var focoAntes = document.activeElement;

      function responder(v) {
        if (feito) return;
        feito = true;
        document.removeEventListener("keydown", tecla, true);
        fundo.remove();
        try { if (focoAntes && focoAntes.isConnected) focoAntes.focus({ preventScroll: true }); } catch (e) {}
        resolve(v);
      }
      function tecla(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); responder(false); return; }
        // O Tab circula só dentro desta janela: o formulário de trás não
        // pode ser fechado (nem alterado) enquanto a senha é pedida.
        if (e.key === "Tab") {
          var itens = Array.prototype.filter.call(
            fundo.querySelectorAll("input, button"),
            function (el) { return !el.disabled && el.offsetParent !== null; }
          );
          if (!itens.length) { e.preventDefault(); return; }
          var i = itens.indexOf(document.activeElement);
          e.preventDefault();
          var prox = e.shiftKey ? (i <= 0 ? itens.length - 1 : i - 1) : (i < 0 || i >= itens.length - 1 ? 0 : i + 1);
          itens[prox].focus();
        }
      }
      function tentar() {
        if (feito || btn.disabled) return;
        if (!input.value) {
          aviso.hidden = false;
          aviso.textContent = "Digite a senha de " + u.nome + ".";
          _marcarCampo(input);
          return;
        }
        verificarSenhaUsuario(u.id, input.value).then(function (ok) {
          if (feito) return;
          if (ok) responder(true);
          else errou("Senha incorreta.");
        }, function (err) {
          _registrarFalha("falha ao conferir a senha do usuário", err);
          aviso.hidden = false;
          aviso.textContent = "Não foi possível conferir a senha. Tente de novo.";
        });
      }
      document.addEventListener("keydown", tecla, true);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); tentar(); } });
      input.addEventListener("input", function () { if (!aviso.hidden && !btn.disabled) aviso.hidden = true; });
      btn.addEventListener("click", tentar);
      fundo.querySelector('[data-r="nao"]').addEventListener("click", function () { responder(false); });
      fundo.addEventListener("mousedown", function (e) { if (e.target === fundo) responder(false); });
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
    });
  }

  window.BapellUsuarios = {
    versao: 1,
    chave: CHAVE_USUARIOS,
    // O Master (administrador principal): id fixo e nome escolhido.
    masterId: MASTER_ID,
    nomeMaster: nomeMaster,
    ehMaster: ehMaster,
    minimoSenha: MIN_SENHA,
    listar: listarUsuarios,
    obter: obterUsuario,
    porNome: usuarioPorNome,
    achar: acharUsuario,
    salvar: salvarUsuario,
    remover: removerUsuario,
    verificarSenha: verificarSenhaUsuario,
    validarSenha: validarSenhaUsuario,
    aoMudar: aoMudarUsuarios,
    preencherSelect: preencherSelect,
    doSelect: usuarioDoSelect,
    abrirCadastro: abrirCadastroUsuarios,
    pedirCadastro: pedirCadastroUsuario,
    confirmarResponsavel: confirmarResponsavel,
  };

  // ══════════════════════════════════════════
  //  API PÚBLICA
  // ══════════════════════════════════════════
  window.BapellSenhas = {
    versao: 2,
    protegido: protegido,
    moduloProtegido: moduloProtegido,
    modulos: modulos,
    resumo: resumo,
    hashAdmin: hashAdmin,
    espelho: espelho,
    verificar: verificar,
    exigirAcesso: exigirAcesso,
    aguardarAcesso: aguardarAcesso,
    abrirGerenciador: abrirGerenciador,
    montarGerenciador: montarGerenciador,
    exigirAdmin: exigirAdmin,
    sairDaTelaAdmin: sairDaTelaAdmin,
    definirAdmin: definirAdmin,
    criarAdmin: criarAdmin,
    recuperarAdmin: _recuperarAdmin,
    verificarResposta: verificarResposta,
    perguntas: function () { return PERGUNTAS.map(function (p) { return { id: p.id, texto: p.texto }; }); },
    minimoPerguntas: MIN_PERGUNTAS,
    validarSenhaAdmin: validarSenhaAdmin,
    validarSenhaColaborador: validarSenhaColaborador,
    minimoSenha: MIN_SENHA,
    gerarSenha: gerarSenha,
    renovarAoAbrir: renovarAoAbrir,
    // Senha nos botões
    chaveBotoes: CHAVE_BOTOES,
    botaoProtegido: botaoProtegido,
    exigirBotao: exigirBotao,
    telasBotoes: function () {
      return TELAS_BOTOES.map(function (t) {
        return { pagina: t.pagina, nome: t.nome, botoes: t.botoes.map(function (b) { return { id: b.id, nome: b.nome, sel: b.sel }; }) };
      });
    },
  };

  // Senha nos botões: nas telas da lista, os botões marcados pedem usuário
  // e senha (em captura, antes dos ouvintes da própria tela).
  _ligarSenhaNosBotoes();

  // Tela de um módulo (data-modulo): se ele estiver bloqueado, tranca já
  // (antes de pintar o conteúdo) e mostra a tela de acesso assim que o
  // corpo existir.
  if (moduloDaTela) exigirAcesso(null, moduloDaTela);
  // Tela só do Administrador (data-admin): Usuários e Senhas.
  else if (telaSoAdmin) exigirAdmin("Usuários e Senhas");

  // O antigo botão "Redefinir Senhas" (id btnRedefinirSenhas), se alguma
  // tela ainda o tiver, leva à tela Usuários e Senhas.
  _aoCarregar(function () {
    var btn = document.getElementById("btnRedefinirSenhas");
    if (!btn || btn.getAttribute("data-bsn") === "1") return;
    btn.setAttribute("data-bsn", "1");
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      window.location.href = "usuarios.html";
    });
  });
})();

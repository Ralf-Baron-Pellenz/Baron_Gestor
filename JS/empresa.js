// ═══════════════════════════════════════════
//  Bapell Gestor Pro — empresa.js
//  Tela de Dados da Empresa
// ═══════════════════════════════════════════

const EMPRESA_LS_KEY = "precifiq_empresa";

// ═══════════════════════════════════════════
//  FORMATAÇÃO DE VALORES (dinheiro e porcentagem)
// ═══════════════════════════════════════════
// Estas funções existem no calculadora.js, mas aquele arquivo NÃO é carregado
// nesta tela. Sem elas, _popular() quebrava ao formatar o Capital Social
// (ReferenceError: formatMoneyBR is not defined) e travava ANTES de exibir
// logo, campos, sócios e seções — dando a impressão de que os dados sumiam.
// São cópias fiéis das versões oficiais do sistema, para o mesmo comportamento.

// Converte uma string formatada (ou número) no valor numérico correspondente.
function parseFormattedValue(val) {
  if (typeof val === "number") return isFinite(val) ? val : 0;
  if (val === null || val === undefined || val === "") return 0;

  const str = String(val).trim();
  if (str === "") return 0;

  // Caso 1: vírgula presente → decimal BR, pontos são milhar
  if (str.includes(",")) {
    return parseFloat(
      str.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")
    ) || 0;
  }

  // Caso 2: sem vírgula, mas com ponto(s) → decide pelo tamanho dos grupos
  if (str.includes(".")) {
    const negativo = str.trim().startsWith("-");
    const limpo = str.replace(/[^\d.]/g, "");
    const partes = limpo.split(".");
    const ehMilhar =
      partes.length > 1 &&
      partes[0].length > 0 &&
      partes.slice(1).every((p) => p.length === 3);
    if (ehMilhar) {
      const n = parseFloat(partes.join("")) || 0;
      return negativo ? -n : n;
    }
  }

  return parseFloat(str) || 0;
}

// Formata um número no padrão monetário brasileiro SEM o "R$" (o prefixo R$
// já vem do HTML, no <span class="input-prefix">). Ex: 1000 → "1.000,00".
function formatMoneyBR(val) {
  const n = parseFloat(val);
  if (!isFinite(n)) return "0,00";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Formata um valor percentual mantendo só as casas necessárias (até 2).
function formatPercentBR(val) {
  const n = parseFloat(String(val).replace(",", "."));
  if (!isFinite(n)) return "";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

// ═══════════════════════════════════════════
//  ARMAZENAMENTO DE ARQUIVOS (IndexedDB)
//  Cada arquivo é salvo com uma chave que inclui o ID da empresa,
//  garantindo isolamento: apagar uma empresa não afeta as outras.
// ═══════════════════════════════════════════
const ArquivoStore = (function () {
  "use strict";

  const DB_NAME = "precifiq_arquivos";
  const STORE = "arquivos";
  const DB_VERSION = 1;

  // Cacheia a PROMISE (não a conexão). Antes, o "if (_db) return" era checado
  // DEPOIS de criar uma nova Promise: duas chamadas simultâneas abriam DUAS
  // conexões ao banco. Cachear a promise garante uma única abertura.
  let _dbPromise = null;

  function _open() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { _dbPromise = null; return reject(e); }
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("empresaId", "empresaId", { unique: false });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => { _dbPromise = null; reject((e.target && e.target.error) || new Error("Falha ao abrir banco de arquivos")); };
      req.onblocked = () => console.warn("[ArquivoStore] abertura bloqueada por outra aba");
    });
    return _dbPromise;
  }

  // Escrita tratando complete/error/ABORT (o abort é o que trava quando a
  // cota estoura — sem ele a Promise nunca resolvia).
  function _escrever(fn) {
    return _open().then((db) => new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(STORE, "readwrite"); } catch (e) { return reject(e); }
      let out;
      try { out = fn(tx.objectStore(STORE)); } catch (e) { return reject(e); }
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error || new Error("Erro na transação de arquivo"));
      tx.onabort = () => reject(tx.error || new Error("Gravação abortada (possível falta de espaço)"));
    }));
  }

  function _ler(fn) {
    return _open().then((db) => new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(STORE, "readonly"); } catch (e) { return reject(e); }
      tx.onabort = () => reject(tx.error || new Error("Leitura abortada"));
      fn(tx.objectStore(STORE), resolve, reject);
    }));
  }

  // Salva um arquivo: {id, empresaId, nome, tipo, tamanho, dataUrl}
  async function salvar(registro) {
    if (!registro || !registro.id) throw new Error("Registro de arquivo sem id.");
    return _escrever((store) => { store.put(registro); return registro; });
  }

  // Lista os arquivos (metadados, sem o conteúdo) de uma empresa
  async function listar(empresaId) {
    return _ler((store, resolve, reject) => {
      const idx = store.index("empresaId");
      const req = idx.getAll(empresaId);
      req.onsuccess = () => {
        const lista = (req.result || []).map((r) => ({
          id: r.id, empresaId: r.empresaId, nome: r.nome, tipo: r.tipo, tamanho: r.tamanho,
        }));
        resolve(lista);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // Busca o conteúdo completo de um arquivo (para baixar/abrir)
  async function obter(id) {
    return _ler((store, resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  // Alias usado pelo backup (mesma semântica de obter, retornando o registro)
  async function get(id) { return obter(id); }

  // Grava um registro com id específico (usado na importação de backup)
  async function putWithId(id, registro) {
    if (!id) throw new Error("putWithId exige um id.");
    const reg = Object.assign({}, registro, { id });
    return _escrever((store) => { store.put(reg); return id; });
  }

  // Retorna TODOS os arquivos como { id: registro } (para backup)
  async function getAll() {
    return _ler((store, resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const out = {};
        (req.result || []).forEach((r) => { if (r && r.id) out[r.id] = r; });
        resolve(out);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // Remove um arquivo específico
  async function remover(id) {
    return _escrever((store) => { store.delete(id); });
  }

  // Remove TODOS os arquivos de uma empresa (ao excluir a empresa)
  async function removerDaEmpresa(empresaId) {
    return _escrever((store) => {
      const idx = store.index("empresaId");
      const req = idx.openCursor(IDBKeyRange.only(empresaId));
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
    });
  }

  return { salvar, listar, obter, get, putWithId, getAll, remover, removerDaEmpresa };
})();

document.addEventListener("DOMContentLoaded", () => {
  setDateHeader();

  // Estrutura de dados: { empresas: [...], ativaId }
  let dados = _carregarDados();
  let empresa = _empresaAtiva();

  // A ordem das seções fixas como veio no HTML: a empresa sem ordem salva
  // (outra empresa na tela, ou o Cancelar depois de um "Ordenar Posição"
  // ainda não salvo) mostra as seções nela.
  const _ordemOriginalSecoes = Array.from(
    document.querySelectorAll("#empresaFieldsContainer > .field-section-title[data-group]")
  ).map((t) => "fixa:" + t.dataset.group);

  // Helper: apaga arquivos de uma empresa (usado ao excluir empresa)
  async function _apagarArquivosEmpresa(empresaId) {
    try {
      await ArquivoStore.removerDaEmpresa(empresaId);
    } catch (err) {
      console.error("Erro ao apagar arquivos da empresa:", err);
    }
    // Também apaga as NOTAS FISCAIS da empresa. O NotaStore vive no nf.js, que
    // não é carregado nesta tela — então abrimos o banco precifiq_notas
    // diretamente e limpamos por índice, para não deixar notas órfãs (e PDFs)
    // ocupando espaço para sempre.
    try {
      await _apagarNotasEmpresa(empresaId);
    } catch (err) {
      console.error("Erro ao apagar notas da empresa:", err);
    }
  }

  // Limpeza autônoma das notas de uma empresa (independe do nf.js).
  // Abre o banco na versão em que ele ESTIVER: fixar a versão 1 dava
  // VersionError depois que o nf.js sobe a versão para refazer a estrutura,
  // e a limpeza falhava calada (as notas ficavam órfãs, ocupando espaço).
  // Se o banco ainda não existir, ele já nasce com a store e o índice que o
  // nf.js usa — nunca vazio. No fim a conexão é fechada, para não travar
  // uma atualização de versão feita pela tela de Notas em outra aba.
  function _apagarNotasEmpresa(empresaId) {
    return new Promise((resolve) => {
      let req;
      try { req = indexedDB.open("precifiq_notas"); }
      catch (e) { return resolve(); }
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("notas")) {
          const store = db.createObjectStore("notas", { keyPath: "id" });
          store.createIndex("empresaId", "empresaId", { unique: false });
        }
      };
      req.onsuccess = (e) => {
        const db = e.target.result;
        const fim = () => {
          try { db.close(); } catch (_) {}
          resolve();
        };
        db.onversionchange = fim;
        if (!db.objectStoreNames.contains("notas")) { fim(); return; }
        try {
          const tx = db.transaction("notas", "readwrite");
          const store = tx.objectStore("notas");
          if (store.indexNames.contains("empresaId")) {
            const idx = store.index("empresaId");
            const cur = idx.openCursor(IDBKeyRange.only(empresaId));
            cur.onsuccess = (ev) => {
              const cursor = ev.target.result;
              if (cursor) { cursor.delete(); cursor.continue(); }
            };
          }
          tx.oncomplete = fim;
          tx.onerror = fim;
          tx.onabort = fim;
        } catch (_) { fim(); }
      };
      req.onerror = () => resolve();
    });
  }

  // ── Persistência (múltiplas empresas) ──
  function _carregarDados() {
    let raw = null;
    try {
      raw = JSON.parse(localStorage.getItem(EMPRESA_LS_KEY));
    } catch {
      raw = null;
    }

    // Formato novo: já tem a estrutura de lista
    if (raw && Array.isArray(raw.empresas)) {
      if (raw.empresas.length > 0 && (!raw.ativaId || !raw.empresas.find((e) => e.id === raw.ativaId))) {
        raw.ativaId = raw.empresas[0].id;
      }
      return raw;
    }

    // Formato antigo: uma única empresa salva → migra para lista
    if (raw && typeof raw === "object") {
      const migrada = Object.assign(_empresaVazia(), raw);
      if (!migrada.id) migrada.id = generateId();
      if (!migrada.nomeAba) migrada.nomeAba = raw.nomeFantasia || raw.razaoSocial || "Empresa";
      return { empresas: [migrada], ativaId: migrada.id };
    }

    // Nada salvo → começa VAZIO (mostra o empty state)
    return { empresas: [], ativaId: null };
  }

  function _empresaAtiva() {
    if (!dados.empresas || dados.empresas.length === 0) return null;
    return dados.empresas.find((e) => e.id === dados.ativaId) || dados.empresas[0];
  }

  function _empresaVazia() {
    return {
      id: "",
      nomeAba: "",
      logo: "",
      camposOcultos: [], // IDs e Keys de campos que o usuário resolveu esconder
      camposPersonalizados: [], // {id, nome, valor, secao}
      secoesCustom: [], // seções criadas pelo usuário: {id, titulo, campos:[{id,rotulo,valor,tipo}]}
      ordemSecoes: [], // ordem personalizada das seções (fixas + custom)
      
      // Identificação
      cnpj: "", razaoSocial: "", nomeFantasia: "", dataAbertura: "",
      tipoEstabelecimento: "", naturezaJuridica: "", porte: "", capitalSocial: "",
      
      // Inscrições
      ie: "", im: "", nire: "",
      
      // Atividades
      cnaePrincipal: "", cnaeSecundario: "",
      
      // Endereço
      cep: "", logradouro: "", numero: "", complemento: "",
      bairro: "", municipio: "", uf: "",
      
      // Contato
      email: "", fixo: "", celular: "", whatsapp: "",
      
      // Situação Cadastral
      situacaoCadastral: "", dataSituacao: "", motivoSituacao: "",
      simplesNacional: "", dataSimples: "", simei: "", dataSimei: "",
      
      // QSA
      qsaNome: "", qsaDoc: "", qsaQualificacao: "",
      socios: [] // sócios adicionais: {id, nome, doc, qualificacao}
    };
  }

  // Coleta os campos fixos do DOM para o objeto da empresa ativa
  function _coletarCamposFixos() {
    if (!empresa) return;
    document.querySelectorAll("[data-emp-key]").forEach((el) => {
      empresa[el.dataset.empKey] = el.value;
    });
  }

  // Campos que impedem o salvamento quando vazios.
  // Um por linha, para acrescentar outros no futuro sem mexer na lógica.
  const CAMPOS_OBRIGATORIOS = [
    {
      chave: "impostoPorNota",
      rotulo: "Sua porcentagem de imposto por nota",
      secao: "Situação Cadastral e Regime Tributário",
    },
  ];

  /**
   * Verifica os campos obrigatórios ANTES de gravar.
   * Além do aviso, leva o usuário até o campo: rola a tela e dá foco. O
   * campo (e o nome dele) fica VERMELHO até ser preenchido — antes o
   * destaque sumia sozinho em 2,5 segundos.
   * @returns {boolean} true quando pode salvar.
   */
  function _validarObrigatorios() {
    const itens = [];
    for (const campo of CAMPOS_OBRIGATORIOS) {
      const el = document.querySelector('[data-emp-key="' + campo.chave + '"]');
      if (!el) continue; // campo ausente do HTML: não trava o salvamento
      // Campo oculto pelo usuário não é exigido — cobrá-lo seria impedir
      // o salvamento de algo que ele nem consegue ver.
      if (_ocultoPeloUsuario(el)) continue;
      // Vazio dentro de uma seção fechada: a seção abre, para o campo
      // vermelho aparecer.
      if (String(el.value || "").trim() === "") _abrirSecaoDo(el);
      itens.push({ el, msg: 'Preencha "' + campo.rotulo + '" em ' + campo.secao + "." });
    }
    if (window.BapellCampos) {
      if (!window.BapellCampos.exigir(itens)) return false;
    } else {
      const falta = itens.find((it) => String(it.el.value || "").trim() === "");
      if (falta) {
        showToast(falta.msg, "warning", 5000);
        try { falta.el.scrollIntoView({ behavior: "smooth", block: "center" }); falta.el.focus(); } catch (e) {}
        return false;
      }
    }
    return _validarDocumentos();
  }

  /**
   * CNPJ da empresa e CPF/CNPJ dos sócios: preenchidos, precisam conferir
   * (dígitos verificadores; o CNPJ pode ser alfanumérico). O que não
   * confere fica vermelho, com a explicação embaixo do campo.
   */
  function _validarDocumentos() {
    if (!window.BapellDoc) return true;
    const docs = [];
    const cnpj = document.querySelector('[data-emp-key="cnpj"]');
    if (cnpj) docs.push({ el: cnpj, tipo: "cnpj" });
    const qsa = document.querySelector('[data-emp-key="qsaDoc"]');
    if (qsa) docs.push({ el: qsa, tipo: "cpfCnpj" });
    document.querySelectorAll("#qsa-socios-extras .socio-doc").forEach((el) => docs.push({ el, tipo: "cpfCnpj" }));

    let primeiro = null;
    let primeiraMsg = "";
    docs.forEach((d) => {
      if (_ocultoPeloUsuario(d.el)) return;
      const erro = window.BapellDoc.erroDe(d.el.value, d.tipo);
      if (!erro) {
        // Corrigido (ou apagado): o vermelho de antes sai.
        if (window.BapellCampos && d.el.classList.contains("campo-erro")) window.BapellCampos.limpar(d.el);
        return;
      }
      _abrirSecaoDo(d.el);
      if (window.BapellCampos) {
        window.BapellCampos.marcar(d.el, erro, {
          resolvido: () => !window.BapellDoc.erroDe(d.el.value, d.tipo),
        });
      }
      if (!primeiro) { primeiro = d.el; primeiraMsg = erro; }
    });
    if (!primeiro) return true;
    showToast(primeiraMsg, "warning", 5000);
    if (window.BapellCampos) window.BapellCampos.focar(primeiro);
    return false;
  }

  /**
   * Campo escondido pelo usuário (Configurar Campos) — não é cobrado. Uma
   * seção fechada também esconde os campos, mas guarda como cada um estava
   * (data-_prev-display): esses continuam valendo.
   */
  function _ocultoPeloUsuario(el) {
    const grupo = el.closest(".field-group");
    if (!grupo) return false;
    const antes = grupo.dataset._prevDisplay;
    if (antes !== undefined) return antes === "none";
    return grupo.style.display === "none";
  }

  /** Abre a seção (fechada) onde está o campo, para ele aparecer. */
  function _abrirSecaoDo(el) {
    const cont = document.getElementById("empresaFieldsContainer");
    if (!cont || !el) return;
    let filho = el;
    while (filho.parentElement && filho.parentElement !== cont) filho = filho.parentElement;
    if (filho.parentElement !== cont) return;
    let titulo = filho.previousElementSibling;
    while (titulo && !titulo.classList.contains("field-section-title")) titulo = titulo.previousElementSibling;
    if (titulo && titulo.classList.contains("secao-colapsada")) titulo.click();
  }

  function _salvar() {
    if (!empresa) {
      showToast("Adicione uma empresa primeiro.", "warning");
      return;
    }
    if (!_validarObrigatorios()) return;
    _coletarCamposFixos();
    _persistir();
    _marcarSalvo();
    showToast("Dados da empresa salvos com sucesso!", "success");
  }

  function _marcarAlterado() {
    const s = document.getElementById("empresaStatus");
    if (s) {
      s.textContent = "● Alterações não salvas";
      s.style.color = "var(--clr-accent)";
    }
  }

  function _marcarSalvo() {
    const s = document.getElementById("empresaStatus");
    if (s) {
      s.textContent = "✓ Salvo";
      s.style.color = "var(--clr-success)";
    }
  }

  // Campo obrigatório vazio: fica vermelho até ser preenchido (utils.js)
  // e recebe o foco.
  function _marcarErro(el) {
    if (!el) return;
    if (window.BapellCampos) {
      window.BapellCampos.marcar(el);
      window.BapellCampos.focar(el);
    } else {
      try { el.focus(); } catch (e) {}
    }
  }

  // ══════════════════════════════════════════
  //  MODAL DE CONFIRMAÇÃO (substitui o confirm() nativo)
  // ══════════════════════════════════════════
  function _confirmarExclusao(opcoes, onConfirm) {
    const { titulo, nome, textoBotao } = opcoes;

    const existing = document.getElementById("modalConfirmExclusao");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalConfirmExclusao";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${titulo}</div>
        <div class="modal-subtitle" style="margin-bottom: var(--sp-lg);">
          Tem certeza que deseja excluir
          <strong>${(nome || "").replace(/</g, "&lt;")}</strong>?
          Esta ação não pode ser desfeita.
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="cancelConfExcl">Cancelar</button>
          <button class="btn-danger" style="padding:10px var(--sp-lg);font-size:14px;" id="confirmConfExcl">
            ${textoBotao || "Sim, excluir"}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const fechar = () => overlay.remove();

    overlay.querySelector("#cancelConfExcl").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) fechar();
    });
    overlay.querySelector("#confirmConfExcl").addEventListener("click", () => {
      fechar();
      onConfirm();
    });
  }

  // ══════════════════════════════════════════
  //  MÁSCARAS DE ENTRADA INTELIGENTES
  // ══════════════════════════════════════════
  function formatMask(value, type) {
    if(!value) return "";
    // CNPJ (inclusive o alfanumérico, com letras nas 12 primeiras posições)
    // e CPF: o formato compartilhado do utils.js (BapellDoc).
    if (window.BapellDoc && (type === "cnpj" || type === "cpfCnpj")) {
      return type === "cnpj"
        ? window.BapellDoc.formatarCNPJ(value)
        : window.BapellDoc.formatarCPFouCNPJ(value);
    }
    let v = value.replace(/\D/g, ''); // Remove tudo que não for número

    if (type === 'cnpj') {
       v = v.replace(/^(\d{2})(\d)/, '$1.$2');
       v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
       v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
       v = v.replace(/(\d{4})(\d)/, '$1-$2');
       return v.substring(0, 18);
    } 
    else if (type === 'cep') {
       v = v.replace(/^(\d{5})(\d)/, '$1-$2');
       return v.substring(0, 9);
    } 
    else if (type === 'telefone') {
       // Se for celular com 11 dígitos
       if (v.length > 10) {
         v = v.replace(/^(\d{2})(\d)/g, '($1) $2');
         v = v.replace(/(\d{5})(\d)/, '$1-$2');
         return v.substring(0, 15);
       } 
       // Se for fixo com 10 dígitos
       else if (v.length > 0) {
         v = v.replace(/^(\d{2})(\d)/g, '($1) $2');
         v = v.replace(/(\d{4})(\d)/, '$1-$2');
         return v.substring(0, 14);
       }
    } 
    else if (type === 'cpfCnpj') {
       // CPF se tiver 11 ou menos, CNPJ se passar de 11
       if (v.length <= 11) {
         v = v.replace(/(\d{3})(\d)/, '$1.$2');
         v = v.replace(/(\d{3})(\d)/, '$1.$2');
         v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
         return v;
       } else {
         v = v.replace(/^(\d{2})(\d)/, '$1.$2');
         v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
         v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
         v = v.replace(/(\d{4})(\d)/, '$1-$2');
         return v.substring(0, 18);
       }
    }
    return v;
  }

  function _aplicarMascaras() {
    // 0. Campos percentuais — mesma máscara de centavos dos demais campos
    // numéricos do app (1 → 0,01 · 1500 → 15,00). A função vem do utils.js,
    // compartilhada com Produto, Ações em Massa e Registro de Vendas.
    //
    // Fica separada do bloco de dinheiro logo abaixo porque aquele já tem
    // implementação própria nesta tela: ligar as duas no mesmo campo criaria
    // listeners em duplicidade e o valor seria formatado duas vezes por tecla.
    if (typeof aplicarMascaraMoeda === "function") {
      document.querySelectorAll(".percent-input").forEach((el) => {
        aplicarMascaraMoeda(el);
        el.addEventListener("input", () => _marcarAlterado());
      });
    }

    // 1. Dinheiro — formatação monetária EM TEMPO REAL.
    // O usuário digita só números e eles entram como centavos, da direita para
    // a esquerda: 100 → 1,00 · 1000 → 10,00 · 100000 → 1.000,00. O "R$" já vem
    // do prefixo no HTML, então formatMoneyBR devolve o número sem o símbolo.
    document.querySelectorAll(".money-input").forEach((el) => {
      el.addEventListener("input", () => {
        const digitos = el.value.replace(/\D/g, "");
        if (digitos === "") { el.value = ""; return; }
        // Os dígitos são centavos → divide por 100 para ter o valor em reais.
        const reais = parseInt(digitos, 10) / 100;
        el.value = formatMoneyBR(reais);
        // Cursor no fim (a máscara sempre cresce pela direita).
        try {
          const fim = el.value.length;
          el.setSelectionRange(fim, fim);
        } catch (e) {}
      });
      // Ao sair, garante o formato completo (cobre colagem e casos de borda).
      el.addEventListener("blur", () => {
        if (el.value.trim() === "") return;
        const n = parseFormattedValue(el.value);
        el.value = formatMoneyBR(n);
      });
    });

    // 2. Máscaras de Texto (CEP, Telefones, CNPJ)
    // CNPJ e CPF/CNPJ: além do formato, conferem os dígitos ao sair do
    // campo — o documento que não confere fica vermelho, com a explicação.
    document.querySelectorAll("[data-mask]").forEach((el) => {
      const type = el.dataset.mask;
      if (window.BapellDoc && (type === "cnpj" || type === "cpfCnpj")) {
        window.BapellDoc.ligar(el, type);
        return;
      }
      el.addEventListener("input", (e) => {
        e.target.value = formatMask(e.target.value, type);
      });
    });
  }

  // ══════════════════════════════════════════
  //  ABAS DE EMPRESAS (múltiplas empresas)
  // ══════════════════════════════════════════
  function _renderAbas() {
    const box = document.getElementById("empresaAtivaBox");
    const logoEl = document.getElementById("empresaAtivaLogo");
    const nomeEl = document.getElementById("empresaAtivaNome");
    const lista = document.getElementById("listaEmpresasDropdown");
    if (!box) return;

    const _nomeDe = (emp, idx) =>
      emp.nomeAba || emp.nomeFantasia || emp.razaoSocial || `Empresa ${idx + 1}`;

    const _miniLogo = (emp, size) => {
      const s = size || 24;
      return emp.logo
        ? `<img src="${emp.logo}" alt="" style="width:${s}px; height:${s}px; border-radius:5px; object-fit:cover; border:1px solid var(--clr-border); flex-shrink:0;" />`
        : `<span style="width:${s}px; height:${s}px; border-radius:5px; background:var(--clr-surface-alt); border:1px solid var(--clr-border); display:inline-flex; align-items:center; justify-content:center; color:var(--clr-text-3); flex-shrink:0;"><svg width="${Math.round(s * 0.6)}" height="${Math.round(s * 0.6)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V7l8-4v18"></path><path d="M19 21V11l-6-4"></path></svg></span>`;
    };

    // Caixa com logo + nome da empresa ativa
    const ativa = dados.empresas.find((e) => e.id === dados.ativaId);
    box.style.display = ativa ? "flex" : "none";
    if (ativa && logoEl && nomeEl) {
      const idx = dados.empresas.indexOf(ativa);
      const nomeAtiva = _nomeDe(ativa, idx);
      logoEl.innerHTML = _miniLogo(ativa, 28);
      nomeEl.textContent = nomeAtiva;
      box.title = nomeAtiva;
    }

    // Lista de empresas (abre pela setinha)
    if (lista) {
      lista.innerHTML = dados.empresas
        .map((emp, idx) => {
          const nome = _nomeDe(emp, idx);
          const isAtiva = emp.id === dados.ativaId;
          return `
            <button type="button" class="empresa-lista-item" data-emp-id="${emp.id}"
              style="display:flex; align-items:center; gap:8px; width:100%; background:${isAtiva ? "var(--clr-primary-lt)" : "transparent"}; border:none; cursor:pointer; padding:8px 10px; font-size:13px; font-weight:600; text-align:left; color:${isAtiva ? "var(--clr-primary)" : "var(--clr-text)"};">
              ${_miniLogo(emp, 22)}
              <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${nome.replace(/</g, "&lt;")}</span>
            </button>`;
        })
        .join("");

      // Troca de empresa ao clicar num item
      lista.querySelectorAll(".empresa-lista-item").forEach((item) => {
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          lista.style.display = "none";
          _girarSeta(false);
          const novoId = item.dataset.empId;
          if (novoId && novoId !== dados.ativaId) _trocarEmpresa(novoId);
        });
      });
    }

    _ligarControlesEmpresa();
  }

  function _girarSeta(aberto) {
    const seta = document.getElementById("setaTrocarEmpresa");
    if (seta) seta.style.transform = aberto ? "rotate(180deg)" : "rotate(0deg)";
  }

  // Liga os botões da caixa de empresa (setinha e 3 pontinhos) uma única vez
  function _ligarControlesEmpresa() {
    const btnSeta = document.getElementById("btnTrocarEmpresa");
    const lista = document.getElementById("listaEmpresasDropdown");
    const btnMenu = document.getElementById("btnMenuEmpresa");
    const menuDrop = document.getElementById("menuEmpresaDropdown");

    // Setinha → abre a lista de empresas
    if (btnSeta && lista && !btnSeta.dataset.bound) {
      btnSeta.dataset.bound = "1";
      btnSeta.addEventListener("click", (e) => {
        e.stopPropagation();
        const sb = document.getElementById("sidebar");
        // Com o menu colapsado, expande primeiro
        if (sb && sb.classList.contains("sidebar-colapsada")) {
          if (typeof toggleSidebar === "function") toggleSidebar();
          return;
        }
        if (menuDrop) menuDrop.style.display = "none";
        const abrindo = lista.style.display === "none";
        lista.style.display = abrindo ? "block" : "none";
        _girarSeta(abrindo);
      });
    }

    // 3 pontinhos → opções (excluir)
    if (btnMenu && menuDrop && !btnMenu.dataset.bound) {
      btnMenu.dataset.bound = "1";
      btnMenu.addEventListener("click", (e) => {
        e.stopPropagation();
        if (lista) { lista.style.display = "none"; _girarSeta(false); }
        menuDrop.style.display = menuDrop.style.display === "none" ? "block" : "none";
      });
      const btnExc = document.getElementById("btnExcluirEmpresa");
      if (btnExc) {
        btnExc.addEventListener("click", () => {
          menuDrop.style.display = "none";
          _excluirEmpresaAtiva();
        });
      }
    }

    // Fecha ambos ao clicar fora
    if (!document.body.dataset.boundEmpresaOutside) {
      document.body.dataset.boundEmpresaOutside = "1";
      document.addEventListener("click", (e) => {
        const l = document.getElementById("listaEmpresasDropdown");
        const m = document.getElementById("menuEmpresaDropdown");
        const bs = document.getElementById("btnTrocarEmpresa");
        const bm = document.getElementById("btnMenuEmpresa");
        if (l && !l.contains(e.target) && (!bs || !bs.contains(e.target))) {
          l.style.display = "none";
          _girarSeta(false);
        }
        if (m && !m.contains(e.target) && (!bm || !bm.contains(e.target))) {
          m.style.display = "none";
        }
      });
    }

    // Com o menu colapsado, clicar na logo expande (a setinha está escondida)
    const boxEl = document.getElementById("empresaAtivaBox");
    if (boxEl && !boxEl.dataset.boundClick) {
      boxEl.dataset.boundClick = "1";
      boxEl.addEventListener("click", (e) => {
        const sb = document.getElementById("sidebar");
        if (sb && sb.classList.contains("sidebar-colapsada")) {
          if (typeof toggleSidebar === "function") toggleSidebar();
        }
      });
    }
  }

  // Exclui a empresa ativa (com confirmação)
  function _excluirEmpresaAtiva() {
    const emp = dados.empresas.find((e) => e.id === dados.ativaId);
    if (!emp) return;
    const idx = dados.empresas.indexOf(emp);
    const nome = emp.nomeAba || emp.nomeFantasia || emp.razaoSocial || `Empresa ${idx + 1}`;

    _confirmarExclusao(
      { titulo: "Excluir empresa?", nome: nome, textoBotao: "Sim, excluir" },
      async () => {
        // Apaga os arquivos anexados desta empresa (IndexedDB)
        await _apagarArquivosEmpresa(emp.id);

        // Marca como excluída para o _persistir (read-before-write) não
        // ressuscitar esta empresa a partir da versão em disco de outra aba.
        if (!Array.isArray(dados._excluidas)) dados._excluidas = [];
        if (!dados._excluidas.includes(emp.id)) dados._excluidas.push(emp.id);

        dados.empresas = dados.empresas.filter((x) => x.id !== emp.id);
        if (dados.empresas.length === 0) {
          dados.ativaId = null;
        } else if (dados.ativaId === emp.id) {
          dados.ativaId = dados.empresas[0].id;
        }
        empresa = _empresaAtiva();
        _persistir();
        _recarregarTela();
        showToast("Empresa removida.", "success");
      },
    );
  }

  // Salva a empresa atual e troca para outra
  function _trocarEmpresa(novoId) {
    // Trocar salva o que está na tela — como o Salvar. Se ele pede usuário
    // e senha (Usuários e Senhas › Senha nos botões), pede aqui também.
    _exigirSenhaDoSalvar("Trocar de empresa salva as alterações desta.").then((ok) => {
      if (!ok) return;
      _coletarCamposFixos(); // salva o que está na tela na empresa atual
      _persistir();
      dados.ativaId = novoId;
      empresa = _empresaAtiva();
      _recarregarTela();
      _limparStatus(); // o que estava na tela foi salvo
    });
  }

  /**
   * Antes de um caminho que salva a empresa da tela sem o botão Salvar
   * (trocar ou adicionar empresa): com alterações não salvas e o Salvar
   * pedindo usuário e senha, pede a senha. Resolve true para seguir.
   */
  function _exigirSenhaDoSalvar(motivo) {
    const st = document.getElementById("empresaStatus");
    const temAlteracao = !!(st && st.textContent.indexOf("não salvas") >= 0);
    if (!temAlteracao || !window.BapellSenhas || typeof window.BapellSenhas.exigirBotao !== "function") {
      return Promise.resolve(true);
    }
    return window.BapellSenhas.exigirBotao("empresa:salvar", { motivo });
  }

  // Sem nada pendente (acabou de salvar, trocar ou cancelar): status vazio.
  function _limparStatus() {
    const s = document.getElementById("empresaStatus");
    if (s) {
      s.textContent = "";
      s.style.color = "";
    }
  }

  // Recarrega toda a tela com os dados da empresa ativa
  function _recarregarTela() {
    // Outra empresa na tela: o vermelho da anterior não passa para ela.
    if (window.BapellCampos) {
      window.BapellCampos.limparTodos(document.getElementById("empresaFieldsContainer") || undefined);
    }
    _atualizarVisibilidadeGeral();
    _renderAbas();
    if (_empresaAtiva()) {
      _limparCamposFixos();
      _popular();
    }
  }

  // Mostra o empty state OU a ficha, conforme houver empresas
  /**
   * Grava os dados da empresa no localStorage.
   *
   * As logos ficam em base64 aqui: a cota (~5 MB) pode estourar. Sem este
   * try/catch o erro era engolido e a pessoa fechava o app achando que salvou.
   *
   * @returns {boolean} true se gravou
   */
  function _persistir() {
    try {
      // Read-before-write: outra aba pode ter criado/editado empresas desde que
      // esta carregou `dados`. Gravar direto o `dados` da memória apagaria o que
      // a outra aba salvou (mudar um telefone aqui removeria uma empresa criada
      // lá). Então relemos o disco e mesclamos por id antes de gravar.
      let noDisco = null;
      try { noDisco = JSON.parse(localStorage.getItem(EMPRESA_LS_KEY)); } catch (_) { noDisco = null; }

      if (noDisco && Array.isArray(noDisco.empresas)) {
        const porId = new Map();
        // Base: o que está no disco (empresas de outras abas)
        noDisco.empresas.forEach((e) => { if (e && e.id) porId.set(e.id, e); });
        // Sobrepõe com o estado desta aba (nossas edições vencem para as nossas)
        dados.empresas.forEach((e) => { if (e && e.id) porId.set(e.id, e); });

        // Empresas que ESTA aba excluiu de propósito não devem "voltar" do disco.
        if (Array.isArray(dados._excluidas)) {
          dados._excluidas.forEach((id) => porId.delete(id));
        }

        dados.empresas = Array.from(porId.values());
        // ativaId: mantém o desta aba se ainda existir; senão o do disco
        if (!dados.empresas.find((e) => e.id === dados.ativaId)) {
          dados.ativaId = (noDisco.ativaId && dados.empresas.find((e) => e.id === noDisco.ativaId))
            ? noDisco.ativaId
            : (dados.empresas[0] ? dados.empresas[0].id : null);
        }
      }

      // _excluidas é só um marcador de sessão para o merge — não vai ao disco.
      const paraGravar = Object.assign({}, dados);
      delete paraGravar._excluidas;
      localStorage.setItem(EMPRESA_LS_KEY, JSON.stringify(paraGravar));
      return true;
    } catch (e) {
      console.error("Falha ao salvar dados da empresa:", e);
      if (typeof PrecifiqErros !== "undefined") {
        PrecifiqErros.registrar("Falha ao salvar empresa", String(e));
      }
      if (typeof showToast === "function") {
        showToast(
          e && e.name === "QuotaExceededError"
            ? "Armazenamento cheio. Remova logos grandes ou faça um backup."
            : "Não foi possível salvar. Tente novamente.",
          "error",
          5000,
        );
      }
      return false;
    }
  }

  function _atualizarVisibilidadeGeral() {
    const temEmpresa = dados.empresas && dados.empresas.length > 0;
    const emptyEl = document.getElementById("empresaEmptyState");
    const cardEl = document.getElementById("empresaCard");
    const saveBar = document.getElementById("empresaSaveBar");
    const secoesCustom = document.getElementById("secoesCustomContainer");

    if (emptyEl) emptyEl.style.display = temEmpresa ? "none" : "";
    if (cardEl) cardEl.style.display = temEmpresa ? "" : "none";
    if (saveBar) saveBar.style.display = temEmpresa ? "" : "none";
    if (secoesCustom) secoesCustom.style.display = temEmpresa ? "" : "none";
  }

  // Limpa os inputs fixos antes de popular com outra empresa
  function _limparCamposFixos() {
    document.querySelectorAll("[data-emp-key]").forEach((el) => {
      el.value = "";
      const group = el.closest(".field-group");
      if (group) group.style.display = "";
    });
  }

  // ══════════════════════════════════════════
  //  POPULAR & RENDERIZAR
  // ══════════════════════════════════════════
  function _popular() {
    if (!empresa) return;
    document.querySelectorAll("[data-emp-key]").forEach((el) => {
      const key = el.dataset.empKey;
      let val = empresa[key] ?? "";
      
      // Validação de Money ou Máscara antes de jogar no input
      if (el.classList.contains("money-input") && val !== "") {
        val = formatMoneyBR(parseFormattedValue(val));
      } else if (el.dataset.mask && val !== "") {
        val = formatMask(val, el.dataset.mask);
      }

      el.value = val;
      if (!el.dataset._inputBound) {
        el.addEventListener("input", (e) => {
          // Se editar o Nome Fantasia, atualiza o nome da aba junto
          if (key === "nomeFantasia" && empresa) {
            empresa.nomeAba = e.target.value;
            _renderAbas();
          }
          _marcarAlterado();
        });
        el.dataset._inputBound = "1";
      }
    });

    _mostrarLogo(empresa.logo);
    _renderCamposCustom();
    _renderSocios();
    _aplicarOrdemSecoes();
    _renderSecoesCustom();
    _aplicarVisibilidade();
    _tornarSecoesColapsaveis();
  }

  // ══════════════════════════════════════════
  //  COLAPSAR / EXPANDIR SEÇÕES
  //  (mesmo botão da tela "Informações de Venda")
  // ══════════════════════════════════════════
  const SECOES_COLAPSADAS_KEY = "precifiq_empresa_colapsadas";

  function _lerColapsadas() {
    try {
      const arr = JSON.parse(localStorage.getItem(SECOES_COLAPSADAS_KEY));
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function _persistirColapsada(id, colapsada) {
    let arr = _lerColapsadas();
    if (colapsada) {
      if (!arr.includes(id)) arr.push(id);
    } else {
      arr = arr.filter((x) => x !== id);
    }
    try {
      localStorage.setItem(SECOES_COLAPSADAS_KEY, JSON.stringify(arr));
    } catch (e) {
      console.error("Falha ao salvar estado das seções:", e);
    }
  }

  function _tornarSecoesColapsaveis() {
    document.querySelectorAll(".field-section-title").forEach((title) => {
      // Evita reprocessar se já tem o botão
      if (title.querySelector(".secao-chevron-btn")) return;

      const id = title.dataset.group || title.textContent.trim();

      // Cabeçalho clicável (mesmo visual do vendas)
      title.classList.add("secao-header-inline");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "secao-chevron-btn";
      btn.title = "Abrir/Fechar seção";
      btn.setAttribute("aria-label", "Abrir ou fechar seção");
      btn.innerHTML =
        '<svg class="secao-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
      title.appendChild(btn);

      // Aplica o estado escondendo/mostrando os irmãos até o próximo
      // título de seção. Respeita campos ocultados pela config.
      const aplicar = (colapsado) => {
        title.classList.toggle("secao-colapsada", colapsado);
        btn.setAttribute("aria-expanded", String(!colapsado));
        let next = title.nextElementSibling;
        while (next && !next.classList.contains("field-section-title")) {
          if (colapsado) {
            if (next.dataset._prevDisplay === undefined) {
              next.dataset._prevDisplay = next.style.display || "";
            }
            next.style.display = "none";
          } else {
            next.style.display = next.dataset._prevDisplay || "";
            delete next.dataset._prevDisplay;
          }
          next = next.nextElementSibling;
        }
      };

      // Estado inicial salvo (a config de visibilidade já rodou antes)
      if (_lerColapsadas().includes(id)) {
        aplicar(true);
      } else {
        btn.setAttribute("aria-expanded", "true");
      }

      title.addEventListener("click", () => {
        const colapsado = !title.classList.contains("secao-colapsada");
        aplicar(colapsado);
        _persistirColapsada(id, colapsado);
      });
    });
  }

  // ══════════════════════════════════════════
  //  SÓCIOS ADICIONAIS (QSA)
  // ══════════════════════════════════════════
  function _renderSocios() {
    const container = document.getElementById("qsa-socios-extras");
    if (!container) return;
    container.innerHTML = "";
    if (!empresa) return;

    (empresa.socios || []).forEach((socio) => {
      const bloco = document.createElement("div");
      bloco.style.cssText = "display: contents;";
      bloco.dataset.socioId = socio.id;
      bloco.innerHTML = `
        <div class="field-group col-5">
          <label style="display:flex; justify-content:space-between; align-items:center;">
            <span>Nome do Sócio / Administrador</span>
            <button type="button" class="btn-remove-socio" style="background:transparent; border:none; color:var(--clr-danger); cursor:pointer; font-size:10px;">Remover</button>
          </label>
          <input type="text" class="input-field socio-nome" value="${(socio.nome || "").replace(/"/g, "&quot;")}" placeholder="Nome Completo" />
        </div>
        <div class="field-group col-4">
          <label>CPF ou CNPJ do Sócio</label>
          <input type="text" class="input-field socio-doc" value="${(socio.doc || "").replace(/"/g, "&quot;")}" placeholder="CPF ou CNPJ" />
        </div>
        <div class="field-group col-3">
          <label>Qualificação do Sócio</label>
          <input type="text" class="input-field socio-qual" value="${(socio.qualificacao || "").replace(/"/g, "&quot;")}" placeholder="Administrador, Diretor..." />
        </div>
      `;

      bloco.querySelector(".socio-nome").addEventListener("input", (e) => {
        socio.nome = e.target.value;
        _marcarAlterado();
      });
      bloco.querySelector(".socio-doc").addEventListener("input", (e) => {
        e.target.value = formatMask(e.target.value, "cpfCnpj");
        socio.doc = e.target.value;
        _marcarAlterado();
      });
      // Confere os dígitos ao sair do campo (fica vermelho se não conferir).
      if (window.BapellDoc) window.BapellDoc.ligar(bloco.querySelector(".socio-doc"), "cpfCnpj");
      bloco.querySelector(".socio-qual").addEventListener("input", (e) => {
        socio.qualificacao = e.target.value;
        _marcarAlterado();
      });
      bloco.querySelector(".btn-remove-socio").addEventListener("click", () => {
        empresa.socios = empresa.socios.filter((s) => s.id !== socio.id);
        _renderSocios();
        _marcarAlterado();
      });

      container.appendChild(bloco);
    });
  }

  function _renderCamposCustom() {
    document.querySelectorAll(".custom-fields-container").forEach(el => el.innerHTML = "");
    if (!empresa) return;

    const list = empresa.camposPersonalizados || [];
    list.forEach((campo) => {
      const secaoId = campo.secao ? `custom-${campo.secao}` : "custom-identificacao";
      const container = document.getElementById(secaoId);
      if (!container) return;

      const wrapper = document.createElement("div");
      wrapper.className = "field-group custom-field-box col-4"; 
      wrapper.dataset.customId = campo.id;
      
      wrapper.innerHTML = `
        <label style="display:flex; justify-content:space-between; align-items:center;">
          <span style="color:var(--clr-accent);">${campo.nome}</span>
          <button type="button" class="btn-remove-custom" style="background:transparent; border:none; color:var(--clr-danger); cursor:pointer; font-size:10px;">Excluir</button>
        </label>
        <input type="text" class="input-field" value="${(campo.valor || "").replace(/"/g, "&quot;")}" />
      `;

      wrapper.querySelector("input").addEventListener("input", (e) => {
        campo.valor = e.target.value;
        _marcarAlterado();
      });

      wrapper.querySelector(".btn-remove-custom").addEventListener("click", () => {
        _confirmarExclusao(
          { titulo: "Excluir campo?", nome: campo.nome, textoBotao: "Sim, excluir" },
          () => {
            empresa.camposPersonalizados = empresa.camposPersonalizados.filter(c => c.id !== campo.id);
            _renderCamposCustom();
            _marcarAlterado();
          },
        );
      });

      container.appendChild(wrapper);
    });

    _aplicarVisibilidade();
  }

  // ══════════════════════════════════════════
  //  SEÇÕES PERSONALIZADAS (Adicionar Seção)
  // ══════════════════════════════════════════
  function _escSec(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Prefixo/sufixo e placeholder conforme o tipo do campo
  function _tipoInfo(tipo) {
    switch (tipo) {
      case "money":  return { prefix: "R$", suffix: "", placeholder: "0,00", inputmode: "decimal" };
      case "percent":return { prefix: "", suffix: "%", placeholder: "0", inputmode: "decimal" };
      case "number": return { prefix: "", suffix: "", placeholder: "0", inputmode: "numeric" };
      default:       return { prefix: "", suffix: "", placeholder: "Digite...", inputmode: "text" };
    }
  }

  function _renderSecoesCustom() {
    const container = document.getElementById("secoesCustomContainer");
    if (!container || !empresa) return;
    container.innerHTML = "";

    (empresa.secoesCustom || []).forEach((secao) => {
      const card = document.createElement("div");
      card.className = "card mb-lg";
      card.style.width = "100%";
      card.dataset.secaoId = secao.id;

      card.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px;">
          <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
            <span class="card-title-dot"></span>
            <input type="text" class="input-field secao-titulo-input"
                   value="${_escSec(secao.titulo)}" placeholder="Título da seção"
                   style="font-size:15px; font-weight:700; border:1px solid transparent; background:transparent; padding:4px 6px; flex:1; min-width:0;" />
          </div>
          <button type="button" class="btn-secondary secao-remover" style="font-size:12px; padding:6px 12px; flex-shrink:0;">
            Remover Seção
          </button>
        </div>
        <div class="empresa-grid secao-campos"></div>
        <button type="button" class="btn-secondary secao-add-campo" style="font-size:13px; margin-top:12px;">
          + &nbsp;Adicionar Campo
        </button>
      `;

      // Título editável
      const tituloInput = card.querySelector(".secao-titulo-input");
      tituloInput.addEventListener("input", (e) => {
        secao.titulo = e.target.value;
        _marcarAlterado();
      });
      tituloInput.addEventListener("focus", () => {
        tituloInput.style.borderColor = "var(--clr-border)";
      });
      tituloInput.addEventListener("blur", () => {
        tituloInput.style.borderColor = "transparent";
      });

      // Remover seção
      card.querySelector(".secao-remover").addEventListener("click", () => {
        _confirmarExclusao(
          { titulo: "Excluir seção?", nome: secao.titulo || "seção", textoBotao: "Sim, excluir" },
          () => {
            empresa.secoesCustom = empresa.secoesCustom.filter((s) => s.id !== secao.id);
            _renderSecoesCustom();
            _marcarAlterado();
          },
        );
      });

      // Adicionar campo → abre modal de tipo
      card.querySelector(".secao-add-campo").addEventListener("click", () => {
        _abrirModalTipoCampo((tipo, rotulo) => {
          if (!secao.campos) secao.campos = [];
          secao.campos.push({ id: generateId(), rotulo: rotulo, valor: "", tipo: tipo });
          _renderSecoesCustom();
          _marcarAlterado();
        });
      });

      // Renderiza os campos da seção
      const campos = card.querySelector(".secao-campos");
      (secao.campos || []).forEach((campo) => {
        const info = _tipoInfo(campo.tipo);
        const fg = document.createElement("div");
        fg.className = "field-group col-4";
        fg.innerHTML = `
          <label style="display:flex; justify-content:space-between; align-items:center;">
            <span>${_escSec(campo.rotulo)}</span>
            <button type="button" class="btn-remove-campo-sec" style="background:transparent; border:none; color:var(--clr-danger); cursor:pointer; font-size:10px;">Excluir</button>
          </label>
          <div class="input-addon-wrap ${info.suffix ? "input-addon-wrap-suffix" : ""}">
            ${info.prefix ? `<span class="input-prefix">${info.prefix}</span>` : ""}
            <input type="text" class="input-field secao-campo-input"
                   inputmode="${info.inputmode}"
                   value="${_escSec(campo.valor)}" placeholder="${info.placeholder}" />
            ${info.suffix ? `<span class="input-suffix">${info.suffix}</span>` : ""}
          </div>
        `;

        const input = fg.querySelector(".secao-campo-input");
        input.addEventListener("input", (e) => {
          campo.valor = e.target.value;
          _marcarAlterado();
        });
        // Formatação R$ / % ao sair do campo
        if (campo.tipo === "money" || campo.tipo === "percent") {
          input.addEventListener("blur", () => {
            if (input.value.trim() === "") return;
            const n = parseFormattedValue(input.value);
            input.value = campo.tipo === "money" ? formatMoneyBR(n) : formatPercentBR(n);
            campo.valor = input.value;
          });
        } else if (campo.tipo === "number") {
          input.addEventListener("input", () => {
            input.value = input.value.replace(/[^\d]/g, "");
            campo.valor = input.value;
          });
        }

        fg.querySelector(".btn-remove-campo-sec").addEventListener("click", () => {
          secao.campos = secao.campos.filter((c) => c.id !== campo.id);
          _renderSecoesCustom();
          _marcarAlterado();
        });

        campos.appendChild(fg);
      });

      container.appendChild(card);
    });
  }

  // Modal para escolher o tipo do campo + digitar o rótulo
  function _abrirModalTipoCampo(onConfirm) {
    const existing = document.getElementById("modalTipoCampo");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalTipoCampo";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">Novo Campo</div>
        <div class="modal-subtitle" style="margin-bottom: var(--sp-lg);">
          Escolha o tipo e dê um nome ao campo.
        </div>
        <div class="field-group" style="margin-bottom: var(--sp-md);">
          <label>Nome do Campo</label>
          <input type="text" id="inputRotuloCampo" class="input-field" placeholder="Ex: Taxa de entrega" />
        </div>
        <div class="field-group" style="margin-bottom: var(--sp-lg);">
          <label>Tipo</label>
          <div id="tipoCampoOpcoes" style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <button type="button" class="btn-secondary tipo-opt active" data-tipo="text">Texto</button>
            <button type="button" class="btn-secondary tipo-opt" data-tipo="money">R$ (dinheiro)</button>
            <button type="button" class="btn-secondary tipo-opt" data-tipo="percent">% (porcentagem)</button>
            <button type="button" class="btn-secondary tipo-opt" data-tipo="number">Número</button>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="cancelTipoCampo">Cancelar</button>
          <button class="btn-primary" id="confirmTipoCampo" style="padding:10px var(--sp-lg);font-size:14px;">
            Adicionar
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    let tipoEscolhido = "text";
    const input = document.getElementById("inputRotuloCampo");
    const fechar = () => overlay.remove();

    // Seleção de tipo
    overlay.querySelectorAll(".tipo-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        overlay.querySelectorAll(".tipo-opt").forEach((b) => {
          b.classList.remove("active");
          b.style.borderColor = "";
          b.style.color = "";
        });
        btn.classList.add("active");
        btn.style.borderColor = "var(--clr-primary)";
        btn.style.color = "var(--clr-primary)";
        tipoEscolhido = btn.dataset.tipo;
      });
    });
    // Marca o primeiro como ativo visualmente
    const primeiro = overlay.querySelector(".tipo-opt.active");
    if (primeiro) { primeiro.style.borderColor = "var(--clr-primary)"; primeiro.style.color = "var(--clr-primary)"; }

    const confirmar = () => {
      const rotulo = input.value.trim();
      if (!rotulo) {
        showToast("Digite o nome do campo.", "warning");
        _marcarErro(input);
        return;
      }
      fechar();
      onConfirm(tipoEscolhido, rotulo);
    };

    document.getElementById("cancelTipoCampo").addEventListener("click", fechar);
    document.getElementById("confirmTipoCampo").addEventListener("click", confirmar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmar(); });

    setTimeout(() => input.focus(), 60);
  }

  // Adiciona uma nova seção vazia
  function _adicionarSecao() {
    if (!empresa) {
      showToast("Adicione uma empresa primeiro.", "warning");
      return;
    }
    if (!empresa.secoesCustom) empresa.secoesCustom = [];
    const novaSecao = {
      id: generateId(),
      titulo: "Nova Seção",
      campos: [],
    };
    empresa.secoesCustom.push(novaSecao);
    _renderSecoesCustom();
    _marcarAlterado();

    // Desce a tela até a seção recém-criada
    setTimeout(() => {
      const container = document.getElementById("secoesCustomContainer");
      if (container && container.lastElementChild) {
        container.lastElementChild.scrollIntoView({ behavior: "smooth", block: "center" });
        const tituloInput = container.lastElementChild.querySelector(".secao-titulo-input");
        if (tituloInput) tituloInput.focus();
      }
    }, 60);
  }

  // ══════════════════════════════════════════
  //  ORDENAR POSIÇÃO DAS SEÇÕES (drag and drop)
  // ══════════════════════════════════════════

  // Nomes amigáveis das seções fixas
  const _SECOES_FIXAS = [
    { key: "identificacao", nome: "Identificação Principal e Porte" },
    { key: "inscricoes",    nome: "Inscrições" },
    { key: "atividades",    nome: "Atividades (CNAE)" },
    { key: "endereco",      nome: "Endereço" },
    { key: "contato",       nome: "Contato" },
    { key: "situacao",      nome: "Situação Cadastral" },
    { key: "qsa",           nome: "Quadro de Sócios (QSA)" },
  ];

  // Monta a lista de seções na ordem atual (fixas + custom)
  function _listarSecoesOrdenadas() {
    const fixas = _SECOES_FIXAS.map((s) => ({ id: "fixa:" + s.key, nome: s.nome, tipo: "fixa" }));
    const custom = (empresa.secoesCustom || []).map((s) => ({
      id: "custom:" + s.id,
      nome: s.titulo || "Seção sem nome",
      tipo: "custom",
    }));
    const todas = [...fixas, ...custom];

    // Aplica a ordem salva, se houver
    const ordem = empresa.ordemSecoes || [];
    if (ordem.length) {
      todas.sort((a, b) => {
        let ia = ordem.indexOf(a.id);
        let ib = ordem.indexOf(b.id);
        if (ia === -1) ia = 999;
        if (ib === -1) ib = 999;
        return ia - ib;
      });
    }
    return todas;
  }

  // Aplica a ordem das seções no DOM (reorganiza os blocos na tela)
  function _aplicarOrdemSecoes() {
    if (!empresa) return;
    const salva = empresa.ordemSecoes || [];
    const ordem = salva.length ? salva : _ordemOriginalSecoes;
    if (!ordem.length) return;

    // 1) Seções fixas dentro do #empresaFieldsContainer
    const container = document.getElementById("empresaFieldsContainer");
    if (container) {
      // Agrupa cada seção fixa: título + elementos até o próximo título
      const grupos = {}; // key → array de nós
      let atual = null;
      Array.from(container.children).forEach((el) => {
        if (el.classList.contains("field-section-title")) {
          atual = el.dataset.group;
          grupos[atual] = [el];
        } else if (atual) {
          grupos[atual].push(el);
        }
      });

      // Reanexa na ordem definida (só as fixas presentes em grupos)
      ordem.forEach((secId) => {
        if (secId.startsWith("fixa:")) {
          const key = secId.slice(5);
          if (grupos[key]) {
            grupos[key].forEach((node) => container.appendChild(node));
          }
        }
      });
    }

    // 2) Seções custom: reordena o array conforme a ordem salva
    if (empresa.secoesCustom && empresa.secoesCustom.length) {
      empresa.secoesCustom.sort((a, b) => {
        let ia = ordem.indexOf("custom:" + a.id);
        let ib = ordem.indexOf("custom:" + b.id);
        if (ia === -1) ia = 999;
        if (ib === -1) ib = 999;
        return ia - ib;
      });
    }
  }

  // Abre o modal de ordenação com drag-and-drop
  function _abrirModalOrdenarSecoes() {
    if (!empresa) {
      showToast("Adicione uma empresa primeiro.", "warning");
      return;
    }

    const existing = document.getElementById("modalOrdenarSecoes");
    if (existing) existing.remove();

    const secoes = _listarSecoesOrdenadas();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalOrdenarSecoes";
    overlay.innerHTML = `
      <div class="modal" style="max-width:460px; width:90%;">
        <div class="modal-title">Ordenar Posição das Seções</div>
        <div class="modal-subtitle" style="margin-bottom: var(--sp-lg);">
          Arraste as seções pelo ícone <strong>☰</strong> para reordenar.
        </div>
        <div id="listaOrdenarSecoes" style="display:flex; flex-direction:column; gap:8px; max-height:50vh; overflow-y:auto;">
          ${secoes.map((s) => `
            <div class="ordenar-secao-item" draggable="true" data-sec-id="${s.id}"
                 style="display:flex; align-items:center; gap:12px; padding:12px 14px;
                        background:var(--clr-surface-alt); border:1px solid var(--clr-border);
                        border-radius:var(--r-md); cursor:grab; user-select:none;">
              <span style="color:var(--clr-text-3); font-size:16px; line-height:1; cursor:grab;">☰</span>
              <span style="font-size:14px; font-weight:600; color:var(--clr-text);">${(s.nome || "").replace(/</g, "&lt;")}</span>
              ${s.tipo === "custom" ? '<span style="margin-left:auto; font-size:10px; color:var(--clr-primary); font-weight:700; text-transform:uppercase;">Custom</span>' : ""}
            </div>
          `).join("")}
        </div>
        <div class="modal-actions" style="margin-top: var(--sp-lg);">
          <button class="btn-secondary" id="cancelOrdenarSecoes">Cancelar</button>
          <button class="btn-primary" id="salvarOrdenarSecoes" style="padding:10px var(--sp-lg);font-size:14px;">
            Salvar Ordem
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const lista = document.getElementById("listaOrdenarSecoes");
    let dragEl = null;

    lista.querySelectorAll(".ordenar-secao-item").forEach((item) => {
      item.addEventListener("dragstart", (e) => {
        dragEl = item;
        item.style.opacity = "0.4";
        e.dataTransfer.effectAllowed = "move";
      });
      item.addEventListener("dragend", () => {
        item.style.opacity = "1";
        dragEl = null;
      });
      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        const alvo = e.currentTarget;
        if (!dragEl || dragEl === alvo) return;
        const rect = alvo.getBoundingClientRect();
        const meio = rect.top + rect.height / 2;
        if (e.clientY < meio) {
          lista.insertBefore(dragEl, alvo);
        } else {
          lista.insertBefore(dragEl, alvo.nextSibling);
        }
      });
    });

    const fechar = () => overlay.remove();

    document.getElementById("cancelOrdenarSecoes").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });

    document.getElementById("salvarOrdenarSecoes").addEventListener("click", () => {
      // Captura a nova ordem
      const novaOrdem = Array.from(lista.querySelectorAll(".ordenar-secao-item"))
        .map((el) => el.dataset.secId);
      empresa.ordemSecoes = novaOrdem;
      _aplicarOrdemSecoes();
      _renderSecoesCustom();
      _marcarAlterado();
      fechar();
      showToast("Ordem das seções atualizada!", "success");
    });
  }

  // ══════════════════════════════════════════
  //  SISTEMA DE OCULTAR / MOSTRAR CAMPOS
  // ══════════════════════════════════════════
  function _aplicarVisibilidade() {
    if (!empresa) return;
    const ocultos = empresa.camposOcultos || [];
    
    document.querySelectorAll("[data-emp-key]").forEach((el) => {
      const key = el.dataset.empKey;
      const group = el.closest(".field-group");
      if (group) group.style.display = ocultos.includes(key) ? "none" : "";
    });

    document.querySelectorAll("[data-custom-id]").forEach((el) => {
      const id = el.dataset.customId;
      el.style.display = ocultos.includes(id) ? "none" : "";
    });

    document.querySelectorAll(".field-section-title").forEach((title) => {
      let hasVisibleChild = false;
      let next = title.nextElementSibling;
      while (next && !next.classList.contains("field-section-title")) {
        if (next.style.display !== "none" && (next.classList.contains("field-group") || next.querySelector('.field-group:not([style*="display: none"])'))) {
          hasVisibleChild = true;
          break;
        }
        next = next.nextElementSibling;
      }
      title.style.display = hasVisibleChild ? "" : "none";
    });

    _manterRecolhidas();
  }

  /**
   * Seção recolhida continua recolhida. A visibilidade acima reabre os
   * campos de todas as seções (troca de empresa, Cancelar, Configurar
   * Campos): nas recolhidas, eles voltam a ficar escondidos — e o que cada
   * um mostra ao abrir a seção passa a ser o que a configuração definiu.
   */
  function _manterRecolhidas() {
    document.querySelectorAll(".field-section-title.secao-colapsada").forEach((title) => {
      let next = title.nextElementSibling;
      while (next && !next.classList.contains("field-section-title")) {
        // Campo controlado pela configuração (o display dele acabou de ser
        // definido acima) ou algo que voltou a aparecer: guarda o atual.
        const controlado = next.hasAttribute("data-custom-id") ||
          (next.classList.contains("field-group") && !!next.querySelector("[data-emp-key]"));
        if (controlado || next.style.display !== "none" || next.dataset._prevDisplay === undefined) {
          next.dataset._prevDisplay = next.style.display || "";
        }
        next.style.display = "none";
        next = next.nextElementSibling;
      }
    });
  }

  // ══════════════════════════════════════════
  //  MODAL DE CONFIGURAÇÃO COM 'X' DE FECHAR
  // ══════════════════════════════════════════
  document.getElementById("btnConfigCampos").addEventListener("click", _abrirModalConfig);

  function _abrirModalConfig() {
    if (!empresa) {
      showToast("Adicione uma empresa primeiro.", "warning");
      return;
    }
    const existing = document.getElementById("modalConfigEmpresa");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalConfigEmpresa";

    let htmlList = "";
    
    document.querySelectorAll("[data-emp-key]").forEach(el => {
        const key = el.dataset.empKey;
        const label = el.closest(".field-group").querySelector("label").textContent.replace('?', '');
        const isOculto = empresa.camposOcultos.includes(key);
        htmlList += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--clr-surface-alt); margin-bottom:6px; border-radius:6px; border:1px solid var(--clr-border);">
                <span style="font-size:12px; color:var(--clr-text); font-weight: 600;">${label}</span>
                <button type="button" class="btn-toggle-vis btn-secondary" data-key="${key}" data-oculto="${isOculto}" style="font-size:11px; padding:3px 12px; min-height:auto;">
                    ${isOculto ? 'Mostrar' : 'Ocultar'}
                </button>
            </div>
        `;
    });

    (empresa.camposPersonalizados || []).forEach(c => {
        const isOculto = empresa.camposOcultos.includes(c.id);
        htmlList += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--clr-surface-alt); margin-bottom:6px; border-radius:6px; border:1px solid var(--clr-border);">
                <span style="font-size:12px; color:var(--clr-accent); font-weight: 600;">${c.nome} (Pers.)</span>
                <button type="button" class="btn-toggle-vis btn-secondary" data-key="${c.id}" data-oculto="${isOculto}" style="font-size:11px; padding:3px 12px; min-height:auto;">
                    ${isOculto ? 'Mostrar' : 'Ocultar'}
                </button>
            </div>
        `;
    });

    overlay.innerHTML = `
      <div class="modal" style="max-width:500px; width:90%; max-height:85vh; display:flex; flex-direction:column; position: relative;">
        <!-- Título + Botão Fechar X no canto direito -->
        <div class="modal-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Configurar Campos</span>
          <button type="button" id="btnFecharModalTopX" style="background:transparent; border:none; color:var(--clr-text-3); font-size:22px; cursor:pointer; padding: 0 4px; line-height: 1;">✕</button>
        </div>
        
        <div class="modal-subtitle">Oculte campos que você não precisa utilizar ou crie novos.</div>
        
        <div style="overflow-y:auto; flex:1; margin-bottom:16px; padding-right:8px;" id="configFieldsList">
            ${htmlList}
        </div>

        <div style="border-top:1px dashed var(--clr-border); padding-top:16px; margin-bottom:16px;">
            <label style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--clr-primary); display:block; margin-bottom:10px;">+ Adicionar Novo Campo</label>
            <div style="display:flex; flex-direction:column; gap:8px;">
                <input type="text" id="novoCampoNome" class="input-field" placeholder="Ex: Inscrição SUFRAMA" />
                <div style="display:flex; gap:8px;">
                  <select id="novoCampoSecao" class="input-field" style="flex:1;">
                    <option value="identificacao">Em Identificação e Porte</option>
                    <option value="inscricoes">Em Inscrições Fiscais</option>
                    <option value="atividades">Em Atividades Econômicas</option>
                    <option value="endereco">Em Endereço (Localização)</option>
                    <option value="contato">Em Contato</option>
                    <option value="situacao">Em Situação Cadastral</option>
                    <option value="qsa">Em Quadro de Sócios (QSA)</option>
                  </select>
                  <button type="button" id="btnCriarNovoCampo" class="btn-secondary">Criar</button>
                </div>
            </div>
        </div>

        <div class="modal-actions" style="margin-top:0;">
          <button class="btn-primary" id="btnFecharModalBottom" style="width:100%;">Concluir e Salvar Preferências</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelectorAll(".btn-toggle-vis").forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        let isOculto = btn.dataset.oculto === "true";
        
        isOculto = !isOculto; 
        btn.dataset.oculto = isOculto;
        btn.innerHTML = isOculto ? 'Mostrar' : 'Ocultar';
        btn.style.opacity = isOculto ? '0.6' : '1';

        if (isOculto) {
          if (!empresa.camposOcultos.includes(key)) empresa.camposOcultos.push(key);
        } else {
          empresa.camposOcultos = empresa.camposOcultos.filter(k => k !== key);
        }
      });
    });

    document.getElementById("btnCriarNovoCampo").addEventListener("click", () => {
      const nomeInput = document.getElementById("novoCampoNome");
      const secaoSelect = document.getElementById("novoCampoSecao");
      const nome = nomeInput.value.trim();
      
      if (!nome) { _marcarErro(nomeInput); return showToast("Digite o nome do campo", "warning"); }

      if (!empresa.camposPersonalizados) empresa.camposPersonalizados = [];
      
      empresa.camposPersonalizados.push({
        id: generateId(),
        nome: nome,
        valor: "",
        secao: secaoSelect.value
      });

      _renderCamposCustom();
      _marcarAlterado();
      showToast(`Campo "${nome}" adicionado na seção escolhida!`, "success");
      
      overlay.remove();
      _abrirModalConfig();
    });

    // Funções de fechar o modal
    const closeAndSave = () => {
      _aplicarVisibilidade();
      _marcarAlterado();
      overlay.remove();
    };

    document.getElementById("btnFecharModalTopX").addEventListener("click", closeAndSave);
    document.getElementById("btnFecharModalBottom").addEventListener("click", closeAndSave);

    setTimeout(() => document.getElementById("novoCampoNome").focus(), 60);
  }

  // ══════════════════════════════════════════
  //  UPLOAD DE LOGO (SOMENTE 'X' E CLIQUE DIRETO)
  // ══════════════════════════════════════════
  const inputLogo = document.getElementById("empresaImgInput");
  const wrapperLogo = document.getElementById("empresaImgWrapper");
  const btnRemoverLogo = document.getElementById("btnRemoverLogo");

 function _mostrarLogo(src) {
    const preview = document.getElementById("empresaImgPreview");
    const placeholder = document.getElementById("empresaImgPlaceholder");
    if (src) {
      preview.src = src;
      preview.style.display = "block";
      placeholder.style.display = "none";
      if(btnRemoverLogo) btnRemoverLogo.style.display = "flex";
    } else {
      // Correção: Remove o atributo 'src' em vez de deixar vazio ("")
      preview.removeAttribute("src");
      preview.style.display = "none";
      placeholder.style.display = "flex";
      if(btnRemoverLogo) btnRemoverLogo.style.display = "none";
    }
  }
  if (wrapperLogo) {
    wrapperLogo.addEventListener("click", () => {
      inputLogo.click();
    });
  }

  if (btnRemoverLogo) {
    btnRemoverLogo.addEventListener("click", (e) => {
      e.stopPropagation(); // Evita abrir o input de imagem novamente
      empresa.logo = "";
      inputLogo.value = "";
      _mostrarLogo("");
      _renderAbas();
      _marcarAlterado();
      showToast("Logo removida", "success");
    });
  }

  if (inputLogo) {
    inputLogo.addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (!file) return;
      if (!empresa) return;

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = function () {
        URL.revokeObjectURL(objectUrl);
        const w = img.width;
        const h = img.height;

        if (w !== h) {
          showToast(`A logo deve ser quadrada. A sua tem ${w}x${h}px.`, "error");
          inputLogo.value = "";
          return;
        }

        const MAX = 400;
        let drawW = w;
        let drawH = h;
        if (w > MAX) {
          drawW = MAX;
          drawH = MAX;
        }

        const canvas = document.createElement("canvas");
        canvas.width = drawW;
        canvas.height = drawH;
        canvas.getContext("2d").drawImage(img, 0, 0, drawW, drawH);
        
        empresa.logo = canvas.toDataURL("image/jpeg", 0.85);
        _mostrarLogo(empresa.logo);
        _renderAbas();
        _marcarAlterado();
        showToast("Logo anexada com sucesso!", "success");
      };

      img.onerror = function () {
        showToast("O arquivo não é uma imagem válida.", "error");
        inputLogo.value = "";
      };

      img.src = objectUrl;
    });
  }

  // ══════════════════════════════════════════
  //  MODAL: PEDIR NOME DA NOVA EMPRESA
  // ══════════════════════════════════════════
  function _abrirModalNomeEmpresa() {
    const existing = document.getElementById("modalNomeEmpresa");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalNomeEmpresa";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">Nova Empresa</div>
        <div class="modal-subtitle" style="margin-bottom: var(--sp-lg);">
          Digite um nome para identificar a empresa.
        </div>
        <div class="field-group" style="margin-bottom: var(--sp-lg);">
          <label>Nome da Empresa</label>
          <input type="text" id="inputNomeNovaEmpresa" class="input-field" placeholder="Ex: Minha Loja LTDA" />
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="cancelNomeEmpresa">Cancelar</button>
          <button class="btn-primary" id="confirmNomeEmpresa" style="padding:10px var(--sp-lg);font-size:14px;">
            Criar Empresa
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = document.getElementById("inputNomeNovaEmpresa");
    const fechar = () => overlay.remove();

    const criar = () => {
      const nome = input.value.trim();
      if (!nome) {
        showToast("Digite o nome da empresa.", "warning");
        _marcarErro(input);
        return;
      }
      fechar();
      _criarEmpresa(nome);
    };

    document.getElementById("cancelNomeEmpresa").addEventListener("click", fechar);
    document.getElementById("confirmNomeEmpresa").addEventListener("click", criar);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) fechar();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") criar();
    });

    setTimeout(() => input.focus(), 60);
  }

  // Cria a empresa com o nome informado e a exibe
  function _criarEmpresa(nome) {
    // Adicionar salva o que está na tela da empresa atual — como o Salvar
    // (que pode pedir usuário e senha).
    _exigirSenhaDoSalvar("Adicionar uma empresa salva as alterações desta.").then((ok) => {
      if (!ok) return;
      if (_empresaAtiva()) _coletarCamposFixos(); // salva a atual antes de trocar
      const nova = _empresaVazia();
      nova.id = generateId();
      nova.nomeAba = nome;
      nova.nomeFantasia = nome; // preenche também o Nome Fantasia por conveniência
      dados.empresas.push(nova);
      dados.ativaId = nova.id;
      empresa = _empresaAtiva();
      _persistir();
      _recarregarTela();
      _limparStatus(); // a empresa anterior foi salva; a nova acabou de ser criada
      showToast(`Empresa "${nome}" adicionada!`, "success");
    });
  }

  // ══════════════════════════════════════════
  //  MODAL: DOCUMENTOS DA EMPRESA (arquivos)
  // ══════════════════════════════════════════
  function _abrirModalDocumentos() {
    if (!empresa) {
      showToast("Adicione uma empresa primeiro.", "warning");
      return;
    }

    const existing = document.getElementById("modalDocumentos");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalDocumentos";
    overlay.innerHTML = `
      <div class="modal" style="max-width:560px; width:92%; max-height:85vh; display:flex; flex-direction:column;">
        <div class="modal-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>📁 Documentos da Empresa</span>
          <button type="button" id="btnFecharDocs" style="background:transparent; border:none; color:var(--clr-text-3); font-size:22px; cursor:pointer; padding:0 4px; line-height:1;">✕</button>
        </div>
        <div class="modal-subtitle" style="margin-bottom:16px;">
          Anexe documentos como Alvará, Cartão CNPJ, Contrato Social, etc.
          Ficam salvos junto com a empresa.
        </div>

        <div style="border:1px dashed var(--clr-border); border-radius:var(--r-md); padding:16px; text-align:center; margin-bottom:16px;">
          <input type="file" id="docFileInput" multiple style="display:none;" />
          <button type="button" class="btn-primary" id="btnEscolherDoc" style="font-size:13px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;">
  <line x1="12" y1="5" x2="12" y2="19"></line>
  <line x1="5" y1="12" x2="19" y2="12"></line>
</svg>Anexar Documento
          </button>
          <p style="font-size:11px; color:var(--clr-text-3); margin-top:8px;">
            PDF, imagens, planilhas — qualquer arquivo.
          </p>
        </div>

        <div style="overflow-y:auto; flex:1;" id="docsLista">
          <p style="text-align:center; color:var(--clr-text-3); font-size:13px; padding:20px 0;">Carregando…</p>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const fechar = () => overlay.remove();
    document.getElementById("btnFecharDocs").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) fechar();
    });

    const fileInput = document.getElementById("docFileInput");
    document.getElementById("btnEscolherDoc").addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async (e) => {
      const arquivos = Array.from(e.target.files || []);
      fileInput.value = "";
      if (arquivos.length === 0) return;

      // Processa um por um, pedindo o nome de cada
      for (const file of arquivos) {
        // Limite de segurança por arquivo (~15MB)
        if (file.size > 15 * 1024 * 1024) {
          showToast(`"${file.name}" excede 15MB e foi ignorado.`, "warning");
          continue;
        }

        // Pede o nome ao usuário (nome sugerido = nome original sem extensão)
        const sugestao = file.name.replace(/\.[^.]+$/, "");
        const nomeEscolhido = await _pedirNomeDocumento(sugestao, file.name);
        if (nomeEscolhido === null) continue; // usuário cancelou este arquivo

        try {
          const dataUrl = await _lerArquivoBase64(file);
          // Preserva a extensão original no nome salvo
          const ext = (file.name.match(/\.[^.]+$/) || [""])[0];
          const nomeFinal = nomeEscolhido.endsWith(ext) ? nomeEscolhido : nomeEscolhido + ext;

          await ArquivoStore.salvar({
            id: generateId(),
            empresaId: empresa.id,
            nome: nomeFinal,
            tipo: file.type || "application/octet-stream",
            tamanho: file.size,
            dataUrl: dataUrl,
          });
          showToast(`"${nomeFinal}" anexado!`, "success");
        } catch (err) {
          console.error(err);
          showToast(`Erro ao anexar "${file.name}".`, "error");
        }
      }
      _renderListaDocs();
    });

    _renderListaDocs();
  }

  // Modal que pede um nome para o documento. Resolve com o nome ou null (cancelado).
  function _pedirNomeDocumento(sugestao, nomeOriginal) {
    return new Promise((resolve) => {
      const existing = document.getElementById("modalNomeDoc");
      if (existing) existing.remove();

      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.id = "modalNomeDoc";
      overlay.style.zIndex = "1000000001"; // acima do modal de documentos (.modal-overlay usa 999999999)
      overlay.innerHTML = `
        <div class="modal">
          <div class="modal-title">Nomear Documento</div>
          <div class="modal-subtitle" style="margin-bottom: var(--sp-lg);">
            Dê um nome fácil de identificar para este arquivo.<br>
            <span style="font-size:11px; color:var(--clr-text-3);">Arquivo original: ${(nomeOriginal || "").replace(/</g, "&lt;")}</span>
          </div>
          <div class="field-group" style="margin-bottom: var(--sp-lg);">
            <label>Nome do Documento</label>
            <input type="text" id="inputNomeDoc" class="input-field" placeholder="Ex: Alvará de Funcionamento" />
          </div>
          <div class="modal-actions">
            <button class="btn-secondary" id="cancelNomeDoc">Pular este</button>
            <button class="btn-primary" id="confirmNomeDoc" style="padding:10px var(--sp-lg);font-size:14px;">
              Anexar
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const input = document.getElementById("inputNomeDoc");
      input.value = sugestao || "";

      const finalizar = (valor) => {
        overlay.remove();
        resolve(valor);
      };

      const confirmar = () => {
        const nome = input.value.trim();
        if (!nome) {
          showToast("Digite um nome para o documento.", "warning");
          _marcarErro(input);
          return;
        }
        finalizar(nome);
      };

      document.getElementById("cancelNomeDoc").addEventListener("click", () => finalizar(null));
      document.getElementById("confirmNomeDoc").addEventListener("click", confirmar);
      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay) finalizar(null);
      });
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") confirmar();
      });

      setTimeout(() => { input.focus(); input.select(); }, 60);
    });
  }

  function _lerArquivoBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
      reader.readAsDataURL(file);
    });
  }

  function _formatarTamanho(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  async function _renderListaDocs() {
    const lista = document.getElementById("docsLista");
    if (!lista) return;

    let arquivos = [];
    try {
      arquivos = await ArquivoStore.listar(empresa.id);
    } catch (err) {
      console.error(err);
    }

    if (arquivos.length === 0) {
      lista.innerHTML = `<p style="text-align:center; color:var(--clr-text-3); font-size:13px; padding:20px 0;">Nenhum documento anexado ainda.</p>`;
      return;
    }

    lista.innerHTML = "";
    arquivos.forEach((arq) => {
      const item = document.createElement("div");
      item.style.cssText =
        "display:flex; align-items:center; gap:12px; padding:10px 12px; background:var(--clr-surface-alt); border:1px solid var(--clr-border); border-radius:var(--r-md); margin-bottom:8px;";
      item.innerHTML = `
        <span style="font-size:22px; flex-shrink:0;">${_iconePorTipo(arq.tipo, arq.nome)}</span>
        <div style="flex:1; min-width:0;">
          <div style="font-size:13px; font-weight:600; color:var(--clr-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${arq.nome.replace(/</g, "&lt;")}</div>
          <div style="font-size:11px; color:var(--clr-text-3);">${_formatarTamanho(arq.tamanho)}</div>
        </div>
        <button type="button" class="btn-doc-baixar" style="background:transparent; border:1px solid var(--clr-border); border-radius:6px; padding:4px 10px; font-size:11px; font-weight:600; color:var(--clr-primary); cursor:pointer;">Ver</button>
        <button type="button" class="btn-doc-remover" style="background:transparent; border:none; color:var(--clr-danger); cursor:pointer; font-size:14px;">✕</button>
      `;

      item.querySelector(".btn-doc-baixar").addEventListener("click", async () => {
        const completo = await ArquivoStore.obter(arq.id);
        if (completo && completo.dataUrl) {
          _abrirVisualizadorDoc(completo);
        }
      });

      item.querySelector(".btn-doc-remover").addEventListener("click", () => {
        _confirmarExclusao(
          { titulo: "Excluir documento?", nome: arq.nome, textoBotao: "Sim, excluir" },
          async () => {
            await ArquivoStore.remover(arq.id);
            showToast("Documento removido.", "success");
            _renderListaDocs();
          },
        );
      });

      lista.appendChild(item);
    });
  }

  function _iconePorTipo(tipo, nome) {
    const t = (tipo || "").toLowerCase();
    const n = (nome || "").toLowerCase();
    if (t.includes("pdf") || n.endsWith(".pdf")) return "📕";
    if (t.includes("image") || /\.(png|jpe?g|gif|webp|bmp)$/.test(n)) return "🖼️";
    if (t.includes("sheet") || /\.(xlsx?|csv)$/.test(n)) return "📊";
    if (t.includes("word") || /\.(docx?)$/.test(n)) return "📘";
    if (/\.(zip|rar|7z)$/.test(n)) return "🗜️";
    return "📄";
  }

  // ══════════════════════════════════════════
  //  VISUALIZADOR DE DOCUMENTO EM TELA CHEIA
  // ══════════════════════════════════════════
  function _baixarDoc(doc) {
    const a = document.createElement("a");
    a.href = doc.dataUrl;
    a.download = doc.nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function _abrirVisualizadorDoc(doc) {
    const existing = document.getElementById("visualizadorDoc");
    if (existing) existing.remove();

    const t = (doc.tipo || "").toLowerCase();
    const n = (doc.nome || "").toLowerCase();
    const ehImagem = t.includes("image") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(n);
    const ehPdf = t.includes("pdf") || n.endsWith(".pdf");

    // Conteúdo conforme o tipo
    let conteudo;
    if (ehImagem) {
      conteudo = `<img src="${doc.dataUrl}" alt="${doc.nome.replace(/"/g, "&quot;")}"
        style="max-width:100%; max-height:100%; object-fit:contain; border-radius:6px; box-shadow:0 4px 24px rgba(0,0,0,0.4);" />`;
    } else if (ehPdf) {
      conteudo = `<iframe src="${doc.dataUrl}" title="${doc.nome.replace(/"/g, "&quot;")}"
        style="width:90vw; height:82vh; border:none; border-radius:6px; background:#fff;"></iframe>`;
    } else {
      // Tipos que o navegador não renderiza inline (docx, xlsx, zip...)
      conteudo = `
        <div style="background:var(--clr-surface); border-radius:12px; padding:40px; text-align:center; max-width:420px;">
          <div style="font-size:56px; margin-bottom:12px;">${_iconePorTipo(doc.tipo, doc.nome)}</div>
          <div style="font-size:16px; font-weight:700; color:var(--clr-text); margin-bottom:6px; word-break:break-word;">${doc.nome.replace(/</g, "&lt;")}</div>
          <div style="font-size:13px; color:var(--clr-text-3); margin-bottom:20px;">
            Este tipo de arquivo não pode ser exibido na tela.<br>Use o botão abaixo para baixá-lo.
          </div>
          <button type="button" id="visDocDownloadCenter" class="btn-primary" style="font-size:13px;">
            ⤓ &nbsp;Baixar Documento
          </button>
        </div>`;
    }

    const overlay = document.createElement("div");
    overlay.id = "visualizadorDoc";
    overlay.style.cssText =
      "position:fixed; inset:0; background:rgba(0,0,0,0.88); z-index:1000000002; display:flex; flex-direction:column;";

    overlay.innerHTML = `
      <!-- Barra superior: nome + ações -->
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 18px; background:rgba(0,0,0,0.4);">
        <span style="color:#fff; font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          ${_iconePorTipo(doc.tipo, doc.nome)} &nbsp;${doc.nome.replace(/</g, "&lt;")}
        </span>
        <div style="display:flex; gap:10px; flex-shrink:0;">
          <button type="button" id="visDocDownload" style="background:var(--clr-primary); color:#fff; border:none; border-radius:6px; padding:7px 14px; font-size:13px; font-weight:600; cursor:pointer;">
            ⤓ Baixar
          </button>
          <button type="button" id="visDocClose" title="Fechar" style="background:rgba(255,255,255,0.15); color:#fff; border:none; border-radius:6px; width:36px; height:36px; font-size:18px; cursor:pointer;">✕</button>
        </div>
      </div>

      <!-- Área do conteúdo -->
      <div style="flex:1; display:flex; align-items:center; justify-content:center; padding:20px; overflow:auto;">
        ${conteudo}
      </div>
    `;
    document.body.appendChild(overlay);

    const fechar = () => overlay.remove();

    document.getElementById("visDocClose").addEventListener("click", fechar);
    document.getElementById("visDocDownload").addEventListener("click", () => _baixarDoc(doc));
    const btnCentro = document.getElementById("visDocDownloadCenter");
    if (btnCentro) btnCentro.addEventListener("click", () => _baixarDoc(doc));

    // Fecha ao clicar no fundo escuro (fora do conteúdo)
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) fechar();
    });
    // Fecha com ESC
    const onEsc = (e) => {
      if (e.key === "Escape") { fechar(); document.removeEventListener("keydown", onEsc); }
    };
    document.addEventListener("keydown", onEsc);
  }

  // ══════════════════════════════════════════
  //  INICIALIZAÇÃO FINAL
  // ══════════════════════════════════════════
  // Aplica o estado salvo do menu lateral (colapsado ou aberto)
  (function _aplicarEstadoSidebar() {
    const colapsado = localStorage.getItem("precifiq_sidebar_colapsada") === "1";
    const sb = document.getElementById("sidebar");
    if (sb) sb.classList.toggle("sidebar-colapsada", colapsado);
    document.body.classList.toggle("sidebar-colapsada-body", colapsado);
  })();

  _atualizarVisibilidadeGeral();
  _renderAbas();
  if (_empresaAtiva()) {
    _popular();
  }
  _aplicarMascaras();

  document.getElementById("btnSalvarEmpresa").addEventListener("click", _salvar);

  // ── "Cancelar" (barra fixa): desfaz o que ainda não foi salvo ──
  // Relê a empresa do disco e redesenha a tela, como quando outra aba
  // salva (ver "Propagação entre abas", mais abaixo).
  const _btnCancelarEmpresa = document.getElementById("btnCancelarEmpresa");
  if (_btnCancelarEmpresa) {
    _btnCancelarEmpresa.addEventListener("click", () => {
      if (!empresa) return;
      const st = document.getElementById("empresaStatus");
      const temAlteracao = !!(st && st.textContent.indexOf("não salvas") >= 0);
      const desfazer = () => {
        const idExibida = empresa && empresa.id;
        dados = _carregarDados();
        if (idExibida && dados.empresas.find((x) => x.id === idExibida)) dados.ativaId = idExibida;
        empresa = _empresaAtiva();
        _recarregarTela();
        if (st) { st.textContent = ""; st.style.color = ""; }
        showToast(
          temAlteracao ? "Alterações canceladas: voltou o que estava salvo." : "Não há alterações para cancelar.",
          temAlteracao ? "success" : "default",
          2800,
        );
      };
      if (!temAlteracao || !(window.BapellModal && typeof window.BapellModal.confirmar === "function")) {
        desfazer();
        return;
      }
      window.BapellModal.confirmar({
        titulo: "Cancelar as alterações?",
        texto: "O que foi alterado nesta empresa e ainda não foi salvo volta a ser como estava.",
        botao: "Cancelar alterações",
        cancelar: "Continuar editando",
        perigo: true,
      }).then((sim) => { if (sim) desfazer(); });
    });
  }

  // Botão Adicionar Seção
  const btnAddSecao = document.getElementById("btnAddSecao");
  if (btnAddSecao) {
    btnAddSecao.addEventListener("click", _adicionarSecao);
  }

  // Botão Ordenar Posição das seções
  const btnOrdenarSecoes = document.getElementById("btnOrdenarSecoes");
  if (btnOrdenarSecoes) {
    btnOrdenarSecoes.addEventListener("click", _abrirModalOrdenarSecoes);
  }

  // Botões Adicionar Empresa (topo + empty state) → abrem o modal de nome
  const btnAddEmpresa = document.getElementById("btnAddEmpresa");
  if (btnAddEmpresa) {
    btnAddEmpresa.addEventListener("click", _abrirModalNomeEmpresa);
  }
  const btnAddEmpresaEmpty = document.getElementById("btnAddEmpresaEmpty");
  if (btnAddEmpresaEmpty) {
    btnAddEmpresaEmpty.addEventListener("click", _abrirModalNomeEmpresa);
  }

  // Botão Documentos (arquivos da empresa)
  const btnDocumentos = document.getElementById("btnDocumentos");
  if (btnDocumentos) {
    btnDocumentos.addEventListener("click", _abrirModalDocumentos);
  }

  // Botão Adicionar Sócio (QSA)
  const btnAddSocio = document.getElementById("btnAddSocio");
  if (btnAddSocio) {
    btnAddSocio.addEventListener("click", () => {
      if (!empresa) return;
      if (!empresa.socios) empresa.socios = [];
      empresa.socios.push({ id: generateId(), nome: "", doc: "", qualificacao: "" });
      _renderSocios();
      _marcarAlterado();
    });
  }

  // ── Propagação entre abas ──
  // Se outra aba criar/editar/trocar a empresa ativa, esta recarrega o estado
  // do disco. Só age quando NÃO há alterações não salvas aqui, para não
  // descartar o que o usuário está digitando nesta aba.
  window.addEventListener("storage", (e) => {
    if (e.key !== EMPRESA_LS_KEY || !e.newValue) return;
    const status = document.getElementById("empresaStatus");
    const temAlteracaoLocal = status && status.textContent.indexOf("não salvas") >= 0;
    if (temAlteracaoLocal) return; // não atropela edição em andamento

    const idExibida = empresa && empresa.id;
    dados = _carregarDados();
    // Preserva a empresa que ESTA aba estava exibindo, se ainda existir.
    if (idExibida && dados.empresas.find((x) => x.id === idExibida)) {
      dados.ativaId = idExibida;
    }
    empresa = _empresaAtiva();
    _recarregarTela();
  });
});
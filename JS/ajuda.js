// Data no header
if (typeof setDateHeader === "function") setDateHeader();

// Registra um erro no log (a tela de Ajuda EXPORTA o log — então ela mesma
// precisa registrar nele, não jogar no console que o .exe não mostra).
function _logAjuda(contexto, e) {
  if (typeof PrecifiqErros !== "undefined") {
    PrecifiqErros.registrar("Ajuda: " + contexto, e && e.stack ? e.stack : String(e));
  } else {
    console.error(contexto, e);
  }
}

// Accordion: abre/fecha cada artigo da ajuda
document.querySelectorAll(".ajuda-artigo-header").forEach((header) => {
  header.addEventListener("click", () => {
    header.parentElement.classList.toggle("aberto");
  });
});

// ══════════════════════════════════════════════════════════════
//  BACKUP MODULAR — exportação e importação seletiva
// ══════════════════════════════════════════════════════════════

// Ordem e rótulos dos módulos na tela (o rótulo real vem de PrecifiqBackup).
const _BACKUP_MODULOS = [
  "produtos", "plataformas", "empresas", "dre", "vendas", "notas",
  "lembretes", "config", "temas", "ordemPlat", "calculos",
  "logos", "imagens", "pdfs", "anexos",
];

function _rotuloModulo(mod) {
  try { return PrecifiqBackup.rotulo(mod); } catch (e) { return mod; }
}

// Monta a lista de checkboxes de módulos dentro de um container.
// `marcados` (Set) define quais vêm pré-selecionados; `disponiveis` (Set|null)
// limita quais aparecem (para a importação exibir só o que o arquivo contém).
function _montarChecklist(container, marcados, disponiveis) {
  container.innerHTML = "";
  _BACKUP_MODULOS.forEach((mod) => {
    if (disponiveis && !disponiveis.has(mod)) return;
    const marcado = marcados ? marcados.has(mod) : true;
    const label = document.createElement("label");
    label.className = "backup-check";
    label.innerHTML =
      '<input type="checkbox" data-mod="' + mod + '"' + (marcado ? " checked" : "") + " /> " +
      "<span>" + _rotuloModulo(mod) + "</span>";
    container.appendChild(label);
  });
}

// Nenhum item marcado: a lista fica vermelha até algum ser marcado (utils.js).
function _marcarListaVazia(container) {
  if (!container || !window.BapellCampos) return;
  window.BapellCampos.marcar(container, null, {
    resolvido: () => !!container.querySelector('input[type="checkbox"][data-mod]:checked'),
  });
}

// Lê o estado dos checkboxes de um container → objeto { mod: true/false }.
function _lerSelecao(container) {
  const sel = {};
  container.querySelectorAll('input[type="checkbox"][data-mod]').forEach((cb) => {
    sel[cb.dataset.mod] = cb.checked;
  });
  return sel;
}

// ── Backup: Exportar (seletivo) ──
const modalBackup = document.getElementById("modalBackup");
const _btnExportar = document.getElementById("btnExportarBackup");
if (_btnExportar && modalBackup) {
  const lista = document.getElementById("backupListaExportar");

  _btnExportar.addEventListener("click", () => {
    // Todos marcados por padrão ao abrir.
    if (lista) _montarChecklist(lista, new Set(_BACKUP_MODULOS), null);
    if (lista && window.BapellCampos) window.BapellCampos.limpar(lista);
    _sincronizarTodos();
    modalBackup.style.display = "flex";
  });

  const fecharBackup = () => (modalBackup.style.display = "none");
  const _x = document.getElementById("backupFecharX");
  const _cancel = document.getElementById("backupCancelar");
  if (_x) _x.addEventListener("click", fecharBackup);
  if (_cancel) _cancel.addEventListener("click", fecharBackup);
  modalBackup.addEventListener("click", (e) => { if (e.target === modalBackup) fecharBackup(); });

  // Botão/checkbox "Todos" — marca ou desmarca tudo.
  const _todos = document.getElementById("backupTodos");
  function _sincronizarTodos() {
    if (!_todos || !lista) return;
    const cbs = lista.querySelectorAll('input[type="checkbox"][data-mod]');
    const todosMarcados = cbs.length > 0 && Array.prototype.every.call(cbs, (c) => c.checked);
    _todos.checked = todosMarcados;
  }
  if (_todos && lista) {
    _todos.addEventListener("change", () => {
      lista.querySelectorAll('input[type="checkbox"][data-mod]').forEach((cb) => { cb.checked = _todos.checked; });
      // Marcar "Todos" também tira o vermelho da lista.
      if (_todos.checked && window.BapellCampos) window.BapellCampos.limpar(lista);
    });
    lista.addEventListener("change", _sincronizarTodos);
  }

  const _confirmar = document.getElementById("backupConfirmar");
  if (_confirmar) {
    _confirmar.addEventListener("click", async () => {
      const opcoes = _lerSelecao(lista);
      if (!Object.values(opcoes).some(Boolean)) {
        _marcarListaVazia(lista);
        return showToast("Selecione ao menos um item.", "warning");
      }
      _confirmar.disabled = true;
      const _txtOrig = _confirmar.textContent;
      _confirmar.textContent = "Gerando…";
      try {
        const r = await PrecifiqBackup.exportarArquivo(opcoes, (msg) => { _confirmar.textContent = msg; });
        fecharBackup();
        if (r && r.formato === "zip") {
          // Com "Imagens dos Produtos": .zip com as fotos em arquivos.
          const n = r.imagens || 0;
          let msg = "Backup exportado com sucesso! " +
            (n === 1 ? "1 imagem incluída" : n + " imagens incluídas") + " no arquivo .zip.";
          if (r.falhas) msg += " " + (r.falhas === 1 ? "1 imagem não pôde ser lida" : r.falhas + " imagens não puderam ser lidas") + " (veja o Diagnóstico).";
          showToast(msg, r.falhas ? "warning" : "success", 6000);
        } else {
          showToast("Backup exportado com sucesso!", "success");
        }
      } catch (e) {
        _logAjuda("exportar backup", e);
        showToast("Erro ao exportar backup: " + (e && e.message ? e.message : ""), "error", 6000);
      } finally {
        _confirmar.disabled = false;
        _confirmar.textContent = _txtOrig;
      }
    });
  }
}

// ── Backup: Importar (analisa primeiro, depois escolhe o que restaurar) ──
const MAX_BACKUP_BYTES = 500 * 1024 * 1024; // 500 MB (ZIP com imagens pode ser grande)

const inputImport = document.getElementById("inputImportarBackup");
const _btnImportar = document.getElementById("btnImportarBackup");
if (_btnImportar && inputImport) {
  _btnImportar.addEventListener("click", () => inputImport.click());

  inputImport.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      showToast("Arquivo grande demais para importar com segurança.", "error", 5000);
      inputImport.value = "";
      return;
    }
    showToast("Analisando backup…", "default");
    try {
      const analise = await PrecifiqBackup.analisarArquivo(file);
      if (!analise.modulos || !analise.modulos.length) {
        showToast("O backup não contém módulos reconhecíveis.", "warning", 5000);
      } else {
        _abrirModalRestaurar(analise);
      }
    } catch (err) {
      _logAjuda("analisar backup", err);
      showToast(err && err.message ? err.message : "Não foi possível ler o arquivo.", "error", 6000);
    } finally {
      inputImport.value = "";
    }
  });
}

// Modal que mostra os módulos ENCONTRADOS no backup e deixa escolher o que importar.
function _abrirModalRestaurar(analise) {
  const disponiveis = new Set(analise.modulos);

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.cssText =
    "position:fixed; inset:0; background:rgba(0,0,0,.58); display:flex; align-items:center; justify-content:center; z-index:10000; padding:20px;";

  overlay.innerHTML =
    '<div style="background:var(--clr-surface); border:1px solid var(--clr-border); border-radius:14px; max-width:500px; width:100%; max-height:88vh; display:flex; flex-direction:column; box-shadow:0 20px 50px rgba(0,0,0,.45);">' +
      '<div style="display:flex; align-items:center; justify-content:space-between; padding:20px 22px 12px;">' +
        '<h3 style="margin:0; color:var(--clr-text); font-size:18px;">Restaurar backup</h3>' +
        '<button id="restFecharX" style="background:transparent; border:none; color:var(--clr-text-3); font-size:22px; cursor:pointer; line-height:1;">✕</button>' +
      "</div>" +
      '<div style="padding:0 22px; color:var(--clr-text-2); font-size:13px; line-height:1.5;">' +
        "Escolha o que deseja importar deste backup. Só os itens marcados serão restaurados; o restante dos seus dados atuais permanece intacto." +
      "</div>" +
      '<div style="display:flex; align-items:center; gap:8px; padding:14px 22px 4px;">' +
        '<label class="backup-check" style="font-weight:600;"><input type="checkbox" id="restTodos" checked /> <span>Todos</span></label>' +
      "</div>" +
      '<div id="restLista" style="padding:4px 22px 8px; overflow-y:auto; flex:1;"></div>' +
      '<div id="restProgresso" style="padding:0 22px; font-size:12.5px; color:var(--clr-text-2); min-height:18px;"></div>' +
      '<div style="display:flex; justify-content:flex-end; gap:8px; padding:14px 22px 20px; border-top:1px solid var(--clr-border);">' +
        '<button id="restCancelar" style="padding:9px 16px; border:1px solid var(--clr-border); border-radius:8px; background:transparent; color:var(--clr-text-2); cursor:pointer;">Cancelar</button>' +
        '<button id="restConfirmar" class="btn-primary" style="padding:9px 18px; font-size:14px;">Restaurar selecionados</button>' +
      "</div>" +
    "</div>";

  document.body.appendChild(overlay);

  const lista = overlay.querySelector("#restLista");
  _montarChecklist(lista, disponiveis, disponiveis);

  const fechar = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
  overlay.querySelector("#restFecharX").addEventListener("click", fechar);
  overlay.querySelector("#restCancelar").addEventListener("click", fechar);

  // "Todos" no modal de restauração
  const restTodos = overlay.querySelector("#restTodos");
  function _syncRestTodos() {
    const cbs = lista.querySelectorAll('input[type="checkbox"][data-mod]');
    restTodos.checked = cbs.length > 0 && Array.prototype.every.call(cbs, (c) => c.checked);
  }
  restTodos.addEventListener("change", () => {
    lista.querySelectorAll('input[type="checkbox"][data-mod]').forEach((cb) => { cb.checked = restTodos.checked; });
    if (restTodos.checked && window.BapellCampos) window.BapellCampos.limpar(lista);
  });
  lista.addEventListener("change", _syncRestTodos);

  const prog = overlay.querySelector("#restProgresso");
  const btn = overlay.querySelector("#restConfirmar");
  btn.addEventListener("click", async () => {
    const selecao = _lerSelecao(lista);
    if (!Object.values(selecao).some(Boolean)) {
      _marcarListaVazia(lista);
      return showToast("Selecione ao menos um item para restaurar.", "warning");
    }
    btn.disabled = true;
    const _orig = btn.textContent;
    btn.textContent = "Restaurando…";
    try {
      const r = await PrecifiqBackup.restaurar(analise, selecao, (m) => { prog.textContent = m; });
      const partes = [];
      if (r.produtos)    partes.push(r.produtos + " produto(s)");
      if (r.empresas)    partes.push(r.empresas + " empresa(s)");
      if (r.vendas)      partes.push(r.vendas + " venda(s)");
      if (r.plataformas) partes.push(r.plataformas + " plataforma(s)");
      if (r.lembretes)   partes.push(r.lembretes + " lembrete(s)");
      if (r.imagens)     partes.push(r.imagens + " imagem(ns)");
      if (r.arquivos)    partes.push(r.arquivos + " arquivo(s)");
      let msg = partes.length
        ? "Restaurado: " + partes.join(", ") + "."
        : "Concluído — nada novo a adicionar (o conteúdo já existia aqui).";
      // Foto do backup que não pôde voltar (arquivo danificado ou renomeado).
      if (r.imagensComProblema) msg += " " + r.imagensComProblema + " imagem(ns) do arquivo não puderam ser restauradas.";
      fechar();
      showToast(msg, r.imagensComProblema ? "warning" : "success", 6000);
      if (typeof _medirArmazenamento === "function") _medirArmazenamento();
    } catch (err) {
      _logAjuda("restaurar backup", err);
      btn.disabled = false;
      btn.textContent = _orig;
      showToast("Não foi possível concluir a restauração. Verifique o arquivo.", "error", 6000);
    }
  });
}

// ── Diagnóstico: relatório de erros ──
function _atualizarResumoErros() {
  const el = document.getElementById("erroResumo");
  if (!el || typeof PrecifiqErros === "undefined") return;

  const n = PrecifiqErros.contar();
  if (n === 0) {
    el.textContent = "Nenhum erro registrado até agora.";
    el.style.color = "var(--clr-success)";
  } else {
    el.textContent = `${n} erro(s) registrado(s).`;
    el.style.color = "var(--clr-warning)";
  }
}
_atualizarResumoErros();

const btnExpErros = document.getElementById("btnExportarErros");
if (btnExpErros) {
  btnExpErros.addEventListener("click", () => {
    if (typeof PrecifiqErros === "undefined") return;
    PrecifiqErros.exportar();
  });
}

const btnLimpErros = document.getElementById("btnLimparErros");
if (btnLimpErros) {
  btnLimpErros.addEventListener("click", () => {
    if (typeof PrecifiqErros === "undefined") return;
    PrecifiqErros.limpar();
    _atualizarResumoErros();
    showToast("Histórico de erros limpo.", "success");
  });
}

// ── Armazenamento ──
// No app instalado, os dados NÃO ficam mais no localStorage/IndexedDB do
// Chromium: o preload substitui o localStorage por um armazenamento em ARQUIVOS
// no disco (dados.json + pasta arquivos\). Não há mais o limite de ~5 MB.
// O painel abaixo mostra a pasta e o tamanho REAIS no disco.
// _tamanhoLocalStorage() é usado só como fallback fora do .exe (Live Server).
function _tamanhoLocalStorage() {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k) || "";
      total += k.length + v.length;
    }
  } catch (e) {}
  return total * 2; // UTF-16: ~2 bytes por caractere
}

let _medirArmazenamento = async function () {
  const resumo = document.getElementById("storageResumo");
  const barWrap = document.getElementById("storageBarWrap");
  const persistEl = document.getElementById("storagePersist");
  const extraEl = document.getElementById("storageExtra");
  if (!resumo) return;

  // Não existe mais limite de 5 MB para preencher: esconde a barra de "%".
  if (barWrap) barWrap.style.display = "none";

  // No app instalado, os dados vivem em ARQUIVOS no disco (dados.json + pasta
  // arquivos\). Mostra o caminho e o tamanho REAIS, não a cota do navegador.
  if (window.discoArquivos && typeof window.discoArquivos.info === "function") {
    try {
      const info = await window.discoArquivos.info();
      if (info && info.pasta) {
        resumo.innerHTML =
          "Cadastros: <strong>" + _fmtTamanho(info.dadosBytes) + "</strong>" +
          "  ·  Fotos e documentos: <strong>" + _fmtTamanho(info.arquivosBytes) + "</strong>" +
          " (" + (info.numArquivos || 0) + " arquivo(s))" +
          "  ·  Total no disco: <strong>" + _fmtTamanho(info.totalBytes) + "</strong>";
        if (persistEl) {
          persistEl.style.color = "var(--clr-text-3)";
          persistEl.textContent = "Tudo é salvo direto no seu disco (sem limite de 5 MB), nesta pasta:";
        }
        if (extraEl) {
          extraEl.textContent = info.pasta;
          extraEl.style.wordBreak = "break-all";
        }
        _montarBotaoAbrirPasta();
        return;
      }
    } catch (e) {
      _logAjuda("disco:info", e);
    }
  }

  // Fallback (navegador / Live Server, fora do .exe): não há disco disponível.
  resumo.textContent =
    "Cadastros (em memória): " + _fmtTamanho(_tamanhoLocalStorage()) +
    ". No aplicativo instalado, os dados ficam salvos em arquivos no seu disco.";
  if (persistEl) persistEl.textContent = "";
  if (extraEl) extraEl.textContent = "";
};

// Formata bytes em KB / MB / GB (pt-BR).
function _fmtTamanho(bytes) {
  if (!bytes || bytes < 0) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return (kb >= 10 ? Math.round(kb) : kb.toFixed(1)).toString().replace(".", ",") + " KB";
  const mb = kb / 1024;
  if (mb < 1024) return (mb >= 10 ? Math.round(mb) : mb.toFixed(1)).toString().replace(".", ",") + " MB";
  return (mb / 1024).toFixed(1).replace(".", ",") + " GB";
}

// Cria o botão "Abrir pasta dos dados" uma única vez, logo abaixo do caminho.
function _montarBotaoAbrirPasta() {
  if (document.getElementById("btnAbrirPastaDados")) return;
  const extraEl = document.getElementById("storageExtra");
  const persistEl = document.getElementById("storagePersist");
  const alvo = extraEl || persistEl;
  if (!alvo || !alvo.parentNode) return;
  const btn = document.createElement("button");
  btn.id = "btnAbrirPastaDados";
  btn.type = "button";
  btn.textContent = "📂 Abrir pasta dos dados";
  btn.style.cssText =
    "margin-top:12px; padding:8px 14px; border:1px solid var(--clr-border); border-radius:8px; " +
    "background:var(--clr-surface-alt); color:var(--clr-text); cursor:pointer; font-size:13px; font-weight:600;";
  btn.addEventListener("click", () => {
    if (window.discoArquivos && window.discoArquivos.abrirPasta) window.discoArquivos.abrirPasta();
  });
  alvo.parentNode.insertBefore(btn, alvo.nextSibling);
}

// Primeira medição. (Sem navigator.storage.persist(): é irrelevante quando os
// dados estão em arquivos no disco, e só mostrava um aviso enganoso.)
(function _infoArmazenamento() {
  _medirArmazenamento();
})();

// ══════════════════════════════════════════════════════════════
//  "Abrir ao inicializar" — abrir o Bapell junto com o Windows
//  O backend (main.js) e a ponte (preload → inicializacaoAPI) já existem;
//  esta função religa a UI: mostra o botão, lê o estado atual do sistema
//  e alterna a configuração ao clicar. Fora do app instalado (navegador,
//  ou sem a ponte), o botão permanece oculto.
// ══════════════════════════════════════════════════════════════
(function _ligarAbrirComWindows() {
  var btn = document.getElementById("btnInicializar");
  if (!btn) return;

  // A ponte só existe dentro do aplicativo Electron (tela ajuda.html).
  if (!window.inicializacaoAPI || typeof window.inicializacaoAPI.obter !== "function") {
    btn.style.display = "none";
    return;
  }

  var ativo = false;

  function _pintar() {
    // Reflete visualmente o estado ligado/desligado sem depender de CSS novo.
    btn.classList.toggle("ativo", ativo);
    btn.style.opacity = ativo ? "1" : "0.72";
    var rotulo = ativo ? "Abrir ao inicializar: ligado" : "Abrir ao inicializar";
    // Mantém o ícone; troca só o texto (último nó de texto do botão).
    for (var i = btn.childNodes.length - 1; i >= 0; i--) {
      if (btn.childNodes[i].nodeType === 3 && btn.childNodes[i].textContent.trim()) {
        btn.childNodes[i].textContent = " " + rotulo;
        break;
      }
    }
  }

  // Estado inicial vem do sistema operacional; só então mostra o botão.
  Promise.resolve(window.inicializacaoAPI.obter())
    .then(function (on) {
      ativo = !!on;
      btn.style.display = "";  // remove o display:none inicial
      _pintar();
    })
    .catch(function () { btn.style.display = "none"; });

  btn.addEventListener("click", function () {
    var desejado = !ativo;
    btn.disabled = true;
    Promise.resolve(window.inicializacaoAPI.definir(desejado))
      .then(function (confirmado) {
        ativo = !!confirmado; // reflete o que o SO aceitou
        _pintar();
        if (typeof showToast === "function") {
          showToast(ativo ? "O Bapell abrirá junto com o Windows." : "Abertura automática desligada.", "success");
        }
      })
      .catch(function () {
        if (typeof showToast === "function") showToast("Não foi possível alterar essa configuração.", "error");
      })
      .then(function () { btn.disabled = false; });
  });
})();

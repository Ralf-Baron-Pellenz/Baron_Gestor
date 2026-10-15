// ═══════════════════════════════════════════
//  Bapell Gestor Pro — campos.js
//  Sistema de personalização de campos por plataforma
//  (renomear labels e ocultar campos da calculadora)
// ═══════════════════════════════════════════

const CAMPOS_LS_PREFIX = "precifiq_field_cfg_";

// ── Definição canônica de todos os campos editáveis ──────────────────────────
// id        → coincide com o id do <input> no HTML
// label     → nome padrão exibido
// secao     → agrupa visualmente no modal
// ocultavel → false = nunca pode ser ocultado (ex: Preço de Custo é obrigatório)
const CAMPOS_CONFIG = [
  // Identificação
  { id: "productName", label: "Nome do Produto",  secao: "identificacao", ocultavel: false },
  { id: "productSku",  label: "SKU Principal",    secao: "identificacao", ocultavel: true  },
  { id: "productId",   label: "ID do Produto",    secao: "identificacao", ocultavel: true  },

  // Formação do Custo
  { id: "custoCusto",    label: "Preço de Custo", secao: "custo", ocultavel: false },
  { id: "custoEmbalagem",label: "Embalagem",       secao: "custo", ocultavel: true  },
  { id: "custoEtiqueta", label: "Etiqueta",        secao: "custo", ocultavel: true  },
  { id: "custoFrete",    label: "Frete Pago",      secao: "custo", ocultavel: true  },

  // Impostos sobre o custo.
  // Os inputs já existiam no produto.html, mas não estavam registrados aqui —
  // por isso não apareciam em "Configurar Campos".
  //
  // ATENÇÃO AO OCULTAR: ao esconder um destes, o campo some da tela E deixa
  // de entrar no cálculo. Quem faz isso é o getCalcInputs() do calculadora.js,
  // que ignora todo input com data-campo-oculto="1" (marca aplicada pelo
  // aplicarConfigCampos, mais abaixo). O valor digitado NÃO é apagado: ao
  // mostrar o campo de novo, ele volta a contar.
  { id: "custoIpi",      label: "IPI (%)",        secao: "custo", ocultavel: true },
  { id: "custoDifal",    label: "DIFAL (%)",      secao: "custo", ocultavel: true },
  { id: "custoSt",       label: "ST (%)",         secao: "custo", ocultavel: true },
  { id: "custoAliquota", label: "Alíquota (%)",   secao: "custo", ocultavel: true },

  // Variáveis de Venda
  { id: "freteProduto",   label: "Frete do Produto",        secao: "venda", ocultavel: true },
  { id: "taxaFixa",       label: "Taxa Fixa Da Plataforma", secao: "venda", ocultavel: true },
  { id: "taxaPlataforma", label: "Taxa Da Plataforma (%)",  secao: "venda", ocultavel: true },
  { id: "impostoNF",      label: "Imposto NF (%)",          secao: "venda", ocultavel: true },

  // Margem
  { id: "margemValor", label: "Margem Desejada", secao: "margem", ocultavel: false },

  // Logística — aparece no modal de "Identificação do Produto".
  // Especial: ao ocultar, esconde a seção inteira de Dimensões + as divs nos kits.
  // soToggle = mostra APENAS o botão ocultar/mostrar, sem campo de nome editável.
  { id: "__logistica__", label: "Dimensões (Peso & Medidas)", secao: "identificacao", ocultavel: true, tipo: "secao", soToggle: true },

  // Preços Extras — área própria no "Configurar Campos" da tela do produto.
  // Só mostrar/ocultar, como as Dimensões: ao ocultar, some a área inteira
  // da tela do produto E a dos cards de kit. Não mexe em cálculo nenhum (os
  // Preços Extras são só consulta), e os valores digitados continuam
  // guardados no produto — ao mostrar de novo, voltam como estavam.
  { id: "__precosExtras__", label: "Preços Extras", secao: "precosExtras", ocultavel: true, tipo: "secao", soToggle: true,
    icone: "etiqueta",
    desc: "Oculta a área na tela do produto e nos cards de kit. Os valores digitados continuam guardados." },

  // Campos dentro da caixa de Kit
  // SKU e Frete podem ser ocultados; Custo Base é fixo (é o resultado do cálculo)
  { id: "kitSkuLabel",   label: "SKU do Kit",       secao: "kit", ocultavel: true,  kitAttr: "skuKit" },
  { id: "kitCustoLabel", label: "Custo Base",       secao: "kit", ocultavel: false, kitAttr: "custoBaseKit" },
  { id: "kitFreteLabel", label: "Frete do Produto", secao: "kit", ocultavel: true,  kitAttr: "freteProdutoKit" },
];

// ── Nomes das seções ─────────────────────────────────────────────────────────
const SECOES_LABELS = {
  identificacao: "Identificação do Produto",
  custo:         "Formação do Custo Total",
  venda:         "Variáveis de Venda & Plataforma",
  margem:        "Margem de Lucro",
  kit:           "Campos do Kit",
  precosExtras:  "Preços Extras",
};

// ── Leitura e escrita no localStorage ────────────────────────────────────────
function _getCamposKey(platformId) {
  return CAMPOS_LS_PREFIX + (platformId || "global");
}

function getCamposCfg(platformId) {
  try {
    const raw = JSON.parse(localStorage.getItem(_getCamposKey(platformId)));
    // Só aceita objeto puro. Array/string/número corrompidos viram {}.
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
    return {};
  } catch { return {}; }
}

function saveCamposCfg(platformId, cfg) {
  try {
    localStorage.setItem(_getCamposKey(platformId), JSON.stringify(cfg));
    return true;
  } catch (e) {
    // Cota estourada: sem este aviso, a configuração se perdia em silêncio
    console.error("Falha ao salvar configuração de campos:", e);
    if (typeof PrecifiqErros !== "undefined") {
      PrecifiqErros.registrar("Falha ao salvar config de campos", String(e));
    }
    if (typeof showToast === "function") {
      showToast("Não foi possível salvar a configuração dos campos.", "error");
    }
    return false;
  }
}

/**
 * Remove a configuração de campos de uma plataforma do localStorage.
 * Deve ser chamada quando a plataforma é EXCLUÍDA, para não deixar a chave
 * precifiq_field_cfg_<id> órfã ocupando espaço para sempre.
 * (A exclusão de plataforma vive no dashboard — este helper é chamado de lá.)
 */
function limparConfigCampos(platformId) {
  try {
    localStorage.removeItem(_getCamposKey(platformId));
    return true;
  } catch (e) {
    return false;
  }
}

// ── API pública ───────────────────────────────────────────────────────────────

/** Retorna o label atual de um campo (personalizado ou padrão) */
function getLabelCampo(platformId, campoId) {
  const cfg = getCamposCfg(platformId);
  const c = cfg[campoId];
  return (c && typeof c === "object" && c.label) || _defaultLabel(campoId);
}

/**
 * Retorna true se o campo está oculto.
 *
 * Respeita a flag `ocultavel` do CAMPOS_CONFIG, igual ao aplicarConfigCampos.
 * Antes as duas funções discordavam: uma config antiga ou corrompida marcando
 * "custoCusto: {oculto:true}" fazia isCampoOculto() dizer que estava oculto,
 * enquanto a tela mostrava o campo normalmente.
 */
function isCampoOculto(platformId, campoId) {
  const def = CAMPOS_CONFIG.find(x => x.id === campoId);
  if (!def || !def.ocultavel) return false;
  const cfg = getCamposCfg(platformId);
  const c = cfg[campoId];
  return !!(c && typeof c === "object" && c.oculto);
}

function _defaultLabel(campoId) {
  const c = CAMPOS_CONFIG.find(x => x.id === campoId);
  return c ? c.label : campoId;
}

// ── Aplicação inicial: lê config e aplica labels + visibilidade na página ────
function aplicarConfigCampos(platformId) {
  // Lê a configuração UMA vez e reaproveita. Antes, esta função e as auxiliares
  // (_aplicarLabelsKits, _ajustarGridKits, _aplicarVisibLogisticaKits) chamavam
  // getCamposCfg separadamente — 5 leituras + 5 JSON.parse por aplicação. E o
  // produto.js chama aplicarConfigCampos a cada kit renderizado → custo O(N²).
  const cfg = getCamposCfg(platformId);

  // A opção "Botão + Adicionar Campos" saiu do Personalizar Campos: o
  // "+ Adicionar Campos" agora é um botão só, no topo da tela do produto.
  //
  // Ela escondia (pela classe "ocultar-add-campos" no body) os botões
  // "+ Adicionar Campos" dos cards de kit. Uma configuração antiga salva
  // com ela ligada NÃO pode continuar escondendo esses botões — não haveria
  // mais onde desligá-la. Por isso a classe é sempre retirada.
  document.body.classList.remove("ocultar-add-campos");

  // Preços Extras: oculta/mostra a área inteira — na tela do produto e nos
  // cards de kit. Também por classe no body, pelo mesmo motivo: um kit
  // criado ou redesenhado depois já nasce obedecendo à configuração.
  const cfgPrecos = cfg["__precosExtras__"];
  document.body.classList.toggle(
    "ocultar-precos-extras",
    !!(cfgPrecos && typeof cfgPrecos === "object" && cfgPrecos.oculto)
  );

  CAMPOS_CONFIG.forEach(campo => {
    const overrides = (cfg[campo.id] && typeof cfg[campo.id] === "object") ? cfg[campo.id] : {};
    const label     = overrides.label || campo.label;
    const oculto    = !!(overrides.oculto) && campo.ocultavel;

    // Atualiza todos os <label> que apontam para este input
    document.querySelectorAll(`label[for="${campo.id}"]`).forEach(el => {
      el.textContent = label;
    });

    const input = document.getElementById(campo.id);
    if (!input) return;

    // A marca de cálculo é aplicada SEMPRE, fora do if(grupo).
    // Antes ficava dentro: se o input não tivesse um .field-group pai
    // (ex: envolvido numa div extra), o campo era "oculto" na config mas
    // continuava entrando no cálculo. Bug latente, esperando uma mudança no HTML.
    if (oculto) input.dataset.campoOculto = "1";
    else delete input.dataset.campoOculto;

    // Mostra/oculta o field-group pai do input (parte visual)
    // NÃO zeramos o value — o valor digitado fica preservado no DOM
    const grupo = input.closest(".field-group");
    if (grupo) {
      grupo.style.display = oculto ? "none" : "";
    }
  });

  // ── Logística: oculta/mostra a seção inteira + divs de dimensões nos kits ──
  const cfgLog    = (cfg["__logistica__"]) || {};
  const logOculto = !!(cfgLog.oculto);
  const logSec2   = document.getElementById("logisticaSection");
  if (logSec2) logSec2.style.display = logOculto ? "none" : "";

  // Aplica visibilidade das dimensões nos kit-cards
  _aplicarVisibLogisticaKits(logOculto, platformId, cfg);

  // Renomeia labels + aplica visibilidade dos campos do kit (ajusta o grid no fim)
  _aplicarLabelsKits(platformId, cfg);

  // Injeta botões ✏️ nos card-titles (uma vez só)
  _injetarBotoesEdicao(platformId);

  // Avisa a tela que a visibilidade dos campos mudou.
  //
  // Sem isto, ocultar ou mostrar um campo alterava o DOM mas NÃO refazia a
  // conta: o "Custo Total da Unidade" só acertava depois de recarregar a
  // página ou de mexer em algum outro campo. Como ocultar um imposto o tira
  // do cálculo, o valor exibido ficava desatualizado.
  //
  // Vai por evento em vez de chamada direta porque este arquivo é usado
  // também pela tela de Empresa, que não tem recálculo. Quem se interessa,
  // escuta; quem não, ignora.
  try {
    document.dispatchEvent(
      new CustomEvent("precifiq:campos-aplicados", { detail: { platformId: platformId } })
    );
  } catch (e) {
    // Ambiente sem CustomEvent: a aplicação visual já aconteceu, só o
    // recálculo automático deixa de ocorrer.
  }
}

/** Aplica nomes personalizados E visibilidade dos campos dentro de cada caixa de kit */
function _aplicarLabelsKits(platformId, cfg) {
  if (!cfg) cfg = getCamposCfg(platformId);

  CAMPOS_CONFIG.filter(c => c.secao === "kit").forEach(campo => {
    const over   = cfg[campo.id] || {};
    const label  = over.label || campo.label;
    const oculto = !!(over.oculto) && campo.ocultavel;

    document.querySelectorAll(`[data-kit-label="${campo.kitAttr}"]`).forEach(labelEl => {
      labelEl.textContent = label;
      // Oculta/mostra o field-group pai (a "coluna" do grid)
      const grupo = labelEl.closest(".field-group");
      if (grupo) grupo.style.display = oculto ? "none" : "";
    });
  });

  // Recalcula as colunas do grid conforme os campos visíveis
  _ajustarGridKits(platformId, cfg);
}

/** Recalcula grid-template-columns de cada kit conforme campos visíveis */
function _ajustarGridKits(platformId, cfg) {
  if (!cfg) cfg = getCamposCfg(platformId);
  const skuOculto   = !!(cfg["kitSkuLabel"]   && cfg["kitSkuLabel"].oculto);
  const freteOculto = !!(cfg["kitFreteLabel"] && cfg["kitFreteLabel"].oculto);
  const logCfg      = cfg["__logistica__"] || {};
  const logOculto   = !!(logCfg.oculto);

  // Monta a lista de colunas visíveis (Custo Base é sempre visível)
  const cols = [];
  if (!skuOculto)   cols.push("1fr");   // SKU
  cols.push("1fr");                     // Custo Base (fixo)
  if (!freteOculto) cols.push("1fr");   // Frete
  if (!logOculto)   cols.push("1.4fr"); // Dimensões

  document.querySelectorAll(".kit-top-row-grid").forEach(el => {
    el.style.gridTemplateColumns = cols.join(" ");
  });
}

/** Oculta/mostra a div de dimensões inline em todos os kit-cards */
function _aplicarVisibLogisticaKits(oculto, platformId, cfg) {
  document.querySelectorAll(".kit-log-dim").forEach(el => {
    el.style.display = oculto ? "none" : "";
  });
  // Recalcula colunas considerando TODOS os campos ocultáveis
  if (platformId) {
    _ajustarGridKits(platformId, cfg);
  } else {
    // fallback: só ajusta a coluna de dimensões
    document.querySelectorAll(".kit-top-row-grid").forEach(el => {
      el.style.gridTemplateColumns = oculto
        ? "1fr 1fr 1fr"
        : "1fr 1fr 1fr 1.4fr";
    });
  }
}

// ── Helpers de criação de botões ────────────────────────────────────────────

/** Cria um botão de texto padrão "Editar Campos" (estilo definido em style.css) */
function _criarBotaoEditarCampos(onClick) {
  const btn = document.createElement("button");
  btn.type        = "button";
  btn.className   = "btn-editar-campos";
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>Configurar Campos`;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

// ── Injeta os botões "Editar Campos" nas seções e o toggle de Logística ────
function _injetarBotoesEdicao(platformId) {

  // ── "Identificação do Produto": apenas o botão "Editar Campos". ──
  // Busca primeiro por [data-secao="identificacao"] (estável). O texto é só
  // fallback: se a seção for renomeada, a busca por texto falharia em silêncio
  // e o botão nunca mais apareceria.
  const idTitleEl =
    document.querySelector('.card-title[data-secao="identificacao"]') ||
    Array.from(document.querySelectorAll(".card-title"))
      .find(el => el.textContent.includes("Identificação do Produto"));

  if (idTitleEl && !idTitleEl.querySelector(".btn-editar-campos")) {
    const btn = _criarBotaoEditarCampos(() => abrirModalCampos(platformId, ["identificacao"]));
    btn.style.marginLeft = "auto";
    idTitleEl.style.display    = "flex";
    idTitleEl.style.alignItems = "center";
    idTitleEl.appendChild(btn);
  }

  // ── Seções da calculadora: Formação do Custo / Variáveis de Venda / Margem ──
  document.querySelectorAll(".calc-section-header[data-secao]").forEach(header => {
    if (header.querySelector(".btn-editar-campos")) return; // já injetado
    const secao = header.dataset.secao;
    header.appendChild(_criarBotaoEditarCampos(() => abrirModalCampos(platformId, [secao])));
  });

  // ── Kits: botão "Editar Campos" agrupado junto ao "Adicionar Kit" ──
  const kitsHeader = document.querySelector(".kits-header");
  const btnAddKit  = document.getElementById("btnAddKit");
  if (kitsHeader && btnAddKit && !kitsHeader.querySelector(".btn-editar-campos")) {
    const btnEditarKit = _criarBotaoEditarCampos(() => abrirModalCampos(platformId, ["kit"]));

    // Envolve os dois botões num wrapper flex para mantê-los lado a lado
    const grupo = document.createElement("div");
    grupo.className = "kits-header-actions";
    grupo.style.cssText = "display:flex; align-items:center; gap:10px; flex-shrink:0;";

    btnAddKit.parentElement.insertBefore(grupo, btnAddKit);
    grupo.appendChild(btnEditarKit);
    grupo.appendChild(btnAddKit);
  }
}

// ── Modal de edição de campos ─────────────────────────────────────────────────
function abrirModalCampos(platformId, secoesFiltro) {
  const existing = document.getElementById("modalCamposConfig");
  if (existing) existing.remove();

  const cfg = getCamposCfg(platformId);

  // Filtra apenas os campos das seções solicitadas
  const campos = CAMPOS_CONFIG.filter(c => secoesFiltro.includes(c.secao));

  // Agrupa por seção para exibir subtítulos
  const secoesPresentes = [...new Set(campos.map(c => c.secao))];

  // A área Preços Extras não soma nada no cálculo (é só consulta): o texto
  // de sempre, "Campos ocultos não são somados no cálculo", ali não vale.
  const soPrecosExtras = secoesPresentes.length === 1 && secoesPresentes[0] === "precosExtras";

  let rowsHtml = "";
  secoesPresentes.forEach(secao => {
    const camposDaSecao = campos.filter(c => c.secao === secao);
    if (secoesPresentes.length > 1) {
      rowsHtml += `<div style="font-size:10px;font-weight:700;color:var(--clr-text-3);
        text-transform:uppercase;letter-spacing:0.6px;margin:14px 0 8px;
        padding-bottom:4px;border-bottom:1px solid var(--clr-border);">
        ${SECOES_LABELS[secao] || secao}
      </div>`;
    }

    camposDaSecao.forEach(campo => {
      const over     = cfg[campo.id] || {};
      const labelVal = over.label || campo.label;
      const oculto   = !!(over.oculto) && campo.ocultavel;

      // ── Campo "só toggle": mostra apenas o botão ocultar/mostrar + nome FIXO ──
      if (campo.soToggle) {
        rowsHtml += `
          <div class="cfg-campo-row" data-campo-id="${campo.id}"
               style="display:flex;align-items:center;gap:10px;
                      padding:9px 10px;margin-bottom:6px;
                      background:var(--clr-surface-alt);
                      border:1px solid var(--clr-border);
                      border-radius:var(--r-sm);
                      opacity:${oculto ? "0.6" : "1"};
                      transition:opacity 0.15s;">

            <button type="button" class="cfg-btn-visib" data-campo-id="${campo.id}"
                    data-oculto="${oculto ? "1" : "0"}"
                    title="${oculto ? "Mostrar" : "Ocultar"}"
                    style="
                      background:${oculto ? "var(--clr-surface)" : "var(--clr-primary-lt)"};
                      border:1px solid ${oculto ? "var(--clr-border)" : "var(--clr-primary)"};
                      color:${oculto ? "var(--clr-text-3)" : "var(--clr-primary)"};
                      cursor:pointer;font-size:10px;font-weight:700;
                      padding:3px 8px;border-radius:4px;
                      white-space:nowrap;flex-shrink:0;line-height:1.4;
                      font-family:inherit;transition:all 0.15s;">
              ${oculto ? "MOSTRAR" : "OCULTAR"}
            </button>

            <div style="flex:1;min-width:0;display:flex;align-items:center;gap:6px;">
              <span style="font-size:13px;flex-shrink:0;"> ${_iconeCampoToggle(campo)}</span>
              <span style="min-width:0;display:flex;flex-direction:column;gap:2px;">
                <span style="font-size:13px;font-weight:600;color:var(--clr-text);
                             ${oculto ? "opacity:0.6;" : ""}">
                  ${_escCfg(campo.label)}
                </span>
                ${campo.desc ? `<span style="font-size:11px;line-height:1.35;color:var(--clr-text-3);">${_escCfg(campo.desc)}</span>` : ""}
              </span>
            </div>
          </div>
        `;
        return;
      }

      rowsHtml += `
        <div class="cfg-campo-row" data-campo-id="${campo.id}"
             style="display:flex;align-items:flex-end;gap:10px;
                    padding:9px 10px;margin-bottom:6px;
                    background:var(--clr-surface-alt);
                    border:1px solid var(--clr-border);
                    border-radius:var(--r-sm);
                    opacity:${oculto ? "0.5" : "1"};
                    transition:opacity 0.15s;">

          <!-- Botão Mostrar/Ocultar -->
          ${campo.ocultavel ? `
          <button type="button" class="cfg-btn-visib" data-campo-id="${campo.id}"
                  data-oculto="${oculto ? "1" : "0"}"
                  title="${oculto ? "Mostrar campo" : "Ocultar campo"}"
                  style="
                    background:${oculto ? "var(--clr-surface)" : "var(--clr-primary-lt)"};
                    border:1px solid ${oculto ? "var(--clr-border)" : "var(--clr-primary)"};
                    color:${oculto ? "var(--clr-text-3)" : "var(--clr-primary)"};
                    cursor:pointer;font-size:10px;font-weight:700;
                    padding:0 8px;border-radius:4px;height:30px;
                    white-space:nowrap;flex-shrink:0;line-height:30px;
                    font-family:inherit;transition:all 0.15s;">
            ${oculto ? "MOSTRAR" : "OCULTAR"}
          </button>` : `
          <span title="Campo obrigatório"
                style="font-size:10px;font-weight:700;padding:0 7px;height:30px;line-height:30px;
                       border:1px solid var(--clr-border);border-radius:4px;
                       color:var(--clr-text-3);opacity:0.5;white-space:nowrap;flex-shrink:0;">
            FIXO
          </span>`}

          <!-- Input de nome -->
          <div style="flex:1;min-width:0;">
            <div style="font-size:9px;color:var(--clr-text-3);margin-bottom:2px;
                        text-transform:uppercase;letter-spacing:0.4px;">
              Nome do campo
            </div>
            <input type="text" class="input-field cfg-label-input"
                   data-campo-id="${campo.id}"
                   value="${_escCfg(labelVal)}"
                   placeholder="${_escCfg(campo.label)}"
                   style="padding:5px 8px;font-size:12px;height:30px;box-sizing:border-box;
                          ${oculto ? "text-decoration:line-through;opacity:0.5;" : ""}" />
          </div>

          <!-- Botão reset -->
          <button type="button" class="cfg-btn-reset" data-campo-id="${campo.id}"
                  data-default="${_escCfg(campo.label)}"
                  title="Restaurar nome padrão"
                  style="background:transparent;border:1px solid var(--clr-border);
                         color:var(--clr-text-3);cursor:pointer;font-size:10px;
                         padding:0 7px;border-radius:4px;white-space:nowrap;height:30px;line-height:30px;
                         flex-shrink:0;">
            ↺ Padrão
          </button>
        </div>
      `;
    });
  });

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id        = "modalCamposConfig";
  overlay.innerHTML = `
    <div class="modal" style="width:480px;max-width:95vw;">
      <div class="modal-title" style="display:flex;align-items:center;gap:8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;">
  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
</svg> Personalizar Campos
      </div>
      <div class="modal-subtitle" style="margin-bottom:16px;">
        ${soPrecosExtras ? `
        Mostre ou oculte a área Preços Extras para a plataforma
        <strong style="color:var(--clr-primary);">${_escCfg(_getPlatformName(platformId))}</strong>.
        Ela é só consulta: ocultar não muda nenhum preço calculado.` : `
        Renomeie ou oculte campos para a plataforma
        <strong style="color:var(--clr-primary);">${_escCfg(_getPlatformName(platformId))}</strong>.
        Campos ocultos não são somados no cálculo.`}
      </div>

      <div id="cfgCamposLista" style="max-height:420px;overflow-y:auto;
           padding-right:4px;">
        ${rowsHtml}
      </div>

      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn-secondary" id="cfgBtnCancelar">Cancelar</button>
        <button class="btn-danger"    id="cfgBtnResetTudo"
                style="margin-right:auto; display:inline-flex; align-items:center; gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Resetar Tudo</button>
        <button class="btn-primary"   id="cfgBtnSalvar">✓ Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // ── Interações dentro do modal ──
  const lista = overlay.querySelector("#cfgCamposLista");

  // Botão olho: alterna oculto
  lista.addEventListener("click", (e) => {
    const btn = e.target.closest(".cfg-btn-visib");
    if (!btn) return;
    const id  = btn.dataset.campoId;
    const row = lista.querySelector(`.cfg-campo-row[data-campo-id="${id}"]`);
    const inp = lista.querySelector(`.cfg-label-input[data-campo-id="${id}"]`);

    // O estado vive no dataset, não no texto do botão. Antes era inferido de
    // textContent === "MOSTRAR" — bastava um espaço, um ícone ou uma tradução
    // para o estado ser lido errado, e o campo salvo ao contrário.
    const estadoAtualEhOculto = btn.dataset.oculto === "1";
    const novoEstadoEhOculto  = !estadoAtualEhOculto;

    btn.dataset.oculto       = novoEstadoEhOculto ? "1" : "0";
    btn.textContent          = novoEstadoEhOculto ? "MOSTRAR" : "OCULTAR";
    btn.title                = novoEstadoEhOculto ? "Mostrar campo" : "Ocultar campo";
    btn.style.background     = novoEstadoEhOculto ? "var(--clr-surface)" : "var(--clr-primary-lt)";
    btn.style.borderColor    = novoEstadoEhOculto ? "var(--clr-border)" : "var(--clr-primary)";
    btn.style.color          = novoEstadoEhOculto ? "var(--clr-text-3)" : "var(--clr-primary)";
    if (row) row.style.opacity = novoEstadoEhOculto ? "0.5" : "1";
    // Campos "só toggle" (ex: Dimensões) não têm input de nome — protege contra null
    if (inp) {
      inp.style.textDecoration = novoEstadoEhOculto ? "line-through" : "";
      inp.style.opacity        = novoEstadoEhOculto ? "0.5" : "";
    }
  });

  // Botão reset individual
  lista.addEventListener("click", (e) => {
    const btn = e.target.closest(".cfg-btn-reset");
    if (!btn) return;
    const id  = btn.dataset.campoId;
    const inp = lista.querySelector(`.cfg-label-input[data-campo-id="${id}"]`);
    if (inp) inp.value = btn.dataset.default;
  });

  // Cancelar
  overlay.querySelector("#cfgBtnCancelar")
    .addEventListener("click", () => overlay.remove());

  // Resetar tudo desta plataforma — TODAS as seções, não só as abertas no
  // modal. O botão diz "Resetar Tudo"; antes só apagava os campos das seções
  // visíveis (o filtro `campos`), contradizendo o rótulo. Agora remove a
  // configuração inteira da plataforma, voltando todos os campos ao padrão.
  overlay.querySelector("#cfgBtnResetTudo")
    .addEventListener("click", () => {
      const salvou = saveCamposCfg(platformId, {}); // config vazia = tudo padrão
      overlay.remove();
      aplicarConfigCampos(platformId);
      if (typeof _recalcularTudo === "function") _recalcularTudo();
      if (salvou && typeof showToast === "function") {
        showToast("Todos os campos foram restaurados ao padrão.", "success");
      }
    });

  // Salvar
  overlay.querySelector("#cfgBtnSalvar")
    .addEventListener("click", () => {
      const cfgAtual = getCamposCfg(platformId);

      // A preferência antiga de ocultar o botão "+ Adicionar Campos" não
      // existe mais (ver aplicarConfigCampos): sai da configuração salva.
      delete cfgAtual._ocultarBtnAddCampos;

      campos.forEach(campo => {
        const inp    = lista.querySelector(`.cfg-label-input[data-campo-id="${campo.id}"]`);
        const btnVis = lista.querySelector(`.cfg-btn-visib[data-campo-id="${campo.id}"]`);

        const labelNovo = inp ? inp.value.trim() || campo.label : campo.label;
        // Lê o dataset, não o texto do botão (ver comentário no toggle acima)
        const oculto    = btnVis ? btnVis.dataset.oculto === "1" : false;

        cfgAtual[campo.id] = {
          label:  labelNovo,
          oculto: campo.ocultavel ? oculto : false,
        };
      });

      const salvou = saveCamposCfg(platformId, cfgAtual);
      overlay.remove();
      aplicarConfigCampos(platformId);

      // Dispara recálculo para refletir campos ocultos
      if (typeof _recalcularTudo === "function") _recalcularTudo();
      else if (typeof atualizarResultadoUnidade === "function") atualizarResultadoUnidade();

      if (salvou && typeof showToast === "function") showToast("Configurações salvas!", "success");
    });

  // Fecha ao clicar fora
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * O ícone da linha "só mostrar/ocultar" do modal. Cada área tem o seu: a
 * caixa das Dimensões e a etiqueta de preço dos Preços Extras.
 */
function _iconeCampoToggle(campo) {
  const abre = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;">';
  if (campo && campo.icone === "etiqueta") {
    return abre +
      '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>' +
      '<line x1="7" y1="7" x2="7.01" y2="7"></line></svg>';
  }
  return abre + `
  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
  <line x1="12" y1="22.08" x2="12" y2="12"></line>
</svg>`;
}

function _escCfg(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function _getPlatformName(platformId) {
  if (typeof getPlatformConfig === "function") {
    const cfg = getPlatformConfig(platformId);
    return cfg ? cfg.name : platformId;
  }
  return platformId || "esta plataforma";
}

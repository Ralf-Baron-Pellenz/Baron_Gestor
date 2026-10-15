// ═══════════════════════════════════════════
//  Bapell Gestor Pro — vendas.js
//  Tela de Informações de Venda (config global)
// ═══════════════════════════════════════════

const VENDAS_LS_KEY = "precifiq_vendas";

document.addEventListener("DOMContentLoaded", () => {
  setDateHeader();

  let dados = _carregar();

  // A ordem das seções fixas como veio no HTML: sem ordem salva (o Cancelar
  // depois de um "Ordenar Posição" ainda não salvo), as seções voltam a ela.
  const _ordemOriginal = Array.from(document.querySelectorAll("[data-secao-card]"))
    .map((el) => "fixa:" + el.dataset.secaoCard);

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

  // ── Persistência ──
  function _carregar() {
    let raw = null;
    try {
      raw = JSON.parse(localStorage.getItem(VENDAS_LS_KEY));
    } catch {
      raw = null;
    }
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      // NÃO existe mais a migração "_reset_v2" que zerava descontos/modalidades:
      // ela destruía os dados de um BACKUP ANTIGO restaurado (backups feitos
      // antes da flag não a tinham → a leitura seguinte apagava tudo que o
      // usuário acabara de restaurar). Agora só sanitizamos a estrutura,
      // preservando o conteúdo.
      const merged = Object.assign(_vazio(), raw);
      return _sanitizar(merged);
    }
    return _vazio();
  }

  // Garante a integridade da estrutura: campos que devem ser array SEMPRE são array.
  // Protege contra dados corrompidos (null, string, objeto) vindos do localStorage.
  function _sanitizar(d) {
    const base = _vazio();
    ["camposOcultos", "descontos", "modalidades", "secoesCustom", "ordemSecoes"].forEach((k) => {
      if (!Array.isArray(d[k])) d[k] = [];
    });
    // Cada modalidade precisa ter faixas como array
    d.modalidades = d.modalidades.filter((m) => m && typeof m === "object");
    d.modalidades.forEach((m) => {
      if (!Array.isArray(m.faixas)) m.faixas = [];
      if (!m.id) m.id = _genId();
    });
    // Cada desconto precisa ser objeto com id
    d.descontos = d.descontos.filter((r) => r && typeof r === "object");
    d.descontos.forEach((r) => {
      if (!r.id) r.id = _genId();
    });
    // Campos de texto
    if (typeof d.parcMinimo !== "string" && typeof d.parcMinimo !== "number") d.parcMinimo = base.parcMinimo;
    if (!d.parcMaximo) d.parcMaximo = base.parcMaximo;
    return d;
  }

  function _vazio() {
    return {
      parcMinimo: "",
      parcMaximo: "12",
      camposOcultos: [],
      // Descontos começam vazios — a pessoa adiciona
      descontos: [],
      // Modalidades de entrega começam vazias — a pessoa adiciona
      modalidades: [],
      // Seções personalizadas criadas pelo usuário
      secoesCustom: [],
      // Ordem personalizada das seções
      ordemSecoes: [],
    };
  }

  function _salvar() {
    // Coleta campos fixos
    document.querySelectorAll("[data-venda-key]").forEach((el) => {
      dados[el.dataset.vendaKey] = el.value;
    });
    try {
      // Vendas é um objeto ÚNICO (não uma lista de itens por id), então o
      // "merge entre abas" aqui significa: se outra aba salvou depois que esta
      // carregou, a última gravação vence — como em qualquer editor. O que
      // NÃO pode acontecer é a migração antiga apagar dados (já removida).
      localStorage.setItem(VENDAS_LS_KEY, JSON.stringify(dados));
    } catch (e) {
      // Cota estourada ou armazenamento indisponível
      console.error("Falha ao salvar informações de venda:", e);
      if (typeof PrecifiqErros !== "undefined") {
        PrecifiqErros.registrar("Falha ao salvar vendas", e && e.stack ? e.stack : String(e));
      }
      _setStatus("✕ Erro ao salvar", "var(--clr-danger)");
      showToast(
        e && e.name === "QuotaExceededError"
          ? "Armazenamento cheio. Libere espaço e tente novamente."
          : "Não foi possível salvar. Tente novamente.",
        "error",
      );
      return;
    }
    _setStatus("✓ Salvo", "var(--clr-success)");
    showToast("Informações de venda salvas!", "success");
  }

  function _setStatus(txt, cor) {
    const s = document.getElementById("vendasStatus");
    if (s) {
      s.textContent = txt;
      s.style.color = cor || "var(--clr-text-3)";
    }
  }

  function _marcarAlterado() {
    _setStatus("● Alterações não salvas", "var(--clr-accent)");
  }

  // ══════════════════════════════════════════
  //  COLAPSAR / EXPANDIR SEÇÕES
  // ══════════════════════════════════════════
  const SECOES_COLAPSADAS_KEY = "precifiq_vendas_colapsadas";

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

  function _toggleSecao(card, id) {
    const colapsada = card.classList.toggle("secao-colapsada");
    const btn = card.querySelector(".secao-chevron-btn");
    if (btn) btn.setAttribute("aria-expanded", String(!colapsada));
    _persistirColapsada(id, colapsada);
  }

  // Aplica estado salvo e liga eventos das seções FIXAS (as custom são
  // tratadas dentro de _renderSecoesCustom, pois são recriadas dinamicamente).
  function _initColapsarSecoes() {
    const colapsadas = _lerColapsadas();
    document.querySelectorAll("[data-secao-card]").forEach((card) => {
      const header = card.querySelector(".secao-header[data-secao-toggle]");
      if (!header) return;
      const id = card.dataset.secaoCard;
      if (colapsadas.includes(id)) card.classList.add("secao-colapsada");
      const btn = header.querySelector(".secao-chevron-btn");
      if (btn) btn.setAttribute("aria-expanded", String(!card.classList.contains("secao-colapsada")));
      // Cabeçalho inteiro é clicável (seções fixas não têm input no header)
      header.addEventListener("click", () => _toggleSecao(card, id));
    });
  }

  // ══════════════════════════════════════════
  //  MÁSCARAS (R$ e %)
  // ══════════════════════════════════════════

  // Interpreta um campo de dinheiro no padrão BR. Delega para o
  // parseFormattedValue da calculadora (fonte única): esta função era uma 3ª
  // cópia que divergia — não tratava "1.234.56" (vira 1234.56 lá, virava 1.234
  // aqui). Mantida como fina camada por compatibilidade com quem já a chama.
  function _parseMoneyBR(str) {
    if (typeof parseFormattedValue === "function") return parseFormattedValue(str);
    // Fallback mínimo se a calculadora não estiver carregada
    if (typeof str === "number") return isFinite(str) ? str : 0;
    const s = String(str || "").trim();
    if (s === "") return 0;
    if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
    return parseFloat(s) || 0;
  }

  function _aplicarMascara(el) {
    if (!el) return;
    const isMoney = el.classList.contains("money-input");
    
    // Máscara com preenchimento progressivo (da direita para a esquerda)
    el.addEventListener("input", () => {
      let val = el.value.replace(/\D/g, "");
      if (val === "") {
        el.value = "";
      } else {
        let num = parseInt(val, 10) / 100;
        el.value = isMoney ? formatMoneyBR(num) : formatPercentBR(num);
      }
      _marcarAlterado();
    });
  }

  function _aplicarMascarasGerais() {
    document.querySelectorAll(".money-input, .percent-input").forEach(_aplicarMascara);
  }

  // ══════════════════════════════════════════
  //  BLOCO 1 — SIMULADOR DA MAQUININHA
  // ══════════════════════════════════════════
  function _initSimulador() {
    const elValor = document.getElementById("simValor");
    const elTaxa = document.getElementById("simTaxa");
    const elResp = document.getElementById("simResponsavel");
    // Se a seção do simulador não existir na tela, não faz nada
    if (!elValor || !elTaxa || !elResp) return;

    function calcular() {
      const valor = parseFormattedValue(elValor.value);
      const taxa = parseFormattedValue(elTaxa.value);
      const responsavel = elResp.value;

      let valorFinal = 0;
      let juro = 0;
      let explica = "";

      if (valor <= 0 || taxa <= 0) {
        document.getElementById("simValorFinal").textContent = "R$ " + formatMoneyBR(valor);
        document.getElementById("simJuro").textContent = "R$ 0,00";
        document.getElementById("simExplica").textContent = "Preencha o valor e a taxa.";
        return;
      }

      if (responsavel === "cliente") {
        // Repassa a taxa: o cliente paga o valor + juros para a loja receber o valor cheio.
        // valorFinal = valor / (1 - taxa/100)  → assim, após a maquininha descontar a taxa, sobra o valor.
        // Proteção: taxa >= 100% torna a conta impossível (divisão por zero ou negativa).
        if (taxa >= 100) {
          document.getElementById("simValorFinal").textContent = "—";
          document.getElementById("simJuro").textContent = "—";
          document.getElementById("simExplica").textContent =
            "Taxa inviável: com 100% ou mais não é possível repassar ao cliente.";
          return;
        }
        valorFinal = valor / (1 - taxa / 100);
        juro = valorFinal - valor;
        explica = "O cliente paga o acréscimo. A loja recebe o valor cheio.";
      } else {
        // Loja absorve: o cliente paga o valor cheio, a loja arca com a taxa.
        juro = valor * (taxa / 100);
        valorFinal = valor - juro;
        explica =
          taxa >= 100
            ? "Atenção: com taxa de 100% ou mais, a loja não recebe nada (ou fica no prejuízo)."
            : "A loja absorve a taxa. Este é o valor líquido que a loja recebe.";
      }

      // Guarda final contra valores não-finitos (NaN/Infinity)
      if (!isFinite(valorFinal) || !isFinite(juro)) {
        document.getElementById("simValorFinal").textContent = "—";
        document.getElementById("simJuro").textContent = "—";
        document.getElementById("simExplica").textContent = "Valores inválidos para simulação.";
        return;
      }

      document.getElementById("simValorFinal").textContent = "R$ " + formatMoneyBR(valorFinal);
      document.getElementById("simJuro").textContent = "R$ " + formatMoneyBR(juro);
      document.getElementById("simExplica").textContent = explica;
    }

    [elValor, elTaxa].forEach((el) => el.addEventListener("input", calcular));
    elResp.addEventListener("change", calcular);
  }

  // ══════════════════════════════════════════
  //  BLOCO 2 — DESCONTOS PROGRESSIVOS
  // ══════════════════════════════════════════
  function _renderDescontos() {
    const lista = document.getElementById("descontosLista");
    if (!lista) return;
    lista.innerHTML = "";

    // Estado vazio: nenhuma regra cadastrada
    if (!dados.descontos || dados.descontos.length === 0) {
      const vazio = document.createElement("div");
      vazio.style.cssText =
        "text-align:center; padding:24px; border:1px dashed var(--clr-border); border-radius:var(--r-md); color:var(--clr-text-3); font-size:13px;";
      vazio.textContent = "Nenhuma regra de desconto cadastrada.";
      lista.appendChild(vazio);
      return;
    }

    (dados.descontos || []).forEach((regra) => {
      const linha = document.createElement("div");
      linha.className = "regra-linha";
      linha.innerHTML = `
        <span class="regra-texto">De</span>
        <div class="input-addon-wrap regra-input">
          <span class="input-prefix">R$</span>
          <input type="text" inputmode="decimal" class="input-field money-input regra-de" value="${regra.de ? formatMoneyBR(regra.de) : ""}" placeholder="0,00" />
        </div>
        <span class="regra-texto">até</span>
        <div class="input-addon-wrap regra-input">
          <span class="input-prefix">R$</span>
          <input type="text" inputmode="decimal" class="input-field money-input regra-ate" value="${regra.ate ? formatMoneyBR(regra.ate) : ""}" placeholder="0,00" />
        </div>
        <span class="regra-texto">=</span>
        <div class="input-addon-wrap input-addon-wrap-suffix regra-input-pct">
          <input type="text" inputmode="decimal" class="input-field percent-input regra-pct" value="${regra.pct ? formatPercentBR(regra.pct) : ""}" placeholder="0" />
          <span class="input-suffix">%</span>
        </div>
        <button type="button" class="btn-danger regra-remover" title="Remover regra">✕</button>
      `;

      const inDe = linha.querySelector(".regra-de");
      const inAte = linha.querySelector(".regra-ate");
      const inPct = linha.querySelector(".regra-pct");

      _aplicarMascara(inDe);
      _aplicarMascara(inAte);
      _aplicarMascara(inPct);

      // Destaca a regra quando os valores não fazem sentido
      function _validarRegra() {
        const de = parseFormattedValue(inDe.value);
        const ate = parseFormattedValue(inAte.value);
        const pct = parseFormattedValue(inPct.value);
        let erro = "";
        if (ate > 0 && de > ate) erro = 'O valor "De" não pode ser maior que "até".';
        else if (pct > 100) erro = "O desconto não pode passar de 100%.";
        else if (pct < 0 || de < 0 || ate < 0) erro = "Valores não podem ser negativos.";

        linha.style.borderColor = erro ? "var(--clr-danger)" : "";
        linha.title = erro;
        return !erro;
      }

      inDe.addEventListener("input", () => { regra.de = parseFormattedValue(inDe.value); _validarRegra(); _marcarAlterado(); });
      inAte.addEventListener("input", () => { regra.ate = parseFormattedValue(inAte.value); _validarRegra(); _marcarAlterado(); });
      inPct.addEventListener("input", () => { regra.pct = parseFormattedValue(inPct.value); _validarRegra(); _marcarAlterado(); });
      _validarRegra();

      linha.querySelector(".regra-remover").addEventListener("click", () => {
        dados.descontos = dados.descontos.filter((r) => r.id !== regra.id);
        _renderDescontos();
        _marcarAlterado();
      });

      lista.appendChild(linha);
    });
  }

  function _addDesconto() {
    dados.descontos.push({ id: _genId(), de: 0, ate: 0, pct: 0 });
    _renderDescontos();
    _marcarAlterado();
  }

  // ══════════════════════════════════════════
  //  BLOCO 3 — LOGÍSTICA (modalidades + faixas KM)
  // ══════════════════════════════════════════
  function _renderModalidades() {
    const lista = document.getElementById("modalidadesLista");
    if (!lista) return;
    lista.innerHTML = "";

    // Estado vazio: nenhuma modalidade cadastrada
    if (!dados.modalidades || dados.modalidades.length === 0) {
      const vazio = document.createElement("div");
      vazio.style.cssText =
        "text-align:center; padding:24px; border:1px dashed var(--clr-border); border-radius:var(--r-md); color:var(--clr-text-3); font-size:13px;";
      vazio.innerHTML = `Nenhuma forma de envio cadastrada.`;
      lista.appendChild(vazio);
      return;
    }

    (dados.modalidades || []).forEach((mod) => {
      const box = document.createElement("div");
      box.className = "modalidade-box";
      box.innerHTML = `
        <div class="modalidade-header">
          <span class="modalidade-nome">${_escSec(mod.nome || "Modalidade")}</span>
          <button type="button" class="btn-danger modalidade-remover" title="Remover modalidade" style="padding:3px 8px; font-size:11px;">Remover</button>
        </div>
        <div class="faixas-lista"></div>
        <button type="button" class="btn-secondary faixa-add" style="font-size:12px; margin-top:8px;">
          + Adicionar faixa de KM
        </button>
      `;

      const faixasLista = box.querySelector(".faixas-lista");

      function renderFaixas() {
        faixasLista.innerHTML = "";
        (mod.faixas || []).forEach((faixa) => {
          const linha = document.createElement("div");
          linha.className = "regra-linha";
          linha.innerHTML = `
            <span class="regra-texto">Raio até</span>
            <div class="input-addon-wrap input-addon-wrap-suffix regra-input">
              <input type="text" inputmode="numeric" class="input-field faixa-km" value="${faixa.ateKm || ""}" placeholder="0" />
              <span class="input-suffix">km</span>
            </div>
            <span class="regra-texto">=</span>
            <div class="input-addon-wrap regra-input">
              <span class="input-prefix">R$</span>
              <input type="text" inputmode="decimal" class="input-field money-input faixa-valor" value="${faixa.valor ? formatMoneyBR(faixa.valor) : ""}" placeholder="0,00" />
            </div>
            <button type="button" class="btn-danger faixa-remover" title="Remover faixa">✕</button>
          `;

          const inKm = linha.querySelector(".faixa-km");
          const inValor = linha.querySelector(".faixa-valor");
          _aplicarMascara(inValor);

          inKm.addEventListener("input", () => {
            inKm.value = inKm.value.replace(/[^\d]/g, "");
            faixa.ateKm = parseInt(inKm.value, 10) || 0;
            _marcarAlterado();
          });
          inValor.addEventListener("input", () => {
            faixa.valor = parseFormattedValue(inValor.value);
            _marcarAlterado();
          });

          linha.querySelector(".faixa-remover").addEventListener("click", () => {
            if (!Array.isArray(mod.faixas)) mod.faixas = [];
            mod.faixas = mod.faixas.filter((f) => f.id !== faixa.id);
            renderFaixas();
            _marcarAlterado();
          });

          faixasLista.appendChild(linha);
        });
      }

      renderFaixas();

      box.querySelector(".faixa-add").addEventListener("click", () => {
        if (!mod.faixas) mod.faixas = [];
        mod.faixas.push({ id: _genId(), ateKm: 0, valor: 0 });
        renderFaixas();
        _marcarAlterado();
      });

      const btnRemMod = box.querySelector(".modalidade-remover");
      if (btnRemMod) {
        btnRemMod.addEventListener("click", async () => {
          const qtdFaixas = Array.isArray(mod.faixas) ? mod.faixas.length : 0;
          // Só pede confirmação se houver faixas configuradas (evita perda de trabalho)
          if (qtdFaixas > 0) {
            const nome = mod.nome || "esta modalidade";
            const texto = `${qtdFaixas} faixa(s) de KM serão apagadas. Esta ação não pode ser desfeita.`;
            // Janela do app (utils.js) no lugar do confirm() do sistema.
            const ok = window.BapellModal
              ? await window.BapellModal.confirmar({
                  titulo: `Remover "${nome}"?`,
                  texto,
                  botao: "Remover",
                  perigo: true,
                })
              : confirm(`Remover "${nome}"?\n\n${texto}`);
            if (!ok) return;
          }
          dados.modalidades = dados.modalidades.filter((m) => m.id !== mod.id);
          _renderModalidades();
          _marcarAlterado();
        });
      }

      lista.appendChild(box);
    });
  }

  // Modal para clonar modalidade (pede o nome)
  function _abrirModalClonar() {
    const existing = document.getElementById("modalClonarMod");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalClonarMod";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">Nova Forma de Envio</div>
        <div class="modal-subtitle" style="margin-bottom: var(--sp-lg);">
          Dê um nome para a nova modalidade de entrega.
        </div>
        <div class="field-group" style="margin-bottom: var(--sp-lg);">
          <label>Nome da Modalidade</label>
          <input type="text" id="inputNomeMod" class="input-field" placeholder="Ex: Entrega Expressa, Fiorino..." />
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="cancelClonar">Cancelar</button>
          <button class="btn-primary" id="confirmClonar" style="padding:10px var(--sp-lg);font-size:14px;">
            Criar Modalidade
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = document.getElementById("inputNomeMod");
    const fechar = () => overlay.remove();

    const criar = () => {
      const nome = input.value.trim();
      if (!nome) {
        showToast("Digite o nome da modalidade.", "warning");
        _marcarErro(input);
        return;
      }
      // Nova modalidade zerada, com uma faixa vazia
      dados.modalidades.push({
        id: _genId(),
        nome: nome,
        faixas: [{ id: _genId(), ateKm: 0, valor: 0 }],
      });
      fechar();
      _renderModalidades();
      _marcarAlterado();
      showToast(`Modalidade "${nome}" criada!`, "success");
    };

    document.getElementById("cancelClonar").addEventListener("click", fechar);
    document.getElementById("confirmClonar").addEventListener("click", criar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") criar(); });

    setTimeout(() => input.focus(), 60);
  }

  // ══════════════════════════════════════════
  //  BLOCO 4 — CONFIGURAR CAMPOS (visibilidade)
  // ══════════════════════════════════════════
  function _aplicarVisibilidade() {
    const ocultos = dados.camposOcultos || [];
    // Campos individuais
    document.querySelectorAll("[data-field-key]").forEach((el) => {
      el.style.display = ocultos.includes(el.dataset.fieldKey) ? "none" : "";
    });
    // Seções inteiras (cards)
    document.querySelectorAll("[data-secao-card]").forEach((el) => {
      el.style.display = ocultos.includes("secao_" + el.dataset.secaoCard) ? "none" : "";
    });
  }

  function _abrirModalConfig() {
    const existing = document.getElementById("modalConfigVendas");
    if (existing) existing.remove();

    // Seções configuráveis
    const secoes = [
      { key: "secao_parcelamento", label: "Seção: Parcelamento e Simulador" },
      { key: "secao_descontos", label: "Seção: Descontos Progressivos" },
      { key: "secao_logistica", label: "Seção: Logística e Entrega" },
    ];
    // Campos individuais
    const campos = [
      { key: "parcMinimo", label: "Valor mínimo para parcelar" },
      { key: "parcMaximo", label: "Parcelamento máximo" },
    ];

    let htmlList = "";
    [...secoes, ...campos].forEach((item) => {
      const isOculto = (dados.camposOcultos || []).includes(item.key);
      htmlList += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--clr-surface-alt); margin-bottom:6px; border-radius:6px; border:1px solid var(--clr-border);">
          <span style="font-size:12px; color:var(--clr-text); font-weight:600;">${item.label}</span>
          <button type="button" class="btn-toggle-vis btn-secondary" data-key="${item.key}" data-oculto="${isOculto}" style="font-size:11px; padding:3px 12px; min-height:auto;">
            ${isOculto ? "Mostrar" : "Ocultar"}
          </button>
        </div>
      `;
    });

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalConfigVendas";
    overlay.innerHTML = `
      <div class="modal" style="max-width:500px; width:90%; max-height:85vh; display:flex; flex-direction:column;">
        <div class="modal-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Configurar Campos</span>
          <button type="button" id="btnFecharCfgX" style="background:transparent; border:none; color:var(--clr-text-3); font-size:22px; cursor:pointer; line-height:1;">✕</button>
        </div>
        <div class="modal-subtitle">Oculte seções ou campos que você não utiliza.</div>
        <div style="overflow-y:auto; flex:1; margin:12px 0;">${htmlList}</div>
        <div class="modal-actions" style="margin-top:0;">
          <button class="btn-primary" id="btnConcluirCfg" style="width:100%;">Concluir</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelectorAll(".btn-toggle-vis").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        let isOculto = btn.dataset.oculto === "true";
        isOculto = !isOculto;
        btn.dataset.oculto = isOculto;
        btn.textContent = isOculto ? "Mostrar" : "Ocultar";
        btn.style.opacity = isOculto ? "0.6" : "1";

        if (isOculto) {
          if (!dados.camposOcultos.includes(key)) dados.camposOcultos.push(key);
        } else {
          dados.camposOcultos = dados.camposOcultos.filter((k) => k !== key);
        }
      });
    });

    const fechar = () => {
      _aplicarVisibilidade();
      _marcarAlterado();
      overlay.remove();
    };
    document.getElementById("btnFecharCfgX").addEventListener("click", fechar);
    document.getElementById("btnConcluirCfg").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
  }

  // ══════════════════════════════════════════
  //  SEÇÕES PERSONALIZADAS + ORDENAÇÃO
  // ══════════════════════════════════════════
  function _escSec(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

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
    if (!container) return;
    container.innerHTML = "";

    (dados.secoesCustom || []).forEach((secao) => {
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
          <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
            <button type="button" class="btn-secondary secao-remover" style="font-size:12px; padding:6px 12px;">
              Remover Seção
            </button>
            <button type="button" class="secao-chevron-btn" title="Abrir/Fechar seção" aria-label="Abrir ou fechar seção">
              <svg class="secao-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
          </div>
        </div>
        <div class="secao-corpo">
          <div class="vendas-grid secao-campos"></div>
          <button type="button" class="btn-secondary secao-add-campo" style="font-size:13px; margin-top:12px;">
            + &nbsp;Adicionar Campo
          </button>
        </div>
      `;

      // Estado colapsável da seção custom (só a seta alterna; o cabeçalho
      // tem um input de título, então não é clicável por inteiro).
      const _colId = "custom:" + secao.id;
      if (_lerColapsadas().includes(_colId)) card.classList.add("secao-colapsada");
      const _chevron = card.querySelector(".secao-chevron-btn");
      if (_chevron) {
        _chevron.setAttribute("aria-expanded", String(!card.classList.contains("secao-colapsada")));
        _chevron.addEventListener("click", (e) => {
          e.stopPropagation();
          _toggleSecao(card, _colId);
        });
      }

      const tituloInput = card.querySelector(".secao-titulo-input");
      tituloInput.addEventListener("input", (e) => { secao.titulo = e.target.value; _marcarAlterado(); });
      tituloInput.addEventListener("focus", () => { tituloInput.style.borderColor = "var(--clr-border)"; });
      tituloInput.addEventListener("blur", () => { tituloInput.style.borderColor = "transparent"; });

      card.querySelector(".secao-remover").addEventListener("click", () => {
        dados.secoesCustom = dados.secoesCustom.filter((s) => s.id !== secao.id);
        _renderSecoesCustom();
        _marcarAlterado();
      });

      card.querySelector(".secao-add-campo").addEventListener("click", () => {
        _abrirModalTipoCampo((tipo, rotulo) => {
          if (!secao.campos) secao.campos = [];
          secao.campos.push({ id: _genId(), rotulo: rotulo, valor: "", tipo: tipo });
          _renderSecoesCustom();
          _marcarAlterado();
        });
      });

      const campos = card.querySelector(".secao-campos");
      (secao.campos || []).forEach((campo) => {
        const info = _tipoInfo(campo.tipo);
        const fg = document.createElement("div");
        fg.className = "field-group";
        fg.innerHTML = `
          <label style="display:flex; justify-content:space-between; align-items:center;">
            <span>${_escSec(campo.rotulo)}</span>
            <button type="button" class="btn-remove-campo-sec" style="background:transparent; border:none; color:var(--clr-danger); cursor:pointer; font-size:10px;">Excluir</button>
          </label>
          <div class="input-addon-wrap ${info.suffix ? "input-addon-wrap-suffix" : ""}">
            ${info.prefix ? `<span class="input-prefix">${info.prefix}</span>` : ""}
            <input type="text" class="input-field secao-campo-input" inputmode="${info.inputmode}"
                   value="${_escSec(campo.valor)}" placeholder="${info.placeholder}" />
            ${info.suffix ? `<span class="input-suffix">${info.suffix}</span>` : ""}
          </div>
        `;

        const input = fg.querySelector(".secao-campo-input");
        
        // Aplica a máscara e salvamento de acordo com o tipo
        if (campo.tipo === "money" || campo.tipo === "percent") {
          input.addEventListener("input", () => {
            let val = input.value.replace(/\D/g, "");
            if (val === "") {
              input.value = "";
            } else {
              let num = parseInt(val, 10) / 100;
              input.value = campo.tipo === "money" ? formatMoneyBR(num) : formatPercentBR(num);
            }
            campo.valor = input.value;
            _marcarAlterado();
          });
        } else if (campo.tipo === "number") {
          input.addEventListener("input", () => { 
            input.value = input.value.replace(/[^\d]/g, ""); 
            campo.valor = input.value; 
            _marcarAlterado(); 
          });
        } else {
          input.addEventListener("input", (e) => { 
            campo.valor = e.target.value; 
            _marcarAlterado(); 
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

  function _abrirModalTipoCampo(onConfirm) {
    const existing = document.getElementById("modalTipoCampo");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalTipoCampo";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">Novo Campo</div>
        <div class="modal-subtitle" style="margin-bottom: var(--sp-lg);">Escolha o tipo e dê um nome ao campo.</div>
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
          <button class="btn-primary" id="confirmTipoCampo" style="padding:10px var(--sp-lg);font-size:14px;">Adicionar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    let tipoEscolhido = "text";
    const input = document.getElementById("inputRotuloCampo");
    const fechar = () => overlay.remove();

    overlay.querySelectorAll(".tipo-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        overlay.querySelectorAll(".tipo-opt").forEach((b) => { b.classList.remove("active"); b.style.borderColor = ""; b.style.color = ""; });
        btn.classList.add("active");
        btn.style.borderColor = "var(--clr-primary)"; btn.style.color = "var(--clr-primary)";
        tipoEscolhido = btn.dataset.tipo;
      });
    });
    const primeiro = overlay.querySelector(".tipo-opt.active");
    if (primeiro) { primeiro.style.borderColor = "var(--clr-primary)"; primeiro.style.color = "var(--clr-primary)"; }

    const confirmar = () => {
      const rotulo = input.value.trim();
      if (!rotulo) { showToast("Digite o nome do campo.", "warning"); _marcarErro(input); return; }
      fechar();
      onConfirm(tipoEscolhido, rotulo);
    };

    document.getElementById("cancelTipoCampo").addEventListener("click", fechar);
    document.getElementById("confirmTipoCampo").addEventListener("click", confirmar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmar(); });
    setTimeout(() => input.focus(), 60);
  }

  function _adicionarSecao() {
    if (!dados.secoesCustom) dados.secoesCustom = [];
    dados.secoesCustom.push({ id: _genId(), titulo: "Nova Seção", campos: [] });
    _renderSecoesCustom();
    _marcarAlterado();
    setTimeout(() => {
      const container = document.getElementById("secoesCustomContainer");
      if (container && container.lastElementChild) {
        container.lastElementChild.scrollIntoView({ behavior: "smooth", block: "center" });
        const t = container.lastElementChild.querySelector(".secao-titulo-input");
        if (t) t.focus();
      }
    }, 60);
  }

  // ── Ordenação de seções ──
  const _SECOES_FIXAS = [
    { key: "parcelamento", nome: "Parcelamento e Simulador" },
    { key: "descontos",    nome: "Descontos Progressivos" },
    { key: "logistica",    nome: "Logística e Entrega" },
  ];

  function _listarSecoesOrdenadas() {
    const fixas = _SECOES_FIXAS.map((s) => ({ id: "fixa:" + s.key, nome: s.nome, tipo: "fixa" }));
    const custom = (dados.secoesCustom || []).map((s) => ({ id: "custom:" + s.id, nome: s.titulo || "Seção sem nome", tipo: "custom" }));
    const todas = [...fixas, ...custom];
    const ordem = dados.ordemSecoes || [];
    if (ordem.length) {
      todas.sort((a, b) => {
        let ia = ordem.indexOf(a.id), ib = ordem.indexOf(b.id);
        if (ia === -1) ia = 999; if (ib === -1) ib = 999;
        return ia - ib;
      });
    }
    return todas;
  }

  function _aplicarOrdemSecoes() {
    const salva = dados.ordemSecoes || [];
    const ordem = salva.length ? salva : _ordemOriginal;
    if (!ordem.length) return;

    // Reordena os cards fixos (data-secao-card) no main
    const main = document.querySelector(".main-content");
    const cardsFixos = {};
    document.querySelectorAll("[data-secao-card]").forEach((el) => { cardsFixos[el.dataset.secaoCard] = el; });

    const container = document.getElementById("secoesCustomContainer");
    ordem.forEach((secId) => {
      if (secId.startsWith("fixa:")) {
        const key = secId.slice(5);
        if (cardsFixos[key] && container) main.insertBefore(cardsFixos[key], container);
      }
    });

    // Reordena as custom no array
    if (dados.secoesCustom && dados.secoesCustom.length) {
      dados.secoesCustom.sort((a, b) => {
        let ia = ordem.indexOf("custom:" + a.id), ib = ordem.indexOf("custom:" + b.id);
        if (ia === -1) ia = 999; if (ib === -1) ib = 999;
        return ia - ib;
      });
    }
  }

  function _abrirModalOrdenarSecoes() {
    const existing = document.getElementById("modalOrdenarSecoes");
    if (existing) existing.remove();
    const secoes = _listarSecoesOrdenadas();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalOrdenarSecoes";
    overlay.innerHTML = `
      <div class="modal" style="max-width:460px; width:90%;">
        <div class="modal-title">Ordenar Posição das Seções</div>
        <div class="modal-subtitle" style="margin-bottom: var(--sp-lg);">Arraste as seções pelo ícone <strong>☰</strong> para reordenar.</div>
        <div id="listaOrdenarSecoes" style="display:flex; flex-direction:column; gap:8px; max-height:50vh; overflow-y:auto;">
          ${secoes.map((s) => `
            <div class="ordenar-secao-item" draggable="true" data-sec-id="${s.id}"
                 style="display:flex; align-items:center; gap:12px; padding:12px 14px; background:var(--clr-surface-alt); border:1px solid var(--clr-border); border-radius:var(--r-md); cursor:grab; user-select:none;">
              <span style="color:var(--clr-text-3); font-size:16px; line-height:1;">☰</span>
              <span style="font-size:14px; font-weight:600; color:var(--clr-text);">${_escSec(s.nome || "")}</span>
              ${s.tipo === "custom" ? '<span style="margin-left:auto; font-size:10px; color:var(--clr-primary); font-weight:700; text-transform:uppercase;">Custom</span>' : ""}
            </div>
          `).join("")}
        </div>
        <div class="modal-actions" style="margin-top: var(--sp-lg);">
          <button class="btn-secondary" id="cancelOrdenarSecoes">Cancelar</button>
          <button class="btn-primary" id="salvarOrdenarSecoes" style="padding:10px var(--sp-lg);font-size:14px;">Salvar Ordem</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const lista = document.getElementById("listaOrdenarSecoes");
    let dragEl = null;
    lista.querySelectorAll(".ordenar-secao-item").forEach((item) => {
      item.addEventListener("dragstart", () => { dragEl = item; item.style.opacity = "0.4"; });
      item.addEventListener("dragend", () => { item.style.opacity = "1"; dragEl = null; });
      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        const alvo = e.currentTarget;
        if (!dragEl || dragEl === alvo) return;
        const rect = alvo.getBoundingClientRect();
        const meio = rect.top + rect.height / 2;
        if (e.clientY < meio) lista.insertBefore(dragEl, alvo);
        else lista.insertBefore(dragEl, alvo.nextSibling);
      });
    });

    const fechar = () => overlay.remove();
    document.getElementById("cancelOrdenarSecoes").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
    document.getElementById("salvarOrdenarSecoes").addEventListener("click", () => {
      dados.ordemSecoes = Array.from(lista.querySelectorAll(".ordenar-secao-item")).map((el) => el.dataset.secId);
      _aplicarOrdemSecoes();
      _renderSecoesCustom();
      _marcarAlterado();
      fechar();
      showToast("Ordem das seções atualizada!", "success");
    });
  }

  // Gera ID único (usa generateId se existir, senão fallback)
  function _genId() {
    if (typeof generateId === "function") return generateId();
    return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ══════════════════════════════════════════
  //  POPULAR & INICIALIZAR
  // ══════════════════════════════════════════
  function _popular() {
    document.querySelectorAll("[data-venda-key]").forEach((el) => {
      const key = el.dataset.vendaKey;
      let val = dados[key] ?? "";
      if (el.classList.contains("money-input") && val !== "") {
        val = formatMoneyBR(parseFormattedValue(val));
      }
      el.value = val;
    });
  }

  // ── Stepper do Parcelamento máximo (+/-) ──
  (function _initStepperParcelamento() {
    const input = document.getElementById("parcMaximoInput");
    const btnMais = document.getElementById("parcMais");
    const btnMenos = document.getElementById("parcMenos");
    if (!input) return;

    const _ler = () => {
      const n = parseInt(input.value, 10);
      return isNaN(n) || n < 1 ? 1 : n;
    };
    const _escrever = (n) => {
      const antes = input.value;
      input.value = String(Math.max(1, n));
      // Mudou o número (+, − ou ao sair do campo): alteração não salva.
      if (input.value !== antes) _marcarAlterado();
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    if (btnMais) btnMais.addEventListener("click", () => _escrever(_ler() + 1));
    if (btnMenos) btnMenos.addEventListener("click", () => _escrever(_ler() - 1));

    // Só números, mínimo 1 ao sair do campo
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^\d]/g, "");
      _marcarAlterado();
    });
    input.addEventListener("blur", () => {
      _escrever(_ler());
    });
  })();

  // Aplica o estado salvo do menu lateral
  (function _aplicarEstadoSidebar() {
    const colapsado = localStorage.getItem("precifiq_sidebar_colapsada") === "1";
    const sb = document.getElementById("sidebar");
    if (sb) sb.classList.toggle("sidebar-colapsada", colapsado);
    document.body.classList.toggle("sidebar-colapsada-body", colapsado);
  })();

  _popular();

  // Fallback: parcelamento nunca vazio nem menor que 1
  (function _garantirParcelamento() {
    const input = document.getElementById("parcMaximoInput");
    if (!input) return;
    const n = parseInt(input.value, 10);
    if (isNaN(n) || n < 1) input.value = "12";
  })();
  _aplicarMascarasGerais();
  _renderDescontos();
  _renderModalidades();
  _initSimulador();
  _renderSecoesCustom();
  _aplicarOrdemSecoes();
  _aplicarVisibilidade();
  _initColapsarSecoes();

  document.getElementById("btnSalvarVendas").addEventListener("click", _salvar);

  // Relê o que está salvo e redesenha a tela (descarta o que não foi salvo).
  function _recarregarDoDisco() {
    dados = _carregar();
    _popular();
    if (typeof _renderDescontos === "function") _renderDescontos();
    if (typeof _renderModalidades === "function") _renderModalidades();
    if (typeof _renderSecoesCustom === "function") _renderSecoesCustom();
    if (typeof _aplicarOrdemSecoes === "function") _aplicarOrdemSecoes();
    if (typeof _aplicarVisibilidade === "function") _aplicarVisibilidade();
  }

  // ── "Cancelar" (barra fixa): desfaz o que ainda não foi salvo ──
  const _btnCancelarVendas = document.getElementById("btnCancelarVendas");
  if (_btnCancelarVendas) {
    _btnCancelarVendas.addEventListener("click", () => {
      const st = document.getElementById("vendasStatus");
      const temAlteracao = !!(st && st.textContent.indexOf("não salvas") >= 0);
      const desfazer = () => {
        if (window.BapellCampos) window.BapellCampos.limparTodos();
        _recarregarDoDisco();
        _setStatus("", "");
        showToast(temAlteracao ? "Alterações canceladas: voltou o que estava salvo." : "Não há alterações para cancelar.", temAlteracao ? "success" : "default", 2800);
      };
      if (!temAlteracao || !(window.BapellModal && typeof window.BapellModal.confirmar === "function")) {
        desfazer();
        return;
      }
      window.BapellModal.confirmar({
        titulo: "Cancelar as alterações?",
        texto: "O que foi alterado e ainda não foi salvo volta a ser como estava.",
        botao: "Cancelar alterações",
        cancelar: "Continuar editando",
        perigo: true,
      }).then((sim) => { if (sim) desfazer(); });
    });
  }

  document.getElementById("btnAddDesconto").addEventListener("click", _addDesconto);
  document.getElementById("btnClonarModalidade").addEventListener("click", _abrirModalClonar);
  document.getElementById("btnConfigCampos").addEventListener("click", _abrirModalConfig);

  const _btnAddSecao = document.getElementById("btnAddSecao");
  if (_btnAddSecao) _btnAddSecao.addEventListener("click", _adicionarSecao);
  const _btnOrdenarSecoes = document.getElementById("btnOrdenarSecoes");
  if (_btnOrdenarSecoes) _btnOrdenarSecoes.addEventListener("click", _abrirModalOrdenarSecoes);

  // Ctrl+S salva — pelo próprio botão "Salvar": se ele pedir usuário e
  // senha (Usuários e Senhas › Senha nos botões), o atalho também pede.
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      const btn = document.getElementById("btnSalvarVendas");
      if (btn) btn.click();
      else _salvar();
    }
  });

  // ── Propagação entre abas ──
  // Se outra aba salvar as informações de venda, esta recarrega — exceto se
  // houver edição em andamento aqui (não descarta o que o usuário digita).
  // (Antes este ouvinte era ligado dentro do Ctrl+S: só passava a valer
  // depois da primeira tecla, e ganhava uma cópia a cada tecla.)
  window.addEventListener("storage", (e) => {
    if (e.key !== VENDAS_LS_KEY || !e.newValue) return;
    const st = document.getElementById("vendasStatus");
    const editando = st && st.textContent.indexOf("não salvas") >= 0;
    if (editando) return;
    dados = _carregar();
    _popular();
    if (typeof _renderDescontos === "function") _renderDescontos();
    if (typeof _renderModalidades === "function") _renderModalidades();
    if (typeof _renderSecoesCustom === "function") _renderSecoesCustom();
    if (typeof _aplicarVisibilidade === "function") _aplicarVisibilidade();
  });
});
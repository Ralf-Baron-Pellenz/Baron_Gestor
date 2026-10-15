// ═══════════════════════════════════════════
//  Precificador — JS/main.js  (dashboard)
// ═══════════════════════════════════════════

const CUSTOM_PLATFORMS_KEY = 'precifiq_custom_platforms';

function getCustomPlatforms() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_PLATFORMS_KEY)) || []; }
  catch { return []; }
}

function saveCustomPlatforms(list) {
  localStorage.setItem(CUSTOM_PLATFORMS_KEY, JSON.stringify(list));
}

document.addEventListener('DOMContentLoaded', async () => {

  if (typeof initStorage === "function") await initStorage();

  setDateHeader();

  // Aplica o estado salvo do menu lateral (colapsado ou aberto)
  (function _aplicarEstadoSidebar() {
    const colapsado = localStorage.getItem("precifiq_sidebar_colapsada") === "1";
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.toggle("sidebar-colapsada", colapsado);
    document.body.classList.toggle("sidebar-colapsada-body", colapsado);
  })();

  // ── Helpers ────────────────────────────────
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

  // Ao abrir o modal de novo, o vermelho da tentativa anterior sai.
  function _limparErros(raiz) {
    if (raiz && window.BapellCampos) window.BapellCampos.limparTodos(raiz);
  }

  function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ── Plataformas ocultas ────────────────────
  const HIDDEN_KEY = 'precifiq_hidden_platforms';

  function getHidden() {
    try { return JSON.parse(localStorage.getItem(HIDDEN_KEY)) || []; }
    catch { return []; }
  }

  function saveHidden(list) {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(list));
  }

  function isHidden(pid) { return getHidden().includes(pid); }

  function toggleHidden(pid) {
    const list = getHidden();
    const idx  = list.indexOf(pid);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(pid);
    saveHidden(list);
    renderVisibility();
    renderHiddenDropdown();
    updateCounts();
    // FIX 3: reordena após reativar uma loja oculta
    sortCards();
  }

  // ── Plataformas EXCLUÍDAS (padrão) ─────────
  // Lojas padrão ficam fixas no index.html; para "excluir" de verdade e não
  // voltarem ao recarregar, guardamos os ids aqui. (Customizadas são removidas
  // da própria lista de custom, então nem precisam entrar aqui.)
  const DELETED_KEY = 'precifiq_deleted_platforms';

  function getDeleted() {
    try { return JSON.parse(localStorage.getItem(DELETED_KEY)) || []; }
    catch { return []; }
  }

  function saveDeleted(list) {
    localStorage.setItem(DELETED_KEY, JSON.stringify(list));
  }

  // Remove da tela (e da config) as lojas padrão já excluídas
  function applyDeletedPlatforms() {
    const del = getDeleted();
    if (!del.length) return;
    del.forEach(pid => {
      const card = document.querySelector(`.platform-card[data-platform="${pid}"]`);
      if (card) card.remove();
      const idx = PLATFORMS_CONFIG.findIndex(p => p.id === pid);
      if (idx >= 0) PLATFORMS_CONFIG.splice(idx, 1);
    });
  }

  // Apenas oculta ou mostra os cartões na tela principal
  function renderVisibility() {
    const hidden = getHidden();
    document.querySelectorAll('.platform-card').forEach(card => {
      const pid = card.dataset.platform;
      if (!pid) return;
      card.style.display = hidden.includes(pid) ? 'none' : '';
    });
    updateEmptyState();
  }

  // Mostra o aviso "cadastre sua primeira plataforma" quando não há
  // nenhum card visível na tela principal.
  function updateEmptyState() {
    const empty = document.getElementById('emptyPlatforms');
    const grid  = document.getElementById('platformsGrid');
    if (!empty) return;
    let visiveis = 0;
    document.querySelectorAll('.platform-card').forEach(c => {
      if (c.style.display !== 'none') visiveis++;
    });
    const vazio = visiveis === 0;
    empty.style.display = vazio ? '' : 'none';
    if (grid) grid.style.display = vazio ? 'none' : '';
  }

  // Desenha a lista simplificada dentro do Dropdown flutuante
  function renderHiddenDropdown() {
    const hidden      = getHidden();
    const hiddenGrid  = document.getElementById('hiddenPlatformsGrid');
    const hiddenCount = document.getElementById('hiddenCount');
    const badge       = document.getElementById('hiddenCountBadge');

    if (!hiddenGrid) return;

    if (badge) badge.textContent = hidden.length;
    if (hiddenCount) hiddenCount.textContent = hidden.length;

    hiddenGrid.innerHTML = '';

    if (hidden.length === 0) {
      hiddenGrid.innerHTML = '<div style="font-size:13px; color:var(--clr-text-3); text-align:center; padding:15px 0;">Nenhuma loja oculta.</div>';
      return;
    }

    hidden.forEach(pid => {
      const cfg  = getPlatformConfig(pid) || { name: pid };
      const item = document.createElement('div');
      item.className = 'hidden-list-item';
      item.innerHTML = `
        <span class="hidden-list-name">${cfg.name}</span>
        <button class="btn-reactivate" data-unhide="${pid}">Reativar</button>
      `;
      item.querySelector('[data-unhide]').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleHidden(pid);
      });
      hiddenGrid.appendChild(item);
    });
  }

  /**
   * Posiciona um dropdown da sidebar ao lado do botão que o abriu.
   *
   * Escreve em VARIÁVEIS CSS (--drop-top / --drop-left), e não em
   * style.top/left: a regra do CSS precisa de !important para vencer a
   * regra base do dropdown, e !important vence estilo inline. Com
   * variável, a declaração fica !important e o valor continua vindo daqui.
   *
   * Se não couber à direita, abre à esquerda; se estourar embaixo, sobe o
   * necessário para caber na janela.
   */
  function _posicionarDropdownLateral(botao, section) {
    if (!botao || !section) return;
    const btnRect = botao.getBoundingClientRect();
    const dropRect = section.getBoundingClientRect();
    const margem = 8;

    // Abre à direita da SIDEBAR, não do botão.
    //
    // O botão fica recuado dentro da sidebar (termina em 223px numa
    // sidebar de 240px). Usando a borda dele, o painel começava 9px
    // ANTES do fim do menu e ficava por cima dele — encobrindo os itens
    // do próprio menu. Com o menu recolhido o recuo é o mesmo, mas
    // passava despercebido porque a faixa coberta é estreita.
    const barra = botao.closest(".sidebar");
    const limiteEsq = barra ? barra.getBoundingClientRect().right : btnRect.right;

    let left = limiteEsq + margem;
    if (left + dropRect.width > window.innerWidth - margem) {
      left = btnRect.left - dropRect.width - margem;
    }
    if (left < margem) left = margem;

    let top = btnRect.top;
    if (top + dropRect.height > window.innerHeight - margem) {
      top = window.innerHeight - dropRect.height - margem;
    }
    if (top < margem) top = margem;

    section.style.setProperty("--drop-left", left + "px");
    section.style.setProperty("--drop-top", top + "px");
  }

  // ── Botão "Lojas Ocultas" (Dropdown) ──────
  const btnHidden = document.getElementById('btnHiddenPlatforms');
  if (btnHidden) {
    btnHidden.addEventListener('click', (e) => {
      e.stopPropagation();
      const section = document.getElementById('hiddenSection');
      if (!section) return;

      const isVisible = section.style.display !== 'none';
      if (isVisible) {
        section.style.display = 'none';
        return;
      }

      section.style.display = 'flex';

      // Posiciona ao LADO do botão (à direita da sidebar), sem ser cortado.
      // Usa a MESMA função do dropdown de módulos: eram duas cópias da
      // mesma conta, e só uma foi corrigida quando o CSS mudou — este
      // dropdown continuava abrindo fora da tela.
      _posicionarDropdownLateral(btnHidden, section);
    });
  }

  document.addEventListener('click', (e) => {
    const section = document.getElementById('hiddenSection');
    if (section && section.style.display !== 'none') {
      if (!e.target.closest('#hiddenDropdownContainer')) {
        section.style.display = 'none';
      }
    }
  });

  // ── Dropdown de Opções dos Cartões ─────────
  let activeDropdown = null;

  function closeDropdown() {
    if (activeDropdown) { activeDropdown.remove(); activeDropdown = null; }
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.btn-options') && !e.target.closest('.options-dropdown')) {
      closeDropdown();
    }
  });

  // FIX 2: função reutilizável para vincular o dropdown a qualquer botão Opções
  function _bindOptionsBtn(btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault(); // impede o <a> pai de navegar

      if (activeDropdown) {
        const wasThisBtn = activeDropdown.dataset.forBtn === btn.dataset.platform;
        closeDropdown();
        if (wasThisBtn) return;
      }

      const pid      = btn.dataset.platform;
      const isCustom = btn.dataset.iscustom === 'true';
      const hidden   = isHidden(pid);
      // Item 4: a Loja Física é protegida — pode ser editada, mas não ocultada
      // nem excluída. Escondemos esses dois botões do menu dela.
      const protegida = (typeof isPlatformProtegida === 'function')
        ? isPlatformProtegida(pid)
        : (pid === 'loja_fisica');

      const dropdown = document.createElement('div');
      dropdown.className      = 'options-dropdown';
      dropdown.dataset.forBtn = pid;

      const iconOcultar = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
      const iconMostrar = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
      const iconExcluir = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
      const iconEditar = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;

      let btnEditarHtml = '';
      if (isCustom) {
        btnEditarHtml = `
          <button data-action="edit">
            <span style="display:inline-flex;">${iconEditar}</span> Editar Loja
          </button>
        `;
      }

      // Ocultar e Excluir só aparecem para lojas NÃO protegidas.
      const btnOcultarHtml = protegida ? '' : `
        <button data-action="toggle-hide">
          <span style="display:inline-flex;">${hidden ? iconMostrar : iconOcultar}</span>
          ${hidden ? 'Mostrar Loja' : 'Ocultar Loja'}
        </button>
      `;
      const btnExcluirHtml = protegida ? '' : `
        <button data-action="delete" class="danger-option">
          <span style="display:inline-flex;">${iconExcluir}</span> Excluir Loja
        </button>
      `;

      dropdown.innerHTML = `
        ${btnEditarHtml}
        ${btnOcultarHtml}
        ${btnExcluirHtml}
      `;

      document.body.appendChild(dropdown);
      activeDropdown = dropdown;

      // Posição fixa (viewport) — evita desalinhamento com scroll/muitas plataformas
      dropdown.style.position = 'fixed';
      const btnRect  = btn.getBoundingClientRect();
      const dropRect = dropdown.getBoundingClientRect();
      let left = btnRect.right - dropRect.width;
      let top  = btnRect.bottom + 6;
      if (left < 8) left = 8;
      if (left + dropRect.width > window.innerWidth - 8) left = window.innerWidth - dropRect.width - 8;
      // Se não couber embaixo, abre para cima
      if (top + dropRect.height > window.innerHeight - 8) {
        top = btnRect.top - dropRect.height - 6;
      }
      dropdown.style.left = left + 'px';
      dropdown.style.top  = top  + 'px';

      // Evento Editar (Apenas para Customizadas)
      const btnEdit = dropdown.querySelector('[data-action="edit"]');
      if (btnEdit) {
        btnEdit.addEventListener('click', (e) => {
          e.stopPropagation();
          closeDropdown();
          openEditPlatformModal(pid);
        });
      }

      const btnToggleHide = dropdown.querySelector('[data-action="toggle-hide"]');
      if (btnToggleHide) {
        btnToggleHide.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleHidden(pid);
          closeDropdown();
        });
      }

      const btnDelete = dropdown.querySelector('[data-action="delete"]');
      if (btnDelete) {
        btnDelete.addEventListener('click', (e) => {
          e.stopPropagation();
          closeDropdown();
          confirmDeletePlatform(pid, isCustom);
        });
      }
    });
  }

  // Vincula os botões das plataformas fixas (já existem no HTML)
  document.querySelectorAll('.btn-options').forEach(btn => _bindOptionsBtn(btn));

  // ── Confirmar exclusão de plataforma ───────
  function confirmDeletePlatform(pid, isCustom) {
    const cfg   = getPlatformConfig(pid);
    const name  = cfg ? cfg.name : pid;
    const count = countProducts(pid);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">Excluir plataforma?</div>
        <div class="modal-subtitle" style="margin-bottom:var(--sp-lg);">
          Tem certeza que deseja excluir <strong>${name}</strong>?
          ${count > 0
            ? `<br><span style="color:var(--clr-warning);font-size:13px;">⚠ ${count} produto${count > 1 ? 's' : ''} serão excluídos permanentemente.</span>`
            : ''}
          Esta ação não pode ser desfeita.
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="cancelDelPlat">Cancelar</button>
          <button class="btn-danger" style="padding:10px var(--sp-lg);font-size:14px;" id="confirmDelPlat">
            Sim, excluir
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#cancelDelPlat').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#confirmDelPlat').addEventListener('click', () => {
      deletePlatformProducts(pid);
      if (isCustom) {
        // Loja customizada: some da lista de custom
        saveCustomPlatforms(getCustomPlatforms().filter(p => p.id !== pid));
      } else {
        // Loja padrão: marca como excluída para não voltar ao recarregar
        const del = getDeleted();
        if (!del.includes(pid)) { del.push(pid); saveDeleted(del); }
        // Se estava oculta, tira da lista de ocultas
        const h = getHidden();
        const hi = h.indexOf(pid);
        if (hi >= 0) { h.splice(hi, 1); saveHidden(h); }
      }
      // Remove da config ativa e da tela (para os dois casos)
      const idx = PLATFORMS_CONFIG.findIndex(p => p.id === pid);
      if (idx >= 0) PLATFORMS_CONFIG.splice(idx, 1);
      const card = document.querySelector(`.platform-card[data-platform="${pid}"]`);
      if (card) card.remove();

      overlay.remove();
      showToast(`Plataforma "${name}" excluída.`, 'warning');
      updateCounts();
      renderVisibility();
      renderHiddenDropdown();
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  // ── Renderiza card de plataforma customizada ──
  // Definida APÓS _bindOptionsBtn para que o dropdown funcione imediatamente.
  function _renderCustomCard(p) {
    const grid = document.getElementById('platformsGrid');
    if (!grid) return;

    // A logo vem de getPlatformLogoSrc: para a Loja Física resolve
    // imagens/logo_loja.png; para custom com base64 usa o logoDataUrl; para
    // custom sem logo retorna "" e caímos no fallback de texto.
    const logoSrc = (typeof getPlatformLogoSrc === 'function')
      ? getPlatformLogoSrc(p.id)
      : (p.logoDataUrl || '');
    const logoHtml = logoSrc
      ? `<img src="${logoSrc}" alt="${p.name}" style="max-width:100%;max-height:100%;object-fit:contain;" onerror="this.style.display='none';this.nextElementSibling.style.display='';" /><span class="logo-fallback" style="display:none;">${p.name}</span>`
      : `<span class="logo-fallback">${p.name}</span>`;

    const card = document.createElement('a');
    // FIX 1: href garante que clicar no card navega normalmente
    card.href             = `plataforma.html?p=${p.id}`;
    card.className        = 'platform-card';
    card.dataset.platform = p.id;

    card.innerHTML = `
      <div class="card-logo-wrap">${logoHtml}</div>
      <div class="card-info">
        <span class="card-name">${p.name}</span>
        <span class="card-count">0 produtos</span>
      </div>
      <div class="card-actions">
        <button class="btn-options" data-platform="${p.id}" data-iscustom="true">Opções</button>
      </div>`;

    grid.appendChild(card);

    // FIX 1: só bloqueia navegação quando clica no botão Opções
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-options')) e.preventDefault();
    });

    // FIX 2: vincula dropdown ao botão Opções do novo card
    _bindOptionsBtn(card.querySelector('.btn-options'));
  }

  // FIX 3: Ordena todos os cards do grid alfabeticamente pelo nome
  function sortCards() {
    const grid = document.getElementById('platformsGrid');
    if (!grid) return;
    Array.from(grid.querySelectorAll('.platform-card[data-platform]'))
      .sort((a, b) => {
        const nameA = (a.querySelector('.card-name') || {}).textContent || '';
        const nameB = (b.querySelector('.card-name') || {}).textContent || '';
        return nameA.localeCompare(nameB, 'pt-BR');
      })
      .forEach(card => grid.appendChild(card));
  }

  // ── Contagem de produtos por plataforma ────
  function updateCounts() {
    document.querySelectorAll('.platform-card[data-platform]').forEach(card => {
      const pid     = card.dataset.platform;
      const count   = countProducts(pid);
      const countEl = card.querySelector('.card-count');
      if (countEl) {
        countEl.textContent = count === 1 ? '1 produto' : `${count} produtos`;
      }
    });

    // countProducts/countKits leem o cache direto, sem copiar as imagens base64.
    // Antes usavam getProducts() (cópia profunda) e a tela travava por segundos.
    //
    // Plataformas "ativas" = as cadastradas que não estão ocultas, tenham ou
    // não produtos. A Loja Física vem pronta na instalação e já conta: antes
    // só entrava quem tinha produto, e o painel mostrava 0 com a loja ali.
    const ocultas = getHidden();
    let totalProdutos = 0, totalPlataformas = 0, totalKits = 0;
    PLATFORMS_CONFIG.forEach(p => {
      const qtd = countProducts(p.id);
      if (!ocultas.includes(p.id)) totalPlataformas++;
      totalProdutos += qtd;
      totalKits += countKits(p.id);
    });
    _setText('totalProdutos',    totalProdutos);
    _setText('totalPlataformas', totalPlataformas);
    _setText('totalKits',        totalKits);
  }

  // ── Carrega plataformas customizadas salvas ──
  // Fica APÓS _bindOptionsBtn e _renderCustomCard estarem definidas.
  getCustomPlatforms().forEach(p => {
    if (!PLATFORMS_CONFIG.find(c => c.id === p.id)) {
      PLATFORMS_CONFIG.push(p);
    }
    _renderCustomCard(p);
  });

  // Item 4: a Loja Física é semeada no PLATFORMS_CONFIG (utils.js) e pode ainda
  // não estar em precifiq_custom_platforms numa instalação nova. Garante o card
  // dela na tela, sem depender do usuário tê-la editado antes.
  (function _garantirCardLojaFisica() {
    const jaTemCard = document.querySelector('.platform-card[data-platform="loja_fisica"]');
    if (jaTemCard) return;
    const lf = (typeof getPlatformConfig === 'function') ? getPlatformConfig('loja_fisica') : null;
    if (lf) _renderCustomCard(lf);
  })();

  // ── Modal Adicionar Plataforma ─────────────
  const modalAdd   = document.getElementById('modalAddPlatform');
  const btnAdd     = document.getElementById('btnAddPlatform');
  const btnCancel  = document.getElementById('btnCancelAddPlatform');
  const btnConfirm = document.getElementById('btnConfirmAddPlatform');

  if (btnAdd)    btnAdd.addEventListener('click', () => { _limparErros(modalAdd); modalAdd.style.display = 'flex'; });
  if (btnCancel) btnCancel.addEventListener('click', () => { modalAdd.style.display = 'none'; });
  if (modalAdd)  modalAdd.addEventListener('click', (e) => { if (e.target === modalAdd) modalAdd.style.display = 'none'; });

  // Botão do estado vazio ("Cadastre sua primeira plataforma") abre o mesmo modal
  const btnPrimeira = document.getElementById('btnCadastrarPrimeira');
  if (btnPrimeira && modalAdd) {
    btnPrimeira.addEventListener('click', () => { _limparErros(modalAdd); modalAdd.style.display = 'flex'; });
  }

  // Validação imediata ao escolher o arquivo (feedback antes de confirmar)
  const logoInputEl = document.getElementById('newPlatformLogo');
  if (logoInputEl) {
    logoInputEl.addEventListener('change', () => {
        const file = logoInputEl.files[0];
        if (!file) return;
        _validarLogoPlataforma(
          file,
          () => showToast('Logo válida!', 'success'),
          () => {} // MUDANÇA: Não apaga o arquivo agora, para forçar o bloqueio no botão Salvar
        );
      });
  }

  if (btnConfirm) {
    btnConfirm.addEventListener('click', () => {
      const nameInput = document.getElementById('newPlatformName');
      const logoInput = document.getElementById('newPlatformLogo');
      const name      = (nameInput.value || '').trim();

      if (!name) {
        showToast('Informe o nome da plataforma.', 'error');
        _marcarErro(nameInput);
        return;
      }

      const id = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now().toString(36);

      const doAdd = (logoDataUrl) => {
        const newPlatform = { id, name, ext: 'png', custom: true, logoDataUrl: logoDataUrl || null };

        // Persiste e injeta no config global
        const list = getCustomPlatforms();
        list.push(newPlatform);
        saveCustomPlatforms(list);
        PLATFORMS_CONFIG.push(newPlatform);

        // Renderiza o card e ordena
        _renderCustomCard(newPlatform);
        sortCards(); // FIX 3: reordena após adicionar

        nameInput.value = '';
        if (logoInput) logoInput.value = '';
        modalAdd.style.display = 'none';
        showToast(`Plataforma "${name}" adicionada!`, 'success');
        updateCounts();
        renderVisibility();
      };

      // A logo é obrigatória: sem uma imagem selecionada, não salva.
      if (!logoInput || !logoInput.files[0]) {
        showToast('Anexe uma logo para a plataforma.', 'error');
        if (logoInput) logoInput.focus();
        return;
      }
      // Validação estrita: logo QUADRADA (se reprovar, o próprio validador
      // avisa e o onFail impede o salvamento).
      _validarLogoPlataforma(
        logoInput.files[0],
        (base64) => doAdd(base64),
        () => {} // logo inválida: não salva, obriga o usuário a corrigir
      );
    });
  }

  // ── Modal Editar Plataforma ─────────────
  const modalEdit   = document.getElementById('modalEditPlatform');
  const btnCancelEdit  = document.getElementById('btnCancelEditPlatform');
  const btnConfirmEdit = document.getElementById('btnConfirmEditPlatform');
  const editLogoInputEl = document.getElementById('editPlatformLogo');

  function openEditPlatformModal(pid) {
    const cfg = getPlatformConfig(pid);
    if (!cfg) return;

    document.getElementById('editPlatformId').value = pid;
    document.getElementById('editPlatformName').value = cfg.name;
    document.getElementById('editPlatformLogo').value = ''; // Limpa sempre ao abrir
    _limparErros(modalEdit);
    
    modalEdit.style.display = 'flex';
  }

  if (btnCancelEdit) btnCancelEdit.addEventListener('click', () => { modalEdit.style.display = 'none'; });
  if (modalEdit) modalEdit.addEventListener('click', (e) => { if (e.target === modalEdit) modalEdit.style.display = 'none'; });

  // Validação imediata ao escolher o novo arquivo de logo
  if (editLogoInputEl) {
    editLogoInputEl.addEventListener('change', () => {
        const file = editLogoInputEl.files[0];
        if (!file) return;
        _validarLogoPlataforma(
          file,
          () => showToast('Nova logo válida!', 'success'),
          () => {} // MUDANÇA: Não apaga o arquivo agora
        );
      });
  }

  if (btnConfirmEdit) {
    btnConfirmEdit.addEventListener('click', () => {
      const pid = document.getElementById('editPlatformId').value;
      const nameInput = document.getElementById('editPlatformName');
      const logoInput = document.getElementById('editPlatformLogo');
      const newName = (nameInput.value || '').trim();

      if (!newName) {
        showToast('Informe o nome da plataforma.', 'error');
        _marcarErro(nameInput);
        return;
      }

      const doEdit = (newLogoDataUrl) => {
        // 1. Atualiza no Storage (Persistência)
        const customPlatforms = getCustomPlatforms();
        const pIndex = customPlatforms.findIndex(p => p.id === pid);
        if (pIndex >= 0) {
          customPlatforms[pIndex].name = newName;
          if (newLogoDataUrl) customPlatforms[pIndex].logoDataUrl = newLogoDataUrl;
          saveCustomPlatforms(customPlatforms);
        } else {
          // A Loja Física é semeada em memória e pode ainda não estar salva.
          // Ao editá-la pela primeira vez, gravamos o registro (preservando a
          // flag protegida) para o nome/logo persistirem entre sessões.
          const memCfg0 = (typeof getPlatformConfig === 'function') ? getPlatformConfig(pid) : null;
          const novo = Object.assign({}, memCfg0 || { id: pid, custom: true }, { name: newName });
          if (newLogoDataUrl) novo.logoDataUrl = newLogoDataUrl;
          customPlatforms.push(novo);
          saveCustomPlatforms(customPlatforms);
        }

        // 2. Atualiza na Memória Ativa (PLATFORMS_CONFIG)
        const memCfg = getPlatformConfig(pid);
        if (memCfg) {
          memCfg.name = newName;
          if (newLogoDataUrl) memCfg.logoDataUrl = newLogoDataUrl;
        }

        // 3. Atualiza o Card Visualmente na tela (DOM)
        const card = document.querySelector(`.platform-card[data-platform="${pid}"]`);
        if (card) {
          card.querySelector('.card-name').textContent = newName;
          
          if (newLogoDataUrl) {
            const img = card.querySelector('img');
            if (img) {
              img.src = newLogoDataUrl;
            } else {
              // Se estava usando fallback (só texto), cria a tag de imagem no lugar
              card.querySelector('.card-logo-wrap').innerHTML = `<img src="${newLogoDataUrl}" alt="${newName}" style="max-width:100%;max-height:100%;object-fit:contain;" />`;
            }
          }
        }

        sortCards(); // Reordena o grid caso o nome tenha mudado
        modalEdit.style.display = 'none';
        showToast('Plataforma atualizada com sucesso!', 'success');
        renderHiddenDropdown(); // Atualiza nomes no dropdown de ocultos se estiver lá
      };

      if (logoInput && logoInput.files[0]) {
        _validarLogoPlataforma(
          logoInput.files[0],
          (base64) => doEdit(base64),
          () => {} // MUDANÇA: Trava a edição e obriga o usuário a trocar a foto
        );
      } else {
        doEdit(null); // Mantém a logo atual se o usuário não escolheu nenhuma nova
      }
    });
  }

  // ── Validação estrita da logo da plataforma ──
  // Regras: imagem QUADRADA (largura === altura) entre 200x200px e 500x500px.
  // Sem conversão/compressão: se passar, salva o base64 original; se não, bloqueia.
  const LOGO_MIN = 200;
  const LOGO_MAX = 500;

 function _validarLogoPlataforma(file, onOk, onFail) {
    if (!file) {
      if (onFail) onFail();
      return;
    }

    const reader = new FileReader();

    reader.onload = (evt) => {
      const base64 = evt.target.result;
      const img = new Image();

      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;

        const quadrada = w === h;

        if (!quadrada) {
          // Criação do Modal de Erro Bonito (Dinâmico) - MODO FORÇA BRUTA
          const overlay = document.createElement('div');
          
          // Removemos a classe 'modal-overlay' e injetamos as regras direto no elemento
          // O z-index 2147483647 é o valor MÁXIMO absoluto permitido pelos navegadores
          overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(0, 0, 0, 0.85); display: flex; align-items: center; justify-content: center; z-index: 2147483647 !important;';
          
          overlay.innerHTML = `
            <div class="modal" style="text-align: center; max-width: 400px; padding: 32px 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.7); position: relative; z-index: 2147483647 !important;">
              <div style="width: 56px; height: 56px; margin: 0 auto 16px; background: #fee2e2; color: #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              </div>
              <div class="modal-title" style="font-size: 20px; margin-bottom: 12px; color: var(--clr-text);">Ação Bloqueada</div>
              <div class="modal-subtitle" style="font-size: 14px; margin-bottom: 24px; line-height: 1.6; color: var(--clr-text-2);">
                A imagem selecionada <strong>não é quadrada</strong>.<br><br>
                Para continuar, insira uma imagem com proporção exata (ex: 200x200, 500x500).<br><br>
                Precisa de ajuda? Utilize nosso <a href="https://drive.google.com/drive/folders/1VUTqOKYOAj9N3gKnzqttSJ-L48A177Ph?usp=drive_link" target="_blank" style="color: var(--clr-primary); font-weight: 700; text-decoration: underline;">banco de logos</a>.
              </div>
              <div class="modal-actions" style="justify-content: center;">
                <button class="btn-primary" id="btnCloseErrorModal" style="width: 100%; justify-content: center; padding: 12px;">Entendi e vou corrigir</button>
              </div>
            </div>
          `;
          
          document.body.appendChild(overlay);
          
          // Função para fechar esse modal específico de erro
          const fecharModalErro = () => overlay.remove();
          
          overlay.querySelector('#btnCloseErrorModal').addEventListener('click', fecharModalErro);
          overlay.addEventListener('click', (e) => { if (e.target === overlay) fecharModalErro(); });

          if (onFail) onFail();
          return;
        }

        onOk(base64); // Aprovada → continua o salvamento
      };

      img.onerror = () => {
        showToast('Não foi possível ler a imagem selecionada.', 'error');
        if (onFail) onFail();
      };

      img.src = base64;
    };

    reader.onerror = () => {
      showToast('Falha ao carregar o arquivo.', 'error');
      if (onFail) onFail();
    };

    reader.readAsDataURL(file);
  }

  // ── Navegação: clique no card das plataformas fixas (já no HTML) ──
  document.querySelectorAll('.platform-card').forEach(card => {
    if (card.tagName !== 'A') return;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-options')) e.preventDefault();
    });
  });

    // ═══════════════════════════════════════════
    //  GESTÃO DOS BOTÕES DE MÓDULO
    //  (reordenar por arrastar-e-soltar + ocultar)
    // ═══════════════════════════════════════════
    (function _gestaoModulos() {
      var ORDEM_KEY = "precifiq_modules_order";
      var OCULTOS_KEY = "precifiq_modules_hidden";
      var nav = document.getElementById("modulesNav");
      if (!nav) return;

      // Rótulos amigáveis (para o painel de ocultos)
      var ROTULOS = {
        "acoes-massa": "Ações em Massa",
        "empresa": "Dados da Empresa",
        "vendas": "Informações de Venda",
        "registro-vendas": "Registro de Vendas",
        "financeiro": "Controle Financeiro",
        "nf": "Notas Fiscais",
        "ean": "Gerador de EAN",
        "lembretes": "Lembretes",
        // Sem o rótulo aqui, o painel de "Módulos ocultos" mostra o id cru
        // ("vendas-import", "calculos") em vez do nome que o usuário vê no
        // menu. O fallback existe e não quebra, mas fica ilegível.
        "calculos": "Central de Cálculos",
        "vendas-import": "Processador de Planilha",
        "devolucoes": "Gestor de Devoluções",
      };

      var modoReordenar = false;

      // ── Persistência ──
      function getOrdem() {
        try { return JSON.parse(localStorage.getItem(ORDEM_KEY)) || []; }
        catch (e) { return []; }
      }
      function saveOrdem(arr) {
        try { localStorage.setItem(ORDEM_KEY, JSON.stringify(arr)); } catch (e) {}
      }
      function getOcultos() {
        try { return JSON.parse(localStorage.getItem(OCULTOS_KEY)) || []; }
        catch (e) { return []; }
      }
      function saveOcultos(arr) {
        try { localStorage.setItem(OCULTOS_KEY, JSON.stringify(arr)); } catch (e) {}
      }

      // Todos os IDs presentes no HTML (na ordem original de marcação)
      function idsNoHtml() {
        return Array.prototype.map.call(
          nav.querySelectorAll(".module-nav-item"),
          function (el) { return el.dataset.modid; }
        );
      }

      // ── Aplica a ordem salva ao DOM ──
      function aplicarOrdem() {
        var ordem = getOrdem();
        if (!ordem.length) return; // nunca reordenou → mantém a ordem do HTML
        var presentes = idsNoHtml();
        // Anexa na ordem salva; ids novos (não salvos) vão ao final na ordem do HTML
        ordem.forEach(function (id) {
          var el = nav.querySelector('.module-nav-item[data-modid="' + id + '"]');
          if (el) nav.appendChild(el);
        });
        presentes.forEach(function (id) {
          if (ordem.indexOf(id) < 0) {
            var el = nav.querySelector('.module-nav-item[data-modid="' + id + '"]');
            if (el) nav.appendChild(el);
          }
        });
      }

      // ── Aplica quais estão ocultos ──
      function aplicarOcultos() {
        var ocultos = getOcultos();
        Array.prototype.forEach.call(nav.querySelectorAll(".module-nav-item"), function (el) {
          el.style.display = ocultos.indexOf(el.dataset.modid) >= 0 ? "none" : "";
        });
        renderPainelOcultos();
      }

      function renderPainelOcultos() {
        var ocultos = getOcultos();
        var grid = document.getElementById("hiddenModulesGrid");
        var count = document.getElementById("hiddenModulesCount");
        var badge = document.getElementById("hiddenModulesBadge");
        if (count) count.textContent = ocultos.length;
        if (badge) badge.textContent = ocultos.length;
        if (!grid) return;

        // Ícones: olho aberto = clique para MOSTRAR; olho cortado = clique para OCULTAR.
        var olho = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
        var olhoCortado = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

        // Lista TODOS os módulos (na ordem atual), cada um com um toque para alternar.
        grid.innerHTML = idsNoHtml().map(function (id) {
          var oculto = ocultos.indexOf(id) >= 0;
          return '<div class="hidden-mod-item" data-toggle-mod="' + id + '"' +
              (oculto ? ' style="opacity:.55;"' : "") + ">" +
            "<span>" + (ROTULOS[id] || id) + "</span>" +
            '<button class="hidden-mod-restore" title="' + (oculto ? "Mostrar" : "Ocultar") + '">' +
              (oculto ? olho : olhoCortado) +
            "</button></div>";
        }).join("");

        Array.prototype.forEach.call(grid.querySelectorAll("[data-toggle-mod]"), function (item) {
          item.addEventListener("click", function () {
            toggleModulo(item.dataset.toggleMod);
          });
        });
      }

      function ocultarModulo(id) {
        var ocultos = getOcultos();
        if (ocultos.indexOf(id) < 0) ocultos.push(id);
        saveOcultos(ocultos);
        aplicarOcultos();
        if (typeof showToast === "function") showToast((ROTULOS[id] || id) + " ocultado.", "default");
      }

      function mostrarModulo(id) {
        var ocultos = getOcultos().filter(function (x) { return x !== id; });
        saveOcultos(ocultos);
        aplicarOcultos();
        if (typeof showToast === "function") showToast((ROTULOS[id] || id) + " reexibido.", "success");
      }

      // Alterna: se estiver visível, oculta; se estiver oculto, mostra.
      function toggleModulo(id) {
        var ocultos = getOcultos();
        var i = ocultos.indexOf(id);
        var vaiOcultar = i < 0;
        if (vaiOcultar) ocultos.push(id); else ocultos.splice(i, 1);
        saveOcultos(ocultos);
        aplicarOcultos();
        if (typeof showToast === "function") {
          showToast((ROTULOS[id] || id) + (vaiOcultar ? " ocultado." : " reexibido."), vaiOcultar ? "default" : "success");
        }
      }

      // ── (O "olho" de ocultar por item foi removido do menu.) ──
      // Agora o ocultar/mostrar é feito pelo painel "Módulos ocultos", que lista
      // todos os módulos com um toque para alternar (ver renderPainelOcultos).

      // ═══ MODO REORDENAR (liga/desliga o arraste) ═══
      var btnReorder = document.getElementById("btnReorderModules");
      function setModoReordenar(ativo) {
        modoReordenar = ativo;
        nav.classList.toggle("reordenando", ativo);
        Array.prototype.forEach.call(nav.querySelectorAll(".module-nav-item"), function (el) {
          el.setAttribute("draggable", ativo ? "true" : "false");
        });
        if (btnReorder) {
          btnReorder.classList.toggle("ativo", ativo);
          var txt = btnReorder.querySelector(".sidebar-label-txt");
          if (txt) txt.textContent = ativo ? "Concluir ordenação" : "Reordenar módulos";
        }
        if (ativo && typeof showToast === "function") {
          showToast("Arraste os módulos para reordenar. Clique em Concluir ao terminar.", "default");
        }
      }
      if (btnReorder) {
        btnReorder.addEventListener("click", function (e) {
          e.stopPropagation();
          setModoReordenar(!modoReordenar);
        });
      }

      // ═══ DRAG AND DROP ═══
      var arrastado = null;

      nav.addEventListener("dragstart", function (e) {
        var item = e.target.closest(".module-nav-item");
        if (!item || !modoReordenar) { e.preventDefault(); return; }
        arrastado = item;
        item.classList.add("arrastando");
        try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", item.dataset.modid); } catch (er) {}
      });

      nav.addEventListener("dragend", function () {
        if (arrastado) arrastado.classList.remove("arrastando");
        arrastado = null;
        Array.prototype.forEach.call(nav.querySelectorAll(".module-nav-item"), function (el) {
          el.classList.remove("drop-antes", "drop-depois");
        });
      });

      nav.addEventListener("dragover", function (e) {
        if (!modoReordenar || !arrastado) return;
        e.preventDefault();
        try { e.dataTransfer.dropEffect = "move"; } catch (er) {}
        var alvo = e.target.closest(".module-nav-item");
        if (!alvo || alvo === arrastado) return;

        // decide se solta antes ou depois, pela posição vertical do mouse
        var rect = alvo.getBoundingClientRect();
        var depois = (e.clientY - rect.top) > rect.height / 2;

        Array.prototype.forEach.call(nav.querySelectorAll(".module-nav-item"), function (el) {
          el.classList.remove("drop-antes", "drop-depois");
        });
        alvo.classList.add(depois ? "drop-depois" : "drop-antes");
      });

      nav.addEventListener("drop", function (e) {
        if (!modoReordenar || !arrastado) return;
        e.preventDefault();
        var alvo = e.target.closest(".module-nav-item");
        if (!alvo || alvo === arrastado) return;

        var rect = alvo.getBoundingClientRect();
        var depois = (e.clientY - rect.top) > rect.height / 2;

        if (depois) {
          alvo.parentNode.insertBefore(arrastado, alvo.nextSibling);
        } else {
          alvo.parentNode.insertBefore(arrastado, alvo);
        }

        Array.prototype.forEach.call(nav.querySelectorAll(".module-nav-item"), function (el) {
          el.classList.remove("drop-antes", "drop-depois");
        });

        // salva a nova ordem
        saveOrdem(idsNoHtml());
      });

      // ═══ Dropdown "Módulos ocultos" (abre ao lado, como o de plataformas) ═══
      var btnHide = document.getElementById("btnHideModules");
      if (btnHide) {
        btnHide.addEventListener("click", function (e) {
          e.stopPropagation();
          var section = document.getElementById("hiddenModulesSection");
          if (!section) return;
          var visivel = section.style.display !== "none";
          if (visivel) { section.style.display = "none"; return; }
          section.style.display = "flex";
          _posicionarDropdown(btnHide, section);
        });
      }

      // Reaproveita a mesma lógica de posicionamento do dropdown de plataformas
      // Delega para a função única. Manter duas cópias da mesma conta foi
      // o que deixou um dos dropdowns para trás na correção anterior.
      function _posicionarDropdown(botao, section) {
        _posicionarDropdownLateral(botao, section);
      }

      // Fecha o dropdown de módulos ocultos ao clicar fora
      document.addEventListener("click", function (e) {
        var section = document.getElementById("hiddenModulesSection");
        if (section && section.style.display !== "none") {
          if (!e.target.closest("#hideDropdownContainer")) {
            section.style.display = "none";
          }
        }
      });

      // ── Init da gestão de módulos ──
      aplicarOrdem();
      aplicarOcultos();
    })();

  // ═══════════════════════════════════════════
  //  PAINÉIS DO TOPO: Panorama do DRE + Próximos lembretes
  //  (o número de plataformas continua vindo de updateCounts)
  // ═══════════════════════════════════════════
  function _n(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  function _fmtBRL(v) {
    try {
      return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    } catch (e) {
      return "R$ " + Number(v || 0).toFixed(2).replace(".", ",");
    }
  }

  // Resumo do mês atual da EMPRESA ATIVA no DRE (mesmos números da tela financeira).
  // Chave onde guardamos QUAL empresa do cadastro está selecionada no painel
  // da index. É separada do ativaId do DRE de propósito: trocar a empresa aqui
  // não deve mexer na empresa ativa das outras telas.
  const DRE_PAINEL_EMP_KEY = "precifiq_index_dre_empresa";

  function _normNomeEmp(t) {
    return String(t || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // Lista TODAS as empresas do cadastro central (mesma fonte do módulo Empresas).
  function _empresasCadastro() {
    try {
      const raw = JSON.parse(localStorage.getItem("precifiq_empresa"));
      if (raw && Array.isArray(raw.empresas)) {
        return raw.empresas.map((e, i) => ({
          id: e.id,
          nome: e.nomeAba || e.nomeFantasia || e.razaoSocial || ("Empresa " + (i + 1)),
        }));
      }
    } catch (e) {}
    return [];
  }

  // Dada uma empresa do CADASTRO, acha o store dela no DRE. A ligação é pela
  // origemEmpresaId (vínculo firme); para registros antigos, cai no nome.
  // Devolve null se a empresa ainda não tem dados no DRE (painel zerado).
  function _storeDreDaEmpresaCadastro(container, empCadastroId, empCadastroNome) {
    if (!container || !Array.isArray(container.empresas) || !container.dados) return null;
    let dreEmp = container.empresas.find((e) => e && e.origemEmpresaId === empCadastroId);
    if (!dreEmp && empCadastroNome) {
      const alvo = _normNomeEmp(empCadastroNome);
      dreEmp = container.empresas.find((e) => e && _normNomeEmp(e.nome) === alvo);
    }
    if (!dreEmp) return null;
    const store = container.dados[dreEmp.id];
    return (store && Array.isArray(store.movimentacoes)) ? store : null;
  }

  // Soma faturamento/despesas/lucro do MÊS ATUAL de um store do DRE.
  function _totaisMesDoStore(store) {
    const agora = new Date();
    const ano = agora.getFullYear(), mes = agora.getMonth() + 1;
    let faturamento = 0, deducoes = 0, despesas = 0;
    (store.movimentacoes || []).forEach((m) => {
      if (!m || !m.data) return;
      const partes = String(m.data).split("-");
      if (parseInt(partes[0]) !== ano || parseInt(partes[1]) !== mes) return;
      if (m.tipo === "Venda") { faturamento += _n(m.bruto); deducoes += _n(m.deducoes); }
      else { despesas += Math.abs(_n(m.liquido)); }
    });
    return { faturamento, despesas, lucro: faturamento - deducoes - despesas };
  }

  // Resolve qual empresa do cadastro está selecionada no painel. Usa a salva;
  // se não houver (ou não existir mais), cai na primeira do cadastro.
  function _empresaSelecionadaPainel(empresas) {
    if (!empresas.length) return null;
    let salvaId = "";
    try { salvaId = localStorage.getItem(DRE_PAINEL_EMP_KEY) || ""; } catch (e) {}
    return empresas.find((e) => e.id === salvaId) || empresas[0];
  }

  // Resumo do mês atual da empresa selecionada no painel (números do DRE).
  function _renderPainelDRE() {
    const empEl = document.getElementById("dreEmpresa");
    const fatEl = document.getElementById("dreFaturamento");
    const despEl = document.getElementById("dreDespesas");
    const lucEl = document.getElementById("dreLucro");
    if (!fatEl) return;

    let container = null;
    try { container = JSON.parse(localStorage.getItem("precifiq_dre")); } catch (e) {}

    const grid = document.querySelector(".stats-panel-dre-grid");
    const empresas = _empresasCadastro();

    // Sem NENHUMA empresa cadastrada: aviso e nada de dropdown.
    if (!empresas.length) {
      if (grid) grid.innerHTML = '<div class="stats-dre-vazio">Cadastre uma empresa para ver o panorama.</div>';
      if (empEl) empEl.innerHTML = "";
      return;
    }

    const selecionada = _empresaSelecionadaPainel(empresas);
    const store = _storeDreDaEmpresaCadastro(container, selecionada.id, selecionada.nome);
    const totais = store ? _totaisMesDoStore(store) : { faturamento: 0, despesas: 0, lucro: 0 };

    // Redesenha o grid de valores (pode ter sido substituído pelo aviso antes).
    if (grid && !document.getElementById("dreFaturamento")) {
      grid.innerHTML =
        '<div class="stats-dre-item"><span class="stats-dre-label">Faturamento</span><span class="stats-dre-valor" id="dreFaturamento">—</span></div>' +
        '<div class="stats-dre-item"><span class="stats-dre-label">Despesas</span><span class="stats-dre-valor" id="dreDespesas">—</span></div>' +
        '<div class="stats-dre-item"><span class="stats-dre-label">Lucro</span><span class="stats-dre-valor" id="dreLucro">—</span></div>';
    }
    const _fat = document.getElementById("dreFaturamento");
    const _desp = document.getElementById("dreDespesas");
    const _luc = document.getElementById("dreLucro");
    if (_fat) _fat.textContent = _fmtBRL(totais.faturamento);
    if (_desp) _desp.textContent = _fmtBRL(totais.despesas);
    if (_luc) {
      _luc.textContent = _fmtBRL(totais.lucro);
      _luc.classList.toggle("is-lucro-pos", totais.lucro > 0);
      _luc.classList.toggle("is-lucro-neg", totais.lucro < 0);
    }

    // Nome + setinha de troca (dropdown). Renderiza o seletor no #dreEmpresa.
    _renderSeletorEmpresaDRE(empEl, empresas, selecionada);
  }

  // Monta o nome da empresa com uma setinha ao lado que abre a lista para trocar.
  function _renderSeletorEmpresaDRE(empEl, empresas, selecionada) {
    if (!empEl) return;
    empEl.innerHTML =
      '<button type="button" class="dre-emp-btn" id="dreEmpBtn" title="Trocar empresa">' +
        '<span class="dre-emp-nome">' + _escHtml(selecionada.nome) + '</span>' +
        '<svg class="dre-emp-seta" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
      '</button>' +
      '<div class="dre-emp-menu" id="dreEmpMenu" style="display:none;">' +
        empresas.map((e) =>
          '<button type="button" class="dre-emp-opt' + (e.id === selecionada.id ? ' ativa' : '') + '" data-emp-id="' + _escHtml(e.id) + '">' +
            _escHtml(e.nome) +
          '</button>'
        ).join("") +
      '</div>';

    const btn = document.getElementById("dreEmpBtn");
    const menu = document.getElementById("dreEmpMenu");
    if (!btn || !menu) return;

    // O painel inteiro é um link para financeiro.html; o clique no seletor não
    // deve navegar nem seguir o link — só abre/fecha a lista.
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      menu.style.display = menu.style.display === "none" ? "block" : "none";
    });
    menu.querySelectorAll(".dre-emp-opt").forEach((opt) => {
      opt.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const id = opt.dataset.empId;
        try { localStorage.setItem(DRE_PAINEL_EMP_KEY, id); } catch (e) {}
        menu.style.display = "none";
        // Troca imediata: recalcula o painel com a empresa escolhida.
        _renderPainelDRE();
      });
    });
    // Fecha ao clicar fora
    if (!document.body.dataset.dreEmpOutside) {
      document.body.dataset.dreEmpOutside = "1";
      document.addEventListener("click", (ev) => {
        const m = document.getElementById("dreEmpMenu");
        const b = document.getElementById("dreEmpBtn");
        if (m && m.style.display !== "none" && !m.contains(ev.target) && (!b || !b.contains(ev.target))) {
          m.style.display = "none";
        }
      });
    }
  }

  function _escHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Os 3 próximos lembretes ainda não vencidos e não concluídos.
  function _renderPainelLembretes() {
    const lista = document.getElementById("lembretesLista");
    if (!lista) return;

    let arr = null;
    try { arr = JSON.parse(localStorage.getItem("precifiq_lembretes")); } catch (e) {}
    if (!Array.isArray(arr)) arr = [];

    const agora = Date.now();
    const proximos = arr
      .filter((l) => l && !l.concluido && !l.oculto && l.dataHora)
      .filter((l) => new Date(l.dataHora).getTime() >= agora)
      .sort((a, b) => new Date(a.dataHora) - new Date(b.dataHora))
      .slice(0, 3);

    if (proximos.length === 0) {
      lista.removeAttribute("data-qtd");
      lista.innerHTML = '<div class="stats-lembretes-vazio">Nenhum lembrete próximo.</div>';
      return;
    }

    lista.setAttribute("data-qtd", String(proximos.length));

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);

    lista.innerHTML = proximos.map((l) => {
      const d = new Date(l.dataHora);
      const p = (x) => String(x).padStart(2, "0");
      const dataTxt = p(d.getDate()) + "/" + p(d.getMonth() + 1);
      const horaTxt = p(d.getHours()) + ":" + p(d.getMinutes());

      // "amanhã" ganha destaque; hoje e amanhã evitam a data crua.
      let quando, classe = "";
      const dd = new Date(d); dd.setHours(0, 0, 0, 0);
      if (dd.getTime() === hoje.getTime()) { quando = "Hoje, " + horaTxt; classe = " is-amanha"; }
      else if (dd.getTime() === amanha.getTime()) { quando = "Amanhã, " + horaTxt; classe = " is-amanha"; }
      else { quando = dataTxt + " " + horaTxt; }

      const titulo = (l.titulo || "Lembrete").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return '<div class="stats-lembrete">' +
        '<span class="stats-lembrete-titulo">' + titulo + "</span>" +
        '<span class="stats-lembrete-data' + classe + '">' + quando + "</span>" +
      "</div>";
    }).join("");
  }

  function _renderPaineisTopo() {
    try { _renderPainelDRE(); } catch (e) {}
    try { _renderPainelLembretes(); } catch (e) {}
  }

  // ── Init ───────────────────────────────────
  applyDeletedPlatforms(); // Remove as lojas padrão que já foram excluídas
  updateCounts();
  _renderPaineisTopo();     // Painéis do topo: DRE + próximos lembretes
  renderVisibility();
  renderHiddenDropdown();
  sortCards(); // FIX 3: ordena alfabeticamente no carregamento inicial
});

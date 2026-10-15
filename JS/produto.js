// ═══════════════════════════════════════════
//  Precificador — produto.js
//  v4.4 — Integração de Logística (Peso e Dimensões)
// ═══════════════════════════════════════════

document.addEventListener("DOMContentLoaded", async () => {
  // Aguarda o IndexedDB carregar os produtos antes de qualquer leitura
  if (typeof initStorage === "function") await initStorage();

  // Campo obrigatório vazio: fica vermelho até ser preenchido (utils.js)
  // e recebe o foco. `resolvido` diz quando o vermelho pode sair.
  function _marcarErro(el, resolvido) {
    if (!el) return;
    if (window.BapellCampos) {
      window.BapellCampos.marcar(el, null, resolvido ? { resolvido } : undefined);
      window.BapellCampos.focar(el);
    } else {
      try { el.focus(); } catch (e) {}
    }
  }

  // ==========================================
  //  GALERIA DE IMAGENS (até 3 por produto)
  // ==========================================
  const MAX_IMAGENS = 3;
  const galleryEl = document.getElementById("productGallery");
  const imgInput = document.getElementById("productImgInput");

  // Modal de zoom (visualizar imagem ampliada, com navegação < >)
  let zoomModal = document.getElementById("zoomModal");
  if (!zoomModal) {
    zoomModal = document.createElement("div");
    zoomModal.id = "zoomModal";
    zoomModal.style.cssText =
      "display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.88); z-index:9999; justify-content:center; align-items:center;";
    zoomModal.innerHTML = `
      <button type="button" id="zoomPrev" class="zoom-nav zoom-prev" title="Anterior">‹</button>
      <img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" id="zoomedImg" style="max-width:88%; max-height:88%; border-radius:8px; box-shadow:0 10px 40px rgba(0,0,0,0.5);">
      <button type="button" id="zoomNext" class="zoom-nav zoom-next" title="Próxima">›</button>
      <button type="button" id="zoomClose" class="zoom-close" title="Fechar">✕</button>
      <div id="zoomCounter" class="zoom-counter"></div>
    `;
    document.body.appendChild(zoomModal);

    // Fecha ao clicar no fundo (não nos botões/imagem)
    zoomModal.addEventListener("click", (e) => {
      if (e.target === zoomModal) zoomModal.style.display = "none";
    });
    document.getElementById("zoomClose").addEventListener("click", () => {
      zoomModal.style.display = "none";
    });
  }
  const zoomedImg = document.getElementById("zoomedImg");

  // Índice da imagem no zoom
  let _zoomIdx = 0;

  function _abrirZoom(idx) {
    const imagens = _getImagens();
    if (imagens.length === 0) return;
    _zoomIdx = idx;
    _atualizarZoom();
    zoomModal.style.display = "flex";
  }

  function _atualizarZoom() {
    const imagens = _getImagens();
    if (_zoomIdx < 0) _zoomIdx = imagens.length - 1;
    if (_zoomIdx >= imagens.length) _zoomIdx = 0;

    zoomedImg.src = imagens[_zoomIdx] || "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

    const prev = document.getElementById("zoomPrev");
    const next = document.getElementById("zoomNext");
    const counter = document.getElementById("zoomCounter");
    const temVarias = imagens.length > 1;

    if (prev) prev.style.display = temVarias ? "flex" : "none";
    if (next) next.style.display = temVarias ? "flex" : "none";
    if (counter) {
      counter.style.display = temVarias ? "block" : "none";
      counter.textContent = `${_zoomIdx + 1} / ${imagens.length}`;
    }
  }

  // Liga as setas do zoom uma única vez
  if (!zoomModal.dataset.navReady) {
    const zp = document.getElementById("zoomPrev");
    const zn = document.getElementById("zoomNext");
    if (zp) zp.addEventListener("click", (e) => {
      e.stopPropagation();
      _zoomIdx--;
      _atualizarZoom();
    });
    if (zn) zn.addEventListener("click", (e) => {
      e.stopPropagation();
      _zoomIdx++;
      _atualizarZoom();
    });
    zoomModal.dataset.navReady = "1";
  }

  // Garante que product.images seja sempre um array (base64 em memória)
  function _getImagens() {
    if (!Array.isArray(product.images)) {
      product.images = [];
    }
    return product.images;
  }

  // Carrega as imagens do produto: resolve IDs do IndexedDB → base64.
  // Migra automaticamente base64 antigo (versões anteriores) para o IndexedDB.
  async function _carregarImagensProduto(p) {
    let idsOuBase64 = [];

    if (Array.isArray(p.images) && p.images.length > 0) {
      idsOuBase64 = p.images;
    } else if (p.image) {
      idsOuBase64 = [p.image];
    }

    const base64Final = [];
    const idsFinais = [];

    for (const item of idsOuBase64) {
      if (ImageStore.isImageId(item)) {
        // É um ID → busca o base64 no IndexedDB
        const data = await ImageStore.get(item);
        if (data) {
          base64Final.push(data);
          idsFinais.push(item);
        }
      } else if (ImageStore.isDataUrl(item)) {
        // É base64 antigo → migra para o IndexedDB agora
        try {
          const novoId = await ImageStore.putUnico(item);
          base64Final.push(item);
          idsFinais.push(novoId);
        } catch (err) {
          console.error("Falha ao migrar imagem antiga:", err);
        }
      }
    }

    product.images = base64Final;   // base64 para exibição
    product._imageIds = idsFinais;  // ids correspondentes (mesma ordem)
    product.image = base64Final[0] || "";

    if (typeof window._renderGaleriaProduto === "function") {
      window._renderGaleriaProduto();
    }

    // Se houve migração, marca para salvar os novos ids
    if (idsFinais.some((id, i) => idsOuBase64[i] !== id)) {
      _marcarAlterado();
    }
  }

  // Persiste as imagens no IndexedDB e retorna a lista de IDs.
  // Cada base64 que ainda não tem ID é gravado; imagens removidas
  // pelo usuário são apagadas do IndexedDB.
  async function _persistirImagens() {
    const base64Atual = Array.isArray(product.images) ? product.images : [];
    const idsAntigos = Array.isArray(product._imageIds) ? product._imageIds : [];
    const idsNovos = [];
    // Posições cuja imagem foi excluída do banco enquanto este produto
    // estava aberto (pelo "Gerenciar Imagens" da lista de produtos, em
    // outra aba). Ela sai deste produto também, como a exclusão prometeu —
    // sem isto, salvar aqui a traria de volta à lista.
    const excluidas = [];

    for (let i = 0; i < base64Atual.length; i++) {
      const b64 = base64Atual[i];
      const idExistente = idsAntigos[i];

      // Se o base64 nesta posição já corresponde a um id salvo, reaproveita.
      // (Reordenações mantêm o par base64↔id alinhado porque movemos os dois.)
      if (idExistente && ImageStore.isImageId(idExistente)) {
        let existe = true;
        try { existe = !!(await ImageStore.get(idExistente)); } catch (e) { existe = true; }
        if (!existe) { excluidas.push(i); continue; }
        idsNovos.push(idExistente);
      } else {
        // Leva o nome escolhido no modal, quando houver. É o que torna a
        // imagem encontrável depois na galeria "Usar imagem já anexada".
        const nome = _nomesImagens.get(b64) || "";
        // putUnico: se uma imagem IDÊNTICA já existir no banco, reaproveita
        // o registro dela em vez de criar outro. É o que impede a mesma
        // foto de ser guardada várias vezes — ao clonar um produto, ao
        // anexar o mesmo arquivo de novo, ou ao reaproveitar pela galeria.
        const novoId = await ImageStore.putUnico(b64, nome);
        _nomesImagens.delete(b64);
        idsNovos.push(novoId);
      }
    }

    // Remove do IndexedDB os ids que não estão mais em uso.
    //
    // ── POR QUE PRECISA CONFERIR OS OUTROS PRODUTOS ────────────────
    // Desde que existe o reaproveitamento pela galeria, uma imagem pode
    // pertencer a VÁRIOS produtos. Apagar só porque saiu deste apagaria
    // a foto dos outros também — perda silenciosa, descoberta semanas
    // depois. Agora só some do banco quando ninguém mais usa.
    const emUsoPorOutros = _idsEmUsoPorOutrosProdutos(product.id);
    for (const idAntigo of idsAntigos) {
      if (!idAntigo || idsNovos.includes(idAntigo)) continue;
      if (emUsoPorOutros.has(idAntigo)) continue; // outro produto ainda usa
      try { await ImageStore.remove(idAntigo); } catch (e) {}
    }

    if (excluidas.length) {
      // O carrossel acompanha: o base64 sai junto (os dois arrays alinhados)
      // e a 1ª imagem que sobrar vira a miniatura.
      product.images = base64Atual.filter(function (_, i) { return excluidas.indexOf(i) < 0; });
      product.image = product.images[0] || "";
      if (_imgAtual >= product.images.length) _imgAtual = Math.max(0, product.images.length - 1);
      try { _renderGaleria(); } catch (e) {}
    }

    product._imageIds = idsNovos;
    return idsNovos;
  }


  // Índice da imagem atualmente exibida no carrossel
  let _imgAtual = 0;

  // ── Renderiza o carrossel (uma imagem por vez) ──
  function _renderGaleria() {
    if (!galleryEl) return;
    const imagens = _getImagens();
    galleryEl.innerHTML = "";

    // Sem imagens → mostra só o slot "+" para adicionar
    if (imagens.length === 0) {
      const addSlot = document.createElement("div");
      addSlot.className = "gallery-slot gallery-slot-add";
      addSlot.title = "Adicionar imagem";
      addSlot.innerHTML = `
        <span class="gallery-add-icon">+</span>
        <span class="gallery-add-text">Adicionar</span>
      `;
      addSlot.addEventListener("click", _abrirModalUpload);
      galleryEl.appendChild(addSlot);
      return;
    }

    // Garante que o índice atual é válido
    if (_imgAtual >= imagens.length) _imgAtual = imagens.length - 1;
    if (_imgAtual < 0) _imgAtual = 0;

    const src = imagens[_imgAtual] || "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
    const podeAdicionar = imagens.length < MAX_IMAGENS;
    const temVarias = imagens.length > 1;

    const carrossel = document.createElement("div");
    carrossel.className = "gallery-carousel";
    carrossel.innerHTML = `
      <img src="${src}" alt="Imagem ${_imgAtual + 1}" class="gallery-img" />

      ${podeAdicionar ? `
        <button type="button" class="carousel-btn carousel-add" title="Adicionar imagem">+</button>
      ` : ""}

      <button type="button" class="carousel-btn carousel-remove" title="Remover imagem">✕</button>

      ${temVarias ? `
        <button type="button" class="carousel-btn carousel-prev" title="Anterior">‹</button>
        <button type="button" class="carousel-btn carousel-next" title="Próxima">›</button>

        <button type="button" class="carousel-btn carousel-move" title="Reordenar imagens">
          <svg viewBox="0 0 512 512" width="15" height="15" fill="currentColor" aria-hidden="true">
            <path d="M256 0l-72 72h48v112H120v-48L48 208l72 72v-48h112v112h-48l72 72 72-72h-48V232h112v48l72-72-72-72v48H280V72h48z"/>
          </svg>
        </button>

        <div class="carousel-dots">
          ${imagens.map((_, i) => `<span class="carousel-dot ${i === _imgAtual ? "active" : ""}"></span>`).join("")}
        </div>
      ` : ""}

      <div class="carousel-counter">${_imgAtual + 1}/${imagens.length}</div>
    `;

    galleryEl.appendChild(carrossel);

    // Botão de reordenar → abre o modal de ordenação
    const btnMove = carrossel.querySelector(".carousel-move");
    if (btnMove) {
      btnMove.addEventListener("click", (e) => {
        e.stopPropagation();
        _abrirModalOrdenar();
      });
    }

    // Zoom ao clicar na imagem
    carrossel.querySelector(".gallery-img").addEventListener("click", () => {
      _abrirZoom(_imgAtual);
    });

    // Botão + (adicionar)
    const btnAdd = carrossel.querySelector(".carousel-add");
    if (btnAdd) btnAdd.addEventListener("click", (e) => {
      e.stopPropagation();
      _abrirModalUpload();
    });

    // Botão X (remover a imagem atual)
    carrossel.querySelector(".carousel-remove").addEventListener("click", (e) => {
      e.stopPropagation();
      product.images.splice(_imgAtual, 1);
      // Mantém os ids alinhados com os base64
      if (Array.isArray(product._imageIds)) {
        product._imageIds.splice(_imgAtual, 1);
      }
      product.image = product.images[0] || "";
      if (_imgAtual >= product.images.length) _imgAtual = product.images.length - 1;
      _renderGaleria();
      _marcarAlterado();
    });

    // Setas < e >
    const btnPrev = carrossel.querySelector(".carousel-prev");
    const btnNext = carrossel.querySelector(".carousel-next");
    if (btnPrev) btnPrev.addEventListener("click", (e) => {
      e.stopPropagation();
      _imgAtual = (_imgAtual - 1 + imagens.length) % imagens.length;
      _renderGaleria();
    });
    if (btnNext) btnNext.addEventListener("click", (e) => {
      e.stopPropagation();
      _imgAtual = (_imgAtual + 1) % imagens.length;
      _renderGaleria();
    });
  }

  // ── Modal para reordenar as imagens ──
  function _abrirModalOrdenar() {
    const imagens = _getImagens();
    if (imagens.length < 2) return;

    const existing = document.getElementById("modalOrdenarImg");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalOrdenarImg";

    // Cópia de trabalho por ÍNDICE — assim reordenamos base64 E ids juntos
    let ordemIdx = imagens.map((_, i) => i);
    let dragFrom = null;

    function _renderLista() {
      const lista = overlay.querySelector("#ordenarLista");
      if (!lista) return;
      lista.innerHTML = "";

      ordemIdx.forEach((origIdx, idx) => {
      const src = imagens[origIdx] || "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
      const item = document.createElement("div");
        item.className = "ordenar-item";
        item.setAttribute("draggable", "true");
        item.dataset.idx = String(idx);
        item.innerHTML = `
          <span class="ordenar-drag" title="Arraste para reordenar" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="17" x2="20" y2="17"></line></svg>
          </span>
          <span class="ordenar-pos">${idx + 1}º</span>
          <img src="${src}" class="ordenar-thumb" alt="Imagem ${idx + 1}" draggable="false" />
          <span class="ordenar-nome">Imagem ${idx + 1}${idx === 0 ? " (principal)" : ""}</span>
        `;

        item.addEventListener("dragstart", (e) => {
          dragFrom = idx;
          item.classList.add("dragging");
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            try { e.dataTransfer.setData("text/plain", String(idx)); } catch (_) {}
          }
        });
        item.addEventListener("dragend", () => {
          dragFrom = null;
          lista.querySelectorAll(".ordenar-item").forEach((el) => {
            el.classList.remove("dragging");
            el.classList.remove("drag-over");
          });
        });
        item.addEventListener("dragover", (e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
          if (dragFrom !== null && dragFrom !== idx) item.classList.add("drag-over");
        });
        item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
        item.addEventListener("drop", (e) => {
          e.preventDefault();
          item.classList.remove("drag-over");
          const to = idx;
          if (dragFrom === null || dragFrom === to) return;
          const [movido] = ordemIdx.splice(dragFrom, 1);
          ordemIdx.splice(to, 0, movido);
          dragFrom = null;
          _renderLista();
        });

        lista.appendChild(item);
      });
    }

    overlay.innerHTML = `
      <div class="modal" style="width:460px; max-width:94vw;">
        <div class="modal-title">Ordenar Imagens</div>
        <div class="modal-subtitle" style="margin-bottom:16px;">
          Arraste pela alça <strong>☰</strong> para reordenar. A <strong>1ª imagem</strong> é a principal
          (aparece na lista de produtos).
        </div>
        <div id="ordenarLista" class="ordenar-lista"></div>
        <div class="modal-actions" style="margin-top:18px;">
          <button class="btn-secondary" id="ordenarCancelar">Cancelar</button>
          <button class="btn-primary" id="ordenarSalvar">✓ Aplicar ordem</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    _renderLista();

    overlay.querySelector("#ordenarCancelar").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    overlay.querySelector("#ordenarSalvar").addEventListener("click", () => {
      const novasImagens = ordemIdx.map((i) => imagens[i]);
      const idsAntigos = Array.isArray(product._imageIds) ? product._imageIds : [];
      product.images = novasImagens;
      if (idsAntigos.length) {
        product._imageIds = ordemIdx.map((i) => idsAntigos[i]);
      }
      product.image = novasImagens[0] || ""; // 1ª = principal
      _imgAtual = 0;
      overlay.remove();
      _renderGaleria();
      _marcarAlterado();
      showToast("Ordem das imagens atualizada.", "success");
    });
  }

  // ── Modal com as duas opções de formatação ──
  let _modoUploadImg = "formatar";

  function _abrirModalUpload() {
    if (_getImagens().length >= MAX_IMAGENS) {
      showToast(`Limite de ${MAX_IMAGENS} imagens por produto.`, "warning");
      return;
    }

    const existing = document.getElementById("modalUploadImg");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalUploadImg";
    overlay.innerHTML = `
      <div class="modal" style="width:440px; max-width:94vw;">
        <div class="modal-title">Adicionar Imagem</div>
        <div class="modal-subtitle" style="margin-bottom:16px;">
          Escolha como deseja anexar a imagem. Formatar reduz o tamanho
          (máx. 500×500, JPEG) — ideal para deixar o arquivo leve.
        </div>

        <p class="img-upload-hint" style="margin-bottom:16px;">
          <strong>Sugestões:</strong> dê preferência a imagens com proporção
          quadrada e tamanho leve. Cada produto aceita até <strong>3 imagens</strong>.
          Ao formatar, o sistema ajusta automaticamente, mas podem ocorrer
          recortes ou resultados inesperados.
        </p>

        <div style="display:flex; flex-direction:column; gap:10px;">
          <button type="button" class="btn-secondary" id="optReusar"
            style="justify-content:flex-start; text-align:left; padding:14px 16px; height:auto;">
            <span style="margin-right:10px; display:inline-flex;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline><path d="M14 3h7v7"></path></svg></span>
            <span style="display:flex; flex-direction:column; line-height:1.3;">
              <strong>Usar imagem já anexada</strong>
              <span style="font-size:12px; color:var(--clr-text-3);">Escolhe entre as imagens já salvas no Bapell</span>
            </span>
          </button>

          <button type="button" class="btn-secondary" id="optFormatar"
            style="justify-content:flex-start; text-align:left; padding:14px 16px; height:auto;">
            <span style="margin-right:10px; display:inline-flex;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></span>
            <span style="display:flex; flex-direction:column; line-height:1.3;">
              <strong>Anexar e formatar</strong>
              <span style="font-size:12px; color:var(--clr-text-3);">Redimensiona e comprime (recomendado)</span>
            </span>
          </button>

          <button type="button" class="btn-secondary" id="optOriginal"
            style="justify-content:flex-start; text-align:left; padding:14px 16px; height:auto;">
            <span style="margin-right:10px; display:inline-flex;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></span>
            <span style="display:flex; flex-direction:column; line-height:1.3;">
              <strong>Anexar sem formatar</strong>
              <span style="font-size:12px; color:var(--clr-text-3);">Mantém o arquivo original exato</span>
            </span>
          </button>
        </div>

        <div class="modal-actions" style="margin-top:18px;">
          <button class="btn-secondary" id="optCancelar">Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#optReusar").addEventListener("click", () => {
      overlay.remove();
      _abrirGaleriaImagens();
    });
    overlay.querySelector("#optFormatar").addEventListener("click", () => {
      _modoUploadImg = "formatar";
      overlay.remove();
      imgInput.value = "";
      imgInput.click();
    });
    overlay.querySelector("#optOriginal").addEventListener("click", () => {
      _modoUploadImg = "original";
      overlay.remove();
      imgInput.value = "";
      imgInput.click();
    });
    overlay.querySelector("#optCancelar").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // Redimensiona (máx 500x500 mantendo proporção) e comprime para JPEG 0.75
  function _formatarImagemCanvas(file, callback) {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 500;
        let { width, height } = img;
        if (width > height && width > MAX) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else if (height >= width && height > MAX) {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        callback(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = () => showToast("Não foi possível processar a imagem.", "error");
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Lê o arquivo original exato, sem alterar resolução/formato
  function _lerImagemOriginal(file, callback) {
    const reader = new FileReader();
    reader.onload = (evt) => callback(evt.target.result);
    reader.readAsDataURL(file);
  }

  // Ao selecionar um arquivo, adiciona à galeria conforme o modo escolhido
  // ── Nome das imagens escolhido pelo usuário ──────────────────────
  // O nome é definido no momento em que a imagem é anexada, mas só vai para
  // o IndexedDB quando o produto é salvo. Este mapa liga o base64 ao nome
  // durante esse intervalo.
  //
  // Chave é o próprio base64: é o que o produto carrega até virar id, e é
  // estável entre anexar e salvar.
  const _nomesImagens = new Map();

  /**
   * Limpa o nome do arquivo.
   * Reaproveita a mesma regra do resto do app: remove o que o sistema de
   * arquivos não aceita e evita nomes que quebram caminho.
   */
  function _sanitizarNomeImagem(nome) {
    var n = String(nome || "").trim();
    // Barras, dois-pontos e afins quebram caminho no Windows e no Linux.
    n = n.replace(/[\\/\\\\:*?"<>|]/g, "-");
    // Caracteres de controle não aparecem, mas corrompem o nome.
    n = n.replace(/[\x00-\x1f\x7f]/g, "");
    // Espaços repetidos e pontos no fim atrapalham no Windows.
    n = n.replace(/\s+/g, " ").replace(/\.+$/, "").trim();
    // Nomes reservados do Windows (CON, PRN, AUX, NUL, COM1..9, LPT1..9).
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(n)) n = "_" + n;
    if (n.length > 120) n = n.slice(0, 120);
    return n;
  }

  /** Extensão do arquivo, em minúsculas, com o ponto. Ex.: ".jpg" */
  function _extensaoDe(file) {
    var nome = (file && file.name) || "";
    var m = nome.match(/(\.[A-Za-z0-9]{1,8})$/);
    if (m) return m[1].toLowerCase();
    // Sem extensão no nome: deduz pelo tipo informado pelo navegador.
    var t = (file && file.type) || "";
    if (t.indexOf("png") >= 0) return ".png";
    if (t.indexOf("webp") >= 0) return ".webp";
    if (t.indexOf("gif") >= 0) return ".gif";
    return ".jpg";
  }

  /**
   * Modal que pergunta o nome ANTES de processar a imagem.
   *
   * Existe porque o nome é o que torna a imagem encontrável depois, na
   * galeria "Usar imagem já anexada". Um "IMG_20260910_123456.jpg" não diz
   * nada; o SKU do produto, sim.
   *
   * NADA é processado até a confirmação: quem cancela não anexa imagem
   * nenhuma, e o arquivo escolhido é descartado.
   */
  function _perguntarNomeImagem(file, aoConfirmar) {
    const ext = _extensaoDe(file);
    const sku = (document.getElementById("productSku") || {}).value || product.sku || "";
    const sugerido = _sanitizarNomeImagem(sku ? sku + ext : (file.name || "imagem" + ext));

    const existing = document.getElementById("modalNomeImg");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    // Usa .modal-overlay e .modal do app: o tema (claro, padrão, escuro)
    // vem junto sem nenhuma cor fixa aqui.
    overlay.className = "modal-overlay";
    overlay.id = "modalNomeImg";
    overlay.innerHTML =
      '<div class="modal" style="width:460px; max-width:94vw;">' +
        '<div class="modal-title">Nome da imagem</div>' +
        '<div class="modal-subtitle" style="margin-bottom:16px;">' +
          "Use o SKU do produto como nome para encontrá-la com facilidade " +
          "depois, ao reaproveitar a imagem em outro produto." +
        "</div>" +
        '<div class="field-group" style="margin-bottom:12px;">' +
          "<label>Nome atual do arquivo</label>" +
          '<div class="img-nome-atual" id="nomeImgAtual"></div>' +
        "</div>" +
        '<div class="field-group" style="margin-bottom:6px;">' +
          '<label for="nomeImgNovo">Novo nome</label>' +
          '<input type="text" id="nomeImgNovo" class="input-field" autocomplete="off" />' +
          '<small class="img-nome-dica" id="nomeImgDica"></small>' +
        "</div>" +
        '<div class="modal-actions" style="margin-top:18px;">' +
          '<button class="btn-secondary" id="nomeImgCancelar">Cancelar</button>' +
          '<button class="btn-primary" id="nomeImgOk" style="padding:10px 20px;">Continuar</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(overlay);

    // textContent, e não innerHTML: um arquivo chamado <img onerror=...>
    // executaria script se fosse interpolado no HTML.
    overlay.querySelector("#nomeImgAtual").textContent = file.name || "(sem nome)";

    const campo = overlay.querySelector("#nomeImgNovo");
    const dica = overlay.querySelector("#nomeImgDica");
    campo.value = sugerido;
    dica.textContent = sku
      ? "Sugerido a partir do SKU " + sku
      : "Este produto ainda não tem SKU — o nome original foi mantido.";

    function fechar() { overlay.remove(); }

    function confirmar() {
      let nome = _sanitizarNomeImagem(campo.value);
      if (!nome) {
        showToast("Informe um nome para a imagem.", "warning");
        _marcarErro(campo, () => !!_sanitizarNomeImagem(campo.value));
        return;
      }
      // Garante a extensão: sem ela o arquivo perde o tipo ao ser exportado.
      if (!/\.[A-Za-z0-9]{1,8}$/.test(nome)) nome += ext;
      fechar();
      aoConfirmar(nome);
    }

    overlay.querySelector("#nomeImgOk").addEventListener("click", confirmar);
    overlay.querySelector("#nomeImgCancelar").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
    campo.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); confirmar(); }
      if (e.key === "Escape") { e.preventDefault(); fechar(); }
    });

    setTimeout(() => {
      campo.focus();
      // Seleciona só o nome, deixando a extensão de fora: quem quiser
      // trocar o nome digita direto, sem apagar o ".jpg" sem querer.
      const ponto = campo.value.lastIndexOf(".");
      try { campo.setSelectionRange(0, ponto > 0 ? ponto : campo.value.length); } catch (e) {}
    }, 60);
  }

  imgInput.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const imagens = _getImagens();
    if (imagens.length >= MAX_IMAGENS) {
      showToast(`Limite de ${MAX_IMAGENS} imagens por produto.`, "warning");
      return;
    }

    const aplicar = (dataUrl, nome) => {
      imagens.push(dataUrl);
      if (nome) _nomesImagens.set(dataUrl, nome);
      product.image = imagens[0] || ""; // 1ª imagem como principal (compat.)
      _imgAtual = imagens.length - 1;    // mostra a recém-adicionada
      _renderGaleria();
      _marcarAlterado();
    };

    // O nome vem PRIMEIRO. Nenhum byte da imagem é lido ou convertido antes
    // da confirmação — cancelar aqui não anexa nada.
    _perguntarNomeImagem(file, function (nome) {
      if (_modoUploadImg === "original") {
        _lerImagemOriginal(file, (d) => {
          aplicar(d, nome);
          showToast("Imagem anexada sem formatação.", "success");
        });
      } else {
        _formatarImagemCanvas(file, (d) => {
          aplicar(d, nome);
          showToast("Imagem formatada e anexada.", "success");
        });
      }
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  GALERIA — USAR IMAGEM JÁ ANEXADA
  //
  //  Mostra as imagens JÁ salvas no IndexedDB, de todos os produtos e de
  //  todas as plataformas, e permite reaproveitar uma delas.
  //
  //  ── REAPROVEITA A REFERÊNCIA, NÃO COPIA ─────────────────────────
  //  Ao escolher, o mesmo id existente entra na lista do produto. Duas
  //  coisas dependem disso: o banco não incha com cópias idênticas, e o
  //  _persistirImagens reconhece o id e NÃO regrava — é a regra que ele
  //  já usava para imagens que não mudaram.
  // ══════════════════════════════════════════════════════════════

  /**
   * Descobre a que produto cada imagem pertence, varrendo todas as
   * plataformas. Serve para identificar as imagens ANTIGAS, salvas antes de
   * existir o campo `nome` — sem isso elas apareceriam como um quadrado sem
   * nenhuma pista do que são.
   */
  /**
   * Ids de imagem usados por produtos DIFERENTES do informado, em todas
   * as plataformas. É o que protege a foto compartilhada na hora de
   * remover a imagem de um produto.
   */
  function _idsEmUsoPorOutrosProdutos(idDoProdutoAtual) {
    const usados = new Set();
    if (typeof getAllPlatformIds !== "function" || typeof getProducts !== "function") {
      return usados;
    }
    let plataformas = [];
    try { plataformas = getAllPlatformIds() || []; } catch (e) { return usados; }

    plataformas.forEach(function (pid) {
      let lista = [];
      try { lista = getProducts(pid) || []; } catch (e) { return; }
      lista.forEach(function (pr) {
        if (!pr || pr.id === idDoProdutoAtual) return;
        const ids = Array.isArray(pr._imageIds) ? pr._imageIds
          : (Array.isArray(pr.images) ? pr.images : []);
        ids.forEach(function (imgId) {
          if (imgId && ImageStore.isImageId(imgId)) usados.add(imgId);
        });
      });
    });
    return usados;
  }

  function _donosDasImagens() {
    const mapa = Object.create(null);
    if (typeof getAllPlatformIds !== "function" || typeof getProducts !== "function") {
      return mapa;
    }
    let ids = [];
    try { ids = getAllPlatformIds() || []; } catch (e) { ids = []; }
    ids.forEach(function (pid) {
      let lista = [];
      try { lista = getProducts(pid) || []; } catch (e) { return; }
      lista.forEach(function (pr) {
        if (!pr || !Array.isArray(pr._imageIds)) return;
        pr._imageIds.forEach(function (imgId) {
          if (!imgId || mapa[imgId]) return;
          mapa[imgId] = {
            produto: pr.name || "",
            sku: pr.sku || "",
          };
        });
      });
    });
    return mapa;
  }

  function _escImg(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  async function _abrirGaleriaImagens() {
    if (_getImagens().length >= MAX_IMAGENS) {
      showToast(`Limite de ${MAX_IMAGENS} imagens por produto.`, "warning");
      return;
    }

    const existing = document.getElementById("modalGaleriaImg");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    // Classes do app: o tema vem junto, sem nenhuma cor fixa aqui.
    overlay.className = "modal-overlay";
    overlay.id = "modalGaleriaImg";
    overlay.innerHTML =
      '<div class="modal galeria-img-modal">' +
        '<div class="modal-title">Usar imagem já anexada</div>' +
        '<div class="modal-subtitle" style="margin-bottom:14px;">' +
          "Escolha uma imagem já salva no Bapell. Ela será reaproveitada, " +
          "sem criar uma segunda cópia." +
        "</div>" +
        '<input type="text" id="galeriaBusca" class="input-field" ' +
          'placeholder="Buscar por nome do arquivo, produto ou SKU…" autocomplete="off" ' +
          'style="margin-bottom:14px;" />' +
        '<div class="galeria-img-grid" id="galeriaGrid">' +
          '<p class="galeria-img-vazio">Carregando imagens…</p>' +
        "</div>" +
        '<div class="modal-actions" style="margin-top:16px;">' +
          '<button class="btn-secondary" id="galeriaCancelar">Cancelar</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(overlay);

    const grid = overlay.querySelector("#galeriaGrid");
    const busca = overlay.querySelector("#galeriaBusca");
    const fechar = () => overlay.remove();

    overlay.querySelector("#galeriaCancelar").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape" && document.getElementById("modalGaleriaImg")) {
        fechar();
        document.removeEventListener("keydown", esc);
      }
    });

    let todas = [];
    try {
      todas = (await ImageStore.listar()) || [];
    } catch (err) {
      console.error("[Galeria] falha ao listar imagens:", err);
      grid.innerHTML = '<p class="galeria-img-vazio">Não foi possível carregar as imagens.</p>';
      return;
    }

    const donos = _donosDasImagens();
    // Ids já usados NESTE produto: escolher a mesma imagem duas vezes
    // deixaria o carrossel com duas cópias iguais.
    const jaUsados = Array.isArray(product._imageIds) ? product._imageIds : [];

    const itens = todas
      .filter((im) => jaUsados.indexOf(im.id) < 0)
      .map((im) => {
        const dono = donos[im.id] || {};
        return {
          id: im.id,
          data: im.data,
          nome: im.nome || "",
          produto: dono.produto || "",
          sku: dono.sku || "",
          // Tudo que pode ser pesquisado, junto e em minúsculas.
          busca: [im.nome, dono.produto, dono.sku].join(" ").toLowerCase(),
        };
      });

    if (!itens.length) {
      grid.innerHTML = '<p class="galeria-img-vazio">Nenhuma imagem salva ainda. ' +
        "Anexe uma imagem em algum produto para poder reaproveitá-la aqui.</p>";
      return;
    }

    function render(q) {
      const termo = String(q || "").trim().toLowerCase();
      const lista = termo ? itens.filter((i) => i.busca.indexOf(termo) >= 0) : itens;

      if (!lista.length) {
        grid.innerHTML = '<p class="galeria-img-vazio">Nenhuma imagem encontrada para “' +
          _escImg(q) + '”.</p>';
        return;
      }

      grid.innerHTML = lista.map(function (i) {
        // O rótulo prioriza o nome do arquivo; sem ele, identifica pelo
        // produto — é o que existe para as imagens antigas.
        const titulo = i.nome || i.produto || "Imagem sem nome";
        const sub = i.nome && i.produto ? i.produto : (i.sku || "");
        // O card deixou de ser um <button>: agora ele CONTÉM botões
        // (ampliar e excluir), e botão dentro de botão é HTML inválido —
        // o navegador desfaz o aninhamento e os cliques se perdem.
        return '<div class="galeria-img-card" data-id="' + _escImg(i.id) + '" ' +
            'role="button" tabindex="0" ' +
            'title="' + _escImg(titulo + (sub ? " · " + sub : "")) + '">' +
            '<span class="galeria-img-thumb">' +
              '<img src="' + _escImg(i.data) + '" alt="" loading="lazy" ' +
                "onerror=\"this.style.display='none'\" />" +
              '<span class="galeria-img-acoes">' +
                '<button type="button" class="galeria-img-acao" data-ampliar="' + _escImg(i.id) + '" ' +
                  'title="Ampliar" aria-label="Ampliar imagem">' +
                  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>' +
                "</button>" +
                '<button type="button" class="galeria-img-acao galeria-img-acao--del" data-excluir="' + _escImg(i.id) + '" ' +
                  'title="Excluir do Bapell" aria-label="Excluir imagem">' +
                  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>' +
                "</button>" +
              "</span>" +
            "</span>" +
            '<span class="galeria-img-nome">' + _escImg(titulo) + "</span>" +
            (sub ? '<span class="galeria-img-sub">' + _escImg(sub) + "</span>" : "") +
          "</div>";
      }).join("");

      grid.querySelectorAll(".galeria-img-card").forEach(function (b) {
        const usar = function () { _usarImagemExistente(b.dataset.id, itens, fechar); };
        b.addEventListener("click", function (e) {
          // Um clique nos botões de ação não deve escolher a imagem.
          if (e.target.closest(".galeria-img-acao")) return;
          usar();
        });
        b.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); usar(); }
        });
      });

      grid.querySelectorAll("[data-ampliar]").forEach(function (b) {
        b.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          const item = itens.find(function (i) { return i.id === b.dataset.ampliar; });
          if (item) _ampliarImagemGaleria(item);
        });
      });

      grid.querySelectorAll("[data-excluir]").forEach(function (b) {
        b.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          const item = itens.find(function (i) { return i.id === b.dataset.excluir; });
          if (item) _excluirImagemDoBanco(item, itens, render, busca);
        });
      });
    }

    render("");
    let t;
    busca.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(() => render(busca.value), 120);
    });
    setTimeout(() => busca.focus(), 60);
  }

  /** Abre a imagem da galeria em tamanho grande. */
  function _ampliarImagemGaleria(item) {
    const fundo = document.createElement("div");
    fundo.className = "galeria-zoom";
    fundo.innerHTML =
      '<div class="galeria-zoom__caixa">' +
        '<img src="' + _escImg(item.data) + '" alt="' + _escImg(item.nome || "") + '" />' +
        '<div class="galeria-zoom__nome">' + _escImg(item.nome || item.produto || "Imagem sem nome") + "</div>" +
      "</div>" +
      '<button type="button" class="galeria-zoom__x" aria-label="Fechar">&times;</button>';
    document.body.appendChild(fundo);

    const fechar = function () {
      fundo.remove();
      document.removeEventListener("keydown", aoTeclar, true);
    };
    function aoTeclar(e) {
      // Só o Esc fecha; o resto das teclas segue para a galeria atrás.
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(); }
    }
    document.addEventListener("keydown", aoTeclar, true);
    fundo.addEventListener("click", function (e) {
      // Clicar fora da imagem fecha — aqui é só visualização, não há
      // nada a confirmar nem a perder.
      if (!e.target.closest(".galeria-zoom__caixa")) fechar();
    });
  }

  /**
   * Exclui a imagem do banco, de vez.
   *
   * ── O CUIDADO QUE ISSO EXIGE ──────────────────────────────────────
   * Desde o reaproveitamento, uma imagem pode estar em VÁRIOS produtos.
   * Excluir sem avisar tiraria a foto de todos eles, e o dono só
   * descobriria ao abrir outro produto dias depois.
   *
   * Por isso a confirmação diz EM QUAIS produtos ela está, pelo nome.
   *
   * ── E DEPOIS DE EXCLUIR ───────────────────────────────────────────
   * A confirmação promete que esses produtos "ficam sem esta imagem".
   * Para isso ser verdade, a referência sai de cada um deles (inclusive
   * do produto aberto na tela) — senão continuariam apontando para uma
   * imagem que não existe mais, e a miniatura da lista seguiria
   * mostrando a foto apagada.
   *
   * @returns {Promise<boolean>} true se a imagem foi excluída
   */
  async function _excluirImagemDoBanco(item, itens, render, busca) {
    const usos = _produtosQueUsam(item.id);

    // Modal próprio no lugar do window.confirm: o alerta do sistema não
    // mostra a imagem, não segue o tema do app e, dentro do Electron,
    // aparece com o título da janela em vez de uma pergunta clara.
    const confirmado = await _confirmarExclusaoImagem(item, usos);
    if (!confirmado) return false;

    try {
      await ImageStore.remove(item.id);
    } catch (e) {
      console.error("[Galeria] falha ao excluir:", e);
      showToast("Não foi possível excluir a imagem.", "error");
      return false;
    }

    // A imagem já saiu do banco. Tirar a referência dos produtos não pode
    // transformar a exclusão em erro: no pior caso, o produto se ajusta
    // sozinho na próxima vez que for aberto (o carregamento ignora ids
    // que não existem mais).
    try {
      await _tirarImagemDosProdutos(item.id, item.data);
    } catch (e) {
      console.error("[Galeria] falha ao atualizar os produtos da imagem excluída:", e);
    }

    // Tira da lista em memória para o grid refletir na hora, sem
    // reabrir a galeria.
    const i = itens.findIndex(function (x) { return x.id === item.id; });
    if (i >= 0) itens.splice(i, 1);
    render(busca ? busca.value : "");
    showToast("Imagem excluída.", "success");
    return true;
  }

  /**
   * Remove a referência de uma imagem excluída de todos os produtos.
   *
   *  · Produto aberto na tela: sai do carrossel (base64 e id juntos, para
   *    os dois arrays continuarem alinhados) e a tela fica marcada como
   *    alterada — o próximo salvamento já grava sem ela.
   *  · Produtos salvos, em todas as plataformas: o id sai de `images` e
   *    `_imageIds`; se ela era a miniatura da lista (`image`), a próxima
   *    imagem do produto assume o lugar.
   */
  async function _tirarImagemDosProdutos(imgId, dataRemovida) {
    if (!imgId) return;

    // 1) O produto aberto, no estado em que está na tela.
    const idsAbertos = Array.isArray(product._imageIds) ? product._imageIds : [];
    const posAberta = idsAbertos.indexOf(imgId);
    if (posAberta >= 0) {
      const imagens = _getImagens();
      idsAbertos.splice(posAberta, 1);
      if (posAberta < imagens.length) imagens.splice(posAberta, 1);
      product.image = imagens[0] || "";
      if (_imgAtual >= imagens.length) _imgAtual = Math.max(0, imagens.length - 1);
      _renderGaleria();
      _marcarAlterado();
    }

    // 2) Os produtos salvos.
    if (typeof getAllPlatformIds !== "function" || typeof getProducts !== "function" ||
        typeof saveProducts !== "function") {
      return;
    }
    let plataformas = [];
    try { plataformas = getAllPlatformIds() || []; } catch (e) { return; }

    for (const pid of plataformas) {
      let lista = [];
      try { lista = getProducts(pid) || []; } catch (e) { continue; }
      let mudou = false;

      for (const pr of lista) {
        if (!pr) continue;
        const noIds = Array.isArray(pr._imageIds) && pr._imageIds.indexOf(imgId) >= 0;
        const noImages = Array.isArray(pr.images) && pr.images.indexOf(imgId) >= 0;
        if (!noIds && !noImages) continue;

        if (Array.isArray(pr._imageIds)) pr._imageIds = pr._imageIds.filter(function (x) { return x !== imgId; });
        if (Array.isArray(pr.images)) pr.images = pr.images.filter(function (x) { return x !== imgId; });

        // A miniatura da lista é uma cópia do base64 da 1ª imagem.
        if (dataRemovida && pr.image === dataRemovida) {
          const restantes = Array.isArray(pr._imageIds) ? pr._imageIds : (pr.images || []);
          const proxima = restantes.find(function (x) { return ImageStore.isImageId(x); });
          let base64 = "";
          if (proxima) {
            try { base64 = (await ImageStore.get(proxima)) || ""; } catch (e) { base64 = ""; }
          }
          pr.image = base64;
        }
        mudou = true;
      }

      if (mudou) {
        try { await saveProducts(pid, lista); }
        catch (e) { console.error("[Galeria] falha ao atualizar os produtos de", pid, e); }
      }
    }
  }

  /**
   * Pergunta antes de excluir uma imagem do banco. Devolve uma Promise
   * que resolve `true` só se a pessoa confirmar.
   *
   * ── DECISÕES ──────────────────────────────────────────────────────
   *  · Mostra a MINIATURA: com várias imagens parecidas, o nome sozinho
   *    não garante que é a certa.
   *  · Lista os produtos que usam a imagem: excluir tira a foto de todos
   *    eles, e isso precisa estar à vista antes do clique.
   *  · O foco começa em "Cancelar", não em "Excluir": é uma ação sem
   *    volta, e um Enter distraído não pode apagar nada.
   *  · Esc e clique fora CANCELAM, sem fechar a galeria que está atrás.
   */
  function _confirmarExclusaoImagem(item, usos) {
    return new Promise(function (resolve) {
      const nome = item.nome || item.produto || "Imagem sem nome";
      const lista = usos.slice(0, 6).map(function (n) {
        return "<li>" + _escImg(n) + "</li>";
      }).join("") + (usos.length > 6
        ? '<li class="exc-img__mais">… e mais ' + (usos.length - 6) + "</li>" : "");

      const fundo = document.createElement("div");
      fundo.className = "modal-overlay exc-img";
      fundo.setAttribute("role", "dialog");
      fundo.setAttribute("aria-modal", "true");
      fundo.setAttribute("aria-labelledby", "excImgTitulo");
      fundo.innerHTML =
        '<div class="modal exc-img__modal">' +
          '<div class="exc-img__topo">' +
            '<div class="exc-img__icone" aria-hidden="true">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>' +
            "</div>" +
            '<h3 id="excImgTitulo">Excluir imagem</h3>' +
          "</div>" +
          '<div class="exc-img__alvo">' +
            '<img src="' + _escImg(item.data) + '" alt="" />' +
            '<span class="exc-img__nome">' + _escImg(nome) + "</span>" +
          "</div>" +
          (usos.length
            ? '<div class="exc-img__aviso">' +
                "<strong>Esta imagem está em " +
                  (usos.length === 1 ? "1 produto" : usos.length + " produtos") + ":</strong>" +
                "<ul>" + lista + "</ul>" +
                "<p>Ao excluir, " + (usos.length === 1 ? "esse produto fica" : "esses produtos ficam") +
                  " sem esta imagem.</p>" +
              "</div>"
            : '<p class="exc-img__livre">Nenhum produto está usando esta imagem.</p>') +
          '<p class="exc-img__final">Esta ação não pode ser desfeita.</p>' +
          '<div class="exc-img__botoes">' +
            '<button type="button" class="btn-secondary" data-acao="cancelar">Cancelar</button>' +
            '<button type="button" class="btn-danger exc-img__excluir" data-acao="excluir">Excluir imagem</button>' +
          "</div>" +
        "</div>";
      document.body.appendChild(fundo);

      let respondido = false;
      function responder(valor) {
        if (respondido) return;
        respondido = true;
        document.removeEventListener("keydown", aoTeclar, true);
        fundo.remove();
        resolve(valor);
      }
      function aoTeclar(e) {
        // Captura: o Esc responde AQUI e não chega à galeria de trás,
        // que fecharia junto se o evento seguisse adiante.
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          responder(false);
        }
      }
      document.addEventListener("keydown", aoTeclar, true);

      fundo.addEventListener("mousedown", function (e) {
        if (e.target === fundo) responder(false);
      });
      fundo.querySelector('[data-acao="cancelar"]').addEventListener("click", function () {
        responder(false);
      });
      fundo.querySelector('[data-acao="excluir"]').addEventListener("click", function () {
        responder(true);
      });

      setTimeout(function () {
        const c = fundo.querySelector('[data-acao="cancelar"]');
        if (c) try { c.focus(); } catch (e) {}
      }, 30);
    });
  }

  /** Nomes dos produtos que usam a imagem, em todas as plataformas. */
  function _produtosQueUsam(imgId) {
    const nomes = [];
    if (typeof getAllPlatformIds !== "function" || typeof getProducts !== "function") {
      return nomes;
    }
    let plataformas = [];
    try { plataformas = getAllPlatformIds() || []; } catch (e) { return nomes; }

    // O produto aberto conta pelo que está NA TELA: uma imagem recém-
    // escolhida pela galeria ainda não está no produto salvo, e uma
    // removida do carrossel ainda está.
    const abertoUsa = Array.isArray(product._imageIds) && product._imageIds.indexOf(imgId) >= 0;

    plataformas.forEach(function (pid) {
      let lista = [];
      try { lista = getProducts(pid) || []; } catch (e) { return; }
      lista.forEach(function (pr) {
        if (!pr) return;
        if (pid === platformId && pr.id === product.id) return; // entra abaixo
        const ids = Array.isArray(pr._imageIds) ? pr._imageIds
          : (Array.isArray(pr.images) ? pr.images : []);
        if (ids.indexOf(imgId) >= 0) {
          nomes.push((pr.name || pr.sku || "produto sem nome"));
        }
      });
    });

    if (abertoUsa) {
      const nomeTela = ((document.getElementById("productName") || {}).value || "").trim();
      nomes.unshift((nomeTela || product.name || product.sku || "Este produto") + " (aberto agora)");
    }
    return nomes;
  }

  /**
   * Usa uma imagem existente no produto atual.
   * O id é acrescentado a _imageIds na MESMA posição do base64 em images —
   * o _persistirImagens percorre os dois arrays em paralelo, e desalinhar
   * faria ele regravar a imagem errada.
   */
  function _usarImagemExistente(id, itens, fechar) {
    const item = itens.find((i) => i.id === id);
    if (!item) return;

    const imagens = _getImagens();
    if (imagens.length >= MAX_IMAGENS) {
      showToast(`Limite de ${MAX_IMAGENS} imagens por produto.`, "warning");
      return;
    }

    if (!Array.isArray(product._imageIds)) product._imageIds = [];
    // Alinha os ids ao tamanho atual das imagens antes de acrescentar: se
    // houver base64 sem id correspondente, o par ficaria torto.
    while (product._imageIds.length < imagens.length) product._imageIds.push("");

    imagens.push(item.data);
    product._imageIds.push(item.id);
    product.image = imagens[0] || "";
    _imgAtual = imagens.length - 1;

    _renderGaleria();
    _marcarAlterado();
    if (typeof fechar === "function") fechar();
    showToast("Imagem reaproveitada.", "success");
  }

  // Expõe a função de render da galeria para ser chamada após a
  // inicialização de `product` e após o populateForm.
  window._renderGaleriaProduto = _renderGaleria;
  // Exposto para automação/testes abrirem o fluxo sem depender do layout
  // do carrossel. Não altera nenhum comportamento da tela.
  window.__abrirUpload = _abrirModalUpload;

  // ══════════════════════════════════════════
  //  PARÂMETROS E ESTADO INICIAL
  // ══════════════════════════════════════════
  let platformId = getParam("p");
  let productId = getParam("id");
  let isNew = getParam("new") === "1";

  // isKitCreation: APENAS pela URL (?kit=1) — nunca pelo sessionStorage
  // (evita que um clique em "Novo Produto" herde o estado de criação de kit anterior)
  const isKitCreation = getParam("kit") === "1";

  if (!platformId) {
    platformId = sessionStorage.getItem("current_platform");
    productId = sessionStorage.getItem("current_product");
    isNew = sessionStorage.getItem("current_isnew") === "1";
  }

  if (platformId) sessionStorage.setItem("current_platform", platformId);
  if (productId) sessionStorage.setItem("current_product", productId);
  sessionStorage.setItem("current_isnew", isNew ? "1" : "0");
  // Sempre limpa o flag de kit do sessionStorage para não contaminar próximas navegações
  sessionStorage.removeItem("current_is_kit");

  if (!platformId || !getPlatformConfig(platformId)) {
    window.location.href = "index.html";
    return;
  }

  const cfg = getPlatformConfig(platformId);

  // ── Identificação do Mercado Livre ──────────────────────────────
  // Antes esta linha era: platformId === "mercadolivre".
  // Isso funcionava quando o Mercado Livre era uma plataforma PADRÃO, com id
  // fixo no PLATFORMS_CONFIG. Hoje o app começa sem plataformas padrão e o id
  // é gerado no cadastro (JS/main.js) a partir do nome digitado:
  //     "Mercado Livre" → "mercado_livre_" + carimbo de tempo
  // ou seja, "mercado_livre_m9x2k3" — que nunca é igual a "mercadolivre".
  // Resultado: o painel Premium/Clássico deixava de aparecer.
  //
  // A verificação passa a olhar o id E o nome da plataforma, aceitando as
  // formas que o usuário costuma digitar no cadastro.
  //
  // ┌─ PARA AJUSTAR QUEM ATIVA O PAINEL, EDITE AS DUAS LISTAS ABAIXO ─┐
  //
  // TERMOS_ML: palavras inteiras, procuradas em QUALQUER PARTE do texto.
  //   Só entram aqui termos longos e distintivos — um termo curto aqui
  //   causaria falso positivo (ex.: "meli" bateria em "Camélia").
  // ── Identificação do Mercado Livre ──
  // A regra vive no utils.js, porque a LISTA de produtos também precisa
  // dela (para mostrar Premium/Clássico na coluna Preço). Mantida aqui
  // apenas a chamada — duas cópias fariam as telas discordarem sobre a
  // mesma plataforma.
  //
  // O fallback existe para o caso de um utils.js antigo: sem ele, a tela
  // quebraria inteira em vez de só deixar de mostrar o painel.
  function _ehMercadoLivre(id, nome) {
    if (typeof ehMercadoLivre === "function") return ehMercadoLivre(id, nome);
    console.warn("[Produto] utils.js sem ehMercadoLivre — painel ML desativado.");
    return false;
  }

  const isMercadoLivre = _ehMercadoLivre(platformId, cfg && cfg.name);

  window.goBack = function () {
    const sair = () => {
      _pararAutosave();
      sessionStorage.removeItem("current_is_kit");
      sessionStorage.removeItem("current_isnew");
      window.location.href = `plataforma.html?p=${platformId}`;
    };
    // Com o "Salvar" pedindo usuário e senha, nada é gravado sozinho ao
    // sair: antes de descartar alterações, pergunta (Cancelar e Voltar).
    if (_isDirty && _salvarSoPeloBotao() && window.BapellModal && typeof window.BapellModal.confirmar === "function") {
      window.BapellModal.confirmar({
        titulo: "Sair sem salvar?",
        texto: "As alterações deste produto ainda não foram salvas e serão descartadas. Para guardá-las, use o Salvar (ele pede usuário e senha).",
        botao: "Sair sem salvar",
        cancelar: "Continuar editando",
        perigo: true,
      }).then((sim) => {
        if (!sim) return;
        _isRedirecting = true;
        sair();
      });
      return;
    }
    sair();
  };

  /**
   * O "Salvar" desta tela pede usuário e senha (Dados da Empresa › Usuários
   * e Senhas › Senha nos botões)? Então o produto só é gravado por ele: o
   * salvamento automático (a cada 30 s e ao sair da tela) gravaria sem a
   * senha.
   */
  function _salvarSoPeloBotao() {
    try {
      return !!(window.BapellSenhas && typeof window.BapellSenhas.botaoProtegido === "function" &&
        window.BapellSenhas.botaoProtegido("produto:salvar"));
    } catch (e) {
      return false;
    }
  }

  buildSidebar(platformId);
  document.title = `Precificador — ${cfg.name}`;
  document.getElementById("platformBreadcrumb").textContent = cfg.name;

  let product = {
    id: productId || generateId(),
    platformId,
    name: "",
    sku: "",
    prodId: "",
    image: "",
    images: [],
    peso: 0,
    altura: 0,
    largura: 0,
    comprimento: 0,
    custo: 0,
    embalagem: 0,
    etiqueta: 0,
    frete: 0,
    freteProduto: 0,
    taxaFixa: 0,
    impostoNF: 0,
    taxa: 0,
    margem: 0,
    margemTipo: "pct",
    finalPrice: 0,
    kits: [],
    componentes: [],
    camposPersonalizados: [],
    camposIdentificacao: [],
    mlTaxaClassico: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  let _isDirty = false;
  let _autoSaveId = null;
  let _isRedirecting = false;

  // Render inicial da galeria (agora `product` já existe).
  // Para produto novo, exibe apenas o slot "+". Para edição, o populateForm
  // chama _renderGaleriaProduto() novamente com as imagens carregadas.
  _renderGaleria();

  // ══════════════════════════════════════════
  //  LÓGICA DE KIT COMPOSTO (COMPONENTES)
  // ══════════════════════════════════════════
  const kitComponentsSection = document.getElementById("kitComponentsSection");
  const inputCustoBase = document.getElementById("custoCusto");
  const inputKitCustoTotal = document.getElementById("kitCustoTotalInput");
  const btnAddComponent = document.getElementById("btnAddComponent");
  const searchInput = document.getElementById("componentSearch");
  const componentsList = document.getElementById("componentsList");

  // Determina se deve exibir a seção de composição:
  // - em modo criação de kit (?kit=1), OU
  // - quando o produto já possui componentes salvos (produto composto existente)
  const _temComponentes = () =>
    Array.isArray(product.componentes) && product.componentes.length > 0;

  // Exibe (ou não) a seção de composição e renderiza os componentes.
  // Pode ser chamada tanto na inicialização quanto DEPOIS do populateForm.
  function _atualizarVisibilidadeComposicao() {
    if (!kitComponentsSection) return;

    if (isKitCreation || _temComponentes()) {
      kitComponentsSection.style.display = "block";
      if (inputCustoBase) {
        inputCustoBase.readOnly = true;
        inputCustoBase.style.backgroundColor = "var(--clr-surface-alt)";
        inputCustoBase.title =
          "O custo base é calculado automaticamente pela soma dos itens do kit.";
      }

      // O selo "MODO KIT COMPOSTO" foi removido a pedido.
      //
      // A informação que ele dava (o custo vem dos componentes) já está
      // dita dentro do próprio campo "Preço de Custo do Kit", que é onde
      // ela faz falta — e lá sem ocupar uma faixa no topo da tela.
      //
      // A limpeza abaixo remove o selo de telas que já o tinham montado
      // antes desta versão, para ele não ficar preso no DOM.
      const seloAntigo = document.querySelector(".badge-kit-composto");
      if (seloAntigo) seloAntigo.remove();

      _renderizarComponentes();
    } else {
      kitComponentsSection.style.display = "none";
    }
  }

  // Executa na inicialização (para modo criação; para edição roda de novo após populate)
  _atualizarVisibilidadeComposicao();

  // Função para somar os custos do Kit
  function _atualizarCustoKitComposto() {
    // Recalcula sempre que houver componentes (criação ou edição de composto)
    if (!isKitCreation && !_temComponentes()) return;
    let custoTotal = 0;

    product.componentes.forEach((comp) => {
      custoTotal += comp.custoUnitario * comp.qty;
    });

    if (inputKitCustoTotal) inputKitCustoTotal.value = custoTotal.toFixed(2);
    if (inputCustoBase) {
      if (inputCustoBase.classList.contains("money-input")) {
        inputCustoBase.value =
          custoTotal === 0 ? "" : formatMoneyBR(custoTotal);
      } else {
        inputCustoBase.value = custoTotal.toFixed(2);
      }
      inputCustoBase.dispatchEvent(new Event("input"));
    }
  }

  function _renderizarComponentes() {
    if (!componentsList) return;
    componentsList.innerHTML = "";
    componentsList.classList.add("componentes-grid");
    if (!product.componentes || product.componentes.length === 0) {
      componentsList.innerHTML = `<div class="comp-vazio">Nenhum item no kit.</div>`;
      return;
    }

    product.componentes.forEach((comp, index) => {
      const div = document.createElement("div");
      // O layout saiu do estilo embutido e foi para o CSS (.comp-card):
      // o `max-width: 35%` com `margin-bottom` empilhava um item embaixo
      // do outro. Agora a lista é uma grade de até 4 por linha, e quem
      // controla isso é a classe .componentes-grid no container.
      div.className = "comp-card";

      const imgHtml = comp.image
        ? `<img src="${comp.image}" class="comp-card__img" alt="">`
        : `<div class="comp-card__img comp-card__img--vazia"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>`;

      div.innerHTML = `
        ${imgHtml}
        <div class="comp-card__info">
          <div class="comp-card__nome" title="${comp.name}">${comp.name}</div>
          <div class="comp-card__meta">SKU: ${comp.sku} | Custo: R$ ${comp.custoUnitario.toFixed(2)}</div>
        </div>
        <div class="comp-card__acoes">
          <input type="number" class="input-field comp-qty" value="${comp.qty}" data-index="${index}">
          <button class="btn-danger btn-remove-comp" data-index="${index}">✕</button>
        </div>
      `;
      componentsList.appendChild(div);
    });

    componentsList.querySelectorAll(".comp-qty").forEach((input) => {
      input.addEventListener("change", (e) => {
        product.componentes[e.target.dataset.index].qty =
          parseInt(e.target.value) || 1;
        _atualizarCustoKitComposto();
        _renderizarComponentes();
        _marcarAlterado();
      });
    });

    componentsList.querySelectorAll(".btn-remove-comp").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        product.componentes.splice(e.target.dataset.index, 1);
        _atualizarCustoKitComposto();
        _renderizarComponentes();
        _marcarAlterado();
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  AUTOCOMPLETE DA BUSCA DE PRODUTOS DA COMPOSIÇÃO
  //
  //  Antes era preciso digitar o SKU EXATO e clicar em "Adicionar":
  //  errou uma letra, aparecia "Produto não encontrado" e pronto.
  //  Agora a lista vai filtrando enquanto se digita.
  //
  //  A busca é SOMENTE na plataforma aberta. O mesmo SKU existe em
  //  várias plataformas com CUSTO DIFERENTE em cada uma, e trazer o de
  //  fora colocaria na composição o produto certo com o valor errado.
  //
  //  Escolher um item apenas PREENCHE o campo e dispara o mesmo botão
  //  "Adicionar" que já existia — nenhuma lógica de composição foi
  //  duplicada, então tudo que ele já fazia continua igual.
  // ═══════════════════════════════════════════════════════════════
  var compBox = document.getElementById("componentSugestoes");
  var _compSug = [];
  var _compMarcado = -1;

  // Estilos essenciais aplicados por JS, além dos que vão no style.css.
  // São os que fazem a lista APARECER: sem eles ela entraria no fluxo da
  // página, sem fundo e atrás dos campos seguintes. Assim a sugestão
  // funciona mesmo que o CSS não tenha sido atualizado junto.
  if (compBox) {
    compBox.style.position = "absolute";
    compBox.style.top = "calc(100% + 4px)";
    compBox.style.left = "0";
    // Mais larga que o campo de busca: o nome do produto é o que confirma
    // que aquele é o item certo, e cortado em 20 caracteres não confirma
    // nada. A caixa cresce até caber um título longo, sem passar da tela.
    compBox.style.minWidth = "560px";
    compBox.style.maxWidth = "min(760px, calc(100vw - 80px))";
    compBox.style.width = "max-content";
    compBox.style.zIndex = "60";
    compBox.style.maxHeight = "300px";
    compBox.style.overflowY = "auto";
    compBox.style.background = "var(--clr-surface, #1A2336)";
    compBox.style.border = "1px solid var(--clr-border, #38445E)";
    compBox.style.borderRadius = "10px";
    compBox.style.padding = "4px";
    compBox.style.boxShadow = "0 12px 30px rgba(0,0,0,0.35)";
    compBox.style.textAlign = "left";
  }

  function _compEsc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function _fecharCompSug() {
    if (!compBox) return;
    compBox.style.display = "none";
    compBox.innerHTML = "";
    _compSug = [];
    _compMarcado = -1;
    if (searchInput) searchInput.setAttribute("aria-expanded", "false");
  }

  function _buscarComponentes(termo) {
    if (typeof getProducts !== "function") return [];
    var q = String(termo || "").trim().toLowerCase();
    if (!q) return [];
    var lista = getProducts(platformId) || [];
    var out = [];
    for (var i = 0; i < lista.length && out.length < 8; i++) {
      var pr = lista[i];
      if (!pr) continue;
      // O próprio produto aberto não entra: ele não pode ser componente
      // de si mesmo.
      if (product && pr.id === product.id) continue;
      var sku = String(pr.sku || "").toLowerCase();
      var nome = String(pr.name || "").toLowerCase();
      if (sku.indexOf(q) < 0 && nome.indexOf(q) < 0) continue;
      out.push(pr);
    }
    return out;
  }

  function _renderCompSug(termo) {
    if (!compBox) return;
    _compSug = _buscarComponentes(termo);
    _compMarcado = -1;

    if (!_compSug.length) { _fecharCompSug(); return; }

    compBox.innerHTML = _compSug.map(function (p, i) {
      var custo = typeof formatBRL === "function" && p.custo ? formatBRL(p.custo) : "";
      // Miniatura: reconhecer o produto pela foto é mais rápido do que ler
      // o SKU. Sem imagem, entra um ícone de caixa no mesmo espaço, para as
      // linhas não ficarem desalinhadas.
      var img = p.image
        ? '<img src="' + _compEsc(p.image) + '" alt="" ' +
          "onerror=\"this.style.display='none'\" " +
          'style="width:100%;height:100%;object-fit:cover;display:block;" />'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="opacity:.45;">' +
          '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>' +
          '<polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>' +
          '<line x1="12" y1="22.08" x2="12" y2="12"></line></svg>';

      return '<button type="button" class="comp-sug-item" role="option" data-i="' + i + '">' +
        '<span class="comp-sug-img">' + img + "</span>" +
        '<span class="comp-sug-sku">' + _compEsc(p.sku || "sem SKU") + "</span>" +
        '<span class="comp-sug-nome">' + _compEsc(p.name || "Produto sem nome") + "</span>" +
        (custo ? '<span class="comp-sug-custo">' + custo + "</span>" : "") +
        "</button>";
    }).join("");
    compBox.style.display = "";
    if (searchInput) searchInput.setAttribute("aria-expanded", "true");

    compBox.querySelectorAll(".comp-sug-item").forEach(function (b, idx) {
      // Layout garantido por JS, pelo mesmo motivo dos estilos da caixa.
      b.style.display = "grid";
      // Miniatura · SKU · nome (que ocupa o resto) · custo.
      b.style.gridTemplateColumns = "auto auto minmax(0, 1fr) auto";
      b.style.alignItems = "center";
      b.style.gap = "11px";
      b.style.width = "100%";
      b.style.padding = "8px 11px";
      b.style.border = "none";
      b.style.borderRadius = "8px";
      b.style.background = "transparent";
      b.style.textAlign = "left";
      b.style.cursor = "pointer";
      b.style.fontFamily = "inherit";

      var mini = b.querySelector(".comp-sug-img");
      if (mini) {
        mini.style.display = "flex";
        mini.style.alignItems = "center";
        mini.style.justifyContent = "center";
        mini.style.width = "38px";
        mini.style.height = "38px";
        mini.style.flexShrink = "0";
        mini.style.borderRadius = "7px";
        mini.style.overflow = "hidden";
        mini.style.background = "var(--clr-surface-alt, #222c42)";
        mini.style.border = "1px solid var(--clr-border, #38445E)";
      }

      var nm = b.querySelector(".comp-sug-nome");
      if (nm) {
        // O nome pode ocupar até duas linhas antes de cortar: um título de
        // 80 caracteres cabe inteiro, e nomes maiores ainda são legíveis.
        nm.style.display = "-webkit-box";
        nm.style.webkitLineClamp = "2";
        nm.style.webkitBoxOrient = "vertical";
        nm.style.overflow = "hidden";
        nm.style.lineHeight = "1.35";
        nm.style.minWidth = "0";
        nm.style.whiteSpace = "normal";
      }
      // mousedown, e não click: o blur do campo fecha a lista antes de um
      // clique chegar, e a escolha se perderia.
      b.addEventListener("mousedown", function (e) {
        e.preventDefault();
        _escolherComponente(idx);
      });
    });
  }

  function _escolherComponente(i) {
    var p = _compSug[i];
    if (!p) return;
    // Preenche com o SKU EXATO e aciona o mesmo botão de sempre: é ele
    // que sabe somar quantidade, calcular custo e renderizar a lista.
    searchInput.value = p.sku || p.name || "";
    _fecharCompSug();
    if (btnAddComponent) btnAddComponent.click();
    searchInput.focus();
  }

  function _marcarCompSug(d) {
    if (!_compSug.length) return;
    _compMarcado += d;
    if (_compMarcado < 0) _compMarcado = _compSug.length - 1;
    if (_compMarcado >= _compSug.length) _compMarcado = 0;
    compBox.querySelectorAll(".comp-sug-item").forEach(function (b, i) {
      var ativo = i === _compMarcado;
      b.classList.toggle("marcado", ativo);
      b.style.background = ativo ? "var(--clr-primary-lt, rgba(59,130,246,.15))" : "transparent";
      if (ativo) { try { b.scrollIntoView({ block: "nearest" }); } catch (e) {} }
    });
  }

  if (searchInput && compBox) {
    searchInput.addEventListener("input", function () {
      _renderCompSug(searchInput.value);
    });
    searchInput.addEventListener("focus", function () {
      if (searchInput.value.trim()) _renderCompSug(searchInput.value);
    });
    searchInput.addEventListener("keydown", function (e) {
      if (compBox.style.display === "none") return;
      if (e.key === "ArrowDown") { e.preventDefault(); _marcarCompSug(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); _marcarCompSug(-1); }
      else if (e.key === "Enter" && _compMarcado >= 0) {
        e.preventDefault();
        _escolherComponente(_compMarcado);
      } else if (e.key === "Escape") { e.preventDefault(); _fecharCompSug(); }
    });
    searchInput.addEventListener("blur", function () {
      setTimeout(_fecharCompSug, 150);
    });
  }

  // Ação do Botão "Adicionar" Produto ao Kit
  if (btnAddComponent && searchInput) {
    btnAddComponent.addEventListener("click", () => {
      const query = searchInput.value.trim().toLowerCase();
      if (!query) {
        _marcarErro(searchInput);
        return showToast("Digite um SKU ou Nome para buscar", "warning");
      }

      // Usa a função nativa do seu utils.js para puxar os produtos da plataforma atual!
      const todosProdutos = getProducts(platformId);

      const encontrado = todosProdutos.find(
        (p) =>
          (p.sku && p.sku.toLowerCase() === query) ||
          (p.name && p.name.toLowerCase().includes(query)),
      );

      if (!encontrado) {
        return showToast("Produto não encontrado na plataforma.", "error");
      }

      // Verifica se já existe na lista do kit
      if (!product.componentes) product.componentes = [];
      const jaExiste = product.componentes.find(
        (c) => c.prodId === encontrado.id,
      );

      if (jaExiste) {
        jaExiste.qty += 1;
      } else {
        product.componentes.push({
          prodId: encontrado.id,
          name: encontrado.name,
          sku: encontrado.sku,
          custoUnitario: encontrado.custo || 0,
          qty: 1,
          image: encontrado.image || "", // <--- ADICIONADO: salva a imagem
        });
      }

      searchInput.value = "";
      _atualizarCustoKitComposto();
      _renderizarComponentes();
      _marcarAlterado();
      showToast("Produto adicionado ao kit!", "success");
    });
  }

  // (a exibição/render de componentes é feita por _atualizarVisibilidadeComposicao,
  //  chamada na inicialização e novamente após o populateForm)

  // ══════════════════════════════════════════
  //  INJEÇÃO DA ÁREA DE LOGÍSTICA (UNIDADE)
  // ══════════════════════════════════════════
  function _inicializarLogisticaUnidade() {
    if (document.getElementById("logisticaSection")) return;

    // Tenta encontrar o campo SKU para injetar o box de logística logo abaixo da identificação
    const anchorInput =
      document.getElementById("productSku") ||
      document.getElementById("productName");
    if (!anchorInput) return;

    const gridRow =
      anchorInput.closest('div[style*="grid"]') ||
      anchorInput.closest(".field-group").parentElement;

    if (gridRow && gridRow.parentElement) {
      const logSection = document.createElement("div");
      logSection.id = "logisticaSection";
      logSection.style.cssText =
        "margin-top: 24px; margin-bottom: 24px; padding: 16px; background: var(--clr-surface-alt); border-radius: var(--r-md); border: 1px solid var(--clr-border);";
      logSection.innerHTML = `
        <div style="font-size:11px; font-weight:700; color:var(--clr-text-2); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;">
  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
  <line x1="12" y1="22.08" x2="12" y2="12"></line>
</svg>Dimensões (Unidade)
        </div>
        <div data-log-conteudo style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
          <div class="field-group" style="margin:0;">
            <label style="font-size:10px;">Peso (g)</label>
            <input type="number" id="logPeso" class="input-field calc-input" placeholder="Ex: 100" min="0" style="padding:8px; font-size:12px;" />
          </div>
          <div class="field-group" style="margin:0;">
            <label style="font-size:10px;">Altura (cm)</label>
            <input type="number" id="logAltura" class="input-field calc-input" placeholder="Ex: 5" min="0" style="padding:8px; font-size:12px;" />
          </div>
          <div class="field-group" style="margin:0;">
            <label style="font-size:10px;">Largura (cm)</label>
            <input type="number" id="logLargura" class="input-field calc-input" placeholder="Ex: 10" min="0" style="padding:8px; font-size:12px;" />
          </div>
          <div class="field-group" style="margin:0;">
            <label style="font-size:10px;">Comprimento (cm)</label>
            <input type="number" id="logComprimento" class="input-field calc-input" placeholder="Ex: 10" min="0" style="padding:8px; font-size:12px;" />
          </div>
        </div>
      `;

      gridRow.parentElement.insertBefore(logSection, gridRow.nextSibling);

      // Atualiza a visualização dos kits sempre que o peso ou dimensões da unidade mudarem
      ["logPeso", "logAltura", "logLargura", "logComprimento"].forEach((id) => {
        const el = document.getElementById(id);
        if (el)
          el.addEventListener("input", () => {
            _marcarAlterado();
            _renderAllKits();
          });
      });
    }
  }

  // Esconde o campo "Taxa Da Plataforma (%)" quando a plataforma é Mercado
  // Livre. Precisa ser reaplicado: o aplicarConfigCampos() do campos.js
  // reescreve o display de TODO .field-group ao rodar, o que traria o campo
  // de volta na primeira vez que o usuário abrisse "Configurar Campos".
  /**
   * No Mercado Livre, a "Taxa Da Plataforma (%)" passa a conter as DUAS
   * taxas — Premium e Clássico — em vez de ser escondida.
   *
   * ── POR QUE AQUI E NÃO NO PAINEL ──────────────────────────────────
   * As duas taxas são variáveis de venda como qualquer outra: ficam
   * junto do Frete, da Taxa Fixa e do Imposto NF, que é onde a pessoa
   * procura por elas. O painel Premium & Clássico continua mostrando o
   * RESULTADO de cada modalidade — que é o papel dele.
   *
   * Os inputs originais (#mlTaxaPremium e #mlTaxaClassico) NÃO são
   * recriados: eles são MOVIDOS para cá. Assim todos os listeners, o
   * salvamento e o recálculo continuam funcionando sem uma linha de
   * mudança — recriar os campos exigiria religar tudo, e qualquer
   * esquecimento viraria um campo que não recalcula.
   */
  function _ocultarTaxaGenerica() {
    if (!isMercadoLivre) return;
    const el = document.getElementById("taxaPlataforma");
    if (!el) return;
    const grupo = el.closest(".field-group");
    if (!grupo) return;

    // Já convertido: nada a fazer.
    if (grupo.dataset.mlDuplo === "1") {
      _encaixarBlocoVendaNaGrade();
      return;
    }

    const premium = document.getElementById("mlTaxaPremium");
    const classico = document.getElementById("mlTaxaClassico");
    if (!premium || !classico) {
      // O painel ainda não montou. Mantém o comportamento antigo
      // (esconder) para não deixar um campo inútil na tela, e tenta de
      // novo no próximo ciclo.
      grupo.style.display = "none";
      _encaixarBlocoVendaNaGrade();
      return;
    }

    grupo.dataset.mlDuplo = "1";
    grupo.style.display = "";
    grupo.classList.add("taxa-ml-duplo");

    // O input genérico sai de cena, mas permanece no DOM: o cálculo
    // usa `taxa` e há código que lê este campo.
    const wrapGenerico = el.closest(".input-addon-wrap");
    if (wrapGenerico) wrapGenerico.style.display = "none";

    const caixa = document.createElement("div");
    caixa.className = "taxa-ml-caixa";

    [
      { el: premium, rot: "Premium", cls: "premium" },
      { el: classico, rot: "Clássico", cls: "classico" },
    ].forEach(function (item) {
      const linha = document.createElement("div");
      linha.className = "taxa-ml-linha taxa-ml-" + item.cls;

      const rot = document.createElement("span");
      rot.className = "taxa-ml-rot";
      rot.textContent = item.rot;
      linha.appendChild(rot);

      // MOVE o wrapper inteiro (input + "%"), preservando o elemento e
      // todos os seus listeners.
      const wrap = item.el.closest(".input-addon-wrap") || item.el;
      linha.appendChild(wrap);
      caixa.appendChild(linha);
    });

    grupo.appendChild(caixa);
    _removerAreaDeTaxasVazia();
    _encaixarBlocoVendaNaGrade();
  }

  // Com os dois campos de taxa já MOVIDOS para a "Taxa Da Plataforma (%)",
  // a área .kit-ml-rates do painel "Valores Premium e Clássico" ficava só
  // com os rótulos "Taxa Premium" e "Taxa Clássico", sem campo nenhum.
  // Ela sai do painel — mas só vazia: se os campos não tivessem sido
  // movidos, ela continuaria sendo o lugar onde as taxas são digitadas.
  function _removerAreaDeTaxasVazia() {
    const area = document.querySelector("#mlDualPanel .kit-ml-rates");
    if (area && !area.querySelector("input")) area.remove();
  }

  // No Mercado Livre a grade de Variáveis de Venda tem 4 colunas e uma ficou
  // vaga com a "Taxa Da Plataforma (%)" oculta. O layout fica assim:
  //
  //   Frete do Produto | Taxa Fixa | Imposto NF (%) | + Taxas e Variáveis
  //   [input]          | [input]   | [input]        | [+ Adicionar Campos]
  //   ─────────────────────────────────────────────────────────────────
  //   campo 1 | campo 2 | campo 3 | campo 4 | campo 5 | campo 6
  //   campo 7 | ...
  //
  //  ── POR QUE SÓ O CABEÇALHO É MOVIDO ────────────────────────────────
  //  A primeira versão movia também os campos personalizados para dentro da
  //  grade. Isso duplicava campos: o render faz listCfVenda.innerHTML = ""
  //  e recria TODOS os campos do array. Os que já tinham sido movidos viviam
  //  na grade, fora do alcance desse innerHTML — sobreviviam à limpeza e o
  //  render criava cópias ao lado. Ao criar o segundo campo, apareciam dois.
  //
  //  Agora nada dinâmico é movido. Só o cabeçalho (rótulo + botão), que é
  //  estático, vai para a célula vaga. Os campos continuam no #listCfVenda,
  //  que vira uma grade de 6 colunas logo abaixo. O render segue dono absoluto
  //  do seu contêiner e a duplicação deixa de ser possível.
  //
  //  Só no Mercado Livre. Nas outras plataformas nada disso é aplicado.
  var CF_VENDA_COLUNAS_ML = 6;

  function _encaixarBlocoVendaNaGrade() {
    if (!isMercadoLivre) return;
    const grade = document.getElementById("vendaInputsGrid");
    const bloco = document.getElementById("customFieldsVendaSection");
    if (!grade || !bloco) return;

    // 1) O cabeçalho vira a célula que sobrou. É movido uma única vez; a marca
    //    no dataset evita qualquer reprocessamento em chamadas seguintes.
    // O cabeçalho é localizado pelo BOTÃO, não por posição. Buscar
    // ":scope > div:first-child" quebrava na segunda chamada: com o cabeçalho
    // já movido, o primeiro filho da seção passa a ser o #listCfVenda — e a
    // lista inteira era arrastada para dentro da grade.
    const btnAdd = document.getElementById("btnAddVendaField");
    const cabecalho = btnAdd ? btnAdd.parentElement : null;

    // O cabeçalho com o "+ Taxas e Variáveis (Venda)" NÃO entra mais na
    // grade. Ele ocupava a quarta célula e empurrava o Imposto NF para a
    // linha de baixo — e o botão dele já foi para o topo da tela, junto
    // do "Configurar Campos". Sem conteúdo útil, a célula só atrapalhava.
    //
    // O bloco continua existindo: é ele que guarda a LISTA de campos
    // personalizados (#listCfVenda). Só o cabeçalho é escondido.
    if (cabecalho) {
      cabecalho.style.display = "none";
      if (cabecalho.dataset.naGrade === "1" && cabecalho.parentElement === grade) {
        // Veio de uma sessão anterior, em que foi movido para a grade:
        // devolve ao bloco de origem para não ocupar célula.
        const bloco2 = document.getElementById("customFieldsVendaSection");
        if (bloco2) bloco2.insertBefore(cabecalho, bloco2.firstChild);
      }
      cabecalho.dataset.naGrade = "0";
    }
    if (false) {
      // Rótulo em cima, botão embaixo — alinhado com os campos ao lado.
      cabecalho.style.display = "flex";
      cabecalho.style.flexDirection = "column";
      cabecalho.style.alignItems = "stretch";
      // Os .field-group vizinhos têm gap de 8px MAIS um margin-bottom de 4px
      // no rótulo. O <span> deste bloco não é um <label> e não herda essa
      // margem, então o botão subia 4px e ficava fora da linha dos inputs.
      // Medido no navegador; replicado aqui para os controles alinharem.
      cabecalho.style.gap = "var(--sp-sm)";
      var rotuloBloco = cabecalho.firstElementChild;
      if (rotuloBloco && rotuloBloco !== btnAdd) rotuloBloco.style.marginBottom = "4px";
      cabecalho.style.margin = "0";
      cabecalho.style.padding = "0";
      // A borda inferior fazia sentido quando o bloco era uma seção separada,
      // servindo de divisória. Dentro da grade ele é um campo como os outros:
      // a linha ficava sobrando embaixo do botão.
      // Definida em duas propriedades porque a forma abreviada "none" é
      // convertida para "medium" pelo parser e a borda continuaria aparecendo.
      cabecalho.style.borderBottomStyle = "none";
      cabecalho.style.borderBottomWidth = "0";
      cabecalho.style.paddingBottom = "0";
      // Alinhado pelo TOPO, como os demais campos da linha: assim o rótulo
      // fica na altura dos outros rótulos e o botão na altura dos inputs.
      // Antes usava justify-content:flex-end com height:100%, o que empurrava
      // o par para a base da célula e desalinhava o rótulo dos vizinhos.
      cabecalho.style.justifyContent = "flex-start";
      btnAdd.style.width = "100%";
      btnAdd.style.padding = "9px 12px";
    }

    // 2) A seção perde o visual de card: vazia, fica invisível; com campos,
    //    parece continuação da grade acima.
    bloco.style.margin = "0";
    bloco.style.padding = "0";
    bloco.style.background = "none";
    bloco.style.backgroundColor = "transparent";
    bloco.style.borderStyle = "none";
    bloco.style.borderWidth = "0";
    bloco.style.boxShadow = "none";

    // 3) Os campos personalizados em 6 colunas. Continuam onde o render os
    //    coloca — só o arranjo muda.
    const lista = document.getElementById("listCfVenda");
    if (lista) {
      // A classe é o que o CSS usa para reorganizar cada célula (rótulo e
      // campo em cima, botões embaixo). Sem ela, a regra base do
      // .campo-personalizado-row — pensada para a lista antiga em flex —
      // estoura a coluna e corta o rótulo.
      lista.classList.add("cf-em-grade");
      lista.style.display = "grid";
      lista.style.gridTemplateColumns =
        "repeat(" + CF_VENDA_COLUNAS_ML + ", minmax(0, 1fr))";
      lista.style.gap = "var(--sp-md)";
      lista.style.marginTop = "var(--sp-md)";
      lista.style.flexWrap = "";
    }
  }

  // Reaplica depois que a configuração de campos é aplicada (ver comentário
  // acima). O evento é disparado pelo campos.js.
  document.addEventListener("precifiq:campos-aplicados", _ocultarTaxaGenerica);

  // ══════════════════════════════════════════
  //  MERCADO LIVRE — PAINEL PREMIUM / CLÁSSICO
  // ══════════════════════════════════════════
  function _inicializarPainelML() {
    if (!isMercadoLivre || document.getElementById("mlDualPanel")) return;
    const anchor = document.querySelector(".resultado-box");
    if (!anchor) return;

    const panel = document.createElement("div");
    panel.id = "mlDualPanel";
    panel.className = "kit-ml-panel ml-unit-panel";
    // O cabeçalho segue o mesmo padrão das caixas vizinhas (Margem de
    // Lucro e Kits e Variações): título com a bolinha e a linha embaixo.
    //
    // A área .kit-ml-rates continua nascendo aqui só como berço dos dois
    // campos de taxa: logo abaixo, _ocultarTaxaGenerica() os MOVE para a
    // "Taxa Da Plataforma (%)" e remove a área, que fica vazia.
    panel.innerHTML = `
      <div class="calc-section-header">
        <span class="calc-section-title">Valores Premium e Clássico</span>
      </div>
      <div class="kit-ml-rates">
        <div class="field-group" style="margin:0;">
          <label style="font-size:11px;">Taxa Premium</label>
          <div class="input-addon-wrap input-addon-wrap-suffix">
            <input type="text" inputmode="decimal" id="mlTaxaPremium" class="input-field calc-input percent-input"
              placeholder="0,00" maxlength="7"
              style="font-size:13px;padding:7px 32px 7px 10px;" />
            <span class="input-suffix">%</span>
          </div>
        </div>
        <div class="field-group" style="margin:0;">
          <label style="font-size:11px;">Taxa Clássico</label>
          <div class="input-addon-wrap input-addon-wrap-suffix">
            <input type="text" inputmode="decimal" id="mlTaxaClassico" class="input-field calc-input percent-input"
              placeholder="0,00" maxlength="7"
              style="font-size:13px;padding:7px 32px 7px 10px;" />
            <span class="input-suffix">%</span>
          </div>
        </div>
      </div>
      <div class="kit-ml-results">
        <div class="kit-ml-result-box kit-ml-premium">
          <div class="kit-ml-badge kit-ml-badge-premium"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:2px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>Valor Do Premium</div>
          <div class="kit-ml-linha">
            <div class="kit-ml-price kit-ml-price-premium" id="mlPricePremium">R$ —</div>
            <div class="kit-ml-meta">
              <span>Lucro: <strong class="kit-ml-lucro-premium" id="mlLucroPremium">R$ —</strong></span>
              <span>Margem: <strong class="kit-ml-margem-premium" id="mlMargemPremium">—%</strong></span>
            </div>
          </div>
        </div>
        <div class="kit-ml-result-box kit-ml-classico">
          <div class="kit-ml-badge kit-ml-badge-classico"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:2px;"><circle cx="12" cy="12" r="9"></circle></svg>Valor Do Clássico</div>
          <div class="kit-ml-linha">
            <div class="kit-ml-price kit-ml-price-classico" id="mlPriceClassico">R$ —</div>
            <div class="kit-ml-meta">
              <span>Lucro: <strong class="kit-ml-lucro-classico" id="mlLucroClassico">R$ —</strong></span>
              <span>Margem: <strong class="kit-ml-margem-classico" id="mlMargemClassico">—%</strong></span>
            </div>
          </div>
        </div>
      </div>
    `;

    anchor.style.display = "none";
    anchor.parentNode.insertBefore(panel, anchor.nextSibling);

    // No Mercado Livre a taxa é informada aqui, nos campos Premium e Clássico.
    // O campo genérico "Taxa Da Plataforma (%)" vira duplicidade e confunde:
    // some da tela.
    //
    // É seguro escondê-lo porque o valor dele NÃO influencia nada aqui:
    //   · o painel troca a taxa antes de calcular
    //     (Object.assign({}, baseInputs, { taxa: taxaPremium }));
    //   · a .resultado-box, único lugar que usaria a taxa genérica, acabou
    //     de ser escondida na linha acima.
    //
    // O campo continua no DOM com o valor intacto: nada é apagado do produto,
    // e ele reaparece se a plataforma deixar de ser Mercado Livre.
    _ocultarTaxaGenerica();

    // A máscara é ligada ANTES do recálculo: o cálculo precisa ler o
    // valor já formatado, senão usa o número de uma tecla atrás.
    //
    // E o recálculo é o COMPLETO (_recalcularTudo), não só o do painel.
    // Antes estes dois campos chamavam _recalcularML direto e pulavam os
    // Preços Extras — mudar a taxa Premium deixava o "Você lucra" com o
    // valor antigo, na unidade e nos kits.
    ["mlTaxaPremium", "mlTaxaClassico"].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      _formatarInputNumerico(el);
      el.addEventListener("input", () => {
        _recalcularTudo();
        _marcarAlterado();
      });
    });
  }

  /**
   * Lê a taxa Premium ou Clássico como número.
   *
   * ÚNICO ponto de leitura dessas duas taxas — eram dez `parseFloat`
   * espalhados. O `parseFloat` para na vírgula: "16,50" virava 16, e o
   * campo antigo (type="number") descartava a vírgula e fazia "16,5"
   * virar 165%. Com a máscara de porcentagem e esta leitura, a vírgula
   * decimal funciona como em qualquer outro campo de % da tela.
   */
  function _taxaML(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    const n = parseFormattedValue(el.value);
    return Number.isFinite(n) ? n : 0;
  }

  function _recalcularMLTodosKits() {
    if (!isMercadoLivre) return;
    document.querySelectorAll(".kit-card[data-kit-id]").forEach((card) => {
      const kit = product.kits.find((k) => k.id === card.dataset.kitId);
      if (kit) _recalcularMLKit(card, kit);
    });
  }

  function _recalcularML() {
    if (!isMercadoLivre) return;
    const taxaPremium =
      _taxaML("mlTaxaPremium");
    const taxaClassico =
      _taxaML("mlTaxaClassico");
    const baseInputs = getCalcInputs();

    const premium = calcularUnidade(
      Object.assign({}, baseInputs, { taxa: taxaPremium }),
    );
    const classico = calcularUnidade(
      Object.assign({}, baseInputs, { taxa: taxaClassico }),
    );

    const _set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    _set(
      "mlPricePremium",
      premium.precoVenda > 0 ? formatBRL(premium.precoVenda) : "R$ —",
    );
    _set(
      "mlLucroPremium",
      premium.precoVenda > 0 ? formatBRL(premium.lucro) : "R$ —",
    );
    _set(
      "mlMargemPremium",
      premium.precoVenda > 0 ? premium.margemReal.toFixed(1) + "%" : "—%",
    );
    _set(
      "mlPriceClassico",
      classico.precoVenda > 0 ? formatBRL(classico.precoVenda) : "R$ —",
    );
    _set(
      "mlLucroClassico",
      classico.precoVenda > 0 ? formatBRL(classico.lucro) : "R$ —",
    );
    _set(
      "mlMargemClassico",
      classico.precoVenda > 0 ? classico.margemReal.toFixed(1) + "%" : "—%",
    );
  }

  function _recalcularMLKit(card, kit) {
    if (!isMercadoLivre) return;
    const taxaPremium =
      _taxaML("mlTaxaPremium");
    const taxaClassico =
      _taxaML("mlTaxaClassico");

    const freteInput = card.querySelector(".kit-frete-input");
    // parseFormattedValue, e não parseFloat: o campo mostra "1.250,00", e
    // parseFloat lê isso como 1,25 — um frete de mil reais virava um real.
    const freteKit = freteInput
      ? parseFormattedValue(freteInput.value) || 0
      : kit.frete || 0;
    const kitExtras = extractCustomFields(card);
    const baseInputs = getCalcInputs();

    const premium = calcularKit(
      Object.assign({}, baseInputs, { taxa: taxaPremium }),
      kit.qty,
      freteKit,
      kitExtras,
    );
    const classico = calcularKit(
      Object.assign({}, baseInputs, { taxa: taxaClassico }),
      kit.qty,
      freteKit,
      kitExtras,
    );

    const _setT = (sel, val) => {
      const el = card.querySelector(sel);
      if (el) el.textContent = val;
    };
    _setT(
      ".kit-ml-price-premium",
      premium.precoVenda > 0 ? formatBRL(premium.precoVenda) : "R$ —",
    );
    _setT(
      ".kit-ml-lucro-premium",
      premium.precoVenda > 0 ? formatBRL(premium.lucro) : "R$ —",
    );
    _setT(
      ".kit-ml-margem-premium",
      premium.precoVenda > 0 ? premium.margemReal.toFixed(1) + "%" : "—%",
    );
    _setT(
      ".kit-ml-price-classico",
      classico.precoVenda > 0 ? formatBRL(classico.precoVenda) : "R$ —",
    );
    _setT(
      ".kit-ml-lucro-classico",
      classico.precoVenda > 0 ? formatBRL(classico.lucro) : "R$ —",
    );
    _setT(
      ".kit-ml-margem-classico",
      classico.precoVenda > 0 ? classico.margemReal.toFixed(1) + "%" : "—%",
    );
  }

  // ══════════════════════════════════════════
  //  DUAS SEÇÕES DE CAMPOS PERSONALIZADOS
  // ══════════════════════════════════════════
  function _inicializarSecoesCamposUnidade() {
    const cardStyle =
      "border: 1px solid var(--clr-border); border-radius: var(--r-md); padding: 16px; background: var(--clr-surface-alt); margin-top: 16px; margin-bottom: 16px;";
    const headerStyle =
      "display:flex; align-items:center; padding: 3px; margin-bottom:12px; padding-bottom: 8px; border-bottom: 1px solid var(--clr-border); justify-content: space-between; gap:8px;";

    // 0. Área de Campos de Identificação (SOMENTE TEXTO — não entram em cálculo)
    try {
      if (!document.getElementById("customFieldsIdentSection")) {
        const identCard = Array.from(document.querySelectorAll(".card-title"))
          .find((el) => el.textContent.includes("Identificação do Produto"));
        const identCardBox = identCard ? identCard.closest(".card") : null;
        if (identCardBox) {
          const sectionIdent = document.createElement("div");
          sectionIdent.id = "customFieldsIdentSection";
          sectionIdent.style.cssText = cardStyle + " margin-bottom: 0;";
          sectionIdent.innerHTML = `
            <div style="${headerStyle}">
              <span style="font-size:12px; font-weight:700; color:var(--clr-text-2); text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap;">+ Campos Adicionais (Texto)</span>
              <button type="button" id="btnAddIdentField" class="btn-adicionar-kit-campo" style="font-size:12px; padding:4px 12px; background:transparent; border:1px solid var(--clr-primary); color:var(--clr-primary); border-radius:4px; cursor:pointer; white-space:nowrap; flex-shrink:0;">+ Adicionar Campos</button>
            </div>
            <div id="listCfIdent" style="display:flex; flex-wrap: wrap; gap:8px;"></div>
          `;
          identCardBox.appendChild(sectionIdent);
          document
            .getElementById("btnAddIdentField")
            .addEventListener("click", () => _abrirModalCampoTexto());
        }
      }
    } catch (err) {
      console.error("Falha ao criar seção de Campos de Identificação:", err);
    }

    // 1. Área de Formação do Custo Total
    try {
      if (!document.getElementById("customFieldsCustoSection")) {
        const custoTotalEl = document.getElementById("custoTotal");
        const custoBox = custoTotalEl
          ? custoTotalEl.closest(".field-group")
          : null;
        if (custoBox) {
          const sectionCusto = document.createElement("div");
          sectionCusto.id = "customFieldsCustoSection";
          sectionCusto.style.cssText =
            cardStyle + " width: 100%; grid-column: 1 / -1;";
          sectionCusto.innerHTML = `
            <div style="${headerStyle}">
              <span style="font-size:12px; font-weight:700; color:var(--clr-text-2); text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap;">+ Custos Adicionais (Unidade)</span>
              <button type="button" id="btnAddCustoField" class="btn-adicionar-kit-campo" style="font-size:12px; padding:4px 12px; background:transparent; border:1px solid var(--clr-primary); color:var(--clr-primary); border-radius:4px; cursor:pointer; white-space:nowrap; flex-shrink:0;">+ Adicionar Campos</button>
            </div>
            <div id="listCfCusto" style="display:flex; flex-wrap: wrap; gap:6px;"></div>
          `;
          custoBox.parentNode.insertBefore(sectionCusto, custoBox);
          document
            .getElementById("btnAddCustoField")
            .addEventListener("click", () =>
              _abrirModalCampoPersonalizado(null, "custo"),
            );
        }
      }
    } catch (err) {
      console.error("Falha ao criar seção de Custos Adicionais:", err);
    }

    // 2. Área de Variáveis de Venda
    try {
      if (!document.getElementById("customFieldsVendaSection")) {
        const vendaGrid = document.getElementById("vendaInputsGrid");
        if (vendaGrid) {
          const sectionVenda = document.createElement("div");
          sectionVenda.id = "customFieldsVendaSection";
          sectionVenda.style.cssText = cardStyle;
          sectionVenda.innerHTML = `
              <div style="${headerStyle}">
                <span style="font-size:12px; font-weight:700; color:var(--clr-text-2); text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap;">+ Taxas e Variáveis (Venda)</span>
                <button type="button" id="btnAddVendaField" class="btn-adicionar-kit-campo" style="font-size:12px; padding:4px 12px; background:transparent; border:1px solid var(--clr-primary); color:var(--clr-primary); border-radius:4px; cursor:pointer; white-space:nowrap; flex-shrink:0;">+ Adicionar Campos</button>
              </div>
              <div id="listCfVenda" style="display:flex; flex-wrap: wrap; gap:6px;"></div>
            `;
          vendaGrid.parentNode.insertBefore(
            sectionVenda,
            vendaGrid.nextSibling,
          );
          document
            .getElementById("btnAddVendaField")
            .addEventListener("click", () =>
              _abrirModalCampoPersonalizado(null, "venda"),
            );

          // No Mercado Livre este bloco vai para dentro da grade, ocupando a
          // célula que sobrou com a "Taxa Da Plataforma (%)" oculta. Precisa
          // ser aqui também: esta seção é criada DEPOIS do painel do ML, então
          // a chamada feita lá ainda não encontrava este elemento.
          _encaixarBlocoVendaNaGrade();
        }
      }
    } catch (err) {
      console.error("Falha ao criar seção de Taxas e Variáveis:", err);
    }
  }

  function _abrirModalCampoPersonalizado(
    targetKitId = null,
    categoria = "venda",
  ) {
    const existing = document.getElementById("modalCampoPersonalizado");
    if (existing) existing.remove();

    let subtitulo = "";
    if (targetKitId) subtitulo = "Taxa ou custo extra exclusivo para este kit.";
    else if (categoria === "custo")
      subtitulo =
        "Este valor compõe a Base de Custo da unidade e multiplica nos kits.";
    else subtitulo = "Variável ou taxa aplicada ao preço final de venda.";

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalCampoPersonalizado";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">Novo Campo Personalizado</div>
        <div class="modal-subtitle">${subtitulo}</div>
        <div class="field-group mb-md">
          <label>Nome do Campo</label>
          <input type="text" id="customFieldName" class="input-field" placeholder="Ex: Custo Extra, Comissão..." />
        </div>
        <div class="field-group mb-md">
          <label>Tipo de Valor</label>
          <div class="margem-toggle">
            <button class="toggle-btn active" data-cftype="RS">R$ Fixo</button>
            <button class="toggle-btn" data-cftype="PCT">% Percentual</button>
          </div>
        </div>
        ${categoria === "custo" ? `
        <div class="field-group mb-md" id="baseCustoWrap">
          <label id="baseCustoLabel">Somar sobre</label>
          <div class="margem-toggle">
            <button class="toggle-btn active" data-cfbase="custoTotal">Custo Total da Unidade</button>
            <button class="toggle-btn" data-cfbase="precoCusto">Preço de Custo</button>
          </div>
        </div>` : ""}
        <div class="modal-actions">
          <button class="btn-secondary" id="btnCancelCustomField">Cancelar</button>
          <button class="btn-primary" id="btnConfirmCustomField">Adicionar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    let tipoSelecionado = "RS";
    let baseSelecionada = "custoTotal";
    const baseCustoWrap = overlay.querySelector("#baseCustoWrap");
    const baseCustoLabel = overlay.querySelector("#baseCustoLabel");
    overlay.querySelectorAll("[data-cftype]").forEach((btn) => {
      btn.addEventListener("click", () => {
        overlay
          .querySelectorAll("[data-cftype]")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        tipoSelecionado = btn.dataset.cftype;
        // Adapta o texto do label conforme o tipo (a base aparece sempre em custo)
        if (baseCustoLabel) {
          baseCustoLabel.textContent = tipoSelecionado === "PCT"
            ? "Calcular a porcentagem sobre"
            : "Somar o valor sobre";
        }
      });
    });
    // Seletor de base (só existe em custo)
    overlay.querySelectorAll("[data-cfbase]").forEach((btn) => {
      btn.addEventListener("click", () => {
        overlay.querySelectorAll("[data-cfbase]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        baseSelecionada = btn.dataset.cfbase;
      });
    });

    document
      .getElementById("btnCancelCustomField")
      .addEventListener("click", () => overlay.remove());

    document
      .getElementById("btnConfirmCustomField")
      .addEventListener("click", () => {
        const nome = document.getElementById("customFieldName").value.trim();
        if (!nome) {
          _marcarErro(document.getElementById("customFieldName"));
          return showToast("Informe o nome do campo.", "error");
        }

        const novoCampo = {
          id: generateId(),
          nome,
          tipo: tipoSelecionado,
          valor: 0,
          categoria,
          // Base do cálculo para campos de custo: 'custoTotal' ou 'precoCusto'
          base: (categoria === "custo") ? baseSelecionada : null,
        };

        if (targetKitId) {
          const kit = product.kits.find((k) => k.id === targetKitId);
          if (kit) {
            if (!kit.camposPersonalizados) kit.camposPersonalizados = [];
            kit.camposPersonalizados.push(novoCampo);
            _renderAllKits();
          }
        } else {
          product.camposPersonalizados.push(novoCampo);
          const listId = categoria === "custo" ? "listCfCusto" : "listCfVenda";
          const filtrados = product.camposPersonalizados.filter(
            (c) => (c.categoria || "venda") === categoria,
          );
          _renderizarCamposLista(
            filtrados,
            document.getElementById(listId),
            null,
            categoria,
          );
          _recalcularTudo();
        }

        overlay.remove();
        _marcarAlterado();
        showToast(`Campo "${nome}" adicionado!`, "success");
      });

    setTimeout(() => document.getElementById("customFieldName").focus(), 60);
  }

  // ══════════════════════════════════════════
  //  CAMPOS DE IDENTIFICAÇÃO (SOMENTE TEXTO)
  // ══════════════════════════════════════════
  function _abrirModalCampoTexto() {
    const existing = document.getElementById("modalCampoTexto");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "modalCampoTexto";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">Novo Campo de Texto</div>
        <div class="modal-subtitle">
          Campo apenas informativo (ex: EAN, NCM, Fornecedor, Cor).
          Não entra em nenhum cálculo.
        </div>
        <div class="field-group mb-md">
          <label>Nome do Campo</label>
          <input type="text" id="txtFieldName" class="input-field" placeholder="Ex: EAN, NCM, Fornecedor..." />
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="btnCancelTxtField">Cancelar</button>
          <button class="btn-primary" id="btnConfirmTxtField">Adicionar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document
      .getElementById("btnCancelTxtField")
      .addEventListener("click", () => overlay.remove());

    document
      .getElementById("btnConfirmTxtField")
      .addEventListener("click", () => {
        const nome = document.getElementById("txtFieldName").value.trim();
        if (!nome) {
          _marcarErro(document.getElementById("txtFieldName"));
          return showToast("Informe o nome do campo.", "error");
        }

        if (!product.camposIdentificacao) product.camposIdentificacao = [];
        product.camposIdentificacao.push({
          id: generateId(),
          nome,
          texto: "",
        });

        _renderizarCamposIdentificacao();
        overlay.remove();
        _marcarAlterado();
        showToast(`Campo "${nome}" adicionado!`, "success");
      });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    setTimeout(() => document.getElementById("txtFieldName").focus(), 60);
  }

  function _renderizarCamposIdentificacao() {
    const containerEl = document.getElementById("listCfIdent");
    if (!containerEl) return;
    containerEl.innerHTML = "";

    const campos = product.camposIdentificacao || [];
    if (campos.length === 0) return;

    campos.forEach((campo) => {
      const row = document.createElement("div");
      row.className = "campo-personalizado-row";

      row.innerHTML = `
        <div class="field-group" style="margin:0;">
          <label style="font-size:11px;">${campo.nome}</label>
          <input type="text" class="input-field custom-ident-input"
            data-cf-id="${campo.id}" value="${(campo.texto || "").replace(/"/g, "&quot;")}"
            placeholder="Digite ${campo.nome.toLowerCase()}..."
            style="padding:4px 8px; font-size:11px; height:28px;" />
        </div>
        <button type="button" class="btn-danger cf-txt-remove" title="Remover" style="padding:3px 6px;font-size:10px;flex-shrink:0;">✕</button>
      `;

      const input = row.querySelector(".custom-ident-input");
      input.addEventListener("input", (e) => {
        campo.texto = e.target.value;
        _marcarAlterado();
      });

      row.querySelector(".cf-txt-remove").addEventListener("click", () => {
        product.camposIdentificacao = product.camposIdentificacao.filter(
          (c) => c.id !== campo.id,
        );
        _renderizarCamposIdentificacao();
        _marcarAlterado();
      });

      containerEl.appendChild(row);
    });
  }

  function _renderizarCamposLista(
    camposArray,
    containerEl,
    kitId = null,
    categoria = "venda",
  ) {
    if (!containerEl) return;
    containerEl.innerHTML = "";
    if (!camposArray || camposArray.length === 0) return;

    camposArray.forEach((campo) => {
      const row = document.createElement("div");
      row.className = "campo-personalizado-row";

      const isRS = campo.tipo === "RS";
      const wrapClass = isRS
        ? "input-addon-wrap"
        : "input-addon-wrap input-addon-wrap-suffix";
      const cat = campo.categoria || categoria;
      const valorFmt = isRS
        ? formatMoneyBR(campo.valor || 0)
        : formatPercentBR(campo.valor || 0);

      // Etiqueta que identifica a base do campo de custo
      let baseTag = "";
      if (cat === "custo" && campo.base) {
        const txt = campo.base === "precoCusto" ? "sobre Preço de Custo" : "sobre Custo Total";
        baseTag = `<span style="font-size:9px; font-weight:600; color:var(--clr-primary); background:var(--clr-primary-lt); border:1px solid var(--clr-border); border-radius:4px; padding:1px 5px; margin-left:6px; white-space:nowrap;">${txt}</span>`;
      }

      row.innerHTML = `
        <div class="field-group" style="margin:0;">
          <label style="font-size:11px; display:flex; align-items:center;">${campo.nome} (${isRS ? "R$" : "%"})${baseTag}</label>
          <div class="${wrapClass}">
            ${isRS ? '<span class="input-prefix">R$</span>' : ""}
            <input type="text" inputmode="decimal" class="input-field calc-input custom-field-input ${isRS ? "money-input" : "percent-input"}"
              data-cf-id="${campo.id}" data-cf-tipo="${campo.tipo}" data-cf-categoria="${cat}" data-cf-base="${campo.base || ""}" value="${valorFmt === "0,00" || valorFmt === "0" ? "" : valorFmt}"
              style="${isRS ? "padding-left:36px;" : "padding-right:36px; padding-left:12px;"}" />
            ${!isRS ? '<span class="input-suffix">%</span>' : ""}
          </div>
        </div>
        <button type="button" class="btn-secondary cf-btn-toggle" title="Trocar Tipo" style="padding:3px 7px;font-size:10px;white-space:nowrap;flex-shrink:0;">${isRS ? "→ %" : "→ R$"}</button>
        <button type="button" class="btn-danger cf-btn-remove" title="Remover" style="padding:3px 6px;font-size:10px;flex-shrink:0;">✕</button>
      `;

      const input = row.querySelector(".custom-field-input");
      // A MÁSCARA É LIGADA PRIMEIRO, e só depois o que guarda o valor —
      // a mesma regra dos campos fixos (ver CALC_IDS). Os dois escutam
      // "input" e rodam na ordem em que foram ligados. Na ordem inversa, o
      // valor guardado era o de uma tecla atrás: digitando 5,55 o campo
      // mostrava "5,55", mas o produto era salvo com 0,555 — e ao reabrir
      // aparecia "0,56".
      if (typeof _formatarInputNumerico === "function") {
        _formatarInputNumerico(input);
      }
      input.addEventListener("input", (e) => {
        campo.valor = parseFormattedValue(e.target.value);
        _marcarAlterado();
        if (kitId) {
          // Campo personalizado de um KIT: muda o preço daquele kit e o
          // lucro dos Preços Extras que aparecem nele.
          //
          // Antes, fora do Mercado Livre, este ramo não recalculava nada
          // por conta própria — o preço só acertava por um listener
          // externo. E em NENHUMA plataforma as respostas dos Preços
          // Extras eram refeitas: ficavam com o lucro de antes do campo.
          if (isMercadoLivre) {
            const card = containerEl.closest(".kit-card");
            const kit = product.kits.find((k) => k.id === kitId);
            if (card && kit) _recalcularMLKit(card, kit);
          } else if (typeof atualizarTodosKits === "function") {
            atualizarTodosKits();
          }
          try { _atualizarPrecosExtrasKits(); } catch (e) { console.error("[Preços Extras] kit:", e); }
        } else {
          _recalcularTudo();
        }
      });

      row.querySelector(".cf-btn-toggle").addEventListener("click", () => {
        campo.tipo = campo.tipo === "RS" ? "PCT" : "RS";
        campo.valor = 0;
        if (kitId) _renderAllKits();
        else {
          const listId = cat === "custo" ? "listCfCusto" : "listCfVenda";
          const filtrados = product.camposPersonalizados.filter(
            (c) => (c.categoria || "venda") === cat,
          );
          _renderizarCamposLista(
            filtrados,
            document.getElementById(listId),
            null,
            cat,
          );
          _recalcularTudo();
        }
        _marcarAlterado();
      });

      row.querySelector(".cf-btn-remove").addEventListener("click", () => {
        if (kitId) {
          const kit = product.kits.find((k) => k.id === kitId);
          kit.camposPersonalizados = kit.camposPersonalizados.filter(
            (c) => c.id !== campo.id,
          );
          _renderAllKits();
        } else {
          product.camposPersonalizados = product.camposPersonalizados.filter(
            (c) => c.id !== campo.id,
          );
          const listId = cat === "custo" ? "listCfCusto" : "listCfVenda";
          const filtrados = product.camposPersonalizados.filter(
            (c) => (c.categoria || "venda") === cat,
          );
          _renderizarCamposLista(
            filtrados,
            document.getElementById(listId),
            null,
            cat,
          );
          _recalcularTudo();
        }
        _marcarAlterado();
      });

      containerEl.appendChild(row);
    });
  }

  // ══════════════════════════════════════════
  //  MERCADO LIVRE — AGRUPAR MARGEM + KITS NUMA COLUNA
  // ══════════════════════════════════════════
  // No Mercado Livre a linha de topo é ocupada pelo painel Premium/Clássico,
  // que é bem mais alto que os outros blocos. Com três caixas lado a lado
  // sobrava vão em branco nas duas menores. Aqui, e SÓ aqui, Margem de Lucro
  // e Kits e Variações são empilhadas num card único, separadas por uma linha
  // grossa — a linha passa a ter duas colunas de altura equivalente.
  //
  // As demais plataformas continuam com as três caixas soltas, como sempre
  // foram: o HTML não muda, o agrupamento é feito aqui em tempo de execução.
  function _agruparMargemKitML() {
    if (!isMercadoLivre) return;
    if (document.querySelector(".margem-kit-col")) return; // já agrupado

    const linha  = document.querySelector(".produto-3cols");
    const margem = document.getElementById("boxMargem");
    const kits   = document.querySelector(".kits-header-col");
    if (!linha || !margem || !kits) return;

    const col = document.createElement("div");
    col.className = "margem-kit-col";

    // O wrapper entra no lugar da Margem e recebe os dois blocos.
    linha.insertBefore(col, margem);
    col.appendChild(margem);

    const divisor = document.createElement("div");
    divisor.className = "margem-kit-divisor";
    col.appendChild(divisor);

    col.appendChild(kits);

    // Marca a linha para o CSS aplicar o layout de duas colunas só neste caso.
    linha.classList.add("tem-margem-kit");
  }

  // Inicializa a UI
  _inicializarLogisticaUnidade();
  _inicializarSecoesCamposUnidade();
  // O agrupamento de Margem + Kits numa coluna só está DESLIGADO.
  //
  // Ele existia para abrir espaço ao painel do Mercado Livre, mas
  // empilhava dois blocos numa coluna e deixava o layout com dois
  // elementos de alturas diferentes. Agora os três — Margem de Lucro,
  // Kits e Variações e o painel Premium/Clássico — ficam lado a lado,
  // com a mesma altura.
  //
  // A função foi mantida acima, e não removida: se um dia o layout de
  // duas colunas for necessário, basta chamá-la de novo.
  // _agruparMargemKitML();
  _inicializarPainelML();
  // Os Preços Extras do Mercado Livre ganham o campo do Clássico ao lado
  // do atual (que passa a ser o do Premium). Precisa vir ANTES do
  // carregamento do produto: a populateForm preenche os dois campos.
  _prepararPrecosExtrasML();
  // Em todas as plataformas, cada nível ganha os botões Preço · Margem %
  // · Margem R$ e a linha da margem — também antes do carregamento.
  _prepararModosPrecosExtras();

  // O botão único vem DEPOIS das seções existirem: ele precisa achar os
  // três botões antigos para escondê-los, e o "Configurar Campos" para
  // se posicionar antes dele.
  //
  // O campos.js injeta o "Configurar Campos" de forma assíncrona, então
  // uma segunda tentativa cobre o caso de ele ainda não estar lá.
  _montarBotaoUnicoDeCampos();

  // O campos.js injeta os botões "Configurar Campos" de forma
  // assíncrona, e pode reinjetá-los ao trocar de aba ou recarregar a
  // configuração. Um observador garante que o botão do topo seja
  // religado e os das seções voltem a ficar escondidos, em vez de
  // depender de um setTimeout adivinhando o instante certo.
  const alvoObs = document.querySelector(".produto-3cols")?.parentElement || document.body;
  const obsCampos = new MutationObserver(function () {
    _montarBotaoUnicoDeCampos();
  });
  obsCampos.observe(alvoObs, { childList: true, subtree: true });

  // Uma passada extra logo após o carregamento, para o caso de o
  // observador ser criado depois da injeção.
  setTimeout(_montarBotaoUnicoDeCampos, 300);
  setTimeout(_montarBotaoUnicoDeCampos, 900);

  // ══════════════════════════════════════════
  //  CARREGAMENTO E POPULATE
  // ══════════════════════════════════════════
  if (!isNew) {
    let loaded = productId ? getProductById(platformId, productId) : null;
    if (!loaded)
      loaded = getProductById(
        platformId,
        sessionStorage.getItem("current_product_id"),
      );
    if (loaded) {
      product = JSON.parse(JSON.stringify(Object.assign({}, product, loaded)));
      if (!product.camposPersonalizados) product.camposPersonalizados = [];
      sessionStorage.setItem("current_product_id", product.id);
      populateForm(product);
    }
  } else {
    sessionStorage.setItem("current_product_id", product.id);
  }

  // Aplica configuração de campos APÓS populate — garante que campos ocultos
  // tenham data-campo-oculto DEPOIS dos valores reais serem preenchidos
  if (typeof aplicarConfigCampos === "function") {
    aplicarConfigCampos(platformId);
  }

  updateBreadcrumb();
  _iniciarAutosave();

  function populateForm(p) {
    _setField("productName", p.name ?? "");
    _setField("productSku", p.sku ?? "");
    _setField("productId", p.prodId ?? "");

    // Logística
    _setField("logPeso", p.peso ?? 0);
    _setField("logAltura", p.altura ?? 0);
    _setField("logLargura", p.largura ?? 0);
    _setField("logComprimento", p.comprimento ?? 0);

    // Precificação
    _setField("custoCusto", p.custo ?? 0);
    _setField("custoEmbalagem", p.embalagem ?? 0);
    _setField("custoEtiqueta", p.etiqueta ?? 0);
    _setField("custoFrete", p.frete ?? 0);
    // Impostos sobre o custo. Sem estas quatro linhas os campos abriam vazios
    // e o preço era recalculado sem eles, mesmo tendo sido salvo com eles.
    _setField("custoIpi", p.ipi ?? 0);
    _setField("custoDifal", p.difal ?? 0);
    _setField("custoSt", p.st ?? 0);
    _setField("custoAliquota", p.aliquota ?? 0);
    _setField("freteProduto", p.freteProduto ?? 0);
    _setField("taxaFixa", p.taxaFixa ?? 0);
    _setField("impostoNF", p.impostoNF ?? 0);
    _setField("taxaPlataforma", p.taxa ?? 0);
    _setField("margemValor", p.margem ?? 0);
    _aplicarMargemTipo(p.margemTipo || "pct", false);

    // Preços Extras. Preenchidos AQUI, antes do _recalcularTudo do fim
    // desta função: é ele que calcula o "Você lucra" de cada campo (e o
    // dos kits, que têm os próprios campos). `?? 0` porque produtos
    // salvos antes desta versão não têm os campos — abrem vazios, como
    // sempre abriram.
    _setField("precoMinimo", p.precoMinimo ?? 0);
    _setField("precoIdeal",  p.precoIdeal ?? 0);
    _setField("precoMaximo", p.precoMaximo ?? 0);
    // Mercado Livre: os campos acima são os do Premium, e cada nível tem
    // também o do Clássico. Produtos salvos antes desta versão têm um
    // preço só por nível, que valia para as duas modalidades — ele abre
    // nos dois campos, e a conta continua a mesma de antes.
    if (isMercadoLivre) {
      _precosExtrasCfg().forEach(function (cfg) {
        const salvo = p[cfg.campo + "Classico"];
        _setField(cfg.inputClassico, salvo ?? p[cfg.campo] ?? 0);
      });
    }
    // Preço digitado ou pela margem, nível a nível. Produtos salvos antes
    // desta versão não têm o modo: abrem no Preço, como sempre.
    _carregarModosDaUnidade(p);

    // ── Carrega as imagens ──
    // O produto guarda IDs (novo formato). Resolvemos os IDs → base64
    // via IndexedDB. Também migra automaticamente formatos antigos:
    //  - p.images com base64 solto (versão anterior)
    //  - p.image único (versão bem antiga)
    _carregarImagensProduto(p);

    if (isMercadoLivre) {
      _setField("mlTaxaPremium", p.mlTaxaPremium ?? 0);
      _setField("mlTaxaClassico", p.mlTaxaClassico ?? 0);
    }

    product.camposPersonalizados = p.camposPersonalizados || [];

    // Campos de identificação (só texto)
    product.camposIdentificacao = p.camposIdentificacao || [];
    _renderizarCamposIdentificacao();

    const cfCusto = product.camposPersonalizados.filter(
      (c) => c.categoria === "custo",
    );
    const cfVenda = product.camposPersonalizados.filter(
      (c) => c.categoria !== "custo",
    );
    _renderizarCamposLista(
      cfCusto,
      document.getElementById("listCfCusto"),
      null,
      "custo",
    );
    _renderizarCamposLista(
      cfVenda,
      document.getElementById("listCfVenda"),
      null,
      "venda",
    );

    product.kits = p.kits || [];
    product.kits.forEach((k) => {
      if (!k.camposPersonalizados) k.camposPersonalizados = [];
    });
    _renderAllKits();

    // Produto composto: garante que a seção e os componentes apareçam
    product.componentes = p.componentes || [];
    // Cada item guarda uma CÓPIA do custo do produto. Um composto gravado
    // antes da atualização automática pode estar com um custo velho: ao
    // abrir, os itens recebem os valores atuais.
    const custoDosItensMudou = _sincronizarComponentes();
    _atualizarVisibilidadeComposicao();
    if (product.componentes.length > 0) {
      _atualizarCustoKitComposto();
    }

    _recalcularTudo();
    _marcarSalvo();
    if (custoDosItensMudou) {
      _marcarAlterado();
      showToast(
        "O custo de itens deste composto mudou desde que ele foi salvo: o custo e os preços já foram atualizados. Salve para guardar.",
        "warning",
        7000
      );
    }
  }

  /**
   * Ao abrir um produto composto: cada item recebe o custo, o nome, o SKU
   * e a imagem atuais do produto desta plataforma (pelo id; nos itens
   * antigos sem id, pelo SKU). Devolve true se algum custo mudou.
   */
  function _sincronizarComponentes() {
    if (!Array.isArray(product.componentes) || !product.componentes.length) return false;
    let lista;
    try { lista = getProducts(platformId) || []; } catch (e) { return false; }
    const porId = new Map();
    lista.forEach(function (x) { if (x && x.id !== undefined && x.id !== null) porId.set(String(x.id), x); });
    const norm = function (t) { return String(t || "").trim().toUpperCase(); };
    const r2 = function (n) { return Math.round((Number(n) || 0) * 100) / 100; };
    let custoMudou = false;
    product.componentes.forEach(function (item) {
      if (!item) return;
      let atual = item.prodId !== undefined && item.prodId !== null ? porId.get(String(item.prodId)) : null;
      if (!atual && norm(item.sku)) atual = lista.find(function (x) { return x && norm(x.sku) === norm(item.sku); }) || null;
      if (!atual || String(atual.id) === String(product.id)) return;
      const custo = r2(atual.custo);
      if (r2(item.custoUnitario) !== custo) custoMudou = true;
      item.custoUnitario = custo;
      if (atual.name) item.name = atual.name;
      item.sku = atual.sku || "";
      if (typeof atual.image === "string") item.image = atual.image;
      item.prodId = atual.id;
    });
    return custoMudou;
  }

  function _setField(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    // Formata campos de valor conforme o tipo
    if (el.classList.contains("money-input") || el.classList.contains("margem-input")) {
      const num = parseFormattedValue(value);
      el.value = num === 0 ? "" : formatMoneyBR(num);
    } else if (el.classList.contains("percent-input")) {
      const num = parseFormattedValue(value);
      el.value = num === 0 ? "" : formatPercentBR(num);
    } else {
      el.value = value;
    }
  }

  // ══════════════════════════════════════════
  //  MODAL KIT E CRIAÇÃO
  // ══════════════════════════════════════════
  const modalKit = document.getElementById("modalKit");
  const kitQtyInput = document.getElementById("kitQty");
  const kitSkuInput = document.getElementById("kitSku");
  const kitFreteInput = document.getElementById("kitFrete");
  const kitPreviewBox = document.getElementById("kitPreviewBox");

  document
    .getElementById("btnAddKit")
    .addEventListener("click", _abrirModalKit);
  document
    .getElementById("btnCancelKit")
    .addEventListener("click", () => (modalKit.style.display = "none"));

  function _abrirModalKit() {
    kitQtyInput.value = "";
    kitSkuInput.value = "";

    const inputFreteProd = document.getElementById("freteProduto");
    const valorFreteProduto = inputFreteProd
      ? parseFormattedValue(inputFreteProd.value) || 0
      : 0;

    if (kitFreteInput) {
      kitFreteInput.value = valorFreteProduto;
    }

    kitPreviewBox.style.display = "none";
    modalKit.style.display = "flex";
    setTimeout(() => kitQtyInput.focus(), 60);
  }

  kitQtyInput.addEventListener("input", _atualizarPreviewKit);
  if (kitFreteInput)
    kitFreteInput.addEventListener("input", _atualizarPreviewKit);

  function _atualizarPreviewKit() {
    const qty = parseInt(kitQtyInput.value, 10);
    if (!qty || qty < 2) {
      kitPreviewBox.style.display = "none";
      return;
    }

    const inputs = getCalcInputs();
    const kitFrete = kitFreteInput
      ? parseFormattedValue(kitFreteInput.value) || 0
      : 0;
    const result = calcularKit(inputs, qty, kitFrete, {
      extraRS: 0,
      extraPCT: 0,
    });

    document.getElementById("kitPreviewValue").textContent = formatBRL(
      result.precoVenda,
    );
    document.getElementById("kitPreviewDetail").textContent =
      `Custo base: ${formatBRL(result.custoBase)} · Lucro: ${formatBRL(result.lucro)}`;
    kitPreviewBox.style.display = "block";
  }

  document.getElementById("btnConfirmKit").addEventListener("click", () => {
    const qty = parseInt(kitQtyInput.value, 10);
    const sku = kitSkuInput.value.trim();
    const kitFrete = kitFreteInput
      ? parseFormattedValue(kitFreteInput.value) || 0
      : 0;

    if (!qty || qty < 2) return showToast("Quantidade mínima: 2", "error");
    if (product.kits.find((k) => k.qty === qty))
      return showToast("Kit já existe", "warning");

    const inputs = getCalcInputs();
    const result = calcularKit(inputs, qty, kitFrete, {
      extraRS: 0,
      extraPCT: 0,
    });

    product.kits.push({
      id: generateId(),
      qty,
      sku: sku || `KIT-${qty}x`,
      frete: kitFrete,
      camposPersonalizados: [],
      price: parseFloat(result.precoVenda.toFixed(2)),
      custo: parseFloat(result.custoBase.toFixed(2)),
      lucro: parseFloat(result.lucro.toFixed(2)),
    });
    product.kits.sort((a, b) => a.qty - b.qty);
    _renderAllKits();
    modalKit.style.display = "none";
    _marcarAlterado();
  });

  // ══════════════════════════════════════════
  //  RENDERIZAÇÃO DOS KITS (AGORA COM LOGÍSTICA)
  // ══════════════════════════════════════════
  function _renderAllKits() {
    // Depois de redesenhar os cards, as respostas dos Preços Extras de
    // cada kit são calculadas: os cards nascem só com os campos (já com
    // os valores salvos), e sem esta chamada o "Você lucra" só
    // apareceria ao digitar algo.
    setTimeout(function () {
      try { _atualizarPrecosExtrasKits(); } catch (e) { console.error("[Preços Extras] kit:", e); }
    }, 0);
    const grid = document.getElementById("kitsGrid");
    grid.innerHTML = "";
    product.kits.forEach((kit) => _renderKitCard(kit));
    _checkKitsEmpty();
    atualizarTodosKits();
  }

  function _renderKitCard(kit) {
    const grid = document.getElementById("kitsGrid");
    const inputs = getCalcInputs();

    let extraRS = 0,
      extraPCT = 0;
    (kit.camposPersonalizados || []).forEach((c) => {
      if (c.tipo === "RS") extraRS += c.valor;
      else extraPCT += c.valor;
    });

    const result = calcularKit(
      inputs,
      kit.qty,
      kit.frete !== undefined ? kit.frete : 0,
      { extraRS, extraPCT },
    );

    // Cálculos Logísticos do Kit
    const uPeso = parseFloat(document.getElementById("logPeso")?.value) || 0;
    const uAlt = parseFloat(document.getElementById("logAltura")?.value) || 0;
    const uLarg = parseFloat(document.getElementById("logLargura")?.value) || 0;
    const uComp =
      parseFloat(document.getElementById("logComprimento")?.value) || 0;

    const kitPeso = uPeso * kit.qty;
    const kitAlt = uAlt * kit.qty; // Altura empilhada
    const kitLarg = uLarg; // Largura preservada
    const kitComp = uComp; // Comprimento preservado

    const card = document.createElement("div");
    card.className = "kit-card";
    card.dataset.qty = kit.qty;
    card.dataset.kitId = kit.id;
    card.dataset.price = result.precoVenda.toFixed(2);

    const logisticaKitHtml = `
      <div style="padding:8px 10px; background:rgba(0,0,0,0.1); border-radius:6px; border:1px dashed var(--clr-border); display:flex; justify-content:space-between; align-items:center; align-self:start;">
        <div style="display:flex; align-items:center; gap:5px;">
          <span style="font-size:11px; display:inline-flex;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg></span>
          <span style="font-size:11px; font-weight:600; color:var(--clr-text-2);">Logística</span>
        </div>
        <div style="display:flex; gap:12px; font-size:11px; color:var(--clr-text); font-weight:500;">
          <span><strong>Peso:</strong> ${kitPeso}g</span>
          <span><strong>Dimensões:</strong> ${kitAlt} × ${kitLarg} × ${kitComp} cm</span>
        </div>
      </div>
    `;

    // O resultado do kit no Mercado Livre saiu daqui.
    //
    // Ele era uma faixa de largura inteira DENTRO do corpo do card, o
    // que empurrava os campos para baixo e deixava o card do Mercado
    // Livre bem mais alto que os das outras plataformas. Agora ele
    // ocupa a coluna da direita, no mesmo lugar do resultado das
    // demais — ver o bloco `.kit-result` logo abaixo.
    const mlPanelHtml = "";

    card.innerHTML = `
      <div class="kit-badge">${kit.qty}×<span>unidades</span></div>

      <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:8px;">

        <!-- LINHA 1: SKU | Custo Base | Frete | Logística -->
        <div class="kit-top-row-grid" style="display:grid; grid-template-columns:1fr 1fr 1fr 1.4fr; gap:10px; align-items:end;">
          <div class="field-group" style="margin:0;">
            <label data-kit-label="skuKit" style="font-size:10px; margin-bottom:3px; display:block;">SKU do Kit</label>
            <input type="text" class="input-field kit-sku-input" value="${kit.sku || ""}" data-kit-id="${kit.id}" style="font-size:12px; height:32px; padding:0 10px;" />
          </div>
          <div class="field-group" style="margin:0;">
            <label data-kit-label="custoBaseKit" style="font-size:10px; margin-bottom:3px; display:block;">Custo Base</label>
            <input type="text" class="result-field kit-custo-display" value="${formatBRL(result.custoBase)}" readonly style="font-size:12px; height:32px; padding:0 10px;" />
          </div>
          <div class="field-group" style="margin:0;">
            <label data-kit-label="freteProdutoKit" style="font-size:10px; margin-bottom:3px; display:block;">Frete do Produto</label>
            <div style="position:relative; display:flex; align-items:center;">
              <span style="position:absolute; left:10px; font-size:11px; color:var(--clr-text-3); pointer-events:none; z-index:1;">R$</span>
              <input type="text" inputmode="decimal" class="input-field kit-frete-input money-input" value="${(kit.frete !== undefined && kit.frete !== 0) ? formatMoneyBR(kit.frete) : ""}" placeholder="0,00" data-kit-id="${kit.id}" style="font-size:12px; height:32px; padding:0 10px 0 30px; width:100%;" />
            </div>
          </div>
          <div class="kit-log-dim" style="display:flex; align-items:center; gap:5px; height:32px; padding:0 8px; background:rgba(0,0,0,0.12); border-radius:6px; border:1px dashed var(--clr-border); min-width:0;">
            <span style="font-size:12px; flex-shrink:0;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;">
  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
  <line x1="12" y1="22.08" x2="12" y2="12"></line>
</svg></span>
            <span data-kit-label="dimensoesKit" style="font-size:11px; font-weight:600; color:var(--clr-text-2); flex-shrink:0; white-space:nowrap;">Dimensões</span>
            <span style="font-size:11px; font-weight:600; color:var(--clr-text-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              : ${kitPeso}g · ${kitAlt}×${kitLarg}×${kitComp}cm
            </span>
          </div>
        </div>

        <!-- LINHA 2: Taxas Adicionais (largura total, cresce para baixo) -->
        <div style="padding:8px 10px; background:var(--clr-surface-alt); border-radius:6px; border:1px dashed var(--clr-border);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span data-kit-label="taxasAdicionaisKit" style="font-size:11px; font-weight:700; color:var(--clr-text-3); text-transform:uppercase; letter-spacing:0.4px;">Taxas Adicionais</span>
            <button class="btn-adicionar-kit-campo" data-kit-id="${kit.id}" style="font-size:11px; padding:3px 10px; background:transparent; border:1px solid var(--clr-primary); color:var(--clr-primary); border-radius:4px; cursor:pointer; white-space:nowrap; flex-shrink:0;">+ Adicionar Campos</button>
          </div>
          <div class="kit-cfs-list" style="display:flex; flex-wrap:wrap; gap:6px;"></div>
        </div>

        ${mlPanelHtml}
      </div>

      ${
        isMercadoLivre
          ? `
      <div class="kit-result kit-result--ml">
        <div class="kit-ml-mini kit-ml-mini--premium">
          <span class="kit-ml-mini__tag">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            Premium
          </span>
          <span class="kit-ml-mini__val kit-ml-price-premium">R$ —</span>
          <span class="kit-ml-mini__sub">Lucro <strong class="kit-ml-lucro-premium">—</strong></span>
        </div>
        <div class="kit-ml-mini kit-ml-mini--classico">
          <span class="kit-ml-mini__tag">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"></circle></svg>
            Clássico
          </span>
          <span class="kit-ml-mini__val kit-ml-price-classico">R$ —</span>
          <span class="kit-ml-mini__sub">Lucro <strong class="kit-ml-lucro-classico">—</strong></span>
        </div>
      </div>
      `
          : `
      <div class="kit-result">
        <div class="kit-result-label">Preço de Venda</div>
        <div class="kit-result-value">${formatBRL(result.precoVenda)}</div>
        <div class="kit-result-lucro-label">Lucro</div>
        <div class="kit-lucro-display">${formatBRL(result.lucro)}</div>
      </div>
      `
      }

      <!-- Preços Extras do kit: o mínimo, o ideal e o máximo DESTE kit,
           digitados aqui (no Mercado Livre, um campo para o Premium e
           outro para o Clássico em cada nível). -->
      ${_htmlPrecosDoKit(kit)}

      <div class="kit-actions">
        <button class="btn-danger btn-remove-kit" data-kit-id="${kit.id}">✕</button>
      </div>
    `;

    _renderizarCamposLista(
      kit.camposPersonalizados,
      card.querySelector(".kit-cfs-list"),
      kit.id,
    );

    // Aplica visibilidade da logística nos kits conforme config da plataforma
    if (typeof _aplicarVisibLogisticaKits === "function") {
      const cfgLog = (typeof getCamposCfg === "function"
        ? getCamposCfg(platformId)
        : {})["__logistica__"] || {};
      _aplicarVisibLogisticaKits(!!(cfgLog.oculto), platformId);
    }

    // Aplica nomes + visibilidade dos campos do kit (SKU/Frete ocultáveis, ajusta grid)
    if (typeof _aplicarLabelsKits === "function") {
      _aplicarLabelsKits(platformId);
    }

    card
      .querySelector(".btn-adicionar-kit-campo")
      .addEventListener("click", () => _abrirModalCampoPersonalizado(kit.id));

    card.querySelector(".kit-sku-input").addEventListener("input", (e) => {
      kit.sku = e.target.value;
      _marcarAlterado();
    });

    const freteInput = card.querySelector(".kit-frete-input");
    if (freteInput) {
      freteInput.addEventListener("input", (e) => {
        kit.frete = parseFormattedValue(e.target.value);
        _marcarAlterado();
        if (isMercadoLivre) _recalcularMLKit(card, kit);
        else atualizarTodosKits();
        // O frete do kit entra na conta dos Preços Extras deste card:
        // sem esta chamada, a resposta ficava com o valor antigo.
        try { _atualizarPrecosExtrasKits(); } catch (e) { console.error("[Preços Extras] kit:", e); }
      });
      // Formata no blur (1.000,00)
      freteInput.addEventListener("blur", (e) => {
        const n = parseFormattedValue(e.target.value);
        e.target.value = n === 0 ? "" : formatMoneyBR(n);
      });
      freteInput.addEventListener("focus", (e) => {
        const n = parseFormattedValue(e.target.value);
        e.target.value = n === 0 ? "" : String(n).replace(".", ",");
      });
    }

    if (isMercadoLivre) _recalcularMLKit(card, kit);

    // Os campos de Preços Extras deste kit.
    _ligarPrecosDoKit(card);

    card.querySelector(".btn-remove-kit").addEventListener("click", () => {
      product.kits = product.kits.filter((k) => k.id !== kit.id);
      _renderAllKits();
      _marcarAlterado();
    });

    grid.appendChild(card);
  }

  function _checkKitsEmpty() {
    const grid = document.getElementById("kitsGrid");
    const empty = document.getElementById("kitsEmpty");
    const qtdKits = grid.querySelectorAll(".kit-card").length;
    const hasKits = qtdKits > 0;
    grid.style.display = hasKits ? "flex" : "none";
    empty.style.display = hasKits ? "none" : "block";
    // O título "Kits do Produto" mostra quantos há.
    const qtd = document.getElementById("kitsSecaoQtd");
    if (qtd) qtd.textContent = qtdKits === 0 ? "Nenhum kit" : qtdKits === 1 ? "1 kit" : qtdKits + " kits";
  }

  // ══════════════════════════════════════════
  //  AÇÕES GLOBAIS E SAVE
  // ══════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════
  //  PREÇOS EXTRAS
  //
  //  Responde "quanto sobra se eu vender por X?" — sem mexer na
  //  Margem Desejada nem em nenhum outro campo. É consulta, não
  //  precificação.
  //
  //  ── A CONTA ───────────────────────────────────────────────────
  //  A comissão da plataforma e o imposto são PERCENTUAIS DO PREÇO
  //  DE VENDA. Vendendo mais barato, você paga menos comissão;
  //  vendendo mais caro, paga mais. Por isso o lucro NÃO é apenas a
  //  diferença entre o preço novo e o preço calculado — tudo é
  //  refeito sobre o valor digitado:
  //
  //      lucro = preço × (1 − percentuais) − custos em reais
  //
  //  ── MERCADO LIVRE ─────────────────────────────────────────────
  //  Premium e Clássico têm comissões diferentes, e cada um pode ter o
  //  SEU preço: cada nível (mínimo, ideal e máximo) tem dois campos. O
  //  que já existia é o do Premium; o do Clássico é criado ao lado. Cada
  //  modalidade é calculada com o próprio preço e a própria comissão.
  //
  //  ── KITS ──────────────────────────────────────────────────────
  //  Cada kit tem os seus três níveis (no Mercado Livre, Premium e
  //  Clássico em cada um), com o preço do kit inteiro digitado no
  //  próprio card. Os valores ficam no kit: kit.precoMinimo,
  //  kit.precoMinimoClassico e assim por diante.
  // ═══════════════════════════════════════════════════════════════

  // ── Os três níveis ──────────────────────────────────────────────
  // É uma FUNÇÃO, e não uma `const`, de propósito.
  //
  // Esta lista é usada ao abrir um produto salvo: a populateForm roda
  // no carregamento da tela, bem antes desta linha do arquivo. Uma
  // `const` só existe depois que a sua linha executa — antes disso, lê-la
  // dá "Cannot access before initialization". Era exatamente o que
  // acontecia: os valores carregavam nos campos, mas o "Você lucra"
  // ficava vazio, e o erro ia só para o console.
  //
  // Uma declaração de função fica disponível desde o início do escopo,
  // então funciona em qualquer ordem. Pelo mesmo motivo, nada neste
  // bloco usa `const` ou `let` declarados fora das funções.
  //
  //   campo          nome do valor no produto e no kit (o do Premium, no
  //                  Mercado Livre); o do Clássico é campo + "Classico"
  //   input          o campo da unidade que já existia no HTML
  //   inputClassico  o campo do Clássico da unidade (só no Mercado Livre)
  //   saida          onde vai a resposta fora do Mercado Livre
  function _precosExtrasCfg() {
    return [
      { nivel: "min",   campo: "precoMinimo", input: "precoMinimo", inputClassico: "precoMinimoClassico", saida: "precoMinimoSaida", rotulo: "Preço Mínimo" },
      { nivel: "ideal", campo: "precoIdeal",  input: "precoIdeal",  inputClassico: "precoIdealClassico",  saida: "precoIdealSaida",  rotulo: "Preço Ideal" },
      { nivel: "max",   campo: "precoMaximo", input: "precoMaximo", inputClassico: "precoMaximoClassico", saida: "precoMaximoSaida", rotulo: "Preço Máximo" },
    ];
  }

  /** O ícone da modalidade: a estrela do Premium e o círculo do Clássico,
   *  os mesmos do painel "Valores Premium e Clássico". */
  function _iconeModalidade(modo) {
    return modo === "premium"
      ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>'
      : '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle></svg>';
  }

  /**
   * Mercado Livre: monta, na caixa de cada nível, as duas colunas —
   * Premium e Clássico — cada uma com o seu campo e a sua resposta.
   *
   * O campo que já existe no HTML é MOVIDO para a coluna do Premium (o
   * mesmo elemento, com o mesmo id: nada que já lia o campo muda). O do
   * Clássico é criado ao lado, igual a ele.
   *
   * Roda uma vez, antes de o produto ser carregado. Fora do Mercado
   * Livre não faz nada: a caixa continua com um campo só.
   */
  function _prepararPrecosExtrasML() {
    if (!isMercadoLivre) return;
    _precosExtrasCfg().forEach(function (cfg) {
      const inpPremium = document.getElementById(cfg.input);
      if (!inpPremium || document.getElementById(cfg.inputClassico)) return;
      const caixa = inpPremium.closest(".preco-extra");
      const wrapPremium = inpPremium.closest(".input-addon-wrap");
      if (!caixa || !wrapPremium) return;

      const wrapClassico = document.createElement("div");
      wrapClassico.className = "input-addon-wrap";
      wrapClassico.innerHTML =
        '<span class="input-prefix">R$</span>' +
        '<input inputmode="decimal" type="text" id="' + cfg.inputClassico + '"' +
        ' class="input-field money-input preco-extra__input" maxlength="16" placeholder="0,00" />';

      const modos = document.createElement("div");
      modos.className = "px-modos";
      modos.appendChild(_colunaModalidade("premium", "Premium", wrapPremium, cfg.input + "ResPremium"));
      modos.appendChild(_colunaModalidade("classico", "Clássico", wrapClassico, cfg.input + "ResClassico"));

      caixa.classList.add("preco-extra--ml");
      caixa.insertBefore(modos, document.getElementById(cfg.saida));

      // O rótulo do nível aponta para o Premium; cada campo diz, para
      // leitores de tela, de qual modalidade ele é.
      inpPremium.setAttribute("aria-label", cfg.rotulo + " — Premium");
      const inpClassico = document.getElementById(cfg.inputClassico);
      if (inpClassico) inpClassico.setAttribute("aria-label", cfg.rotulo + " — Clássico");
    });
  }

  /** Uma coluna de modalidade: a etiqueta, o campo e a resposta. */
  function _colunaModalidade(modo, rotulo, wrap, idResposta) {
    const col = document.createElement("div");
    col.className = "px-modo px-modo--" + modo;

    const tag = document.createElement("span");
    tag.className = "px-tag";
    tag.innerHTML = _iconeModalidade(modo) + rotulo;
    col.appendChild(tag);

    col.appendChild(wrap);

    const res = document.createElement("div");
    res.className = "px-res";
    res.id = idResposta;
    col.appendChild(res);
    return col;
  }

  // ── Preço digitado ou calculado pela margem ─────────────────────
  // Cada nível — na unidade e em cada kit — escolhe COMO o preço é dado:
  //
  //   Preço      o preço de venda é digitado (como sempre foi);
  //   Margem %   digita-se a margem desejada, em % do preço de venda;
  //   Margem R$  digita-se o lucro desejado em reais (no kit, o lucro do
  //              kit inteiro).
  //
  // Na margem, o preço é CALCULADO pelo mesmo motor do preço sugerido
  // (calcularUnidade / calcularKit). No Mercado Livre, a margem do nível
  // dá o preço do Premium e o do Clássico, cada um com a sua comissão —
  // como a Margem de Lucro da ficha dá os Valores Premium e Clássico.
  //
  // O preço calculado vai para o MESMO campo de preço (que fica só para
  // leitura) e é salvo nele: o "Você lucra" e o produto salvo continuam
  // lendo o preço de sempre.
  //
  // No produto e em cada kit, por nível (campo = precoMinimo, …):
  //   <campo>Modo    "preco" (padrão) | "pct" | "rs"
  //   <campo>Margem  o número digitado, ou null quando o campo está vazio
  // `curto`: o rótulo numa caixa estreita (janela pequena), onde os três
  // botões por extenso não cabem.
  function _modosPx() {
    return [
      { modo: "preco", rotulo: "Preço",     curto: "Preço", dica: "Digitar o preço de venda" },
      { modo: "pct",   rotulo: "Margem %",  curto: "%",     dica: "Calcular o preço por uma margem em % do preço de venda" },
      { modo: "rs",    rotulo: "Margem R$", curto: "R$",    dica: "Calcular o preço por um lucro em reais" },
    ];
  }

  /** O modo de um nível no produto ou no kit ("preco" se não houver). */
  function _modoPx(obj, cfg) {
    const m = obj ? obj[cfg.campo + "Modo"] : null;
    return m === "pct" || m === "rs" ? m : "preco";
  }

  /** A margem guardada de um nível (null quando vazia). */
  function _margemPx(obj, cfg) {
    const v = obj ? obj[cfg.campo + "Margem"] : null;
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /** O nível pelo nome curto ("min", "ideal", "max"). */
  function _cfgDoNivel(nivel) {
    return _precosExtrasCfg().find(function (c) { return c.nivel === nivel; }) || null;
  }

  /** A caixa de um nível da unidade. */
  function _caixaDoNivel(cfg) {
    const inp = document.getElementById(cfg.input);
    return inp ? inp.closest(".preco-extra") : null;
  }

  function _rotuloMargemPx(modo, ehKit) {
    if (modo === "rs") return ehKit ? "Lucro do kit" : "Lucro desejado";
    return "Margem desejada";
  }

  function _fmtMargemPx(valor, modo) {
    if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return "";
    return modo === "rs" ? formatMoneyBR(valor) : formatPercentBR(valor);
  }

  /** Os três botões do nível: Preço · Margem % · Margem R$. */
  function _htmlTipoPx(rotuloNivel, modo) {
    return (
      '<div class="px-tipo" role="group" aria-label="Como definir o ' + rotuloNivel + '">' +
        _modosPx().map(function (m) {
          const ativo = m.modo === modo;
          return '<button type="button" class="px-tipo__btn' + (ativo ? " ativo" : "") + '" data-modo="' + m.modo + '"' +
            ' aria-pressed="' + (ativo ? "true" : "false") + '" aria-label="' + m.rotulo + '" title="' + m.dica + '">' +
            '<span class="px-tipo__l">' + m.rotulo + "</span>" +
            '<span class="px-tipo__c" aria-hidden="true">' + m.curto + "</span>" +
          "</button>";
        }).join("") +
      "</div>"
    );
  }

  /**
   * A linha da margem: o rótulo, o campo (com R$ antes ou % depois) e o
   * aviso de margem impossível. Escondida no modo Preço.
   */
  function _htmlMargemPx(idInput, modo, valor, ehKit) {
    return (
      '<div class="px-margem"' + (modo === "preco" ? " hidden" : "") + ">" +
        '<label class="px-margem__rot" for="' + idInput + '">' + _rotuloMargemPx(modo, ehKit) + "</label>" +
        '<div class="input-addon-wrap px-margem__wrap">' +
          '<span class="input-prefix px-margem__pre"' + (modo === "rs" ? "" : " hidden") + ">R$</span>" +
          '<input type="text" inputmode="decimal" maxlength="16" placeholder="0,00"' +
            ' class="input-field ' + (modo === "rs" ? "money-input" : "percent-input") + ' px-margem__input"' +
            ' id="' + idInput + '" value="' + _fmtMargemPx(valor, modo) + '" />' +
          '<span class="input-suffix px-margem__suf"' + (modo === "rs" ? " hidden" : "") + ">%</span>" +
        "</div>" +
        '<div class="px-aviso" role="status" hidden></div>' +
      "</div>"
    );
  }

  /**
   * Mostra a caixa de um nível (da unidade ou de um kit) no modo dado: o
   * botão marcado, a linha da margem com o símbolo certo e os campos de
   * preço — que na margem ficam só para leitura, com o preço calculado.
   */
  function _aplicarModoNaCaixa(caixa, modo, ehKit) {
    if (!caixa) return;
    caixa.dataset.modo = modo;
    caixa.querySelectorAll(".px-tipo__btn").forEach(function (b) {
      const ativo = b.dataset.modo === modo;
      b.classList.toggle("ativo", ativo);
      b.setAttribute("aria-pressed", ativo ? "true" : "false");
    });
    const linha = caixa.querySelector(".px-margem");
    if (linha) {
      linha.hidden = modo === "preco";
      const rot = linha.querySelector(".px-margem__rot");
      if (rot) rot.textContent = _rotuloMargemPx(modo, ehKit);
      const pre = linha.querySelector(".px-margem__pre");
      const suf = linha.querySelector(".px-margem__suf");
      if (pre) pre.hidden = modo !== "rs";
      if (suf) suf.hidden = modo === "rs";
      const inp = linha.querySelector(".px-margem__input");
      if (inp) {
        // A máscara lê a classe ao sair do campo: R$ com duas casas, %
        // como foi digitado — igual à Margem de Lucro da ficha.
        inp.classList.toggle("money-input", modo === "rs");
        inp.classList.toggle("percent-input", modo !== "rs");
      }
    }
    const calculado = modo !== "preco";
    caixa.querySelectorAll(".preco-extra__input, .kp-input").forEach(function (inp) {
      inp.readOnly = calculado;
      if (calculado) inp.title = "Calculado pela margem";
      else inp.removeAttribute("title");
      const w = inp.closest(".input-addon-wrap");
      if (w) w.classList.toggle("px-calculado", calculado);
    });
    const rotPreco = caixa.querySelector(".px-preco__rot");
    if (rotPreco) rotPreco.textContent = calculado ? "Preço calculado" : "Preço de venda";
    if (!calculado) _avisoMargemPx(caixa, false);
  }

  /** O aviso da caixa quando a margem não cabe nas taxas. */
  function _avisoMargemPx(caixa, inviavel) {
    const av = caixa ? caixa.querySelector(".px-aviso") : null;
    if (!av) return;
    av.hidden = !inviavel;
    av.textContent = inviavel
      ? "Margem alta demais para as taxas desta configuração: não há preço que a alcance. Diminua a margem."
      : "";
  }

  /** O preço calculado no campo (vazio quando não há preço). */
  function _escreverPrecoCalculado(inp, v) {
    if (!inp) return;
    inp.value = v > 0 ? formatMoneyBR(v) : "";
  }

  /**
   * A margem que um preço dá hoje, para começar o modo de margem sem
   * mudar o preço: em % (fatia do preço) ou em R$ (o lucro). Sem preço,
   * ou com prejuízo, o campo começa vazio.
   */
  function _margemDoPreco(r, modo) {
    if (!r || r.inviavel || !(r.lucro >= 0)) return null;
    const v = modo === "pct" ? r.margem : r.lucro;
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  }

  /**
   * Monta, na caixa de cada nível da unidade, os botões (Preço · Margem %
   * · Margem R$) e a linha da margem. Roda uma vez, antes de o produto
   * ser carregado — depois do _prepararPrecosExtrasML, que já pôs as
   * colunas Premium e Clássico no Mercado Livre.
   *
   * O rótulo e os campos de preço são os MESMOS elementos de antes, com
   * os mesmos ids; só mudam de lugar dentro da caixa:
   *
   *     PREÇO MÍNIMO              [Preço | Margem % | Margem R$]
   *     MARGEM DESEJADA                            [   20 % ]   ← na margem
   *     PREÇO DE VENDA                             [R$ 48,11]   ← fora do ML
   *     ★ PREMIUM [R$ 48,11]  │  ● CLÁSSICO [R$ 57,42]          ← no ML
   *     Você lucra …
   */
  function _prepararModosPrecosExtras() {
    _precosExtrasCfg().forEach(function (cfg) {
      const inp = document.getElementById(cfg.input);
      const caixa = inp ? inp.closest(".preco-extra") : null;
      if (!caixa || caixa.querySelector(".px-topo")) return;

      const label = caixa.querySelector(":scope > label");
      const topo = document.createElement("div");
      topo.className = "px-topo";
      if (label) topo.appendChild(label);
      topo.insertAdjacentHTML("beforeend", _htmlTipoPx(cfg.rotulo, "preco"));
      caixa.insertBefore(topo, caixa.firstChild);
      topo.insertAdjacentHTML("afterend", _htmlMargemPx(cfg.input + "Margem", "preco", null, false));

      // Fora do Mercado Livre o campo de preço ganha uma linha própria,
      // com o rótulo "Preço de venda" ("Preço calculado" na margem).
      if (!caixa.querySelector(".px-modos")) {
        const wrap = inp.closest(".input-addon-wrap");
        if (wrap && wrap.parentNode) {
          const linha = document.createElement("div");
          linha.className = "px-preco";
          linha.innerHTML = '<span class="px-preco__rot">Preço de venda</span>';
          wrap.parentNode.insertBefore(linha, wrap);
          linha.appendChild(wrap);
        }
      }
      caixa.classList.add("px-nivel");
      caixa.dataset.modo = "preco";

      const inpMargem = document.getElementById(cfg.input + "Margem");
      if (inpMargem) {
        // Máscara primeiro, cálculo depois (o cálculo lê o valor formatado).
        _formatarInputNumerico(inpMargem);
        inpMargem.addEventListener("input", function () {
          product[cfg.campo + "Margem"] = inpMargem.value.trim() === "" ? null : parseFormattedValue(inpMargem.value);
          _atualizarUmPrecoExtra(cfg);
          _marcarAlterado();
        });
      }
      caixa.querySelectorAll(".px-tipo__btn").forEach(function (btn) {
        btn.addEventListener("click", function () { _trocarModoDaUnidade(cfg, btn.dataset.modo); });
      });
    });
  }

  /** Ao abrir o produto: o modo e a margem de cada nível da unidade. */
  function _carregarModosDaUnidade(p) {
    _precosExtrasCfg().forEach(function (cfg) {
      const caixa = _caixaDoNivel(cfg);
      if (!caixa) return;
      const modo = _modoPx(p, cfg);
      _aplicarModoNaCaixa(caixa, modo, false);
      const inp = document.getElementById(cfg.input + "Margem");
      if (inp) inp.value = _fmtMargemPx(_margemPx(p, cfg), modo);
    });
  }

  /**
   * Troca o modo de um nível da unidade. O preço que está na tela não
   * muda: indo para a margem, ela começa com a margem (ou o lucro) que
   * esse preço dá hoje — no Mercado Livre, a do Premium; voltando ao
   * Preço, o valor calculado fica no campo, pronto para ser ajustado.
   */
  function _trocarModoDaUnidade(cfg, novo) {
    const caixa = _caixaDoNivel(cfg);
    const atual = _modoPx(product, cfg);
    if (!caixa || !novo || novo === atual) return;
    if (novo !== "preco") {
      const preco = _precoDoCampo(cfg.input);
      const taxa = isMercadoLivre && document.getElementById(cfg.inputClassico) ? _taxaML("mlTaxaPremium") : null;
      product[cfg.campo + "Margem"] = _margemDoPreco(preco > 0 ? _lucroNoPreco(preco, taxa) : null, novo);
    }
    product[cfg.campo + "Modo"] = novo;
    _aplicarModoNaCaixa(caixa, novo, false);
    const inp = document.getElementById(cfg.input + "Margem");
    if (inp) inp.value = _fmtMargemPx(product[cfg.campo + "Margem"], novo);
    _atualizarUmPrecoExtra(cfg);
    _marcarAlterado();
    if (novo !== "preco" && inp) {
      try { inp.focus({ preventScroll: true }); } catch (e) {}
    }
  }

  /**
   * Na margem: calcula o preço do nível da unidade (no Mercado Livre, o
   * do Premium e o do Clássico) e o escreve no campo de preço.
   */
  function _precoDaUnidadePelaMargem(cfg, modo) {
    const m = _margemPx(product, cfg);
    let inviavel = false;
    function calc(taxa) {
      if (m === null) return 0;
      const i = getCalcInputs();
      if (taxa !== null && taxa !== undefined) i.taxa = Number(taxa) || 0;
      i.margem = m;
      i.margemTipo = modo === "pct" ? "pct" : "fixed";
      const r = calcularUnidade(i);
      if (r.inviavel) {
        if (r.motivo === "percentual") inviavel = true;
        return 0;
      }
      return r.precoVenda;
    }
    if (isMercadoLivre && document.getElementById(cfg.inputClassico)) {
      _escreverPrecoCalculado(document.getElementById(cfg.input), calc(_taxaML("mlTaxaPremium")));
      _escreverPrecoCalculado(document.getElementById(cfg.inputClassico), calc(_taxaML("mlTaxaClassico")));
    } else {
      _escreverPrecoCalculado(document.getElementById(cfg.input), calc(null));
    }
    _avisoMargemPx(_caixaDoNivel(cfg), inviavel);
  }

  /**
   * Lucro ao vender a UNIDADE por `preco`.
   *
   * A conta mora no calculadora.js (lucroNoPreco), junto do motor que
   * calcula o preço sugerido. Aqui só se escolhe a taxa: no Mercado Livre
   * cada modalidade tem a sua, nas demais vale a do campo comum.
   */
  function _lucroNoPreco(preco, taxaPct) {
    const i = getCalcInputs();
    if (taxaPct !== undefined && taxaPct !== null) i.taxa = Number(taxaPct) || 0;
    return lucroNoPreco(i, preco);
  }

  function _fmtPct(v) {
    return (Math.round(v * 10) / 10).toFixed(1).replace(".", ",") + "%";
  }

  /** O valor digitado num campo de preço, como número (0 se vazio). */
  function _precoDoCampo(id) {
    const el = document.getElementById(id);
    return el ? _parseMoneyBR(el.value) : 0;
  }

  /**
   * Escreve a resposta de UM preço em `el`.
   *
   * Sem valor digitado, a área fica vazia (e escondida pelo CSS): uma
   * linha fixa dizendo "R$ 0,00" só ocuparia espaço. `calcular` recebe o
   * preço e devolve o resultado do lucroNoPreco.
   */
  function _pintarResultado(el, preco, calcular, tipo) {
    if (!el) return;
    if (!preco || preco <= 0) {
      el.innerHTML = "";
      el.classList.remove("tem-valor");
      return;
    }
    el.innerHTML = _resultadoPx(calcular(preco), tipo);
    el.classList.add("tem-valor");
  }

  /**
   * A unidade em que a resposta destaca o lucro: a do modo do nível (na
   * Margem %, em %; na Margem R$, em reais). No modo Preço, null — vale a
   * Margem de Lucro da ficha.
   */
  function _tipoDaResposta(modo) {
    if (modo === "pct") return "pct";
    if (modo === "rs") return "fixed";
    return null;
  }

  /** Redesenha a resposta de um dos três níveis da unidade. */
  function _atualizarUmPrecoExtra(cfg) {
    const out = document.getElementById(cfg.saida);

    // Na margem, o preço é calculado ANTES da resposta, que lê o campo.
    const modo = _modoPx(product, cfg);
    if (modo !== "preco") _precoDaUnidadePelaMargem(cfg, modo);
    else _avisoMargemPx(_caixaDoNivel(cfg), false);
    const tipo = _tipoDaResposta(modo);

    // Mercado Livre: cada modalidade com o SEU preço e a SUA comissão.
    if (isMercadoLivre && document.getElementById(cfg.inputClassico)) {
      const tp = _taxaML("mlTaxaPremium");
      const tc = _taxaML("mlTaxaClassico");
      _pintarResultado(document.getElementById(cfg.input + "ResPremium"),
        _precoDoCampo(cfg.input), function (p) { return _lucroNoPreco(p, tp); }, tipo);
      _pintarResultado(document.getElementById(cfg.input + "ResClassico"),
        _precoDoCampo(cfg.inputClassico), function (p) { return _lucroNoPreco(p, tc); }, tipo);
      // A área de resposta única não é usada aqui: cada coluna tem a sua.
      if (out) {
        out.className = "preco-extra__saida";
        out.innerHTML = "";
      }
      return;
    }

    // Demais plataformas: um preço, uma resposta.
    if (!out) return;
    out.classList.add("px-res");
    _pintarResultado(out, _precoDoCampo(cfg.input), function (p) { return _lucroNoPreco(p); }, tipo);
  }

  /**
   * O lucro na unidade em que você está pensando.
   *
   * Em %   → "Você lucra 27,5%",  e R$ 15,30 ao lado, em cinza.
   * Em R$  → "Você lucra R$ 15,30", e 27,5% ao lado, em cinza.
   *
   * O lucro de uma venda por X é um só — o mesmo dinheiro entrando e
   * saindo. Muda só COMO ele é mostrado: na unidade da margem do nível
   * (Margem % ou Margem R$) ou, no modo Preço, na da Margem de Lucro da
   * ficha. Os dois números continuam na tela: só trocam de lugar.
   */
  function _lucroNaUnidadeDaMargem(r, tipo) {
    const emPct = (tipo || getCalcInputs().margemTipo) === "pct";
    const emReais = formatBRL(Math.abs(r.lucro));
    const emPorcento = _fmtPct(Math.abs(r.margem));
    return emPct
      ? { destaque: emPorcento, apoio: emReais }
      : { destaque: emReais, apoio: emPorcento };
  }

  /**
   * A resposta de um preço — a mesma na unidade e nos kits, no Mercado
   * Livre e nas demais plataformas:
   *
   *     Você lucra R$ 15,30  27,5%
   *
   * (A linha de comparação com a margem desejada — "R$ 5,71 a mais que a
   * margem desejada" — saiu, na unidade e nos kits.)
   *
   * Cada modalidade tem a sua coluna, então o texto pode ocupar duas
   * linhas quando a coluna aperta, em vez de encolher a fonte.
   */
  function _resultadoPx(r, tipo) {
    const positivo = r.lucro >= 0;
    const u = _lucroNaUnidadeDaMargem(r, tipo);
    return (
      // Prejuízo é informação crítica: muda a palavra e a cor, para não
      // passar despercebido como "lucro negativo".
      '<div class="px-linha ' + (positivo ? "px-ok" : "px-perda") + '">' +
        '<span class="px-txt">' + (positivo ? "Você lucra " : "Você perde ") +
          "<strong>" + u.destaque + "</strong></span>" +
        '<span class="px-apoio">' + u.apoio + "</span>" +
      "</div>"
    );
  }

  /** Atualiza as respostas da unidade e as de todos os kits. */
  function _atualizarPrecosExtras() {
    _precosExtrasCfg().forEach(_atualizarUmPrecoExtra);
    _atualizarPrecosExtrasKits();
  }

  // ── Kits ────────────────────────────────────────────────────────

  /** O kit atual com esse id, lido na hora em product.kits. */
  function _kitAtual(id) {
    if (!Array.isArray(product.kits)) return null;
    return product.kits.find(function (k) { return k && String(k.id) === String(id); }) || null;
  }

  /**
   * O HTML dos Preços Extras dentro do card de um kit.
   *
   * Os ids dos campos (para o rótulo apontar para eles) vêm de um
   * contador, e não do id do kit: assim não dependem do formato do id.
   */
  function _htmlPrecosDoKit(kit) {
    _htmlPrecosDoKit.seq = (_htmlPrecosDoKit.seq || 0) + 1;
    const base = "kp" + _htmlPrecosDoKit.seq + "-";
    const qtd = parseInt(kit.qty, 10) || 1;

    function valor(campo) {
      const n = Number(kit[campo]);
      return n > 0 ? formatMoneyBR(n) : "";
    }
    function campoHtml(campo, id, rotuloAria) {
      return (
        '<div class="input-addon-wrap">' +
          '<span class="input-prefix">R$</span>' +
          '<input type="text" inputmode="decimal" maxlength="16" placeholder="0,00"' +
            ' class="input-field money-input kp-input"' +
            ' id="' + id + '" data-campo="' + campo + '" value="' + valor(campo) + '"' +
            (rotuloAria ? ' aria-label="' + rotuloAria + '"' : "") + " />" +
        "</div>"
      );
    }
    function colunaHtml(modo, rotulo, campo, id, rotuloAria) {
      return (
        '<div class="px-modo px-modo--' + modo + '">' +
          '<span class="px-tag">' + _iconeModalidade(modo) + rotulo + "</span>" +
          campoHtml(campo, id, rotuloAria) +
          '<div class="px-res" data-campo="' + campo + '"></div>' +
        "</div>"
      );
    }

    const niveis = _precosExtrasCfg().map(function (cfg) {
      const id = base + cfg.campo;
      const modo = _modoPx(kit, cfg);
      // O topo (título e os botões Preço · Margem % · Margem R$) e a linha
      // da margem — os mesmos da unidade.
      const topo =
        '<div class="px-topo">' +
          '<label class="kp-tit" for="' + id + '">' + cfg.rotulo + "</label>" +
          _htmlTipoPx(cfg.rotulo + " do kit", modo) +
        "</div>" +
        _htmlMargemPx(id + "Margem", modo, _margemPx(kit, cfg), true);
      if (isMercadoLivre) {
        const campoC = cfg.campo + "Classico";
        return (
          '<div class="kp-nivel kp-nivel--ml px-nivel" data-nivel="' + cfg.nivel + '" data-modo="' + modo + '">' +
            topo +
            '<div class="px-modos">' +
              colunaHtml("premium", "Premium", cfg.campo, id, cfg.rotulo + " do kit — Premium") +
              colunaHtml("classico", "Clássico", campoC, base + campoC, cfg.rotulo + " do kit — Clássico") +
            "</div>" +
          "</div>"
        );
      }
      return (
        '<div class="kp-nivel px-nivel" data-nivel="' + cfg.nivel + '" data-modo="' + modo + '">' +
          topo +
          '<div class="px-preco">' +
            '<span class="px-preco__rot">' + (modo === "preco" ? "Preço de venda" : "Preço calculado") + "</span>" +
            campoHtml(cfg.campo, id, "") +
          "</div>" +
          '<div class="px-res" data-campo="' + cfg.campo + '"></div>' +
        "</div>"
      );
    }).join("");

    return (
      '<div class="kit-precos">' +
        '<div class="kit-precos__cab">' +
          '<span class="kit-precos__tit">Preços Extras do Kit</span>' +
          '<span class="kit-precos__dica">Valor de venda do kit inteiro (' + qtd + " unidades)</span>" +
        "</div>" +
        '<div class="kit-precos__grade">' + niveis + "</div>" +
      "</div>"
    );
  }

  /**
   * Liga os campos de Preços Extras de um card de kit.
   *
   * O kit é procurado pelo id NA HORA de cada tecla, e não guardado
   * quando o card é montado: o valor tem de ir para o kit que está em
   * product.kits naquele momento.
   */
  function _ligarPrecosDoKit(card) {
    card.querySelectorAll(".kit-precos .kp-input").forEach(function (inp) {
      // Máscara primeiro, cálculo depois — como nos demais campos: o
      // cálculo precisa ler o valor JÁ formatado.
      _formatarInputNumerico(inp);
      inp.addEventListener("input", function () {
        const kit = _kitAtual(card.dataset.kitId);
        if (!kit) return;
        kit[inp.dataset.campo] = _parseMoneyBR(inp.value);
        _marcarAlterado();
        try { _atualizarPrecosExtrasDoKit(card, kit); } catch (e) { console.error("[Preços Extras] kit:", e); }
      });
    });

    // Preço · Margem % · Margem R$, em cada nível do kit.
    card.querySelectorAll(".kit-precos .kp-nivel").forEach(function (nivelEl) {
      const cfg = _cfgDoNivel(nivelEl.dataset.nivel);
      if (!cfg) return;
      _aplicarModoNaCaixa(nivelEl, _modoPx(_kitAtual(card.dataset.kitId), cfg), true);
      const inpM = nivelEl.querySelector(".px-margem__input");
      if (inpM) {
        _formatarInputNumerico(inpM);
        inpM.addEventListener("input", function () {
          const kit = _kitAtual(card.dataset.kitId);
          if (!kit) return;
          kit[cfg.campo + "Margem"] = inpM.value.trim() === "" ? null : parseFormattedValue(inpM.value);
          _marcarAlterado();
          try { _atualizarPrecosExtrasDoKit(card, kit); } catch (e) { console.error("[Preços Extras] kit:", e); }
        });
      }
      nivelEl.querySelectorAll(".px-tipo__btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          try { _trocarModoDoKit(card, nivelEl, cfg, btn.dataset.modo); }
          catch (e) { console.error("[Preços Extras] kit:", e); }
        });
      });
    });
  }

  /** A quantidade, o frete, os campos próprios e as taxas de um kit. */
  function _contextoDoKit(card, kit) {
    return {
      qtd: parseInt(kit.qty, 10) || 1,
      frete: Number(kit.frete) || 0,
      // Os campos personalizados DESTE kit — a mesma leitura que o preço
      // do kit usa.
      extras: (typeof extractCustomFields === "function") ? extractCustomFields(card) : null,
      tp: isMercadoLivre ? _taxaML("mlTaxaPremium") : null,
      tc: isMercadoLivre ? _taxaML("mlTaxaClassico") : null,
    };
  }

  /**
   * Troca o modo de um nível do kit — como na unidade, sem mudar o preço
   * que está na tela. Na Margem R$, o valor é o lucro do kit inteiro.
   */
  function _trocarModoDoKit(card, nivelEl, cfg, novo) {
    const kit = _kitAtual(card.dataset.kitId);
    if (!kit || !novo) return;
    const atual = _modoPx(kit, cfg);
    if (novo === atual) return;
    if (novo !== "preco") {
      const inpP = nivelEl.querySelector('.kp-input[data-campo="' + cfg.campo + '"]');
      const preco = inpP ? _parseMoneyBR(inpP.value) : 0;
      const c = _contextoDoKit(card, kit);
      kit[cfg.campo + "Margem"] = _margemDoPreco(
        preco > 0 ? _lucroKit(preco, c.qtd, c.frete, isMercadoLivre ? c.tp : null, c.extras) : null, novo);
    }
    kit[cfg.campo + "Modo"] = novo;
    _aplicarModoNaCaixa(nivelEl, novo, true);
    const inpM = nivelEl.querySelector(".px-margem__input");
    if (inpM) inpM.value = _fmtMargemPx(kit[cfg.campo + "Margem"], novo);
    _marcarAlterado();
    _atualizarPrecosExtrasDoKit(card, kit);
    if (novo !== "preco" && inpM) {
      try { inpM.focus({ preventScroll: true }); } catch (e) {}
    }
  }

  /**
   * Na margem: calcula os preços dos níveis do kit (no Mercado Livre, o
   * do Premium e o do Clássico), guarda no kit e escreve nos campos.
   */
  function _precosDoKitPelaMargem(card, kit, c) {
    _precosExtrasCfg().forEach(function (cfg) {
      const nivelEl = card.querySelector('.kit-precos .kp-nivel[data-nivel="' + cfg.nivel + '"]');
      const modo = _modoPx(kit, cfg);
      if (modo === "preco") { _avisoMargemPx(nivelEl, false); return; }
      const m = _margemPx(kit, cfg);
      let inviavel = false;
      function calc(taxa) {
        if (m === null) return 0;
        const i = getCalcInputs();
        if (taxa !== null && taxa !== undefined) i.taxa = Number(taxa) || 0;
        i.margemTipo = modo === "pct" ? "pct" : "fixed";
        // Margem R$ = o lucro do kit INTEIRO. O motor multiplica a margem
        // em reais pela quantidade, então ela entra dividida.
        i.margem = modo === "pct" ? m : m / Math.max(1, c.qtd);
        const r = calcularKit(i, c.qtd, c.frete, c.extras);
        if (r.inviavel) {
          if (r.motivo === "percentual") inviavel = true;
          return 0;
        }
        return r.precoVenda;
      }
      const campos = isMercadoLivre
        ? [[cfg.campo, c.tp], [cfg.campo + "Classico", c.tc]]
        : [[cfg.campo, null]];
      campos.forEach(function (par) {
        const v = calc(par[1]);
        // Em centavos, como o campo mostra (e como a unidade é salva).
        kit[par[0]] = v > 0 ? Math.round(v * 100) / 100 : 0;
        _escreverPrecoCalculado(card.querySelector('.kit-precos .kp-input[data-campo="' + par[0] + '"]'), v);
      });
      _avisoMargemPx(nivelEl, inviavel);
    });
  }

  /** Recalcula as respostas de todos os kits na tela. */
  function _atualizarPrecosExtrasKits() {
    if (!Array.isArray(product.kits) || !product.kits.length) return;
    document.querySelectorAll(".kit-card[data-kit-id]").forEach(function (card) {
      const kit = _kitAtual(card.dataset.kitId);
      if (kit) _atualizarPrecosExtrasDoKit(card, kit);
    });
  }

  /**
   * As respostas de UM kit: cada preço digitado nele, com a quantidade,
   * o frete próprio e os campos personalizados do kit. No Mercado Livre,
   * o campo do Premium usa a comissão do Premium, e o do Clássico a do
   * Clássico.
   *
   * Só as respostas são reescritas — os campos não são recriados, e quem
   * está digitando não perde o cursor.
   */
  function _atualizarPrecosExtrasDoKit(card, kit) {
    if (!card || !kit) return;
    const qtd = parseInt(kit.qty, 10) || 1;
    const freteKit = Number(kit.frete) || 0;
    // Os campos personalizados DESTE kit — a mesma leitura que o preço
    // do kit usa. Sem eles, o lucro saía maior que o real.
    const extrasDoKit = (typeof extractCustomFields === "function")
      ? extractCustomFields(card) : null;
    const tp = isMercadoLivre ? _taxaML("mlTaxaPremium") : null;
    const tc = isMercadoLivre ? _taxaML("mlTaxaClassico") : null;

    // Na margem, os preços são calculados ANTES das respostas, que leem
    // os campos.
    _precosDoKitPelaMargem(card, kit, { qtd: qtd, frete: freteKit, extras: extrasDoKit, tp: tp, tc: tc });

    card.querySelectorAll(".kit-precos .px-res[data-campo]").forEach(function (res) {
      const campo = res.dataset.campo;
      const inp = card.querySelector('.kit-precos .kp-input[data-campo="' + campo + '"]');
      const taxa = isMercadoLivre ? (/Classico$/.test(campo) ? tc : tp) : null;
      const nivelEl = res.closest(".kp-nivel");
      const cfg = nivelEl ? _cfgDoNivel(nivelEl.dataset.nivel) : null;
      _pintarResultado(res, inp ? _parseMoneyBR(inp.value) : 0, function (p) {
        return _lucroKit(p, qtd, freteKit, taxa, extrasDoKit);
      }, cfg ? _tipoDaResposta(_modoPx(kit, cfg)) : null);
    });
  }

  /**
   * Lucro de um KIT vendido por `precoKit`.
   *
   * Recebe os campos personalizados do próprio kit (`extras`): antes eles
   * ficavam de fora, e um kit com "Taxa do kit" mostrava lucro maior do
   * que o real.
   */
  function _lucroKit(precoKit, qtd, freteKit, taxaPct, extras) {
    const i = getCalcInputs();
    if (taxaPct !== undefined && taxaPct !== null) i.taxa = Number(taxaPct) || 0;
    return lucroNoPreco(i, precoKit, { qty: qtd, frete: freteKit, extras: extras || null });
  }

  /** Converte "1.234,56" em 1234.56. */
  function _parseMoneyBR(txt) {
    if (txt === undefined || txt === null) return 0;
    const limpo = String(txt).trim().replace(/\./g, "").replace(",", ".");
    const n = parseFloat(limpo);
    return Number.isFinite(n) ? n : 0;
  }

  // ═══════════════════════════════════════════════════════════════
  //  BOTÃO ÚNICO "+ ADICIONAR CAMPOS"
  //
  //  Fica no cabeçalho de "Identificação do Produto", ao lado do
  //  "Configurar Campos". Reúne os três botões que antes ficavam
  //  espalhados — um por seção.
  //
  //  O modal tem DUAS etapas:
  //    1. escolher a área;
  //    2. o formulário que aquela área já usava, sem mudança nenhuma.
  //
  //  Por que delegar em vez de reescrever: cada área tem regras
  //  próprias (a de identificação é campo de texto, as outras são
  //  valores com tipo e base de cálculo). Reimplementar isso aqui
  //  duplicaria a lógica e as duas cópias divergiriam na primeira
  //  correção. O botão novo só chama a função que já existe.
  //
  //  Os KITS mantêm o botão próprio, como combinado: o campo de kit
  //  pertence àquele kit, e escolher qual kit dentro deste modal seria
  //  um passo a mais para uma ação que já está no lugar certo.
  // ═══════════════════════════════════════════════════════════════

  const AREAS_CAMPOS = [
    { id: "identificacao", nome: "Identificação do Produto",
      desc: "Campos de texto: código interno, fornecedor, observações.",
      acao: function () { _abrirModalCampoTexto(); } },
    { id: "custo", nome: "Formação do Custo Total",
      desc: "Valores que entram no custo do produto.",
      acao: function () { _abrirModalCampoPersonalizado(null, "custo"); } },
    { id: "venda", nome: "Variáveis de Venda & Plataforma",
      desc: "Taxas e descontos aplicados sobre a venda.",
      acao: function () { _abrirModalCampoPersonalizado(null, "venda"); } },
  ];

  function _abrirEscolhaDeArea() {
    _abrirEscolhaGenerica({
      titulo: "Adicionar campo personalizado",
      pergunta: "Em qual área o campo deve aparecer?",
      areas: AREAS_CAMPOS,
      aoEscolher: function (area) { area.acao(); },
    });
  }

  /**
   * Põe o botão único no cabeçalho da Identificação e esconde os três
   * botões por seção.
   *
   * Os antigos são ESCONDIDOS, não removidos: o restante do código
   * ainda os referencia (o campos.js tem uma preferência para ocultá-
   * los, e há listeners presos neles). Tirá-los do DOM quebraria isso.
   */
  /**
   * Escolha de área para o "Configurar Campos".
   *
   * Mesma ideia do "+ Adicionar Campos": uma pergunta antes, e depois
   * o painel que aquela seção já abria. O `abrirModalCampos` do
   * campos.js recebe a lista de seções — então basta passar a
   * escolhida, sem reimplementar nada.
   */
  const AREAS_CONFIG = [
    { id: "identificacao", nome: "Identificação do Produto",
      desc: "Renomear ou ocultar os campos de identificação." },
    { id: "custo", nome: "Formação do Custo Total",
      desc: "Renomear ou ocultar os campos que formam o custo." },
    { id: "venda", nome: "Variáveis de Venda & Plataforma",
      desc: "Renomear ou ocultar as taxas e variáveis de venda." },
    { id: "margem", nome: "Margem de Lucro",
      desc: "Renomear ou ocultar os campos de margem." },
    // A área inteira: ao ocultar, some também dos cards de kit (ver o
    // "__precosExtras__" no campos.js).
    { id: "precosExtras", nome: "Preços Extras",
      desc: "Mostrar ou ocultar a área — também nos cards de kit." },
  ];

  function _abrirEscolhaConfigurar() {
    if (typeof abrirModalCampos !== "function") {
      showToast("Configuração de campos indisponível.", "error");
      return;
    }
    _abrirEscolhaGenerica({
      titulo: "Configurar campos",
      pergunta: "Qual área você quer configurar?",
      areas: AREAS_CONFIG,
      aoEscolher: function (area) { abrirModalCampos(platformId, [area.id]); },
    });
  }

  /**
   * Modal de escolha reaproveitado pelos dois botões.
   *
   * Era código repetido entre "+ Adicionar Campos" e "Configurar
   * Campos"; com um só, os dois se comportam igual e uma correção
   * vale para ambos.
   */
  function _abrirEscolhaGenerica(cfg) {
    const fundo = document.createElement("div");
    fundo.className = "modal-overlay escolha-area";
    fundo.innerHTML =
      '<div class="modal escolha-area__modal">' +
        '<div class="modal-header">' +
          "<h3>" + cfg.titulo + "</h3>" +
          '<button type="button" class="modal-close" id="eaFechar" aria-label="Fechar">&times;</button>' +
        "</div>" +
        '<p class="escolha-area__sub">' + cfg.pergunta + "</p>" +
        '<div class="escolha-area__lista">' +
          cfg.areas.map(function (a) {
            return '<button type="button" class="escolha-area__item" data-area="' + a.id + '">' +
              '<span class="escolha-area__nome">' + a.nome + "</span>" +
              '<span class="escolha-area__desc">' + a.desc + "</span>" +
            "</button>";
          }).join("") +
        "</div>" +
      "</div>";
    document.body.appendChild(fundo);

    const fechar = function () {
      fundo.remove();
      document.removeEventListener("keydown", aoTeclar, true);
    };
    function aoTeclar(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(); }
    }
    document.addEventListener("keydown", aoTeclar, true);

    fundo.querySelector("#eaFechar").addEventListener("click", fechar);
    fundo.addEventListener("mousedown", function (e) {
      if (e.target === fundo) fechar();
    });

    fundo.querySelectorAll(".escolha-area__item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const area = cfg.areas.find(function (a) { return a.id === btn.dataset.area; });
        fechar();
        if (!area) return;
        try { cfg.aoEscolher(area); }
        catch (e) {
          console.error("[Campos] falha ao abrir a área " + area.id + ":", e);
          showToast("Não foi possível abrir este formulário.", "error");
        }
      });
    });

    setTimeout(function () {
      const primeiro = fundo.querySelector(".escolha-area__item");
      if (primeiro) try { primeiro.focus(); } catch (e) {}
    }, 50);
  }

  function _montarBotaoUnicoDeCampos() {
    const titulo =
      document.querySelector('.card-title[data-secao="identificacao"]') ||
      Array.from(document.querySelectorAll(".card-title"))
        .find(function (el) { return el.textContent.includes("Identificação do Produto"); });
    if (!titulo) return;

    // Chamada muitas vezes pelo observador: cada etapa abaixo é
    // idempotente, e a função sai cedo quando já não há o que fazer.
    if (titulo.querySelector(".btn-add-campos-unico")) {
      _religarConfigurar(titulo);
      _esconderBotoesDeSecao();
      return;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-add-campos-unico";
    btn.textContent = "+ Adicionar Campos";
    btn.addEventListener("click", _abrirEscolhaDeArea);

    titulo.style.display = "flex";
    titulo.style.alignItems = "center";

    // Os dois botões ficam lado a lado, no mesmo formato.
    const configurar = titulo.querySelector(".btn-editar-campos");
    if (configurar) titulo.insertBefore(btn, configurar);
    else titulo.appendChild(btn);

    // O "Configurar Campos" do topo passa a perguntar a ÁREA antes,
    // como o botão de adicionar. Antes ele abria direto a configuração
    // da identificação, e as outras seções tinham botão próprio.
    //
    // O listener original é substituído clonando o elemento: é o jeito
    // de remover um listener anônimo que não guardamos referência.
    _religarConfigurar(titulo);
    _esconderBotoesDeSecao();
  }

  /**
   * Faz o "Configurar Campos" do topo perguntar a ÁREA antes de abrir.
   * Sem isto ele abriria direto a configuração da identificação.
   *
   * O listener original é trocado clonando o elemento — é o jeito de
   * remover um listener anônimo do qual não guardamos referência.
   */
  function _religarConfigurar(titulo) {
    const configurar = titulo.querySelector(".btn-editar-campos");
    if (!configurar || configurar.dataset.unificado === "1") return;
    const novoConf = configurar.cloneNode(true);
    novoConf.dataset.unificado = "1";
    novoConf.addEventListener("click", _abrirEscolhaConfigurar);
    configurar.replaceWith(novoConf);
  }

  /**
   * Esconde os botões por seção. Ficam no DOM, não são removidos:
   * outras partes do código ainda os referenciam.
   *
   * O dos KITS permanece visível — o campo de kit pertence àquele kit,
   * e escolher qual kit dentro do modal do topo seria um passo a mais
   * para uma ação que já está no lugar certo.
   */
  function _esconderBotoesDeSecao() {
    ["btnAddIdentField", "btnAddCustoField", "btnAddVendaField"].forEach(function (id) {
      const antigo = document.getElementById(id);
      if (antigo) antigo.style.display = "none";
    });
    document.querySelectorAll(".calc-section-header[data-secao] .btn-editar-campos")
      .forEach(function (b) { b.style.display = "none"; });
  }

  function _recalcularTudo() {
    // A unidade. Esta função já atualiza os cards de kit COMUNS, porque
    // termina chamando atualizarTodosKits().
    atualizarResultadoUnidade();

    if (isMercadoLivre) {
      // No Mercado Livre o card do kit não é o comum: ele é substituído
      // pelo painel Premium / Clássico, que o atualizarTodosKits não
      // conhece. Precisa desta chamada própria.
      //
      // Faltava exatamente isto: mudar o custo ou a margem atualizava o
      // painel da unidade, mas os preços dos KITS ficavam congelados no
      // valor antigo. Os campos de taxa do ML já chamavam as duas
      // funções; o resto da tela chamava só a primeira — e o kit só
      // acertava ao mexer justamente numa dessas taxas.
      _recalcularML();
      _recalcularMLTodosKits();
    }

    // Os Preços Extras dependem do custo e das taxas, então vêm por
    // último. Fica FORA do if: vale para todas as plataformas.
    //
    // O try existe porque isto é uma CONSULTA: uma falha aqui não pode
    // impedir o recálculo do preço, que é o que a tela precisa fazer.
    try {
      _atualizarPrecosExtras();
    } catch (e) {
      console.error("[Preços Extras] falha ao atualizar:", e);
    }
  }

  // Ocultar ou mostrar um campo muda o resultado: campo oculto sai da conta
  // (o getCalcInputs ignora quem tem data-campo-oculto="1"). O campos.js
  // avisa por evento quando termina de aplicar a configuração, e aqui a tela
  // se atualiza na hora.
  //
  // Antes disso o "Custo Total da Unidade" só acertava depois de recarregar
  // a página ou de mexer em outro campo — o número na tela ficava mentindo.
  //
  // Os kits também são refeitos, porque cada um recalcula sobre o custo da
  // unidade. E NÃO chamamos _marcarAlterado(): mudar a visibilidade de um
  // campo é preferência de exibição, não edição do produto.
  document.addEventListener("precifiq:campos-aplicados", function () {
    _recalcularTudo();
    if (typeof _recalcularMLTodosKits === "function") _recalcularMLTodosKits();
  });

  // Campos que, ao serem digitados, disparam o recálculo do preço.
  //
  // IPI, DIFAL, ST e Alíquota ENTRAM no cálculo (a _custoTotalUnidade do
  // calculadora.js soma os quatro no Custo Total da Unidade), mas estavam
  // fora desta lista — então nenhum listener era ligado a eles. Digitar o
  // IPI não disparava nada: o valor só passava a contar por carona, quando
  // o usuário mexia depois em algum dos outros campos. Se o imposto fosse o
  // último campo preenchido, o preço ficava parado.
  const CALC_IDS = [
    "custoCusto",
    "custoEmbalagem",
    "custoEtiqueta",
    "custoFrete",
    "custoIpi",
    "custoDifal",
    "custoSt",
    "custoAliquota",
    "freteProduto",
    "taxaFixa",
    "impostoNF",
    "taxaPlataforma",
    "margemValor",
  ];

  // Aplica máscara e formatação aos inputs de valor.
  // O modo é lido DINAMICAMENTE a cada evento (a classe pode mudar em runtime,
  // ex: o campo Margem alterna entre money-input e percent-input).
  function _formatarInputNumerico(el) {
    if (!el) return;

    function _modoAtual() {
      if (el.classList.contains("percent-input")) return "percent";
      if (el.classList.contains("margem-input")) return "margem";
      return "money"; // money-input ou default
    }

    // ── MÁSCARA AO DIGITAR (da direita para a esquerda) ────────────────
    // O número se forma pelos centavos, como numa maquininha:
    //   1        → 0,01
    //   12       → 0,12
    //   1265     → 12,65
    //   126500   → 1.265,00
    //
    // Antes o campo só filtrava caracteres enquanto se digitava e formatava
    // ao sair. Quem digitasse "1265" via "1265" na tela e só descobria que
    // virou "1.265,00" depois — ou pior, digitava a vírgula por conta e o
    // valor saía diferente do esperado.
    //
    // O limite de dígitos continua: sem ele, colar um código de barras
    // estouraria o MAX_SAFE_INTEGER no parse e viraria um valor sem sentido.
    const MAX_DIGITOS = 15;

    function _mascaraCentavos(texto) {
      var d = String(texto).replace(/\D/g, "");
      // Zeros à esquerda não somam nada e atrapalhariam o limite.
      d = d.replace(/^0+(?=\d)/, "");
      if (d === "") return "";
      if (d.length > MAX_DIGITOS) d = d.slice(0, MAX_DIGITOS);
      while (d.length < 3) d = "0" + d; // garante ao menos "0,0X"
      var inteiros = d.slice(0, -2);
      var centavos = d.slice(-2);
      // Ponto de milhar a cada três casas.
      inteiros = inteiros.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      return inteiros + "," + centavos;
    }

    el.addEventListener("input", () => {
      var antes = el.value;
      var depois = _mascaraCentavos(antes);
      if (depois === antes) return;
      el.value = depois;
      // O cursor vai para o fim: a máscara cresce sempre pela direita, então
      // mantê-lo no meio faria o próximo dígito entrar no lugar errado.
      try {
        var fim = el.value.length;
        el.setSelectionRange(fim, fim);
      } catch (e) {
        // Alguns tipos de input não aceitam setSelectionRange. Sem isso o
        // cursor pode ficar no início, mas o valor continua correto.
      }
    });

    // Ao sair do campo: normaliza o que restou (ex.: valor colado).
    el.addEventListener("blur", () => {
      if (el.value.trim() === "") {
        el.value = "";
        return;
      }
      const num = parseFormattedValue(el.value);
      const modo = _modoAtual();
      if (modo === "percent") {
        el.value = formatPercentBR(num); // mantém como digitado
      } else {
        el.value = formatMoneyBR(num); // 2 casas: 20,00 / 0,90 / 1.000,00
      }
    });

    // Ao focar, o conteúdo é mantido como está: apagá-lo ou "cruzar" o número
    // brigaria com a máscara acima, que reconstrói o valor a cada tecla.
    // Para trocar o valor, o usuário seleciona tudo e digita por cima.
    el.addEventListener("focus", () => {
      try {
        var fim = el.value.length;
        el.setSelectionRange(fim, fim);
      } catch (e) {}
    });
  }

  CALC_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      // A MÁSCARA É LIGADA PRIMEIRO, e só depois o recálculo.
      //
      // Os dois escutam "input" e rodam na ordem em que foram registrados.
      // Com o recálculo antes, ele lia o valor AINDA NÃO formatado e
      // calculava com o número da tecla anterior:
      //
      //   digita 1  → campo vira "0,01", mas o cálculo usou 1
      //   digita 0  → campo vira "0,10", mas o cálculo usou 0,01
      //   digita 00 → campo vira "10,00", mas o cálculo usou 1,00
      //
      // O resultado ficava sempre uma tecla atrasado — e só "consertava"
      // ao alternar % / R$ Fixo, porque essa troca recalcula com o valor
      // já formatado. Invertendo a ordem, o cálculo passa a ler o valor
      // final do campo.
      _formatarInputNumerico(el);
      el.addEventListener("input", () => {
        _recalcularTudo();
        _marcarAlterado();
      });
    }
  });

  // ── Os campos de Preços Extras da unidade ──
  // Máscara primeiro, cálculo depois — pela mesma razão dos demais
  // campos: o cálculo precisa ler o valor JÁ formatado, senão usa o
  // número de uma tecla atrás.
  //
  // No Mercado Livre cada nível tem também o campo do Clássico; fora
  // dele esse campo não existe e é simplesmente pulado. Os kits têm os
  // próprios campos e não dependem destes: só a unidade é refeita.
  _precosExtrasCfg().forEach(function (cfg) {
    [cfg.input, cfg.inputClassico].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      _formatarInputNumerico(el);
      el.addEventListener("input", function () {
        _atualizarUmPrecoExtra(cfg);
        _marcarAlterado();
      });
    });
  });

  document
    .getElementById("btnMargemPct")
    .addEventListener("click", () => _aplicarMargemTipo("pct", true));
  document
    .getElementById("btnMargemFixed")
    .addEventListener("click", () => _aplicarMargemTipo("fixed", true));

  function _aplicarMargemTipo(tipo, recalc = false) {
    document
      .getElementById("btnMargemPct")
      .classList.toggle("active", tipo === "pct");
    document
      .getElementById("btnMargemFixed")
      .classList.toggle("active", tipo === "fixed");
    product.margemTipo = tipo;

    // Ajusta o comportamento de formatação do campo margem conforme o tipo:
    // - fixed (R$)  → money-input: 20 vira 20,00
    // - pct (%)     → percent-input: 20 fica 20, 0,5 fica 0,5
    const elMargem = document.getElementById("margemValor");
    if (elMargem) {
      const num = parseFormattedValue(elMargem.value);
      elMargem.classList.remove("money-input", "percent-input", "margem-input");
      if (tipo === "fixed") {
        elMargem.classList.add("money-input");
        elMargem.value = num === 0 ? "" : formatMoneyBR(num);
      } else {
        elMargem.classList.add("percent-input");
        elMargem.value = num === 0 ? "" : formatPercentBR(num);
      }
    }

    if (recalc) {
      _recalcularTudo();
      _marcarAlterado();
    }
  }

  // Aplica o tipo de margem padrão na carga inicial (produto novo usa "pct")
  _aplicarMargemTipo(product.margemTipo || "pct", false);

  function _marcarAlterado() {
    _isDirty = true;
    const bar = document.getElementById("actionBarInfo");
    if (bar)
      bar.innerHTML = `<span style="color:var(--clr-accent);">● Alterações não salvas</span>`;
  }

  function _marcarSalvo() {
    _isDirty = false;
    const bar = document.getElementById("actionBarInfo");
    if (bar)
      bar.innerHTML = `<span style="color:var(--clr-success);">✓ Salvo</span>`;
  }

  function _iniciarAutosave() {
    _autoSaveId = setInterval(() => {
      // Com o "Salvar" pedindo usuário e senha, só ele grava.
      if (_isDirty && !_isRedirecting && !_salvarSoPeloBotao()) _executarSave(false);
    }, 30000);
  }
  function _pararAutosave() {
    if (_autoSaveId) clearInterval(_autoSaveId);
  }

  window.addEventListener("beforeunload", () => {
    if (_isDirty && !_isRedirecting && !_salvarSoPeloBotao()) _executarSave(false);
    _pararAutosave();
  });
  document.getElementById("productName").addEventListener("input", () => {
    updateBreadcrumb();
    _marcarAlterado();
  });
  function updateBreadcrumb() {
    const name = document.getElementById("productName").value.trim();
    let fallback;
    if (isNew && isKitCreation) fallback = "Novo Kit Composto";
    else if (isNew) fallback = "Novo Produto";
    else fallback = "Editar Produto";
    document.getElementById("productBreadcrumb").textContent = name || fallback;
  }

  // SAVE
  document
    .getElementById("btnSalvar")
    .addEventListener("click", () => _executarSave(true));

  // Impede que dois salvamentos rodem ao mesmo tempo.
  // _executarSave é async (aguarda a persistência das imagens); sem esta trava,
  // o autosave e um clique em "Salvar" podem se sobrepor e gravar dados inconsistentes.
  let _isSaving = false;

  async function _executarSave(redirecionar) {
    if (_isRedirecting) return;
    if (_isSaving) {
      // Já há um salvamento em andamento. Se o usuário clicou em Salvar,
      // avisa; se foi o autosave, simplesmente ignora.
      if (redirecionar) showToast("Salvamento em andamento, aguarde...", "warning");
      return;
    }

    const nameEl = document.getElementById("productName");
    const name = nameEl ? nameEl.value.trim() : "";
    if (!name && redirecionar) {
      _marcarErro(nameEl);
      return showToast("Informe o nome do produto.", "error");
    }

    _isSaving = true;
    try {
      await _salvarInterno(name, redirecionar);
    } catch (e) {
      console.error("Falha ao salvar o produto:", e);
      if (typeof PrecifiqErros !== "undefined") {
        PrecifiqErros.registrar("Falha ao salvar produto", e && e.stack ? e.stack : String(e));
      }
      showToast("Erro ao salvar o produto.", "error");
    } finally {
      _isSaving = false;
    }
  }

  async function _salvarInterno(name, redirecionar) {
    const inputs = getCalcInputs();
    const result = calcularUnidade(inputs);

    const kitsFinais = (Array.isArray(product.kits) ? product.kits : []).map((kit) => {
      let extRS = 0,
        extPCT = 0;
      // Number(...) || 0 evita que um campo sem valor (undefined/null/"")
      // transforme a soma em NaN e contamine o preço do kit inteiro.
      (Array.isArray(kit.camposPersonalizados) ? kit.camposPersonalizados : []).forEach((c) => {
        if (!c) return;
        const v = Number(c.valor) || 0;
        if (c.tipo === "RS") extRS += v;
        else extPCT += v;
      });
      const qty = parseInt(kit.qty, 10) || 1;
      const freteKit = Number(kit.frete) || 0;
      const r = calcularKit(inputs, qty, freteKit, { extraRS: extRS, extraPCT: extPCT });

      // Guarda final: nunca grava NaN/Infinity no produto
      const num = (x) => (isFinite(x) ? parseFloat(x.toFixed(2)) : 0);
      return {
        ...kit,
        qty,
        price: num(r.precoVenda),
        custo: num(r.custoBase),
        lucro: num(r.lucro),
      };
    });

    // Lê o valor de um input RESPEITANDO o estado oculto do campo.
    //
    // IMPORTANTE: getCalcInputs() retorna 0 para campos ocultos, então o
    // finalPrice é calculado sem eles. Se salvássemos o valor bruto do DOM,
    // o produto ficaria com um custo que NÃO foi usado no preço — e qualquer
    // recálculo posterior (ex: ações em massa) mudaria o preço sozinho.
    // Salvamos exatamente o que foi usado no cálculo.
    function _getRealFieldValue(id) {
      const el = document.getElementById(id);
      if (!el) return 0;
      if (el.dataset.campoOculto === "1") return 0;
      // parseFormattedValue entende "1.000,00" e "20,5"
      return parseFormattedValue(el.value);
    }

    // Persiste as imagens no IndexedDB e obtém os IDs (leves) para salvar.
    // Os base64 gigantes NÃO vão para o produto — só os IDs.
    let idsImagens = [];
    try {
      idsImagens = await _persistirImagens();
    } catch (e) {
      console.error("Falha ao persistir imagens:", e);
    }

    // A 1ª imagem (base64) é salva em `image` para a miniatura da listagem.
    // É só uma imagem (leve); a galeria completa fica pelos IDs em `images`.
    const primeiraBase64 =
      (Array.isArray(product.images) && product.images.find((x) => typeof x === "string" && x.startsWith("data:"))) ||
      (typeof product.image === "string" && product.image.startsWith("data:") ? product.image : "") ||
      "";

    const _skuEl = document.getElementById("productSku");
    const _prodIdEl = document.getElementById("productId");

    const toSave = Object.assign({}, product, {
      name,
      sku: _skuEl ? _skuEl.value.trim() : (product.sku || ""),
      prodId: _prodIdEl ? _prodIdEl.value.trim() : (product.prodId || ""),
      // IDs das imagens (galeria) + 1ª imagem base64 para a miniatura da listagem
      images: idsImagens,
      image: primeiraBase64,
      _imageIds: idsImagens,

      // Salva a logística
      peso: parseFloat(document.getElementById("logPeso")?.value) || 0,
      altura: parseFloat(document.getElementById("logAltura")?.value) || 0,
      largura: parseFloat(document.getElementById("logLargura")?.value) || 0,
      comprimento:
        parseFloat(document.getElementById("logComprimento")?.value) || 0,

      // Usa o valor real do DOM, não o valor calculado (que pode ser 0 para campos ocultos)
      custo:        _getRealFieldValue("custoCusto"),
      embalagem:    _getRealFieldValue("custoEmbalagem"),
      etiqueta:     _getRealFieldValue("custoEtiqueta"),
      frete:        _getRealFieldValue("custoFrete"),
      // Impostos sobre o custo. Estavam fora desta lista: o preço era
      // calculado com eles, mas os percentuais não iam para o produto salvo.
      // Ao reabrir, os campos vinham vazios e o preço recalculava sem eles.
      ipi:          _getRealFieldValue("custoIpi"),
      difal:        _getRealFieldValue("custoDifal"),
      st:           _getRealFieldValue("custoSt"),
      aliquota:     _getRealFieldValue("custoAliquota"),
      freteProduto: _getRealFieldValue("freteProduto"),
      taxaFixa:     _getRealFieldValue("taxaFixa"),
      impostoNF:    _getRealFieldValue("impostoNF"),
      taxa:         _getRealFieldValue("taxaPlataforma"),
      margem:       _getRealFieldValue("margemValor"),
      margemTipo: inputs.margemTipo,
      finalPrice: isFinite(result.precoVenda) ? parseFloat(result.precoVenda.toFixed(2)) : 0,
      kits: kitsFinais,
      camposIdentificacao: product.camposIdentificacao || [],
      secoesCustom: product.secoesCustom || [],
      ordemSecoes: product.ordemSecoes || [],
      mlTaxaPremium: isMercadoLivre
        ? _taxaML("mlTaxaPremium")
        : undefined,
      mlTaxaClassico: isMercadoLivre
        ? _taxaML("mlTaxaClassico")
        : undefined,
      // Preços Extras. Faltavam aqui desde que a área foi criada: os
      // valores apareciam na tela, mas não iam para o produto salvo — ao
      // reabrir, os três campos vinham vazios. Vale para o salvamento
      // manual, o automático (a cada 30s) e o de quando a tela é fechada,
      // porque os três passam por esta mesma função.
      precoMinimo: _getRealFieldValue("precoMinimo"),
      precoIdeal:  _getRealFieldValue("precoIdeal"),
      precoMaximo: _getRealFieldValue("precoMaximo"),
      // Mercado Livre: os três acima são os do Premium; estes, os do
      // Clássico. (Os dos kits vão dentro de cada kit, em `kits`.)
      precoMinimoClassico: isMercadoLivre ? _getRealFieldValue("precoMinimoClassico") : undefined,
      precoIdealClassico:  isMercadoLivre ? _getRealFieldValue("precoIdealClassico") : undefined,
      precoMaximoClassico: isMercadoLivre ? _getRealFieldValue("precoMaximoClassico") : undefined,
      updatedAt: Date.now(),
    });

    try {
      sessionStorage.setItem("current_product_id", toSave.id);
      // Guarda os base64 em memória antes de clonar (o toSave só tem IDs)
      const base64EmMemoria = Array.isArray(product.images) ? product.images.slice() : [];
      // Como o produto estava gravado ANTES deste salvamento (cópia rasa,
      // sem clonar as imagens): diz se o Preço de Custo mudou agora — e só
      // então os outros produtos com o mesmo SKU recebem o custo novo.
      let gravadoAntes = null;
      try {
        if (typeof getProductsForReading === "function") {
          gravadoAntes = (getProductsForReading(platformId) || []).find((x) => x && x.id === toSave.id) || null;
        }
      } catch (e) {
        gravadoAntes = null;
      }
      upsertProduct(platformId, toSave);
      const naTela = product;
      product = JSON.parse(JSON.stringify(toSave));
      _manterObjetosDaTela(naTela, toSave, kitsFinais);
      // Restaura os base64 em memória para o carrossel continuar exibindo
      product.images = base64EmMemoria;
      product._imageIds = idsImagens;
      product.image = base64EmMemoria[0] || "";
      _marcarSalvo();

      // Depois de gravar, atualiza quem depende deste produto.
      //
      // Um composto guarda uma CÓPIA do custo de cada item. Sem isto, mudar
      // o custo aqui deixava o composto congelado no valor antigo — ele só
      // acertava passando pelas Ações em Massa.
      //
      // Roda depois do upsertProduct de propósito: a propagação lê os
      // produtos do armazenamento, e precisa enxergar o valor novo.
      // Falhar aqui não desfaz o salvamento: o produto já está gravado, e
      // um erro na propagação não pode virar "erro ao salvar".
      //
      // A propagação (utils.js) acha os compostos pelo id deste produto
      // — e, nos itens antigos sem id, pelo SKU —, refaz o custo, o preço,
      // os kits e os Preços Extras na margem de cada um, e segue para os
      // compostos que usam esses compostos.
      //
      // Mesmo SKU: se o Preço de Custo mudou neste salvamento (e o SKU é o
      // mesmo de antes), os outros produtos desta plataforma com o mesmo
      // SKU — o mesmo item em outro anúncio — recebem o custo novo, são
      // recalculados e levam junto os compostos deles. Um SKU que acabou de
      // ser trocado não mexe em ninguém: pode ter sido um engano de digitação.
      try {
        const compostosNomes = [];
        const compostosVistos = new Set();
        const juntarCompostos = (nomes, ids) => {
          (nomes || []).forEach((n, i) => {
            const chave = String(ids && ids[i] !== undefined ? ids[i] : n);
            if (compostosVistos.has(chave)) return;
            compostosVistos.add(chave);
            compostosNomes.push(n);
          });
        };

        if (typeof propagarDependencias === "function" && (toSave.sku || toSave.id)) {
          const r = propagarDependencias(platformId, toSave.sku, toSave.id);
          if (r && r.atualizados > 0) juntarCompostos(r.nomes, r.ids);
        }

        const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
        const skuNorm = (t) => String(t || "").trim().toUpperCase();
        if (
          typeof sincronizarCustoDoSku === "function" &&
          gravadoAntes &&
          r2(gravadoAntes.custo) !== r2(toSave.custo) &&
          skuNorm(toSave.sku) !== "" &&
          skuNorm(gravadoAntes.sku) === skuNorm(toSave.sku)
        ) {
          const m = sincronizarCustoDoSku(platformId, toSave.id);
          if (m && m.atualizados > 0) {
            juntarCompostos(m.compostosNomes, m.compostosIds);
            const listaSku = m.nomes.slice(0, 3).join(", ") + (m.nomes.length > 3 ? "…" : "");
            showToast(
              (m.atualizados === 1
                ? "Mesmo SKU: o Preço de Custo também mudou em 1 produto: "
                : "Mesmo SKU: o Preço de Custo também mudou em " + m.atualizados + " produtos: ") + listaSku,
              "success",
              5000
            );
          }
        }

        if (compostosNomes.length > 0) {
          const lista = compostosNomes.slice(0, 3).join(", ");
          showToast(
            compostosNomes.length === 1
              ? "Produto composto atualizado: " + lista
              : compostosNomes.length + " produtos compostos atualizados: " + lista +
                (compostosNomes.length > 3 ? "…" : ""),
            "success",
            5000
          );
        }
      } catch (e) {
        console.error("[Produto] falha ao propagar dependências:", e);
      }
    } catch (e) {
      // Propaga para o _executarSave registrar o erro com detalhe (stack).
      // Antes o erro era engolido: no .exe o usuário só via "Erro ao salvar".
      throw new Error("Falha ao persistir o produto: " + (e && e.message ? e.message : e));
    }

    if (redirecionar) {
      _isRedirecting = true;
      _pararAutosave();
      showToast(`Salvo com sucesso!`, "success");
      // Volta para a lista só depois de as gravações terminarem — o
      // produto, os compostos e os outros produtos com o mesmo SKU: uma
      // gravação pendente pode ser cancelada quando a página é
      // descarregada. Os 800 ms de antes continuam sendo o mínimo; a
      // espera pelas gravações vai no máximo a 5 s.
      const gravacoes = typeof aguardarGravacoes === "function" ? aguardarGravacoes(5000) : Promise.resolve();
      Promise.all([gravacoes, new Promise((r) => setTimeout(r, 800))]).then(() => {
        window.location.href = `plataforma.html?p=${platformId}`;
      });
    }
  }

  /**
   * Depois de salvar, o produto em memória volta a usar os MESMOS objetos
   * que a tela usa.
   *
   * Cada campo da tela guarda uma referência ao objeto que ele edita: o
   * card do kit, ao seu kit (SKU, frete, Preços Extras); cada campo
   * personalizado, ao seu item; cada seção, à sua seção. A cópia feita
   * após salvar (JSON.parse) cria objetos NOVOS — e esses campos seguiam
   * gravando nos antigos, que ninguém mais salvava. Resultado: depois do
   * primeiro salvamento automático (30 s), o que se digitava num kit ou
   * num campo personalizado sumia no salvamento seguinte.
   *
   * Aqui, tudo o que foi salvo sem ser trocado (mesma referência em
   * `salvo` e em `anterior`) volta a ser o objeto da tela. Os kits vão
   * para o salvamento como cópias com o preço recalculado: esses números
   * são copiados de volta para os objetos da tela, e a lista em memória
   * continua sendo a da tela.
   */
  function _manterObjetosDaTela(anterior, salvo, kitsSalvos) {
    if (!anterior || !salvo) return;
    Object.keys(salvo).forEach(function (chave) {
      const v = salvo[chave];
      if (v && typeof v === "object" && v === anterior[chave]) product[chave] = v;
    });
    if (Array.isArray(anterior.kits)) {
      anterior.kits.forEach(function (kit) {
        if (!kit) return;
        const s = (kitsSalvos || []).find(function (k) { return k && k.id === kit.id; });
        if (!s) return;
        kit.qty = s.qty;
        kit.price = s.price;
        kit.custo = s.custo;
        kit.lucro = s.lucro;
      });
      product.kits = anterior.kits;
    }
  }

  // ══════════════════════════════════════════
  //  SEÇÕES PERSONALIZADAS + ORDENAÇÃO
  // ══════════════════════════════════════════
  function _escSec(str) {
    return String(str || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }
  function _genId() {
    if (typeof generateId === "function") return generateId();
    return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function _tipoInfo(tipo) {
    switch (tipo) {
      case "money":  return { prefix: "R$", suffix: "", placeholder: "0,00", inputmode: "decimal" };
      case "percent":return { prefix: "", suffix: "%", placeholder: "0", inputmode: "decimal" };
      case "number": return { prefix: "", suffix: "", placeholder: "0", inputmode: "numeric" };
      default:       return { prefix: "", suffix: "", placeholder: "Digite...", inputmode: "text" };
    }
  }
  function _marcarAlteradoSec() {
    if (typeof _marcarAlterado === "function") _marcarAlterado();
  }

  function _renderSecoesCustom() {
    const container = document.getElementById("secoesCustomContainer");
    if (!container) return;
    container.innerHTML = "";
    if (!product.secoesCustom) product.secoesCustom = [];

    product.secoesCustom.forEach((secao) => {
      const card = document.createElement("div");
      card.className = "card mb-lg";
      card.dataset.secaoId = secao.id;
      card.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px;">
          <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
            <span class="card-title-dot"></span>
            <input type="text" class="input-field secao-titulo-input"
                   value="${_escSec(secao.titulo)}" placeholder="Título da seção"
                   style="font-size:15px; font-weight:700; border:1px solid transparent; background:transparent; padding:4px 6px; flex:1; min-width:0;" />
          </div>
          <button type="button" class="btn-secondary secao-remover" style="font-size:12px; padding:6px 12px; flex-shrink:0;">Remover Seção</button>
        </div>
        <div class="grid secao-campos" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:12px;"></div>
        <button type="button" class="btn-secondary secao-add-campo" style="font-size:13px; margin-top:12px;">+ &nbsp;Adicionar Campo</button>
      `;

      const tituloInput = card.querySelector(".secao-titulo-input");
      tituloInput.addEventListener("input", (e) => { secao.titulo = e.target.value; _marcarAlteradoSec(); });
      tituloInput.addEventListener("focus", () => { tituloInput.style.borderColor = "var(--clr-border)"; });
      tituloInput.addEventListener("blur", () => { tituloInput.style.borderColor = "transparent"; });

      card.querySelector(".secao-remover").addEventListener("click", () => {
        product.secoesCustom = product.secoesCustom.filter((s) => s.id !== secao.id);
        _renderSecoesCustom();
        _marcarAlteradoSec();
      });

      card.querySelector(".secao-add-campo").addEventListener("click", () => {
        _abrirModalTipoCampo((tipo, rotulo) => {
          if (!secao.campos) secao.campos = [];
          secao.campos.push({ id: _genId(), rotulo: rotulo, valor: "", tipo: tipo });
          _renderSecoesCustom();
          _marcarAlteradoSec();
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
        input.addEventListener("input", (e) => { campo.valor = e.target.value; _marcarAlteradoSec(); });
        if (campo.tipo === "money" || campo.tipo === "percent") {
          input.addEventListener("blur", () => {
            if (input.value.trim() === "") return;
            const n = parseFormattedValue(input.value);
            input.value = campo.tipo === "money" ? formatMoneyBR(n) : formatPercentBR(n);
            campo.valor = input.value;
          });
        } else if (campo.tipo === "number") {
          input.addEventListener("input", () => { input.value = input.value.replace(/[^\d]/g, ""); campo.valor = input.value; });
        }
        fg.querySelector(".btn-remove-campo-sec").addEventListener("click", () => {
          secao.campos = secao.campos.filter((c) => c.id !== campo.id);
          _renderSecoesCustom();
          _marcarAlteradoSec();
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
          <input type="text" id="inputRotuloCampo" class="input-field" placeholder="Ex: Observação" />
        </div>
        <div class="field-group" style="margin-bottom: var(--sp-lg);">
          <label>Tipo</label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
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
    if (!product.secoesCustom) product.secoesCustom = [];
    product.secoesCustom.push({ id: _genId(), titulo: "Nova Seção", campos: [] });
    _renderSecoesCustom();
    _marcarAlteradoSec();
    setTimeout(() => {
      const container = document.getElementById("secoesCustomContainer");
      if (container && container.lastElementChild) {
        container.lastElementChild.scrollIntoView({ behavior: "smooth", block: "center" });
        const t = container.lastElementChild.querySelector(".secao-titulo-input");
        if (t) t.focus();
      }
    }, 60);
  }

  // ── Ordenação (seções fixas via data-secao-prod + custom) ──
  function _listarSecoesOrdenadas() {
    const fixas = [];
    document.querySelectorAll("[data-secao-prod]").forEach((el) => {
      fixas.push({ id: "fixa:" + el.dataset.secaoProd, nome: el.dataset.secaoNome || el.dataset.secaoProd, tipo: "fixa" });
    });
    const custom = (product.secoesCustom || []).map((s) => ({ id: "custom:" + s.id, nome: s.titulo || "Seção sem nome", tipo: "custom" }));
    const todas = [...fixas, ...custom];
    const ordem = product.ordemSecoes || [];
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
    const ordem = product.ordemSecoes || [];
    if (!ordem.length) return;
    const main = document.getElementById("mainContent");
    const container = document.getElementById("secoesCustomContainer");
    const fixos = {};
    document.querySelectorAll("[data-secao-prod]").forEach((el) => { fixos[el.dataset.secaoProd] = el; });

    // Reanexa os fixos na ordem, sempre antes do container de custom
    ordem.forEach((secId) => {
      if (secId.startsWith("fixa:")) {
        const key = secId.slice(5);
        if (fixos[key] && container) main.insertBefore(fixos[key], container);
      }
    });
    // Reordena as custom no array
    if (product.secoesCustom && product.secoesCustom.length) {
      product.secoesCustom.sort((a, b) => {
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
        <div class="modal-subtitle" style="margin-bottom: var(--sp-lg);">Arraste pelo ícone <strong>☰</strong>. O card de identificação (imagem) fica sempre fixo no topo.</div>
        <div id="listaOrdenarSecoes" style="display:flex; flex-direction:column; gap:8px; max-height:50vh; overflow-y:auto;">
          ${secoes.map((s) => `
            <div class="ordenar-secao-item" draggable="true" data-sec-id="${s.id}"
                 style="display:flex; align-items:center; gap:12px; padding:12px 14px; background:var(--clr-surface-alt); border:1px solid var(--clr-border); border-radius:var(--r-md); cursor:grab; user-select:none;">
              <span style="color:var(--clr-text-3); font-size:16px; line-height:1;">☰</span>
              <span style="font-size:14px; font-weight:600; color:var(--clr-text);">${(s.nome || "").replace(/</g, "&lt;")}</span>
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
      product.ordemSecoes = Array.from(lista.querySelectorAll(".ordenar-secao-item")).map((el) => el.dataset.secId);
      _aplicarOrdemSecoes();
      _renderSecoesCustom();
      _marcarAlteradoSec();
      fechar();
      showToast("Ordem das seções atualizada!", "success");
    });
  }

  // Inicialização das seções custom
  _renderSecoesCustom();
  _aplicarOrdemSecoes();
  const _btnAddSecaoP = document.getElementById("btnAddSecao");
  if (_btnAddSecaoP) _btnAddSecaoP.addEventListener("click", _adicionarSecao);
  const _btnOrdenarSecoesP = document.getElementById("btnOrdenarSecoes");
  if (_btnOrdenarSecoesP) _btnOrdenarSecoesP.addEventListener("click", _abrirModalOrdenarSecoes);
});

// ── Remove o botão "Configurar Campos" da área "Margem de Lucro" ──
// (é injetado pelo campos.js; escondemos apenas dentro do box de margem,
//  sem afetar os toggles % / R$ nem o botão em outras áreas)
(function _ocultarConfigCamposMargem() {
  function limpar() {
    const box = document.getElementById("boxMargem");
    if (!box) return;
    const escopos = [box, box.parentElement].filter(Boolean);
    escopos.forEach((escopo) => {
      escopo.querySelectorAll("button, a").forEach((b) => {
        if (b.classList.contains("toggle-btn")) return; // não mexe no % / R$
        const txt = (b.textContent || "").trim().toLowerCase();
        if (
          b.classList.contains("btn-editar-campos") ||
          txt.includes("configurar campos") ||
          txt.includes("editar campos")
        ) {
          b.style.display = "none";
        }
      });
    });
  }

  function iniciar() {
    limpar();
    // Rede de segurança caso o campos.js injete o botão depois
    const alvo = document.getElementById("boxMargem");
    if (alvo && alvo.parentElement) {
      const obs = new MutationObserver(limpar);
      obs.observe(alvo.parentElement, { childList: true, subtree: true });
      setTimeout(() => obs.disconnect(), 4000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();

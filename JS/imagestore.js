// ═══════════════════════════════════════════
//  Bapell Gestor Pro — imagestore.js
//  Armazenamento de imagens em IndexedDB
//  (resolve o limite de ~5MB do localStorage)
// ═══════════════════════════════════════════
//
//  Cada imagem é guardada como um registro { id, data, nome? } onde:
//    - id   → chave única (ex: "img_ab12cd34")
//    - data → string base64 (dataURL) da imagem
//    - nome → nome do arquivo escolhido pelo usuário (OPCIONAL)
//
//  O campo `nome` foi acrescentado depois, para a galeria "Usar imagem já
//  anexada" poder pesquisar. Registros antigos não o têm e continuam
//  funcionando normalmente — a versão do banco NÃO mudou, porque o keyPath
//  segue sendo `id` e nenhum índice novo foi criado. Subir a versão exigiria
//  um upgrade do IndexedDB, que poderia falhar com o app aberto em duas
//  janelas e deixar o usuário sem imagem nenhuma.
//
//  Os PRODUTOS guardam apenas a LISTA DE IDs (não o base64),
//  então o localStorage fica minúsculo e sem risco de estourar.
// ═══════════════════════════════════════════

const ImageStore = (function () {
  "use strict";

  const DB_NAME = "precifiq_images";
  const DB_VERSION = 1;
  const STORE = "images";

  // Limite defensivo por imagem. Um base64 de ~20MB indica quase sempre um
  // upload sem redimensionamento; barra antes de encher o disco à toa.
  const MAX_DATAURL_CHARS = 20 * 1024 * 1024;

  let _dbPromise = null;

  function _openDB() {
    // NÃO cacheia a Promise de FALHA: se a abertura falhar (ex.: disco cheio,
    // navegador em modo restrito), a próxima chamada tenta de novo. Antes, um
    // erro transitório ficava cacheado para sempre e nenhuma imagem gravava
    // até reiniciar o app.
    if (_dbPromise) return _dbPromise;

    _dbPromise = new Promise((resolve, reject) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        _dbPromise = null;
        return reject(e);
      }

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };

      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => {
        _dbPromise = null; // permite retry
        reject((e.target && e.target.error) || new Error("Falha ao abrir o banco de imagens"));
      };
      // Outra aba está bloqueando um upgrade de versão.
      req.onblocked = () => {
        console.warn("[ImageStore] abertura bloqueada por outra aba");
      };
    });

    return _dbPromise;
  }

  function _genId() {
    return (
      "img_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 9)
    );
  }

  // Executa uma transação de escrita tratando os TRÊS finais possíveis:
  // complete (ok), error e abort. O abort é o que faltava: quando a cota
  // estoura, a transação ABORTA (não dispara onerror), e sem tratá-lo a
  // Promise nunca resolvia nem rejeitava — o save "sucedia" com zero imagens.
  function _escrever(fn) {
    return _openDB().then(
      (db) =>
        new Promise((resolve, reject) => {
          let tx;
          try {
            tx = db.transaction(STORE, "readwrite");
          } catch (e) {
            return reject(e);
          }
          const store = tx.objectStore(STORE);
          let resultado;
          try {
            resultado = fn(store);
          } catch (e) {
            return reject(e);
          }
          tx.oncomplete = () => resolve(resultado);
          tx.onerror = () => reject(tx.error || new Error("Erro na transação de imagem"));
          tx.onabort = () =>
            reject(
              tx.error ||
                new Error("Gravação de imagem abortada (possível falta de espaço em disco)")
            );
        })
    );
  }

  function _ler(fn) {
    return _openDB().then(
      (db) =>
        new Promise((resolve, reject) => {
          let tx;
          try {
            tx = db.transaction(STORE, "readonly");
          } catch (e) {
            return reject(e);
          }
          tx.onabort = () => reject(tx.error || new Error("Leitura de imagem abortada"));
          fn(tx.objectStore(STORE), resolve, reject);
        })
    );
  }

  function _validarDataUrl(dataUrl) {
    if (typeof dataUrl !== "string" || dataUrl.indexOf("data:") !== 0) {
      throw new Error("Valor não é uma imagem base64 (dataURL) válida.");
    }
    if (dataUrl.length > MAX_DATAURL_CHARS) {
      throw new Error("Imagem grande demais para ser salva (acima do limite).");
    }
  }

  // ── API pública ─────────────────────────────────────────────

  /**
   * Salva uma imagem (base64). Retorna o id gerado.
   * REJEITA se a gravação falhar (cota, abort, valor inválido) — o chamador
   * PRECISA tratar, para não dizer "salvo" sem ter salvado.
   * @param {string} dataUrl  base64 (data:image/...;base64,...)
   * @returns {Promise<string>} id da imagem
   */
  async function put(dataUrl, nome) {
    _validarDataUrl(dataUrl); // rejeita string que não é imagem (isDataUrl agora é usada de fato)
    const id = _genId();
    // O campo `nome` é OPCIONAL e foi acrescentado depois. Registros antigos
    // simplesmente não o têm: nada quebra, eles só aparecem sem nome próprio
    // na galeria e são identificados pelo produto que os usa.
    const rec = { id, data: dataUrl };
    if (nome) rec.nome = String(nome);
    await _escrever((store) => store.put(rec));
    return id;
  }

  /** Salva com um id específico (usado na migração/importação). Retorna o id. */
  async function putWithId(id, dataUrl, nome) {
    if (!id) throw new Error("putWithId exige um id.");
    _validarDataUrl(dataUrl);
    const rec = { id, data: dataUrl };
    if (nome) rec.nome = String(nome);
    await _escrever((store) => store.put(rec));
    return id;
  }

  /**
   * Renomeia uma imagem já salva, sem tocar nos dados.
   * Lê o registro e regrava com o novo nome — o base64 não é reenviado,
   * então não há risco de perder a imagem no caminho.
   */
  async function setNome(id, nome) {
    if (!id) return false;
    const rec = await _ler((store, resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (!rec) return false;
    rec.nome = nome ? String(nome) : "";
    await _escrever((store) => store.put(rec));
    return true;
  }

  /**
   * Lista todas as imagens com id, nome e base64, para a galeria.
   *
   * Carrega os dados porque a galeria PRECISA exibir as miniaturas — sem o
   * base64 não há o que mostrar. Para bancos grandes, quem chama deve
   * renderizar aos poucos em vez de montar tudo de uma vez.
   */
  function listar() {
    return _ler((store, resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        resolve(
          (req.result || [])
            .filter((r) => r && r.id && r.data)
            .map((r) => ({ id: r.id, nome: r.nome || "", data: r.data }))
        );
      };
      req.onerror = () => reject(req.error);
    });
  }

  /** Busca uma imagem pelo id. Retorna o base64 ou null. */
  async function get(id) {
    if (!id) return null;
    return _ler((store, resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Busca várias imagens de uma vez, numa ÚNICA transação. Retorna array de
   * base64 na mesma ordem dos ids (ids inválidos/ausentes viram null).
   * O produto.js deve usar isto em vez de um laço de get() sequencial.
   */
  async function getMany(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    return _ler((store, resolve) => {
      const results = new Array(ids.length).fill(null);
      let pendentes = ids.length;
      const done = () => { if (pendentes === 0) resolve(results); };
      ids.forEach((id, idx) => {
        if (!id) { pendentes--; done(); return; }
        const req = store.get(id);
        req.onsuccess = () => { results[idx] = req.result ? req.result.data : null; pendentes--; done(); };
        req.onerror = () => { pendentes--; done(); };
      });
    });
  }

  /** Remove uma imagem pelo id. */
  async function remove(id) {
    if (!id) return;
    return _escrever((store) => store.delete(id));
  }

  /**
   * Remove várias imagens de uma vez (uma transação). Usado ao excluir um
   * produto/plataforma, para não deixar imagens órfãs ocupando espaço.
   */
  async function removeMany(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const validos = ids.filter(Boolean);
    if (!validos.length) return;
    return _escrever((store) => { validos.forEach((id) => store.delete(id)); });
  }

  /** true se o valor parece um id do ImageStore (e não um base64 solto). */
  function isImageId(val) {
    return typeof val === "string" && /^img_[0-9a-z]+_[0-9a-z]+$/.test(val);
  }

  /** true se o valor é um base64 dataURL. */
  function isDataUrl(val) {
    return typeof val === "string" && val.indexOf("data:") === 0;
  }

  /**
   * Retorna TODAS as imagens como { id: dataUrl }. Usado no backup.
   * Atenção: carrega o banco inteiro na memória — use só para exportar.
   */
  function getAll() {
    return _ler((store, resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const out = {};
        (req.result || []).forEach((rec) => { if (rec && rec.id) out[rec.id] = rec.data; });
        resolve(out);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /** Lista só os ids existentes (leve — não carrega os base64). */
  function getAllIds() {
    return _ler((store, resolve, reject) => {
      const req = store.getAllKeys ? store.getAllKeys() : null;
      if (req) {
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      } else {
        // Fallback via cursor se getAllKeys não existir
        const ids = [];
        const cur = store.openCursor();
        cur.onsuccess = (e) => { const c = e.target.result; if (c) { ids.push(c.key); c.continue(); } else resolve(ids); };
        cur.onerror = () => reject(cur.error);
      }
    });
  }

  /**
   * Procura uma imagem IDÊNTICA já guardada e devolve o id dela.
   *
   * É o que evita duplicata: anexar de novo o mesmo arquivo, clonar um
   * produto ou reaproveitar uma foto pela galeria passam a apontar para
   * o MESMO registro, em vez de criar cópias do mesmo base64.
   *
   * A comparação é pelo conteúdo inteiro. Parece caro, mas as strings
   * diferem já nos primeiros caracteres quando as imagens são
   * diferentes — o JavaScript para na primeira diferença.
   *
   * @returns {Promise<string|null>} o id existente, ou null
   */
  async function acharPorConteudo(dataUrl) {
    if (!isDataUrl(dataUrl)) return null;
    try {
      const todas = await listar();
      const igual = todas.find((r) => r.data === dataUrl);
      return igual ? igual.id : null;
    } catch (e) {
      // Falhar aqui não pode impedir o salvamento: no pior caso grava
      // uma cópia, que é melhor do que perder a imagem.
      console.error("[ImageStore] falha ao procurar duplicata:", e);
      return null;
    }
  }

  /**
   * Guarda a imagem REAPROVEITANDO um registro idêntico, se houver.
   * Use no lugar de put() sempre que o base64 puder já existir.
   */
  async function putUnico(dataUrl, nome) {
    const existente = await acharPorConteudo(dataUrl);
    if (existente) {
      // Se o registro antigo não tinha nome e agora veio um, aproveita.
      if (nome) {
        try {
          const atual = await _ler((store, resolve, reject) => {
            const req = store.get(existente);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
          });
          if (atual && !atual.nome) await setNome(existente, nome);
        } catch (e) {}
      }
      return existente;
    }
    return put(dataUrl, nome);
  }

  return {
    put,
    putUnico,
    acharPorConteudo,
    putWithId,
    setNome,
    listar,
    get,
    getMany,
    getAll,
    getAllIds,
    remove,
    removeMany,
    isImageId,
    isDataUrl,
  };
})();

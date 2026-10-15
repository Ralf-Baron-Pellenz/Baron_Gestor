/* ══════════════════════════════════════════════════════════════
   BACKUP — Exportar / Importar banco de dados do Bapell Gestor Pro
   Reúne dados de localStorage + IndexedDB (produtos, imagens, notas,
   documentos, EANs).

   DOIS FORMATOS de arquivo:
     • .json — sem "Imagens dos Produtos" marcado: o mesmo arquivo de
               sempre (dados em texto).
     • .zip  — com "Imagens dos Produtos" marcado:
                 dados.json  → os mesmos dados do .json
                 imagens/    → as fotos dos produtos, em ARQUIVOS de imagem
                               (uma por foto, com o código que a liga ao
                               produto no nome: img_xxx.jpg)
                 LEIA-ME.txt → o que tem no arquivo e como restaurar
               As fotos saem do ImageStore (o banco de imagens do app, onde
               a ficha do produto guarda cada foto) e voltam para ele com o
               MESMO código — os produtos continuam apontando para elas.

   DOIS MODOS de importação:
     • "mesclar"  (padrão) — junta com o que já existe, por id, sem duplicar.
                   Serve para consolidar duas máquinas. NÃO corrige corrupção.
     • "restaurar"         — SUBSTITUI o conteúdo atual pelo do arquivo.
                   Serve para voltar a um estado bom (desfaz frete errado,
                   campo zerado, imagem perdida). Ação destrutiva e avisada.

   A tela de Ajuda (ajuda.js) usa: rotulo(), exportarArquivo(),
   analisarArquivo() e restaurar() — este último no modo "mesclar".
   ══════════════════════════════════════════════════════════════ */
const PrecifiqBackup = (function () {
  "use strict";

  // Chaves de localStorage por categoria de exportação
  const CHAVES = {
    empresas:    ["precifiq_empresa"],
    financeiro:  ["precifiq_dre", "dreSistema"],
    vendas:      ["precifiq_vendas"],
    plataformas: ["precifiq_custom_platforms", "precifiq_hidden_platforms", "precifiq_deleted_platforms"],
    // "produtos" é tratado à parte (IndexedDB + imagens + configs por plataforma)
    // eans, notas e documentos idem (ver abaixo)
  };

  // Prefixos de localStorage ligados a produtos/plataformas.
  // precifiq_filter_ é sessionStorage e está morto — fora daqui de propósito.
  const PREFIXOS_PRODUTOS = ["precifiq_field_cfg_"];

  const LEMBRETES_KEY = "precifiq_lembretes";
  const EANS_KEY = "precifiq_eans";
  const NF_EMPRESAS_KEY = "precifiq_nf_empresas";

  // ── Itens da tela de Ajuda (a lista de caixas de "Exportar Banco de Dados")
  // O id é o que a tela manda; o rótulo é o que ela mostra.
  const MODULOS = {
    produtos:    { rotulo: "Produtos" },
    plataformas: { rotulo: "Plataformas" },
    empresas:    { rotulo: "Empresas" },
    dre:         { rotulo: "DRE (Financeiro)" },
    vendas:      { rotulo: "Informações de Venda" },
    notas:       { rotulo: "Notas Fiscais" },
    lembretes:   { rotulo: "Lembretes" },
    config:      { rotulo: "Configurações" },
    temas:       { rotulo: "Temas" },
    ordemPlat:   { rotulo: "Ordem das Plataformas" },
    calculos:    { rotulo: "Central de Cálculos" },
    logos:       { rotulo: "Logos das Plataformas" },
    imagens:     { rotulo: "Imagens dos Produtos" },
    pdfs:        { rotulo: "PDFs" },
    anexos:      { rotulo: "Arquivos anexados" },
  };

  // Backup em .zip: a pasta das fotos e o arquivo dos dados.
  const PASTA_IMAGENS = "imagens";
  const ARQUIVO_DADOS = "dados.json";

  // ── EXPORTAR ────────────────────────────────────────────────
  async function exportar(opcoes) {
    opcoes = opcoes || {};
    const dump = {
      _app: "precifiq",
      _tipo: "backup",
      _versao: 2,
      _data: new Date().toISOString(),
      localStorage: {},
      produtos: {},   // { platformId: [produtos] }
      imagens: {},    // { imgId: dataUrl }
      notas: {},      // { notaId: registro }  (NotaStore)
      documentos: {}, // { docId: registro }   (ArquivoStore)
    };

    // localStorage por categoria selecionada
    Object.keys(CHAVES).forEach((cat) => {
      if (!opcoes[cat]) return;
      CHAVES[cat].forEach((chave) => {
        const v = localStorage.getItem(chave);
        if (v !== null) dump.localStorage[chave] = v;
      });
    });

    // Lembretes: sempre incluídos
    const _lem = localStorage.getItem(LEMBRETES_KEY);
    if (_lem !== null) dump.localStorage[LEMBRETES_KEY] = _lem;

    // EANs: sempre incluídos (o contador não pode "voltar" e gerar código
    // duplicado que já foi impresso em etiqueta).
    const _eans = localStorage.getItem(EANS_KEY);
    if (_eans !== null) dump.localStorage[EANS_KEY] = _eans;

    // Empresas de NF (cadastro dos emitentes)
    const _nfEmp = localStorage.getItem(NF_EMPRESAS_KEY);
    if (_nfEmp !== null) dump.localStorage[NF_EMPRESAS_KEY] = _nfEmp;

    // Produtos (IndexedDB) + configs por plataforma + imagens usadas
    if (opcoes.produtos) {
      const pids = (typeof getAllPlatformIds === "function") ? getAllPlatformIds() : [];
      const idsImagensUsadas = new Set();

      pids.forEach((pid) => {
        const prods = (typeof getProducts === "function") ? getProducts(pid) : [];
        if (prods && prods.length) {
          dump.produtos[pid] = prods;
          prods.forEach((p) => {
            _coletarIdsImagem(p, idsImagensUsadas);
            if (Array.isArray(p.kits)) p.kits.forEach((k) => _coletarIdsImagem(k, idsImagensUsadas));
          });
        }
      });

      // Configs de campos por plataforma
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && PREFIXOS_PRODUTOS.some((pref) => key.startsWith(pref))) {
          dump.localStorage[key] = localStorage.getItem(key);
        }
      }

      // Imagens do ImageStore (só as referenciadas), em texto dentro do .json.
      // No backup .zip elas vão como ARQUIVOS (ver _exportarZip) e não
      // são repetidas aqui.
      if (!opcoes._imagensEmArquivos && typeof ImageStore !== "undefined" && ImageStore.getAll) {
        try {
          const todas = await ImageStore.getAll();
          idsImagensUsadas.forEach((id) => {
            if (todas[id]) dump.imagens[id] = todas[id];
          });
        } catch (e) { console.error("Erro ao ler imagens:", e); }
      }
    }

    // Notas fiscais (PDFs/XMLs) — obrigação legal de guarda
    if (opcoes.notas && typeof NotaStore !== "undefined" && NotaStore.getAll) {
      try {
        const todas = await NotaStore.getAll();
        dump.notas = todas || {};
      } catch (e) { console.error("Erro ao ler notas:", e); }
    }

    // Documentos da empresa (ArquivoStore)
    if (opcoes.documentos && typeof ArquivoStore !== "undefined" && ArquivoStore.getAll) {
      try {
        const todos = await ArquivoStore.getAll();
        dump.documentos = todos || {};
      } catch (e) { console.error("Erro ao ler documentos:", e); }
    }

    return dump;
  }

  // Coleta os ids de imagem de um produto/kit num Set (só ids reais do
  // ImageStore, não base64 solto — evita gravar a mesma imagem duas vezes:
  // uma como id em _imageIds e outra como base64 em .image).
  function _coletarIdsImagem(obj, destino) {
    if (!obj) return;
    const candidatos = []
      .concat(Array.isArray(obj._imageIds) ? obj._imageIds : [])
      .concat(Array.isArray(obj.images) ? obj.images : [])
      .concat(obj.image ? [obj.image] : []);
    candidatos.forEach((id) => {
      if (typeof ImageStore !== "undefined" && ImageStore.isImageId && ImageStore.isImageId(id)) {
        destino.add(id);
      }
    });
  }

  // A tela de Ajuda chama o DRE de "dre"; aqui a categoria é "financeiro".
  // Sem esta tradução, o DRE marcado na tela ficava fora do backup.
  function _opcoesDaTela(opcoes) {
    const o = Object.assign({}, opcoes || {});
    if (o.dre) o.financeiro = true;
    return o;
  }

  // Gera o arquivo e dispara o download.
  //   Com "Imagens dos Produtos" marcado → .zip (dados + arquivos das fotos).
  //   Sem ela → o .json de sempre.
  async function exportarArquivo(opcoes, onProgresso) {
    opcoes = _opcoesDaTela(opcoes);
    if (typeof initStorage === "function") {
      try { await initStorage(); } catch (_) {}
    }
    if (opcoes.imagens) return _exportarZip(opcoes, onProgresso);

    const dump = await exportar(opcoes);
    const blob = new Blob([JSON.stringify(dump)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dataStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `bapell-backup-${dataStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return dump;
  }

  // ── EXPORTAR EM .ZIP (com os arquivos das imagens) ──────────
  async function _exportarZip(opcoes, onProgresso) {
    const prog = (msg) => { if (typeof onProgresso === "function") { try { onProgresso(msg); } catch (_) {} } };
    if (typeof JSZip === "undefined") {
      throw new Error("Biblioteca de compactação (JSZip) não carregada. Confira se o arquivo JS/jszip.min.js está na pasta do app.");
    }

    prog("Coletando os dados…");
    // Os mesmos dados do .json, sem repetir as fotos em texto.
    const dump = await exportar(Object.assign({}, opcoes, { _imagensEmArquivos: true }));

    // TODAS as fotos do banco de imagens (as que estão nos produtos e as da
    // galeria "Gerenciar Imagens"), cada uma num arquivo de imagem.
    let registros = [];
    if (typeof ImageStore !== "undefined" && typeof ImageStore.listar === "function") {
      prog("Lendo as imagens…");
      registros = (await ImageStore.listar()) || [];
    }

    const zip = new JSZip();
    const pasta = zip.folder(PASTA_IMAGENS);
    const manifesto = { pasta: PASTA_IMAGENS, total: 0, itens: [] };
    const nomesUsados = new Set();
    let falhas = 0;

    for (let i = 0; i < registros.length; i++) {
      const r = registros[i];
      registros[i] = null; // libera a memória do base64 assim que vira arquivo
      if (i % 20 === 0) prog("Lendo as imagens… " + (i + 1) + " de " + registros.length);
      if (!r || !_idDeImagemValido(r.id)) { falhas++; continue; }
      try {
        const arq = _arquivoDaImagem(r.data);
        const nomeArq = r.id + arq.ext;
        if (nomesUsados.has(nomeArq)) continue;
        nomesUsados.add(nomeArq);
        // Fotos já são comprimidas (jpg/png/webp): guardar sem recomprimir.
        pasta.file(nomeArq, arq.bytes, { binary: true, compression: "STORE" });
        manifesto.itens.push({
          id: r.id,
          arquivo: PASTA_IMAGENS + "/" + nomeArq,
          nome: r.nome || "",
          tipo: arq.tipo,
          bytes: arq.bytes.length,
        });
      } catch (e) {
        falhas++;
        _registrarErro("exportar imagem " + (r && r.id), e);
      }
    }
    manifesto.total = manifesto.itens.length;
    if (falhas) manifesto.naoLidas = falhas;

    dump._formato = "zip";
    dump._imagensArquivos = manifesto;
    zip.file(ARQUIVO_DADOS, JSON.stringify(dump));
    zip.file("LEIA-ME.txt", _textoLeiaMe(manifesto.total));

    prog("Compactando…");
    const blob = await zip.generateAsync(
      { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
      (meta) => prog("Compactando… " + Math.round(meta.percent || 0) + "%")
    );

    const nome = "bapell-backup-" + _dataLocal() + ".zip";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);

    return { formato: "zip", arquivo: nome, imagens: manifesto.total, falhas: falhas, bytes: blob.size };
  }

  function _textoLeiaMe(totalImagens) {
    const agora = new Date();
    return [
      "BACKUP DO BAPELL GESTOR PRO",
      "Gerado em " + agora.toLocaleDateString("pt-BR") + " às " + agora.toLocaleTimeString("pt-BR"),
      "",
      "O que tem neste arquivo:",
      "  dados.json  - os dados escolhidos na exportação (produtos, empresas,",
      "                plataformas, financeiro...).",
      "  imagens/    - as fotos dos produtos, em arquivos de imagem (" + totalImagens + ").",
      "",
      "Para restaurar: Bapell Gestor Pro > Ajuda > Importar Banco de Dados e",
      "escolha ESTE arquivo .zip. Não é preciso descompactar.",
      "",
      "Não renomeie nem apague os arquivos da pasta imagens: o nome de cada",
      "um é o código que liga a foto ao produto.",
      "",
    ].join("\r\n");
  }

  // ── ANALISAR UM BACKUP (antes de restaurar) ─────────────────
  // Lê o arquivo (.zip ou .json) e diz quais itens ele traz, para a tela
  // mostrar só esses. Não grava nada.
  async function analisarArquivo(file) {
    if (!file) throw new Error("Nenhum arquivo escolhido.");
    const nome = String(file.name || "").toLowerCase();

    if (nome.endsWith(".json")) {
      let dump;
      try { dump = JSON.parse(await file.text()); } catch (e) { throw new Error("Arquivo JSON inválido."); }
      _validarDump(dump);
      return { formato: "json", dump: dump, zip: null, imagens: [], modulos: _modulosDoDump(dump, null) };
    }

    if (typeof JSZip === "undefined") {
      throw new Error("Biblioteca de compactação (JSZip) não carregada. Confira se o arquivo JS/jszip.min.js está na pasta do app.");
    }
    let zip;
    try { zip = await JSZip.loadAsync(file); }
    catch (e) { throw new Error("Este arquivo não é um backup do Bapell (.zip ou .json) ou está corrompido."); }

    const dados = zip.file(ARQUIVO_DADOS);
    if (!dados) throw new Error("Backup inválido: dados.json não encontrado dentro do .zip.");
    let dump;
    try { dump = JSON.parse(await dados.async("string")); }
    catch (e) { throw new Error("Backup inválido: dados.json corrompido."); }
    _validarDump(dump);

    const imagens = _imagensDoZip(zip, dump);
    return { formato: "zip", dump: dump, zip: zip, imagens: imagens, modulos: _modulosDoDump(dump, imagens) };
  }

  function _validarDump(dump) {
    if (!dump || typeof dump !== "object" || dump._app !== "precifiq") {
      throw new Error("Arquivo inválido. Não é um backup do Bapell Gestor Pro.");
    }
  }

  // As fotos que o .zip traz: pela lista do dados.json e, se ela faltar,
  // pelos arquivos da pasta imagens/ com nome de código de imagem. Uma foto
  // da lista cujo arquivo sumiu do .zip continua na lista: a restauração
  // conta e avisa (em vez de ela desaparecer sem aviso).
  function _imagensDoZip(zip, dump) {
    const lista = [];
    const vistos = new Set();
    const man = dump && dump._imagensArquivos;
    if (man && Array.isArray(man.itens)) {
      man.itens.forEach((it) => {
        if (!it || !_idDeImagemValido(it.id) || vistos.has(it.id)) return;
        vistos.add(it.id);
        lista.push({ id: it.id, arquivo: String(it.arquivo || ""), nome: it.nome || "", tipo: it.tipo || "" });
      });
    }
    const pasta = zip.folder(PASTA_IMAGENS);
    if (pasta) {
      pasta.forEach((rel, f) => {
        if (!f || f.dir) return;
        const base = rel.split("/").pop();
        const ponto = base.lastIndexOf(".");
        const id = ponto > 0 ? base.slice(0, ponto) : base;
        if (!_idDeImagemValido(id) || vistos.has(id)) return;
        vistos.add(id);
        lista.push({ id: id, arquivo: f.name, nome: "", tipo: "" });
      });
    }
    return lista;
  }

  // Os itens da tela que este backup traz (e que a restauração sabe repor).
  function _modulosDoDump(dump, imagensZip) {
    const m = [];
    const ls = dump.localStorage || {};
    const temProdutos = dump.produtos && typeof dump.produtos === "object" &&
      Object.keys(dump.produtos).some((pid) => Array.isArray(dump.produtos[pid]) && dump.produtos[pid].length);
    if (temProdutos) m.push("produtos");
    if (ls["precifiq_custom_platforms"] != null || ls["precifiq_hidden_platforms"] != null || ls["precifiq_deleted_platforms"] != null) m.push("plataformas");
    if (ls["precifiq_empresa"] != null) m.push("empresas");
    if (ls["precifiq_dre"] != null) m.push("dre");
    if (ls["precifiq_vendas"] != null) m.push("vendas");
    if (ls[LEMBRETES_KEY] != null) m.push("lembretes");
    const nImagens = imagensZip
      ? imagensZip.length
      : (dump.imagens && typeof dump.imagens === "object" ? Object.keys(dump.imagens).length : 0);
    if (nImagens) m.push("imagens");
    return m;
  }

  // ── RESTAURAR (só os itens marcados, sem apagar nada) ───────
  // As fotos voltam ANTES dos produtos, com o mesmo código: os produtos
  // restaurados já as encontram. Os demais dados passam pelo importar()
  // de sempre, no modo "mesclar" (o que já existe aqui fica como está).
  async function restaurar(analise, selecao, onProgresso) {
    if (!analise || !analise.dump) throw new Error("Analise o arquivo antes de restaurar.");
    selecao = selecao || {};
    const prog = (msg) => { if (typeof onProgresso === "function") { try { onProgresso(msg); } catch (_) {} } };
    const dump = analise.dump;
    const resumo = {
      produtos: 0, empresas: 0, vendas: 0, plataformas: 0, lembretes: 0,
      imagens: 0, imagensJaExistiam: 0, imagensComProblema: 0, arquivos: 0, modulos: 0,
    };

    if (typeof initStorage === "function") {
      try { await initStorage(); } catch (_) {}
    }

    // 1. Imagens
    if (selecao.imagens) {
      if (analise.formato === "zip" && analise.zip) await _restaurarImagensDoZip(analise, resumo, prog);
      else await _restaurarImagensDoJson(dump.imagens, resumo, prog);
    }

    // 2. Demais dados — o mesmo importar() de sempre.
    const semImagens = Object.assign({}, dump, { imagens: {} });
    semImagens.localStorage = Object.assign({}, dump.localStorage || {});
    if (!selecao.lembretes) delete semImagens.localStorage[LEMBRETES_KEY];
    prog("Restaurando os dados…");
    const r = await importar(semImagens, {
      modo: "mesclar",
      produtos: !!selecao.produtos,
      empresas: !!selecao.empresas,
      vendas: !!selecao.vendas,
      financeiro: !!(selecao.dre || selecao.financeiro),
      plataformas: !!selecao.plataformas,
      notas: !!selecao.notas,
      documentos: !!selecao.documentos,
    });
    resumo.produtos = r.produtos || 0;
    resumo.empresas = r.empresas || 0;
    resumo.vendas = r.vendas || 0;
    resumo.plataformas = r.plataformas || 0;
    resumo.lembretes = r.lembretes || 0;
    resumo.eans = r.eans || 0;

    resumo.modulos = Object.keys(selecao).filter((k) => selecao[k]).length;
    prog("Concluído.");
    return resumo;
  }

  async function _restaurarImagensDoZip(analise, resumo, prog) {
    const lista = Array.isArray(analise.imagens) ? analise.imagens : _imagensDoZip(analise.zip, analise.dump);
    for (let i = 0; i < lista.length; i++) {
      const it = lista[i];
      if (i % 10 === 0) prog("Restaurando as imagens… " + (i + 1) + " de " + lista.length);
      try {
        if (await _imagemJaExiste(it.id)) { resumo.imagensJaExistiam++; continue; }
        const f = analise.zip.file(it.arquivo);
        if (!f) { resumo.imagensComProblema++; continue; }
        const tipo = _tipoValido(it.tipo) || _tipoDaExt(it.arquivo);
        if (!tipo) { resumo.imagensComProblema++; continue; }
        const b64 = await f.async("base64");
        if (!b64) { resumo.imagensComProblema++; continue; }
        await ImageStore.putWithId(it.id, "data:" + tipo + ";base64," + b64, it.nome || undefined);
        resumo.imagens++;
      } catch (e) {
        resumo.imagensComProblema++;
        _registrarErro("restaurar imagem " + (it && it.id), e);
      }
    }
  }

  // Backup .json (o formato de sempre): as fotos vêm em texto.
  async function _restaurarImagensDoJson(imagens, resumo, prog) {
    if (!imagens || typeof imagens !== "object" || typeof ImageStore === "undefined") return;
    const ids = Object.keys(imagens);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const dataUrl = imagens[id];
      if (i % 10 === 0) prog("Restaurando as imagens… " + (i + 1) + " de " + ids.length);
      if (!_idDeImagemValido(id) || typeof dataUrl !== "string" || dataUrl.indexOf("data:") !== 0) {
        resumo.imagensComProblema++;
        continue;
      }
      try {
        if (await _imagemJaExiste(id)) { resumo.imagensJaExistiam++; continue; }
        await ImageStore.putWithId(id, dataUrl);
        resumo.imagens++;
      } catch (e) {
        resumo.imagensComProblema++;
        _registrarErro("restaurar imagem " + id, e);
      }
    }
  }

  async function _imagemJaExiste(id) {
    try { return !!(await ImageStore.get(id)); } catch (_) { return false; }
  }

  // ── Imagens ↔ arquivos ──────────────────────────────────────
  function _idDeImagemValido(id) {
    if (typeof ImageStore !== "undefined" && typeof ImageStore.isImageId === "function") return ImageStore.isImageId(id);
    return typeof id === "string" && /^img_[0-9a-z]+_[0-9a-z]+$/.test(id);
  }

  // dataURL → { tipo, ext, bytes } (os bytes reais do arquivo de imagem).
  function _arquivoDaImagem(dataUrl) {
    const s = String(dataUrl || "");
    const virgula = s.indexOf(",");
    if (s.indexOf("data:") !== 0 || virgula < 0) throw new Error("A imagem não tem dados.");
    const partes = s.slice(5, virgula).split(";");
    const tipo = String(partes[0] || "").trim().toLowerCase();
    if (!_tipoValido(tipo)) throw new Error("Tipo de imagem desconhecido: " + tipo);
    const ehBase64 = partes.slice(1).some((p) => p.trim().toLowerCase() === "base64");
    const corpo = s.slice(virgula + 1);
    let bytes;
    if (ehBase64) {
      const bin = atob(corpo.replace(/\s/g, ""));
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      let texto;
      try { texto = decodeURIComponent(corpo); } catch (e) { texto = corpo; }
      bytes = new TextEncoder().encode(texto);
    }
    if (!bytes.length) throw new Error("A imagem está vazia.");
    return { tipo: tipo, ext: _extDoTipo(tipo), bytes: bytes };
  }

  const _EXT_POR_TIPO = {
    "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/pjpeg": ".jpg", "image/png": ".png",
    "image/webp": ".webp", "image/gif": ".gif", "image/svg+xml": ".svg", "image/bmp": ".bmp",
    "image/avif": ".avif", "image/x-icon": ".ico", "image/vnd.microsoft.icon": ".ico",
    "image/tiff": ".tif", "image/heic": ".heic", "image/heif": ".heif",
  };
  const _TIPO_POR_EXT = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
    ".gif": "image/gif", ".svg": "image/svg+xml", ".bmp": "image/bmp", ".avif": "image/avif",
    ".ico": "image/x-icon", ".tif": "image/tiff", ".tiff": "image/tiff", ".heic": "image/heic", ".heif": "image/heif",
  };

  // Só tipos de imagem voltam para o banco de imagens.
  function _tipoValido(tipo) {
    const t = String(tipo || "").trim().toLowerCase();
    return /^image\/[a-z0-9.+-]+$/.test(t) ? t : "";
  }
  function _extDoTipo(tipo) {
    if (_EXT_POR_TIPO[tipo]) return _EXT_POR_TIPO[tipo];
    const sub = String(tipo).split("/")[1] || "img";
    return "." + sub.replace(/[^a-z0-9]/g, "").slice(0, 8);
  }
  function _tipoDaExt(caminho) {
    const s = String(caminho || "").toLowerCase();
    const ponto = s.lastIndexOf(".");
    return ponto >= 0 ? _TIPO_POR_EXT[s.slice(ponto)] || "" : "";
  }

  function _dataLocal() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function _registrarErro(contexto, e) {
    try {
      if (typeof PrecifiqErros !== "undefined" && PrecifiqErros && typeof PrecifiqErros.registrar === "function") {
        PrecifiqErros.registrar("Backup: " + contexto, e && e.stack ? e.stack : String(e));
        return;
      }
    } catch (_) {}
    console.error("[Backup]", contexto, e);
  }

  // ── IMPORTAR ────────────────────────────────────────────────
  // opcoes.modo: "mesclar" (padrão) | "restaurar"
  //   mesclar   → adiciona o que falta, por id, sem tocar no que existe.
  //   restaurar → SUBSTITUI cada categoria selecionada pelo conteúdo do arquivo.
  async function importar(dump, opcoes) {
    opcoes = opcoes || {};
    const modo = opcoes.modo === "restaurar" ? "restaurar" : "mesclar";

    if (!dump || dump._app !== "precifiq") {
      throw new Error("Arquivo inválido. Não é um backup do Bapell Gestor Pro.");
    }

    const resumo = {
      modo, produtos: 0, empresas: 0, vendas: 0, plataformas: 0,
      imagens: 0, lembretes: 0, eans: 0, notas: 0, documentos: 0,
    };

    // ── 1. Imagens (para os produtos referenciarem) ──
    if (opcoes.produtos && dump.imagens && typeof ImageStore !== "undefined") {
      for (const id of Object.keys(dump.imagens)) {
        const dataUrl = dump.imagens[id];
        // Valida antes de gravar: string base64 de imagem.
        if (typeof dataUrl !== "string" || dataUrl.indexOf("data:") !== 0) continue;
        try {
          if (modo === "restaurar") {
            await ImageStore.putWithId(id, dataUrl); resumo.imagens++;
          } else {
            let existe = false;
            try { existe = !!(await ImageStore.get(id)); } catch (_) { existe = false; }
            if (!existe) { await ImageStore.putWithId(id, dataUrl); resumo.imagens++; }
          }
        } catch (e) { console.error("Falha ao importar imagem", id, e); }
      }
    }

    // ── 2. Produtos ──
    if (opcoes.produtos && dump.produtos && typeof dump.produtos === "object") {
      for (const pid of Object.keys(dump.produtos)) {
        const doArquivo = dump.produtos[pid];
        if (!Array.isArray(doArquivo)) continue; // arquivo malformado: pula a plataforma

        if (modo === "restaurar") {
          // Substitui a plataforma inteira pelo que está no arquivo.
          const validos = doArquivo.filter((p) => p && typeof p === "object" && p.id);
          if (typeof saveProducts === "function") await saveProducts(pid, validos);
          resumo.produtos += validos.length;
        } else {
          const atuais = (typeof getProducts === "function") ? getProducts(pid) : [];
          const idsExistentes = new Set(atuais.map((p) => p.id));
          const novos = doArquivo.filter((p) => p && typeof p === "object" && p.id && !idsExistentes.has(p.id));
          if (novos.length && typeof saveProducts === "function") {
            await saveProducts(pid, atuais.concat(novos));
          }
          resumo.produtos += novos.length;
        }
      }

      // Configs de campos por plataforma
      Object.keys(dump.localStorage || {}).forEach((key) => {
        if (PREFIXOS_PRODUTOS.some((pref) => key.startsWith(pref))) {
          if (modo === "restaurar" || localStorage.getItem(key) === null) {
            try { localStorage.setItem(key, dump.localStorage[key]); } catch (_) {}
          }
        }
      });
    }

    // ── 3. Empresas ──
    if (opcoes.empresas && dump.localStorage && dump.localStorage["precifiq_empresa"] !== undefined) {
      if (modo === "restaurar") {
        _substituir("precifiq_empresa", dump.localStorage["precifiq_empresa"]);
        resumo.empresas += _contarLista(dump.localStorage["precifiq_empresa"], "empresas");
      } else {
        resumo.empresas += _mesclarLista("precifiq_empresa", dump.localStorage["precifiq_empresa"], "empresas", "id");
      }
    }

    // ── 4. Vendas ──
    if (opcoes.vendas && dump.localStorage && dump.localStorage["precifiq_vendas"] !== undefined) {
      if (modo === "restaurar") {
        _substituir("precifiq_vendas", dump.localStorage["precifiq_vendas"]);
        resumo.vendas += _contarQualquer(dump.localStorage["precifiq_vendas"]);
      } else {
        resumo.vendas += _mesclarVendas(dump.localStorage["precifiq_vendas"]);
      }
    }

    // ── 5. Financeiro (DRE) ──
    if (opcoes.financeiro && dump.localStorage && dump.localStorage["precifiq_dre"] !== undefined) {
      if (modo === "restaurar") {
        _substituir("precifiq_dre", dump.localStorage["precifiq_dre"]);
        if (dump.localStorage["dreSistema"] !== undefined) _substituir("dreSistema", dump.localStorage["dreSistema"]);
      } else {
        _mesclarFinanceiro(dump.localStorage["precifiq_dre"]);
      }
    }

    // ── 6. Plataformas ──
    if (opcoes.plataformas && dump.localStorage) {
      if (modo === "restaurar") {
        ["precifiq_custom_platforms", "precifiq_hidden_platforms", "precifiq_deleted_platforms"].forEach((k) => {
          if (dump.localStorage[k] !== undefined) _substituir(k, dump.localStorage[k]);
        });
        resumo.plataformas += _contarQualquer(dump.localStorage["precifiq_custom_platforms"]);
      } else {
        if (dump.localStorage["precifiq_custom_platforms"]) {
          resumo.plataformas += _mesclarArraySimples("precifiq_custom_platforms", dump.localStorage["precifiq_custom_platforms"], "id");
        }
        if (dump.localStorage["precifiq_hidden_platforms"]) {
          _mesclarUniao("precifiq_hidden_platforms", dump.localStorage["precifiq_hidden_platforms"]);
        }
      }
    }

    // ── 7. Lembretes (sempre) ──
    if (dump.localStorage && dump.localStorage[LEMBRETES_KEY] !== undefined) {
      if (modo === "restaurar") {
        _substituir(LEMBRETES_KEY, dump.localStorage[LEMBRETES_KEY]);
        resumo.lembretes = _contarQualquer(dump.localStorage[LEMBRETES_KEY]);
      } else {
        resumo.lembretes = _mesclarArraySimples(LEMBRETES_KEY, dump.localStorage[LEMBRETES_KEY], "id");
      }
    }

    // ── 8. EANs (sempre) ──
    // O EAN é um OBJETO { empresaId: {proximoSeq, codigos[]}, _empresasLocais[] },
    // não um array. Mesclar une os códigos por ean e mantém o maior proximoSeq —
    // crítico para o contador não voltar e regerar um código já impresso.
    if (dump.localStorage && dump.localStorage[EANS_KEY] !== undefined) {
      if (modo === "restaurar") {
        _substituir(EANS_KEY, dump.localStorage[EANS_KEY]);
        resumo.eans = _contarQualquer(dump.localStorage[EANS_KEY]);
      } else {
        resumo.eans = _mesclarEans(dump.localStorage[EANS_KEY]);
      }
    }

    // Empresas de NF (cadastro)
    if (dump.localStorage && dump.localStorage[NF_EMPRESAS_KEY] !== undefined) {
      if (modo === "restaurar") {
        _substituir(NF_EMPRESAS_KEY, dump.localStorage[NF_EMPRESAS_KEY]);
      } else {
        _mesclarArraySimples(NF_EMPRESAS_KEY, dump.localStorage[NF_EMPRESAS_KEY], "id");
      }
    }

    // ── 9. Notas fiscais (PDFs/XMLs) ──
    if (opcoes.notas && dump.notas && typeof NotaStore !== "undefined" && NotaStore.putWithId) {
      for (const id of Object.keys(dump.notas)) {
        try {
          if (modo === "restaurar") { await NotaStore.putWithId(id, dump.notas[id]); resumo.notas++; }
          else {
            let existe = false;
            try { existe = !!(await NotaStore.get(id)); } catch (_) {}
            if (!existe) { await NotaStore.putWithId(id, dump.notas[id]); resumo.notas++; }
          }
        } catch (e) { console.error("Falha ao importar nota", id, e); }
      }
    }

    // ── 10. Documentos da empresa (ArquivoStore) ──
    if (opcoes.documentos && dump.documentos && typeof ArquivoStore !== "undefined" && ArquivoStore.putWithId) {
      for (const id of Object.keys(dump.documentos)) {
        try {
          if (modo === "restaurar") { await ArquivoStore.putWithId(id, dump.documentos[id]); resumo.documentos++; }
          else {
            let existe = false;
            try { existe = !!(await ArquivoStore.get(id)); } catch (_) {}
            if (!existe) { await ArquivoStore.putWithId(id, dump.documentos[id]); resumo.documentos++; }
          }
        } catch (e) { console.error("Falha ao importar documento", id, e); }
      }
    }

    return resumo;
  }

  // ── Helpers de substituição (modo restaurar) ────────────────
  function _substituir(storageKey, valorString) {
    try {
      if (valorString === null || valorString === undefined) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, valorString);
    } catch (e) { console.error("Falha ao restaurar", storageKey, e); }
  }
  function _contarLista(jsonNovo, listKey) {
    try { const o = JSON.parse(jsonNovo); return Array.isArray(o[listKey]) ? o[listKey].length : 0; }
    catch { return 0; }
  }
  function _contarQualquer(jsonNovo) {
    try {
      const o = JSON.parse(jsonNovo);
      if (Array.isArray(o)) return o.length;
      if (o && Array.isArray(o.empresas)) return o.empresas.length;
      if (o && typeof o === "object") return Object.keys(o).length;
      return 0;
    } catch { return 0; }
  }

  // ── Helpers de mesclagem (modo mesclar) ─────────────────────
  function _mesclarLista(storageKey, jsonNovo, listKey, idField) {
    let atual, novo;
    try { atual = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { atual = {}; }
    try { novo = JSON.parse(jsonNovo) || {}; } catch { return 0; }
    if (!Array.isArray(atual[listKey])) atual[listKey] = [];
    const novaLista = Array.isArray(novo[listKey]) ? novo[listKey] : [];
    const ids = new Set(atual[listKey].map((x) => x[idField]));
    let add = 0;
    novaLista.forEach((item) => {
      if (item && !ids.has(item[idField])) { atual[listKey].push(item); add++; }
    });
    if (!atual.ativaId && novo.ativaId) atual.ativaId = novo.ativaId;
    try { localStorage.setItem(storageKey, JSON.stringify(atual)); } catch (_) {}
    return add;
  }

  function _mesclarArraySimples(storageKey, jsonNovo, idField) {
    let atual, novo;
    try { atual = JSON.parse(localStorage.getItem(storageKey)) || []; } catch { atual = []; }
    try { novo = JSON.parse(jsonNovo) || []; } catch { return 0; }
    if (!Array.isArray(atual)) atual = [];
    const ids = new Set(atual.map((x) => x && x[idField]));
    let add = 0;
    (Array.isArray(novo) ? novo : []).forEach((item) => {
      if (item && !ids.has(item[idField])) { atual.push(item); add++; }
    });
    try { localStorage.setItem(storageKey, JSON.stringify(atual)); } catch (_) {}
    return add;
  }

  function _mesclarUniao(storageKey, jsonNovo) {
    let atual, novo;
    try { atual = JSON.parse(localStorage.getItem(storageKey)) || []; } catch { atual = []; }
    try { novo = JSON.parse(jsonNovo) || []; } catch { return; }
    const set = new Set([].concat(atual, novo));
    try { localStorage.setItem(storageKey, JSON.stringify([...set])); } catch (_) {}
  }

  // Mescla o mapa de EANs { empresaId: {proximoSeq, codigos[]} }. Para cada
  // empresa, une os códigos por ean e mantém o MAIOR proximoSeq — assim o
  // contador nunca volta e regera um código que já foi impresso em etiqueta.
  function _mesclarEans(jsonNovo) {
    let atual, novo;
    try { atual = JSON.parse(localStorage.getItem(EANS_KEY)) || {}; } catch { atual = {}; }
    try { novo = JSON.parse(jsonNovo) || {}; } catch { return 0; }
    if (!atual || typeof atual !== "object") atual = {};
    if (!novo || typeof novo !== "object") return 0;

    let add = 0;
    Object.keys(novo).forEach((empId) => {
      if (empId === "_empresasLocais") return;
      const nEmp = novo[empId];
      if (!nEmp) return;
      if (!atual[empId]) {
        atual[empId] = nEmp;
        add += Array.isArray(nEmp.codigos) ? nEmp.codigos.length : 0;
        return;
      }
      const porEan = new Map();
      (Array.isArray(atual[empId].codigos) ? atual[empId].codigos : []).forEach((c) => { if (c && c.ean) porEan.set(c.ean, c); });
      let antes = porEan.size;
      (Array.isArray(nEmp.codigos) ? nEmp.codigos : []).forEach((c) => { if (c && c.ean) porEan.set(c.ean, c); });
      atual[empId].codigos = Array.from(porEan.values());
      atual[empId].proximoSeq = Math.max(Number(atual[empId].proximoSeq) || 1, Number(nEmp.proximoSeq) || 1);
      add += porEan.size - antes;
    });

    // _empresasLocais: união por cnpj
    const locAtual = Array.isArray(atual._empresasLocais) ? atual._empresasLocais : [];
    const locNovo = Array.isArray(novo._empresasLocais) ? novo._empresasLocais : [];
    if (locAtual.length || locNovo.length) {
      const porCnpj = new Map();
      locAtual.concat(locNovo).forEach((e) => { if (e && e.cnpj) porCnpj.set(e.cnpj, e); });
      atual._empresasLocais = Array.from(porCnpj.values());
    }

    try { localStorage.setItem(EANS_KEY, JSON.stringify(atual)); } catch (_) {}
    return add;
  }

  function _mesclarVendas(jsonNovo) {
    let atual, novo;
    try { atual = JSON.parse(localStorage.getItem("precifiq_vendas")); } catch { atual = null; }
    try { novo = JSON.parse(jsonNovo); } catch { return 0; }

    if (Array.isArray(novo)) {
      if (!Array.isArray(atual)) atual = [];
      const ids = new Set(atual.map((v) => v.id));
      let add = 0;
      novo.forEach((v) => { if (v && !ids.has(v.id)) { atual.push(v); add++; } });
      try { localStorage.setItem("precifiq_vendas", JSON.stringify(atual)); } catch (_) {}
      return add;
    }
    // Formato objeto: se não existe local, adota; senão mantém local (o
    // mesclar não sobrescreve). Para trocar de verdade, use o modo restaurar.
    if (atual === null) {
      try { localStorage.setItem("precifiq_vendas", jsonNovo); } catch (_) {}
    }
    return 0;
  }

  function _mesclarFinanceiro(jsonNovo) {
    let atual, novo;
    try { atual = JSON.parse(localStorage.getItem("precifiq_dre")); } catch { atual = null; }
    try { novo = JSON.parse(jsonNovo); } catch { return; }
    if (!novo) return;

    if (!atual || !atual.dados || !Array.isArray(atual.empresas)) {
      try { localStorage.setItem("precifiq_dre", jsonNovo); } catch (_) {}
      return;
    }
    if (Array.isArray(novo.empresas)) {
      const ids = new Set(atual.empresas.map((e) => e.id));
      novo.empresas.forEach((e) => {
        if (e && !ids.has(e.id)) {
          atual.empresas.push(e);
          if (novo.dados && novo.dados[e.id]) atual.dados[e.id] = novo.dados[e.id];
        }
      });
      if (!atual.ativaId && novo.ativaId) atual.ativaId = novo.ativaId;
    }
    try { localStorage.setItem("precifiq_dre", JSON.stringify(atual)); } catch (_) {}
  }

  function rotulo(mod) { return (MODULOS[mod] && MODULOS[mod].rotulo) || mod; }
  function listaModulos() { return Object.keys(MODULOS); }

  return {
    exportar, exportarArquivo, importar,
    MODULOS, rotulo, listaModulos, analisarArquivo, restaurar,
  };
})();

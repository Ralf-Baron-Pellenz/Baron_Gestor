// ═══════════════════════════════════════════
//  Bapell Gestor Pro — registro-vendas.js  (v3)
//  Tela por blocos: Cliente (com endereço + cadastro) → Empresa/Plataforma → Produtos.
//  Clientes ficam salvos e podem ser localizados por CPF/CNPJ.
//  Total = soma dos produtos. Lança 1 venda no DRE (opcional por venda).
//  Botão "Gerar PDF" cria um orçamento/comprovante da venda montada.
// ═══════════════════════════════════════════

"use strict";

(function () {
  // ── Chaves ──
  var VENDAS_KEY = "precifiq_registro_vendas";
  var CLIENTES_KEY = "precifiq_rv_clientes";
  var DRE_KEY = "precifiq_dre";

  // ── Estado ──
  var vendas = [];
  var clientes = [];
  var rascunho = null;

  // ─────────────────────────────────────────
  //  UTILIDADES
  // ─────────────────────────────────────────
  function fmt(v) {
    if (typeof formatBRL === "function") return formatBRL(v);
    var n = parseFloat(v);
    if (isNaN(n)) n = 0;
    return "R$ " + n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  function parseNum(txt) {
    if (typeof txt === "number") return isFinite(txt) ? txt : 0;
    if (!txt) return 0;
    var clean = String(txt).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    var n = parseFloat(clean);
    return isFinite(n) ? n : 0;
  }
  function fmtData(iso) {
    if (!iso) return "—";
    var p = String(iso).split("-");
    if (p.length !== 3) return iso;
    return p[2] + "/" + p[1] + "/" + p[0];
  }
  function hojeISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function agoraTexto() { return new Date().toLocaleString("pt-BR"); }
  function genId() { return "v_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function soDigitos(s) { return String(s == null ? "" : s).replace(/\D/g, ""); }
  // A chave de um CPF/CNPJ: letras (CNPJ alfanumérico) e números, sem a
  // pontuação. Para os documentos só de números é o mesmo que soDigitos —
  // os clientes já salvos continuam se achando.
  function chaveDoc(s) { return String(s == null ? "" : s).toUpperCase().replace(/[^0-9A-Z]/g, ""); }

  // ── Obrigatórios em vermelho (utils.js) e responsável (senhas.js) ──
  // Os campos que faltam ficam vermelhos até serem preenchidos. Sem o
  // BapellCampos, fica só o aviso de sempre.
  function exigir(itens) {
    if (window.BapellCampos) return window.BapellCampos.exigir(itens);
    var falta = itens.filter(function (it) {
      return typeof it.vazio === "boolean" ? it.vazio : !String((it.el && it.el.value) || "").trim();
    })[0];
    if (falta) { toast(falta.msg, "warning"); return false; }
    return true;
  }
  function marcarErro(el, msg) {
    if (!el || !window.BapellCampos) return;
    window.BapellCampos.marcar(el, msg || null);
    window.BapellCampos.focar(el);
  }
  // O Responsável é escolhido entre os usuários de Dados da Empresa ›
  // Usuários e Senhas. Sem nenhum cadastrado, o campo fica vermelho e uma
  // janela leva ao cadastro.
  function semUsuarios(select) {
    var U = window.BapellUsuarios;
    if (!U || U.listar().length) return false;
    marcarErro(select);
    U.pedirCadastro();
    return true;
  }
  // Confere o responsável — quem tem senha só passa digitando a própria.
  // Resolve o usuário ({ id, nome }) ou null (cancelou).
  function confirmarResponsavel(select, acao) {
    var U = window.BapellUsuarios;
    if (!U) return Promise.resolve(select.value ? { id: "", nome: select.value } : null);
    return U.confirmarResponsavel(select.value, { acao: acao }).then(function (r) {
      if (r.ok) return r.usuario;
      if (r.motivo === "vazio") { marcarErro(select); toast("Escolha o responsável pelo lançamento.", "warning"); }
      return null;
    });
  }
  function toast(msg, tipo) { if (typeof showToast === "function") showToast(msg, tipo || "default"); }
  function registrarErro(ctx, e) {
    if (typeof PrecifiqErros !== "undefined" && PrecifiqErros.registrar) {
      PrecifiqErros.registrar(ctx, e && e.stack ? e.stack : String(e));
    }
  }

  // ─────────────────────────────────────────
  //  PERSISTÊNCIA — VENDAS
  // ─────────────────────────────────────────
  function carregarVendas() {
    try {
      var raw = JSON.parse(localStorage.getItem(VENDAS_KEY));
      if (Array.isArray(raw)) return raw.map(sanitizarVenda);
    } catch (e) { registrarErro("rv: carregar vendas", e); }
    return [];
  }
  function salvarVendas() {
    try { localStorage.setItem(VENDAS_KEY, JSON.stringify(vendas)); }
    catch (e) { registrarErro("rv: salvar vendas", e); toast("Erro ao salvar.", "error"); }
  }
  // Monta o endereço em uma linha a partir dos campos separados.
  // O campo único `endereco` continua existindo porque VENDAS JÁ SALVAS o
  // guardam (cada venda congela uma cópia do cliente) e o orçamento o imprime.
  // Se ele deixasse de ser preenchido, todo orçamento sairia sem endereço.
  function montarEndereco(c) {
    var partes = [];
    var rua = (c.rua || "").trim();
    var num = (c.numero || "").trim();
    // "Rua das Flores, 123" — o número gruda na rua, separado por vírgula.
    if (rua) partes.push(num ? rua + ", " + num : rua);
    else if (num) partes.push(num);
    if ((c.bairro || "").trim()) partes.push(c.bairro.trim());
    if ((c.cidade || "").trim()) partes.push(c.cidade.trim());
    if ((c.estado || "").trim()) partes.push(c.estado.trim());
    return partes.join(", ");
  }

  function sanitizarCliente(c) {
    if (!c || typeof c !== "object") c = {};

    var rua    = c.rua    || "";
    var numero = c.numero || "";
    var bairro = c.bairro || "";
    var cidade = c.cidade || "";
    var estado = c.estado || "";

    // Cliente ANTIGO: só tem o texto único em `endereco`, sem os campos
    // separados. O texto vai inteiro para "Rua / Avenida / Logradouro" e o
    // usuário redistribui. NÃO tentamos quebrar por vírgula: "Av. Brasil,
    // 1500, sala 2, Jardim América" viraria bagunça, e endereço errado em
    // orçamento é problema real. Nada é perdido e nada é adivinhado.
    var temSeparados = !!(rua || numero || bairro || cidade || estado);
    if (!temSeparados && c.endereco) rua = c.endereco;

    var sane = {
      nome: c.nome || "", doc: c.doc || "", telefone: c.telefone || "", email: c.email || "",
      cep: c.cep || "",
      rua: rua, numero: numero, bairro: bairro, cidade: cidade, estado: estado,
      endereco: "", complemento: c.complemento || "",
    };

    // O `endereco` é derivado dos campos acima. Só cai no valor antigo quando
    // não há nada a montar (cliente antigo ainda não reeditado).
    sane.endereco = montarEndereco(sane) || (c.endereco || "");
    return sane;
  }
  function sanitizarItem(it) {
    if (!it || typeof it !== "object") it = {};
    return {
      sku: it.sku || "", nome: it.nome || "",
      preco: Number(it.preco) || 0, qtd: Number(it.qtd) || 1,
      imagem: it.imagem || "",
      subtotal: (Number(it.preco) || 0) * (Number(it.qtd) || 1),
    };
  }
  function sanitizarVenda(v) {
    if (!v || typeof v !== "object") v = {};
    v.id = v.id || genId();
    v.numero = v.numero || "";
    v.cliente = sanitizarCliente(v.cliente);
    v.empresaId = v.empresaId || "";
    v.empresaNome = v.empresaNome || "";
    v.plataformaId = v.plataformaId || "";
    v.plataformaNome = v.plataformaNome || "";
    v.plataformaLivre = !!v.plataformaLivre;
    v.itens = Array.isArray(v.itens) ? v.itens.map(sanitizarItem) : [];
    v.pagamento = v.pagamento || "";
    v.parcelas = Number(v.parcelas) || 1;
    v.status = v.status || "Pendente";
    v.obs = v.obs || "";
    v.responsavel = v.responsavel || "";
    v.data = v.data || "";
    v.dreAuto = !!v.dreAuto;
    v.dreMovId = v.dreMovId || null;
    v.dreEmpresaId = v.dreEmpresaId || null;
    if (!Array.isArray(v.historico)) v.historico = [];
    var t = calcularTotais(v);
    v.totalProdutos = t.totalProdutos;
    v.totalVenda = t.totalVenda;
    return v;
  }

  // ─────────────────────────────────────────
  //  PERSISTÊNCIA — CLIENTES (salvos, localizáveis por CPF/CNPJ)
  // ─────────────────────────────────────────
  function carregarClientes() {
    try {
      var raw = JSON.parse(localStorage.getItem(CLIENTES_KEY));
      if (Array.isArray(raw)) return raw.map(sanitizarCliente);
    } catch (e) { registrarErro("rv: carregar clientes", e); }
    return [];
  }
  function salvarClientes() {
    try { localStorage.setItem(CLIENTES_KEY, JSON.stringify(clientes)); }
    catch (e) { registrarErro("rv: salvar clientes", e); }
  }
  // Insere ou atualiza o cliente na lista (deduplicado pelo CPF/CNPJ, sem a
  // pontuação — com as letras, no CNPJ alfanumérico)
  function upsertCliente(cli) {
    cli = sanitizarCliente(cli);
    var chave = chaveDoc(cli.doc);
    if (!chave) return; // sem documento não dá para deduplicar
    var idx = clientes.findIndex(function (c) { return chaveDoc(c.doc) === chave; });
    if (idx >= 0) clientes[idx] = cli; else clientes.push(cli);
    salvarClientes();
  }
  // Busca por CPF/CNPJ OU por nome
  function buscarClientes(termo) {
    var t = String(termo || "").trim().toLowerCase();
    if (!t) return [];
    var tDoc = chaveDoc(termo);
    return clientes.filter(function (c) {
      var achaDoc = tDoc && chaveDoc(c.doc).indexOf(tDoc) >= 0;
      var achaNome = (c.nome || "").toLowerCase().indexOf(t) >= 0;
      return achaDoc || achaNome;
    }).slice(0, 8);
  }
  function acharClientePorDoc(doc) {
    var chave = chaveDoc(doc);
    if (!chave) return null;
    return clientes.find(function (c) { return chaveDoc(c.doc) === chave; }) || null;
  }

  // ─────────────────────────────────────────
  //  TOTAIS  (total = soma dos produtos)
  // ─────────────────────────────────────────
  function calcularTotais(v) {
    var totalProdutos = 0;
    (v.itens || []).forEach(function (it) { totalProdutos += (Number(it.preco) || 0) * (Number(it.qtd) || 1); });
    return { totalProdutos: totalProdutos, totalVenda: totalProdutos };
  }

  // ─────────────────────────────────────────
  //  INTEGRAÇÃO COM O DRE
  // ─────────────────────────────────────────
  function lerContainerDre() {
    try {
      var raw = JSON.parse(localStorage.getItem(DRE_KEY));
      if (raw && raw.dados && Array.isArray(raw.empresas)) return raw;
    } catch (e) {}
    return { empresas: [], ativaId: null, dados: {}, seguranca: null, senhaPerguntada: false };
  }
  function salvarContainerDre(c) {
    try { localStorage.setItem(DRE_KEY, JSON.stringify(c)); return true; }
    catch (e) { registrarErro("rv: salvar DRE", e); return false; }
  }
  // Item 6: as empresas vêm do cadastro central (precifiq_empresa), não mais
  // da lista do DRE. O lançamento financeiro continua indo para o DRE, mas a
  // ponte é feita em garantirEmpresaNoDre() na hora de lançar.
  function listarEmpresas() {
    var out = [];
    try {
      var raw = JSON.parse(localStorage.getItem(EMPRESA_KEY));
      if (raw && Array.isArray(raw.empresas)) {
        out = raw.empresas.map(function (e, i) {
          return {
            id: e.id,
            nome: e.nomeAba || e.nomeFantasia || e.razaoSocial || ("Empresa " + (i + 1)),
            logo: e.logo || "",
          };
        });
      }
      return { empresas: out, ativaId: (raw && raw.ativaId) || (out[0] && out[0].id) || null };
    } catch (e) {}
    return { empresas: [], ativaId: null };
  }
  // ── Dados do emitente (cadastro da tela Empresas) ──────────
  // A venda guarda o id da empresa no DRE. O cadastro completo (CNPJ, IE,
  // endereço) vive em "precifiq_empresa", que é outra lista. A ponte é feita
  // pelo origemEmpresaId gravado na empresa do DRE; para empresas antigas,
  // que não têm esse vínculo, cai no casamento por nome.
  var EMPRESA_KEY = "precifiq_empresa";

  function _normNome(t) {
    return String(t || "").trim().toLowerCase();
  }

  function dadosEmitente(empresaId) {
    var vazio = { encontrado: false, razaoSocial: "", nomeFantasia: "", cnpj: "", ie: "",
                  endereco: "", contato: "", logo: "" };
    if (!empresaId) return vazio;

    // Item 6: a venda guarda o id do CADASTRO (precifiq_empresa). Busca direto lá.
    var cadastro = null;
    try {
      var raw = JSON.parse(localStorage.getItem(EMPRESA_KEY));
      var lista = (raw && Array.isArray(raw.empresas)) ? raw.empresas : [];
      cadastro = lista.find(function (e) { return e && e.id === empresaId; }) || null;

      // Retrocompatibilidade: vendas ANTIGAS guardavam o id do DRE. Se não achou
      // no cadastro, tenta resolver via DRE (origemEmpresaId ou nome).
      if (!cadastro) {
        var cont = lerContainerDre();
        var noDre = (cont.empresas || []).find(function (e) { return e && e.id === empresaId; });
        if (noDre) {
          if (noDre.origemEmpresaId) {
            cadastro = lista.find(function (e) { return e && e.id === noDre.origemEmpresaId; }) || null;
          }
          if (!cadastro) {
            var alvo = _normNome(noDre.nome);
            cadastro = lista.find(function (e) {
              return e && (_normNome(e.nomeAba) === alvo || _normNome(e.nomeFantasia) === alvo || _normNome(e.razaoSocial) === alvo);
            }) || null;
          }
          if (!cadastro) {
            // Sem cadastro: usa o nome e a logo que o DRE tem.
            return { encontrado: false, razaoSocial: noDre.nome || "", nomeFantasia: "",
                     cnpj: "", ie: "", endereco: "", contato: "", logo: noDre.logo || "" };
          }
        }
      }
    } catch (e) {}

    if (!cadastro) return vazio;

    var ruaPartes = [];
    if (cadastro.logradouro) ruaPartes.push(cadastro.logradouro);
    if (cadastro.numero) ruaPartes.push(cadastro.numero);
    var linha1 = ruaPartes.join(", ");
    if (cadastro.complemento) linha1 += (linha1 ? " - " : "") + cadastro.complemento;

    var cidadePartes = [];
    if (cadastro.bairro) cidadePartes.push(cadastro.bairro);
    if (cadastro.municipio) cidadePartes.push(cadastro.municipio + (cadastro.uf ? "/" + cadastro.uf : ""));
    else if (cadastro.uf) cidadePartes.push(cadastro.uf);
    if (cadastro.cep) cidadePartes.push("CEP " + cadastro.cep);
    var linha2 = cidadePartes.join(" · ");

    var contatos = [];
    if (cadastro.fixo) contatos.push(cadastro.fixo);
    if (cadastro.celular) contatos.push(cadastro.celular);
    else if (cadastro.whatsapp) contatos.push(cadastro.whatsapp);
    if (cadastro.email) contatos.push(cadastro.email);

    return {
      encontrado: true,
      razaoSocial: cadastro.razaoSocial || cadastro.nomeFantasia || cadastro.nomeAba || "",
      nomeFantasia: cadastro.nomeFantasia || "",
      cnpj: cadastro.cnpj || "",
      ie: cadastro.ie || "",
      endereco: [linha1, linha2].filter(Boolean).join(" — "),
      contato: contatos.join(" · "),
      logo: cadastro.logo || "",
    };
  }

  // Logo da empresa (lida do cadastro na hora). Não guardamos a logo dentro de
  // cada venda de propósito: seriam milhares de cópias do mesmo base64 no disco.
  function logoDaEmpresa(empresaId) {
    if (!empresaId) return "";
    try {
      var raw = JSON.parse(localStorage.getItem(EMPRESA_KEY));
      var lista = (raw && Array.isArray(raw.empresas)) ? raw.empresas : [];
      var e = lista.find(function (x) { return x && x.id === empresaId; });
      return (e && e.logo) || "";
    } catch (err) { return ""; }
  }

  // Nome amigável de uma empresa do cadastro (para gravar no DRE ao criar ponte)
  function _nomeEmpresaCadastro(empresaId) {
    try {
      var raw = JSON.parse(localStorage.getItem(EMPRESA_KEY));
      var lista = (raw && Array.isArray(raw.empresas)) ? raw.empresas : [];
      var e = lista.find(function (x) { return x && x.id === empresaId; });
      if (e) return e.nomeAba || e.nomeFantasia || e.razaoSocial || "Empresa";
    } catch (err) {}
    return "Empresa";
  }

  // ── Ponte Vendas → DRE ────────────────────────────────────
  // A venda guarda o id do CADASTRO (precifiq_empresa). Mas o lançamento
  // financeiro vive no DRE, que tem a própria lista de empresas. Esta função
  // garante que exista no DRE uma empresa correspondente ao cadastro e devolve
  // o id DELA no DRE:
  //   1) procura por origemEmpresaId (vínculo firme);
  //   2) senão, por nome (empresas antigas do DRE, criadas antes do vínculo) —
  //      e nesse caso GRAVA o origemEmpresaId para firmar o laço;
  //   3) senão, cria uma nova empresa no DRE com store vazio.
  // Retorna o id da empresa no DRE (ou "" se não deu para salvar).
  function garantirEmpresaNoDre(empresaCadastroId) {
    if (!empresaCadastroId) return "";
    var container = lerContainerDre();
    if (!Array.isArray(container.empresas)) container.empresas = [];
    if (!container.dados || typeof container.dados !== "object") container.dados = {};

    // 1) vínculo firme
    var alvo = container.empresas.find(function (e) {
      return e && e.origemEmpresaId === empresaCadastroId;
    });

    // 2) casamento por nome (empresa antiga do DRE) → firma o vínculo
    if (!alvo) {
      var nome = _nomeEmpresaCadastro(empresaCadastroId);
      var alvoNome = _normNome(nome);
      alvo = container.empresas.find(function (e) {
        return e && !e.origemEmpresaId && _normNome(e.nome) === alvoNome;
      });
      if (alvo) {
        alvo.origemEmpresaId = empresaCadastroId;
        salvarContainerDre(container);
      }
    }

    // 3) cria nova no DRE
    if (!alvo) {
      var id = (typeof generateId === "function")
        ? "emp_" + generateId()
        : "emp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      alvo = {
        id: id,
        nome: _nomeEmpresaCadastro(empresaCadastroId),
        logo: logoDaEmpresa(empresaCadastroId),
        origemEmpresaId: empresaCadastroId,
      };
      container.empresas.push(alvo);
      container.dados[id] = {
        movimentacoes: [], camposOcultos: [], secoesCustom: [], ordemSecoes: [],
        meta: 0, camposVenda: [], camposDespesa: [], metaComemorada: 0,
      };
      if (!container.ativaId) container.ativaId = id;
      if (!salvarContainerDre(container)) return "";
    }

    return alvo.id;
  }
  function lancarNoDre(v, movIdExistente) {
    // v.empresaId é o id do CADASTRO. Traduz para a empresa correspondente no
    // DRE (criando/vinculando se preciso).
    var dreEmpresaId = garantirEmpresaNoDre(v.empresaId);
    if (!dreEmpresaId) return { ok: false, motivo: "empresa_inexistente" };
    var container = lerContainerDre();
    if (!container.dados[dreEmpresaId]) return { ok: false, motivo: "empresa_inexistente" };
    var store = container.dados[dreEmpresaId];
    if (!Array.isArray(store.movimentacoes)) store.movimentacoes = [];
    var t = calcularTotais(v);
    var bruto = t.totalVenda;
    var agora = Date.now();
    var canal = v.plataformaNome || "Loja Física";
    // Descrição padrão dos pedidos trazidos para o DRE. O detalhe da venda
    // (cliente, itens, nº) continua guardado na própria venda e no campo
    // origemVendaId do lançamento, que aponta de volta para ela.
    var descricao = "Pedido Importado";
    var mov = {
      id: movIdExistente || agora, tipo: "Venda", data: v.data || hojeISO(),
      canalCategoria: canal, descricao: descricao, bruto: bruto, deducoes: 0,
      taxasDetalhes: { taxa: 0, frete: 0, imposto: 0 }, camposExtras: [],
      liquido: bruto, modoLiquido: false, responsavel: v.responsavel || "",
      criadoEm: movIdExistente || agora, atualizadoEm: agora, editado: !!movIdExistente,
      origemVendaId: v.id,
    };
    if (movIdExistente) {
      var idx = store.movimentacoes.findIndex(function (m) { return m.id === movIdExistente; });
      if (idx >= 0) { mov.criadoEm = store.movimentacoes[idx].criadoEm || mov.criadoEm; store.movimentacoes[idx] = mov; }
      else store.movimentacoes.push(mov);
    } else store.movimentacoes.push(mov);
    return salvarContainerDre(container)
      ? { ok: true, movId: mov.id, dreEmpresaId: dreEmpresaId }
      : { ok: false, motivo: "falha_salvar" };
  }
  function removerDoDre(v) {
    if (!v.dreMovId) return;
    // A venda guarda o id do CADASTRO em empresaId; o lançamento está sob a
    // empresa do DRE. Usa o dreEmpresaId salvo na venda, ou resolve pela ponte.
    var dreEmpresaId = v.dreEmpresaId || garantirEmpresaNoDre(v.empresaId);
    if (!dreEmpresaId) return;
    var c = lerContainerDre();
    var store = c.dados[dreEmpresaId];
    if (!store || !Array.isArray(store.movimentacoes)) return;
    store.movimentacoes = store.movimentacoes.filter(function (m) { return m.id !== v.dreMovId; });
    salvarContainerDre(c);
  }

  // ─────────────────────────────────────────
  //  PLATAFORMAS E PREÇO POR SKU
  // ─────────────────────────────────────────
  function listarPlataformas() {
    if (typeof PLATFORMS_CONFIG === "undefined") return [];
    var deletadas = [];
    try { deletadas = JSON.parse(localStorage.getItem("precifiq_deleted_platforms")) || []; } catch (e) {}
    return PLATFORMS_CONFIG
      .filter(function (p) { return deletadas.indexOf(p.id) < 0; })
      .map(function (p) { return { id: p.id, nome: p.name || p.id }; });
  }
  function buscarProdutoNaPlataforma(sku, plataformaId) {
    if (!sku || !plataformaId || typeof getProducts !== "function") return null;
    var alvo = String(sku).trim().toUpperCase();
    var produtos = getProducts(plataformaId) || [];
    var achado = produtos.find(function (p) { return p && (p.sku || "").trim().toUpperCase() === alvo; });
    if (!achado) return null;
    return { sku: achado.sku || sku, nome: achado.name || "", preco: Number(achado.finalPrice) || 0, imagem: achado.image || "" };
  }
  function sugerirProdutos(termo, plataformaId) {
    if (!termo || !plataformaId || typeof getProducts !== "function") return [];
    var t = String(termo).trim().toUpperCase();
    var produtos = getProducts(plataformaId) || [];
    return produtos.filter(function (p) {
      return p && ((p.sku || "").toUpperCase().indexOf(t) >= 0 || (p.name || "").toUpperCase().indexOf(t) >= 0);
    }).slice(0, 10).map(function (p) {
      return { sku: p.sku || "", nome: p.name || "", preco: Number(p.finalPrice) || 0, imagem: p.image || "" };
    });
  }

  // ── Ordem de busca das plataformas: Loja Física SEMPRE primeiro ──
  // A Loja Física é uma plataforma cadastrada como as outras; identificamos
  // pelo nome (aceita "loja física", "loja fisica", só "física", etc.). Depois
  // dela vêm as demais na ordem em que estão cadastradas.
  function _ehLojaFisica(nome) {
    var n = String(nome || "").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // tira acentos
    return n.indexOf("loja fisica") >= 0 || n === "fisica" || n.indexOf("loja física") >= 0;
  }
  function _plataformasOrdenadas() {
    var todas = listarPlataformas();
    var fisica = [], demais = [];
    todas.forEach(function (p) { (_ehLojaFisica(p.nome) ? fisica : demais).push(p); });
    return fisica.concat(demais); // Loja Física primeiro, depois o resto
  }
  // Procura um SKU EXATO percorrendo as plataformas na ordem (Loja Física →
  // demais) e PARA na primeira em que encontrar. Devolve os dados do produto
  // já com a plataforma de origem, ou null se não achar em lugar nenhum.
  function buscarSkuGlobal(sku) {
    if (!sku) return null;
    var ordem = _plataformasOrdenadas();
    for (var i = 0; i < ordem.length; i++) {
      var achado = buscarProdutoNaPlataforma(sku, ordem[i].id);
      if (achado) {
        achado.plataformaId = ordem[i].id;
        achado.plataformaNome = ordem[i].nome;
        return achado; // interrompe a busca no primeiro acerto
      }
    }
    return null;
  }
  // Sugestões por termo PARCIAL (SKU ou nome), também na ordem Loja Física →
  // demais. Junta os resultados de todas as plataformas sem repetir o mesmo SKU,
  // priorizando o que vier da Loja Física.
  function sugerirProdutosGlobal(termo) {
    if (!termo) return [];
    var ordem = _plataformasOrdenadas();
    var vistos = {};
    var out = [];
    for (var i = 0; i < ordem.length && out.length < 12; i++) {
      var achados = sugerirProdutos(termo, ordem[i].id);
      for (var j = 0; j < achados.length; j++) {
        var chave = (achados[j].sku || "").trim().toUpperCase() || ("__" + achados[j].nome);
        if (vistos[chave]) continue;
        vistos[chave] = true;
        achados[j].plataformaId = ordem[i].id;
        achados[j].plataformaNome = ordem[i].nome;
        out.push(achados[j]);
        if (out.length >= 12) break;
      }
    }
    return out;
  }

  // ── Expõe para as próximas partes ──
  window.__RV = {
    getVendas: function () { return vendas; }, setVendas: function (a) { vendas = a; },
    getClientes: function () { return clientes; }, setClientes: function (a) { clientes = a; },
    getRascunho: function () { return rascunho; }, setRascunho: function (r) { rascunho = r; },
    fmt: fmt, parseNum: parseNum, fmtData: fmtData, hojeISO: hojeISO, soDigitos: soDigitos, chaveDoc: chaveDoc,
    exigir: exigir, marcarErro: marcarErro, semUsuarios: semUsuarios, confirmarResponsavel: confirmarResponsavel,
    agoraTexto: agoraTexto, genId: genId, esc: esc, toast: toast, registrarErro: registrarErro,
    carregarVendas: carregarVendas, salvarVendas: salvarVendas, sanitizarVenda: sanitizarVenda, sanitizarItem: sanitizarItem, sanitizarCliente: sanitizarCliente,
    carregarClientes: carregarClientes, salvarClientes: salvarClientes, upsertCliente: upsertCliente, buscarClientes: buscarClientes, acharClientePorDoc: acharClientePorDoc,
    calcularTotais: calcularTotais,
    listarEmpresas: listarEmpresas, logoDaEmpresa: logoDaEmpresa, dadosEmitente: dadosEmitente, lancarNoDre: lancarNoDre, removerDoDre: removerDoDre, garantirEmpresaNoDre: garantirEmpresaNoDre,
    listarPlataformas: listarPlataformas, buscarProdutoNaPlataforma: buscarProdutoNaPlataforma, sugerirProdutos: sugerirProdutos,
    buscarSkuGlobal: buscarSkuGlobal, sugerirProdutosGlobal: sugerirProdutosGlobal,
    init: {},
  };
})();

// ═══════════════════════════════════════════
//  PARTE 2 — UI: blocos, modais, carrinho, PDF
// ═══════════════════════════════════════════
(function () {
  var RV = window.__RV;
  var $ = function (id) { return document.getElementById(id); };
  var fmt = RV.fmt, parseNum = RV.parseNum, esc = RV.esc, toast = RV.toast, hojeISO = RV.hojeISO, genId = RV.genId, fmtData = RV.fmtData;

  // Miniatura do produto: usa a foto (base64 já salva no produto) ou um ícone
  // neutro quando o produto não tem imagem.
  function miniatura(src, tamanho) {
    var t = tamanho || 40;
    if (src) {
      return '<img src="' + src + '" alt="" style="width:' + t + 'px;height:' + t + 'px;object-fit:cover;border-radius:6px;border:1px solid var(--clr-border);flex-shrink:0;">';
    }
    var ic = Math.round(t * 0.5);
    return '<div style="width:' + t + 'px;height:' + t + 'px;background:var(--clr-surface-alt);border:1px solid var(--clr-border);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--clr-text-3);flex-shrink:0;">' +
      '<svg width="' + ic + '" height="' + ic + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>';
  }
  RV.miniatura = miniatura;

  // Logo da empresa: usa a imagem cadastrada ou um ícone de prédio como espaço
  // reservado, para o campo não "pular" quando a empresa não tem logo.
  function logoEmpresa(src, tamanho) {
    var t = tamanho || 34;
    if (src) {
      return '<img src="' + src + '" alt="" style="width:' + t + 'px;height:' + t + 'px;object-fit:cover;border-radius:6px;border:1px solid var(--clr-border);flex-shrink:0;">';
    }
    var ic = Math.round(t * 0.55);
    return '<div style="width:' + t + 'px;height:' + t + 'px;background:var(--clr-surface-alt);border:1px solid var(--clr-border);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--clr-text-3);flex-shrink:0;">' +
      '<svg width="' + ic + '" height="' + ic + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"></rect><path d="M9 22v-4h6v4"></path><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01"></path></svg></div>';
  }
  RV.logoEmpresa = logoEmpresa;

  // Foto do produto escolhido na busca — vai junto para o item do carrinho.
  var _imagemSelecionada = "";

  function novoRascunho() {
    return {
      id: genId(), numero: "",
      cliente: { nome: "", doc: "", telefone: "", email: "", cep: "", endereco: "", complemento: "" },
      empresaId: "", empresaNome: "",
      // Item 4: a venda manual usa sempre a "Loja Física" como plataforma padrão.
      // Não há mais escolha de plataforma no registro de vendas.
      plataformaId: "", plataformaNome: "Loja Física", plataformaLivre: true,
      itens: [],
      pagamento: "Pix", parcelas: 1, status: "Pendente", obs: "", responsavel: "",
      data: hojeISO(), dreAuto: false, dreMovId: null, dreEmpresaId: null, historico: [],
    };
  }
  RV.novoRascunho = novoRascunho;

  document.addEventListener("DOMContentLoaded", function () {
  // ── Máscara numérica ──────────────────────────────────────────────
  // Formata o valor conforme o usuário digita, pelos centavos:
  // 1 → 0,01 · 12 → 0,12 · 1265 → 12,65 · 126500 → 1.265,00.
  // A função vive no utils.js, compartilhada com as demais telas.
  // Alcança apenas .money-input e .percent-input: campos de quantidade,
  // CEP, CPF/CNPJ e telefone ficam de fora de propósito.
  if (typeof ativarMascarasNumericas === "function") ativarMascarasNumericas();

    try { if (typeof setDateHeader === "function") setDateHeader(); } catch (e) {}

    RV.setVendas(RV.carregarVendas());
    RV.setClientes(RV.carregarClientes());
    RV.setRascunho(novoRascunho());

    ligarBlocoCliente();
    ligarBlocoEmpresa();
    ligarBlocoProdutos();
    ligarAcoes();
    ligarEdicaoItem();

    if (RV.init.ligarFiltros) RV.init.ligarFiltros();

    atualizarResumoBlocos();
    if (RV.renderKPIs) RV.renderKPIs();
    if (RV.renderListaVendas) RV.renderListaVendas();
  });

  // Liga os controles do modal de edição rápida do item.
  function ligarEdicaoItem() {
    var salvar = $("meiSalvar"), remover = $("meiRemover");
    if (salvar) salvar.addEventListener("click", salvarItemEditado);
    if (remover) remover.addEventListener("click", removerItemEditado);
    ["meiQtd", "meiPreco"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("input", atualizarSubtotalModal);
    });
    var q = $("meiQtd");
    if (q) q.addEventListener("keydown", function (e) { if (e.key === "Enter") salvarItemEditado(); });
    var pr = $("meiPreco");
    if (pr) pr.addEventListener("keydown", function (e) { if (e.key === "Enter") salvarItemEditado(); });
  }

  // ─────────────────────────────────────────
  //  BLOCO CLIENTE (localizar por CPF + endereço)
  // ─────────────────────────────────────────
  // ─────────────────────────────────────────
  //  MÁSCARAS DOS CAMPOS DO CLIENTE
  //  Mesma lógica já usada na tela de Empresa, para o comportamento ser
  //  idêntico nas duas telas.
  // ─────────────────────────────────────────
  function aplicarMascara(valor, tipo) {
    if (!valor) return "";
    // CPF/CNPJ: o mesmo formato da tela Dados da Empresa, que aceita o
    // CNPJ alfanumérico (letras nas 12 primeiras posições).
    if (tipo === "cpfCnpj" && window.BapellDoc) return window.BapellDoc.formatarCPFouCNPJ(valor);
    var v = String(valor).replace(/\D/g, ""); // só dígitos

    if (tipo === "cpfCnpj") {
      // Até 11 dígitos é CPF; acima disso, CNPJ. A troca acontece enquanto
      // a pessoa digita, sem ela precisar escolher o tipo.
      if (v.length <= 11) {
        v = v.replace(/(\d{3})(\d)/, "$1.$2");
        v = v.replace(/(\d{3})(\d)/, "$1.$2");
        v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
        return v;
      }
      v = v.slice(0, 14);
      v = v.replace(/^(\d{2})(\d)/, "$1.$2");
      v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
      v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
      v = v.replace(/(\d{4})(\d)/, "$1-$2");
      return v;
    }

    if (tipo === "cep") {
      v = v.slice(0, 8);
      return v.replace(/^(\d{5})(\d)/, "$1-$2");
    }

    if (tipo === "telefone") {
      v = v.slice(0, 11);
      // 11 dígitos = celular com o 9; 10 = fixo.
      if (v.length > 10) {
        v = v.replace(/^(\d{2})(\d)/g, "($1) $2");
        v = v.replace(/(\d{5})(\d)/, "$1-$2");
        return v;
      }
      if (v.length > 0) {
        v = v.replace(/^(\d{2})(\d)/g, "($1) $2");
        v = v.replace(/(\d{4})(\d)/, "$1-$2");
        return v;
      }
    }
    return v;
  }

  function ligarMascarasCliente() {
    // CPF/CNPJ: máscara e conferência dos dígitos ao sair do campo (o
    // documento que não confere fica vermelho, com a explicação embaixo).
    var temDoc = !!(window.BapellDoc && $("mcDoc"));
    if (temDoc) window.BapellDoc.ligar($("mcDoc"), "cpfCnpj");
    [["mcDoc", "cpfCnpj"], ["mcTelefone", "telefone"], ["mcCep", "cep"]]
      .forEach(function (par) {
        var el = $(par[0]);
        if (!el) return;
        if (par[0] === "mcDoc" && temDoc) return; // já ligado acima
        el.addEventListener("input", function () {
          el.value = aplicarMascara(el.value, par[1]);
          // Cursor no fim: a máscara sempre cresce pela direita.
          try { var f = el.value.length; el.setSelectionRange(f, f); } catch (e) {}
        });
        // Cobre também valor colado ou carregado de um cliente existente.
        el.addEventListener("blur", function () {
          el.value = aplicarMascara(el.value, par[1]);
        });
      });
  }

  function ligarBlocoCliente() {
    $("blocoCliente").addEventListener("click", abrirModalCliente);
    $("mcSalvar").addEventListener("click", salvarCliente);
    ligarMascarasCliente();

    // localizar cliente salvo por CPF/CNPJ ou nome
    var input = $("mcBuscaCpf");
    var box = $("mcBuscaSuggest");
    var timer = null;
    input.addEventListener("input", function () {
      clearTimeout(timer);
      var termo = input.value.trim();
      if (termo.length < 1) { box.classList.remove("show"); box.innerHTML = ""; return; }
      timer = setTimeout(function () { mostrarSugestoesCliente(termo); }, 150);
    });
    input.addEventListener("blur", function () { setTimeout(function () { box.classList.remove("show"); }, 180); });

    function mostrarSugestoesCliente(termo) {
      var achados = RV.buscarClientes(termo);
      if (!achados.length) {
        box.innerHTML = '<div class="rv-sku-item"><div class="rv-sku-item__name">Nenhum cliente salvo com esse CPF/nome</div><div class="rv-sku-item__meta">Preencha abaixo para cadastrar um novo.</div></div>';
        box.classList.add("show");
        return;
      }
      box.innerHTML = achados.map(function (c, i) {
        return '<div class="rv-sku-item" data-cli="' + i + '">' +
          '<div class="rv-sku-item__sku">' + esc(c.nome || "(sem nome)") + '</div>' +
          '<div class="rv-sku-item__name">' + esc(c.doc || "sem documento") + '</div>' +
          (c.telefone ? '<div class="rv-sku-item__meta">' + esc(c.telefone) + '</div>' : '') +
          '</div>';
      }).join("");
      box.classList.add("show");
      Array.prototype.forEach.call(box.querySelectorAll("[data-cli]"), function (item) {
        item.addEventListener("mousedown", function (ev) {
          ev.preventDefault();
          preencherCliente(achados[+item.dataset.cli]);
          box.classList.remove("show");
        });
      });
    }
  }

  function preencherCliente(c) {
    c = RV.sanitizarCliente(c); // garante os campos separados p/ cliente antigo
    $("mcNome").value = c.nome || "";
    $("mcDoc").value = c.doc || "";
    $("mcTelefone").value = c.telefone || "";
    $("mcEmail").value = c.email || "";
    $("mcCep").value = c.cep || "";
    $("mcRua").value = c.rua || "";
    $("mcNumero").value = c.numero || "";
    $("mcBairro").value = c.bairro || "";
    $("mcCidade").value = c.cidade || "";
    $("mcEstado").value = c.estado || "";
    $("mcEndereco").value = c.endereco || "";
    $("mcComplemento").value = c.complemento || "";
    toast("Cliente carregado.", "success");
  }

  function abrirModalCliente() {
    var r = RV.getRascunho();
    var c = RV.sanitizarCliente(r.cliente);
    $("mcBuscaCpf").value = "";
    $("mcBuscaSuggest").classList.remove("show");
    $("mcNome").value = c.nome || "";
    $("mcDoc").value = c.doc || "";
    $("mcTelefone").value = c.telefone || "";
    $("mcEmail").value = c.email || "";
    $("mcCep").value = c.cep || "";
    $("mcRua").value = c.rua || "";
    $("mcNumero").value = c.numero || "";
    $("mcBairro").value = c.bairro || "";
    $("mcCidade").value = c.cidade || "";
    $("mcEstado").value = c.estado || "";
    $("mcEndereco").value = c.endereco || "";
    $("mcComplemento").value = c.complemento || "";
    abrirModal("modalCliente");
    setTimeout(function () { $("mcBuscaCpf").focus(); }, 50);
  }

  function salvarCliente() {
    var nome = $("mcNome").value.trim();
    var doc = $("mcDoc").value.trim();
    if (!RV.exigir([
      { el: $("mcNome"), msg: "Informe o nome do comprador." },
      { el: $("mcDoc"), msg: "Informe o CPF ou CNPJ." },
    ])) return;
    // O documento precisa conferir (dígitos verificadores do CPF ou do CNPJ).
    var erroDoc = window.BapellDoc ? window.BapellDoc.erroDe(doc, "cpfCnpj") : null;
    if (erroDoc) {
      RV.marcarErro($("mcDoc"), erroDoc);
      toast(erroDoc, "warning");
      return;
    }
    // O `endereco` NÃO é lido da tela: o sanitizarCliente o monta a partir dos
    // campos separados, para os dois nunca divergirem.
    var cli = RV.sanitizarCliente({
      nome: nome, doc: doc,
      telefone: $("mcTelefone").value.trim(), email: $("mcEmail").value.trim(),
      cep: $("mcCep").value.trim(),
      rua: $("mcRua").value.trim(), numero: $("mcNumero").value.trim(),
      bairro: $("mcBairro").value.trim(), cidade: $("mcCidade").value.trim(),
      estado: $("mcEstado").value.trim(),
      complemento: $("mcComplemento").value.trim(),
    });
    var r = RV.getRascunho();
    r.cliente = cli;
    RV.upsertCliente(cli); // fica salvo para localizar depois
    fecharModais();
    atualizarResumoBlocos();
    toast("Comprador salvo.", "success");
  }

  // ─────────────────────────────────────────
  //  BLOCO EMPRESA + PLATAFORMA
  // ─────────────────────────────────────────
  function ligarBlocoEmpresa() {
    $("blocoEmpresa").addEventListener("click", abrirModalEmpresa);
    $("meSalvar").addEventListener("click", salvarEmpresa);
    $("meEmpresa").addEventListener("change", atualizarLogoEmpresaSelecionada);
    // Item 4/6: plataforma não é mais escolhida aqui (é sempre Loja Física).
    // O botão "Cadastrar nova empresa" leva à tela Empresas quando preciso.
    var btnCad = $("meCadastrarEmpresa");
    if (btnCad) btnCad.addEventListener("click", function () { window.location.href = "empresa.html"; });
  }
  // Mostra a logo da empresa escolhida ao lado do campo de seleção.
  function atualizarLogoEmpresaSelecionada() {
    var alvo = $("meEmpresaLogo");
    if (!alvo) return;
    var sel = $("meEmpresa");
    var id = sel ? sel.value : "";
    alvo.innerHTML = logoEmpresa(RV.logoDaEmpresa(id), 34);
  }

  function abrirModalEmpresa() {
    var r = RV.getRascunho();
    var selE = $("meEmpresa");
    var infoE = RV.listarEmpresas();
    var semEmpresas = !infoE.empresas.length;
    selE.innerHTML = "";
    if (semEmpresas) {
      var o = document.createElement("option"); o.value = ""; o.textContent = "Nenhuma empresa cadastrada";
      selE.appendChild(o); selE.disabled = true;
    } else {
      selE.disabled = false;
      infoE.empresas.forEach(function (e) {
        var op = document.createElement("option"); op.value = e.id; op.textContent = e.nome;
        if (e.id === (r.empresaId || infoE.ativaId)) op.selected = true;
        selE.appendChild(op);
      });
    }
    // Mostra/esconde o botão de cadastrar conforme houver empresas
    var btnCad = $("meCadastrarEmpresa");
    if (btnCad) btnCad.style.display = semEmpresas ? "" : "none";
    var avisoVazio = $("meSemEmpresaAviso");
    if (avisoVazio) avisoVazio.style.display = semEmpresas ? "block" : "none";
    // Desabilita "Salvar" quando não há empresa para escolher
    var btnSalvar = $("meSalvar");
    if (btnSalvar) btnSalvar.style.display = semEmpresas ? "none" : "";

    atualizarLogoEmpresaSelecionada();
    abrirModal("modalEmpresa");
  }
  function salvarEmpresa() {
    var r = RV.getRascunho();
    var selE = $("meEmpresa");
    if (!RV.exigir([{ el: selE, msg: "Selecione uma empresa." }])) return;
    r.empresaId = selE.value;
    r.empresaNome = selE.options[selE.selectedIndex] ? selE.options[selE.selectedIndex].textContent : "";
    // Item 4: a plataforma é sempre a Loja Física (valores da venda vêm dela).
    r.plataformaLivre = true;
    r.plataformaId = "";
    r.plataformaNome = "Loja Física";
    fecharModais();
    atualizarResumoBlocos();
  }

  // ─────────────────────────────────────────
  //  BLOCO PRODUTOS (carrinho)
  // ─────────────────────────────────────────
  function ligarBlocoProdutos() {
    $("btnAddProduto").addEventListener("click", abrirModalProduto);
    $("mpAdd").addEventListener("click", adicionarItem);

    var input = $("mpSku");
    var box = $("mpSuggest");
    var timer = null;
    input.addEventListener("input", function () {
      clearTimeout(timer);
      var termo = input.value.trim();
      _imagemSelecionada = "";
      if (termo.length < 1) { box.classList.remove("show"); box.innerHTML = ""; return; }
      timer = setTimeout(function () { buscarSku(termo); }, 160);
    });
    input.addEventListener("blur", function () { setTimeout(function () { box.classList.remove("show"); }, 180); });

    function buscarSku(termo) {
      // Nova lógica: procura em TODAS as plataformas cadastradas, começando
      // sempre pela Loja Física e seguindo para as demais. Não depende mais de
      // uma plataforma escolhida no rascunho (era isso que travava a busca).
      var sugestoes = RV.sugerirProdutosGlobal(termo);
      if (!sugestoes.length) {
        box.innerHTML = '<div class="rv-sku-item"><div class="rv-sku-item__name">Nenhum produto encontrado com esse SKU/nome</div><div class="rv-sku-item__meta">Você pode digitar os dados manualmente abaixo.</div></div>';
        box.classList.add("show"); return;
      }
      box.innerHTML = sugestoes.map(function (p, i) {
        return '<div class="rv-sku-item rv-sku-item--img" data-sku="' + esc(p.sku) + '" data-nome="' + esc(p.nome) + '" data-preco="' + p.preco + '" data-idx="' + i + '">' +
          miniatura(p.imagem, 40) +
          '<div class="rv-sku-item__txt">' +
            '<div class="rv-sku-item__sku">' + esc(p.sku || "(sem SKU)") + '</div>' +
            '<div class="rv-sku-item__name">' + esc(p.nome || "Produto") + '</div>' +
            '<div class="rv-sku-item__meta">' + esc(p.plataformaNome || "") + ' · Preço: ' + fmt(p.preco) + '</div>' +
          '</div></div>';
      }).join("");
      box.classList.add("show");
      Array.prototype.forEach.call(box.querySelectorAll(".rv-sku-item[data-sku]"), function (item) {
        item.addEventListener("mousedown", function (ev) {
          ev.preventDefault();
          // Preenche automaticamente todas as informações do produto achado.
          var escolhido = sugestoes[parseInt(item.dataset.idx, 10)];
          $("mpSku").value = item.dataset.sku;
          $("mpNome").value = item.dataset.nome;
          $("mpPreco").value = parseNum(item.dataset.preco).toFixed(2).replace(".", ",");
          _imagemSelecionada = escolhido ? (escolhido.imagem || "") : "";
          box.classList.remove("show");
          $("mpQtd").focus();
        });
      });
    }
  }
  function abrirModalProduto() {
    var r = RV.getRascunho();
    $("mpSku").value = ""; $("mpNome").value = ""; $("mpPreco").value = ""; $("mpQtd").value = "1";
    _imagemSelecionada = "";
    var aviso = $("mpAvisoLivre");
    // Loja Física: a venda é sempre manual (preço digitado). O aviso fica visível.
    if (aviso) aviso.style.display = "block";
    abrirModal("modalProduto");
    setTimeout(function () { $("mpSku").focus(); }, 50);
  }
  function adicionarItem() {
    var r = RV.getRascunho();
    var sku = $("mpSku").value.trim();
    var nome = $("mpNome").value.trim();
    var preco = parseNum($("mpPreco").value);
    var qtd = parseNum($("mpQtd").value) || 1;
    var semIdent = !nome && !sku;
    // SKU ou nome: um dos dois basta — preenchido um, o vermelho sai dos dois.
    var identOk = function () {
      var ok = !!($("mpSku").value.trim() || $("mpNome").value.trim());
      if (ok && window.BapellCampos) {
        window.BapellCampos.limpar($("mpSku"));
        window.BapellCampos.limpar($("mpNome"));
      }
      return ok;
    };
    if (!RV.exigir([
      { el: $("mpSku"), vazio: semIdent, resolvido: identOk, msg: "Informe ao menos o SKU ou o nome do produto." },
      { el: $("mpNome"), vazio: semIdent, resolvido: identOk, msg: "Informe ao menos o SKU ou o nome do produto." },
      { el: $("mpPreco"), vazio: !(preco > 0), msg: "Informe o preço de venda." },
      { el: $("mpQtd"), vazio: !(qtd > 0), msg: "A quantidade deve ser maior que zero." },
    ])) return;
    r.itens.push(RV.sanitizarItem({ sku: sku, nome: nome || sku, preco: preco, qtd: qtd, imagem: _imagemSelecionada }));
    _imagemSelecionada = "";
    fecharModais();
    atualizarResumoBlocos();
  }
  function renderCarrinho() {
    var r = RV.getRascunho();
    var cont = $("carrinhoLista");
    var vazio = $("carrinhoVazio");
    if (!r.itens.length) { cont.innerHTML = ""; vazio.style.display = "block"; return; }
    vazio.style.display = "none";
    cont.innerHTML = r.itens.map(function (it, i) {
      return '<div class="rv-cart-item rv-cart-item--clicavel" data-edit="' + i + '" title="Clique para editar quantidade e preço">' +
        miniatura(it.imagem, 42) +
        '<div class="rv-cart-item__info"><div class="rv-cart-item__name">' + esc(it.nome || it.sku) + '</div>' +
          (it.sku ? '<div class="rv-cart-item__sku">' + esc(it.sku) + '</div>' : '') + '</div>' +
        '<div class="rv-cart-item__qtd">' +
          '<button class="rv-qtd-btn" data-dec="' + i + '" title="Menos">−</button>' +
          '<span class="rv-qtd-val">' + it.qtd + '</span>' +
          '<button class="rv-qtd-btn" data-inc="' + i + '" title="Mais">+</button></div>' +
        '<div class="rv-cart-item__preco">' + fmt(it.preco) + '</div>' +
        '<div class="rv-cart-item__subtotal">' + fmt(it.preco * it.qtd) + '</div>' +
        '<button class="rv-cart-item__del" data-del="' + i + '" title="Remover"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>' +
        '</div>';
    }).join("");
    // Clicar na linha abre a edição rápida. Cliques nos botões de +/-/remover
    // seguem funcionando normalmente (não abrem o modal).
    Array.prototype.forEach.call(cont.querySelectorAll("[data-edit]"), function (linha) {
      linha.addEventListener("click", function (ev) {
        if (ev.target.closest("button")) return;
        abrirModalItem(+linha.dataset.edit);
      });
    });
    Array.prototype.forEach.call(cont.querySelectorAll("[data-inc]"), function (b) {
      b.addEventListener("click", function () { r.itens[+b.dataset.inc].qtd++; atualizarResumoBlocos(); });
    });
    Array.prototype.forEach.call(cont.querySelectorAll("[data-dec]"), function (b) {
      b.addEventListener("click", function () {
        var it = r.itens[+b.dataset.dec];
        if (it.qtd > 1) it.qtd--; else r.itens.splice(+b.dataset.dec, 1);
        atualizarResumoBlocos();
      });
    });
    Array.prototype.forEach.call(cont.querySelectorAll("[data-del]"), function (b) {
      b.addEventListener("click", function () { r.itens.splice(+b.dataset.del, 1); atualizarResumoBlocos(); });
    });
  }

  // ─────────────────────────────────────────
  //  EDIÇÃO RÁPIDA DO ITEM (clique na linha do carrinho)
  // ─────────────────────────────────────────
  var _itemEditando = -1;

  function abrirModalItem(i) {
    var r = RV.getRascunho();
    var it = r.itens[i];
    if (!it) return;
    _itemEditando = i;

    $("meiFoto").innerHTML = miniatura(it.imagem, 52);
    $("meiNome").textContent = it.nome || it.sku || "Produto";
    $("meiSku").textContent = it.sku ? "SKU: " + it.sku : "";
    $("meiQtd").value = it.qtd;
    $("meiPreco").value = Number(it.preco || 0).toFixed(2).replace(".", ",");
    atualizarSubtotalModal();
    abrirModal("modalEditarItem");
    setTimeout(function () { $("meiQtd").focus(); $("meiQtd").select(); }, 50);
  }

  function atualizarSubtotalModal() {
    var q = parseNum($("meiQtd").value) || 0;
    var p = parseNum($("meiPreco").value) || 0;
    $("meiSubtotal").textContent = fmt(q * p);
  }

  function salvarItemEditado() {
    var r = RV.getRascunho();
    var it = r.itens[_itemEditando];
    if (!it) { fecharModais(); return; }

    var qtd = parseNum($("meiQtd").value);
    var preco = parseNum($("meiPreco").value);
    if (!RV.exigir([
      { el: $("meiQtd"), vazio: !(qtd > 0), msg: "A quantidade deve ser maior que zero." },
      { el: $("meiPreco"), vazio: !(preco > 0), msg: "Informe o preço de venda." },
    ])) return;

    it.qtd = qtd;
    it.preco = preco;
    it.subtotal = qtd * preco;
    _itemEditando = -1;
    fecharModais();
    atualizarResumoBlocos();
    toast("Item atualizado.", "success");
  }

  function removerItemEditado() {
    var r = RV.getRascunho();
    if (_itemEditando >= 0 && r.itens[_itemEditando]) r.itens.splice(_itemEditando, 1);
    _itemEditando = -1;
    fecharModais();
    atualizarResumoBlocos();
    toast("Item removido.", "default");
  }

  // ─────────────────────────────────────────
  //  RESUMO DOS BLOCOS + TOTAL
  // ─────────────────────────────────────────
  function atualizarResumoBlocos() {
    var r = RV.getRascunho();

    var cRes = $("clienteResumo");
    if (r.cliente.nome) {
      cRes.innerHTML = '<span class="rv-bloco-nome">' + esc(r.cliente.nome) + '</span>' +
        (r.cliente.doc ? '<span class="rv-bloco-sub">' + esc(r.cliente.doc) + '</span>' : '');
      $("blocoCliente").classList.add("preenchido");
    } else {
      cRes.innerHTML = '<span class="rv-bloco-placeholder">Clique para localizar ou cadastrar o comprador</span>';
      $("blocoCliente").classList.remove("preenchido");
    }

    var eRes = $("empresaResumo");
    if (r.empresaNome) {
      var logo = RV.logoDaEmpresa(r.empresaId);
      eRes.innerHTML = '<span class="rv-bloco-empresa">' +
        (r.empresaId ? logoEmpresa(logo, 28) : "") +
        '<span><span class="rv-bloco-nome">' + esc(r.empresaNome) + '</span>' +
        '<span class="rv-bloco-sub">' + esc(r.plataformaNome || "Loja Física") + '</span></span></span>';
      $("blocoEmpresa").classList.add("preenchido");
    } else {
      eRes.innerHTML = '<span class="rv-bloco-placeholder">Clique para selecionar a empresa</span>';
      $("blocoEmpresa").classList.remove("preenchido");
    }

    var t = RV.calcularTotais(r);
    $("totalVenda").textContent = fmt(t.totalVenda);
    $("itensCount").textContent = r.itens.length;

    // O bloco que ficou vermelho ao finalizar volta ao normal assim que
    // é preenchido.
    if (window.BapellCampos) {
      if (r.cliente.nome) window.BapellCampos.limpar($("blocoCliente"));
      if (r.empresaId) window.BapellCampos.limpar($("blocoEmpresa"));
      if (r.itens.length) window.BapellCampos.limpar(document.querySelector(".rv-produtos-bloco"));
    }

    renderCarrinho();
  }
  RV.atualizarResumoBlocos = atualizarResumoBlocos;

  // Bloco obrigatório (comprador, empresa, produtos) que falta: fica com o
  // contorno vermelho até ser preenchido (utils.js; quem tira o vermelho é
  // o atualizarResumoBlocos, logo acima).
  function marcarBloco(el) {
    if (!el || !window.BapellCampos) return;
    window.BapellCampos.marcar(el);
  }

  // ─────────────────────────────────────────
  //  AÇÕES (salvar, limpar, gerar PDF)
  // ─────────────────────────────────────────
  function ligarAcoes() {
    $("btnSalvarVenda").addEventListener("click", abrirModalFinalizar);
    $("mfConfirmar").addEventListener("click", finalizarVenda);
    $("btnGerarPDF").addEventListener("click", function () {
      var r = RV.getRascunho();
      if (!r.itens.length) {
        marcarBloco(document.querySelector(".rv-produtos-bloco"));
        toast("Adicione ao menos um produto para gerar o PDF.", "warning");
        return;
      }
      imprimirDoc(r, { titulo: "Orçamento", orcamento: true });
    });
    $("btnLimparVenda").addEventListener("click", function () {
      RV.setRascunho(novoRascunho());
      atualizarResumoBlocos();
      // Venda nova: nada fica marcado em vermelho.
      if (window.BapellCampos) window.BapellCampos.limparTodos();
      toast("Venda limpa.", "default");
    });
  }

  function abrirModalFinalizar() {
    var r = RV.getRascunho();
    // Tudo o que falta fica vermelho de uma vez; a janela do primeiro abre.
    if (!r.cliente.nome) marcarBloco($("blocoCliente"));
    if (!r.empresaId) marcarBloco($("blocoEmpresa"));
    if (!r.itens.length) marcarBloco(document.querySelector(".rv-produtos-bloco"));
    if (!r.cliente.nome) { toast("Adicione o comprador.", "warning"); abrirModalCliente(); return; }
    if (!r.empresaId) { toast("Selecione a empresa.", "warning"); abrirModalEmpresa(); return; }
    if (!r.itens.length) {
      toast("Adicione ao menos um produto.", "warning");
      var bp = document.querySelector(".rv-produtos-bloco");
      if (bp) { try { bp.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {} }
      return;
    }

    $("mfResumoCliente").textContent = r.cliente.nome;
    $("mfResumoEmpresa").textContent = (r.empresaNome || "—") + " · " + (r.plataformaNome || "Loja Física");
    var t = RV.calcularTotais(r);
    $("mfResumoTotal").textContent = fmt(t.totalVenda);
    // Responsável: um dos usuários cadastrados (Usuários e Senhas).
    if (window.BapellUsuarios) window.BapellUsuarios.preencherSelect($("mfResponsavel"), { valor: r.responsavel || "", vazio: "Selecione quem está lançando" });
    else $("mfResponsavel").value = r.responsavel || "";
    if (window.BapellCampos) window.BapellCampos.limparTodos($("modalFinalizar"));
    $("mfPagamento").value = r.pagamento || "Pix";
    $("mfParcelas").value = r.parcelas || 1;
    $("mfStatus").value = r.status || "Pendente";
    $("mfData").value = r.data || hojeISO();
    $("mfNumero").value = r.numero || "";
    $("mfObs").value = r.obs || "";
    var temEmpresa = !!r.empresaId;
    $("mfDreWrap").style.display = temEmpresa ? "" : "none";
    $("mfDreAuto").checked = temEmpresa;
    var aviso = $("mfDreAviso");
    if (aviso) aviso.style.display = temEmpresa ? "none" : "block";
    abrirModal("modalFinalizar");
  }

  var _finalizando = false;
  function finalizarVenda() {
    if (_finalizando) return;
    var sel = $("mfResponsavel");
    if (RV.semUsuarios(sel)) return;
    if (!RV.exigir([{ el: sel, msg: "Escolha o responsável pelo lançamento." }])) return;
    // Quem tem senha só lança digitando a própria senha.
    _finalizando = true;
    RV.confirmarResponsavel(sel, "lançar esta venda").then(function (usuario) {
      _finalizando = false;
      // A janela foi fechada enquanto a senha era pedida: não lança.
      if (usuario && !$("modalFinalizar").hidden) gravarVendaFinalizada(usuario.nome);
    }, function (err) {
      _finalizando = false;
      RV.registrarErro("rv: confirmar responsável", err);
    });
  }

  function gravarVendaFinalizada(responsavel) {
    var r = RV.getRascunho();
    r.responsavel = responsavel;
    r.pagamento = $("mfPagamento").value;
    r.parcelas = parseNum($("mfParcelas").value) || 1;
    r.status = $("mfStatus").value;
    r.data = $("mfData").value || hojeISO();
    r.numero = $("mfNumero").value.trim();
    r.obs = $("mfObs").value.trim();
    r.dreAuto = !!$("mfDreAuto").checked && !!r.empresaId;

    var venda = RV.sanitizarVenda(r);
    venda.historico = [{ acao: "criado", por: responsavel, em: RV.agoraTexto(), ts: Date.now() }];

    if (venda.dreAuto) {
      var res = RV.lancarNoDre(venda, null);
      if (res.ok) { venda.dreMovId = res.movId; venda.dreEmpresaId = res.dreEmpresaId || null; }
      else if (res.motivo === "empresa_inexistente") { toast("Empresa inexistente no DRE — venda salva sem lançamento.", "warning"); venda.dreAuto = false; }
      else toast("Falha ao lançar no DRE.", "warning");
    }

    // salva/atualiza o cliente também
    if (venda.cliente && venda.cliente.doc) RV.upsertCliente(venda.cliente);

    var vendas = RV.getVendas();
    vendas.unshift(venda);
    RV.setVendas(vendas);
    RV.salvarVendas();

    fecharModais();
    RV.setRascunho(novoRascunho());
    atualizarResumoBlocos();
    if (RV.renderKPIs) RV.renderKPIs();
    if (RV.renderListaVendas) RV.renderListaVendas();
    toast(venda.dreAuto && venda.dreMovId ? "Venda salva e lançada no DRE!" : "Venda salva!", "success");
  }

  // ─────────────────────────────────────────
  //  GERAR PDF (orçamento / comprovante) — window.print, igual ao DRE
  // ─────────────────────────────────────────
  function imprimirDoc(v, opts) {
    opts = opts || {};
    var orcamento = !!opts.orcamento;
    var titulo = opts.titulo || (orcamento ? "Orçamento" : "Comprovante de Venda");
    var t = RV.calcularTotais(v);
    var em = RV.dadosEmitente(v.empresaId);

    // ── Cabeçalho do emitente (dados do cadastro de Empresas) ──
    var linhasEmitente = [];
    var docs = [];
    if (em.cnpj) docs.push("CNPJ: " + esc(em.cnpj));
    if (em.ie) docs.push("IE: " + esc(em.ie));
    if (docs.length) linhasEmitente.push(docs.join("&nbsp;&nbsp;·&nbsp;&nbsp;"));
    if (em.endereco) linhasEmitente.push(esc(em.endereco));
    if (em.contato) linhasEmitente.push(esc(em.contato));

    var nomeEmitente = em.razaoSocial || v.empresaNome || "";
    var cabecalho =
      '<div class="topo">' +
        (em.logo ? '<img class="logo" src="' + em.logo + '" alt="">' : "") +
        '<div class="emitente">' +
          (nomeEmitente ? '<div class="emitente-nome">' + esc(nomeEmitente) + "</div>" : "") +
          (em.nomeFantasia && em.nomeFantasia !== nomeEmitente
            ? '<div class="emitente-fantasia">' + esc(em.nomeFantasia) + "</div>" : "") +
          (linhasEmitente.length
            ? '<div class="emitente-dados">' + linhasEmitente.join("<br>") + "</div>" : "") +
        "</div>" +
      "</div>";

    // ── Itens com miniatura ──
    var linhasItens = (v.itens || []).map(function (it) {
      var foto = it.imagem
        ? '<img class="thumb" src="' + it.imagem + '" alt="">'
        : '<div class="thumb thumb-vazia"></div>';
      return "<tr>" +
        '<td class="c-img">' + foto + "</td>" +
        "<td>" + esc(it.nome || "—") + (it.sku ? '<div class="sku">' + esc(it.sku) + "</div>" : "") + "</td>" +
        '<td class="c-num">' + it.qtd + "</td>" +
        '<td class="c-val">' + fmt(it.preco) + "</td>" +
        '<td class="c-val">' + fmt(it.preco * it.qtd) + "</td>" +
      "</tr>";
    }).join("");

    // ── Bloco do cliente ──
    var endCliente = [];
    if (v.cliente.endereco) endCliente.push(esc(v.cliente.endereco));
    if (v.cliente.complemento) endCliente.push(esc(v.cliente.complemento));
    if (v.cliente.cep) endCliente.push("CEP " + esc(v.cliente.cep));
    var contatoCliente = [];
    if (v.cliente.telefone) contatoCliente.push(esc(v.cliente.telefone));
    if (v.cliente.email) contatoCliente.push(esc(v.cliente.email));

    function linha(rot, val) {
      return val ? '<div class="linha"><span>' + rot + "</span><strong>" + val + "</strong></div>" : "";
    }

    var win = window.open("", "_blank");
    if (!win) { toast("Permita pop-ups para gerar o PDF.", "warning"); return; }

    win.document.write(
      '<html><head><meta charset="utf-8"><title>' + esc(titulo) + (v.numero ? " " + esc(v.numero) : "") + "</title><style>" +
      "*{box-sizing:border-box;}" +
      "body{font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;max-width:820px;margin:0 auto;padding:34px 30px;font-size:13px;}" +
      // topo
      ".topo{display:flex;align-items:center;gap:16px;padding-bottom:16px;border-bottom:2px solid #0f172a;}" +
      ".logo{width:74px;height:74px;object-fit:contain;border-radius:8px;flex-shrink:0;}" +
      ".emitente{flex:1;min-width:0;}" +
      ".emitente-nome{font-size:17px;font-weight:700;line-height:1.25;}" +
      ".emitente-fantasia{font-size:13px;color:#475569;margin-top:1px;}" +
      ".emitente-dados{font-size:11.5px;color:#475569;margin-top:5px;line-height:1.6;}" +
      // título
      ".doc{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:18px 0 20px;}" +
      ".doc h1{font-size:20px;margin:0;letter-spacing:-0.3px;}" +
      ".doc .emissao{font-size:11px;color:#64748b;text-align:right;}" +
      // blocos
      ".bloco{border:1px solid #e2e8f0;border-radius:9px;padding:13px 15px;margin-bottom:14px;}" +
      ".bloco h3{margin:0 0 9px;font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:#64748b;font-weight:700;}" +
      ".linha{display:flex;justify-content:space-between;gap:18px;font-size:12.5px;padding:2.5px 0;}" +
      ".linha span{color:#64748b;white-space:nowrap;}" +
      ".linha strong{font-weight:600;text-align:right;}" +
      ".cols{display:flex;gap:14px;}.cols>.bloco{flex:1;margin-bottom:14px;}" +
      // tabela
      "table{width:100%;border-collapse:collapse;font-size:12.5px;}" +
      "thead th{background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:8px 9px;text-align:left;border-bottom:1px solid #e2e8f0;}" +
      "tbody td{padding:9px;border-bottom:1px solid #eef2f7;vertical-align:middle;}" +
      ".c-img{width:52px;}.c-num{text-align:center;width:52px;}.c-val{text-align:right;width:96px;white-space:nowrap;}" +
      ".thumb{width:38px;height:38px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;display:block;}" +
      ".thumb-vazia{background:#f1f5f9;}" +
      ".sku{font-size:10.5px;color:#94a3b8;margin-top:2px;}" +
      // total
      ".total{display:flex;justify-content:flex-end;align-items:baseline;gap:14px;margin-top:14px;padding-top:12px;border-top:2px solid #0f172a;}" +
      ".total span{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;}" +
      ".total strong{font-size:23px;}" +
      ".obs{font-size:12.5px;line-height:1.55;white-space:pre-wrap;}" +
      ".rodape{margin-top:30px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10.5px;color:#94a3b8;text-align:center;}" +
      "@media print{body{padding:0;}.bloco{break-inside:avoid;}tr{break-inside:avoid;}}" +
      "</style></head><body>" +

      cabecalho +

      '<div class="doc"><h1>' + esc(titulo) + (v.numero ? " Nº " + esc(v.numero) : "") + "</h1>" +
        '<div class="emissao">Emitido em ' + new Date().toLocaleString("pt-BR") +
        (v.data ? "<br>Data da venda: " + fmtData(v.data) : "") + "</div></div>" +

      '<div class="cols">' +
        '<div class="bloco"><h3>' + (orcamento ? "Destinatário" : "Comprador") + "</h3>" +
          linha("Nome", esc(v.cliente.nome || "—")) +
          linha("CPF/CNPJ", esc(v.cliente.doc || "")) +
          (contatoCliente.length ? linha("Contato", contatoCliente.join(" · ")) : "") +
          (endCliente.length ? linha("Endereço", endCliente.join(" · ")) : "") +
        "</div>" +
        '<div class="bloco"><h3>Dados do ' + (orcamento ? "orçamento" : "pedido") + "</h3>" +
          linha("Plataforma", esc(v.plataformaNome || "—")) +
          linha("Pagamento", esc(v.pagamento || "—") + (v.parcelas > 1 ? " em " + v.parcelas + "x" : "")) +
          (orcamento ? "" : linha("Status", esc(v.status || "—"))) +
          (orcamento ? "" : linha("Responsável", esc(v.responsavel || "—"))) +
        "</div>" +
      "</div>" +

      '<div class="bloco"><h3>Itens</h3>' +
        "<table><thead><tr><th></th><th>Produto</th><th class=\"c-num\">Qtd</th>" +
        '<th class="c-val">Preço</th><th class="c-val">Subtotal</th></tr></thead><tbody>' +
        (linhasItens || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">Sem itens</td></tr>') +
        "</tbody></table>" +
        '<div class="total"><span>Total</span><strong>' + fmt(t.totalVenda) + "</strong></div>" +
      "</div>" +

      (v.obs ? '<div class="bloco"><h3>Observações</h3><div class="obs">' + esc(v.obs) + "</div></div>" : "") +

      '<div class="rodape">' +
        (orcamento ? "Orçamento sem valor fiscal." : "Documento sem valor fiscal.") +
        " Emitido por " + esc(nomeEmitente || "Bapell Gestor Pro") +
        " · Bapell Gestor Pro</div>" +

      "</body></html>"
    );
    win.document.close();
    setTimeout(function () { win.print(); }, 450);
    toast("Gerando PDF...", "success");
  }

  RV.imprimirDoc = imprimirDoc;

  // ── Modais (genérico) ──
  function abrirModal(id) { var m = $(id); if (m) m.hidden = false; }
  function fecharModais() { Array.prototype.forEach.call(document.querySelectorAll(".rv-modal"), function (m) { m.hidden = true; }); }
  RV.abrirModal = abrirModal; RV.fecharModais = fecharModais;
  document.addEventListener("click", function (e) { if (e.target.closest("[data-rv-close]")) fecharModais(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") fecharModais(); });
})();

// ═══════════════════════════════════════════
//  PARTE 3 — Filtros → KPIs + Lista de vendas lançadas (cards)
// ═══════════════════════════════════════════
(function () {
  var RV = window.__RV;
  var $ = function (id) { return document.getElementById(id); };
  var fmt = RV.fmt, fmtData = RV.fmtData, esc = RV.esc, toast = RV.toast;
  var parseNum = RV.parseNum;

  var excluindoId = null;

  function atualizarTudo() { renderKPIs(); renderListaVendas(); }

  function ligarFiltros() {
    ["fSearch","fDe","fAte","fCliente","fDoc","fEmpresa","fPlataforma","fPagamento","fStatus","fResponsavel"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var ev = (el.tagName === "SELECT" || el.type === "date") ? "change" : "input";
      var timer = null;
      el.addEventListener(ev, function () { clearTimeout(timer); timer = setTimeout(atualizarTudo, 150); });
    });
    var limpar = $("btnLimparFiltros");
    if (limpar) limpar.addEventListener("click", function () {
      ["fSearch","fDe","fAte","fCliente","fDoc","fEmpresa","fPlataforma","fResponsavel"].forEach(function (id) { if ($(id)) $(id).value = ""; });
      if ($("fPagamento")) $("fPagamento").value = "";
      if ($("fStatus")) $("fStatus").value = "";
      atualizarTudo();
    });
    // exclusão (modal de confirmação)
    var conf = $("mdvConfirmar");
    if (conf) conf.addEventListener("click", confirmarExclusao);

    // edição de venda lançada
    var salvarEd = $("evSalvar");
    if (salvarEd) salvarEd.addEventListener("click", salvarVendaEditada);
    ligarBuscaProdutoEdicao();
  }

  function val(id) { var el = $(id); return el ? el.value : ""; }

  function aplicarFiltros(lista) {
    var busca = val("fSearch").trim().toLowerCase();
    var de = val("fDe"), ate = val("fAte");
    var fCli = val("fCliente").trim().toLowerCase();
    var fDoc = val("fDoc").trim().toLowerCase();
    var fEmp = val("fEmpresa").trim().toLowerCase();
    var fPlat = val("fPlataforma").trim().toLowerCase();
    var fPag = val("fPagamento"), fStat = val("fStatus");
    var fResp = val("fResponsavel").trim().toLowerCase();

    return lista.filter(function (v) {
      if (de && v.data && v.data < de) return false;
      if (ate && v.data && v.data > ate) return false;
      if (fCli && (v.cliente.nome || "").toLowerCase().indexOf(fCli) < 0) return false;
      if (fDoc && (v.cliente.doc || "").toLowerCase().indexOf(fDoc) < 0) return false;
      if (fEmp && (v.empresaNome || "").toLowerCase().indexOf(fEmp) < 0) return false;
      if (fPlat && (v.plataformaNome || "").toLowerCase().indexOf(fPlat) < 0) return false;
      if (fPag && v.pagamento !== fPag) return false;
      if (fStat && v.status !== fStat) return false;
      if (fResp && (v.responsavel || "").toLowerCase().indexOf(fResp) < 0) return false;
      if (busca) {
        var itensTxt = (v.itens || []).map(function (it) { return it.sku + " " + it.nome; }).join(" ");
        var blob = [v.numero, v.cliente.nome, v.cliente.doc, v.cliente.telefone, v.cliente.email,
                    v.empresaNome, v.plataformaNome, v.pagamento, v.status, v.responsavel, v.obs, itensTxt].join(" ").toLowerCase();
        if (blob.indexOf(busca) < 0) return false;
      }
      return true;
    });
  }

  function renderKPIs() {
    var filtradas = aplicarFiltros(RV.getVendas());
    var totVenda = 0, totItens = 0;
    filtradas.forEach(function (v) { totVenda += RV.calcularTotais(v).totalVenda; totItens += (v.itens || []).length; });
    if ($("kpiCount")) $("kpiCount").textContent = filtradas.length;
    if ($("kpiTotal")) $("kpiTotal").textContent = fmt(totVenda);
    if ($("kpiItens")) $("kpiItens").textContent = totItens;
    if ($("kpiTicket")) $("kpiTicket").textContent = fmt(filtradas.length ? totVenda / filtradas.length : 0);
  }

  function badgeStatus(status) {
    var cls = { "Pago": "pago", "Pendente": "pendente", "Cancelado": "cancelado", "Estornado": "estornado", "Parcial": "parcial" }[status] || "pendente";
    return '<span class="rv-badge rv-badge--' + cls + '">' + esc(status) + "</span>";
  }

  // Lista de vendas lançadas em cards (ordenadas da mais recente para a mais antiga)
  function renderListaVendas() {
    var cont = $("rvLista");
    var vazio = $("rvEmpty");
    if (!cont) return;

    var vendas = RV.getVendas();
    var filtradas = aplicarFiltros(vendas).slice().sort(function (a, b) {
      return String(b.data || "").localeCompare(String(a.data || ""));
    });

    if (!filtradas.length) {
      cont.innerHTML = "";
      if (vazio) {
        vazio.style.display = "block";
        var temVendas = vendas.length > 0;
        var h3 = vazio.querySelector("h3"), p = vazio.querySelector("p");
        if (h3) h3.textContent = temVendas ? "Nenhuma venda encontrada" : "Nenhuma venda lançada ainda";
        if (p) p.textContent = temVendas ? "Ajuste os filtros acima." : "Monte a venda no topo e clique em Salvar venda.";
      }
      return;
    }
    if (vazio) vazio.style.display = "none";

    cont.innerHTML = filtradas.map(function (v) {
      var t = RV.calcularTotais(v);
      var nItens = (v.itens || []).length;
      var itensTxt = nItens === 1 ? esc(v.itens[0].nome || v.itens[0].sku) : nItens + " itens";
      var metaPag = esc(v.pagamento || "—") + (v.parcelas > 1 ? " " + v.parcelas + "x" : "") + (v.responsavel ? " · " + esc(v.responsavel) : "");
      return '<div class="rv-venda-card rv-venda-card--clicavel" data-editar="' + v.id + '" title="Clique para editar esta venda">' +
        '<div class="rv-venda-card__top">' +
          '<div class="rv-venda-card__data">' + fmtData(v.data) + (v.numero ? ' <span>#' + esc(v.numero) + '</span>' : '') + '</div>' +
          '<div class="rv-venda-card__total">' + fmt(t.totalVenda) + '</div>' +
        '</div>' +
        '<div class="rv-venda-card__cliente">' + esc(v.cliente.nome || "—") + (v.cliente.doc ? ' <span>' + esc(v.cliente.doc) + '</span>' : '') + '</div>' +
        '<div class="rv-venda-card__meta">' + esc(v.empresaNome || "—") + ' · ' + esc(v.plataformaNome || "sem plataforma") + ' · ' + itensTxt + '</div>' +
        '<div class="rv-venda-card__foot">' +
          '<div class="rv-venda-card__status">' + badgeStatus(v.status) + '<span class="rv-venda-card__pag">' + metaPag + '</span></div>' +
          '<div class="rv-venda-card__acoes">' +
            '<button class="rv-mini-btn" data-pdf="' + v.id + '" title="Gerar PDF / comprovante"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg> PDF</button>' +
            '<button class="rv-mini-btn rv-mini-btn--danger" data-del="' + v.id + '" title="Excluir venda"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join("");

    // Clicar no card abre a edição completa. Os botões de PDF/Excluir seguem
    // funcionando sem abrir o modal.
    Array.prototype.forEach.call(cont.querySelectorAll("[data-editar]"), function (card) {
      card.addEventListener("click", function (ev) {
        if (ev.target.closest("button")) return;
        abrirModalEditarVenda(card.dataset.editar);
      });
    });
    Array.prototype.forEach.call(cont.querySelectorAll("[data-pdf]"), function (b) {
      b.addEventListener("click", function () {
        var v = RV.getVendas().find(function (x) { return x.id === b.dataset.pdf; });
        if (v) RV.imprimirDoc(v, { titulo: "Comprovante de Venda" });
      });
    });
    Array.prototype.forEach.call(cont.querySelectorAll("[data-del]"), function (b) {
      b.addEventListener("click", function () { abrirExclusao(b.dataset.del); });
    });
  }

  // ═══════════════════════════════════════
  //  EDIÇÃO DE VENDA LANÇADA
  // ═══════════════════════════════════════
  // Trabalha numa CÓPIA da venda: se o usuário cancelar, nada é alterado.
  var _vendaEdit = null;

  function abrirModalEditarVenda(id) {
    var v = RV.getVendas().find(function (x) { return x.id === id; });
    if (!v) return;
    _vendaEdit = JSON.parse(JSON.stringify(v));

    $("evTitulo").textContent = "Editar venda" + (v.numero ? " #" + v.numero : "");
    $("evCliente").textContent = (v.cliente && v.cliente.nome) || "—";
    $("evEmpresa").innerHTML = (v.empresaId ? RV.logoEmpresa(RV.logoDaEmpresa(v.empresaId), 22) : "") +
      '<span style="margin-left:' + (v.empresaId ? "8px" : "0") + ';">' +
      esc(v.empresaNome || "—") + " \u00b7 " + esc(v.plataformaNome || "sem plataforma") + '</span>';
    // Responsável: um dos usuários cadastrados; vem escolhido o da venda.
    if (window.BapellUsuarios) window.BapellUsuarios.preencherSelect($("evResponsavel"), { valor: v.responsavel || "", vazio: "Selecione o responsável" });
    else $("evResponsavel").value = v.responsavel || "";
    if (window.BapellCampos) window.BapellCampos.limparTodos($("modalEditarVenda"));
    $("evNumero").value = v.numero || "";
    $("evData").value = v.data || RV.hojeISO();
    $("evPagamento").value = v.pagamento || "Pix";
    $("evParcelas").value = v.parcelas || 1;
    $("evStatus").value = v.status || "Pendente";
    $("evObs").value = v.obs || "";

    var temEmpresa = !!v.empresaId;
    $("evDreWrap").style.display = temEmpresa ? "" : "none";
    $("evDreAviso").style.display = temEmpresa ? "none" : "block";
    $("evDreAuto").checked = temEmpresa && !!v.dreMovId;

    $("evSku").value = "";
    $("evSuggest").classList.remove("show");

    renderItensEdicao();
    RV.abrirModal("modalEditarVenda");
  }

  function renderItensEdicao() {
    if (!_vendaEdit) return;
    var cont = $("evItens"), vazio = $("evItensVazio");
    var itens = _vendaEdit.itens || [];

    if (!itens.length) {
      cont.innerHTML = "";
      vazio.style.display = "block";
      atualizarTotalEdicao();
      return;
    }
    vazio.style.display = "none";

    cont.innerHTML = itens.map(function (it, i) {
      return '<div class="rv-cart-item">' +
        RV.miniatura(it.imagem, 42) +
        '<div class="rv-cart-item__info"><div class="rv-cart-item__name">' + esc(it.nome || it.sku) + '</div>' +
          (it.sku ? '<div class="rv-cart-item__sku">' + esc(it.sku) + '</div>' : '') + '</div>' +
        '<div class="rv-cart-item__qtd">' +
          '<button class="rv-qtd-btn" data-evdec="' + i + '" title="Menos">\u2212</button>' +
          '<span class="rv-qtd-val">' + it.qtd + '</span>' +
          '<button class="rv-qtd-btn" data-evinc="' + i + '" title="Mais">+</button></div>' +
        '<div class="rv-cart-item__preco"><input class="rv-preco-inline" data-evpreco="' + i + '" inputmode="decimal" value="' + Number(it.preco || 0).toFixed(2).replace(".", ",") + '"></div>' +
        '<div class="rv-cart-item__subtotal">' + fmt((Number(it.preco) || 0) * (Number(it.qtd) || 0)) + '</div>' +
        '<button class="rv-cart-item__del" data-evdel="' + i + '" title="Remover"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>' +
        '</div>';
    }).join("");

    Array.prototype.forEach.call(cont.querySelectorAll("[data-evinc]"), function (b) {
      b.addEventListener("click", function () {
        _vendaEdit.itens[+b.dataset.evinc].qtd++;
        renderItensEdicao();
      });
    });
    Array.prototype.forEach.call(cont.querySelectorAll("[data-evdec]"), function (b) {
      b.addEventListener("click", function () {
        var it = _vendaEdit.itens[+b.dataset.evdec];
        if (it.qtd > 1) it.qtd--; else _vendaEdit.itens.splice(+b.dataset.evdec, 1);
        renderItensEdicao();
      });
    });
    Array.prototype.forEach.call(cont.querySelectorAll("[data-evdel]"), function (b) {
      b.addEventListener("click", function () {
        _vendaEdit.itens.splice(+b.dataset.evdel, 1);
        renderItensEdicao();
      });
    });
    Array.prototype.forEach.call(cont.querySelectorAll("[data-evpreco]"), function (inp) {
      inp.addEventListener("input", function () {
        var it = _vendaEdit.itens[+inp.dataset.evpreco];
        if (it) { it.preco = RV.parseNum(inp.value); atualizarTotalEdicao(); }
      });
    });

    atualizarTotalEdicao();
  }

  function atualizarTotalEdicao() {
    if (!_vendaEdit) return;
    $("evTotal").textContent = fmt(RV.calcularTotais(_vendaEdit).totalVenda);
  }

  // Busca de produto DENTRO da edição (mesma origem de preços da venda)
  function ligarBuscaProdutoEdicao() {
    var input = $("evSku"), box = $("evSuggest");
    if (!input || !box) return;
    var timer = null;
    input.addEventListener("input", function () {
      clearTimeout(timer);
      var termo = input.value.trim();
      if (termo.length < 1) { box.classList.remove("show"); box.innerHTML = ""; return; }
      timer = setTimeout(function () { buscarParaEdicao(termo); }, 180);
    });
    input.addEventListener("blur", function () { setTimeout(function () { box.classList.remove("show"); }, 180); });

    function buscarParaEdicao(termo) {
      if (!_vendaEdit) return;
      // Mesma lógica da nova venda: busca em todas as plataformas, Loja Física
      // primeiro. Assim dá para adicionar produtos por SKU também na edição.
      var sugestoes = RV.sugerirProdutosGlobal(termo);
      if (!sugestoes.length) {
        box.innerHTML = '<div class="rv-sku-item"><div class="rv-sku-item__name">Nenhum produto encontrado com esse SKU/nome</div></div>';
        box.classList.add("show"); return;
      }
      box.innerHTML = sugestoes.map(function (p, i) {
        return '<div class="rv-sku-item rv-sku-item--img" data-evadd="' + i + '">' +
          RV.miniatura(p.imagem, 40) +
          '<div class="rv-sku-item__txt">' +
            '<div class="rv-sku-item__sku">' + esc(p.sku || "(sem SKU)") + '</div>' +
            '<div class="rv-sku-item__name">' + esc(p.nome || "Produto") + '</div>' +
            '<div class="rv-sku-item__meta">' + esc(p.plataformaNome || "") + ' · Preço: ' + fmt(p.preco) + '</div>' +
          '</div></div>';
      }).join("");
      box.classList.add("show");
      Array.prototype.forEach.call(box.querySelectorAll("[data-evadd]"), function (item) {
        item.addEventListener("mousedown", function (ev) {
          ev.preventDefault();
          var p = sugestoes[+item.dataset.evadd];
          var jaTem = _vendaEdit.itens.find(function (x) { return x.sku && x.sku === p.sku; });
          if (jaTem) jaTem.qtd++;
          else _vendaEdit.itens.push(RV.sanitizarItem({ sku: p.sku, nome: p.nome, preco: p.preco, qtd: 1, imagem: p.imagem }));
          input.value = "";
          box.classList.remove("show");
          renderItensEdicao();
        });
      });
    }
  }

  var _salvandoEdicao = false;
  function salvarVendaEditada() {
    if (!_vendaEdit || _salvandoEdicao) return;

    var sel = $("evResponsavel");
    if (RV.semUsuarios(sel)) return;
    if (!RV.exigir([{ el: sel, msg: "Escolha o responsável." }])) return;
    if (!_vendaEdit.itens.length) { toast("A venda precisa de ao menos um produto.", "warning"); return; }
    var precoRuim = _vendaEdit.itens.some(function (it) { return !(Number(it.preco) > 0); });
    if (precoRuim) { toast("Há item com preço zerado. Corrija antes de salvar.", "warning"); return; }

    // Quem tem senha só salva digitando a própria senha.
    _salvandoEdicao = true;
    RV.confirmarResponsavel(sel, "salvar a alteração desta venda").then(function (usuario) {
      _salvandoEdicao = false;
      // A janela foi fechada enquanto a senha era pedida: nada muda.
      if (usuario && _vendaEdit && !$("modalEditarVenda").hidden) gravarVendaEditada(usuario.nome);
    }, function (err) {
      _salvandoEdicao = false;
      RV.registrarErro("rv: confirmar responsável", err);
    });
  }

  function gravarVendaEditada(responsavel) {
    _vendaEdit.responsavel = responsavel;
    _vendaEdit.numero = $("evNumero").value.trim();
    _vendaEdit.data = $("evData").value || RV.hojeISO();
    _vendaEdit.pagamento = $("evPagamento").value;
    _vendaEdit.parcelas = RV.parseNum($("evParcelas").value) || 1;
    _vendaEdit.status = $("evStatus").value;
    _vendaEdit.obs = $("evObs").value.trim();

    var atualizada = RV.sanitizarVenda(_vendaEdit);

    // Re-sincroniza o DRE: atualiza o lançamento existente, cria ou remove
    // conforme o interruptor. Sem isso, o financeiro ficaria com o valor antigo.
    var querDre = !!$("evDreAuto").checked && !!atualizada.empresaId;
    if (querDre) {
      var res = RV.lancarNoDre(atualizada, atualizada.dreMovId || null);
      if (res.ok) { atualizada.dreMovId = res.movId; atualizada.dreEmpresaId = res.dreEmpresaId || null; atualizada.dreAuto = true; }
      else {
        atualizada.dreAuto = false;
        toast("Não foi possível atualizar o lançamento no DRE.", "warning");
      }
    } else if (atualizada.dreMovId) {
      RV.removerDoDre(atualizada);
      atualizada.dreMovId = null;
      atualizada.dreEmpresaId = null;
      atualizada.dreAuto = false;
    }

    if (!Array.isArray(atualizada.historico)) atualizada.historico = [];
    atualizada.historico.push({ acao: "editado", por: responsavel, em: RV.agoraTexto(), ts: Date.now() });

    var vendas = RV.getVendas();
    var i = vendas.findIndex(function (x) { return x.id === atualizada.id; });
    if (i >= 0) vendas[i] = atualizada; else vendas.unshift(atualizada);
    RV.setVendas(vendas);
    RV.salvarVendas();

    _vendaEdit = null;
    RV.fecharModais();
    atualizarTudo();
    toast("Venda atualizada.", "success");
  }

  function abrirExclusao(id) {
    var v = RV.getVendas().find(function (x) { return x.id === id; });
    if (!v) return;
    excluindoId = id;
    var t = RV.calcularTotais(v);
    var txt = $("mdvTexto");
    if (txt) txt.innerHTML = "Excluir a venda de <strong>" + esc(v.cliente.nome || "cliente") + "</strong> (" + fmt(t.totalVenda) + ")?" +
      (v.dreMovId ? "<br>O lançamento no DRE também será removido." : "") + "<br>Esta ação não pode ser desfeita.";
    if (RV.abrirModal) RV.abrirModal("modalExcluirVenda");
  }

  function confirmarExclusao() {
    var vendas = RV.getVendas();
    var v = vendas.find(function (x) { return x.id === excluindoId; });
    if (!v) { if (RV.fecharModais) RV.fecharModais(); return; }
    if (v.dreMovId) RV.removerDoDre(v);
    RV.setVendas(vendas.filter(function (x) { return x.id !== excluindoId; }));
    RV.salvarVendas();
    excluindoId = null;
    if (RV.fecharModais) RV.fecharModais();
    atualizarTudo();
    toast("Venda excluída.", "success");
  }

  RV.renderKPIs = renderKPIs;
  RV.renderListaVendas = renderListaVendas;
  RV.init.ligarFiltros = ligarFiltros;
})();

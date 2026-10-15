// ═══════════════════════════════════════════
//  Bapell Gestor Pro — clientes.js
//  Lista de clientes salvos (precifiq_rv_clientes).
//  Busca por CPF/CNPJ, telefone ou nome. Editar / excluir / novo.
// ═══════════════════════════════════════════
"use strict";

(function () {
  var KEY = "precifiq_rv_clientes";
  var clientes = [];
  var ultimaLista = [];
  var editandoRef = null;   // referência do cliente sendo editado (null = novo)
  var excluindoRef = null;

  var $ = function (id) { return document.getElementById(id); };
  function soDigitos(s) { return String(s == null ? "" : s).replace(/\D/g, ""); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function toast(m, t) { if (typeof showToast === "function") showToast(m, t || "default"); }
  function sanitize(c) {
    c = c || {};
    return {
      nome: c.nome || "", doc: c.doc || "", telefone: c.telefone || "", email: c.email || "",
      cep: c.cep || "", endereco: c.endereco || "", complemento: c.complemento || "",
    };
  }
  function carregar() {
    try { var r = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(r)) return r.map(sanitize); } catch (e) {}
    return [];
  }
  function salvar() {
    try { localStorage.setItem(KEY, JSON.stringify(clientes)); }
    catch (e) { toast("Erro ao salvar.", "error"); }
  }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  document.addEventListener("DOMContentLoaded", function () {
    try { if (typeof setDateHeader === "function") setDateHeader(); } catch (e) {}
    clientes = carregar();

    $("cSearch").addEventListener("input", debounce(render, 150));
    $("btnNovoCliente").addEventListener("click", function () { abrirEdicao(null); });
    $("ceSalvar").addEventListener("click", salvarCliente);
    $("cdConfirmar").addEventListener("click", confirmarExclusao);

    document.addEventListener("click", function (e) { if (e.target.closest("[data-c-close]")) fecharModais(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") fecharModais(); });

    render();
  });

  function filtrar() {
    var termo = $("cSearch").value.trim().toLowerCase();
    if (!termo) return clientes.slice();
    var tDig = soDigitos(termo);
    return clientes.filter(function (c) {
      var achaDoc = tDig && soDigitos(c.doc).indexOf(tDig) >= 0;
      var achaTel = tDig && soDigitos(c.telefone).indexOf(tDig) >= 0;
      var achaNome = (c.nome || "").toLowerCase().indexOf(termo) >= 0;
      return achaDoc || achaTel || achaNome;
    });
  }

  function render() {
    ultimaLista = filtrar().sort(function (a, b) { return (a.nome || "").localeCompare(b.nome || ""); });
    $("cCount").textContent = clientes.length;

    var cont = $("clientesLista"), vazio = $("clientesEmpty");
    if (!ultimaLista.length) {
      cont.innerHTML = "";
      vazio.style.display = "block";
      var tem = clientes.length > 0;
      vazio.querySelector("h3").textContent = tem ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda";
      vazio.querySelector("p").textContent = tem ? "Ajuste a busca acima." : "Os clientes são salvos ao registrar uma venda, ou clique em Novo cliente.";
      return;
    }
    vazio.style.display = "none";

    cont.innerHTML = ultimaLista.map(function (c, i) {
      var end = [];
      if (c.endereco) end.push(esc(c.endereco));
      if (c.complemento) end.push(esc(c.complemento));
      if (c.cep) end.push("CEP " + esc(c.cep));
      return '<div class="rv-venda-card">' +
        '<div class="rv-venda-card__top"><div class="rv-venda-card__cliente">' + esc(c.nome || "(sem nome)") + '</div></div>' +
        '<div class="rv-venda-card__meta">' + (c.doc ? '<strong>' + esc(c.doc) + '</strong>' : 'sem documento') + (c.telefone ? ' · ' + esc(c.telefone) : '') + '</div>' +
        (c.email ? '<div class="rv-venda-card__meta">' + esc(c.email) + '</div>' : '') +
        (end.length ? '<div class="rv-venda-card__meta">' + end.join(' · ') + '</div>' : '') +
        '<div class="rv-venda-card__foot"><span></span><div class="rv-venda-card__acoes">' +
          '<button class="rv-mini-btn" data-edit="' + i + '"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Editar</button>' +
          '<button class="rv-mini-btn rv-mini-btn--danger" data-del="' + i + '"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>' +
        '</div></div>' +
      '</div>';
    }).join("");

    Array.prototype.forEach.call(cont.querySelectorAll("[data-edit]"), function (b) {
      b.addEventListener("click", function () { abrirEdicao(ultimaLista[+b.dataset.edit]); });
    });
    Array.prototype.forEach.call(cont.querySelectorAll("[data-del]"), function (b) {
      b.addEventListener("click", function () { abrirExclusao(ultimaLista[+b.dataset.del]); });
    });
  }

  function abrirEdicao(c) {
    editandoRef = c || null;
    c = c || {};
    $("ceTitulo").textContent = editandoRef ? "Editar cliente" : "Novo cliente";
    $("ceNome").value = c.nome || "";
    $("ceDoc").value = c.doc || "";
    $("ceTelefone").value = c.telefone || "";
    $("ceEmail").value = c.email || "";
    $("ceCep").value = c.cep || "";
    $("ceEndereco").value = c.endereco || "";
    $("ceComplemento").value = c.complemento || "";
    abrirModal("modalClienteEdit");
    setTimeout(function () { $("ceNome").focus(); }, 50);
  }

  function salvarCliente() {
    var nome = $("ceNome").value.trim();
    if (!nome) { toast("Informe o nome do cliente.", "warning"); return; }
    var novo = sanitize({
      nome: nome, doc: $("ceDoc").value.trim(),
      telefone: $("ceTelefone").value.trim(), email: $("ceEmail").value.trim(),
      cep: $("ceCep").value.trim(), endereco: $("ceEndereco").value.trim(), complemento: $("ceComplemento").value.trim(),
    });
    if (editandoRef) {
      var i = clientes.indexOf(editandoRef);
      if (i >= 0) clientes[i] = novo; else clientes.push(novo);
    } else {
      var dig = soDigitos(novo.doc);
      var idx = dig ? clientes.findIndex(function (c) { return soDigitos(c.doc) === dig; }) : -1;
      if (idx >= 0) { clientes[idx] = novo; toast("Cliente já existia — atualizado.", "default"); }
      else clientes.push(novo);
    }
    salvar();
    editandoRef = null;
    fecharModais();
    render();
    toast("Cliente salvo.", "success");
  }

  function abrirExclusao(c) {
    excluindoRef = c;
    $("cdTexto").innerHTML = "Excluir o cliente <strong>" + esc(c.nome || "sem nome") + "</strong>" + (c.doc ? " (" + esc(c.doc) + ")" : "") + "?<br>Esta ação não pode ser desfeita.";
    abrirModal("modalExcluirCliente");
  }

  function confirmarExclusao() {
    if (excluindoRef) {
      var i = clientes.indexOf(excluindoRef);
      if (i >= 0) clientes.splice(i, 1);
      salvar();
    }
    excluindoRef = null;
    fecharModais();
    render();
    toast("Cliente excluído.", "success");
  }

  function abrirModal(id) { var m = $(id); if (m) m.hidden = false; }
  function fecharModais() { Array.prototype.forEach.call(document.querySelectorAll(".rv-modal"), function (m) { m.hidden = true; }); }
})();

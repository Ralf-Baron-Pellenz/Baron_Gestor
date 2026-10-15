/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — tutorial_nf.js
   Tutorial das Notas Fiscais (nf.html).
   Só descreve os passos; a mecânica está em tutorial_core.js.

   Sem empresa escolhida, a área das notas fica escondida atrás do aviso
   "Selecione uma empresa". Os passos dessa área usam a vitrine: mostram a
   área (e escondem o aviso) só enquanto estão na tela.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";
  if (!window.BapellTutorial) return;

  var AREA = [
    { alvo: "#nfConteudo", display: "block" },
    { alvo: "#nfVazio", ocultar: true },
  ];

  BapellTutorial.registrar({
    id: "nf",
    tela: "Notas Fiscais",

    pronto: function () {
      return !!document.querySelector("#listaEmpresas > *");
    },

    passos: [
      {
        alvo: null,
        titulo: "Notas Fiscais",
        texto:
          "Guarde as notas de cada empresa num lugar só — PDF, XML, imagens — e encontre qualquer uma em segundos.",
      },
      {
        alvo: function () {
          var lista = document.getElementById("listaEmpresas");
          return lista ? lista.closest(".sidebar-section") || lista : null;
        },
        titulo: "Empresas",
        texto:
          "Escolha a empresa no menu. Elas vêm do cadastro em <strong>Dados da Empresa</strong>; " +
          "<strong>Adicionar Empresa</strong> mostra as cadastradas e leva ao cadastro para criar uma nova.",
      },
      {
        alvo: "#btnAddNf",
        vitrine: AREA,
        titulo: "Adicionar NF",
        texto:
          "Escolha o arquivo da nota (até <strong>50 MB</strong>) e informe o número da NF, o emitente e o " +
          "<strong>responsável</strong> — um dos usuários de <strong>Dados da Empresa › Usuários e Senhas</strong> " +
          "(quem tem senha confirma com a própria senha). O arquivo fica guardado no próprio sistema.",
      },
      {
        alvo: "#inpBuscaNf",
        vitrine: AREA,
        titulo: "Busca",
        texto: "Encontre uma nota pelo nome do arquivo, pelo número da NF, pelo emitente ou pelo responsável.",
      },
      {
        alvo: ".nf-table-wrap",
        vitrine: AREA,
        titulo: "Suas notas",
        texto:
          "Nome do arquivo, número da NF, emitente, responsável e data. Em cada linha: <strong>Ver</strong> abre o documento " +
          "(com opção de baixar), <strong>Editar</strong> corrige as informações e <strong>Excluir</strong> apaga a nota.",
      },
      {
        alvo: null,
        icone: "ok",
        titulo: "Pronto",
        texto: "Escolha a empresa e adicione a primeira nota. Você pode rever este tutorial pela Central de Ajuda.",
      },
    ],
  });
})();

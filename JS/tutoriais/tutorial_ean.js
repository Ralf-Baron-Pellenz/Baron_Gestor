/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — tutorial_ean.js
   Tutorial do Gerador de EAN (ean.html).
   Só descreve os passos; a mecânica está em tutorial_core.js.

   Sem empresa escolhida, a área de geração fica escondida atrás do aviso
   "Selecione uma empresa". Os passos dessa área usam a vitrine: mostram a
   área (e escondem o aviso) só enquanto estão na tela.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";
  if (!window.BapellTutorial) return;

  var AREA = [
    { alvo: "#eanConteudo", display: "block" },
    { alvo: "#eanVazio", ocultar: true },
  ];

  BapellTutorial.registrar({
    id: "ean",
    tela: "Gerador de EAN",

    pronto: function () {
      return !!document.querySelector("#listaEmpresas > *");
    },

    passos: [
      {
        alvo: null,
        titulo: "Gerador de EAN",
        texto:
          "Gere códigos de barras <strong>EAN-13</strong> a partir do CNPJ da empresa — um para cada SKU, sem repetir número.",
      },
      {
        alvo: function () {
          var lista = document.getElementById("listaEmpresas");
          return lista ? lista.closest(".sidebar-section") || lista : null;
        },
        titulo: "Empresas",
        texto:
          "Escolha a empresa no menu: as de <strong>Dados da Empresa</strong> já aparecem aqui. " +
          "<strong>Adicionar Empresa</strong> cria uma que fica disponível só no gerador.",
      },
      {
        alvo: ".ean-form",
        vitrine: AREA,
        titulo: "Gerar código",
        texto:
          "O CNPJ vem do cadastro da empresa. Digite o <strong>SKU</strong> do produto e clique em <strong>Gerar EAN</strong> " +
          "(ou tecle <kbd>Enter</kbd>).",
      },
      {
        alvo: ".ean-aviso-info",
        vitrine: AREA,
        titulo: "Como o código é formado",
        texto:
          "<strong>789</strong> (Brasil) + 4 dígitos do CNPJ + a sequência do item + o dígito verificador. " +
          "Um número usado nunca volta a ser gerado, nem depois de excluído. No CNPJ com letras (o novo CNPJ " +
          "alfanumérico), cada letra desses 4 vira um número." +
          '<span class="btu-nota">Os códigos são para uso próprio — estoque e etiquetas. Na hora de vender, ' +
          "alguns marketplaces os aceitam e outros não.</span>",
      },
      {
        alvo: "#inpBusca",
        vitrine: AREA,
        titulo: "Busca",
        texto: "Encontre um código pelo SKU ou pelo próprio número do EAN.",
      },
      {
        alvo: ".ean-table-wrap",
        vitrine: AREA,
        titulo: "Códigos gerados",
        texto:
          "Cada linha mostra CNPJ, SKU, data de criação e o EAN. <strong>Copiar</strong> leva o código para colar onde precisar; " +
          "o menu da linha oculta ou exclui.",
      },
      {
        alvo: "#btnEansOcultos",
        vitrine: AREA,
        titulo: "EAN ocultos",
        texto: "Os códigos ocultados saem da lista, mas continuam guardados aqui — e podem ser desocultados quando quiser.",
      },
      {
        alvo: null,
        icone: "ok",
        titulo: "Pronto",
        texto: "Escolha a empresa, digite o SKU e gere. Você pode rever este tutorial pela Central de Ajuda.",
      },
    ],
  });
})();

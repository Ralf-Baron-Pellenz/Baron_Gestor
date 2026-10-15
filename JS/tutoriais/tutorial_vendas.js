/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — tutorial_vendas.js
   Tutorial das Informações de Venda (vendas.html).
   Só descreve os passos; a mecânica está em tutorial_core.js.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";
  if (!window.BapellTutorial) return;

  var uniao = BapellTutorial.util.uniao;

  BapellTutorial.registrar({
    id: "vendas",
    tela: "Informações de Venda",

    pronto: function () {
      return !!document.querySelector('[data-secao-card="parcelamento"], [data-secao-card="descontos"]');
    },

    passos: [
      {
        alvo: null,
        titulo: "Informações de Venda",
        texto:
          "As regras comerciais da sua operação num lugar só: <strong>parcelamento</strong>, " +
          "<strong>descontos progressivos</strong> e <strong>formas de entrega</strong>. Configure uma vez e consulte na hora de vender.",
      },
      {
        // Com a seção aberta, destaca só as regras; recolhida, o cartão todo.
        alvo: ['[data-secao-card="parcelamento"] .secao-corpo > .vendas-grid', '[data-secao-card="parcelamento"]'],
        titulo: "Parcelamento",
        texto: "Defina o valor mínimo para parcelar e o número máximo de parcelas aceito na loja.",
      },
      {
        alvo: '[data-secao-card="parcelamento"] .simulador-box',
        titulo: "Simulador da Maquininha",
        texto:
          "Informe um valor e a taxa da maquininha para ver o valor final e o juro, conforme quem paga o parcelamento — " +
          "a loja (absorve a taxa) ou o cliente (repassa a taxa). É só consulta: a simulação não é salva.",
      },
      {
        alvo: '[data-secao-card="descontos"]',
        titulo: "Desconto progressivo",
        texto:
          "Crie faixas de desconto pelo valor total da compra: de quanto até quanto, e o percentual de cada faixa.",
      },
      {
        alvo: '[data-secao-card="logistica"]',
        titulo: "Logística e entrega",
        texto:
          "Cada forma de envio cobra por <strong>faixas de distância</strong> (km). " +
          "Em <strong>Adicionar Forma de Envio</strong> você cria outras modalidades — entrega expressa, motoboy, retirada…",
      },
      {
        alvo: "[data-secao-card] .secao-chevron-btn",
        titulo: "Abrir e recolher",
        espaco: 6,
        texto: "A seta abre ou recolhe cada seção. A tela lembra como você deixou.",
      },
      {
        alvo: "#btnConfigCampos",
        titulo: "Configurar campos",
        texto: "Oculte seções inteiras ou campos que você não usa, para a tela ficar só com o necessário.",
      },
      {
        alvo: uniao("#btnOrdenarSecoes", "#btnAddSecao"),
        titulo: "Seções e ordem",
        texto:
          "<strong>Adicionar Seção</strong> cria uma área sua, com campos livres. " +
          "<strong>Ordenar Posição</strong> muda a ordem das seções na tela.",
      },
      {
        alvo: [".action-bar", "#btnSalvarVendas"],
        titulo: "Salvar ou cancelar",
        texto:
          "<strong>Salvar</strong> e <strong>Cancelar</strong> ficam fixos no canto inferior direito da tela. Com " +
          "alterações pendentes, aparece o aviso <strong>Alterações não salvas</strong> ao lado deles. Salve por aqui ou " +
          "com <kbd>Ctrl</kbd> + <kbd>S</kbd>; <strong>Cancelar</strong> desfaz o que ainda não foi salvo.",
      },
      {
        alvo: null,
        icone: "ok",
        titulo: "Pronto",
        texto: "Preencha as regras que valem para o seu negócio e salve. Você pode rever este tutorial pela Central de Ajuda.",
      },
    ],
  });
})();

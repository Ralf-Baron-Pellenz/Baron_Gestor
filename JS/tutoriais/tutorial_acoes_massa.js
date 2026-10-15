/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — tutorial_acoes_massa.js
   Tutorial das Ações em Massa (acoes-massa.html).
   Só descreve os passos; a mecânica está em tutorial_core.js.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";
  if (!window.BapellTutorial) return;

  var uniao = BapellTutorial.util.uniao;

  // A linha inteira (caixa de marcar + valor) de um campo do formulário.
  function linhaDo(idCheckbox) {
    return function () {
      var chk = document.getElementById(idCheckbox);
      return chk ? chk.closest(".mass-field-row") : null;
    };
  }

  BapellTutorial.registrar({
    id: "acoes-massa",
    tela: "Ações em Massa",

    // A lista de plataformas de destino é montada pelo acoes-massa.js.
    pronto: function () {
      return !!document.querySelector("#platformSelectionContainer input");
    },

    passos: [
      {
        alvo: null,
        titulo: "Ações em Massa",
        texto:
          "Atualize custo, taxas e margem de vários produtos — em várias plataformas — de uma só vez. " +
          "Os preços e os kits são recalculados na hora." +
          '<span class="btu-nota">Se esta tela estiver bloqueada em <strong>Dados da Empresa › Usuários e Senhas</strong>, ' +
          "ela abre com a senha do <strong>Administrador</strong> ou a do <strong>Colaborador</strong>.</span>",
      },
      {
        alvo: [".sku-linha .input-addon-wrap", "#skuInput"],
        titulo: "Escolha os produtos",
        texto:
          "Digite um <strong>SKU</strong> e tecle <kbd>Enter</kbd> — dá para adicionar vários. " +
          "O produto é encontrado em todas as plataformas que tiverem esse SKU, e uma prévia mostra onde ele está.",
      },
      {
        alvo: "#selGlobal",
        titulo: "Seleção global",
        texto:
          "Marcado, aplica a alteração a <strong>todos os produtos</strong> das plataformas escolhidas, sem digitar SKU. " +
          "Use com cuidado: é a ação mais ampla da tela.",
      },
      {
        alvo: uniao(".select-all-row", "#platformSelectionContainer"),
        titulo: "Plataformas de destino",
        texto:
          "Escolha em quais lojas a alteração vale. <strong>Selecionar Todas</strong> marca ou desmarca todas de uma vez.",
      },
      {
        alvo: [".mass-cols .mass-col", ".mass-cols"],
        titulo: "Campos para atualizar",
        texto:
          "Marque só os campos que devem mudar e digite o novo valor. Campo desmarcado fica como está em cada produto." +
          '<span class="btu-nota">Em produtos compostos (kits de componentes), o Preço de Custo fica bloqueado: ' +
          "ele vem da soma dos componentes. Ao mudar o Preço de Custo de um item, os compostos da mesma plataforma " +
          "que o usam são atualizados junto. Com vários SKUs (ou todos os produtos), o custo digitado nunca vai para um " +
          "composto: os outros campos dele mudam normalmente.</span>",
      },
      {
        alvo: linhaDo("chkTaxa"),
        titulo: "Taxa da plataforma",
        texto:
          "Com o <strong>Mercado Livre</strong> entre os destinos, aparecem os campos <strong>Premium</strong> e " +
          "<strong>Clássico</strong>; para as outras lojas, o campo único. Com os dois tipos marcados, aparecem os três.",
      },
      {
        alvo: linhaDo("chkMargem"),
        titulo: "Margem de lucro",
        texto:
          "Como na ficha do produto: <strong>% Percentual</strong> (uma fatia do preço de venda) ou " +
          "<strong>R$ Fixo</strong> por unidade.",
      },
      {
        alvo: [".action-bar", "#btnAplicar"],
        titulo: "Salvar ou cancelar",
        texto:
          "<strong>Salvar</strong> e <strong>Cancelar</strong> ficam fixos no canto inferior direito da tela. " +
          "<strong>Cancelar</strong> limpa o que foi preenchido, sem mexer em nenhum produto. Ao clicar em " +
          "<strong>Salvar</strong>, uma janela mostra o resumo do que vai mudar e pede o <strong>responsável</strong> — um dos " +
          "usuários de <strong>Dados da Empresa › Usuários e Senhas</strong> (quem tem senha confirma com a própria " +
          "senha). Ao confirmar, preços, lucros, margens, kits e Preços Extras são recalculados nas plataformas " +
          "escolhidas — e também os compostos que usam esses itens. Enquanto isso, a janela <strong>Processando ações em " +
          "massa</strong> mostra o andamento (a plataforma e o SKU), e o Salvar fica travado até terminar." +
          '<span class="btu-nota">O que faltar — produto, plataforma ou campo — fica em vermelho.</span>',
      },
      {
        alvo: "#historicoBox",
        titulo: "Histórico",
        texto:
          "As últimas 9 atualizações ficam guardadas aqui, com o responsável. Clique em uma para ver exatamente " +
          "o que foi alterado.",
      },
      {
        alvo: null,
        icone: "ok",
        titulo: "Pronto",
        texto: "Comece por um SKU só, confira o resultado e depois amplie. O histórico ajuda a lembrar o que foi feito.",
      },
    ],
  });
})();

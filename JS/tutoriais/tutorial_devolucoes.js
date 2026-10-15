/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — tutorial_devolucoes.js
   Tutorial do Gestor de Devoluções (devolucoes.html).
   Só descreve os passos; a mecânica está em tutorial_core.js.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";
  if (!window.BapellTutorial) return;
  var U = window.BapellTutorial.util;

  BapellTutorial.registrar({
    id: "devolucoes",
    tela: "Gestor de Devoluções",

    pronto: function () {
      return !!document.getElementById("btnAddDevolucao") && !!document.getElementById("listaEmpresas");
    },

    passos: [
      {
        alvo: null,
        titulo: "Gestor de Devoluções",
        texto:
          "Registre cada produto que voltou, veja quanto as devoluções custaram e quanto as plataformas reembolsaram — " +
          "e lance o prejuízo no Controle Financeiro sem digitar nada de novo. As devoluções que ainda estão a caminho " +
          "também ficam registradas aqui, para lançar quando chegarem.",
      },
      {
        alvo: ".dev-aside-nav .dev-nav",
        titulo: "As telas do Gestor",
        texto:
          "<strong>Lançamento de devoluções</strong>: o painel e a lista das devoluções que já chegaram. " +
          "<strong>Registrar futuras devoluções</strong>: anote uma devolução que ainda está a caminho, com o que já souber. " +
          "<strong>Acompanhar devoluções</strong>: as que estão a caminho — o número no ícone é quantas aguardam chegada.",
      },
      {
        alvo: function () { return U ? U.uniao("#navLembretes", "#navFinanceiro")() : null; },
        titulo: "Atalhos",
        texto: "Daqui você vai direto para os <strong>Lembretes</strong> e para o <strong>Controle Financeiro</strong>.",
      },
      {
        alvo: function () {
          var lista = document.getElementById("listaEmpresas");
          return lista ? lista.closest(".sidebar-section") : null;
        },
        titulo: "Empresas",
        texto:
          "Clique numa empresa para ver só as devoluções dela; <strong>Todas as empresas</strong> mostra o conjunto. " +
          "O número ao lado de cada nome é a quantidade de devoluções registradas. " +
          "As empresas vêm do cadastro em <strong>Dados da Empresa</strong>; <strong>Adicionar Empresa</strong> leva até lá.",
      },
      {
        alvo: "#devSemEmpresa",
        titulo: "Cadastre uma empresa primeiro",
        texto:
          "Cada devolução pertence a uma empresa, e é dela que vem a alíquota do imposto. " +
          "Cadastre a empresa em <strong>Dados da Empresa</strong> e volte aqui.",
      },
      {
        alvo: "#btnAddDevolucao",
        titulo: "Adicionar devolução",
        texto:
          "Escolha a empresa e a loja, digite o <strong>SKU</strong> — a busca sugere produtos e kits enquanto você digita — " +
          "e o valor vem preenchido com o preço atual do produto naquela loja (no Mercado Livre, escolha Premium ou Clássico). " +
          "Depois informe a data de chegada, a quantidade e os números da venda, responda às quatro listas " +
          "(imposto, reputação, reembolso e estado do produto) e escolha o <strong>responsável</strong> pelo lançamento. " +
          "Pagou algo a mais pela devolução, como o frete? Informe em <strong>Valor extra</strong>, ao lado das observações, " +
          "com o motivo embaixo." +
          '<span class="btu-nota">Com <strong>Gerou imposto</strong> em Sim, o imposto é calculado com a alíquota da empresa ' +
          "sobre valor × quantidade (o valor cheio da venda). O prejuízo é o imposto mais o valor extra. Se a <strong>plataforma reembolsou</strong>, " +
          "informe o <strong>valor reembolsado</strong> (a venda menos as taxas): é ele que entra em Reembolsos. O imposto fica só registrado " +
          "e o prejuízo é só o valor extra (zero, sem ele). Se a plataforma ainda não decidiu, escolha <strong>Aguardando</strong>: " +
          "até a resposta, conta como sem reembolso.</span>",
      },
      {
        alvo: "#devCards",
        titulo: "Indicadores",
        texto:
          "Total de devoluções, produto mais devolvido, loja com mais devoluções, prejuízo total e reembolsos " +
          "(valor e quantidade). Os números acompanham os filtros e mudam a cada devolução criada, editada ou excluída.",
      },
      {
        alvo: "#devFiltros",
        titulo: "Filtros combinados",
        texto:
          "Pesquise por SKU, produto, número da venda, número no ERP ou observação e combine empresa, loja, estado, reembolso, imposto, reputação, " +
          "situação no financeiro e período. A lista mostra só as devoluções que atendem a <strong>todos</strong> os filtros. " +
          "<strong>Limpar filtros</strong> volta a mostrar tudo.",
      },
      {
        alvo: function () {
          var corpo = document.getElementById("devCorpo");
          if (corpo && corpo.querySelector("tr")) return document.getElementById("devLista");
          return document.getElementById("devVazio") || document.getElementById("devLista");
        },
        titulo: "Lista de devoluções",
        texto: function (el) {
          if (el && el.id === "devVazio") {
            return "As devoluções registradas aparecem aqui, da chegada mais recente para a mais antiga.";
          }
          return (
            "Cada linha traz o valor (com a quantidade embaixo), o imposto e o prejuízo (com o valor extra e o reembolso embaixo). " +
            "Clique nos títulos <strong>Chegada</strong>, <strong>Valor</strong> e <strong>Prejuízo</strong> para ordenar. " +
            "Clique na linha para editar; os botões ao lado lançam o prejuízo no financeiro, editam ou excluem."
          );
        },
      },
      {
        alvo: "#btnExportarLote",
        titulo: "Lançar no Controle Financeiro",
        texto:
          "O prejuízo vira uma <strong>saída</strong> na categoria <strong>DEVOLUÇÃO</strong> do Controle Financeiro, " +
          "na mesma empresa. Lance uma devolução pelo botão da linha ou todas as pendentes da lista por aqui." +
          '<span class="btu-nota">Só devoluções com prejuízo podem ser lançadas — as reembolsadas sem valor extra não geram saída. ' +
          "Ao editar ou excluir uma devolução já lançada, você escolhe se a saída no financeiro acompanha a mudança.</span>",
      },
      {
        alvo: "#navRegistrar",
        titulo: "Registrar futuras devoluções",
        texto:
          "Soube de uma devolução que ainda não chegou? Registre aqui com o que já tiver: a empresa, a loja, o produto " +
          "ou o número da venda e o responsável. A <strong>previsão de chegada</strong> ajuda a acompanhar." +
          '<span class="btu-nota">É o mesmo formulário do lançamento, com menos campos obrigatórios — o valor extra e o motivo ' +
          "também podem ir, se você já souber.</span>",
      },
      {
        alvo: "#dfLista",
        vitrine: [{ alvo: "#vistaLancamento", ocultar: true }, { alvo: "#vistaAcompanhar", display: "block" }],
        titulo: "Acompanhar devoluções",
        texto:
          "As devoluções a caminho, das que chegam primeiro para as últimas (as atrasadas ficam marcadas). " +
          "Quando o produto chegar, o botão de <strong>lançar</strong> abre o lançamento já preenchido (com o valor extra, se houver); depois de salvo, " +
          "ela passa para <strong>Já lançadas</strong> e não pode ser lançada de novo." +
          '<span class="btu-nota">O sino cria um lembrete na tela Lembretes, com os dados da devolução.</span>',
      },
      {
        alvo: null,
        icone: "ok",
        titulo: "Pronto",
        texto:
          "Comece por <strong>Adicionar devolução</strong>. Tudo fica salvo no computador e continua aqui quando você reabrir o programa.",
      },
    ],
  });
})();

/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — tutorial_lembretes.js
   Tutorial dos Lembretes (lembretes.html).
   Só descreve os passos; a mecânica está em tutorial_core.js.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";
  if (!window.BapellTutorial) return;

  var todos = BapellTutorial.util.todos;

  BapellTutorial.registrar({
    id: "lembretes",
    tela: "Lembretes",

    pronto: function () {
      return !!document.getElementById("btnNovo");
    },

    passos: [
      {
        alvo: null,
        titulo: "Lembretes",
        texto:
          "Contas a pagar, entregas, renovações: agende avisos com data e hora. Na hora marcada, uma janela de aviso " +
          "aparece no canto da tela, por cima das outras — mesmo com o sistema minimizado na bandeja.",
      },
      {
        alvo: "#btnNovo",
        titulo: "Novo lembrete",
        texto:
          "Título e data/hora são obrigatórios — o que faltar fica em vermelho. Se quiser, informe a empresa, o " +
          "recebedor, um valor (em R$ ou texto), quem colocou o lembrete (um dos usuários de " +
          "<strong>Dados da Empresa › Usuários e Senhas</strong>) e observações.",
      },
      {
        alvo: todos("#sidebar .lem-vista"),
        titulo: "Visões",
        texto:
          "<strong>Todos</strong>, <strong>Próximos</strong>, <strong>Vencidos</strong>, <strong>Concluídos</strong> e " +
          "<strong>Ocultos</strong>, com a contagem de cada um. O status é calculado sozinho, pela data. " +
          "A tela abre em <strong>Próximos</strong>.",
      },
      {
        alvo: ".lem-toolbar",
        titulo: "Filtros",
        texto: "Filtre por empresa e por período, ou busque pelo título e pelo recebedor.",
      },
      {
        alvo: function () {
          var lista = document.getElementById("lemLista");
          if (lista && lista.children.length && BapellTutorial.util.visivel(lista)) return lista;
          return document.getElementById("lemVazio");
        },
        titulo: "Seus lembretes",
        texto: function (el) {
          var acoes =
            "No menu de ações de cada um: <strong>Concluir</strong>, <strong>Clonar</strong>, " +
            "<strong>Repetir</strong> (um novo, com os mesmos dados e outra data), <strong>Ocultar</strong>, " +
            "<strong>Editar</strong> e <strong>Excluir</strong>.";
          if (el && el.id === "lemVazio") return "Os lembretes criados aparecem aqui. " + acoes;
          return "Clique num lembrete para ver os detalhes. " + acoes;
        },
      },
      {
        alvo: null,
        icone: "ok",
        titulo: "Pronto",
        texto:
          "Cada lembrete avisa uma vez, quando vence; concluídos e ocultos não avisam. Na janela de aviso: " +
          "<strong>Concluir</strong>, <strong>Abrir lembrete</strong> (mostra a ficha dele aqui) ou " +
          "<strong>Lembrar de novo</strong> em 5, 15 ou 30 minutos, 1 hora ou amanhã às 9h. " +
          "Com vários vencidos, as setas passam de um para o outro.",
      },
    ],
  });
})();

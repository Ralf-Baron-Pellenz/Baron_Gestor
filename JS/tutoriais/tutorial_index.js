/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — tutorial_index.js
   Tutorial do Painel inicial (index.html).
   Só descreve os passos; a mecânica está em tutorial_core.js.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";
  if (!window.BapellTutorial) return;

  BapellTutorial.registrar({
    id: "index",
    tela: "Painel inicial",

    // Os cartões das plataformas são montados pelo main.js.
    pronto: function () {
      return !!document.querySelector("#platformsGrid .platform-card, #emptyPlatforms");
    },

    passos: [
      {
        alvo: null,
        titulo: "Bem-vindo ao Bapell Gestor Pro",
        texto:
          "Este é o <strong>painel inicial</strong>: daqui você chega às suas plataformas de venda e a todos os módulos do sistema. " +
          "Em poucos passos mostramos onde fica cada coisa.",
      },
      {
        alvo: ["#platformsGrid", "#emptyPlatforms"],
        titulo: "Suas plataformas",
        texto: function (el) {
          if (el && el.id === "emptyPlatforms") {
            return "Ainda não há plataformas visíveis. Cadastre a primeira para começar a precificar seus produtos.";
          }
          return (
            "Cada cartão é uma loja onde você vende, com a quantidade de produtos cadastrados. " +
            "<strong>Clique no cartão</strong> para abrir a lista de produtos daquela loja." +
            '<span class="btu-nota">A <strong>Loja Física</strong> já vem cadastrada. Ela pode ser editada, mas não ocultada nem excluída.</span>'
          );
        },
      },
      {
        alvo: "#platformsGrid .platform-card .btn-options",
        titulo: "Opções da loja",
        texto:
          "Em <strong>Opções</strong> você edita o nome e a logo, oculta a loja do painel ou a exclui." +
          '<span class="btu-nota">Excluir uma loja apaga também todos os produtos dela, de forma permanente. ' +
          "Se a ideia é só tirar da frente, prefira ocultar.</span>",
      },
      {
        alvo: "#btnAddPlatform",
        titulo: "Adicionar plataforma",
        texto:
          "Cadastre um novo canal de venda: informe o nome e anexe a logo — obrigatória, " +
          "<strong>quadrada</strong>, entre 200×200 e 500×500 px (de preferência PNG). " +
          "A loja nova entra no painel em ordem alfabética.",
      },
      {
        alvo: "#modulesNav",
        titulo: "Módulos do sistema",
        texto:
          "As ferramentas ficam aqui, em três grupos: <strong>Operação</strong>, <strong>Gestão</strong> e " +
          "<strong>Ferramentas</strong>. Clique em um módulo para abri-lo. Os módulos <strong>Plus</strong> que não " +
          "fazem parte do seu plano aparecem mais apagados, com um <strong>+</strong> no ícone." +
          '<span class="btu-nota">Para abrir em uma <strong>nova aba</strong>, como no navegador: <strong>botão direito</strong> ' +
          "(que também oferece a aba fixada, que volta aberta quando você reinicia o sistema), " +
          "<strong>botão do meio</strong> do mouse ou <kbd>Ctrl</kbd> + clique. Vale para todos os itens do menu lateral, em todas as telas.</span>",
      },
      {
        alvo: "#btnReorderModules",
        titulo: "Reordenar módulos",
        texto:
          "Deixe os módulos que você mais usa no alto do menu. Clique em <strong>Reordenar módulos</strong>, " +
          "arraste cada item pela alça pontilhada e termine em <strong>Concluir ordenação</strong>. A ordem fica salva.",
      },
      {
        alvo: "#btnHideModules",
        titulo: "Ocultar módulos",
        texto:
          "Não usa algum módulo? Abra este painel e toque nele para tirá-lo do menu. " +
          "Nada é apagado: os dados do módulo continuam salvos.",
      },
      {
        alvo: "#hiddenModulesBadge",
        titulo: "Módulos ocultos",
        espaco: 6,
        texto:
          "Este número mostra quantos módulos estão ocultos agora. " +
          "Para trazer um de volta, abra o mesmo painel e toque no módulo outra vez.",
      },
      {
        alvo: "#btnHiddenPlatforms",
        titulo: "Lojas ocultas",
        texto:
          "As lojas que você ocultar pelas <strong>Opções</strong> do cartão ficam guardadas aqui, com os produtos intactos. " +
          "Abra a lista e clique em <strong>Reativar</strong> para a loja voltar ao painel.",
      },
      {
        alvo: "#statsPanels",
        titulo: "Resumo rápido",
        texto:
          "<strong>Panorama do mês</strong> mostra faturamento, despesas e lucro do mês da empresa escolhida " +
          "(a setinha ao lado do nome troca a empresa). Ao lado ficam os <strong>próximos lembretes</strong> " +
          "e quantas plataformas estão ativas (a Loja Física já conta) e quantos produtos há. " +
          "Clique no panorama ou nos lembretes para abrir o módulo.",
      },
      {
        alvo: "#themeSwitcher",
        titulo: "Tema",
        texto:
          "Escolha entre <strong>Claro</strong>, <strong>Padrão</strong> e <strong>Dark Absoluto</strong>. " +
          "A troca vale na hora para todas as telas abertas.",
      },
      {
        alvo: '.sidebar-footer-index a[href="ajuda.html"]',
        titulo: "Central de Ajuda",
        texto:
          "Dúvidas, backup dos dados e os <strong>tutoriais interativos</strong> de cada tela ficam aqui. " +
          "Você pode rever este tutorial quando quiser.",
      },
      {
        alvo: null,
        icone: "ok",
        titulo: "Tudo pronto",
        texto:
          "Cada tela do sistema tem o seu próprio tutorial, que aparece na primeira vez que você a abre. " +
          "Bom trabalho!",
      },
    ],
  });
})();

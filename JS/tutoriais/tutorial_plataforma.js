/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — tutorial_plataforma.js
   Tutorial da lista de produtos de uma plataforma (plataforma.html).
   Só descreve os passos; a mecânica está em tutorial_core.js.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";
  if (!window.BapellTutorial) return;

  var esc = BapellTutorial.util.esc;

  function nomeDaPlataforma() {
    var el = document.getElementById("pageTitle");
    var nome = el ? String(el.textContent || "").trim() : "";
    return nome && nome !== "Carregando…" ? nome : "";
  }

  BapellTutorial.registrar({
    id: "plataforma",
    tela: "Plataforma",

    // A lista é montada depois que os produtos carregam do armazenamento.
    pronto: function () {
      return !!document.querySelector("#productList .product-row, #productList .empty-state");
    },

    passos: [
      {
        alvo: null,
        titulo: "Lista de produtos",
        texto: function () {
          var nome = nomeDaPlataforma();
          return (
            "Aqui ficam os produtos " + (nome ? "de <strong>" + esc(nome) + "</strong>" : "desta plataforma") +
            ", com o preço de venda já calculado. Veja como encontrar, criar e organizar tudo."
          );
        },
      },
      {
        alvo: "#btnGerenciarImagens",
        titulo: "Gerenciar Imagens",
        texto:
          "Abre <strong>todas as imagens salvas no Bapell</strong>, de todos os produtos e plataformas. " +
          "Busque pelo nome, pelo produto ou pelo SKU, veja onde cada uma está em uso, amplie, renomeie ou exclua." +
          '<span class="btu-nota">Excluir pede confirmação e mostra os produtos que usam a imagem — ela sai de todos eles. ' +
          "O filtro <strong>Sem uso</strong> mostra as que não estão em produto nenhum e só ocupam espaço.</span>",
      },
      {
        alvo: ".toolbar .search-wrap",
        titulo: "Busca",
        texto:
          "Procure por <strong>nome</strong>, <strong>SKU</strong> ou <strong>ID</strong> do anúncio. " +
          "A busca também encontra o SKU de um kit e mostra a qual produto ele pertence.",
      },
      {
        alvo: "#btnNovoProduto",
        titulo: "Criar produto",
        texto:
          "Abre a ficha de precificação em branco: custo, taxas da plataforma, margem e preço final — " +
          "com kits opcionais para vender em quantidade.",
      },
      {
        alvo: "#btnCriarKit",
        titulo: "Criar kit composto",
        texto:
          "Um kit composto junta produtos já cadastrados nesta plataforma (ex.: 1 garrafa + 2 tampas). " +
          "O custo dele é calculado sozinho, pela soma dos itens.",
      },
      {
        alvo: ["#massaDropdownWrap", "#btnClonarMassaTop"],
        titulo: "Opções em massa",
        texto:
          "<strong>Clonar</strong>, <strong>duplicar</strong> ou <strong>excluir</strong> vários produtos de uma vez: " +
          "escolha a ação, marque os produtos na lista e confirme na barra que aparece acima dela." +
          '<span class="btu-nota"><strong>Adicionar pela Planilha</strong>, no mesmo menu, cadastra vários produtos de uma vez ' +
          "a partir da planilha do <strong>Bling</strong>, do <strong>Mercado Livre</strong> ou de <strong>qualquer outra plataforma</strong> " +
          "(o Bapell reconhece os títulos das colunas): nome, SKU, EAN/GTIN, custo, peso e medidas — e, em <strong>Adicionar Campo</strong>, " +
          "qualquer outro campo, com a célula inicial e a final. O preço de venda da planilha entra desmarcado: marcado, vira a margem. " +
          "Você confere tudo antes de cadastrar, e o SKU que já existe na plataforma é pulado.</span>" +
          '<span class="btu-nota"><strong>Exportar para Planilha</strong> faz o caminho contrário: preenche a planilha do Bling, ' +
          "do Mercado Livre ou de qualquer sistema com os produtos desta plataforma. Você escolhe onde vai cada campo e pode salvar a configuração.</span>",
      },
      {
        alvo: ["#filtrarDropdownWrap", "#btnFiltrar"],
        titulo: "Filtrar e ordenar",
        texto:
          "Marque um ou mais tipos — <strong>simples</strong>, <strong>com kits</strong>, <strong>compostos</strong> — " +
          "e combine com a ordem (nome, preço ou data): a lista mostra os que se encaixam em qualquer um dos tipos " +
          "marcados. A combinação fica salva como padrão, para todas as plataformas; " +
          "<strong>Limpar filtros</strong> volta a mostrar tudo. A busca fica guardada até você fechar o sistema.",
      },
      {
        alvo: "#productListHead",
        titulo: "Colunas da lista",
        texto: function () {
          var lista = document.getElementById("productList");
          var ml = lista && lista.classList.contains("com-ml");
          return (
            "Foto, descrição, SKU, tipo (simples, composto ou quantos kits tem) e o preço de venda." +
            (ml
              ? '<span class="btu-nota">No Mercado Livre a coluna <strong>Preço</strong> mostra os dois valores: Premium e Clássico.</span>'
              : "")
          );
        },
      },
      {
        alvo: ["#productList .product-row", "#productList .empty-state"],
        titulo: "Abrir um produto",
        texto: function (el) {
          if (el && el.classList.contains("empty-state")) {
            return "Ainda não há produtos aqui. Crie o primeiro ou adicione vários pela planilha.";
          }
          return "Clique na linha para abrir a ficha do produto e ajustar a precificação.";
        },
      },
      {
        alvo: "#productList .product-menu-btn",
        titulo: "Menu do produto",
        texto:
          "<ul>" +
          "<li><strong>Duplicar</strong>: cria uma cópia nesta loja (“Cópia de…”, SKU com “-copia”) e já abre para editar.</li>" +
          "<li><strong>Clonar</strong>: copia o produto, com kits e fotos, para outra plataforma.</li>" +
          "<li><strong>Excluir</strong>: remove o produto de vez — não dá para desfazer.</li>" +
          "</ul>",
      },
      {
        alvo: "#pgRodape",
        titulo: "Páginas",
        texto: "A lista mostra 30 produtos por página. Use estes botões para navegar entre elas.",
      },
      {
        alvo: function () {
          var ativo = document.querySelector("#sidebar .sidebar-item.active");
          return ativo ? ativo.closest(".sidebar-section") || ativo : null;
        },
        titulo: "Trocar de plataforma",
        texto:
          "Pule direto para outra loja por este menu. Para abrir em uma nova aba, use o <strong>botão do meio</strong>, " +
          "<kbd>Ctrl</kbd> + clique ou o <strong>botão direito</strong>." +
          '<span class="btu-nota">Criar ou editar uma plataforma é no <strong>Painel inicial</strong>: ' +
          "botão <strong>Adicionar Plataforma</strong> e <strong>Opções</strong> do cartão. " +
          "As colunas da planilha de vendas de cada plataforma são configuradas no <strong>Processador de Planilhas</strong>.</span>",
      },
      {
        alvo: null,
        icone: "ok",
        titulo: "Pronto",
        texto: "Abra ou crie um produto para conhecer a ficha de precificação — ela também tem o seu tutorial.",
      },
    ],
  });
})();

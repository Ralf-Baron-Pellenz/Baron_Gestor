/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — tutorial_registro_vendas.js
   Tutorial do Registro de Vendas (registro-vendas.html).
   Só descreve os passos; a mecânica está em tutorial_core.js.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";
  if (!window.BapellTutorial) return;

  BapellTutorial.registrar({
    id: "registro-vendas",
    tela: "Registro de Vendas",

    pronto: function () {
      return !!document.getElementById("blocoCliente");
    },

    passos: [
      {
        alvo: null,
        titulo: "Registro de Vendas",
        texto:
          "Monte a venda, gere um orçamento em PDF e lance a receita no Controle Financeiro — tudo nesta tela. " +
          "A venda é montada em três blocos, de cima para baixo.",
      },
      {
        alvo: "#blocoCliente",
        titulo: "1. Comprador",
        texto:
          "Clique para localizar um cliente pelo <strong>CPF/CNPJ</strong> ou pelo nome. " +
          "Se for alguém novo, preencha os dados ali mesmo: o cadastro fica salvo para as próximas vendas. " +
          "O CPF ou CNPJ — inclusive o CNPJ com letras — é formatado e conferido na hora.",
      },
      {
        alvo: '#sidebar .sidebar-item-btn[title="Clientes"]',
        titulo: "Cadastro de clientes",
        texto:
          "Todos os compradores salvos ficam em <strong>Clientes</strong>, onde você consulta, cria e corrige os cadastros.",
      },
      {
        alvo: "#blocoEmpresa",
        titulo: "2. Empresa",
        texto:
          "Escolha a empresa que recebe a venda — é nela que a receita cai no financeiro. " +
          "As vendas desta tela são registradas como da <strong>Loja Física</strong>.",
      },
      {
        alvo: ".rv-produtos-bloco",
        titulo: "3. Produtos",
        texto:
          "Em <strong>Adicionar produto</strong>, digite o SKU ou o nome — a busca sugere os produtos cadastrados — " +
          "e informe o preço e a quantidade. Clique num item do carrinho para editá-lo. O total é somado sozinho.",
      },
      {
        alvo: ".rv-form-actions",
        titulo: "Orçamento ou venda",
        texto:
          "<strong>Gerar PDF</strong> cria um orçamento para enviar ao cliente, sem registrar nada. " +
          "<strong>Salvar venda</strong> pede responsável, pagamento, status e data — e pode lançar a receita " +
          "no DRE da empresa. <strong>Limpar</strong> recomeça a montagem." +
          '<span class="btu-nota">O <strong>responsável</strong> é escolhido entre os usuários de ' +
          "<strong>Dados da Empresa › Usuários e Senhas</strong>. Se ele tiver senha, a venda só é lançada " +
          "com a senha dele. O que faltar preencher fica em vermelho.</span>",
      },
      {
        alvo: ".rv-kpis",
        titulo: "Indicadores",
        texto:
          "Total de vendas, valor, itens vendidos e ticket médio. Os números acompanham os filtros logo abaixo.",
      },
      {
        alvo: ".rv-filters",
        titulo: "Filtros",
        texto:
          "Pesquise por qualquer informação ou combine período, cliente, CPF/CNPJ, empresa, plataforma, pagamento, " +
          "status e responsável. <strong>Limpar filtros</strong> volta a mostrar tudo.",
      },
      {
        alvo: function () {
          var lista = document.getElementById("rvLista");
          if (lista && lista.querySelector(".rv-venda-card")) return lista;
          return document.getElementById("rvEmpty");
        },
        titulo: "Histórico de vendas",
        texto: function (el) {
          if (el && el.id === "rvEmpty") {
            return "As vendas salvas aparecem aqui, da mais recente para a mais antiga, prontas para consultar e editar.";
          }
          return (
            "Cada venda salva fica aqui, da mais recente para a mais antiga. <strong>Clique no cartão</strong> para editar — " +
            "a alteração fica registrada com o nome do responsável (com a senha dele, se tiver) — ou use a lixeira para excluir."
          );
        },
      },
      {
        alvo: null,
        icone: "ok",
        titulo: "Pronto",
        texto: "Comece pelo comprador e siga os blocos na ordem. Com a empresa escolhida, a opção de lançar a receita no DRE já vem marcada ao salvar.",
      },
    ],
  });
})();

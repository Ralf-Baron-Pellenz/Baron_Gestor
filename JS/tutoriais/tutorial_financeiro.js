/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — tutorial_financeiro.js
   Tutorial do Controle Financeiro / DRE (financeiro.html).
   Só descreve os passos; a mecânica está em tutorial_core.js.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";
  if (!window.BapellTutorial) return;

  var uniao = BapellTutorial.util.uniao;

  BapellTutorial.registrar({
    id: "financeiro",
    tela: "Controle Financeiro",

    // Os indicadores e o extrato são montados pelo financeiro.js.
    pronto: function () {
      var vazio = document.getElementById("finEmptyState");
      if (vazio && vazio.style.display !== "none") return true;
      return !!document.querySelector("#insightsLista > *");
    },

    passos: [
      {
        alvo: null,
        titulo: "Controle Financeiro",
        texto:
          "O DRE da sua empresa: entradas, saídas e lucro, com indicadores, análises, gráficos e extrato. " +
          "As vendas salvas no Registro de Vendas e as exportadas pelo Processador de Planilhas também entram aqui, " +
          "assim como o prejuízo das devoluções lançado pelo Gestor de Devoluções (saída na categoria <strong>DEVOLUÇÃO</strong>)." +
          '<span class="btu-nota">Se esta tela estiver bloqueada em <strong>Dados da Empresa › Usuários e Senhas</strong>, ' +
          "ela abre com a senha do <strong>Administrador</strong> ou a do <strong>Colaborador</strong>.</span>",
      },
      {
        alvo: "#finEmptyState",
        titulo: "Primeira empresa",
        texto:
          "Adicione uma empresa para começar. As empresas vêm do cadastro em <strong>Dados da Empresa</strong>.",
      },
      {
        alvo: [".sidebar-empresa-box", "#empresaAtivaBox"],
        titulo: "Empresas",
        texto:
          "Cada empresa tem o seu próprio financeiro. A seta troca a empresa da tela; no menu de três pontos você " +
          "adiciona outra empresa do cadastro ou exclui a atual." +
          '<span class="btu-nota">Excluir uma empresa daqui apaga, de forma permanente, todos os lançamentos dela no financeiro.</span>',
      },
      {
        alvo: "#btnAddCamposFin",
        titulo: "Adicionar Campos",
        texto:
          "Crie campos seus — uma comissão, juros, o nº do pedido. Escolha o formulário (<strong>Registrar Entrada</strong> " +
          "ou <strong>Registrar Saída</strong>), o nome e o tipo." +
          '<span class="btu-nota">Campos em <strong>R$</strong> e <strong>%</strong> entram no cálculo: na entrada, são descontados ' +
          "do valor bruto; na saída, somados ao valor. Para apagar um campo, use o <strong>Excluir</strong> ao lado do nome dele.</span>",
      },
      {
        alvo: "#periodoChips",
        titulo: "Período",
        texto:
          "Todos os números da tela seguem o período escolhido: <strong>mês atual</strong>, <strong>mês passado</strong>, " +
          "<strong>ano atual</strong>, <strong>12 meses</strong>, <strong>tudo</strong> ou um intervalo <strong>personalizado</strong>. " +
          "Logo abaixo aparece com qual período ele está sendo comparado — no mês atual, o mesmo trecho do mês passado.",
      },
      {
        alvo: ".fin-meta-header",
        titulo: "Meta do mês",
        texto:
          "Defina uma meta de faturamento mensal e acompanhe pela barra quanto dela já foi alcançado, quanto falta e, " +
          "no ritmo atual, com quanto o mês deve fechar. A meta usa sempre o mês atual, qualquer que seja o período escolhido.",
      },
      {
        alvo: "#finCards",
        titulo: "Indicadores",
        texto:
          "Faturamento bruto, CMV (custo do produto), despesas totais, lucro líquido, margem de lucro e ticket médio do período. " +
          "Cada um mostra a variação em relação ao período anterior (▲ ▼, em verde quando é bom) e um minigráfico dos últimos 6 meses — " +
          "passe o mouse para ver os valores.",
      },
      {
        alvo: '[data-bloco="insights"]',
        titulo: "Insights",
        texto:
          "Leituras automáticas do período, duas por linha, das que pedem atenção às que vão bem: margem, comparação com o período " +
          "anterior, projeção do mês, ponto de equilíbrio, o peso do CMV, das taxas e das despesas fixas, o canal campeão, " +
          "quanto custa vender em cada canal, o maior gasto e o melhor dia de vendas.",
      },
      {
        alvo: '[data-bloco="lancamentos"]',
        titulo: "Entradas e saídas",
        texto:
          "No <strong>Registrar Entrada</strong>, as vendas — canal, descrição (opcional), valor e impostos em R$ ou %, " +
          "com a prévia da receita líquida. No <strong>Registrar Saída</strong>, custos e despesas por categoria, com o total da saída. " +
          "Todo lançamento — e toda edição — pede o <strong>responsável</strong>, escolhido entre os usuários de " +
          "<strong>Dados da Empresa › Usuários e Senhas</strong>; quem tem senha confirma com a própria senha." +
          '<span class="btu-nota"><strong>Taxa Canal/Cartão</strong> e <strong>Custo Frete</strong> começam ocultos — para usá-los, ' +
          "<strong>Configurar Campos › Registrar Entrada › Mostrar</strong>. " +
          "Na lista do Responsável, a última linha, <strong>+ Cadastrar usuário…</strong>, abre o cadastro. " +
          "O <strong>Enter</strong> num campo também lança. Em <strong>Lançar de novo</strong> ficam as contas que se repetem " +
          "(aluguel, luz...): um clique copia a última para o formulário, com a data de hoje.</span>",
      },
      {
        alvo: '[data-bloco="dre"]',
        titulo: "DRE do período",
        texto:
          "A demonstração do resultado: receita bruta, deduções, receita líquida, CMV, lucro bruto, despesas e o resultado, " +
          "com quanto cada linha representa da receita e a variação em relação ao período anterior. Clique em " +
          "<strong>Deduções</strong> ou <strong>Despesas</strong> para ver o detalhe; ao lado, a cascata do faturamento até o lucro.",
      },
      {
        alvo: '[data-bloco="canais"]',
        titulo: "Desempenho por canal",
        texto:
          "Quanto cada canal vendeu, quanto foi embora em taxas, fretes e impostos e quanto <strong>ficou com você</strong> — " +
          "além do ticket médio e da participação de cada um no faturamento.",
      },
      {
        alvo: '[data-bloco="graficos"]',
        titulo: "Gráficos",
        texto:
          "O fluxo de caixa do período (entradas, saídas e o saldo acumulado), para onde vai o dinheiro, entradas x saídas " +
          "por mês (com a linha da meta), a evolução do lucro líquido e a receita por canal.",
      },
      {
        alvo: '[data-bloco="extrato"]',
        titulo: "Extrato",
        texto:
          "Todos os lançamentos, com filtros por tipo, categoria e período, busca e os totais do que está filtrado. " +
          "Clique em <strong>Data</strong>, <strong>Valor Bruto</strong> ou <strong>Líquido</strong> para ordenar. " +
          "Em cada linha: <strong>duplicar</strong> (copia para o formulário), <strong>editar</strong> e <strong>excluir</strong> " +
          "(que pede confirmação)." +
          '<span class="btu-nota">O botão <strong>Planilha</strong> baixa o que está no extrato num arquivo do Excel, com uma aba do DRE.</span>',
      },
      {
        alvo: "#btnExportar",
        titulo: "Exportar relatório",
        texto:
          "Gera o relatório do período escolhido — indicadores com a comparação, DRE, canais, destaques e lançamentos — " +
          "pronto para imprimir ou salvar em PDF.",
      },
      {
        alvo: uniao("#btnAddSecao", "#btnConfigCampos"),
        titulo: "Personalizar",
        texto:
          "<strong>Configurar Campos</strong> oculta ou mostra indicadores, campos dos formulários (como a taxa e o frete " +
          "da entrada) ou blocos inteiros (insights, DRE, canais, gráficos, extrato). <strong>Adicionar Seção</strong> cria uma área sua na tela." +
          '<span class="btu-nota">No fim do Configurar Campos, em <strong>Segurança</strong>, fica o atalho para ' +
          "<strong>Usuários e Senhas</strong> — só a senha do Administrador abre.</span>",
      },
      {
        alvo: null,
        icone: "ok",
        titulo: "Pronto",
        texto: "Escolha o período, lance entradas e saídas e acompanhe os indicadores. Você pode rever este tutorial pela Central de Ajuda.",
      },
    ],
  });
})();

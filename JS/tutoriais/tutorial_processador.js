/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — tutorial_processador.js
   Tutorial do Processador de Planilhas (vendas-import.html).
   Só descreve os passos; a mecânica está em tutorial_core.js.

   As etapas 3 em diante e o resultado só aparecem depois que uma planilha
   é escolhida. Para mostrá-las, os passos usam a "vitrine" do controlador:
   a área escondida aparece enquanto o passo está na tela e volta a ficar
   escondida, exatamente como estava, ao sair dele. Nada é processado.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";
  if (!window.BapellTutorial) return;

  // Linhas do passo 3 (intervalos), identificadas pelo campo que contêm.
  function linhaDoCampo(id) {
    var el = document.getElementById(id);
    return el ? el.closest(".vi-range-linha") : null;
  }
  function grupoDo(id) {
    var el = document.getElementById(id);
    return el ? el.closest(".field-group") : null;
  }

  var CARD_COLUNAS = { alvo: "#viCardIntervalos", display: "block" };
  var MODAL_RESULTADO = { alvo: "#viResultado", display: "flex" };

  BapellTutorial.registrar({
    id: "processador",
    tela: "Processador de Planilhas",

    // As listas de empresas e plataformas são preenchidas pelo vendas-import.js.
    pronto: function () {
      var sel = document.getElementById("viPlataforma");
      return !!(sel && sel.options.length > 1) || !!document.getElementById("viUpload");
    },

    passos: [
      {
        alvo: null,
        titulo: "Processador de Planilhas",
        texto:
          "Transforme o relatório de vendas da plataforma em números reais: quanto você vendeu, quanto a plataforma pagou, " +
          "o custo dos produtos e quanto sobrou — com o detalhe de cada SKU." +
          '<span class="btu-nota">Se esta tela estiver bloqueada em <strong>Dados da Empresa › Usuários e Senhas</strong>, ' +
          "ela abre com a senha do <strong>Administrador</strong> ou a do <strong>Colaborador</strong>.</span>",
      },
      {
        alvo: ".vi-tabs",
        titulo: "Três abas",
        texto:
          "<strong>Importar Vendas</strong> é o passo a passo. <strong>Importações Salvas</strong> guarda os relatórios. " +
          "<strong>Meus Impostos</strong> estima o imposto das importações de cada empresa.",
      },
      {
        alvo: function () {
          return grupoDo("viEmpresa");
        },
        titulo: "1. Empresa",
        texto:
          "A empresa define o percentual de imposto do cálculo — o <strong>imposto por nota</strong> do cadastro em Dados da Empresa.",
      },
      {
        alvo: function () {
          return grupoDo("viPlataforma");
        },
        titulo: "Plataforma",
        texto:
          "Define em quais produtos o sistema procura cada SKU da planilha, para buscar o custo cadastrado.",
      },
      {
        alvo: "#viUpload",
        titulo: "2. Planilha de vendas",
        texto:
          "Escolha o relatório exportado da plataforma: <strong>.xlsx</strong>, <strong>.xls</strong> ou <strong>.csv</strong>. " +
          "A planilha só é lida — nada dela fica guardado. Se ela tiver várias abas, você escolhe qual usar.",
      },
      {
        alvo: function () {
          var els = [linhaDoCampo("viSkuIni"), linhaDoCampo("viBrutoIni")].filter(Boolean);
          return els.length ? els : null;
        },
        vitrine: CARD_COLUNAS,
        titulo: "3. Configurar colunas",
        texto:
          "Esta etapa aparece depois que a planilha é escolhida. Diga onde cada informação começa e termina, " +
          "como <strong>H7</strong> até <strong>H100</strong> — abra a planilha e confira a letra da coluna e a primeira linha com valor." +
          '<span class="btu-nota">O sistema soma exatamente o intervalo informado. Obrigatórios: SKU, Valor Bruto, ' +
          "Valor Recebido e Unidades Vendidas.</span>",
      },
      {
        alvo: function () {
          return linhaDoCampo("viQtdIni");
        },
        vitrine: CARD_COLUNAS,
        titulo: "Unidades vendidas",
        texto:
          "Uma venda pode levar várias unidades. Sem esta coluna o sistema contaria uma por linha, e o custo dos " +
          "produtos sairia menor que o real. No Mercado Livre, é a coluna <strong>Unidades</strong>.",
      },
      {
        alvo: ".vi-modo-linha",
        vitrine: CARD_COLUNAS,
        titulo: "De onde vem o valor recebido",
        texto:
          "Escolha como a sua planilha informa o que a plataforma pagou:" +
          "<ul><li>numa <strong>coluna própria</strong> (ex.: Mercado Livre);</li>" +
          "<li>pelo bruto menos <strong>colunas de desconto</strong> — só as letras, ex.: AQ, AT, AV (Shopee);</li>" +
          "<li>pelo bruto menos um <strong>percentual</strong> que você informa.</li></ul>",
      },
      {
        alvo: ".vi-regras",
        vitrine: CARD_COLUNAS,
        titulo: "Campos personalizados",
        texto:
          "Em <strong>Adicionar Campo de Cálculo</strong>, crie regras de ajuste: escolha o total (bruto, recebido, custo, " +
          "valor real final…), a operação e o valor — digitado, de uma coluna da planilha ou de outro total." +
          '<span class="btu-nota">As regras valem sobre os totais, na ordem em que aparecem. O relatório por SKU não muda.</span>',
      },
      {
        alvo: ".vi-acoes",
        vitrine: CARD_COLUNAS,
        titulo: "Processar",
        texto:
          "<strong>Processar Planilha</strong> confere os intervalos e abre o resultado — o que faltar ou não conferir " +
          "fica em vermelho. <strong>Limpar</strong> recomeça do zero.",
      },
      {
        alvo: ".vi-conta",
        vitrine: [CARD_COLUNAS, MODAL_RESULTADO],
        titulo: "Resultado",
        texto:
          "A conta completa: <strong>você vendeu</strong> → <strong>a plataforma pagou</strong> → " +
          "<strong>custo total dos produtos</strong> → <strong>sobrou para você</strong>.",
      },
      {
        alvo: "#viResultado .vi-tabela-wrap",
        vitrine: [CARD_COLUNAS, MODAL_RESULTADO],
        titulo: "Relatório por SKU",
        texto:
          "Quantidade, valor bruto, recebido, custo unitário, custo total e o <strong>Valor Real Final</strong> de cada SKU." +
          '<span class="btu-nota">SKU sem cadastro na plataforma aparece marcado, com custo zero — ' +
          "cadastre o produto e processe de novo.</span>",
      },
      {
        alvo: ".vi-rodape-dir",
        vitrine: [CARD_COLUNAS, MODAL_RESULTADO],
        titulo: "Salvar e exportar",
        texto:
          "<strong>Salvar Importação</strong> guarda o relatório em Importações Salvas. " +
          "<strong>Exportar para o Financeiro</strong> cria um lançamento de venda no Controle Financeiro, já com a empresa " +
          "e a plataforma: você escolhe qual valor lançar e o <strong>responsável</strong> — um dos usuários de " +
          "<strong>Dados da Empresa › Usuários e Senhas</strong> (quem tem senha confirma com a própria senha).",
      },
      {
        alvo: '.vi-tab[data-aba="impostos"]',
        titulo: "Meus Impostos",
        texto:
          "Estimativa do imposto das importações salvas, pelo percentual de cada empresa, por mês, ano ou tudo. " +
          "É um cálculo aproximado e não substitui o contador.",
      },
      {
        alvo: null,
        icone: "ok",
        titulo: "Pronto",
        texto: "Escolha a empresa, a plataforma e a planilha para começar. Você pode rever este tutorial pela Central de Ajuda.",
      },
    ],
  });
})();

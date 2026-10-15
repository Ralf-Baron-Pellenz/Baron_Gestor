/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — tutorial_produto.js
   Tutorial da ficha de precificação do produto (produto.html).
   Só descreve os passos; a mecânica está em tutorial_core.js.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";
  if (!window.BapellTutorial) return;

  var uniao = BapellTutorial.util.uniao;

  // O painel "Valores Premium e Clássico" só existe em plataformas Mercado Livre.
  function ehML() {
    return !!document.getElementById("mlDualPanel");
  }

  BapellTutorial.registrar({
    id: "produto",
    tela: "Produto",

    // O campos.js coloca os botões de campos no cabeçalho da Identificação
    // depois que a tela monta; o tutorial espera por eles.
    pronto: function () {
      return !!document.querySelector("#cardIdentificacao .btn-add-campos-unico");
    },

    passos: [
      {
        alvo: null,
        titulo: "Ficha de precificação",
        texto:
          "Aqui você monta o preço de venda do produto: do custo ao valor final, com kits e simulações de preço. " +
          "Tudo é recalculado na hora, enquanto você digita.",
      },
      {
        alvo: "#cardIdentificacao",
        titulo: "Identificação",
        texto:
          "Fotos (até 3), nome, <strong>SKU principal</strong> e ID do anúncio, além de peso e medidas — " +
          "que os kits usam para calcular a própria logística." +
          '<span class="btu-nota">O SKU é a chave que liga o produto às Ações em Massa, ao Registro de Vendas ' +
          "e ao Processador de Planilhas. Vale mantê-lo igual ao do anúncio.</span>",
      },
      {
        alvo: "#cardIdentificacao .btn-editar-campos",
        titulo: "Configurar campos",
        texto:
          "Escolha uma área — Identificação, Custo, Venda ou Margem — para <strong>renomear</strong> ou " +
          "<strong>ocultar</strong> campos. Em <strong>Preços Extras</strong>, você oculta a área inteira, " +
          "também nos cards de kit. A configuração vale para todos os produtos desta plataforma." +
          '<span class="btu-nota">Campo oculto sai do cálculo, mas o valor digitado fica guardado: ' +
          "ao mostrá-lo de novo, ele volta a contar.</span>",
      },
      {
        alvo: "#cardIdentificacao .btn-add-campos-unico",
        titulo: "Adicionar campos",
        texto:
          "Crie campos seus. Na Identificação, campos de texto (fornecedor, código interno…). " +
          "No Custo e nas Variáveis de Venda, valores em <strong>R$</strong> ou <strong>%</strong> que entram no cálculo — " +
          "no custo, o % pode incidir sobre o preço de custo ou sobre o custo total.",
      },
      {
        alvo: "#kitComponentsSection",
        seAusente: "centro",
        titulo: "Componentes do kit",
        texto: function (el) {
          if (el) {
            return (
              "Busque produtos <strong>desta plataforma</strong> por nome ou SKU, adicione ao kit e ajuste a quantidade de cada um. " +
              "O <strong>Preço de Custo do Kit</strong> é a soma dos itens e não pode ser editado à mão."
            );
          }
          return (
            "Ao criar um <strong>kit composto</strong> (botão <strong>Criar Kit</strong> na lista de produtos), esta ficha ganha a área " +
            "<strong>Componentes do Kit</strong>: você escolhe os produtos que formam o kit e o custo é a soma deles."
          );
        },
      },
      {
        alvo: "#boxCustoTotal",
        titulo: "Formação do Custo Total",
        texto:
          "Preço de custo, embalagem, etiqueta e frete pago formam o <strong>Custo Total da Unidade</strong>. " +
          "IPI, DIFAL e ST incidem sobre o preço de custo; a Alíquota, sobre o custo total. " +
          "O custo total já inclui esses impostos — o quadro ao lado mostra quanto deles é imposto." +
          '<span class="btu-nota">Ao salvar um novo <strong>Preço de Custo</strong>, mudam junto os produtos compostos ' +
          "que usam este produto e os outros produtos desta plataforma com o mesmo SKU.</span>",
      },
      {
        alvo: "#boxVendaVariaveis",
        titulo: "Variáveis de Venda & Plataforma",
        texto: function () {
          return (
            "Frete do produto, taxa fixa, comissão da plataforma e imposto da nota. Os percentuais incidem sobre o preço de venda." +
            (ehML()
              ? " No Mercado Livre, a comissão tem dois campos: <strong>Premium</strong> e <strong>Clássico</strong>."
              : "") +
            '<span class="btu-nota">A <strong>taxa fixa</strong> só é cobrada quando o preço de venda fica em até R$ 79,00. ' +
            "O sistema decide sozinho, em cada configuração (unidade, cada kit e cada modalidade).</span>"
          );
        },
      },
      {
        alvo: "#boxMargem",
        titulo: "Margem de lucro",
        texto:
          "Escolha <strong>% Percentual</strong> — uma fatia do preço de venda — ou <strong>R$ Fixo</strong>, " +
          "um valor de lucro por unidade. Depois digite a margem desejada.",
      },
      {
        alvo: ".produto-3cols .resultado-box",
        titulo: "Valor final de venda",
        texto:
          "O preço para anunciar a unidade, já com custos, taxas, impostos e margem. " +
          "Logo abaixo: o custo base, o lucro estimado e a margem real.",
      },
      {
        alvo: "#mlDualPanel",
        seAusente: "centro",
        titulo: "Valores Premium e Clássico",
        texto: function (el) {
          if (el) {
            return (
              "O preço de venda do <strong>Premium</strong> e do <strong>Clássico</strong>, lado a lado, " +
              "com o lucro e a margem de cada um. Os kits mostram as duas modalidades também." +
              '<span class="btu-nota">As duas comissões são digitadas nas Variáveis de Venda, ' +
              "em <strong>Taxa Da Plataforma (%)</strong>.</span>"
            );
          }
          return (
            "Em plataformas <strong>Mercado Livre</strong>, a caixa do valor final vira <strong>Valores Premium e Clássico</strong>: " +
            "o preço, o lucro e a margem de cada modalidade, lado a lado."
          );
        },
      },
      {
        alvo: "#btnAddKit",
        titulo: "Kits",
        texto:
          "Venda em quantidade: crie kits de 2, 3, 4 unidades ou mais. O custo é multiplicado pela quantidade, " +
          "e cada kit pode ter o seu SKU, frete próprio e campos personalizados.",
      },
      {
        alvo: ".kits-section",
        titulo: "Seus kits",
        texto: function (el) {
          var titulo = "Todos os kits ficam dentro do quadro <strong>Kits do Produto</strong>, logo depois dos Preços Extras — " +
            "o título mostra quantos há. ";
          if (!document.querySelector("#kitsGrid .kit-card")) {
            return titulo + "Os kits criados aparecem aqui dentro, cada um com o preço calculado para a quantidade dele.";
          }
          return (
            titulo + "Cada cartão mostra o preço do kit para a quantidade dele, com custo base, frete e a logística " +
            "(peso somado e altura empilhada)."
          );
        },
      },
      {
        // Passo próprio, e não uma frase a mais em "Seus kits": no Mercado
        // Livre o card do kit ficou alto, e numa janela baixa o balão do
        // passo anterior cobria justamente esta área.
        alvo: "#kitsGrid .kit-card .kit-precos",
        titulo: "Preços extras do kit",
        texto: function () {
          return (
            "O preço <strong>mínimo</strong>, <strong>ideal</strong> e <strong>máximo</strong> do kit inteiro, com quanto sobra " +
            "de lucro em cada um — com a quantidade, o frete e as taxas adicionais do próprio kit. Como na unidade, cada " +
            "nível pode ser <strong>Preço</strong> (digitado) ou calculado pela <strong>Margem %</strong> ou pela " +
            "<strong>Margem R$</strong> (aqui, o lucro do kit inteiro)." +
            (ehML()
              ? " No Mercado Livre, cada nível tem o <strong>Premium</strong> e o <strong>Clássico</strong>, " +
                "cada um com a sua comissão."
              : "")
          );
        },
      },
      {
        alvo: ".precos-extras-card",
        titulo: "Preços extras",
        texto: function () {
          return (
            "Um preço <strong>mínimo</strong>, <strong>ideal</strong> e <strong>máximo</strong>, com quanto sobra de lucro em cada um. " +
            "Em cada nível, escolha: <strong>Preço</strong> — você digita o preço de venda; <strong>Margem %</strong> ou " +
            "<strong>Margem R$</strong> — você digita quanto quer ganhar e o sistema calcula o preço com as taxas. " +
            "Não mudam a precificação da ficha." +
            (ehML()
              ? " No Mercado Livre, cada nível tem o <strong>Premium</strong> e o <strong>Clássico</strong>; na margem, " +
                "os dois preços saem da mesma margem, cada um com a sua comissão."
              : "") +
            '<span class="btu-nota">Os kits têm os próprios níveis, no cartão de cada kit, com o valor do kit inteiro.</span>'
          );
        },
      },
      {
        alvo: uniao("#btnAddSecao", "#btnOrdenarSecoes"),
        titulo: "Seções da ficha",
        texto:
          "<strong>Adicionar Seção</strong> cria uma área sua, com campos livres (texto, R$, % ou número). " +
          "<strong>Ordenar Posição</strong> muda a ordem das áreas da ficha.",
      },
      {
        alvo: [".action-bar", "#btnSalvar"],
        titulo: "Salvar ou cancelar",
        texto:
          "<strong>Salvar</strong> e <strong>Cancelar</strong> ficam fixos no canto inferior direito da tela — à vista " +
          "mesmo rolando a ficha. Clique em <strong>Salvar</strong> ao terminar; <strong>Cancelar</strong> volta para a " +
          "lista de produtos." +
          '<span class="btu-nota">Com alterações pendentes, o sistema também salva sozinho a cada 30 segundos.</span>',
      },
      {
        alvo: null,
        icone: "ok",
        titulo: "Pronto para precificar",
        texto: "Preencha o custo, as taxas e a margem: o valor final aparece na hora. Você pode rever este tutorial pela Central de Ajuda.",
      },
    ],
  });
})();

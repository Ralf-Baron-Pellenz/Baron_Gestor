/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — tutorial_empresa.js
   Tutorial dos Dados da Empresa (empresa.html).
   Só descreve os passos; a mecânica está em tutorial_core.js.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";
  if (!window.BapellTutorial) return;

  var uniao = BapellTutorial.util.uniao;

  BapellTutorial.registrar({
    id: "empresa",
    tela: "Dados da Empresa",

    pronto: function () {
      return !!document.querySelector("#empresaCard, #empresaEmptyState");
    },

    passos: [
      {
        alvo: null,
        titulo: "Dados da Empresa",
        texto:
          "O cadastro de cada empresa: identificação, inscrições, endereço, impostos e sócios. " +
          "Estes dados alimentam o Registro de Vendas, o Controle Financeiro, o Processador de Planilhas e o Gestor de Devoluções.",
      },
      {
        alvo: "#empresaEmptyState",
        titulo: "Primeira empresa",
        texto: "Ainda não há empresas. Cadastre a primeira por aqui ou pelo botão <strong>Adicionar Empresa</strong> no menu.",
      },
      {
        alvo: [".sidebar-empresa-box", "#empresaAtivaBox"],
        titulo: "Empresa em edição",
        texto:
          "Você pode cadastrar várias empresas. A seta ao lado do nome troca a empresa que está na tela; " +
          "o menu de três pontos tem a opção de excluí-la.",
      },
      {
        alvo: "#btnAddEmpresa",
        titulo: "Adicionar empresa",
        texto: "Cria um cadastro novo, em branco. Cada empresa guarda os próprios dados, documentos e sócios.",
      },
      {
        alvo: "#btnDocumentos",
        titulo: "Documentos",
        texto:
          "Guarde os arquivos da empresa — contrato social, cartão CNPJ, alvarás… PDF, imagens, planilhas: qualquer arquivo.",
      },
      {
        alvo: "#empresaImgWrapper",
        titulo: "Logo",
        texto:
          "Envie a logo da empresa. A imagem precisa ser <strong>quadrada</strong>. " +
          "Ela aparece ao escolher a empresa nas outras telas e nos orçamentos em PDF.",
      },
      {
        alvo: '#empresaFieldsContainer .field-section-title[data-group="identificacao"]',
        titulo: "Cadastro por seções",
        espaco: 10,
        texto:
          "O formulário é dividido em seções: <strong>Identificação</strong>, Inscrições, Atividades, " +
          "Endereço, Contato, Situação e Sócios. Preencha o que tiver; só um campo é obrigatório." +
          '<span class="btu-nota">O <strong>CNPJ</strong> — inclusive o novo, com letras — e o CPF ou CNPJ dos sócios ' +
          "são formatados enquanto você digita e conferidos ao sair do campo: o que não confere fica em vermelho.</span>",
      },
      {
        alvo: function () {
          var el = document.getElementById("empImpostoPorNota");
          return el ? el.closest(".field-group") : null;
        },
        titulo: "Imposto por nota",
        texto:
          "O único campo <strong>obrigatório</strong>: o percentual de imposto sobre cada nota emitida. " +
          "O Processador de Planilhas usa este número para calcular os impostos das vendas importadas. " +
          "Vazio, ele fica em vermelho até ser preenchido.",
      },
      {
        alvo: "#btnAddSocio",
        titulo: "Sócios e administradores",
        texto: "Informe o quadro societário (QSA). <strong>Adicionar Sócio</strong> inclui mais uma linha.",
      },
      {
        alvo: "#btnConfigCampos",
        titulo: "Configurar campos",
        texto: "Oculte os campos que você não usa ou crie campos novos (ex.: Inscrição SUFRAMA).",
      },
      {
        alvo: "#btnUsuariosSenhas",
        titulo: "Usuários e Senhas",
        texto:
          "Abre a tela dos <strong>usuários</strong> — as pessoas que aparecem no campo <strong>Responsável</strong> " +
          "dos lançamentos, cada uma com o nome e, se quiser, uma senha — e das <strong>senhas de acesso</strong>: " +
          "a do <strong>Administrador</strong>, a do <strong>Colaborador</strong> e a lista de módulos protegidos, " +
          "cada um com um switch para <strong>bloquear</strong> ou <strong>desbloquear</strong>. Todas as senhas pedem " +
          "só um mínimo de 4 caracteres." +
          '<span class="btu-nota">Com a senha do Administrador criada, só ela abre essa tela. Controle Financeiro, ' +
          "Processador de Planilhas e Ações em Massa começam bloqueados. Com a opção de gerar automaticamente, o " +
          "colaborador recebe uma senha nova a cada abertura do Bapell — é lá que você vê qual é.</span>",
      },
      {
        alvo: uniao("#btnOrdenarSecoes", "#btnAddSecao"),
        titulo: "Seções e ordem",
        texto:
          "<strong>Adicionar Seção</strong> cria uma área sua, com campos livres. " +
          "<strong>Ordenar Posição</strong> muda a ordem das seções no formulário.",
      },
      {
        alvo: ["#empresaSaveBar", "#btnSalvarEmpresa"],
        titulo: "Salvar ou cancelar",
        texto:
          "<strong>Salvar</strong> e <strong>Cancelar</strong> ficam fixos no canto inferior direito da tela. Salve ao " +
          "terminar — sem o imposto por nota preenchido, o sistema avisa e não grava. <strong>Cancelar</strong> desfaz o " +
          "que ainda não foi salvo.",
      },
      {
        alvo: null,
        icone: "ok",
        titulo: "Pronto",
        texto: "Com a empresa cadastrada, ela já aparece para escolher no Registro de Vendas, no Financeiro, no Processador de Planilhas e no Gestor de Devoluções.",
      },
    ],
  });
})();

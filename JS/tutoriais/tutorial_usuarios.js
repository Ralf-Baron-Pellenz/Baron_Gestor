/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — tutorial_usuarios.js
   Tutorial da tela Usuários e Senhas (usuarios.html).
   Só descreve os passos; a mecânica está em tutorial_core.js.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";
  if (!window.BapellTutorial) return;

  BapellTutorial.registrar({
    id: "usuarios",
    tela: "Usuários e Senhas",

    // A lista e as senhas são montadas depois que a tela é liberada.
    pronto: function () {
      return !!document.querySelector("#usrGerenciador .bsn-corpo");
    },

    passos: [
      {
        alvo: null,
        titulo: "Usuários e Senhas",
        texto:
          "Aqui ficam as pessoas que fazem os lançamentos e as senhas que protegem os módulos. " +
          "Só o <strong>Administrador</strong> abre esta tela quando a senha dele está criada.",
      },
      {
        alvo: ".usr-linha--master",
        titulo: "O Master",
        texto:
          "O primeiro da lista é o <strong>Master</strong>, o administrador principal. Em <strong>Editar</strong>, " +
          "troque o nome que aparece — por exemplo, <strong>Carlos</strong> no lugar de <strong>Administrador</strong>. " +
          "Ele continua sendo o administrador: a senha dele é a do Administrador e ele não pode ser excluído." +
          '<span class="btu-nota">O nome aparece no campo <strong>Responsável</strong> e na janela ' +
          "<strong>Usuário e senha</strong> dos botões protegidos.</span>",
      },
      {
        alvo: "#usrNovo",
        titulo: "Novo usuário",
        texto:
          "Cadastre cada pessoa com o <strong>nome</strong> e, se quiser, uma <strong>senha</strong> " +
          "(mínimo de 4 caracteres).",
      },
      {
        alvo: "#usrCardUsuarios",
        titulo: "Os responsáveis",
        texto:
          "Os usuários aparecem no campo <strong>Responsável</strong> do Registro de Vendas, do Controle Financeiro, " +
          "das Notas Fiscais, das Ações em Massa, do Processador de Planilhas e do Gestor de Devoluções. Quem tem senha só é aceito " +
          "como responsável digitando a própria senha — o Master, com a senha do Administrador.",
      },
      {
        alvo: "#usrCardSenhas",
        titulo: "Senhas de acesso",
        texto:
          "A senha do <strong>Administrador</strong> e a do <strong>Colaborador</strong> abrem os módulos protegidos. " +
          "Escolha aqui quais módulos pedem senha ao abrir. A senha de um usuário não abre módulos." +
          '<span class="btu-nota">Na linha <strong>Senha atual</strong> de cada uma: <strong>Mostrar</strong>, ' +
          "<strong>Copiar</strong> e <strong>Remover</strong>.</span>",
      },
      {
        alvo: "#usrGerenciador .bsn-perguntas",
        titulo: "Perguntas de segurança",
        texto:
          "Junto da senha do Administrador, responda pelo menos <strong>3 das 5 perguntas</strong>. Se um dia a senha " +
          "for esquecida, a tela de senha tem <strong>Esqueci a senha do Administrador</strong>: escolha uma das " +
          "perguntas, responda e crie uma senha nova — tudo neste computador, sem internet." +
          '<span class="btu-nota">Maiúsculas, minúsculas e acentos não fazem diferença na resposta.</span>',
      },
      {
        alvo: "#usrCardBotoes",
        titulo: "Senha nos botões",
        texto:
          "Escolha, tela a tela, os botões que pedem <strong>usuário e senha</strong> antes de agir — o Salvar dos " +
          "Produtos, o Excluir de um lançamento... Ligue a chave e marque os botões. Quem clicar escolhe o próprio " +
          "nome e digita a própria senha (os usuários com senha e o Master).",
      },
      {
        alvo: "#bsnBarraSalvar",
        titulo: "Salvar ou cancelar",
        texto:
          "As senhas, os módulos e os botões são salvos juntos, pelo <strong>Salvar</strong> fixo no canto inferior " +
          "direito. <strong>Cancelar</strong> volta ao que estava salvo.",
      },
      {
        alvo: null,
        icone: "ok",
        titulo: "Pronto",
        texto: "O Master já pode ser escolhido como responsável; cadastre as outras pessoas que lançam. Você pode rever " +
          "este tutorial pela Central de Ajuda.",
      },
    ],
  });
})();

/* ═══════════════════════════════════════════════════════════════════
   Bapell Gestor Pro — tutorial_calculos.js
   Tutorial da Central de Cálculos (calculos.html) e o guia "Como usar"
   de cada calculadora.

   O guia de cada calculadora é montado na hora, a partir da própria
   definição dela (nome, descrição, campos e "como é calculado"), lida por
   CentralCalculos.lista(). Assim ele vale para as 140+ calculadoras sem
   um texto escrito à mão para cada uma — e acompanha sozinho as que
   forem criadas depois.

   O botão "Como usar esta calculadora" é o único elemento que este
   arquivo acrescenta à tela. Ele fica abaixo da descrição, é recolocado
   quando a calculadora aberta muda e só inicia o guia: não calcula, não
   preenche e não altera nada da calculadora.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";
  if (!window.BapellTutorial) return;

  var esc = BapellTutorial.util.esc;

  function listaDeCalculadoras() {
    try {
      return window.CentralCalculos && typeof window.CentralCalculos.lista === "function"
        ? window.CentralCalculos.lista()
        : [];
    } catch (e) {
      return [];
    }
  }

  // A calculadora aberta no centro: pelo item ativo do menu e, se a busca
  // o escondeu, pelo título do cartão.
  function calculadoraAberta() {
    var lista = listaDeCalculadoras();
    var item = document.querySelector("#calcMenu .calc-menu-item.ativo[data-calc-id]");
    var id = item ? item.getAttribute("data-calc-id") : "";
    var i;
    if (id) {
      for (i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    }
    var titulo = document.querySelector("#calcCentro .calc-card-titulo");
    var nome = titulo ? String(titulo.textContent || "").trim() : "";
    if (nome) {
      for (i = 0; i < lista.length; i++) if (lista[i].nome === nome) return lista[i];
    }
    return null;
  }

  var DICAS = {
    money: "Valor em reais. Digite só os números: os centavos entram sozinhos (1500 vira 15,00).",
    percent: "Percentual. Digite o número, com vírgula se precisar (ex.: 12,5).",
    integer: "Número inteiro, sem casas decimais.",
    number: "Número. Use vírgula para as casas decimais.",
    date: "Data. Escolha no calendário ou digite dia, mês e ano.",
  };

  var TIPOS = {
    money: "valor em R$",
    percent: "percentual",
    integer: "número inteiro",
    number: "número",
    date: "data",
  };

  function campoDaTela(idCampo) {
    return function () {
      var el = document.getElementById(idCampo);
      return el ? el.closest(".calc-campo") || el : null;
    };
  }

  // ── Guia "Como usar" da calculadora aberta ──
  function guiaDaCalculadora() {
    var c = calculadoraAberta();
    if (!c || BapellTutorial.emAndamento()) return;

    var passos = [];
    passos.push({
      alvo: "#calcCentro .calc-card-head",
      titulo: c.nome,
      texto:
        esc(c.desc || "") +
        '<span class="btu-nota">Categoria: <strong>' + esc(c.cat || "Outros") + "</strong></span>",
    });

    if (c.aviso) {
      passos.push({
        alvo: "#calcCentro .calc-aviso",
        titulo: "Antes de calcular",
        texto:
          "As alíquotas mudam conforme o estado, o produto (NCM) e o regime da empresa. " +
          "Confira a do seu caso na SEFAZ do seu estado e com o seu contador: o resultado é uma estimativa.",
      });
    }

    var campos = Array.isArray(c.campos) ? c.campos : [];
    if (campos.length && campos.length <= 5) {
      campos.forEach(function (f) {
        passos.push({
          alvo: campoDaTela(f.id),
          titulo: f.label || "Campo",
          texto: DICAS[f.tipo] || DICAS.number,
        });
      });
    } else if (campos.length) {
      passos.push({
        alvo: "#calcCentro .calc-campos",
        titulo: "Campos",
        texto:
          "Preencha os " + campos.length + " campos:" +
          "<ul>" +
          campos
            .map(function (f) {
              return "<li><strong>" + esc(f.label) + "</strong> — " + (TIPOS[f.tipo] || TIPOS.number) + "</li>";
            })
            .join("") +
          "</ul>" +
          '<span class="btu-nota">Nos campos em R$, digite só os números: os centavos entram sozinhos.</span>',
      });
    }

    passos.push({
      alvo: "#calcCentro .calc-acoes-calc",
      titulo: "Calcular",
      texto:
        "Clique em <strong>Calcular</strong> ou tecle <kbd>Enter</kbd> em qualquer campo. O resultado aparece logo abaixo, " +
        "com opções para copiar, salvar nos Cálculos salvos e imprimir. <strong>Limpar</strong> apaga os campos.",
    });

    if (c.explica) {
      passos.push({
        alvo: "#calcCentro .calc-explica",
        titulo: "Como é calculado",
        texto: esc(c.explica),
      });
    }

    BapellTutorial.iniciarAvulso({
      id: "calculos-guia",
      tela: "Como usar",
      icone: "calculos",
      passos: passos,
    });
  }

  // ── Botão "Como usar esta calculadora" ──
  function colocarBotao() {
    var desc = document.querySelector("#calcCentro .calc-card-head .calc-card-desc");
    if (!desc || !desc.parentNode || desc.parentNode.querySelector(".btu-como-usar")) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btu-como-usar";
    b.innerHTML = BapellTutorial.util.icone("ajuda", 14) + "Como usar esta calculadora";
    b.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      guiaDaCalculadora();
    });
    desc.parentNode.insertBefore(b, desc.nextSibling);
  }

  var centro = document.getElementById("calcCentro");
  if (centro && typeof MutationObserver === "function") {
    // A Central troca todo o conteúdo do centro ao abrir outra calculadora.
    new MutationObserver(colocarBotao).observe(centro, { childList: true });
  }
  colocarBotao();

  // ── Tutorial da tela ──
  BapellTutorial.registrar({
    id: "calculos",
    tela: "Central de Cálculos",

    // A Central monta o menu e abre a primeira calculadora no carregamento.
    pronto: function () {
      return !!document.querySelector("#calcCentro .calc-card .btu-como-usar");
    },

    passos: [
      {
        alvo: null,
        titulo: "Central de Cálculos",
        texto: function () {
          var n = listaDeCalculadoras().length;
          return (
            (n ? "<strong>" + n + " calculadoras</strong>" : "Calculadoras") +
            " prontas para o dia a dia: preço e margem, impostos, frete, cartão, financiamentos, investimentos, " +
            "conversões, RH e datas. Veja como encontrar e usar cada uma."
          );
        },
      },
      {
        alvo: [".calc-menu-busca-wrap", "#calcBusca"],
        titulo: "Busca",
        texto:
          "Digite o que precisa calcular — um nome, um assunto ou uma sigla, como ICMS ou DIFAL. A lista filtra na hora.",
      },
      {
        alvo: function () {
          var grupos = document.querySelectorAll("#calcMenu .calc-menu-grupo");
          for (var i = 0; i < grupos.length; i++) {
            if (!grupos[i].querySelector(".calc-grupo-ico-fav") && BapellTutorial.util.visivel(grupos[i])) return grupos[i];
          }
          return null;
        },
        titulo: "Categorias",
        texto: "As calculadoras ficam agrupadas por assunto. Clique em uma para abri-la no centro da tela.",
      },
      {
        alvo: "#calcFavGrande",
        titulo: "Favoritos",
        espaco: 6,
        texto:
          "Clique na estrela para favoritar. Os favoritos ganham um grupo próprio no alto do menu — " +
          "lá, a estrela aparece ao passar o mouse sobre cada calculadora.",
      },
      {
        alvo: "#calcCentro .calc-card-head",
        titulo: "A calculadora aberta",
        texto: "Categoria, nome e para que ela serve.",
      },
      {
        alvo: "#calcCentro .calc-campos",
        titulo: "Campos",
        texto:
          "Preencha os valores pedidos. Nos campos em <strong>R$</strong>, digite só os números — os centavos entram sozinhos. " +
          "Percentuais e datas têm o próprio formato.",
      },
      {
        alvo: "#calcCentro .calc-acoes-calc",
        titulo: "Calcular",
        texto:
          "Clique em <strong>Calcular</strong> ou tecle <kbd>Enter</kbd>. O resultado aparece logo abaixo, " +
          "com opções para <strong>copiar</strong>, <strong>salvar</strong> e <strong>imprimir</strong>.",
      },
      {
        alvo: "#calcCentro .calc-explica",
        titulo: "Como é calculado",
        texto: "Toda calculadora mostra a fórmula que usa, em palavras — para você conferir e confiar no número.",
      },
      {
        alvo: "#calcCentro .btu-como-usar",
        titulo: "Como usar cada calculadora",
        texto:
          "Em qualquer calculadora, este botão abre um guia rápido dela: para que serve, o que preencher em cada campo " +
          "e como o resultado é calculado.",
      },
      {
        alvo: ".calc-hist-col",
        seAusente: "centro",
        titulo: "Cálculos salvos",
        texto: function (el) {
          var base =
            "Os cálculos que você salvar ficam no histórico, com nome, descrição e tags. " +
            "Busque, duplique, exclua ou clique num cartão para reabrir a calculadora.";
          return el
            ? base
            : base + '<span class="btu-nota">Nesta largura de janela o histórico fica escondido. ' +
                "Aumente a janela para vê-lo à direita.</span>";
        },
      },
      {
        alvo: null,
        icone: "ok",
        titulo: "Pronto",
        texto: "Busque a calculadora, preencha e calcule. Na dúvida, use o botão Como usar da própria calculadora.",
      },
    ],
  });
})();

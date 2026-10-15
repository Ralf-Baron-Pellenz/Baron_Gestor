/* ═══════════════════════════════════════════════════════════════════
   PAGINAÇÃO DA LISTA DE PRODUTOS — 30 POR PÁGINA

   Arquivo SEPARADO de propósito: ele funciona por cima do plataforma.js
   que já existe, sem precisar alterar uma linha dele. Assim nenhuma
   mudança sua se perde.

   Para ligar, uma linha no plataforma.html, DEPOIS do plataforma.js:

       <script src="JS/paginacao.js"></script>

   ── COMO FUNCIONA ──────────────────────────────────────────────────
   A lista continua sendo montada pelo plataforma.js, do jeito de
   sempre. Esta paginação só decide quais linhas ficam visíveis e
   desenha a navegação no rodapé.

   Um observador percebe quando a lista é remontada — busca, filtro,
   exclusão, clonagem — e reaplica sozinho. Nada precisa ser chamado.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const POR_PAGINA = 30;

  let paginaAtual = 1;
  let assinaturaAnterior = "";
  let aplicando = false;

  /** O container onde as linhas de produto vivem. */
  function acharLista() {
    // O #productList é o container da tela de produtos. Os outros nomes
    // são tentativas, caso a estrutura tenha outro nome.
    const porId = document.getElementById("productList");
    if (porId) return porId;
    const linha = document.querySelector(".product-row");
    if (linha && linha.parentElement) return linha.parentElement;
    return document.querySelector(".product-list-body, .product-list");
  }

  function linhasDe(lista) {
    if (!lista) return [];
    return Array.from(lista.children).filter(function (el) {
      return el.classList && el.classList.contains("product-row");
    });
  }

  /**
   * Identidade do conjunto atual de linhas. Muda quando a busca, o
   * filtro ou uma exclusão alteram QUAIS produtos estão na lista — e aí
   * a paginação volta para a primeira página, que é o esperado. Uma
   * simples remontagem das MESMAS linhas mantém a página.
   */
  function assinatura(linhas) {
    return linhas.length + "|" + linhas.map(function (l) {
      return l.dataset.id || l.dataset.productId || (l.textContent || "").slice(0, 24);
    }).join(",");
  }

  function totalPaginas(qtd) {
    return Math.max(1, Math.ceil(qtd / POR_PAGINA));
  }

  function aplicar() {
    if (aplicando) return;
    const lista = acharLista();
    if (!lista) return;

    aplicando = true;
    try {
      const linhas = linhasDe(lista);
      const assin = assinatura(linhas);
      if (assin !== assinaturaAnterior) {
        // Conjunto diferente: recomeça da primeira página.
        assinaturaAnterior = assin;
        paginaAtual = 1;
      }

      const paginas = totalPaginas(linhas.length);
      if (paginaAtual > paginas) paginaAtual = paginas;

      const primeiro = (paginaAtual - 1) * POR_PAGINA;
      const ultimo = primeiro + POR_PAGINA;

      linhas.forEach(function (linha, i) {
        const dentro = i >= primeiro && i < ultimo;
        // Guarda o display original uma única vez, para não assumir que
        // toda linha usa "flex" ou "grid".
        if (linha.dataset.pgDisplay === undefined) {
          linha.dataset.pgDisplay = linha.style.display || "";
        }
        linha.style.display = dentro ? linha.dataset.pgDisplay : "none";
      });

      desenharRodape(lista, linhas.length, paginas, primeiro);
    } finally {
      aplicando = false;
    }
  }

  function desenharRodape(lista, total, paginas, primeiro) {
    let rodape = document.getElementById("pgRodape");

    // Com uma página só não há o que navegar: o rodapé some.
    if (paginas <= 1) {
      if (rodape) rodape.remove();
      return;
    }

    if (!rodape) {
      rodape = document.createElement("div");
      rodape.id = "pgRodape";
      rodape.className = "pg-rodape";
      // Fora da lista: assim o observador da lista não reage a ele.
      lista.parentElement.insertBefore(rodape, lista.nextSibling);
    }

    const de = primeiro + 1;
    const ate = Math.min(primeiro + POR_PAGINA, total);

    const html =
      '<span class="pg-info">Mostrando <strong>' + de + "–" + ate +
        "</strong> de <strong>" + total + "</strong> produtos</span>" +
      '<div class="pg-botoes">' +
        botao("‹", "Página anterior", paginaAtual - 1, paginaAtual === 1) +
        numeros(paginas) +
        botao("›", "Próxima página", paginaAtual + 1, paginaAtual === paginas) +
      "</div>";

    // Só reescreve se algo mudou de verdade: uma reescrita idêntica
    // gera mutações à toa e é o que alimentava o laço.
    if (rodape.dataset.assinatura === html) return;
    rodape.dataset.assinatura = html;
    rodape.innerHTML = html;

    rodape.querySelectorAll("[data-pagina]").forEach(function (b) {
      b.addEventListener("click", function () {
        const n = parseInt(b.dataset.pagina, 10);
        if (!n || n === paginaAtual || n < 1 || n > paginas) return;
        paginaAtual = n;
        aplicar();
        // Volta ao topo da lista: sem isto, ao trocar de página a pessoa
        // continua na altura de onde estava e parece que nada mudou.
        const topo = lista.getBoundingClientRect().top + window.scrollY - 90;
        window.scrollTo({ top: Math.max(0, topo), behavior: "smooth" });
      });
    });
  }

  function botao(texto, titulo, pagina, desabilitado) {
    return '<button type="button" class="pg-btn pg-seta" title="' + titulo + '"' +
      (desabilitado ? " disabled" : ' data-pagina="' + pagina + '"') + ">" + texto + "</button>";
  }

  /**
   * Os números das páginas. Com muitas páginas, mostra as vizinhas da
   * atual e usa reticências — uma lista com 40 números seria pior que
   * não ter navegação.
   */
  function numeros(paginas) {
    const mostrar = [];
    const perto = function (n) { return Math.abs(n - paginaAtual) <= 1; };
    for (let n = 1; n <= paginas; n++) {
      if (n === 1 || n === paginas || perto(n)) mostrar.push(n);
      else if (mostrar[mostrar.length - 1] !== "…") mostrar.push("…");
    }
    return mostrar.map(function (n) {
      if (n === "…") return '<span class="pg-reticencias">…</span>';
      return '<button type="button" class="pg-btn' + (n === paginaAtual ? " pg-atual" : "") + '"' +
        (n === paginaAtual ? ' aria-current="page"' : "") +
        ' data-pagina="' + n + '">' + n + "</button>";
    }).join("");
  }

  /* ── Diagnóstico ────────────────────────────────────────────────
     Para conferir se o arquivo está sendo carregado, abra o Console
     (Ctrl+Shift+I) na tela de produtos. Se estiver, aparece uma linha
     "[Paginação] ativa". Se não aparecer NADA, o <script> não foi
     adicionado ao plataforma.html ou o caminho está errado.

     Também dá para digitar no Console:  __paginacao()  */
  window.__paginacao = function () {
    const lista = acharLista();
    const linhas = linhasDe(lista);
    const info = {
      arquivoCarregado: true,
      listaEncontrada: !!lista,
      idDaLista: lista ? (lista.id || lista.className) : null,
      linhasEncontradas: linhas.length,
      porPagina: POR_PAGINA,
      paginaAtual: paginaAtual,
      rodapeNaTela: !!document.getElementById("pgRodape"),
    };
    console.table(info);
    return info;
  };

  function iniciar() {
    aplicar();

    const lista = acharLista();
    const qtd = linhasDe(lista).length;
    if (!lista) {
      console.warn(
        "[Paginação] O arquivo carregou, mas não achei a lista de produtos. " +
        "Procurei por #productList e por linhas com a classe .product-row."
      );
    } else {
      console.info(
        "[Paginação] ativa — " + qtd + " produto(s), " + POR_PAGINA + " por página." +
        (qtd <= POR_PAGINA ? " Com " + POR_PAGINA + " ou menos, o rodapé não aparece." : "")
      );
    }

    // A lista é remontada em muitas situações (busca, filtro, exclusão).
    // O observador reaplica sozinho, sem depender de nenhuma chamada do
    // plataforma.js.
    const alvo = document.body;
    const obs = new MutationObserver(function (mutacoes) {
      if (aplicando) return;

      // ── POR QUE ESTE FILTRO EXISTE ────────────────────────────────
      // O observador olhava o documento inteiro. Ao trocar de página,
      // esta própria paginação reescreve o rodapé — e essa reescrita
      // era vista como "a tela mudou", disparando tudo de novo, que
      // reescrevia o rodapé outra vez. O laço não parava e a tela
      // travava sem sair da página.
      //
      // A regra agora é simples: só interessa mexida nas LINHAS DE
      // PRODUTO. Mudança dentro do rodapé, ou em qualquer outra parte
      // da tela, é ignorada.
      const interessa = mutacoes.some(function (m) {
        if (m.target && m.target.closest && m.target.closest("#pgRodape")) return false;
        const mexeuEmLinha = function (lista) {
          return Array.prototype.some.call(lista || [], function (n) {
            return n.nodeType === 1 &&
              (n.classList.contains("product-row") || n.querySelector && n.querySelector(".product-row"));
          });
        };
        return mexeuEmLinha(m.addedNodes) || mexeuEmLinha(m.removedNodes);
      });
      if (!interessa) return;

      clearTimeout(obs._t);
      obs._t = setTimeout(aplicar, 60);
    });
    obs.observe(alvo, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(iniciar, 300); });
  } else {
    setTimeout(iniciar, 300);
  }
})();

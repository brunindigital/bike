/* Hidrata as telas do funil com o produto realmente comprado (Panela, Pote, etc.) */
(function () {
  function read() {
    var p = null;
    try { p = JSON.parse(localStorage.getItem('produtoComprado') || 'null'); } catch (e) {}
    if (!p) {
      try { p = JSON.parse(window.top.localStorage.getItem('produtoComprado') || 'null'); } catch (e) {}
    }
    if (!p || !p.nome) return null;
    p.qtd = parseInt(p.qtd || 1, 10) || 1;
    if (!p.img) p.img = /pote/i.test(p.nome) ? '/images/f2/potes-1.webp' : '/images/carousel-1-CubMVA8O.webp';
    return p;
  }

  function apply() {
    var p = read();
    if (!p) return;
    var nome = p.nome + (p.cor ? (' · ' + p.cor) : '');
    document.querySelectorAll('[data-lv-prod-name]').forEach(function (el) { el.textContent = nome; });
    document.querySelectorAll('[data-lv-prod-img]').forEach(function (el) { if (el.src !== p.img) el.src = p.img; });
    document.querySelectorAll('[data-lv-prod-qtd]').forEach(function (el) { el.textContent = String(p.qtd); });
    document.querySelectorAll('[data-lv-prod-sub]').forEach(function (el) {
      el.textContent = 'Pedido confirmado · ' + p.qtd + ' un · Aguardando liberação';
    });
  }

  window.lvProdutoComprado = read;
  window.lvHidratarProduto = apply;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
  setTimeout(apply, 400);
})();

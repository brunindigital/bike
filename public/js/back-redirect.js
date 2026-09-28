(function () {
  if (window.__lvBackRedirectInstalled) return;
  window.__lvBackRedirectInstalled = true;

  // Back redirect precisa controlar o histórico da janela principal.
  if (window.self !== window.top) return;

  function normalize(p) {
    p = (p || '').split('?')[0].split('#')[0];
    p = p.replace(/\.html$/i, '').replace(/\/$/, '');
    if (p === '') p = '/';
    return p;
  }

  var TARGETS = {
    '/index': '/oferta',
    '/loja': '/oferta',
    '/pagamento': '/oferta',
    '/oferta': '/',
    '/upsell1': '/pagamento',
    '/upsell2': '/upsell1',
    '/upsell3': '/upsell2',
    '/upsell4': '/upsell3',
    '/obrigado': '/upsell4'
  };

  // Páginas da home: o voltar abre popup de desconto em vez de redirecionar.
  var HOME_PATHS = { '/': true, '/site': true };

  function targetFor(path) {
    return TARGETS[normalize(path)] || null;
  }

  function redirect(to) {
    var url;
    try {
      url = new URL(to, location.href);
      url.search = location.search;
      url.hash = location.hash;
    } catch (e) {
      url = to + location.search + location.hash;
    }
    location.href = url.toString();
  }

  // ---------- Popup de desconto (somente na home) ----------
  var popupShown = false;

  function closePopup() {
    var ov = document.getElementById('lv-back-promo');
    if (ov) ov.remove();
    document.documentElement.style.overflow = '';
  }

  function showPromoPopup() {
    if (popupShown) return;
    popupShown = true;

    var css = document.createElement('style');
    css.textContent =
      '#lv-back-promo{position:fixed;inset:0;z-index:99999;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.62);backdrop-filter:blur(2px);animation:lvbpFade .22s ease-out;font-family:Inter,system-ui,-apple-system,sans-serif}' +
      '@keyframes lvbpFade{from{opacity:0}to{opacity:1}}' +
      '@keyframes lvbpUp{from{transform:translateY(46px);opacity:0}to{transform:none;opacity:1}}' +
      '#lv-back-promo .card{width:100%;max-width:440px;background:#fff;border-radius:22px 22px 0 0;padding:22px 18px calc(20px + env(safe-area-inset-bottom));text-align:center;animation:lvbpUp .3s cubic-bezier(.2,.8,.2,1);position:relative}' +
      '#lv-back-promo .x{position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:50%;border:0;background:#f1f2f4;color:#555;font-size:16px;cursor:pointer;line-height:1}' +
      '#lv-back-promo .tag{display:inline-block;background:#fe2c55;color:#fff;font-size:11px;font-weight:800;letter-spacing:.06em;padding:6px 12px;border-radius:999px;margin-bottom:10px}' +
      '#lv-back-promo h2{margin:0 0 4px;font-size:20px;font-weight:800;color:#161823}' +
      '#lv-back-promo p.sub{margin:0 0 14px;font-size:13px;color:#6b7280}' +
      '#lv-back-promo img.prod{width:150px;height:150px;object-fit:contain;margin:0 auto 8px;display:block}' +
      '#lv-back-promo .old{font-size:14px;color:#9aa1ad;text-decoration:line-through}' +
      '#lv-back-promo .new{font-size:34px;font-weight:800;color:#fe2c55;letter-spacing:-.5px;margin:2px 0 2px}' +
      '#lv-back-promo .off{font-size:12px;font-weight:700;color:#0ea5a4;margin-bottom:14px}' +
      '#lv-back-promo .cta{display:block;width:100%;border:0;border-radius:999px;background:#fe2c55;color:#fff;font-size:16px;font-weight:800;padding:15px;cursor:pointer;box-shadow:0 10px 22px rgba(254,44,85,.32);font-family:inherit}' +
      '#lv-back-promo .cta:active{transform:scale(.98)}' +
      '#lv-back-promo .no{display:inline-block;margin-top:12px;background:none;border:0;font-size:12.5px;color:#9aa1ad;text-decoration:underline;cursor:pointer;font-family:inherit}';
    document.head.appendChild(css);

    var ov = document.createElement('div');
    ov.id = 'lv-back-promo';
    ov.innerHTML =
      '<div class="card" role="dialog" aria-modal="true" aria-label="Oferta de desconto">' +
      '<button class="x" type="button" aria-label="Fechar">✕</button>' +
      '<span class="tag">ÚLTIMOS LOTES</span>' +
      '<h2>Espera! Não vá embora...</h2>' +
      '<p class="sub">Restam poucas unidades e liberamos um desconto exclusivo só agora:</p>' +
      '<img class="prod" src="/images/f2/potes-1.webp" alt="Kit 10 Potes Herméticos">' +
      '<div class="old">De R$ 474,90</div>' +
      '<div class="new">Por R$ 27,99</div>' +
      '<div class="off">44% OFF · só nesta página · enquanto durar o estoque</div>' +
      '<button class="cta" type="button">APROVEITAR DESCONTO</button>' +
      '<button class="no" type="button">Não, obrigado. Prefiro pagar o valor cheio.</button>' +
      '</div>';
    document.body.appendChild(ov);
    document.documentElement.style.overflow = 'hidden';

    ov.addEventListener('click', function (e) {
      if (e.target === ov) closePopup();
    });
    ov.querySelector('.x').addEventListener('click', closePopup);
    ov.querySelector('.no').addEventListener('click', function () {
      closePopup();
      redirect('/oferta');
    });
    ov.querySelector('.cta').addEventListener('click', function () {
      try {
        localStorage.setItem('precoUnit', '27.99');
        localStorage.setItem('corSelecionada', 'Kit 10 Potes Herméticos 640ml (Promoção Últimos Lotes)');
        localStorage.setItem('corImagem', '/images/f2/potes-1.webp');
        localStorage.setItem('qtdSelecionada', '1');
      } catch (e) {}
      try { if (typeof fbq === 'function') fbq('track', 'InitiateCheckout', { value: 27.99, currency: 'BRL' }); } catch (e) {}
      redirect('/pagamento');
    });
  }

  var redirected = false;

  function onBack() {
    if (redirected) return;
    var path = normalize(location.pathname);
    if (HOME_PATHS[path]) {
      // Popup pode ser reaberto em um próximo "voltar" caso a pessoa feche.
      showPromoPopup();
      try { history.pushState({ __lvBackGuard: true }, '', location.href); } catch (e) {}
      return;
    }
    var to = targetFor(path);
    if (to && to !== path) {
      redirected = true;
      redirect(to);
    }
  }

  window.addEventListener('popstate', function () {
    // Pequeno delay para evitar conflito com routers que cancelam a navegação.
    setTimeout(onBack, 0);
  });

  // Insere uma entrada fantasma no histórico para que, mesmo que a página seja
  // a primeira do tab, o primeiro "voltar" dispare popstate dentro do site.
  try {
    history.pushState({ __lvBackGuard: true }, '', location.href);
  } catch (e) {}
})();

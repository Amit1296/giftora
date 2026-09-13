(() => {
  const GA_ID = "G-8S08QXQ6PV";

  function enabled() {
    return !!(window.GiftoraCookies && window.GiftoraCookies.accepted());
  }

  function loadGtag() {
    if (window.giftoraGaLoaded) return;
    window.giftoraGaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, { send_page_view: true });
    const sc = document.createElement("script");
    sc.async = true;
    sc.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(sc);
  }

  function pushEvent(name, params) {
    if (window.gtag && window.dataLayer) {
      try {
        window.gtag("event", name, params || {});
      } catch (e) {}
    }
  }

  function productInfo(id) {
    const list = window.GIFT_PRODUCTS || [];
    const p = list.find((x) => x.id === Number(id));
    return p ? { name: p.name, price: p.price || 0 } : { name: "Item #" + id, price: 0 };
  }

  function hookGiftora() {
    if (!window.Giftora) {
      setTimeout(hookGiftora, 300);
      return;
    }
    const map = {
      addToCart: { name: "add_to_cart", cart: true },
      addToCartQty: { name: "add_to_cart", cart: true },
      openCart: { name: "view_cart", cart: false },
    };
    for (const [fn, cfg] of Object.entries(map)) {
      const orig = window.Giftora[fn];
      if (!orig || orig.__giftoraGa) continue;
      const wrapped = function () {
        const result = orig.apply(this, arguments);
        if (cfg.cart) {
          const info = productInfo(arguments[0]);
          const qty = arguments[1] || 1;
          pushEvent(cfg.name, {
            currency: "INR",
            value: Number(info.price) * qty,
            items: [{ item_id: String(arguments[0]), item_name: info.name, price: info.price, quantity: qty }],
          });
        } else {
          pushEvent(cfg.name, {});
        }
        return result;
      };
      wrapped.__giftoraGa = true;
      window.Giftora[fn] = wrapped;
    }
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("#checkoutBtn")) pushEvent("begin_checkout", {});
  });

  const productMatch = location.pathname.match(/\/products\/([^/]+)\.html/);
  if (productMatch) {
    pushEvent("view_item", {
      currency: "INR",
      items: [{ item_id: location.pathname, item_name: decodeURIComponent(productMatch[1]).replace(/-/g, " ") }],
    });
  }

  if (enabled()) loadGtag();
  if (window.GiftoraCookies) {
    window.GiftoraCookies.onAccept(() => {
      loadGtag();
      hookGiftora();
    });
  }
  hookGiftora();
})();
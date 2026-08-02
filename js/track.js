(() => {
  const VID_KEY = "giftora_vid";
  const API = "/api/track";

  let vid = null;
  try { vid = localStorage.getItem(VID_KEY); } catch {}
  if (!vid) {
    vid = "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem(VID_KEY, vid); } catch {}
  }

  const queue = [];
  const pageStart = Date.now();
  const pagePath = location.pathname;
  const pageTitle = document.title;

  function uaMeta() {
    const ua = navigator.userAgent;
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    let browser = "Other";
    if (/Edg\//i.test(ua)) browser = "Edge";
    else if (/OPR|Opera/i.test(ua)) browser = "Opera";
    else if (/Chrome\//i.test(ua)) browser = "Chrome";
    else if (/Firefox\//i.test(ua)) browser = "Firefox";
    else if (/Safari\//i.test(ua)) browser = "Safari";
    let os = "Other";
    if (/Windows/i.test(ua)) os = "Windows";
    else if (/Android/i.test(ua)) os = "Android";
    else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
    else if (/Mac/i.test(ua)) os = "macOS";
    else if (/Linux/i.test(ua)) os = "Linux";
    return {
      device: mobile ? "Mobile" : "Desktop",
      browser,
      os,
      referrer: document.referrer || "",
    };
  }

  function enabled() {
    return !!(window.GiftoraCookies && window.GiftoraCookies.accepted());
  }

  function push(type, extra) {
    queue.push({ type, path: pagePath, title: pageTitle, ...(extra || {}) });
    if (queue.length >= 10) flush();
  }

  function flush() {
    if (!queue.length || !enabled()) return;
    const events = queue.splice(0, queue.length);
    const body = JSON.stringify({ vid, meta: uaMeta(), events });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(API, new Blob([body], { type: "application/json" }));
    } else {
      fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  }

  function productInfo(id) {
    const list = window.GIFT_PRODUCTS || [];
    const p = list.find((x) => x.id === Number(id));
    return p ? { product: p.name, price: p.price || 0 } : { product: "Item #" + id, price: 0 };
  }

  function hookGiftora() {
    if (!window.Giftora) {
      setTimeout(hookGiftora, 300);
      return;
    }
    ["addToCart", "addToCartQty", "openCart"].forEach((name) => {
      const orig = window.Giftora[name];
      if (!orig || orig.__giftoraTrack) return;
      const isCart = name !== "openCart";
      const wrapped = function () {
        const result = orig.apply(this, arguments);
        if (isCart) {
          const info = productInfo(arguments[0]);
          push("cart_add", { product: info.product, price: info.price, qty: arguments[1] || 1 });
        } else {
          push("cart_open", {});
        }
        return result;
      };
      wrapped.__giftoraTrack = true;
      window.Giftora[name] = wrapped;
    });
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("#checkoutBtn")) push("checkout_start", {});
  });

  window.addEventListener("pagehide", () => {
    push("exit", { duration: Math.round((Date.now() - pageStart) / 1000) });
    flush();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  const productMatch = pagePath.match(/\/products\/([^/]+)\.html/);
  if (productMatch) {
    push("product_view", { name: decodeURIComponent(productMatch[1]).replace(/-/g, " ") });
  }
  push("pageview", {});

  hookGiftora();
  if (window.GiftoraCookies) {
    window.GiftoraCookies.onAccept(() => { hookGiftora(); flush(); });
  }
  if (enabled()) flush();
})();

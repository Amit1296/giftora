(function () {
  "use strict";
  var NUMBER = "917088084046";
  var BASE = "https://wa.me/" + NUMBER + "?text=";

  var CSS = [
    ".wa-float{position:fixed;left:22px;bottom:22px;z-index:9998;display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:#25d366;box-shadow:0 6px 18px rgba(0,0,0,.25);transition:transform .2s ease;text-decoration:none}",
    ".wa-float:hover{transform:scale(1.08)}",
    ".wa-float svg{display:block}",
    ".wa-order-btn{margin-left:10px;background:#25d366 !important;border-color:#25d366 !important;color:#fff !important}",
    "@media (max-width:640px){.wa-float{width:52px;height:52px;left:14px;bottom:14px}}"
  ].join("");

  var SVG = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="#fff" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  function injectCSS() {
    var s = document.createElement("style");
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function pageProduct() {
    var nameEl = document.querySelector("h1");
    var name = nameEl ? nameEl.textContent.trim() : (document.title || "").replace(/\s*[|\u2013\u2014-].*$/, "").trim();
    var price = "";
    var priceEl = document.getElementById("detailPrice");
    if (priceEl) price = priceEl.textContent.trim();
    var size = "";
    var sizeBtn = document.querySelector(".size-btn.selected");
    if (sizeBtn) size = sizeBtn.dataset.size || "";
    var qty = 1;
    var qtyEl = document.querySelector(".qty-selector span");
    if (qtyEl) qty = parseInt(qtyEl.textContent, 10) || 1;
    return { name: name || "your order", price: price, size: size, qty: qty };
  }

  function addOrderButton() {
    var addBtn = document.getElementById("addToCartBtn");
    if (!addBtn || addBtn.disabled) return;
    if (document.getElementById("waOrderBtn")) return;
    var p = pageProduct();
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "add-to-cart wa-order-btn";
    btn.id = "waOrderBtn";
    btn.textContent = "Order on WhatsApp";
    btn.addEventListener("click", function () {
      var msg = "Hi Giftora! I'd like to order " + p.name +
        (p.price ? " (" + p.price + ")" : "") +
        (p.size ? " in size " + p.size : "") +
        (p.qty > 1 ? ", qty " + p.qty : "") +
        ". Is it available today?";
      window.open(BASE + encodeURIComponent(msg), "_blank", "noopener");
    });
    addBtn.parentNode.insertBefore(btn, addBtn);
  }

  function addFloat() {
    if (document.getElementById("waFloat")) return;
    var a = document.createElement("a");
    a.className = "wa-float";
    a.id = "waFloat";
    a.href = BASE + encodeURIComponent("Hi Giftora! I need help with an order.");
    a.target = "_blank";
    a.rel = "noopener";
    a.title = "Chat with Giftora on WhatsApp";
    a.setAttribute("aria-label", "Chat with Giftora on WhatsApp");
    a.innerHTML = SVG;
    document.body.appendChild(a);
  }

  injectCSS();
  var r = Math.random() * 300;
  setTimeout(function () { addFloat(); }, 500 + r);
  setTimeout(function () { addOrderButton(); }, 800 + r);
})();
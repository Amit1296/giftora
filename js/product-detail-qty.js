/* Product detail page: quantity selector, size selector and add-to-cart wiring.
   Lives in an external file so it satisfies the site CSP, which does not allow
   inline scripts. Per-product values come from the adjacent
   <script type="application/json" id="ppd-config"> block. */
(function () {
  "use strict";

  var cfg = {};
  var holder = document.getElementById("ppd-config");
  if (holder) {
    try {
      cfg = JSON.parse(holder.textContent) || {};
    } catch (e) {
      cfg = {};
    }
  }

  var RUPEE = "\u20B9";
  var sizePrices = cfg.sizePrices || {};
  var basePrice = Number(cfg.price) || 0;

  var qty = 1;
  var sel = document.querySelector(".qty-selector");
  var qtyEl = sel && sel.querySelector("span");

  if (sel && qtyEl) {
    sel.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-action]");
      if (!btn) return;
      qty = Math.max(1, Math.min(50, qty + (btn.dataset.action === "inc" ? 1 : -1)));
      qtyEl.textContent = qty;
    });
  }

  var size = "";
  var sizeSel = document.querySelector(".size-selector");
  var priceEl = document.getElementById("detailPrice");
  var oldEl = document.getElementById("detailOldPrice");

  if (sizeSel) {
    var sizeBtns = Array.prototype.slice.call(sizeSel.querySelectorAll(".size-btn"));
    sizeBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        sizeBtns.forEach(function (x) {
          x.classList.remove("selected");
        });
        b.classList.add("selected");
        size = b.dataset.size;
        if (priceEl) {
          var sp = sizePrices[size] != null ? Number(sizePrices[size]) : basePrice;
          priceEl.textContent = RUPEE + sp.toLocaleString("en-IN");
        }
        if (oldEl) {
          oldEl.style.display = sizePrices[size] != null ? "none" : "";
        }
      });
    });
    if (sizeBtns.length) size = sizeBtns[0].dataset.size;
  }

  var api = window.Giftora;
  if (!api) return;

  var addBtn = document.getElementById("addToCartBtn");
  if (addBtn && !addBtn.disabled && typeof api.addToCartQty === "function") {
    addBtn.addEventListener("click", function () {
      api.addToCartQty(cfg.id, qty, size);
    });
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".add-to-cart[data-id]");
    if (!btn || btn.id === "addToCartBtn" || btn.disabled) return;
    if (typeof api.addToCart !== "function") return;
    var s = document.querySelector('.product-size[data-size="' + btn.dataset.id + '"]');
    api.addToCart(btn.dataset.id, s ? s.value : "");
  });
})();

(function () {
  var qty = 1;
  var sel = document.querySelector(".qty-selector");
  var qtyEl = sel && sel.querySelector("span");
  if (sel) sel.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-action]");
    if (!btn) return;
    qty = Math.max(1, Math.min(50, qty + (btn.dataset.action === "inc" ? 1 : -1)));
    qtyEl.textContent = qty;
  });
  var sizeSel = document.querySelector(".size-selector");
  var size = "";
  if (sizeSel) {
    var sizeBtns = sizeSel.querySelectorAll(".size-btn");
    sizeBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        sizeBtns.forEach(function (x) { x.classList.remove("selected"); });
        b.classList.add("selected");
        size = b.dataset.size;
      });
    });
    size = sizeBtns.length ? sizeBtns[0].dataset.size : "";
  }
  var addBtn = document.getElementById("addToCartBtn");
  var productId = (sel && sel.dataset.id) || (addBtn && addBtn.dataset.id) || "";
  if (addBtn && !addBtn.disabled && productId) addBtn.addEventListener("click", function () {
    window.Giftora.addToCartQty(Number(productId), qty, size);
  });
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".add-to-cart[data-id]");
    if (btn && btn.id !== "addToCartBtn" && !btn.disabled) {
      var s = document.querySelector('.product-size[data-size="' + btn.dataset.id + '"]');
      window.Giftora.addToCart(btn.dataset.id, s ? s.value : "");
    }
  });
})();

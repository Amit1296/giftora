/* Checkout success-box preview tool (staff only, checkout-preview.html).
   Lives in an external file because the server CSP allows script-src 'self'
   but not 'unsafe-inline', which silently blocked the old inline script. */
(function () {
  "use strict";

  function $(id) {
    return document.getElementById(id);
  }

  var showBtn = $("showBtn");
  var overlay = $("previewOverlay");
  var doneBtn = $("successDone");
  if (!showBtn || !overlay) return;

  showBtn.addEventListener("click", function () {
    var id = ($("pvOrderId") && $("pvOrderId").value.trim()) || "order_test";
    var total = Number($("pvTotal") && $("pvTotal").value) || 0;

    var orderLine = overlay.querySelector(".success-order-line strong");
    if (orderLine) orderLine.textContent = "#" + id;

    /* The heading in the markup is an <h3>, not an <h4>; the old selector
     matched nothing and threw once the script was allowed to run. */
    var heading = overlay.querySelector(".checkout-success h3");
    if (heading) heading.textContent = "Order Placed Successfully!";

    var note = $("successEmailNote");
    if (note) note.hidden = !($("pvEmailSent") && $("pvEmailSent").checked);

    overlay.classList.add("open");
    overlay.dataset.total = String(total);
  });

  if (doneBtn) {
    doneBtn.addEventListener("click", function () {
      overlay.classList.remove("open");
    });
  }

  overlay.addEventListener("click", function (e) {
    if (e.target === this) this.classList.remove("open");
  });
})();

(() => {
  let PRODUCTS = (window.GIFT_PRODUCTS || []).slice();
  const PRODUCTS_KEY = "giftora_cart";
  const CURRENCY = "₹";

  async function refreshProducts() {
    try {
      const res = await fetch("/api/products");
      if (!res.ok) return;
      const data = await res.json();
      if (data && Array.isArray(data.products)) {
        PRODUCTS = data.products;
        renderProducts();
      }
    } catch {}
  }

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const cartBtn = $("#cartBtn");
  const cartBadge = $("#cartBadge");
  const cartDrawer = $("#cartDrawer");
  const cartOverlay = $("#cartOverlay");
  const cartClose = $("#cartClose");
  const cartItemsEl = $("#cartItems");
  const cartTotalEl = $("#cartTotal");
  const checkoutBtn = $("#checkoutBtn");
  const productsGrid = $("#productsGrid");
  const emptyState = $("#emptyState");
  const searchInput = $("#searchInput");
  const filterBtns = $("#filterBtns");
  const toastEl = $("#toast");
  const navbar = $("#navbar");
  const menuToggle = $("#menuToggle");
  const navLinks = $("#navLinks");
  const contactForm = $("#contactForm");
  const vendorForm = $("#vendorForm");
  const checkoutModal = $("#checkoutModal");
  const checkoutOverlay = $("#checkoutOverlay");
  const checkoutClose = $("#checkoutClose");
  const checkoutForm = $("#checkoutForm");
  const orderSummary = $("#orderSummary");
  const checkoutTotal = $("#checkoutTotal");
  const placeOrderBtn = $("#placeOrderBtn");
  const checkoutSuccess = $("#checkoutSuccess");
  const successOrderId = $("#successOrderId");
  const successDone = $("#successDone");
  const upiOverlay = $("#upiOverlay");
  const upiModal = $("#upiModal");
  const upiClose = $("#upiClose");
  const upiQr = $("#upiQr");
  const upiAmount = $("#upiAmount");
  const upiIdText = $("#upiIdText");
  const upiPaidBtn = $("#upiPaidBtn");

  const PAGE_CATEGORY = window.PAGE_CATEGORY || null;
  const PAGE_FESTIVAL = document.body && document.body.getAttribute("data-page") === "festival";
  const PAGE_RAKHI = document.body && document.body.getAttribute("data-page") === "rakhi";
  const PAGE_NRI = document.body && document.body.getAttribute("data-page") === "nri";
  const PAGE_OCCASION = document.body && document.body.getAttribute("data-page") === "occasion";

  const RAKHI_CATEGORIES = ["combo"];
  const OCCASION_FILTERS = {
    "birthday-gifts": ["combo", "cakes", "flowers", "teddy", "toys"],
    "anniversary-gifts": ["combo", "cakes", "flowers", "teddy"],
    "wedding-gifts": ["combo", "flowers", "plants"],
    "housewarming-gifts": ["plants", "combo", "flowers"],
    "baby-shower-gifts": ["teddy", "toys", "combo"],
    "corporate-gifts": ["combo", "plants"]
  };
  const OCCASION_CATEGORIES = PAGE_OCCASION
    ? OCCASION_FILTERS[document.body.getAttribute("data-occasion")] || null
    : null;
  let cart = loadCart();
  let activeFilter = "all";
  let searchQuery = "";

  function loadCart() {
    try { return JSON.parse(localStorage.getItem(PRODUCTS_KEY)) || {}; }
    catch { return {}; }
  }

  function saveCart() {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(cart));
  }

  function formatPrice(n) {
    return CURRENCY + Number(n || 0).toLocaleString("en-IN");
  }

  function escAttr(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function normEntry(e) {
    if (e && typeof e === "object") {
      return { qty: Math.max(0, parseInt(e.qty, 10) || 0), size: String(e.size || "") };
    }
    return { qty: Math.max(0, parseInt(e, 10) || 0), size: "" };
  }

  function stockOf(p) {
    return p && typeof p.stock === "number" && p.stock >= 0 ? p.stock : Infinity;
  }

  function sizeOf(p, requested, fallback) {
    const sizes = (p && p.sizes) || [];
    if (!sizes.length) return "";
    if (requested && sizes.includes(requested)) return requested;
    if (fallback && sizes.includes(fallback)) return fallback;
    return sizes[0];
  }

  function defaultSize(p) {
    const sizes = (p && p.sizes) || [];
    return sizes.length ? sizes[0] : "";
  }

  function hasSizePrices(p) {
    return !!(p && p.sizePrices && Object.keys(p.sizePrices).length);
  }

  function basePrice(p, size) {
    const base = (p && p.price) || 0;
    if (hasSizePrices(p) && size && p.sizePrices[size] != null) {
      return Number(p.sizePrices[size]) || base;
    }
    return base;
  }

  /* ---------- Reviews & ratings ---------- */
  const REVIEW_NAMES = ["Aarav S.", "Priya M.", "Rohit K.", "Sneha T.", "Ananya G.", "Vikram R.", "Kavya N.", "Sameer J.", "Ishita B.", "Arjun P."];
  const REVIEW_COMMENTS = [
    "Bought this as a surprise and the delivery was quick. Packaging was lovely!",
    "Good quality, exactly as described. My family loved it.",
    "Same-day delivery really worked. The personalised note was a sweet touch.",
    "Lovely product at a fair price. Would recommend to friends.",
    "Great service from ordering to delivery. Very happy.",
    "The recipient was thrilled! Wonderful experience overall.",
    "Nice gift, good quality for the price. Delivery on time.",
    "Beautifully wrapped and delivered on time. Highly recommended.",
    "Simple ordering process and smooth delivery. Worth it.",
    "Really nice present. Customer support was helpful too.",
  ];
  function hashNum(n) {
    const s = String(n);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function seededRating(id) {
    const h = hashNum(id);
    return { rating: Math.round((3.8 + (h % 12) / 10) * 10) / 10, count: 6 + (h % 46) };
  }
  function seededReviews(id) {
    const h = hashNum(id);
    const n = 2 + (h % 3);
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        name: REVIEW_NAMES[(h + i * 13) % REVIEW_NAMES.length],
        rating: 3 + ((h + i) % 3),
        comment: REVIEW_COMMENTS[(h + i * 7) % REVIEW_COMMENTS.length],
        daysAgo: 3 + ((h + i * 5) % 40),
      });
    }
    return out;
  }
  function starHTML(rating) {
    const full = Math.round(rating);
    let s = "";
    for (let i = 1; i <= 5; i++) {
      s += i <= full ? '<span class="star">★</span>' : '<span class="star star-off">★</span>';
    }
    return `<span class="stars" aria-label="${rating} out of 5 stars">${s}</span>`;
  }
  function ratingLine(p) {
    const r = seededRating(p.id);
    return `${starHTML(r.rating)}<span class="rating-num">${r.rating}</span><span class="rating-count">(${r.count})</span>`;
  }
  function userReviews(id) {
    try { return JSON.parse(localStorage.getItem("giftora_reviews") || "{}")[String(id)] || []; } catch { return []; }
  }
  function saveUserReview(id, r) {
    try {
      const all = JSON.parse(localStorage.getItem("giftora_reviews") || "{}");
      const list = all[String(id)] || [];
      list.unshift(r);
      all[String(id)] = list;
      localStorage.setItem("giftora_reviews", JSON.stringify(all));
    } catch {}
  }
  function renderReviewSection() {
    const list = $("#reviewList");
    if (!list) return;
    const id = list.dataset.id;
    const seeded = seededReviews(id);
    const users = userReviews(id);
    const all = seeded.concat(users);
    const sr = seededRating(id);
    const sum = $("#reviewSummary");
    if (sum) {
      sum.innerHTML = `<div class="review-score"><span class="review-big">${sr.rating}</span>${starHTML(sr.rating)}<span class="review-count">${sr.count + users.length} verified ratings</span></div>`;
    }
    list.innerHTML = all.map((r) => `
      <div class="review-item">
        <div class="review-head">
          <span class="review-avatar">${escAttr(String(r.name).charAt(0).toUpperCase())}</span>
          <div><strong>${escAttr(r.name)}</strong>${starHTML(r.rating)}</div>
          <span class="review-date">${r.daysAgo != null ? r.daysAgo + " days ago" : "Just now"}</span>
        </div>
        <p>${escAttr(r.comment)}</p>
      </div>`).join("");
  }
  function wireReviewForm() {
    const form = $("#reviewForm");
    if (!form || form.dataset.wired) return;
    form.dataset.wired = "1";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = form.dataset.id;
      const name = $("#rvName").value.trim() || "Anonymous";
      const rating = Number($("#rvRating").value) || 5;
      const comment = $("#rvText").value.trim();
      if (!comment) { toast("Please write a short review."); return; }
      saveUserReview(id, { name, rating, comment });
      form.reset();
      toast("Thanks for your review!");
      renderReviewSection();
    });
  }

  /* ---------- Wishlist ---------- */
  const WL_KEY = "giftora_wishlist";
  function loadWishlist() { try { return JSON.parse(localStorage.getItem(WL_KEY)) || []; } catch { return []; } }
  function saveWishlist(list) { try { localStorage.setItem(WL_KEY, JSON.stringify(list)); } catch {} }
  function inWishlist(id) { return loadWishlist().includes(Number(id)); }
  function toggleWishlist(id) {
    let list = loadWishlist();
    const n = Number(id);
    list = list.includes(n) ? list.filter((x) => x !== n) : list.concat(n);
    saveWishlist(list);
    updateWishBadge();
    const d = $("#wishDrawer");
    if (d && d.classList.contains("open")) renderWishDrawer();
    return inWishlist(n);
  }
  function updateWishBadge() {
    const n = loadWishlist().length;
    const b = $("#wishBadge");
    if (b) { b.textContent = n; b.classList.toggle("hidden", n === 0); }
  }
  function wishHeartBtn(id, big) {
    const on = inWishlist(id);
    return `<button type="button" class="wish-heart${big ? " wish-heart-lg" : ""}${on ? " active" : ""}" data-wish="${id}" aria-label="Toggle wishlist">${on ? "♥" : "♡"}</button>`;
  }
  function initWishButton() {
    const actions = document.querySelector(".nav-actions");
    if (!actions || document.getElementById("wishBtn")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cart-btn wish-btn";
    b.id = "wishBtn";
    b.setAttribute("aria-label", "Open wishlist");
    b.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span class="cart-badge hidden" id="wishBadge">0</span>';
    actions.insertBefore(b, actions.firstChild);
    b.addEventListener("click", openWishDrawer);
    updateWishBadge();
  }
  function initWishDrawer() {
    if (document.getElementById("wishDrawer")) return;
    const overlay = document.createElement("div");
    overlay.className = "cart-overlay";
    overlay.id = "wishOverlay";
    const aside = document.createElement("aside");
    aside.className = "cart-drawer wish-drawer";
    aside.id = "wishDrawer";
    aside.setAttribute("aria-label", "Wishlist");
    aside.innerHTML =
      '<div class="cart-header"><h3>❤️ My Wishlist</h3><button class="cart-close" id="wishClose" aria-label="Close wishlist">&times;</button></div>' +
      '<div class="cart-items" id="wishItems"></div>' +
      '<div class="cart-footer"><a class="btn btn-primary btn-block" href="index.html#shop">Browse Gifts</a></div>';
    document.body.appendChild(overlay);
    document.body.appendChild(aside);
    $("#wishClose").addEventListener("click", closeWishDrawer);
    overlay.addEventListener("click", closeWishDrawer);
    aside.addEventListener("click", (e) => {
      const btn = e.target.closest(".add-to-cart");
      if (btn && !btn.disabled && btn.dataset.id) {
        const id = Number(btn.dataset.id);
        const sel = aside.querySelector(`.product-size[data-size="${id}"]`);
        addToCart(id, sel ? sel.value : "");
        return;
      }
      const rm = e.target.closest("[data-wish-remove]");
      if (rm) {
        toggleWishlist(rm.dataset.wishRemove);
        renderWishDrawer();
      }
    });
  }
  function openWishDrawer() {
    initWishDrawer();
    $("#wishDrawer").classList.add("open");
    $("#wishOverlay").classList.add("open");
    lockScroll();
    renderWishDrawer();
  }
  function closeWishDrawer() {
    const d = $("#wishDrawer"), o = $("#wishOverlay");
    if (!d) return;
    d.classList.remove("open");
    o.classList.remove("open");
    unlockScroll();
  }
  function renderWishDrawer() {
    const el = $("#wishItems");
    if (!el) return;
    const list = loadWishlist();
    if (!list.length) {
      el.innerHTML = '<div class="cart-empty"><span class="cart-empty-icon">💝</span>Your wishlist is empty.<br>Tap the ♥ on any gift to save it.</div>';
      return;
    }
    el.innerHTML = list.map((id) => {
      const p = PRODUCTS.find((x) => x.id === Number(id));
      if (!p) return "";
      const size = p.sizes && p.sizes.length
        ? `<select class="cart-item-size" data-size="${p.id}" aria-label="Size">${p.sizes.map((s) => {
            const sp = hasSizePrices(p) && p.sizePrices[s] != null ? ` (${formatPrice(p.sizePrices[s])})` : "";
            return `<option value="${escAttr(s)}">${escAttr(s)}${sp}</option>`;
          }).join("")}</select>`
        : "";
      return `<div class="cart-item">
        <div class="cart-item-thumb" style="background:${p.gradient}">${p.emoji}</div>
        <div class="cart-item-info">
          <p class="cart-item-name">${escAttr(p.name)}</p>
          <p class="cart-item-price">${formatPrice(effPrice(p))}</p>
          <div class="cart-item-row">${size}<button class="add-to-cart wish-add" data-id="${p.id}">Add to Cart</button></div>
        </div>
        <button class="cart-item-remove" data-wish-remove="${p.id}" aria-label="Remove from wishlist">✕</button>
      </div>`;
    }).join("");
  }

  /* ---------- Recently viewed ---------- */
  const RECENT_KEY = "giftora_recent";
  function trackRecent(id) {
    try {
      const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      const n = Number(id);
      localStorage.setItem(RECENT_KEY, JSON.stringify([n].concat(list.filter((x) => x !== n)).slice(0, 8)));
    } catch {}
  }
  function recentProducts() {
    try {
      const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      return list.map((id) => PRODUCTS.find((p) => p.id === Number(id))).filter(Boolean);
    } catch { return []; }
  }
  function renderRecent() {
    const wrap = $("#recentWrap");
    if (!wrap) return;
    const items = recentProducts();
    if (!items.length) return;
    const grid = $("#recentGrid");
    grid.innerHTML = items.map((p) => {
      const u = productPageUrl(p);
      return `<article class="product-card reveal">
        <div class="product-media" style="background:${p.gradient || "#f1f5f9"}">
          ${u ? `<a class="product-card-link" href="${u}" aria-label="View ${escAttr(p.name)}"><span class="product-emoji">${p.emoji || "🎁"}</span></a>` : `<span class="product-emoji">${p.emoji || "🎁"}</span>`}
        </div>
        <div class="product-info">
          <span class="product-category">${escAttr(p.category)}</span>
          ${u ? `<a class="product-card-link" href="${u}"><h3 class="product-name">${escAttr(p.name)}</h3></a>` : `<h3 class="product-name">${escAttr(p.name)}</h3>`}
          <div class="product-price"><span class="price">${formatPrice(effPrice(p))}</span></div>
        </div>
      </article>`;
    }).join("");
    wrap.style.display = "";
    requestAnimationFrame(() => observeReveals());
  }

  /* ---------- Order tracking (local) ---------- */
  const ORDERS_KEY = "giftora_orders";
  function loadOrders() { try { return JSON.parse(localStorage.getItem(ORDERS_KEY)) || []; } catch { return []; } }
  function saveOrder(o) {
    try {
      const list = loadOrders();
      list.unshift(o);
      localStorage.setItem(ORDERS_KEY, JSON.stringify(list.slice(0, 20)));
    } catch {}
  }
  function orderStatus(o) {
    const age = Date.now() - new Date(o.date).getTime();
    if (age < 30 * 60 * 1000) return { label: "Order Placed", note: "We've received your order and a team member will confirm shortly.", step: 1 };
    if (age < 4 * 60 * 60 * 1000) return { label: "Order Confirmed", note: "Your gift is being prepared with gift wrapping 🎁", step: 2 };
    if (age < 24 * 60 * 60 * 1000) return { label: "Out for Delivery", note: "Your gift is on the way 🚚", step: 3 };
    return { label: "Delivered", note: "Delivered! We hope they loved it ❤️", step: 4 };
  }
  function initTrackPage() {
    const btn = $("#trackBtn");
    if (!btn) return;
    const run = (e) => {
      if (e) e.preventDefault();
      const input = $("#trackInput").value.trim().replace(/^#/, "");
      const out = $("#trackResult");
      const o = loadOrders().find((x) => String(x.orderId).replace(/^#/, "") === input);
      if (!o) {
        out.hidden = false;
        out.innerHTML = '<div class="track-none">We couldn\'t find that order on this device. Orders placed from this browser are stored here for tracking.</div>';
        return;
      }
      const st = orderStatus(o);
      const steps = [
        { l: "Placed", i: "📝" }, { l: "Confirmed", i: "🎁" }, { l: "Out for delivery", i: "🚚" }, { l: "Delivered", i: "✅" },
      ];
      out.hidden = false;
      out.innerHTML = `
        <div class="track-card">
          <div class="track-head">
            <div><h3>Order #${escAttr(o.orderId)}</h3><p class="track-meta">${escAttr(o.name || "Guest")} · ${new Date(o.date).toLocaleString("en-IN")} · ${formatPrice(o.total)}</p></div>
            <span class="track-status">${st.label}</span>
          </div>
          <div class="track-steps">
            ${steps.map((s, i) => `<div class="track-step${i + 1 <= st.step ? " done" : ""}"><span class="track-step-icon">${s.i}</span><span>${s.l}</span></div>`).join("")}
          </div>
          <p class="track-note">${st.note}</p>
        </div>`;
    };
    btn.addEventListener("click", run);
    const form = $("#trackForm");
    if (form) form.addEventListener("submit", run);
    const input = $("#trackInput");
    if (input) input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  }

  let festivalDiscount = 0;
  let festivalProductIds = new Set();

  function isFestivalProduct(p) {
    return festivalProductIds.size === 0 || festivalProductIds.has(p.id);
  }

  function effPrice(p, size) {
    return festivalDiscount > 0 && isFestivalProduct(p) ? Math.round((basePrice(p, size) * (100 - festivalDiscount)) / 100) : basePrice(p, size);
  }

  function effOldPrice(p) {
    if (festivalDiscount <= 0 || !isFestivalProduct(p) || !p.oldPrice) return p.oldPrice || 0;
    return Math.round((p.oldPrice * (100 - festivalDiscount)) / 100);
  }

  function countItems() {
    return Object.values(cart).reduce((sum, e) => sum + normEntry(e).qty, 0);
  }

  function updateBadge() {
    const n = countItems();
    cartBadge.textContent = n;
    cartBadge.classList.toggle("hidden", n === 0);
    const mb = $("#mNavBadge");
    if (mb) {
      mb.textContent = n;
      mb.classList.toggle("hidden", n === 0);
    }
  }

  function cartTotal() {
    return Object.entries(cart).reduce((sum, [id, e]) => {
      const n = normEntry(e);
      const p = PRODUCTS.find((x) => x.id === Number(id));
      return sum + (p ? effPrice(p, n.size) * n.qty : 0);
    }, 0);
  }

  function festivalSaving() {
    if (festivalDiscount <= 0) return 0;
    return Object.entries(cart).reduce((sum, [id, e]) => {
      const n = normEntry(e);
      const p = PRODUCTS.find((x) => x.id === Number(id));
      return sum + (p ? (basePrice(p, n.size) - effPrice(p, n.size)) * n.qty : 0);
    }, 0);
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 2400);
  }

  function lockScroll() {
    document.body.style.overflow = "hidden";
  }

  function unlockScroll() {
    document.body.style.overflow = "";
  }

  /* ---------- Cart drawer ---------- */
  function openCart() {
    cartDrawer.classList.add("open");
    cartOverlay.classList.add("open");
    lockScroll();
    renderCart();
  }

  function closeCart() {
    cartDrawer.classList.remove("open");
    cartOverlay.classList.remove("open");
    if (!checkoutModal.classList.contains("open")) unlockScroll();
  }

  /* ---------- Checkout modal ---------- */
  function openCheckout() {
    if (countItems() === 0) return;
    renderOrderSummary();
    loadPaymentConfig();
    checkoutModal.classList.add("open");
    checkoutOverlay.classList.add("open");
    checkoutForm.style.display = "";
    checkoutSuccess.hidden = true;
    checkoutForm.reset();
    lockScroll();
  }

  function closeCheckout() {
    checkoutModal.classList.remove("open");
    checkoutOverlay.classList.remove("open");
    if (!cartDrawer.classList.contains("open")) unlockScroll();
  }

  function renderOrderSummary() {
    const ids = Object.keys(cart);
    orderSummary.innerHTML = ids.map((id) => {
      const n = normEntry(cart[id]);
      const p = PRODUCTS.find((x) => x.id === Number(id));
      if (!p) return "";
      const size = n.size ? ` <span class="os-muted">(${escAttr(n.size)})</span>` : "";
      return `
        <div class="os-row">
          <span class="os-name">${p.name}${size} <span class="os-muted">&times; ${n.qty}</span></span>
          <span class="os-muted">${formatPrice(effPrice(p, n.size) * n.qty)}</span>
        </div>
      `;
    }).join("");
    const saving = festivalSaving();
    checkoutTotal.textContent = formatPrice(cartTotal());
    checkoutTotal.previousElementSibling.textContent = saving > 0 ? `Total to pay (${festivalDiscount}% off)` : "Total to pay";
  }

  function buildItems() {
    return Object.entries(cart).map(([id, e]) => {
      const n = normEntry(e);
      const p = PRODUCTS.find((x) => x.id === Number(id));
      if (!p) return null;
      return { id: Number(id), name: p.name, qty: n.qty, size: n.size, price: effPrice(p, n.size) };
    }).filter(Boolean);
  }

  async function placeOrder(payment, rzp) {
    const items = buildItems();
    const name = $("#oName").value.trim();
    const phone = $("#oPhone").value.trim();
    const address = $("#oAddress").value.trim();
    const city = $("#oCity").value.trim();
    const state = $("#oState").value.trim();
    const pincode = $("#oPincode").value.trim();
    const shippingAddress = [address, city, state, "PIN " + pincode].filter(Boolean).join(", ");

    let vid = "";
    try { vid = localStorage.getItem("giftora_vid") || ""; } catch {}

    const payload = {
      name,
      phone,
      address: shippingAddress,
      payment,
      items,
      total: cartTotal(),
      vid,
    };
    if (rzp) {
      payload.razorpayOrderId = rzp.orderId;
      payload.razorpayPaymentId = rzp.paymentId;
      payload.razorpaySignature = rzp.signature;
    }

    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = "Placing order...";

    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());

      if (!res.success) {
        throw new Error(res.message || "Order failed");
      }

      successOrderId.textContent = "#" + res.orderId;
      saveOrder({ orderId: String(res.orderId), name: name || "", phone: phone || "", total: cartTotal(), date: new Date().toISOString(), payment });
      const waTrack = checkoutSuccess.querySelector(".wa-track");
      if (!waTrack) {
        const a = document.createElement("a");
        a.className = "btn btn-outline wa-track";
        a.href = "https://wa.me/917088084046?text=" + encodeURIComponent("Hi Giftora! Please send me an update on order #" + res.orderId);
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "Track on WhatsApp";
        checkoutSuccess.insertBefore(a, checkoutSuccess.querySelector("#successDone"));
      }
      checkoutForm.style.display = "none";
      checkoutSuccess.hidden = false;
      cart = {};
      saveCart();
      updateBadge();
      renderCart();
    } catch (e) {
      toast(e.message || "Could not reach the server. Please try again.");
    } finally {
      placeOrderBtn.disabled = false;
      placeOrderBtn.textContent = "Place Order";
    }
  }

  let rzpScriptPromise = null;
  function loadRazorpay() {
    if (window.Razorpay) return Promise.resolve();
    if (rzpScriptPromise) return rzpScriptPromise;
    rzpScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { rzpScriptPromise = null; reject(new Error("Could not load payment gateway.")); };
      document.head.appendChild(s);
    });
    return rzpScriptPromise;
  }

  async function startOnlinePayment(method) {
    const items = buildItems();
    if (!items.length) { toast("Your cart is empty."); return; }
    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = "Connecting to payment...";
    try {
      const res = await fetch("/api/payment/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.message || "Could not start payment.");

      await loadRazorpay();
      const name = $("#oName").value.trim();
      const phone = $("#oPhone").value.trim();
      const rzp = new window.Razorpay({
        key: res.key,
        amount: res.amount,
        currency: "INR",
        name: "Giftora",
        description: "Gift order " + (res.receipt || ""),
        order_id: res.orderId,
        prefill: { name: name || "", contact: phone || "" },
        theme: { color: "#c2410c" },
        handler: (r) => {
          placeOrder(method, {
            orderId: r.razorpay_order_id,
            paymentId: r.razorpay_payment_id,
            signature: r.razorpay_signature,
          });
        },
        modal: { ondismiss: () => { placeOrderBtn.disabled = false; placeOrderBtn.textContent = "Place Order"; } },
      });
      rzp.open();
    } catch (e) {
      placeOrderBtn.disabled = false;
      placeOrderBtn.textContent = "Place Order";
      toast(e.message || "Could not start payment. Try UPI or Card.");
    }
  }

  async function submitOrder() {
    const items = buildItems();
    if (!items.length) {
      toast("Your cart is empty.");
      return;
    }
    const name = $("#oName").value.trim();
    const phone = $("#oPhone").value.trim();
    const address = $("#oAddress").value.trim();
    const city = $("#oCity").value.trim();
    const state = $("#oState").value.trim();
    const pincode = $("#oPincode").value.trim();
    if (!name || !phone || !address || !city || !state || !pincode) {
      toast("Please fill in all details and try again.");
      return;
    }
    const payment = document.querySelector('input[name="payment"]:checked')?.value || "UPI";
    if (payment === "UPI QR") {
      await startDirectUpi();
    } else {
      await startOnlinePayment(payment);
    }
  }

  checkoutBtn.addEventListener("click", openCheckout);
  checkoutClose.addEventListener("click", closeCheckout);
  checkoutOverlay.addEventListener("click", closeCheckout);
  successDone.addEventListener("click", () => {
    closeCheckout();
    closeCart();
    toast("Thank you for your order! 🎉");
  });
  checkoutForm.addEventListener("submit", (e) => {
    e.preventDefault();
    submitOrder();
  });

  async function startDirectUpi() {
    if (!upiConfig || !upiConfig.upiId) {
      toast("UPI payments are unavailable right now.");
      return;
    }
    const amt = cartTotal();
    upiAmount.textContent = formatPrice(amt);
    upiIdText.textContent = upiConfig.upiId;
    const uri = "upi://pay?pa=" + upiConfig.upiId +
      "&pn=" + encodeURIComponent(upiConfig.payeeName || "Giftora") +
      "&am=" + Math.round(amt) + "&cu=INR" +
      "&tn=" + encodeURIComponent("Giftora");
    if (typeof qrcode === "function") {
      const qr = qrcode(0, "M");
      qr.addData(uri);
      qr.make();
      upiQr.src = qr.createDataURL(8, 2);
    } else {
      upiQr.src = "https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=" + encodeURIComponent(uri);
    }
    upiQr.alt = "UPI QR code for " + formatPrice(amt);
    const officialWrap = document.getElementById("upiOfficialWrap");
    const officialQr = document.getElementById("upiOfficialQr");
    if (officialWrap && officialQr) {
      if (upiConfig.qrImage) {
        officialQr.src = upiConfig.qrImage;
        officialWrap.hidden = false;
      } else {
        officialWrap.hidden = true;
      }
    }
    upiOverlay.classList.add("open");
    upiModal.classList.add("open");
    lockScroll();
  }

  function closeUpi() {
    upiModal.classList.remove("open");
    upiOverlay.classList.remove("open");
    if (!checkoutModal.classList.contains("open") && !cartDrawer.classList.contains("open")) unlockScroll();
  }

  if (upiClose) upiClose.addEventListener("click", closeUpi);
  if (upiOverlay) upiOverlay.addEventListener("click", closeUpi);
  if (upiPaidBtn) {
    upiPaidBtn.addEventListener("click", () => {
      closeUpi();
      placeOrder("UPI QR", null);
    });
  }

  const paymentMethods = document.getElementById("paymentMethods");
  let paymentEnabled = false;
  let upiConfig = null;
  async function loadPaymentConfig() {
    try {
      const r = await fetch("/api/payment/config");
      const d = await r.json();
      paymentEnabled = !!(d && d.enabled);
    } catch {
      paymentEnabled = false;
    }
    try {
      const r = await fetch("/api/upi/config");
      const d = await r.json();
      upiConfig = d && d.enabled ? d : null;
    } catch {
      upiConfig = null;
    }
    if (!paymentMethods) return;
    paymentMethods.querySelectorAll(".payment-option").forEach((opt) => {
      const inp = opt.querySelector("input");
      if (!inp) return;
      const val = inp.value;
      const isDirectUpi = val === "UPI QR";
      const available = isDirectUpi ? !!upiConfig : paymentEnabled;
      inp.disabled = !available;
      opt.classList.toggle("disabled", !available);
    });
    if (!paymentEnabled && !upiConfig && !paymentMethods.querySelector(".payment-note")) {
      const note = document.createElement("p");
      note.className = "payment-note";
      note.textContent = "Online payments are currently unavailable — please try again later.";
      paymentMethods.appendChild(note);
    }
  }
  if (paymentMethods) {
    paymentMethods.addEventListener("change", (e) => {
      paymentMethods.querySelectorAll(".payment-option").forEach((opt) => {
        opt.classList.toggle("selected", opt.querySelector("input").checked);
      });
    });
  }

  /* ---------- Products ---------- */
  function slugify(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function productPageUrl(p) {
    const dynamic = "product.html?id=" + p.id;
    if (!window.GIFT_PRODUCT_PAGES) return dynamic;
    const slug = slugify(p.name);
    return window.GIFT_PRODUCT_PAGES.includes(slug) ? "products/" + slug + ".html" : dynamic;
  }

  function renderProducts() {
    if (!productsGrid) return;
    const query = searchQuery.trim().toLowerCase();
    const list = PRODUCTS.filter((p) => {
      const matchPage = PAGE_FESTIVAL
        ? festivalProductIds.size === 0 || festivalProductIds.has(p.id)
        : PAGE_RAKHI || PAGE_NRI
          ? RAKHI_CATEGORIES.includes(p.category)
          : PAGE_OCCASION
            ? OCCASION_CATEGORIES === null || OCCASION_CATEGORIES.includes(p.category)
            : !PAGE_CATEGORY
              ? true
              : PAGE_CATEGORY === "special"
                ? p.oldPrice > 0
                : p.category === PAGE_CATEGORY;
      const matchCat = activeFilter === "all" || p.category === activeFilter;
      const matchQuery = !query || p.name.toLowerCase().includes(query) || p.category.includes(query);
      return matchPage && matchCat && matchQuery;
    });

    emptyState.hidden = list.length > 0;
    productsGrid.innerHTML = list.map((p) => {
      const discount = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
      const badge = PAGE_CATEGORY === "special" && discount > 0 ? `${discount}% OFF` : p.badge;
      const stock = stockOf(p);
      const oos = stock <= 0;
      const lowStock = !oos && stock !== Infinity && stock <= 5;
      const startSize = defaultSize(p);
      const showOld = !!p.oldPrice && (!hasSizePrices(p) || Number(p.sizePrices[startSize]) === Number(p.price));
      const addControl = oos
        ? `<button class="add-to-cart" data-id="${p.id}" disabled>Out of Stock</button>`
        : `${p.sizes && p.sizes.length ? sizeSelectHtml(p) : ""}<button class="add-to-cart" data-id="${p.id}">Add to Cart</button>`;
      return `
      <article class="product-card reveal">
        <div class="product-media" style="background:${p.gradient || "#f1f5f9"}">
          ${badge ? `<span class="product-badge${badge === "Premium" ? " premium" : ""}">${badge}</span>` : ""}
          ${wishHeartBtn(p.id)}
          ${p.image
            ? `${productPageUrl(p) ? `<a class="product-card-link" href="${productPageUrl(p)}" aria-label="View ${p.name}"><img class="product-img" src="${p.image}" alt="${p.name}" loading="lazy"></a>` : `<img class="product-img" src="${p.image}" alt="${p.name}" loading="lazy">`}`
            : `${productPageUrl(p) ? `<a class="product-card-link" href="${productPageUrl(p)}" aria-label="View ${p.name}"><span class="product-emoji">${p.emoji || "🎁"}</span></a>` : `<span class="product-emoji">${p.emoji || "🎁"}</span>`}`}
        </div>
        <div class="product-info">
          <span class="product-category">${p.category}</span>
          ${productPageUrl(p)
            ? `<a class="product-card-link" href="${productPageUrl(p)}"><h3 class="product-name">${p.name}</h3></a>`
            : `<h3 class="product-name">${p.name}</h3>`}
          ${p.description ? `<p class="product-desc">${escAttr(p.description)}</p>` : ""}
          <div class="product-rating">${ratingLine(p)}</div>
          <div class="product-price">
            <span class="price">${formatPrice(effPrice(p, startSize))}</span>
            ${showOld ? `<span class="old-price">${formatPrice(effOldPrice(p))}</span>` : ""}
          </div>
          ${lowStock ? `<span class="stock-note">Only ${stock} left</span>` : ""}
          <div class="product-buy">${addControl}</div>
        </div>
      </article>
    `;
    }).join("");

    requestAnimationFrame(() => observeReveals());
  }

  function observeReveals() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    $$(".reveal:not(.visible)").forEach((el) => io.observe(el));
  }

  function addToCart(id, size) {
    const p = PRODUCTS.find((x) => x.id === Number(id));
    if (!p) return;
    const n = normEntry(cart[Number(id)]);
    const cap = stockOf(p);
    if (cap <= 0) {
      toast(`${p.name} is out of stock`);
      return;
    }
    if (cap !== Infinity && n.qty >= cap) {
      toast(`Only ${cap} of ${p.name} in stock`);
      return;
    }
    cart[Number(id)] = { qty: n.qty + 1, size: sizeOf(p, size, n.size) };
    saveCart();
    updateBadge();
    toast(`${p.name} added to cart`);
    animateCartBtn();
  }

  window.Giftora = {
    addToCart: (id, size) => addToCart(Number(id), size),
    addToCartQty: (id, qty, size) => {
      const p = PRODUCTS.find((x) => x.id === Number(id));
      if (!p) return;
      const n = normEntry(cart[Number(id)]);
      const cap = stockOf(p);
      let add = Math.max(1, parseInt(qty, 10) || 1);
      if (cap <= 0) {
        toast(`${p.name} is out of stock`);
        return;
      }
      if (cap !== Infinity && n.qty + add > cap) {
        add = Math.max(0, cap - n.qty);
        if (add <= 0) {
          toast(`Only ${cap} of ${p.name} in stock`);
          return;
        }
        toast(`Only ${cap} of ${p.name} in stock — added ${add}`);
      }
      cart[Number(id)] = { qty: n.qty + add, size: sizeOf(p, size, n.size) };
      saveCart();
      updateBadge();
      toast(`${p.name} added to cart`);
      animateCartBtn();
    },
    updateCatalog: (products) => {
      if (Array.isArray(products)) PRODUCTS = products;
    },
    openCart,
  };

  function animateCartBtn() {
    cartBtn.style.transform = "scale(1.15)";
    setTimeout(() => (cartBtn.style.transform = ""), 200);
  }

  function changeQty(id, delta) {
    const p = PRODUCTS.find((x) => x.id === Number(id));
    const n = normEntry(cart[id]);
    const cap = p ? stockOf(p) : Infinity;
    let next = n.qty + delta;
    if (delta > 0 && cap !== Infinity && next > cap) {
      next = cap;
      if (n.qty >= cap) {
        toast(`Only ${cap} of ${p.name} in stock`);
        return;
      }
    }
    if (next <= 0) delete cart[id];
    else cart[id] = { qty: next, size: n.size };
    saveCart();
    updateBadge();
    renderCart();
  }

  function removeItem(id) {
    delete cart[id];
    saveCart();
    updateBadge();
    renderCart();
  }

  function renderCart() {
    const ids = Object.keys(cart);
    if (ids.length === 0) {
      cartItemsEl.innerHTML = `<div class="cart-empty"><span class="cart-empty-icon">🎁</span>Your cart is empty.<br>Add a gift to get started.</div>`;
      cartTotalEl.textContent = `${CURRENCY}0`;
      checkoutBtn.style.display = "none";
      return;
    }
    checkoutBtn.style.display = "";
    cartItemsEl.innerHTML = ids.map((id) => {
      const n = normEntry(cart[id]);
      const p = PRODUCTS.find((x) => x.id === Number(id));
      if (!p) return "";
      const size = p.sizes && p.sizes.length
        ? `<select class="cart-item-size" data-size="${id}" aria-label="Size">
             ${p.sizes.map((s) => {
               const sp = hasSizePrices(p) && p.sizePrices[s] != null ? ` (${formatPrice(p.sizePrices[s])})` : "";
               return `<option value="${escAttr(s)}"${s === n.size ? " selected" : ""}>${escAttr(s)}${sp}</option>`;
             }).join("")}
           </select>`
        : "";
      return `
        <div class="cart-item">
          <div class="cart-item-thumb" style="background:${p.gradient}">${p.emoji}</div>
          <div class="cart-item-info">
            <p class="cart-item-name">${p.name}</p>
            <p class="cart-item-price">${formatPrice(effPrice(p, n.size))}</p>
            <div class="cart-item-row">${size}<div class="cart-item-qty">
              <button class="qty-btn" data-action="dec" data-id="${p.id}">−</button>
              <span>${n.qty}</span>
              <button class="qty-btn" data-action="inc" data-id="${p.id}">+</button>
            </div></div>
          </div>
          <button class="cart-item-remove" data-action="remove" data-id="${p.id}" aria-label="Remove">✕</button>
        </div>
      `;
    }).join("");
    cartTotalEl.textContent = formatPrice(cartTotal());
    const saving = festivalSaving();
    const discountEl = $("#cartDiscount");
    if (discountEl) {
      if (saving > 0) {
        discountEl.textContent = `Festival discount ${festivalDiscount}% applied — you save ${formatPrice(saving)}`;
        discountEl.style.display = "";
      } else {
        discountEl.style.display = "none";
      }
    }
  }

  function sizeSelectHtml(p) {
    return `<select class="product-size" data-size="${p.id}" aria-label="Size of ${escAttr(p.name)}">
      ${(p.sizes || []).map((s) => {
        const sp = hasSizePrices(p) && p.sizePrices[s] != null ? ` (${formatPrice(p.sizePrices[s])})` : "";
        return `<option value="${escAttr(s)}">${escAttr(s)}${sp}</option>`;
      }).join("")}
    </select>`;
  }

  /* ---------- Event wiring ---------- */
  document.addEventListener("click", (e) => {
    const w = e.target.closest("[data-wish]");
    if (!w) return;
    e.preventDefault();
    const active = toggleWishlist(w.dataset.wish);
    $$(`[data-wish="${w.dataset.wish}"]`).forEach((h) => {
      h.classList.toggle("active", active);
      h.innerHTML = active ? "♥" : "♡";
    });
    toast(active ? "Added to wishlist ♥" : "Removed from wishlist");
  });

  if (productsGrid) {
    productsGrid.addEventListener("click", (e) => {
      const btn = e.target.closest(".add-to-cart");
      if (!btn || btn.disabled) return;
      const id = Number(btn.dataset.id);
      const sel = productsGrid.querySelector(`.product-size[data-size="${id}"]`);
      addToCart(id, sel ? sel.value : "");
    });

    productsGrid.addEventListener("change", (e) => {
      const sel = e.target.closest(".product-size");
      if (!sel) return;
      const card = sel.closest(".product-card");
      const p = PRODUCTS.find((x) => x.id === Number(sel.dataset.size));
      if (!p || !card) return;
      const priceEl = card.querySelector(".price");
      const oldEl = card.querySelector(".old-price");
      if (priceEl) priceEl.textContent = formatPrice(effPrice(p, sel.value));
      if (oldEl) {
        const onBase = !hasSizePrices(p) || Number(p.sizePrices[sel.value]) === Number(p.price);
        oldEl.style.display = onBase ? "" : "none";
      }
    });
  }

  cartItemsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;
    if (action === "inc") changeQty(id, 1);
    if (action === "dec") changeQty(id, -1);
    if (action === "remove") removeItem(id);
  });

  cartItemsEl.addEventListener("change", (e) => {
    const sel = e.target.closest(".cart-item-size");
    if (!sel) return;
    const id = Number(sel.dataset.size);
    const n = normEntry(cart[id]);
    cart[id] = { qty: n.qty, size: sel.value };
    saveCart();
    renderCart();
  });

  if (filterBtns) {
    filterBtns.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter-btn");
      if (!btn) return;
      activeFilter = btn.dataset.filter;
      $$(".filter-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderProducts();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderProducts();
    });
  }

  document.querySelectorAll('[data-filter]').forEach((el) => {
    el.addEventListener("click", () => {
      if (el.dataset.filter) {
        activeFilter = el.dataset.filter;
        $$(".filter-btn").forEach((b) => b.classList.toggle("active", b.dataset.filter === activeFilter));
      }
    });
  });

  cartBtn.addEventListener("click", openCart);
  cartClose.addEventListener("click", closeCart);
  cartOverlay.addEventListener("click", closeCart);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeCheckout();
      closeCart();
    }
  });

  menuToggle.addEventListener("click", () => {
    navLinks.classList.toggle("open");
  });
  navLinks.addEventListener("click", () => navLinks.classList.remove("open"));

  window.addEventListener("scroll", () => {
    navbar.classList.toggle("scrolled", window.scrollY > 20);
  }, { passive: true });

  /* ---------- Contact form ---------- */
  if (contactForm) {
    contactForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = contactForm.querySelector('button[type="submit"]');
      const payload = {
        name: $("#cname").value.trim(),
        email: $("#cemail").value.trim(),
        message: $("#cmsg").value.trim(),
        date: new Date().toISOString(),
      };

      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";
      try {
        const res = await fetch("/api/enquiry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then((r) => r.json());

        if (!res.success) throw new Error("Enquiry failed");

        contactForm.reset();
        toast("Message sent! We'll get back to you soon.");
      } catch {
        toast("Could not reach the server. Please try again.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Send Message";
      }
    });
  }

  /* ---------- Vendor application form ---------- */
  if (vendorForm) {
    vendorForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = vendorForm.querySelector('button[type="submit"]');
      const payload = {
        businessName: $("#vBusiness").value.trim(),
        contactName: $("#vContact").value.trim(),
        email: $("#vEmail").value.trim(),
        phone: $("#vPhone").value.trim(),
        city: $("#vCity").value.trim(),
        category: $("#vCategory").value,
        website: $("#vWeb").value.trim(),
        message: $("#vMsg").value.trim(),
        date: new Date().toISOString(),
      };

      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";
      try {
        const res = await fetch("/api/vendor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then((r) => r.json());

        if (!res.success) throw new Error("Vendor application failed");

        vendorForm.reset();
        toast("Application submitted! We'll get back to you within 2 working days.");
      } catch {
        toast("Could not reach the server. Please try again.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Application";
      }
    });
  }

  /* ---------- Stats ---------- */
  const stats = $$(".stat-number");
  const animateStat = (el) => {
    const target = parseFloat(el.dataset.target);
    const decimals = parseInt(el.dataset.decimals || "0", 10);
    const suffix = el.dataset.suffix || "";
    const duration = 1400;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = (target * eased).toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        animateStat(e.target);
        statObserver.unobserve(e.target);
      }
    });
  }, { threshold: 0.6 });
  stats.forEach((s) => statObserver.observe(s));

  /* ---------- Festival offer ---------- */
  async function loadFestival() {
    const banner = $("#festivalBanner");
    const heroMedia = $("#festivalHeroMedia");
    const heroTitle = $("#festivalHeroTitle");
    try {
      const res = await fetch("/api/festival");
      if (!res.ok) return;
      const data = await res.json();
      const f = data.festival;
      if (!f) return;
      festivalDiscount = f.active ? (f.discount || 0) : 0;
      festivalProductIds = f.active && Array.isArray(f.productIds) ? new Set(f.productIds.map(Number)) : new Set();
      if (productsGrid) renderProducts();
      if (!banner && !heroTitle) return;
      if (!f.active) {
        if (banner) banner.style.display = "none";
        return;
      }
      if (banner) {
        const media = $("#festivalBannerMedia");
        const title = $("#festivalBannerTitle");
        const subtitle = $("#festivalBannerSubtitle");
        const discount = $("#festivalBannerDiscount");
        if (f.image) media.innerHTML = `<img src="${f.image}" alt="${escAttr(f.title)}">`;
        else media.innerHTML = `<span class="festival-banner-emoji">${f.emoji || "🎁"}</span>`;
        title.textContent = f.title || "Festival Offer";
        subtitle.textContent = f.subtitle || "";
        discount.textContent = f.discount || 0;
        rotateFestivalSubtitle(subtitle, f);
      }
      if (heroTitle) {
        heroTitle.textContent = f.title || "Festival Offer";
        const subtitle = $("#festivalHeroSubtitle");
        const discount = $("#festivalHeroDiscount");
        const note = $("#festivalHeroNote");
        const code = $("#festivalHeroCode");
        if (subtitle) subtitle.textContent = f.subtitle || "";
        if (discount) discount.textContent = f.discount || 0;
        if (code) code.textContent = f.code || "";
        if (note) note.innerHTML = `Use code <strong>${escAttr(f.code || "")}</strong> at checkout`;
        if (f.image) heroMedia.innerHTML = `<img src="${f.image}" alt="${escAttr(f.title)}">`;
        else heroMedia.innerHTML = `<span class="festival-hero-emoji">${f.emoji || "🎁"}</span>`;
      }
    } catch {}
  }

  function rotateFestivalSubtitle(el, f) {
    if (!el) return;
    const messages = [
      f.subtitle || "Celebrate every moment with Giftora",
      "Same-day delivery across the city",
      "Beautiful gift wrapping included",
      `Use code ${f.code || "GIFTORA"} at checkout`,
    ].filter(Boolean);
    let i = 0;
    el.textContent = messages[0];
    setInterval(() => {
      i = (i + 1) % messages.length;
      el.classList.add("swap");
      setTimeout(() => {
        el.textContent = messages[i];
        el.classList.remove("swap");
      }, 400);
    }, 3800);
  }

  /* ---------- Raksha Bandhan countdown ---------- */
  function initRakhiCountdown() {
    const el = $("#festivalCountdown");
    if (!el) return;
    const target = new Date("2026-08-28T05:57:00+05:30").getTime();
    const pad = (n) => String(n).padStart(2, "0");
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        el.innerHTML = '<span class="cd-note">Raksha Bandhan is here — Happy Rakhi! 🎉</span>';
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      el.innerHTML = `<span class="cd-label">Rakhi in</span> <span class="cd-num">${d}</span>d <span class="cd-num">${pad(h)}</span>h <span class="cd-num">${pad(m)}</span>m <span class="cd-num">${pad(s)}</span>s`;
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- WhatsApp order widget ---------- */
  const WA_LINK = "https://wa.me/917088084046?text=" + encodeURIComponent("Hi Giftora! I want to order a Rakhi gift.");
  const WA_ICON = '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49 0 1.47 1.07 2.89 1.22 3.09.15.2 2.1 3.2 5.1 4.49.71.3 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.76-.72 2-1.42.25-.7.25-1.29.18-1.42-.08-.12-.28-.2-.57-.35M12.05 21.79h-.01a9.8 9.8 0 0 1-5-1.37l-.36-.21-3.71.97.99-3.62-.23-.37a9.8 9.8 0 0 1-1.5-5.22c0-5.42 4.41-9.83 9.83-9.83 2.63 0 5.1 1.02 6.96 2.88a9.78 9.78 0 0 1 2.88 6.96c0 5.42-4.41 9.83-9.84 9.83M20.51 3.49A11.78 11.78 0 0 0 12.04 0C5.46 0 .12 5.33.12 11.9c0 2.1.55 4.14 1.59 5.95L.05 24l6.3-1.65a11.9 11.9 0 0 0 5.69 1.45c6.58 0 11.93-5.34 11.93-11.91 0-3.18-1.24-6.17-3.46-8.4"/></svg>';
  function initWhatsAppWidget() {
    if (document.querySelector(".wa-btn")) return;
    const btn = document.createElement("a");
    btn.className = "wa-btn";
    btn.href = WA_LINK;
    btn.target = "_blank";
    btn.rel = "noopener";
    btn.setAttribute("aria-label", "Order on WhatsApp");
    btn.innerHTML = WA_ICON;
    btn.title = "Order on WhatsApp";
    document.body.appendChild(btn);
  }

  /* ---------- Mobile bottom navigation bar ---------- */
  const HOME_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
  const SHOP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>';
  const CART_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';
  function initMobileNav() {
    if (document.getElementById("mNav")) return;
    const nav = document.createElement("nav");
    nav.className = "mnav";
    nav.id = "mNav";
    nav.setAttribute("aria-label", "Quick actions");
    const inner = document.createElement("div");
    inner.className = "mnav-inner";
    inner.innerHTML =
      '<a class="mnav-item" href="index.html">' + HOME_ICON + "<span>Home</span></a>" +
      '<a class="mnav-item" href="index.html#shop">' + SHOP_ICON + "<span>Shop</span></a>" +
      '<a class="mnav-item mnav-cart" href="#" aria-label="Open cart">' + CART_ICON + '<span class="mnav-badge hidden" id="mNavBadge">0</span><span>Cart</span></a>' +
      '<a class="mnav-item" href="' + WA_LINK + '" target="_blank" rel="noopener">' + WA_ICON + "<span>WhatsApp</span></a>";
    nav.appendChild(inner);
    document.body.appendChild(nav);
    nav.querySelector(".mnav-cart").addEventListener("click", (e) => {
      e.preventDefault();
      openCart();
    });
  }

  observeReveals();
  updateBadge();
  if (productsGrid) {
    renderProducts();
    refreshProducts();
  }
  loadFestival();
  initRakhiCountdown();
  initWhatsAppWidget();
  initMobileNav();
  initWishButton();
  initWishDrawer();
  initTrackPage();
  renderReviewSection();
  wireReviewForm();
  renderRecent();
  const productId = document.body && document.body.getAttribute("data-product-id");
  if (productId) trackRecent(productId);
})();

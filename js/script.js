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

  const PAGE_CATEGORY = window.PAGE_CATEGORY || null;

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
    return CURRENCY + n.toLocaleString("en-IN");
  }

  function escAttr(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  let festivalDiscount = 0;

  function effPrice(p) {
    return festivalDiscount > 0 ? Math.round((p.price * (100 - festivalDiscount)) / 100) : p.price;
  }

  function effOldPrice(p) {
    if (festivalDiscount <= 0 || !p.oldPrice) return p.oldPrice || 0;
    return Math.round((p.oldPrice * (100 - festivalDiscount)) / 100);
  }

  function countItems() {
    return Object.values(cart).reduce((sum, q) => sum + q, 0);
  }

  function updateBadge() {
    const n = countItems();
    cartBadge.textContent = n;
    cartBadge.classList.toggle("hidden", n === 0);
  }

  function cartTotal() {
    return Object.entries(cart).reduce((sum, [id, q]) => {
      const p = PRODUCTS.find((x) => x.id === Number(id));
      return sum + (p ? effPrice(p) * q : 0);
    }, 0);
  }

  function festivalSaving() {
    if (festivalDiscount <= 0) return 0;
    return Object.entries(cart).reduce((sum, [id, q]) => {
      const p = PRODUCTS.find((x) => x.id === Number(id));
      return sum + (p ? (p.price - effPrice(p)) * q : 0);
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
      const p = PRODUCTS.find((x) => x.id === Number(id));
      if (!p) return "";
      return `
        <div class="os-row">
          <span class="os-name">${p.name} <span class="os-muted">&times; ${cart[id]}</span></span>
          <span class="os-muted">${formatPrice(effPrice(p) * cart[id])}</span>
        </div>
      `;
    }).join("");
    const saving = festivalSaving();
    checkoutTotal.textContent = formatPrice(cartTotal());
    checkoutTotal.previousElementSibling.textContent = saving > 0 ? `Total to pay (${festivalDiscount}% off)` : "Total to pay";
  }

  async function submitOrder() {
    const items = Object.entries(cart).map(([id, qty]) => {
      const p = PRODUCTS.find((x) => x.id === Number(id));
      return { id: Number(id), name: p.name, qty, price: effPrice(p) };
    });

    const name = $("#oName").value.trim();
    const phone = $("#oPhone").value.trim();
    const address = $("#oAddress").value.trim();
    const city = $("#oCity").value.trim();
    const state = $("#oState").value.trim();
    const pincode = $("#oPincode").value.trim();
    const payment = document.querySelector('input[name="payment"]:checked')?.value || "Cash on Delivery";
    const shippingAddress = [address, city, state, "PIN " + pincode].filter(Boolean).join(", ");

    if (!name || !phone || !address || !city || !state || !pincode || items.length === 0) {
      toast("Please fill in all details and try again.");
      return;
    }

    let vid = "";
    try { vid = localStorage.getItem("giftora_vid") || ""; } catch {}

    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = "Placing order...";

    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, address: shippingAddress, payment, items, total: cartTotal(), vid }),
      }).then((r) => r.json());

      if (!res.success) {
        throw new Error(res.message || "Order failed");
      }

      successOrderId.textContent = "#" + res.orderId;
      checkoutForm.style.display = "none";
      checkoutSuccess.hidden = false;
      cart = {};
      saveCart();
      updateBadge();
      renderCart();
    } catch {
      toast("Could not reach the server. Please try again.");
    } finally {
      placeOrderBtn.disabled = false;
      placeOrderBtn.textContent = "Place Order";
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

  const paymentMethods = document.getElementById("paymentMethods");
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
    if (!window.GIFT_PRODUCT_PAGES) return null;
    const slug = slugify(p.name);
    return window.GIFT_PRODUCT_PAGES.includes(slug) ? "products/" + slug + ".html" : null;
  }

  function renderProducts() {
    if (!productsGrid) return;
    const query = searchQuery.trim().toLowerCase();
    const list = PRODUCTS.filter((p) => {
      const matchPage = !PAGE_CATEGORY
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
      return `
      <article class="product-card reveal">
        <div class="product-media" style="background:${p.gradient || "#f1f5f9"}">
          ${badge ? `<span class="product-badge${badge === "Premium" ? " premium" : ""}">${badge}</span>` : ""}
          ${p.image
            ? `${productPageUrl(p) ? `<a class="product-card-link" href="${productPageUrl(p)}" aria-label="View ${p.name}"><img class="product-img" src="${p.image}" alt="${p.name}" loading="lazy"></a>` : `<img class="product-img" src="${p.image}" alt="${p.name}" loading="lazy">`}`
            : `${productPageUrl(p) ? `<a class="product-card-link" href="${productPageUrl(p)}" aria-label="View ${p.name}"><span class="product-emoji">${p.emoji || "🎁"}</span></a>` : `<span class="product-emoji">${p.emoji || "🎁"}</span>`}`}
        </div>
        <div class="product-info">
          <span class="product-category">${p.category}</span>
          ${productPageUrl(p)
            ? `<a class="product-card-link" href="${productPageUrl(p)}"><h3 class="product-name">${p.name}</h3></a>`
            : `<h3 class="product-name">${p.name}</h3>`}
          <div class="product-price">
            <span class="price">${formatPrice(effPrice(p))}</span>
            ${p.oldPrice ? `<span class="old-price">${formatPrice(effOldPrice(p))}</span>` : ""}
          </div>
          <button class="add-to-cart" data-id="${p.id}">Add to Cart</button>
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

  function addToCart(id) {
    const p = PRODUCTS.find((x) => x.id === id);
    if (!p) return;
    cart[id] = (cart[id] || 0) + 1;
    saveCart();
    updateBadge();
    toast(`${p.name} added to cart`);
    animateCartBtn();
  }

  window.Giftora = {
    addToCart: (id) => addToCart(Number(id)),
    addToCartQty: (id, qty) => {
      const p = PRODUCTS.find((x) => x.id === Number(id));
      if (!p) return;
      const n = Math.max(1, parseInt(qty, 10) || 1);
      cart[Number(id)] = (cart[Number(id)] || 0) + n;
      saveCart();
      updateBadge();
      toast(`${p.name} added to cart`);
      animateCartBtn();
    },
    openCart,
  };

  function animateCartBtn() {
    cartBtn.style.transform = "scale(1.15)";
    setTimeout(() => (cartBtn.style.transform = ""), 200);
  }

  function changeQty(id, delta) {
    const next = (cart[id] || 0) + delta;
    if (next <= 0) delete cart[id];
    else cart[id] = next;
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
      const p = PRODUCTS.find((x) => x.id === Number(id));
      if (!p) return "";
      return `
        <div class="cart-item">
          <div class="cart-item-thumb" style="background:${p.gradient}">${p.emoji}</div>
          <div class="cart-item-info">
            <p class="cart-item-name">${p.name}</p>
            <p class="cart-item-price">${formatPrice(effPrice(p))}</p>
            <div class="cart-item-qty">
              <button class="qty-btn" data-action="dec" data-id="${p.id}">−</button>
              <span>${cart[id]}</span>
              <button class="qty-btn" data-action="inc" data-id="${p.id}">+</button>
            </div>
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

  /* ---------- Event wiring ---------- */
  if (productsGrid) {
    productsGrid.addEventListener("click", (e) => {
      const btn = e.target.closest(".add-to-cart");
      if (btn) addToCart(Number(btn.dataset.id));
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
      if (festivalDiscount > 0 && productsGrid) renderProducts();
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

  observeReveals();
  updateBadge();
  if (productsGrid) {
    renderProducts();
    refreshProducts();
  }
  loadFestival();
})();

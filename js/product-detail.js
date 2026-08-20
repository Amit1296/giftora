(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const PAGE_NAMES = {
    clothes: "Clothes",
    shoes: "Shoes",
    teddy: "Teddy Bears",
    sunglasses: "Sunglasses",
    caps: "Caps & Hats",
    belts: "Belts",
    flowers: "Flowers",
    plants: "Plants",
    cakes: "Cakes",
    toys: "Toys",
    combo: "Combo Offers",
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fmtPrice(n) {
    return "₹" + Number(n || 0).toLocaleString("en-IN");
  }

  function slugify(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function productPageUrl(p) {
    const dynamic = "product.html?id=" + p.id;
    if (!window.GIFT_PRODUCT_PAGES) return dynamic;
    const slug = slugify(p.name);
    return window.GIFT_PRODUCT_PAGES.includes(slug) ? "products/" + slug + ".html" : dynamic;
  }

  function catFile(cat) {
    const map = { clothes: "clothes", shoes: "shoes", teddy: "teddy", sunglasses: "sunglasses", caps: "caps", belts: "belts", flowers: "flowers", plants: "plants", cakes: "cakes", toys: "toys", combo: "combo" };
    return map[cat] || null;
  }

  async function loadJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    return res.json();
  }

  let festivalDiscount = 0;
  let festivalProductIds = new Set();

  function effPrice(p, price) {
    const on = festivalDiscount > 0 && (festivalProductIds.size === 0 || festivalProductIds.has(p.id));
    return on ? Math.round((price * (100 - festivalDiscount)) / 100) : price;
  }

  function stockOf(p) {
    return p && typeof p.stock === "number" && p.stock >= 0 ? p.stock : Infinity;
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

  function sizeBtnsHtml(p, selected) {
    if (!p.sizes || !p.sizes.length) return "";
    return `
      <div class="size-selector" role="group" aria-label="Select size">
        <span class="size-label">Size:</span>
        ${p.sizes.map((s, i) => {
          const price = hasSizePrices(p) && p.sizePrices[s] != null ? Number(p.sizePrices[s]) : null;
          return `<button type="button" class="size-btn${i === 0 ? " selected" : ""}" data-size="${esc(s)}"${price != null ? ` data-price="${price}"` : ""}>${esc(s)}${price != null ? `<span class="size-btn-price">${fmtPrice(price)}</span>` : ""}</button>`;
        }).join("")}
      </div>`;
  }

  function renderDetail(p, festival) {
    const detail = $("#productDetail");
    const crumb = $("#productCrumbCat");
    const media = p.image
      ? `<img class="product-detail-img" src="${p.image}" alt="${esc(p.name)}">`
      : `<span class="product-detail-emoji">${p.emoji || "🎁"}</span>`;
    const stock = stockOf(p);
    const oos = stock <= 0;
    const low = !oos && stock !== Infinity && stock <= 5;
    const stockLine = oos
      ? `<p class="stock-line out">Out of stock</p>`
      : low
        ? `<p class="stock-line low">Only ${stock} left in stock</p>`
        : `<p class="stock-line ok">In stock</p>`;
    const price = effPrice(p, basePrice(p, defaultSize(p)));
    const showOld = !!p.oldPrice && (!hasSizePrices(p) || Number(p.sizePrices[defaultSize(p)]) === Number(p.price));
    const oldPrice = showOld ? effPrice(p, p.oldPrice) : 0;
    const isFest = festival && festival.active && (festivalProductIds.size === 0 || festivalProductIds.has(p.id));
    const addBtn = oos
      ? `<button class="add-to-cart" id="addToCartBtn" disabled>Out of Stock</button>`
      : `<button class="add-to-cart" id="addToCartBtn">Add to Cart</button>`;

    crumb.textContent = PAGE_NAMES[p.category] || p.category;

    detail.innerHTML = `
      <div class="product-detail-media" style="background:${p.gradient || "#f1f5f9"}">${media}</div>
      <div class="product-detail-info">
        <span class="product-category">${esc(PAGE_NAMES[p.category] || p.category)}</span>
        <h1>${esc(p.name)}</h1>
        <div class="product-price">
          <span class="price" id="detailPrice">${fmtPrice(price)}</span>
          ${oldPrice ? `<span class="old-price" id="detailOldPrice">${fmtPrice(oldPrice)}</span>` : ""}
        </div>
        ${isFest && festival.discount ? `<p class="stock-line ok">Festival offer: ${festival.discount}% off applied</p>` : ""}
        ${stockLine}
        ${p.description ? `<p class="product-detail-desc">${esc(p.description)}</p>` : ""}
        ${sizeBtnsHtml(p)}
        <div class="product-detail-actions">
          <div class="qty-selector" data-id="${p.id}">
            <button type="button" data-action="dec" aria-label="Decrease quantity">−</button>
            <span>1</span>
            <button type="button" data-action="inc" aria-label="Increase quantity">+</button>
          </div>
          ${addBtn}
        </div>
        <div class="product-perks">
          <span>🚚 Same-day delivery</span>
          <span>🎁 Free gift wrapping</span>
        </div>
      </div>`;

    let qty = 1;
    const qtySel = detail.querySelector(".qty-selector");
    const qtyEl = qtySel && qtySel.querySelector("span");
    if (qtySel) {
      qtySel.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        qty = Math.max(1, Math.min(50, qty + (btn.dataset.action === "inc" ? 1 : -1)));
        qtyEl.textContent = qty;
      });
    }

    let size = "";
    const sizeSel = detail.querySelector(".size-selector");
    const detailPrice = document.getElementById("detailPrice");
    const detailOldPrice = document.getElementById("detailOldPrice");
    if (sizeSel) {
      const btns = sizeSel.querySelectorAll(".size-btn");
      btns.forEach((b) => {
        b.addEventListener("click", () => {
          btns.forEach((x) => x.classList.remove("selected"));
          b.classList.add("selected");
          size = b.dataset.size;
          if (detailPrice) {
            const sp = basePrice(p, size);
            detailPrice.textContent = fmtPrice(effPrice(p, sp));
          }
          if (detailOldPrice) {
            const onBase = !hasSizePrices(p) || Number(p.sizePrices[size]) === Number(p.price);
            detailOldPrice.style.display = onBase && p.oldPrice ? "" : "none";
          }
        });
      });
      size = btns.length ? btns[0].dataset.size : "";
    }

    const addBtnEl = $("#addToCartBtn");
    if (addBtnEl && !addBtnEl.disabled) {
      addBtnEl.addEventListener("click", () => {
        if (window.Giftora && window.Giftora.addToCartQty) {
          window.Giftora.addToCartQty(p.id, qty, size);
        }
      });
    }

    document.title = `${p.name} — Buy Online at Giftora`;
    const og = document.querySelector('meta[property="og:title"]');
    if (og) og.setAttribute("content", document.title);
  }

  function relatedHtml(list, currentId) {
    return list
      .filter((p) => p.id !== currentId)
      .slice(0, 4)
      .map((p) => {
        const stock = stockOf(p);
        const oos = stock <= 0;
        const low = !oos && stock !== Infinity && stock <= 5;
        const price = effPrice(p, p.price);
        const oldPrice = p.oldPrice ? effPrice(p, p.oldPrice) : 0;
        const href = productPageUrl(p);
        const media = p.image
          ? `<a class="product-card-link" href="${href}" aria-label="View ${esc(p.name)}"><img class="product-img" src="${p.image}" alt="${esc(p.name)}" loading="lazy"></a>`
          : `<a class="product-card-link" href="${href}" aria-label="View ${esc(p.name)}"><span class="product-emoji">${p.emoji || "🎁"}</span></a>`;
        return `
        <article class="product-card reveal">
          <div class="product-media" style="background:${p.gradient || "#f1f5f9"}">
            ${p.badge ? `<span class="product-badge${p.badge === "Premium" ? " premium" : ""}">${p.badge}</span>` : ""}
            ${media}
          </div>
          <div class="product-info">
            <span class="product-category">${esc(PAGE_NAMES[p.category] || p.category)}</span>
            <a class="product-card-link" href="${href}"><h3 class="product-name">${esc(p.name)}</h3></a>
            <div class="product-price">
              <span class="price">${fmtPrice(price)}</span>
              ${oldPrice ? `<span class="old-price">${fmtPrice(oldPrice)}</span>` : ""}
            </div>
            ${low ? `<span class="stock-note">Only ${stock} left</span>` : ""}
            <div class="product-buy">
              ${oos
                ? `<button class="add-to-cart" disabled>Out of Stock</button>`
                : `<button class="add-to-cart" data-id="${p.id}">Add to Cart</button>`}
            </div>
          </div>
        </article>`;
      })
      .join("");
  }

  async function init() {
    const params = new URLSearchParams(location.search);
    const id = Number(params.get("id"));
    try {
      const [prodData, festData] = await Promise.all([loadJSON("/api/products"), loadJSON("/api/festival")]);
      const products = (prodData && prodData.products) || window.GIFT_PRODUCTS || [];
      if (window.Giftora && window.Giftora.updateCatalog) window.Giftora.updateCatalog(products);
      const festival = festData && festData.festival;
      festivalDiscount = festival && festival.active ? (Number(festival.discount) || 0) : 0;
      festivalProductIds = festival && festival.active && Array.isArray(festival.productIds) ? new Set(festival.productIds.map(Number)) : new Set();

      const p = products.find((x) => x.id === id);
      if (!p) {
        $("#productDetail").innerHTML = '<p class="empty-state">Product not found.</p>';
        return;
      }
      renderDetail(p, festival);
      const grid = $("#relatedGrid");
      if (grid) {
        const same = products.filter((x) => x.category === p.category);
        const others = products.filter((x) => x.category !== p.category);
        grid.innerHTML = relatedHtml([...same, ...others], p.id);
        requestAnimationFrame(() => {
          const io = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
              if (e.isIntersecting) {
                e.target.classList.add("visible");
                io.unobserve(e.target);
              }
            });
          }, { threshold: 0.12 });
          $$(".reveal:not(.visible)").forEach((el) => io.observe(el));
        });
        grid.addEventListener("click", (e) => {
          const btn = e.target.closest(".add-to-cart[data-id]");
          if (btn && !btn.disabled && window.Giftora) {
            const relId = Number(btn.dataset.id);
            const relProduct = products.find((x) => x.id === relId);
            const relSize = relProduct && relProduct.sizes && relProduct.sizes.length ? relProduct.sizes[0] : "";
            window.Giftora.addToCart(relId, relSize);
          }
        });
      }
    } catch (e) {
      $("#productDetail").innerHTML = '<p class="empty-state">Could not load the product.</p>';
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

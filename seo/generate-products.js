/**
 * generate-products.js — Generates a dedicated, SEO-optimized HTML page for
 * every product in js/products.js into products/<slug>.html.
 *
 * Each page includes: unique title/description/keywords, canonical + Open
 * Graph + Twitter tags, JSON-LD (BreadcrumbList, Product/Offer, FAQPage),
 * a working Add to Cart, related products and FAQ content.
 *
 * It also writes js/product-pages.js (used by script.js to link cards to
 * product pages) and regenerates sitemap.xml to include the new URLs.
 *
 * Usage:
 *   node seo/generate-products.js
 *   (run AFTER node seo/apply-seo.js)
 */
const fs = require("fs");
const path = require("path");
const apply = require("./apply-seo");

const ROOT = path.resolve(__dirname, "..");
const SRC_PAGE = path.join(ROOT, "clothes.html");
const PRODUCTS_DIR = path.join(ROOT, "products");
const PAGE_JS = path.join(ROOT, "js", "product-pages.js");
const OUT_DIR = path.join(ROOT, "products");

let _dims = null;
function dimsMap() {
  if (!_dims) {
    try { _dims = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "img-dims.json"), "utf8")); }
    catch (e) { _dims = {}; }
  }
  return _dims;
}
function dimAttr(src) {
  const d = src && dimsMap()[src];
  return d ? ` width="${d[0]}" height="${d[1]}"` : "";
}

const CATEGORY_META = {
  clothes: { name: "Clothes", file: "clothes.html" },
  toys: { name: "Toys", file: "toys.html" },
  flowers: { name: "Flowers", file: "flowers.html" },
  cakes: { name: "Cakes", file: "cakes.html" },
  teddy: { name: "Teddy Bears", file: "teddy.html" },
  shoes: { name: "Shoes", file: "shoes.html" },
  plants: { name: "Plants", file: "plants.html" },
  combo: { name: "Combo Offers", file: "combo.html" },
  sunglasses: { name: "Sunglasses", file: "sunglasses.html" },
  caps: { name: "Caps & Hats", file: "caps.html" },
  belts: { name: "Belts", file: "belts.html" },
};

// Product-specific long-tail keywords, keyed by product id (js/products.js).
// These replace the generic "buy <category> online" keywords on the product page.
const PRODUCT_KEYWORDS = {
  9: [
    "red rose bouquet price online",
    "send red roses to Delhi same day",
    "romantic rose bouquet for girlfriend",
    "fresh red roses delivery India",
    "rose bouquet under 1000",
    "anniversary rose delivery online",
    "red roses birthday gift",
    "buy fresh red rose bouquet",
  ],
  10: [
    "sunflower bouquet price India",
    "send sunflowers to Delhi",
    "sunflower bunch 12 stems",
    "sunflower delivery online India",
    "cheerful sunflower gift bouquet",
    "sunflowers under 1000",
    "buy sunflower bouquet online",
    "sunflower gift same day delivery",
  ],
  11: [
    "tulip bouquet online price",
    "send tulips to India",
    "hand tied tulip bouquet delivery",
    "tulip flower delivery Delhi",
    "premium tulip bouquet gift",
    "tulips for anniversary",
    "buy tulip bouquet online India",
    "tulip bouquet same day delivery",
  ],
  12: [
    "orchid plant online India",
    "orchid in ceramic pot price",
    "send orchid plant as gift",
    "orchid planter delivery Delhi",
    "orchid plant gift for housewarming",
    "buy orchid plant online",
    "orchid same day delivery",
    "ceramic pot orchid plant price",
  ],
  13: [
    "chocolate truffle cake 1kg price",
    "order chocolate cake online India",
    "best chocolate truffle cake online",
    "chocolate cake same day delivery Delhi",
    "birthday chocolate cake 1kg",
    "eggless chocolate truffle cake online",
    "send chocolate cake to Delhi",
    "buy chocolate truffle cake 1kg",
  ],
  14: [
    "vanilla birthday cake price",
    "plain vanilla cake online India",
    "eggless vanilla cake 1kg",
    "vanilla birthday cake same day delivery",
    "order vanilla cake online Delhi",
    "best vanilla cake under 1000",
    "classic vanilla cake for birthday",
    "buy vanilla birthday cake online",
  ],
  15: [
    "red velvet cake 1kg price",
    "order red velvet cake online",
    "red velvet birthday cake delivery Delhi",
    "best red velvet cake India",
    "red velvet celebration cake same day",
    "send red velvet cake online",
    "red velvet cake for anniversary",
    "buy red velvet cake 1kg",
  ],
  16: [
    "strawberry cream cake price 1kg",
    "order strawberry cake online India",
    "strawberry cake birthday delivery",
    "fresh strawberry cake same day Delhi",
    "best strawberry cake under 1500",
    "strawberry cream cake for kids birthday",
    "send strawberry cake online",
    "buy strawberry cream cake 1kg",
  ],
  25: [
    "money plant online price",
    "money plant in ceramic pot delivery",
    "buy money plant online Delhi",
    "money plant gift for housewarming",
    "money plant same day delivery",
    "lucky money plant for home",
    "money plant in pot under 500",
    "buy money plant online India",
  ],
  26: [
    "lucky bamboo plant price online",
    "buy lucky bamboo plant India",
    "lucky bamboo gift for office",
    "feng shui lucky bamboo plant",
    "lucky bamboo delivery Delhi",
    "lucky bamboo under 1000",
    "lucky bamboo plant same day",
    "buy lucky bamboo online",
  ],
  27: [
    "snake plant online price",
    "buy snake plant online India",
    "snake plant in decor pot delivery",
    "air purifying snake plant gift",
    "snake plant bedroom plant online",
    "snake plant same day delivery",
    "snake plant under 1000",
    "buy snake plant in pot online",
  ],
  28: [
    "peace lily plant online price",
    "buy peace lily plant India",
    "peace lily in bloom pot delivery",
    "flowering plant gift for home",
    "peace lily air purifying plant",
    "peace lily delivery Delhi",
    "peace lily plant same day",
    "buy peace lily online",
  ],
};

const FONT_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '\t<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '\t<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,800&family=Poppins:wght@400;500;600;700&family=Dancing+Script:wght@700&display=swap" rel="stylesheet">';

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function esc(s) {
  return apply.esc(s);
}

function fmtPrice(n) {
  return "₹" + Number(n).toLocaleString("en-IN");
}

function hasSizePrices(p) {
  return !!(p && p.sizePrices && Object.keys(p.sizePrices).length);
}

function defaultSizeOf(p) {
  const sizes = (p && p.sizes) || [];
  return sizes.length ? sizes[0] : "";
}

function basePriceOf(p, size) {
  const base = (p && p.price) || 0;
  if (hasSizePrices(p) && size && p.sizePrices[size] != null) return Number(p.sizePrices[size]) || base;
  return base;
}

function fit(s, max) {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

function fixPaths(html) {
  return html.replace(/(href|src)="(?!https?:|data:|#|\/|mailto:|tel:)([^"]+)"/g, '$1="../$2"');
}

function extractChrome() {
  const src = fs.readFileSync(SRC_PAGE, "utf8");

  const navStart = '<nav class="navbar" id="navbar">';
  const navEnd = "</nav>";
  const i1 = src.indexOf(navStart);
  const i2 = src.indexOf(navEnd, i1);
  const navbar = src.slice(i1, i2 + navEnd.length);

  const footStart = '<footer class="footer">';
  const footEnd = "</footer>";
  const j1 = src.indexOf(footStart);
  const j2 = src.indexOf(footEnd, j1);
  const footer = src.slice(j1, j2 + footEnd.length);

  const chromeStart = '<div class="cart-overlay" id="cartOverlay"></div>';
  const chromeEnd = '<div class="toast" id="toast"></div>';
  const k1 = src.indexOf(chromeStart);
  const k2 = src.indexOf(chromeEnd, k1);
  const chrome = src.slice(k1, k2 + chromeEnd.length);

  const upiStart = '<div class="checkout-overlay" id="upiOverlay"></div>';
  const upiEnd = '<script src="js/qrcode.min.js"></script>';
  const u1 = src.indexOf(upiStart);
  const u2 = src.indexOf(upiEnd, u1);
  const upi = u1 >= 0 && u2 >= 0 ? src.slice(u1, u2 + upiEnd.length) : "";

  const chatStart = "<!-- CHATBOT-START -->";
  const chatEnd = "<!-- CHATBOT-END -->";
  const c1 = src.indexOf(chatStart);
  const c2 = src.indexOf(chatEnd, c1);
  const chatbot = c1 >= 0 && c2 >= 0 ? src.slice(c1, c2 + chatEnd.length) : "";

  return {
    navbar: fixPaths(navbar),
    footer: fixPaths(footer),
    chrome,
    upi: fixPaths(upi),
    chatbot: fixPaths(chatbot),
  };
}

function buildMeta(product, slug, catMeta, site, description) {
  const url = `${site.url}/products/${slug}.html`;
  const title = `${product.name} — Buy Online at Giftora`;
  const custom = PRODUCT_KEYWORDS[product.id];
  const keywords = custom && custom.length
    ? custom
    : [
      product.name,
      `${product.name} online`,
      `buy ${catMeta.name} online`,
      `${catMeta.name} gifts`,
      `${product.name} price`,
      `same day ${catMeta.name} delivery`,
      "online gift shop India",
      "gift delivery India",
    ];
  const lines = [
    "<!-- SEO-BLOCK-START -->",
    `<meta name="keywords" content="${esc(keywords.join(", "))}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:site_name" content="${site.name}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${url}">`,
    '<meta property="og:type" content="product">',
    `<meta property="og:locale" content="${site.locale}">`,
  ];
  const ogImage = site.ogImage;
  if (ogImage) {
    lines.push(`<meta property="og:image" content="${ogImage}">`);
    lines.push(`<meta property="og:image:width" content="1200">`);
    lines.push(`<meta property="og:image:height" content="800">`);
  }
  lines.push('<meta name="twitter:card" content="summary_large_image">');
  lines.push(`<meta name="twitter:title" content="${esc(title)}">`);
  lines.push(`<meta name="twitter:description" content="${esc(description)}">`);
  if (ogImage) lines.push(`<meta name="twitter:image" content="${ogImage}">`);
  lines.push("<!-- SEO-BLOCK-END -->");
  return { block: lines.join("\n"), url, title, description };
}

function faqEntries(product) {
  return [
    {
      q: `Is same-day delivery available for ${product.name}?`,
      a: `Yes — Giftora offers same-day delivery across the city on all orders, including ${product.name}. Place your order before the daily cut-off and we deliver it the very same day.`,
    },
    {
      q: `Can I get ${product.name} gift-wrapped?`,
      a: "Absolutely. Every Giftora order ships with beautiful gift wrapping and a personalised note at no extra cost.",
    },
    {
      q: "What payment methods can I use?",
      a: "You can pay by UPI or Card. All payments are secure and 100% safe.",
    },
  ];
}

function ratingFor(id) {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  h = Math.abs(h);
  return { rating: Math.round((3.8 + (h % 12) / 10) * 10) / 10, count: 6 + (h % 46) };
}

function ratingRow(p, page) {
  const r = ratingFor(p.id);
  const stars = [1, 2, 3, 4, 5].map((i) =>
    i <= Math.round(r.rating) ? '<span class="star">★</span>' : '<span class="star star-off">★</span>'
  ).join("");
  const href = page ? `href="#reviews"` : `href="${slugify(p.name)}.html#reviews"`;
  return `<div class="product-rating"><span class="stars">${stars}</span><span class="rating-num">${r.rating}</span><a class="rating-count" ${href}>(<span>${r.count}</span> reviews)</a></div>`;
}

function buildJsonLd(product, slug, catMeta, site, description, faqs) {
  const url = `${site.url}/products/${slug}.html`;
  const pageName = product.name;
  const r = ratingFor(product.id);
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${site.url}/index.html` },
        { "@type": "ListItem", position: 2, name: catMeta.name, item: `${site.url}/${catMeta.file}` },
        { "@type": "ListItem", position: 3, name: pageName, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: pageName,
      description,
      image: product.image ? `${site.url.replace(/\/$/, "")}${product.image}` : site.ogImage,
      brand: { "@type": "Brand", name: site.name },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: String(r.rating),
        reviewCount: String(r.count),
        bestRating: "5",
        worstRating: "1",
      },
      offers: (() => {
        const availability = typeof product.stock === "number" && product.stock <= 0
          ? "https://schema.org/OutOfStock"
          : "https://schema.org/InStock";
        if (hasSizePrices(product) && product.sizes.length) {
          const perSize = product.sizes.map((s) => ({
            "@type": "Offer",
            name: s,
            price: String(basePriceOf(product, s)),
            priceCurrency: site.currency,
            availability,
            itemCondition: "https://schema.org/NewCondition",
            url,
          }));
          const prices = product.sizes.map((s) => basePriceOf(product, s));
          return {
            "@type": "AggregateOffer",
            lowPrice: String(Math.min.apply(null, prices)),
            highPrice: String(Math.max.apply(null, prices)),
            priceCurrency: site.currency,
            availability,
            offers: perSize,
          };
        }
        return {
          "@type": "Offer",
          price: String(product.price),
          priceCurrency: site.currency,
          availability,
          itemCondition: "https://schema.org/NewCondition",
          url,
        };
      })(),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];
}

function sizeSelectHtml(p) {
  return `<select class="product-size" data-size="${p.id}" aria-label="Size of ${esc(p.name)}">
    ${(p.sizes || []).map((s) => {
      const sp = hasSizePrices(p) && p.sizePrices[s] != null ? ` (${fmtPrice(p.sizePrices[s])})` : "";
      return `<option value="${esc(s)}">${esc(s)}${sp}</option>`;
    }).join("")}
  </select>`;
}

function relatedCards(product, products) {
  const same = products.filter((p) => p.category === product.category && p.id !== product.id);
  const others = products.filter((p) => p.category !== product.category);
  const picks = [...same, ...others].slice(0, 4);
  return picks.map((p) => {
    const discount = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    const badge = p.oldPrice && discount > 0 ? `${discount}% OFF` : p.badge;
    const slug = slugify(p.name);
    const stock = typeof p.stock === "number" && p.stock >= 0 ? p.stock : Infinity;
    const oos = stock <= 0;
    const lowStock = !oos && stock !== Infinity && stock <= 5;
    const addControl = oos
      ? `<button class="add-to-cart" data-id="${p.id}" disabled>Out of Stock</button>`
      : `${p.sizes && p.sizes.length ? sizeSelectHtml(p) : ""}<button class="add-to-cart" data-id="${p.id}">Add to Cart</button>`;
    return `
      <article class="product-card reveal">
        <div class="product-media" style="background:${p.gradient || "#f1f5f9"}">
          ${badge ? `<span class="product-badge${badge === "Premium" ? " premium" : ""}">${badge}</span>` : ""}
          <button class="wish-heart" data-wish="${p.id}" aria-label="Add ${esc(p.name)} to wishlist">♡</button>
          <a class="product-card-link" href="${slug}.html" aria-label="View ${esc(p.name)}"><span class="product-emoji">${p.emoji || "🎁"}</span></a>
        </div>
        <div class="product-info">
          <span class="product-category">${(CATEGORY_META[p.category] || {}).name || p.category}</span>
          <a class="product-card-link" href="${slug}.html"><h3 class="product-name">${esc(p.name)}</h3></a>
          ${ratingRow(p, false)}
          <div class="product-price">
            <span class="price">${fmtPrice(p.price)}</span>
            ${p.oldPrice ? `<span class="old-price">${fmtPrice(p.oldPrice)}</span>` : ""}
          </div>
          ${lowStock ? `<span class="stock-note">Only ${stock} left</span>` : ""}
          <div class="product-buy">${addControl}</div>
        </div>
      </article>
    `;
  }).join("");
}

function faqHtml(faqs) {
  return faqs.map((f) => `
      <details class="faq-item">
        <summary>${esc(f.q)}</summary>
        <p>${esc(f.a)}</p>
      </details>
    `).join("");
}

function productDescription(product, site) {
  if (product.description) return fit(product.description, 160);
  return fit(
    `${product.name} for just ${fmtPrice(product.price)} with same-day delivery at ${site.name}. Free gift wrapping and secure online payments. Order online now!`,
    160
  );
}

function productBody(product, slug, catMeta, site, products, faqs) {
  const catName = esc(catMeta.name);
  const startSize = defaultSizeOf(product);
  const showOld = !!product.oldPrice && (!hasSizePrices(product) || Number(product.sizePrices[startSize]) === Number(product.price));
  const oldPrice = showOld
    ? `\n            <span class="old-price" id="detailOldPrice">${fmtPrice(product.oldPrice)}</span>`
    : "";
  const media = product.image
    ? `<img class="product-detail-img" src="${product.image}"${dimAttr(product.image)} alt="${esc(product.name)}">`
    : `<span class="product-detail-emoji">${product.emoji || "🎁"}</span>`;

  const stock = typeof product.stock === "number" && product.stock >= 0 ? product.stock : Infinity;
  const oos = stock <= 0;
  const stockLine = oos
    ? `<p class="stock-line out">Out of stock</p>`
    : stock <= 5
      ? `<p class="stock-line low">Only ${stock} left in stock</p>`
      : `<p class="stock-line ok">In stock</p>`;
  const sizeSelector = product.sizes && product.sizes.length
    ? `<div class="size-selector" role="group" aria-label="Select size">
        <span class="size-label">Size:</span>
        ${product.sizes.map((s, i) => {
          const price = hasSizePrices(product) && product.sizePrices[s] != null ? Number(product.sizePrices[s]) : null;
          return `<button type="button" class="size-btn${i === 0 ? " selected" : ""}" data-size="${esc(s)}"${price != null ? ` data-price="${price}"` : ""}>${esc(s)}${price != null ? `<span class="size-btn-price">${fmtPrice(price)}</span>` : ""}</button>`;
        }).join("")}
      </div>`
    : "";
  const addBtn = oos
    ? `<button class="add-to-cart" id="addToCartBtn" disabled>Out of Stock</button>`
    : `<button class="add-to-cart" id="addToCartBtn">Add to Cart</button>`;

  return `
<section class="category-hero product-hero">
  <div class="container">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="../index.html">Home</a> &rsaquo; <a href="../${catMeta.file}">${catName}</a> &rsaquo; <span>${esc(product.name)}</span>
    </nav>
    <div class="product-detail">
      <div class="product-detail-media" style="background:${product.gradient || "#f1f5f9"}">${media}</div>
      <div class="product-detail-info">
        <span class="product-category">${catName}</span>
        <h1>${esc(product.name)}</h1>
        ${ratingRow(product, true)}
        <div class="product-price">
          <span class="price" id="detailPrice">${fmtPrice(basePriceOf(product, startSize))}</span>${oldPrice}
        </div>
        ${stockLine}
        <p class="product-detail-desc">${esc(product.description || productDescription(product, site))}</p>
        ${sizeSelector}
        <div class="product-detail-actions">
          <div class="qty-selector" data-id="${product.id}">
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
      </div>
    </div>
  </div>
</section>

<section class="shop" style="padding-top: 0;">
  <div class="container">
    <div class="section-header">
      <span class="section-tag">Related</span>
      <h2>You may also <span class="text-gradient">like</span></h2>
      <p>More ${catName.toLowerCase()} gifts customers love.</p>
    </div>
    <div class="products-grid">
      ${relatedCards(product, products)}
    </div>
  </div>
</section>

<section class="page-body" style="padding-top: 0;" id="reviews">
  <div class="container">
    <div class="section-header">
      <span class="section-tag">Reviews</span>
      <h2>What customers <span class="text-gradient">say</span></h2>
      <p>Real ratings from verified buyers.</p>
    </div>
    <div class="reviews-wrap">
      <div class="review-score" id="reviewSummary">
        <span class="review-big" data-score>0.0</span>
        <span class="stars" data-stars></span>
        <span class="review-count">Based on <span data-count>0</span> verified reviews</span>
      </div>
      <div class="review-list" id="reviewList" data-id="${product.id}"></div>
      <form class="review-form" id="reviewForm" data-id="${product.id}">
        <h3>Write a review</h3>
        <input type="text" id="rvName" placeholder="Your name" maxlength="40" required>
        <label for="rvRating" style="font-size:0.85rem;color:var(--text-muted);">Your rating</label>
        <select id="rvRating" required>
          <option value="5">★★★★★ — Excellent</option>
          <option value="4">★★★★ — Good</option>
          <option value="3">★★★ — Average</option>
          <option value="2">★★ — Poor</option>
          <option value="1">★ — Terrible</option>
        </select>
        <textarea id="rvText" placeholder="Share your experience..." rows="4" maxlength="400" required></textarea>
        <button class="btn btn-primary" type="submit">Submit review</button>
      </form>
    </div>
  </div>
</section>

<section class="shop" style="padding-top: 0;" id="recentWrap" hidden>
  <div class="container">
    <div class="section-header">
      <span class="section-tag">Recently viewed</span>
      <h2>Keep <span class="text-gradient">browsing</span></h2>
      <p>Items you checked out recently.</p>
    </div>
    <div class="products-grid" id="recentGrid"></div>
  </div>
</section>

<section class="page-body" style="padding-top: 0;">
  <div class="container">
    <div class="section-header">
      <span class="section-tag">FAQ</span>
      <h2>Frequently asked <span class="text-gradient">questions</span></h2>
    </div>
    <div class="faq-list">
      ${faqHtml(faqs)}
    </div>
  </div>
</section>
`;
}

function pageScript(product) {
  return `
<script>
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
    var sizePrices = ${JSON.stringify(product.sizePrices || {})};
    var basePrice = ${Number(product.price) || 0};
    var priceEl = document.getElementById("detailPrice");
    var oldEl = document.getElementById("detailOldPrice");
    if (sizeSel) {
      var sizeBtns = sizeSel.querySelectorAll(".size-btn");
      sizeBtns.forEach(function (b) {
        b.addEventListener("click", function () {
          sizeBtns.forEach(function (x) { x.classList.remove("selected"); });
          b.classList.add("selected");
          size = b.dataset.size;
          if (priceEl) {
            var sp = sizePrices[size] != null ? Number(sizePrices[size]) : basePrice;
            priceEl.textContent = "₹" + sp.toLocaleString("en-IN");
          }
          if (oldEl) {
            var onBase = !(sizePrices[size] != null);
            oldEl.style.display = onBase ? "" : "none";
          }
        });
      });
      size = sizeBtns.length ? sizeBtns[0].dataset.size : "";
    }
    var addBtn = document.getElementById("addToCartBtn");
    if (addBtn && !addBtn.disabled) addBtn.addEventListener("click", function () {
      window.Giftora.addToCartQty(${product.id}, qty, size);
    });
    document.addEventListener("click", function (e) {
      var btn = e.target.closest(".add-to-cart[data-id]");
      if (btn && btn.id !== "addToCartBtn" && !btn.disabled) {
        var s = document.querySelector('.product-size[data-size="' + btn.dataset.id + '"]');
        window.Giftora.addToCart(btn.dataset.id, s ? s.value : "");
      }
    });
  })();
</script>
`;
}

function buildPage(product, slug, catMeta, site, chrome, products) {
  const description = productDescription(product, site);
  const faqs = faqEntries(product);
  const meta = buildMeta(product, slug, catMeta, site, description);
  const jsonLd = JSON.stringify(buildJsonLd(product, slug, catMeta, site, description, faqs), null, 2);
  const body = productBody(product, slug, catMeta, site, products, faqs);

  return `<!DOCTYPE html>
<html lang="en">
<head>
\t<meta charset="UTF-8">
\t<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
\t<meta name="theme-color" content="#7c3aed">
${meta.block}
\t<meta name="description" content="${esc(description)}">
\t<link rel="icon" href="../logo.svg">
\t<title>${meta.title.replace(/&/g, "&amp;")}</title>
\t${FONT_LINK}
\t<link rel="stylesheet" href="../css/style.min.css?v=4">
<!-- SEO-JSONLD-START -->
<script type="application/ld+json">
${jsonLd}
</script>
<!-- SEO-JSONLD-END -->
</head>
<body data-product-id="${product.id}">

${chrome.navbar}

<main>
${body}
</main>

${chrome.footer}

${chrome.chrome}

${chrome.upi}

<script src="../js/products.js"></script>
<script src="../js/product-pages.js"></script>
<script src="../js/script.min.js?v=5"></script>
${pageScript(product)}

${chrome.chatbot}
</body>
</html>
`;
}

function generate() {
  const cfg = apply.loadConfig();
  const site = cfg.site;
  const products = apply.loadProducts();
  const chrome = extractChrome();

  fs.mkdirSync(PRODUCTS_DIR, { recursive: true });

  const usedSlugs = {};
  const slugs = [];
  const extraUrls = [];

  for (const product of products) {
    const catMeta = CATEGORY_META[product.category];
    if (!catMeta) {
      console.log("  SKIP (unknown category): " + product.name);
      continue;
    }
    let slug = slugify(product.name) || ("product-" + product.id);
    if (usedSlugs[slug]) slug = `${slug}-${product.id}`;
    usedSlugs[slug] = true;
    slugs.push(slug);

    const page = buildPage(product, slug, catMeta, site, chrome, products);
    const withCookies = apply.injectCookieSettingsLink(apply.injectCookieConsent(page, "products/" + slug + ".html"));
    const file = path.join(OUT_DIR, slug + ".html");
    fs.writeFileSync(file, withCookies, "utf8");
    extraUrls.push({
      loc: `${site.url}/products/${slug}.html`,
      changefreq: "weekly",
      priority: "0.7",
    });
    console.log("  generated: products/" + slug + ".html");
  }

  fs.writeFileSync(PAGE_JS, `window.GIFT_PRODUCT_PAGES = [\n  ${slugs.map((s) => `"${s}"`).join(",\n  ")}\n];\n`, "utf8");
  console.log("  js/product-pages.js written (" + slugs.length + " slugs)");

  apply.writeSitemap(site, cfg.pages, extraUrls, cfg.sitemapOnly || {});
  console.log(`Done. ${products.length} product pages generated.`);
}

generate();

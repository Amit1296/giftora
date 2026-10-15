// Refresh static product links inside category / occasion / festival page grids.
// Only the marker-guarded list is replaced (or one is inserted before the
// closing tag of an empty #productsGrid), so surrounding markup is preserved.
//
// Why this exists: category and occasion pages populate their product grid from
// js/script.js at runtime, so the raw HTML ships with an empty grid. Crawlers
// that do not execute the grid script see no links to /products/* pages at all,
// which starves those pages of internal discovery signals. This script mirrors
// the exact same catalogue selection the client uses, but as static <a> links.
const fs = require("fs");
const path = require("path");

const ROOT = __dirname + "/..";
const products = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "products.json"), "utf8"));
const list = Array.isArray(products) ? products : products.products || [];

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function productSlugMap(items) {
  const used = new Set();
  const slugs = new Map();
  for (const product of items) {
    let slug = slugify(product.name) || `product-${product.id}`;
    if (used.has(slug)) slug = `${slug}-${product.id}`;
    used.add(slug);
    slugs.set(String(product.id), slug);
  }
  return slugs;
}

/* Mirror of OCCASION_FILTERS in js/script.js so the static links match the
   products the page shows to search engines and to visitors with JS on. */
const OCCASION_FILTERS = {
  "birthday-gifts": ["combo", "cakes", "flowers", "teddy", "toys"],
  "anniversary-gifts": ["combo", "cakes", "flowers", "teddy"],
  "wedding-gifts": ["combo", "flowers", "plants"],
  "housewarming-gifts": ["plants", "combo", "flowers"],
  "baby-shower-gifts": ["teddy", "toys", "combo"],
  "corporate-gifts": ["combo", "plants"],
  "congratulations-gifts": ["combo", "cakes", "flowers", "teddy"],
  "thank-you-gifts": ["flowers", "cakes", "combo", "plants"],
  "engagement-gifts": ["flowers", "cakes", "combo", "teddy"],
  "graduation-gifts": ["combo", "cakes", "flowers", "toys"],
  "teachers-day-gifts": ["flowers", "cakes", "plants", "combo", "teddy"],
  "gifts-for-men": ["shoes", "belts", "sunglasses", "clothes"],
  "gifts-for-women": ["jewellery", "flowers", "teddy", "sunglasses"],
  "gifts-for-kids": ["toys", "teddy"],
  "gifts-for-girlfriend": ["flowers", "cakes", "combo", "teddy"],
};

const MARKER = "static:product-links";
/* No cap: the previous behaviour listed the whole matching range, and trimming
   it would silently drop internal links that crawlers rely on. */
const MAX_LINKS = Infinity;
const slugs = productSlugMap(list);

/* Each entry yields a list of real catalogue products (each item must have a
   static file on disk). `cat` = single catalogue category, `cats` = list. */
const PAGES = [
  { file: "belts.html", cat: "belts" },
  { file: "cakes.html", cat: "cakes" },
  { file: "clothes.html", cat: "clothes" },
  { file: "combo.html", cat: "combo" },
  { file: "flowers.html", cat: "flowers" },
  { file: "plants.html", cat: "plants" },
  { file: "shoes.html", cat: "shoes" },
  { file: "sunglasses.html", cat: "sunglasses" },
  { file: "teddy.html", cat: "teddy" },
  { file: "toys.html", cat: "toys" },
  { file: "special-offers.html", cat: "special" },
  // Jewellery ships no gender field, so the men/women split in the client drops
  // every product. List the whole (small) range in the "for her" grid.
  { file: "jewellery.html", cat: "jewellery", marker: MARKER + "-women" },
  ...Object.keys(OCCASION_FILTERS).map((occ) => ({ file: occ + ".html", cats: OCCASION_FILTERS[occ] })),
  // Festival hub pages render every active festival product; mirror the
  // hamper / festive subset so the raw HTML still links to real products.
  { file: "festival.html", match: /rocher|hamper|dry.?fruit|soan|diya|diwali|rakhi|karwa|combo|chocolate|orchid|basket/i },
  { file: "deepawali-gifts.html", match: /rocher|hamper|dry.?fruit|soan|diya|diwali|combo|chocolate|basket/i },
  { file: "karwa-chauth-gifts.html", match: /karwa|chauth|rocher|hamper|ring|combo|basket|chocolate/i },
];

function selectProducts(page) {
  let pool;
  if (page.match) {
    pool = list.filter((p) => page.match.test(p.name));
  } else if (page.cats) {
    pool = list.filter((p) => page.cats.includes(String(p.category)));
  } else if (page.cat === "special") {
    pool = list.filter((p) => p.oldPrice > 0);
  } else if (page.cat) {
    pool = list.filter((p) => String(p.category) === page.cat);
  } else {
    pool = [];
  }

  const clean = [];
  const seen = new Set();
  for (const p of pool) {
    const slug = slugs.get(String(p.id));
    if (!slug || seen.has(slug)) continue;
    if (!fs.existsSync(path.join(ROOT, "products", slug + ".html"))) {
      console.log("  WARN skip (no file): products/" + slug + ".html");
      continue;
    }
    seen.add(slug);
    clean.push({ name: p.name, href: "products/" + slug + ".html" });
    if (clean.length >= MAX_LINKS) break;
  }
  return clean;
}

let totalPages = 0, totalLinks = 0;

for (const page of PAGES) {
  const filePath = path.join(ROOT, page.file);
  let html;
  try { html = fs.readFileSync(filePath, "utf8"); }
  catch (e) { console.log("SKIP (missing): " + page.file); continue; }

  const original = html;
  const marker = page.marker || MARKER;
  const clean = selectProducts(page);
  if (clean.length === 0) {
    console.log("SKIP (" + page.file + ": 0 matching products)");
    continue;
  }

  const links = clean
    .map((p) => '\t\t\t\t<li><a href="' + p.href + '">' + esc(p.name) + "</a></li>")
    .join("\n");

  /* Inline styles keep the crawler-visible list tidy before js/script.js
     replaces the grid, without needing a stylesheet change + cache bump. */
  const block =
    '\t\t\t<!-- ' + marker + ' -->\n' +
    '\t\t\t<ul class="static-product-links" data-nosnippet ' +
    'style="grid-column:1/-1;list-style:none;display:flex;flex-wrap:wrap;' +
    'gap:.5rem .9rem;padding:0;margin:0">\n' +
    links + "\n" +
    "\t\t\t</ul>\n\t\t\t<!-- /" + marker + " -->";

  const blockRe = new RegExp("[\\t ]*<!-- " + marker + " -->[\\s\\S]*?<!-- /" + marker + " -->");
  if (blockRe.test(html)) {
    html = html.replace(blockRe, block);
  } else {
    const gridRe = /<div class="products-grid" id="productsGrid"><\/div>/;
    if (!gridRe.test(html)) { console.log("SKIP (" + page.file + ": grid not found)"); continue; }
    html = html.replace(gridRe, (m) => m.replace("</div>", block + "\n\t\t\t</div>"));
  }

  if (html !== original) {
    fs.writeFileSync(filePath, html, "utf8");
    console.log("UPDATED " + page.file + " (" + clean.length + " links)");
  } else {
    console.log("UNCHANGED " + page.file + " (" + clean.length + " links)");
  }
  totalPages++;
  totalLinks += clean.length;
}

console.log("Done: " + totalPages + " pages, " + totalLinks + " links.");

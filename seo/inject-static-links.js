// Refresh static product links inside category page grids.
// Only the marker-guarded list is replaced; surrounding markup is preserved.
const fs = require("fs");
const path = require("path");

const ROOT = __dirname + "/..";
const products = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "products.json"), "utf8"));

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function productSlugMap(products) {
  const used = new Set();
  const slugs = new Map();
  for (const product of products) {
    let slug = slugify(product.name) || `product-${product.id}`;
    if (used.has(slug)) slug = `${slug}-${product.id}`;
    used.add(slug);
    slugs.set(String(product.id), slug);
  }
  return slugs;
}

const CATEGORY_PAGES = [
  ["belts.html", "belts"],
  ["cakes.html", "cakes"],
  ["caps.html", "caps"],
  ["clothes.html", "clothes"],
  ["combo.html", "combo"],
  ["flowers.html", "flowers"],
  // Jewellery renders two grids (for him / for her), so it uses one
  // gender-suffixed marker per grid instead of the single default marker.
  ["jewellery.html", "jewellery", { genderSplit: true }],
  ["plants.html", "plants"],
  ["special-offers.html", "special"],
  ["shoes.html", "shoes"],
  ["sunglasses.html", "sunglasses"],
  ["teddy.html", "teddy"],
  ["toys.html", "toys"],
];

const MARKER = "static:product-links";
const slugs = productSlugMap(products);
let totalPages = 0, totalLinks = 0;

for (const [file, cat, opts] of CATEGORY_PAGES) {
  const filePath = path.join(ROOT, file);
  let html;
  try { html = fs.readFileSync(filePath, "utf8"); }
  catch (e) { console.log("SKIP (missing): " + file); continue; }

  const original = html;
  const targets = opts && opts.genderSplit
    ? ["men", "women"].map((g) => ({ marker: MARKER + "-" + g, gender: g }))
    : [{ marker: MARKER }];
  let pageLinks = 0;

  for (const target of targets) {
    const list = products.filter((p) => {
      const inCategory = cat === "special" ? p.oldPrice > 0 : String(p.category) === cat;
      return inCategory && (!target.gender || p.gender === target.gender);
    });

    const clean = [];
    for (const p of list) {
      const slug = slugs.get(String(p.id));
      const href = "products/" + slug + ".html";
      if (fs.existsSync(path.join(ROOT, href))) {
        clean.push({ name: p.name, href });
      } else {
        console.log("  WARN skip (no file): " + href);
      }
    }
    if (clean.length === 0) {
      console.log("SKIP (" + target.marker + ": 0 links) in " + file);
      continue;
    }

    const links = clean.map((p) =>
      '\t\t\t\t<li><a href="' + p.href + '">' + esc(p.name) + "</a></li>"
    ).join("\n");

    const block =
      '\t\t\t<!-- ' + target.marker + ' -->\n' +
      '\t\t\t<ul class="static-product-links">\n' +
      links + "\n" +
      "\t\t\t</ul>\n\t\t\t<!-- /" + target.marker + " -->";

    const blockRe = new RegExp("[\\t ]*<!-- " + target.marker + " -->[\\s\\S]*?<!-- /" + target.marker + " -->");
    if (blockRe.test(html)) {
      html = html.replace(blockRe, block);
    } else {
      const gridRe = /<div class="products-grid" id="productsGrid"><\/div>/;
      if (!gridRe.test(html)) { console.log("SKIP (" + target.marker + ": grid not found) in " + file); continue; }
      html = html.replace(gridRe, (m) => m.replace("</div>", block + "\n\t\t\t</div>"));
    }
    pageLinks += clean.length;
  }

  if (html !== original) {
    fs.writeFileSync(filePath, html, "utf8");
    console.log("UPDATED " + file + " (" + pageLinks + " links)");
  } else {
    console.log("UNCHANGED " + file + " (" + pageLinks + " links)");
  }
  totalPages++;
  totalLinks += pageLinks;
}

console.log("Done: " + totalPages + " pages, " + totalLinks + " links.");
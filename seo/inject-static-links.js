// One-time helper: inject static product links into category page grids.
// Additive only - never removes/alters existing markup. Idempotent (marker-guarded).
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

const CATEGORY_PAGES = [
  ["belts.html", "belts"],
  ["cakes.html", "cakes"],
  ["caps.html", "caps"],
  ["clothes.html", "clothes"],
  ["combo.html", "combo"],
  ["flowers.html", "flowers"],
  ["plants.html", "plants"],
  ["special-offers.html", "special"],
  ["shoes.html", "shoes"],
  ["sunglasses.html", "sunglasses"],
  ["teddy.html", "teddy"],
  ["toys.html", "toys"],
];

const MARKER = "static:product-links";
let totalPages = 0, totalLinks = 0;

for (const [file, cat] of CATEGORY_PAGES) {
  const filePath = path.join(ROOT, file);
  let html;
  try { html = fs.readFileSync(filePath, "utf8"); }
  catch (e) { console.log("SKIP (missing): " + file); continue; }

  if (html.includes(`<!-- ${MARKER} -->`)) { console.log("SKIP (already injected): " + file); continue; }

  const list = products.filter((p) =>
    cat === "special" ? p.oldPrice > 0 : String(p.category) === cat
  );

  // Only link products whose static page actually exists on disk.
  const clean = [];
  for (const p of list) {
    const slug = slugify(p.name);
    const href = "products/" + slug + ".html";
    if (fs.existsSync(path.join(ROOT, href))) {
      clean.push({ name: p.name, href });
    } else {
      console.log("  WARN skip (no file): " + href);
    }
  }
  if (clean.length === 0) { console.log("SKIP (0 links): " + file); continue; }

  const gridRe = /<div class="products-grid" id="productsGrid"><\/div>/;
  if (!gridRe.test(html)) { console.log("SKIP (grid not found): " + file); continue; }

  const links = clean.map((p) =>
    '\t\t\t\t<li><a href="' + p.href + '">' + esc(p.name) + "</a></li>"
  ).join("\n");

  const block =
    '\t\t\t<!-- ' + MARKER + ' -->\n' +
    '\t\t\t<ul class="static-product-links">\n' +
    links + "\n" +
    "\t\t\t</ul>\n\t\t\t<!-- /" + MARKER + " -->";

  html = html.replace(gridRe, (m) => m.replace("</div>", block + "\n\t\t\t</div>"));
  fs.writeFileSync(filePath, html, "utf8");
  totalPages++;
  totalLinks += clean.length;
  console.log("INJECTED " + file + " (" + clean.length + " links)");
}

console.log("Done: " + totalPages + " pages, " + totalLinks + " links.");
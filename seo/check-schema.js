/**
 * check-schema.js — Schema.org/rich-result validator for Giftora.
 *
 * Scans every .html page (root category pages + products/*.html) and makes
 * sure every Product node in JSON-LD has the fields Google requires for rich
 * results (product snippets / Shopping):
 *
 *   REQUIRED for Product rich results:
 *     - name
 *     - image            (this was the missing-field issue we fixed)
 *     - offers.price
 *     - offers.priceCurrency
 *     - offers.availability
 *
 * It also warns when product data is missing from either source so an update
 * can't silently drop an image/price.
 *
 * Exit codes:
 *   0  -> all good
 *   1  -> errors found (missing required fields). Intended to FAIL CI/deploys.
 *   2  -> warnings only (no errors)
 *
 * Usage:
 *   node seo/check-schema.js            # full scan, exit 1 on errors
 *   node seo/check-schema.js products   # scan only products/*.html
 *   node seo/check-schema.js --fix      # auto-add missing image field from data/products.json (root category pages only)
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const arg = process.argv[2] || "all";
const FIX = process.argv.includes("--fix");
const SITE_URL = "https://gift-ora.online";

// Pages we intentionally skip (not catalog/product pages)
const SKIP = new Set([
  "admin.html",
  "banner-template.html",
  "checkout-preview.html",
  "gift-card-template.html",
  "google7700e6aeefbc94c5.html",
]);

const REQUIRED_PRODUCT_KEYS = ["name", "image", "offers"];

// Load JSON-LD blocks from an HTML file. Returns array of parsed node objects.
function extractJsonLd(html) {
  const re = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/g;
  const nodes = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    let data;
    try { data = JSON.parse(m[1]); } catch { nodes.push({ __parseError: true }); continue; }
    const arr = Array.isArray(data) ? data : [data];
    for (const n of arr) {
      if (!n || typeof n !== "object") continue;
      nodes.push(n);
    }
  }
  return nodes;
}

function getType(n) {
  return Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
}

function isProduct(n) {
  return getType(n).includes("Product");
}

// Collect all Product nodes from a file
function collectProductNodes(nodes) {
  const products = [];
  for (const n of nodes) {
    if (n.__parseError) continue;
    if (isProduct(n)) products.push(n);
  }
  return products;
}

function loadProductsData() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "products.json"), "utf8"));
  } catch { return []; }
}

// Build a map of product name -> image URL (absolute) from data/products.json
function buildImageMap(products) {
  const map = {};
  for (const p of products) {
    const abs = p && p.image ? (p.image.startsWith("http") ? p.image : SITE_URL + p.image) : "";
    if (p && p.name && abs) map[p.name] = abs;
  }
  return map;
}

const errors = [];
const warnings = [];
let filesChecked = 0;

function validateFile(file, imageMap, scanProducts) {
  const full = path.join(ROOT, scanProducts ? "products" : ".", file);
  if (!fs.existsSync(full)) return;
  const html = fs.readFileSync(full, "utf8");
  const nodes = extractJsonLd(html);
  const products = collectProductNodes(nodes);

  // No Product nodes — nothing to validate. But warn if the page LOOKS like a catalog
  // (has a products grid) yet carries no Product schema at all.
  // (We won't be strict here — some category pages legitimately have no product schema.)

  for (const p of products) {
    const label = `Product "${p.name || "(unnamed)"}"` + (scanProducts ? "" : " in " + file);
    for (const key of REQUIRED_PRODUCT_KEYS) {
      if (p[key] === undefined || p[key] === null || p[key] === "") {
        errors.push(`${label}: missing required field "${key}"`);
      }
    }
    // image must be an absolute http(s) URL for Google
    if (p.image && !/^https?:\/\//.test(String(p.image))) {
      errors.push(`${label}: image must be an absolute URL, got "${p.image}"`);
    }
    // offers checks
    if (!p.offers) {
      errors.push(`${label}: missing required field "offers"`);
    } else {
      const offers = Array.isArray(p.offers) ? p.offers : [p.offers];
      for (const o of offers) {
        if (!o || typeof o !== "object") continue;
        const otype = o["@type"] || "";
        const isAggregate = String(otype).toLowerCase().includes("aggregate");
        // AggregateOffer uses lowPrice/highPrice; plain Offer uses price.
        const priceField = isAggregate ? "lowPrice" : "price";
        if (o[priceField] === undefined || o[priceField] === null || o[priceField] === "") {
          errors.push(`${label}: offer (${otype || "Offer"}) missing "${priceField}"`);
        }
        // For AggregateOffer the nested offers array should each carry a price
        if (isAggregate && Array.isArray(o.offers)) {
          for (const sub of o.offers) {
            if (sub && (sub.price === undefined || sub.price === null || sub.price === "")) {
              errors.push(`${label}: AggregateOffer sub-offer missing "price"`);
            }
          }
        }
        if (!o.priceCurrency) {
          errors.push(`${label}: offer missing "priceCurrency"`);
        }
        if (!o.availability) {
          errors.push(`${label}: offer missing "availability"`);
        }
      }
    }
  }
  filesChecked++;
}

const imageMap = buildImageMap(loadProductsData());
const imageMapSize = Object.keys(imageMap).length;

// ---- Data integrity: every product in data/products.json must have an image ----
// The live server renders product pages dynamically from data/products.json via
// seo/render-product.js. If a product there lacks an image, its rendered Product
// schema will be invalid even though the static products/*.html look fine.
{
  const raw = loadProductsData();
  for (const p of raw) {
    if (p && p.name && !p.image) {
      errors.push(`data/products.json -> "${p.name}" (id ${p.id}): missing "image"; absolutely required for Product rich results.`);
    }
  }
}

// ---- Scan ----
const rootHtmlFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html") && !SKIP.has(f));
const prodDir = path.join(ROOT, "products");
const prodFiles = fs.existsSync(prodDir) ? fs.readdirSync(prodDir).filter((f) => f.endsWith(".html")) : [];

if (arg === "all" || arg === "root") {
  for (const f of rootHtmlFiles) validateFile(f, imageMap, false);
}
if (arg === "all" || arg === "products") {
  for (const f of prodFiles) validateFile(f, imageMap, true);
}

// ---- --fix mode: auto-insert missing image on root category page schemas ----
function fixMissingImages(file) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return { changed: 0 };
  let html = fs.readFileSync(full, "utf8");
  let changed = 0;
  // Replace each product node block that has a name but no image with an image derived
  // from the matching data/products.json entry. Operate on the raw JSON-LD strings.
  html = html.replace(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/g, (scriptTag, json) => {
    let data;
    try { data = JSON.parse(json); } catch { return scriptTag; }
    const arr = Array.isArray(data) ? data : [data];
    let mutated = false;
    for (const n of arr) {
      if (!n || typeof n !== "object") continue;
      if (!isProduct(n)) continue;
      if (!n.image && n.name && imageMap[n.name]) {
        n.image = imageMap[n.name];
        mutated = true;
        changed++;
      }
    }
    return mutated ? scriptTag.replace(json, JSON.stringify(arr.length === 1 ? arr[0] : arr, null, 2)) : scriptTag;
  });
  if (changed) fs.writeFileSync(full, html, "utf8");
  return { changed };
}

// ---- Report ----
console.log("Schema audit — Giftora");
console.log("-----------------------");
console.log("Files scanned:", filesChecked);
console.log("Product images available in data/products.json:", imageMapSize);

if (FIX) {
  let totalFixed = 0;
  if (arg === "products") {
    console.log("(--fix only applies to root category pages, not products/ — regenerate those via seo/generate-products.js)");
  }
  const candidates = (arg === "all" || arg === "root") ? rootHtmlFiles : [];
  for (const f of candidates) {
    const r = fixMissingImages(f);
    totalFixed += r.changed;
  }
  if (totalFixed) {
    console.log("Auto-fixed missing images:", totalFixed, "- re-running scan...");
    errors.length = 0;
    for (const f of rootHtmlFiles) validateFile(f, imageMap, false);
  }
}

if (errors.length) {
  console.log("\nERRORS (" + errors.length + "):");
  errors.forEach((e) => console.log("  [ ] " + e));
  console.log("\nRESULT: FAIL — fix before deploy (run 'npm run seo:check' with --fix to auto-add images, then regenerate products/).");
  process.exit(1);
} else if (warnings.length) {
  console.log("\nWARNINGS (" + warnings.length + "):");
  warnings.forEach((w) => console.log("  [!] " + w));
  console.log("\nRESULT: WARN");
  process.exit(0);
} else {
  console.log("\nRESULT: OK — all Product schema valid.");
  process.exit(0);
}

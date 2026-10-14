/**
 * generate-image-sitemap.js — builds image-sitemap.xml.
 *
 * Google discovers photos fastest through an image sitemap. The product photos
 * on Giftora are painted by JavaScript, so the static category pages contain no
 * <img> the crawler can grab. This sitemap lists the real, on-disk photo for:
 *   - every category page (its catalogue photos), and
 *   - every product page (that product's photo).
 *
 * Safety rules (see AGENTS.md):
 *   - Purely additive: it never edits sitemap.xml, robots.txt, canonical tags or
 *     robots meta. The main sitemap is untouched.
 *   - It refuses to write if any advertised image has no file on disk, so a dead
 *     image URL can never be published.
 *
 * Usage:
 *   node seo/generate-image-sitemap.js
 */
const fs = require("fs");
const path = require("path");
const { loadConfig, loadProducts } = require("./apply-seo");
const { slugifyName } = require("./render-product");

const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "image-sitemap.xml");
// Google allows up to 1,000 image entries per page; keep the file sane.
const MAX_IMAGES_PER_CATEGORY = 100;

// A few category pages use a display name that differs from the catalogue's
// internal category key. Map them so those photos are not silently dropped.
// (Verified against data/products.json: "teddy" and "combo" exist there.)
const CATEGORY_ALIASES = {
  "teddy bears": "teddy",
  "combo offers": "combo",
};

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function absUrl(site, rel) {
  if (!rel) return null;
  if (/^https?:\/\//i.test(rel)) return rel;
  return site.url.replace(/\/$/, "") + (rel.startsWith("/") ? rel : "/" + rel);
}

function isRemote(url) {
  return /^https?:\/\//i.test(url);
}

/** Local file backing an /uploads/... URL, or null when the URL is remote. */
function localFile(site, url) {
  if (isRemote(url)) return null;
  const rel = url.replace(site.url.replace(/\/$/, ""), "").replace(/^\//, "");
  return path.join(ROOT, rel.split("/").join(path.sep));
}

function generate() {
  const cfg = loadConfig();
  const site = cfg.site;
  const pages = cfg.pages || {};
  const products = loadProducts();

  const entries = []; // { loc, images: [ { loc } ] }
  const dead = [];

  const push = (loc, images) => {
    const list = [];
    for (const raw of images) {
      const url = absUrl(site, raw);
      if (!url) continue;
      if (!isRemote(url)) {
        const f = localFile(site, url);
        if (!f || !fs.existsSync(f)) {
          dead.push(url);
          continue;
        }
      }
      if (!list.includes(url)) list.push(url);
    }
    if (list.length) entries.push({ loc, images: list });
  };

  // 1) Category pages ← their catalogue photos.
  for (const [file, c] of Object.entries(pages)) {
    if (c.type !== "category" || !c.category) continue;
    const key = String(c.category).toLowerCase();
    const keys = new Set([key, CATEGORY_ALIASES[key]].filter(Boolean));
    const matched = products.filter((p) => keys.has(String(p.category || "").toLowerCase()));
    push(site.url + "/" + file, matched.map((p) => p.image).slice(0, MAX_IMAGES_PER_CATEGORY));
  }

  // 2) Product pages ← their own photo (only when the page actually exists).
  for (const p of products) {
    const slug = slugifyName(p.name);
    if (!fs.existsSync(path.join(ROOT, "products", slug + ".html"))) continue;
    push(site.url + "/products/" + slug + ".html", [p.image]);
  }

  if (dead.length) {
    throw new Error(
      "REFUSING to write image-sitemap.xml: " + dead.length +
      " image(s) have no file on disk:\n  " + dead.slice(0, 10).join("\n  ")
    );
  }

  // Stable order so re-running never produces a noisy diff.
  entries.sort((a, b) => a.loc.localeCompare(b.loc));

  const blocks = entries.map((e) =>
    [
      "  <url>",
      `    <loc>${esc(e.loc)}</loc>`,
      ...e.images.map((img) => [
        "    <image:image>",
        `      <image:loc>${esc(img)}</image:loc>`,
        "    </image:image>",
      ].join("\n")),
      "  </url>",
    ].join("\n")
  );

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    blocks.join("\n"),
    "</urlset>",
    "",
  ].join("\n");

  fs.writeFileSync(OUT_FILE, xml, "utf8");
  const totalImgs = entries.reduce((n, e) => n + e.images.length, 0);
  console.log("  image-sitemap.xml written (" + entries.length + " pages, " + totalImgs + " images)");
}

module.exports = { generate };

if (require.main === module) generate();

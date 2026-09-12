/**
 * inject-hreflang.js — Adds self-referencing hreflang alternate tags
 * (en-in + x-default) to the international/NRI pages that are NOT managed
 * by the seo/apply-seo.js pipeline (they only live in keywords.json's
 * sitemapOnly section), so these audiences get geo signal too.
 *
 * Additive only and idempotent — pages that already carry an
 * hreflang="x-default" link are skipped.
 *
 * Usage:
 *   node seo/inject-hreflang.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const TARGETS = [
  "send-gifts-to-india.html",
  "gifts-to-india-from-usa.html",
  "gifts-to-india-from-uk.html",
  "gifts-to-india-from-canada.html",
  "gifts-to-india-from-australia.html",
  "gifts-to-india-from-africa.html",
  "blog-nri-gift-guide.html",
  "blog-rakhi-gifts-nri.html",
  "blog-festival-gifts-nri.html",
];

function hasHreflang(html) {
  return html.indexOf('hreflang="x-default"') !== -1;
}

function inject(html, url) {
  const tag = `  <link rel="alternate" hreflang="en-in" href="${url}">\n  <link rel="alternate" hreflang="x-default" href="${url}">\n`;
  return html.replace(/([\t ]*)(<link rel="canonical" href="[^"]+">)/, (m, indent, canonical) => canonical + "\n" + indent + tag.replace(/^  /gm, indent + "  ").trimEnd());
}

for (const page of TARGETS) {
  const filePath = path.join(ROOT, page);
  if (!fs.existsSync(filePath)) {
    console.log("  SKIP (missing): " + page);
    continue;
  }
  let html = fs.readFileSync(filePath, "utf8");

  if (hasHreflang(html)) {
    console.log("  SKIP (already has hreflang): " + page);
    continue;
  }
  if (!/<link rel="canonical"/.test(html)) {
    console.log("  SKIP (no canonical): " + page);
    continue;
  }

  const url = "https://gift-ora.online/" + page;
  html = inject(html, url);
  fs.writeFileSync(filePath, html, "utf8");
  console.log("  added hreflang: " + page);
}

console.log("Done.");
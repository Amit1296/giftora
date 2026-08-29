/**
 * dedupe-website.js — Removes the apply-seo generated "WebSite" schema node that
 * now duplicates the SITEWIDE-WEBSITE-SCHEMA block (WebSite + SearchAction)
 * injected by inject-sitewide-schema.js. Runs against every static HTML page.
 *
 * Only JSON-LD <script> blocks whose inner text parses cleanly are touched; a
 * "WebSite" node is removed only when it does NOT carry potentialAction, so the
 * injected WebSite + SearchAction block is always preserved. Any block we cannot
 * safely parse is left byte-for-byte intact.
 *
 * Usage: node seo/dedupe-website.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function rewriteJson(inner) {
  let data;
  try {
    data = JSON.parse(inner);
  } catch {
    return null;
  }
  let changed = false;
  function keep(node) {
    const isWeb =
      node &&
      typeof node === "object" &&
      (Array.isArray(node) ? false : node["@type"] === "WebSite");
    if (isWeb && !node.potentialAction) {
      changed = true;
      return false;
    }
    return true;
  }
  if (Array.isArray(data)) {
    const filtered = data.filter(keep);
    changed = changed || filtered.length !== data.length;
    return changed ? JSON.stringify(filtered, null, 2) : null;
  }
  if (data && typeof data === "object" && data["@type"] === "WebSite" && !data.potentialAction) {
    return ""; // whole block was just an old WebSite node
  }
  return null;
}

let cleaned = 0;

for (const f of fs.readdirSync(ROOT)) {
  if (!f.endsWith(".html")) continue;
  const file = path.join(ROOT, f);
  const html = fs.readFileSync(file, "utf8");

  const out = html.replace(
    /<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g,
    (whole, inner) => {
      if (inner.includes("SITEWIDE-WEBSITE-SCHEMA")) return whole;
      const json = rewriteJson(inner);
      if (json === null) return whole;
      cleaned++;
      if (json === "") return "";
      return '<script type="application/ld+json">\n' + json + "\n</script>";
    }
  );
  if (out !== html) fs.writeFileSync(file, out, "utf8");
}

console.log("WebSite duplicates removed on " + cleaned + " pages");
/**
 * sync-from-server.js — Pull the authoritative product catalog (PostgreSQL on
 * the production server, exposed via /js/products.js which the server boot
 * regenerates) into the repo, then regenerate every derived artifact:
 *
 *   data/products.json      (canonical seed/snapshot — commit this)
 *   js/products.js          (local working copy only; git-ignored on purpose)
 *   js/product-pages.js     (slug index — commit this)
 *   products/*.html         (static product pages — commit these)
 *   sitemap.xml, robots.txt (rebuilt + integrity-checked — commit these)
 *
 * Usage:
 *   node seo/sync-from-server.js
 *   node seo/sync-from-server.js --url https://gift-ora.online
 *
 * After a clean sync: review `git status`, commit, push, then deploy.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PRODUCTS_JS = path.join(ROOT, "js", "products.js");
const SEED = path.join(ROOT, "data", "products.json");
const BACKUP_DIR = path.join(ROOT, "data", "backups");

const SITE = (process.argv.indexOf("--url") >= 0
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "https://gift-ora.online").replace(/\/$/, "");

function snapshotBackup(name) {
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  for (const f of [SEED, PRODUCTS_JS]) {
    if (!fs.existsSync(f)) continue;
    const out = path.join(BACKUP_DIR, stamp + "-" + name + "-" + path.basename(f));
    fs.copyFileSync(f, out);
    console.log("  backup -> " + path.relative(ROOT, out).replace(/\\/g, "/"));
  }
}

function loadArray(src) {
  const m = src.match(/window\.GIFT_PRODUCTS\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) throw new Error("could not parse GIFT_PRODUCTS array from fetched content");
  return eval("(" + m[1] + ")");
}

async function main() {
  console.log("Fetching live catalog from " + SITE + "/js/products.js ...");
  const res = await fetch(SITE + "/js/products.js");
  if (!res.ok) throw new Error("GET " + SITE + "/js/products.js -> HTTP " + res.status);
  const products = loadArray(await res.text());

  if (!Array.isArray(products) || products.length === 0) {
    throw new Error("Empty catalog fetched — aborting, nothing was written.");
  }
  const prev = fs.existsSync(SEED)
    ? (JSON.parse(fs.readFileSync(SEED, "utf8")) || []).length
    : 0;
  if (prev > 0 && products.length < prev) {
    console.warn("  WARNING: fetched catalog (" + products.length + ") is SMALLER than repo seed (" + prev + "). Continuing anyway.");
  }
  console.log("  fetched " + products.length + " products (repo seed had " + prev + ")");

  snapshotBackup("presync");

  fs.writeFileSync(SEED, JSON.stringify(products, null, 2) + "\n", "utf8");
  fs.writeFileSync(PRODUCTS_JS, "window.GIFT_PRODUCTS = " + JSON.stringify(products, null, 2) + ";\n", "utf8");
  console.log("  wrote data/products.json (" + products.length + ") and js/products.js");

  console.log("\n[1/3] apply-seo (meta + sitemap)");
  execSync("node seo/apply-seo.js", { cwd: ROOT, stdio: "inherit" });

  console.log("\n[2/3] generate-products (pages + product-pages.js + sitemap)");
  execSync("node seo/generate-products.js", { cwd: ROOT, stdio: "inherit" });

  console.log("\n[3/3] pre-deploy-check (gate: sitemap integrity + catalog sync + schema)");
  execSync("node seo/pre-deploy-check.js", { cwd: ROOT, stdio: "inherit" });

  const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  const locs = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  console.log("\nSync complete. sitemap.xml has " + locs.length + " URLs.\n" +
    "Review `git status`, then commit js/product-pages.js, sitemap.xml, robots.txt,\n" +
    "data/products.json and products/*.html, push, and deploy. (js/products.js is\n" +
    "git-ignored and is NOT committed.)");
}

main().catch((e) => {
  console.error("sync-from-server failed:", e.stack || e.message);
  process.exit(1);
});
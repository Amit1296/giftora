#!/usr/bin/env node
/**
 * Additive catalogue sync: data/products.json -> live product store.
 *
 * Why this exists
 * ---------------
 * db.js `seedPg()` only seeds from data/products.json when the store is
 * EMPTY. A live Postgres already holding products is never re-seeded, so
 * products added to data/products.json never reach /api/products. Pushing
 * a new category therefore needs this explicit step, otherwise the category
 * nav link goes live but its grids render empty.
 *
 * Safety
 * ------
 * - Additive by product `id`: an id already present in the store is NEVER
 *   touched, so live edits made through the admin panel are preserved.
 * - `saveProducts()` snapshots the previous catalogue into products_history
 *   before writing, so a bad run is reversible from the admin panel.
 * - `--dry-run` reports exactly what would change without writing.
 *
 * Usage:
 *   node seo/sync-products-to-db.js --dry-run
 *   node seo/sync-products-to-db.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DRY_RUN = process.argv.includes("--dry-run");

const CATALOGUE = path.join(ROOT, "data", "products.json");

async function main() {
  if (!fs.existsSync(CATALOGUE)) {
    console.error("Missing " + path.relative(ROOT, CATALOGUE));
    process.exit(1);
  }

  const db = require(path.join(ROOT, "db.js"));
  const repoProducts = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
  if (!Array.isArray(repoProducts)) {
    console.error("data/products.json is not an array");
    process.exit(1);
  }

  const live = await db.getProducts();
  const liveIds = new Set(live.map((p) => Number(p.id)));

  const toAdd = repoProducts.filter((p) => p && p.id != null && !liveIds.has(Number(p.id)));
  const skipped = repoProducts.length - toAdd.length;

  console.log("repo catalogue : " + repoProducts.length);
  console.log("live catalogue : " + live.length);
  console.log("new (by id)    : " + toAdd.length);
  console.log("already present: " + skipped);

  if (!toAdd.length) {
    console.log("\nNothing to sync - live catalogue already contains every repo product.");
    return;
  }

  if (DRY_RUN) {
    console.log("\n(dry run) would add:");
    for (const p of toAdd) console.log("  + " + p.id + "  " + p.category + "  " + p.name);
    return;
  }

  await db.saveProducts([...live, ...toAdd]);

  const after = await db.getProducts();
  console.log("\nSynced. Live catalogue is now " + after.length + " products (+" + toAdd.length + ").");
  console.log("A products_history snapshot of the previous catalogue was saved automatically.");
}

main().catch((err) => {
  console.error("sync failed: " + err.message);
  process.exit(1);
});

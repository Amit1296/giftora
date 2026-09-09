const { Client } = require("pg");
const render = require("./seo/render-product.js");
(async () => {
  const c = new Client({ host: "localhost", user: "giftora_db_user", password: "tWppG5YUbocNVn2SKDcNagGAl41qKM0w", database: "giftora_db" });
  await c.connect();
  const res = await c.query("SELECT value FROM giftora_kv WHERE key = $1", ["products"]);
  const products = res.rows[0].value;
  const fs = require("fs");
  const onDisk = new Set(fs.readdirSync(require("path").join("/opt/giftora/products")).map((f) => f.replace(/\.html$/, "")));
  let dbOnly = [], diskOnly = [];
  const seen = new Set();
  for (const p of products) {
    const slug = render.slugifyName(p.name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    if (onDisk.has(slug)) continue;
    dbOnly.push({ slug, name: p.name, id: p.id, cat: p.category });
  }
  for (const f of onDisk) {
    let found = false;
    for (const p of products) { if (render.slugifyName(p.name) === f) { found = true; break; } }
    if (!found) diskOnly.push(f);
  }
  console.log("dbProducts=" + products.length);
  console.log("staticOnDisk=" + onDisk.size);
  console.log("dbOnlyProducts=" + dbOnly.length);
  dbOnly.forEach((p) => console.log("DBONLY:" + p.id + "|" + p.slug + "|" + p.cat + "|" + p.name));
  console.log("diskOnly=" + diskOnly.length);
  diskOnly.forEach((f) => console.log("DISKONLY:" + f));
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
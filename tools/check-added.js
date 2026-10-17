/* Post-entry check: each keyword added in this batch must appear on exactly
   one page's meta keywords and exactly once in the master list. */
const fs = require("fs");
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const added = [
  "buy dry fruits online", "premium nuts in india", "dry fruit gift packs",
  "dry fruits online delivery", "affordable dry fruit gift basket",
  "florist near me", "flower shop near me", "flowers near me", "flower shop",
  "send flowers", "flowers online", "cheap birthday flowers delivery",
  "diwali gift hampers for corporate", "gifts with free shipping",
  "expedited shipping for gifts", "guaranteed delivery by date",
];

const files = fs.readdirSync(".").filter((f) => f.endsWith(".html"))
  .concat(fs.readdirSync("products").filter((f) => f.endsWith(".html")).map((f) => "products/" + f));

let bad = 0;
for (const kw of added) {
  const owners = [];
  for (const f of files) {
    const h = fs.readFileSync(f, "utf8");
    const m = h.match(/<meta name="keywords" content="([^"]*)"/i);
    if (m && m[1].split(",").map((s) => norm(s)).includes(norm(kw))) owners.push(f);
  }
  const master = fs.readFileSync("seo/keyword-master.txt", "utf8").split(/\r?\n/)
    .filter((l) => { const mm = l.match(/^(.+?)\s*\|/); return mm && norm(mm[1]) === norm(kw); });
  const ok = owners.length === 1 && master.length === 1;
  if (!ok) bad++;
  console.log((ok ? "OK  " : "FAIL") + "  " + kw.padEnd(34) + " page: " + (owners.join(",") || "NONE").padEnd(42) + " master: " + master.length);
}
console.log(bad ? bad + " FAILURES" : "all " + added.length + " keywords: exactly 1 owner page + 1 master entry");
process.exit(bad ? 1 : 0);

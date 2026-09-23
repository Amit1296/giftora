const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\38591\\Desktop\\giftora-backup";
const KW = path.join(ROOT, "seo", "keywords.json");
const pagesMeta = (JSON.parse(fs.readFileSync(KW, "utf8")).pages) || {};
const files = Object.keys(pagesMeta);

const strip = (s) => String(s || "")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&nbsp;/g, " ")
  .replace(/&#39;/g, "'")
  .replace(/\s+/g, " ")
  .trim().toLowerCase();

const words = (s) => new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));

function readPage(f) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) return null;
  const h = fs.readFileSync(p, "utf8");
  const title = strip(((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]));
  const desc = strip(((h.match(/name="description" content="([^"]*)"/i) || [])[1]));
  const h1 = strip(((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]));
  const u = /<title>[\s\S]*?<\/title>/i.test(h);
  return { title, desc, h1, body: strip(h) };
}

const clusters = {};
let weakPages = [];

for (const f of files) {
  const meta = pagesMeta[f] || {};
  const type = meta.type || "other";
  if (!clusters[type]) clusters[type] = { pages: 0, kws: 0, weak: 0, allOk: 0 };
  const c = clusters[type];
  c.pages++;
  const page = readPage(f);
  const kws = (meta.keywords || []).map(String);
  c.kws += kws.length;
  if (!page) { c.weak++; weakPages.push(`${f}: MISSING`); continue; }

  const titleW = words(page.title), descW = words(page.desc), h1W = words(page.h1), bodyW = words(page.body);
  let pageAll = true, allInBody = true;
  for (const k of kws) {
    const kW = words(k);
    const inTitle = kW.size && [...kW].every((w) => titleW.has(w));
    const inDesc = kW.size && [...kW].every((w) => descW.has(w));
    const inH1 = kW.size && [...kW].every((w) => h1W.has(w));
    const inBody = kW.size && [...kW].every((w) => bodyW.has(w));
    if (!inBody) allInBody = false;
    if (!(inTitle && inDesc && inH1 && inBody)) pageAll = false;
  }
  if (pageAll) c.allOk++;
  if (!allInBody) { c.weak++; weakPages.push(f); }
}

console.log("Giftora keyword cluster status (word-overlap match, ~how search engines tokenize)\n");
console.log("CLUSTER".padEnd(14) + "pages".padStart(6) + "kws".padStart(7) + "  pages implying-ALL-kws(100%)  pages-with-kw-missing-from-body");
for (const [type, c] of Object.entries(clusters).filter(([, c]) => c.pages).sort((a, b) => b[1].pages - a[1].pages)) {
  console.log(
    type.padEnd(14) +
    String(c.pages).padStart(6) +
    String(c.kws).padStart(7) +
    "  " + String(c.allOk).padStart(8) + "/" + c.pages +
    "          " + String(c.weak).padStart(13) + "/" + c.pages
  );
}
console.log("\npages whose tracked keywords are ALL on-page: " + Object.values(clusters).reduce((a, c) => a + c.allOk, 0));
console.log("pages with >=1 tracked keyword missing from body:", weakPages.length);
console.log("\nsample weak (keyword =in-json but not fully present):");
for (const w of weakPages.slice(0, 12)) console.log("   " + w);

const fs = require("fs");
const path = require("path");
const ROOT = process.argv[2] || path.resolve(__dirname, "..");
const SKIP = new Set(["admin.html","banner-template.html","checkout-preview.html","gift-card-template.html","google7700e6aeefbc94c5.html"]);
const reScript = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/g;
let webErr = [], faqErr = [];
let totalWeb = 0, totalFaq = 0, parsedFail = 0, unparsed = 0;
for (const f of fs.readdirSync(ROOT)) {
  if (!f.endsWith(".html")) continue;
  const html = fs.readFileSync(path.join(ROOT, f), "utf8");
  const webSites = [];
  const faqPages = [];
  let m;
  while ((m = reScript.exec(html)) !== null) {
    let data;
    try { data = JSON.parse(m[1]); } catch { parsedFail++; continue; }
    const nodes = Array.isArray(data) ? data : [data];
    for (const n of nodes) {
      if (!n || typeof n !== "object") continue;
      const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
      if (t.includes("WebSite")) webSites.push({ type: t.join("+") });
      if (t.includes("FAQPage")) faqPages.push(1);
    }
    unparsed++;
  }
  totalWeb += webSites.length;
  totalFaq += faqPages.length;
  const hasFaqItems = html.includes('class="faq-item"');
  const expect = SKIP.has(f) ? 0 : 1;
  if (webSites.length !== expect) webErr.push(f + ": WebSite=" + webSites.length);
  if (!SKIP.has(f) && hasFaqItems && faqPages.length !== 1) faqErr.push(f + ": FAQPage=" + faqPages.length);
  if (SKIP.has(f) && faqPages.length) faqErr.push(f + ": SKIP but FAQPage=" + faqPages.length);
}
console.log("ld+json blocks parsed:", unparsed, "| unparseable:", parsedFail);
console.log("TOTAL WebSite nodes:", totalWeb, "| TOTAL FAQPage nodes:", totalFaq);
console.log("WebSite count anomalies:", webErr.length ? webErr.join(", ") : "NONE");
console.log("FAQPage anomalies:", faqErr.length ? faqErr.join(", ") : "NONE");
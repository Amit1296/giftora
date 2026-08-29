const fs = require("fs");
const path = require("path");
(async () => {
  const base = "http://localhost:8080";
  const picks = ["/index.html", "/cakes.html"];

  const products = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "data", "products.json"), "utf8")
  );
  const list = Array.isArray(products) ? products : products.products || [];
  const render = require(path.join(__dirname, "..", "seo", "render-product.js"));
  const withNewline = list.find((p) => p.description && /\r?\n/.test(p.description) && p.name);
  const withFallback = list.find((p) => !p.description && p.name);
  const target = withNewline || withFallback || list[0];
  const slug = render.slugifyName(target.name);
  picks.push("/products/" + slug + ".html");

  for (const u of picks) {
    const res = await fetch(base + u);
    const html = await res.text();
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const web = ld.filter((n) => (Array.isArray(n) ? n : [n]).some((x) => x && (x["@type"] === "WebSite" || (Array.isArray(x["@type"]) && x["@type"].includes("WebSite")))));
    const faq = ld.length - web.length;
    const hasSearch = /urlTemplate": "https:\/\/gift-ora\.online\/\?q=\{search_term_string\}/.test(html);
    const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
    console.log("== " + u + " | status " + res.status);
    console.log("  ld+json blocks:", ld.length, "| WebSite:", web.length, "| SearchAction:", hasSearch);
    console.log("  title:", JSON.stringify(title));
    if (u.includes("/products/")) {
      const desc = (html.match(/<meta name="description" content="([\s\S]*?)">/) || [])[1] || "";
      console.log("  meta description (" + desc.length + " chars, single-line:", !/\r?\n/.test(desc) + "):");
      console.log("   " + desc.slice(0, 200));
    }
  }
})().catch((e) => { console.error("SMOKE FAIL:", e.message); process.exit(1); });
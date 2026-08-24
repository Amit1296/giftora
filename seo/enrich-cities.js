/**
 * enrich-cities.js — injects unique local content into every gift-delivery-*.html page.
 *
 * Reads seo/city-data.json (hand-authored per-city content) and the live product
 * catalog (/api/products) to embed real internal links, then rewrites:
 *   1. A <!-- CITY-BLOCK-START/END --> section (about + areas + quick picks)
 *      inserted before the "how it works" section.
 *   2. <!-- CITY-FAQ-START/END --> city-specific FAQ items appended to the FAQ list.
 *
 * Idempotent: existing marker blocks are replaced, never duplicated.
 * Usage: node seo/enrich-cities.js [--api=https://gift-ora.online]
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(__dirname, "city-data.json");

const apiArg = process.argv.find((a) => a.startsWith("--api="));
const API_BASE = apiArg ? apiArg.slice(6) : "https://gift-ora.online";

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { Accept: "application/json" } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
        });
      })
      .on("error", reject);
  });
}

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function slugifyName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pickProducts(products, count) {
  const seen = new Set();
  const out = [];
  for (const p of products) {
    const slug = slugifyName(p.name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ name: String(p.name || "").trim(), slug });
    if (out.length >= count) break;
  }
  return out;
}

function cityBlock(city, products) {
  const slaLine =
    city.zone === "ncr"
      ? `Same-day hand delivery is available across ${esc(city.name)} — orders placed today reach your loved one today, with a personalised note included.`
      : `${esc(city.name)} falls under our express delivery network — most orders reach ${esc(city.name)} within ${esc(city.slaText || "24–48 hours")} of checkout, carefully packed and tracked end to end.`;

  const stateLabel = city.state && city.state !== city.name ? `, <span class="text-gradient">${esc(city.state)}</span>` : "";

  const areasHtml = city.areas
    .map((a) => `<span>${esc(a)}</span>`)
    .join("");

  const picks = products.length
    ? `
			<h3>Popular picks for ${esc(city.name)} delivery</h3>
			<ul class="city-picks">
				${products.map((p) => `<li><a href="products/${esc(p.slug)}.html">${esc(p.name)}</a></li>`).join("")}
			</ul>`
    : "";

  return `<!-- CITY-BLOCK-START -->
	<section class="features" id="about-city">
		<div class="container">
			<div class="section-header">
				<span class="section-tag">Local guide</span>
				<h2>Sending gifts to ${esc(city.name)}${stateLabel}</h2>
			</div>
			<div class="city-copy">
				<p>${city.intro}</p>
				<p>${slaLine}</p>
			</div>
			<div class="city-areas">
				<h3>Areas we cover in ${esc(city.name)}</h3>
				<div class="area-chips">${areasHtml}</div>
			</div>${picks}
		</div>
	</section>
	<!-- CITY-BLOCK-END -->`;
}

function cityFaq(city) {
  const items = city.faqs
    .map(
      (f) => `				<details class="faq-item">
					<summary>${esc(f.q)}</summary>
					<p>${esc(f.a)}</p>
				</details>`
    )
    .join("\n");
  return `<!-- CITY-FAQ-START -->
${items}
				<!-- CITY-FAQ-END -->`;
}

function inject(html, city, products) {
  let changed = [];

  // 1. City block before the how-it-works section
  const block = cityBlock(city, products);
  const blockRe = /<!-- CITY-BLOCK-START -->[\s\S]*?<!-- CITY-BLOCK-END -->\s*/;
  const howAnchor = '<section class="features" id="how">';
  if (blockRe.test(html)) {
    html = html.replace(blockRe, block + "\n\t");
    changed.push("block-replaced");
  } else if (html.includes(howAnchor)) {
    html = html.replace(howAnchor, block + "\n\n\t" + howAnchor);
    changed.push("block-inserted");
  } else {
    changed.push("BLOCK-SKIPPED(no-anchor)");
  }

  // 2. City FAQs appended inside .faq-list
  const faq = cityFaq(city);
  const faqRe = /<!-- CITY-FAQ-START -->[\s\S]*?<!-- CITY-FAQ-END -->/;
  const listRe = /(<div class="faq-list">[\s\S]*?<\/details>)(\s*<\/div>)/;
  if (faqRe.test(html)) {
    html = html.replace(faqRe, faq.replace("\n", "\n")); // replace inner items
    changed.push("faq-replaced");
  } else if (listRe.test(html)) {
    html = html.replace(listRe, `$1\n${faq}$2`);
    changed.push("faq-inserted");
  } else {
    changed.push("FAQ-SKIPPED(no-anchor)");
  }

  return [html, changed];
}

async function main() {
  const cities = JSON.parse(fs.readFileSync(DATA, "utf8"));
  let products = [];
  try {
    const json = await fetchJson(`${API_BASE}/api/products`);
    const list = Array.isArray(json) ? json : json.products || [];
    products = pickProducts(list, 8);
    console.log(`Loaded ${products.length} live products for quick-pick links.`);
  } catch (e) {
    console.warn(`Could not load products (${e.message}); continuing without quick-pick links.`);
  }

  let updated = 0;
  const skipped = [];
  for (const city of cities) {
    const file = path.join(ROOT, `gift-delivery-${city.slug}.html`);
    if (!fs.existsSync(file)) {
      skipped.push(city.slug);
      continue;
    }
    const original = fs.readFileSync(file, "utf8");
    const [next, changes] = inject(original, city, products);
    if (next !== original) {
      fs.writeFileSync(file, next, "utf8");
      updated++;
      console.log(`  ${city.slug}: ${changes.join(", ")}`);
    } else {
      console.log(`  ${city.slug}: unchanged`);
    }
  }
  console.log(`Done. Updated ${updated}/${cities.length} city pages.`);
  if (skipped.length) console.log(`Missing files for: ${skipped.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

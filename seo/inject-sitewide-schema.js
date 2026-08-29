/**
 * inject-sitewide-schema.js — Adds structured data to every static HTML page:
 *  1. WebSite (with sitelinks SearchAction) schema.
 *  2. FAQPage schema generated from each page's own visible <details class="faq-item">
 *     blocks (question in <summary>, answer in <p>), so markup always matches content.
 *
 * Usage:
 *   node seo/inject-sitewide-schema.js
 *
 * Idempotent — changes are guarded by marker comments and skipped on re-run.
 */
const fs = require("fs");
const path = require("path");
const apply = require("./apply-seo");

const ROOT = path.resolve(__dirname, "..");
const cfg = apply.loadConfig();
const site = cfg.site || { name: "Giftora", url: "https://gift-ora.online" };
const BASE = String(site.url).replace(/\/$/, "");

const WS_MARK = "<!-- SITEWIDE-WEBSITE-SCHEMA -->";
const FAQ_MARK = "<!-- SITEWIDE-FAQ-SCHEMA -->";

const SKIP = new Set([
  "admin.html",
  "banner-template.html",
  "checkout-preview.html",
  "gift-card-template.html",
  "google7700e6aeefbc94c5.html",
]);

function websiteBlock() {
  return (
    "\n" + WS_MARK + "\n" +
    '<script type="application/ld+json">\n' +
    JSON.stringify(
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": BASE + "/#website",
        name: site.name,
        url: BASE + "/",
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: BASE + "/?q={search_term_string}" },
          "query-input": "required name=search_term_string",
        },
      },
      null,
      2
    ) +
    "\n</script>\n"
  );
}

function faqBlock(faqs) {
  return (
    "\n" + FAQ_MARK + "\n" +
    '<script type="application/ld+json">\n' +
    JSON.stringify(
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      null,
      2
    ) +
    "\n</script>\n"
  );
}

function stripHtml(s) {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&rsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&hellip;/gi, "...")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFaq(html) {
  const items = [];
  const re = /<details\s+class="faq-item"[^>]*>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const q = stripHtml(m[1]);
    const pMatch = m[2].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const a = stripHtml(pMatch ? pMatch[1] : m[2]);
    if (q && a) items.push({ q, a });
  }
  return items;
}

let injectedWeb = 0;
let injectedFaq = 0;

for (const f of fs.readdirSync(ROOT)) {
  if (!f.endsWith(".html")) continue;
  const file = path.join(ROOT, f);
  let html = fs.readFileSync(file, "utf8");
  let changed = false;

  if (SKIP.has(f)) continue;

  if (!html.includes(WS_MARK)) {
    const head = html.indexOf("</head>");
    if (head === -1) {
      console.log("SKIP (no </head>): " + f);
      continue;
    }
    html = html.slice(0, head) + websiteBlock() + html.slice(head);
    changed = true;
    injectedWeb++;
  }

  if (!html.includes(FAQ_MARK) && !html.includes('"@type": "FAQPage"')) {
    const faqs = extractFaq(html);
    if (faqs.length) {
      const head = html.indexOf("</head>");
      html = html.slice(0, head) + faqBlock(faqs) + html.slice(head);
      changed = true;
      injectedFaq++;
    }
  }

  if (changed) fs.writeFileSync(file, html, "utf8");
}

console.log("WebSite schema injected on " + injectedWeb + " pages");
console.log("FAQPage schema injected on " + injectedFaq + " pages");
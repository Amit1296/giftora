/**
 * sync-faq-schema.js — refreshes FAQPage JSON-LD so it always mirrors the
 * page's visible <details class="faq-item"> blocks.
 *
 * Why: seo/inject-sitewide-schema.js only injects FAQPage when ABSENT
 * (line 144 one-shot guard), so whenever FAQs were added later (by
 * enrich-categories.js, hand edits, ...) the schema went stale. Audited
 * 2026-10-21: 43 root pages, 95 visible FAQs missing from schema.
 *
 * What it does per root *.html page:
 *   - finds the <script type="application/ld+json"> block containing an
 *     FAQPage node (array or object shape),
 *   - re-extracts visible FAQs using the SAME extraction rules as
 *     inject-sitewide-schema.js (so output is identical by construction),
 *   - rewrites ONLY that node's mainEntity; every other schema node,
 *     marker comment and script block is left byte-identical,
 *   - never adds or removes nodes (audit-schema.js expects exactly 1
 *     FAQPage / 1 WebSite per file — this preserves both).
 *
 * Idempotent. Usage:
 *   node seo/sync-faq-schema.js            # rewrite stale pages
 *   node seo/sync-faq-schema.js --check    # verify only, exit 1 on drift
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CHECK = process.argv.includes("--check");

const SKIP = new Set([
  "admin.html",
  "banner-template.html",
  "checkout-preview.html",
  "google7700e6aeefbc94c5.html",
]);

const SCRIPT_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

// ---- extraction: byte-for-byte the same rules as inject-sitewide-schema.js
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

function findFaqNode(data) {
  if (Array.isArray(data)) return data.find((b) => b && b["@type"] === "FAQPage") || null;
  if (data && data["@type"] === "FAQPage") return data;
  return null;
}

function syncPage(file, html) {
  const visible = extractFaq(html);
  if (!visible.length) return [html, null];

  let m;
  SCRIPT_RE.lastIndex = 0;
  while ((m = SCRIPT_RE.exec(html)) !== null) {
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch (e) {
      continue; // leave unparseable blocks alone
    }
    const node = findFaqNode(data);
    if (!node) continue;

    const seen = new Set();
    const mainEntity = [];
    for (const f of visible) {
      if (seen.has(f.q)) continue;
      seen.add(f.q);
      mainEntity.push({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      });
    }

    if (JSON.stringify(node.mainEntity || []) === JSON.stringify(mainEntity)) {
      return [html, "in-sync"];
    }

    node.mainEntity = mainEntity;
    const isArr = Array.isArray(data);
    const inner = isArr
      ? "[\n" + data.map((b) => JSON.stringify(b, null, 2)).join(",\n") + "\n]"
      : JSON.stringify(data, null, 2);
    const newTag = '<script type="application/ld+json">' + inner + "</script>";
    return [html.replace(m[0], newTag), "synced(" + mainEntity.length + ")"];
  }
  return [html, "no-faqnode(leave-to-inject-script)"];
}

function main() {
  const files = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
  let updated = 0;
  let checked = 0;
  const problems = [];

  for (const f of files) {
    if (SKIP.has(f)) continue;
    const p = path.join(ROOT, f);
    const before = fs.readFileSync(p, "utf8");
    const [after, note] = syncPage(f, before);
    if (note === null) continue;
    checked++;

    if (note.startsWith("synced")) {
      if (CHECK) {
        problems.push(f + ": stale schema (" + note + ")");
      } else if (after !== before) {
        fs.writeFileSync(p, after, "utf8");
        updated++;
        console.log("  " + f + ": " + note);
      }
    } else if (note.startsWith("no-faqnode") && /faq-item/.test(before)) {
      problems.push(f + ": visible FAQs but no FAQPage node");
    }
  }

  console.log(
    (CHECK ? "Check." : "Done.") +
      " FAQ-bearing pages: " + checked +
      (CHECK ? "" : ", updated " + updated) + "."
  );
  if (problems.length) {
    console.log("PROBLEMS (" + problems.length + "):");
    for (const pb of problems.slice(0, 30)) console.log("  " + pb);
    process.exit(1);
  }
  console.log("All pages OK.");
}

main();

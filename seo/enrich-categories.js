/**
 * enrich-categories.js - injects unique guide content into category, occasion
 * and festival hub pages.
 *
 * Reads seo/guide-content.json (hand-authored per-page content) and rewrites:
 *   1. A <!-- GUIDE-BLOCK-START/END --> section (unique H2 + copy + tips +
 *      internal links) inserted before the first <section class="faq">.
 *   2. <!-- GUIDE-FAQ-START/END --> page-specific FAQ items appended to the
 *      existing .faq-list.
 *
 * Idempotent: existing marker blocks are replaced, never duplicated.
 * Usage: node seo/enrich-categories.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(__dirname, "guide-content.json");
const BLOGS = path.join(__dirname, "blog-links.json");

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function guideBlock(page, blogs) {
  const paragraphs = page.paragraphs
    .map((p) => `\t\t\t\t<p>${esc(p)}</p>`)
    .join("\n");

  const reading = (blogs || []).length
    ? `\t\t\t<div class="city-copy">
\t\t\t\t<p>Further reading: ${blogs
        .map((l, i) => `${i ? ", " : ""}<a href="${esc(l.href)}">${esc(l.text)}</a>`)
        .join("")}</p>
\t\t\t</div>\n`
    : "";

  const tips = page.tips
    .map((t) => `\t\t\t\t\t<li>${esc(t)}</li>`)
    .join("\n");

  const links = page.links
    .map((l, i) => `${i ? ", " : ""}<a href="${esc(l.href)}">${esc(l.text)}</a>`)
    .join("");

  return `<!-- GUIDE-BLOCK-START -->
	<section class="features" id="gift-guide">
		<div class="container">
			<div class="section-header">
				<span class="section-tag">${esc(page.tag)}</span>
				<h2>${esc(page.h2)}</h2>
			</div>
			<div class="city-copy">
${paragraphs}
			</div>
			<div class="city-areas">
				<h3>${esc(page.tipsTitle)}</h3>
				<ul class="city-picks">
${tips}
				</ul>
			</div>
			<div class="city-copy">
				<p>Related: ${links}</p>
			</div>
${reading}		</div>
	</section>
	<!-- GUIDE-BLOCK-END -->`;
}

function guideFaq(page) {
  const items = page.faqs
    .map(
      (f) => `\t\t\t\t<details class="faq-item">
\t\t\t\t\t<summary>${esc(f.q)}</summary>
\t\t\t\t\t<p>${esc(f.a)}</p>
\t\t\t\t</details>`
    )
    .join("\n");
  return `<!-- GUIDE-FAQ-START -->
${items}
\t\t\t\t<!-- GUIDE-FAQ-END -->`;
}

function inject(html, page, blogs) {
  const changed = [];

  // 1. Guide block before the first FAQ section (fallback: before </main>)
  const block = guideBlock(page, blogs);
  const blockRe = /<!-- GUIDE-BLOCK-START -->[\s\S]*?<!-- GUIDE-BLOCK-END -->/;
  const anchorRe = /<section class="faq"/;
  if (blockRe.test(html)) {
    html = html.replace(blockRe, block);
    changed.push("block-replaced");
  } else {
    const m = anchorRe.exec(html);
    if (m) {
      html = html.slice(0, m.index) + block + "\n\n\t" + html.slice(m.index);
      changed.push("block-inserted");
    } else {
      const mi = html.lastIndexOf("</main>");
      if (mi > -1) {
        html = html.slice(0, mi) + block + "\n" + html.slice(mi);
        changed.push("block-inserted(main)");
      } else {
        changed.push("BLOCK-SKIPPED(no-anchor)");
      }
    }
  }

  // 2. Page FAQs appended inside .faq-list
  const faq = guideFaq(page);
  const faqRe = /<!-- GUIDE-FAQ-START -->[\s\S]*?<!-- GUIDE-FAQ-END -->/;
  const listRe = /(<div class="faq-list">[\s\S]*?<\/details>)(\s*<\/div>)/;
  if (faqRe.test(html)) {
    html = html.replace(faqRe, faq);
    changed.push("faq-replaced");
  } else if (listRe.test(html)) {
    html = html.replace(listRe, `$1\n${faq}$2`);
    changed.push("faq-inserted");
  } else {
    changed.push("FAQ-SKIPPED(no-anchor)");
  }

  return [html, changed];
}

function main() {
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const blogs = fs.existsSync(BLOGS) ? JSON.parse(fs.readFileSync(BLOGS, "utf8")) : {};
  const pages = Object.keys(data);

  let updated = 0;
  const skipped = [];
  for (const file of pages) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) {
      skipped.push(file);
      continue;
    }
    const original = fs.readFileSync(full, "utf8");
    const [next, changes] = inject(original, data[file], blogs[file]);
    if (next !== original) {
      fs.writeFileSync(full, next, "utf8");
      updated++;
      console.log(`  ${file}: ${changes.join(", ")}`);
    } else {
      console.log(`  ${file}: unchanged`);
    }
  }
  console.log(`Done. Updated ${updated}/${pages.length} pages.`);
  if (skipped.length) console.log(`Missing files for: ${skipped.join(", ")}`);
}

main();

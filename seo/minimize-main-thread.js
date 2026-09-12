#!/usr/bin/env node
// Giftora main-thread optimization (SAFE, additive-only).
//  - Adds `defer` to every external <script src="..."> that lacks it
//    (does NOT touch inline JSON-LD, does NOT touch scripts already
//    having `async`, preserves exact order = defer preserves doc order).
//  - Does NOT remove any script (qrcode.min.js is USED by script.min.js
//    for the UPI QR; nothing is dropped).
//  - Being placed under seo/ so the SEO pipeline can verify it: run
//    `node seo/check-schema.js` (expect 0) and `node seo/smoke-test.js`.
//
// Flags:
//   node seo/minimize-main-thread.js         -> apply changes
//   node seo/minimize-main-thread.js --dry   -> print what WOULD change, save nothing
//   node seo/minimize-main-thread.js --check -> exit non-zero if any script lacks defer
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.env.GIFTORA_DIR || path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'previews']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p, out);
    } else if (p.endsWith('.html')) {
      out.push(p);
    }
  }
  return out;
}

const flags = new Set(process.argv.slice(2));
const dry = flags.has('--dry');
const check = flags.has('--check');

const files = walk(ROOT);
let deferAdds = 0;
let touchedFiles = 0;
const problems = [];

for (const file of files) {
  let html = fs.readFileSync(file, 'utf8');
  const before = html;

  // --- add `defer` to external scripts lacking it (skip async, skip inline) ---
  let addCount = 0;
  html = html.replace(
    /<script\b([^>]*\bsrc\s*=\s*("[^"]*"|'[^']*'|[^ >]+))([^>]*)>/gi,
    (match, attrsBefore, srcPart, attrsTail) => {
      const whole = match;
      if (/\bdefer\b/i.test(whole) || /\basync\b/i.test(whole)) return match;
      addCount += 1;
      return whole.replace(/>\s*$/, ' defer>');
    }
  );

  if (html === before) continue;
  touchedFiles += 1;
  deferAdds += addCount;

  if (check) {
    problems.push(`${file}: would change (defer +${addCount})`);
    continue;
  }
  if (!dry) fs.writeFileSync(file, html, 'utf8');
}

console.log(`Files scanned: ${files.length}`);
console.log(`Files changed: ${dry ? '(dry) would change ' : ''}${touchedFiles}`);
console.log(`defer attributes added: ${deferAdds}`);

if (check) {
  if (problems.length) {
    console.error(`CHECK FAIL: ${problems.length} file(s) still need main-thread fixes:`);
    problems.slice(0, 30).forEach((p) => console.error('  ' + p));
    process.exit(1);
  }
  console.log('CHECK OK: all external scripts already deferred.');
  process.exit(0);
}

if (dry) console.log('DRY RUN (no files saved).');
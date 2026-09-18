const fs = require('fs');
const path = require('path');

const manifestFile = process.env.TEMP + '\\opencode\\webp-manifest.txt';
const manifest = new Set(fs.readFileSync(manifestFile, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean));
const ROOT = __dirname;
const EXTS = ['png', 'jpg', 'jpeg'];

let stale = 0, ok = 0, missingTarget = 0, checked = 0;
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'backups'].includes(entry.name)) continue;
      scan(p);
    } else if (['.html', '.js', '.json'].includes(path.extname(entry.name))) {
      const rel = path.relative(ROOT, p);
      const c = fs.readFileSync(p, 'utf8');
      const refs = c.match(/\/?uploads\/[^"'\s)\]]+\.(png|jpg|jpeg|webp)/gi) || [];
      for (const ref of refs) {
        checked++;
        const fn = path.basename(ref);
        if (/\.(png|jpg|jpeg)$/i.test(fn)) {
          stale++; console.log('STALE:', rel, '->', ref);
        } else {
          // webp ref: verify file exists in uploads manifest
          if (manifest.has(fn)) ok++;
          else { missingTarget++; console.log('MISSING-TARGET:', rel, '->', ref); }
        }
      }
    }
  }
}
scan(ROOT);
console.log(`\nchecked refs: ${checked}, webp-ok: ${ok}, stale-png: ${stale}, webp-without-file: ${missingTarget}`);

// validate JSON files
for (const f of ['data/products.json', 'data/img-dims.json']) {
  try { JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); console.log('JSON OK:', f); }
  catch (e) { console.log('JSON BROKEN:', f, e.message); }
}
console.log('DONE');
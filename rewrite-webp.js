const fs = require('fs');
const path = require('path');

const manifestFile = process.env.TEMP + '\\opencode\\webp-manifest.txt';
const manifest = new Set(fs.readFileSync(manifestFile, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean));

const ROOT = __dirname;

function rewriteUrlPath(text) {
  // Rewrite /uploads/<name>.png|jpg|jpeg -> .webp when a .webp sibling exists
  return text.replace(/(\/?uploads\/[^"'\s)]+\.(?:png|jpg|jpeg))/gi, (all) => {
    const webp = all.replace(/\.(png|jpg|jpeg)$/i, '.webp');
    return manifest.has(path.basename(webp)) ? webp : all;
  });
}

const report = [];
function processFile(p) {
  const ext = path.extname(p).toLowerCase();
  if (!['.html', '.js', '.json', '.css'].includes(ext)) return;
  const rel = path.relative(ROOT, p);
  if (rel.startsWith('node_modules') || rel.startsWith('.git') || rel.startsWith('backups')) return;
  const original = fs.readFileSync(p, 'utf8');
  const updated = rewriteUrlPath(original);
  if (updated !== original) {
    fs.writeFileSync(p, updated);
    const diffs = (updated.match(/\.webp/gi) || []).length - (original.match(/\.webp/gi) || []).length;
    report.push({ file: rel, newWebpRefs: diffs });
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else processFile(p);
  }
}

walk(ROOT);

report.sort((a, b) => b.newWebpRefs - a.newWebpRefs);
console.log('files changed:', report.length);
let total = 0;
for (const r of report) { total += r.newWebpRefs; }
console.log('total refs now pointing at .webp (new):', total);
for (const r of report.slice(0, 40)) console.log('  ' + r.file + '  (+' + r.newWebpRefs + ')');
console.log('... and', Math.max(0, report.length - 40), 'more');
console.log('DONE');
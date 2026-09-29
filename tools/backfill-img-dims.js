/* Measure any product image still missing from data/img-dims.json by fetching
   it from the live site, append it, then re-sync the JS tables. */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIMS_FILE = path.join(ROOT, "data", "img-dims.json");
const ORIGIN = "https://gift-ora.online";

const fetchBuf = (url) => new Promise((res) => {
  https.get(url, (r) => {
    if (r.statusCode !== 200) { r.resume(); return res(null); }
    const c = [];
    r.on("data", (d) => c.push(d));
    r.on("end", () => res(Buffer.concat(c)));
  }).on("error", () => res(null));
});

function webpSize(b) {
  if (b.length < 30 || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const t = b.toString("ascii", 12, 16);
  const o = 20;
  if (t === "VP8X") return [1 + b.readUIntLE(o, 3), 1 + b.readUIntLE(o + 3, 3)];
  if (t === "VP8 ") {
    if (b[o + 3] === 0x9d && b[o + 4] === 0x01 && b[o + 5] === 0x2a)
      return [b.readUInt16LE(o + 6) & 0x3fff, b.readUInt16LE(o + 8) & 0x3fff];
    return null;
  }
  if (t === "VP8L") {
    if (b[o] === 0x2f) { const v = b.readUInt32LE(o + 1); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
    return null;
  }
  return null;
}
function pngSize(b) { return b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; }
function jpegSize(b) {
  if (b.length < 4 || b.readUInt16BE(0) !== 0xffd8) return null;
  let o = 2;
  while (o < b.length - 9) {
    if (b[o] !== 0xff) { o++; continue; }
    const m = b[o + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { o += 2; continue; }
    const len = b.readUInt16BE(o + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(o + 7), b.readUInt16BE(o + 5)];
    o += 2 + len;
  }
  return null;
}
function gifSize(b) { return b.length >= 10 ? [b.readUInt16LE(6), b.readUInt16LE(8)] : null; }
function measure(b, ext) {
  if (ext === ".webp") return webpSize(b);
  if (ext === ".png") return pngSize(b);
  if (ext === ".jpg" || ext === ".jpeg") return jpegSize(b);
  if (ext === ".gif") return gifSize(b);
  return null;
}

(async () => {
  const origText = fs.readFileSync(DIMS_FILE, "utf8");
  const orig = JSON.parse(origText);

  const products = JSON.parse(
    fs.readFileSync(path.join(ROOT, "js", "products.js"), "utf8")
      .replace(/^window\.GIFT_PRODUCTS\s*=\s*/, "")
      .replace(/;\s*$/, "")
  );

  /* Prefer the server's live catalog so newly-added products are included. */
  let live = null;
  try {
    const r = await fetchBuf(ORIGIN + "/api/products");
    if (r) live = JSON.parse(r.toString("utf8")).products;
  } catch {}
  const catalog = (live && live.length ? live : products);
  console.log("catalog source :", live && live.length ? "live /api/products (" + live.length + ")" : "js/products.js (" + products.length + ")");

  const missing = [...new Set(catalog.map((p) => p.image).filter((i) => i && !orig[i]))];
  console.log("missing before :", missing.length);

  const added = [];
  for (const rel of missing) {
    const buf = await fetchBuf(ORIGIN + rel);
    if (!buf) { console.log("  fetch failed:", rel); continue; }
    const size = measure(buf, path.extname(rel).toLowerCase());
    if (!size || !size[0] || !size[1]) { console.log("  could not parse:", rel); continue; }
    added.push([rel, size]);
  }

  const merged = {};
  for (const k of Object.keys(orig)) merged[k] = orig[k];
  for (const [k, v] of added) merged[k] = v;

  const indent = origText.includes("\n  ") ? 1 : 0;
  fs.writeFileSync(DIMS_FILE, JSON.stringify(merged, null, indent) + "\n", "utf8");

  console.log("added          :", added.length);
  added.forEach(([k, v]) => console.log("   ", k, "->", v));
  console.log("total entries  :", Object.keys(merged).length);

  if (added.length) {
    execSync('node "' + path.join(ROOT, "tools", "sync-img-dims.js") + '"', { stdio: "inherit" });
  }
})();

/* Keep the intrinsic-size tables in js/script.js and js/script.min.js in sync
   with data/img-dims.json. The table is only used to emit width/height on
   <img> so the browser can reserve space before the image loads. */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const dims = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "img-dims.json"), "utf8"));
const entries = Object.entries(dims);

/* --- js/script.js : pretty-printed object literal ------------------------- */
const scriptFile = path.join(ROOT, "js", "script.js");
let src = fs.readFileSync(scriptFile, "utf8");
const startTag = "  const IMG_DIMS = {";
const start = src.indexOf(startTag);
if (start === -1) throw new Error("IMG_DIMS not found in js/script.js");
const bodyStart = start + "  const IMG_DIMS = {".length;
let depth = 1;
let i = bodyStart;
for (; i < src.length; i++) {
  if (src[i] === "{") depth++;
  else if (src[i] === "}") {
    depth--;
    if (depth === 0) break;
  }
}
const pretty = entries.map(([k, v]) => `  ${JSON.stringify(k)}: [${v[0]}, ${v[1]}]`).join(",\n");
const rebuilt = "  const IMG_DIMS = {\n" + pretty + "\n  };\n";
const before = src.slice(start, i + 2);
if (before !== rebuilt) {
  src = src.slice(0, start) + rebuilt + src.slice(i + 2);
  fs.writeFileSync(scriptFile, src, "utf8");
  console.log("js/script.js      updated");
} else {
  console.log("js/script.js      already in sync");
}

/* --- js/script.min.js : compact object literal, first token ------------- */
const minFile = path.join(ROOT, "js", "script.min.js");
let min = fs.readFileSync(minFile, "utf8");
const anchor = "const e={";
const a = min.indexOf(anchor);
if (a === -1) throw new Error("minified dims table not found in js/script.min.js");
const mBody = a + anchor.length; // first char AFTER the opening brace
depth = 1;
i = mBody;
for (; i < min.length; i++) {
  if (min[i] === "{") depth++;
  else if (min[i] === "}") {
    depth--;
    if (depth === 0) break;
  }
}
const compact = entries.map(([k, v]) => `${JSON.stringify(k)}:[${v[0]},${v[1]}]`).join(",");
const mRebuilt = "{" + compact + "}";
const mBefore = min.slice(mBody - 1, i + 1);
if (mBefore !== mRebuilt) {
  min = min.slice(0, mBody - 1) + mRebuilt + min.slice(i + 1);
  fs.writeFileSync(minFile, min, "utf8");
  console.log("js/script.min.js  updated");
} else {
  console.log("js/script.min.js  already in sync");
}

console.log("entries written:", entries.length);

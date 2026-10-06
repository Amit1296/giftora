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
/* Replace exactly "  const IMG_DIMS = { ... };". Comparing this same span --
   with the trailing ";" included and no trailing newline on either side -- is
   what makes the tool idempotent. An earlier version compared
   src.slice(start, i + 2) ("...};" with no newline) against a rebuilt string
   ending in "\n", which could never be equal, so every single run rewrote the
   file and appended one more blank line. The committed js/script.js had
   accumulated seven of them. */
const blockEnd = src[i + 1] === ";" ? i + 2 : i + 1;
const rebuilt = "  const IMG_DIMS = {\n" + pretty + "\n  };";
/* Collapse a run of blank lines left after the table down to a single blank
   line, but never add one where there was none. */
const tail = src.slice(blockEnd).replace(/^\n{2,}/, "\n\n");
const rebuiltSrc = src.slice(0, start) + rebuilt + tail;
if (rebuiltSrc !== src) {
  fs.writeFileSync(scriptFile, rebuiltSrc, "utf8");
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

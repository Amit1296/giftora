const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const KEY_FILE = path.join(__dirname, "indexnow-key.txt");
const SITEMAP = path.join(ROOT, "sitemap.xml");
const STATE = path.join(ROOT, ".indexnow-state.json");
const SITE = "https://gift-ora.online";
const IF_CHANGED = process.argv.includes("--if-changed");

function readXml(urls) {
  const re = /<loc>([^<]+)<\/loc>/g;
  const out = [];
  let m;
  while ((m = re.exec(urls))) out.push(m[1]);
  return out;
}

function ping(urls, onSuccess) {
  const body = JSON.stringify({
    host: SITE.replace(/^https?:\/\//, ""),
    key: fs.readFileSync(KEY_FILE, "utf8").trim(),
    keyLocation: SITE + "/" + fs.readFileSync(KEY_FILE, "utf8").trim() + ".txt",
    urlList: urls,
  });
  const req = https.request(
    {
      hostname: "api.indexnow.org",
      path: "/indexnow",
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    (res) => {
      res.resume();
      res.on("end", () => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        console.log("IndexNow HTTP " + res.statusCode + (ok ? " OK" : " FAILED"));
        console.log("Submitted " + urls.length + " URLs" + (ok ? "" : " - not accepted"));
        if (ok && onSuccess) onSuccess();
        process.exit(ok ? 0 : 1);
      });
    }
  );
  req.on("error", (e) => {
    console.error("IndexNow request error:", e.message);
    process.exit(1);
  });
  req.write(body);
  req.end();
}

if (!fs.existsSync(KEY_FILE)) {
  console.error("No key file: " + KEY_FILE + ". Generate a key and host <key>.txt at the site root first.");
  process.exit(1);
}

if (fs.existsSync(SITEMAP)) {
  const xml = fs.readFileSync(SITEMAP, "utf8");
  const urls = readXml(xml);
  const sha256 = crypto.createHash("sha256").update(xml).digest("hex");

  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch {}

  if (IF_CHANGED && prev && prev.sha256 === sha256) {
    console.log("Sitemap unchanged since " + prev.submittedAt + " - nothing to submit.");
    process.exit(0);
  }

  console.log("Found " + urls.length + " URLs in sitemap.");
  ping(urls, () => {
    fs.writeFileSync(
      STATE,
      JSON.stringify({ sha256, urlCount: urls.length, submittedAt: new Date().toISOString() }, null, 2) + "\n"
    );
  });
} else {
  console.error("No sitemap.xml found. Run apply-seo.js first.");
  process.exit(1);
}

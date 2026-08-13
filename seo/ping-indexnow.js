const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const KEY_FILE = path.join(__dirname, "indexnow-key.txt");
const SITEMAP = path.join(ROOT, "sitemap.xml");
const SITE = "https://gift-ora.online";

function readXml(urls) {
  const re = /<loc>([^<]+)<\/loc>/g;
  const out = [];
  let m;
  while ((m = re.exec(urls))) out.push(m[1]);
  return out;
}

function ping(urls) {
  const body = JSON.stringify({
    host: SITE.replace(/^https?:\/\//, ""),
    key: fs.readFileSync(KEY_FILE, "utf8").trim(),
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
  const urls = readXml(fs.readFileSync(SITEMAP, "utf8")).map((u) => u.replace(SITE, ""));
  console.log("Found " + urls.length + " URLs in sitemap.");
  ping(urls);
} else {
  console.error("No sitemap.xml found. Run apply-seo.js first.");
  process.exit(1);
}

const lighthouse = require("lighthouse");
const chromeLauncher = require("chrome-launcher");

(async () => {
  const chrome = await chromeLauncher.launch({
    chromePath: process.env.CHROME_PATH,
    chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"],
  });
  const opts = { logLevel: "error", output: "json", onlyCategories: ["performance"], port: chrome.port };
  const fn = typeof lighthouse === "function" ? lighthouse : (lighthouse.default || lighthouse.lighthouse);
  const r = await fn(process.env.LH_URL || "http://localhost:8080/", opts);
  const lhr = r.lhr || r;
  console.log("URL:", process.env.LH_URL || "http://localhost:8080/");
  console.log("PERF SCORE:", lhr.categories.performance.score);
  ["total-blocking-time", "largest-contentful-paint", "cumulative-layout-shift", "first-contentful-paint", "speed-index", "interactive"].forEach((a) => {
    const x = lhr.audits[a];
    if (x) console.log(a + ": " + x.displayValue + " (score " + x.score + ")");
  });
  try { await chrome.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });

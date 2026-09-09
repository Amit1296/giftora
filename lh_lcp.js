const lighthouse = require("lighthouse");
const chromeLauncher = require("chrome-launcher");

(async () => {
  const chrome = await chromeLauncher.launch({
    chromePath: process.env.CHROME_PATH,
    chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"],
  });
  const opts = { logLevel: "error", output: "json", onlyCategories: ["performance"], port: chrome.port };
  const fn = typeof lighthouse === "function" ? lighthouse : (lighthouse.default || lighthouse.lighthouse);
  const r = await fn(process.env.LH_URL || "https://gift-ora.online/", opts);
  const lhr = r.lhr || r;

  const lcp = lhr.audits["largest-contentful-paint-element"];
  if (lcp && lcp.details && lcp.details.items) {
    console.log("== LCP ELEMENT ==");
    for (const it of lcp.details.items) {
      const node = it.items && it.items[0];
      console.log("phase:", it.phase, "| timing:", Math.round(it.timing), "| size:", it.size, "| percent:", it.percent);
      console.log("  node:", JSON.stringify(node ? { nodeLabel: node.nodeLabel, snippet: node.snippet, selector: node.selector, path: node.path, boundingRect: node.boundingRect } : null).slice(0, 600));
    }
  }
  const sl = lhr.audits["server-latency"];
  if (sl && sl.details && sl.details.items) console.log("server-latencies:", JSON.stringify(sl.details.items));
  const net = lhr.audits["network-requests"];
  if (net && net.details && net.details.items) {
    console.log("\n== TOP FATEST/KEY REQUESTS ==");
    net.details.items
      .filter((q) => q.resourceType === "Image" || q.resourceType === "Document")
      .sort((a, b) => b.transferSize - a.transferSize)
      .slice(0, 12)
      .forEach((q) => console.log(`${Math.round(q.startTime)}ms +${Math.round(q.transferSize / 1024)}KiB ${q.url.split("/").slice(-3).join("/")}`));
  }
  try { await chrome.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
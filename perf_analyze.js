const r = require("./perf-report.json");
const a = r.audits;

console.log("=== script execution summary ===");
for (const k of Object.keys(a)) {
  const v = a[k];
  if (v.details && v.details.summary && (v.details.summary.scripting || v.details.summary.spentInJs)) {
    console.log(k, JSON.stringify(v.details.summary));
  }
}

console.log("=== long-tasks ===");
const lt = a["long-tasks"];
if (lt) {
  let total = 0, count = 0;
  if (lt.details && lt.details.items) {
    lt.details.items.forEach((i) => { total += i.duration; count++; });
  }
  console.log("tasks:", count, "total ms:", total);
} else console.log("none (may be in diagnostics)");

console.log("=== CLS contributors ===");
const lse = a["layout-shift-elements"];
if (lse && lse.details) lse.details.items.slice(0, 10).forEach((i) => console.log(i.score.toFixed ? i.score.toFixed(3) : i.score, "|", (i.node && i.node.snippet || "").slice(0, 90)));
else console.log("n/a");

console.log("=== LCP element ===");
const lcp = a["largest-contentful-paint-element"];
if (lcp && lcp.details) lcp.details.items.slice(0, 4).forEach((i) => console.log((i.node && i.node.snippet || "").slice(0, 110)));
else console.log("n/a");

console.log("=== Render-blocking resources ===");
const rbr = a["render-blocking-resources"];
if (rbr && rbr.details) rbr.details.items.forEach((i) => console.log(i.url, "wasted", Math.round(i.wastedMs || 0), "ms"));
else console.log("n/a");

console.log("=== Bootup time (main-thread tasks) ===");
const boot = a["bootup-time"];
if (boot && boot.details) boot.details.items.slice(0, 12).forEach((i) => console.log((i.url || "?").replace("https://gift-ora.online/", ""), "self", Math.round(i.scripting || 0), "ms"));
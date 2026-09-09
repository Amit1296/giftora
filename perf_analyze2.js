const r = require("./perf-report.json");
const a = r.audits;
const show = (k, depth = 0) => {
  const v = a[k];
  if (!v) { console.log("\n==" + k + "== (missing)"); return; }
  console.log("\n==" + k + "== score=" + v.score + " " + (v.displayValue || "") + " title=" + v.title);
  if (v.details && v.details.items) {
    v.details.items.slice(0, 14).forEach((it) => {
      console.log("   " + JSON.stringify(it).slice(0, 400));
    });
  } else if (v.details) {
    console.log("   details: " + JSON.stringify(v.details).slice(0, 800));
  }
};
["total-byte-weight", "cache-insight", "cls-culprits-insight", "forced-reflow-insight", "image-delivery-insight", "render-blocking-insight", "network-dependency-tree-insight", "mainthread-work-breakdown", "long-tasks", "layout-shifts", "server-response-time"].forEach(show);
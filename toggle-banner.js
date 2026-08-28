/*
 * toggle-banner.js
 * Easily show, hide or edit the homepage banner WITHOUT touching index.html by hand.
 *
 * The banner content lives in  banner-template.html  (the "source of truth").
 * Edit that file however you like (change text, image, promo, add a countdown),
 * then run:
 *
 *   node toggle-banner.js show    -> inject the template banner into index.html
 *   node toggle-banner.js hide    -> remove the banner from index.html
 *   node toggle-banner.js status  -> report whether the banner is shown/hidden
 *
 * Workflow to change the banner:
 *   1. Edit banner-template.html
 *   2. Run:  node toggle-banner.js show
 *   3. commit & push to deploy live
 */

const fs = require("fs");
const path = require("path");

const INDEX = path.join(__dirname, "index.html");
const TEMPLATE = path.join(__dirname, "banner-template.html");

const MARKER_OPEN = "<!-- BANNER-SLOT:START -->";
const MARKER_CLOSE = "<!-- BANNER-SLOT:END -->";
const ANCHOR = '<main id="main-content">';

function readFile(p) {
  return fs.readFileSync(p, { encoding: "utf8" });
}

function writeFile(p, content) {
  fs.writeFileSync(p, content, { encoding: "utf8" });
}

// Extract just the <section> banner block from the template (ignoring any
// instructional comments above it).
function loadTemplate() {
  if (!fs.existsSync(TEMPLATE)) {
    throw new Error("banner-template.html not found at: " + TEMPLATE);
  }
  const tpl = readFile(TEMPLATE);
  const start = tpl.indexOf('<section class="festival-banner"');
  if (start === -1) {
    throw new Error("Could not find <section class=\"festival-banner\"> in banner-template.html");
  }
  const end = tpl.indexOf("</section>", start);
  if (end === -1) {
    throw new Error("Could not find closing </section> in banner-template.html");
  }
  return tpl.slice(start, end + "</section>".length);
}

function hasBanner(src) {
  const start = src.indexOf(MARKER_OPEN);
  const end = src.indexOf(MARKER_CLOSE);
  return start !== -1 && end !== -1 && end > start;
}

function insert(src, banner) {
  const slot = `${MARKER_OPEN}\n${banner}\t${MARKER_CLOSE}\n`;
  return src.replace(ANCHOR, `${ANCHOR}\n${slot}`);
}

function remove(src) {
  const start = src.indexOf(MARKER_OPEN);
  const end = src.indexOf(MARKER_CLOSE);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Banner markers not found in index.html; run 'show' first.");
  }
  return src.slice(0, start) + src.slice(end + MARKER_CLOSE.length);
}

function main() {
  const cmd = (process.argv[2] || "status").toLowerCase();

  if (!fs.existsSync(INDEX)) {
    console.error("index.html not found at:", INDEX);
    process.exit(1);
  }

  let src = readFile(INDEX);

  switch (cmd) {
    case "show": {
      if (hasBanner(src)) {
        // Remove then re-add so template edits always take effect.
        src = remove(src);
      }
      const banner = loadTemplate();
      writeFile(INDEX, insert(src, banner));
      console.log("Banner updated in index.html from banner-template.html.");
      break;
    }
    case "hide": {
      if (!hasBanner(src)) {
        console.log("Banner already absent. No change needed.");
      } else {
        writeFile(INDEX, remove(src));
        console.log("Banner removed from index.html.");
      }
      break;
    }
    case "status": {
      console.log(hasBanner(src) ? "Banner is currently SHOWN on index.html." : "Banner is currently HIDDEN on index.html.");
      break;
    }
    default:
      console.error("Unknown command. Use: node toggle-banner.js show|hide|status");
      process.exit(1);
  }
}

main();

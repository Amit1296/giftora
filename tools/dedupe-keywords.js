/* De-duplicate meta keywords across the site.

   Rule: each contested commercial term gets exactly ONE owning page — the most
   specific one. Hubs (occasion-gifts, the blog index, the NRI landing page) and
   blog posts keep only terms no other page owns, and are given long-tail
   replacements that are verified unused sitewide before anything is written.

   Terms listed in CITY_SHARED are deliberately left on all 100 city pages:
   those pages have unique titles, H1s and self-referencing canonicals, so the
   shared head term is correct local SEO, not duplication.

   Run without --apply for a dry run.
*/
const fs = require("fs");

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const isCity = (f) => /^gift-delivery-[a-z]+\.html$/.test(f);
const files = fs.readdirSync(".").filter((f) => f.endsWith(".html"));

/* ---------- current state ---------- */
const kwsOf = new Map();
for (const f of files) {
  const h = fs.readFileSync(f, "utf8");
  const m = h.match(/(<meta\s+name="keywords"\s+content=")([^"]*)(")/i);
  kwsOf.set(f, { m, list: m ? m[2].split(",").map((s) => s.trim()).filter(Boolean) : [] });
}

/* ---------- owner of each contested term ---------- */
const OWNER = {
  "same day gift delivery delhi": "gift-delivery-delhi.html",
  "send flowers online": "gift-delivery-india.html",
  "birthday gift delivery delhi": "gift-delivery-delhi.html",
  "same day gifts india": "same-day-gift-delivery.html",
  "online gift shop india": "gift-delivery-india.html",
  "custom wedding cakes": "wedding-gifts.html",
  "send gifts to india": "gift-delivery-india.html",
  "teachers day gifts": "teachers-day-gifts.html",
  "teacher appreciation gifts": "teachers-day-gifts.html",
  "best gifts for teachers": "teachers-day-gifts.html",
  "last minute teachers day gift": "teachers-day-gifts.html",
  "thank you gift for sir and maam": "teachers-day-gifts.html",
  "same day cake delivery": "birthday-gifts.html",
  "best online gift shop india": "index.html",
  "send diwali gifts online": "deepawali-gifts.html",
  "diwali gifts for family": "deepawali-gifts.html",
  "karwa chauth gift for wife": "karwa-chauth-gifts.html",
  "send karwa chauth gifts online": "karwa-chauth-gifts.html",
  "karwa chauth cake delivery": "karwa-chauth-gifts.html",
  "send gifts to india from abroad": "send-gifts-to-india.html",
  "nri gift delivery india": "send-gifts-to-india.html",
  "send gifts to india from usa": "gifts-to-india-from-usa.html",
  "send gifts to india from uk": "gifts-to-india-from-uk.html",
  "send gifts to india from canada": "gifts-to-india-from-canada.html",
  "send gifts to india from australia": "gifts-to-india-from-australia.html",
  "gifts to india from usa": "gifts-to-india-from-usa.html",
  "gifts to india from uk": "gifts-to-india-from-uk.html",
  "rakhi gifts for nri": "blog-rakhi-gifts-nri.html",
  "appreciation gifts": "thank-you-gifts.html",
  "diwali gift hampers online india": "deepawali-gifts.html",
  "online flower delivery india": "gift-delivery-india.html",
  "same day gift delivery": "same-day-gift-delivery.html",
  "birthday gifts": "birthday-gifts.html",
  "anniversary gifts": "anniversary-gifts.html",
  "wedding gifts": "wedding-gifts.html",
  "housewarming gifts": "housewarming-gifts.html",
  "baby shower gifts": "baby-shower-gifts.html",
  "baby shower cake": "baby-shower-gifts.html",
  "corporate gifts": "corporate-gifts.html",
  "corporate event cakes": "corporate-gifts.html",
};

/* terms every city page keeps on purpose; non-city pages must drop them */
const CITY_SHARED = new Set(["order flowers online", "buy flowers online", "affordable flower delivery", "flower delivery near me", "cake shop near me"]);

/* ---------- free replacement pool per page ---------- */
const POOL = {
  "blog-nri-gift-guide.html": ["nri gifting guide", "how to send gifts to india", "gifting from abroad tips", "nri gift delivery guide", "sending gifts overseas to india", "nri gift ideas blog", "gifting across time zones"],
  "send-gifts-to-india.html": ["nri gift delivery site", "gifts to india from abroad", "overseas gift delivery india", "send gift to india from dubai", "international gift delivery india", "send gift to india from singapore", "nri gifts same day delivery", "send gifts to india with tracking", "gift delivery for overseas indian families", "send gift to india from uae", "gifts to india from middle east", "flowers to india from abroad", "cakes to india from abroad"],
  "occasion-gifts.html": ["gift ideas by occasion", "celebration gift guide india", "gift suggestions for every occasion", "occasion based gift delivery", "festival and occasion gift ideas", "pick the perfect gift by occasion", "gifting guide for celebrations", "all occasion gift collection", "occasion gift hampers india", "celebration gifts delivered same day", "occasion gift guide 2026", "gift planner by occasion"],
  "blog-teachers-day-gifts.html": ["teachers day gift guide", "what to give a teacher", "teacher gift ideas blog", "thoughtful teacher gifts", "teachers day gifting tips", "teachers day gift ideas for students"],
  "blog.html": ["gift guide blog", "gifting ideas blog india", "giftora articles", "gift guide for nri families", "festival gifting articles", "gifting inspiration blog"],
  "blog-karwa-chauth-gifts.html": ["karwa chauth gift guide", "karwa chauth gift ideas blog", "surprise wife on karwa chauth", "karwa chauth celebration guide", "karwa chauth gift inspiration"],
  "blog-diwali-gifts.html": ["diwali gift ideas guide", "what to gift on diwali blog", "diwali gifting tips", "diwali gift inspiration", "diwali celebration gift guide"],
  "blog-rakhi-gifts-nri.html": ["rakhi gift guide for nri", "send rakhi overseas guide", "rakhi gifting abroad"],
  "blog-birthday-gifts-delhi.html": ["birthday gift ideas delhi guide", "delhi birthday gifting guide", "birthday shopping guide delhi"],
  "blog-best-online-gift-shop-india.html": ["online gift shop guide india", "how to choose a gift site", "gift shopping guide india"],
  "festival.html": ["festival gift combos", "festival hampers india", "festive gift collection", "festival gift bundles"],
  "congratulations-gifts.html": ["congratulations hamper", "good news gift ideas", "congratulations gift box"],
  "anniversary-gifts.html": ["anniversary gift combos", "romantic anniversary hamper", "anniversary keepsake gift"],
  "birthday-gifts.html": ["birthday flower combos", "birthday gift hampers", "birthday cake and flower combo", "birthday flower box", "best birthday flowers online"],
  "gifts-to-india-from-africa.html": ["gifts to india from nigeria", "gifts to india from kenya", "same day delivery from africa"],
  "gifts-to-india-from-usa.html": ["same day delivery to india from usa", "express gift delivery from usa", "overnight gift to india from usa"],
  "gifts-to-india-from-uk.html": ["same day delivery to india from uk", "express gift delivery from uk", "quick gift delivery from london"],
  "gifts-to-india-from-canada.html": ["same day delivery to india from canada", "express gift delivery from canada", "quick gift delivery from toronto"],
  "gifts-to-india-from-australia.html": ["same day delivery to india from australia", "express gift delivery from australia", "quick gift delivery from melbourne"],
  "about.html": ["about our gift company", "our gifting story", "meet the giftora team"],
  "shipping-policy.html": ["gift delivery timeline", "how long does gift delivery take", "gift dispatch time"],
  "product.html": ["product details page", "gift product information", "product specifications"],
  "engagement-gifts.html": ["engagement same day delivery", "engagement gift hamper", "engagement flowers same day"],
  "graduation-gifts.html": ["graduation same day gift", "graduation gift hamper", "convocation flowers same day"],
  "thank-you-gifts.html": ["thank you same day delivery", "gratitude gift hamper", "appreciation gift box"],
  "gift-delivery-india.html": ["india same day gift delivery", "all india gift delivery"],
  "same-day-gift-delivery.html": ["same day gift delivery india", "express gift delivery", "same day delivery across india"],
  "gift-delivery-delhi.html": ["delhi same day gift delivery", "quick gift delivery delhi"],
};

/* ---------- work out drops ---------- */
const plan = [];
for (const [f, v] of kwsOf) {
  const drops = [];
  for (const k of v.list) {
    const n = norm(k);
    /* shared city head terms: a non-city page must not also claim them */
    if (CITY_SHARED.has(n)) {
      if (!isCity(f)) drops.push(k);
      continue;
    }
    if (!(n in OWNER)) continue;
    if (OWNER[n] === f) continue;
    drops.push(k);
  }
  if (drops.length) plan.push({ f, drops, add: [] });
}

/* replacements, verified free against everything still in place */
const usedNow = new Set();
for (const [, v] of kwsOf) v.list.forEach((k) => usedNow.add(norm(k)));
for (const p of plan) p.drops.forEach((d) => usedNow.delete(norm(d)));

for (const p of plan) {
  for (const c of POOL[p.f] || []) {
    if (p.add.length >= p.drops.length) break;
    const n = norm(c);
    if (usedNow.has(n)) continue;
    usedNow.add(n);
    p.add.push(c);
  }
  if (p.add.length < p.drops.length) {
    console.log("!! " + p.f + " drops " + p.drops.length + " but only " + p.add.length + " free replacements");
  }
}

if (!process.argv.includes("--apply")) {
  console.log("=== DRY RUN ===");
  for (const p of plan) {
    console.log("\n" + p.f);
    console.log("   drop: " + p.drops.join(", "));
    console.log("   add : " + (p.add.join(", ") || "(none)"));
  }
  console.log("\nfiles affected: " + plan.length);
  process.exit(0);
}

/* ---------- write ---------- */
const TAIL = ["gift delivery india", "online gift shop delhi", "giftora"];
let changed = 0;
for (const p of plan) {
  const v = kwsOf.get(p.f);
  const dropSet = new Set(p.drops.map(norm));
  const kept = v.list.filter((k) => !dropSet.has(norm(k)));
  const tailKept = kept.filter((k) => TAIL.includes(k.toLowerCase()));
  const body = kept.filter((k) => !TAIL.includes(k.toLowerCase()));
  const merged = [...p.add, ...body, ...tailKept];
  if (merged.join("|") === v.list.join("|")) continue;
  const h = fs.readFileSync(p.f, "utf8");
  const out = h.slice(0, v.m.index) + v.m[1] + merged.join(", ") + v.m[3] + h.slice(v.m.index + v.m[0].length);
  fs.writeFileSync(p.f, out, "utf8");
  console.log(p.f.padEnd(36) + " -" + p.drops.length + " +" + p.add.length + "  (now " + merged.length + ")");
  changed++;
}
console.log("\nfiles changed: " + changed);

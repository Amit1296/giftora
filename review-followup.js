#!/usr/bin/env node
/*
 * Giftora review follow-up.
 * Emails one Google review request per order, the day after the delivery date.
 * Dry-run by default; nothing is sent without --send.
 *
 *   node review-followup.js             list what would be sent
 *   node review-followup.js --send      send (max 40 per run)
 *   node review-followup.js --send --limit=10
 *   node review-followup.js --test      send one sample to the store inbox
 */

const fs = require("fs");
const path = require("path");

function loadEnvFile() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith("#")) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = val;
    }
  } catch {}
}
loadEnvFile();

const db = require("./db");
const mailer = require("./mailer");

const REVIEW_URL = "https://g.page/r/CQhpBDoWy2JREBM/review";
const MAX_PER_RUN = 40;
const MAX_AGE_DAYS = 30;
const SKIP_STATUS = /^(cancell?ed|refunded|returned)$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const args = process.argv.slice(2);
const send = args.includes("--send");
const test = args.includes("--test");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = Math.min(MAX_PER_RUN, Math.max(1, parseInt(limitArg ? limitArg.split("=")[1] : MAX_PER_RUN, 10) || MAX_PER_RUN));

function istToday(now = new Date()) {
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function shiftDate(iso, days) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mask(email) {
  const [user, domain] = String(email).split("@");
  return (user ? user[0] : "") + "***@" + (domain || "");
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "there";
}

function prettyDate(iso) {
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function shortId(order) {
  return String(order._file || order.orderId || "").replace(/^order_/, "");
}

function buildEmail(order) {
  const id = shortId(order);
  const items = Array.isArray(order.items) ? order.items : [];
  const first = items[0] && items[0].name;
  const what = items.length > 1 || !first ? "order #" + id : "“" + first + "” (order #" + id + ")";
  const delivered = order.deliveryDate ? " was delivered on " + prettyDate(order.deliveryDate) : "";
  const text = [
    "Hi " + firstName(order.name) + ",",
    "",
    "Your " + what + delivered + ". I hope it arrived just the way you pictured it.",
    "",
    "If you have a moment, would you leave us a quick review on Google? It takes about 30 seconds and helps other people decide whether to trust a small shop like ours:",
    REVIEW_URL,
    "",
    "If something went wrong, reply to this email instead — I'd rather hear it from you and make it right.",
    "",
    "Thank you,",
    "Amit — Giftora",
    "+91 70880 84046",
    "https://gift-ora.online",
  ].join("\n");
  return { subject: "How was your Giftora delivery?", text };
}

async function main() {
  const orders = await db.getOrders();
  const today = istToday();
  const cutoff = shiftDate(today, -1);
  const oldest = shiftDate(today, -MAX_AGE_DAYS);

  const stats = { total: orders.length, noEmail: 0, invalidEmail: 0, noDate: 0, future: 0, tooOld: 0, cancelled: 0, alreadySent: 0 };
  const eligible = [];

  for (const o of orders) {
    if (!o) continue;
    if (o.reviewEmailSentAt) { stats.alreadySent++; continue; }
    if (SKIP_STATUS.test(String(o.status || ""))) { stats.cancelled++; continue; }
    const email = String(o.email || "").trim();
    if (!email) { stats.noEmail++; continue; }
    if (!EMAIL_RE.test(email)) { stats.invalidEmail++; continue; }
    const d = String(o.deliveryDate || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { stats.noDate++; continue; }
    if (d > cutoff) { stats.future++; continue; }
    if (d < oldest) { stats.tooOld++; continue; }
    eligible.push({ order: o, email, delivered: d });
  }

  console.log("Review follow-up — " + today + " (IST)");
  console.log(
    "orders: " + stats.total + " | eligible: " + eligible.length +
    " | no email: " + stats.noEmail + " | invalid email: " + stats.invalidEmail +
    " | no delivery date: " + stats.noDate + " | not delivered yet: " + stats.future +
    " | older than " + MAX_AGE_DAYS + "d: " + stats.tooOld +
    " | cancelled: " + stats.cancelled + " | already sent: " + stats.alreadySent
  );

  if (test) {
    const sampleOrder = eligible.length ? eligible[0].order : orders.find((o) => o && o.name);
    if (!sampleOrder) { console.log("No order available to build a sample from."); return; }
    const sample = { ...sampleOrder, deliveryDate: sampleOrder.deliveryDate || today };
    const { subject, text } = buildEmail(sample);
    const res = await mailer.send({ subject: "[TEST] " + subject, text });
    console.log(res && res.ok ? "Test email sent to the store inbox." : "Test email NOT sent: " + JSON.stringify(res));
    return;
  }

  if (!eligible.length) { console.log("Nothing to send."); return; }

  if (!send) {
    console.log("Dry run — no emails sent. Pass --send to send.");
    for (const { order, email, delivered } of eligible.slice(0, limit)) {
      console.log("  would send: #" + shortId(order) + " -> " + mask(email) + " (delivered " + delivered + ")");
    }
    if (eligible.length > limit) console.log("  ... " + (eligible.length - limit) + " more (limit " + limit + ")");
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const { order, email } of eligible.slice(0, limit)) {
    const { subject, text } = buildEmail(order);
    const res = await mailer.send({ to: email, subject, text });
    if (res && res.ok) {
      sent++;
      await db.updateOrder(order._file, { reviewEmailSentAt: new Date().toISOString() });
      console.log("sent: #" + shortId(order) + " -> " + mask(email));
    } else {
      failed++;
      console.log("failed: #" + shortId(order) + " -> " + mask(email) + " " + JSON.stringify(res));
    }
  }
  console.log("Done — sent: " + sent + ", failed: " + failed);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

const ROOT = __dirname;

function loadEnvFile() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
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

const mailer = require("./mailer");
const db = require("./db");
const apply = require("./seo/apply-seo");

const PORT = process.env.PORT || 8080;

const DATA_DIR = db.DATA_DIR;
const UPLOADS_DIR = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(ROOT, "uploads");
const ADMIN_CONFIG = path.join(ROOT, "admin-config.json");

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || readLocalSecret("razorpay-key-id");
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || readLocalSecret("razorpay-key-secret");

function isTestRazorpayKey() {
  return RAZORPAY_KEY_ID.startsWith("rzp_test_") || RAZORPAY_KEY_SECRET.startsWith("rzp_test_");
}

const MIDNIGHT_FEE = 300;

function readLocalSecret(name) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "razorpay-config.json"), "utf8"));
    return String(cfg[name] || "");
  } catch {
    return "";
  }
}

function readUpiConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "upi-config.json"), "utf8"));
    return {
      upiId: String(cfg["upi-id"] || "").trim(),
      payeeName: String(cfg["payee-name"] || "Giftora").trim(),
      qrImage: String(cfg["qr-image"] || "").trim(),
    };
  } catch {
    return { upiId: "", payeeName: "Giftora", qrImage: "" };
  }
}

const MAX_BODY = 6 * 1024 * 1024;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/* ---------- Rate limiting ---------- */
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMITS = {
  api: { limit: 150, window: RATE_WINDOW_MS },
  post: { limit: 50, window: RATE_WINDOW_MS },
  track: { limit: 120, window: RATE_WINDOW_MS },
  admin: { limit: 90, window: RATE_WINDOW_MS },
  login: { limit: 20, window: RATE_WINDOW_MS },
};
const rateBuckets = new Map();

function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const b = rateBuckets.get(key);
  if (!b || now - b.start >= windowMs) {
    if (rateBuckets.size > 5000) {
      for (const [k, v] of rateBuckets) {
        if (now - v.start >= windowMs) rateBuckets.delete(k);
      }
    }
    rateBuckets.set(key, { start: now, count: 1 });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

/* ---------- Security headers ---------- */
const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; " +
    "script-src 'self' https://checkout.razorpay.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' data: https://fonts.gstatic.com; " +
    "img-src 'self' data: blob: https:; " +
    "connect-src 'self' https://api.razorpay.com https://checkout.razorpay.com; " +
    "frame-src https://checkout.razorpay.com https://api.razorpay.com; " +
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-XSS-Protection": "0",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

function applySecurityHeaders(res, req) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(k, v);
  }
  const proto = String(req.headers["x-forwarded-proto"] || "").toLowerCase();
  if (req.socket.encrypted || proto === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
}

/* ---------- Image signature validation ---------- */
function sniffImageExt(buffer) {
  if (!buffer || buffer.length < 12) return "";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) return ".png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return ".jpg";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return ".gif";
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return ".webp";
  return "";
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/* Lowercase -> actual filename index of root-level .html pages (for case-fixing redirects) */
const ROOT_HTML_FILES = new Map();
for (const f of fs.readdirSync(ROOT)) {
  if (f.toLowerCase().endsWith(".html")) ROOT_HTML_FILES.set(f.toLowerCase(), f);
}

const ALLOWED_IMAGE_EXT = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

const sessions = new Map();
const loginFails = new Map();

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    "_" + pad(d.getHours()) + "-" + pad(d.getMinutes()) + "-" + pad(d.getSeconds())
  );
}

function clientIp(req) {
  const fwd = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket.remoteAddress || "unknown";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let over = false;
    req.on("data", (c) => {
      raw += c;
      if (raw.length > MAX_BODY) {
        over = true;
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => { if (!over) resolve(raw); });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function badRequest(res, e, fallbackMsg) {
  if (e && e.message === "Body too large") {
    return sendJson(res, 413, { success: false, message: "Request too large." });
  }
  return sendJson(res, 400, { success: false, message: fallbackMsg || "Invalid request." });
}

function readAdminConfig() {
  if (process.env.ADMIN_USER && process.env.ADMIN_PASS) {
    return { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASS };
  }
  try {
    return JSON.parse(fs.readFileSync(ADMIN_CONFIG, "utf8"));
  } catch {
    const generated = {
      username: "admin",
      password: crypto.randomBytes(9).toString("hex"),
    };
    try {
      fs.writeFileSync(ADMIN_CONFIG, JSON.stringify(generated, null, 2), "utf8");
      console.warn("[ADMIN] No ADMIN_USER/ADMIN_PASS env vars and no admin-config.json found.");
      console.warn("[ADMIN] Generated admin credentials: " + generated.username + " / " + generated.password);
      console.warn("[ADMIN] Set ADMIN_USER and ADMIN_PASS env vars (Render dashboard) to lock in your own credentials.");
    } catch (e) {
      console.warn("[ADMIN] Could not persist generated admin config (" + e.message + "). Login disabled until env vars are set.");
      return null;
    }
    return generated;
  }
}

function requireAuth(req, res) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const created = sessions.get(token);
  if (!token || !created || Date.now() - created > SESSION_TTL_MS) {
    sessions.delete(token);
    sendJson(res, 401, { success: false, message: "Unauthorized. Please log in." });
    return null;
  }
  sessions.set(token, Date.now());
  return token;
}

const CACHE_EXTENSIONS = {
  ".html": "no-cache",
  ".js": "no-cache, must-revalidate",
  ".css": "no-cache, must-revalidate",
  ".json": "no-cache, must-revalidate",
  ".txt": "no-cache, must-revalidate",
  ".xml": "no-cache, must-revalidate",
  ".svg": "public, max-age=86400",
  ".png": "public, max-age=86400",
  ".jpg": "public, max-age=86400",
  ".jpeg": "public, max-age=86400",
  ".gif": "public, max-age=86400",
  ".webp": "public, max-age=86400",
  ".ico": "public, max-age=86400",
  ".woff": "public, max-age=86400",
  ".woff2": "public, max-age=86400",
};

const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (e) {
    console.error("Unhandled request error:", e && e.stack ? e.stack : e);
    if (!res.headersSent) {
      return sendJson(res, 500, { success: false, message: "Server error. Please try again." });
    }
    try { res.end(); } catch {}
  }
});

async function handleRequest(req, res) {
  const url = new URL(req.url, "http://localhost");
  const method = req.method;
  const ip = clientIp(req);

  applySecurityHeaders(res, req);

  if (!["GET", "HEAD", "POST", "PUT", "DELETE"].includes(method)) {
    return sendJson(res, 405, { success: false, message: "Method not allowed." });
  }

  if (url.pathname.startsWith("/api/")) {
    let allowed = true;
    if (url.pathname === "/api/track") allowed = rateLimit("track:" + ip, RATE_LIMITS.track.limit, RATE_LIMITS.track.window);
    else if (url.pathname === "/api/admin/login") allowed = rateLimit("login:" + ip, RATE_LIMITS.login.limit, RATE_LIMITS.login.window);
    else if (url.pathname.startsWith("/api/admin")) allowed = rateLimit("admin:" + ip, RATE_LIMITS.admin.limit, RATE_LIMITS.admin.window);
    else if (method === "POST" || method === "PUT") allowed = rateLimit("post:" + ip, RATE_LIMITS.post.limit, RATE_LIMITS.post.window);
    else allowed = rateLimit("api:" + ip, RATE_LIMITS.api.limit, RATE_LIMITS.api.window);
    if (!allowed) return sendJson(res, 429, { success: false, message: "Too many requests. Please try again later." });
  }

  /* ---------- Public POST endpoints ---------- */
  if (method === "POST") {
    if (url.pathname === "/api/order") {
      try {
        const data = JSON.parse(await readBody(req));
        const result = await placeOrder(data);
        return sendJson(res, 200, result);
      } catch (e) {
        console.error("Order error:", e.message);
        const msg = e && e.message && e.message.startsWith("ORDER:") ? e.message.slice(6) : "Could not save your order.";
        return sendJson(res, 400, { success: false, message: msg });
      }
    }

    if (url.pathname === "/api/payment/order") {
      try {
        const data = JSON.parse(await readBody(req));
        const result = await createRazorpayOrder(data);
        return sendJson(res, 200, result);
      } catch (e) {
        console.error("Payment order error:", e.message);
        if (e && e.status === 401) {
          return sendJson(res, 401, { success: false, message: "Payment gateway authentication failed. Check Razorpay keys." });
        }
        return badRequest(res, e, e && e.message ? e.message : "Could not start payment.");
      }
    }

    if (url.pathname === "/api/verify-payment") {
      try {
        const data = JSON.parse(await readBody(req));
        const result = await verifyRazorpayPayment(
          data.razorpay_order_id || data.orderId,
          data.razorpay_payment_id || data.paymentId,
          data.razorpay_signature || data.signature,
          data.amount
        );
        return sendJson(res, 200, { success: true, ...result });
      } catch (e) {
        console.error("Verify payment error:", e.message);
        if (e && e.status === 401) {
          return sendJson(res, 401, { success: false, message: "Payment gateway authentication failed. Check Razorpay keys." });
        }
        return sendJson(res, 400, { success: false, message: e && e.message ? e.message : "Payment verification failed." });
      }
    }

    if (url.pathname === "/api/enquiry") {
      try {
        const data = JSON.parse(await readBody(req));
        data.name = String(data.name || "").trim().slice(0, 100);
        data.email = String(data.email || "").trim().slice(0, 150);
        data.message = String(data.message || "").trim().slice(0, 3000);
        if (!data.name || !data.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email) || !data.message) {
          return sendJson(res, 400, { success: false, message: "Please provide your name, email and message." });
        }
        await db.addEnquiry({ ...data, _file: "enquiry_" + timestamp(), date: new Date().toISOString() });
        sendEnquiryEmail(data);
        return sendJson(res, 200, { success: true });
      } catch (e) {
        console.error("Enquiry error:", e.message);
        return badRequest(res, e, "Could not save your message.");
      }
    }

    if (url.pathname === "/api/vendor") {
      try {
        const data = JSON.parse(await readBody(req));
        data.businessName = String(data.businessName || "").trim().slice(0, 100);
        data.contactName = String(data.contactName || "").trim().slice(0, 100);
        data.email = String(data.email || "").trim().slice(0, 150);
        data.phone = String(data.phone || "").trim().slice(0, 20);
        if (!data.businessName || !data.contactName || !data.email || !data.phone) {
          return sendJson(res, 400, { success: false, message: "Please fill in all required fields." });
        }
        await db.addVendor({ ...data, _file: "vendor_" + timestamp(), date: new Date().toISOString() });
        sendVendorEmail(data);
        return sendJson(res, 200, { success: true });
      } catch (e) {
        console.error("Vendor error:", e.message);
        return badRequest(res, e, "Could not save your application.");
      }
    }

    /* ---------- Coupon validation (checkout) ---------- */
    if (url.pathname === "/api/coupon/validate") {
      try {
        const data = JSON.parse(await readBody(req));
        const code = String(data.code || "").trim().toUpperCase();
        if (!code) throw new Error("Please enter a coupon code.");
        data.coupon = code;
        const cart = await computeCart(data, "");
        if (!cart.coupon) throw new Error("Invalid coupon code.");
        const label =
          cart.coupon.type === "fixed"
            ? "Rs." + cart.couponDiscount.toLocaleString("en-IN") + " off"
            : cart.coupon.value + "% off";
        return sendJson(res, 200, {
          success: true,
          code: cart.coupon.code,
          type: cart.coupon.type,
          value: cart.coupon.value,
          discount: cart.couponDiscount,
          label,
        });
      } catch (e) {
        console.error("Coupon validate error:", e.message);
        return badRequest(res, e, e.message || "Invalid coupon code.");
      }
    }

    /* ---------- Admin coupon creation ---------- */
    if (url.pathname === "/api/admin/coupons") {
      const auth = requireAuth(req, res);
      if (!auth) return;
      try {
        const body = JSON.parse(await readBody(req));
        const created = await createCoupons(body);
        return sendJson(res, 200, { success: true, coupons: created });
      } catch (e) {
        console.error("Coupon create error:", e.message);
        return badRequest(res, e, e.message || "Could not create coupons.");
      }
    }

    /* ---------- Gift cards (admin) ---------- */
    if (url.pathname === "/api/admin/giftcards") {
      const auth = requireAuth(req, res);
      if (!auth) return;
      try {
        const body = JSON.parse(await readBody(req));
        const created = await createGiftCards(body);
        return sendJson(res, 200, { success: true, cards: created });
      } catch (e) {
        console.error("Gift card create error:", e.message);
        return badRequest(res, e, e.message || "Could not create gift cards.");
      }
    }

    /* ---------- Gift card validation (public) ---------- */
    if (url.pathname === "/api/giftcard/validate" && method === "POST") {
      try {
        const body = JSON.parse(await readBody(req));
        return sendJson(res, 200, await validateGiftCard(body.code));
      } catch (e) {
        return sendJson(res, 400, { valid: false, message: "Invalid request." });
      }
    }

    /* ---------- Public tracking (visitor analytics) ---------- */
    if (url.pathname === "/api/track") {
      try {
        const body = JSON.parse(await readBody(req));
        const forwarded = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
        const rawIp = forwarded || req.socket.remoteAddress || "0.0.0.0";
        const ipHash = crypto.createHash("sha256").update(rawIp + "|giftora_track").digest("hex").slice(0, 16);
        const country =
          req.headers["cf-ipcountry"] || req.headers["x-country"] || req.headers["x-geo-country"] || "";
        const meta = { ...(body.meta || {}), country, ipHash };
        await db.addVisitorBatch(body.vid, meta, body.events, new Date().toISOString());
        return sendJson(res, 200, { success: true });
      } catch (e) {
        console.error("Track error:", e.message);
        return sendJson(res, 400, { success: false, message: "Invalid tracking payload." });
      }
    }

    /* ---------- Admin auth ---------- */
    if (url.pathname === "/api/admin/login") {
      const ip = clientIp(req);
      const fail = loginFails.get(ip);
      if (fail && fail.count >= LOGIN_MAX_FAILS && Date.now() - fail.first < LOGIN_WINDOW_MS) {
        return sendJson(res, 429, { success: false, message: "Too many failed attempts. Try again in 15 minutes." });
      }
      try {
        const { username, password } = JSON.parse(await readBody(req));
        const cfg = readAdminConfig();
        if (!cfg) {
          return sendJson(res, 500, { success: false, message: "Admin not configured. Set ADMIN_USER and ADMIN_PASS environment variables." });
        }
        if (username === cfg.username && password === cfg.password) {
          loginFails.delete(ip);
          const token = crypto.randomBytes(24).toString("hex");
          sessions.set(token, Date.now());
          return sendJson(res, 200, { success: true, token });
        }
        if (fail && Date.now() - fail.first < LOGIN_WINDOW_MS) {
          fail.count += 1;
        } else {
          loginFails.set(ip, { count: 1, first: Date.now() });
        }
        return sendJson(res, 401, { success: false, message: "Invalid username or password." });
      } catch (e) {
        return sendJson(res, 400, { success: false, message: "Invalid request." });
      }
    }

    if (url.pathname === "/api/admin/logout") {
      const header = req.headers["authorization"] || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      sessions.delete(token);
      return sendJson(res, 200, { success: true });
    }

    if (url.pathname === "/api/admin/upload") {
      const auth = requireAuth(req, res);
      if (!auth) return;
      try {
        const { name, data } = JSON.parse(await readBody(req));
        const ext = path.extname(name || "").toLowerCase();
        if (!ALLOWED_IMAGE_EXT.includes(ext)) {
          return sendJson(res, 400, { success: false, message: "Only images (png, jpg, jpeg, gif, webp) are allowed." });
        }
        const buffer = Buffer.from(data, "base64");
        if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
          return sendJson(res, 400, { success: false, message: "Image must be between 1 byte and 5 MB." });
        }
        const sniffed = sniffImageExt(buffer);
        if (!sniffed) {
          return sendJson(res, 400, { success: false, message: "File content does not look like an image." });
        }
        const file = "img_" + timestamp().replace(/[^0-9]/g, "_") + crypto.randomBytes(3).toString("hex") + sniffed;
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        fs.writeFileSync(path.join(UPLOADS_DIR, file), buffer);
        await db.saveUpload(file, buffer).catch(() => {});
        return sendJson(res, 200, { success: true, url: "/uploads/" + file });
      } catch (e) {
        console.error("Upload error:", e.message);
        return sendJson(res, 400, { success: false, message: "Could not upload image." });
      }
    }

    if (url.pathname === "/api/admin/products/restore") {
      const auth = requireAuth(req, res);
      if (!auth) return;
      try {
        const { index } = JSON.parse(await readBody(req));
        const ok = await db.restoreProducts(index);
        return sendJson(res, ok ? 200 : 400, {
          success: ok,
          message: ok ? "Product catalog restored from backup." : "Backup not found.",
        });
      } catch (e) {
        return sendJson(res, 400, { success: false, message: "Could not restore products." });
      }
    }

    return sendJson(res, 404, { success: false, message: "Not found." });
  }

  /* ---------- Public GET endpoints ---------- */
  if (method === "GET" && url.pathname === "/api/products") {
    try {
      return sendJson(res, 200, { success: true, products: await db.getProducts() });
    } catch (e) {
      console.error("Products API error:", e.message);
      return sendJson(res, 503, { success: false, message: "Temporarily unavailable. Please retry." });
    }
  }

  if (method === "GET" && url.pathname === "/api/festival") {
    try {
      return sendJson(res, 200, { success: true, festival: await db.getFestival() });
    } catch (e) {
      console.error("Festival API error:", e.message);
      return sendJson(res, 503, { success: false, message: "Temporarily unavailable. Please retry." });
    }
  }

  if (method === "GET" && url.pathname === "/api/banners") {
    try {
      const all = await db.getBanners();
      const active = (Array.isArray(all) ? all : [])
        .filter((b) => b && b.active)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      return sendJson(res, 200, { success: true, banners: active });
    } catch (e) {
      console.error("Banners API error:", e.message);
      return sendJson(res, 503, { success: false, message: "Temporarily unavailable. Please retry." });
    }
  }

  if (method === "GET" && url.pathname === "/api/payment/config") {
    return sendJson(res, 200, {
      success: true,
      enabled: !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET),
      key: RAZORPAY_KEY_ID || "",
      name: "Giftora",
    });
  }

  if (method === "GET" && url.pathname === "/api/upi/config") {
    const upi = readUpiConfig();
    return sendJson(res, 200, {
      success: true,
      enabled: !!upi.upiId,
      upiId: upi.upiId,
      payeeName: upi.payeeName,
      qrImage: upi.qrImage,
    });
  }

  /* ---------- Admin GET/PUT endpoints ---------- */
  if (url.pathname.startsWith("/api/admin")) {
    const auth = requireAuth(req, res);
    if (!auth) return;

    if (url.pathname === "/api/admin/products" && method === "GET") {
      return sendJson(res, 200, { success: true, products: await db.getProducts() });
    }

    if (url.pathname === "/api/admin/giftcards" && method === "GET") {
      const cards = await db.getGiftCards();
      return sendJson(res, 200, { success: true, cards });
    }

    if (url.pathname === "/api/admin/giftcards" && method === "PUT") {
      try {
        const body = JSON.parse(await readBody(req));
        const code = String(body.code || "").trim().toUpperCase();
        const cards = await db.getGiftCards();
        const card = cards.find((x) => x.code === code);
        if (!card) return sendJson(res, 404, { success: false, message: "Gift card not found." });
        if (typeof body.active === "boolean") card.active = body.active;
        await db.saveGiftCards(cards);
        return sendJson(res, 200, { success: true });
      } catch (e) {
        return badRequest(res, e, "Could not update gift card.");
      }
    }

    if (url.pathname === "/api/admin/products" && method === "PUT") {
      try {
        const { products } = JSON.parse(await readBody(req));
        if (!Array.isArray(products)) throw new Error("bad payload");
        if (products.length === 0) {
          return sendJson(res, 400, {
            success: false,
            message: "Refusing to save an empty product list. Restore from backups instead.",
          });
        }
        await db.saveProducts(products);
        return sendJson(res, 200, { success: true });
      } catch (e) {
        return sendJson(res, 400, { success: false, message: "Could not save products." });
      }
    }

    if (url.pathname === "/api/admin/products/history" && method === "GET") {
      return sendJson(res, 200, { success: true, history: await db.getProductsHistory() });
    }

    if (url.pathname === "/api/admin/festival" && method === "GET") {
      return sendJson(res, 200, { success: true, festival: await db.getFestival() });
    }

    if (url.pathname === "/api/admin/festival" && method === "PUT") {
      try {
        const { festival } = JSON.parse(await readBody(req));
        if (!festival || typeof festival !== "object") throw new Error("bad payload");
        await db.saveFestival(festival);
        return sendJson(res, 200, { success: true });
      } catch (e) {
        return sendJson(res, 400, { success: false, message: "Could not save festival offer." });
      }
    }

    if (url.pathname === "/api/admin/banners" && method === "GET") {
      return sendJson(res, 200, { success: true, banners: (await db.getBanners()) || [] });
    }

    if (url.pathname === "/api/admin/banners" && method === "PUT") {
      try {
        const { banners } = JSON.parse(await readBody(req));
        if (!Array.isArray(banners)) throw new Error("bad payload");
        await db.saveBanners(banners);
        return sendJson(res, 200, { success: true, banners });
      } catch (e) {
        return sendJson(res, 400, { success: false, message: "Could not save banners." });
      }
    }

    if (url.pathname === "/api/admin/upi" && method === "GET") {
      return sendJson(res, 200, { success: true, upi: readUpiConfig() });
    }

    if (url.pathname === "/api/admin/upi" && method === "PUT") {
      try {
        const { upi } = JSON.parse(await readBody(req));
        const current = readUpiConfig();
        const pick = (key, fallback) => (upi && upi[key] !== undefined ? String(upi[key]).trim() : fallback);
        const merged = {
          upiId: pick("upiId", current.upiId),
          payeeName: pick("payeeName", current.payeeName || "Giftora"),
          qrImage: pick("qrImage", current.qrImage),
        };
        fs.writeFileSync(
          path.join(ROOT, "upi-config.json"),
          JSON.stringify({
            "upi-id": merged.upiId,
            "payee-name": merged.payeeName,
            "qr-image": merged.qrImage,
          }, null, 2),
          "utf8"
        );
        return sendJson(res, 200, { success: true });
      } catch (e) {
        return sendJson(res, 400, { success: false, message: "Could not save UPI settings." });
      }
    }

    if (url.pathname === "/api/admin/orders" && method === "GET") {
      return sendJson(res, 200, { success: true, orders: await db.getOrders() });
    }

    if (url.pathname === "/api/admin/orders" && method === "PUT") {
      try {
        const { file, status, paid } = JSON.parse(await readBody(req));
        const patch = {};
        if (status) patch.status = String(status).slice(0, 20);
        if (typeof paid === "boolean") {
          patch.paid = paid;
          patch.paymentStatus = paid ? "Paid" : "Pending";
        }
        await db.updateOrder(file, patch);
        return sendJson(res, 200, { success: true });
      } catch (e) {
        return sendJson(res, 400, { success: false, message: "Could not update order." });
      }
    }

    if (url.pathname === "/api/admin/enquiries" && method === "GET") {
      return sendJson(res, 200, { success: true, enquiries: await db.getEnquiries() });
    }

    if (url.pathname === "/api/admin/vendors" && method === "GET") {
      return sendJson(res, 200, { success: true, vendors: await db.getVendors() });
    }

    if (url.pathname === "/api/admin/coupons" && method === "GET") {
      return sendJson(res, 200, { success: true, coupons: await db.getCoupons() });
    }

    if (url.pathname === "/api/admin/coupons" && method === "PUT") {
      try {
        const { code, patch } = JSON.parse(await readBody(req));
        if (!code || !patch || typeof patch !== "object") throw new Error("bad payload");
        const coupons = await db.getCoupons();
        const i = coupons.findIndex((c) => c.code === String(code).toUpperCase());
        if (i < 0) return sendJson(res, 404, { success: false, message: "Coupon not found." });
        const clean = {};
        if (typeof patch.active === "boolean") clean.active = patch.active;
        if (patch.value !== undefined) clean.value = Math.max(0, Number(patch.value) || 0);
        if (patch.usageLimit !== undefined) clean.usageLimit = Math.max(0, parseInt(patch.usageLimit, 10) || 0);
        if (patch.minOrder !== undefined) clean.minOrder = Math.max(0, Number(patch.minOrder) || 0);
        if (patch.maxDiscount !== undefined) clean.maxDiscount = Math.max(0, Number(patch.maxDiscount) || 0);
        if (patch.validFrom !== undefined) clean.validFrom = String(patch.validFrom || "").slice(0, 10);
        if (patch.validUntil !== undefined) clean.validUntil = String(patch.validUntil || "").slice(0, 10);
        coupons[i] = { ...coupons[i], ...clean };
        await db.saveCoupons(coupons);
        return sendJson(res, 200, { success: true });
      } catch (e) {
        return sendJson(res, 400, { success: false, message: "Could not update coupon." });
      }
    }

    if (url.pathname === "/api/admin/coupons" && method === "DELETE") {
      try {
        const { code } = JSON.parse(await readBody(req));
        const key = String(code || "").toUpperCase();
        if (!key) throw new Error("bad payload");
        const coupons = await db.getCoupons();
        await db.saveCoupons(coupons.filter((c) => c.code !== key));
        return sendJson(res, 200, { success: true });
      } catch (e) {
        return sendJson(res, 400, { success: false, message: "Could not delete coupon." });
      }
    }

    if (url.pathname === "/api/admin/visitors" && method === "GET") {
      return sendJson(res, 200, buildVisitorsReport(await db.getVisitors(), await db.getOrders()));
    }

    if (url.pathname === "/api/admin/visitors" && method === "DELETE") {
      await db.clearVisitors();
      return sendJson(res, 200, { success: true });
    }

    return sendJson(res, 404, { success: false, message: "Not found." });
  }

  /* ---------- Static files ---------- */
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Bad request");
  }
  if (/[\u0000-\u001f]/.test(pathname)) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Bad request");
  }
  pathname = pathname.replace(/\\/g, "/");

  /* ---------- Dynamic product pages ---------- */
  const productMatch = pathname.match(/^\/products\/([a-z0-9\-]+)\.html$/);
  if (productMatch && method === "GET") {
    try {
      const renderProduct = require("./seo/render-product");
      const cfg = apply.loadConfig();
      const site = cfg.site;
      const products = await db.getProducts();
      const slug = productMatch[1];
      const product = products.find((p) => renderProduct.slugifyName(p.name) === slug);
      if (product) {
        const html = renderProduct.renderProductPage(product, products, site);
        if (html) {
          const acceptEncoding = req.headers["accept-encoding"] || "";
          const useGzip = acceptEncoding.includes("gzip");
          const headers = {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache",
          };
          if (useGzip) {
            headers["Content-Encoding"] = "gzip";
            headers["Vary"] = "Accept-Encoding";
            res.writeHead(200, headers);
            const buf = Buffer.from(html, "utf8");
            zlib.gzip(buf, (err, compressed) => {
              if (err) { res.end(html); return; }
              res.end(compressed);
            });
          } else {
            res.writeHead(200, headers);
            res.end(html);
          }
          return;
        }
      }
    } catch (e) {
      console.error("Dynamic product render error:", e.message);
    }
  }

  const blocked = ["/data/", "/admin-config.json", "/mail-config.json", "/razorpay-config.json", "/upi-config.json", "/node_modules/", "/.env"];
  const lowerPath = pathname.toLowerCase();
  if (blocked.some((b) => lowerPath.startsWith(b))) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Forbidden");
  }

  let filePath = path.join(ROOT, pathname);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    if (lowerPath.startsWith("/uploads/")) {
      const key = pathname.slice("/uploads/".length).split("/")[0];
      if (key) {
        try {
          const buf = await db.getUpload(key);
          if (buf) {
            const type = MIME[path.extname(key).toLowerCase()] || "application/octet-stream";
            res.writeHead(200, { "Content-Type": type, "Cache-Control": "public, max-age=604800" });
            return res.end(buf);
          }
        } catch (e) {
          console.error("Upload DB read error:", e.message);
        }
      }
    }
    /* Case-mismatched .html request: 301 to the correctly-cased page (Linux is case-sensitive) */
    if (!fs.existsSync(filePath) && /[A-Z]/.test(pathname) && /\.html$/i.test(pathname)) {
      const hit = ROOT_HTML_FILES.get(path.basename(pathname).toLowerCase());
      if (hit && hit !== path.basename(pathname)) {
        res.writeHead(301, { Location: "/" + hit, "Cache-Control": "public, max-age=86400" });
        return res.end();
      }
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const cacheControl = CACHE_EXTENSIONS[ext] || "no-cache";

  const acceptEncoding = req.headers["accept-encoding"] || "";
  const compressible = [".html", ".css", ".js", ".json", ".svg", ".woff2"].includes(ext);
  const useGzip = compressible && acceptEncoding.includes("gzip");

  if (useGzip) {
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": cacheControl,
      "Content-Encoding": "gzip",
      "Vary": "Accept-Encoding",
    });
    const stream = fs.createReadStream(filePath);
    stream.pipe(zlib.createGzip()).pipe(res);
    stream.on("error", () => res.end());
  } else {
    res.writeHead(200, { "Content-Type": type, "Cache-Control": cacheControl });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on("error", () => res.end());
  }
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason && reason.stack ? reason.stack : reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err && err.stack ? err.stack : err);
});

server.listen(PORT, () => {
  console.log("Giftora static site running at http://localhost:" + PORT);
  console.log("Admin dashboard:  http://localhost:" + PORT + "/admin.html");
  console.log("Data saved to: " + DATA_DIR);
  console.log("Uploads saved to: " + UPLOADS_DIR);
  if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
    if (isTestRazorpayKey()) {
      console.warn("[PAYMENTS] WARNING: Razorpay is using TEST keys (rzp_test_...). Real money will NOT work. Set live keys (rzp_live_...) via RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET env vars or razorpay-config.json.");
    } else {
      console.log("[PAYMENTS] Razorpay live keys detected (rzp_live_...).");
    }
  } else {
    console.warn("[PAYMENTS] Razorpay keys are NOT configured. Card/UPI payments are disabled.");
  }
});

server.requestTimeout = 120 * 1000;
server.headersTimeout = 65 * 1000;
server.keepAliveTimeout = 72 * 1000;
server.maxHeadersCount = 80;

/* ---------- Graceful shutdown (avoid dropped requests on deploys) ---------- */
let shuttingDown = false;
function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("Received " + signal + ". Draining connections before exit...");
  server.close(() => {
    console.log("Server closed cleanly.");
    process.exit(0);
  });
  setTimeout(() => {
    console.log("Grace period elapsed, forcing exit.");
    process.exit(0);
  }, 20000).unref();
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

function visitorInterest(session, orderCount) {
  if (orderCount > 0) return "converted";
  if (session.checkoutStarted > 0) return "checkout";
  if ((session.cartAdds || []).length > 0) return "hot";
  if (Object.keys(session.productViews || {}).length > 0 || session.cartOpened > 0) return "warm";
  return "cold";
}

function buildVisitorsReport(store, orders) {
  const sessions = store.sessions || [];
  const orderByVid = {};
  for (const o of orders || []) {
    if (!o.vid) continue;
    orderByVid[o.vid] = orderByVid[o.vid] || { count: 0, ids: [] };
    orderByVid[o.vid].count += 1;
    orderByVid[o.vid].ids.push(o._file || o.orderId || "");
  }

  const enriched = sessions.map((s) => {
    const ord = orderByVid[s.vid];
    const orderCount = ord ? ord.count : 0;
    return {
      vid: s.vid,
      firstSeen: s.firstSeen,
      lastSeen: s.lastSeen,
      views: s.views || 0,
      device: s.device || "",
      browser: s.browser || "",
      os: s.os || "",
      country: s.country || "",
      referrer: s.referrer || "",
      ipHash: s.ipHash || "",
      pages: (s.pages || []).slice(-8),
      productViews: s.productViews || {},
      cartAdds: (s.cartAdds || []).slice(-5),
      cartOpened: s.cartOpened || 0,
      checkoutStarted: s.checkoutStarted || 0,
      orderCount,
      lastOrderId: ord ? ord.ids[ord.ids.length - 1] : "",
      interest: visitorInterest(s, orderCount),
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  const pageCounts = {};
  const productCounts = {};
  const interestBuckets = { converted: 0, checkout: 0, hot: 0, warm: 0, cold: 0 };
  let views = 0;
  let cartAdds = 0;
  let checkouts = 0;
  let conversions = 0;
  let activeToday = 0;

  for (const s of enriched) {
    views += s.views;
    cartAdds += s.cartAdds.length;
    checkouts += s.checkoutStarted;
    conversions += s.orderCount;
    interestBuckets[s.interest] += 1;
    if ((s.lastSeen || "").slice(0, 10) === today) activeToday += 1;
    for (const p of s.pages) pageCounts[p.path] = (pageCounts[p.path] || 0) + 1;
    for (const [name, n] of Object.entries(s.productViews)) {
      productCounts[name] = (productCounts[name] || 0) + n;
    }
  }

  const sortDesc = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ key: k, count: v }));

  return {
    success: true,
    sessions: enriched.slice(0, 2000),
    summary: {
      totalSessions: sessions.length,
      activeToday,
      views,
      cartAdds,
      checkouts,
      conversions,
      topPages: sortDesc(pageCounts, 10),
      topProducts: sortDesc(productCounts, 10),
      interestBuckets,
    },
  };
}

function razorpayRequest(path, body, method) {
  return new Promise((resolve, reject) => {
    const verb = method || "POST";
    const payload = body ? JSON.stringify(body) : "";
    const auth = "Basic " + Buffer.from(RAZORPAY_KEY_ID + ":" + RAZORPAY_KEY_SECRET).toString("base64");
    const headers = {
      Authorization: auth,
    };
    if (verb === "POST") {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const options = {
      hostname: "api.razorpay.com",
      port: 443,
      path,
      method: verb,
      headers,
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try {
          const data = JSON.parse(raw);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            const err = new Error((data.error && data.error.description) || ("Razorpay error " + res.statusCode));
            err.status = res.statusCode;
            reject(err);
          }
        } catch (e) {
          const err = new Error("Razorpay error " + res.statusCode);
          err.status = res.statusCode;
          reject(err);
        }
      });
    });
    req.on("error", reject);
    if (verb === "POST") req.write(payload);
    req.end();
  });
}

/* ---------- Coupon helpers ---------- */
const COUPON_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCouponCode(prefix, usedCodes) {
  let code = "";
  do {
    const chars = [];
    for (let i = 0; i < 6; i++) chars.push(COUPON_ALPHABET[crypto.randomInt(COUPON_ALPHABET.length)]);
    code = (prefix ? prefix + "-" : "") + chars.join("");
  } while (usedCodes.has(code));
  return code;
}

async function createCoupons(body) {
  const c = (body && body.coupon) || {};
  const count = Math.max(1, Math.min(500, parseInt(body && body.count, 10) || 1));
  const prefix = String((body && body.prefix) || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
  const existing = await db.getCoupons();
  const existingCodes = new Set(existing.map((x) => x.code));
  const template = {
    type: c.type === "fixed" ? "fixed" : "percent",
    value: Math.max(0, Number(c.value) || 0),
    minOrder: Math.max(0, Number(c.minOrder) || 0),
    maxDiscount: Math.max(0, Number(c.maxDiscount) || 0),
    validFrom: String(c.validFrom || "").slice(0, 10),
    validUntil: String(c.validUntil || "").slice(0, 10),
    usageLimit: Math.max(0, parseInt(c.usageLimit, 10) || 0),
    active: c.active !== false,
    used: 0,
  };
  const created = [];
  const pushCode = (code) => {
    created.push({ ...template, code, created: new Date().toISOString() });
    existingCodes.add(code);
  };
  const customCode = String(c.code || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
  if (count === 1 && customCode) {
    if (!customCode) throw new Error("Coupon code must contain letters or numbers.");
    if (existingCodes.has(customCode)) throw new Error("Coupon code " + customCode + " already exists.");
    pushCode(customCode);
  } else {
    for (let i = 0; i < count; i++) pushCode(makeCouponCode(prefix, existingCodes));
  }
  await db.saveCoupons([...created, ...existing]);
  return created;
}

/* ---------- Gift cards ---------- */
const GC_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion

function makeGiftCardCode(existingCodes) {
  const block = () => {
    const bytes = crypto.randomBytes(4);
    let s = "";
    for (let i = 0; i < 4; i++) s += GC_ALPHABET[bytes[i] % GC_ALPHABET.length];
    return s;
  };
  let code = "";
  do {
    code = "GFT-" + block() + "-" + block() + "-" + block();
  } while (existingCodes.has(code));
  return code;
}

async function createGiftCards(body) {
  const amount = Math.round(Number(body && body.amount) || 0);
  if (!(amount >= 100 && amount <= 100000)) throw new Error("Amount must be between ₹100 and ₹1,00,000.");
  const count = Math.max(1, Math.min(200, parseInt(body && body.count, 10) || 1));
  const months = Math.max(1, Math.min(60, parseInt(body && body.validMonths, 10) || 12));
  const note = String((body && body.note) || "").trim().slice(0, 120);
  const existing = await db.getGiftCards();
  const codes = new Set(existing.map((x) => x.code));
  const created = [];
  for (let i = 0; i < count; i++) {
    const code = makeGiftCardCode(codes);
    codes.add(code);
    created.push({
      code,
      amount,
      balance: amount,
      note,
      active: true,
      created: new Date().toISOString(),
      expires: new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString(),
      redeems: [],
    });
  }
  await db.saveGiftCards([...created, ...existing]);
  return created;
}

async function validateGiftCard(code) {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) return { valid: false, message: "Enter a gift card code." };
  const cards = await db.getGiftCards();
  const card = cards.find((x) => x.code === clean);
  if (!card) return { valid: false, message: "Gift card not found. Check the code and try again." };
  if (!card.active) return { valid: false, message: "This gift card has been deactivated." };
  if (new Date(card.expires).getTime() < Date.now()) return { valid: false, message: "This gift card has expired." };
  return {
    valid: true,
    balance: Number(card.balance) || 0,
    amount: Number(card.amount) || 0,
    expires: card.expires,
    message: `Valid gift card — balance ₹${Number(card.balance || 0).toLocaleString("en-IN")}.`,
  };
}

async function redeemGiftCard(code, amount, orderId) {
  const cards = await db.getGiftCards();
  const card = cards.find((x) => x.code === code);
  if (!card || !card.active) return false;
  if (new Date(card.expires).getTime() < Date.now()) return false;
  const amt = Math.max(0, Math.min(Math.round(Number(amount) || 0), Math.round(card.balance)));
  if (amt <= 0) return false;
  card.balance = Math.round(card.balance) - amt;
  card.redeems = Array.isArray(card.redeems) ? card.redeems : [];
  card.redeems.push({ orderId: String(orderId || ""), amount: amt, date: new Date().toISOString() });
  await db.saveGiftCards(cards);
  return true;
}

async function evaluateCoupon(code, subtotal) {
  const coupons = await db.getCoupons();
  const c = coupons.find((x) => x.code === code);
  if (!c) throw new Error("Invalid coupon code.");
  if (!c.active) throw new Error("This coupon code is not active right now.");
  const today = new Date().toISOString().slice(0, 10);
  if (c.validFrom && today < c.validFrom.slice(0, 10)) throw new Error("This coupon is not valid yet.");
  if (c.validUntil && today > c.validUntil.slice(0, 10)) throw new Error("This coupon has expired.");
  const limit = Number(c.usageLimit) || 0;
  if (limit > 0 && (Number(c.used) || 0) >= limit) throw new Error("This coupon code has been fully used.");
  const minOrder = Number(c.minOrder) || 0;
  if (minOrder > 0 && subtotal < minOrder) {
    throw new Error("Minimum order value for this coupon is Rs." + minOrder.toLocaleString("en-IN"));
  }
  let discount = 0;
  if (c.type === "fixed") {
    discount = Math.min(Number(c.value) || 0, subtotal);
  } else {
    discount = Math.round((subtotal * (Number(c.value) || 0)) / 100);
    const maxDiscount = Number(c.maxDiscount) || 0;
    if (maxDiscount > 0 && discount > maxDiscount) discount = maxDiscount;
  }
  discount = Math.max(0, Math.min(discount, subtotal));
  return { coupon: c, discount };
}

async function computeCart(data, prefix) {
  const E = (msg) => {
    throw new Error((prefix || "") + msg);
  };
  const rawItems = Array.isArray(data.items) ? data.items.slice(0, 50) : [];
  if (!rawItems.length) E("Your cart is empty.");
  const products = await db.getProducts();
  const festival = await db.getFestival();
  const festivalDiscount = festival && festival.active ? (Number(festival.discount) || 0) : 0;
  const items = [];
  let subtotal = 0;
  for (const it of rawItems) {
    const id = Number(it.id);
    const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
    const p = products.find((x) => x.id === id);
    if (!p) E("A product in your cart is no longer available.");
    const cap = typeof p.stock === "number" && p.stock >= 0 ? p.stock : Infinity;
    if (qty > cap) E("Only " + cap + " of " + p.name + " in stock.");
    let size = "";
    if (p.sizes && p.sizes.length) {
      size = String(it.size || "");
      if (!p.sizes.includes(size)) {
        if (p.sizes.length !== 1) E("Please select a size for " + p.name + ".");
        else size = p.sizes[0];
      }
    }
    let base = p.price;
    if (size && p.sizePrices && p.sizePrices[size] != null) base = Number(p.sizePrices[size]) || p.price;
    const price = festivalDiscount > 0 ? Math.round((base * (100 - festivalDiscount)) / 100) : base;
    subtotal += price * qty;
    items.push({ id, name: p.name, qty, size, price });
  }
  const midnightDelivery = data.midnightDelivery === true || data.midnightDelivery === "true";
  const midnightFee = midnightDelivery ? MIDNIGHT_FEE : 0;
  let coupon = null;
  let couponDiscount = 0;
  const couponCode = String(data.coupon || "").trim().toUpperCase();
  if (couponCode) {
    const result = await evaluateCoupon(couponCode, subtotal);
    coupon = result.coupon;
    couponDiscount = result.discount;
  }
  let giftCard = null;
  let giftCardDiscount = 0;
  const gcCode = String(data.giftCardCode || "").trim().toUpperCase();
  if (gcCode) {
    const check = await validateGiftCard(gcCode);
    if (!check.valid) E("Gift card could not be applied: " + check.message);
    const cards = await db.getGiftCards();
    const card = cards.find((x) => x.code === gcCode);
    const base = Math.max(0, subtotal + midnightFee - couponDiscount);
    giftCardDiscount = Math.min(Math.round(card.balance), Math.round(base));
    if (giftCardDiscount > 0) giftCard = { code: card.code };
  }
  return {
    products,
    festivalDiscount,
    items,
    subtotal,
    midnightDelivery,
    midnightFee,
    coupon,
    couponDiscount,
    giftCard,
    giftCardDiscount,
    total: Math.max(0, subtotal + midnightFee - couponDiscount - giftCardDiscount),
  };
}

async function markCouponUsed(code) {
  const coupons = await db.getCoupons();
  const c = coupons.find((x) => x.code === code);
  if (!c) return;
  c.used = (Number(c.used) || 0) + 1;
  await db.saveCoupons(coupons);
}

function razorpaySignatureMatches(orderId, paymentId, signature) {
  const expected = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET).update(orderId + "|" + paymentId).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function verifyRazorpayPayment(orderId, paymentId, signature, expectedAmountPaise) {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error("Online payments are not configured yet. Please try again later.");
  }
  const id = String(orderId || "").trim();
  const pid = String(paymentId || "").trim();
  const sig = String(signature || "").trim();
  if (!id || !pid || !sig) {
    throw new Error("Missing payment details (order id, payment id and signature are required).");
  }
  if (!razorpaySignatureMatches(id, pid, sig)) {
    throw new Error("Payment signature verification failed.");
  }
  const pay = await razorpayRequest("/v1/payments/" + encodeURIComponent(pid), null, "GET");
  if (pay.order_id !== id) {
    throw new Error("Payment does not belong to this order.");
  }
  if (expectedAmountPaise != null && Number(pay.amount) !== Number(expectedAmountPaise)) {
    throw new Error("Paid amount does not match the order total.");
  }
  if (!["captured", "authorized"].includes(pay.status)) {
    throw new Error("Payment is not completed (status: " + pay.status + ").");
  }
  return { verified: true, orderId: id, paymentId: pid, amount: pay.amount, status: pay.status };
}

async function createRazorpayOrder(data) {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error("Online payments are not configured yet. Please try again later.");
  }
  const cart = await computeCart(data, "");
  if (cart.total <= 0) {
    return {
      success: true,
      zeroPay: true,
      key: RAZORPAY_KEY_ID,
      couponCode: cart.coupon ? cart.coupon.code : "",
      couponDiscount: cart.couponDiscount || 0,
      giftCardCode: cart.giftCard ? cart.giftCard.code : "",
      giftCardDiscount: cart.giftCardDiscount || 0,
    };
  }
  const amountPaise = Math.round(cart.total * 100);
  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    throw new Error("Order total must be at least Rs.1 to pay online.");
  }
  if (cart.coupon) {
    cart.couponCode = cart.coupon.code;
    cart.couponLabel =
      cart.coupon.type === "fixed"
        ? "Rs." + cart.couponDiscount.toLocaleString("en-IN") + " off"
        : cart.coupon.value + "% off";
  }
  const order = await razorpayRequest("/v1/orders", {
    amount: amountPaise,
    currency: "INR",
    receipt: "gift_" + timestamp().replace(/[^0-9]/g, "").slice(0, 12),
    notes: { source: "giftora-store" },
  });
  return {
    success: true,
    key: RAZORPAY_KEY_ID,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    receipt: order.receipt,
    couponCode: cart.couponCode || "",
    couponDiscount: cart.couponDiscount || 0,
    couponLabel: cart.couponLabel || "",
    giftCardCode: cart.giftCard ? cart.giftCard.code : "",
    giftCardDiscount: cart.giftCardDiscount || 0,
    giftCardBalanceAfter: cart.giftCard
      ? Math.max(0, Math.round((await db.getGiftCards()).find((x) => x.code === cart.giftCard.code).balance) - Math.round(cart.giftCardDiscount))
      : 0,
  };
}

async function placeOrder(data) {
  const name = String(data.name || "").trim().slice(0, 100);
  const phone = String(data.phone || "").trim().slice(0, 20);
  const email = String(data.email || "").trim().slice(0, 150).toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("ORDER:Please provide a valid email address.");
  }
  const customerMessage = String(data.message || "").trim().slice(0, 500);
  const address = String(data.address || "").trim().slice(0, 600);
  const payment = ["UPI", "Card", "UPI QR", "Gift Card"].includes(data.payment) ? data.payment : "UPI";
  if (!name || !phone || !/^[0-9+\-()\s]{7,20}$/.test(phone) || !address) {
    throw new Error("ORDER:Please provide a valid name, phone and address.");
  }
  const senderName = (String(data.senderName || "").trim() || name).slice(0, 100);
  const senderPhone = String(data.senderPhone || "").trim().slice(0, 20);
  const senderCity = String(data.senderCity || "").trim().slice(0, 100);

  const cart = await computeCart(data, "ORDER:");
  const { items, total, midnightDelivery, midnightFee } = cart;

  if (payment === "Gift Card" && total > 0) {
    throw new Error("ORDER:Gift card balance does not cover the full order. Please choose another payment method for the remaining amount.");
  }

  const isOnline = payment === "UPI" || payment === "Card";
  let rzpPaymentId = "";
  if (isOnline) {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error("ORDER:Online payments are not configured yet. Please try again later.");
    }
    const rzpOrderId = String(data.razorpayOrderId || "").trim();
    rzpPaymentId = String(data.razorpayPaymentId || "").trim();
    const rzpSignature = String(data.razorpaySignature || "").trim();
    if (!rzpOrderId || !rzpPaymentId || !rzpSignature) {
      throw new Error("ORDER:Payment was not completed.");
    }
    try {
      await verifyRazorpayPayment(rzpOrderId, rzpPaymentId, rzpSignature, Math.round(cart.total * 100));
    } catch (e) {
      throw new Error("ORDER:" + (e && e.message ? e.message : "Payment verification failed."));
    }
  }
  for (const it of items) {
    const p = cart.products.find((x) => x.id === it.id);
    if (p && typeof p.stock === "number" && p.stock >= 0) {
      p.stock = Math.max(0, p.stock - it.qty);
    }
  }
  await db.saveProducts(cart.products);
  if (cart.coupon) await markCouponUsed(cart.coupon.code);

  const orderId = "order_" + timestamp();
  if (cart.giftCard) {
    const redeemed = await redeemGiftCard(cart.giftCard.code, cart.giftCardDiscount, orderId);
    if (!redeemed) {
      throw new Error("ORDER:Your gift card could not be redeemed (insufficient balance or deactivated). Please remove it and try again.");
    }
  }
  await db.addOrder({
    name,
    phone,
    email,
    message: customerMessage,
    address,
    payment,
    items,
    total,
    deliveryDate: String(data.deliveryDate || "").trim().slice(0, 20),
    midnightDelivery,
    midnightFee,
    coupon: cart.coupon ? cart.coupon.code : "",
    couponDiscount: cart.couponDiscount || 0,
    giftCard: cart.giftCard ? cart.giftCard.code : "",
    giftCardDiscount: cart.giftCardDiscount || 0,
    vid: String(data.vid || "").slice(0, 64),
    razorpayPaymentId: rzpPaymentId,
    _file: orderId,
    status: "New",
    paid: isOnline || payment === "Gift Card",
    paymentStatus: isOnline || payment === "Gift Card" ? "Paid" : "Pending",
    date: new Date().toISOString(),
    senderName,
    senderPhone,
    senderCity,
  });
  const orderData = { name, phone, email, message: customerMessage, address, payment, items, total, deliveryDate: String(data.deliveryDate || "").trim().slice(0, 20), midnightDelivery, midnightFee, paid: isOnline || payment === "Gift Card", coupon: cart.coupon ? cart.coupon.code : "", couponDiscount: cart.couponDiscount || 0, giftCard: cart.giftCard ? cart.giftCard.code : "", giftCardDiscount: cart.giftCardDiscount || 0, senderName, senderPhone, senderCity };
  sendOrderEmail(orderData, orderId);
  if (email) sendCustomerReceipt(orderData, orderId);
  return { success: true, orderId, total };
}

function sendOrderEmail(order, orderId) {
  const lines = order.items.map((i) => `- ${i.qty} x ${i.name}${i.size ? " (" + i.size + ")" : ""} @ Rs.${i.price}`).join("\n");
  const paymentNote =
    order.payment === "UPI QR" && !order.paid
      ? `Payment Status: PENDING — customer scanned the UPI QR. Verify payment before dispatch.`
      : `Payment Status: Paid`;
  const couponLine = order.coupon
    ? `Coupon: ${order.coupon} (saved Rs.${order.couponDiscount || 0})\n`
    : "";
  mailer.send({
    subject: `New Order #${orderId}`,
    text:
      `New order received:\n\n` +
      `Order ID: ${orderId}\n` +
      `Name: ${order.name}\n` +
      `Phone: ${order.phone}\n` +
      (order.senderName || order.senderPhone || order.senderCity
        ? `Sender: ${[order.senderName, order.senderPhone, order.senderCity].filter(Boolean).join(" | ")}\n`
        : "") +
      `Shipping Address: ${order.address}\n` +
      (order.message ? `Customer Message: ${order.message}\n` : "") +
      `Payment Method: ${order.payment || "UPI"}\n` +
      `${paymentNote}\n` +
      `Delivery Date: ${order.deliveryDate || "Not set"}\n` +
      `Midnight Delivery: ${order.midnightDelivery ? "Yes (+ Rs." + MIDNIGHT_FEE + ")" : "No"}\n` +
      `${couponLine}` +
      `Items:\n${lines}\n\n` +
      `Total: Rs.${order.total}`,
  });
}

function sendCustomerReceipt(order, orderId) {
  const lines = order.items.map((i) => `- ${i.qty} x ${i.name}${i.size ? " (" + i.size + ")" : ""} @ Rs.${i.price}`).join("\n");
  const paymentNote = order.paid
    ? "Payment Status: Paid"
    : order.payment === "UPI QR"
      ? "Payment Status: Pending (UPI QR) - we will confirm once verified."
      : "Payment Status: Pay on delivery / as selected";
  mailer.send({
    to: order.email,
    subject: `Order Confirmation - #${orderId} | Giftora`,
    text:
      `Hi ${order.name},\n\n` +
      `Thank you for your order at Giftora! Here are your order details.\n\n` +
      `Order ID: ${orderId}\n` +
      paymentNote + "\n" +
      `Delivery Date: ${order.deliveryDate || "To be confirmed"}\n` +
      (order.midnightDelivery ? `Midnight Delivery: Yes (+ Rs.${MIDNIGHT_FEE})\n` : "") +
      (order.coupon ? `Coupon Applied: ${order.coupon} (saved Rs.${order.couponDiscount || 0})\n` : "") +
      `\nItems:\n${lines}\n\n` +
      (order.midnightFee ? `Midnight delivery fee: Rs.${order.midnightFee}\n` : "") +
      `Total: Rs.${order.total}\n\n` +
      `Shipping Address:\n${order.address}\n\n` +
      `Need help with this order? WhatsApp us: https://wa.me/917088084046?text=` +
      encodeURIComponent("Hi Giftora! Please send me an update on order #" + orderId).replace(/%20/g, "%20") + "\n\n" +
      `Warm regards,\nTeam Giftora\nhttps://gift-ora.online`,
  });
}

function sendEnquiryEmail(enquiry) {
  mailer.send({
    subject: `New Enquiry from ${enquiry.name || "Website"}`,
    text:
      `New contact message:\n\n` +
      `Name: ${enquiry.name}\n` +
      `Email: ${enquiry.email}\n` +
      `Date: ${enquiry.date}\n\n` +
      `Message:\n${enquiry.message}`,
  });
}

function sendVendorEmail(vendor) {
  mailer.send({
    subject: `New Vendor Application from ${vendor.businessName || "Unknown Business"}`,
    text:
      `New vendor / partner application:\n\n` +
      `Business: ${vendor.businessName}\n` +
      `Contact Person: ${vendor.contactName}\n` +
      `Email: ${vendor.email}\n` +
      `Phone: ${vendor.phone}\n` +
      `City: ${vendor.city || "-"}\n` +
      `Category: ${vendor.category || "-"}\n` +
      `Website/Social: ${vendor.website || "-"}\n` +
      `Date: ${vendor.date}\n\n` +
      `Message:\n${vendor.message}`,
  });
}

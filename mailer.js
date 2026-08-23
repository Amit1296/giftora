const fs = require("fs");
const path = require("path");
const https = require("https");
const nodemailer = require("nodemailer");

const CONFIG_PATH = path.join(__dirname, "mail-config.json");

const BREVO_API_KEY = process.env.BREVO_API_KEY || "";

let transporter = null;
let useBrevoApi = false;

function loadConfig() {
  const envConfig = {
    enabled: process.env.MAIL_ENABLED,
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    secure: process.env.MAIL_SECURE,
    user: process.env.MAIL_USER,
    appPassword: process.env.MAIL_APP_PASSWORD,
    to: process.env.MAIL_TO,
  };
  const hasEnvConfig = Object.values(envConfig).some((v) => v !== undefined);
  if (hasEnvConfig) {
    return {
      enabled: envConfig.enabled === undefined ? true : envConfig.enabled === "true",
      host: envConfig.host || "smtp.gmail.com",
      port: envConfig.port ? parseInt(envConfig.port, 10) : 465,
      secure: envConfig.secure === undefined ? true : envConfig.secure === "true",
      user: envConfig.user,
      appPassword: envConfig.appPassword || "",
      to: envConfig.to || envConfig.user,
    };
  }
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (e) {
    console.error("Mailer: could not read mail-config.json:", e.message);
    return null;
  }
}

function init() {
  const config = loadConfig();
  if (BREVO_API_KEY) {
    useBrevoApi = true;
    console.log("Mailer: email notifications enabled via Brevo API -> " + ((config && config.to) || "amitwebdev163@gmail.com"));
    return;
  }
  if (!config || !config.enabled || !config.appPassword || config.appPassword.startsWith("PASTE_YOUR")) {
    console.log("Mailer: email notifications disabled (set up mail-config.json).");
    return;
  }
  transporter = nodemailer.createTransport({
    host: config.host || "smtp.gmail.com",
    port: config.port || 465,
    secure: config.secure !== false,
    auth: { user: config.user, pass: config.appPassword },
  });
  console.log("Mailer: email notifications enabled -> " + (config.to || config.user));
}

function sendBrevoApi({ subject, text, to, from }) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      sender: { name: "Giftora Store", email: from },
      to: [{ email: to }],
      subject,
      textContent: text,
    });
    const req = https.request(
      {
        hostname: "api.brevo.com",
        path: "/v3/smtp/email",
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log("Mailer: notification sent -> " + to);
            resolve({ skipped: false, ok: true });
          } else {
            console.error("Mailer: Brevo send failed (" + res.statusCode + "): " + raw.slice(0, 300));
            resolve({ skipped: false, ok: false });
          }
        });
      }
    );
    req.on("error", (e) => {
      console.error("Mailer: Brevo send failed:", e.message);
      resolve({ skipped: false, ok: false });
    });
    req.write(payload);
    req.end();
  });
}

function send({ subject, text, to }) {
  const config = loadConfig();
  const toAddress = to || (config && config.to) || "amitwebdev163@gmail.com";
  const from = (config && config.user) || toAddress;
  if (useBrevoApi) return sendBrevoApi({ subject, text, to: toAddress, from });
  if (!transporter) return Promise.resolve({ skipped: true });
  return new Promise((resolve) => {
    transporter.sendMail(
      {
        from: `"Giftora Store" <${from}>`,
        to: toAddress,
        subject,
        text,
      },
      (err) => {
        if (err) {
          console.error("Mailer: send failed:", err.message);
          resolve({ skipped: false, ok: false });
        } else {
          console.log("Mailer: notification sent -> " + toAddress);
          resolve({ skipped: false, ok: true });
        }
      }
    );
  });
}

init();

module.exports = { send };

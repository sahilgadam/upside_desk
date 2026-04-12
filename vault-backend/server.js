/* vault-backend/server.js */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const BLYNK_TOKEN = process.env.BLYNK_TOKEN; 
const BLYNK_BASE_URL = "https://blynk.cloud/external/api";
const LOG_FILE = path.join(__dirname, "logs.json");

// ─── UTILS: PERSISTENCE ───────────────────────────────────────
let accessLogs = [];
const loadLogs = () => {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const data = fs.readFileSync(LOG_FILE, "utf8");
      if (data && data.trim()) {
        accessLogs = JSON.parse(data);
        console.log(`💾 Loaded ${accessLogs.length} logs from file.`);
      }
    }
  } catch (e) {
    console.error("❌ Failed to load logs:", e.message);
    accessLogs = [];
  }
};
const saveLogs = () => {
  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify(accessLogs, null, 2));
  } catch (e) {
    console.error("❌ Failed to save logs:", e.message);
  }
};
loadLogs();

// ─── MIDDLEWARE ───────────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

const timestamp = () => new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const OTP_EXPIRY_MS = Number(process.env.OTP_EXPIRY_MS || 300000);
const otpLifetimeMs = Number.isFinite(OTP_EXPIRY_MS) && OTP_EXPIRY_MS > 0 ? OTP_EXPIRY_MS : 300000;
const otpExpiresInMinutes = Math.ceil(otpLifetimeMs / 60000);
const transporter =
  EMAIL_USER && EMAIL_PASS
    ? nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: EMAIL_USER,
          pass: EMAIL_PASS
        }
      })
    : null;
const otpStore = new Map();

// ─── API ROUTES ───────────────────────────────────────────────

app.post("/api/auth/request-otp", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";

    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required" });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: "Invalid email format" });
    }

    if (!transporter) {
      return res.status(500).json({ success: false, error: "Email service is not configured" });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    otpStore.set(email, { otp, expiresAt: Date.now() + otpLifetimeMs });

    await transporter.sendMail({
      from: EMAIL_USER,
      to: email,
      subject: "Vault Access OTP",
      text: `Your OTP is: ${otp}. It expires in ${otpExpiresInMinutes} minutes.`
    });

    return res.json({ success: true, message: "OTP sent" });
  } catch (err) {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (email) otpStore.delete(email);
    console.error("OTP Request Error:", err.message);
    return res.status(500).json({ success: false, error: "Failed to send OTP" });
  }
});

app.post("/api/auth/verify-otp", (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";

  if (!email || !otp) {
    return res.status(400).json({ success: false, message: "Email and OTP are required" });
  }

  const storedOtp = otpStore.get(email);

  if (!storedOtp) {
    return res.status(401).json({ success: false, message: "No OTP requested" });
  }

  if (Date.now() > storedOtp.expiresAt) {
    otpStore.delete(email);
    return res.status(401).json({ success: false, message: "OTP expired" });
  }

  if (storedOtp.otp !== otp) {
    return res.status(401).json({ success: false, message: "Invalid OTP" });
  }

  otpStore.delete(email);
  return res.status(200).json({ success: true, message: "Access granted" });
});

app.get("/api/status", async (req, res) => {
  // If the .env file is missing the token, tell the frontend immediately
  if (!BLYNK_TOKEN) {
    return res.json({ system: "UPSIDE DESK", running: true, auth: false });
  }

  let v0Data = "LOCKED";
  let v1Data = "000";

  // Safely fetch V0 (Lock Status)
  try {
    const v0Res = await axios.get(`${BLYNK_BASE_URL}/get?token=${BLYNK_TOKEN}&v0`);
    v0Data = v0Res.data;
  } catch (err) {
    console.error("V0 Fetch Error (Pin might be empty)");
  }

  // Safely fetch V1 (Sensor Data)
  try {
    const v1Res = await axios.get(`${BLYNK_BASE_URL}/get?token=${BLYNK_TOKEN}&v1`);
    v1Data = v1Res.data;
  } catch (err) {
    console.error("V1 Fetch Error (Pin might be empty)");
  }

  // Send the combined data to the React dashboard
  res.json({ 
    system: "UPSIDE DESK", 
    running: true, 
    auth: true,
    v0: v0Data,
    v1: v1Data
  });
});

app.get("/api/logs", (req, res) => {
  res.json({ count: accessLogs.length, logs: accessLogs.slice().reverse() });
});

app.post("/api/access", (req, res) => {
  try {
    const { status, flag } = req.body;
  
    if (!status) {
      return res.status(400).json({ error: "Missing required 'status' field." });
    }

    const entry = {
      id: Date.now(),
      status,
      flag: flag || "0",
      timestamp: timestamp()
    };

    accessLogs.push(entry);
    if (accessLogs.length > 50) accessLogs.shift();
    saveLogs();

    console.log(`🔔 ACCESS: ${status} | Time: ${entry.timestamp}`);
    res.status(200).json({ success: true, entry });
  } catch (err) {
    console.error("Access Endpoint Error:", err.message);
    res.status(500).json({ error: "Failed to record log" });
  }
});

app.post("/api/control", async (req, res) => {
  const { value, pin = "V2" } = req.body;

  if (value === undefined) {
    return res.status(400).json({ error: "Missing 'value' in control request." });
  }

  try {
    const url = `${BLYNK_BASE_URL}/update?token=${BLYNK_TOKEN}&${pin}=${value}`;
    const response = await axios.get(url);
    res.json({ success: true, blynk_status: response.status });
  } catch (err) {
    res.status(500).json({ error: "Blynk connection failed" });
  }
});

// ─── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ UPSIDE DESK - Backend Active on Port ${PORT}\n`);
});

module.exports = app;

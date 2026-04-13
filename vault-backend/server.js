/* vault-backend/server.js */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
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
const passcodeOtpStore = new Map();
const securityAlerts = [];
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

let fileRecords = [];
const FILES_META = path.join(__dirname, "files-meta.json");

if (fs.existsSync(FILES_META)) {
  try {
    fileRecords = JSON.parse(fs.readFileSync(FILES_META, "utf8"));
  } catch (e) {
    fileRecords = [];
  }
}

function saveFileMeta() {
  fs.writeFileSync(FILES_META, JSON.stringify(fileRecords, null, 2));
}

function addAlert(type, message, email) {
  securityAlerts.unshift({
    id: Date.now(),
    type,
    message,
    email: email || null,
    timestamp: timestamp()
  });
  if (securityAlerts.length > 100) securityAlerts.pop();
}

function getMostRecentOtpEmail() {
  const emails = Array.from(otpStore.keys());
  return emails.length ? emails[emails.length - 1] : null;
}

async function sendSecurityMail(to, subject, text) {
  if (!to || !transporter) return;

  try {
    await transporter.sendMail({
      from: EMAIL_USER,
      to,
      subject,
      text
    });
  } catch (err) {
    console.error("Security Mail Error:", err.message);
  }
}

async function blynkSet(pin, value) {
  if (!BLYNK_TOKEN) {
    throw new Error("Blynk token not configured");
  }

  const url = `${BLYNK_BASE_URL}/update?token=${BLYNK_TOKEN}&${pin}=${value}`;
  return axios.get(url);
}

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

app.post("/api/files/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    const record = {
      id: Date.now(),
      originalName: req.file.originalname,
      storedName: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: timestamp()
    };

    fileRecords.push(record);
    saveFileMeta();

    return res.json({ success: true, file: record });
  } catch (err) {
    console.error("File Upload Error:", err.message);
    return res.status(500).json({ success: false, error: "Failed to upload file" });
  }
});

app.get("/api/files", (req, res) => {
  res.json({ count: fileRecords.length, files: fileRecords.slice().reverse() });
});

app.get("/api/files/download/:id", (req, res) => {
  const record = fileRecords.find((file) => String(file.id) === req.params.id);

  if (!record) {
    return res.status(404).json({ success: false, error: "File not found" });
  }

  const downloadName = path.basename(record.originalName);
  const filePath = path.join(uploadsDir, record.storedName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: "File not found on disk" });
  }

  res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
  return res.download(record.storedName, downloadName, { root: uploadsDir });
});

app.delete("/api/files/:id", (req, res) => {
  const fileIndex = fileRecords.findIndex((file) => String(file.id) === req.params.id);

  if (fileIndex === -1) {
    return res.status(404).json({ success: false, error: "File not found" });
  }

  const record = fileRecords[fileIndex];
  const filePath = path.join(uploadsDir, record.storedName);

  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.error("File Delete Error:", err.message);
  }

  fileRecords.splice(fileIndex, 1);
  saveFileMeta();

  return res.json({ success: true });
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

app.post("/api/access", async (req, res) => {
  try {
    const { status, flag, email } = req.body;
  
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

    if (status === "LOCKED") {
      const alertEmail =
        typeof email === "string" && email.trim()
          ? email.trim().toLowerCase()
          : getMostRecentOtpEmail();

      addAlert("LOCKOUT", "3 failed attempts — vault locked", alertEmail);

      await sendSecurityMail(
        alertEmail,
        "VAULT SECURITY ALERT — Lockout Triggered",
        `Your vault was locked after 3 failed access attempts at ${entry.timestamp}. If this was not you, take immediate action.`
      );
    }

    if (status === "OTP BACKUP USED") {
      addAlert("OTP_BACKUP", "Backup OTP auth was used to unlock vault", email || null);
    }

    console.log(`🔔 ACCESS: ${status} | Time: ${entry.timestamp}`);
    res.status(200).json({ success: true, entry });
  } catch (err) {
    console.error("Access Endpoint Error:", err.message);
    res.status(500).json({ error: "Failed to record log" });
  }
});

app.post("/api/control", async (req, res) => {
  try {
    const { value, pin = "V2" } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: "Missing 'value' in control request." });
    }

    if (!BLYNK_TOKEN) {
      return res.status(503).json({ error: "Blynk token not configured" });
    }

    const url = `${BLYNK_BASE_URL}/update?token=${BLYNK_TOKEN}&${pin}=${value}`;
    const response = await axios.get(url);
    return res.json({ success: true, blynk_status: response.status });
  } catch (err) {
    return res.status(500).json({ error: "Blynk unreachable", detail: err.message });
  }
});

// ─── START ────────────────────────────────────────────────────
app.get("/api/alerts", (req, res) => {
  res.json({ count: securityAlerts.length, alerts: securityAlerts });
});

app.post("/api/passcode/request-change", async (req, res) => {
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
    passcodeOtpStore.set(email, { otp, expiresAt: Date.now() + 300000 });

    await transporter.sendMail({
      from: EMAIL_USER,
      to: email,
      subject: "Vault Passcode Change Authorization",
      text: `Your code to authorize vault passcode change is: ${otp}. Expires in 5 minutes. If you did not request this, secure your vault immediately.`
    });

    return res.json({ success: true, message: "Authorization code sent" });
  } catch (err) {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (email) passcodeOtpStore.delete(email);
    return res.status(500).json({ success: false, error: err.message || "Failed to send authorization code" });
  }
});

app.post("/api/passcode/verify-and-update", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
    const newSequence = req.body?.newSequence;

    if (!Array.isArray(newSequence) || newSequence.length !== 3) {
      return res.status(400).json({ success: false, message: "New sequence must contain exactly 3 steps" });
    }

    for (let index = 0; index < newSequence.length; index += 1) {
      const step = newSequence[index];
      if (typeof step !== "string" || !/^[01]{3}$/.test(step) || step === "000") {
        return res.status(400).json({ success: false, message: `Step ${index + 1} cannot be empty (000 means no touch)` });
      }
    }

    const storedOtp = passcodeOtpStore.get(email);

    if (!storedOtp) {
      return res.status(401).json({ success: false, message: "No authorization code requested" });
    }

    if (Date.now() > storedOtp.expiresAt) {
      passcodeOtpStore.delete(email);
      return res.status(401).json({ success: false, message: "Authorization code expired" });
    }

    if (storedOtp.otp !== otp) {
      return res.status(401).json({ success: false, message: "Invalid authorization code" });
    }

    passcodeOtpStore.delete(email);
    const sequenceString = newSequence.join("-");
    await blynkSet("V2", encodeURIComponent(sequenceString));
    addAlert("PASSCODE_CHANGED", "Vault access sequence updated", email);
    return res.json({ success: true, sequence: sequenceString });
  } catch (err) {
    const statusCode = err.message === "Blynk token not configured" ? 503 : 500;
    return res.status(statusCode).json({ success: false, error: err.message || "Failed to update sequence" });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ UPSIDE DESK - Backend Active on Port ${PORT}\n`);
});

module.exports = app;

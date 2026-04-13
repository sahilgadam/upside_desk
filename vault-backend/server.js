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

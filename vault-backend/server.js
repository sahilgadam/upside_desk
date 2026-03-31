/* vault-backend/server.js */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const BLYNK_TOKEN = process.env.BLYNK_TOKEN; // Set securely via Render environment
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

// ─── API ROUTES ───────────────────────────────────────────────

app.get("/api/status", (req, res) => {
  res.json({ system: "UPSIDE DESK", running: true, auth: !!BLYNK_TOKEN });
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

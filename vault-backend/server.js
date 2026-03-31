// ============================================================
//  UPSIDE DESK - Secure Backend Server (Refactored)
// ============================================================
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;
const BLYNK_TOKEN = process.env.BLYNK_TOKEN;
const BLYNK_BASE_URL = "https://blynk.cloud/external/api";

// ─── MIDDLEWARE ───────────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" })); 
app.use(express.json());

// ─── LOG STORE ────────────────────────────────────────────────
const accessLogs = [];
const timestamp = () => new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

// ─── ENDPOINTS ────────────────────────────────────────────────

// 1. Health Check
app.get("/", (req, res) => res.json({ status: "online", version: "1.0.1" }));

// 2. Blynk Webhook (/access)
app.post("/access", (req, res) => {
  try {
    const { status, flag } = req.body;
    if (!status) return res.status(400).json({ error: "Invalid payload from Blynk" });

    const logEntry = {
      id: Date.now(),
      status: status,
      flag: flag || "0",
      timestamp: timestamp(),
    };

    accessLogs.push(logEntry);
    console.log(`\n🔔 ACCESS EVENT: ${status} | Flag: ${flag}`);
    console.log(`   Time: ${logEntry.timestamp}`);
    res.status(200).json({ message: "Recorded" });
  } catch (err) {
    res.status(500).json({ error: "Failed to record log" });
  }
});

// 3. Fetch Logs (/logs)
app.get("/logs", (req, res) => res.json({ logs: accessLogs }));

// 4. Get Status (/status) - Proxies Blynk V0, V1
app.get("/status", async (req, res) => {
  try {
    const [resV0, resV1] = await Promise.all([
      axios.get(`${BLYNK_BASE_URL}/get?token=${BLYNK_TOKEN}&V0`),
      axios.get(`${BLYNK_BASE_URL}/get?token=${BLYNK_TOKEN}&V1`)
    ]);
    res.json({
      v0: resV0.data,
      v1: resV1.data
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch status from Blynk" });
  }
});

// 5. Send Control command (/control)
app.post("/control", async (req, res) => {
  const { value, pin = "V2" } = req.body; // value: 1 (unlock), 0 (lock)

  if (value === undefined) return res.status(400).json({ error: "Missing value" });

  try {
    const url = `${BLYNK_BASE_URL}/update?token=${BLYNK_TOKEN}&${pin}=${value}`;
    console.log(`🎮 Sending ${pin} Command: ${value}`);
    const response = await axios.get(url);
    res.json({ success: true, blynk_status: response.status });
  } catch (err) {
    console.error("❌ Blynk Link Error:", err.message);
    res.status(500).json({ error: "Blynk connection failed" });
  }
});

// ─── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   🔐 UPSIDE DESK - Backend Active       ║");
  console.log(`║   Port: ${PORT}                            ║`);
  console.log("╚══════════════════════════════════════════╝\n");
});

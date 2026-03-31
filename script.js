/**
 * Morse Code Digital Vault System
 * Modern, Real-time Web Dashboard
 */

// --- CONFIGURATION ---
const BLYNK_TOKEN = 'YOUR_DEFAULT_TOKEN'; // Replace with real token
const BLYNK_API_URL = 'https://blynk.cloud/external/api';
// Virtual Pins:
// V0: Access Status (String: "ACCESS GRANTED" or "ACCESS DENIED" or "LOCKED")
// V1: Sensor Result (Int/String: e.g. 1 or 0 or binary string)
// V2: Password Update (String)

// --- STATE ---
let isUnlocked = false;
let autoLockTimer = null;
let inactivityTimeout = 30; // seconds
let timeRemaining = inactivityTimeout;
let fetchInterval = null;

// Mock mode for UI testing if true. Leave false for production.
const MOCK_MODE = true;

// --- DOM ELEMENTS ---
const viewLock = document.getElementById('lock-screen');
const viewDashboard = document.getElementById('dashboard');
const lockIcon = document.getElementById('main-lock');
const lockIconContainer = document.getElementById('lock-icon-element');

// Status & Info
const accessStatusDisplay = document.getElementById('access-status-display');
const deviceStatusBadge = document.getElementById('device-status');
const lastAccessTimeEl = document.getElementById('last-access-time');
const lastResultTextEl = document.getElementById('last-result-text');
const autoLockTimerEl = document.getElementById('auto-lock-timer');

// Sensors
const sensorTouch1 = document.getElementById('sensor-touch1');
const sensorTouch2 = document.getElementById('sensor-touch2');
const sensorTouch3 = document.getElementById('sensor-touch3');
const rawSensorVal = document.getElementById('raw-sensor-val');

// Activity Log
const activityLogList = document.getElementById('activity-log-list');

// Buttons
const btnLock = document.getElementById('btn-lock');

// Password Form
const pwdForm = document.getElementById('password-form');
const oldPwdInput = document.getElementById('old-pwd');
const newPwdInput = document.getElementById('new-pwd');
const confirmPwdInput = document.getElementById('confirm-pwd');
const pwdMessage = document.getElementById('pwd-message');

// --- INIT ---
function init() {
    loadLogs();
    startPolling();
    
    // Interactions
    btnLock.addEventListener('click', lockVault);
    pwdForm.addEventListener('submit', handlePasswordChange);
    
    // User activity tracking for auto-lock
    document.addEventListener('mousemove', resetAutoLockTimerIfUnlocked);
    document.addEventListener('keydown', resetAutoLockTimerIfUnlocked);
    document.addEventListener('click', resetAutoLockTimerIfUnlocked);
}

// --- POLLING & DATA ---
async function startPolling() {
    fetchInterval = setInterval(async () => {
        if (MOCK_MODE) return; 

        try {
            // Fetch V0 (Status) and V1 (Sensors)
            const [resV0, resV1] = await Promise.all([
                fetch(`${BLYNK_API_URL}/get?token=${BLYNK_TOKEN}&V0`),
                fetch(`${BLYNK_API_URL}/get?token=${BLYNK_TOKEN}&V1`)
            ]);

            if (resV0.ok && resV1.ok) {
                const statusData = await resV0.json();
                const sensorData = await resV1.json();
                
                const status = Array.isArray(statusData) ? statusData[0] : statusData;
                const sensor = Array.isArray(sensorData) ? sensorData[0] : sensorData;

                updateDeviceStatus(true);
                handleNewData(status, sensor);
            } else {
                updateDeviceStatus(false);
            }
        } catch (error) {
            console.error("Blynk Fetch Error:", error);
            updateDeviceStatus(false);
        }
    }, 1500); // 1.5 seconds polling
}

function updateDeviceStatus(isOnline) {
    if (isOnline) {
        deviceStatusBadge.textContent = 'Online';
        deviceStatusBadge.className = 'badge online';
    } else {
        deviceStatusBadge.textContent = 'Offline';
        deviceStatusBadge.className = 'badge offline';
    }
}

let lastHandledStatus = "";

// Provide access on window for mock buttons if needed
window.handleNewData = function(status, sensorVal) {
    // Update Sensor display
    updateSensors(sensorVal);

    // Act on status changes
    if (status !== lastHandledStatus) {
        
        if (status === "ACCESS GRANTED" && !isUnlocked) {
            triggerUnlockSuccess();
            addLogEntry(status);
            lastResultTextEl.textContent = status;
        } else if (status === "ACCESS DENIED" && !isUnlocked) {
            triggerUnlockFail();
            addLogEntry(status);
            lastResultTextEl.textContent = status;
        }
        
        lastHandledStatus = status;
    }
}

function updateSensors(val) {
    // Update Raw Text
    rawSensorVal.textContent = val;
    
    // Convert to binary string of at least 3 digits to light up LEDs (touch sensors)
    let b = "000";
    if (typeof val === 'string' && val.length > 0) {
        // Just take the string right padded, assuming it outputs 1s and 0s
        b = val.padStart(3, '0').slice(-3);
    } else if (typeof val === 'number') {
        b = val.toString(2).padStart(3, '0').slice(-3);
    }

    if (b[0] === '1') sensorTouch1.classList.add('active'); else sensorTouch1.classList.remove('active');
    if (b[1] === '1') sensorTouch2.classList.add('active'); else sensorTouch2.classList.remove('active');
    if (b[2] === '1') sensorTouch3.classList.add('active'); else sensorTouch3.classList.remove('active');
}

// --- ANIMATIONS & TRANSITIONS ---

function triggerUnlockFail() {
    // Red flash and shake
    document.body.classList.add('denied-screen');
    lockIconContainer.classList.add('denied-anim');
    
    setTimeout(() => {
        document.body.classList.remove('denied-screen');
        lockIconContainer.classList.remove('denied-anim');
    }, 600);
}

function triggerUnlockSuccess() {
    isUnlocked = true;
    
    // Morph icon to unlock
    lockIcon.classList.remove('fa-lock');
    lockIcon.classList.add('fa-lock-open');
    lockIconContainer.classList.add('unlocking');

    // Wait 1s for animation to complete before revealing dash
    setTimeout(() => {
        viewLock.classList.remove('active');
        viewLock.classList.add('hidden');
        
        viewDashboard.classList.remove('hidden');
        viewDashboard.classList.add('active');
        
        updateDashboardStatusPanel("ACCESS GRANTED");
        startAutoLockTimer();
        lastAccessTimeEl.textContent = new Date().toLocaleTimeString();
        
    }, 1000);
}

function lockVault() {
    isUnlocked = false;
    stopAutoLockTimer();
    
    // Reset Lock UI
    lockIcon.classList.remove('fa-lock-open');
    lockIcon.classList.add('fa-lock');
    lockIconContainer.classList.remove('unlocking');
    
    // Switch views
    viewDashboard.classList.remove('active');
    viewDashboard.classList.add('hidden');
    
    viewLock.classList.remove('hidden');
    viewLock.classList.add('active');
    
    // Re-lock command to Blynk V0 
    fetch(`${BLYNK_API_URL}/update?token=${BLYNK_TOKEN}&V0=LOCKED`).catch(console.error);
    lastHandledStatus = "LOCKED";
}

function updateDashboardStatusPanel(status) {
    if (status === "ACCESS GRANTED") {
        accessStatusDisplay.className = "status-display granted";
        accessStatusDisplay.innerHTML = `
            <i class="fa-solid fa-check-circle"></i>
            <h3>ACCESS GRANTED</h3>
        `;
    } else {
        accessStatusDisplay.className = "status-display denied";
        accessStatusDisplay.innerHTML = `
            <i class="fa-solid fa-triangle-exclamation"></i>
            <h3>ACCESS DENIED</h3>
        `;
    }
}

// --- AUTO LOCK ---

function startAutoLockTimer() {
    timeRemaining = inactivityTimeout;
    updateAutoLockUI();
    
    autoLockTimer = setInterval(() => {
        timeRemaining--;
        updateAutoLockUI();
        
        if (timeRemaining <= 0) {
            lockVault();
        }
    }, 1000);
}

function stopAutoLockTimer() {
    if (autoLockTimer) clearInterval(autoLockTimer);
}

function resetAutoLockTimerIfUnlocked() {
    if (isUnlocked) {
        timeRemaining = inactivityTimeout;
        updateAutoLockUI();
    }
}

function updateAutoLockUI() {
    autoLockTimerEl.textContent = `Auto-lock in ${timeRemaining}s`;
}

// --- ACTIVITY LOG ---

function addLogEntry(status) {
    const time = new Date().toLocaleTimeString();
    const isSuccess = status === "ACCESS GRANTED";
    
    const logs = getLogs();
    logs.unshift({ time, action: status, isSuccess });
    
    if (logs.length > 10) logs.pop();
    
    localStorage.setItem('vault_logs_blynk', JSON.stringify(logs));
    renderLogs();
}

function getLogs() {
    try {
        const stored = localStorage.getItem('vault_logs_blynk');
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

function loadLogs() {
    renderLogs();
}

function renderLogs() {
    const logs = getLogs();
    activityLogList.innerHTML = '';
    
    if (logs.length === 0) {
        activityLogList.innerHTML = '<li style="color: #666; text-align: center; padding: 20px;">No recent activity in system log.</li>';
        return;
    }
    
    logs.forEach(log => {
        const li = document.createElement('li');
        li.className = `log-item ${log.isSuccess ? 'success' : 'fail'}`;
        li.innerHTML = `
            <span class="log-action"><i class="fa-solid ${log.isSuccess ? 'fa-unlock' : 'fa-ban'}"></i> ${log.action}</span>
            <span class="log-time">${log.time}</span>
        `;
        activityLogList.appendChild(li);
    });
}

// --- PASSWORD CHANGE ---

async function handlePasswordChange(e) {
    e.preventDefault();
    
    const oldP = oldPwdInput.value.trim();
    const newP = newPwdInput.value.trim();
    const confirmP = confirmPwdInput.value.trim();
    
    if (newP !== confirmP) {
        showPwdMessage("New sequences do not match!", "error");
        return;
    }
    if (!oldP || !newP) {
        showPwdMessage("Please provide all required fields.", "error");
        return;
    }
    
    const payload = `${oldP},${newP}`;
    
    try {
        const res = await fetch(`${BLYNK_API_URL}/update?token=${BLYNK_TOKEN}&V2=${encodeURIComponent(payload)}`);
        
        if (res.ok) {
            showPwdMessage("Verification sequence update dispatched successfully.", "success");
            pwdForm.reset();
            addLogEntry("PASSCODE UPDATED");
        } else {
            showPwdMessage("Failed to communicate with Vault ESP32.", "error");
        }
    } catch (error) {
        showPwdMessage("Error sending update request.", "error");
    }
}

function showPwdMessage(msg, type) {
    pwdMessage.textContent = msg;
    pwdMessage.className = type;
    pwdMessage.style.display = 'block';
    setTimeout(() => {
        pwdMessage.style.display = 'none';
        pwdMessage.className = '';
    }, 5000);
}

// Ensure startup when script parses
window.onload = init;

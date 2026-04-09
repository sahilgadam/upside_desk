import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, ShieldAlert, Lock, Unlock, Zap, Server, FileText, FileLock2, Image, Activity, ShieldHalf, KeyRound, Timer } from 'lucide-react';
import IrisTransition from './IrisTransition';
import useGlitchEffect from './hooks/useGlitchEffect.jsx';
import useVaultLogs from './hooks/useVaultLogs.js';
import './index.css';

const BACKEND_URL = 'http://localhost:3000';
const MOCK_MODE = false; // Set to true to test UI without hardware
const INACTIVITY_TIMEOUT = 30;

const App = () => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showIris, setShowIris] = useState(false);
  const { triggerGlitch, GlitchOverlay } = useGlitchEffect();
  const [accessStatus, setAccessStatus] = useState('LOCKED');
  const [sensorData, setSensorData] = useState('000');
  const [isOnline, setIsOnline] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(INACTIVITY_TIMEOUT);
  const [logs, setLogs] = useState([]);
  const { logs: backendLogs, isConnected: backendConnected } = useVaultLogs();

  // Merge backend logs with in-memory local logs
  const mergedLogs = (() => {
    const combined = [...logs, ...backendLogs];
    const seen = new Set();
    return combined.filter(l => {
      const key = `${l.action}-${l.time}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 20);
  })();
  
  // Data poll from backend proxy
  useEffect(() => {
    const interval = setInterval(async () => {
      if (MOCK_MODE) return;
      try {
        // FIXED: Added /api to the route
        const res = await fetch(`${BACKEND_URL}/api/status`);
        if (res.ok) {
          const data = await res.json();
          const sText = Array.isArray(data.v0) ? data.v0[0] : data.v0;
          const sVal = Array.isArray(data.v1) ? data.v1[0] : data.v1;
          
          setIsOnline(true);
          handleNewData(sText, sVal);
        } else {
          setIsOnline(false);
        }
      } catch (err) {
        setIsOnline(false);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [isUnlocked, accessStatus]);

  // Auto lock
  useEffect(() => {
    let timer;
    if (isUnlocked) {
      timer = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            handleLock();
            return INACTIVITY_TIMEOUT;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isUnlocked]);

  // Reset timer on user activity
  useEffect(() => {
    const handleActivity = () => {
      if (isUnlocked) setTimeRemaining(INACTIVITY_TIMEOUT);
    };
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [isUnlocked]);

  const handleNewData = (newStatus, newValue) => {
    setSensorData(String(newValue));
    if (newStatus !== accessStatus) {
      setAccessStatus(newStatus);
      if (newStatus === 'ACCESS GRANTED' && !isUnlocked) {
        setShowIris(true);
        addLog('ACCESS GRANTED', true);
      } else if (newStatus === 'ACCESS DENIED' && !isUnlocked) {
        triggerGlitch();
        addLog('ACCESS DENIED', false);
      }
    }
  };

  const addLog = (action, isSuccess) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [{ time, action, isSuccess }, ...prev].slice(0, 10));
  };

  const handleLock = () => {
    setIsUnlocked(false);
    setShowIris(false);
    setAccessStatus('LOCKED');
    if (!MOCK_MODE) {
      // FIXED: Added /api to the route
      fetch(`${BACKEND_URL}/api/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'LOCKED', pin: 'V0' }),
      }).catch(console.error);
    }
  };

  const mockSuccess = () => handleNewData('ACCESS GRANTED', '111');
  const mockFail = () => handleNewData('ACCESS DENIED', '000');

  return (
    <div className="app-wrapper">
      {GlitchOverlay}
      <style>{`
        .dashboard-enter { animation: dashEnter 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes dashEnter {
          from { opacity: 0; transform: translateY(32px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <IrisTransition 
        isOpen={showIris} 
        onComplete={() => { setIsUnlocked(true); setShowIris(false); }} 
      />

      <motion.div 
        className="ambient-glow"
        animate={{
          background: isUnlocked 
            ? 'radial-gradient(circle at 50% 50%, rgba(0, 255, 136, 0.05) 0%, rgba(13, 15, 18, 0) 70%)'
            : accessStatus === 'ACCESS DENIED' 
              ? 'radial-gradient(circle at 50% 50%, rgba(255, 51, 102, 0.08) 0%, rgba(13, 15, 18, 0) 70%)'
              : 'radial-gradient(circle at 50% 50%, rgba(0, 229, 255, 0.03) 0%, rgba(13, 15, 18, 0) 70%)'
        }}
        transition={{ duration: 1 }}
      />
      
      <AnimatePresence mode="wait">
        {!isUnlocked ? (
          <LockScreen 
            key="lock-screen" 
            status={accessStatus} 
            onMockSuccess={mockSuccess} 
            onMockFail={mockFail} 
          />
        ) : (
          <div className="dashboard-enter" style={{ width: '100%', height: '100%' }}>
            <Dashboard 
              onLock={handleLock} 
              timeRemaining={timeRemaining}
              isOnline={isOnline}
              sensorData={sensorData}
              logs={mergedLogs}
              backendConnected={backendConnected}
              url={BACKEND_URL}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const LockScreen = ({ status, onMockSuccess, onMockFail }) => {
  const isDenied = status === 'ACCESS DENIED';
  return (
    <motion.div 
      className="lock-view"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1, x: isDenied ? [-10, 10, -10, 10, 0] : 0 }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
    >
      <div className="lock-icon-wrapper" style={{ color: isDenied ? '#ff3366' : '#9ba4b5' }}>
        <Lock size={100} strokeWidth={1} />
      </div>
      <h1 className="title">VAULT LOCKED</h1>
      <p className="subtitle">Awaiting cryptographic Morse sequence...</p>
      <div className="morse-dots">
        {[0, 1, 2].map(i => (
          <motion.div key={i} className="pulse-dot" animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 2, delay: i * 0.4 }} />
        ))}
      </div>
      <div className="security-badge"><ShieldHalf size={16} /> MAXIMUM SECURITY LEVEL</div>
      {MOCK_MODE && (
        <div className="mock-controls">
          <button onClick={onMockSuccess} className="btn-mock success">Mock Grant</button>
          <button onClick={onMockFail} className="btn-mock fail">Mock Deny</button>
        </div>
      )}
    </motion.div>
  );
};

const Dashboard = ({ onLock, timeRemaining, isOnline, sensorData, logs, backendConnected, url }) => {
  const [sending, setSending] = React.useState(false);
  const [controlMsg, setControlMsg] = React.useState(null);
  const [lastCmd, setLastCmd] = React.useState(null);

  const sendControl = async (value) => {
    setSending(true);
    setControlMsg(null);
    const label = value === 1 ? 'unlock' : 'lock';
    setLastCmd(label);
    try {
      // FIXED: Added /api to the route
      const res = await fetch(`${url}/api/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, pin: 'V2' }),
      });
      const data = await res.json();
      if (res.ok) setControlMsg({ text: `✅ Command sent: ${label.toUpperCase()}`, ok: true });
      else setControlMsg({ text: `❌ Backend error: ${data.error}`, ok: false });
    } catch (err) { setControlMsg({ text: `❌ Network error: ${err.message}`, ok: false }); }
    finally { setSending(false); setTimeout(() => setControlMsg(null), 4000); }
  };

  return (
    <motion.div className="dashboard-view" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <nav className="glass-nav">
        <div className="brand"><ShieldCheck className="accent-green" size={28} /> DIGITAL VAULT</div>
        <div className="nav-actions">
          <div className="timer"><Timer size={16} /> {timeRemaining}s</div>
          <div className={`badge ${backendConnected ? 'badge-green' : 'badge-red'}`}><Server size={12} /> {backendConnected ? 'Backend ✓' : 'Backend ✗'}</div>
          <button onClick={onLock} className="btn-glass primary"><Lock size={16} /> Lock Now</button>
        </div>
      </nav>
      <div className="bento-grid">
        <div className="bento-card col-span-1 row-span-2 glass-panel center-content">
          < Unlock size={64} className="status-icon green-glow" />
          <h2 className="status-text accent-green">ACCESS GRANTED</h2>
          <p className="dim-text">Vault is securely open</p>
        </div>
        <div className="bento-card col-span-1 glass-panel">
          <h3 className="card-title"><Server size={18}/> System Telemetry</h3>
          <div className="telemetry-list">
            <div className="t-row"><span className="dim-text">Connection</span><span className={`badge ${isOnline ? 'badge-green' : 'badge-red'}`}>{isOnline ? 'Online' : 'Offline'}</span></div>
            <div className="t-row"><span className="dim-text">Encryption</span><span className="badge badge-blue">AES-256</span></div>
          </div>
        </div>
        <div className="bento-card col-span-1 glass-panel">
          <h3 className="card-title"><Zap size={18}/> Active Sensors</h3>
          <div className="sensor-array">
            {[0, 1, 2].map((idx) => {
              const binStr = Number(sensorData).toString(2).padStart(3, '0').slice(-3);
              const isActive = binStr[idx] === '1';
              return (
                <div key={idx} className="sensor-node">
                  <motion.div className={`sensor-light ${isActive ? 'active' : ''}`} animate={{ boxShadow: isActive ? '0 0 20px rgba(255, 204, 0, 0.8)' : 'none' }} />
                  <span>T{idx+1}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bento-card col-span-2 glass-panel">
          <h3 className="card-title"><Activity size={18}/> Activity Log</h3>
          <div className="logs-container">
            {logs.length === 0 ? <p className="dim-text text-center">No recent activity.</p> : logs.map((log, i) => (
              <div key={i} className={`log-row ${log.isSuccess ? 'border-green' : 'border-red'}`}>
                <span>{log.action}</span><span className="dim-text text-small">{log.time}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bento-card col-span-2 glass-panel">
          <h3 className="card-title"><KeyRound size={18}/> Vault Control Panel</h3>
          <div className="control-panel">
            <motion.button className="btn-control unlock" whileTap={{ scale: 0.95 }} disabled={sending} onClick={() => sendControl(1)}>
              {sending && lastCmd === 'unlock' ? '⏳ Sending...' : <><Unlock size={18} /> Unlock (V2=1)</>}
            </motion.button>
            <motion.button className="btn-control lock" whileTap={{ scale: 0.95 }} disabled={sending} onClick={() => sendControl(0)}>
              {sending && lastCmd === 'lock' ? '⏳ Sending...' : <><Lock size={18} /> Lock (V2=0)</>}
            </motion.button>
          </div>
          {controlMsg && <div className={`control-feedback ${controlMsg.ok ? 'ok' : 'err'}`}>{controlMsg.text}</div>}
        </div>
      </div>
    </motion.div>
  );
};

export default App;
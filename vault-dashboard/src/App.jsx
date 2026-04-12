import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Lock, Unlock, Zap, Server, Activity, ShieldHalf, KeyRound, Timer } from 'lucide-react';
import IrisTransition from './IrisTransition';
import useGlitchEffect from './hooks/useGlitchEffect.jsx';
import useVaultLogs from './hooks/useVaultLogs.js';
import './index.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const MOCK_MODE = false;
const INACTIVITY_TIMEOUT = 30;
const AUTH_STEPS = {
  REQUEST: 'REQUEST',
  VERIFY: 'VERIFY',
  GRANTED: 'GRANTED'
};

const readJsonSafely = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const App = () => {
  const [authStep, setAuthStep] = useState(AUTH_STEPS.REQUEST);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showIris, setShowIris] = useState(false);
  const [accessStatus, setAccessStatus] = useState('LOCKED');
  const [sensorData, setSensorData] = useState('000');
  const [isOnline, setIsOnline] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(INACTIVITY_TIMEOUT);
  const [logs, setLogs] = useState([]);
  const [userEmail, setUserEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { triggerGlitch, GlitchOverlay } = useGlitchEffect();
  const { logs: backendLogs, isConnected: backendConnected } = useVaultLogs();

  const mergedLogs = (() => {
    const combined = [...logs, ...backendLogs];
    const seen = new Set();

    return combined
      .filter((log) => {
        const key = `${log.action}-${log.time}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 20);
  })();

  useEffect(() => {
    const interval = setInterval(async () => {
      if (MOCK_MODE) return;

      try {
        const res = await fetch(`${BACKEND_URL}/api/status`);

        if (res.ok) {
          const data = await res.json();
          const nextStatus = Array.isArray(data.v0) ? data.v0[0] : data.v0;
          const nextValue = Array.isArray(data.v1) ? data.v1[0] : data.v1;

          setIsOnline(true);
          handleNewData(nextStatus, nextValue);
        } else {
          setIsOnline(false);
        }
      } catch {
        setIsOnline(false);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [accessStatus, authStep, isUnlocked]);

  useEffect(() => {
    let timer;

    if (isUnlocked) {
      timer = setInterval(() => {
        setTimeRemaining((previous) => {
          if (previous <= 1) {
            handleLock();
            return INACTIVITY_TIMEOUT;
          }

          return previous - 1;
        });
      }, 1000);
    }

    return () => clearInterval(timer);
  }, [isUnlocked]);

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

  const addLog = (action, isSuccess) => {
    const time = new Date().toLocaleTimeString();
    setLogs((previous) => [{ time, action, isSuccess }, ...previous].slice(0, 10));
  };

  const handleNewData = (newStatus, newValue) => {
    setSensorData(String(newValue));

    if (newStatus !== accessStatus) {
      setAccessStatus(newStatus);

      if (newStatus === 'ACCESS DENIED' && !isUnlocked && authStep !== AUTH_STEPS.GRANTED) {
        triggerGlitch();
        addLog('ACCESS DENIED', false);
      }

      if (newStatus === 'ACCESS GRANTED' && isUnlocked) {
        addLog('ACCESS GRANTED', true);
      }
    }
  };

  const resetAuthFlow = () => {
    setAuthStep(AUTH_STEPS.REQUEST);
    setUserEmail('');
    setOtp('');
    setOtpError('');
    setIsLoading(false);
  };

  const handleRequestOTP = async () => {
    const email = userEmail.trim();

    if (!email) {
      setOtpError('Email is required');
      return;
    }

    setIsLoading(true);
    setOtpError('');

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await readJsonSafely(response);

      if (!response.ok || !data.success) {
        setOtpError(data.error || data.message || 'Failed to send OTP');
        return;
      }

      setUserEmail(email);
      setOtp('');
      setOtpError('');
      setAuthStep(AUTH_STEPS.VERIFY);
    } catch {
      setOtpError('Unable to reach the backend. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    const code = otp.trim();

    if (!code) {
      setOtpError('OTP is required');
      return;
    }

    setIsLoading(true);
    setOtpError('');

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail.trim(), otp: code })
      });
      const data = await readJsonSafely(response);

      if (!response.ok || !data.success) {
        setOtpError(data.message || data.error || 'OTP verification failed');
        return;
      }

      setAuthStep(AUTH_STEPS.GRANTED);
      setOtp('');
      setOtpError('');
      setShowIris(true);
    } catch {
      setOtpError('Unable to reach the backend. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLock = () => {
    setIsUnlocked(false);
    setShowIris(false);
    setAccessStatus('LOCKED');
    setTimeRemaining(INACTIVITY_TIMEOUT);
    resetAuthFlow();

    if (!MOCK_MODE) {
      fetch(`${BACKEND_URL}/api/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'LOCKED', pin: 'V0' })
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
        onComplete={() => {
          setIsUnlocked(true);
          setShowIris(false);
          setTimeRemaining(INACTIVITY_TIMEOUT);
        }}
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
            authStep={authStep}
            userEmail={userEmail}
            otp={otp}
            otpError={otpError}
            isLoading={isLoading}
            onEmailChange={(value) => {
              setUserEmail(value);
              if (otpError) setOtpError('');
            }}
            onOtpChange={(value) => {
              setOtp(value.replace(/\D/g, '').slice(0, 6));
              if (otpError) setOtpError('');
            }}
            onRequestOTP={handleRequestOTP}
            onVerifyOTP={handleVerifyOTP}
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

const LockScreen = ({
  status,
  authStep,
  userEmail,
  otp,
  otpError,
  isLoading,
  onEmailChange,
  onOtpChange,
  onRequestOTP,
  onVerifyOTP,
  onMockSuccess,
  onMockFail
}) => {
  const isDenied = status === 'ACCESS DENIED';
  const isVerifyStep = authStep === AUTH_STEPS.VERIFY;

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
      <p className="subtitle">
        {isVerifyStep
          ? `Enter the 6-digit OTP sent to ${userEmail}.`
          : 'Enter your email to request a one-time vault access code.'}
      </p>
      <div className="morse-dots">
        {[0, 1, 2].map((index) => (
          <motion.div
            key={index}
            className="pulse-dot"
            animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 2, delay: index * 0.4 }}
          />
        ))}
      </div>
      <div className="security-badge">
        <ShieldHalf size={16} />
        MAXIMUM SECURITY LEVEL
      </div>

      <form
        className="auth-panel"
        onSubmit={(event) => {
          event.preventDefault();
          if (isVerifyStep) onVerifyOTP();
          else onRequestOTP();
        }}
      >
        {isVerifyStep ? (
          <>
            <div className="auth-field-group">
              <label className="auth-label" htmlFor="vault-otp">One-Time Password</label>
              <input
                id="vault-otp"
                className="auth-input auth-input-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(event) => onOtpChange(event.target.value)}
                placeholder="Enter 6-digit OTP"
                disabled={isLoading}
              />
              {otpError ? <p className="auth-error">{otpError}</p> : null}
            </div>
            <button type="submit" className="btn-glass primary auth-submit" disabled={isLoading}>
              {isLoading ? 'Verifying...' : 'Verify OTP'}
            </button>
            <button type="button" className="btn-glass auth-secondary" disabled={isLoading} onClick={onRequestOTP}>
              {isLoading ? 'Sending...' : 'Resend OTP'}
            </button>
          </>
        ) : (
          <>
            <div className="auth-field-group">
              <label className="auth-label" htmlFor="vault-email">Authorized Email</label>
              <input
                id="vault-email"
                className="auth-input"
                type="email"
                autoComplete="email"
                value={userEmail}
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder="you@example.com"
                disabled={isLoading}
              />
              {otpError ? <p className="auth-error">{otpError}</p> : null}
            </div>
            <button type="submit" className="btn-glass primary auth-submit" disabled={isLoading}>
              {isLoading ? 'Sending OTP...' : 'Request OTP'}
            </button>
          </>
        )}
      </form>

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
      const res = await fetch(`${url}/api/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, pin: 'V2' })
      });
      const data = await res.json();

      if (res.ok) setControlMsg({ text: `Command sent: ${label.toUpperCase()}`, ok: true });
      else setControlMsg({ text: `Backend error: ${data.error}`, ok: false });
    } catch (err) {
      setControlMsg({ text: `Network error: ${err.message}`, ok: false });
    } finally {
      setSending(false);
      setTimeout(() => setControlMsg(null), 4000);
    }
  };

  return (
    <motion.div className="dashboard-view" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <nav className="glass-nav">
        <div className="brand">
          <ShieldCheck className="accent-green" size={28} />
          DIGITAL VAULT
        </div>
        <div className="nav-actions">
          <div className="timer">
            <Timer size={16} />
            {timeRemaining}s
          </div>
          <div className={`badge ${backendConnected ? 'badge-green' : 'badge-red'}`}>
            <Server size={12} />
            {backendConnected ? 'Backend OK' : 'Backend Down'}
          </div>
          <button onClick={onLock} className="btn-glass primary">
            <Lock size={16} />
            Lock Now
          </button>
        </div>
      </nav>

      <div className="bento-grid">
        <div className="bento-card col-span-1 row-span-2 glass-panel center-content">
          <Unlock size={64} className="status-icon green-glow" />
          <h2 className="status-text accent-green">ACCESS GRANTED</h2>
          <p className="dim-text">Vault is securely open</p>
        </div>

        <div className="bento-card col-span-1 glass-panel">
          <h3 className="card-title">
            <Server size={18} />
            System Telemetry
          </h3>
          <div className="telemetry-list">
            <div className="t-row">
              <span className="dim-text">Connection</span>
              <span className={`badge ${isOnline ? 'badge-green' : 'badge-red'}`}>{isOnline ? 'Online' : 'Offline'}</span>
            </div>
            <div className="t-row">
              <span className="dim-text">Encryption</span>
              <span className="badge badge-blue">AES-256</span>
            </div>
          </div>
        </div>

        <div className="bento-card col-span-1 glass-panel">
          <h3 className="card-title">
            <Zap size={18} />
            Active Sensors
          </h3>
          <div className="sensor-array">
            {[0, 1, 2].map((index) => {
              const binary = Number(sensorData).toString(2).padStart(3, '0').slice(-3);
              const isActive = binary[index] === '1';

              return (
                <div key={index} className="sensor-node">
                  <motion.div
                    className={`sensor-light ${isActive ? 'active' : ''}`}
                    animate={{ boxShadow: isActive ? '0 0 20px rgba(255, 204, 0, 0.8)' : 'none' }}
                  />
                  <span>T{index + 1}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bento-card col-span-2 glass-panel">
          <h3 className="card-title">
            <Activity size={18} />
            Activity Log
          </h3>
          <div className="logs-container">
            {logs.length === 0 ? (
              <p className="dim-text text-center">No recent activity.</p>
            ) : (
              logs.map((log, index) => (
                <div key={index} className={`log-row ${log.isSuccess ? 'border-green' : 'border-red'}`}>
                  <span>{log.action}</span>
                  <span className="dim-text text-small">{log.time}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bento-card col-span-2 glass-panel">
          <h3 className="card-title">
            <KeyRound size={18} />
            Vault Control Panel
          </h3>
          <div className="control-panel">
            <motion.button className="btn-control unlock" whileTap={{ scale: 0.95 }} disabled={sending} onClick={() => sendControl(1)}>
              {sending && lastCmd === 'unlock' ? 'Sending...' : <><Unlock size={18} /> Unlock (V2=1)</>}
            </motion.button>
            <motion.button className="btn-control lock" whileTap={{ scale: 0.95 }} disabled={sending} onClick={() => sendControl(0)}>
              {sending && lastCmd === 'lock' ? 'Sending...' : <><Lock size={18} /> Lock (V2=0)</>}
            </motion.button>
          </div>
          {controlMsg ? <div className={`control-feedback ${controlMsg.ok ? 'ok' : 'err'}`}>{controlMsg.text}</div> : null}
        </div>
      </div>
    </motion.div>
  );
};

export default App;

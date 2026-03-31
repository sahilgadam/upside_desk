import React, { useEffect, useState } from 'react';

const IrisTransition = ({ isOpen, onComplete }) => {
  const [isFadingOut, setFadingOut] = useState(false);
  const [isDone, setDone] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    
    // Phase transition: 1000ms until fade starts, 1400ms until completion
    const t1 = setTimeout(() => setFadingOut(true), 1000);
    const t2 = setTimeout(() => {
      setDone(true);
      onComplete?.();
    }, 1400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isOpen, onComplete]);

  if (!isOpen || isDone) return null;

  const blades = Array.from({ length: 8 }, (_, i) => ({
    rotation: i * 45,
    delay: i * 55,
  }));

  return (
    <div className={`iris-overlay ${isFadingOut ? 'fade-out' : ''}`}>
      <style>{`
        .iris-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: #080c10;
          background-image: repeating-radial-gradient(
            circle at 50% 50%,
            transparent 0px,
            transparent 18px,
            #00ff8808 18px,
            #00ff8808 19px
          );
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          pointer-events: auto;
        }

        .iris-overlay.fade-out {
          animation: irisFadeOut 0.4s ease-in forwards;
        }

        @keyframes irisFadeOut {
          0%   { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.3); }
        }

        @keyframes bladeOpen {
          from { transform: rotate(0deg); }
          to   { transform: rotate(55deg); }
        }

        @keyframes glowBurst {
          0%   { transform: scale(0); opacity: 0; }
          40%  { opacity: 1; }
          100% { transform: scale(4); opacity: 0; }
        }

        .iris-svg {
          width: 140vmax;
          height: 140vmax;
          position: absolute;
          pointer-events: none;
        }

        .iris-blade {
          transform-origin: 92px 50px;
          transition: stroke 0.3s ease;
        }

        .iris-glow {
          position: absolute;
          width: 200px;
          height: 200px;
          border-radius: 50%;
          background: radial-gradient(circle, #00ff88 0%, #00ff8800 70%);
          box-shadow: 0 0 60px 30px #00ff8844, 0 0 120px 60px #00ff8822;
          pointer-events: none;
          opacity: 0;
        }

        .glow-burst {
          animation: glowBurst 1.4s ease-out forwards;
          animation-delay: 300ms;
        }

        .center-reveal {
          fill: #080c10;
        }
      `}</style>

      <svg viewBox="0 0 100 100" className="iris-svg">
        {blades.map((blade, i) => (
          <g key={i} style={{ transform: `rotate(${blade.rotation}deg)`, transformOrigin: '50px 50px' }}>
            <path
              className="iris-blade"
              d="M50,50 Q72,18 92,50 Q72,68 50,50"
              fill="#0d1f17"
              stroke="#00ff88"
              strokeWidth="0.4"
              style={{
                animation: `bladeOpen 0.8s cubic-bezier(0.34, 1.2, 0.64, 1) ${blade.delay}ms forwards`
              }}
            />
          </g>
        ))}
        {/* Dark center circle reveals as blades unwind */}
        <circle cx="50" cy="50" r="8" className="center-reveal" />
      </svg>

      <div className={`iris-glow ${isOpen ? 'glow-burst' : ''}`} />
    </div>
  );
};

export default IrisTransition;

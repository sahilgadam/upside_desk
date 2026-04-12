import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/**
 * useGlitchEffect Hook
 * Renders a timed glitch overlay (1.8s) when triggered.
 */
export function useGlitchEffect() {
  const [isGlitching, setIsGlitching] = useState(false);
  const timerRef = useRef(null);
  const glitchingRef = useRef(false);

  useEffect(() => {
    glitchingRef.current = isGlitching;
  }, [isGlitching]);

  const triggerGlitch = useCallback(() => {
    if (glitchingRef.current) return;
    glitchingRef.current = true;
    setIsGlitching(true);
    
    // Auto-stop after exactly 1.8 seconds
    timerRef.current = setTimeout(() => {
      glitchingRef.current = false;
      setIsGlitching(false);
    }, 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Generate unique scan bars each time a glitch starts
  const bars = useMemo(() => {
    if (!isGlitching) return [];
    return Array.from({ length: 5 }, () => ({
      top: Math.random() * 90 + '%',
      height: Math.random() * 10 + 2 + 'px',
      opacity: Math.random() * 0.2 + 0.1,
    }));
  }, [isGlitching]);

  const GlitchOverlay = isGlitching ? (
    <>
      <style>{`
        .glitch-red {
          position: fixed; inset: 0; z-index: 998;
          background: #ff224418;
          mix-blend-mode: screen;
          animation: shiftRed 0.15s steps(1) infinite;
          pointer-events: none;
        }
        .glitch-blue {
          position: fixed; inset: 0; z-index: 998;
          background: #0044ff18;
          mix-blend-mode: screen;
          animation: shiftBlue 0.15s steps(1) infinite;
          pointer-events: none;
        }
        .glitch-vignette {
          position: fixed; inset: 0; z-index: 997;
          background: transparent;
          box-shadow: inset 0 0 120px 40px #ff224466;
          animation: vignettePulse 0.4s ease-in-out infinite;
          pointer-events: none;
        }
        .scan-bar {
          position: fixed;
          left: 0;
          width: 100%;
          background: #ff2244;
          mix-blend-mode: overlay;
          z-index: 999;
          pointer-events: none;
          animation: barFlash 0.2s steps(1) infinite;
        }

        @keyframes shiftRed {
          0%  { transform: translateX(0px) translateY(0px); }
          25% { transform: translateX(8px) translateY(-2px); }
          50% { transform: translateX(-6px) translateY(1px); }
          75% { transform: translateX(4px) translateY(3px); }
        }
        @keyframes shiftBlue {
          0%  { transform: translateX(0px); }
          25% { transform: translateX(-8px) translateY(2px); }
          50% { transform: translateX(6px) translateY(-1px); }
          75% { transform: translateX(-4px) translateY(-3px); }
        }
        @keyframes vignettePulse {
          0%, 100% { opacity: 0; }
          50%       { opacity: 1; }
        }
        @keyframes barFlash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
      <div className="glitch-vignette" />
      <div className="glitch-red" />
      <div className="glitch-blue" />
      {bars.map((bar, i) => (
        <div 
          key={i} 
          className="scan-bar" 
          style={{ 
            top: bar.top, 
            height: bar.height, 
            opacity: bar.opacity 
          }} 
        />
      ))}
    </>
  ) : null;

  return { triggerGlitch, isGlitching, GlitchOverlay };
}

export default useGlitchEffect;

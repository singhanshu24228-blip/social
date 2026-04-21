import React, { useEffect, useState, useRef } from 'react';
import { getTimeUntilNightMode, enterNightMode } from '../services/api';

interface TimeInfo {
  isCurrentlyInNightMode: boolean;
  isInEntryWindow: boolean;
  timeUntilNightMode: number | null;
  timeUntilDayMode: number | null;
  message: string;
  formattedTimeUntilNightMode: string | null;
}

interface NightModePanelProps {
  onEnterNightMode?: (success: boolean) => void;
}

const NightModePanel: React.FC<NightModePanelProps> = ({ onEnterNightMode }) => {
  const [timeInfo, setTimeInfo] = useState<TimeInfo | null>(null);
  const [attempting, setAttempting] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [stars, setStars] = useState<{ x: number; y: number; size: number; opacity: number; speed: number }[]>([]);
  const [pulse, setPulse] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const isLoading = !timeInfo;

  const fallbackTimeInfo: TimeInfo = {
    isCurrentlyInNightMode: false,
    isInEntryWindow: false,
    timeUntilNightMode: null,
    timeUntilDayMode: null,
    message: isLoading ? 'Loading night mode info…' : 'Night mode info unavailable.',
    formattedTimeUntilNightMode: null,
  };

  // Generate stars
  useEffect(() => {
    const generated = Array.from({ length: 80 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.5 + 0.5,
      opacity: Math.random() * 0.7 + 0.3,
      speed: Math.random() * 2 + 1,
    }));
    setStars(generated);
  }, []);

  // Pulse moon periodically
  useEffect(() => {
    const interval = setInterval(() => setPulse(p => !p), 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchTimeInfo();
    const interval = setInterval(fetchTimeInfo, 30000);
    const countdownInterval = setInterval(updateCountdown, 1000);
    return () => {
      clearInterval(interval);
      clearInterval(countdownInterval);
    };
  }, []);

  const fetchTimeInfo = async () => {
    try {
      const response = await getTimeUntilNightMode();
      setTimeInfo(response.data);
      setError('');
      updateCountdown(response.data);
    } catch (err: any) {
      const status = err?.response?.status;
      const statusText = err?.response?.statusText;
      const hint = status ? `Request failed (${status}${statusText ? ` ${statusText}` : ''}).` : 'Network error.';
      setError(`${hint} Check your API URL.`);
      setTimeInfo((prev) => prev ?? fallbackTimeInfo);
    }
  };

  const updateCountdown = (data?: TimeInfo) => {
    const info = data || timeInfo;
    const remainingMs = info?.isCurrentlyInNightMode ? info?.timeUntilDayMode : info?.timeUntilNightMode;
    if (typeof remainingMs === 'number' && remainingMs > 0) {
      const seconds = Math.floor(remainingMs / 1000);
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      if (hours > 0) setTimeLeft(`${hours}h ${minutes}m`);
      else if (minutes > 0) setTimeLeft(`${minutes}m ${secs}s`);
      else setTimeLeft(`${secs}s`);
    } else {
      setTimeLeft('');
    }
  };

  const handleEnterNightMode = async () => {
    setAttempting(true);
    setError('');
    try {
      const response = await enterNightMode();
      if (response.data.success) {
        onEnterNightMode?.(true);
      } else {
        setError(response.data.message || 'Failed to enter night mode');
        onEnterNightMode?.(false);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error entering night mode');
      onEnterNightMode?.(false);
    } finally {
      setAttempting(false);
    }
  };

  const displayInfo = timeInfo || fallbackTimeInfo;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      minHeight: '420px',
      borderRadius: '24px',
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '36px 24px',
      boxShadow: '0 0 60px rgba(139,92,246,0.3), 0 0 120px rgba(88,28,135,0.2)',
    }}>
      {/* Starfield */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {stars.map((star, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              borderRadius: '50%',
              background: 'white',
              opacity: star.opacity,
              animation: `twinkle ${star.speed}s ease-in-out infinite alternate`,
            }}
          />
        ))}
      </div>

      {/* Nebula glows */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 20% 50%, rgba(139,92,246,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(219,39,119,0.1) 0%, transparent 60%)',
      }} />

      {/* Moon */}
      <div style={{
        fontSize: '80px',
        lineHeight: 1,
        marginBottom: '20px',
        filter: 'drop-shadow(0 0 20px rgba(196,181,253,0.8)) drop-shadow(0 0 40px rgba(139,92,246,0.5))',
        transition: 'transform 0.6s ease',
        transform: pulse ? 'scale(1.08) rotate(-5deg)' : 'scale(1) rotate(0deg)',
        cursor: displayInfo.isInEntryWindow ? 'pointer' : 'default',
      }} onClick={displayInfo.isInEntryWindow ? handleEnterNightMode : undefined}>
        🌙
      </div>

      {/* Title */}
      <h2 style={{
        fontSize: '28px',
        fontWeight: 800,
        letterSpacing: '0.05em',
        background: 'linear-gradient(90deg, #c4b5fd, #f472b6, #818cf8)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        marginBottom: '8px',
        textAlign: 'center',
      }}>
        Night Mode
      </h2>

      <p style={{ color: '#a78bfa', fontSize: '13px', textAlign: 'center', marginBottom: '24px', opacity: 0.85, maxWidth: '280px' }}>
        {displayInfo.message}
      </p>

      {/* Countdown badge */}
      {timeLeft && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: '20px',
          padding: '12px 28px',
          borderRadius: '16px',
          background: 'rgba(139,92,246,0.15)',
          border: '1px solid rgba(139,92,246,0.35)',
          backdropFilter: 'blur(8px)',
        }}>
          <span style={{ fontSize: '11px', color: '#c4b5fd', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
            {displayInfo.isCurrentlyInNightMode ? 'Until Day Mode' : 'Until Night Mode'}
          </span>
          <span style={{
            fontSize: '32px',
            fontWeight: 700,
            color: '#f0abfc',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '0.02em',
          }}>{timeLeft}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          marginBottom: '16px',
          padding: '10px 16px',
          borderRadius: '10px',
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.4)',
          color: '#fca5a5',
          fontSize: '13px',
          textAlign: 'center',
          maxWidth: '320px',
        }}>
          {error}
        </div>
      )}

      {/* Enter button */}
      {displayInfo.isInEntryWindow && (
        <button
          onClick={handleEnterNightMode}
          disabled={attempting}
          style={{
            padding: '14px 36px',
            borderRadius: '50px',
            border: 'none',
            background: attempting
              ? 'rgba(139,92,246,0.4)'
              : 'linear-gradient(135deg, #7c3aed, #db2777)',
            color: 'white',
            fontSize: '15px',
            fontWeight: 700,
            cursor: attempting ? 'not-allowed' : 'pointer',
            boxShadow: '0 0 30px rgba(139,92,246,0.5)',
            transition: 'all 0.3s ease',
            letterSpacing: '0.03em',
            opacity: attempting ? 0.7 : 1,
          }}
          onMouseEnter={e => { if (!attempting) (e.target as HTMLElement).style.transform = 'scale(1.05)'; }}
          onMouseLeave={e => { (e.target as HTMLElement).style.transform = 'scale(1)'; }}
        >
          {attempting ? '✨ Entering...' : '🌙 Enter Night Mode'}
        </button>
      )}

      {/* Info text */}
      <div style={{
        marginTop: '20px',
        padding: '10px 16px',
        borderRadius: '10px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        textAlign: 'center',
      }}>
        <p style={{ color: '#6b7280', fontSize: '12px', marginBottom: '2px' }}>Available: 10:00 PM – 3:30 AM</p>
        <p style={{ color: '#6b7280', fontSize: '12px' }}>Stays active until 5:00 AM once entered</p>
      </div>

      <style>{`
        @keyframes twinkle {
          0% { opacity: 0.2; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
};

export default NightModePanel;

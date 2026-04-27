import React, { useState } from 'react';
import { enterNightMode } from '../services/api';

interface NightModePanelProps {
  onEnterNightMode?: (success: boolean) => void;
}

const NightModePanel: React.FC<NightModePanelProps> = ({ onEnterNightMode }) => {
  const [attempting, setAttempting] = useState(false);
  const [error, setError] = useState('');
  const [isPressed, setIsPressed] = useState(false);
  const [books] = useState(() =>
    Array.from({ length: 6 }, (_, i) => ({
      emoji: ['📚', '📖', '✏️', '🔬', '📐', '💡'][i],
      x: Math.random() * 85 + 5,
      y: Math.random() * 75 + 10,
      delay: Math.random() * 3,
      size: '1.1rem',
    }))
  );

  const handleEnterStudyMode = async () => {
    if (attempting) return;
    setAttempting(true);
    setError('');
    try {
      const response = await enterNightMode();
      if (response.data.success) {
        onEnterNightMode?.(true);
      } else {
        setError(response.data.message || 'Failed to enter Study Mode');
        onEnterNightMode?.(false);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error entering Study Mode');
      onEnterNightMode?.(false);
    } finally {
      setAttempting(false);
    }
  };

  return (
    <div className="relative w-full rounded-3xl overflow-hidden flex flex-col items-center justify-center py-10 px-5 sm:py-12 sm:px-6"
      style={{
        minHeight: '420px',
        background: 'linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)',
        boxShadow: '0 25px 50px -12px rgba(139, 92, 246, 0.25), 0 0 80px rgba(251, 191, 36, 0.1)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
      }}
    >
      {/* Floating study icons */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {books.map((b, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${b.x}%`,
            top: `${b.y}%`,
            fontSize: b.size,
            opacity: .25,
            animation: `float-icon ${3 + b.delay}s ease-in-out infinite alternate`,
          }}>{b.emoji}</div>
        ))}
      </div>

      {/* Glow background */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 30% 50%,rgba(251,191,36,.08) 0%,transparent 60%), radial-gradient(ellipse at 70% 20%,rgba(59,130,246,.08) 0%,transparent 60%)',
        }}
      />

      {/* Icon */}
      <div className="relative z-10 text-6xl sm:text-7xl mb-5"
        style={{
          filter: 'drop-shadow(0 0 30px rgba(251,191,36,.6))',
          animation: 'float-icon 3s ease-in-out infinite alternate',
        }}
      >
        📚
      </div>

      {/* Title */}
      <h2 className="relative z-10 text-2xl sm:text-3xl font-extrabold text-center mb-3"
        style={{
          letterSpacing: '.04em',
          background: 'linear-gradient(90deg,#fbbf24,#60a5fa,#a78bfa)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        Study Mode
      </h2>

      {/* Description */}
      <p className="relative z-10 text-slate-400 text-sm sm:text-base text-center mb-3 px-4 max-w-xs">
        Collaborate with classmates, open cameras, share notes & discuss problems
      </p>

      {/* Feature tags */}
      <div className="relative z-10 flex flex-wrap gap-2 sm:gap-4 justify-center text-xs sm:text-sm text-slate-500 mb-6 px-2">
        <span className="flex items-center gap-1">🎥 Video rooms</span>
        <span className="flex items-center gap-1">💬 Live chat</span>
        <span className="flex items-center gap-1">📤 Share files</span>
      </div>

      {/* Error message */}
      {error && (
        <div className="relative z-10 w-full max-w-xs mb-4 px-4 py-2.5 rounded-xl text-center text-sm"
          style={{
            background: 'rgba(239,68,68,.12)',
            border: '1px solid rgba(239,68,68,.4)',
            color: '#fca5a5',
          }}
        >
          {error}
        </div>
      )}

      {/* Enter button - larger touch target */}
      <button
        onClick={handleEnterStudyMode}
        onTouchStart={() => setIsPressed(true)}
        onTouchEnd={() => setIsPressed(false)}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onMouseLeave={() => setIsPressed(false)}
        disabled={attempting}
        className={`relative z-10 px-8 sm:px-10 py-3.5 sm:py-4 rounded-full border-none font-bold text-sm sm:text-base
          transition-all duration-200 touch-manipulation select-none active:scale-95
          ${attempting
            ? 'cursor-not-allowed opacity-70'
            : isPressed
              ? 'scale-95'
              : 'hover:scale-105 hover:shadow-lg'
          }`}
        style={{
          background: attempting
            ? 'rgba(251,191,36,.4)'
            : 'linear-gradient(135deg,#fbbf24,#f59e0b)',
          color: '#0f172a',
          boxShadow: '0 0 30px rgba(251,191,36,.4)',
          letterSpacing: '.02em',
          minHeight: '48px',
          minWidth: '200px',
        }}
      >
        {attempting ? '⏳ Entering…' : '📚 Enter Study Mode'}
      </button>

      {/* Footer note */}
      <p className="relative z-10 text-slate-500 text-xs sm:text-sm mt-4 text-center px-4">
        Admin approval required · Available 24/7
      </p>

      <style>{`
        @keyframes float-icon {
          0% { transform: translateY(0) rotate(-5deg); opacity: .15; }
          100% { transform: translateY(-12px) rotate(5deg); opacity: .35; }
        }
      `}</style>
    </div>
  );
};

export default NightModePanel;

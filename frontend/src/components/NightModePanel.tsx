import React, { useEffect, useState } from 'react';
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

  const isLoading = !timeInfo;

  const fallbackTimeInfo: TimeInfo = {
    isCurrentlyInNightMode: false,
    isInEntryWindow: false,
    timeUntilNightMode: null,
    timeUntilDayMode: null,
    message: isLoading ? 'Loading night mode info…' : 'Night mode info unavailable.',
    formattedTimeUntilNightMode: null,
  };

  useEffect(() => {
    // Initial fetch
    fetchTimeInfo();
    
    // Update every 30 seconds
    const interval = setInterval(fetchTimeInfo, 30000);
    
    // Update countdown every second
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
      console.error('Error fetching time info:', err);
      const status = err?.response?.status;
      const statusText = err?.response?.statusText;
      const hint = status
        ? `Request failed (${status}${statusText ? ` ${statusText}` : ''}).`
        : 'Network error.';
      setError(`${hint} Check your production API URL (VITE_API_URL) / reverse proxy.`);
      // Unblock UI so users can see the entry point (disabled) + error message.
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

      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${secs}s`);
      } else {
        setTimeLeft(`${secs}s`);
      }
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
      const message = err.response?.data?.message || 'Error entering night mode';
      setError(message);
      onEnterNightMode?.(false);
    } finally {
      setAttempting(false);
    }
  };

  const displayInfo = timeInfo || fallbackTimeInfo;

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Show entry point during entry window or daytime */}
      <div className="flex flex-col items-center justify-center p-4 space-y-6">
        {/* Moon Icon Entry Point */}
        <button
          onClick={handleEnterNightMode}
          disabled={attempting || !displayInfo.isInEntryWindow}
          className="text-8xl hover:scale-110 transition-transform duration-300 cursor-pointer animate-pulse disabled:opacity-50"
          title={displayInfo.isInEntryWindow ? "Click to enter Night Mode" : "Night Mode not available now"}
        >
          🌙
        </button>

        {/* Message */}
        <div className="text-center space-y-2">
          <p className="text-xl font-semibold text-gray-700">{displayInfo.message}</p>
          {timeLeft && (
            <p className="text-lg text-gray-500">
              {displayInfo.isCurrentlyInNightMode ? 'Time until Day Mode:' : 'Time until Night Mode:'}{' '}
              <span className="font-bold text-gray-700">{timeLeft}</span>
            </p>
          )}
          {isLoading && !error && (
            <p className="text-sm text-gray-400">Fetching latest window from server…</p>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="text-red-500 text-center p-3 bg-red-50 rounded-lg w-full">
            {error}
          </div>
        )}

        {/* Try Now Button - Only shown if we can enter */}
        {displayInfo.isInEntryWindow && (
          <button
            onClick={handleEnterNightMode}
            disabled={attempting}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {attempting ? 'Entering...' : 'Enter Night Mode Now 🌙'}
          </button>
        )}

        {/* Info Text */}
        <div className="text-sm text-gray-500 text-center mt-4">
          <p>Night Mode is available from 10:00 PM to 3:30 AM</p>
          <p>Once entered, stay in exclusive Night Mode until 5:00 AM</p>
        </div>
      </div>
    </div>
  );
};

export default NightModePanel;

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
    } catch (err) {
      console.error('Error fetching time info:', err);
    }
  };

  const updateCountdown = (data?: TimeInfo) => {
    const info = data || timeInfo;
    if (info?.timeUntilNightMode) {
      const seconds = Math.floor(info.timeUntilNightMode / 1000);
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

  if (!timeInfo) {
    return (
      <div className="flex items-center justify-center p-8 min-h-screen">
        <div className="text-center">
          <div className="text-gray-500 mb-4">Loading night mode info...</div>
          <div className="bg-blue-100 border border-blue-400 p-4 rounded text-sm text-left max-w-md">
            <p className="font-bold mb-2">🔍 NightModePanel Debug:</p>
            <p>Component mounted: ✓</p>
            <p>Fetching time info...</p>
            {error && <p className="text-red-600 mt-2">Error: {error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Show entry point during entry window or daytime */}
      <div className="flex flex-col items-center justify-center p-4 space-y-6">
        {/* Moon Icon Entry Point */}
        <button
          onClick={handleEnterNightMode}
          disabled={attempting || !timeInfo.isInEntryWindow}
          className="text-8xl hover:scale-110 transition-transform duration-300 cursor-pointer animate-pulse disabled:opacity-50"
          title={timeInfo.isInEntryWindow ? "Click to enter Night Mode" : "Night Mode not available now"}
        >
          🌙
        </button>

        {/* Message */}
        <div className="text-center space-y-2">
          <p className="text-xl font-semibold text-gray-700">{timeInfo.message}</p>
          {timeLeft && (
            <p className="text-lg text-gray-500">
              {timeInfo.isInEntryWindow ? 'Time until Day Mode:' : 'Time until Night Mode:'} <span className="font-bold text-gray-700">{timeLeft}</span>
            </p>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="text-red-500 text-center p-3 bg-red-50 rounded-lg w-full">
            {error}
          </div>
        )}

        {/* Try Now Button - Only shown if we can enter */}
        {timeInfo.isInEntryWindow && (
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

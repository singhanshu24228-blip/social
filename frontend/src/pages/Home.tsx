import React, { useEffect, useState } from 'react';
import { connectSocket, getSocket } from '../services/socket';
import { getNightModeStatus } from '../services/api';
import NightModePanel from '../components/NightModePanel';
import NightInterface from '../components/NightInterface';

export default function Home() {
  const [msg, setMsg] = useState('');
  const [isInNightMode, setIsInNightMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = localStorage.getItem('user');
    console.log('Home: user found?', !!user);
    
    if (!user) {
      setMsg('Please login first');
      setLoading(false);
      return;
    }

    const s = connectSocket();
    s.on('connect_error', (err) => console.error('Socket error', err));
    checkNightModeStatus();

    return () => {
      const sock = getSocket();
      if (sock) sock.disconnect();
    };
  }, []);

  const checkNightModeStatus = async () => {
    try {
      const response = await getNightModeStatus();
      console.log('Night mode status:', response.data);
      if (response.data && response.data.user) {
        setIsInNightMode(response.data.isInNightMode);
      }
    } catch (err: any) {
      console.error('Error checking night mode status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEnterNightMode = (success: boolean) => {
    console.log('Enter night mode result:', success);
    if (success) {
      setIsInNightMode(true);
    }
  };

  const handleExitNightMode = () => {
    console.log('Exiting night mode');
    setIsInNightMode(false);
  };

  const user = localStorage.getItem('user');

  if (loading) {
    return (
      <div className="max-w-md md:max-w-2xl lg:max-w-4xl mx-auto p-4">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md md:max-w-2xl lg:max-w-4xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Home</h1>
        {msg && <p className="text-red-500 mb-4">{msg}</p>}
      </div>
    );
  }

  // Show Night Interface if user is in night mode
  if (isInNightMode) {
    console.log('Showing NightInterface');
    return <NightInterface onExitNightMode={handleExitNightMode} />;
  }

  // Show normal feed with night mode entry point
  console.log('Showing NightModePanel');
  return (
    <div className="w-full min-h-screen bg-white">
      {/* DEBUG PANEL */}
      <div className="fixed top-0 left-0 right-0 bg-yellow-100 border-2 border-yellow-400 p-4 z-50">
        <p className="text-sm font-bold">🔍 DEBUG: Home Component</p>
        <p className="text-xs">User: {user ? '✓ Logged' : '✗ No'}</p>
        <p className="text-xs">Loading: {loading ? '✓ Yes' : '✗ No'}</p>
        <p className="text-xs">isInNightMode: {isInNightMode ? '✓ Yes' : '✗ No'}</p>
      </div>
      
      <div className="pt-20">
        <NightModePanel onEnterNightMode={handleEnterNightMode} />
      </div>
    </div>
  );
}

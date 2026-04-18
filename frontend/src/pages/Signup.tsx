import React, { useState } from 'react';
import api from '../services/api';

export default function Signup() {
  const [form, setForm] = useState({ username: '', name: '', email: '', phone: '', password: '' });
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [noGeo, setNoGeo] = useState(false);

  const doSignup = async (payload: any) => {
    try {
      setLoading(true);
      const res = await api.post('/auth/signup', payload);
      // Server sets auth cookies (access + refresh + csrf). Save user locally for UI state.
      if (res.data.user) localStorage.setItem('user', JSON.stringify(res.data.user));
      // Optional: backend can expose a Bearer token for cross-domain deployments.
      if (res.data.accessToken) localStorage.setItem('access_token', String(res.data.accessToken));
      setMsg('Signed up and logged in');
      // Navigate to message page
      window.location.replace('/message');
    } catch (err: any) {
      setMsg(err?.response?.data?.message || err?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  }; 

  const handleSignup = async () => {
    try {
      console.debug('handleSignup called');
      // Request geolocation
      if (!navigator.geolocation) {
        setMsg('Geolocation not supported. You can sign up without location if you prefer.');
        setNoGeo(true);
        return;
      }
      navigator.geolocation.getCurrentPosition(async (pos) => {
        console.debug('Got geolocation', pos);
        const coords = [pos.coords.longitude, pos.coords.latitude];
        const payload = {
          ...form,
          location: { type: 'Point', coordinates: coords },
        };
        await doSignup(payload);
      }, (err) => {
        console.warn('Geolocation failed', err);
        setMsg('Location permission required. You can sign up without location if you prefer.');
        setNoGeo(true);
      }, { timeout: 10000 });
    } catch (err: any) {
      console.error('Signup error', err);
      setMsg(err?.response?.data?.message || err?.message || 'Signup failed');
    }
  };

  const signUpWithoutLocation = async () => {
    // Use fallback coordinates (0,0) so backend receives a location object and validation passes
    const payload = {
      ...form,
      location: { type: 'Point', coordinates: [0, 0] },
    };
    await doSignup(payload);
  };

  return (
    <div className="h-screen overflow-hidden flex items-center justify-center bg-gradient-to-br from-slate-900 via-black to-purple-900 p-4">
      <div className="w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto bg-white/85 backdrop-blur-md rounded-3xl shadow-2xl border border-white/20 p-6">
        <div className="mb-4 text-center">
          <h2 className="text-3xl font-extrabold text-slate-800">Create your account</h2>
          <p className="text-sm text-slate-500 mt-1">Join Sociovio and connect with friends instantly.</p>
        </div>

        <div className="space-y-3">
          <input
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
          />
          <input
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
          />
          <input
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
          />
          <input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
          />
          <input
            placeholder="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
          />
        </div>
        <div  >By sign up you agree to our <a className="text-blue-700 cursor-pointer hover:underline" onClick={() => window.location.replace('/termandcondition')}>Terms & condition</a> and <a className='text-blue-700 cursor-pointer hover:underline' onClick={() => window.location.replace('/PrivacyPolicy')}>Privacy Policy</a></div>
        <button
          onClick={handleSignup}
          disabled={loading}
          className="w-full mt-5 px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold rounded-xl shadow-lg hover:from-indigo-600 hover:to-purple-600 transition-opacity disabled:opacity-50"
        >
          {loading ? 'Signing up...' : 'Sign up'}
        </button>

        {noGeo && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg">
            <p className="text-sm">Location not available — use fallback coordinates by signing up without location.</p>
            <button
              onClick={signUpWithoutLocation}
              disabled={loading}
              className="mt-2 w-full px-3 py-2 bg-slate-100 rounded-lg text-slate-700 hover:bg-slate-200"
            >
              Sign up without location
            </button>
          </div>
        )}

        {msg && <p className="mt-4 text-center text-sm font-medium text-red-600">{msg}</p>}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import api from '../services/api';

export default function Signup() {
  const [form, setForm] = useState({ username: '', name: '', email: '', phone: '', password: '', educationLevel: '' });
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
      if (!form.educationLevel) {
        setMsg('Please select your highest education level');
        return;
      }
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
    <div className="min-h-screen overflow-y-auto flex items-start justify-center bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950 px-4 pt-24 pb-6 relative">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-24 sm:-left-20 w-80 sm:w-72 h-80 sm:h-72 bg-purple-600/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-24 sm:-right-20 w-96 sm:w-96 h-96 sm:h-96 bg-indigo-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-pink-600/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm sm:max-w-md max-h-[calc(100vh-8rem)] overflow-y-auto bg-gradient-to-b from-white/95 to-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 px-5 sm:px-6 py-5 sm:py-6 relative z-10">
        <div className="mb-5 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Create account</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">Join Sociovio and connect</p>
        </div>

        <div className="space-y-3">
          <input
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className="w-full p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm transition-all text-base"
            autoComplete="username"
          />
          <input
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm transition-all text-base"
            autoComplete="name"
          />
          <input
            placeholder="Email address"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm transition-all text-base"
            autoComplete="email"
            inputMode="email"
          />
          <input
            placeholder="Phone number"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm transition-all text-base"
            autoComplete="tel"
            inputMode="tel"
          />
          <div>
            <label className="sr-only" htmlFor="educationLevel">Education Level</label>
            <select
              id="educationLevel"
              value={form.educationLevel}
              onChange={(e) => setForm({ ...form, educationLevel: e.target.value })}
              className="w-full p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm transition-all text-base"
            >
              <option value="">Select education level</option>
              <option value="Matriculation">Matriculation</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Undergraduate">Undergraduate</option>
              <option value="Postgraduate">Postgraduate</option>
            </select>
          </div>
          <input
            placeholder="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm transition-all text-base"
            autoComplete="new-password"
          />
        </div>
        <div className="mt-3 text-xs text-slate-500 leading-relaxed">By signing up you agree to our <a className="text-indigo-600 cursor-pointer hover:underline" onClick={() => window.location.replace('/termandcondition')}>Terms & Conditions</a> and <a className='text-indigo-600 cursor-pointer hover:underline' onClick={() => window.location.replace('/PrivacyPolicy')}>Privacy Policy</a></div>
        <button
          onClick={handleSignup}
          disabled={loading}
          className="w-full mt-4 px-4 py-3.5 sm:py-4 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white font-bold rounded-xl shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-base touch-manipulation"
        >
          {loading ? 'Signing up...' : 'Create Account'}
        </button>

        {noGeo && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl">
            <p className="text-xs sm:text-sm">Location not available — you can sign up without location.</p>
            <button
              onClick={signUpWithoutLocation}
              disabled={loading}
              className="mt-2 w-full py-2.5 px-3 bg-gradient-to-r from-amber-400 to-orange-400 text-slate-900 font-semibold rounded-lg hover:from-amber-500 hover:to-orange-500 transition-all active:scale-[0.98] text-sm"
            >
              Continue without location
            </button>
          </div>
        )}

        {msg && <p className="mt-4 text-center text-sm font-medium text-red-600 break-words">{msg}</p>}
      </div>
    </div>
  );
}

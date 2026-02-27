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
      setMsg('Signed up and logged in');
      // Navigate to message page
      window.location.pathname = '/message';
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
    <div>
      <h2 className="text-lg font-semibold">Signup</h2>
      <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full p-2 border rounded mb-2 text-black " />
      <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full p-2 border rounded mb-2 text-black mt-2" />
      <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full p-2 border rounded mb-2 text-black mt-2" />
      <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full p-2 border rounded mb-2 text-black mt-2" />
      <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full p-2 border rounded mb-2 text-black mt-2" />
      <button onClick={handleSignup} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded mt-2">{loading ? 'Signing up...' : 'Sign up (requires location)'}</button>

      {noGeo && (
        <div className="mt-2">
          <div className="text-sm text-yellow-700 mb-2">Location not available — you can sign up without location (this uses a fallback coordinate).</div>
          <button onClick={signUpWithoutLocation} disabled={loading} className="px-3 py-1 bg-gray-200 rounded">Sign up without location</button>
        </div>
      )}

      {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
    </div>
  );
}

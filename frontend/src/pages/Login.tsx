import React, { useState } from 'react';
import api from '../services/api';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [msg, setMsg] = useState('');

  const handleLogin = async () => {
    try {
      const res = await api.post('/auth/login', form);
      // Server sets auth cookies (access + refresh + csrf). Save user locally for UI state.
      if (res.data.user) localStorage.setItem('user', JSON.stringify(res.data.user));
      setMsg('Logged in');
      // Navigate to message page
      window.location.pathname = '/message';
    } catch (err: any) {
      const serverMsg = err?.response?.data?.message;
      if (serverMsg) {
        setMsg(serverMsg);
        return;
      }

      const status = err?.response?.status;
      if (status) {
        setMsg(`Login failed (HTTP ${status})`);
        return;
      }

      const baseURL = (api as any)?.defaults?.baseURL;
      const networkMsg = err?.message || 'Network error';
      setMsg(`Login failed (${networkMsg})${baseURL ? ` — API: ${baseURL}` : ''}`);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold">Login</h2>
      <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full p-2 border rounded mb-2 text-black mt-2 shadow-lg shadow-black/100" />
      <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full p-2 border rounded mb-2 text-black mt-2" />
      <button onClick={handleLogin} className="px-4 py-2 bg-green-600 text-white rounded mt-2">Login</button>
      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </div>
  );
}

import React, { useState } from 'react';
import api from '../services/api';

export default function Login() {
  const [stage, setStage] = useState<'login' | 'forgotEmail' | 'reset'>('login');
  const [form, setForm] = useState({ email: '', password: '', userType: 'user' as 'user' | 'admin' });
  const [msg, setMsg] = useState('');
  const [resetForm, setResetForm] = useState({ email: '', otp: '', password: '' });

  const handleLogin = async () => {
    try {
      const res = await api.post('/auth/login', form);
      if (res.data.user) localStorage.setItem('user', JSON.stringify(res.data.user));
      if (res.data.accessToken) localStorage.setItem('access_token', String(res.data.accessToken));
      setMsg('Logged in');
      window.location.pathname = res.data.user?.isAdmin ? '/admin' : '/message';
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

  const sendOtp = async () => {
    try {
      setMsg('');
      await api.post('/auth/forgot-password', { email: form.email });
      setMsg('OTP sent if the address is registered');
      setResetForm({ email: form.email, otp: '', password: '' });
      setStage('reset');
    } catch (err: any) {
      setMsg(err?.response?.data?.message || err?.message || 'Error');
    }
  };

  const doReset = async () => {
    try {
      setMsg('');
      await api.post('/auth/reset-password', {
        email: resetForm.email,
        otp: resetForm.otp,
        newPassword: resetForm.password,
      });
      setMsg('Password changed – you may now log in');
      setStage('login');
      setForm({ email: resetForm.email, password: '' });
    } catch (err: any) {
      setMsg(err?.response?.data?.message || err?.message || 'Error');
    }
  };

  return (
    <div>
      {stage === 'login' && (
        <>
          <h2 className="text-lg font-semibold">Login</h2>
          <div className="flex gap-4 mb-4 mt-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="userType"
                value="user"
                checked={form.userType === 'user'}
                onChange={(e) => setForm({ ...form, userType: 'user' })}
              />
              <span>User</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="userType"
                value="admin"
                checked={form.userType === 'admin'}
                onChange={(e) => setForm({ ...form, userType: 'admin' })}
              />
              <span>Admin</span>
            </label>
          </div>
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full p-2 border rounded mb-2 text-black mt-2 shadow-lg shadow-black/100" />
          <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full p-2 border rounded mb-2 text-black mt-2 shadow-lg shadow-black/100" />
          <button onClick={handleLogin} className="px-4 py-2 bg-green-600 text-white rounded mt-2">Login</button>
          <p className="mt-2 text-sm">
            <button onClick={() => setStage('forgotEmail')} className="text-blue-600 underline">Forgot password?</button>
          </p>
        </>
      )}

      {stage === 'forgotEmail' && (
        <>
          <h2 className="text-lg font-semibold">Forgot password</h2>
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full p-2 border rounded mb-2 text-black mt-2 shadow-lg shadow-black/100" />
          <button onClick={sendOtp} className="px-4 py-2 bg-blue-600 text-white rounded mt-2">Send OTP</button>
          <p className="mt-2 text-sm">
            <button onClick={() => setStage('login')} className="text-blue-600 underline">Back to login</button>
          </p>
        </>
      )}

      {stage === 'reset' && (
        <>
          <h2 className="text-lg font-semibold">Reset password</h2>
          <input placeholder="Email" value={resetForm.email} readOnly className="w-full p-2 border rounded mb-2 text-black mt-2 shadow-lg shadow-black/100 bg-gray-100" />
          <input placeholder="OTP code" value={resetForm.otp} onChange={(e) => setResetForm({ ...resetForm, otp: e.target.value })} className="w-full p-2 border rounded mb-2 text-black mt-2 shadow-lg shadow-black/100" />
          <input placeholder="New password" type="password" value={resetForm.password} onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })} className="w-full p-2 border rounded mb-2 text-black mt-2 shadow-lg shadow-black/100" />
          <button onClick={doReset} className="px-4 py-2 bg-green-600 text-white rounded mt-2">Change password</button>
          <p className="mt-2 text-sm">
            <button onClick={() => setStage('login')} className="text-blue-600 underline">Back to login</button>
          </p>
        </>
      )}

      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </div>
  );
}

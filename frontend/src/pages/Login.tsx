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
      window.location.replace(res.data.user?.isAdmin ? '/admin' : '/message');
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
    <div className="h-screen overflow-hidden flex items-center justify-center bg-gradient-to-br from-slate-900 via-black to-purple-900 p-4">
      <div className="w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto bg-white/85 backdrop-blur-md rounded-3xl shadow-2xl border border-white/20 p-4">
        <div className="mb-4 text-center">
          <h2 className="text-3xl font-extrabold text-slate-800">{stage === 'login' ? 'Welcome Back' : stage === 'forgotEmail' ? 'Forgot Password' : 'Reset Password'}</h2>
          <p className="text-sm text-slate-500 mt-1">{stage === 'login' ? 'Sign in to your account' : stage === 'forgotEmail' ? 'Get code to reset your password' : 'Set your new password'}</p>
        </div>

        {stage === 'login' && (
          <>
            <div className="flex gap-2 mb-4 justify-center" role="radiogroup" aria-label="User type">
              <button
                onClick={() => setForm({ ...form, userType: 'user' })}
                className={`px-3 py-2 rounded-full text-sm font-medium ${form.userType === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                User
              </button>
              <button
                onClick={() => setForm({ ...form, userType: 'admin' })}
                className={`px-3 py-2 rounded-full text-sm font-medium ${form.userType === 'admin' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                Admin
              </button>
            </div>

            <input
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm mb-3"
            />
            <input
              placeholder="Password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm mb-3"
            />
            <button
              onClick={handleLogin}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold shadow-lg hover:from-indigo-600 hover:to-purple-600 transition"
            >
              Login
            </button>
            <p className="mt-3 text-center text-sm">
              <button onClick={() => setStage('forgotEmail')} className="text-indigo-600 font-medium hover:text-indigo-700">
                Forgot password?
              </button>
            </p>
          </>
        )}

        {stage === 'forgotEmail' && (
          <>
            <input
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm mb-3"
            />
            <button
              onClick={sendOtp}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold shadow-lg hover:bg-blue-700 transition"
            >
              Send OTP
            </button>
            <p className="mt-3 text-center text-sm">
              <button onClick={() => setStage('login')} className="text-indigo-600 font-medium hover:text-indigo-700">
                Back to login
              </button>
            </p>
          </>
        )}

        {stage === 'reset' && (
          <>
            <input
              placeholder="Email"
              value={resetForm.email}
              readOnly
              className="w-full p-3 rounded-xl border border-slate-200 bg-slate-100 text-slate-600 shadow-sm mb-3"
            />
            <input
              placeholder="OTP code"
              value={resetForm.otp}
              onChange={(e) => setResetForm({ ...resetForm, otp: e.target.value })}
              className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm mb-3"
            />
            <input
              placeholder="New password"
              type="password"
              value={resetForm.password}
              onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })}
              className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm mb-3"
            />
            <button
              onClick={doReset}
              className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold shadow-lg hover:bg-green-700 transition"
            >
              Change password
            </button>
            <p className="mt-3 text-center text-sm">
              <button onClick={() => setStage('login')} className="text-indigo-600 font-medium hover:text-indigo-700">
                Back to login
              </button>
            </p>
          </>
        )}

        {msg && <p className="mt-4 text-center text-sm font-medium text-red-600">{msg}</p>}
      </div>
    </div>
  );
}

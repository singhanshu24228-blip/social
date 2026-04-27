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
      setForm((prev) => ({ ...prev, email: resetForm.email, password: '' }));
    } catch (err: any) {
      setMsg(err?.response?.data?.message || err?.message || 'Error');
    }
  };

  return (
    <div className="min-h-screen overflow-y-auto flex items-start justify-center bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950 px-4 pt-24 pb-6 relative">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-24 sm:-left-20 w-80 sm:w-72 h-80 sm:h-72 bg-purple-600/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-24 sm:-right-20 w-96 sm:w-96 h-96 sm:h-96 bg-indigo-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-pink-600/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm sm:max-w-md max-h-[calc(100vh-8rem)] overflow-y-auto bg-gradient-to-b from-white/95 to-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 px-5 sm:px-6 py-6 relative z-10">
        <div className="mb-5 text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <span className="text-2xl sm:text-3xl">✨</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">{stage === 'login' ? 'Welcome Back' : stage === 'forgotEmail' ? 'Forgot Password' : 'Reset Password'}</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-2">{stage === 'login' ? 'Sign in to continue' : stage === 'forgotEmail' ? 'Get a code to reset' : 'Set your new password'}</p>
        </div>

        {stage === 'login' && (
          <>
            <div className="flex gap-2 mb-5 justify-center" role="radiogroup" aria-label="User type">
              <button
                onClick={() => setForm({ ...form, userType: 'user' })}
                className={`flex-1 py-2.5 sm:py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 touch-manipulation ${form.userType === 'user' ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-100 text-slate-600 active:bg-slate-200'}`}
              >
                User
              </button>
              <button
                onClick={() => setForm({ ...form, userType: 'admin' })}
                className={`flex-1 py-2.5 sm:py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 touch-manipulation ${form.userType === 'admin' ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-100 text-slate-600 active:bg-slate-200'}`}
              >
                Admin
              </button>
            </div>

            <div className="space-y-3">
              <input
                placeholder="Email address"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm transition-all text-base"
                autoComplete="email"
                inputMode="email"
              />
              <input
                placeholder="Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm transition-all text-base"
                autoComplete="current-password"
              />
            </div>
            <button
              onClick={handleLogin}
              className="w-full mt-5 py-3.5 sm:py-4 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white font-bold shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 transition-all active:scale-[0.98] text-base touch-manipulation"
            >
              Sign In
            </button>
            <p className="mt-4 text-center text-sm">
              <button onClick={() => setStage('forgotEmail')} className="text-indigo-600 font-medium hover:text-indigo-700 hover:underline transition-colors">
                Forgot password?
              </button>
            </p>
          </>
        )}

        {stage === 'forgotEmail' && (
          <>
            <input
              placeholder="Email address"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm mb-4 text-base"
              autoComplete="email"
              inputMode="email"
            />
            <button
              onClick={sendOtp}
              className="w-full py-3.5 sm:py-4 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold shadow-lg hover:shadow-xl transition-all active:scale-[0.98] text-base touch-manipulation"
            >
              Send OTP
            </button>
            <p className="mt-4 text-center text-sm">
              <button onClick={() => setStage('login')} className="text-indigo-600 font-medium hover:text-indigo-700 hover:underline">
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
              className="w-full p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-slate-100 text-slate-600 shadow-sm mb-3 text-base"
            />
            <input
              placeholder="OTP code"
              value={resetForm.otp}
              onChange={(e) => setResetForm({ ...resetForm, otp: e.target.value })}
              className="w-full p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm mb-3 text-base"
              inputMode="numeric"
            />
            <input
              placeholder="New password"
              type="password"
              value={resetForm.password}
              onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })}
              className="w-full p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm mb-3 text-base"
              autoComplete="new-password"
            />
            <button
              onClick={doReset}
              className="w-full py-3.5 sm:py-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold shadow-lg hover:shadow-xl transition-all active:scale-[0.98] text-base touch-manipulation"
            >
              Change Password
            </button>
            <p className="mt-4 text-center text-sm">
              <button onClick={() => setStage('login')} className="text-indigo-600 font-medium hover:text-indigo-700 hover:underline">
                Back to login
              </button>
            </p>
          </>
        )}

        {msg && <p className="mt-4 text-center text-sm font-medium text-red-600 break-words">{msg}</p>}
      </div>
    </div>
  );
}

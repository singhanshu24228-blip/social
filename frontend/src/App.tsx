import React, { useEffect, useState } from 'react';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Home from './pages/Home';
import Message from './pages/Message';
import Profile from './pages/Profile';
import SetDetail from './pages/SetDetail';

import Admin from './pages/Admin';
import TermsConditions from './pages/TermsConditions';
import PrivacyPolicy from './pages/PrivacyPolicy';

export default function App() {
  const [isLogin, setIsLogin] = useState(false);
  const path = window.location.pathname;
  let user: any = null;
  if (typeof window !== 'undefined') {
    try {
      user = JSON.parse(localStorage.getItem('user') || 'null');
    } catch (err) {
      user = null;
    }
  }
  const isTermsPage = path === '/termandcondition';
  const isPrivacyPage = path === '/PrivacyPolicy';
  const isMessagePage = path.startsWith('/message');
  const messageSubPath = isMessagePage && path.startsWith('/message/') ? path.split('/message/')[1] : null;
  const groupName =
    isMessagePage &&
    path !== '/message' &&
    path !== '/message/night' &&
    path !== '/message/chat' &&
    messageSubPath &&
    messageSubPath !== 'night' &&
    messageSubPath !== 'chat'
      ? messageSubPath
      : null;
  const isProfilePage = path.startsWith('/profile/');
  const userId = isProfilePage ? path.split('/profile/')[1] : null;
  const isSetDetailPage = path === '/set-detail';
  const isAdminPage = path === '/admin';
  const isAuthPage = !isAdminPage && !isProfilePage && !isMessagePage && !isSetDetailPage && !isTermsPage && !isPrivacyPage;
  const isPublicPage = isTermsPage || isPrivacyPage;
  const isAuthenticated = Boolean(user);
  const authenticatedHomePath = user?.isAdmin ? '/admin' : '/message';
  const shouldRedirectToAuthenticatedHome = isAuthPage && isAuthenticated;
  const shouldRedirectToAuth = !isAuthPage && !isAuthenticated && !isPublicPage;

  useEffect(() => {
    if (shouldRedirectToAuthenticatedHome) {
      window.location.replace(authenticatedHomePath);
      return;
    }
    if (shouldRedirectToAuth) {
      window.location.replace('/');
    }
  }, [authenticatedHomePath, shouldRedirectToAuthenticatedHome, shouldRedirectToAuth]);

  if (shouldRedirectToAuthenticatedHome || shouldRedirectToAuth) {
    return null;
  }

  if (isAuthPage) {
    return (
      <div className="relative h-screen overflow-hidden">
        {/* Gradient header - mobile friendly */}
        <div className="absolute left-1/2 top-4 sm:top-6 z-10 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl bg-white/20 p-1.5 backdrop-blur-xl border border-white/30 shadow-lg">
          <button
            onClick={() => setIsLogin(false)}
            className={`flex-1 py-2.5 sm:py-2.5 px-3 sm:px-4 rounded-lg sm:rounded-xl font-semibold text-sm transition-all duration-200 touch-manipulation active:scale-95 ${
              !isLogin ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md' : 'bg-white/40 text-slate-700 active:bg-white/60'
            }`}
          >
            Sign Up
          </button>
          <button
            onClick={() => setIsLogin(true)}
            className={`flex-1 py-2.5 sm:py-2.5 px-3 sm:px-4 rounded-lg sm:rounded-xl font-semibold text-sm transition-all duration-200 touch-manipulation active:scale-95 ${
              isLogin ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md' : 'bg-white/40 text-slate-700 active:bg-white/60'
            }`}
          >
            Login
          </button>
        </div>
        {isLogin ? <Login /> : <Signup />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-900">
      <div className={isAdminPage ? 'w-full' : "max-w-lg mx-auto p-4 pt-6"}>
        {!isAdminPage && !isMessagePage && (
          <div className="text-center mb-6">
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">Sociovio</h1>
          </div>
        )}
        {isAdminPage ? (
          <Admin />
        ) : isProfilePage && userId ? (
          <Profile userId={userId} />
        ) : isTermsPage ? (
          <TermsConditions />
        ) : isPrivacyPage ? (
          <PrivacyPolicy />
        ) : isSetDetailPage ? (
          <SetDetail />
        ) : isMessagePage ? (
          <Message groupName={groupName} />
        ) : (
          <div className="transition-all duration-500 ease-in-out opacity-100">
            {isLogin ? <Login /> : <Signup />}
          </div>
        )}
      </div>
    </div>
  );
}

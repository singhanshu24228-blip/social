import React, { useState } from 'react';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Home from './pages/Home';
import Message from './pages/Message';
import Profile from './pages/Profile';

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
  const isMessagePage = path.startsWith('/message');
  const groupName = isMessagePage && path !== '/message' && path !== '/message/night' ? path.split('/message/')[1] : null;
  const isProfilePage = path.startsWith('/profile/');
  const userId = isProfilePage ? path.split('/profile/')[1] : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50">
      <div className="max-w-md md:max-w-2xl lg:max-w-4xl mx-auto p-4 bg-white dark:bg-neutral-800 rounded-lg shadow-lg">
        <h1 className=" text-blue-500 text-2xl font-bold mb-4">Social {isMessagePage && user ? `— ${user.username}` : ''}</h1>
        {isProfilePage ? (
          <Profile userId={userId} />
        ) : isMessagePage ? (
          <Message groupName={groupName} />
        ) : (
          <>
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setIsLogin(false)}
                className={`flex-1 py-2 px-4 rounded font-semibold transition ${
                  !isLogin ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-50'
                }`}
              >
                Sign Up
              </button>
              <button
                onClick={() => setIsLogin(true)}
                className={`flex-1 py-2 px-4 rounded font-semibold transition ${
                  isLogin ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-50'
                }`}
              >
                Login
              </button>
            </div>
            <div className="transition-all duration-500 ease-in-out opacity-100">
              {isLogin ? <Login /> : <Signup />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

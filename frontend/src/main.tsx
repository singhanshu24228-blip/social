

import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './ErrorBoundary';

// Global error handlers to make runtime issues visible in console
window.addEventListener('error', (evt) => {
  console.error('Global error:', evt);
});
window.addEventListener('unhandledrejection', (evt) => {
  console.error('Unhandled rejection:', evt);
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Register service worker only in production build
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js')
    .then(() => console.log('SW registered'))
    .catch((err) => console.warn('SW register failed', err));
}

import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

const getSocketURL = () => {
  const apiUrl = (import.meta as any).env.VITE_API_URL;
  if (apiUrl) {
    // If VITE_API_URL is an API path (e.g. "/api" or "http://host/api"),
    // strip the "/api" suffix to get the socket server origin.
    if (apiUrl === '/api') return window.location.origin;
    return String(apiUrl).replace(/\/api\/?$/, '');
  }
  // In development, use localhost
  if ((import.meta as any).env.DEV) {
    return 'http://localhost:5000';
  }
  // In production, use same origin
  return window.location.origin;
};

export function connectSocket(token?: string) {
  if (socket && socket.connected) return socket;
  if (socket) {
    try {
      socket.disconnect();
    } catch (e) {
    }
    socket = null;
  }

  const opts: any = {
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    withCredentials: true,
  };
  const storedToken = (() => {
    try {
      return localStorage.getItem('access_token') || '';
    } catch {
      return '';
    }
  })();
  const effectiveToken = token || storedToken;
  if (effectiveToken) opts.auth = { token: effectiveToken };

  socket = io(getSocketURL(), opts);
  socket.on('connect', () => {
    console.log('Socket client connected', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket client disconnected', reason);
  });
  socket.on('connect_error', (err: any) => {
    console.error('Socket connect_error', err);
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('authentication') || msg.includes('jwt') || msg.includes('invalid')) {
      // Clear local user and redirect to login
      localStorage.removeItem('user');
      window.location.pathname = '/';
    }
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    try {
      socket.disconnect();
    } catch (err) {
      console.warn('Error disconnecting socket', err);
    }
    socket = null;
  }
}

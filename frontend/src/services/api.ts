import axios from 'axios';

const devBackendPorts = Array.from({ length: 10 }, (_, i) => 5000 + i);
let devBackendPortIndex = 0;

const getDevBackendPort = () => devBackendPorts[devBackendPortIndex] ?? 5000;

const getBaseURL = () => {
  const apiUrl = (import.meta as any).env.VITE_API_URL;
  if (apiUrl) {
    return apiUrl;
  }
  // In development, use localhost
  if ((import.meta as any).env.DEV) {
    return `http://localhost:${getDevBackendPort()}/api`;
  }
  // In production, use relative URL (same origin)
  return '/api';
};

const getUploadBaseURL = () => {
  const apiUrl = (import.meta as any).env.VITE_API_URL;
  if (apiUrl) {
    // Extract base URL from API URL
    return apiUrl.replace('/api', '');
  }
  // In development, use localhost
  if ((import.meta as any).env.DEV) {
    return `http://localhost:${getDevBackendPort()}`;
  }
  // In production, use relative URL (same origin)
  return '';
};

const api = axios.create({
  baseURL: getBaseURL(),
  withCredentials: true, // send cookies automatically
});

// Helper to read a cookie value (simple parser)
function getCookieValue(name: string) {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';').map((c) => c.trim());
  const match = cookies.find((c) => c.startsWith(name + '='));
  if (!match) return null;
  return decodeURIComponent(match.split('=')[1] || '');
}

// Attach CSRF header for state-changing requests
api.interceptors.request.use((config) => {
  // Ensure baseURL follows the latest dev backend port selection.
  config.baseURL = getBaseURL();

  const method = (config.method || '').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = getCookieValue('csrf_token');
    if (csrf) {
      config.headers = config.headers || {};
      (config.headers as any)['x-csrf-token'] = csrf;
    }
    
    // IMPORTANT: Don't set Content-Type for FormData - let axios auto-detect
    // FormData needs to set its own multipart/form-data boundary
    if (config.data instanceof FormData) {
      // Remove common header variants to ensure FormData sets boundary correctly
      try {
        if (config.headers) {
          delete (config.headers as any)['Content-Type'];
          delete (config.headers as any)['content-type'];
          if ((config.headers as any).common) {
            delete (config.headers as any).common['Content-Type'];
            delete (config.headers as any).common['content-type'];
          }
        }
      } catch (e) {
        // ignore
      }
    }
  }
  return config;
});

// Global response handler: on 401 attempt token refresh once, otherwise clear session
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;

    // Dev QoL: if the backend auto-bumped ports (5000 -> 5001, ...), transparently retry on the next port.
    const isDev = (import.meta as any).env.DEV;
    const hasExplicitApiUrl = Boolean((import.meta as any).env.VITE_API_URL);
    const isNetworkError = !error?.response;

    if (isDev && !hasExplicitApiUrl && isNetworkError && originalRequest) {
      const tries = Number((originalRequest as any).__devPortTries || 0);
      if (tries < devBackendPorts.length - 1) {
        (originalRequest as any).__devPortTries = tries + 1;
        devBackendPortIndex = Math.min(devBackendPortIndex + 1, devBackendPorts.length - 1);
        return api(originalRequest);
      }
    }

    if (error?.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const csrf = getCookieValue('csrf_token');
        await api.post('/auth/refresh', null, { headers: { 'x-csrf-token': csrf } });
        // retry original request
        return api(originalRequest);
      } catch (refreshErr) {
        // Refresh failed, clear local user and redirect to login
        localStorage.removeItem('user');
        window.location.pathname = '/';
        return Promise.reject(refreshErr);
      }
    }

    // Default behavior
    return Promise.reject(error);
  }
);

// Comment API functions
export const addComment = (postId: string, content: string) => {
  return api.post(`/posts/${postId}/comment`, { content });
};

// Night Mode API functions
export const getTimeUntilNightMode = () => {
  return api.get('/night-mode/time-until-night');
};

export const enterNightMode = () => {
  return api.post('/night-mode/enter', {});
};

export const exitNightMode = () => {
  return api.post('/night-mode/exit', {});
};

export const getNightModeStatus = () => {
  return api.get('/night-mode/status');
};

export const getNightPosts = () => {
  return api.get('/night-mode/posts');
};

export const getNightRooms = () => {
  return api.get('/night-mode/rooms');
};

export const createNightRoom = (name: string) => {
  return api.post('/night-mode/rooms', { name });
};

export const requestJoinRoom = (roomId: string) => {
  return api.post(`/night-mode/rooms/${roomId}/request`);
};

export const approveJoinRoom = (roomId: string, userId: string) => {
  return api.post(`/night-mode/rooms/${roomId}/approve`, { userId });
};

export const getRoomDetails = (roomId: string) => {
  return api.get(`/night-mode/rooms/${roomId}`);
};

export const postRoomComment = (roomId: string, content?: string, mediaUrl?: string, mediaType?: string) => {
  return api.post(`/night-mode/rooms/${roomId}/comments`, { content, mediaUrl, mediaType });
};

export const getRoomComments = (roomId: string) => {
  return api.get(`/night-mode/rooms/${roomId}/comments`);
};

export const canSendMediaInRoom = (roomId: string) => {
  return api.get(`/night-mode/rooms/${roomId}/can-send-media`);
};

export const createNightPost = (content: string, imageUrl?: string, songUrl?: string, anonymous?: boolean) => {
  return api.post('/night-mode/create-post', {
    content,
    imageUrl,
    songUrl,
    anonymous,
  });
};

export const deleteNightPost = (postId: string) => {
  return api.delete(`/night-mode/posts/${postId}`);
};

export const addNightPostReaction = (postId: string, emoji: string) => {
  return api.post(`/night-mode/posts/${postId}/react`, { emoji });
};

export const addNightPostComment = (postId: string, content: string) => {
  return api.post(`/night-mode/posts/${postId}/comment`, { content });
};

export const uploadFile = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/upload', formData);
};

export const logout = () => api.post('/auth/logout');
export const refreshAuth = () => api.post('/auth/refresh');

export { getUploadBaseURL };

// Normalize media URLs so /uploads assets always load from the backend origin.
// Without this, an absolute URL like `https://frontend.app/uploads/x.jpg` can hit the SPA fallback (HTML),
// which appears as "corrupted image" in <img>/<video>.
export const resolveMediaUrl = (u: any) => {
  const s = String(u || '');
  if (!s) return '';
  if (s.startsWith('data:') || s.startsWith('blob:')) return s;

  const base = getUploadBaseURL();

  if (s.startsWith('http://') || s.startsWith('https://')) {
    try {
      const parsed = new URL(s);
      if (parsed.pathname.startsWith('/uploads/')) {
        // Always rewrite absolute URLs for /uploads/ to use the correct base
        if (base) {
          const baseUrl = new URL(base, window.location.origin);
          return `${baseUrl.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
        } else {
          // If no base, make it relative
          return parsed.pathname + parsed.search + parsed.hash;
        }
      }
    } catch {
      // ignore URL parsing failures; fall through
    }
    return s;
  }

  if (s.startsWith('/uploads/')) return `${base}${s}`;
  if (s.startsWith('uploads/')) return `${base}/${s}`;

  // Back-compat: sometimes older data stores just the filename (no /uploads prefix)
  if (!s.includes('/') && /\.(png|jpe?g|gif|webp|mp4|webm|ogg|mov|m4v|mp3|m4a|wav|aac|flac)$/i.test(s)) {
    return base ? `${base}/uploads/${s}` : `/uploads/${s}`;
  }

  return s;
};

export default api;

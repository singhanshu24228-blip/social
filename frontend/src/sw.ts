// Service Worker for caching and offline support
const CACHE_NAME = 'your-voice-cache-v2';
const UPLOAD_CACHE_NAME = 'your-voice-uploads-v2';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];

self.addEventListener('install', (event: any) => {
  console.log('[SW] Installing service worker');
  self.skipWaiting();
});

self.addEventListener('activate', (event: any) => {
  console.log('[SW] Activating service worker');
  event.waitUntil(
    caches.keys().then((cacheNames: string[]) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Clean up old cache versions
          if (cacheName !== CACHE_NAME && cacheName !== UPLOAD_CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Helper to check if response is valid (not corrupted)
function isValidResponse(response: Response, expectedType?: 'image'): boolean {
  if (!response || !response.ok) {
    return false;
  }
  
  const contentType = response.headers.get('content-type');
  const contentLength = response.headers.get('content-length');
  
  // For images, require an image content-type to avoid caching HTML fallbacks as images.
  if (expectedType === 'image') {
    if (!contentType || !contentType.startsWith('image/')) return false;
    // Some servers/proxies stream without a Content-Length; only treat "0" as invalid when present.
    if (contentLength && parseInt(contentLength) === 0) return false;
  }
  
  return true;
}

// Helper to extract file extension from URL
function getFileExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return pathname.substring(pathname.lastIndexOf('.')).toLowerCase();
  } catch {
    return '';
  }
}

// Helper to check if URL is an image upload
function isImageUpload(url: string): boolean {
  try {
    const u = new URL(url);
    if (!u.pathname.includes('/uploads/')) return false;
    const ext = getFileExtension(url);
    return IMAGE_EXTENSIONS.includes(ext);
  } catch {
    return false;
  }
}

self.addEventListener('fetch', (event: any) => {
  const { request } = event;
  const url = request.url;

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle image uploads with network-first strategy
  if (isImageUpload(url)) {
    event.respondWith(
      fetch(request)
        .then((response: Response) => {
          // Validate response before caching
          if (!isValidResponse(response, 'image')) {
            console.warn('[SW] Invalid image response, not caching:', url);
            return response;
          }

          // Clone and cache the valid response
          const responseToCache = response.clone();
          caches.open(UPLOAD_CACHE_NAME).then((cache) => {
            console.log('[SW] Caching image:', url);
            cache.put(request, responseToCache);
          });

          return response;
        })
        .catch((error: Error) => {
          console.log('[SW] Fetch error for image, checking cache:', url);
          // Network failed, try cache
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse && isValidResponse(cachedResponse, 'image')) {
              console.log('[SW] Returning cached image:', url);
              return cachedResponse;
            }
            console.error('[SW] No valid cache for:', url);
            return new Response('Image unavailable', { status: 404 });
          });
        })
    );
    return;
  }

  // Default cache-first strategy for other resources
  event.respondWith(
    caches.match(request).then((response) => {
      if (response) {
        return response;
      }

      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });

        return response;
      });
    })
  );
});

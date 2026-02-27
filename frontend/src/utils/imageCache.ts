/**
 * Image Cache Utilities for Mobile Optimization
 * Handles image validation, caching, and recovery from corrupted images
 */

export interface ImageCacheOptions {
  cacheName?: string;
  maxRetries?: number;
  timeout?: number;
}

const DEFAULT_CACHE_NAME = 'your-voice-uploads-v2';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 10000; // 10 seconds

/**
 * Validates if an image URL is accessible and not corrupted
 */
export async function validateImageUrl(
  url: string,
  options: ImageCacheOptions = {}
): Promise<boolean> {
  const { timeout = DEFAULT_TIMEOUT } = options;

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.warn('[ImageCache] Image validation timeout:', url);
      resolve(false);
    }, timeout);

    const img = new Image();
    img.onload = () => {
      clearTimeout(timeoutId);
      console.log('[ImageCache] Image validation passed:', url);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timeoutId);
      console.error('[ImageCache] Image validation failed:', url);
      resolve(false);
    };
    // Set crossOrigin to handle CORS images
    img.crossOrigin = 'anonymous';
    img.src = url;
  });
}

/**
 * Clear corrupted images from cache and service worker cache
 */
export async function clearImageFromCache(url: string): Promise<void> {
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        await cache.delete(url);
        console.log('[ImageCache] Cleared from cache:', url, 'in', cacheName);
      }
    }
  } catch (error) {
    console.error('[ImageCache] Failed to clear cache:', error);
  }
}

/**
 * Force refresh an image by clearing its cache and reloading
 */
export async function forceRefreshImage(url: string): Promise<string> {
  await clearImageFromCache(url);
  // Add cache-busting query parameter
  const bustedUrl = url.includes('?')
    ? `${url}&_cache=${Date.now()}`
    : `${url}?_cache=${Date.now()}`;
  return bustedUrl;
}

/**
 * Load image with retry logic for mobile resilience
 */
export async function loadImageWithRetry(
  url: string,
  options: ImageCacheOptions = {}
): Promise<string> {
  const { maxRetries = DEFAULT_MAX_RETRIES } = options;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const isValid = await validateImageUrl(url);
      if (isValid) {
        return url;
      }
      lastError = new Error('Image validation failed');
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (attempt < maxRetries) {
      // Exponential backoff: 100ms, 200ms, 400ms, etc.
      const delay = 100 * Math.pow(2, attempt);
      console.log(`[ImageCache] Retrying image load (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms:`, url);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error(`Failed to load image after ${maxRetries} retries: ${url}`);
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  totalCaches: number;
  uploadCacheSize: number;
  items: string[];
}> {
  try {
    if (!('caches' in window)) {
      return { totalCaches: 0, uploadCacheSize: 0, items: [] };
    }

    const cacheNames = await caches.keys();
    const uploadCache = cacheNames.find(name => name.includes('uploads'));
    
    let items: string[] = [];
    let uploadCacheSize = 0;

    if (uploadCache) {
      const cache = await caches.open(uploadCache);
      const requests = await cache.keys();
      items = requests.map(req => req.url);
      uploadCacheSize = items.length;
    }

    return {
      totalCaches: cacheNames.length,
      uploadCacheSize,
      items
    };
  } catch (error) {
    console.error('[ImageCache] Failed to get cache stats:', error);
    return { totalCaches: 0, uploadCacheSize: 0, items: [] };
  }
}

/**
 * Clear all cached images
 */
export async function clearAllImageCache(): Promise<void> {
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      const uploadCaches = cacheNames.filter(name => name.includes('uploads'));
      
      for (const cacheName of uploadCaches) {
        await caches.delete(cacheName);
        console.log('[ImageCache] Deleted cache:', cacheName);
      }
    }
  } catch (error) {
    console.error('[ImageCache] Failed to clear all caches:', error);
  }
}

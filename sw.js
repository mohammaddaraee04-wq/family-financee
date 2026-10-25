
// نسخه نهایی و خودکار Service Worker (استراتژی Network-First برای جلوگیری از گیر کردن کش)
const CACHE_NAME = 'family-finance-v-dynamic';

const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './background.jpg',
  './icon.png'
];

// نصب اولیه و کش کردن فایل‌های پایه
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// فعال‌سازی و پاکسازی کش‌های تاریخ‌گذشته
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// رهگیری درخواست‌ها: ابتدا از اینترنت جدیدترین نسخه را بگیر؛ اگر آفلاین بود از کش بخوان
self.addEventListener('fetch', (event) => {
  // نادیده گرفتن درخواست‌های متصل به گوگل‌شیت یا تماس‌های غیر GET
  if (event.request.method !== 'GET' || event.request.url.includes('script.google.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // دریافت موفق از شبکه -> آپدیت خودکار کش در پشت صحنه
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // هنگام قطعی اینترنت یا دسترسی نداشتن به شبکه -> خواندن از حافظه آفلاین
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // در صورتی که صفحه اصلی خواسته شده بود
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});

/**
 * Service Worker สำหรับ MintCream Budget PWA
 * ช่วยให้เปิดใช้งานแบบออฟไลน์ได้ และโหลดหน้าเว็บได้เร็วขึ้น
 */

const CACHE_NAME = 'mintcream-budget-v1.0.0';

// ไฟล์หลักของแอปที่จะแคชไว้ใช้งานตอนออฟไลน์
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './store.js',
  './utils.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg'
];

// ติดตั้ง Service Worker และเก็บไฟล์หลักลง Cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// ล้าง Cache เวอร์ชันเก่าเมื่อมีการอัปเดตแอป
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// กลยุทธ์การดึงไฟล์:
// - ข้ามการแคชสำหรับคำขอไปหา Firebase/Firestore API (ให้ Firestore SDK จัดการ offline persistence เอง)
// - ใช้ Network-first สำหรับไฟล์หลักเพื่อให้ได้เวอร์ชันใหม่เสมอ และสลับไปใช้ Cache อัตโนมัติเมื่อออฟไลน์
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isFirebaseApi =
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com');

  if (isFirebaseApi) return;

  // สำหรับไฟล์ในโดเมนเดียวกัน: ลองโหลดจากเน็ตก่อน ถ้าออฟไลน์ใช้ Cache
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          }
          return response;
        })
        .catch(() => caches.match(request).then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  // สำหรับ CDN ภายนอก (Google Fonts, Chart.js, Firebase SDK): Cache-first พร้อมอัปเดตเบื้องหลัง
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && (response.status === 200 || response.type === 'opaque')) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

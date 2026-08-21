/* ماجيكلي — Service Worker
   بيعمل حاجتين:
   1) أوفلاين (كاش): القشرة، أصول Next، والصفحات اللي المستخدم فتحها قبل كده
      تشتغل من غير نت. أي صفحة لسه ما اتفتحتش بتوريه صفحة أوفلاين لطيفة.
   2) Web Push: استقبال الإشعارات — نفس السلوك القديم بالظبط.

   الملف plain JS في public/ وبيتقدّم من /sw.js — Next مابيعملّهوش build،
   فمينفعش نكتب فيه TypeScript ولا imports.

   ⚠️ حدود مهمة: البيانات الحية (Supabase, Groq/AI) والدخول محتاجين نت
   بطبيعتهم. الكاش بيخزّن نفس-الأصل (same-origin) بس؛ أي طلب لدومين تاني
   بيتساب للشبكة عشان مانخزّنش بيانات مستخدم أو ردود ذكاء اصطناعي بالغلط. */

/* ⚠️ زوّد الرقم ده مع أي تعديل في السيرفس وركر عشان الكاش القديم يتمسح
   ويتفعّل الجديد للمستخدمين. */
const VERSION = "v1";
const PRECACHE = `magicly-precache-${VERSION}`;
const STATIC = `magicly-static-${VERSION}`;
const PAGES = `magicly-pages-${VERSION}`;
const CURRENT_CACHES = [PRECACHE, STATIC, PAGES];

/* صفحة الأوفلاين لازم تتخزّن وقت التنصيب عشان تبقى موجودة من غير نت. */
const OFFLINE_URL = "/offline.html";

/* أصول أساسية نحاول نخزّنها. best-effort: لو واحدة فشلت مايفشلش التنصيب كله. */
const PRECACHE_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.ico",
];

/* سقف لكاش الصفحات عشان مايكبرش من غير حدود. */
const MAX_PAGES = 60;

// =====================================================================
// دورة حياة السيرفس وركر
// =====================================================================

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      // offline.html حرجة — لو فشلت مافيش فايدة، بس مانرميش استثناء يوقف التنصيب.
      try {
        await cache.add(OFFLINE_URL);
      } catch {
        /* هنحاول تاني وقت الـ fetch */
      }
      // باقي الأصول best-effort.
      await Promise.allSettled(
        PRECACHE_ASSETS.filter((u) => u !== OFFLINE_URL).map((u) => cache.add(u))
      );
      // فعّل النسخة الجديدة من غير ما نستنى قفل كل التابات.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // امسح أي كاش بتاعنا من نسخة قديمة.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("magicly-") && !CURRENT_CACHES.includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// =====================================================================
// استراتيجيات الكاش
// =====================================================================

/* أصل ثابت؟ (أصول Next الهاش‌د، خطوط، صور، صوت...) دي آمنة للكاش-أول
   لأن أسماءها بتتغيّر مع أي تعديل. */
function isStaticAsset(url) {
  if (url.pathname.startsWith("/_next/static/")) return true;
  return /\.(?:css|js|mjs|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico|mp3|wav|ogg|webmanifest)$/i.test(
    url.pathname
  );
}

/* كاش-أول: لو موجود في الكاش رجّعه فوراً، وإلا هاته من الشبكة وخزّنه. */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.ok && res.type === "basic") {
      const cache = await caches.open(cacheName);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    return cached || Response.error();
  }
}

/* شبكة-أول للصفحات: هات أحدث نسخة من الشبكة وخزّنها، ولو مفيش نت
   رجّع النسخة المخزّنة، ولو مفيش رجّع صفحة الأوفلاين. */
async function networkFirstPage(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    /* `res.redirected` معناها إن السيرفر حوّلنا لمكان تاني — أغلب الوقت
       صفحة محمية حوّلت لـ /login. لو خزّنّا ده تحت مفتاح الصفحة الأصلية،
       المستخدم أوفلاين هيلاقي صفحة دخول مكان صفحته. سيبها من غير كاش. */
    if (res && res.ok && res.type === "basic" && !res.redirected) {
      cache.put(request, res.clone());
      trimCache(PAGES, MAX_PAGES);
    }
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    return (
      offline ||
      new Response("أنت غير متصل بالإنترنت.", {
        status: 503,
        statusText: "Offline",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

/* يقصّ أقدم المدخلات لو الكاش عدّى الحد. */
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const excess = keys.length - maxItems;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // GET بس — POST/PUT وغيره تعدّي على الشبكة عادي.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // نفس الأصل بس. Supabase/تحليلات/جوجل... تتساب للشبكة (مانخزّنش بيانات خارجية).
  if (url.origin !== self.location.origin) return;

  // الـ API ومسارات الأوث دايماً شبكة — عمرها ما تتخزّن.
  // /auth/* فيه ردود تحويل (302) بتحمل كود الجلسة، ولازم توصل للسيرفر
  // نضيفة من غير أي تدخّل مننا — أي كاش هنا معناه دخول بايظ.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    return;
  }

  // طلبات RSC (تنقّل ناعم داخل التطبيق) وبيانات Next الديناميكية — شبكة.
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  // أصول ثابتة → كاش-أول.
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC));
    return;
  }

  // تنقّل لصفحة كاملة → شبكة-أول مع رجوع لصفحة الأوفلاين.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }

  // أي GET تاني من نفس الأصل → شبكة، وعند الفشل جرّب الكاش.
  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        const cached = await caches.match(request);
        return cached || Response.error();
      }
    })()
  );
});

// =====================================================================
// Web Push — نفس السلوك القديم (اتساب زي ما هو)
// =====================================================================

// 🔔 بيتنفذ لما السيرفر يبعت push notification فعلي
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "🔥 حافظ على سلسلتك!", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "🔥 حافظ على سلسلتك!";
  const options = {
    body: data.body || "لسه ما ذاكرتش النهارده... خلي السلسلة ماتنكسرش!",
    icon: data.icon || "/favicon.ico",
    badge: "/favicon.ico",
    data: { url: data.url || "/dashboard" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 👆 لما المستخدم يدوس على الإشعار، يفتحله التطبيق
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// يسمح للصفحة تطلب تفعيل نسخة جديدة فوراً (اختياري — التفعيل بيحصل تلقائي كمان).
self.addEventListener("message", (event) => {
  const data = event.data;
  if (data === "SKIP_WAITING" || (data && data.type === "SKIP_WAITING")) {
    self.skipWaiting();
  }
});

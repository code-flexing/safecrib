// SafeCrib service worker — foundation only.
//
// This intentionally does the minimum right now: it establishes an
// installable, versioned cache for a small app shell and serves it when
// offline. It does NOT implement runtime caching strategies for API
// responses, authentication, or user data — that will be added once the
// backend exists, and must never cache anything sensitive.

const CACHE_NAME = "safecrib-shell-v4";
const APP_SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle same-origin GET requests. Everything else (API calls,
  // cross-origin requests, non-GET methods) passes straight through so we
  // never accidentally cache authentication or private data.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  const isDocumentRequest = request.mode === "navigate" || url.pathname === "/manifest.webmanifest";
  const isAppShellRequest = url.pathname === "/" || url.pathname === "/manifest.webmanifest";

  if (isDocumentRequest) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (!isAppShellRequest) return response;
          const responseCopy = response.clone();
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, responseCopy);
          } catch (error) {
            console.warn("Could not update the SafeCrib offline cache.", error);
          }
          return response;
        })
        .catch(async () => {
          let cached;
          try {
            cached = isAppShellRequest ? await caches.match(request) : undefined;
          } catch (error) {
            console.warn("Could not read the SafeCrib offline cache.", error);
          }
          return cached ?? new Response("SafeCrib is unavailable while you are offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cached) => cached ?? fetch(request))
      .catch(() => new Response("This resource is unavailable while you are offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }))
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    console.error("Could not parse a SafeCrib push notification.", error);
  }
  const title = typeof payload.title === "string" ? payload.title : "SafeCrib update";
  const body = typeof payload.body === "string" ? payload.body : "You have a new notification.";
  const href = typeof payload.href === "string" && payload.href.startsWith("/") && !payload.href.startsWith("//")
    ? payload.href
    : "/notifications";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/logo(black).png",
    badge: "/logo(black).png",
    data: { href },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href;
  const destination = new URL(
    typeof href === "string" && href.startsWith("/") && !href.startsWith("//") ? href : "/notifications",
    self.location.origin,
  ).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url === destination);
    if (existing && "focus" in existing) return existing.focus();
    const sameOrigin = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (sameOrigin && "navigate" in sameOrigin && "focus" in sameOrigin) {
      return sameOrigin.navigate(destination).then(() => sameOrigin.focus());
    }
    return self.clients.openWindow(destination);
  }));
});

/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { FONT_CACHE } from "../shared/font-cache";
import { initializeApp } from "firebase/app";
import { getMessaging } from "firebase/messaging/sw";
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(
  ({ request, url }) =>
    request.destination === "font" && url.origin === self.location.origin,
  new CacheFirst({
    cacheName: FONT_CACHE,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 512,
        maxAgeSeconds: 365 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));
// Handle FCM's data-only Web Push here, including while an app window is visible.
// Firebase's default foreground routing skips showNotification; Safari can revoke
// subscriptions for such silent pushes. Keep display inside the push lifetime and
// use one renderer so multiple tabs cannot produce duplicate notifications.
self.addEventListener("push", (event) => {
  let payload: {
    data?: {
      title?: string;
      body?: string;
      noticeId?: string;
      eventId?: string;
      type?: string;
      postId?: string;
    };
  } = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    // Even an unreadable push must show a visible notification.
  }
  const title = payload.data?.title || "워크샵 소식";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.data?.body || "새로운 안내가 도착했어요.",
      icon: new URL("./icon-192.png", self.registration.scope).href,
      tag: payload.data?.eventId || payload.data?.noticeId || "workshop",
      data: {
        page:
          payload.data?.type === "treasure-found"
            ? "treasure"
            : payload.data?.type === "photo-activity"
              ? "photos"
              : "notices",
        ...(payload.data?.type === "photo-activity" && payload.data.postId
          ? { postId: payload.data.postId }
          : {}),
      },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const page =
    event.notification.data?.page === "treasure"
      ? "treasure"
      : event.notification.data?.page === "photos"
        ? "photos"
        : "notices";
  const postId = event.notification.data?.postId;
  const query =
    page === "photos" &&
    typeof postId === "string" &&
    /^[0-9a-f-]{36}$/i.test(postId)
      ? `?post=${encodeURIComponent(postId)}`
      : "";
  const url = new URL(`./#/${page}${query}`, self.registration.scope).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        const client = clients.find((c) =>
          c.url.startsWith(self.registration.scope),
        ) as WindowClient | undefined;
        if (client) {
          await client.navigate(url);
          return client.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});
// Keep Firebase's foreground messages and subscription renewal. The server sends
// data-only payloads; do not add an onBackgroundMessage notification renderer.
if (
  import.meta.env.VITE_FIREBASE_PROJECT_ID &&
  import.meta.env.VITE_FIREBASE_API_KEY
) {
  const app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
  getMessaging(app);
}

/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));
// Data-only FCM payload: this worker is the sole notification renderer, preventing duplicates.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL("./#/notices", self.registration.scope).href;
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
  onBackgroundMessage(getMessaging(app), (payload) =>
    self.registration.showNotification(payload.data?.title || "워크샵 소식", {
      body: payload.data?.body || "새로운 안내가 도착했어요.",
      icon: new URL("./icon-192.png", self.registration.scope).href,
      tag: payload.data?.noticeId || "workshop",
    }),
  );
}

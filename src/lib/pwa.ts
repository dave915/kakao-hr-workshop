import { app, demoMode } from "./firebase";
import type { ActionInput } from "../../shared/validation";
import { deviceId } from "./device-status";
let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;
export function registerWorker() {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return null;
  registrationPromise ??= navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    })
    .catch((error) => {
      registrationPromise = null;
      throw error;
    });
  return registrationPromise;
}
export type PushStatus =
  "enabled" | "disabled" | "stale" | "blocked" | "unsupported";
export async function getPushStatus(): Promise<PushStatus> {
  if (
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  )
    return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (!localStorage.getItem("hr-push-token")) return "disabled";
  if (Notification.permission !== "granted") return "stale";
  const registration = await navigator.serviceWorker.getRegistration(
    import.meta.env.BASE_URL,
  );
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? "enabled" : "stale";
}
export async function enablePush(
  act: (input: ActionInput) => Promise<unknown>,
) {
  if (demoMode)
    throw new Error(
      "미리보기에서는 실제 푸시를 발송하지 않아요. Firebase 연결 후 사용할 수 있어요.",
    );
  if (!app || !("Notification" in window) || !("PushManager" in window))
    throw new Error(
      "이 브라우저는 푸시를 지원하지 않아요. iPhone은 홈 화면에 추가한 앱에서 시도해주세요.",
    );
  if (!import.meta.env.VITE_FIREBASE_VAPID_KEY)
    throw new Error(
      "푸시 설정이 아직 준비되지 않았어요. 추진위원회에 문의해주세요.",
    );
  // Request synchronously from the button gesture, before any dynamic imports.
  if (
    Notification.permission !== "granted" &&
    (await Notification.requestPermission()) !== "granted"
  )
    throw new Error(
      "알림이 차단되어 있어요. 기기 또는 브라우저 설정에서 이 앱의 알림을 허용해주세요.",
    );
  const { getMessaging, getToken, isSupported } =
    await import("firebase/messaging");
  if (!(await isSupported()))
    throw new Error(
      "이 브라우저는 푸시를 지원하지 않아요. 홈 화면에 추가한 앱에서 시도해주세요.",
    );
  const registration = await registerWorker();
  if (!registration) throw new Error("푸시는 배포된 앱에서 사용할 수 있어요.");
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token)
    throw new Error("알림 등록을 완료하지 못했어요. 다시 시도해주세요.");
  const previousToken = localStorage.getItem("hr-push-token");
  await act({ action: "registerPush", token, deviceId: deviceId() });
  localStorage.setItem("hr-push-token", token);
  if (previousToken && previousToken !== token)
    await act({ action: "unregisterPush", token: previousToken }).catch(() => {
      console.warn("[push] Previous device registration could not be removed.");
    });
  window.dispatchEvent(new Event("hr-push-change"));
}
export async function disablePush(
  act: (input: ActionInput) => Promise<unknown>,
) {
  const token = localStorage.getItem("hr-push-token");
  if (token) await act({ action: "unregisterPush", token });
  if (app) {
    const { getMessaging, deleteToken, isSupported } =
      await import("firebase/messaging");
    if (await isSupported()) await deleteToken(getMessaging(app));
  }
  localStorage.removeItem("hr-push-token");
  window.dispatchEvent(new Event("hr-push-change"));
}

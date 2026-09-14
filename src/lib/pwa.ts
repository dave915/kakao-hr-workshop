import { app, demoMode } from "./firebase";
import type { ActionInput } from "../../shared/validation";
let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;
export function registerWorker() {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return null;
  registrationPromise ??= navigator.serviceWorker.register(
    `${import.meta.env.BASE_URL}sw.js`,
    { scope: import.meta.env.BASE_URL },
  );
  return registrationPromise;
}
export async function enablePush(
  act: (input: ActionInput) => Promise<unknown>,
) {
  if (demoMode)
    throw new Error(
      "미리보기에서는 실제 푸시를 발송하지 않아요. Firebase 연결 후 사용할 수 있어요.",
    );
  const { getMessaging, getToken, isSupported } =
    await import("firebase/messaging");
  if (!app || !(await isSupported()))
    throw new Error(
      "이 브라우저는 푸시를 지원하지 않아요. iPhone은 홈 화면에 추가한 앱에서 시도해주세요.",
    );
  if (!import.meta.env.VITE_FIREBASE_VAPID_KEY)
    throw new Error(
      "푸시 설정이 아직 준비되지 않았어요. 추진위원회에 문의해주세요.",
    );
  if ((await Notification.requestPermission()) !== "granted")
    throw new Error(
      "알림이 차단되어 있어요. 브라우저 설정에서 알림을 허용해주세요.",
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
  await act({ action: "registerPush", token });
  localStorage.setItem("hr-push-token", token);
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
}

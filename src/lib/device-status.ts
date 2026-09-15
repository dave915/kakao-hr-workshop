import type { ActionInput } from "../../shared/validation";
import type { DeviceReport } from "../../shared/types";
export function deviceId() {
  const key = "hr-device-id";
  let id = localStorage.getItem(key);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
export async function detectDevice(
  installationHint?: "installed" | "not-installed",
): Promise<DeviceReport> {
  const ua = navigator.userAgent;
  const platform: DeviceReport["platform"] = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua) ||
        (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
      ? "iOS"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Macintosh/i.test(ua)
          ? "macOS"
          : "기타";
  const nav = navigator as Navigator & {
    standalone?: boolean;
    getInstalledRelatedApps?: () => Promise<
      Array<{ platform: string; url?: string; id?: string }>
    >;
  };
  let installation: DeviceReport["installation"] =
    installationHint ?? "unknown";
  if (
    nav.standalone ||
    ["standalone", "fullscreen", "minimal-ui"].some(
      (mode) => matchMedia(`(display-mode: ${mode})`).matches,
    )
  )
    installation = "installed";
  else if (!installationHint && nav.getInstalledRelatedApps) {
    // Earlier desktop Chromium versions expose the API without PWA detection.
    const chromeVersion = Number(
      ua.match(/(?:Chrome|Chromium)\/(\d+)/)?.[1] ?? 0,
    );
    if (
      (platform === "Android" && chromeVersion >= 84) ||
      chromeVersion >= 140
    ) {
      try {
        const apps = await Promise.race([
          nav.getInstalledRelatedApps(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
        ]);
        if (apps) {
          const manifest = new URL(
            `${import.meta.env.BASE_URL}manifest.webmanifest`,
            location.origin,
          ).href;
          installation = apps.some(
            (app) =>
              app.platform === "webapp" &&
              app.url &&
              new URL(app.url, location.href).href === manifest,
          )
            ? "installed"
            : "not-installed";
        }
      } catch {
        /* An unavailable detection API is not evidence of removal. */
      }
    }
  }
  const permission =
    "Notification" in window ? Notification.permission : "unsupported";
  let push: DeviceReport["push"] =
    permission === "denied" || permission === "default"
      ? "unsubscribed"
      : "unknown";
  if (permission === "granted" && "serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration(
        import.meta.env.BASE_URL,
      );
      if (registration?.pushManager)
        push = (await registration.pushManager.getSubscription())
          ? "subscribed"
          : "unsubscribed";
    } catch {
      /* Preserve the last server registration if a check fails. */
    }
  }
  return { deviceId: deviceId(), platform, installation, permission, push };
}
export function startDeviceReporting(
  act: (input: ActionInput) => Promise<unknown>,
) {
  let stopped = false,
    running = false,
    pending = false,
    sentAt = 0,
    signature = "";
  let hint: "installed" | "not-installed" | undefined;
  const report = async () => {
    if (document.visibilityState !== "visible" || stopped) return;
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      const currentHint = hint;
      hint = undefined;
      const device = await detectDevice(currentHint);
      const token = localStorage.getItem("hr-push-token") ?? undefined;
      const nextSignature = JSON.stringify({ device, token });
      if (
        !stopped &&
        (nextSignature !== signature || Date.now() - sentAt > 300000)
      ) {
        await act({
          action: "reportDevice",
          device,
          ...(token ? { token } : {}),
        });
        signature = nextSignature;
        sentAt = Date.now();
      }
    } catch {
      console.warn(
        "[device] Status could not be updated; it will retry on the next visit.",
      );
    } finally {
      running = false;
      if (pending && !stopped) {
        pending = false;
        void report();
      }
    }
  };
  const refresh = () => {
    void report();
  };
  const installed = () => {
    hint = "installed";
    refresh();
  };
  const installable = () => {
    hint = "not-installed";
    refresh();
  };
  window.addEventListener("appinstalled", installed);
  window.addEventListener("beforeinstallprompt", installable);
  window.addEventListener("focus", refresh);
  window.addEventListener("online", refresh);
  window.addEventListener("hr-push-change", refresh);
  document.addEventListener("visibilitychange", refresh);
  refresh();
  return () => {
    stopped = true;
    window.removeEventListener("appinstalled", installed);
    window.removeEventListener("beforeinstallprompt", installable);
    window.removeEventListener("focus", refresh);
    window.removeEventListener("online", refresh);
    window.removeEventListener("hr-push-change", refresh);
    document.removeEventListener("visibilitychange", refresh);
  };
}

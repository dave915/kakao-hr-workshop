import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("workbox-core", () => ({ clientsClaim: vi.fn() }));
vi.mock("workbox-precaching", () => ({
  precacheAndRoute: vi.fn(),
  cleanupOutdatedCaches: vi.fn(),
  createHandlerBoundToURL: vi.fn(),
}));
vi.mock("workbox-routing", () => ({
  NavigationRoute: class {},
  registerRoute: vi.fn(),
}));
vi.mock("../src/lib/firebase", () => ({ app: {}, demoMode: false }));
const messaging = vi.hoisted(() => ({
  getMessaging: vi.fn(() => ({})),
  getToken: vi.fn(),
  deleteToken: vi.fn(),
  isSupported: vi.fn(),
}));
vi.mock("firebase/messaging", () => messaging);
vi.mock("firebase/messaging/sw", () => ({ getMessaging: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Web Push system notifications", () => {
  const scope = "https://example.com/kakao-hr-workshop/";
  let listeners: Record<string, (event: any) => void>;
  let showNotification: ReturnType<typeof vi.fn>;
  let clients: Array<{
    url: string;
    visibilityState: string;
    postMessage: ReturnType<typeof vi.fn>;
    navigate?: ReturnType<typeof vi.fn>;
    focus?: ReturnType<typeof vi.fn>;
  }>;
  let matchAll: ReturnType<typeof vi.fn>;
  let openWindow: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    listeners = {};
    clients = [];
    showNotification = vi.fn().mockResolvedValue(undefined);
    matchAll = vi.fn(async () => clients);
    openWindow = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("self", {
      __WB_MANIFEST: [],
      addEventListener: (name: string, handler: (event: any) => void) => {
        listeners[name] = handler;
      },
      registration: { scope, showNotification },
      clients: { matchAll, openWindow },
    });
    await import("../src/sw");
  });
  function receive(
    data: unknown = {
      data: {
        title: "점심 안내",
        body: "12시에 로비에서 만나요",
        noticeId: "notice-1",
      },
    },
  ) {
    let lifetime: Promise<void> | undefined;
    listeners.push({
      data: { json: () => data },
      waitUntil: (promise: Promise<void>) => {
        lifetime = promise;
      },
    });
    expect(lifetime).toBeInstanceOf(Promise);
    return lifetime!;
  }
  it.each(["visible", "hidden"])(
    "shows a system notification when the app is %s",
    async (visibilityState) => {
      clients = [{ url: scope, visibilityState, postMessage: vi.fn() }];
      await receive();
      expect(showNotification).toHaveBeenCalledExactlyOnceWith("점심 안내", {
        body: "12시에 로비에서 만나요",
        icon: `${scope}icon-192.png`,
        tag: "notice-1",
      });
    },
  );
  it("shows the notification without depending on any open page", async () => {
    await receive();
    expect(showNotification).toHaveBeenCalledOnce();
    expect(matchAll).not.toHaveBeenCalled();
  });
  it("shows only one notification across multiple tabs and does not notify other apps on the same origin", async () => {
    clients = [scope, `${scope}#/admin`, "https://example.com/other/"].map(
      (url) => ({ url, visibilityState: "visible", postMessage: vi.fn() }),
    );
    await receive();
    expect(showNotification).toHaveBeenCalledOnce();
    expect(clients[2].postMessage).not.toHaveBeenCalled();
  });
  it("keeps the push event alive until notification display completes", async () => {
    let finish!: () => void;
    showNotification.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const completed = vi.fn();
    const lifetime = receive().then(completed);
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    finish();
    await lifetime;
    expect(completed).toHaveBeenCalledOnce();
  });
  it("does not silently discard an unreadable push", async () => {
    const waitUntil = vi.fn();
    listeners.push({
      data: {
        json: () => {
          throw new SyntaxError();
        },
      },
      waitUntil,
    });
    await waitUntil.mock.calls[0][0];
    expect(showNotification).toHaveBeenCalledWith(
      "워크샵 소식",
      expect.objectContaining({ body: "새로운 안내가 도착했어요." }),
    );
  });
  it("opens the scoped notices page on notification click", async () => {
    const close = vi.fn();
    const waitUntil = vi.fn();
    listeners.notificationclick({ notification: { close }, waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(close).toHaveBeenCalledOnce();
    expect(openWindow).toHaveBeenCalledWith(`${scope}#/notices`);
  });
});

describe("device push registration", () => {
  let saved: Map<string, string>;
  let permission: {
    permission: string;
    requestPermission: ReturnType<typeof vi.fn>;
  };
  let registration: {
    pushManager: { getSubscription: ReturnType<typeof vi.fn> };
  };
  let worker: {
    register: ReturnType<typeof vi.fn>;
    getRegistration: ReturnType<typeof vi.fn>;
    ready: Promise<unknown>;
  };
  beforeEach(() => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("BASE_URL", "/kakao-hr-workshop/");
    vi.stubEnv("VITE_FIREBASE_VAPID_KEY", "public-test-key");
    saved = new Map();
    permission = {
      permission: "granted",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    };
    registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue({ endpoint: "test" }),
      },
    };
    worker = {
      register: vi.fn().mockResolvedValue(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
      ready: Promise.resolve(registration),
    };
    vi.stubGlobal("window", {
      Notification: permission,
      PushManager: class {},
    });
    vi.stubGlobal("Notification", permission);
    vi.stubGlobal("navigator", { serviceWorker: worker });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
      removeItem: (key: string) => saved.delete(key),
    });
    messaging.isSupported.mockResolvedValue(true);
    messaging.getToken.mockResolvedValue("new-token");
    messaging.deleteToken.mockResolvedValue(true);
  });
  it("does not report a saved token as connected after permission is revoked", async () => {
    saved.set("hr-push-token", "old-token");
    permission.permission = "denied";
    const { getPushStatus } = await import("../src/lib/pwa");
    expect(await getPushStatus()).toBe("blocked");
  });
  it("detects a lost browser subscription despite a saved FCM token", async () => {
    saved.set("hr-push-token", "old-token");
    registration.pushManager.getSubscription.mockResolvedValue(null);
    const { getPushStatus } = await import("../src/lib/pwa");
    expect(await getPushStatus()).toBe("stale");
  });
  it("requires both permission and a live subscription to show connected", async () => {
    const { getPushStatus } = await import("../src/lib/pwa");
    expect(await getPushStatus()).toBe("disabled");
    saved.set("hr-push-token", "old-token");
    expect(await getPushStatus()).toBe("enabled");
    permission.permission = "default";
    expect(await getPushStatus()).toBe("stale");
  });
  it("requests permission immediately within the user's click gesture", async () => {
    permission.permission = "default";
    const { enablePush } = await import("../src/lib/pwa");
    const pending = enablePush(vi.fn().mockResolvedValue({}));
    expect(permission.requestPermission).toHaveBeenCalledOnce();
    expect(messaging.isSupported).not.toHaveBeenCalled();
    await pending;
  });
  it("registers the replacement token before removing the previous one", async () => {
    saved.set("hr-push-token", "old-token");
    const act = vi.fn().mockResolvedValue({});
    const { enablePush } = await import("../src/lib/pwa");
    await enablePush(act);
    expect(act.mock.calls).toEqual([
      [{ action: "registerPush", token: "new-token" }],
      [{ action: "unregisterPush", token: "old-token" }],
    ]);
    expect(saved.get("hr-push-token")).toBe("new-token");
    expect(messaging.getToken).toHaveBeenCalledWith(expect.anything(), {
      vapidKey: "public-test-key",
      serviceWorkerRegistration: registration,
    });
  });
  it("does not lose the previous registration if saving the replacement fails", async () => {
    saved.set("hr-push-token", "old-token");
    const act = vi.fn().mockRejectedValue(new Error("offline"));
    const { enablePush } = await import("../src/lib/pwa");
    await expect(enablePush(act)).rejects.toThrow("offline");
    expect(saved.get("hr-push-token")).toBe("old-token");
    expect(act).toHaveBeenCalledOnce();
  });
  it("can retry worker registration after a transient failure", async () => {
    worker.register.mockRejectedValueOnce(new Error("offline"));
    const { registerWorker } = await import("../src/lib/pwa");
    await expect(registerWorker()).rejects.toThrow("offline");
    expect(await registerWorker()).toBe(registration);
  });
});

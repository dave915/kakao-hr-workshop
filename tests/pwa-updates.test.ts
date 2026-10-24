import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchAppUpdates } from "../src/lib/pwa-updates";

describe("automatic app updates", () => {
  let workers: EventTarget & { controller: object | null };
  let registration: EventTarget & {
    installing: (EventTarget & { state: string }) | null;
    waiting: { postMessage: ReturnType<typeof vi.fn> } | null;
    update: ReturnType<typeof vi.fn>;
  };
  let browser: EventTarget & { location: { reload: ReturnType<typeof vi.fn> } };
  let page: EventTarget & { visibilityState: string };
  let network: { serviceWorker: typeof workers; onLine: boolean };
  let stop: (() => void) | undefined;

  async function settle() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }
  async function start() {
    stop = watchAppUpdates(
      Promise.resolve(registration as unknown as ServiceWorkerRegistration),
    );
    await settle();
  }
  beforeEach(() => {
    vi.useFakeTimers();
    workers = Object.assign(new EventTarget(), {
      controller: {} as object | null,
    });
    registration = Object.assign(new EventTarget(), {
      installing: null,
      waiting: null,
      update: vi.fn().mockResolvedValue(undefined),
    });
    browser = Object.assign(new EventTarget(), {
      location: { reload: vi.fn() },
    });
    page = Object.assign(new EventTarget(), { visibilityState: "visible" });
    network = { serviceWorker: workers, onLine: true };
    vi.stubGlobal("navigator", network);
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", page);
  });
  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("automatically activates an update that was waiting when the app opened", async () => {
    registration.waiting = { postMessage: vi.fn() };
    await start();
    expect(registration.waiting.postMessage).toHaveBeenCalledWith({
      type: "SKIP_WAITING",
    });
    workers.dispatchEvent(new Event("controllerchange"));
    workers.dispatchEvent(new Event("controllerchange"));
    expect(browser.location.reload).toHaveBeenCalledOnce();
  });

  it("activates an update that finishes installing while the app is open", async () => {
    await start();
    const worker = Object.assign(new EventTarget(), { state: "installing" });
    registration.installing = worker;
    registration.dispatchEvent(new Event("updatefound"));
    registration.waiting = { postMessage: vi.fn() };
    worker.state = "installed";
    worker.dispatchEvent(new Event("statechange"));
    expect(registration.waiting.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: "SKIP_WAITING",
    });
  });

  it("also watches a worker whose installation started before registration resolved", async () => {
    const worker = Object.assign(new EventTarget(), { state: "installing" });
    registration.installing = worker;
    await start();
    registration.waiting = { postMessage: vi.fn() };
    worker.state = "installed";
    worker.dispatchEvent(new Event("statechange"));
    expect(registration.waiting.postMessage).toHaveBeenCalledOnce();
  });

  it("does not reload on first installation and reloads once for the next version", async () => {
    workers.controller = null;
    await start();
    workers.dispatchEvent(new Event("controllerchange"));
    workers.controller = {};
    workers.dispatchEvent(new Event("controllerchange"));
    expect(browser.location.reload).not.toHaveBeenCalled();
    workers.controller = {};
    workers.dispatchEvent(new Event("controllerchange"));
    workers.dispatchEvent(new Event("controllerchange"));
    expect(browser.location.reload).toHaveBeenCalledOnce();
  });

  it("listens for activation before registration has resolved", () => {
    stop = watchAppUpdates(new Promise(() => {}));
    workers.dispatchEvent(new Event("controllerchange"));
    expect(browser.location.reload).toHaveBeenCalledOnce();
  });

  it("checks on opening, every minute, and on returning to the app", async () => {
    await start();
    expect(registration.update).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(registration.update).toHaveBeenCalledTimes(2);
    browser.dispatchEvent(new Event("focus"));
    await settle();
    page.dispatchEvent(new Event("visibilitychange"));
    await settle();
    browser.dispatchEvent(new Event("online"));
    await settle();
    expect(registration.update).toHaveBeenCalledTimes(5);
  });

  it("skips checks while hidden or offline, then retries when the app returns online", async () => {
    await start();
    registration.update.mockClear();
    page.visibilityState = "hidden";
    await vi.advanceTimersByTimeAsync(120_000);
    browser.dispatchEvent(new Event("focus"));
    page.visibilityState = "visible";
    network.onLine = false;
    page.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(registration.update).not.toHaveBeenCalled();
    network.onLine = true;
    browser.dispatchEvent(new Event("online"));
    await settle();
    expect(registration.update).toHaveBeenCalledOnce();
  });

  it("retries a failed update without interrupting the current app", async () => {
    registration.update.mockRejectedValueOnce(new Error("network unavailable"));
    await start();
    browser.dispatchEvent(new Event("online"));
    await settle();
    expect(registration.update).toHaveBeenCalledTimes(2);
    expect(browser.location.reload).not.toHaveBeenCalled();
  });

  it("does not overlap update checks", async () => {
    let finish!: () => void;
    registration.update.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    await start();
    browser.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(registration.update).toHaveBeenCalledOnce();
    finish();
    await settle();
    browser.dispatchEvent(new Event("focus"));
    expect(registration.update).toHaveBeenCalledTimes(2);
  });

  it("removes update listeners and timers when the app unmounts", async () => {
    await start();
    stop!();
    registration.update.mockClear();
    workers.dispatchEvent(new Event("controllerchange"));
    browser.dispatchEvent(new Event("focus"));
    browser.dispatchEvent(new Event("online"));
    page.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(registration.update).not.toHaveBeenCalled();
    expect(browser.location.reload).not.toHaveBeenCalled();
  });

  it("does not attach update checks if registration resolves after unmount", async () => {
    let finish!: (registration: ServiceWorkerRegistration) => void;
    stop = watchAppUpdates(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    stop();
    finish(registration as unknown as ServiceWorkerRegistration);
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(registration.update).not.toHaveBeenCalled();
  });
});

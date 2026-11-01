import { describe, expect, it, vi } from "vitest";
import { createOverlayHistory } from "../src/lib/overlay-history";

function setup() {
  const home = "https://workshop.test/#/home";
  const photos = "https://workshop.test/#/photos?post=one";
  const entries: {
    state: unknown;
    url: string;
    scrollRestoration: History["scrollRestoration"];
  }[] = [
    { state: { page: "home" }, url: home, scrollRestoration: "auto" },
    {
      state: { page: "photos", scroll: 240 },
      url: photos,
      scrollRestoration: "auto",
    },
  ];
  let index = 1;
  const pending: number[] = [];
  const listeners = new Set<() => void>();
  const host = {
    location: {
      get href() {
        return entries[index].url;
      },
    },
    history: {
      get scrollRestoration() {
        return entries[index].scrollRestoration;
      },
      set scrollRestoration(value: History["scrollRestoration"]) {
        entries[index].scrollRestoration = value;
      },
      get state() {
        return entries[index].state;
      },
      pushState(state: unknown, _unused: string, url?: string | URL | null) {
        entries.splice(index + 1);
        entries.push({
          state: structuredClone(state),
          url: String(url ?? host.location.href),
          scrollRestoration: host.history.scrollRestoration,
        });
        index++;
      },
      replaceState(state: unknown, _unused: string, url?: string | URL | null) {
        entries[index] = {
          state: structuredClone(state),
          url: String(url ?? host.location.href),
          scrollRestoration: host.history.scrollRestoration,
        };
      },
      go(delta = 0) {
        pending.push(delta);
      },
    },
    addEventListener(_type: "popstate", listener: () => void) {
      listeners.add(listener);
    },
    removeEventListener(_type: "popstate", listener: () => void) {
      listeners.delete(listener);
    },
  };
  const manager = createOverlayHistory(host);
  async function settle() {
    for (let count = 0; count < 20; count++) {
      await Promise.resolve();
      const delta = pending.shift();
      if (delta === undefined) return;
      const next = index + delta;
      if (next >= 0 && next < entries.length && next !== index) {
        index = next;
        listeners.forEach((listener) => listener());
      }
    }
    throw new Error("History did not settle");
  }
  async function back(delta = -1) {
    host.history.go(delta);
    await settle();
  }
  function open() {
    const dismiss = vi.fn(() => release());
    const release = manager.register(dismiss);
    return { dismiss, release };
  }
  return {
    host,
    manager,
    open,
    settle,
    back,
    home,
    photos,
    position: () => index,
  };
}

describe("overlay browser history", () => {
  it("lets the scroll lock restore position throughout the history traversal", async () => {
    const s = setup();
    const dialog = s.open();
    expect(s.host.history.scrollRestoration).toBe("manual");
    await s.settle();
    dialog.release();
    await Promise.resolve();
    expect(s.host.history.scrollRestoration).toBe("manual");
    await s.settle();
    expect(s.host.history.scrollRestoration).toBe("manual");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(s.host.history.scrollRestoration).toBe("auto");
  });

  it("retains the scroll policy when another dialog opens during cleanup", async () => {
    const s = setup();
    const dialog = s.open();
    await s.settle();
    dialog.release();
    await s.settle();
    const next = s.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(s.host.history.scrollRestoration).toBe("manual");
    next.release();
    await s.settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(s.host.history.scrollRestoration).toBe("auto");
  });

  it("Back closes comments and preserves the exact photo route, then goes home", async () => {
    const s = setup();
    const comments = s.open();
    await s.settle();
    expect(s.host.location.href).toBe(s.photos);
    expect(s.position()).toBe(2);
    await s.back();
    expect(comments.dismiss).toHaveBeenCalledOnce();
    expect(s.host.location.href).toBe(s.photos);
    expect(s.host.history.state).toEqual({ page: "photos", scroll: 240 });
    await s.back();
    expect(s.host.location.href).toBe(s.home);
  });

  it("dismisses nested likes before comments, one Back per layer", async () => {
    const s = setup();
    const comments = s.open();
    await s.settle();
    const likes = s.open();
    await s.settle();
    await s.back();
    expect(likes.dismiss).toHaveBeenCalledOnce();
    expect(comments.dismiss).not.toHaveBeenCalled();
    expect(s.position()).toBe(2);
    await s.back();
    expect(comments.dismiss).toHaveBeenCalledOnce();
    expect(s.position()).toBe(1);
  });

  it("removes entries after X, Escape, submit and repeated reopen cycles", async () => {
    const s = setup();
    for (let i = 0; i < 4; i++) {
      const dialog = s.open();
      await s.settle();
      dialog.release();
      dialog.release();
      await s.settle();
      expect(s.position()).toBe(1);
      expect(dialog.dismiss).not.toHaveBeenCalled();
    }
    await s.back();
    expect(s.host.location.href).toBe(s.home);
  });

  it("coalesces React StrictMode setup/cleanup/setup into a single entry", async () => {
    const s = setup();
    s.open().release();
    const live = s.open();
    await s.settle();
    expect(s.position()).toBe(2);
    await s.back();
    expect(live.dismiss).toHaveBeenCalledOnce();
    expect(s.position()).toBe(1);
  });

  it("replaces a map with AR without leaving a dead modal in history", async () => {
    const s = setup();
    const map = s.open();
    await s.settle();
    map.release();
    const camera = s.open();
    await s.settle();
    expect(s.position()).toBe(2);
    await s.back();
    expect(camera.dismiss).toHaveBeenCalledOnce();
    expect(s.position()).toBe(1);
  });

  it("collapses map + compass into a single replacement camera layer", async () => {
    const s = setup();
    const map = s.open(),
      compass = s.open();
    await s.settle();
    map.release();
    compass.release();
    const camera = s.open();
    await s.settle();
    expect(s.position()).toBe(2);
    await s.back();
    expect(camera.dismiss).toHaveBeenCalledOnce();
    expect(s.position()).toBe(1);
  });

  it("waits for a pending cleanup traversal before registering the next dialog", async () => {
    const s = setup();
    const first = s.open();
    await s.settle();
    first.release();
    await Promise.resolve();
    const next = s.open();
    await s.settle();
    expect(s.position()).toBe(2);
    expect(next.dismiss).not.toHaveBeenCalled();
    await s.back();
    expect(next.dismiss).toHaveBeenCalledOnce();
    expect(s.position()).toBe(1);
  });

  it("retains a busy dialog and restores its Back entry until closing is allowed", async () => {
    const s = setup();
    let busy = true;
    const release = s.manager.register(() => {
      if (!busy) release();
    });
    await s.settle();
    await s.back();
    expect(s.position()).toBe(2);
    expect(s.host.location.href).toBe(s.photos);
    busy = false;
    await s.back();
    expect(s.position()).toBe(1);
  });

  it("closes multiple layers in reverse order when history skips to their base", async () => {
    const s = setup();
    const order: number[] = [];
    const release1 = s.manager.register(() => {
      order.push(1);
      release1();
    });
    const release2 = s.manager.register(() => {
      order.push(2);
      release2();
    });
    await s.settle();
    await s.back(-2);
    expect(order).toEqual([2, 1]);
    expect(s.position()).toBe(1);
  });

  it("navigates from the menu only after removing the menu's entry", async () => {
    const s = setup();
    const menu = s.open();
    await s.settle();
    menu.release();
    s.manager.afterClose(() => s.host.history.pushState(null, "", s.home));
    await s.settle();
    expect(s.host.location.href).toBe(s.home);
    await s.back();
    expect(s.host.location.href).toBe(s.photos);
    expect(s.position()).toBe(1);
  });

  it("does not undo an external route change when a dialog unmounts", async () => {
    const s = setup();
    const dialog = s.open();
    await s.settle();
    // Some navigation APIs copy state; the URL must also belong to this entry.
    s.host.history.pushState(s.host.history.state, "", s.home);
    dialog.release();
    await s.settle();
    expect(s.host.location.href).toBe(s.home);
    expect(s.position()).toBe(3);
  });

  it("does not reopen dismissed dialogs on Forward or trap further navigation", async () => {
    const s = setup();
    const dialog = s.open();
    await s.settle();
    await s.back();
    await s.back(1);
    expect(dialog.dismiss).toHaveBeenCalledOnce();
    expect(s.host.history.state).toEqual({ page: "photos", scroll: 240 });
    expect(s.host.history.scrollRestoration).toBe("auto");
    await s.back(-2);
    expect(s.host.location.href).toBe(s.home);
  });
});

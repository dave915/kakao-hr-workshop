import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routing = vi.hoisted(() => ({
  handler: undefined as
    | undefined
    | ((options: { request: Request; event: object }) => Promise<Response>),
  registerRoute: vi.fn(),
}));
const precaching = vi.hoisted(() => ({
  precache: vi.fn(),
  addRoute: vi.fn(),
  cleanupOutdatedCaches: vi.fn(),
  createHandlerBoundToURL: vi.fn(),
}));
vi.mock("workbox-core", () => ({ clientsClaim: vi.fn() }));
vi.mock("workbox-precaching", () => precaching);
vi.mock("workbox-routing", () => ({
  NavigationRoute: class {
    constructor(handler: typeof routing.handler) {
      routing.handler = handler;
    }
  },
  registerRoute: routing.registerRoute,
}));
vi.mock("workbox-strategies", () => ({ CacheFirst: class {} }));
vi.mock("workbox-expiration", () => ({ ExpirationPlugin: class {} }));
vi.mock("firebase/app", () => ({ initializeApp: vi.fn() }));
vi.mock("firebase/messaging/sw", () => ({ getMessaging: vi.fn() }));

describe("network-first page navigation", () => {
  const offlinePage = vi.fn();
  const fetchPage = vi.fn();
  const scope = "https://example.com/workshop/";

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    routing.handler = undefined;
    offlinePage.mockResolvedValue(new Response("installed offline app"));
    fetchPage.mockResolvedValue(new Response("latest server app"));
    precaching.createHandlerBoundToURL.mockReturnValue(offlinePage);
    vi.stubGlobal("fetch", fetchPage);
    vi.stubGlobal("self", {
      __WB_MANIFEST: [{ url: "index.html", revision: "installed-version" }],
      addEventListener: vi.fn(),
      registration: { scope },
    });
    await import("../src/sw");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("handles navigations before the precache can serve its old root or index.html", () => {
    expect(routing.handler).toBeTypeOf("function");
    expect(precaching.precache.mock.invocationCallOrder[0]).toBeLessThan(
      routing.registerRoute.mock.invocationCallOrder[0],
    );
    expect(routing.registerRoute.mock.invocationCallOrder[0]).toBeLessThan(
      precaching.addRoute.mock.invocationCallOrder[0],
    );
  });

  it.each(["", "index.html", "?source=home"])(
    "fetches the latest %s page without using the browser HTTP cache",
    async (path) => {
      const response = await routing.handler!({
        request: new Request(scope + path),
        event: {},
      });
      expect(await response.text()).toBe("latest server app");
      const request = fetchPage.mock.calls[0][0] as Request;
      expect(request.url).toBe(scope + path);
      expect(request.cache).toBe("no-store");
      expect(offlinePage).not.toHaveBeenCalled();
    },
  );

  it("uses the fully installed cached app when offline", async () => {
    fetchPage.mockRejectedValueOnce(new TypeError("offline"));
    const options = { request: new Request(scope), event: {} };
    expect(await (await routing.handler!(options)).text()).toBe(
      "installed offline app",
    );
    expect(offlinePage).toHaveBeenCalledExactlyOnceWith(options);
  });

  it.each([404, 503])(
    "falls back to the installed app on HTTP %s",
    async (status) => {
      fetchPage.mockResolvedValueOnce(new Response("server error", { status }));
      const response = await routing.handler!({
        request: new Request(scope),
        event: {},
      });
      expect(await response.text()).toBe("installed offline app");
    },
  );

  it("waits for a slow server instead of displaying the older cache first", async () => {
    let finish!: (response: Response) => void;
    fetchPage.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    const response = routing.handler!({
      request: new Request(scope),
      event: {},
    });
    await Promise.resolve();
    expect(offlinePage).not.toHaveBeenCalled();
    finish(new Response("latest server app"));
    expect(await (await response).text()).toBe("latest server app");
  });
});

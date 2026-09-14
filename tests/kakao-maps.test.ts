import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
interface ScriptStub {
  src: string;
  onload: null | (() => void);
  onerror: null | (() => void);
  remove: ReturnType<typeof vi.fn>;
}
let scripts: ScriptStub[];
let browser: {
  kakao?: { maps: { Map?: unknown; load?: (callback: () => void) => void } };
};
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv("VITE_KAKAO_MAP_APP_KEY", "test-kakao-js-key");
  browser = {};
  scripts = [];
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", {
    createElement: () => ({
      src: "",
      onload: null,
      onerror: null,
      remove: vi.fn(),
    }),
    head: { appendChild: (script: ScriptStub) => scripts.push(script) },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function finishSdk() {
  browser.kakao = {
    maps: {
      load: (callback) => {
        browser.kakao!.maps.Map = class {};
        callback();
      },
    },
  };
  scripts.at(-1)!.onload?.();
}
describe("Kakao SDK loading", () => {
  it("uses one network request for concurrent participant/admin or StrictMode mounts", async () => {
    const { loadKakaoMaps } = await import("../src/lib/kakao-maps");
    const first = loadKakaoMaps();
    const second = loadKakaoMaps();
    expect(scripts).toHaveLength(1);
    expect(new URL(scripts[0].src).searchParams.get("autoload")).toBe("false");
    finishSdk();
    expect(await first).toBe(await second);
    expect(await loadKakaoMaps()).toBe(await first);
    expect(scripts).toHaveLength(1);
  });
  it("lets the user retry after a network failure", async () => {
    const { loadKakaoMaps } = await import("../src/lib/kakao-maps");
    const failed = loadKakaoMaps();
    const failure = expect(failed).rejects.toThrow("불러오지 못했어요");
    scripts[0].onerror?.();
    await failure;
    expect(scripts[0].remove).toHaveBeenCalledOnce();
    const retried = loadKakaoMaps();
    finishSdk();
    expect(await retried).toBe(browser.kakao?.maps);
    expect(scripts).toHaveLength(2);
  });
  it("does not leave a permanently loading map when the SDK never responds", async () => {
    const { loadKakaoMaps } = await import("../src/lib/kakao-maps");
    const failed = loadKakaoMaps();
    const failure = expect(failed).rejects.toThrow("불러오지 못했어요");
    await vi.advanceTimersByTimeAsync(15000);
    await failure;
    const retried = loadKakaoMaps();
    finishSdk();
    expect(await retried).toBe(browser.kakao?.maps);
  });
  it("does not send an SDK request without an app key", async () => {
    vi.stubEnv("VITE_KAKAO_MAP_APP_KEY", "");
    const { loadKakaoMaps } = await import("../src/lib/kakao-maps");
    await expect(loadKakaoMaps()).rejects.toThrow("연결 정보");
    expect(scripts).toHaveLength(0);
  });
});

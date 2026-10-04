import { describe, expect, it, vi } from "vitest";
import { PhotoCache } from "../src/lib/photo-cache";

describe("photo cache", () => {
  it("coalesces concurrent reads and keeps thumbnail/full resources separate", async () => {
    const cache = new PhotoCache();
    cache.setScope("alice:0");
    const load = vi.fn(async () => new Blob(["image"]));
    const first = cache.read("post:0:thumb", load);
    expect(cache.read("post:0:thumb", load)).toBe(first);
    await first;
    await cache.read("post:0:thumb", load);
    expect(load).toHaveBeenCalledTimes(1);
    await cache.read("post:0:full", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("evicts the least recently used blobs by total byte size", async () => {
    const cache = new PhotoCache(6);
    cache.setScope("alice:0");
    const load = vi.fn(async () => new Blob(["abc"]));
    await cache.read("a:0:thumb", load);
    await cache.read("b:0:thumb", load);
    await cache.read("a:0:thumb", load);
    await cache.read("c:0:thumb", load);
    await cache.read("a:0:thumb", load);
    expect(load).toHaveBeenCalledTimes(3);
    await cache.read("b:0:thumb", load);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it.each(["logout", "account", "reset", "delete"])(
    "%s prevents stale in-flight reads from restoring invalidated data",
    async (reason) => {
      const cache = new PhotoCache();
      cache.setScope("alice:0");
      let finish!: (value: Blob) => void;
      const pending = cache.read(
        "post:0:full",
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      await Promise.resolve();
      if (reason === "logout") cache.setScope(null);
      if (reason === "account") cache.setScope("bob:0");
      if (reason === "reset") cache.setScope("alice:1");
      if (reason === "delete") cache.removePost("post");
      const rejected = expect(pending).rejects.toThrow("변경");
      finish(new Blob(["old"]));
      await rejected;
      if (reason === "logout") cache.setScope("alice:0");
      const fresh = await cache.read(
        "post:0:full",
        async () => new Blob(["new"]),
      );
      expect(await fresh.text()).toBe("new");
    },
  );

  it("allows retry after rejection and does not retain oversized blobs", async () => {
    const cache = new PhotoCache(2);
    cache.setScope("alice:0");
    await expect(
      cache.read("post:0:full", async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
    const load = vi.fn(async () => new Blob(["large"]));
    await cache.read("post:0:full", load);
    await cache.read("post:0:full", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("clears cached data across sessions and removes only the deleted post", async () => {
    const cache = new PhotoCache();
    const load = vi.fn(async () => new Blob(["image"]));
    await expect(cache.read("a:0:full", load)).rejects.toThrow("입장");
    cache.setScope("alice:0");
    await cache.read("a:0:full", load);
    await cache.read("ab:0:full", load);
    cache.removePost("a");
    await cache.read("ab:0:full", load);
    expect(load).toHaveBeenCalledTimes(2);
    await cache.read("a:0:full", load);
    expect(load).toHaveBeenCalledTimes(3);
    cache.setScope("bob:0");
    await cache.read("ab:0:full", load);
    expect(load).toHaveBeenCalledTimes(4);
  });
});

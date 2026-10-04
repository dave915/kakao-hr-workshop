import { FONT_CACHE } from "../../shared/font-cache";

/** Also retain fonts fetched before the first service worker took control. */
export async function cacheUsedFonts() {
  if (!("caches" in window) || !document.fonts) return;
  await document.fonts.ready;
  const assets = new URL(`${import.meta.env.BASE_URL}assets/`, location.origin);
  const urls = [
    ...new Set(
      performance.getEntriesByType("resource").map((entry) => entry.name),
    ),
  ].filter((name) => name.startsWith(assets.href) && /\.woff2?$/.test(name));
  if (!urls.length) return;
  const cache = await caches.open(FONT_CACHE);
  await Promise.allSettled(
    urls.map(async (url) => {
      if (await cache.match(url)) return;
      const response = await fetch(url, { cache: "force-cache" });
      if (response.ok) await cache.put(url, response);
    }),
  );
}

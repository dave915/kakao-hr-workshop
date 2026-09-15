import { useEffect, useState } from "react";
import type { Notice } from "../../shared/types";
export function readNoticeIds(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}
export function unreadNotices(notices: Notice[], readIds: string[]) {
  const read = new Set(readIds);
  return notices.filter((n) => !read.has(n.id));
}
export function useUnreadNotices(
  memberId: string | undefined,
  notices: Notice[],
  open: boolean,
) {
  const key = `hr-notices-read:${import.meta.env.BASE_URL}:${memberId ?? "guest"}`;
  const [saved, setSaved] = useState<{ key: string; ids: string[] }>(() => ({
    key,
    ids: readNoticeIds(key),
  }));
  const ids = saved.key === key ? saved.ids : readNoticeIds(key);
  const noticeIds = notices.map((n) => n.id).join(",");
  useEffect(() => {
    setSaved({ key, ids: readNoticeIds(key) });
    const sync = (event: StorageEvent) => {
      if (event.key === key) setSaved({ key, ids: readNoticeIds(key) });
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key]);
  useEffect(() => {
    if (!memberId || !open) return;
    const markRead = () => {
      if (document.visibilityState !== "visible") return;
      const merged = [
        ...new Set([
          ...readNoticeIds(key),
          ...noticeIds.split(",").filter(Boolean),
        ]),
      ].slice(-500);
      try {
        localStorage.setItem(key, JSON.stringify(merged));
      } catch {
        /* Still clear this session's badge. */
      }
      setSaved({ key, ids: merged });
    };
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [key, memberId, open, noticeIds]);
  return unreadNotices(notices, ids).length;
}

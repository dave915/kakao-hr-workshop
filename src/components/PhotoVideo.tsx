import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, Play } from "lucide-react";
import type { PhotoPost } from "../../shared/photos";
import { readVideoSource } from "../lib/photos";
import { englishName } from "../lib/utils";
import PhotoImage from "./PhotoImage";

export default function PhotoVideo({
  post,
  index,
  enabled = true,
}: {
  post: PhotoPost;
  index: number;
  enabled?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null),
    video = useRef<HTMLVideoElement>(null);
  const source = useRef<Awaited<ReturnType<typeof readVideoSource>> | null>(
    null,
  );
  const alive = useRef(true),
    visible = useRef(false),
    loading = useRef(false),
    position = useRef(0);
  const [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    if (!element && video.current) {
      const previous = video.current;
      previous.pause();
      // React Strict Mode also detaches/reattaches refs on a connected node.
      // Clear the source only after a real DOM removal, not that rehearsal.
      queueMicrotask(() => {
        if (!previous.isConnected) {
          previous.removeAttribute("src");
          previous.load();
        }
      });
    }
    video.current = element;
  }, []);
  useEffect(() => {
    alive.current = true;
    const pause = () => {
      video.current?.pause();
    };
    const other = (event: Event) => {
      if ((event as CustomEvent).detail !== video.current) pause();
    };
    const visibility = () => {
      if (document.hidden) pause();
    };
    const observer = new IntersectionObserver((entries) => {
      visible.current = entries.some((e) => e.isIntersecting);
      if (!visible.current) pause();
    });
    if (container.current) observer.observe(container.current);
    document.addEventListener("workshop-video-play", other);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      alive.current = false;
      pause();
      source.current?.release();
      source.current = null;
      observer.disconnect();
      document.removeEventListener("workshop-video-play", other);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!enabled) video.current?.pause();
  }, [enabled]);
  async function load() {
    if (loading.current) return;
    position.current = video.current?.currentTime ?? position.current;
    video.current?.pause();
    loading.current = true;
    setBusy(true);
    setError("");
    setUrl("");
    try {
      const next = await readVideoSource(post, index);
      if (!alive.current) {
        next.release();
        return;
      }
      source.current?.release();
      source.current = next;
      setUrl(next.url);
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "동영상을 불러오지 못했어요.",
        );
    } finally {
      loading.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className="photo-video" ref={container} data-menu-swipe="ignore">
      {url && !error ? (
        <video
          ref={attachVideo}
          src={url}
          controls
          playsInline
          preload="metadata"
          aria-label={`${englishName(post.authorHandle)}의 동영상 ${index + 1}`}
          onLoadedMetadata={(event) => {
            const el = event.currentTarget;
            if (position.current)
              el.currentTime = Math.min(
                position.current,
                el.duration || position.current,
              );
            if (enabled && visible.current && !document.hidden)
              void el.play().catch(() => {
                /* Native controls remain usable on iOS. */
              });
          }}
          onPlay={(event) => {
            if (!enabled || !visible.current || document.hidden) {
              event.currentTarget.pause();
              return;
            }
            if ((source.current?.expiresAt ?? 0) < Date.now() + 15000) {
              void load();
              return;
            }
            document.dispatchEvent(
              new CustomEvent("workshop-video-play", {
                detail: event.currentTarget,
              }),
            );
          }}
          onError={(event) => {
            position.current = event.currentTarget.currentTime;
            setError(
              "동영상 재생에 실패했어요. 다시 불러오거나 MP4(H.264) 파일인지 확인해주세요.",
            );
          }}
        />
      ) : (
        <>
          <PhotoImage post={post} index={index} full enabled={enabled} />
          <button
            type="button"
            className="photo-video-play"
            disabled={busy || !enabled}
            onClick={() => void load()}
            aria-label={error ? "동영상 다시 불러오기" : "동영상 재생"}
          >
            {busy ? (
              <LoaderCircle className="photo-spinning" size={28} />
            ) : (
              <Play size={28} fill="currentColor" />
            )}
            <span>
              {busy
                ? "동영상 불러오는 중"
                : error
                  ? "다시 불러오기"
                  : "동영상 재생"}
            </span>
          </button>
        </>
      )}
      {error && (
        <p className="photo-video-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

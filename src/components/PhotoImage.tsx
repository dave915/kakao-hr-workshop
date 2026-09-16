import { useEffect, useRef, useState } from "react";
import { Images } from "lucide-react";
import type { PhotoPost } from "../../shared/photos";
import { readPhoto } from "../lib/photos";
import { englishName } from "../lib/utils";

interface Props {
  post: PhotoPost;
  index?: number;
  full?: boolean;
  enabled?: boolean;
  eager?: boolean;
  retryable?: boolean;
}
export default function PhotoImage(props: Props) {
  return (
    <ImageResource
      key={`${props.post.id}:${props.index ?? 0}:${props.full ? "full" : "thumb"}`}
      {...props}
    />
  );
}
function ImageResource({
  post,
  index = 0,
  full = false,
  enabled = true,
  eager = false,
  retryable = false,
}: Props) {
  const element = useRef<HTMLSpanElement>(null),
    objectURL = useRef("");
  const [url, setUrl] = useState(""),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(
    () => () => {
      if (objectURL.current) URL.revokeObjectURL(objectURL.current);
      objectURL.current = "";
    },
    [],
  );
  useEffect(() => {
    if (!enabled || objectURL.current) return;
    let live = true,
      started = false;
    setError(false);
    const load = async () => {
      if (started) return;
      started = true;
      try {
        const blob = await readPhoto(post, index, full ? "full" : "thumb");
        if (!live) return;
        objectURL.current = URL.createObjectURL(blob);
        setUrl(objectURL.current);
      } catch {
        if (live) setError(true);
      }
    };
    const observer =
      !eager && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                observer?.disconnect();
                void load();
              }
            },
            { rootMargin: "160px" },
          )
        : null;
    if (observer && element.current) observer.observe(element.current);
    else void load();
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [post.id, index, full, enabled, eager, retry]);
  return (
    <span ref={element} className={`photo-image ${full ? "is-full" : ""}`}>
      {url ? (
        <img
          src={url}
          alt={`${englishName(post.authorHandle)}의 사진 ${index + 1}`}
          width={post.photos[index].width}
          height={post.photos[index].height}
          decoding="async"
        />
      ) : error ? (
        <span className="photo-image-error">
          <Images size={25} />
          <span>사진을 불러오지 못했어요</span>
          {retryable && (
            <button
              type="button"
              className="text-button"
              onClick={() => setRetry((n) => n + 1)}
            >
              다시 불러오기
            </button>
          )}
        </span>
      ) : (
        <span className="photo-placeholder" aria-label="사진 불러오는 중">
          <Images size={32} />
        </span>
      )}
    </span>
  );
}

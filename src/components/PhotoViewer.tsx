import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import type { PhotoPost } from "../../shared/photos";
import { englishName } from "../lib/utils";
import { lockDocumentScroll } from "../lib/scroll-lock";
import { openDialog } from "../lib/dialog-focus";
import {
  PHOTO_FIT,
  clampPhotoTransform,
  type PhotoTransform,
} from "../lib/photo-viewer-geometry";
import PhotoImage from "./PhotoImage";
import { photoViewerMotionTokens as photoMotion } from "../design/motion-tokens";

export default function PhotoViewer({
  post,
  initialIndex,
  onClose,
}: {
  post: PhotoPost;
  initialIndex: number;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [index, setIndex] = useState(initialIndex);
  const [transform, setTransform] = useState(PHOTO_FIT);
  const current = useRef(PHOTO_FIT);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({
    x: 0,
    y: 0,
    distance: 0,
    transform: PHOTO_FIT,
    multi: false,
  });
  const lastTap = useRef(0);

  useLayoutEffect(() => {
    const node = dialog.current;
    const unlock = lockDocumentScroll();
    openDialog(node);
    return () => {
      node?.close();
      unlock();
    };
  }, []);

  function update(value: PhotoTransform) {
    const box = stage.current?.getBoundingClientRect();
    const next = box
      ? clampPhotoTransform(value, box, post.photos[index])
      : PHOTO_FIT;
    current.current = next;
    setTransform(next);
  }
  function go(next: number) {
    if (next < 0 || next >= post.photos.length) return;
    pointers.current.clear();
    current.current = PHOTO_FIT;
    setTransform(PHOTO_FIT);
    setIndex(next);
    lastTap.current = 0;
  }
  function zoom() {
    update(
      current.current.scale > 1
        ? PHOTO_FIT
        : { scale: photoMotion.toggleZoom, x: 0, y: 0 },
    );
  }
  useLayoutEffect(() => {
    const node = stage.current;
    if (!node) return;
    const observer = new ResizeObserver(() => update(current.current));
    observer.observe(node);
    return () => observer.disconnect();
  }, [index]);

  function begin(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as Element).closest("button"))
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const points = [...pointers.current.values()];
    if (points.length === 1) {
      gesture.current = {
        x: event.clientX,
        y: event.clientY,
        distance: 0,
        transform: current.current,
        multi: false,
      };
    } else if (points.length === 2) {
      gesture.current = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
        distance: Math.hypot(
          points[1].x - points[0].x,
          points[1].y - points[0].y,
        ),
        transform: current.current,
        multi: true,
      };
    }
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const points = [...pointers.current.values()];
    const start = gesture.current;
    if (points.length === 2 && start.distance > 0) {
      const box = event.currentTarget.getBoundingClientRect();
      const scale = Math.max(
        1,
        Math.min(
          photoMotion.maxZoom,
          (start.transform.scale *
            Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)) /
            start.distance,
        ),
      );
      const ratio = scale / start.transform.scale;
      const cx = box.left + box.width / 2,
        cy = box.top + box.height / 2;
      update({
        scale,
        x:
          (points[0].x + points[1].x) / 2 -
          cx -
          (start.x - cx - start.transform.x) * ratio,
        y:
          (points[0].y + points[1].y) / 2 -
          cy -
          (start.y - cy - start.transform.y) * ratio,
      });
    } else if (
      points.length === 1 &&
      !start.multi &&
      current.current.scale > 1
    ) {
      update({
        ...current.current,
        x: start.transform.x + event.clientX - start.x,
        y: start.transform.y + event.clientY - start.y,
      });
    }
  }
  function end(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.delete(event.pointerId)) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const start = gesture.current;
    if (event.type === "pointercancel") {
      lastTap.current = 0;
      return;
    }
    if (start.multi || pointers.current.size) return;
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    if (
      current.current.scale === 1 &&
      Math.abs(dx) > photoMotion.swipeThresholdPx &&
      Math.abs(dx) > Math.abs(dy) * photoMotion.swipeDirectionRatio
    )
      go(index + (dx < 0 ? 1 : -1));
    else if (Math.hypot(dx, dy) < photoMotion.tapTolerancePx) {
      const now = Date.now();
      if (now - lastTap.current < photoMotion.doubleTapDelayMs) {
        zoom();
        lastTap.current = 0;
      } else lastTap.current = now;
    }
  }

  return (
    <dialog
      ref={dialog}
      className="photo-lightbox"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (
          current.current.scale > 1 &&
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        ) {
          event.preventDefault();
          const delta = photoMotion.keyboardPanStepPx;
          update({
            ...current.current,
            x:
              current.current.x +
              (event.key === "ArrowLeft"
                ? delta
                : event.key === "ArrowRight"
                  ? -delta
                  : 0),
            y:
              current.current.y +
              (event.key === "ArrowUp"
                ? delta
                : event.key === "ArrowDown"
                  ? -delta
                  : 0),
          });
          return;
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          go(index + (event.key === "ArrowRight" ? 1 : -1));
        }
      }}
    >
      <header className="photo-lightbox-header">
        <h2 id={titleId} data-dialog-title tabIndex={-1}>
          {englishName(post.authorHandle)}의 순간
        </h2>
        <div className="ds-control-group ds-glass">
          <button
            className="ds-icon-button"
            onClick={zoom}
            aria-pressed={transform.scale > 1}
            aria-label={transform.scale > 1 ? "사진 원래 크기로" : "사진 확대"}
          >
            {transform.scale > 1 ? <ZoomOut /> : <ZoomIn />}
          </button>
          <button
            className="ds-icon-button"
            onClick={onClose}
            aria-label="사진 닫기"
          >
            <X />
          </button>
        </div>
      </header>
      <div
        ref={stage}
        className={`photo-lightbox-stage ${transform.scale > 1 ? "is-zoomed" : ""}`}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onDragStart={(event) => event.preventDefault()}
      >
        <div
          className="photo-lightbox-image"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
        >
          <PhotoImage post={post} index={index} full eager retryable />
        </div>
      </div>
      <footer className="photo-lightbox-footer">
        <div className="photo-lightbox-navigation">
          <button
            className="ds-icon-button ds-glass"
            aria-label="이전 사진"
            disabled={index === 0}
            onClick={() => go(index - 1)}
          >
            <ChevronLeft />
          </button>
          <span aria-live="polite" aria-atomic="true">
            {index + 1} / {post.photos.length}
          </span>
          <button
            className="ds-icon-button ds-glass"
            aria-label="다음 사진"
            disabled={index === post.photos.length - 1}
            onClick={() => go(index + 1)}
          >
            <ChevronRight />
          </button>
        </div>
        {post.caption && (
          <details className="photo-lightbox-caption">
            <summary>사진 이야기</summary>
            <p>{post.caption}</p>
          </details>
        )}
      </footer>
    </dialog>
  );
}

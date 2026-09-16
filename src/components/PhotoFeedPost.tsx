import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Expand,
  Trash2,
  Heart,
  MessageCircle,
} from "lucide-react";
import type { PhotoPost, PhotoComment } from "../../shared/photos";
import { englishName, formatDate, formatTime } from "../lib/utils";
import { Avatar } from "./common";
import PhotoImage from "./PhotoImage";
import CommentHeart from "./CommentHeart";

export default function PhotoFeedPost({
  post,
  team,
  canDelete,
  onOpen,
  onDelete,
  onLike,
  onComments,
  onCommentLike,
  commentLikeBusy,
  likeBusy,
  disabled,
}: {
  post: PhotoPost;
  team?: string;
  canDelete: boolean;
  onOpen: (post: PhotoPost, index: number) => void;
  onDelete: (post: PhotoPost) => void;
  onLike: (post: PhotoPost) => void;
  onComments: (post: PhotoPost, comment?: PhotoComment) => void;
  onCommentLike: (post: PhotoPost, comment: PhotoComment) => void;
  commentLikeBusy: (comment: PhotoComment) => boolean;
  likeBusy: boolean;
  disabled: boolean;
}) {
  const track = useRef<HTMLDivElement>(null),
    menu = useRef<HTMLDivElement>(null),
    menuButton = useRef<HTMLButtonElement>(null);
  const [active, setActive] = useState(0),
    [expanded, setExpanded] = useState(false),
    [menuOpen, setMenuOpen] = useState(false);
  const name = englishName(post.authorHandle),
    multiple = post.photos.length > 1;
  const longCaption =
    post.caption.length > 120 || post.caption.split("\n").length > 3;
  const first = post.photos[0];
  const ratio = Math.max(0.8, Math.min(4 / 3, first.width / first.height));
  const timestamp = new Date(post.createdAt).toISOString();
  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);
  function go(index: number) {
    const next = Math.max(0, Math.min(post.photos.length - 1, index));
    track.current?.scrollTo({
      left: next * track.current.clientWidth,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  return (
    <article className="photo-feed-post" aria-label={`${name}의 게시글`}>
      <header className="photo-post-header">
        <span className="photo-avatar-ring">
          <Avatar name={name} />
        </span>
        <div className="photo-post-author">
          <h2>{name}</h2>
          <span>{team && team !== "미배정" ? team : "함께한 오늘의 순간"}</span>
        </div>
        {canDelete && (
          <div className="photo-post-menu" ref={menu}>
            <button
              ref={menuButton}
              className="icon-button"
              aria-label={`${name}의 게시글 메뉴`}
              aria-expanded={menuOpen}
              aria-controls={`photo-menu-${post.id}`}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Ellipsis size={23} />
            </button>
            {menuOpen && (
              <div className="photo-menu-panel" id={`photo-menu-${post.id}`}>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    menuButton.current?.focus();
                    onDelete(post);
                  }}
                >
                  <Trash2 size={16} />
                  게시글 삭제
                </button>
              </div>
            )}
          </div>
        )}
      </header>
      <div
        className="photo-carousel"
        role="group"
        aria-roledescription="사진 슬라이드"
        aria-label={`${name}의 사진 ${post.photos.length}장`}
        style={{ "--photo-ratio": ratio } as CSSProperties}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            go(active + (event.key === "ArrowRight" ? 1 : -1));
          }
        }}
      >
        <div
          className="photo-carousel-track"
          ref={track}
          onScroll={(event) => {
            const element = event.currentTarget;
            if (!element.clientWidth) return;
            const next = Math.max(
              0,
              Math.min(
                post.photos.length - 1,
                Math.round(element.scrollLeft / element.clientWidth),
              ),
            );
            setActive(next);
            if (
              element.contains(document.activeElement) &&
              document.activeElement?.classList.contains("photo-slide")
            ) {
              element
                .querySelectorAll<HTMLButtonElement>(".photo-slide")
                [next]?.focus({ preventScroll: true });
            }
          }}
        >
          {post.photos.map((_, index) => (
            <button
              key={index}
              className="photo-slide"
              tabIndex={index === active ? 0 : -1}
              aria-hidden={index !== active}
              onClick={() => onOpen(post, index)}
              aria-label={`${name}의 사진 ${index + 1} 크게 보기`}
            >
              <PhotoImage
                post={post}
                index={index}
                full
                enabled={index === active}
              />
            </button>
          ))}
        </div>
        {multiple && (
          <>
            <span
              className="photo-slide-count"
              aria-live="polite"
              aria-atomic="true"
            >
              {active + 1} / {post.photos.length}
            </span>
            <button
              className="photo-carousel-arrow previous"
              aria-label="피드 이전 사진"
              disabled={active === 0}
              onClick={() => go(active - 1)}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              className="photo-carousel-arrow next"
              aria-label="피드 다음 사진"
              disabled={active === post.photos.length - 1}
              onClick={() => go(active + 1)}
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>
      <div className="photo-post-body">
        <div className="photo-post-actions">
          <div className="photo-reactions">
            <button
              className={`photo-like ${post.liked ? "is-liked" : ""}`}
              aria-label={post.liked ? "좋아요 취소" : "좋아요"}
              aria-pressed={Boolean(post.liked)}
              aria-busy={likeBusy}
              disabled={disabled || likeBusy}
              onClick={() => onLike(post)}
            >
              <Heart size={24} fill={post.liked ? "currentColor" : "none"} />
            </button>
            <button
              className="photo-comment-open"
              aria-label={`댓글 ${post.commentCount ?? 0}개 보기`}
              disabled={disabled}
              onClick={() => onComments(post)}
            >
              <MessageCircle size={24} />
            </button>
          </div>
          <button
            className="photo-expand"
            onClick={() => onOpen(post, active)}
            aria-label={`${name}의 현재 사진 크게 보기`}
          >
            <Expand size={19} />
            <span>크게 보기</span>
          </button>
          {multiple && (
            <div className="photo-pagination" aria-label="사진 선택">
              {post.photos.map((_, index) => (
                <button
                  key={index}
                  onClick={() => go(index)}
                  aria-label={`사진 ${index + 1} 보기`}
                  aria-current={index === active ? "true" : undefined}
                >
                  <span />
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="photo-like-count">좋아요 {post.likeCount ?? 0}개</p>
        {post.caption && (
          <div className="photo-post-caption">
            <p
              id={`photo-caption-${post.id}`}
              className={`photo-caption ${longCaption && !expanded ? "is-collapsed" : ""}`}
            >
              <strong>{name}</strong> {post.caption}
            </p>
            {longCaption && (
              <button
                className="photo-caption-toggle"
                aria-expanded={expanded}
                aria-controls={`photo-caption-${post.id}`}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? "접기" : "더 보기"}
              </button>
            )}
          </div>
        )}
        {Boolean(post.commentPreview?.length) && (
          <ol className="photo-comment-preview" aria-label="최근 댓글 미리보기">
            {post.commentPreview!.map((comment) => (
              <li key={comment.id} data-preview-comment-id={comment.id}>
                <button
                  className="photo-preview-body"
                  disabled={disabled}
                  onClick={() => onComments(post, comment)}
                  aria-label={`${englishName(comment.authorHandle)}의 ${comment.parentId ? "답글" : "댓글"} 보기`}
                >
                  <span>
                    <strong>{englishName(comment.authorHandle)}</strong>{" "}
                    {comment.parentId && comment.replyToHandle && (
                      <span className="photo-reply-mention">
                        ↳ @{englishName(comment.replyToHandle)}{" "}
                      </span>
                    )}
                    {comment.body}
                  </span>
                </button>
                <CommentHeart
                  comment={comment}
                  busy={commentLikeBusy(comment)}
                  disabled={disabled}
                  onClick={() => onCommentLike(post, comment)}
                />
              </li>
            ))}
          </ol>
        )}
        <button
          className="photo-comments-link"
          disabled={disabled}
          onClick={() => onComments(post)}
        >
          {post.commentCount
            ? `댓글 ${post.commentCount}개 보기`
            : "첫 댓글 남기기"}
        </button>
        <time className="photo-post-time" dateTime={timestamp}>
          {formatDate(timestamp)} · {formatTime(timestamp)}
        </time>
      </div>
    </article>
  );
}

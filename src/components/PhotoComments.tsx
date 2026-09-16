import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUp,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import type { Member } from "../../shared/types";
import {
  COMMENT_MAX_LENGTH,
  type PhotoComment,
  type PhotoCursor,
  type PhotoPost,
  type PhotoResponse,
} from "../../shared/photos";
import {
  addPhotoComment,
  listPhotoComments,
  listPhotoReplies,
  removePhotoComment,
  setPhotoCommentLike,
} from "../lib/photos";
import {
  englishName,
  errorMessage,
  formatDate,
  formatTime,
} from "../lib/utils";
import { Avatar, Drawer } from "./common";
import CommentHeart from "./CommentHeart";

type Thread = {
  items: PhotoComment[];
  cursor: PhotoCursor | null;
  open: boolean;
  loading: boolean;
  loaded: boolean;
  error: string;
};
const blankThread = (): Thread => ({
  items: [],
  cursor: null,
  open: true,
  loading: false,
  loaded: false,
  error: "",
});
const ordered = (comments: PhotoComment[]) =>
  [...new Map(comments.map((c) => [c.id, c])).values()].sort(
    (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id),
  );
function CommentRow({
  comment,
  member,
  disabled,
  liking,
  deleting,
  confirm,
  onLike,
  onReply,
  onConfirm,
  onCancel,
  onRemove,
}: {
  comment: PhotoComment;
  member: Member;
  disabled: boolean;
  liking: boolean;
  deleting: boolean;
  confirm: boolean;
  onLike: () => void;
  onReply: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const deleted = comment.status !== "active",
    name = englishName(comment.authorHandle),
    date = new Date(comment.createdAt).toISOString();
  return (
    <div
      className={`photo-comment-row ${deleted ? "is-deleted" : ""}`}
      data-comment-id={comment.id}
    >
      {deleted ? (
        <span className="photo-deleted-avatar" aria-hidden="true">
          —
        </span>
      ) : (
        <Avatar name={name} />
      )}
      <div className="photo-comment-content">
        {deleted ? (
          <p className="photo-deleted-copy">삭제된 댓글입니다.</p>
        ) : (
          <p>
            <strong>{name}</strong>{" "}
            {comment.parentId && comment.replyToHandle && (
              <span className="photo-reply-mention">
                @{englishName(comment.replyToHandle)}{" "}
              </span>
            )}
            {comment.body}
          </p>
        )}
        <div className="photo-comment-meta">
          <time dateTime={date}>
            {formatDate(date)} · {formatTime(date)}
          </time>
          {!deleted && (
            <>
              <button
                className="photo-comment-reply"
                disabled={disabled}
                onClick={onReply}
                aria-label={`${name}에게 답글`}
              >
                답글 달기
              </button>
              {(comment.authorId === member.id || member.role !== "member") && (
                <button
                  className="photo-comment-delete"
                  disabled={disabled}
                  onClick={onConfirm}
                  aria-label={`${name}의 ${comment.parentId ? "답글" : "댓글"} 삭제`}
                >
                  삭제
                </button>
              )}
            </>
          )}
        </div>
        {confirm && (
          <div className="photo-comment-confirm">
            <span>
              {!comment.parentId && (comment.replyCount ?? 0) > 0
                ? "이 댓글만 삭제할까요? 답글은 남아요."
                : "댓글을 삭제할까요?"}
            </span>
            <button
              className="text-button"
              disabled={deleting}
              onClick={onCancel}
            >
              취소
            </button>
            <button
              className="text-button danger-text"
              disabled={disabled}
              onClick={onRemove}
            >
              {deleting ? "삭제 중…" : "삭제하기"}
            </button>
          </div>
        )}
      </div>
      {!deleted && (
        <CommentHeart
          comment={comment}
          busy={liking}
          disabled={disabled}
          onClick={onLike}
        />
      )}
    </div>
  );
}
export default function PhotoComments({
  post,
  member,
  initialComment,
  onUpdate,
  onCommentChange,
  onClose,
}: {
  post: PhotoPost;
  member: Member;
  initialComment?: PhotoComment;
  onUpdate: (result: PhotoResponse) => void;
  onCommentChange: (comment: PhotoComment) => void;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<PhotoComment[]>([]),
    [cursor, setCursor] = useState<PhotoCursor | null>(null),
    [threads, setThreads] = useState<Record<string, Thread>>({});
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [actionError, setActionError] = useState("");
  const [body, setBody] = useState(""),
    [replyTo, setReplyTo] = useState<PhotoComment | null>(null),
    [sending, setSending] = useState(false),
    [deleting, setDeleting] = useState<string | null>(null),
    [confirm, setConfirm] = useState<string | null>(null),
    [liking, setLiking] = useState<string | null>(null);
  const [focusId, setFocusId] = useState(initialComment?.id ?? null);
  const mounted = useRef(true),
    loadVersion = useRef(0),
    threadVersions = useRef<Record<string, number>>({}),
    threadsRef = useRef(threads),
    commentsRef = useRef(comments),
    requestId = useRef(crypto.randomUUID()),
    writeLock = useRef(false),
    input = useRef<HTMLTextAreaElement>(null);
  threadsRef.current = threads;
  commentsRef.current = comments;
  const busy = sending || deleting !== null || liking !== null,
    reading =
      loading || Object.values(threads).some((thread) => thread.loading),
    disabled = busy || reading;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      loadVersion.current++;
    };
  }, []);
  useEffect(() => {
    if (!focusId) return;
    const row = document.querySelector<HTMLElement>(
      `.photo-comments [data-comment-id="${focusId}"]`,
    );
    if (row) {
      row.scrollIntoView({ block: "nearest", behavior: "instant" });
      setFocusId(null);
    }
  }, [focusId, comments, threads]);
  function applyComment(comment: PhotoComment) {
    if (comment.parentId) {
      setThreads((current) => {
        const thread = current[comment.parentId!];
        if (!thread) return current;
        return {
          ...current,
          [comment.parentId!]: {
            ...thread,
            items:
              comment.status === "active"
                ? ordered([
                    ...thread.items.filter((c) => c.id !== comment.id),
                    comment,
                  ])
                : thread.items.filter((c) => c.id !== comment.id),
          },
        };
      });
    } else
      setComments((current) =>
        comment.status === "deleted"
          ? current.filter((c) => c.id !== comment.id)
          : ordered([...current.filter((c) => c.id !== comment.id), comment]),
      );
    onCommentChange(comment);
  }
  async function load(more = false) {
    const version = ++loadVersion.current;
    setLoading(true);
    setLoadError("");
    try {
      const result = await listPhotoComments(
        post,
        member,
        more ? (cursor ?? undefined) : undefined,
      );
      if (!mounted.current || version !== loadVersion.current) return;
      setComments((current) =>
        more
          ? ordered([...current, ...(result.comments ?? [])])
          : (result.comments ?? []),
      );
      setCursor(result.nextCommentCursor ?? null);
      onUpdate(result);
      if (!more) setThreads({});
    } catch (error) {
      if (mounted.current && version === loadVersion.current)
        setLoadError(errorMessage(error));
    } finally {
      if (mounted.current && version === loadVersion.current) setLoading(false);
    }
  }
  async function loadThread(parentId: string, more = false) {
    const version = (threadVersions.current[parentId] ?? 0) + 1;
    threadVersions.current[parentId] = version;
    const cursor = more
      ? (threadsRef.current[parentId]?.cursor ?? undefined)
      : undefined;
    setThreads((current) => ({
      ...current,
      [parentId]: {
        ...(current[parentId] ?? blankThread()),
        open: true,
        loading: true,
        error: "",
      },
    }));
    try {
      const result = await listPhotoReplies(post, member, parentId, cursor);
      if (!mounted.current || threadVersions.current[parentId] !== version)
        return;
      if (result.parentComment) applyComment(result.parentComment);
      onUpdate(result);
      setThreads((current) => ({
        ...current,
        [parentId]: {
          ...(current[parentId] ?? blankThread()),
          items: more
            ? ordered([
                ...(current[parentId]?.items ?? []),
                ...(result.replies ?? []),
              ])
            : (result.replies ?? []),
          cursor: result.nextReplyCursor ?? null,
          open: true,
          loading: false,
          loaded: true,
          error: "",
        },
      }));
    } catch (error) {
      if (mounted.current && threadVersions.current[parentId] === version) {
        if (!commentsRef.current.some((comment) => comment.id === parentId))
          setActionError(errorMessage(error));
        setThreads((current) => ({
          ...current,
          [parentId]: {
            ...(current[parentId] ?? blankThread()),
            loading: false,
            error: errorMessage(error),
          },
        }));
      }
    }
  }
  useEffect(() => {
    void (async () => {
      await load();
      if (initialComment && mounted.current)
        await loadThread(initialComment.parentId ?? initialComment.id);
    })();
  }, [post.id]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (writeLock.current || reading || !body.trim()) return;
    if (!navigator.onLine) {
      setActionError("인터넷에 연결한 뒤 댓글을 남겨주세요.");
      return;
    }
    writeLock.current = true;
    setSending(true);
    setActionError("");
    try {
      const result = await addPhotoComment(
        post,
        member,
        requestId.current,
        body,
        replyTo ?? undefined,
      );
      if (!mounted.current) return;
      if (!result.comment)
        throw new Error("댓글을 확인하지 못했어요. 다시 시도해주세요.");
      if (result.parentComment) applyComment(result.parentComment);
      applyComment(result.comment);
      onUpdate(result);
      setBody("");
      setReplyTo(null);
      requestId.current = crypto.randomUUID();
      setFocusId(result.comment.id);
      if (result.comment.parentId) await loadThread(result.comment.parentId);
    } catch (error) {
      if (mounted.current) setActionError(errorMessage(error));
    } finally {
      writeLock.current = false;
      if (mounted.current) setSending(false);
    }
  }
  async function remove(comment: PhotoComment) {
    if (writeLock.current || reading) return;
    writeLock.current = true;
    setDeleting(comment.id);
    setActionError("");
    try {
      const result = await removePhotoComment(post, member, comment);
      if (!mounted.current) return;
      if (result.comment) applyComment(result.comment);
      else setComments((current) => current.filter((c) => c.id !== comment.id));
      if (result.parentComment) applyComment(result.parentComment);
      onUpdate(result);
      setConfirm(null);
      if (replyTo?.id === comment.id) {
        setReplyTo(null);
        requestId.current = crypto.randomUUID();
      }
    } catch (error) {
      if (mounted.current) setActionError(errorMessage(error));
    } finally {
      writeLock.current = false;
      if (mounted.current) setDeleting(null);
    }
  }
  async function like(comment: PhotoComment) {
    if (writeLock.current || reading) return;
    if (!navigator.onLine) {
      setActionError("인터넷에 연결한 뒤 하트를 눌러주세요.");
      return;
    }
    writeLock.current = true;
    setLiking(comment.id);
    setActionError("");
    applyComment({
      ...comment,
      liked: !comment.liked,
      likeCount: Math.max(
        0,
        (comment.likeCount ?? 0) + (comment.liked ? -1 : 1),
      ),
    });
    try {
      const result = await setPhotoCommentLike(
        post,
        member,
        comment,
        !comment.liked,
      );
      if (mounted.current) applyComment(result);
    } catch (error) {
      if (mounted.current) {
        applyComment(comment);
        setActionError(errorMessage(error));
      }
    } finally {
      writeLock.current = false;
      if (mounted.current) setLiking(null);
    }
  }
  function reply(comment: PhotoComment) {
    setReplyTo(comment);
    requestId.current = crypto.randomUUID();
    setActionError("");
    input.current?.focus();
  }
  const row = (comment: PhotoComment) => (
    <CommentRow
      comment={comment}
      member={member}
      disabled={disabled}
      liking={liking === comment.id}
      deleting={deleting === comment.id}
      confirm={confirm === comment.id}
      onLike={() => void like(comment)}
      onReply={() => reply(comment)}
      onConfirm={() => setConfirm(comment.id)}
      onCancel={() => setConfirm(null)}
      onRemove={() => void remove(comment)}
    />
  );
  return (
    <Drawer
      title={`댓글 ${post.commentCount ?? 0}개`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="photo-comments">
        <div className="photo-comment-context">
          <Avatar name={englishName(post.authorHandle)} />
          <p>
            <strong>{englishName(post.authorHandle)}</strong>
            {post.caption || "함께 나누는 오늘의 순간"}
          </p>
        </div>
        <div className="photo-comments-heading">
          <span>따뜻한 한마디를 남겨주세요.</span>
          <button
            className="icon-button"
            aria-label="댓글 새로고침"
            disabled={disabled}
            onClick={() => void load()}
          >
            <RefreshCw size={16} className={loading ? "photo-spinning" : ""} />
          </button>
        </div>
        {loadError && (
          <div className="photo-comment-error" role="alert">
            <p>{loadError}</p>
            <button
              className="text-button"
              onClick={() => void load()}
              disabled={disabled}
            >
              다시 불러오기
            </button>
          </div>
        )}
        {loading && !comments.length ? (
          <p className="photo-comments-empty" role="status">
            <LoaderCircle className="photo-spinning" size={20} />
            댓글을 불러오고 있어요…
          </p>
        ) : !comments.length && !loadError ? (
          <div className="photo-comments-empty">
            <MessageCircle size={28} />
            <strong>첫 댓글을 남겨볼까요?</strong>
            <span>이 순간을 함께 기억할 한마디.</span>
          </div>
        ) : null}
        <ol className="photo-comments-list" aria-label="댓글 목록">
          {comments.map((comment) => {
            const thread = threads[comment.id];
            return (
              <li key={comment.id}>
                {row(comment)}
                {((comment.replyCount ?? 0) > 0 || thread?.open) && (
                  <div className="photo-thread">
                    <button
                      className="photo-thread-toggle"
                      disabled={disabled}
                      aria-expanded={Boolean(thread?.open)}
                      onClick={() => {
                        if (thread?.open)
                          setThreads((current) => ({
                            ...current,
                            [comment.id]: {
                              ...current[comment.id],
                              open: false,
                            },
                          }));
                        else if (thread?.loaded)
                          setThreads((current) => ({
                            ...current,
                            [comment.id]: {
                              ...current[comment.id],
                              open: true,
                            },
                          }));
                        else void loadThread(comment.id);
                      }}
                    >
                      {thread?.open ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}{" "}
                      {thread?.open
                        ? "답글 접기"
                        : `답글 ${comment.replyCount ?? 0}개 보기`}
                    </button>
                    {thread?.open && (
                      <>
                        {thread.loading && (
                          <p className="photo-thread-status" role="status">
                            답글을 불러오는 중…
                          </p>
                        )}
                        {thread.error && (
                          <p className="photo-comment-error" role="alert">
                            {thread.error}
                            <button
                              className="text-button"
                              disabled={disabled}
                              onClick={() => void loadThread(comment.id)}
                            >
                              다시 불러오기
                            </button>
                          </p>
                        )}
                        <ol
                          className="photo-replies-list"
                          aria-label="답글 목록"
                        >
                          {thread.items.map((item) => (
                            <li key={item.id}>{row(item)}</li>
                          ))}
                        </ol>
                        {thread.cursor && (
                          <button
                            className="text-button photo-replies-more"
                            disabled={disabled}
                            onClick={() => void loadThread(comment.id, true)}
                          >
                            이전 답글 더 보기
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {cursor && (
          <button
            className="text-button photo-comments-more"
            onClick={() => void load(true)}
            disabled={disabled}
          >
            이전 댓글 더 보기
          </button>
        )}
        {actionError && (
          <p className="photo-comment-error" role="alert">
            {actionError}
          </p>
        )}
        {replyTo && (
          <div className="photo-reply-target">
            <span>
              <strong>{englishName(replyTo.authorHandle)}</strong>에게 답글
              남기는 중
            </span>
            <button
              className="icon-button"
              aria-label="답글 취소"
              disabled={busy}
              onClick={() => {
                setReplyTo(null);
                requestId.current = crypto.randomUUID();
                input.current?.focus();
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <form
          className="photo-comment-form"
          onSubmit={(event) => void submit(event)}
        >
          <Avatar name={englishName(member.handle)} />
          <div>
            <label
              htmlFor={`comment-body-${post.id}`}
              className="photo-comment-input-label"
            >
              {replyTo ? "답글 남기기" : "댓글 남기기"}
            </label>
            <textarea
              ref={input}
              id={`comment-body-${post.id}`}
              aria-label={replyTo ? "답글 내용" : "댓글 내용"}
              rows={2}
              maxLength={COMMENT_MAX_LENGTH}
              placeholder={
                replyTo
                  ? `${englishName(replyTo.authorHandle)}에게 한마디…`
                  : "이 순간에 한마디를 더해보세요…"
              }
              value={body}
              disabled={sending}
              onChange={(event) => {
                setBody(event.target.value);
                requestId.current = crypto.randomUUID();
              }}
            />
            <small>
              {body.length}/{COMMENT_MAX_LENGTH}
            </small>
          </div>
          <button
            className="photo-comment-submit"
            type="submit"
            aria-label={replyTo ? "답글 게시" : "댓글 게시"}
            disabled={disabled || !body.trim() || !navigator.onLine}
          >
            {sending ? (
              <LoaderCircle size={20} className="photo-spinning" />
            ) : (
              <ArrowUp size={21} />
            )}
          </button>
        </form>
      </div>
    </Drawer>
  );
}

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, LoaderCircle, MessageCircle, RefreshCw } from "lucide-react";
import type { Member } from "../../shared/types";
import {
  COMMENT_MAX_LENGTH,
  type PhotoComment,
  type PhotoCursor,
  type PhotoPost,
} from "../../shared/photos";
import {
  addPhotoComment,
  listPhotoComments,
  removePhotoComment,
} from "../lib/photos";
import {
  englishName,
  errorMessage,
  formatDate,
  formatTime,
} from "../lib/utils";
import { Avatar, Drawer } from "./common";

export default function PhotoComments({
  post,
  member,
  onCount,
  onClose,
}: {
  post: PhotoPost;
  member: Member;
  onCount: (count: number) => void;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<PhotoComment[]>([]),
    [cursor, setCursor] = useState<PhotoCursor | null>(null);
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [actionError, setActionError] = useState("");
  const [body, setBody] = useState(""),
    [sending, setSending] = useState(false),
    [deleting, setDeleting] = useState<string | null>(null),
    [confirm, setConfirm] = useState<string | null>(null);
  const mounted = useRef(true),
    loadVersion = useRef(0),
    requestId = useRef(crypto.randomUUID()),
    sendLock = useRef(false),
    deleteLock = useRef(false),
    list = useRef<HTMLOListElement>(null);
  const busy = sending || deleting !== null;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      loadVersion.current++;
    };
  }, []);
  async function load(more = false) {
    const version = ++loadVersion.current;
    setLoading(true);
    setLoadError("");
    try {
      const result = await listPhotoComments(
        post,
        more ? (cursor ?? undefined) : undefined,
      );
      if (!mounted.current || version !== loadVersion.current) return;
      setComments((current) =>
        more
          ? [
              ...current,
              ...(result.comments ?? []).filter(
                (c) => !current.some((item) => item.id === c.id),
              ),
            ]
          : (result.comments ?? []),
      );
      setCursor(result.nextCommentCursor ?? null);
      if (result.commentCount !== undefined) onCount(result.commentCount);
    } catch (error) {
      if (mounted.current && version === loadVersion.current)
        setLoadError(errorMessage(error));
    } finally {
      if (mounted.current && version === loadVersion.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [post.id]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sendLock.current || deleteLock.current || loading || !body.trim())
      return;
    if (!navigator.onLine) {
      setActionError("인터넷에 연결한 뒤 댓글을 남겨주세요.");
      return;
    }
    sendLock.current = true;
    setSending(true);
    setActionError("");
    try {
      const result = await addPhotoComment(
        post,
        member,
        requestId.current,
        body,
      );
      if (!mounted.current) return;
      if (!result.comment)
        throw new Error("댓글을 확인하지 못했어요. 다시 시도해주세요.");
      setComments((current) => [
        result.comment!,
        ...current.filter((c) => c.id !== result.comment!.id),
      ]);
      if (result.commentCount !== undefined) onCount(result.commentCount);
      setBody("");
      requestId.current = crypto.randomUUID();
      list.current?.scrollTo({ top: 0, behavior: "instant" });
    } catch (error) {
      if (mounted.current) setActionError(errorMessage(error));
    } finally {
      sendLock.current = false;
      if (mounted.current) setSending(false);
    }
  }
  async function remove(comment: PhotoComment) {
    if (deleteLock.current || sendLock.current || loading) return;
    deleteLock.current = true;
    setDeleting(comment.id);
    setActionError("");
    try {
      const result = await removePhotoComment(post, member, comment);
      if (!mounted.current) return;
      setComments((current) => current.filter((c) => c.id !== comment.id));
      setConfirm(null);
      if (result.commentCount !== undefined) onCount(result.commentCount);
    } catch (error) {
      if (mounted.current) setActionError(errorMessage(error));
    } finally {
      deleteLock.current = false;
      if (mounted.current) setDeleting(null);
    }
  }
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
            disabled={loading || busy}
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
              disabled={loading || busy}
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
        <ol ref={list} className="photo-comments-list" aria-label="댓글 목록">
          {comments.map((comment) => {
            const name = englishName(comment.authorHandle),
              date = new Date(comment.createdAt).toISOString();
            return (
              <li key={comment.id}>
                <Avatar name={name} />
                <div className="photo-comment-content">
                  <p>
                    <strong>{name}</strong> {comment.body}
                  </p>
                  <div className="photo-comment-meta">
                    <time dateTime={date}>
                      {formatDate(date)} · {formatTime(date)}
                    </time>
                    {(comment.authorId === member.id ||
                      member.role !== "member") && (
                      <button
                        className="photo-comment-delete"
                        onClick={() => setConfirm(comment.id)}
                        disabled={busy || loading}
                        aria-label={`${name}의 댓글 삭제`}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                  {confirm === comment.id && (
                    <div className="photo-comment-confirm">
                      <span>댓글을 삭제할까요?</span>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => setConfirm(null)}
                      >
                        취소
                      </button>
                      <button
                        className="text-button danger-text"
                        disabled={busy || loading}
                        onClick={() => void remove(comment)}
                      >
                        {deleting === comment.id ? "삭제 중…" : "삭제하기"}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {cursor && (
          <button
            className="text-button photo-comments-more"
            onClick={() => void load(true)}
            disabled={loading || busy}
          >
            {loading ? "불러오는 중…" : "이전 댓글 더 보기"}
          </button>
        )}
        {actionError && (
          <p className="photo-comment-error" role="alert">
            {actionError}
          </p>
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
              댓글 남기기
            </label>
            <textarea
              id={`comment-body-${post.id}`}
              aria-label="댓글 내용"
              rows={2}
              maxLength={COMMENT_MAX_LENGTH}
              placeholder="이 순간에 한마디를 더해보세요…"
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
            aria-label="댓글 게시"
            disabled={busy || loading || !body.trim() || !navigator.onLine}
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

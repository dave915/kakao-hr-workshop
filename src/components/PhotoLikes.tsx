import { useEffect, useRef, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import type { PhotoComment, PhotoLiker, PhotoPost } from "../../shared/photos";
import { useWorkshop } from "../lib/store";
import { listPhotoLikes } from "../lib/photos";
import { englishName, errorMessage } from "../lib/utils";
import { Avatar, Drawer, Empty } from "./common";

export default function PhotoLikes({
  post,
  comment,
  onClose,
}: {
  post: PhotoPost;
  comment?: PhotoComment;
  onClose: () => void;
}) {
  const { state } = useWorkshop();
  const [people, setPeople] = useState<PhotoLiker[]>([]);
  const [count, setCount] = useState(
    comment ? (comment.likeCount ?? 0) : (post.likeCount ?? 0),
  );
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const version = useRef(0);
  const inFlight = useRef(false);

  async function load(more = false) {
    if (!state || inFlight.current) return;
    inFlight.current = true;
    const request = ++version.current;
    setLoading(true);
    setError("");
    try {
      const result = await listPhotoLikes(
        post,
        state.members,
        comment,
        more ? (cursor ?? undefined) : undefined,
      );
      if (request !== version.current) return;
      setPeople((current) =>
        more
          ? [
              ...new Map(
                [...current, ...(result.likers ?? [])].map((person) => [
                  person.id,
                  person,
                ]),
              ).values(),
            ]
          : (result.likers ?? []),
      );
      setCount(result.likeCount ?? 0);
      setCursor(result.nextLikeCursor ?? null);
    } catch (e) {
      if (request === version.current) setError(errorMessage(e));
    } finally {
      if (request === version.current) {
        setLoading(false);
        inFlight.current = false;
      }
    }
  }
  useEffect(() => {
    void load();
    return () => {
      version.current++;
      inFlight.current = false;
    };
  }, [post.id, comment?.id, comment?.parentId]);

  const ordered = [...people].sort((a, b) =>
    (a.handle ?? "\uffff").localeCompare(b.handle ?? "\uffff", "en", {
      sensitivity: "base",
    }),
  );
  return (
    <Drawer title="좋아요한 사람" onClose={onClose}>
      <div className="photo-likes-heading">
        <p>
          {comment ? (comment.parentId ? "답글" : "댓글") : "게시글"} · {count}
          명
        </p>
        <button
          className="icon-button"
          aria-label="좋아요 명단 새로고침"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw size={18} className={loading ? "photo-spinning" : ""} />
        </button>
      </div>
      {error && (
        <div role="alert" className="photo-comment-error">
          <p>{error}</p>
          <button
            className="text-button"
            disabled={loading}
            onClick={() => void load()}
          >
            다시 불러오기
          </button>
        </div>
      )}
      {loading && !people.length ? (
        <p className="photo-likes-loading" role="status">
          <LoaderCircle size={20} className="photo-spinning" /> 좋아요한 사람을
          불러오고 있어요…
        </p>
      ) : !people.length && !error ? (
        <Empty
          title="아직 좋아요가 없어요"
          body="누군가 하트를 누르면 여기에 보여요."
        />
      ) : null}
      <ul
        className="photo-likers"
        aria-label="좋아요한 참가자 목록"
        aria-busy={loading}
      >
        {ordered.map((person) => (
          <li key={person.id}>
            <Avatar name={person.handle ? englishName(person.handle) : "?"} />
            <div>
              <strong>
                {person.handle ? englishName(person.handle) : "삭제된 참가자"}
              </strong>
              <span>
                {person.handle
                  ? `@${person.handle}`
                  : "현재 참가자 명단에서 삭제된 계정이에요."}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {cursor && (
        <button
          className="button full"
          disabled={loading}
          onClick={() => void load(true)}
        >
          {loading ? "불러오는 중…" : "더 보기"}
        </button>
      )}
    </Drawer>
  );
}

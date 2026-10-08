import { Heart } from "lucide-react";
import type { PhotoComment } from "../../shared/photos";
import { englishName } from "../lib/utils";
export default function CommentHeart({
  comment,
  busy = false,
  disabled = false,
  onClick,
  onShowLikes,
}: {
  comment: PhotoComment;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
  onShowLikes: () => void;
}) {
  return (
    <div className="photo-comment-reactions">
      <button
        type="button"
        className={`photo-comment-heart ${comment.liked ? "is-liked" : ""}`}
        aria-label={`${englishName(comment.authorHandle)}의 ${comment.parentId ? "답글" : "댓글"} 좋아요${comment.liked ? " 취소" : ""} (${comment.likeCount ?? 0}개)`}
        aria-pressed={Boolean(comment.liked)}
        aria-busy={busy}
        disabled={disabled || busy}
        onClick={onClick}
      >
        <Heart size={17} fill={comment.liked ? "currentColor" : "none"} />
      </button>
      {Boolean(comment.likeCount) && (
        <button
          type="button"
          className="photo-comment-like-count"
          disabled={disabled || busy}
          onClick={onShowLikes}
          aria-label={`${englishName(comment.authorHandle)}의 ${comment.parentId ? "답글" : "댓글"} 좋아요한 사람 ${comment.likeCount}명 보기`}
          title="좋아요한 사람 보기"
        >
          {comment.likeCount}
        </button>
      )}
    </div>
  );
}

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Camera,
  Images,
  Plus,
  RefreshCw,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  LoaderCircle,
} from "lucide-react";
import { useWorkshop } from "../lib/store";
import {
  englishName,
  errorMessage,
  formatDate,
  formatTime,
} from "../lib/utils";
import {
  listPhotos,
  publishPhotos,
  readPhoto,
  removePhotoPost,
} from "../lib/photos";
import { preparePhoto, type PreparedPhoto } from "../lib/photo-images";
import {
  PHOTO_MEMBER_MONTHLY_LIMIT,
  PHOTOS_PER_POST,
  type PhotoCursor,
  type PhotoPost,
} from "../../shared/photos";
import { Avatar, Drawer, Empty, type Notify } from "./common";

function PhotoImage({
  post,
  index = 0,
  full = false,
}: {
  post: PhotoPost;
  index?: number;
  full?: boolean;
}) {
  const element = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState(""),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true,
      objectURL = "",
      started = false;
    setUrl("");
    setError(false);
    const load = async () => {
      if (started) return;
      started = true;
      try {
        const blob = await readPhoto(post, index, full ? "full" : "thumb");
        if (!live) return;
        objectURL = URL.createObjectURL(blob);
        setUrl(objectURL);
      } catch {
        if (live) setError(true);
      }
    };
    const observer =
      !full && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((e) => e.isIntersecting)) {
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
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [post.id, index, full, retry]);
  return (
    <span ref={element} className={`photo-image ${full ? "is-full" : ""}`}>
      {url ? (
        <img
          src={url}
          alt={`${englishName(post.authorHandle)}의 사진 ${index + 1}`}
          width={post.photos[index].width}
          height={post.photos[index].height}
        />
      ) : error ? (
        <span className="photo-image-error">
          <Images size={25} />
          <span>사진을 불러오지 못했어요</span>
          {full && (
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
function PreparedPreview({ photo }: { photo: PreparedPhoto }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const value = URL.createObjectURL(photo.thumb);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [photo]);
  return <img src={url || undefined} alt={photo.name} />;
}
export default function PhotoBoard({ notify }: { notify: Notify }) {
  const { state, me, demo } = useWorkshop();
  const [posts, setPosts] = useState<PhotoPost[]>([]),
    [cursor, setCursor] = useState<PhotoCursor | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [remaining, setRemaining] = useState(PHOTO_MEMBER_MONTHLY_LIMIT);
  const [compose, setCompose] = useState(false),
    [photos, setPhotos] = useState<PreparedPhoto[]>([]),
    [caption, setCaption] = useState("");
  const [preparing, setPreparing] = useState(false),
    [posting, setPosting] = useState(false),
    [progress, setProgress] = useState(0),
    [formError, setFormError] = useState("");
  const [viewing, setViewing] = useState<PhotoPost | null>(null),
    [imageIndex, setImageIndex] = useState(0);
  const [deleting, setDeleting] = useState<PhotoPost | null>(null),
    [deleteBusy, setDeleteBusy] = useState(false),
    [deleteError, setDeleteError] = useState("");
  const requestId = useRef(crypto.randomUUID()),
    mounted = useRef(true),
    loadVersion = useRef(0),
    uploadLock = useRef(false),
    input = useRef<HTMLInputElement>(null);
  const generation = state?.resetGeneration ?? 0;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      loadVersion.current++;
    };
  }, []);
  async function load(more = false) {
    if (!me) return;
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    try {
      const result = await listPhotos(
        me,
        generation,
        more ? (cursor ?? undefined) : undefined,
      );
      if (!mounted.current || version !== loadVersion.current) return;
      setPosts((current) =>
        more
          ? [
              ...current,
              ...(result.posts ?? []).filter(
                (p) => !current.some((c) => c.id === p.id),
              ),
            ]
          : (result.posts ?? []),
      );
      setCursor(result.nextCursor ?? null);
      setRemaining(result.remaining ?? PHOTO_MEMBER_MONTHLY_LIMIT);
    } catch (e) {
      if (mounted.current && version === loadVersion.current)
        setError(errorMessage(e));
    } finally {
      if (mounted.current && version === loadVersion.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [me?.id, generation]);
  useEffect(() => {
    if (!posting) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [posting]);
  if (!state || !me) return null;
  const busy = posting || preparing;
  async function selectFiles(files: File[]) {
    if (busy || !files.length) return;
    setFormError("");
    if (files.length + photos.length > PHOTOS_PER_POST) {
      setFormError(`한 번에 사진 ${PHOTOS_PER_POST}장까지 선택해주세요.`);
      return;
    }
    setPreparing(true);
    try {
      const prepared: PreparedPhoto[] = [];
      for (const file of files) prepared.push(await preparePhoto(file));
      if (mounted.current) {
        setPhotos((current) => [...current, ...prepared]);
        requestId.current = crypto.randomUUID();
      }
    } catch (e) {
      if (mounted.current) setFormError(errorMessage(e));
    } finally {
      if (mounted.current) setPreparing(false);
      if (input.current) input.current.value = "";
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!me || uploadLock.current || preparing || !photos.length) return;
    if (!navigator.onLine) {
      setFormError("인터넷에 연결한 뒤 사진을 올려주세요.");
      return;
    }
    uploadLock.current = true;
    setPosting(true);
    setFormError("");
    setProgress(0);
    try {
      await publishPhotos(
        requestId.current,
        me,
        generation,
        caption,
        photos,
        (p) => {
          if (mounted.current) setProgress(p);
        },
      );
      if (!mounted.current) return;
      setCompose(false);
      setPhotos([]);
      setCaption("");
      requestId.current = crypto.randomUUID();
      notify("우리의 사진첩에 추억을 남겼어요.");
      await load();
    } catch (e) {
      if (mounted.current) setFormError(errorMessage(e));
    } finally {
      uploadLock.current = false;
      if (mounted.current) setPosting(false);
    }
  }
  const openPhoto = (post: PhotoPost) => {
    setImageIndex(0);
    setViewing(post);
  };
  return (
    <div className="photo-board page-enter">
      <div className="page-intro">
        <div>
          <span className="eyebrow">OUR MOMENTS</span>
          <h1>함께 남긴 오늘</h1>
          <p>같이 웃었던 순간, 사진 한 장으로 오래 기억해요.</p>
        </div>
        <button
          className="button dark"
          onClick={() => {
            setFormError("");
            setCompose(true);
          }}
          disabled={!navigator.onLine || remaining === 0}
        >
          <Plus size={18} />
          사진 올리기
        </button>
      </div>
      <div className="photo-board-note">
        <Camera size={22} />
        <div>
          <strong>우리끼리 모으는 작은 사진첩</strong>
          <p>참가자에게만 보여요. 사진을 누르면 크게 볼 수 있어요.</p>
        </div>
      </div>
      <div className="photo-board-toolbar">
        <span>
          {posts.length
            ? `${posts.length}개의 순간을 보고 있어요`
            : "오늘의 순간을 기다리는 중"}
        </span>
        <button
          className="text-button"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? "photo-spinning" : ""} />
          새로고침
        </button>
      </div>
      {demo && (
        <p className="footnote">미리보기 사진은 이 브라우저에만 저장돼요.</p>
      )}
      {error && (
        <div className="photo-feedback" role="alert">
          <p>{error}</p>
          <button className="text-button" onClick={() => void load()}>
            다시 불러오기
          </button>
        </div>
      )}
      {loading && !posts.length ? (
        <div className="photo-loading" role="status">
          <LoaderCircle className="photo-spinning" />
          사진첩을 펼치고 있어요…
        </div>
      ) : !posts.length && !error ? (
        <Empty
          title="첫 번째 순간을 남겨볼까요?"
          body="풍경도, 단체 사진도 좋아요. 함께한 오늘을 채워주세요."
        >
          <button
            className="button dark"
            onClick={() => setCompose(true)}
            disabled={!navigator.onLine || remaining === 0}
          >
            <ImagePlus size={18} />첫 사진 올리기
          </button>
        </Empty>
      ) : null}
      <div className="photo-grid">
        {posts.map((post) => (
          <article className="photo-card" key={post.id}>
            <button
              className="photo-cover"
              onClick={() => openPhoto(post)}
              aria-label={`${englishName(post.authorHandle)}의 사진 ${post.photos.length}장 크게 보기`}
            >
              <PhotoImage post={post} />
              {post.photos.length > 1 && (
                <span className="photo-count">
                  <Images size={14} />
                  {post.photos.length}
                </span>
              )}
            </button>
            <div className="photo-card-body">
              <div className="photo-author">
                <Avatar name={englishName(post.authorHandle)} />
                <div>
                  <strong>{englishName(post.authorHandle)}</strong>
                  <time dateTime={new Date(post.createdAt).toISOString()}>
                    {formatDate(new Date(post.createdAt).toISOString())} ·{" "}
                    {formatTime(new Date(post.createdAt).toISOString())}
                  </time>
                </div>
                {(me.id === post.authorId || me.role !== "member") && (
                  <button
                    className="icon-button photo-delete"
                    aria-label={`${englishName(post.authorHandle)}의 게시글 삭제`}
                    onClick={() => {
                      setDeleteError("");
                      setDeleting(post);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              {post.caption && <p className="photo-caption">{post.caption}</p>}
            </div>
          </article>
        ))}
      </div>
      {cursor && (
        <button
          className="button photo-load-more"
          onClick={() => void load(true)}
          disabled={loading}
        >
          {loading ? "불러오는 중…" : "더 많은 순간 보기"}
        </button>
      )}
      <p className="photo-board-footnote">
        이번 달에 사진 {remaining}장을 더 올릴 수 있어요. 한 사람당 월{" "}
        {PHOTO_MEMBER_MONTHLY_LIMIT}장까지 함께 나눠요.
      </p>
      {compose && (
        <Drawer
          title="오늘의 순간 남기기"
          onClose={() => {
            if (!busy) setCompose(false);
          }}
        >
          <form className="photo-composer" onSubmit={(e) => void submit(e)}>
            <p className="muted">
              함께한 사진을 최대 {PHOTOS_PER_POST}장 골라주세요.
            </p>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              className="photo-file-input"
              aria-label="게시할 사진 선택"
              disabled={busy}
              onChange={(e) =>
                void selectFiles(Array.from(e.target.files ?? []))
              }
            />
            <div className="photo-selected">
              {photos.map((photo, index) => (
                <div
                  className="photo-selected-item"
                  key={`${photo.name}:${index}`}
                >
                  <PreparedPreview photo={photo} />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`사진 ${index + 1} 제외`}
                    disabled={busy}
                    onClick={() => {
                      setPhotos((current) =>
                        current.filter((_, i) => i !== index),
                      );
                      requestId.current = crypto.randomUUID();
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              {photos.length < PHOTOS_PER_POST && (
                <button
                  type="button"
                  className="photo-add"
                  onClick={() => input.current?.click()}
                  disabled={busy}
                >
                  <ImagePlus size={28} />
                  <span>{preparing ? "사진 준비 중…" : "사진 선택"}</span>
                  <small>
                    {photos.length}/{PHOTOS_PER_POST}
                  </small>
                </button>
              )}
            </div>
            <p className="photo-compression-note">
              사진은 보기 좋은 크기로 자동 압축해요. 원본 파일은 기기에
              보관해주세요.
            </p>
            <label className="photo-caption-input">
              이 순간의 이야기
              <textarea
                maxLength={1000}
                rows={4}
                placeholder="어떤 순간이었나요? 짧은 이야기를 남겨주세요."
                value={caption}
                disabled={posting}
                onChange={(e) => {
                  setCaption(e.target.value);
                  requestId.current = crypto.randomUUID();
                }}
              />
              <small>{caption.length}/1,000</small>
            </label>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            {posting && (
              <div className="photo-progress" role="status">
                <progress max={100} value={progress} />
                <span>
                  {progress < 90
                    ? `사진을 올리고 있어요 · ${progress}%`
                    : "게시글을 마무리하고 있어요…"}
                </span>
              </div>
            )}
            <button
              className="button dark full"
              disabled={busy || !photos.length || photos.length > remaining}
            >
              {posting ? (
                <LoaderCircle className="photo-spinning" size={18} />
              ) : (
                <Plus size={18} />
              )}{" "}
              {preparing
                ? "사진 준비 중…"
                : posting
                  ? "게시 중…"
                  : "사진 게시하기"}
            </button>
            {photos.length > remaining && (
              <p className="form-error">
                이번 달에는 {remaining}장만 더 올릴 수 있어요.
              </p>
            )}
          </form>
        </Drawer>
      )}
      {viewing && (
        <Drawer
          title={`${englishName(viewing.authorHandle)}의 순간`}
          onClose={() => setViewing(null)}
        >
          <div className="photo-viewer">
            <PhotoImage post={viewing} index={imageIndex} full />
            {viewing.photos.length > 1 && (
              <div className="photo-viewer-controls">
                <button
                  className="icon-button"
                  aria-label="이전 사진"
                  disabled={imageIndex === 0}
                  onClick={() => setImageIndex((i) => i - 1)}
                >
                  <ChevronLeft />
                </button>
                <span>
                  {imageIndex + 1} / {viewing.photos.length}
                </span>
                <button
                  className="icon-button"
                  aria-label="다음 사진"
                  disabled={imageIndex === viewing.photos.length - 1}
                  onClick={() => setImageIndex((i) => i + 1)}
                >
                  <ChevronRight />
                </button>
              </div>
            )}
            {viewing.caption && (
              <p className="photo-caption">{viewing.caption}</p>
            )}
          </div>
        </Drawer>
      )}
      {deleting && (
        <Drawer
          title="이 게시글을 삭제할까요?"
          onClose={() => {
            if (!deleteBusy) setDeleting(null);
          }}
        >
          <div className="photo-delete-confirm">
            <p>
              글과 사진 {deleting.photos.length}장을 함께 삭제해요. 삭제한
              사진은 되돌릴 수 없어요.
            </p>
            {deleteError && (
              <p className="form-error" role="alert">
                {deleteError}
              </p>
            )}
            <div className="photo-confirm-actions">
              <button
                className="button"
                disabled={deleteBusy}
                onClick={() => setDeleting(null)}
              >
                취소
              </button>
              <button
                className="button danger"
                disabled={deleteBusy}
                onClick={async () => {
                  setDeleteBusy(true);
                  setDeleteError("");
                  try {
                    await removePhotoPost(deleting, me);
                    setPosts((current) =>
                      current.filter((p) => p.id !== deleting.id),
                    );
                    setDeleting(null);
                    notify("게시글과 사진을 삭제했어요.");
                  } catch (e) {
                    setDeleteError(errorMessage(e));
                  } finally {
                    setDeleteBusy(false);
                  }
                }}
              >
                {deleteBusy ? "삭제 중…" : "게시글 삭제"}
              </button>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}

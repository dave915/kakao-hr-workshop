import { httpsCallable } from "firebase/functions";
import {
  getStorage,
  connectStorageEmulator,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import { app, functions, demoMode, firebaseConfig } from "./firebase";
import {
  uploadPhotoPath,
  photoMonth,
  PHOTO_PAGE_SIZE,
  PHOTO_MEMBER_MONTHLY_LIMIT,
  COMMENT_PAGE_SIZE,
  recentComments,
  COMMENTS_PER_POST,
  COMMENTS_PER_MEMBER_DAY,
  commentBody,
  type PhotoComment,
  checkPhotoQuota,
  type PhotoActionInput,
  type PhotoResponse,
  type PhotoPost,
  type PhotoCursor,
} from "../../shared/photos";
import type { Member } from "../../shared/types";
import type { PreparedPhoto } from "./photo-images";
const storage = app
  ? getStorage(
      app,
      `gs://${import.meta.env.VITE_FIREBASE_PHOTO_BUCKET || `${firebaseConfig.projectId}-photos`}`,
    )
  : null;
if (storage && import.meta.env.VITE_USE_EMULATORS === "true")
  connectStorageEmulator(storage, "127.0.0.1", 9487);
export async function photoAction(
  input: PhotoActionInput,
): Promise<PhotoResponse> {
  if (!functions) throw new Error("사진첩 연결 설정을 확인해주세요.");
  try {
    return (
      await httpsCallable<PhotoActionInput, PhotoResponse>(
        functions,
        "photoBoardAction",
      )(input)
    ).data;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "사진첩을 불러오지 못했어요.",
    );
  }
}
interface DemoPost {
  post: PhotoPost;
  images: PreparedPhoto[];
  likes?: string[];
  comments?: PhotoComment[];
  commentLikes?: Record<string, string[]>;
}
let database: Promise<IDBDatabase> | undefined;
function demoDB() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("workshop-photo-demo", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("posts", { keyPath: "post.id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("사진 저장 공간을 열지 못했어요."));
  }));
}
async function demoRead(): Promise<DemoPost[]> {
  const db = await demoDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction("posts").objectStore("posts").getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function demoWrite(post: DemoPost) {
  const db = await demoDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("posts", "readwrite");
    tx.objectStore("posts").put(post);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(new Error("사진 저장 공간이 부족해요. 사진을 줄여주세요."));
  });
}
export async function listPhotos(
  member: Member,
  generation: number,
  cursor?: PhotoCursor,
): Promise<PhotoResponse> {
  if (!demoMode)
    return photoAction({ action: "list", ...(cursor ? { cursor } : {}) });
  const all = await demoRead();
  const posts = all
    .filter(
      (p) => p.post.generation === generation && p.post.status === "published",
    )
    .map((p) => ({
      ...p.post,
      likeCount: p.likes?.length ?? 0,
      liked: p.likes?.includes(member.id) ?? false,
      ...demoCommentSummary(p, member),
    }))
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  const page = posts
    .filter(
      (p) =>
        !cursor ||
        p.createdAt < cursor.createdAt ||
        (p.createdAt === cursor.createdAt && p.id < cursor.id),
    )
    .slice(0, PHOTO_PAGE_SIZE + 1);
  const last = page[Math.min(page.length, PHOTO_PAGE_SIZE) - 1];
  const used = all
    .filter(
      (p) =>
        p.post.authorId === member.id &&
        photoMonth(p.post.createdAt) === photoMonth(Date.now()),
    )
    .reduce((n, p) => n + p.post.photos.length, 0);
  return {
    posts: page.slice(0, PHOTO_PAGE_SIZE),
    nextCursor:
      page.length > PHOTO_PAGE_SIZE
        ? { id: last.id, createdAt: last.createdAt }
        : null,
    remaining: Math.max(0, PHOTO_MEMBER_MONTHLY_LIMIT - used),
  };
}
export async function publishPhotos(
  id: string,
  member: Member,
  generation: number,
  caption: string,
  photos: PreparedPhoto[],
  onProgress: (percent: number) => void,
) {
  if (demoMode) {
    const all = await demoRead(),
      existing = all.find((p) => p.post.id === id);
    if (existing) return existing.post;
    const current = all.filter(
      (p) => photoMonth(p.post.createdAt) === photoMonth(Date.now()),
    );
    const count = (items: DemoPost[]) =>
      items.reduce((n, p) => n + p.post.photos.length, 0);
    const issue = checkPhotoQuota(
      photos.length,
      count(current),
      count(current.filter((p) => p.post.authorId === member.id)),
      count(all.filter((p) => p.post.status !== "deleted")),
    );
    if (issue) throw new Error(issue);
    const now = Date.now(),
      post: PhotoPost = {
        id,
        authorId: member.id,
        authorHandle: member.handle,
        generation,
        caption: caption.trim(),
        photos: photos.map(({ width, height }) => ({ width, height })),
        status: "published",
        createdAt: now,
        updatedAt: now,
        expiresAt: now,
      };
    await demoWrite({ post, images: photos });
    onProgress(100);
    return post;
  }
  if (!storage) throw new Error("사진 저장소에 연결하지 못했어요.");
  const { post, uploaded = [] } = await photoAction({
    action: "begin",
    id,
    caption,
    photos: photos.map(({ width, height }) => ({ width, height })),
  });
  if (!post) throw new Error("사진 업로드를 준비하지 못했어요.");
  if (post.status === "published") return post;
  if (post.status === "draft") {
    const total = photos.reduce((n, p) => n + p.full.size + p.thumb.size, 0);
    let done = 0;
    for (let i = 0; i < photos.length; i++)
      for (const size of ["full", "thumb"] as const) {
        const file = ref(storage, uploadPhotoPath(post, i, size)),
          blob = photos[i][size];
        if (!uploaded.includes(file.fullPath))
          await new Promise<void>((resolve, reject) => {
            const upload = uploadBytesResumable(file, blob, {
              contentType: "image/jpeg",
              cacheControl: "private,max-age=3600",
            });
            upload.on(
              "state_changed",
              (s) =>
                onProgress(
                  Math.round((90 * (done + s.bytesTransferred)) / total),
                ),
              reject,
              () => resolve(),
            );
          });
        done += blob.size;
        onProgress(Math.round((90 * done) / total));
      }
  }
  const result = await photoAction({ action: "publish", id });
  onProgress(100);
  if (!result.post)
    throw new Error(
      "게시 상태를 확인하지 못했어요. 사진첩을 새로고침해주세요.",
    );
  return result.post;
}
export async function removePhotoPost(post: PhotoPost, member: Member) {
  if (!demoMode) {
    await photoAction({ action: "delete", id: post.id });
    return;
  }
  if (member.id !== post.authorId && member.role === "member")
    throw new Error("본인이 올린 글만 삭제할 수 있어요.");
  const existing = (await demoRead()).find((p) => p.post.id === post.id);
  if (existing)
    await demoWrite({
      ...existing,
      post: { ...existing.post, status: "deleted", caption: "" },
      images: [],
      likes: [],
      comments: [],
      commentLikes: {},
    });
}
export async function readPhoto(
  post: PhotoPost,
  index: number,
  size: "full" | "thumb",
) {
  if (demoMode) {
    const saved = (await demoRead()).find(
      (p) => p.post.id === post.id && p.post.status === "published",
    );
    if (!saved?.images[index]) throw new Error("사진을 찾을 수 없어요.");
    return saved.images[index][size];
  }
  if (!storage) throw new Error("사진 저장소에 연결하지 못했어요.");
  const { url } = await photoAction({
    action: "image",
    id: post.id,
    index,
    size,
  });
  if (!url) throw new Error("사진 주소를 불러오지 못했어요.");
  const response = await fetch(url);
  if (!response.ok) throw new Error("사진을 불러오지 못했어요.");
  return response.blob();
}

async function updateDemoPost<T>(
  id: string,
  change: (record: DemoPost) => T,
): Promise<T> {
  const db = await demoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("posts", "readwrite"),
      store = tx.objectStore("posts"),
      request = store.get(id);
    let result: T, problem: unknown;
    request.onsuccess = () => {
      try {
        const record = request.result as DemoPost | undefined;
        if (!record || record.post.status !== "published")
          throw new Error(
            "게시글을 더 이상 볼 수 없어요. 사진첩을 새로고침해주세요.",
          );
        result = change(record);
        store.put(record);
      } catch (error) {
        problem = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () =>
      reject(
        problem ??
          new Error("변경 내용을 저장하지 못했어요. 다시 시도해주세요."),
      );
    tx.onerror = () => reject(new Error("변경 내용을 저장하지 못했어요."));
  });
}
export async function setPhotoLike(
  post: PhotoPost,
  member: Member,
  liked: boolean,
) {
  if (!demoMode) {
    const result = await photoAction({ action: "like", id: post.id, liked });
    if (
      typeof result.likeCount !== "number" ||
      typeof result.liked !== "boolean"
    )
      throw new Error("좋아요를 확인하지 못했어요. 새로고침해주세요.");
    return { likeCount: result.likeCount, liked: result.liked };
  }
  return updateDemoPost(post.id, (record) => {
    const likes = new Set(record.likes ?? []);
    if (liked) likes.add(member.id);
    else likes.delete(member.id);
    record.likes = [...likes];
    return { likeCount: likes.size, liked };
  });
}
function demoComment(
  record: DemoPost,
  comment: PhotoComment,
  member: Member,
): PhotoComment {
  const replyCount =
    record.comments?.filter(
      (c) => c.parentId === comment.id && c.status === "active",
    ).length ?? 0;
  if (comment.status !== "active")
    return {
      ...comment,
      replyCount,
      body: "",
      authorHandle: "",
      likeCount: 0,
      liked: false,
    };
  const likes = record.commentLikes?.[comment.id] ?? [];
  return {
    ...comment,
    likeCount: likes.length,
    liked: likes.includes(member.id),
    replyCount,
  };
}
function demoCommentSummary(record: DemoPost, member: Member) {
  return {
    commentCount:
      record.comments?.filter((c) => c.status === "active").length ?? 0,
    commentPreview: recentComments(record.comments ?? []).map((c) =>
      demoComment(record, c, member),
    ),
  };
}
function commentPage(comments: PhotoComment[], cursor?: PhotoCursor) {
  const sorted = [...comments].sort(
    (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id),
  );
  const page = sorted
    .filter(
      (c) =>
        !cursor ||
        c.createdAt < cursor.createdAt ||
        (c.createdAt === cursor.createdAt && c.id < cursor.id),
    )
    .slice(0, COMMENT_PAGE_SIZE + 1);
  const last = page[Math.min(page.length, COMMENT_PAGE_SIZE) - 1];
  return {
    page: page.slice(0, COMMENT_PAGE_SIZE),
    cursor:
      page.length > COMMENT_PAGE_SIZE
        ? { id: last.id, createdAt: last.createdAt }
        : null,
  };
}
export async function listPhotoComments(
  post: PhotoPost,
  member: Member,
  cursor?: PhotoCursor,
): Promise<PhotoResponse> {
  if (!demoMode)
    return photoAction({
      action: "comments",
      id: post.id,
      ...(cursor ? { cursor } : {}),
    });
  const record = (await demoRead()).find(
    (p) => p.post.id === post.id && p.post.status === "published",
  );
  if (!record) throw new Error("게시글을 더 이상 볼 수 없어요.");
  const { page, cursor: next } = commentPage(
    (record.comments ?? []).filter(
      (c) => !c.parentId && ["active", "thread"].includes(c.status),
    ),
    cursor,
  );
  return {
    comments: page.map((c) => demoComment(record, c, member)),
    nextCommentCursor: next,
    ...demoCommentSummary(record, member),
  };
}
export async function listPhotoReplies(
  post: PhotoPost,
  member: Member,
  parentId: string,
  cursor?: PhotoCursor,
): Promise<PhotoResponse> {
  if (!demoMode)
    return photoAction({
      action: "replies",
      id: post.id,
      parentId,
      ...(cursor ? { cursor } : {}),
    });
  const record = (await demoRead()).find(
    (p) => p.post.id === post.id && p.post.status === "published",
  );
  const parent = record?.comments?.find(
    (c) => c.id === parentId && !c.parentId,
  );
  if (!record || !parent || !["active", "thread"].includes(parent.status))
    throw new Error("댓글을 더 이상 볼 수 없어요.");
  const { page, cursor: next } = commentPage(
    (record.comments ?? []).filter(
      (c) => c.parentId === parentId && c.status === "active",
    ),
    cursor,
  );
  return {
    parentComment: demoComment(record, parent, member),
    replies: page.map((c) => demoComment(record, c, member)),
    nextReplyCursor: next,
    ...demoCommentSummary(record, member),
  };
}
export async function setPhotoCommentLike(
  post: PhotoPost,
  member: Member,
  comment: PhotoComment,
  liked: boolean,
) {
  if (!demoMode) {
    const result = await photoAction({
      action: "likeComment",
      id: post.id,
      commentId: comment.id,
      ...(comment.parentId ? { parentId: comment.parentId } : {}),
      liked,
    });
    if (!result.comment) throw new Error("댓글 좋아요를 확인하지 못했어요.");
    return result.comment;
  }
  return updateDemoPost(post.id, (record) => {
    const current = record.comments?.find(
      (c) =>
        c.id === comment.id &&
        c.parentId === comment.parentId &&
        c.status === "active",
    );
    if (!current) throw new Error("댓글을 더 이상 볼 수 없어요.");
    record.commentLikes ??= {};
    const likes = new Set(record.commentLikes[current.id] ?? []);
    if (liked) likes.add(member.id);
    else likes.delete(member.id);
    record.commentLikes[current.id] = [...likes];
    return demoComment(record, current, member);
  });
}
export async function addPhotoComment(
  post: PhotoPost,
  member: Member,
  commentId: string,
  body: string,
  replyTo?: PhotoComment,
): Promise<PhotoResponse> {
  const parsed = commentBody.safeParse(body);
  if (!parsed.success) throw new Error("댓글은 1~500자로 입력해주세요.");
  const parentId = replyTo ? (replyTo.parentId ?? replyTo.id) : undefined,
    replyToId = replyTo?.id;
  if (!demoMode)
    return photoAction({
      action: "addComment",
      id: post.id,
      commentId,
      body: parsed.data,
      ...(parentId ? { parentId, replyToId } : {}),
    });
  const today = new Date().toISOString().slice(0, 10);
  const used = (await demoRead())
    .flatMap((p) => p.comments ?? [])
    .filter(
      (c) =>
        c.authorId === member.id &&
        new Date(c.createdAt).toISOString().slice(0, 10) === today,
    ).length;
  return updateDemoPost(post.id, (record) => {
    record.comments ??= [];
    const parent = parentId
      ? record.comments.find((c) => c.id === parentId && !c.parentId)
      : undefined;
    const existing = record.comments.find((c) => c.id === commentId);
    if (existing) {
      if (
        existing.authorId !== member.id ||
        existing.body !== parsed.data ||
        existing.status !== "active" ||
        existing.parentId !== parentId ||
        existing.replyToId !== replyToId
      )
        throw new Error("이미 처리된 댓글이에요. 다시 작성해주세요.");
      return {
        comment: demoComment(record, existing, member),
        ...(parent
          ? { parentComment: demoComment(record, parent, member) }
          : {}),
        ...demoCommentSummary(record, member),
      };
    }
    if (
      record.comments.filter((c) => c.status === "active").length >=
      COMMENTS_PER_POST
    )
      throw new Error("이 게시글의 댓글이 가득 찼어요.");
    if (used >= COMMENTS_PER_MEMBER_DAY)
      throw new Error("오늘 작성할 수 있는 댓글 수를 모두 사용했어요.");
    const target = replyToId
      ? record.comments.find((c) => c.id === replyToId && c.status === "active")
      : undefined;
    if (
      parentId &&
      (!parent ||
        !["active", "thread"].includes(parent.status) ||
        !target ||
        (target.id !== parent.id && target.parentId !== parent.id) ||
        commentId === parentId ||
        commentId === replyToId)
    )
      throw new Error("답글을 남길 댓글이 없어요.");
    const comment: PhotoComment = {
      id: commentId,
      authorId: member.id,
      authorHandle: member.handle,
      body: parsed.data,
      createdAt: Date.now(),
      status: "active",
      ...(parent
        ? {
            parentId: parent.id,
            replyToId: target!.id,
            replyToHandle: target!.authorHandle,
          }
        : {}),
    };
    record.comments.push(comment);
    return {
      comment: demoComment(record, comment, member),
      ...(parent ? { parentComment: demoComment(record, parent, member) } : {}),
      ...demoCommentSummary(record, member),
    };
  });
}
export async function removePhotoComment(
  post: PhotoPost,
  member: Member,
  comment: PhotoComment,
): Promise<PhotoResponse> {
  if (!demoMode)
    return photoAction({
      action: "deleteComment",
      id: post.id,
      commentId: comment.id,
      ...(comment.parentId ? { parentId: comment.parentId } : {}),
    });
  return updateDemoPost(post.id, (record) => {
    const current = record.comments?.find(
      (c) => c.id === comment.id && c.parentId === comment.parentId,
    );
    const parent = current?.parentId
      ? record.comments?.find((c) => c.id === current.parentId && !c.parentId)
      : undefined;
    if (current && current.status === "active") {
      if (current.authorId !== member.id && member.role === "member")
        throw new Error("본인이 작성한 댓글만 삭제할 수 있어요.");
      const children =
        record.comments?.filter(
          (c) => c.parentId === current.id && c.status === "active",
        ).length ?? 0;
      current.status = !current.parentId && children > 0 ? "thread" : "deleted";
      current.body = "";
      if (record.commentLikes) delete record.commentLikes[current.id];
      if (
        parent?.status === "thread" &&
        !record.comments?.some(
          (c) => c.parentId === parent.id && c.status === "active",
        )
      )
        parent.status = "deleted";
    }
    return {
      ...(current ? { comment: demoComment(record, current, member) } : {}),
      ...(parent ? { parentComment: demoComment(record, parent, member) } : {}),
      ...demoCommentSummary(record, member),
    };
  });
}

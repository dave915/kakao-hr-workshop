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
    .map((p) => p.post)
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

import { getApp } from "firebase-admin/app";
import { getFirestore, FieldPath } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import {
  photoActionInput,
  photoPath,
  uploadPhotoPath,
  photoMonth,
  checkPhotoQuota,
  PHOTO_DRAFT_LIFETIME,
  PHOTO_MAX_BYTES,
  THUMB_MAX_BYTES,
  PHOTO_PAGE_SIZE,
  PHOTO_MEMBER_MONTHLY_LIMIT,
  COMMENT_PAGE_SIZE,
  COMMENTS_PER_POST,
  COMMENTS_PER_MEMBER_DAY,
  type PhotoComment,
  type PhotoPost,
  type PhotoResponse,
} from "../../shared/photos";
import type { WorkshopState } from "../../shared/types";

const bucket = () =>
  getStorage().bucket(
    process.env.WORKSHOP_PHOTO_BUCKET ||
      `${getApp().options.projectId || process.env.GCLOUD_PROJECT}-photos`,
  );
const storedRef = () => getFirestore().doc("photoLimits/storage");
async function authorize(
  tx: FirebaseFirestore.Transaction,
  request: CallableRequest,
) {
  if (!request.auth)
    throw new HttpsError(
      "unauthenticated",
      "개인 입장 링크로 먼저 접속해주세요.",
    );
  const db = getFirestore();
  const profileRef = db.doc(`members/${request.auth.uid}`);
  const [profile, stateDoc] = await Promise.all([
    tx.get(profileRef),
    tx.get(db.doc("workshops/main")),
  ]);
  const state = stateDoc.data() as WorkshopState | undefined;
  const me = state?.members[request.auth.uid];
  if (
    !profile.exists ||
    profile.data()?.sessionVersion !== request.auth.token.sessionVersion ||
    !me
  )
    throw new HttpsError(
      "unauthenticated",
      "새 입장 링크로 다시 입장해주세요.",
    );
  return { me, generation: state!.resetGeneration ?? 0, profile, profileRef };
}
function writable(post: PhotoPost | undefined, uid: string, admin: boolean) {
  if (!post) throw new HttpsError("not-found", "게시글을 찾을 수 없어요.");
  if (post.authorId !== uid && !admin)
    throw new HttpsError(
      "permission-denied",
      "본인이 올린 글만 변경할 수 있어요.",
    );
  return post;
}
async function erasePost(id: string) {
  const db = getFirestore(),
    ref = db.doc(`photoPosts/${id}`);
  const post = (await ref.get()).data() as PhotoPost | undefined;
  if (!post || post.status !== "deleting") return;
  for (const prefix of ["photos", "photo-uploads"])
    await bucket().deleteFiles({
      prefix: `${prefix}/${post.generation}/${post.authorId}/${post.id}/`,
      force: true,
    });
  // The deleting status blocks new interactions while their documents are removed.
  await Promise.all([
    db.recursiveDelete(ref.collection("likes")),
    db.recursiveDelete(ref.collection("comments")),
  ]);
  await db.runTransaction(async (tx) => {
    const [latest, stored] = await Promise.all([
      tx.get(ref),
      tx.get(storedRef()),
    ]);
    const data = latest.data() as PhotoPost | undefined;
    if (!data || data.status !== "deleting") return;
    tx.set(storedRef(), {
      count: Math.max(0, (stored.data()?.count ?? 0) - data.photos.length),
    });
    tx.set(ref, {
      ...data,
      status: "deleted",
      caption: "",
      photos: [],
      likeCount: 0,
      commentCount: 0,
      updatedAt: Date.now(),
    });
  });
}
export async function handlePhotoBoard(
  request: CallableRequest,
): Promise<PhotoResponse> {
  const parsed = photoActionInput.safeParse(request.data);
  if (!parsed.success)
    throw new HttpsError(
      "invalid-argument",
      request.data?.action === "addComment"
        ? "댓글은 1~500자로 입력해주세요."
        : "요청 내용을 확인해주세요.",
    );
  const input = parsed.data,
    db = getFirestore(),
    now = Date.now();
  if (input.action === "list") {
    return db.runTransaction(async (tx) => {
      const auth = await authorize(tx, request);
      const monthRef = db.doc(`photoLimits/${photoMonth(now)}_${auth.me.id}`);
      let query = db
        .collection("photoPosts")
        .where("generation", "==", auth.generation)
        .where("status", "==", "published")
        .orderBy("createdAt", "desc")
        .orderBy(FieldPath.documentId(), "desc")
        .limit(PHOTO_PAGE_SIZE + 1);
      if (input.cursor)
        query = query.startAfter(input.cursor.createdAt, input.cursor.id);
      const [posts, personal] = await Promise.all([
        tx.get(query),
        tx.get(monthRef),
      ]);
      const page = posts.docs
        .slice(0, PHOTO_PAGE_SIZE)
        .map((doc) => doc.data() as PhotoPost);
      const likes = await Promise.all(
        page.map((post) =>
          tx.get(db.doc(`photoPosts/${post.id}/likes/${auth.me.id}`)),
        ),
      );
      // All reads must precede this profile update.
      if (auth.profile.data()?.photoGeneration !== auth.generation)
        tx.update(auth.profileRef, { photoGeneration: auth.generation });
      const last = page.at(-1);
      return {
        posts: page.map((post, index) => ({
          ...post,
          likeCount: post.likeCount ?? 0,
          commentCount: post.commentCount ?? 0,
          liked: likes[index].exists,
        })),
        nextCursor:
          posts.size > PHOTO_PAGE_SIZE && last
            ? { id: last.id, createdAt: last.createdAt }
            : null,
        remaining: Math.max(
          0,
          PHOTO_MEMBER_MONTHLY_LIMIT - (personal.data()?.count ?? 0),
        ),
      };
    });
  }
  const ref = db.doc(`photoPosts/${input.id}`);
  if (
    ["like", "comments", "addComment", "deleteComment"].includes(input.action)
  ) {
    return db.runTransaction(async (tx) => {
      const auth = await authorize(tx, request);
      const post = (await tx.get(ref)).data() as PhotoPost | undefined;
      if (
        !post ||
        post.status !== "published" ||
        post.generation !== auth.generation
      )
        throw new HttpsError(
          "not-found",
          "게시글이 삭제되었거나 더 이상 볼 수 없어요. 사진첩을 새로고침해주세요.",
        );
      if (input.action === "like") {
        const likeRef = ref.collection("likes").doc(auth.me.id);
        const existing = await tx.get(likeRef);
        const count = post.likeCount ?? 0;
        if (existing.exists === input.liked)
          return { liked: input.liked, likeCount: count };
        const likeCount = Math.max(0, count + (input.liked ? 1 : -1));
        if (input.liked) tx.create(likeRef, { createdAt: now });
        else tx.delete(likeRef);
        tx.update(ref, { likeCount });
        return { liked: input.liked, likeCount };
      }
      if (input.action === "comments") {
        let query = ref
          .collection("comments")
          .where("status", "==", "active")
          .orderBy("createdAt", "desc")
          .orderBy(FieldPath.documentId(), "desc")
          .limit(COMMENT_PAGE_SIZE + 1);
        if (input.cursor)
          query = query.startAfter(input.cursor.createdAt, input.cursor.id);
        const snapshot = await tx.get(query);
        const comments = snapshot.docs
          .slice(0, COMMENT_PAGE_SIZE)
          .map((doc) => doc.data() as PhotoComment);
        const last = comments.at(-1);
        return {
          comments,
          commentCount: post.commentCount ?? 0,
          nextCommentCursor:
            snapshot.size > COMMENT_PAGE_SIZE && last
              ? { id: last.id, createdAt: last.createdAt }
              : null,
        };
      }
      if (input.action === "addComment") {
        const commentRef = ref.collection("comments").doc(input.commentId);
        const day = new Date(now).toISOString().slice(0, 10);
        const limitRef = db.doc(`photoCommentLimits/${day}_${auth.me.id}`);
        const [existing, limit] = await Promise.all([
          tx.get(commentRef),
          tx.get(limitRef),
        ]);
        if (existing.exists) {
          const comment = existing.data() as PhotoComment;
          if (
            comment.authorId !== auth.me.id ||
            comment.body !== input.body ||
            comment.status !== "active"
          )
            throw new HttpsError(
              "already-exists",
              "이미 처리된 댓글이에요. 내용을 확인한 뒤 다시 작성해주세요.",
            );
          return { comment, commentCount: post.commentCount ?? 0 };
        }
        if ((post.commentCount ?? 0) >= COMMENTS_PER_POST)
          throw new HttpsError(
            "resource-exhausted",
            "이 게시글의 댓글이 가득 찼어요.",
          );
        if ((limit.data()?.count ?? 0) >= COMMENTS_PER_MEMBER_DAY)
          throw new HttpsError(
            "resource-exhausted",
            "오늘 작성할 수 있는 댓글 수를 모두 사용했어요. 내일 다시 남겨주세요.",
          );
        const comment: PhotoComment = {
          id: input.commentId,
          authorId: auth.me.id,
          authorHandle: auth.me.handle,
          body: input.body,
          createdAt: now,
          status: "active",
        };
        const commentCount = (post.commentCount ?? 0) + 1;
        tx.create(commentRef, comment);
        tx.set(limitRef, { count: (limit.data()?.count ?? 0) + 1, day });
        tx.update(ref, { commentCount });
        return { comment, commentCount };
      }
      if (input.action === "deleteComment") {
        const commentRef = ref.collection("comments").doc(input.commentId);
        const existing = await tx.get(commentRef);
        if (!existing.exists) return { commentCount: post.commentCount ?? 0 };
        const comment = existing.data() as PhotoComment;
        if (comment.authorId !== auth.me.id && auth.me.role === "member")
          throw new HttpsError(
            "permission-denied",
            "본인이 작성한 댓글만 삭제할 수 있어요.",
          );
        if (comment.status === "deleted")
          return { commentCount: post.commentCount ?? 0 };
        const commentCount = Math.max(0, (post.commentCount ?? 0) - 1);
        // A small tombstone makes retries safe and prevents a deleted comment from reappearing.
        tx.update(commentRef, { body: "", status: "deleted" });
        tx.update(ref, { commentCount });
        return { commentCount };
      }
      throw new HttpsError("invalid-argument", "요청 내용을 확인해주세요.");
    });
  }
  if (input.action === "image") {
    const post = await db.runTransaction(async (tx) => {
      const auth = await authorize(tx, request);
      const post = (await tx.get(ref)).data() as PhotoPost | undefined;
      if (
        !post ||
        post.status !== "published" ||
        post.generation !== auth.generation ||
        !post.photos[input.index]
      )
        throw new HttpsError(
          "not-found",
          "사진을 찾을 수 없어요. 사진첩을 새로고침해주세요.",
        );
      return post;
    });
    const path = photoPath(post, input.index, input.size);
    // The emulator's GCS endpoint is local and does not implement URL signing.
    if (process.env.FIREBASE_STORAGE_EMULATOR_HOST)
      return {
        url: `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/download/storage/v1/b/${bucket().name}/o/${encodeURIComponent(path)}?alt=media`,
      };
    const [url] = await bucket()
      .file(path)
      .getSignedUrl({
        version: "v4",
        action: "read",
        expires: now + 5 * 60 * 1000,
      });
    return { url };
  }
  if (input.action === "begin") {
    let resume = false;
    const post = await db.runTransaction(async (tx) => {
      const auth = await authorize(tx, request);
      const [existing, monthly, personal, stored] = await Promise.all([
        tx.get(ref),
        tx.get(db.doc(`photoLimits/${photoMonth(now)}`)),
        tx.get(db.doc(`photoLimits/${photoMonth(now)}_${auth.me.id}`)),
        tx.get(storedRef()),
      ]);
      if (existing.exists) {
        resume = true;
        const data = writable(existing.data() as PhotoPost, auth.me.id, false);
        if (
          data.generation !== auth.generation ||
          data.caption !== input.caption ||
          JSON.stringify(data.photos) !== JSON.stringify(input.photos) ||
          ["deleted", "deleting"].includes(data.status)
        )
          throw new HttpsError(
            "already-exists",
            "사진을 다시 선택해서 올려주세요.",
          );
        if (data.status === "draft" && data.expiresAt < now)
          throw new HttpsError(
            "failed-precondition",
            "업로드 시간이 지났어요. 사진을 다시 선택해주세요.",
          );
        return data;
      }
      const message = checkPhotoQuota(
        input.photos.length,
        monthly.data()?.count ?? 0,
        personal.data()?.count ?? 0,
        stored.data()?.count ?? 0,
      );
      if (message) throw new HttpsError("resource-exhausted", message);
      const data: PhotoPost = {
        id: input.id,
        authorId: auth.me.id,
        authorHandle: auth.me.handle,
        generation: auth.generation,
        caption: input.caption,
        photos: input.photos,
        createdAt: now,
        updatedAt: now,
        expiresAt: now + PHOTO_DRAFT_LIFETIME,
        status: "draft",
      };
      tx.create(ref, data);
      for (const counter of [monthly, personal, stored])
        tx.set(counter.ref, {
          count: (counter.data()?.count ?? 0) + input.photos.length,
        });
      tx.update(auth.profileRef, { photoGeneration: auth.generation });
      return data;
    });
    const [files] =
      resume && post.status === "draft"
        ? await bucket().getFiles({
            prefix: `photo-uploads/${post.generation}/${post.authorId}/${post.id}/`,
          })
        : [[]];
    return { post, uploaded: files.map((file) => file.name) };
  }
  if (input.action === "delete") {
    await db.runTransaction(async (tx) => {
      const auth = await authorize(tx, request);
      const post = writable(
        (await tx.get(ref)).data() as PhotoPost | undefined,
        auth.me.id,
        auth.me.role !== "member",
      );
      if (post.status === "publishing")
        throw new HttpsError(
          "failed-precondition",
          "사진 게시 중이에요. 잠시 후 다시 삭제해주세요.",
        );
      if (post.status !== "deleted")
        tx.update(ref, { status: "deleting", updatedAt: now });
    });
    await erasePost(input.id);
    return {};
  }
  const post = await db.runTransaction(async (tx) => {
    const auth = await authorize(tx, request);
    const data = writable(
      (await tx.get(ref)).data() as PhotoPost | undefined,
      auth.me.id,
      false,
    );
    if (data.generation !== auth.generation)
      throw new HttpsError(
        "failed-precondition",
        "워크샵이 초기화되었어요. 새로고침해주세요.",
      );
    if (data.status === "published") return data;
    if (!["draft", "publishing"].includes(data.status) || data.expiresAt < now)
      throw new HttpsError(
        "failed-precondition",
        "업로드 시간이 지났어요. 사진을 다시 선택해주세요.",
      );
    tx.update(ref, { status: "publishing", updatedAt: now });
    return data;
  });
  if (post.status === "published") return { post };
  try {
    for (let index = 0; index < post.photos.length; index++) {
      for (const size of ["full", "thumb"] as const) {
        const source = bucket().file(uploadPhotoPath(post, index, size));
        const destination = bucket().file(photoPath(post, index, size));
        const [hasUpload] = await source.exists();
        const file = hasUpload ? source : destination;
        const [metadata] = await file.getMetadata();
        const limit = size === "full" ? PHOTO_MAX_BYTES : THUMB_MAX_BYTES;
        if (
          metadata.contentType !== "image/jpeg" ||
          Number(metadata.size) <= 0 ||
          Number(metadata.size) > limit
        )
          throw new HttpsError(
            "invalid-argument",
            "사진 크기 또는 형식을 확인해주세요.",
          );
        const [header] = await file.download({ start: 0, end: 2 });
        if (header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff)
          throw new HttpsError(
            "invalid-argument",
            "올바른 사진 파일을 선택해주세요.",
          );
        // Publish to a separate private object without Firebase download tokens.
        // Reads use short-lived signed GCS URLs; Firebase object reads are denied.
        if (hasUpload)
          await source.copy(destination, {
            metadata: { firebaseStorageDownloadTokens: null },
            contentType: "image/jpeg",
            cacheControl: "private,max-age=300",
          });
      }
    }
    await bucket().deleteFiles({
      prefix: `photo-uploads/${post.generation}/${post.authorId}/${post.id}/`,
      force: true,
    });
    return await db.runTransaction(async (tx) => {
      const auth = await authorize(tx, request);
      const current = (await tx.get(ref)).data() as PhotoPost;
      if (
        !current ||
        current.generation !== auth.generation ||
        !["publishing", "published"].includes(current.status)
      )
        throw new HttpsError(
          "failed-precondition",
          "게시글 상태가 바뀌었어요. 새로고침해주세요.",
        );
      const published = {
        ...current,
        status: "published" as const,
        updatedAt: Date.now(),
      };
      tx.set(ref, published);
      return { post: published };
    });
  } catch (error) {
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data() as PhotoPost | undefined;
      if (current?.status === "publishing")
        tx.update(ref, { status: "draft", updatedAt: Date.now() });
    });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      "failed-precondition",
      "사진 업로드를 확인하지 못했어요. 잠시 후 다시 게시해주세요.",
    );
  }
}
export async function cleanupPhotos() {
  const db = getFirestore(),
    now = Date.now();
  const generation = ((await db.doc("workshops/main").get()).data()
    ?.resetGeneration ?? 0) as number;
  const expiredLimits = await db
    .collection("photoCommentLimits")
    .where("day", "<", new Date(now - 30 * 86400000).toISOString().slice(0, 10))
    .limit(500)
    .get();
  if (!expiredLimits.empty) {
    const batch = db.batch();
    for (const doc of expiredLimits.docs) batch.delete(doc.ref);
    await batch.commit();
  }
  const [incomplete, deleting, old] = await Promise.all([
    db
      .collection("photoPosts")
      .where("status", "in", ["draft", "publishing"])
      .where("updatedAt", "<", now - 86400000)
      .orderBy("updatedAt")
      .limit(200)
      .get(),
    db
      .collection("photoPosts")
      .where("status", "==", "deleting")
      .limit(200)
      .get(),
    db
      .collection("photoPosts")
      .where("generation", "<", generation)
      .where("status", "==", "published")
      .limit(200)
      .get(),
  ]);
  for (const doc of [...incomplete.docs, ...deleting.docs, ...old.docs]) {
    const post = doc.data() as PhotoPost;
    if (
      post.status !== "deleting" &&
      post.generation === generation &&
      post.updatedAt > now - 86400000
    )
      continue;
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(doc.ref)).data() as PhotoPost;
      if (
        current &&
        current.status !== "deleted" &&
        (current.generation < generation ||
          current.status === "deleting" ||
          (["draft", "publishing"].includes(current.status) &&
            current.updatedAt < now - 86400000))
      )
        tx.update(doc.ref, { status: "deleting" });
    });
    await erasePost(doc.id);
  }
}

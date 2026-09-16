import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { initializeApp as clientApp, deleteApp } from "firebase/app";
import {
  getStorage,
  connectStorageEmulator,
  ref,
  uploadBytes,
  getBytes,
  getMetadata,
  getDownloadURL,
  deleteObject,
  listAll,
  type FirebaseStorage,
} from "firebase/storage";
import { makeSeed, demoSecrets } from "../shared/seed";
import {
  photoPath,
  uploadPhotoPath,
  photoMonth,
  PHOTO_MONTHLY_LIMIT,
  COMMENTS_PER_POST,
  COMMENTS_PER_MEMBER_DAY,
  type PhotoPost,
} from "../shared/photos";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const enabled = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.FIREBASE_AUTH_EMULATOR_HOST &&
  process.env.FIREBASE_STORAGE_EMULATOR_HOST,
);
const root = "http://127.0.0.1:5387/demo-workshop/asia-northeast3";
const jpeg = new Uint8Array([255, 216, 255, 224, 0, 2, 255, 217]);
async function call(
  input: unknown,
  token?: string,
  endpoint = "photoBoardAction",
) {
  const result = await fetch(`${root}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ data: input }),
  });
  return { status: result.status, ...(await result.json()) };
}
describe.skipIf(!enabled)("private photo board and Storage rules", () => {
  let db: any, bucket: any, cleanup: () => Promise<void>;
  const tokens: Record<string, string> = {},
    clients: Record<string, FirebaseStorage> = {};
  beforeAll(async () => {
    require("firebase-admin/app").initializeApp({ projectId: "demo-workshop" });
    db = require("firebase-admin/firestore").getFirestore();
    bucket = require("firebase-admin/storage")
      .getStorage()
      .bucket("demo-workshop-photos");
    cleanup = require("./lib/functions/src/photos.js").cleanupPhotos;
    for (const uid of ["alex.k", "june.p", "dave.h"]) {
      const custom = await require("firebase-admin/auth")
        .getAuth()
        .createCustomToken(uid, { sessionVersion: 1 });
      const result = await fetch(
        `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: custom, returnSecureToken: true }),
        },
      );
      tokens[uid] = (await result.json()).idToken;
      const app = clientApp(
        {
          projectId: "demo-workshop",
          apiKey: "fake",
          storageBucket: "demo-workshop-photos",
        },
        `photos-${uid}`,
      );
      clients[uid] = getStorage(app);
      connectStorageEmulator(clients[uid], "127.0.0.1", 9487, {
        mockUserToken: tokens[uid],
      });
    }
    const anonymous = clientApp(
      {
        projectId: "demo-workshop",
        apiKey: "fake",
        storageBucket: "demo-workshop-photos",
      },
      "photos-anonymous",
    );
    clients.anonymous = getStorage(anonymous);
    connectStorageEmulator(clients.anonymous, "127.0.0.1", 9487);
  }, 30000);
  beforeEach(async () => {
    await Promise.all([
      db.recursiveDelete(db.collection("photoPosts")),
      db.recursiveDelete(db.collection("photoLimits")),
      db.recursiveDelete(db.collection("photoCommentLimits")),
      bucket.deleteFiles({ force: true }),
    ]);
    const state = makeSeed(true),
      batch = db.batch();
    batch.set(db.doc("workshops/main"), state);
    batch.set(db.doc("private/treasures"), { kinds: demoSecrets });
    for (const member of Object.values(state.members))
      batch.set(db.doc(`members/${member.id}`), {
        role: member.role,
        sessionVersion: 1,
        photoGeneration: 0,
      });
    await batch.commit();
  }, 15000);
  afterAll(async () => {
    await Promise.all(Object.values(clients).map((s) => deleteApp(s.app)));
  });
  async function begin(uid = "alex.k", count = 1, id = randomUUID()) {
    const response = await call(
      {
        action: "begin",
        id,
        caption: "함께한 순간",
        photos: Array.from({ length: count }, () => ({
          width: 100,
          height: 80,
        })),
      },
      tokens[uid],
    );
    expect(response.status, JSON.stringify(response)).toBe(200);
    return response.result.post as PhotoPost;
  }
  async function upload(post: PhotoPost) {
    for (let i = 0; i < post.photos.length; i++)
      for (const size of ["full", "thumb"] as const)
        await uploadBytes(
          ref(clients[post.authorId], uploadPhotoPath(post, i, size)),
          jpeg,
          { contentType: "image/jpeg" },
        );
  }
  it("requires current membership for listing and beginning posts", async () => {
    expect((await call({ action: "list" })).status).toBe(401);
    await db.doc("members/alex.k").update({ sessionVersion: 2 });
    expect((await call({ action: "list" }, tokens["alex.k"])).status).toBe(401);
    expect(
      (
        await call(
          {
            action: "begin",
            id: randomUUID(),
            caption: "",
            photos: [{ width: 1, height: 1 }],
          },
          tokens["alex.k"],
        )
      ).status,
    ).toBe(401);
  });
  it("only accepts the reserved owner's JPEG slots, validates size, and prevents overwrite and listing", async () => {
    const post = await begin();
    const path = uploadPhotoPath(post, 0, "full");
    await expect(
      uploadBytes(ref(clients["june.p"], path), jpeg, {
        contentType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ code: "storage/unauthorized" });
    await expect(
      uploadBytes(ref(clients.anonymous, path), jpeg, {
        contentType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ code: "storage/unauthorized" });
    await expect(
      uploadBytes(ref(clients["alex.k"], path), jpeg, {
        contentType: "text/html",
      }),
    ).rejects.toMatchObject({ code: "storage/unauthorized" });
    await expect(
      uploadBytes(ref(clients["alex.k"], path), new Uint8Array(512001), {
        contentType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ code: "storage/unauthorized" });
    await expect(
      uploadBytes(
        ref(clients["alex.k"], uploadPhotoPath(post, 0, "thumb")),
        new Uint8Array(51201),
        { contentType: "image/jpeg" },
      ),
    ).rejects.toMatchObject({ code: "storage/unauthorized" });
    await expect(
      uploadBytes(
        ref(clients["alex.k"], uploadPhotoPath(post, 1, "full")),
        jpeg,
        {
          contentType: "image/jpeg",
        },
      ),
    ).rejects.toMatchObject({ code: "storage/unauthorized" });
    await uploadBytes(ref(clients["alex.k"], path), jpeg, {
      contentType: "image/jpeg",
    });
    await expect(
      uploadBytes(ref(clients["alex.k"], path), jpeg, {
        contentType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ code: "storage/unauthorized" });
    await expect(
      listAll(ref(clients["alex.k"], "photos")),
    ).rejects.toMatchObject({ code: "storage/unauthorized" });
    await expect(getBytes(ref(clients["june.p"], path))).rejects.toMatchObject({
      code: "storage/unauthorized",
    });
  }, 30000);
  it("publishes only complete uploads, removes public tokens and lets current members read", async () => {
    const post = await begin("alex.k", 2);
    expect(
      (await call({ action: "publish", id: post.id }, tokens["alex.k"])).status,
    ).not.toBe(200);
    await upload(post);
    const response = await call(
      { action: "publish", id: post.id },
      tokens["alex.k"],
    );
    expect(response.status, JSON.stringify(response)).toBe(200);
    const image = ref(clients["june.p"], photoPath(post, 0, "full"));
    const access = await call(
      { action: "image", id: post.id, index: 0, size: "full" },
      tokens["june.p"],
    );
    expect(access.status, JSON.stringify(access)).toBe(200);
    expect(
      new Uint8Array(await (await fetch(access.result.url)).arrayBuffer()),
    ).toEqual(jpeg);
    const [metadata] = await bucket
      .file(photoPath(post, 0, "full"))
      .getMetadata();
    expect(metadata.metadata?.firebaseStorageDownloadTokens).toBeFalsy();
    await expect(getBytes(image)).rejects.toMatchObject({
      code: "storage/unauthorized",
    });
    expect(
      (await call({ action: "image", id: post.id, index: 0, size: "full" }))
        .status,
    ).toBe(401);
    await expect(getDownloadURL(image)).rejects.toBeDefined();
    expect(
      (await call({ action: "list" }, tokens["june.p"])).result.posts.map(
        (p: PhotoPost) => p.id,
      ),
    ).toEqual([post.id]);
    await expect(
      getBytes(ref(clients.anonymous, uploadPhotoPath(post, 0, "full"))),
    ).rejects.toMatchObject({ code: "storage/unauthorized" });
    expect(
      (await call({ action: "publish", id: post.id }, tokens["alex.k"])).status,
    ).toBe(200);
  }, 30000);
  it("does not publish a non-image even when its content-type says JPEG", async () => {
    const post = await begin();
    for (const size of ["full", "thumb"] as const)
      await uploadBytes(
        ref(clients["alex.k"], uploadPhotoPath(post, 0, size)),
        new TextEncoder().encode("not an image"),
        { contentType: "image/jpeg" },
      );
    expect(
      (await call({ action: "publish", id: post.id }, tokens["alex.k"])).status,
    ).toBe(400);
    expect(
      (await call({ action: "list" }, tokens["alex.k"])).result.posts,
    ).toEqual([]);
  });
  it("makes reservations idempotent and serializes the last monthly upload slot", async () => {
    const post = await begin();
    await begin("alex.k", 1, post.id);
    const month = db.doc(`photoLimits/${photoMonth(Date.now())}`);
    expect((await month.get()).data().count).toBe(1);
    await month.set({ count: PHOTO_MONTHLY_LIMIT - 1 });
    const results = await Promise.all(
      ["alex.k", "june.p"].map((uid) =>
        call(
          {
            action: "begin",
            id: randomUUID(),
            caption: "",
            photos: [{ width: 10, height: 10 }],
          },
          tokens[uid],
        ),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 429]);
    expect((await month.get()).data().count).toBe(PHOTO_MONTHLY_LIMIT);
  });
  it("deletes files and releases storage only once, while preserving monthly usage limits", async () => {
    const post = await begin();
    await upload(post);
    await call({ action: "publish", id: post.id }, tokens["alex.k"]);
    expect(
      (await call({ action: "delete", id: post.id }, tokens["june.p"])).status,
    ).toBe(403);
    await expect(
      deleteObject(ref(clients["alex.k"], uploadPhotoPath(post, 0, "full"))),
    ).rejects.toMatchObject({ code: "storage/unauthorized" });
    for (let i = 0; i < 2; i++)
      expect(
        (await call({ action: "delete", id: post.id }, tokens["dave.h"]))
          .status,
      ).toBe(200);
    expect((await bucket.getFiles())[0]).toHaveLength(0);
    expect((await db.doc("photoLimits/storage").get()).data().count).toBe(0);
    expect(
      (await db.doc(`photoLimits/${photoMonth(Date.now())}`).get()).data()
        .count,
    ).toBe(1);
    expect(
      (await call({ action: "list" }, tokens["alex.k"])).result.posts,
    ).toEqual([]);
  }, 30000);
  it("revokes photo access when a member is removed or a workshop is reset, then cleans old files", async () => {
    const post = await begin("dave.h");
    await upload(post);
    await call({ action: "publish", id: post.id }, tokens["dave.h"]);
    await db.doc("members/june.p").delete();
    await expect(
      getBytes(ref(clients["june.p"], uploadPhotoPath(post, 0, "full"))),
    ).rejects.toMatchObject({ code: "storage/unauthorized" });
    const reset = await call(
      { action: "resetWorkshop", confirmation: "전체 초기화" },
      tokens["dave.h"],
      "workshopAction",
    );
    expect(reset.status, JSON.stringify(reset)).toBe(200);
    await expect(
      getBytes(ref(clients["dave.h"], uploadPhotoPath(post, 0, "full"))),
    ).rejects.toMatchObject({ code: "storage/unauthorized" });
    expect(
      (await call({ action: "list" }, tokens["dave.h"])).result.posts,
    ).toEqual([]);
    expect(
      (
        await call(
          { action: "image", id: post.id, index: 0, size: "full" },
          tokens["dave.h"],
        )
      ).status,
    ).toBe(404);
    await cleanup();
    expect((await bucket.getFiles())[0]).toHaveLength(0);
  }, 30000);
  it("pages published posts without duplicates and ignores drafts", async () => {
    const batch = db.batch();
    const ids = Array.from({ length: 22 }, () => randomUUID())
      .sort()
      .reverse();
    for (const id of ids)
      batch.set(db.doc(`photoPosts/${id}`), {
        id,
        authorId: "alex.k",
        authorHandle: "alex.k",
        generation: 0,
        caption: "",
        photos: [{ width: 1, height: 1 }],
        createdAt: 100,
        status: "published",
        updatedAt: 100,
        expiresAt: 100,
      });
    await batch.commit();
    await begin();
    const first = (await call({ action: "list" }, tokens["alex.k"])).result;
    const second = (
      await call({ action: "list", cursor: first.nextCursor }, tokens["alex.k"])
    ).result;
    expect(first.posts).toHaveLength(18);
    expect(second.posts).toHaveLength(4);
    expect(second.nextCursor).toBeNull();
    expect(
      [...first.posts, ...second.posts].map((p: PhotoPost) => p.id),
    ).toEqual(ids);
  });
  it("cleans abandoned uploads without removing a recent draft", async () => {
    const stale = await begin(),
      recent = await begin();
    await upload(stale);
    await db
      .doc(`photoPosts/${stale.id}`)
      .update({ updatedAt: Date.now() - 86400001 });
    await cleanup();
    expect((await bucket.getFiles())[0]).toHaveLength(0);
    expect((await db.doc(`photoPosts/${recent.id}`).get()).data().status).toBe(
      "draft",
    );
    expect((await db.doc("photoLimits/storage").get()).data().count).toBe(1);
  });
  async function published() {
    const post = await begin();
    await db.doc(`photoPosts/${post.id}`).update({ status: "published" });
    return { ...post, status: "published" as const };
  }
  it("counts each member's like once under retries and concurrent requests and reports the viewer's state", async () => {
    const post = await published();
    const like = (uid: string, liked: boolean) =>
      call({ action: "like", id: post.id, liked }, tokens[uid]);
    const repeated = await Promise.all([
      like("alex.k", true),
      like("alex.k", true),
      like("june.p", true),
    ]);
    expect(repeated.every((r) => r.status === 200)).toBe(true);
    expect((await db.doc(`photoPosts/${post.id}`).get()).data().likeCount).toBe(
      2,
    );
    expect((await like("alex.k", true)).result).toMatchObject({
      liked: true,
      likeCount: 2,
    });
    for (const [uid, liked] of [
      ["alex.k", true],
      ["june.p", true],
      ["dave.h", false],
    ] as const) {
      const response = await call({ action: "list" }, tokens[uid]);
      expect(
        response.result.posts.find((p: PhotoPost) => p.id === post.id),
      ).toMatchObject({ liked, likeCount: 2 });
    }
    await like("alex.k", false);
    await like("alex.k", false);
    expect((await db.doc(`photoPosts/${post.id}`).get()).data().likeCount).toBe(
      1,
    );
    expect(
      (await db.collection(`photoPosts/${post.id}/likes`).get()).size,
    ).toBe(1);
  });
  it("creates comments exactly once and rejects reused IDs with a different author or content", async () => {
    const post = await published(),
      commentId = randomUUID();
    const input = {
      action: "addComment",
      id: post.id,
      commentId,
      body: "  오늘 즐거웠어요 🌳  ",
    };
    const responses = await Promise.all([
      call(input, tokens["alex.k"]),
      call(input, tokens["alex.k"]),
    ]);
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(responses[0].result.comment).toMatchObject({
      id: commentId,
      authorId: "alex.k",
      body: "오늘 즐거웠어요 🌳",
      status: "active",
    });
    expect(
      (await db.doc(`photoPosts/${post.id}`).get()).data().commentCount,
    ).toBe(1);
    expect(
      (await call({ ...input, body: "다른 댓글" }, tokens["alex.k"])).status,
    ).toBe(409);
    expect((await call(input, tokens["june.p"])).status).toBe(409);
    expect(
      (
        await call(
          { ...input, commentId: randomUUID(), body: "  " },
          tokens["alex.k"],
        )
      ).status,
    ).toBe(400);
    const list = await call(
      { action: "comments", id: post.id },
      tokens["june.p"],
    );
    expect(list.result.commentCount).toBe(1);
    expect(list.result.comments).toHaveLength(1);
  }, 30000);
  it("allows only the comment's author or an administrator to delete, without double-decrement or resurrection", async () => {
    const post = await published(),
      commentId = randomUUID();
    const input = {
      action: "addComment",
      id: post.id,
      commentId,
      body: "함께해서 좋았어요",
    };
    await call(input, tokens["june.p"]);
    const remove = { action: "deleteComment", id: post.id, commentId };
    expect((await call(remove, tokens["alex.k"])).status).toBe(403);
    expect((await call(remove, tokens["june.p"])).status).toBe(200);
    expect((await call(remove, tokens["june.p"])).result.commentCount).toBe(0);
    expect((await call(input, tokens["june.p"])).status).toBe(409);
    const ownId = randomUUID();
    await call({ ...input, commentId: ownId }, tokens["alex.k"]);
    expect(
      (await call({ ...remove, commentId: ownId }, tokens["dave.h"])).status,
    ).toBe(200);
    const list = await call(
      { action: "comments", id: post.id },
      tokens["alex.k"],
    );
    expect(list.result.comments).toEqual([]);
    expect(list.result.commentCount).toBe(0);
    expect(
      (await db.doc(`photoPosts/${post.id}/comments/${commentId}`).get()).data()
        .body,
    ).toBe("");
  });
  it("protects likes and comments against anonymous, revoked, unpublished, deleted and reset access", async () => {
    const post = await published();
    const requests = [
      { action: "like", id: post.id, liked: true },
      { action: "comments", id: post.id },
      {
        action: "addComment",
        id: post.id,
        commentId: randomUUID(),
        body: "테스트",
      },
      { action: "deleteComment", id: post.id, commentId: randomUUID() },
    ];
    for (const input of requests) expect((await call(input)).status).toBe(401);
    await db.doc("members/alex.k").update({ sessionVersion: 2 });
    for (const input of requests)
      expect((await call(input, tokens["alex.k"])).status).toBe(401);
    await db.doc("members/alex.k").update({ sessionVersion: 1 });
    for (const status of ["draft", "deleting", "deleted"]) {
      await db.doc(`photoPosts/${post.id}`).update({ status });
      for (const input of requests)
        expect((await call(input, tokens["alex.k"])).status).toBe(404);
    }
    await db.doc(`photoPosts/${post.id}`).update({ status: "published" });
    await db.doc("workshops/main").update({ resetGeneration: 1 });
    for (const input of requests)
      expect((await call(input, tokens["alex.k"])).status).toBe(404);
  }, 30000);
  it("paginates comments at equal timestamps without duplicates or exposing deleted text", async () => {
    const post = await published(),
      batch = db.batch(),
      ids = Array.from({ length: 23 }, () => randomUUID())
        .sort()
        .reverse();
    for (const id of ids)
      batch.set(db.doc(`photoPosts/${post.id}/comments/${id}`), {
        id,
        authorId: "alex.k",
        authorHandle: "alex.k",
        body: "댓글",
        createdAt: 100,
        status: "active",
      });
    batch.set(db.doc(`photoPosts/${post.id}/comments/${randomUUID()}`), {
      body: "삭제된 비공개 내용",
      status: "deleted",
      createdAt: 200,
    });
    batch.update(db.doc(`photoPosts/${post.id}`), { commentCount: 23 });
    await batch.commit();
    const first = (
      await call({ action: "comments", id: post.id }, tokens["alex.k"])
    ).result;
    const second = (
      await call(
        { action: "comments", id: post.id, cursor: first.nextCommentCursor },
        tokens["alex.k"],
      )
    ).result;
    expect(first.comments).toHaveLength(20);
    expect(second.comments).toHaveLength(3);
    expect(
      [...first.comments, ...second.comments].map((c: { id: string }) => c.id),
    ).toEqual(ids);
    expect(second.nextCommentCursor).toBeNull();
    expect(JSON.stringify(first)).not.toContain("삭제된 비공개 내용");
  });
  it("enforces comment limits while allowing idempotent retries and removes interactions with a deleted post", async () => {
    const post = await published(),
      id = randomUUID(),
      input = {
        action: "addComment",
        id: post.id,
        commentId: id,
        body: "마지막 댓글",
      };
    const day = new Date().toISOString().slice(0, 10),
      limit = db.doc(`photoCommentLimits/${day}_alex.k`);
    await limit.set({ count: COMMENTS_PER_MEMBER_DAY - 1, day });
    expect((await call(input, tokens["alex.k"])).status).toBe(200);
    expect((await call(input, tokens["alex.k"])).status).toBe(200);
    expect(
      (await call({ ...input, commentId: randomUUID() }, tokens["alex.k"]))
        .status,
    ).toBe(429);
    await db
      .doc(`photoPosts/${post.id}`)
      .update({ commentCount: COMMENTS_PER_POST });
    expect(
      (await call({ ...input, commentId: randomUUID() }, tokens["june.p"]))
        .status,
    ).toBe(429);
    await call({ action: "like", id: post.id, liked: true }, tokens["june.p"]);
    expect(
      (await call({ action: "delete", id: post.id }, tokens["dave.h"])).status,
    ).toBe(200);
    expect(
      (await db.collection(`photoPosts/${post.id}/likes`).get()).empty,
    ).toBe(true);
    expect(
      (await db.collection(`photoPosts/${post.id}/comments`).get()).empty,
    ).toBe(true);
    expect((await limit.get()).data().count).toBe(COMMENTS_PER_MEMBER_DAY);
  });
  async function addThreadComment(
    post: PhotoPost,
    uid: string,
    body: string,
    parentId?: string,
    replyToId?: string,
    commentId = randomUUID(),
  ) {
    const result = await call(
      {
        action: "addComment",
        id: post.id,
        commentId,
        body,
        ...(parentId ? { parentId } : {}),
        ...(replyToId ? { replyToId } : {}),
      },
      tokens[uid],
    );
    expect(result.status, JSON.stringify(result)).toBe(200);
    return result.result.comment;
  }
  it("threads replies and replies-to-replies, using the actual target author and stable counters on retries", async () => {
    const post = await published(),
      root = await addThreadComment(post, "alex.k", "원댓글");
    const replyId = randomUUID(),
      input = {
        action: "addComment",
        id: post.id,
        parentId: root.id,
        commentId: replyId,
        body: "답글",
        replyToHandle: "forged",
      };
    const repeated = await Promise.all([
      call(input, tokens["june.p"]),
      call(input, tokens["june.p"]),
    ]);
    expect(repeated.every((r) => r.status === 200)).toBe(true);
    expect(repeated[0].result.comment).toMatchObject({
      parentId: root.id,
      replyToId: root.id,
      replyToHandle: "alex.k",
    });
    const nested = await addThreadComment(
      post,
      "dave.h",
      "답글의 답글",
      root.id,
      replyId,
    );
    expect(nested).toMatchObject({
      parentId: root.id,
      replyToId: replyId,
      replyToHandle: "june.p",
    });
    const roots = (
      await call({ action: "comments", id: post.id }, tokens["alex.k"])
    ).result;
    expect(roots.comments).toHaveLength(1);
    expect(roots.comments[0].replyCount).toBe(2);
    expect(roots.commentCount).toBe(3);
    const replies = (
      await call(
        { action: "replies", id: post.id, parentId: root.id },
        tokens["alex.k"],
      )
    ).result;
    expect(replies.replies.map((c: { id: string }) => c.id)).toEqual([
      nested.id,
      replyId,
    ]);
    expect(
      (await db.doc(`photoPosts/${post.id}`).get()).data().commentCount,
    ).toBe(3);
  }, 30000);
  it("counts a member's heart only once on comments and replies and personalizes both the feed and thread", async () => {
    const post = await published(),
      root = await addThreadComment(post, "alex.k", "원댓글"),
      reply = await addThreadComment(post, "june.p", "답글", root.id);
    const heart = (
      uid: string,
      commentId: string,
      liked: boolean,
      parentId?: string,
    ) =>
      call(
        {
          action: "likeComment",
          id: post.id,
          commentId,
          liked,
          ...(parentId ? { parentId } : {}),
        },
        tokens[uid],
      );
    const together = await Promise.all([
      heart("alex.k", root.id, true),
      heart("alex.k", root.id, true),
      heart("june.p", root.id, true),
    ]);
    expect(together.every((r) => r.status === 200)).toBe(true);
    expect(
      (await heart("dave.h", reply.id, true, root.id)).result.comment,
    ).toMatchObject({ liked: true, likeCount: 1 });
    const list = (
      await call({ action: "list" }, tokens["dave.h"])
    ).result.posts.find((p: PhotoPost) => p.id === post.id);
    expect(
      list.commentPreview.find((c: { id: string }) => c.id === root.id),
    ).toMatchObject({ liked: false, likeCount: 2 });
    expect(
      list.commentPreview.find((c: { id: string }) => c.id === reply.id),
    ).toMatchObject({ liked: true, likeCount: 1 });
    const replies = (
      await call(
        { action: "replies", id: post.id, parentId: root.id },
        tokens["dave.h"],
      )
    ).result;
    expect(replies.replies[0]).toMatchObject({ liked: true, likeCount: 1 });
    await heart("alex.k", root.id, false);
    await heart("alex.k", root.id, false);
    expect(
      (await db.doc(`photoPosts/${post.id}/comments/${root.id}`).get()).data()
        .likeCount,
    ).toBe(1);
    expect(
      (await db.doc(`photoPosts/${post.id}`).get())
        .data()
        .commentPreview.every((c: object) => !("liked" in c)),
    ).toBe(true);
    await db.doc("members/dave.h").update({ sessionVersion: 2 });
    expect((await heart("dave.h", reply.id, false, root.id)).status).toBe(401);
  }, 30000);
  it("rejects cross-post or cross-thread reply targets, ID collisions and hearts on missing comments", async () => {
    const post = await published(),
      other = await published(),
      root = await addThreadComment(post, "alex.k", "첫 댓글"),
      otherRoot = await addThreadComment(other, "june.p", "다른 글 댓글");
    const secondRoot = await addThreadComment(post, "june.p", "다른 대화"),
      reply = await addThreadComment(
        post,
        "dave.h",
        "다른 대화 답글",
        secondRoot.id,
      );
    const input = {
      action: "addComment",
      id: post.id,
      commentId: randomUUID(),
      body: "답글",
    };
    expect(
      (await call({ ...input, parentId: otherRoot.id }, tokens["alex.k"]))
        .status,
    ).toBe(404);
    expect(
      (
        await call(
          { ...input, parentId: root.id, replyToId: reply.id },
          tokens["alex.k"],
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          { ...input, parentId: secondRoot.id, commentId: root.id },
          tokens["alex.k"],
        )
      ).status,
    ).toBe(409);
    expect(
      (await call({ ...input, commentId: reply.id }, tokens["alex.k"])).status,
    ).toBe(409);
    expect(
      (
        await call(
          {
            action: "likeComment",
            id: post.id,
            commentId: otherRoot.id,
            liked: true,
          },
          tokens["alex.k"],
        )
      ).status,
    ).toBe(404);
    for (const value of [
      { action: "likeComment", id: post.id, commentId: root.id, liked: true },
      { action: "replies", id: post.id, parentId: root.id },
    ])
      expect((await call(value)).status).toBe(401);
  }, 30000);
  it("preserves other people's replies when the parent is deleted and hides the empty thread after the last reply is removed", async () => {
    const post = await published(),
      root = await addThreadComment(post, "alex.k", "삭제되어야 하는 본문"),
      reply = await addThreadComment(
        post,
        "june.p",
        "남아야 하는 답글",
        root.id,
      );
    const deletion = await call(
      { action: "deleteComment", id: post.id, commentId: root.id },
      tokens["alex.k"],
    );
    expect(deletion.status).toBe(200);
    expect(deletion.result.comment.status).toBe("thread");
    expect(deletion.result.commentCount).toBe(1);
    const comments = (
      await call({ action: "comments", id: post.id }, tokens["dave.h"])
    ).result;
    expect(comments.comments[0]).toMatchObject({
      id: root.id,
      status: "thread",
      body: "",
      replyCount: 1,
    });
    expect(JSON.stringify(comments)).not.toContain("삭제되어야 하는 본문");
    expect(
      (
        await call(
          {
            action: "likeComment",
            id: post.id,
            commentId: root.id,
            liked: true,
          },
          tokens["alex.k"],
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          {
            action: "addComment",
            id: post.id,
            commentId: randomUUID(),
            parentId: root.id,
            body: "삭제된 원댓글에 새 답글",
          },
          tokens["alex.k"],
        )
      ).status,
    ).toBe(404);
    const nested = await addThreadComment(
      post,
      "dave.h",
      "대화 이어가기",
      root.id,
      reply.id,
    );
    expect(
      (
        await call(
          {
            action: "deleteComment",
            id: post.id,
            commentId: reply.id,
            parentId: root.id,
          },
          tokens["alex.k"],
        )
      ).status,
    ).toBe(403);
    await call(
      {
        action: "deleteComment",
        id: post.id,
        commentId: reply.id,
        parentId: root.id,
      },
      tokens["june.p"],
    );
    const last = await call(
      {
        action: "deleteComment",
        id: post.id,
        commentId: nested.id,
        parentId: root.id,
      },
      tokens["dave.h"],
    );
    expect(last.result.commentCount).toBe(0);
    expect(last.result.parentComment.status).toBe("deleted");
    expect(
      (await call({ action: "comments", id: post.id }, tokens["dave.h"])).result
        .comments,
    ).toEqual([]);
    expect(
      (
        await call(
          {
            action: "deleteComment",
            id: post.id,
            commentId: nested.id,
            parentId: root.id,
          },
          tokens["dave.h"],
        )
      ).result.commentCount,
    ).toBe(0);
  }, 30000);
  it("previews the newest three comments for legacy posts, refills after deletion, and includes new replies", async () => {
    const post = await published(),
      ids = Array.from({ length: 5 }, () => randomUUID()),
      batch = db.batch();
    ids.forEach((id, i) =>
      batch.set(db.doc(`photoPosts/${post.id}/comments/${id}`), {
        id,
        authorId: "alex.k",
        authorHandle: "alex.k",
        body: `댓글 ${i}`,
        createdAt: i + 1,
        status: "active",
      }),
    );
    batch.update(db.doc(`photoPosts/${post.id}`), { commentCount: 5 });
    await batch.commit();
    let preview = (await call({ action: "list" }, tokens["june.p"])).result
      .posts[0].commentPreview;
    expect(preview.map((c: { id: string }) => c.id)).toEqual([
      ids[4],
      ids[3],
      ids[2],
    ]);
    const deleted = await call(
      { action: "deleteComment", id: post.id, commentId: ids[4] },
      tokens["alex.k"],
    );
    expect(
      deleted.result.commentPreview.map((c: { id: string }) => c.id),
    ).toEqual([ids[3], ids[2], ids[1]]);
    const reply = await addThreadComment(post, "june.p", "새 답글", ids[0]);
    preview = (await call({ action: "list" }, tokens["alex.k"])).result.posts[0]
      .commentPreview;
    expect(preview.map((c: { id: string }) => c.id)).toEqual([
      reply.id,
      ids[3],
      ids[2],
    ]);
    expect(preview[0].parentId).toBe(ids[0]);
    expect(
      (await db.doc(`photoPosts/${post.id}`).get()).data().commentPreview,
    ).toHaveLength(3);
  }, 30000);
  it("paginates replies without duplicates and removes reply hearts when a post is deleted", async () => {
    const post = await published(),
      root = await addThreadComment(post, "alex.k", "원댓글"),
      ids = Array.from({ length: 23 }, () => randomUUID())
        .sort()
        .reverse(),
      batch = db.batch();
    for (const id of ids)
      batch.set(db.doc(`photoPosts/${post.id}/replies/${id}`), {
        id,
        authorId: "june.p",
        authorHandle: "june.p",
        parentId: root.id,
        replyToId: root.id,
        replyToHandle: "alex.k",
        body: "답글",
        status: "active",
        createdAt: 100,
      });
    batch.update(db.doc(`photoPosts/${post.id}/comments/${root.id}`), {
      replyCount: 23,
    });
    batch.update(db.doc(`photoPosts/${post.id}`), { commentCount: 24 });
    await batch.commit();
    const first = (
      await call(
        { action: "replies", id: post.id, parentId: root.id },
        tokens["alex.k"],
      )
    ).result;
    const second = (
      await call(
        {
          action: "replies",
          id: post.id,
          parentId: root.id,
          cursor: first.nextReplyCursor,
        },
        tokens["alex.k"],
      )
    ).result;
    expect(first.replies).toHaveLength(20);
    expect(second.replies).toHaveLength(3);
    expect(second.nextReplyCursor).toBeNull();
    expect(
      [...first.replies, ...second.replies].map((c: { id: string }) => c.id),
    ).toEqual(ids);
    await call(
      {
        action: "likeComment",
        id: post.id,
        parentId: root.id,
        commentId: ids[0],
        liked: true,
      },
      tokens["dave.h"],
    );
    expect(
      (await call({ action: "delete", id: post.id }, tokens["dave.h"])).status,
    ).toBe(200);
    expect(
      (await db.collection(`photoPosts/${post.id}/replies`).get()).empty,
    ).toBe(true);
    expect(
      (
        await db
          .collection(`photoPosts/${post.id}/replies/${ids[0]}/likes`)
          .get()
      ).empty,
    ).toBe(true);
  }, 30000);
});

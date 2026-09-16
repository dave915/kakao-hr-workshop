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
});

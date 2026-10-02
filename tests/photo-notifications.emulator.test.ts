import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSeed } from "../shared/seed";
import { photoEvent, type PhotoEvent } from "../shared/photo-notifications";
import type { PhotoPost, PhotoComment } from "../shared/photos";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const time = (value: string) => Date.parse(`2026-10-${value}+09:00`);
describe.skipIf(!enabled)("photo push queue and dispatch", () => {
  let db: any, worker: any;
  beforeAll(() => {
    require("firebase-admin/app").initializeApp({ projectId: "demo-workshop" });
    db = require("firebase-admin/firestore").getFirestore();
    worker = require("./lib/functions/src/photo-notifications.js");
  });
  beforeEach(async () => {
    for (const name of [
      "photoEvents",
      "photoPushes",
      "photoPosts",
      "pushTokens",
    ])
      await db.recursiveDelete(db.collection(name));
    await db.doc("workshops/main").set(makeSeed(true));
    await db
      .doc("pushTokens/phone")
      .set({ uid: "alex.k", token: "phone-token", deviceId: "phone" });
  });
  async function fixture(
    action: "like" | "comment" | "post" = "like",
    now = time("15T08:00:00"),
    postId = randomUUID(),
  ) {
    const state = makeSeed(true);
    const post: PhotoPost = {
      id: postId,
      authorId: "alex.k",
      authorHandle: "alex.k",
      generation: 0,
      caption: "",
      photos: [],
      createdAt: now,
      updatedAt: now,
      status: "published",
      expiresAt: 0,
    };
    const comment: PhotoComment = {
      id: randomUUID(),
      authorId: "june.p",
      authorHandle: "june.p",
      body: "반가워요",
      status: "active",
      createdAt: now,
    };
    await db.doc(`photoPosts/${post.id}`).set(post);
    if (action === "like")
      await db
        .doc(`photoPosts/${post.id}/likes/june.p`)
        .set({ createdAt: now });
    if (action === "comment")
      await db.doc(`photoPosts/${post.id}/comments/${comment.id}`).set(comment);
    const event = photoEvent(
      state,
      state.members[action === "post" ? "alex.k" : "june.p"],
      post,
      action,
      now,
      action === "comment" ? comment : undefined,
    );
    const ref = db.collection("photoEvents").doc();
    await ref.set(event);
    return { ref, event, post, comment };
  }
  const successful = (message: { tokens: string[] }) =>
    Promise.resolve({
      successCount: message.tokens.length,
      failureCount: 0,
      responses: message.tokens.map(() => ({ success: true })),
    });
  it("aggregates once per person before 9am and keeps retry markers stable across the cutoff", async () => {
    const first = await fixture(),
      second = await fixture("comment");
    await worker.queuePhotoEvent(first.ref, time("15T08:00:00"));
    await worker.queuePhotoEvent(second.ref, time("15T08:01:00"));
    await worker.queuePhotoEvent(first.ref, time("15T10:00:00"));
    const jobs = await db.collection("photoPushes").get();
    expect(jobs.size).toBe(1);
    const job = jobs.docs[0];
    expect((await job.ref.collection("items").get()).size).toBe(2);
    const send = vi.fn(successful);
    await worker.dispatchPhotoPush(job.ref, send, time("15T08:59:59"));
    expect(send).not.toHaveBeenCalled();
    await worker.sendDuePhotoPushes(time("15T09:00:00"), send);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatchObject({
      tokens: ["phone-token"],
      data: {
        type: "photo-activity",
        title: "사진첩의 아침 소식",
        body: "좋아요 1개 · 댓글 1개가 기다리고 있어요.",
      },
    });
    await worker.dispatchPhotoPush(job.ref, send, time("15T09:01:00"));
    expect(send).toHaveBeenCalledOnce();
    expect((await job.ref.get()).data().nextAttemptAt).toBeUndefined();
  });
  it("sends during the workshop immediately and retries only unsuccessful tokens", async () => {
    await db
      .doc("pushTokens/laptop")
      .set({ uid: "alex.k", token: "laptop-token", deviceId: "laptop" });
    const { ref, post } = await fixture("comment", time("16T00:00:00"));
    await worker.queuePhotoEvent(ref, time("16T00:00:00"));
    const job = (await db.collection("photoPushes").get()).docs[0];
    const send = vi
      .fn()
      .mockImplementationOnce(async (message: { tokens: string[] }) => ({
        responses: message.tokens.map((token) =>
          token === "phone-token"
            ? { success: true }
            : { success: false, error: { code: "messaging/internal-error" } },
        ),
      }))
      .mockImplementation(successful);
    await expect(
      worker.dispatchPhotoPush(job.ref, send, time("16T00:00:00")),
    ).rejects.toThrow();
    expect((await job.ref.get()).data().status).toBe("pending");
    await worker.dispatchPhotoPush(job.ref, send, time("16T00:01:01"));
    expect(send.mock.calls[1][0]).toMatchObject({
      tokens: ["laptop-token"],
      data: { postId: post.id },
    });
    expect(send.mock.calls[0][0].data.eventId).toBe(
      send.mock.calls[1][0].data.eventId,
    );
    expect((await job.ref.get()).data()).toMatchObject({
      status: "sent",
      delivered: 2,
      attempts: 2,
    });
  });
  it.each(["delete", "unlike", "author"])(
    "drops stale %s activity before the digest",
    async (mode) => {
      const { ref, post } = await fixture();
      await worker.queuePhotoEvent(ref, time("15T08:00:00"));
      if (mode === "delete")
        await db.doc(`photoPosts/${post.id}`).update({ status: "deleted" });
      if (mode === "unlike")
        await db.doc(`photoPosts/${post.id}/likes/june.p`).delete();
      if (mode === "author") {
        const state = makeSeed(true);
        delete state.members["june.p"];
        await db.doc("workshops/main").set(state);
      }
      const send = vi.fn(successful);
      await worker.sendDuePhotoPushes(time("15T09:00:00"), send);
      expect(send).not.toHaveBeenCalled();
      expect(
        (await db.collection("photoPushes").get()).docs[0].data().status,
      ).toBe("cancelled");
    },
  );
  it.each(["reset", "member", "off"])(
    "cancels queued work on %s",
    async (mode) => {
      const { ref } = await fixture();
      await worker.queuePhotoEvent(ref, time("15T08:00:00"));
      const state = makeSeed(true);
      if (mode === "reset") state.resetGeneration = 1;
      if (mode === "member") delete state.members["alex.k"];
      if (mode === "off") state.settings.photoNotifications = false;
      await db.doc("workshops/main").set(state);
      const send = vi.fn(successful);
      await worker.sendDuePhotoPushes(time("15T09:00:00"), send);
      expect(send).not.toHaveBeenCalled();
      expect(
        (await db.collection("photoPushes").get()).docs[0].data().status,
      ).toBe("cancelled");
    },
  );
  it("prevents concurrent sends and recovers an expired sending lease", async () => {
    const { ref } = await fixture();
    await worker.queuePhotoEvent(ref, time("15T08:00:00"));
    const job = (await db.collection("photoPushes").get()).docs[0];
    const send = vi.fn(successful);
    await job.ref.update({
      status: "sending",
      attempts: 1,
      leaseUntil: time("15T09:02:00"),
      nextAttemptAt: time("15T09:02:00"),
    });
    await worker.dispatchPhotoPush(job.ref, send, time("15T09:01:00"));
    expect(send).not.toHaveBeenCalled();
    await Promise.all([
      worker.dispatchPhotoPush(job.ref, send, time("15T09:03:00")),
      worker.dispatchPhotoPush(job.ref, send, time("15T09:03:00")),
    ]);
    expect(send).toHaveBeenCalledOnce();
  });
  it("skips deleted comments and removes invalid registrations without retrying", async () => {
    const first = await fixture("comment"),
      second = await fixture("comment");
    await worker.queuePhotoEvent(first.ref, time("15T08:00:00"));
    await worker.queuePhotoEvent(second.ref, time("15T08:00:00"));
    await db
      .doc(`photoPosts/${first.post.id}/comments/${first.comment.id}`)
      .update({ status: "deleted" });
    const send = vi.fn(async () => ({
      responses: [
        {
          success: false,
          error: { code: "messaging/registration-token-not-registered" },
        },
      ],
    }));
    await worker.sendDuePhotoPushes(time("15T09:00:00"), send);
    expect(send.mock.calls).toHaveLength(1);
    expect((send.mock.calls as any)[0][0].data.body).toBe(
      "댓글 1개가 기다리고 있어요.",
    );
    expect((await db.doc("pushTokens/phone").get()).exists).toBe(false);
    expect(
      (await db.collection("photoPushes").get()).docs[0].data().status,
    ).toBe("failed");
  });
  it("stops after the fifth failed delivery and never schedules another send", async () => {
    const { ref } = await fixture("comment", time("16T00:00:00"));
    await worker.queuePhotoEvent(ref, time("16T00:00:00"));
    const job = (await db.collection("photoPushes").get()).docs[0];
    await job.ref.update({ attempts: 4 });
    const send = vi.fn(async () => {
      throw new Error("temporary provider outage");
    });
    await expect(
      worker.dispatchPhotoPush(job.ref, send, time("16T00:00:00")),
    ).rejects.toThrow();
    expect((await job.ref.get()).data()).toMatchObject({
      status: "failed",
      attempts: 5,
    });
    expect((await job.ref.get()).data().nextAttemptAt).toBeUndefined();
    await worker.dispatchPhotoPush(job.ref, send, time("16T00:05:00"));
    expect(send).toHaveBeenCalledOnce();
  });
  it("does not deliver jobs more than 48 hours after their due time", async () => {
    const { ref } = await fixture();
    await worker.queuePhotoEvent(ref, time("15T08:00:00"));
    const job = (await db.collection("photoPushes").get()).docs[0];
    const send = vi.fn(successful);
    await worker.dispatchPhotoPush(job.ref, send, time("17T10:00:00"));
    expect(send).not.toHaveBeenCalled();
    expect((await job.ref.get()).data()).toMatchObject({
      status: "failed",
      attempts: 0,
    });
    expect((await job.ref.get()).data().nextAttemptAt).toBeUndefined();
  });
});

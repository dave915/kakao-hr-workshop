import { describe, expect, it } from "vitest";
import {
  checkPhotoQuota,
  photoActionInput,
  photoPath,
  PHOTO_MONTHLY_LIMIT,
  PHOTO_STORAGE_LIMIT,
  recentComments,
  threadedCommentPreview,
  type PhotoComment,
} from "../shared/photos";
describe("photo board limits", () => {
  const comment = (
    id: string,
    createdAt: number,
    extra: Partial<PhotoComment> = {},
  ): PhotoComment => ({
    id,
    createdAt,
    authorId: "a",
    authorHandle: "alex.k",
    body: id,
    status: "active",
    ...extra,
  });
  it("shows the parent above its replies even when recent candidates arrive in reverse order", () => {
    const root = comment("root", 1),
      first = comment("reply-1", 2, { parentId: "root", replyToId: "root" }),
      second = comment("reply-2", 3, {
        parentId: "root",
        replyToId: "reply-1",
      });
    const input = [second, first, root];
    expect(threadedCommentPreview(input).map((c) => c.id)).toEqual([
      "root",
      "reply-1",
      "reply-2",
    ]);
    expect(input.map((c) => c.id)).toEqual(["reply-2", "reply-1", "root"]);
  });
  it("includes a missing parent within the three-row limit, and never shows an orphaned reply", () => {
    const root = comment("root", 1),
      replies = [2, 3, 4].map((n) => comment(`r${n}`, n, { parentId: "root" }));
    expect(threadedCommentPreview(replies, [root]).map((c) => c.id)).toEqual([
      "root",
      "r3",
      "r4",
    ]);
    expect(threadedCommentPreview(replies)).toEqual([]);
    const deleted = { ...root, status: "thread" as const, body: "" };
    expect(threadedCommentPreview(replies, [deleted])[0]).toMatchObject({
      id: "root",
      body: "",
      status: "thread",
    });
  });
  it("keeps conversations together and respects a reply target when timestamps are equal", () => {
    const a = comment("a", 1),
      b = comment("b", 3),
      reply = comment("r", 4, { parentId: "a" });
    expect(threadedCommentPreview([reply, b, a]).map((c) => c.id)).toEqual([
      "a",
      "r",
      "b",
    ]);
    const parent = comment("z-parent", 2, { parentId: "a" }),
      child = comment("a-child", 2, { parentId: "a", replyToId: "z-parent" });
    expect(threadedCommentPreview([child, parent, a]).map((c) => c.id)).toEqual(
      ["a", "z-parent", "a-child"],
    );
  });
  it("requires a valid reply target and keeps only the latest three visible comments and replies", () => {
    const id = crypto.randomUUID(),
      parentId = crypto.randomUUID(),
      commentId = crypto.randomUUID();
    const input = {
      action: "addComment",
      id,
      parentId,
      commentId,
      body: "답글",
    };
    expect(photoActionInput.safeParse(input).success).toBe(true);
    expect(
      photoActionInput.safeParse({ ...input, replyToId: crypto.randomUUID() })
        .success,
    ).toBe(true);
    for (const value of [
      { ...input, commentId: parentId },
      { ...input, replyToId: commentId },
      { ...input, parentId: undefined, replyToId: parentId },
    ])
      expect(photoActionInput.safeParse(value).success).toBe(false);
    const comments = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      authorId: "a",
      authorHandle: "alex.k",
      body: "text",
      createdAt: i,
      status: "active" as const,
      ...(i === 3 ? { parentId } : {}),
    }));
    const hidden: PhotoComment = {
      ...comments[0],
      id: "hidden",
      status: "thread",
      createdAt: 10,
    };
    expect(recentComments([...comments, hidden]).map((c) => c.id)).toEqual([
      "4",
      "3",
      "2",
    ]);
    expect(comments.map((c) => c.id)).toEqual(["0", "1", "2", "3", "4"]);
  });
  it("validates comment boundaries and explicit like state without accepting arbitrary identifiers", () => {
    const input = {
      action: "addComment",
      id: crypto.randomUUID(),
      commentId: crypto.randomUUID(),
      body: "  함께한 순간 🌿\n반가워요!  ",
    };
    expect(photoActionInput.parse(input)).toMatchObject({
      body: "함께한 순간 🌿\n반가워요!",
    });
    expect(
      photoActionInput.safeParse({ ...input, body: "x".repeat(500) }).success,
    ).toBe(true);
    for (const patch of [
      { body: " \n " },
      { body: "x".repeat(501) },
      { commentId: "../another-post" },
    ])
      expect(photoActionInput.safeParse({ ...input, ...patch }).success).toBe(
        false,
      );
    expect(
      photoActionInput.safeParse({ action: "like", id: input.id, liked: true })
        .success,
    ).toBe(true);
    expect(
      photoActionInput.safeParse({
        action: "like",
        id: input.id,
        liked: "true",
      }).success,
    ).toBe(false);
  });
  it("validates uploads without trusting arbitrary storage paths or more than three photos", () => {
    const base = {
      action: "begin",
      id: crypto.randomUUID(),
      caption: "  추억  ",
      photos: [{ width: 1600, height: 1200 }],
    };
    expect(photoActionInput.parse(base)).toMatchObject({ caption: "추억" });
    for (const patch of [
      { photos: [] },
      { photos: Array(4).fill({ width: 10, height: 10 }) },
      { photos: [{ width: 1601, height: 10 }] },
      { id: "../outside" },
      { caption: "x".repeat(1001) },
    ])
      expect(photoActionInput.safeParse({ ...base, ...patch }).success).toBe(
        false,
      );
  });
  it("enforces shared monthly and stored photo limits at the exact boundary", () => {
    expect(
      checkPhotoQuota(3, PHOTO_MONTHLY_LIMIT - 3, PHOTO_STORAGE_LIMIT - 3),
    ).toBeNull();
    expect(checkPhotoQuota(3, PHOTO_MONTHLY_LIMIT - 2, 0)).toContain("이번 달");
    expect(checkPhotoQuota(3, 0, PHOTO_STORAGE_LIMIT - 2)).toContain(
      "보관 공간",
    );
  });
  it("keeps full images, thumbnails and reset generations in separate deterministic paths", () => {
    const post = { generation: 3, authorId: "alex.k", id: "post-id" };
    expect(photoPath(post, 1, "full")).toBe(
      "photos/3/alex.k/post-id/1-full.jpg",
    );
    expect(photoPath(post, 1, "thumb")).not.toBe(photoPath(post, 1, "full"));
    expect(photoPath({ ...post, generation: 4 }, 1, "full")).not.toBe(
      photoPath(post, 1, "full"),
    );
  });
});

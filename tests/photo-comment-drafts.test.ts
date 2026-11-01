import { describe, expect, it } from "vitest";
import { PhotoCommentDrafts } from "../src/lib/photo-comment-drafts";

const requestId = "1505fa35-c09a-42ec-933b-839e7bd8a9bf";
const replyTo = {
  id: "1b3467af-68ba-4d72-bf9d-43dcedaf5b0e",
  authorId: "june",
  authorHandle: "june.p",
  body: "함께 걸어요",
  createdAt: 1,
  status: "active" as const,
};
const draft = { body: "작성 중인 답글", replyTo, requestId };
const storage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
};

describe("photo comment drafts", () => {
  it("restores reply text, target and the same submission ID after a reload", () => {
    const session = storage(),
      first = new PhotoCommentDrafts(() => session);
    const key = first.key("alex", 0, "post");
    first.write(key, draft);
    expect(new PhotoCommentDrafts(() => session).read(key)).toEqual(draft);
  });
  it("isolates participants, posts and workshop resets", () => {
    const session = storage(),
      store = new PhotoCommentDrafts(() => session);
    store.write(store.key("alex", 0, "post"), draft);
    for (const key of [
      store.key("june", 0, "post"),
      store.key("alex", 1, "post"),
      store.key("alex", 0, "other"),
    ])
      expect(store.read(key)).toBeNull();
  });
  it("clears a successful submission without losing another post's draft", () => {
    const session = storage(),
      store = new PhotoCommentDrafts(() => session);
    const key = store.key("alex", 0, "post"),
      other = store.key("alex", 0, "other");
    store.write(key, draft);
    store.write(other, draft);
    store.write(key, { body: "", replyTo: null, requestId });
    const restored = new PhotoCommentDrafts(() => session);
    expect(restored.read(key)).toBeNull();
    expect(restored.read(other)).toEqual(draft);
  });
  it("keeps a draft in memory if session storage is blocked or full", () => {
    const store = new PhotoCommentDrafts(() => {
      throw new Error("storage blocked");
    });
    store.write("key", draft);
    expect(store.read("key")).toEqual(draft);
    store.write("key", { body: "", replyTo: null, requestId });
    expect(store.read("key")).toBeNull();
  });
  it.each([
    "broken JSON",
    JSON.stringify({ ...draft, requestId: "invalid" }),
    JSON.stringify({ ...draft, body: "a".repeat(501) }),
  ])("ignores malformed stored state without breaking comments", (value) => {
    const session = storage();
    session.setItem("key", value);
    expect(new PhotoCommentDrafts(() => session).read("key")).toBeNull();
  });
});

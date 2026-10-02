import { describe, expect, it } from "vitest";
import { makeSeed } from "../shared/seed";
import {
  mentionedMembers,
  photoDeliveryTime,
  photoEvent,
  photoNotificationText,
} from "../shared/photo-notifications";
import type { PhotoPost, PhotoComment } from "../shared/photos";
const state = makeSeed(true);
const post: PhotoPost = {
  id: crypto.randomUUID(),
  authorId: "alex.k",
  authorHandle: "alex.k",
  generation: 0,
  caption: "함께 @june.p",
  photos: [],
  createdAt: 0,
  updatedAt: 0,
  expiresAt: 0,
  status: "published",
};
const comment: PhotoComment = {
  id: crypto.randomUUID(),
  authorId: "june.p",
  authorHandle: "june.p",
  body: "반가워요 @alex.k @ella.s @ella.s",
  status: "active",
  createdAt: 0,
};
describe("photo notification policy", () => {
  it.each([
    ["2026-10-15T08:59:59+09:00", "digest", "2026-10-15T09:00:00+09:00"],
    ["2026-10-15T09:00:00+09:00", "digest", "2026-10-16T09:00:00+09:00"],
    ["2026-10-15T23:59:59+09:00", "digest", "2026-10-16T09:00:00+09:00"],
    ["2026-10-16T00:00:00+09:00", "realtime", "2026-10-16T00:00:00+09:00"],
    ["2026-10-16T23:59:59+09:00", "realtime", "2026-10-16T23:59:59+09:00"],
    ["2026-10-17T00:00:00+09:00", "digest", "2026-10-17T09:00:00+09:00"],
  ])("uses Korean day boundaries at %s", (time, mode, due) => {
    expect(photoDeliveryTime(state.settings, Date.parse(time))).toEqual({
      mode,
      dueAt: Date.parse(due),
    });
  });
  it("uses the full multi-day workshop period even when dates are stored in UTC", () => {
    expect(
      photoDeliveryTime(
        { ...state.settings, endsAt: "2026-10-18T09:00:00Z" },
        Date.parse("2026-10-18T23:00:00+09:00"),
      ).mode,
    ).toBe("realtime");
  });
  it("resolves full handles and ignores emails, partial names, unknown members, and duplicate mentions", () => {
    expect(
      mentionedMembers(
        "@Alex.k @alex.k, (@june.p) @alex @nobody mail@ella.s @@ryan.j",
        state.members,
      ),
    ).toEqual(["alex.k", "june.p"]);
    expect(
      mentionedMembers(
        "고마워요 @june.p. @alex.k! @ella.suffix @ryan.j외",
        state.members,
      ),
    ).toEqual(["alex.k", "june.p"]);
  });
  it("sends posts to everyone except the author and prioritizes a mention over a post", () => {
    const event = photoEvent(state, state.members["alex.k"], post, "post", 1);
    expect(event.recipients["alex.k"]).toBeUndefined();
    expect(event.recipients["june.p"]).toBe("mention");
    expect(event.recipients["dave.h"]).toBe("post");
    expect(Object.keys(event.recipients)).toHaveLength(5);
  });
  it("deduplicates comments, reply recipients, and mentions and never sends self notifications", () => {
    const event = photoEvent(
      state,
      state.members["june.p"],
      post,
      "comment",
      2,
      comment,
      { ...comment, authorId: "ella.s" },
    );
    expect(event.recipients).toEqual({
      "alex.k": "mention",
      "ella.s": "mention",
    });
    expect(
      photoEvent(state, state.members["alex.k"], post, "like", 2).recipients,
    ).toEqual({});
    expect(
      photoEvent(state, state.members["ella.s"], post, "like", 2, comment)
        .recipients,
    ).toEqual({ "june.p": "like" });
  });
  it("uses stable event keys for like toggles and respects the off switch", () => {
    const actor = state.members["ella.s"];
    expect(photoEvent(state, actor, post, "like", 1).id).toBe(
      photoEvent(state, actor, post, "like", 2).id,
    );
    expect(
      photoEvent(
        {
          ...state,
          settings: { ...state.settings, photoNotifications: false },
        },
        actor,
        post,
        "like",
        1,
      ).recipients,
    ).toEqual({});
  });
  it("summarizes all four activity types without exposing comment bodies", () => {
    const event = photoEvent(
      state,
      state.members["june.p"],
      post,
      "comment",
      2,
      comment,
    );
    const result = photoNotificationText(
      ["post", "like", "comment", "mention"].map((kind) => ({
        event,
        kind: kind as "post" | "like" | "comment" | "mention",
      })),
      "digest",
    );
    expect(result.body).toContain(
      "새 글 1개 · 좋아요 1개 · 댓글 1개 · 멘션 1개",
    );
    expect(
      photoNotificationText([{ event, kind: "mention" }], "realtime").body,
    ).toBe("June가 댓글에서 나를 멘션했어요.");
  });
});

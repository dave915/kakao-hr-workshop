import { describe, expect, it } from "vitest";
import { discoveryPush, discoveryRecipients } from "../shared/discovery-push";
import { makeSeed } from "../shared/seed";

describe("discovery push messages and audience", () => {
  it("uses the server-confirmed finder and cash prize, without unpublished locations", () => {
    const state = makeSeed(true);
    const treasure = {
      ...state.treasures[0],
      prizeAmount: 5000 as const,
      foundBy: "dave.h",
      foundAt: 1000,
      outcome: "treasure" as const,
    };
    const job = discoveryPush(state, treasure);
    expect(job).toMatchObject({
      title: "보물 발견!",
      body: "Dave가 5,000원 보물을 발견했어요!",
      finderId: "dave.h",
      status: "pending",
      attempts: 0,
    });
    expect(job).not.toHaveProperty("lat");
    expect(job).not.toHaveProperty("lng");
    expect(() => discoveryPush(state, state.treasures[0])).toThrow();
  });
  it("distinguishes blank prizes and never calls legacy points won", () => {
    const state = makeSeed(true),
      treasure = {
        ...state.treasures[0],
        foundBy: "alex.k",
        foundAt: 1000,
        outcome: "treasure" as const,
      };
    expect(discoveryPush(state, treasure).body).toBe(
      "Alex가 100포인트 보물을 발견했어요!",
    );
    expect(
      discoveryPush(state, { ...treasure, outcome: "bomb", prizeAmount: 0 })
        .body,
    ).toContain("Alex가 꽝을 발견했어요");
  });
  it("includes the finder and all teams and roles, excludes removed accounts and deduplicates devices", () => {
    const state = makeSeed(true);
    const records = [
      {
        id: "own",
        uid: "dave.h",
        token: "admin",
        deviceId: "phone",
        updatedAt: 2,
      },
      {
        id: "old",
        uid: "dave.h",
        token: "old-admin",
        deviceId: "phone",
        updatedAt: 1,
      },
      {
        id: "laptop",
        uid: "dave.h",
        token: "admin-laptop",
        deviceId: "laptop",
      },
      { id: "other-team", uid: "ryan.j", token: "ryan" },
      { id: "member", uid: "alex.k", token: "alex" },
      { id: "duplicate", uid: "alex.k", token: "alex" },
      { id: "removed", uid: "gone", token: "gone" },
      { id: "empty", uid: "ella.s", token: "" },
    ];
    expect(
      discoveryRecipients(records, state.members)
        .map((t) => t.token)
        .sort(),
    ).toEqual(["admin", "admin-laptop", "alex", "ryan"]);
  });
});

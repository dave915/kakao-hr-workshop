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
  it.each(
    [
      "Alex가 응원 보물을 발견했습니다! 마주치면 엄지 척을 날려주세요!",
      "Alex가 응원을 획득했습니다! 만나면 하이파이브를 요청하세요!",
      "응원 보물 발견자 Alex! 마주치면 경례로 예우해주세요!",
      "Alex가 희귀 보물을 찾았습니다! 만나면 축하의 한마디를 건네주세요!",
      "Alex의 응원 게이지가 충전되었습니다! 마주치면 축하 댄스를 선물해주세요!",
      "Alex가 행운의 응원을 발견했습니다! 만나면 행운을 나눠달라고 해보세요!",
      "응원 보물을 획득한 Alex! 만나면 응원 한 스푼을 보태주세요!",
      "Alex가 응원을 발견했습니다! 마주치면 ‘당신이 보물입니다!’라고 외쳐주세요!",
      "전설의 응원 보물 발견자 Alex! 마주치면 과장되게 존경을 표해주세요!",
    ].map((body, index) => ({ body, index })),
  )(
    "selects encouragement message $index and inserts the confirmed finder",
    ({ body, index }) => {
      const state = makeSeed(true);
      const job = discoveryPush(
        state,
        {
          ...state.treasures[0],
          foundBy: "alex.k",
          foundAt: 1000,
          outcome: "cheer",
          prizeAmount: 0,
        },
        () => (index + 0.5) / 9,
      );
      expect(job).toMatchObject({
        title: "응원을 발견했어요!",
        body,
      });
      expect(job.body).not.toContain("Dave");
      expect(job.body).not.toContain("꽝");
      expect(job.body).not.toContain("포인트");
    },
  );
  it("only draws a random message for encouragements and handles the last random bucket", () => {
    const state = makeSeed(true);
    const treasure = {
      ...state.treasures[0],
      foundBy: "dave.h",
      foundAt: 1000,
    };
    const noDraw = () => {
      throw new Error("Unexpected random draw");
    };
    expect(
      discoveryPush(
        state,
        { ...treasure, outcome: "bomb", prizeAmount: 0 },
        noDraw,
      ).body,
    ).toBe("Dave가 꽝을 발견했어요. 잠깐 쉬고 다시 도전해요!");
    expect(
      discoveryPush(
        state,
        { ...treasure, outcome: "treasure", prizeAmount: 5000 },
        noDraw,
      ).body,
    ).toBe("Dave가 5,000원 보물을 발견했어요!");
    expect(
      discoveryPush(
        state,
        { ...treasure, outcome: "cheer", prizeAmount: 0 },
        () => 1 - Number.EPSILON,
      ).body,
    ).toBe(
      "전설의 응원 보물 발견자 Dave! 마주치면 과장되게 존경을 표해주세요!",
    );
  });
});

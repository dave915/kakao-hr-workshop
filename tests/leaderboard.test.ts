import { describe, expect, it } from "vitest";
import { claimTreasure, memberRanking, teamRanking } from "../shared/game";
import { participantView } from "../shared/exploration";
import { mutate } from "../shared/mutate";
import { demoSecrets, makeSeed } from "../shared/seed";
import type { PrizeAmount } from "../shared/prizes";
import type { WorkshopState } from "../shared/types";

const now = Date.parse("2026-10-16T13:10:00+09:00");

function claim(
  state: WorkshopState,
  memberId: string,
  treasureId: string,
  prizeAmount?: PrizeAmount,
) {
  const treasure = state.treasures.find((t) => t.id === treasureId)!;
  if (prizeAmount !== undefined) treasure.prizeAmount = prizeAmount;
  return claimTreasure(
    state,
    demoSecrets,
    memberId,
    treasureId,
    { lat: treasure.lat, lng: treasure.lng, accuracy: 5, timestamp: now },
    now,
  );
}

describe("leaderboard prize totals", () => {
  it("sums found amounts per person and team and ranks by money instead of points", () => {
    const state = makeSeed(true);
    claim(state, "dave.h", "t1", 1000);
    claim(state, "dave.h", "t2", 2000);
    claim(state, "alex.k", "t4", 5000);
    claim(state, "june.p", "t5", 20000);
    state.treasures.find((t) => t.id === "t6")!.prizeAmount = 50000;
    const before = structuredClone(state);

    expect(
      memberRanking(state)
        .slice(0, 3)
        .map((m) => [m.id, m.prizeAmount]),
    ).toEqual([
      ["june.p", 20000],
      ["alex.k", 5000],
      ["dave.h", 3000],
    ]);
    expect(teamRanking(state).map((t) => [t.name, t.prizeAmount])).toEqual([
      ["그린 탐험대", 20000],
      ["옐로우 탐험대", 8000],
      ["오렌지 탐험대", 0],
    ]);
    expect(memberRanking(participantView(state))).toEqual(memberRanking(state));
    expect(teamRanking(participantView(state))).toEqual(teamRanking(state));
    expect(state).toEqual(before);
  });

  it("does not convert legacy points, bombs or cheers into money", () => {
    const state = makeSeed(true);
    claim(state, "dave.h", "t1");
    claim(state, "dave.h", "t3", 0);
    const cheer = state.treasures.find((t) => t.id === "t2")!;
    cheer.prizeAmount = 0;
    claimTreasure(
      state,
      { ...demoSecrets, t2: "cheer" },
      "alex.k",
      "t2",
      { lat: cheer.lat, lng: cheer.lng, accuracy: 5, timestamp: now },
      now,
    );
    expect(state.members["dave.h"].score).toBe(100);
    expect(memberRanking(state).every((m) => m.prizeAmount === 0)).toBe(true);
    expect(teamRanking(state).every((t) => t.prizeAmount === 0)).toBe(true);
  });

  it("breaks equal amounts by discovery count and then name for both rankings", () => {
    const state = makeSeed(true);
    claim(state, "dave.h", "t1", 1000);
    claim(state, "dave.h", "t2", 1000);
    claim(state, "alex.k", "t4", 2000);
    claim(state, "june.p", "t5", 2000);
    state.members["dave.h"].team = "C";
    state.members["alex.k"].team = "B";
    state.members["june.p"].team = "A";

    expect(
      memberRanking(state)
        .slice(0, 3)
        .map((m) => m.id),
    ).toEqual(["dave.h", "alex.k", "june.p"]);
    expect(
      teamRanking(state)
        .slice(0, 3)
        .map((t) => t.name),
    ).toEqual(["C", "A", "B"]);
  });

  it("updates totals after deleting a discovery or its participant", () => {
    const state = makeSeed(true);
    claim(state, "dave.h", "t1", 1000);
    claim(state, "alex.k", "t2", 2000);
    const secrets = { ...demoSecrets };
    mutate(
      state,
      secrets,
      "dave.h",
      { action: "deleteTreasure", id: "t1" },
      "id",
      now,
    );
    expect(
      memberRanking(state).find((m) => m.id === "dave.h")?.prizeAmount,
    ).toBe(0);
    expect(
      teamRanking(state).find((t) => t.name === "옐로우 탐험대")?.prizeAmount,
    ).toBe(2000);

    mutate(
      state,
      secrets,
      "dave.h",
      { action: "deleteMember", memberId: "alex.k" },
      "id",
      now,
    );
    expect(state.treasures.find((t) => t.id === "t2")?.foundBy).toBe("alex.k");
    expect(memberRanking(state).some((m) => m.id === "alex.k")).toBe(false);
    expect(teamRanking(state).every((t) => t.prizeAmount === 0)).toBe(true);
  });

  it("keeps unassigned and committee discoveries in personal totals only", () => {
    const state = makeSeed(true);
    state.members["dave.h"].team = " 미배정 ";
    state.members["alex.k"].team = "워 추 위";
    claim(state, "dave.h", "t1", 50000);
    claim(state, "alex.k", "t2", 30000);
    expect(
      memberRanking(state)
        .slice(0, 2)
        .map((m) => m.prizeAmount),
    ).toEqual([50000, 30000]);
    expect(teamRanking(state).every((t) => t.prizeAmount === 0)).toBe(true);
    expect(teamRanking(state).map((t) => t.name)).not.toContain(" 미배정 ");
    expect(teamRanking(state).map((t) => t.name)).not.toContain("워 추 위");
  });
});

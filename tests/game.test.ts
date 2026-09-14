import { describe, it, expect } from "vitest";
import { makeSeed, demoSecrets } from "../shared/seed";
import {
  claimTreasure,
  distanceMeters,
  scheduleStatus,
  teamRanking,
} from "../shared/game";
import { mutate } from "../shared/mutate";
import { actionInput } from "../shared/validation";
const now = Date.parse("2026-10-16T13:10:00+09:00");
const position = (id = "t1") => {
  const t = makeSeed(true).treasures.find((t) => t.id === id)!;
  return { lat: t.lat, lng: t.lng, accuracy: 5, timestamp: now };
};
describe("server-authoritative treasure rules", () => {
  it("awards points to a person and aggregates their team", () => {
    const state = makeSeed(true);
    const r = claimTreasure(
      state,
      demoSecrets,
      "dave.h",
      "t1",
      position(),
      now,
    );
    expect(r.points).toBe(100);
    expect(state.members["dave.h"].found).toBe(1);
    expect(teamRanking(state)[0]).toMatchObject({
      name: "옐로우 탐험대",
      score: 100,
      found: 1,
    });
  });
  it("only one participant can claim a treasure", () => {
    const state = makeSeed(true);
    claimTreasure(state, demoSecrets, "alex.k", "t1", position(), now);
    expect(() =>
      claimTreasure(state, demoSecrets, "dave.h", "t1", position(), now),
    ).toThrow("먼저 발견");
    expect(state.members["dave.h"].score).toBe(0);
  });
  it("does not allow double points on retries", () => {
    const state = makeSeed(true);
    claimTreasure(state, demoSecrets, "dave.h", "t1", position(), now);
    expect(() =>
      claimTreasure(state, demoSecrets, "dave.h", "t1", position(), now),
    ).toThrow();
    expect(state.members["dave.h"].score).toBe(100);
  });
  it("locks a bomb finder for exactly five minutes using server time", () => {
    const state = makeSeed(true);
    const r = claimTreasure(
      state,
      demoSecrets,
      "dave.h",
      "t3",
      position("t3"),
      now,
    );
    expect(r).toEqual({
      outcome: "bomb",
      points: 0,
      blockedUntil: now + 300000,
    });
    expect(() =>
      claimTreasure(
        state,
        demoSecrets,
        "dave.h",
        "t1",
        { ...position(), timestamp: now + 299999 },
        now + 299999,
      ),
    ).toThrow("휴식");
    expect(
      claimTreasure(
        state,
        demoSecrets,
        "dave.h",
        "t1",
        { ...position(), timestamp: now + 300000 },
        now + 300000,
      ).points,
    ).toBe(100);
  });
  it("does not lock teammates when another person finds a bomb", () => {
    const state = makeSeed(true);
    claimTreasure(state, demoSecrets, "dave.h", "t3", position("t3"), now);
    expect(
      claimTreasure(state, demoSecrets, "alex.k", "t1", position(), now).points,
    ).toBe(100);
  });
  it("rejects inaccurate, stale, far-away and malformed locations", () => {
    for (const p of [
      { ...position(), accuracy: 101 },
      { ...position(), accuracy: 0 },
      { ...position(), timestamp: now - 60001 },
      { ...position(), lat: 0 },
      { ...position(), lat: NaN },
    ]) {
      expect(() =>
        claimTreasure(makeSeed(true), demoSecrets, "dave.h", "t1", p, now),
      ).toThrow();
    }
  });
  it("rejects guesses while the game is paused", () => {
    const state = makeSeed(true);
    state.settings.gameOpen = false;
    expect(() =>
      claimTreasure(state, demoSecrets, "dave.h", "t1", position(), now),
    ).toThrow("준비 중");
  });
  it("does not expose undiscovered bomb types in public workshop data", () => {
    const state = makeSeed(true);
    expect(state.treasures.every((t) => !("kind" in t) && !t.outcome)).toBe(
      true,
    );
    expect(JSON.stringify(state)).not.toContain("bomb");
  });
  it("calculates distance and real schedule boundaries", () => {
    expect(distanceMeters(position(), position())).toBe(0);
    const s = makeSeed(true).schedule[0];
    expect(scheduleStatus(s, Date.parse(s.startsAt))).toBe("current");
    expect(scheduleStatus(s, Date.parse(s.endsAt))).toBe("past");
  });
});
describe("administrator boundaries", () => {
  it("prevents participants from changing roles, notices, invites or settings", () => {
    const state = makeSeed(true);
    for (const input of [
      { action: "setRole", memberId: "alex.k", role: "admin" },
      { action: "rotateInvite", memberId: "dave.h" },
      {
        action: "publishNotice",
        title: "hello",
        body: "hello",
        audience: "all",
        push: false,
      },
      { action: "saveSettings", settings: state.settings },
    ] as const) {
      expect(() =>
        mutate(state, { ...demoSecrets }, "alex.k", input, "id", now),
      ).toThrow("추진위원회");
    }
  });
  it("only the superadmin can grant admin access", () => {
    const state = makeSeed(true);
    state.members["june.p"].role = "admin";
    expect(() =>
      mutate(
        state,
        { ...demoSecrets },
        "june.p",
        { action: "setRole", memberId: "alex.k", role: "admin" },
        "id",
        now,
      ),
    ).toThrow("슈퍼");
    mutate(
      state,
      { ...demoSecrets },
      "dave.h",
      { action: "setRole", memberId: "alex.k", role: "admin" },
      "id",
      now,
    );
    expect(state.members["alex.k"].role).toBe("admin");
  });
  it("cannot demote dave.h or issue another superadmin", () => {
    expect(() =>
      mutate(
        makeSeed(true),
        { ...demoSecrets },
        "dave.h",
        { action: "setRole", memberId: "dave.h", role: "member" },
        "id",
        now,
      ),
    ).toThrow();
    expect(
      actionInput.safeParse({
        action: "setRole",
        memberId: "alex.k",
        role: "superadmin",
      }).success,
    ).toBe(false);
  });
  it("does not let an admin replace the superadmin login", () => {
    const state = makeSeed(true);
    state.members["june.p"].role = "admin";
    expect(() =>
      mutate(
        state,
        { ...demoSecrets },
        "june.p",
        { action: "rotateInvite", memberId: "dave.h" },
        "id",
        now,
      ),
    ).toThrow("슈퍼");
  });
  it("prevents losing your own session before seeing a replacement link", () => {
    expect(() =>
      mutate(
        makeSeed(true),
        { ...demoSecrets },
        "dave.h",
        { action: "rotateInvite", memberId: "dave.h" },
        "id",
        now,
      ),
    ).toThrow("운영자");
  });
  it("uses an assigned member role even if the payload requests superadmin", () => {
    const input = actionInput.parse({
      action: "createMember",
      member: { name: "Test", handle: "test.a", team: "A", role: "superadmin" },
    });
    const state = makeSeed(true);
    mutate(state, { ...demoSecrets }, "dave.h", input, "new-id", now);
    expect(state.members["new-id"].role).toBe("member");
  });
  it("rejects duplicate handles and invalid schedules", () => {
    expect(() =>
      mutate(
        makeSeed(true),
        { ...demoSecrets },
        "dave.h",
        {
          action: "createMember",
          member: { name: "fake", handle: "dave.h", team: "A" },
        },
        "id",
        now,
      ),
    ).toThrow("이미");
    const schedule = makeSeed(true).schedule[0];
    expect(
      actionInput.safeParse({
        action: "saveSchedule",
        schedule: { ...schedule, endsAt: schedule.startsAt },
      }).success,
    ).toBe(false);
  });
  it("keeps historical scores stable by rejecting team changes and deletion of found treasures", () => {
    const state = makeSeed(true);
    claimTreasure(state, demoSecrets, "dave.h", "t1", position(), now);
    expect(() =>
      mutate(
        state,
        { ...demoSecrets },
        "dave.h",
        { action: "updateTeam", memberId: "dave.h", team: "another" },
        "id",
        now,
      ),
    ).toThrow();
    expect(() =>
      mutate(
        state,
        { ...demoSecrets },
        "dave.h",
        { action: "deleteTreasure", id: "t1" },
        "id",
        now,
      ),
    ).toThrow();
  });
  it("production bootstrap starts without demo members, treasures or notices", () => {
    const state = makeSeed(false);
    expect(state.members).toEqual({});
    expect(state.treasures).toHaveLength(0);
    expect(state.notices).toHaveLength(0);
    expect(state.settings.gameOpen).toBe(false);
  });
});

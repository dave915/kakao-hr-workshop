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
      { action: "deleteNotice", id: "n1" },
      { action: "deleteTreasure", id: "t1" },
      { action: "resetWorkshop", confirmation: "전체 초기화" },
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
  it("rejects team changes while discovered treasures remain", () => {
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
  });
  it("production bootstrap starts without demo members, treasures or notices", () => {
    const state = makeSeed(false);
    expect(state.members).toEqual({});
    expect(state.treasures).toHaveLength(0);
    expect(state.notices).toHaveLength(0);
    expect(state.settings.gameOpen).toBe(false);
  });
});

describe("administrator deletion and reset", () => {
  it("deletes a notice for all viewers without changing other notices", () => {
    const state = makeSeed(true);
    state.members["june.p"].role = "admin";
    state.notices.push({
      ...state.notices[0],
      id: "n2",
      pushStatus: "pending",
    });
    mutate(
      state,
      {},
      "june.p",
      { action: "deleteNotice", id: "n1" },
      "id",
      now,
    );
    expect(state.notices.map((n) => n.id)).toEqual(["n2"]);
    mutate(
      state,
      {},
      "june.p",
      { action: "deleteNotice", id: "n1" },
      "id",
      now,
    );
    expect(state.notices.map((n) => n.id)).toEqual(["n2"]);
  });
  it("removes found treasure points once and keeps other discoveries and team totals", () => {
    const state = makeSeed(true);
    const secrets = { ...demoSecrets };
    claimTreasure(state, secrets, "alex.k", "t1", position(), now);
    claimTreasure(state, secrets, "alex.k", "t2", position("t2"), now);
    claimTreasure(state, secrets, "dave.h", "t4", position("t4"), now);
    state.members["june.p"].role = "admin";
    for (let retry = 0; retry < 2; retry++) {
      mutate(
        state,
        secrets,
        "june.p",
        { action: "deleteTreasure", id: "t1" },
        "id",
        now,
      );
      expect(state.members["alex.k"]).toMatchObject({ score: 150, found: 1 });
      expect(state.members["dave.h"]).toMatchObject({ score: 200, found: 1 });
      expect(teamRanking(state)[0]).toMatchObject({ score: 350, found: 2 });
      expect(state.treasures.some((t) => t.id === "t1")).toBe(false);
      expect(secrets).not.toHaveProperty("t1");
    }
  });
  it("deleting an unfound treasure does not alter scores", () => {
    const state = makeSeed(true);
    const members = structuredClone(state.members);
    const secrets = { ...demoSecrets };
    mutate(
      state,
      secrets,
      "dave.h",
      { action: "deleteTreasure", id: "t1" },
      "id",
      now,
    );
    expect(state.members).toEqual(members);
    expect(secrets).not.toHaveProperty("t1");
  });
  it("deleting a found bomb clears its lock without deducting points", () => {
    const state = makeSeed(true);
    const secrets = { ...demoSecrets };
    claimTreasure(state, secrets, "alex.k", "t1", position(), now);
    claimTreasure(state, secrets, "alex.k", "t3", position("t3"), now);
    mutate(
      state,
      secrets,
      "dave.h",
      { action: "deleteTreasure", id: "t3" },
      "id",
      now,
    );
    expect(state.members["alex.k"]).toMatchObject({
      score: 100,
      found: 1,
      blockedUntil: 0,
    });
  });
  it("deleting an older bomb preserves the lock from a newer bomb", () => {
    const state = makeSeed(true);
    const secrets = { ...demoSecrets, t2: "bomb" as const };
    claimTreasure(state, secrets, "alex.k", "t3", position("t3"), now);
    const later = now + 300001;
    claimTreasure(
      state,
      secrets,
      "alex.k",
      "t2",
      { ...position("t2"), timestamp: later },
      later,
    );
    mutate(
      state,
      secrets,
      "dave.h",
      { action: "deleteTreasure", id: "t3" },
      "id",
      later,
    );
    expect(state.members["alex.k"].blockedUntil).toBe(later + 300000);
  });
  it("rejects a reset from committee admins without changing any data", () => {
    const state = makeSeed(true);
    state.members["june.p"].role = "admin";
    const before = structuredClone(state);
    const secrets = { ...demoSecrets };
    expect(() =>
      mutate(
        state,
        secrets,
        "june.p",
        { action: "resetWorkshop", confirmation: "전체 초기화" },
        "id",
        now,
      ),
    ).toThrow("슈퍼");
    expect(state).toEqual(before);
    expect(secrets).toEqual(demoSecrets);
  });
  it("requires the explicit reset confirmation in the request", () => {
    for (const confirmation of [undefined, "", "초기화", true]) {
      expect(
        actionInput.safeParse({ action: "resetWorkshop", confirmation })
          .success,
      ).toBe(false);
    }
    expect(
      actionInput.safeParse({
        action: "resetWorkshop",
        confirmation: "전체 초기화",
      }).success,
    ).toBe(true);
  });
  it("resets all workshop data and retains every superadmin identity", () => {
    const state = makeSeed(true);
    const secrets = { ...demoSecrets };
    state.members["june.p"].role = "superadmin";
    state.members["ryan.j"].role = "admin";
    claimTreasure(state, secrets, "dave.h", "t1", position(), now);
    claimTreasure(state, secrets, "dave.h", "t3", position("t3"), now);
    const survivors = [state.members["dave.h"], state.members["june.p"]].map(
      (m) => ({
        ...m,
        team: "미배정",
        score: 0,
        found: 0,
        blockedUntil: 0,
      }),
    );
    for (let retry = 0; retry < 2; retry++) {
      mutate(
        state,
        secrets,
        "dave.h",
        { action: "resetWorkshop", confirmation: "전체 초기화" },
        "id",
        now,
      );
      expect(state).toEqual({
        ...makeSeed(false),
        resetGeneration: retry + 1,
        members: Object.fromEntries(survivors.map((m) => [m.id, m])),
      });
      expect(secrets).toEqual({});
    }
    mutate(
      state,
      secrets,
      "dave.h",
      {
        action: "createMember",
        member: { name: "알렉스", handle: "alex.k", team: "새 팀" },
      },
      "new-member",
      now,
    );
    expect(state.members["new-member"].role).toBe("member");
  });
});

describe("individual participant deletion", () => {
  it("removes the participant and score contribution while keeping awarded treasures unavailable", () => {
    const state = makeSeed(true);
    const secrets = { ...demoSecrets };
    state.members["june.p"].role = "admin";
    claimTreasure(state, secrets, "alex.k", "t1", position(), now);
    claimTreasure(state, secrets, "alex.k", "t3", position("t3"), now);
    const treasures = structuredClone(state.treasures);
    const dave = structuredClone(state.members["dave.h"]);
    mutate(
      state,
      secrets,
      "june.p",
      { action: "deleteMember", memberId: "alex.k" },
      "id",
      now,
    );
    expect(state.members).not.toHaveProperty("alex.k");
    expect(state.members["dave.h"]).toEqual(dave);
    expect(teamRanking(state).find((t) => t.name === dave.team)).toMatchObject({
      score: 0,
      found: 0,
    });
    expect(state.treasures).toEqual(treasures);
    expect(secrets).toEqual(demoSecrets);
    expect(() =>
      claimTreasure(state, secrets, "dave.h", "t1", position(), now),
    ).toThrow("먼저 발견");
    expect(() =>
      claimTreasure(state, secrets, "alex.k", "t2", position("t2"), now),
    ).toThrow("참가자");
  });
  it("rejects deletion by a participant without changing state", () => {
    const state = makeSeed(true);
    const before = structuredClone(state);
    expect(() =>
      mutate(
        state,
        {},
        "alex.k",
        { action: "deleteMember", memberId: "june.p" },
        "id",
        now,
      ),
    ).toThrow("추진위원회");
    expect(state).toEqual(before);
  });
  it("protects every superadmin and the signed-in admin account", () => {
    const state = makeSeed(true);
    state.members["june.p"].role = "superadmin";
    state.members["ryan.j"].role = "admin";
    const before = structuredClone(state);
    for (const memberId of ["dave.h", "june.p"])
      expect(() =>
        mutate(
          state,
          {},
          "dave.h",
          { action: "deleteMember", memberId },
          "id",
          now,
        ),
      ).toThrow("슈퍼");
    expect(() =>
      mutate(
        state,
        {},
        "ryan.j",
        { action: "deleteMember", memberId: "ryan.j" },
        "id",
        now,
      ),
    ).toThrow("내 계정");
    expect(state).toEqual(before);
  });
  it("only lets a superadmin delete another committee account", () => {
    const state = makeSeed(true);
    state.members["june.p"].role = "admin";
    state.members["ryan.j"].role = "admin";
    expect(() =>
      mutate(
        state,
        {},
        "june.p",
        { action: "deleteMember", memberId: "ryan.j" },
        "id",
        now,
      ),
    ).toThrow("슈퍼");
    mutate(
      state,
      {},
      "dave.h",
      { action: "deleteMember", memberId: "ryan.j" },
      "id",
      now,
    );
    expect(state.members).not.toHaveProperty("ryan.j");
    expect(state.members["june.p"].role).toBe("admin");
  });
  it("rejects unknown or inherited member keys", () => {
    const state = makeSeed(true);
    const before = structuredClone(state);
    for (const memberId of ["missing", "__proto__", "constructor"])
      expect(() =>
        mutate(
          state,
          {},
          "dave.h",
          { action: "deleteMember", memberId },
          "id",
          now,
        ),
      ).toThrow("참가자");
    expect(state).toEqual(before);
    expect(
      actionInput.safeParse({ action: "deleteMember", memberId: "" }).success,
    ).toBe(false);
  });
  it("allows reinviting the handle with a new identity without inheriting old awards", () => {
    const state = makeSeed(true);
    const secrets = { ...demoSecrets };
    claimTreasure(state, secrets, "alex.k", "t1", position(), now);
    mutate(
      state,
      secrets,
      "dave.h",
      { action: "deleteMember", memberId: "alex.k" },
      "id",
      now,
    );
    mutate(
      state,
      secrets,
      "dave.h",
      {
        action: "createMember",
        member: { name: "Alex", handle: "alex.k", team: "새 팀" },
      },
      "new-alex",
      now,
    );
    expect(state.members["new-alex"]).toMatchObject({
      score: 0,
      found: 0,
      joined: false,
    });
    expect(state.treasures[0].foundBy).toBe("alex.k");
    expect(() =>
      claimTreasure(state, secrets, "new-alex", "t1", position(), now),
    ).toThrow("먼저 발견");
  });
});

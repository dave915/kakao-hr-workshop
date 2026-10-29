import { describe, expect, it } from "vitest";
import { participantView } from "../shared/exploration";
import { mutate } from "../shared/mutate";
import { COMMITTEE_AUDIENCE, isNoticeRecipient } from "../shared/notices";
import { makeSeed } from "../shared/seed";
import { actionInput } from "../shared/validation";

const committeeNotice = {
  action: "publishNotice" as const,
  title: "워추위 회의",
  body: "운영진만 확인할 안내",
  audience: COMMITTEE_AUDIENCE,
  push: true,
};

describe("committee notices", () => {
  it("lets committee members publish without a committee-named team and keeps the content out of participant data", () => {
    const state = makeSeed(true);
    state.members["june.p"].role = "admin";
    for (const actor of ["dave.h", "june.p"]) {
      const input = actionInput.parse(committeeNotice);
      expect(mutate(state, {}, actor, input, actor, 123)).toEqual({
        noticeId: actor,
      });
    }
    expect(state.notices.slice(0, 2)).toEqual([
      expect.objectContaining({
        id: "june.p",
        audience: COMMITTEE_AUDIENCE,
        pushStatus: "pending",
      }),
      expect.objectContaining({ id: "dave.h" }),
    ]);
    const visible = participantView(state);
    expect(visible.notices.map((n) => n.id)).toEqual(["n1"]);
    expect(JSON.stringify(visible)).not.toContain(committeeNotice.title);
    expect(JSON.stringify(visible)).not.toContain(committeeNotice.body);
    expect(state.notices).toHaveLength(3);
  });

  it("targets current admin roles across teams and excludes members, even with a committee team name", () => {
    const state = makeSeed(true);
    state.members["june.p"].role = "admin";
    state.members["alex.k"].team = "워추위";
    state.members["ella.s"].team = COMMITTEE_AUDIENCE;
    const recipientIds = () =>
      Object.values(state.members)
        .filter((m) => isNoticeRecipient(COMMITTEE_AUDIENCE, m))
        .map((m) => m.id);
    expect(recipientIds()).toEqual(["dave.h", "june.p"]);
    expect(isNoticeRecipient(COMMITTEE_AUDIENCE, undefined)).toBe(false);
    expect(isNoticeRecipient(COMMITTEE_AUDIENCE, null)).toBe(false);

    mutate(
      state,
      {},
      "dave.h",
      { action: "setRole", memberId: "june.p", role: "member" },
      "unused",
    );
    expect(recipientIds()).toEqual(["dave.h"]);
  });

  it("preserves all and team recipients and rejects unknown teams", () => {
    const state = makeSeed(true);
    const member = state.members["alex.k"];
    expect(isNoticeRecipient("all", member)).toBe(true);
    expect(isNoticeRecipient("all", null)).toBe(false);
    expect(isNoticeRecipient(member.team, member)).toBe(true);
    expect(isNoticeRecipient("그린 탐험대", member)).toBe(false);
    for (const audience of ["all", member.team, COMMITTEE_AUDIENCE]) {
      mutate(
        state,
        {},
        "dave.h",
        { ...committeeNotice, audience, push: false },
        audience,
      );
    }
    expect(participantView(state).notices.map((n) => n.id)).toEqual([
      member.team,
      "all",
      "n1",
    ]);
    expect(state.notices[0].pushStatus).toBe("none");
    expect(() =>
      mutate(
        state,
        {},
        "dave.h",
        { ...committeeNotice, audience: "없는 팀" },
        "invalid",
      ),
    ).toThrow("발송할 팀");
  });

  it("does not let ordinary members publish committee notices", () => {
    const state = makeSeed(true);
    expect(() =>
      mutate(state, {}, "alex.k", committeeNotice, "forbidden"),
    ).toThrow("추진위원회");
    expect(state.notices.map((n) => n.id)).toEqual(["n1"]);
  });
});

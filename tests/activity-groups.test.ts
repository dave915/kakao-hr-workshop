import { describe, expect, it } from "vitest";
import { makeSeed } from "../shared/seed";
import { mutate } from "../shared/mutate";
import { participantView } from "../shared/exploration";
import { actionInput } from "../shared/validation";
import type { ActivityGroup } from "../shared/types";

const activity = (title = "볼링조"): ActivityGroup => ({
  id: crypto.randomUUID(),
  title,
  description: "로비에서 만나요",
  published: false,
  groups: [
    { id: crypto.randomUUID(), name: "1조", memberIds: ["alex.k", "june.p"] },
  ],
});
describe("activity groups", () => {
  it("preserves pending newcomers without creating accounts and keeps private placeholders hidden", () => {
    const state = makeSeed(true),
      item = activity();
    item.groups[0].pendingNames = ["신규입사(리워즈)"];
    const input = actionInput.parse({
      action: "saveActivityGroup",
      activityGroup: item,
    });
    mutate(state, {}, "dave.h", input, "unused");
    expect(state.activityGroups?.[0].groups[0].pendingNames).toEqual([
      "신규입사(리워즈)",
    ]);
    expect(Object.values(state.members)).toHaveLength(6);
    expect(JSON.stringify(participantView(state))).not.toContain("신규입사");
  });
  it("allows independent activity assignments and only publishes explicitly public rosters", () => {
    const state = makeSeed(true),
      bowling = activity(),
      cooking = activity("요리조");
    for (const item of [bowling, cooking])
      mutate(
        state,
        {},
        "dave.h",
        { action: "saveActivityGroup", activityGroup: item },
        "unused",
      );
    expect(participantView(state).activityGroups).toEqual([]);
    mutate(
      state,
      {},
      "dave.h",
      { action: "setActivityGroupPublished", id: bowling.id, published: true },
      "unused",
    );
    expect(participantView(state).activityGroups).toEqual([bowling]);
    expect(JSON.stringify(participantView(state))).not.toContain("요리조");
    expect(state.members["alex.k"].team).toBe("옐로우 탐험대");
    mutate(
      state,
      {},
      "dave.h",
      { action: "setActivityGroupPublished", id: bowling.id, published: false },
      "unused",
    );
    expect(participantView(state).activityGroups).toEqual([]);
  });
  it("rejects participant writes, unknown members, and duplicate assignments", () => {
    const state = makeSeed(true),
      item = activity();
    expect(() =>
      mutate(
        state,
        {},
        "alex.k",
        { action: "saveActivityGroup", activityGroup: item },
        "unused",
      ),
    ).toThrow("추진위원회");
    item.groups.push({
      id: crypto.randomUUID(),
      name: "2조",
      memberIds: ["alex.k"],
    });
    expect(
      actionInput.safeParse({
        action: "saveActivityGroup",
        activityGroup: item,
      }).success,
    ).toBe(false);
    item.groups[1].memberIds = ["missing"];
    expect(() =>
      mutate(
        state,
        {},
        "dave.h",
        { action: "saveActivityGroup", activityGroup: item },
        "unused",
      ),
    ).toThrow("참가자");
  });
  it("removes deleted members from rosters and clears all activities on reset", () => {
    const state = makeSeed(true);
    state.activityGroups = [activity()];
    mutate(
      state,
      {},
      "dave.h",
      { action: "deleteMember", memberId: "alex.k" },
      "unused",
    );
    expect(state.activityGroups[0].groups[0].memberIds).toEqual(["june.p"]);
    mutate(
      state,
      {},
      "dave.h",
      { action: "resetWorkshop", confirmation: "전체 초기화" },
      "unused",
    );
    expect(state.activityGroups).toEqual([]);
  });
  it("handles existing state without activities and deletes one activity only", () => {
    const state = makeSeed(true);
    delete state.activityGroups;
    expect(participantView(state).activityGroups).toEqual([]);
    const first = activity(),
      second = activity("요리조");
    state.activityGroups = [first, second];
    mutate(
      state,
      {},
      "dave.h",
      { action: "deleteActivityGroup", id: first.id },
      "unused",
    );
    expect(state.activityGroups).toEqual([second]);
  });
});

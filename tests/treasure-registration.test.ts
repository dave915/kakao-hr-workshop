import { describe, expect, it } from "vitest";
import { mutate } from "../shared/mutate";
import { makeSeed, demoSecrets } from "../shared/seed";
import { actionInput, type TreasureInput } from "../shared/validation";
import { registrationValues } from "../shared/treasure-registration";
import {
  draftStorageKey,
  emptyWorkspace,
  newDraft,
  nextTreasureName,
  parseWorkspace,
  validateDraft,
} from "../src/lib/treasure-drafts";
import { participantView } from "../shared/exploration";
const treasure = (id: string): TreasureInput => ({
  id,
  name: `보물 ${id}`,
  hint: "나무 아래",
  lat: 37.3,
  lng: 127.1,
  points: 100,
  radius: 50,
  kind: "treasure",
});
const batch = (
  treasures: (TreasureInput & { original?: TreasureInput })[],
  resetGeneration = 0,
) => actionInput.parse({ action: "saveTreasures", treasures, resetGeneration });
describe("batch treasure registration", () => {
  it("writes a mixed batch while keeping unclaimed positions and kinds private", () => {
    const state = makeSeed(true),
      secrets = { ...demoSecrets };
    const original = registrationValues(
      state.treasures[0],
      secrets[state.treasures[0].id],
    );
    mutate(
      state,
      secrets,
      "dave.h",
      batch([
        { ...original, hint: "수정한 힌트", original },
        treasure("new"),
        { ...treasure("bomb"), kind: "bomb" },
      ]),
      "id",
    );
    expect(state.treasures.find((t) => t.id === original.id)?.hint).toBe(
      "수정한 힌트",
    );
    expect(secrets.bomb).toBe("bomb");
    expect(
      participantView(state).treasures.find((t) => t.id === "bomb"),
    ).not.toHaveProperty("lat");
    expect(
      participantView(state).treasures.find((t) => t.id === "bomb"),
    ).not.toHaveProperty("kind");
  });
  it("rejects a discovered edit without partially registering earlier items", () => {
    const state = makeSeed(true),
      secrets = { ...demoSecrets };
    const current = state.treasures[0];
    const original = registrationValues(current, secrets[current.id]);
    current.foundBy = "alex.k";
    const before = structuredClone({ state, secrets });
    expect(() =>
      mutate(
        state,
        secrets,
        "dave.h",
        batch([treasure("new"), { ...original, hint: "새 힌트", original }]),
        "id",
      ),
    ).toThrow("이미 발견");
    expect({ state, secrets }).toEqual(before);
  });
  it("does not overwrite another admin's edits or resurrect a deleted original", () => {
    for (const change of ["edit", "delete"]) {
      const state = makeSeed(true),
        secrets = { ...demoSecrets };
      const original = registrationValues(
        state.treasures[0],
        secrets[state.treasures[0].id],
      );
      if (change === "edit") state.treasures[0].hint = "다른 관리자의 수정";
      else state.treasures.shift();
      const before = structuredClone({ state, secrets });
      expect(() =>
        mutate(
          state,
          secrets,
          "dave.h",
          batch([treasure("new"), { ...original, name: "내 수정", original }]),
          "id",
        ),
      ).toThrow("원본");
      expect({ state, secrets }).toEqual(before);
    }
  });
  it("makes a lost-response retry idempotent even after a discovery", () => {
    const state = makeSeed(true),
      secrets = { ...demoSecrets };
    const input = batch([treasure("new")]);
    mutate(state, secrets, "dave.h", input, "id");
    const saved = state.treasures.find((t) => t.id === "new")!;
    Object.assign(saved, {
      foundBy: "alex.k",
      foundAt: 1234,
      outcome: "treasure",
    });
    state.members["alex.k"].score = 100;
    const before = structuredClone({ state, secrets });
    mutate(state, secrets, "dave.h", input, "id");
    expect({ state, secrets }).toEqual(before);
  });
  it("enforces the total limit without mutating state or secrets", () => {
    const state = makeSeed(true),
      secrets = { ...demoSecrets };
    const before = structuredClone({ state, secrets });
    expect(() =>
      mutate(
        state,
        secrets,
        "dave.h",
        batch(Array.from({ length: 100 }, (_, i) => treasure(`new-${i}`))),
        "id",
      ),
    ).toThrow("최대 100개");
    expect({ state, secrets }).toEqual(before);
  });
  it("rejects duplicate IDs, empty batches and invalid input", () => {
    expect(() => batch([treasure("a"), treasure("a")])).toThrow("중복");
    expect(() => batch([])).toThrow();
    expect(() => batch([{ ...treasure("a"), lat: 100 }])).toThrow();
    expect(() =>
      batch([{ ...treasure("a"), original: treasure("b") }]),
    ).toThrow();
  });
  it("rejects participant mutations and drafts from a previous reset", () => {
    const state = makeSeed(true),
      secrets = { ...demoSecrets };
    expect(() =>
      mutate(state, secrets, "alex.k", batch([treasure("new")]), "id"),
    ).toThrow("추진위원회");
    mutate(
      state,
      secrets,
      "dave.h",
      { action: "resetWorkshop", confirmation: "전체 초기화" },
      "id",
    );
    expect(() =>
      mutate(state, secrets, "dave.h", batch([treasure("new")]), "id"),
    ).toThrow("초기화");
    mutate(state, secrets, "dave.h", batch([treasure("new")], 1), "id");
    expect(state.treasures).toHaveLength(1);
  });
});
describe("registration drafts", () => {
  it("starts new treasures at 10m and migrates the old default without changing drafts", () => {
    const workspace = emptyWorkspace();
    expect(newDraft([], workspace.defaults, 37.1, 127.2).radius).toBe(10);
    const old = {
      ...workspace,
      version: 1,
      drafts: [treasure("draft")],
      defaults: { ...workspace.defaults, radius: 50 },
    };
    const migrated = parseWorkspace(JSON.stringify(old));
    expect(migrated.defaults.radius).toBe(10);
    expect(migrated.drafts).toEqual(old.drafts);
    expect(
      parseWorkspace(
        JSON.stringify({ ...old, defaults: { ...old.defaults, radius: 30 } }),
      ).defaults.radius,
    ).toBe(30);
    const customized = {
      ...workspace,
      defaults: { ...workspace.defaults, radius: 50 },
    };
    expect(parseWorkspace(JSON.stringify(customized)).defaults.radius).toBe(50);
  });
  it("numbers new treasures after existing and draft names, with unique IDs and carried settings", () => {
    const items = [
      { name: "커피 쿠폰" },
      { name: "보물 09" },
      { name: "보물 12" },
    ];
    expect(nextTreasureName(items)).toBe("보물 13");
    const defaults = { kind: "bomb" as const, radius: 30, points: 250 };
    const first = newDraft(items, defaults, 37.1, 127.2),
      second = newDraft([...items, first], defaults, 37.2, 127.3);
    expect(first).toMatchObject({
      name: "보물 13",
      lat: 37.1,
      lng: 127.2,
      ...defaults,
    });
    expect(second.name).toBe("보물 14");
    expect(second.id).not.toBe(first.id);
  });
  it("restores incomplete fields, selection, settings and viewport without inventing coordinates", () => {
    const workspace = emptyWorkspace();
    workspace.drafts = [
      {
        ...treasure("draft"),
        name: "",
        hint: "",
        lat: null,
        points: null,
        radius: 0,
      },
    ];
    workspace.selected = "draft";
    workspace.mode = "map";
    workspace.viewport = { lat: 37.4, lng: 127.4, level: 5 };
    expect(parseWorkspace(JSON.stringify(workspace))).toEqual(workspace);
    expect(validateDraft(workspace.drafts[0]).error).toContain("이름");
  });
  it("isolates drafts by account, project, demo and reset generation", () => {
    const keys = [
      draftStorageKey("demo", "a", 0),
      draftStorageKey("live", "a", 0),
      draftStorageKey("live", "b", 0),
      draftStorageKey("live", "a", 1),
    ];
    expect(new Set(keys).size).toBe(4);
    expect(parseWorkspace(null)).toEqual(emptyWorkspace());
    expect(() => parseWorkspace('{"version":2}')).toThrow();
    expect(() => parseWorkspace("bad json")).toThrow();
  });
  it("validates coordinates and numeric fields before returning a save payload", () => {
    expect(validateDraft({ ...treasure("draft"), lat: null }).error).toContain(
      "위도",
    );
    expect(validateDraft({ ...treasure("draft"), radius: 3 }).error).toContain(
      "반경",
    );
    const original = treasure("draft");
    expect(
      validateDraft({ ...original, name: "  수정  ", original }).value,
    ).toEqual({ ...original, name: "수정", original });
  });
});

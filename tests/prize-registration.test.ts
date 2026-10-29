import { describe, expect, it } from "vitest";
import {
  PRIZE_PLAN,
  prizeInventory,
  TOTAL_PRIZE_QUANTITY,
  type TreasureKind,
} from "../shared/prizes";
import { makeSeed } from "../shared/seed";
import { mutate } from "../shared/mutate";
import { actionInput, type TreasureInput } from "../shared/validation";
import { registrationValues } from "../shared/treasure-registration";
import { participantView } from "../shared/exploration";
import { claimTreasure } from "../shared/game";
import {
  emptyWorkspace,
  parseWorkspace,
  validateDraft,
} from "../src/lib/treasure-drafts";
import type { TreasureSecrets } from "../shared/types";

const prize = (
  id: string,
  prizeAmount: TreasureInput["prizeAmount"],
  kind: TreasureKind = prizeAmount === 0 ? "bomb" : "treasure",
): TreasureInput => ({
  id,
  name: `보물 ${id}`,
  hint: "",
  lat: 37.3,
  lng: 127.1,
  points: 100,
  radius: 10,
  kind,
  ...(prizeAmount !== undefined ? { prizeAmount } : {}),
});
function setup() {
  const state = makeSeed(true);
  state.treasures = [];
  const secrets: TreasureSecrets = {};
  const save = (treasures: (TreasureInput & { original?: TreasureInput })[]) =>
    mutate(
      state,
      secrets,
      "dave.h",
      actionInput.parse({
        action: "saveTreasures",
        resetGeneration: 0,
        treasures,
      }),
      "id",
    );
  return { state, secrets, save };
}

describe("prize inventory registration", () => {
  it("registers 95 cash prizes, 50 blanks and 50 cheers worth 500,000 won", () => {
    const { state, secrets, save } = setup();
    save(
      PRIZE_PLAN.flatMap((p) =>
        Array.from({ length: p.quantity }, (_, index) =>
          prize(`${p.kind}-${p.amount}-${index}`, p.amount, p.kind),
        ),
      ),
    );
    expect(state.treasures).toHaveLength(195);
    expect(TOTAL_PRIZE_QUANTITY).toBe(195);
    expect(
      state.treasures.filter((t) => (t.prizeAmount ?? 0) > 0),
    ).toHaveLength(95);
    expect(
      state.treasures.reduce((sum, t) => sum + (t.prizeAmount ?? 0), 0),
    ).toBe(500000);
    expect(
      prizeInventory(state.treasures, secrets).every((p) => p.remaining === 0),
    ).toBe(true);
  });
  it("rejects oversubscribed batches and legacy single saves without partial writes", () => {
    const { state, secrets, save } = setup();
    save([prize("first", 50000)]);
    const before = structuredClone({ state, secrets });
    expect(() => save([prize("ok", 1000), prize("excess", 50000)])).toThrow(
      "50,000원",
    );
    expect({ state, secrets }).toEqual(before);
    expect(() =>
      mutate(
        state,
        secrets,
        "dave.h",
        actionInput.parse({
          action: "saveTreasure",
          treasure: prize("legacy", 50000),
        }),
        "id",
      ),
    ).toThrow("50,000원");
    expect({ state, secrets }).toEqual(before);
  });
  it("deducts once on retry, still counts a discovered prize and reveals its amount only after discovery", () => {
    const { state, secrets, save } = setup();
    const t = prize("one", 50000);
    save([t]);
    const visible = participantView(state).treasures[0];
    expect(visible).not.toHaveProperty("prizeAmount");
    expect(visible).not.toHaveProperty("lat");
    expect(visible).not.toHaveProperty("kind");
    save([t]);
    const now = Date.now();
    const result = claimTreasure(
      state,
      secrets,
      "alex.k",
      t.id,
      { lat: t.lat, lng: t.lng, accuracy: 5, timestamp: now },
      now,
    );
    expect(result).toMatchObject({
      prizeAmount: 50000,
      points: 100,
      outcome: "treasure",
    });
    save([t]);
    expect(state.treasures).toHaveLength(1);
    expect(state.members["alex.k"].score).toBe(100);
    expect(prizeInventory(state.treasures)[0].remaining).toBe(0);
    expect(participantView(state).treasures[0].prizeAmount).toBe(50000);
  });
  it("allows an atomic denomination swap and restores stock when a registration is deleted", () => {
    const { state, secrets, save } = setup();
    save([prize("a", 50000), prize("b", 30000)]);
    const [a, b] = state.treasures.map((t) =>
      registrationValues(t, secrets[t.id]),
    );
    save([
      { ...a, prizeAmount: 30000, original: a },
      { ...b, prizeAmount: 50000, original: b },
    ]);
    expect(prizeInventory(state.treasures)[0].remaining).toBe(0);
    mutate(
      state,
      secrets,
      "dave.h",
      { action: "deleteTreasure", id: "b" },
      "id",
    );
    expect(prizeInventory(state.treasures)[0].remaining).toBe(1);
  });
  it("assigns an existing unpriced treasure without duplicating it and preserves amount in restored edit drafts", () => {
    const { state, secrets, save } = setup();
    save([prize("legacy", undefined)]);
    expect(prizeInventory(state.treasures)[0].remaining).toBe(1);
    const original = registrationValues(state.treasures[0], "treasure");
    save([{ ...original, prizeAmount: 50000, original }]);
    expect(state.treasures).toHaveLength(1);
    expect(prizeInventory(state.treasures)[0].remaining).toBe(0);
    const saved = registrationValues(state.treasures[0], secrets.legacy);
    const restored = parseWorkspace(
      JSON.stringify({
        ...emptyWorkspace(),
        drafts: [{ ...saved, original: saved }],
      }),
    );
    expect(validateDraft(restored.drafts[0]).value?.prizeAmount).toBe(50000);
    expect(() =>
      save([{ ...saved, prizeAmount: undefined, original: saved }]),
    ).toThrow("금액을 유지");
    expect(() => save([{ ...saved, hint: "old client", original }])).toThrow(
      "원본",
    );
  });
  it("validates denomination and kind, enforces fifty blanks and keeps them secret", () => {
    const { state, secrets, save } = setup();
    expect(() =>
      actionInput.parse({
        action: "saveTreasure",
        treasure: { ...prize("x", 1000), prizeAmount: 7000 },
      }),
    ).toThrow();
    expect(() => save([{ ...prize("x", 1000), kind: "bomb" }])).toThrow("종류");
    expect(() => save([{ ...prize("x", 0), kind: "treasure" }])).toThrow(
      "종류",
    );
    expect(state.treasures).toHaveLength(0);
    save(Array.from({ length: 50 }, (_, i) => prize(`blank-${i}`, 0)));
    expect(() => save([prize("extra", 0)])).toThrow("꽝");
    expect(participantView(state).treasures[0]).not.toHaveProperty(
      "prizeAmount",
    );
    const now = Date.now();
    const result = claimTreasure(
      state,
      secrets,
      "alex.k",
      "blank-0",
      { lat: 37.3, lng: 127.1, accuracy: 5, timestamp: now },
      now,
    );
    expect(result).toMatchObject({
      prizeAmount: 0,
      points: 0,
      outcome: "bomb",
      blockedUntil: now + 300000,
    });
  });

  it("keeps zero-won cheer stock separate, rejects overbooking and supports atomic kind swaps", () => {
    const { state, secrets, save } = setup();
    save([
      ...Array.from({ length: 50 }, (_, i) => prize(`blank-${i}`, 0)),
      ...Array.from({ length: 50 }, (_, i) => prize(`cheer-${i}`, 0, "cheer")),
    ]);
    const inventory = () =>
      prizeInventory(state.treasures, secrets).filter((p) => p.amount === 0);
    expect(inventory()).toEqual([
      expect.objectContaining({ kind: "bomb", placed: 50, remaining: 0 }),
      expect.objectContaining({ kind: "cheer", placed: 50, remaining: 0 }),
    ]);
    const before = structuredClone({ state, secrets });
    expect(() => save([prize("extra-cheer", 0, "cheer")])).toThrow("응원");
    expect({ state, secrets }).toEqual(before);
    const blank = registrationValues(state.treasures[0], "bomb");
    const cheer = registrationValues(state.treasures[50], "cheer");
    expect(() => save([{ ...blank, kind: "cheer", original: blank }])).toThrow(
      "응원",
    );
    expect({ state, secrets }).toEqual(before);
    save([
      { ...blank, kind: "cheer", original: blank },
      { ...cheer, kind: "bomb", original: cheer },
    ]);
    expect(secrets[blank.id]).toBe("cheer");
    expect(secrets[cheer.id]).toBe("bomb");
    expect(inventory().map((p) => p.placed)).toEqual([50, 50]);
    mutate(
      state,
      secrets,
      "dave.h",
      { action: "deleteTreasure", id: blank.id },
      "unused",
    );
    expect(inventory().map((p) => p.remaining)).toEqual([0, 1]);
  });

  it("reveals an encouragement without points or a rest and immediately permits another discovery", () => {
    const { state, secrets, save } = setup();
    const cheer = prize("cheer", 0, "cheer");
    const cash = prize("cash", 1000);
    save([cheer, cash]);
    const hidden = participantView(state).treasures.find(
      (t) => t.id === cheer.id,
    )!;
    for (const field of ["outcome", "prizeAmount", "kind", "lat", "lng"])
      expect(hidden).not.toHaveProperty(field);
    const now = Date.now();
    const position = {
      lat: cheer.lat,
      lng: cheer.lng,
      accuracy: 5,
      timestamp: now,
    };
    const result = claimTreasure(
      state,
      secrets,
      "alex.k",
      cheer.id,
      position,
      now,
    );
    expect(result).toEqual({
      outcome: "cheer",
      prizeAmount: 0,
      points: 0,
      blockedUntil: 0,
    });
    expect(state.members["alex.k"]).toMatchObject({
      score: 0,
      found: 0,
      blockedUntil: 0,
    });
    expect(
      participantView(state).treasures.find((t) => t.id === cheer.id),
    ).toMatchObject({ outcome: "cheer", prizeAmount: 0, foundBy: "alex.k" });
    save([cheer]);
    expect(
      prizeInventory(state.treasures, secrets).find((p) => p.kind === "cheer")
        ?.remaining,
    ).toBe(49);
    expect(() =>
      claimTreasure(state, secrets, "ryan.j", cheer.id, position, now),
    ).toThrow("발견");
    expect(
      claimTreasure(state, secrets, "alex.k", cash.id, position, now),
    ).toMatchObject({ outcome: "treasure", points: 100, blockedUntil: 0 });
    mutate(
      state,
      secrets,
      "dave.h",
      { action: "deleteTreasure", id: cheer.id },
      "unused",
    );
    expect(state.members["alex.k"]).toMatchObject({
      score: 100,
      found: 1,
      blockedUntil: 0,
    });
    expect(
      prizeInventory(state.treasures, secrets).find((p) => p.kind === "cheer")
        ?.remaining,
    ).toBe(50);
  });

  it("requires zero won for cheers and preserves their kind in stored drafts", () => {
    const { state, save } = setup();
    for (const amount of [undefined, 1000] as const)
      expect(() => save([prize("invalid", amount, "cheer")])).toThrow("종류");
    expect(state.treasures).toHaveLength(0);
    const cheer = prize("cheer", 0, "cheer");
    const restored = parseWorkspace(
      JSON.stringify({
        ...emptyWorkspace(),
        drafts: [{ ...cheer, original: cheer }],
      }),
    );
    expect(validateDraft(restored.drafts[0]).value).toMatchObject({
      kind: "cheer",
      prizeAmount: 0,
      original: { kind: "cheer", prizeAmount: 0 },
    });
  });
});

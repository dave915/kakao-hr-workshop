import { describe, expect, it } from "vitest";
import { PRIZE_PLAN, prizeInventory } from "../shared/prizes";
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
): TreasureInput => ({
  id,
  name: `보물 ${id}`,
  hint: "",
  lat: 37.3,
  lng: 127.1,
  points: 100,
  radius: 10,
  kind: prizeAmount === 0 ? "bomb" : "treasure",
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
  it("registers exactly the requested 100 prizes worth 500,000 won", () => {
    const { state, save } = setup();
    save(
      PRIZE_PLAN.flatMap((p) =>
        Array.from({ length: p.quantity }, (_, index) =>
          prize(`${p.amount}-${index}`, p.amount),
        ),
      ),
    );
    expect(state.treasures).toHaveLength(100);
    expect(
      state.treasures.reduce((sum, t) => sum + (t.prizeAmount ?? 0), 0),
    ).toBe(500000);
    expect(
      prizeInventory(state.treasures).every((p) => p.remaining === 0),
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
  it("validates denomination and kind, enforces the five blanks and keeps them secret", () => {
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
    save(Array.from({ length: 5 }, (_, i) => prize(`blank-${i}`, 0)));
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
});

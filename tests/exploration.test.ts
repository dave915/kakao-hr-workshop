import { describe, it, expect } from "vitest";
import { makeSeed, demoSecrets } from "../shared/seed";
import {
  participantView,
  treasureGuidance,
  bearingDegrees,
  approachTrend,
  hasCoordinates,
} from "../shared/exploration";
import { claimTreasure, distanceMeters } from "../shared/game";
import { mutate } from "../shared/mutate";
import { actionInput } from "../shared/validation";
const now = Date.parse("2026-10-16T13:10:00+09:00");
const point = (lat = 37.5445, lng = 127.0374) => ({
  lat,
  lng,
  accuracy: 5,
  timestamp: now,
});
describe("hint-led exploration", () => {
  it("removes every hidden coordinate and trap outcome from the participant payload without modifying the canonical state", () => {
    const state = makeSeed(true);
    const projected = participantView(state);
    expect(
      projected.treasures.every(
        (t) =>
          !hasCoordinates(t) &&
          !("outcome" in t) &&
          !("lat" in t) &&
          !("lng" in t),
      ),
    ).toBe(true);
    expect(projected.treasures[0].hint).toBe(state.treasures[0].hint);
    expect(state.treasures[0].lat).toBeDefined();
  });
  it("publishes coordinates only after a server-validated discovery", () => {
    const state = makeSeed(true);
    claimTreasure(state, demoSecrets, "dave.h", "t1", point(), now);
    const view = participantView(state);
    expect(view.treasures.filter(hasCoordinates).map((t) => t.id)).toEqual([
      "t1",
    ]);
    expect(view.treasures[0].foundBy).toBe("dave.h");
  });
  it("reveals locations only during an open game and hides them again on pause without exposing prizes or outcomes", () => {
    const state = makeSeed(true);
    state.members["june.p"].role = "admin";
    state.treasures[0].prizeAmount = 10000;
    for (const [gameOpen, enabled] of [
      [false, true],
      [true, true],
      [false, true],
      [true, true],
      [true, false],
      [false, false],
    ]) {
      mutate(
        state,
        demoSecrets,
        "june.p",
        actionInput.parse({
          action: "saveSettings",
          settings: {
            ...state.settings,
            gameOpen,
            showTreasureLocations: enabled,
          },
        }),
        "settings",
        now,
      );
      const view = participantView(state);
      expect(view.settings.showTreasureLocations).toBe(enabled);
      for (const treasure of view.treasures) {
        expect(hasCoordinates(treasure)).toBe(gameOpen && enabled);
        expect("lat" in treasure).toBe(gameOpen && enabled);
        expect("lng" in treasure).toBe(gameOpen && enabled);
        expect(treasure).not.toHaveProperty("prizeAmount");
        expect(treasure).not.toHaveProperty("outcome");
        expect(treasure).not.toHaveProperty("kind");
        if (gameOpen && enabled) {
          const original = state.treasures.find((t) => t.id === treasure.id)!;
          expect(treasure).toMatchObject({
            lat: original.lat,
            lng: original.lng,
          });
        }
      }
    }
    expect(state.treasures[0].prizeAmount).toBe(10000);
  });
  it("keeps legacy settings private and rejects participant changes to visibility", () => {
    const state = makeSeed(true);
    delete state.settings.showTreasureLocations;
    expect(participantView(state).treasures.some(hasCoordinates)).toBe(false);
    expect(() =>
      mutate(
        state,
        demoSecrets,
        "alex.k",
        actionInput.parse({
          action: "saveSettings",
          settings: { ...state.settings, showTreasureLocations: true },
        }),
        "settings",
        now,
      ),
    ).toThrow("추진위원회");
    expect(participantView(state).treasures.some(hasCoordinates)).toBe(false);
  });
  it("returns north-up cardinal guidance without the exact target location or kind", () => {
    const state = makeSeed(true);
    const g = treasureGuidance(state, "alex.k", "t1", point(37.5405), now);
    expect(g.direction).toBe("북쪽");
    expect(g.bearing).toBe(0);
    expect(g.distance % 10).toBe(0);
    expect(g).not.toHaveProperty("lat");
    expect(g).not.toHaveProperty("lng");
    expect(g).not.toHaveProperty("kind");
    expect(bearingDegrees({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(
      90,
    );
  });
  it("gets warmer as the explorer approaches and confirms the actual claim radius", () => {
    const state = makeSeed(true);
    const distances = [0.006, 0.002, 0.0008, 0.0002, 0].map((offset) =>
      treasureGuidance(state, "alex.k", "t1", point(37.5445 - offset), now),
    );
    expect(distances.map((g) => g.heat)).toEqual([15, 35, 60, 85, 100]);
    expect(distances.at(-1)).toMatchObject({
      withinRange: true,
      bearing: null,
      direction: "주변",
    });
  });
  it.each([10, 50, 200])(
    "switches to camera-only at radius %sm + 20m without widening the claim radius",
    (radius) => {
      const state = makeSeed(true);
      const target = state.treasures[0];
      target.radius = radius;
      const atDistance = (meters: number) =>
        point(target.lat - (meters / 6371000) * (180 / Math.PI), target.lng);
      const outside = treasureGuidance(
        state,
        "alex.k",
        "t1",
        atDistance(radius + 20.1),
        now,
      );
      const inside = treasureGuidance(
        state,
        "alex.k",
        "t1",
        atDistance(radius + 19.9),
        now,
      );
      // Both round to the same displayed distance; use the real distance for the cutoff.
      expect(outside.distance).toBe(inside.distance);
      expect(outside).toMatchObject({
        cameraOnly: false,
        bearing: 0,
        withinRange: false,
      });
      expect(inside).toMatchObject({
        cameraOnly: true,
        bearing: null,
        direction: "주변",
        withinRange: false,
      });
      expect(() =>
        claimTreasure(
          state,
          demoSecrets,
          "alex.k",
          "t1",
          atDistance(radius + 1),
          now,
        ),
      ).toThrow(`${radius}m`);
      expect(
        treasureGuidance(state, "alex.k", "t1", atDistance(radius - 0.1), now),
      ).toMatchObject({ cameraOnly: true, bearing: null, withinRange: true });
      // An exactly equal distance belongs to camera search, including custom radii.
      const boundary = atDistance(radius + 20);
      target.radius = distanceMeters(boundary, target) - 20;
      expect(
        treasureGuidance(state, "alex.k", "t1", boundary, now).cameraOnly,
      ).toBe(true);
    },
  );
  it("does not guide users toward already found, paused or locked targets", () => {
    const state = makeSeed(true);
    state.treasures[0].foundBy = "june.p";
    expect(() => treasureGuidance(state, "alex.k", "t1", point(), now)).toThrow(
      "먼저 발견",
    );
    state.treasures[0].foundBy = null;
    state.settings.gameOpen = false;
    expect(() => treasureGuidance(state, "alex.k", "t1", point(), now)).toThrow(
      "준비 중",
    );
    state.settings.gameOpen = true;
    state.members["alex.k"].blockedUntil = now + 10000;
    expect(() => treasureGuidance(state, "alex.k", "t1", point(), now)).toThrow(
      "휴식",
    );
  });
  it("rejects stale and inaccurate GPS fixes", () => {
    const state = makeSeed(true);
    for (const p of [
      { ...point(), timestamp: now - 60001 },
      { ...point(), accuracy: 101 },
      { ...point(), lat: NaN },
    ])
      expect(() => treasureGuidance(state, "alex.k", "t1", p, now)).toThrow();
  });
  it("ignores GPS noise when reporting progress", () => {
    const g = treasureGuidance(
      makeSeed(true),
      "alex.k",
      "t1",
      point(37.5405),
      now,
    );
    expect(approachTrend(g, { ...g, distance: g.distance - 10 }, 20)).toBe(
      "steady",
    );
    expect(approachTrend(g, { ...g, distance: g.distance - 40 }, 10)).toBe(
      "closer",
    );
    expect(approachTrend(g, { ...g, distance: g.distance + 40 }, 10)).toBe(
      "farther",
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  cameraBasis,
  devicePose,
  projectArTarget,
  angleDifference,
} from "../shared/ar";
import { arGuidance, participantView } from "../shared/exploration";
import { makeSeed } from "../shared/seed";
import { actionInput } from "../shared/validation";

const now = Date.parse("2026-10-16T13:10:00+09:00");
const origin = { lat: 37.5443, lng: 127.0374 };
const target = { lat: 37.5445, lng: 127.0374 };
const portrait = {
  width: 390,
  height: 500,
  videoWidth: 720,
  videoHeight: 1280,
  screenAngle: 0,
};
const north = { alpha: 0, beta: 90, gamma: 0, updatedAt: now };
const point = (offset = 0) => ({
  lat: target.lat - offset,
  lng: target.lng,
  accuracy: 5,
  timestamp: now,
});

describe("location AR projection", () => {
  it("projects the actual coordinate ahead and shifts with physical movement", () => {
    const center = projectArTarget(origin, target, north, portrait)!;
    expect(center.visible).toBe(true);
    expect(center.x).toBeCloseTo(195);
    expect(center.y).toBeGreaterThan(250);
    const moved = projectArTarget(
      { ...origin, lng: origin.lng + 0.00002 },
      target,
      north,
      portrait,
    )!;
    expect(moved.x).toBeLessThan(center.x);
    const closer = projectArTarget(
      { ...origin, lat: origin.lat + 0.0001 },
      target,
      north,
      portrait,
    )!;
    expect(closer.distance).toBeLessThan(center.distance);
    expect(closer.size).toBeGreaterThanOrEqual(center.size);
  });
  it("moves the world target across the view when the phone turns or tilts", () => {
    const center = projectArTarget(origin, target, north, portrait)!;
    expect(
      projectArTarget(origin, target, { ...north, alpha: 10 }, portrait)!.x,
    ).toBeGreaterThan(center.x);
    expect(
      projectArTarget(origin, target, { ...north, alpha: 350 }, portrait)!.x,
    ).toBeLessThan(center.x);
    expect(
      projectArTarget(origin, target, { ...north, beta: 70 }, portrait)!.y,
    ).toBeLessThan(center.y);
  });
  it("hides offscreen and behind-camera treasure and returns a turn cue", () => {
    const east = projectArTarget(
      origin,
      target,
      { ...north, alpha: 270 },
      portrait,
    )!;
    expect(east.visible).toBe(false);
    expect(east.cue).toBe("left");
    expect(
      projectArTarget(origin, target, { ...north, alpha: 180 }, portrait)!
        .visible,
    ).toBe(false);
    expect(
      projectArTarget(origin, target, { ...north, beta: 0 }, portrait)!.visible,
    ).toBe(false);
  });
  it("preserves the camera basis in landscape and respects video cover cropping", () => {
    const rotated = { ...north, alpha: 90, beta: 0, gamma: -90 };
    const basis = cameraBasis(rotated, 90);
    expect(basis.right[0]).toBeCloseTo(1);
    expect(basis.up[2]).toBeCloseTo(1);
    expect(basis.forward[1]).toBeCloseTo(1);
    const p = projectArTarget(origin, target, rotated, {
      ...portrait,
      width: 844,
      height: 300,
      videoWidth: 1280,
      videoHeight: 720,
      screenAngle: 90,
    })!;
    expect(p.x).toBeCloseTo(422);
    expect(p.visible).toBe(true);
    expect(
      projectArTarget(origin, target, north, { ...portrait, videoWidth: 0 }),
    ).toBeNull();
  });
  it("uses the shortest turn across the north boundary", () => {
    expect(angleDifference(1, 359)).toBe(2);
    expect(angleDifference(359, 1)).toBe(-2);
  });
  it("accepts north-referenced Android and Safari readings including north=0", () => {
    expect(devicePose({ ...north, absolute: true }, now)).toEqual(north);
    expect(
      devicePose(
        {
          alpha: 123,
          beta: 90,
          gamma: 0,
          absolute: false,
          webkitCompassHeading: 0,
          webkitCompassAccuracy: 10,
        },
        now,
      ),
    ).toEqual(north);
    const safari = devicePose(
      {
        alpha: 123,
        beta: 90,
        gamma: 0,
        absolute: false,
        webkitCompassHeading: 90,
      },
      now,
    )!;
    expect(cameraBasis(safari).heading).toBeCloseTo(90);
  });
  it("refuses relative orientation, missing angles and unreliable compass readings", () => {
    for (const reading of [
      { ...north, absolute: false },
      { ...north, absolute: true, alpha: null },
      { ...north, absolute: true, beta: null },
      { ...north, absolute: true, gamma: NaN },
      {
        ...north,
        absolute: false,
        webkitCompassHeading: 15,
        webkitCompassAccuracy: -1,
      },
      {
        ...north,
        absolute: false,
        webkitCompassHeading: 15,
        webkitCompassAccuracy: 45,
      },
    ])
      expect(devicePose(reading, now)).toBeNull();
  });
});

describe("server-controlled AR target access", () => {
  it("reveals only the selected nearby anchor and never its outcome", () => {
    const state = makeSeed(true);
    const before = structuredClone(state);
    const result = arGuidance(state, "alex.k", "t1", point(0.0002), now);
    expect(result.arTarget).toEqual({
      treasureId: "t1",
      ...target,
      visibilityRange: 100,
      updatedAt: now,
    });
    expect(result.arTarget).not.toHaveProperty("outcome");
    expect(result.arTarget).not.toHaveProperty("kind");
    expect(state).toEqual(before);
    expect(
      participantView(state).treasures.every(
        (t) => t.lat === undefined && t.lng === undefined,
      ),
    ).toBe(true);
  });
  it("returns clue guidance without any anchor for a distant target", () => {
    const result = arGuidance(
      makeSeed(true),
      "alex.k",
      "t1",
      point(0.006),
      now,
    );
    expect(result.arTarget).toBeNull();
    expect(result.guidance?.direction).toBe("북쪽");
    expect(JSON.stringify(result)).not.toContain('"lat"');
  });
  it("rejects missing members, discovered targets, paused games and bomb locks", () => {
    expect(() =>
      arGuidance(makeSeed(true), "missing", "t1", point(), now),
    ).toThrow();
    const state = makeSeed(true);
    state.treasures[0].foundBy = "dave.h";
    expect(() => arGuidance(state, "alex.k", "t1", point(), now)).toThrow(
      "먼저 발견",
    );
    state.treasures[0].foundBy = null;
    state.settings.gameOpen = false;
    expect(() => arGuidance(state, "alex.k", "t1", point(), now)).toThrow(
      "준비 중",
    );
    state.settings.gameOpen = true;
    state.members["alex.k"].blockedUntil = now + 1000;
    expect(() => arGuidance(state, "alex.k", "t1", point(), now)).toThrow(
      "휴식",
    );
  });
  it("requires fresh and sufficiently accurate GPS for AR", () => {
    for (const p of [
      { ...point(), accuracy: 41 },
      { ...point(), timestamp: now - 20001 },
      { ...point(), timestamp: now + 20001 },
    ])
      expect(() =>
        arGuidance(makeSeed(true), "alex.k", "t1", p, now),
      ).toThrow();
    expect(
      actionInput.safeParse({
        action: "getArTarget",
        treasureId: "t1",
        position: point(),
      }).success,
    ).toBe(true);
    expect(
      actionInput.safeParse({
        action: "getArTarget",
        treasureId: "t1",
        position: { ...point(), lat: Infinity },
      }).success,
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  advanceLiquidTab,
  targetLiquidTab,
  type LiquidTabMotion,
} from "../src/lib/liquid-tab-motion";

const create = (): LiquidTabMotion => ({
  x: 0,
  target: 0,
  velocity: 0,
  selectionScale: 1,
  lift: 0,
  liftVelocity: 0,
  sx: 1,
  sy: 1,
});
const bounds = (width = 390) => ({
  step: (width - 34) / 5,
  max: (4 * (width - 34)) / 5,
  left: 17,
  center: width / 2,
  viewportWidth: width,
});

describe("liquid tab lens", () => {
  it("lifts on a stationary press, before any drag or navigation", () => {
    const state = create();
    for (let i = 0; i < 15; i++)
      advanceLiquidTab(state, bounds(), true, false, 1 / 60);
    expect(state.x).toBe(0);
    expect(state.lift).toBeGreaterThan(0.95);
    expect(state.sy).toBeGreaterThan(1.3);
    expect(state.sx).toBeGreaterThan(1.1);
  });
  it("follows the pointer as a raised lens and fully flattens on release", () => {
    const state = create();
    state.target = bounds().step * 2.4;
    for (let i = 0; i < 12; i++)
      advanceLiquidTab(state, bounds(), true, false, 1 / 60, true);
    expect(state.x).toBeGreaterThan(state.target * 0.9);
    expect(state.sy).toBeGreaterThan(1);
    state.target = bounds().step * 2;
    let moving = true;
    for (let i = 0; i < 60 && moving; i++)
      moving = advanceLiquidTab(state, bounds(), false, false, 1 / 60);
    expect(moving).toBe(false);
    expect(state).toMatchObject({
      x: state.target,
      lift: 0,
      liftVelocity: 0,
      velocity: 0,
      sx: 1,
      sy: 1,
    });
  });
  it.each([320, 390, 430, 500])(
    "keeps a quick reversal inside a %ipx viewport",
    (width) => {
      const box = bounds(width),
        state = create();
      state.x = state.target = box.step * 2;
      for (const target of [box.max, 0, box.max, 0]) {
        state.target = target;
        for (let i = 0; i < 30; i++) {
          advanceLiquidTab(state, box, true, false, 1 / 60, true);
          const scale = 1 + state.lift * 0.04;
          const center =
            box.center +
            (box.left + box.step / 2 + state.x - box.center) * scale;
          const half = (box.step * state.sx * scale) / 2;
          expect(center - half).toBeGreaterThanOrEqual(1.99);
          expect(center + half).toBeLessThanOrEqual(width - 1.99);
        }
      }
    },
  );
  it("preserves position feedback without magnification in reduced motion", () => {
    const state = {
      ...create(),
      x: 20,
      target: 170,
      lift: 1,
      sx: 1.2,
      sy: 1.38,
    };
    expect(advanceLiquidTab(state, bounds(), true, true, 1 / 60)).toBe(false);
    expect(state).toMatchObject({ x: 170, lift: 0, velocity: 0, sx: 1, sy: 1 });
  });
  it("keeps follow timing consistent at 60Hz and 120Hz", () => {
    const a = create(),
      b = create();
    a.target = b.target = 200;
    for (let i = 0; i < 6; i++)
      advanceLiquidTab(a, bounds(), true, false, 1 / 60, true);
    for (let i = 0; i < 12; i++)
      advanceLiquidTab(b, bounds(), true, false, 1 / 120, true);
    expect(a.x).toBeCloseTo(b.x, 5);
    expect(a.lift).toBeCloseTo(b.lift, 5);
  });
  it("gives a first-to-last tap more travel time than a neighboring tap", () => {
    const box = bounds();
    function arrival(index: number) {
      const state = create();
      const target = box.step * index;
      targetLiquidTab(state, target, box.step);
      for (let frame = 1; frame <= 120; frame++) {
        // Pointer-up and the ensuing route update must not shorten the trip.
        if (frame === 5) targetLiquidTab(state, target, box.step);
        advanceLiquidTab(state, box, frame < 5, false, 1 / 60);
        if (state.x >= target * 0.99) return frame / 60;
      }
      throw new Error("Selection did not arrive");
    }
    const near = arrival(1),
      far = arrival(4);
    expect(near).toBeLessThan(0.3);
    expect(far).toBeGreaterThan(near * 1.65);
    expect(far).toBeGreaterThan(0.35);
    expect(far).toBeLessThan(0.5);
  });
  it("still follows a drag promptly during a slow selection trip", () => {
    const state = create(),
      box = bounds();
    targetLiquidTab(state, box.max, box.step);
    for (let i = 0; i < 6; i++)
      advanceLiquidTab(state, box, true, false, 1 / 60);
    expect(state.x).toBeLessThan(box.max / 2);
    for (let i = 0; i < 9; i++)
      advanceLiquidTab(state, box, true, false, 1 / 60, true);
    expect(state.x).toBeGreaterThan(box.max * 0.95);
  });
  it("can reverse a long tap immediately and settle on the new selection", () => {
    const state = create(),
      box = bounds();
    targetLiquidTab(state, box.max, box.step);
    for (let i = 0; i < 8; i++)
      advanceLiquidTab(state, box, false, false, 1 / 60);
    const previousX = state.x;
    targetLiquidTab(state, 0, box.step);
    expect(state.x).toBe(previousX);
    let moving = true;
    for (let i = 0; i < 60 && moving; i++) {
      moving = advanceLiquidTab(state, box, false, false, 1 / 60);
      expect(state.x).toBeGreaterThanOrEqual(0);
      expect(state.x).toBeLessThanOrEqual(box.max);
    }
    expect(moving).toBe(false);
    expect(state.x).toBe(0);
  });
});

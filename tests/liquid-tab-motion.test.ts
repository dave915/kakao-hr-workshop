import { describe, expect, it } from "vitest";
import {
  advanceLiquidTab,
  type LiquidTabMotion,
} from "../src/lib/liquid-tab-motion";

const create = (): LiquidTabMotion => ({
  x: 0,
  target: 0,
  velocity: 0,
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
      advanceLiquidTab(state, bounds(), true, false, 1 / 60);
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
          advanceLiquidTab(state, box, true, false, 1 / 60);
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
      advanceLiquidTab(a, bounds(), true, false, 1 / 60);
    for (let i = 0; i < 12; i++)
      advanceLiquidTab(b, bounds(), true, false, 1 / 120);
    expect(a.x).toBeCloseTo(b.x, 5);
    expect(a.lift).toBeCloseTo(b.lift, 5);
  });
});

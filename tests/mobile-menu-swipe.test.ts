import { describe, expect, it } from "vitest";
import { createMobileMenuSwipe } from "../src/lib/mobile-menu-swipe";
const at = (x: number, y = 300, id = 1) => ({ id, x, y });

describe("mobile menu swipe", () => {
  it("opens once for a deliberate right swipe and supports a fresh gesture afterward", () => {
    const swipe = createMobileMenuSwipe();
    swipe.begin(at(60));
    expect(swipe.move(at(90, 304))).toBe(true);
    expect(swipe.end(at(180, 315))).toBe(true);
    expect(swipe.end(at(180, 315))).toBe(false);
    swipe.begin(at(90));
    expect(swipe.end(at(190))).toBe(true);
  });
  it("keeps taps, short drags, left swipes and reversals closed", () => {
    const swipe = createMobileMenuSwipe();
    for (const end of [at(100), at(140), at(20)]) {
      swipe.begin(at(100));
      expect(swipe.end(end)).toBe(false);
    }
    swipe.begin(at(100));
    swipe.move(at(200));
    expect(swipe.end(at(110))).toBe(false);
  });
  it("never converts a vertical scroll into menu navigation", () => {
    const swipe = createMobileMenuSwipe();
    swipe.begin(at(60));
    expect(swipe.move(at(66, 330))).toBe(false);
    expect(swipe.end(at(200, 335))).toBe(false);
    swipe.begin(at(60));
    expect(swipe.end(at(160, 390))).toBe(false);
  });
  it("clears cancelled or interrupted gestures and accepts the next swipe", () => {
    const swipe = createMobileMenuSwipe();
    swipe.begin(at(50));
    swipe.move(at(170));
    swipe.cancel();
    expect(swipe.end(at(200))).toBe(false);
    swipe.begin(at(70));
    expect(swipe.end(at(170))).toBe(true);
  });
  it("does not transfer an in-progress swipe to a second finger", () => {
    const swipe = createMobileMenuSwipe();
    swipe.begin(at(50));
    swipe.move(at(150));
    expect(swipe.move(at(170, 300, 2))).toBe(false);
    expect(swipe.end(at(190))).toBe(false);
  });
});

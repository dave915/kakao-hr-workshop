import { describe, expect, it } from "vitest";
import { prizeArt } from "../src/lib/prize-art";

describe("zero-won discovery artwork", () => {
  it("chooses the encouragement statue by outcome rather than the shared zero amount", () => {
    const cheer = prizeArt({ outcome: "cheer", prizeAmount: 0 });
    const bomb = prizeArt({ outcome: "bomb", prizeAmount: 0 });
    expect(cheer.src).not.toBe(bomb.src);
    expect(cheer.alt).toContain("석상");
    expect(bomb.alt).toContain("빈 보물상자");
    expect(prizeArt({ outcome: "cheer" })).toEqual(cheer);
  });
});

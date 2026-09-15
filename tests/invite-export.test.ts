import { afterEach, describe, expect, it, vi } from "vitest";
import { invitationTsv, copyPromisedText } from "../src/lib/invite-export";
import { continuousRotation } from "../shared/ar";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("spreadsheet invite export", () => {
  it("exports exactly English name and join link columns with headers and no lost handle suffix", () => {
    vi.stubEnv("BASE_URL", "/workshop/");
    vi.stubGlobal("location", { origin: "https://example.com" });
    expect(
      invitationTsv([
        { handle: "dave.h", code: "first" },
        { handle: "june.p", code: "second" },
      ]),
    ).toBe(
      "영문명\t참가링크\ndave.h\thttps://example.com/workshop/#/join/first\njune.p\thttps://example.com/workshop/#/join/second",
    );
  });
  it("neutralizes spreadsheet formulas without adding columns", () => {
    vi.stubEnv("BASE_URL", "/");
    vi.stubGlobal("location", { origin: "https://example.com" });
    const rows = invitationTsv([{ handle: "-demo", code: "secret" }]).split(
      "\n",
    );
    expect(rows[1].split("\t")).toEqual([
      "'-demo",
      "https://example.com/#/join/secret",
    ]);
  });
  it("starts writing during the user gesture before the server returns the links", async () => {
    class Item {
      constructor(public data: Record<string, Promise<Blob>>) {}
    }
    const write = vi.fn(async (items: Item[]) => {
      await items[0].data["text/plain"];
    });
    vi.stubGlobal("ClipboardItem", Item);
    vi.stubGlobal("navigator", { clipboard: { write } });
    let resolve!: (value: string) => void;
    const text = new Promise<string>((r) => {
      resolve = r;
    });
    const copying = copyPromisedText(text);
    expect(write).toHaveBeenCalledOnce();
    resolve("ready\tlink");
    await copying;
    expect(
      await (await write.mock.calls[0][0][0].data["text/plain"]).text(),
    ).toBe("ready\tlink");
  });
});
describe("large compass rotation", () => {
  it("crosses north and the rear direction without a full circle jump", () => {
    expect(continuousRotation(359, 1)).toBe(361);
    expect(continuousRotation(179, -179)).toBe(181);
    expect(continuousRotation(-179, 179)).toBe(-181);
    expect(continuousRotation(721, 359)).toBe(719);
  });
});

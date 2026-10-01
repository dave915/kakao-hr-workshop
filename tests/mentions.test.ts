import { describe, expect, it } from "vitest";
import {
  insertMention,
  mentionAtCaret,
  mentionCandidates,
} from "../shared/mentions";
import { makeSeed } from "../shared/seed";

describe("photo mention autocomplete", () => {
  const members = Object.values(makeSeed(true).members);
  it.each(["da", "DA", "Da", "dA", "DAVE.H"])(
    "matches names and handles without case sensitivity: %s",
    (query) => {
      expect(
        mentionCandidates(members, query).map((member) => member.handle),
      ).toEqual(["dave.h"]);
    },
  );
  it("shows the full roster for @, including the current user and more than six results", () => {
    const roster = [
      ...members,
      ...Array.from({ length: 40 }, (_, index) => ({
        ...members[0],
        id: `test-${index}`,
        handle: `person.${index}`,
      })),
    ];
    expect(mentionCandidates(roster, "")).toHaveLength(46);
    expect(mentionCandidates(members, "데이브")[0].handle).toBe("dave.h");
    expect(mentionCandidates(members, "not-a-member")).toEqual([]);
  });
  it("finds bare @ and a mention in the middle of a sentence", () => {
    expect(mentionAtCaret("@", 1)).toEqual({ start: 0, end: 1, query: "" });
    const value = "반가워요 @DA 내일 봐요";
    const caret = value.indexOf(" 내일");
    const range = mentionAtCaret(value, caret)!;
    expect(range.query).toBe("DA");
    expect(insertMention(value, range, "dave.h", 500)).toEqual({
      value: "반가워요 @dave.h 내일 봐요",
      caret: 13,
    });
  });
  it("replaces the whole token at the caret while preserving the surrounding text and punctuation", () => {
    const value = "(@ALex.k), @june.p";
    const range = mentionAtCaret(value, 4)!;
    expect(range.query).toBe("AL");
    expect(insertMention(value, range, "alex.k", 500)?.value).toBe(
      "(@alex.k), @june.p",
    );
  });
  it("does not suggest for emails, double @, or selected ranges", () => {
    expect(mentionAtCaret("mail@DA", 7)).toBeNull();
    expect(mentionAtCaret("@@DA", 4)).toBeNull();
    expect(mentionAtCaret("@DA", 1, 3)).toBeNull();
    expect(mentionAtCaret("@DA ", 4)).toBeNull();
  });
  it("adds a space at the end and respects the total text limit without truncating", () => {
    const range = mentionAtCaret("hi @DA", 6)!;
    expect(insertMention("hi @DA", range, "dave.h", 11)).toEqual({
      value: "hi @dave.h ",
      caret: 11,
    });
    expect(insertMention("hi @DA", range, "dave.h", 10)).toBeNull();
  });
});

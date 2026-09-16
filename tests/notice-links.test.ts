import { describe, expect, it } from "vitest";
import { noticeLinks } from "../src/lib/notice-links";

describe("notice links", () => {
  it("preserves multiline notices and links web addresses including query strings and fragments", () => {
    const body =
      "참여 링크: https://example.com/form?a=1&b=2#join\n안내 www.example.org.\n다시 만나요!";
    const parts = noticeLinks(body);
    expect(parts.map((part) => part.text).join("")).toBe(body);
    expect(parts.filter((part) => part.href).map((part) => part.href)).toEqual([
      "https://example.com/form?a=1&b=2#join",
      "https://www.example.org/",
    ]);
  });
  it("keeps sentence punctuation outside links and preserves balanced URL parentheses", () => {
    const body = "(https://example.com/a_(b)). https://example.com/안내!";
    const parts = noticeLinks(body);
    expect(parts.map((part) => part.text).join("")).toBe(body);
    expect(parts.filter((part) => part.href).map((part) => part.text)).toEqual([
      "https://example.com/a_(b)",
      "https://example.com/안내",
    ]);
  });
  it("does not turn invalid URLs or executable schemes into links", () => {
    const body =
      "javascript:alert(1) data:text/html,<script>alert(1)</script> https://";
    expect(noticeLinks(body)).toEqual([{ text: body }]);
    expect(noticeLinks("")).toEqual([]);
  });
});

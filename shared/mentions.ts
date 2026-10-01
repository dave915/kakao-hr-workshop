import type { Member } from "./types";
import { englishName } from "./names";

export interface MentionRange {
  start: number;
  end: number;
  query: string;
}

/** Locate the mention at the caret, without treating email addresses as mentions. */
export function mentionAtCaret(
  value: string,
  start: number,
  end = start,
): MentionRange | null {
  if (start !== end || start < 0 || start > value.length) return null;
  const match = value
    .slice(0, start)
    .match(/(?:^|[^\p{L}\p{N}_.@-])@([\p{L}\p{N}_.-]*)$/u);
  if (!match) return null;
  const suffix = value.slice(start).match(/^[\p{L}\p{N}_.-]*/u)?.[0] ?? "";
  return {
    start: start - match[1].length - 1,
    end: start + suffix.length,
    query: match[1],
  };
}

export function mentionCandidates(members: Member[], query: string) {
  const search = query.toLowerCase();
  return members
    .filter((member) =>
      [member.handle, member.name, englishName(member.handle)].some((name) =>
        name.toLowerCase().includes(search),
      ),
    )
    .sort((a, b) =>
      a.handle.localeCompare(b.handle, "en", { sensitivity: "base" }),
    );
}

export function insertMention(
  value: string,
  range: MentionRange,
  handle: string,
  maxLength: number,
) {
  const after = value.slice(range.end);
  const mention = `@${handle}`;
  const separator = !after || !/^[\s,!?;:，。！？)\]}]/u.test(after) ? " " : "";
  const next = value.slice(0, range.start) + mention + separator + after;
  if (next.length > maxLength) return null;
  return {
    value: next,
    caret:
      range.start +
      mention.length +
      separator.length +
      (/^[ \t]/.test(after) ? 1 : 0),
  };
}

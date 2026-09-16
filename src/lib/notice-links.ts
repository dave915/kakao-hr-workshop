export type NoticePart = { text: string; href?: string };

/** Keep notice text intact while turning web addresses into safe external links. */
export function noticeLinks(body: string): NoticePart[] {
  const parts: NoticePart[] = [];
  const pattern = /\b(?:https?:\/\/|www\.)[^\s<>"'“”‘’]+/gi;
  let cursor = 0;
  for (const match of body.matchAll(pattern)) {
    let text = match[0];
    // Leave sentence punctuation and unmatched closing brackets outside the link.
    while (text) {
      const last = text.at(-1)!;
      const opening = { ")": "(", "]": "[", "}": "{" }[last];
      if (/[.,!?;:。，！？]/.test(last)) text = text.slice(0, -1);
      else if (opening && text.split(last).length > text.split(opening).length)
        text = text.slice(0, -1);
      else break;
    }
    try {
      const url = new URL(/^www\./i.test(text) ? `https://${text}` : text);
      if (!url.hostname || !["http:", "https:"].includes(url.protocol))
        continue;
      if (match.index > cursor)
        parts.push({ text: body.slice(cursor, match.index) });
      parts.push({ text, href: url.href });
      cursor = match.index + text.length;
    } catch {
      // Invalid addresses stay plain text, just like the rest of the notice.
    }
  }
  if (cursor < body.length) parts.push({ text: body.slice(cursor) });
  return parts;
}

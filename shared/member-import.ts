import { memberInput } from "./validation";
import type { Member } from "./types";
export interface ImportRow {
  line: number;
  name: string;
  handle: string;
  team: string;
  error: string;
}
function cells(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((v) => v.trim());
  if (!line.includes(",")) {
    const [name = "", handle = "", ...team] = line.trim().split(/\s+/);
    return [name, handle, team.join(" ")];
  }
  const values: string[] = [];
  let value = "",
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else value += c;
  }
  if (quoted) return [];
  return [...values, value.trim()];
}
export function parseMemberImport(
  raw: string,
  existing: Record<string, Member>,
): ImportRow[] {
  const rows: ImportRow[] = [];
  const handles = new Set(
    Object.values(existing).map((m) => m.handle.toLowerCase()),
  );
  for (const [index, line] of raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .entries()) {
    if (!line.trim()) continue;
    const parts = cells(line);
    if (
      !rows.length &&
      ["이름", "성명", "name"].includes(parts[0]?.toLowerCase()) &&
      ["영문명", "아이디", "영문이름", "handle"].includes(
        parts[1]?.replace(/\s/g, "").toLowerCase(),
      )
    )
      continue;
    const [name = "", rawHandle = "", team = ""] = parts;
    const handle = rawHandle.toLowerCase();
    const checked = memberInput.safeParse({ name, handle, team });
    let error =
      parts.length !== 3
        ? "이름·영문명·팀명 3열을 확인해주세요."
        : !checked.success
          ? checked.error.issues
              .map(
                (i) =>
                  `${({ name: "이름", handle: "영문명", team: "팀명" } as Record<string, string>)[String(i.path[0])]}: ${i.message}`,
              )
              .join(" ")
          : "";
    if (!error && handles.has(handle)) error = "이미 등록된 영문명이에요.";
    if (!error && rows.some((r) => r.handle === handle))
      error = "붙여넣은 목록에 중복된 영문명이에요.";
    rows.push({ line: index + 1, name, handle, team, error });
  }
  if (rows.length > 100)
    rows[100].error = "한 번에 최대 100명까지 등록할 수 있어요.";
  if (rows.length + Object.keys(existing).length > 500 && rows[0])
    rows[0].error = "전체 참가자는 최대 500명까지 등록할 수 있어요.";
  return rows;
}

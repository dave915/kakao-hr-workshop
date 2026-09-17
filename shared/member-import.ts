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
  if (!line.includes(",")) return line.trim().split(/\s+/);
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
  let columns: 2 | 3 | undefined;
  const handleHeader = (value = "") =>
    ["영문명", "아이디", "영문이름", "handle"].includes(
      value.replace(/\s/g, "").toLowerCase(),
    );
  const teamHeader = (value = "") =>
    ["팀", "팀명", "team"].includes(value.replace(/\s/g, "").toLowerCase());
  const handles = new Set(
    Object.values(existing).map((m) => m.handle.toLowerCase()),
  );
  for (const [index, line] of raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .entries()) {
    if (!line.trim()) continue;
    let parts = cells(line);
    if (!rows.length && handleHeader(parts[0]) && teamHeader(parts[1])) {
      columns = 2;
      continue;
    }
    if (
      !rows.length &&
      ["이름", "성명", "name"].includes(parts[0]?.toLowerCase()) &&
      handleHeader(parts[1])
    ) {
      columns = 3;
      continue;
    }
    if (!line.includes("\t") && !line.includes(",")) {
      const width = columns ?? (/^[a-z0-9._-]+$/i.test(parts[0]) ? 2 : 3);
      parts = [...parts.slice(0, width - 1), parts.slice(width - 1).join(" ")];
    }
    const [rawHandle = "", team = ""] =
      parts.length === 2 ? parts : parts.slice(1);
    const handle = rawHandle.toLowerCase();
    // Keep the stored member shape without collecting a separate Korean name.
    const name = handle;
    const checked = memberInput.safeParse({ name, handle, team });
    let error =
      columns && parts.length !== columns
        ? `명단 제목과 같은 ${columns}열로 입력해주세요.`
        : parts.length !== 2 && parts.length !== 3
          ? "영문명·팀명 2열을 확인해주세요."
          : !checked.success
            ? checked.error.issues
                .filter((i) => i.path[0] !== "name")
                .map(
                  (i) =>
                    `${({ handle: "영문명", team: "팀명" } as Record<string, string>)[String(i.path[0])]}: ${i.message}`,
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

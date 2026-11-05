import { describe, expect, it } from "vitest";
import { budgetExpenseCsv } from "../shared/budget-export";
import type { BudgetExpense } from "../shared/types";

const header = "결제일자,결제자,구분,타이틀,금액,장소,비고";
const expense = (overrides: Partial<BudgetExpense> = {}): BudgetExpense => ({
  id: crypto.randomUUID(),
  title: "점심",
  amount: 35000,
  type: "meal",
  spentOn: "2026-11-05",
  note: "5명",
  authorId: "dave.h",
  authorHandle: "dave.h",
  createdAt: 1000,
  updatedAt: 1000,
  revision: 0,
  status: "pending",
  confirmedBy: null,
  confirmedByHandle: null,
  confirmedAt: null,
  ...overrides,
});

describe("budget CSV export", () => {
  it("uses the requested seven columns, the full payer ID, Korean type and plain amount", () => {
    expect(budgetExpenseCsv([expense({ place: "한식당" })])).toBe(
      `${header}\r\n2026-11-05,dave.h,식비·간식,점심,35000,한식당,5명`,
    );
  });
  it("preserves commas, quotes and line breaks within their original columns", () => {
    expect(
      budgetExpenseCsv([
        expense({
          title: '도시락, "특식"',
          place: "서울역, 2층",
          note: '첫째 줄\n둘째 "줄"',
        }),
      ]),
    ).toBe(
      `${header}\r\n2026-11-05,dave.h,식비·간식,"도시락, ""특식""",35000,"서울역, 2층","첫째 줄\n둘째 ""줄"""`,
    );
  });
  it("uses an exact dash for absent or blank places, without inventing a note", () => {
    for (const place of [undefined, "", "   ", "-"])
      expect(budgetExpenseCsv([expense({ place, note: "" })])).toBe(
        `${header}\r\n2026-11-05,dave.h,식비·간식,점심,35000,-,`,
      );
    expect(budgetExpenseCsv([])).toBe(header);
  });
  it("matches newest-first ordering without mutating the source, and keeps large amounts numeric", () => {
    const older = expense({ title: "이전 지출", spentOn: "2026-11-04" });
    const newer = expense({
      title: "새 지출",
      type: "transport",
      amount: 1_000_000_000,
    });
    const input = [older, newer];
    const lines = budgetExpenseCsv(input).split("\r\n");
    expect(lines[1]).toBe("2026-11-05,dave.h,교통,새 지출,1000000000,-,5명");
    expect(lines[2]).toContain("이전 지출");
    expect(input).toEqual([older, newer]);
  });
  it("exports formula-like user text as literal spreadsheet text", () => {
    const csv = budgetExpenseCsv([
      expense({ title: "=SUM(1,2)", place: "@store", note: "+한 줄" }),
    ]);
    expect(csv).toContain('"\'=SUM(1,2)"');
    expect(csv).toContain(",'@store,'+한 줄");
  });
});

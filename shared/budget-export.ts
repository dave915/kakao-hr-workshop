import { expenseTypes } from "./budgets";
import type { BudgetExpense } from "./types";

const columns = [
  "결제일자",
  "결제자",
  "구분",
  "타이틀",
  "금액",
  "장소",
  "비고",
];

function csvCell(value: string | number) {
  let text = String(value);
  // Keep user text literal when pasted into a spreadsheet. A lone dash is our empty-place marker.
  if (
    typeof value === "string" &&
    text !== "-" &&
    /^[\s\uFEFF]*[=+@-]/u.test(text)
  )
    text = `'${text}`;
  return /[",\r\n\t]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Same newest-first order as the expense list, with a header and seven fields per record. */
export function budgetExpenseCsv(expenses: readonly BudgetExpense[]) {
  const ordered = [...expenses].sort(
    (a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt - a.createdAt,
  );
  return [
    columns.join(","),
    ...ordered.map((expense) =>
      [
        expense.spentOn,
        expense.authorHandle,
        expenseTypes[expense.type],
        expense.title,
        expense.amount,
        expense.place?.trim() || "-",
        expense.note,
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\r\n");
}

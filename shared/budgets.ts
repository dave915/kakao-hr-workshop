import { GameError, isAdmin } from "./game";
import type {
  BudgetExpense,
  ExpenseType,
  WorkshopBudget,
  WorkshopState,
} from "./types";
import type { ActionInput } from "./validation";

export const expenseTypes: Record<ExpenseType, string> = {
  meal: "식비·간식",
  transport: "교통",
  stay: "숙박",
  activity: "활동",
  supplies: "물품",
  other: "기타",
};
export type BudgetAction = Extract<
  ActionInput,
  {
    action:
      | "createBudget"
      | "updateBudget"
      | "deleteBudget"
      | "createExpense"
      | "updateExpense"
      | "deleteExpense"
      | "confirmExpense"
      | "reopenExpense";
  }
>;
export function isBudgetAction(input: ActionInput): input is BudgetAction {
  return [
    "createBudget",
    "updateBudget",
    "deleteBudget",
    "createExpense",
    "updateExpense",
    "deleteExpense",
    "confirmExpense",
    "reopenExpense",
  ].includes(input.action);
}
export function budgetTotals(budgets: WorkshopBudget[]) {
  const amount = budgets.reduce((sum, budget) => sum + budget.amount, 0);
  const expenses = budgets.flatMap((budget) => budget.expenses);
  const confirmed = expenses
    .filter((expense) => expense.status === "confirmed")
    .reduce((sum, expense) => sum + expense.amount, 0);
  const pending = expenses
    .filter((expense) => expense.status === "pending")
    .reduce((sum, expense) => sum + expense.amount, 0);
  return {
    amount,
    confirmed,
    pending,
    remaining: amount - confirmed,
    available: amount - confirmed - pending,
    pendingCount: expenses.filter((expense) => expense.status === "pending")
      .length,
  };
}
function sameExpense(
  a: BudgetExpense,
  b: Extract<BudgetAction, { action: "createExpense" }>["expense"],
) {
  return (
    a.title === b.title &&
    a.amount === b.amount &&
    a.type === b.type &&
    a.spentOn === b.spentOn &&
    a.note === b.note
  );
}

/** Used inside the callable's Firestore transaction and by the local preview. */
export function mutateBudget(
  state: WorkshopState,
  actorId: string,
  input: BudgetAction,
  now: number,
) {
  const actor = state.members[actorId];
  if (!actor) throw new GameError("다시 입장해주세요.");
  if (input.resetGeneration !== (state.resetGeneration ?? 0))
    throw new GameError(
      "워크샵이 초기화되었어요. 예산 목록을 다시 열어주세요.",
    );
  const budgets = structuredClone(state.budgets ?? []);
  if (input.action === "deleteBudget") {
    if (!isAdmin(actor))
      throw new GameError("예산은 워추위만 삭제할 수 있어요.");
    const budget = budgets.find((item) => item.id === input.budgetId);
    if (!budget) return;
    const expected = new Map(
      input.expenses.map((expense) => [expense.id, expense.revision]),
    );
    if (
      (input.revision ?? 0) !== (budget.revision ?? 0) ||
      budget.expenses.length !== expected.size ||
      budget.expenses.some(
        (expense) => expected.get(expense.id) !== expense.revision,
      )
    )
      throw new GameError(
        "삭제 확인 중 예산이나 지출이 변경되었어요. 창을 닫고 내역을 다시 확인해주세요.",
      );
    state.budgets = budgets.filter((item) => item.id !== input.budgetId);
    return;
  }
  if (input.action === "createBudget") {
    if (!isAdmin(actor))
      throw new GameError("예산은 워추위만 추가할 수 있어요.");
    const previous = budgets.find((budget) => budget.id === input.budget.id);
    if (previous) {
      if (
        previous.createdBy === actorId &&
        previous.name === input.budget.name &&
        previous.amount === input.budget.amount
      )
        return;
      throw new GameError("이미 등록된 예산이에요. 예산 목록을 확인해주세요.");
    }
    if (budgets.length >= 50)
      throw new GameError("예산은 최대 50개까지 등록할 수 있어요.");
    budgets.push({
      ...input.budget,
      createdBy: actorId,
      createdAt: now,
      revision: 0,
      expenses: [],
    });
  } else if (input.action === "updateBudget") {
    if (!isAdmin(actor))
      throw new GameError("예산은 워추위만 수정할 수 있어요.");
    const budget = budgets.find((item) => item.id === input.budget.id);
    if (!budget)
      throw new GameError(
        "예산을 찾을 수 없어요. 예산 목록을 다시 확인해주세요.",
      );
    if ((budget.revision ?? 0) !== input.revision)
      throw new GameError(
        "다른 사람이 예산을 변경했어요. 목록을 확인한 뒤 다시 시도해주세요.",
      );
    Object.assign(budget, input.budget, { revision: input.revision + 1 });
  } else {
    const budget = budgets.find((item) => item.id === input.budgetId);
    if (!budget)
      throw new GameError(
        "예산을 찾을 수 없어요. 예산 목록을 다시 확인해주세요.",
      );
    if (input.action === "createExpense") {
      const previous = budgets
        .flatMap((item) => item.expenses)
        .find((expense) => expense.id === input.expense.id);
      if (previous) {
        if (
          budget.expenses.includes(previous) &&
          previous.authorId === actorId &&
          sameExpense(previous, input.expense)
        )
          return;
        throw new GameError(
          "이미 처리된 지출이에요. 지출 목록을 확인해주세요.",
        );
      }
      if (budgets.reduce((sum, item) => sum + item.expenses.length, 0) >= 500)
        throw new GameError("지출은 워크샵당 최대 500건까지 등록할 수 있어요.");
      budget.expenses.unshift({
        ...input.expense,
        authorId: actorId,
        authorHandle: actor.handle,
        createdAt: now,
        updatedAt: now,
        revision: 0,
        status: "pending",
        confirmedBy: null,
        confirmedByHandle: null,
        confirmedAt: null,
      });
    } else {
      const id =
        input.action === "updateExpense" ? input.expense.id : input.expenseId;
      const expense = budget.expenses.find((item) => item.id === id);
      if (!expense)
        throw new GameError("지출을 찾을 수 없어요. 목록을 다시 확인해주세요.");
      if (
        input.action === "confirmExpense" ||
        input.action === "reopenExpense"
      ) {
        if (!isAdmin(actor))
          throw new GameError("지출 확정과 확정 취소는 워추위만 할 수 있어요.");
        if (input.action === "confirmExpense" && expense.status === "confirmed")
          return;
      } else if (expense.authorId !== actorId && !isAdmin(actor)) {
        throw new GameError(
          "본인이 등록한 지출만 수정하거나 삭제할 수 있어요.",
        );
      }
      if (expense.revision !== input.revision)
        throw new GameError(
          "다른 사람이 지출을 변경했어요. 목록을 확인한 뒤 다시 시도해주세요.",
        );
      if (input.action === "confirmExpense") {
        Object.assign(expense, {
          status: "confirmed",
          confirmedBy: actorId,
          confirmedByHandle: actor.handle,
          confirmedAt: now,
        });
      } else if (input.action === "reopenExpense") {
        if (expense.status !== "confirmed")
          throw new GameError("이미 확인 대기 중인 지출이에요.");
        Object.assign(expense, {
          status: "pending",
          confirmedBy: null,
          confirmedByHandle: null,
          confirmedAt: null,
        });
      } else {
        if (expense.status === "confirmed")
          throw new GameError(
            "확정된 지출은 변경할 수 없어요. 워추위가 확정을 취소한 뒤 수정해주세요.",
          );
        if (input.action === "deleteExpense")
          budget.expenses = budget.expenses.filter((item) => item.id !== id);
        else Object.assign(expense, input.expense);
      }
      expense.revision++;
      expense.updatedAt = now;
    }
  }
  // Leave room for Firestore field overhead and other workshop data.
  if (
    new TextEncoder().encode(JSON.stringify({ ...state, budgets })).length >
    900_000
  )
    throw new GameError("워크샵 저장 공간이 부족해요. 워추위에 문의해주세요.");
  state.budgets = budgets;
}

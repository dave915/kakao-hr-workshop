import { describe, expect, it } from "vitest";
import { budgetTotals } from "../shared/budgets";
import { participantView } from "../shared/exploration";
import { mutate } from "../shared/mutate";
import { makeSeed } from "../shared/seed";
import { actionInput, type ActionInput } from "../shared/validation";

function fixture() {
  const state = makeSeed(true);
  state.members["june.p"].role = "admin";
  const budget = {
    id: crypto.randomUUID(),
    name: "워크샵 식비",
    amount: 100_000,
  };
  const expense = {
    id: crypto.randomUUID(),
    title: "점심 도시락",
    amount: 30_000,
    type: "meal" as const,
    spentOn: "2026-11-05",
    note: "3명",
  };
  const run = (actor: string, input: ActionInput, now = 1000) =>
    mutate(state, {}, actor, actionInput.parse(input), "unused", now);
  run("dave.h", { action: "createBudget", resetGeneration: 0, budget });
  const create = {
    action: "createExpense" as const,
    resetGeneration: 0,
    budgetId: budget.id,
    expense,
  };
  const target = {
    resetGeneration: 0,
    budgetId: budget.id,
    expenseId: expense.id,
    revision: 0,
  };
  return { state, budget, expense, run, create, target };
}

describe("workshop budgets", () => {
  it("allows committee to delete a reviewed budget with its expenses and preserves other budgets", () => {
    const { state, run, create, target, budget } = fixture();
    const other = { ...budget, id: crypto.randomUUID(), name: "교통비" };
    run("june.p", {
      action: "createBudget",
      resetGeneration: 0,
      budget: other,
    });
    run("alex.k", create);
    run("june.p", { action: "confirmExpense", ...target });
    const deletion = {
      action: "deleteBudget" as const,
      resetGeneration: 0,
      budgetId: budget.id,
      expenses: [{ id: create.expense.id, revision: 1 }],
    };
    expect(() => run("alex.k", deletion)).toThrow("워추위");
    run("june.p", deletion);
    run("june.p", deletion);
    expect(state.budgets?.map((item) => item.id)).toEqual([other.id]);
    expect(
      participantView(state).budgets?.flatMap((item) => item.expenses),
    ).toEqual([]);
    expect(budgetTotals(state.budgets!)).toMatchObject({
      amount: other.amount,
      confirmed: 0,
      pending: 0,
    });
  });
  it("rejects budget deletion if expenses were added, changed or removed after confirmation opened", () => {
    const { state, run, create, target, budget } = fixture();
    const empty = {
      action: "deleteBudget" as const,
      resetGeneration: 0,
      budgetId: budget.id,
      expenses: [],
    };
    run("alex.k", create);
    expect(() => run("dave.h", empty)).toThrow("변경");
    const reviewed = {
      ...empty,
      expenses: [{ id: create.expense.id, revision: 0 }],
    };
    run("june.p", { action: "confirmExpense", ...target });
    expect(() => run("dave.h", reviewed)).toThrow("변경");
    run("june.p", { action: "reopenExpense", ...target, revision: 1 });
    const beforeRemoval = {
      ...empty,
      expenses: [{ id: create.expense.id, revision: 2 }],
    };
    run("alex.k", { action: "deleteExpense", ...target, revision: 2 });
    expect(() => run("dave.h", beforeRemoval)).toThrow("변경");
    expect(state.budgets).toHaveLength(1);
    run("dave.h", empty);
    expect(state.budgets).toEqual([]);
  });
  it("lets members submit pending expenses, shows the author to participants, and lets committee confirm once", () => {
    const { state, run, create, target } = fixture();
    run("alex.k", create);
    const pending = state.budgets![0].expenses[0];
    expect(pending).toMatchObject({
      authorId: "alex.k",
      authorHandle: "alex.k",
      status: "pending",
      confirmedBy: null,
    });
    expect(participantView(state).budgets).toEqual(state.budgets);
    expect(budgetTotals(state.budgets!)).toMatchObject({
      amount: 100_000,
      confirmed: 0,
      pending: 30_000,
      available: 70_000,
      pendingCount: 1,
    });
    expect(() =>
      run("alex.k", { action: "confirmExpense", ...target }),
    ).toThrow("워추위");
    run("june.p", { action: "confirmExpense", ...target }, 2000);
    run("dave.h", { action: "confirmExpense", ...target }, 3000);
    expect(state.budgets![0].expenses[0]).toMatchObject({
      status: "confirmed",
      confirmedBy: "june.p",
      confirmedByHandle: "june.p",
      confirmedAt: 2000,
      revision: 1,
    });
    expect(budgetTotals(state.budgets!)).toMatchObject({
      confirmed: 30_000,
      pending: 0,
      available: 70_000,
      pendingCount: 0,
    });
  });
  it("limits budget creation to committee and safely retries creation without double-counting", () => {
    const { state, budget, run, create } = fixture();
    expect(() =>
      run("alex.k", {
        action: "createBudget",
        resetGeneration: 0,
        budget: { ...budget, id: crypto.randomUUID() },
      }),
    ).toThrow("워추위");
    run("dave.h", { action: "createBudget", resetGeneration: 0, budget });
    run("alex.k", create);
    run("alex.k", create);
    expect(state.budgets).toHaveLength(1);
    expect(state.budgets![0].expenses).toHaveLength(1);
    expect(() =>
      run("alex.k", {
        ...create,
        expense: { ...create.expense, amount: 45_000 },
      }),
    ).toThrow("이미 처리");
    expect(() => run("ryan.j", create)).toThrow("이미 처리");
  });
  it("takes identity and confirmation metadata only from the server actor", () => {
    const { state, run, create } = fixture();
    const parsed = actionInput.parse({
      ...create,
      expense: {
        ...create.expense,
        authorId: "dave.h",
        authorHandle: "dave.h",
        status: "confirmed",
        confirmedBy: "dave.h",
        revision: 900,
      },
    });
    run("alex.k", parsed);
    expect(state.budgets![0].expenses[0]).toMatchObject({
      authorId: "alex.k",
      authorHandle: "alex.k",
      status: "pending",
      confirmedBy: null,
      revision: 0,
    });
  });
  it("allows only the author or committee to edit pending expenses, and rejects stale confirmation and edits", () => {
    const { state, run, create, target, expense } = fixture();
    run("alex.k", create);
    const update = {
      action: "updateExpense" as const,
      resetGeneration: 0,
      budgetId: create.budgetId,
      expense: { ...expense, amount: 35_000 },
      revision: 0,
    };
    expect(() => run("ryan.j", update)).toThrow("본인이");
    expect(() => run("ryan.j", { action: "deleteExpense", ...target })).toThrow(
      "본인이",
    );
    run("alex.k", update);
    expect(() =>
      run("june.p", { action: "confirmExpense", ...target }),
    ).toThrow("다른 사람");
    expect(() => run("alex.k", update)).toThrow("다른 사람");
    run("june.p", { action: "confirmExpense", ...target, revision: 1 });
    expect(() => run("alex.k", { ...update, revision: 2 })).toThrow("확정된");
    expect(() =>
      run("dave.h", { action: "deleteExpense", ...target, revision: 2 }),
    ).toThrow("확정된");
    expect(() =>
      run("alex.k", { action: "reopenExpense", ...target, revision: 2 }),
    ).toThrow("워추위");
    run("june.p", { action: "reopenExpense", ...target, revision: 2 });
    expect(state.budgets![0].expenses[0]).toMatchObject({
      status: "pending",
      confirmedBy: null,
      confirmedAt: null,
      revision: 3,
    });
    run("dave.h", { ...update, revision: 3 });
    expect(state.budgets![0].expenses[0].authorHandle).toBe("alex.k");
    run("alex.k", { action: "deleteExpense", ...target, revision: 4 });
    expect(state.budgets![0].expenses).toEqual([]);
  });
  it("rejects invalid amounts, dates, types, empty names and unknown budgets", () => {
    const { run, create, budget } = fixture();
    for (const amount of [0, -1, 0.5, NaN, Infinity, 1_000_000_001]) {
      expect(
        actionInput.safeParse({
          ...create,
          expense: { ...create.expense, amount },
        }).success,
      ).toBe(false);
      expect(
        actionInput.safeParse({
          action: "createBudget",
          resetGeneration: 0,
          budget: { ...budget, amount },
        }).success,
      ).toBe(false);
    }
    for (const spentOn of [
      "2026-02-30",
      "2025-02-29",
      "2026-13-01",
      "tomorrow",
    ])
      expect(
        actionInput.safeParse({
          ...create,
          expense: { ...create.expense, spentOn },
        }).success,
      ).toBe(false);
    expect(
      actionInput.safeParse({
        ...create,
        expense: { ...create.expense, type: "income" },
      }).success,
    ).toBe(false);
    expect(
      actionInput.safeParse({
        ...create,
        expense: { ...create.expense, title: "   " },
      }).success,
    ).toBe(false);
    expect(() =>
      run("alex.k", { ...create, budgetId: crypto.randomUUID() }),
    ).toThrow("예산을 찾을");
    expect(() => run("missing", create)).toThrow("입장");
  });
  it("retains expense attribution after a participant is removed and clears budgets on full reset", () => {
    const { state, run, create } = fixture();
    run("alex.k", create);
    run("dave.h", { action: "deleteMember", memberId: "alex.k" });
    expect(state.budgets![0].expenses[0].authorHandle).toBe("alex.k");
    run("dave.h", { action: "resetWorkshop", confirmation: "전체 초기화" });
    expect(state.budgets).toEqual([]);
    expect(() => run("dave.h", create)).toThrow("초기화");
  });
  it("handles older states, overspending and storage limits without partial writes", () => {
    const { state, budget, run, create } = fixture();
    delete state.budgets;
    run("june.p", { action: "createBudget", resetGeneration: 0, budget });
    run("alex.k", {
      ...create,
      expense: { ...create.expense, amount: 120_000 },
    });
    expect(budgetTotals(state.budgets!)).toMatchObject({
      available: -20_000,
      pending: 120_000,
    });
    state.settings.subtitle = "가".repeat(310_000);
    const before = structuredClone(state.budgets);
    expect(() =>
      run("alex.k", {
        ...create,
        expense: { ...create.expense, id: crypto.randomUUID() },
      }),
    ).toThrow("저장 공간");
    expect(state.budgets).toEqual(before);
  });
});

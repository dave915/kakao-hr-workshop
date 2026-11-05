import { useRef, useState, type FormEvent } from "react";
import {
  ArrowDown,
  Check,
  ChevronRight,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
  Undo2,
} from "lucide-react";
import { budgetTotals, expenseTypes } from "../../shared/budgets";
import { isAdmin } from "../../shared/game";
import type {
  BudgetExpense,
  ExpenseType,
  WorkshopBudget,
} from "../../shared/types";
import type { ActionInput } from "../../shared/validation";
import { usePullToAdd } from "../hooks/usePullToAdd";
import { useWorkshop } from "../lib/store";
import { englishName, errorMessage } from "../lib/utils";
import { Drawer, type Notify } from "./common";
import "./Budget.css";

const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const dateLabel = (value: string) => value.replaceAll("-", ".");

function useBudgetAction(notify: Notify) {
  const { act, state } = useWorkshop();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const run = async (input: ActionInput, message: string) => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await act(input);
      notify(message);
      return true;
    } catch (error) {
      setError(errorMessage(error));
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return { run, busy, error, resetGeneration: state?.resetGeneration ?? 0 };
}

function Totals({ budgets }: { budgets: WorkshopBudget[] }) {
  const totals = budgetTotals(budgets);
  return (
    <div className="budget-summary">
      <dl>
        <div>
          <dt>전체 예산</dt>
          <dd>{won(totals.amount)}</dd>
        </div>
        <div>
          <dt>확정 지출</dt>
          <dd>{won(totals.confirmed)}</dd>
        </div>
        <div>
          <dt>
            확인 대기 <span>{totals.pendingCount}건</span>
          </dt>
          <dd>{won(totals.pending)}</dd>
        </div>
        <div className="budget-balance">
          <dt>{totals.available < 0 ? "예산 초과" : "남은 예산"}</dt>
          <dd className={totals.available < 0 ? "budget-over" : ""}>
            {won(Math.abs(totals.available))}
          </dd>
        </div>
      </dl>
      <p>남은 예산에는 확인 대기 중인 지출도 반영돼요.</p>
    </div>
  );
}

export default function Budget({ notify }: { notify: Notify }) {
  const { state, me } = useWorkshop();
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!state || !me) return null;
  const budgets = state.budgets ?? [];
  const selected = budgets.find((budget) => budget.id === selectedId);
  const admin = isAdmin(me);
  return (
    <section className="budget-page">
      <header className="budget-heading">
        <div>
          <h1>워크샵 예산</h1>
          <p>함께 쓴 비용을 기록하고 확인해요.</p>
        </div>
        {admin && (
          <button className="button dark" onClick={() => setCreating(true)}>
            <Plus size={18} />
            예산 추가
          </button>
        )}
      </header>
      {budgets.length > 0 ? (
        <>
          <Totals budgets={budgets} />
          <div className="budget-list-heading">
            <h2>예산 목록</h2>
            <span>{budgets.length}개</span>
          </div>
          <ul className="budget-list">
            {budgets.map((budget) => {
              const totals = budgetTotals([budget]);
              return (
                <li key={budget.id}>
                  <button
                    className="budget-row"
                    onClick={() => setSelectedId(budget.id)}
                  >
                    <span className="budget-row-main">
                      <strong>{budget.name}</strong>
                      <span>
                        예산 {won(budget.amount)}
                        <span className="budget-row-count">
                          지출 {budget.expenses.length}건
                        </span>
                      </span>
                    </span>
                    <span className="budget-row-balance">
                      <strong
                        className={totals.available < 0 ? "budget-over" : ""}
                      >
                        {won(Math.abs(totals.available))}
                      </strong>
                      <span>
                        {totals.available < 0 ? "초과" : "남음"}
                        {totals.pendingCount > 0 &&
                          ` · 확인 대기 ${totals.pendingCount}건`}
                      </span>
                    </span>
                    <ChevronRight size={19} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="budget-help">
            예산을 선택하면 누구나 지출을 등록할 수 있어요. 확정은 워추위가
            진행해요.
          </p>
        </>
      ) : (
        <div className="budget-empty">
          <ReceiptText size={30} aria-hidden="true" />
          <h2>아직 등록된 예산이 없어요</h2>
          <p>
            {admin
              ? "식비, 숙박비처럼 사용할 예산부터 추가해주세요."
              : "워추위가 예산을 추가하면 이곳에서 지출을 등록할 수 있어요."}
          </p>
        </div>
      )}
      {creating && (
        <BudgetForm notify={notify} onClose={() => setCreating(false)} />
      )}
      {selected && (
        <BudgetDetail
          budget={selected}
          notify={notify}
          onClose={() => setSelectedId(null)}
        />
      )}
    </section>
  );
}

function BudgetForm({
  notify,
  onClose,
}: {
  notify: Notify;
  onClose: () => void;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const { run, busy, error, resetGeneration } = useBudgetAction(notify);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      await run(
        {
          action: "createBudget",
          resetGeneration,
          budget: { id, name, amount: Number(amount) },
        },
        "예산을 추가했어요.",
      )
    )
      onClose();
  };
  return (
    <Drawer
      title="예산 추가"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form-stack budget-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <legend className="sr-only">새 예산</legend>
          <label>
            예산 이름
            <input
              required
              maxLength={60}
              placeholder="예: 워크샵 식비"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            예산 금액 (원)
            <input
              required
              type="number"
              inputMode="numeric"
              min={1}
              max={1_000_000_000}
              step={1}
              placeholder="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="button dark full" disabled={busy}>
          {busy ? "저장 중…" : "예산 추가하기"}
        </button>
      </form>
    </Drawer>
  );
}

function BudgetDetail({
  budget,
  notify,
  onClose,
}: {
  budget: WorkshopBudget;
  notify: Notify;
  onClose: () => void;
}) {
  const { me } = useWorkshop();
  const [editor, setEditor] = useState<BudgetExpense | "new" | null>(null);
  const [filter, setFilter] = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const { run, busy, error, resetGeneration } = useBudgetAction(notify);
  const { distance, ready } = usePullToAdd(
    surface,
    () => setEditor("new"),
    Boolean(editor) || busy,
  );
  const admin = isAdmin(me);
  const expenses = budget.expenses
    .filter((expense) => filter === "all" || expense.status === filter)
    .sort(
      (a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt - a.createdAt,
    );
  const target = (expense: BudgetExpense) => ({
    resetGeneration,
    budgetId: budget.id,
    expenseId: expense.id,
    revision: expense.revision,
  });
  return (
    <>
      <Drawer
        title={budget.name}
        className="budget-detail"
        fitViewport
        onClose={() => {
          if (!busy) onClose();
        }}
      >
        <div className="budget-detail-scroll" ref={surface}>
          <div
            className={`budget-pull ${ready ? "ready" : ""}`}
            style={{ height: distance }}
            aria-hidden="true"
          >
            <span>
              <ArrowDown size={18} />
              {ready ? "놓으면 지출 입력창이 열려요" : "아래로 당겨 지출 등록"}
            </span>
          </div>
          <div className="budget-detail-body">
            <p className="budget-pull-hint">
              <ArrowDown size={15} aria-hidden="true" />맨 위에서 아래로 당겨
              지출 등록
            </p>
            <Totals budgets={[budget]} />
            <div className="budget-expenses-heading">
              <h3>지출 내역</h3>
              <button
                className="button dark"
                disabled={busy}
                onClick={() => setEditor("new")}
              >
                <Plus size={17} />
                지출 등록
              </button>
            </div>
            <label className="budget-filter">
              상태
              <select
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setDeletingId(null);
                }}
              >
                <option value="all">전체 {budget.expenses.length}건</option>
                <option value="pending">확인 대기</option>
                <option value="confirmed">확정</option>
              </select>
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            {expenses.length === 0 ? (
              <div className="budget-empty">
                <h3>
                  {filter === "all"
                    ? "첫 지출을 기록해보세요"
                    : "해당 상태의 지출이 없어요"}
                </h3>
                <p>
                  {filter === "all"
                    ? "참가자 누구나 등록하고, 워추위가 확인해요."
                    : "다른 상태를 선택해 지출을 확인해주세요."}
                </p>
              </div>
            ) : (
              <ul className="expense-list">
                {expenses.map((expense) => (
                  <li key={expense.id} className="expense-row">
                    <div className="expense-main">
                      <div>
                        <span className="expense-type">
                          {expenseTypes[expense.type]}
                        </span>
                        <h4>{expense.title}</h4>
                      </div>
                      <strong>{won(expense.amount)}</strong>
                    </div>
                    <p className="expense-meta">
                      <time dateTime={expense.spentOn}>
                        {dateLabel(expense.spentOn)}
                      </time>
                      <span>작성 {englishName(expense.authorHandle)}</span>
                    </p>
                    {expense.note && (
                      <p className="expense-note">{expense.note}</p>
                    )}
                    <div className="expense-status-row">
                      <span className={`expense-status ${expense.status}`}>
                        {expense.status === "confirmed" ? (
                          <>
                            <Check size={14} />
                            확정 ·{" "}
                            {englishName(expense.confirmedByHandle ?? "")}
                          </>
                        ) : (
                          "확인 대기"
                        )}
                      </span>
                      {admin && (
                        <button
                          className="button small secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              {
                                action:
                                  expense.status === "pending"
                                    ? "confirmExpense"
                                    : "reopenExpense",
                                ...target(expense),
                              },
                              expense.status === "pending"
                                ? "지출을 확정했어요."
                                : "확정을 취소했어요. 지출을 수정할 수 있어요.",
                            )
                          }
                        >
                          {expense.status === "pending" ? (
                            <>
                              <Check size={15} />
                              확정
                            </>
                          ) : (
                            <>
                              <Undo2 size={15} />
                              확정 취소
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    {expense.status === "pending" &&
                      (admin || expense.authorId === me?.id) && (
                        <div className="expense-edit-actions">
                          <button
                            className="text-button"
                            disabled={busy}
                            aria-label={`${expense.title} 수정`}
                            onClick={() => {
                              setDeletingId(null);
                              setEditor(expense);
                            }}
                          >
                            <Pencil size={14} />
                            수정
                          </button>
                          <button
                            className="text-button"
                            disabled={busy}
                            aria-label={`${expense.title} 삭제`}
                            onClick={() => setDeletingId(expense.id)}
                          >
                            <Trash2 size={14} />
                            삭제
                          </button>
                        </div>
                      )}
                    {deletingId === expense.id && (
                      <div className="expense-delete">
                        <p>이 지출 {won(expense.amount)}을 삭제할까요?</p>
                        <div>
                          <button
                            className="button small secondary"
                            disabled={busy}
                            onClick={() => setDeletingId(null)}
                          >
                            취소
                          </button>
                          <button
                            className="button small danger"
                            disabled={busy}
                            onClick={async () => {
                              if (
                                await run(
                                  {
                                    action: "deleteExpense",
                                    ...target(expense),
                                  },
                                  "지출을 삭제했어요.",
                                )
                              )
                                setDeletingId(null);
                            }}
                          >
                            지출 삭제
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Drawer>
      {editor && (
        <ExpenseForm
          budget={budget}
          expense={editor === "new" ? undefined : editor}
          notify={notify}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}

function ExpenseForm({
  budget,
  expense,
  notify,
  onClose,
}: {
  budget: WorkshopBudget;
  expense?: BudgetExpense;
  notify: Notify;
  onClose: () => void;
}) {
  const { me } = useWorkshop();
  const [id] = useState(() => expense?.id ?? crypto.randomUUID());
  const [title, setTitle] = useState(expense?.title ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [type, setType] = useState<ExpenseType>(expense?.type ?? "meal");
  const [spentOn, setSpentOn] = useState(expense?.spentOn ?? today());
  const [note, setNote] = useState(expense?.note ?? "");
  const { run, busy, error, resetGeneration } = useBudgetAction(notify);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const values = {
      resetGeneration,
      budgetId: budget.id,
      expense: { id, title, amount: Number(amount), type, spentOn, note },
    };
    const input: ActionInput = expense
      ? { action: "updateExpense", ...values, revision: expense.revision }
      : { action: "createExpense", ...values };
    if (
      await run(
        input,
        expense
          ? "지출을 수정했어요."
          : "지출을 등록했어요. 워추위 확인을 기다려주세요.",
      )
    )
      onClose();
  };
  return (
    <Drawer
      title={expense ? "지출 수정" : "지출 등록"}
      className="budget-expense-editor"
      fitViewport
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="budget-form-context">
        {budget.name}
        <span>
          작성자 {englishName(expense?.authorHandle ?? me?.handle ?? "")}
        </span>
      </p>
      <form className="form-stack budget-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <legend className="sr-only">지출 정보</legend>
          <label>
            지출 내용
            <input
              required
              maxLength={80}
              placeholder="예: 점심 도시락 20개"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            지출 금액 (원)
            <input
              required
              type="number"
              inputMode="numeric"
              min={1}
              max={1_000_000_000}
              step={1}
              placeholder="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <div className="form-pair">
            <label>
              유형
              <select
                value={type}
                onChange={(event) => setType(event.target.value as ExpenseType)}
              >
                {Object.entries(expenseTypes).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              지출일
              <input
                required
                type="date"
                value={spentOn}
                onChange={(event) => setSpentOn(event.target.value)}
              />
            </label>
          </div>
          <label>
            <span>
              메모 <small>(선택)</small>
            </span>
            <textarea
              rows={3}
              maxLength={300}
              placeholder="사용처나 함께 확인할 내용을 적어주세요."
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </fieldset>
        <p className="budget-help">등록한 지출은 워추위가 확인 후 확정해요.</p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="button dark full" disabled={busy}>
          {busy ? "저장 중…" : expense ? "수정 내용 저장" : "지출 등록하기"}
        </button>
      </form>
    </Drawer>
  );
}

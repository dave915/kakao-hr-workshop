import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { BudgetExpense } from "../../shared/types";
import { budgetExpenseCsv } from "../../shared/budget-export";
import { Drawer, type Notify } from "./common";

export default function BudgetExpenseCopy({
  expenses,
  scope,
  notify,
}: {
  expenses: BudgetExpense[];
  scope: string;
  notify: Notify;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [fallback, setFallback] = useState("");
  const textArea = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    if (inFlight.current || !expenses.length) return;
    const csv = budgetExpenseCsv(expenses),
      count = expenses.length;
    inFlight.current = true;
    setBusy(true);
    setCopied(null);
    clearTimeout(timer.current);
    try {
      // The text is already available: call within the click gesture for Safari.
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(csv);
      setCopied(count);
      notify(`${scope} 사용내역 ${count}건을 CSV로 복사했어요.`);
      timer.current = setTimeout(() => setCopied(null), 2500);
    } catch {
      setFallback(csv);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        className="button small secondary budget-copy-button"
        disabled={busy || !expenses.length}
        aria-label={`${scope} 사용내역 CSV 복사`}
        title={
          expenses.length
            ? `${scope} ${expenses.length}건 복사`
            : "복사할 사용내역이 없어요"
        }
        onClick={() => void copy()}
      >
        {copied !== null ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Copy size={16} aria-hidden="true" />
        )}
        {busy ? "복사 중…" : copied !== null ? "복사 완료" : "사용내역 복사"}
      </button>
      <span className="sr-only" role="status">
        {copied !== null ? `${scope} ${copied}건 복사 완료` : ""}
      </span>
      {fallback && (
        <Drawer title="사용내역 CSV 복사" onClose={() => setFallback("")}>
          <div className="form-stack">
            <p role="status">
              자동 복사를 사용할 수 없어요. 아래 내용을 선택한 뒤 직접
              복사해주세요.
            </p>
            <label>
              CSV 내용
              <textarea
                ref={textArea}
                readOnly
                rows={10}
                value={fallback}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                textArea.current?.focus();
                textArea.current?.select();
              }}
            >
              전체 선택
            </button>
          </div>
        </Drawer>
      )}
    </>
  );
}

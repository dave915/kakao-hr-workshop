import { useRef, useState } from "react";
import { Copy, X } from "lucide-react";
import { useWorkshop } from "../lib/store";
import { invitationTsv, copyPromisedText } from "../lib/invite-export";
import { errorMessage } from "../lib/utils";
import type { Notify } from "./common";
export default function InviteExport({ notify }: { notify: Notify }) {
  const { act, me } = useWorkshop();
  const [busy, setBusy] = useState(false),
    [fallback, setFallback] = useState("");
  const inFlight = useRef(false);
  const copy = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFallback("");
    let text = "",
      count = 0,
      fetchError: unknown;
    const request = act({ action: "getMemberInvites" }).then((result) => {
      if (!result.memberInvites)
        throw new Error("참가링크를 불러오지 못했어요. 다시 시도해주세요.");
      count = result.memberInvites.length;
      text = invitationTsv(result.memberInvites);
      return text;
    });
    void request.catch((error) => {
      fetchError = error;
    });
    try {
      await copyPromisedText(request);
      notify(
        `${count}명의 영문명·참가링크를 복사했어요. 엑셀 첫 칸에 붙여넣어주세요.`,
      );
    } catch (error) {
      await request.catch(() => {});
      if (text) {
        setFallback(text);
        notify(
          "클립보드 사용이 허용되지 않았어요. 아래 두 열을 직접 복사해주세요.",
        );
      } else notify(errorMessage(fetchError ?? error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="invite-export">
      <div className="invite-export-bar">
        <button
          className="button"
          disabled={busy || me?.role !== "superadmin"}
          onClick={() => void copy()}
        >
          <Copy size={16} />
          {busy ? "전체 참가링크 준비 중…" : "전체 대원 참가링크 복사"}
        </button>
        <span>
          {me?.role === "superadmin"
            ? "영문명·참가링크 두 열로 엑셀에 붙여넣기"
            : "전체 계정 링크는 슈퍼 어드민만 복사할 수 있어요"}
        </span>
      </div>
      {fallback && (
        <div className="invite-export-fallback">
          <div>
            <strong>영문명 · 참가링크</strong>
            <button
              className="icon-button"
              aria-label="참가링크 복사 내용 닫기"
              onClick={() => setFallback("")}
            >
              <X size={18} />
            </button>
          </div>
          <textarea
            aria-label="전체 참가링크 복사 내용"
            readOnly
            rows={6}
            value={fallback}
            onFocus={(event) => event.target.select()}
          />
          <button
            className="text-button"
            onClick={() =>
              void navigator.clipboard
                ?.writeText(fallback)
                .then(() => notify("전체 참가링크를 복사했어요."))
                .catch(() => notify("내용을 길게 눌러 직접 복사해주세요."))
            }
          >
            다시 복사
          </button>
        </div>
      )}
    </div>
  );
}

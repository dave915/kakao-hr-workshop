import { useMemo, useRef, useState } from "react";
import { ClipboardList, Copy, Download, X } from "lucide-react";
import { parseMemberImport } from "../../shared/member-import";
import type { ActionInput } from "../../shared/validation";
import { useWorkshop } from "../lib/store";
import { errorMessage, inviteUrl } from "../lib/utils";
import type { Notify } from "./common";
type Batch = Extract<ActionInput, { action: "createMembers" }>;
function invitationCode() {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}
export default function MemberImport({
  notify,
  onClose,
}: {
  notify: Notify;
  onClose: () => void;
}) {
  const { state, act } = useWorkshop();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const request = useRef<Batch | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Array<{
    handle: string;
    team: string;
    url: string;
  }> | null>(null);
  const rows = useMemo(
    () => parseMemberImport(text, state?.members ?? {}),
    [text, state?.members],
  );
  const errors = rows.filter((r) => r.error).length;
  const submit = async () => {
    if (inFlight.current || !rows.length || (errors && !request.current))
      return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    request.current ??= {
      action: "createMembers",
      requestId: crypto.randomUUID(),
      members: rows.map(({ name, handle, team }) => ({
        name,
        handle,
        team,
        inviteCode: invitationCode(),
      })),
    };
    try {
      const response = await act(request.current);
      if (!response.invitations || response.invitations.length !== rows.length)
        throw new Error(
          "등록 결과를 확인하지 못했어요. 다시 누르면 같은 요청으로 확인해요.",
        );
      setResult(
        request.current.members.map((member, index) => ({
          ...member,
          url: inviteUrl(response.invitations![index].code),
        })),
      );
      notify(`${rows.length}명을 등록하고 개인 링크를 발급했어요.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const safeCell = (value: string) =>
    /^[=+@\-]/.test(value) ? `'${value}` : value;
  const exportText = result
    ? [
        "영문명\t팀명\t개인 입장 링크",
        ...result.map((r) =>
          [r.handle, r.team, r.url].map(safeCell).join("\t"),
        ),
      ].join("\n")
    : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      notify("명단과 개인 링크를 복사했어요. 엑셀에 붙여넣을 수 있어요.");
    } catch {
      notify(
        "복사가 허용되지 않았어요. 아래 내용을 직접 선택하거나 파일로 저장해주세요.",
      );
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", exportText], {
        type: "text/tab-separated-values;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "워크샵-참가자-초대링크.tsv";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="member-import" aria-label="참가자 일괄 등록">
      <div className="admin-section-heading">
        <div>
          <span className="eyebrow">INVITE YOUR EXPLORERS</span>
          <h3>
            {result
              ? `${result.length}명의 초대장이 준비됐어요`
              : "명단을 붙여넣으면 초대 준비 끝"}
          </h3>
        </div>
        <button
          className="icon-button"
          aria-label="일괄 등록 닫기"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {result ? (
        <>
          <p>
            명단과 링크를 복사하거나 저장해주세요. 개인 링크는 해당 참가자에게만
            전달해주세요.
          </p>
          <div className="form-actions">
            <button className="button dark" onClick={() => void copy()}>
              <Copy size={16} />
              명단·링크 복사
            </button>
            <button className="button" onClick={download}>
              <Download size={16} />
              파일로 저장
            </button>
          </div>
          <label className="import-label">
            등록 명단과 개인 링크
            <textarea
              readOnly
              rows={7}
              value={exportText}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <p className="footnote">
            슈퍼 어드민은 ‘전체 대원 참가링크 복사’로 다시 복사할 수 있어요.
            기존 링크를 폐기하려면 참가자 목록에서 재발급해주세요.
          </p>
        </>
      ) : (
        <>
          <p>
            엑셀·구글 시트의 <strong>영문명 → 팀명</strong> 2열을 그대로
            복사해주세요. 한 줄에 한 명, 최대 100명까지 등록해요.
          </p>
          <label className="import-label">
            참가자 명단
            <textarea
              rows={7}
              maxLength={30000}
              disabled={busy}
              placeholder={"영문명\t팀명\nhana.kim\t노랑팀\njun.lee\t초록팀"}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                request.current = null;
                setError("");
              }}
              spellCheck={false}
            />
          </label>
          <p className="footnote">
            탭·쉼표·공백으로 구분해도 돼요. 영문명은 소문자로 정리하며, 팀명이
            없으면 ‘미배정’을 입력해주세요.
          </p>
          {rows.length > 0 && (
            <>
              <div className="import-summary" aria-live="polite">
                <strong>{rows.length}명 확인</strong>
                <span>
                  {errors ? `수정 필요 ${errors}명` : "모두 등록할 수 있어요"}
                </span>
              </div>
              <div className="table-wrap import-preview">
                <table>
                  <thead>
                    <tr>
                      <th>행</th>
                      <th>영문명</th>
                      <th>팀명</th>
                      <th>확인</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 101).map((row) => (
                      <tr
                        key={row.line}
                        className={row.error ? "import-error" : ""}
                      >
                        <td>{row.line}</td>
                        <td>{row.handle || "—"}</td>
                        <td>{row.team || "—"}</td>
                        <td>{row.error || "등록 가능"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button dark"
            disabled={
              busy || !rows.length || (Boolean(errors) && !request.current)
            }
            onClick={() => void submit()}
          >
            <ClipboardList size={17} />
            {busy
              ? "명단과 초대장 저장 중…"
              : request.current
                ? "등록 결과 다시 확인"
                : rows.length
                  ? `${rows.length}명 한 번에 등록`
                  : "명단을 붙여넣어주세요"}
          </button>
          {Boolean(errors) && (
            <p className="footnote">
              표시된 행을 수정하면 등록할 수 있어요. 기존 참가자는 변경되지
              않아요.
            </p>
          )}
        </>
      )}
    </section>
  );
}

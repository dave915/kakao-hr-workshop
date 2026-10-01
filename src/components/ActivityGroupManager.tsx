import { useState } from "react";
import { Eye, EyeOff, Plus, Trash2, Users } from "lucide-react";
import type { ActivityGroup } from "../../shared/types";
import { useWorkshop } from "../lib/store";
import { englishName, errorMessage } from "../lib/utils";
import { Empty, type Notify } from "./common";

export default function ActivityGroupManager({ notify }: { notify: Notify }) {
  const { state, act } = useWorkshop();
  const [draft, setDraft] = useState<ActivityGroup | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState("");
  if (!state) return null;
  const activities = state.activityGroups ?? [];
  const members = Object.values(state.members).sort((a, b) =>
    a.handle.localeCompare(b.handle),
  );
  const start = (item?: ActivityGroup) => {
    setDraft(
      item
        ? structuredClone(item)
        : {
            id: crypto.randomUUID(),
            title: "",
            description: "",
            published: false,
            groups: [{ id: crypto.randomUUID(), name: "1조", memberIds: [] }],
          },
    );
    setQuery("");
    setError("");
    setDeleting("");
  };
  async function run(input: Parameters<typeof act>[0], message: string) {
    setBusy(true);
    setError("");
    try {
      await act(input);
      notify(message);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="activity-manager">
      <div className="activity-manager-heading">
        <div>
          <h2>활동별 조 관리</h2>
          <p>볼링조, 요리조처럼 활동을 만들고 조원을 배정해요.</p>
        </div>
        {!draft && (
          <button
            className="button dark"
            disabled={busy || activities.length >= 20}
            onClick={() => start()}
          >
            <Plus size={17} /> 활동 추가
          </button>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {draft ? (
        <form
          className="form-stack activity-editor"
          onSubmit={async (event) => {
            event.preventDefault();
            if (
              !busy &&
              (await run(
                { action: "saveActivityGroup", activityGroup: draft },
                "조 편성을 저장했어요.",
              ))
            )
              setDraft(null);
          }}
        >
          <fieldset disabled={busy}>
            <legend>
              {activities.some((item) => item.id === draft.id)
                ? "조 편성 수정"
                : "새 활동"}
            </legend>
            <label>
              활동 이름
              <input
                required
                maxLength={40}
                placeholder="예: 볼링조"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label>
              안내 <small>(선택)</small>
              <textarea
                rows={2}
                maxLength={300}
                placeholder="모이는 장소나 조별 안내를 적어주세요."
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
            <label>
              공개 상태
              <select
                value={String(draft.published)}
                onChange={(e) =>
                  setDraft({ ...draft, published: e.target.value === "true" })
                }
              >
                <option value="false">비공개 · 추진위원회만 확인</option>
                <option value="true">공개 · 모든 참가자가 확인</option>
              </select>
            </label>
            <div className="activity-group-fields">
              <h3>조 이름</h3>
              {draft.groups.map((group, index) => (
                <div key={group.id}>
                  <input
                    aria-label={`${index + 1}번째 조 이름`}
                    value={group.name}
                    required
                    maxLength={40}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        groups: draft.groups.map((item) =>
                          item.id === group.id
                            ? { ...item, name: e.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                  <span>
                    {group.memberIds.length + (group.pendingNames?.length ?? 0)}
                    명
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${group.name} 삭제`}
                    disabled={draft.groups.length === 1}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        groups: draft.groups.filter(
                          (item) => item.id !== group.id,
                        ),
                      })
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-button"
                disabled={draft.groups.length >= 50}
                onClick={() =>
                  setDraft({
                    ...draft,
                    groups: [
                      ...draft.groups,
                      {
                        id: crypto.randomUUID(),
                        name: `${draft.groups.length + 1}조`,
                        memberIds: [],
                      },
                    ],
                  })
                }
              >
                <Plus size={16} /> 조 추가
              </button>
              <p className="footnote">
                조를 지우면 해당 조원은 미배정으로 바뀌어요. 저장하면 적용돼요.
              </p>
            </div>
            <details className="activity-pending-editor">
              <summary>아직 계정이 없는 참가자 자리 표시</summary>
              <p className="footnote">
                신규입사자처럼 계정이 정해지지 않은 사람을 한 줄에 한 명씩
                적어주세요. 계정 등록 후 조원을 배정하고 이 이름표는 지워주세요.
              </p>
              {draft.groups.map((group) => (
                <label key={group.id}>
                  {group.name} 합류 예정
                  <textarea
                    rows={2}
                    maxLength={3000}
                    placeholder="예: 신규입사(리워즈)"
                    value={(group.pendingNames ?? []).join("\n")}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        groups: draft.groups.map((item) =>
                          item.id === group.id
                            ? {
                                ...item,
                                pendingNames: event.target.value.split("\n"),
                              }
                            : item,
                        ),
                      })
                    }
                    onBlur={() =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              groups: current.groups.map((item) =>
                                item.id === group.id
                                  ? {
                                      ...item,
                                      pendingNames: (item.pendingNames ?? [])
                                        .map((name) => name.trim())
                                        .filter(Boolean),
                                    }
                                  : item,
                              ),
                            }
                          : current,
                      )
                    }
                  />
                </label>
              ))}
            </details>
            <div className="activity-assignments">
              <h3>
                조원 배정{" "}
                <small>
                  {members.length -
                    draft.groups.reduce(
                      (sum, group) => sum + group.memberIds.length,
                      0,
                    )}
                  명 미배정
                </small>
              </h3>
              <label>
                참가자 검색
                <input
                  type="search"
                  placeholder="이름 또는 아이디"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="activity-member-list">
                {members
                  .filter((member) =>
                    `${englishName(member.handle)} ${member.handle}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((member) => (
                    <label
                      key={member.id}
                      className="activity-member-assignment"
                    >
                      <span>
                        {englishName(member.handle)}
                        <small>{member.handle}</small>
                      </span>
                      <select
                        aria-label={`${member.handle} 조 배정`}
                        value={
                          draft.groups.find((group) =>
                            group.memberIds.includes(member.id),
                          )?.id ?? ""
                        }
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            groups: draft.groups.map((group) => ({
                              ...group,
                              memberIds: [
                                ...group.memberIds.filter(
                                  (uid) => uid !== member.id,
                                ),
                                ...(group.id === e.target.value
                                  ? [member.id]
                                  : []),
                              ],
                            })),
                          })
                        }
                      >
                        <option value="">미배정</option>
                        {draft.groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name || "이름 없는 조"}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
              </div>
            </div>
          </fieldset>
          <div className="activity-actions">
            <button className="button dark" disabled={busy}>
              {busy ? "저장 중…" : "조 편성 저장"}
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setError("");
              }}
            >
              취소
            </button>
          </div>
        </form>
      ) : (
        <div className="activity-admin-list">
          {!activities.length && (
            <Empty
              title="첫 활동을 만들어볼까요?"
              body="활동마다 조 편성과 공개 여부를 따로 관리할 수 있어요."
            />
          )}
          {activities.map((item) => (
            <article key={item.id}>
              <div className="activity-manager-heading">
                <div>
                  <h3>{item.title}</h3>
                  <p>
                    {item.groups.length}개 조 ·{" "}
                    {item.groups.reduce(
                      (sum, group) => sum + group.memberIds.length,
                      0,
                    )}
                    명 배정
                    {item.groups.some((group) => group.pendingNames?.length) &&
                      ` · ${item.groups.reduce((sum, group) => sum + (group.pendingNames?.length ?? 0), 0)}명 합류 예정`}
                  </p>
                </div>
                <span className={`mini-tag ${item.published ? "green" : ""}`}>
                  {item.published ? <Eye size={14} /> : <EyeOff size={14} />}
                  {item.published ? "공개" : "비공개"}
                </span>
              </div>
              <div className="activity-actions">
                <button
                  className="button small"
                  disabled={busy}
                  onClick={() => start(item)}
                >
                  조 편성 수정
                </button>
                <button
                  className="button small"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      {
                        action: "setActivityGroupPublished",
                        id: item.id,
                        published: !item.published,
                      },
                      item.published
                        ? "이 활동의 조 편성을 비공개로 바꿨어요."
                        : "참가자에게 조 편성을 공개했어요.",
                    )
                  }
                >
                  {item.published ? "비공개로 전환" : "참가자에게 공개"}
                </button>
                <button
                  className="text-button danger-text"
                  disabled={busy}
                  onClick={() => setDeleting(item.id)}
                >
                  삭제
                </button>
              </div>
              {deleting === item.id && (
                <div className="activity-delete-confirm">
                  <p>‘{item.title}’의 조 편성을 삭제할까요?</p>
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={() => setDeleting("")}
                  >
                    취소
                  </button>
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await run(
                          { action: "deleteActivityGroup", id: item.id },
                          "활동을 삭제했어요.",
                        )
                      )
                        setDeleting("");
                    }}
                  >
                    삭제하기
                  </button>
                </div>
              )}
            </article>
          ))}
          <p className="footnote">
            <Users size={14} /> 한 사람을 여러 활동에 배정할 수 있어요. 보물찾기
            팀과 점수에는 영향을 주지 않아요.
          </p>
        </div>
      )}
    </section>
  );
}

import { lazy, Suspense, useState, type FormEvent } from "react";
import {
  Users,
  CalendarDays,
  Map,
  Megaphone,
  Settings2,
  Plus,
  Copy,
  RefreshCw,
  Trash2,
  Pencil,
  ShieldCheck,
  Send,
  MapPin,
  Play,
  Pause,
} from "lucide-react";
import { useWorkshop } from "../lib/store";
import {
  errorMessage,
  formatTime,
  fromLocalInput,
  inviteUrl,
  toLocalInput,
} from "../lib/utils";
import { isAdmin, memberRanking } from "../../shared/game";
import type {
  Member,
  Schedule,
  Treasure,
  Settings,
  Position,
} from "../../shared/types";
import type { ActionInput } from "../../shared/validation";
import { Avatar, Drawer, Empty, type Notify } from "./common";
import { locate } from "./Treasure";
const TreasureMap = lazy(() => import("./TreasureMap"));
type Tab = "members" | "schedule" | "treasures" | "notices" | "settings";
const tabs = [
  { id: "members", label: "참가자·권한", icon: Users },
  { id: "schedule", label: "일정 관리", icon: CalendarDays },
  { id: "treasures", label: "보물 배치", icon: Map },
  { id: "notices", label: "공지·푸시", icon: Megaphone },
  { id: "settings", label: "워크샵 설정", icon: Settings2 },
] as const;
export default function Admin({ notify }: { notify: Notify }) {
  const { state, me, act, secrets, demo } = useWorkshop();
  const [tab, setTab] = useState<Tab>("members");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [memberForm, setMemberForm] = useState(false);
  const [newLink, setNewLink] = useState<{ code: string; name: string } | null>(
    null,
  );
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    input: ActionInput;
    name?: string;
  } | null>(null);
  const [scheduleForm, setScheduleForm] = useState<Schedule | null>(null);
  const [treasureForm, setTreasureForm] = useState<
    (Treasure & { kind: "treasure" | "bomb" }) | null
  >(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  if (!state || !me || !isAdmin(me))
    return (
      <Empty
        title="추진위원회 전용 공간이에요"
        body="관리자 권한이 있는 계정으로 입장해주세요."
      />
    );
  const run = async (input: ActionInput, message: string) => {
    setBusy(true);
    try {
      const result = await act(input);
      notify(message);
      return result;
    } catch (e) {
      notify(errorMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const newSchedule = () =>
    setScheduleForm({
      id: crypto.randomUUID(),
      title: "",
      startsAt: state.settings.startsAt,
      endsAt: new Date(
        Date.parse(state.settings.startsAt) + 3600000,
      ).toISOString(),
      location: "",
      description: "",
      category: "activity",
    });
  const newTreasure = (
    lat = state.settings.center[0],
    lng = state.settings.center[1],
  ) =>
    setTreasureForm({
      id: crypto.randomUUID(),
      name: "",
      hint: "",
      lat,
      lng,
      points: 100,
      radius: 50,
      foundBy: null,
      foundAt: null,
      kind: "treasure",
    });
  const addMember = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const member = {
      name: String(fd.get("name")),
      handle: String(fd.get("handle")),
      team: String(fd.get("team")),
    };
    const r = await run(
      { action: "createMember", member },
      "탐험대원을 등록했어요. 개인 링크를 전달해주세요.",
    );
    if (r?.code) {
      setMemberForm(false);
      setNewLink({ code: r.code, name: member.name });
    }
  };
  const executeConfirm = async () => {
    if (!confirm) return;
    const r = await run(confirm.input, "변경 내용을 저장했어요.");
    if (r) {
      if (r.code) setNewLink({ code: r.code, name: confirm.name ?? "" });
      setConfirm(null);
    }
  };
  const copy = async () => {
    if (!newLink) return;
    try {
      await navigator.clipboard.writeText(inviteUrl(newLink.code));
      notify("개인 입장 링크를 복사했어요.");
    } catch {
      notify("복사 권한이 없어요. 아래 링크를 직접 선택해 복사해주세요.");
    }
  };
  return (
    <div className="admin-page page-enter">
      <div className="page-intro">
        <div>
          <span className="eyebrow">BEHIND THE ADVENTURE</span>
          <h1>추진위원회 베이스캠프</h1>
          <p>함께할 사람부터 마지막 보물까지, 모험을 준비해요.</p>
        </div>
        <span className="outline-pill">
          <ShieldCheck size={15} />
          {me.role === "superadmin" ? "슈퍼 어드민" : "추진위원회"}
        </span>
      </div>
      <div className="admin-summary">
        <span>
          <strong>{Object.keys(state.members).length}</strong> 탐험대원
        </span>
        <span>
          <strong>
            {Object.values(state.members).filter((m) => m.joined).length}
          </strong>{" "}
          입장 완료
        </span>
        <span>
          <strong>
            {state.treasures.filter((t) => t.foundBy).length}/
            {state.treasures.length}
          </strong>{" "}
          보물 발견
        </span>
        <button
          className={`button small ${state.settings.gameOpen ? "" : "dark"}`}
          disabled={busy}
          onClick={() =>
            void run(
              {
                action: "saveSettings",
                settings: {
                  ...state.settings,
                  gameOpen: !state.settings.gameOpen,
                },
              },
              state.settings.gameOpen
                ? "보물찾기를 잠시 멈췄어요."
                : "보물찾기를 시작했어요.",
            )
          }
        >
          {state.settings.gameOpen ? <Pause size={15} /> : <Play size={15} />}
          탐험 {state.settings.gameOpen ? "일시 정지" : "시작"}
        </button>
      </div>
      <nav className="admin-tabs" aria-label="관리 메뉴">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "selected" : ""}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={17} />
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "members" && (
        <section>
          <div className="admin-section-heading">
            <div>
              <h2>함께 떠날 탐험대원</h2>
              <p>
                개인 링크로 입장해요. 관리자 지정은 슈퍼 어드민만 할 수 있어요.
              </p>
            </div>
            <button className="button dark" onClick={() => setMemberForm(true)}>
              <Plus size={17} />
              참가자 추가
            </button>
          </div>
          <input
            className="search-input"
            aria-label="참가자 검색"
            placeholder="이름, 아이디, 팀으로 찾기"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>탐험대원</th>
                  <th>소속 팀</th>
                  <th>권한</th>
                  <th>발견 기록</th>
                  <th>개인 입장 링크</th>
                </tr>
              </thead>
              <tbody>
                {memberRanking(state)
                  .filter((m) =>
                    `${m.name} ${m.handle} ${m.team}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div className="table-person">
                          <Avatar name={m.name} />
                          <span>
                            <strong>{m.name}</strong>
                            <small>
                              {m.handle} ·{" "}
                              {m.joined ? "입장 완료" : "입장 대기"}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <TeamEdit
                          member={m}
                          disabled={
                            busy ||
                            state.treasures.some((t) => Boolean(t.foundBy))
                          }
                          onSave={(team) =>
                            void run(
                              { action: "updateTeam", memberId: m.id, team },
                              "팀을 변경했어요.",
                            )
                          }
                        />
                      </td>
                      <td>
                        {m.role === "superadmin" ? (
                          <span className="mini-tag yellow">슈퍼 어드민</span>
                        ) : me.role === "superadmin" ? (
                          <select
                            aria-label={`${m.name} 권한`}
                            value={m.role}
                            disabled={busy}
                            onChange={(e) =>
                              void run(
                                {
                                  action: "setRole",
                                  memberId: m.id,
                                  role: e.target.value as "member" | "admin",
                                },
                                "관리자 권한을 변경했어요.",
                              )
                            }
                          >
                            <option value="member">참가자</option>
                            <option value="admin">추진위원회</option>
                          </select>
                        ) : (
                          <span>
                            {m.role === "admin" ? "추진위원회" : "참가자"}
                          </span>
                        )}
                      </td>
                      <td>
                        <strong>{m.score} P</strong>
                        <small className="block">보물 {m.found}개</small>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          disabled={
                            busy ||
                            m.id === me.id ||
                            (m.role !== "member" && me.role !== "superadmin")
                          }
                          title={
                            m.id === me.id
                              ? "내 계정 링크는 운영자 복구 도구에서 재발급해요"
                              : undefined
                          }
                          onClick={() =>
                            setConfirm({
                              title: "개인 입장 링크 재발급",
                              body: `${m.name}님의 기존 링크와 로그인은 사용할 수 없게 돼요. 새 링크를 전달해주세요.`,
                              input: { action: "rotateInvite", memberId: m.id },
                              name: m.name,
                            })
                          }
                        >
                          <RefreshCw size={14} />
                          재발급
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "schedule" && (
        <section>
          <div className="admin-section-heading">
            <div>
              <h2>오늘의 여정 만들기</h2>
              <p>저장한 일정은 참가자 화면에 바로 반영돼요.</p>
            </div>
            <button className="button dark" onClick={newSchedule}>
              <Plus size={17} />
              일정 추가
            </button>
          </div>
          {state.schedule.length ? (
            <div className="admin-item-list">
              {state.schedule.map((s) => (
                <article key={s.id}>
                  <span className="admin-item-time">
                    {s.startsAt.slice(5, 10)}
                    <strong>{formatTime(s.startsAt)}</strong>
                  </span>
                  <div>
                    <h3>{s.title}</h3>
                    <p>
                      {s.location} · {formatTime(s.startsAt)}–
                      {formatTime(s.endsAt)}
                    </p>
                  </div>
                  <button
                    aria-label={`${s.title} 수정`}
                    className="icon-button"
                    onClick={() => setScheduleForm(s)}
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    aria-label={`${s.title} 삭제`}
                    className="icon-button"
                    onClick={() =>
                      setConfirm({
                        title: "일정 삭제",
                        body: `‘${s.title}’ 일정을 삭제할까요?`,
                        input: { action: "deleteSchedule", id: s.id },
                      })
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="첫 번째 여정을 적어주세요"
              body="시간, 장소, 함께할 활동을 등록해요."
            />
          )}
        </section>
      )}
      {tab === "treasures" && (
        <section>
          <div className="admin-section-heading">
            <div>
              <h2>설렘을 숨겨둘 곳</h2>
              <p>
                지도를 눌러 보물을 배치하세요. 꽝의 정체는 참가자에게 숨겨져요.
              </p>
            </div>
            <button className="button dark" onClick={() => newTreasure()}>
              <Plus size={17} />
              보물 추가
            </button>
          </div>
          <Suspense
            fallback={<div className="map-loading">지도를 펼치고 있어요…</div>}
          >
            <TreasureMap
              treasures={state.treasures}
              center={state.settings.center}
              position={position}
              selected={chosen}
              onSelect={(id) => {
                setChosen(id);
                const t = state.treasures.find((t) => t.id === id)!;
                setTreasureForm({ ...t, kind: secrets[t.id] ?? "treasure" });
              }}
              onPlace={(lat, lng) => newTreasure(lat, lng)}
              secrets={secrets}
              onLocate={() =>
                void locate()
                  .then(setPosition)
                  .catch((e) => notify(errorMessage(e)))
              }
              locationName={state.settings.location}
            />
          </Suspense>
          <div className="admin-item-list treasure-admin-list">
            {state.treasures.map((t) => (
              <article key={t.id}>
                <span
                  className={`mini-tag ${secrets[t.id] === "bomb" ? "orange" : "green"}`}
                >
                  {secrets[t.id] === "bomb" ? "꽝 · 5분" : "보물"}
                </span>
                <div>
                  <h3>{t.name}</h3>
                  <p>
                    {t.foundBy
                      ? `${state.members[t.foundBy]?.name} 발견`
                      : `${t.points} P · 반경 ${t.radius}m`}
                  </p>
                </div>
                <button
                  className="icon-button"
                  aria-label={`${t.name} 수정`}
                  disabled={Boolean(t.foundBy)}
                  onClick={() =>
                    setTreasureForm({ ...t, kind: secrets[t.id] ?? "treasure" })
                  }
                >
                  <Pencil size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`${t.name} 삭제`}
                  disabled={Boolean(t.foundBy)}
                  onClick={() =>
                    setConfirm({
                      title: "보물 삭제",
                      body: `‘${t.name}’ 보물을 지도에서 지울까요?`,
                      input: { action: "deleteTreasure", id: t.id },
                    })
                  }
                >
                  <Trash2 size={17} />
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      {tab === "notices" && (
        <section className="notice-admin">
          <div>
            <h2>베이스캠프 소식 전하기</h2>
            <p className="muted">
              공지로 남기고, 알림을 켠 참가자에게 푸시도 보낼 수 있어요.
            </p>
            <form
              className="form-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                const push = fd.get("push") === "on";
                const r = await run(
                  {
                    action: "publishNotice",
                    title: String(fd.get("title")),
                    body: String(fd.get("body")),
                    audience: String(fd.get("audience")),
                    push,
                  },
                  "공지를 게시했어요.",
                );
                if (r) {
                  form.reset();
                  if (push)
                    notify(
                      demo
                        ? "예시 공지를 저장했어요. 실제 푸시는 발송되지 않아요."
                        : `공지 게시 완료 · FCM 접수 ${r.delivered ?? 0}건, 실패 ${r.failed ?? 0}건`,
                    );
                }
              }}
            >
              <label>
                받는 탐험대
                <select name="audience">
                  <option value="all">모든 탐험대원</option>
                  {[
                    ...new Set(Object.values(state.members).map((m) => m.team)),
                  ].map((team) => (
                    <option key={team}>{team}</option>
                  ))}
                </select>
              </label>
              <label>
                공지 제목
                <input
                  required
                  name="title"
                  maxLength={100}
                  placeholder="예: 10분 뒤, 점심 장소에서 만나요!"
                />
              </label>
              <label>
                전할 내용
                <textarea
                  name="body"
                  required
                  maxLength={2000}
                  rows={6}
                  placeholder="모이는 시간과 장소를 함께 알려주세요."
                />
              </label>
              <label className="check-label">
                <input type="checkbox" name="push" defaultChecked />
                푸시 알림도 함께 보내기
              </label>
              {demo && (
                <p className="footnote">
                  미리보기에서는 공지만 저장하고 실제 알림은 보내지 않아요.
                </p>
              )}
              <button className="button dark" disabled={busy}>
                <Send size={17} />
                {busy ? "소식을 전하고 있어요…" : "공지 게시하기"}
              </button>
            </form>
          </div>
          <div>
            <h3>보낸 소식</h3>
            <div className="sent-notices">
              {state.notices.map((n) => (
                <article key={n.id}>
                  <span className="mini-tag">
                    {n.audience === "all" ? "전체" : n.audience}
                  </span>
                  <h4>{n.title}</h4>
                  <p>
                    {n.pushStatus === "none"
                      ? "앱 공지"
                      : n.pushStatus === "pending"
                        ? "푸시 처리 중"
                        : `FCM 접수 ${n.delivered ?? 0}건 · 실패 ${n.failed ?? 0}건`}
                  </p>
                  {n.pushStatus === "pending" && (
                    <small>장시간 대기 중이면 운영 로그를 확인해주세요.</small>
                  )}
                </article>
              ))}
            </div>
            <p className="footnote">
              FCM 접수는 기기 전달·열람을 보장하지 않아요. 대상 팀 안내는 수신
              화면을 필터링하며 비밀 공지 용도로 사용하지 않아요.
            </p>
          </div>
        </section>
      )}
      {tab === "settings" && (
        <SettingsForm
          key={state.settings.title + state.settings.startsAt}
          settings={state.settings}
          busy={busy}
          onSave={(settings) =>
            void run(
              { action: "saveSettings", settings },
              "워크샵 설정을 저장했어요.",
            )
          }
        />
      )}
      {memberForm && (
        <Drawer
          title="탐험대원 초대하기"
          onClose={() => !busy && setMemberForm(false)}
        >
          <form className="form-stack" onSubmit={addMember}>
            <label>
              이름
              <input
                name="name"
                required
                maxLength={40}
                placeholder="예: 데이브"
                autoFocus
              />
            </label>
            <label>
              아이디
              <input
                name="handle"
                required
                maxLength={40}
                pattern="[a-z0-9._\-]+"
                placeholder="예: dave.h"
                autoCapitalize="off"
              />
            </label>
            <label>
              팀
              <input
                name="team"
                required
                maxLength={40}
                placeholder="예: 옐로우 탐험대"
                list="team-options"
              />
              <datalist id="team-options">
                {[
                  ...new Set(Object.values(state.members).map((m) => m.team)),
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </datalist>
            </label>
            <p className="footnote">
              등록 후 개인 입장 링크가 한 번 표시돼요. 이 링크를 가진 사람은
              해당 참가자로 입장할 수 있어요.
            </p>
            <button className="button dark full" disabled={busy}>
              {busy ? "초대장 만드는 중…" : "등록하고 개인 링크 발급"}
            </button>
          </form>
        </Drawer>
      )}
      {newLink && (
        <Drawer
          title={`${newLink.name}님의 개인 초대장`}
          onClose={() => setNewLink(null)}
        >
          <div className="form-stack">
            <span className="invite-symbol">✦</span>
            <p>
              이 링크로 접속하면 자동으로 입장해요. 해당 참가자에게만
              전달해주세요.
            </p>
            <label>
              개인 입장 링크
              <textarea
                readOnly
                rows={4}
                value={inviteUrl(newLink.code)}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <button className="button dark full" onClick={() => void copy()}>
              <Copy size={17} />
              링크 복사
            </button>
            <p className="footnote">
              초대장은 발급 시 한 번만 표시해요. 잃어버렸다면 참가자 목록에서
              재발급해주세요.
              {demo ? " 데모 링크는 같은 브라우저에서만 사용할 수 있어요." : ""}
            </p>
          </div>
        </Drawer>
      )}
      {confirm && (
        <Drawer title={confirm.title} onClose={() => !busy && setConfirm(null)}>
          <p className="confirm-copy">{confirm.body}</p>
          <div className="form-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              취소
            </button>
            <button
              className="button dark"
              disabled={busy}
              onClick={() => void executeConfirm()}
            >
              {busy ? "처리 중…" : "확인하고 진행"}
            </button>
          </div>
        </Drawer>
      )}
      {scheduleForm && (
        <Drawer
          title="여정 기록하기"
          onClose={() => !busy && setScheduleForm(null)}
        >
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const r = await run(
                {
                  action: "saveSchedule",
                  schedule: {
                    ...scheduleForm,
                    title: String(fd.get("title")),
                    startsAt: fromLocalInput(String(fd.get("startsAt"))),
                    endsAt: fromLocalInput(String(fd.get("endsAt"))),
                    location: String(fd.get("location")),
                    description: String(fd.get("description")),
                    category: String(
                      fd.get("category"),
                    ) as Schedule["category"],
                  },
                },
                "일정을 저장했어요.",
              );
              if (r) setScheduleForm(null);
            }}
          >
            <label>
              여정 이름
              <input
                name="title"
                required
                maxLength={100}
                defaultValue={scheduleForm.title}
              />
            </label>
            <label>
              시작 시간 (한국 시간)
              <input
                type="datetime-local"
                name="startsAt"
                required
                defaultValue={toLocalInput(scheduleForm.startsAt)}
              />
            </label>
            <label>
              종료 시간 (한국 시간)
              <input
                type="datetime-local"
                name="endsAt"
                required
                defaultValue={toLocalInput(scheduleForm.endsAt)}
              />
            </label>
            <label>
              모이는 장소
              <input
                required
                name="location"
                maxLength={100}
                defaultValue={scheduleForm.location}
              />
            </label>
            <label>
              종류
              <select name="category" defaultValue={scheduleForm.category}>
                <option value="gather">모임</option>
                <option value="activity">함께하는 활동</option>
                <option value="meal">식사</option>
                <option value="rest">휴식</option>
              </select>
            </label>
            <label>
              안내
              <textarea
                name="description"
                rows={3}
                maxLength={1000}
                defaultValue={scheduleForm.description}
              />
            </label>
            <button className="button dark full" disabled={busy}>
              일정 저장하기
            </button>
          </form>
        </Drawer>
      )}
      {treasureForm && (
        <Drawer
          title="보물 숨기기"
          onClose={() => !busy && setTreasureForm(null)}
        >
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const r = await run(
                {
                  action: "saveTreasure",
                  treasure: {
                    id: treasureForm.id,
                    name: String(fd.get("name")),
                    hint: String(fd.get("hint")),
                    lat: Number(fd.get("lat")),
                    lng: Number(fd.get("lng")),
                    points: Number(fd.get("points")),
                    radius: Number(fd.get("radius")),
                    kind: String(fd.get("kind")) as "treasure" | "bomb",
                  },
                },
                "지도에 보물을 숨겼어요.",
              );
              if (r) setTreasureForm(null);
            }}
          >
            <label>
              보물 이름
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={treasureForm.name}
              />
            </label>
            <label>
              작은 힌트
              <textarea
                name="hint"
                required
                maxLength={300}
                rows={3}
                defaultValue={treasureForm.hint}
              />
            </label>
            <div className="form-pair">
              <label>
                위도
                <input
                  name="lat"
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  required
                  defaultValue={treasureForm.lat}
                />
              </label>
              <label>
                경도
                <input
                  name="lng"
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  required
                  defaultValue={treasureForm.lng}
                />
              </label>
            </div>
            <label>
              숨길 선물
              <select name="kind" defaultValue={treasureForm.kind}>
                <option value="treasure">보물 · 포인트 획득</option>
                <option value="bomb">꽝 · 탐험 5분 휴식</option>
              </select>
            </label>
            <div className="form-pair">
              <label>
                포인트
                <input
                  name="points"
                  type="number"
                  min={10}
                  max={1000}
                  required
                  defaultValue={treasureForm.points}
                />
              </label>
              <label>
                발견 반경 (m)
                <input
                  name="radius"
                  type="number"
                  min={10}
                  max={200}
                  required
                  defaultValue={treasureForm.radius}
                />
              </label>
            </div>
            <p className="footnote">
              꽝의 종류는 발견하기 전까지 참가자에게 공개되지 않아요. 이름과
              힌트에 정답을 적지 마세요.
            </p>
            <button
              className="button dark full"
              disabled={busy || Boolean(treasureForm.foundBy)}
            >
              보물 저장하기
            </button>
          </form>
        </Drawer>
      )}
    </div>
  );
}
function TeamEdit({
  member,
  disabled,
  onSave,
}: {
  member: Member;
  disabled: boolean;
  onSave: (team: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(member.team);
  return editing ? (
    <form
      className="team-edit"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) {
          onSave(value.trim());
          setEditing(false);
        }
      }}
    >
      <input
        aria-label={`${member.name} 팀`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required
        maxLength={40}
      />
      <button className="text-button">저장</button>
      <button
        type="button"
        className="text-button"
        onClick={() => setEditing(false)}
      >
        취소
      </button>
    </form>
  ) : (
    <button
      className="text-button"
      disabled={disabled}
      onClick={() => {
        setValue(member.team);
        setEditing(true);
      }}
    >
      {member.team}
      <Pencil size={12} />
    </button>
  );
}
function SettingsForm({
  settings,
  busy,
  onSave,
}: {
  settings: Settings;
  busy: boolean;
  onSave: (s: Settings) => void;
}) {
  return (
    <section className="settings-editor">
      <h2>우리 워크샵의 기본 정보</h2>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          onSave({
            ...settings,
            title: String(fd.get("title")),
            subtitle: String(fd.get("subtitle")),
            location: String(fd.get("location")),
            startsAt: fromLocalInput(String(fd.get("startsAt"))),
            endsAt: fromLocalInput(String(fd.get("endsAt"))),
            center: [Number(fd.get("lat")), Number(fd.get("lng"))],
          });
        }}
      >
        <label>
          워크샵 이름
          <input
            name="title"
            required
            maxLength={60}
            defaultValue={settings.title}
          />
        </label>
        <label>
          한 줄 소개
          <input
            name="subtitle"
            required
            maxLength={120}
            defaultValue={settings.subtitle}
          />
        </label>
        <label>
          장소
          <input
            name="location"
            required
            maxLength={100}
            defaultValue={settings.location}
          />
        </label>
        <div className="form-pair">
          <label>
            시작 일시
            <input
              name="startsAt"
              type="datetime-local"
              required
              defaultValue={toLocalInput(settings.startsAt)}
            />
          </label>
          <label>
            종료 일시
            <input
              name="endsAt"
              type="datetime-local"
              required
              defaultValue={toLocalInput(settings.endsAt)}
            />
          </label>
        </div>
        <p className="footnote">
          <MapPin size={14} />
          지도의 기본 중심 좌표를 설정해요. 모든 일시는 한국 시간 기준이에요.
        </p>
        <div className="form-pair">
          <label>
            중심 위도
            <input
              name="lat"
              type="number"
              step="any"
              min={-90}
              max={90}
              required
              defaultValue={settings.center[0]}
            />
          </label>
          <label>
            중심 경도
            <input
              name="lng"
              type="number"
              step="any"
              min={-180}
              max={180}
              required
              defaultValue={settings.center[1]}
            />
          </label>
        </div>
        <button className="button dark" disabled={busy}>
          워크샵 정보 저장
        </button>
      </form>
    </section>
  );
}

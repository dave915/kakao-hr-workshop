import { useEffect, useState } from "react";
import {
  Bell,
  Download,
  LogOut,
  ShieldCheck,
  Smartphone,
  Ticket,
  ArrowUpRight,
} from "lucide-react";
import { useWorkshop } from "../lib/store";
import {
  disablePush,
  enablePush,
  getPushStatus,
  type PushStatus,
} from "../lib/pwa";
import { englishName, errorMessage } from "../lib/utils";
import type { Page } from "../../shared/types";
import { isAdmin } from "../../shared/game";
import { Avatar, Drawer, type Notify } from "./common";
export interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export default function Profile({
  notify,
  navigate,
  installPrompt,
}: {
  notify: Notify;
  navigate: (p: Page) => void;
  installPrompt: InstallPrompt | null;
}) {
  const { me, state, demo, logout, switchDemo, act } = useWorkshop();
  const [busy, setBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState<
    PushStatus | "checking" | "error"
  >("checking");
  const push = pushStatus === "enabled";
  const [guide, setGuide] = useState(false);
  useEffect(() => {
    if (busy) return;
    let cancelled = false;
    const check = () => {
      void getPushStatus().then(
        (status) => {
          if (!cancelled) setPushStatus(status);
        },
        () => {
          if (!cancelled) setPushStatus("error");
        },
      );
    };
    check();
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", check);
    };
  }, [busy]);
  if (!me || !state) return null;
  const toggle = async (reconnect = false) => {
    setBusy(true);
    try {
      if (push && !reconnect) {
        await disablePush(act);
        setPushStatus("disabled");
        notify("알림 받기를 해제했어요.");
      } else {
        await enablePush(act);
        setPushStatus("enabled");
        notify(
          reconnect
            ? "이 기기의 알림을 다시 연결했어요."
            : "워크샵 소식을 가장 먼저 알려드릴게요.",
        );
      }
    } catch (e) {
      notify(errorMessage(e));
      setPushStatus(await getPushStatus().catch(() => "error" as const));
    } finally {
      setBusy(false);
    }
  };
  const exit = async () => {
    setBusy(true);
    try {
      if (localStorage.getItem("hr-push-token")) await disablePush(act);
      await logout();
      navigate("home");
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const install = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted")
        notify("홈 화면에 탐험 앱을 추가했어요.");
    } else setGuide(true);
  };
  return (
    <div className="page-enter narrow-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">MY EXPLORER PASS</span>
          <h1>나의 탐험 여권</h1>
          <p>오늘의 발견과 나의 모든 여정을 담아요.</p>
        </div>
        <Ticket size={38} className="page-symbol" />
      </div>
      <div className="profile-card">
        <Avatar name={englishName(me.handle)} size="large" />
        <div>
          <span className="mini-tag green">
            {me.role === "superadmin"
              ? "슈퍼 어드민"
              : me.role === "admin"
                ? "추진위원회"
                : "탐험대원"}
          </span>
          <h2>{englishName(me.handle)}</h2>
          <p>{me.team}</p>
        </div>
        <div className="profile-points">
          <strong>{me.score.toLocaleString()} P</strong>
          <span>보물 {me.found}개 발견</span>
        </div>
      </div>
      <div className="settings-list">
        <button onClick={() => void install()}>
          <Download />
          <span>
            <strong>홈 화면에 추가하기</strong>
            <small>앱처럼 편하게 탐험해요</small>
          </span>
          <ArrowUpRight size={20} />
        </button>
        <button
          disabled={busy || pushStatus === "checking"}
          role="switch"
          aria-checked={push}
          onClick={() => void toggle()}
        >
          <Bell />
          <span>
            <strong>워크샵 소식 받기</strong>
            <small>
              {pushStatus === "checking"
                ? "이 기기의 알림 상태를 확인하고 있어요"
                : push
                  ? "이 기기에 알림이 연결되어 있어요"
                  : pushStatus === "stale"
                    ? "알림 연결이 끊겼어요. 눌러서 다시 연결해주세요"
                    : pushStatus === "blocked"
                      ? "기기 설정에서 이 앱의 알림을 허용해주세요"
                      : pushStatus === "unsupported"
                        ? "푸시를 지원하는 브라우저에서 열어주세요"
                        : pushStatus === "error"
                          ? "상태를 확인하지 못했어요. 눌러서 다시 연결해주세요"
                          : "중요한 안내를 푸시로 받아보세요"}
            </small>
          </span>
          <span className={`toggle ${push ? "on" : ""}`} />
        </button>
        {push && (
          <button disabled={busy} onClick={() => void toggle(true)}>
            <Smartphone />
            <span>
              <strong>알림 다시 연결하기</strong>
              <small>알림이 오지 않으면 이 기기를 다시 등록해주세요</small>
            </span>
            <ArrowUpRight size={20} />
          </button>
        )}
        {isAdmin(me) && (
          <button onClick={() => navigate("admin")}>
            <ShieldCheck />
            <span>
              <strong>추진위원회 베이스캠프</strong>
              <small>참가자, 일정과 보물을 관리해요</small>
            </span>
            <ArrowUpRight size={20} />
          </button>
        )}
        <button disabled={busy} onClick={() => void exit()}>
          <LogOut />
          <span>
            <strong>로그아웃</strong>
            <small>개인 입장 링크로 다시 들어올 수 있어요</small>
          </span>
        </button>
      </div>
      {demo && (
        <div className="demo-tools">
          <h3>미리보기 역할 전환</h3>
          <p>
            이 브라우저에 저장된 예시 데이터로 기능을 체험해요. 실제 참가자
            정보나 푸시는 연결되지 않아요.
          </p>
          <label>
            탐험대원
            <select value={me.id} onChange={(e) => switchDemo(e.target.value)}>
              {Object.values(state.members).map((m) => (
                <option key={m.id} value={m.id}>
                  {englishName(m.handle)} ·{" "}
                  {m.role === "superadmin"
                    ? "슈퍼 어드민"
                    : m.role === "admin"
                      ? "관리자"
                      : "참가자"}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {guide && (
        <Drawer
          title="홈 화면에 탐험 앱 추가하기"
          onClose={() => setGuide(false)}
        >
          <div className="install-guide">
            <Smartphone size={40} />
            <h3>iPhone · Safari</h3>
            <p>
              공유 버튼 → ‘홈 화면에 추가’를 선택해주세요. 추가한 앱으로 열면
              알림을 받을 수 있어요.
            </p>
            <h3>Android · Chrome</h3>
            <p>
              오른쪽 위 메뉴 → ‘홈 화면에 추가’ 또는 ‘앱 설치’를 선택해주세요.
            </p>
            <p className="footnote">
              설치 메뉴가 없으면 이미 설치되었는지 확인해주세요. 푸시 사용 가능
              여부는 기기와 브라우저에 따라 달라요.
            </p>
          </div>
        </Drawer>
      )}
    </div>
  );
}

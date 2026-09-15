import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Home as HomeIcon,
  CalendarDays,
  Compass,
  Flag,
  Bell,
  Ticket,
  ShieldCheck,
  ArrowUpRight,
  ChevronRight,
  WifiOff,
  X,
  CheckCircle2,
  Footprints,
  Menu,
} from "lucide-react";
import Home from "./components/Home";
import Timeline from "./components/Timeline";
import Team from "./components/Team";
import Notices from "./components/Notices";
import Profile, { type InstallPrompt } from "./components/Profile";
import { Avatar } from "./components/common";
import { ExpeditionArt } from "./components/ExpeditionArt";
import { useWorkshop } from "./lib/store";
import { app, configured } from "./lib/firebase";
import { isAdmin } from "../shared/game";
import { englishName, errorMessage } from "./lib/utils";
import { registerWorker } from "./lib/pwa";
import { startDeviceReporting } from "./lib/device-status";
import { useUnreadNotices } from "./lib/notice-read";
import type { Page } from "../shared/types";
const Treasure = lazy(() => import("./components/Treasure"));
const Admin = lazy(() => import("./components/Admin"));
const navigation = [
  { id: "home", name: "탐험 홈", short: "홈", icon: HomeIcon },
  { id: "timeline", name: "오늘의 여정", short: "일정", icon: CalendarDays },
  { id: "treasure", name: "보물찾기", short: "보물찾기", icon: Compass },
  { id: "team", name: "우리 탐험대", short: "우리 팀", icon: Flag },
  { id: "notices", name: "베이스캠프 소식", short: "소식", icon: Bell },
] as const;
const pageNames: Record<Page, string> = {
  home: "탐험 홈",
  timeline: "오늘의 여정",
  treasure: "보물찾기",
  team: "우리 탐험대",
  notices: "베이스캠프 소식",
  profile: "나의 탐험 여권",
  admin: "추진위원회",
};
const pageFromHash = (): Page => {
  const p = location.hash.replace("#/", "") as Page;
  return p in pageNames ? p : "home";
};
export default function App() {
  const {
    state,
    me,
    loading,
    error,
    demo,
    login,
    clearError,
    switchDemo,
    act,
  } = useWorkshop();
  const [page, setPage] = useState<Page>(pageFromHash);
  const visibleNotices =
    state?.notices.filter(
      (n) => n.audience === "all" || n.audience === me?.team,
    ) ?? [];
  const unread = useUnreadNotices(me?.id, visibleNotices, page === "notices");
  useEffect(() => {
    if (!me || demo) return;
    return startDeviceReporting(act);
  }, [me?.id, demo, act]);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(Date.now());
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [code, setCode] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(
    null,
  );
  const [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const joiningCode = useRef("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6000);
  };
  const navigate = (target: Page) => {
    location.hash = `/${target}`;
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
    };
  }, []);
  useEffect(() => {
    const handle = () => {
      if (location.hash.startsWith("#/join/")) {
        const raw = location.hash.slice(7);
        if (joiningCode.current === raw) return;
        joiningCode.current = raw;
        setJoining(true);
        setJoinError("");
        let value = "";
        try {
          value = decodeURIComponent(raw);
        } catch {
          setJoining(false);
          setJoinError("올바른 입장 링크가 아니에요.");
          return;
        }
        void login(value)
          .then(() => {
            history.replaceState(null, "", `${location.pathname}#/home`);
            setPage("home");
          })
          .catch((e) => setJoinError(errorMessage(e)))
          .finally(() => setJoining(false));
      } else setPage(pageFromHash());
    };
    handle();
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, [login]);
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPrompt);
    };
    const installed = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  useEffect(() => {
    const promise = registerWorker();
    if (promise)
      void promise
        .then((reg) => {
          if (reg.waiting) setUpdate(reg);
          reg.addEventListener("updatefound", () => {
            const worker = reg.installing;
            worker?.addEventListener("statechange", () => {
              if (
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              )
                setUpdate(reg);
            });
          });
        })
        .catch(() =>
          notify(
            "앱의 오프라인 기능을 준비하지 못했어요. 네트워크를 확인해주세요.",
          ),
        );
  }, []);
  useEffect(() => {
    if (!app || !me) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void import("firebase/messaging").then(async (m) => {
      if ((await m.isSupported()) && !cancelled)
        stop = m.onMessage(m.getMessaging(app!), (payload) =>
          notify(payload.data?.title || "새로운 워크샵 소식이 도착했어요."),
        );
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [me?.id]);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  if (loading || joining)
    return (
      <div className="entry-loading">
        <Compass size={42} />
        <h1>
          {joining
            ? "나의 탐험 여권을 확인하고 있어요"
            : "베이스캠프에 연결하고 있어요"}
        </h1>
        <p>잠시만 기다려주세요.</p>
      </div>
    );
  if (!me || !state || joinError)
    return (
      <div className="entry-page">
        <div className="entry-brand">
          kakao<span>bank</span> <small>HR WORKSHOP</small>
        </div>
        <div className="entry-body">
          <span className="eyebrow">YOUR ADVENTURE STARTS HERE</span>
          <h1>
            일상 밖으로,
            <br />
            함께 떠나볼까요?
          </h1>
          <p>
            개인 초대 링크로 들어오면
            <br />
            당신의 모험이 시작돼요.
          </p>
          <ExpeditionArt />
          {!configured && !demo ? (
            <div className="entry-form">
              <h2>탐험을 준비하고 있어요</h2>
              <p>
                아직 Firebase 프로젝트가 연결되지 않았어요. 운영자가 배포 설정을
                완료하면 입장할 수 있어요.
              </p>
            </div>
          ) : (
            <form
              className="entry-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setJoining(true);
                setJoinError("");
                try {
                  await login(code.trim());
                  clearError();
                  history.replaceState(null, "", `${location.pathname}#/home`);
                  setPage("home");
                } catch (e) {
                  setJoinError(errorMessage(e));
                } finally {
                  setJoining(false);
                }
              }}
            >
              <label>
                개인 입장 코드
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="추진위원회가 전달한 코드"
                  autoComplete="off"
                  required
                />
              </label>
              <button className="button dark full">
                나의 모험 시작하기
                <ArrowUpRight size={17} />
              </button>
              {(joinError || error) && (
                <p role="alert" className="form-error">
                  {joinError || error}
                </p>
              )}
              <p className="footnote">
                초대 링크를 잃어버렸다면 추진위원회에 문의해주세요.
              </p>
            </form>
          )}
          {demo && (
            <button
              className="text-button"
              onClick={() => {
                setJoinError("");
                switchDemo("dave.h");
                navigate("home");
              }}
            >
              예시 데이터로 둘러보기
              <ArrowUpRight size={16} />
            </button>
          )}
        </div>
      </div>
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}>
        <a className="wordmark" href="#/home">
          kakao<span>bank</span>
          <small>HR WORKSHOP</small>
        </a>
        <div className="sidebar-label">OUR LITTLE ADVENTURE</div>
        <nav aria-label="메인 메뉴">
          {navigation.map((n) => (
            <button
              key={n.id}
              onClick={() => navigate(n.id)}
              className={page === n.id ? "active" : ""}
              aria-current={page === n.id ? "page" : undefined}
            >
              <n.icon size={20} />
              <span>{n.name}</span>
              {n.id === "notices" && unread > 0 && <small>{unread}</small>}
              {page === n.id && <span className="nav-spark">✦</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-doodle">✳</span>
            <strong>
              오늘의 우리에게,
              <br />
              새로운 발견을.
            </strong>
            <Footprints size={32} />
            <span>LET’S MAKE MEMORIES</span>
          </div>
          <button
            className={
              page === "profile" ? "sidebar-extra active" : "sidebar-extra"
            }
            onClick={() => navigate("profile")}
          >
            <Ticket size={18} />
            나의 탐험 여권
            <ChevronRight size={14} />
          </button>
          {isAdmin(me) && (
            <button
              className={`sidebar-extra ${page === "admin" ? "active" : ""}`}
              onClick={() => navigate("admin")}
            >
              <ShieldCheck size={18} />
              추진위원회
              <ArrowUpRight size={14} />
            </button>
          )}
          <span className="sidebar-copyright">© kakao bank · HR team</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu-button icon-button"
            aria-label="전체 메뉴"
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            <span>2026 HR 워크샵</span>
            <ChevronRight size={14} />
            <strong>{pageNames[page]}</strong>
          </div>
          <div className="topbar-actions">
            {demo && <span className="demo-badge">미리보기 · 예시 데이터</span>}
            <button
              className="icon-button notification-button"
              aria-label="새로운 소식 보기"
              onClick={() => navigate("notices")}
            >
              <Bell size={19} />
              {unread > 0 && <i aria-label={`읽지 않은 소식 ${unread}개`} />}
            </button>
            <button className="user-menu" onClick={() => navigate("profile")}>
              <Avatar name={englishName(me.handle)} />
              <span>{englishName(me.handle)}</span>
              <ChevronRight size={13} />
            </button>
          </div>
        </header>
        {!online && (
          <div className="connection-banner">
            <WifiOff size={16} />
            오프라인이에요. 연결이 돌아오면 보물 발견과 변경 내용을 저장할 수
            있어요.
          </div>
        )}
        {error && (
          <div className="connection-banner" role="alert">
            {error}
            <button
              className="icon-button"
              onClick={clearError}
              aria-label="알림 닫기"
            >
              <X size={15} />
            </button>
          </div>
        )}
        {update && (
          <div className="connection-banner">
            새로운 앱 버전이 준비됐어요.
            <button
              className="text-button"
              onClick={() => {
                navigator.serviceWorker.addEventListener(
                  "controllerchange",
                  () => location.reload(),
                  { once: true },
                );
                update.waiting?.postMessage({ type: "SKIP_WAITING" });
              }}
            >
              지금 업데이트
            </button>
          </div>
        )}
        <main id="main-content" tabIndex={-1}>
          <Suspense
            fallback={
              <div className="page-loading">
                <Compass size={28} />
                다음 여정을 펼치고 있어요…
              </div>
            }
          >
            {page === "home" ? (
              <Home navigate={navigate} now={now} />
            ) : page === "timeline" ? (
              <Timeline now={now} />
            ) : page === "treasure" ? (
              <Treasure notify={notify} now={now} />
            ) : page === "team" ? (
              <Team />
            ) : page === "notices" ? (
              <Notices />
            ) : page === "profile" ? (
              <Profile
                notify={notify}
                navigate={navigate}
                installPrompt={installPrompt}
              />
            ) : (
              <Admin notify={notify} />
            )}
          </Suspense>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="모바일 메뉴">
        {navigation.map((n) => (
          <button
            key={n.id}
            className={page === n.id ? "active" : ""}
            onClick={() => navigate(n.id)}
            aria-current={page === n.id ? "page" : undefined}
          >
            <n.icon size={21} />
            <span>{n.short}</span>
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          <span>{toast}</span>
          <button aria-label="메시지 닫기" onClick={() => setToast("")}>
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="entry-loading">
        <h1>앗, 잠시 길을 잃었어요</h1>
        <p>페이지를 다시 열면 탐험을 이어갈 수 있어요.</p>
        <button className="button dark" onClick={() => location.reload()}>
          다시 열기
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}

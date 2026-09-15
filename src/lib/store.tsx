import { participantView } from "../../shared/exploration";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithCustomToken,
  signOut,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions, demoMode } from "./firebase";
import { makeSeed, demoSecrets } from "../../shared/seed";
import { actionInput, type ActionInput } from "../../shared/validation";
import { mutate } from "../../shared/mutate";
import type {
  ActionResponse,
  Member,
  TreasureSecrets,
  WorkshopState,
  WorkshopView,
  Role,
} from "../../shared/types";
const KEY = "hr-expedition-demo-v1";
function readDemo(): { state: WorkshopState; secrets: TreasureSecrets } {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "null");
    if (data?.state?.version === 1 && data?.secrets) return data;
  } catch {
    /* recover malformed storage */
  }
  return { state: makeSeed(true), secrets: { ...demoSecrets } };
}
interface Store {
  state: WorkshopView | null;
  me: Member | null;
  secrets: TreasureSecrets;
  loading: boolean;
  error: string;
  demo: boolean;
  act: (input: ActionInput) => Promise<ActionResponse>;
  login: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  switchDemo: (id: string) => void;
  clearError: () => void;
}
const Context = createContext<Store | null>(null);
export function WorkshopProvider({ children }: { children: ReactNode }) {
  const [demoData, setDemoData] = useState(readDemo);
  const [state, setState] = useState<WorkshopView | null>(
    demoMode ? demoData.state : null,
  );
  const [secrets, setSecrets] = useState<TreasureSecrets>(
    demoMode ? demoData.secrets : {},
  );
  const [uid, setUid] = useState<string | null>(
    demoMode ? localStorage.getItem("hr-demo-user") || "dave.h" : null,
  );
  const [loading, setLoading] = useState(!demoMode && Boolean(auth));
  const [error, setError] = useState("");
  const [accessRole, setAccessRole] = useState<Role | null>(null);
  const [readyUid, setReadyUid] = useState<string | null>(null);
  const dataRef = useRef(demoData);
  dataRef.current = demoData;
  const me = uid && state ? (state.members[uid] ?? null) : null;
  useEffect(() => {
    if (!auth || !db) return;
    return onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      setReadyUid(user?.uid ?? null);
      setAccessRole(null);
      setState(null);
      setSecrets({});
      setLoading(Boolean(user));
    });
  }, []);
  useEffect(() => {
    if (!db || !readyUid) return;
    return onSnapshot(
      doc(db, "members", readyUid),
      (snapshot) => {
        const role = snapshot.data()?.role as Role | undefined;
        setAccessRole(role ?? null);
        if (!role) {
          setState(null);
          setLoading(false);
          setError("참가자 정보를 찾을 수 없어요. 새 링크로 입장해주세요.");
        }
      },
      () => {
        setAccessRole(null);
        setState(null);
        setLoading(false);
        setError("입장 링크가 갱신되었어요. 새 링크로 다시 입장해주세요.");
      },
    );
  }, [readyUid]);
  useEffect(() => {
    if (!db || !readyUid || !accessRole) return;
    setState(null);
    setLoading(true);
    const stop = onSnapshot(
      doc(db, "workshops", accessRole === "member" ? "participants" : "main"),
      (snapshot) => {
        setState(snapshot.exists() ? (snapshot.data() as WorkshopView) : null);
        setLoading(false);
        if (!snapshot.exists())
          setError(
            "워크샵이 아직 개설되지 않았어요. 추진위원회에 문의해주세요.",
          );
      },
      () => {
        setLoading(false);
        setState(null);
        setError(
          "워크샵을 불러오지 못했어요. 네트워크를 확인하거나 새 입장 링크로 다시 접속해주세요.",
        );
      },
    );
    return stop;
  }, [readyUid, accessRole]);
  useEffect(() => {
    if (!db || !me || me.role === "member") {
      if (!demoMode) setSecrets({});
      return;
    }
    return onSnapshot(
      doc(db, "private", "treasures"),
      (snap) => setSecrets((snap.data()?.kinds ?? {}) as TreasureSecrets),
      () => setSecrets({}),
    );
  }, [me?.role, me?.id]);
  useEffect(() => {
    if (!demoMode) return;
    const listener = (e: StorageEvent) => {
      if (e.key === KEY) {
        const next = readDemo();
        dataRef.current = next;
        setDemoData(next);
        setState(next.state);
        setSecrets(next.secrets);
      }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);
  const act = useCallback(
    async (raw: ActionInput): Promise<ActionResponse> => {
      const parsed = actionInput.safeParse(raw);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      if (demoMode) {
        if (!uid) throw new Error("입장해주세요.");
        const next = structuredClone(dataRef.current);
        const result = mutate(
          next.state,
          next.secrets,
          uid,
          parsed.data,
          crypto.randomUUID(),
        );
        if (raw.action === "getGuidance" || raw.action === "getArTarget")
          return result;
        if (raw.action === "resetWorkshop" || raw.action === "deleteMember") {
          const invites = JSON.parse(
            localStorage.getItem("hr-demo-invites") || "{}",
          ) as Record<string, string>;
          localStorage.setItem(
            "hr-demo-invites",
            JSON.stringify(
              Object.fromEntries(
                Object.entries(invites).filter(([, memberId]) =>
                  raw.action === "deleteMember"
                    ? memberId !== raw.memberId
                    : next.state.members[memberId],
                ),
              ),
            ),
          );
        }
        if (raw.action === "createMember" || raw.action === "rotateInvite") {
          const code = crypto.randomUUID();
          result.code = code;
          const invites = JSON.parse(
            localStorage.getItem("hr-demo-invites") || "{}",
          ) as Record<string, string>;
          Object.entries(invites).forEach(([k, v]) => {
            if (v === result.memberId) delete invites[k];
          });
          invites[code] = result.memberId!;
          localStorage.setItem("hr-demo-invites", JSON.stringify(invites));
        }
        if (raw.action === "publishNotice" && raw.push) {
          const n = next.state.notices.find((n) => n.id === result.noticeId)!;
          n.pushStatus = "none";
          result.delivered = 0;
          result.failed = 0;
        }
        localStorage.setItem(KEY, JSON.stringify(next));
        dataRef.current = next;
        setDemoData(next);
        setState(next.state);
        setSecrets(next.secrets);
        return result;
      }
      if (!functions) throw new Error("Firebase 연결 설정이 필요해요.");
      try {
        return (
          await httpsCallable<ActionInput, ActionResponse>(
            functions,
            "workshopAction",
          )(parsed.data)
        ).data;
      } catch (e) {
        throw new Error(
          e instanceof Error
            ? e.message
            : "요청을 완료하지 못했어요. 다시 시도해주세요.",
        );
      }
    },
    [uid],
  );
  const login = useCallback(async (code: string) => {
    if (demoMode) {
      const invites = JSON.parse(
        localStorage.getItem("hr-demo-invites") || "{}",
      );
      const id = invites[code];
      if (!id || !dataRef.current.state.members[id])
        throw new Error(
          "사용할 수 없는 코드예요. 데모 코드는 발급한 브라우저에서만 사용할 수 있어요.",
        );
      setUid(id);
      localStorage.setItem("hr-demo-user", id);
      return;
    }
    if (!functions || !auth) throw new Error("Firebase 연결 설정이 필요해요.");
    const { data } = await httpsCallable<{ code: string }, { token: string }>(
      functions,
      "redeemInvite",
    )({ code });
    await signInWithCustomToken(auth, data.token);
  }, []);
  const logout = useCallback(async () => {
    if (demoMode) {
      setUid(null);
      localStorage.removeItem("hr-demo-user");
    } else if (auth) {
      await signOut(auth);
    }
  }, []);
  const switchDemo = (id: string) => {
    if (demoMode && state?.members[id]) {
      setUid(id);
      localStorage.setItem("hr-demo-user", id);
    }
  };
  const visibleState = useMemo(
    () =>
      demoMode && me?.role === "member"
        ? participantView(demoData.state)
        : state,
    [state, demoData, me?.role],
  );
  return (
    <Context.Provider
      value={{
        state: visibleState,
        me,
        secrets: me?.role === "member" ? {} : secrets,
        loading,
        error,
        demo: demoMode,
        act,
        login,
        logout,
        switchDemo,
        clearError: () => setError(""),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWorkshop() {
  const value = useContext(Context);
  if (!value) throw new Error("WorkshopProvider missing");
  return value;
}

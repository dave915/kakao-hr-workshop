import { useEffect, useState } from "react";
import { RefreshCw, Smartphone } from "lucide-react";
import type { DeviceStatus, MemberDevices } from "../../shared/types";
import type { ActionInput } from "../../shared/validation";
import type { ActionResponse } from "../../shared/types";
import { Drawer } from "./common";
import { errorMessage } from "../lib/utils";
export function useMemberDevices(
  act: (input: ActionInput) => Promise<ActionResponse>,
  enabled: boolean,
  owner: string | undefined,
) {
  const [data, setData] = useState<Record<string, MemberDevices> | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false,
      busy = false;
    setData(null);
    const load = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      setLoading(true);
      try {
        const result = await act({ action: "getMemberDevices" });
        if (!cancelled) {
          setData(result.memberDevices ?? {});
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e));
          setData(null);
        }
      } finally {
        busy = false;
        if (!cancelled) setLoading(false);
      }
    };
    const refresh = () => {
      void load();
    };
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [act, enabled, owner, revision]);
  return { data, error, loading, refresh: () => setRevision((v) => v + 1) };
}
const date = (time?: number) =>
  time
    ? new Intl.DateTimeFormat("ko-KR", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(time)
    : "—";
export function installationLabel(device: DeviceStatus) {
  return device.installation === "installed"
    ? "설치 확인"
    : device.removedAt
      ? "삭제 추정"
      : device.installation === "not-installed"
        ? "미설치 확인"
        : "설치 미확인";
}
export function DeviceCell({
  info,
  ready,
  name,
}: {
  info: MemberDevices | undefined;
  ready: boolean;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const devices = info?.devices ?? [];
  const installed = devices.filter(
    (d) => d.installation === "installed",
  ).length;
  const removed = devices.filter(
    (d) => d.installation === "not-installed" && d.removedAt,
  ).length;
  const last = Math.max(0, ...devices.map((d) => d.lastSeenAt));
  return (
    <>
      <button
        className="device-cell"
        disabled={!ready}
        aria-label={`${name} 설치 및 푸시 기기 상태`}
        onClick={() => setOpen(true)}
      >
        <strong>
          {!ready
            ? "확인 중"
            : installed
              ? `설치 확인 ${installed}대`
              : removed
                ? `삭제 추정 ${removed}대`
                : devices.some((d) => d.installation === "not-installed")
                  ? "미설치 확인"
                  : "설치 미확인"}
        </strong>
        <span>
          {ready
            ? `푸시 등록 ${info?.pushDevices ?? 0}대`
            : "기기 상태 불러오는 중"}
        </span>
        {installed > 0 && removed > 0 && <small>삭제 추정 {removed}대</small>}
        <small>
          {last ? `${date(last)} 접속 확인` : "최근 기기 확인 기록 없음"}
        </small>
      </button>
      {open && (
        <Drawer title={`${name}의 앱·알림 상태`} onClose={() => setOpen(false)}>
          <p className="device-explanation">
            푸시 등록 <strong>{info?.pushDevices ?? 0}대</strong> · 브라우저별
            등록 수예요. 등록만으로 실제 알림 수신을 보장하지는 않아요.
          </p>
          {devices.length ? (
            <div className="device-list">
              {[...devices]
                .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
                .map((d, index) => (
                  <article key={d.deviceId}>
                    <h3>
                      <Smartphone size={18} />
                      {d.platform} · 기기 {index + 1}
                    </h3>
                    <strong>{installationLabel(d)}</strong>
                    <dl>
                      <div>
                        <dt>최근 접속</dt>
                        <dd>{date(d.lastSeenAt)}</dd>
                      </div>
                      <div>
                        <dt>설치 확인</dt>
                        <dd>{date(d.installedAt)}</dd>
                      </div>
                      {d.removedAt && (
                        <div>
                          <dt>설치 해제 감지</dt>
                          <dd>{date(d.removedAt)}</dd>
                        </div>
                      )}
                      <div>
                        <dt>설치 상태 확인</dt>
                        <dd>{date(d.installationCheckedAt)}</dd>
                      </div>
                      <div>
                        <dt>알림 권한</dt>
                        <dd>
                          {
                            {
                              granted: "허용",
                              denied: "차단",
                              default: "미선택",
                              unsupported: "지원 안 함",
                            }[d.permission]
                          }
                        </dd>
                      </div>
                      <div>
                        <dt>브라우저 푸시 연결</dt>
                        <dd>
                          {
                            {
                              subscribed: "연결 확인",
                              unsubscribed: "연결 없음",
                              unknown: "미확인",
                            }[d.push]
                          }
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
            </div>
          ) : (
            <p>
              업데이트된 앱에 접속하면 기기 상태가 표시돼요. 이전에 등록한 푸시
              기기는 위 등록 수에 포함돼요.
            </p>
          )}
          <p className="footnote">
            설치 상태는 마지막 확인 시점 기준이에요. 삭제 후 다시 접속하지
            않으면 알 수 없어요. ‘삭제 추정’은 같은 브라우저에서 이전 설치가 더
            이상 감지되지 않은 상태이며, 데이터 삭제·브라우저 변경 시 기존
            기록과 연결되지 않을 수 있어요.
          </p>
        </Drawer>
      )}
    </>
  );
}
export function DeviceRefresh({
  loading,
  onRefresh,
}: {
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <button className="text-button" disabled={loading} onClick={onRefresh}>
      <RefreshCw size={15} />
      {loading ? "기기 상태 확인 중…" : "기기 상태 새로고침"}
    </button>
  );
}

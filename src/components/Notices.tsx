import { Bell, Megaphone } from "lucide-react";
import { useWorkshop } from "../lib/store";
import { englishName, formatDate, formatTime } from "../lib/utils";
import { Empty } from "./common";
export default function Notices() {
  const { state, me } = useWorkshop();
  if (!state || !me) return null;
  const notices = state.notices.filter(
    (n) => n.audience === "all" || n.audience === me.team,
  );
  return (
    <div className="page-enter narrow-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">BASE CAMP NEWS</span>
          <h1>베이스캠프에서 온 소식</h1>
          <p>추진위원회가 전하는 반가운 소식과 중요한 안내.</p>
        </div>
        <Megaphone className="page-symbol" size={38} />
      </div>
      {notices.length ? (
        <div className="notice-list">
          {notices.map((n) => (
            <article key={n.id}>
              <div className="notice-meta">
                <span className="mini-tag yellow">
                  <Bell size={12} />
                  {n.audience === "all" ? "전체 안내" : n.audience}
                </span>
                <time>
                  {formatDate(new Date(n.createdAt).toISOString())} ·{" "}
                  {formatTime(new Date(n.createdAt).toISOString())}
                </time>
              </div>
              <h2>{n.title}</h2>
              <p>{n.body}</p>
              <footer>
                워크샵 추진위원회
                {n.author !== "워크샵 추진위원회" &&
                  ` · ${englishName(n.author)}`}
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="아직 도착한 소식이 없어요"
          body="추진위원회의 안내를 기다려주세요. 푸시를 켜면 더 빨리 확인할 수 있어요."
        />
      )}
    </div>
  );
}

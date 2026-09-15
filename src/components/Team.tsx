import { useState } from "react";
import { Flag, Medal, Gift, Trophy } from "lucide-react";
import { useWorkshop } from "../lib/store";
import { englishName } from "../lib/utils";
import { memberRanking, teamRanking } from "../../shared/game";
import { Avatar, Empty, SectionTitle } from "./common";
export default function Team() {
  const { state, me } = useWorkshop();
  const [mode, setMode] = useState<"team" | "individual">("team");
  if (!state || !me) return null;
  const peers = Object.values(state.members).filter((m) => m.team === me.team);
  const found = state.treasures.filter(
    (t) => t.foundBy && peers.some((p) => p.id === t.foundBy),
  );
  return (
    <div className="page-enter">
      <div className="page-intro">
        <div>
          <span className="eyebrow">BETTER TOGETHER</span>
          <h1>발견은 나의 것, 기쁨은 우리의 것</h1>
          <p>같은 방향으로 걷는 우리 팀의 이야기에요.</p>
        </div>
        <Flag size={38} className="page-symbol" />
      </div>
      <section className="team-hero">
        <span className="mini-tag green">MY TEAM</span>
        <h2>{me.team}</h2>
        <p>{peers.length}명의 탐험대원과 함께 모험 중</p>
        <div className="team-members">
          {peers.map((p) => (
            <div key={p.id}>
              <Avatar name={englishName(p.handle)} />
              <span>
                {englishName(p.handle)}
                {p.id === me.id ? " (나)" : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
      <div className="team-columns">
        <section>
          <SectionTitle
            title="우리 팀의 보물 수첩"
            eyebrow="COLLECTED MOMENTS"
          />
          {found.length ? (
            <div className="collection-list">
              {found.map((t) => (
                <article key={t.id}>
                  <Gift size={24} />
                  <div>
                    <h3>{t.name}</h3>
                    <p>
                      {englishName(state.members[t.foundBy!]?.handle)} · 발견
                    </p>
                  </div>
                  <strong>
                    {t.outcome === "bomb" ? "꽝!" : `+${t.points} P`}
                  </strong>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="첫 번째 발견의 주인공은?"
              body="팀원이 보물을 찾으면 모두의 수첩에 함께 기록돼요."
            />
          )}
        </section>
        <section>
          <SectionTitle title="탐험대 명예의 전당" eyebrow="LEADERBOARD" />
          <div className="segmented">
            <button
              onClick={() => setMode("team")}
              className={mode === "team" ? "selected" : ""}
            >
              팀 순위
            </button>
            <button
              onClick={() => setMode("individual")}
              className={mode === "individual" ? "selected" : ""}
            >
              개인 순위
            </button>
          </div>
          <div className="ranking-list">
            {(mode === "team"
              ? teamRanking(state).map((t) => ({
                  id: t.name,
                  name: t.name,
                  score: t.score,
                  found: t.found,
                  self: t.name === me.team,
                }))
              : memberRanking(state).map((m) => ({
                  id: m.id,
                  name: englishName(m.handle),
                  score: m.score,
                  found: m.found,
                  self: m.id === me.id,
                }))
            ).map((r, i) => (
              <article key={r.id} className={r.self ? "self" : ""}>
                <span className="rank">
                  {i === 0 && r.score > 0 ? <Trophy size={23} /> : i + 1}
                </span>
                <div>
                  <h3>
                    {r.name}
                    {r.self && <small>우리</small>}
                  </h3>
                  <p>보물 {r.found}개 발견</p>
                </div>
                <strong>
                  {r.score.toLocaleString()}
                  <small>P</small>
                </strong>
              </article>
            ))}
          </div>
          <p className="footnote">
            <Medal size={14} />
            포인트순으로 표시해요. 동점은 발견 수, 이름순이에요.
          </p>
        </section>
      </div>
    </div>
  );
}

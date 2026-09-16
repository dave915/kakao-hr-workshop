import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  MapPin,
  Compass,
  Flag,
  Ticket,
  ChevronRight,
  Bell,
  Footprints,
  Sparkles,
} from "lucide-react";
import { useWorkshop } from "../lib/store";
import { englishName, formatDate, formatTime } from "../lib/utils";
import { remainingTreasures, scheduleStatus } from "../../shared/game";
import type { Page } from "../../shared/types";
import { ExpeditionArt } from "./ExpeditionArt";
import { Avatar, SectionTitle } from "./common";
export default function Home({
  navigate,
  now,
}: {
  navigate: (page: Page) => void;
  now: number;
}) {
  const { state, me, demo } = useWorkshop();
  if (!state || !me) return null;
  const upcoming = state.schedule.filter(
    (s) => scheduleStatus(s, now) !== "past",
  );
  const next = upcoming[0];
  const timeline = (upcoming.length ? upcoming : state.schedule).slice(0, 3);
  const ourTeam = {
    found: Object.values(state.members)
      .filter((m) => m.team === me.team)
      .reduce((sum, m) => sum + m.found, 0),
  };
  const notice = state.notices.find(
    (n) => n.audience === "all" || n.audience === me.team,
  );
  return (
    <div className="home-page page-enter">
      <div className="page-intro">
        <div>
          <span className="eyebrow">A LITTLE BREAK, A BIG ADVENTURE</span>
          <h1>안녕하세요 {englishName(me.handle)}!</h1>
          <p>오늘은 업무 대신, 함께하는 순간을 모아볼까요?</p>
        </div>
        <span className="outline-pill">
          <span className="status-dot" />
          {demo
            ? "워크샵 미리보기"
            : now < Date.parse(state.settings.startsAt)
              ? "설레는 모험 준비 중"
              : "우리의 모험 기록"}
        </span>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-kicker">
            <Flag size={14} /> KAKAOBANK HR WORKSHOP
          </span>
          <h2>
            <span>{state.settings.title}</span>
          </h2>
          <p>
            {state.settings.subtitle}
            <br />
            낯선 길 위에서 새로운 우리를 발견해요.
          </p>
          <div className="hero-meta">
            <span>
              <CalendarDays size={15} />
              {formatDate(state.settings.startsAt)}
            </span>
            <span>
              <MapPin size={15} />
              {state.settings.location}
            </span>
          </div>
          <button className="button dark" onClick={() => navigate("timeline")}>
            오늘의 여정 살펴보기
            <ArrowUpRight size={17} />
          </button>
        </div>
        <ExpeditionArt />
        <div className="hero-stamp">
          LET’S
          <br />
          GO OUT!
          <Sparkles size={17} />
        </div>
      </section>
      <div className="home-columns">
        <div className="home-main">
          <section className="journey-section">
            <SectionTitle
              eyebrow="OUR JOURNEY"
              title="차근차근, 오늘의 여정"
              action="전체 일정"
              onAction={() => navigate("timeline")}
            />
            <div className="schedule-preview">
              {timeline.length ? (
                timeline.map((s, i) => (
                  <button
                    key={s.id}
                    className={`schedule-row ${s.id === next?.id ? "next" : ""}`}
                    onClick={() => navigate("timeline")}
                  >
                    <div className="schedule-time">
                      {formatTime(s.startsAt)}
                      <span>{formatTime(s.endsAt)}</span>
                    </div>
                    <div className="timeline-dot">
                      <i />
                    </div>
                    <div className="schedule-row-content">
                      <div>
                        <h3>{s.title}</h3>
                        {s.id === next?.id && (
                          <span className="mini-tag">
                            {scheduleStatus(s, now) === "current"
                              ? "지금 여기"
                              : "다음 여정"}
                          </span>
                        )}
                      </div>
                      <p>
                        <MapPin size={12} />
                        {s.location}
                      </p>
                    </div>
                    <ChevronRight size={17} />
                    <span className="sr-only">일정 {i + 1} 자세히</span>
                  </button>
                ))
              ) : (
                <p className="muted">
                  추진위원회가 오늘의 여정을 준비하고 있어요.
                </p>
              )}
            </div>
          </section>
          <button
            className="treasure-banner"
            onClick={() => navigate("treasure")}
          >
            <span className="banner-icon">
              <Compass size={38} strokeWidth={1.4} />
            </span>
            <span>
              <span className="eyebrow">SIDE QUEST</span>
              <strong>어디엔가, 보물이 기다려요</strong>
              <span>
                숨겨진 보물 {remainingTreasures(state.treasures)}개 · 우리 팀의
                행운을 찾아봐요!
              </span>
            </span>
            <span className="round-arrow">
              <ArrowUpRight size={22} />
            </span>
          </button>
          <section className="notice-preview">
            <SectionTitle
              eyebrow="BASE CAMP NEWS"
              title="베이스캠프에서 온 소식"
              action="모두 보기"
              onAction={() => navigate("notices")}
            />
            {notice ? (
              <button
                className="notice-row"
                onClick={() => navigate("notices")}
              >
                <span className="notice-symbol">
                  <Bell size={19} />
                </span>
                <span>
                  <span className="mini-tag yellow">공지</span>
                  <strong>{notice.title}</strong>
                  <small>
                    워크샵 추진위원회 ·{" "}
                    {formatDate(new Date(notice.createdAt).toISOString())}
                  </small>
                </span>
                <ChevronRight size={18} />
              </button>
            ) : (
              <p className="muted">
                새로운 소식이 도착하면 여기에서 알려드릴게요.
              </p>
            )}
          </section>
        </div>
        <aside className="home-aside">
          <section className="passport">
            <div className="passport-top">
              <span>
                <Ticket size={16} /> MY EXPLORER PASS
              </span>
              <span>01</span>
            </div>
            <div className="passport-person">
              <Avatar name={englishName(me.handle)} size="large" />
              <h2>{englishName(me.handle)}</h2>
              <span className="team-chip">{me.team}</span>
            </div>
            <div className="passport-rule" />
            <div className="passport-stats">
              <div>
                <span>내가 찾은 보물</span>
                <strong>
                  {me.found}
                  <small>개</small>
                </strong>
              </div>
              <div>
                <span>모은 포인트</span>
                <strong>
                  {me.score.toLocaleString()}
                  <small>P</small>
                </strong>
              </div>
            </div>
            <button
              className="passport-link"
              onClick={() => navigate("profile")}
            >
              나의 탐험 여권 보기
              <ArrowRight size={15} />
            </button>
            <div className="passport-bottom">
              <span className="barcode" />
              <span>HR · EXPLORER · 2026</span>
            </div>
          </section>
          <section className="team-preview">
            <div className="team-preview-heading">
              <span className="mini-tag green">TEAM PLAY</span>
              <Flag size={18} />
            </div>
            <h3>혼자보다, 우리 함께</h3>
            <p>
              {me.team}의 발견이
              <br />
              하나둘 모이고 있어요.
            </p>
            <div className="team-progress">
              <div>
                <span>우리 팀이 찾은 보물</span>
                <strong>
                  {ourTeam?.found ?? 0}
                  <small>개</small>
                </strong>
              </div>
              <div className="progress-track">
                <span
                  style={{
                    width: `${Math.min(100, ((ourTeam?.found ?? 0) / Math.max(1, state.treasures.length)) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <button className="text-button" onClick={() => navigate("team")}>
              팀의 발자취 보기
              <ArrowUpRight size={16} />
            </button>
          </section>
        </aside>
      </div>
      <div className="home-footer">
        <Footprints size={15} />
        <span>함께 걷는 오늘이, 오래 남을 이야기가 되도록.</span>
        <span>KAKAOBANK HR</span>
      </div>
    </div>
  );
}

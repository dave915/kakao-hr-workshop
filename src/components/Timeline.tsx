import { useState } from "react";
import {
  CalendarDays,
  MapPin,
  Coffee,
  Utensils,
  Flag,
  Compass,
  ChevronDown,
} from "lucide-react";
import { useWorkshop } from "../lib/store";
import { formatDate, formatTime } from "../lib/utils";
import { scheduleStatus } from "../../shared/game";
import { Empty } from "./common";
const icons = { gather: Flag, activity: Compass, meal: Utensils, rest: Coffee };
export default function Timeline({ now }: { now: number }) {
  const { state } = useWorkshop();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [day, setDay] = useState("");
  if (!state) return null;
  const days = [...new Set(state.schedule.map((s) => s.startsAt.slice(0, 10)))];
  const selected = days.includes(day) ? day : days[0];
  return (
    <div className="page-enter">
      <div className="page-intro">
        <div>
          <span className="eyebrow">OUR JOURNEY</span>
          <h1>우리의 하루, 한 장의 지도</h1>
          <p>다음 목적지까지, 여유롭게 따라오세요.</p>
        </div>
        <CalendarDays className="page-symbol" size={38} />
      </div>
      <div className="day-tabs" aria-label="일정 날짜">
        {days.map((d, i) => (
          <button
            key={d}
            className={selected === d ? "selected" : ""}
            onClick={() => setDay(d)}
          >
            DAY {i + 1}
            <span>{formatDate(d + "T12:00:00+09:00")}</span>
          </button>
        ))}
      </div>
      {state.schedule.length ? (
        <div className="full-timeline">
          {state.schedule
            .filter((s) => s.startsAt.slice(0, 10) === selected)
            .map((s) => {
              const status = scheduleStatus(s, now);
              const Icon = icons[s.category];
              return (
                <article key={s.id} className={`timeline-item ${status}`}>
                  <div className="time-column">
                    <strong>{formatTime(s.startsAt)}</strong>
                    <span>{formatTime(s.endsAt)}</span>
                  </div>
                  <div className="timeline-axis">
                    <span>
                      <Icon size={19} />
                    </span>
                  </div>
                  <div className="timeline-body">
                    <button
                      aria-expanded={expanded === s.id}
                      onClick={() =>
                        setExpanded(expanded === s.id ? null : s.id)
                      }
                    >
                      <span>
                        <span className="mini-tag">
                          {status === "current"
                            ? "지금 함께해요"
                            : status === "past"
                              ? "지나온 여정"
                              : "다가오는 여정"}
                        </span>
                        <h2>{s.title}</h2>
                        <span className="location-line">
                          <MapPin size={14} />
                          {s.location}
                        </span>
                      </span>
                      <ChevronDown
                        className={expanded === s.id ? "rotate" : ""}
                        size={20}
                      />
                    </button>
                    {expanded === s.id && (
                      <p className="timeline-description">
                        {s.description || "시작 시간에 맞춰 모여주세요."}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
        </div>
      ) : (
        <Empty
          title="멋진 여정을 준비하고 있어요"
          body="일정이 등록되면 이곳에서 만날 수 있어요."
        />
      )}
      <p className="footnote">
        모든 시간은 한국 시간(KST) 기준이에요. 현장 상황에 따라 일정이 달라질 수
        있으니 공지도 확인해주세요.
      </p>
    </div>
  );
}

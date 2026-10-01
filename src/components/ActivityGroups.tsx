import { useState } from "react";
import { Check } from "lucide-react";
import { useWorkshop } from "../lib/store";
import { englishName } from "../lib/utils";
import { Empty, SectionTitle } from "./common";

export function ActivityGroups() {
  const { state, me } = useWorkshop();
  const [selected, setSelected] = useState("");
  if (!state || !me) return null;
  const activities = (state.activityGroups ?? []).filter(
    (item) => item.published,
  );
  const activity =
    activities.find((item) => item.id === selected) ?? activities[0];
  return (
    <section className="activity-section">
      <SectionTitle title="활동별 조 편성" eyebrow="WHO’S WITH ME?" />
      {!activity ? (
        <Empty
          title="우리 조를 준비하고 있어요"
          body="볼링, 요리 등 활동별 조가 공개되면 여기에서 확인할 수 있어요."
        />
      ) : (
        <>
          <div className="activity-tabs" aria-label="활동 선택">
            {activities.map((item) => (
              <button
                key={item.id}
                className={`button small ${item.id === activity.id ? "dark" : ""}`}
                aria-pressed={item.id === activity.id}
                onClick={() => setSelected(item.id)}
              >
                {item.title}
              </button>
            ))}
          </div>
          {activity.description && (
            <p className="activity-description">{activity.description}</p>
          )}
          {!activity.groups.some((group) =>
            group.memberIds.includes(me.id),
          ) && (
            <p className="footnote">
              아직 배정된 조가 없어요. 추진위원회에 문의해주세요.
            </p>
          )}
          <div className="activity-roster">
            {activity.groups.map((group) => {
              const mine = group.memberIds.includes(me.id);
              const members = group.memberIds.flatMap((uid) =>
                state.members[uid] ? [state.members[uid]] : [],
              );
              return (
                <article
                  key={group.id}
                  className={mine ? "my-activity-group" : ""}
                >
                  <div className="activity-group-heading">
                    <h3>{group.name}</h3>
                    {mine && (
                      <span className="mini-tag green">
                        <Check size={13} /> 내 조
                      </span>
                    )}
                    <span>
                      {members.length + (group.pendingNames?.length ?? 0)}명
                    </span>
                  </div>
                  <ul>
                    {members.map((member) => (
                      <li key={member.id}>
                        {englishName(member.handle)}
                        {member.id === me.id && <strong> (나)</strong>}
                      </li>
                    ))}
                    {group.pendingNames?.map((name, index) => (
                      <li key={`pending-${index}`}>
                        {name}{" "}
                        <small className="activity-pending-label">
                          합류 예정
                        </small>
                      </li>
                    ))}
                  </ul>
                  {!members.length && !group.pendingNames?.length && (
                    <p className="footnote">조원을 배정하고 있어요.</p>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

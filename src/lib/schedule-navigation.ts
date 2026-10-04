import type { Schedule } from "../../shared/types";

export function koreaDay(value: string | number) {
  const time = typeof value === "number" ? value : Date.parse(value);
  return new Date(time + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function scheduleSelection(
  schedule: Schedule[],
  now: number,
  chosenDay: string,
  eventId: string | null,
) {
  const days = [...new Set(schedule.map((s) => koreaDay(s.startsAt)))].sort();
  const target = schedule.find((s) => s.id === eventId);
  const today = koreaDay(now);
  const selected = days.includes(chosenDay)
    ? chosenDay
    : target
      ? koreaDay(target.startsAt)
      : days.includes(today)
        ? today
        : (days.find((day) => day > today) ?? days.at(-1));
  return { days, selected, target };
}

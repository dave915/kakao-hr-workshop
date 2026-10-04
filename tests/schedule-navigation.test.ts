import { describe, expect, it } from "vitest";
import { koreaDay, scheduleSelection } from "../src/lib/schedule-navigation";
import type { Schedule } from "../shared/types";

const event = (id: string, startsAt: string): Schedule => ({
  id,
  startsAt,
  endsAt: startsAt,
  title: id,
  location: "",
  description: "",
  category: "activity",
});
const schedule = [
  event("second", "2026-10-17T10:00:00+09:00"),
  event("first", "2026-10-16T10:00:00+09:00"),
];

describe("schedule navigation", () => {
  it("selects today using Korea time even when stored dates use UTC", () => {
    const now = Date.parse("2026-10-16T15:00:00Z");
    expect(koreaDay(now)).toBe("2026-10-17");
    expect(scheduleSelection(schedule, now, "", null).selected).toBe(
      "2026-10-17",
    );
    expect(
      scheduleSelection(
        [event("midnight", "2026-10-16T15:30:00Z")],
        now,
        "",
        null,
      ).days,
    ).toEqual(["2026-10-17"]);
    expect(koreaDay(now - 1)).toBe("2026-10-16");
  });
  it("uses the next available day before the event and the last day afterwards", () => {
    expect(
      scheduleSelection(schedule, Date.parse("2026-10-01"), "", null).selected,
    ).toBe("2026-10-16");
    expect(
      scheduleSelection(schedule, Date.parse("2026-10-20"), "", null).selected,
    ).toBe("2026-10-17");
  });
  it("opens a linked event and preserves subsequent manual day selection", () => {
    const now = Date.parse("2026-10-17T10:00:00+09:00");
    const linked = scheduleSelection(schedule, now, "", "first");
    expect(linked.selected).toBe("2026-10-16");
    expect(linked.target?.id).toBe("first");
    expect(
      scheduleSelection(schedule, now, "2026-10-17", "first").selected,
    ).toBe("2026-10-17");
  });
  it("handles deleted events, removed days and an empty schedule", () => {
    const now = Date.parse("2026-10-17T10:00:00+09:00");
    expect(
      scheduleSelection(schedule, now, "2026-10-15", "deleted").selected,
    ).toBe("2026-10-17");
    expect(scheduleSelection([], now, "", "deleted")).toEqual({
      days: [],
      selected: undefined,
      target: undefined,
    });
  });
});

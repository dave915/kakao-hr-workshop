import type { DeviceReport, DeviceStatus } from "./types";
export function updateDeviceStatus(
  previous: DeviceStatus | undefined,
  report: DeviceReport,
  now: number,
): DeviceStatus {
  const next: DeviceStatus = { ...previous, ...report, lastSeenAt: now };
  if (report.installation !== "unknown") next.installationCheckedAt = now;
  if (report.installation === "installed") {
    next.installedAt = previous?.installedAt ?? now;
  } else if (report.installation === "not-installed" && previous?.installedAt) {
    next.removedAt =
      previous.installation === "not-installed"
        ? (previous.removedAt ?? now)
        : now;
  }
  // An unsupported/failed check cannot erase evidence of a previous installation.
  if (report.installation === "unknown" && previous)
    next.installation = previous.installation;
  return next;
}

/** Company handles use EnglishName.suffix; the suffix is not a display name. */
export function englishName(handle?: string | null) {
  const name = handle?.trim().split(".")[0].toLowerCase();
  return name ? name[0].toUpperCase() + name.slice(1) : "참가자";
}

export const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
export function inviteUrl(code: string) {
  return `${location.origin}${import.meta.env.BASE_URL}#/join/${encodeURIComponent(code)}`;
}
export function toLocalInput(iso: string) {
  const d = new Date(Date.parse(iso) + 9 * 3600000);
  return d.toISOString().slice(0, 16);
}
export function fromLocalInput(value: string) {
  return value + ":00+09:00";
}
export const errorMessage = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "문제가 생겼어요. 잠시 후 다시 시도해주세요.";

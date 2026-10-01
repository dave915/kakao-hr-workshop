/** Company handles use EnglishName.suffix; the suffix is not a display name. */
export function englishName(handle?: string | null, fallback = "참가자") {
  const name = handle?.trim().split(".")[0].toLowerCase();
  return name ? name[0].toUpperCase() + name.slice(1) : fallback;
}

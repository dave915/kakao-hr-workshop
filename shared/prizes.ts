export const PRIZE_PLAN = [
  { amount: 50000, quantity: 31, kind: "treasure" },
  { amount: 30000, quantity: 32, kind: "treasure" },
  { amount: 20000, quantity: 35, kind: "treasure" },
  { amount: 10000, quantity: 40, kind: "treasure" },
  { amount: 5000, quantity: 50, kind: "treasure" },
  { amount: 2000, quantity: 63, kind: "treasure" },
  { amount: 1000, quantity: 54, kind: "treasure" },
  { amount: 0, quantity: 80, kind: "bomb" },
  { amount: 0, quantity: 80, kind: "cheer" },
] as const;

export type PrizeAmount = (typeof PRIZE_PLAN)[number]["amount"];
export type TreasureKind = (typeof PRIZE_PLAN)[number]["kind"];
export const TOTAL_PRIZE_QUANTITY = PRIZE_PLAN.reduce(
  (sum, p) => sum + p.quantity,
  0,
);
export const TOTAL_PRIZE_AMOUNT = PRIZE_PLAN.reduce(
  (sum, p) => sum + p.amount * p.quantity,
  0,
);
export const prizeLabel = (amount: number, kind?: TreasureKind) =>
  kind === "cheer"
    ? "응원"
    : amount === 0
      ? "꽝"
      : `${amount.toLocaleString("ko-KR")}원`;

interface PrizeItem {
  id?: string;
  prizeAmount?: number;
  kind?: TreasureKind;
  outcome?: TreasureKind;
}
export function prizeKind(
  item: PrizeItem,
  kinds: Readonly<Record<string, TreasureKind>> = {},
): TreasureKind {
  return (
    item.kind ??
    (item.id ? kinds[item.id] : undefined) ??
    item.outcome ??
    (item.prizeAmount === 0 ? "bomb" : "treasure")
  );
}
export const prizeKey = (amount: number, kind: TreasureKind) =>
  `${kind}:${amount}`;

/** Found prizes remain placed; only removing a registration returns its stock. */
export function prizeInventory(
  treasures: PrizeItem[],
  kinds: Readonly<Record<string, TreasureKind>> = {},
) {
  return PRIZE_PLAN.map((prize) => {
    const placed = treasures.filter(
      (t) =>
        t.prizeAmount === prize.amount && prizeKind(t, kinds) === prize.kind,
    ).length;
    return {
      ...prize,
      key: prizeKey(prize.amount, prize.kind),
      placed,
      remaining: Math.max(0, prize.quantity - placed),
    };
  });
}

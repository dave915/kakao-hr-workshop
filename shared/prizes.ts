export const PRIZE_PLAN = [
  { amount: 50000, quantity: 1 },
  { amount: 30000, quantity: 2 },
  { amount: 20000, quantity: 5 },
  { amount: 10000, quantity: 10 },
  { amount: 5000, quantity: 20 },
  { amount: 2000, quantity: 33 },
  { amount: 1000, quantity: 24 },
  { amount: 0, quantity: 5 },
] as const;

export type PrizeAmount = (typeof PRIZE_PLAN)[number]["amount"];
export const prizeLabel = (amount: number) =>
  amount === 0 ? "꽝" : `${amount.toLocaleString("ko-KR")}원`;

/** Found prizes remain placed; only removing a registration returns its stock. */
export function prizeInventory(treasures: { prizeAmount?: number }[]) {
  return PRIZE_PLAN.map((prize) => {
    const placed = treasures.filter(
      (t) => t.prizeAmount === prize.amount,
    ).length;
    return {
      ...prize,
      placed,
      remaining: Math.max(0, prize.quantity - placed),
    };
  });
}

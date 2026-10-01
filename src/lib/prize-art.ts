import type { ClaimResult } from "../../shared/types";
import type { PrizeAmount } from "../../shared/prizes";

const ART: Record<PrizeAmount, { file: string; description: string }> = {
  50000: {
    file: "50000-v1.webp",
    description: "왕관과 금화가 담긴 황금 보물상자",
  },
  30000: {
    file: "30000-v1.webp",
    description: "황금 받침 위에 놓인 파란 보석",
  },
  20000: { file: "20000-v1.webp", description: "탐험 지도와 초록 보석" },
  10000: { file: "10000-v1.webp", description: "금화가 가득한 보물상자" },
  5000: { file: "5000-v1.webp", description: "초록 끈으로 묶은 금화 주머니" },
  2000: {
    file: "2000-v1.webp",
    description: "나뭇잎 옆 반짝이는 별 금화 두 개",
  },
  1000: { file: "1000-v1.webp", description: "행운의 클로버 금화" },
  0: { file: "0-v1.webp", description: "나뭇잎만 남은 빈 보물상자" },
};

/** Resolve only from the confirmed discovery result, never an unexplored target. */
export function prizeArt(result: Pick<ClaimResult, "outcome" | "prizeAmount">) {
  const amount = result.outcome === "bomb" ? 0 : (result.prizeAmount ?? 10000);
  const art = ART[amount] ?? ART[10000];
  return {
    src: `${import.meta.env.BASE_URL}prize-art/${art.file}`,
    alt: art.description,
  };
}

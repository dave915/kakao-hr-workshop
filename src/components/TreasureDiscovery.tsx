import { PartyPopper } from "lucide-react";
import type { ClaimResult } from "../../shared/types";
import { prizeLabel } from "../../shared/prizes";
import { Drawer } from "./common";
import PrizeDiscoveryImage from "./PrizeDiscoveryImage";

export default function TreasureDiscovery({
  result,
  onClose,
  preview = false,
}: {
  result: ClaimResult;
  onClose: () => void;
  preview?: boolean;
}) {
  return (
    <Drawer
      title={
        preview
          ? "발견 화면 미리보기"
          : result.outcome === "bomb"
            ? "앗, 깜짝 선물이었어요!"
            : "새로운 보물을 발견했어요!"
      }
      onClose={onClose}
    >
      <div className={`result-view ${result.outcome}`}>
        <PrizeDiscoveryImage result={result} />
        <h2>
          {result.outcome === "bomb"
            ? "5분 동안 잠깐 쉬어가요"
            : result.prizeAmount !== undefined
              ? `${prizeLabel(result.prizeAmount)} 보물 발견!`
              : `+${result.points} 포인트!`}
        </h2>
        <p>
          {result.outcome === "bomb"
            ? "잠깐의 쉼도 모험의 일부니까요. 휴식 후 다시 도전해요."
            : "우리 팀의 탐험 수첩에도 기록했어요. 다음 보물로 모험을 이어가요!"}
        </p>
        <button className="button dark" onClick={onClose}>
          {preview
            ? "미리보기 닫기"
            : result.outcome === "bomb"
              ? "알겠어요"
              : "다음 모험으로"}
          {!preview && <PartyPopper size={17} />}
        </button>
      </div>
    </Drawer>
  );
}

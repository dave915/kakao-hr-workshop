import { useState } from "react";
import type { ClaimResult } from "../../shared/types";
import { prizeArt } from "../lib/prize-art";
import { TreasureIllustration } from "./ExpeditionArt";

export default function PrizeDiscoveryImage({
  result,
  compact = false,
}: {
  result: Pick<ClaimResult, "outcome" | "prizeAmount">;
  compact?: boolean;
}) {
  const art = prizeArt(result);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <div className={compact ? "prize-art-thumbnail" : "prize-discovery-art"}>
      {failedSource === art.src ? (
        <TreasureIllustration bomb={result.outcome === "bomb"} />
      ) : (
        <img
          src={art.src}
          alt={art.alt}
          width={768}
          height={768}
          loading={compact ? "lazy" : "eager"}
          decoding="async"
          onError={() => setFailedSource(art.src)}
        />
      )}
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import { useAsnafSettings } from "@/hooks/useAsnafSettings";
import { Wheat, Coins, Heart } from "lucide-react";

interface AsnafEligibilityBadgesProps {
  asnafCode: string;
  showLabels?: boolean;
  size?: "sm" | "default";
}

export function AsnafEligibilityBadges({ asnafCode, showLabels = false, size = "default" }: AsnafEligibilityBadgesProps) {
  const { getEligibility } = useAsnafSettings();
  const eligibility = getEligibility(asnafCode);

  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const badgeClass = size === "sm" ? "px-1 py-0 text-[10px]" : "";

  return (
    <div className="flex items-center gap-1">
      {eligibility.zakatFitrah && (
        <Badge variant="outline" className={`bg-emerald-50 text-emerald-700 border-emerald-200 ${badgeClass}`}>
          <Wheat className={iconSize} />
          {showLabels && <span className="ml-1">Fitrah</span>}
        </Badge>
      )}
      {eligibility.zakatMal && (
        <Badge variant="outline" className={`bg-amber-50 text-amber-700 border-amber-200 ${badgeClass}`}>
          <Coins className={iconSize} />
          {showLabels && <span className="ml-1">Mal</span>}
        </Badge>
      )}
      {eligibility.fidyah && (
        <Badge variant="outline" className={`bg-rose-50 text-rose-700 border-rose-200 ${badgeClass}`}>
          <Heart className={iconSize} />
          {showLabels && <span className="ml-1">Fidyah</span>}
        </Badge>
      )}
    </div>
  );
}

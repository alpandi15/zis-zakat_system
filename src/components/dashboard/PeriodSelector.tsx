import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "lucide-react";

interface Period {
  id: string;
  name: string;
  hijri_year: number;
  gregorian_year: number;
  status: string;
}

interface PeriodSelectorProps {
  periods: Period[];
  selectedPeriod: string | null;
  onPeriodChange: (periodId: string) => void;
  isLoading?: boolean;
  className?: string;
}

export function PeriodSelector({
  periods,
  selectedPeriod,
  onPeriodChange,
  isLoading,
  className,
}: PeriodSelectorProps) {
  return (
    <Select value={selectedPeriod || undefined} onValueChange={onPeriodChange} disabled={isLoading}>
      <SelectTrigger
        className={
          className ||
          "h-10 w-full min-w-0 rounded-xl bg-background/70 backdrop-blur sm:w-[260px]"
        }
        aria-label="Pilih periode"
      >
        <Calendar className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
        <SelectValue placeholder="Pilih periode" />
      </SelectTrigger>
      <SelectContent>
        {periods.map((period) => (
          <SelectItem key={period.id} value={period.id}>
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{period.name}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {period.hijri_year}H
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

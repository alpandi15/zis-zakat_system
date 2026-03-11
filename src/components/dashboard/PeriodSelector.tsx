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
}

export function PeriodSelector({
  periods,
  selectedPeriod,
  onPeriodChange,
  isLoading,
}: PeriodSelectorProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span className="text-sm font-medium">Periode:</span>
      </div>
      <Select
        value={selectedPeriod || undefined}
        onValueChange={onPeriodChange}
        disabled={isLoading}
      >
        <SelectTrigger className="w-[280px]">
          <SelectValue placeholder="Pilih periode" />
        </SelectTrigger>
        <SelectContent>
          {periods.map((period) => (
            <SelectItem key={period.id} value={period.id}>
              <div className="flex items-center gap-2">
                <span>{period.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({period.hijri_year}H / {period.gregorian_year}M)
                </span>
                {period.status === "active" && (
                  <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
                    Aktif
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

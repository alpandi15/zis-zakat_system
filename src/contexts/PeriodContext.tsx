import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Period {
  id: string;
  name: string;
  hijri_year: number;
  gregorian_year: number;
  status: "active" | "archived";
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  created_at: string;
  rice_amount_per_person: number | null;
  cash_amount_per_person: number | null;
  fidyah_daily_rate: number | null;
  nisab_gold_price_per_gram: number | null;
  nisab_silver_price_per_gram: number | null;
  amil_distribution_mode: "percentage" | "proportional_with_factor" | null;
  amil_share_factor: number | null;
  packaging_amil_count_override: number | null;
  packaging_non_amil_count_override: number | null;
}

interface PeriodContextType {
  periods: Period[];
  activePeriod: Period | null;
  selectedPeriod: Period | null;
  setSelectedPeriodId: (id: string) => void;
  isReadOnly: boolean;
  isLoading: boolean;
}

const PeriodContext = createContext<PeriodContextType | undefined>(undefined);

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

  const { data: periods = [], isLoading } = useQuery({
    queryKey: ["periods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("periods")
        .select("*")
        .order("hijri_year", { ascending: false });

      if (error) throw error;
      return data as Period[];
    },
  });

  const activePeriod = periods.find((p) => p.status === "active") || null;
  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId) || activePeriod;
  const isReadOnly = selectedPeriod?.status === "archived";

  // Auto-select active period on load
  useEffect(() => {
    if (periods.length > 0 && !selectedPeriodId) {
      const active = periods.find((p) => p.status === "active");
      setSelectedPeriodId(active?.id || periods[0].id);
    }
  }, [periods, selectedPeriodId]);

  return (
    <PeriodContext.Provider
      value={{
        periods,
        activePeriod,
        selectedPeriod,
        setSelectedPeriodId,
        isReadOnly,
        isLoading,
      }}
    >
      {children}
    </PeriodContext.Provider>
  );
}

export function usePeriod() {
  const context = useContext(PeriodContext);
  if (context === undefined) {
    throw new Error("usePeriod must be used within a PeriodProvider");
  }
  return context;
}

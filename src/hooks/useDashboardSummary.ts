import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DashboardSummary {
  period: {
    id: string;
    hijri_year: number;
    gregorian_year: number;
    name: string;
    description: string | null;
    status: string;
    start_date: string;
    end_date: string;
    rice_amount_per_person: number;
    cash_amount_per_person: number;
    fidyah_daily_rate: number;
  };

  received: {
    zakatFitrahCash: number;
    zakatFitrahRice: number;
    zakatMal: number;
    fidyahCash: number;
    fidyahFood: number;
  };

  summary: {
    totalTransactionsFitrah: number;
    totalMuzakkiHouseholds?: number;
    totalTransactions: number;
    totalJiwaFitrah: number;
    totalDistributions: number;
  };

  receiptWindow: {
    firstReceiptAt: string | null;
    latestReceiptAt: string | null;
  };
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async (): Promise<DashboardSummary | null> => {
      const { data, error } = await supabase.rpc("public_dashboard_summary");

      if (error) {
        console.error("dashboard_summary error:", error);
        throw error;
      }

      if (!data) return null;

      return data as unknown as DashboardSummary;
    },
    refetchInterval: 30000,
  });
}

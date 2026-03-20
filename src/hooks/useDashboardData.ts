import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PeriodSummary {
  period_id: string;
  period_name: string;
  hijri_year: number;
  gregorian_year: number;
  zakat_fitrah_cash: number;
  zakat_fitrah_rice_kg: number;
  zakat_mal: number;
  fidyah_cash: number;
  fidyah_food_kg: number;
  total_muzakki: number;
  total_muzakki_households: number;
  total_jiwa_fitrah: number;
  total_mustahik: number;
  total_distributions: number;
  total_combined_cash: number;
}

export interface MemberZakatData {
  member_id: string;
  member_name: string;
  muzakki_name: string;
  relationship: string;
  period_name: string;
  paid_rice_kg: number | null;
  paid_money: number | null;
  transaction_date: string;
}

interface MemberZakatQueryRow {
  rice_amount_kg: number | null;
  money_amount: number | null;
  created_at: string;
  muzakki_members: {
    id: string;
    name: string;
    relationship: string;
    muzakki: {
      name: string;
    };
  };
  periods: {
    name: string;
  };
}

interface FitrahSummaryRow {
  muzakki_id: string | null;
  total_members: number | null;
}

interface ZakatMalSummaryRow {
  muzakki_id: string | null;
}

interface FidyahSummaryRow {
  payer_muzakki_id: string | null;
}

export interface FundBalance {
  category: string;
  total_cash: number;
  total_rice_kg: number;
  total_food_kg: number;
}

export function usePeriods() {
  return useQuery({
    queryKey: ["periods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("periods")
        .select("*")
        .order("hijri_year", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function usePeriodSummary(periodId: string | null) {
  return useQuery({
    queryKey: ["period-summary", periodId],
    queryFn: async () => {
      if (!periodId) return null;
      const { data, error } = await supabase.rpc("dashboard_period_summary", {
        _period_id: periodId,
      });

      if (error) throw error;
      return (data || null) as unknown as PeriodSummary | null;
    },
    enabled: !!periodId,
  });
}

export function useMemberZakatData(periodId: string | null) {
  return useQuery({
    queryKey: ["member-zakat-data", periodId],
    queryFn: async () => {
      if (!periodId) return [];

      const { data, error } = await supabase
        .from("zakat_fitrah_transaction_items")
        .select(
          `
          id,
          rice_amount_kg,
          money_amount,
          created_at,
          muzakki_members!inner (
            id,
            name,
            relationship,
            muzakki!inner (
              name
            )
          ),
          periods!inner (
            name
          )
        `
        )
        .eq("period_id", periodId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data || []) as MemberZakatQueryRow[];

      return rows.map((item) => ({
        member_id: item.muzakki_members.id,
        member_name: item.muzakki_members.name,
        muzakki_name: item.muzakki_members.muzakki.name,
        relationship: item.muzakki_members.relationship,
        period_name: item.periods.name,
        paid_rice_kg: item.rice_amount_kg,
        paid_money: item.money_amount,
        transaction_date: item.created_at,
      }));
    },
    enabled: !!periodId,
  });
}

export function useZakatVsFidyahComparison(periodId: string | null) {
  return useQuery({
    queryKey: ["zakat-vs-fidyah", periodId],
    queryFn: async () => {
      if (!periodId) return null;

      // Get zakat fitrah transactions
      const { data: zakatFitrah } = await supabase
        .from("zakat_fitrah_transactions")
        .select("money_amount, rice_amount_kg")
        .eq("period_id", periodId);

      // Get zakat mal transactions
      const { data: zakatMal } = await supabase
        .from("zakat_mal_transactions")
        .select("final_zakat_amount")
        .eq("period_id", periodId);

      // Get fidyah transactions
      const { data: fidyah } = await supabase
        .from("fidyah_transactions")
        .select("cash_amount, food_amount_kg")
        .eq("period_id", periodId);

      const zakatFitrahTotal = (zakatFitrah || []).reduce(
        (sum, t) => sum + (Number(t.money_amount) || 0),
        0
      );
      const zakatFitrahRice = (zakatFitrah || []).reduce(
        (sum, t) => sum + (Number(t.rice_amount_kg) || 0),
        0
      );
      const zakatMalTotal = (zakatMal || []).reduce(
        (sum, t) => sum + (Number(t.final_zakat_amount) || 0),
        0
      );
      const fidyahCashTotal = (fidyah || []).reduce(
        (sum, t) => sum + (Number(t.cash_amount) || 0),
        0
      );
      const fidyahFoodTotal = (fidyah || []).reduce(
        (sum, t) => sum + (Number(t.food_amount_kg) || 0),
        0
      );

      return {
        zakatFitrahCash: zakatFitrahTotal,
        zakatFitrahRice: zakatFitrahRice,
        zakatMal: zakatMalTotal,
        fidyahCash: fidyahCashTotal,
        fidyahFood: fidyahFoodTotal,
        totalZakat: zakatFitrahTotal + zakatMalTotal,
        totalFidyah: fidyahCashTotal,
      };
    },
    enabled: !!periodId,
  });
}

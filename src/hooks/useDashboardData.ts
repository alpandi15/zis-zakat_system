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

      // Get period info
      const { data: period, error: periodError } = await supabase
        .from("periods")
        .select("*")
        .eq("id", periodId)
        .maybeSingle();

      if (periodError) throw periodError;
      if (!period) return null;

      // Get fund balances
      const { data: balances, error: balanceError } = await supabase.rpc(
        "get_all_fund_balances",
        { _period_id: periodId }
      );

      if (balanceError) throw balanceError;

      const [fitrahSummaryRes, zakatMalSummaryRes, fidyahSummaryRes] = await Promise.all([
        supabase
          .from("zakat_fitrah_transactions")
          .select("muzakki_id, total_members")
          .eq("period_id", periodId)
          .eq("is_void", false),
        supabase
          .from("zakat_mal_transactions")
          .select("muzakki_id")
          .eq("period_id", periodId)
          .eq("is_void", false),
        supabase
          .from("fidyah_transactions")
          .select("payer_muzakki_id")
          .eq("period_id", periodId)
          .eq("is_void", false),
      ]);

      if (fitrahSummaryRes.error) throw fitrahSummaryRes.error;
      if (zakatMalSummaryRes.error) throw zakatMalSummaryRes.error;
      if (fidyahSummaryRes.error) throw fidyahSummaryRes.error;

      const fitrahSummaryRows = (fitrahSummaryRes.data || []) as FitrahSummaryRow[];
      const zakatMalSummaryRows = (zakatMalSummaryRes.data || []) as ZakatMalSummaryRow[];
      const fidyahSummaryRows = (fidyahSummaryRes.data || []) as FidyahSummaryRow[];

      const householdMuzakkiIds = new Set<string>();
      fitrahSummaryRows.forEach((row) => {
        if (row.muzakki_id) householdMuzakkiIds.add(row.muzakki_id);
      });
      zakatMalSummaryRows.forEach((row) => {
        if (row.muzakki_id) householdMuzakkiIds.add(row.muzakki_id);
      });
      fidyahSummaryRows.forEach((row) => {
        if (row.payer_muzakki_id) householdMuzakkiIds.add(row.payer_muzakki_id);
      });

      const totalJiwaFitrah = fitrahSummaryRows.reduce(
        (sum, row) => sum + Math.max(1, Number(row.total_members) || 0),
        0,
      );
      const totalCombinedCash =
        (balances?.find((b: FundBalance) => b.category === "zakat_fitrah_cash")?.total_cash || 0) +
        (balances?.find((b: FundBalance) => b.category === "zakat_mal")?.total_cash || 0) +
        (balances?.find((b: FundBalance) => b.category === "fidyah_cash")?.total_cash || 0);

      // Get mustahik count with distributions
      const { count: mustahikCount } = await supabase
        .from("zakat_distributions")
        .select("mustahik_id", { count: "exact", head: true })
        .eq("period_id", periodId);

      // Get total distributions
      const { count: distributionCount } = await supabase
        .from("zakat_distributions")
        .select("id", { count: "exact", head: true })
        .eq("period_id", periodId)
        .eq("status", "distributed");

      const summary: PeriodSummary = {
        period_id: period.id,
        period_name: period.name,
        hijri_year: period.hijri_year,
        gregorian_year: period.gregorian_year,
        zakat_fitrah_cash:
          balances?.find((b: FundBalance) => b.category === "zakat_fitrah_cash")
            ?.total_cash || 0,
        zakat_fitrah_rice_kg:
          balances?.find((b: FundBalance) => b.category === "zakat_fitrah_rice")
            ?.total_rice_kg || 0,
        zakat_mal:
          balances?.find((b: FundBalance) => b.category === "zakat_mal")
            ?.total_cash || 0,
        fidyah_cash:
          balances?.find((b: FundBalance) => b.category === "fidyah_cash")
            ?.total_cash || 0,
        fidyah_food_kg:
          balances?.find((b: FundBalance) => b.category === "fidyah_food")
            ?.total_food_kg || 0,
        total_muzakki: householdMuzakkiIds.size,
        total_muzakki_households: householdMuzakkiIds.size,
        total_jiwa_fitrah: totalJiwaFitrah,
        total_mustahik: mustahikCount || 0,
        total_distributions: distributionCount || 0,
        total_combined_cash: totalCombinedCash,
      };

      return summary;
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

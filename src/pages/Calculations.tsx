import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ReadOnlyBanner } from "@/components/shared/ReadOnlyBanner";
import { useAsnafSettings } from "@/hooks/useAsnafSettings";
import { usePeriod } from "@/contexts/PeriodContext";
import { useDistributionCalculation, type AmilDistributionMode } from "@/hooks/useDistributionCalculation";
import { usePeriodSummary } from "@/hooks/useDashboardData";
import type { Enums, TablesInsert } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatCurrency";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calculator, Coins, Wheat, Utensils, Scale, ArrowRight, Sparkles, Lock, Info, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { compareMustahikRoute } from "@/lib/mustahikRoute";

interface FundBalance {
  category: FundCategory;
  total_cash: number;
  total_rice_kg: number;
  total_food_kg: number;
}

interface LockedBatchItemRow {
  fund_category: FundCategory;
  cash_amount: number;
  rice_amount_kg: number;
  food_amount_kg: number;
  batch: { status: string } | null;
}

interface CalculationBatchRow {
  id: string;
  batch_no: number;
  batch_code: string;
  status: string;
  notes: string | null;
  locked_at: string;
  total_allocated_cash: number;
  total_allocated_rice_kg: number;
  total_allocated_food_kg: number;
  distributed_at: string | null;
}

interface PackagingRecipientSummary {
  mustahikId: string;
  name: string;
  asnafCode: string;
  priority: string;
  distribution_rt?: string | null;
  distribution_lane?: string | null;
  delivery_order?: number | null;
  isAmil: boolean;
  totalCash: number;
  totalRiceKg: number;
  totalFoodKg: number;
  zakatFitrahCash: number;
  zakatMalCash: number;
  fidyahCash: number;
}

interface PackagingAsnafSummary {
  asnafCode: string;
  recipientCount: number;
  totalCash: number;
  totalRiceKg: number;
  totalFoodKg: number;
  zakatFitrahCash: number;
  zakatMalCash: number;
  fidyahCash: number;
}

interface PackagingGroupSummary {
  recipientCount: number;
  totalCash: number;
  totalRiceKg: number;
  totalFoodKg: number;
  zakatFitrahCash: number;
  zakatMalCash: number;
  fidyahCash: number;
  averageCashPerRecipient: number;
  averageRicePerRecipient: number;
  averageFoodPerRecipient: number;
}

interface PackagingSummary {
  recipients: PackagingRecipientSummary[];
  asnafGroups: PackagingAsnafSummary[];
  groupBreakdown: {
    amil: PackagingGroupSummary;
    nonAmil: PackagingGroupSummary;
  };
  totals: {
    totalCash: number;
    totalRiceKg: number;
    totalFoodKg: number;
    zakatFitrahCash: number;
    zakatMalCash: number;
    fidyahCash: number;
  };
}

interface PackagingRecipientCountOverrides {
  amilCount: number;
  nonAmilCount: number;
}

interface PackagingGroupBreakdownOptions {
  totals: PackagingSummary["totals"];
  amilCount: number;
  nonAmilCount: number;
  amilDistributionMode: AmilDistributionMode;
  amilShareFactor: number;
  amilPercentage: number;
}

interface PackagingSourceItem {
  mustahikId: string;
  fundCategory: FundCategory;
  cashAmount: number;
  riceAmountKg: number;
  foodAmountKg: number;
  isAmil: boolean;
  asnafCode: string;
  priority: string;
  name?: string;
}

type FundCategory = Enums<"fund_category">;

const normalizeAmilMode = (mode: string | null | undefined): AmilDistributionMode =>
  mode === "proportional_with_factor" ? "proportional_with_factor" : "percentage";

const normalizeAmilShareFactor = (factor: number | null | undefined): number => {
  if (typeof factor !== "number" || Number.isNaN(factor)) return 0.5;
  return Math.max(0, Math.min(1, factor));
};

const FUND_CATEGORIES: FundCategory[] = [
  "zakat_fitrah_cash",
  "zakat_fitrah_rice",
  "zakat_mal",
  "fidyah_cash",
  "fidyah_food",
];

const CATEGORY_META: Record<
  FundCategory,
  { label: string; icon: typeof Coins; accent: string; unit: "cash" | "rice" | "food" }
> = {
  zakat_fitrah_cash: { label: "Zakat Fitrah Uang", icon: Coins, accent: "text-emerald-600", unit: "cash" },
  zakat_fitrah_rice: { label: "Zakat Fitrah Beras", icon: Wheat, accent: "text-amber-600", unit: "rice" },
  zakat_mal: { label: "Zakat Mal", icon: Scale, accent: "text-cyan-600", unit: "cash" },
  fidyah_cash: { label: "Fidyah Uang", icon: Coins, accent: "text-sky-600", unit: "cash" },
  fidyah_food: { label: "Fidyah Makanan", icon: Utensils, accent: "text-orange-600", unit: "food" },
};

const BATCH_STATUS_LABELS: Record<string, string> = {
  locked: "Terkunci",
  distributed: "Sudah Disalurkan",
  cancelled: "Dibatalkan",
};

const toDisplayAmount = (unit: "cash" | "rice" | "food", value: number) =>
  unit === "cash" ? formatCurrency(value) : `${value.toFixed(2)} kg`;

const createEmptyBalanceMap = () =>
  new Map<FundCategory, FundBalance>(
    FUND_CATEGORIES.map((category) => [
      category,
      { category, total_cash: 0, total_rice_kg: 0, total_food_kg: 0 },
    ]),
  );

const createEmptyPackagingGroupSummary = (): PackagingGroupSummary => ({
  recipientCount: 0,
  totalCash: 0,
  totalRiceKg: 0,
  totalFoodKg: 0,
  zakatFitrahCash: 0,
  zakatMalCash: 0,
  fidyahCash: 0,
  averageCashPerRecipient: 0,
  averageRicePerRecipient: 0,
  averageFoodPerRecipient: 0,
});

const createEmptyPackagingSummary = (): PackagingSummary => ({
  recipients: [],
  asnafGroups: [],
  groupBreakdown: {
    amil: createEmptyPackagingGroupSummary(),
    nonAmil: createEmptyPackagingGroupSummary(),
  },
  totals: {
    totalCash: 0,
    totalRiceKg: 0,
    totalFoodKg: 0,
    zakatFitrahCash: 0,
    zakatMalCash: 0,
    fidyahCash: 0,
  },
});

const clampRecipientCount = (value: number) => Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));

const floorAverage = (total: number, recipientCount: number, scale = 1) => {
  if (recipientCount <= 0 || total <= 0) return 0;
  const scaledTotal = Math.max(0, Math.round(total * scale));
  return Math.floor(scaledTotal / recipientCount) / scale;
};

const splitPackagingPortions = (
  totalAmount: number,
  amilCount: number,
  nonAmilCount: number,
  mode: AmilDistributionMode,
  factor: number,
  percentage: number,
  scale = 1,
) => {
  const safeTotal = Math.max(0, totalAmount);
  const scaledTotal = Math.max(0, Math.round(safeTotal * scale));

  if (scaledTotal <= 0) {
    return { amilTotal: 0, nonAmilTotal: 0 };
  }

  if (amilCount <= 0) {
    return { amilTotal: 0, nonAmilTotal: scaledTotal / scale };
  }

  if (nonAmilCount <= 0) {
    return { amilTotal: scaledTotal / scale, nonAmilTotal: 0 };
  }

  let amilScaled = 0;

  if (mode === "proportional_with_factor") {
    const recipientTotal = amilCount + nonAmilCount;
    const basePerRecipientScaled = recipientTotal > 0 ? Math.floor(scaledTotal / recipientTotal) : 0;
    const amilPerRecipientScaled = Math.floor(basePerRecipientScaled * factor);
    amilScaled = Math.min(scaledTotal, Math.max(0, amilPerRecipientScaled * amilCount));
  } else {
    amilScaled = Math.min(scaledTotal, Math.max(0, Math.floor(scaledTotal * percentage)));
  }

  amilScaled = Math.min(amilScaled, Math.floor(scaledTotal / 2));

  const nonAmilScaled = Math.max(0, scaledTotal - amilScaled);

  return {
    amilTotal: amilScaled / scale,
    nonAmilTotal: nonAmilScaled / scale,
  };
};

const buildPackagingGroupBreakdown = ({
  totals,
  amilCount,
  nonAmilCount,
  amilDistributionMode,
  amilShareFactor,
  amilPercentage,
}: PackagingGroupBreakdownOptions): PackagingSummary["groupBreakdown"] => {
  const safeAmilCount = clampRecipientCount(amilCount);
  const safeNonAmilCount = clampRecipientCount(nonAmilCount);

  const zakatFitrahCashSplit = splitPackagingPortions(
    totals.zakatFitrahCash,
    safeAmilCount,
    safeNonAmilCount,
    amilDistributionMode,
    amilShareFactor,
    amilPercentage,
    1,
  );

  const zakatMalCashSplit = splitPackagingPortions(
    totals.zakatMalCash,
    safeAmilCount,
    safeNonAmilCount,
    amilDistributionMode,
    amilShareFactor,
    amilPercentage,
    1,
  );

  const zakatFitrahRiceSplit = splitPackagingPortions(
    totals.totalRiceKg,
    safeAmilCount,
    safeNonAmilCount,
    amilDistributionMode,
    amilShareFactor,
    amilPercentage,
    100,
  );

  const amilTotalCash = zakatFitrahCashSplit.amilTotal + zakatMalCashSplit.amilTotal;
  const nonAmilTotalCash =
    zakatFitrahCashSplit.nonAmilTotal + zakatMalCashSplit.nonAmilTotal + Math.max(0, totals.fidyahCash);
  const amilTotalRiceKg = zakatFitrahRiceSplit.amilTotal;
  const nonAmilTotalRiceKg = zakatFitrahRiceSplit.nonAmilTotal;
  const nonAmilTotalFoodKg = Math.max(0, totals.totalFoodKg);

  return {
    amil: {
      recipientCount: safeAmilCount,
      totalCash: amilTotalCash,
      totalRiceKg: amilTotalRiceKg,
      totalFoodKg: 0,
      zakatFitrahCash: zakatFitrahCashSplit.amilTotal,
      zakatMalCash: zakatMalCashSplit.amilTotal,
      fidyahCash: 0,
      averageCashPerRecipient: floorAverage(amilTotalCash, safeAmilCount, 1),
      averageRicePerRecipient: floorAverage(amilTotalRiceKg, safeAmilCount, 100),
      averageFoodPerRecipient: 0,
    },
    nonAmil: {
      recipientCount: safeNonAmilCount,
      totalCash: nonAmilTotalCash,
      totalRiceKg: nonAmilTotalRiceKg,
      totalFoodKg: nonAmilTotalFoodKg,
      zakatFitrahCash: zakatFitrahCashSplit.nonAmilTotal,
      zakatMalCash: zakatMalCashSplit.nonAmilTotal,
      fidyahCash: Math.max(0, totals.fidyahCash),
      averageCashPerRecipient: floorAverage(nonAmilTotalCash, safeNonAmilCount, 1),
      averageRicePerRecipient: floorAverage(nonAmilTotalRiceKg, safeNonAmilCount, 100),
      averageFoodPerRecipient: floorAverage(nonAmilTotalFoodKg, safeNonAmilCount, 100),
    },
  };
};

const applyPackagingRecipientCountOverrides = (
  summary: PackagingSummary,
  overrides: PackagingRecipientCountOverrides,
  options: Omit<PackagingGroupBreakdownOptions, "amilCount" | "nonAmilCount">,
): PackagingSummary => {
  const amilCount = clampRecipientCount(overrides.amilCount);
  const nonAmilCount = clampRecipientCount(overrides.nonAmilCount);

  return {
    ...summary,
    groupBreakdown: buildPackagingGroupBreakdown({
      amilCount,
      nonAmilCount,
      ...options,
    }),
  };
};

const buildPackagingSummary = (
  items: PackagingSourceItem[],
  mustahikMetaMap: Map<
    string,
    {
      name: string;
      asnafCode: string;
      priority: string;
      distribution_rt?: string | null;
      distribution_lane?: string | null;
      delivery_order?: number | null;
    }
  >,
): PackagingSummary => {
  if (items.length === 0) return createEmptyPackagingSummary();

  const recipientMap = new Map<string, PackagingRecipientSummary>();

  items.forEach((item) => {
    const meta = mustahikMetaMap.get(item.mustahikId);
    const current =
      recipientMap.get(item.mustahikId) ||
      ({
        mustahikId: item.mustahikId,
        name: item.name || meta?.name || "Mustahik",
        asnafCode: item.asnafCode || meta?.asnafCode || "",
        priority: String(item.priority || meta?.priority || "medium"),
        distribution_rt: meta?.distribution_rt || null,
        distribution_lane: meta?.distribution_lane || null,
        delivery_order: meta?.delivery_order ?? null,
        isAmil: Boolean(item.isAmil || (item.asnafCode || meta?.asnafCode || "") === "amil"),
        totalCash: 0,
        totalRiceKg: 0,
        totalFoodKg: 0,
        zakatFitrahCash: 0,
        zakatMalCash: 0,
        fidyahCash: 0,
      } as PackagingRecipientSummary);

    current.totalCash += Number(item.cashAmount || 0);
    current.totalRiceKg += Number(item.riceAmountKg || 0);
    current.totalFoodKg += Number(item.foodAmountKg || 0);

    if (item.fundCategory === "zakat_fitrah_cash") current.zakatFitrahCash += Number(item.cashAmount || 0);
    if (item.fundCategory === "zakat_mal") current.zakatMalCash += Number(item.cashAmount || 0);
    if (item.fundCategory === "fidyah_cash") current.fidyahCash += Number(item.cashAmount || 0);
    if (item.isAmil) current.isAmil = true;

    recipientMap.set(item.mustahikId, current);
  });

  const recipients = Array.from(recipientMap.values()).sort(compareMustahikRoute);

  const asnafMap = new Map<string, PackagingAsnafSummary>();
  recipients.forEach((recipient) => {
    const key = recipient.asnafCode || "lainnya";
    const current =
      asnafMap.get(key) ||
      ({
        asnafCode: key,
        recipientCount: 0,
        totalCash: 0,
        totalRiceKg: 0,
        totalFoodKg: 0,
        zakatFitrahCash: 0,
        zakatMalCash: 0,
        fidyahCash: 0,
      } as PackagingAsnafSummary);

    current.recipientCount += 1;
    current.totalCash += recipient.totalCash;
    current.totalRiceKg += recipient.totalRiceKg;
    current.totalFoodKg += recipient.totalFoodKg;
    current.zakatFitrahCash += recipient.zakatFitrahCash;
    current.zakatMalCash += recipient.zakatMalCash;
    current.fidyahCash += recipient.fidyahCash;
    asnafMap.set(key, current);
  });

  const asnafGroups = Array.from(asnafMap.values()).sort((a, b) => a.asnafCode.localeCompare(b.asnafCode));

  const accumulator = {
    amil: {
      recipientCount: 0,
      totalCash: 0,
      totalRiceKg: 0,
      totalFoodKg: 0,
      zakatFitrahCash: 0,
      zakatMalCash: 0,
      fidyahCash: 0,
    },
    nonAmil: {
      recipientCount: 0,
      totalCash: 0,
      totalRiceKg: 0,
      totalFoodKg: 0,
      zakatFitrahCash: 0,
      zakatMalCash: 0,
      fidyahCash: 0,
    },
  };

  recipients.forEach((recipient) => {
    const key = recipient.isAmil ? "amil" : "nonAmil";
    accumulator[key].recipientCount += 1;
    accumulator[key].totalCash += recipient.totalCash;
    accumulator[key].totalRiceKg += recipient.totalRiceKg;
    accumulator[key].totalFoodKg += recipient.totalFoodKg;
    accumulator[key].zakatFitrahCash += recipient.zakatFitrahCash;
    accumulator[key].zakatMalCash += recipient.zakatMalCash;
    accumulator[key].fidyahCash += recipient.fidyahCash;
  });

  return {
    recipients,
    asnafGroups,
    groupBreakdown: {
      amil: {
        ...accumulator.amil,
        averageCashPerRecipient: accumulator.amil.recipientCount > 0 ? accumulator.amil.totalCash / accumulator.amil.recipientCount : 0,
        averageRicePerRecipient: accumulator.amil.recipientCount > 0 ? accumulator.amil.totalRiceKg / accumulator.amil.recipientCount : 0,
        averageFoodPerRecipient: accumulator.amil.recipientCount > 0 ? accumulator.amil.totalFoodKg / accumulator.amil.recipientCount : 0,
      },
      nonAmil: {
        ...accumulator.nonAmil,
        averageCashPerRecipient:
          accumulator.nonAmil.recipientCount > 0 ? accumulator.nonAmil.totalCash / accumulator.nonAmil.recipientCount : 0,
        averageRicePerRecipient:
          accumulator.nonAmil.recipientCount > 0 ? accumulator.nonAmil.totalRiceKg / accumulator.nonAmil.recipientCount : 0,
        averageFoodPerRecipient:
          accumulator.nonAmil.recipientCount > 0 ? accumulator.nonAmil.totalFoodKg / accumulator.nonAmil.recipientCount : 0,
      },
    },
    totals: recipients.reduce(
      (acc, recipient) => {
        acc.totalCash += recipient.totalCash;
        acc.totalRiceKg += recipient.totalRiceKg;
        acc.totalFoodKg += recipient.totalFoodKg;
        acc.zakatFitrahCash += recipient.zakatFitrahCash;
        acc.zakatMalCash += recipient.zakatMalCash;
        acc.fidyahCash += recipient.fidyahCash;
        return acc;
      },
      {
        totalCash: 0,
        totalRiceKg: 0,
        totalFoodKg: 0,
        zakatFitrahCash: 0,
        zakatMalCash: 0,
        fidyahCash: 0,
      },
    ),
  };
};

export default function Calculations() {
  const { selectedPeriod, isReadOnly } = usePeriod();
  const { getLabel } = useAsnafSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [amilDistributionMode, setAmilDistributionMode] = useState<AmilDistributionMode>("percentage");
  const [amilShareFactor, setAmilShareFactor] = useState(0.5);
  const [batchNotes, setBatchNotes] = useState("");
  const [isPackagingDetailOpen, setIsPackagingDetailOpen] = useState(false);
  const [packagingDetailTab, setPackagingDetailTab] = useState<"asnaf" | "mustahik">("asnaf");
  const [packagingAmilCountInput, setPackagingAmilCountInput] = useState("0");
  const [packagingNonAmilCountInput, setPackagingNonAmilCountInput] = useState("0");

  const periodMode = normalizeAmilMode(selectedPeriod?.amil_distribution_mode);
  const periodShareFactor = normalizeAmilShareFactor(selectedPeriod?.amil_share_factor);
  const isConfigChanged = Math.abs(amilShareFactor - periodShareFactor) > 0.0001 || amilDistributionMode !== periodMode;

  useEffect(() => {
    setAmilDistributionMode(periodMode);
    setAmilShareFactor(periodShareFactor);
  }, [periodMode, periodShareFactor, selectedPeriod?.id]);

  const { data: mustahikList = [] } = useQuery({
    queryKey: ["mustahik-active-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mustahik")
        .select("id, name, asnaf_id, priority, family_members, distribution_rt, distribution_lane, delivery_order, asnaf_settings(asnaf_code)")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data as {
        id: string;
        name: string;
        asnaf_id: string;
        priority: string;
        family_members: number;
        distribution_rt: string | null;
        distribution_lane: string | null;
        delivery_order: number | null;
        asnaf_settings: { asnaf_code: string } | null;
      }[];
    },
  });

  const { data: periodSummary } = usePeriodSummary(selectedPeriod?.id || null);

  const { data: lockedBatchItems = [] } = useQuery({
    queryKey: ["distribution-batch-items-for-lock-balance", selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];

      const { data, error } = await supabase
        .from("distribution_calculation_batch_items")
        .select("fund_category, cash_amount, rice_amount_kg, food_amount_kg, batch:batch_id(status)")
        .eq("period_id", selectedPeriod.id);

      if (error) throw error;
      return data as unknown as LockedBatchItemRow[];
    },
    enabled: !!selectedPeriod?.id,
  });

  const { data: lockedBatches = [] } = useQuery({
    queryKey: ["distribution-calculation-batches", selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];

      const { data, error } = await supabase
        .from("distribution_calculation_batches")
        .select(
          "id, batch_no, batch_code, status, notes, locked_at, total_allocated_cash, total_allocated_rice_kg, total_allocated_food_kg, distributed_at",
        )
        .eq("period_id", selectedPeriod.id)
        .order("batch_no", { ascending: false });

      if (error) throw error;
      return data as CalculationBatchRow[];
    },
    enabled: !!selectedPeriod?.id,
  });

  const receivedBalanceMap = useMemo(() => {
    const map = createEmptyBalanceMap();
    const fitrahCash = map.get("zakat_fitrah_cash");
    const fitrahRice = map.get("zakat_fitrah_rice");
    const zakatMal = map.get("zakat_mal");
    const fidyahCash = map.get("fidyah_cash");
    const fidyahFood = map.get("fidyah_food");

    if (fitrahCash) fitrahCash.total_cash = Math.max(0, Number(periodSummary?.zakat_fitrah_cash || 0));
    if (fitrahRice) fitrahRice.total_rice_kg = Math.max(0, Number(periodSummary?.zakat_fitrah_rice_kg || 0));
    if (zakatMal) zakatMal.total_cash = Math.max(0, Number(periodSummary?.zakat_mal || 0));
    if (fidyahCash) fidyahCash.total_cash = Math.max(0, Number(periodSummary?.fidyah_cash || 0));
    if (fidyahFood) fidyahFood.total_food_kg = Math.max(0, Number(periodSummary?.fidyah_food_kg || 0));

    return map;
  }, [periodSummary]);

  const lockedBalanceMap = useMemo(() => {
    const map = createEmptyBalanceMap();

    lockedBatchItems.forEach((item) => {
      if (item.batch?.status === "cancelled") return;

      const current = map.get(item.fund_category);
      if (!current) return;

      current.total_cash += Math.max(0, Number(item.cash_amount || 0));
      current.total_rice_kg += Math.max(0, Number(item.rice_amount_kg || 0));
      current.total_food_kg += Math.max(0, Number(item.food_amount_kg || 0));
    });

    return map;
  }, [lockedBatchItems]);

  const availableForNextBatch = useMemo(() => {
    return FUND_CATEGORIES.map((category) => {
      const inflow = receivedBalanceMap.get(category) || {
        category,
        total_cash: 0,
        total_rice_kg: 0,
        total_food_kg: 0,
      };
      const locked = lockedBalanceMap.get(category) || {
        category,
        total_cash: 0,
        total_rice_kg: 0,
        total_food_kg: 0,
      };

      return {
        category,
        total_cash: Math.max(0, inflow.total_cash - locked.total_cash),
        total_rice_kg: Math.max(0, inflow.total_rice_kg - locked.total_rice_kg),
        total_food_kg: Math.max(0, inflow.total_food_kg - locked.total_food_kg),
      };
    });
  }, [receivedBalanceMap, lockedBalanceMap]);

  const overallAvailableBalances = useMemo(() => {
    return [
      {
        category: "zakat_fitrah_cash" as FundCategory,
        total_cash: Math.max(0, Number(periodSummary?.zakat_fitrah_cash || 0)),
        total_rice_kg: 0,
        total_food_kg: 0,
      },
      {
        category: "zakat_fitrah_rice" as FundCategory,
        total_cash: 0,
        total_rice_kg: Math.max(0, Number(periodSummary?.zakat_fitrah_rice_kg || 0)),
        total_food_kg: 0,
      },
      {
        category: "zakat_mal" as FundCategory,
        total_cash: Math.max(0, Number(periodSummary?.zakat_mal || 0)),
        total_rice_kg: 0,
        total_food_kg: 0,
      },
      {
        category: "fidyah_cash" as FundCategory,
        total_cash: Math.max(0, Number(periodSummary?.fidyah_cash || 0)),
        total_rice_kg: 0,
        total_food_kg: 0,
      },
      {
        category: "fidyah_food" as FundCategory,
        total_cash: 0,
        total_rice_kg: 0,
        total_food_kg: Math.max(0, Number(periodSummary?.fidyah_food_kg || 0)),
      },
    ];
  }, [periodSummary]);

  const calculations = useDistributionCalculation(mustahikList, availableForNextBatch, [], {
    amilDistributionMode,
    amilShareFactor,
    excludeExistingDistributed: false,
  });

  const overallCalculations = useDistributionCalculation(mustahikList, overallAvailableBalances, [], {
    amilDistributionMode,
    amilShareFactor,
    excludeExistingDistributed: false,
  });

  const categorySummaries = useMemo(() => {
    const map = {
      zakat_fitrah_cash: calculations.zakatFitrahCash,
      zakat_fitrah_rice: calculations.zakatFitrahRice,
      zakat_mal: calculations.zakatMal,
      fidyah_cash: calculations.fidyahCash,
      fidyah_food: calculations.fidyahFood,
    };

    return FUND_CATEGORIES.map((category) => {
      const summary = map[category];
      const meta = CATEGORY_META[category];
      const available = availableForNextBatch.find((b) => b.category === category) || {
        total_cash: 0,
        total_rice_kg: 0,
        total_food_kg: 0,
      };
      const inflow = receivedBalanceMap.get(category) || { total_cash: 0, total_rice_kg: 0, total_food_kg: 0 };
      const locked = lockedBalanceMap.get(category) || { total_cash: 0, total_rice_kg: 0, total_food_kg: 0 };

      const availableValue =
        meta.unit === "cash"
          ? available.total_cash
          : meta.unit === "rice"
            ? available.total_rice_kg
            : available.total_food_kg;

      const inflowValue =
        meta.unit === "cash" ? inflow.total_cash : meta.unit === "rice" ? inflow.total_rice_kg : inflow.total_food_kg;

      const lockedValue =
        meta.unit === "cash" ? locked.total_cash : meta.unit === "rice" ? locked.total_rice_kg : locked.total_food_kg;

      const allocatedValue = summary.amilTotal + summary.beneficiaryTotal;
      const totalRecipients = summary.amil.length + summary.beneficiaries.length;

      return {
        category,
        meta,
        availableValue,
        inflowValue,
        lockedValue,
        allocatedValue,
        totalRecipients,
        amilRecipients: summary.amil.length,
        mustahikRecipients: summary.beneficiaries.length,
      };
    });
  }, [calculations, availableForNextBatch, receivedBalanceMap, lockedBalanceMap]);

  const totalAvailableCash = useMemo(
    () => availableForNextBatch.reduce((sum, item) => sum + Number(item.total_cash || 0), 0),
    [availableForNextBatch],
  );

  const totalAvailableRice = useMemo(
    () => availableForNextBatch.reduce((sum, item) => sum + Number(item.total_rice_kg || 0), 0),
    [availableForNextBatch],
  );

  const totalAvailableFood = useMemo(
    () => availableForNextBatch.reduce((sum, item) => sum + Number(item.total_food_kg || 0), 0),
    [availableForNextBatch],
  );

  const amilCount = calculations.amilList.length;
  const beneficiaryCount = calculations.beneficiaryList.length;
  const totalRecipients = amilCount + beneficiaryCount;
  const amilPercentage = calculations.configuration.amilPercentage;
  const baseAmilRatio = totalRecipients > 0 ? amilCount / totalRecipients : 0;
  const effectiveAmilShare =
    amilDistributionMode === "percentage" ? amilPercentage : baseAmilRatio * amilShareFactor;

  const sampleCash = 1_000_000;
  const sampleRiceKg = 100;
  const sampleAmilCash = Math.round(sampleCash * effectiveAmilShare);
  const sampleBeneficiaryCash = sampleCash - sampleAmilCash;
  const sampleAmilRice = Number((sampleRiceKg * effectiveAmilShare).toFixed(2));
  const sampleBeneficiaryRice = Number((sampleRiceKg - sampleAmilRice).toFixed(2));
  const sampleCashPerAmil = amilCount > 0 ? Math.floor(sampleAmilCash / amilCount) : 0;
  const sampleRicePerAmil = amilCount > 0 ? Number((sampleAmilRice / amilCount).toFixed(2)) : 0;

  // Fixed scenario example for easier field explanation.
  const demoAmilCount = 10;
  const demoBeneficiaryCount = 10;
  const demoRecipientTotal = demoAmilCount + demoBeneficiaryCount;
  const demoBaseAmilRatio = demoRecipientTotal > 0 ? demoAmilCount / demoRecipientTotal : 0;
  const demoPercentageShare = amilPercentage;
  const demoProportionalShare = demoBaseAmilRatio * amilShareFactor;
  const demoPercentageCash = Math.round(sampleCash * demoPercentageShare);
  const demoProportionalCash = Math.round(sampleCash * demoProportionalShare);
  const demoPercentageRice = Number((sampleRiceKg * demoPercentageShare).toFixed(2));
  const demoProportionalRice = Number((sampleRiceKg * demoProportionalShare).toFixed(2));

  const defaultPackagingAmilCount = overallCalculations.amilList.length;
  const defaultPackagingNonAmilCount = overallCalculations.beneficiaryList.length;

  useEffect(() => {
    setPackagingAmilCountInput(
      String(selectedPeriod?.packaging_amil_count_override ?? defaultPackagingAmilCount),
    );
    setPackagingNonAmilCountInput(
      String(selectedPeriod?.packaging_non_amil_count_override ?? defaultPackagingNonAmilCount),
    );
  }, [
    selectedPeriod?.id,
    selectedPeriod?.packaging_amil_count_override,
    selectedPeriod?.packaging_non_amil_count_override,
    defaultPackagingAmilCount,
    defaultPackagingNonAmilCount,
  ]);

  const mustahikMetaMap = useMemo(
    () =>
      new Map(
        mustahikList.map((m) => [
          m.id,
          {
            name: m.name,
            asnafCode: m.asnaf_settings?.asnaf_code || "",
            priority: m.priority,
            distribution_rt: m.distribution_rt,
            distribution_lane: m.distribution_lane,
            delivery_order: m.delivery_order,
          },
        ]),
      ),
    [mustahikList],
  );

  const baseOverallPackagingSummary = useMemo(() => {
    const overallItems: PackagingSourceItem[] = [];
    const pushRecipients = (
      fundCategory: FundCategory,
      recipients: typeof overallCalculations.zakatFitrahCash.amil,
      isAmil: boolean,
    ) => {
      recipients.forEach((recipient) => {
        overallItems.push({
          mustahikId: recipient.mustahikId,
          name: recipient.name,
          fundCategory,
          cashAmount: Number(recipient.cashAmount || 0),
          riceAmountKg: Number(recipient.riceAmount || 0),
          foodAmountKg: Number(recipient.foodAmount || 0),
          isAmil,
          asnafCode: recipient.asnaf,
          priority: recipient.priority,
        });
      });
    };

    pushRecipients("zakat_fitrah_cash", overallCalculations.zakatFitrahCash.amil, true);
    pushRecipients("zakat_fitrah_cash", overallCalculations.zakatFitrahCash.beneficiaries, false);
    pushRecipients("zakat_fitrah_rice", overallCalculations.zakatFitrahRice.amil, true);
    pushRecipients("zakat_fitrah_rice", overallCalculations.zakatFitrahRice.beneficiaries, false);
    pushRecipients("zakat_mal", overallCalculations.zakatMal.amil, true);
    pushRecipients("zakat_mal", overallCalculations.zakatMal.beneficiaries, false);
    pushRecipients("fidyah_cash", overallCalculations.fidyahCash.amil, true);
    pushRecipients("fidyah_cash", overallCalculations.fidyahCash.beneficiaries, false);
    pushRecipients("fidyah_food", overallCalculations.fidyahFood.amil, true);
    pushRecipients("fidyah_food", overallCalculations.fidyahFood.beneficiaries, false);

    return buildPackagingSummary(overallItems, mustahikMetaMap);
  }, [mustahikMetaMap, overallCalculations]);

  const parsedPackagingAmilCount = clampRecipientCount(Number(packagingAmilCountInput || 0));
  const parsedPackagingNonAmilCount = clampRecipientCount(Number(packagingNonAmilCountInput || 0));

  const hasPackagingCountOverride =
    selectedPeriod?.packaging_amil_count_override !== null ||
    selectedPeriod?.packaging_non_amil_count_override !== null;

  const isPackagingCountChanged =
    parsedPackagingAmilCount !== (selectedPeriod?.packaging_amil_count_override ?? defaultPackagingAmilCount) ||
    parsedPackagingNonAmilCount !== (selectedPeriod?.packaging_non_amil_count_override ?? defaultPackagingNonAmilCount);

  const overallPackagingTotals = useMemo(
    () => ({
      totalCash: Number(periodSummary?.total_combined_cash || 0),
      zakatFitrahCash: Number(periodSummary?.zakat_fitrah_cash || 0),
      zakatMalCash: Number(periodSummary?.zakat_mal || 0),
      fidyahCash: Number(periodSummary?.fidyah_cash || 0),
      totalRiceKg: Number(periodSummary?.zakat_fitrah_rice_kg || 0),
      totalFoodKg: Number(periodSummary?.fidyah_food_kg || 0),
    }),
    [periodSummary],
  );

  const overallPackagingSummary = useMemo(
    () =>
      applyPackagingRecipientCountOverrides(baseOverallPackagingSummary, {
        amilCount: parsedPackagingAmilCount,
        nonAmilCount: parsedPackagingNonAmilCount,
      }, {
        totals: overallPackagingTotals,
        amilDistributionMode,
        amilShareFactor,
        amilPercentage,
      }),
    [
      baseOverallPackagingSummary,
      parsedPackagingAmilCount,
      parsedPackagingNonAmilCount,
      overallPackagingTotals,
      amilDistributionMode,
      amilShareFactor,
      amilPercentage,
    ],
  );

  const saveDistributionConfigMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPeriod?.id) throw new Error("Periode belum dipilih");

      const { error } = await supabase
        .from("periods")
        .update({
          amil_distribution_mode: amilDistributionMode,
          amil_share_factor: amilShareFactor,
        })
        .eq("id", selectedPeriod.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      toast({ title: "Konfigurasi perhitungan berhasil disimpan" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal menyimpan konfigurasi", description: error.message });
    },
  });

  const savePackagingCountMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPeriod?.id) throw new Error("Periode belum dipilih");

      const packagingAmilValue =
        parsedPackagingAmilCount === defaultPackagingAmilCount ? null : parsedPackagingAmilCount;
      const packagingNonAmilValue =
        parsedPackagingNonAmilCount === defaultPackagingNonAmilCount ? null : parsedPackagingNonAmilCount;

      const { error } = await supabase
        .from("periods")
        .update({
          packaging_amil_count_override: packagingAmilValue,
          packaging_non_amil_count_override: packagingNonAmilValue,
        })
        .eq("id", selectedPeriod.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      toast({ title: "Jumlah pembungkusan berhasil disimpan" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal menyimpan jumlah pembungkusan", description: error.message });
    },
  });

  const lockCalculationBatchMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPeriod?.id) throw new Error("Periode belum dipilih");

      type BatchItemDraft = Omit<TablesInsert<"distribution_calculation_batch_items">, "batch_id">;

      const toBatchItems = (): BatchItemDraft[] => {
        const batchItems: BatchItemDraft[] = [];

        const pushCategoryItems = (
          category: FundCategory,
          recipients: typeof calculations.zakatFitrahCash.amil,
          isAmil: boolean,
        ) => {
          recipients.forEach((recipient) => {
            const cashAmount = Math.max(0, Number(recipient.cashAmount || 0));
            const riceAmount = Math.max(0, Number(recipient.riceAmount || 0));
            const foodAmount = Math.max(0, Number(recipient.foodAmount || 0));

            if (cashAmount <= 0 && riceAmount <= 0 && foodAmount <= 0) return;

            batchItems.push({
              period_id: selectedPeriod.id,
              mustahik_id: recipient.mustahikId,
              fund_category: category,
              is_amil: isAmil,
              asnaf_code: recipient.asnaf,
              priority: recipient.priority as Enums<"priority_level">,
              cash_amount: cashAmount,
              rice_amount_kg: riceAmount,
              food_amount_kg: foodAmount,
            });
          });
        };

        const categoryMap: Array<{
          category: FundCategory;
          distribution: typeof calculations.zakatFitrahCash;
        }> = [
          { category: "zakat_fitrah_cash", distribution: calculations.zakatFitrahCash },
          { category: "zakat_fitrah_rice", distribution: calculations.zakatFitrahRice },
          { category: "zakat_mal", distribution: calculations.zakatMal },
          { category: "fidyah_cash", distribution: calculations.fidyahCash },
          { category: "fidyah_food", distribution: calculations.fidyahFood },
        ];

        categoryMap.forEach(({ category, distribution }) => {
          pushCategoryItems(category, distribution.amil, true);
          pushCategoryItems(category, distribution.beneficiaries, false);
        });

        return batchItems;
      };

      const items = toBatchItems();
      if (items.length === 0) {
        throw new Error("Tidak ada alokasi yang bisa dikunci. Pastikan dana tersedia dan mustahik layak ada.");
      }

      const totalAllocatedCash = items.reduce((sum, item) => sum + Number(item.cash_amount || 0), 0);
      const totalAllocatedRice = items.reduce((sum, item) => sum + Number(item.rice_amount_kg || 0), 0);
      const totalAllocatedFood = items.reduce((sum, item) => sum + Number(item.food_amount_kg || 0), 0);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: batch, error: batchError } = await supabase
        .from("distribution_calculation_batches")
        .insert({
          period_id: selectedPeriod.id,
          locked_by: user?.id || null,
          amil_distribution_mode: amilDistributionMode,
          amil_share_factor: amilShareFactor,
          status: "locked",
          notes: batchNotes.trim() || null,
          total_allocated_cash: totalAllocatedCash,
          total_allocated_rice_kg: totalAllocatedRice,
          total_allocated_food_kg: totalAllocatedFood,
        })
        .select("id, batch_code, batch_no")
        .single();

      if (batchError) throw batchError;

      const payload = items.map((item) => ({ ...item, batch_id: batch.id }));
      const { error: itemsError } = await supabase.from("distribution_calculation_batch_items").insert(payload);
      if (itemsError) throw itemsError;

      const lockCommonQuery = (table: "zakat_fitrah_transactions" | "zakat_mal_transactions" | "fidyah_transactions") =>
        supabase
          .from(table)
          .update({ locked_batch_id: batch.id })
          .eq("period_id", selectedPeriod.id)
          .eq("is_void", false)
          .is("locked_batch_id", null);

      const [{ error: lockFitrahError }, { error: lockMalError }, { error: lockFidyahError }] = await Promise.all([
        lockCommonQuery("zakat_fitrah_transactions"),
        lockCommonQuery("zakat_mal_transactions"),
        lockCommonQuery("fidyah_transactions"),
      ]);

      if (lockFitrahError) throw lockFitrahError;
      if (lockMalError) throw lockMalError;
      if (lockFidyahError) throw lockFidyahError;

      return batch;
    },
    onSuccess: (batch) => {
      setBatchNotes("");
      queryClient.invalidateQueries({ queryKey: ["distribution-calculation-batches"] });
      queryClient.invalidateQueries({ queryKey: ["distribution-batch-items-for-lock-balance"] });
      queryClient.invalidateQueries({ queryKey: ["zakat-fitrah-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["zakat-mal-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["fidyah-transactions"] });
      toast({ title: `Batch ${batch.batch_code || `#${batch.batch_no}`} berhasil dikunci` });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal mengunci batch", description: error.message });
    },
  });

  return (
    <AppLayout title="Perhitungan Zakat & Fidyah">
      {isReadOnly && <ReadOnlyBanner periodName={selectedPeriod?.name} />}

      <div className="space-y-5">
        <Card className="overflow-hidden border-none bg-gradient-to-br from-emerald-500 via-cyan-500 to-sky-500 text-white shadow-xl">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold tracking-wide">
                  <Sparkles className="h-3.5 w-3.5" />
                  SNAPSHOT + LOCK BATCH
                </div>
                <h2 className="text-2xl font-semibold md:text-3xl">Kunci hasil perhitungan tanpa menunggu penerimaan selesai</h2>
                <p className="max-w-2xl text-sm text-white/90 md:text-base">
                  Dana baru setelah batch dikunci akan otomatis masuk ke batch berikutnya. Panitia bisa langsung menyalurkan batch yang sudah dikunci.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge variant="secondary" className="bg-white/25 text-white hover:bg-white/25">
                    Periode: {selectedPeriod?.name || "-"}
                  </Badge>
                  <Badge variant="secondary" className="bg-white/25 text-white hover:bg-white/25">
                    Mode: {amilDistributionMode === "percentage" ? "Persentase Tetap" : "Rasio x Faktor"}
                  </Badge>
                </div>
              </div>
              <Button asChild variant="secondary" className="w-full bg-white text-sky-700 hover:bg-white/90 md:w-auto">
                <Link href="/distribution">
                  Buka Pendistribusian
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Konfigurasi Porsi Amil per Periode</CardTitle>
            <CardDescription>
              Pengaturan ini tersimpan di periode aktif dan dipakai untuk seluruh perhitungan batch.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2 md:col-span-2">
              <p className="text-xs text-muted-foreground">Metode alokasi amil</p>
              <Select
                value={amilDistributionMode}
                onValueChange={(value) => setAmilDistributionMode(value as AmilDistributionMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">
                    Persentase Tetap Amil ({(calculations.configuration.amilPercentage * 100).toFixed(1)}%)
                  </SelectItem>
                  <SelectItem value="proportional_with_factor">Rasio Jumlah Penerima x Faktor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Faktor amil (0 - 1)</p>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={amilShareFactor}
                disabled={amilDistributionMode !== "proportional_with_factor"}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  if (Number.isNaN(raw)) {
                    setAmilShareFactor(0);
                    return;
                  }
                  setAmilShareFactor(Math.max(0, Math.min(1, raw)));
                }}
              />
            </div>

            <div className="md:col-span-3">
              <Alert className="border-primary/20 bg-primary/5">
                <Info className="h-4 w-4" />
                <AlertTitle>
                  {amilDistributionMode === "percentage"
                    ? "Metode: Persentase Tetap Amil"
                    : "Metode: Rasio Jumlah Penerima x Faktor"}
                </AlertTitle>
                <AlertDescription className="space-y-2 text-xs sm:text-sm">
                  {amilDistributionMode === "percentage" ? (
                    <>
                      <p>
                        Rumus: <span className="font-medium">Porsi Amil = Total Dana x {(amilPercentage * 100).toFixed(1)}%</span>.
                        Sisa dana dialokasikan ke mustahik non-amil.
                      </p>
                      <p>
                        Simulasi: jika total kas <span className="font-medium">{formatCurrency(sampleCash)}</span>, maka amil menerima{" "}
                        <span className="font-medium">{formatCurrency(sampleAmilCash)}</span> dan non-amil menerima{" "}
                        <span className="font-medium">{formatCurrency(sampleBeneficiaryCash)}</span>.
                      </p>
                      <p>
                        Simulasi beras: dari <span className="font-medium">{sampleRiceKg.toFixed(0)} kg</span>, porsi amil{" "}
                        <span className="font-medium">{sampleAmilRice.toFixed(2)} kg</span> dan non-amil{" "}
                        <span className="font-medium">{sampleBeneficiaryRice.toFixed(2)} kg</span>.
                      </p>
                      <p>
                        Contoh mudah (amil 10, non-amil 10): karena metode ini tetap {(amilPercentage * 100).toFixed(1)}%,
                        maka dari <span className="font-medium">{formatCurrency(sampleCash)}</span> amil menerima{" "}
                        <span className="font-medium">{formatCurrency(demoPercentageCash)}</span> (≈{" "}
                        {formatCurrency(Math.floor(demoPercentageCash / demoAmilCount))}/amil) dan dari{" "}
                        <span className="font-medium">{sampleRiceKg} kg</span> amil menerima{" "}
                        <span className="font-medium">{demoPercentageRice.toFixed(2)} kg</span>.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        Rumus dasar: <span className="font-medium">Rasio Amil = Jumlah Amil / (Jumlah Amil + Jumlah Non-Amil)</span>.
                        Porsi akhir amil = Total Dana x Rasio Amil x Faktor.
                      </p>
                      <p>
                        Kondisi saat ini: {amilCount} amil, {beneficiaryCount} non-amil, rasio amil{" "}
                        <span className="font-medium">{(baseAmilRatio * 100).toFixed(2)}%</span>, faktor{" "}
                        <span className="font-medium">{amilShareFactor.toFixed(2)}</span>, sehingga porsi amil efektif{" "}
                        <span className="font-medium">{(effectiveAmilShare * 100).toFixed(2)}%</span>.
                      </p>
                      <p>
                        Simulasi: jika total kas <span className="font-medium">{formatCurrency(sampleCash)}</span>, amil menerima{" "}
                        <span className="font-medium">{formatCurrency(sampleAmilCash)}</span> dan non-amil menerima{" "}
                        <span className="font-medium">{formatCurrency(sampleBeneficiaryCash)}</span>.
                      </p>
                      <p>
                        Simulasi beras: dari <span className="font-medium">{sampleRiceKg.toFixed(0)} kg</span>, porsi amil{" "}
                        <span className="font-medium">{sampleAmilRice.toFixed(2)} kg</span> dan non-amil{" "}
                        <span className="font-medium">{sampleBeneficiaryRice.toFixed(2)} kg</span>.
                      </p>
                      <p>
                        Contoh mudah (amil 10, non-amil 10): rasio amil = 10/(10+10) = 50%. Dengan faktor{" "}
                        <span className="font-medium">{amilShareFactor.toFixed(2)}</span>, porsi amil jadi{" "}
                        <span className="font-medium">{(demoProportionalShare * 100).toFixed(2)}%</span>.
                        Dari <span className="font-medium">{formatCurrency(sampleCash)}</span> amil menerima{" "}
                        <span className="font-medium">{formatCurrency(demoProportionalCash)}</span> (≈{" "}
                        {formatCurrency(Math.floor(demoProportionalCash / demoAmilCount))}/amil) dan dari{" "}
                        <span className="font-medium">{sampleRiceKg} kg</span> amil menerima{" "}
                        <span className="font-medium">{demoProportionalRice.toFixed(2)} kg</span>.
                      </p>
                    </>
                  )}
                  <p>
                    Perkiraan per amil: sekitar <span className="font-medium">{formatCurrency(sampleCashPerAmil)}</span> kas dan{" "}
                    <span className="font-medium">{sampleRicePerAmil.toFixed(2)} kg</span> beras per orang amil (simulasi, sebelum pembulatan akhir).
                  </p>
                  <p className="text-muted-foreground">
                    Catatan: Fidyah (uang/makanan) pada sistem ini tidak dialokasikan untuk amil, seluruhnya dibagikan ke mustahik yang berhak.
                  </p>
                </AlertDescription>
              </Alert>
            </div>

            <div className="md:col-span-3 flex justify-end">
              <Button
                onClick={() => saveDistributionConfigMutation.mutate()}
                disabled={!selectedPeriod?.id || isReadOnly || !isConfigChanged || saveDistributionConfigMutation.isPending}
              >
                Simpan Konfigurasi Periode
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4" />
              Kunci Batch Perhitungan Saat Ini
            </CardTitle>
            <CardDescription>
              Snapshot ini akan disimpan permanen. Dana yang sudah terkunci tidak akan ikut perhitungan batch berikutnya.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Tersedia Kas untuk Batch Baru</p>
                <p className="text-lg font-semibold">{formatCurrency(totalAvailableCash)}</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Tersedia Beras untuk Batch Baru</p>
                <p className="text-lg font-semibold">{totalAvailableRice.toFixed(2)} kg</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Tersedia Fidyah Makanan untuk Batch Baru</p>
                <p className="text-lg font-semibold">{totalAvailableFood.toFixed(2)} kg</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Catatan batch (opsional)</p>
              <Textarea
                placeholder="Contoh: Batch penyaluran pekan 2 Ramadhan"
                value={batchNotes}
                onChange={(e) => setBatchNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => lockCalculationBatchMutation.mutate()}
                disabled={!selectedPeriod?.id || isReadOnly || lockCalculationBatchMutation.isPending}
              >
                {lockCalculationBatchMutation.isPending ? "Mengunci..." : "Kunci Batch Perhitungan"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {(overallPackagingSummary.recipients.length > 0 || overallPackagingTotals.totalCash > 0 || overallPackagingTotals.totalRiceKg > 0 || overallPackagingTotals.totalFoodKg > 0) && (
          <Card className="border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 via-background to-sky-50/40">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle className="text-base">Ringkasan Pembungkusan Total Keseluruhan</CardTitle>
                  <CardDescription>
                    Menghitung seluruh penerimaan periode aktif. Cocok dipakai saat pembagian dilakukan tanpa batch lock.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="w-fit rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                  Total periode aktif
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <div className="rounded-2xl border border-border/70 bg-background/90 p-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Total Uang</p>
                  <p className="mt-1 text-base font-semibold">{formatCurrency(overallPackagingTotals.totalCash)}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/90 p-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">ZF Uang</p>
                  <p className="mt-1 text-base font-semibold">{formatCurrency(overallPackagingTotals.zakatFitrahCash)}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/90 p-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Zakat Mal</p>
                  <p className="mt-1 text-base font-semibold">{formatCurrency(overallPackagingTotals.zakatMalCash)}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/90 p-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Fidyah Uang</p>
                  <p className="mt-1 text-base font-semibold">{formatCurrency(overallPackagingTotals.fidyahCash)}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/90 p-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Beras Zakat</p>
                  <p className="mt-1 text-base font-semibold">{overallPackagingTotals.totalRiceKg.toFixed(2)} kg</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/90 p-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Makanan Fidyah</p>
                  <p className="mt-1 text-base font-semibold">{overallPackagingTotals.totalFoodKg.toFixed(2)} kg</p>
                </div>
              </div>

              <div className="rounded-3xl border border-border/70 bg-background/90 p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Jumlah Paket Pembungkusan</p>
                    <p className="text-xs text-muted-foreground">
                      Default mengambil data mustahik aktif. Ubah jumlah amil dan non-amil bila pembagian lapangan
                      perlu dihitung lebih cepat tanpa menginput semua mustahik terlebih dahulu.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {hasPackagingCountOverride && (
                      <Badge variant="outline" className="rounded-full border-amber-300 bg-amber-50 px-3 py-1 text-amber-700">
                        Override tersimpan
                      </Badge>
                    )}
                    <Badge variant="outline" className="rounded-full border-border/70 bg-muted/40 px-3 py-1 text-muted-foreground">
                      Default: {defaultPackagingAmilCount} amil • {defaultPackagingNonAmilCount} non-amil
                    </Badge>
                  </div>
                </div>

                {amilDistributionMode === "proportional_with_factor" && (
                  <div className="mt-4 rounded-2xl border border-cyan-200/70 bg-cyan-50/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-800">
                      Formula Rasio x Faktor
                    </p>
                    <p className="mt-1 text-xs leading-6 text-cyan-900/85">
                      Total <span className="font-medium">zakat fitrah + zakat mal</span> dibagi dulu ke total paket
                      <span className="font-medium"> amil + non-amil</span> untuk dapat nilai dasar per penerima. Nilai
                      dasar per amil itu lalu dikalikan faktor{" "}
                      <span className="font-medium">{amilShareFactor.toFixed(2)}</span>. Jadi bila faktor 0,50 maka amil
                      menerima <span className="font-medium">setengah dari nilai dasar per penerima</span>.
                    </p>
                    <p className="mt-2 text-xs leading-6 text-cyan-900/85">
                      Selisih potongan jatah amil otomatis kembali ke kelompok non-amil. Setelah itu seluruh{" "}
                      <span className="font-medium">fidyah uang</span> dan{" "}
                      <span className="font-medium">fidyah makanan</span> ditambahkan penuh ke non-amil dan dibagi ke
                      jumlah non-amil yang kamu set.
                    </p>
                  </div>
                )}

                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,220px)_minmax(0,220px)_1fr]">
                  <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700">Jumlah Amil</p>
                    <Input
                      min={0}
                      type="number"
                      inputMode="numeric"
                      value={packagingAmilCountInput}
                      disabled={isReadOnly}
                      onChange={(event) => setPackagingAmilCountInput(event.target.value)}
                      className="mt-2 h-11 rounded-xl border-emerald-200/80 bg-white"
                    />
                    <p className="mt-2 text-[11px] text-emerald-700/80">
                      Dipakai untuk hitung rata-rata porsi amil dari zakat fitrah dan zakat mal. Fidyah tidak masuk ke amil.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-sky-200/70 bg-sky-50/60 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-sky-700">Jumlah Non-Amil</p>
                    <Input
                      min={0}
                      type="number"
                      inputMode="numeric"
                      value={packagingNonAmilCountInput}
                      disabled={isReadOnly}
                      onChange={(event) => setPackagingNonAmilCountInput(event.target.value)}
                      className="mt-2 h-11 rounded-xl border-sky-200/80 bg-white"
                    />
                    <p className="mt-2 text-[11px] text-sky-700/80">
                      Dipakai untuk hitung rata-rata paket non-amil dari zakat fitrah, zakat mal, dan seluruh fidyah.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs font-medium text-foreground">Perilaku hitungan</p>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      Sumber dana diambil dari total penerimaan periode aktif. Dalam mode rasio x faktor, sistem
                      membagi dulu nilai dasar per penerima dari zakat fitrah dan zakat mal, lalu mengurangi jatah amil
                      sesuai faktor dan melempar sisa selisihnya ke non-amil. Seluruh fidyah tetap masuk penuh ke
                      non-amil. Yang diubah hanya jumlah orang untuk kebutuhan pembungkusan cepat.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={isReadOnly || !selectedPeriod?.id || !isPackagingCountChanged || savePackagingCountMutation.isPending}
                        onClick={() => savePackagingCountMutation.mutate()}
                      >
                        {savePackagingCountMutation.isPending ? "Menyimpan..." : "Simpan Jumlah"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isReadOnly}
                        onClick={() => {
                          setPackagingAmilCountInput(String(defaultPackagingAmilCount));
                          setPackagingNonAmilCountInput(String(defaultPackagingNonAmilCount));
                        }}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Kembali ke Data Mustahik
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <div className="rounded-3xl border border-emerald-200/70 bg-emerald-50/80 p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-emerald-950">Amil</p>
                      <p className="text-xs text-emerald-800/80">
                        Sumber: porsi amil dari zakat fitrah dan zakat mal. Fidyah tidak dihitung untuk amil.
                      </p>
                    </div>
                    <Badge className="rounded-full bg-emerald-600">{overallPackagingSummary.groupBreakdown.amil.recipientCount} orang</Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-emerald-200/70 bg-white/80 p-3">
                      <p className="text-xs text-muted-foreground">Uang per orang</p>
                      <p className="mt-1 text-lg font-semibold">{formatCurrency(overallPackagingSummary.groupBreakdown.amil.averageCashPerRecipient)}</p>
                      <p className="text-[11px] text-muted-foreground">Total: {formatCurrency(overallPackagingSummary.groupBreakdown.amil.totalCash)}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200/70 bg-white/80 p-3">
                      <p className="text-xs text-muted-foreground">Beras per orang</p>
                      <p className="mt-1 text-lg font-semibold">{overallPackagingSummary.groupBreakdown.amil.averageRicePerRecipient.toFixed(2)} kg</p>
                      <p className="text-[11px] text-muted-foreground">Total: {overallPackagingSummary.groupBreakdown.amil.totalRiceKg.toFixed(2)} kg</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200/70 bg-white/80 p-3">
                      <p className="text-xs text-muted-foreground">Fidyah untuk amil</p>
                      <p className="mt-1 text-lg font-semibold">Tidak dihitung</p>
                      <p className="text-[11px] text-muted-foreground">Amil tidak menerima fidyah.</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200/70 bg-white/80 p-3">
                      <p className="text-xs text-muted-foreground">Detail uang amil</p>
                      <p className="mt-1 text-sm font-semibold leading-6">
                        ZF {formatCurrency(overallPackagingSummary.groupBreakdown.amil.zakatFitrahCash)}
                        <br />
                        ZM {formatCurrency(overallPackagingSummary.groupBreakdown.amil.zakatMalCash)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-sky-200/70 bg-sky-50/80 p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-sky-950">Non-Amil</p>
                      <p className="text-xs text-sky-800/80">
                        Sumber: sisa zakat fitrah, sisa zakat mal, dan seluruh fidyah untuk mustahik non-amil.
                      </p>
                    </div>
                    <Badge variant="outline" className="rounded-full border-sky-300 bg-white/90 px-3 py-1 text-sky-700">
                      {overallPackagingSummary.groupBreakdown.nonAmil.recipientCount} orang
                    </Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-sky-200/70 bg-white/80 p-3">
                      <p className="text-xs text-muted-foreground">Uang per orang</p>
                      <p className="mt-1 text-lg font-semibold">{formatCurrency(overallPackagingSummary.groupBreakdown.nonAmil.averageCashPerRecipient)}</p>
                      <p className="text-[11px] text-muted-foreground">Total: {formatCurrency(overallPackagingSummary.groupBreakdown.nonAmil.totalCash)}</p>
                    </div>
                    <div className="rounded-2xl border border-sky-200/70 bg-white/80 p-3">
                      <p className="text-xs text-muted-foreground">Beras per orang</p>
                      <p className="mt-1 text-lg font-semibold">{overallPackagingSummary.groupBreakdown.nonAmil.averageRicePerRecipient.toFixed(2)} kg</p>
                      <p className="text-[11px] text-muted-foreground">Total: {overallPackagingSummary.groupBreakdown.nonAmil.totalRiceKg.toFixed(2)} kg</p>
                    </div>
                    <div className="rounded-2xl border border-sky-200/70 bg-white/80 p-3">
                      <p className="text-xs text-muted-foreground">Fidyah makanan per orang</p>
                      <p className="mt-1 text-lg font-semibold">{overallPackagingSummary.groupBreakdown.nonAmil.averageFoodPerRecipient.toFixed(2)} kg</p>
                      <p className="text-[11px] text-muted-foreground">Total: {overallPackagingSummary.groupBreakdown.nonAmil.totalFoodKg.toFixed(2)} kg</p>
                    </div>
                    <div className="rounded-2xl border border-sky-200/70 bg-white/80 p-3">
                      <p className="text-xs text-muted-foreground">Detail uang non-amil</p>
                      <p className="mt-1 text-sm font-semibold leading-6">
                        ZF {formatCurrency(overallPackagingSummary.groupBreakdown.nonAmil.zakatFitrahCash)}
                        <br />
                        ZM {formatCurrency(overallPackagingSummary.groupBreakdown.nonAmil.zakatMalCash)}
                        <br />
                        FD {formatCurrency(overallPackagingSummary.groupBreakdown.nonAmil.fidyahCash)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-background/85 p-3 md:flex-row md:items-center md:justify-between">
                <p className="text-xs text-muted-foreground">
                  Ringkasan ini mengambil seluruh penerimaan periode aktif, termasuk zakat mal, lalu menghitung estimasi pembungkusan cepat tanpa bergantung pada batch.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPackagingDetailTab("asnaf");
                      setIsPackagingDetailOpen(true);
                    }}
                  >
                    Detail Total per Golongan
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPackagingDetailTab("mustahik");
                      setIsPackagingDetailOpen(true);
                    }}
                  >
                    Detail Total per Mustahik
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <section className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold">Ringkasan Dana untuk Batch Berikutnya</h3>
            <p className="text-sm text-muted-foreground">
              Sumber = dana masuk kumulatif, dikurangi semua dana yang sudah pernah dikunci batch.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {categorySummaries.map((item) => {
              const Icon = item.meta.icon;
              return (
                <Card key={item.category} className="border-border/70">
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${item.meta.accent}`} />
                      {item.meta.label}
                    </CardDescription>
                    <CardTitle className="text-base">{toDisplayAmount(item.meta.unit, item.availableValue)}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Dana masuk</span>
                      <span className="font-medium text-foreground">{toDisplayAmount(item.meta.unit, item.inflowValue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Sudah dikunci</span>
                      <span className="font-medium text-foreground">{toDisplayAmount(item.meta.unit, item.lockedValue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Alokasi batch ini</span>
                      <span className="font-medium text-foreground">{toDisplayAmount(item.meta.unit, item.allocatedValue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Penerima</span>
                      <span className="font-medium text-foreground">{item.totalRecipients}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Riwayat Batch Perhitungan</CardTitle>
            <CardDescription>
              Batch yang sudah dikunci dapat langsung diproses di menu Pendistribusian.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {lockedBatches.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Belum ada batch terkunci pada periode ini.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Tanggal Kunci</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Kas</TableHead>
                    <TableHead className="text-right">Beras</TableHead>
                    <TableHead className="text-right">Makanan</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lockedBatches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">{batch.batch_code || `BATCH-${batch.batch_no}`}</TableCell>
                      <TableCell>
                        {format(new Date(batch.locked_at), "dd MMM yyyy HH:mm", { locale: idLocale })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={batch.status === "distributed" ? "default" : "outline"}>
                          {BATCH_STATUS_LABELS[batch.status] || batch.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(batch.total_allocated_cash || 0)}</TableCell>
                      <TableCell className="text-right">{(batch.total_allocated_rice_kg || 0).toFixed(2)} kg</TableCell>
                      <TableCell className="text-right">{(batch.total_allocated_food_kg || 0).toFixed(2)} kg</TableCell>
                      <TableCell className="text-muted-foreground">{batch.notes || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={isPackagingDetailOpen} onOpenChange={setIsPackagingDetailOpen}>
          <DialogContent className="max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:max-h-[92dvh] max-w-6xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detail Pembungkusan Total Keseluruhan</DialogTitle>
            </DialogHeader>

            {overallPackagingSummary.recipients.length > 0 || overallPackagingTotals.totalCash > 0 || overallPackagingTotals.totalRiceKg > 0 || overallPackagingTotals.totalFoodKg > 0 ? (
              <div className="space-y-4">
                <div className="grid gap-2 md:grid-cols-6">
                  <div className="rounded-md border bg-muted/20 p-2">
                    <p className="text-[11px] text-muted-foreground">Total Uang</p>
                    <p className="text-sm font-semibold">{formatCurrency(overallPackagingTotals.totalCash)}</p>
                  </div>
                  <div className="rounded-md border bg-muted/20 p-2">
                    <p className="text-[11px] text-muted-foreground">Uang Zakat Fitrah</p>
                    <p className="text-sm font-semibold">{formatCurrency(overallPackagingTotals.zakatFitrahCash)}</p>
                  </div>
                  <div className="rounded-md border bg-muted/20 p-2">
                    <p className="text-[11px] text-muted-foreground">Uang Zakat Mal</p>
                    <p className="text-sm font-semibold">{formatCurrency(overallPackagingTotals.zakatMalCash)}</p>
                  </div>
                  <div className="rounded-md border bg-muted/20 p-2">
                    <p className="text-[11px] text-muted-foreground">Uang Fidyah</p>
                    <p className="text-sm font-semibold">{formatCurrency(overallPackagingTotals.fidyahCash)}</p>
                  </div>
                  <div className="rounded-md border bg-muted/20 p-2">
                    <p className="text-[11px] text-muted-foreground">Beras Zakat</p>
                    <p className="text-sm font-semibold">{overallPackagingTotals.totalRiceKg.toFixed(2)} kg</p>
                  </div>
                  <div className="rounded-md border bg-muted/20 p-2">
                    <p className="text-[11px] text-muted-foreground">Makanan Fidyah</p>
                    <p className="text-sm font-semibold">{overallPackagingTotals.totalFoodKg.toFixed(2)} kg</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">Kelompok Amil</p>
                      <Badge>{overallPackagingSummary.groupBreakdown.amil.recipientCount} orang</Badge>
                    </div>
                    <div className="grid gap-2 text-xs sm:grid-cols-2 sm:text-sm">
                      <div className="rounded-md border bg-background/80 p-2">
                        <p className="text-muted-foreground">Total Uang</p>
                        <p className="font-semibold">{formatCurrency(overallPackagingSummary.groupBreakdown.amil.totalCash)}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Rata-rata: {formatCurrency(overallPackagingSummary.groupBreakdown.amil.averageCashPerRecipient)}/orang
                        </p>
                      </div>
                      <div className="rounded-md border bg-background/80 p-2">
                        <p className="text-muted-foreground">Total Beras</p>
                        <p className="font-semibold">{overallPackagingSummary.groupBreakdown.amil.totalRiceKg.toFixed(2)} kg</p>
                        <p className="text-[11px] text-muted-foreground">
                          Rata-rata: {overallPackagingSummary.groupBreakdown.amil.averageRicePerRecipient.toFixed(2)} kg/orang
                        </p>
                      </div>
                      <div className="rounded-md border bg-background/80 p-2 sm:col-span-2">
                        <p className="text-muted-foreground">Sumber untuk Amil</p>
                        <p className="font-medium">
                          ZF {formatCurrency(overallPackagingSummary.groupBreakdown.amil.zakatFitrahCash)} | ZM{" "}
                          {formatCurrency(overallPackagingSummary.groupBreakdown.amil.zakatMalCash)}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Fidyah tidak masuk ke kelompok amil.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">Kelompok Non-Amil</p>
                      <Badge variant="outline">{overallPackagingSummary.groupBreakdown.nonAmil.recipientCount} orang</Badge>
                    </div>
                    <div className="grid gap-2 text-xs sm:grid-cols-2 sm:text-sm">
                      <div className="rounded-md border bg-background/80 p-2">
                        <p className="text-muted-foreground">Total Uang</p>
                        <p className="font-semibold">{formatCurrency(overallPackagingSummary.groupBreakdown.nonAmil.totalCash)}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Rata-rata: {formatCurrency(overallPackagingSummary.groupBreakdown.nonAmil.averageCashPerRecipient)}/orang
                        </p>
                      </div>
                      <div className="rounded-md border bg-background/80 p-2">
                        <p className="text-muted-foreground">Total Beras</p>
                        <p className="font-semibold">{overallPackagingSummary.groupBreakdown.nonAmil.totalRiceKg.toFixed(2)} kg</p>
                        <p className="text-[11px] text-muted-foreground">
                          Rata-rata: {overallPackagingSummary.groupBreakdown.nonAmil.averageRicePerRecipient.toFixed(2)} kg/orang
                        </p>
                      </div>
                      <div className="rounded-md border bg-background/80 p-2 sm:col-span-2">
                        <p className="text-muted-foreground">Sumber untuk Non-Amil</p>
                        <p className="font-medium">
                          ZF {formatCurrency(overallPackagingSummary.groupBreakdown.nonAmil.zakatFitrahCash)} | ZM{" "}
                          {formatCurrency(overallPackagingSummary.groupBreakdown.nonAmil.zakatMalCash)} | FD{" "}
                          {formatCurrency(overallPackagingSummary.groupBreakdown.nonAmil.fidyahCash)}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Non-amil menerima sisa zakat fitrah, sisa zakat mal, dan seluruh fidyah.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Catatan: nilai <span className="font-medium">rata-rata/orang</span> dipakai untuk mempermudah pembungkusan cepat.
                  Detail nominal tiap penerima tetap lihat tab <span className="font-medium">Per Mustahik</span>.
                </p>

                <Tabs value={packagingDetailTab} onValueChange={(v) => setPackagingDetailTab(v as "asnaf" | "mustahik")}>
                  <TabsList>
                    <TabsTrigger value="asnaf">Per Golongan</TabsTrigger>
                    <TabsTrigger value="mustahik">Per Mustahik</TabsTrigger>
                  </TabsList>

                  <TabsContent value="asnaf" className="mt-3">
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Golongan</TableHead>
                            <TableHead className="text-right">Mustahik</TableHead>
                            <TableHead className="text-right">Total Uang</TableHead>
                            <TableHead className="text-right">Beras</TableHead>
                            <TableHead className="text-right">Makanan</TableHead>
                            <TableHead className="text-right">Detail Uang</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {overallPackagingSummary.asnafGroups.map((group) => (
                            <TableRow key={group.asnafCode}>
                              <TableCell>
                                <Badge variant={group.asnafCode === "amil" ? "default" : "outline"}>{getLabel(group.asnafCode)}</Badge>
                              </TableCell>
                              <TableCell className="text-right">{group.recipientCount}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(group.totalCash)}</TableCell>
                              <TableCell className="text-right">{group.totalRiceKg.toFixed(2)} kg</TableCell>
                              <TableCell className="text-right">{group.totalFoodKg.toFixed(2)} kg</TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">
                                ZF {formatCurrency(group.zakatFitrahCash)} | ZM {formatCurrency(group.zakatMalCash)} | FD{" "}
                                {formatCurrency(group.fidyahCash)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="mustahik" className="mt-3">
                    <div className="max-h-[58vh] overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nama</TableHead>
                            <TableHead>Golongan</TableHead>
                            <TableHead className="text-right">Total Uang</TableHead>
                            <TableHead className="text-right">Beras</TableHead>
                            <TableHead className="text-right">Makanan</TableHead>
                            <TableHead className="text-right">Detail Uang</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {overallPackagingSummary.recipients.map((recipient) => (
                            <TableRow key={recipient.mustahikId}>
                              <TableCell className="font-medium">{recipient.name}</TableCell>
                              <TableCell>
                                <Badge variant={recipient.asnafCode === "amil" ? "default" : "outline"}>{getLabel(recipient.asnafCode)}</Badge>
                              </TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(recipient.totalCash)}</TableCell>
                              <TableCell className="text-right">{recipient.totalRiceKg.toFixed(2)} kg</TableCell>
                              <TableCell className="text-right">{recipient.totalFoodKg.toFixed(2)} kg</TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">
                                ZF {formatCurrency(recipient.zakatFitrahCash)} | ZM {formatCurrency(recipient.zakatMalCash)} | FD{" "}
                                {formatCurrency(recipient.fidyahCash)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data pembungkusan total untuk periode ini.</p>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

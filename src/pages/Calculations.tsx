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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
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
import { Coins, Wheat, Utensils, Scale, ArrowRight, Lock, Info, RotateCcw } from "lucide-react";
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

const StatTile = ({
  label,
  value,
  hint,
  className = "",
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) => (
  <div className={`rounded-xl border border-border/60 bg-background/70 p-3 ${className}`}>
    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="mt-1 text-lg font-semibold tabular-nums leading-tight">{value}</p>
    {hint && <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{hint}</p>}
  </div>
);

const PackagingGroupCard = ({
  title,
  caption,
  tone,
  group,
  showFood,
  sources,
}: {
  title: string;
  caption: string;
  tone: "amil" | "nonAmil";
  group: PackagingGroupSummary;
  showFood: boolean;
  sources: { label: string; value: string }[];
}) => {
  const palette =
    tone === "amil"
      ? { card: "border-emerald-200/70 bg-emerald-50/40", badge: "bg-emerald-600 text-white", text: "text-emerald-700" }
      : { card: "border-sky-200/70 bg-sky-50/40", badge: "bg-sky-600 text-white", text: "text-sky-700" };

  return (
    <div className={`rounded-2xl border p-4 ${palette.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${palette.badge}`}>
          {group.recipientCount} orang
        </span>
      </div>

      <div className={`mt-3 grid gap-2 ${showFood ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <StatTile
          label="Uang / orang"
          value={formatCurrency(group.averageCashPerRecipient)}
          hint={`Total ${formatCurrency(group.totalCash)}`}
        />
        <StatTile
          label="Beras / orang"
          value={`${group.averageRicePerRecipient.toFixed(2)} kg`}
          hint={`Total ${group.totalRiceKg.toFixed(2)} kg`}
        />
        {showFood && (
          <StatTile
            label="Makanan / orang"
            value={`${group.averageFoodPerRecipient.toFixed(2)} kg`}
            hint={`Total ${group.totalFoodKg.toFixed(2)} kg`}
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className={`font-medium ${palette.text}`}>Sumber uang</span>
        {sources.map((source) => (
          <span key={source.label} className="tabular-nums">
            {source.label} {source.value}
          </span>
        ))}
      </div>
    </div>
  );
};

export default function Calculations() {
  const { selectedPeriod, isReadOnly } = usePeriod();
  const { getLabel } = useAsnafSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [amilDistributionMode, setAmilDistributionMode] = useState<AmilDistributionMode>("percentage");
  const [amilShareFactor, setAmilShareFactor] = useState(0.5);
  const [batchNotes, setBatchNotes] = useState("");
  const [activeTab, setActiveTab] = useState<"paket" | "batch" | "riwayat">("paket");
  const [isFormulaOpen, setIsFormulaOpen] = useState(false);
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

  // Nilai yang benar-benar akan tersimpan saat batch dikunci (hasil alokasi, bukan sekadar saldo tersedia).
  const allocationTotals = useMemo(
    () =>
      categorySummaries.reduce(
        (acc, item) => {
          if (item.meta.unit === "cash") acc.cash += item.allocatedValue;
          else if (item.meta.unit === "rice") acc.rice += item.allocatedValue;
          else acc.food += item.allocatedValue;
          return acc;
        },
        { cash: 0, rice: 0, food: 0 },
      ),
    [categorySummaries],
  );

  const availableTotals = useMemo(
    () =>
      availableForNextBatch.reduce(
        (acc, item) => {
          acc.cash += Number(item.total_cash || 0);
          acc.rice += Number(item.total_rice_kg || 0);
          acc.food += Number(item.total_food_kg || 0);
          return acc;
        },
        { cash: 0, rice: 0, food: 0 },
      ),
    [availableForNextBatch],
  );

  const hasAllocationToLock = allocationTotals.cash + allocationTotals.rice + allocationTotals.food > 0;
  const unallocatedCategories = categorySummaries.filter((item) => item.availableValue - item.allocatedValue > 0.005);

  const amilCount = calculations.amilList.length;
  const beneficiaryCount = calculations.beneficiaryList.length;
  const totalRecipients = amilCount + beneficiaryCount;
  const amilPercentage = calculations.configuration.amilPercentage;
  const baseAmilRatio = totalRecipients > 0 ? amilCount / totalRecipients : 0;
  const rawAmilShare = amilDistributionMode === "percentage" ? amilPercentage : baseAmilRatio * amilShareFactor;
  // Sama seperti mesin hitung: tanpa amil porsinya 0, tanpa non-amil seluruhnya ke amil, selain itu dibatasi 50%.
  const effectiveAmilShare =
    amilCount === 0 ? 0 : beneficiaryCount === 0 ? 1 : Math.min(0.5, rawAmilShare);

  const SIM_CASH = 1_000_000;
  const SIM_RICE = 100;
  const simAmilCash = Math.round(SIM_CASH * effectiveAmilShare);
  const simNonAmilCash = SIM_CASH - simAmilCash;
  const simAmilRice = Number((SIM_RICE * effectiveAmilShare).toFixed(2));
  const simNonAmilRice = Number((SIM_RICE - simAmilRice).toFixed(2));
  const simCashPerAmil = amilCount > 0 ? Math.floor(simAmilCash / amilCount) : 0;
  const simRicePerAmil = amilCount > 0 ? Number((simAmilRice / amilCount).toFixed(2)) : 0;

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

  const hasPeriodFunds =
    overallPackagingSummary.recipients.length > 0 ||
    overallPackagingTotals.totalCash > 0 ||
    overallPackagingTotals.totalRiceKg > 0 ||
    overallPackagingTotals.totalFoodKg > 0;

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

      <div className="space-y-4">
        {/* Ringkasan dana periode aktif */}
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-[220px]">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Dana masuk · {selectedPeriod?.name || "Periode belum dipilih"}
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
                {formatCurrency(overallPackagingTotals.totalCash)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                ZF {formatCurrency(overallPackagingTotals.zakatFitrahCash)} · ZM{" "}
                {formatCurrency(overallPackagingTotals.zakatMalCash)} · Fidyah{" "}
                {formatCurrency(overallPackagingTotals.fidyahCash)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Beras zakat</p>
                <p className="text-base font-semibold tabular-nums">{overallPackagingTotals.totalRiceKg.toFixed(2)} kg</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Makanan fidyah</p>
                <p className="text-base font-semibold tabular-nums">{overallPackagingTotals.totalFoodKg.toFixed(2)} kg</p>
              </div>
              <Button asChild variant="outline" className="h-[52px] rounded-xl">
                <Link href="/distribution">
                  Pendistribusian
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Konfigurasi porsi amil */}
        <Card className="border-border/70">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_auto] md:items-end">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Metode porsi amil</p>
                <Select
                  value={amilDistributionMode}
                  onValueChange={(value) => setAmilDistributionMode(value as AmilDistributionMode)}
                >
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">
                      Persentase tetap ({(amilPercentage * 100).toFixed(1)}%)
                    </SelectItem>
                    <SelectItem value="proportional_with_factor">Rasio penerima × faktor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Faktor (0 - 1)</p>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  className="h-10 rounded-xl tabular-nums"
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

              <Button
                className="h-10 rounded-xl"
                onClick={() => saveDistributionConfigMutation.mutate()}
                disabled={!selectedPeriod?.id || isReadOnly || !isConfigChanged || saveDistributionConfigMutation.isPending}
              >
                {saveDistributionConfigMutation.isPending ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary" className="rounded-full tabular-nums">
                Porsi amil efektif {(effectiveAmilShare * 100).toFixed(2)}%
              </Badge>
              <Badge variant="outline" className="rounded-full tabular-nums">
                {amilCount} amil · {beneficiaryCount} non-amil
              </Badge>
              {isConfigChanged && (
                <Badge variant="outline" className="rounded-full border-amber-300 bg-amber-50 text-amber-700">
                  Belum disimpan
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-8 gap-1 rounded-full px-3 text-xs"
                onClick={() => setIsFormulaOpen((open) => !open)}
              >
                <Info className="h-3.5 w-3.5" />
                {isFormulaOpen ? "Tutup rumus" : "Lihat rumus"}
              </Button>
            </div>

            <Collapsible open={isFormulaOpen} onOpenChange={setIsFormulaOpen}>
              <CollapsibleContent>
                <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 lg:grid-cols-2">
                  <ul className="space-y-1.5 text-xs leading-6 text-muted-foreground">
                    {amilDistributionMode === "percentage" ? (
                      <li>
                        <span className="font-medium text-foreground">Porsi amil</span> = total dana ×{" "}
                        {(amilPercentage * 100).toFixed(1)}% (dari pengaturan asnaf). Sisanya dibagi ke non-amil
                        berdasarkan bobot prioritas dan jumlah anggota keluarga.
                      </li>
                    ) : (
                      <li>
                        <span className="font-medium text-foreground">Nilai dasar per penerima</span> = total dana ÷
                        (jumlah amil + non-amil). <span className="font-medium text-foreground">Porsi per amil</span> =
                        nilai dasar × faktor {amilShareFactor.toFixed(2)}. Sisa selisihnya kembali ke non-amil dan
                        dibagi rata.
                      </li>
                    )}
                    <li>Porsi amil dibatasi maksimal 50% dari dana kategori terkait.</li>
                    <li>Fidyah uang dan fidyah makanan tidak dialokasikan ke amil.</li>
                  </ul>

                  <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Simulasi per {formatCurrency(SIM_CASH)} dan {SIM_RICE} kg
                    </p>
                    <div className="mt-2 space-y-1.5 text-xs tabular-nums">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Amil</span>
                        <span className="font-medium">
                          {formatCurrency(simAmilCash)} · {simAmilRice.toFixed(2)} kg
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Non-amil</span>
                        <span className="font-medium">
                          {formatCurrency(simNonAmilCash)} · {simNonAmilRice.toFixed(2)} kg
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-1.5">
                        <span className="text-muted-foreground">Per orang amil</span>
                        <span className="font-medium">
                          {formatCurrency(simCashPerAmil)} · {simRicePerAmil.toFixed(2)} kg
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl p-1">
            <TabsTrigger value="paket" className="rounded-lg">
              Paket Pembungkusan
            </TabsTrigger>
            <TabsTrigger value="batch" className="rounded-lg">
              Batch Baru
            </TabsTrigger>
            <TabsTrigger value="riwayat" className="rounded-lg">
              Riwayat ({lockedBatches.length})
            </TabsTrigger>
          </TabsList>

          {/* Tab 1 - Paket pembungkusan total periode */}
          <TabsContent value="paket" className="mt-3">
            {hasPeriodFunds ? (
              <Card className="border-border/70">
                <CardHeader className="gap-3 pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">Paket dari total dana periode</CardTitle>
                      <CardDescription>
                        Estimasi isi paket per orang memakai seluruh penerimaan periode aktif, tanpa menunggu batch.
                      </CardDescription>
                    </div>
                    {hasPackagingCountOverride && (
                      <Badge variant="outline" className="rounded-full border-amber-300 bg-amber-50 text-amber-700">
                        Jumlah manual
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className="w-[110px] space-y-1">
                      <p className="text-[11px] font-medium text-muted-foreground">Jumlah amil</p>
                      <Input
                        min={0}
                        type="number"
                        inputMode="numeric"
                        value={packagingAmilCountInput}
                        disabled={isReadOnly}
                        onChange={(event) => setPackagingAmilCountInput(event.target.value)}
                        className="h-10 rounded-xl bg-background tabular-nums"
                      />
                    </div>
                    <div className="w-[110px] space-y-1">
                      <p className="text-[11px] font-medium text-muted-foreground">Jumlah non-amil</p>
                      <Input
                        min={0}
                        type="number"
                        inputMode="numeric"
                        value={packagingNonAmilCountInput}
                        disabled={isReadOnly}
                        onChange={(event) => setPackagingNonAmilCountInput(event.target.value)}
                        className="h-10 rounded-xl bg-background tabular-nums"
                      />
                    </div>
                    <Button
                      type="button"
                      className="h-10 rounded-xl"
                      disabled={isReadOnly || !selectedPeriod?.id || !isPackagingCountChanged || savePackagingCountMutation.isPending}
                      onClick={() => savePackagingCountMutation.mutate()}
                    >
                      {savePackagingCountMutation.isPending ? "Menyimpan..." : "Simpan jumlah"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10 rounded-xl"
                      disabled={isReadOnly}
                      onClick={() => {
                        setPackagingAmilCountInput(String(defaultPackagingAmilCount));
                        setPackagingNonAmilCountInput(String(defaultPackagingNonAmilCount));
                      }}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      Data mustahik ({defaultPackagingAmilCount}/{defaultPackagingNonAmilCount})
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="grid gap-3 xl:grid-cols-2">
                    <PackagingGroupCard
                      title="Amil"
                      caption="Porsi amil dari zakat fitrah dan zakat mal."
                      tone="amil"
                      group={overallPackagingSummary.groupBreakdown.amil}
                      showFood={false}
                      sources={[
                        { label: "ZF", value: formatCurrency(overallPackagingSummary.groupBreakdown.amil.zakatFitrahCash) },
                        { label: "ZM", value: formatCurrency(overallPackagingSummary.groupBreakdown.amil.zakatMalCash) },
                        { label: "Fidyah", value: "tidak dialokasikan" },
                      ]}
                    />
                    <PackagingGroupCard
                      title="Non-Amil"
                      caption="Sisa zakat fitrah, sisa zakat mal, dan seluruh fidyah."
                      tone="nonAmil"
                      group={overallPackagingSummary.groupBreakdown.nonAmil}
                      showFood
                      sources={[
                        { label: "ZF", value: formatCurrency(overallPackagingSummary.groupBreakdown.nonAmil.zakatFitrahCash) },
                        { label: "ZM", value: formatCurrency(overallPackagingSummary.groupBreakdown.nonAmil.zakatMalCash) },
                        { label: "Fidyah", value: formatCurrency(overallPackagingSummary.groupBreakdown.nonAmil.fidyahCash) },
                      ]}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <p className="text-xs text-muted-foreground">
                      Nilai per orang dibulatkan ke bawah agar dana selalu cukup saat pembungkusan.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => {
                          setPackagingDetailTab("asnaf");
                          setIsPackagingDetailOpen(true);
                        }}
                      >
                        Per golongan
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => {
                          setPackagingDetailTab("mustahik");
                          setIsPackagingDetailOpen(true);
                        }}
                      >
                        Per mustahik
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border/70">
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Belum ada penerimaan pada periode ini.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab 2 - Batch baru */}
          <TabsContent value="batch" className="mt-3 space-y-3">
            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Dana tersedia untuk batch berikutnya</CardTitle>
                <CardDescription>Dana masuk kumulatif dikurangi dana yang sudah dikunci batch sebelumnya.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-xl border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Kategori</TableHead>
                        <TableHead className="text-right">Dana masuk</TableHead>
                        <TableHead className="text-right">Sudah dikunci</TableHead>
                        <TableHead className="text-right">Tersedia</TableHead>
                        <TableHead className="text-right">Teralokasi</TableHead>
                        <TableHead className="text-right">Penerima</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categorySummaries.map((item) => {
                        const Icon = item.meta.icon;
                        return (
                          <TableRow key={item.category}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Icon className={`h-4 w-4 ${item.meta.accent}`} />
                                <span className="font-medium">{item.meta.label}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {toDisplayAmount(item.meta.unit, item.inflowValue)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {toDisplayAmount(item.meta.unit, item.lockedValue)}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {toDisplayAmount(item.meta.unit, item.availableValue)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {toDisplayAmount(item.meta.unit, item.allocatedValue)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {item.totalRecipients > 0 ? item.totalRecipients : "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {unallocatedCategories.length > 0 && (
                  <p className="mt-2 text-xs text-amber-700">
                    Sebagian dana belum teralokasi karena belum ada mustahik yang berhak:{" "}
                    {unallocatedCategories
                      .map(
                        (item) =>
                          `${item.meta.label} ${toDisplayAmount(item.meta.unit, item.availableValue - item.allocatedValue)}`,
                      )
                      .join(", ")}
                    .
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-primary/25">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lock className="h-4 w-4" />
                  Kunci batch perhitungan
                </CardTitle>
                <CardDescription>
                  Snapshot disimpan permanen. Dana yang sudah dikunci tidak ikut lagi pada batch berikutnya.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <StatTile
                    label="Kas dikunci"
                    value={formatCurrency(allocationTotals.cash)}
                    hint={`Tersedia ${formatCurrency(availableTotals.cash)}`}
                  />
                  <StatTile
                    label="Beras dikunci"
                    value={`${allocationTotals.rice.toFixed(2)} kg`}
                    hint={`Tersedia ${availableTotals.rice.toFixed(2)} kg`}
                  />
                  <StatTile
                    label="Makanan dikunci"
                    value={`${allocationTotals.food.toFixed(2)} kg`}
                    hint={`Tersedia ${availableTotals.food.toFixed(2)} kg`}
                  />
                </div>

                <Textarea
                  placeholder="Catatan batch (opsional). Contoh: Batch penyaluran pekan 2 Ramadhan"
                  value={batchNotes}
                  onChange={(e) => setBatchNotes(e.target.value)}
                  className="min-h-[72px] rounded-xl"
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {hasAllocationToLock
                      ? `${categorySummaries.reduce((sum, item) => sum + item.totalRecipients, 0)} baris alokasi siap dikunci.`
                      : "Belum ada alokasi yang bisa dikunci."}
                  </p>
                  <Button
                    className="rounded-xl"
                    onClick={() => lockCalculationBatchMutation.mutate()}
                    disabled={
                      !selectedPeriod?.id || isReadOnly || !hasAllocationToLock || lockCalculationBatchMutation.isPending
                    }
                  >
                    {lockCalculationBatchMutation.isPending ? "Mengunci..." : "Kunci batch"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 3 - Riwayat batch */}
          <TabsContent value="riwayat" className="mt-3">
            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Riwayat batch perhitungan</CardTitle>
                <CardDescription>Batch terkunci dapat langsung diproses di menu Pendistribusian.</CardDescription>
              </CardHeader>
              <CardContent>
                {lockedBatches.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Belum ada batch terkunci pada periode ini.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead>Batch</TableHead>
                          <TableHead>Tanggal kunci</TableHead>
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
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {format(new Date(batch.locked_at), "dd MMM yyyy HH:mm", { locale: idLocale })}
                            </TableCell>
                            <TableCell>
                              <Badge variant={batch.status === "distributed" ? "default" : "outline"} className="rounded-full">
                                {BATCH_STATUS_LABELS[batch.status] || batch.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrency(batch.total_allocated_cash || 0)}</TableCell>
                            <TableCell className="text-right tabular-nums">{(batch.total_allocated_rice_kg || 0).toFixed(2)} kg</TableCell>
                            <TableCell className="text-right tabular-nums">{(batch.total_allocated_food_kg || 0).toFixed(2)} kg</TableCell>
                            <TableCell className="text-muted-foreground">{batch.notes || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={isPackagingDetailOpen} onOpenChange={setIsPackagingDetailOpen}>
          <DialogContent className="max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:max-h-[92dvh] max-w-5xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Rincian alokasi total periode</DialogTitle>
            </DialogHeader>

            {overallPackagingSummary.recipients.length > 0 ? (
              <Tabs value={packagingDetailTab} onValueChange={(v) => setPackagingDetailTab(v as "asnaf" | "mustahik")}>
                <TabsList className="rounded-xl">
                  <TabsTrigger value="asnaf" className="rounded-lg">
                    Per golongan
                  </TabsTrigger>
                  <TabsTrigger value="mustahik" className="rounded-lg">
                    Per mustahik ({overallPackagingSummary.recipients.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="asnaf" className="mt-3">
                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead>Golongan</TableHead>
                          <TableHead className="text-right">Orang</TableHead>
                          <TableHead className="text-right">Uang</TableHead>
                          <TableHead className="text-right">Beras</TableHead>
                          <TableHead className="text-right">Makanan</TableHead>
                          <TableHead className="text-right">ZF / ZM / Fidyah</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overallPackagingSummary.asnafGroups.map((group) => (
                          <TableRow key={group.asnafCode}>
                            <TableCell>
                              <Badge variant={group.asnafCode === "amil" ? "default" : "outline"} className="rounded-full">
                                {getLabel(group.asnafCode)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{group.recipientCount}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{formatCurrency(group.totalCash)}</TableCell>
                            <TableCell className="text-right tabular-nums">{group.totalRiceKg.toFixed(2)} kg</TableCell>
                            <TableCell className="text-right tabular-nums">{group.totalFoodKg.toFixed(2)} kg</TableCell>
                            <TableCell className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                              {formatCurrency(group.zakatFitrahCash)} / {formatCurrency(group.zakatMalCash)} /{" "}
                              {formatCurrency(group.fidyahCash)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="mustahik" className="mt-3">
                  <div className="max-h-[58vh] overflow-auto rounded-xl border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead>Nama</TableHead>
                          <TableHead>Golongan</TableHead>
                          <TableHead className="text-right">Uang</TableHead>
                          <TableHead className="text-right">Beras</TableHead>
                          <TableHead className="text-right">Makanan</TableHead>
                          <TableHead className="text-right">ZF / ZM / Fidyah</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overallPackagingSummary.recipients.map((recipient) => (
                          <TableRow key={recipient.mustahikId}>
                            <TableCell className="font-medium">{recipient.name}</TableCell>
                            <TableCell>
                              <Badge variant={recipient.asnafCode === "amil" ? "default" : "outline"} className="rounded-full">
                                {getLabel(recipient.asnafCode)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{formatCurrency(recipient.totalCash)}</TableCell>
                            <TableCell className="text-right tabular-nums">{recipient.totalRiceKg.toFixed(2)} kg</TableCell>
                            <TableCell className="text-right tabular-nums">{recipient.totalFoodKg.toFixed(2)} kg</TableCell>
                            <TableCell className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                              {formatCurrency(recipient.zakatFitrahCash)} / {formatCurrency(recipient.zakatMalCash)} /{" "}
                              {formatCurrency(recipient.fidyahCash)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Belum ada alokasi per mustahik. Pastikan data mustahik aktif sudah terisi.
              </p>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

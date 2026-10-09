import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ReadOnlyBanner } from "@/components/shared/ReadOnlyBanner";
import { DistributionAssignmentTab } from "@/components/distribution/DistributionAssignmentTab";
import { usePeriod } from "@/contexts/PeriodContext";
import { useAsnafSettings } from "@/hooks/useAsnafSettings";
import { useDistributionCalculation, type AmilDistributionMode } from "@/hooks/useDistributionCalculation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatCurrency";
import { compareMustahikRoute } from "@/lib/mustahikRoute";
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  ClipboardList,
  Eye,
  History,
  PackageCheck,
  Search,
  UserCheck,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import type { Enums } from "@/integrations/supabase/types";

const FUND_CATEGORY_LABELS: Record<string, string> = {
  zakat_fitrah_cash: "Zakat Fitrah (Uang)",
  zakat_fitrah_rice: "Zakat Fitrah (Beras)",
  zakat_mal: "Zakat Mal",
  fidyah_cash: "Fidyah (Uang)",
  fidyah_food: "Fidyah (Makanan)",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Mendesak",
  high: "Tinggi",
  medium: "Sedang",
  low: "Rendah",
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Menunggu", variant: "secondary" },
  approved: { label: "Disetujui", variant: "default" },
  distributed: { label: "Disalurkan", variant: "outline" },
  cancelled: { label: "Dibatalkan", variant: "destructive" },
};

const DELIVERY_STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Belum Dikirim", variant: "secondary" },
  delivered: { label: "Terkirim", variant: "default" },
  not_delivered: { label: "Tidak Terkirim", variant: "destructive" },
};

interface Distribution {
  id: string;
  period_id: string;
  mustahik_id: string;
  fund_category: string;
  distribution_date: string;
  status: "pending" | "approved" | "distributed" | "cancelled";
  cash_amount: number | null;
  rice_amount_kg?: number | null;
  food_amount_kg?: number | null;
  notes: string | null;
  mustahik?: { name: string; asnaf: string };
}

interface FundBalance {
  category: string;
  total_cash: number;
  total_rice_kg: number;
  total_food_kg: number;
}

interface CalculationBatch {
  id: string;
  batch_no: number;
  batch_code: string;
  status: string;
  locked_at: string;
  notes: string | null;
  total_allocated_cash: number;
  total_allocated_rice_kg: number;
  total_allocated_food_kg: number;
}

interface CalculationBatchItem {
  id: string;
  batch_id: string;
  period_id: string;
  mustahik_id: string;
  fund_category: FundCategory;
  is_amil: boolean;
  asnaf_code: string | null;
  priority: string | null;
  cash_amount: number;
  rice_amount_kg: number;
  food_amount_kg: number;
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

type DistributionTab = "distribution" | "history" | "assignment";
type DistributionMethod = "batch" | "manual";

const HISTORY_PAGE_SIZE = 50;
type FundCategory = Enums<"fund_category">;
type DistributionStatus = Enums<"distribution_status">;

const normalizeAmilMode = (mode: string | null | undefined): AmilDistributionMode =>
  mode === "proportional_with_factor" ? "proportional_with_factor" : "percentage";

const normalizeAmilShareFactor = (factor: number | null | undefined): number => {
  if (typeof factor !== "number" || Number.isNaN(factor)) return 0.5;
  return Math.max(0, Math.min(1, factor));
};

const BATCH_STATUS_LABELS: Record<string, string> = {
  locked: "Terkunci",
  distributed: "Sudah Disalurkan",
  cancelled: "Dibatalkan",
};

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

  const groupAccumulator = {
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
    groupAccumulator[key].recipientCount += 1;
    groupAccumulator[key].totalCash += recipient.totalCash;
    groupAccumulator[key].totalRiceKg += recipient.totalRiceKg;
    groupAccumulator[key].totalFoodKg += recipient.totalFoodKg;
    groupAccumulator[key].zakatFitrahCash += recipient.zakatFitrahCash;
    groupAccumulator[key].zakatMalCash += recipient.zakatMalCash;
    groupAccumulator[key].fidyahCash += recipient.fidyahCash;
  });

  const groupBreakdown = {
    amil: {
      ...groupAccumulator.amil,
      averageCashPerRecipient:
        groupAccumulator.amil.recipientCount > 0 ? groupAccumulator.amil.totalCash / groupAccumulator.amil.recipientCount : 0,
      averageRicePerRecipient:
        groupAccumulator.amil.recipientCount > 0 ? groupAccumulator.amil.totalRiceKg / groupAccumulator.amil.recipientCount : 0,
      averageFoodPerRecipient:
        groupAccumulator.amil.recipientCount > 0 ? groupAccumulator.amil.totalFoodKg / groupAccumulator.amil.recipientCount : 0,
    },
    nonAmil: {
      ...groupAccumulator.nonAmil,
      averageCashPerRecipient:
        groupAccumulator.nonAmil.recipientCount > 0
          ? groupAccumulator.nonAmil.totalCash / groupAccumulator.nonAmil.recipientCount
          : 0,
      averageRicePerRecipient:
        groupAccumulator.nonAmil.recipientCount > 0
          ? groupAccumulator.nonAmil.totalRiceKg / groupAccumulator.nonAmil.recipientCount
          : 0,
      averageFoodPerRecipient:
        groupAccumulator.nonAmil.recipientCount > 0
          ? groupAccumulator.nonAmil.totalFoodKg / groupAccumulator.nonAmil.recipientCount
          : 0,
    },
  };

  const totals = recipients.reduce(
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
  );

  return { recipients, asnafGroups, groupBreakdown, totals };
};

const CATEGORY_UNIT: Record<FundCategory, "cash" | "rice" | "food"> = {
  zakat_fitrah_cash: "cash",
  zakat_fitrah_rice: "rice",
  zakat_mal: "cash",
  fidyah_cash: "cash",
  fidyah_food: "food",
};

const formatAmount = (unit: "cash" | "rice" | "food", value: number) =>
  unit === "cash" ? formatCurrency(value) : `${Number(value || 0).toFixed(2)} kg`;

const StatTile = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-xl border border-border/60 bg-background/70 p-3">
    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="mt-1 text-lg font-semibold leading-tight tabular-nums">{value}</p>
    {hint && <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{hint}</p>}
  </div>
);

export default function Distribution() {
  const { isReadOnly, selectedPeriod } = usePeriod();
  const { toast } = useToast();
  const { getLabel } = useAsnafSettings();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<DistributionTab>("distribution");
  const [distributionMethod, setDistributionMethod] = useState<DistributionMethod>("batch");
  const [categoryFilter, setCategoryFilter] = useState<FundCategory | "all">("all");
  const [historySearch, setHistorySearch] = useState("");
  const [historyVisible, setHistoryVisible] = useState(HISTORY_PAGE_SIZE);
  const [viewingDistribution, setViewingDistribution] = useState<Distribution | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewCategory, setPreviewCategory] = useState<FundCategory | "">("");
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [isBatchConfirmOpen, setIsBatchConfirmOpen] = useState(false);
  const [isPackagingDetailOpen, setIsPackagingDetailOpen] = useState(false);
  const [packagingDetailTab, setPackagingDetailTab] = useState<"asnaf" | "mustahik">("asnaf");

  const allCategories: FundCategory[] = ["zakat_fitrah_cash", "zakat_fitrah_rice", "zakat_mal", "fidyah_cash", "fidyah_food"];

  const amilDistributionMode = normalizeAmilMode(selectedPeriod?.amil_distribution_mode);
  const amilShareFactor = normalizeAmilShareFactor(selectedPeriod?.amil_share_factor);

  const { data: fundBalances = [] } = useQuery({
    queryKey: ["fund-balances", selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];
      const { data, error } = await supabase.rpc("get_all_fund_balances", {
        _period_id: selectedPeriod.id,
      });
      if (error) throw error;
      return data as FundBalance[];
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
          "id, batch_no, batch_code, status, locked_at, notes, total_allocated_cash, total_allocated_rice_kg, total_allocated_food_kg",
        )
        .eq("period_id", selectedPeriod.id)
        .order("batch_no", { ascending: false });

      if (error) throw error;
      return data as CalculationBatch[];
    },
    enabled: !!selectedPeriod?.id,
  });

  const { data: selectedBatchItems = [] } = useQuery({
    queryKey: ["distribution-calculation-batch-items", selectedBatchId],
    queryFn: async () => {
      if (!selectedBatchId) return [];

      const { data, error } = await supabase
        .from("distribution_calculation_batch_items")
        .select("*")
        .eq("batch_id", selectedBatchId)
        .order("fund_category")
        .order("is_amil", { ascending: false });

      if (error) throw error;
      return data as CalculationBatchItem[];
    },
    enabled: !!selectedBatchId,
  });

  const { data: distributionAssignments = [] } = useQuery({
    queryKey: ["distribution-assignments", selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];
      const { data, error } = await supabase
        .from("distribution_assignments")
        .select("mustahik_id, status, delivery_notes, delivered_at")
        .eq("period_id", selectedPeriod.id);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedPeriod?.id,
  });

  const deliveryStatusMap = useMemo(() => {
    const map = new Map<string, { status: string; deliveryNotes: string | null; deliveredAt: string | null }>();
    distributionAssignments.forEach((a) => {
      map.set(a.mustahik_id, {
        status: a.status,
        deliveryNotes: a.delivery_notes,
        deliveredAt: a.delivered_at,
      });
    });
    return map;
  }, [distributionAssignments]);

  const { data: zakatDistributions = [] } = useQuery({
    queryKey: ["zakat_distributions", selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];
      const { data, error } = await supabase
        .from("zakat_distributions")
        .select("*, mustahik:mustahik_id(name, asnaf)")
        .eq("period_id", selectedPeriod.id)
        .order("distribution_date", { ascending: false });
      if (error) throw error;
      return data as Distribution[];
    },
    enabled: !!selectedPeriod?.id,
  });

  const { data: fidyahDistributions = [] } = useQuery({
    queryKey: ["fidyah_distributions", selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];
      const { data, error } = await supabase
        .from("fidyah_distributions")
        .select("*, mustahik:mustahik_id(name, asnaf)")
        .eq("period_id", selectedPeriod.id)
        .order("distribution_date", { ascending: false });
      if (error) throw error;
      return data as Distribution[];
    },
    enabled: !!selectedPeriod?.id,
  });

  const mergedDistributions = useMemo(() => {
    return [...zakatDistributions, ...fidyahDistributions].sort(
      (a, b) => new Date(b.distribution_date).getTime() - new Date(a.distribution_date).getTime(),
    );
  }, [zakatDistributions, fidyahDistributions]);

  const filteredDistributions = useMemo(() => {
    const keyword = historySearch.trim().toLowerCase();
    return mergedDistributions.filter((d) => {
      if (categoryFilter !== "all" && d.fund_category !== categoryFilter) return false;
      if (keyword && !(d.mustahik?.name || "").toLowerCase().includes(keyword)) return false;
      return true;
    });
  }, [categoryFilter, historySearch, mergedDistributions]);

  useEffect(() => {
    setHistoryVisible(HISTORY_PAGE_SIZE);
  }, [categoryFilter, historySearch, selectedPeriod?.id]);

  const visibleDistributions = useMemo(
    () => filteredDistributions.slice(0, historyVisible),
    [filteredDistributions, historyVisible],
  );

  // Sisa saldo dana per periode (ledger penerimaan dikurangi penyaluran yang sudah tercatat).
  const balanceTotals = useMemo(
    () =>
      fundBalances.reduce(
        (acc, balance) => {
          acc.cash += Number(balance.total_cash || 0);
          acc.rice += Number(balance.total_rice_kg || 0);
          acc.food += Number(balance.total_food_kg || 0);
          return acc;
        },
        { cash: 0, rice: 0, food: 0 },
      ),
    [fundBalances],
  );

  const distributedTotals = useMemo(
    () =>
      mergedDistributions
        .filter((d) => d.status === "distributed" || d.status === "approved")
        .reduce(
          (acc, d) => {
            acc.cash += Number(d.cash_amount || 0);
            acc.rice += Number(d.rice_amount_kg || 0);
            acc.food += Number(d.food_amount_kg || 0);
            acc.recipients.add(d.mustahik_id);
            return acc;
          },
          { cash: 0, rice: 0, food: 0, recipients: new Set<string>() },
        ),
    [mergedDistributions],
  );

  const selectedBatch = useMemo(
    () => lockedBatches.find((batch) => batch.id === selectedBatchId) || null,
    [lockedBatches, selectedBatchId],
  );

  useEffect(() => {
    if (!selectedBatchId && lockedBatches.length > 0) {
      const firstLocked = lockedBatches.find((batch) => batch.status === "locked") || lockedBatches[0];
      setSelectedBatchId(firstLocked.id);
    }
  }, [lockedBatches, selectedBatchId]);

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

  const allExistingDistributions = useMemo(() => {
    return [...zakatDistributions, ...fidyahDistributions].map((d) => ({
      mustahik_id: d.mustahik_id,
      fund_category: d.fund_category,
      status: d.status,
    }));
  }, [zakatDistributions, fidyahDistributions]);

  const calculations = useDistributionCalculation(mustahikList, fundBalances, allExistingDistributions, {
    amilDistributionMode,
    amilShareFactor,
  });

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

  const getBalance = (category: FundCategory) => {
    const balance = fundBalances.find((b) => b.category === category);
    return balance || { total_cash: 0, total_rice_kg: 0, total_food_kg: 0 };
  };

  const getCalculatedDistribution = (category: FundCategory | "") => {
    switch (category) {
      case "zakat_fitrah_cash":
        return calculations.zakatFitrahCash;
      case "zakat_fitrah_rice":
        return calculations.zakatFitrahRice;
      case "zakat_mal":
        return calculations.zakatMal;
      case "fidyah_cash":
        return calculations.fidyahCash;
      case "fidyah_food":
        return calculations.fidyahFood;
      default:
        return { amil: [], beneficiaries: [], amilTotal: 0, beneficiaryTotal: 0 };
    }
  };

  const distributeLockedBatchMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPeriod?.id) throw new Error("Periode belum dipilih");
      if (!selectedBatch) throw new Error("Pilih batch yang ingin disalurkan");
      if (selectedBatch.status !== "locked") throw new Error("Batch ini tidak dalam status terkunci");
      if (selectedBatchItems.length === 0) throw new Error("Batch tidak memiliki item distribusi");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      for (const item of selectedBatchItems) {
        const isZakat = item.fund_category.startsWith("zakat");
        const table = isZakat ? "zakat_distributions" : "fidyah_distributions";
        const batchNote = `Distribusi dari ${selectedBatch.batch_code || `BATCH-${selectedBatch.batch_no}`}`;

        const { data: existingFromSameBatch, error: existingError } = await supabase
          .from(table)
          .select("id")
          .eq("period_id", selectedPeriod.id)
          .eq("mustahik_id", item.mustahik_id)
          .eq("fund_category", item.fund_category)
          .eq("notes", batchNote)
          .limit(1);
        if (existingError) throw existingError;
        if (existingFromSameBatch && existingFromSameBatch.length > 0) continue;

        const insertData: {
          period_id: string;
          mustahik_id: string;
          fund_category: FundCategory;
          status: DistributionStatus;
          notes: string;
          cash_amount?: number;
          rice_amount_kg?: number;
          food_amount_kg?: number;
        } = {
          period_id: selectedPeriod.id,
          mustahik_id: item.mustahik_id,
          fund_category: item.fund_category,
          status: "distributed",
          notes: batchNote,
          cash_amount: Number(item.cash_amount || 0),
        };

        if (isZakat) {
          insertData.rice_amount_kg = Number(item.rice_amount_kg || 0);
        } else {
          insertData.food_amount_kg = Number(item.food_amount_kg || 0);
        }

        const { data: dist, error: distError } = await supabase.from(table).insert(insertData).select().single();
        if (distError) throw distError;

        const { error: ledgerError } = await supabase.from("fund_ledger").insert({
          period_id: selectedPeriod.id,
          category: item.fund_category,
          transaction_type: "distribution",
          amount_cash: -Number(item.cash_amount || 0),
          amount_rice_kg: -Number(item.rice_amount_kg || 0),
          amount_food_kg: -Number(item.food_amount_kg || 0),
          reference_id: dist.id,
          reference_type: table,
          description: `Distribusi ${selectedBatch.batch_code || `BATCH-${selectedBatch.batch_no}`} ke mustahik`,
        });
        if (ledgerError) throw ledgerError;
      }

      const { error: batchUpdateError } = await supabase
        .from("distribution_calculation_batches")
        .update({
          status: "distributed",
          distributed_at: new Date().toISOString(),
          distributed_by: user?.id || null,
        })
        .eq("id", selectedBatch.id)
        .eq("status", "locked");

      if (batchUpdateError) throw batchUpdateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["distribution-calculation-batches"] });
      queryClient.invalidateQueries({ queryKey: ["distribution-calculation-batch-items"] });
      queryClient.invalidateQueries({ queryKey: ["zakat_distributions"] });
      queryClient.invalidateQueries({ queryKey: ["fidyah_distributions"] });
      queryClient.invalidateQueries({ queryKey: ["fund-balances"] });
      setIsBatchConfirmOpen(false);
      toast({ title: "Batch berhasil disalurkan ke daftar distribusi" });
    },
    onError: (error: Error) => {
      setIsBatchConfirmOpen(false);
      toast({ variant: "destructive", title: "Gagal menyalurkan batch", description: error.message });
    },
  });

  const openPreview = (category: FundCategory) => {
    setPreviewCategory(category);
    setSelectedRecipients(new Set());
    setIsPreviewOpen(true);
  };

  const batchDistributeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPeriod?.id || selectedRecipients.size === 0) {
        throw new Error("Pilih minimal satu penerima");
      }
      if (!previewCategory) {
        throw new Error("Kategori distribusi tidak valid");
      }

      const calc = getCalculatedDistribution(previewCategory);
      const allRecipients = [...calc.amil, ...calc.beneficiaries];
      const selectedList = allRecipients.filter((r) => selectedRecipients.has(r.mustahikId));

      const isZakat = previewCategory.startsWith("zakat");
      const table = isZakat ? "zakat_distributions" : "fidyah_distributions";

      for (const recipient of selectedList) {
        const existingDist = allExistingDistributions.find(
          (d) =>
            d.mustahik_id === recipient.mustahikId &&
            d.fund_category === previewCategory &&
            (d.status === "distributed" || d.status === "approved"),
        );

        if (existingDist) continue;

        const insertData: {
          period_id: string;
          mustahik_id: string;
          fund_category: FundCategory;
          status: DistributionStatus;
          notes: string;
          cash_amount?: number;
          rice_amount_kg?: number;
          food_amount_kg?: number;
        } = {
          period_id: selectedPeriod.id,
          mustahik_id: recipient.mustahikId,
          fund_category: previewCategory,
          status: "distributed",
          notes: "Pendistribusian otomatis dari menu Pendistribusian",
        };

        if (isZakat) {
          insertData.cash_amount = recipient.cashAmount || 0;
          insertData.rice_amount_kg = recipient.riceAmount || 0;
        } else {
          insertData.cash_amount = recipient.cashAmount || 0;
          insertData.food_amount_kg = recipient.foodAmount || 0;
        }

        const { data: dist, error: distError } = await supabase.from(table).insert(insertData).select().single();
        if (distError) throw distError;

        const { error: ledgerError } = await supabase.from("fund_ledger").insert([
          {
            period_id: selectedPeriod.id,
            category: previewCategory,
            transaction_type: "distribution" as const,
            amount_cash: -(recipient.cashAmount || 0),
            amount_rice_kg: -(recipient.riceAmount || 0),
            amount_food_kg: -(recipient.foodAmount || 0),
            reference_id: dist.id,
            reference_type: table,
            description: `Pendistribusian ke ${recipient.name}`,
          },
        ]);

        if (ledgerError) throw ledgerError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zakat_distributions"] });
      queryClient.invalidateQueries({ queryKey: ["fidyah_distributions"] });
      queryClient.invalidateQueries({ queryKey: ["fund-balances"] });
      setIsPreviewOpen(false);
      setSelectedRecipients(new Set());
      toast({ title: `${selectedRecipients.size} pendistribusian berhasil dicatat` });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const toggleRecipient = (id: string) => {
    const newSet = new Set(selectedRecipients);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedRecipients(newSet);
  };

  const selectedBatchSummary = useMemo(() => {
    if (!selectedBatch) return null;

    const recipientCount = new Set(selectedBatchItems.map((item) => item.mustahik_id)).size;
    const categoryCount = new Set(selectedBatchItems.map((item) => item.fund_category)).size;

    return {
      recipientCount,
      categoryCount,
      totalCash: selectedBatch.total_allocated_cash || 0,
      totalRice: selectedBatch.total_allocated_rice_kg || 0,
      totalFood: selectedBatch.total_allocated_food_kg || 0,
    };
  }, [selectedBatch, selectedBatchItems]);

  const packagingSummary = useMemo(() => {
    if (!selectedBatch || selectedBatchItems.length === 0) {
      return createEmptyPackagingSummary();
    }

    const batchPackagingItems: PackagingSourceItem[] = selectedBatchItems.map((item) => ({
      mustahikId: item.mustahik_id,
      fundCategory: item.fund_category,
      cashAmount: Number(item.cash_amount || 0),
      riceAmountKg: Number(item.rice_amount_kg || 0),
      foodAmountKg: Number(item.food_amount_kg || 0),
      isAmil: Boolean(item.is_amil),
      asnafCode: item.asnaf_code || "",
      priority: String(item.priority || "medium"),
    }));

    return buildPackagingSummary(batchPackagingItems, mustahikMetaMap);
  }, [selectedBatch, selectedBatchItems, mustahikMetaMap]);

  const categoryRows = allCategories.map((category) => {
    const unit = CATEGORY_UNIT[category];
    const balance = getBalance(category);
    const calc = getCalculatedDistribution(category);
    const balanceValue =
      unit === "cash" ? balance.total_cash : unit === "rice" ? balance.total_rice_kg : balance.total_food_kg;

    return {
      category,
      unit,
      balanceValue,
      recipientCount: calc.amil.length + calc.beneficiaries.length,
    };
  });

  const previewCalc = getCalculatedDistribution(previewCategory);
  const previewUnit = previewCategory ? CATEGORY_UNIT[previewCategory] : "cash";
  const previewTotal = previewCalc.amilTotal + previewCalc.beneficiaryTotal;
  const previewAmilPercent = previewTotal > 0 ? (previewCalc.amilTotal / previewTotal) * 100 : 0;
  const previewBeneficiaryPercent = previewTotal > 0 ? (previewCalc.beneficiaryTotal / previewTotal) * 100 : 0;

  const distributedIds = new Set(
    allExistingDistributions
      .filter((d) => d.fund_category === previewCategory && (d.status === "distributed" || d.status === "approved"))
      .map((d) => d.mustahik_id),
  );

  const previewRecipients = [...previewCalc.amil, ...previewCalc.beneficiaries];
  const previewEligible = previewRecipients.filter((r) => !distributedIds.has(r.mustahikId));
  const previewSelectedTotal = previewRecipients
    .filter((r) => selectedRecipients.has(r.mustahikId))
    .reduce(
      (acc, r) => {
        acc.cash += Number(r.cashAmount || 0);
        acc.rice += Number(r.riceAmount || 0);
        acc.food += Number(r.foodAmount || 0);
        return acc;
      },
      { cash: 0, rice: 0, food: 0 },
    );
  const previewSelectedValue =
    previewUnit === "cash" ? previewSelectedTotal.cash : previewUnit === "rice" ? previewSelectedTotal.rice : previewSelectedTotal.food;
  const isAllEligibleSelected =
    previewEligible.length > 0 && previewEligible.every((r) => selectedRecipients.has(r.mustahikId));

  const toggleAllEligible = () => {
    if (isAllEligibleSelected) {
      setSelectedRecipients(new Set());
      return;
    }
    setSelectedRecipients(new Set(previewEligible.map((r) => r.mustahikId)));
  };

  const toggleGroup = (recipients: { mustahikId: string }[]) => {
    const eligible = recipients.filter((r) => !distributedIds.has(r.mustahikId));
    const newSet = new Set(selectedRecipients);
    if (eligible.every((r) => selectedRecipients.has(r.mustahikId))) {
      eligible.forEach((r) => newSet.delete(r.mustahikId));
    } else {
      eligible.forEach((r) => newSet.add(r.mustahikId));
    }
    setSelectedRecipients(newSet);
  };

  const canDistributeBatch =
    !!selectedBatch && selectedBatch.status === "locked" && !isReadOnly && selectedBatchItems.length > 0;

  return (
    <AppLayout title="Pendistribusian">
      {isReadOnly && <ReadOnlyBanner periodName={selectedPeriod?.name} />}

      <div className="space-y-4">
        {/* Ringkasan posisi dana periode */}
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-[220px]">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Sisa dana belum tersalurkan · {selectedPeriod?.name || "Periode belum dipilih"}
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{formatCurrency(balanceTotals.cash)}</p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                Beras {balanceTotals.rice.toFixed(2)} kg · Makanan {balanceTotals.food.toFixed(2)} kg
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Sudah tersalurkan</p>
                <p className="text-base font-semibold tabular-nums">{formatCurrency(distributedTotals.cash)}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {distributedTotals.rice.toFixed(2)} kg beras · {distributedTotals.food.toFixed(2)} kg makanan
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Penerima</p>
                <p className="text-base font-semibold tabular-nums">{distributedTotals.recipients.size} orang</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">{mergedDistributions.length} catatan</p>
              </div>
              <Button asChild variant="outline" className="h-[68px] rounded-xl">
                <Link href="/calculations">
                  Perhitungan
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DistributionTab)}>
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl p-1">
            <TabsTrigger value="distribution" className="gap-1.5 rounded-lg">
              <PackageCheck className="h-4 w-4" />
              Penyaluran
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 rounded-lg">
              <History className="h-4 w-4" />
              Riwayat ({mergedDistributions.length})
            </TabsTrigger>
            <TabsTrigger value="assignment" className="gap-1.5 rounded-lg">
              <ClipboardList className="h-4 w-4" />
              Penugasan
            </TabsTrigger>
          </TabsList>

          {/* Tab 1 - Penyaluran */}
          <TabsContent value="distribution" className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-xl border border-border/60 bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => setDistributionMethod("batch")}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    distributionMethod === "batch"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Dari batch terkunci
                </button>
                <button
                  type="button"
                  onClick={() => setDistributionMethod("manual")}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    distributionMethod === "manual"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Manual per kategori
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {distributionMethod === "batch"
                  ? "Menyalurkan seluruh alokasi yang sudah dikunci di menu Perhitungan sekaligus."
                  : "Dipakai bila tidak memakai batch. Menghitung ulang dari sisa saldo dana saat ini."}
              </p>
            </div>

            {distributionMethod === "batch" ? (
              <Card className="border-border/70">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Salurkan batch terkunci</CardTitle>
                  <CardDescription>
                    Pilih batch, periksa ringkasannya, lalu salurkan sekali jalan. Setiap batch hanya bisa disalurkan satu kali.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {lockedBatches.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center">
                      <p className="text-sm font-medium">Belum ada batch terkunci pada periode ini.</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Kunci hasil perhitungan terlebih dahulu, atau pakai penyaluran manual per kategori.
                      </p>
                      <Button asChild variant="outline" size="sm" className="mt-3 rounded-xl">
                        <Link href="/calculations">Buka menu Perhitungan</Link>
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">Batch</p>
                          <Select value={selectedBatchId || ""} onValueChange={setSelectedBatchId}>
                            <SelectTrigger className="h-10 rounded-xl">
                              <SelectValue placeholder="Pilih batch" />
                            </SelectTrigger>
                            <SelectContent>
                              {lockedBatches.map((batch) => (
                                <SelectItem key={batch.id} value={batch.id}>
                                  {batch.batch_code || `BATCH-${batch.batch_no}`} ·{" "}
                                  {BATCH_STATUS_LABELS[batch.status] || batch.status} ·{" "}
                                  {format(new Date(batch.locked_at), "dd MMM yyyy", { locale: idLocale })}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          className="h-10 rounded-xl"
                          onClick={() => setIsBatchConfirmOpen(true)}
                          disabled={!canDistributeBatch || distributeLockedBatchMutation.isPending}
                        >
                          {distributeLockedBatchMutation.isPending ? "Menyalurkan..." : "Salurkan batch"}
                        </Button>
                      </div>

                      {selectedBatch && selectedBatch.status !== "locked" && (
                        <div className="flex items-start gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-3 text-xs text-emerald-900">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          <p>
                            Batch ini berstatus <span className="font-medium">{BATCH_STATUS_LABELS[selectedBatch.status] || selectedBatch.status}</span>{" "}
                            sehingga tidak bisa disalurkan lagi. Pilih batch lain atau kunci batch baru di menu Perhitungan.
                          </p>
                        </div>
                      )}

                      {selectedBatch && selectedBatchSummary && (
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          <StatTile
                            label="Penerima"
                            value={`${selectedBatchSummary.recipientCount} orang`}
                            hint={`${selectedBatchSummary.categoryCount} kategori dana`}
                          />
                          <StatTile label="Total kas" value={formatCurrency(selectedBatchSummary.totalCash)} />
                          <StatTile label="Total beras" value={`${selectedBatchSummary.totalRice.toFixed(2)} kg`} />
                          <StatTile label="Total makanan" value={`${selectedBatchSummary.totalFood.toFixed(2)} kg`} />
                        </div>
                      )}

                      {selectedBatch && packagingSummary.recipients.length > 0 && (
                        <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold">Isi paket per orang</p>
                              <p className="text-xs text-muted-foreground">Acuan cepat saat membungkus paket batch ini.</p>
                            </div>
                            <div className="flex gap-2">
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

                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-3">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-emerald-900">Amil</p>
                                <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                                  {packagingSummary.groupBreakdown.amil.recipientCount} orang
                                </span>
                              </div>
                              <p className="mt-2 text-sm font-semibold tabular-nums">
                                {formatCurrency(packagingSummary.groupBreakdown.amil.averageCashPerRecipient)} ·{" "}
                                {packagingSummary.groupBreakdown.amil.averageRicePerRecipient.toFixed(2)} kg
                              </p>
                              <p className="text-[11px] text-muted-foreground tabular-nums">
                                Total {formatCurrency(packagingSummary.groupBreakdown.amil.totalCash)} ·{" "}
                                {packagingSummary.groupBreakdown.amil.totalRiceKg.toFixed(2)} kg
                              </p>
                            </div>
                            <div className="rounded-xl border border-sky-200/70 bg-sky-50/50 p-3">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-sky-900">Non-amil</p>
                                <span className="rounded-full bg-sky-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                                  {packagingSummary.groupBreakdown.nonAmil.recipientCount} orang
                                </span>
                              </div>
                              <p className="mt-2 text-sm font-semibold tabular-nums">
                                {formatCurrency(packagingSummary.groupBreakdown.nonAmil.averageCashPerRecipient)} ·{" "}
                                {packagingSummary.groupBreakdown.nonAmil.averageRicePerRecipient.toFixed(2)} kg ·{" "}
                                {packagingSummary.groupBreakdown.nonAmil.averageFoodPerRecipient.toFixed(2)} kg
                              </p>
                              <p className="text-[11px] text-muted-foreground tabular-nums">
                                Total {formatCurrency(packagingSummary.groupBreakdown.nonAmil.totalCash)} ·{" "}
                                {packagingSummary.groupBreakdown.nonAmil.totalRiceKg.toFixed(2)} kg ·{" "}
                                {packagingSummary.groupBreakdown.nonAmil.totalFoodKg.toFixed(2)} kg
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border/70">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Salurkan manual per kategori</CardTitle>
                  <CardDescription>
                    Saldo dihitung dari penerimaan dikurangi penyaluran yang sudah tercatat. Penerima yang sudah menerima kategori
                    yang sama otomatis dikunci.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead>Kategori dana</TableHead>
                          <TableHead className="text-right">Sisa saldo</TableHead>
                          <TableHead className="text-right">Penerima siap</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryRows.map((row) => (
                          <TableRow key={row.category}>
                            <TableCell className="font-medium">{FUND_CATEGORY_LABELS[row.category]}</TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {formatAmount(row.unit, row.balanceValue)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {row.recipientCount > 0 ? row.recipientCount : "-"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-lg"
                                disabled={isReadOnly || row.recipientCount === 0}
                                onClick={() => openPreview(row.category)}
                              >
                                <Calculator className="mr-1 h-3.5 w-3.5" />
                                Jalankan
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Baris tanpa penerima berarti saldo kosong atau belum ada mustahik yang berhak menerima kategori tersebut.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab 2 - Riwayat */}
          <TabsContent value="history" className="mt-3">
            <Card className="border-border/70">
              <CardHeader className="gap-3 pb-3">
                <div>
                  <CardTitle className="text-base">Riwayat pendistribusian</CardTitle>
                  <CardDescription>Seluruh penyaluran zakat dan fidyah pada periode aktif.</CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Cari nama penerima"
                      className="h-10 rounded-xl pl-9"
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as FundCategory | "all")}>
                    <SelectTrigger className="h-10 w-full rounded-xl sm:w-[240px]">
                      <SelectValue placeholder="Filter kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua kategori</SelectItem>
                      {allCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {FUND_CATEGORY_LABELS[cat]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {filteredDistributions.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {mergedDistributions.length === 0
                      ? "Belum ada penyaluran pada periode ini."
                      : "Tidak ada data yang cocok dengan filter."}
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-xl border border-border/60">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead>Tanggal</TableHead>
                            <TableHead>Penerima</TableHead>
                            <TableHead>Asnaf</TableHead>
                            <TableHead>Kategori</TableHead>
                            <TableHead className="text-right">Jumlah</TableHead>
                            <TableHead>Penyaluran</TableHead>
                            <TableHead>Pengiriman</TableHead>
                            <TableHead className="w-12" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleDistributions.map((dist) => {
                            const deliveryInfo = deliveryStatusMap.get(dist.mustahik_id);
                            const statusConfig = STATUS_CONFIG[dist.status] || { label: dist.status, variant: "outline" as const };
                            const unit = CATEGORY_UNIT[dist.fund_category as FundCategory] || "cash";
                            const amount =
                              unit === "cash"
                                ? dist.cash_amount || 0
                                : unit === "rice"
                                  ? dist.rice_amount_kg || 0
                                  : dist.food_amount_kg || 0;

                            return (
                              <TableRow key={dist.id}>
                                <TableCell className="whitespace-nowrap text-muted-foreground">
                                  {format(new Date(dist.distribution_date), "dd MMM yyyy", { locale: idLocale })}
                                </TableCell>
                                <TableCell className="font-medium">{dist.mustahik?.name}</TableCell>
                                <TableCell>
                                  <Badge variant={dist.mustahik?.asnaf === "amil" ? "default" : "outline"} className="rounded-full">
                                    {getLabel(dist.mustahik?.asnaf || "")}
                                  </Badge>
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-muted-foreground">
                                  {FUND_CATEGORY_LABELS[dist.fund_category]}
                                </TableCell>
                                <TableCell className="text-right font-medium tabular-nums">
                                  {formatAmount(unit, amount)}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={statusConfig.variant} className="rounded-full">
                                    {statusConfig.label}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {deliveryInfo ? (
                                    <Badge
                                      variant={DELIVERY_STATUS_CONFIG[deliveryInfo.status]?.variant || "secondary"}
                                      className="rounded-full"
                                    >
                                      {DELIVERY_STATUS_CONFIG[deliveryInfo.status]?.label || deliveryInfo.status}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="rounded-full">
                                      Belum ditugaskan
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button variant="ghost" size="icon" onClick={() => setViewingDistribution(dist)}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Menampilkan {visibleDistributions.length} dari {filteredDistributions.length} catatan.
                      </p>
                      {visibleDistributions.length < filteredDistributions.length && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => setHistoryVisible((prev) => prev + HISTORY_PAGE_SIZE)}
                        >
                          Muat lebih banyak
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 3 - Penugasan */}
          <TabsContent value="assignment" className="mt-3">
            {selectedPeriod?.id ? (
              <DistributionAssignmentTab periodId={selectedPeriod.id} isReadOnly={isReadOnly} />
            ) : (
              <Card className="border-border/70">
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Pilih periode untuk melihat penugasan distribusi.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={isBatchConfirmOpen} onOpenChange={setIsBatchConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salurkan batch ini?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Seluruh alokasi{" "}
                  <span className="font-medium text-foreground">
                    {selectedBatch?.batch_code || (selectedBatch ? `BATCH-${selectedBatch.batch_no}` : "-")}
                  </span>{" "}
                  akan dicatat sebagai distribusi dan saldo dana ikut berkurang. Tindakan ini tidak bisa dibatalkan dari
                  halaman ini.
                </p>
                {selectedBatchSummary && (
                  <p className="tabular-nums">
                    {selectedBatchSummary.recipientCount} penerima · {formatCurrency(selectedBatchSummary.totalCash)} ·{" "}
                    {selectedBatchSummary.totalRice.toFixed(2)} kg beras · {selectedBatchSummary.totalFood.toFixed(2)} kg makanan
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={distributeLockedBatchMutation.isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                distributeLockedBatchMutation.mutate();
              }}
              disabled={distributeLockedBatchMutation.isPending}
            >
              {distributeLockedBatchMutation.isPending ? "Menyalurkan..." : "Ya, salurkan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isPackagingDetailOpen} onOpenChange={setIsPackagingDetailOpen}>
        <DialogContent className="max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:max-h-[92dvh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Rincian paket {selectedBatch ? `· ${selectedBatch.batch_code || `BATCH-${selectedBatch.batch_no}`}` : ""}
            </DialogTitle>
          </DialogHeader>

          {packagingSummary.recipients.length > 0 ? (
            <Tabs value={packagingDetailTab} onValueChange={(v) => setPackagingDetailTab(v as "asnaf" | "mustahik")}>
              <TabsList className="rounded-xl">
                <TabsTrigger value="asnaf" className="rounded-lg">
                  Per golongan
                </TabsTrigger>
                <TabsTrigger value="mustahik" className="rounded-lg">
                  Per mustahik ({packagingSummary.recipients.length})
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
                      {packagingSummary.asnafGroups.map((group) => (
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
                      {packagingSummary.recipients.map((recipient) => (
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
            <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data paket untuk batch ini.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:max-h-[90dvh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Salurkan {previewCategory ? FUND_CATEGORY_LABELS[previewCategory] : ""}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">
                <p className="tabular-nums">
                  Total dana <span className="font-medium text-foreground">{formatAmount(previewUnit, previewTotal)}</span> ·
                  Amil {previewAmilPercent.toFixed(1)}% · Mustahik {previewBeneficiaryPercent.toFixed(1)}%
                </p>
                <p className="mt-0.5">
                  {amilDistributionMode === "proportional_with_factor"
                    ? "Sisa dana setelah porsi amil dibagi rata ke mustahik non-amil."
                    : "Pembagian non-amil mengikuti bobot prioritas dan jumlah anggota keluarga."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                disabled={previewEligible.length === 0}
                onClick={toggleAllEligible}
              >
                {isAllEligibleSelected ? "Batal pilih semua" : `Pilih semua (${previewEligible.length})`}
              </Button>
            </div>

            {previewCalc.amil.length > 0 && (
              <div className="rounded-xl border border-border/60">
                <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-2">
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    Amil · {formatAmount(previewUnit, previewCalc.amilTotal)}
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={previewCalc.amil
                            .filter((a) => !distributedIds.has(a.mustahikId))
                            .every((a) => selectedRecipients.has(a.mustahikId))}
                          onCheckedChange={() => toggleGroup(previewCalc.amil)}
                        />
                      </TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewCalc.amil.map((a) => {
                      const isDistributed = distributedIds.has(a.mustahikId);
                      return (
                        <TableRow key={a.mustahikId} className={isDistributed ? "opacity-50" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={selectedRecipients.has(a.mustahikId) || isDistributed}
                              disabled={isDistributed}
                              onCheckedChange={() => toggleRecipient(a.mustahikId)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatAmount(previewUnit, a.cashAmount || a.riceAmount || a.foodAmount)}
                          </TableCell>
                          <TableCell>
                            {isDistributed ? (
                              <Badge variant="outline" className="rounded-full">
                                Sudah disalurkan
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="rounded-full">
                                Belum
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {previewCalc.beneficiaries.length > 0 && (
              <div className="rounded-xl border border-border/60">
                <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    Mustahik non-amil · {formatAmount(previewUnit, previewCalc.beneficiaryTotal)}
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={previewCalc.beneficiaries
                            .filter((b) => !distributedIds.has(b.mustahikId))
                            .every((b) => selectedRecipients.has(b.mustahikId))}
                          onCheckedChange={() => toggleGroup(previewCalc.beneficiaries)}
                        />
                      </TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Asnaf</TableHead>
                      <TableHead>Prioritas</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewCalc.beneficiaries.map((b) => {
                      const isDistributed = distributedIds.has(b.mustahikId);
                      return (
                        <TableRow key={b.mustahikId} className={isDistributed ? "opacity-50" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={selectedRecipients.has(b.mustahikId) || isDistributed}
                              disabled={isDistributed}
                              onCheckedChange={() => toggleRecipient(b.mustahikId)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{b.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="rounded-full">
                              {getLabel(b.asnaf)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="rounded-full">
                              {PRIORITY_LABELS[b.priority] || b.priority}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatAmount(previewUnit, b.cashAmount || b.riceAmount || b.foodAmount)}
                          </TableCell>
                          <TableCell>
                            {isDistributed ? (
                              <Badge variant="outline" className="rounded-full">
                                Sudah disalurkan
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="rounded-full">
                                Belum
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {previewCalc.amil.length === 0 && previewCalc.beneficiaries.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Tidak ada penerima yang berhak, atau saldo dana kategori ini kosong.
              </p>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground tabular-nums">
              Terpilih {selectedRecipients.size} penerima · {formatAmount(previewUnit, previewSelectedValue)}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setIsPreviewOpen(false)}>
                Batal
              </Button>
              <Button
                className="rounded-xl"
                onClick={() => batchDistributeMutation.mutate()}
                disabled={selectedRecipients.size === 0 || isReadOnly || batchDistributeMutation.isPending}
              >
                {batchDistributeMutation.isPending ? "Menyalurkan..." : `Salurkan ${selectedRecipients.size} penerima`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingDistribution} onOpenChange={() => setViewingDistribution(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detail pendistribusian</DialogTitle>
          </DialogHeader>
          {viewingDistribution && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Tanggal</p>
                <p className="font-medium">
                  {format(new Date(viewingDistribution.distribution_date), "dd MMMM yyyy", { locale: idLocale })}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Penerima</p>
                <p className="font-medium">{viewingDistribution.mustahik?.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Asnaf</p>
                <p className="font-medium">{getLabel(viewingDistribution.mustahik?.asnaf || "")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Kategori</p>
                <p className="font-medium">{FUND_CATEGORY_LABELS[viewingDistribution.fund_category]}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Jumlah</p>
                <p className="text-xl font-semibold tabular-nums">
                  {formatAmount(
                    CATEGORY_UNIT[viewingDistribution.fund_category as FundCategory] || "cash",
                    (CATEGORY_UNIT[viewingDistribution.fund_category as FundCategory] || "cash") === "cash"
                      ? viewingDistribution.cash_amount || 0
                      : (CATEGORY_UNIT[viewingDistribution.fund_category as FundCategory] || "cash") === "rice"
                        ? viewingDistribution.rice_amount_kg || 0
                        : viewingDistribution.food_amount_kg || 0,
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge
                  variant={(STATUS_CONFIG[viewingDistribution.status] || { variant: "outline" as const }).variant}
                  className="rounded-full"
                >
                  {(STATUS_CONFIG[viewingDistribution.status] || { label: viewingDistribution.status }).label}
                </Badge>
              </div>
              {viewingDistribution.notes && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Catatan</p>
                  <p>{viewingDistribution.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

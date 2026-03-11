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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatCurrency";
import { Calculator, ClipboardList, Eye, PackageCheck, UserCheck, Users } from "lucide-react";
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

type DistributionTab = "distribution" | "assignment";
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

export default function Distribution() {
  const { isReadOnly, selectedPeriod } = usePeriod();
  const { toast } = useToast();
  const { getLabel } = useAsnafSettings();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<DistributionTab>("distribution");
  const [categoryFilter, setCategoryFilter] = useState<FundCategory | "all">("all");
  const [viewingDistribution, setViewingDistribution] = useState<Distribution | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewCategory, setPreviewCategory] = useState<FundCategory | "">("");
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");

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
    if (categoryFilter === "all") return mergedDistributions;
    return mergedDistributions.filter((d) => d.fund_category === categoryFilter);
  }, [categoryFilter, mergedDistributions]);

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
        .select("id, name, asnaf_id, priority, family_members, asnaf_settings(asnaf_code)")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("priority", { ascending: false })
        .order("name");
      if (error) throw error;
      return data as {
        id: string;
        name: string;
        asnaf_id: string;
        priority: string;
        family_members: number;
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
      toast({ title: "Batch berhasil disalurkan ke daftar distribusi" });
    },
    onError: (error: Error) => {
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

  const selectAll = (recipients: { mustahikId: string }[]) => {
    const distributed = allExistingDistributions
      .filter((d) => d.fund_category === previewCategory && (d.status === "distributed" || d.status === "approved"))
      .map((d) => d.mustahik_id);

    const eligible = recipients.filter((r) => !distributed.includes(r.mustahikId));
    setSelectedRecipients(new Set(eligible.map((r) => r.mustahikId)));
  };

  const renderBalanceCard = (category: FundCategory) => {
    const balance = getBalance(category);
    const isCash = category.includes("cash") || category === "zakat_mal";
    const isRice = category.includes("rice");
    const calc = getCalculatedDistribution(category);
    const totalRecipients = calc.amil.length + calc.beneficiaries.length;

    return (
      <Card key={category} className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{FUND_CATEGORY_LABELS[category]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xl font-semibold">
            {isCash ? formatCurrency(balance.total_cash) : isRice ? `${balance.total_rice_kg} kg` : `${balance.total_food_kg} kg`}
          </p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{totalRecipients} penerima siap distribusi</span>
            {!isReadOnly && totalRecipients > 0 && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openPreview(category)}>
                <Calculator className="mr-1 h-3 w-3" />
                Jalankan
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
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

  const renderDistributionTable = () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tanggal</TableHead>
          <TableHead>Penerima</TableHead>
          <TableHead>Asnaf</TableHead>
          <TableHead>Kategori</TableHead>
          <TableHead className="text-right">Jumlah</TableHead>
          <TableHead>Status Pendistribusian</TableHead>
          <TableHead>Status Pengiriman</TableHead>
          <TableHead className="text-right">Aksi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredDistributions.map((dist) => {
          const deliveryInfo = deliveryStatusMap.get(dist.mustahik_id);
          return (
            <TableRow key={dist.id}>
              <TableCell>{format(new Date(dist.distribution_date), "dd MMM yyyy", { locale: idLocale })}</TableCell>
              <TableCell className="font-medium">{dist.mustahik?.name}</TableCell>
              <TableCell>
                <Badge variant={dist.mustahik?.asnaf === "amil" ? "default" : "outline"}>
                  {getLabel(dist.mustahik?.asnaf || "")}
                </Badge>
              </TableCell>
              <TableCell>{FUND_CATEGORY_LABELS[dist.fund_category]}</TableCell>
              <TableCell className="text-right">
                {dist.fund_category.includes("cash") || dist.fund_category === "zakat_mal"
                  ? formatCurrency(dist.cash_amount || 0)
                  : dist.fund_category.includes("rice")
                    ? `${dist.rice_amount_kg || 0} kg`
                    : `${dist.food_amount_kg || 0} kg`}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_CONFIG[dist.status].variant}>{STATUS_CONFIG[dist.status].label}</Badge>
              </TableCell>
              <TableCell>
                {deliveryInfo ? (
                  <Badge variant={DELIVERY_STATUS_CONFIG[deliveryInfo.status]?.variant || "secondary"}>
                    {DELIVERY_STATUS_CONFIG[deliveryInfo.status]?.label || deliveryInfo.status}
                  </Badge>
                ) : (
                  <Badge variant="outline">Belum Ditugaskan</Badge>
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
  );

  const previewCalc = getCalculatedDistribution(previewCategory);
  const previewTotal = previewCalc.amilTotal + previewCalc.beneficiaryTotal;
  const previewAmilPercent = previewTotal > 0 ? (previewCalc.amilTotal / previewTotal) * 100 : 0;
  const previewBeneficiaryPercent = previewTotal > 0 ? (previewCalc.beneficiaryTotal / previewTotal) * 100 : 0;

  const distributedIds = new Set(
    allExistingDistributions
      .filter((d) => d.fund_category === previewCategory && (d.status === "distributed" || d.status === "approved"))
      .map((d) => d.mustahik_id),
  );

  return (
    <AppLayout title="Pendistribusian">
      {isReadOnly && <ReadOnlyBanner periodName={selectedPeriod?.name} />}

      <div className="space-y-4">
        <Card className="border-border/70 bg-gradient-to-r from-cyan-50 to-emerald-50">
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold">Eksekusi Pendistribusian Dana per Periode</h2>
              <p className="text-sm text-muted-foreground">
                Halaman ini fokus untuk eksekusi penyaluran dan penugasan pengiriman.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="outline">Mode: {amilDistributionMode === "percentage" ? "Persentase Tetap" : "Rasio x Faktor"}</Badge>
                <Badge variant="outline">Faktor: {amilShareFactor.toFixed(2)}</Badge>
              </div>
            </div>
            <Button asChild variant="outline">
              <Link href="/calculations">Buka Simulasi Perhitungan</Link>
            </Button>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DistributionTab)}>
          <TabsList>
            <TabsTrigger value="distribution" className="gap-1">
              <PackageCheck className="h-4 w-4" />
              Eksekusi
            </TabsTrigger>
            <TabsTrigger value="assignment" className="gap-1">
              <ClipboardList className="h-4 w-4" />
              Penugasan
            </TabsTrigger>
          </TabsList>

          <TabsContent value="distribution" className="space-y-4 mt-4">
            <Card className="border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Distribusi Berdasarkan Batch Lock</CardTitle>
                <CardDescription>
                  Pilih batch dari menu Perhitungan, lalu salurkan sekaligus agar dana batch tercatat ke distribusi.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Batch terkunci</p>
                    <Select value={selectedBatchId || ""} onValueChange={setSelectedBatchId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih batch" />
                      </SelectTrigger>
                      <SelectContent>
                        {lockedBatches.length === 0 ? (
                          <SelectItem value="__none" disabled>
                            Belum ada batch
                          </SelectItem>
                        ) : (
                          lockedBatches.map((batch) => (
                            <SelectItem key={batch.id} value={batch.id}>
                              {batch.batch_code || `BATCH-${batch.batch_no}`} • {BATCH_STATUS_LABELS[batch.status] || batch.status}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => distributeLockedBatchMutation.mutate()}
                    disabled={!selectedBatch || selectedBatch.status !== "locked" || distributeLockedBatchMutation.isPending || isReadOnly}
                  >
                    {distributeLockedBatchMutation.isPending ? "Menyalurkan..." : "Salurkan Batch"}
                  </Button>
                </div>

                {selectedBatch && selectedBatchSummary && (
                  <div className="grid gap-3 md:grid-cols-5">
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Kode Batch</p>
                      <p className="font-semibold">{selectedBatch.batch_code || `BATCH-${selectedBatch.batch_no}`}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Penerima</p>
                      <p className="font-semibold">{selectedBatchSummary.recipientCount}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Total Kas</p>
                      <p className="font-semibold">{formatCurrency(selectedBatchSummary.totalCash)}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Total Beras</p>
                      <p className="font-semibold">{selectedBatchSummary.totalRice.toFixed(2)} kg</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Total Makanan</p>
                      <p className="font-semibold">{selectedBatchSummary.totalFood.toFixed(2)} kg</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{allCategories.map(renderBalanceCard)}</div>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="text-base">Riwayat Pendistribusian</CardTitle>
                    <CardDescription>
                      Menampilkan seluruh distribusi zakat dan fidyah, tanpa duplikasi tab.
                    </CardDescription>
                  </div>
                  <div className="w-full md:w-[260px]">
                    <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as FundCategory | "all") }>
                      <SelectTrigger>
                        <SelectValue placeholder="Filter kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Kategori</SelectItem>
                        {allCategories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {FUND_CATEGORY_LABELS[cat]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredDistributions.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Belum ada distribusi untuk filter ini.</p>
                ) : (
                  renderDistributionTable()
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assignment" className="mt-4">
            {selectedPeriod?.id ? (
              <DistributionAssignmentTab periodId={selectedPeriod.id} isReadOnly={isReadOnly} />
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Pilih periode untuk melihat penugasan distribusi.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Eksekusi Pendistribusian - {FUND_CATEGORY_LABELS[previewCategory]}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {previewCalc.amil.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <UserCheck className="h-4 w-4" />
                    Amil ({previewAmilPercent.toFixed(1)}% = {previewCategory.includes("cash") || previewCategory === "zakat_mal"
                      ? formatCurrency(previewCalc.amilTotal)
                      : `${previewCalc.amilTotal.toFixed(2)} kg`})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={previewCalc.amil.every((a) => selectedRecipients.has(a.mustahikId) || distributedIds.has(a.mustahikId))}
                            onCheckedChange={() => {
                              const eligible = previewCalc.amil.filter((a) => !distributedIds.has(a.mustahikId));
                              if (eligible.every((a) => selectedRecipients.has(a.mustahikId))) {
                                const newSet = new Set(selectedRecipients);
                                eligible.forEach((a) => newSet.delete(a.mustahikId));
                                setSelectedRecipients(newSet);
                              } else {
                                const newSet = new Set(selectedRecipients);
                                eligible.forEach((a) => newSet.add(a.mustahikId));
                                setSelectedRecipients(newSet);
                              }
                            }}
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
                            <TableCell className="text-right">
                              {a.cashAmount > 0 ? formatCurrency(a.cashAmount) : `${a.riceAmount || a.foodAmount} kg`}
                            </TableCell>
                            <TableCell>
                              {isDistributed ? <Badge variant="outline">Sudah Disalurkan</Badge> : <Badge variant="secondary">Belum</Badge>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {previewCalc.beneficiaries.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4" />
                    Mustahik ({previewBeneficiaryPercent.toFixed(1)}% = {previewCategory.includes("cash") || previewCategory === "zakat_mal"
                      ? formatCurrency(previewCalc.beneficiaryTotal)
                      : `${previewCalc.beneficiaryTotal.toFixed(2)} kg`})
                  </CardTitle>
                  <CardDescription>
                    {amilDistributionMode === "proportional_with_factor"
                      ? "Sisa dana setelah porsi amil akan dibagi rata ke mustahik non-amil."
                      : "Pembagian mustahik non-amil berdasarkan prioritas dan jumlah keluarga."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-2">
                    <Button variant="outline" size="sm" onClick={() => selectAll(previewCalc.beneficiaries)}>
                      Pilih Semua yang Belum Disalurkan
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={previewCalc.beneficiaries.every((b) => selectedRecipients.has(b.mustahikId) || distributedIds.has(b.mustahikId))}
                            onCheckedChange={() => {
                              const eligible = previewCalc.beneficiaries.filter((b) => !distributedIds.has(b.mustahikId));
                              if (eligible.every((b) => selectedRecipients.has(b.mustahikId))) {
                                const newSet = new Set(selectedRecipients);
                                eligible.forEach((b) => newSet.delete(b.mustahikId));
                                setSelectedRecipients(newSet);
                              } else {
                                const newSet = new Set(selectedRecipients);
                                eligible.forEach((b) => newSet.add(b.mustahikId));
                                setSelectedRecipients(newSet);
                              }
                            }}
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
                              <Badge variant="outline">{getLabel(b.asnaf)}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{PRIORITY_LABELS[b.priority] || b.priority}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {b.cashAmount > 0 ? formatCurrency(b.cashAmount) : `${b.riceAmount || b.foodAmount} kg`}
                            </TableCell>
                            <TableCell>
                              {isDistributed ? <Badge variant="outline">Sudah Disalurkan</Badge> : <Badge variant="secondary">Belum</Badge>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {previewCalc.amil.length === 0 && previewCalc.beneficiaries.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">Tidak ada penerima yang layak terima atau saldo dana kosong.</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={() => batchDistributeMutation.mutate()}
              disabled={selectedRecipients.size === 0 || batchDistributeMutation.isPending}
            >
              Salurkan ({selectedRecipients.size} penerima)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingDistribution} onOpenChange={() => setViewingDistribution(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detail Pendistribusian</DialogTitle>
          </DialogHeader>
          {viewingDistribution && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Tanggal</p>
                  <p className="font-medium">
                    {format(new Date(viewingDistribution.distribution_date), "dd MMMM yyyy", { locale: idLocale })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Penerima</p>
                  <p className="font-medium">{viewingDistribution.mustahik?.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Asnaf</p>
                  <p className="font-medium">{getLabel(viewingDistribution.mustahik?.asnaf || "")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Kategori</p>
                  <p className="font-medium">{FUND_CATEGORY_LABELS[viewingDistribution.fund_category]}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Jumlah</p>
                  <p className="text-xl font-bold">
                    {viewingDistribution.fund_category.includes("cash") || viewingDistribution.fund_category === "zakat_mal"
                      ? formatCurrency(viewingDistribution.cash_amount || 0)
                      : viewingDistribution.fund_category.includes("rice")
                        ? `${viewingDistribution.rice_amount_kg || 0} kg`
                        : `${viewingDistribution.food_amount_kg || 0} kg`}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant={STATUS_CONFIG[viewingDistribution.status].variant}>
                    {STATUS_CONFIG[viewingDistribution.status].label}
                  </Badge>
                </div>
                {viewingDistribution.notes && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Catatan</p>
                    <p>{viewingDistribution.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

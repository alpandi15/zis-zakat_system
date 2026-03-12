import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ReadOnlyBanner } from "@/components/shared/ReadOnlyBanner";
import { usePeriod } from "@/contexts/PeriodContext";
import { useDistributionCalculation, type AmilDistributionMode } from "@/hooks/useDistributionCalculation";
import type { Enums, TablesInsert } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatCurrency";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calculator, Coins, Wheat, Utensils, Scale, ArrowRight, Sparkles, Lock, Info } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface FundBalance {
  category: FundCategory;
  total_cash: number;
  total_rice_kg: number;
  total_food_kg: number;
}

interface FundLedgerRow {
  category: FundCategory;
  amount_cash: number | null;
  amount_rice_kg: number | null;
  amount_food_kg: number | null;
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

export default function Calculations() {
  const { selectedPeriod, isReadOnly } = usePeriod();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [amilDistributionMode, setAmilDistributionMode] = useState<AmilDistributionMode>("percentage");
  const [amilShareFactor, setAmilShareFactor] = useState(0.5);
  const [batchNotes, setBatchNotes] = useState("");

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

  const { data: inflowRows = [] } = useQuery({
    queryKey: ["fund-inflow-for-batch", selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];

      const { data, error } = await supabase
        .from("fund_ledger")
        .select("category, amount_cash, amount_rice_kg, amount_food_kg")
        .eq("period_id", selectedPeriod.id)
        .in("transaction_type", ["collection", "adjustment", "transfer_in"]);

      if (error) throw error;
      return data as FundLedgerRow[];
    },
    enabled: !!selectedPeriod?.id,
  });

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

  const inflowBalanceMap = useMemo(() => {
    const map = createEmptyBalanceMap();

    inflowRows.forEach((row) => {
      const current = map.get(row.category);
      if (!current) return;

      current.total_cash += Math.max(0, Number(row.amount_cash || 0));
      current.total_rice_kg += Math.max(0, Number(row.amount_rice_kg || 0));
      current.total_food_kg += Math.max(0, Number(row.amount_food_kg || 0));
    });

    return map;
  }, [inflowRows]);

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
      const inflow = inflowBalanceMap.get(category) || {
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
  }, [inflowBalanceMap, lockedBalanceMap]);

  const calculations = useDistributionCalculation(mustahikList, availableForNextBatch, [], {
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
      const inflow = inflowBalanceMap.get(category) || { total_cash: 0, total_rice_kg: 0, total_food_kg: 0 };
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
  }, [calculations, availableForNextBatch, inflowBalanceMap, lockedBalanceMap]);

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
      </div>
    </AppLayout>
  );
}

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ReadOnlyBanner } from "@/components/shared/ReadOnlyBanner";
import { DistributionPreviewTab } from "@/components/distribution/DistributionPreviewTab";
import { usePeriod } from "@/contexts/PeriodContext";
import { useDistributionCalculation, type AmilDistributionMode } from "@/hooks/useDistributionCalculation";
import type { Enums } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatCurrency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, Coins, Wheat, Utensils, Scale, ArrowRight, Sparkles } from "lucide-react";

interface FundBalance {
  category: string;
  total_cash: number;
  total_rice_kg: number;
  total_food_kg: number;
}

type FundCategory = Enums<"fund_category">;

const normalizeAmilMode = (mode: string | null | undefined): AmilDistributionMode =>
  mode === "proportional_with_factor" ? "proportional_with_factor" : "percentage";

const normalizeAmilShareFactor = (factor: number | null | undefined): number => {
  if (typeof factor !== "number" || Number.isNaN(factor)) return 0.5;
  return Math.max(0, Math.min(1, factor));
};

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

export default function Calculations() {
  const { selectedPeriod, isReadOnly } = usePeriod();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [amilDistributionMode, setAmilDistributionMode] = useState<AmilDistributionMode>("percentage");
  const [amilShareFactor, setAmilShareFactor] = useState(0.5);

  const periodMode = normalizeAmilMode(selectedPeriod?.amil_distribution_mode);
  const periodShareFactor = normalizeAmilShareFactor(selectedPeriod?.amil_share_factor);
  const isConfigChanged = Math.abs(amilShareFactor - periodShareFactor) > 0.0001 || amilDistributionMode !== periodMode;

  useEffect(() => {
    setAmilDistributionMode(periodMode);
    setAmilShareFactor(periodShareFactor);
  }, [periodMode, periodShareFactor, selectedPeriod?.id]);

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

  const { data: zakatDist = [] } = useQuery({
    queryKey: ["zakat_distributions", selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];
      const { data, error } = await supabase
        .from("zakat_distributions")
        .select("mustahik_id, fund_category, status")
        .eq("period_id", selectedPeriod.id);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedPeriod?.id,
  });

  const { data: fidyahDist = [] } = useQuery({
    queryKey: ["fidyah_distributions", selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];
      const { data, error } = await supabase
        .from("fidyah_distributions")
        .select("mustahik_id, fund_category, status")
        .eq("period_id", selectedPeriod.id);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedPeriod?.id,
  });

  const existingDistributions = useMemo(() => {
    return [...zakatDist, ...fidyahDist].map((d) => ({
      mustahik_id: d.mustahik_id,
      fund_category: d.fund_category,
      status: d.status,
    }));
  }, [zakatDist, fidyahDist]);

  const calculations = useDistributionCalculation(mustahikList, fundBalances, existingDistributions, {
    amilDistributionMode,
    amilShareFactor,
  });

  const categorySummaries = useMemo(() => {
    const map = {
      zakat_fitrah_cash: calculations.zakatFitrahCash,
      zakat_fitrah_rice: calculations.zakatFitrahRice,
      zakat_mal: calculations.zakatMal,
      fidyah_cash: calculations.fidyahCash,
      fidyah_food: calculations.fidyahFood,
    };

    return (Object.keys(CATEGORY_META) as FundCategory[]).map((category) => {
      const summary = map[category];
      const meta = CATEGORY_META[category];
      const balance = fundBalances.find((b) => b.category === category) || {
        total_cash: 0,
        total_rice_kg: 0,
        total_food_kg: 0,
      };
      const totalRecipients = summary.amil.length + summary.beneficiaries.length;

      const availableAmount =
        meta.unit === "cash"
          ? formatCurrency(balance.total_cash)
          : meta.unit === "rice"
            ? `${balance.total_rice_kg} kg`
            : `${balance.total_food_kg} kg`;

      const allocatedAmount =
        meta.unit === "cash"
          ? formatCurrency(summary.amilTotal + summary.beneficiaryTotal)
          : `${(summary.amilTotal + summary.beneficiaryTotal).toFixed(2)} kg`;

      return {
        category,
        meta,
        availableAmount,
        allocatedAmount,
        totalRecipients,
        amilRecipients: summary.amil.length,
        mustahikRecipients: summary.beneficiaries.length,
      };
    });
  }, [calculations, fundBalances]);

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
                  SIMULASI OTOMATIS
                </div>
                <h2 className="text-2xl font-semibold md:text-3xl">Simulasi alokasi zakat dan fidyah lebih cepat</h2>
                <p className="max-w-2xl text-sm text-white/90 md:text-base">
                  Simulasi mengikuti saldo dana periode terpilih, aturan asnaf, prioritas mustahik, dan konfigurasi porsi amil.
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
              Pengaturan ini tersimpan di periode aktif dan dipakai untuk seluruh simulasi alokasi zakat.
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

        <section className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold">Ringkasan Hasil Simulasi</h3>
            <p className="text-sm text-muted-foreground">
              Nilai di bawah adalah hasil simulasi saat ini berdasarkan saldo dana yang sudah tercatat.
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
                    <CardTitle className="text-base">{item.availableAmount}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs text-muted-foreground">
                    <p>Alokasi simulasi: <span className="font-medium text-foreground">{item.allocatedAmount}</span></p>
                    <div className="flex items-center justify-between">
                      <span>Total penerima</span>
                      <span className="font-medium text-foreground">{item.totalRecipients}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Amil</span>
                      <span className="font-medium text-foreground">{item.amilRecipients}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Mustahik lain</span>
                      <span className="font-medium text-foreground">{item.mustahikRecipients}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {selectedPeriod?.id ? (
          <DistributionPreviewTab
            periodId={selectedPeriod.id}
            amilDistributionMode={amilDistributionMode}
            amilShareFactor={amilShareFactor}
          />
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Pilih periode terlebih dahulu untuk melihat simulasi.
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

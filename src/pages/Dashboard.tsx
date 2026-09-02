import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { AnimatedNumber, StatTile } from "@/components/shared/PageHeader";
import { usePeriod } from "@/contexts/PeriodContext";
import { usePeriodSummary, useZakatVsFidyahComparison } from "@/hooks/useDashboardData";
import { useTvViewerPresence } from "@/hooks/useTvViewerPresence";
import { PeriodSelector } from "@/components/dashboard/PeriodSelector";
import { FundComparisonChart } from "@/components/dashboard/FundComparisonChart";
import { formatCurrency, formatWeight } from "@/lib/exportUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  ArrowRight,
  Banknote,
  Calculator,
  Coins,
  ExternalLink,
  Eye,
  FileBarChart,
  Heart,
  Monitor,
  Package,
  TrendingUp,
  Users,
  Wheat,
  Wifi,
} from "lucide-react";

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

const toNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const QUICK_ACTIONS = [
  {
    title: "Zakat Fitrah",
    url: "/zakat-fitrah",
    icon: Wheat,
    tone: "bg-gradient-to-br from-emerald-500 to-emerald-400 shadow-emerald-500/30",
    glow: "bg-emerald-500/25",
  },
  {
    title: "Zakat Mal",
    url: "/zakat-mal",
    icon: Coins,
    tone: "bg-gradient-to-br from-sky-500 to-sky-400 shadow-sky-500/30",
    glow: "bg-sky-500/25",
  },
  {
    title: "Fidyah",
    url: "/fidyah",
    icon: Heart,
    tone: "bg-gradient-to-br from-rose-500 to-rose-400 shadow-rose-500/30",
    glow: "bg-rose-500/25",
  },
  {
    title: "Perhitungan",
    url: "/calculations",
    icon: Calculator,
    tone: "bg-gradient-to-br from-violet-500 to-violet-400 shadow-violet-500/30",
    glow: "bg-violet-500/25",
  },
  {
    title: "Distribusi",
    url: "/distribution",
    icon: Package,
    tone: "bg-gradient-to-br from-amber-500 to-amber-400 shadow-amber-500/30",
    glow: "bg-amber-500/25",
  },
  {
    title: "Laporan",
    url: "/reports",
    icon: FileBarChart,
    tone: "bg-gradient-to-br from-cyan-500 to-cyan-400 shadow-cyan-500/30",
    glow: "bg-cyan-500/25",
  },
];

const ACTIVITY_TONES: Record<string, string> = {
  "Zakat Fitrah": "bg-gradient-to-br from-emerald-500 to-emerald-400",
  "Zakat Mal": "bg-gradient-to-br from-sky-500 to-sky-400",
  Fidyah: "bg-gradient-to-br from-rose-500 to-rose-400",
};

/** Keliling lingkaran progres pada hero (r = 42). */
const RING_CIRCUMFERENCE = 2 * Math.PI * 42;

interface RecentActivityItem {
  id: string;
  jenis: string;
  nama: string;
  nilai: string;
  waktu: string;
  timestamp: number;
}

/** Bar progres penyaluran terhadap penerimaan. */
function ProgressRow({
  label,
  received,
  distributed,
  render,
  barClass,
}: {
  label: string;
  received: number;
  distributed: number;
  render: (value: number) => string;
  barClass: string;
}) {
  const percentage = received > 0 ? Math.min(100, (distributed / received) * 100) : 0;
  const remaining = Math.max(0, received - distributed);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-foreground sm:text-sm">{label}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {render(distributed)} dari {render(received)}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${barClass}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{percentage.toFixed(1)}% tersalurkan</span>
        <span>Sisa {render(remaining)}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const { periods, selectedPeriod, setSelectedPeriodId, isLoading: periodsLoading } = usePeriod();
  const isAdminUser = isAdmin();
  const periodId = selectedPeriod?.id || null;

  const [showAllViewers, setShowAllViewers] = useState(false);

  const { data: summary, isLoading: summaryLoading } = usePeriodSummary(periodId);
  const { data: comparison, isLoading: comparisonLoading } = useZakatVsFidyahComparison(periodId);
  const { viewers: tvViewers, viewerCount, isConnected: isTvPresenceConnected } = useTvViewerPresence(isAdminUser);

  /** Penyaluran yang benar-benar sudah tersalurkan pada periode aktif. */
  const { data: distributionTotals } = useQuery({
    queryKey: ["dashboard-distribution-totals", periodId],
    queryFn: async () => {
      if (!periodId) return { cash: 0, rice: 0, food: 0, recipients: 0, count: 0 };

      const [zakat, fidyah] = await Promise.all([
        supabase
          .from("zakat_distributions")
          .select("mustahik_id, cash_amount, rice_amount_kg")
          .eq("period_id", periodId)
          .eq("status", "distributed"),
        supabase
          .from("fidyah_distributions")
          .select("mustahik_id, cash_amount, food_amount_kg")
          .eq("period_id", periodId)
          .eq("status", "distributed"),
      ]);

      if (zakat.error) throw zakat.error;
      if (fidyah.error) throw fidyah.error;

      const recipients = new Set<string>();
      let cash = 0;
      let rice = 0;
      let food = 0;

      (zakat.data || []).forEach((row) => {
        cash += toNumber(row.cash_amount);
        rice += toNumber(row.rice_amount_kg);
        recipients.add(row.mustahik_id);
      });
      (fidyah.data || []).forEach((row) => {
        cash += toNumber(row.cash_amount);
        food += toNumber(row.food_amount_kg);
        recipients.add(row.mustahik_id);
      });

      return {
        cash,
        rice,
        food,
        recipients: recipients.size,
        count: (zakat.data?.length || 0) + (fidyah.data?.length || 0),
      };
    },
    enabled: !!periodId,
  });

  /** Transaksi terbaru dari tiga jenis penerimaan. */
  const { data: recentActivity = [] } = useQuery({
    queryKey: ["dashboard-recent-activity", periodId],
    queryFn: async (): Promise<RecentActivityItem[]> => {
      if (!periodId) return [];

      const [fitrah, mal, fidyah] = await Promise.all([
        supabase
          .from("zakat_fitrah_transactions")
          .select("id, transaction_date, money_amount, rice_amount_kg, payment_type, muzakki:muzakki_id(name)")
          .eq("period_id", periodId)
          .eq("is_void", false)
          .order("transaction_date", { ascending: false })
          .limit(5),
        supabase
          .from("zakat_mal_transactions")
          .select("id, transaction_date, final_zakat_amount, muzakki:muzakki_id(name)")
          .eq("period_id", periodId)
          .eq("is_void", false)
          .order("transaction_date", { ascending: false })
          .limit(5),
        supabase
          .from("fidyah_transactions")
          .select("id, transaction_date, payer_name, cash_amount, food_amount_kg, payment_type")
          .eq("period_id", periodId)
          .eq("is_void", false)
          .order("transaction_date", { ascending: false })
          .limit(5),
      ]);

      const items: RecentActivityItem[] = [];

      ((fitrah.data || []) as unknown as {
        id: string;
        transaction_date: string;
        money_amount: number | null;
        rice_amount_kg: number | null;
        payment_type: string;
        muzakki: { name: string } | null;
      }[]).forEach((row) => {
        items.push({
          id: `zf-${row.id}`,
          jenis: "Zakat Fitrah",
          nama: row.muzakki?.name || "-",
          nilai:
            row.payment_type === "rice"
              ? formatWeight(toNumber(row.rice_amount_kg))
              : formatCurrency(toNumber(row.money_amount)),
          waktu: formatDateTime(row.transaction_date),
          timestamp: new Date(row.transaction_date).getTime(),
        });
      });

      ((mal.data || []) as unknown as {
        id: string;
        transaction_date: string;
        final_zakat_amount: number;
        muzakki: { name: string } | null;
      }[]).forEach((row) => {
        items.push({
          id: `zm-${row.id}`,
          jenis: "Zakat Mal",
          nama: row.muzakki?.name || "-",
          nilai: formatCurrency(toNumber(row.final_zakat_amount)),
          waktu: formatDateTime(row.transaction_date),
          timestamp: new Date(row.transaction_date).getTime(),
        });
      });

      ((fidyah.data || []) as unknown as {
        id: string;
        transaction_date: string;
        payer_name: string;
        cash_amount: number | null;
        food_amount_kg: number | null;
        payment_type: string;
      }[]).forEach((row) => {
        items.push({
          id: `fd-${row.id}`,
          jenis: "Fidyah",
          nama: row.payer_name || "-",
          nilai:
            row.payment_type === "food"
              ? formatWeight(toNumber(row.food_amount_kg))
              : formatCurrency(toNumber(row.cash_amount)),
          waktu: formatDateTime(row.transaction_date),
          timestamp: new Date(row.transaction_date).getTime(),
        });
      });

      return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
    },
    enabled: !!periodId,
  });

  const ricePerPerson = selectedPeriod?.rice_amount_per_person ?? 2.5;
  const cashPerPerson = selectedPeriod?.cash_amount_per_person ?? 35000;
  const fidyahDailyRate = selectedPeriod?.fidyah_daily_rate ?? 35000;
  const nisabValue = 85 * (selectedPeriod?.nisab_gold_price_per_gram ?? 1200000);

  const totals = useMemo(() => {
    const cash = toNumber(summary?.total_combined_cash);
    const rice = toNumber(summary?.zakat_fitrah_rice_kg);
    const food = toNumber(summary?.fidyah_food_kg);

    return {
      cash,
      rice,
      food,
      distributedCash: distributionTotals?.cash || 0,
      distributedRice: distributionTotals?.rice || 0,
      distributedFood: distributionTotals?.food || 0,
    };
  }, [summary, distributionTotals]);

  const cashProgress = totals.cash > 0 ? Math.min(100, (totals.distributedCash / totals.cash) * 100) : 0;
  const riceProgress = totals.rice > 0 ? Math.min(100, (totals.distributedRice / totals.rice) * 100) : 0;

  const visibleViewers = showAllViewers ? tvViewers : tvViewers.slice(0, 4);

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-4">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.13] via-card to-sky-500/[0.08] p-4 opacity-0 shadow-sm animate-rise motion-reduce:animate-none motion-reduce:opacity-100 sm:p-6">
          <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl animate-aurora" />
          <div
            className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-sky-500/15 blur-3xl animate-aurora"
            style={{ animationDelay: "-7s" }}
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(hsl(var(--foreground)/0.03)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--foreground)/0.03)_1px,transparent_1px)] bg-[size:46px_46px] [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_72%)]" />

          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 animate-glow-pulse" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  </span>
                  {selectedPeriod?.status === "archived" ? "Periode arsip" : "Periode aktif"}
                </span>
                {selectedPeriod && (
                  <Badge variant="outline" className="rounded-full bg-background/70 text-[11px]">
                    {selectedPeriod.hijri_year} H / {selectedPeriod.gregorian_year} M
                  </Badge>
                )}
              </div>

              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Total kas terkumpul
              </p>
              <AnimatedNumber
                value={totals.cash}
                format={formatCurrency}
                className="mt-0.5 block text-3xl font-semibold tracking-tight tabular-nums text-foreground sm:text-4xl"
              />
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                {selectedPeriod?.name || "Pilih periode"} · zakat fitrah, zakat mal, dan fidyah
                {summaryLoading ? " · memuat..." : ""}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/70 px-2.5 py-1.5 text-xs backdrop-blur">
                  <Wheat className="h-3.5 w-3.5 text-amber-600" />
                  <span className="font-medium tabular-nums">{formatWeight(totals.rice)}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/70 px-2.5 py-1.5 text-xs backdrop-blur">
                  <Package className="h-3.5 w-3.5 text-violet-600" />
                  <span className="font-medium tabular-nums">{formatWeight(totals.food)}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/70 px-2.5 py-1.5 text-xs backdrop-blur">
                  <Users className="h-3.5 w-3.5 text-sky-600" />
                  <span className="font-medium tabular-nums">
                    {(summary?.total_muzakki_households || 0).toLocaleString("id-ID")} muzakki
                  </span>
                </span>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-stretch gap-3 xl:items-end">
              {/* Cincin progres penyaluran */}
              <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-background/70 p-3 backdrop-blur">
                <div className="relative h-[74px] w-[74px] shrink-0">
                  <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                    <circle cx="50" cy="50" r="42" className="fill-none stroke-foreground/10" strokeWidth="10" />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      className="fill-none stroke-emerald-500 transition-[stroke-dashoffset] duration-1000 ease-out"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={RING_CIRCUMFERENCE}
                      strokeDashoffset={RING_CIRCUMFERENCE * (1 - cashProgress / 100)}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-sm font-semibold tabular-nums">{cashProgress.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Kas tersalurkan
                  </p>
                  <p className="text-base font-semibold tabular-nums">{formatCurrency(totals.distributedCash)}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    Sisa {formatCurrency(Math.max(0, totals.cash - totals.distributedCash))}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <PeriodSelector
                  periods={periods}
                  selectedPeriod={periodId}
                  onPeriodChange={setSelectedPeriodId}
                  isLoading={periodsLoading}
                />
                <Button asChild variant="outline" className="h-10 gap-2 rounded-xl bg-background/70 backdrop-blur">
                  <Link href="/tv" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Live
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* KPI */}
        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile
            label="Kas Terkumpul"
            value={formatCurrency(totals.cash)}
            hint="ZF + zakat mal + fidyah"
            icon={Banknote}
            tone="primary"
            progress={cashProgress}
            delay={60}
          />
          <StatTile
            label="Beras Terkumpul"
            value={formatWeight(totals.rice)}
            hint={`Acuan ${ricePerPerson} kg/jiwa`}
            icon={Wheat}
            tone="amber"
            progress={riceProgress}
            delay={120}
          />
          <StatTile
            label="Muzakki Keluarga"
            value={(summary?.total_muzakki_households || 0).toLocaleString("id-ID")}
            hint={`${(summary?.total_jiwa_fitrah || 0).toLocaleString("id-ID")} jiwa fitrah`}
            icon={Users}
            tone="sky"
            delay={180}
          />
          <StatTile
            label="Mustahik Menerima"
            value={(distributionTotals?.recipients || 0).toLocaleString("id-ID")}
            hint={`${(distributionTotals?.count || 0).toLocaleString("id-ID")} penyaluran`}
            icon={Package}
            tone="violet"
            delay={240}
          />
        </section>

        <div className="grid gap-3 xl:grid-cols-[1.15fr_1fr]">
          {/* Progres penyaluran */}
          <Card
            style={{ animationDelay: "300ms" }}
            className="border-border/70 opacity-0 shadow-sm animate-rise motion-reduce:animate-none motion-reduce:opacity-100"
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-400 p-1.5 text-white shadow-md shadow-emerald-500/25">
                  <TrendingUp className="h-4 w-4" />
                </span>
                Progres penyaluran
              </CardTitle>
              <CardDescription>Dana yang sudah disalurkan dibanding penerimaan periode ini.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ProgressRow
                label="Uang"
                received={totals.cash}
                distributed={totals.distributedCash}
                render={formatCurrency}
                barClass="bg-gradient-to-r from-emerald-500 to-emerald-400"
              />
              <ProgressRow
                label="Beras zakat fitrah"
                received={totals.rice}
                distributed={totals.distributedRice}
                render={(value) => formatWeight(value)}
                barClass="bg-gradient-to-r from-amber-500 to-amber-400"
              />
              <ProgressRow
                label="Makanan fidyah"
                received={totals.food}
                distributed={totals.distributedFood}
                render={(value) => formatWeight(value)}
                barClass="bg-gradient-to-r from-violet-500 to-violet-400"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                <p className="text-[11px] text-muted-foreground">
                  Hanya penyaluran berstatus &quot;Disalurkan&quot; yang dihitung.
                </p>
                <Button asChild variant="ghost" size="sm" className="h-8 rounded-lg text-xs">
                  <Link href="/distribution">
                    Buka pendistribusian
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Aksi cepat + acuan */}
          <div className="grid gap-3">
            <Card
              style={{ animationDelay: "360ms" }}
              className="border-border/70 opacity-0 shadow-sm animate-rise motion-reduce:animate-none motion-reduce:opacity-100"
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Aksi cepat</CardTitle>
                <CardDescription>Menu yang paling sering dipakai panitia.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  {QUICK_ACTIONS.map((action) => (
                    <Link
                      key={action.url}
                      href={action.url}
                      className="group relative flex flex-col items-center gap-2 overflow-hidden rounded-2xl border border-border/60 bg-card p-3 text-center transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg"
                    >
                      <span
                        className={`pointer-events-none absolute -right-6 -top-8 h-16 w-16 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100 ${action.glow}`}
                      />
                      <span
                        className={`relative rounded-xl p-2 text-white shadow-md transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 ${action.tone}`}
                      >
                        <action.icon className="h-4 w-4" />
                      </span>
                      <span className="relative text-[11px] font-medium leading-tight">{action.title}</span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card
              style={{ animationDelay: "420ms" }}
              className="border-border/70 opacity-0 shadow-sm animate-rise motion-reduce:animate-none motion-reduce:opacity-100"
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Acuan periode</CardTitle>
                <CardDescription>Nilai yang dipakai saat menghitung transaksi.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Beras / jiwa", value: `${ricePerPerson} kg` },
                    { label: "Uang / jiwa", value: formatCurrency(cashPerPerson) },
                    { label: "Fidyah / hari", value: formatCurrency(fidyahDailyRate) },
                    { label: "Nisab zakat mal", value: formatCurrency(nisabValue) },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl border border-border/60 bg-gradient-to-br from-muted/50 to-transparent p-2.5"
                    >
                      <p className="text-[11px] text-muted-foreground">{item.label}</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums">{item.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Aktivitas terbaru */}
        <Card style={{ animationDelay: "480ms" }} className="border-border/70 opacity-0 shadow-sm animate-rise motion-reduce:animate-none motion-reduce:opacity-100">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="rounded-lg bg-gradient-to-br from-sky-500 to-sky-400 p-1.5 text-white shadow-md shadow-sky-500/25">
                <Activity className="h-4 w-4" />
              </span>
              Aktivitas terbaru
            </CardTitle>
            <CardDescription>Delapan penerimaan terakhir dari seluruh jenis transaksi.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Belum ada transaksi pada periode ini.</p>
            ) : (
              <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60">
                {recentActivity.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${
                          ACTIVITY_TONES[item.jenis] || "bg-slate-500"
                        }`}
                      >
                        {item.jenis === "Zakat Fitrah" ? (
                          <Wheat className="h-4 w-4" />
                        ) : item.jenis === "Zakat Mal" ? (
                          <Coins className="h-4 w-4" />
                        ) : (
                          <Heart className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.nama}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {item.jenis} · {item.waktu}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{item.nilai}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <FundComparisonChart data={comparison} isLoading={comparisonLoading} />

        {/* Monitoring viewer TV (admin) */}
        {isAdminUser && (
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="rounded-lg bg-gradient-to-br from-violet-500 to-violet-400 p-1.5 text-white shadow-md shadow-violet-500/25">
                      <Eye className="h-4 w-4" />
                    </span>
                    Monitoring viewer live
                  </CardTitle>
                  <CardDescription>Perangkat yang sedang membuka halaman /tv.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="gap-1 rounded-full">
                    <Monitor className="h-3.5 w-3.5" />
                    {viewerCount} viewer
                  </Badge>
                  <Badge variant={isTvPresenceConnected ? "default" : "secondary"} className="gap-1 rounded-full">
                    <Wifi className="h-3.5 w-3.5" />
                    {isTvPresenceConnected ? "Terhubung" : "Menghubungkan..."}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {tvViewers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  Belum ada perangkat yang membuka live monitoring.
                </div>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {visibleViewers.map((viewer) => (
                      <div
                        key={viewer.id}
                        className="rounded-2xl border border-border/60 bg-gradient-to-br from-muted/40 to-transparent p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold">{viewer.deviceLabel || "Perangkat"}</p>
                          <Badge variant="outline" className="shrink-0 rounded-full text-[10px]">
                            {viewer.deviceType || "device"}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">
                          {viewer.browser || "Browser"} · {viewer.os || "OS"}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          Masuk {formatDateTime(viewer.onlineAt)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {tvViewers.length > 4 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-8 rounded-lg text-xs"
                      onClick={() => setShowAllViewers((prev) => !prev)}
                    >
                      {showAllViewers ? "Tampilkan lebih sedikit" : `Lihat semua (${tvViewers.length})`}
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {!selectedPeriod && !periodsLoading && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Activity className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Pilih periode untuk menampilkan ringkasan.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Activity,
  Banknote,
  Calendar,
  Clock3,
  HandCoins,
  Package,
  RefreshCw,
  Scale,
  Sparkles,
  TrendingUp,
  Users,
  Wheat,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface FundBalance {
  category: string;
  total_cash: number;
  total_rice_kg: number;
  total_food_kg: number;
}

interface ZakatFitrahTx {
  muzakki_id: string | null;
  money_amount: number | null;
  rice_amount_kg: number | null;
  transaction_date: string;
}

interface ZakatMalTx {
  final_zakat_amount: number | null;
  transaction_date: string;
}

interface FidyahTx {
  cash_amount: number | null;
  food_amount_kg: number | null;
  transaction_date: string;
}

const CASH_COLORS = ["#16a34a", "#0ea5e9", "#f59e0b"];

const toNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value));

const formatWeight = (value: number): string =>
  `${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)} kg`;

const formatDateTime = (value: string | null): string => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const getLatestDate = (rows: { transaction_date: string }[]): string | null => {
  if (rows.length === 0) return null;
  return rows.reduce((latest, current) =>
    new Date(current.transaction_date).getTime() > new Date(latest).getTime()
      ? current.transaction_date
      : latest,
  rows[0].transaction_date);
};

const getEarliestDate = (rows: { transaction_date: string }[]): string | null => {
  if (rows.length === 0) return null;
  return rows.reduce((earliest, current) =>
    new Date(current.transaction_date).getTime() < new Date(earliest).getTime()
      ? current.transaction_date
      : earliest,
  rows[0].transaction_date);
};

function usePublicDashboardData() {
  return useQuery({
    queryKey: ["public-tv-dashboard"],
    queryFn: async () => {
      const { data: period, error: periodError } = await supabase
        .from("periods")
        .select("*")
        .eq("status", "active")
        .order("hijri_year", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (periodError) throw periodError;
      if (!period) return null;

      const [balancesRes, fitrahRes, malRes, fidyahRes, zakatDistRes, fidyahDistRes] = await Promise.all([
        supabase.rpc("get_all_fund_balances", { _period_id: period.id }),
        supabase
          .from("zakat_fitrah_transactions")
          .select("muzakki_id, money_amount, rice_amount_kg, transaction_date")
          .eq("period_id", period.id),
        supabase
          .from("zakat_mal_transactions")
          .select("final_zakat_amount, transaction_date")
          .eq("period_id", period.id),
        supabase
          .from("fidyah_transactions")
          .select("cash_amount, food_amount_kg, transaction_date")
          .eq("period_id", period.id),
        supabase
          .from("zakat_distributions")
          .select("id", { count: "exact", head: true })
          .eq("period_id", period.id)
          .eq("status", "distributed"),
        supabase
          .from("fidyah_distributions")
          .select("id", { count: "exact", head: true })
          .eq("period_id", period.id)
          .eq("status", "distributed"),
      ]);

      if (balancesRes.error) throw balancesRes.error;
      if (fitrahRes.error) throw fitrahRes.error;
      if (malRes.error) throw malRes.error;
      if (fidyahRes.error) throw fidyahRes.error;
      if (zakatDistRes.error) throw zakatDistRes.error;
      if (fidyahDistRes.error) throw fidyahDistRes.error;

      const balances = (balancesRes.data || []) as FundBalance[];
      const fitrahTransactions = (fitrahRes.data || []) as ZakatFitrahTx[];
      const malTransactions = (malRes.data || []) as ZakatMalTx[];
      const fidyahTransactions = (fidyahRes.data || []) as FidyahTx[];

      const received = {
        zakatFitrahCash: fitrahTransactions.reduce((sum, tx) => sum + toNumber(tx.money_amount), 0),
        zakatFitrahRice: fitrahTransactions.reduce((sum, tx) => sum + toNumber(tx.rice_amount_kg), 0),
        zakatMal: malTransactions.reduce((sum, tx) => sum + toNumber(tx.final_zakat_amount), 0),
        fidyahCash: fidyahTransactions.reduce((sum, tx) => sum + toNumber(tx.cash_amount), 0),
        fidyahFood: fidyahTransactions.reduce((sum, tx) => sum + toNumber(tx.food_amount_kg), 0),
      };

      const balancesByCategory = {
        zakatFitrahCash: toNumber(balances.find((b) => b.category === "zakat_fitrah_cash")?.total_cash),
        zakatFitrahRice: toNumber(balances.find((b) => b.category === "zakat_fitrah_rice")?.total_rice_kg),
        zakatMal: toNumber(balances.find((b) => b.category === "zakat_mal")?.total_cash),
        fidyahCash: toNumber(balances.find((b) => b.category === "fidyah_cash")?.total_cash),
        fidyahFood: toNumber(balances.find((b) => b.category === "fidyah_food")?.total_food_kg),
      };

      const allReceiptTimes = [
        ...fitrahTransactions.map((tx) => tx.transaction_date),
        ...malTransactions.map((tx) => tx.transaction_date),
        ...fidyahTransactions.map((tx) => tx.transaction_date),
      ];

      const firstReceiptAt = allReceiptTimes.length
        ? allReceiptTimes.reduce((earliest, current) =>
            new Date(current).getTime() < new Date(earliest).getTime() ? current : earliest,
          allReceiptTimes[0])
        : null;

      const latestReceiptAt = allReceiptTimes.length
        ? allReceiptTimes.reduce((latest, current) =>
            new Date(current).getTime() > new Date(latest).getTime() ? current : latest,
          allReceiptTimes[0])
        : null;

      const totalMuzakki = new Set(
        fitrahTransactions
          .map((tx) => tx.muzakki_id)
          .filter((id): id is string => Boolean(id)),
      ).size;

      return {
        period,
        received,
        balances: balancesByCategory,
        totalMuzakki,
        totalTransactions: fitrahTransactions.length + malTransactions.length + fidyahTransactions.length,
        totalDistributions: (zakatDistRes.count || 0) + (fidyahDistRes.count || 0),
        receiptWindow: {
          firstReceiptAt,
          latestReceiptAt,
          latestByType: {
            zakatFitrah: getLatestDate(fitrahTransactions),
            zakatMal: getLatestDate(malTransactions),
            fidyah: getLatestDate(fidyahTransactions),
          },
          firstByType: {
            zakatFitrah: getEarliestDate(fitrahTransactions),
            zakatMal: getEarliestDate(malTransactions),
            fidyah: getEarliestDate(fidyahTransactions),
          },
        },
      };
    },
    refetchInterval: 30000,
  });
}

export default function PublicTVDashboard() {
  const { data, isLoading, dataUpdatedAt } = usePublicDashboardData();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const cashComposition = useMemo(() => {
    if (!data) return [];
    return [
      { name: "Zakat Fitrah", value: data.received.zakatFitrahCash, color: CASH_COLORS[0] },
      { name: "Zakat Mal", value: data.received.zakatMal, color: CASH_COLORS[1] },
      { name: "Fidyah", value: data.received.fidyahCash, color: CASH_COLORS[2] },
    ].filter((item) => item.value > 0);
  }, [data]);

  const goodsBars = useMemo(() => {
    if (!data) return [];
    return [
      { name: "Beras Zakat", value: data.received.zakatFitrahRice },
      { name: "Makanan Fidyah", value: data.received.fidyahFood },
    ];
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-2xl md:text-3xl">
          <RefreshCw className="h-7 w-7 animate-spin" />
          Memuat papan informasi...
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-xl text-center animate-in fade-in duration-700">
          <Calendar className="mx-auto mb-4 h-16 w-16 text-slate-400" />
          <h1 className="text-3xl font-semibold">Belum Ada Periode Aktif</h1>
          <p className="mt-2 text-slate-300">Aktifkan periode terlebih dahulu untuk menampilkan papan informasi TV.</p>
        </div>
      </div>
    );
  }

  const totalReceivedCash = data.received.zakatFitrahCash + data.received.zakatMal + data.received.fidyahCash;
  const totalCurrentCashBalance = data.balances.zakatFitrahCash + data.balances.zakatMal + data.balances.fidyahCash;

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.15),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.12),_transparent_40%)]" />

      <div className="relative mx-auto max-w-[1800px] space-y-5 p-4 md:space-y-6 md:p-7">
        <header className="animate-in fade-in slide-in-from-top-2 duration-700 rounded-3xl border border-white/10 bg-slate-900/70 p-5 text-slate-100 backdrop-blur-md md:p-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <Badge className="w-fit border-emerald-400/40 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/20">
                <Sparkles className="mr-1 h-3 w-3" />
                LIVE MONITORING
              </Badge>
              <h1 className="text-2xl font-semibold tracking-tight md:text-4xl">Papan Informasi Zakat Masjid</h1>
              <p className="text-sm text-slate-300 md:text-lg">
                Periode {data.period.name} ({data.period.hijri_year} H / {data.period.gregorian_year} M)
              </p>
              {data.period.description && (
                <div className="mt-1 max-w-4xl rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100 md:text-sm">
                  <span className="font-semibold text-cyan-200">Catatan Periode:</span> {data.period.description}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1 text-xs md:text-sm">
                <Badge variant="outline" className="border-slate-600 bg-slate-800/70 text-slate-100">Beras/Jiwa: {data.period.rice_amount_per_person || 2.5} kg</Badge>
                <Badge variant="outline" className="border-slate-600 bg-slate-800/70 text-slate-100">Uang/Jiwa: {formatCurrency(data.period.cash_amount_per_person || 35000)}</Badge>
                <Badge variant="outline" className="border-slate-600 bg-slate-800/70 text-slate-100">Fidyah/Hari: {formatCurrency(data.period.fidyah_daily_rate || 35000)}</Badge>
              </div>
            </div>

            <div className="grid gap-2 rounded-2xl border border-white/10 bg-slate-800/70 p-4 text-right">
              <div className="text-2xl font-semibold tracking-wide md:text-4xl">{currentTime.toLocaleTimeString("id-ID")}</div>
              <div className="text-sm text-slate-300 md:text-base">
                {currentTime.toLocaleDateString("id-ID", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </div>
              <div className="flex items-center justify-end gap-2 text-xs text-emerald-300 md:text-sm">
                <RefreshCw className="h-3.5 w-3.5" />
                Update: {new Date(dataUpdatedAt).toLocaleTimeString("id-ID")}
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="animate-in fade-in slide-in-from-bottom-2 duration-700 border-emerald-500/30 bg-emerald-500/10 text-slate-100 backdrop-blur">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-emerald-200 md:text-sm">Total Penerimaan Kas</p>
                  <p className="mt-1 text-xl font-semibold text-white md:text-3xl">{formatCurrency(totalReceivedCash)}</p>
                </div>
                <div className="rounded-xl bg-emerald-400/20 p-2.5 md:p-3">
                  <Banknote className="h-5 w-5 text-emerald-200 md:h-7 md:w-7" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="animate-in fade-in slide-in-from-bottom-2 duration-700 border-amber-500/30 bg-amber-500/10 text-slate-100 backdrop-blur">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-amber-200 md:text-sm">Total Penerimaan Beras</p>
                  <p className="mt-1 text-xl font-semibold text-white md:text-3xl">{formatWeight(data.received.zakatFitrahRice)}</p>
                </div>
                <div className="rounded-xl bg-amber-400/20 p-2.5 md:p-3">
                  <Wheat className="h-5 w-5 text-amber-200 md:h-7 md:w-7" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="animate-in fade-in slide-in-from-bottom-2 duration-700 border-sky-500/30 bg-sky-500/10 text-slate-100 backdrop-blur">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-sky-200 md:text-sm">Total Muzakki</p>
                  <p className="mt-1 text-xl font-semibold text-white md:text-3xl">{data.totalMuzakki.toLocaleString("id-ID")}</p>
                </div>
                <div className="rounded-xl bg-sky-400/20 p-2.5 md:p-3">
                  <Users className="h-5 w-5 text-sky-200 md:h-7 md:w-7" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="animate-in fade-in slide-in-from-bottom-2 duration-700 border-purple-500/30 bg-purple-500/10 text-slate-100 backdrop-blur">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-purple-200 md:text-sm">Total Pendistribusian</p>
                  <p className="mt-1 text-xl font-semibold text-white md:text-3xl">{data.totalDistributions.toLocaleString("id-ID")}</p>
                </div>
                <div className="rounded-xl bg-purple-400/20 p-2.5 md:p-3">
                  <Package className="h-5 w-5 text-purple-200 md:h-7 md:w-7" />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <Card className="animate-in fade-in slide-in-from-bottom-2 duration-700 border-white/10 bg-slate-900/70 text-slate-100 backdrop-blur xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-slate-100 md:text-xl">Komposisi Penerimaan Kas</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[300px,1fr] lg:items-center">
              <div className="h-[240px]">
                {cashComposition.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={cashComposition} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={92} paddingAngle={4}>
                        {cashComposition.map((entry, index) => (
                          <Cell key={entry.name} fill={entry.color || CASH_COLORS[index % CASH_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">Belum ada penerimaan kas.</div>
                )}
              </div>
              <div className="grid gap-2">
                {cashComposition.map((item, idx) => (
                  <div key={item.name} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-800/70 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color || CASH_COLORS[idx % CASH_COLORS.length] }} />
                      <span className="text-sm text-slate-200">{item.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-100">{formatCurrency(item.value)}</span>
                  </div>
                ))}
                <div className="mt-1 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-200">Total Penerimaan Kas</span>
                    <span className="font-semibold text-emerald-100">{formatCurrency(totalReceivedCash)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="animate-in fade-in slide-in-from-bottom-2 duration-700 border-white/10 bg-slate-900/70 text-slate-100 backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-slate-100 md:text-xl">Waktu Penerimaan Zakat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-xl border border-white/10 bg-slate-800/70 p-3">
                <p className="text-slate-400">Penerimaan Pertama</p>
                <p className="mt-1 font-medium text-slate-100">{formatDateTime(data.receiptWindow.firstReceiptAt)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-800/70 p-3">
                <p className="text-slate-400">Penerimaan Terakhir</p>
                <p className="mt-1 font-medium text-slate-100">{formatDateTime(data.receiptWindow.latestReceiptAt)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-800/70 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Zakat Fitrah</span>
                  <span className="text-slate-100">{formatDateTime(data.receiptWindow.latestByType.zakatFitrah)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Zakat Mal</span>
                  <span className="text-slate-100">{formatDateTime(data.receiptWindow.latestByType.zakatMal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Fidyah</span>
                  <span className="text-slate-100">{formatDateTime(data.receiptWindow.latestByType.fidyah)}</span>
                </div>
              </div>
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-cyan-200">
                    <Activity className="h-4 w-4" />
                    Total Transaksi
                  </span>
                  <span className="font-semibold text-slate-100">{data.totalTransactions.toLocaleString("id-ID")}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card className="animate-in fade-in slide-in-from-bottom-2 duration-700 border-white/10 bg-slate-900/70 text-slate-100 backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-slate-100 md:text-xl">Penerimaan per Kategori</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2">
                <span className="flex items-center gap-2"><HandCoins className="h-4 w-4 text-green-300" />Zakat Fitrah (Uang)</span>
                <span className="font-semibold text-slate-100">{formatCurrency(data.received.zakatFitrahCash)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2">
                <span className="flex items-center gap-2"><Wheat className="h-4 w-4 text-amber-300" />Zakat Fitrah (Beras)</span>
                <span className="font-semibold text-slate-100">{formatWeight(data.received.zakatFitrahRice)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2">
                <span className="flex items-center gap-2"><Scale className="h-4 w-4 text-sky-300" />Zakat Mal</span>
                <span className="font-semibold text-slate-100">{formatCurrency(data.received.zakatMal)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2">
                <span className="flex items-center gap-2"><Banknote className="h-4 w-4 text-orange-300" />Fidyah (Uang)</span>
                <span className="font-semibold text-slate-100">{formatCurrency(data.received.fidyahCash)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2">
                <span className="flex items-center gap-2"><Package className="h-4 w-4 text-yellow-300" />Fidyah (Makanan)</span>
                <span className="font-semibold text-slate-100">{formatWeight(data.received.fidyahFood)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="animate-in fade-in slide-in-from-bottom-2 duration-700 border-white/10 bg-slate-900/70 text-slate-100 backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-slate-100 md:text-xl">Saldo Dana Saat Ini</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3">
                <p className="text-xs text-emerald-200">Total Saldo Kas</p>
                <p className="text-xl font-semibold text-emerald-100">{formatCurrency(totalCurrentCashBalance)}</p>
              </div>

              <div className="h-[190px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={goodsBars} layout="vertical" margin={{ left: 10, right: 15 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" horizontal={false} />
                    <XAxis type="number" stroke="#cbd5e1" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" stroke="#cbd5e1" tick={{ fontSize: 11 }} width={95} />
                    <Tooltip formatter={(value: number) => formatWeight(value)} />
                    <Bar dataKey="value" fill="#22c55e" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs md:text-sm">
                <div className="rounded-lg bg-slate-800/70 p-2">
                  <p className="text-slate-400">Saldo Beras Zakat</p>
                  <p className="font-semibold">{formatWeight(data.balances.zakatFitrahRice)}</p>
                </div>
                <div className="rounded-lg bg-slate-800/70 p-2">
                  <p className="text-slate-400">Saldo Makanan Fidyah</p>
                  <p className="font-semibold">{formatWeight(data.balances.fidyahFood)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <footer className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-center text-xs text-slate-300 md:text-sm">
          Semoga Allah SWT menerima zakat dan amal ibadah kita semua. Aamiin.
        </footer>
      </div>

      <div className="pointer-events-none fixed bottom-3 right-3 rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-200">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="h-3.5 w-3.5" />
          Live Refresh 30s
        </span>
      </div>
    </div>
  );
}

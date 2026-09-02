import { useEffect, useMemo, useRef, useState } from "react";
import { MASJID_ADDRESS, MASJID_NAME } from "@/lib/masjidProfile";
import {
  Activity,
  Banknote,
  Calendar,
  HandCoins,
  Maximize2,
  Minimize2,
  Package,
  RefreshCw,
  Scale,
  Users,
  Wheat,
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { useDashboardRealtime } from "@/hooks/useDashboardRealtime";
import { getClientDeviceInfo } from "@/lib/deviceInfo";
import { useCountUp } from "@/hooks/useCountUp";

const CASH_COLORS = ["#34d399", "#38bdf8", "#fbbf24"];

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
  `${new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)} kg`;

const formatCount = (value: number): string =>
  new Intl.NumberFormat("id-ID").format(Math.round(value));

const formatDateTime = (value: string | null): string => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const AnimatedValue = ({
  value,
  format,
  className,
}: {
  value: number;
  format: (value: number) => string;
  className?: string;
}) => {
  const animated = useCountUp(value, 1100);
  return <span className={className}>{format(animated)}</span>;
};

type Accent = "emerald" | "amber" | "sky" | "cyan" | "violet";

const ACCENTS: Record<Accent, { ring: string; glow: string; icon: string; label: string; bar: string }> = {
  emerald: {
    ring: "border-emerald-400/25",
    glow: "from-emerald-400/25",
    icon: "bg-emerald-400/15 text-emerald-300",
    label: "text-emerald-200/80",
    bar: "from-emerald-400 to-emerald-300",
  },
  amber: {
    ring: "border-amber-400/25",
    glow: "from-amber-400/25",
    icon: "bg-amber-400/15 text-amber-300",
    label: "text-amber-200/80",
    bar: "from-amber-400 to-amber-300",
  },
  sky: {
    ring: "border-sky-400/25",
    glow: "from-sky-400/25",
    icon: "bg-sky-400/15 text-sky-300",
    label: "text-sky-200/80",
    bar: "from-sky-400 to-sky-300",
  },
  cyan: {
    ring: "border-cyan-400/25",
    glow: "from-cyan-400/25",
    icon: "bg-cyan-400/15 text-cyan-300",
    label: "text-cyan-200/80",
    bar: "from-cyan-400 to-cyan-300",
  },
  violet: {
    ring: "border-violet-400/25",
    glow: "from-violet-400/25",
    icon: "bg-violet-400/15 text-violet-300",
    label: "text-violet-200/80",
    bar: "from-violet-400 to-violet-300",
  },
};

const StatCard = ({
  label,
  value,
  format,
  caption,
  icon: Icon,
  accent,
  delay,
}: {
  label: string;
  value: number;
  format: (value: number) => string;
  caption: string;
  icon: typeof Banknote;
  accent: Accent;
  delay: number;
}) => {
  const tone = ACCENTS[accent];

  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={`group relative overflow-hidden rounded-3xl border ${tone.ring} bg-white/[0.04] p-4 opacity-0 shadow-[0_18px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl animate-rise md:p-5`}
    >
      <div className={`pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${tone.glow} to-transparent blur-2xl`} />
      <div className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent animate-sheen" />

      <div className="relative flex items-start justify-between gap-3">
        <p className={`text-[11px] font-medium uppercase tracking-[0.18em] ${tone.label} md:text-xs`}>{label}</p>
        <div className={`rounded-2xl ${tone.icon} p-2 md:p-2.5`}>
          <Icon className="h-4 w-4 md:h-5 md:w-5" />
        </div>
      </div>

      <AnimatedValue
        value={value}
        format={format}
        className="relative mt-2 block text-2xl font-semibold tracking-tight text-white tabular-nums md:text-4xl"
      />
      <p className="relative mt-1 text-[11px] text-slate-400 md:text-xs">{caption}</p>
    </div>
  );
};

export default function PublicTVDashboard() {
  const { data, isLoading, dataUpdatedAt, refetch } = useDashboardSummary();
  const deviceInfo = useMemo(() => getClientDeviceInfo(), []);

  // 🔥 realtime auto refresh
  useDashboardRealtime(() => {
    refetch();
  });

  const [currentTime, setCurrentTime] = useState(new Date());
  const [watchingCount, setWatchingCount] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const presenceKeyRef = useRef(
    `tv-${Math.random().toString(36).slice(2)}-${Date.now()}`
  );

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Layar penuh untuk pemakaian di TV / proyektor.
  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(Boolean(document.fullscreenElement));
    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  // 🔥 presence tetap sama
  useEffect(() => {
    const channel = supabase.channel("public-tv-watchers", {
      config: {
        presence: {
          key: presenceKeyRef.current,
        },
      },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const total = Object.values(state).reduce(
        (sum, items) => sum + items.length,
        0
      );
      setWatchingCount(Math.max(1, total));
    });

    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await channel.track({
        page: "tv",
        period_id: data?.period.id || null,
        online_at: new Date().toISOString(),
        device_type: deviceInfo.deviceType,
        device_label: deviceInfo.deviceLabel,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        viewport: deviceInfo.viewport,
        path: typeof window !== "undefined" ? window.location.pathname : "/tv",
      });
    });

    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [data?.period.id, deviceInfo.browser, deviceInfo.deviceLabel, deviceInfo.deviceType, deviceInfo.os, deviceInfo.viewport]);

  // 🔥 mapping dari summary view
  const mappedData = useMemo(() => {
    if (!data) return null;

    return {
      period: {
        id: data.period.id,
        name: data.period.name,
        status: data.period.status,
        hijri_year: data.period.hijri_year,
        gregorian_year: data.period.gregorian_year,
        description: data.period.description,
        rice_amount_per_person: data.period.rice_amount_per_person,
        cash_amount_per_person: data.period.cash_amount_per_person,
        fidyah_daily_rate: data.period.fidyah_daily_rate,
      },

      received: {
        zakatFitrahCash: toNumber(data.received.zakatFitrahCash),
        zakatFitrahRice: toNumber(data.received.zakatFitrahRice),
        zakatMal: toNumber(data.received.zakatMal),
        fidyahCash: toNumber(data.received.fidyahCash),
        fidyahFood: toNumber(data.received.fidyahFood),
      },

      // Seluruh angka berasal dari satu pemanggilan RPC untuk periode yang sama,
      // sehingga tidak mungkin bercampur antar periode.
      totalMuzakkiHouseholds: toNumber(data.summary.totalMuzakkiHouseholds),

      totalJiwaFitrah: toNumber(data.summary.totalJiwaFitrah),

      totalTransactions: toNumber(data.summary.totalTransactions),

      totalMustahik: toNumber(data.summary.totalMustahik),

      totalDistributions: toNumber(data.summary.totalDistributions),

      receiptWindow: {
        firstReceiptAt: data.receiptWindow.firstReceiptAt,
        latestReceiptAt: data.receiptWindow.latestReceiptAt,
      },
    };
  }, [data]);

  const cashComposition = useMemo(() => {
    if (!mappedData) return [];
    return [
      { name: "Zakat Fitrah", value: mappedData.received.zakatFitrahCash, color: CASH_COLORS[0] },
      { name: "Zakat Mal", value: mappedData.received.zakatMal, color: CASH_COLORS[1] },
      { name: "Fidyah", value: mappedData.received.fidyahCash, color: CASH_COLORS[2] },
    ].filter((item) => item.value > 0);
  }, [mappedData]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Sebagian browser menolak layar penuh tanpa interaksi langsung; abaikan saja.
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050914] text-white">
        <div className="flex items-center gap-3 text-xl md:text-3xl">
          <RefreshCw className="h-7 w-7 animate-spin text-emerald-400" />
          Memuat papan informasi...
        </div>
      </div>
    );
  }

  if (!mappedData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050914] p-6 text-white">
        <div className="max-w-xl text-center">
          <Calendar className="mx-auto mb-4 h-16 w-16 text-slate-500" />
          <h1 className="text-2xl font-semibold md:text-3xl">Belum Ada Data Periode</h1>
          <p className="mt-2 text-sm text-slate-400">Papan informasi akan tampil setelah periode zakat dibuat.</p>
        </div>
      </div>
    );
  }

  const received = mappedData.received;
  const totalReceivedCash = received.zakatFitrahCash + received.zakatMal + received.fidyahCash;
  const totalGoodsKg = received.zakatFitrahRice + received.fidyahFood;

  const cashCategories = [
    { name: "Zakat Fitrah (Uang)", value: received.zakatFitrahCash, icon: HandCoins, accent: "emerald" as Accent },
    { name: "Zakat Mal", value: received.zakatMal, icon: Scale, accent: "sky" as Accent },
    { name: "Fidyah (Uang)", value: received.fidyahCash, icon: Banknote, accent: "amber" as Accent },
  ];

  const goodsCategories = [
    { name: "Zakat Fitrah (Beras)", value: received.zakatFitrahRice, icon: Wheat, accent: "amber" as Accent },
    { name: "Fidyah (Makanan)", value: received.fidyahFood, icon: Package, accent: "violet" as Accent },
  ];

  const tickerItems = [
    `Penerimaan pertama: ${formatDateTime(mappedData.receiptWindow.firstReceiptAt)}`,
    `Penerimaan terakhir: ${formatDateTime(mappedData.receiptWindow.latestReceiptAt)}`,
    `Beras/jiwa ${mappedData.period.rice_amount_per_person || 2.5} kg · Uang/jiwa ${formatCurrency(mappedData.period.cash_amount_per_person || 35000)} · Fidyah/hari ${formatCurrency(mappedData.period.fidyah_daily_rate || 35000)}`,
    mappedData.period.description ? `Catatan: ${mappedData.period.description}` : null,
    "Semoga Allah SWT menerima zakat dan amal ibadah kita semua. Aamiin.",
  ].filter(Boolean) as string[];

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-[#050914] text-slate-100">
      {/* Latar aurora + grid halus */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[10%] -top-[20%] h-[55vw] w-[55vw] rounded-full bg-emerald-500/20 blur-[120px] animate-aurora" />
        <div
          className="absolute -right-[12%] top-[10%] h-[45vw] w-[45vw] rounded-full bg-sky-500/20 blur-[120px] animate-aurora"
          style={{ animationDelay: "-6s" }}
        />
        <div
          className="absolute bottom-[-25%] left-[25%] h-[50vw] w-[50vw] rounded-full bg-violet-500/15 blur-[130px] animate-aurora"
          style={{ animationDelay: "-12s" }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(5,9,20,0.85)_100%)]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-3 p-4 md:gap-4 md:p-6 lg:p-8">
        {/* Topbar */}
        <header className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-3 opacity-0 backdrop-blur-xl animate-rise md:flex-row md:items-center md:justify-between md:px-6 md:py-4">
          <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-4">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/30 to-sky-400/20 md:h-14 md:w-14">
              <span className="absolute inset-0 rounded-2xl bg-emerald-400/20 animate-glow-pulse" />
              <Activity className="relative h-5 w-5 text-emerald-300 md:h-7 md:w-7" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-white md:text-3xl">{MASJID_NAME}</h1>
              <p className="truncate text-[11px] text-slate-400 md:text-sm">{MASJID_ADDRESS}</p>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300 md:text-sm">
                <span className="truncate font-medium text-emerald-300">{mappedData.period.name}</span>
                <span className="text-slate-500">
                  {mappedData.period.hijri_year} H / {mappedData.period.gregorian_year} M
                </span>
                {mappedData.period.status === "archived" && (
                  <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                    Arsip
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-col items-start gap-2 md:w-auto md:items-end md:gap-2.5">
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200 md:text-xs">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 animate-glow-pulse" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
              </span>
              Live
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] text-slate-300 md:text-xs">
              <Users className="h-3.5 w-3.5" />
              {watchingCount.toLocaleString("id-ID")} menonton
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] text-slate-300 md:text-xs">
              <RefreshCw className="h-3.5 w-3.5 text-emerald-300" />
              {new Date(dataUpdatedAt).toLocaleTimeString("id-ID")}
            </span>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Keluar layar penuh" : "Tampilkan layar penuh"}
              title={isFullscreen ? "Keluar layar penuh" : "Layar penuh"}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200 md:text-xs"
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{isFullscreen ? "Keluar" : "Layar penuh"}</span>
            </button>
            </div>

            <div className="w-full text-left md:w-auto md:text-right">
              <p className="text-3xl font-semibold leading-none tracking-tight text-white tabular-nums md:text-5xl">
                {currentTime.toLocaleTimeString("id-ID")}
              </p>
              <p className="mt-1 text-[11px] text-slate-400 md:text-sm">
                {currentTime.toLocaleDateString("id-ID", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </header>

        {/* KPI utama */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Total Uang Gabungan"
            value={totalReceivedCash}
            format={formatCurrency}
            caption="Zakat fitrah + zakat mal + fidyah"
            icon={Banknote}
            accent="emerald"
            delay={80}
          />
          <StatCard
            label="Total Beras"
            value={received.zakatFitrahRice}
            format={formatWeight}
            caption="Akumulasi zakat fitrah beras"
            icon={Wheat}
            accent="amber"
            delay={160}
          />
          <StatCard
            label="Muzakki Keluarga"
            value={mappedData.totalMuzakkiHouseholds}
            format={formatCount}
            caption="Kepala keluarga yang menunaikan"
            icon={Users}
            accent="sky"
            delay={240}
          />
          <StatCard
            label="Jiwa Fitrah"
            value={mappedData.totalJiwaFitrah}
            format={formatCount}
            caption="Jumlah jiwa yang dizakati"
            icon={Activity}
            accent="cyan"
            delay={320}
          />
          <StatCard
            label="Pendistribusian"
            value={mappedData.totalDistributions}
            format={formatCount}
            caption={`${formatCount(mappedData.totalMustahik)} mustahik menerima`}
            icon={Package}
            accent="violet"
            delay={400}
          />
        </section>

        {/* Komposisi + rincian */}
        <section className="grid flex-1 gap-3 xl:grid-cols-[1.25fr_1fr]">
          <div
            style={{ animationDelay: "460ms" }}
            className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-4 opacity-0 backdrop-blur-xl animate-rise md:p-6"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-white md:text-xl">Komposisi Penerimaan Kas</h2>
              <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400 md:text-xs">Realtime</span>
            </div>

            <div className="mt-3 grid gap-4 lg:grid-cols-[260px_1fr] lg:items-center">
              <div className="relative mx-auto h-[200px] w-[200px] md:h-[240px] md:w-[240px]">
                {cashComposition.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={cashComposition}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius="62%"
                          outerRadius="92%"
                          paddingAngle={3}
                          stroke="none"
                          animationDuration={900}
                        >
                          {cashComposition.map((entry, index) => (
                            <Cell key={entry.name} fill={entry.color || CASH_COLORS[index % CASH_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Total Kas</p>
                      <AnimatedValue
                        value={totalReceivedCash}
                        format={formatCurrency}
                        className="mt-1 max-w-[85%] text-base font-semibold text-white tabular-nums md:text-xl"
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-full border border-dashed border-white/10 text-center text-xs text-slate-500">
                    Belum ada
                    <br />
                    penerimaan kas
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                {cashCategories.map((item) => {
                  const share = totalReceivedCash > 0 ? (item.value / totalReceivedCash) * 100 : 0;
                  const tone = ACCENTS[item.accent];
                  return (
                    <div key={item.name} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-xs text-slate-300 md:text-sm">
                          <item.icon className="h-4 w-4 text-slate-400" />
                          {item.name}
                        </span>
                        <AnimatedValue
                          value={item.value}
                          format={formatCurrency}
                          className="text-sm font-semibold text-white tabular-nums md:text-base"
                        />
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${tone.bar} transition-[width] duration-1000 ease-out`}
                            style={{ width: `${Math.min(100, share)}%` }}
                          />
                        </div>
                        <span className="w-11 text-right text-[11px] text-slate-400 tabular-nums">{share.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <div
              style={{ animationDelay: "540ms" }}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 opacity-0 backdrop-blur-xl animate-rise md:p-6"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold text-white md:text-xl">Penerimaan Barang</h2>
                <AnimatedValue
                  value={totalGoodsKg}
                  format={formatWeight}
                  className="text-sm font-semibold text-emerald-300 tabular-nums md:text-base"
                />
              </div>

              <div className="mt-3 grid gap-2.5">
                {goodsCategories.map((item) => {
                  const share = totalGoodsKg > 0 ? (item.value / totalGoodsKg) * 100 : 0;
                  const tone = ACCENTS[item.accent];
                  return (
                    <div key={item.name} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-xs text-slate-300 md:text-sm">
                          <span className={`rounded-lg ${tone.icon} p-1.5`}>
                            <item.icon className="h-3.5 w-3.5" />
                          </span>
                          {item.name}
                        </span>
                        <AnimatedValue
                          value={item.value}
                          format={formatWeight}
                          className="text-base font-semibold text-white tabular-nums md:text-lg"
                        />
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${tone.bar} transition-[width] duration-1000 ease-out`}
                          style={{ width: `${Math.min(100, share)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              style={{ animationDelay: "620ms" }}
              className="grid gap-2 rounded-3xl border border-white/10 bg-white/[0.04] p-4 opacity-0 backdrop-blur-xl animate-rise md:p-6"
            >
              <h2 className="text-base font-semibold text-white md:text-xl">Aktivitas Penerimaan</h2>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Pertama</p>
                  <p className="mt-1 text-xs font-medium text-slate-100 md:text-sm">
                    {formatDateTime(mappedData.receiptWindow.firstReceiptAt)}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Terakhir</p>
                  <p className="mt-1 text-xs font-medium text-slate-100 md:text-sm">
                    {formatDateTime(mappedData.receiptWindow.latestReceiptAt)}
                  </p>
                </div>
                <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/80">Total Transaksi</p>
                  <AnimatedValue
                    value={mappedData.totalTransactions}
                    format={formatCount}
                    className="mt-1 block text-lg font-semibold text-white tabular-nums md:text-2xl"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Ticker berjalan */}
      <footer className="relative z-10 border-t border-white/10 bg-white/[0.03] py-2.5 backdrop-blur-xl">
        <div className="flex w-max animate-marquee items-center whitespace-nowrap text-xs text-slate-300 md:text-sm">
          {[0, 1].map((loop) => (
            <div key={loop} className="flex items-center gap-10 pl-10" aria-hidden={loop === 1}>
              {tickerItems.map((item) => (
                <span key={`${loop}-${item}`} className="flex items-center gap-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {item}
                </span>
              ))}
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  CalendarDays,
  CalendarRange,
  Clock,
  DoorClosed,
  DoorOpen,
  HandCoins,
  Info,
  Minus,
  MonitorPlay,
  Plus,
  RefreshCw,
  Scale,
  Users,
  Wheat,
} from "lucide-react";
import { MASJID_ADDRESS, MASJID_NAME } from "@/lib/masjidProfile";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { useDashboardRealtime } from "@/hooks/useDashboardRealtime";
import { AnimatedNumber } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";

const NISAB_GOLD_GRAMS = 85;
const DAY_MS = 24 * 60 * 60 * 1000;

const toNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatCurrency = (value: number): string => `Rp ${Math.round(value).toLocaleString("id-ID")}`;

const formatKg = (value: number): string =>
  `${value.toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} kg`;

const formatCount = (value: number): string => Math.round(value).toLocaleString("id-ID");

/** Kolom `date` dari Postgres berbentuk YYYY-MM-DD; dibaca sebagai tanggal lokal, bukan UTC. */
const parseLocalDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatLongDate = (date: Date): string =>
  date.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const formatShortDate = (date: Date): string =>
  date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const formatClock = (value: string | null | undefined): string => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
};

const formatDayTime = (value: string | null | undefined): string => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", { weekday: "long", hour: "2-digit", minute: "2-digit" });
};

type PeriodPhase = "upcoming" | "ongoing" | "ended" | "unknown";

function usePeriodPhase(startRaw: string | null | undefined, endRaw: string | null | undefined, now: Date) {
  return useMemo(() => {
    const start = parseLocalDate(startRaw);
    const endDay = parseLocalDate(endRaw);
    // Hari terakhir tetap dihitung penuh sampai pukul 23.59.
    const end = endDay ? new Date(endDay.getTime() + DAY_MS - 1) : null;

    let phase: PeriodPhase = "unknown";
    let daysLeft = 0;
    let progress = 0;

    if (start && end) {
      if (now < start) {
        phase = "upcoming";
        daysLeft = Math.ceil((start.getTime() - now.getTime()) / DAY_MS);
      } else if (now > end) {
        phase = "ended";
        progress = 100;
      } else {
        phase = "ongoing";
        daysLeft = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
        progress = Math.min(100, ((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100);
      }
    }

    const totalDays = start && endDay ? Math.round((endDay.getTime() - start.getTime()) / DAY_MS) + 1 : 0;

    return { start, end: endDay, phase, daysLeft, progress, totalDays };
  }, [startRaw, endRaw, now]);
}

function SectionCard({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <section
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        "rounded-3xl border border-border/70 bg-card/90 p-4 opacity-0 shadow-[0_10px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur animate-rise motion-reduce:animate-none motion-reduce:opacity-100 sm:p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

function SectionTitle({ icon: Icon, children, aside }: { icon: typeof Info; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {children}
      </h2>
      {aside}
    </div>
  );
}

export default function PublicInfo() {
  const { data, isLoading, isError, dataUpdatedAt, refetch, isFetching } = useDashboardSummary();
  useDashboardRealtime(() => undefined);

  const [now, setNow] = useState(() => new Date());
  const [jiwa, setJiwa] = useState(1);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const period = data?.period;
  const { start, end, phase, daysLeft, progress, totalDays } = usePeriodPhase(period?.start_date, period?.end_date, now);

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin text-primary" />
          Memuat informasi zakat...
        </div>
      </div>
    );
  }

  if (!data || !period) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center">
          <CalendarDays className="mx-auto mb-3 h-12 w-12 text-muted-foreground/60" />
          <h1 className="text-lg font-semibold">{isError ? "Gagal memuat informasi" : "Belum ada periode zakat"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isError
              ? "Periksa koneksi internet Anda lalu coba lagi."
              : "Informasi penerimaan zakat akan tampil setelah panitia membuka periode."}
          </p>
          {isError && (
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              <RefreshCw className="h-4 w-4" /> Coba lagi
            </button>
          )}
        </div>
      </div>
    );
  }

  const ricePerPerson = toNumber(period.rice_amount_per_person) || 2.5;
  const cashPerPerson = toNumber(period.cash_amount_per_person);
  const fidyahPerDay = toNumber(period.fidyah_daily_rate);
  const goldPrice = toNumber(period.nisab_gold_price_per_gram);
  const nisabValue = goldPrice * NISAB_GOLD_GRAMS;

  const service = {
    isOpen: Boolean(data.service?.isOpen),
    openedAt: data.service?.openedAt ?? null,
    scheduledCloseAt: data.service?.scheduledCloseAt ?? null,
    note: data.service?.note ?? null,
    lastClosedAt: data.service?.lastClosedAt ?? null,
  };

  const isArchived = period.status !== "active";

  const received = {
    cash: toNumber(data.received.zakatFitrahCash),
    rice: toNumber(data.received.zakatFitrahRice),
    payers: toNumber(data.summary.totalTransactionsFitrah),
    jiwa: toNumber(data.summary.totalJiwaFitrah),
  };

  const phaseBadge: Record<PeriodPhase, { label: string; className: string }> = {
    upcoming: { label: "Segera dibuka", className: "border-amber-200 bg-amber-50 text-amber-700" },
    ongoing: { label: "Sedang berlangsung", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    ended: { label: "Telah berakhir", className: "border-slate-200 bg-slate-100 text-slate-600" },
    unknown: { label: isArchived ? "Arsip" : "Aktif", className: "border-slate-200 bg-slate-50 text-slate-600" },
  };

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-background text-foreground">
      {/* Latar lembut */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-emerald-500/[0.14] via-emerald-500/[0.04] to-transparent" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 top-40 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" />

      <main className="relative mx-auto w-full max-w-md px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] sm:max-w-2xl sm:px-6 sm:pt-8">
        {/* Kop */}
        <header className="flex items-center gap-3 opacity-0 animate-rise motion-reduce:animate-none motion-reduce:opacity-100">
          <img
            src="/logo.png"
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 rounded-2xl border border-white/60 bg-white object-cover shadow-sm"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">Info Zakat</p>
            <h1 className="truncate text-lg font-bold leading-tight tracking-tight sm:text-xl">{MASJID_NAME}</h1>
            <p className="line-clamp-1 text-xs text-muted-foreground">{MASJID_ADDRESS}</p>
          </div>
        </header>

        <div className="mt-4 space-y-3 sm:mt-6 sm:space-y-4">
          {/* Status penerimaan */}
          <section
            style={{ animationDelay: "60ms" }}
            className={cn(
              "relative overflow-hidden rounded-3xl p-5 text-white opacity-0 shadow-lg animate-rise motion-reduce:animate-none motion-reduce:opacity-100",
              service.isOpen
                ? "bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 shadow-emerald-600/25"
                : "bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800 shadow-slate-700/25",
            )}
          >
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-16 left-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />

            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/75">Status Penerimaan</p>
                <p className="mt-1 text-[28px] font-extrabold leading-none tracking-tight">
                  {service.isOpen ? "SEDANG BUKA" : "SEDANG TUTUP"}
                </p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                {service.isOpen ? <DoorOpen className="h-6 w-6" /> : <DoorClosed className="h-6 w-6" />}
              </div>
            </div>

            <div className="relative mt-4 flex items-center gap-2 rounded-2xl bg-black/15 px-3 py-2.5 text-sm">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                {service.isOpen && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-white/80 animate-glow-pulse" />
                )}
                <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", service.isOpen ? "bg-white" : "bg-white/50")} />
              </span>
              <span className="min-w-0 flex-1">
                {service.isOpen
                  ? service.scheduledCloseAt
                    ? `Loket melayani ${formatClock(service.openedAt)} – ${formatClock(service.scheduledCloseAt)}`
                    : `Loket melayani sejak ${formatClock(service.openedAt)}`
                  : service.lastClosedAt
                    ? `Terakhir ditutup ${formatDayTime(service.lastClosedAt)}`
                    : "Loket zakat belum dibuka"}
              </span>
            </div>

            {service.isOpen && service.note && (
              <p className="relative mt-2 text-xs leading-relaxed text-white/85">{service.note}</p>
            )}
          </section>

          {/* Masa penerimaan */}
          <SectionCard delay={120}>
            <SectionTitle
              icon={CalendarRange}
              aside={
                <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", phaseBadge[phase].className)}>
                  {phaseBadge[phase].label}
                </span>
              }
            >
              Masa Penerimaan Zakat
            </SectionTitle>

            <p className="text-[15px] font-semibold leading-snug">{period.name}</p>
            <p className="text-xs text-muted-foreground">
              {period.hijri_year} H / {period.gregorian_year} M
            </p>

            {start && end ? (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-muted/50 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Dibuka</p>
                    <p className="mt-0.5 text-sm font-semibold">{formatShortDate(start)}</p>
                    <p className="text-[11px] text-muted-foreground">{start.toLocaleDateString("id-ID", { weekday: "long" })}</p>
                  </div>
                  <div className="rounded-2xl bg-muted/50 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Ditutup</p>
                    <p className="mt-0.5 text-sm font-semibold">{formatShortDate(end)}</p>
                    <p className="text-[11px] text-muted-foreground">{end.toLocaleDateString("id-ID", { weekday: "long" })}</p>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-[width] duration-700"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {phase === "upcoming" && `Dibuka ${daysLeft} hari lagi · ${totalDays} hari penerimaan`}
                    {phase === "ongoing" && `Sisa ${daysLeft} hari lagi dari ${totalDays} hari penerimaan`}
                    {phase === "ended" && `Penerimaan berakhir ${formatLongDate(end)}`}
                  </p>
                </div>
              </>
            ) : (
              <p className="mt-3 rounded-2xl bg-muted/50 p-3 text-xs text-muted-foreground">
                Jadwal pembukaan akan diumumkan oleh panitia.
              </p>
            )}

            {period.description && (
              <p className="mt-3 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
                {period.description}
              </p>
            )}
          </SectionCard>

          {/* Besaran zakat */}
          <SectionCard delay={180}>
            <SectionTitle icon={Scale}>Besaran Zakat</SectionTitle>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 to-card p-3">
                <div className="flex items-center gap-1.5 text-amber-700">
                  <Wheat className="h-4 w-4" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Beras</span>
                </div>
                <p className="mt-1.5 text-xl font-bold tabular-nums">{formatKg(ricePerPerson)}</p>
                <p className="text-[11px] text-muted-foreground">per jiwa</p>
              </div>
              <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-card p-3">
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <HandCoins className="h-4 w-4" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Uang</span>
                </div>
                <p className="mt-1.5 text-xl font-bold tabular-nums">{cashPerPerson > 0 ? formatCurrency(cashPerPerson) : "-"}</p>
                <p className="text-[11px] text-muted-foreground">per jiwa</p>
              </div>
            </div>

            {/* Kalkulator sederhana */}
            <div className="mt-3 rounded-2xl border border-dashed border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium">Hitung untuk keluarga</p>
                  <p className="text-[11px] text-muted-foreground">Jumlah jiwa yang dibayarkan</p>
                </div>
                <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-1">
                  <button
                    type="button"
                    aria-label="Kurangi jiwa"
                    onClick={() => setJiwa((value) => Math.max(1, value - 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-card shadow-sm transition active:scale-95 disabled:opacity-40"
                    disabled={jiwa <= 1}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center text-sm font-bold tabular-nums">{jiwa}</span>
                  <button
                    type="button"
                    aria-label="Tambah jiwa"
                    onClick={() => setJiwa((value) => Math.min(50, value + 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-card shadow-sm transition active:scale-95"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-primary/[0.07] px-3 py-2 text-sm">
                <span className="font-semibold tabular-nums">{formatKg(ricePerPerson * jiwa)}</span>
                <span className="text-[11px] text-muted-foreground">atau</span>
                <span className="font-semibold tabular-nums">{cashPerPerson > 0 ? formatCurrency(cashPerPerson * jiwa) : "-"}</span>
              </div>
            </div>

            {(fidyahPerDay > 0 || nisabValue > 0) && (
              <dl className="mt-3 divide-y divide-border/60 text-xs">
                {fidyahPerDay > 0 && (
                  <div className="flex items-center justify-between gap-3 py-2">
                    <dt className="text-muted-foreground">Fidyah per hari</dt>
                    <dd className="font-semibold tabular-nums">{formatCurrency(fidyahPerDay)}</dd>
                  </div>
                )}
                {nisabValue > 0 && (
                  <div className="flex items-center justify-between gap-3 py-2">
                    <dt className="text-muted-foreground">
                      Nisab zakat mal <span className="text-[10px]">({NISAB_GOLD_GRAMS} g emas)</span>
                    </dt>
                    <dd className="font-semibold tabular-nums">{formatCurrency(nisabValue)}</dd>
                  </div>
                )}
                {nisabValue > 0 && (
                  <div className="flex items-center justify-between gap-3 py-2">
                    <dt className="text-muted-foreground">Kadar zakat mal</dt>
                    <dd className="font-semibold">2,5%</dd>
                  </div>
                )}
              </dl>
            )}
          </SectionCard>

          {/* Ringkasan penerimaan (kecil) */}
          <SectionCard delay={240} className="p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <p className="text-xs font-semibold text-muted-foreground">Zakat fitrah terkumpul</p>
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 animate-glow-pulse" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                Live
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Uang", value: received.cash, format: formatCurrency, icon: Banknote, tone: "text-emerald-600 bg-emerald-500/10" },
                { label: "Beras", value: received.rice, format: formatKg, icon: Wheat, tone: "text-amber-600 bg-amber-500/10" },
                { label: "Muzakki", value: received.payers, format: formatCount, icon: Users, tone: "text-sky-600 bg-sky-500/10" },
                { label: "Jiwa", value: received.jiwa, format: formatCount, icon: HandCoins, tone: "text-violet-600 bg-violet-500/10" },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center gap-2 rounded-2xl bg-muted/40 p-2.5">
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", stat.tone)}>
                    <stat.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                    <AnimatedNumber
                      value={stat.value}
                      format={stat.format}
                      className="block truncate text-sm font-bold tabular-nums"
                    />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Footer */}
        <footer className="mt-5 flex flex-col items-center gap-3 text-center">
          <Link
            href="/tv"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border/70 bg-card px-4 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-primary"
          >
            <MonitorPlay className="h-4 w-4" />
            Lihat papan live lengkap
          </Link>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
            Diperbarui {new Date(dataUpdatedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
          </button>
          <p className="text-[11px] text-muted-foreground/80">
            Semoga Allah SWT menerima zakat dan amal ibadah kita. Aamiin.
          </p>
        </footer>
      </main>
    </div>
  );
}

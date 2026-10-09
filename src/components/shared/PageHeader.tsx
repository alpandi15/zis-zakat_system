import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/useCountUp";
import type { LucideIcon } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Angka beranimasi                                                    */
/* ------------------------------------------------------------------ */

export function AnimatedNumber({
  value,
  format,
  className,
  duration,
}: {
  value: number;
  format: (value: number) => string;
  className?: string;
  duration?: number;
}) {
  const animated = useCountUp(value, duration);
  return <span className={className}>{format(animated)}</span>;
}

/* ------------------------------------------------------------------ */
/* Palet aksen                                                         */
/* ------------------------------------------------------------------ */

export type AccentTone = "primary" | "amber" | "sky" | "violet" | "rose" | "cyan" | "neutral";

const TONES: Record<
  AccentTone,
  { surface: string; glow: string; icon: string; ring: string; bar: string; text: string }
> = {
  primary: {
    surface: "from-emerald-500/[0.10] via-card to-card",
    glow: "bg-emerald-500/20",
    icon: "bg-gradient-to-br from-emerald-500 to-emerald-400 text-white shadow-emerald-500/30",
    ring: "border-emerald-500/25",
    bar: "from-emerald-500 to-emerald-400",
    text: "text-emerald-600",
  },
  amber: {
    surface: "from-amber-500/[0.10] via-card to-card",
    glow: "bg-amber-500/20",
    icon: "bg-gradient-to-br from-amber-500 to-amber-400 text-white shadow-amber-500/30",
    ring: "border-amber-500/25",
    bar: "from-amber-500 to-amber-400",
    text: "text-amber-600",
  },
  sky: {
    surface: "from-sky-500/[0.10] via-card to-card",
    glow: "bg-sky-500/20",
    icon: "bg-gradient-to-br from-sky-500 to-sky-400 text-white shadow-sky-500/30",
    ring: "border-sky-500/25",
    bar: "from-sky-500 to-sky-400",
    text: "text-sky-600",
  },
  violet: {
    surface: "from-violet-500/[0.10] via-card to-card",
    glow: "bg-violet-500/20",
    icon: "bg-gradient-to-br from-violet-500 to-violet-400 text-white shadow-violet-500/30",
    ring: "border-violet-500/25",
    bar: "from-violet-500 to-violet-400",
    text: "text-violet-600",
  },
  rose: {
    surface: "from-rose-500/[0.10] via-card to-card",
    glow: "bg-rose-500/20",
    icon: "bg-gradient-to-br from-rose-500 to-rose-400 text-white shadow-rose-500/30",
    ring: "border-rose-500/25",
    bar: "from-rose-500 to-rose-400",
    text: "text-rose-600",
  },
  cyan: {
    surface: "from-cyan-500/[0.10] via-card to-card",
    glow: "bg-cyan-500/20",
    icon: "bg-gradient-to-br from-cyan-500 to-cyan-400 text-white shadow-cyan-500/30",
    ring: "border-cyan-500/25",
    bar: "from-cyan-500 to-cyan-400",
    text: "text-cyan-600",
  },
  neutral: {
    surface: "from-foreground/[0.05] via-card to-card",
    glow: "bg-foreground/10",
    icon: "bg-gradient-to-br from-slate-600 to-slate-500 text-white shadow-slate-500/25",
    ring: "border-border/70",
    bar: "from-slate-500 to-slate-400",
    text: "text-foreground",
  },
};

/* ------------------------------------------------------------------ */
/* Hero halaman                                                        */
/* ------------------------------------------------------------------ */

interface PageHeroProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  eyebrow?: string;
  badges?: ReactNode;
  actions?: ReactNode;
  /** Angka utama yang ditonjolkan di sisi kanan hero. */
  highlight?: { label: string; value: string; hint?: string };
  tone?: AccentTone;
  className?: string;
}

/** Kepala halaman dengan latar gradien dan angka utama. */
export function PageHero({
  title,
  description,
  icon: Icon,
  eyebrow,
  badges,
  actions,
  highlight,
  tone = "primary",
  className,
}: PageHeroProps) {
  const palette = TONES[tone];

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl border bg-gradient-to-br p-4 opacity-0 shadow-sm animate-rise motion-reduce:animate-none motion-reduce:opacity-100 sm:p-6",
        palette.ring,
        palette.surface,
        className,
      )}
    >
      <div className={cn("pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full blur-3xl", palette.glow)} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(hsl(var(--foreground)/0.03)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--foreground)/0.03)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]" />

      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          {Icon && (
            <div className={cn("shrink-0 rounded-2xl p-2.5 shadow-lg sm:p-3", palette.icon)}>
              <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
            )}
            <h2 className="mt-0.5 truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
            {description && <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{description}</p>}
            {badges && <div className="mt-2.5 flex flex-wrap items-center gap-2">{badges}</div>}
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          {highlight && (
            <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-2.5 backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {highlight.label}
              </p>
              <p className={cn("text-xl font-semibold tabular-nums sm:text-2xl", palette.text)}>{highlight.value}</p>
              {highlight.hint && <p className="text-[11px] text-muted-foreground tabular-nums">{highlight.hint}</p>}
            </div>
          )}
          {actions && <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Kepala halaman sederhana (dipakai halaman data master)              */
/* ------------------------------------------------------------------ */

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  badges?: ReactNode;
  actions?: ReactNode;
  tone?: AccentTone;
  className?: string;
}

export function PageHeader({ title, description, icon, badges, actions, tone = "primary", className }: PageHeaderProps) {
  return (
    <PageHero
      title={title}
      description={description}
      icon={icon}
      badges={badges}
      actions={actions}
      tone={tone}
      className={className}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Kartu statistik                                                     */
/* ------------------------------------------------------------------ */

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: AccentTone;
  /** Nilai 0-100 untuk bar tipis di bawah kartu. */
  progress?: number;
  /** Jeda animasi masuk, untuk efek bertahap antar kartu. */
  delay?: number;
  className?: string;
}

/** Kartu angka ringkas yang dipakai lintas halaman. */
export function StatTile({ label, value, hint, icon: Icon, tone = "neutral", progress, delay = 0, className }: StatTileProps) {
  const palette = TONES[tone];

  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-3.5 opacity-0 shadow-sm transition-all duration-300 animate-rise motion-reduce:animate-none motion-reduce:opacity-100 hover:-translate-y-1 hover:shadow-lg sm:p-4",
        palette.ring,
        palette.surface,
        className,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full blur-2xl transition-opacity duration-300 group-hover:opacity-80",
          palette.glow,
        )}
      />
      <div className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:animate-sheen" />

      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:text-[11px]">
          {label}
        </p>
        {Icon && (
          <div
            className={cn(
              "shrink-0 rounded-xl p-2 shadow-md transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3",
              palette.icon,
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>

      <p className="relative mt-2 text-xl font-semibold leading-tight tracking-tight tabular-nums sm:text-2xl">{value}</p>
      {hint && <p className="relative mt-0.5 text-[11px] text-muted-foreground tabular-nums">{hint}</p>}

      {progress !== undefined && (
        <div className="relative mt-2.5 h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
          <div
            className={cn("h-full rounded-full bg-gradient-to-r transition-[width] duration-1000 ease-out", palette.bar)}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}

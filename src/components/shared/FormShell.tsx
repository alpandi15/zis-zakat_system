import { ReactNode } from "react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/** Kelas untuk DialogContent form: header & footer menempel, isi form yang menggulir. */
export const FORM_DIALOG_CONTENT_CLASS =
  "flex max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[calc(100vw-0.9rem)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[92dvh] sm:max-w-2xl sm:gap-0 sm:p-0";

export function FormDialogHeader({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
}) {
  return (
    <DialogHeader className="relative shrink-0 space-y-0 overflow-hidden border-b border-border/60 bg-gradient-to-br from-primary/[0.12] via-card to-card px-4 py-4 sm:px-6 sm:py-5">
      <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative flex items-center gap-3 pr-8">
        {Icon && (
          <div className="rounded-2xl bg-primary/15 p-2.5 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <DialogTitle className="truncate text-base sm:text-lg">{title}</DialogTitle>
          {description && (
            <DialogDescription className="mt-0.5 text-xs sm:text-sm">{description}</DialogDescription>
          )}
        </div>
      </div>
    </DialogHeader>
  );
}

/** Badan form yang menggulir sendiri. */
export function FormBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6", className)}>
      {children}
    </div>
  );
}

/** Blok isian bernomor supaya alur pengisian jelas. */
export function FormSection({
  step,
  title,
  description,
  action,
  children,
  className,
}: {
  step?: number | string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border/60 bg-muted/[0.35] p-3.5 sm:p-4", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {step !== undefined && (
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
              {step}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-tight">{title}</h3>
            {description && <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** Bar bawah yang menempel: ringkasan nilai di kiri, tombol aksi di kanan. */
export function FormFooterBar({
  summaryLabel,
  summaryValue,
  summaryHint,
  children,
}: {
  summaryLabel?: string;
  summaryValue?: string;
  summaryHint?: string;
  children: ReactNode;
}) {
  return (
    <div className="shrink-0 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {summaryValue !== undefined && (
          <div className="min-w-0">
            {summaryLabel && (
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{summaryLabel}</p>
            )}
            <p className="truncate text-lg font-semibold tabular-nums text-primary">{summaryValue}</p>
            {summaryHint && <p className="truncate text-[11px] text-muted-foreground">{summaryHint}</p>}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">{children}</div>
      </div>
    </div>
  );
}

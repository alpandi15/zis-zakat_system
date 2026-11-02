import { ReactNode } from "react";
import { Edit, Eye, HandHeart, Inbox, MapPin, Trash2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AsnafEligibilityBadges } from "@/components/shared/AsnafEligibilityBadges";
import { cn } from "@/lib/utils";

export interface MustahikRow {
  id: string;
  name: string;
  address: string | null;
  asnaf_settings: { asnaf_code: string; asnaf_name: string } | null;
  priority: string;
  distribution_rt: string | null;
  distribution_lane: string | null;
  delivery_order: number | null;
}

export const PRIORITY_LABELS: Record<string, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  urgent: "Mendesak",
};

const PRIORITY_STYLES: Record<string, { pill: string; dot: string }> = {
  low: { pill: "border-slate-200 bg-slate-50 text-slate-600", dot: "bg-slate-400" },
  medium: { pill: "border-sky-200 bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  high: { pill: "border-amber-200 bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  urgent: { pill: "border-rose-200 bg-rose-50 text-rose-700", dot: "bg-rose-500" },
};

export const isAmilRow = (item: MustahikRow) => item.asnaf_settings?.asnaf_code === "amil";

type GroupKey = "penerima" | "amil";

const GROUPS: Record<
  GroupKey,
  { title: string; description: string; icon: typeof HandHeart; accent: string; iconBox: string; headerBg: string; badge: string }
> = {
  penerima: {
    title: "Mustahik Penerima",
    description: "Fakir, miskin, dan golongan asnaf selain amil",
    icon: HandHeart,
    accent: "bg-emerald-500",
    iconBox: "bg-emerald-500/10 text-emerald-600",
    headerBg: "from-emerald-500/[0.07]",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  amil: {
    title: "Amil Zakat",
    description: "Panitia / pengelola zakat yang berhak atas bagian amil",
    icon: UserCheck,
    accent: "bg-sky-500",
    iconBox: "bg-sky-500/10 text-sky-600",
    headerBg: "from-sky-500/[0.08]",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
  },
};

function PriorityPill({ priority }: { priority: string }) {
  const style = PRIORITY_STYLES[priority] || PRIORITY_STYLES.low;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        style.pill,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      {PRIORITY_LABELS[priority] || priority}
    </span>
  );
}

function OrderPill({ value }: { value: number | null }) {
  if (typeof value !== "number") {
    return <span className="text-[11px] italic text-muted-foreground">Belum diatur</span>;
  }
  return (
    <span className="inline-flex min-w-[2.5rem] justify-center rounded-lg bg-foreground/[0.06] px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
      {value}
    </span>
  );
}

function RouteText({ item }: { item: MustahikRow }) {
  const rt = item.distribution_rt?.trim();
  const lane = item.distribution_lane?.trim();
  if (!rt && !lane) return <span className="text-xs italic text-muted-foreground">Belum diisi</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span
        className={cn(
          "whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
          rt ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {rt ? `RT ${rt}` : "RT -"}
      </span>
      <span className="whitespace-nowrap text-xs text-muted-foreground">{lane || "Gang -"}</span>
    </div>
  );
}

interface RowActionsProps {
  item: MustahikRow;
  isReadOnly?: boolean;
  onView: (item: MustahikRow) => void;
  onEdit: (item: MustahikRow) => void;
  onDelete: (item: MustahikRow) => void;
}

function RowActions({ item, isReadOnly, onView, onEdit, onDelete }: RowActionsProps) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <Button variant="ghost" size="icon" className="h-8 w-8" title="Detail" onClick={() => onView(item)}>
        <Eye className="h-4 w-4" />
      </Button>
      {!isReadOnly && (
        <>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => onEdit(item)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Hapus" onClick={() => onDelete(item)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </>
      )}
    </div>
  );
}

interface MustahikGroupedTableProps<T extends MustahikRow> {
  title: string;
  data: T[];
  totalCount: number;
  isLoading?: boolean;
  isReadOnly?: boolean;
  headerActions?: ReactNode;
  emptyMessage?: string;
  onView: (item: T) => void;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
}

/**
 * Daftar mustahik yang dipisah menjadi dua kelompok: penerima (non-amil) dan amil.
 * Layar besar memakai tabel, layar HP memakai kartu supaya tidak perlu geser horizontal.
 */
export function MustahikGroupedTable<T extends MustahikRow>({
  title,
  data,
  totalCount,
  isLoading,
  isReadOnly,
  headerActions,
  emptyMessage = "Belum ada data mustahik",
  onView,
  onEdit,
  onDelete,
}: MustahikGroupedTableProps<T>) {
  const grouped: { key: GroupKey; items: T[] }[] = (
    [
      { key: "penerima" as const, items: data.filter((item) => !isAmilRow(item)) },
      { key: "amil" as const, items: data.filter(isAmilRow) },
    ]
  ).filter((group) => group.items.length > 0);

  const actionProps = {
    isReadOnly,
    onView: onView as (item: MustahikRow) => void,
    onEdit: onEdit as (item: MustahikRow) => void,
    onDelete: onDelete as (item: MustahikRow) => void,
  };

  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="flex flex-col gap-3 pb-3 sm:gap-4 sm:pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
          <Badge variant="outline" className="rounded-full text-[11px] tabular-nums">
            {data.length}
            {data.length !== totalCount ? ` / ${totalCount}` : ""}
          </Badge>
        </div>
        {headerActions && <div className="w-full lg:w-auto">{headerActions}</div>}
      </CardHeader>

      <CardContent className="px-3 sm:px-6">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-2xl bg-muted/60" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">{totalCount > 0 ? "Tidak ada data yang cocok dengan filter." : emptyMessage}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(({ key, items }) => {
              const group = GROUPS[key];
              const GroupIcon = group.icon;

              return (
                <section key={key} className="overflow-hidden rounded-2xl border border-border/60 bg-card">
                  {/* Pemisah kelompok */}
                  <header
                    className={cn(
                      "relative flex items-center gap-3 border-b border-border/60 bg-gradient-to-r to-transparent px-3 py-2.5 sm:px-4",
                      group.headerBg,
                    )}
                  >
                    <span className={cn("absolute inset-y-0 left-0 w-1", group.accent)} />
                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", group.iconBox)}>
                      <GroupIcon className="h-[18px] w-[18px]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold tracking-tight">{group.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{group.description}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                        group.badge,
                      )}
                    >
                      {items.length.toLocaleString("id-ID")} orang
                    </span>
                  </header>

                  {/* Tabel - tablet & desktop */}
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <th className="w-12 px-4 py-2.5 text-center">No</th>
                          <th className="px-3 py-2.5">Nama & Alamat</th>
                          <th className="px-3 py-2.5">Asnaf</th>
                          <th className="px-3 py-2.5">Wilayah</th>
                          <th className="w-20 px-3 py-2.5 text-center">Urut</th>
                          <th className="w-28 px-3 py-2.5">Prioritas</th>
                          <th className="w-[112px] px-3 py-2.5 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {items.map((item, index) => (
                          <tr key={item.id} className="group transition-colors hover:bg-muted/30">
                            <td className="px-4 py-3 text-center text-xs font-medium tabular-nums text-muted-foreground">
                              {index + 1}
                            </td>
                            <td className="max-w-[340px] px-3 py-3">
                              <p className="truncate font-medium text-foreground">{item.name}</p>
                              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                {item.address || "Alamat belum diisi"}
                              </p>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className="whitespace-nowrap text-xs font-medium text-foreground/90">
                                  {item.asnaf_settings?.asnaf_name || "-"}
                                </span>
                                <AsnafEligibilityBadges asnafCode={item.asnaf_settings?.asnaf_code || ""} size="sm" />
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <RouteText item={item} />
                            </td>
                            <td className="px-3 py-3 text-center">
                              <OrderPill value={item.delivery_order} />
                            </td>
                            <td className="px-3 py-3">
                              <PriorityPill priority={item.priority} />
                            </td>
                            <td className="px-3 py-2">
                              <RowActions item={item} {...actionProps} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Kartu - HP */}
                  <ul className="divide-y divide-border/50 md:hidden">
                    {items.map((item, index) => (
                      <li key={item.id} className="px-3 py-3">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="min-w-0 text-[15px] font-semibold leading-snug">{item.name}</p>
                              <PriorityPill priority={item.priority} />
                            </div>
                            {item.address && (
                              <p className="mt-1 flex items-start gap-1 text-xs leading-relaxed text-muted-foreground">
                                <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                                <span className="line-clamp-2">{item.address}</span>
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-md border border-border/70 px-1.5 py-0.5 text-[11px] font-medium">
                                {item.asnaf_settings?.asnaf_name || "-"}
                              </span>
                              <RouteText item={item} />
                              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                Urut <OrderPill value={item.delivery_order} />
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between pl-10">
                          <AsnafEligibilityBadges asnafCode={item.asnaf_settings?.asnaf_code || ""} size="sm" />
                          <RowActions item={item} {...actionProps} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

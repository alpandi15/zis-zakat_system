import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, FileText, CheckCircle2, Clock, XCircle, UserCheck } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useAsnafSettings } from "@/hooks/useAsnafSettings";
import { compareMustahikRoute, formatMustahikRoute } from "@/lib/mustahikRoute";
import { CreatableSingleSelect } from "@/components/shared/CreatableSingleSelect";

interface DistributionSummaryTabProps {
  periodId: string;
}

interface MustahikSummary {
  id: string;
  name: string;
  asnaf: string;
  distribution_rt: string | null;
  distribution_lane: string | null;
  delivery_order: number | null;
  totalRice: number;
  totalCash: number;
  fidyahFood: number;
  deliveryStatus: string | null;
  deliveryNotes: string | null;
  deliveredAt: string | null;
  assigneeName: string | null;
  breakdown: {
    zakatFitrahRice: number;
    zakatFitrahCash: number;
    zakatMal: number;
    fidyahCash: number;
    fidyahFood: number;
  };
}

const DELIVERY_STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  pending: { label: "Belum Dikirim", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  delivered: { label: "Terkirim", variant: "default", icon: <CheckCircle2 className="h-3 w-3" /> },
  not_delivered: { label: "Tidak Terkirim", variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
};

export function DistributionSummaryTab({ periodId }: DistributionSummaryTabProps) {
  const [selectedMustahik, setSelectedMustahik] = useState<MustahikSummary | null>(null);
  const [rtFilter, setRtFilter] = useState("");
  const [laneFilter, setLaneFilter] = useState("");
  const { getLabel } = useAsnafSettings();

  // Fetch distribution assignments (source of truth for delivery status)
  const { data: assignments = [] } = useQuery({
    queryKey: ["distribution-assignments-summary", periodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribution_assignments")
        .select("mustahik_id, assigned_to, status, delivery_notes, delivered_at, assigned_at")
        .eq("period_id", periodId);
      if (error) throw error;
      
      // Fetch assignee profiles
      const userIds = [...new Set(data.map(a => a.assigned_to))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      return data.map(a => ({
        ...a,
        assignee: profileMap.get(a.assigned_to),
      }));
    },
    enabled: !!periodId,
  });

  // Fetch zakat distributions
  const { data: zakatDist = [] } = useQuery({
    queryKey: ["zakat_distributions", periodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("zakat_distributions")
        .select("mustahik_id, fund_category, cash_amount, rice_amount_kg, status")
        .eq("period_id", periodId)
        .in("status", ["distributed", "approved"]);
      if (error) throw error;
      return data;
    },
    enabled: !!periodId,
  });

  // Fetch fidyah distributions
  const { data: fidyahDist = [] } = useQuery({
    queryKey: ["fidyah_distributions", periodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fidyah_distributions")
        .select("mustahik_id, fund_category, cash_amount, food_amount_kg, status")
        .eq("period_id", periodId)
        .in("status", ["distributed", "approved"]);
      if (error) throw error;
      return data;
    },
    enabled: !!periodId,
  });

  // Fetch mustahik data
  const { data: mustahikList = [] } = useQuery({
    queryKey: ["mustahik-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mustahik")
        .select("id, name, asnaf, distribution_rt, distribution_lane, delivery_order")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Create assignment map
  const assignmentMap = useMemo(() => {
    const map = new Map<string, typeof assignments[0]>();
    assignments.forEach(a => map.set(a.mustahik_id, a));
    return map;
  }, [assignments]);

  // Calculate summary per mustahik with delivery status
  const summaryData = useMemo(() => {
    const summaryMap = new Map<string, MustahikSummary>();

    // Initialize with mustahik data
    mustahikList.forEach(m => {
      const assignment = assignmentMap.get(m.id);
      summaryMap.set(m.id, {
        id: m.id,
        name: m.name,
        asnaf: m.asnaf,
        distribution_rt: m.distribution_rt || null,
        distribution_lane: m.distribution_lane || null,
        delivery_order: m.delivery_order ?? null,
        totalRice: 0,
        totalCash: 0,
        fidyahFood: 0,
        deliveryStatus: assignment?.status || null,
        deliveryNotes: assignment?.delivery_notes || null,
        deliveredAt: assignment?.delivered_at || null,
        assigneeName: assignment?.assignee?.full_name || assignment?.assignee?.email || null,
        breakdown: {
          zakatFitrahRice: 0,
          zakatFitrahCash: 0,
          zakatMal: 0,
          fidyahCash: 0,
          fidyahFood: 0,
        },
      });
    });

    // Process zakat distributions
    zakatDist.forEach(d => {
      const summary = summaryMap.get(d.mustahik_id);
      if (!summary) return;

      const cash = d.cash_amount || 0;
      const rice = d.rice_amount_kg || 0;

      summary.totalCash += cash;
      summary.totalRice += rice;

      switch (d.fund_category) {
        case "zakat_fitrah_rice":
          summary.breakdown.zakatFitrahRice += rice;
          break;
        case "zakat_fitrah_cash":
          summary.breakdown.zakatFitrahCash += cash;
          break;
        case "zakat_mal":
          summary.breakdown.zakatMal += cash;
          break;
      }
    });

    // Process fidyah distributions
    fidyahDist.forEach(d => {
      const summary = summaryMap.get(d.mustahik_id);
      if (!summary) return;

      const cash = d.cash_amount || 0;
      const food = d.food_amount_kg || 0;

      summary.totalCash += cash;
      summary.fidyahFood += food;
      
      switch (d.fund_category) {
        case "fidyah_cash":
          summary.breakdown.fidyahCash += cash;
          break;
        case "fidyah_food":
          summary.breakdown.fidyahFood += food;
          break;
      }
    });

    // Filter only mustahik with distributions and sort by delivery status then total
    return Array.from(summaryMap.values())
      .filter(s => s.totalCash > 0 || s.totalRice > 0 || s.fidyahFood > 0)
      .sort((a, b) => {
        const statusOrder: Record<string, number> = { pending: 0, delivered: 1, not_delivered: 2 };
        const aOrder = a.deliveryStatus ? statusOrder[a.deliveryStatus] ?? 3 : 3;
        const bOrder = b.deliveryStatus ? statusOrder[b.deliveryStatus] ?? 3 : 3;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return compareMustahikRoute(a, b);
      });
  }, [mustahikList, zakatDist, fidyahDist, assignmentMap]);

  const rtOptions = useMemo(() => {
    return Array.from(
      new Set(
        summaryData
          .map((item) => item.distribution_rt?.trim() || "")
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, "id"));
  }, [summaryData]);

  const laneOptions = useMemo(() => {
    return Array.from(
      new Set(
        summaryData
          .filter((item) => !rtFilter || (item.distribution_rt?.trim() || "") === rtFilter)
          .map((item) => item.distribution_lane?.trim() || "")
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, "id"));
  }, [summaryData, rtFilter]);

  const filteredSummaryData = useMemo(() => {
    return summaryData.filter((item) => {
      const matchesRt = !rtFilter || (item.distribution_rt?.trim() || "") === rtFilter;
      const matchesLane = !laneFilter || (item.distribution_lane?.trim() || "") === laneFilter;
      return matchesRt && matchesLane;
    });
  }, [summaryData, rtFilter, laneFilter]);

  // Calculate totals
  const totals = useMemo(() => {
    return summaryData.reduce(
      (acc, s) => ({
        totalCash: acc.totalCash + s.totalCash,
        totalRice: acc.totalRice + s.totalRice,
        zakatFitrahRice: acc.zakatFitrahRice + s.breakdown.zakatFitrahRice,
        zakatFitrahCash: acc.zakatFitrahCash + s.breakdown.zakatFitrahCash,
        zakatMal: acc.zakatMal + s.breakdown.zakatMal,
        fidyahCash: acc.fidyahCash + s.breakdown.fidyahCash,
        fidyahFood: acc.fidyahFood + s.breakdown.fidyahFood,
      }),
      { totalCash: 0, totalRice: 0, zakatFitrahRice: 0, zakatFitrahCash: 0, zakatMal: 0, fidyahCash: 0, fidyahFood: 0 }
    );
  }, [summaryData]);

  // Delivery stats
  const deliveryStats = useMemo(() => {
    return {
      total: summaryData.length,
      delivered: summaryData.filter(s => s.deliveryStatus === "delivered").length,
      pending: summaryData.filter(s => s.deliveryStatus === "pending").length,
      notDelivered: summaryData.filter(s => s.deliveryStatus === "not_delivered").length,
      unassigned: summaryData.filter(s => !s.deliveryStatus).length,
    };
  }, [summaryData]);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Penerima</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{deliveryStats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-600" />
              Terkirim
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{deliveryStats.delivered}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3 text-yellow-600" />
              Belum Dikirim
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{deliveryStats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
              <XCircle className="h-3 w-3 text-red-600" />
              Tidak Terkirim
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{deliveryStats.notDelivered}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Belum Ditugaskan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-muted-foreground">{deliveryStats.unassigned}</p>
          </CardContent>
        </Card>
      </div>

      {/* Fund Totals */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Beras</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{totals.totalRice.toFixed(2)} kg</p>
            <p className="text-xs text-muted-foreground">Zakat Fitrah</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Uang</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{formatCurrency(totals.totalCash)}</p>
            <p className="text-xs text-muted-foreground">Semua sumber</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Makanan Fidyah</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{totals.fidyahFood.toFixed(2)} kg</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Zakat Mal</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{formatCurrency(totals.zakatMal)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-Mustahik Table with Delivery Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Riwayat Distribusi
          </CardTitle>
          <CardDescription>
            Status pengiriman dari distribution_assignments sebagai sumber tunggal kebenaran.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,220px)_minmax(0,220px)_1fr]">
            <CreatableSingleSelect
              value={rtFilter}
              onChange={(nextValue) => {
                setRtFilter(nextValue);
                setLaneFilter("");
              }}
              options={rtOptions}
              allowCreate={false}
              placeholder="Semua RT / Wilayah"
              searchPlaceholder="Cari RT / wilayah..."
              emptyLabel="Belum ada RT / wilayah"
              helperText="Saring riwayat distribusi berdasarkan RT."
            />
            <CreatableSingleSelect
              value={laneFilter}
              onChange={setLaneFilter}
              options={laneOptions}
              allowCreate={false}
              placeholder="Semua Gang / Jalur"
              searchPlaceholder="Cari gang / jalur..."
              emptyLabel={rtFilter ? "Belum ada gang pada RT ini" : "Belum ada gang / jalur"}
              helperText="Opsi gang mengikuti RT yang dipilih."
            />
            <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-foreground">Hasil Distribusi</p>
                <p className="text-xs text-muted-foreground">
                  Menampilkan {filteredSummaryData.length} dari {summaryData.length} penerima.
                </p>
              </div>
              {(rtFilter || laneFilter) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => {
                    setRtFilter("");
                    setLaneFilter("");
                  }}
                >
                  Reset filter
                </Button>
              )}
            </div>
          </div>

          {filteredSummaryData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {summaryData.length === 0
                ? "Belum ada distribusi untuk periode ini"
                : "Tidak ada penerima yang cocok dengan filter wilayah"}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Rute</TableHead>
                  <TableHead>Asnaf</TableHead>
                  <TableHead className="text-right">Total Beras</TableHead>
                  <TableHead className="text-right">Total Uang</TableHead>
                  <TableHead>Status Pengiriman</TableHead>
                  <TableHead>Petugas</TableHead>
                  <TableHead>Waktu Kirim</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSummaryData.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{formatMustahikRoute(s) || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.asnaf === "amil" ? "default" : "outline"}>
                        {getLabel(s.asnaf)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {s.totalRice > 0 ? `${s.totalRice.toFixed(2)} kg` : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.totalCash > 0 ? formatCurrency(s.totalCash) : "-"}
                    </TableCell>
                    <TableCell>
                      {s.deliveryStatus ? (
                        <Badge 
                          variant={DELIVERY_STATUS_CONFIG[s.deliveryStatus]?.variant || "secondary"}
                          className="flex items-center gap-1 w-fit"
                        >
                          {DELIVERY_STATUS_CONFIG[s.deliveryStatus]?.icon}
                          {DELIVERY_STATUS_CONFIG[s.deliveryStatus]?.label || s.deliveryStatus}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Belum Ditugaskan</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.assigneeName ? (
                        <span className="flex items-center gap-1 text-sm">
                          <UserCheck className="h-3 w-3" />
                          {s.assigneeName}
                        </span>
                      ) : "-"}
                    </TableCell>
                    <TableCell>
                      {s.deliveredAt 
                        ? format(new Date(s.deliveredAt), "dd MMM yyyy HH:mm", { locale: idLocale })
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedMustahik(s)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedMustahik} onOpenChange={() => setSelectedMustahik(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rincian Distribusi - {selectedMustahik?.name}</DialogTitle>
          </DialogHeader>
          {selectedMustahik && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant={selectedMustahik.asnaf === "amil" ? "default" : "outline"}>
                  {getLabel(selectedMustahik.asnaf)}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatMustahikRoute(selectedMustahik) || "Rute belum diatur"}</span>
                {selectedMustahik.deliveryStatus && (
                  <Badge 
                    variant={DELIVERY_STATUS_CONFIG[selectedMustahik.deliveryStatus]?.variant || "secondary"}
                    className="flex items-center gap-1"
                  >
                    {DELIVERY_STATUS_CONFIG[selectedMustahik.deliveryStatus]?.icon}
                    {DELIVERY_STATUS_CONFIG[selectedMustahik.deliveryStatus]?.label}
                  </Badge>
                )}
              </div>

              {/* Delivery Info */}
              {selectedMustahik.deliveryStatus && (
                <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                  <h4 className="font-medium text-sm">Info Pengiriman</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Petugas</p>
                      <p className="font-medium">{selectedMustahik.assigneeName || "-"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Waktu Kirim</p>
                      <p className="font-medium">
                        {selectedMustahik.deliveredAt 
                          ? format(new Date(selectedMustahik.deliveredAt), "dd MMM yyyy HH:mm", { locale: idLocale })
                          : "-"}
                      </p>
                    </div>
                    {selectedMustahik.deliveryNotes && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground text-xs">Catatan Pengiriman</p>
                        <p>{selectedMustahik.deliveryNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Sumber Zakat</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-muted-foreground text-xs">Zakat Fitrah (Beras)</p>
                    <p className="font-bold">{selectedMustahik.breakdown.zakatFitrahRice.toFixed(2)} kg</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-muted-foreground text-xs">Zakat Fitrah (Uang)</p>
                    <p className="font-bold">{formatCurrency(selectedMustahik.breakdown.zakatFitrahCash)}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg col-span-2">
                    <p className="text-muted-foreground text-xs">Zakat Mal</p>
                    <p className="font-bold">{formatCurrency(selectedMustahik.breakdown.zakatMal)}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium text-sm">Sumber Fidyah</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-muted-foreground text-xs">Fidyah (Uang)</p>
                    <p className="font-bold">{formatCurrency(selectedMustahik.breakdown.fidyahCash)}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-muted-foreground text-xs">Fidyah (Makanan)</p>
                    <p className="font-bold">{selectedMustahik.breakdown.fidyahFood.toFixed(2)} kg</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-muted-foreground text-sm">Total Beras</p>
                    <p className="text-lg font-bold">{selectedMustahik.totalRice.toFixed(2)} kg</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Total Uang</p>
                    <p className="text-lg font-bold">{formatCurrency(selectedMustahik.totalCash)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Fidyah Makanan</p>
                    <p className="text-lg font-bold">{selectedMustahik.fidyahFood.toFixed(2)} kg</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

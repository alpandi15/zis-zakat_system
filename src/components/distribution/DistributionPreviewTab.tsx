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
import { Eye, FileText, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { useDistributionCalculation, type AmilDistributionMode } from "@/hooks/useDistributionCalculation";
import { useAsnafSettings } from "@/hooks/useAsnafSettings";
import { compareMustahikRoute, formatMustahikRoute } from "@/lib/mustahikRoute";
import { CreatableSingleSelect } from "@/components/shared/CreatableSingleSelect";

interface DistributionPreviewTabProps {
  periodId: string;
  amilDistributionMode: AmilDistributionMode;
  amilShareFactor: number;
}

interface RecipientPreview {
  id: string;
  name: string;
  asnaf: string;
  isAmil: boolean;
  distribution_rt: string | null;
  distribution_lane: string | null;
  delivery_order: number | null;
  totalRice: number;
  totalCash: number;
  totalFood: number;
  breakdown: {
    zakatFitrahRice: number;
    zakatFitrahCash: number;
    zakatMal: number;
    fidyahCash: number;
    fidyahFood: number;
  };
}

export function DistributionPreviewTab({
  periodId,
  amilDistributionMode,
  amilShareFactor,
}: DistributionPreviewTabProps) {
  const [selectedRecipient, setSelectedRecipient] = useState<RecipientPreview | null>(null);
  const [rtFilter, setRtFilter] = useState("");
  const [laneFilter, setLaneFilter] = useState("");
  const { getLabel } = useAsnafSettings();

  // Fetch fund balances
  const { data: fundBalances = [] } = useQuery({
    queryKey: ["fund-balances", periodId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_all_fund_balances", {
        _period_id: periodId,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!periodId,
  });

  // Fetch mustahik list with family members and asnaf_settings (excluding soft-deleted)
  const { data: mustahikList = [] } = useQuery({
    queryKey: ["mustahik-active-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mustahik")
        .select("id, name, asnaf_id, priority, family_members, distribution_rt, distribution_lane, delivery_order, asnaf_settings(asnaf_code)")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data as {
        id: string;
        name: string;
        asnaf_id: string;
        priority: string;
        family_members: number;
        distribution_rt: string | null;
        distribution_lane: string | null;
        delivery_order: number | null;
        asnaf_settings: { asnaf_code: string } | null;
      }[];
    },
  });

  // Fetch existing distributions (to exclude already distributed)
  const { data: zakatDist = [] } = useQuery({
    queryKey: ["zakat_distributions", periodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("zakat_distributions")
        .select("mustahik_id, fund_category, status")
        .eq("period_id", periodId);
      if (error) throw error;
      return data;
    },
    enabled: !!periodId,
  });

  const { data: fidyahDist = [] } = useQuery({
    queryKey: ["fidyah_distributions", periodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fidyah_distributions")
        .select("mustahik_id, fund_category, status")
        .eq("period_id", periodId);
      if (error) throw error;
      return data;
    },
    enabled: !!periodId,
  });

  // Combine existing distributions
  const allExistingDistributions = useMemo(() => {
    return [...zakatDist, ...fidyahDist].map(d => ({
      mustahik_id: d.mustahik_id,
      fund_category: d.fund_category,
      status: d.status,
    }));
  }, [zakatDist, fidyahDist]);

  // Calculate distributions
  const calculations = useDistributionCalculation(
    mustahikList,
    fundBalances,
    allExistingDistributions,
    {
      amilDistributionMode,
      amilShareFactor,
    }
  );

  // Build preview data
  const previewData = useMemo(() => {
    const recipientMap = new Map<string, RecipientPreview>();

    // Initialize with mustahik data
    mustahikList.forEach(m => {
      const asnafCode = m.asnaf_settings?.asnaf_code || "";
      recipientMap.set(m.id, {
        id: m.id,
        name: m.name,
        asnaf: asnafCode,
        isAmil: asnafCode === "amil",
        distribution_rt: m.distribution_rt || null,
        distribution_lane: m.distribution_lane || null,
        delivery_order: m.delivery_order ?? null,
        totalRice: 0,
        totalCash: 0,
        totalFood: 0,
        breakdown: {
          zakatFitrahRice: 0,
          zakatFitrahCash: 0,
          zakatMal: 0,
          fidyahCash: 0,
          fidyahFood: 0,
        },
      });
    });

    // Process Zakat Fitrah Rice
    [...calculations.zakatFitrahRice.amil, ...calculations.zakatFitrahRice.beneficiaries].forEach(r => {
      const recipient = recipientMap.get(r.mustahikId);
      if (recipient) {
        recipient.totalRice += r.riceAmount || 0;
        recipient.breakdown.zakatFitrahRice += r.riceAmount || 0;
      }
    });

    // Process Zakat Fitrah Cash
    [...calculations.zakatFitrahCash.amil, ...calculations.zakatFitrahCash.beneficiaries].forEach(r => {
      const recipient = recipientMap.get(r.mustahikId);
      if (recipient) {
        recipient.totalCash += r.cashAmount || 0;
        recipient.breakdown.zakatFitrahCash += r.cashAmount || 0;
      }
    });

    // Process Zakat Mal
    [...calculations.zakatMal.amil, ...calculations.zakatMal.beneficiaries].forEach(r => {
      const recipient = recipientMap.get(r.mustahikId);
      if (recipient) {
        recipient.totalCash += r.cashAmount || 0;
        recipient.breakdown.zakatMal += r.cashAmount || 0;
      }
    });

    // Process Fidyah Cash
    [...calculations.fidyahCash.amil, ...calculations.fidyahCash.beneficiaries].forEach(r => {
      const recipient = recipientMap.get(r.mustahikId);
      if (recipient) {
        recipient.totalCash += r.cashAmount || 0;
        recipient.breakdown.fidyahCash += r.cashAmount || 0;
      }
    });

    // Process Fidyah Food
    [...calculations.fidyahFood.amil, ...calculations.fidyahFood.beneficiaries].forEach(r => {
      const recipient = recipientMap.get(r.mustahikId);
      if (recipient) {
        recipient.totalFood += r.foodAmount || 0;
        recipient.breakdown.fidyahFood += r.foodAmount || 0;
      }
    });

    // Filter only recipients with allocations
    return Array.from(recipientMap.values())
      .filter(r => r.totalCash > 0 || r.totalRice > 0 || r.totalFood > 0)
      .sort((a, b) => {
        const routeCompare = compareMustahikRoute(a, b);
        if (routeCompare !== 0) return routeCompare;
        return a.asnaf.localeCompare(b.asnaf);
      });
  }, [mustahikList, calculations]);

  const rtOptions = useMemo(() => {
    return Array.from(
      new Set(
        previewData
          .map((recipient) => recipient.distribution_rt?.trim() || "")
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, "id"));
  }, [previewData]);

  const laneOptions = useMemo(() => {
    return Array.from(
      new Set(
        previewData
          .filter((recipient) => !rtFilter || (recipient.distribution_rt?.trim() || "") === rtFilter)
          .map((recipient) => recipient.distribution_lane?.trim() || "")
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, "id"));
  }, [previewData, rtFilter]);

  const filteredPreviewData = useMemo(() => {
    return previewData.filter((recipient) => {
      const matchesRt = !rtFilter || (recipient.distribution_rt?.trim() || "") === rtFilter;
      const matchesLane = !laneFilter || (recipient.distribution_lane?.trim() || "") === laneFilter;
      return matchesRt && matchesLane;
    });
  }, [previewData, rtFilter, laneFilter]);

  // Calculate totals
  const totals = useMemo(() => {
    const amilData = previewData.filter(r => r.isAmil);
    const beneficiaryData = previewData.filter(r => !r.isAmil);
    
    return {
      amilCount: amilData.length,
      beneficiaryCount: beneficiaryData.length,
      totalRice: previewData.reduce((acc, r) => acc + r.totalRice, 0),
      totalCash: previewData.reduce((acc, r) => acc + r.totalCash, 0),
      totalFood: previewData.reduce((acc, r) => acc + r.totalFood, 0),
      zakatFitrahRice: previewData.reduce((acc, r) => acc + r.breakdown.zakatFitrahRice, 0),
      zakatFitrahCash: previewData.reduce((acc, r) => acc + r.breakdown.zakatFitrahCash, 0),
      zakatMal: previewData.reduce((acc, r) => acc + r.breakdown.zakatMal, 0),
      fidyahCash: previewData.reduce((acc, r) => acc + r.breakdown.fidyahCash, 0),
      fidyahFood: previewData.reduce((acc, r) => acc + r.breakdown.fidyahFood, 0),
    };
  }, [previewData]);

  return (
    <div className="space-y-4">
      {/* Info Banner */}
      <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-700 dark:text-blue-300">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <p>
          Data ini adalah <strong>simulasi</strong> jumlah yang akan dialokasikan, berdasarkan saldo dana saat ini.
          Data bersifat baca-saja dan tidak mengubah status pendistribusian. Mode porsi amil:{" "}
          <strong>
            {amilDistributionMode === "percentage"
              ? `Persentase Tetap (${(calculations.configuration.amilPercentage * 100).toFixed(1)}%)`
              : `Rasio x Faktor (${(calculations.configuration.amilShareFactor * 100).toFixed(0)}%)`}
          </strong>.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Amil</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.amilCount}</p>
            <p className="text-xs text-muted-foreground">penerima</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Mustahik Lain</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.beneficiaryCount}</p>
            <p className="text-xs text-muted-foreground">penerima</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Beras</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.totalRice.toFixed(2)} kg</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Uang</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totals.totalCash)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Makanan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.totalFood.toFixed(2)} kg</p>
            <p className="text-xs text-muted-foreground">Fidyah</p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown by Source */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Rincian per Sumber Dana (Simulasi)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-5 text-sm">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-muted-foreground text-xs">Zakat Fitrah (Beras)</p>
              <p className="font-bold">{totals.zakatFitrahRice.toFixed(2)} kg</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-muted-foreground text-xs">Zakat Fitrah (Uang)</p>
              <p className="font-bold">{formatCurrency(totals.zakatFitrahCash)}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-muted-foreground text-xs">Zakat Mal</p>
              <p className="font-bold">{formatCurrency(totals.zakatMal)}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-muted-foreground text-xs">Fidyah (Uang)</p>
              <p className="font-bold">{formatCurrency(totals.fidyahCash)}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-muted-foreground text-xs">Fidyah (Makanan)</p>
              <p className="font-bold">{totals.fidyahFood.toFixed(2)} kg</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-Recipient Table */}
      <Card>
        <CardHeader>
        <CardTitle className="text-base">Daftar Penerima (Simulasi)</CardTitle>
        <CardDescription>
            Simulasi total yang akan diterima setiap penerima sebelum pendistribusian dilakukan.
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
              helperText="Saring simulasi penerima berdasarkan RT."
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
                <p className="font-medium text-foreground">Hasil Simulasi</p>
                <p className="text-xs text-muted-foreground">
                  Menampilkan {filteredPreviewData.length} dari {previewData.length} penerima.
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

          {filteredPreviewData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {previewData.length === 0
                ? "Tidak ada penerima yang layak terima atau saldo dana kosong"
                : "Tidak ada penerima yang cocok dengan filter wilayah"}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Rute</TableHead>
                  <TableHead>Asnaf</TableHead>
                  <TableHead className="text-right">Beras (kg)</TableHead>
                  <TableHead className="text-right">Uang</TableHead>
                  <TableHead className="text-right">Makanan (kg)</TableHead>
                  <TableHead className="text-right">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPreviewData.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{formatMustahikRoute(r) || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.isAmil ? "default" : "outline"}>
                        {getLabel(r.asnaf)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.totalRice > 0 ? r.totalRice.toFixed(2) : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.totalCash > 0 ? formatCurrency(r.totalCash) : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.totalFood > 0 ? r.totalFood.toFixed(2) : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedRecipient(r)}
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
      <Dialog open={!!selectedRecipient} onOpenChange={() => setSelectedRecipient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rincian Simulasi - {selectedRecipient?.name}</DialogTitle>
          </DialogHeader>
          {selectedRecipient && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant={selectedRecipient.isAmil ? "default" : "outline"}>
                  {getLabel(selectedRecipient.asnaf)}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatMustahikRoute(selectedRecipient) || "Rute belum diatur"}</span>
                {selectedRecipient.isAmil && (
                  <span className="text-xs text-muted-foreground">
                    (Porsi amil mengikuti mode simulasi alokasi aktif)
                  </span>
                )}
              </div>
              
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Sumber Zakat</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-muted-foreground text-xs">Zakat Fitrah (Beras)</p>
                    <p className="font-bold">{selectedRecipient.breakdown.zakatFitrahRice.toFixed(2)} kg</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-muted-foreground text-xs">Zakat Fitrah (Uang)</p>
                    <p className="font-bold">{formatCurrency(selectedRecipient.breakdown.zakatFitrahCash)}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg col-span-2">
                    <p className="text-muted-foreground text-xs">Zakat Mal</p>
                    <p className="font-bold">{formatCurrency(selectedRecipient.breakdown.zakatMal)}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium text-sm">Sumber Fidyah</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-muted-foreground text-xs">Fidyah (Uang)</p>
                    <p className="font-bold">{formatCurrency(selectedRecipient.breakdown.fidyahCash)}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-muted-foreground text-xs">Fidyah (Makanan)</p>
                    <p className="font-bold">{selectedRecipient.breakdown.fidyahFood.toFixed(2)} kg</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-muted-foreground text-sm">Total Beras</p>
                    <p className="text-xl font-bold">{selectedRecipient.totalRice.toFixed(2)} kg</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Total Uang</p>
                    <p className="text-xl font-bold">{formatCurrency(selectedRecipient.totalCash)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Total Makanan</p>
                    <p className="text-xl font-bold">{selectedRecipient.totalFood.toFixed(2)} kg</p>
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

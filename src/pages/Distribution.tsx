import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ReadOnlyBanner } from "@/components/shared/ReadOnlyBanner";
import { DistributionSummaryTab } from "@/components/distribution/DistributionSummaryTab";
import { DistributionPreviewTab } from "@/components/distribution/DistributionPreviewTab";
import { DistributionAssignmentTab } from "@/components/distribution/DistributionAssignmentTab";
import { usePeriod } from "@/contexts/PeriodContext";
import { useAsnafSettings } from "@/hooks/useAsnafSettings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Eye, Calculator, Users, UserCheck, FileText, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useDistributionCalculation } from "@/hooks/useDistributionCalculation";
import { formatCurrency } from "@/lib/formatCurrency";
import type { Enums } from "@/integrations/supabase/types";

const FUND_CATEGORY_LABELS: Record<string, string> = {
  zakat_fitrah_cash: "Zakat Fitrah (Uang)",
  zakat_fitrah_rice: "Zakat Fitrah (Beras)",
  zakat_mal: "Zakat Mal",
  fidyah_cash: "Fidyah (Uang)",
  fidyah_food: "Fidyah (Makanan)",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Mendesak",
  high: "Tinggi",
  medium: "Sedang",
  low: "Rendah",
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Menunggu", variant: "secondary" },
  approved: { label: "Disetujui", variant: "default" },
  distributed: { label: "Disalurkan", variant: "outline" },
  cancelled: { label: "Dibatalkan", variant: "destructive" },
};

interface Distribution {
  id: string;
  period_id: string;
  mustahik_id: string;
  fund_category: string;
  distribution_date: string;
  status: "pending" | "approved" | "distributed" | "cancelled";
  cash_amount: number | null;
  rice_amount_kg?: number | null;
  food_amount_kg?: number | null;
  notes: string | null;
  mustahik?: { name: string; asnaf: string };
}

interface FundBalance {
  category: string;
  total_cash: number;
  total_rice_kg: number;
  total_food_kg: number;
}

type DistributionType = "zakat" | "fidyah" | "preview" | "assignment" | "summary";
type FundCategory = Enums<"fund_category">;
type DistributionStatus = Enums<"distribution_status">;

export default function Distribution() {
  const { isReadOnly, selectedPeriod } = usePeriod();
  const { toast } = useToast();
  const { getLabel } = useAsnafSettings();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<DistributionType>("zakat");
  const [viewingDistribution, setViewingDistribution] = useState<Distribution | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewCategory, setPreviewCategory] = useState<FundCategory | "">("");
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());

  const zakatCategories: FundCategory[] = ["zakat_fitrah_cash", "zakat_fitrah_rice", "zakat_mal"];
  const fidyahCategories: FundCategory[] = ["fidyah_cash", "fidyah_food"];
  const currentCategories = activeTab === "zakat" ? zakatCategories : fidyahCategories;
  const tableName = activeTab === "zakat" ? "zakat_distributions" : "fidyah_distributions";

  // Fetch fund balances
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

  // Fetch distribution assignments for delivery status
  const { data: distributionAssignments = [] } = useQuery({
    queryKey: ["distribution-assignments", selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];
      const { data, error } = await supabase
        .from("distribution_assignments")
        .select("mustahik_id, status, delivery_notes, delivered_at, assigned_to")
        .eq("period_id", selectedPeriod.id);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedPeriod?.id,
  });

  // Create a map of mustahik_id to delivery status
  const deliveryStatusMap = useMemo(() => {
    const map = new Map<string, { status: string; deliveryNotes: string | null; deliveredAt: string | null }>();
    distributionAssignments.forEach(a => {
      map.set(a.mustahik_id, {
        status: a.status,
        deliveryNotes: a.delivery_notes,
        deliveredAt: a.delivered_at,
      });
    });
    return map;
  }, [distributionAssignments]);

  // Fetch distributions for both tables
  const { data: zakatDistributions = [] } = useQuery({
    queryKey: ["zakat_distributions", selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];
      const { data, error } = await supabase
        .from("zakat_distributions")
        .select("*, mustahik:mustahik_id(name, asnaf)")
        .eq("period_id", selectedPeriod.id)
        .order("distribution_date", { ascending: false });
      if (error) throw error;
      return data as Distribution[];
    },
    enabled: !!selectedPeriod?.id,
  });

  const { data: fidyahDistributions = [] } = useQuery({
    queryKey: ["fidyah_distributions", selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];
      const { data, error } = await supabase
        .from("fidyah_distributions")
        .select("*, mustahik:mustahik_id(name, asnaf)")
        .eq("period_id", selectedPeriod.id)
        .order("distribution_date", { ascending: false });
      if (error) throw error;
      return data as Distribution[];
    },
    enabled: !!selectedPeriod?.id,
  });

  const distributions = activeTab === "zakat" ? zakatDistributions : fidyahDistributions;

  // Fetch mustahik list with family members and asnaf_settings (excluding soft-deleted)
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
      return data as { id: string; name: string; asnaf_id: string; priority: string; family_members: number; asnaf_settings: { asnaf_code: string } | null }[];
    },
  });

  // Use distribution calculation hook
  const allExistingDistributions = useMemo(() => {
    return [...zakatDistributions, ...fidyahDistributions].map(d => ({
      mustahik_id: d.mustahik_id,
      fund_category: d.fund_category,
      status: d.status,
    }));
  }, [zakatDistributions, fidyahDistributions]);

  const calculations = useDistributionCalculation(
    mustahikList,
    fundBalances,
    allExistingDistributions
  );

  const getBalance = (category: string) => {
    const balance = fundBalances.find(b => b.category === category);
    return balance || { total_cash: 0, total_rice_kg: 0, total_food_kg: 0 };
  };

  // Get calculated distribution for preview
  const getCalculatedDistribution = (category: FundCategory | "") => {
    switch (category) {
      case "zakat_fitrah_cash": return calculations.zakatFitrahCash;
      case "zakat_fitrah_rice": return calculations.zakatFitrahRice;
      case "zakat_mal": return calculations.zakatMal;
      case "fidyah_cash": return calculations.fidyahCash;
      case "fidyah_food": return calculations.fidyahFood;
      default: return { amil: [], beneficiaries: [], amilTotal: 0, beneficiaryTotal: 0 };
    }
  };

  const openPreview = (category: FundCategory) => {
    setPreviewCategory(category);
    setSelectedRecipients(new Set());
    setIsPreviewOpen(true);
  };

  // Batch distribution mutation
  const batchDistributeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPeriod?.id || selectedRecipients.size === 0) {
        throw new Error("Pilih minimal satu penerima");
      }
      if (!previewCategory) {
        throw new Error("Kategori distribusi tidak valid");
      }

      const calc = getCalculatedDistribution(previewCategory);
      const allRecipients = [...calc.amil, ...calc.beneficiaries];
      const selectedList = allRecipients.filter(r => selectedRecipients.has(r.mustahikId));

      const isZakat = previewCategory.startsWith("zakat");
      const table = isZakat ? "zakat_distributions" : "fidyah_distributions";

      for (const recipient of selectedList) {
        // Check if already distributed
        const existingDist = allExistingDistributions.find(
          d => d.mustahik_id === recipient.mustahikId && 
               d.fund_category === previewCategory &&
               (d.status === "distributed" || d.status === "approved")
        );
        
        if (existingDist) continue; // Skip already distributed

        // Create distribution record
        const insertData: {
          period_id: string;
          mustahik_id: string;
          fund_category: FundCategory;
          status: DistributionStatus;
          notes: string;
          cash_amount?: number;
          rice_amount_kg?: number;
          food_amount_kg?: number;
        } = {
          period_id: selectedPeriod.id,
          mustahik_id: recipient.mustahikId,
          fund_category: previewCategory,
          status: "distributed",
          notes: "Distribusi otomatis",
        };

        if (isZakat) {
          insertData.cash_amount = recipient.cashAmount || 0;
          insertData.rice_amount_kg = recipient.riceAmount || 0;
        } else {
          insertData.cash_amount = recipient.cashAmount || 0;
          insertData.food_amount_kg = recipient.foodAmount || 0;
        }

        const { data: dist, error: distError } = await supabase
          .from(table)
          .insert(insertData)
          .select()
          .single();

        if (distError) throw distError;

        // Create ledger entry for deduction
        const { error: ledgerError } = await supabase
          .from("fund_ledger")
          .insert([{
            period_id: selectedPeriod.id,
            category: previewCategory,
            transaction_type: "distribution" as const,
            amount_cash: -(recipient.cashAmount || 0),
            amount_rice_kg: -(recipient.riceAmount || 0),
            amount_food_kg: -(recipient.foodAmount || 0),
            reference_id: dist.id,
            reference_type: table,
            description: `Distribusi ke ${recipient.name}`,
          }]);

        if (ledgerError) throw ledgerError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zakat_distributions"] });
      queryClient.invalidateQueries({ queryKey: ["fidyah_distributions"] });
      queryClient.invalidateQueries({ queryKey: ["fund-balances"] });
      setIsPreviewOpen(false);
      setSelectedRecipients(new Set());
      toast({ title: `${selectedRecipients.size} distribusi berhasil dicatat` });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const toggleRecipient = (id: string) => {
    const newSet = new Set(selectedRecipients);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedRecipients(newSet);
  };

  const selectAll = (recipients: { mustahikId: string }[]) => {
    const distributed = allExistingDistributions
      .filter(d => d.fund_category === previewCategory && (d.status === "distributed" || d.status === "approved"))
      .map(d => d.mustahik_id);
    
    const eligible = recipients.filter(r => !distributed.includes(r.mustahikId));
    setSelectedRecipients(new Set(eligible.map(r => r.mustahikId)));
  };

  const formatCurrencyLocal = (value: number) => formatCurrency(value);

  const renderBalanceCard = (category: FundCategory) => {
    const balance = getBalance(category);
    const isCash = category.includes("cash") || category === "zakat_mal";
    const isRice = category.includes("rice");
    const calc = getCalculatedDistribution(category);
    const totalRecipients = calc.amil.length + calc.beneficiaries.length;
    
    return (
      <Card key={category} className="flex-1 min-w-[200px]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {FUND_CATEGORY_LABELS[category]}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xl font-bold">
            {isCash
              ? formatCurrencyLocal(balance.total_cash)
              : isRice
              ? `${balance.total_rice_kg} kg`
              : `${balance.total_food_kg} kg`}
          </p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{totalRecipients} penerima eligible</span>
            {!isReadOnly && totalRecipients > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => openPreview(category)}
              >
                <Calculator className="h-3 w-3 mr-1" />
                Preview
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const DELIVERY_STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Belum Dikirim", variant: "secondary" },
    delivered: { label: "Terkirim", variant: "default" },
    not_delivered: { label: "Tidak Terkirim", variant: "destructive" },
  };

  const renderDistributionTable = () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tanggal</TableHead>
          <TableHead>Penerima</TableHead>
          <TableHead>Asnaf</TableHead>
          <TableHead>Kategori</TableHead>
          <TableHead className="text-right">Jumlah</TableHead>
          <TableHead>Status Distribusi</TableHead>
          <TableHead>Status Pengiriman</TableHead>
          <TableHead className="text-right">Aksi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {distributions.map(dist => {
          const deliveryInfo = deliveryStatusMap.get(dist.mustahik_id);
          return (
            <TableRow key={dist.id}>
              <TableCell>
                {format(new Date(dist.distribution_date), "dd MMM yyyy", { locale: idLocale })}
              </TableCell>
              <TableCell className="font-medium">{dist.mustahik?.name}</TableCell>
              <TableCell>
                <Badge variant={dist.mustahik?.asnaf === "amil" ? "default" : "outline"}>
                  {getLabel(dist.mustahik?.asnaf || "")}
                </Badge>
              </TableCell>
              <TableCell>{FUND_CATEGORY_LABELS[dist.fund_category]}</TableCell>
              <TableCell className="text-right">
                {dist.fund_category.includes("cash") || dist.fund_category === "zakat_mal"
                  ? formatCurrencyLocal(dist.cash_amount || 0)
                  : dist.fund_category.includes("rice")
                  ? `${dist.rice_amount_kg || 0} kg`
                  : `${dist.food_amount_kg || 0} kg`}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_CONFIG[dist.status].variant}>
                  {STATUS_CONFIG[dist.status].label}
                </Badge>
              </TableCell>
              <TableCell>
                {deliveryInfo ? (
                  <Badge variant={DELIVERY_STATUS_CONFIG[deliveryInfo.status]?.variant || "secondary"}>
                    {DELIVERY_STATUS_CONFIG[deliveryInfo.status]?.label || deliveryInfo.status}
                  </Badge>
                ) : (
                  <Badge variant="outline">Belum Ditugaskan</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={() => setViewingDistribution(dist)}>
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  const previewCalc = getCalculatedDistribution(previewCategory);
  const distributedIds = new Set(
    allExistingDistributions
      .filter(d => d.fund_category === previewCategory && (d.status === "distributed" || d.status === "approved"))
      .map(d => d.mustahik_id)
  );

  return (
    <AppLayout title="Distribusi">
      {isReadOnly && <ReadOnlyBanner periodName={selectedPeriod?.name} />}

      <div className="space-y-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DistributionType)}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="zakat">Distribusi Zakat</TabsTrigger>
            <TabsTrigger value="fidyah">Distribusi Fidyah</TabsTrigger>
            <TabsTrigger value="preview" className="gap-1">
              <Calculator className="h-4 w-4" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="assignment" className="gap-1">
              <ClipboardList className="h-4 w-4" />
              Penugasan
            </TabsTrigger>
            <TabsTrigger value="summary" className="gap-1">
              <FileText className="h-4 w-4" />
              Riwayat
            </TabsTrigger>
          </TabsList>

          {/* Balance Cards - only show for zakat/fidyah tabs */}
          {(activeTab === "zakat" || activeTab === "fidyah") && (
            <div className="flex gap-4 flex-wrap mt-4">
              {currentCategories.map(renderBalanceCard)}
            </div>
          )}

          <TabsContent value="zakat" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                {distributions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Belum ada distribusi zakat untuk periode ini
                  </p>
                ) : (
                  renderDistributionTable()
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fidyah" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                {distributions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Belum ada distribusi fidyah untuk periode ini
                  </p>
                ) : (
                  renderDistributionTable()
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview" className="mt-4">
            {selectedPeriod?.id ? (
              <DistributionPreviewTab periodId={selectedPeriod.id} />
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Pilih periode untuk melihat preview distribusi
              </p>
            )}
          </TabsContent>

          <TabsContent value="assignment" className="mt-4">
            {selectedPeriod?.id ? (
              <DistributionAssignmentTab periodId={selectedPeriod.id} isReadOnly={isReadOnly} />
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Pilih periode untuk melihat penugasan distribusi
              </p>
            )}
          </TabsContent>

          <TabsContent value="summary" className="mt-4">
            {selectedPeriod?.id ? (
              <DistributionSummaryTab periodId={selectedPeriod.id} />
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Pilih periode untuk melihat riwayat distribusi
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Distribution Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Preview Distribusi - {FUND_CATEGORY_LABELS[previewCategory]}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Amil Section */}
            {previewCalc.amil.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <UserCheck className="h-4 w-4" />
                    Amil (12.5% = {previewCategory.includes("cash") || previewCategory === "zakat_mal"
                      ? formatCurrency(previewCalc.amilTotal)
                      : `${previewCalc.amilTotal.toFixed(2)} kg`})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={previewCalc.amil.every(a => selectedRecipients.has(a.mustahikId) || distributedIds.has(a.mustahikId))}
                            onCheckedChange={() => {
                              const eligible = previewCalc.amil.filter(a => !distributedIds.has(a.mustahikId));
                              if (eligible.every(a => selectedRecipients.has(a.mustahikId))) {
                                const newSet = new Set(selectedRecipients);
                                eligible.forEach(a => newSet.delete(a.mustahikId));
                                setSelectedRecipients(newSet);
                              } else {
                                const newSet = new Set(selectedRecipients);
                                eligible.forEach(a => newSet.add(a.mustahikId));
                                setSelectedRecipients(newSet);
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead>Nama</TableHead>
                        <TableHead className="text-right">Jumlah</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewCalc.amil.map(a => {
                        const isDistributed = distributedIds.has(a.mustahikId);
                        return (
                          <TableRow key={a.mustahikId} className={isDistributed ? "opacity-50" : ""}>
                            <TableCell>
                              <Checkbox
                                checked={selectedRecipients.has(a.mustahikId) || isDistributed}
                                disabled={isDistributed}
                                onCheckedChange={() => toggleRecipient(a.mustahikId)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{a.name}</TableCell>
                            <TableCell className="text-right">
                              {a.cashAmount > 0 ? formatCurrency(a.cashAmount) : `${a.riceAmount || a.foodAmount} kg`}
                            </TableCell>
                            <TableCell>
                              {isDistributed ? (
                                <Badge variant="outline">Sudah Disalurkan</Badge>
                              ) : (
                                <Badge variant="secondary">Belum</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Beneficiaries Section */}
            {previewCalc.beneficiaries.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Mustahik ({previewCategory.includes("zakat") ? "87.5%" : "100%"} = {
                      previewCategory.includes("cash") || previewCategory === "zakat_mal"
                        ? formatCurrency(previewCalc.beneficiaryTotal)
                        : `${previewCalc.beneficiaryTotal.toFixed(2)} kg`
                    })
                  </CardTitle>
                  <CardDescription>
                    Distribusi berdasarkan prioritas dan jumlah anggota keluarga
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => selectAll(previewCalc.beneficiaries)}
                    >
                      Pilih Semua yang Belum
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={previewCalc.beneficiaries.every(b => selectedRecipients.has(b.mustahikId) || distributedIds.has(b.mustahikId))}
                            onCheckedChange={() => {
                              const eligible = previewCalc.beneficiaries.filter(b => !distributedIds.has(b.mustahikId));
                              if (eligible.every(b => selectedRecipients.has(b.mustahikId))) {
                                const newSet = new Set(selectedRecipients);
                                eligible.forEach(b => newSet.delete(b.mustahikId));
                                setSelectedRecipients(newSet);
                              } else {
                                const newSet = new Set(selectedRecipients);
                                eligible.forEach(b => newSet.add(b.mustahikId));
                                setSelectedRecipients(newSet);
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead>Nama</TableHead>
                        <TableHead>Asnaf</TableHead>
                        <TableHead>Prioritas</TableHead>
                        <TableHead className="text-right">Jumlah</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewCalc.beneficiaries.map(b => {
                        const isDistributed = distributedIds.has(b.mustahikId);
                        return (
                          <TableRow key={b.mustahikId} className={isDistributed ? "opacity-50" : ""}>
                            <TableCell>
                              <Checkbox
                                checked={selectedRecipients.has(b.mustahikId) || isDistributed}
                                disabled={isDistributed}
                                onCheckedChange={() => toggleRecipient(b.mustahikId)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{b.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{getLabel(b.asnaf)}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{PRIORITY_LABELS[b.priority] || b.priority}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {b.cashAmount > 0 ? formatCurrency(b.cashAmount) : `${b.riceAmount || b.foodAmount} kg`}
                            </TableCell>
                            <TableCell>
                              {isDistributed ? (
                                <Badge variant="outline">Sudah Disalurkan</Badge>
                              ) : (
                                <Badge variant="secondary">Belum</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {previewCalc.amil.length === 0 && previewCalc.beneficiaries.length === 0 && (
              <p className="text-muted-foreground text-center py-8">
                Tidak ada penerima yang eligible atau saldo dana kosong
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={() => batchDistributeMutation.mutate()}
              disabled={selectedRecipients.size === 0 || batchDistributeMutation.isPending}
            >
              Distribusikan ({selectedRecipients.size} penerima)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Distribution Detail */}
      <Dialog open={!!viewingDistribution} onOpenChange={() => setViewingDistribution(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detail Distribusi</DialogTitle>
          </DialogHeader>
          {viewingDistribution && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Tanggal</p>
                  <p className="font-medium">
                    {format(new Date(viewingDistribution.distribution_date), "dd MMMM yyyy", { locale: idLocale })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Penerima</p>
                  <p className="font-medium">{viewingDistribution.mustahik?.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Asnaf</p>
                  <p className="font-medium">{getLabel(viewingDistribution.mustahik?.asnaf || "")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Kategori</p>
                  <p className="font-medium">{FUND_CATEGORY_LABELS[viewingDistribution.fund_category]}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Jumlah</p>
                  <p className="text-xl font-bold">
                    {viewingDistribution.fund_category.includes("cash") || viewingDistribution.fund_category === "zakat_mal"
                      ? formatCurrency(viewingDistribution.cash_amount || 0)
                      : viewingDistribution.fund_category.includes("rice")
                      ? `${viewingDistribution.rice_amount_kg || 0} kg`
                      : `${viewingDistribution.food_amount_kg || 0} kg`}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant={STATUS_CONFIG[viewingDistribution.status].variant}>
                    {STATUS_CONFIG[viewingDistribution.status].label}
                  </Badge>
                </div>
                {viewingDistribution.notes && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Catatan</p>
                    <p>{viewingDistribution.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

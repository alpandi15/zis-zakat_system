import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ReadOnlyBanner } from "@/components/shared/ReadOnlyBanner";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { usePeriod } from "@/contexts/PeriodContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Plus, Eye, AlertCircle, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatCurrency";

// Default nisab values (in grams)
const NISAB_GOLD_GRAMS = 85;
const DEFAULT_GOLD_PRICE = 1200000; // per gram
const ZAKAT_PERCENTAGE = 2.5;

const ZAKAT_TYPE_LABELS: Record<string, string> = {
  income: "Penghasilan",
  gold: "Emas",
  trade: "Perdagangan",
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  head_of_family: "Kepala Keluarga",
  wife: "Istri",
  child: "Anak",
  parent: "Orang Tua",
};

// Calculation mode types
type CalculationMode = "from_assets" | "from_zakat";

interface Transaction {
  id: string;
  muzakki_id: string;
  muzakki_member_id: string | null;
  period_id: string;
  zakat_type: "income" | "gold" | "trade";
  gross_amount: number;
  deductions: number | null;
  net_amount: number;
  nisab_value: number;
  is_above_nisab: boolean;
  calculated_zakat: number;
  final_zakat_amount: number;
  is_manually_overridden: boolean;
  override_reason: string | null;
  transaction_date: string;
  notes: string | null;
  muzakki?: { name: string };
  muzakki_member?: { name: string; relationship: "head_of_family" | "wife" | "child" | "parent" } | null;
}

interface MuzakkiMemberOption {
  id: string;
  name: string;
  relationship: "head_of_family" | "wife" | "child" | "parent";
  muzakki_id: string;
  muzakki?: { name: string } | null;
}

export default function ZakatMal() {
  const { isReadOnly, selectedPeriod } = usePeriod();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewingTransaction, setViewingTransaction] = useState<Transaction | null>(null);

  // Form state
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [zakatType, setZakatType] = useState<"income" | "gold" | "trade">("income");
  const [calculationMode, setCalculationMode] = useState<CalculationMode>("from_assets");
  const [grossAmount, setGrossAmount] = useState(0);
  const [deductions, setDeductions] = useState(0);
  const [directZakatInput, setDirectZakatInput] = useState(0);
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [manualAmount, setManualAmount] = useState(0);
  const [overrideReason, setOverrideReason] = useState("");
  const [notes, setNotes] = useState("");

  // Override states for nisab
  const [isOverrideGoldPrice, setIsOverrideGoldPrice] = useState(false);
  const [customGoldPrice, setCustomGoldPrice] = useState(0);

  // Get period configuration values for nisab
  const periodGoldPrice = selectedPeriod?.nisab_gold_price_per_gram ?? DEFAULT_GOLD_PRICE;

  // Use custom or period values
  const goldPricePerGram = isOverrideGoldPrice ? customGoldPrice : periodGoldPrice;
  const nisabValue = NISAB_GOLD_GRAMS * goldPricePerGram;

  // Calculated values based on mode
  const netAmount = calculationMode === "from_assets" 
    ? grossAmount - deductions 
    : (directZakatInput * 100) / ZAKAT_PERCENTAGE;
  const isAboveNisab = netAmount >= nisabValue;
  const calculatedZakat = calculationMode === "from_assets"
    ? (isAboveNisab ? (netAmount * ZAKAT_PERCENTAGE) / 100 : 0)
    : directZakatInput;
  const finalZakat = isManualOverride ? manualAmount : calculatedZakat;
  
  // Back-calculated gross for display when in from_zakat mode
  const displayGrossAmount = calculationMode === "from_assets" ? grossAmount : netAmount + deductions;

  // Fetch transactions
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["zakat-mal-transactions", selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];
      const { data, error } = await supabase
        .from("zakat_mal_transactions")
        .select("*, muzakki:muzakki_id(name), muzakki_member:muzakki_member_id(name, relationship)")
        .eq("period_id", selectedPeriod.id)
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data as Transaction[];
    },
    enabled: !!selectedPeriod?.id,
  });

  // Fetch active family members for payer selection
  const { data: muzakkiMembers = [] } = useQuery({
    queryKey: ["muzakki-members-active-for-zakat-mal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("muzakki_members")
        .select("id, name, relationship, muzakki_id, muzakki:muzakki_id(name)")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as MuzakkiMemberOption[];
    },
  });

  const selectedMember = muzakkiMembers.find((m) => m.id === selectedMemberId) || null;

  // Create transaction mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPeriod?.id) throw new Error("Periode tidak dipilih");
      if (!selectedMember) throw new Error("Pilih anggota muzakki");
      if (calculationMode === "from_assets" && grossAmount <= 0) throw new Error("Jumlah harta harus lebih dari 0");
      if (calculationMode === "from_zakat" && directZakatInput <= 0) throw new Error("Jumlah zakat harus lebih dari 0");

      // Create transaction
      const { data: transaction, error: txError } = await supabase
        .from("zakat_mal_transactions")
        .insert({
          muzakki_id: selectedMember.muzakki_id,
          muzakki_member_id: selectedMember.id,
          period_id: selectedPeriod.id,
          zakat_type: zakatType,
          gross_amount: displayGrossAmount,
          deductions: deductions || 0,
          net_amount: netAmount,
          nisab_value: nisabValue,
          nisab_gold_price_per_gram: goldPricePerGram,
          is_above_nisab: isAboveNisab,
          zakat_percentage: ZAKAT_PERCENTAGE,
          calculated_zakat: calculatedZakat,
          final_zakat_amount: finalZakat,
          is_manually_overridden: isManualOverride,
          override_reason: isManualOverride ? overrideReason : null,
          notes: notes || null,
        })
        .select()
        .single();

      if (txError) throw txError;

      // Create ledger entry if above nisab
      if (isAboveNisab && finalZakat > 0) {
        const { error: ledgerError } = await supabase
          .from("fund_ledger")
          .insert({
            period_id: selectedPeriod.id,
            category: "zakat_mal",
            transaction_type: "collection",
            amount_cash: finalZakat,
            amount_rice_kg: 0,
            reference_id: transaction.id,
            reference_type: "zakat_mal_transactions",
            description: `Zakat Mal (${ZAKAT_TYPE_LABELS[zakatType]}) dari ${selectedMember.name}`,
          });

        if (ledgerError) throw ledgerError;
      }

      return transaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zakat-mal-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["fund-balances"] });
      resetForm();
      setIsFormOpen(false);
      toast({ title: "Transaksi zakat mal berhasil disimpan" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const resetForm = () => {
    setSelectedMemberId("");
    setZakatType("income");
    setCalculationMode("from_assets");
    setGrossAmount(0);
    setDeductions(0);
    setDirectZakatInput(0);
    setIsManualOverride(false);
    setManualAmount(0);
    setOverrideReason("");
    setNotes("");
    setIsOverrideGoldPrice(false);
    setCustomGoldPrice(periodGoldPrice);
  };

  const handleModeChange = (mode: CalculationMode) => {
    // When switching modes, preserve data where possible
    if (mode === "from_zakat" && calculationMode === "from_assets") {
      // Switching to zakat input mode - set direct zakat to calculated value
      setDirectZakatInput(calculatedZakat);
    } else if (mode === "from_assets" && calculationMode === "from_zakat") {
      // Switching to assets mode - set gross from back-calculation
      setGrossAmount(netAmount + deductions);
    }
    setCalculationMode(mode);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  return (
    <AppLayout title="Zakat Mal">
      {isReadOnly && <ReadOnlyBanner periodName={selectedPeriod?.name} />}

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">
            Transaksi Zakat Mal - {selectedPeriod?.name || "Pilih Periode"}
          </h2>
          {!isReadOnly && selectedPeriod && (
            <Button onClick={() => setIsFormOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Tambah Transaksi
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <p className="text-muted-foreground text-center py-8">Memuat data...</p>
            ) : transactions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Belum ada transaksi zakat mal untuk periode ini
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Pembayar</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Nisab</TableHead>
                    <TableHead className="text-right">Zakat</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map(tx => (
                    <TableRow key={tx.id}>
                      <TableCell>
                        {format(new Date(tx.transaction_date), "dd MMM yyyy", { locale: idLocale })}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{tx.muzakki_member?.name || tx.muzakki?.name || "-"}</p>
                        {tx.muzakki_member?.relationship && (
                          <p className="text-xs text-muted-foreground">
                            {RELATIONSHIP_LABELS[tx.muzakki_member.relationship]}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{ZAKAT_TYPE_LABELS[tx.zakat_type]}</Badge>
                      </TableCell>
                      <TableCell>
                        {tx.is_above_nisab ? (
                          <Badge variant="default" className="gap-1">
                            <CheckCircle className="h-3 w-3" /> Tercapai
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <AlertCircle className="h-3 w-3" /> Belum
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(tx.final_zakat_amount)}
                        {tx.is_manually_overridden && (
                          <span className="text-xs text-muted-foreground ml-1">(Override)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => setViewingTransaction(tx)}>
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
      </div>

      {/* Create Transaction Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tambah Transaksi Zakat Mal</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Anggota Pembayar *</Label>
                <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih anggota muzakki" />
                  </SelectTrigger>
                  <SelectContent>
                    {muzakkiMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name} - {RELATIONSHIP_LABELS[member.relationship]} ({member.muzakki?.name || "Tanpa KK"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Jenis Zakat *</Label>
                <Select value={zakatType} onValueChange={(v) => setZakatType(v as Transaction["zakat_type"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Penghasilan</SelectItem>
                    <SelectItem value="gold">Emas</SelectItem>
                    <SelectItem value="trade">Perdagangan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Calculation Mode Selection */}
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm">Mode Perhitungan</h4>
              <RadioGroup value={calculationMode} onValueChange={(v) => handleModeChange(v as CalculationMode)}>
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="from_assets" id="from_assets" />
                    <Label htmlFor="from_assets" className="cursor-pointer text-sm">Input Total Harta</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="from_zakat" id="from_zakat" />
                    <Label htmlFor="from_zakat" className="cursor-pointer text-sm">Input Jumlah Zakat Langsung</Label>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {calculationMode === "from_assets" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Total Harta *</Label>
                  <CurrencyInput
                    value={grossAmount}
                    onChange={setGrossAmount}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Potongan/Hutang</Label>
                  <CurrencyInput
                    value={deductions}
                    onChange={setDeductions}
                    placeholder="0"
                  />
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Jumlah Zakat Dibayar *</Label>
                  <CurrencyInput
                    value={directZakatInput}
                    onChange={setDirectZakatInput}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Harta bersih terhitung: {formatCurrency(netAmount)}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Potongan/Hutang (opsional)</Label>
                  <CurrencyInput
                    value={deductions}
                    onChange={setDeductions}
                    placeholder="0"
                  />
                </div>
              </div>
            )}

            {/* Nisab Override Section */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Konfigurasi Nisab</h4>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Override</span>
                  <Switch
                    checked={isOverrideGoldPrice}
                    onCheckedChange={(checked) => {
                      setIsOverrideGoldPrice(checked);
                      if (checked) setCustomGoldPrice(periodGoldPrice);
                    }}
                  />
                </div>
              </div>
              
              {isOverrideGoldPrice ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Harga Emas/gram:</Label>
                    <CurrencyInput
                      id="customGoldPrice"
                      value={customGoldPrice}
                      onChange={setCustomGoldPrice}
                      className="w-44 border-amber-500"
                    />
                    <Badge variant="outline" className="text-amber-600 border-amber-500">Custom</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Nisab = {NISAB_GOLD_GRAMS}g × Rp {goldPricePerGram.toLocaleString("id-ID")} = {formatCurrency(nisabValue)}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Harga Emas: Rp {periodGoldPrice.toLocaleString("id-ID")}/gram (dari periode)
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Nisab = {NISAB_GOLD_GRAMS}g × Rp {periodGoldPrice.toLocaleString("id-ID")} = {formatCurrency(nisabValue)}
                  </p>
                </div>
              )}
            </div>

            {/* Calculation Summary */}
            <Card className={isAboveNisab ? "border-green-500/50 bg-green-50/50" : "border-yellow-500/50 bg-yellow-50/50"}>
              <CardContent className="pt-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Harta Bersih</span>
                    <span className="font-medium">{formatCurrency(netAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Nisab</span>
                    <span>{formatCurrency(nisabValue)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Status Nisab</span>
                    {isAboveNisab ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" /> Wajib Zakat
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <AlertCircle className="h-3 w-3" /> Belum Wajib
                      </Badge>
                    )}
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span>Zakat ({ZAKAT_PERCENTAGE}%)</span>
                    <span className="font-bold text-lg">{formatCurrency(calculatedZakat)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Manual Override */}
            <div className="space-y-3 border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="override">Override Manual</Label>
                <Switch
                  id="override"
                  checked={isManualOverride}
                  onCheckedChange={setIsManualOverride}
                />
              </div>
              {isManualOverride && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="manualAmount">Jumlah Zakat Manual (Rp)</Label>
                    <CurrencyInput
                      id="manualAmount"
                      value={manualAmount}
                      onChange={setManualAmount}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="overrideReason">Alasan Override *</Label>
                    <Textarea
                      id="overrideReason"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Jelaskan alasan override..."
                      required={isManualOverride}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Catatan</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Catatan transaksi (opsional)"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { resetForm(); setIsFormOpen(false); }}>
                Batal
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                Simpan Transaksi
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Transaction Dialog */}
      <Dialog open={!!viewingTransaction} onOpenChange={(open) => !open && setViewingTransaction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detail Transaksi Zakat Mal</DialogTitle>
          </DialogHeader>
          {viewingTransaction && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground">Pembayar</p>
                  <p className="font-medium">
                    {viewingTransaction.muzakki_member?.name || viewingTransaction.muzakki?.name}
                  </p>
                  {viewingTransaction.muzakki?.name && (
                    <p className="text-xs text-muted-foreground">
                      KK: {viewingTransaction.muzakki.name}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">Jenis Zakat</p>
                  <Badge variant="outline">{ZAKAT_TYPE_LABELS[viewingTransaction.zakat_type]}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Harta</p>
                  <p className="font-medium">{formatCurrency(viewingTransaction.gross_amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Potongan</p>
                  <p className="font-medium">{formatCurrency(viewingTransaction.deductions || 0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Harta Bersih</p>
                  <p className="font-medium">{formatCurrency(viewingTransaction.net_amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Nisab</p>
                  <p className="font-medium">{formatCurrency(viewingTransaction.nisab_value)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status Nisab</p>
                  {viewingTransaction.is_above_nisab ? (
                    <Badge variant="default">Wajib Zakat</Badge>
                  ) : (
                    <Badge variant="secondary">Belum Wajib</Badge>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">Zakat Dibayar</p>
                  <p className="font-bold text-lg">{formatCurrency(viewingTransaction.final_zakat_amount)}</p>
                </div>
              </div>
              {viewingTransaction.is_manually_overridden && (
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-muted-foreground text-xs">Alasan Override</p>
                  <p>{viewingTransaction.override_reason}</p>
                </div>
              )}
              {viewingTransaction.notes && (
                <div>
                  <p className="text-muted-foreground">Catatan</p>
                  <p>{viewingTransaction.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ReadOnlyBanner } from "@/components/shared/ReadOnlyBanner";
import { MuzakkiSearchSelect } from "@/components/shared/MuzakkiSearchSelect";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { usePeriod } from "@/contexts/PeriodContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Eye } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatCurrency";
import type { Enums } from "@/integrations/supabase/types";

const DEFAULT_DAILY_RATE_CASH = 35000;
const DEFAULT_DAILY_RATE_FOOD_KG = 0.75;
type FidyahReason = Enums<"fidyah_reason">;

const REASON_LABELS: Record<FidyahReason, string> = {
  chronic_illness: "Sakit Kronis",
  elderly: "Lanjut Usia",
  pregnancy: "Hamil",
  breastfeeding: "Menyusui",
  terminal_illness: "Sakit Terminal",
  other: "Lainnya",
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  head_of_family: "Kepala Keluarga",
  wife: "Istri",
  child: "Anak",
  parent: "Orang Tua",
};

interface Transaction {
  id: string;
  period_id: string;
  payer_name: string;
  payer_muzakki_id: string | null;
  is_paying_for_self: boolean;
  beneficiary_name: string | null;
  beneficiary_relationship: string | null;
  reason: string;
  reason_notes: string | null;
  missed_days: number;
  daily_rate: number;
  total_amount: number;
  payment_type: "cash" | "food";
  cash_amount: number | null;
  food_amount_kg: number | null;
  transaction_date: string;
  notes: string | null;
  payer_muzakki?: { name: string } | null;
}

interface MuzakkiMember {
  id: string;
  muzakki_id: string;
  name: string;
  relationship: string;
  is_active: boolean;
}

export default function FidyahPage() {
  const { isReadOnly, selectedPeriod } = usePeriod();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewingTransaction, setViewingTransaction] = useState<Transaction | null>(null);

  // Form state
  const [selectedMuzakkiId, setSelectedMuzakkiId] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [payerAddress, setPayerAddress] = useState("");
  const [isPayingForSelf, setIsPayingForSelf] = useState(true);
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [beneficiaryRelationship, setBeneficiaryRelationship] = useState("");
  const [reason, setReason] = useState<FidyahReason>("elderly");
  const [reasonNotes, setReasonNotes] = useState("");
  const [missedDays, setMissedDays] = useState(1);
  const [paymentType, setPaymentType] = useState<"cash" | "food">("cash");
  const [dailyRateFood, setDailyRateFood] = useState(DEFAULT_DAILY_RATE_FOOD_KG);
  const [notes, setNotes] = useState("");

  // Override states
  const [isOverrideDailyRate, setIsOverrideDailyRate] = useState(false);
  const [customDailyRate, setCustomDailyRate] = useState(0);

  // Get period configuration values
  const periodDailyRate = selectedPeriod?.fidyah_daily_rate ?? DEFAULT_DAILY_RATE_CASH;
  const dailyRateCash = isOverrideDailyRate ? customDailyRate : periodDailyRate;

  // Calculated values
  const totalCash = paymentType === "cash" ? missedDays * dailyRateCash : 0;
  const totalFood = paymentType === "food" ? missedDays * dailyRateFood : 0;

  // Fetch transactions
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["fidyah-transactions", selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];
      const { data, error } = await supabase
        .from("fidyah_transactions")
        .select("*, payer_muzakki:payer_muzakki_id(name)")
        .eq("period_id", selectedPeriod.id)
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data as Transaction[];
    },
    enabled: !!selectedPeriod?.id,
  });

  // Fetch muzakki list
  const { data: muzakkiList = [] } = useQuery({
    queryKey: ["muzakki-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("muzakki")
        .select("id, name, phone, address")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch members for selected muzakki
  const { data: muzakkiMembers = [] } = useQuery({
    queryKey: ["muzakki-members", selectedMuzakkiId],
    queryFn: async () => {
      if (!selectedMuzakkiId) return [];
      const { data, error } = await supabase
        .from("muzakki_members")
        .select("id, muzakki_id, name, relationship, is_active")
        .eq("muzakki_id", selectedMuzakkiId)
        .eq("is_active", true)
        .order("relationship");
      if (error) throw error;
      return data as MuzakkiMember[];
    },
    enabled: !!selectedMuzakkiId,
  });

  // Handle muzakki selection
  const handleMuzakkiSelect = (muzakkiId: string) => {
    setSelectedMuzakkiId(muzakkiId);
    setSelectedMemberId("");
    setPayerName("");
    
    const selected = muzakkiList.find(m => m.id === muzakkiId);
    if (selected) {
      setPayerPhone(selected.phone || "");
      setPayerAddress(selected.address || "");
    }
  };

  // Handle member selection - auto-fill payer name
  const handleMemberSelect = (memberId: string) => {
    setSelectedMemberId(memberId);
    const member = muzakkiMembers.find(m => m.id === memberId);
    if (member) {
      setPayerName(member.name);
    }
  };

  // Create transaction mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPeriod?.id) throw new Error("Periode tidak dipilih");
      if (!selectedMuzakkiId) throw new Error("Pilih muzakki terlebih dahulu");
      if (!selectedMemberId) throw new Error("Pilih anggota pembayar fidyah");
      if (!payerName.trim()) throw new Error("Nama pembayar harus diisi");
      if (missedDays <= 0) throw new Error("Jumlah hari harus lebih dari 0");
      if (!isPayingForSelf && !beneficiaryName.trim()) {
        throw new Error("Nama penerima fidyah harus diisi");
      }

      const dailyRate = paymentType === "cash" ? dailyRateCash : dailyRateFood;
      const totalAmount = paymentType === "cash" ? totalCash : totalFood;

      // Create transaction
      const { data: transaction, error: txError } = await supabase
        .from("fidyah_transactions")
        .insert({
          period_id: selectedPeriod.id,
          payer_muzakki_id: selectedMuzakkiId,
          payer_name: payerName.trim(),
          payer_phone: payerPhone || null,
          payer_address: payerAddress || null,
          is_paying_for_self: isPayingForSelf,
          beneficiary_name: isPayingForSelf ? null : beneficiaryName.trim(),
          beneficiary_relationship: isPayingForSelf ? null : beneficiaryRelationship || null,
          reason,
          reason_notes: reason === "other" ? reasonNotes : null,
          missed_days: missedDays,
          daily_rate: dailyRate,
          total_amount: totalAmount,
          payment_type: paymentType,
          cash_amount: paymentType === "cash" ? totalCash : null,
          food_amount_kg: paymentType === "food" ? totalFood : null,
          notes: notes || null,
        })
        .select()
        .single();

      if (txError) throw txError;

      // Create ledger entry
      const category = paymentType === "cash" ? "fidyah_cash" : "fidyah_food";
      const { error: ledgerError } = await supabase
        .from("fund_ledger")
        .insert({
          period_id: selectedPeriod.id,
          category,
          transaction_type: "collection",
          amount_cash: paymentType === "cash" ? totalCash : 0,
          amount_food_kg: paymentType === "food" ? totalFood : 0,
          reference_id: transaction.id,
          reference_type: "fidyah_transactions",
          description: `Fidyah dari ${payerName} (${missedDays} hari)`,
        });

      if (ledgerError) throw ledgerError;

      return transaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fidyah-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["fund-balances"] });
      resetForm();
      setIsFormOpen(false);
      toast({ title: "Transaksi fidyah berhasil disimpan" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const resetForm = () => {
    setSelectedMuzakkiId("");
    setSelectedMemberId("");
    setPayerName("");
    setPayerPhone("");
    setPayerAddress("");
    setIsPayingForSelf(true);
    setBeneficiaryName("");
    setBeneficiaryRelationship("");
    setReason("elderly");
    setReasonNotes("");
    setMissedDays(1);
    setPaymentType("cash");
    setDailyRateFood(DEFAULT_DAILY_RATE_FOOD_KG);
    setNotes("");
    setIsOverrideDailyRate(false);
    setCustomDailyRate(periodDailyRate);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  return (
    <AppLayout title="Fidyah">
      {isReadOnly && <ReadOnlyBanner periodName={selectedPeriod?.name} />}

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">
            Transaksi Fidyah - {selectedPeriod?.name || "Pilih Periode"}
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
                Belum ada transaksi fidyah untuk periode ini
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Pembayar</TableHead>
                    <TableHead>Penerima</TableHead>
                    <TableHead>Alasan</TableHead>
                    <TableHead>Hari</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map(tx => (
                    <TableRow key={tx.id}>
                      <TableCell>
                        {format(new Date(tx.transaction_date), "dd MMM yyyy", { locale: idLocale })}
                      </TableCell>
                      <TableCell className="font-medium">{tx.payer_name}</TableCell>
                      <TableCell>
                        {tx.is_paying_for_self ? (
                          <span className="text-muted-foreground">Diri Sendiri</span>
                        ) : (
                          tx.beneficiary_name
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{REASON_LABELS[tx.reason] || tx.reason}</Badge>
                      </TableCell>
                      <TableCell>{tx.missed_days} hari</TableCell>
                      <TableCell className="text-right">
                        {tx.payment_type === "cash"
                          ? formatCurrency(tx.cash_amount || 0)
                          : `${tx.food_amount_kg} kg`}
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
            <DialogTitle>Tambah Transaksi Fidyah</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Muzakki & Member Selection */}
            <div className="space-y-3 border rounded-lg p-4">
              <h3 className="font-medium">Data Pembayar</h3>
              <div className="space-y-2">
                <Label>Pilih Muzakki *</Label>
                <MuzakkiSearchSelect
                  value={selectedMuzakkiId}
                  onChange={handleMuzakkiSelect}
                  placeholder="Cari atau tambah muzakki..."
                />
              </div>
              
              {selectedMuzakkiId && (
                <div className="space-y-2">
                  <Label>Pilih Anggota Pembayar Fidyah *</Label>
                  <Select value={selectedMemberId} onValueChange={handleMemberSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih anggota keluarga" />
                    </SelectTrigger>
                    <SelectContent>
                      {muzakkiMembers.map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} ({RELATIONSHIP_LABELS[m.relationship] || m.relationship})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="payerName">Nama Pembayar</Label>
                  <Input
                    id="payerName"
                    value={payerName}
                    readOnly
                    className="bg-muted"
                    placeholder="Otomatis dari anggota"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payerPhone">No. Telepon</Label>
                  <Input
                    id="payerPhone"
                    value={payerPhone}
                    onChange={(e) => setPayerPhone(e.target.value)}
                    placeholder="08xxxxxxxxxx"
                  />
                </div>
              </div>
            </div>

            {/* Beneficiary Section */}
            <div className="space-y-3 border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Penerima Fidyah</h3>
                <div className="flex items-center gap-2">
                  <Label htmlFor="payingForSelf" className="text-sm">Untuk Diri Sendiri</Label>
                  <Switch
                    id="payingForSelf"
                    checked={isPayingForSelf}
                    onCheckedChange={setIsPayingForSelf}
                  />
                </div>
              </div>
              {!isPayingForSelf && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="beneficiaryName">Nama Penerima *</Label>
                    <Input
                      id="beneficiaryName"
                      value={beneficiaryName}
                      onChange={(e) => setBeneficiaryName(e.target.value)}
                      placeholder="Nama penerima fidyah"
                      required={!isPayingForSelf}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="beneficiaryRelationship">Hubungan</Label>
                    <Input
                      id="beneficiaryRelationship"
                      value={beneficiaryRelationship}
                      onChange={(e) => setBeneficiaryRelationship(e.target.value)}
                      placeholder="Contoh: Orang Tua, Anak"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Reason Section */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Alasan Fidyah *</Label>
                <Select value={reason} onValueChange={(value) => setReason(value as FidyahReason)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(REASON_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="missedDays">Jumlah Hari Puasa *</Label>
                <Input
                  id="missedDays"
                  type="number"
                  value={missedDays}
                  onChange={(e) => setMissedDays(Number(e.target.value))}
                  min={1}
                  max={30}
                />
              </div>
            </div>
            {reason === "other" && (
              <div className="space-y-2">
                <Label htmlFor="reasonNotes">Keterangan Alasan</Label>
                <Textarea
                  id="reasonNotes"
                  value={reasonNotes}
                  onChange={(e) => setReasonNotes(e.target.value)}
                  placeholder="Jelaskan alasan fidyah..."
                />
              </div>
            )}

            {/* Payment Section */}
            <div className="space-y-3 border rounded-lg p-4">
              <h3 className="font-medium">Pembayaran</h3>
              <div className="space-y-2">
                <Label>Jenis Pembayaran *</Label>
                <RadioGroup value={paymentType} onValueChange={(v) => setPaymentType(v as "cash" | "food")}>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="cash" id="cash" />
                      <Label htmlFor="cash" className="cursor-pointer">Uang</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="food" id="food" />
                      <Label htmlFor="food" className="cursor-pointer">Makanan</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {paymentType === "cash" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Tarif dari periode: {formatCurrency(periodDailyRate)}/hari
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="override" className="text-sm">Override</Label>
                      <Switch
                        id="override"
                        checked={isOverrideDailyRate}
                        onCheckedChange={(checked) => {
                          setIsOverrideDailyRate(checked);
                          if (checked) setCustomDailyRate(periodDailyRate);
                        }}
                      />
                    </div>
                  </div>
                  {isOverrideDailyRate && (
                    <div className="space-y-2">
                      <Label htmlFor="customRate">Tarif Kustom per Hari (Rp)</Label>
                      <Input
                        id="customRate"
                        type="number"
                        value={customDailyRate}
                        onChange={(e) => setCustomDailyRate(Number(e.target.value))}
                        min={0}
                      />
                    </div>
                  )}
                </div>
              )}

              {paymentType === "food" && (
                <div className="space-y-2">
                  <Label htmlFor="foodRate">Jumlah Makanan per Hari (kg)</Label>
                  <Input
                    id="foodRate"
                    type="number"
                    step="0.1"
                    value={dailyRateFood}
                    onChange={(e) => setDailyRateFood(Number(e.target.value))}
                    min={0.1}
                  />
                </div>
              )}

              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm text-muted-foreground">Total Fidyah ({missedDays} hari):</p>
                <p className="text-xl font-bold">
                  {paymentType === "cash" ? formatCurrency(totalCash) : `${totalFood} kg`}
                </p>
                {isOverrideDailyRate && (
                  <Badge variant="secondary" className="mt-1">Nilai Kustom</Badge>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Catatan</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Catatan tambahan..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                Simpan
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Transaction Dialog */}
      <Dialog open={!!viewingTransaction} onOpenChange={() => setViewingTransaction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detail Transaksi Fidyah</DialogTitle>
          </DialogHeader>
          {viewingTransaction && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Tanggal</p>
                  <p className="font-medium">
                    {format(new Date(viewingTransaction.transaction_date), "dd MMMM yyyy", { locale: idLocale })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Pembayar</p>
                  <p className="font-medium">{viewingTransaction.payer_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Penerima</p>
                  <p className="font-medium">
                    {viewingTransaction.is_paying_for_self ? "Diri Sendiri" : viewingTransaction.beneficiary_name}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Alasan</p>
                  <p className="font-medium">{REASON_LABELS[viewingTransaction.reason]}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Jumlah Hari</p>
                  <p className="font-medium">{viewingTransaction.missed_days} hari</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tarif per Hari</p>
                  <p className="font-medium">
                    {viewingTransaction.payment_type === "cash"
                      ? formatCurrency(viewingTransaction.daily_rate)
                      : `${viewingTransaction.daily_rate} kg`}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Total</p>
                  <p className="text-xl font-bold">
                    {viewingTransaction.payment_type === "cash"
                      ? formatCurrency(viewingTransaction.cash_amount || 0)
                      : `${viewingTransaction.food_amount_kg} kg`}
                  </p>
                </div>
                {viewingTransaction.notes && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Catatan</p>
                    <p>{viewingTransaction.notes}</p>
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

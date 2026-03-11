import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ReadOnlyBanner } from "@/components/shared/ReadOnlyBanner";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import {
  MuzakkiMemberSearchSelect,
  type MuzakkiMemberOption,
} from "@/components/shared/MuzakkiMemberSearchSelect";
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
import { Plus, Eye, Pencil, ShieldAlert, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatCurrency";
import type { Enums } from "@/integrations/supabase/types";

const DEFAULT_DAILY_RATE_CASH = 35000;
const DEFAULT_DAILY_RATE_FOOD_KG = 0.75;

type FidyahReason = Enums<"fidyah_reason">;
type MemberRelationship = Enums<"member_relationship">;

const REASON_LABELS: Record<FidyahReason, string> = {
  chronic_illness: "Sakit Kronis",
  elderly: "Lanjut Usia",
  pregnancy: "Hamil",
  breastfeeding: "Menyusui",
  terminal_illness: "Sakit Terminal",
  other: "Lainnya",
};

const RELATIONSHIP_LABELS: Record<MemberRelationship, string> = {
  head_of_family: "Kepala Keluarga",
  wife: "Istri",
  child: "Anak",
  parent: "Orang Tua",
};

interface Transaction {
  id: string;
  transaction_no?: number | null;
  period_id: string;
  created_by: string | null;
  correction_of_transaction_id: string | null;
  is_void: boolean;
  locked_batch_id: string | null;
  void_reason: string | null;
  voided_at: string | null;
  payer_name: string;
  payer_phone: string | null;
  payer_address: string | null;
  payer_muzakki_id: string | null;
  payer_member_id: string | null;
  reason: FidyahReason;
  reason_notes: string | null;
  missed_days: number;
  daily_rate: number;
  total_amount: number;
  payment_type: "cash" | "food";
  cash_amount: number | null;
  food_amount_kg: number | null;
  transaction_date: string;
  notes: string | null;
  payer_member?: { name: string; relationship: MemberRelationship } | null;
  locked_batch?: { status: string; batch_code: string; batch_no: number } | null;
}

interface CreatorProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

export default function FidyahPage() {
  const { isReadOnly, selectedPeriod } = usePeriod();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewingTransaction, setViewingTransaction] = useState<Transaction | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [correctingTransaction, setCorrectingTransaction] = useState<Transaction | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");

  // Form state
  const [payerMemberId, setPayerMemberId] = useState("");
  const [selectedPayerMember, setSelectedPayerMember] = useState<MuzakkiMemberOption | null>(null);
  const [payerPhone, setPayerPhone] = useState("");
  const [payerAddress, setPayerAddress] = useState("");
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
  const isTransactionLocked = (tx: Transaction) => Boolean(tx.locked_batch_id && tx.locked_batch?.status !== "cancelled");

  // Fetch transactions
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["fidyah-transactions", selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];
      const { data, error } = await supabase
        .from("fidyah_transactions")
        .select("*, payer_member:payer_member_id(name, relationship), locked_batch:locked_batch_id(status, batch_code, batch_no)")
        .eq("period_id", selectedPeriod.id)
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data as Transaction[];
    },
    enabled: !!selectedPeriod?.id,
  });

  const creatorIds = useMemo(
    () => Array.from(new Set(transactions.map((tx) => tx.created_by).filter(Boolean) as string[])),
    [transactions],
  );

  const { data: creatorProfiles = [] } = useQuery({
    queryKey: ["transaction-creators-fidyah", creatorIds],
    queryFn: async () => {
      if (creatorIds.length === 0) return [];
      const { data, error } = await supabase.from("profiles").select("id, full_name, email").in("id", creatorIds);
      if (error) throw error;
      return (data ?? []) as CreatorProfile[];
    },
    enabled: creatorIds.length > 0,
  });

  const creatorMap = useMemo(() => {
    const map = new Map<string, string>();
    creatorProfiles.forEach((profile) => {
      const label = profile.full_name || profile.email || profile.id;
      map.set(profile.id, label);
    });
    return map;
  }, [creatorProfiles]);

  const getCreatorName = (createdBy: string | null) => {
    if (!createdBy) return "-";
    return creatorMap.get(createdBy) || createdBy;
  };

  // Create transaction mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPeriod?.id) throw new Error("Periode tidak dipilih");
      if (!payerMemberId) throw new Error("Pilih anggota pembayar");
      if (missedDays <= 0) throw new Error("Jumlah hari harus lebih dari 0");

      let payerMember = selectedPayerMember;
      if (!payerMember) {
        const { data: member, error: memberError } = await supabase
          .from("muzakki_members")
          .select("id, name, relationship, muzakki_id, muzakki:muzakki_id(name, phone, address)")
          .eq("id", payerMemberId)
          .single();

        if (memberError || !member) throw memberError ?? new Error("Anggota pembayar tidak ditemukan");
        payerMember = member as unknown as MuzakkiMemberOption;
      }

      const dailyRate = paymentType === "cash" ? dailyRateCash : dailyRateFood;
      const totalAmount = paymentType === "cash" ? totalCash : totalFood;
      const cleanName = payerMember.name.trim();
      const payerMuzakkiId = payerMember.muzakki_id;
      const category = paymentType === "cash" ? "fidyah_cash" : "fidyah_food";
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (editingTransaction) {
        if (isTransactionLocked(editingTransaction)) {
          throw new Error("Transaksi sudah batch lock dan tidak bisa diedit.");
        }

        const { error: txError } = await supabase
          .from("fidyah_transactions")
          .update({
            payer_muzakki_id: payerMuzakkiId,
            payer_member_id: payerMemberId,
            payer_name: cleanName,
            payer_phone: payerPhone || null,
            payer_address: payerAddress || null,
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
          .eq("id", editingTransaction.id);
        if (txError) throw txError;

        const { data: existingLedger, error: ledgerLookupError } = await supabase
          .from("fund_ledger")
          .select("id")
          .eq("reference_id", editingTransaction.id)
          .eq("reference_type", "fidyah_transactions")
          .eq("transaction_type", "collection")
          .order("created_at", { ascending: true })
          .limit(1);
        if (ledgerLookupError) throw ledgerLookupError;

        if (existingLedger && existingLedger.length > 0) {
          const { error: ledgerUpdateError } = await supabase
            .from("fund_ledger")
            .update({
              category,
              amount_cash: paymentType === "cash" ? totalCash : 0,
              amount_food_kg: paymentType === "food" ? totalFood : 0,
              description: `Fidyah dari ${cleanName} (${missedDays} hari)`,
            })
            .eq("id", existingLedger[0].id);
          if (ledgerUpdateError) throw ledgerUpdateError;
        } else {
          const { error: ledgerInsertError } = await supabase
            .from("fund_ledger")
            .insert({
              period_id: selectedPeriod.id,
              category,
              transaction_type: "collection",
              amount_cash: paymentType === "cash" ? totalCash : 0,
              amount_food_kg: paymentType === "food" ? totalFood : 0,
              reference_id: editingTransaction.id,
              reference_type: "fidyah_transactions",
              description: `Fidyah dari ${cleanName} (${missedDays} hari)`,
            });
          if (ledgerInsertError) throw ledgerInsertError;
        }

        return editingTransaction;
      }

      const { data: transaction, error: txError } = await supabase
        .from("fidyah_transactions")
        .insert({
          period_id: selectedPeriod.id,
          created_by: user?.id || null,
          payer_muzakki_id: payerMuzakkiId,
          payer_member_id: payerMemberId,
          payer_name: cleanName,
          payer_phone: payerPhone || null,
          payer_address: payerAddress || null,
          is_paying_for_self: true,
          beneficiary_name: null,
          beneficiary_relationship: null,
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
          description: `Fidyah dari ${cleanName} (${missedDays} hari)`,
        });

      if (ledgerError) throw ledgerError;

      return transaction as Transaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fidyah-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["fund-balances"] });
      queryClient.invalidateQueries({ queryKey: ["muzakki"] });
      queryClient.invalidateQueries({ queryKey: ["muzakki-members"] });
      resetForm();
      setIsFormOpen(false);
      toast({ title: editingTransaction ? "Transaksi fidyah berhasil diperbarui" : "Transaksi fidyah berhasil disimpan" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const resetForm = () => {
    setEditingTransaction(null);
    setPayerMemberId("");
    setSelectedPayerMember(null);
    setPayerPhone("");
    setPayerAddress("");
    setReason("elderly");
    setReasonNotes("");
    setMissedDays(1);
    setPaymentType("cash");
    setDailyRateFood(DEFAULT_DAILY_RATE_FOOD_KG);
    setNotes("");
    setIsOverrideDailyRate(false);
    setCustomDailyRate(periodDailyRate);
  };

  const correctionMutation = useMutation({
    mutationFn: async ({ tx, reason }: { tx: Transaction; reason: string }) => {
      if (!reason.trim()) throw new Error("Alasan koreksi wajib diisi");
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error: voidError } = await supabase
        .from("fidyah_transactions")
        .update({
          is_void: true,
          void_reason: reason.trim(),
          voided_at: new Date().toISOString(),
          voided_by: user?.id || null,
        })
        .eq("id", tx.id)
        .eq("is_void", false);
      if (voidError) throw voidError;

      const amountCash = tx.payment_type === "cash" ? -(tx.cash_amount || 0) : 0;
      const amountFood = tx.payment_type === "food" ? -(tx.food_amount_kg || 0) : 0;
      if (amountCash === 0 && amountFood === 0) return;

      const { error: adjustmentError } = await supabase.from("fund_ledger").insert({
        period_id: tx.period_id,
        category: tx.payment_type === "cash" ? "fidyah_cash" : "fidyah_food",
        transaction_type: "adjustment",
        amount_cash: amountCash,
        amount_food_kg: amountFood,
        reference_id: tx.id,
        reference_type: "fidyah_transactions",
        description: `Koreksi void FD-${String(tx.transaction_no || 0).padStart(4, "0")}: ${reason.trim()}`,
      });
      if (adjustmentError) throw adjustmentError;
    },
    onSuccess: () => {
      setCorrectingTransaction(null);
      setCorrectionReason("");
      queryClient.invalidateQueries({ queryKey: ["fidyah-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["fund-balances"] });
      toast({ title: "Transaksi di-void. Silakan input transaksi pengganti yang benar." });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal koreksi transaksi", description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (tx: Transaction) => {
      if (isTransactionLocked(tx)) {
        throw new Error("Transaksi sudah batch lock dan tidak bisa dihapus.");
      }

      const amountCash = tx.payment_type === "cash" ? -(tx.cash_amount || 0) : 0;
      const amountFood = tx.payment_type === "food" ? -(tx.food_amount_kg || 0) : 0;
      if (amountCash !== 0 || amountFood !== 0) {
        const { error: adjustmentError } = await supabase.from("fund_ledger").insert({
          period_id: tx.period_id,
          category: tx.payment_type === "cash" ? "fidyah_cash" : "fidyah_food",
          transaction_type: "adjustment",
          amount_cash: amountCash,
          amount_food_kg: amountFood,
          reference_id: tx.id,
          reference_type: "fidyah_transactions",
          description: `Pembatalan hapus FD-${String(tx.transaction_no || 0).padStart(4, "0")}`,
        });
        if (adjustmentError) throw adjustmentError;
      }

      const { error } = await supabase.from("fidyah_transactions").delete().eq("id", tx.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fidyah-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["fund-balances"] });
      toast({ title: "Transaksi fidyah berhasil dihapus" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal hapus transaksi", description: error.message });
    },
  });

  const handleDelete = (tx: Transaction) => {
    if (isTransactionLocked(tx)) {
      toast({ variant: "destructive", title: "Transaksi sudah batch lock dan tidak bisa dihapus." });
      return;
    }

    const label = tx.transaction_no ? `FD-${String(tx.transaction_no).padStart(4, "0")}` : tx.id;
    if (!window.confirm(`Hapus transaksi ${label}? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }

    deleteMutation.mutate(tx);
  };

  const handleOpenEdit = async (tx: Transaction) => {
    if (isTransactionLocked(tx)) {
      toast({ variant: "destructive", title: "Transaksi sudah batch lock, gunakan Koreksi." });
      return;
    }

    setEditingTransaction(tx);
    setPayerMemberId(tx.payer_member_id || "");
    setPayerPhone(tx.payer_phone || "");
    setPayerAddress(tx.payer_address || "");
    setReason(tx.reason);
    setReasonNotes(tx.reason_notes || "");
    setMissedDays(tx.missed_days);
    setPaymentType(tx.payment_type);
    setDailyRateFood(tx.payment_type === "food" ? tx.daily_rate : DEFAULT_DAILY_RATE_FOOD_KG);
    setNotes(tx.notes || "");

    if (tx.payment_type === "cash" && Math.abs(tx.daily_rate - periodDailyRate) > 0.0001) {
      setIsOverrideDailyRate(true);
      setCustomDailyRate(tx.daily_rate);
    } else {
      setIsOverrideDailyRate(false);
      setCustomDailyRate(periodDailyRate);
    }

    if (tx.payer_member_id) {
      const { data: member, error } = await supabase
        .from("muzakki_members")
        .select("id, name, relationship, muzakki_id, muzakki:muzakki_id(name, phone, address)")
        .eq("id", tx.payer_member_id)
        .single();
      if (error) {
        toast({ variant: "destructive", title: "Gagal memuat data anggota", description: error.message });
        return;
      }
      setSelectedPayerMember(member as unknown as MuzakkiMemberOption);
    } else {
      setSelectedPayerMember(null);
    }

    setIsFormOpen(true);
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
            <Button
              onClick={() => {
                resetForm();
                setIsFormOpen(true);
              }}
              className="gap-2"
            >
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
                    <TableHead>No. Transaksi</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Pembayar</TableHead>
                    <TableHead>Alasan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Hari</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Input Oleh</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-mono text-xs">
                        {tx.transaction_no ? `FD-${String(tx.transaction_no).padStart(4, "0")}` : "-"}
                      </TableCell>
                      <TableCell>
                        {format(new Date(tx.transaction_date), "dd MMM yyyy", { locale: idLocale })}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{tx.payer_name}</p>
                        {tx.payer_member?.relationship && (
                          <p className="text-xs text-muted-foreground">
                            {RELATIONSHIP_LABELS[tx.payer_member.relationship]}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{REASON_LABELS[tx.reason] || tx.reason}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {tx.is_void ? (
                            <Badge variant="destructive">Void</Badge>
                          ) : isTransactionLocked(tx) ? (
                            <Badge variant="secondary">
                              Lock {tx.locked_batch?.batch_code || `#${tx.locked_batch?.batch_no || "-"}`}
                            </Badge>
                          ) : (
                            <Badge variant="outline">Editable</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{tx.missed_days} hari</TableCell>
                      <TableCell className="text-right">
                        {tx.payment_type === "cash"
                          ? formatCurrency(tx.cash_amount || 0)
                          : `${tx.food_amount_kg} kg`}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{getCreatorName(tx.created_by)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setViewingTransaction(tx)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {!isReadOnly && !tx.is_void && !isTransactionLocked(tx) && (
                            <Button variant="ghost" size="icon" onClick={() => void handleOpenEdit(tx)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {!isReadOnly && !tx.is_void && isTransactionLocked(tx) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setCorrectingTransaction(tx);
                                setCorrectionReason("");
                              }}
                            >
                              <ShieldAlert className="h-4 w-4 text-amber-600" />
                            </Button>
                          )}
                          {!isReadOnly && !isTransactionLocked(tx) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(tx)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
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
      <Dialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTransaction ? "Edit Transaksi Fidyah" : "Tambah Transaksi Fidyah"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3 border rounded-lg p-4">
              <h3 className="font-medium">Data Pembayar</h3>
              <div className="space-y-2">
                <Label htmlFor="payerName">Nama Anggota Pembayar *</Label>
                <MuzakkiMemberSearchSelect
                  value={payerMemberId}
                  onChange={(value, selected) => {
                    setPayerMemberId(value);
                    setSelectedPayerMember(selected);
                    setPayerPhone(selected?.muzakki?.phone || "");
                    setPayerAddress(selected?.muzakki?.address || "");
                  }}
                  placeholder="Cari anggota atau tambah muzakki baru..."
                />
                <p className="text-xs text-muted-foreground">
                  Pencarian langsung ke tabel anggota (`muzakki_members`). Jika belum ada, gunakan menu tambah muzakki baru.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="payerPhone">No. Telepon</Label>
                  <Input
                    id="payerPhone"
                    value={payerPhone}
                    onChange={(e) => setPayerPhone(e.target.value)}
                    placeholder="08xxxxxxxxxx"
                  />
                </div>
                {selectedPayerMember && (
                  <div className="space-y-2">
                    <Label>Hubungan Anggota</Label>
                    <div className="h-10 rounded-md border px-3 flex items-center text-sm bg-muted/30">
                      {RELATIONSHIP_LABELS[selectedPayerMember.relationship]}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="payerAddress">Alamat</Label>
                <Textarea
                  id="payerAddress"
                  value={payerAddress}
                  onChange={(e) => setPayerAddress(e.target.value)}
                  placeholder="Alamat (opsional)"
                />
              </div>
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
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
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
                <RadioGroup value={paymentType} onValueChange={(v) => setPaymentType(v as "cash" | "food") }>
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
                    <p className="text-sm text-muted-foreground">
                      Tarif dari periode: {formatCurrency(periodDailyRate)}/hari
                    </p>
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
                      <Label>Tarif Kustom per Hari (Rp)</Label>
                      <CurrencyInput
                        value={customDailyRate}
                        onChange={setCustomDailyRate}
                        placeholder="0"
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
                {isOverrideDailyRate && <Badge variant="secondary" className="mt-1">Nilai Kustom</Badge>}
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
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetForm();
                  setIsFormOpen(false);
                }}
              >
                Batal
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {editingTransaction ? "Simpan Perubahan" : "Simpan"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Correction Dialog */}
      <Dialog open={!!correctingTransaction} onOpenChange={(open) => !open && setCorrectingTransaction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Koreksi Transaksi Fidyah</DialogTitle>
          </DialogHeader>
          {correctingTransaction && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium">
                  {correctingTransaction.transaction_no
                    ? `FD-${String(correctingTransaction.transaction_no).padStart(4, "0")}`
                    : correctingTransaction.id}
                </p>
                <p className="text-muted-foreground">{correctingTransaction.payer_name}</p>
                <p className="text-muted-foreground">
                  {correctingTransaction.payment_type === "cash"
                    ? formatCurrency(correctingTransaction.cash_amount || 0)
                    : `${correctingTransaction.food_amount_kg || 0} kg`}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="correctionReason">Alasan Koreksi (wajib)</Label>
                <Textarea
                  id="correctionReason"
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="Contoh: salah input jumlah hari / nilai pembayaran"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCorrectingTransaction(null)}>
                  Batal
                </Button>
                <Button
                  onClick={() => correctionMutation.mutate({ tx: correctingTransaction, reason: correctionReason })}
                  disabled={correctionMutation.isPending || !correctionReason.trim()}
                >
                  Void & Koreksi
                </Button>
              </div>
            </div>
          )}
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
                  <p className="text-muted-foreground">Input Oleh</p>
                  <p className="font-medium">{getCreatorName(viewingTransaction.created_by)}</p>
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
                <div>
                  <p className="text-muted-foreground">Jenis Pembayaran</p>
                  <Badge variant="outline">
                    {viewingTransaction.payment_type === "cash" ? "Uang" : "Makanan"}
                  </Badge>
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

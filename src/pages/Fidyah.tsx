import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ReadOnlyBanner } from "@/components/shared/ReadOnlyBanner";
import { PageHero, StatTile } from "@/components/shared/PageHeader";
import {
  FORM_DIALOG_CONTENT_CLASS,
  FormBody,
  FormDialogHeader,
  FormFooterBar,
  FormSection,
} from "@/components/shared/FormShell";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import {
  MuzakkiMemberSearchSelect,
  type MuzakkiMemberOption,
} from "@/components/shared/MuzakkiMemberSearchSelect";
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
import {
  Plus,
  Minus,
  Eye,
  Banknote,
  CalendarDays,
  Heart,
  Pencil,
  Receipt,
  Search,
  ShieldAlert,
  Trash2,
  Utensils,
} from "lucide-react";
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
  const [searchTerm, setSearchTerm] = useState("");
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
  const dailyRate = dailyRateCash;
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

  // Ringkasan hanya menghitung transaksi yang tidak dibatalkan.
  const summaryStats = useMemo(() => {
    const valid = transactions.filter((tx) => !tx.is_void);
    return {
      count: valid.length,
      voidCount: transactions.length - valid.length,
      cash: valid.reduce((sum, tx) => sum + Number(tx.cash_amount || 0), 0),
      food: valid.reduce((sum, tx) => sum + Number(tx.food_amount_kg || 0), 0),
      days: valid.reduce((sum, tx) => sum + Number(tx.missed_days || 0), 0),
    };
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return transactions;
    return transactions.filter((tx) => (tx.payer_name || "").toLowerCase().includes(keyword));
  }, [transactions, searchTerm]);

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
        <PageHero
          eyebrow="Penerimaan"
          title="Transaksi Fidyah"
          description="Pencatatan fidyah pengganti puasa dalam bentuk uang maupun makanan."
          icon={Heart}
          tone="rose"
          badges={
            <>
              <Badge variant="outline" className="rounded-full bg-background/70">
                {selectedPeriod?.name || "Pilih periode"}
              </Badge>
              <Badge variant="outline" className="rounded-full bg-background/70 tabular-nums">
                Tarif {formatCurrency(periodDailyRate)} / hari
              </Badge>
            </>
          }
          highlight={{
            label: "Total fidyah uang",
            value: formatCurrency(summaryStats.cash),
            hint: `+ ${summaryStats.food.toLocaleString("id-ID", { maximumFractionDigits: 2 })} kg makanan`,
          }}
          actions={
            !isReadOnly && selectedPeriod ? (
              <Button
                onClick={() => {
                  resetForm();
                  setIsFormOpen(true);
                }}
                className="h-10 w-full gap-2 rounded-xl shadow-md shadow-primary/20 sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                Tambah Transaksi
              </Button>
            ) : null
          }
        />

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile
            label="Transaksi Sah"
            value={summaryStats.count.toLocaleString("id-ID")}
            hint={`${summaryStats.voidCount} dibatalkan`}
            icon={Receipt}
            tone="primary"
            delay={60}
          />
          <StatTile
            label="Total Uang"
            value={formatCurrency(summaryStats.cash)}
            hint="Fidyah berbentuk uang"
            icon={Banknote}
            tone="sky"
            delay={120}
          />
          <StatTile
            label="Total Makanan"
            value={`${summaryStats.food.toLocaleString("id-ID", { maximumFractionDigits: 2 })} kg`}
            hint="Fidyah berbentuk makanan"
            icon={Utensils}
            tone="amber"
            delay={180}
          />
          <StatTile
            label="Total Hari"
            value={`${summaryStats.days.toLocaleString("id-ID")} hari`}
            hint="Akumulasi hari yang difidyahkan"
            icon={CalendarDays}
            tone="violet"
            delay={240}
          />
        </section>

        <Card style={{ animationDelay: "300ms" }} className="border-border/70 opacity-0 shadow-sm animate-rise motion-reduce:animate-none motion-reduce:opacity-100">
          <CardHeader className="gap-3 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Daftar transaksi</CardTitle>
              <div className="relative w-full sm:w-[280px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari nama pembayar"
                  className="h-10 rounded-xl pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Memuat data...</p>
            ) : filteredTransactions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Receipt className="h-8 w-8 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
                  {transactions.length === 0
                    ? "Belum ada transaksi fidyah untuk periode ini."
                    : "Tidak ada transaksi yang cocok dengan pencarian."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <Table className="min-w-[860px]">
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-muted/70 to-muted/25 hover:bg-transparent">
                      <TableHead>No. Transaksi</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Pembayar</TableHead>
                      <TableHead>Alasan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Hari</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Input Oleh</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((tx) => (
                      <TableRow
                        key={tx.id}
                        className={`transition-colors hover:bg-primary/[0.04] ${tx.is_void ? "opacity-60" : ""}`}
                      >
                        <TableCell className="font-mono text-xs">
                          {tx.transaction_no ? `FD-${String(tx.transaction_no).padStart(4, "0")}` : "-"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {format(new Date(tx.transaction_date), "dd MMM yyyy, HH.mm", { locale: idLocale })}
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{tx.payer_name}</p>
                          {tx.payer_member?.relationship && (
                            <p className="text-[11px] text-muted-foreground">
                              {RELATIONSHIP_LABELS[tx.payer_member.relationship]}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="rounded-full">
                            {REASON_LABELS[tx.reason] || tx.reason}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {tx.is_void ? (
                            <Badge variant="destructive" className="rounded-full">
                              Void
                            </Badge>
                          ) : isTransactionLocked(tx) ? (
                            <Badge className="!whitespace-nowrap rounded-full bg-amber-500 text-white hover:bg-amber-500">
                              Terkunci {tx.locked_batch?.batch_code || `#${tx.locked_batch?.batch_no || "-"}`}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="rounded-full">
                              Dapat diubah
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">{tx.missed_days}</TableCell>
                        <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                          {tx.payment_type === "cash"
                            ? formatCurrency(tx.cash_amount || 0)
                            : `${Number(tx.food_amount_kg || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 })} kg`}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {getCreatorName(tx.created_by)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-0.5">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewingTransaction(tx)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {!isReadOnly && !tx.is_void && !isTransactionLocked(tx) && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void handleOpenEdit(tx)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {!isReadOnly && !tx.is_void && isTransactionLocked(tx) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
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
                                className="h-8 w-8"
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
              </div>
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
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <FormDialogHeader
            icon={Heart}
            title={editingTransaction ? "Edit Transaksi Fidyah" : "Tambah Transaksi Fidyah"}
            description={`Periode ${selectedPeriod?.name || "-"} · tarif ${formatCurrency(periodDailyRate)} per hari`}
          />

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <FormBody>
              <FormSection step={1} title="Data pembayar" description="Cari anggota yang membayar fidyah.">
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

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="payerPhone" className="text-xs text-muted-foreground">
                      No. telepon
                    </Label>
                    <Input
                      id="payerPhone"
                      value={payerPhone}
                      onChange={(e) => setPayerPhone(e.target.value)}
                      placeholder="08xxxxxxxxxx"
                      inputMode="tel"
                      className="h-11 rounded-xl"
                    />
                  </div>
                  {selectedPayerMember && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Hubungan</Label>
                      <div className="flex h-11 items-center rounded-xl border border-border/60 bg-muted/40 px-3 text-sm">
                        {RELATIONSHIP_LABELS[selectedPayerMember.relationship]}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="payerAddress" className="text-xs text-muted-foreground">
                    Alamat (opsional)
                  </Label>
                  <Textarea
                    id="payerAddress"
                    value={payerAddress}
                    onChange={(e) => setPayerAddress(e.target.value)}
                    placeholder="Alamat pembayar"
                    className="min-h-[64px] rounded-xl"
                  />
                </div>
              </FormSection>

              <FormSection step={2} title="Alasan & jumlah hari" description="Jumlah hari puasa yang diganti dengan fidyah.">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Alasan fidyah *</Label>
                  <Select value={reason} onValueChange={(value) => setReason(value as FidyahReason)}>
                    <SelectTrigger className="h-11 rounded-xl">
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

                {reason === "other" && (
                  <Textarea
                    id="reasonNotes"
                    value={reasonNotes}
                    onChange={(e) => setReasonNotes(e.target.value)}
                    placeholder="Jelaskan alasan fidyah..."
                    className="min-h-[64px] rounded-xl"
                  />
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Jumlah hari *</Label>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background p-2.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 shrink-0 rounded-xl"
                      onClick={() => setMissedDays((prev) => Math.max(1, prev - 1))}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <div className="min-w-0 flex-1 text-center">
                      <Input
                        id="missedDays"
                        type="number"
                        inputMode="numeric"
                        value={missedDays}
                        onChange={(e) => setMissedDays(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
                        min={1}
                        max={30}
                        className="h-11 border-0 bg-transparent text-center text-2xl font-semibold tabular-nums shadow-none focus-visible:ring-0"
                      />
                      <p className="text-[11px] text-muted-foreground">hari (maksimal 30)</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 shrink-0 rounded-xl"
                      onClick={() => setMissedDays((prev) => Math.min(30, prev + 1))}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </FormSection>

              <FormSection step={3} title="Bentuk pembayaran" description="Pilih uang atau makanan sesuai yang diterima.">
                <RadioGroup
                  value={paymentType}
                  onValueChange={(v) => setPaymentType(v as "cash" | "food")}
                  className="grid grid-cols-2 gap-2"
                >
                  <div>
                    <RadioGroupItem value="cash" id="cash" className="peer sr-only" />
                    <Label
                      htmlFor="cash"
                      className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-background px-3 py-3.5 text-center transition-all duration-200 hover:border-primary/40 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/[0.08] peer-data-[state=checked]:shadow-sm"
                    >
                      <Banknote className="h-5 w-5 text-emerald-600" />
                      <span className="text-sm font-semibold">Uang</span>
                      <span className="text-[11px] text-muted-foreground">{formatCurrency(dailyRate)} / hari</span>
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="food" id="food" className="peer sr-only" />
                    <Label
                      htmlFor="food"
                      className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-background px-3 py-3.5 text-center transition-all duration-200 hover:border-primary/40 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/[0.08] peer-data-[state=checked]:shadow-sm"
                    >
                      <Utensils className="h-5 w-5 text-amber-600" />
                      <span className="text-sm font-semibold">Makanan</span>
                      <span className="text-[11px] text-muted-foreground">{dailyRateFood} kg / hari</span>
                    </Label>
                  </div>
                </RadioGroup>

                {paymentType === "cash" ? (
                  <div className="rounded-xl border border-border/60 bg-background p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="override" className="text-xs sm:text-sm">
                        Tarif kustom per hari
                      </Label>
                      <Switch
                        id="override"
                        checked={isOverrideDailyRate}
                        onCheckedChange={(checked) => {
                          setIsOverrideDailyRate(checked);
                          if (checked) setCustomDailyRate(periodDailyRate);
                        }}
                      />
                    </div>
                    {isOverrideDailyRate ? (
                      <CurrencyInput
                        value={customDailyRate}
                        onChange={setCustomDailyRate}
                        placeholder="0"
                        className="mt-2 h-11 rounded-xl border-amber-400"
                      />
                    ) : (
                      <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                        {formatCurrency(periodDailyRate)} / hari (dari setelan periode)
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5 rounded-xl border border-border/60 bg-background p-3">
                    <Label htmlFor="foodRate" className="text-xs sm:text-sm">
                      Jumlah makanan per hari (kg)
                    </Label>
                    <Input
                      id="foodRate"
                      type="number"
                      step="0.1"
                      value={dailyRateFood}
                      onChange={(e) => setDailyRateFood(Number(e.target.value))}
                      min={0.1}
                      className="h-11 rounded-xl tabular-nums"
                    />
                  </div>
                )}
              </FormSection>

              <FormSection step={4} title="Catatan" description="Opsional, misalnya keterangan tambahan.">
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Catatan tambahan..."
                  className="min-h-[72px] rounded-xl"
                />
              </FormSection>
            </FormBody>

            <FormFooterBar
              summaryLabel="Total fidyah"
              summaryValue={paymentType === "cash" ? formatCurrency(totalCash) : `${totalFood} kg`}
              summaryHint={`${missedDays} hari × ${
                paymentType === "cash" ? formatCurrency(dailyRate) : `${dailyRateFood} kg`
              }${isOverrideDailyRate ? " (tarif kustom)" : ""}`}
            >
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => {
                  resetForm();
                  setIsFormOpen(false);
                }}
              >
                Batal
              </Button>
              <Button type="submit" className="rounded-xl" disabled={createMutation.isPending || !payerMemberId}>
                {createMutation.isPending ? "Menyimpan..." : editingTransaction ? "Simpan Perubahan" : "Simpan Transaksi"}
              </Button>
            </FormFooterBar>
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

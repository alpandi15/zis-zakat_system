import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ReadOnlyBanner } from "@/components/shared/ReadOnlyBanner";
import { MuzakkiSearchSelect } from "@/components/shared/MuzakkiSearchSelect";
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
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Eye, Receipt, Pencil, ShieldAlert, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatCurrency";

interface MuzakkiMember {
  id: string;
  name: string;
  relationship: string;
  is_active: boolean;
  is_dependent: boolean;
  already_paid?: boolean;
}

interface Transaction {
  id: string;
  transaction_no?: number | null;
  created_by: string | null;
  correction_of_transaction_id: string | null;
  is_void: boolean;
  locked_batch_id: string | null;
  void_reason: string | null;
  voided_at: string | null;
  muzakki_id: string;
  period_id: string;
  payment_type: "rice" | "money";
  is_custom_total_rice: boolean;
  rice_amount_kg: number | null;
  money_amount: number | null;
  rice_price_per_kg: number | null;
  total_members: number;
  transaction_date: string;
  notes: string | null;
  muzakki?: { name: string };
  locked_batch?: { status: string; batch_code: string; batch_no: number } | null;
}

interface TransactionItem {
  id: string;
  muzakki_member_id: string;
  is_void: boolean;
  member: {
    name: string;
    relationship: string;
  } | null;
}

interface CreatorProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

// Default values (used as fallback if period config is missing)
const DEFAULT_RICE_PER_PERSON_KG = 2.5;
const DEFAULT_RICE_PRICE_PER_KG = 15000;
const DEFAULT_CASH_PER_PERSON = 35000;

const RELATIONSHIP_LABELS: Record<string, string> = {
  head_of_family: "Kepala Keluarga",
  wife: "Istri",
  child: "Anak",
  parent: "Orang Tua",
};

export default function ZakatFitrah() {
  const { isReadOnly, selectedPeriod } = usePeriod();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewingTransaction, setViewingTransaction] = useState<Transaction | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [correctingTransaction, setCorrectingTransaction] = useState<Transaction | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [selectedMuzakkiId, setSelectedMuzakkiId] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [paymentType, setPaymentType] = useState<"rice" | "money">("rice");
  const [notes, setNotes] = useState("");

  // Override states
  const [isOverrideRice, setIsOverrideRice] = useState(false);
  const [isOverrideCash, setIsOverrideCash] = useState(false);
  const [isOverrideTotalRice, setIsOverrideTotalRice] = useState(false);
  const [customRicePerPerson, setCustomRicePerPerson] = useState(0);
  const [customCashPerPerson, setCustomCashPerPerson] = useState(0);
  const [customTotalRiceKg, setCustomTotalRiceKg] = useState(0);

  // Get period configuration values
  const periodRicePerPerson = selectedPeriod?.rice_amount_per_person ?? DEFAULT_RICE_PER_PERSON_KG;
  const periodCashPerPerson = selectedPeriod?.cash_amount_per_person ?? DEFAULT_CASH_PER_PERSON;

  // Use custom or period values
  const ricePerPerson = isOverrideRice ? customRicePerPerson : periodRicePerPerson;
  const cashPerPerson = isOverrideCash ? customCashPerPerson : periodCashPerPerson;
  const totalMembersCount = selectedMembers.length;
  const calculatedRiceTotal = totalMembersCount * ricePerPerson;
  const totalRiceAmount = isOverrideTotalRice ? customTotalRiceKg : calculatedRiceTotal;
  const effectiveRicePerPerson =
    totalMembersCount > 0 ? Math.round((totalRiceAmount / totalMembersCount) * 1000) / 1000 : ricePerPerson;
  const isTransactionLocked = (tx: Transaction) => Boolean(tx.locked_batch_id && tx.locked_batch?.status !== "cancelled");

  // Fetch transactions for selected period
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["zakat-fitrah-transactions", selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];
      const { data, error } = await supabase
        .from("zakat_fitrah_transactions")
        .select("*, muzakki:muzakki_id(name), locked_batch:locked_batch_id(status, batch_code, batch_no)")
        .eq("period_id", selectedPeriod.id)
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data as Transaction[];
    },
    enabled: !!selectedPeriod?.id,
  });

  // Fetch muzakki list for display names
  const { data: muzakkiList = [] } = useQuery({
    queryKey: ["muzakki-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("muzakki")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const creatorIds = useMemo(
    () => Array.from(new Set(transactions.map((tx) => tx.created_by).filter(Boolean) as string[])),
    [transactions],
  );

  const { data: creatorProfiles = [] } = useQuery({
    queryKey: ["transaction-creators-zakat-fitrah", creatorIds],
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

  // Fetch members for selected muzakki with paid status check
  const { data: muzakkiMembers = [], isLoading: isLoadingMembers } = useQuery({
    queryKey: ["muzakki-members-for-zakat", selectedMuzakkiId, selectedPeriod?.id, editingTransaction?.id || null],
    queryFn: async () => {
      if (!selectedMuzakkiId || !selectedPeriod?.id) return [];
      
      // Get all active members
      const { data: members, error: membersError } = await supabase
        .from("muzakki_members")
        .select("id, name, relationship, is_active, is_dependent")
        .eq("muzakki_id", selectedMuzakkiId)
        .eq("is_active", true)
        .eq("is_dependent", true)
        .order("relationship")
        .order("name");
      
      if (membersError) throw membersError;
      if (!members || members.length === 0) return [];

      // Check which members already paid in this period
      const { data: paidItems, error: paidError } = await supabase
        .from("zakat_fitrah_transaction_items")
        .select("muzakki_member_id, transaction_id")
        .eq("period_id", selectedPeriod.id)
        .eq("is_void", false)
        .in("muzakki_member_id", members.map(m => m.id));

      if (paidError) throw paidError;

      const paidRows = paidItems ?? [];
      const filteredPaidItems =
        editingTransaction?.id ? paidRows.filter((item) => item.transaction_id !== editingTransaction.id) : paidRows;
      const paidMemberIds = new Set(filteredPaidItems.map(item => item.muzakki_member_id));

      return members.map(m => ({
        ...m,
        already_paid: paidMemberIds.has(m.id),
      })) as MuzakkiMember[];
    },
    enabled: !!selectedMuzakkiId && !!selectedPeriod?.id,
  });

  // Fetch transaction items for viewing
  const { data: transactionItems = [] } = useQuery({
    queryKey: ["transaction-items", viewingTransaction?.id],
    queryFn: async () => {
      if (!viewingTransaction?.id) return [];
      const { data, error } = await supabase
        .from("zakat_fitrah_transaction_items")
        .select("*, member:muzakki_member_id(name, relationship)")
        .eq("transaction_id", viewingTransaction.id)
        .eq("is_void", false);
      if (error) throw error;
      return data as TransactionItem[];
    },
    enabled: !!viewingTransaction?.id,
  });

  // Create transaction mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPeriod?.id || selectedMembers.length === 0) {
        throw new Error("Pilih minimal satu anggota");
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const totalMembers = selectedMembers.length;
      const calculatedRiceAmount = totalMembers * ricePerPerson;
      const riceAmount =
        paymentType === "rice" ? (isOverrideTotalRice ? customTotalRiceKg : calculatedRiceAmount) : null;
      const perMemberRiceAmount =
        paymentType === "rice"
          ? Math.round((((riceAmount ?? 0) / totalMembers) || ricePerPerson) * 1000) / 1000
          : null;
      const moneyAmount = paymentType === "money" ? totalMembers * cashPerPerson : null;

      const items = selectedMembers.map(memberId => ({
        transaction_id: "",
        muzakki_member_id: memberId,
        period_id: selectedPeriod.id,
        rice_amount_kg: perMemberRiceAmount,
        money_amount: paymentType === "money" ? cashPerPerson : null,
      }));
      const category = paymentType === "rice" ? "zakat_fitrah_rice" : "zakat_fitrah_cash";

      if (editingTransaction) {
        if (isTransactionLocked(editingTransaction)) {
          throw new Error("Transaksi sudah batch lock dan tidak bisa diedit.");
        }

        const { error: txError } = await supabase
          .from("zakat_fitrah_transactions")
          .update({
            muzakki_id: selectedMuzakkiId,
            payment_type: paymentType,
            is_custom_total_rice: paymentType === "rice" ? isOverrideTotalRice : false,
            rice_amount_kg: riceAmount,
            money_amount: moneyAmount,
            rice_price_per_kg: paymentType === "money" ? (cashPerPerson / ricePerPerson) : null,
            total_members: totalMembers,
            notes: notes || null,
          })
          .eq("id", editingTransaction.id);
        if (txError) throw txError;

        const { error: deleteItemsError } = await supabase
          .from("zakat_fitrah_transaction_items")
          .delete()
          .eq("transaction_id", editingTransaction.id);
        if (deleteItemsError) throw deleteItemsError;

        const nextItems = items.map((item) => ({ ...item, transaction_id: editingTransaction.id }));
        const { error: insertItemsError } = await supabase.from("zakat_fitrah_transaction_items").insert(nextItems);
        if (insertItemsError) throw insertItemsError;

        const { data: existingLedger, error: ledgerLookupError } = await supabase
          .from("fund_ledger")
          .select("id")
          .eq("reference_id", editingTransaction.id)
          .eq("reference_type", "zakat_fitrah_transactions")
          .eq("transaction_type", "collection")
          .order("created_at", { ascending: true })
          .limit(1);
        if (ledgerLookupError) throw ledgerLookupError;

        if (existingLedger && existingLedger.length > 0) {
          const { error: ledgerUpdateError } = await supabase
            .from("fund_ledger")
            .update({
              category,
              amount_cash: moneyAmount || 0,
              amount_rice_kg: riceAmount || 0,
              description: `Zakat Fitrah dari ${muzakkiList.find(m => m.id === selectedMuzakkiId)?.name} (${totalMembers} orang)`,
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
              amount_cash: moneyAmount || 0,
              amount_rice_kg: riceAmount || 0,
              reference_id: editingTransaction.id,
              reference_type: "zakat_fitrah_transactions",
              description: `Zakat Fitrah dari ${muzakkiList.find(m => m.id === selectedMuzakkiId)?.name} (${totalMembers} orang)`,
            });
          if (ledgerInsertError) throw ledgerInsertError;
        }

        return editingTransaction;
      }

      const { data: transaction, error: txError } = await supabase
        .from("zakat_fitrah_transactions")
        .insert({
          muzakki_id: selectedMuzakkiId,
          period_id: selectedPeriod.id,
          created_by: user?.id || null,
          payment_type: paymentType,
          is_custom_total_rice: paymentType === "rice" ? isOverrideTotalRice : false,
          rice_amount_kg: riceAmount,
          money_amount: moneyAmount,
          rice_price_per_kg: paymentType === "money" ? (cashPerPerson / ricePerPerson) : null,
          total_members: totalMembers,
          notes: notes || null,
        })
        .select()
        .single();
      if (txError) throw txError;

      const insertItems = items.map((item) => ({ ...item, transaction_id: transaction.id }));
      const { error: itemsError } = await supabase.from("zakat_fitrah_transaction_items").insert(insertItems);
      if (itemsError) throw itemsError;

      const { error: ledgerError } = await supabase
        .from("fund_ledger")
        .insert({
          period_id: selectedPeriod.id,
          category,
          transaction_type: "collection",
          amount_cash: moneyAmount || 0,
          amount_rice_kg: riceAmount || 0,
          reference_id: transaction.id,
          reference_type: "zakat_fitrah_transactions",
          description: `Zakat Fitrah dari ${muzakkiList.find(m => m.id === selectedMuzakkiId)?.name} (${totalMembers} orang)`,
        });
      if (ledgerError) throw ledgerError;

      return transaction as Transaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zakat-fitrah-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["muzakki-members-for-zakat"] });
      queryClient.invalidateQueries({ queryKey: ["fund-balances"] });
      resetForm();
      setIsFormOpen(false);
      toast({ title: editingTransaction ? "Transaksi zakat fitrah berhasil diperbarui" : "Transaksi zakat fitrah berhasil disimpan" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const resetForm = () => {
    setEditingTransaction(null);
    setSelectedMuzakkiId("");
    setSelectedMembers([]);
    setPaymentType("rice");
    setNotes("");
    setIsOverrideRice(false);
    setIsOverrideCash(false);
    setIsOverrideTotalRice(false);
    setCustomRicePerPerson(periodRicePerPerson);
    setCustomCashPerPerson(periodCashPerPerson);
    setCustomTotalRiceKg(0);
  };

  const correctionMutation = useMutation({
    mutationFn: async ({ tx, reason }: { tx: Transaction; reason: string }) => {
      if (!reason.trim()) throw new Error("Alasan koreksi wajib diisi");
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const nowIso = new Date().toISOString();
      const { error: voidTxError } = await supabase
        .from("zakat_fitrah_transactions")
        .update({
          is_void: true,
          void_reason: reason.trim(),
          voided_at: nowIso,
          voided_by: user?.id || null,
        })
        .eq("id", tx.id)
        .eq("is_void", false);
      if (voidTxError) throw voidTxError;

      const { error: voidItemsError } = await supabase
        .from("zakat_fitrah_transaction_items")
        .update({
          is_void: true,
          voided_at: nowIso,
        })
        .eq("transaction_id", tx.id)
        .eq("is_void", false);
      if (voidItemsError) throw voidItemsError;

      const amountCash = tx.payment_type === "money" ? -(tx.money_amount || 0) : 0;
      const amountRice = tx.payment_type === "rice" ? -(tx.rice_amount_kg || 0) : 0;
      if (amountCash === 0 && amountRice === 0) return;

      const { error: adjustmentError } = await supabase.from("fund_ledger").insert({
        period_id: tx.period_id,
        category: tx.payment_type === "rice" ? "zakat_fitrah_rice" : "zakat_fitrah_cash",
        transaction_type: "adjustment",
        amount_cash: amountCash,
        amount_rice_kg: amountRice,
        reference_id: tx.id,
        reference_type: "zakat_fitrah_transactions",
        description: `Koreksi void ZF-${String(tx.transaction_no || 0).padStart(4, "0")}: ${reason.trim()}`,
      });
      if (adjustmentError) throw adjustmentError;
    },
    onSuccess: () => {
      setCorrectingTransaction(null);
      setCorrectionReason("");
      queryClient.invalidateQueries({ queryKey: ["zakat-fitrah-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["muzakki-members-for-zakat"] });
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

      const amountCash = tx.payment_type === "money" ? -(tx.money_amount || 0) : 0;
      const amountRice = tx.payment_type === "rice" ? -(tx.rice_amount_kg || 0) : 0;
      if (amountCash !== 0 || amountRice !== 0) {
        const { error: adjustmentError } = await supabase.from("fund_ledger").insert({
          period_id: tx.period_id,
          category: tx.payment_type === "rice" ? "zakat_fitrah_rice" : "zakat_fitrah_cash",
          transaction_type: "adjustment",
          amount_cash: amountCash,
          amount_rice_kg: amountRice,
          reference_id: tx.id,
          reference_type: "zakat_fitrah_transactions",
          description: `Pembatalan hapus ZF-${String(tx.transaction_no || 0).padStart(4, "0")}`,
        });
        if (adjustmentError) throw adjustmentError;
      }

      const { error } = await supabase.from("zakat_fitrah_transactions").delete().eq("id", tx.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zakat-fitrah-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["muzakki-members-for-zakat"] });
      queryClient.invalidateQueries({ queryKey: ["fund-balances"] });
      toast({ title: "Transaksi zakat fitrah berhasil dihapus" });
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

    const label = tx.transaction_no ? `ZF-${String(tx.transaction_no).padStart(4, "0")}` : tx.id;
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
    setSelectedMuzakkiId(tx.muzakki_id);
    setPaymentType(tx.payment_type);
    setNotes(tx.notes || "");

    const memberCount = tx.total_members || 1;
    if (tx.payment_type === "rice") {
      const ricePerMemberValue = (tx.rice_amount_kg || 0) / memberCount;
      if (Math.abs(ricePerMemberValue - periodRicePerPerson) > 0.0001) {
        setIsOverrideRice(true);
        setCustomRicePerPerson(ricePerMemberValue);
      } else {
        setIsOverrideRice(false);
        setCustomRicePerPerson(periodRicePerPerson);
      }

      setIsOverrideTotalRice(Boolean(tx.is_custom_total_rice));
      setCustomTotalRiceKg(tx.rice_amount_kg || 0);
      setIsOverrideCash(false);
      setCustomCashPerPerson(periodCashPerPerson);
    } else {
      const cashPerMemberValue = (tx.money_amount || 0) / memberCount;
      if (Math.abs(cashPerMemberValue - periodCashPerPerson) > 0.0001) {
        setIsOverrideCash(true);
        setCustomCashPerPerson(cashPerMemberValue);
      } else {
        setIsOverrideCash(false);
        setCustomCashPerPerson(periodCashPerPerson);
      }

      setIsOverrideRice(false);
      setCustomRicePerPerson(periodRicePerPerson);
      setIsOverrideTotalRice(false);
      setCustomTotalRiceKg(0);
    }

    const { data: items, error } = await supabase
      .from("zakat_fitrah_transaction_items")
      .select("muzakki_member_id")
      .eq("transaction_id", tx.id)
      .eq("is_void", false);
    if (error) {
      toast({ variant: "destructive", title: "Gagal memuat anggota transaksi", description: error.message });
      return;
    }

    setSelectedMembers((items || []).map((item) => item.muzakki_member_id));
    setIsFormOpen(true);
  };

  const toggleMember = (memberId: string, alreadyPaid: boolean) => {
    if (alreadyPaid) return;
    setSelectedMembers(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const selectAllAvailable = () => {
    const available = muzakkiMembers.filter(m => !m.already_paid).map(m => m.id);
    setSelectedMembers(available);
  };

  const calculateTotal = () => {
    if (paymentType === "rice") {
      return `${totalRiceAmount.toFixed(2)} kg beras`;
    }
    return formatCurrency(totalMembersCount * cashPerPerson);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMembers.length === 0) {
      toast({ variant: "destructive", title: "Pilih minimal satu anggota" });
      return;
    }
    createMutation.mutate();
  };

  return (
    <AppLayout title="Zakat Fitrah">
      {isReadOnly && <ReadOnlyBanner periodName={selectedPeriod?.name} />}

      <div className="space-y-3 sm:space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold leading-tight sm:text-lg">
            <span className="block">Transaksi Zakat Fitrah</span>
            <span className="mt-1 block text-xs font-medium text-muted-foreground sm:text-sm">
              {selectedPeriod?.name || "Pilih Periode"}
            </span>
          </h2>
          {!isReadOnly && selectedPeriod && (
            <Button
              onClick={() => {
                resetForm();
                setIsFormOpen(true);
              }}
              className="h-9 w-full gap-2 text-xs sm:h-10 sm:w-auto sm:text-sm"
            >
              <Plus className="h-4 w-4" />
              Tambah Transaksi
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="pt-4 sm:pt-6">
            {isLoading ? (
              <p className="text-muted-foreground text-center py-8">Memuat data...</p>
            ) : transactions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Belum ada transaksi zakat fitrah untuk periode ini
              </p>
            ) : (
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Transaksi</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Muzakki</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Jumlah Anggota</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Input Oleh</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map(tx => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-mono text-xs">
                        {tx.transaction_no ? `ZF-${String(tx.transaction_no).padStart(4, "0")}` : "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(tx.transaction_date), "dd MMM yyyy", { locale: idLocale })}
                      </TableCell>
                      <TableCell className="font-medium">{tx.muzakki?.name}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">
                            {tx.payment_type === "rice" ? "Beras" : "Uang"}
                          </Badge>
                          {tx.payment_type === "rice" && tx.is_custom_total_rice && (
                            <Badge variant="secondary">Custom Total</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {tx.is_void ? (
                          <Badge variant="destructive">Void</Badge>
                        ) : isTransactionLocked(tx) ? (
                          <Badge variant="secondary">
                            Lock {tx.locked_batch?.batch_code || `#${tx.locked_batch?.batch_no || "-"}`}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Editable</Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{tx.total_members} orang</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {tx.payment_type === "rice"
                          ? `${tx.rice_amount_kg} kg`
                          : formatCurrency(tx.money_amount || 0)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground sm:text-sm">{getCreatorName(tx.created_by)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setViewingTransaction(tx)}
                          >
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
            <DialogTitle>{editingTransaction ? "Edit Transaksi Zakat Fitrah" : "Tambah Transaksi Zakat Fitrah"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Muzakki *</Label>
              <MuzakkiSearchSelect
                value={selectedMuzakkiId}
                onChange={(v) => { setSelectedMuzakkiId(v); setSelectedMembers([]); }}
                placeholder="Cari atau tambah muzakki..."
              />
            </div>

            {selectedMuzakkiId && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Anggota yang Dizakati *</Label>
                  <Button type="button" variant="outline" size="sm" onClick={selectAllAvailable}>
                    Pilih Semua
                  </Button>
                </div>
                {isLoadingMembers ? (
                  <p className="text-sm text-muted-foreground">Memuat anggota...</p>
                ) : muzakkiMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tidak ada anggota aktif</p>
                ) : (
                  <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                    {muzakkiMembers.map(member => (
                      <div
                        key={member.id}
                        className={`flex items-center gap-3 p-2 rounded ${member.already_paid ? "opacity-50 bg-muted" : "hover:bg-muted/50"}`}
                      >
                        <Checkbox
                          checked={selectedMembers.includes(member.id)}
                          onCheckedChange={() => toggleMember(member.id, !!member.already_paid)}
                          disabled={member.already_paid}
                        />
                        <div className="flex-1">
                          <p className="font-medium text-sm">{member.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {RELATIONSHIP_LABELS[member.relationship] || member.relationship}
                          </p>
                        </div>
                        {member.already_paid && (
                          <Badge variant="secondary" className="text-xs">Sudah Bayar</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Jenis Pembayaran *</Label>
              <RadioGroup value={paymentType} onValueChange={(v) => setPaymentType(v as "rice" | "money")}>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="rice" id="rice" />
                    <Label htmlFor="rice" className="cursor-pointer">Beras</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="money" id="money" />
                    <Label htmlFor="money" className="cursor-pointer">Uang</Label>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Override Section */}
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm">Nilai Perhitungan</h4>
              
              {paymentType === "rice" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="overrideRice" className="text-sm">Beras per orang</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Override</span>
                      <Switch
                        id="overrideRice"
                        checked={isOverrideRice}
                        onCheckedChange={(checked) => {
                          setIsOverrideRice(checked);
                          if (checked) setCustomRicePerPerson(periodRicePerPerson);
                        }}
                      />
                    </div>
                  </div>
                  {isOverrideRice ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.1"
                        value={customRicePerPerson}
                        onChange={(e) => setCustomRicePerPerson(Number(e.target.value))}
                        className="border-amber-500"
                      />
                      <span className="text-sm">kg</span>
                      <Badge variant="outline" className="text-amber-600 border-amber-500">Custom</Badge>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {periodRicePerPerson} kg (dari periode)
                    </p>
                  )}

                  <div className="mt-3 space-y-2 rounded-md border border-dashed p-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="overrideTotalRice" className="text-sm">
                        Total beras diterima
                      </Label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Override</span>
                        <Switch
                          id="overrideTotalRice"
                          checked={isOverrideTotalRice}
                          onCheckedChange={(checked) => {
                            setIsOverrideTotalRice(checked);
                            if (checked) {
                              setCustomTotalRiceKg(calculatedRiceTotal);
                            }
                          }}
                        />
                      </div>
                    </div>
                    {isOverrideTotalRice ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.1"
                            min={0}
                            value={customTotalRiceKg}
                            onChange={(e) => setCustomTotalRiceKg(Number(e.target.value) || 0)}
                            className="border-amber-500"
                          />
                          <span className="text-sm">kg</span>
                          <Badge variant="outline" className="text-amber-600 border-amber-500">
                            Custom Total
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Auto hitung per orang: {effectiveRicePerPerson.toFixed(3)} kg
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Total otomatis: {calculatedRiceTotal.toFixed(2)} kg ({totalMembersCount} orang)
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="overrideCash" className="text-sm">Uang per orang</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Override</span>
                      <Switch
                        id="overrideCash"
                        checked={isOverrideCash}
                        onCheckedChange={(checked) => {
                          setIsOverrideCash(checked);
                          if (checked) setCustomCashPerPerson(periodCashPerPerson);
                        }}
                      />
                    </div>
                  </div>
                  {isOverrideCash ? (
                    <div className="flex items-center gap-2">
                      <CurrencyInput
                        id="customCashPerPerson"
                        value={customCashPerPerson}
                        onChange={setCustomCashPerPerson}
                        className="border-amber-500"
                      />
                      <Badge variant="outline" className="text-amber-600 border-amber-500">Custom</Badge>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Rp {periodCashPerPerson.toLocaleString("id-ID")} (dari periode)
                    </p>
                  )}
                </div>
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

            {selectedMembers.length > 0 && (
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Pembayaran</p>
                      <p className="font-semibold">
                        {totalMembersCount} orang ×{" "}
                        {paymentType === "rice"
                          ? `${effectiveRicePerPerson.toFixed(3)} kg`
                          : `Rp ${cashPerPerson.toLocaleString("id-ID")}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{calculateTotal()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { resetForm(); setIsFormOpen(false); }}>
                Batal
              </Button>
              <Button type="submit" disabled={createMutation.isPending || selectedMembers.length === 0}>
                {editingTransaction ? "Simpan Perubahan" : "Simpan Transaksi"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Correction Dialog */}
      <Dialog open={!!correctingTransaction} onOpenChange={(open) => !open && setCorrectingTransaction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Koreksi Transaksi Zakat Fitrah</DialogTitle>
          </DialogHeader>
          {correctingTransaction && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium">
                  {correctingTransaction.transaction_no
                    ? `ZF-${String(correctingTransaction.transaction_no).padStart(4, "0")}`
                    : correctingTransaction.id}
                </p>
                <p className="text-muted-foreground">{correctingTransaction.muzakki?.name || "-"}</p>
                <p className="text-muted-foreground">
                  {correctingTransaction.payment_type === "rice"
                    ? `${correctingTransaction.rice_amount_kg || 0} kg`
                    : formatCurrency(correctingTransaction.money_amount || 0)}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="zakatFitrahCorrectionReason">Alasan Koreksi (wajib)</Label>
                <Textarea
                  id="zakatFitrahCorrectionReason"
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="Contoh: salah pilih anggota / jumlah beras"
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
      <Dialog open={!!viewingTransaction} onOpenChange={(open) => !open && setViewingTransaction(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Detail Transaksi
            </DialogTitle>
          </DialogHeader>
          {viewingTransaction && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Muzakki</p>
                  <p className="font-medium">{viewingTransaction.muzakki?.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tanggal</p>
                  <p className="font-medium">
                    {format(new Date(viewingTransaction.transaction_date), "dd MMMM yyyy", { locale: idLocale })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Input Oleh</p>
                  <p className="font-medium">{getCreatorName(viewingTransaction.created_by)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Jenis Pembayaran</p>
                  <Badge variant="outline">
                    {viewingTransaction.payment_type === "rice" ? "Beras" : "Uang"}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Total</p>
                  <p className="font-medium">
                    {viewingTransaction.payment_type === "rice"
                      ? `${viewingTransaction.rice_amount_kg} kg`
                      : `Rp ${viewingTransaction.money_amount?.toLocaleString("id-ID")}`}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">Anggota ({viewingTransaction.total_members} orang)</p>
                <div className="border rounded-lg divide-y">
                  {transactionItems.map((item) => (
                    <div key={item.id} className="p-2 flex justify-between text-sm">
                      <span>{item.member?.name}</span>
                      <span className="text-muted-foreground">
                        {RELATIONSHIP_LABELS[item.member?.relationship] || item.member?.relationship}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {viewingTransaction.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Catatan</p>
                  <p className="text-sm">{viewingTransaction.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

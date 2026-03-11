import { useState } from "react";
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
import { Plus, Eye, Receipt } from "lucide-react";
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
}

interface TransactionItem {
  id: string;
  member: {
    name: string;
    relationship: string;
  } | null;
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

  // Fetch transactions for selected period
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["zakat-fitrah-transactions", selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];
      const { data, error } = await supabase
        .from("zakat_fitrah_transactions")
        .select("*, muzakki:muzakki_id(name)")
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

  const selectedMuzakkiName = muzakkiList.find(m => m.id === selectedMuzakkiId)?.name;

  // Fetch members for selected muzakki with paid status check
  const { data: muzakkiMembers = [], isLoading: isLoadingMembers } = useQuery({
    queryKey: ["muzakki-members-for-zakat", selectedMuzakkiId, selectedPeriod?.id],
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
        .select("muzakki_member_id")
        .eq("period_id", selectedPeriod.id)
        .in("muzakki_member_id", members.map(m => m.id));

      if (paidError) throw paidError;

      const paidMemberIds = new Set(paidItems.map(item => item.muzakki_member_id));

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
        .eq("transaction_id", viewingTransaction.id);
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

      const totalMembers = selectedMembers.length;
      const calculatedRiceAmount = totalMembers * ricePerPerson;
      const riceAmount =
        paymentType === "rice" ? (isOverrideTotalRice ? customTotalRiceKg : calculatedRiceAmount) : null;
      const perMemberRiceAmount =
        paymentType === "rice"
          ? Math.round((((riceAmount ?? 0) / totalMembers) || ricePerPerson) * 1000) / 1000
          : null;
      const moneyAmount = paymentType === "money" ? totalMembers * cashPerPerson : null;

      // Create main transaction
      const { data: transaction, error: txError } = await supabase
        .from("zakat_fitrah_transactions")
        .insert({
          muzakki_id: selectedMuzakkiId,
          period_id: selectedPeriod.id,
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

      // Create transaction items for each member
      const items = selectedMembers.map(memberId => ({
        transaction_id: transaction.id,
        muzakki_member_id: memberId,
        period_id: selectedPeriod.id,
        rice_amount_kg: perMemberRiceAmount,
        money_amount: paymentType === "money" ? cashPerPerson : null,
      }));

      const { error: itemsError } = await supabase
        .from("zakat_fitrah_transaction_items")
        .insert(items);

      if (itemsError) throw itemsError;

      // Create ledger entry
      const category = paymentType === "rice" ? "zakat_fitrah_rice" : "zakat_fitrah_cash";
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

      return transaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zakat-fitrah-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["muzakki-members-for-zakat"] });
      queryClient.invalidateQueries({ queryKey: ["fund-balances"] });
      resetForm();
      setIsFormOpen(false);
      toast({ title: "Transaksi zakat fitrah berhasil disimpan" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const resetForm = () => {
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

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">
            Transaksi Zakat Fitrah - {selectedPeriod?.name || "Pilih Periode"}
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
                Belum ada transaksi zakat fitrah untuk periode ini
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Muzakki</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Jumlah Anggota</TableHead>
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
                      <TableCell>{tx.total_members} orang</TableCell>
                      <TableCell className="text-right">
                        {tx.payment_type === "rice"
                          ? `${tx.rice_amount_kg} kg`
                          : formatCurrency(tx.money_amount || 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setViewingTransaction(tx)}
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
      </div>

      {/* Create Transaction Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tambah Transaksi Zakat Fitrah</DialogTitle>
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
                Simpan Transaksi
              </Button>
            </div>
          </form>
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

import { useState } from "react";
import { useRouter } from "next/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ReadOnlyBanner } from "@/components/shared/ReadOnlyBanner";
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
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Edit, Plus, UserCheck, UserX, History, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface MuzakkiMember {
  id: string;
  muzakki_id: string;
  name: string;
  relationship: string;
  birth_date: string | null;
  notes: string | null;
  is_active: boolean;
  is_dependent: boolean;
}

interface ZakatFitrahItem {
  id: string;
  period_id: string;
  money_amount: number | null;
  rice_amount_kg: number | null;
  created_at: string;
  transaction: {
    transaction_date: string;
    payment_type: string;
  };
  period: {
    name: string;
    hijri_year: number;
  };
}

type DeleteResult = {
  mode: "deleted" | "deactivated";
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  head_of_family: "Kepala Keluarga",
  wife: "Istri",
  child: "Anak",
  parent: "Orang Tua",
};

export default function MuzakkiDetail() {
  const router = useRouter();
  const muzakkiId = typeof router.query.id === "string" ? router.query.id : undefined;
  const { toast } = useToast();
  const { isReadOnly, selectedPeriod } = usePeriod();
  const queryClient = useQueryClient();

  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<MuzakkiMember | null>(null);
  const [historyMember, setHistoryMember] = useState<MuzakkiMember | null>(null);
  const [memberForm, setMemberForm] = useState({
    name: "",
    relationship: "child" as string,
    birth_date: "",
    notes: "",
    is_dependent: true,
  });

  // Fetch Muzakki details
  const { data: muzakki, isLoading: isLoadingMuzakki } = useQuery({
    queryKey: ["muzakki", muzakkiId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("muzakki")
        .select("*")
        .eq("id", muzakkiId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!muzakkiId,
  });

  // Fetch members
  const { data: members = [], isLoading: isLoadingMembers } = useQuery({
    queryKey: ["muzakki-members", muzakkiId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("muzakki_members")
        .select("*")
        .eq("muzakki_id", muzakkiId)
        .order("relationship")
        .order("name");
      if (error) throw error;
      return data as MuzakkiMember[];
    },
    enabled: !!muzakkiId,
  });

  // Fetch zakat history for a member
  const { data: zakatHistory = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ["member-zakat-history", historyMember?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("zakat_fitrah_transaction_items")
        .select(`
          id,
          period_id,
          money_amount,
          rice_amount_kg,
          created_at,
          transaction:transaction_id(transaction_date, payment_type),
          period:period_id(name, hijri_year)
        `)
        .eq("muzakki_member_id", historyMember?.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ZakatFitrahItem[];
    },
    enabled: !!historyMember?.id,
  });

  // Create member mutation
  const createMemberMutation = useMutation({
    mutationFn: async (data: typeof memberForm) => {
      const { error } = await supabase.from("muzakki_members").insert({
        muzakki_id: muzakkiId,
        name: data.name,
        relationship: data.relationship as "head_of_family" | "wife" | "child" | "parent",
        birth_date: data.birth_date || null,
        notes: data.notes || null,
        is_dependent: data.is_dependent,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["muzakki-members", muzakkiId] });
      setIsAddMemberOpen(false);
      resetMemberForm();
      toast({ title: "Anggota berhasil ditambahkan" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  // Update member mutation
  const updateMemberMutation = useMutation({
    mutationFn: async (data: { id: string } & typeof memberForm & { is_active?: boolean }) => {
      const { error } = await supabase
        .from("muzakki_members")
        .update({
          name: data.name,
          relationship: data.relationship as "head_of_family" | "wife" | "child" | "parent",
          birth_date: data.birth_date || null,
          notes: data.notes || null,
          is_dependent: data.is_dependent,
          ...(data.is_active !== undefined && { is_active: data.is_active }),
        })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["muzakki-members", muzakkiId] });
      setEditingMember(null);
      resetMemberForm();
      toast({ title: "Anggota berhasil diperbarui" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  // Toggle member active status
  const toggleMemberStatus = (member: MuzakkiMember) => {
    updateMemberMutation.mutate({
      id: member.id,
      name: member.name,
      relationship: member.relationship,
      birth_date: member.birth_date || "",
      notes: member.notes || "",
      is_dependent: member.is_dependent,
      is_active: !member.is_active,
    });
  };

  const deleteMemberMutation = useMutation({
    mutationFn: async (memberId: string): Promise<DeleteResult> => {
      const { data: deletedRows, error } = await supabase
        .from("muzakki_members")
        .delete()
        .eq("id", memberId)
        .select("id");

      if (error) {
        const errorCode = (error as { code?: string } | null)?.code;
        const shouldFallbackToDeactivate = errorCode === "23503" || errorCode === "42501";
        if (!shouldFallbackToDeactivate) {
          throw error;
        }
      }

      if ((deletedRows?.length ?? 0) > 0) {
        return { mode: "deleted" };
      }

      const { data: deactivatedRows, error: deactivateError } = await supabase
        .from("muzakki_members")
        .update({ is_active: false, is_dependent: false })
        .eq("id", memberId)
        .select("id");

      if (deactivateError) throw deactivateError;
      if ((deactivatedRows?.length ?? 0) === 0) {
        throw new Error("Data anggota tidak ditemukan atau Anda tidak memiliki izin hapus/nonaktifkan.");
      }

      return { mode: "deactivated" };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["muzakki-members", muzakkiId] });
      queryClient.invalidateQueries({ queryKey: ["muzakki-members"] });
      toast({
        title:
          result.mode === "deleted"
            ? "Anggota berhasil dihapus"
            : "Anggota tidak bisa dihapus permanen, data dinonaktifkan",
      });
    },
    onError: (error: { message: string; code?: string }) => {
      const detail = error.code
        ? `[${error.code}] ${error.message}`
        : error.message;
      toast({ variant: "destructive", title: "Gagal menghapus anggota", description: detail });
    },
  });

  const deleteMuzakkiMutation = useMutation({
    mutationFn: async (): Promise<DeleteResult> => {
      if (!muzakkiId) {
        throw new Error("ID muzakki tidak valid.");
      }

      const { data: deletedRows, error } = await supabase
        .from("muzakki")
        .delete()
        .eq("id", muzakkiId)
        .select("id");

      if (error) {
        const errorCode = (error as { code?: string } | null)?.code;
        const shouldFallbackToDeactivate = errorCode === "23503" || errorCode === "42501";
        if (!shouldFallbackToDeactivate) {
          throw error;
        }
      }

      if ((deletedRows?.length ?? 0) > 0) {
        return { mode: "deleted" };
      }

      const { data: deactivatedMuzakkiRows, error: deactivateMuzakkiError } = await supabase
        .from("muzakki")
        .update({ is_active: false })
        .eq("id", muzakkiId)
        .select("id");

      if (deactivateMuzakkiError) throw deactivateMuzakkiError;
      if ((deactivatedMuzakkiRows?.length ?? 0) === 0) {
        throw new Error("Data muzakki tidak ditemukan atau Anda tidak memiliki izin hapus/nonaktifkan.");
      }

      const { error: deactivateMembersError } = await supabase
        .from("muzakki_members")
        .update({ is_active: false, is_dependent: false })
        .eq("muzakki_id", muzakkiId);

      if (deactivateMembersError) throw deactivateMembersError;

      return { mode: "deactivated" };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["muzakki"] });
      queryClient.invalidateQueries({ queryKey: ["muzakki-members"] });
      toast({
        title:
          result.mode === "deleted"
            ? "Muzakki berhasil dihapus (anggota ikut terhapus)"
            : "Muzakki tidak bisa dihapus permanen, data dinonaktifkan",
      });
      router.push("/muzakki");
    },
    onError: (error: { message: string; code?: string }) => {
      const detail = error.code
        ? `[${error.code}] ${error.message}`
        : error.message;
      toast({ variant: "destructive", title: "Gagal menghapus muzakki", description: detail });
    },
  });

  const toggleMuzakkiStatusMutation = useMutation({
    mutationFn: async () => {
      if (!muzakkiId || !muzakki) {
        throw new Error("ID muzakki tidak valid.");
      }
      const nextActive = !muzakki.is_active;
      const { error: muzakkiError } = await supabase
        .from("muzakki")
        .update({ is_active: nextActive })
        .eq("id", muzakkiId);
      if (muzakkiError) throw muzakkiError;

      if (!nextActive) {
        const { error: membersError } = await supabase
          .from("muzakki_members")
          .update({ is_active: false, is_dependent: false })
          .eq("muzakki_id", muzakkiId);
        if (membersError) throw membersError;
      }

      return { nextActive };
    },
    onSuccess: ({ nextActive }) => {
      queryClient.invalidateQueries({ queryKey: ["muzakki", muzakkiId] });
      queryClient.invalidateQueries({ queryKey: ["muzakki"] });
      queryClient.invalidateQueries({ queryKey: ["muzakki-members", muzakkiId] });
      queryClient.invalidateQueries({ queryKey: ["muzakki-members"] });
      toast({
        title: nextActive ? "Muzakki diaktifkan" : "Muzakki dinonaktifkan",
        description: nextActive
          ? "Anda bisa aktifkan anggota secara manual bila diperlukan."
          : "Semua anggota keluarga otomatis ikut dinonaktifkan.",
      });
    },
    onError: (error: { message: string; code?: string }) => {
      const detail = error.code ? `[${error.code}] ${error.message}` : error.message;
      toast({ variant: "destructive", title: "Gagal mengubah status muzakki", description: detail });
    },
  });

  const handleDeleteMember = (member: MuzakkiMember) => {
    const confirmed = window.confirm(`Hapus anggota "${member.name}"?`);
    if (!confirmed) return;
    deleteMemberMutation.mutate(member.id);
  };

  const handleDeleteMuzakki = () => {
    const confirmed = window.confirm(
      `Hapus muzakki "${muzakki.name}"?\n\nSemua anggota keluarga pada muzakki ini juga akan terhapus.`,
    );
    if (!confirmed) return;
    deleteMuzakkiMutation.mutate();
  };

  const handleToggleMuzakkiStatus = () => {
    const actionLabel = muzakki.is_active ? "Nonaktifkan" : "Aktifkan";
    const confirmed = window.confirm(`${actionLabel} muzakki "${muzakki.name}"?`);
    if (!confirmed) return;
    toggleMuzakkiStatusMutation.mutate();
  };

  const resetMemberForm = () => {
    setMemberForm({
      name: "",
      relationship: "child",
      birth_date: "",
      notes: "",
      is_dependent: true,
    });
  };

  const handleEditMember = (member: MuzakkiMember) => {
    setEditingMember(member);
    setMemberForm({
      name: member.name,
      relationship: member.relationship,
      birth_date: member.birth_date || "",
      notes: member.notes || "",
      is_dependent: member.is_dependent,
    });
  };

  const handleSubmitMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingMember) {
      updateMemberMutation.mutate({ id: editingMember.id, ...memberForm });
    } else {
      createMemberMutation.mutate(memberForm);
    }
  };

  if (isLoadingMuzakki) {
    return (
      <AppLayout title="Detail Muzakki">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Memuat...</p>
        </div>
      </AppLayout>
    );
  }

  if (!muzakki) {
    return (
      <AppLayout title="Detail Muzakki">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-muted-foreground">Muzakki tidak ditemukan</p>
          <Button onClick={() => router.push("/muzakki")}>Kembali ke Daftar</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`Detail: ${muzakki.name}`}>
      {isReadOnly && <ReadOnlyBanner periodName={selectedPeriod?.name} />}

      <div className="space-y-6">
        {/* Back button */}
        <Button variant="ghost" onClick={() => router.push("/muzakki")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Daftar Muzakki
        </Button>

        {/* Muzakki Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Informasi Muzakki</span>
              <div className="flex items-center gap-2">
                <Badge variant={muzakki.is_active ? "default" : "secondary"}>
                  {muzakki.is_active ? "Aktif" : "Nonaktif"}
                </Badge>
                {!isReadOnly && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleToggleMuzakkiStatus}
                      title={muzakki.is_active ? "Nonaktifkan Muzakki" : "Aktifkan Muzakki"}
                    >
                      {muzakki.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={handleDeleteMuzakki}
                      title="Hapus Muzakki"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Nama</p>
                <p className="font-medium">{muzakki.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">No. Telepon</p>
                <p className="font-medium">{muzakki.phone || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{muzakki.email || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Alamat</p>
                <p className="font-medium">{muzakki.address || "-"}</p>
              </div>
              {muzakki.notes && (
                <div className="md:col-span-2">
                  <p className="text-sm text-muted-foreground">Catatan</p>
                  <p className="font-medium">{muzakki.notes}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Members Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Anggota Keluarga ({members.length})</span>
              {!isReadOnly && (
                <Button size="sm" onClick={() => setIsAddMemberOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Tambah Anggota
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingMembers ? (
              <p className="text-muted-foreground">Memuat anggota...</p>
            ) : members.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Belum ada anggota keluarga
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Hubungan</TableHead>
                    <TableHead>Tanggal Lahir</TableHead>
                    <TableHead>Tanggungan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id} className={!member.is_active ? "opacity-50" : ""}>
                      <TableCell className="font-medium">{member.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {RELATIONSHIP_LABELS[member.relationship] || member.relationship}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {member.birth_date
                          ? format(new Date(member.birth_date), "dd MMM yyyy", { locale: idLocale })
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.is_dependent ? "default" : "secondary"}>
                          {member.is_dependent ? "Ya" : "Tidak"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.is_active ? "default" : "secondary"}>
                          {member.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setHistoryMember(member)}
                            title="Lihat Riwayat Zakat"
                          >
                            <History className="h-4 w-4" />
                          </Button>
                          {!isReadOnly && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditMember(member)}
                                title="Edit"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleMemberStatus(member)}
                                title={member.is_active ? "Nonaktifkan" : "Aktifkan"}
                              >
                                {member.is_active ? (
                                  <UserX className="h-4 w-4" />
                                ) : (
                                  <UserCheck className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => handleDeleteMember(member)}
                                title="Hapus Anggota"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
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

      {/* Add/Edit Member Dialog */}
      <Dialog
        open={isAddMemberOpen || !!editingMember}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddMemberOpen(false);
            setEditingMember(null);
            resetMemberForm();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMember ? "Edit Anggota" : "Tambah Anggota Baru"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitMember} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="member_name">Nama *</Label>
              <Input
                id="member_name"
                value={memberForm.name}
                onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                placeholder="Nama anggota keluarga"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="relationship">Hubungan *</Label>
              <Select
                value={memberForm.relationship}
                onValueChange={(value) => setMemberForm({ ...memberForm, relationship: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="head_of_family">Kepala Keluarga</SelectItem>
                  <SelectItem value="wife">Istri</SelectItem>
                  <SelectItem value="child">Anak</SelectItem>
                  <SelectItem value="parent">Orang Tua</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="birth_date">Tanggal Lahir</Label>
              <Input
                id="birth_date"
                type="date"
                value={memberForm.birth_date}
                onChange={(e) => setMemberForm({ ...memberForm, birth_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member_notes">Catatan</Label>
              <Textarea
                id="member_notes"
                value={memberForm.notes}
                onChange={(e) => setMemberForm({ ...memberForm, notes: e.target.value })}
                placeholder="Catatan tambahan"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="member_is_dependent">Termasuk Tanggungan</Label>
                <p className="text-xs text-muted-foreground">
                  Anggota tanggungan akan muncul di transaksi zakat fitrah.
                </p>
              </div>
              <Switch
                id="member_is_dependent"
                checked={memberForm.is_dependent}
                onCheckedChange={(checked) => setMemberForm({ ...memberForm, is_dependent: checked })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsAddMemberOpen(false);
                  setEditingMember(null);
                  resetMemberForm();
                }}
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={createMemberMutation.isPending || updateMemberMutation.isPending}
              >
                {editingMember ? "Simpan" : "Tambah"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Zakat History Dialog */}
      <Dialog open={!!historyMember} onOpenChange={(open) => !open && setHistoryMember(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Riwayat Zakat: {historyMember?.name}</DialogTitle>
          </DialogHeader>
          {isLoadingHistory ? (
            <p className="text-muted-foreground text-center py-4">Memuat riwayat...</p>
          ) : zakatHistory.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Belum ada riwayat pembayaran zakat
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periode</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zakatHistory.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.period?.name || "-"}</TableCell>
                    <TableCell>
                      {item.transaction?.transaction_date
                        ? format(new Date(item.transaction.transaction_date), "dd MMM yyyy", { locale: idLocale })
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {item.transaction?.payment_type === "money" ? "Uang" : "Beras"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {item.transaction?.payment_type === "money"
                        ? `Rp ${item.money_amount?.toLocaleString("id-ID") || 0}`
                        : `${item.rice_amount_kg || 0} kg`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

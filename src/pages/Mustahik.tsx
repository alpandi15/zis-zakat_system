import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { ReadOnlyBanner } from "@/components/shared/ReadOnlyBanner";
import { AsnafEligibilityBadges } from "@/components/shared/AsnafEligibilityBadges";
import { usePeriod } from "@/contexts/PeriodContext";
import { useAsnafSettings } from "@/hooks/useAsnafSettings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Edit, Eye, Trash2 } from "lucide-react";

interface Mustahik {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  asnaf_id: string;
  asnaf_settings: { asnaf_code: string; asnaf_name: string } | null;
  priority: string;
  family_members: number | null;
  monthly_income: number | null;
  monthly_expense: number | null;
  notes: string | null;
  is_active: boolean;
}

const PRIORITY_LABELS: Record<string, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  urgent: "Mendesak",
};

const PRIORITY_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "secondary",
  medium: "outline",
  high: "default",
  urgent: "destructive",
};

export default function MustahikPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMustahik, setEditingMustahik] = useState<Mustahik | null>(null);
  const [deletingMustahik, setDeletingMustahik] = useState<Mustahik | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    asnaf_id: "",
    priority: "medium",
    family_members: 1,
    monthly_income: "",
    monthly_expense: "",
    notes: "",
  });

  const { toast } = useToast();
  const { isReadOnly, selectedPeriod } = usePeriod();
  const { getAsnafOptions, getLabel } = useAsnafSettings();
  const queryClient = useQueryClient();
  const asnafOptions = getAsnafOptions();

  const { data: mustahikList = [], isLoading } = useQuery({
    queryKey: ["mustahik"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mustahik")
        .select("*, asnaf_settings(asnaf_code, asnaf_name)")
        .is("deleted_at", null) // Filter out soft-deleted records
        .order("priority", { ascending: false })
        .order("name");

      if (error) throw error;
      return data as Mustahik[];
    },
  });

  // Check if mustahik can be deleted (not in finalized distributions)
  const checkCanDelete = async (mustahikId: string): Promise<boolean> => {
    // Check zakat distributions
    const { data: zakatDist } = await supabase
      .from("zakat_distributions")
      .select("id")
      .eq("mustahik_id", mustahikId)
      .in("status", ["approved", "distributed"])
      .limit(1);
    
    if (zakatDist && zakatDist.length > 0) return false;

    // Check fidyah distributions
    const { data: fidyahDist } = await supabase
      .from("fidyah_distributions")
      .select("id")
      .eq("mustahik_id", mustahikId)
      .in("status", ["approved", "distributed"])
      .limit(1);

    if (fidyahDist && fidyahDist.length > 0) return false;

    return true;
  };

  type AsnafType = "fakir" | "miskin" | "amil" | "muallaf" | "riqab" | "gharimin" | "fisabilillah" | "ibnu_sabil";
  type PriorityType = "low" | "medium" | "high" | "urgent";

  // Helper to get asnaf_code from asnaf_id for legacy enum column
  const getAsnafCodeById = (asnafId: string): AsnafType => {
    const asnaf = asnafOptions.find(o => o.id === asnafId);
    const code = asnaf?.value || "miskin";
    // Map to valid enum values (for legacy support)
    const validEnums: AsnafType[] = ["fakir", "miskin", "amil", "muallaf", "riqab", "gharimin", "fisabilillah", "ibnu_sabil"];
    return validEnums.includes(code as AsnafType) ? (code as AsnafType) : "miskin";
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("mustahik").insert({
        name: data.name,
        address: data.address || null,
        phone: data.phone || null,
        asnaf_id: data.asnaf_id,
        asnaf: getAsnafCodeById(data.asnaf_id), // Legacy enum column
        priority: data.priority as PriorityType,
        family_members: data.family_members,
        monthly_income: data.monthly_income ? parseFloat(data.monthly_income) : null,
        monthly_expense: data.monthly_expense ? parseFloat(data.monthly_expense) : null,
        notes: data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mustahik"] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: "Mustahik berhasil ditambahkan" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string } & typeof formData) => {
      const { error } = await supabase
        .from("mustahik")
        .update({
          name: data.name,
          address: data.address || null,
          phone: data.phone || null,
          asnaf_id: data.asnaf_id,
          asnaf: getAsnafCodeById(data.asnaf_id), // Legacy enum column
          priority: data.priority as PriorityType,
          family_members: data.family_members,
          monthly_income: data.monthly_income ? parseFloat(data.monthly_income) : null,
          monthly_expense: data.monthly_expense ? parseFloat(data.monthly_expense) : null,
          notes: data.notes || null,
        })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mustahik"] });
      setIsDialogOpen(false);
      setEditingMustahik(null);
      resetForm();
      toast({ title: "Mustahik berhasil diperbarui" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  // Soft delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // First check if can be deleted
      const canDelete = await checkCanDelete(id);
      if (!canDelete) {
        throw new Error("Mustahik tidak dapat dihapus karena sudah memiliki riwayat distribusi");
      }

      // Perform soft delete
      const { error } = await supabase
        .from("mustahik")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mustahik"] });
      setDeletingMustahik(null);
      toast({ title: "Mustahik berhasil dihapus" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const resetForm = () => {
    // Set default asnaf_id to first available option
    const defaultAsnaf = asnafOptions.find(o => o.value === "miskin") || asnafOptions[0];
    setFormData({
      name: "",
      address: "",
      phone: "",
      asnaf_id: defaultAsnaf?.id || "",
      priority: "medium",
      family_members: 1,
      monthly_income: "",
      monthly_expense: "",
      notes: "",
    });
  };

  const handleEdit = (mustahik: Mustahik) => {
    setEditingMustahik(mustahik);
    setFormData({
      name: mustahik.name,
      address: mustahik.address || "",
      phone: mustahik.phone || "",
      asnaf_id: mustahik.asnaf_id,
      priority: mustahik.priority,
      family_members: mustahik.family_members || 1,
      monthly_income: mustahik.monthly_income?.toString() || "",
      monthly_expense: mustahik.monthly_expense?.toString() || "",
      notes: mustahik.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingMustahik) {
      updateMutation.mutate({ id: editingMustahik.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const columns: Column<Mustahik>[] = [
    { key: "name", header: "Nama" },
    {
      key: "asnaf_id",
      header: "Asnaf",
      render: (m) => {
        const asnafCode = m.asnaf_settings?.asnaf_code || "";
        return (
          <div className="flex flex-col gap-1">
            <Badge variant="outline">{m.asnaf_settings?.asnaf_name || "-"}</Badge>
            <AsnafEligibilityBadges asnafCode={asnafCode} size="sm" />
          </div>
        );
      },
    },
    {
      key: "priority",
      header: "Prioritas",
      render: (m) => (
        <Badge variant={PRIORITY_COLORS[m.priority]}>
          {PRIORITY_LABELS[m.priority] || m.priority}
        </Badge>
      ),
    },
    { key: "family_members", header: "Jml Anggota" },
    { key: "phone", header: "Telepon" },
  ];

  return (
    <AppLayout title="Data Mustahik">
      {isReadOnly && <ReadOnlyBanner periodName={selectedPeriod?.name} />}

      <DataTable
        title="Daftar Mustahik"
        data={mustahikList}
        columns={columns}
        isLoading={isLoading}
        isReadOnly={isReadOnly}
        onAdd={() => { resetForm(); setEditingMustahik(null); setIsDialogOpen(true); }}
        addLabel="Tambah Mustahik"
        searchKey="name"
        searchPlaceholder="Cari mustahik..."
        emptyMessage="Belum ada data mustahik"
        actions={(mustahik) => (
          !isReadOnly ? (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => handleEdit(mustahik)}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setDeletingMustahik(mustahik)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="icon">
              <Eye className="h-4 w-4" />
            </Button>
          )
        )}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingMustahik ? "Edit Mustahik" : "Tambah Mustahik Baru"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="name">Nama Lengkap *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="asnaf">Kategori Asnaf *</Label>
                <Select
                  value={formData.asnaf_id}
                  onValueChange={(value) => setFormData({ ...formData, asnaf_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Asnaf" />
                  </SelectTrigger>
                  <SelectContent>
                    {asnafOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Prioritas *</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telepon</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="family_members">Jumlah Anggota</Label>
                <Input
                  id="family_members"
                  type="number"
                  min={1}
                  value={formData.family_members}
                  onChange={(e) => setFormData({ ...formData, family_members: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthly_income">Penghasilan/Bulan</Label>
                <Input
                  id="monthly_income"
                  type="number"
                  value={formData.monthly_income}
                  onChange={(e) => setFormData({ ...formData, monthly_income: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthly_expense">Pengeluaran/Bulan</Label>
                <Input
                  id="monthly_expense"
                  type="number"
                  value={formData.monthly_expense}
                  onChange={(e) => setFormData({ ...formData, monthly_expense: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Alamat</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Catatan</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingMustahik ? "Simpan" : "Tambah"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingMustahik} onOpenChange={(open) => !open && setDeletingMustahik(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Mustahik?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus <strong>{deletingMustahik?.name}</strong>? 
              Data akan dihapus dari daftar aktif namun riwayat distribusi tetap tersimpan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingMustahik && deleteMutation.mutate(deletingMustahik.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { ReadOnlyBanner } from "@/components/shared/ReadOnlyBanner";
import { usePeriod } from "@/contexts/PeriodContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Edit, Eye } from "lucide-react";

interface MuzakkiMember {
  id: string;
  muzakki_id: string;
  name: string;
  relationship: string;
  birth_date: string | null;
  notes: string | null;
  is_active: boolean;
  muzakki?: { name: string };
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  head_of_family: "Kepala Keluarga",
  wife: "Istri",
  child: "Anak",
  parent: "Orang Tua",
};

export default function Members() {
  const router = useRouter();
  const muzakkiFilter = typeof router.query.muzakki === "string" ? router.query.muzakki : null;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<MuzakkiMember | null>(null);
  const [formData, setFormData] = useState({
    muzakki_id: muzakkiFilter || "",
    name: "",
    relationship: "child" as string,
    birth_date: "",
    notes: "",
  });

  const { toast } = useToast();
  const { isReadOnly, selectedPeriod } = usePeriod();
  const queryClient = useQueryClient();

  const { data: muzakkiList = [] } = useQuery({
    queryKey: ["muzakki"],
    queryFn: async () => {
      const { data, error } = await supabase.from("muzakki").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["muzakki-members", muzakkiFilter],
    queryFn: async () => {
      let query = supabase
        .from("muzakki_members")
        .select("*, muzakki:muzakki_id(name)")
        .order("name");

      if (muzakkiFilter) {
        query = query.eq("muzakki_id", muzakkiFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as MuzakkiMember[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("muzakki_members").insert({
        muzakki_id: data.muzakki_id,
        name: data.name,
        relationship: data.relationship as "head_of_family" | "wife" | "child" | "parent",
        birth_date: data.birth_date || null,
        notes: data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["muzakki-members"] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: "Anggota berhasil ditambahkan" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string } & typeof formData) => {
      const { error } = await supabase
        .from("muzakki_members")
        .update({
          muzakki_id: data.muzakki_id,
          name: data.name,
          relationship: data.relationship as "head_of_family" | "wife" | "child" | "parent",
          birth_date: data.birth_date || null,
          notes: data.notes || null,
        })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["muzakki-members"] });
      setIsDialogOpen(false);
      setEditingMember(null);
      resetForm();
      toast({ title: "Anggota berhasil diperbarui" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const resetForm = () => {
    setFormData({
      muzakki_id: muzakkiFilter || "",
      name: "",
      relationship: "child",
      birth_date: "",
      notes: "",
    });
  };

  const handleEdit = (member: MuzakkiMember) => {
    setEditingMember(member);
    setFormData({
      muzakki_id: member.muzakki_id,
      name: member.name,
      relationship: member.relationship,
      birth_date: member.birth_date || "",
      notes: member.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingMember) {
      updateMutation.mutate({ id: editingMember.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const columns: Column<MuzakkiMember>[] = [
    { key: "name", header: "Nama Anggota" },
    {
      key: "muzakki",
      header: "Muzakki",
      render: (m) => m.muzakki?.name || "-",
    },
    {
      key: "relationship",
      header: "Hubungan",
      render: (m) => (
        <Badge variant="outline">
          {RELATIONSHIP_LABELS[m.relationship] || m.relationship}
        </Badge>
      ),
    },
    {
      key: "is_active",
      header: "Status",
      render: (m) => (
        <Badge variant={m.is_active ? "default" : "secondary"}>
          {m.is_active ? "Aktif" : "Nonaktif"}
        </Badge>
      ),
    },
  ];

  return (
    <AppLayout title="Data Anggota Keluarga">
      {isReadOnly && <ReadOnlyBanner periodName={selectedPeriod?.name} />}

      <DataTable
        title={muzakkiFilter ? `Anggota Keluarga` : "Semua Anggota Keluarga"}
        data={members}
        columns={columns}
        isLoading={isLoading}
        isReadOnly={isReadOnly}
        onAdd={() => { resetForm(); setEditingMember(null); setIsDialogOpen(true); }}
        addLabel="Tambah Anggota"
        searchKey="name"
        searchPlaceholder="Cari anggota..."
        emptyMessage="Belum ada data anggota"
        actions={(member) => (
          !isReadOnly ? (
            <Button variant="ghost" size="icon" onClick={() => handleEdit(member)}>
              <Edit className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon">
              <Eye className="h-4 w-4" />
            </Button>
          )
        )}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMember ? "Edit Anggota" : "Tambah Anggota Baru"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="muzakki_id">Muzakki *</Label>
              <Select
                value={formData.muzakki_id}
                onValueChange={(value) => setFormData({ ...formData, muzakki_id: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih muzakki" />
                </SelectTrigger>
                <SelectContent>
                  {muzakkiList.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nama Anggota *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nama anggota keluarga"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="relationship">Hubungan *</Label>
              <Select
                value={formData.relationship}
                onValueChange={(value) => setFormData({ ...formData, relationship: value })}
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
                value={formData.birth_date}
                onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Catatan</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Catatan tambahan"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingMember ? "Simpan" : "Tambah"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

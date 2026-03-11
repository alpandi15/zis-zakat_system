import { useEffect, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Edit, Eye, Users } from "lucide-react";

interface MuzakkiMember {
  id: string;
  muzakki_id: string;
  name: string;
  relationship: string;
  birth_date: string | null;
  notes: string | null;
  is_active: boolean;
  is_dependent: boolean;
  source_type: "member" | "muzakki";
  muzakki?: { name: string };
}

interface MuzakkiRow {
  id: string;
  name: string;
  notes: string | null;
  is_active: boolean;
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
  const sourceFromQuery = router.query.source === "muzakki" ? "muzakki" : "muzakki_members";
  const [memberSource, setMemberSource] = useState<"muzakki_members" | "muzakki">("muzakki_members");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<MuzakkiMember | null>(null);
  const [formData, setFormData] = useState({
    muzakki_id: muzakkiFilter || "",
    name: "",
    relationship: "child" as string,
    birth_date: "",
    notes: "",
    is_dependent: true,
  });

  const { toast } = useToast();
  const { isReadOnly, selectedPeriod } = usePeriod();
  const queryClient = useQueryClient();
  const canManageMembers = !isReadOnly && memberSource === "muzakki_members";

  useEffect(() => {
    setMemberSource(sourceFromQuery);
  }, [sourceFromQuery]);

  const { data: muzakkiList = [] } = useQuery({
    queryKey: ["muzakki"],
    queryFn: async () => {
      const { data, error } = await supabase.from("muzakki").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["muzakki-members", muzakkiFilter, memberSource],
    queryFn: async () => {
      if (memberSource === "muzakki") {
        let muzakkiQuery = supabase.from("muzakki").select("id, name, notes, is_active").order("name");

        if (muzakkiFilter) {
          muzakkiQuery = muzakkiQuery.eq("id", muzakkiFilter);
        }

        const { data, error } = await muzakkiQuery;
        if (error) throw error;

        return (data as MuzakkiRow[]).map((m) => ({
          id: `muzakki-${m.id}`,
          muzakki_id: m.id,
          name: m.name,
          relationship: "head_of_family",
          birth_date: null,
          notes: m.notes,
          is_active: m.is_active,
          is_dependent: true,
          source_type: "muzakki" as const,
          muzakki: { name: m.name },
        })) as MuzakkiMember[];
      }

      let query = supabase
        .from("muzakki_members")
        .select("*, muzakki:muzakki_id(name)")
        .order("name");

      if (muzakkiFilter) {
        query = query.eq("muzakki_id", muzakkiFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as Omit<MuzakkiMember, "source_type">[]).map((member) => ({
        ...member,
        source_type: "member" as const,
      })) as MuzakkiMember[];
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
        is_dependent: data.is_dependent,
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
          is_dependent: data.is_dependent,
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
      is_dependent: true,
    });
  };

  const handleEdit = (member: MuzakkiMember) => {
    if (!canManageMembers || member.source_type !== "member") return;
    setEditingMember(member);
    setFormData({
      muzakki_id: member.muzakki_id,
      name: member.name,
      relationship: member.relationship,
      birth_date: member.birth_date || "",
      notes: member.notes || "",
      is_dependent: member.is_dependent,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageMembers) return;
    if (editingMember) {
      updateMutation.mutate({ id: editingMember.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleViewMuzakki = (member: MuzakkiMember) => {
    router.push(`/muzakki/${member.muzakki_id}`);
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
      key: "is_dependent",
      header: "Tanggungan",
      render: (m) => (
        <Badge variant={m.is_dependent ? "default" : "secondary"}>
          {m.is_dependent ? "Ya" : "Tidak"}
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
        title={
          memberSource === "muzakki_members"
            ? muzakkiFilter
              ? "Anggota Keluarga"
              : "Semua Anggota Keluarga"
            : "Data Muzakki sebagai Kepala Keluarga"
        }
        data={members}
        columns={columns}
        isLoading={isLoading}
        isReadOnly={isReadOnly}
        onAdd={
          canManageMembers
            ? () => {
                resetForm();
                setEditingMember(null);
                setIsDialogOpen(true);
              }
            : undefined
        }
        addLabel="Tambah Anggota"
        searchKey="name"
        searchPlaceholder="Cari anggota..."
        emptyMessage={
          memberSource === "muzakki_members"
            ? "Belum ada data anggota"
            : "Belum ada data muzakki"
        }
        toolbarExtra={
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/70 px-2 py-1">
            <span className="hidden text-xs text-muted-foreground sm:inline">Sumber:</span>
            <Select
              value={memberSource}
              onValueChange={(value) => {
                setMemberSource(value as "muzakki_members" | "muzakki");
                setIsDialogOpen(false);
                setEditingMember(null);
              }}
            >
              <SelectTrigger className="h-8 min-w-[170px] border-0 bg-transparent px-2 text-xs focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="muzakki_members">Tabel `muzakki_members`</SelectItem>
                <SelectItem value="muzakki">Tabel `muzakki`</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        actions={(member) => (
          memberSource === "muzakki" ? (
            <Button variant="ghost" size="icon" onClick={() => handleViewMuzakki(member)} title="Buka detail muzakki">
              <Users className="h-4 w-4" />
            </Button>
          ) : !isReadOnly ? (
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
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="is_dependent">Termasuk Tanggungan</Label>
                <p className="text-xs text-muted-foreground">
                  Anggota tanggungan muncul pada transaksi zakat fitrah.
                </p>
              </div>
              <Switch
                id="is_dependent"
                checked={formData.is_dependent}
                onCheckedChange={(checked) => setFormData({ ...formData, is_dependent: checked })}
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

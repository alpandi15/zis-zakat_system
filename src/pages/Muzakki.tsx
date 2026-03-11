import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { ReadOnlyBanner } from "@/components/shared/ReadOnlyBanner";
import { usePeriod } from "@/contexts/PeriodContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/router";
import { Edit, Eye, Trash2, Users, UserCheck, UserX } from "lucide-react";
import { MuzakkiFormDialog } from "@/components/muzakki/MuzakkiFormDialog";
import { useToast } from "@/hooks/use-toast";

interface Muzakki {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  member_count?: number;
}

type DeleteResult = {
  mode: "deleted" | "deactivated";
};

export default function MuzakkiPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMuzakki, setEditingMuzakki] = useState<Muzakki | null>(null);

  const { isReadOnly, selectedPeriod } = usePeriod();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: muzakkiList = [], isLoading } = useQuery({
    queryKey: ["muzakki"],
    queryFn: async () => {
      // Get muzakki with member count
      const { data: muzakkis, error: muzakkiError } = await supabase
        .from("muzakki")
        .select("*")
        .order("name");

      if (muzakkiError) throw muzakkiError;

      // Get member counts
      const { data: memberCounts, error: countError } = await supabase
        .from("muzakki_members")
        .select("muzakki_id")
        .eq("is_active", true)
        .eq("is_dependent", true);

      if (countError) throw countError;

      // Count members per muzakki
      const countMap = memberCounts.reduce((acc, item) => {
        acc[item.muzakki_id] = (acc[item.muzakki_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return muzakkis.map((m) => ({
        ...m,
        member_count: countMap[m.id] || 0,
      })) as Muzakki[];
    },
  });

  const handleAdd = () => {
    setEditingMuzakki(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (muzakki: Muzakki) => {
    setEditingMuzakki(muzakki);
    setIsDialogOpen(true);
  };

  const handleViewDetail = (muzakki: Muzakki) => {
    router.push(`/muzakki/${muzakki.id}`);
  };

  const deleteMuzakkiMutation = useMutation({
    mutationFn: async (id: string): Promise<DeleteResult> => {
      const { data: deletedRows, error } = await supabase
        .from("muzakki")
        .delete()
        .eq("id", id)
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

      const { data: deactivatedRows, error: deactivateMuzakkiError } = await supabase
        .from("muzakki")
        .update({ is_active: false })
        .eq("id", id)
        .select("id");

      if (deactivateMuzakkiError) throw deactivateMuzakkiError;
      if ((deactivatedRows?.length ?? 0) === 0) {
        throw new Error("Data muzakki tidak ditemukan atau Anda tidak memiliki izin hapus/nonaktifkan.");
      }

      const { error: deactivateMembersError } = await supabase
        .from("muzakki_members")
        .update({ is_active: false, is_dependent: false })
        .eq("muzakki_id", id);

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
    },
    onError: (error: { message: string; code?: string }) => {
      const detail = error.code
        ? `[${error.code}] ${error.message}`
        : error.message;
      toast({ variant: "destructive", title: "Gagal menghapus muzakki", description: detail });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async (target: Pick<Muzakki, "id" | "name" | "is_active">) => {
      const nextActive = !target.is_active;
      const { error: muzakkiError } = await supabase
        .from("muzakki")
        .update({ is_active: nextActive })
        .eq("id", target.id);
      if (muzakkiError) throw muzakkiError;

      if (!nextActive) {
        const { error: membersError } = await supabase
          .from("muzakki_members")
          .update({ is_active: false, is_dependent: false })
          .eq("muzakki_id", target.id);
        if (membersError) throw membersError;
      }

      return { nextActive, name: target.name };
    },
    onSuccess: ({ nextActive, name }) => {
      queryClient.invalidateQueries({ queryKey: ["muzakki"] });
      queryClient.invalidateQueries({ queryKey: ["muzakki-members"] });
      toast({
        title: nextActive ? `Muzakki "${name}" diaktifkan` : `Muzakki "${name}" dinonaktifkan`,
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

  const handleDelete = (muzakki: Muzakki) => {
    const confirmed = window.confirm(
      `Hapus muzakki "${muzakki.name}"?\n\nSemua anggota keluarga pada muzakki ini juga akan terhapus.`,
    );
    if (!confirmed) return;
    deleteMuzakkiMutation.mutate(muzakki.id);
  };

  const handleToggleStatus = (muzakki: Muzakki) => {
    const actionLabel = muzakki.is_active ? "Nonaktifkan" : "Aktifkan";
    const confirmed = window.confirm(`${actionLabel} muzakki "${muzakki.name}"?`);
    if (!confirmed) return;
    toggleStatusMutation.mutate(muzakki);
  };

  const columns: Column<Muzakki>[] = [
    { key: "name", header: "Nama" },
    { key: "phone", header: "Telepon" },
    { key: "address", header: "Alamat" },
    {
      key: "member_count",
      header: "Anggota",
      render: (m) => (
        <Badge variant="outline">{m.member_count || 0} anggota</Badge>
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
    <AppLayout title="Data Muzakki">
      {isReadOnly && <ReadOnlyBanner periodName={selectedPeriod?.name} />}

      <DataTable
        title="Daftar Muzakki"
        data={muzakkiList}
        columns={columns}
        isLoading={isLoading}
        isReadOnly={isReadOnly}
        onAdd={handleAdd}
        addLabel="Tambah Muzakki"
        toolbarExtra={
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => router.push("/members?source=muzakki_members")}
          >
            <Users className="h-4 w-4" />
            Anggota Keluarga
          </Button>
        }
        searchKey="name"
        searchPlaceholder="Cari muzakki..."
        emptyMessage="Belum ada data muzakki"
        actions={(muzakki) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleViewDetail(muzakki)}
              title="Lihat Detail & Kelola Anggota"
            >
              <Users className="h-4 w-4" />
            </Button>
            {!isReadOnly ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(muzakki)}
                  title="Edit Info Muzakki"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleToggleStatus(muzakki)}
                  title={muzakki.is_active ? "Nonaktifkan Muzakki" : "Aktifkan Muzakki"}
                >
                  {muzakki.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  onClick={() => handleDelete(muzakki)}
                  title="Hapus Muzakki"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="icon" title="Lihat Detail">
                <Eye className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      />

      <MuzakkiFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        editingMuzakki={editingMuzakki}
      />
    </AppLayout>
  );
}

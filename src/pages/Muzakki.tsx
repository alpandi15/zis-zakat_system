import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { ReadOnlyBanner } from "@/components/shared/ReadOnlyBanner";
import { usePeriod } from "@/contexts/PeriodContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/router";
import { Edit, Eye, Users } from "lucide-react";
import { MuzakkiFormDialog } from "@/components/muzakki/MuzakkiFormDialog";

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

export default function MuzakkiPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMuzakki, setEditingMuzakki] = useState<Muzakki | null>(null);

  const { isReadOnly, selectedPeriod } = usePeriod();
  const router = useRouter();

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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleEdit(muzakki)}
                title="Edit Info Muzakki"
              >
                <Edit className="h-4 w-4" />
              </Button>
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

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Edit, Archive, Trash2 } from "lucide-react";

interface Period {
  id: string;
  name: string;
  hijri_year: number;
  gregorian_year: number;
  status: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  rice_amount_per_person: number | null;
  cash_amount_per_person: number | null;
  fidyah_daily_rate: number | null;
  nisab_gold_price_per_gram: number | null;
  nisab_silver_price_per_gram: number | null;
}

export default function Periods() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<Period | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    hijri_year: new Date().getFullYear() - 579,
    gregorian_year: new Date().getFullYear(),
    description: "",
    start_date: "",
    end_date: "",
    rice_amount_per_person: 2.5,
    cash_amount_per_person: 35000,
    fidyah_daily_rate: 35000,
    nisab_gold_price_per_gram: 1200000,
    nisab_silver_price_per_gram: 15000,
  });

  const { toast } = useToast();
  const { canManagePeriods, hasRole } = useAuth();
  const queryClient = useQueryClient();

  const { data: periods = [], isLoading } = useQuery({
    queryKey: ["periods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("periods")
        .select("*")
        .order("hijri_year", { ascending: false });

      if (error) throw error;
      return data as Period[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("periods").insert({
        name: data.name,
        hijri_year: data.hijri_year,
        gregorian_year: data.gregorian_year,
        description: data.description || null,
        start_date: data.start_date || null,
        end_date: data.end_date || null,
        rice_amount_per_person: data.rice_amount_per_person,
        cash_amount_per_person: data.cash_amount_per_person,
        fidyah_daily_rate: data.fidyah_daily_rate,
        nisab_gold_price_per_gram: data.nisab_gold_price_per_gram,
        nisab_silver_price_per_gram: data.nisab_silver_price_per_gram,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: "Periode berhasil ditambahkan" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string } & typeof formData) => {
      const { error } = await supabase
        .from("periods")
        .update({
          name: data.name,
          hijri_year: data.hijri_year,
          gregorian_year: data.gregorian_year,
          description: data.description || null,
          start_date: data.start_date || null,
          end_date: data.end_date || null,
          rice_amount_per_person: data.rice_amount_per_person,
          cash_amount_per_person: data.cash_amount_per_person,
          fidyah_daily_rate: data.fidyah_daily_rate,
          nisab_gold_price_per_gram: data.nisab_gold_price_per_gram,
          nisab_silver_price_per_gram: data.nisab_silver_price_per_gram,
        })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      setIsDialogOpen(false);
      setEditingPeriod(null);
      resetForm();
      toast({ title: "Periode berhasil diperbarui" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("periods")
        .update({ status: "archived" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      toast({ title: "Periode berhasil diarsipkan" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("periods").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      toast({ title: "Periode berhasil dihapus" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      hijri_year: new Date().getFullYear() - 579,
      gregorian_year: new Date().getFullYear(),
      description: "",
      start_date: "",
      end_date: "",
      rice_amount_per_person: 2.5,
      cash_amount_per_person: 35000,
      fidyah_daily_rate: 35000,
      nisab_gold_price_per_gram: 1200000,
      nisab_silver_price_per_gram: 15000,
    });
  };

  const handleEdit = (period: Period) => {
    setEditingPeriod(period);
    setFormData({
      name: period.name,
      hijri_year: period.hijri_year,
      gregorian_year: period.gregorian_year,
      description: period.description || "",
      start_date: period.start_date || "",
      end_date: period.end_date || "",
      rice_amount_per_person: period.rice_amount_per_person ?? 2.5,
      cash_amount_per_person: period.cash_amount_per_person ?? 35000,
      fidyah_daily_rate: period.fidyah_daily_rate ?? 35000,
      nisab_gold_price_per_gram: period.nisab_gold_price_per_gram ?? 1200000,
      nisab_silver_price_per_gram: period.nisab_silver_price_per_gram ?? 15000,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPeriod) {
      updateMutation.mutate({ id: editingPeriod.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const columns: Column<Period>[] = [
    { key: "name", header: "Nama Periode" },
    {
      key: "hijri_year",
      header: "Tahun",
      render: (p) => `${p.hijri_year}H / ${p.gregorian_year}M`,
    },
    {
      key: "status",
      header: "Status",
      render: (p) => (
        <Badge variant={p.status === "active" ? "default" : "secondary"}>
          {p.status === "active" ? "Aktif" : "Arsip"}
        </Badge>
      ),
    },
    { key: "description", header: "Keterangan" },
  ];

  const canManage = canManagePeriods();

  return (
    <AppLayout title="Manajemen Periode">
      {!canManage && (
        <div className="mb-4 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
          Anda hanya memiliki akses untuk melihat daftar periode. Untuk mengelola periode, hubungi Administrator.
        </div>
      )}
      <DataTable
        title="Daftar Periode"
        data={periods}
        columns={columns}
        isLoading={isLoading}
        onAdd={canManage ? () => { resetForm(); setEditingPeriod(null); setIsDialogOpen(true); } : undefined}
        addLabel="Tambah Periode"
        searchKey="name"
        searchPlaceholder="Cari periode..."
        emptyMessage="Belum ada periode"
        actions={canManage ? (period) => (
          <div className="flex gap-1">
            {period.status === "active" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(period)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => archiveMutation.mutate(period.id)}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </>
            )}
            {period.status === "active" && hasRole("super_admin") && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => deleteMutation.mutate(period.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : undefined}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPeriod ? "Edit Periode" : "Tambah Periode Baru"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nama Periode</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ramadhan 1446H"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hijri_year">Tahun Hijriyah</Label>
                <Input
                  id="hijri_year"
                  type="number"
                  value={formData.hijri_year}
                  onChange={(e) => setFormData({ ...formData, hijri_year: parseInt(e.target.value) })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gregorian_year">Tahun Masehi</Label>
                <Input
                  id="gregorian_year"
                  type="number"
                  value={formData.gregorian_year}
                  onChange={(e) => setFormData({ ...formData, gregorian_year: parseInt(e.target.value) })}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Tanggal Mulai</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">Tanggal Selesai</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Keterangan</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Deskripsi periode..."
              />
            </div>

            {/* Configurable Values */}
            <div className="border-t pt-4 mt-4">
              <h4 className="font-medium mb-3">Konfigurasi Nilai Default</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rice_amount_per_person">Beras per Orang (kg)</Label>
                  <Input
                    id="rice_amount_per_person"
                    type="number"
                    step="0.1"
                    value={formData.rice_amount_per_person}
                    onChange={(e) => setFormData({ ...formData, rice_amount_per_person: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cash_amount_per_person">Uang per Orang (Rp)</Label>
                  <Input
                    id="cash_amount_per_person"
                    type="number"
                    value={formData.cash_amount_per_person}
                    onChange={(e) => setFormData({ ...formData, cash_amount_per_person: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fidyah_daily_rate">Fidyah per Hari (Rp)</Label>
                  <Input
                    id="fidyah_daily_rate"
                    type="number"
                    value={formData.fidyah_daily_rate}
                    onChange={(e) => setFormData({ ...formData, fidyah_daily_rate: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nisab_gold_price_per_gram">Harga Emas/gram (Rp)</Label>
                  <Input
                    id="nisab_gold_price_per_gram"
                    type="number"
                    value={formData.nisab_gold_price_per_gram}
                    onChange={(e) => setFormData({ ...formData, nisab_gold_price_per_gram: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="nisab_silver_price_per_gram">Harga Perak/gram (Rp)</Label>
                  <Input
                    id="nisab_silver_price_per_gram"
                    type="number"
                    value={formData.nisab_silver_price_per_gram}
                    onChange={(e) => setFormData({ ...formData, nisab_silver_price_per_gram: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingPeriod ? "Simpan" : "Tambah"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

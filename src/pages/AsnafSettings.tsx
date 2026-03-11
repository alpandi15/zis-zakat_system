import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAsnafSettings, AsnafSetting } from "@/hooks/useAsnafSettings";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Plus, Trash2, Edit, Lock, Wheat, Coins, Heart, AlertCircle, Check } from "lucide-react";

export default function AsnafSettings() {
  const { asnafSettings, isLoading, updateMutation, createMutation, deleteMutation, totalPercentage, isPercentageValid } = useAsnafSettings();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("super_admin") || hasRole("chairman");

  const [editingAsnaf, setEditingAsnaf] = useState<AsnafSetting | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [deleteAsnaf, setDeleteAsnaf] = useState<AsnafSetting | null>(null);
  const [formData, setFormData] = useState({
    asnaf_code: "",
    asnaf_name: "",
    receives_zakat_fitrah: true,
    receives_zakat_mal: true,
    receives_fidyah: false,
    distribution_percentage: 0,
    sort_order: 10,
  });

  const resetForm = () => {
    setFormData({
      asnaf_code: "",
      asnaf_name: "",
      receives_zakat_fitrah: true,
      receives_zakat_mal: true,
      receives_fidyah: false,
      distribution_percentage: 0,
      sort_order: 10,
    });
  };

  const handleEdit = (asnaf: AsnafSetting) => {
    setEditingAsnaf(asnaf);
    setFormData({
      asnaf_code: asnaf.asnaf_code,
      asnaf_name: asnaf.asnaf_name,
      receives_zakat_fitrah: asnaf.receives_zakat_fitrah,
      receives_zakat_mal: asnaf.receives_zakat_mal,
      receives_fidyah: asnaf.receives_fidyah,
      distribution_percentage: asnaf.distribution_percentage,
      sort_order: asnaf.sort_order,
    });
  };

  const handleUpdate = () => {
    if (!editingAsnaf) return;
    updateMutation.mutate({
      id: editingAsnaf.id,
      receives_zakat_fitrah: formData.receives_zakat_fitrah,
      receives_zakat_mal: formData.receives_zakat_mal,
      receives_fidyah: formData.receives_fidyah,
      distribution_percentage: formData.distribution_percentage,
      ...(editingAsnaf.is_system_default ? {} : {
        asnaf_name: formData.asnaf_name,
        sort_order: formData.sort_order,
      }),
    }, {
      onSuccess: () => setEditingAsnaf(null),
    });
  };

  const handleAdd = () => {
    const code = formData.asnaf_name.toLowerCase().replace(/\s+/g, "_");
    createMutation.mutate({
      asnaf_code: code,
      asnaf_name: formData.asnaf_name,
      receives_zakat_fitrah: formData.receives_zakat_fitrah,
      receives_zakat_mal: formData.receives_zakat_mal,
      receives_fidyah: formData.receives_fidyah,
      distribution_percentage: formData.distribution_percentage,
      is_active: true,
      sort_order: formData.sort_order,
    }, {
      onSuccess: () => {
        setIsAddDialogOpen(false);
        resetForm();
      },
    });
  };

  const handleDelete = () => {
    if (!deleteAsnaf) return;
    deleteMutation.mutate(deleteAsnaf.id, {
      onSuccess: () => setDeleteAsnaf(null),
    });
  };

  // Get Amil percentage for display
  const amilPercentage = asnafSettings.find(s => s.asnaf_code === "amil")?.distribution_percentage || 12.5;

  return (
    <AppLayout title="Pengaturan Asnaf">
      <div className="space-y-6">
        {/* Summary Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Konfigurasi Asnaf & Kelayakan
            </CardTitle>
            <CardDescription>
              Kelola kategori asnaf penerima zakat dan pengaturan kelayakan penerimaan masing-masing dana.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Badge variant="default">
                  Amil: {amilPercentage.toFixed(2)}%
                </Badge>
                <span className="text-sm text-muted-foreground">Persentase untuk Amil</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Sisa {(100 - amilPercentage).toFixed(2)}% dibagi rata ke mustahik lainnya
              </div>
            </div>
            {isAdmin && (
              <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Tambah Asnaf Baru
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Asnaf Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">#</TableHead>
                  <TableHead>Nama Asnaf</TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Wheat className="h-4 w-4" />
                      Fitrah
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Coins className="h-4 w-4" />
                      Mal
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Heart className="h-4 w-4" />
                      Fidyah
                    </div>
                  </TableHead>
                  <TableHead className="w-[100px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Memuat...
                    </TableCell>
                  </TableRow>
                ) : asnafSettings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Tidak ada data asnaf
                    </TableCell>
                  </TableRow>
                ) : (
                  asnafSettings.map((asnaf, index) => (
                    <TableRow key={asnaf.id}>
                      <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{asnaf.asnaf_name}</span>
                          {asnaf.is_system_default && (
                            <Lock className="h-3 w-3 text-muted-foreground" />
                          )}
                          {asnaf.asnaf_code === "amil" && (
                            <Badge variant="outline" className="text-xs">
                              {asnaf.distribution_percentage}%
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={asnaf.receives_zakat_fitrah ? "default" : "secondary"}>
                          {asnaf.receives_zakat_fitrah ? "Ya" : "Tidak"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={asnaf.receives_zakat_mal ? "default" : "secondary"}>
                          {asnaf.receives_zakat_mal ? "Ya" : "Tidak"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={asnaf.receives_fidyah ? "default" : "secondary"}>
                          {asnaf.receives_fidyah ? "Ya" : "Tidak"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {isAdmin && (
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(asnaf)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && !asnaf.is_system_default && (
                            <Button variant="ghost" size="icon" onClick={() => setDeleteAsnaf(asnaf)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Legend */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Wheat className="h-4 w-4 text-primary" />
                <span>Fitrah: Menerima Zakat Fitrah (beras/uang)</span>
              </div>
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-primary" />
                <span>Mal: Menerima Zakat Mal (uang)</span>
              </div>
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-primary" />
                <span>Fidyah: Menerima Fidyah (makanan/uang)</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <span>Asnaf sistem tidak dapat dihapus atau diganti nama</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingAsnaf} onOpenChange={(open) => !open && setEditingAsnaf(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Pengaturan Asnaf</DialogTitle>
            <DialogDescription>
              {editingAsnaf?.is_system_default
                ? "Asnaf sistem hanya dapat diubah pengaturan kelayakannya."
                : "Ubah nama dan pengaturan kelayakan asnaf ini."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nama Asnaf</Label>
              <Input
                value={formData.asnaf_name}
                onChange={(e) => setFormData({ ...formData, asnaf_name: e.target.value })}
                disabled={editingAsnaf?.is_system_default}
              />
            </div>
            <div className="space-y-3">
              <Label>Kelayakan Penerimaan</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="receives_zakat_fitrah"
                  checked={formData.receives_zakat_fitrah}
                  onCheckedChange={(checked) => setFormData({ ...formData, receives_zakat_fitrah: !!checked })}
                />
                <Label htmlFor="receives_zakat_fitrah" className="font-normal flex items-center gap-2">
                  <Wheat className="h-4 w-4" />
                  Menerima Zakat Fitrah
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="receives_zakat_mal"
                  checked={formData.receives_zakat_mal}
                  onCheckedChange={(checked) => setFormData({ ...formData, receives_zakat_mal: !!checked })}
                />
                <Label htmlFor="receives_zakat_mal" className="font-normal flex items-center gap-2">
                  <Coins className="h-4 w-4" />
                  Menerima Zakat Mal
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="receives_fidyah"
                  checked={formData.receives_fidyah}
                  onCheckedChange={(checked) => setFormData({ ...formData, receives_fidyah: !!checked })}
                />
                <Label htmlFor="receives_fidyah" className="font-normal flex items-center gap-2">
                  <Heart className="h-4 w-4" />
                  Menerima Fidyah
                </Label>
              </div>
            </div>
            {/* Only show percentage for Amil */}
            {editingAsnaf?.asnaf_code === "amil" && (
              <div className="space-y-2">
                <Label htmlFor="distribution_percentage">Persentase Amil (%)</Label>
                <Input
                  id="distribution_percentage"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.distribution_percentage}
                  onChange={(e) => setFormData({ ...formData, distribution_percentage: parseFloat(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">
                  Persentase dari total dana zakat yang dialokasikan untuk Amil
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditingAsnaf(null)}>
                Batal
              </Button>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                Simpan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Asnaf Baru</DialogTitle>
            <DialogDescription>
              Tambahkan kategori asnaf kustom selain 8 asnaf default.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nama Asnaf *</Label>
              <Input
                value={formData.asnaf_name}
                onChange={(e) => setFormData({ ...formData, asnaf_name: e.target.value })}
                placeholder="Contoh: Anak Yatim"
              />
            </div>
            <div className="space-y-3">
              <Label>Kelayakan Penerimaan</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="add_receives_zakat_fitrah"
                  checked={formData.receives_zakat_fitrah}
                  onCheckedChange={(checked) => setFormData({ ...formData, receives_zakat_fitrah: !!checked })}
                />
                <Label htmlFor="add_receives_zakat_fitrah" className="font-normal">
                  Menerima Zakat Fitrah
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="add_receives_zakat_mal"
                  checked={formData.receives_zakat_mal}
                  onCheckedChange={(checked) => setFormData({ ...formData, receives_zakat_mal: !!checked })}
                />
                <Label htmlFor="add_receives_zakat_mal" className="font-normal">
                  Menerima Zakat Mal
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="add_receives_fidyah"
                  checked={formData.receives_fidyah}
                  onCheckedChange={(checked) => setFormData({ ...formData, receives_fidyah: !!checked })}
                />
                <Label htmlFor="add_receives_fidyah" className="font-normal">
                  Menerima Fidyah
                </Label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Batal
              </Button>
              <Button onClick={handleAdd} disabled={createMutation.isPending || !formData.asnaf_name}>
                Tambah
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteAsnaf} onOpenChange={(open) => !open && setDeleteAsnaf(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Asnaf?</AlertDialogTitle>
            <AlertDialogDescription>
              Asnaf "{deleteAsnaf?.asnaf_name}" akan dihapus. Mustahik yang menggunakan asnaf ini perlu diperbarui.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

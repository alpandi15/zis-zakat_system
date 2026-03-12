import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ArrowLeft, ArrowRight, Check } from "lucide-react";

interface MuzakkiFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingMuzakki?: {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
  } | null;
}

interface MemberInput {
  id: string;
  name: string;
  relationship: string;
  birth_date: string;
  notes: string;
  is_dependent: boolean;
}

const RELATIONSHIP_OPTIONS = [
  { value: "head_of_family", label: "Kepala Keluarga" },
  { value: "wife", label: "Istri" },
  { value: "child", label: "Anak" },
  { value: "parent", label: "Orang Tua" },
];

export function MuzakkiFormDialog({ open, onOpenChange, editingMuzakki }: MuzakkiFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!editingMuzakki;

  // Step management (only for create flow)
  const [step, setStep] = useState(1);

  // Muzakki form data
  const [muzakkiData, setMuzakkiData] = useState({
    name: editingMuzakki?.name || "",
    address: editingMuzakki?.address || "",
    phone: editingMuzakki?.phone || "",
    email: editingMuzakki?.email || "",
    notes: editingMuzakki?.notes || "",
  });

  // Members form data (for create flow)
  const [members, setMembers] = useState<MemberInput[]>([
    {
      id: crypto.randomUUID(),
      name: "",
      relationship: "head_of_family",
      birth_date: "",
      notes: "",
      is_dependent: true,
    },
  ]);

  // Reset form when dialog opens/closes
  const resetForm = () => {
    setStep(1);
    setMuzakkiData({ name: "", address: "", phone: "", email: "", notes: "" });
    setMembers([
      {
        id: crypto.randomUUID(),
        name: "",
        relationship: "head_of_family",
        birth_date: "",
        notes: "",
        is_dependent: true,
      },
    ]);
  };

  useEffect(() => {
    if (!open) return;

    if (editingMuzakki) {
      setStep(1);
      setMuzakkiData({
        name: editingMuzakki.name,
        address: editingMuzakki.address || "",
        phone: editingMuzakki.phone || "",
        email: editingMuzakki.email || "",
        notes: editingMuzakki.notes || "",
      });
      return;
    }

    resetForm();
  }, [open, editingMuzakki]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm();
    }
    onOpenChange(open);
  };

  // Create Muzakki + Members
  const createMutation = useMutation({
    mutationFn: async () => {
      // First create the muzakki
      const { data: newMuzakki, error: muzakkiError } = await supabase
        .from("muzakki")
        .insert({
          name: muzakkiData.name,
          address: muzakkiData.address || null,
          phone: muzakkiData.phone || null,
          email: muzakkiData.email || null,
          notes: muzakkiData.notes || null,
        })
        .select()
        .single();

      if (muzakkiError) throw muzakkiError;

      // Then create all members
      const validMembers = members.filter((m) => m.name.trim());
      if (validMembers.length > 0) {
        const { error: membersError } = await supabase.from("muzakki_members").insert(
          validMembers.map((m) => ({
            muzakki_id: newMuzakki.id,
            name: m.name.trim(),
            relationship: m.relationship as "head_of_family" | "wife" | "child" | "parent",
            birth_date: m.birth_date || null,
            notes: m.notes || null,
            is_dependent: m.is_dependent,
          }))
        );
        if (membersError) throw membersError;
      }

      return newMuzakki;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["muzakki"] });
      queryClient.invalidateQueries({ queryKey: ["muzakki-members"] });
      handleOpenChange(false);
      toast({ title: "Muzakki dan anggota berhasil ditambahkan" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  // Update Muzakki only (for edit mode)
  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("muzakki")
        .update({
          name: muzakkiData.name,
          address: muzakkiData.address || null,
          phone: muzakkiData.phone || null,
          email: muzakkiData.email || null,
          notes: muzakkiData.notes || null,
        })
        .eq("id", editingMuzakki!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["muzakki"] });
      handleOpenChange(false);
      toast({ title: "Muzakki berhasil diperbarui" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const addMember = () => {
    setMembers([
      ...members,
      {
        id: crypto.randomUUID(),
        name: "",
        relationship: "child",
        birth_date: "",
        notes: "",
        is_dependent: true,
      },
    ]);
  };

  const removeMember = (id: string) => {
    if (members.length > 1) {
      setMembers(members.filter((m) => m.id !== id));
    }
  };

  const updateMember = (id: string, field: keyof MemberInput, value: string) => {
    setMembers(members.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!muzakkiData.name.trim()) {
      toast({ variant: "destructive", title: "Nama muzakki harus diisi" });
      return;
    }
    setStep(2);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isEditing) {
      updateMutation.mutate();
    } else {
      // Validate at least one member with name
      const validMembers = members.filter((m) => m.name.trim());
      if (validMembers.length === 0) {
        toast({ variant: "destructive", title: "Minimal satu anggota harus diisi" });
        return;
      }
      createMutation.mutate();
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? "Edit Informasi Muzakki"
              : step === 1
              ? "Tambah Muzakki - Langkah 1: Data Muzakki"
              : "Tambah Muzakki - Langkah 2: Anggota Keluarga"}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Muzakki Data (or Edit mode) */}
        {(step === 1 || isEditing) && (
          <form onSubmit={isEditing ? handleSubmit : handleNextStep} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nama Lengkap *</Label>
              <Input
                id="name"
                value={muzakkiData.name}
                onChange={(e) => setMuzakkiData({ ...muzakkiData, name: e.target.value })}
                placeholder="Nama muzakki"
                required
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">No. Telepon</Label>
                <Input
                  id="phone"
                  value={muzakkiData.phone}
                  onChange={(e) => setMuzakkiData({ ...muzakkiData, phone: e.target.value })}
                  placeholder="08xxxxxxxxxx"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={muzakkiData.email}
                  onChange={(e) => setMuzakkiData({ ...muzakkiData, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Alamat</Label>
              <Textarea
                id="address"
                value={muzakkiData.address}
                onChange={(e) => setMuzakkiData({ ...muzakkiData, address: e.target.value })}
                placeholder="Alamat lengkap"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Catatan</Label>
              <Textarea
                id="notes"
                value={muzakkiData.notes}
                onChange={(e) => setMuzakkiData({ ...muzakkiData, notes: e.target.value })}
                placeholder="Catatan tambahan"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={isPending} className="gap-2">
                {isEditing ? (
                  "Simpan"
                ) : (
                  <>
                    Lanjutkan
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        {/* Step 2: Members (only for create flow) */}
        {step === 2 && !isEditing && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tambahkan anggota keluarga yang akan membayar zakat. Minimal satu anggota wajib diisi.
            </p>

            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
              {members.map((member, index) => (
                <div key={member.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">Anggota {index + 1}</span>
                    {members.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMember(member.id)}
                        className="h-8 w-8 text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Nama *</Label>
                      <Input
                        value={member.name}
                        onChange={(e) => updateMember(member.id, "name", e.target.value)}
                        placeholder="Nama anggota"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Hubungan *</Label>
                      <Select
                        value={member.relationship}
                        onValueChange={(value) => updateMember(member.id, "relationship", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RELATIONSHIP_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Tanggal Lahir</Label>
                      <Input
                        type="date"
                        value={member.birth_date}
                        onChange={(e) => updateMember(member.id, "birth_date", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Catatan</Label>
                      <Input
                        value={member.notes}
                        onChange={(e) => updateMember(member.id, "notes", e.target.value)}
                        placeholder="Catatan (opsional)"
                      />
                    </div>
                    <div className="col-span-2 flex items-center justify-between rounded-md border p-2">
                      <div>
                        <Label className="text-xs">Termasuk Tanggungan Zakat</Label>
                        <p className="text-xs text-muted-foreground">
                          Anggota ini akan muncul pada transaksi Zakat Fitrah.
                        </p>
                      </div>
                      <Switch
                        checked={member.is_dependent}
                        onCheckedChange={(checked) =>
                          setMembers((prev) =>
                            prev.map((m) =>
                              m.id === member.id ? { ...m, is_dependent: checked } : m
                            )
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button type="button" variant="outline" onClick={addMember} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Tambah Anggota Lain
            </Button>

            <div className="flex justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(1)} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Kembali
              </Button>
              <Button type="submit" disabled={isPending} className="gap-2">
                <Check className="h-4 w-4" />
                Simpan Semua
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

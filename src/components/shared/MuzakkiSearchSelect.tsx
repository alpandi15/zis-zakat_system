import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MuzakkiSearchSelectProps {
  value: string;
  onChange: (
    value: string,
    meta?: {
      source?: "existing" | "created";
      recommendedFitrahCount?: number;
      createdMemberIds?: string[];
    },
  ) => void;
  disabled?: boolean;
  placeholder?: string;
}

interface Muzakki {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
}

interface MemberInput {
  id: string;
  name: string;
  relationship: string;
  is_dependent: boolean;
}

const RELATIONSHIP_OPTIONS = [
  { value: "head_of_family", label: "Kepala Keluarga" },
  { value: "wife", label: "Istri" },
  { value: "child", label: "Anak" },
  { value: "parent", label: "Orang Tua" },
];

export function MuzakkiSearchSelect({
  value,
  onChange,
  disabled,
  placeholder = "Cari atau tambah muzakki...",
}: MuzakkiSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [step, setStep] = useState(1);
  
  // Form state
  const [muzakkiData, setMuzakkiData] = useState({
    name: "",
    phone: "",
    address: "",
    notes: "",
  });
  const [members, setMembers] = useState<MemberInput[]>([
    { id: crypto.randomUUID(), name: "", relationship: "head_of_family", is_dependent: true },
  ]);
  const [useMemberInput, setUseMemberInput] = useState(false);
  const [manualFitrahCount, setManualFitrahCount] = useState(1);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: muzakkiList = [] } = useQuery({
    queryKey: ["muzakki-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("muzakki")
        .select("id, name, phone, address")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Muzakki[];
    },
  });

  const filteredMuzakki = useMemo(() => {
    if (!search) return muzakkiList;
    const searchLower = search.toLowerCase();
    return muzakkiList.filter(
      m => m.name.toLowerCase().includes(searchLower) ||
           m.phone?.toLowerCase().includes(searchLower)
    );
  }, [muzakkiList, search]);

  const selectedMuzakki = muzakkiList.find(m => m.id === value);

  const createMutation = useMutation({
    mutationFn: async () => {
      // Create muzakki
      const { data: newMuzakki, error: muzakkiError } = await supabase
        .from("muzakki")
        .insert({
          name: muzakkiData.name,
          phone: muzakkiData.phone || null,
          address: muzakkiData.address || null,
          notes: muzakkiData.notes || null,
        })
        .select()
        .single();

      if (muzakkiError) throw muzakkiError;

      let recommendedFitrahCount = 1;
      let createdMemberIds: string[] = [];

      // Option 1: without member details, create default head-of-family member
      if (!useMemberInput) {
        if (!Number.isFinite(manualFitrahCount) || manualFitrahCount < 1) {
          throw new Error("Jumlah fitrah minimal 1 orang");
        }

        const { data: headMember, error: headMemberError } = await supabase
          .from("muzakki_members")
          .insert({
            muzakki_id: newMuzakki.id,
            name: muzakkiData.name.trim(),
            relationship: "head_of_family",
            is_dependent: true,
          })
          .select("id")
          .single();
        if (headMemberError) throw headMemberError;

        recommendedFitrahCount = Math.max(1, Math.floor(manualFitrahCount));
        createdMemberIds = headMember?.id ? [headMember.id] : [];
      } else {
        // Option 2: keep existing detailed member flow
        const validMembers = members.filter((m) => m.name.trim());
        if (validMembers.length === 0) {
          throw new Error("Minimal satu anggota harus diisi");
        }

        const { data: insertedMembers, error: membersError } = await supabase
          .from("muzakki_members")
          .insert(
            validMembers.map((m) => ({
              muzakki_id: newMuzakki.id,
              name: m.name.trim(),
              relationship: m.relationship as "head_of_family" | "wife" | "child" | "parent",
              is_dependent: m.is_dependent,
            })),
          )
          .select("id, is_dependent");
        if (membersError) throw membersError;

        const dependentCount =
          insertedMembers?.filter((member) => member.is_dependent).length || 0;
        recommendedFitrahCount = dependentCount > 0 ? dependentCount : validMembers.length;
        createdMemberIds = (insertedMembers || []).map((member) => member.id);
      }

      return {
        muzakki: newMuzakki,
        recommendedFitrahCount,
        createdMemberIds,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["muzakki-active"] });
      queryClient.invalidateQueries({ queryKey: ["muzakki"] });
      queryClient.invalidateQueries({ queryKey: ["muzakki-members"] });
      onChange(result.muzakki.id, {
        source: "created",
        recommendedFitrahCount: result.recommendedFitrahCount,
        createdMemberIds: result.createdMemberIds,
      });
      resetForm();
      setIsCreateOpen(false);
      toast({ title: "Muzakki berhasil ditambahkan" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const resetForm = () => {
    setStep(1);
    setMuzakkiData({ name: "", phone: "", address: "", notes: "" });
    setMembers([{ id: crypto.randomUUID(), name: "", relationship: "head_of_family", is_dependent: true }]);
    setUseMemberInput(false);
    setManualFitrahCount(1);
  };

  const handleOpenCreate = () => {
    setSearch("");
    setMuzakkiData((prev) => ({ ...prev, name: search }));
    setOpen(false);
    setIsCreateOpen(true);
  };

  const addMember = () => {
    setMembers([...members, { id: crypto.randomUUID(), name: "", relationship: "child", is_dependent: true }]);
  };

  const removeMember = (id: string) => {
    if (members.length > 1) {
      setMembers(members.filter(m => m.id !== id));
    }
  };

  const updateMember = (id: string, field: keyof MemberInput, value: string) => {
    setMembers(members.map(m => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const handleNextStep = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!muzakkiData.name.trim()) {
      toast({ variant: "destructive", title: "Nama muzakki harus diisi" });
      return;
    }
    setStep(2);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!useMemberInput) {
      if (!Number.isFinite(manualFitrahCount) || manualFitrahCount < 1) {
        toast({ variant: "destructive", title: "Jumlah fitrah minimal 1 orang" });
        return;
      }
      createMutation.mutate();
      return;
    }

    const validMembers = members.filter((m) => m.name.trim());
    if (validMembers.length === 0) {
      toast({ variant: "destructive", title: "Minimal satu anggota harus diisi" });
      return;
    }
    createMutation.mutate();
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            type="button"
            className="h-9 w-full justify-between truncate font-normal text-left text-[13px] sm:h-10 sm:text-sm"
          >
            {selectedMuzakki ? selectedMuzakki.name : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          portalled={false}
          align="start"
          sideOffset={6}
          className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1rem)] max-h-[min(70dvh,26rem)] overflow-hidden p-0"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Cari nama atau telepon..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList className="max-h-[min(40dvh,14rem)] sm:max-h-[18rem]">
              <CommandEmpty>
                <div className="py-2 text-center">
                  <p className="text-sm text-muted-foreground mb-2">Tidak ditemukan</p>
                  <Button type="button" size="sm" onClick={handleOpenCreate} className="gap-1">
                    <Plus className="h-4 w-4" />
                    Tambah "{search || 'Muzakki Baru'}"
                  </Button>
                </div>
              </CommandEmpty>
              <CommandGroup>
                {filteredMuzakki.map(m => (
                  <CommandItem
                    key={m.id}
                    value={m.id}
                    onSelect={() => {
                      onChange(m.id, { source: "existing" });
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === m.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex-1">
                      <p className="font-medium">{m.name}</p>
                      {m.phone && <p className="text-xs text-muted-foreground">{m.phone}</p>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem onSelect={handleOpenCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Muzakki Baru
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Inline Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => {
        if (!open) resetForm();
        setIsCreateOpen(open);
      }}>
        <DialogContent className="max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:max-h-[90dvh] w-[calc(100vw-0.9rem)] max-w-lg overflow-y-auto p-3 sm:p-5">
          <DialogHeader>
            <DialogTitle>
              {step === 1 ? "Tambah Muzakki Baru" : "Tambah Anggota Keluarga"}
            </DialogTitle>
          </DialogHeader>

          {step === 1 && (
            <form onSubmit={handleNextStep} className="space-y-3 sm:space-y-4">
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
                <Label htmlFor="address">Alamat</Label>
                <Textarea
                  id="address"
                  value={muzakkiData.address}
                  onChange={(e) => setMuzakkiData({ ...muzakkiData, address: e.target.value })}
                  placeholder="Alamat lengkap"
                  rows={2}
                />
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} className="w-full sm:w-auto">
                  Batal
                </Button>
                <Button type="submit" className="w-full sm:w-auto">Lanjutkan</Button>
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                <div>
                  <Label className="text-xs sm:text-sm">Input Anggota Keluarga</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Nonaktif: cukup isi jumlah fitrah (orang), tanpa detail anggota.
                  </p>
                </div>
                <Switch checked={useMemberInput} onCheckedChange={setUseMemberInput} />
              </div>

              {!useMemberInput ? (
                <div className="space-y-2 rounded-xl border p-3">
                  <Label htmlFor="manualFitrahCount">Jumlah Fitrah (Orang) *</Label>
                  <Input
                    id="manualFitrahCount"
                    type="number"
                    min={1}
                    value={manualFitrahCount}
                    onChange={(e) => setManualFitrahCount(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Sistem tetap membuat 1 data anggota default (Kepala Keluarga) di `muzakki_members`.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    Tambahkan minimal satu anggota keluarga.
                  </p>
                  <div className="space-y-2.5 max-h-[48dvh] overflow-y-auto pr-1 sm:max-h-[300px]">
                    {members.map((member, index) => (
                      <div key={member.id} className="space-y-2 rounded-xl border p-2.5 sm:p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium sm:text-sm">Anggota {index + 1}</span>
                          {members.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive sm:h-8 sm:w-8"
                              onClick={() => removeMember(member.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <Input
                            value={member.name}
                            onChange={(e) => updateMember(member.id, "name", e.target.value)}
                            placeholder="Nama"
                          />
                          <Select
                            value={member.relationship}
                            onValueChange={(v) => updateMember(member.id, "relationship", v)}
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
                        <div className="flex items-center justify-between rounded-lg border px-2.5 py-2">
                          <Label className="text-[11px] sm:text-xs">Termasuk Tanggungan</Label>
                          <Switch
                            checked={member.is_dependent}
                            onCheckedChange={(checked) =>
                              setMembers((prev) =>
                                prev.map((m) => (m.id === member.id ? { ...m, is_dependent: checked } : m)),
                              )
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addMember}
                    className="h-9 w-full gap-1 text-xs sm:h-10 sm:text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    Tambah Anggota
                  </Button>
                </>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="w-full sm:w-auto">
                  Kembali
                </Button>
                <Button type="submit" disabled={createMutation.isPending} className="w-full sm:w-auto">
                  {createMutation.isPending ? "Menyimpan..." : "Simpan & Pilih"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MuzakkiSearchSelectProps {
  value: string;
  onChange: (value: string) => void;
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
    { id: crypto.randomUUID(), name: "", relationship: "head_of_family" },
  ]);

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

      // Create members
      const validMembers = members.filter(m => m.name.trim());
      if (validMembers.length > 0) {
        const { error: membersError } = await supabase
          .from("muzakki_members")
          .insert(
            validMembers.map(m => ({
              muzakki_id: newMuzakki.id,
              name: m.name.trim(),
              relationship: m.relationship as "head_of_family" | "wife" | "child" | "parent",
            }))
          );
        if (membersError) throw membersError;
      }

      return newMuzakki;
    },
    onSuccess: (newMuzakki) => {
      queryClient.invalidateQueries({ queryKey: ["muzakki-active"] });
      queryClient.invalidateQueries({ queryKey: ["muzakki"] });
      queryClient.invalidateQueries({ queryKey: ["muzakki-members"] });
      onChange(newMuzakki.id);
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
    setMembers([{ id: crypto.randomUUID(), name: "", relationship: "head_of_family" }]);
  };

  const handleOpenCreate = () => {
    setSearch("");
    setMuzakkiData({ ...muzakkiData, name: search });
    setOpen(false);
    setIsCreateOpen(true);
  };

  const addMember = () => {
    setMembers([...members, { id: crypto.randomUUID(), name: "", relationship: "child" }]);
  };

  const removeMember = (id: string) => {
    if (members.length > 1) {
      setMembers(members.filter(m => m.id !== id));
    }
  };

  const updateMember = (id: string, field: keyof MemberInput, value: string) => {
    setMembers(members.map(m => (m.id === id ? { ...m, [field]: value } : m)));
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
    const validMembers = members.filter(m => m.name.trim());
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
            className="w-full justify-between font-normal"
          >
            {selectedMuzakki ? selectedMuzakki.name : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Cari nama atau telepon..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                <div className="py-2 text-center">
                  <p className="text-sm text-muted-foreground mb-2">Tidak ditemukan</p>
                  <Button size="sm" onClick={handleOpenCreate} className="gap-1">
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
                      onChange(m.id);
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
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {step === 1 ? "Tambah Muzakki Baru" : "Tambah Anggota Keluarga"}
            </DialogTitle>
          </DialogHeader>

          {step === 1 && (
            <form onSubmit={handleNextStep} className="space-y-4">
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
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Batal
                </Button>
                <Button type="submit">Lanjutkan</Button>
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Tambahkan minimal satu anggota keluarga.
              </p>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {members.map((member, index) => (
                  <div key={member.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Anggota {index + 1}</span>
                      {members.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeMember(member.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-2 grid-cols-2">
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
                          {RELATIONSHIP_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" onClick={addMember} className="w-full gap-1">
                <Plus className="h-4 w-4" />
                Tambah Anggota
              </Button>
              <div className="flex justify-between gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Kembali
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
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

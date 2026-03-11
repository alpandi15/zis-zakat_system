import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MuzakkiMemberOption {
  id: string;
  name: string;
  relationship: "head_of_family" | "wife" | "child" | "parent";
  muzakki_id: string;
  muzakki?: {
    name: string;
    phone: string | null;
    address: string | null;
  } | null;
}

interface MuzakkiMemberSearchSelectProps {
  value: string;
  onChange: (value: string, selected: MuzakkiMemberOption | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function MuzakkiMemberSearchSelect({
  value,
  onChange,
  disabled,
  placeholder = "Cari anggota pembayar...",
}: MuzakkiMemberSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createData, setCreateData] = useState({
    muzakkiName: "",
    muzakkiPhone: "",
    muzakkiAddress: "",
    muzakkiNotes: "",
    memberName: "",
    memberRelationship: "head_of_family" as "head_of_family" | "wife" | "child" | "parent",
    memberIsDependent: true,
    memberNotes: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: memberOptions = [] } = useQuery({
    queryKey: ["muzakki-members-search-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("muzakki_members")
        .select("id, name, relationship, muzakki_id, muzakki:muzakki_id(name, phone, address)")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as MuzakkiMemberOption[];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return memberOptions;
    const q = search.toLowerCase();
    return memberOptions.filter((m) => {
      const memberName = m.name.toLowerCase();
      const household = m.muzakki?.name?.toLowerCase() ?? "";
      const phone = m.muzakki?.phone?.toLowerCase() ?? "";
      return memberName.includes(q) || household.includes(q) || phone.includes(q);
    });
  }, [memberOptions, search]);

  const selected = memberOptions.find((m) => m.id === value) ?? null;

  const resetCreateForm = () => {
    setCreateData({
      muzakkiName: "",
      muzakkiPhone: "",
      muzakkiAddress: "",
      muzakkiNotes: "",
      memberName: "",
      memberRelationship: "head_of_family",
      memberIsDependent: true,
      memberNotes: "",
    });
  };

  const handleOpenCreate = () => {
    const baseName = search.trim();
    setCreateData((prev) => ({
      ...prev,
      muzakkiName: baseName || prev.muzakkiName,
      memberName: baseName || prev.memberName,
    }));
    setOpen(false);
    setIsCreateOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!createData.muzakkiName.trim()) throw new Error("Nama muzakki harus diisi");
      if (!createData.memberName.trim()) throw new Error("Nama anggota pembayar harus diisi");

      const { data: newMuzakki, error: muzakkiError } = await supabase
        .from("muzakki")
        .insert({
          name: createData.muzakkiName.trim(),
          phone: createData.muzakkiPhone || null,
          address: createData.muzakkiAddress || null,
          notes: createData.muzakkiNotes || null,
        })
        .select("id, name, phone, address")
        .single();

      if (muzakkiError) throw muzakkiError;

      const { data: newMember, error: memberError } = await supabase
        .from("muzakki_members")
        .insert({
          muzakki_id: newMuzakki.id,
          name: createData.memberName.trim(),
          relationship: createData.memberRelationship,
          is_dependent: createData.memberIsDependent,
          notes: createData.memberNotes || null,
        })
        .select("id, name, relationship, muzakki_id")
        .single();

      if (memberError) throw memberError;

      return {
        id: newMember.id,
        name: newMember.name,
        relationship: newMember.relationship as "head_of_family" | "wife" | "child" | "parent",
        muzakki_id: newMember.muzakki_id,
        muzakki: {
          name: newMuzakki.name,
          phone: newMuzakki.phone,
          address: newMuzakki.address,
        },
      } as MuzakkiMemberOption;
    },
    onSuccess: (newOption) => {
      queryClient.invalidateQueries({ queryKey: ["muzakki-members-search-select"] });
      queryClient.invalidateQueries({ queryKey: ["muzakki-members"] });
      queryClient.invalidateQueries({ queryKey: ["muzakki"] });
      onChange(newOption.id, newOption);
      setIsCreateOpen(false);
      resetCreateForm();
      setSearch("");
      toast({ title: "Muzakki dan anggota pembayar berhasil ditambahkan" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    createMutation.mutate();
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-9 w-full justify-between truncate font-normal text-left text-[13px] sm:h-10 sm:text-sm"
          >
            {selected ? selected.name : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(420px,calc(100vw-1rem))] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Cari nama anggota / muzakki / telepon..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                <div className="py-2 text-center">
                  <p className="mb-2 text-sm text-muted-foreground">Anggota tidak ditemukan</p>
                  <Button type="button" size="sm" className="gap-1" onClick={handleOpenCreate}>
                    <Plus className="h-4 w-4" />
                    Tambah Muzakki Baru
                  </Button>
                </div>
              </CommandEmpty>
              <CommandGroup>
                {filtered.map((member) => (
                  <CommandItem
                    key={member.id}
                    value={member.id}
                    onSelect={() => {
                      onChange(member.id, member);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", member.id === value ? "opacity-100" : "opacity-0")} />
                    <div className="flex-1">
                      <p className="font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {member.muzakki?.name || "-"} {member.muzakki?.phone ? `• ${member.muzakki.phone}` : ""}
                      </p>
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

      <Dialog
        open={isCreateOpen}
        onOpenChange={(openState) => {
          if (!openState) resetCreateForm();
          setIsCreateOpen(openState);
        }}
      >
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-0.9rem)] max-w-xl overflow-y-auto p-3 sm:p-5">
          <DialogHeader>
            <DialogTitle>Tambah Muzakki Baru (Pembayar Fidyah)</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-3 sm:space-y-4">
            <div className="space-y-2.5 rounded-xl border p-3 sm:space-y-3 sm:p-4">
              <h4 className="text-sm font-medium">Data Muzakki</h4>
              <div className="space-y-2">
                <Label htmlFor="new_muzakki_name">Nama Muzakki *</Label>
                <Input
                  id="new_muzakki_name"
                  value={createData.muzakkiName}
                  onChange={(e) => setCreateData((prev) => ({ ...prev, muzakkiName: e.target.value }))}
                  placeholder="Nama kepala keluarga"
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new_muzakki_phone">No. Telepon</Label>
                  <Input
                    id="new_muzakki_phone"
                    value={createData.muzakkiPhone}
                    onChange={(e) => setCreateData((prev) => ({ ...prev, muzakkiPhone: e.target.value }))}
                    placeholder="08xxxxxxxxxx"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_member_relationship">Hubungan Anggota *</Label>
                  <Select
                    value={createData.memberRelationship}
                    onValueChange={(value) =>
                      setCreateData((prev) => ({
                        ...prev,
                        memberRelationship: value as "head_of_family" | "wife" | "child" | "parent",
                      }))
                    }
                  >
                    <SelectTrigger id="new_member_relationship">
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
              </div>
              <div className="space-y-2">
                <Label htmlFor="new_muzakki_address">Alamat</Label>
                <Textarea
                  id="new_muzakki_address"
                  value={createData.muzakkiAddress}
                  onChange={(e) => setCreateData((prev) => ({ ...prev, muzakkiAddress: e.target.value }))}
                  placeholder="Alamat lengkap"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new_muzakki_notes">Catatan Muzakki</Label>
                <Textarea
                  id="new_muzakki_notes"
                  value={createData.muzakkiNotes}
                  onChange={(e) => setCreateData((prev) => ({ ...prev, muzakkiNotes: e.target.value }))}
                  placeholder="Catatan tambahan"
                />
              </div>
            </div>

            <div className="space-y-2.5 rounded-xl border p-3 sm:space-y-3 sm:p-4">
              <h4 className="text-sm font-medium">Data Anggota Pembayar</h4>
              <div className="space-y-2">
                <Label htmlFor="new_member_name">Nama Anggota Pembayar *</Label>
                <Input
                  id="new_member_name"
                  value={createData.memberName}
                  onChange={(e) => setCreateData((prev) => ({ ...prev, memberName: e.target.value }))}
                  placeholder="Nama anggota pembayar"
                  required
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                <div>
                  <Label htmlFor="new_member_is_dependent">Termasuk Tanggungan</Label>
                  <p className="text-xs text-muted-foreground">Berguna untuk transaksi zakat fitrah.</p>
                </div>
                <Switch
                  id="new_member_is_dependent"
                  checked={createData.memberIsDependent}
                  onCheckedChange={(checked) => setCreateData((prev) => ({ ...prev, memberIsDependent: checked }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new_member_notes">Catatan Anggota</Label>
                <Textarea
                  id="new_member_notes"
                  value={createData.memberNotes}
                  onChange={(e) => setCreateData((prev) => ({ ...prev, memberNotes: e.target.value }))}
                  placeholder="Catatan tambahan anggota"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} className="w-full sm:w-auto">
                Batal
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="w-full sm:w-auto">
                {createMutation.isPending ? "Menyimpan..." : "Simpan & Pilih"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

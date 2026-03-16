import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { ReadOnlyBanner } from "@/components/shared/ReadOnlyBanner";
import { AsnafEligibilityBadges } from "@/components/shared/AsnafEligibilityBadges";
import { TagMultiSelect } from "@/components/shared/TagMultiSelect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePeriod } from "@/contexts/PeriodContext";
import { useAsnafSettings } from "@/hooks/useAsnafSettings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  AlertCircle,
  Edit,
  Eye,
  MapPin,
  Phone,
  Search,
  StickyNote,
  Trash2,
  Users,
  Users2,
  Wallet,
} from "lucide-react";
import { dedupeTags, isMissingColumnError, matchesAllTags } from "@/lib/tagUtils";

interface Mustahik {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  asnaf_id: string;
  asnaf_settings: { asnaf_code: string; asnaf_name: string } | null;
  priority: string;
  family_members: number | null;
  monthly_income: number | null;
  monthly_expense: number | null;
  notes: string | null;
  tags: string[];
  is_active: boolean;
}

const PRIORITY_LABELS: Record<string, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  urgent: "Mendesak",
};

const PRIORITY_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "secondary",
  medium: "outline",
  high: "default",
  urgent: "destructive",
};

export default function MustahikPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [detailMustahik, setDetailMustahik] = useState<Mustahik | null>(null);
  const [editingMustahik, setEditingMustahik] = useState<Mustahik | null>(null);
  const [deletingMustahik, setDeletingMustahik] = useState<Mustahik | null>(null);
  const [asnafFilter, setAsnafFilter] = useState<"all" | "amil" | "non_amil">("all");
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isTagsColumnAvailable, setIsTagsColumnAvailable] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    asnaf_id: "",
    priority: "medium",
    family_members: 1,
    monthly_income: "",
    monthly_expense: "",
    notes: "",
    tags: [] as string[],
  });

  const { toast } = useToast();
  const { isReadOnly, selectedPeriod } = usePeriod();
  const { getAsnafOptions, getLabel } = useAsnafSettings();
  const queryClient = useQueryClient();
  const asnafOptions = getAsnafOptions();
  const mustahikSelectBase = "id, name, address, phone, asnaf_id, priority, family_members, monthly_income, monthly_expense, notes, is_active, asnaf_settings(asnaf_code, asnaf_name)";

  const { data: mustahikList = [], isLoading } = useQuery({
    queryKey: ["mustahik"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mustahik")
        .select(`${mustahikSelectBase}, tags`)
        .is("deleted_at", null) // Filter out soft-deleted records
        .order("priority", { ascending: false })
        .order("name");

      if (error && isMissingColumnError(error, "mustahik", "tags")) {
        setIsTagsColumnAvailable(false);

        const { data: fallbackData, error: fallbackError } = await supabase
          .from("mustahik")
          .select(mustahikSelectBase)
          .is("deleted_at", null)
          .order("priority", { ascending: false })
          .order("name");

        if (fallbackError) throw fallbackError;

        return (fallbackData || []).map((item) => ({
          ...item,
          tags: [],
        })) as Mustahik[];
      }

      if (error) throw error;
      setIsTagsColumnAvailable(true);
      return data as Mustahik[];
    },
  });

  // Check if mustahik can be deleted (not in finalized distributions)
  const checkCanDelete = async (mustahikId: string): Promise<boolean> => {
    // Check zakat distributions
    const { data: zakatDist } = await supabase
      .from("zakat_distributions")
      .select("id")
      .eq("mustahik_id", mustahikId)
      .in("status", ["approved", "distributed"])
      .limit(1);
    
    if (zakatDist && zakatDist.length > 0) return false;

    // Check fidyah distributions
    const { data: fidyahDist } = await supabase
      .from("fidyah_distributions")
      .select("id")
      .eq("mustahik_id", mustahikId)
      .in("status", ["approved", "distributed"])
      .limit(1);

    if (fidyahDist && fidyahDist.length > 0) return false;

    return true;
  };

  type AsnafType = "fakir" | "miskin" | "amil" | "muallaf" | "riqab" | "gharimin" | "fisabilillah" | "ibnu_sabil";
  type PriorityType = "low" | "medium" | "high" | "urgent";

  // Helper to get asnaf_code from asnaf_id for legacy enum column
  const getAsnafCodeById = (asnafId: string): AsnafType => {
    const asnaf = asnafOptions.find(o => o.id === asnafId);
    const code = asnaf?.value || "miskin";
    // Map to valid enum values (for legacy support)
    const validEnums: AsnafType[] = ["fakir", "miskin", "amil", "muallaf", "riqab", "gharimin", "fisabilillah", "ibnu_sabil"];
    return validEnums.includes(code as AsnafType) ? (code as AsnafType) : "miskin";
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload = {
        name: data.name,
        address: data.address || null,
        phone: data.phone || null,
        asnaf_id: data.asnaf_id,
        asnaf: getAsnafCodeById(data.asnaf_id), // Legacy enum column
        priority: data.priority as PriorityType,
        family_members: data.family_members,
        monthly_income: data.monthly_income ? parseFloat(data.monthly_income) : null,
        monthly_expense: data.monthly_expense ? parseFloat(data.monthly_expense) : null,
        notes: data.notes || null,
      };

      const { error } = await supabase.from("mustahik").insert({
        ...payload,
        tags: dedupeTags(data.tags),
      });

      if (error && isMissingColumnError(error, "mustahik", "tags")) {
        setIsTagsColumnAvailable(false);

        const { error: fallbackError } = await supabase.from("mustahik").insert(payload);
        if (fallbackError) throw fallbackError;

        return { tagsSkipped: true };
      }

      if (error) throw error;
      setIsTagsColumnAvailable(true);
      return { tagsSkipped: false };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["mustahik"] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "Mustahik berhasil ditambahkan",
        description: result?.tagsSkipped
          ? "Data utama tersimpan, tetapi tags belum aktif di database. Jalankan migration Supabase agar tags ikut tersimpan."
          : undefined,
      });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string } & typeof formData) => {
      const payload = {
        name: data.name,
        address: data.address || null,
        phone: data.phone || null,
        asnaf_id: data.asnaf_id,
        asnaf: getAsnafCodeById(data.asnaf_id), // Legacy enum column
        priority: data.priority as PriorityType,
        family_members: data.family_members,
        monthly_income: data.monthly_income ? parseFloat(data.monthly_income) : null,
        monthly_expense: data.monthly_expense ? parseFloat(data.monthly_expense) : null,
        notes: data.notes || null,
      };

      const { error } = await supabase
        .from("mustahik")
        .update({
          ...payload,
          tags: dedupeTags(data.tags),
        })
        .eq("id", data.id);

      if (error && isMissingColumnError(error, "mustahik", "tags")) {
        setIsTagsColumnAvailable(false);

        const { error: fallbackError } = await supabase
          .from("mustahik")
          .update(payload)
          .eq("id", data.id);

        if (fallbackError) throw fallbackError;
        return { tagsSkipped: true };
      }

      if (error) throw error;
      setIsTagsColumnAvailable(true);
      return { tagsSkipped: false };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["mustahik"] });
      setIsDialogOpen(false);
      setEditingMustahik(null);
      resetForm();
      toast({
        title: "Mustahik berhasil diperbarui",
        description: result?.tagsSkipped
          ? "Perubahan tersimpan, tetapi kolom tags belum tersedia di database."
          : undefined,
      });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  // Soft delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // First check if can be deleted
      const canDelete = await checkCanDelete(id);
      if (!canDelete) {
        throw new Error("Mustahik tidak dapat dihapus karena sudah memiliki riwayat distribusi");
      }

      // Perform soft delete
      const { error } = await supabase
        .from("mustahik")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mustahik"] });
      setDeletingMustahik(null);
      toast({ title: "Mustahik berhasil dihapus" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const resetForm = () => {
    // Set default asnaf_id to first available option
    const defaultAsnaf = asnafOptions.find(o => o.value === "miskin") || asnafOptions[0];
    setFormData({
      name: "",
      address: "",
      phone: "",
      asnaf_id: defaultAsnaf?.id || "",
      priority: "medium",
      family_members: 1,
      monthly_income: "",
      monthly_expense: "",
      notes: "",
      tags: [],
    });
  };

  const handleEdit = (mustahik: Mustahik) => {
    setEditingMustahik(mustahik);
    setFormData({
      name: mustahik.name,
      address: mustahik.address || "",
      phone: mustahik.phone || "",
      asnaf_id: mustahik.asnaf_id,
      priority: mustahik.priority,
      family_members: mustahik.family_members || 1,
      monthly_income: mustahik.monthly_income?.toString() || "",
      monthly_expense: mustahik.monthly_expense?.toString() || "",
      notes: mustahik.notes || "",
      tags: mustahik.tags || [],
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingMustahik) {
      updateMutation.mutate({ id: editingMustahik.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const formatCurrency = (value: number | null) =>
    typeof value === "number"
      ? new Intl.NumberFormat("id-ID", {
          style: "currency",
          currency: "IDR",
          maximumFractionDigits: 0,
        }).format(value)
      : "-";

  const columns: Column<Mustahik>[] = [
    { key: "name", header: "Nama" },
    {
      key: "asnaf_id",
      header: "Asnaf",
      render: (m) => {
        const asnafCode = m.asnaf_settings?.asnaf_code || "";
        return (
          <div className="flex max-w-[220px] flex-col gap-1.5">
            <Badge
              variant="outline"
              className="w-fit rounded-full border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700"
            >
              {m.asnaf_settings?.asnaf_name || "-"}
            </Badge>
            <div className="w-fit">
              <AsnafEligibilityBadges asnafCode={asnafCode} size="sm" />
            </div>
          </div>
        );
      },
    },
    {
      key: "priority",
      header: "Prioritas",
      render: (m) => (
        <Badge variant={PRIORITY_COLORS[m.priority]}>
          {PRIORITY_LABELS[m.priority] || m.priority}
        </Badge>
      ),
    },
    { key: "family_members", header: "Jml Anggota" },
    {
      key: "tags",
      header: "Tags",
      render: (m) =>
        m.tags?.length ? (
          <div className="flex max-w-[260px] flex-wrap gap-1.5">
            {m.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="rounded-full px-2.5 py-0.5 text-[11px]">
                {tag}
              </Badge>
            ))}
            {m.tags.length > 3 && (
              <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px]">
                +{m.tags.length - 3}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    { key: "phone", header: "Telepon" },
  ];

  const amilCount = useMemo(
    () => mustahikList.filter((item) => item.asnaf_settings?.asnaf_code === "amil").length,
    [mustahikList],
  );
  const nonAmilCount = useMemo(
    () => mustahikList.filter((item) => item.asnaf_settings?.asnaf_code !== "amil").length,
    [mustahikList],
  );
  const availableTags = useMemo(
    () => dedupeTags(mustahikList.flatMap((item) => item.tags || [])),
    [mustahikList],
  );
  const filteredMustahikList = useMemo(() => {
    return mustahikList.filter((item) => {
      const passesAsnaf =
        asnafFilter === "amil"
          ? item.asnaf_settings?.asnaf_code === "amil"
          : asnafFilter === "non_amil"
            ? item.asnaf_settings?.asnaf_code !== "amil"
            : true;

      const searchValue = searchQuery.trim().toLowerCase();
      const haystack = [
        item.name,
        item.phone || "",
        item.address || "",
        item.asnaf_settings?.asnaf_name || "",
        ...(item.tags || []),
      ]
        .join(" ")
        .toLowerCase();

      const passesSearch = !searchValue || haystack.includes(searchValue);

      return passesAsnaf && matchesAllTags(item.tags, selectedTagFilters) && passesSearch;
    });
  }, [mustahikList, asnafFilter, selectedTagFilters, searchQuery]);

  return (
    <AppLayout title="Data Mustahik">
      {isReadOnly && <ReadOnlyBanner periodName={selectedPeriod?.name} />}
      {!isTagsColumnAvailable && (
        <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-950 [&>svg]:text-amber-700">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Kolom tags belum aktif di database</AlertTitle>
          <AlertDescription>
            Fitur tags di UI sudah siap, tetapi Supabase kamu belum memuat migration terbaru. Jalankan
            {" "}
            <code>supabase db push</code>
            {" "}
            atau eksekusi SQL di
            {" "}
            <code>supabase/migrations/20260316093000_add_mustahik_tags.sql</code>.
          </AlertDescription>
        </Alert>
      )}

      <DataTable
        title="Daftar Mustahik"
        data={filteredMustahikList}
        columns={columns}
        isLoading={isLoading}
        isReadOnly={isReadOnly}
        emptyMessage="Belum ada data mustahik"
        headerActions={
          <div className="flex w-full flex-col gap-3 lg:min-w-[700px]">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.9fr)_auto]">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-2 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Total</p>
                  <p className="mt-1 text-base font-semibold">{mustahikList.length}</p>
                </div>
                <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 px-3 py-2 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700">Amil</p>
                  <p className="mt-1 text-base font-semibold text-emerald-900">{amilCount}</p>
                </div>
                <div className="rounded-2xl border border-sky-200/70 bg-sky-50/70 px-3 py-2 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-sky-700">Non-Amil</p>
                  <p className="mt-1 text-base font-semibold text-sky-900">{nonAmilCount}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-2 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Tag Aktif</p>
                  <p className="mt-1 flex items-center gap-1 text-base font-semibold">
                    <Users2 className="h-4 w-4 text-primary" />
                    {selectedTagFilters.length || 0}
                  </p>
                </div>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama, alamat, telepon, asnaf, atau tags..."
                  className="h-11 rounded-2xl border-border/70 bg-background/85 pl-10 pr-4 text-sm shadow-sm"
                />
              </div>
              {!isReadOnly && (
                <Button
                  className="h-11 rounded-2xl px-5 text-sm"
                  onClick={() => {
                    resetForm();
                    setEditingMustahik(null);
                    setIsDialogOpen(true);
                  }}
                >
                  Tambah Mustahik
                </Button>
              )}
            </div>
            <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
              <div className="rounded-2xl border border-border/70 bg-background/85 p-2 shadow-sm">
                <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Kategori
                </p>
                <Select
                  value={asnafFilter}
                  onValueChange={(value) => setAsnafFilter(value as "all" | "amil" | "non_amil")}
                >
                  <SelectTrigger className="h-10 rounded-xl border-0 bg-transparent text-sm shadow-none focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Asnaf</SelectItem>
                    <SelectItem value="amil">Amil Saja</SelectItem>
                    <SelectItem value="non_amil">Selain Amil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/90 p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Filter Tags
                  </p>
                  {selectedTagFilters.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-full px-2 text-[11px]"
                      onClick={() => setSelectedTagFilters([])}
                    >
                      Reset
                    </Button>
                  )}
                </div>
                <TagMultiSelect
                  value={selectedTagFilters}
                  onChange={setSelectedTagFilters}
                  options={availableTags}
                  placeholder="Cari lalu pilih tags untuk filter"
                  searchPlaceholder="Cari tags mustahik..."
                  emptyLabel="Belum ada tag yang cocok"
                  helperText="Menampilkan mustahik yang memiliki semua tags terpilih."
                  allowCreate={false}
                />
              </div>
              <div className="flex items-end">
                {(searchQuery || selectedTagFilters.length > 0 || asnafFilter !== "all") && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full rounded-2xl text-sm lg:w-auto"
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedTagFilters([]);
                      setAsnafFilter("all");
                    }}
                  >
                    Reset Semua Filter
                  </Button>
                )}
              </div>
            </div>
          </div>
        }
        actions={(mustahik) => (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setDetailMustahik(mustahik)}>
              <Eye className="h-4 w-4" />
            </Button>
            {!isReadOnly ? (
              <>
                <Button variant="ghost" size="icon" onClick={() => handleEdit(mustahik)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setDeletingMustahik(mustahik)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </>
            ) : null}
          </div>
        )}
      />

      <Dialog open={!!detailMustahik} onOpenChange={(open) => !open && setDetailMustahik(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detail Mustahik</DialogTitle>
          </DialogHeader>
          {detailMustahik && (
            <div className="space-y-5">
              <div className="rounded-3xl border border-border/70 bg-gradient-to-br from-background to-muted/30 p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                      Profil Penerima
                    </p>
                    <h3 className="text-2xl font-semibold text-foreground">{detailMustahik.name}</h3>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className="rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                      >
                        {detailMustahik.asnaf_settings?.asnaf_name || "-"}
                      </Badge>
                      <Badge variant={PRIORITY_COLORS[detailMustahik.priority]}>
                        {PRIORITY_LABELS[detailMustahik.priority] || detailMustahik.priority}
                      </Badge>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/85 p-3 shadow-sm">
                    <AsnafEligibilityBadges
                      asnafCode={detailMustahik.asnaf_settings?.asnaf_code || ""}
                      showLabels
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-[0.18em]">Anggota</span>
                  </div>
                  <p className="text-lg font-semibold">{detailMustahik.family_members || 1} jiwa</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                    <Wallet className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-[0.18em]">Penghasilan</span>
                  </div>
                  <p className="text-lg font-semibold">{formatCurrency(detailMustahik.monthly_income)}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                    <Wallet className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-[0.18em]">Pengeluaran</span>
                  </div>
                  <p className="text-lg font-semibold">{formatCurrency(detailMustahik.monthly_expense)}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-[0.18em]">Telepon</span>
                  </div>
                  <p className="text-sm font-medium">{detailMustahik.phone || "-"}</p>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1.3fr_0.9fr]">
                <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-[0.18em]">Alamat</span>
                  </div>
                  <p className="text-sm leading-6 text-foreground">{detailMustahik.address || "-"}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                    <Users2 className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-[0.18em]">Tags</span>
                  </div>
                  {detailMustahik.tags?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {detailMustahik.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="rounded-full px-2.5 py-0.5 text-[11px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Belum ada tags</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <StickyNote className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-[0.18em]">Catatan</span>
                </div>
                <p className="text-sm leading-6 text-foreground">{detailMustahik.notes || "-"}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingMustahik ? "Edit Mustahik" : "Tambah Mustahik Baru"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="name">Nama Lengkap *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="asnaf">Kategori Asnaf *</Label>
                <Select
                  value={formData.asnaf_id}
                  onValueChange={(value) => setFormData({ ...formData, asnaf_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Asnaf" />
                  </SelectTrigger>
                  <SelectContent>
                    {asnafOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Prioritas *</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telepon</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="family_members">Jumlah Anggota</Label>
                <Input
                  id="family_members"
                  type="number"
                  min={1}
                  value={formData.family_members}
                  onChange={(e) => setFormData({ ...formData, family_members: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthly_income">Penghasilan/Bulan</Label>
                <Input
                  id="monthly_income"
                  type="number"
                  value={formData.monthly_income}
                  onChange={(e) => setFormData({ ...formData, monthly_income: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthly_expense">Pengeluaran/Bulan</Label>
                <Input
                  id="monthly_expense"
                  type="number"
                  value={formData.monthly_expense}
                  onChange={(e) => setFormData({ ...formData, monthly_expense: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Alamat</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Catatan</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <TagMultiSelect
                value={formData.tags}
                onChange={(tags) => setFormData({ ...formData, tags })}
                options={availableTags}
                placeholder="Pilih atau buat tags"
                searchPlaceholder="Cari tags atau buat baru..."
                emptyLabel="Tag belum ada"
                helperText="Tags bisa lebih dari satu untuk memudahkan pencarian dan penugasan."
                allowCreate
                portalled={false}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingMustahik ? "Simpan" : "Tambah"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingMustahik} onOpenChange={(open) => !open && setDeletingMustahik(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Mustahik?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus <strong>{deletingMustahik?.name}</strong>? 
              Data akan dihapus dari daftar aktif namun riwayat distribusi tetap tersimpan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingMustahik && deleteMutation.mutate(deletingMustahik.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

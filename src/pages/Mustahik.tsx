import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { ReadOnlyBanner } from "@/components/shared/ReadOnlyBanner";
import { AsnafEligibilityBadges } from "@/components/shared/AsnafEligibilityBadges";
import { CreatableSingleSelect } from "@/components/shared/CreatableSingleSelect";
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
import { exportToPDF } from "@/lib/exportUtils";
import { isMissingColumnError } from "@/lib/tagUtils";
import {
  AlertCircle,
  Download,
  Edit,
  Eye,
  MapPin,
  Route,
  Search,
  StickyNote,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";

interface Mustahik {
  id: string;
  name: string;
  address: string | null;
  asnaf_id: string;
  asnaf_settings: { asnaf_code: string; asnaf_name: string } | null;
  priority: string;
  notes: string | null;
  distribution_rt: string | null;
  distribution_lane: string | null;
  delivery_order: number | null;
  is_active: boolean;
}

interface MustahikFormData {
  name: string;
  address: string;
  asnaf_id: string;
  priority: string;
  notes: string;
  distribution_rt: string;
  distribution_lane: string;
  delivery_order: string;
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

const routeCollator = new Intl.Collator("id", { numeric: true, sensitivity: "base" });

const normalizeOptionalText = (value: string): string | null => {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || null;
};

const compareNullableText = (a: string | null | undefined, b: string | null | undefined): number => {
  const left = a?.trim() || "";
  const right = b?.trim() || "";

  if (left && !right) return -1;
  if (!left && right) return 1;
  if (!left && !right) return 0;

  return routeCollator.compare(left, right);
};

const compareNullableNumber = (a: number | null | undefined, b: number | null | undefined): number => {
  if (typeof a === "number" && typeof b !== "number") return -1;
  if (typeof a !== "number" && typeof b === "number") return 1;
  if (typeof a !== "number" && typeof b !== "number") return 0;
  return (a || 0) - (b || 0);
};

const sortMustahikByRoute = (items: Mustahik[]): Mustahik[] => {
  return [...items].sort((left, right) => {
    const byRt = compareNullableText(left.distribution_rt, right.distribution_rt);
    if (byRt !== 0) return byRt;

    const byLane = compareNullableText(left.distribution_lane, right.distribution_lane);
    if (byLane !== 0) return byLane;

    const byOrder = compareNullableNumber(left.delivery_order, right.delivery_order);
    if (byOrder !== 0) return byOrder;

    return routeCollator.compare(left.name, right.name);
  });
};

export default function MustahikPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [detailMustahik, setDetailMustahik] = useState<Mustahik | null>(null);
  const [editingMustahik, setEditingMustahik] = useState<Mustahik | null>(null);
  const [deletingMustahik, setDeletingMustahik] = useState<Mustahik | null>(null);
  const [asnafFilter, setAsnafFilter] = useState<"all" | "amil" | "non_amil">("all");
  const [rtFilter, setRtFilter] = useState("all");
  const [laneFilter, setLaneFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isRouteFieldsAvailable, setIsRouteFieldsAvailable] = useState(true);
  const [formData, setFormData] = useState<MustahikFormData>({
    name: "",
    address: "",
    asnaf_id: "",
    priority: "medium",
    notes: "",
    distribution_rt: "",
    distribution_lane: "",
    delivery_order: "",
  });

  const { toast } = useToast();
  const { isReadOnly, selectedPeriod } = usePeriod();
  const { getAsnafOptions } = useAsnafSettings();
  const queryClient = useQueryClient();
  const asnafOptions = getAsnafOptions();

  const mustahikSelectWithRoute =
    "id, name, address, asnaf_id, priority, notes, is_active, distribution_rt, distribution_lane, delivery_order, asnaf_settings(asnaf_code, asnaf_name)";
  const mustahikSelectFallback =
    "id, name, address, asnaf_id, priority, notes, is_active, asnaf_settings(asnaf_code, asnaf_name)";

  const { data: mustahikList = [], isLoading } = useQuery({
    queryKey: ["mustahik"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mustahik")
        .select(mustahikSelectWithRoute)
        .is("deleted_at", null)
        .order("name");

      if (error && isMissingColumnError(error, "mustahik", "distribution_rt")) {
        setIsRouteFieldsAvailable(false);

        const { data: fallbackData, error: fallbackError } = await supabase
          .from("mustahik")
          .select(mustahikSelectFallback)
          .is("deleted_at", null)
          .order("name");

        if (fallbackError) throw fallbackError;

        return (fallbackData || []).map((item) => ({
          ...item,
          distribution_rt: null,
          distribution_lane: null,
          delivery_order: null,
        })) as Mustahik[];
      }

      if (error) throw error;
      setIsRouteFieldsAvailable(true);
      return (data || []) as Mustahik[];
    },
  });

  const checkCanDelete = async (mustahikId: string): Promise<boolean> => {
    const { data: zakatDist } = await supabase
      .from("zakat_distributions")
      .select("id")
      .eq("mustahik_id", mustahikId)
      .in("status", ["approved", "distributed"])
      .limit(1);

    if (zakatDist && zakatDist.length > 0) return false;

    const { data: fidyahDist } = await supabase
      .from("fidyah_distributions")
      .select("id")
      .eq("mustahik_id", mustahikId)
      .in("status", ["approved", "distributed"])
      .limit(1);

    if (fidyahDist && fidyahDist.length > 0) return false;

    return true;
  };

  type AsnafType =
    | "fakir"
    | "miskin"
    | "amil"
    | "muallaf"
    | "riqab"
    | "gharimin"
    | "fisabilillah"
    | "ibnu_sabil";
  type PriorityType = "low" | "medium" | "high" | "urgent";

  const getAsnafCodeById = (asnafId: string): AsnafType => {
    const asnaf = asnafOptions.find((option) => option.id === asnafId);
    const code = asnaf?.value || "miskin";
    const validEnums: AsnafType[] = [
      "fakir",
      "miskin",
      "amil",
      "muallaf",
      "riqab",
      "gharimin",
      "fisabilillah",
      "ibnu_sabil",
    ];
    return validEnums.includes(code as AsnafType) ? (code as AsnafType) : "miskin";
  };

  const createMutation = useMutation({
    mutationFn: async (data: MustahikFormData) => {
      const payload = {
        name: data.name,
        address: normalizeOptionalText(data.address),
        phone: null,
        asnaf_id: data.asnaf_id,
        asnaf: getAsnafCodeById(data.asnaf_id),
        priority: data.priority as PriorityType,
        family_members: null,
        monthly_income: null,
        monthly_expense: null,
        notes: normalizeOptionalText(data.notes),
        distribution_rt: normalizeOptionalText(data.distribution_rt),
        distribution_lane: normalizeOptionalText(data.distribution_lane),
        delivery_order: data.delivery_order ? Number(data.delivery_order) : null,
      };

      const { error } = await supabase.from("mustahik").insert(payload);

      if (error && isMissingColumnError(error, "mustahik", "distribution_rt")) {
        setIsRouteFieldsAvailable(false);
        const { distribution_rt, distribution_lane, delivery_order, ...fallbackPayload } = payload;
        const { error: fallbackError } = await supabase.from("mustahik").insert(fallbackPayload);
        if (fallbackError) throw fallbackError;
        return { routeFieldsSkipped: true };
      }

      if (error) throw error;
      setIsRouteFieldsAvailable(true);
      return { routeFieldsSkipped: false };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["mustahik"] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "Mustahik berhasil ditambahkan",
        description: result.routeFieldsSkipped
          ? "Data utama tersimpan, tetapi field RT/Gang/Urutan belum aktif di database. Jalankan migration Supabase terbaru."
          : undefined,
      });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string } & MustahikFormData) => {
      const payload = {
        name: data.name,
        address: normalizeOptionalText(data.address),
        phone: null,
        asnaf_id: data.asnaf_id,
        asnaf: getAsnafCodeById(data.asnaf_id),
        priority: data.priority as PriorityType,
        family_members: null,
        monthly_income: null,
        monthly_expense: null,
        notes: normalizeOptionalText(data.notes),
        distribution_rt: normalizeOptionalText(data.distribution_rt),
        distribution_lane: normalizeOptionalText(data.distribution_lane),
        delivery_order: data.delivery_order ? Number(data.delivery_order) : null,
      };

      const { error } = await supabase.from("mustahik").update(payload).eq("id", data.id);

      if (error && isMissingColumnError(error, "mustahik", "distribution_rt")) {
        setIsRouteFieldsAvailable(false);
        const { distribution_rt, distribution_lane, delivery_order, ...fallbackPayload } = payload;
        const { error: fallbackError } = await supabase
          .from("mustahik")
          .update(fallbackPayload)
          .eq("id", data.id);
        if (fallbackError) throw fallbackError;
        return { routeFieldsSkipped: true };
      }

      if (error) throw error;
      setIsRouteFieldsAvailable(true);
      return { routeFieldsSkipped: false };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["mustahik"] });
      setIsDialogOpen(false);
      setEditingMustahik(null);
      resetForm();
      toast({
        title: "Mustahik berhasil diperbarui",
        description: result.routeFieldsSkipped
          ? "Perubahan tersimpan, tetapi field RT/Gang/Urutan belum tersedia di database."
          : undefined,
      });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const canDelete = await checkCanDelete(id);
      if (!canDelete) {
        throw new Error("Mustahik tidak dapat dihapus karena sudah memiliki riwayat distribusi");
      }

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
    const defaultAsnaf = asnafOptions.find((option) => option.value === "miskin") || asnafOptions[0];
    setFormData({
      name: "",
      address: "",
      asnaf_id: defaultAsnaf?.id || "",
      priority: "medium",
      notes: "",
      distribution_rt: "",
      distribution_lane: "",
      delivery_order: "",
    });
  };

  const handleEdit = (mustahik: Mustahik) => {
    setEditingMustahik(mustahik);
    setFormData({
      name: mustahik.name,
      address: mustahik.address || "",
      asnaf_id: mustahik.asnaf_id,
      priority: mustahik.priority,
      notes: mustahik.notes || "",
      distribution_rt: mustahik.distribution_rt || "",
      distribution_lane: mustahik.distribution_lane || "",
      delivery_order: mustahik.delivery_order?.toString() || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (editingMustahik) {
      updateMutation.mutate({ id: editingMustahik.id, ...formData });
      return;
    }
    createMutation.mutate(formData);
  };

  const rtOptions = useMemo(
    () =>
      Array.from(new Set(mustahikList.map((item) => item.distribution_rt?.trim()).filter(Boolean) as string[])).sort(
        routeCollator.compare,
      ),
    [mustahikList],
  );

  const laneOptions = useMemo(() => {
    const baseItems = rtFilter === "all"
      ? mustahikList
      : mustahikList.filter((item) => (item.distribution_rt?.trim() || "") === rtFilter);

    return Array.from(
      new Set(baseItems.map((item) => item.distribution_lane?.trim()).filter(Boolean) as string[]),
    ).sort(routeCollator.compare);
  }, [mustahikList, rtFilter]);

  const formRtOptions = useMemo(
    () =>
      Array.from(new Set(mustahikList.map((item) => item.distribution_rt?.trim()).filter(Boolean) as string[])).sort(
        routeCollator.compare,
      ),
    [mustahikList],
  );

  const formLaneOptions = useMemo(() => {
    const currentRt = formData.distribution_rt.trim();
    const baseItems = currentRt
      ? mustahikList.filter((item) => (item.distribution_rt?.trim() || "") === currentRt)
      : mustahikList;

    return Array.from(
      new Set(baseItems.map((item) => item.distribution_lane?.trim()).filter(Boolean) as string[]),
    ).sort(routeCollator.compare);
  }, [formData.distribution_rt, mustahikList]);

  const filteredMustahikList = useMemo(() => {
    const filtered = mustahikList.filter((item) => {
      const passesAsnaf =
        asnafFilter === "amil"
          ? item.asnaf_settings?.asnaf_code === "amil"
          : asnafFilter === "non_amil"
            ? item.asnaf_settings?.asnaf_code !== "amil"
            : true;

      const passesRt = rtFilter === "all" || (item.distribution_rt?.trim() || "") === rtFilter;
      const passesLane = laneFilter === "all" || (item.distribution_lane?.trim() || "") === laneFilter;

      const searchValue = searchQuery.trim().toLowerCase();
      const haystack = [
        item.name,
        item.address || "",
        item.asnaf_settings?.asnaf_name || "",
        item.distribution_rt || "",
        item.distribution_lane || "",
        item.notes || "",
      ]
        .join(" ")
        .toLowerCase();

      const passesSearch = !searchValue || haystack.includes(searchValue);
      return passesAsnaf && passesRt && passesLane && passesSearch;
    });

    return sortMustahikByRoute(filtered);
  }, [mustahikList, asnafFilter, rtFilter, laneFilter, searchQuery]);

  const amilCount = useMemo(
    () => mustahikList.filter((item) => item.asnaf_settings?.asnaf_code === "amil").length,
    [mustahikList],
  );
  const nonAmilCount = useMemo(
    () => mustahikList.filter((item) => item.asnaf_settings?.asnaf_code !== "amil").length,
    [mustahikList],
  );

  const handleExportPDF = () => {
    if (filteredMustahikList.length === 0) {
      toast({
        variant: "destructive",
        title: "Tidak ada data",
        description: "Hasil filter kosong. Tidak ada data mustahik untuk diunduh.",
      });
      return;
    }

    const filterSummary = [
      asnafFilter === "all" ? "Semua Asnaf" : asnafFilter === "amil" ? "Amil" : "Non-Amil",
      rtFilter === "all" ? "Semua RT" : `RT ${rtFilter}`,
      laneFilter === "all" ? "Semua Gang" : `Gang ${laneFilter}`,
    ].join(" • ");

    exportToPDF(
      {
        title: "Daftar Mustahik Terfilter",
        subtitle: selectedPeriod?.name
          ? `${selectedPeriod.name} • ${filterSummary}`
          : filterSummary,
        columns: [
          { header: "No", key: "no", width: 8 },
          { header: "Nama", key: "name", width: 28 },
          { header: "Asnaf", key: "asnaf", width: 18 },
          { header: "RT", key: "distribution_rt", width: 12 },
          { header: "Gang/Jalur", key: "distribution_lane", width: 18 },
          { header: "Urut", key: "delivery_order", width: 10 },
          { header: "Alamat", key: "address", width: 40 },
        ],
        rows: filteredMustahikList.map((item, index) => ({
          no: index + 1,
          name: item.name,
          asnaf: item.asnaf_settings?.asnaf_name || "-",
          distribution_rt: item.distribution_rt || "-",
          distribution_lane: item.distribution_lane || "-",
          delivery_order: item.delivery_order ?? "-",
          address: item.address || "-",
        })),
        summary: {
          "Total Mustahik": filteredMustahikList.length,
          "Filter Asnaf": asnafFilter === "all" ? "Semua Asnaf" : asnafFilter === "amil" ? "Amil" : "Non-Amil",
          "Filter RT": rtFilter === "all" ? "Semua" : rtFilter,
          "Filter Gang/Jalur": laneFilter === "all" ? "Semua" : laneFilter,
        },
      },
      `mustahik-${new Date().toISOString().slice(0, 10)}`,
    );
  };

  const columns: Column<Mustahik>[] = [
    { key: "name", header: "Nama" },
    {
      key: "asnaf_id",
      header: "Asnaf",
      render: (item) => {
        const asnafCode = item.asnaf_settings?.asnaf_code || "";
        return (
          <div className="flex max-w-[220px] flex-col gap-1.5">
            <Badge
              variant="outline"
              className="w-fit rounded-full border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700"
            >
              {item.asnaf_settings?.asnaf_name || "-"}
            </Badge>
            <div className="w-fit">
              <AsnafEligibilityBadges asnafCode={asnafCode} size="sm" />
            </div>
          </div>
        );
      },
    },
    {
      key: "distribution_rt",
      header: "Wilayah Distribusi",
      render: (item) => (
        <div className="flex max-w-[250px] flex-wrap gap-1.5">
          <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[11px]">
            {item.distribution_rt ? `RT ${item.distribution_rt}` : "RT belum diisi"}
          </Badge>
          <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px]">
            {item.distribution_lane ? item.distribution_lane : "Gang belum diisi"}
          </Badge>
        </div>
      ),
    },
    {
      key: "delivery_order",
      header: "Urutan",
      render: (item) => (
        <Badge className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px]">
          {typeof item.delivery_order === "number" ? `Urut ${item.delivery_order}` : "Belum diatur"}
        </Badge>
      ),
    },
    {
      key: "priority",
      header: "Prioritas",
      render: (item) => (
        <Badge variant={PRIORITY_COLORS[item.priority]}>
          {PRIORITY_LABELS[item.priority] || item.priority}
        </Badge>
      ),
    },
    {
      key: "address",
      header: "Alamat",
      render: (item) => (
        <p className="max-w-[320px] text-sm leading-5 text-foreground/90">{item.address || "-"}</p>
      ),
    },
  ];

  return (
    <AppLayout title="Data Mustahik">
      {isReadOnly && <ReadOnlyBanner periodName={selectedPeriod?.name} />}
      {!isRouteFieldsAvailable && (
        <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-950 [&>svg]:text-amber-700">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Field wilayah distribusi belum aktif di database</AlertTitle>
          <AlertDescription>
            Jalankan <code>supabase db push</code> atau eksekusi migration terbaru agar field
            <code> distribution_rt</code>, <code>distribution_lane</code>, dan <code>delivery_order</code> aktif.
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
          <div className="flex w-full flex-col gap-3 lg:min-w-[760px]">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(260px,1fr)_auto_auto]">
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
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Tersaring</p>
                  <p className="mt-1 flex items-center gap-1 text-base font-semibold">
                    <UserCheck className="h-4 w-4 text-primary" />
                    {filteredMustahikList.length}
                  </p>
                </div>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Cari nama, alamat, RT, gang, asnaf, atau catatan..."
                  className="h-11 rounded-2xl border-border/70 bg-background/85 pl-10 pr-4 text-sm shadow-sm"
                />
              </div>

              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl px-4 text-sm"
                onClick={handleExportPDF}
              >
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </Button>

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

            <div className="grid gap-3 lg:grid-cols-[220px_220px_220px_auto]">
              <div className="rounded-2xl border border-border/70 bg-background/85 p-2 shadow-sm">
                <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Kategori
                </p>
                <Select value={asnafFilter} onValueChange={(value) => setAsnafFilter(value as "all" | "amil" | "non_amil") }>
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

              <div className="rounded-2xl border border-border/70 bg-background/85 p-2 shadow-sm">
                <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  RT / Wilayah
                </p>
                <CreatableSingleSelect
                  value={rtFilter === "all" ? "" : rtFilter}
                  onChange={(value) => {
                    setRtFilter(value.trim() ? value : "all");
                    setLaneFilter("all");
                  }}
                  options={rtOptions}
                  placeholder="Semua RT"
                  searchPlaceholder="Cari RT / wilayah..."
                  emptyLabel="RT / wilayah tidak ditemukan"
                  allowCreate={false}
                />
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/85 p-2 shadow-sm">
                <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Gang / Jalur
                </p>
                <CreatableSingleSelect
                  value={laneFilter === "all" ? "" : laneFilter}
                  onChange={(value) => setLaneFilter(value.trim() ? value : "all")}
                  options={laneOptions}
                  placeholder="Semua Gang"
                  searchPlaceholder="Cari gang / jalur..."
                  emptyLabel="Gang / jalur tidak ditemukan"
                  allowCreate={false}
                />
              </div>

              <div className="flex items-end">
                {(searchQuery || asnafFilter !== "all" || rtFilter !== "all" || laneFilter !== "all") && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full rounded-2xl text-sm lg:w-auto"
                    onClick={() => {
                      setSearchQuery("");
                      setAsnafFilter("all");
                      setRtFilter("all");
                      setLaneFilter("all");
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

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-[0.18em]">RT / Wilayah</span>
                  </div>
                  <p className="text-lg font-semibold">{detailMustahik.distribution_rt || "-"}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                    <Route className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-[0.18em]">Gang / Jalur</span>
                  </div>
                  <p className="text-lg font-semibold">{detailMustahik.distribution_lane || "-"}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                    <UserCheck className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-[0.18em]">Urutan Distribusi</span>
                  </div>
                  <p className="text-lg font-semibold">
                    {typeof detailMustahik.delivery_order === "number" ? detailMustahik.delivery_order : "-"}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-[0.18em]">Alamat</span>
                  </div>
                  <p className="text-sm leading-6 text-foreground">{detailMustahik.address || "-"}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                    <Route className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-[0.18em]">Ringkasan Rute</span>
                  </div>
                  <p className="text-sm leading-6 text-foreground">
                    {detailMustahik.distribution_rt || "RT ?"}
                    {detailMustahik.distribution_lane ? ` • ${detailMustahik.distribution_lane}` : ""}
                    {typeof detailMustahik.delivery_order === "number" ? ` • Urutan ${detailMustahik.delivery_order}` : ""}
                  </p>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingMustahik ? "Edit Mustahik" : "Tambah Mustahik Baru"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="name">Nama Lengkap *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="asnaf">Kategori Asnaf *</Label>
                <Select value={formData.asnaf_id} onValueChange={(value) => setFormData({ ...formData, asnaf_id: value })}>
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
                <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value })}>
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
                <Label htmlFor="distribution_rt">RT / Wilayah</Label>
                <CreatableSingleSelect
                  value={formData.distribution_rt}
                  onChange={(value) =>
                    setFormData((current) => ({
                      ...current,
                      distribution_rt: value,
                      distribution_lane:
                        value.trim() && current.distribution_rt.trim() !== value.trim() ? "" : current.distribution_lane,
                    }))
                  }
                  options={formRtOptions}
                  placeholder="Pilih atau buat RT / wilayah"
                  searchPlaceholder="Cari RT / wilayah..."
                  emptyLabel="RT / wilayah belum ada"
                  helperText="Pilih RT yang sudah ada atau buat RT baru langsung dari daftar."
                  portalled={false}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="distribution_lane">Gang / Jalur</Label>
                <CreatableSingleSelect
                  value={formData.distribution_lane}
                  onChange={(value) => setFormData({ ...formData, distribution_lane: value })}
                  options={formLaneOptions}
                  placeholder="Pilih atau buat gang / jalur"
                  searchPlaceholder="Cari gang / jalur..."
                  emptyLabel="Gang / jalur belum ada"
                  helperText="Daftar gang mengikuti RT yang dipilih. Jika belum ada, buat baru langsung dari sini."
                  portalled={false}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="delivery_order">Urutan Distribusi</Label>
                <Input
                  id="delivery_order"
                  type="number"
                  min={1}
                  value={formData.delivery_order}
                  onChange={(event) => setFormData({ ...formData, delivery_order: event.target.value })}
                  placeholder="Contoh: 1"
                />
              </div>

              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground md:col-span-2">
                Data ini dipakai untuk pengurutan lapangan: sistem akan mengurutkan berdasarkan RT, lalu Gang/Jalur,
                lalu Urutan Distribusi.
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Alamat</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(event) => setFormData({ ...formData, address: event.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Catatan</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
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

      <AlertDialog open={!!deletingMustahik} onOpenChange={(open) => !open && setDeletingMustahik(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Mustahik?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus <strong>{deletingMustahik?.name}</strong>? Data akan dihapus dari
              daftar aktif namun riwayat distribusi tetap tersimpan.
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

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CreatableSingleSelect } from "@/components/shared/CreatableSingleSelect";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { exportToPDF } from "@/lib/exportUtils";
import { isMissingColumnError } from "@/lib/tagUtils";
import { compareMustahikRoute, formatMustahikRoute, sortMustahikByRoute } from "@/lib/mustahikRoute";
import {
  AlertCircle,
  UserPlus,
  CheckCircle2,
  XCircle,
  Edit,
  Trash2,
  Users,
  Download,
  FileText,
  MapPinned,
  Route,
  Search,
} from "lucide-react";

interface DistributionAssignmentTabProps {
  periodId: string;
  isReadOnly: boolean;
}

interface AssignmentMustahik {
  id?: string;
  name: string;
  asnaf: string;
  address: string | null;
  distribution_rt: string | null;
  distribution_lane: string | null;
  delivery_order: number | null;
}

interface Assignment {
  id: string;
  mustahik_id: string;
  assigned_to: string;
  status: string;
  delivery_notes: string | null;
  assigned_at: string;
  delivered_at: string | null;
  mustahik?: AssignmentMustahik;
  assignee?: { full_name: string | null; email: string | null };
}

interface MustahikOption extends AssignmentMustahik {
  id: string;
}

const ASNAF_LABELS: Record<string, string> = {
  fakir: "Fakir",
  miskin: "Miskin",
  amil: "Amil",
  muallaf: "Muallaf",
  riqab: "Riqab",
  gharimin: "Gharimin",
  fisabilillah: "Fisabilillah",
  ibnu_sabil: "Ibnu Sabil",
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Belum Dikirim", variant: "secondary" },
  delivered: { label: "Terkirim", variant: "default" },
  not_delivered: { label: "Tidak Terkirim", variant: "destructive" },
};

export function DistributionAssignmentTab({ periodId, isReadOnly }: DistributionAssignmentTabProps) {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isDeliveryDialogOpen, setIsDeliveryDialogOpen] = useState(false);
  const [selectedMustahik, setSelectedMustahik] = useState<string[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>("");
  const [assignmentRtFilter, setAssignmentRtFilter] = useState("all");
  const [assignmentLaneFilter, setAssignmentLaneFilter] = useState("all");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [dialogRtFilter, setDialogRtFilter] = useState("all");
  const [dialogLaneFilter, setDialogLaneFilter] = useState("all");
  const [dialogSearch, setDialogSearch] = useState("");
  const [isRouteFieldsAvailable, setIsRouteFieldsAvailable] = useState(true);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<string>("delivered");
  const [deliveryNotes, setDeliveryNotes] = useState("");

  const isAdminUser = isAdmin();

  const mapAssigneeProfiles = async (rows: { assigned_to: string }[]) => {
    const userIds = [...new Set(rows.map((row) => row.assigned_to))];
    if (userIds.length === 0) return new Map<string, { full_name: string | null; email: string | null }>();

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);

    return new Map(profiles?.map((profile) => [profile.id, profile]) || []);
  };

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["distribution-assignments", periodId],
    queryFn: async () => {
      const assignmentSelectWithRoute =
        "*, mustahik:mustahik_id(id, name, asnaf, address, distribution_rt, distribution_lane, delivery_order)";
      const assignmentSelectFallback = "*, mustahik:mustahik_id(id, name, asnaf, address)";

      const { data, error } = await supabase
        .from("distribution_assignments")
        .select(assignmentSelectWithRoute)
        .eq("period_id", periodId)
        .order("assigned_at", { ascending: false });

      if (error && isMissingColumnError(error, "mustahik", "distribution_rt")) {
        setIsRouteFieldsAvailable(false);
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("distribution_assignments")
          .select(assignmentSelectFallback)
          .eq("period_id", periodId)
          .order("assigned_at", { ascending: false });

        if (fallbackError) throw fallbackError;

        const profileMap = await mapAssigneeProfiles(fallbackData || []);
        return (fallbackData || []).map((assignment) => ({
          ...assignment,
          mustahik: assignment.mustahik
            ? {
                ...assignment.mustahik,
                distribution_rt: null,
                distribution_lane: null,
                delivery_order: null,
              }
            : undefined,
          assignee: profileMap.get(assignment.assigned_to) || { full_name: null, email: null },
        })) as Assignment[];
      }

      if (error) throw error;
      setIsRouteFieldsAvailable(true);

      const profileMap = await mapAssigneeProfiles(data || []);
      return (data || []).map((assignment) => ({
        ...assignment,
        assignee: profileMap.get(assignment.assigned_to) || { full_name: null, email: null },
      })) as Assignment[];
    },
    enabled: !!periodId,
  });

  const { data: mustahikList = [] } = useQuery({
    queryKey: ["mustahik-active"],
    queryFn: async () => {
      const selectWithRoute = "id, name, asnaf, address, distribution_rt, distribution_lane, delivery_order";
      const selectFallback = "id, name, asnaf, address";

      const { data, error } = await supabase
        .from("mustahik")
        .select(selectWithRoute)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name");

      if (error && isMissingColumnError(error, "mustahik", "distribution_rt")) {
        setIsRouteFieldsAvailable(false);
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("mustahik")
          .select(selectFallback)
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("name");

        if (fallbackError) throw fallbackError;
        return (fallbackData || []).map((item) => ({
          ...item,
          distribution_rt: null,
          distribution_lane: null,
          delivery_order: null,
        })) as MustahikOption[];
      }

      if (error) throw error;
      setIsRouteFieldsAvailable(true);
      return (data || []) as MustahikOption[];
    },
  });

  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-users"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      if (error) throw error;
      return profiles;
    },
    enabled: isAdminUser,
  });

  const baseDisplayedAssignments = useMemo(() => {
    const scoped = isAdminUser ? assignments : assignments.filter((assignment) => assignment.assigned_to === user?.id);
    return [...scoped].sort((left, right) => {
      const routeCompare = compareMustahikRoute(left.mustahik || {}, right.mustahik || {});
      if (routeCompare !== 0) return routeCompare;
      return new Date(left.assigned_at).getTime() - new Date(right.assigned_at).getTime();
    });
  }, [assignments, isAdminUser, user?.id]);

  const rtOptions = useMemo(
    () => Array.from(new Set(mustahikList.map((item) => item.distribution_rt?.trim()).filter(Boolean) as string[])).sort(),
    [mustahikList],
  );

  const assignmentLaneOptions = useMemo(() => {
    const baseItems = assignmentRtFilter === "all"
      ? baseDisplayedAssignments
      : baseDisplayedAssignments.filter((item) => (item.mustahik?.distribution_rt?.trim() || "") === assignmentRtFilter);

    return Array.from(
      new Set(baseItems.map((item) => item.mustahik?.distribution_lane?.trim()).filter(Boolean) as string[]),
    ).sort();
  }, [assignmentRtFilter, baseDisplayedAssignments]);

  const dialogLaneOptions = useMemo(() => {
    const baseItems = dialogRtFilter === "all"
      ? mustahikList
      : mustahikList.filter((item) => (item.distribution_rt?.trim() || "") === dialogRtFilter);

    return Array.from(
      new Set(baseItems.map((item) => item.distribution_lane?.trim()).filter(Boolean) as string[]),
    ).sort();
  }, [dialogRtFilter, mustahikList]);

  const displayedAssignments = useMemo(() => {
    const searchValue = assignmentSearch.trim().toLowerCase();
    return baseDisplayedAssignments.filter((assignment) => {
      const passesRt = assignmentRtFilter === "all" || (assignment.mustahik?.distribution_rt?.trim() || "") === assignmentRtFilter;
      const passesLane = assignmentLaneFilter === "all" || (assignment.mustahik?.distribution_lane?.trim() || "") === assignmentLaneFilter;
      const haystack = [
        assignment.mustahik?.name || "",
        assignment.mustahik?.address || "",
        assignment.mustahik?.distribution_rt || "",
        assignment.mustahik?.distribution_lane || "",
        assignment.assignee?.full_name || "",
        assignment.assignee?.email || "",
      ]
        .join(" ")
        .toLowerCase();
      const passesSearch = !searchValue || haystack.includes(searchValue);
      return passesRt && passesLane && passesSearch;
    });
  }, [assignmentLaneFilter, assignmentRtFilter, assignmentSearch, baseDisplayedAssignments]);

  const assignedMustahikIds = useMemo(() => new Set(assignments.map((assignment) => assignment.mustahik_id)), [assignments]);

  const filteredMustahikForDialog = useMemo(() => {
    const searchValue = dialogSearch.trim().toLowerCase();
    const filtered = mustahikList.filter((item) => {
      const passesRt = dialogRtFilter === "all" || (item.distribution_rt?.trim() || "") === dialogRtFilter;
      const passesLane = dialogLaneFilter === "all" || (item.distribution_lane?.trim() || "") === dialogLaneFilter;
      const haystack = [item.name, item.address || "", item.distribution_rt || "", item.distribution_lane || "", item.asnaf]
        .join(" ")
        .toLowerCase();
      const passesSearch = !searchValue || haystack.includes(searchValue);
      return passesRt && passesLane && passesSearch;
    });

    return sortMustahikByRoute(filtered);
  }, [dialogLaneFilter, dialogRtFilter, dialogSearch, mustahikList]);

  const createAssignmentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStaff || selectedMustahik.length === 0) {
        throw new Error("Pilih petugas dan minimal satu mustahik");
      }

      const insertData = selectedMustahik.map((mustahikId) => ({
        period_id: periodId,
        mustahik_id: mustahikId,
        assigned_to: selectedStaff,
        created_by: user?.id,
      }));

      const { error } = await supabase.from("distribution_assignments").insert(insertData);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["distribution-assignments"] });
      setIsAssignDialogOpen(false);
      setSelectedMustahik([]);
      setSelectedStaff("");
      toast({ title: `${selectedMustahik.length} penugasan berhasil dibuat` });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const updateDeliveryMutation = useMutation({
    mutationFn: async () => {
      if (!editingAssignment) throw new Error("No assignment selected");

      const updateData: Record<string, unknown> = {
        status: deliveryStatus,
        delivery_notes: deliveryNotes || null,
      };

      if (deliveryStatus === "delivered") {
        updateData.delivered_at = new Date().toISOString();
      }

      const { error } = await supabase.from("distribution_assignments").update(updateData).eq("id", editingAssignment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["distribution-assignments"] });
      setIsDeliveryDialogOpen(false);
      setEditingAssignment(null);
      setDeliveryNotes("");
      toast({ title: "Status pengiriman berhasil diperbarui" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("distribution_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["distribution-assignments"] });
      toast({ title: "Penugasan berhasil dihapus" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const openDeliveryDialog = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    setDeliveryStatus(assignment.status);
    setDeliveryNotes(assignment.delivery_notes || "");
    setIsDeliveryDialogOpen(true);
  };

  const toggleMustahik = (id: string) => {
    setSelectedMustahik((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const selectAllUnassigned = () => {
    const unassigned = filteredMustahikForDialog.filter((item) => !assignedMustahikIds.has(item.id)).map((item) => item.id);
    setSelectedMustahik(unassigned);
  };

  const stats = useMemo(
    () => ({
      total: displayedAssignments.length,
      pending: displayedAssignments.filter((item) => item.status === "pending").length,
      delivered: displayedAssignments.filter((item) => item.status === "delivered").length,
      notDelivered: displayedAssignments.filter((item) => item.status === "not_delivered").length,
    }),
    [displayedAssignments],
  );

  const handleExportAssignmentsPdf = () => {
    if (displayedAssignments.length === 0) {
      toast({ variant: "destructive", title: "Tidak ada data untuk diunduh" });
      return;
    }

    exportToPDF(
      {
        title: "Daftar Mustahik Tertugaskan",
        subtitle: `${isAdminUser ? "Semua petugas" : "Penugasan saya"} • ${displayedAssignments.length} mustahik`,
        columns: [
          { header: "Nama", key: "name", width: 22 },
          { header: "Asnaf", key: "asnaf", width: 14 },
          { header: "RT", key: "distribution_rt", width: 10 },
          { header: "Gang/Jalur", key: "distribution_lane", width: 16 },
          { header: "Urut", key: "delivery_order", width: 9 },
          { header: "Alamat", key: "address", width: 34 },
          { header: "Petugas", key: "staff", width: 22 },
        ],
        rows: displayedAssignments.map((assignment) => ({
          name: assignment.mustahik?.name || "-",
          asnaf: ASNAF_LABELS[assignment.mustahik?.asnaf || ""] || assignment.mustahik?.asnaf || "-",
          distribution_rt: assignment.mustahik?.distribution_rt || "-",
          distribution_lane: assignment.mustahik?.distribution_lane || "-",
          delivery_order: assignment.mustahik?.delivery_order ?? "-",
          address: assignment.mustahik?.address || "-",
          staff: assignment.assignee?.full_name || assignment.assignee?.email || "-",
        })),
        summary: {
          "Total Mustahik": displayedAssignments.length,
          "Filter RT": assignmentRtFilter === "all" ? "Semua" : assignmentRtFilter,
          "Filter Gang/Jalur": assignmentLaneFilter === "all" ? "Semua" : assignmentLaneFilter,
        },
      },
      "daftar-penugasan-mustahik",
    );
  };

  return (
    <div className="space-y-4">
      {!isRouteFieldsAvailable && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950 [&>svg]:text-amber-700">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Field rute mustahik belum aktif di database</AlertTitle>
          <AlertDescription>
            Jalankan <code>supabase db push</code> agar filter RT, gang, dan urutan distribusi aktif di penugasan petugas.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Penugasan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Belum Dikirim</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Terkirim</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{stats.delivered}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Tidak Terkirim</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{stats.notDelivered}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                {isAdminUser ? "Semua Penugasan" : "Penugasan Saya"}
              </CardTitle>
              <CardDescription>
                {isAdminUser ? "Kelola penugasan distribusi ke petugas" : "Daftar mustahik yang ditugaskan kepada Anda"}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={handleExportAssignmentsPdf} className="gap-2">
                <Download className="h-4 w-4" />
                Download PDF
              </Button>
              {isAdminUser && !isReadOnly && (
                <Button onClick={() => setIsAssignDialogOpen(true)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Tugaskan
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_220px_220px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={assignmentSearch}
                onChange={(event) => setAssignmentSearch(event.target.value)}
                placeholder="Cari mustahik, alamat, RT, gang, atau petugas..."
                className="h-10 rounded-xl pl-10"
              />
            </div>
            <CreatableSingleSelect
              value={assignmentRtFilter === "all" ? "" : assignmentRtFilter}
              onChange={(value) => {
                setAssignmentRtFilter(value.trim() ? value : "all");
                setAssignmentLaneFilter("all");
              }}
              options={rtOptions}
              placeholder="Semua RT"
              searchPlaceholder="Cari RT..."
              emptyLabel="RT tidak ditemukan"
              allowCreate={false}
            />
            <CreatableSingleSelect
              value={assignmentLaneFilter === "all" ? "" : assignmentLaneFilter}
              onChange={(value) => setAssignmentLaneFilter(value.trim() ? value : "all")}
              options={assignmentLaneOptions}
              placeholder="Semua Gang"
              searchPlaceholder="Cari gang / jalur..."
              emptyLabel="Gang tidak ditemukan"
              allowCreate={false}
            />
            {(assignmentSearch || assignmentRtFilter !== "all" || assignmentLaneFilter !== "all") && (
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                onClick={() => {
                  setAssignmentSearch("");
                  setAssignmentRtFilter("all");
                  setAssignmentLaneFilter("all");
                }}
              >
                Reset Filter
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-muted-foreground">Memuat...</p>
          ) : displayedAssignments.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {isAdminUser ? "Belum ada penugasan" : "Tidak ada penugasan untuk Anda"}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mustahik</TableHead>
                  <TableHead>Rute</TableHead>
                  <TableHead>Asnaf</TableHead>
                  {isAdminUser && <TableHead>Petugas</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead>Catatan</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedAssignments.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{assignment.mustahik?.name || "-"}</p>
                        <p className="max-w-[240px] truncate text-xs text-muted-foreground">
                          {assignment.mustahik?.address || "-"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[11px]">
                          {assignment.mustahik?.distribution_rt || "RT belum diisi"}
                        </Badge>
                        <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px]">
                          {assignment.mustahik?.distribution_lane || "Gang belum diisi"}
                        </Badge>
                        <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px]">
                          {typeof assignment.mustahik?.delivery_order === "number" ? `Urut ${assignment.mustahik.delivery_order}` : "Urut -"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {ASNAF_LABELS[assignment.mustahik?.asnaf || ""] || "-"}
                      </Badge>
                    </TableCell>
                    {isAdminUser && <TableCell>{assignment.assignee?.full_name || assignment.assignee?.email || "-"}</TableCell>}
                    <TableCell>
                      <Badge variant={STATUS_CONFIG[assignment.status]?.variant || "secondary"}>
                        {STATUS_CONFIG[assignment.status]?.label || assignment.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">{assignment.delivery_notes || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {!isReadOnly && (
                          <Button variant="ghost" size="icon" onClick={() => openDeliveryDialog(assignment)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {isAdminUser && !isReadOnly && (
                          <Button variant="ghost" size="icon" onClick={() => deleteAssignmentMutation.mutate(assignment.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-w-3xl overflow-y-auto sm:max-h-[90dvh]">
          <DialogHeader>
            <DialogTitle>Tugaskan Mustahik ke Petugas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Pilih Petugas Distribusi</Label>
              <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih petugas..." />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map((staff) => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.full_name || staff.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 rounded-2xl border border-border/70 bg-background/80 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <Label>Pilih Mustahik ({selectedMustahik.length} dipilih)</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-full px-2 text-[11px]"
                    onClick={() => {
                      setDialogSearch("");
                      setDialogRtFilter("all");
                      setDialogLaneFilter("all");
                    }}
                  >
                    Reset Filter
                  </Button>
                  <Button variant="outline" size="sm" onClick={selectAllUnassigned}>
                    Pilih Semua Belum Ditugaskan
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_220px_220px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={dialogSearch}
                    onChange={(event) => setDialogSearch(event.target.value)}
                    placeholder="Cari nama, alamat, RT, atau gang..."
                    className="h-10 rounded-xl pl-10"
                  />
                </div>
                <CreatableSingleSelect
                  value={dialogRtFilter === "all" ? "" : dialogRtFilter}
                  onChange={(value) => {
                    setDialogRtFilter(value.trim() ? value : "all");
                    setDialogLaneFilter("all");
                  }}
                  options={rtOptions}
                  placeholder="Semua RT"
                  searchPlaceholder="Cari RT..."
                  emptyLabel="RT tidak ditemukan"
                  allowCreate={false}
                  portalled={false}
                />
                <CreatableSingleSelect
                  value={dialogLaneFilter === "all" ? "" : dialogLaneFilter}
                  onChange={(value) => setDialogLaneFilter(value.trim() ? value : "all")}
                  options={dialogLaneOptions}
                  placeholder="Semua Gang"
                  searchPlaceholder="Cari gang / jalur..."
                  emptyLabel="Gang tidak ditemukan"
                  allowCreate={false}
                  portalled={false}
                />
              </div>

              <div className="max-h-[380px] overflow-y-auto rounded-lg border">
                {filteredMustahikForDialog.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">Tidak ada mustahik yang cocok dengan filter wilayah.</p>
                )}
                {filteredMustahikForDialog.map((mustahik) => {
                  const isAssigned = assignedMustahikIds.has(mustahik.id);
                  return (
                    <div
                      key={mustahik.id}
                      className={`flex items-start gap-3 border-b p-3 last:border-0 ${isAssigned ? "bg-muted/50 opacity-50" : ""}`}
                    >
                      <Checkbox
                        checked={selectedMustahik.includes(mustahik.id)}
                        onCheckedChange={() => toggleMustahik(mustahik.id)}
                        disabled={isAssigned}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{mustahik.name}</p>
                          <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[10px]">
                            {ASNAF_LABELS[mustahik.asnaf] || mustahik.asnaf}
                          </Badge>
                          {isAssigned && <Badge variant="secondary">Sudah ditugaskan</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{mustahik.address || "-"}</p>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[10px]">
                            {mustahik.distribution_rt || "RT belum diisi"}
                          </Badge>
                          <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px]">
                            {mustahik.distribution_lane || "Gang belum diisi"}
                          </Badge>
                          <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px]">
                            {typeof mustahik.delivery_order === "number" ? `Urut ${mustahik.delivery_order}` : "Urut -"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={() => createAssignmentMutation.mutate()}
              disabled={createAssignmentMutation.isPending || !selectedStaff || selectedMustahik.length === 0}
            >
              Tugaskan ({selectedMustahik.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeliveryDialogOpen} onOpenChange={setIsDeliveryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Status Pengiriman</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Mustahik</p>
              <p className="font-medium">{editingAssignment?.mustahik?.name}</p>
              <p className="text-xs text-muted-foreground">{formatMustahikRoute(editingAssignment?.mustahik || {}) || "Rute belum diatur"}</p>
            </div>

            <div className="space-y-2">
              <Label>Status Pengiriman</Label>
              <div className="flex gap-2">
                <Button
                  variant={deliveryStatus === "delivered" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setDeliveryStatus("delivered")}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Terkirim
                </Button>
                <Button
                  variant={deliveryStatus === "not_delivered" ? "destructive" : "outline"}
                  className="flex-1"
                  onClick={() => setDeliveryStatus("not_delivered")}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Tidak Terkirim
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Catatan Pengiriman</Label>
              <Textarea
                id="notes"
                placeholder="Tambahkan catatan (opsional)..."
                value={deliveryNotes}
                onChange={(event) => setDeliveryNotes(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeliveryDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => updateDeliveryMutation.mutate()} disabled={updateDeliveryMutation.isPending}>
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

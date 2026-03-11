import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { UserPlus, CheckCircle2, XCircle, Edit, Trash2, Users } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface DistributionAssignmentTabProps {
  periodId: string;
  isReadOnly: boolean;
}

interface Assignment {
  id: string;
  mustahik_id: string;
  assigned_to: string;
  status: string;
  delivery_notes: string | null;
  assigned_at: string;
  delivered_at: string | null;
  mustahik?: { name: string; asnaf: string };
  assignee?: { full_name: string | null; email: string | null };
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
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<string>("delivered");
  const [deliveryNotes, setDeliveryNotes] = useState("");

  const isAdminUser = isAdmin();

  // Fetch assignments
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["distribution-assignments", periodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribution_assignments")
        .select("*, mustahik:mustahik_id(name, asnaf)")
        .eq("period_id", periodId)
        .order("assigned_at", { ascending: false });
      if (error) throw error;
      
      // Fetch assignee profiles separately
      const userIds = [...new Set(data.map(a => a.assigned_to))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      return data.map(a => ({
        ...a,
        assignee: profileMap.get(a.assigned_to) || { full_name: null, email: null }
      })) as Assignment[];
    },
    enabled: !!periodId,
  });

  // Fetch active mustahik for assignment
  const { data: mustahikList = [] } = useQuery({
    queryKey: ["mustahik-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mustahik")
        .select("id, name, asnaf")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch staff (non-admin users)
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

  // Filter my assignments if not admin
  const displayedAssignments = useMemo(() => {
    if (isAdminUser) return assignments;
    return assignments.filter(a => a.assigned_to === user?.id);
  }, [assignments, isAdminUser, user?.id]);

  // Get already assigned mustahik IDs
  const assignedMustahikIds = useMemo(() => {
    return new Set(assignments.map(a => a.mustahik_id));
  }, [assignments]);

  // Create assignment mutation
  const createAssignmentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStaff || selectedMustahik.length === 0) {
        throw new Error("Pilih petugas dan minimal satu mustahik");
      }

      const insertData = selectedMustahik.map(mustahikId => ({
        period_id: periodId,
        mustahik_id: mustahikId,
        assigned_to: selectedStaff,
        created_by: user?.id,
      }));

      const { error } = await supabase
        .from("distribution_assignments")
        .insert(insertData);
      
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

  // Update delivery status mutation
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

      const { error } = await supabase
        .from("distribution_assignments")
        .update(updateData)
        .eq("id", editingAssignment.id);
      
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

  // Delete assignment mutation
  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("distribution_assignments")
        .delete()
        .eq("id", id);
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
    setSelectedMustahik(prev => 
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const selectAllUnassigned = () => {
    const unassigned = mustahikList
      .filter(m => !assignedMustahikIds.has(m.id))
      .map(m => m.id);
    setSelectedMustahik(unassigned);
  };

  // Stats
  const stats = useMemo(() => {
    const myAssignments = isAdminUser 
      ? assignments 
      : assignments.filter(a => a.assigned_to === user?.id);
    
    return {
      total: myAssignments.length,
      pending: myAssignments.filter(a => a.status === "pending").length,
      delivered: myAssignments.filter(a => a.status === "delivered").length,
      notDelivered: myAssignments.filter(a => a.status === "not_delivered").length,
    };
  }, [assignments, isAdminUser, user?.id]);

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
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

      {/* Assignments Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              {isAdminUser ? "Semua Penugasan" : "Penugasan Saya"}
            </CardTitle>
            <CardDescription>
              {isAdminUser 
                ? "Kelola penugasan distribusi ke petugas" 
                : "Daftar mustahik yang ditugaskan kepada Anda"}
            </CardDescription>
          </div>
          {isAdminUser && !isReadOnly && (
            <Button onClick={() => setIsAssignDialogOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Tugaskan
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-8">Memuat...</p>
          ) : displayedAssignments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {isAdminUser ? "Belum ada penugasan" : "Tidak ada penugasan untuk Anda"}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mustahik</TableHead>
                  <TableHead>Asnaf</TableHead>
                  {isAdminUser && <TableHead>Petugas</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead>Catatan</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedAssignments.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.mustahik?.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {ASNAF_LABELS[a.mustahik?.asnaf || ""] || "-"}
                      </Badge>
                    </TableCell>
                    {isAdminUser && (
                      <TableCell>{a.assignee?.full_name || a.assignee?.email || "-"}</TableCell>
                    )}
                    <TableCell>
                      <Badge variant={STATUS_CONFIG[a.status]?.variant || "secondary"}>
                        {STATUS_CONFIG[a.status]?.label || a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {a.delivery_notes || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {!isReadOnly && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDeliveryDialog(a)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {isAdminUser && !isReadOnly && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteAssignmentMutation.mutate(a.id)}
                          >
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

      {/* Assign Dialog (Admin only) */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                  {staffList.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name || s.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Pilih Mustahik ({selectedMustahik.length} dipilih)</Label>
                <Button variant="outline" size="sm" onClick={selectAllUnassigned}>
                  Pilih Semua Belum Ditugaskan
                </Button>
              </div>
              <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                {mustahikList.map(m => {
                  const isAssigned = assignedMustahikIds.has(m.id);
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center gap-3 p-3 border-b last:border-0 ${
                        isAssigned ? "opacity-50 bg-muted/50" : ""
                      }`}
                    >
                      <Checkbox
                        checked={selectedMustahik.includes(m.id)}
                        onCheckedChange={() => toggleMustahik(m.id)}
                        disabled={isAssigned}
                      />
                      <div className="flex-1">
                        <p className="font-medium">{m.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {ASNAF_LABELS[m.asnaf] || m.asnaf}
                          {isAssigned && " • Sudah ditugaskan"}
                        </p>
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

      {/* Delivery Status Dialog */}
      <Dialog open={isDeliveryDialogOpen} onOpenChange={setIsDeliveryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Status Pengiriman</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Mustahik</p>
              <p className="font-medium">{editingAssignment?.mustahik?.name}</p>
            </div>
            
            <div className="space-y-2">
              <Label>Status Pengiriman</Label>
              <div className="flex gap-2">
                <Button
                  variant={deliveryStatus === "delivered" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setDeliveryStatus("delivered")}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Terkirim
                </Button>
                <Button
                  variant={deliveryStatus === "not_delivered" ? "destructive" : "outline"}
                  className="flex-1"
                  onClick={() => setDeliveryStatus("not_delivered")}
                >
                  <XCircle className="h-4 w-4 mr-2" />
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
                onChange={(e) => setDeliveryNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeliveryDialogOpen(false)}>
              Batal
            </Button>
            <Button 
              onClick={() => updateDeliveryMutation.mutate()}
              disabled={updateDeliveryMutation.isPending}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

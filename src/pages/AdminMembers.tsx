import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Edit, Shield, UserCog, UserPlus } from "lucide-react";
import { 
  AppRole, 
  ROLE_LABELS, 
  ADMIN_ROLES, 
} from "@/lib/roles";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

interface UserWithRole {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole | null;
  created_at: string;
}

// Roles that can be assigned by admins (excludes super_admin which is protected)
const ASSIGNABLE_ROLES: AppRole[] = [
  "chairman",
  "secretary",
  "treasurer",
  "zakat_officer",
  "fidyah_officer",
  "viewer",
];

export default function AdminMembers() {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole>("viewer");
  
  // Add user form state
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserFullName, setNewUserFullName] = useState("");
  const [newUserRole, setNewUserRole] = useState<AppRole>("viewer");

  const { toast } = useToast();
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  
  const canManageUsers = hasRole("super_admin");

  // Fetch all users with their roles
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-members"],
    queryFn: async () => {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch all user roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*");

      if (rolesError) throw rolesError;

      // Combine profiles with their primary role
      return profiles.map((profile) => {
        const userRoles = roles.filter((r) => r.user_id === profile.id);
        // Get highest priority role
        const primaryRole = userRoles.find((r) => r.role === "super_admin")?.role ||
          userRoles.find((r) => r.role === "chairman")?.role ||
          userRoles.find((r) => r.role === "secretary")?.role ||
          userRoles.find((r) => r.role === "treasurer")?.role ||
          userRoles.find((r) => r.role === "zakat_officer")?.role ||
          userRoles.find((r) => r.role === "fidyah_officer")?.role ||
          userRoles.find((r) => r.role === "viewer")?.role ||
          null;

        return {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          role: primaryRole as AppRole | null,
          created_at: profile.created_at,
        };
      });
    },
    enabled: canManageUsers,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      // Delete existing non-super_admin roles
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .neq("role", "super_admin");

      if (deleteError) throw deleteError;

      // Insert new role
      const { error: insertError } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: newRole });

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
      setIsEditDialogOpen(false);
      setEditingUser(null);
      toast({ title: "Role berhasil diperbarui" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: error.message });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async ({
      email,
      password,
      full_name,
      role,
    }: {
      email: string;
      password: string;
      full_name: string;
      role: AppRole;
    }) => {
      const parseEdgeError = async (error: Error & { context?: unknown }) => {
        const parsed = {
          message: error.message,
          code: "",
          notFound: false,
          networkFailure: error.message.includes("Failed to send a request to the Edge Function"),
        };

        try {
          const res = error.context;
          if (res instanceof Response) {
            const payload = await res.json().catch(() => null);
            if (payload && typeof payload === "object") {
              const payloadCode = "code" in payload && typeof payload.code === "string" ? payload.code : "";
              const payloadMessage = "error" in payload && typeof payload.error === "string" ? payload.error : "";
              parsed.code = payloadCode;
              parsed.message = payloadMessage || parsed.message;
              parsed.notFound = payloadCode === "NOT_FOUND" || res.status === 404;
            }
          }
        } catch {
          // Keep best-effort parsed value.
        }

        return parsed;
      };

      const updateUserRole = async (createdUserId: string) => {
        const { error: deleteError } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", createdUserId)
          .neq("role", "super_admin");

        if (deleteError) throw deleteError;

        const { error: roleInsertError } = await supabase
          .from("user_roles")
          .insert({ user_id: createdUserId, role });

        if (roleInsertError) throw roleInsertError;
      };

      // Primary path: Edge Function (recommended for immediate confirmed account)
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { email, password, full_name, role },
      });

      if (!error) {
        if (data?.error) throw new Error(data.error);
        return data;
      }

      const edgeError = await parseEdgeError(error as Error & { context?: unknown });

      // Fallback path: direct signUp when function isn't reachable/not deployed.
      if (edgeError.notFound || edgeError.networkFailure) {
        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
          throw new Error(
            "Edge Function create-user tidak tersedia, dan konfigurasi fallback Supabase client tidak lengkap.",
          );
        }

        const isolatedClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });

        const { data: signUpData, error: signUpError } = await isolatedClient.auth.signUp({
          email,
          password,
          options: { data: { full_name } },
        });

        if (signUpError) throw signUpError;

        const createdUserId = signUpData.user?.id;
        if (!createdUserId) {
          throw new Error("User berhasil dibuat tapi ID user tidak ditemukan");
        }

        // Ensure profile name is populated.
        const { error: profileUpdateError } = await supabase
          .from("profiles")
          .update({ full_name })
          .eq("id", createdUserId);
        if (profileUpdateError) throw profileUpdateError;

        await updateUserRole(createdUserId);

        return {
          success: true,
          user: { id: createdUserId, email },
          message:
            "User berhasil dibuat via fallback signUp. Jika email confirmation aktif, user perlu verifikasi email dulu.",
          usedFallback: true,
        };
      }

      throw new Error(edgeError.message || "Gagal membuat user");
    },
    onSuccess: (result: { usedFallback?: boolean } | undefined) => {
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
      setIsAddDialogOpen(false);
      resetAddForm();
      toast({ 
        title: "Pengguna berhasil dibuat",
        description: result?.usedFallback
          ? "Pengguna dibuat via fallback signUp. Jika konfirmasi email aktif di Supabase, user perlu verifikasi email."
          : "Pengguna dapat langsung login dengan email dan password yang diberikan."
      });
    },
    onError: (error: Error) => {
      const msg = error.message;
      const message = msg.includes("User already exists") || msg.includes("already been registered") || msg.includes("already exists")
        ? "User already exists"
        : msg.includes("at least 6")
        ? "Password must be at least 6 characters"
        : msg.includes("Edge Function")
        ? "Edge Function create-user belum tersedia. Jalankan: supabase functions deploy create-user"
        : msg;
      toast({ variant: "destructive", title: "Failed to create user", description: message });
    },
  });

  const resetAddForm = () => {
    setNewUserEmail("");
    setNewUserPassword("");
    setNewUserFullName("");
    setNewUserRole("viewer");
  };

  const handleEdit = (user: UserWithRole) => {
    // Cannot edit super_admin
    if (user.role === "super_admin") {
      toast({ variant: "destructive", title: "Tidak dapat mengubah Super Admin" });
      return;
    }
    setEditingUser(user);
    setSelectedRole(user.role || "viewer");
    setIsEditDialogOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
      updateRoleMutation.mutate({ userId: editingUser.id, newRole: selectedRole });
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword || !newUserFullName) {
      toast({ variant: "destructive", title: "Semua field wajib diisi" });
      return;
    }
    if (newUserPassword.length < 6) {
      toast({ variant: "destructive", title: "Password minimal 6 karakter" });
      return;
    }
    createUserMutation.mutate({ 
      email: newUserEmail, 
      password: newUserPassword,
      full_name: newUserFullName, 
      role: newUserRole 
    });
  };

  const getRoleBadgeVariant = (role: AppRole | null): "default" | "secondary" | "outline" => {
    if (!role) return "outline";
    if (ADMIN_ROLES.includes(role)) return "default";
    return "secondary";
  };

  const getRoleCategory = (role: AppRole | null): string => {
    if (!role) return "Tidak Ada";
    if (ADMIN_ROLES.includes(role)) return "Admin";
    return "Petugas";
  };

  const columns: Column<UserWithRole>[] = [
    {
      key: "full_name",
      header: "Nama",
      render: (u) => u.full_name || "-",
    },
    {
      key: "email",
      header: "Email",
      render: (u) => u.email || "-",
    },
    {
      key: "role",
      header: "Role",
      render: (u) => (
        <Badge variant={getRoleBadgeVariant(u.role)}>
          {u.role ? ROLE_LABELS[u.role] : "Tidak Ada"}
        </Badge>
      ),
    },
    {
      key: "category",
      header: "Kategori",
      render: (u) => (
        <span className="text-muted-foreground text-sm">
          {getRoleCategory(u.role)}
        </span>
      ),
    },
  ];

  // Super-admin-equivalent roles can access
  if (!canManageUsers) {
    return (
      <AppLayout title="Akses Ditolak">
        <div className="flex flex-col items-center justify-center py-12">
          <Shield className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Anda tidak memiliki akses ke halaman ini.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Manajemen Pengguna">
      <DataTable
        title="Daftar Pengguna"
        data={users}
        columns={columns}
        isLoading={isLoading}
        searchKey="full_name"
        searchPlaceholder="Cari pengguna..."
        emptyMessage="Belum ada pengguna"
        onAdd={() => setIsAddDialogOpen(true)}
        addLabel="Tambah Pengguna"
        actions={(user) => (
          <div className="flex gap-1">
            {user.role !== "super_admin" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleEdit(user)}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      />

      {/* Edit Role Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              Ubah Role Pengguna
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Pengguna</Label>
              <p className="text-sm text-muted-foreground">
                {editingUser?.full_name || editingUser?.email}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      <div className="flex items-center gap-2">
                        <span>{ROLE_LABELS[role]}</span>
                        <span className="text-xs text-muted-foreground">
                          ({ADMIN_ROLES.includes(role) ? "Admin" : "Petugas"})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Admin: Akses penuh ke semua fitur termasuk manajemen periode.
                <br />
                Petugas: Akses ke semua fitur kecuali membuat/mengedit periode.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={updateRoleMutation.isPending}>
                Simpan
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
        setIsAddDialogOpen(open);
        if (!open) resetAddForm();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Tambah Pengguna Baru
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                placeholder="Minimal 6 karakter"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="full_name">Nama Lengkap *</Label>
              <Input
                id="full_name"
                placeholder="Nama lengkap pengguna"
                value={newUserFullName}
                onChange={(e) => setNewUserFullName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new_role">Role</Label>
              <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      <div className="flex items-center gap-2">
                        <span>{ROLE_LABELS[role]}</span>
                        <span className="text-xs text-muted-foreground">
                          ({ADMIN_ROLES.includes(role) ? "Admin" : "Petugas"})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? "Membuat..." : "Buat Pengguna"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

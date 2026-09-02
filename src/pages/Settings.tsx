import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MASJID_ADDRESS, MASJID_NAME } from "@/lib/masjidProfile";
import { Building2, Mail, Settings as SettingsIcon, Shield, User } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  chairman: "Ketua",
  secretary: "Sekretaris",
  treasurer: "Bendahara",
  zakat_officer: "Petugas Zakat",
  fidyah_officer: "Petugas Fidyah",
  viewer: "Pengamat",
};

export default function Settings() {
  const { profile, roles } = useAuth();
  const initial = profile?.full_name?.charAt(0)?.toUpperCase() || "U";

  return (
    <AppLayout title="Pengaturan">
      <div className="space-y-4">
        <PageHeader
          title="Pengaturan"
          description="Informasi akun, peran akses, dan identitas lembaga yang dipakai pada laporan."
          icon={SettingsIcon}
        />

        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4 text-primary" />
                Profil pengguna
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/25 p-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-lg font-semibold text-primary">
                  {initial}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{profile?.full_name || "-"}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    {profile?.email || "-"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4 text-primary" />
                Peran & akses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {roles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <Badge key={role} variant="secondary" className="rounded-full px-3 py-1">
                      {ROLE_LABELS[role] || role.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Belum ada peran yang diberikan.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-primary" />
                Identitas lembaga
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="rounded-2xl border border-border/60 bg-muted/25 p-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Nama masjid</p>
                <p className="mt-0.5 text-sm font-semibold">{MASJID_NAME}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/25 p-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Alamat</p>
                <p className="mt-0.5 text-sm">{MASJID_ADDRESS}</p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Nilai ini dipakai pada kop laporan PDF dan Excel. Ubah melalui variabel lingkungan
                <code className="mx-1 rounded bg-muted px-1">NEXT_PUBLIC_MASJID_NAME</code> dan
                <code className="mx-1 rounded bg-muted px-1">NEXT_PUBLIC_MASJID_ADDRESS</code>.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

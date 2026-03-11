import Link from "next/link";
import { useRouter } from "next/router";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { usePeriod } from "@/contexts/PeriodContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Calendar,
  Users,
  UserCheck,
  Wheat,
  Coins,
  Heart,
  Package,
  FileBarChart,
  Settings,
  LogOut,
  Shield,
  Lock,
  UserCog,
} from "lucide-react";

const mainNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Periode", url: "/periods", icon: Calendar },
];

const dataNavItems = [
  { title: "Muzakki", url: "/muzakki", icon: Users },
  { title: "Anggota", url: "/members", icon: UserCheck },
  { title: "Mustahik", url: "/mustahik", icon: Heart },
  { title: "Asnaf", url: "/settings/asnaf", icon: Users },
];

const transactionNavItems = [
  { title: "Zakat Fitrah", url: "/zakat-fitrah", icon: Wheat },
  { title: "Zakat Mal", url: "/zakat-mal", icon: Coins },
  { title: "Fidyah", url: "/fidyah", icon: Heart },
  { title: "Distribusi", url: "/distribution", icon: Package },
];

const reportNavItems = [
  { title: "Laporan", url: "/reports", icon: FileBarChart },
  { title: "Pengaturan", url: "/settings", icon: Settings },
];

const adminNavItems = [
  { title: "Pengguna", url: "/admin/members", icon: UserCog },
];

export function AppSidebar() {
  const router = useRouter();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { profile, signOut, hasRole } = useAuth();
  const { periods, selectedPeriod, setSelectedPeriodId, isReadOnly } = usePeriod();
  const currentPath = router.asPath.split("?")[0];

  const isActive = (path: string) => currentPath === path;

  const NavItem = ({ item }: { item: (typeof mainNavItems)[0] }) => (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <Link
          href={item.url}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 transition-all",
            "hover:bg-accent hover:text-accent-foreground",
            isActive(item.url) && "bg-primary/10 text-primary font-medium"
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{item.title}</span>}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Shield className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-foreground">ZIS Manager</span>
              <span className="text-xs text-muted-foreground">Zakat, Infaq, Sedekah</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        {/* Period Selector */}
        {!collapsed && (
          <div className="mb-4 px-2">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Periode Aktif</span>
              {isReadOnly && <Lock className="h-3 w-3 text-warning" />}
            </div>
            <Select
              value={selectedPeriod?.id || ""}
              onValueChange={setSelectedPeriodId}
            >
              <SelectTrigger className="w-full text-sm">
                <SelectValue placeholder="Pilih periode" />
              </SelectTrigger>
              <SelectContent>
                {periods.map((period) => (
                  <SelectItem key={period.id} value={period.id}>
                    <div className="flex items-center gap-2">
                      <span>{period.name}</span>
                      {period.status === "archived" && (
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isReadOnly && (
              <p className="mt-1 text-xs text-warning">Mode baca saja</p>
            )}
          </div>
        )}

        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs">Menu Utama</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <NavItem key={item.url} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Data Management */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs">Data Master</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dataNavItems.map((item) => (
                <NavItem key={item.url} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Transactions */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs">Transaksi</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {transactionNavItems.map((item) => (
                <NavItem key={item.url} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Reports & Settings */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs">Lainnya</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {reportNavItems.map((item) => (
                <NavItem key={item.url} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Super Admin Only */}
        {hasRole('super_admin') && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs">Administrasi</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNavItems.map((item) => (
                  <NavItem key={item.url} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary text-sm">
              {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile?.full_name || "User"}</p>
              <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
            </div>
          )}
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

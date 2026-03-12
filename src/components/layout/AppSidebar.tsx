import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useRef } from "react";
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
  LucideIcon,
  LayoutDashboard,
  Calendar,
  Users,
  Wheat,
  Coins,
  Heart,
  Package,
  FileBarChart,
  Settings,
  LogOut,
  Lock,
  UserCog,
  Calculator,
} from "lucide-react";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  children?: Array<{ title: string; url: string }>;
}

const mainNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Periode", url: "/periods", icon: Calendar },
];

const dataNavItems: NavItem[] = [
  {
    title: "Muzakki",
    url: "/muzakki",
    icon: Users,
    children: [
      { title: "Data Muzakki", url: "/muzakki" },
      { title: "Anggota Keluarga", url: "/members" },
    ],
  },
  { title: "Mustahik", url: "/mustahik", icon: Heart },
  { title: "Asnaf", url: "/settings/asnaf", icon: Users },
];

const transactionNavItems = [
  { title: "Zakat Fitrah", url: "/zakat-fitrah", icon: Wheat },
  { title: "Zakat Mal", url: "/zakat-mal", icon: Coins },
  { title: "Fidyah", url: "/fidyah", icon: Heart },
  { title: "Perhitungan", url: "/calculations", icon: Calculator },
  { title: "Pendistribusian", url: "/distribution", icon: Package },
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
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const { profile, signOut, hasRole } = useAuth();
  const { periods, selectedPeriod, setSelectedPeriodId, isReadOnly } = usePeriod();
  const currentPath = router.asPath.split("?")[0];
  const sidebarContentRef = useRef<HTMLDivElement | null>(null);
  const sidebarScrollStorageKey = "zakatku:sidebar-scroll-top";

  const isActive = (path: string) => currentPath === path;
  const isGroupActive = (item: NavItem) =>
    isActive(item.url) || Boolean(item.children?.some((child) => isActive(child.url)));
  const handleNavigate = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || isMobile) return;

    const container = sidebarContentRef.current;
    if (!container) return;

    const savedValue = window.sessionStorage.getItem(sidebarScrollStorageKey);
    if (savedValue) {
      const parsed = Number(savedValue);
      if (Number.isFinite(parsed)) {
        container.scrollTop = parsed;
      }
    }

    const persistScroll = () => {
      window.sessionStorage.setItem(sidebarScrollStorageKey, String(container.scrollTop));
    };

    container.addEventListener("scroll", persistScroll, { passive: true });
    router.events.on("routeChangeStart", persistScroll);
    window.addEventListener("beforeunload", persistScroll);

    return () => {
      container.removeEventListener("scroll", persistScroll);
      router.events.off("routeChangeStart", persistScroll);
      window.removeEventListener("beforeunload", persistScroll);
    };
  }, [isMobile, router.events]);

  useEffect(() => {
    if (typeof window === "undefined" || isMobile) return;
    const container = sidebarContentRef.current;
    if (!container) return;

    const activeItem = container.querySelector<HTMLElement>('[data-nav-active="true"]');
    activeItem?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [currentPath, isMobile]);

  const NavItem = ({ item }: { item: NavItem }) => {
    if (item.children && !collapsed) {
      return (
        <SidebarMenuItem>
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all",
              isGroupActive(item)
                ? "bg-primary/12 text-primary"
                : "text-sidebar-foreground/90 hover:bg-sidebar-accent/80",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="font-medium">{item.title}</span>
          </div>
          <div className="ml-[1.65rem] mt-1 space-y-1 border-l border-sidebar-border/80 pl-3">
            {item.children.map((child) => (
              <Link
                key={child.url}
                href={child.url}
                scroll={false}
                onClick={handleNavigate}
                data-nav-active={isActive(child.url) ? "true" : undefined}
                className={cn(
                  "block rounded-xl px-2.5 py-1.5 text-sm transition-all duration-200",
                  isActive(child.url)
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground",
                )}
              >
                {child.title}
              </Link>
            ))}
          </div>
        </SidebarMenuItem>
      );
    }

    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild>
          <Link
            href={item.url}
            scroll={false}
            onClick={handleNavigate}
            data-nav-active={isGroupActive(item) ? "true" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-200",
              "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2",
              "hover:bg-sidebar-accent/80 hover:text-sidebar-foreground",
              isGroupActive(item) && "bg-primary text-primary-foreground shadow-sm shadow-primary/20",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="font-medium">{item.title}</span>}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border/70 bg-[linear-gradient(180deg,hsl(var(--sidebar))/0.98_0%,hsl(var(--sidebar-accent))/0.18_100%)] backdrop-blur-xl"
    >
      <SidebarHeader className="border-b border-sidebar-border/70 px-4 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-background shadow-md shadow-primary/15">
            <Image
              src="/logo.png"
              alt="AmanahZIS Logo"
              fill
              sizes="40px"
              className="object-cover"
              priority
            />
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-semibold text-foreground">AmanahZIS</span>
              <span className="truncate text-xs text-muted-foreground">Platform Operasional ZIS Masjid</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent ref={sidebarContentRef} className="px-2.5 py-4">
        {/* Period Selector */}
        {!collapsed && (
          <div className="mb-4 rounded-2xl border border-sidebar-border/70 bg-background/55 p-2.5 shadow-sm">
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
        <SidebarGroup className="p-1.5">
          <SidebarGroupLabel className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
            Menu Utama
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <NavItem key={item.url} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Data Management */}
        <SidebarGroup className="p-1.5">
          <SidebarGroupLabel className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
            Data Master
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dataNavItems.map((item) => (
                <NavItem key={item.url} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Transactions */}
        <SidebarGroup className="p-1.5">
          <SidebarGroupLabel className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
            Transaksi
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {transactionNavItems.map((item) => (
                <NavItem key={item.url} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Reports & Settings */}
        <SidebarGroup className="p-1.5">
          <SidebarGroupLabel className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
            Lainnya
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {reportNavItems.map((item) => (
                <NavItem key={item.url} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Super-admin-equivalent roles */}
        {hasRole('super_admin') && (
          <SidebarGroup className="p-1.5">
            <SidebarGroupLabel className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
              Administrasi
            </SidebarGroupLabel>
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

      <SidebarFooter className="border-t border-sidebar-border/70 bg-background/55 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center gap-3 rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/45 p-2.5">
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

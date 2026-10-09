import { ReactNode, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/hooks/useAuth";
import { usePeriod } from "@/contexts/PeriodContext";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Calculator,
  FileBarChart,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  type LucideIcon,
  Menu,
  Package,
  Settings,
  Wheat,
} from "lucide-react";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
}

const BOTTOM_NAV: { title: string; url: string; icon: LucideIcon }[] = [
  { title: "Beranda", url: "/dashboard", icon: LayoutDashboard },
  { title: "Fitrah", url: "/zakat-fitrah", icon: Wheat },
  { title: "Hitung", url: "/calculations", icon: Calculator },
  { title: "Salur", url: "/distribution", icon: Package },
  { title: "Laporan", url: "/reports", icon: FileBarChart },
];

/** Navigasi bawah khusus layar kecil supaya menu utama tidak perlu buka drawer. */
function MobileBottomNav() {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const currentPath = router.asPath.split("?")[0];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[60] border-t border-border/60 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <div className="grid grid-cols-6">
        {BOTTOM_NAV.map((item) => {
          const isActive = currentPath === item.url;
          return (
            <Link
              key={item.url}
              href={item.url}
              scroll={false}
              className={cn(
                "relative flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              {isActive && (
                <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-gradient-to-r from-primary/0 via-primary to-primary/0" />
              )}
              <item.icon className="h-[18px] w-[18px]" />
              <span className="truncate">{item.title}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          className="flex flex-col items-center gap-1 py-2 text-[10px] font-medium text-muted-foreground transition-colors active:text-primary"
        >
          <Menu className="h-[18px] w-[18px]" />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
}

function HeaderUserMenu() {
  const { profile, signOut } = useAuth();
  const initial = profile?.full_name?.charAt(0)?.toUpperCase() || "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-2 rounded-full border border-border/60 bg-background/70 px-1.5 pr-2.5 hover:bg-accent/60"
        >
          <Avatar className="h-6 w-6">
            <AvatarFallback className="bg-primary/15 text-[11px] font-semibold text-primary">{initial}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[120px] truncate text-xs font-medium lg:block">
            {profile?.full_name || "Pengguna"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="truncate text-sm font-semibold">{profile?.full_name || "Pengguna"}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{profile?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            Pengaturan
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppHeader({ title }: { title?: string }) {
  const { selectedPeriod, isReadOnly } = usePeriod();

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-[60] flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-2.5 px-3 pt-[env(safe-area-inset-top)] sm:gap-4 sm:px-6 md:sticky md:inset-x-auto md:z-50 md:h-16 md:pt-0 lg:px-8",
        "border-b border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65",
        "after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-gradient-to-r after:from-transparent after:via-primary/35 after:to-transparent",
      )}
    >
      <SidebarTrigger className="-ml-1 h-9 w-9 shrink-0 rounded-xl border border-border/60 bg-background/70 transition-colors hover:bg-accent/60" />

      <div className="min-w-0 flex-1">
        {title && (
          <>
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-foreground sm:text-lg">{title}</h1>
            <p className="hidden text-[11px] text-muted-foreground sm:block">
              Operasional zakat fitrah, zakat mal, dan fidyah
            </p>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {selectedPeriod && (
          <span
            className={cn(
              "hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium sm:inline-flex",
              isReadOnly
                ? "border-amber-300/70 bg-amber-50 text-amber-700"
                : "border-primary/25 bg-primary/10 text-primary",
            )}
          >
            {isReadOnly ? <Lock className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            <span className="max-w-[140px] truncate">{selectedPeriod.name}</span>
          </span>
        )}
        <HeaderUserMenu />
      </div>
    </header>
  );
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const lastScrollRef = useRef(0);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storageKey = "zakatku:scroll-positions";
    const readPositions = () => {
      try {
        const parsed = JSON.parse(window.sessionStorage.getItem(storageKey) || "{}") as Record<string, number>;
        return parsed;
      } catch {
        return {} as Record<string, number>;
      }
    };
    const writePositions = (positions: Record<string, number>) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(positions));
    };

    const saveCurrentPosition = (path: string) => {
      const positions = readPositions();
      positions[path] = window.scrollY;
      writePositions(positions);
    };

    const restorePosition = (path: string) => {
      const positions = readPositions();
      const savedY = positions[path];
      const targetY = typeof savedY === "number" ? savedY : lastScrollRef.current;
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: targetY, behavior: "auto" });
      });
    };

    const handleRouteStart = () => {
      lastScrollRef.current = window.scrollY;
      saveCurrentPosition(router.asPath);
    };
    const handleRouteComplete = (url: string) => {
      restorePosition(url);
    };

    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    router.events.on("routeChangeStart", handleRouteStart);
    router.events.on("routeChangeComplete", handleRouteComplete);

    return () => {
      router.events.off("routeChangeStart", handleRouteStart);
      router.events.off("routeChangeComplete", handleRouteComplete);
    };
  }, [router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="relative flex min-h-[100dvh] w-full overflow-x-hidden bg-background">
        {/* Latar dekoratif */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -right-[10%] -top-[15%] h-[38rem] w-[38rem] rounded-full bg-primary/[0.07] blur-[120px] animate-aurora" />
          <div
            className="absolute -bottom-[20%] -left-[10%] h-[32rem] w-[32rem] rounded-full bg-sky-500/[0.06] blur-[120px] animate-aurora"
            style={{ animationDelay: "-9s" }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--foreground)/0.025)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--foreground)/0.025)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
        </div>

        <AppSidebar />

        <main className="relative min-w-0 flex-1 overflow-x-hidden">
          <AppHeader title={title} />

          <div className="px-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-[calc(3.5rem+env(safe-area-inset-top)+0.75rem)] sm:px-6 sm:pt-[calc(3.5rem+env(safe-area-inset-top)+1rem)] md:px-6 md:pb-8 md:pt-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1600px] animate-fade-in">{children}</div>
          </div>
        </main>

        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
}

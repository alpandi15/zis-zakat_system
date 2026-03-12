import { ReactNode, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/hooks/useAuth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Loader2 } from "lucide-react";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
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
      <div className="relative flex min-h-[100dvh] w-full overflow-x-hidden bg-[radial-gradient(1200px_circle_at_100%_0%,hsl(var(--primary)/0.08),transparent_40%),radial-gradient(900px_circle_at_0%_100%,hsl(196_90%_45%/0.06),transparent_35%),hsl(var(--background))]">
        <AppSidebar />
        <main className="relative min-w-0 flex-1 overflow-x-hidden">
          <header className="fixed inset-x-0 top-0 z-[60] flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-3 border-b border-border/60 bg-background/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 sm:gap-4 sm:px-6 md:sticky md:inset-x-auto md:z-50 md:h-16 md:pt-0 lg:px-8">
            <SidebarTrigger className="-ml-1 h-8 w-8 rounded-full border border-border/60 bg-background/70" />
            {title && (
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-semibold tracking-tight text-foreground sm:text-lg">
                  {title}
                </h1>
                <p className="hidden text-[11px] text-muted-foreground sm:block">
                  Operasional zakat fitrah, zakat mal, dan fidyah
                </p>
              </div>
            )}
          </header>
          <div className="px-3 pb-3 pt-[calc(3.5rem+env(safe-area-inset-top)+0.75rem)] sm:px-6 sm:pb-6 sm:pt-[calc(3.5rem+env(safe-area-inset-top)+1rem)] md:px-6 md:py-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1600px] animate-fade-in">{children}</div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

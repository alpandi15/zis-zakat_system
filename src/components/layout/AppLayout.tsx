import { ReactNode, useEffect } from "react";
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

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-[radial-gradient(1200px_circle_at_100%_0%,hsl(var(--primary)/0.08),transparent_40%),radial-gradient(900px_circle_at_0%_100%,hsl(196_90%_45%/0.06),transparent_35%),hsl(var(--background))]">
        <AppSidebar />
        <main className="relative flex-1 overflow-x-hidden">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55 sm:px-6 lg:px-8">
            <SidebarTrigger className="-ml-1 h-8 w-8 rounded-full border border-border/60 bg-background/70" />
            {title && (
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
                  {title}
                </h1>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  Operasional zakat fitrah, zakat mal, dan fidyah
                </p>
              </div>
            )}
          </header>
          <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1600px] animate-fade-in">{children}</div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

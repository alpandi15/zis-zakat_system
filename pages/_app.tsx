import type { AppProps } from "next/app";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { PeriodProvider } from "@/contexts/PeriodContext";
import "../src/index.css";

export default function MyApp({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <PeriodProvider>
            <Toaster />
            <Sonner />
            <Component {...pageProps} />
          </PeriodProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

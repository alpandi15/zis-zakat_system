import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export function useDashboardRealtime(p0: () => void) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "zakat_fitrah_transactions" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "zakat_mal_transactions" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fidyah_transactions" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "zakat_distributions" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fidyah_distributions" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
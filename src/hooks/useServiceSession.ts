import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ServiceSession {
  id: string;
  opened_at: string;
  scheduled_close_at: string | null;
  closed_at: string | null;
  note: string | null;
}

/** Sesi layanan hari ini beserta aksi buka dan tutup loket. */
export function useServiceSession() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["service-sessions"],
    queryFn: async () => {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("service_sessions")
        .select("id, opened_at, scheduled_close_at, closed_at, note")
        .gte("opened_at", startOfToday.toISOString())
        .order("opened_at", { ascending: true });

      if (error) throw error;
      return data as ServiceSession[];
    },
  });

  /** Sesi yang masih terbuka bisa saja dimulai kemarin, jadi dicari terpisah. */
  const { data: openSession = null } = useQuery({
    queryKey: ["service-session-open"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_sessions")
        .select("id, opened_at, scheduled_close_at, closed_at, note")
        .is("closed_at", null)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data as ServiceSession | null) ?? null;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["service-sessions"] });
    queryClient.invalidateQueries({ queryKey: ["service-session-open"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
  };

  const openMutation = useMutation({
    mutationFn: async (input: { scheduledCloseAt?: string | null; note?: string | null }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("service_sessions").insert({
        opened_at: new Date().toISOString(),
        scheduled_close_at: input.scheduledCloseAt || null,
        note: input.note?.trim() || null,
        opened_by: user?.id || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Layanan dibuka" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal membuka layanan", description: error.message });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("service_sessions")
        .update({ closed_at: new Date().toISOString(), closed_by: user?.id || null })
        .eq("id", sessionId)
        .is("closed_at", null);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Layanan ditutup" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Gagal menutup layanan", description: error.message });
    },
  });

  return {
    sessions,
    openSession,
    isOpen: Boolean(openSession),
    isLoading,
    openMutation,
    closeMutation,
  };
}

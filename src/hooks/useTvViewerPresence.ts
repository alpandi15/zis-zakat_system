import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TvViewerPresenceItem {
  id: string;
  page: string | null;
  periodId: string | null;
  onlineAt: string | null;
  deviceType: string | null;
  deviceLabel: string | null;
  browser: string | null;
  os: string | null;
  viewport: string | null;
  path: string | null;
}

interface PresenceMeta {
  page?: string | null;
  period_id?: string | null;
  online_at?: string | null;
  device_type?: string | null;
  device_label?: string | null;
  browser?: string | null;
  os?: string | null;
  viewport?: string | null;
  path?: string | null;
}

export function useTvViewerPresence(enabled = true) {
  const [viewers, setViewers] = useState<TvViewerPresenceItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setViewers([]);
      setIsConnected(false);
      return;
    }

    const channel = supabase.channel("public-tv-watchers", {
      config: {
        presence: {},
      },
    });

    const syncPresence = () => {
      const state = channel.presenceState<PresenceMeta>();
      const flattened = Object.entries(state)
        .flatMap(([key, metas]) =>
          metas.map((meta) => ({
            id: key,
            page: meta.page || null,
            periodId: meta.period_id || null,
            onlineAt: meta.online_at || null,
            deviceType: meta.device_type || null,
            deviceLabel: meta.device_label || null,
            browser: meta.browser || null,
            os: meta.os || null,
            viewport: meta.viewport || null,
            path: meta.path || null,
          })),
        )
        .filter((item) => item.page === "tv")
        .sort((a, b) => {
          const aTime = a.onlineAt ? new Date(a.onlineAt).getTime() : 0;
          const bTime = b.onlineAt ? new Date(b.onlineAt).getTime() : 0;
          return aTime - bTime;
        });

      setViewers(flattened);
    };

    channel.on("presence", { event: "sync" }, syncPresence);

    channel.subscribe((status) => {
      setIsConnected(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") {
        syncPresence();
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled]);

  const viewerCount = useMemo(() => viewers.length, [viewers]);

  return {
    viewers,
    viewerCount,
    isConnected,
  };
}

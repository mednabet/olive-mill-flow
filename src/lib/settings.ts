/**
 * Helpers pour lire les paramètres système stockés dans la table `settings`.
 * Cache court via TanStack Query côté composants.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ScaleConfig {
  url: string;
}
export interface WeighingConfig {
  enabled: boolean;
}

export function useScaleConfig() {
  return useQuery({
    queryKey: ["settings", "scale.websocket_url"],
    queryFn: async (): Promise<ScaleConfig> => {
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "scale.websocket_url")
        .maybeSingle();
      const v = data?.value as ScaleConfig | null;
      return { url: v?.url ?? "ws://localhost:9001" };
    },
    staleTime: 60_000,
  });
}

export function useAllowManualConfig() {
  return useQuery({
    queryKey: ["settings", "weighing.allow_manual_for_peseur"],
    queryFn: async (): Promise<WeighingConfig> => {
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "weighing.allow_manual_for_peseur")
        .maybeSingle();
      const v = data?.value as WeighingConfig | null;
      return { enabled: v?.enabled ?? true };
    },
    staleTime: 60_000,
  });
}

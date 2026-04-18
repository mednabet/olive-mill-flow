/**
 * Helpers pour lire les paramètres système et le référentiel des balances.
 * Cache court via TanStack Query côté composants.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Scale = Database["public"]["Tables"]["scales"]["Row"];

export interface WeighingConfig {
  enabled: boolean;
}

/** Liste des balances actives (référentiel multi-ponts bascules). */
export function useScales(includeInactive = false) {
  return useQuery({
    queryKey: ["scales", includeInactive],
    queryFn: async (): Promise<Scale[]> => {
      let q = supabase.from("scales").select("*").order("name", { ascending: true });
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

/** Récupère une balance par son id. */
export function useScale(id: string | null | undefined) {
  return useQuery({
    queryKey: ["scale", id],
    queryFn: async (): Promise<Scale | null> => {
      if (!id) return null;
      const { data } = await supabase.from("scales").select("*").eq("id", id).maybeSingle();
      return data ?? null;
    },
    enabled: !!id,
    staleTime: 30_000,
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

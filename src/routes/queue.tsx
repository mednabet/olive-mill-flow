/**
 * Module File d'attente : dossiers en attente d'écrasement.
 * - Tri par priorité (urgent > high > normal) puis position
 * - Affectation à une ligne disponible
 * - Démarrage écrasement (status -> in_progress)
 * - Refresh périodique 10s
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ListOrdered, Play, Factory } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { RequireRole } from "@/components/RequireRole";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatKg } from "@/lib/format";
import { QueueFileArrivalsButton } from "@/components/crushing/QueueFileArrivalsButton";

type CrushingFile = Database["public"]["Tables"]["crushing_files"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Line = Database["public"]["Tables"]["crushing_lines"]["Row"];
type Priority = Database["public"]["Enums"]["priority_level"];
type Status = Database["public"]["Enums"]["crushing_status"];

interface EnrichedFile extends CrushingFile {
  client: Client | null;
  line: Line | null;
}

const PRIO_TONE: Record<Priority, "info" | "warning" | "danger"> = {
  normal: "info",
  high: "warning",
  urgent: "danger",
};
const PRIO_LABEL: Record<Priority, TranslationKey> = {
  normal: "crushing.priority.normal",
  high: "crushing.priority.high",
  urgent: "crushing.priority.urgent",
};
const PRIO_ORDER: Record<Priority, number> = { urgent: 0, high: 1, normal: 2 };

export const Route = createFileRoute("/queue")({
  component: () => (
    <RequireRole roles={["admin", "superviseur", "peseur", "operateur"]}>
      <QueuePage />
    </RequireRole>
  ),
});

function QueuePage() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const { data: files, isLoading } = useQuery({
    queryKey: ["queue-files"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crushing_files")
        .select("*, client:clients(*), line:crushing_lines!assigned_line_id(*)")
        .in("status", ["queued", "assigned"])
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      const list = (data as unknown as EnrichedFile[]).slice();
      list.sort((a, b) => {
        const p = PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority];
        if (p !== 0) return p;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      return list;
    },
    refetchInterval: 10_000,
  });

  const { data: lines } = useQuery({
    queryKey: ["lines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crushing_lines")
        .select("*")
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return data;
    },
  });

  const setPriority = useMutation({
    mutationFn: async ({ id, priority }: { id: string; priority: Priority }) => {
      const { error } = await supabase.from("crushing_files").update({ priority }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queue-files"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const assignLine = useMutation({
    mutationFn: async ({ id, line_id }: { id: string; line_id: string | null }) => {
      const { error } = await supabase
        .from("crushing_files")
        .update({
          assigned_line_id: line_id,
          status: line_id ? ("assigned" as Status) : ("queued" as Status),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queue-files"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const startCrushing = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("crushing_files")
        .update({ status: "in_progress" as Status, started_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["queue-files"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success(t("crushing.start"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader title={t("queue.title")} subtitle={t("queue.subtitle")} icon={<ListOrdered className="h-5 w-5" />} />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : !files || files.length === 0 ? (
        <EmptyState icon={<ListOrdered className="h-5 w-5" />} title={t("queue.empty")} />
      ) : (
        <ol className="space-y-2">
          {files.map((f, idx) => (
            <li key={f.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-4 p-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-lg font-bold tabular">
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-base font-bold tabular tracking-wide">{f.tracking_code}</span>
                      <StatusBadge tone={PRIO_TONE[f.priority]}>{t(PRIO_LABEL[f.priority])}</StatusBadge>
                      {f.line && <StatusBadge tone="info">{t("common.line")}: {f.line.code}</StatusBadge>}
                    </div>
                    <div className="mt-1 truncate text-sm">
                      {f.client ? (
                        <>
                          <span className="font-medium">{f.client.full_name}</span>
                          <span className="ms-2 font-mono text-xs text-muted-foreground tabular">{f.client.code}</span>
                        </>
                      ) : <span className="italic text-muted-foreground">—</span>}
                    </div>
                    {f.net_weight_kg !== null && (
                      <div className="mt-0.5 text-xs text-muted-foreground tabular">
                        {t("weigh.net")}: <span className="font-bold text-foreground">{formatKg(f.net_weight_kg)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={f.priority}
                      onValueChange={(v) => setPriority.mutate({ id: f.id, priority: v as Priority })}
                    >
                      <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(["normal", "high", "urgent"] as Priority[]).map((p) => (
                          <SelectItem key={p} value={p}>{t(PRIO_LABEL[p])}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={f.assigned_line_id ?? "__none"}
                      onValueChange={(v) => assignLine.mutate({ id: f.id, line_id: v === "__none" ? null : v })}
                    >
                      <SelectTrigger className="w-[160px]"><SelectValue placeholder={t("crushing.assign_line")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— {t("crushing.assign_line")}</SelectItem>
                        {lines?.map((l) => (
                          <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {f.status === "assigned" && (
                      <Button onClick={() => startCrushing.mutate(f.id)} disabled={startCrushing.isPending}>
                        <Play className="me-1 h-4 w-4" />
                        {t("crushing.start")}
                      </Button>
                    )}

                    <QueueFileArrivalsButton fileId={f.id} clientId={f.client?.id ?? null} />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Module Écrasement : crée des dossiers depuis une arrivée pesée,
 * affiche en cours / terminés / annulés.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Factory, Plus, CheckCircle2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { RequireRole } from "@/components/RequireRole";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatKg, formatDateTime } from "@/lib/format";

type CrushingFile = Database["public"]["Tables"]["crushing_files"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Line = Database["public"]["Tables"]["crushing_lines"]["Row"];
type Arrival = Database["public"]["Tables"]["arrivals"]["Row"];
type Weighing = Database["public"]["Tables"]["weighings"]["Row"];
type Status = Database["public"]["Enums"]["crushing_status"];

interface EnrichedFile extends CrushingFile {
  client: Client | null;
  line: Line | null;
}

const STATUS_LABEL: Record<Status, TranslationKey> = {
  queued: "crushing.status.queued",
  assigned: "crushing.status.assigned",
  in_progress: "crushing.status.in_progress",
  completed: "crushing.status.completed",
  cancelled: "crushing.status.cancelled",
};

const STATUS_TONE: Record<Status, "info" | "warning" | "success" | "danger" | "muted"> = {
  queued: "info",
  assigned: "warning",
  in_progress: "warning",
  completed: "success",
  cancelled: "muted",
};

export const Route = createFileRoute("/crushing")({
  component: () => (
    <RequireRole roles={["admin", "superviseur", "operateur"]}>
      <CrushingPage />
    </RequireRole>
  ),
});

function CrushingPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"active" | "completed" | "all">("active");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);

  const { data: files, isLoading } = useQuery({
    queryKey: ["crushing-files", filter],
    queryFn: async () => {
      let q = supabase
        .from("crushing_files")
        .select("*, client:clients(*), line:crushing_lines!assigned_line_id(*)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter === "active") q = q.in("status", ["queued", "assigned", "in_progress"]);
      else if (filter === "completed") q = q.eq("status", "completed");
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as EnrichedFile[];
    },
    refetchInterval: 15_000,
  });

  const filtered = useMemo(() => {
    if (!files) return [];
    const s = search.trim().toLowerCase();
    if (!s) return files;
    return files.filter(
      (f) =>
        f.tracking_code.toLowerCase().includes(s) ||
        (f.client?.full_name.toLowerCase().includes(s) ?? false),
    );
  }, [files, search]);

  const complete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("crushing_files")
        .update({ status: "completed" as Status, completed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crushing-files"] });
      qc.invalidateQueries({ queryKey: ["queue-files"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success(t("crushing.completed_at"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("crushing.title")}
        subtitle={t("crushing.subtitle")}
        icon={<Factory className="h-5 w-5" />}
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus className="me-1 h-4 w-4" />
            {t("weigh.create_crushing")}
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="active">{t("dash.in_progress")}</TabsTrigger>
            <TabsTrigger value="completed">{t("crushing.status.completed")}</TabsTrigger>
            <TabsTrigger value="all">{t("common.all")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("common.search")} className="ps-9" />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Factory className="h-5 w-5" />} title={t("crushing.empty")} />
      ) : (
        <ul className="space-y-2">
          {filtered.map((f) => (
            <li key={f.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-4 p-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Factory className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-base font-bold tabular tracking-wide">{f.tracking_code}</span>
                      <StatusBadge tone={STATUS_TONE[f.status]}>{t(STATUS_LABEL[f.status])}</StatusBadge>
                      {f.line && <StatusBadge tone="info">{t("common.line")}: {f.line.code}</StatusBadge>}
                    </div>
                    <div className="mt-1 truncate text-sm">
                      {f.client ? <span className="font-medium">{f.client.full_name}</span> : <span className="italic text-muted-foreground">—</span>}
                      {f.net_weight_kg !== null && (
                        <span className="ms-3 text-muted-foreground tabular">
                          {t("weigh.net")}: <span className="font-bold text-foreground">{formatKg(f.net_weight_kg)}</span>
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground tabular">
                      {f.started_at && <>{t("crushing.started_at")}: {formatDateTime(f.started_at)}</>}
                      {f.completed_at && <span className="ms-3">{t("crushing.completed_at")}: {formatDateTime(f.completed_at)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {f.status === "in_progress" && (
                      <Button onClick={() => complete.mutate(f.id)} disabled={complete.isPending}>
                        <CheckCircle2 className="me-1 h-4 w-4" />
                        {t("crushing.complete")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <NewCrushingDialog open={showNew} onOpenChange={setShowNew} />
    </div>
  );
}

interface EligibleArrival extends Arrival {
  client: Client | null;
  weighings: Weighing[];
}

function NewCrushingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [arrivalId, setArrivalId] = useState("");

  const { data: candidates } = useQuery({
    queryKey: ["crushing-candidates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("arrivals")
        .select("*, client:clients(*), weighings(*)")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const list = (data as unknown as EligibleArrival[]).filter((a) => a.weighings.length > 0);
      return list;
    },
    enabled: open,
  });

  const create = useMutation({
    mutationFn: async () => {
      const arrival = candidates?.find((a) => a.id === arrivalId);
      if (!arrival) throw new Error("no_arrival");
      const { data: code, error: codeErr } = await supabase.rpc("next_crushing_code");
      if (codeErr) throw codeErr;
      const sim = arrival.weighings.find((w) => w.kind === "simple");
      const f = arrival.weighings.find((w) => w.kind === "first");
      const s = arrival.weighings.find((w) => w.kind === "second");
      const gross = sim?.weight_kg ?? s?.weight_kg ?? null;
      const tare = f?.weight_kg ?? null;
      const net = sim?.weight_kg ?? (gross !== null && tare !== null ? gross - tare : null);

      const { error } = await supabase.from("crushing_files").insert({
        arrival_id: arrival.id,
        client_id: arrival.client_id,
        tracking_code: code as string,
        gross_weight_kg: gross,
        tare_weight_kg: tare,
        net_weight_kg: net,
        status: "queued",
        priority: "normal",
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      return code as string;
    },
    onSuccess: (code) => {
      qc.invalidateQueries({ queryKey: ["crushing-files"] });
      qc.invalidateQueries({ queryKey: ["queue-files"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success(t("weigh.crushing_created", code));
      onOpenChange(false);
      setArrivalId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("weigh.create_crushing")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={arrivalId} onValueChange={setArrivalId}>
            <SelectTrigger><SelectValue placeholder={t("arrival.select_or_search")} /></SelectTrigger>
            <SelectContent>
              {candidates?.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="font-mono">{a.ticket_number}</span> — {a.client?.full_name ?? "—"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => create.mutate()} disabled={!arrivalId || create.isPending}>{t("common.create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

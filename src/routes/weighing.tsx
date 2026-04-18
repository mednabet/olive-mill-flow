/**
 * Module Pesage : enregistre les pesées simples ou doubles (1ère/2ème).
 * - Liste des arrivées du jour à peser
 * - Saisie manuelle obligatoirement justifiée → loggée dans audit_logs
 * - Calcul automatique brut/tare/net + impression du bon de pesée
 * - Création d'un dossier d'écrasement depuis une arrivée déjà pesée (service "crushing")
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Scale, Search, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { useAllowManualConfig } from "@/lib/settings";
import { RequireRole } from "@/components/RequireRole";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { PrintLayout } from "@/components/PrintLayout";
import { WeighingTicket } from "@/components/weighing/WeighingTicket";
import { ScaleInput, type WeighingSourceUI } from "@/components/weighing/ScaleInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatKg } from "@/lib/format";
import { cn } from "@/lib/utils";

type Arrival = Database["public"]["Tables"]["arrivals"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
type Weighing = Database["public"]["Tables"]["weighings"]["Row"];
type WeighingKind = Database["public"]["Enums"]["weighing_kind"];
type AppRole = Database["public"]["Enums"]["app_role"];

interface EnrichedArrival extends Arrival {
  client: Client | null;
  vehicle: Vehicle | null;
  weighings: Weighing[];
}

export const Route = createFileRoute("/weighing")({
  component: () => (
    <RequireRole roles={["admin", "superviseur", "peseur"]}>
      <WeighingPage />
    </RequireRole>
  ),
});

function WeighingPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [target, setTarget] = useState<EnrichedArrival | null>(null);
  const [printArrival, setPrintArrival] = useState<EnrichedArrival | null>(null);

  const { data: arrivals, isLoading } = useQuery({
    queryKey: ["weighing-arrivals", filter],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      let q = supabase
        .from("arrivals")
        .select("*, client:clients(*), vehicle:vehicles(*), weighings(*)")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter === "pending") q = q.gte("created_at", start.toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as EnrichedArrival[];
    },
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    if (!arrivals) return [];
    let list = arrivals;
    if (filter === "pending") {
      list = list.filter((a) => {
        if (a.service_type === "weigh_simple") return a.weighings.length === 0;
        if (a.service_type === "weigh_double") return a.weighings.length < 2;
        // crushing : doit être pesé une fois min
        return a.weighings.length === 0;
      });
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (a) =>
        a.ticket_number.toLowerCase().includes(q) ||
        (a.client?.full_name.toLowerCase().includes(q) ?? false) ||
        (a.client?.code.toLowerCase().includes(q) ?? false),
    );
  }, [arrivals, search, filter]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("weigh.title")} subtitle={t("weigh.subtitle")} icon={<Scale className="h-5 w-5" />} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="pending">{t("weigh.pending")}</TabsTrigger>
            <TabsTrigger value="all">{t("common.all")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("weigh.search")}
            className="ps-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Scale className="h-5 w-5" />} title={t("weigh.empty")} />
      ) : (
        <ul className="space-y-2">
          {filtered.map((a) => (
            <WeighingRow key={a.id} arrival={a} onWeigh={() => setTarget(a)} onPrint={() => setPrintArrival(a)} />
          ))}
        </ul>
      )}

      <WeighingDialog arrival={target} onClose={() => setTarget(null)} onPrint={(a) => { setTarget(null); setPrintArrival(a); }} />

      <Dialog open={!!printArrival} onOpenChange={(o) => { if (!o) setPrintArrival(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("weigh.print_ticket")}</DialogTitle>
          </DialogHeader>
          {printArrival && (
            <PrintLayout onClose={() => setPrintArrival(null)}>
              <WeighingTicket
                arrival={printArrival}
                client={printArrival.client}
                vehicle={printArrival.vehicle}
                weighings={printArrival.weighings}
              />
            </PrintLayout>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WeighingRow({
  arrival,
  onWeigh,
  onPrint,
}: {
  arrival: EnrichedArrival;
  onWeigh: () => void;
  onPrint: () => void;
}) {
  const { t } = useI18n();
  const simple = arrival.weighings.find((w) => w.kind === "simple");
  const first = arrival.weighings.find((w) => w.kind === "first");
  const second = arrival.weighings.find((w) => w.kind === "second");
  const isDouble = arrival.service_type === "weigh_double";
  const net =
    simple?.weight_kg ??
    (first && second ? Math.max(0, second.weight_kg - first.weight_kg) : null) ??
    null;
  const fullyDone = arrival.service_type === "weigh_double" ? !!(first && second) : !!simple;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 p-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Scale className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-bold tabular tracking-wide">{arrival.ticket_number}</span>
            <StatusBadge tone={fullyDone ? "success" : "warning"}>
              {fullyDone ? t("common.success") : t("weigh.no_weight_yet")}
            </StatusBadge>
            {isDouble && <StatusBadge tone="info">{t("weigh.kind.first")}/{t("weigh.kind.second")}</StatusBadge>}
          </div>
          <div className="mt-1 truncate text-sm">
            {arrival.client ? (
              <>
                <span className="font-medium">{arrival.client.full_name}</span>
                <span className="font-mono text-xs text-muted-foreground tabular ms-2">{arrival.client.code}</span>
              </>
            ) : (
              <span className="italic text-muted-foreground">—</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted-foreground tabular">
            {simple && <span>{t("weigh.weight")}: {formatKg(simple.weight_kg)}</span>}
            {first && <span>{t("weigh.kind.first")}: {formatKg(first.weight_kg)}</span>}
            {second && <span>{t("weigh.kind.second")}: {formatKg(second.weight_kg)}</span>}
            {net !== null && <span className="font-bold text-foreground">{t("weigh.net")}: {formatKg(net)}</span>}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {!fullyDone && (
            <Button onClick={onWeigh}>
              <Scale className="me-1 h-4 w-4" />
              {t("weigh.save")}
            </Button>
          )}
          {arrival.weighings.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onPrint}>
              <Printer className="me-1 h-4 w-4" />
              {t("common.print")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function WeighingDialog({
  arrival,
  onClose,
  onPrint,
}: {
  arrival: EnrichedArrival | null;
  onClose: () => void;
  onPrint: (a: EnrichedArrival) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [weight, setWeight] = useState("");
  const [source, setSource] = useState<WeighingSource>("manual");
  const [reason, setReason] = useState("");

  const kind: WeighingKind = useMemo(() => {
    if (!arrival) return "simple";
    if (arrival.service_type === "weigh_double") {
      const hasFirst = arrival.weighings.some((w) => w.kind === "first");
      return hasFirst ? "second" : "first";
    }
    return "simple";
  }, [arrival]);

  const reset = () => {
    setWeight("");
    setSource("manual");
    setReason("");
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!arrival) throw new Error("no arrival");
      const w = parseFloat(weight);
      if (!Number.isFinite(w) || w < 0) throw new Error(t("validation.positive"));
      if (source === "manual" && !reason.trim()) throw new Error(t("weigh.manual_reason_required"));

      const { error } = await supabase.from("weighings").insert({
        arrival_id: arrival.id,
        kind,
        weight_kg: w,
        source,
        manual_reason: source === "manual" ? reason.trim() : null,
        performed_by: user?.id ?? null,
      });
      if (error) throw error;

      // Audit log si saisie manuelle
      if (source === "manual") {
        await supabase.from("audit_logs").insert({
          action: "manual_weighing",
          entity_type: "weighings",
          entity_id: arrival.id,
          user_id: user?.id ?? null,
          reason: reason.trim(),
          new_values: { kind, weight_kg: w, ticket: arrival.ticket_number },
        });
      }

      // Marque l'arrivée comme "routed" si pesée terminée
      const isDoubleDone = arrival.service_type === "weigh_double" && kind === "second";
      const isSimpleDone = arrival.service_type !== "weigh_double" && kind === "simple";
      if (isDoubleDone || isSimpleDone) {
        await supabase
          .from("arrivals")
          .update({ status: "routed" })
          .eq("id", arrival.id);
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["weighing-arrivals"] });
      await qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      const next = await refetchEnriched(arrival!.id);
      const finalized =
        (arrival!.service_type === "weigh_double" && kind === "second") ||
        (arrival!.service_type !== "weigh_double" && kind === "simple");
      if (finalized && next) {
        const w = next.weighings;
        const f = w.find((x) => x.kind === "first");
        const s = w.find((x) => x.kind === "second");
        const sim = w.find((x) => x.kind === "simple");
        const net = sim?.weight_kg ?? (f && s ? Math.max(0, s.weight_kg - f.weight_kg) : 0);
        toast.success(t("weigh.second_done", formatKg(net)));
        onPrint(next);
      } else {
        toast.success(t("weigh.first_done"));
        onClose();
      }
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!arrival) return null;

  const KIND_LABEL: Record<WeighingKind, TranslationKey> = {
    simple: "weigh.kind.simple",
    first: "weigh.kind.first",
    second: "weigh.kind.second",
  };

  return (
    <Dialog open={!!arrival} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            {t(KIND_LABEL[kind])} · {arrival.ticket_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {arrival.client && (
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <div className="font-medium">{arrival.client.full_name}</div>
              <div className="font-mono text-xs text-muted-foreground tabular">{arrival.client.code}</div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="weight">
              {t("weigh.weight")} ({t("common.kg")}) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              autoFocus
              className="font-mono text-2xl tabular h-14"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("weigh.source.scale")} / {t("weigh.source.manual")}</Label>
            <Select value={source} onValueChange={(v) => setSource(v as WeighingSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">{t("weigh.source.manual")}</SelectItem>
                <SelectItem value="scale">{t("weigh.source.scale")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {source === "manual" && (
            <div className="space-y-1.5">
              <Label htmlFor="reason">
                {t("weigh.manual_reason")} <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("weigh.manual_reason_ph")}
                rows={2}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !weight}>
            {t("weigh.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function refetchEnriched(id: string): Promise<EnrichedArrival | null> {
  const { data } = await supabase
    .from("arrivals")
    .select("*, client:clients(*), vehicle:vehicles(*), weighings(*)")
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as EnrichedArrival) ?? null;
}

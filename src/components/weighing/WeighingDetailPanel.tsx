/**
 * Panel détail d'une arrivée (récap + saisie inline + impression).
 * Conçu pour être ouvert dans un Sheet/Dialog depuis la liste,
 * pour éviter une route dynamique (problème d'hydratation TanStack Start).
 */
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Scale, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { useAllowManualConfig, useScales } from "@/lib/settings";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { PrintLayout } from "@/components/PrintLayout";
import { WeighingTicket } from "@/components/weighing/WeighingTicket";
import { ScaleInput, type WeighingSourceUI } from "@/components/weighing/ScaleInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatKg } from "@/lib/format";

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

const KIND_LABEL: Record<WeighingKind, TranslationKey> = {
  simple: "weigh.kind.simple",
  first: "weigh.kind.first",
  second: "weigh.kind.second",
};

interface WeighingDetailPanelProps {
  arrivalId: string;
}

export function WeighingDetailPanel({ arrivalId }: WeighingDetailPanelProps) {
  const { t } = useI18n();
  const { user, profile, roles } = useAuth();
  const qc = useQueryClient();
  const { data: scales } = useScales(false);
  const { data: allowManualCfg } = useAllowManualConfig();

  const [printOpen, setPrintOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [source, setSource] = useState<WeighingSourceUI>("scale");
  const [reason, setReason] = useState("");
  const [selectedScaleId, setSelectedScaleId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("weighing.selected_scale_id") ?? "";
  });

  useEffect(() => {
    if (!selectedScaleId && profile?.default_scale_id) {
      setSelectedScaleId(profile.default_scale_id);
    } else if (!selectedScaleId && scales && scales.length > 0) {
      setSelectedScaleId(scales[0].id);
    }
  }, [profile?.default_scale_id, scales, selectedScaleId]);

  useEffect(() => {
    if (selectedScaleId && typeof window !== "undefined") {
      window.localStorage.setItem("weighing.selected_scale_id", selectedScaleId);
    }
  }, [selectedScaleId]);

  const selectedScale = useMemo(
    () => scales?.find((s) => s.id === selectedScaleId) ?? null,
    [scales, selectedScaleId],
  );

  const { data: arrival, isLoading } = useQuery({
    queryKey: ["weighing-arrival", arrivalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("arrivals")
        .select("*, client:clients(*), vehicle:vehicles(*), weighings(*)")
        .eq("id", arrivalId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as EnrichedArrival) ?? null;
    },
  });

  const isPrivileged = (roles ?? []).some(
    (r: AppRole) => r === "admin" || r === "superviseur",
  );
  const allowManual = isPrivileged || (allowManualCfg?.enabled ?? true);

  const kind: WeighingKind = useMemo(() => {
    if (!arrival) return "simple";
    if (arrival.service_type === "weigh_double") {
      const hasFirst = arrival.weighings.some((w) => w.kind === "first");
      return hasFirst ? "second" : "first";
    }
    return "simple";
  }, [arrival]);

  const isDouble = arrival?.service_type === "weigh_double";
  const hasFirst = arrival?.weighings.some((w) => w.kind === "first") ?? false;
  const hasSecond = arrival?.weighings.some((w) => w.kind === "second") ?? false;
  const hasSimple = arrival?.weighings.some((w) => w.kind === "simple") ?? false;
  const canAdd = arrival
    ? isDouble
      ? !(hasFirst && hasSecond)
      : !hasSimple
    : false;

  const reset = () => {
    setWeight("");
    setSource("scale");
    setReason("");
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!arrival) throw new Error("no arrival");
      const w = parseFloat(weight);
      if (!Number.isFinite(w) || w < 0) throw new Error(t("validation.positive"));
      if (source === "manual" && !reason.trim())
        throw new Error(t("weigh.manual_reason_required"));
      if (source === "manual" && !allowManual) throw new Error(t("weigh.manual_disabled"));

      const { error } = await supabase.from("weighings").insert({
        arrival_id: arrival.id,
        kind,
        weight_kg: w,
        source,
        manual_reason: source === "manual" ? reason.trim() : null,
        performed_by: user?.id ?? null,
        scale_id: source === "scale" ? selectedScaleId || null : null,
      });
      if (error) throw error;

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

      const isDoubleDone =
        arrival.service_type === "weigh_double" && kind === "second";
      const isSimpleDone =
        arrival.service_type !== "weigh_double" && kind === "simple";
      const fullyWeighed = isDoubleDone || isSimpleDone;

      let crushingCode: string | null = null;
      if (fullyWeighed) {
        await supabase.from("arrivals").update({ status: "routed" }).eq("id", arrival.id);

        if (arrival.service_type === "crushing") {
          const k: WeighingKind = kind;
          const simpleW =
            arrival.weighings.find((x) => x.kind === "simple")?.weight_kg ??
            (k === "simple" ? w : null);
          const firstW =
            arrival.weighings.find((x) => x.kind === "first")?.weight_kg ?? null;
          const secondW =
            arrival.weighings.find((x) => x.kind === "second")?.weight_kg ??
            (k === "second" ? w : null);
          const grossKg = simpleW ?? secondW ?? null;
          const tareKg = firstW;
          const netKg =
            simpleW ??
            (grossKg !== null && tareKg !== null
              ? Math.max(0, grossKg - tareKg)
              : null);

          if (netKg !== null && netKg > 0) {
            const { data: existing } = await supabase
              .from("crushing_files")
              .select("id, tracking_code")
              .eq("arrival_id", arrival.id)
              .maybeSingle();

            if (existing) {
              crushingCode = existing.tracking_code;
            } else {
              const { data: codeData, error: codeErr } = await supabase.rpc(
                "next_crushing_code",
              );
              if (codeErr) throw codeErr;
              const code = codeData as string;

              const { data: cf, error: cfErr } = await supabase
                .from("crushing_files")
                .insert({
                  arrival_id: arrival.id,
                  client_id: arrival.client_id,
                  tracking_code: code,
                  gross_weight_kg: grossKg,
                  tare_weight_kg: tareKg,
                  net_weight_kg: netKg,
                  status: "queued",
                  priority: "normal",
                  created_by: user?.id ?? null,
                })
                .select("id")
                .single();
              if (cfErr) throw cfErr;
              crushingCode = code;

              const { data: lotCode, error: lotCodeErr } = await supabase.rpc(
                "next_lot_code",
                { _kind: "client_olives" },
              );
              if (lotCodeErr) throw lotCodeErr;

              const { data: lot, error: lotErr } = await supabase
                .from("stock_lots")
                .insert({
                  lot_code: lotCode as string,
                  kind: "client_olives",
                  client_id: arrival.client_id,
                  crushing_file_id: cf.id,
                  quantity_kg: 0,
                  notes: `Auto: arrivée ${arrival.ticket_number}`,
                })
                .select("id")
                .single();
              if (lotErr) throw lotErr;

              const { error: mvErr } = await supabase.from("stock_movements").insert({
                lot_id: lot.id,
                movement_type: "in",
                quantity_kg: netKg,
                reference_id: cf.id,
                reason: `Pesage arrivée ${arrival.ticket_number}`,
                created_by: user?.id ?? null,
              });
              if (mvErr) throw mvErr;
            }
          }
        }
      }
      return { isDoubleDone, isSimpleDone, fullyWeighed, crushingCode };
    },
    onSuccess: async ({ fullyWeighed, crushingCode }) => {
      await qc.invalidateQueries({ queryKey: ["weighing-arrival", arrivalId] });
      await qc.invalidateQueries({ queryKey: ["weighing-arrivals"] });
      await qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      await qc.invalidateQueries({ queryKey: ["crushing-files"] });
      await qc.invalidateQueries({ queryKey: ["queue-files"] });
      await qc.invalidateQueries({ queryKey: ["stock-lots"] });
      reset();
      if (fullyWeighed) {
        if (crushingCode) {
          toast.success(t("weigh.crushing_created", crushingCode));
        } else {
          toast.success(t("weigh.second_done", ""));
        }
        setPrintOpen(true);
      } else {
        toast.success(t("weigh.first_done"));
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!arrival) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          {t("weigh.empty")}
        </CardContent>
      </Card>
    );
  }

  const sortedWeighings = [...arrival.weighings].sort(
    (a, b) =>
      new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime(),
  );
  const simple = arrival.weighings.find((w) => w.kind === "simple");
  const first = arrival.weighings.find((w) => w.kind === "first");
  const second = arrival.weighings.find((w) => w.kind === "second");
  const net =
    simple?.weight_kg ??
    (first && second ? Math.max(0, second.weight_kg - first.weight_kg) : null);

  return (
    <div className="space-y-6">
      <PageHeader
        title={arrival.ticket_number}
        subtitle={arrival.client?.full_name ?? undefined}
        icon={<Scale className="h-5 w-5" />}
      />

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">{t("weigh.kind.simple")}</div>
            <div className="font-mono font-bold tabular">
              {simple ? formatKg(simple.weight_kg) : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">
              {t("weigh.kind.first")} / {t("weigh.kind.second")}
            </div>
            <div className="font-mono font-bold tabular">
              {first ? formatKg(first.weight_kg) : "—"} /{" "}
              {second ? formatKg(second.weight_kg) : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("weigh.net")}</div>
            <div className="font-mono text-lg font-bold tabular text-primary">
              {net !== null ? formatKg(net) : "—"}
            </div>
          </div>
        </CardContent>
      </Card>

      {sortedWeighings.length > 0 && (
        <ul className="space-y-2">
          {sortedWeighings.map((w) => (
            <li key={w.id}>
              <Card>
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Scale className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t(KIND_LABEL[w.kind])}</span>
                      <StatusBadge tone={w.source === "manual" ? "warning" : "info"}>
                        {w.source}
                      </StatusBadge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground tabular">
                      {new Date(w.performed_at).toLocaleString()}
                    </div>
                    {w.manual_reason && (
                      <div className="mt-0.5 truncate text-xs italic text-muted-foreground">
                        {w.manual_reason}
                      </div>
                    )}
                  </div>
                  <div className="font-mono text-lg font-bold tabular">
                    {formatKg(w.weight_kg)}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-semibold">
                <Scale className="h-5 w-5 text-primary" />
                {t(KIND_LABEL[kind])}
              </h3>
              {scales && scales.length > 0 && (
                <Select value={selectedScaleId} onValueChange={setSelectedScaleId}>
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue placeholder={t("admin.scales.title")} />
                  </SelectTrigger>
                  <SelectContent>
                    {scales.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="font-mono text-xs tabular me-2">{s.code}</span>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <ScaleInput
              value={weight}
              onChange={setWeight}
              source={source}
              onSourceChange={setSource}
              reason={reason}
              onReasonChange={setReason}
              allowManual={allowManual}
              scaleUrl={selectedScale?.websocket_url ?? null}
              scaleName={selectedScale?.name ?? null}
              autoFocus
            />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset} disabled={save.isPending || !weight}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending || !weight}>
                {t("weigh.save")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {arrival.weighings.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setPrintOpen(true)}>
            <Printer className="me-1 h-4 w-4" />
            {t("common.print")}
          </Button>
        </div>
      )}

      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("weigh.print_ticket")}</DialogTitle>
          </DialogHeader>
          <PrintLayout onClose={() => setPrintOpen(false)}>
            <WeighingTicket
              arrival={arrival}
              client={arrival.client}
              vehicle={arrival.vehicle}
              weighings={arrival.weighings}
            />
          </PrintLayout>
        </DialogContent>
      </Dialog>
    </div>
  );
}

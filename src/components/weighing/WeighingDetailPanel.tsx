/**
 * Panel détail d'une arrivée (récap + saisie inline + impression).
 * Conçu pour être ouvert dans un Sheet/Dialog depuis la liste,
 * pour éviter une route dynamique (problème d'hydratation TanStack Start).
 */
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Scale, Printer, XCircle, Car, FileText, Link2, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { useAllowManualConfig, useScales, useAllowCancelByPeseur } from "@/lib/settings";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { PrintLayout } from "@/components/PrintLayout";
import { WeighingTicket } from "@/components/weighing/WeighingTicket";
import { CrushingTicket } from "@/components/crushing/CrushingTicket";
import { AssignCrushingFileDialog } from "@/components/crushing/AssignCrushingFileDialog";
import { EditWeighingDialog } from "@/components/weighing/EditWeighingDialog";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatKg } from "@/lib/format";

type Arrival = Database["public"]["Tables"]["arrivals"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
type Weighing = Database["public"]["Tables"]["weighings"]["Row"];
type Product = Database["public"]["Tables"]["products"]["Row"];
type WeighingKind = Database["public"]["Enums"]["weighing_kind"];
type AppRole = Database["public"]["Enums"]["app_role"];

interface EnrichedArrival extends Arrival {
  client: Client | null;
  vehicle: Vehicle | null;
  weighings: Weighing[];
  product: Product | null;
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
  const { data: allowCancelCfg } = useAllowCancelByPeseur();

  const [printOpen, setPrintOpen] = useState(false);
  const [printCrushingOpen, setPrintCrushingOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [editingWeighing, setEditingWeighing] = useState<Weighing | null>(null);
  const [createdCrushingCode, setCreatedCrushingCode] = useState<string | null>(null);
  const [createdCrushingFileId, setCreatedCrushingFileId] = useState<string | null>(null);

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
        .select("*, client:clients(*), vehicle:vehicles(*), weighings(*), product:products(*)")
        .eq("id", arrivalId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as EnrichedArrival) ?? null;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products", "olive", "active"],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("category", "olive")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: arrival?.needs_crushing === true,
  });

  // Données du dossier d'écrasement (pour le ticket d'impression / bandeau)
  const { data: crushingFileData } = useQuery({
    queryKey: ["crushing-file-for-print", createdCrushingFileId],
    enabled: !!createdCrushingFileId,
    queryFn: async () => {
      if (!createdCrushingFileId) return null;
      const { data: file, error } = await supabase
        .from("crushing_files")
        .select("*, line:crushing_lines!assigned_line_id(*), client:clients(*)")
        .eq("id", createdCrushingFileId)
        .maybeSingle();
      if (error) throw error;
      if (!file) return null;
      const { data: links, error: linksErr } = await supabase
        .from("crushing_file_arrivals")
        .select("net_weight_kg, arrival:arrivals!arrival_id(ticket_number)")
        .eq("crushing_file_id", createdCrushingFileId);
      if (linksErr) throw linksErr;
      // Si pas de lignes cfa (cas nouveau dossier sans rattachement), construire une ligne fictive avec l'arrivée elle-même
      const attachedArrivals =
        links && links.length > 0
          ? links.map((l) => ({
              ticket_number:
                (l.arrival as unknown as { ticket_number: string } | null)
                  ?.ticket_number ?? "—",
              net_weight_kg: l.net_weight_kg,
            }))
          : arrival
            ? [{ ticket_number: arrival.ticket_number, net_weight_kg: file.net_weight_kg }]
            : [];
      return { file, attachedArrivals };
    },
  });

  const setProduct = useMutation({
    mutationFn: async (newProductId: string) => {
      const { error } = await supabase
        .from("arrivals")
        .update({ product_id: newProductId || null })
        .eq("id", arrivalId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["weighing-arrival", arrivalId] });
      await qc.invalidateQueries({ queryKey: ["weighing-arrivals"] });
      await qc.invalidateQueries({ queryKey: ["arrivals"] });
      toast.success(t("common.success"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isPrivileged = (roles ?? []).some(
    (r: AppRole) => r === "admin" || r === "superviseur",
  );
  const isPeseur = (roles ?? []).some((r: AppRole) => r === "peseur");
  const allowManual = isPrivileged || (allowManualCfg?.enabled ?? true);

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("arrivals")
        .update({ status: "cancelled", closed_at: new Date().toISOString() })
        .eq("id", arrivalId);
      if (error) throw error;
      await supabase.from("audit_logs").insert({
        action: "cancel_arrival",
        entity_type: "arrivals",
        entity_id: arrivalId,
        user_id: user?.id ?? null,
        reason: "Annulation depuis le module Pesage",
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["weighing-arrival", arrivalId] });
      await qc.invalidateQueries({ queryKey: ["weighing-arrivals"] });
      await qc.invalidateQueries({ queryKey: ["arrivals"] });
      await qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success(t("weigh.cancel_arrival_success"));
      setCancelOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!arrival) throw new Error("no arrival");
      if (arrival.weighings.length > 0) throw new Error(t("weigh.delete_with_weighings"));
      // Détacher éventuellement d'un dossier d'écrasement cible (sécurité)
      await supabase
        .from("crushing_file_arrivals")
        .delete()
        .eq("arrival_id", arrival.id);
      const { error } = await supabase.from("arrivals").delete().eq("id", arrival.id);
      if (error) throw error;
      await supabase.from("audit_logs").insert({
        action: "delete_arrival",
        entity_type: "arrivals",
        entity_id: arrival.id,
        user_id: user?.id ?? null,
        reason: "Suppression depuis le module Pesage",
        old_values: { ticket_number: arrival.ticket_number, client_id: arrival.client_id },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["weighing-arrival", arrivalId] });
      await qc.invalidateQueries({ queryKey: ["weighing-arrivals"] });
      await qc.invalidateQueries({ queryKey: ["arrivals"] });
      await qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      await qc.invalidateQueries({ queryKey: ["queue-files"] });
      toast.success(t("weigh.delete_arrival_success"));
      setDeleteOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
      if (arrival.needs_crushing && !arrival.product_id) {
        throw new Error(t("weigh.product_required"));
      }
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

      // Calcul du net pour le toast (utile pour les pesées doubles non-écrasement)
      let toastNet: number | null = null;
      if (isDoubleDone) {
        const firstW = arrival.weighings.find((x) => x.kind === "first")?.weight_kg ?? null;
        if (firstW !== null) toastNet = Math.max(0, w - firstW);
      } else if (isSimpleDone) {
        toastNet = w;
      }

      let crushingCode: string | null = null;
      let crushingFileId: string | null = null;
      if (fullyWeighed) {
        await supabase.from("arrivals").update({ status: "routed" }).eq("id", arrival.id);

        if (arrival.needs_crushing) {
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
            // Cas 1 : déjà rattaché à un dossier existant (cfa) → rien à créer
            const { data: existingLink } = await supabase
              .from("crushing_files")
              .select("id, tracking_code")
              .eq("arrival_id", arrival.id)
              .maybeSingle();

            if (existingLink) {
              crushingCode = existingLink.tracking_code;
              crushingFileId = existingLink.id;
            } else if (arrival.target_crushing_file_id) {
              // Cas 2 : pré-rattachement choisi à la création de l'arrivée
              const { data: targetFile, error: targetErr } = await supabase
                .from("crushing_files")
                .select("id, tracking_code")
                .eq("id", arrival.target_crushing_file_id)
                .maybeSingle();
              if (targetErr) throw targetErr;

              if (targetFile) {
                // Ajout d'une ligne crushing_file_arrivals (le trigger recalcule les totaux du dossier)
                const { error: cfaErr } = await supabase
                  .from("crushing_file_arrivals")
                  .insert({
                    crushing_file_id: targetFile.id,
                    arrival_id: arrival.id,
                    gross_weight_kg: grossKg,
                    tare_weight_kg: tareKg,
                    net_weight_kg: netKg,
                  });
                if (cfaErr) throw cfaErr;

                // Mouvement de stock sur le lot rattaché au dossier (s'il existe)
                const { data: lot } = await supabase
                  .from("stock_lots")
                  .select("id")
                  .eq("crushing_file_id", targetFile.id)
                  .eq("kind", "client_olives")
                  .maybeSingle();
                if (lot) {
                  await supabase.from("stock_movements").insert({
                    lot_id: lot.id,
                    movement_type: "in",
                    quantity_kg: netKg,
                    reference_id: targetFile.id,
                    reason: `Pesage arrivée ${arrival.ticket_number} (rattachement)`,
                    created_by: user?.id ?? null,
                  });
                }

                crushingCode = targetFile.tracking_code;
                crushingFileId = targetFile.id;
              }
            } else {
              // Cas 3 : création d'un nouveau dossier
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
              crushingFileId = cf.id;

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
      return { isDoubleDone, isSimpleDone, fullyWeighed, crushingCode, crushingFileId, toastNet, attached: !!arrival.target_crushing_file_id };
    },
    onSuccess: async ({ fullyWeighed, crushingCode, crushingFileId, toastNet, attached }) => {
      await qc.invalidateQueries({ queryKey: ["weighing-arrival", arrivalId] });
      await qc.invalidateQueries({ queryKey: ["weighing-arrivals"] });
      await qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      await qc.invalidateQueries({ queryKey: ["crushing-files"] });
      await qc.invalidateQueries({ queryKey: ["queue-files"] });
      await qc.invalidateQueries({ queryKey: ["stock-lots"] });
      reset();
      if (fullyWeighed) {
        if (crushingCode && crushingFileId) {
          setCreatedCrushingCode(crushingCode);
          setCreatedCrushingFileId(crushingFileId);
          toast.success(
            attached
              ? t("weigh.crushing_attached", crushingCode)
              : t("weigh.crushing_created", crushingCode),
          );
          setPrintCrushingOpen(true);
        } else {
          toast.success(t("weigh.second_done", toastNet !== null ? formatKg(toastNet) : ""));
          setPrintOpen(true);
        }
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

  const hasAnyWeighing = arrival.weighings.length > 0;
  const canCancel =
    !hasAnyWeighing &&
    arrival.status !== "cancelled" &&
    (isPrivileged || (isPeseur && (allowCancelCfg?.enabled ?? false)));
  const canDelete = !hasAnyWeighing && (roles ?? []).includes("admin");

  return (
    <div className="space-y-6">
      <PageHeader
        title={arrival.ticket_number}
        subtitle={arrival.client?.full_name ?? undefined}
        icon={<Scale className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            {arrival.vehicle && (
              <span className="inline-flex items-center gap-1 self-center rounded bg-muted px-2 py-1 font-mono text-xs tabular" dir="ltr">
                <Car className="h-3.5 w-3.5" />
                {arrival.vehicle.plate}
              </span>
            )}
            {arrival.needs_crushing && (
              <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
                <Link2 className="me-1 h-4 w-4" />
                {t("assign.action_label")}
              </Button>
            )}
            {canCancel && (
              <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
                <XCircle className="me-1 h-4 w-4" />
                {t("weigh.cancel_arrival")}
              </Button>
            )}
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteOpen(true)}
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="me-1 h-4 w-4" />
                {t("weigh.delete_arrival")}
              </Button>
            )}
          </div>
        }
      />

      {createdCrushingCode && (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-success" />
              <div>
                <div className="text-sm font-medium">
                  {arrival.target_crushing_file_id
                    ? t("weigh.crushing_attached", createdCrushingCode)
                    : t("weigh.crushing_created", createdCrushingCode)}
                </div>
                <div className="font-mono text-xs text-muted-foreground tabular">{createdCrushingCode}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setPrintCrushingOpen(true)}>
                <Printer className="me-1 h-4 w-4" />
                {t("weigh.print_crushing_ticket")}
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/crushing">
                  {t("weigh.open_crushing")}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {arrival.needs_crushing && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium">
                {t("weigh.product")}{" "}
                <span className="text-destructive">*</span>
              </label>
              {arrival.product && (
                <span
                  className="rounded-full border px-2 py-0.5 text-xs font-medium"
                  style={{
                    borderColor: arrival.product.color ?? undefined,
                    color: arrival.product.color ?? undefined,
                  }}
                >
                  {arrival.product.name}
                </span>
              )}
            </div>
            <Select
              value={arrival.product_id ?? ""}
              onValueChange={(v) => setProduct.mutate(v)}
              disabled={setProduct.isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("weigh.product_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {products?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span
                      className="me-2 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ backgroundColor: p.color ?? "#84cc16" }}
                    />
                    {p.name}
                    <span className="ms-2 font-mono text-xs text-muted-foreground tabular">
                      {p.code}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!arrival.product_id && (
              <p className="text-xs text-destructive">{t("weigh.product_required")}</p>
            )}
          </CardContent>
        </Card>
      )}
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
          {sortedWeighings.map((w) => {
            const canEditThis = isPrivileged || isPeseur;
            return (
              <li key={w.id}>
                <Card>
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Scale className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{t(KIND_LABEL[w.kind])}</span>
                        <StatusBadge tone={w.source === "manual" ? "warning" : "info"}>
                          {w.source}
                        </StatusBadge>
                        {w.is_corrected && (
                          <StatusBadge tone="warning">{t("weigh.corrected")}</StatusBadge>
                        )}
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
                    {canEditThis && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingWeighing(w)}
                        title={t("weigh.edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
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
              {scales && scales.length > 0 ? (
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
              ) : (
                <span className="text-xs text-muted-foreground">
                  {t("weigh.no_scales_configured")}
                </span>
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
              <Button
                onClick={() => save.mutate()}
                disabled={
                  save.isPending ||
                  !weight ||
                  (arrival.needs_crushing && !arrival.product_id)
                }
              >
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
              product={arrival.product}
            />
          </PrintLayout>
        </DialogContent>
      </Dialog>

      <Dialog open={printCrushingOpen} onOpenChange={setPrintCrushingOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("weigh.print_crushing_ticket")}</DialogTitle>
          </DialogHeader>
          {crushingFileData ? (
            <PrintLayout onClose={() => setPrintCrushingOpen(false)}>
              <CrushingTicket
                file={crushingFileData.file}
                client={crushingFileData.file.client as unknown as Client | null}
                line={crushingFileData.file.line as unknown as Database["public"]["Tables"]["crushing_lines"]["Row"] | null}
                arrivals={crushingFileData.attachedArrivals}
              />
            </PrintLayout>
          ) : (
            <div className="space-y-2 p-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AssignCrushingFileDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        arrivalId={arrival.id}
        clientId={arrival.client_id}
        arrivalTicket={arrival.ticket_number}
      />

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("weigh.cancel_arrival_confirm", arrival.ticket_number)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {hasAnyWeighing
                ? t("weigh.cancel_arrival_with_weighings")
                : t("weigh.cancel_arrival")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending || hasAnyWeighing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("weigh.delete_arrival_confirm", arrival.ticket_number)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {hasAnyWeighing
                ? t("weigh.delete_with_weighings")
                : t("weigh.delete_arrival_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending || hasAnyWeighing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

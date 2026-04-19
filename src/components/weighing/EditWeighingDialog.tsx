/**
 * Dialogue de modification d'un pesage existant.
 * Règles métier :
 *  - Autorisé uniquement si l'arrivée n'est pas rattachée à un dossier d'écrasement
 *    en cours/terminé (statut autorisé : queued ou assigned, ou pas de dossier).
 *  - Motif obligatoire (audit).
 *  - Récupération du nouveau poids : balance (live) ou manuel, comme pour un pesage normal.
 *  - Met à jour weighings.weight_kg + weighings.is_corrected = true + source.
 *  - Recalcule la ligne crushing_file_arrivals (gross/tare/net) si rattachement.
 *  - Crée un mouvement de stock 'adjustment' équivalent au delta (si lot existe).
 *  - Trace l'opération dans audit_logs.
 */
import { useState, useMemo, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatKg } from "@/lib/format";
import { ScaleInput, type WeighingSourceUI } from "@/components/weighing/ScaleInput";

type Weighing = Database["public"]["Tables"]["weighings"]["Row"];
type Arrival = Database["public"]["Tables"]["arrivals"]["Row"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weighing: Weighing;
  arrival: Pick<Arrival, "id" | "ticket_number" | "service_type">;
  /** Tous les pesages de l'arrivée (pour recalcul gross/tare/net) */
  allWeighings: Weighing[];
  /** Contexte balance (identique au pesage normal) */
  allowManual: boolean;
  scaleUrl: string | null;
  scalePollIntervalMs?: number;
  scaleName?: string | null;
  scaleId?: string | null;
}

export function EditWeighingDialog({
  open,
  onOpenChange,
  weighing,
  arrival,
  allWeighings,
  allowManual,
  scaleUrl,
  scalePollIntervalMs,
  scaleName,
  scaleId,
}: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [weight, setWeight] = useState(String(weighing.weight_kg));
  const [source, setSource] = useState<WeighingSourceUI>("manual");
  const [scaleReason, setScaleReason] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setWeight(String(weighing.weight_kg));
      // Démarre en mode balance si une balance est dispo, sinon manuel.
      setSource(scaleUrl ? "scale" : "manual");
      setScaleReason("");
      setReason("");
    }
  }, [open, weighing.weight_kg, scaleUrl]);

  const delta = useMemo(() => {
    const w = parseFloat(weight);
    if (!Number.isFinite(w)) return 0;
    return w - weighing.weight_kg;
  }, [weight, weighing.weight_kg]);

  const update = useMutation({
    mutationFn: async () => {
      const newW = parseFloat(weight);
      if (!Number.isFinite(newW) || newW < 0) throw new Error(t("validation.positive"));
      if (!reason.trim()) throw new Error(t("weigh.edit_reason_required"));
      if (source === "manual" && !allowManual) throw new Error(t("weigh.manual_disabled"));
      if (source === "manual" && !scaleReason.trim())
        throw new Error(t("weigh.manual_reason_required"));
      if (newW === weighing.weight_kg) throw new Error(t("weigh.edit_no_change"));

      // 1) Vérifier l'éligibilité
      const { data: cfaLink } = await supabase
        .from("crushing_file_arrivals")
        .select("id, crushing_file_id")
        .eq("arrival_id", arrival.id)
        .maybeSingle();

      const { data: directFile } = await supabase
        .from("crushing_files")
        .select("id, status")
        .eq("arrival_id", arrival.id)
        .maybeSingle();

      let targetFileId: string | null = null;
      if (cfaLink) targetFileId = cfaLink.crushing_file_id;
      else if (directFile) targetFileId = directFile.id;

      if (targetFileId) {
        const { data: file, error: fileErr } = await supabase
          .from("crushing_files")
          .select("status, client_id")
          .eq("id", targetFileId)
          .maybeSingle();
        if (fileErr) throw fileErr;
        if (!file) throw new Error("file_missing");
        if (file.status !== "queued" && file.status !== "assigned") {
          throw new Error(t("weigh.edit_locked_by_status"));
        }
      }

      // 2) Mettre à jour le pesage (avec source + scale_id + manual_reason)
      const { error: updErr } = await supabase
        .from("weighings")
        .update({
          weight_kg: newW,
          is_corrected: true,
          source: source === "scale" ? "scale" : "manual",
          scale_id: source === "scale" ? scaleId ?? null : null,
          manual_reason: source === "manual" ? scaleReason.trim() : null,
        })
        .eq("id", weighing.id);
      if (updErr) throw updErr;

      // 3) Recalcul ligne cfa si rattachement
      if (cfaLink) {
        const updated = allWeighings.map((w) =>
          w.id === weighing.id ? { ...w, weight_kg: newW } : w,
        );
        const sim = updated.find((w) => w.kind === "simple");
        const f = updated.find((w) => w.kind === "first");
        const s = updated.find((w) => w.kind === "second");
        const grossKg = sim?.weight_kg ?? s?.weight_kg ?? null;
        const tareKg = f?.weight_kg ?? null;
        const netKg =
          sim?.weight_kg ??
          (grossKg !== null && tareKg !== null
            ? Math.abs(grossKg - tareKg)
            : null);

        const { error: cfaErr } = await supabase
          .from("crushing_file_arrivals")
          .update({
            gross_weight_kg: grossKg,
            tare_weight_kg: tareKg,
            net_weight_kg: netKg,
          })
          .eq("id", cfaLink.id);
        if (cfaErr) throw cfaErr;

        if (targetFileId) {
          const { data: lot } = await supabase
            .from("stock_lots")
            .select("id")
            .eq("crushing_file_id", targetFileId)
            .eq("kind", "client_olives")
            .maybeSingle();
          if (lot) {
            const oldGross =
              (sim ? weighing.kind === "simple" ? weighing.weight_kg : sim.weight_kg : null) ??
              (s ? weighing.kind === "second" ? weighing.weight_kg : s.weight_kg : null) ??
              null;
            const oldTare = f
              ? weighing.kind === "first"
                ? weighing.weight_kg
                : f.weight_kg
              : null;
            const oldNet =
              weighing.kind === "simple" || (sim && weighing.kind !== "first" && weighing.kind !== "second")
                ? weighing.kind === "simple"
                  ? weighing.weight_kg
                  : (sim?.weight_kg ?? null)
                : oldGross !== null && oldTare !== null
                  ? Math.abs(oldGross - oldTare)
                  : null;
            const netDelta =
              netKg !== null && oldNet !== null ? netKg - oldNet : 0;
            if (netDelta !== 0) {
              await supabase.from("stock_movements").insert({
                lot_id: lot.id,
                movement_type: "adjustment",
                quantity_kg: netDelta,
                reference_id: targetFileId,
                reason: `Correction pesage ${arrival.ticket_number} (${reason.trim()})`,
                created_by: user?.id ?? null,
              });
            }
          }
        }
      }

      // 4) Audit log
      await supabase.from("audit_logs").insert({
        action: "edit_weighing",
        entity_type: "weighings",
        entity_id: weighing.id,
        user_id: user?.id ?? null,
        reason: reason.trim(),
        old_values: { weight_kg: weighing.weight_kg, kind: weighing.kind },
        new_values: {
          weight_kg: newW,
          kind: weighing.kind,
          ticket: arrival.ticket_number,
          source,
        },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["weighing-arrival", arrival.id] });
      await qc.invalidateQueries({ queryKey: ["weighing-arrivals"] });
      await qc.invalidateQueries({ queryKey: ["arrivals"] });
      await qc.invalidateQueries({ queryKey: ["crushing-files"] });
      await qc.invalidateQueries({ queryKey: ["queue-files"] });
      await qc.invalidateQueries({ queryKey: ["stock-lots"] });
      await qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success(t("weigh.edit_success"));
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            {t("weigh.edit_title")}
          </DialogTitle>
          <DialogDescription>
            {t("weigh.edit_desc")}{" "}
            <span className="font-mono tabular">
              {formatKg(weighing.weight_kg)}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ScaleInput
            value={weight}
            onChange={setWeight}
            source={source}
            onSourceChange={setSource}
            reason={scaleReason}
            onReasonChange={setScaleReason}
            allowManual={allowManual}
            scaleUrl={scaleUrl}
            scalePollIntervalMs={scalePollIntervalMs}
            scaleName={scaleName}
            label={t("weigh.new_weight")}
          />

          {delta !== 0 && Number.isFinite(delta) && (
            <div
              className={`text-xs tabular ${delta > 0 ? "text-success" : "text-destructive"}`}
            >
              Δ {delta > 0 ? "+" : ""}
              {formatKg(delta)}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="edit-reason">
              {t("weigh.edit_reason")} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="edit-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("weigh.edit_reason_placeholder")}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={update.isPending}
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => update.mutate()}
            disabled={update.isPending || !weight || !reason.trim()}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

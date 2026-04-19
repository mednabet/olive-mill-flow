/**
 * Dialog d'affectation d'une arrivée à un dossier d'écrasement.
 *
 * Trois cas :
 *  - Avant pesée : on update arrivals.target_crushing_file_id
 *  - Après pesée (ligne crushing_file_arrivals existante) : on déplace la ligne
 *    vers un autre dossier ou on la supprime (détacher). Les triggers
 *    recalculent les totaux des dossiers.
 *  - Détachement : si le dossier source devient vide après suppression de la
 *    ligne, le dossier est supprimé automatiquement (uniquement si statut
 *    queued/assigned).
 *
 * Règles de fenêtre d'édition :
 *  - Dossier cible : doit être queued ou assigned
 *  - Dossier source : doit être queued ou assigned (sinon lecture seule)
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Factory, Link2, Unlink, FilePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatKg } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  arrivalId: string;
  clientId: string | null;
  /** ticket_number, pour les messages */
  arrivalTicket: string;
}

export function AssignCrushingFileDialog({
  open,
  onOpenChange,
  arrivalId,
  clientId,
  arrivalTicket,
}: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>("");
  const [confirmDetach, setConfirmDetach] = useState(false);

  // État courant : pre-attached (target_crushing_file_id) ou rattachement post-pesée (cfa)
  const { data: current, isLoading: loadingCurrent } = useQuery({
    queryKey: ["arrival-assignment", arrivalId],
    enabled: open,
    queryFn: async () => {
      const { data: arr, error: arrErr } = await supabase
        .from("arrivals")
        .select("target_crushing_file_id, ticket_number")
        .eq("id", arrivalId)
        .maybeSingle();
      if (arrErr) throw arrErr;
      const { data: cfa, error: cfaErr } = await supabase
        .from("crushing_file_arrivals")
        .select("id, crushing_file_id, gross_weight_kg, tare_weight_kg, net_weight_kg")
        .eq("arrival_id", arrivalId)
        .maybeSingle();
      if (cfaErr) throw cfaErr;

      const fileId = cfa?.crushing_file_id ?? arr?.target_crushing_file_id ?? null;
      let file: {
        id: string;
        tracking_code: string;
        status: string;
        net_weight_kg: number | null;
      } | null = null;
      if (fileId) {
        const { data: f, error: fErr } = await supabase
          .from("crushing_files")
          .select("id, tracking_code, status, net_weight_kg")
          .eq("id", fileId)
          .maybeSingle();
        if (fErr) throw fErr;
        file = f;
      }
      return {
        cfa,
        targetId: arr?.target_crushing_file_id ?? null,
        file,
      };
    },
  });

  // Liste des dossiers candidats (même client, queued/assigned, hors dossier courant)
  const { data: candidates } = useQuery({
    queryKey: ["assignment-candidates", clientId, current?.file?.id],
    enabled: open && !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crushing_files")
        .select("id, tracking_code, status, net_weight_kg, created_at")
        .eq("client_id", clientId!)
        .in("status", ["queued", "assigned"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((f) => f.id !== current?.file?.id);
    },
  });

  useEffect(() => {
    if (open) setSelected("");
  }, [open, arrivalId]);

  const sourceLocked =
    !!current?.file && !["queued", "assigned"].includes(current.file.status);

  const moveOrAssign = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("no target");
      // Vérifier que la cible est encore queued/assigned
      const { data: tgt, error: tgtErr } = await supabase
        .from("crushing_files")
        .select("id, status")
        .eq("id", selected)
        .maybeSingle();
      if (tgtErr) throw tgtErr;
      if (!tgt || !["queued", "assigned"].includes(tgt.status)) {
        throw new Error(t("assign.locked"));
      }

      // Cas A : ligne cfa déjà existante (post-pesée) → déplacer
      if (current?.cfa) {
        const oldFileId = current.cfa.crushing_file_id;
        const { error: updErr } = await supabase
          .from("crushing_file_arrivals")
          .update({ crushing_file_id: selected })
          .eq("id", current.cfa.id);
        if (updErr) throw updErr;
        // Déplacer aussi le mouvement de stock associé (best-effort)
        const { data: oldLot } = await supabase
          .from("stock_lots")
          .select("id")
          .eq("crushing_file_id", oldFileId)
          .eq("kind", "client_olives")
          .maybeSingle();
        const { data: newLot } = await supabase
          .from("stock_lots")
          .select("id")
          .eq("crushing_file_id", selected)
          .eq("kind", "client_olives")
          .maybeSingle();
        const net = current.cfa.net_weight_kg ?? 0;
        if (oldLot && net > 0) {
          await supabase.from("stock_movements").insert({
            lot_id: oldLot.id,
            movement_type: "out",
            quantity_kg: net,
            reference_id: oldFileId,
            reason: `Réaffectation ${arrivalTicket} → ${tgt.id}`,
            created_by: user?.id ?? null,
          });
        }
        if (newLot && net > 0) {
          await supabase.from("stock_movements").insert({
            lot_id: newLot.id,
            movement_type: "in",
            quantity_kg: net,
            reference_id: selected,
            reason: `Réaffectation ${arrivalTicket} (depuis ${oldFileId})`,
            created_by: user?.id ?? null,
          });
        }
        await maybePurgeEmptyFile(oldFileId);
      } else {
        // Cas B : pré-rattachement (avant pesée) → update arrivals.target_crushing_file_id
        const { error } = await supabase
          .from("arrivals")
          .update({ target_crushing_file_id: selected })
          .eq("id", arrivalId);
        if (error) throw error;
      }

      await supabase.from("audit_logs").insert({
        action: "reassign_arrival",
        entity_type: "arrivals",
        entity_id: arrivalId,
        user_id: user?.id ?? null,
        new_values: { target_crushing_file_id: selected, ticket: arrivalTicket },
      });
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success(t("assign.changed"));
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const detach = useMutation({
    mutationFn: async () => {
      if (!current?.file) return;
      const oldFileId = current.file.id;

      if (current.cfa) {
        const net = current.cfa.net_weight_kg ?? 0;
        const { error: delErr } = await supabase
          .from("crushing_file_arrivals")
          .delete()
          .eq("id", current.cfa.id);
        if (delErr) throw delErr;

        // Mouvement de sortie sur le lot du dossier source
        if (net > 0) {
          const { data: oldLot } = await supabase
            .from("stock_lots")
            .select("id")
            .eq("crushing_file_id", oldFileId)
            .eq("kind", "client_olives")
            .maybeSingle();
          if (oldLot) {
            await supabase.from("stock_movements").insert({
              lot_id: oldLot.id,
              movement_type: "out",
              quantity_kg: net,
              reference_id: oldFileId,
              reason: `Détachement ${arrivalTicket}`,
              created_by: user?.id ?? null,
            });
          }
        }
      } else {
        // Pré-rattachement : juste effacer la cible
        const { error } = await supabase
          .from("arrivals")
          .update({ target_crushing_file_id: null })
          .eq("id", arrivalId);
        if (error) throw error;
      }

      const purged = await maybePurgeEmptyFile(oldFileId);

      await supabase.from("audit_logs").insert({
        action: "detach_arrival",
        entity_type: "arrivals",
        entity_id: arrivalId,
        user_id: user?.id ?? null,
        new_values: { from_file: oldFileId, ticket: arrivalTicket, purged },
      });

      return { purged, code: current.file.tracking_code };
    },
    onSuccess: async (res) => {
      await invalidateAll();
      toast.success(t("assign.detached"));
      if (res?.purged) toast.success(t("assign.deleted_empty", res.code));
      setConfirmDetach(false);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function maybePurgeEmptyFile(fileId: string): Promise<boolean> {
    const { data: f } = await supabase
      .from("crushing_files")
      .select("id, status, arrival_id")
      .eq("id", fileId)
      .maybeSingle();
    if (!f) return false;
    if (!["queued", "assigned"].includes(f.status)) return false;
    const { count } = await supabase
      .from("crushing_file_arrivals")
      .select("id", { count: "exact", head: true })
      .eq("crushing_file_id", fileId);
    // Si plus aucune ligne ET plus rattaché à une arrivée principale → supprimer
    if ((count ?? 0) === 0 && !f.arrival_id) {
      await supabase.from("crushing_files").delete().eq("id", fileId);
      return true;
    }
    return false;
  }

  async function invalidateAll() {
    await qc.invalidateQueries({ queryKey: ["weighing-arrival", arrivalId] });
    await qc.invalidateQueries({ queryKey: ["weighing-arrivals"] });
    await qc.invalidateQueries({ queryKey: ["arrivals"] });
    await qc.invalidateQueries({ queryKey: ["queue-files"] });
    await qc.invalidateQueries({ queryKey: ["crushing-files"] });
    await qc.invalidateQueries({ queryKey: ["arrival-assignment", arrivalId] });
    await qc.invalidateQueries({ queryKey: ["assignment-candidates", clientId] });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Factory className="h-5 w-5 text-primary" />
              {t("assign.title")}
            </DialogTitle>
          </DialogHeader>

          {!clientId ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("assign.no_client")}
            </p>
          ) : loadingCurrent ? (
            <div className="space-y-2 py-4">
              <div className="h-10 animate-pulse rounded bg-muted" />
              <div className="h-10 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-xs font-medium uppercase text-muted-foreground">
                  {t("assign.current")}
                </div>
                {current?.file ? (
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-base font-bold tabular">
                        {current.file.tracking_code}
                      </span>
                      {current.file.net_weight_kg !== null && (
                        <span className="ms-2 text-xs text-muted-foreground tabular">
                          ({formatKg(current.file.net_weight_kg)})
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        sourceLocked
                          ? "bg-destructive/10 text-destructive"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      {current.file.status}
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 flex items-center gap-2 text-sm italic text-muted-foreground">
                    <FilePlus className="h-4 w-4" />
                    {t("assign.none")}
                  </p>
                )}
                {sourceLocked && (
                  <p className="mt-2 text-xs text-destructive">
                    {t("assign.locked")}
                  </p>
                )}
              </div>

              {!sourceLocked && (
                <div className="space-y-1.5">
                  <Label>{t("assign.change_to")}</Label>
                  {candidates && candidates.length > 0 ? (
                    <Select value={selected} onValueChange={setSelected}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t("arrival.crushing_select_file")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {candidates.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            <span className="font-mono text-sm tabular">
                              {f.tracking_code}
                            </span>
                            {f.net_weight_kg !== null && (
                              <span className="ms-2 text-xs text-muted-foreground tabular">
                                ({formatKg(f.net_weight_kg)})
                              </span>
                            )}
                            <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
                              {f.status}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="rounded border border-dashed border-border px-3 py-2 text-xs italic text-muted-foreground">
                      {t("assign.no_existing")}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <div>
              {current?.file && !sourceLocked && (
                <Button
                  variant="outline"
                  onClick={() => setConfirmDetach(true)}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Unlink className="me-1 h-4 w-4" />
                  {t("assign.detach")}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => moveOrAssign.mutate()}
                disabled={
                  !selected ||
                  sourceLocked ||
                  moveOrAssign.isPending ||
                  selected === current?.file?.id
                }
              >
                <Link2 className="me-1 h-4 w-4" />
                {moveOrAssign.isPending ? t("common.loading") : t("common.confirm")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDetach} onOpenChange={setConfirmDetach}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {current?.file
                ? t("assign.detach_confirm", current.file.tracking_code)
                : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("assign.detach_help")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => detach.mutate()}
              disabled={detach.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("assign.detach")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

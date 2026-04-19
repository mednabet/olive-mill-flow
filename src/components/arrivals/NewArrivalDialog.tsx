/**
 * Dialog de création d'une arrivée (client + véhicule + service + notes).
 * Si écrasement coché → choix nouveau dossier ou rattachement à un dossier existant du même client.
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PackageOpen, Scale, Factory, FilePlus, FileStack } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { ClientPicker } from "@/components/clients/ClientPicker";
import { ClientFormDialog } from "@/components/clients/ClientFormDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatKg } from "@/lib/format";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type WeighingType = "weigh_simple" | "weigh_double";
type CrushingTarget = "new" | "existing";

const WEIGHING_ICON: Record<WeighingType, typeof Scale> = {
  weigh_simple: Scale,
  weigh_double: Scale,
};

const WEIGHING_LABEL: Record<WeighingType, TranslationKey> = {
  weigh_simple: "arrival.service.weigh_simple",
  weigh_double: "arrival.service.weigh_double",
};

interface NewArrivalDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated?: (arrivalId: string) => void;
}

export function NewArrivalDialog({ open, onOpenChange, onCreated }: NewArrivalDialogProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [client, setClient] = useState<Client | null>(null);
  const [vehicleId, setVehicleId] = useState<string>("");
  const [weighingType, setWeighingType] = useState<WeighingType>("weigh_double");
  const [needsCrushing, setNeedsCrushing] = useState(true);
  const [crushingTarget, setCrushingTarget] = useState<CrushingTarget>("new");
  const [targetFileId, setTargetFileId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);

  const reset = () => {
    setClient(null);
    setVehicleId("");
    setWeighingType("weigh_double");
    setNeedsCrushing(true);
    setCrushingTarget("new");
    setTargetFileId("");
    setNotes("");
  };

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles", client?.id],
    queryFn: async () => {
      if (!client) return [];
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!client,
  });

  // Dossiers d'écrasement en attente pour ce client (queued / assigned)
  const { data: existingFiles } = useQuery({
    queryKey: ["client-pending-crushing-files", client?.id],
    queryFn: async () => {
      if (!client) return [];
      const { data, error } = await supabase
        .from("crushing_files")
        .select("id, tracking_code, status, net_weight_kg, created_at")
        .eq("client_id", client.id)
        .in("status", ["queued", "assigned"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!client && needsCrushing,
  });

  // Si pas de dossiers existants ou client/écrasement change → revenir à "nouveau"
  useEffect(() => {
    if (!needsCrushing) {
      setCrushingTarget("new");
      setTargetFileId("");
    }
  }, [needsCrushing]);

  useEffect(() => {
    setTargetFileId("");
    setCrushingTarget("new");
  }, [client?.id]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error(t("arrival.client_required"));
      if (
        needsCrushing &&
        crushingTarget === "existing" &&
        !targetFileId
      ) {
        throw new Error(t("arrival.crushing_select_file"));
      }
      const { data: ticketData, error: ticketErr } = await supabase.rpc("next_arrival_ticket", {
        _service_type: weighingType,
      });
      if (ticketErr) throw ticketErr;
      const ticket = ticketData as string;

      const { data, error } = await supabase
        .from("arrivals")
        .insert({
          ticket_number: ticket,
          client_id: client.id,
          vehicle_id: vehicleId || null,
          service_type: weighingType,
          needs_crushing: needsCrushing,
          target_crushing_file_id:
            needsCrushing && crushingTarget === "existing" ? targetFileId : null,
          notes: notes.trim() || null,
          created_by: user?.id ?? null,
          status: "open",
        })
        .select("id, ticket_number")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["weighing-arrivals"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success(t("arrival.created_success", data.ticket_number));
      reset();
      onCreated?.(data.id);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasExisting = (existingFiles?.length ?? 0) > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageOpen className="h-5 w-5 text-primary" />
              {t("arrival.new")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>
                {t("arrival.client")} <span className="text-destructive">*</span>
              </Label>
              <ClientPicker
                value={client}
                onChange={(c) => {
                  setClient(c);
                  setVehicleId("");
                }}
                onCreateNew={() => setShowNewClient(true)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                {t("arrival.vehicle")}{" "}
                <span className="text-xs text-muted-foreground">({t("common.optional")})</span>
              </Label>
              <Select
                value={vehicleId || "__none"}
                onValueChange={(v) => setVehicleId(v === "__none" ? "" : v)}
                disabled={!client}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      client ? t("arrival.no_vehicle") : t("arrival.select_client_first")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t("arrival.no_vehicle")}</SelectItem>
                  {vehicles?.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <span className="font-mono tabular" dir="ltr">{v.plate}</span>
                      {v.vehicle_type && (
                        <span className="ms-2 text-xs text-muted-foreground">
                          {v.vehicle_type}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>
                {t("arrival.weighing_type")} <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(["weigh_simple", "weigh_double"] as WeighingType[]).map((wt) => {
                  const Icon = WEIGHING_ICON[wt];
                  const active = weighingType === wt;
                  return (
                    <button
                      key={wt}
                      type="button"
                      onClick={() => setWeighingType(wt)}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-all",
                        active
                          ? "border-primary bg-primary/5 text-primary shadow-sm"
                          : "border-border bg-card text-foreground hover:border-primary/40",
                      )}
                    >
                      <Icon className="h-6 w-6" />
                      <span className="text-sm font-medium">{t(WEIGHING_LABEL[wt])}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={needsCrushing}
                  onCheckedChange={(c) => setNeedsCrushing(c === true)}
                  className="mt-0.5"
                />
                <span className="flex-1 space-y-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Factory className="h-4 w-4 text-primary" />
                    {t("arrival.needs_crushing")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t("arrival.needs_crushing_help")}
                  </span>
                </span>
              </label>
            </div>

            {needsCrushing && client && (
              <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <Label className="flex items-center gap-2">
                  <Factory className="h-4 w-4 text-primary" />
                  {t("arrival.crushing_target")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("arrival.crushing_target_help")}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCrushingTarget("new");
                      setTargetFileId("");
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border-2 p-3 text-start text-sm transition-all",
                      crushingTarget === "new"
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-card hover:border-primary/40",
                    )}
                  >
                    <FilePlus className="h-4 w-4" />
                    <span className="font-medium">{t("arrival.crushing_new")}</span>
                  </button>
                  <button
                    type="button"
                    disabled={!hasExisting}
                    onClick={() => setCrushingTarget("existing")}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border-2 p-3 text-start text-sm transition-all",
                      crushingTarget === "existing"
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-card hover:border-primary/40",
                      !hasExisting && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <FileStack className="h-4 w-4" />
                    <span className="flex-1 font-medium">{t("arrival.crushing_existing")}</span>
                    {hasExisting && (
                      <span className="rounded bg-primary/20 px-1.5 py-0.5 text-xs tabular">
                        {existingFiles?.length}
                      </span>
                    )}
                  </button>
                </div>

                {crushingTarget === "existing" && (
                  hasExisting ? (
                    <Select value={targetFileId} onValueChange={setTargetFileId}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("arrival.crushing_select_file")} />
                      </SelectTrigger>
                      <SelectContent>
                        {existingFiles!.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            <span className="font-mono text-sm tabular">{f.tracking_code}</span>
                            {f.net_weight_kg !== null && (
                              <span className="ms-2 text-xs text-muted-foreground tabular">
                                ({formatKg(f.net_weight_kg)})
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-xs italic text-muted-foreground">
                      {t("arrival.crushing_no_existing")}
                    </p>
                  )
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="notes">
                {t("common.notes")}{" "}
                <span className="text-xs text-muted-foreground">({t("common.optional")})</span>
              </Label>
              <Textarea
                id="notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={
                !client ||
                createMutation.isPending ||
                (needsCrushing && crushingTarget === "existing" && !targetFileId)
              }
            >
              {createMutation.isPending ? t("common.loading") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClientFormDialog
        open={showNewClient}
        onOpenChange={setShowNewClient}
        onCreated={(c) => setClient(c)}
      />
    </>
  );
}

/**
 * Dialog de création d'une arrivée (client + véhicule + service + notes).
 * Utilisé depuis le module Pesage (le module Arrivées a été supprimé).
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PackageOpen, Scale, Factory } from "lucide-react";
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

type Client = Database["public"]["Tables"]["clients"]["Row"];
type WeighingType = "weigh_simple" | "weigh_double";

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
  const [notes, setNotes] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);

  const reset = () => {
    setClient(null);
    setVehicleId("");
    setWeighingType("weigh_double");
    setNeedsCrushing(true);
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

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error(t("arrival.client_required"));
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

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
        <DialogContent className="sm:max-w-xl">
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
                {t("arrival.service")} <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(["weigh_simple", "weigh_double", "crushing"] as ServiceType[]).map((st) => {
                  const Icon = SERVICE_ICON[st];
                  const active = serviceType === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setServiceType(st)}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-all",
                        active
                          ? "border-primary bg-primary/5 text-primary shadow-sm"
                          : "border-border bg-card text-foreground hover:border-primary/40",
                      )}
                    >
                      <Icon className="h-6 w-6" />
                      <span className="text-sm font-medium">{t(SERVICE_LABEL[st])}</span>
                    </button>
                  );
                })}
              </div>
            </div>

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
              disabled={!client || createMutation.isPending}
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

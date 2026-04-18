/**
 * Panneau de gestion des véhicules d'un client.
 * Liste + ajout / suppression rapide.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Car, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  clientId: string;
}

export function VehiclesPanel({ clientId }: Props) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [plate, setPlate] = useState("");
  const [vehicleType, setVehicleType] = useState("");

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ["vehicles", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const trimmed = plate.trim().toUpperCase();
      if (trimmed.length < 2) throw new Error(t("validation.required"));
      const { error } = await supabase.from("vehicles").insert({
        client_id: clientId,
        plate: trimmed,
        vehicle_type: vehicleType.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles", clientId] });
      setPlate("");
      setVehicleType("");
      toast.success(t("vehicle.created_success"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles", clientId] });
      toast.success(t("vehicle.deleted_success"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addMutation.mutate();
        }}
        className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_auto]"
      >
        <div className="space-y-1">
          <Label htmlFor="plate" className="text-xs">
            {t("vehicle.plate")} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="plate"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="123 TUN 4567"
            dir="ltr"
            className="uppercase tabular"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="vehicle_type" className="text-xs">
            {t("vehicle.type")}
          </Label>
          <Input
            id="vehicle_type"
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
            placeholder={t("vehicle.type_placeholder")}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={addMutation.isPending} className="w-full sm:w-auto">
            <Plus className="me-1 h-4 w-4" />
            {t("common.add")}
          </Button>
        </div>
      </form>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : !vehicles || vehicles.length === 0 ? (
        <EmptyState icon={<Car className="h-5 w-5" />} title={t("vehicle.empty")} />
      ) : (
        <ul className="divide-y rounded-lg border">
          {vehicles.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex items-center gap-3">
                <Car className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-mono text-sm font-semibold tabular" dir="ltr">
                    {v.plate}
                  </div>
                  {v.vehicle_type && (
                    <div className="text-xs text-muted-foreground">{v.vehicle_type}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {v.vehicle_type && <Badge variant="secondary">{v.vehicle_type}</Badge>}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("vehicle.delete_confirm")}</AlertDialogTitle>
                      <AlertDialogDescription>{v.plate}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate(v.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t("common.delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

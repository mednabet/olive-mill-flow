/**
 * Module Arrivées : enregistrement rapide d'une arrivée client.
 * - Génération automatique d'un numéro de ticket séquentiel par jour (next_arrival_ticket)
 * - Choix du service : pesage simple, double pesage, écrasement
 * - Sélection client + véhicule optionnel
 * - Affichage du ticket imprimable après création
 * - Liste des arrivées du jour (filtre)
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PackageOpen,
  Plus,
  Search,
  Scale,
  Factory,
  Ban,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { RequireRole } from "@/components/RequireRole";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ClientPicker } from "@/components/clients/ClientPicker";
import { ClientFormDialog } from "@/components/clients/ClientFormDialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
type Arrival = Database["public"]["Tables"]["arrivals"]["Row"];
type ServiceType = Database["public"]["Enums"]["service_type"];
type ArrivalStatus = Database["public"]["Enums"]["arrival_status"];

interface EnrichedArrival extends Arrival {
  client: Client | null;
  vehicle: Vehicle | null;
}

export const Route = createFileRoute("/arrivals")({
  component: () => (
    <RequireRole roles={["admin", "superviseur", "peseur"]}>
      <ArrivalsPage />
    </RequireRole>
  ),
});

function ArrivalsPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"today" | "all">("today");
  const [showNew, setShowNew] = useState(false);

  const { data: arrivals, isLoading } = useQuery({
    queryKey: ["arrivals", filter],
    queryFn: async () => {
      let q = supabase
        .from("arrivals")
        .select("*, client:clients(*), vehicle:vehicles(*)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter === "today") {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        q = q.gte("created_at", start.toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as EnrichedArrival[];
    },
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    if (!arrivals) return [];
    const q = search.trim().toLowerCase();
    if (!q) return arrivals;
    return arrivals.filter(
      (a) =>
        a.ticket_number.toLowerCase().includes(q) ||
        (a.client?.full_name.toLowerCase().includes(q) ?? false) ||
        (a.client?.code.toLowerCase().includes(q) ?? false),
    );
  }, [arrivals, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("arrival.title")}
        subtitle={t("arrival.subtitle")}
        icon={<PackageOpen className="h-5 w-5" />}
        actions={
          <Button onClick={() => setShowNew(true)} size="lg">
            <Plus className="me-1 h-4 w-4" />
            {t("arrival.new")}
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as "today" | "all")}>
          <TabsList>
            <TabsTrigger value="today">{t("arrival.today_only")}</TabsTrigger>
            <TabsTrigger value="all">{t("arrival.all")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("arrival.search_placeholder")}
            className="ps-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<PackageOpen className="h-5 w-5" />}
          title={search ? t("common.empty") : t("arrival.empty")}
          description={
            search
              ? t("common.try_search")
              : filter === "today"
                ? t("arrival.empty_today")
                : t("arrival.empty")
          }
          action={
            !search && (
              <Button onClick={() => setShowNew(true)}>
                <Plus className="me-1 h-4 w-4" />
                {t("arrival.new")}
              </Button>
            )
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((a) => (
            <ArrivalRow key={a.id} arrival={a} />
          ))}
        </ul>
      )}

      <NewArrivalDialog
        open={showNew}
        onOpenChange={setShowNew}
        onCreated={() => {
          setShowNew(false);
        }}
      />
    </div>
  );
}

const SERVICE_ICON: Record<ServiceType, typeof Scale> = {
  weigh_simple: Scale,
  weigh_double: Scale,
  crushing: Factory,
};

const SERVICE_LABEL: Record<ServiceType, TranslationKey> = {
  weigh_simple: "arrival.service.weigh_simple",
  weigh_double: "arrival.service.weigh_double",
  crushing: "arrival.service.crushing",
};

const STATUS_LABEL: Record<ArrivalStatus, TranslationKey> = {
  open: "arrival.status.open",
  routed: "arrival.status.routed",
  closed: "arrival.status.closed",
  cancelled: "arrival.status.cancelled",
};

const STATUS_COLOR: Record<ArrivalStatus, string> = {
  open: "bg-primary/10 text-primary border-primary/30",
  routed: "bg-warning/15 text-warning-foreground border-warning/40",
  closed: "bg-success/15 text-success border-success/30",
  cancelled: "bg-muted text-muted-foreground",
};

function ArrivalRow({ arrival }: { arrival: EnrichedArrival }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const Icon = SERVICE_ICON[arrival.service_type];

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("arrivals")
        .update({ status: "cancelled" as ArrivalStatus, closed_at: new Date().toISOString() })
        .eq("id", arrival.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arrivals"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success(t("arrival.cancel_success"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isCancelled = arrival.status === "cancelled";

  return (
    <li>
      <Card className={cn("transition-shadow hover:shadow-sm", isCancelled && "opacity-60")}>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent-foreground">
            <Icon className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-base font-bold tabular tracking-wide">
                {arrival.ticket_number}
              </span>
              <Badge variant="outline" className={cn("text-xs", STATUS_COLOR[arrival.status])}>
                {t(STATUS_LABEL[arrival.status])}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {t(SERVICE_LABEL[arrival.service_type])}
              </Badge>
            </div>
            <div className="mt-1 truncate text-sm">
              {arrival.client ? (
                <>
                  <span className="font-medium">{arrival.client.full_name}</span>
                  <span className="font-mono text-xs text-muted-foreground tabular ms-2">
                    {arrival.client.code}
                  </span>
                </>
              ) : (
                <span className="italic text-muted-foreground">—</span>
              )}
              {arrival.vehicle && (
                <span className="ms-3 font-mono text-xs text-muted-foreground tabular" dir="ltr">
                  · {arrival.vehicle.plate}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground tabular">
              {new Date(arrival.created_at).toLocaleString(locale === "ar" ? "ar-TN" : "fr-FR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {!isCancelled && arrival.service_type !== "crushing" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate({ to: "/weighing" })}
              >
                <ArrowRight className="me-1 h-4 w-4" />
                {t("arrival.go_to_weighing")}
              </Button>
            )}
            {!isCancelled && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (window.confirm(t("arrival.cancel_confirm"))) cancelMutation.mutate();
                }}
                disabled={cancelMutation.isPending}
              >
                <Ban className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

/* ────────────────────────────────────────────────────────── */
/* Dialog : nouvelle arrivée                                  */
/* ────────────────────────────────────────────────────────── */

function NewArrivalDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [client, setClient] = useState<Client | null>(null);
  const [vehicleId, setVehicleId] = useState<string>("");
  const [serviceType, setServiceType] = useState<ServiceType>("weigh_simple");
  const [notes, setNotes] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);

  const reset = () => {
    setClient(null);
    setVehicleId("");
    setServiceType("weigh_simple");
    setNotes("");
  };

  // Véhicules du client sélectionné
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
      // Génère le numéro de ticket via la fonction DB
      const { data: ticketData, error: ticketErr } = await supabase.rpc("next_arrival_ticket", {
        _service_type: serviceType,
      });
      if (ticketErr) throw ticketErr;
      const ticket = ticketData as string;

      const { data, error } = await supabase
        .from("arrivals")
        .insert({
          ticket_number: ticket,
          client_id: client.id,
          vehicle_id: vehicleId || null,
          service_type: serviceType,
          notes: notes.trim() || null,
          created_by: user?.id ?? null,
          status: "open",
        })
        .select("*, client:clients(*), vehicle:vehicles(*)")
        .single();
      if (error) throw error;
      return data as unknown as EnrichedArrival;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["arrivals"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success(t("arrival.created_success", data.ticket_number));
      reset();
      onCreated();
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
            {/* Client */}
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

            {/* Véhicule */}
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

            {/* Service */}
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

            {/* Notes */}
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


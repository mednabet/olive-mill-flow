/**
 * Fiche détail d'une arrivée :
 * - En-tête : ticket, client, véhicule, service, statut, produit
 * - Pesages liés (toutes les pesées de l'arrivée)
 * - Dossier(s) d'écrasement liés (via crushing_files.arrival_id et crushing_file_arrivals)
 * - Lots de stock liés (via stock_lots.crushing_file_id du dossier d'écrasement)
 */
import type { ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, PackageOpen, Scale, Factory, Boxes, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { RequireRole } from "@/components/RequireRole";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatKg, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Arrival = Database["public"]["Tables"]["arrivals"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
type Weighing = Database["public"]["Tables"]["weighings"]["Row"];
type CrushingFile = Database["public"]["Tables"]["crushing_files"]["Row"];
type StockLot = Database["public"]["Tables"]["stock_lots"]["Row"];
type StockMovement = Database["public"]["Tables"]["stock_movements"]["Row"];
type Line = Database["public"]["Tables"]["crushing_lines"]["Row"];
type WeighingKind = Database["public"]["Enums"]["weighing_kind"];
type ServiceType = Database["public"]["Enums"]["service_type"];
type ArrivalStatus = Database["public"]["Enums"]["arrival_status"];

interface Product {
  id: string;
  code: string;
  name: string;
  color: string | null;
}

interface EnrichedArrival extends Arrival {
  client: Client | null;
  vehicle: Vehicle | null;
  weighings: Weighing[];
  product: Product | null;
}

interface EnrichedLot extends StockLot {
  movements: StockMovement[];
}

interface EnrichedCrushingFile extends CrushingFile {
  line: Line | null;
  lots: EnrichedLot[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

export const Route = createFileRoute("/arrivals/$arrivalId")({
  component: () => (
    <RequireRole roles={["admin", "superviseur", "peseur", "operateur", "caisse"]}>
      <ArrivalDetailPage />
    </RequireRole>
  ),
});

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

const KIND_LABEL: Record<WeighingKind, TranslationKey> = {
  simple: "weigh.kind.simple",
  first: "weigh.kind.first",
  second: "weigh.kind.second",
};

function ArrivalDetailPage() {
  const { arrivalId } = Route.useParams();
  const { t, locale } = useI18n();
  const navigate = useNavigate();

  const { data: arrival, isLoading } = useQuery({
    queryKey: ["arrival-detail", arrivalId],
    queryFn: async () => {
      const { data, error } = await sb
        .from("arrivals")
        .select("*, client:clients(*), vehicle:vehicles(*), weighings(*), product:products(id,code,name,color)")
        .eq("id", arrivalId)
        .maybeSingle();
      if (error) throw error;
      return (data as EnrichedArrival | null) ?? null;
    },
  });

  // Dossiers d'écrasement liés à cette arrivée :
  // - soit directement via crushing_files.arrival_id
  // - soit via la table de jointure crushing_file_arrivals
  const { data: crushingFiles } = useQuery({
    queryKey: ["arrival-crushing", arrivalId],
    queryFn: async () => {
      const { data: direct, error: e1 } = await supabase
        .from("crushing_files")
        .select("*, line:crushing_lines(*)")
        .eq("arrival_id", arrivalId);
      if (e1) throw e1;

      const { data: links, error: e2 } = await supabase
        .from("crushing_file_arrivals")
        .select("crushing_file_id")
        .eq("arrival_id", arrivalId);
      if (e2) throw e2;

      const linkedIds = (links ?? []).map((l) => l.crushing_file_id);
      const directIds = new Set((direct ?? []).map((d) => d.id));
      const missingIds = linkedIds.filter((id) => !directIds.has(id));

      let extra: (CrushingFile & { line: Line | null })[] = [];
      if (missingIds.length > 0) {
        const { data, error } = await supabase
          .from("crushing_files")
          .select("*, line:crushing_lines(*)")
          .in("id", missingIds);
        if (error) throw error;
        extra = (data ?? []) as (CrushingFile & { line: Line | null })[];
      }

      const allFiles = [...((direct ?? []) as (CrushingFile & { line: Line | null })[]), ...extra];
      if (allFiles.length === 0) return [] as EnrichedCrushingFile[];

      // Lots de stock liés à chaque dossier
      const fileIds = allFiles.map((f) => f.id);
      const { data: lots, error: lotsErr } = await supabase
        .from("stock_lots")
        .select("*, movements:stock_movements(*)")
        .in("crushing_file_id", fileIds);
      if (lotsErr) throw lotsErr;

      const lotsByFile = new Map<string, EnrichedLot[]>();
      for (const lot of (lots ?? []) as EnrichedLot[]) {
        if (!lot.crushing_file_id) continue;
        const arr = lotsByFile.get(lot.crushing_file_id) ?? [];
        arr.push(lot);
        lotsByFile.set(lot.crushing_file_id, arr);
      }

      return allFiles.map<EnrichedCrushingFile>((f) => ({
        ...f,
        lots: lotsByFile.get(f.id) ?? [],
      }));
    },
    enabled: !!arrival,
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
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/arrivals" })}>
          <ArrowLeft className="me-1 h-4 w-4" />
          {t("nav.arrivals")}
        </Button>
        <EmptyState
          icon={<PackageOpen className="h-5 w-5" />}
          title={t("arrival.empty")}
          description={t("common.empty")}
        />
      </div>
    );
  }

  const sortedWeighings = [...arrival.weighings].sort(
    (a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime(),
  );
  const simple = arrival.weighings.find((w) => w.kind === "simple");
  const first = arrival.weighings.find((w) => w.kind === "first");
  const second = arrival.weighings.find((w) => w.kind === "second");
  const net =
    simple?.weight_kg ??
    (first && second ? Math.max(0, second.weight_kg - first.weight_kg) : null);

  const isCancelled = arrival.status === "cancelled";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/arrivals">
            <ArrowLeft className="me-1 h-4 w-4" />
            {t("nav.arrivals")}
          </Link>
        </Button>
      </div>

      <PageHeader
        title={arrival.ticket_number}
        subtitle={arrival.client?.full_name ?? undefined}
        icon={<PackageOpen className="h-5 w-5" />}
        actions={
          !isCancelled && (
            <Button
              onClick={() => navigate({ to: "/weighing/$arrivalId", params: { arrivalId: arrival.id } })}
            >
              <Scale className="me-1 h-4 w-4" />
              {t("arrival.go_to_weighing")}
            </Button>
          )
        }
      />

      {/* Récap arrivée */}
      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("arrival.service")}>
            <Badge variant="secondary" className="text-xs">
              {t(SERVICE_LABEL[arrival.service_type])}
            </Badge>
          </Field>
          <Field label={t("arrival.status.open").replace(/.*/, "Statut")}>
            <Badge variant="outline" className={cn("text-xs", STATUS_COLOR[arrival.status])}>
              {t(STATUS_LABEL[arrival.status])}
            </Badge>
          </Field>
          <Field label={t("arrival.client")}>
            {arrival.client ? (
              <div>
                <div className="font-medium">{arrival.client.full_name}</div>
                <div className="font-mono text-xs text-muted-foreground tabular">
                  {arrival.client.code}
                </div>
              </div>
            ) : (
              <span className="italic text-muted-foreground">—</span>
            )}
          </Field>
          <Field label={t("arrival.vehicle")}>
            {arrival.vehicle ? (
              <span className="font-mono tabular" dir="ltr">
                {arrival.vehicle.plate}
              </span>
            ) : (
              <span className="italic text-muted-foreground">—</span>
            )}
          </Field>
          {arrival.product && (
            <Field label={t("arrival.product")}>
              <Badge
                variant="outline"
                className="text-xs"
                style={{
                  borderColor: arrival.product.color ?? undefined,
                  color: arrival.product.color ?? undefined,
                }}
              >
                {arrival.product.name}
              </Badge>
            </Field>
          )}
          <Field label={t("weigh.net")}>
            <span className="font-mono text-lg font-bold tabular text-primary">
              {net !== null ? formatKg(net) : "—"}
            </span>
          </Field>
          <Field label={t("common.created_at")}>
            <span className="text-sm tabular">
              {formatDateTime(arrival.created_at, locale === "ar" ? "ar-MA" : "fr-FR")}
            </span>
          </Field>
        </CardContent>
      </Card>

      {arrival.notes && (
        <Card>
          <CardContent className="p-4 text-sm">
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
              {t("common.notes")}
            </div>
            {arrival.notes}
          </CardContent>
        </Card>
      )}

      {/* Pesages liés */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Scale className="h-5 w-5 text-primary" />
          {t("arrival.detail.weighings")}
          <Badge variant="secondary">{sortedWeighings.length}</Badge>
        </h2>
        {sortedWeighings.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              {t("arrival.detail.no_weighings")}
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {sortedWeighings.map((w) => (
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
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground tabular">
                        {formatDateTime(w.performed_at, locale === "ar" ? "ar-MA" : "fr-FR")}
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
      </section>

      {/* Dossiers d'écrasement liés */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Factory className="h-5 w-5 text-primary" />
          {t("arrival.detail.crushing_files")}
          <Badge variant="secondary">{crushingFiles?.length ?? 0}</Badge>
        </h2>
        {!crushingFiles || crushingFiles.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              {t("arrival.detail.no_crushing")}
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {crushingFiles.map((f) => (
              <li key={f.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                      <div className="flex items-center gap-2">
                        <span className="font-mono tabular">{f.tracking_code}</span>
                        <Badge variant="outline" className="text-xs">
                          {f.status}
                        </Badge>
                        {f.priority !== "normal" && (
                          <Badge variant="secondary" className="text-xs">
                            {f.priority}
                          </Badge>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to="/queue">
                          <Printer className="me-1 h-4 w-4" />
                          {t("nav.queue")}
                        </Link>
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0 text-sm">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label={t("common.line")}>
                        {f.line ? (
                          <span className="font-mono tabular text-xs">
                            {f.line.code} — {f.line.name}
                          </span>
                        ) : (
                          <span className="italic text-muted-foreground">—</span>
                        )}
                      </Field>
                      <Field label={t("crushing.queue_position")}>
                        {f.queue_position !== null && f.queue_position !== undefined
                          ? `#${f.queue_position}`
                          : "—"}
                      </Field>
                      <Field label={t("weigh.net")}>
                        <span className="font-mono tabular font-bold">
                          {f.net_weight_kg !== null ? formatKg(f.net_weight_kg) : "—"}
                        </span>
                      </Field>
                    </div>

                    {/* Lots stock liés au dossier */}
                    {f.lots.length > 0 && (
                      <div>
                        <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
                          <Boxes className="h-3.5 w-3.5" />
                          {t("arrival.detail.stock_lots")}
                        </div>
                        <ul className="space-y-1">
                          {f.lots.map((lot) => (
                            <li
                              key={lot.id}
                              className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm"
                            >
                              <div>
                                <span className="font-mono tabular font-medium">
                                  {lot.lot_code}
                                </span>
                                <span className="ms-2 text-xs text-muted-foreground">
                                  {lot.kind}
                                </span>
                              </div>
                              <span className="font-mono tabular font-bold">
                                {formatKg(lot.quantity_kg)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

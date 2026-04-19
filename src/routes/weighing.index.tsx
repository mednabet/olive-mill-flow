/**
 * Module Pesage : liste des arrivées à peser.
 * Cliquer sur une ligne ouvre un Sheet avec le détail (récap + saisie + impression).
 * On évite ainsi une route dynamique (problème d'hydratation TanStack Start).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Scale, Search, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useI18n } from "@/lib/i18n";
import { RequireRole } from "@/components/RequireRole";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { WeighingDetailPanel } from "@/components/weighing/WeighingDetailPanel";
import { formatKg } from "@/lib/format";

type Arrival = Database["public"]["Tables"]["arrivals"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
type Weighing = Database["public"]["Tables"]["weighings"]["Row"];

interface EnrichedArrival extends Arrival {
  client: Client | null;
  vehicle: Vehicle | null;
  weighings: Weighing[];
}

export const Route = createFileRoute("/weighing/")({
  validateSearch: (search: Record<string, unknown>) => ({
    arrival: typeof search.arrival === "string" ? search.arrival : undefined,
  }),
  component: () => (
    <RequireRole roles={["admin", "superviseur", "peseur"]}>
      <WeighingListPage />
    </RequireRole>
  ),
});

type ServiceTab = "all" | "crushing" | "weigh_simple" | "weigh_double";

function WeighingListPage() {
  const { t } = useI18n();
  const { arrival: arrivalParam } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [serviceTab, setServiceTab] = useState<ServiceTab>("all");
  const [statusFilter, setStatusFilter] = useState<"pending" | "all">("pending");
  const [openArrivalId, setOpenArrivalId] = useState<string | null>(null);

  // Compat : si on arrive avec ?arrival=ID, on ouvre directement le sheet.
  useEffect(() => {
    if (arrivalParam) {
      setOpenArrivalId(arrivalParam);
    }
  }, [arrivalParam]);

  const { data: arrivals, isLoading } = useQuery({
    queryKey: ["weighing-arrivals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("arrivals")
        .select("*, client:clients(*), vehicle:vehicles(*), weighings(*)")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as EnrichedArrival[];
    },
    refetchInterval: 30_000,
  });

  const counts = useMemo(() => {
    const c = { all: 0, crushing: 0, weigh_simple: 0, weigh_double: 0 };
    if (!arrivals) return c;
    for (const a of arrivals) {
      const isPending =
        a.service_type === "weigh_double"
          ? a.weighings.length < 2
          : a.weighings.length === 0;
      if (statusFilter === "pending" && !isPending) continue;
      c.all += 1;
      if (a.service_type === "crushing") c.crushing += 1;
      else if (a.service_type === "weigh_simple") c.weigh_simple += 1;
      else if (a.service_type === "weigh_double") c.weigh_double += 1;
    }
    return c;
  }, [arrivals, statusFilter]);

  const filtered = useMemo(() => {
    if (!arrivals) return [];
    let list = arrivals;
    if (statusFilter === "pending") {
      list = list.filter((a) => {
        if (a.service_type === "weigh_simple") return a.weighings.length === 0;
        if (a.service_type === "weigh_double") return a.weighings.length < 2;
        return a.weighings.length === 0;
      });
    }
    if (serviceTab !== "all") {
      list = list.filter((a) => a.service_type === serviceTab);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (a) =>
        a.ticket_number.toLowerCase().includes(q) ||
        (a.client?.full_name.toLowerCase().includes(q) ?? false) ||
        (a.client?.code.toLowerCase().includes(q) ?? false),
    );
  }, [arrivals, search, serviceTab, statusFilter]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("weigh.title")} subtitle={t("weigh.subtitle")} icon={<Scale className="h-5 w-5" />} />

      <Tabs value={serviceTab} onValueChange={(v) => setServiceTab(v as ServiceTab)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">
            {t("common.all")}
            <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-xs tabular">{counts.all}</span>
          </TabsTrigger>
          <TabsTrigger value="crushing">
            {t("nav.crushing")}
            <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-xs tabular">{counts.crushing}</span>
          </TabsTrigger>
          <TabsTrigger value="weigh_simple">
            {t("weigh.kind.simple")}
            <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-xs tabular">{counts.weigh_simple}</span>
          </TabsTrigger>
          <TabsTrigger value="weigh_double">
            {t("weigh.kind.first")}/{t("weigh.kind.second")}
            <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-xs tabular">{counts.weigh_double}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
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
            <WeighingRow
              key={a.id}
              arrival={a}
              onOpen={() => setOpenArrivalId(a.id)}
            />
          ))}
        </ul>
      )}

      <Sheet open={!!openArrivalId} onOpenChange={(o) => !o && setOpenArrivalId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("weigh.title")}</SheetTitle>
          </SheetHeader>
          {openArrivalId && <WeighingDetailPanel arrivalId={openArrivalId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function WeighingRow({ arrival, onOpen }: { arrival: EnrichedArrival; onOpen: () => void }) {
  const { t } = useI18n();
  const simple = arrival.weighings.find((w) => w.kind === "simple");
  const first = arrival.weighings.find((w) => w.kind === "first");
  const second = arrival.weighings.find((w) => w.kind === "second");
  const isDouble = arrival.service_type === "weigh_double";
  const net =
    simple?.weight_kg ??
    (first && second ? Math.max(0, second.weight_kg - first.weight_kg) : null);
  const fullyDone = isDouble ? !!(first && second) : !!simple;

  return (
    <li>
      <Card
        className="cursor-pointer transition hover:bg-accent/30"
        onClick={onOpen}
      >
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
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </CardContent>
      </Card>
    </li>
  );
}

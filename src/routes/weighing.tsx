/**
 * Module Pesage : liste des arrivées à peser.
 * Cliquer sur une ligne ouvre la page dédiée /weighing/$arrivalId
 * (récap + saisie inline + impression).
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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

export const Route = createFileRoute("/weighing")({
  validateSearch: (search: Record<string, unknown>) => ({
    arrival: typeof search.arrival === "string" ? search.arrival : undefined,
  }),
  component: () => (
    <RequireRole roles={["admin", "superviseur", "peseur"]}>
      <WeighingListPage />
    </RequireRole>
  ),
});

function WeighingListPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { arrival: arrivalParam } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  // Compat : si quelqu'un arrive avec ?arrival=ID, on redirige vers la page dédiée.
  useEffect(() => {
    if (arrivalParam) {
      navigate({ to: "/weighing/$arrivalId", params: { arrivalId: arrivalParam }, replace: true });
    }
  }, [arrivalParam, navigate]);

  const { data: arrivals, isLoading } = useQuery({
    queryKey: ["weighing-arrivals", filter],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      let q = supabase
        .from("arrivals")
        .select("*, client:clients(*), vehicle:vehicles(*), weighings(*)")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter === "pending") q = q.gte("created_at", start.toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as EnrichedArrival[];
    },
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    if (!arrivals) return [];
    let list = arrivals;
    if (filter === "pending") {
      list = list.filter((a) => {
        if (a.service_type === "weigh_simple") return a.weighings.length === 0;
        if (a.service_type === "weigh_double") return a.weighings.length < 2;
        return a.weighings.length === 0;
      });
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (a) =>
        a.ticket_number.toLowerCase().includes(q) ||
        (a.client?.full_name.toLowerCase().includes(q) ?? false) ||
        (a.client?.code.toLowerCase().includes(q) ?? false),
    );
  }, [arrivals, search, filter]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("weigh.title")} subtitle={t("weigh.subtitle")} icon={<Scale className="h-5 w-5" />} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
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
              onOpen={() => navigate({ to: "/weighing/$arrivalId", params: { arrivalId: a.id } })}
            />
          ))}
        </ul>
      )}
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

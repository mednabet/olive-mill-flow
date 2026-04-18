/**
 * Affichage public TV : grand format, refresh 10s, plein écran.
 * Trois colonnes : file d'attente, en cours, récemment terminés.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Monitor, Maximize2, Droplets } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { formatKg } from "@/lib/format";

type CrushingFile = Database["public"]["Tables"]["crushing_files"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Line = Database["public"]["Tables"]["crushing_lines"]["Row"];

interface Enriched extends CrushingFile {
  client: Client | null;
  line: Line | null;
}

export const Route = createFileRoute("/public-display")({
  component: PublicDisplayPage,
});

function PublicDisplayPage() {
  const { t, locale } = useI18n();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const { data } = useQuery({
    queryKey: ["public-display"],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const [queued, inProg, done] = await Promise.all([
        supabase
          .from("crushing_files")
          .select("*, client:clients(*), line:crushing_lines!assigned_line_id(*)")
          .in("status", ["queued", "assigned"])
          .order("created_at", { ascending: true })
          .limit(20),
        supabase
          .from("crushing_files")
          .select("*, client:clients(*), line:crushing_lines!assigned_line_id(*)")
          .eq("status", "in_progress")
          .order("started_at", { ascending: true })
          .limit(20),
        supabase
          .from("crushing_files")
          .select("*, client:clients(*), line:crushing_lines!assigned_line_id(*)")
          .eq("status", "completed")
          .gte("completed_at", start.toISOString())
          .order("completed_at", { ascending: false })
          .limit(15),
      ]);
      return {
        queued: (queued.data ?? []) as unknown as Enriched[],
        inProgress: (inProg.data ?? []) as unknown as Enriched[],
        done: (done.data ?? []) as unknown as Enriched[],
      };
    },
    refetchInterval: 10_000,
  });

  const goFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  return (
    <div className="min-h-screen bg-sidebar text-sidebar-foreground">
      <header className="flex items-center justify-between border-b border-sidebar-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Droplets className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xl font-bold">{t("app.title")}</div>
            <div className="text-xs text-sidebar-foreground/70">{t("pub.title")}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-end">
            <div className="font-mono text-3xl font-bold tabular leading-none">
              {now.toLocaleTimeString(locale === "ar" ? "ar-MA" : "fr-MA", { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="text-xs text-sidebar-foreground/70">
              {now.toLocaleDateString(locale === "ar" ? "ar-MA" : "fr-MA", { dateStyle: "full" })}
            </div>
          </div>
          <LanguageSwitcher />
          <Button variant="ghost" size="sm" onClick={goFullscreen} className="text-sidebar-foreground hover:bg-sidebar-accent">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="grid gap-4 p-6 lg:grid-cols-3">
        <Column title={t("pub.queue")} tone="info" items={data?.queued ?? []} kind="queued" />
        <Column title={t("pub.in_progress")} tone="warning" items={data?.inProgress ?? []} kind="inProgress" />
        <Column title={t("pub.completed")} tone="success" items={data?.done ?? []} kind="done" />
      </main>
    </div>
  );
}

function Column({
  title,
  tone,
  items,
  kind,
}: {
  title: string;
  tone: "info" | "warning" | "success";
  items: Enriched[];
  kind: "queued" | "inProgress" | "done";
}) {
  const { t } = useI18n();
  const TONE_BG = {
    info: "bg-primary/15 text-sidebar-foreground border-primary/30",
    warning: "bg-warning/20 text-sidebar-foreground border-warning/40",
    success: "bg-success/15 text-sidebar-foreground border-success/40",
  } as const;

  return (
    <section className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-4">
      <h2 className={`mb-3 rounded-md border px-3 py-2 text-center text-lg font-bold uppercase tracking-wider ${TONE_BG[tone]}`}>
        {title} <span className="font-mono tabular">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <div className="py-12 text-center text-sm text-sidebar-foreground/60">{t("pub.no_queue")}</div>
      ) : (
        <ul className="space-y-2">
          {items.map((f, idx) => (
            <li key={f.id} className="flex items-center gap-3 rounded-md bg-sidebar/60 p-3">
              {kind === "queued" && (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground text-2xl font-bold tabular">
                  {idx + 1}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-mono text-lg font-bold tabular tracking-wide">{f.tracking_code}</div>
                <div className="truncate text-sm">{f.client?.full_name ?? "—"}</div>
                {f.net_weight_kg !== null && (
                  <div className="text-xs text-sidebar-foreground/70 tabular">{formatKg(f.net_weight_kg)}</div>
                )}
              </div>
              {f.line && (
                <div className="rounded-md border border-sidebar-border bg-sidebar-primary/20 px-2 py-1 text-xs font-bold uppercase">
                  {f.line.code}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

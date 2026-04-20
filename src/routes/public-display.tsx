/**
 * Affichage public TV : grand format, refresh 10s, plein écran.
 * Trois colonnes : file d'attente, en cours, récemment terminés.
 * Optimisé pour la lecture à distance : typographie XXL, contrastes forts,
 * informations hiérarchisées (ticket > client > poids/ligne/temps).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, Droplets, Clock, CheckCircle2, ListOrdered, Factory } from "lucide-react";
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

  const { data, dataUpdatedAt } = useQuery({
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

  const dateLocale = locale === "ar" ? "ar-MA" : "fr-MA";

  return (
    <div className="min-h-screen bg-sidebar text-sidebar-foreground">
      <header className="flex items-center justify-between border-b-2 border-sidebar-border bg-sidebar-accent/30 px-8 py-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-lg">
            <Droplets className="h-7 w-7" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight">{t("app.title")}</div>
            <div className="text-sm font-medium text-sidebar-foreground/70">{t("pub.title")}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-end">
            <div className="font-mono text-4xl font-bold tabular leading-none">
              {now.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="mt-1 text-sm text-sidebar-foreground/70">
              {now.toLocaleDateString(dateLocale, { dateStyle: "full" })}
            </div>
          </div>
          <LanguageSwitcher />
          <Button
            variant="ghost"
            size="sm"
            onClick={goFullscreen}
            className="text-sidebar-foreground hover:bg-sidebar-accent"
            title={t("pub.fullscreen")}
          >
            <Maximize2 className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="grid gap-5 p-6 lg:grid-cols-3">
        <Column
          title={t("pub.queue")}
          tone="info"
          icon={<ListOrdered className="h-6 w-6" />}
          items={data?.queued ?? []}
          kind="queued"
          now={now}
          dateLocale={dateLocale}
        />
        <Column
          title={t("pub.in_progress")}
          tone="warning"
          icon={<Factory className="h-6 w-6" />}
          items={data?.inProgress ?? []}
          kind="inProgress"
          now={now}
          dateLocale={dateLocale}
        />
        <Column
          title={t("pub.completed")}
          tone="success"
          icon={<CheckCircle2 className="h-6 w-6" />}
          items={data?.done ?? []}
          kind="done"
          now={now}
          dateLocale={dateLocale}
        />
      </main>

      <footer className="flex items-center justify-center gap-2 px-6 pb-4 text-xs text-sidebar-foreground/50">
        <Clock className="h-3 w-3" />
        {t("pub.last_update")}:{" "}
        <span className="font-mono tabular">
          {new Date(dataUpdatedAt).toLocaleTimeString(dateLocale, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      </footer>
    </div>
  );
}

const TONE_STYLES = {
  info: {
    header: "bg-primary text-primary-foreground border-primary",
    card: "border-primary/30",
    badge: "bg-primary text-primary-foreground",
  },
  warning: {
    header: "bg-warning text-warning-foreground border-warning",
    card: "border-warning/40 bg-warning/5",
    badge: "bg-warning text-warning-foreground",
  },
  success: {
    header: "bg-success text-success-foreground border-success",
    card: "border-success/30",
    badge: "bg-success text-success-foreground",
  },
} as const;

function Column({
  title,
  tone,
  icon,
  items,
  kind,
  now,
  dateLocale,
}: {
  title: string;
  tone: "info" | "warning" | "success";
  icon: React.ReactNode;
  items: Enriched[];
  kind: "queued" | "inProgress" | "done";
  now: Date;
  dateLocale: string;
}) {
  const { t } = useI18n();
  const styles = TONE_STYLES[tone];

  return (
    <section className="flex flex-col rounded-2xl border-2 border-sidebar-border bg-sidebar-accent/30 p-3 shadow-xl">
      <h2
        className={`mb-3 flex items-center justify-between gap-3 rounded-xl border-2 px-5 py-3 text-xl font-bold uppercase tracking-wider shadow ${styles.header}`}
      >
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        <span className="rounded-md bg-black/20 px-3 py-0.5 font-mono text-2xl tabular">
          {items.length}
        </span>
      </h2>
      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-16 text-center text-base text-sidebar-foreground/60">
          {t("pub.no_queue")}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((f, idx) => (
            <li
              key={f.id}
              className={`flex items-center gap-3 rounded-xl border-2 bg-sidebar/70 p-3 ${styles.card} ${
                kind === "queued" && idx === 0 ? "ring-2 ring-primary ring-offset-2 ring-offset-sidebar" : ""
              }`}
            >
              {/* Numéro de position (queue) ou pulse animé (in progress) */}
              {kind === "queued" && (
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-3xl font-extrabold tabular shadow-md ${styles.badge}`}
                >
                  {idx + 1}
                </div>
              )}
              {kind === "inProgress" && (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-warning/20 text-warning">
                  <span className="relative flex h-4 w-4">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75" />
                    <span className="relative inline-flex h-4 w-4 rounded-full bg-warning" />
                  </span>
                </div>
              )}
              {kind === "done" && (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-success/20 text-success">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                {/* Ticket — info principale, très grande */}
                <div className="font-mono text-2xl font-extrabold tabular tracking-wide leading-tight">
                  {f.tracking_code}
                </div>
                {/* Client — secondaire */}
                <div className="truncate text-base font-medium text-sidebar-foreground/90">
                  {f.client?.full_name ?? "—"}
                </div>
                {/* Métadonnées : poids + temps */}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-sidebar-foreground/70">
                  {f.net_weight_kg !== null && (
                    <span className="tabular">
                      <span className="font-semibold text-sidebar-foreground">
                        {formatKg(f.net_weight_kg)}
                      </span>
                    </span>
                  )}
                  {kind === "inProgress" && f.started_at && (
                    <span className="flex items-center gap-1 tabular">
                      <Clock className="h-3.5 w-3.5" />
                      {formatElapsed(f.started_at, now, t)}
                    </span>
                  )}
                  {kind === "done" && f.completed_at && (
                    <span className="tabular">
                      {t("pub.completed_at")}{" "}
                      <span className="font-semibold text-sidebar-foreground">
                        {new Date(f.completed_at).toLocaleTimeString(dateLocale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Badge ligne — visible et lisible */}
              {f.line && (
                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-sidebar-border bg-sidebar-primary px-3 py-2 text-sidebar-primary-foreground shadow">
                  <div className="text-[10px] font-medium uppercase opacity-80 leading-none">
                    {t("pub.line")}
                  </div>
                  <div className="font-mono text-lg font-bold tabular leading-tight">
                    {f.line.code}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatElapsed(startedAt: string, now: Date, t: (k: "pub.elapsed") => string): string {
  const diffMs = now.getTime() - new Date(startedAt).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 60) return `${t("pub.elapsed")} ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${t("pub.elapsed")} ${hours}h${mins.toString().padStart(2, "0")}`;
}

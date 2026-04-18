/**
 * Module Production : enregistre les résultats d'écrasement.
 * - Sélection d'un dossier in_progress / completed
 * - Saisie input/oil/pomace/losses, calcul rendement automatique
 * - Avertissement si bilan incohérent
 * - Création automatique d'un lot d'huile client
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Factory, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { RequireRole } from "@/components/RequireRole";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatKg, formatPercent, formatDateTime } from "@/lib/format";

type Production = Database["public"]["Tables"]["production_records"]["Row"];
type CrushingFile = Database["public"]["Tables"]["crushing_files"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Line = Database["public"]["Tables"]["crushing_lines"]["Row"];

interface EnrichedRecord extends Production {
  crushing_file: (CrushingFile & { client: Client | null }) | null;
  line: Line | null;
}

interface EligibleFile extends CrushingFile {
  client: Client | null;
}

export const Route = createFileRoute("/production")({
  component: () => (
    <RequireRole roles={["admin", "superviseur", "operateur"]}>
      <ProductionPage />
    </RequireRole>
  ),
});

function ProductionPage() {
  const { t } = useI18n();
  const [showNew, setShowNew] = useState(false);

  const { data: records, isLoading } = useQuery({
    queryKey: ["production"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_records")
        .select("*, crushing_file:crushing_files(*, client:clients(*)), line:crushing_lines(*)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as EnrichedRecord[];
    },
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("prod.title")}
        subtitle={t("prod.subtitle")}
        icon={<Factory className="h-5 w-5" />}
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus className="me-1 h-4 w-4" />
            {t("prod.new")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : !records || records.length === 0 ? (
        <EmptyState icon={<Factory className="h-5 w-5" />} title={t("prod.empty")} action={<Button onClick={() => setShowNew(true)}><Plus className="me-1 h-4 w-4" />{t("prod.new")}</Button>} />
      ) : (
        <ul className="space-y-2">
          {records.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
                  <div className="sm:col-span-2">
                    <div className="font-mono text-sm font-bold tabular">{r.crushing_file?.tracking_code}</div>
                    <div className="text-sm">{r.crushing_file?.client?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground tabular">{formatDateTime(r.created_at)}</div>
                  </div>
                  <Stat label={t("prod.input")} value={formatKg(r.input_kg)} />
                  <Stat label={t("prod.oil")} value={formatKg(r.oil_kg)} accent />
                  <Stat label={t("prod.pomace")} value={formatKg(r.pomace_kg)} />
                  <Stat label={t("prod.yield")} value={formatPercent(r.yield_percent)} accent />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <NewProductionDialog open={showNew} onOpenChange={setShowNew} />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`tabular font-mono text-base ${accent ? "font-bold text-primary" : "font-semibold"}`}>{value}</div>
    </div>
  );
}

function NewProductionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [fileId, setFileId] = useState("");
  const [lineId, setLineId] = useState("");
  const [input, setInput] = useState("");
  const [oil, setOil] = useState("");
  const [pomace, setPomace] = useState("");
  const [losses, setLosses] = useState("0");
  const [duration, setDuration] = useState("");

  const { data: files } = useQuery({
    queryKey: ["production-eligible"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crushing_files")
        .select("*, client:clients(*)")
        .in("status", ["in_progress", "completed"])
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as EligibleFile[];
    },
    enabled: open,
  });

  const { data: lines } = useQuery({
    queryKey: ["lines"],
    queryFn: async () => {
      const { data, error } = await supabase.from("crushing_lines").select("*").eq("is_active", true).order("code");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const inN = parseFloat(input) || 0;
  const oilN = parseFloat(oil) || 0;
  const pomN = parseFloat(pomace) || 0;
  const losN = parseFloat(losses) || 0;
  const yieldPct = inN > 0 ? (oilN / inN) * 100 : 0;
  const balance = oilN + pomN + losN;
  const balanceOk = inN === 0 || Math.abs(inN - balance) <= inN * 0.02;

  const reset = () => {
    setFileId(""); setLineId(""); setInput(""); setOil(""); setPomace(""); setLosses("0"); setDuration("");
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!fileId) throw new Error(t("prod.select_file"));
      if (inN <= 0 || oilN <= 0) throw new Error(t("validation.positive"));
      const file = files?.find((f) => f.id === fileId);
      const { error } = await supabase.from("production_records").insert({
        crushing_file_id: fileId,
        line_id: lineId || null,
        input_kg: inN,
        oil_kg: oilN,
        pomace_kg: pomN,
        losses_kg: losN,
        yield_percent: yieldPct,
        duration_minutes: duration ? parseInt(duration, 10) : null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;

      // Crée automatiquement un lot d'huile client
      if (file?.client_id) {
        const { data: lotCode } = await supabase.rpc("next_lot_code", { _kind: "client_oil" });
        const { data: lot, error: lotErr } = await supabase
          .from("stock_lots")
          .insert({
            kind: "client_oil",
            lot_code: lotCode as string,
            client_id: file.client_id,
            crushing_file_id: fileId,
            quantity_kg: 0,
          })
          .select("id")
          .single();
        if (!lotErr && lot) {
          await supabase.from("stock_movements").insert({
            lot_id: lot.id,
            movement_type: "in",
            quantity_kg: oilN,
            reason: "production",
            reference_id: fileId,
            created_by: user?.id ?? null,
          });
        }
      }
      return yieldPct;
    },
    onSuccess: (y) => {
      qc.invalidateQueries({ queryKey: ["production"] });
      qc.invalidateQueries({ queryKey: ["stock-lots"] });
      toast.success(t("prod.saved", y.toFixed(1)));
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("prod.new")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("prod.select_file")} *</Label>
            <Select value={fileId} onValueChange={setFileId}>
              <SelectTrigger><SelectValue placeholder={t("prod.select_file")} /></SelectTrigger>
              <SelectContent>
                {files?.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    <span className="font-mono">{f.tracking_code}</span> — {f.client?.full_name ?? "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("prod.line")}</Label>
            <Select value={lineId} onValueChange={setLineId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {lines?.map((l) => <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("prod.input")} value={input} onChange={setInput} />
            <Field label={t("prod.oil")} value={oil} onChange={setOil} />
            <Field label={t("prod.pomace")} value={pomace} onChange={setPomace} />
            <Field label={t("prod.losses")} value={losses} onChange={setLosses} />
            <Field label={t("prod.duration")} value={duration} onChange={setDuration} step="1" />
            <div>
              <Label>{t("prod.yield")}</Label>
              <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 font-mono text-base font-bold tabular">
                {yieldPct.toFixed(1)} %
              </div>
            </div>
          </div>

          {!balanceOk && (
            <div className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning-foreground">
              ⚠ {t("prod.balance_warning")}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, step = "0.1" }: { label: string; value: string; onChange: (v: string) => void; step?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" inputMode="decimal" step={step} min="0" value={value} onChange={(e) => onChange(e.target.value)} className="font-mono tabular" />
    </div>
  );
}

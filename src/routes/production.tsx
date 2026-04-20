/**
 * Module Production : enregistre les résultats d'écrasement.
 * - Liste filtrable (date, ligne, opérateur) avec totaux période + badge rendement
 * - Création : pré-remplit input depuis le dossier, calcule pertes auto,
 *   peut marquer le dossier completed
 * - Édition / suppression avec ajustement du stock client
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Factory, Plus, Pencil, Trash2, Filter } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatKg, formatPercent, formatDateTime } from "@/lib/format";

type Production = Database["public"]["Tables"]["production_records"]["Row"];
type CrushingFile = Database["public"]["Tables"]["crushing_files"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Line = Database["public"]["Tables"]["crushing_lines"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface EnrichedRecord extends Production {
  crushing_file:
    | (CrushingFile & {
        client: Client | null;
        arrival:
          | {
              product:
                | {
                    name: string;
                    avg_yield_percent: number | null;
                  }
                | null;
            }
          | null;
      })
    | null;
  line: Line | null;
}

interface EligibleFile extends CrushingFile {
  client: Client | null;
  arrival:
    | {
        product:
          | {
              id: string;
              name: string;
              avg_yield_percent: number | null;
            }
          | null;
      }
    | null;
}

export const Route = createFileRoute("/production")({
  component: () => (
    <RequireRole roles={["admin", "superviseur", "operateur"]}>
      <ProductionPage />
    </RequireRole>
  ),
});

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function ProductionPage() {
  const { t } = useI18n();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<EnrichedRecord | null>(null);
  const [deleting, setDeleting] = useState<EnrichedRecord | null>(null);

  // Filtres
  const [from, setFrom] = useState<string>(todayISO());
  const [to, setTo] = useState<string>("");
  const [lineFilter, setLineFilter] = useState<string>("all");
  const [opFilter, setOpFilter] = useState<string>("all");

  const { data: lines } = useQuery({
    queryKey: ["lines-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crushing_lines")
        .select("*")
        .order("code");
      if (error) throw error;
      return data as Line[];
    },
  });

  const { data: operators } = useQuery({
    queryKey: ["profiles-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,username")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data as Pick<Profile, "id" | "full_name" | "username">[];
    },
  });

  const { data: records, isLoading } = useQuery({
    queryKey: ["production", from, to, lineFilter, opFilter],
    queryFn: async () => {
      let q = supabase
        .from("production_records")
        .select(
          "*, crushing_file:crushing_files(*, client:clients(*), arrival:arrivals(product:products(name,avg_yield_percent))), line:crushing_lines(*)"
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (from) q = q.gte("created_at", new Date(from).toISOString());
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }
      if (lineFilter !== "all") q = q.eq("line_id", lineFilter);
      if (opFilter !== "all") q = q.contains("operator_ids", [opFilter]);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as EnrichedRecord[];
    },
    refetchInterval: 30_000,
  });

  const totals = useMemo(() => {
    const list = records ?? [];
    const input = list.reduce((s, r) => s + (r.input_kg ?? 0), 0);
    const oil = list.reduce((s, r) => s + (r.oil_kg ?? 0), 0);
    const pomace = list.reduce((s, r) => s + (r.pomace_kg ?? 0), 0);
    const avgYield = input > 0 ? (oil / input) * 100 : 0;
    return { input, oil, pomace, avgYield, count: list.length };
  }, [records]);

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

      {/* Filtres */}
      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 text-xs">
              <Filter className="h-3 w-3" /> {t("prod.filter_from")}
            </Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("prod.filter_to")}</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("prod.filter_line")}</Label>
            <Select value={lineFilter} onValueChange={setLineFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("prod.filter_all_lines")}</SelectItem>
                {lines?.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.code} — {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("prod.filter_operator")}</Label>
            <Select value={opFilter} onValueChange={setOpFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("prod.filter_all_operators")}</SelectItem>
                {operators?.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.full_name || o.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setFrom("");
                setTo("");
                setLineFilter("all");
                setOpFilter("all");
              }}
            >
              ✕
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Totaux période */}
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label={t("prod.records_count")} value={String(totals.count)} />
          <Stat label={t("prod.input")} value={formatKg(totals.input)} />
          <Stat label={t("prod.oil")} value={formatKg(totals.oil)} accent />
          <Stat label={t("prod.pomace")} value={formatKg(totals.pomace)} />
          <Stat
            label={t("prod.avg_yield")}
            value={formatPercent(totals.avgYield)}
            accent
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : !records || records.length === 0 ? (
        <EmptyState
          icon={<Factory className="h-5 w-5" />}
          title={t("prod.empty")}
          action={
            <Button onClick={() => setShowNew(true)}>
              <Plus className="me-1 h-4 w-4" />
              {t("prod.new")}
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {records.map((r) => {
            const ref = r.crushing_file?.arrival?.product?.avg_yield_percent ?? null;
            const yieldVal = r.yield_percent ?? 0;
            let yieldVariant: "default" | "secondary" | "destructive" = "secondary";
            if (ref !== null) {
              if (yieldVal >= ref) yieldVariant = "default";
              else if (yieldVal < ref - 2) yieldVariant = "destructive";
            }
            return (
              <li key={r.id}>
                <Card>
                  <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-7">
                    <div className="lg:col-span-2">
                      <div className="font-mono text-sm font-bold tabular">
                        {r.crushing_file?.tracking_code}
                      </div>
                      <div className="text-sm">
                        {r.crushing_file?.client?.full_name ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground tabular">
                        {formatDateTime(r.created_at)}
                        {r.line ? ` • ${r.line.code}` : ""}
                      </div>
                    </div>
                    <Stat label={t("prod.input")} value={formatKg(r.input_kg)} />
                    <Stat label={t("prod.oil")} value={formatKg(r.oil_kg)} accent />
                    <Stat label={t("prod.pomace")} value={formatKg(r.pomace_kg)} />
                    <div>
                      <div className="text-xs uppercase text-muted-foreground">
                        {t("prod.yield")}
                      </div>
                      <Badge variant={yieldVariant} className="font-mono tabular">
                        {formatPercent(yieldVal)}
                      </Badge>
                      {ref !== null && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {t("prod.yield_vs_avg", formatPercent(ref))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(r)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDeleting(r)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ProductionDialog
        open={showNew}
        onOpenChange={setShowNew}
        record={null}
      />
      <ProductionDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        record={editing}
      />
      <DeleteProductionDialog
        record={deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div
        className={`tabular font-mono text-base ${
          accent ? "font-bold text-primary" : "font-semibold"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ProductionDialog({
  open,
  onOpenChange,
  record,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  record: EnrichedRecord | null;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const isEdit = !!record;

  const [fileId, setFileId] = useState("");
  const [lineId, setLineId] = useState("");
  const [input, setInput] = useState("");
  const [oil, setOil] = useState("");
  const [pomace, setPomace] = useState("");
  const [duration, setDuration] = useState("");
  const [completeAfter, setCompleteAfter] = useState(true);

  // Reset à l'ouverture
  useEffect(() => {
    if (!open) return;
    if (record) {
      setFileId(record.crushing_file_id);
      setLineId(record.line_id ?? "");
      setInput(String(record.input_kg ?? ""));
      setOil(String(record.oil_kg ?? ""));
      setPomace(String(record.pomace_kg ?? ""));
      setDuration(record.duration_minutes ? String(record.duration_minutes) : "");
      setCompleteAfter(false);
    } else {
      setFileId("");
      setLineId("");
      setInput("");
      setOil("");
      setPomace("");
      setDuration("");
      setCompleteAfter(true);
    }
  }, [open, record]);

  const { data: files } = useQuery({
    queryKey: ["production-eligible", isEdit, record?.id],
    queryFn: async () => {
      // En édition : on inclut le dossier du record + dossiers in_progress
      const statuses: Database["public"]["Enums"]["crushing_status"][] = isEdit
        ? ["in_progress", "completed", "assigned"]
        : ["in_progress", "assigned"];
      const { data, error } = await supabase
        .from("crushing_files")
        .select(
          "*, client:clients(*), arrival:arrivals(product:products(id,name,avg_yield_percent))"
        )
        .in("status", statuses)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as EligibleFile[];
    },
    enabled: open,
  });

  const { data: lines } = useQuery({
    queryKey: ["lines-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crushing_lines")
        .select("*")
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return data as Line[];
    },
    enabled: open,
  });

  const selectedFile = files?.find((f) => f.id === fileId);

  // Pré-remplir input quand on choisit un dossier (si nouveau)
  useEffect(() => {
    if (!isEdit && selectedFile && !input) {
      const net = selectedFile.net_weight_kg ?? selectedFile.gross_weight_kg ?? 0;
      if (net > 0) setInput(String(net));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  const inN = parseFloat(input) || 0;
  const oilN = parseFloat(oil) || 0;
  const pomN = parseFloat(pomace) || 0;
  const losN = Math.max(0, inN - oilN - pomN);
  const yieldPct = inN > 0 ? (oilN / inN) * 100 : 0;
  const refYield = selectedFile?.arrival?.product?.avg_yield_percent ?? null;

  const balanceOk = inN === 0 || oilN + pomN <= inN * 1.001;

  const save = useMutation({
    mutationFn: async () => {
      if (!fileId) throw new Error(t("prod.select_file"));
      if (inN <= 0 || oilN <= 0) throw new Error(t("validation.positive"));
      if (oilN + pomN > inN * 1.05)
        throw new Error(t("prod.balance_warning"));

      if (isEdit && record) {
        // UPDATE
        const oldOil = record.oil_kg ?? 0;
        const { error } = await supabase
          .from("production_records")
          .update({
            crushing_file_id: fileId,
            line_id: lineId || null,
            input_kg: inN,
            oil_kg: oilN,
            pomace_kg: pomN,
            losses_kg: losN,
            yield_percent: yieldPct,
            duration_minutes: duration ? parseInt(duration, 10) : null,
          })
          .eq("id", record.id);
        if (error) throw error;

        // Ajustement stock huile si quantité a changé
        const delta = oilN - oldOil;
        if (delta !== 0 && record.crushing_file_id) {
          const { data: lots } = await supabase
            .from("stock_lots")
            .select("id")
            .eq("crushing_file_id", record.crushing_file_id)
            .eq("kind", "client_oil")
            .limit(1);
          const lotId = lots?.[0]?.id;
          if (lotId) {
            await supabase.from("stock_movements").insert({
              lot_id: lotId,
              movement_type: "adjustment",
              quantity_kg: delta,
              reason: "production_update",
              reference_id: record.id,
              created_by: user?.id ?? null,
            });
          }
        }

        await supabase.from("audit_logs").insert({
          action: "edit_production",
          entity_type: "production_records",
          entity_id: record.id,
          user_id: user?.id ?? null,
          old_values: {
            input_kg: record.input_kg,
            oil_kg: record.oil_kg,
            pomace_kg: record.pomace_kg,
          },
          new_values: { input_kg: inN, oil_kg: oilN, pomace_kg: pomN },
        });

        return yieldPct;
      }

      // INSERT
      const file = files?.find((f) => f.id === fileId);
      const { data: inserted, error } = await supabase
        .from("production_records")
        .insert({
          crushing_file_id: fileId,
          line_id: lineId || null,
          input_kg: inN,
          oil_kg: oilN,
          pomace_kg: pomN,
          losses_kg: losN,
          yield_percent: yieldPct,
          duration_minutes: duration ? parseInt(duration, 10) : null,
          operator_ids: user?.id ? [user.id] : [],
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Lot huile client
      if (file?.client_id) {
        const { data: lotCode } = await supabase.rpc("next_lot_code", {
          _kind: "client_oil",
        });
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
            reference_id: inserted.id,
            created_by: user?.id ?? null,
          });
        }
      }

      // Marquer le dossier completed
      if (completeAfter && file && file.status !== "completed") {
        await supabase
          .from("crushing_files")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", fileId);
      }

      return yieldPct;
    },
    onSuccess: (y) => {
      qc.invalidateQueries({ queryKey: ["production"] });
      qc.invalidateQueries({ queryKey: ["stock-lots"] });
      qc.invalidateQueries({ queryKey: ["crushing-files"] });
      toast.success(
        isEdit ? t("prod.updated") : t("prod.saved", y.toFixed(1))
      );
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("prod.edit") : t("prod.new")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("prod.edit") : t("prod.new")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("prod.select_file")} *</Label>
            <Select value={fileId} onValueChange={setFileId} disabled={isEdit}>
              <SelectTrigger>
                <SelectValue placeholder={t("prod.select_file")} />
              </SelectTrigger>
              <SelectContent>
                {files && files.length === 0 && (
                  <div className="px-2 py-3 text-xs text-muted-foreground">
                    {t("prod.no_eligible")}
                  </div>
                )}
                {files?.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    <span className="font-mono">{f.tracking_code}</span> —{" "}
                    {f.client?.full_name ?? "—"}
                    {f.net_weight_kg ? ` (${formatKg(f.net_weight_kg)})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("prod.line")}</Label>
            <Select value={lineId} onValueChange={setLineId}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {lines?.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.code} — {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("prod.input")}</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="font-mono tabular"
              />
              {!isEdit && selectedFile && (
                <p className="text-[10px] text-muted-foreground">
                  {t("prod.input_auto")}
                </p>
              )}
            </div>
            <Field label={t("prod.oil")} value={oil} onChange={setOil} />
            <Field label={t("prod.pomace")} value={pomace} onChange={setPomace} />
            <div className="space-y-1.5">
              <Label>{t("prod.losses")}</Label>
              <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 font-mono text-base tabular">
                {losN.toFixed(1)}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {t("prod.losses_auto")}
              </p>
            </div>
            <Field
              label={t("prod.duration")}
              value={duration}
              onChange={setDuration}
              step="1"
            />
            <div>
              <Label>{t("prod.yield")}</Label>
              <div className="flex h-10 items-center justify-between rounded-md border border-input bg-muted/40 px-3 font-mono text-base font-bold tabular">
                <span>{yieldPct.toFixed(1)} %</span>
                {refYield !== null && (
                  <span className="text-[10px] font-normal text-muted-foreground">
                    réf {refYield.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          {!balanceOk && (
            <div className="rounded-md bg-destructive/15 px-3 py-2 text-xs text-destructive">
              ⚠ {t("prod.balance_warning")}
            </div>
          )}

          {!isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={completeAfter}
                onCheckedChange={(c) => setCompleteAfter(!!c)}
              />
              <span>{t("prod.complete_after")}</span>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !fileId || inN <= 0 || oilN <= 0}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteProductionDialog({
  record,
  onOpenChange,
}: {
  record: EnrichedRecord | null;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();

  const del = useMutation({
    mutationFn: async () => {
      if (!record) return;
      // Ajuster stock : sortir l'huile produite
      if (record.crushing_file_id && record.oil_kg > 0) {
        const { data: lots } = await supabase
          .from("stock_lots")
          .select("id")
          .eq("crushing_file_id", record.crushing_file_id)
          .eq("kind", "client_oil")
          .limit(1);
        const lotId = lots?.[0]?.id;
        if (lotId) {
          await supabase.from("stock_movements").insert({
            lot_id: lotId,
            movement_type: "out",
            quantity_kg: record.oil_kg,
            reason: "production_delete",
            reference_id: record.id,
            created_by: user?.id ?? null,
          });
        }
      }

      const { error } = await supabase
        .from("production_records")
        .delete()
        .eq("id", record.id);
      if (error) throw error;

      await supabase.from("audit_logs").insert({
        action: "delete_production",
        entity_type: "production_records",
        entity_id: record.id,
        user_id: user?.id ?? null,
        old_values: {
          input_kg: record.input_kg,
          oil_kg: record.oil_kg,
          pomace_kg: record.pomace_kg,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production"] });
      qc.invalidateQueries({ queryKey: ["stock-lots"] });
      toast.success(t("prod.deleted"));
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AlertDialog open={!!record} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("prod.delete")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("prod.delete_confirm")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              del.mutate();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("prod.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Field({
  label,
  value,
  onChange,
  step = "0.1",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        inputMode="decimal"
        step={step}
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono tabular"
      />
    </div>
  );
}

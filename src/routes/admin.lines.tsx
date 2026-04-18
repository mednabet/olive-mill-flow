/**
 * Page admin : gestion des lignes d'écrasement (CRUD).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Factory, Plus, Edit, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { RequireRole } from "@/components/RequireRole";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Line = Database["public"]["Tables"]["crushing_lines"]["Row"];
type LineStatus = Database["public"]["Enums"]["line_status"];

const STATUS_LABEL: Record<LineStatus, TranslationKey> = {
  available: "admin.lines.status.available",
  busy: "admin.lines.status.busy",
  maintenance: "admin.lines.status.maintenance",
  offline: "admin.lines.status.offline",
};
const STATUS_TONE: Record<LineStatus, "success" | "warning" | "info" | "muted"> = {
  available: "success",
  busy: "warning",
  maintenance: "info",
  offline: "muted",
};

export const Route = createFileRoute("/admin/lines")({
  component: () => (
    <RequireRole roles={["admin", "superviseur"]}>
      <LinesAdminPage />
    </RequireRole>
  ),
});

function LinesAdminPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Line> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["lines-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("crushing_lines").select("*").order("code");
      if (error) throw error;
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crushing_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lines-admin"] }); toast.success(t("admin.lines.deleted")); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("admin.lines.title")}
        subtitle={t("admin.lines.subtitle")}
        icon={<Factory className="h-5 w-5" />}
        actions={
          <Button onClick={() => setEdit({ code: "", name: "", hourly_capacity_kg: 0, status: "available", is_active: true })}>
            <Plus className="me-1 h-4 w-4" />{t("admin.lines.new")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<Factory className="h-5 w-5" />} title={t("crushing.empty")} />
      ) : (
        <ul className="space-y-2">
          {data.map((l) => (
            <li key={l.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-4 p-4">
                  <div className="font-mono text-base font-bold tabular">{l.code}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{l.name}</div>
                    <div className="text-xs text-muted-foreground tabular">{l.hourly_capacity_kg} kg/h</div>
                  </div>
                  <StatusBadge tone={STATUS_TONE[l.status]}>{t(STATUS_LABEL[l.status])}</StatusBadge>
                  {!l.is_active && <StatusBadge tone="muted">{t("common.inactive")}</StatusBadge>}
                  <Button variant="ghost" size="icon" onClick={() => setEdit(l)}><Edit className="h-4 w-4" /></Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => { if (window.confirm(t("common.delete") + " ?")) remove.mutate(l.id); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <LineDialog line={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function LineDialog({ line, onClose }: { line: Partial<Line> | null; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Partial<Line>>({});

  // Synchronise quand `line` change
  useState(() => { if (line) setDraft(line); });
  if (line && draft !== line && draft.id !== line.id) setDraft(line);

  const save = useMutation({
    mutationFn: async () => {
      if (!draft.code || !draft.name) throw new Error(t("validation.required"));
      const payload = {
        code: draft.code,
        name: draft.name,
        hourly_capacity_kg: draft.hourly_capacity_kg ?? 0,
        status: (draft.status ?? "available") as LineStatus,
        is_active: draft.is_active ?? true,
        notes: draft.notes ?? null,
      };
      if (draft.id) {
        const { error } = await supabase.from("crushing_lines").update(payload).eq("id", draft.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("crushing_lines").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lines-admin"] });
      qc.invalidateQueries({ queryKey: ["lines"] });
      toast.success(draft.id ? t("admin.lines.updated") : t("admin.lines.created"));
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!line) return null;

  return (
    <Dialog open={!!line} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{line.id ? t("common.edit") : t("admin.lines.new")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("admin.lines.code")} *</Label>
            <Input value={draft.code ?? ""} onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))} className="font-mono uppercase" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.lines.name")} *</Label>
            <Input value={draft.name ?? ""} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.lines.capacity")}</Label>
            <Input
              type="number" min="0" step="10"
              value={draft.hourly_capacity_kg ?? 0}
              onChange={(e) => setDraft((d) => ({ ...d, hourly_capacity_kg: parseFloat(e.target.value) || 0 }))}
              className="font-mono tabular"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.status")}</Label>
            <Select value={draft.status ?? "available"} onValueChange={(v) => setDraft((d) => ({ ...d, status: v as LineStatus }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as LineStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{t(STATUS_LABEL[s])}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch checked={draft.is_active ?? true} onCheckedChange={(v) => setDraft((d) => ({ ...d, is_active: v }))} />
            <Label>{t("common.active")}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Admin : gestion des balances / ponts bascules.
 * - Liste, création, édition, activation/désactivation
 * - URL WebSocket pour la lecture temps réel (un service local par balance)
 * - Capacité maximale (tare + brut) pour validation côté UI ultérieure
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Scale as ScaleIcon, Plus, Pencil, Power, PowerOff, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useI18n } from "@/lib/i18n";
import { RequireRole } from "@/components/RequireRole";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Scale = Database["public"]["Tables"]["scales"]["Row"];
type ScaleKind = Database["public"]["Enums"]["scale_kind"];

export const Route = createFileRoute("/admin/scales")({
  component: () => (
    <RequireRole roles={["admin", "superviseur"]}>
      <ScalesPage />
    </RequireRole>
  ),
});

function ScalesPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Scale | null>(null);
  const [showNew, setShowNew] = useState(false);

  const { data: scales, isLoading } = useQuery({
    queryKey: ["scales", true],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scales")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const toggle = useMutation({
    mutationFn: async (s: Scale) => {
      const { error } = await supabase
        .from("scales")
        .update({ is_active: !s.is_active })
        .eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scales"] });
      toast.success(t("admin.scales.updated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("admin.scales.title")}
        subtitle={t("admin.scales.subtitle")}
        icon={<ScaleIcon className="h-5 w-5" />}
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus className="me-1 h-4 w-4" />
            {t("admin.scales.new")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !scales || scales.length === 0 ? (
        <EmptyState
          icon={<ScaleIcon className="h-5 w-5" />}
          title={t("admin.scales.empty")}
          description={t("admin.scales.empty_help")}
          action={
            <Button onClick={() => setShowNew(true)}>
              <Plus className="me-1 h-4 w-4" />
              {t("admin.scales.new")}
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {scales.map((s) => {
            const KindIcon = s.kind === "truck_scale" ? Truck : ScaleIcon;
            return (
              <li key={s.id}>
                <Card className={s.is_active ? "" : "opacity-60"}>
                  <CardContent className="flex flex-wrap items-center gap-4 p-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <KindIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold tabular">{s.code}</span>
                        <span className="font-medium">{s.name}</span>
                        <StatusBadge tone={s.is_active ? "success" : "muted"}>
                          {s.is_active ? t("common.active") : t("common.inactive")}
                        </StatusBadge>
                        <StatusBadge tone="info">
                          {t(s.kind === "truck_scale" ? "admin.scales.kind.truck_scale" : "admin.scales.kind.scale")}
                        </StatusBadge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {s.websocket_url && (
                          <span className="font-mono tabular" dir="ltr">
                            {s.websocket_url}
                          </span>
                        )}
                        <span className="tabular">
                          {t("admin.scales.max_capacity")}: {s.max_capacity_kg} kg
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggle.mutate(s)}
                        title={s.is_active ? t("common.deactivate") : t("common.activate")}
                      >
                        {s.is_active ? (
                          <PowerOff className="h-4 w-4" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ScaleFormDialog
        open={showNew || !!editing}
        scale={editing}
        onClose={() => {
          setShowNew(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function ScaleFormDialog({
  open,
  scale,
  onClose,
}: {
  open: boolean;
  scale: Scale | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ScaleKind>("scale");
  const [url, setUrl] = useState("");
  const [maxCap, setMaxCap] = useState("5000");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setCode(scale?.code ?? "");
      setName(scale?.name ?? "");
      setKind(scale?.kind ?? "scale");
      setUrl(scale?.websocket_url ?? "");
      setMaxCap(String(scale?.max_capacity_kg ?? 5000));
      setNotes(scale?.notes ?? "");
    }
  }, [open, scale]);

  const save = useMutation({
    mutationFn: async () => {
      if (!code.trim() || !name.trim()) throw new Error(t("validation.required"));
      const payload = {
        code: code.trim(),
        name: name.trim(),
        kind,
        websocket_url: url.trim() || null,
        max_capacity_kg: parseFloat(maxCap) || 0,
        notes: notes.trim() || null,
      };
      if (scale) {
        const { error } = await supabase.from("scales").update(payload).eq("id", scale.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("scales").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scales"] });
      toast.success(scale ? t("admin.scales.updated") : t("admin.scales.created"));
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScaleIcon className="h-5 w-5 text-primary" />
            {scale ? t("admin.scales.edit") : t("admin.scales.new")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>
              {t("admin.scales.code")} <span className="text-destructive">*</span>
            </Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>
              {t("admin.scales.name")} <span className="text-destructive">*</span>
            </Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("admin.scales.kind")}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ScaleKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scale">{t("admin.scales.kind.scale")}</SelectItem>
                <SelectItem value="truck_scale">{t("admin.scales.kind.truck_scale")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>
              {t("admin.scales.max_capacity")} ({t("common.kg")})
            </Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={maxCap}
              onChange={(e) => setMaxCap(e.target.value)}
              className="font-mono tabular"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("admin.scales.websocket_url")}</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="ws://localhost:9001"
              className="font-mono"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">{t("admin.scales.websocket_url_help")}</p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("common.notes")}</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

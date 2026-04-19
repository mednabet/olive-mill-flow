/**
 * Module Variétés d'olives : référentiel des qualités travaillées au moulin.
 * - Liste, création, édition, activation/désactivation
 * - Couleur d'affichage pour identification visuelle
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sprout, Plus, Pencil, Power } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Variety = Database["public"]["Tables"]["olive_varieties"]["Row"];

export const Route = createFileRoute("/products")({
  component: () => (
    <RequireRole roles={["admin", "superviseur", "peseur", "operateur", "caisse"]}>
      <VarietiesPage />
    </RequireRole>
  ),
});

function VarietiesPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Variety | null>(null);
  const [showNew, setShowNew] = useState(false);

  const list = useQuery({
    queryKey: ["olive-varieties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("olive_varieties")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Variety[];
    },
  });

  const filtered = useMemo(() => {
    if (!list.data) return [];
    const s = search.trim().toLowerCase();
    if (!s) return list.data;
    return list.data.filter(
      (v) =>
        v.name.toLowerCase().includes(s) ||
        v.code.toLowerCase().includes(s) ||
        (v.name_ar?.toLowerCase().includes(s) ?? false),
    );
  }, [list.data, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("variety.title")}
        subtitle={t("variety.subtitle")}
        icon={<Sprout className="h-5 w-5" />}
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus className="me-1 h-4 w-4" />
            {t("variety.new")}
          </Button>
        }
      />

      <div className="max-w-md">
        <Input
          placeholder={t("variety.search_placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {list.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Sprout className="h-5 w-5" />}
          title={t("variety.empty_title")}
          description={t("variety.empty_desc")}
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((v) => (
            <VarietyRow key={v.id} variety={v} onEdit={() => setEditing(v)} />
          ))}
        </ul>
      )}

      <VarietyDialog
        open={showNew}
        onOpenChange={setShowNew}
        variety={null}
      />
      <VarietyDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        variety={editing}
      />
    </div>
  );
}

function VarietyRow({ variety, onEdit }: { variety: Variety; onEdit: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();

  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("olive_varieties")
        .update({ is_active: !variety.is_active })
        .eq("id", variety.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["olive-varieties"] });
      toast.success(t("common.success"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li>
      <Card className={variety.is_active ? "" : "opacity-60"}>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div
            className="h-12 w-12 shrink-0 rounded-lg border"
            style={{ backgroundColor: variety.color ?? "#84cc16" }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{variety.name}</span>
              <span className="font-mono text-xs text-muted-foreground tabular">
                {variety.code}
              </span>
              {!variety.is_active && (
                <StatusBadge tone="warning">{t("common.inactive")}</StatusBadge>
              )}
            </div>
            {variety.name_ar && (
              <div className="text-sm text-muted-foreground" dir="rtl">
                {variety.name_ar}
              </div>
            )}
            {variety.notes && (
              <div className="mt-1 text-xs text-muted-foreground">{variety.notes}</div>
            )}
          </div>
          {variety.avg_yield_percent !== null && (
            <div className="text-end">
              <div className="text-xs text-muted-foreground">{t("variety.avg_yield")}</div>
              <div className="font-mono text-lg font-bold tabular">
                {Number(variety.avg_yield_percent).toFixed(1)}%
              </div>
            </div>
          )}
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggle.mutate()}
              disabled={toggle.isPending}
              title={variety.is_active ? t("common.deactivate") : t("common.activate")}
            >
              <Power className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function VarietyDialog({
  open,
  onOpenChange,
  variety,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  variety: Variety | null;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();

  const [code, setCode] = useState(variety?.code ?? "");
  const [name, setName] = useState(variety?.name ?? "");
  const [nameAr, setNameAr] = useState(variety?.name_ar ?? "");
  const [yieldPct, setYieldPct] = useState(
    variety?.avg_yield_percent !== null && variety?.avg_yield_percent !== undefined
      ? String(variety.avg_yield_percent)
      : "",
  );
  const [color, setColor] = useState(variety?.color ?? "#84cc16");
  const [notes, setNotes] = useState(variety?.notes ?? "");

  // Reset state when variety prop changes / dialog reopens
  useMemo(() => {
    if (open) {
      setCode(variety?.code ?? "");
      setName(variety?.name ?? "");
      setNameAr(variety?.name_ar ?? "");
      setYieldPct(
        variety?.avg_yield_percent !== null && variety?.avg_yield_percent !== undefined
          ? String(variety.avg_yield_percent)
          : "",
      );
      setColor(variety?.color ?? "#84cc16");
      setNotes(variety?.notes ?? "");
    }
  }, [open, variety]);

  const save = useMutation({
    mutationFn: async () => {
      if (!code.trim() || !name.trim()) throw new Error(t("validation.required"));
      const payload = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        name_ar: nameAr.trim() || null,
        avg_yield_percent: yieldPct.trim() ? parseFloat(yieldPct) : null,
        color,
        notes: notes.trim() || null,
      };
      if (variety) {
        const { error } = await supabase
          .from("olive_varieties")
          .update(payload)
          .eq("id", variety.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("olive_varieties").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["olive-varieties"] });
      toast.success(variety ? t("variety.updated") : t("variety.created"));
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{variety ? t("variety.edit") : t("variety.new")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("variety.code")}</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="PICHM"
                className="font-mono uppercase"
                maxLength={10}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("variety.color")}</Label>
              <Input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 p-1"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("variety.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("variety.name_ar")}</Label>
            <Input
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              dir="rtl"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("variety.avg_yield")} (%)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={yieldPct}
              onChange={(e) => setYieldPct(e.target.value)}
              className="font-mono tabular"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {variety ? t("common.update") : t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Module Stocks : lots et mouvements.
 * - Liste des lots groupés par nature
 * - Création de lot manuel + mouvement
 * - Historique mouvements
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Boxes, Plus, ArrowDown, ArrowUp, Equal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { RequireRole } from "@/components/RequireRole";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatKg, formatDateTime } from "@/lib/format";

type Lot = Database["public"]["Tables"]["stock_lots"]["Row"];
type Move = Database["public"]["Tables"]["stock_movements"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Kind = Database["public"]["Enums"]["stock_kind"];
type MoveType = Database["public"]["Enums"]["stock_movement_type"];

interface EnrichedLot extends Lot {
  client: Client | null;
}
interface EnrichedMove extends Move {
  lot: Lot | null;
}

const KIND_LABEL: Record<Kind, TranslationKey> = {
  client_olives: "stock.kind.client_olives",
  client_oil: "stock.kind.client_oil",
  own_oil: "stock.kind.own_oil",
  pomace: "stock.kind.pomace",
  byproduct: "stock.kind.byproduct",
};

export const Route = createFileRoute("/stocks")({
  component: () => (
    <RequireRole roles={["admin", "superviseur", "operateur"]}>
      <StocksPage />
    </RequireRole>
  ),
});

function StocksPage() {
  const { t } = useI18n();
  const [showLot, setShowLot] = useState(false);
  const [showMove, setShowMove] = useState<Lot | null>(null);

  const lots = useQuery({
    queryKey: ["stock-lots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_lots")
        .select("*, client:clients(*)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as EnrichedLot[];
    },
  });

  const moves = useQuery({
    queryKey: ["stock-movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*, lot:stock_lots(*)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as EnrichedMove[];
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("stock.title")}
        subtitle={t("stock.subtitle")}
        icon={<Boxes className="h-5 w-5" />}
        actions={
          <Button onClick={() => setShowLot(true)}>
            <Plus className="me-1 h-4 w-4" />
            {t("stock.new_lot")}
          </Button>
        }
      />

      <Tabs defaultValue="lots">
        <TabsList>
          <TabsTrigger value="lots">{t("stock.lots")}</TabsTrigger>
          <TabsTrigger value="moves">{t("stock.movements")}</TabsTrigger>
        </TabsList>

        <TabsContent value="lots" className="mt-4 space-y-2">
          {lots.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)
          ) : !lots.data || lots.data.length === 0 ? (
            <EmptyState icon={<Boxes className="h-5 w-5" />} title={t("stock.empty")} />
          ) : (
            <ul className="space-y-2">
              {lots.data.map((l) => (
                <li key={l.id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-center gap-4 p-4">
                      <div>
                        <div className="font-mono text-sm font-bold tabular">{l.lot_code}</div>
                        <StatusBadge tone="info" className="mt-1">{t(KIND_LABEL[l.kind])}</StatusBadge>
                      </div>
                      <div className="min-w-0 flex-1">
                        {l.client && (
                          <div className="text-sm">
                            <span className="font-medium">{l.client.full_name}</span>
                            <span className="ms-2 font-mono text-xs text-muted-foreground tabular">{l.client.code}</span>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground tabular">{formatDateTime(l.created_at)}</div>
                      </div>
                      <div className="text-end">
                        <div className="font-mono text-2xl font-bold tabular">{formatKg(l.quantity_kg)}</div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setShowMove(l)}>
                        <Plus className="me-1 h-4 w-4" />
                        {t("stock.movement.new")}
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="moves" className="mt-4 space-y-2">
          {moves.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)
          ) : !moves.data || moves.data.length === 0 ? (
            <EmptyState icon={<Boxes className="h-5 w-5" />} title={t("stock.empty_movements")} />
          ) : (
            <ul className="space-y-2">
              {moves.data.map((m) => {
                const Icon = m.movement_type === "in" ? ArrowDown : m.movement_type === "out" ? ArrowUp : Equal;
                const tone = m.movement_type === "in" ? "success" : m.movement_type === "out" ? "warning" : "info";
                const TONE = { success: "text-success", warning: "text-warning", info: "text-primary" } as const;
                return (
                  <li key={m.id}>
                    <Card>
                      <CardContent className="flex items-center gap-3 p-3">
                        <Icon className={`h-5 w-5 ${TONE[tone]}`} />
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-sm tabular">{m.lot?.lot_code}</div>
                          <div className="text-xs text-muted-foreground">{m.reason ?? "—"}</div>
                        </div>
                        <div className="text-xs text-muted-foreground tabular">{formatDateTime(m.created_at)}</div>
                        <div className="font-mono font-bold tabular">{formatKg(m.quantity_kg)}</div>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <NewLotDialog open={showLot} onOpenChange={setShowLot} />
      <NewMovementDialog lot={showMove} onClose={() => setShowMove(null)} />
    </div>
  );
}

function NewLotDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>("own_oil");
  const [qty, setQty] = useState("0");

  const save = useMutation({
    mutationFn: async () => {
      const { data: code, error: codeErr } = await supabase.rpc("next_lot_code", { _kind: kind });
      if (codeErr) throw codeErr;
      const { data: lot, error } = await supabase
        .from("stock_lots")
        .insert({ kind, lot_code: code as string, quantity_kg: 0 })
        .select("id")
        .single();
      if (error) throw error;
      const q = parseFloat(qty);
      if (q > 0 && lot) {
        await supabase.from("stock_movements").insert({
          lot_id: lot.id,
          movement_type: "in",
          quantity_kg: q,
          reason: "lot_init",
        });
      }
      return code as string;
    },
    onSuccess: (code) => {
      qc.invalidateQueries({ queryKey: ["stock-lots"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      toast.success(t("stock.lot_created", code));
      setQty("0"); setKind("own_oil");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("stock.new_lot")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("stock.kind")}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                  <SelectItem key={k} value={k}>{t(KIND_LABEL[k])}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("stock.quantity")}</Label>
            <Input type="number" step="0.1" min="0" value={qty} onChange={(e) => setQty(e.target.value)} className="font-mono tabular" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{t("common.create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewMovementDialog({ lot, onClose }: { lot: Lot | null; onClose: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [type, setType] = useState<MoveType>("out");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      if (!lot) return;
      const q = parseFloat(qty);
      if (!Number.isFinite(q) || q <= 0) throw new Error(t("validation.positive"));
      const signed = type === "adjustment" ? q : q;
      const { error } = await supabase.from("stock_movements").insert({
        lot_id: lot.id,
        movement_type: type,
        quantity_kg: signed,
        reason: reason.trim() || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-lots"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      toast.success(t("stock.movement_saved"));
      setQty(""); setReason(""); setType("out");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!lot} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("stock.movement.new")} — {lot?.lot_code}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("common.action")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as MoveType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in">{t("stock.movement.in")}</SelectItem>
                <SelectItem value="out">{t("stock.movement.out")}</SelectItem>
                <SelectItem value="adjustment">{t("stock.movement.adjustment")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("stock.quantity")}</Label>
            <Input type="number" step="0.1" value={qty} onChange={(e) => setQty(e.target.value)} className="font-mono tabular" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.reason")}</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !qty}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

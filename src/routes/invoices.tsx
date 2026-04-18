/**
 * Module Facturation : factures MAD avec TVA marocaine.
 * - Création d'une facture vide ou depuis dossier d'écrasement
 * - Lignes, paiements partiels (espèces/virement/carte/autre)
 * - Statuts auto via triggers DB
 * - Impression facture A4
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Receipt, Plus, Printer, Trash2, CreditCard, Send, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { RequireRole } from "@/components/RequireRole";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { PrintLayout } from "@/components/PrintLayout";
import { InvoicePrint } from "@/components/invoices/InvoicePrint";
import { ClientPicker } from "@/components/clients/ClientPicker";
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
import { formatMoney, formatDateTime } from "@/lib/format";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type Item = Database["public"]["Tables"]["invoice_items"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Payment = Database["public"]["Tables"]["payments"]["Row"];
type Status = Database["public"]["Enums"]["invoice_status"];
type PaymentMethod = Database["public"]["Enums"]["payment_method"];

interface EnrichedInvoice extends Invoice {
  client: Client | null;
}

const STATUS_LABEL: Record<Status, TranslationKey> = {
  draft: "inv.status.draft",
  issued: "inv.status.issued",
  partial: "inv.status.partial",
  paid: "inv.status.paid",
  cancelled: "inv.status.cancelled",
};
const STATUS_TONE: Record<Status, "muted" | "info" | "warning" | "success" | "danger"> = {
  draft: "muted",
  issued: "info",
  partial: "warning",
  paid: "success",
  cancelled: "danger",
};

export const Route = createFileRoute("/invoices")({
  component: () => (
    <RequireRole roles={["admin", "superviseur", "caisse"]}>
      <InvoicesPage />
    </RequireRole>
  ),
});

function InvoicesPage() {
  const { t } = useI18n();
  const [showNew, setShowNew] = useState(false);
  const [open, setOpen] = useState<EnrichedInvoice | null>(null);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, client:clients(*)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as EnrichedInvoice[];
    },
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("inv.title")}
        subtitle={t("inv.subtitle")}
        icon={<Receipt className="h-5 w-5" />}
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus className="me-1 h-4 w-4" />
            {t("inv.new")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : !invoices || invoices.length === 0 ? (
        <EmptyState icon={<Receipt className="h-5 w-5" />} title={t("inv.empty")} />
      ) : (
        <ul className="space-y-2">
          {invoices.map((inv) => (
            <li key={inv.id}>
              <Card className="cursor-pointer transition-shadow hover:shadow-sm" onClick={() => setOpen(inv)}>
                <CardContent className="flex flex-wrap items-center gap-4 p-4">
                  <div>
                    <div className="font-mono text-sm font-bold tabular">{inv.invoice_number}</div>
                    <StatusBadge tone={STATUS_TONE[inv.status]} className="mt-1">{t(STATUS_LABEL[inv.status])}</StatusBadge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{inv.client?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground tabular">{formatDateTime(inv.created_at)}</div>
                  </div>
                  <div className="text-end">
                    <div className="font-mono text-base font-bold tabular">{formatMoney(inv.total)}</div>
                    {inv.paid > 0 && inv.paid < inv.total && (
                      <div className="text-xs text-warning tabular">{t("inv.balance_due")}: {formatMoney(inv.total - inv.paid)}</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <NewInvoiceDialog open={showNew} onOpenChange={setShowNew} onCreated={(inv) => { setShowNew(false); setOpen(inv); }} />
      <InvoiceDetailsDialog invoice={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function NewInvoiceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (inv: EnrichedInvoice) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [client, setClient] = useState<Client | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const { data: num, error: numErr } = await supabase.rpc("next_invoice_number");
      if (numErr) throw numErr;
      const { data, error } = await supabase
        .from("invoices")
        .insert({
          invoice_number: num as string,
          client_id: client?.id ?? null,
          status: "draft",
          created_by: user?.id ?? null,
        })
        .select("*, client:clients(*)")
        .single();
      if (error) throw error;
      return data as unknown as EnrichedInvoice;
    },
    onSuccess: (inv) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(t("inv.created", inv.invoice_number));
      setClient(null);
      onCreated(inv);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("inv.new")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Label>{t("inv.client")}</Label>
          <ClientPicker value={client} onChange={setClient} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>{t("common.create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDetailsDialog({ invoice, onClose }: { invoice: EnrichedInvoice | null; onClose: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showPrint, setShowPrint] = useState(false);

  const items = useQuery({
    queryKey: ["invoice-items", invoice?.id],
    queryFn: async () => {
      if (!invoice) return [];
      const { data, error } = await supabase.from("invoice_items").select("*").eq("invoice_id", invoice.id);
      if (error) throw error;
      return data;
    },
    enabled: !!invoice,
  });

  const payments = useQuery({
    queryKey: ["invoice-payments", invoice?.id],
    queryFn: async () => {
      if (!invoice) return [];
      const { data, error } = await supabase.from("payments").select("*").eq("invoice_id", invoice.id).order("paid_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!invoice,
  });

  // Détails à jour de la facture (pour totaux recalculés par triggers)
  const fresh = useQuery({
    queryKey: ["invoice-fresh", invoice?.id],
    queryFn: async () => {
      if (!invoice) return null;
      const { data, error } = await supabase.from("invoices").select("*, client:clients(*)").eq("id", invoice.id).maybeSingle();
      if (error) throw error;
      return data as unknown as EnrichedInvoice | null;
    },
    enabled: !!invoice,
    refetchInterval: 5000,
  });
  const inv = fresh.data ?? invoice;

  const addItem = useMutation({
    mutationFn: async (payload: { description: string; quantity: number; unit_price: number }) => {
      if (!invoice) return;
      const { error } = await supabase.from("invoice_items").insert({
        invoice_id: invoice.id,
        description: payload.description,
        quantity: payload.quantity,
        unit_price: payload.unit_price,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      items.refetch(); fresh.refetch();
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoice_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { items.refetch(); fresh.refetch(); qc.invalidateQueries({ queryKey: ["invoices"] }); },
  });

  const issue = useMutation({
    mutationFn: async () => {
      if (!invoice) return;
      const { error } = await supabase
        .from("invoices")
        .update({ status: "issued", issued_at: new Date().toISOString() })
        .eq("id", invoice.id);
      if (error) throw error;
    },
    onSuccess: () => { fresh.refetch(); qc.invalidateQueries({ queryKey: ["invoices"] }); toast.success(t("inv.issued")); },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelInv = useMutation({
    mutationFn: async () => {
      if (!invoice) return;
      const { error } = await supabase.from("invoices").update({ status: "cancelled" }).eq("id", invoice.id);
      if (error) throw error;
    },
    onSuccess: () => { fresh.refetch(); qc.invalidateQueries({ queryKey: ["invoices"] }); toast.success(t("inv.cancelled")); },
  });

  const addPayment = useMutation({
    mutationFn: async (payload: { amount: number; method: PaymentMethod; reference: string }) => {
      if (!invoice) return;
      const { error } = await supabase.from("payments").insert({
        invoice_id: invoice.id,
        amount: payload.amount,
        method: payload.method,
        reference: payload.reference || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { payments.refetch(); fresh.refetch(); qc.invalidateQueries({ queryKey: ["invoices"] }); toast.success(t("inv.payment_saved")); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!invoice) return null;

  return (
    <>
      <Dialog open={!!invoice && !showPrint} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="font-mono">{inv.invoice_number}</span>
              <StatusBadge tone={STATUS_TONE[inv.status]}>{t(STATUS_LABEL[inv.status])}</StatusBadge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {inv.client && (
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <div className="font-medium">{inv.client.full_name}</div>
                <div className="font-mono text-xs text-muted-foreground tabular">{inv.client.code}</div>
              </div>
            )}

            <ItemsEditor
              items={items.data ?? []}
              editable={inv.status === "draft"}
              onAdd={(p) => addItem.mutate(p)}
              onRemove={(id) => removeItem.mutate(id)}
            />

            <div className="ml-auto w-full max-w-xs space-y-1 rounded-md border bg-card p-3 text-sm">
              <Row label={t("common.subtotal")} value={formatMoney(inv.subtotal)} />
              <Row label={t("common.tax")} value={formatMoney(inv.tax)} />
              <Row label={t("common.grand_total")} value={formatMoney(inv.total)} bold />
              <Row label={t("inv.payments")} value={formatMoney(inv.paid)} />
              <Row label={t("inv.balance_due")} value={formatMoney(inv.total - inv.paid)} bold />
            </div>

            {(inv.status === "issued" || inv.status === "partial") && inv.total - inv.paid > 0 && (
              <PaymentForm onAdd={(p) => addPayment.mutate(p)} balance={inv.total - inv.paid} />
            )}

            {payments.data && payments.data.length > 0 && (
              <div>
                <div className="mb-1 text-xs uppercase text-muted-foreground">{t("inv.payments")}</div>
                <ul className="space-y-1 text-sm">
                  {payments.data.map((p) => (
                    <li key={p.id} className="flex justify-between rounded bg-muted/40 px-2 py-1">
                      <span>{formatDateTime(p.paid_at)} · {t(`inv.method.${p.method}` as TranslationKey)}{p.reference && ` · ${p.reference}`}</span>
                      <span className="font-mono tabular">{formatMoney(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter className="flex-wrap gap-2">
            {inv.status === "draft" && inv.total > 0 && (
              <Button onClick={() => issue.mutate()}><Send className="me-1 h-4 w-4" />{t("inv.issue")}</Button>
            )}
            {inv.status !== "cancelled" && inv.status !== "paid" && (
              <Button variant="outline" onClick={() => { if (window.confirm(t("inv.cancel"))) cancelInv.mutate(); }}>
                <Ban className="me-1 h-4 w-4" />{t("inv.cancel")}
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowPrint(true)}>
              <Printer className="me-1 h-4 w-4" />{t("inv.print")}
            </Button>
            <Button variant="ghost" onClick={onClose}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPrint} onOpenChange={(o) => { if (!o) setShowPrint(false); }}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
          <PrintLayout onClose={() => setShowPrint(false)}>
            <InvoicePrint invoice={inv} client={inv.client} items={items.data ?? []} payments={payments.data ?? []} />
          </PrintLayout>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "border-t pt-1 font-bold" : ""}`}>
      <span>{label}</span><span className="font-mono tabular">{value}</span>
    </div>
  );
}

function ItemsEditor({
  items,
  editable,
  onAdd,
  onRemove,
}: {
  items: Item[];
  editable: boolean;
  onAdd: (p: { description: string; quantity: number; unit_price: number }) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useI18n();
  const [desc, setDesc] = useState(t("inv.preset_crushing_desc"));
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase text-muted-foreground">{t("inv.items")}</div>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1 text-sm">
            <span className="flex-1">{it.description}</span>
            <span className="font-mono tabular text-xs text-muted-foreground">×{it.quantity}</span>
            <span className="font-mono tabular w-24 text-end">{formatMoney(it.total)}</span>
            {editable && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onRemove(it.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <div className="grid grid-cols-12 gap-2">
          <Input className="col-span-6" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("inv.description")} />
          <Input className="col-span-2 font-mono tabular" type="number" min="0" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
          <Input className="col-span-3 font-mono tabular" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={t("inv.unit_price")} />
          <Button
            className="col-span-1 px-2"
            onClick={() => {
              const q = parseFloat(qty), p = parseFloat(price);
              if (!desc.trim() || !Number.isFinite(q) || !Number.isFinite(p)) return;
              onAdd({ description: desc.trim(), quantity: q, unit_price: p });
              setPrice("");
            }}
            disabled={!desc.trim() || !price}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function PaymentForm({ onAdd, balance }: { onAdd: (p: { amount: number; method: PaymentMethod; reference: string }) => void; balance: number }) {
  const { t } = useI18n();
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");

  return (
    <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <CreditCard className="h-4 w-4" />{t("inv.add_payment")}
      </div>
      <div className="grid grid-cols-12 gap-2">
        <Input className="col-span-4 font-mono tabular" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
          <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">{t("inv.method.cash")}</SelectItem>
            <SelectItem value="transfer">{t("inv.method.transfer")}</SelectItem>
            <SelectItem value="card">{t("inv.method.card")}</SelectItem>
            <SelectItem value="other">{t("inv.method.other")}</SelectItem>
          </SelectContent>
        </Select>
        <Input className="col-span-4" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t("common.reference")} />
        <Button
          className="col-span-1 px-2"
          onClick={() => {
            const a = parseFloat(amount);
            if (!Number.isFinite(a) || a <= 0) return;
            onAdd({ amount: a, method, reference });
            setReference("");
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

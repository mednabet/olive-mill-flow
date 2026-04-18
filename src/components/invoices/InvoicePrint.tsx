/**
 * Facture imprimable A4 — TVA marocaine en MAD.
 */
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { formatMoney, formatDateTime } from "@/lib/format";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type Item = Database["public"]["Tables"]["invoice_items"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Payment = Database["public"]["Tables"]["payments"]["Row"];

interface Props {
  invoice: Invoice;
  client: Client | null;
  items: Item[];
  payments: Payment[];
}

export function InvoicePrint({ invoice, client, items, payments }: Props) {
  const { t, locale } = useI18n();
  const { data: mill } = useQuery({
    queryKey: ["mill-info"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("value").eq("key", "mill_info").maybeSingle();
      return (data?.value as Record<string, string>) ?? {};
    },
  });

  const balance = invoice.total - invoice.paid;

  return (
    <div className="ticket-print mx-auto max-w-3xl bg-white p-8 font-sans text-sm text-black print:max-w-none print:p-6">
      <div className="flex items-start justify-between border-b-2 border-black pb-4">
        <div>
          <div className="text-2xl font-bold">{mill?.name ?? t("app.title")}</div>
          {mill?.address && <div className="text-xs">{mill.address}</div>}
          {mill?.phone && <div className="text-xs">{t("admin.settings.mill_phone")}: {mill.phone}</div>}
          <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-gray-700">
            {mill?.ice && <span>ICE: {mill.ice}</span>}
            {mill?.if && <span>IF: {mill.if}</span>}
            {mill?.rc && <span>RC: {mill.rc}</span>}
            {mill?.patente && <span>Patente: {mill.patente}</span>}
          </div>
        </div>
        <div className="text-end">
          <div className="text-xs uppercase text-gray-600">{t("inv.title")}</div>
          <div className="font-mono text-xl font-bold tabular">{invoice.invoice_number}</div>
          <div className="text-xs">{formatDateTime(invoice.issued_at ?? invoice.created_at)}</div>
        </div>
      </div>

      {client && (
        <div className="my-6 rounded border border-gray-300 bg-gray-50 p-3">
          <div className="text-xs uppercase text-gray-600">{t("inv.client")}</div>
          <div className="font-medium">{client.full_name}</div>
          <div className="text-xs">{client.code}{client.phone && ` · ${client.phone}`}</div>
          {client.address && <div className="text-xs">{client.address}</div>}
        </div>
      )}

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black text-xs uppercase">
            <th className="py-2 text-start">{t("inv.description")}</th>
            <th className="py-2 text-end">{t("inv.qty")}</th>
            <th className="py-2 text-end">{t("inv.unit_price")}</th>
            <th className="py-2 text-end">{t("inv.line_total")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-gray-200">
              <td className="py-2">{it.description}</td>
              <td className="py-2 text-end font-mono tabular">{it.quantity}</td>
              <td className="py-2 text-end font-mono tabular">{formatMoney(it.unit_price)}</td>
              <td className="py-2 text-end font-mono tabular font-semibold">{formatMoney(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 ml-auto w-full max-w-xs space-y-1 text-sm">
        <Row label={t("common.subtotal")} value={formatMoney(invoice.subtotal)} />
        <Row label={t("common.tax")} value={formatMoney(invoice.tax)} />
        <Row label={t("common.grand_total")} value={formatMoney(invoice.total)} bold />
        <Row label={t("inv.payments")} value={formatMoney(invoice.paid)} />
        <Row label={t("inv.balance_due")} value={formatMoney(balance)} bold />
      </div>

      {payments.length > 0 && (
        <div className="mt-6">
          <div className="mb-1 text-xs uppercase text-gray-600">{t("inv.payments")}</div>
          <ul className="text-xs">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between border-b border-gray-200 py-1">
                <span>{formatDateTime(p.paid_at)} · {t(`inv.method.${p.method}` as any)}{p.reference && ` · ${p.reference}`}</span>
                <span className="font-mono tabular">{formatMoney(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-10 text-center text-[10px] text-gray-500">
        {new Date().toLocaleString(locale === "ar" ? "ar-MA" : "fr-MA")}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between border-t border-gray-300 py-1 ${bold ? "border-t-2 border-black font-bold text-base" : ""}`}>
      <span>{label}</span>
      <span className="font-mono tabular">{value}</span>
    </div>
  );
}

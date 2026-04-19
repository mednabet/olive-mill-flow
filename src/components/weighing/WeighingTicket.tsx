/**
 * Ticket de pesée 80mm avec détails brut/tare/net.
 */
import { useI18n } from "@/lib/i18n";
import { formatKg } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type Arrival = Database["public"]["Tables"]["arrivals"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
type Weighing = Database["public"]["Tables"]["weighings"]["Row"];
type Product = Database["public"]["Tables"]["products"]["Row"];

interface Props {
  arrival: Arrival;
  client?: Client | null;
  vehicle?: Vehicle | null;
  weighings: Weighing[];
  product?: Product | null;
}

export function WeighingTicket({ arrival, client, vehicle, weighings, product }: Props) {
  const { t, locale } = useI18n();
  const simple = weighings.find((w) => w.kind === "simple");
  const first = weighings.find((w) => w.kind === "first");
  const second = weighings.find((w) => w.kind === "second");
  const gross = simple?.weight_kg ?? second?.weight_kg ?? null;
  const tare = first?.weight_kg ?? null;
  const net = gross !== null && tare !== null ? Math.abs(gross - tare) : simple?.weight_kg ?? null;

  return (
    <div className="ticket-print mx-auto max-w-xs rounded-lg border-2 border-dashed border-border bg-white p-4 font-sans text-black shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
      <div className="text-center">
        <div className="text-base font-bold uppercase">{t("app.title")}</div>
        <div className="text-[10px] text-gray-600">{t("weigh.print_ticket")}</div>
        <div className="my-2 border-t border-dashed border-gray-400" />
        <div className="text-xs uppercase tracking-wider text-gray-700">{t("arrival.ticket")}</div>
        <div className="font-mono text-2xl font-black tabular tracking-wider">{arrival.ticket_number}</div>
      </div>

      <div className="my-2 border-t border-dashed border-gray-400" />

      <dl className="space-y-1 text-xs">
        {client && (
          <>
            <Row label={t("client.code")} value={client.code} mono />
            <Row label={t("client.full_name")} value={client.full_name} />
          </>
        )}
        {vehicle && <Row label={t("vehicle.plate")} value={vehicle.plate} mono />}
        {product && <Row label={t("weigh.product")} value={product.name} />}
      </dl>

      <div className="my-2 border-t border-dashed border-gray-400" />

      <table className="w-full text-xs">
        <tbody>
          {gross !== null && (
            <tr>
              <td className="py-0.5">{t("weigh.gross")}</td>
              <td className="py-0.5 text-end font-mono tabular font-bold">{formatKg(gross)}</td>
            </tr>
          )}
          {tare !== null && (
            <tr>
              <td className="py-0.5">{t("weigh.tare")}</td>
              <td className="py-0.5 text-end font-mono tabular">{formatKg(tare)}</td>
            </tr>
          )}
          {net !== null && (
            <tr className="border-t border-dashed border-gray-400">
              <td className="py-1 text-sm font-bold">{t("weigh.net")}</td>
              <td className="py-1 text-end font-mono tabular text-base font-black">{formatKg(net)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="my-2 border-t border-dashed border-gray-400" />

      <div className="text-center text-[10px] text-gray-600">
        {new Date().toLocaleString(locale === "ar" ? "ar-MA" : "fr-MA")}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-600">{label}</dt>
      <dd className={`text-end ${mono ? "font-mono tabular" : ""}`}>{value}</dd>
    </div>
  );
}

/**
 * Ticket d'arrivée imprimable au format thermique 80mm.
 * Affiché à l'écran dans une carte compacte, optimisé pour @media print.
 */
import { useI18n, type TranslationKey } from "@/lib/i18n";
import type { Database } from "@/integrations/supabase/types";

type Arrival = Database["public"]["Tables"]["arrivals"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];

interface Props {
  arrival: Arrival;
  client?: Client | null;
  vehicle?: Vehicle | null;
}

export function ArrivalTicket({ arrival, client, vehicle }: Props) {
  const { t, locale } = useI18n();
  const serviceLabel: Record<Arrival["service_type"], TranslationKey> = {
    weigh_simple: "arrival.service.weigh_simple",
    weigh_double: "arrival.service.weigh_double",
    crushing: "arrival.service.crushing",
  };

  return (
    <div className="ticket-print mx-auto max-w-xs rounded-lg border-2 border-dashed border-border bg-white p-4 font-sans text-black shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
      <div className="text-center">
        <div className="text-base font-bold uppercase">{t("app.title")}</div>
        <div className="text-[10px] text-gray-600">{t("app.tagline")}</div>
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
            {client.phone && <Row label={t("client.phone")} value={client.phone} mono />}
          </>
        )}
        {vehicle && <Row label={t("vehicle.plate")} value={vehicle.plate} mono />}
        <Row label={t("arrival.service")} value={t(serviceLabel[arrival.service_type])} bold />
        <Row
          label={t("common.created_at")}
          value={new Date(arrival.created_at).toLocaleString(locale === "ar" ? "ar-TN" : "fr-FR", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        />
      </dl>

      {arrival.notes && (
        <>
          <div className="my-2 border-t border-dashed border-gray-400" />
          <div className="text-xs italic text-gray-700">{arrival.notes}</div>
        </>
      )}

      <div className="my-2 border-t border-dashed border-gray-400" />

      <div className="text-center text-[10px] text-gray-600">
        {new Date().toLocaleString(locale === "ar" ? "ar-TN" : "fr-FR")}
      </div>
    </div>
  );
}

function Row({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-600">{label}</dt>
      <dd className={`text-end ${mono ? "font-mono tabular" : ""} ${bold ? "font-bold" : ""}`}>{value}</dd>
    </div>
  );
}

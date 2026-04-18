/**
 * Ticket d'écrasement 80mm avec QR code (tracking_code).
 * Affiche : code de suivi, client, arrivées rattachées, poids net,
 * ligne assignée, position file, durée estimée.
 */
import { QRCodeSVG } from "qrcode.react";
import { useI18n } from "@/lib/i18n";
import { formatKg } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type CrushingFile = Database["public"]["Tables"]["crushing_files"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Line = Database["public"]["Tables"]["crushing_lines"]["Row"];

interface AttachedArrival {
  ticket_number: string;
  net_weight_kg: number | null;
}

interface Props {
  file: CrushingFile;
  client: Client | null;
  line: Line | null;
  arrivals: AttachedArrival[];
}

export function CrushingTicket({ file, client, line, arrivals }: Props) {
  const { t, locale } = useI18n();

  return (
    <div className="ticket-print mx-auto max-w-xs rounded-lg border-2 border-dashed border-border bg-white p-4 font-sans text-black shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
      <div className="text-center">
        <div className="text-base font-bold uppercase">{t("app.title")}</div>
        <div className="text-[10px] text-gray-600">{t("crushing.title")}</div>
        <div className="my-2 border-t border-dashed border-gray-400" />
        <div className="text-xs uppercase tracking-wider text-gray-700">{t("crushing.tracking")}</div>
        <div className="font-mono text-xl font-black tabular tracking-wider">{file.tracking_code}</div>
      </div>

      <div className="my-2 border-t border-dashed border-gray-400" />

      <dl className="space-y-1 text-xs">
        {client && (
          <>
            <Row label={t("client.code")} value={client.code} mono />
            <Row label={t("client.full_name")} value={client.full_name} />
          </>
        )}
        {line && <Row label={t("common.line")} value={`${line.code} — ${line.name}`} mono />}
        {file.queue_position !== null && file.queue_position !== undefined && (
          <Row label={t("crushing.queue_position")} value={`#${file.queue_position}`} bold />
        )}
        {file.estimated_wait_minutes !== null && file.estimated_wait_minutes !== undefined && (
          <Row label={t("crushing.estimated_time")} value={`${file.estimated_wait_minutes} ${t("queue.minutes")}`} bold />
        )}
      </dl>

      <div className="my-2 border-t border-dashed border-gray-400" />

      <div className="text-[10px] font-semibold uppercase text-gray-600">{t("crushing.attached_arrivals")}</div>
      <table className="mt-1 w-full text-xs">
        <tbody>
          {arrivals.map((a, i) => (
            <tr key={i}>
              <td className="py-0.5 font-mono tabular">{a.ticket_number}</td>
              <td className="py-0.5 text-end font-mono tabular">{a.net_weight_kg !== null ? formatKg(a.net_weight_kg) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {file.net_weight_kg !== null && file.net_weight_kg !== undefined && (
        <>
          <div className="my-2 border-t border-dashed border-gray-400" />
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold">{t("weigh.net")}</span>
            <span className="font-mono tabular text-base font-black">{formatKg(file.net_weight_kg)}</span>
          </div>
        </>
      )}

      <div className="my-3 flex flex-col items-center gap-1">
        <QRCodeSVG value={file.tracking_code} size={120} level="M" />
        <div className="text-[10px] text-gray-600">{t("crushing.qr_label")}</div>
      </div>

      <div className="text-center text-[10px] text-gray-600">
        {new Date().toLocaleString(locale === "ar" ? "ar-MA" : "fr-MA")}
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

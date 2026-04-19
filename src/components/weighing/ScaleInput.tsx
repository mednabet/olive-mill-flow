/**
 * Champ de saisie d'un poids avec :
 *  - Lecture en direct depuis la balance via useScaleReader (WebSocket)
 *  - Bouton "Capturer" pour figer la valeur stable
 *  - Bascule manuelle (avec motif obligatoire) si autorisée par rôle/paramètre
 *
 * Props :
 *  - value, onChange : poids saisi (string pour préserver les virgules)
 *  - source, onSourceChange : "scale" | "manual"
 *  - reason, onReasonChange : motif si manuel
 *  - allowManual : si false, désactive l'option manuelle
 *  - autoFocus : focus initial sur l'input
 */
import { useEffect } from "react";
import { Wifi, WifiOff, Loader2, Hand, Scale as ScaleIcon, Camera, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { useScaleReader, type ScaleStatus } from "@/hooks/useScaleReader";
import { cn } from "@/lib/utils";

export type WeighingSourceUI = "scale" | "manual";

interface Props {
  value: string;
  onChange: (v: string) => void;
  source: WeighingSourceUI;
  onSourceChange: (s: WeighingSourceUI) => void;
  reason: string;
  onReasonChange: (r: string) => void;
  allowManual: boolean;
  /** URL de la balance (ws://, wss://, http://, https://) — null = aucune balance choisie */
  scaleUrl: string | null;
  /** Intervalle de polling en ms (utilisé uniquement pour HTTP) */
  scalePollIntervalMs?: number;
  /** Nom de la balance sélectionnée pour l'affichage */
  scaleName?: string | null;
  autoFocus?: boolean;
  label?: string;
}

const STATUS_DOT: Record<ScaleStatus, string> = {
  idle: "bg-muted-foreground/40",
  connecting: "bg-amber-400 animate-pulse",
  connected: "bg-success",
  error: "bg-destructive",
};

export function ScaleInput({
  value,
  onChange,
  source,
  onSourceChange,
  reason,
  onReasonChange,
  allowManual,
  scaleUrl,
  scalePollIntervalMs,
  scaleName,
  autoFocus,
  label,
}: Props) {
  const { t } = useI18n();
  const reader = useScaleReader(
    source === "scale" ? scaleUrl : null,
    scalePollIntervalMs ?? 1000,
  );

  // En mode balance : NE PAS pré-remplir automatiquement.
  // L'utilisateur capture explicitement via le bouton "Lire le poids".

  const capture = () => {
    if (reader.weight !== null) onChange(String(reader.weight));
  };

  const statusLabel: Record<ScaleStatus, string> = {
    idle: t("weigh.scale_status.idle"),
    connecting: t("weigh.scale_status.connecting"),
    connected: t("weigh.scale_status.connected"),
    error: t("weigh.scale_status.error"),
  };

  const isScaleMode = source === "scale";
  const captured = value !== "" && value !== null;

  return (
    <div className="space-y-3">
      {/* Sélecteur source */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={source === "scale" ? "default" : "outline"}
          onClick={() => onSourceChange("scale")}
          className="gap-1.5"
        >
          <ScaleIcon className="h-3.5 w-3.5" />
          {t("weigh.use_scale")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={source === "manual" ? "default" : "outline"}
          onClick={() => onSourceChange("manual")}
          disabled={!allowManual}
          className="gap-1.5"
          title={!allowManual ? t("weigh.manual_disabled") : undefined}
        >
          <Hand className="h-3.5 w-3.5" />
          {t("weigh.use_manual")}
        </Button>
        {!allowManual && source === "scale" && (
          <span className="text-xs text-muted-foreground">{t("weigh.manual_disabled")}</span>
        )}
      </div>

      {isScaleMode ? (
        /* === MODE BALANCE : affichage temps réel + bouton "Lire le poids" === */
        <div className="space-y-2">
          <Label>
            {label ?? t("weigh.weight")} ({t("common.kg")}){" "}
            <span className="text-destructive">*</span>
          </Label>

          {/* Bandeau état balance */}
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
            <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[reader.status])} />
            <span className="font-medium">{statusLabel[reader.status]}</span>
            {scaleName && <span className="text-muted-foreground">· {scaleName}</span>}
            {reader.status === "connected" && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-bold",
                  reader.stable
                    ? "bg-success/20 text-success"
                    : "bg-warning/20 text-warning-foreground",
                )}
              >
                {reader.stable ? t("weigh.scale_stable") : t("weigh.scale_unstable")}
              </span>
            )}
            {reader.status === "error" && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ms-auto h-6 px-2"
                onClick={reader.reconnect}
              >
                <RefreshCw className="me-1 h-3.5 w-3.5" />
                {t("weigh.reconnect")}
              </Button>
            )}
          </div>

          {/* Grand afficheur poids temps réel */}
          <div
            className={cn(
              "rounded-lg border-2 p-4 transition-colors",
              reader.status === "connected" && reader.stable
                ? "border-success/40 bg-success/5"
                : reader.status === "connected"
                  ? "border-warning/40 bg-warning/5"
                  : reader.status === "error"
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-muted bg-muted/20",
            )}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("weigh.scale_status.connected")}
                </div>
                <div
                  className="font-mono tabular text-5xl font-black leading-none tracking-tight"
                  dir="ltr"
                >
                  {reader.weight !== null ? reader.weight : "—"}
                  <span className="ms-2 text-2xl font-bold text-muted-foreground">
                    {t("common.kg")}
                  </span>
                </div>
              </div>
              {captured && (
                <div className="shrink-0 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-end">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("weigh.captured") /* fallback if missing */}
                  </div>
                  <div
                    className="font-mono tabular text-2xl font-bold text-primary"
                    dir="ltr"
                  >
                    {value} <span className="text-sm">{t("common.kg")}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Champ caché pour préserver la valeur dans le formulaire */}
            <input type="hidden" value={value} readOnly />

            <Button
              type="button"
              size="lg"
              className="mt-3 w-full gap-2 text-base font-bold"
              onClick={capture}
              disabled={reader.status !== "connected" || reader.weight === null}
              variant={captured ? "secondary" : "default"}
            >
              <Camera className="h-5 w-5" />
              {captured ? t("weigh.read_weight_again") : t("weigh.read_weight")}
            </Button>
          </div>

          {captured && (
            <p className="text-xs text-muted-foreground">
              {t("weigh.read_weight_hint")}
            </p>
          )}
        </div>
      ) : (
        /* === MODE MANUEL : input éditable === */
        <div className="space-y-1.5">
          <Label htmlFor="scale-weight">
            {label ?? t("weigh.weight")} ({t("common.kg")}){" "}
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="scale-weight"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoFocus={autoFocus}
            className="font-mono text-3xl tabular h-16"
            dir="ltr"
          />
        </div>
      )}

      {/* Motif si manuel */}
      {source === "manual" && (
        <div className="space-y-1.5">
          <Label htmlFor="scale-reason">
            {t("weigh.manual_reason")} <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="scale-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder={t("weigh.manual_reason_ph")}
            rows={2}
          />
        </div>
      )}
    </div>
  );
}

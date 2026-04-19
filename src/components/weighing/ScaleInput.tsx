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
  scaleName,
  autoFocus,
  label,
}: Props) {
  const { t } = useI18n();
  const reader = useScaleReader(source === "scale" ? scaleUrl : null);

  // Si lecture stable & source scale → pré-remplir au survol mais NE PAS écraser une saisie manuelle
  useEffect(() => {
    if (source === "scale" && reader.weight !== null && reader.stable) {
      // ne pas écraser si l'utilisateur a déjà capturé un poids différent qu'il édite
      // on remplit uniquement si vide
      if (value === "") {
        onChange(String(reader.weight));
      }
    }
  }, [reader.weight, reader.stable, source, value, onChange]);

  const capture = () => {
    if (reader.weight !== null) onChange(String(reader.weight));
  };

  const statusLabel: Record<ScaleStatus, string> = {
    idle: t("weigh.scale_status.idle"),
    connecting: t("weigh.scale_status.connecting"),
    connected: t("weigh.scale_status.connected"),
    error: t("weigh.scale_status.error"),
  };

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

      {/* Bandeau état balance (seulement si source = scale) */}
      {source === "scale" && (
        <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-2 text-xs">
            <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[reader.status])} />
            <span className="font-medium">{statusLabel[reader.status]}</span>
            {scaleName && (
              <span className="text-muted-foreground">· {scaleName}</span>
            )}
            {reader.status === "connected" && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-bold",
                  reader.stable ? "bg-success/20 text-success" : "bg-warning/20 text-warning-foreground",
                )}
              >
                {reader.stable ? t("weigh.scale_stable") : t("weigh.scale_unstable")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono tabular text-base font-bold" dir="ltr">
              {reader.weight !== null ? `${reader.weight} kg` : "—"}
            </span>
            {reader.status === "error" && (
              <Button type="button" size="sm" variant="ghost" onClick={reader.reconnect}>
                <RefreshCw className="me-1 h-3.5 w-3.5" />
                {t("weigh.reconnect")}
              </Button>
            )}
            {reader.status === "connected" && (
              <Button type="button" size="sm" variant="secondary" onClick={capture} disabled={reader.weight === null}>
                <Camera className="me-1 h-3.5 w-3.5" />
                {t("weigh.capture_scale")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Champ poids */}
      <div className="space-y-1.5">
        <Label htmlFor="scale-weight">
          {label ?? t("weigh.weight")} ({t("common.kg")}) <span className="text-destructive">*</span>
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
          readOnly={source === "scale" && !allowManual}
          className="font-mono text-3xl tabular h-16"
          dir="ltr"
        />
      </div>

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

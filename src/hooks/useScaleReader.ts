/**
 * Hook qui se connecte à un service WebSocket local exposant le poids de la balance.
 * Format attendu du message côté serveur : { weight: number, stable: boolean }
 *  ou un nombre brut convertible en float.
 *
 * Comportement :
 *  - Reconnect automatique avec backoff (max 5s)
 *  - État: "idle" | "connecting" | "connected" | "error"
 *  - Renvoie le dernier poids lu et le flag stable
 *  - Si url vide ou non défini → reste en "idle"
 */
import { useEffect, useRef, useState, useCallback } from "react";

export type ScaleStatus = "idle" | "connecting" | "connected" | "error";

interface ScaleReading {
  weight: number | null;
  stable: boolean;
  status: ScaleStatus;
  lastUpdate: number | null;
  reconnect: () => void;
}

export function useScaleReader(url: string | null | undefined): ScaleReading {
  const [weight, setWeight] = useState<number | null>(null);
  const [stable, setStable] = useState(false);
  const [status, setStatus] = useState<ScaleStatus>("idle");
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number>(0);
  const reconnectTimer = useRef<number | null>(null);
  const enabled = useRef(true);

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!url || !enabled.current) {
      setStatus("idle");
      return;
    }
    cleanup();
    setStatus("connecting");
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        retryRef.current = 0;
      };

      ws.onmessage = (ev) => {
        let data: { weight?: number; stable?: boolean } = {};
        try {
          if (typeof ev.data === "string") {
            const trimmed = ev.data.trim();
            if (trimmed.startsWith("{")) {
              data = JSON.parse(trimmed);
            } else {
              const n = parseFloat(trimmed);
              if (Number.isFinite(n)) data = { weight: n, stable: true };
            }
          }
        } catch {
          return;
        }
        if (typeof data.weight === "number" && Number.isFinite(data.weight)) {
          setWeight(data.weight);
          setStable(Boolean(data.stable));
          setLastUpdate(Date.now());
        }
      };

      ws.onerror = () => {
        setStatus("error");
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!enabled.current) return;
        setStatus("error");
        // backoff exponentiel borné à 5s
        const delay = Math.min(5000, 500 * 2 ** retryRef.current);
        retryRef.current += 1;
        reconnectTimer.current = window.setTimeout(connect, delay);
      };
    } catch {
      setStatus("error");
    }
  }, [url, cleanup]);

  useEffect(() => {
    enabled.current = true;
    connect();
    return () => {
      enabled.current = false;
      cleanup();
    };
  }, [connect, cleanup]);

  const reconnect = useCallback(() => {
    retryRef.current = 0;
    connect();
  }, [connect]);

  return { weight, stable, status, lastUpdate, reconnect };
}

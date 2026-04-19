/**
 * Hook qui se connecte à une balance pour lire le poids en temps réel.
 *
 * Deux protocoles supportés (auto-détectés via le préfixe de l'URL) :
 *  - WebSocket (ws:// ou wss://) : push, message JSON `{ weight, stable }` ou nombre brut.
 *  - HTTP polling (http:// ou https://) : GET texte au format :
 *      "s- 100"   → 100 kg, stable
 *      "i- 100"   → 100 kg, instable
 *      "e- ..."   → erreur (statut error)
 *
 * Comportement :
 *  - Reconnect / re-poll automatique avec backoff (max 5s) en cas d'erreur.
 *  - État: "idle" | "connecting" | "connected" | "error"
 *  - Si url vide ou non défini → reste en "idle"
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { fetchScalePayload } from "@/lib/scaleProxy";

export type ScaleStatus = "idle" | "connecting" | "connected" | "error";

interface ScaleReading {
  weight: number | null;
  stable: boolean;
  status: ScaleStatus;
  lastUpdate: number | null;
  reconnect: () => void;
}

type Protocol = "ws" | "http" | "none";

function detectProtocol(url: string | null | undefined): Protocol {
  if (!url) return "none";
  const u = url.trim().toLowerCase();
  if (u.startsWith("ws://") || u.startsWith("wss://")) return "ws";
  if (u.startsWith("http://") || u.startsWith("https://")) return "http";
  return "none";
}

/**
 * Parse une ligne texte format `s- 100`, `i- 100`, `e- ...`.
 * Retourne null si erreur, sinon { weight, stable }.
 */
function parseTextReading(raw: string): { weight: number; stable: boolean } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Préfixe d'erreur explicite
  if (/^e[-\s]/i.test(trimmed)) return null;

  // Match "s-", "S-", "i-", "I-" suivi d'un nombre (espaces/virgules tolérés)
  const m = trimmed.match(/^([siSI])\s*[-:]?\s*([0-9]+(?:[.,][0-9]+)?)/);
  if (m) {
    const stable = m[1].toLowerCase() === "s";
    const n = parseFloat(m[2].replace(",", "."));
    if (Number.isFinite(n)) return { weight: n, stable };
    return null;
  }

  // Fallback : nombre brut → considéré stable
  const n = parseFloat(trimmed.replace(",", "."));
  if (Number.isFinite(n)) return { weight: n, stable: true };
  return null;
}

export function useScaleReader(
  url: string | null | undefined,
  pollIntervalMs: number = 1000,
): ScaleReading {
  const [weight, setWeight] = useState<number | null>(null);
  const [stable, setStable] = useState(false);
  const [status, setStatus] = useState<ScaleStatus>("idle");
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pollTimer = useRef<number | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const retryRef = useRef<number>(0);
  const enabled = useRef(true);

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {
        // ignore
      }
      abortRef.current = null;
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

  const scheduleRetry = useCallback((connectFn: () => void) => {
    if (!enabled.current) return;
    const delay = Math.min(5000, 500 * 2 ** retryRef.current);
    retryRef.current += 1;
    reconnectTimer.current = window.setTimeout(connectFn, delay);
  }, []);

  const connect = useCallback(() => {
    const protocol = detectProtocol(url);
    if (protocol === "none" || !enabled.current) {
      setStatus("idle");
      return;
    }
    cleanup();
    setStatus("connecting");

    if (protocol === "ws") {
      try {
        const ws = new WebSocket(url!);
        wsRef.current = ws;

        ws.onopen = () => {
          setStatus("connected");
          retryRef.current = 0;
        };

        ws.onmessage = (ev) => {
          if (typeof ev.data !== "string") return;
          let parsed: { weight: number; stable: boolean } | null = null;
          const trimmed = ev.data.trim();
          if (trimmed.startsWith("{")) {
            try {
              const data = JSON.parse(trimmed) as { weight?: number; stable?: boolean };
              if (typeof data.weight === "number" && Number.isFinite(data.weight)) {
                parsed = { weight: data.weight, stable: Boolean(data.stable) };
              }
            } catch {
              // ignore
            }
          } else {
            parsed = parseTextReading(trimmed);
          }
          if (parsed) {
            setWeight(parsed.weight);
            setStable(parsed.stable);
            setLastUpdate(Date.now());
          }
        };

        ws.onerror = () => setStatus("error");

        ws.onclose = () => {
          wsRef.current = null;
          if (!enabled.current) return;
          setStatus("error");
          scheduleRetry(connect);
        };
      } catch {
        setStatus("error");
        scheduleRetry(connect);
      }
      return;
    }

    // HTTP polling — passe par le proxy server-side pour éviter les erreurs CORS
    const interval = Math.max(200, pollIntervalMs || 1000);
    let firstSuccess = false;
    const proxyUrl = `/api/scale-proxy?url=${encodeURIComponent(url!)}`;

    const tick = async () => {
      if (!enabled.current) return;
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetch(proxyUrl, {
          method: "GET",
          cache: "no-store",
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const parsed = parseTextReading(text);
        if (parsed) {
          if (!firstSuccess) {
            firstSuccess = true;
            retryRef.current = 0;
            setStatus("connected");
          }
          setWeight(parsed.weight);
          setStable(parsed.stable);
          setLastUpdate(Date.now());
        } else {
          // Ligne reçue = erreur (ex: "e- ...")
          setStatus("error");
        }
        // Schedule next poll
        if (enabled.current) {
          pollTimer.current = window.setTimeout(tick, interval);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setStatus("error");
        if (enabled.current) {
          // backoff sur erreur, puis reprise du polling normal
          scheduleRetry(() => {
            firstSuccess = false;
            setStatus("connecting");
            tick();
          });
        }
      }
    };

    tick();
  }, [url, pollIntervalMs, cleanup, scheduleRetry]);

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

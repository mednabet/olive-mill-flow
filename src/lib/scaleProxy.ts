import { createServerFn } from "@tanstack/react-start";

/**
 * Proxy serveur pour balances HTTP.
 * Contourne les restrictions CORS du navigateur en relayant la requête côté serveur (Worker).
 *
 * Le client appelle fetchScalePayload({ data: { url: "https://..." } }) et reçoit
 * le texte brut de la balance (ex: "s- 100", "i- 100", "e- ...").
 */
export const fetchScalePayload = createServerFn({ method: "POST" })
  .inputValidator((input: unknown): { url: string } => {
    if (!input || typeof input !== "object" || !("url" in input)) {
      throw new Error("Missing 'url'");
    }
    const { url } = input as { url: unknown };
    if (typeof url !== "string" || !url) throw new Error("Invalid 'url'");
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Invalid URL format");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only http/https protocols allowed");
    }
    return { url };
  })
  .handler(async ({ data }) => {
    try {
      const upstream = await fetch(data.url, {
        method: "GET",
        headers: { Accept: "text/plain, */*" },
      });
      const text = await upstream.text();
      return { ok: upstream.ok, status: upstream.status, text };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "fetch failed";
      return { ok: false, status: 0, text: "", error: msg };
    }
  });

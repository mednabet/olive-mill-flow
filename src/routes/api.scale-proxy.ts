import { createFileRoute } from "@tanstack/react-router";
import { createServerFileRoute } from "@tanstack/react-start/server";

/**
 * Proxy serveur pour balances HTTP.
 * Contourne les restrictions CORS du navigateur en relayant la requête côté serveur.
 *
 * Usage : GET /api/scale-proxy?url=https://netprocess.ma/partage/poids1.txt
 * Réponse : texte brut de la balance (ex: "s- 100", "i- 100", "e- ...")
 */
export const ServerRoute = createServerFileRoute("/api/scale-proxy").methods({
  GET: async ({ request }) => {
    const u = new URL(request.url);
    const target = u.searchParams.get("url");

    if (!target) {
      return new Response("Missing 'url' query parameter", { status: 400 });
    }

    // Validation : seulement http/https
    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return new Response("Invalid URL", { status: 400 });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return new Response("Only http/https protocols allowed", { status: 400 });
    }

    try {
      const upstream = await fetch(target, {
        method: "GET",
        headers: { Accept: "text/plain, */*" },
        // Cloudflare Workers : pas de cache
        cf: { cacheTtl: 0, cacheEverything: false } as any,
      });

      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return new Response(`Proxy fetch failed: ${msg}`, {
        status: 502,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  },
});

// Stub route component (required by TanStack file-based routing)
export const Route = createFileRoute("/api/scale-proxy")({
  component: () => null,
});

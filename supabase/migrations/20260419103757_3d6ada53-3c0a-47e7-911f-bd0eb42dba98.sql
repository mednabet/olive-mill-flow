ALTER TABLE public.scales
  ADD COLUMN IF NOT EXISTS poll_interval_ms integer NOT NULL DEFAULT 1000;

COMMENT ON COLUMN public.scales.poll_interval_ms IS 'Intervalle de polling en ms pour les balances HTTP (ignoré pour WebSocket)';
COMMENT ON COLUMN public.scales.websocket_url IS 'URL de la balance : ws://, wss:// (WebSocket) ou http://, https:// (polling texte au format "s- 100", "i- 100", "e- ...")';
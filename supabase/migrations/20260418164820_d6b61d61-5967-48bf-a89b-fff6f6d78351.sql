-- 1. Type de balance
CREATE TYPE public.scale_kind AS ENUM ('scale', 'truck_scale');

-- 2. Table des balances
CREATE TABLE public.scales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  kind public.scale_kind NOT NULL DEFAULT 'scale',
  websocket_url text,
  max_capacity_kg numeric NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scales ENABLE ROW LEVEL SECURITY;

CREATE POLICY scales_read ON public.scales
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY scales_write ON public.scales
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superviseur'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superviseur'::app_role]));

-- Trigger updated_at
CREATE TRIGGER tg_scales_updated_at
  BEFORE UPDATE ON public.scales
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. Balance par défaut sur le profil utilisateur
ALTER TABLE public.profiles
  ADD COLUMN default_scale_id uuid REFERENCES public.scales(id) ON DELETE SET NULL;

-- 4. Traçabilité de la balance utilisée pour chaque pesée
ALTER TABLE public.weighings
  ADD COLUMN scale_id uuid REFERENCES public.scales(id) ON DELETE SET NULL;

CREATE INDEX idx_weighings_scale_id ON public.weighings(scale_id);

-- 5. Seed : reprendre l'URL existante des settings comme première balance "Balance 1"
DO $$
DECLARE
  v_url text;
BEGIN
  SELECT (value->>'url') INTO v_url
  FROM public.settings
  WHERE key = 'scale.websocket';

  IF v_url IS NOT NULL AND v_url <> '' THEN
    INSERT INTO public.scales (code, name, kind, websocket_url, max_capacity_kg, is_active)
    VALUES ('B-001', 'Balance 1', 'scale', v_url, 5000, true)
    ON CONFLICT (code) DO NOTHING;
  END IF;
END $$;
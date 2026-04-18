-- Table des variétés d'olives
CREATE TABLE public.olive_varieties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_ar TEXT,
  avg_yield_percent NUMERIC(5,2),
  color TEXT DEFAULT '#84cc16',
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

-- RLS
ALTER TABLE public.olive_varieties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "varieties_read"
  ON public.olive_varieties
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "varieties_write"
  ON public.olive_varieties
  FOR ALL
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superviseur'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superviseur'::app_role]));

-- Trigger updated_at
CREATE TRIGGER tg_olive_varieties_updated_at
  BEFORE UPDATE ON public.olive_varieties
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_updated_at();

-- Données initiales : variétés courantes au Maroc
INSERT INTO public.olive_varieties (code, name, name_ar, avg_yield_percent, color, notes) VALUES
  ('PICHM', 'Picholine Marocaine', 'بيشولين المغربية', 20.00, '#65a30d', 'Variété principale au Maroc, double aptitude (huile + table)'),
  ('HAOUZ', 'Haouzia', 'الحوزية', 19.00, '#84cc16', 'Sélection de la Picholine, région du Haouz'),
  ('MENAR', 'Menara', 'المنارة', 21.00, '#16a34a', 'Variété marocaine sélectionnée, bon rendement'),
  ('ARBEQ', 'Arbequina', 'أربكينا', 22.00, '#22c55e', 'Variété espagnole, rendement élevé'),
  ('PICUA', 'Picual', 'بيكوال', 23.00, '#15803d', 'Variété espagnole, huile très stable');

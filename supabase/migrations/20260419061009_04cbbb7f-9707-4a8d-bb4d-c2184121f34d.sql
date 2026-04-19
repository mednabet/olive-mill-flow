-- Ajout du produit (variété d'olive) sur les arrivées pour catégoriser ce qui est apporté à l'écrasement
ALTER TABLE public.arrivals
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_arrivals_product_id ON public.arrivals(product_id);
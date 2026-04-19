-- Create enum for product categories
DO $$ BEGIN
  CREATE TYPE public.product_category AS ENUM ('olive', 'oil', 'byproduct', 'service');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.product_unit AS ENUM ('kg', 'liter', 'unit', 'service');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Rename table
ALTER TABLE public.olive_varieties RENAME TO products;

-- Add new columns
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category public.product_category NOT NULL DEFAULT 'olive',
  ADD COLUMN IF NOT EXISTS unit public.product_unit NOT NULL DEFAULT 'kg',
  ADD COLUMN IF NOT EXISTS unit_price numeric(12,3);

-- Migrate existing rows: all are olives
UPDATE public.products SET category = 'olive', unit = 'kg' WHERE category IS NULL OR true;

-- Drop default after backfill (so future inserts must specify)
ALTER TABLE public.products ALTER COLUMN category DROP DEFAULT;

-- Rename existing RLS policies (they follow the table)
-- Policies remain valid; rename for clarity
ALTER POLICY varieties_read ON public.products RENAME TO products_read;
ALTER POLICY varieties_write ON public.products RENAME TO products_write;

-- Add needs_crushing flag on arrivals
ALTER TABLE public.arrivals
  ADD COLUMN IF NOT EXISTS needs_crushing boolean NOT NULL DEFAULT false;

-- Backfill: existing rows with service_type = 'crushing' should have the flag set
UPDATE public.arrivals
  SET needs_crushing = true
  WHERE service_type = 'crushing' AND needs_crushing = false;

CREATE INDEX IF NOT EXISTS arrivals_needs_crushing_idx
  ON public.arrivals (needs_crushing)
  WHERE needs_crushing = true;
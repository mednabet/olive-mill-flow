-- Allow an arrival to be pre-attached to an existing crushing file (chosen at arrival creation)
ALTER TABLE public.arrivals
  ADD COLUMN IF NOT EXISTS target_crushing_file_id uuid NULL
    REFERENCES public.crushing_files(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS arrivals_target_crushing_file_id_idx
  ON public.arrivals (target_crushing_file_id)
  WHERE target_crushing_file_id IS NOT NULL;
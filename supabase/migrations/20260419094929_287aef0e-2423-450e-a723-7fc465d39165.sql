-- Permettre aux peseurs de corriger les pesages (le code applicatif vérifie
-- que le dossier rattaché est encore queued/assigned avant de mettre à jour).
DROP POLICY IF EXISTS weighings_update ON public.weighings;
CREATE POLICY weighings_update
ON public.weighings
FOR UPDATE
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superviseur'::app_role, 'peseur'::app_role]));
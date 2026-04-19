# ============================================================
# .env.production - genere par deploy/scripts/04-build.ps1
# ============================================================
# Si vous gardez Supabase (Lovable Cloud), gardez ces 3 lignes
# (le script reprend automatiquement les valeurs depuis .env).
#
# Si vous basculez vers une API locale (PostgREST / Node), commentez
# les 3 lignes Supabase et activez VITE_API_URL.
# ============================================================

VITE_SUPABASE_PROJECT_ID="kaiunpqoiazrhwkdozzq"
VITE_SUPABASE_URL="https://kaiunpqoiazrhwkdozzq.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY=""

# Pour API locale :
# VITE_API_URL="__API_URL__"

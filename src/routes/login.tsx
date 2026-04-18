/**
 * Page de connexion (identifiant + mot de passe).
 * - Pas d'inscription publique : les comptes sont créés depuis Admin > Utilisateurs
 * - Compte admin par défaut : admin / admin
 * - Fond décoratif évoquant un moulin à huile et les olives
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Droplets } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import loginBg from "@/assets/login-background.jpg";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ username: "", password: "" });

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: "/" });
    }
  }, [user, loading, navigate]);

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await signIn(form.username, form.password);
      navigate({ to: "/" });
    } catch (err) {
      toast.error(t("auth.error"), { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Fond décoratif : motif olives + moulin */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${loginBg})` }}
        aria-hidden
      />
      {/* Voile pour lisibilité */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/85 via-primary/75 to-sidebar/90" aria-hidden />

      <div className="absolute right-4 top-4 z-10">
        <div className="rounded-md bg-background/10 backdrop-blur">
          <LanguageSwitcher />
        </div>
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center text-center text-primary-foreground">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-lg">
              <Droplets className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight drop-shadow">{t("app.title")}</h1>
            <p className="mt-1 text-sm opacity-90 drop-shadow">{t("app.tagline")}</p>
          </div>

          <Card className="backdrop-blur-sm bg-card/95">
            <CardHeader>
              <CardTitle>{t("auth.welcome")}</CardTitle>
              <CardDescription>{t("auth.signin_subtitle")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="si-username">{t("auth.username")}</Label>
                  <Input
                    id="si-username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="off"
                    required
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder={t("auth.username_ph")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="si-password">{t("auth.password")}</Label>
                  <Input
                    id="si-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? t("common.loading") : t("auth.signin")}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  {t("auth.no_signup_help")}
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

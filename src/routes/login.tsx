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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [signinForm, setSigninForm] = useState({ email: "", password: "" });
  const [signupForm, setSignupForm] = useState({ email: "", password: "", fullName: "" });

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: "/" });
    }
  }, [user, loading, navigate]);

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await signIn(signinForm.email, signinForm.password);
      navigate({ to: "/" });
    } catch (err) {
      toast.error(t("auth.error"), { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await signUp(signupForm.email, signupForm.password, signupForm.fullName);
      toast.success(t("auth.success_signup"));
    } catch (err) {
      toast.error(t("auth.error"), { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-primary via-primary to-sidebar">
      {/* Décor */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, oklch(0.78 0.14 75 / 0.4), transparent 50%), radial-gradient(circle at 80% 70%, oklch(0.78 0.14 75 / 0.3), transparent 50%)",
        }}
      />
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
            <h1 className="text-2xl font-bold tracking-tight">{t("app.title")}</h1>
            <p className="mt-1 text-sm opacity-80">{t("app.tagline")}</p>
          </div>

          <Card>
            <Tabs defaultValue="signin">
              <CardHeader>
                <CardTitle>{t("auth.welcome")}</CardTitle>
                <CardDescription>{t("auth.signin_subtitle")}</CardDescription>
                <TabsList className="mt-4 grid grid-cols-2">
                  <TabsTrigger value="signin">{t("auth.signin")}</TabsTrigger>
                  <TabsTrigger value="signup">{t("auth.signup")}</TabsTrigger>
                </TabsList>
              </CardHeader>
              <CardContent>
                <TabsContent value="signin" className="mt-0">
                  <form onSubmit={onSignIn} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="si-email">{t("auth.email")}</Label>
                      <Input
                        id="si-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={signinForm.email}
                        onChange={(e) => setSigninForm({ ...signinForm, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="si-password">{t("auth.password")}</Label>
                      <Input
                        id="si-password"
                        type="password"
                        autoComplete="current-password"
                        required
                        minLength={6}
                        value={signinForm.password}
                        onChange={(e) => setSigninForm({ ...signinForm, password: e.target.value })}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy ? t("common.loading") : t("auth.signin")}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup" className="mt-0">
                  <p className="mb-4 rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">
                    {t("auth.signup_subtitle")}
                  </p>
                  <form onSubmit={onSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="su-name">{t("auth.full_name")}</Label>
                      <Input
                        id="su-name"
                        required
                        value={signupForm.fullName}
                        onChange={(e) => setSignupForm({ ...signupForm, fullName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-email">{t("auth.email")}</Label>
                      <Input
                        id="su-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={signupForm.email}
                        onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-password">{t("auth.password")}</Label>
                      <Input
                        id="su-password"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={6}
                        value={signupForm.password}
                        onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy ? t("common.loading") : t("auth.signup")}
                    </Button>
                  </form>
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
}

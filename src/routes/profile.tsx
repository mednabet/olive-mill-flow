/**
 * Page "Mon profil" : édition des infos personnelles et changement de mot de passe.
 * Accessible à tout utilisateur connecté.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { User as UserIcon, KeyRound, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useScales } from "@/lib/settings";
import { PageHeader } from "@/components/PageHeader";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/profile")({
  component: ProfilePageWrapper,
});

function ProfilePageWrapper() {
  return (
    <AppShell>
      <ProfilePage />
    </AppShell>
  );
}

function ProfilePage() {
  const { t } = useI18n();
  const { user, profile, refresh } = useAuth();
  const qc = useQueryClient();
  const { data: scales } = useScales(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState("fr");
  const [defaultScaleId, setDefaultScaleId] = useState<string>("");

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
      setLanguage(profile.preferred_language ?? "fr");
      setDefaultScaleId(profile.default_scale_id ?? "");
    }
  }, [profile]);

  const saveInfos = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("not connected");
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          preferred_language: language,
          default_scale_id: defaultScaleId || null,
        })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(t("profile.updated"));
      await refresh();
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (newPwd.length < 6) throw new Error(t("profile.password_too_short"));
      if (newPwd !== confirmPwd) throw new Error(t("profile.password_mismatch"));
      // Re-authenticate to ensure current password is correct
      if (!user?.email) throw new Error("missing email");
      const { error: signinErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPwd,
      });
      if (signinErr) throw new Error(t("auth.error"));
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("profile.password_updated"));
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title={t("profile.title")}
        subtitle={t("profile.subtitle")}
        icon={<UserIcon className="h-5 w-5" />}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="h-5 w-5 text-primary" />
            {t("profile.info_section")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("auth.username")}</Label>
              <Input value={profile?.username ?? ""} disabled className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("auth.full_name")} <span className="text-destructive">*</span></Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("auth.phone")}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.language")}</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scales && scales.length > 0 && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("admin.scales.title")}</Label>
                <Select value={defaultScaleId || "__none__"} onValueChange={(v) => setDefaultScaleId(v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {scales.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="font-mono text-xs me-2">{s.code}</span>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => saveInfos.mutate()} disabled={saveInfos.isPending || !fullName.trim()}>
              <Save className="me-1 h-4 w-4" />
              {t("common.save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            {t("profile.password_section")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("profile.current_password")} <span className="text-destructive">*</span></Label>
              <Input
                type="password"
                autoComplete="current-password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("profile.new_password")} <span className="text-destructive">*</span></Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                minLength={6}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("profile.confirm_password")} <span className="text-destructive">*</span></Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                minLength={6}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => changePassword.mutate()}
              disabled={changePassword.isPending || !currentPwd || !newPwd || !confirmPwd}
              variant="secondary"
            >
              <KeyRound className="me-1 h-4 w-4" />
              {t("profile.change_password")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Pour éviter erreur de redirect non utilisé
void redirect;

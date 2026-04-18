import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface PlaceholderProps {
  titleKey: TranslationKey;
}

export function ModulePlaceholder({ titleKey }: PlaceholderProps) {
  const { loading, user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">{t(titleKey)}</h1>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Construction className="h-5 w-5 text-accent" />
              <CardTitle>{t("dash.coming_soon")}</CardTitle>
            </div>
            <CardDescription>{t("dash.coming_soon_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Ce module sera développé dans la prochaine itération du projet.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

// Generic re-export helper for placeholder route files
export const placeholderRoute = createFileRoute;

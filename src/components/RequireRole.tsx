/**
 * Garde de route : exige authentification + au moins un des rôles.
 * Redirige vers /login si non connecté ou affiche un message si pas le bon rôle.
 */
import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth, type AppRole } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

interface RequireRoleProps {
  roles: AppRole[];
  children: ReactNode;
}

export function RequireRole({ roles, children }: RequireRoleProps) {
  const { loading, user, hasAnyRole } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (!hasAnyRole(roles)) {
    return (
      <AppShell>
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <CardTitle>{t("role.none")}</CardTitle>
            <CardDescription>{t("role.none_desc")}</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      </AppShell>
    );
  }

  return <AppShell>{children}</AppShell>;
}

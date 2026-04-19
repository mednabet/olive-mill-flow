import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PackageOpen,
  ListOrdered,
  Factory,
  CheckCircle2,
  AlertCircle,
  Plus,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { loading, user, roles } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [loading, user, navigate]);

  if (loading || !user) {
    return <FullScreenLoader />;
  }

  if (roles.length === 0) {
    return <NoRoleScreen />;
  }

  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function FullScreenLoader() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
    </div>
  );
}

function NoRoleScreen() {
  const { t } = useI18n();
  const { signOut, profile } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="max-w-md">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-warning/15 text-warning">
            <AlertCircle className="h-5 w-5" />
          </div>
          <CardTitle>{t("role.none")}</CardTitle>
          <CardDescription>{t("role.none_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{profile?.full_name}</span>
          </p>
          <button
            onClick={() => signOut()}
            className="text-sm text-primary hover:underline"
          >
            {t("auth.signout")}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

function Dashboard() {
  const { t } = useI18n();
  const stats = useDashboardStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.dashboard")}</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString(undefined, { dateStyle: "full" })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={PackageOpen}
          label={t("dash.today_arrivals")}
          value={stats.data?.todayArrivals}
          loading={stats.isLoading}
          color="primary"
        />
        <StatCard
          icon={ListOrdered}
          label={t("dash.in_queue")}
          value={stats.data?.inQueue}
          loading={stats.isLoading}
          color="warning"
        />
        <StatCard
          icon={Factory}
          label={t("dash.in_progress")}
          value={stats.data?.inProgress}
          loading={stats.isLoading}
          color="accent"
        />
        <StatCard
          icon={CheckCircle2}
          label={t("dash.completed_today")}
          value={stats.data?.completedToday}
          loading={stats.isLoading}
          color="success"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dash.quick_actions")}</CardTitle>
          <CardDescription>{t("dash.coming_soon_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2">
            <Link to="/weighing">
              <Plus className="h-4 w-4" />
              {t("dash.new_arrival")}
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="gap-2">
            <Link to="/clients">
              <UserPlus className="h-4 w-4" />
              {t("dash.new_client")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      const [arrivals, queued, inProgress, completed] = await Promise.all([
        supabase.from("arrivals").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
        supabase.from("crushing_files").select("id", { count: "exact", head: true }).in("status", ["queued", "assigned"]),
        supabase.from("crushing_files").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase
          .from("crushing_files")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed")
          .gte("completed_at", todayIso),
      ]);

      return {
        todayArrivals: arrivals.count ?? 0,
        inQueue: queued.count ?? 0,
        inProgress: inProgress.count ?? 0,
        completedToday: completed.count ?? 0,
      };
    },
    refetchInterval: 30_000,
  });
}

const COLOR_MAP = {
  primary: "bg-primary/10 text-primary",
  warning: "bg-warning/15 text-warning",
  accent: "bg-accent/20 text-accent-foreground",
  success: "bg-success/15 text-success",
} as const;

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
  color,
}: {
  icon: typeof PackageOpen;
  label: string;
  value: number | undefined;
  loading: boolean;
  color: keyof typeof COLOR_MAP;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
            {loading ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <div className="tabular text-3xl font-bold tracking-tight">{value ?? 0}</div>
            )}
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${COLOR_MAP[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

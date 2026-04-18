/**
 * Page admin : journal d'audit (lecture seule).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { RequireRole } from "@/components/RequireRole";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/admin/audit")({
  component: () => (
    <RequireRole roles={["admin", "superviseur"]}>
      <AuditPage />
    </RequireRole>
  ),
});

function AuditPage() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.audit.title")} subtitle={t("admin.audit.subtitle")} icon={<History className="h-5 w-5" />} />

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<History className="h-5 w-5" />} title={t("admin.audit.empty")} />
      ) : (
        <ul className="space-y-1">
          {data.map((row) => (
            <li key={row.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <div className="font-mono text-xs text-muted-foreground tabular">{formatDateTime(row.created_at)}</div>
                  <div className="font-medium">{row.action}</div>
                  <div className="text-xs text-muted-foreground">{row.entity_type}</div>
                  {row.reason && <div className="ms-auto truncate text-xs italic text-muted-foreground">{row.reason}</div>}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

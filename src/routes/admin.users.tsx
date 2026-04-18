/**
 * Page admin : gestion des utilisateurs et rôles.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shield, Search, Plus, X, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { RequireRole } from "@/components/RequireRole";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const ALL_ROLES: AppRole[] = ["admin", "superviseur", "peseur", "operateur", "caisse", "public_display"];

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  profile: { full_name: string; phone: string | null; username: string | null } | null;
  roles: AppRole[];
}

export const Route = createFileRoute("/admin/users")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <UsersAdminPage />
    </RequireRole>
  ),
});

async function callAdmin<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: { action, ...body },
  });
  if (error) throw new Error(error.message);
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

function UsersAdminPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const r = await callAdmin<{ users: AdminUser[] }>("list");
      return r.users;
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (u) =>
        u.email?.toLowerCase().includes(q) ||
        u.profile?.full_name.toLowerCase().includes(q),
    );
  }, [data, search]);

  const setRole = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: AppRole }) =>
      callAdmin("set_role", { user_id, role }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success(t("admin.users.role_added")); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRole = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: AppRole }) =>
      callAdmin("remove_role", { user_id, role }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success(t("admin.users.role_removed")); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.users.title")} subtitle={t("admin.users.subtitle")} icon={<Shield className="h-5 w-5" />} />

      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("admin.users.search")} className="ps-9" />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Shield className="h-5 w-5" />} title={t("admin.users.no_user")} />
      ) : (
        <ul className="space-y-2">
          {filtered.map((u) => (
            <li key={u.id}>
              <Card>
                <CardContent className="flex flex-wrap items-start gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{u.profile?.full_name || "—"}</div>
                    <div className="text-sm text-muted-foreground">{u.email}</div>
                    <div className="mt-1 text-xs text-muted-foreground tabular">
                      {t("admin.users.created")}: {formatDateTime(u.created_at)}
                      {u.last_sign_in_at && (
                        <span className="ms-3">{t("admin.users.last_login")}: {formatDateTime(u.last_sign_in_at)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    {u.roles.length === 0 ? (
                      <span className="text-xs italic text-muted-foreground">{t("role.none")}</span>
                    ) : (
                      u.roles.map((r) => (
                        <span
                          key={r}
                          className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                        >
                          {t(`role.${r}` as TranslationKey)}
                          <button
                            onClick={() => removeRole.mutate({ user_id: u.id, role: r })}
                            className="hover:text-destructive"
                            disabled={removeRole.isPending}
                            aria-label={t("admin.users.remove_role")}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))
                    )}

                    <Select onValueChange={(v) => setRole.mutate({ user_id: u.id, role: v as AppRole })}>
                      <SelectTrigger className="h-8 w-[150px] text-xs">
                        <Plus className="me-1 h-3 w-3" />
                        <SelectValue placeholder={t("admin.users.add_role")} />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_ROLES.filter((r) => !u.roles.includes(r)).map((r) => (
                          <SelectItem key={r} value={r}>{t(`role.${r}` as TranslationKey)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

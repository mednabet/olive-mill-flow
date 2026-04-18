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
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ username: "", full_name: "", phone: "", password: "", role: "" as AppRole | "" });

  const resetForm = () => setForm({ username: "", full_name: "", phone: "", password: "", role: "" });

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
        u.profile?.full_name.toLowerCase().includes(q) ||
        u.profile?.username?.toLowerCase().includes(q),
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

  const createUser = useMutation({
    mutationFn: async () => {
      const username = form.username.trim().toLowerCase();
      if (!/^[a-z0-9._-]{2,}$/.test(username)) throw new Error(t("admin.users.username_invalid"));
      if (form.password.length < 6) throw new Error(t("profile.password_too_short"));
      if (!form.full_name.trim()) throw new Error(t("auth.full_name"));
      return callAdmin("create_user", {
        username,
        password: form.password,
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        role: form.role || null,
      });
    },
    onSuccess: () => {
      toast.success(t("admin.users.created_ok"));
      setCreateOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("admin.users.title")}
        subtitle={t("admin.users.subtitle")}
        icon={<Shield className="h-5 w-5" />}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="me-1 h-4 w-4" />
            {t("admin.users.new")}
          </Button>
        }
      />

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
                      u.roles.map((r) => {
                        const isProtectedAdmin =
                          r === "admin" && u.profile?.username === "admin";
                        return (
                          <span
                            key={r}
                            className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                          >
                            {t(`role.${r}` as TranslationKey)}
                            {!isProtectedAdmin && (
                              <button
                                onClick={() => removeRole.mutate({ user_id: u.id, role: r })}
                                className="hover:text-destructive"
                                disabled={removeRole.isPending}
                                aria-label={t("admin.users.remove_role")}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </span>
                        );
                      })
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

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              {t("admin.users.create_title")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("auth.username")} <span className="text-destructive">*</span></Label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder={t("auth.username_ph")}
                autoCapitalize="off"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">{t("admin.users.username_help")}</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("auth.full_name")} <span className="text-destructive">*</span></Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("auth.phone")}</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} type="tel" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("auth.password")} <span className="text-destructive">*</span></Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={6}
              />
              <p className="text-xs text-muted-foreground">{t("admin.users.password_help")}</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("admin.users.add_role")}</Label>
              <Select value={form.role || "__none__"} onValueChange={(v) => setForm({ ...form, role: v === "__none__" ? "" : (v as AppRole) })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {ALL_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{t(`role.${r}` as TranslationKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={() => createUser.mutate()}
              disabled={createUser.isPending || !form.username || !form.full_name || !form.password}
            >
              <UserPlus className="me-1 h-4 w-4" />
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

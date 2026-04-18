/**
 * Module Clients : liste, recherche, CRUD, panneau de détails latéral avec véhicules.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Users,
  Plus,
  Search,
  Pencil,
  Trash2,
  Phone,
  MapPin,
  Languages,
  Car,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useI18n } from "@/lib/i18n";
import { RequireRole } from "@/components/RequireRole";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ClientFormDialog } from "@/components/clients/ClientFormDialog";
import { VehiclesPanel } from "@/components/clients/VehiclesPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type Client = Database["public"]["Tables"]["clients"]["Row"];

export const Route = createFileRoute("/clients")({
  component: () => (
    <RequireRole roles={["admin", "superviseur", "peseur", "caisse"]}>
      <ClientsPage />
    </RequireRole>
  ),
});

function ClientsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    if (!clients) return [];
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)),
    );
  }, [clients, search]);

  const selected = useMemo(
    () => clients?.find((c) => c.id === selectedId) ?? null,
    [clients, selectedId],
  );

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success(t("client.deleted_success"));
      setDeleteTarget(null);
      if (deleteTarget?.id === selectedId) setSelectedId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleNew = () => {
    setEditClient(null);
    setDialogOpen(true);
  };
  const handleEdit = (c: Client) => {
    setEditClient(c);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("client.title")}
        subtitle={t("client.subtitle")}
        icon={<Users className="h-5 w-5" />}
        actions={
          <Button onClick={handleNew}>
            <Plus className="me-1 h-4 w-4" />
            {t("client.new")}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Colonne liste */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("client.search_placeholder")}
              className="ps-9"
            />
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title={search ? t("common.empty") : t("client.empty_title")}
              description={search ? t("common.try_search") : t("client.empty_desc")}
              action={
                !search && (
                  <Button onClick={handleNew}>
                    <Plus className="me-1 h-4 w-4" />
                    {t("client.new")}
                  </Button>
                )
              }
            />
          ) : (
            <ul className="space-y-2">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "group w-full rounded-lg border bg-card p-4 text-start transition-all hover:border-primary/40 hover:shadow-sm",
                      selectedId === c.id && "border-primary bg-primary/5 shadow-sm",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-accent-foreground bg-accent/30 px-1.5 py-0.5 rounded tabular">
                            {c.code}
                          </span>
                          {!c.is_active && (
                            <Badge variant="secondary" className="text-xs">
                              {t("common.inactive")}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            <Languages className="me-1 h-3 w-3" />
                            {c.preferred_language.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="mt-1 truncate font-semibold text-foreground">
                          {c.full_name}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {c.phone && (
                            <span className="inline-flex items-center gap-1" dir="ltr">
                              <Phone className="h-3 w-3" /> {c.phone}
                            </span>
                          )}
                          {c.address && (
                            <span className="inline-flex items-center gap-1 truncate">
                              <MapPin className="h-3 w-3" /> {c.address}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Colonne détails */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          {selected ? (
            <Card>
              <CardContent className="space-y-5 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-semibold text-accent-foreground bg-accent/30 inline-block px-1.5 py-0.5 rounded tabular">
                      {selected.code}
                    </div>
                    <h2 className="mt-1 truncate text-lg font-bold">{selected.full_name}</h2>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(selected)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(selected)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  {selected.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <span dir="ltr" className="text-foreground">{selected.phone}</span>
                    </div>
                  )}
                  {selected.address && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                      <span className="text-foreground">{selected.address}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Languages className="h-4 w-4" />
                    <span className="text-foreground">
                      {selected.preferred_language === "ar" ? t("client.ar") : t("client.fr")}
                    </span>
                  </div>
                  {selected.notes && (
                    <p className="rounded-md bg-muted/40 p-2 text-xs italic text-muted-foreground">
                      {selected.notes}
                    </p>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Car className="h-4 w-4" />
                    {t("client.vehicles")}
                  </div>
                  <VehiclesPanel clientId={selected.id} />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8">
                <EmptyState
                  icon={<Users className="h-5 w-5" />}
                  title={t("client.title")}
                  description={t("client.empty_desc")}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ClientFormDialog open={dialogOpen} onOpenChange={setDialogOpen} client={editClient} />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("client.delete_confirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <span className="font-semibold">{deleteTarget.full_name}</span> ({deleteTarget.code})
                  <br />
                  {t("client.delete_confirm_desc")}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Page admin : paramètres du moulin (informations légales) + TVA par défaut.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Settings as SettingsIcon, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { RequireRole } from "@/components/RequireRole";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MillInfo {
  name?: string;
  address?: string;
  phone?: string;
  ice?: string;
  if?: string;
  rc?: string;
  patente?: string;
  cnss?: string;
}

export const Route = createFileRoute("/admin/settings")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <SettingsPage />
    </RequireRole>
  ),
});

function SettingsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const millQ = useQuery({
    queryKey: ["settings-mill"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("value").eq("key", "mill_info").maybeSingle();
      return (data?.value as MillInfo) ?? {};
    },
  });
  const vatQ = useQuery({
    queryKey: ["settings-vat"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("value").eq("key", "vat_default").maybeSingle();
      return (data?.value as { rate: number; currency: string }) ?? { rate: 20, currency: "MAD" };
    },
  });

  const [mill, setMill] = useState<MillInfo>({});
  const [vatRate, setVatRate] = useState<string>("20");
  const [currency, setCurrency] = useState<string>("MAD");

  useEffect(() => { if (millQ.data) setMill(millQ.data); }, [millQ.data]);
  useEffect(() => {
    if (vatQ.data) {
      setVatRate(String(vatQ.data.rate ?? 20));
      setCurrency(vatQ.data.currency ?? "MAD");
    }
  }, [vatQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      await supabase.from("settings").upsert({ key: "mill_info", value: mill });
      await supabase.from("settings").upsert({ key: "vat_default", value: { rate: parseFloat(vatRate) || 20, currency } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings-mill"] });
      qc.invalidateQueries({ queryKey: ["settings-vat"] });
      qc.invalidateQueries({ queryKey: ["mill-info"] });
      toast.success(t("admin.settings.saved"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof MillInfo, v: string) => setMill((m) => ({ ...m, [k]: v }));

  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.settings.title")} subtitle={t("admin.settings.subtitle")} icon={<SettingsIcon className="h-5 w-5" />} />

      <Card>
        <CardHeader><CardTitle>{t("admin.settings.mill_info")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t("admin.settings.mill_name")} value={mill.name ?? ""} onChange={(v) => set("name", v)} />
          <Field label={t("admin.settings.mill_phone")} value={mill.phone ?? ""} onChange={(v) => set("phone", v)} />
          <div className="sm:col-span-2">
            <Field label={t("admin.settings.mill_address")} value={mill.address ?? ""} onChange={(v) => set("address", v)} />
          </div>
          <Field label={t("admin.settings.mill_ice")} value={mill.ice ?? ""} onChange={(v) => set("ice", v)} />
          <Field label={t("admin.settings.mill_if")} value={mill.if ?? ""} onChange={(v) => set("if", v)} />
          <Field label={t("admin.settings.mill_rc")} value={mill.rc ?? ""} onChange={(v) => set("rc", v)} />
          <Field label={t("admin.settings.mill_patente")} value={mill.patente ?? ""} onChange={(v) => set("patente", v)} />
          <Field label={t("admin.settings.mill_cnss")} value={mill.cnss ?? ""} onChange={(v) => set("cnss", v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("admin.settings.vat")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("admin.settings.vat")}</Label>
            <Input type="number" step="0.1" min="0" value={vatRate} onChange={(e) => setVatRate(e.target.value)} className="font-mono tabular" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.settings.currency")}</Label>
            <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} className="font-mono uppercase" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="me-1 h-4 w-4" />{t("common.save")}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

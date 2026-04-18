/**
 * Dialog de création / édition d'un client.
 * Le code est auto-généré côté DB via next_client_code() à la création.
 */
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useI18n } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Client = Database["public"]["Tables"]["clients"]["Row"];

const schema = z.object({
  full_name: z.string().trim().min(2, { message: "min:2" }).max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  preferred_language: z.enum(["fr", "ar"]),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client | null;
  onCreated?: (client: Client) => void;
}

export function ClientFormDialog({ open, onOpenChange, client, onCreated }: Props) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const isEdit = !!client;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: "",
      phone: "",
      address: "",
      preferred_language: "fr",
      notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        full_name: client?.full_name ?? "",
        phone: client?.phone ?? "",
        address: client?.address ?? "",
        preferred_language: (client?.preferred_language as "fr" | "ar") ?? "fr",
        notes: client?.notes ?? "",
      });
    }
  }, [open, client, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        full_name: values.full_name,
        phone: values.phone || null,
        address: values.address || null,
        preferred_language: values.preferred_language,
        notes: values.notes || null,
      };

      if (isEdit && client) {
        const { data, error } = await supabase
          .from("clients")
          .update(payload)
          .eq("id", client.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        // Génère le code via la fonction DB
        const { data: codeData, error: codeErr } = await supabase.rpc("next_client_code");
        if (codeErr) throw codeErr;
        const { data, error } = await supabase
          .from("clients")
          .insert({ ...payload, code: codeData as string })
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success(isEdit ? t("client.updated_success") : t("client.created_success"));
      onOpenChange(false);
      if (!isEdit && data) onCreated?.(data);
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("client.edit") : t("client.new")}</DialogTitle>
          <DialogDescription>
            {isEdit ? `${t("client.code")} : ${client?.code}` : t("client.code_auto")}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="full_name">
              {t("client.full_name")} <span className="text-destructive">*</span>
            </Label>
            <Input id="full_name" {...form.register("full_name")} autoFocus />
            {form.formState.errors.full_name && (
              <p className="text-xs text-destructive">{t("validation.required")}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="phone">
                {t("client.phone")}{" "}
                <span className="text-xs text-muted-foreground">({t("common.optional")})</span>
              </Label>
              <Input id="phone" type="tel" dir="ltr" {...form.register("phone")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="preferred_language">{t("client.preferred_language")}</Label>
              <Select
                value={form.watch("preferred_language")}
                onValueChange={(v) =>
                  form.setValue("preferred_language", v as "fr" | "ar", { shouldDirty: true })
                }
              >
                <SelectTrigger id="preferred_language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">{t("client.fr")}</SelectItem>
                  <SelectItem value="ar">{t("client.ar")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address">
              {t("client.address")}{" "}
              <span className="text-xs text-muted-foreground">({t("common.optional")})</span>
            </Label>
            <Input id="address" {...form.register("address")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">
              {t("client.notes")}{" "}
              <span className="text-xs text-muted-foreground">({t("common.optional")})</span>
            </Label>
            <Textarea id="notes" rows={3} {...form.register("notes")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? t("common.loading") : isEdit ? t("common.update") : t("common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Module Produits : catalogue unifié des items du moulin.
 * Catégories : olives (variétés), huiles, sous-produits, services.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Package, Plus, Pencil, Power, Sprout, Droplet, Recycle, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { RequireRole } from "@/components/RequireRole";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ProductCategory = "olive" | "oil" | "byproduct" | "service";
type ProductUnit = "kg" | "liter" | "unit" | "service";

type Product = {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  category: ProductCategory;
  unit: ProductUnit;
  unit_price: number | null;
  avg_yield_percent: number | null;
  color: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const CATEGORY_ICONS: Record<ProductCategory, typeof Package> = {
  olive: Sprout,
  oil: Droplet,
  byproduct: Recycle,
  service: Wrench,
};

// Bypass des types générés tant que Supabase n'a pas régénéré (table renommée)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

export const Route = createFileRoute("/products")({
  component: () => (
    <RequireRole roles={["admin", "superviseur", "peseur", "operateur", "caisse"]}>
      <ProductsPage />
    </RequireRole>
  ),
});

function ProductsPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<ProductCategory | "all">("all");
  const [editing, setEditing] = useState<Product | null>(null);
  const [showNew, setShowNew] = useState(false);

  const list = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("products")
        .select("*")
        .order("category", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Product[];
    },
  });

  const filtered = useMemo(() => {
    if (!list.data) return [];
    const s = search.trim().toLowerCase();
    return list.data.filter((p) => {
      if (filterCategory !== "all" && p.category !== filterCategory) return false;
      if (!s) return true;
      return (
        p.name.toLowerCase().includes(s) ||
        p.code.toLowerCase().includes(s) ||
        (p.name_ar?.toLowerCase().includes(s) ?? false)
      );
    });
  }, [list.data, search, filterCategory]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("product.title")}
        subtitle={t("product.subtitle")}
        icon={<Package className="h-5 w-5" />}
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus className="me-1 h-4 w-4" />
            {t("product.new")}
          </Button>
        }
      />

      <div className="flex flex-wrap gap-3">
        <div className="min-w-[240px] flex-1 max-w-md">
          <Input
            placeholder={t("product.search_placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v as ProductCategory | "all")}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("product.category.all")}</SelectItem>
            <SelectItem value="olive">{t("product.category.olive")}</SelectItem>
            <SelectItem value="oil">{t("product.category.oil")}</SelectItem>
            <SelectItem value="byproduct">{t("product.category.byproduct")}</SelectItem>
            <SelectItem value="service">{t("product.category.service")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {list.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title={t("product.empty_title")}
          description={t("product.empty_desc")}
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((p) => (
            <ProductRow key={p.id} product={p} onEdit={() => setEditing(p)} />
          ))}
        </ul>
      )}

      <ProductDialog open={showNew} onOpenChange={setShowNew} product={null} />
      <ProductDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        product={editing}
      />
    </div>
  );
}

function ProductRow({ product, onEdit }: { product: Product; onEdit: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const Icon = CATEGORY_ICONS[product.category] ?? Package;

  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = await sb
        .from("products")
        .update({ is_active: !product.is_active })
        .eq("id", product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(t("common.success"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unitLabel = t(`product.unit.${product.unit}` as TranslationKey);

  return (
    <li>
      <Card className={product.is_active ? "" : "opacity-60"}>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border text-white"
            style={{ backgroundColor: product.color ?? "#84cc16" }}
            aria-hidden
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{product.name}</span>
              <span className="font-mono text-xs text-muted-foreground tabular">
                {product.code}
              </span>
              <StatusBadge tone="info">
                {t(`product.category.${product.category}` as TranslationKey)}
              </StatusBadge>
              {!product.is_active && (
                <StatusBadge tone="warning">{t("common.inactive")}</StatusBadge>
              )}
            </div>
            {product.name_ar && (
              <div className="text-sm text-muted-foreground" dir="rtl">
                {product.name_ar}
              </div>
            )}
            {product.notes && (
              <div className="mt-1 text-xs text-muted-foreground">{product.notes}</div>
            )}
          </div>
          {product.unit_price !== null && (
            <div className="text-end">
              <div className="text-xs text-muted-foreground">{t("product.unit_price")}</div>
              <div className="font-mono text-lg font-bold tabular">
                {Number(product.unit_price).toFixed(2)}
                <span className="ms-1 text-xs font-normal text-muted-foreground">/ {unitLabel}</span>
              </div>
            </div>
          )}
          {product.category === "olive" && product.avg_yield_percent !== null && (
            <div className="text-end">
              <div className="text-xs text-muted-foreground">{t("product.avg_yield")}</div>
              <div className="font-mono text-lg font-bold tabular">
                {Number(product.avg_yield_percent).toFixed(1)}%
              </div>
            </div>
          )}
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggle.mutate()}
              disabled={toggle.isPending}
              title={product.is_active ? t("common.deactivate") : t("common.activate")}
            >
              <Power className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function ProductDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product: Product | null;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [category, setCategory] = useState<ProductCategory>("olive");
  const [unit, setUnit] = useState<ProductUnit>("kg");
  const [unitPrice, setUnitPrice] = useState("");
  const [yieldPct, setYieldPct] = useState("");
  const [color, setColor] = useState("#84cc16");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setCode(product?.code ?? "");
      setName(product?.name ?? "");
      setNameAr(product?.name_ar ?? "");
      setCategory(product?.category ?? "olive");
      setUnit(product?.unit ?? "kg");
      setUnitPrice(product?.unit_price != null ? String(product.unit_price) : "");
      setYieldPct(
        product?.avg_yield_percent != null ? String(product.avg_yield_percent) : "",
      );
      setColor(product?.color ?? "#84cc16");
      setNotes(product?.notes ?? "");
    }
  }, [open, product]);

  const save = useMutation({
    mutationFn: async () => {
      if (!code.trim() || !name.trim()) throw new Error(t("validation.required"));
      const payload = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        name_ar: nameAr.trim() || null,
        category,
        unit,
        unit_price: unitPrice.trim() ? parseFloat(unitPrice) : null,
        avg_yield_percent:
          category === "olive" && yieldPct.trim() ? parseFloat(yieldPct) : null,
        color,
        notes: notes.trim() || null,
      };
      if (product) {
        const { error } = await sb.from("products").update(payload).eq("id", product.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(product ? t("product.updated") : t("product.created"));
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? t("product.edit") : t("product.new")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("product.category")}</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ProductCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="olive">{t("product.category.olive")}</SelectItem>
                  <SelectItem value="oil">{t("product.category.oil")}</SelectItem>
                  <SelectItem value="byproduct">{t("product.category.byproduct")}</SelectItem>
                  <SelectItem value="service">{t("product.category.service")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("product.unit")}</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as ProductUnit)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">{t("product.unit.kg")}</SelectItem>
                  <SelectItem value="liter">{t("product.unit.liter")}</SelectItem>
                  <SelectItem value="unit">{t("product.unit.unit")}</SelectItem>
                  <SelectItem value="service">{t("product.unit.service")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("product.code")}</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="HUIL-EV"
                className="font-mono uppercase"
                maxLength={16}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("product.color")}</Label>
              <Input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 p-1"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("product.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("product.name_ar")}</Label>
            <Input
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              dir="rtl"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("product.unit_price")}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="font-mono tabular"
              />
            </div>
            {category === "olive" && (
              <div className="space-y-1.5">
                <Label>{t("product.avg_yield")} (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={yieldPct}
                  onChange={(e) => setYieldPct(e.target.value)}
                  className="font-mono tabular"
                />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {product ? t("common.update") : t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

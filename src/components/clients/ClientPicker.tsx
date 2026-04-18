/**
 * Combobox de recherche/sélection de client.
 * Recherche serveur avec debounce léger côté client.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

type Client = Database["public"]["Tables"]["clients"]["Row"];

interface Props {
  value: Client | null;
  onChange: (c: Client | null) => void;
  onCreateNew?: () => void;
  className?: string;
}

export function ClientPicker({ value, onChange, onCreateNew, className }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { data: clients } = useQuery({
    queryKey: ["clients-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("is_active", true)
        .order("full_name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    if (!clients) return [];
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 50);
    return clients
      .filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q) ||
          (c.phone && c.phone.toLowerCase().includes(q)),
      )
      .slice(0, 50);
  }, [clients, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          {value ? (
            <span className="flex items-center gap-2 truncate">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-xs tabular text-muted-foreground">{value.code}</span>
              <span className="truncate">{value.full_name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{t("arrival.select_or_search")}</span>
          )}
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start" style={{ width: "var(--radix-popover-trigger-width)" }}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t("client.search_placeholder")}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{t("common.empty")}</CommandEmpty>
            <CommandGroup>
              {filtered.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    onChange(c);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex items-center gap-2"
                >
                  <Check
                    className={cn("h-4 w-4", value?.id === c.id ? "opacity-100" : "opacity-0")}
                  />
                  <span className="font-mono text-xs tabular text-muted-foreground">{c.code}</span>
                  <span className="flex-1 truncate">{c.full_name}</span>
                  {c.phone && (
                    <span className="text-xs text-muted-foreground tabular" dir="ltr">
                      {c.phone}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            {onCreateNew && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setOpen(false);
                      onCreateNew();
                    }}
                    className="text-primary"
                  >
                    <Plus className="me-2 h-4 w-4" />
                    {t("arrival.create_client_inline")}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Bouton dans la file d'attente : ouvre un popover listant les arrivées
 * rattachées au dossier, chacune avec un raccourci "Réaffecter / Détacher".
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { formatKg } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AssignCrushingFileDialog } from "./AssignCrushingFileDialog";

interface Props {
  fileId: string;
  clientId: string | null;
}

export function QueueFileArrivalsButton({ fileId, clientId }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<{
    id: string;
    ticket: string;
    clientId: string | null;
  } | null>(null);

  const { data: links } = useQuery({
    queryKey: ["queue-file-arrivals", fileId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crushing_file_arrivals")
        .select(
          "id, net_weight_kg, arrival:arrivals!arrival_id(id, ticket_number, client_id)",
        )
        .eq("crushing_file_id", fileId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Link2 className="me-1 h-3.5 w-3.5" />
            {t("crushing.attached_arrivals")}
            <ChevronDown className="ms-1 h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="end">
          {!links || links.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs italic text-muted-foreground">
              {t("common.no_data")}
            </p>
          ) : (
            <ul className="space-y-1">
              {links.map((l) => {
                const arr = l.arrival as unknown as {
                  id: string;
                  ticket_number: string;
                  client_id: string | null;
                } | null;
                if (!arr) return null;
                return (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-accent"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm font-bold tabular">
                        {arr.ticket_number}
                      </div>
                      {l.net_weight_kg !== null && (
                        <div className="text-xs text-muted-foreground tabular">
                          {formatKg(l.net_weight_kg)}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTarget({
                          id: arr.id,
                          ticket: arr.ticket_number,
                          clientId: arr.client_id ?? clientId,
                        });
                        setOpen(false);
                      }}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>

      {target && (
        <AssignCrushingFileDialog
          open={!!target}
          onOpenChange={(o) => !o && setTarget(null)}
          arrivalId={target.id}
          clientId={target.clientId}
          arrivalTicket={target.ticket}
        />
      )}
    </>
  );
}

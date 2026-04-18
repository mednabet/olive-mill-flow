/**
 * Wrapper d'impression : isole un contenu et expose un bouton imprimer/fermer.
 * S'appuie sur la classe .ticket-print définie dans styles.css.
 */
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

interface PrintLayoutProps {
  onClose: () => void;
  children: React.ReactNode;
}

export function PrintLayout({ onClose, children }: PrintLayoutProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2 no-print">
        <Button variant="outline" onClick={onClose}>
          <X className="me-1 h-4 w-4" />
          {t("common.close")}
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="me-1 h-4 w-4" />
          {t("common.print")}
        </Button>
      </div>
      {children}
    </div>
  );
}

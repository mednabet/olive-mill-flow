import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLocale(locale === "fr" ? "ar" : "fr")}
      className="gap-2"
      aria-label="Toggle language"
    >
      <Languages className="h-4 w-4" />
      <span className="text-xs font-semibold uppercase">{locale === "fr" ? "AR" : "FR"}</span>
    </Button>
  );
}

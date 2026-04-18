/**
 * Formatage monétaire et numérique cohérent dans toute l'app.
 */
export function formatMoney(value: number | null | undefined, locale = "fr-MA", currency = "MAD"): string {
  const v = typeof value === "number" ? value : 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
}

export function formatKg(value: number | null | undefined): string {
  const v = typeof value === "number" ? value : 0;
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} kg`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  const v = typeof value === "number" ? value : 0;
  return `${v.toFixed(digits)} %`;
}

export function formatDateTime(d: string | Date | null | undefined, locale = "fr-FR"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
}

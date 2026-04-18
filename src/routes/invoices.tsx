import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export const Route = createFileRoute("/invoices")({
  component: () => <ModulePlaceholder titleKey="nav.invoices" />,
});

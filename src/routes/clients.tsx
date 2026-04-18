import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export const Route = createFileRoute("/clients")({
  component: () => <ModulePlaceholder titleKey="nav.clients" />,
});

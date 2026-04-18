import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export const Route = createFileRoute("/admin/settings")({
  component: () => <ModulePlaceholder titleKey="nav.settings" />,
});

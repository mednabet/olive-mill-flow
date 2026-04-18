import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export const Route = createFileRoute("/crushing")({
  component: () => <ModulePlaceholder titleKey="nav.crushing" />,
});

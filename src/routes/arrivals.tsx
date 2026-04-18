import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export const Route = createFileRoute("/arrivals")({
  component: () => <ModulePlaceholder titleKey="nav.arrivals" />,
});

import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export const Route = createFileRoute("/public-display")({
  component: () => <ModulePlaceholder titleKey="nav.public_display" />,
});

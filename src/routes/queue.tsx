import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export const Route = createFileRoute("/queue")({
  component: () => <ModulePlaceholder titleKey="nav.queue" />,
});

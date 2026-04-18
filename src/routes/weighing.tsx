import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export const Route = createFileRoute("/weighing")({
  component: () => <ModulePlaceholder titleKey="nav.weighing" />,
});

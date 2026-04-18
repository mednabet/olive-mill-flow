import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export const Route = createFileRoute("/stocks")({
  component: () => <ModulePlaceholder titleKey="nav.stocks" />,
});

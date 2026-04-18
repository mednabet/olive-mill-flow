import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export const Route = createFileRoute("/admin/users")({
  component: () => <ModulePlaceholder titleKey="nav.users" />,
});

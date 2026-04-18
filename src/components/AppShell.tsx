/**
 * Shell applicatif : sidebar + header. Affiche les modules accessibles
 * en fonction des rôles de l'utilisateur.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  PackageOpen,
  Scale,
  Factory,
  ListOrdered,
  Boxes,
  Users,
  Receipt,
  Monitor,
  Settings,
  Shield,
  ScrollText,
  LogOut,
  Droplets,
  UserCircle,
} from "lucide-react";
import { useAuth, type AppRole } from "@/lib/auth";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: TranslationKey;
  icon: typeof LayoutDashboard;
  roles: AppRole[];
}

const NAV: NavItem[] = [
  { to: "/", label: "nav.dashboard", icon: LayoutDashboard, roles: ["admin", "superviseur", "peseur", "operateur", "caisse"] },
  { to: "/arrivals", label: "nav.arrivals", icon: PackageOpen, roles: ["admin", "superviseur", "peseur"] },
  { to: "/weighing", label: "nav.weighing", icon: Scale, roles: ["admin", "superviseur", "peseur"] },
  { to: "/queue", label: "nav.queue", icon: ListOrdered, roles: ["admin", "superviseur", "peseur", "operateur"] },
  { to: "/crushing", label: "nav.crushing", icon: Factory, roles: ["admin", "superviseur", "operateur"] },
  { to: "/production", label: "nav.production", icon: Factory, roles: ["admin", "superviseur", "operateur"] },
  { to: "/stocks", label: "nav.stocks", icon: Boxes, roles: ["admin", "superviseur", "operateur"] },
  { to: "/clients", label: "nav.clients", icon: Users, roles: ["admin", "superviseur", "peseur", "caisse"] },
  { to: "/invoices", label: "nav.invoices", icon: Receipt, roles: ["admin", "superviseur", "caisse"] },
  { to: "/public-display", label: "nav.public_display", icon: Monitor, roles: ["admin", "superviseur"] },
  { to: "/admin/users", label: "nav.users", icon: Shield, roles: ["admin"] },
  { to: "/admin/lines", label: "nav.lines", icon: Factory, roles: ["admin", "superviseur"] },
  { to: "/admin/scales", label: "nav.scales", icon: Scale, roles: ["admin", "superviseur"] },
  { to: "/admin/audit", label: "nav.audit", icon: ScrollText, roles: ["admin", "superviseur"] },
  { to: "/admin/settings", label: "nav.settings", icon: Settings, roles: ["admin"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, roles, signOut, hasAnyRole } = useAuth();
  const { t, dir } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const visible = NAV.filter((n) => hasAnyRole(n.roles));

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 z-40 hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex",
          dir === "rtl" ? "right-0 border-l border-sidebar-border" : "left-0 border-r border-sidebar-border",
        )}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Droplets className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{t("app.title")}</div>
            <div className="truncate text-xs text-sidebar-foreground/70">{t("app.tagline")}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {visible.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold"
                        : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t(item.label)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 px-2 text-xs">
            <div className="truncate font-medium">{profile?.full_name || "—"}</div>
            <div className="truncate text-sidebar-foreground/60">
              {roles.length > 0 ? roles.map((r) => t(`role.${r}` as TranslationKey)).join(" · ") : t("role.none")}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut()}
            className="w-full justify-start gap-2 text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            {t("auth.signout")}
          </Button>
        </div>
      </aside>

      {/* Content */}
      <div className={cn("flex flex-1 flex-col", dir === "rtl" ? "lg:mr-64" : "lg:ml-64")}>
        <header className="flex h-14 items-center justify-between border-b bg-card px-4 lg:px-6">
          <div className="text-sm text-muted-foreground">
            {t("common.welcome_user")}, <span className="font-medium text-foreground">{profile?.full_name || "—"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/profile" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
              <UserCircle className="h-4 w-4" />
              <span className="hidden sm:inline">{t("nav.profile")}</span>
            </Link>
            <LanguageSwitcher />
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

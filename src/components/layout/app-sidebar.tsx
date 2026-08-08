import { NavLink } from "react-router-dom";
import {
  Home,
  FileText,
  Settings,
  BookOpen,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ThemeToggle } from "./theme-toggle";
import { useSidebarPrefs } from "./sidebar-prefs";
import { useRecentDocs } from "@/features/docs/recent-docs";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { to: "/", label: "Home", icon: <Home className="h-4 w-4" />, end: true },
  { to: "/docs", label: "Docs", icon: <FileText className="h-4 w-4" /> },
  { to: "/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
];

const COLLAPSED_WIDTH = "w-12";
const EXPANDED_WIDTH = "w-60";

/**
 * Persistent left navigation. Collapsible — click the chevron button
 * at the bottom to toggle between expanded (240px, labels visible)
 * and collapsed (48px, icons only). State persists in localStorage.
 */
export function AppSidebar() {
  const recents = useRecentDocs((s) => s.recents);
  const collapsed = useSidebarPrefs((s) => s.appSidebarCollapsed);

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-r bg-card transition-[width] duration-200",
        collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
      )}
    >
        {/* Brand */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b",
            collapsed ? "justify-center px-0" : "gap-2 px-4",
          )}
        >
          <BookOpen className="h-5 w-5 shrink-0 text-primary" />
          {!collapsed && (
            <span className="truncate text-base font-semibold tracking-tight">
              docme
            </span>
          )}
        </div>

        {/* Primary nav */}
        <nav className="flex flex-col gap-1 p-2" aria-label="Primary">
          {PRIMARY_NAV.map((item) => {
            const link = (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                aria-label={item.label}
                className={({ isActive }) =>
                  cn(
                    "flex items-center rounded-md text-sm transition-colors",
                    collapsed
                      ? "h-9 w-9 justify-center"
                      : "gap-2 px-2 py-1.5",
                    isActive
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )
                }
              >
                {item.icon}
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
            return collapsed ? (
              <Tooltip key={item.to}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              link
            );
          })}
        </nav>

        <Separator />

        {/* Recent docs — hidden when collapsed */}
        {!collapsed && (
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent docs
            </p>
            <ScrollArea className="flex-1">
              {recents.length === 0 ? (
                <p className="px-2 py-2 text-xs italic text-muted-foreground">
                  No docs opened yet.
                </p>
              ) : (
                <ul className="space-y-1">
                  {recents.map((r) => (
                    <li key={r.itemId}>
                      <NavLink
                        to={`/docs/${r.itemId}`}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                            isActive
                              ? "bg-accent font-medium text-accent-foreground"
                              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                          )
                        }
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{r.name}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>
        )}

        <Separator />

        {/* Footer: theme toggle */}
        <div
          className={cn(
            "flex shrink-0 items-center p-2",
            collapsed ? "flex-col gap-1" : "justify-between gap-2",
          )}
        >
          {!collapsed && (
            <span className="text-xs text-muted-foreground">Theme</span>
          )}
          <ThemeToggle />
        </div>
      </aside>
  );
}

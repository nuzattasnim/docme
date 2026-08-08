import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Breadcrumbs } from "./breadcrumbs";
import { UserMenu } from "./user-menu";
import { ThemeToggle } from "./theme-toggle";
import { Separator } from "@/components/ui/separator";
import { useSidebarPrefs } from "./sidebar-prefs";

/**
 * Topbar — fixed-height strip above the routed content. Layout:
 *   [collapse-sidebar] [breadcrumb trail]   [theme] [user]
 *
 * The collapse trigger lives at the far left so it's always
 * reachable — even when the AppSidebar is collapsed and not visible.
 */
export function AppTopbar() {
  const collapsed = useSidebarPrefs((s) => s.appSidebarCollapsed);
  const toggle = useSidebarPrefs((s) => s.toggleAppSidebar);

  return (
    <header className="flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={toggle}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {collapsed ? "Expand sidebar" : "Collapse sidebar"}
          </TooltipContent>
        </Tooltip>
        <Breadcrumbs />
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Separator orientation="vertical" className="h-6" />
        <UserMenu />
      </div>
    </header>
  );
}

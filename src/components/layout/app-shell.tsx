import { Outlet, Navigate } from "react-router-dom";
import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import { RouteLoading } from "./route-loading";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { OrgGate } from "@/features/orgs/org-gate";
import { PermissionErrorAlert } from "@/features/access/permission-error-alert";

/**
 * AppShell — wrapper for every authenticated route. Renders the
 * persistent sidebar + topbar grid and mounts an auth gate:
 *   - `loading`     → skeleton
 *   - no user       → redirect to /login
 *   - authenticated → <OrgGate> (organization + docme role, SPEC2 C5/C6),
 *                     then <Outlet />
 *
 * Layout: the outer container is `h-screen overflow-hidden`. The
 * topbar is fixed-height (`shrink-0`). The main area is `flex-1
 * overflow-hidden` — it does NOT scroll itself. Pages with internal
 * scroll (like the DocDetailPage) take over scrolling for their own
 * content; short pages just sit centered inside.
 *
 * The whole shell is wrapped in a single `<TooltipProvider>` so
 * every Tooltip-using component (topbar, sidebar, page chrome, page
 * content) shares one provider — no per-component wrapping needed.
 */
export function AppShell() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <TooltipProvider delayDuration={150}>
        <div className="flex h-screen w-screen overflow-hidden bg-background">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <AppTopbar />
            <main className="flex-1 overflow-hidden">
              <RouteLoading />
            </main>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-screen w-screen overflow-hidden bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AppTopbar />
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <PermissionErrorAlert />
            <div className="min-h-0 flex-1 overflow-hidden">
              <OrgGate>
                <Outlet />
              </OrgGate>
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

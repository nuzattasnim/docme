import { Suspense, lazy } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// The migration panel is compiled in only when the build sets
// VITE_ENABLE_MIGRATION=true. Vite inlines the value, so in any other build
// this condition is constant-false and the panel's chunk is never emitted.
const MigrationPanel =
	import.meta.env.VITE_ENABLE_MIGRATION === "true"
		? lazy(() => import("@/features/migration/migration-panel"))
		: null;

// TEMPORARY (SPEC2 spike S0): only in builds with VITE_ENABLE_SPIKE=true.
const S0ProbePanel =
	import.meta.env.VITE_ENABLE_SPIKE === "true"
		? lazy(() => import("@/features/access/s0-probe-panel"))
		: null;

/**
 * Settings — `/settings`. Account preferences live in the topbar today; the
 * data migration card appears here in migration-enabled builds only.
 */
export function SettingsPage() {
	return (
		<div className="mx-auto max-w-3xl space-y-6 px-3 pt-4">
			<Card>
				<CardHeader>
					<CardTitle>Settings</CardTitle>
					<CardDescription>
						Account and workspace preferences.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						Nothing to configure yet — this is a placeholder for
						future account-level settings.
					</p>
				</CardContent>
			</Card>
			{S0ProbePanel && (
				<Suspense fallback={<Skeleton className="h-48 w-full" />}>
					<S0ProbePanel />
				</Suspense>
			)}
			{MigrationPanel && (
				<Suspense fallback={<Skeleton className="h-48 w-full" />}>
					<MigrationPanel />
				</Suspense>
			)}
		</div>
	);
}

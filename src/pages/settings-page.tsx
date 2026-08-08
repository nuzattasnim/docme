import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

/**
 * Settings — landing page for `/settings`. Future home for theme
 * preferences (now handled via the topbar), notification settings,
 * API tokens, etc. For now it's a placeholder card so the route
 * resolves.
 */
export function SettingsPage() {
	return (
		<div className="mx-auto max-w-2xl space-y-4">
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
		</div>
	);
}

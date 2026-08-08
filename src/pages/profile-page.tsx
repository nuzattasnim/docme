import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AvatarUpload } from "@/features/profile/avatar-upload";

import { ProfileForm } from "@/features/profile/profile-form";
import { useMe } from "@/features/users/hooks";

/**
 * /profile — view and edit the signed-in user's profile, including avatar.
 *
 * Three sections, laid out as tabs:
 *   1. Profile — editable name / phone / language + avatar upload
 *   2. Account — read-only identity info (roles, permissions, MFA, login
 *      metadata) so the user can sanity-check what the system sees
 *   3. Activity — audit timeline (the `["iam","timeline"]` query)
 *
 * The avatar upload at the top is global (lives outside the tabs) so it
 * stays accessible no matter which section is active — updating the
 * avatar doesn't require switching tabs first.
 */
export function ProfilePage() {
	const { data: me, isLoading } = useMe();

	if (isLoading) {
		return <ProfilePageSkeleton />;
	}

	if (!me) {
		return (
			<div className="mx-auto max-w-2xl">
				<Card>
					<CardHeader>
						<CardTitle>Profile</CardTitle>
						<CardDescription>
							You&apos;re not signed in. Please sign in to view your profile.
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-2xl space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Profile picture</CardTitle>
					<CardDescription>
						Upload a new avatar. We&apos;ll resize and store it for you.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<AvatarUpload me={me} />
				</CardContent>
			</Card>

			<Tabs defaultValue="profile" className="w-full">
				<TabsList className="grid w-full grid-cols-2">
					<TabsTrigger value="profile">Profile</TabsTrigger>
					<TabsTrigger value="account">Account</TabsTrigger>
				</TabsList>

				<TabsContent value="profile" className="mt-4">
					<Card>
						<CardHeader>
							<CardTitle>Profile</CardTitle>
							<CardDescription>
								Update your name, phone number, and preferred language.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<ProfileForm me={me} />
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="account" className="mt-4">
					<Card>
						<CardHeader>
							<CardTitle>Account</CardTitle>
							<CardDescription>
								Read-only identity information from your session.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<dl className="grid gap-3 text-sm sm:grid-cols-2">
								<Field label="Email">{me.email ?? "—"}</Field>
								<Field label="User ID">
									<code className="font-mono text-xs">{me.itemId}</code>
								</Field>
								<Field label="Status">
									{me.active ? (
										<span className="text-emerald-600 dark:text-emerald-400">
											Active
										</span>
									) : (
										<span className="text-muted-foreground">Inactive</span>
									)}
								</Field>
								<Field label="Verified">
									{me.isVerified ? "Yes" : "No"}
								</Field>
								<Field label="MFA">
									{me.mfaEnabled ? "Enabled" : "Disabled"}
								</Field>
								<Field label="Login count">
									{me.logInCount ?? "—"}
								</Field>
								<Field label="Last login">
									{me.lastLoggedInTime
										? new Date(me.lastLoggedInTime).toLocaleString()
										: "—"}
								</Field>
								<Field label="Roles">
									<RoleList roles={me.roles} />
								</Field>
							</dl>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-0.5">
			<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</dt>
			<dd className="text-sm">{children}</dd>
		</div>
	);
}

function RoleList({ roles }: { roles?: string[] }) {
	if (!roles || roles.length === 0)
		return <span className="text-muted-foreground">—</span>;
	return (
		<div className="flex flex-wrap gap-1">
			{roles.map((r) => (
				<span
					key={r}
					className="rounded-md border bg-muted px-2 py-0.5 text-xs"
				>
					{r}
				</span>
			))}
		</div>
	);
}

function ProfilePageSkeleton() {
	return (
		<div className="mx-auto max-w-2xl space-y-4">
			<Card>
				<CardHeader>
					<Skeleton className="h-5 w-32" />
					<Skeleton className="h-4 w-64" />
				</CardHeader>
				<CardContent>
					<div className="flex items-center gap-4">
						<Skeleton className="h-20 w-20 rounded-full" />
						<div className="space-y-2">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-3 w-48" />
						</div>
					</div>
				</CardContent>
			</Card>
			<Skeleton className="h-64 w-full" />
		</div>
	);
}

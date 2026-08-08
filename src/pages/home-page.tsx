import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { logout } from "@/features/auth/logout";
import { FileText, LogOut, User as UserIcon } from "lucide-react";

export function HomePage() {
	const { data: user, isLoading } = useCurrentUser();

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>docme</CardTitle>
					<CardDescription>
						Documentation that ships with your code.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{isLoading ? (
						<p className="text-sm text-muted-foreground">
							Checking session…
						</p>
					) : user ? (
						<div className="space-y-4">
							<p className="flex items-center gap-2 text-sm">
								<UserIcon className="h-4 w-4 text-muted-foreground" />
								Signed in as{" "}
								<span className="font-medium">
									{user.firstName
										? `${user.firstName} ${user.lastName ?? ""}`.trim()
										: user.email}
								</span>
							</p>
							<div className="flex flex-wrap gap-2">
								<Button asChild>
									<Link to="/docs">
										<FileText /> Docs
									</Link>
								</Button>
								<Button asChild variant="outline">
									<Link to="/profile">View profile</Link>
								</Button>
								<Button
									variant="ghost"
									onClick={() => logout()}
								>
									<LogOut /> Sign out
								</Button>
							</div>
						</div>
					) : (
						<div className="space-y-4">
							<p className="text-sm text-muted-foreground">
								You are not signed in.
							</p>
							<Button asChild>
								<Link to="/login">Sign in</Link>
							</Button>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

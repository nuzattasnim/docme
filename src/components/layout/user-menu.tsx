import { Link } from "react-router-dom";
import { LogOut, User as UserIcon, Settings } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMe } from "@/features/users/hooks";
import { logout } from "@/features/auth/logout";

/**
 * User menu — avatar + dropdown with profile / settings / sign out.
 * Falls back to a "Sign in" button if there's no current user.
 */
export function UserMenu() {
	const { data: user, isLoading } = useMe();

	if (isLoading) {
		return <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />;
	}

	if (!user) {
		return (
			<Button asChild size="sm">
				<Link to="/login">Sign in</Link>
			</Button>
		);
	}

	const display = user.firstName
		? `${user.firstName} ${user.lastName ?? ""}`.trim()
		: (user.email ?? "?");

	const initials = (
		user.firstName?.[0] ??
		user.lastName?.[0] ??
		user.email?.[0] ??
		"?"
	).toUpperCase();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="h-8 w-8 rounded-full p-0"
					aria-label="Open user menu"
				>
					<Avatar className="h-8 w-8">
						{user.profileImageUrl ? (
							<AvatarImage
								src={user.profileImageUrl}
								alt={display}
								referrerPolicy="no-referrer"
							/>
						) : null}
						<AvatarFallback>{initials}</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel className="font-normal">
					<div className="flex flex-col space-y-1">
						<p className="text-sm font-medium leading-none">
							{display}
						</p>
						{user.email && (
							<p className="text-xs leading-none text-muted-foreground">
								{user.email}
							</p>
						)}
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link to="/profile" className="cursor-pointer">
						<UserIcon className="mr-2 h-4 w-4" />
						Profile
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<Link to="/settings" className="cursor-pointer">
						<Settings className="mr-2 h-4 w-4" />
						Settings
					</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={() => {
						void logout();
					}}
					className="cursor-pointer text-destructive focus:text-destructive"
				>
					<LogOut className="mr-2 h-4 w-4" />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

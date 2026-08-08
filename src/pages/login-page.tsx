import { LoginButton } from "@/features/auth/login-button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export function LoginPage() {
	return (
		<main className="container flex min-h-screen items-center justify-center">
			<Card className="w-full max-w-sm">
				<CardHeader className="space-y-2 text-center">
					<CardTitle>Welcome to docme</CardTitle>
					<CardDescription>
						Sign in with your Blocks account to continue.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex justify-center">
					<LoginButton />
				</CardContent>
			</Card>
		</main>
	);
}

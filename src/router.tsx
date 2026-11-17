import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { HomePage } from "@/pages/home-page";
import { LoginPage } from "@/pages/login-page";
import { CallbackPage } from "@/features/auth/callback-page";import { ProfilePage } from "@/pages/profile-page";
import { SettingsPage } from "@/pages/settings-page";
import { DocsListPage } from "@/features/docs/docs-list-page";
import { DocDetailPage } from "@/features/docs/doc-detail-page";

export const router = createBrowserRouter([
	// Public routes — no app shell, no auth gate.
	{ path: "/login", element: <LoginPage /> },
	// OIDC redirect URI (SDK default; registered on the OIDC client for every
	// origin). /callback is kept for the older clients registered with it.
	{ path: "/login/callback", element: <CallbackPage /> },
	{ path: "/callback", element: <CallbackPage /> },
	// Invitation activation, password reset and signup are Blocks-hosted
	// (iam.seliseblocks.com) because OIDC is enabled — no routes needed here.

	// Authenticated routes — wrapped in <AppShell> which gates on
	// /iam/v4/iam/me and renders the persistent sidebar + topbar.
	{
		element: <AppShell />,
		children: [
			{ path: "/", element: <HomePage /> },
			{ path: "/profile", element: <ProfilePage /> },
			{ path: "/settings", element: <SettingsPage /> },
			// Data-gateway CRUD surfaces.
			{ path: "/docs", element: <DocsListPage /> },
			{ path: "/docs/:docId", element: <DocDetailPage /> },
		],
	},
]);

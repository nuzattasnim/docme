import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { App } from "./App";
import "./index.css";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: { retry: 1, refetchOnWindowFocus: false },
	},
});

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<ThemeProvider defaultTheme="light">
			<QueryClientProvider client={queryClient}>
				<App />
				<Toaster
					position="bottom-right"
					richColors
					closeButton
					toastOptions={{
						classNames: {
							toast: "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
							description: "group-[.toast]:text-muted-foreground",
							actionButton:
								"group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
							cancelButton:
								"group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
						},
					}}
				/>
			</QueryClientProvider>
		</ThemeProvider>
	</StrictMode>,
);

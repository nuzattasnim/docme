import { Link, useLocation, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { useRecentDocs } from "@/features/docs/recent-docs";
import { cn } from "@/lib/utils";

interface Crumb {
	label: string;
	to?: string;
}

/**
 * Breadcrumbs — derives the trail from the current pathname. Hard-coded
 * routes for now (Home / Docs / Doc / Page / Settings); dynamic params
 * (`:docId`, `:pageId`) resolve against the cache + a hook into the
 * recent-docs store so we can show the doc/page name without an extra
 * network fetch.
 */
export function Breadcrumbs({ className }: { className?: string }) {
	const location = useLocation();
	const params = useParams();
	const recents = useRecentDocs((s) => s.recents);

	const crumbs = buildCrumbs(location.pathname, params, recents);

	if (crumbs.length === 0) return null;

	return (
		<nav
			aria-label="Breadcrumb"
			className={cn("flex items-center text-sm", className)}
		>
			<ol className="flex items-center gap-1">
				{crumbs.map((c, i) => {
					const isLast = i === crumbs.length - 1;
					return (
						<li
							key={`${c.label}-${i}`}
							className="flex items-center gap-1"
						>
							{c.to && !isLast ? (
								<Link
									to={c.to}
									className="rounded px-1 text-muted-foreground hover:text-foreground"
								>
									{c.label}
								</Link>
							) : (
								<span
									className={cn(
										"px-1",
										isLast
											? "font-medium text-foreground"
											: "text-muted-foreground",
									)}
									aria-current={isLast ? "page" : undefined}
								>
									{c.label}
								</span>
							)}
							{!isLast && (
								<ChevronRight
									className="h-4 w-4 text-muted-foreground/60"
									aria-hidden="true"
								/>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}

function buildCrumbs(
	pathname: string,
	params: Record<string, string | undefined>,
	recents: Array<{ itemId: string; name: string }>,
): Crumb[] {
	// Trim trailing slash for matching.
	const path = pathname.replace(/\/+$/, "") || "/";

	if (path === "/") {
		return [{ label: "Home" }];
	}

	if (path === "/profile") {
		return [{ label: "Home", to: "/" }, { label: "Profile" }];
	}

	if (path === "/settings") {
		return [{ label: "Home", to: "/" }, { label: "Settings" }];
	}

	if (path === "/docs") {
		return [{ label: "Home", to: "/" }, { label: "Docs" }];
	}

	if (path.startsWith("/docs/")) {
		const docId = params.docId;
		const docName = recents.find((r) => r.itemId === docId)?.name ?? "Doc";
		if (path.startsWith("/docs/") && path.split("/").length === 3) {
			// /docs/:docId (overview) — DocName is the leaf.
			return [
				{ label: "Home", to: "/" },
				{ label: "Docs", to: "/docs" },
				{ label: docName },
			];
		}
		if (path.startsWith("/docs/") && path.split("/").length >= 5) {
			// /docs/:docId/pages/:pageId — show page title from search params later.
			const pageId = params.pageId;
			return [
				{ label: "Home", to: "/" },
				{ label: "Docs", to: "/docs" },
				{ label: docName, to: `/docs/${docId}` },
				{ label: `Page ${pageId?.slice(0, 4) ?? "…"}` },
			];
		}
	}

	return [];
}

/**
 * Helper for the DocDetailPage — call this on mount with the loaded Doc
 * so the sidebar's "Recent" list can show its name.
 */
export function useRecordRecentDoc(
	itemId: string | undefined,
	name: string | undefined,
) {
	const record = useRecentDocs((s) => s.record);
	useEffect(() => {
		if (itemId && name) record(itemId, name);
	}, [itemId, name, record]);
}

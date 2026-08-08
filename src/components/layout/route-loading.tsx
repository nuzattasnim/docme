import { Skeleton } from "@/components/ui/skeleton";

/**
 * Generic route-loading fallback. Use as the `element` of a route while
 * data is hydrating, or wrap a section that needs a skeleton.
 */
export function RouteLoading() {
	return (
		<div className="space-y-4 p-6">
			<Skeleton className="h-8 w-1/3" />
			<Skeleton className="h-4 w-2/3" />
			<div className="space-y-3 pt-4">
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-24 w-full" />
			</div>
		</div>
	);
}

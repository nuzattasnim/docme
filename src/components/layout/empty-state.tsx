import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * EmptyState — single reusable block for "nothing here yet" screens.
 *
 *   <EmptyState
 *     icon={<FileText className="h-10 w-10" />}
 *     title="No docs yet"
 *     description="Create your first documentation set to get started."
 *     action={<Button onClick={...}><Plus /> New doc</Button>}
 *   />
 */
export interface EmptyStateProps {
	icon?: React.ReactNode;
	title: string;
	description?: string;
	action?: React.ReactNode;
	className?: string;
}

export function EmptyState({
	icon,
	title,
	description,
	action,
	className,
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 py-12 text-center",
				className,
			)}
		>
			{icon && (
				<div className="mb-4 rounded-full bg-muted p-3 text-muted-foreground">
					{icon}
				</div>
			)}
			<h3 className="text-base font-semibold text-foreground">{title}</h3>
			{description && (
				<p className="mt-1 max-w-sm text-sm text-muted-foreground">
					{description}
				</p>
			)}
			{action && <div className="mt-6">{action}</div>}
		</div>
	);
}

/**
 * Convenience: a button that pairs with the EmptyState when you want the
 * standard "primary CTA" shape.
 */
export function EmptyStateAction(props: React.ComponentProps<typeof Button>) {
	return <Button {...props} />;
}

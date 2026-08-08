import { StatusBadge } from "@/components/layout/status-badge";

export interface VersionStatusBadgesProps {
	isPublished?: boolean | null;
	isActive?: boolean | null;
	onTogglePublished?: () => void;
	onToggleActive?: () => void;
	disabled?: boolean;
}

/**
 * Published / Active toggles rendered as clickable status pills. Click to
 * flip the boolean — the underlying mutation invalidates the version
 * query and the badge re-renders with the new state.
 *
 * Read-only when no toggle handlers are supplied (e.g. on the public
 * reader view).
 */
export function VersionStatusBadges({
	isPublished,
	isActive,
	onTogglePublished,
	onToggleActive,
	disabled,
}: VersionStatusBadgesProps) {
	const Interactive = Boolean(onTogglePublished && onToggleActive);

	return (
		<div className="flex flex-wrap gap-2">
			{Interactive ? (
				<>
					<button
						type="button"
						onClick={onTogglePublished}
						disabled={disabled}
						className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
						aria-label={`Toggle publish — currently ${isPublished ? "published" : "draft"}`}
					>
						<StatusBadge
							status={isPublished ? "published" : "draft"}
						/>
					</button>
					<button
						type="button"
						onClick={onToggleActive}
						disabled={disabled}
						className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
						aria-label={`Toggle active — currently ${isActive ? "active" : "inactive"}`}
					>
						<StatusBadge
							status={isActive ? "active" : "inactive"}
						/>
					</button>
				</>
			) : (
				<>
					<StatusBadge status={isPublished ? "published" : "draft"} />
					<StatusBadge status={isActive ? "active" : "inactive"} />
				</>
			)}
		</div>
	);
}

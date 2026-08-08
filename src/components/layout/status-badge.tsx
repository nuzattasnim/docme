import { Badge, type BadgeProps } from "@/components/ui/badge";

/**
 * StatusBadge — typed wrapper around `<Badge>` for the DocVersion
 * published / active states. Centralizes the color palette so every
 * "is this published?" pill across the app looks the same.
 *
 *   <StatusBadge status="published" />
 *   <StatusBadge status="draft" />
 *   <StatusBadge status="active" />
 *   <StatusBadge status="inactive" />
 */
export type StatusBadgeStatus = "published" | "draft" | "active" | "inactive";

export interface StatusBadgeProps extends Omit<BadgeProps, "variant"> {
	status: StatusBadgeStatus;
}

const LABEL: Record<StatusBadgeStatus, string> = {
	published: "Published",
	draft: "Draft",
	active: "Active",
	inactive: "Inactive",
};

export function StatusBadge({ status, ...props }: StatusBadgeProps) {
	return (
		<Badge variant={status} {...props}>
			{LABEL[status]}
		</Badge>
	);
}

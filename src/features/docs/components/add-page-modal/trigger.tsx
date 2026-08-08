import {
	cloneElement,
	isValidElement,
	type ReactElement,
	type ReactNode,
} from "react";
import { useAddPageModal } from "./context";

/**
 * Trigger for the AddPageModal — wraps any clickable element so that
 * clicking it opens the modal. The wrapped element must accept an
 * `onClick` prop (e.g. `<Button>`).
 */
export interface AddPageModalTriggerProps {
	children: ReactNode;
}

export function AddPageModalTrigger({ children }: AddPageModalTriggerProps) {
	const { setOpen } = useAddPageModal();

	if (!isValidElement(children)) {
		throw new Error(
			"<AddPageModalTrigger> requires a single React element child.",
		);
	}

	const child = children as ReactElement<{
		onClick?: (e: React.MouseEvent) => void;
	}>;
	const original = child.props.onClick;

	return cloneElement(child, {
		onClick: (e: React.MouseEvent) => {
			original?.(e);
			setOpen(true);
		},
	});
}

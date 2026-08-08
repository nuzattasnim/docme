import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { useReorderPagesModal } from "./context";

export interface ReorderPagesModalTriggerProps {
  children: ReactNode;
}

export function ReorderPagesModalTrigger({
  children,
}: ReorderPagesModalTriggerProps) {
  const { setOpen } = useReorderPagesModal();

  if (!isValidElement(children)) {
    throw new Error(
      "<ReorderPagesModalTrigger> requires a single React element child.",
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

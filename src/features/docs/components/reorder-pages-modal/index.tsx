import type { ReactNode } from "react";
import { ReorderPagesModalProvider } from "./context";
import { ReorderPagesModalRoot } from "./root";
import { ReorderPagesModalTrigger } from "./trigger";

function ReorderPagesModalProviderWrap({ children }: { children: ReactNode }) {
  return <ReorderPagesModalProvider>{children}</ReorderPagesModalProvider>;
}

export const ReorderPagesModal = {
  Provider: ReorderPagesModalProviderWrap,
  Trigger: ReorderPagesModalTrigger,
  Root: ReorderPagesModalRoot,
};

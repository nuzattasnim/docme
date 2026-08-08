import type { ReactNode } from "react";
import { AddPageModalProvider } from "./context";
import { AddPageModalRoot } from "./root";
import { AddPageModalTrigger } from "./trigger";

/**
 * Compound `<AddPageModal>` — `<AddPageModal.Provider>` wraps the page
 * sidebar (or wherever the trigger + root should live), and the trigger
 * + root can be placed anywhere inside it.
 *
 *   <AddPageModal.Provider>
 *     <AddPageModal.Trigger>
 *       <Button>+ Add Page</Button>
 *     </AddPageModal.Trigger>
 *     <AddPageModal.Root version={version} onPageAdded={...} />
 *   </AddPageModal.Provider>
 */
function AddPageModalProviderWrap({ children }: { children: ReactNode }) {
	return <AddPageModalProvider>{children}</AddPageModalProvider>;
}

export const AddPageModal = {
	Provider: AddPageModalProviderWrap,
	Trigger: AddPageModalTrigger,
	Root: AddPageModalRoot,
};

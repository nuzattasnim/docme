import { createContext, useContext, useState, type ReactNode } from "react";

interface AddPageModalContextValue {
	open: boolean;
	setOpen: (open: boolean) => void;
}

const AddPageModalContext = createContext<AddPageModalContextValue | null>(
	null,
);

export function AddPageModalProvider({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);
	return (
		<AddPageModalContext.Provider value={{ open, setOpen }}>
			{children}
		</AddPageModalContext.Provider>
	);
}

export function useAddPageModal() {
	const ctx = useContext(AddPageModalContext);
	if (!ctx)
		throw new Error(
			"useAddPageModal must be used inside <AddPageModalProvider>",
		);
	return ctx;
}

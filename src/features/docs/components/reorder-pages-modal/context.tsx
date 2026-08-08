import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface ReorderPagesModalContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const ReorderPagesModalContext =
  createContext<ReorderPagesModalContextValue | null>(null);

export function ReorderPagesModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <ReorderPagesModalContext.Provider value={{ open, setOpen }}>
      {children}
    </ReorderPagesModalContext.Provider>
  );
}

export function useReorderPagesModal() {
  const ctx = useContext(ReorderPagesModalContext);
  if (!ctx)
    throw new Error(
      "useReorderPagesModal must be used inside <ReorderPagesModalProvider>",
    );
  return ctx;
}

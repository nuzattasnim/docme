import { ShieldAlert, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { usePermissionErrors } from "./permission-errors";

/** Page-level Alert for a refused write (SPEC2 C14). Dismissible, never retries. */
export function PermissionErrorAlert() {
  const message = usePermissionErrors((s) => s.message);
  const dismiss = usePermissionErrors((s) => s.dismiss);
  if (!message) return null;
  return (
    <div className="shrink-0 px-3 pt-3">
      <Alert variant="destructive" className="relative pr-10">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Not allowed</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 h-7 w-7"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </Alert>
    </div>
  );
}

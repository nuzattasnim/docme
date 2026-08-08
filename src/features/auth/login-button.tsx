import { useState } from "react";
import { Button } from "@/components/ui/button";
import { startLogin } from "./sso";

export function LoginButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        disabled={pending}
        onClick={async () => {
          setError(null);
          setPending(true);
          try {
            await startLogin();
          } catch (e) {
            setPending(false);
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        {pending ? "Redirecting…" : "Sign in"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

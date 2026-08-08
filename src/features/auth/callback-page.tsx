import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { finishLogin } from "./sso";
import { useAuthStore } from "./auth-store";

/**
 * Mounted at /callback (the OIDC redirect URI). Calls /iam/v4/idp/callback to
 * finalize the session cookie, then hydrates the auth store and routes home.
 */
export function CallbackPage() {
  const navigate = useNavigate();
  const setStatus = useAuthStore((s) => s.setStatus);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false); // guard against React 18/19 double-effect

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    setStatus("loading");

    finishLogin(window.location.search)
      .then(() => navigate("/", { replace: true }))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [navigate, setStatus]);

  return (
    <main className="container flex min-h-screen items-center justify-center">
      <div className="text-center">
        {error ? (
          <p className="text-destructive">Login failed: {error}</p>
        ) : (
          <p className="text-muted-foreground">Signing you in…</p>
        )}
      </div>
    </main>
  );
}

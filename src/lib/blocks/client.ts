import { createBlocksClient, type BlocksClient } from "@seliseblocks/client";

/**
 * The single `@seliseblocks/client` instance for this app.
 *
 * Created lazily so a missing env var only breaks the screen that needs the
 * client (with a clear message) instead of crashing the whole bundle at import.
 *
 * The SDK sends `x-blocks-key` and `credentials: "include"` on every call, so
 * the hosted-login session cookie rides along automatically. It never stores
 * tokens itself.
 */
let client: BlocksClient | null = null;

export function getBlocksClient(): BlocksClient {
	if (client) return client;

	const apiUrl = import.meta.env.VITE_BLOCKS_API_URL;
	const xBlocksKey = import.meta.env.VITE_BLOCKS_PROJECT_KEY;
	const clientId = import.meta.env.VITE_BLOCKS_OIDC_CLIENT_ID;
	if (!apiUrl) throw new Error("VITE_BLOCKS_API_URL is not set");
	if (!xBlocksKey) throw new Error("VITE_BLOCKS_PROJECT_KEY is not set");

	client = createBlocksClient({
		apiUrl,
		xBlocksKey,
		oidc: clientId
			? {
					clientId,
					url: import.meta.env.VITE_BLOCKS_OIDC_URL || "https://iam.seliseblocks.com",
					// Unset → the SDK uses `${window.location.origin}/login/callback`,
					// so one build works on the dev origin and every deployed origin.
					redirectUri: import.meta.env.VITE_BLOCKS_REDIRECT_URI || undefined,
					scope: "openid profile",
				}
			: undefined,
	});
	return client;
}

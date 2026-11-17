import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";

// Local dev: HTTPS on the project's real domain so the Blocks SSO session
// cookie (Secure + domain-scoped) is accepted by the browser. See the
// blocks-frontend-local-https skill and README "One-time setup".
//
// The cert is optional: Blocks Release builds in Docker without one, and
// `vite build` never needs it. Without a cert the dev server falls back to
// plain HTTP, where hosted login can't keep its cookie.

const CERT_DIR = path.resolve(process.cwd(), ".cert");
const KEY = path.join(CERT_DIR, "dev-key.pem");
const CERT = path.join(CERT_DIR, "dev-cert.pem");

export default defineConfig(({ command, mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const devDomain = env.VITE_DEV_DOMAIN || "dmqhre.slsblx.com";
	const devPort = Number(env.VITE_DEV_PORT || 5173);
	const hasCert = fs.existsSync(KEY) && fs.existsSync(CERT);

	if (command === "serve" && !hasCert) {
		console.warn(
			`[vite] No dev cert at ${CERT_DIR} — serving plain HTTP; hosted login will not work.\n` +
				"      Run: npm run cert   (see README.md)",
		);
	}

	return {
		plugins: [react()],
		resolve: {
			alias: { "@": path.resolve(process.cwd(), "src") },
		},
		server: {
			host: devDomain,
			port: devPort,
			// The port is part of the registered OIDC redirect URI — never auto-change it.
			strictPort: true,
			https: hasCert
				? { key: fs.readFileSync(KEY), cert: fs.readFileSync(CERT) }
				: undefined,
			allowedHosts: [devDomain],
		},
	};
});

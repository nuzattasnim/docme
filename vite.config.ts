import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";

// HTTPS dev server on the project's real domain so the Blocks SSO session cookie
// (Secure + domain-scoped) is accepted by the browser.
// See ../blocks-skills/skills/blocks-frontend-local-https/SKILL.md

const DEV_DOMAIN = process.env.VITE_DEV_DOMAIN ?? "dmqhre.slsblx.com";
const DEV_PORT = Number(process.env.VITE_DEV_PORT ?? 5173);
const CERT_DIR = path.resolve(process.cwd(), ".cert");
const KEY = path.join(CERT_DIR, "dev-key.pem");
const CERT = path.join(CERT_DIR, "dev-cert.pem");

if (!fs.existsSync(KEY) || !fs.existsSync(CERT)) {
  console.warn(
    `[vite] Missing ${KEY} or ${CERT}.\n` +
      `      Generate a self-signed cert with openssl (see README.md step 2)\n` +
      `      and add ${DEV_DOMAIN} to your hosts file pointing at 127.0.0.1.`
  );
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "src") },
  },
  server: {
    host: DEV_DOMAIN,
    port: DEV_PORT,
    strictPort: true,
    https: { key: fs.readFileSync(KEY), cert: fs.readFileSync(CERT) },
    allowedHosts: [DEV_DOMAIN],
  },
});

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BLOCKS_API_URL: string;
  readonly VITE_BLOCKS_PROJECT_KEY: string;
  readonly VITE_BLOCKS_OIDC_CLIENT_ID: string;
  /** Optional. Defaults to `${window.location.origin}/login/callback`. */
  readonly VITE_BLOCKS_REDIRECT_URI?: string;
  /** Optional. Defaults to https://iam.seliseblocks.com. */
  readonly VITE_BLOCKS_OIDC_URL?: string;
  readonly VITE_DEV_DOMAIN: string;
  readonly VITE_DEV_PORT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

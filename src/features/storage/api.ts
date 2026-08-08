/**
 * Frontend client for the Blocks DMS file storage surface.
 *
 * Per the `blocks-data-storage` skill:
 *   - Upload is two steps: presign (`POST /Files/GetPreSignedUrlForUpload`)
 *     → raw PUT to the returned `uploadUrl`.
 *   - There is NO `/Files/UploadFile` — presign + PUT is the entire upload.
 *   - `/Files/*` paths and query params are PascalCase
 *     (`FileId`, `ConfigurationName`).
 *   - Files responses are FLAT — no `{ isSuccess, data, errors[] }` envelope.
 *     `errors` is `Record<string,string>`.
 *   - Browser/runtime calls send `x-blocks-key` (PTENANT) + the session
 *     cookie via `credentials: "include"`.
 *   - On 401: refresh once via the auth store and retry.
 */

const API = import.meta.env.VITE_BLOCKS_API_URL as string;
const KEY = import.meta.env.VITE_BLOCKS_PROJECT_KEY as string;

const DATA = `${API}/data/v4`;

/** Response shape from `POST /Files/GetPreSignedUrlForUpload`. */
export interface PresignResponse {
  uploadUrl?: string;
  fileId?: string;
  url?: string;
  name?: string;
  /** Flat `Record<string,string>` per the skill — not an array. */
  errors?: Record<string, string>;
}

/** Single file record returned from `GET /Files/GetFile`. */
export interface FileRecord {
  fileId?: string;
  name?: string;
  url?: string;
  sizeInBytes?: number;
  currentVersion?: number;
  errors?: Record<string, string>;
}

/** Options for a presign request. */
export interface PresignOptions {
  name: string;
  accessModifier?: "Public" | "Private";
  configurationName?: string;
  parentDirectoryId?: string;
  tags?: string;
  metaData?: string;
  /**
   * Project-specific module id. The skill recommends `3` but the working
   * presign on this project uses `5`. Keep this overrideable so other
   * projects (or future server changes) can pass their own value.
   */
  moduleName?: number;
}

class FilesError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Files ${status}: ${body || "(empty)"}`);
    this.name = "FilesError";
  }
}

/**
 * Wrapper for the DMS REST surface.
 * - Adds `x-blocks-key` and `Content-Type: application/json` automatically.
 * - 401 → refresh-once via the auth store, retry once.
 */
async function filesApi<T>(
  path: string,
  init: RequestInit = {},
  refreshOnce?: () => Promise<void>,
): Promise<T> {
  const res = await fetch(`${DATA}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "x-blocks-key": KEY,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401 && refreshOnce) {
    try {
      await refreshOnce();
    } catch {
      throw new FilesError(401, "refresh failed");
    }
    const retried = await fetch(`${DATA}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "x-blocks-key": KEY,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (!retried.ok) {
      throw new FilesError(retried.status, await retried.text().catch(() => ""));
    }
    return (await retried.json()) as T;
  }

  if (!res.ok) {
    throw new FilesError(res.status, await res.text().catch(() => ""));
  }
  return (await res.json()) as T;
}

export const files = {
  /**
   * Step 1 of upload — get a pre-signed PUT URL and the resulting `fileId`.
   *
   * `moduleName` MUST be an int. The skill recommends 3, but on this
   * project only `5` is accepted (others return 403). `parentDirectoryId`
   * MUST be a string (use "" for root, never null).
   */
  presign: (opts: PresignOptions, refreshOnce?: () => Promise<void>) =>
    filesApi<PresignResponse>(
      `/Files/GetPreSignedUrlForUpload`,
      {
        method: "POST",
        body: JSON.stringify({
          projectKey: KEY,
          accessModifier: opts.accessModifier ?? "Public",
          configurationName: opts.configurationName ?? "Default",
          // moduleName is project-specific. The skill recommends 3, but the
          // working presign on this project uses 5 — using 3 returns 403.
          moduleName: opts.moduleName ?? 5,
          parentDirectoryId: opts.parentDirectoryId ?? "",
          tags: opts.tags ?? "",
          // metaData must be a string. Send empty string (matches the
          // working curl) instead of "{}" to avoid the project rejecting it.
          metaData: opts.metaData ?? "",
          name: opts.name,
        }),
      },
      refreshOnce,
    ),

  /**
   * Read a file by id — returns the download URL.
   * PascalCase query params per the skill.
   */
  get: (fileId: string, configurationName = "Default", refreshOnce?: () => Promise<void>) =>
    filesApi<FileRecord>(
      `/Files/GetFile?FileId=${encodeURIComponent(fileId)}&ConfigurationName=${encodeURIComponent(configurationName)}`,
      {},
      refreshOnce,
    ),

  /** Delete a file by id. */
  del: (fileId: string, refreshOnce?: () => Promise<void>) =>
    filesApi<{ isSuccess?: boolean; errors?: Record<string, string> }>(
      `/Files/DeleteFile`,
      {
        method: "POST",
        body: JSON.stringify({ fileId, projectKey: KEY }),
      },
      refreshOnce,
    ),
};

/** Azure Blob URLs look like `https://<account>.blob.core.windows.net/...`. */
function isAzureBlob(uploadUrl: string): boolean {
  return /\.blob\.core\.windows\.net/i.test(uploadUrl);
}

/**
 * Step 2 of upload — PUT the raw bytes to the pre-signed URL.
 *
 * - The URL is pre-authorized; no Bearer token needed.
 * - Azure requires `x-ms-blob-type: BlockBlob` or the PUT fails.
 * - We still send `x-blocks-key` — Azure ignores unknown headers, S3 too.
 */
export async function putToPresignedUrl(
  uploadUrl: string,
  file: File,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": file.type || "application/octet-stream",
  };
  if (isAzureBlob(uploadUrl)) {
    headers["x-ms-blob-type"] = "BlockBlob";
  }
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers,
    body: file, // raw bytes
  });
  if (!res.ok) {
    throw new Error(`Storage PUT failed: ${res.status}`);
  }
}

export { FilesError, isAzureBlob };

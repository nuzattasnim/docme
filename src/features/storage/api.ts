/**
 * Blocks Data file storage through the `@seliseblocks/client` SDK
 * (`blocks-data-storage` skill). Upload is two steps: presign
 * (`data.files.presignedUploadUrl`) → PUT the bytes to the returned URL
 * (`data.files.uploadToUrl`, which sends no Blocks credentials to the storage
 * provider). Every Blocks call uses the shared one-refresh-then-retry policy.
 */
import { getBlocksClient } from "@/lib/blocks/client";
import { withSession } from "@/features/auth/session";

/** Response shape from `data.files.presignedUploadUrl`. */
export interface PresignResponse {
  uploadUrl?: string;
  fileId?: string;
  url?: string;
  name?: string;
  /** Flat `Record<string,string>` per the skill — not an array. */
  errors?: Record<string, string>;
}

/** Single file record returned from `data.files.get`. */
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

export const files = {
  /**
   * Step 1 of upload — a pre-signed PUT URL plus the resulting `fileId`.
   * `moduleName` is project-specific: this project accepts 5 (3 returns 403).
   * `parentDirectoryId` must be a string ("" for root, never null).
   */
  presign: (opts: PresignOptions) =>
    withSession(() =>
      getBlocksClient().data.files.presignedUploadUrl({
        name: opts.name,
        accessModifier: opts.accessModifier ?? "Public",
        configurationName: opts.configurationName ?? "Default",
        moduleName: opts.moduleName ?? 5,
        parentDirectoryId: opts.parentDirectoryId ?? "",
        tags: opts.tags ?? "",
        metaData: opts.metaData ?? "",
      }),
    ) as Promise<PresignResponse>,

  /** Read a file by id — returns the download URL. */
  get: (fileId: string, configurationName = "Default") =>
    withSession(() =>
      getBlocksClient().data.files.get(fileId, { configurationName }),
    ) as Promise<FileRecord>,

  /** Move a file to trash (`permanent: false`, recoverable). */
  del: (fileId: string) =>
    withSession(() =>
      getBlocksClient().data.files.delete({ fileId, permanent: false }),
    ) as Promise<{ isSuccess?: boolean; errors?: Record<string, string> }>,
};

/**
 * Step 2 of upload — PUT the raw bytes to the pre-signed URL. The SDK adds
 * `x-ms-blob-type: BlockBlob` (required by Azure, ignored by S3) and sends
 * no Blocks credentials to the third-party URL.
 */
export async function putToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  await getBlocksClient().data.files.uploadToUrl({
    url: uploadUrl,
    body: file,
    contentType: file.type || "application/octet-stream",
  });
}

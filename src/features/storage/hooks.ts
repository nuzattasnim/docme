import { useMutation } from "@tanstack/react-query";
import { files, putToPresignedUrl, type FileRecord } from "./api";

/**
 * Upload a file to the Blocks DMS and return the resulting `FileRecord`
 * (which carries both `fileId` and the read `url`).
 *
 * Two steps:
 *   1. `data.files.presignedUploadUrl` → `{ uploadUrl, fileId }`
 *   2. `data.files.uploadToUrl` PUTs the raw bytes
 *
 * After step 2 we call `data.files.get` to confirm and to
 * pull the canonical download URL.
 *
 * Per the skill there is NO `/Files/UploadFile` — presign + PUT is the
 * whole upload.
 */
export function useUploadFile(opts?: { configurationName?: string }) {
  return useMutation({
    mutationFn: async (file: File): Promise<FileRecord> => {
      const presign = await files.presign(
        {
          name: file.name,
          configurationName: opts?.configurationName ?? "Default",
        }
      );
      if (!presign.uploadUrl || !presign.fileId) {
        if (presign.errors) {
          throw new Error(
            Object.entries(presign.errors)
              .map(([k, v]) => `${k}: ${v}`)
              .join("; "),
          );
        }
        throw new Error("Presign did not return uploadUrl / fileId");
      }

      await putToPresignedUrl(presign.uploadUrl, file);

      // Confirm via GetFile — also gives us the canonical download URL.
      const record = await files.get(
        presign.fileId,
        opts?.configurationName ?? "Default"
      );
      return { ...record, fileId: presign.fileId };
    },
  });
}

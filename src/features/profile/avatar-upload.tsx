import { useRef, useState, type ChangeEvent } from "react";
import { Camera } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useUploadFile } from "@/features/storage/hooks";
import { useUpdateMyProfile } from "@/features/users/hooks";
import type { Me } from "@/features/users/api";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function initialsFor(me: Me | null): string {
  if (!me) return "?";
  const f = me.firstName?.[0];
  const l = me.lastName?.[0];
  const e = me.email?.[0];
  return ((f ?? l ?? e ?? "?").toString() || "?").toUpperCase();
}

function displayNameFor(me: Me | null): string {
  if (!me) return "Profile";
  if (me.firstName) return `${me.firstName}${me.lastName ? ` ${me.lastName}` : ""}`;
  return me.email ?? "Profile";
}

export interface AvatarUploadProps {
  /** Current "me" payload — used for the image src and the fallback initials. */
  me: Me | null;
  /** Called after a successful upload + profile patch with the new src. */
  onUpdated?: (next: { url?: string; fileId?: string }) => void;
}

/**
 * Click-to-upload avatar tile.
 *
 * Flow:
 *   1. Pick a file → upload via the storage feature (presign + PUT + GetFile).
 *   2. Patch the user's profile with the new `profileImageUrl` + `profileImageId`
 *      via `PATCH /iam/me`.
 *   3. The `["iam","me"]` query is invalidated by `useUpdateMyProfile`, so the
 *      new avatar appears everywhere the user is referenced.
 *
 * Errors surface as a small red line under the tile — kept tight on purpose
 * so the edit form below stays the visual focus.
 */
export function AvatarUpload({ me, onUpdated }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useUploadFile();
  const patch = useUpdateMyProfile();

  const currentSrc = previewUrl ?? me?.profileImageUrl ?? undefined;

  function clearPreview() {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (PNG, JPG, GIF, WEBP).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image is larger than 5 MB. Please pick a smaller file.");
      return;
    }

    // Show a local preview immediately while the upload runs.
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    try {
      const rec = await upload.mutateAsync(file);
      if (!rec.fileId) throw new Error("Upload succeeded but no fileId was returned.");
      await patch.mutateAsync({
        profileImageUrl: rec.url,
        profileImageId: rec.fileId,
      });
      onUpdated?.({ url: rec.url, fileId: rec.fileId });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Upload or profile update failed.",
      );
    } finally {
      clearPreview();
    }
  }

  const busy = upload.isPending || patch.isPending;

  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
      <div className="relative">
        <Avatar className="h-20 w-20 ring-1 ring-border">
          {currentSrc ? (
            <AvatarImage
              src={currentSrc}
              alt={displayNameFor(me)}
              referrerPolicy="no-referrer"
            />
          ) : null}
          <AvatarFallback className="text-lg">
            {initialsFor(me)}
          </AvatarFallback>
        </Avatar>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full shadow"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          aria-label="Change profile picture"
        >
          <Camera className="h-3.5 w-3.5" />
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPick}
          aria-hidden
        />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{displayNameFor(me)}</p>
        {me?.email && (
          <p className="text-xs text-muted-foreground">{me.email}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {upload.isPending
            ? "Uploading…"
            : patch.isPending
              ? "Saving…"
              : "PNG, JPG, GIF, or WEBP up to 5 MB."}
        </p>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

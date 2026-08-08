import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateMyProfile } from "@/features/users/hooks";
import type { Me, ProfileUpdate } from "@/features/users/api";

export interface ProfileFormProps {
  me: Me;
  /** Called after a successful save with the patch that was applied. */
  onSaved?: (patch: ProfileUpdate) => void;
}

/**
 * Editable profile form.
 *
 * Re-seeds the drafts when `me.itemId` changes (so navigating between
 * profiles / re-logging in resets the field state).
 *
 * Mirrors the dirty-state pattern used by `<DocForm>`: only sends fields
 * that actually changed. PATCH /iam/me accepts a partial body.
 */
export function ProfileForm({ me, onSaved }: ProfileFormProps) {
  const [firstName, setFirstName] = useState(me.firstName ?? "");
  const [lastName, setLastName] = useState(me.lastName ?? "");
  const [phoneNumber, setPhoneNumber] = useState(me.phoneNumber ?? "");
  const [language, setLanguage] = useState(me.language ?? "en-US");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const update = useUpdateMyProfile();

  useEffect(() => {
    setFirstName(me.firstName ?? "");
    setLastName(me.lastName ?? "");
    setPhoneNumber(me.phoneNumber ?? "");
    setLanguage(me.language ?? "en-US");
    setError(null);
    setSuccess(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.itemId]);

  const dirty =
    firstName.trim() !== (me.firstName ?? "").trim() ||
    lastName.trim() !== (me.lastName ?? "").trim() ||
    phoneNumber.trim() !== (me.phoneNumber ?? "").trim() ||
    language.trim() !== (me.language ?? "en-US").trim();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!dirty) return;

    const patch: ProfileUpdate = {};
    const trimmedFirst = firstName.trim();
    if (trimmedFirst !== (me.firstName ?? "").trim()) patch.firstName = trimmedFirst;
    const trimmedLast = lastName.trim();
    if (trimmedLast !== (me.lastName ?? "").trim()) patch.lastName = trimmedLast;
    const trimmedPhone = phoneNumber.trim();
    if (trimmedPhone !== (me.phoneNumber ?? "").trim()) patch.phoneNumber = trimmedPhone;
    const trimmedLang = language.trim() || "en-US";
    if (trimmedLang !== (me.language ?? "en-US").trim()) patch.language = trimmedLang;

    if (Object.keys(patch).length === 0) return;

    try {
      await update.mutateAsync(patch);
      setSuccess(true);
      onSaved?.(patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile.");
    }
  }

  const saving = update.isPending;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            autoComplete="given-name"
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            autoComplete="family-name"
            disabled={saving}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          value={me.email ?? ""}
          readOnly
          disabled
          className="bg-muted/50"
        />
        <p className="text-xs text-muted-foreground">
          Email is managed by your identity provider and can&apos;t be changed here.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="phoneNumber">Phone number</Label>
          <Input
            id="phoneNumber"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+1 555 123 4567"
            autoComplete="tel"
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="language">Language</Label>
          <Input
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="en-US"
            disabled={saving}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {success && !error && (
        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
          Profile saved.
        </p>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          ItemId <code className="font-mono">{me.itemId}</code>
        </p>
        <Button type="submit" size="sm" disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

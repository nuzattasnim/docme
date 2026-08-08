import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { DocVersion } from "../types";
import { VersionStatusBadges } from "./version-status-badges";

export interface VersionCardProps {
	version: DocVersion;
	onSaveLabel: (label: string | null) => Promise<void>;
	onTogglePublished: () => Promise<void>;
	onToggleActive: () => Promise<void>;
	saving?: boolean;
}

/**
 * Editable DocVersion card — label input, status badges, save button.
 * The "New version" form lives next to this card in the parent.
 */
export function VersionCard({
	version,
	onSaveLabel,
	onTogglePublished,
	onToggleActive,
	saving,
}: VersionCardProps) {
	const [labelDraft, setLabelDraft] = useState(version.Version ?? "");
	const labelDirty = labelDraft.trim() !== (version.Version ?? "");

	useEffect(() => {
		setLabelDraft(version.Version ?? "");
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [version.ItemId]);

	async function handleSaveLabel() {
		if (!labelDirty) return;
		await onSaveLabel(labelDraft.trim() || null);
	}

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
				<div className="space-y-1">
					<CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Current DocVersion
					</CardTitle>
					<CardDescription className="font-mono text-xs">
						{version.ItemId}
					</CardDescription>
				</div>
				<VersionStatusBadges
					isPublished={version.IsPublished}
					isActive={version.IsActive}
					onTogglePublished={onTogglePublished}
					onToggleActive={onToggleActive}
					disabled={saving}
				/>
			</CardHeader>
			<CardContent>
				<div className="flex items-center gap-2">
					<label className="flex flex-1 items-center gap-2">
						<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							Label
						</span>
						<Input
							value={labelDraft}
							onChange={(e) => setLabelDraft(e.target.value)}
							placeholder="e.g. 0.0.1"
							disabled={saving}
						/>
					</label>
					<Button
						size="sm"
						variant="outline"
						onClick={handleSaveLabel}
						disabled={saving || !labelDirty}
					>
						{saving ? "Saving…" : "Save label"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

export interface NewVersionFormProps {
	onCreate: (label: string | null) => Promise<void>;
	busy?: boolean;
}

/**
 * "Create a new DocVersion" form. Used both when there's no version yet
 * (Doc with no CurrentVersion) and to start a successor version.
 */
export function NewVersionForm({ onCreate, busy }: NewVersionFormProps) {
	const [label, setLabel] = useState("");

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		await onCreate(label.trim() || null);
		setLabel("");
	}

	return (
		<form
			onSubmit={handleSubmit}
			className="flex items-center gap-2 rounded-md border bg-background p-2"
		>
			<Input
				value={label}
				onChange={(e) => setLabel(e.target.value)}
				placeholder="New version label (e.g. 0.0.2) — optional"
				disabled={busy}
				className="border-input bg-card"
			/>
			<Button type="submit" size="sm" variant="outline" disabled={busy}>
				{busy ? "Creating…" : "New version"}
			</Button>
		</form>
	);
}

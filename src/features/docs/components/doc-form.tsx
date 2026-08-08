import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { Doc, DocUpdate } from "../types";

export interface DocFormProps {
	doc: Doc;
	onSave: (patch: DocUpdate) => Promise<void>;
	saving?: boolean;
}

/**
 * Editable Doc header card — name + description. Re-seeds when the
 * underlying Doc changes (e.g. after navigation to another doc).
 */
export function DocForm({ doc, onSave, saving }: DocFormProps) {
	const [nameDraft, setNameDraft] = useState(doc.Name);
	const [descriptionDraft, setDescriptionDraft] = useState(
		doc.Description ?? "",
	);

	useEffect(() => {
		setNameDraft(doc.Name);
		setDescriptionDraft(doc.Description ?? "");
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [doc.ItemId]);

	const nameDirty = nameDraft.trim() !== doc.Name;
	const descDirty =
		descriptionDraft.trim() !== (doc.Description ?? "").trim();
	const dirty = nameDirty || descDirty;

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		if (!dirty) return;
		const patch: DocUpdate = {};
		const trimmedName = nameDraft.trim();
		if (trimmedName && trimmedName !== doc.Name) patch.Name = trimmedName;
		const nextDesc = descriptionDraft.trim();
		const currentDesc = doc.Description ?? "";
		if (nextDesc !== currentDesc) patch.Description = nextDesc || null;
		if (Object.keys(patch).length === 0) return;
		await onSave(patch);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Doc
				</CardTitle>
				<CardDescription className="sr-only">
					Edit the doc name and description
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="space-y-3">
					<Input
						value={nameDraft}
						onChange={(e) => setNameDraft(e.target.value)}
						placeholder="Doc name"
						className="text-lg font-semibold"
						disabled={saving}
					/>
					<Textarea
						value={descriptionDraft}
						onChange={(e) => setDescriptionDraft(e.target.value)}
						placeholder="Description (optional)"
						rows={2}
						disabled={saving}
					/>
					<div className="flex items-center justify-between gap-4">
						<p className="text-xs text-muted-foreground">
							ItemId{" "}
							<code className="font-mono">{doc.ItemId}</code>
							{doc.CreatedDate && (
								<> · created {formatDate(doc.CreatedDate)}</>
							)}
						</p>
						<Button
							type="submit"
							size="sm"
							disabled={saving || !dirty || !nameDraft.trim()}
						>
							{saving ? "Saving…" : "Save"}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}

function formatDate(iso: string): string {
	try {
		return new Date(iso).toLocaleString();
	} catch {
		return iso;
	}
}

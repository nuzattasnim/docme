import {
	useState,
	useEffect,
	type FormEvent,
	type ChangeEvent,
	type DragEvent,
} from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAddPage } from "../../hooks";
import {
	extractTextFromFile,
	formatPdfTextToMarkdown,
} from "../../utils/file-extractor";
import { LIMITS, hasErrors, validatePageInput, type FieldErrors } from "../../validation";
import { errorMessage, isDocmeDataError } from "@/features/data/errors";
import {
	Upload,
	FileText,
	Loader2,
	FileCode,
	CheckCircle2,
	AlertCircle,
} from "lucide-react";
import { useAddPageModal } from "./context";
import { toast } from "sonner";

// Supported file extensions that have paginated layouts
const PAGINATED_EXTENSIONS = ["pdf"];

export interface AddPageModalRootProps {
	docId: string;
	versionId: string;
	onPageAdded: (newPageId: string) => void;
}

/**
 * The actual modal — controlled by the shared AddPageModal context so
 * the trigger can live anywhere inside the provider.
 */
export function AddPageModalRoot({
	docId,
	versionId,
	onPageAdded,
}: AddPageModalRootProps) {
	const { open, setOpen } = useAddPageModal();
	const addPageMutation = useAddPage();

	const [title, setTitle] = useState("");
	const [contentType, setContentType] = useState<"md" | "mdx">("md");
	const [content, setContent] = useState("");
	const [inputMode, setInputMode] = useState<"manual" | "file">("manual");
	const [uploadedFile, setUploadedFile] = useState<File | null>(null);
	const [separatePages, setSeparatePages] = useState(false);
	const [isExtracting, setIsExtracting] = useState(false);
	const [extractError, setExtractError] = useState<string | null>(null);
	const [extractSuccess, setExtractSuccess] = useState<string | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

	// Reset form whenever the modal opens (clean slate each time).
	useEffect(() => {
		if (open) {
			setTitle("");
			setContentType("md");
			setContent("");
			setInputMode("manual");
			setUploadedFile(null);
			setSeparatePages(false);
			setIsExtracting(false);
			setExtractError(null);
			setExtractSuccess(null);
			setSubmitError(null);
			setFieldErrors({});
		}
	}, [open]);

	function handleClose() {
		setOpen(false);
	}

	async function processFile(
		file: File,
		overrideOptions: { separatePages?: boolean } = {},
	) {
		const isSep = overrideOptions.separatePages ?? separatePages;
		setUploadedFile(file);
		setIsExtracting(true);
		setExtractError(null);
		setExtractSuccess(null);

		try {
			const extracted = await extractTextFromFile(file, {
				separatePages: isSep,
			});
			setContent(extracted.content);
			if (!title.trim()) {
				setTitle(extracted.defaultTitle);
			}
			setExtractSuccess(
				`Successfully extracted text from "${file.name}" into Markdown.`,
			);
		} catch (err) {
			setExtractError(err instanceof Error ? err.message : String(err));
		} finally {
			setIsExtracting(false);
		}
	}

	function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (file) processFile(file);
	}

	function handleDragOver(e: DragEvent<HTMLDivElement>) {
		e.preventDefault();
	}

	function handleDrop(e: DragEvent<HTMLDivElement>) {
		e.preventDefault();
		const file = e.dataTransfer.files?.[0];
		if (file) processFile(file);
	}

	const fileExt = uploadedFile?.name.split(".").pop()?.toLowerCase();
	const isPaginatedFile = fileExt
		? PAGINATED_EXTENSIONS.includes(fileExt)
		: false;

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		const trimmedTitle = title.trim();
		const formattedContent = formatPdfTextToMarkdown(content);

		// C7: block the save with inline errors; no request is sent.
		const errors = validatePageInput({ title, content: formattedContent });
		setFieldErrors(errors);
		setSubmitError(null);
		if (hasErrors(errors)) return;

		try {
			const pageId = await addPageMutation.mutateAsync({
				docId,
				versionId,
				title: trimmedTitle,
				contentType,
				content: formattedContent,
			});
			onPageAdded(pageId);
			toast.success(`Page "${trimmedTitle}" added`);
			handleClose();
		} catch (err) {
			if (isDocmeDataError(err) && err.field) {
				setFieldErrors({ [err.field]: err.message });
			}
			const msg = errorMessage(err);
			setSubmitError(msg);
			toast.error(msg);
		}
	}

	return (
		<Dialog
			isOpen={open}
			onClose={handleClose}
			title="Add New Page"
			description="Add a documentation page by typing Markdown/MDX or uploading a file (.txt / .pdf)."
			maxWidthClass="max-w-3xl"
		>
			<form onSubmit={handleSubmit} className="space-y-5">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<div className="space-y-1.5 sm:col-span-2">
						<Label htmlFor="page-title">
							Page Title{" "}
							<span className="text-destructive">*</span>
						</Label>
						<Input
							id="page-title"
							type="text"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="e.g. Getting Started"
							disabled={addPageMutation.isPending}
							aria-invalid={!!fieldErrors.title}
							aria-describedby={fieldErrors.title ? "page-title-error" : undefined}
						/>
						{fieldErrors.title && (
							<p id="page-title-error" className="text-xs text-destructive">
								{fieldErrors.title}
							</p>
						)}
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="page-content-type">Content Type</Label>
						<select
							id="page-content-type"
							value={contentType}
							onChange={(e) =>
								setContentType(e.target.value as "md" | "mdx")
							}
							className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
							disabled={addPageMutation.isPending}
						>
							<option value="md">Markdown (.md)</option>
							<option value="mdx">MDX (.mdx)</option>
						</select>
					</div>
				</div>

				<Tabs
					value={inputMode}
					onValueChange={(v) => setInputMode(v as "manual" | "file")}
				>
					<TabsList>
						<TabsTrigger value="manual">
							<FileCode className="mr-2 h-4 w-4" />
							Manual Input
						</TabsTrigger>
						<TabsTrigger value="file">
							<Upload className="mr-2 h-4 w-4" />
							File Upload (.txt / .pdf)
						</TabsTrigger>
					</TabsList>

					<TabsContent value="manual" className="pt-2">
						<p className="text-sm text-muted-foreground">
							Type or paste your content below. Markdown is
							rendered live in the doc view.
						</p>
					</TabsContent>

					<TabsContent value="file" className="space-y-3 pt-2">
						<div
							onDragOver={handleDragOver}
							onDrop={handleDrop}
							className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-accent/30 p-6 text-center transition-colors hover:bg-accent/50"
							onClick={() =>
								document
									.getElementById("page-file-input")
									?.click()
							}
						>
							<input
								id="page-file-input"
								type="file"
								accept=".txt,.pdf,.md,.mdx,text/plain,application/pdf"
								onChange={handleFileChange}
								className="hidden"
							/>
							<div className="mb-2 rounded-full border bg-background p-3 shadow-sm">
								{isExtracting ? (
									<Loader2 className="h-6 w-6 animate-spin text-primary" />
								) : (
									<Upload className="h-6 w-6 text-muted-foreground" />
								)}
							</div>
							<p className="text-sm font-medium text-foreground">
								{isExtracting
									? "Extracting & converting file content to Markdown…"
									: "Click to upload or drag & drop a file"}
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								Supports plain text (.txt) and PDF documents
								(.pdf)
							</p>
						</div>

						{isPaginatedFile && (
							<div className="flex items-center justify-between rounded-lg border bg-accent/20 p-3">
								<div className="space-y-0.5">
									<Label
										htmlFor="separate-pages-toggle"
										className="cursor-pointer select-none text-xs font-semibold"
									>
										Separate content by pages
									</Label>
									<p className="text-xs text-muted-foreground">
										Include page headers (## Page X) for
										each page.
									</p>
								</div>
								<Switch
									id="separate-pages-toggle"
									checked={separatePages}
									onCheckedChange={(newValue) => {
										setSeparatePages(newValue);
										if (uploadedFile) {
											void processFile(uploadedFile, {
												separatePages: newValue,
											});
										}
									}}
								/>
							</div>
						)}

						{isExtracting && (
							<Alert>
								<Loader2 className="h-4 w-4 animate-spin" />
								<AlertDescription>
									Parsing text from file and converting into
									markdown…
								</AlertDescription>
							</Alert>
						)}

						{extractError && (
							<Alert variant="destructive">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>
									{extractError}
								</AlertDescription>
							</Alert>
						)}

						{extractSuccess && (
							<Alert>
								<CheckCircle2 className="h-4 w-4 text-emerald-600" />
								<AlertDescription>
									{extractSuccess}
								</AlertDescription>
							</Alert>
						)}
					</TabsContent>
				</Tabs>

				<div className="space-y-1.5">
					<div className="flex items-center justify-between">
						<Label htmlFor="page-content">
							Page Content ({contentType.toUpperCase()})
						</Label>
						{uploadedFile && (
							<span className="flex items-center gap-1 text-xs text-muted-foreground">
								<FileText className="h-3.5 w-3.5" /> Source:{" "}
								{uploadedFile.name}
							</span>
						)}
					</div>
					<Textarea
						id="page-content"
						value={content}
						onChange={(e) => setContent(e.target.value)}
						placeholder="# Page Title&#10;&#10;Write or paste markdown content here..."
						rows={10}
						className="font-mono text-xs"
						disabled={addPageMutation.isPending || isExtracting}
						aria-invalid={!!fieldErrors.content}
						aria-describedby="page-content-help"
					/>
					<p
						id="page-content-help"
						className={
							fieldErrors.content
								? "text-xs text-destructive"
								: "text-xs text-muted-foreground"
						}
					>
						{fieldErrors.content ??
							`${content.length.toLocaleString("en-US")} / ${LIMITS.pageContent.toLocaleString("en-US")} characters`}
					</p>
				</div>

				{submitError && (
					<Alert variant="destructive">
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>{submitError}</AlertDescription>
					</Alert>
				)}

				<div className="flex items-center justify-end gap-3 border-t pt-4">
					<Button
						type="button"
						variant="outline"
						onClick={handleClose}
						disabled={addPageMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						disabled={
							addPageMutation.isPending ||
							isExtracting
						}
					>
						{addPageMutation.isPending
							? "Adding Page…"
							: "Add Page"}
					</Button>
				</div>
			</form>
		</Dialog>
	);
}

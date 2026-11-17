import * as pdfjsLib from "pdfjs-dist";

// Set pdfjs worker using CDN URL (bypasses Vite proxy/tunnel module import failures)
if (typeof window !== "undefined") {
  const version = pdfjsLib.version || "6.2.108";
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
}


export interface ExtractedFileResult {
  content: string;
  defaultTitle: string;
}

export interface ExtractOptions {
  separatePages?: boolean;
}

/**
 * Converts extracted raw text or PDF content lines into clean Markdown syntax.
 * Ensures proper paragraph spacing and bullet formatting.
 */
export function formatPdfTextToMarkdown(rawText: string): string {
  if (!rawText.trim()) return rawText;

  const rawLines = rawText.split(/\r?\n/).map((l) => l.trimEnd());

  const blocks: string[] = [];
  let currentBlock: string[] = [];
  let currentBlockIsList = false;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();

    if (!line) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlockIsList ? currentBlock.join("\n") : currentBlock.join(" "));
        currentBlock = [];
        currentBlockIsList = false;
      }
      continue;
    }

    // Check if line is a header (starts with #)
    if (/^#{1,6}\s+/.test(line)) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlockIsList ? currentBlock.join("\n") : currentBlock.join(" "));
        currentBlock = [];
        currentBlockIsList = false;
      }
      blocks.push(line);
      continue;
    }

    // Check if line starts with a bullet symbol (•, ·, ●, ○, ■, ▪, –, —)
    const bulletMatch = line.match(/^[\s•·●○■▪–—]+\s*(.*)/);
    const isBullet = !!bulletMatch;
    const isMdList = /^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line);

    if (isBullet || isMdList) {
      const formattedLine = isBullet ? `- ${bulletMatch![1]}` : line;

      if (currentBlock.length > 0 && !currentBlockIsList) {
        blocks.push(currentBlock.join(" "));
        currentBlock = [];
      }

      currentBlockIsList = true;
      currentBlock.push(formattedLine);
    } else {
      if (currentBlock.length > 0 && currentBlockIsList) {
        blocks.push(currentBlock.join("\n"));
        currentBlock = [];
        currentBlockIsList = false;
      }

      if (currentBlock.length > 0) {
        const lastLine = currentBlock[currentBlock.length - 1];
        const lastLineEndsSentence = /[.:!?]$/.test(lastLine);

        if (lastLineEndsSentence) {
          blocks.push(currentBlock.join(" "));
          currentBlock = [line];
        } else {
          currentBlock.push(line);
        }
      } else {
        currentBlock.push(line);
      }
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlockIsList ? currentBlock.join("\n") : currentBlock.join(" "));
  }

  return blocks.join("\n\n");
}

interface PdfSpan {
  str: string;
  fontSize: number;
  isBold: boolean;
  isItalic: boolean;
  x: number;
  y: number;
  width: number;
}

interface PdfLineData {
  spans: PdfSpan[];
  y: number;
  maxFontSize: number;
  rawText: string;
  formattedText: string;
}

/**
 * Extracts text content from uploaded files (.txt, .pdf, .md, .mdx) and converts it to Markdown data.
 */
export async function extractTextFromFile(
  file: File,
  options: ExtractOptions = {}
): Promise<ExtractedFileResult> {
  const fileName = file.name;
  // Strip extension to generate a clean default page title
  const defaultTitle = fileName.replace(/\.[^/.]+$/, "");
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdfDoc = await loadingTask.promise;
      const numPages = pdfDoc.numPages;

      const pageLinesList: PdfLineData[][] = [];

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();

        const spans: PdfSpan[] = [];

        for (const item of textContent.items) {
          if ("str" in item && item.str) {
            const transform = item.transform || [1, 0, 0, 1, 0, 0];
            const fontSize = Math.hypot(transform[0], transform[1]) || item.height || 12;
            const x = transform[4];
            const y = transform[5];

            const styleObj = textContent.styles?.[item.fontName];
            const fontNameCombined = `${item.fontName || ""} ${styleObj?.fontFamily || ""}`;
            const isBold = /bold|heavy|black|semibold|medium/i.test(fontNameCombined);
            const isItalic = /italic|oblique/i.test(fontNameCombined);

            spans.push({
              str: item.str,
              fontSize,
              isBold,
              isItalic,
              x,
              y,
              width: item.width || 0,
            });
          }
        }

        // Sort spans by Y descending (PDF coordinates count up from page bottom)
        spans.sort((a, b) => b.y - a.y);

        // Group spans into lines
        const lines: PdfLineData[] = [];
        let currentLineSpans: PdfSpan[] = [];
        let currentLineY: number | null = null;

        for (const span of spans) {
          if (currentLineY === null) {
            currentLineSpans = [span];
            currentLineY = span.y;
          } else {
            const maxFs = Math.max(span.fontSize, 12);
            if (Math.abs(span.y - currentLineY) <= maxFs * 0.4) {
              currentLineSpans.push(span);
            } else {
              lines.push(buildLineData(currentLineSpans, currentLineY));
              currentLineSpans = [span];
              currentLineY = span.y;
            }
          }
        }

        if (currentLineSpans.length > 0 && currentLineY !== null) {
          lines.push(buildLineData(currentLineSpans, currentLineY));
        }

        pageLinesList.push(lines);
      }

      // Collect all line font sizes across the PDF document to calculate heading levels
      const allLines = pageLinesList.flat();
      const fontSizeCounts: Record<number, number> = {};

      for (const line of allLines) {
        const roundedFs = Math.round(line.maxFontSize * 10) / 10;
        fontSizeCounts[roundedFs] = (fontSizeCounts[roundedFs] || 0) + 1;
      }

      // Base font size is the most frequent font size
      let baseFontSize = 12;
      let maxCount = 0;
      for (const [fsStr, count] of Object.entries(fontSizeCounts)) {
        const fs = parseFloat(fsStr);
        if (count > maxCount) {
          maxCount = count;
          baseFontSize = fs;
        }
      }

      // Collect distinct heading font sizes (> baseFontSize * 1.12) sorted descending
      const headingFontSizes = Object.keys(fontSizeCounts)
        .map(Number)
        .filter((fs) => fs >= baseFontSize * 1.12)
        .sort((a, b) => b - a);

      // Process lines into final Markdown blocks per page
      const pageTexts: string[] = [];

      for (let i = 0; i < pageLinesList.length; i++) {
        const lines = pageLinesList[i];
        const pageNum = i + 1;

        const processedLines: string[] = [];

        for (const line of lines) {
          const rawTrimmed = line.rawText.trim();
          if (!rawTrimmed) continue;

          // Check if this line is a heading candidate based on font size
          const headingIndex = headingFontSizes.findIndex(
            (hFs) => Math.abs(line.maxFontSize - hFs) < 1.0 || line.maxFontSize >= hFs
          );

          if (headingIndex !== -1 && line.maxFontSize >= baseFontSize * 1.12) {
            const level = Math.min(headingIndex + 1, 6);
            const hashes = "#".repeat(level);
            // Header text strips inline markdown bold markers for clean title
            processedLines.push(`${hashes} ${rawTrimmed}`);
          } else {
            // Check bullet list item
            const bulletMatch = rawTrimmed.match(/^[\s•·●○■▪–—]+\s*(.*)/);
            if (bulletMatch) {
              processedLines.push(`- ${bulletMatch[1]}`);
            } else {
              processedLines.push(line.formattedText);
            }
          }
        }

        const rawPageText = processedLines.join("\n");
        const formattedPage = formatPdfTextToMarkdown(rawPageText);

        if (formattedPage.trim()) {
          if (options.separatePages && numPages > 1) {
            pageTexts.push(`## Page ${pageNum}\n\n${formattedPage}`);
          } else {
            pageTexts.push(formattedPage);
          }
        }
      }

      const fullMarkdown = pageTexts.join("\n\n---\n\n");
      return {
        content: fullMarkdown || `# ${defaultTitle}\n\n*(No text content extracted from PDF)*`,
        defaultTitle,
      };
    } catch (err) {
      throw new Error(`Failed to parse PDF file "${fileName}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Handle plain text / markdown formats (.txt, .md, .mdx, etc.)
  if (extension === "txt" || extension === "md" || extension === "mdx" || file.type.startsWith("text/")) {
    const rawText = await file.text();
    return {
      content: rawText,
      defaultTitle,
    };
  }

  throw new Error(`Unsupported file format .${extension}. Please upload a .txt or .pdf file.`);
}

function buildLineData(spans: PdfSpan[], lineY: number): PdfLineData {
  // Sort line spans by X position ascending
  spans.sort((a, b) => a.x - b.x);

  let rawText = "";
  let formattedText = "";
  let maxFontSize = 0;
  let lastX: number | null = null;
  let lastWidth = 0;

  for (const span of spans) {
    if (span.fontSize > maxFontSize) {
      maxFontSize = span.fontSize;
    }

    let needSpace = false;
    if (lastX !== null) {
      const gap = span.x - (lastX + lastWidth);
      if (gap > Math.max(span.fontSize * 0.15, 2)) {
        needSpace = true;
      }
    }

    const spanStr = span.str;

    if (needSpace && !rawText.endsWith(" ") && !spanStr.startsWith(" ")) {
      rawText += " ";
      formattedText += " ";
    }

    rawText += spanStr;

    const trimmed = spanStr.trim();
    if (trimmed) {
      const leadingSpace = spanStr.match(/^\s*/)?.[0] || "";
      const trailingSpace = spanStr.match(/\s*$/)?.[0] || "";

      let formattedSpan = trimmed;
      if (span.isBold && span.isItalic) {
        formattedSpan = `***${trimmed}***`;
      } else if (span.isBold) {
        formattedSpan = `**${trimmed}**`;
      } else if (span.isItalic) {
        formattedSpan = `*${trimmed}*`;
      }

      formattedText += leadingSpace + formattedSpan + trailingSpace;
    } else {
      formattedText += spanStr;
    }

    lastX = span.x;
    lastWidth = span.width;
  }

  return {
    spans,
    y: lineY,
    maxFontSize,
    rawText,
    formattedText,
  };
}


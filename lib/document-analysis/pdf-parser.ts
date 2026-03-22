/**
 * PDF Parser Module
 *
 * Extracts structured text from PDF files.
 * Output: sections with headings, body text, and metadata.
 *
 * Used by: day_care_web_app (介護報酬改定通知), ai-business-navigator (助成金申請書)
 */

import { PDFParse } from "pdf-parse";

// ── Types ───────────────────────────────────────────────────

export interface ParsedSection {
  /** Section heading (empty string for untitled sections) */
  heading: string;
  /** Body text of the section */
  body: string;
  /** 1-based page number where this section starts */
  startPage: number;
}

export interface ParsedDocument {
  /** Full extracted text */
  fullText: string;
  /** Structured sections split by headings */
  sections: ParsedSection[];
  /** Document metadata */
  metadata: DocumentMetadata;
}

export interface DocumentMetadata {
  /** Total number of pages */
  pageCount: number;
  /** Total character count */
  charCount: number;
  /** PDF metadata fields (title, author, etc.) */
  title: string | null;
  author: string | null;
  subject: string | null;
  creator: string | null;
  creationDate: string | null;
}

// ── Parser ──────────────────────────────────────────────────

/**
 * Parse a PDF buffer into structured text with sections.
 */
export async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  const textResult = await parser.getText();
  const fullText = textResult.text;
  const pageCount = textResult.total;

  let metadata: DocumentMetadata = {
    pageCount,
    charCount: fullText.length,
    title: null,
    author: null,
    subject: null,
    creator: null,
    creationDate: null,
  };

  try {
    const infoResult = await parser.getInfo();
    const dateNode = infoResult.getDateNode();
    metadata = {
      ...metadata,
      title: infoResult.info?.Title ?? null,
      author: infoResult.info?.Author ?? null,
      subject: infoResult.info?.Subject ?? null,
      creator: infoResult.info?.Creator ?? null,
      creationDate: dateNode.CreationDate?.toISOString() ?? null,
    };
  } catch {
    // Info extraction may fail for some PDFs — continue with defaults
  }

  await parser.destroy();

  const sections = splitIntoSections(fullText);

  return {
    fullText,
    sections,
    metadata,
  };
}

/**
 * Parse PDF from a base64-encoded string.
 */
export async function parsePdfFromBase64(base64: string): Promise<ParsedDocument> {
  const buffer = Buffer.from(base64, "base64");
  return parsePdf(buffer);
}

// ── Section Splitting ───────────────────────────────────────

/**
 * Heuristic-based section splitting for Japanese government documents.
 *
 * Detects headings by patterns common in 官公庁 documents:
 * - Lines starting with numbers: "第1条", "1.", "（1）"
 * - Lines starting with "■", "●", "◆", "【"
 * - Short lines (< 60 chars) preceded by a blank line
 * - Lines that are ALL CAPS or contain mostly kanji headings
 */
export function splitIntoSections(text: string): ParsedSection[] {
  const lines = text.split("\n");
  const sections: ParsedSection[] = [];
  let currentHeading = "";
  let currentBody: string[] = [];
  let currentStartPage = 1;
  let pageNum = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track page breaks (pdf-parse uses form-feed)
    if (line.includes("\f")) {
      pageNum++;
    }

    // Detect heading
    if (trimmed.length > 0 && isHeadingLine(trimmed, lines[i - 1]?.trim() ?? "")) {
      // Save previous section if it has content
      if (currentHeading || currentBody.join("").trim().length > 0) {
        sections.push({
          heading: currentHeading,
          body: currentBody.join("\n").trim(),
          startPage: currentStartPage,
        });
      }
      currentHeading = trimmed;
      currentBody = [];
      currentStartPage = pageNum;
    } else {
      currentBody.push(line);
    }
  }

  // Push final section only if it has content
  const finalBody = currentBody.join("\n").trim();
  if (currentHeading || finalBody.length > 0) {
    sections.push({
      heading: currentHeading,
      body: finalBody,
      startPage: currentStartPage,
    });
  }

  return sections;
}

/**
 * Determines if a line looks like a section heading.
 */
function isHeadingLine(line: string, prevLine: string): boolean {
  // Japanese official document numbering patterns
  if (/^第[0-9０-９一二三四五六七八九十百]+[条章節項]/.test(line)) return true;
  if (/^[0-9０-９]+[.\s　．]/.test(line)) return true;
  if (/^[（(][0-9０-９一二三四五六七八九十]+[)）]/.test(line)) return true;

  // Bullet/marker headings
  if (/^[■●◆◇▼▲★☆【〔]/.test(line)) return true;

  // Short line after blank = likely heading
  if (prevLine === "" && line.length > 0 && line.length < 60 && !line.endsWith("。")) {
    return true;
  }

  return false;
}

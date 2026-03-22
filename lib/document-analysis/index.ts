/**
 * Document Analysis Engine
 *
 * Shared module for PDF parsing and LLM-powered document comparison.
 * Used across multiple products:
 * - day_care_web_app: 介護報酬改定通知の差分検出
 * - ai-business-navigator: 助成金申請書の解析
 */

export { parsePdf, parsePdfFromBase64, splitIntoSections } from "./pdf-parser";
export type { ParsedDocument, ParsedSection, DocumentMetadata } from "./pdf-parser";

export { compareDocuments, compareDocumentsLocal } from "./document-diff";
export type {
  DocumentDiffInput,
  DocumentDiffResult,
  DocumentChange,
} from "./document-diff";

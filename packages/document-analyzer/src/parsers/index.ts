import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export interface ParseResult {
  text: string;
  metadata: Record<string, unknown>;
  pageCount?: number;
}

export async function parsePDF(buffer: Buffer): Promise<ParseResult> {
  const data = await pdfParse(buffer);
  return {
    text: data.text,
    metadata: { info: data.info, version: data.version },
    pageCount: data.numpages,
  };
}

export async function parseWord(buffer: Buffer): Promise<ParseResult> {
  const result = await mammoth.extractRawText({ buffer });
  return {
    text: result.value,
    metadata: { messages: result.messages },
  };
}

export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
): Promise<ParseResult> {
  if (mimeType === 'application/pdf') return parsePDF(buffer);
  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return parseWord(buffer);
  throw new Error(`Unsupported mime type: ${mimeType}`);
}

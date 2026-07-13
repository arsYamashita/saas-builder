import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

export interface ParseResult {
  text: string;
  metadata: Record<string, unknown>;
  pageCount?: number;
}

export async function parsePDF(buffer: Buffer): Promise<ParseResult> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const textResult = await parser.getText();

    let info: unknown;
    let version: unknown;
    try {
      const infoResult = await parser.getInfo();
      info = infoResult.info;
      version = infoResult.info?.PDFFormatVersion;
    } catch {
      // Info extraction may fail for some PDFs — continue with text only
    }

    return {
      text: textResult.text,
      metadata: { info, version },
      pageCount: textResult.total,
    };
  } finally {
    await parser.destroy();
  }
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

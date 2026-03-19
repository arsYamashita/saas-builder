/**
 * Minimal ZIP file builder (no external dependencies).
 *
 * Produces a valid ZIP archive with stored (uncompressed) entries.
 * Sufficient for source code exports where file sizes are small.
 */

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; dateVal: number } {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() >> 1) & 0x1f);
  const dateVal =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { time, dateVal };
}

function writeUint16LE(view: DataView, offset: number, val: number) {
  view.setUint16(offset, val, true);
}

function writeUint32LE(view: DataView, offset: number, val: number) {
  view.setUint32(offset, val, true);
}

interface ZipEntry {
  path: string;
  content: string;
}

export function buildZipBuffer(
  entries: ZipEntry[],
): ArrayBuffer {
  const encoder = new TextEncoder();
  const now = new Date();
  const { time, dateVal } = dosDateTime(now);

  // Prepare encoded entries
  const prepared = entries.map((entry) => {
    const pathBytes = encoder.encode(entry.path);
    const contentBytes = encoder.encode(entry.content);
    const crc = crc32(contentBytes);
    return { pathBytes, contentBytes, crc };
  });

  // Calculate sizes
  let localHeadersSize = 0;
  for (const p of prepared) {
    localHeadersSize += 30 + p.pathBytes.length + p.contentBytes.length;
  }

  let centralDirSize = 0;
  for (const p of prepared) {
    centralDirSize += 46 + p.pathBytes.length;
  }

  const eocdSize = 22;
  const totalSize = localHeadersSize + centralDirSize + eocdSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let localOffset = 0;
  const offsets: number[] = [];

  // Write local file headers + data
  for (const p of prepared) {
    offsets.push(localOffset);

    // Local file header signature
    writeUint32LE(view, localOffset, 0x04034b50);
    writeUint16LE(view, localOffset + 4, 20); // version needed
    writeUint16LE(view, localOffset + 6, 0); // flags
    writeUint16LE(view, localOffset + 8, 0); // compression (stored)
    writeUint16LE(view, localOffset + 10, time);
    writeUint16LE(view, localOffset + 12, dateVal);
    writeUint32LE(view, localOffset + 14, p.crc);
    writeUint32LE(view, localOffset + 18, p.contentBytes.length); // compressed
    writeUint32LE(view, localOffset + 22, p.contentBytes.length); // uncompressed
    writeUint16LE(view, localOffset + 26, p.pathBytes.length);
    writeUint16LE(view, localOffset + 28, 0); // extra field length

    bytes.set(p.pathBytes, localOffset + 30);
    bytes.set(p.contentBytes, localOffset + 30 + p.pathBytes.length);

    localOffset += 30 + p.pathBytes.length + p.contentBytes.length;
  }

  // Write central directory
  const centralDirOffset = localOffset;
  let cdOffset = centralDirOffset;

  for (let i = 0; i < prepared.length; i++) {
    const p = prepared[i];

    writeUint32LE(view, cdOffset, 0x02014b50); // central dir signature
    writeUint16LE(view, cdOffset + 4, 20); // version made by
    writeUint16LE(view, cdOffset + 6, 20); // version needed
    writeUint16LE(view, cdOffset + 8, 0); // flags
    writeUint16LE(view, cdOffset + 10, 0); // compression
    writeUint16LE(view, cdOffset + 12, time);
    writeUint16LE(view, cdOffset + 14, dateVal);
    writeUint32LE(view, cdOffset + 16, p.crc);
    writeUint32LE(view, cdOffset + 20, p.contentBytes.length);
    writeUint32LE(view, cdOffset + 24, p.contentBytes.length);
    writeUint16LE(view, cdOffset + 28, p.pathBytes.length);
    writeUint16LE(view, cdOffset + 30, 0); // extra field length
    writeUint16LE(view, cdOffset + 32, 0); // comment length
    writeUint16LE(view, cdOffset + 34, 0); // disk number start
    writeUint16LE(view, cdOffset + 36, 0); // internal attrs
    writeUint32LE(view, cdOffset + 38, 0); // external attrs
    writeUint32LE(view, cdOffset + 42, offsets[i]); // local header offset

    bytes.set(p.pathBytes, cdOffset + 46);
    cdOffset += 46 + p.pathBytes.length;
  }

  // Write end of central directory
  writeUint32LE(view, cdOffset, 0x06054b50); // EOCD signature
  writeUint16LE(view, cdOffset + 4, 0); // disk number
  writeUint16LE(view, cdOffset + 6, 0); // disk with central dir
  writeUint16LE(view, cdOffset + 8, prepared.length); // entries on disk
  writeUint16LE(view, cdOffset + 10, prepared.length); // total entries
  writeUint32LE(view, cdOffset + 12, centralDirSize); // central dir size
  writeUint32LE(view, cdOffset + 16, centralDirOffset); // central dir offset
  writeUint16LE(view, cdOffset + 20, 0); // comment length

  return buffer;
}

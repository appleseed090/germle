/**
 * A minimal ZIP writer (deflate, no encryption, no ZIP64), enough to package the portal build
 * without a `zip` binary or a dependency. Timestamps are fixed, so the same files always give the
 * same archive.
 */
import { crc32, deflateRawSync } from 'node:zlib';

/** One file to store, with its path inside the archive (forward slashes, no leading slash). */
export interface ZipEntry {
  readonly path: string;
  readonly data: Buffer;
}

/** 1980-01-01 00:00, the earliest DOS date: archives do not depend on when they were built. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const VERSION_NEEDED = 20;
const UTF8_FLAG = 0x0800;
const DEFLATE = 8;

/**
 * Builds a ZIP archive.
 *
 * @throws Error on an absolute or `..` path, or an archive too large for plain ZIP (4 GB).
 */
export function createZip(entries: readonly ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const { path, data } of entries) {
    if (path.startsWith('/') || path.split('/').includes('..'))
      throw new Error(`Unsafe path in zip: ${path}`);
    const name = Buffer.from(path, 'utf8');
    const compressed = deflateRawSync(data, { level: 9 });
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(DEFLATE, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(VERSION_NEEDED, 4);
    central.writeUInt16LE(VERSION_NEEDED, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(DEFLATE, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);

    localParts.push(local, name, compressed);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
    if (offset > 0xffffffff) throw new Error('Archive too large for ZIP without ZIP64');
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

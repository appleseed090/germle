import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createZip } from './zip.ts';

/** Reads entries back through the central directory, as an unzip tool would. */
function readZip(archive: Buffer): Map<string, Buffer> {
  const endOffset = archive.length - 22;
  expect(archive.readUInt32LE(endOffset)).toBe(0x06054b50);
  const count = archive.readUInt16LE(endOffset + 10);
  let pointer = archive.readUInt32LE(endOffset + 16);
  const files = new Map<string, Buffer>();
  for (let index = 0; index < count; index++) {
    expect(archive.readUInt32LE(pointer)).toBe(0x02014b50);
    const compressedSize = archive.readUInt32LE(pointer + 20);
    const nameLength = archive.readUInt16LE(pointer + 28);
    const localOffset = archive.readUInt32LE(pointer + 42);
    const name = archive.toString('utf8', pointer + 46, pointer + 46 + nameLength);
    expect(archive.readUInt32LE(localOffset)).toBe(0x04034b50);
    const dataStart = localOffset + 30 + archive.readUInt16LE(localOffset + 26);
    files.set(name, inflateRawSync(archive.subarray(dataStart, dataStart + compressedSize)));
    pointer += 46 + nameLength;
  }
  return files;
}

describe('createZip', () => {
  it('stores files that read back byte for byte, at the archive root', () => {
    const entries = [
      { path: 'index.html', data: Buffer.from('<!doctype html>') },
      { path: 'assets/index.js', data: Buffer.from('x'.repeat(5000)) },
      { path: 'empty.txt', data: Buffer.alloc(0) },
    ];
    const files = readZip(createZip(entries));
    expect([...files.keys()]).toEqual(['index.html', 'assets/index.js', 'empty.txt']);
    for (const { path, data } of entries) expect(files.get(path)?.equals(data)).toBe(true);
  });

  it('is reproducible', () => {
    const entries = [{ path: 'a.txt', data: Buffer.from('same') }];
    expect(createZip(entries).equals(createZip(entries))).toBe(true);
  });

  it('refuses paths that would escape the archive', () => {
    expect(() => createZip([{ path: '../x', data: Buffer.alloc(0) }])).toThrow();
    expect(() => createZip([{ path: '/x', data: Buffer.alloc(0) }])).toThrow();
  });
});

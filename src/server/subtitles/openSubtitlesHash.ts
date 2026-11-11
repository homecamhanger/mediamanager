import fs from 'node:fs';

/**
 * Computes the official OpenSubtitles.org / OpenSubtitles.com 64-bit movie hash:
 * hash = fileSize + sum(little-endian uint64s of first 64KB) + sum(little-endian uint64s of last 64KB) (mod 2^64).
 * Works cleanly on files of any size (falls back gracefully for tiny demo files < 64KB).
 */
export function computeOpenSubtitlesHash(filePath: string): string {
  try {
    const stat = fs.statSync(filePath);
    const fileSize = BigInt(stat.size);
    const chunkSize = 65536;
    const mask = (1n << 64n) - 1n;

    if (stat.size === 0) return '0000000000000000';

    const fd = fs.openSync(filePath, 'r');
    try {
      let hash = fileSize;

      const headLen = Math.min(chunkSize, stat.size);
      const headBuf = Buffer.alloc(Math.ceil(headLen / 8) * 8);
      fs.readSync(fd, headBuf, 0, headLen, 0);
      for (let i = 0; i < headBuf.length; i += 8) {
        hash = (hash + headBuf.readBigUInt64LE(i)) & mask;
      }

      const tailOffset = Math.max(0, stat.size - chunkSize);
      const tailLen = stat.size - tailOffset;
      const tailBuf = Buffer.alloc(Math.ceil(tailLen / 8) * 8);
      fs.readSync(fd, tailBuf, 0, tailLen, tailOffset);
      for (let i = 0; i < tailBuf.length; i += 8) {
        hash = (hash + tailBuf.readBigUInt64LE(i)) & mask;
      }

      return hash.toString(16).padStart(16, '0');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '0000000000000000';
  }
}

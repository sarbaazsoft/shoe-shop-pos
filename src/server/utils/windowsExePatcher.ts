export const DEFAULT_PUBLISHED_APP_URL = 'https://sarbaazsoft.cloud.run';

// Exact file offsets in public/assets/SarbaazSoft-POS-Desktop-Setup.exe
// where the 71-byte stack URL buffer is loaded via 9 x86-64 movabs imm64 instructions.
const URL_MOVABS_SLOTS: ReadonlyArray<{
  opcodeOffset: number;
  immOffset: number;
  expectedOpcode: readonly [number, number];
  bufStart: number;
}> = [
  { opcodeOffset: 0x0d2b, immOffset: 0x0d2d, expectedOpcode: [0x48, 0xb8], bufStart: 0 },
  { opcodeOffset: 0x0d35, immOffset: 0x0d37, expectedOpcode: [0x48, 0xba], bufStart: 8 },
  { opcodeOffset: 0x0d4f, immOffset: 0x0d51, expectedOpcode: [0x48, 0xb8], bufStart: 16 },
  { opcodeOffset: 0x0d69, immOffset: 0x0d6b, expectedOpcode: [0x48, 0xba], bufStart: 24 },
  { opcodeOffset: 0x0d7b, immOffset: 0x0d7d, expectedOpcode: [0x48, 0xb8], bufStart: 32 },
  { opcodeOffset: 0x0d8d, immOffset: 0x0d8f, expectedOpcode: [0x48, 0xba], bufStart: 40 },
  { opcodeOffset: 0x0d9f, immOffset: 0x0da1, expectedOpcode: [0x48, 0xb8], bufStart: 48 },
  { opcodeOffset: 0x0db1, immOffset: 0x0db3, expectedOpcode: [0x48, 0xba], bufStart: 56 },
  // Note: final store writes to [rsp+0x55f], overlapping 1 byte at index 63
  { opcodeOffset: 0x0dc3, immOffset: 0x0dc5, expectedOpcode: [0x48, 0xb8], bufStart: 63 },
];

const MAX_URL_LENGTH = 70; // 71-byte buffer including trailing NUL
const SHORTCUT_NAME_OFFSET = 31997;
const SHORTCUT_NAME_MAX_LEN = 22;

export function calculatePeChecksum(peBuffer: Buffer): number {
  if (peBuffer.length < 0x100) return 0;
  const eLfanew = peBuffer.readUInt32LE(0x3c);
  if (eLfanew + 24 + 68 > peBuffer.length) return 0;

  const checksumOffset = eLfanew + 24 + 64;
  const buf = Buffer.from(peBuffer);
  buf.writeUInt32LE(0, checksumOffset);

  const paddedLen = buf.length % 2 === 0 ? buf.length : buf.length + 1;
  let sum = 0;
  for (let i = 0; i < paddedLen; i += 2) {
    const word = i + 1 < buf.length ? buf.readUInt16LE(i) : buf[i];
    sum += word;
    sum = (sum & 0xffff) + (sum >>> 16);
  }
  sum = (sum & 0xffff) + (sum >>> 16);
  return (sum + peBuffer.length) >>> 0;
}

export function resolveDesktopTargetUrl(options?: {
  envUrl?: string;
  hostHeader?: string;
}): string {
  const candidateEnv = String(options?.envUrl || '').trim().replace(/\/+$/, '');
  if (candidateEnv && /^https:\/\/[^\s/]+$/i.test(candidateEnv) && candidateEnv.length <= MAX_URL_LENGTH) {
    return candidateEnv;
  }

  const rawHost = String(options?.hostHeader || '')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');

  if (rawHost) {
    const hostWithoutPort = rawHost.split(':')[0].toLowerCase();
    const isLocalHost =
      hostWithoutPort === 'localhost' ||
      hostWithoutPort === '127.0.0.1' ||
      hostWithoutPort === '0.0.0.0' ||
      hostWithoutPort.endsWith('.local');

    if (!isLocalHost && /^[a-z0-9.-]+(?::\d+)?$/i.test(rawHost)) {
      const candidate = `https://${rawHost}`;
      if (candidate.length <= MAX_URL_LENGTH) {
        return candidate;
      }
    }
  }

  return DEFAULT_PUBLISHED_APP_URL;
}

export function patchDesktopSetupExe(
  originalBuf: Buffer,
  options?: {
    targetUrl?: string;
    shortcutBaseName?: string;
  }
): Buffer {
  const buf = Buffer.from(originalBuf);

  // 1. Patch hardcoded launch URL stack immediates if signature matches
  const cleanUrl = String(options?.targetUrl || DEFAULT_PUBLISHED_APP_URL)
    .trim()
    .replace(/\/+$/, '');

  const hasValidUrlSlots =
    buf.length > 0x0dd0 &&
    URL_MOVABS_SLOTS.every(
      (slot) =>
        buf[slot.opcodeOffset] === slot.expectedOpcode[0] &&
        buf[slot.opcodeOffset + 1] === slot.expectedOpcode[1]
    );

  if (hasValidUrlSlots && cleanUrl.length > 0 && cleanUrl.length <= MAX_URL_LENGTH) {
    const urlBuf = Buffer.alloc(MAX_URL_LENGTH + 1, 0);
    urlBuf.write(cleanUrl, 0, 'ascii');
    for (const slot of URL_MOVABS_SLOTS) {
      urlBuf.copy(buf, slot.immOffset, slot.bufStart, slot.bufStart + 8);
    }
  }

  // 2. Patch desktop shortcut filename (%s\<name>.url\0) if prefix matches
  if (options?.shortcutBaseName && SHORTCUT_NAME_OFFSET + SHORTCUT_NAME_MAX_LEN <= buf.length) {
    const hasPercentSBackslash =
      buf[SHORTCUT_NAME_OFFSET - 3] === 0x25 && // '%'
      buf[SHORTCUT_NAME_OFFSET - 2] === 0x73 && // 's'
      buf[SHORTCUT_NAME_OFFSET - 1] === 0x5c; // '\'
    if (hasPercentSBackslash) {
      const cleanBase = options.shortcutBaseName
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'SarbaazSoft-POS';
      const shortcutName = `${cleanBase.slice(0, 17)}.url\0`;
      const shortcutBuf = Buffer.from(shortcutName, 'utf8');
      if (shortcutBuf.length <= SHORTCUT_NAME_MAX_LEN) {
        buf.fill(0, SHORTCUT_NAME_OFFSET, SHORTCUT_NAME_OFFSET + SHORTCUT_NAME_MAX_LEN);
        shortcutBuf.copy(buf, SHORTCUT_NAME_OFFSET);
      }
    }
  }

  // 3. Update PE OptionalHeader.CheckSum
  if (buf.length >= 0x100 && buf[0] === 0x4d && buf[1] === 0x5a) {
    const eLfanew = buf.readUInt32LE(0x3c);
    if (eLfanew + 24 + 68 <= buf.length) {
      buf.writeUInt32LE(calculatePeChecksum(buf), eLfanew + 24 + 64);
    }
  }

  return buf;
}

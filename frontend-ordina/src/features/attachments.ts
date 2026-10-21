/**
 * ORDINA AI attachments: which files can be sent, checked by their real content (the first
 * bytes), not by the file name. Pure so it can be unit tested; the server checks again.
 */

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Images are made smaller than this long edge before upload. */
export const IMAGE_MAX_EDGE = 2048;

export type AttachmentKind = 'image' | 'video' | 'pdf' | 'docx' | 'text';

export type DetectedFile = { kind: AttachmentKind; mimeType: string };

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Types the Files picker offers. */
export const PICKER_TYPES = ['image/*', 'application/pdf', 'text/plain', 'text/csv', 'text/comma-separated-values', DOCX_MIME];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, from: number, to: number) {
  return String.fromCharCode(...bytes.slice(from, to));
}

/** Looks like text: no control bytes except tab, new line, form feed and carriage return (UTF-8 accepted). */
function looksLikeText(bytes: Uint8Array) {
  if (!bytes.length) return false;
  return bytes.every((byte) => byte >= 32 || byte === 9 || byte === 10 || byte === 12 || byte === 13);
}

/**
 * What a file really is, from its first bytes (at least 64 are needed) and its name.
 * Null when ORDINA cannot read it (e.g. a .exe renamed to .pdf).
 */
export function detectFile(head: Uint8Array, name = ''): DetectedFile | null {
  const lower = name.toLowerCase();
  if (startsWith(head, [0xff, 0xd8, 0xff])) return { kind: 'image', mimeType: 'image/jpeg' };
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'image', mimeType: 'image/png' };
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') return { kind: 'image', mimeType: 'image/webp' };
  if (ascii(head, 4, 8) === 'ftyp') {
    const brand = ascii(head, 8, 12);
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return { kind: 'image', mimeType: 'image/heic' };
    return { kind: 'video', mimeType: brand.startsWith('qt') ? 'video/quicktime' : 'video/mp4' };
  }
  if (ascii(head, 0, 5) === '%PDF-') return { kind: 'pdf', mimeType: 'application/pdf' };
  // DOCX is a ZIP; the server opens it to make sure it really is a Word document.
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return lower.endsWith('.docx') ? { kind: 'docx', mimeType: DOCX_MIME } : null;
  if (looksLikeText(head)) return { kind: 'text', mimeType: lower.endsWith('.csv') ? 'text/csv' : 'text/plain' };
  return null;
}

/** The first `count` bytes of a base64 string, without decoding all of it. */
export function headBytes(base64: string, count = 64): Uint8Array {
  const chunk = base64.slice(0, Math.ceil(count / 3) * 4);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of chunk) {
    if (char === '=') break;
    const value = alphabet.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out.slice(0, count));
}

export type AttachmentError = 'tooMany' | 'tooLarge' | 'unsupported' | 'empty';

/** Checks one more file against what is already attached. */
export function checkAttachment(file: { size: number; detected: DetectedFile | null }, alreadyAttached: number): AttachmentError | null {
  if (alreadyAttached >= MAX_FILES) return 'tooMany';
  if (!file.size) return 'empty';
  if (file.size > MAX_FILE_BYTES) return 'tooLarge';
  if (!file.detected) return 'unsupported';
  return null;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Files sent to ORDINA AI, turned into Gemini input on the phone: images, PDFs and videos go
 * inline (multimodal); Word, TXT and CSV are sent as their text. Same limits and checks as the
 * server had (backend-ordina/src/lib/media.js): up to 5 files, 10 MB each, about 18 MB inline.
 */
import { strFromU8, unzipSync } from 'fflate';

import { MAX_FILE_BYTES, MAX_FILES, detectFile, headBytes, type AttachmentKind } from '../attachments.ts';
import { AiError } from './gemini.ts';

/** Gemini accepts about 20 MB of inline data per request. */
export const MAX_INLINE_BYTES = 18 * 1024 * 1024;
export const MAX_TEXT_CHARS = 120_000;

export type MediaFile = { data: string; name: string };
export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Int16Array(256).fill(-1);
for (let index = 0; index < ALPHABET.length; index += 1) LOOKUP[ALPHABET.charCodeAt(index)] = index;

/** Size of the decoded bytes, without decoding. */
export function base64Size(base64: string) {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

export function base64ToBytes(base64: string) {
  const out = new Uint8Array(base64Size(base64));
  let buffer = 0;
  let bits = 0;
  let position = 0;
  for (let index = 0; index < base64.length && position < out.length; index += 1) {
    const value = LOOKUP[base64.charCodeAt(index)];
    if (value < 0) continue;
    buffer = ((buffer << 6) | value) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[position] = (buffer >> bits) & 0xff;
      position += 1;
    }
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** The text of a Word document (word/document.xml inside the .docx ZIP). Null if it is not one. */
export function docxText(bytes: Uint8Array): string | null {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (file) => file.name === 'word/document.xml' });
  } catch {
    return null;
  }
  const xml = files['word/document.xml'];
  if (!xml) return null;
  return strFromU8(xml)
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITIES[name])
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Validates every file and builds the Gemini parts. Throws AiError FILE_* (too many, too large,
 * unsupported, unreadable) with the file name for the message.
 */
export function prepareFiles(files: MediaFile[]): { parts: GeminiPart[]; kinds: AttachmentKind[] } {
  if (!files.length) throw new AiError('FILE_EMPTY', { name: 'This file' });
  if (files.length > MAX_FILES) throw new AiError('FILE_TOO_MANY', { n: MAX_FILES });
  const parts: GeminiPart[] = [];
  const kinds: AttachmentKind[] = [];
  let inline = 0;
  for (const file of files) {
    const name = file.name || 'This file';
    const size = base64Size(file.data);
    if (!size) throw new AiError('FILE_EMPTY', { name });
    if (size > MAX_FILE_BYTES) throw new AiError('FILE_TOO_LARGE', { name });
    const head = headBytes(file.data, 64);
    // Any ZIP may be a Word document (some pickers drop the name); docxText checks it below.
    const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
    const detected = isZip ? { kind: 'docx' as const, mimeType: '' } : detectFile(head, file.name);
    if (!detected) throw new AiError('FILE_UNSUPPORTED', { name });
    const kind = detected.kind;
    kinds.push(kind);
    if (kind === 'docx' || kind === 'text') {
      const bytes = base64ToBytes(file.data);
      const text = kind === 'docx' ? docxText(bytes) : strFromU8(bytes);
      if (text === null) throw new AiError('FILE_UNSUPPORTED', { name });
      if (!text.trim()) throw new AiError('FILE_UNREADABLE', { name });
      parts.push({ text: `--- ${file.name || 'document'} ---\n${text.slice(0, MAX_TEXT_CHARS)}` });
    } else {
      inline += size;
      parts.push({ inlineData: { mimeType: detected.mimeType, data: file.data } });
    }
  }
  if (inline > MAX_INLINE_BYTES) throw new AiError('FILES_TOO_LARGE');
  return { parts, kinds };
}

/**
 * Files sent to ORDINA AI: checked by their real content (first bytes), turned into Gemini
 * input (images, PDFs and videos inline; Word, TXT and CSV as extracted text) and never written
 * to disk. Mirrors frontend-ordina/src/features/attachments.ts.
 */
const mammoth = require('mammoth');

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Gemini accepts about 20 MB of inline data per request. */
const MAX_INLINE_BYTES = 18 * 1024 * 1024;
const MAX_TEXT_CHARS = 120_000;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

class MediaError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function ascii(bytes, from, to) {
  return bytes.subarray(from, to).toString('latin1');
}

function looksLikeText(bytes) {
  const head = bytes.subarray(0, 512);
  if (!head.length) return false;
  for (const byte of head) {
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 12 && byte !== 13) return false;
  }
  return true;
}

/** { kind, mimeType } from the file's bytes, or null when ORDINA cannot read it. */
function detect(bytes, name = '') {
  const lower = String(name).toLowerCase();
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { kind: 'image', mimeType: 'image/jpeg' };
  if (ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') return { kind: 'image', mimeType: 'image/png' };
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return { kind: 'image', mimeType: 'image/webp' };
  if (ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return { kind: 'image', mimeType: 'image/heic' };
    return { kind: 'video', mimeType: brand.startsWith('qt') ? 'video/quicktime' : 'video/mp4' };
  }
  if (ascii(bytes, 0, 5) === '%PDF-') return { kind: 'pdf', mimeType: 'application/pdf' };
  if (ascii(bytes, 0, 4) === 'PK\x03\x04') {
    // A Word document is a ZIP that contains word/document.xml.
    return bytes.includes(Buffer.from('word/')) ? { kind: 'docx', mimeType: DOCX_MIME } : null;
  }
  if (looksLikeText(bytes)) return { kind: 'text', mimeType: lower.endsWith('.csv') ? 'text/csv' : 'text/plain' };
  return null;
}

/** Request body -> [{ data, mimeType, name }]: the new `files` list, or the older single `media`. */
function filesFromBody(body) {
  if (Array.isArray(body?.files)) {
    return body.files.map((file) => ({ data: String(file?.data || ''), name: String(file?.name || '').slice(0, 120) }));
  }
  const media = String(body?.media || body?.image || '').trim();
  return media ? [{ data: media, name: String(body?.fileName || '').slice(0, 120) }] : [];
}

/**
 * Validates every file and builds the Gemini parts. Throws MediaError with a friendly message
 * (too many, too large, unsupported, unreadable).
 */
async function prepareFiles(files) {
  if (!files.length) throw new MediaError(400, 'FILE_MISSING', 'Attach a photo or a file first.');
  if (files.length > MAX_FILES) throw new MediaError(400, 'FILE_TOO_MANY', `You can send up to ${MAX_FILES} files at once.`);
  const parts = [];
  const kinds = [];
  let inline = 0;
  for (const file of files) {
    const bytes = Buffer.from(file.data, 'base64');
    const label = file.name || 'This file';
    if (!bytes.length) throw new MediaError(400, 'FILE_UNREADABLE', `${label} is empty.`);
    if (bytes.length > MAX_FILE_BYTES) throw new MediaError(413, 'FILE_TOO_LARGE', `${label} is larger than 10 MB. Please send a smaller file.`);
    const detected = detect(bytes, file.name);
    if (!detected) {
      throw new MediaError(415, 'FILE_UNSUPPORTED', `${label} is not a type ORDINA can read. Use a photo, PDF, Word document, TXT or CSV.`);
    }
    kinds.push(detected.kind);
    if (detected.kind === 'docx' || detected.kind === 'text') {
      let text;
      try {
        text = detected.kind === 'docx'
          ? (await mammoth.extractRawText({ buffer: bytes })).value
          : bytes.toString('utf8');
      } catch {
        throw new MediaError(422, 'FILE_UNREADABLE', `ORDINA could not open ${label}. Try saving it again or as a PDF.`);
      }
      if (!text.trim()) throw new MediaError(422, 'FILE_UNREADABLE', `${label} has no text ORDINA can read.`);
      parts.push({ text: `--- ${file.name || 'document'} ---\n${text.slice(0, MAX_TEXT_CHARS)}` });
    } else {
      inline += bytes.length;
      parts.push({ inlineData: { mimeType: detected.mimeType, data: file.data } });
    }
  }
  if (inline > MAX_INLINE_BYTES) {
    throw new MediaError(413, 'FILES_TOO_LARGE', 'These files are too large to send together. Please send fewer at once.');
  }
  return { parts, kinds };
}

/** Per-user file allowance: every file counts towards the AI limit (30 per minute). */
function createFileLimiter({ max = 30, windowMs = 60_000 } = {}) {
  const usage = new Map();
  return function consume(userId, count, now = Date.now()) {
    const entry = usage.get(userId);
    const current = entry && now - entry.start < windowMs ? entry : { start: now, used: 0 };
    if (current.used + count > max) {
      usage.set(userId, current);
      return false;
    }
    current.used += count;
    usage.set(userId, current);
    return true;
  };
}

module.exports = { MAX_FILES, MAX_FILE_BYTES, MediaError, createFileLimiter, detect, filesFromBody, prepareFiles };

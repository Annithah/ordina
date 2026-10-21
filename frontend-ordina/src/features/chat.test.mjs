// Unit tests for ORDINA AI chat history and attachments. Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_FILES, MAX_FILE_BYTES, checkAttachment, detectFile, formatBytes, headBytes } from './attachments.ts';
import { contextWindow, conversationTitle, groupConversations, retentionCutoff } from './chat-groups.ts';

const now = new Date(2026, 9, 21, 15, 0);
const at = (days, hour = 10) => new Date(2026, 9, 21 - days, hour, 0).toISOString();

test('chats are grouped Pinned, Today, Yesterday, Previous 7 days, Older, newest first', () => {
  const groups = groupConversations([
    { id: 'old', title: 'a', isPinned: false, updatedAt: at(30) },
    { id: 'today-early', title: 'b', isPinned: false, updatedAt: at(0, 8) },
    { id: 'today-late', title: 'c', isPinned: false, updatedAt: at(0, 14) },
    { id: 'yesterday', title: 'd', isPinned: false, updatedAt: at(1, 23) },
    { id: 'week', title: 'e', isPinned: false, updatedAt: at(6) },
    { id: 'pinned-old', title: 'f', isPinned: true, updatedAt: at(90) },
  ], now);
  assert.deepEqual(groups.map((group) => group.id), ['pinned', 'today', 'yesterday', 'week', 'older']);
  assert.deepEqual(groups[1].items.map((item) => item.id), ['today-late', 'today-early']);
  assert.deepEqual(groups[4].items.map((item) => item.id), ['old']);
  assert.deepEqual(groupConversations([], now), []);
});

test('titles come from the first message, on one line and shortened', () => {
  assert.equal(conversationTitle('  Plan my\n week  '), 'Plan my week');
  assert.equal(conversationTitle(''), 'New chat');
  const long = conversationTitle('x'.repeat(100));
  assert.equal(long.length, 60);
  assert.ok(long.endsWith('…'));
});

test('retention: forever keeps everything, 30 and 90 days give a cutoff', () => {
  assert.equal(retentionCutoff('forever', now), null);
  assert.equal(retentionCutoff('30', now), new Date(now.getTime() - 30 * 86_400_000).toISOString());
  assert.ok(retentionCutoff('90', now) < retentionCutoff('30', now));
});

test('only the open chat\'s last 10 messages go to the AI, shortened', () => {
  const messages = Array.from({ length: 14 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `m${index}` }));
  messages.push({ role: 'user', content: '   ' }, { role: 'assistant', content: 'y'.repeat(900) });
  const context = contextWindow(messages);
  assert.equal(context.length, 10);
  assert.equal(context[0].content, 'm5');
  assert.equal(context.at(-1).content.length, 600);
});

const bytes = (...values) => Uint8Array.from([...values, ...new Array(64).fill(32)].slice(0, 64));
const text = (value) => Uint8Array.from([...value].map((char) => char.charCodeAt(0)));

test('files are recognised by their content, not their name', () => {
  assert.deepEqual(detectFile(bytes(0xff, 0xd8, 0xff, 0xe0), 'photo.png'), { kind: 'image', mimeType: 'image/jpeg' });
  assert.equal(detectFile(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)).mimeType, 'image/png');
  assert.equal(detectFile(text('RIFF\0\0\0\0WEBPVP8 ')).mimeType, 'image/webp');
  assert.equal(detectFile(text('\0\0\0\x18ftypheic\0\0\0\0')).mimeType, 'image/heic');
  assert.equal(detectFile(text('\0\0\0\x18ftypmp42\0\0\0\0')).kind, 'video');
  assert.equal(detectFile(text('%PDF-1.7\n'), 'notes.pdf').kind, 'pdf');
  assert.equal(detectFile(bytes(0x50, 0x4b, 0x03, 0x04), 'plan.docx').kind, 'docx');
  // A ZIP that is not called .docx is not accepted.
  assert.equal(detectFile(bytes(0x50, 0x4b, 0x03, 0x04), 'archive.zip'), null);
  assert.deepEqual(detectFile(text('date,task\n2026-10-22,Exam\n'), 'list.csv'), { kind: 'text', mimeType: 'text/csv' });
  assert.equal(detectFile(text('Buy milk\nCall mom'), 'todo.txt').mimeType, 'text/plain');
  // A program renamed to .pdf.
  assert.equal(detectFile(bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00), 'homework.pdf'), null);
});

test('base64 head decoding matches the real bytes', () => {
  assert.deepEqual([...headBytes('JVBERi0xLjcK', 5)], [...text('%PDF-')]);
  assert.deepEqual([...headBytes('/9j/4AAQ', 3)], [0xff, 0xd8, 0xff]);
});

test('at most 5 files of 10 MB each, nothing empty or unknown', () => {
  const ok = { kind: 'pdf', mimeType: 'application/pdf' };
  assert.equal(checkAttachment({ size: 1000, detected: ok }, 0), null);
  assert.equal(checkAttachment({ size: 1000, detected: ok }, MAX_FILES), 'tooMany');
  assert.equal(checkAttachment({ size: MAX_FILE_BYTES + 1, detected: ok }, 0), 'tooLarge');
  assert.equal(checkAttachment({ size: 0, detected: ok }, 0), 'empty');
  assert.equal(checkAttachment({ size: 10, detected: null }, 0), 'unsupported');
  assert.equal(formatBytes(2_500_000), '2.4 MB');
  assert.equal(formatBytes(2048), '2 KB');
});

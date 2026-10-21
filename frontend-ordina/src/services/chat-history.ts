/**
 * ORDINA AI conversations stored on the phone (expo-sqlite), readable offline. Photos are kept
 * as small copies in ORDINA's folder; documents only as a reference (name, size, type), so the
 * history stays small.
 */
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { conversationTitle, retentionCutoff, type Retention } from '@/features/chat-groups';
import type { AttachmentKind } from '@/features/attachments';

export type ChatAttachment = {
  kind: AttachmentKind;
  /** A local file: the saved preview for photos, the picked file for documents (may be gone later). */
  uri: string;
  name: string;
  mimeType: string;
  size: number;
};

export type PlanStatus = 'pending' | 'added' | 'cancelled';

/** A task preview shown in the chat: what ORDINA proposed and what the user did with it. */
export type PlanMeta = { status: PlanStatus; titles: string[]; count: number; added?: number };

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  kind: 'text' | 'plan';
  content: string;
  attachments: ChatAttachment[];
  plan?: PlanMeta;
  createdAt: string;
};

export type Conversation = {
  id: string;
  title: string;
  isPinned: boolean;
  preview: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

type MessageRow = {
  id: string;
  role: string;
  kind: string;
  content: string;
  attachments: string | null;
  meta: string | null;
  created_at: string;
};

type ConversationRow = {
  id: string;
  title: string;
  is_pinned: number;
  created_at: string;
  updated_at: string;
  preview: string | null;
  message_count: number;
};

const RETENTION_KEY = 'ordina.chatRetention.v1';
const PREVIEW_EDGE = 1080;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(database: SQLite.SQLiteDatabase) {
  const { user_version: version } = (await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version')) ?? { user_version: 0 };
  if (version < 1) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'text',
        content TEXT NOT NULL,
        attachments TEXT,
        meta TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chat_messages_conversation ON chat_messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS conversations_updated ON conversations(updated_at);
      PRAGMA user_version = 1;
    `);
  }
}

function db() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await SQLite.openDatabaseAsync('ordina-chats.db');
      await database.execAsync('PRAGMA journal_mode = WAL;');
      await migrate(database);
      return database;
    })();
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function mediaDirectory() {
  const directory = new Directory(Paths.document, 'chat-media');
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  return directory;
}

/**
 * What the history keeps of an attachment: a smaller JPEG copy of a photo in ORDINA's folder,
 * or just the reference of a document or video.
 */
export async function keepAttachment(attachment: ChatAttachment): Promise<ChatAttachment> {
  if (Platform.OS === 'web' || attachment.kind !== 'image') return attachment;
  try {
    const image = await ImageManipulator.manipulate(attachment.uri).resize({ width: PREVIEW_EDGE }).renderAsync();
    const saved = await image.saveAsync({ compress: 0.6, format: SaveFormat.JPEG });
    const target = new File(mediaDirectory(), `${Crypto.randomUUID()}.jpg`);
    await new File(saved.uri).copy(target);
    return { ...attachment, uri: target.uri };
  } catch {
    return attachment;
  }
}

export async function createConversation(firstMessage: string): Promise<string> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  await (await db()).runAsync(
    'INSERT INTO conversations (id, title, is_pinned, created_at, updated_at) VALUES (?, ?, 0, ?, ?)',
    id,
    conversationTitle(firstMessage),
    now,
    now,
  );
  return id;
}

export async function appendMessages(conversationId: string, messages: ChatMessage[]) {
  if (!messages.length) return;
  const database = await db();
  await database.withTransactionAsync(async () => {
    for (const message of messages) {
      await database.runAsync(
        `INSERT OR REPLACE INTO chat_messages (id, conversation_id, role, kind, content, attachments, meta, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        message.id,
        conversationId,
        message.role,
        message.kind,
        message.content,
        message.attachments.length ? JSON.stringify(message.attachments) : null,
        message.plan ? JSON.stringify(message.plan) : null,
        message.createdAt,
      );
    }
    await database.runAsync('UPDATE conversations SET updated_at = ? WHERE id = ?', messages[messages.length - 1].createdAt, conversationId);
  });
}

/** A task preview was added or cancelled: its card in the chat says so. */
export async function updatePlanStatus(messageId: string, plan: PlanMeta) {
  await (await db()).runAsync('UPDATE chat_messages SET meta = ? WHERE id = ?', JSON.stringify(plan), messageId);
}

/** Newest first. A search looks in titles and in every message. */
export async function listConversations(query = ''): Promise<Conversation[]> {
  const term = query.trim();
  const like = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const rows = await (await db()).getAllAsync<ConversationRow>(`
    SELECT c.id, c.title, c.is_pinned, c.created_at, c.updated_at,
      (SELECT m.content FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS preview,
      (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id) AS message_count
    FROM conversations c
    ${term ? `WHERE c.title LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM chat_messages m WHERE m.conversation_id = c.id AND m.content LIKE ? ESCAPE '\\')` : ''}
    ORDER BY c.is_pinned DESC, c.updated_at DESC
  `, ...(term ? [like, like] : []));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    isPinned: Boolean(row.is_pinned),
    preview: row.preview ?? '',
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function parse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function loadConversation(id: string): Promise<ChatMessage[]> {
  const rows = await (await db()).getAllAsync<MessageRow>(
    'SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at, rowid',
    id,
  );
  return rows.map((row) => ({
    id: row.id,
    role: row.role === 'user' ? 'user' : 'assistant',
    kind: row.kind === 'plan' ? 'plan' : 'text',
    content: row.content,
    attachments: parse<ChatAttachment[]>(row.attachments, []),
    plan: row.kind === 'plan' ? parse<PlanMeta | undefined>(row.meta, undefined) : undefined,
    createdAt: row.created_at,
  }));
}

export async function getConversation(id: string) {
  return (await db()).getFirstAsync<{ id: string; title: string; is_pinned: number }>('SELECT id, title, is_pinned FROM conversations WHERE id = ?', id);
}

export async function renameConversation(id: string, title: string) {
  await (await db()).runAsync('UPDATE conversations SET title = ? WHERE id = ?', conversationTitle(title), id);
}

export async function pinConversation(id: string, pinned: boolean) {
  await (await db()).runAsync('UPDATE conversations SET is_pinned = ? WHERE id = ?', pinned ? 1 : 0, id);
}

function deleteFiles(rows: { attachments: string | null }[]) {
  for (const row of rows) {
    for (const attachment of parse<ChatAttachment[]>(row.attachments, [])) {
      if (!attachment.uri.includes('chat-media')) continue;
      try {
        new File(attachment.uri).delete();
      } catch {
        // Already gone.
      }
    }
  }
}

export async function deleteConversation(id: string) {
  const database = await db();
  const files = await database.getAllAsync<{ attachments: string | null }>(
    'SELECT attachments FROM chat_messages WHERE conversation_id = ? AND attachments IS NOT NULL',
    id,
  );
  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM chat_messages WHERE conversation_id = ?', id);
    await database.runAsync('DELETE FROM conversations WHERE id = ?', id);
  });
  deleteFiles(files);
}

export async function deleteAllConversations() {
  const database = await db();
  const files = await database.getAllAsync<{ attachments: string | null }>('SELECT attachments FROM chat_messages WHERE attachments IS NOT NULL');
  await database.execAsync('DELETE FROM chat_messages; DELETE FROM conversations;');
  deleteFiles(files);
}

/** Removes chats not used within the kept period (pinned chats stay). Returns how many went. */
export async function cleanupConversations(retention: Retention): Promise<number> {
  const cutoff = retentionCutoff(retention);
  if (!cutoff) return 0;
  const database = await db();
  const old = await database.getAllAsync<{ id: string }>('SELECT id FROM conversations WHERE is_pinned = 0 AND updated_at < ?', cutoff);
  for (const { id } of old) await deleteConversation(id);
  return old.length;
}

export async function getRetention(): Promise<Retention> {
  try {
    const value = Platform.OS === 'web'
      ? (typeof localStorage === 'undefined' ? null : localStorage.getItem(RETENTION_KEY))
      : await SecureStore.getItemAsync(RETENTION_KEY);
    return value === '30' || value === '90' ? value : 'forever';
  } catch {
    return 'forever';
  }
}

export async function setRetention(value: Retention) {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(RETENTION_KEY, value);
  } else {
    await SecureStore.setItemAsync(RETENTION_KEY, value);
  }
  await cleanupConversations(value);
}

export function newMessage(role: ChatMessage['role'], content: string, extra: Partial<Pick<ChatMessage, 'attachments' | 'plan' | 'kind'>> = {}): ChatMessage {
  return {
    id: Crypto.randomUUID(),
    role,
    kind: extra.kind ?? (extra.plan ? 'plan' : 'text'),
    content,
    attachments: extra.attachments ?? [],
    plan: extra.plan,
    createdAt: new Date().toISOString(),
  };
}

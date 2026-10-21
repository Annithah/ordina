/** ORDINA AI chat history: grouping, titles, retention and the context sent to the AI. Pure. */

export type ConversationSummary = { id: string; title: string; isPinned: boolean; updatedAt: string };

export type ConversationGroupId = 'pinned' | 'today' | 'yesterday' | 'week' | 'older';

export type Retention = 'forever' | '30' | '90';

export const RETENTION_OPTIONS: Retention[] = ['forever', '30', '90'];

/** How many earlier messages of the open chat go to the AI with a new request. */
export const CONTEXT_MESSAGES = 10;

const TITLE_LENGTH = 60;

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysBetween(from: Date, to: Date) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Pinned first, then Today / Yesterday / Previous 7 days / Older, newest first in each. */
export function groupConversations<T extends ConversationSummary>(list: T[], now = new Date()): { id: ConversationGroupId; items: T[] }[] {
  const groups = new Map<ConversationGroupId, T[]>([['pinned', []], ['today', []], ['yesterday', []], ['week', []], ['older', []]]);
  const sorted = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const item of sorted) {
    if (item.isPinned) {
      groups.get('pinned')!.push(item);
      continue;
    }
    const updated = new Date(item.updatedAt);
    const days = dayKey(updated) === dayKey(now) ? 0 : daysBetween(updated, now);
    const id: ConversationGroupId = days <= 0 ? 'today' : days === 1 ? 'yesterday' : days <= 7 ? 'week' : 'older';
    groups.get(id)!.push(item);
  }
  return [...groups.entries()].filter(([, items]) => items.length).map(([id, items]) => ({ id, items }));
}

/** The first message, on one line and shortened: the chat's name until the user renames it. */
export function conversationTitle(text: string, fallback = 'New chat') {
  const line = text.replace(/\s+/g, ' ').trim();
  if (!line) return fallback;
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : line;
}

/** Chats last used before this moment are removed (pinned chats are kept). Null keeps everything. */
export function retentionCutoff(retention: Retention, now = new Date()): string | null {
  if (retention === 'forever') return null;
  return new Date(now.getTime() - Number(retention) * 86_400_000).toISOString();
}

type ContextMessage = { role: 'user' | 'assistant'; content: string; kind?: string };

/**
 * The open chat's last messages for the AI: only this conversation, never older chats,
 * each shortened. Plan cards are sent as their one-line summary.
 */
export function contextWindow(messages: ContextMessage[], size = CONTEXT_MESSAGES): { role: 'user' | 'assistant'; content: string }[] {
  return messages
    .filter((message) => message.content.trim())
    .slice(-size)
    .map((message) => ({ role: message.role, content: message.content.slice(0, 600) }));
}

/**
 * ORDINA AI chat assistant, on the phone: photos and files -> tasks (or an answer), and the
 * replies the user taps under such an answer. Builds the Gemini prompt and checks the result
 * against the user's tasks (no overlaps, contact links).
 * Ported from backend-ordina/src/lib/ai.js and schedule.js; keep them in step.
 */
import type { AttachmentKind } from '../attachments.ts';
import type { GeminiPart } from './media.ts';

export const ASSISTANT_PROMPT = `You are ORDINA, an action-oriented personal productivity assistant.
Return ONLY valid JSON with this shape:
{
  "intent": "create_tasks" | "reschedule" | "recommend_now" | "overwhelm" | "clarify" | "answer" | "conflict" | "arrival_reminder",
  "message": "short user-facing summary",
  "tasks": [{ "title": "", "description": "", "date": "YYYY-MM-DD", "startTime": "HH:MM", "durationMinutes": 60, "priority": "low|medium|high", "reminder": false, "projectName": "", "category": "work|meetings|projects|emails|study|classes|assignments|exams|reading|personal|errands|home|hobbies|health|exercise|medical|nutrition|family|calls|events|finance|bills|savings|shopping|spiritual|prayer|worship|other", "contactName": "", "contactPhone": "" }],
  "arrivalReminders": [{ "title": "", "placeName": "home|work|named place" }],
  "reschedule": { "taskId": "", "titleHint": "", "date": "YYYY-MM-DD", "startTime": "HH:MM" },
  "clarification": "",
  "suggestedReplies": ["short tappable answers, max 4"]
}
Rules:
- Extract EVERY activity in the instruction as a separate task.
- If the user asks to be reminded when they arrive/get to a place, use intent arrival_reminder and fill arrivalReminders. Do not invent coordinates.
- Resolve relative dates using today and timezone.
- If a requested time conflicts with existingTasks, set intent to conflict and propose a different startTime.
- For reschedule, identify the best matching existing task id from existingTasks.
- Order the day sensibly: high-priority and deadline work first, no overlaps, realistic durations, short breaks between long blocks.
- If a task is about calling, texting, messaging, emailing or meeting a person in matchingContacts, set contactName and contactPhone from that contact exactly. Never invent phone numbers.
- Set reminder to true for anything with a specific time, a call, a meeting, or a deadline.
- Never invent other users' data.
- If the request is unclear, intent=clarify.
Conversation rules (be a helpful, interactive assistant, not a form):
- "conversation" holds the recent chat. If your previous message asked a question, the new instruction is the ANSWER: merge it with the original request and finish that request. Never ask the same thing twice.
- Before creating a task for an activity that happens at a specific moment or place (going somewhere, school, work shift, appointment, meeting, trip, class, event, call), make sure you know the DAY and START TIME. If either is missing, set intent=clarify, tasks=[], and ask ONE short friendly question in "message" (also copy it to "clarification").
- For going somewhere / being away (school, office, trip, visit, gym), also ask when they will be back if not given, in the same question, e.g. "Sure! What time do you leave for school, and when will you be back?" Use the return time to set durationMinutes.
- Small to-dos without a natural time (buy milk, read a chapter) can be created without asking; pick a sensible slot.
- If the user says "you decide", "any time", "no time" or similar, stop asking and choose sensible times.
- Ask at most 2 follow-up questions in a row; after that, make sensible assumptions and say what you assumed.
- Always give 2-4 "suggestedReplies" the user can tap, written from the user's point of view (e.g. "Tomorrow at 7:30am, back at 4pm", "Every weekday 8am–3pm", "You decide").
- If the user asks a general question that is not about planning, use intent=answer, reply briefly in "message", and set tasks=[].
- Only include tasks when you are actually ready to create them.
- When you return tasks, the app shows a Confirm button, so suggestedReplies must offer CHANGES (e.g. "Make it 30 min earlier", "Add a reminder", "Move it to Friday"), never confirmations like "Looks good" or "Yes".`;

export type ScheduledTask = {
  id?: string;
  title: string;
  description?: string;
  dueDate?: string;
  startTime?: string;
  duration?: string;
  priority?: string | number;
  completed?: boolean;
  status?: string;
};
export type Contact = { name: string; phone?: string };
export type ChatTurn = { role: 'user' | 'assistant'; content: string };

function minutesFromTime(value?: string | null) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function timeFromMinutes(total: number) {
  const clamped = Math.max(0, Math.min(23 * 60 + 30, total));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

export function durationMinutes(text?: string | null) {
  if (!text) return 60;
  const hours = /(\d+)\s*h/.exec(text);
  const mins = /(\d+)\s*m/.exec(text);
  return (hours ? Number(hours[1]) * 60 : 0) + (mins ? Number(mins[1]) : hours ? 0 : 60);
}

export function detectConflicts(existing: ScheduledTask[], candidate: { dueDate?: string; startTime?: string; durationMinutes?: number }) {
  const date = candidate.dueDate;
  const start = minutesFromTime(candidate.startTime);
  if (!date || start == null) return [];
  const end = start + (candidate.durationMinutes || 60);
  return existing.filter((task) => {
    if (task.completed || task.status === 'completed') return false;
    if (task.dueDate !== date) return false;
    const otherStart = minutesFromTime(task.startTime);
    if (otherStart == null) return false;
    const otherEnd = otherStart + durationMinutes(task.duration);
    return start < otherEnd && otherStart < end;
  });
}

export function findOpenSlot(existing: ScheduledTask[], dueDate: string, need = 60) {
  const busy = existing
    .filter((task) => task.dueDate === dueDate && !task.completed && minutesFromTime(task.startTime) != null)
    .map((task) => {
      const start = minutesFromTime(task.startTime)!;
      return { start, end: start + durationMinutes(task.duration) };
    })
    .sort((a, b) => a.start - b.start);
  let cursor = 8 * 60;
  while (cursor + need <= 20 * 60) {
    const hit = busy.find((block) => cursor < block.end && block.start < cursor + need);
    if (!hit) return timeFromMinutes(cursor);
    cursor = hit.end;
  }
  return timeFromMinutes(18 * 60);
}

function localDay(now: Date) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const isHigh = (task: ScheduledTask) => task.priority === 'high' || task.priority === 3;
const isMedium = (task: ScheduledTask) => task.priority === 'medium' || task.priority === 2;

export function recommendNow(tasks: ScheduledTask[], now = new Date()) {
  const today = localDay(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const scored = tasks
    .filter((task) => !task.completed && task.status !== 'archived')
    .map((task) => {
      let score = isHigh(task) ? 30 : isMedium(task) ? 15 : 5;
      if (task.dueDate === today) score += 25;
      if (task.dueDate && task.dueDate < today) score += 40;
      const start = minutesFromTime(task.startTime);
      if (start != null && Math.abs(start - minutes) <= 45) score += 20;
      return { task, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.task || null;
}

export function overwhelmPlan(tasks: ScheduledTask[], now = new Date()) {
  const open = tasks.filter((task) => !task.completed);
  const high = open.filter((task) => isHigh(task) || (task.dueDate && task.dueDate <= localDay(now)));
  const wait = open.filter((task) => !high.includes(task) && isMedium(task));
  const optional = open.filter((task) => !high.includes(task) && !wait.includes(task));
  return {
    highPriority: high.slice(0, 5),
    canWait: wait.slice(0, 8),
    optional: optional.slice(0, 8),
    suggestedPlan: high.slice(0, 3).map((task) => task.title),
  };
}

const COMMUNICATION_WORDS = /\b(call|phone|ring|text|message|sms|whatsapp|email|e-mail|meet|meeting|catch up)\b/i;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Links tasks such as "Call John" to a matching phone contact so the app can offer Call/Message. */
export function attachContacts(tasks: any[], contacts?: Contact[]) {
  const list = Array.isArray(contacts) ? contacts.filter((item) => item && item.name) : [];
  if (!list.length) return tasks;
  return tasks.map((task) => {
    const named = task.contactName
      ? list.find((item) => item.name.toLowerCase() === String(task.contactName).toLowerCase())
      : null;
    if (named) return { ...task, contactName: named.name, contactPhone: named.phone || undefined };
    if (task.contactName) return { ...task, contactPhone: undefined };
    const text = `${task.title || ''} ${task.description || ''}`.toLowerCase();
    if (!COMMUNICATION_WORDS.test(text)) return task;
    const match = list.find((item) => item.name
      .toLowerCase()
      .split(/\s+/)
      .some((part) => part.length > 2 && new RegExp(`\\b${escapeRegExp(part)}\\b`).test(text)));
    if (!match) return task;
    return { ...task, contactName: match.name, contactPhone: match.phone || undefined, reminder: true };
  });
}

/** Drops empty placeholder fields the model sometimes returns (e.g. a blank reschedule object). */
export function cleanResult(parsed: any) {
  const result = { ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  const r = result.reschedule;
  if (!r || !(r.taskId || r.titleHint) || !r.date) delete result.reschedule;
  if (!Array.isArray(result.arrivalReminders) || !result.arrivalReminders.length) delete result.arrivalReminders;
  if (!result.clarification) delete result.clarification;
  if (result.intent === 'clarify' || result.intent === 'answer') result.tasks = [];
  if (Array.isArray(result.suggestedReplies)) {
    result.suggestedReplies = result.suggestedReplies
      .map((item: unknown) => String(item || '').trim())
      .filter(Boolean)
      // Saving happens with the Confirm button; a "Looks good" chip would just start a new message.
      .filter((item: string) => !(result.tasks?.length && /^(looks good|ok(ay)?|yes|confirm|perfect|great|save( it)?|sounds good)/i.test(item)))
      .slice(0, 4);
    if (!result.suggestedReplies.length) delete result.suggestedReplies;
  } else {
    delete result.suggestedReplies;
  }
  result.tasks = (Array.isArray(result.tasks) ? result.tasks : [])
    .filter((task: any) => task && String(task.title || '').trim())
    .map((task: any) => {
      const next = { ...task };
      for (const key of ['contactName', 'contactPhone', 'projectName', 'description']) {
        if (!next[key]) delete next[key];
      }
      return next;
    });
  return result;
}

/** Moves proposed tasks that clash with the user's tasks (or each other) to a free time. */
export function applyScheduleGuards(rawParsed: any, existing: ScheduledTask[]) {
  const parsed = cleanResult(rawParsed);
  const scheduled = [...(existing || [])];
  const guarded = parsed.tasks.map((task: any) => {
    const minutes = Number(task.durationMinutes) || 60;
    const conflicts = detectConflicts(scheduled, { dueDate: task.date, startTime: task.startTime, durationMinutes: minutes });
    let startTime = task.startTime;
    let conflictsWith: string[] | undefined;
    let suggestedStartTime: string | undefined;
    if (conflicts.length && startTime) {
      const slot = findOpenSlot(scheduled, task.date, minutes);
      suggestedStartTime = slot;
      conflictsWith = conflicts.map((item) => item.title);
      startTime = slot;
    } else if (!startTime && task.date) {
      startTime = findOpenSlot(scheduled, task.date, minutes);
    }
    const next = { ...task, durationMinutes: minutes, startTime, suggestedStartTime, conflictsWith };
    scheduled.push({ title: next.title, dueDate: next.date, startTime: next.startTime, duration: `${Math.floor(minutes / 60)}h ${minutes % 60}m`, completed: false });
    return next;
  });
  const clashing = guarded.filter((task: any) => task.conflictsWith?.length);
  return {
    ...parsed,
    message: clashing.length
      ? clashing.map((task: any) => `${task.conflictsWith.join(', ')} conflicted with the requested time; proposed ${task.startTime}`).join(' ')
      : parsed.message,
    intent: clashing.length ? 'conflict' : parsed.intent || (guarded.length ? 'create_tasks' : parsed.intent),
    tasks: guarded,
  };
}

/** Answers that need no AI call: they only read the user's own tasks. */
export function quickAnswer(message: string, tasks: ScheduledTask[]) {
  const lower = message.toLowerCase();
  if (/what should i do now/.test(lower)) {
    const task = recommendNow(tasks);
    return { intent: 'recommend_now', message: task ? `Do this next: ${task.title}` : 'You have no open tasks right now.', recommendation: task, tasks: [] };
  }
  if (/overwhelmed/.test(lower)) {
    return { intent: 'overwhelm', message: 'Here is a calmer plan for what matters now.', plan: overwhelmPlan(tasks), tasks: [] };
  }
  return null;
}

/** Gemini's intent -> what the app shows (recommend / overwhelm come from the user's own tasks). */
export function finishInterpret(parsed: any, existingTasks: ScheduledTask[], contacts?: Contact[]) {
  if (parsed?.intent === 'recommend_now') return quickAnswer('what should i do now', existingTasks)!;
  if (parsed?.intent === 'overwhelm') return quickAnswer('overwhelmed', existingTasks)!;
  const guarded = applyScheduleGuards(parsed, existingTasks);
  guarded.tasks = attachContacts(guarded.tasks, contacts);
  return guarded;
}

export function interpretPrompt({ message, today, timezone, conversation, existingTasks, contacts }: {
  message: string;
  today: string;
  timezone: string;
  conversation?: ChatTurn[];
  existingTasks: ScheduledTask[];
  contacts?: Contact[];
}) {
  return `${ASSISTANT_PROMPT}\n\n${JSON.stringify({
    today,
    timezone: timezone || 'UTC',
    instruction: message,
    conversation: (conversation || []).slice(-10).map((item) => ({ role: item.role, content: item.content })),
    existingTasks: existingTasks.slice(0, 80),
    matchingContacts: (contacts || []).slice(0, 8),
  })}`;
}

const KIND_LABEL: Record<AttachmentKind, string> = { image: 'photo', video: 'video', pdf: 'PDF', docx: 'Word document', text: 'text file' };

/** Gemini contents for up to 5 attached files: the instruction first, then the files themselves. */
export function filesContents({ parts, kinds, names = [], note, today, timezone, existingTasks, conversation }: {
  parts: GeminiPart[];
  kinds: AttachmentKind[];
  names?: string[];
  note?: string;
  today: string;
  timezone: string;
  existingTasks: ScheduledTask[];
  conversation?: ChatTurn[];
}) {
  const described = kinds.map((kind, index) => `${KIND_LABEL[kind] || 'file'}${names[index] ? ` "${String(names[index]).slice(0, 80)}"` : ''}`).join(', ');
  const several = kinds.length > 1;
  const instruction = `The user attached ${several ? `${kinds.length} files` : 'a file'}: ${described}. Read ${several ? 'all of them' : 'it'} carefully: `
    + 'handwritten to-do lists, whiteboards, screenshots, timetables, exam schedules, event posters, assignments, project plans and meeting notes. '
    + 'Extract every task, appointment, deadline and plan with the right dates and times (resolve them from "today"). '
    + 'For documents, put a two or three sentence summary in "message".';
  const instructionNote = note ? String(note).slice(0, 500) : '';
  const guidance = instructionNote
    ? `The user's instruction is: "${instructionNote}". Follow it exactly. Only create tasks if it asks you to plan, schedule, remind or create tasks; if it asks a question, answer it with intent=answer. Ask a short follow-up (intent=clarify) if a needed day or time is missing.`
    : 'The user sent the file(s) WITHOUT any text. Create the tasks you find (intent=create_tasks) and summarise what the file is in "message". If nothing can be planned, use intent=answer and describe it in one or two sentences.';
  const context = JSON.stringify({
    today,
    timezone: timezone || 'UTC',
    existingTasks: existingTasks.slice(0, 60),
    conversation: (conversation || []).slice(-10),
  });
  return [{ role: 'user', parts: [{ text: `${ASSISTANT_PROMPT}\n\n${instruction}\n${guidance}\n${context}` }, ...parts] }];
}

/** Files answer -> what the app shows. Nothing found becomes a short answer, not an empty plan. */
export function finishFiles(parsed: any, kinds: AttachmentKind[], existingTasks: ScheduledTask[]) {
  const result = parsed && typeof parsed === 'object' ? { ...parsed } : {};
  if (!result.tasks?.length && result.intent !== 'clarify' && result.intent !== 'answer') {
    const several = kinds.length > 1;
    result.intent = 'answer';
    result.message = result.message || `I could not find tasks in ${several ? 'these files' : 'that file'}. Tell me what you would like me to do with ${several ? 'them' : 'it'}.`;
    result.tasks = [];
  }
  return applyScheduleGuards(result, existingTasks);
}

export const TRANSCRIBE_PROMPT = 'Transcribe the speech in this audio exactly, in the language spoken. Return only the spoken words. If there is no clear speech, return an empty response. Never invent words.';

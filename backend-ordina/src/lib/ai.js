const { geminiText } = require('./gemini');
const { detectConflicts, findOpenSlot, recommendNow, overwhelmPlan, planDay, durationMinutes, toDateKey, addDays } = require('./schedule');

const SYSTEM_PROMPT = `You are ORDINA, an action-oriented personal productivity assistant.
Return ONLY valid JSON with this shape:
{
  "intent": "create_tasks" | "reschedule" | "recommend_now" | "overwhelm" | "clarify" | "answer" | "conflict" | "arrival_reminder",
  "message": "short user-facing summary",
  "tasks": [{ "title": "", "description": "", "date": "YYYY-MM-DD", "startTime": "HH:MM", "durationMinutes": 60, "priority": "low|medium|high", "reminder": false, "projectName": "", "category": "work|personal|health|learning", "contactName": "", "contactPhone": "" }],
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

function parseJsonText(text) {
  const trimmed = String(text || '{}').replace(/```json|```/g, '').trim();
  return JSON.parse(trimmed);
}

async function callGemini(contents, responseMimeType = 'application/json') {
  const text = await geminiText(contents, { temperature: 0.2, responseMimeType });
  try {
    return parseJsonText(text || '{}');
  } catch {
    const error = new Error('ORDINA returned invalid structured output');
    error.status = 502;
    throw error;
  }
}

function nextWeekday(from, weekday, timeZone) {
  const date = new Date(from);
  const current = date.getDay();
  let delta = (weekday - current + 7) % 7;
  if (delta === 0) delta = 7;
  date.setDate(date.getDate() + delta);
  return toDateKey(date, timeZone);
}

function resolveDate(text, now, timeZone) {
  const lower = text.toLowerCase();
  if (/\btomorrow\b/.test(lower)) return addDays(toDateKey(now, timeZone), 1);
  if (/\btoday\b/.test(lower)) return toDateKey(now, timeZone);
  if (/\bnext monday\b/.test(lower)) return nextWeekday(now, 1, timeZone);
  if (/\bnext tuesday\b/.test(lower)) return nextWeekday(now, 2, timeZone);
  if (/\bnext wednesday\b/.test(lower)) return nextWeekday(now, 3, timeZone);
  if (/\bnext thursday\b/.test(lower)) return nextWeekday(now, 4, timeZone);
  if (/\bnext friday\b/.test(lower)) return nextWeekday(now, 5, timeZone);
  if (/\bnext saturday\b/.test(lower)) return nextWeekday(now, 6, timeZone);
  if (/\bnext sunday\b/.test(lower)) return nextWeekday(now, 0, timeZone);
  const plainDay = lower.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (plainDay) {
    const target = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(plainDay[1]);
    return nextWeekday(now, target, timeZone);
  }
  const iso = lower.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  return toDateKey(now, timeZone);
}

function resolvePeriodTime(text) {
  const lower = text.toLowerCase();
  if (/\bmorning\b/.test(lower)) return '09:00';
  if (/\bafternoon\b/.test(lower)) return '14:00';
  if (/\bevening\b/.test(lower)) return '18:00';
  if (/\bnight\b/.test(lower)) return '20:00';
  return undefined;
}

function parseClock(text) {
  const timeMatch = String(text).match(/(?:at|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
    || String(text).match(/\b(\d{1,2})(?::(\d{2}))\s*(am|pm)\b/i)
    || String(text).match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (!timeMatch) return resolvePeriodTime(text);
  let hour = Number(timeMatch[1]);
  const minute = timeMatch[2] || '00';
  const period = (timeMatch[3] || timeMatch[timeMatch.length - 1] || '').toLowerCase();
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  if (!period && hour <= 7) hour += 12;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function parseDuration(text) {
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  const durationMatch = String(text).match(/(?:for|of)\s+(\d+|one|two|three|four|five|six|seven|eight)\s*(hour|hours|hr|hrs|minute|minutes|min|mins)/i)
    || String(text).match(/\b(\d+|one|two|three|four|five|six|seven|eight)\s*(hour|hours|hr|hrs)\b/i);
  if (!durationMatch) return 60;
  const amount = words[durationMatch[1].toLowerCase()] || Number(durationMatch[1]);
  return /hour|hr/i.test(durationMatch[2]) ? amount * 60 : amount;
}

const RETURN_TIME = /\b(?:back|return|returning|until|till)\s+(?:home\s+)?(?:at|by|around)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;

function parseReturnMinutes(text) {
  const match = String(text).match(RETURN_TIME);
  if (!match) return null;
  let hour = Number(match[1]);
  const period = (match[3] || '').toLowerCase();
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  if (!period && hour <= 7) hour += 12;
  return hour * 60 + Number(match[2] || 0);
}

function cleanTitle(text) {
  return String(text)
    .replace(RETURN_TIME, '')
    .replace(/\b(?:on\s+)?(?:this\s+|in the\s+)?(morning|afternoon|evening|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\b(please|i need to|i want to|i have to|remind me to|remind me|create a task to|create task to|add a task to|schedule|tomorrow|today|this (morning|afternoon|evening)|next (monday|tuesday|wednesday|thursday|friday)|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|for\s+\d+\s*(?:hours?|hrs?|minutes?|mins?)|in the (morning|afternoon|evening))\b/gi, '')
    .replace(/^i need to\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,.:;\s]+|[,.:;\s]+$/g, '') || String(text).trim();
}

function splitActivities(message) {
  let body = String(message || '').trim();
  body = body.replace(/^(tomorrow|today|next \w+|this (morning|afternoon|evening))\s*[:\-]\s*/i, '');
  body = body.replace(/^(i need to|i want to|please)\s+/i, '');
  return body
    // Split separate activities, but keep details such as ", back at 4pm" or ", tomorrow" with their activity.
    .split(/\n+|;\s*|\s+and\s+(?!back\b|return)|,\s+(?!(?:back|return|returning|until|till|at|by|on|tomorrow|today|tonight|this|next|in the|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)(?=[a-z])/i)
    .map((part) => part.replace(/^[-*•\d.)]+\s*/, '').replace(/^and\s+/i, '').trim())
    .filter((part) => part.length > 2 && !/^(tomorrow|today|please)$/i.test(part));
}

function localTaskFromInstruction(message, now, timeZone) {
  const date = resolveDate(message, now, timeZone);
  const startTime = parseClock(String(message).replace(RETURN_TIME, ''));
  let durationMinutesValue = parseDuration(message);
  const back = parseReturnMinutes(message);
  if (back !== null && startTime) {
    const [h, m] = startTime.split(':').map(Number);
    const span = back - (h * 60 + m);
    if (span > 0) durationMinutesValue = span;
  }
  const lower = String(message).toLowerCase();
  const priority = lower.includes('high priority') || lower.includes('urgent') ? 'high' : lower.includes('low priority') ? 'low' : 'medium';
  const title = cleanTitle(message);
  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    date,
    startTime,
    durationMinutes: durationMinutesValue,
    priority,
    reminder: /\bremind/.test(lower),
  };
}

const COMMUNICATION_WORDS = /\b(call|phone|ring|text|message|sms|whatsapp|email|e-mail|meet|meeting|catch up)\b/i;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Links tasks such as "Call John" to a matching phone contact so the app can offer Call/Message. */
function attachContacts(tasks, contacts) {
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

function minutesNow(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === 'hour')?.value) % 24;
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    return hour * 60 + minute;
  } catch {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }
}

function dailyPlan(existingTasks, timezone) {
  const today = toDateKey(new Date(), timezone);
  // Only the user's own tasks can be moved; calendar events stay fixed.
  const { planned, fixed } = planDay(existingTasks || [], today, minutesNow(timezone));
  const tasks = planned.filter((task) => task.id);
  const later = tasks.filter((task) => task.date !== today).length;
  const todayCount = tasks.length - later;
  let message;
  if (!tasks.length && !fixed.length) {
    message = 'Your day is clear. Tell me what you need to get done and I will schedule it.';
  } else if (!tasks.length) {
    message = `Your day is already organized: ${fixed.length} scheduled item${fixed.length === 1 ? '' : 's'} ahead. Nothing needs moving.`;
  } else {
    message = `Here is your plan for today: ${todayCount} task${todayCount === 1 ? '' : 's'} slotted into your free time${fixed.length ? ` around ${fixed.length} fixed commitment${fixed.length === 1 ? '' : 's'}` : ''}.${later ? ` ${later} did not fit and moved to tomorrow.` : ''} Review and confirm.`;
  }
  return { intent: 'plan_day', message, tasks, fixed };
}

function matchExistingTask(existingTasks, hint) {
  const needle = String(hint || '').toLowerCase().trim();
  if (!needle) return null;
  return (existingTasks || []).find((task) => !task.completed && String(task.title || '').toLowerCase().includes(needle))
    || (existingTasks || []).find((task) => String(task.title || '').toLowerCase().includes(needle));
}

function localReschedule(message, existingTasks, now, timeZone) {
  const lower = String(message).toLowerCase();
  if (!/\b(move|reschedule|postpone|push)\b/.test(lower)) return null;
  const hintMatch = lower.match(/\b(?:move|reschedule|postpone|push)\s+(?:my\s+)?(.+?)\s+to\b/i);
  const titleHint = (hintMatch?.[1] || '').replace(/\b(the|a|an)\b/g, '').trim();
  const matched = matchExistingTask(existingTasks, titleHint);
  if (!matched) {
    return {
      intent: 'clarify',
      message: `I could not find a task matching “${titleHint || 'that'}”. Name the task you want to move.`,
      tasks: [],
      clarification: 'Tell me the task title and the new day or time.',
    };
  }
  const date = resolveDate(message, now, timeZone);
  const startTime = parseClock(message) || matched.startTime || findOpenSlot(existingTasks, date, durationMinutes(matched.duration));
  return applyScheduleGuards({
    intent: 'reschedule',
    message: `Move “${matched.title}” to ${date}${startTime ? ` at ${startTime}` : ''}. Confirm to save.`,
    tasks: [],
    reschedule: { taskId: matched.id, titleHint: matched.title, date, startTime },
  }, existingTasks);
}

function localInterpret(message, existingTasks, timeZone) {
  const now = new Date();
  const lower = String(message || '').toLowerCase();
  if (/\b(plan|organize)\s+(my|the)\s+week\b/.test(lower)) {
    const open = (existingTasks || []).filter((task) => task.id && !task.completed && task.status !== 'archived').slice(0, 7);
    return {
      intent: 'create_tasks',
      message: open.length
        ? `I found ${open.length} open task${open.length === 1 ? '' : 's'} to organize. Review the proposed schedule before saving.`
        : 'You have no open tasks to organize this week. Tell me what you want to plan.',
      tasks: open.map((task, index) => ({
        id: task.id,
        title: task.title,
        description: task.description || '',
        date: task.dueDate || addDays(toDateKey(now, timeZone), index + 1),
        startTime: task.startTime || findOpenSlot(existingTasks || [], task.dueDate || addDays(toDateKey(now, timeZone), index + 1), durationMinutes(task.duration)),
        durationMinutes: durationMinutes(task.duration),
        priority: typeof task.priority === 'number' ? (task.priority >= 3 ? 'high' : task.priority === 2 ? 'medium' : 'low') : task.priority || 'medium',
        reminder: Boolean(task.reminder),
      })),
    };
  }
  if (/\b(hello|hi|help|what can you do|capabilities)\b/.test(lower) && splitActivities(message).length <= 1) {
    return {
      intent: 'clarify',
      message: 'I can create tasks, organize your week, find your next priority, explain an overwhelmed plan, and suggest a new time when tasks conflict.',
      tasks: [],
      clarification: 'Tell me the activity, date, time, duration, or priority you want to organize.',
    };
  }
  const reschedule = localReschedule(message, existingTasks, now, timeZone);
  if (reschedule) return reschedule;

  if (/\b(when i arrive|when i get to|when i get home|when i get to work|remind me when i arrive|remind me when i get)\b/.test(lower)) {
    let placeName = 'saved place';
    const atMatch = lower.match(/\b(?:arrive(?:\s+at)?|get to|get)\s+(?:at\s+)?(.+)$/);
    if (/\bhome\b/.test(lower)) placeName = 'home';
    else if (/\bwork\b/.test(lower) || /\boffice\b/.test(lower)) placeName = 'work';
    else if (atMatch?.[1]) {
      placeName = atMatch[1].replace(/[.!?].*$/, '').replace(/\b(please|tomorrow|today)\b/g, '').trim() || placeName;
    }
    const title = `When you arrive at ${placeName}`;
    return {
      intent: 'arrival_reminder',
      message: `I will remind you when you arrive at ${placeName}. Save that place in Integrations if you have not already, then confirm.`,
      tasks: [],
      arrivalReminders: [{ title, placeName }],
    };
  }

  const sharedDate = resolveDate(message, now, timeZone);
  const parts = splitActivities(message);
  const hasWhen = /\b(today|tomorrow|tonight|morning|afternoon|evening|night|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(:\d{2})?\s*(am|pm)|at\s+\d{1,2}|20\d{2}-\d{2}-\d{2}|any ?time|you decide|whenever|no (specific )?time)\b/i.test(message);
  const isOuting = /\b(go|going|went|head|heading|travel|visit|attend|school|class|office|work shift|trip|gym|church|hospital|appointment|meeting|interview)\b/i.test(message);
  if (parts.length <= 1 && !hasWhen) {
    const activity = cleanTitle(message).replace(/^(i want to|i need to|i have to|i'm going to|im going to)\s+/i, '');
    const startsWithVerb = /^(go|head|travel|visit|attend|take|have|do|make|call|meet|see|pick|drop|buy|read|write|finish|start|study|clean|cook|pay|send)\b/i.test(activity);
    const isEvent = /\b(appointment|meeting|interview|class|lecture|exam|event|party|wedding|service|session)\b/i.test(activity);
    let question;
    if (isOuting && startsWithVerb) question = `Sure! When do you want to ${activity.toLowerCase()}, and what time will you be back?`;
    else if (isEvent) question = `When is your ${activity.toLowerCase()}? Tell me the day and time, and how long it lasts if you know.`;
    else question = `Got it: “${activity}”. When would you like to do it?`;
    return {
      intent: 'clarify',
      message: question,
      clarification: question,
      tasks: [],
      pending: message,
      suggestedReplies: isOuting
        ? ['Tomorrow at 7:30am, back at 4pm', 'Today at 2pm, back at 5pm', 'You decide']
        : ['Today this afternoon', 'Tomorrow morning', 'You decide'],
    };
  }
  const tasks = (parts.length ? parts : [message]).map((part) => {
    const task = localTaskFromInstruction(part, now, timeZone);
    if (!/\b(today|tomorrow|next )\b/i.test(part)) task.date = sharedDate;
    return task;
  });
  const unique = [];
  for (const task of tasks) {
    if (!unique.some((item) => item.title.toLowerCase() === task.title.toLowerCase())) unique.push(task);
  }
  return applyScheduleGuards({
    intent: unique.length > 1 ? 'create_tasks' : 'create_tasks',
    message: unique.length > 1
      ? `I found ${unique.length} activities. Review them before saving.`
      : `I understood your request as “${unique[0]?.title}”${unique[0]?.date ? ` for ${unique[0].date}` : ''}${unique[0]?.startTime ? ` at ${unique[0].startTime}` : ''}. Review it before saving.`,
    tasks: unique,
  }, existingTasks || []);
}

/** Drops empty placeholder fields the model sometimes returns (e.g. a blank reschedule object). */
function cleanResult(parsed) {
  const result = { ...parsed };
  const r = result.reschedule;
  if (!r || !(r.taskId || r.titleHint) || !r.date) delete result.reschedule;
  if (!Array.isArray(result.arrivalReminders) || !result.arrivalReminders.length) delete result.arrivalReminders;
  if (!result.clarification) delete result.clarification;
  if (result.intent === 'clarify' || result.intent === 'answer') result.tasks = [];
  if (Array.isArray(result.suggestedReplies)) {
    result.suggestedReplies = result.suggestedReplies
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      // Saving happens with the Confirm button; a "Looks good" chip would just start a new message.
      .filter((item) => !(result.tasks?.length && /^(looks good|ok(ay)?|yes|confirm|perfect|great|save( it)?|sounds good)/i.test(item)))
      .slice(0, 4);
    if (!result.suggestedReplies.length) delete result.suggestedReplies;
  } else {
    delete result.suggestedReplies;
  }
  result.tasks = (Array.isArray(result.tasks) ? result.tasks : [])
    .filter((task) => task && String(task.title || '').trim())
    .map((task) => {
      const next = { ...task };
      for (const key of ['contactName', 'contactPhone', 'projectName', 'description']) {
        if (!next[key]) delete next[key];
      }
      return next;
    });
  return result;
}

function applyScheduleGuards(rawParsed, existing) {
  const parsed = cleanResult(rawParsed);
  const tasks = parsed.tasks;
  const scheduled = [...(existing || [])];
  const guarded = tasks.map((task) => {
    const durationMinutesValue = Number(task.durationMinutes) || 60;
    const conflicts = detectConflicts(scheduled, {
      dueDate: task.date,
      startTime: task.startTime,
      durationMinutes: durationMinutesValue,
    });
    let startTime = task.startTime;
    let conflictsWith;
    let suggestedStartTime;
    if (conflicts.length && startTime) {
      const slot = findOpenSlot(scheduled, task.date, durationMinutesValue);
      suggestedStartTime = slot;
      conflictsWith = conflicts.map((item) => item.title);
      startTime = slot;
    } else if (!startTime && task.date) {
      startTime = findOpenSlot(scheduled, task.date, durationMinutesValue);
    }
    const next = { ...task, durationMinutes: durationMinutesValue, startTime, suggestedStartTime, conflictsWith };
    scheduled.push({
      title: next.title,
      dueDate: next.date,
      startTime: next.startTime,
      duration: `${Math.round(durationMinutesValue / 60)}h ${durationMinutesValue % 60}m`,
      completed: false,
    });
    return next;
  });
  const hasConflict = guarded.some((task) => task.conflictsWith?.length);
  const conflictNote = hasConflict
    ? guarded
      .filter((task) => task.conflictsWith?.length)
      .map((task) => `${task.conflictsWith.join(', ')} conflicted with the requested time; proposed ${task.startTime}`)
      .join(' ')
    : parsed.message;
  return {
    ...parsed,
    message: hasConflict ? conflictNote : parsed.message,
    intent: hasConflict ? 'conflict' : parsed.intent || (guarded.length ? 'create_tasks' : parsed.intent),
    tasks: guarded,
  };
}

const PLAN_DAY = /\b(plan|organi[sz]e|schedule|sort out)\s+(my\s+|the\s+)?(day|today)\b|\bwhat(?:'s| is) my plan\b/;

/** If ORDINA just asked a question, treat the new message as the answer to it. */
function withPendingRequest(message, conversation) {
  const last = [...(conversation || [])].reverse().find((item) => item.role === 'assistant');
  if (!last?.actions || last.actions.intent !== 'clarify' || !last.actions.pending) return message;
  return `${last.actions.pending} ${message}`;
}

async function interpret({ message, timezone, existingTasks, contacts, conversation }) {
  const result = await interpretMessage({ message, timezone, existingTasks, contacts, conversation });
  if (Array.isArray(result.tasks)) result.tasks = attachContacts(result.tasks, contacts);
  return result;
}

async function interpretMessage({ message: rawMessage, timezone, existingTasks, contacts, conversation }) {
  const today = toDateKey(new Date(), timezone);
  const message = withPendingRequest(rawMessage, conversation);
  const lower = String(message || '').toLowerCase();
  if (PLAN_DAY.test(lower)) return dailyPlan(existingTasks, timezone);
  if (/what should i do now/.test(lower)) {
    const task = recommendNow(existingTasks || []);
    return {
      intent: 'recommend_now',
      message: task ? `Do this next: ${task.title}` : 'You have no open tasks right now.',
      recommendation: task,
      tasks: [],
    };
  }
  if (/overwhelmed/.test(lower)) {
    return {
      intent: 'overwhelm',
      message: 'Here is a calmer plan for what matters now.',
      plan: overwhelmPlan(existingTasks || []),
      tasks: [],
    };
  }
  if (!process.env.GEMINI_API_KEY) return localInterpret(message, existingTasks, timezone);
  try {
    const parsed = await callGemini([
      {
        role: 'user',
        parts: [{
          text: `${SYSTEM_PROMPT}\n\n${JSON.stringify({
            today,
            timezone: timezone || 'UTC',
            instruction: rawMessage,
            conversation: (conversation || []).slice(-10).map((item) => ({ role: item.role, content: item.content })),
            existingTasks: (existingTasks || []).slice(0, 80),
            matchingContacts: (contacts || []).slice(0, 8),
          })}`,
        }],
      },
    ]);

    if (parsed.intent === 'recommend_now') {
      const task = recommendNow(existingTasks || []);
      return {
        intent: 'recommend_now',
        message: task ? `Do this next: ${task.title}` : 'You have no open tasks right now.',
        recommendation: task,
        tasks: [],
      };
    }
    if (parsed.intent === 'overwhelm') {
      const plan = overwhelmPlan(existingTasks || []);
      return {
        intent: 'overwhelm',
        message: 'Here is a calmer plan for what matters now.',
        plan,
        tasks: [],
      };
    }
    const guarded = applyScheduleGuards(parsed, existingTasks || []);
    // Keep the original request so a follow-up answer can complete it even if Gemini is busy next time.
    if (guarded.intent === 'clarify') guarded.pending = message;
    return guarded;
  } catch (error) {
    const fallback = localInterpret(message, existingTasks, timezone);
    fallback.message = `${fallback.message} Gemini was unavailable, so ORDINA used its built-in planner.`;
    fallback.fallback = true;
    return fallback;
  }
}

async function interpretMedia({ media, mimeType, note, timezone, existingTasks }) {
  const today = toDateKey(new Date(), timezone);
  const isVideo = String(mimeType || '').startsWith('video/');
  const instruction = isVideo
    ? 'Watch this video (including anything said aloud and any text shown) and extract every task, appointment or plan the user mentions.'
    : 'Extract tasks from this photo (whiteboard, screenshot, handwritten list, flyer, invitation, or note).';
  const instructionNote = note ? String(note).slice(0, 500) : '';
  const guidance = instructionNote
    ? `The user's instruction about this ${isVideo ? 'video' : 'image'} is: "${instructionNote}". Follow it exactly. Only create tasks if the instruction asks you to plan, schedule, remind or create tasks; if it asks a question, answer it with intent=answer. Ask a short follow-up (intent=clarify) if a needed day or time is missing.`
    : `The user attached this ${isVideo ? 'video' : 'image'} WITHOUT any instruction. Do NOT create tasks. Use intent=clarify: describe in one short sentence what you see that could be planned, then ask what they would like you to do. Offer suggestedReplies such as "Create tasks from this", "Remind me about it tomorrow", "Just summarise it".`;
  const context = JSON.stringify({ today, timezone: timezone || 'UTC', existingTasks: (existingTasks || []).slice(0, 60) });
  const parsed = await callGemini([
    {
      role: 'user',
      parts: [
        { text: `${SYSTEM_PROMPT}\n\n${instruction}\n${guidance}\n${context}` },
        { inlineData: { mimeType: mimeType || 'image/jpeg', data: media } },
      ],
    },
  ]);
  if (!instructionNote) {
    parsed.intent = 'clarify';
    parsed.tasks = [];
  }
  if (!parsed.tasks?.length && parsed.intent !== 'clarify' && parsed.intent !== 'answer') {
    parsed.intent = parsed.intent || 'create_tasks';
    parsed.message = parsed.message || `I could not find tasks in that ${isVideo ? 'video' : 'image'}. Try a clearer ${isVideo ? 'clip' : 'photo'}.`;
    parsed.tasks = parsed.tasks || [];
  }
  return applyScheduleGuards(parsed, existingTasks || []);
}

async function transcribe(base64Audio, mimeType) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const error = new Error('ORDINA voice AI is not configured. Set GEMINI_API_KEY in backend-ordina/.env');
    error.status = 503;
    throw error;
  }
  if (!base64Audio) {
    const error = new Error('Audio is required');
    error.status = 400;
    throw error;
  }
  const text = await geminiText([{
    role: 'user',
    parts: [
      { text: 'Transcribe the speech in this audio exactly, in the language spoken. Return only the spoken words. If there is no clear speech, return an empty response. Never invent words.' },
      { inlineData: { mimeType: mimeType || 'audio/mp4', data: base64Audio } },
    ],
  }]);
  return String(text || '').trim();
}

module.exports = { interpret, interpretMedia, transcribe, durationMinutes, localInterpret };

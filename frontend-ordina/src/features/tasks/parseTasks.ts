/**
 * Turns a written plan into separate tasks, on the phone: no AI and no internet.
 *
 *   "Today I will study Python at 8 AM for two hours, then I have a team meeting at 2 PM."
 *   -> "Study Python" today 08:00 (2 h), "Team meeting" today 14:00
 *
 * Keywords are English and fixed, so results don't depend on the phone's language setting.
 * Dates and times use the phone's time zone (`now` is a local Date).
 *
 * Self-contained on purpose (no app imports) so the unit tests run with plain Node:
 *   npm test
 */

/** Longest text the task box accepts. */
export const PLAN_INPUT_MAX = 2000;
/** Longest title of one task after splitting. */
export const PARSED_TITLE_MAX = 100;
/** Used to place "after that" tasks when the previous task has no duration. */
export const DEFAULT_DURATION_MINUTES = 60;

export const SUGGESTED_TIMES = { morning: '09:00', afternoon: '14:00', evening: '18:00', night: '20:00' } as const;
export type PartOfDay = keyof typeof SUGGESTED_TIMES;

export type ParsedPriority = 'low' | 'medium' | 'high';

export type ParsedTask = {
  title: string;
  /** YYYY-MM-DD, local date. */
  date: string;
  /** True when the text named the day; false when the task fell on today by default. */
  dateFromText: boolean;
  /** HH:MM (24 h) or null for "any time". */
  startTime: string | null;
  /** Always false: ORDINA no longer guesses times (kept for older callers). */
  timeSuggested: boolean;
  /** "in the evening" etc. when no time was given: a hint only, the task stays Anytime. */
  partOfDay: PartOfDay | null;
  durationMinutes: number | null;
  priority: ParsedPriority;
  priorityFromText: boolean;
  /** Title of the task this one follows ("after that"). */
  after: string | null;
  /** The time is already over today: the user must pick a new one before saving. */
  needsNewTime: boolean;
};

// ---------------------------------------------------------------- dates

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
const toTime = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

/** Next occurrence of a weekday, 1 to 7 days ahead ("Friday" on a Friday means next week's). */
function nextWeekday(today: Date, weekday: number) {
  return addDays(today, (weekday - today.getDay() + 7) % 7 || 7);
}

/** A day and month without a year: this year, or next year if that date has passed. */
function dayMonth(today: Date, day: number, monthIndex: number, year?: number) {
  if (monthIndex < 0 || monthIndex > 11 || day < 1) return null;
  const fullYear = year === undefined ? today.getFullYear() : year < 100 ? 2000 + year : year;
  let date = new Date(fullYear, monthIndex, day);
  if (date.getMonth() !== monthIndex) return null;
  if (year === undefined && date < today) date = new Date(fullYear + 1, monthIndex, day);
  return date;
}

// ---------------------------------------------------------------- numbers

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, 'forty five': 45,
  fifty: 50, sixty: 60, ninety: 90, half: 0.5, 'half an': 0.5, 'half a': 0.5,
};
const WORD_NUM = '(?:half an?|forty[- ]five|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|ninety)';
const HOUR_WORD = '(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';

function numberValue(text: string) {
  const value = text.toLowerCase().trim();
  return /^\d/.test(value) ? Number(value) : NUMBER_WORDS[value] ?? NaN;
}

const unitMinutes = (unit: string) => (/^h/i.test(unit) ? 60 : 1);

// ---------------------------------------------------------------- keywords

const VERBS = new Set(`
  answer apply arrange ask attend back bake bring build buy call cancel catch change charge check clean code
  collect complete cook create cycle dance deliver deploy design do download draft drink drive drop eat edit email
  exercise feed file fill finish fix fly follow get give go grab have help hike install iron jog join journal learn
  leave listen look mail make meditate meet message mop move mow order organise organize pack paint pay phone pick
  plan play post practice practise pray prepare present print publish read record register remind renew rent repair
  reply research respond rest return review revise ride run schedule see sell send shop shower sign sleep sort start
  stretch study submit swim take talk teach test text tidy train travel try update upload vacuum visit wake walk wash
  watch water work write
`.trim().split(/\s+/));

// Words that start a new activity after a comma or "and" ("study and go for a run").
const STARTS_ACTIVITY = new RegExp(
  `^(?:i|i'll|i'm|i've|i'd|we|we'll|we're|let's|let me|it|it's|this|that|today|tonight|tomorrow|on|at|in the|next|after|before|by|then|later|also|finally|${WEEKDAYS.join('|')}|morning|afternoon|evening|night)\\b|^\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)\\b`,
  'i',
);

// "it is urgent", "this is important": adds detail to the previous task, never a task itself.
const MODIFIER_CLAUSE = /^(?:it|this|that)(?:\s+is|'s)\b/i;

const FILLERS = [
  "i am going to", "i'm going to", 'im going to', "i'm gonna", 'i am gonna', 'i will need to', "i'll need to",
  'i will have to', "i'll have to", 'i need to', 'i have to', "i've got to", 'i have got to', 'i got to', 'i gotta',
  'i want to', 'i would like to', "i'd like to", 'i plan to', "i'm planning to", 'i am planning to', 'i should',
  'i must', 'i can', 'i could', 'i might', 'i may', 'i shall', 'i will', "i'll", "i've got", "i've", 'i have',
  'i got', 'i am', "i'm", 'we will', "we'll", 'we need to', 'we have to', 'we have', 'we are', "we're", 'we',
  'need to', 'have to', 'got to', 'want to', 'going to', 'gonna', 'remember to', "don't forget to",
  'dont forget to', 'make sure to', 'try to', 'please', 'let me', "let's", 'lets', 'just', 'really', 'then',
  'and', 'also', 'so', 'plus', 'later', 'next', 'after that', 'afterwards', 'finally', 'first', 'firstly',
  'secondly', 'lastly', 'i',
].sort((a, b) => b.length - a.length);
const FILLER_RE = new RegExp(`^(?:${FILLERS.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b\\s*`, 'i');
const TRAILING_RE = /\s+(?:at|on|in|by|for|and|then|with|to|of|the|around|from|until|is|it)$/i;

// ---------------------------------------------------------------- one clause

type ClauseInfo = {
  title: string;
  date: Date | null;
  time: string | null;
  part: PartOfDay | null;
  /** Minutes from now ("in 2 hours"). */
  inMinutes: number | null;
  duration: number | null;
  priority: ParsedPriority | null;
};

function readClause(text: string, today: Date): ClauseInfo {
  let rest = ` ${text} `;
  const info: ClauseInfo = { title: '', date: null, time: null, part: null, inMinutes: null, duration: null, priority: null };
  const take = (re: RegExp, handle: (m: RegExpExecArray) => boolean | void) => {
    const match = re.exec(rest);
    if (!match) return;
    if (handle(match) === false) return;
    rest = `${rest.slice(0, match.index)} ${rest.slice(match.index + match[0].length)}`;
  };

  // Priority.
  take(/\b(?:it(?:'s|\s+is)\s+|this\s+is\s+|that(?:'s|\s+is)\s+)?(?:very\s+|really\s+|super\s+)?(?:urgent(?:ly)?|important|asap|as soon as possible|critical|high[- ]priority|top priority)\b/i, () => {
    info.priority = 'high';
  });
  take(/\b(?:i\s+(?:really\s+)?)?must\b/i, () => {
    info.priority = 'high';
  });
  if (!info.priority) take(/\b(?:it(?:'s|\s+is)\s+)?low[- ]priority\b/i, () => {
    info.priority = 'low';
  });

  // "in 2 hours", "in 30 minutes": a start time counted from now.
  take(new RegExp(`\\bin\\s+(?:about\\s+)?(\\d+|${WORD_NUM})\\s+(hours?|hrs?|minutes?|mins?)\\b`, 'i'), (m) => {
    const value = numberValue(m[1]) * unitMinutes(m[2]);
    if (!Number.isFinite(value)) return false;
    info.inMinutes = Math.round(value);
  });

  // Durations: "for 2 hours", "for two hours", "30 min", "1h 30m", "an hour and a half".
  take(new RegExp(
    `\\b(?:for\\s+)?(?:about\\s+|around\\s+|roughly\\s+)?(?:(\\d+(?:\\.\\d+)?)\\s*(hours?|hrs?|h|minutes?|mins?|m)|(${WORD_NUM})\\s+(hours?|hrs?|minutes?|mins?))\\b`
      + `(?:\\s*(?:and\\s+)?(?:(a half)|(\\d+)\\s*(?:minutes?|mins?|m)\\b))?`,
    'i',
  ), (m) => {
    const amount = numberValue(m[1] ?? m[3]);
    const unit = m[2] ?? m[4];
    let minutes = amount * unitMinutes(unit);
    if (m[5]) minutes += 30;
    if (m[6]) minutes += Number(m[6]);
    if (!Number.isFinite(minutes) || minutes <= 0) return false;
    info.duration = Math.round(minutes);
  });

  // Day words.
  take(/\b(?:the\s+)?day after tomorrow\b/i, () => {
    info.date = addDays(today, 2);
  });
  if (!info.date) take(/\btonight\b/i, () => {
    info.date = today;
    info.part = 'night';
  });
  if (!info.date) take(/\b(?:later\s+)?today\b/i, () => {
    info.date = today;
  });
  if (!info.date) take(/\b(?:tomorrow|tmrw|tmr)\b/i, () => {
    info.date = addDays(today, 1);
  });
  if (!info.date) take(/\b(?:by\s+|on\s+)?next\s+week\b/i, () => {
    info.date = nextWeekday(today, 1);
  });
  if (!info.date) take(new RegExp(`\\b(?:on\\s+|by\\s+|this\\s+|next\\s+|until\\s+)*(${WEEKDAYS.join('|')})s?\\b`, 'i'), (m) => {
    info.date = nextWeekday(today, WEEKDAYS.indexOf(m[1].toLowerCase()));
  });
  if (!info.date) take(new RegExp(`\\b(?:on\\s+|by\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\.?(?:\\s+(\\d{4}))?\\b`, 'i'), (m) => {
    const date = dayMonth(today, Number(m[1]), MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), m[3] ? Number(m[3]) : undefined);
    if (!date) return false;
    info.date = date;
  });
  if (!info.date) take(new RegExp(`\\b(?:on\\s+|by\\s+)?${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'i'), (m) => {
    const date = dayMonth(today, Number(m[2]), MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()), m[3] ? Number(m[3]) : undefined);
    if (!date) return false;
    info.date = date;
  });
  if (!info.date) take(/\b(?:on\s+|by\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/, (m) => {
    // Day first (20/10); fall back to month first (10/20) when that is the only valid reading.
    const year = m[3] ? Number(m[3]) : undefined;
    const date = dayMonth(today, Number(m[1]), Number(m[2]) - 1, year) ?? dayMonth(today, Number(m[2]), Number(m[1]) - 1, year);
    if (!date) return false;
    info.date = date;
  });

  // Part of day ("in the evening", "this morning", "at night").
  take(/\b(?:in\s+the\s+|this\s+|at\s+|during\s+the\s+|early\s+|late\s+)?(morning|afternoon|evening|night)\b/i, (m) => {
    info.part = m[1].toLowerCase() as PartOfDay;
  });

  // Times: "14:00", "2:30 PM", "8 AM", "8am", "at 6", "at six", "noon".
  const setTime = (hourText: string, minuteText: string | undefined, meridiem: string | undefined) => {
    let hour = numberValue(hourText);
    const minute = minuteText ? Number(minuteText) : 0;
    if (!Number.isInteger(hour) || hour > 23 || minute > 59) return false;
    const mer = meridiem?.toLowerCase();
    if (mer === 'pm' && hour < 12) hour += 12;
    else if (mer === 'am' && hour === 12) hour = 0;
    else if (!mer && hour < 12 && minuteText === undefined) {
      // "at 6": evening words mean pm; otherwise 1-6 is more likely afternoon than early morning.
      if (info.part === 'afternoon' || info.part === 'evening' || info.part === 'night' || (hour >= 1 && hour <= 6)) hour += 12;
    } else if (!mer && hour < 12 && (info.part === 'afternoon' || info.part === 'evening' || info.part === 'night')) {
      hour += 12;
    }
    info.time = toTime(hour * 60 + minute);
    return true;
  };
  take(/\b(?:at\s+|around\s+|by\s+|from\s+|@\s*)?(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/i, (m) => setTime(m[1], m[2], m[3]));
  if (!info.time) take(/\b(?:at\s+|around\s+|by\s+|from\s+|@\s*)?(\d{1,2})\s*(am|pm)\b/i, (m) => setTime(m[1], undefined, m[2]));
  if (!info.time) take(new RegExp(`\\b(?:at|around|by|@)\\s+(\\d{1,2}|${HOUR_WORD})(?:\\s*o'?clock)?\\b(?!\\s*(?:hours?|minutes?|mins?|days?|people|times|%|[/:]))`, 'i'), (m) => setTime(m[1], undefined, undefined));
  if (!info.time) take(/\b(?:at\s+)?(?:noon|midday)\b/i, () => {
    info.time = '12:00';
  });

  info.title = cleanTitle(rest);
  return info;
}

export function cleanTitle(text: string) {
  let title = text.replace(/\s+/g, ' ').trim();
  let previous = '';
  while (previous !== title) {
    previous = title;
    title = title.replace(/^[\s,.;:!?\-–—]+|[\s,.;:!?\-–—]+$/g, '');
    title = title.replace(FILLER_RE, '');
    title = title.replace(TRAILING_RE, '');
  }
  title = title.replace(/^(?:a|an|the)\s+/i, '').trim();
  if (/^(?:it|this|that|ok|okay|all|everything|something|stuff|things)$/i.test(title)) title = '';
  if (title.length > PARSED_TITLE_MAX) {
    const cut = title.slice(0, PARSED_TITLE_MAX + 1);
    const space = cut.lastIndexOf(' ');
    title = (space > 40 ? cut.slice(0, space) : cut.slice(0, PARSED_TITLE_MAX)).replace(/[\s,.;:]+$/, '');
  }
  return title ? title[0].toUpperCase() + title.slice(1) : '';
}

// ---------------------------------------------------------------- splitting

type Join = 'start' | 'soft' | 'hard' | 'after';
const JOIN_RANK: Record<Join, number> = { start: 0, soft: 1, hard: 2, after: 3 };

// Separators inside a sentence. "soft" ones (comma, "and") split only when a new activity follows.
const SEPARATOR = new RegExp(
  '\\s*(,|\\band\\s+after\\s+that\\b|\\band\\s+afterwards\\b|\\bafter\\s+that\\b|\\bafterwards\\b|\\band\\s+then\\b|\\bthen\\b'
    + '|\\band\\s+also\\b|\\balso\\b|\\band\\s+later\\b|\\blater\\b(?!\\s+(?:today|tonight))'
    + `|\\bnext\\b(?!\\s+(?:week|month|${WEEKDAYS.join('|')}))|\\band\\b|\\bplus\\b)\\s*`,
  'i',
);

function joinOf(separator: string): Join {
  const word = separator.trim().toLowerCase();
  if (/after/.test(word)) return 'after';
  if (word === ',' || word === 'and' || word === 'plus') return 'soft';
  return 'hard';
}

type Fragment = { text: string; join: Join; sentence: number };

function splitText(input: string): Fragment[] {
  const text = input
    .replace(/\r\n?/g, '\n')
    // "8 a.m." -> "8 am" (keeping a full stop that ends the sentence) so times are not split.
    .replace(/\b([ap])\.\s?m\.(?=\s+[A-Z]|\s*$)/g, '$1m.')
    .replace(/\b([ap])\.\s?m\.?/gi, '$1m')
    .replace(/\b(dr|mr|mrs|ms|prof|st|e\.g|i\.e|etc)\./gi, '$1');

  const sentences = text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•·]|\d{1,2}[.)])\s+/, ''))
    .flatMap((line) => line.replace(/([.!?])\s+/g, '$1\n').split(/[\n;]/))
    .map((sentence) => sentence.replace(/[.!?]+\s*$/, '').trim())
    .filter(Boolean);

  const fragments: Fragment[] = [];
  sentences.forEach((sentence, index) => {
    const parts = sentence.split(SEPARATOR);
    let join: Join = 'start';
    let joinText = '';
    for (let i = 0; i < parts.length; i += 2) {
      const piece = parts[i].trim();
      if (piece) {
        const last = fragments[fragments.length - 1];
        const keepTogether = join === 'soft' && last?.sentence === index && !STARTS_ACTIVITY.test(piece)
          && !VERBS.has(piece.split(/\s+/)[0].toLowerCase());
        if (keepTogether) {
          // "fish and chips", "milk, eggs and bread": one activity.
          last.text = `${last.text}${joinText.trim() === ',' ? ',' : ` ${joinText.trim()}`} ${piece}`;
        } else {
          fragments.push({ text: piece, join, sentence: index });
        }
        join = 'start';
        joinText = '';
      }
      const separator = parts[i + 1];
      if (separator !== undefined) {
        const next = joinOf(separator);
        if (JOIN_RANK[next] >= JOIN_RANK[join]) {
          join = next;
          joinText = separator;
        }
      }
    }
  });
  return fragments;
}

// ---------------------------------------------------------------- main

/**
 * Splits text into tasks. A day word applies to the activities after it until another day
 * word appears; activities without one fall on today.
 */
export function parseTasks(text: string, now: Date = new Date()): ParsedTask[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayKey = dateKey(today);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const tasks: (ParsedTask & { sentence: number })[] = [];
  let dayContext: Date | null = null;
  // Details from a clause with no activity ("At 5,"), waiting for the next task.
  let pending: Partial<ClauseInfo> = {};

  for (const fragment of splitText(text.slice(0, PLAN_INPUT_MAX))) {
    const info = readClause(fragment.text, today);
    if (info.date) dayContext = info.date;
    const previous = tasks[tasks.length - 1];
    const sameSentence = previous?.sentence === fragment.sentence;

    if (!info.title || MODIFIER_CLAUSE.test(fragment.text.trim())) {
      if (previous && sameSentence) {
        if (info.priority) {
          previous.priority = info.priority;
          previous.priorityFromText = true;
        }
        if (info.duration && previous.durationMinutes === null) previous.durationMinutes = info.duration;
        if (info.time && previous.startTime === null) {
          previous.startTime = info.time;
          previous.timeSuggested = false;
        }
        if (info.date) {
          previous.date = dateKey(info.date);
          previous.dateFromText = true;
        }
      } else {
        pending = {
          ...pending,
          ...(info.priority ? { priority: info.priority } : {}),
          ...(info.duration ? { duration: info.duration } : {}),
          ...(info.time ? { time: info.time } : {}),
          ...(info.part ? { part: info.part } : {}),
        };
      }
      continue;
    }

    const date = info.date ?? dayContext ?? today;
    const key = dateKey(date);
    const priority = info.priority ?? pending.priority ?? null;
    const task: ParsedTask & { sentence: number } = {
      title: info.title,
      date: key,
      dateFromText: Boolean(info.date ?? dayContext),
      startTime: info.time ?? pending.time ?? null,
      timeSuggested: false,
      durationMinutes: info.duration ?? pending.duration ?? null,
      priority: priority ?? 'medium',
      priorityFromText: priority !== null,
      after: null,
      partOfDay: null,
      needsNewTime: false,
      sentence: fragment.sentence,
    };
    const part = info.part ?? pending.part ?? null;
    pending = {};

    if (!task.startTime && info.inMinutes !== null && key === todayKey) {
      const start = nowMinutes + info.inMinutes;
      if (start < 24 * 60) task.startTime = toTime(Math.ceil(start / 5) * 5 % (24 * 60));
    }
    // No time in the text: the task is "Anytime" on its day. ORDINA never guesses a time;
    // "in the evening" and "after that" are kept as hints the user can see in the preview.
    if (!task.startTime && fragment.join === 'after' && previous) task.after = previous.title;
    task.partOfDay = task.startTime ? null : part;
    tasks.push(task);
  }

  return tasks.map(({ sentence: _sentence, ...task }) => ({
    ...task,
    needsNewTime: task.date < todayKey || (task.date === todayKey && task.startTime !== null && toMinutes(task.startTime) < nowMinutes),
  }));
}

function toDateKey(date, timeZone) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return toDateKey(new Date(), timeZone);
  if (timeZone) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function matchesRecurrence(task, dateKey) {
  const rule = task.recurrence;
  if (!rule || rule === 'none') return false;
  const start = task.dueAt ? toDateKey(task.dueAt) : toDateKey(task.createdAt);
  if (dateKey < start) return false;
  if (rule === 'daily') return true;
  if (rule === 'weekly') {
    const a = new Date(`${start}T12:00:00.000Z`).getUTCDay();
    const b = new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
    return a === b;
  }
  if (rule === 'monthly') {
    return start.slice(8, 10) === dateKey.slice(8, 10);
  }
  if (rule === 'custom' && task.recurrenceRule) {
    const days = task.recurrenceRule.split(',').map((item) => Number(item.trim()));
    const weekday = new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
    return days.includes(weekday);
  }
  return false;
}

function minutesFromTime(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function timeFromMinutes(total) {
  const clamped = Math.max(0, Math.min(23 * 60 + 30, total));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function durationMinutes(text) {
  if (!text) return 60;
  const hours = /(\d+)\s*h/.exec(text);
  const mins = /(\d+)\s*m/.exec(text);
  return (hours ? Number(hours[1]) * 60 : 0) + (mins ? Number(mins[1]) : hours ? 0 : 60);
}

function detectConflicts(existing, candidate) {
  const date = candidate.dueDate;
  const start = minutesFromTime(candidate.startTime);
  if (!date || start == null) return [];
  const end = start + (candidate.durationMinutes || durationMinutes(candidate.duration));
  return existing.filter((task) => {
    if (task.completed || task.status === 'completed') return false;
    if (task.dueDate !== date) return false;
    const otherStart = minutesFromTime(task.startTime);
    if (otherStart == null) return false;
    const otherEnd = otherStart + durationMinutes(task.duration);
    return start < otherEnd && otherStart < end;
  });
}

function findOpenSlot(existing, dueDate, durationMins, avoidStart) {
  const busy = existing
    .filter((task) => task.dueDate === dueDate && !task.completed && minutesFromTime(task.startTime) != null)
    .map((task) => {
      const start = minutesFromTime(task.startTime);
      return { start, end: start + durationMinutes(task.duration) };
    })
    .sort((a, b) => a.start - b.start);

  let cursor = 8 * 60;
  const close = 20 * 60;
  const need = durationMins || 60;
  while (cursor + need <= close) {
    if (avoidStart != null && Math.abs(cursor - avoidStart) < 30) {
      cursor += 30;
      continue;
    }
    const hit = busy.find((block) => cursor < block.end && block.start < cursor + need);
    if (!hit) return timeFromMinutes(cursor);
    cursor = hit.end;
  }
  return timeFromMinutes(18 * 60);
}

function recommendNow(tasks, now = new Date()) {
  const today = toDateKey(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const open = tasks.filter((task) => !task.completed && task.status !== 'archived');
  const scored = open
    .map((task) => {
      let score = task.priority === 'high' || task.priority === 3 ? 30 : task.priority === 'medium' || task.priority === 2 ? 15 : 5;
      if (task.dueDate === today) score += 25;
      if (task.dueDate && task.dueDate < today) score += 40;
      const start = minutesFromTime(task.startTime);
      if (start != null && Math.abs(start - minutes) <= 45) score += 20;
      return { task, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.task || null;
}

function overwhelmPlan(tasks) {
  const open = tasks.filter((task) => !task.completed);
  const high = open.filter((task) => task.priority === 'high' || task.priority === 3 || (task.dueDate && task.dueDate <= toDateKey(new Date())));
  const wait = open.filter((task) => !high.includes(task) && (task.priority === 'medium' || task.priority === 2));
  const optional = open.filter((task) => !high.includes(task) && !wait.includes(task));
  return {
    highPriority: high.slice(0, 5),
    canWait: wait.slice(0, 8),
    optional: optional.slice(0, 8),
    suggestedPlan: high.slice(0, 3).map((task) => task.title),
  };
}

function priorityScore(task) {
  return task.priority === 'high' || task.priority === 3 ? 3 : task.priority === 'medium' || task.priority === 2 ? 2 : 1;
}

/**
 * Builds today's schedule: keeps timed tasks where they are, and slots unscheduled,
 * missed and overdue tasks into the free time left today (highest priority first).
 * Anything that does not fit moves to tomorrow.
 */
function planDay(tasks, today, nowMinutes) {
  const open = tasks.filter((task) => !task.completed && task.status !== 'completed' && task.status !== 'archived');
  const fixed = open.filter((task) => task.dueDate === today
    && minutesFromTime(task.startTime) != null
    && minutesFromTime(task.startTime) >= nowMinutes);
  const toPlace = open
    .filter((task) => !fixed.includes(task) && (!task.dueDate || task.dueDate <= today))
    .sort((a, b) => {
      const overdue = Number(Boolean(b.dueDate && b.dueDate < today)) - Number(Boolean(a.dueDate && a.dueDate < today));
      return priorityScore(b) - priorityScore(a) || overdue;
    })
    .slice(0, 12);

  const busy = fixed.map((task) => {
    const start = minutesFromTime(task.startTime);
    return { start, end: start + durationMinutes(task.duration) };
  });
  const dayEnd = 21 * 60;
  let cursor = Math.max(8 * 60, Math.ceil(nowMinutes / 15) * 15);
  const tomorrow = addDays(today, 1);
  const tomorrowBusy = [];
  const planned = [];

  for (const task of toPlace) {
    const need = durationMinutes(task.duration);
    let slot = null;
    let start = cursor;
    while (start + need <= dayEnd) {
      const hit = busy.find((block) => start < block.end && block.start < start + need);
      if (!hit) { slot = start; break; }
      start = hit.end;
    }
    let date = today;
    if (slot == null) {
      date = tomorrow;
      const tomorrowTasks = tasks.filter((item) => item.dueDate === tomorrow).concat(tomorrowBusy);
      slot = minutesFromTime(findOpenSlot(tomorrowTasks, tomorrow, need));
      tomorrowBusy.push({ dueDate: tomorrow, startTime: timeFromMinutes(slot), duration: `${need}m`, completed: false });
    } else {
      busy.push({ start: slot, end: slot + need });
      cursor = slot + need;
    }
    planned.push({
      id: task.id,
      title: task.title,
      description: task.description || '',
      date,
      startTime: timeFromMinutes(slot),
      durationMinutes: need,
      priority: typeof task.priority === 'number' ? (task.priority >= 3 ? 'high' : task.priority === 2 ? 'medium' : 'low') : task.priority || 'medium',
      reminder: Boolean(task.reminder),
      reason: task.dueDate && task.dueDate < today ? 'Overdue' : !task.startTime ? 'Unscheduled' : 'Missed earlier today',
    });
  }

  return {
    planned,
    fixed: fixed
      .map((task) => ({ title: task.title, startTime: task.startTime, durationMinutes: durationMinutes(task.duration) }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  };
}

module.exports = {
  planDay,
  toDateKey,
  addDays,
  matchesRecurrence,
  detectConflicts,
  findOpenSlot,
  recommendNow,
  overwhelmPlan,
  durationMinutes,
  minutesFromTime,
};

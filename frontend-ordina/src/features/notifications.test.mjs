// Unit tests for notification scheduling and backup files. Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BACKUP_APP, backupFileName, mergeRows, parseBackup } from './backup-format.ts';
import {
  DAILY_CAP,
  DEFAULT_SETTINGS,
  afterQuietHours,
  applyDailyCap,
  groupReminders,
  inQuietHours,
  planNotifications,
  reminderFireTime,
  renderNotification,
  tomorrowKey,
} from './notification-plan.ts';

// Wednesday 21 Oct 2026, 06:30.
const now = new Date(2026, 9, 21, 6, 30);
const today = '2026-10-21';
const settings = { ...DEFAULT_SETTINGS };
const task = (id, extra) => ({ id, title: id, completed: false, ...extra });
const keys = (plan) => plan.map((item) => item.key);
const hhmm = (date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

test('reminder times: at start, minutes or a day before, Anytime at the chosen time', () => {
  assert.equal(hhmm(reminderFireTime(task('a', { dueDate: today, startTime: '08:00', reminderLead: 15 }))), '07:45');
  assert.equal(hhmm(reminderFireTime(task('b', { dueDate: today, startTime: '08:00', reminderLead: 0 }))), '08:00');
  const dayBefore = reminderFireTime(task('c', { dueDate: '2026-10-22', startTime: '09:30', reminderLead: 1440 }));
  assert.equal(dayBefore.getDate(), 21);
  assert.equal(hhmm(dayBefore), '09:30');
  assert.equal(hhmm(reminderFireTime(task('d', { dueDate: today, reminderLead: 0, reminderTime: '12:00' }))), '12:00');
  // Anytime without a time: the morning plan covers it. No reminder, or done: nothing.
  assert.equal(reminderFireTime(task('e', { dueDate: today, reminderLead: 0 })), null);
  assert.equal(reminderFireTime(task('f', { dueDate: today, startTime: '08:00', reminderLead: null })), null);
  assert.equal(reminderFireTime(task('g', { dueDate: today, startTime: '08:00', reminderLead: 5, completed: true })), null);
});

test('editing a task moves its reminder; completing or deleting it removes it', () => {
  const study = task('study', { dueDate: today, startTime: '08:00', reminderLead: 15 });
  const before = planNotifications([study], settings, { now }).find((item) => item.key === 'reminder_study');
  assert.equal(hhmm(before.fireAt), '07:45');
  const moved = planNotifications([{ ...study, startTime: '10:00' }], settings, { now }).find((item) => item.key === 'reminder_study');
  assert.equal(hhmm(moved.fireAt), '09:45');
  assert.equal(moved.key, before.key, 'same key, so the old one is replaced');
  assert.ok(!keys(planNotifications([{ ...study, completed: true }], settings, { now })).includes('reminder_study'));
  assert.ok(!keys(planNotifications([], settings, { now })).includes('reminder_study'));
});

test('reminders close together become one notification', () => {
  const plan = planNotifications([
    task('a', { dueDate: today, startTime: '09:00', reminderLead: 0 }),
    task('b', { dueDate: today, startTime: '09:03', reminderLead: 0 }),
    task('c', { dueDate: today, startTime: '09:05', reminderLead: 0 }),
    task('d', { dueDate: today, startTime: '11:00', reminderLead: 0 }),
  ], { ...settings, morning: false, evening: false, overdue: false, backup: false }, { now });
  assert.deepEqual(plan.map((item) => item.type), ['reminderGroup', 'reminder']);
  assert.deepEqual(plan[0].taskIds, ['a', 'b', 'c']);
  assert.equal(plan[0].vars.count, 3);
  assert.equal(groupReminders([]).length, 0);
});

test('morning plan only on days with tasks; evening check-in only if tasks are left today', () => {
  const plan = planNotifications([
    task('gym', { dueDate: today, startTime: '18:00' }),
    task('read', { dueDate: today }),
  ], { ...settings, overdue: false, backup: false }, { now });
  const morning = plan.find((item) => item.key === `morning_${today}`);
  assert.equal(morning.vars.count, 2);
  assert.equal(morning.vars.first, 'gym');
  assert.ok(plan.some((item) => item.key === `evening_${today}`));
  assert.ok(!plan.some((item) => item.key === 'morning_2026-10-22'), 'no tasks tomorrow: no morning plan');
  const prompt = planNotifications([], { ...settings, planPrompt: true, backup: false }, { now });
  assert.ok(prompt.some((item) => item.type === 'planPrompt'));
  const allDone = planNotifications([task('gym', { dueDate: today, completed: true })], { ...settings, backup: false }, { now });
  assert.ok(!allDone.some((item) => item.type === 'evening'));
});

test('overdue nudge: once, 1 hour after the start, never repeated', () => {
  const report = task('report', { dueDate: today, startTime: '14:00' });
  const nudge = planNotifications([report], settings, { now }).find((item) => item.type === 'overdue');
  assert.equal(hhmm(nudge.fireAt), '15:00');
  assert.ok(!planNotifications([report], settings, { now, overdueNotified: new Set(['report']) }).some((item) => item.type === 'overdue'));
});

test('quiet hours block everything except task reminders', () => {
  const quiet = { quiet: true, quietStart: '22:00', quietEnd: '06:00' };
  assert.ok(inQuietHours(new Date(2026, 9, 21, 23, 0), quiet));
  assert.ok(inQuietHours(new Date(2026, 9, 21, 5, 59), quiet));
  assert.ok(!inQuietHours(new Date(2026, 9, 21, 6, 0), quiet));
  assert.equal(hhmm(afterQuietHours(new Date(2026, 9, 21, 23, 0), quiet)), '06:00');
  const late = planNotifications([
    task('call', { dueDate: today, startTime: '22:30', reminderLead: 0 }),
    task('late', { dueDate: today, startTime: '22:00' }),
  ], { ...settings, eveningTime: '23:00', backup: false }, { now });
  assert.ok(late.some((item) => item.key === 'reminder_call'), 'the user\'s reminder still fires');
  assert.ok(!late.some((item) => item.type === 'evening'), 'evening check-in inside quiet hours is dropped');
  const nudge = late.find((item) => item.key === 'overdue_late');
  assert.equal(hhmm(nudge.fireAt), '06:00', 'the 23:00 nudge waits until quiet hours end');
});

test('at most 6 non-reminder notifications a day, most useful first', () => {
  const many = Array.from({ length: 10 }, (_, index) => task(`t${index}`, { dueDate: today, startTime: `${10 + index}:00` }));
  const plan = planNotifications(many, { ...settings, backup: false }, { now });
  const todayOthers = plan.filter((item) => item.type !== 'reminder' && item.fireAt.getDate() === 21);
  assert.equal(todayOthers.length, DAILY_CAP);
  assert.ok(todayOthers.some((item) => item.type === 'morning') && todayOthers.some((item) => item.type === 'evening'));
  // Already sent 5 today: one more fits.
  const capped = applyDailyCap(plan, { [today]: 5 }).filter((item) => item.type !== 'reminder' && item.fireAt.getDate() === 21);
  assert.equal(capped.length, 1);
});

test('backup reminder: only when no recent backup, once a week, Later waits 3 days', () => {
  const base = { ...settings, morning: false, evening: false };
  assert.ok(planNotifications([], base, { now, lastBackupAt: null }).some((item) => item.type === 'backup'));
  assert.ok(!planNotifications([], base, { now, lastBackupAt: '2026-10-19T10:00:00Z' }).some((item) => item.type === 'backup'));
  assert.ok(!planNotifications([], base, { now, lastBackupReminderAt: '2026-10-18T18:00:00Z' }).some((item) => item.type === 'backup'));
  const later = planNotifications([], base, { now, backupSnoozedUntil: new Date(2026, 9, 24, 9, 0).toISOString() }).find((item) => item.type === 'backup');
  assert.equal(later.fireAt.getDate(), 24);
  assert.ok(!planNotifications([], base, { now, serverBackup: true }).some((item) => item.type === 'backup'));
});

test('snooze replaces the reminder; master switch turns everything off', () => {
  const study = task('study', { dueDate: today, startTime: '08:00', reminderLead: 15 });
  const snoozed = planNotifications([study], settings, { now, snoozes: { study: new Date(2026, 9, 21, 7, 55).toISOString() } });
  assert.ok(snoozed.some((item) => item.key === 'snooze_study'));
  assert.ok(!snoozed.some((item) => item.key === 'reminder_study'));
  assert.deepEqual(planNotifications([study], { ...settings, enabled: false }, { now }), []);
  assert.equal(tomorrowKey(now), '2026-10-22');
});

test('messages are warm, use the first name, and keep their wording when re-planned', () => {
  const t = (key, vars = {}) => `${key}${Object.keys(vars).length ? JSON.stringify(vars) : ''}`;
  const options = { t, firstName: 'Anii Uwihirwe', formatTime: (time) => time, categoryName: (id) => id };
  const [item] = planNotifications([task('Study Python', { dueDate: today, startTime: '08:00', duration: '2h', reminderLead: 15, category: 'study' })],
    { ...settings, morning: false, evening: false, overdue: false, backup: false }, { now });
  const first = renderNotification(item, options);
  assert.match(first.title, /^Study Python · notif\.reminder\.inMinutes/);
  assert.match(first.body, /^08:00 – 10:00 · study\. notif\.reminder\.cheer\dNamed/);
  assert.match(first.body, /"name":"Anii"/);
  assert.deepEqual(renderNotification(item, options), first);
});

const backup = {
  app: BACKUP_APP,
  version: 1,
  exportedAt: '2026-10-21T10:00:00Z',
  tasks: [{ id: 't1', title: 'Pay rent', status: 'pending', created_at: '2026-10-01', updated_at: '2026-10-02' }],
  reminders: [{ task_id: 't1', lead_minutes: 15 }],
  categories: [{ id: 'bills', color: '#0EA5A4', icon: 'receipt-outline', created_at: 'x', updated_at: 'y' }],
  categoryLearning: [],
  settings: { morning: true },
  conversations: [{ id: 'c1', title: 'Plan', created_at: 'x', updated_at: 'y' }],
  messages: [{ id: 'm1', conversation_id: 'c1', role: 'user', content: 'Plan my week', created_at: 'x' }],
};

test('backup import: valid files are accepted, anything else is refused before writing', () => {
  const ok = parseBackup(JSON.stringify(backup));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.counts, { tasks: 1, categories: 1, conversations: 1 });
  assert.deepEqual(parseBackup('not json'), { ok: false, error: 'notJson' });
  assert.deepEqual(parseBackup(JSON.stringify({ app: 'Other' })), { ok: false, error: 'notOrdina' });
  assert.deepEqual(parseBackup(JSON.stringify({ ...backup, version: 99 })), { ok: false, error: 'newerVersion' });
  assert.deepEqual(parseBackup(JSON.stringify({ ...backup, tasks: [{ id: 't2' }] })), { ok: false, error: 'invalid' });
  assert.deepEqual(parseBackup(JSON.stringify({ ...backup, messages: [{ ...backup.messages[0], conversation_id: 'missing' }] })), { ok: false, error: 'invalid' });
  assert.match(backupFileName(now), /^ordina-backup-2026-10-21\.json$/);
});

test('backup merge: newest version wins, no duplicates', () => {
  const existing = [
    { id: 'a', title: 'Old', updated_at: '2026-10-01' },
    { id: 'b', title: 'Mine is newer', updated_at: '2026-10-20' },
  ];
  const incoming = [
    { id: 'a', title: 'New', updated_at: '2026-10-05' },
    { id: 'b', title: 'Older copy', updated_at: '2026-10-10' },
    { id: 'c', title: 'Only in backup', updated_at: '2026-10-11' },
    { id: 'c', title: 'Only in backup', updated_at: '2026-10-11' },
  ];
  assert.deepEqual(mergeRows(existing, incoming).map((row) => `${row.id}:${row.title}`), ['a:New', 'c:Only in backup']);
});

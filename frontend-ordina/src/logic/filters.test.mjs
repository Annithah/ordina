// Unit tests for home page search and filters, run against a real SQLite table (node:sqlite).
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import {
  DEFAULT_FILTERS,
  EMPTY_FILTERS,
  activeChips,
  dateRange,
  filterSql,
  likePattern,
  matchesStatus,
  removeChip,
  sanitizeFilters,
  weekRange,
} from './filters.ts';

// Wednesday 21 October 2026, 15:00.
const NOW = new Date(2026, 9, 21, 15, 0);

function database(rows) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, description TEXT, status TEXT, priority TEXT,
    category_id TEXT, due_date TEXT, start_time TEXT, duration TEXT, deadline TEXT, deleted_at TEXT)`);
  const insert = db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const r of rows) {
    insert.run(r.id, r.title, r.description ?? null, r.status ?? 'pending', r.priority ?? 'medium', r.category_id ?? 'cat-other',
      r.due_date ?? null, r.start_time ?? null, r.duration ?? null, r.deadline ?? null, r.deleted_at ?? null);
  }
  return db;
}

function run(db, filters) {
  const { where, params } = filterSql({ ...EMPTY_FILTERS, ...filters }, NOW);
  const rows = db.prepare(`SELECT * FROM tasks WHERE ${where} ORDER BY id`).all(...params);
  const status = filters.status ?? 'all';
  return rows
    .map((r) => ({ id: r.id, title: r.title, completed: r.status === 'completed', status: r.status, dueDate: r.due_date, startTime: r.start_time, duration: r.duration, deadline: r.deadline }))
    .filter((t) => matchesStatus(t, status, NOW))
    .map((t) => t.id);
}

const ROWS = [
  { id: 'gym', title: 'Go to the gym', category_id: 'cat-health', due_date: '2026-10-21', start_time: '18:00', duration: '1h 0m' },
  { id: 'report', title: 'Write report', description: 'Quarterly numbers for the boss', category_id: 'cat-work', priority: 'high', due_date: '2026-10-21', start_time: '09:00', duration: '1h 0m' },
  { id: 'anytime', title: 'Read a book', category_id: 'cat-personal', due_date: '2026-10-21' },
  { id: 'done', title: 'Call mom', status: 'completed', category_id: 'cat-family', due_date: '2026-10-21' },
  { id: 'yesterday', title: 'Pay rent', category_id: 'cat-finance', priority: 'high', due_date: '2026-10-20' },
  { id: 'tomorrow', title: 'Team meeting', category_id: 'cat-work', priority: 'low', due_date: '2026-10-22', start_time: '10:00' },
  { id: 'nextweek', title: 'Dentist', category_id: 'cat-health', due_date: '2026-10-28' },
  { id: 'deleted', title: 'Gym (deleted)', category_id: 'cat-health', due_date: '2026-10-21', deleted_at: '2026-10-21T08:00:00Z' },
  { id: 'percent', title: '100% done_ish', due_date: '2026-10-23' },
];

test('search matches titles and descriptions, ignoring case, never deleted tasks', () => {
  const db = database(ROWS);
  assert.deepEqual(run(db, { search: 'GYM' }), ['gym']);
  assert.deepEqual(run(db, { search: 'quarterly' }), ['report']);
  assert.deepEqual(run(db, { search: '%' }), ['percent'], '% is a literal character');
  assert.deepEqual(run(db, { search: '_' }), ['percent'], '_ is a literal character');
  assert.equal(likePattern('a%b'), '%a\\%b%');
});

test('status filter: pending, completed and overdue', () => {
  const db = database(ROWS);
  assert.deepEqual(run(db, { status: 'completed' }), ['done']);
  // 15:00: the report (09:00-10:00) and yesterday's rent are overdue; the anytime task is not.
  assert.deepEqual(run(db, { status: 'overdue' }), ['report', 'yesterday']);
  assert.deepEqual(run(db, { status: 'pending' }), ['anytime', 'gym', 'nextweek', 'percent', 'tomorrow']);
});

test('date filter: today, tomorrow, this week, upcoming, custom', () => {
  const db = database(ROWS);
  assert.deepEqual(run(db, { date: 'today' }), ['anytime', 'done', 'gym', 'report']);
  assert.deepEqual(run(db, { date: 'tomorrow' }), ['tomorrow']);
  assert.deepEqual(run(db, { date: 'week' }), ['anytime', 'done', 'gym', 'percent', 'report', 'tomorrow', 'yesterday']);
  assert.deepEqual(run(db, { date: 'upcoming' }), ['anytime', 'done', 'gym', 'nextweek', 'percent', 'report', 'tomorrow']);
  assert.deepEqual(run(db, { date: 'custom', from: '2026-10-22', to: '2026-10-30' }), ['nextweek', 'percent', 'tomorrow']);
  assert.deepEqual(run(db, { date: 'custom', from: '2026-10-30', to: '2026-10-22' }), ['nextweek', 'percent', 'tomorrow'], 'reversed range');
});

test('category (multi-select) and priority, combined with everything else', () => {
  const db = database(ROWS);
  assert.deepEqual(run(db, { categoryIds: ['cat-health', 'cat-work'] }), ['gym', 'nextweek', 'report', 'tomorrow']);
  assert.deepEqual(run(db, { priorities: ['high'] }), ['report', 'yesterday']);
  assert.deepEqual(run(db, { categoryIds: ['cat-health', 'cat-work'], date: 'today', search: 'o' }), ['gym', 'report']);
  assert.deepEqual(run(db, { categoryIds: ['cat-work'], status: 'pending' }), ['tomorrow']);
  assert.deepEqual(run(db, { search: 'nothing like this' }), []);
});

test('weeks start on Monday or Sunday', () => {
  assert.deepEqual(weekRange('2026-10-21', 'monday'), ['2026-10-19', '2026-10-25']);
  assert.deepEqual(weekRange('2026-10-21', 'sunday'), ['2026-10-18', '2026-10-24']);
  assert.deepEqual(weekRange('2026-10-25', 'monday'), ['2026-10-19', '2026-10-25']);
  assert.equal(dateRange({ date: null }, NOW), null);
});

test('chips: one per active filter, each removable', () => {
  const filters = { ...EMPTY_FILTERS, search: 'gym', categoryIds: ['a', 'b'], status: 'overdue', date: 'today', priorities: ['high'] };
  const chips = activeChips(filters);
  assert.deepEqual(chips.map((c) => c.kind), ['search', 'category', 'category', 'status', 'date', 'priority']);
  const fewer = removeChip(filters, chips[1]);
  assert.deepEqual(fewer.categoryIds, ['b']);
  assert.deepEqual(activeChips(EMPTY_FILTERS), []);
  assert.equal(activeChips(DEFAULT_FILTERS).length, 1);
});

test('saved filters are checked when read back', () => {
  assert.deepEqual(sanitizeFilters(null), EMPTY_FILTERS);
  const saved = sanitizeFilters({ search: 'x', categoryIds: ['cat-work', 'gone', 3], status: 'weird', date: 'custom', from: '2026-10-01', to: 'bad', priorities: ['high', 'urgent'] }, ['cat-work']);
  assert.deepEqual(saved, { search: 'x', categoryIds: ['cat-work'], status: 'all', date: 'custom', from: '2026-10-01', to: null, priorities: ['high'] });
});

test('stays fast with 5,000 tasks', () => {
  const rows = Array.from({ length: 5000 }, (_, i) => ({
    id: `t${String(i).padStart(5, '0')}`,
    title: `Task number ${i}${i % 7 === 0 ? ' gym' : ''}`,
    category_id: i % 2 ? 'cat-work' : 'cat-health',
    priority: ['low', 'medium', 'high'][i % 3],
    due_date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
    start_time: i % 3 ? `${String(8 + (i % 10)).padStart(2, '0')}:00` : null,
    status: i % 5 ? 'pending' : 'completed',
  }));
  const db = database(rows);
  db.exec('CREATE INDEX tasks_due_date ON tasks(due_date)');
  const started = performance.now();
  for (let i = 0; i < 20; i += 1) run(db, { search: 'gym', categoryIds: ['cat-health'], status: 'overdue', date: 'week', priorities: ['high', 'low'] });
  const perQuery = (performance.now() - started) / 20;
  assert.ok(perQuery < 50, `one filtered query took ${perQuery.toFixed(1)} ms`);
});

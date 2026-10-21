/**
 * ORDINA Calendar Screen
 * Week view with a full 24-hour day timeline, and a month overview.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { categoryInfo } from '@/features/categories';
import { useTheme } from '@/hooks/use-theme';
import { useTasksStore, type Task } from '@/store/tasks-store';
import { localDateKey } from '@/utils/dates';
import { useI18n } from '@/providers/i18n-provider';
import { healthColor, healthLabel, taskHealth } from '@/utils/task-health';

type ViewMode = 'week' | 'month';

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 12 AM – 11 PM
const HOUR_HEIGHT = 64;
/** One-letter weekday names, Monday first, in the app language (5 Oct 2026 is a Monday). */
function dayLabels(locale: string) {
  return Array.from({ length: 7 }, (_, index) => new Date(2026, 9, 5 + index).toLocaleDateString(locale, { weekday: 'narrow' }));
}

function padZero(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatHour(h: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
}

function getCategoryColor(category: string): string {
  return categoryInfo(category).color;
}

function getWeekDays(baseDate: Date): Date[] {
  const day = baseDate.getDay();
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function hourOf(task: Task) {
  const [h] = (task.startTime ?? '').split(':').map(Number);
  return Number.isFinite(h) ? h : -1;
}

export default function CalendarScreen() {
  const theme = useTheme();
  const { t: tr, locale } = useI18n();
  const DAY_LABELS = dayLabels(locale);
  const { tasks, loadTasks } = useTasksStore();
  const scrollRef = useRef<ScrollView>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekBase, setWeekBase] = useState(new Date());
  const [now, setNow] = useState(new Date());

  useFocusEffect(
    useCallback(() => {
      void loadTasks();
      setNow(new Date());
    }, [loadTasks]),
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const weekDays = getWeekDays(weekBase);
  const selectedISO = localDateKey(selectedDate);
  const todayISO = localDateKey(now);
  const isTodaySelected = selectedISO === todayISO;

  const dayTasks = useMemo(
    () => tasks
      .filter((t) => t.dueDate === selectedISO)
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? '')),
    [tasks, selectedISO],
  );
  const timedTasks = dayTasks.filter((t) => hourOf(t) >= 0);
  const untimedTasks = dayTasks.filter((t) => hourOf(t) < 0);

  // Open the day near "now" (today) or the first planned task, never at midnight.
  useEffect(() => {
    if (viewMode !== 'week') return;
    const firstHour = timedTasks.length ? hourOf(timedTasks[0]) : 8;
    const target = isTodaySelected ? Math.max(0, now.getHours() - 1) : Math.max(0, Math.min(firstHour, 8) - 1);
    const timer = setTimeout(() => scrollRef.current?.scrollTo({ y: target * HOUR_HEIGHT, animated: true }), 150);
    return () => clearTimeout(timer);
  }, [selectedISO, viewMode]);

  function shiftWeek(days: number) {
    const base = new Date(weekBase);
    base.setDate(base.getDate() + days);
    setWeekBase(base);
    const selected = new Date(selectedDate);
    selected.setDate(selected.getDate() + days);
    setSelectedDate(selected);
  }

  function shiftMonth(months: number) {
    const base = new Date(weekBase.getFullYear(), weekBase.getMonth() + months, 1);
    setWeekBase(base);
    setSelectedDate(base);
  }

  function goToday() {
    const today = new Date();
    setWeekBase(today);
    setSelectedDate(today);
  }

  function addAt(hour?: number) {
    router.push({
      pathname: '/new-task',
      params: hour === undefined ? { date: selectedISO } : { date: selectedISO, time: `${padZero(hour)}:00` },
    });
  }

  const monthLabel = weekBase.toLocaleString(locale, { month: 'long', year: 'numeric' });

  // Month grid
  const monthStart = new Date(weekBase.getFullYear(), weekBase.getMonth(), 1);
  const monthDays = new Date(weekBase.getFullYear(), weekBase.getMonth() + 1, 0).getDate();
  const leading = (monthStart.getDay() + 6) % 7;
  const monthCells = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: monthDays }, (_, i) => new Date(weekBase.getFullYear(), weekBase.getMonth(), i + 1)),
  ];

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  function renderTask(t: Task) {
    const health = taskHealth(t, now);
    const color = getCategoryColor(t.category);
    return (
      <Pressable
        key={t.id}
        onPress={() => router.push({ pathname: '/new-task', params: { id: t.id } })}
        style={[
          styles.scheduleBlock,
          { backgroundColor: color + (t.completed ? '55' : 'DD'), borderLeftColor: healthColor(health, theme) },
        ]}>
        <View style={styles.blockHead}>
          <ThemedText style={[styles.blockTitle, t.completed && styles.strike]} numberOfLines={1}>
            {t.title}
          </ThemedText>
          {t.completed ? <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" /> : null}
        </View>
        <ThemedText style={styles.blockSub} numberOfLines={1}>
          {[t.startTime, t.duration, healthLabel(health)].filter(Boolean).join(' • ')}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Header: month + view toggle */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={styles.monthRow}>
          <TouchableOpacity
            accessibilityLabel={tr('tasksTab.previous')}
            onPress={() => (viewMode === 'week' ? shiftWeek(-7) : shiftMonth(-1))}
            hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color={theme.text} />
          </TouchableOpacity>
          <ThemedText style={styles.monthLabel}>{monthLabel}</ThemedText>
          <TouchableOpacity
            accessibilityLabel={tr('tasksTab.next')}
            onPress={() => (viewMode === 'week' ? shiftWeek(7) : shiftMonth(1))}
            hitSlop={10}>
            <Ionicons name="chevron-forward" size={20} color={theme.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.headerActions}>
          {!isTodaySelected ? (
            <Pressable onPress={goToday} style={[styles.todayBtn, { borderColor: theme.primary }]}>
              <ThemedText style={[styles.todayText, { color: theme.primary }]}>{tr('task.today')}</ThemedText>
            </Pressable>
          ) : null}
          <View style={[styles.toggle, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            {(['week', 'month'] as ViewMode[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => setViewMode(m)}
                style={[styles.toggleBtn, { backgroundColor: viewMode === m ? theme.primary : 'transparent' }]}>
                <ThemedText style={[styles.toggleText, { color: viewMode === m ? '#FFFFFF' : theme.textSecondary }]}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {viewMode === 'month' ? (
        <ScrollView contentContainerStyle={styles.monthWrap}>
          <View style={styles.monthGrid}>
            {DAY_LABELS.map((label, i) => (
              <ThemedText key={`${label}-${i}`} themeColor="textSecondary" style={styles.monthWeekday}>
                {label}
              </ThemedText>
            ))}
            {monthCells.map((date, i) => {
              if (!date) return <View key={`blank-${i}`} style={styles.monthCell} />;
              const iso = localDateKey(date);
              const items = tasks.filter((t) => t.dueDate === iso);
              const isSelected = iso === selectedISO;
              const isToday = iso === todayISO;
              return (
                <Pressable
                  key={iso}
                  onPress={() => {
                    setSelectedDate(date);
                    setWeekBase(date);
                    setViewMode('week');
                  }}
                  style={[
                    styles.monthCell,
                    {
                      backgroundColor: isSelected ? theme.backgroundSelected : 'transparent',
                      borderColor: isToday ? theme.primary : 'transparent',
                    },
                  ]}>
                  <ThemedText style={[styles.monthDayText, isToday && { color: theme.primary }]}>{date.getDate()}</ThemedText>
                  <View style={styles.monthDots}>
                    {items.slice(0, 3).map((t) => (
                      <View key={t.id} style={[styles.monthDot, { backgroundColor: healthColor(taskHealth(t, now), theme) }]} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <ThemedText themeColor="textSecondary" style={styles.monthHint}>
            Tap a day to see its hour-by-hour schedule.
          </ThemedText>
        </ScrollView>
      ) : (
        <>
          {/* Day headers */}
          <View style={[styles.dayHeaderRow, { borderBottomColor: theme.border }]}>
            {weekDays.map((d, i) => {
              const iso = localDateKey(d);
              const isSelected = iso === selectedISO;
              const isToday = iso === todayISO;
              const count = tasks.filter((t) => t.dueDate === iso && !t.completed).length;
              return (
                <Pressable key={iso} onPress={() => setSelectedDate(d)} style={styles.dayHeaderCell}>
                  <ThemedText style={[styles.dayLetter, { color: isSelected ? theme.primary : theme.textSecondary }]}>
                    {DAY_LABELS[i]}
                  </ThemedText>
                  <View
                    style={[
                      styles.dayNumber,
                      {
                        backgroundColor: isSelected ? theme.primary : 'transparent',
                        borderWidth: isToday && !isSelected ? 1 : 0,
                        borderColor: theme.primary,
                      },
                    ]}>
                    <ThemedText
                      style={[styles.dayNumberText, { color: isSelected ? '#FFFFFF' : isToday ? theme.primary : theme.text }]}>
                      {d.getDate()}
                    </ThemedText>
                  </View>
                  <View style={[styles.countDot, { backgroundColor: count ? theme.primary : 'transparent' }]} />
                </Pressable>
              );
            })}
          </View>

          <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {untimedTasks.length ? (
              <View style={[styles.untimed, { borderBottomColor: theme.border }]}>
                <ThemedText themeColor="textSecondary" style={styles.untimedLabel}>
                  Any time
                </ThemedText>
                <View style={styles.timeSlot}>{untimedTasks.map(renderTask)}</View>
              </View>
            ) : null}

            {HOURS.map((hour) => {
              const hourTasks = timedTasks.filter((t) => hourOf(t) === hour);
              const showNow = isTodaySelected && Math.floor(nowMinutes / 60) === hour;
              return (
                <Pressable
                  key={hour}
                  onPress={() => addAt(hour)}
                  accessibilityLabel={`Add a task at ${formatHour(hour)}`}
                  style={[styles.timeRow, { borderTopColor: theme.border }]}>
                  <ThemedText
                    themeColor="textSecondary"
                    style={[styles.timeLabel, isTodaySelected && hour === now.getHours() && { color: theme.danger }]}>
                    {formatHour(hour)}
                  </ThemedText>
                  <View style={styles.timeSlot}>{hourTasks.map(renderTask)}</View>
                  {showNow ? (
                    <View
                      pointerEvents="none"
                      style={[styles.nowLine, { top: ((nowMinutes % 60) / 60) * HOUR_HEIGHT, backgroundColor: theme.danger }]}>
                      <View style={[styles.nowDot, { backgroundColor: theme.danger }]} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            accessibilityLabel={tr('tasksTab.addOnDay')}
            onPress={() => addAt()}
            style={[styles.fab, { backgroundColor: theme.primary }]}>
            <Ionicons name="add" size={26} color="#FFFFFF" />
          </Pressable>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  monthLabel: { fontSize: 16, fontFamily: 'Poppins_600SemiBold', flexShrink: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  todayBtn: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  todayText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
  toggle: { flexDirection: 'row', borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  toggleText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  dayHeaderRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, paddingHorizontal: 8 },
  dayHeaderCell: { flex: 1, alignItems: 'center', gap: 4 },
  dayLetter: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  dayNumber: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayNumberText: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
  countDot: { width: 5, height: 5, borderRadius: 3 },
  untimed: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1 },
  untimedLabel: { width: 64, paddingLeft: 12, paddingTop: 4, fontSize: 11 },
  timeRow: { flexDirection: 'row', minHeight: HOUR_HEIGHT, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  timeLabel: { width: 64, paddingLeft: 12, paddingTop: 2, fontSize: 11 },
  timeSlot: { flex: 1, paddingRight: 16, gap: 4 },
  scheduleBlock: { borderRadius: 8, borderLeftWidth: 4, padding: 8, gap: 2 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  blockTitle: { flex: 1, color: '#FFFFFF', fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  strike: { textDecorationLine: 'line-through' },
  blockSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontFamily: 'Poppins_400Regular' },
  nowLine: { position: 'absolute', left: 60, right: 0, height: 2 },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4 },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  monthWrap: { padding: 12 },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthWeekday: { width: '14.2857%', textAlign: 'center', fontSize: 12, paddingVertical: 6 },
  monthCell: {
    width: '14.2857%',
    aspectRatio: 0.85,
    alignItems: 'center',
    paddingTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  monthDayText: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
  monthDots: { flexDirection: 'row', gap: 3 },
  monthDot: { width: 6, height: 6, borderRadius: 3 },
  monthHint: { textAlign: 'center', fontSize: 12, marginTop: 16 },
});

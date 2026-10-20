/**
 * Editable preview of a plan (ORDINA AI, or a written plan split on the phone). Suggested values
 * are marked so the user can tell them apart from what they said; nothing is saved until they
 * confirm. Each task gets a category (suggested from its title), may be Anytime, and may have
 * no duration.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';
import { formatDay, formatDuration, formatTime } from '@/i18n/format';
import { DURATION_PRESETS } from '@/logic/schedule';
import { useI18n } from '@/providers/i18n-provider';
import type { DraftTask, PlanField, PlanPriority, PlanQuestion, ValueSource } from '@/types/plan';
import { displaySource, editDraft, formatDeadline, overlapsByTask, shiftDate, shiftTime } from '@/utils/plan-draft';

type Theme = ReturnType<typeof useTheme>;

const PRIORITY_COLORS: Record<PlanPriority, string> = { low: '#3B82F6', medium: '#F59E0B', high: '#EF4444' };
const SOURCE_KEY: Record<ValueSource, string> = { user: 'plan.sourceUser', ai: 'plan.sourceAi', habit: 'plan.sourceHabit' };

function ValuePill({ label, field, source, theme, color }: { label: string; field: string; source: ValueSource; theme: Theme; color?: string }) {
  const { t } = useI18n();
  const suggested = source !== 'user';
  return (
    <View
      accessible
      accessibilityLabel={`${field} ${label}, ${t(SOURCE_KEY[source])}`}
      style={[
        styles.pill,
        suggested
          ? { backgroundColor: theme.backgroundSelected, borderColor: theme.primary, borderStyle: 'dashed' }
          : { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      {source === 'ai' ? <Ionicons name="sparkles" size={11} color={theme.primary} /> : null}
      {source === 'habit' ? <Ionicons name="repeat" size={11} color={theme.primary} /> : null}
      <ThemedText style={[styles.pillText, { color: suggested ? theme.primary : theme.text }]} numberOfLines={1}>{label}</ThemedText>
    </View>
  );
}

function Stepper({ label, onPrev, onNext, prevLabel, nextLabel, theme }: {
  label: string; onPrev: () => void; onNext: () => void; prevLabel: string; nextLabel: string; theme: Theme;
}) {
  return (
    <View style={[styles.stepper, { borderColor: theme.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={prevLabel} onPress={onPrev} style={styles.stepButton}>
        <Ionicons name="remove" size={18} color={theme.text} />
      </Pressable>
      <ThemedText style={styles.stepLabel} numberOfLines={1}>{label}</ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel={nextLabel} onPress={onNext} style={styles.stepButton}>
        <Ionicons name="add" size={18} color={theme.text} />
      </Pressable>
    </View>
  );
}

function TaskEditor({ task, today, titleMax, onChange, theme }: { task: DraftTask; today: string; titleMax: number; onChange: (task: DraftTask) => void; theme: Theme }) {
  const { t, locale } = useI18n();
  const { categories, nameOf } = useCategories();
  const set = <K extends PlanField | 'title'>(field: K, value: DraftTask[K]) => onChange(editDraft(task, field, value));
  const durations = [...new Set([...DURATION_PRESETS, ...(task.durationMinutes ? [task.durationMinutes] : [])])].sort((a, b) => a - b);
  return (
    <View style={styles.editor}>
      <TextInput
        value={task.title}
        onChangeText={(text) => set('title', text)}
        accessibilityLabel={t('task.titleLabel')}
        maxLength={titleMax}
        placeholder={t('task.titleLabel')}
        placeholderTextColor={theme.textSecondary}
        style={[styles.titleInput, { color: theme.text, borderColor: task.title.trim() ? theme.border : theme.danger }]}
      />
      {!task.title.trim() ? <ThemedText style={[styles.fieldError, { color: theme.danger }]}>{t('errors.titleRequired')}</ThemedText> : null}
      <View style={styles.editorRow}>
        <ThemedText themeColor="textSecondary" style={styles.editorLabel}>{t('task.day')}</ThemedText>
        <Stepper
          theme={theme}
          label={formatDay(locale, task.date)}
          prevLabel={t('plan.prevDay')}
          nextLabel={t('plan.nextDay')}
          onPrev={() => set('date', shiftDate(task.date, -1, today))}
          onNext={() => set('date', shiftDate(task.date, 1, today))}
        />
      </View>
      <View style={styles.editorRow}>
        <ThemedText themeColor="textSecondary" style={styles.editorLabel}>{t('plan.start')}</ThemedText>
        <Stepper
          theme={theme}
          label={task.startTime ? formatTime(locale, task.startTime) : t('task.anytime')}
          prevLabel={t('plan.earlier')}
          nextLabel={t('plan.later')}
          onPrev={() => set('startTime', shiftTime(task.startTime, -15))}
          onNext={() => set('startTime', shiftTime(task.startTime, 15))}
        />
      </View>
      <View style={styles.optionRow}>
        <Chip label={t('task.anytime')} active={!task.startTime} onPress={() => set('startTime', null)} />
      </View>
      <ThemedText themeColor="textSecondary" style={styles.editorHeading}>{t('task.duration')}</ThemedText>
      <View style={styles.optionRow}>
        <Chip label={t('task.noDuration')} active={task.durationMinutes === null} onPress={() => set('durationMinutes', null)} />
        {durations.map((minutes) => (
          <Chip key={minutes} label={formatDuration(locale, minutes)} active={task.durationMinutes === minutes} onPress={() => set('durationMinutes', minutes)} />
        ))}
      </View>
      <ThemedText themeColor="textSecondary" style={styles.editorHeading}>{t('priority.label')}</ThemedText>
      <View style={styles.optionRow}>
        {(['low', 'medium', 'high'] as const).map((id) => (
          <Chip key={id} color={PRIORITY_COLORS[id]} label={t(`priority.${id}`)} active={task.priority === id} onPress={() => set('priority', id)} />
        ))}
      </View>
      <ThemedText themeColor="textSecondary" style={styles.editorHeading}>{t('categories.label')}</ThemedText>
      <View style={styles.optionRow}>
        {categories.map((category) => (
          <Chip
            key={category.id}
            icon={category.icon}
            color={category.color}
            label={nameOf(category.id)}
            active={task.categoryId === category.id}
            onPress={() => set('categoryId', category.id)}
          />
        ))}
      </View>
    </View>
  );
}

function TaskCard({ task, today, titleMax, expanded, overlaps, needsNewTime, onToggle, onChange, onRemove, theme }: {
  task: DraftTask; today: string; titleMax: number; expanded: boolean; overlaps: string[]; needsNewTime: boolean; onToggle: () => void; onChange: (task: DraftTask) => void; onRemove: () => void; theme: Theme;
}) {
  const { t, locale } = useI18n();
  const { find, nameOf } = useCategories();
  const deadline = formatDeadline(task.deadline);
  const title = task.title || t('plan.untitled');
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: needsNewTime ? theme.danger : expanded ? theme.primary : theme.border }]}>
      <View style={styles.cardHead}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? t('plan.doneEditing') : t('plan.edit', { title })}
          onPress={onToggle}
          style={styles.cardMain}>
          <ThemedText style={styles.cardTitle} numberOfLines={2}>{title}</ThemedText>
          <View style={styles.pills}>
            <ValuePill theme={theme} field={t('task.day')} label={formatDay(locale, task.date)} source={displaySource(task, 'date')} />
            <ValuePill theme={theme} field={t('plan.start')} label={task.startTime ? formatTime(locale, task.startTime) : t('task.anytime')} source={displaySource(task, 'startTime')} />
            {task.durationMinutes ? (
              <ValuePill theme={theme} field={t('task.duration')} label={formatDuration(locale, task.durationMinutes)} source={displaySource(task, 'durationMinutes')} />
            ) : null}
            <ValuePill theme={theme} field={t('priority.label')} label={t(`priority.${task.priority}`)} source={displaySource(task, 'priority')} />
            <ValuePill theme={theme} field={t('categories.label')} label={nameOf(task.categoryId)} color={find(task.categoryId).color} source={displaySource(task, 'categoryId')} />
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={expanded ? t('plan.doneEditing') : t('plan.edit', { title })} onPress={onToggle} style={styles.iconButton}>
          <Ionicons name={expanded ? 'checkmark' : 'create-outline'} size={20} color={theme.primary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('plan.remove', { title })} onPress={onRemove} style={styles.iconButton}>
          <Ionicons name="trash-outline" size={19} color={theme.danger} />
        </Pressable>
      </View>
      {needsNewTime ? (
        <View style={styles.noteRow}>
          <Ionicons name="time-outline" size={13} color={theme.danger} />
          <ThemedText style={[styles.note, { color: theme.danger, fontFamily: 'Poppins_600SemiBold' }]}>
            {t('plan.needsNewTime', { time: task.startTime ? formatTime(locale, task.startTime) : t('plan.thisTime') })}
          </ThemedText>
        </View>
      ) : null}
      {deadline ? (
        <View style={styles.noteRow}>
          <Ionicons name="flag-outline" size={13} color={theme.danger} />
          <ThemedText style={[styles.note, { color: theme.danger }]}>
            {deadline.time
              ? t('task.deadlineBefore', { day: formatDay(locale, deadline.date), time: formatTime(locale, deadline.time) })
              : t('task.deadline', { day: formatDay(locale, deadline.date) })} {t('plan.fromYou')}
          </ThemedText>
        </View>
      ) : null}
      {task.adjustedNote ? (
        <View style={styles.noteRow}>
          <Ionicons name="information-circle-outline" size={13} color={theme.textSecondary} />
          <ThemedText themeColor="textSecondary" style={styles.note}>{task.adjustedNote}</ThemedText>
        </View>
      ) : null}
      {overlaps.length ? (
        <View style={styles.noteRow}>
          <Ionicons name="warning-outline" size={13} color={theme.warning} />
          <ThemedText style={[styles.note, { color: theme.warning }]}>
            {t('plan.overlaps', { titles: overlaps.map((other) => `“${other}”`).join(', ') })}
          </ThemedText>
        </View>
      ) : null}
      {task.warnings.map((warning) => (
        <View key={warning} style={styles.noteRow}>
          <Ionicons name="warning-outline" size={13} color={theme.warning} />
          <ThemedText style={[styles.note, { color: theme.warning }]}>{warning}</ThemedText>
        </View>
      ))}
      {expanded ? <TaskEditor task={task} today={today} titleMax={titleMax} onChange={onChange} theme={theme} /> : null}
    </View>
  );
}

function QuestionCard({ question, answer, onAnswer, theme }: { question: PlanQuestion; answer: string; onAnswer: (text: string) => void; theme: Theme }) {
  const { t } = useI18n();
  return (
    <View style={[styles.question, { borderColor: theme.warning, backgroundColor: `${theme.warning}12` }]}>
      <View style={styles.noteRow}>
        <Ionicons name="help-circle" size={18} color={theme.warning} />
        <ThemedText style={styles.questionText}>{question.question}</ThemedText>
      </View>
      {question.options.length ? (
        <View style={styles.optionRow}>
          {question.options.map((option) => (
            <Chip key={option} label={option} active={answer === option} onPress={() => onAnswer(option)} />
          ))}
        </View>
      ) : null}
      <TextInput
        value={answer}
        onChangeText={onAnswer}
        placeholder={t('plan.answerPlaceholder')}
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel={t('plan.answerLabel', { question: question.question })}
        maxLength={300}
        style={[styles.answerInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
      />
    </View>
  );
}

export type PlanReviewProps = {
  summary: string;
  tasks: DraftTask[];
  questions: PlanQuestion[];
  assumptions: string[];
  answers: Record<string, string>;
  today: string;
  saving: boolean;
  replanning: boolean;
  onChangeTasks: (tasks: DraftTask[]) => void;
  onAnswer: (id: string, text: string) => void;
  onSubmitAnswers: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  /** Defaults to "Review your plan". */
  heading?: string;
  subheading?: string;
  /** Label of the save button for the number of tasks. */
  confirmLabel?: (count: number) => string;
  /** Shows a heading for each day, tasks in time order (Anytime last). */
  groupByDay?: boolean;
  /** Tasks that can't be saved until the user picks a new time (e.g. a time already over). */
  needsNewTime?: (task: DraftTask) => boolean;
  titleMax?: number;
};

export function PlanReview(props: PlanReviewProps) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const { tasks, questions, answers, saving, replanning } = props;
  const [expanded, setExpanded] = useState<string | null>(null);
  const answered = questions.filter((question) => (answers[question.id] ?? '').trim()).length;
  const blocked = tasks.filter((task) => props.needsNewTime?.(task)).length;
  const invalid = tasks.some((task) => !task.title.trim()) || blocked > 0;
  const titleMax = props.titleMax ?? 200;
  const ordered = props.groupByDay
    ? [...tasks].sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99'))
    : tasks;
  const busy = saving || replanning;
  const overlaps = overlapsByTask(tasks);
  const disabled = !tasks.length || invalid || busy;

  const update = (next: DraftTask) => props.onChangeTasks(tasks.map((task) => (task.key === next.key ? next : task)));
  const remove = (key: string) => {
    if (expanded === key) setExpanded(null);
    props.onChangeTasks(tasks.filter((task) => task.key !== key));
  };

  return (
    <View style={[styles.review, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.reviewHead}>
        <ThemedText style={styles.reviewTitle} accessibilityRole="header" accessibilityHint={props.summary}>{props.heading ?? t('plan.reviewTitle')}</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.reviewSummary}>{props.subheading ?? t('plan.reviewSub')}</ThemedText>
      </View>

      {tasks.length ? (
        <View style={styles.legend} accessibilityLabel={t('plan.legendA11y')}>
          <Ionicons name="sparkles" size={12} color={theme.primary} />
          <ThemedText themeColor="textSecondary" style={styles.legendText}>{t('plan.legendSuggested')}</ThemedText>
          {tasks.some((task) => Object.values(task.sources).includes('habit')) ? (
            <>
              <Ionicons name="repeat" size={12} color={theme.primary} />
              <ThemedText themeColor="textSecondary" style={styles.legendText}>{t('plan.legendHabit')}</ThemedText>
            </>
          ) : null}
          <View style={[styles.legendSwatch, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]} />
          <ThemedText themeColor="textSecondary" style={styles.legendText}>{t('plan.legendYours')}</ThemedText>
        </View>
      ) : null}

      {questions.length ? (
        <View style={{ gap: 10 }}>
          <ThemedText style={styles.sectionLabel}>{t('plan.questions', { count: questions.length })}</ThemedText>
          {questions.map((question) => (
            <QuestionCard
              key={question.id}
              theme={theme}
              question={question}
              answer={answers[question.id] ?? ''}
              onAnswer={(text) => props.onAnswer(question.id, text)}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            disabled={!answered || busy}
            onPress={props.onSubmitAnswers}
            style={[styles.secondary, { borderColor: theme.primary, opacity: !answered || busy ? 0.5 : 1 }]}>
            {replanning ? <ActivityIndicator color={theme.primary} /> : <Ionicons name="refresh" size={16} color={theme.primary} />}
            <ThemedText style={[styles.secondaryText, { color: theme.primary }]}>{replanning ? t('plan.updating') : t('plan.updateWithAnswers')}</ThemedText>
          </Pressable>
        </View>
      ) : null}

      {ordered.map((task, index) => (
        <View key={task.key} style={{ gap: 8 }}>
          {props.groupByDay && ordered[index - 1]?.date !== task.date ? (
            <ThemedText accessibilityRole="header" style={styles.sectionLabel}>{formatDay(locale, task.date)}</ThemedText>
          ) : null}
          <TaskCard
            theme={theme}
            task={task}
            today={props.today}
            titleMax={titleMax}
            needsNewTime={Boolean(props.needsNewTime?.(task))}
            expanded={expanded === task.key}
            overlaps={overlaps.get(task.key) ?? []}
            onToggle={() => setExpanded(expanded === task.key ? null : task.key)}
            onChange={update}
            onRemove={() => remove(task.key)}
          />
        </View>
      ))}

      {blocked ? (
        <ThemedText accessibilityRole="alert" style={[styles.note, { color: theme.danger }]}>{t('plan.blocked', { count: blocked })}</ThemedText>
      ) : null}

      {!tasks.length && !questions.length ? <ThemedText themeColor="textSecondary">{t('plan.empty')}</ThemedText> : null}

      {props.assumptions.length ? (
        <View style={{ gap: 4 }}>
          <ThemedText style={styles.sectionLabel}>{t('plan.assumed')}</ThemedText>
          {props.assumptions.map((item) => (
            <ThemedText key={item} themeColor="textSecondary" style={styles.note}>• {item}</ThemedText>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled, busy: saving }}
          disabled={disabled}
          onPress={props.onConfirm}
          style={[styles.primary, { backgroundColor: theme.primary, opacity: disabled ? 0.5 : 1 }]}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />}
          <ThemedText style={styles.primaryText} numberOfLines={2}>
            {saving ? t('plan.adding') : props.confirmLabel ? props.confirmLabel(tasks.length) : t('plan.add', { count: tasks.length })}
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={props.onCancel}
          style={[styles.cancel, { backgroundColor: theme.backgroundSelected, opacity: saving ? 0.5 : 1 }]}>
          <ThemedText style={styles.cancelText}>{t('common.cancel')}</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  review: { borderWidth: 1, borderRadius: 20, padding: 14, gap: 12 },
  reviewHead: { gap: 4 },
  reviewTitle: { fontSize: 17, fontFamily: 'Poppins_600SemiBold' },
  reviewSummary: { fontSize: 14, lineHeight: 20 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  legendText: { fontSize: 11, marginRight: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 4, borderWidth: 1 },
  sectionLabel: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  cardMain: { flex: 1, gap: 6, minHeight: 44 },
  cardTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, maxWidth: 200 },
  pillText: { fontSize: 12, fontFamily: 'Poppins_500Medium', flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  note: { fontSize: 12, lineHeight: 17, flex: 1 },
  editor: { gap: 10, paddingTop: 4 },
  editorHeading: { fontSize: 12, fontFamily: 'Poppins_500Medium', marginBottom: -4 },
  titleInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, fontSize: 15, fontFamily: 'Poppins_500Medium' },
  fieldError: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  editorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editorLabel: { width: 64, fontSize: 13 },
  stepper: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12 },
  stepButton: { width: 48, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { flex: 1, textAlign: 'center', fontSize: 14, fontFamily: 'Poppins_500Medium' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  question: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  questionText: { flex: 1, fontSize: 14, fontFamily: 'Poppins_500Medium' },
  answerInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, fontSize: 14 },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 14, minHeight: 48 },
  secondaryText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  primary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, minHeight: 52, paddingHorizontal: 12 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Poppins_700Bold', flexShrink: 1, textAlign: 'center' },
  cancel: { borderRadius: 16, minHeight: 52, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
});

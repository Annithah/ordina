/**
 * Editable preview of an ORDINA AI plan. Suggested values are marked so the user
 * can tell them apart from what they said; nothing is saved until they confirm.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { DraftTask, PlanField, PlanPriority, PlanQuestion, ValueSource } from '@/types/plan';
import { displaySource, editDraft, formatDeadline, overlapsByTask, shiftDate, shiftTime } from '@/utils/plan-draft';
import { formatDuration, formatTime12, friendlyDay } from '@/utils/task-planning';

type Theme = ReturnType<typeof useTheme>;

const DURATIONS = [15, 30, 45, 60, 90, 120];
const PRIORITIES: { id: PlanPriority; label: string; color: string }[] = [
  { id: 'low', label: 'Low', color: '#3B82F6' },
  { id: 'medium', label: 'Medium', color: '#F59E0B' },
  { id: 'high', label: 'High', color: '#EF4444' },
];
const SOURCE_TEXT: Record<ValueSource, string> = {
  user: 'from you',
  ai: 'suggested by ORDINA',
  habit: 'based on your habits',
};

function ValuePill({ label, field, source, theme }: { label: string; field: string; source: ValueSource; theme: Theme }) {
  const suggested = source !== 'user';
  return (
    <View
      accessible
      accessibilityLabel={`${field} ${label}, ${SOURCE_TEXT[source]}`}
      style={[
        styles.pill,
        suggested
          ? { backgroundColor: theme.backgroundSelected, borderColor: theme.primary, borderStyle: 'dashed' }
          : { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      {source === 'ai' ? <Ionicons name="sparkles" size={11} color={theme.primary} /> : null}
      {source === 'habit' ? <Ionicons name="repeat" size={11} color={theme.primary} /> : null}
      <ThemedText style={[styles.pillText, { color: suggested ? theme.primary : theme.text }]}>{label}</ThemedText>
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
      <ThemedText style={styles.stepLabel}>{label}</ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel={nextLabel} onPress={onNext} style={styles.stepButton}>
        <Ionicons name="add" size={18} color={theme.text} />
      </Pressable>
    </View>
  );
}

function Option({ label, active, onPress, theme, color }: { label: string; active: boolean; onPress: () => void; theme: Theme; color?: string }) {
  const tint = color ?? theme.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.option, { borderColor: active ? tint : theme.border, backgroundColor: active ? `${tint}1F` : 'transparent' }]}>
      <ThemedText style={[styles.optionText, { color: active ? tint : theme.text }]}>{label}</ThemedText>
    </Pressable>
  );
}

function TaskEditor({ task, today, titleMax, onChange, theme }: { task: DraftTask; today: string; titleMax: number; onChange: (task: DraftTask) => void; theme: Theme }) {
  const set = <K extends PlanField | 'title'>(field: K, value: DraftTask[K]) => onChange(editDraft(task, field, value));
  return (
    <View style={styles.editor}>
      <TextInput
        value={task.title}
        onChangeText={(text) => set('title', text)}
        accessibilityLabel="Task title"
        maxLength={titleMax}
        placeholder="Task title"
        placeholderTextColor={theme.textSecondary}
        style={[styles.titleInput, { color: theme.text, borderColor: task.title.trim() ? theme.border : theme.danger }]}
      />
      {!task.title.trim() ? <ThemedText style={[styles.fieldError, { color: theme.danger }]}>Please add a task title.</ThemedText> : null}
      <View style={styles.editorRow}>
        <ThemedText themeColor="textSecondary" style={styles.editorLabel}>Day</ThemedText>
        <Stepper
          theme={theme}
          label={friendlyDay(task.date)}
          prevLabel="Previous day"
          nextLabel="Next day"
          onPrev={() => set('date', shiftDate(task.date, -1, today))}
          onNext={() => set('date', shiftDate(task.date, 1, today))}
        />
      </View>
      <View style={styles.editorRow}>
        <ThemedText themeColor="textSecondary" style={styles.editorLabel}>Start</ThemedText>
        <Stepper
          theme={theme}
          label={task.startTime ? formatTime12(task.startTime) : 'Any time'}
          prevLabel="15 minutes earlier"
          nextLabel="15 minutes later"
          onPrev={() => set('startTime', shiftTime(task.startTime, -15))}
          onNext={() => set('startTime', shiftTime(task.startTime, 15))}
        />
      </View>
      <View style={styles.optionRow}>
        {[...new Set([...DURATIONS, task.durationMinutes])].sort((a, b) => a - b).map((minutes) => (
          <Option key={minutes} theme={theme} label={formatDuration(minutes)} active={task.durationMinutes === minutes} onPress={() => set('durationMinutes', minutes)} />
        ))}
      </View>
      <View style={styles.optionRow}>
        {PRIORITIES.map((item) => (
          <Option key={item.id} theme={theme} color={item.color} label={item.label} active={task.priority === item.id} onPress={() => set('priority', item.id)} />
        ))}
      </View>
    </View>
  );
}

function TaskCard({ task, today, titleMax, expanded, overlaps, needsNewTime, onToggle, onChange, onRemove, theme }: {
  task: DraftTask; today: string; titleMax: number; expanded: boolean; overlaps: string[]; needsNewTime: boolean; onToggle: () => void; onChange: (task: DraftTask) => void; onRemove: () => void; theme: Theme;
}) {
  const deadline = formatDeadline(task.deadline);
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: needsNewTime ? theme.danger : expanded ? theme.primary : theme.border }]}>
      <View style={styles.cardHead}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${task.title}. ${expanded ? 'Close editor' : 'Edit'}`}
          onPress={onToggle}
          style={styles.cardMain}>
          <ThemedText style={styles.cardTitle} numberOfLines={2}>{task.title || 'Untitled task'}</ThemedText>
          <View style={styles.pills}>
            <ValuePill theme={theme} field="Day" label={friendlyDay(task.date)} source={displaySource(task, 'date')} />
            <ValuePill theme={theme} field="Start" label={task.startTime ? formatTime12(task.startTime) : 'Any time'} source={displaySource(task, 'startTime')} />
            <ValuePill theme={theme} field="Duration" label={formatDuration(task.durationMinutes)} source={displaySource(task, 'durationMinutes')} />
            <ValuePill theme={theme} field="Priority" label={`${task.priority[0].toUpperCase()}${task.priority.slice(1)}`} source={displaySource(task, 'priority')} />
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Done editing' : `Edit ${task.title}`} onPress={onToggle} style={styles.iconButton}>
          <Ionicons name={expanded ? 'checkmark' : 'create-outline'} size={20} color={theme.primary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${task.title} from the plan`} onPress={onRemove} style={styles.iconButton}>
          <Ionicons name="trash-outline" size={19} color={theme.danger} />
        </Pressable>
      </View>
      {needsNewTime ? (
        <View style={styles.noteRow}>
          <Ionicons name="time-outline" size={13} color={theme.danger} />
          <ThemedText style={[styles.note, { color: theme.danger, fontFamily: 'Poppins_600SemiBold' }]}>
            Needs a new time: {task.startTime ? formatTime12(task.startTime) : 'this time'} has already passed today. Tap to change it.
          </ThemedText>
        </View>
      ) : null}
      {deadline ? (
        <View style={styles.noteRow}>
          <Ionicons name="flag-outline" size={13} color={theme.danger} />
          <ThemedText style={[styles.note, { color: theme.danger }]}>
            Deadline: {friendlyDay(deadline.date)}{deadline.time ? `, before ${formatTime12(deadline.time)}` : ''} (from you)
          </ThemedText>
        </View>
      ) : null}
      {task.adjustedNote ? (
        <View style={styles.noteRow}>
          <Ionicons name="swap-vertical" size={13} color={theme.textSecondary} />
          <ThemedText themeColor="textSecondary" style={styles.note}>{task.adjustedNote}</ThemedText>
        </View>
      ) : null}
      {overlaps.length ? (
        <View style={styles.noteRow}>
          <Ionicons name="warning-outline" size={13} color={theme.warning} />
          <ThemedText style={[styles.note, { color: theme.warning }]}>
            Overlaps with {overlaps.map((title) => `“${title}”`).join(', ')}.
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
  return (
    <View style={[styles.question, { borderColor: theme.warning, backgroundColor: `${theme.warning}12` }]}>
      <View style={styles.noteRow}>
        <Ionicons name="help-circle" size={18} color={theme.warning} />
        <ThemedText style={styles.questionText}>{question.question}</ThemedText>
      </View>
      {question.options.length ? (
        <View style={styles.optionRow}>
          {question.options.map((option) => (
            <Option key={option} theme={theme} label={option} active={answer === option} onPress={() => onAnswer(option)} />
          ))}
        </View>
      ) : null}
      <TextInput
        value={answer}
        onChangeText={onAnswer}
        placeholder="Or type your answer"
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel={`Answer: ${question.question}`}
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
  /** Shows a heading for each day, tasks in time order. */
  groupByDay?: boolean;
  /** Tasks that can't be saved until the user picks a new time (e.g. a time already over). */
  needsNewTime?: (task: DraftTask) => boolean;
  titleMax?: number;
};

export function PlanReview(props: PlanReviewProps) {
  const theme = useTheme();
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

  const update = (next: DraftTask) => props.onChangeTasks(tasks.map((task) => (task.key === next.key ? next : task)));
  const remove = (key: string) => {
    if (expanded === key) setExpanded(null);
    props.onChangeTasks(tasks.filter((task) => task.key !== key));
  };

  return (
    <View style={[styles.review, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.reviewHead}>
        <ThemedText style={styles.reviewTitle} accessibilityHint={props.summary}>{props.heading ?? 'Review your plan'}</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.reviewSummary}>
          {props.subheading ?? 'Nothing is saved until you add it. Edit or remove anything first.'}
        </ThemedText>
      </View>

      {tasks.length ? (
        <View style={styles.legend} accessibilityLabel="Legend: sparkles mark ORDINA suggestions, the repeat icon marks values from your habits, plain values are what you said.">
          <Ionicons name="sparkles" size={12} color={theme.primary} />
          <ThemedText themeColor="textSecondary" style={styles.legendText}>Suggested</ThemedText>
          <Ionicons name="repeat" size={12} color={theme.primary} />
          {tasks.some((task) => Object.values(task.sources).includes('habit')) ? (
            <ThemedText themeColor="textSecondary" style={styles.legendText}>Your usual</ThemedText>
          ) : null}
          <View style={[styles.legendSwatch, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]} />
          <ThemedText themeColor="textSecondary" style={styles.legendText}>What you said · tap a task to edit</ThemedText>
        </View>
      ) : null}

      {questions.length ? (
        <View style={{ gap: 10 }}>
          <ThemedText style={styles.sectionLabel}>
            {questions.length === 1 ? 'One question before I can plan everything' : `${questions.length} questions before I can plan everything`}
          </ThemedText>
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
            <ThemedText style={[styles.secondaryText, { color: theme.primary }]}>{replanning ? 'Updating plan…' : 'Update plan with my answers'}</ThemedText>
          </Pressable>
        </View>
      ) : null}

      {ordered.map((task, index) => (
        <View key={task.key} style={{ gap: 8 }}>
          {props.groupByDay && ordered[index - 1]?.date !== task.date ? (
            <ThemedText accessibilityRole="header" style={styles.sectionLabel}>{friendlyDay(task.date)}</ThemedText>
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
        <ThemedText accessibilityRole="alert" style={[styles.note, { color: theme.danger }]}>
          {blocked === 1 ? '1 task needs a new time before you can save.' : `${blocked} tasks need a new time before you can save.`}
        </ThemedText>
      ) : null}

      {!tasks.length && !questions.length ? (
        <ThemedText themeColor="textSecondary">No tasks left in this plan.</ThemedText>
      ) : null}

      {props.assumptions.length ? (
        <View style={{ gap: 4 }}>
          <ThemedText style={styles.sectionLabel}>What I assumed</ThemedText>
          {props.assumptions.map((item) => (
            <ThemedText key={item} themeColor="textSecondary" style={styles.note}>• {item}</ThemedText>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !tasks.length || invalid || busy, busy: saving }}
          disabled={!tasks.length || invalid || busy}
          onPress={props.onConfirm}
          style={[styles.primary, { backgroundColor: theme.primary, opacity: !tasks.length || invalid || busy ? 0.5 : 1 }]}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />}
          <ThemedText style={styles.primaryText}>
            {saving ? 'Adding…' : props.confirmLabel ? props.confirmLabel(tasks.length) : tasks.length > 1 ? `Add ${tasks.length} tasks to my plan` : 'Add tasks to my plan'}
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={props.onCancel}
          style={[styles.cancel, { backgroundColor: theme.backgroundSelected, opacity: saving ? 0.5 : 1 }]}>
          <ThemedText style={styles.cancelText}>Cancel</ThemedText>
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
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  note: { fontSize: 12, lineHeight: 17, flex: 1 },
  editor: { gap: 10, paddingTop: 4 },
  titleInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, fontSize: 15, fontFamily: 'Poppins_500Medium' },
  fieldError: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  editorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editorLabel: { width: 44, fontSize: 13 },
  stepper: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12 },
  stepButton: { width: 48, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { flex: 1, textAlign: 'center', fontSize: 14, fontFamily: 'Poppins_500Medium' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  optionText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  question: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  questionText: { flex: 1, fontSize: 14, fontFamily: 'Poppins_500Medium' },
  answerInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, fontSize: 14 },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 14, minHeight: 48 },
  secondaryText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  primary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, minHeight: 52, paddingHorizontal: 12 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Poppins_700Bold' },
  cancel: { borderRadius: 16, minHeight: 52, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
});

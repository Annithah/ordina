/**
 * Settings > Categories: every category with its subcategories, colour, icon and task count.
 * Add, edit, reorder (drag the handle), pin, archive, merge and delete (choosing what happens
 * to the tasks). Tap a category to open its detail screen.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryFormSheet, CategoryPicker, asIcon } from '@/components/category-ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DragHandle, DraggableList, useRowPosition } from '@/components/draggable-list';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { OTHER_ID, buildTree, fold, withChildren, type CategoryRecord } from '@/features/category-tree';
import { useTheme } from '@/hooks/use-theme';
import { href } from '@/utils/href';
import { useI18n } from '@/providers/i18n-provider';
import { CategoryError, nameOf, useCategoriesStore } from '@/store/categories-store';
import { useTasksStore } from '@/store/tasks-store';

const ROW_HEIGHT = 56;
const CHILD_HEIGHT = 48;

type Menu = { record: CategoryRecord } | null;
type Form = { editId?: string; parentId?: string | null } | null;
type DeleteState = { record: CategoryRecord; taskCount: number; step: 'choose' | 'confirmTasks'; moveTo: string | null } | null;

export default function CategoriesScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const categories = useCategoriesStore((s) => s.categories);
  const { setArchived, setPinned, move, remove, merge } = useCategoriesStore.getState();
  const tasks = useTasksStore((s) => s.tasks);
  const [query, setQuery] = useState('');
  const [reordering, setReordering] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [menu, setMenu] = useState<Menu>(null);
  const [form, setForm] = useState<Form>(null);
  const [mergeSource, setMergeSource] = useState<CategoryRecord | null>(null);
  const [deleting, setDeleting] = useState<DeleteState>(null);
  const [movePicker, setMovePicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const tree = buildTree(categories);
  const archived = categories.filter((record) => record.isArchived && !record.deletedAt);

  const counts = useMemo(() => {
    const result = new Map<string, { pending: number; done: number }>();
    for (const task of tasks) {
      const entry = result.get(task.category) ?? { pending: 0, done: 0 };
      if (task.completed) entry.done += 1;
      else entry.pending += 1;
      result.set(task.category, entry);
    }
    return result;
  }, [tasks]);

  const countOf = (id: string, withSubs = false) => (withSubs ? withChildren(id, categories) : [id]).reduce(
    (sum, item) => ({ pending: sum.pending + (counts.get(item)?.pending ?? 0), done: sum.done + (counts.get(item)?.done ?? 0) }),
    { pending: 0, done: 0 },
  );

  const words = fold(query).split(/\s+/).filter(Boolean);
  const matches = (record: CategoryRecord) => words.every((word) => fold(nameOf(record)).includes(word));
  const visible = words.length
    ? tree.filter((parent) => matches(parent) || parent.children.some(matches))
    : tree;

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await action();
      if (success) toast.success(success);
    } catch (error) {
      toast.error(error instanceof CategoryError ? error.message : t('categories.errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  function startDelete(record: CategoryRecord) {
    const total = countOf(record.id, true);
    setDeleting({ record, taskCount: total.pending + total.done, step: 'choose', moveTo: record.id === OTHER_ID ? null : record.parentId ?? OTHER_ID });
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const countLabel = (id: string, withSubs: boolean) => {
    const { pending, done } = countOf(id, withSubs);
    return pending + done ? t('tasksTab.pendingDone', { pending, done }) : t('categories.noTasks');
  };

  const Row = ({ record, child }: { record: CategoryRecord; child?: boolean }) => {
    const position = useRowPosition();
    const isOpen = searchOpen(record);
    return (
      <View
        accessible
        accessibilityActions={position ? [{ name: 'up', label: t('categories.moveUp') }, { name: 'down', label: t('categories.moveDown') }] : undefined}
        onAccessibilityAction={(event) => {
          if (!position) return;
          const to = event.nativeEvent.actionName === 'up' ? position.index - 1 : position.index + 1;
          if (to >= 0 && to < position.count) position.move(position.index, to);
        }}
        style={[child ? styles.childRow : styles.parentRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {!words.length ? (
          <DragHandle>
            <View style={styles.handle} accessibilityLabel={t('categories.reorderHint')}>
              <Ionicons name="reorder-three" size={22} color={theme.textSecondary} />
            </View>
          </DragHandle>
        ) : <View style={{ width: 8 }} />}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(href(`/category/${record.id}`))}
          style={styles.rowMain}>
          <View style={[child ? styles.childIcon : styles.icon, { backgroundColor: `${record.color}1F` }]}>
            <Ionicons name={asIcon(record.icon)} size={child ? 15 : 19} color={record.color} />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={child ? styles.childName : styles.name} numberOfLines={1}>{nameOf(record)}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.count} numberOfLines={1}>{countLabel(record.id, !child)}</ThemedText>
          </View>
        </Pressable>
        {record.isPinned ? <Ionicons name="pin" size={15} color={record.color} accessibilityLabel={t('categories.pinned')} /> : null}
        {!child && (record as { children?: CategoryRecord[] }).children?.length && !words.length && !reordering ? (
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} hitSlop={6} onPress={() => toggleExpanded(record.id)} style={styles.rowButton}>
            <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textSecondary} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel={t('categories.actions', { name: nameOf(record) })} hitSlop={6} onPress={() => setMenu({ record })} style={styles.rowButton}>
          <Ionicons name="ellipsis-vertical" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
    );
  };

  function searchOpen(record: CategoryRecord) {
    return words.length > 0 || expanded.has(record.id);
  }

  const menuRecord = menu?.record;
  const menuActions: { icon: keyof typeof Ionicons.glyphMap; label: string; danger?: boolean; onPress: () => void }[] = menuRecord ? [
    { icon: 'create-outline', label: t('categories.edit'), onPress: () => setForm({ editId: menuRecord.id }) },
    ...(!menuRecord.parentId ? [{ icon: 'add-circle-outline' as const, label: t('categories.addSub'), onPress: () => setForm({ parentId: menuRecord.id }) }] : []),
    {
      icon: menuRecord.isPinned ? 'pin-outline' : 'pin',
      label: menuRecord.isPinned ? t('categories.unpin') : t('categories.pin'),
      onPress: () => void run(() => setPinned(menuRecord.id, !menuRecord.isPinned)),
    },
    ...(menuRecord.id !== OTHER_ID ? [
      { icon: 'archive-outline' as const, label: t('categories.archive'), onPress: () => void run(() => setArchived(menuRecord.id, true), t('categories.archivedToast', { name: nameOf(menuRecord) })) },
      { icon: 'git-merge-outline' as const, label: t('categories.merge'), onPress: () => setMergeSource(menuRecord) },
      { icon: 'trash-outline' as const, label: t('categories.delete'), danger: true, onPress: () => startDelete(menuRecord) },
    ] : []),
  ] : [];

  const deleteRecord = deleting?.record;
  const moveToName = deleting?.moveTo ? nameOf(categories.find((record) => record.id === deleting.moveTo) ?? { id: deleting.moveTo, name: '' }) : '';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.top}>
        <Pressable
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          style={[styles.back, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.title}>{t('categories.manageTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.summary}>
            {t('categories.categoryCount', { n: categories.filter((record) => !record.deletedAt && !record.isArchived).length })}
          </ThemedText>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setForm({})}
          style={[styles.addButton, { backgroundColor: theme.primary }]}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <ThemedText style={styles.addText}>{t('categories.new')}</ThemedText>
        </Pressable>
      </View>

      <View style={styles.toolbar}>
        <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('categories.search')}
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel={t('categories.search')}
            style={[styles.searchInput, { color: theme.text }]}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: reordering }}
          onPress={() => setReordering((value) => !value)}
          style={[styles.reorderButton, { borderColor: reordering ? theme.primary : theme.border, backgroundColor: reordering ? theme.backgroundSelected : theme.card }]}>
          <Ionicons name="swap-vertical" size={18} color={reordering ? theme.primary : theme.text} />
        </Pressable>
      </View>
      <ThemedText themeColor="textSecondary" style={styles.hint}>
        {reordering ? t('categories.reorderHint') : t('categories.manageBody')}
      </ThemedText>

      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {visible.length === 0 ? <ThemedText themeColor="textSecondary" style={styles.noMatch}>{t('categories.noMatch')}</ThemedText> : null}
        {reordering && !words.length ? (
          <DraggableList
            items={visible}
            keyOf={(record) => record.id}
            rowHeight={ROW_HEIGHT}
            gap={8}
            onMove={(from, to) => void run(() => move(null, from, to))}
            renderRow={(record) => <Row record={record} />}
          />
        ) : (
          visible.map((parent) => {
            const children = words.length ? parent.children.filter((child) => matches(child) || matches(parent)) : parent.children;
            const open = searchOpen(parent);
            return (
              <View key={parent.id} style={[styles.card, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                <View style={[styles.colorBar, { backgroundColor: parent.color }]} />
                <Row record={parent} />
                {open && children.length ? (
                  <View style={styles.children}>
                    {words.length ? children.map((child) => <Row key={child.id} record={child} child />) : (
                      <DraggableList
                        items={children}
                        keyOf={(record) => record.id}
                        rowHeight={CHILD_HEIGHT}
                        gap={6}
                        onMove={(from, to) => void run(() => move(parent.id, from, to))}
                        renderRow={(child) => <Row record={child} child />}
                      />
                    )}
                    <Pressable accessibilityRole="button" onPress={() => setForm({ parentId: parent.id })} style={styles.addSub}>
                      <Ionicons name="add" size={16} color={parent.color} />
                      <ThemedText style={[styles.addSubText, { color: parent.color }]}>{t('categories.addSub')}</ThemedText>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })
        )}

        {archived.length ? (
          <View style={{ gap: 8, marginTop: 8 }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showArchived }} onPress={() => setShowArchived((value) => !value)} style={styles.archivedHead}>
              <Ionicons name="archive-outline" size={18} color={theme.textSecondary} />
              <ThemedText style={styles.archivedTitle}>{t('categories.archivedTitle', { n: archived.length })}</ThemedText>
              <Ionicons name={showArchived ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textSecondary} />
            </Pressable>
            {showArchived ? (
              <>
                <ThemedText themeColor="textSecondary" style={styles.hint}>{t('categories.archivedHint')}</ThemedText>
                {archived.map((record) => (
                  <View key={record.id} style={[styles.parentRow, { backgroundColor: theme.card, borderColor: theme.border, opacity: 0.85 }]}>
                    <View style={[styles.icon, { backgroundColor: `${record.color}1F`, marginLeft: 8 }]}>
                      <Ionicons name={asIcon(record.icon)} size={19} color={record.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.name}>{nameOf(record)}</ThemedText>
                      <ThemedText themeColor="textSecondary" style={styles.count}>{countLabel(record.id, !record.parentId)}</ThemedText>
                    </View>
                    <Pressable accessibilityRole="button" onPress={() => void run(() => setArchived(record.id, false))} style={styles.restore}>
                      <ThemedText style={{ color: theme.primary, fontFamily: 'Poppins_600SemiBold' }}>{t('categories.unarchive')}</ThemedText>
                    </Pressable>
                  </View>
                ))}
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {/* Actions for one category */}
      <Modal visible={Boolean(menu)} transparent animationType="fade" onRequestClose={() => setMenu(null)}>
        <Pressable style={styles.backdrop} onPress={() => setMenu(null)}>
          <View style={[styles.menu, { backgroundColor: theme.card }]}>
            {menuRecord ? (
              <View style={styles.menuHead}>
                <Ionicons name={asIcon(menuRecord.icon)} size={20} color={menuRecord.color} />
                <ThemedText style={styles.menuTitle} numberOfLines={1}>{nameOf(menuRecord)}</ThemedText>
              </View>
            ) : null}
            {menuActions.map((action) => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                onPress={() => {
                  setMenu(null);
                  action.onPress();
                }}
                style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: theme.backgroundElement }]}>
                <Ionicons name={action.icon} size={20} color={action.danger ? theme.danger : theme.text} />
                <ThemedText style={[styles.menuText, action.danger && { color: theme.danger }]}>{action.label}</ThemedText>
              </Pressable>
            ))}
            {menuRecord?.id === OTHER_ID ? <ThemedText themeColor="textSecondary" style={styles.menuNote}>{t('categories.errors.otherDelete')}</ThemedText> : null}
          </View>
        </Pressable>
      </Modal>

      <CategoryFormSheet
        visible={Boolean(form)}
        editId={form?.editId}
        parentId={form?.parentId ?? null}
        onDone={(id) => {
          if (id && form && !form.editId) toast.success(t('categories.created'));
          if (form?.parentId) setExpanded((current) => new Set([...current, form.parentId!]));
          setForm(null);
        }}
      />

      <CategoryPicker
        visible={Boolean(mergeSource)}
        title={mergeSource ? t('categories.mergeTitle', { name: nameOf(mergeSource) }) : ''}
        excludeIds={mergeSource ? [mergeSource.id] : []}
        allowCreate={false}
        onSelect={(targetId) => {
          const source = mergeSource!;
          setMergeSource(null);
          const target = categories.find((record) => record.id === targetId);
          void run(() => merge(source.id, targetId), t('categories.merged', { name: nameOf(source), target: target ? nameOf(target) : '' }));
        }}
        onClose={() => setMergeSource(null)}
      />

      {/* Delete: what happens to the tasks */}
      <Modal visible={Boolean(deleting) && deleting?.step === 'choose' && !movePicker} transparent animationType="fade" onRequestClose={() => setDeleting(null)}>
        <Pressable style={styles.backdrop} onPress={() => setDeleting(null)}>
          <Pressable style={[styles.menu, { backgroundColor: theme.card }]}>
            {deleteRecord ? (
              <>
                <ThemedText style={styles.menuTitle}>{t('categories.deleteTitle', { name: nameOf(deleteRecord) })}</ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.menuBody}>
                  {deleting!.taskCount ? t('categories.deleteBody', { n: deleting!.taskCount }) : t('categories.deleteBodyEmpty')}
                </ThemedText>
                {deleting!.taskCount ? (
                  <>
                    <ThemedText style={styles.optionLabel}>{t('categories.moveTasksTo')}</ThemedText>
                    <Pressable accessibilityRole="button" onPress={() => setMovePicker(true)} style={[styles.moveButton, { borderColor: theme.border }]}>
                      <ThemedText style={{ flex: 1 }}>{moveToName}</ThemedText>
                      <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
                    </Pressable>
                  </>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    const state = deleting!;
                    setDeleting(null);
                    void run(() => remove(state.record.id, { moveTo: state.moveTo ?? OTHER_ID }), t('categories.deleted', { name: nameOf(state.record) }));
                  }}
                  style={[styles.primaryAction, { backgroundColor: theme.danger }]}>
                  <ThemedText style={styles.primaryText}>
                    {deleting!.taskCount ? t('categories.deleteMove', { name: moveToName }) : t('categories.delete')}
                  </ThemedText>
                </Pressable>
                {deleting!.taskCount ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setDeleting({ ...deleting!, step: 'confirmTasks' })}
                    style={styles.secondaryAction}>
                    <ThemedText style={{ color: theme.danger, fontFamily: 'Poppins_600SemiBold' }}>{t('categories.deleteTasksToo')}</ThemedText>
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" onPress={() => setDeleting(null)} style={styles.secondaryAction}>
                  <ThemedText style={{ fontFamily: 'Poppins_600SemiBold' }}>{t('common.cancel')}</ThemedText>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <CategoryPicker
        visible={movePicker}
        value={deleting?.moveTo}
        title={t('categories.moveTasksTo')}
        allowCreate={false}
        excludeIds={deleteRecord ? withChildren(deleteRecord.id, categories) : []}
        onSelect={(id) => {
          setDeleting((current) => (current ? { ...current, moveTo: id } : current));
          setMovePicker(false);
        }}
        onClose={() => setMovePicker(false)}
      />

      <ConfirmDialog
        visible={deleting?.step === 'confirmTasks'}
        title={deleteRecord ? t('categories.deleteTitle', { name: nameOf(deleteRecord) }) : ''}
        message={t('categories.deleteConfirmTasks', { n: deleting?.taskCount ?? 0 })}
        confirmLabel={t('categories.deleteEverything')}
        destructive
        busy={busy}
        onCancel={() => setDeleting((current) => (current ? { ...current, step: 'choose' } : current))}
        onConfirm={() => {
          const state = deleting!;
          setDeleting(null);
          void run(() => remove(state.record.id, { deleteTasks: true }), t('categories.deleted', { name: nameOf(state.record) }));
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, marginBottom: 10 },
  back: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontFamily: 'Poppins_700Bold' },
  summary: { fontSize: 12 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 14, minHeight: 40 },
  addText: { color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  toolbar: { flexDirection: 'row', gap: 8 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, minHeight: 46 },
  searchInput: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 14, paddingVertical: 8 },
  reorderButton: { width: 46, height: 46, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 13, lineHeight: 18, marginVertical: 10 },
  list: { gap: 10, paddingBottom: 40 },
  noMatch: { textAlign: 'center', marginTop: 24 },
  card: { borderWidth: 1, borderRadius: 18, padding: 6, gap: 6, overflow: 'hidden' },
  colorBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  parentRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: ROW_HEIGHT, borderRadius: 14, borderWidth: 1, paddingRight: 4 },
  childRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: CHILD_HEIGHT, height: CHILD_HEIGHT, borderRadius: 12, borderWidth: 1, paddingRight: 4 },
  handle: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  childIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  childName: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
  count: { fontSize: 11 },
  rowButton: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  children: { paddingLeft: 20, gap: 6 },
  addSub: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingLeft: 8 },
  addSubText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  archivedHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  archivedTitle: { flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  restore: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', padding: 24 },
  menu: { borderRadius: 20, padding: 16, gap: 4 },
  menuHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  menuTitle: { fontSize: 17, fontFamily: 'Poppins_600SemiBold', flexShrink: 1 },
  menuBody: { fontSize: 14, lineHeight: 20, marginVertical: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderRadius: 12, paddingHorizontal: 8 },
  menuText: { fontSize: 15 },
  menuNote: { fontSize: 12, marginTop: 6 },
  optionLabel: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', marginTop: 4 },
  moveButton: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 46, marginBottom: 8 },
  primaryAction: { borderRadius: 999, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 6, paddingHorizontal: 12 },
  primaryText: { color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold', textAlign: 'center' },
  secondaryAction: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});

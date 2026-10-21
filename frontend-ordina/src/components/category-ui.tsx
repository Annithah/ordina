/**
 * Category building blocks used across ORDINA: the badge on tasks, the picker sheet
 * (search, pinned, recent, subcategories under their parent, "+ New category") and the
 * form to create or edit a category.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { categoryInfo } from '@/features/categories';
import { ICONS, MAX_NAME_LENGTH, PALETTE, buildTree, fold, pickerOrder, type CategoryRecord } from '@/features/category-tree';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { CategoryError, nameOf, useCategoriesStore } from '@/store/categories-store';

export type IconName = keyof typeof Ionicons.glyphMap;

export const asIcon = (name: string) => (name in Ionicons.glyphMap ? name : 'pricetag-outline') as IconName;

/** A function that names any category id; re-renders when categories change. */
export function useCategoryName() {
  useI18n();
  const categories = useCategoriesStore((s) => s.categories);
  return useMemo(() => {
    const byId = new Map(categories.map((record) => [record.id, record]));
    return (id: string) => {
      const record = byId.get(categoryInfo(id).id);
      return record ? nameOf(record) : id;
    };
  }, [categories]);
}

/** "Study › Exams" for a subcategory, "Study" for a top-level one. */
export function useCategoryPath() {
  const name = useCategoryName();
  return (id: string) => {
    const info = categoryInfo(id);
    return info.parentId ? `${name(info.parentId)} › ${name(info.id)}` : name(info.id);
  };
}

/** Colour and icon of a task's category, with its name. */
export function CategoryBadge({ id, compact, onPress }: { id: string; compact?: boolean; onPress?: () => void }) {
  useCategoriesStore((s) => s.categories);
  const name = useCategoryName();
  const info = categoryInfo(id);
  const content = (
    <>
      <Ionicons name={asIcon(info.icon)} size={compact ? 11 : 14} color={info.color} />
      <ThemedText style={[compact ? styles.badgeTextSmall : styles.badgeText, { color: info.color }]} numberOfLines={1}>
        {name(info.id)}
      </ThemedText>
      {onPress ? <Ionicons name="chevron-down" size={12} color={info.color} /> : null}
    </>
  );
  const style = [compact ? styles.badgeSmall : styles.badge, { backgroundColor: `${info.color}1A` }];
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={style}>{content}</Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}

function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.sheetWrap}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + 12 }]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type PickerProps = {
  visible: boolean;
  value?: string | null;
  title?: string;
  /** Categories that cannot be chosen (e.g. the one being deleted). */
  excludeIds?: string[];
  /** Only top-level categories (e.g. choosing a parent). */
  topLevelOnly?: boolean;
  allowCreate?: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
};

export function CategoryPicker({ visible, value, title, excludeIds = [], topLevelOnly, allowCreate = true, onSelect, onClose }: PickerProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const categories = useCategoriesStore((s) => s.categories);
  const recentIds = useCategoriesStore((s) => s.recent);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const excluded = new Set(excludeIds);
  const usable = (record: CategoryRecord) => !excluded.has(record.id) && (!topLevelOnly || !record.parentId);

  const tree = buildTree(categories);
  const { pinned, recent } = pickerOrder(categories, recentIds);
  const words = fold(query).split(/\s+/).filter(Boolean);
  const matches = (record: CategoryRecord) => words.every((word) => fold(nameOf(record)).includes(word));

  function choose(id: string) {
    setQuery('');
    onSelect(id);
  }

  function close() {
    setQuery('');
    setCreating(false);
    onClose();
  }

  const renderRow = (record: CategoryRecord, child?: boolean) => {
    const active = value === record.id;
    return (
      <Pressable
        key={record.id}
        accessibilityRole="radio"
        accessibilityState={{ selected: active }}
        onPress={() => choose(record.id)}
        style={({ pressed }) => [
          styles.row,
          child && styles.childRow,
          { backgroundColor: active ? `${record.color}1F` : pressed ? theme.backgroundElement : 'transparent' },
        ]}>
        <View style={[styles.rowIcon, { backgroundColor: `${record.color}1F` }]}>
          <Ionicons name={asIcon(record.icon)} size={child ? 15 : 18} color={record.color} />
        </View>
        <ThemedText style={[styles.rowName, !child && styles.rowParent]} numberOfLines={1}>{nameOf(record)}</ThemedText>
        {record.isPinned ? <Ionicons name="pin" size={14} color={theme.textSecondary} /> : null}
        {active ? <Ionicons name="checkmark-circle" size={20} color={record.color} /> : null}
      </Pressable>
    );
  };

  const renderChips = (label: string, items: CategoryRecord[]) => (items.filter(usable).length ? (
    <View style={styles.chipBlock}>
      <ThemedText themeColor="textSecondary" style={styles.blockLabel}>{label}</ThemedText>
      <View style={styles.chips}>
        {items.filter(usable).map((record) => (
          <Pressable
            key={record.id}
            accessibilityRole="button"
            onPress={() => choose(record.id)}
            style={[styles.chip, { borderColor: value === record.id ? record.color : theme.border, backgroundColor: theme.card }]}>
            <Ionicons name={asIcon(record.icon)} size={13} color={record.color} />
            <ThemedText style={styles.chipText} numberOfLines={1}>{nameOf(record)}</ThemedText>
          </Pressable>
        ))}
      </View>
    </View>
  ) : null);

  return (
    <Sheet visible={visible} onClose={close}>
      {creating ? (
        <CategoryForm
          onDone={(id) => {
            setCreating(false);
            if (id) choose(id);
          }}
        />
      ) : (
        <>
          <View style={styles.sheetHead}>
            <ThemedText style={styles.sheetTitle}>{title ?? t('categories.choose')}</ThemedText>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={close} hitSlop={8}>
              <Ionicons name="close" size={22} color={theme.text} />
            </Pressable>
          </View>
          <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="search-outline" size={17} color={theme.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('categories.search')}
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel={t('categories.search')}
              style={[styles.searchInput, { color: theme.text }]}
            />
          </View>
          <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
            {words.length ? null : (
              <>
                {renderChips(t('categories.pinned'), pinned)}
                {renderChips(t('categories.recent'), recent)}
                {pinned.length || recent.length ? (
                  <ThemedText themeColor="textSecondary" style={styles.blockLabel}>{t('categories.all')}</ThemedText>
                ) : null}
              </>
            )}
            {tree.map((parent) => {
              const children = topLevelOnly ? [] : parent.children.filter((child) => usable(child) && (!words.length || matches(child) || matches(parent)));
              const showParent = usable(parent) && (!words.length || matches(parent));
              if (!showParent && !children.length) return null;
              return (
                <View key={parent.id}>
                  {showParent ? renderRow(parent) : (
                    <ThemedText themeColor="textSecondary" style={styles.groupLabel}>{nameOf(parent)}</ThemedText>
                  )}
                  {children.map((child) => renderRow(child, true))}
                </View>
              );
            })}
            {words.length && !tree.some((parent) => matches(parent) || parent.children.some(matches)) ? (
              <ThemedText themeColor="textSecondary" style={styles.noMatch}>{t('categories.noMatch')}</ThemedText>
            ) : null}
          </ScrollView>
          {allowCreate ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setCreating(true)}
              style={[styles.newButton, { borderColor: theme.primary }]}>
              <Ionicons name="add" size={18} color={theme.primary} />
              <ThemedText style={[styles.newText, { color: theme.primary }]}>{t('categories.newCategory')}</ThemedText>
            </Pressable>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

type FormProps = {
  /** Editing an existing category; otherwise a new one (optionally inside `parentId`). */
  editId?: string;
  parentId?: string | null;
  onDone: (id: string | null) => void;
};

/** Name (1-30 characters), parent, colour from the palette and a searchable icon. */
export function CategoryForm({ editId, parentId: initialParent = null, onDone }: FormProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const categories = useCategoriesStore((s) => s.categories);
  const create = useCategoriesStore((s) => s.create);
  const update = useCategoriesStore((s) => s.update);
  const editing = editId ? categories.find((record) => record.id === editId) : undefined;
  const hasChildren = Boolean(editId && categories.some((record) => record.parentId === editId && !record.deletedAt));
  const [name, setName] = useState(editing ? nameOf(editing) : '');
  const [parentId, setParentId] = useState<string | null>(editing ? editing.parentId : initialParent);
  const parent = parentId ? categories.find((record) => record.id === parentId) : undefined;
  const [color, setColor] = useState(editing?.color ?? parent?.color ?? PALETTE[0]);
  const [icon, setIcon] = useState(editing?.icon ?? 'pricetag-outline');
  const [iconQuery, setIconQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickParent, setPickParent] = useState(false);

  const words = fold(iconQuery).split(/\s+/).filter(Boolean);
  const icons = ICONS.filter((item) => words.every((word) => fold(`${item.name} ${item.words}`).includes(word)));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await update(editing.id, { name, color, icon });
        onDone(editing.id);
      } else {
        onDone(await create({ name, color, icon, parentId }));
      }
    } catch (caught) {
      setError(caught instanceof CategoryError ? caught.message : t('categories.errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.form}>
      <View style={styles.sheetHead}>
        <ThemedText style={styles.sheetTitle}>
          {editing ? t('categories.editCategory') : parentId ? t('categories.newSubcategory') : t('categories.newCategory')}
        </ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={() => onDone(null)} hitSlop={8}>
          <Ionicons name="close" size={22} color={theme.text} />
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formBody}>
        <View style={[styles.preview, { backgroundColor: `${color}1A` }]}>
          <View style={[styles.previewIcon, { backgroundColor: color }]}>
            <Ionicons name={asIcon(icon)} size={20} color="#FFFFFF" />
          </View>
          <ThemedText style={[styles.previewName, { color }]} numberOfLines={1}>{name.trim() || t('categories.namePlaceholder')}</ThemedText>
        </View>

        <ThemedText style={styles.label}>{t('categories.name')}</ThemedText>
        <TextInput
          value={name}
          onChangeText={(text) => {
            setName(text);
            setError(null);
          }}
          placeholder={t('categories.namePlaceholder')}
          placeholderTextColor={theme.textSecondary}
          maxLength={MAX_NAME_LENGTH + 5}
          autoFocus={!editing}
          accessibilityLabel={t('categories.name')}
          style={[styles.input, { color: theme.text, borderColor: error ? theme.danger : theme.border, backgroundColor: theme.card }]}
        />
        <View style={styles.nameMeta}>
          <ThemedText style={[styles.error, { color: theme.danger }]}>{error ?? ''}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.counter}>{name.trim().length}/{MAX_NAME_LENGTH}</ThemedText>
        </View>

        {!editing && !hasChildren ? (
          <>
            <ThemedText style={styles.label}>{t('categories.parent')}</ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickParent(true)}
              style={[styles.input, styles.parentButton, { borderColor: theme.border, backgroundColor: theme.card }]}>
              {parent ? <Ionicons name={asIcon(parent.icon)} size={16} color={parent.color} /> : null}
              <ThemedText style={{ flex: 1 }}>{parent ? nameOf(parent) : t('categories.topLevel')}</ThemedText>
              {parent ? (
                <Pressable accessibilityLabel={t('categories.topLevel')} hitSlop={8} onPress={() => setParentId(null)}>
                  <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
                </Pressable>
              ) : <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />}
            </Pressable>
          </>
        ) : null}

        <ThemedText style={styles.label}>{t('categories.color')}</ThemedText>
        <View style={styles.palette}>
          {PALETTE.map((swatch) => (
            <Pressable
              key={swatch}
              accessibilityRole="radio"
              accessibilityState={{ selected: swatch === color }}
              accessibilityLabel={swatch}
              onPress={() => setColor(swatch)}
              style={[styles.swatch, { backgroundColor: swatch, borderColor: swatch === color ? theme.text : 'transparent' }]}>
              {swatch === color ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
            </Pressable>
          ))}
        </View>

        <ThemedText style={styles.label}>{t('categories.icon')}</ThemedText>
        <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="search-outline" size={16} color={theme.textSecondary} />
          <TextInput
            value={iconQuery}
            onChangeText={setIconQuery}
            placeholder={t('categories.iconSearch')}
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel={t('categories.iconSearch')}
            style={[styles.searchInput, { color: theme.text }]}
          />
        </View>
        <View style={styles.icons}>
          {icons.map((item) => (
            <Pressable
              key={item.name}
              accessibilityRole="radio"
              accessibilityState={{ selected: item.name === icon }}
              accessibilityLabel={item.words.split(' ')[0]}
              onPress={() => setIcon(item.name)}
              style={[styles.iconCell, { backgroundColor: item.name === icon ? color : theme.card, borderColor: theme.border }]}>
              <Ionicons name={asIcon(item.name)} size={20} color={item.name === icon ? '#FFFFFF' : theme.text} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <PrimaryButton label={saving ? '…' : editing ? t('common.save') : t('categories.create')} disabled={saving} onPress={() => void save()} />
      <CategoryPicker
        visible={pickParent}
        value={parentId}
        title={t('categories.parent')}
        topLevelOnly
        allowCreate={false}
        excludeIds={editId ? [editId] : []}
        onSelect={(id) => {
          setParentId(id);
          const chosen = categories.find((record) => record.id === id);
          if (chosen && !editing) setColor(chosen.color);
          setPickParent(false);
        }}
        onClose={() => setPickParent(false)}
      />
    </View>
  );
}

/** The add/edit form as its own sheet (Manage categories). */
export function CategoryFormSheet({ visible, ...props }: FormProps & { visible: boolean }) {
  return (
    <Sheet visible={visible} onClose={() => props.onDone(null)}>
      {visible ? <CategoryForm {...props} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  badgeSmall: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, maxWidth: 160 },
  badgeText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  badgeTextSmall: { fontSize: 11, fontFamily: 'Poppins_500Medium' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 4 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 },
  sheetTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', flex: 1 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44 },
  searchInput: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 14, paddingVertical: 8 },
  pickerList: { flexGrow: 0 },
  chipBlock: { gap: 6, marginBottom: 8 },
  blockLabel: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', marginTop: 4, marginBottom: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, minHeight: 34, maxWidth: 180 },
  chipText: { fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderRadius: 12, paddingHorizontal: 8 },
  childRow: { marginLeft: 28, minHeight: 44 },
  rowIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rowName: { flex: 1, fontSize: 14 },
  rowParent: { fontFamily: 'Poppins_600SemiBold' },
  groupLabel: { fontSize: 12, marginTop: 8, marginLeft: 8 },
  noMatch: { textAlign: 'center', paddingVertical: 20 },
  newButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, minHeight: 48 },
  newText: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  form: { gap: 10, flexShrink: 1 },
  formBody: { gap: 6, paddingBottom: 8 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 10, marginBottom: 6 },
  previewIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  previewName: { flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  label: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', marginTop: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 46, fontFamily: 'Poppins_400Regular', fontSize: 15 },
  parentButton: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  error: { fontSize: 12, flex: 1 },
  counter: { fontSize: 11 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  iconCell: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});

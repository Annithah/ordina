/**
 * Manage categories: add, rename/recolor/re-icon, reorder (up/down buttons, which also work with
 * a screen reader), and delete. Deleting moves its tasks to a category the user picks
 * ("Other" by default); tasks are never deleted.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { categoryName, useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_NAME_MAX,
  OTHER_CATEGORY_ID,
  fallbackCategoryId,
  reorder,
  validateCategoryName,
  type Category,
  type CategoryIcon,
} from '@/logic/categories';
import { useI18n } from '@/providers/i18n-provider';
import { useTasksStore } from '@/store/tasks-store';
import { friendlyError } from '@/utils/task-validation';

type Draft = { id: string | null; name: string; color: string; icon: CategoryIcon };

const ERROR_KEY = { empty: 'categories.errorEmpty', tooLong: 'categories.errorTooLong', duplicate: 'categories.errorDuplicate' } as const;

export default function CategoriesScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { categories } = useCategories();
  const counts = useTasksStore((s) => s.counts);
  const { addCategory, editCategory, removeCategory, saveCategoryOrder } = useTasksStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<{ category: Category; moveTo: string | null } | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  function openEditor(category?: Category) {
    setNameError(null);
    setDraft(category
      ? { id: category.id, name: categoryName(category, t), color: category.color, icon: category.icon }
      : { id: null, name: '', color: CATEGORY_COLORS[(categories.length + 1) % CATEGORY_COLORS.length], icon: 'pricetag-outline' });
  }

  async function saveDraft() {
    if (!draft || saving) return;
    const others = categories.filter((category) => category.id !== draft.id).map((category) => categoryName(category, t));
    const error = validateCategoryName(draft.name, others);
    if (error) {
      setNameError(t(ERROR_KEY[error]));
      return;
    }
    setSaving(true);
    try {
      const input = { name: draft.name, color: draft.color, icon: draft.icon };
      if (draft.id) await editCategory(draft.id, input);
      else await addCategory(input);
      toast.success(t('categories.saved'));
      setDraft(null);
    } catch (err) {
      toast.error(friendlyError(err, t('errors.generic')));
    } finally {
      setSaving(false);
    }
  }

  function move(index: number, delta: number) {
    const next = reorder(categories, index, index + delta);
    void saveCategoryOrder(next.map((category) => category.id)).catch((err) => toast.error(friendlyError(err, t('errors.generic'))));
  }

  function askDelete(category: Category) {
    if (categories.length <= 1) {
      toast.info(t('categories.deleteLast'));
      return;
    }
    setDeleting({ category, moveTo: fallbackCategoryId(categories, category.id) });
  }

  async function confirmDelete() {
    if (!deleting || busyDelete) return;
    setBusyDelete(true);
    try {
      await removeCategory(deleting.category.id, deleting.moveTo);
      toast.success(t('categories.deleted'));
      setDeleting(null);
    } catch (err) {
      toast.error(friendlyError(err, t('errors.generic')));
    } finally {
      setBusyDelete(false);
    }
  }

  const deleteCount = deleting ? counts[deleting.category.id] ?? 0 : 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.title} accessibilityRole="header">{t('categories.manage')}</ThemedText>
        <View style={styles.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText themeColor="textSecondary" style={styles.hint}>{t('categories.manageHint')}</ThemedText>
        <View style={[styles.list, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {categories.map((category, index) => {
            const name = categoryName(category, t);
            return (
              <View key={category.id} style={[styles.row, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <Pressable accessibilityRole="button" accessibilityLabel={`${t('common.edit')} ${name}`} onPress={() => openEditor(category)} style={styles.rowMain}>
                  <View style={[styles.icon, { backgroundColor: `${category.color}22` }]}>
                    <Ionicons name={category.icon} size={18} color={category.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.name} numberOfLines={1}>{name}</ThemedText>
                    <ThemedText themeColor="textSecondary" style={styles.count}>{t('categories.count', { count: counts[category.id] ?? 0 })}</ThemedText>
                  </View>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`${t('common.moveUp')}: ${name}`} disabled={index === 0} onPress={() => move(index, -1)} style={[styles.smallBtn, index === 0 && styles.disabled]}>
                  <Ionicons name="chevron-up" size={18} color={theme.text} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`${t('common.moveDown')}: ${name}`} disabled={index === categories.length - 1} onPress={() => move(index, 1)} style={[styles.smallBtn, index === categories.length - 1 && styles.disabled]}>
                  <Ionicons name="chevron-down" size={18} color={theme.text} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`${t('common.delete')}: ${name}`} onPress={() => askDelete(category)} style={styles.smallBtn}>
                  <Ionicons name="trash-outline" size={18} color={theme.danger} />
                </Pressable>
              </View>
            );
          })}
        </View>
        <PrimaryButton label={t('categories.add')} onPress={() => openEditor()} />
      </ScrollView>

      <Modal transparent visible={draft !== null} animationType="slide" onRequestClose={() => setDraft(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <Pressable style={styles.backdrop} onPress={() => setDraft(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
              {draft ? (
                <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
                  <ThemedText style={styles.title} accessibilityRole="header">{draft.id ? t('categories.editTitle') : t('categories.newTitle')}</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.label}>{t('categories.name')}</ThemedText>
                  <TextInput
                    value={draft.name}
                    onChangeText={(name) => {
                      setDraft({ ...draft, name });
                      setNameError(null);
                    }}
                    autoFocus={!draft.id}
                    maxLength={CATEGORY_NAME_MAX + 10}
                    placeholder={t('categories.namePlaceholder')}
                    placeholderTextColor={theme.textSecondary}
                    accessibilityLabel={t('categories.name')}
                    style={[styles.input, { color: theme.text, borderColor: nameError ? theme.danger : theme.border, backgroundColor: theme.input }]}
                  />
                  {nameError ? <ThemedText accessibilityRole="alert" style={{ color: theme.danger, fontSize: 13 }}>{nameError}</ThemedText> : null}
                  <ThemedText themeColor="textSecondary" style={styles.label}>{t('categories.color')}</ThemedText>
                  <View style={styles.wrap}>
                    {CATEGORY_COLORS.map((color) => (
                      <Pressable
                        key={color}
                        accessibilityRole="radio"
                        accessibilityLabel={color}
                        accessibilityState={{ selected: draft.color === color }}
                        onPress={() => setDraft({ ...draft, color })}
                        style={[styles.swatch, { backgroundColor: color, borderColor: draft.color === color ? theme.text : 'transparent' }]}>
                        {draft.color === color ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
                      </Pressable>
                    ))}
                  </View>
                  <ThemedText themeColor="textSecondary" style={styles.label}>{t('categories.icon')}</ThemedText>
                  <View style={styles.wrap}>
                    {CATEGORY_ICONS.map((icon) => (
                      <Pressable
                        key={icon}
                        accessibilityRole="radio"
                        accessibilityLabel={icon.replace('-outline', '')}
                        accessibilityState={{ selected: draft.icon === icon }}
                        onPress={() => setDraft({ ...draft, icon })}
                        style={[styles.iconChoice, { borderColor: draft.icon === icon ? draft.color : theme.border, backgroundColor: draft.icon === icon ? `${draft.color}22` : 'transparent' }]}>
                        <Ionicons name={icon} size={20} color={draft.icon === icon ? draft.color : theme.textSecondary} />
                      </Pressable>
                    ))}
                  </View>
                  <PrimaryButton label={saving ? t('common.saving') : t('common.save')} disabled={saving} onPress={() => void saveDraft()} />
                </ScrollView>
              ) : null}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmDialog
        visible={deleting !== null}
        title={deleting ? t('categories.deleteTitle', { name: categoryName(deleting.category, t) }) : ''}
        message={deleteCount ? t('categories.deleteMove', { count: deleteCount }) : t('categories.deleteEmpty')}
        confirmLabel={t('common.delete')}
        destructive
        busy={busyDelete}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}>
        {deleting && deleteCount ? (
          <View style={styles.wrap}>
            {categories.filter((category) => category.id !== deleting.category.id).map((category) => (
              <Chip
                key={category.id}
                icon={category.icon}
                color={category.color}
                label={categoryName(category, t)}
                active={(deleting.moveTo ?? OTHER_CATEGORY_ID) === category.id}
                onPress={() => setDeleting({ ...deleting, moveTo: category.id })}
              />
            ))}
          </View>
        ) : null}
      </ConfirmDialog>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', flexShrink: 1, textAlign: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  hint: { fontSize: 13, lineHeight: 19 },
  list: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: 4, minHeight: 60 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontFamily: 'Poppins_500Medium' },
  count: { fontSize: 12 },
  smallBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.3 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, maxHeight: '90%' },
  label: { fontSize: 12, fontFamily: 'Poppins_500Medium', marginBottom: -6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 48, fontSize: 15, fontFamily: 'Poppins_500Medium' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  iconChoice: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});

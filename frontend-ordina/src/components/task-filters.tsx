/**
 * Home page search and filters: a search bar, filter buttons (Category, Status, Date, Priority)
 * that open a choice sheet, and the active filters as removable chips with "Clear all".
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/components/chip';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';
import { formatDay } from '@/i18n/format';
import {
  activeChips,
  removeChip,
  toggleIn,
  type DateFilter,
  type FilterChip,
  type PriorityFilter,
  type StatusFilter,
  type TaskFilters,
} from '@/logic/filters';
import { useI18n } from '@/providers/i18n-provider';
import { localDateKey } from '@/utils/dates';

type Sheet = 'category' | 'status' | 'date' | 'priority' | null;

const STATUS_KEYS: Record<StatusFilter, string> = { all: 'filters.statusAll', pending: 'filters.statusPending', completed: 'filters.statusCompleted', overdue: 'filters.statusOverdue' };
const DATE_KEYS: Record<DateFilter, string> = { today: 'filters.dateToday', tomorrow: 'filters.dateTomorrow', week: 'filters.dateWeek', upcoming: 'filters.dateUpcoming', custom: 'filters.dateCustom' };

function parseKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function TaskFiltersBar({ filters, onChange }: { filters: TaskFilters; onChange: (next: TaskFilters) => void }) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const { categories, nameOf } = useCategories();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [search, setSearch] = useState(filters.search);
  const [iosRange, setIosRange] = useState<'from' | 'to' | null>(null);

  // Searching as you type, with a short pause so every key press doesn't run a query.
  useEffect(() => {
    if (search === filters.search) return;
    const timer = setTimeout(() => onChange({ ...filters, search }), 200);
    return () => clearTimeout(timer);
  }, [search, filters, onChange]);
  useEffect(() => {
    setSearch(filters.search);
  }, [filters.search]);

  const chips = activeChips(filters);

  function chipLabel(chip: FilterChip) {
    switch (chip.kind) {
      case 'search':
        return t('filters.searchChip', { text: chip.value });
      case 'category':
        return nameOf(chip.value);
      case 'status':
        return t(STATUS_KEYS[chip.value]);
      case 'priority':
        return t(`priority.${chip.value}`);
      case 'date':
        if (chip.value !== 'custom') return t(DATE_KEYS[chip.value]);
        if (chip.from && chip.to) return t('filters.rangeFromTo', { from: formatDay(locale, chip.from), to: formatDay(locale, chip.to) });
        if (chip.from) return t('filters.rangeFrom', { from: formatDay(locale, chip.from) });
        if (chip.to) return t('filters.rangeTo', { to: formatDay(locale, chip.to) });
        return t('filters.dateCustom');
    }
  }

  function pickRange(which: 'from' | 'to') {
    const current = (which === 'from' ? filters.from : filters.to) ?? localDateKey();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: parseKey(current),
        mode: 'date',
        onChange: (event, selected) => {
          if (event.type !== 'set' || !selected) return;
          onChange({ ...filters, date: 'custom', [which]: localDateKey(selected) });
        },
      });
      return;
    }
    setIosRange(which);
  }

  const filterButton = (id: Exclude<Sheet, null>, label: string, count: number) => (
    <Chip
      key={id}
      label={count ? `${label} · ${count}` : label}
      active={count > 0}
      trailingIcon="chevron-down"
      onPress={() => setSheet(id)}
    />
  );

  return (
    <View style={styles.wrapper}>
      <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('home.searchPlaceholder')}
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel={t('home.searchPlaceholder')}
          returnKeyType="search"
          style={[styles.searchInput, { color: theme.text }]}
        />
        {search ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('home.clearSearch')} hitSlop={10} onPress={() => setSearch('')} style={styles.clearSearch}>
            <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {filterButton('category', t('filters.category'), filters.categoryIds.length)}
        {filterButton('status', t('filters.status'), filters.status === 'all' ? 0 : 1)}
        {filterButton('date', t('filters.date'), filters.date ? 1 : 0)}
        {filterButton('priority', t('filters.priority'), filters.priorities.length)}
      </ScrollView>

      {chips.length ? (
        <View style={styles.active}>
          {chips.map((chip) => {
            const label = chipLabel(chip);
            return (
              <Pressable
                key={`${chip.kind}-${chip.value}`}
                accessibilityRole="button"
                accessibilityLabel={t('filters.removeFilter', { name: label })}
                onPress={() => onChange(removeChip(filters, chip))}
                hitSlop={4}
                style={[styles.activeChip, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText style={[styles.activeText, { color: theme.primary }]} numberOfLines={1}>{label}</ThemedText>
                <Ionicons name="close" size={14} color={theme.primary} />
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSearch('');
              onChange({ search: '', categoryIds: [], status: 'all', date: null, from: null, to: null, priorities: [] });
            }}
            hitSlop={6}
            style={styles.clearAll}>
            <ThemedText style={[styles.activeText, { color: theme.danger }]}>{t('common.clearAll')}</ThemedText>
          </Pressable>
        </View>
      ) : null}

      <Modal transparent visible={sheet !== null} animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSheet(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
            <ThemedText style={styles.sheetTitle} accessibilityRole="header">
              {sheet ? t(`filters.${sheet}`) : ''}
            </ThemedText>
            <ScrollView contentContainerStyle={styles.options}>
              {sheet === 'category'
                ? categories.map((category) => (
                  <Chip
                    key={category.id}
                    icon={category.icon}
                    color={category.color}
                    label={nameOf(category.id)}
                    active={filters.categoryIds.includes(category.id)}
                    onPress={() => onChange({ ...filters, categoryIds: toggleIn(filters.categoryIds, category.id) })}
                  />
                ))
                : null}
              {sheet === 'status'
                ? (Object.keys(STATUS_KEYS) as StatusFilter[]).map((status) => (
                  <Chip key={status} label={t(STATUS_KEYS[status])} active={filters.status === status} onPress={() => onChange({ ...filters, status })} />
                ))
                : null}
              {sheet === 'priority'
                ? (['low', 'medium', 'high'] as PriorityFilter[]).map((priority) => (
                  <Chip key={priority} label={t(`priority.${priority}`)} active={filters.priorities.includes(priority)} onPress={() => onChange({ ...filters, priorities: toggleIn(filters.priorities, priority) })} />
                ))
                : null}
              {sheet === 'date' ? (
                <>
                  <Chip label={t('filters.dateAny')} active={filters.date === null} onPress={() => onChange({ ...filters, date: null, from: null, to: null })} />
                  {(Object.keys(DATE_KEYS) as DateFilter[]).map((date) => (
                    <Chip
                      key={date}
                      label={t(DATE_KEYS[date])}
                      active={filters.date === date}
                      onPress={() => onChange({ ...filters, date, ...(date === 'custom' ? {} : { from: null, to: null }) })}
                    />
                  ))}
                </>
              ) : null}
            </ScrollView>
            {sheet === 'date' && filters.date === 'custom' ? (
              <View style={styles.range}>
                <Chip icon="calendar" label={`${t('filters.from')}: ${filters.from ? formatDay(locale, filters.from) : '—'}`} active={Boolean(filters.from)} onPress={() => pickRange('from')} />
                <Chip icon="calendar" label={`${t('filters.to')}: ${filters.to ? formatDay(locale, filters.to) : '—'}`} active={Boolean(filters.to)} onPress={() => pickRange('to')} />
              </View>
            ) : null}
            {Platform.OS === 'ios' && iosRange ? (
              <DateTimePicker
                value={parseKey((iosRange === 'from' ? filters.from : filters.to) ?? localDateKey())}
                mode="date"
                display="inline"
                onChange={(_event, selected) => {
                  if (selected) onChange({ ...filters, date: 'custom', [iosRange]: localDateKey(selected) });
                }}
              />
            ) : null}
            <PrimaryButton label={t('filters.apply')} onPress={() => {
              setIosRange(null);
              setSheet(null);
            }} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, minHeight: 48 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Poppins_400Regular', paddingVertical: 8 },
  clearSearch: { padding: 4 },
  row: { gap: 8, paddingRight: 8 },
  active: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, minHeight: 32, maxWidth: 220 },
  activeText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', flexShrink: 1 },
  clearAll: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, gap: 14, maxHeight: '80%' },
  sheetTitle: { fontSize: 17, fontFamily: 'Poppins_600SemiBold' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  range: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

/** Settings > My categories: the areas of life the user plans for (the intro's focus answer). */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { CATEGORIES, CATEGORY_GROUPS, focusGroups, type CategoryGroupId } from '@/features/categories';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';
import { usePreferencesStore } from '@/store/preferences-store';

/** Category group -> the intro's focus answer that stands for it. */
const GROUP_TO_FOCUS: Record<CategoryGroupId, string> = {
  work: 'work',
  education: 'study',
  health: 'health',
  home: 'family',
  finance: 'finance',
  business: 'business',
  social: 'social',
  creative: 'creative',
};

export default function CategoriesScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const answers = usePreferencesStore((s) => s.answers);
  const setFocus = usePreferencesStore((s) => s.setFocus);
  const chosen = new Set(answers.focus?.length ? focusGroups(answers) : []);

  function toggle(group: CategoryGroupId) {
    const next = new Set(chosen);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    void setFocus(CATEGORY_GROUPS.filter((item) => next.has(item.id)).map((item) => GROUP_TO_FOCUS[item.id]));
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.top}>
        <Pressable
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          style={[styles.back, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.title}>{t('categories.settingsTitle')}</ThemedText>
      </View>
      <ThemedText themeColor="textSecondary" style={styles.sub}>{t('categories.settingsBody')}</ThemedText>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {CATEGORY_GROUPS.map((group) => {
          const active = chosen.has(group.id);
          return (
            <Pressable
              key={group.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              onPress={() => toggle(group.id)}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: theme.card, borderColor: active ? group.color : theme.border, opacity: pressed ? 0.85 : 1 },
              ]}>
              <View style={styles.cardHead}>
                <View style={[styles.icon, { backgroundColor: `${group.color}1F` }]}>
                  <Ionicons name={group.icon} size={18} color={group.color} />
                </View>
                <ThemedText style={styles.groupName}>{t(`categories.groups.${group.id}`)}</ThemedText>
                <Ionicons name={active ? 'checkbox' : 'square-outline'} size={22} color={active ? group.color : theme.textSecondary} />
              </View>
              <View style={styles.items}>
                {CATEGORIES.filter((category) => category.group === group.id).map((category) => (
                  <View key={category.id} style={[styles.item, { backgroundColor: theme.backgroundElement }]}>
                    <Ionicons name={category.icon} size={12} color={group.color} />
                    <ThemedText themeColor="textSecondary" style={styles.itemText}>{t(`categories.items.${category.id}`)}</ThemedText>
                  </View>
                ))}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, marginBottom: 8 },
  back: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontFamily: 'Poppins_700Bold' },
  sub: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
  list: { gap: 12, paddingBottom: 32 },
  card: { borderWidth: 1.5, borderRadius: 16, padding: 14, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  groupName: { flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  items: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  itemText: { fontSize: 11 },
});

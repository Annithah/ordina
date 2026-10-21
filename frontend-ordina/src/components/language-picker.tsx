import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { LOCALES, localeName, type LocaleId } from '@/i18n/translations';
import { useI18n } from '@/providers/i18n-provider';

/** Every language ORDINA speaks; the choice is saved and used again on the next launch. */
export function LanguageList({ onPicked }: { onPicked?: (id: LocaleId) => void }) {
  const theme = useTheme();
  const { locale, setLocale } = useI18n();
  return (
    <View style={styles.list}>
      {LOCALES.map((item) => {
        const active = locale === item.id;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => {
              setLocale(item.id);
              onPicked?.(item.id);
            }}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: active ? theme.backgroundSelected : theme.card,
                borderColor: active ? theme.primary : theme.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.native}>{item.native}</ThemedText>
              {item.native !== item.label ? (
                <ThemedText themeColor="textSecondary" style={styles.label}>{item.label}</ThemedText>
              ) : null}
            </View>
            <Ionicons
              name={active ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={active ? theme.primary : theme.textSecondary}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small pill (globe + current language) that opens the language list in a sheet. */
export function LanguageButton() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('language.button')}: ${localeName(locale)}`}
        hitSlop={8}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
        ]}>
        <Ionicons name="globe-outline" size={16} color={theme.primary} />
        <ThemedText style={styles.pillText}>{localeName(locale)}</ThemedText>
        <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
      </Pressable>

      <Modal transparent visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
            <ThemedText style={styles.title}>{t('language.title')}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>{t('language.subtitle')}</ThemedText>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <LanguageList onPicked={() => setOpen(false)} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  native: { fontFamily: 'Poppins_600SemiBold', fontSize: 16 },
  label: { fontSize: 12 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  pillText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, gap: 8 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  title: { fontSize: 20, fontFamily: 'Poppins_700Bold' },
  subtitle: { fontSize: 13, lineHeight: 19, marginBottom: 6 },
});

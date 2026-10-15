import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/providers/i18n-provider';

type IconName = keyof typeof Ionicons.glyphMap;

/** Tab icon with a pill highlight that springs in when the tab becomes active. */
function TabIcon({ name, activeName, color, focused, highlight }: {
  name: IconName;
  activeName: IconName;
  color: ColorValue;
  focused: boolean;
  highlight: string;
}) {
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      friction: 7,
      tension: 140,
    }).start();
  }, [focused, progress]);

  return (
    <Animated.View style={styles.iconWrap}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.pill,
          { backgroundColor: highlight, opacity: progress, transform: [{ scaleX: progress }] },
        ]}
      />
      <Animated.View style={{ transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}>
        <Ionicons name={focused ? activeName : name} size={22} color={color as string} />
      </Animated.View>
    </Animated.View>
  );
}

export default function TabsLayout() {
  const colors = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  // Sit above the Android navigation buttons / gesture bar and the iPhone home indicator.
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 12);

  const icon = (name: IconName, activeName: IconName) =>
    function Icon({ color, focused }: { color: ColorValue; focused: boolean }) {
      return <TabIcon name={name} activeName={activeName} color={color} focused={focused} highlight={colors.backgroundSelected} />;
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 58 + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset,
          elevation: 12,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: -2 },
        },
        tabBarItemStyle: { paddingVertical: 2 },
        tabBarLabelStyle: {
          fontFamily: 'Poppins_500Medium',
          fontSize: 11,
          marginTop: 2,
        },
      }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="tasks" options={{ title: t('tabs.tasks'), tabBarIcon: icon('checkbox-outline', 'checkbox') }} />
      <Tabs.Screen name="calendar" options={{ title: t('tabs.calendar'), tabBarIcon: icon('calendar-outline', 'calendar') }} />
      {/* Projects are hidden from navigation; tasks are organised by category instead. */}
      <Tabs.Screen name="projects" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 52, height: 30, alignItems: 'center', justifyContent: 'center' },
  pill: { borderRadius: 15 },
});

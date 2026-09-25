import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, SPACING } from '../theme';
import { Screen, useStore } from '../store';

const TABS: { key: Screen; label: string; group: Screen[] }[] = [
  { key: 'home', label: 'Home', group: ['home'] },
  { key: 'closet', label: 'Closet', group: ['closet', 'detail', 'add', 'addManual'] },
  { key: 'fitcheck', label: 'FitCheck', group: ['fitcheck', 'result'] },
  { key: 'profile', label: 'Profile', group: ['profile'] },
];

export default function TabBar() {
  const insets = useSafeAreaInsets();
  const store = useStore();
  const active = TABS.find((t) => t.group.includes(store.screen))?.key ?? 'home';

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]} accessibilityRole="tablist">
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Pressable
            key={t.key}
            onPress={() => store.go(t.key)}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[styles.label, { color: isActive ? COLORS.ink : COLORS.faint, fontFamily: isActive ? FONTS.semibold : FONTS.regular }]}>
              {t.label}
            </Text>
            <View
              style={[styles.dot, { backgroundColor: isActive ? COLORS.ink : 'transparent' }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', backgroundColor: 'rgba(246,245,242,0.96)',
    borderTopWidth: 1, borderTopColor: COLORS.borderSoft, paddingTop: SPACING.md, paddingHorizontal: SPACING.md,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  label: { fontSize: 12.5, letterSpacing: -0.1 },
  dot: { width: 4, height: 4, borderRadius: 99 },
});

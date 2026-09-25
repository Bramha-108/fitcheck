import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADII, SCREEN_PADDING, SPACING, TYPE } from '../theme';
import { useStore } from '../store';
import { BackRow, Card } from '../components/UI';

function OptionCard({ title, sub, onPress }: { title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`}>
      {({ pressed }) => (
        <Card style={[styles.card, pressed && { backgroundColor: '#F1EFE9' }]}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSub}>{sub}</Text>
        </Card>
      )}
    </Pressable>
  );
}

export default function AddScreen() {
  const insets = useSafeAreaInsets();
  const store = useStore();
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING, paddingTop: insets.top + SPACING.xl, paddingBottom: SPACING.xl }}>
      <BackRow onPress={store.back} />
      <Text accessibilityRole="header" style={styles.title}>Add a garment</Text>
      <Text style={styles.sub}>Everything stays on this device. No account, no upload.</Text>
      <View style={{ gap: SPACING.sm, marginTop: SPACING.xl }}>
        <OptionCard
          title="Manual entry"
          sub="Brand, product, category, size, measurements, fit, style, notes."
          onPress={() => store.go('addManual')}
        />
        <OptionCard
          title="Garment photo"
          sub="Attach a shot for visual reference. Stored in your photo library, linked by reference."
          onPress={() => store.go('addManual')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: FONTS.semibold, fontSize: TYPE.focused, letterSpacing: -0.6, marginTop: SPACING.md + 2, color: COLORS.ink },
  sub: { fontSize: 14.5, color: '#6E6A60', marginTop: SPACING.sm, lineHeight: 20, fontFamily: FONTS.regular },
  card: { padding: SPACING.lg + 2 },
  cardTitle: { fontSize: 16.5, fontFamily: FONTS.semibold, color: COLORS.ink },
  cardSub: { fontSize: 13.5, color: '#6E6A60', marginTop: 6, lineHeight: 19, fontFamily: FONTS.regular },
});

import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
// From gesture-handler, not react-native — see HomeScreen.tsx's identical note.
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADII, SCREEN_PADDING, SPACING } from '../theme';
import { useStore } from '../store';
import { Chip, Collapsible, MeasurementGrid, PrimaryButton, ScreenHeader, SectionLabel, UnitToggle } from '../components/UI';
import { CATEGORY_LABELS, FITS, keysFor } from '../data/constants';
import { orderFits, refFor } from '../engine/compare';
import { Category } from '../types';
import { formatValue } from '../utils/units';
import { sanitizeNumeric } from '../store';

export default function FitCheckScreen({ scrollRef }: { scrollRef?: React.RefObject<any> }) {
  const insets = useSafeAreaInsets();
  const store = useStore();
  const { fc, garments, units } = store;

  const ref = refFor(fc.category, garments);
  const measures = keysFor(fc.category);
  const allFits = orderFits(fc.category, garments, FITS[fc.category]);
  const visibleFits = allFits.slice(0, 5);
  const extraFits = allFits.slice(5);
  // Same "don't hide the active selection behind + More" rule as
  // AddManualScreen's identical fit-chip pattern.
  const fitsOpen = store.fcFitsOpen || (!!fc.fit && extraFits.includes(fc.fit));

  return (
    <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING, paddingTop: insets.top + SPACING.xl, paddingBottom: SPACING.major }}>
      <ScreenHeader title="FitCheck" subtitle="Enter the measurements of something you're considering. We'll tell you how it compares to what you already own." />

      <View style={{ flexDirection: 'row', gap: 7, marginTop: SPACING.xl - 2 }}>
        {CATEGORY_LABELS.map(([cat, label]) => (
          <View key={cat} style={{ flex: 1 }}>
            <Chip label={label} active={fc.category === cat} onPress={() => store.setFcCategory(cat as Category)} />
          </View>
        ))}
      </View>

      <View style={styles.measureHeaderRow}>
        <SectionLabel top={0} style={{ flex: 1 }}>Measurements</SectionLabel>
        <UnitToggle units={units} onChange={store.setUnits} />
      </View>
      <MeasurementGrid
        items={measures.map(([key, label]) => ({
          key,
          label,
          value: String(fc[key] ?? ''),
          placeholder: ref?.m[key] !== undefined ? formatValue(ref.m[key] as number, units) : '—',
          onChange: (v) => store.setFc(key, sanitizeNumeric(v)),
        }))}
      />

      <View style={{ flexDirection: 'row', gap: SPACING.md - 2, marginTop: SPACING.xl }}>
        <View style={{ flex: 1 }}>
          <SectionLabel top={0}>Size on label</SectionLabel>
          <TextInput value={fc.size} onChangeText={(v) => store.setFc('size', v)} placeholder="L" placeholderTextColor={COLORS.faintest} style={[styles.input, { fontFamily: FONTS.mono }]} accessibilityLabel="Size on label" />
        </View>
        <View style={{ flex: 1 }}>
          <SectionLabel top={0}>Silhouette</SectionLabel>
          <TextInput value={fc.silhouette} onChangeText={(v) => store.setFc('silhouette', v)} placeholder="Relaxed" placeholderTextColor={COLORS.faintest} style={styles.input} accessibilityLabel="Silhouette" />
        </View>
      </View>

      <SectionLabel top={SPACING.lg}>Fit type</SectionLabel>
      <View style={styles.chipsWrap}>
        {visibleFits.map((f) => (
          <Chip key={f} label={f} active={fc.fit === f} onPress={() => store.setFc('fit', f)} />
        ))}
        {!fitsOpen && extraFits.length > 0 && <Chip label="+ More" onPress={store.toggleFcFits} />}
      </View>
      <Collapsible open={fitsOpen}>
        <View style={styles.chipsWrap}>
          {extraFits.map((f) => (
            <Chip key={f} label={f} active={fc.fit === f} onPress={() => store.setFc('fit', f)} />
          ))}
        </View>
      </Collapsible>

      <View style={{ marginTop: SPACING.xl - 2 }}>
        <PrimaryButton label="Compare with my closet" onPress={store.runCheck} />
        <Text style={styles.footNote}>No size prediction. Just a comparison against garments you already know.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  measureHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.lg - 2 },
  input: {
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.md,
    padding: 13, fontSize: 15, color: COLORS.ink, marginTop: SPACING.sm, fontFamily: FONTS.regular,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: SPACING.sm },
  footNote: { fontSize: 12, color: COLORS.muted, marginTop: SPACING.sm + 2, lineHeight: 17, textAlign: 'center', fontFamily: FONTS.regular },
});

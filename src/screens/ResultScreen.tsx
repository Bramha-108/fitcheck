import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADII, SCREEN_PADDING, SPACING } from '../theme';
import { useStore } from '../store';
import { BackRow, Card, EmptyState, Eyebrow, PhotoTile, SecondaryButton, SectionLabel, toneColor } from '../components/UI';
import { formatDelta, formatValue } from '../utils/units';
import { CATEGORY_LABELS } from '../data/constants';
import { MOTION, useReducedMotion } from '../utils/motion';

function NoComparisonYet() {
  const insets = useSafeAreaInsets();
  const store = useStore();
  const reason = store.noResultReason;
  const categoryLabel = (CATEGORY_LABELS.find(([cat]) => cat === store.fc.category)?.[1] ?? 'garments').toLowerCase();

  // Honest about which of the four real causes it is (empty closet, empty
  // category, no measurement entered, or entered measurements that just don't
  // overlap with anything in the closet) rather than one generic message —
  // and never a blank screen (FitCheck Premium Guideline #1/#8).
  const copy =
    reason === 'noMeasurements'
      ? {
          title: 'Add a measurement to compare',
          body: 'Enter at least one measurement to see how it compares to your closet.',
          primaryLabel: 'Back to measurements',
          onPrimary: store.back,
          showSecondary: false,
        }
      : reason === 'noOverlap'
        ? {
            title: 'Nothing shares these measurements yet',
            body: `None of your ${categoryLabel} have the zones you entered recorded, so there's nothing to compare against. Try a different measurement, or add it to one of your ${categoryLabel} first.`,
            primaryLabel: 'Back to measurements',
            onPrimary: store.back,
            showSecondary: false,
          }
        : reason === 'noCategoryGarments'
          ? {
              title: 'Nothing to compare yet',
              body: `You don't have any ${categoryLabel} saved yet. Add one you already know fits, then compare against it.`,
              primaryLabel: 'Add a garment',
              onPrimary: () => store.go('addManual'),
              showSecondary: true,
            }
          : {
              title: 'Nothing to compare yet',
              body: 'Your closet is empty — FitCheck needs at least one saved garment to find a fit you already know.',
              primaryLabel: 'Add your first garment',
              onPrimary: () => store.go('addManual'),
              showSecondary: true,
            };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING, paddingTop: insets.top + SPACING.xl, paddingBottom: SPACING.xl, flexGrow: 1 }}>
      <BackRow label="← Adjust measurements" onPress={store.back} />
      <View style={styles.emptyWrap}>
        <EmptyState
          title={copy.title}
          body={copy.body}
          primaryLabel={copy.primaryLabel}
          onPrimary={copy.onPrimary}
          secondaryLabel={copy.showSecondary ? 'Back' : undefined}
          onSecondary={copy.showSecondary ? store.back : undefined}
          style={{ borderWidth: 0, backgroundColor: 'transparent', padding: 0 }}
        />
      </View>
    </ScrollView>
  );
}

export default function ResultScreen() {
  const insets = useSafeAreaInsets();
  const store = useStore();
  const r = store.result;
  const { units } = store;
  const reduceMotion = useReducedMotion();

  // One shared 0→1 timeline drives four staged groups (closest match → diffs →
  // meaning → confidence) via interpolation, instead of separate Animated.Values
  // per element — a deliberate, subtle reveal that mirrors the decision order,
  // not motion for its own sake. Skips straight to visible when reduce-motion
  // is on, or when there's no result to reveal.
  const reveal = useRef(new Animated.Value(reduceMotion || !r ? 1 : 0)).current;
  useEffect(() => {
    if (!r) return;
    if (reduceMotion) {
      reveal.setValue(1);
      return;
    }
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: MOTION.compareReveal,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [r, reduceMotion]);

  const stage = (from: number, to: number) => ({
    opacity: reveal.interpolate({ inputRange: [from, to], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [{ translateY: reveal.interpolate({ inputRange: [from, to], outputRange: [8, 0], extrapolate: 'clamp' }) }],
  });

  if (!r) return <NoComparisonYet />;

  const bannerBg = r.tone === 'good' ? COLORS.goodBg : r.tone === 'warn' ? COLORS.warnBg : COLORS.badBg;
  const bannerBd = r.tone === 'good' ? COLORS.goodBd : r.tone === 'warn' ? COLORS.warnBd : COLORS.badBd;
  const dot = toneColor(r.tone);

  const confBars = r.confidence === 'High' ? [1, 1, 1] : r.confidence === 'Medium' ? [1, 1, 0] : [1, 0, 0];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING, paddingTop: insets.top + SPACING.xl, paddingBottom: SPACING.xl }}>
      <BackRow label="← Adjust measurements" onPress={store.back} />

      <Animated.View style={stage(0, 0.4)}>
        <SectionLabel top={SPACING.lg}>Closest match</SectionLabel>
        <Pressable
          onPress={() => store.openGarment(r.closest.id)}
          style={styles.closestRow}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Closest match: ${r.closest.brand} ${r.closest.name}, size ${r.closest.size}, ${r.closest.fit}, ${r.closest.sil}`}
        >
          <View style={styles.closestThumb}>
            <PhotoTile bg={r.closest.bg} height={68} uri={r.closest.photo} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Eyebrow>{r.closest.brand}</Eyebrow>
            <Text style={styles.closestName}>{r.closest.name} — {r.closest.size}</Text>
            <Text style={styles.closestMeta}>{r.closest.fit} · {r.closest.sil}</Text>
          </View>
        </Pressable>
      </Animated.View>

      <Animated.View style={stage(0.25, 0.65)}>
        <Card style={{ paddingHorizontal: SPACING.lg, marginTop: SPACING.md }}>
          <View style={styles.diffHeader}>
            <Eyebrow>Measurement</Eyebrow>
            <Eyebrow>Difference</Eyebrow>
          </View>
          {r.diffs.map((d, i) => (
            <View key={d.label} style={[styles.diffRow, i === r.diffs.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={styles.diffLabel}>{d.label}</Text>
              <Text style={[styles.diffText, { color: toneColor(d.tone) }]}>{formatDelta(d.cm, units)}</Text>
            </View>
          ))}
        </Card>
        <Text style={styles.noteText}>{r.silhouetteNote}</Text>
      </Animated.View>

      <Animated.View style={stage(0.45, 0.85)}>
        <View style={[styles.banner, { backgroundColor: bannerBg, borderColor: bannerBd, marginTop: SPACING.xl - 4 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <View style={[styles.bigDot, { backgroundColor: dot }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
            <Text accessibilityRole="header" style={[styles.verdict, { color: dot }]}>{r.verdict}</Text>
          </View>
          <Text style={styles.verdictNote}>{r.verdictNote}</Text>
        </View>

        <SectionLabel>Expected feel</SectionLabel>
        <View style={{ gap: 9, marginTop: SPACING.md - 1 }}>
          {r.feel.map((f, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <View style={styles.bullet} />
              <Text style={styles.feelText}>{f}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.noteText, { marginTop: SPACING.md + 2 }]}>{r.preferenceNote}</Text>

        {/* Secondary evidence, not a competing conclusion — plain rows instead of a
            bordered Card so it reads lighter than Closest match/Expected feel above
            (DESIGN_GUIDELINES.md #22: don't give this the same visual weight). */}
        <SectionLabel>Compared with your wardrobe</SectionLabel>
        <View style={{ marginTop: SPACING.xs }}>
          {r.similar.map((s, i) => (
            <Pressable
              key={s.garment.id}
              onPress={() => store.openGarment(s.garment.id)}
              style={[styles.simRow, i === r.similar.length - 1 && { borderBottomWidth: 0 }]}
              accessible
              accessibilityRole="button"
              accessibilityLabel={`${i + 1}. ${s.garment.brand} ${s.garment.name}, size ${s.garment.size}, average ${formatValue(s.gap, units)} ${units} difference`}
            >
              <Text style={styles.simRank}>{i + 1}.</Text>
              <Text style={styles.simName}>{s.garment.brand} {s.garment.name} — {s.garment.size}</Text>
              <Text style={styles.simGap}>avg {formatValue(s.gap, units)} {units}</Text>
            </Pressable>
          ))}
        </View>

        <SectionLabel>Why</SectionLabel>
        <Text style={styles.whyText}>{r.why}</Text>
      </Animated.View>

      <Animated.View style={stage(0.7, 1)}>
        <View style={styles.confRow}>
          <View>
            <Text style={styles.confTitle}>Confidence: {r.confidence}</Text>
            <Text style={styles.confNote}>{r.confidenceNote}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {confBars.map((on, i) => (
              <View key={i} style={[styles.confBar, { backgroundColor: on ? COLORS.ink : 'rgba(22,21,15,0.13)' }]} />
            ))}
          </View>
        </View>

        <View style={{ marginTop: 12 }}>
          <SecondaryButton label="Save this as a garment" onPress={store.startGarmentFromResult} />
        </View>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  banner: { marginTop: 16, borderRadius: RADII.xl, padding: 18, paddingHorizontal: 20, borderWidth: 1 },
  bigDot: { width: 10, height: 10, borderRadius: 99 },
  verdict: { fontFamily: FONTS.semibold, fontSize: 19, letterSpacing: -0.4 },
  verdictNote: { fontSize: 14, color: '#33312A', marginTop: 8, lineHeight: 20, fontFamily: FONTS.regular },
  closestRow: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.borderSoft, borderRadius: RADII.xl, padding: 14, marginTop: 10, flexDirection: 'row', gap: 13, alignItems: 'center' },
  closestThumb: { width: 56, height: 68, borderRadius: 10, overflow: 'hidden' },
  closestName: { fontSize: 15.5, fontFamily: FONTS.semibold, marginTop: 3, color: COLORS.ink },
  closestMeta: { fontSize: 12.5, color: COLORS.muted, marginTop: 3, fontFamily: FONTS.regular },
  diffHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(22,21,15,0.1)' },
  diffRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.borderFaint },
  diffLabel: { fontSize: 14, color: COLORS.ink, fontFamily: FONTS.regular },
  diffText: { fontFamily: FONTS.mono, fontSize: 14 },
  bullet: { width: 5, height: 5, borderRadius: 99, backgroundColor: COLORS.ink, marginTop: 8 },
  feelText: { fontSize: 14.5, lineHeight: 20, color: COLORS.ink, flex: 1, fontFamily: FONTS.regular },
  simRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderFaint },
  simRank: { fontFamily: FONTS.mono, fontSize: 12, color: COLORS.faintest, width: 14 },
  simName: { flex: 1, fontSize: 14, color: COLORS.ink, fontFamily: FONTS.regular },
  simGap: { fontSize: 12.5, color: COLORS.muted, fontFamily: FONTS.regular },
  whyText: { fontSize: 14.5, lineHeight: 21, marginTop: 10, color: '#33312A', fontFamily: FONTS.regular },
  noteText: { fontSize: 13, lineHeight: 19, marginTop: 10, color: COLORS.muted, fontFamily: FONTS.regular },
  confRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.borderSoft, borderRadius: RADII.lg, padding: 15, paddingHorizontal: 16, marginTop: 22 },
  confTitle: { fontSize: 14.5, fontFamily: FONTS.semibold, color: COLORS.ink },
  confNote: { fontSize: 12.5, color: COLORS.muted, marginTop: 3, fontFamily: FONTS.regular },
  confBar: { width: 7, height: 22, borderRadius: 3 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingBottom: 60 },
});

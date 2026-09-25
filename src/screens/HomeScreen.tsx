import React, { useMemo } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
// From gesture-handler, not react-native — so this screen's horizontal rail
// (and its own vertical scroll) arbitrate correctly against the top-level
// swipe-between-tabs gesture in TopLevelSwipeNavigator (DESIGN_GUIDELINES.md's
// mobile rule #10: the component that owns a horizontal gesture takes priority).
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADII, SCREEN_PADDING, SPACING, TYPE } from '../theme';
import { useStore } from '../store';
import { Card, Eyebrow, PhotoTile, SectionLabel, ToneDot, usePressScale } from '../components/UI';
import { recentChanges } from '../engine/activity';
import { CATEGORY_LABELS } from '../data/constants';

function todayLabel() {
  return new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning.';
  if (h < 18) return 'Afternoon.';
  return 'Evening.';
}

// A real trailing-action icon (not a text glyph) so it centers against the
// card's content block by its own box rather than by font ascent/descent,
// which is what made the previous "→" character sit visually high.
function CtaArrow() {
  return (
    <View style={styles.ctaArrowBox} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.ctaArrowGlyph} />
    </View>
  );
}

export default function HomeScreen({ scrollRef }: { scrollRef?: React.RefObject<any> }) {
  const insets = useSafeAreaInsets();
  const store = useStore();
  const { garments } = store;

  // A quiet nudge toward the single most useful next action — not a metrics
  // dashboard (see FitCheck Design Decision 01). Says nothing once every category
  // already has enough references, and nothing at all for an empty closet, where
  // "Add a garment" is already the obvious next step.
  const nextActionHint = useMemo(() => {
    if (!garments.length) return '';
    const byCategory = CATEGORY_LABELS.map(([cat, label]) => {
      const refs = garments.filter((g) => g.cat === cat && g.ref).length;
      return { label, pct: Math.min(100, Math.round((refs / 3) * 100)) };
    });
    const weakest = [...byCategory].sort((a, b) => a.pct - b.pct)[0];
    if (!weakest || weakest.pct >= 100) return '';
    return `${weakest.label} could use another reference — rate one more ${weakest.label.toLowerCase().replace(/s$/, '')} that fits well to make those checks more reliable.`;
  }, [garments]);

  const recent = garments.slice(0, 5);
  const refGarments = garments.filter((g) => g.ref).slice(0, 3);
  const changes = useMemo(() => recentChanges(garments, 3), [garments]);

  const pressScaleRun = usePressScale();
  const pressScaleAdd = usePressScale();

  return (
    <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: SPACING.xl }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: SCREEN_PADDING, paddingTop: insets.top + SPACING.xl }}>
        <Eyebrow>{todayLabel()}</Eyebrow>
        <Text style={styles.title}>{greeting()}</Text>

        <View style={{ gap: SPACING.sm, marginTop: SPACING.xl }}>
          <Pressable
            onPress={() => store.go('fitcheck')}
            onPressIn={pressScaleRun.onPressIn}
            onPressOut={pressScaleRun.onPressOut}
            accessibilityRole="button"
            accessibilityLabel="Run a FitCheck. Paste measurements, compare to your closet"
          >
            {({ pressed }) => (
              <Animated.View style={[styles.ctaDark, pressed && { backgroundColor: COLORS.inkActive }, pressScaleRun.style]}>
                <View style={{ flex: 1, marginRight: SPACING.md }}>
                  <Text style={styles.ctaTitle}>Run a FitCheck</Text>
                  <Text style={styles.ctaSub}>Paste measurements, compare to your closet</Text>
                </View>
                <CtaArrow />
              </Animated.View>
            )}
          </Pressable>
          <Pressable
            onPress={() => store.go('add')}
            onPressIn={pressScaleAdd.onPressIn}
            onPressOut={pressScaleAdd.onPressOut}
            accessibilityRole="button"
            accessibilityLabel="Add a garment"
          >
            {({ pressed }) => (
              <Animated.View style={[styles.ctaLight, pressed && { backgroundColor: '#F1EFE9' }, pressScaleAdd.style]}>
                <Text style={styles.ctaLightTitle}>Add a garment</Text>
                <Text style={styles.ctaPlus}>+</Text>
              </Animated.View>
            )}
          </Pressable>
        </View>

        {nextActionHint ? <Text style={styles.hint}>{nextActionHint}</Text> : null}

        <View style={styles.sectionHeaderRow}>
          <SectionLabel top={0}>Recently added</SectionLabel>
          <Pressable onPress={() => store.go('closet')} hitSlop={8} accessibilityRole="button" accessibilityLabel="See all garments in Closet">
            <Text style={styles.allLink}>All</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.md, paddingHorizontal: SCREEN_PADDING, paddingBottom: SPACING.xs }}>
        {recent.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => store.openGarment(g.id)}
            style={{ width: 148 }}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`${g.brand} ${g.name}, ${g.cat}, size ${g.size}`}
          >
            <PhotoTile bg={g.bg} caption={g.cap} height={180} uri={g.photo} />
            <Eyebrow style={{ marginTop: SPACING.sm }}>{g.brand}</Eyebrow>
            <Text style={styles.gName} numberOfLines={2}>{g.name}</Text>
            <Text style={styles.gMeta}>
              {g.cat.charAt(0).toUpperCase() + g.cat.slice(1)} · {g.size}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: SCREEN_PADDING }}>
        <SectionLabel>Strong references</SectionLabel>
        <Text style={styles.subhint}>The garments FitCheck trusts most when comparing.</Text>
        <View style={{ gap: SPACING.sm, marginTop: SPACING.md }}>
          {refGarments.map((g) => {
            const state = g.history[g.history.length - 1].note.split(' at ')[0];
            return (
              <Pressable
                key={g.id}
                onPress={() => store.openGarment(g.id)}
                style={({ pressed }) => [styles.refRow, pressed && { backgroundColor: '#F1EFE9' }]}
                accessible
                accessibilityRole="button"
                accessibilityLabel={`${g.name}, ${g.cat}, size ${g.size}, ${state}`}
              >
                <View style={styles.refThumb}>
                  <PhotoTile bg={g.bg} height={48} uri={g.photo} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.refName} numberOfLines={1}>{g.name}</Text>
                  <Text style={styles.gMeta}>
                    {g.cat.charAt(0).toUpperCase() + g.cat.slice(1)} · {g.size}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs + 2 }}>
                  <ToneDot tone={g.history[g.history.length - 1].tone} />
                  <Text style={styles.refState}>{state}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <SectionLabel>Recent fit changes</SectionLabel>
        <Card style={{ paddingHorizontal: SPACING.lg, marginTop: SPACING.md }}>
          {changes.length === 0 ? (
            <Text style={styles.footNote}>No fit updates logged yet. Update how something fits from its detail screen to start building this.</Text>
          ) : (
            changes.map((c) => (
              <Pressable
                key={c.garment.id}
                onPress={() => store.openGarment(c.garment.id)}
                style={styles.changeRow}
                accessible
                accessibilityRole="button"
                accessibilityLabel={`${c.garment.brand} ${c.garment.name}, ${c.note}, ${c.when}`}
              >
                <ToneDot tone={c.tone} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.changeName}>{c.garment.brand} {c.garment.name}</Text>
                  <Text style={styles.changeNote}>{c.note}</Text>
                </View>
                <Eyebrow color={COLORS.faint}>{c.when.split(' ')[0]}</Eyebrow>
              </Pressable>
            ))
          )}
          <Text style={styles.footNote}>Nothing here is overwritten — every observation stays on the timeline.</Text>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: FONTS.semibold, fontSize: TYPE.display, letterSpacing: -0.6, marginTop: SPACING.sm, color: COLORS.ink },
  ctaDark: { backgroundColor: COLORS.ink, borderRadius: RADII.xl, padding: SPACING.lg + 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ctaTitle: { color: COLORS.cream, fontFamily: FONTS.semibold, fontSize: 17 },
  ctaSub: { color: 'rgba(246,245,242,0.66)', fontSize: 13, marginTop: 2, fontFamily: FONTS.regular },
  // Fixed 24x24 layout box, centered against the card's full content block via
  // the row's alignItems:center rather than manual/absolute positioning. The
  // glyph inside gets a small pre-rotation margin nudge for optical centering —
  // a rotated-corner square's visible point sits slightly off the mathematical
  // center of its own bounding box.
  ctaArrowBox: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  ctaArrowGlyph: {
    width: 9,
    height: 9,
    marginLeft: -1,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: COLORS.cream,
    opacity: 0.75,
    transform: [{ rotate: '45deg' }],
  },
  ctaLight: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.xl, padding: SPACING.lg, paddingHorizontal: SPACING.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ctaLightTitle: { fontFamily: FONTS.medium, fontSize: 16, color: COLORS.ink },
  ctaPlus: { fontSize: 20, color: COLORS.muted },
  hint: { fontSize: 12.5, color: COLORS.muted, marginTop: SPACING.lg, lineHeight: 18, fontFamily: FONTS.regular },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: SPACING.section },
  allLink: { fontSize: 12, color: COLORS.muted, fontFamily: FONTS.regular },
  gName: { fontSize: 13.5, fontWeight: '500', fontFamily: FONTS.medium, lineHeight: 17, height: 34, marginTop: 3, color: COLORS.ink },
  gMeta: { fontSize: 12, color: COLORS.muted, marginTop: 3, fontFamily: FONTS.regular },
  subhint: { fontSize: 12.5, color: COLORS.muted, marginTop: 5, fontFamily: FONTS.regular },
  refRow: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.borderSoft, borderRadius: RADII.lg, padding: 13, paddingHorizontal: SPACING.md + 2, flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  refThumb: { width: 40, height: 48, borderRadius: 8, overflow: 'hidden' },
  refName: { fontSize: 14, fontFamily: FONTS.medium, color: COLORS.ink },
  refState: { fontSize: 12, color: '#4A473F', fontFamily: FONTS.regular },
  changeRow: { flexDirection: 'row', gap: SPACING.md, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.borderFaint, alignItems: 'flex-start' },
  changeName: { fontSize: 14, fontFamily: FONTS.medium, color: COLORS.ink },
  changeNote: { fontSize: 12.5, color: '#6E6A60', marginTop: 2, fontFamily: FONTS.regular },
  footNote: { paddingVertical: 13, fontSize: 12.5, color: COLORS.muted, lineHeight: 18, fontFamily: FONTS.regular },
});

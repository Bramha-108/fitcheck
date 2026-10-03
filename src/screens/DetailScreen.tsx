import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADII, SCREEN_PADDING, SPACING, TYPE } from '../theme';
import { useStore } from '../store';
import { Card, Collapsible, Eyebrow, PhotoTile, PrimaryButton, SecondaryButton, SectionLabel, ToneDot, usePressScale } from '../components/UI';
import { dotFor } from '../engine/compare';
import { keysFor } from '../data/constants';
import { formatMeasurement } from '../utils/units';
import { MOTION, useReducedMotion } from '../utils/motion';
import { HistoryEntry } from '../types';

/**
 * Detail's own back control — off the hero photo, on the page background, so
 * it reads as page navigation rather than part of the image (unlike the
 * translucent-circle-over-photo treatment this replaced). The arrow is
 * centered by layout (fixed square box, flex centering) rather than manual
 * offsets — `includeFontPadding`/`textAlignVertical` strip Android's default
 * glyph padding, which is what made "←" read as off-center in a supposedly
 * centered container.
 */
function DetailBackButton({ onPress }: { onPress: () => void }) {
  const pressScale = usePressScale();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      style={backBtnStyles.hit}
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <Animated.View style={[backBtnStyles.box, pressScale.style]}>
        <Text style={backBtnStyles.arrow}>←</Text>
      </Animated.View>
    </Pressable>
  );
}

const backBtnStyles = StyleSheet.create({
  hit: { alignSelf: 'flex-start' },
  box: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  arrow: {
    fontSize: 20,
    lineHeight: 20,
    color: COLORS.ink,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
});

export default function DetailScreen() {
  const insets = useSafeAreaInsets();
  const store = useStore();
  const reduceMotion = useReducedMotion();
  const g = store.garments.find((x) => x.id === store.selectedId) ?? store.garments[0];

  const measures = useMemo(
    () => (g ? keysFor(g.cat).filter(([k]) => g.m[k] !== undefined).map(([k, label]) => ({ label, val: g.m[k] as number })) : []),
    [g]
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => setHistoryOpen(false), [g?.id]);
  // Drives a quick, decisive fade+shrink on delete — "the garment leaves the
  // current context" instead of an instant hard-cut to Closet.
  const exitProgress = useRef(new Animated.Value(1)).current;

  const fullHistory: HistoryEntry[] = useMemo(() => (g ? [...g.history].reverse() : []), [g]);

  // A new entry (from "Update how it fits") settles into the top of the timeline
  // with a quiet fade+rise instead of just appearing — "fit observations
  // accumulate, they don't overwrite each other." Only the true rising edge
  // (same garment, history grew) triggers it; switching garments or a plain
  // re-render never should.
  const newEntryProgress = useRef(new Animated.Value(1)).current;
  const prevHistoryRef = useRef<{ id: number | undefined; len: number }>({ id: g?.id, len: fullHistory.length });
  useEffect(() => {
    const prev = prevHistoryRef.current;
    if (prev.id === g?.id && fullHistory.length > prev.len && !reduceMotion) {
      newEntryProgress.setValue(0);
      Animated.timing(newEntryProgress, {
        toValue: 1,
        duration: MOTION.save,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
    prevHistoryRef.current = { id: g?.id, len: fullHistory.length };
  }, [g?.id, fullHistory.length, reduceMotion]);

  // If this Detail visit is the destination of a Closet-tile shared-element
  // transition (see PhotoTransitionOverlay), report the hero photo's real
  // on-screen rect once laid out so the overlay knows where to land. Guarded to
  // this exact garment id so a stale/unrelated transition can never latch onto
  // the wrong hero.
  const heroRef = useRef<View>(null);
  const isTransitionTarget = store.photoTransition?.garmentId === g?.id;
  useEffect(() => {
    if (!isTransitionTarget || !heroRef.current) return;
    heroRef.current.measureInWindow((x, y, width, height) => {
      store.reportPhotoTransitionTarget(g!.id, { x, y, width, height });
    });
  }, [isTransitionTarget]);

  // Reached with a stale id (e.g. the garment was deleted from another screen) —
  // nothing to show, and the store's own back-flow already lands elsewhere on delete.
  if (!g) return null;

  const confirmDelete = () => {
    store.confirm({
      title: 'Remove garment?',
      message: `"${g.name}" and its fit history will be deleted. This can't be undone.`,
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: () => {
        if (reduceMotion) {
          store.deleteGarmentById(g.id);
          return;
        }
        Animated.timing(exitProgress, {
          toValue: 0,
          duration: MOTION.delete,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(async ({ finished }) => {
          if (!finished) return;
          // The garment is still there if the delete failed — reverse the exit
          // rather than leave an invisible screen behind the "try again" toast.
          if (!(await store.deleteGarmentById(g.id))) {
            Animated.timing(exitProgress, {
              toValue: 1,
              duration: MOTION.delete,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start();
          }
        });
      },
    });
  };
  // Size/Fit/Silhouette are labeled explicitly (unlike category/stretch/tags,
  // which already read fine on their own) so an unset '—' never shows up as a
  // bare, unexplained dash months later — see DESIGN_GUIDELINES.md's Measurement
  // integrity: missing must stay legible as missing, not just absent of context.
  const chips = [
    g.cat.charAt(0).toUpperCase() + g.cat.slice(1),
    `Size ${g.size}`,
    `Fit ${g.fit}`,
    `Silhouette ${g.sil}`,
    g.stretch,
    ...g.tags,
  ];
  const HISTORY_LIMIT = 6;
  const visibleHistory = fullHistory.slice(0, HISTORY_LIMIT);
  const extraHistory = fullHistory.slice(HISTORY_LIMIT);

  const renderHistoryEntry = (h: HistoryEntry, globalIndex: number) => (
    <View key={globalIndex} style={{ flexDirection: 'row', gap: 14 }}>
      <View style={{ alignItems: 'center', width: 9 }}>
        <View style={[styles.histDot, { backgroundColor: (h.tone === 'good' ? COLORS.good : h.tone === 'warn' ? COLORS.warn : COLORS.bad) }]} />
        {globalIndex < fullHistory.length - 1 && <View style={styles.histLine} />}
      </View>
      <View style={{ paddingBottom: 18, flex: 1 }}>
        <Eyebrow>{h.when}</Eyebrow>
        <Text style={styles.histNote}>{h.note}</Text>
      </View>
    </View>
  );

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: exitProgress,
        transform: [{ scale: exitProgress.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
      }}
    >
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: SCREEN_PADDING, paddingTop: insets.top, paddingBottom: SPACING.sm }}>
          <DetailBackButton onPress={store.back} />
        </View>
        <View style={{ height: 340, paddingHorizontal: SCREEN_PADDING }}>
          <View ref={heroRef} collapsable={false} style={{ height: 340 }}>
            <PhotoTile bg={g.bg} caption={g.cap} height={340} uri={g.photo} bordered={false} instant={isTransitionTarget} />
          </View>
        </View>
        <View style={{ paddingHorizontal: SCREEN_PADDING, paddingTop: SPACING.xl - 2 }}>
          <Eyebrow>{g.brand}</Eyebrow>
          <Text accessibilityRole="header" style={styles.name}>{g.name}</Text>
          <View style={styles.chipsRow}>
            {chips.map((c, i) => (
              <View key={i} style={styles.chip}>
                <Text style={styles.chipText}>{c}</Text>
              </View>
            ))}
          </View>

          <SectionLabel>Measurements</SectionLabel>
          <Card style={{ paddingHorizontal: SPACING.lg, marginTop: SPACING.md }}>
            {measures.map((m, i) => (
              <View key={m.label} style={[styles.row, i === measures.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={styles.rowLabel}>{m.label}</Text>
                <Text style={styles.rowVal}>{formatMeasurement(m.val, store.units)}</Text>
              </View>
            ))}
          </Card>

          <SectionLabel>How it fits</SectionLabel>
          <Card style={{ paddingHorizontal: SPACING.lg, marginTop: SPACING.md }}>
            {g.feels.length === 0 ? (
              <Text style={[styles.rowLabel, { paddingVertical: 14 }]}>No fit feedback logged yet.</Text>
            ) : (
              g.feels.map((f, i) => (
                <View key={f.area} style={[styles.row, i === g.feels.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={styles.rowLabel}>{f.area}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <ToneDot tone={dotFor(f.verdict)} />
                    <Text style={styles.verdictText}>{f.verdict}</Text>
                  </View>
                </View>
              ))
            )}
          </Card>

          <SectionLabel>Visual preference</SectionLabel>
          <Card style={{ padding: SPACING.lg, marginTop: SPACING.md }}>
            <Text style={styles.visualText}>{g.visual}</Text>
          </Card>

          <SectionLabel>Fit history</SectionLabel>
          <View style={{ marginTop: SPACING.md, paddingLeft: 4 }}>
            {visibleHistory.map((h, i) =>
              i === 0 ? (
                <Animated.View
                  key={0}
                  style={{
                    opacity: newEntryProgress,
                    transform: [{ translateY: newEntryProgress.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
                  }}
                >
                  {renderHistoryEntry(h, 0)}
                </Animated.View>
              ) : (
                renderHistoryEntry(h, i)
              )
            )}
            <Collapsible open={historyOpen}>
              {extraHistory.map((h, i) => renderHistoryEntry(h, HISTORY_LIMIT + i))}
            </Collapsible>
          </View>
          {extraHistory.length > 0 && (
            <Pressable
              onPress={() => setHistoryOpen((s) => !s)}
              hitSlop={8}
              style={{ marginTop: -4, marginBottom: 4 }}
              accessibilityRole="button"
              accessibilityState={{ expanded: historyOpen }}
            >
              <Text style={styles.historyToggle}>
                {historyOpen ? 'Show less' : `Show all ${fullHistory.length} entries`}
              </Text>
            </Pressable>
          )}

          <View style={{ flexDirection: 'row', gap: SPACING.md, marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton label="Update how it fits" onPress={store.openSheet} />
            </View>
            <SecondaryButton label="Edit" onPress={() => store.loadEditGarment(g.id)} />
          </View>
          <Text style={styles.footNote}>Updating adds a new entry. Previous records stay intact.</Text>
          <Pressable
            onPress={confirmDelete}
            hitSlop={8}
            style={{ marginTop: 18, alignSelf: 'center' }}
            accessibilityRole="button"
            accessibilityLabel="Remove from closet"
          >
            <Text style={styles.removeText}>Remove from closet</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: FONTS.semibold, fontSize: TYPE.focused, letterSpacing: -0.6, lineHeight: 30, marginTop: 7, color: COLORS.ink },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: SPACING.md },
  chip: { backgroundColor: COLORS.chipBg, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5 },
  chipText: { fontSize: 12, color: '#4A473F', fontFamily: FONTS.regular },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.borderFaint },
  rowLabel: { fontSize: 14, color: COLORS.ink, fontFamily: FONTS.regular },
  rowVal: { fontFamily: FONTS.mono, fontSize: 14, color: COLORS.ink },
  verdictText: { fontSize: 13.5, color: '#4A473F', fontFamily: FONTS.regular },
  visualText: { fontSize: 14, lineHeight: 21, color: '#33312A', fontFamily: FONTS.regular },
  historyToggle: { fontSize: 12, color: COLORS.muted, fontFamily: FONTS.regular, textDecorationLine: 'underline' },
  histDot: { width: 9, height: 9, borderRadius: 99, marginTop: 4 },
  histLine: { flex: 1, width: 1, backgroundColor: 'rgba(22,21,15,0.12)' },
  histNote: { fontSize: 14, marginTop: 4, lineHeight: 19, color: COLORS.ink, fontFamily: FONTS.regular },
  footNote: { fontSize: 12, color: COLORS.muted, marginTop: 12, lineHeight: 17, fontFamily: FONTS.regular },
  removeText: { fontSize: 13, color: COLORS.bad, fontFamily: FONTS.regular },
});

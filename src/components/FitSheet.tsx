import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADII, SCREEN_PADDING, SPACING } from '../theme';
import { useStore } from '../store';
import { Chip, PrimaryButton, SectionLabel } from './UI';
import { FIT_VERDICTS, VISUAL_LOOKS, keysFor } from '../data/constants';
import { MOTION, useReducedMotion } from '../utils/motion';

const { height: SCREEN_H } = Dimensions.get('window');

export default function FitSheet() {
  const insets = useSafeAreaInsets();
  const store = useStore();
  const reduceMotion = useReducedMotion();
  const slide = useRef(new Animated.Value(SCREEN_H)).current;
  // Stays mounted for the length of the close animation — a bottom sheet should
  // dismiss "physically, grounded" (see DESIGN_GUIDELINES.md's motion language),
  // not vanish the instant sheetOpen flips false.
  const [visible, setVisible] = useState(false);
  const g = store.garments.find((x) => x.id === store.selectedId);

  useEffect(() => {
    const duration = reduceMotion ? 0 : MOTION.sheet;
    if (store.sheetOpen) {
      setVisible(true);
      slide.setValue(reduceMotion ? 0 : SCREEN_H);
      Animated.timing(slide, { toValue: 0, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(slide, { toValue: SCREEN_H, duration, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (finished) setVisible(false);
      });
    }
  }, [store.sheetOpen]);

  if (!visible || !g) return null;

  const areas = keysFor(g.cat).map(([, label]) => label);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={styles.backdrop} onPress={store.closeSheet} accessibilityRole="button" accessibilityLabel="Dismiss" />
      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + 20, transform: [{ translateY: slide }] }]}
        accessibilityViewIsModal
      >
        <View style={styles.handle} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <Text style={styles.swipeHint}>Tap outside to dismiss</Text>
        {/* The form can be taller than the sheet's max height (small phones,
            larger system font sizes, an open keyboard), so it scrolls between the
            fixed handle and the pinned "Add to fit history" action — nothing is
            ever clipped out of reach. */}
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text accessibilityRole="header" style={styles.title}>How does it fit today?</Text>
          <Text style={styles.sub}>This gets added to the timeline. Nothing is replaced.</Text>

          <SectionLabel top={SPACING.xl - 4}>Area</SectionLabel>
          <View style={styles.chipsWrap}>
            {areas.map((a) => (
              <Chip key={a} label={a} active={store.sArea === a} onPress={() => store.setSheetArea(a)} />
            ))}
          </View>

          <SectionLabel top={SPACING.xl - 4}>Physical comfort</SectionLabel>
          {/* Natural-width chips that wrap, like Area/Visual preference — five
              equal-width columns were too narrow for "Too tight"/"Too loose" and
              broke words mid-way on narrow screens. */}
          <View style={styles.chipsWrap}>
            {FIT_VERDICTS.map((v) => (
              <Chip key={v} label={v} active={store.sVerdict === v} onPress={() => store.setSheetVerdict(v)} />
            ))}
          </View>
          <TextInput
            value={store.sComfortNote}
            onChangeText={store.setSheetComfortNote}
            placeholder="e.g. Shoulder uncomfortable, waist was perfect when I bought it…"
            placeholderTextColor={COLORS.faintest}
            multiline
            style={styles.noteInput}
            accessibilityLabel="Comfort notes"
          />

          <SectionLabel top={SPACING.xl - 4}>
            Visual preference <Text style={styles.labelMuted}>· separate from comfort</Text>
          </SectionLabel>
          <View style={styles.chipsWrap}>
            {VISUAL_LOOKS[g.cat].map((l) => (
              <Chip key={l} label={l} active={store.sLook === l} onPress={() => store.setSheetLook(l)} />
            ))}
          </View>
          <TextInput
            value={store.sLook}
            onChangeText={store.setSheetLook}
            placeholder="Or type your own — e.g. Love the oversized silhouette"
            placeholderTextColor={COLORS.faintest}
            style={styles.visualInput}
            accessibilityLabel="Visual preference"
          />
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton label="Add to fit history" onPress={store.saveFit} />
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(22,21,15,0.4)' },
  // Sheet sits in normal flow at the bottom (not position: absolute) so the iOS
  // KeyboardAvoidingView's padding actually lifts it above the keyboard.
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: SCREEN_PADDING, paddingTop: 14,
    maxHeight: '86%',
  },
  handle: { width: 38, height: 4, borderRadius: 99, backgroundColor: 'rgba(22,21,15,0.16)', alignSelf: 'center', marginBottom: 6 },
  body: { flexGrow: 0, flexShrink: 1 },
  bodyContent: { paddingBottom: SPACING.xs },
  footer: { paddingTop: SPACING.md },
  swipeHint: { textAlign: 'center', fontSize: 11, color: COLORS.faintest, marginBottom: 12, fontFamily: FONTS.regular },
  title: { fontSize: 20, fontFamily: FONTS.semibold, letterSpacing: -0.4, color: COLORS.ink },
  sub: { fontSize: 13, color: '#6E6A60', marginTop: 6, lineHeight: 19, fontFamily: FONTS.regular },
  labelMuted: { color: COLORS.faintest, letterSpacing: 0.4, textTransform: 'none' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: SPACING.sm + 1 },
  noteInput: {
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.md,
    padding: SPACING.md, marginTop: SPACING.sm + 1, minHeight: 56, fontSize: 13.5, color: COLORS.ink, fontFamily: FONTS.regular,
    textAlignVertical: 'top',
  },
  visualInput: {
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.md,
    padding: SPACING.md, marginTop: SPACING.sm + 1, fontSize: 13.5, color: COLORS.ink, fontFamily: FONTS.regular,
  },
});

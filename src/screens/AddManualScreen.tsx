import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADII, SCREEN_PADDING, SPACING, TYPE } from '../theme';
import { useStore } from '../store';
import { BackRow, Chip, Collapsible, FadeImage, MeasurementGrid, PrimaryButton, SectionLabel, UnitToggle } from '../components/UI';
import { CATEGORY_LABELS, STRETCH_LEVELS, STYLE_TAGS, keysFor } from '../data/constants';
import { orderFits, refFor, seedNewGarment } from '../engine/compare';
import { FITS } from '../data/constants';
import { Category } from '../types';
import { formatValue } from '../utils/units';
import { useShake } from '../utils/motion';

const UNKNOWN_BRAND = 'Unknown brand';
const UNKNOWN_SIZE = 'Unknown size';

// Same holistic-verdict vocabulary as Onboarding.tsx's own fit-verdict step —
// only 'Fits great' is unambiguous enough to translate into a per-zone comfort
// read (see store.tsx's saveGarment); the others are recorded as the note only.
const VERDICTS = ['Fits great', 'Fits okay', "Doesn't fit"];

export default function AddManualScreen() {
  const insets = useSafeAreaInsets();
  const store = useStore();
  const { ng, ngErrors, garments, units } = store;
  const isEditing = ng.id != null;

  const ref = refFor(ng.category, garments);
  // Size/silhouette hints only — never written into `ng` itself (store.tsx no
  // longer seeds these as real values on a new draft; see DESIGN_GUIDELINES.md's
  // Measurement integrity). A ghost placeholder can't be silently saved, so it's
  // safe to source from the user's own closet here.
  const hint = useMemo(() => seedNewGarment(ng.category, garments), [ng.category, garments]);
  const basis = isEditing
    ? 'Editing this garment updates its record. Fit history is separate and stays intact.'
    : ref
      ? `Most of your ${ng.category} are ${hint.size || ref.size}${hint.fit ? `, ${hint.fit.toLowerCase()}` : ''} — shown as hints below.`
      : 'Nothing to hint from yet — this will be your first in the category.';

  const measures = keysFor(ng.category);
  const allFits = orderFits(ng.category, garments, FITS[ng.category]);
  const visibleFits = allFits.slice(0, 5);
  const extraFits = allFits.slice(5);
  // A selection that lands outside the top 5 (e.g. editing a garment with a less-
  // common fit) forces the extra row open so the active chip is never hidden
  // behind "+ More" — same intent the old fitList-concat special-case had.
  const fitsOpen = store.ngFitsOpen || (!!ng.fit && extraFits.includes(ng.fit));

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING, paddingTop: insets.top + SPACING.xl, paddingBottom: SPACING.xl }}>
      <BackRow onPress={store.back} />
      <Text accessibilityRole="header" style={styles.title}>Garment details</Text>
      <Text style={styles.sub}>{basis}</Text>

      <View style={{ gap: SPACING.md + 2, marginTop: SPACING.xl - 2 }}>
        <Field label="Brand" error={ngErrors?.brand ? 'Required' : undefined}>
          <TextInput
            value={ng.brand}
            onChangeText={(v) => store.setNg('brand', v)}
            placeholder="Uniqlo"
            placeholderTextColor={COLORS.faintest}
            style={[styles.input, ngErrors?.brand && styles.inputError]}
            accessibilityLabel="Brand"
            accessibilityHint={ngErrors?.brand ? 'Required' : undefined}
          />
          {ng.brand.trim() === '' && (
            <Pressable onPress={() => store.setNg('brand', UNKNOWN_BRAND)} hitSlop={8} style={styles.unknownLink} accessibilityRole="button">
              <Text style={styles.unknownLinkText}>Don't know the brand?</Text>
            </Pressable>
          )}
        </Field>
        <Field label="Product name" error={ngErrors?.name ? 'Required' : undefined}>
          <TextInput
            value={ng.name}
            onChangeText={(v) => store.setNg('name', v)}
            placeholder="Linen blend shirt"
            placeholderTextColor={COLORS.faintest}
            style={[styles.input, ngErrors?.name && styles.inputError]}
            accessibilityLabel="Product name"
            accessibilityHint={ngErrors?.name ? 'Required' : undefined}
          />
        </Field>
        <Field label="Category">
          <View style={{ flexDirection: 'row', gap: 7, marginTop: SPACING.sm }}>
            {CATEGORY_LABELS.map(([cat, label]) => (
              <View key={cat} style={{ flex: 1 }}>
                <Chip label={label} active={ng.category === cat} onPress={() => store.setNgCategory(cat as Category)} />
              </View>
            ))}
          </View>
        </Field>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Size" error={ngErrors?.size ? 'Required' : undefined}>
              <TextInput
                value={ng.size}
                onChangeText={(v) => store.setNg('size', v)}
                placeholder={hint.size || 'L'}
                placeholderTextColor={COLORS.faintest}
                style={[styles.input, { fontFamily: FONTS.mono }, ngErrors?.size && styles.inputError]}
                accessibilityLabel="Size"
                accessibilityHint={ngErrors?.size ? 'Required' : undefined}
              />
              {ng.size.trim() === '' && (
                <Pressable onPress={() => store.setNg('size', UNKNOWN_SIZE)} hitSlop={8} style={styles.unknownLink} accessibilityRole="button">
                  <Text style={styles.unknownLinkText}>Don't know?</Text>
                </Pressable>
              )}
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Silhouette">
              <TextInput
                value={ng.silhouette}
                onChangeText={(v) => store.setNg('silhouette', v)}
                placeholder={hint.silhouette || 'Boxy, high rise…'}
                placeholderTextColor={COLORS.faintest}
                style={styles.input}
                accessibilityLabel="Silhouette"
              />
            </Field>
          </View>
        </View>

        <View>
          <View style={styles.measureHeaderRow}>
            <SectionLabel top={0} style={{ flex: 1 }}>Measurements</SectionLabel>
            <UnitToggle units={units} onChange={store.setUnits} />
          </View>
          <MeasurementGrid
            items={measures.map(([key, label]) => ({
              key,
              label,
              value: ng.m[key] ?? '',
              placeholder: ref?.m[key] !== undefined ? formatValue(ref.m[key] as number, units) : '—',
              onChange: (v) => store.setNgMeasure(key, v),
            }))}
          />
          {ngErrors?.measurements && <Text style={styles.errorText} accessibilityLiveRegion="polite">Add at least one measurement to save.</Text>}
        </View>

        <View>
          <SectionLabel top={0}>Fit type</SectionLabel>
          <View style={styles.chipsWrap}>
            {visibleFits.map((f) => (
              <Chip key={f} label={f} active={ng.fit === f} onPress={() => store.setNgFit(f)} />
            ))}
            {!fitsOpen && extraFits.length > 0 && <Chip label="+ More" onPress={store.toggleNgFits} />}
          </View>
          <Collapsible open={fitsOpen}>
            <View style={styles.chipsWrap}>
              {extraFits.map((f) => (
                <Chip key={f} label={f} active={ng.fit === f} onPress={() => store.setNgFit(f)} />
              ))}
            </View>
          </Collapsible>
        </View>

        {!isEditing && (
          <View>
            <SectionLabel top={0}>How does it fit? <Text style={styles.labelMuted}>· optional</Text></SectionLabel>
            <View style={styles.chipsWrap}>
              {VERDICTS.map((v) => (
                <Chip key={v} label={v} active={ng.verdict === v} onPress={() => store.setNg('verdict', ng.verdict === v ? '' : v)} />
              ))}
            </View>
          </View>
        )}

        <View>
          <SectionLabel top={0}>Fabric stretch <Text style={styles.labelMuted}>· widens or narrows a fit-check match</Text></SectionLabel>
          <View style={styles.chipsWrap}>
            {STRETCH_LEVELS.map((s) => (
              <Chip key={s} label={s} active={ng.stretch === s} onPress={() => store.setNgStretch(s)} />
            ))}
          </View>
        </View>

        <View>
          <SectionLabel top={0}>Style tags <Text style={styles.labelMuted}>· kept separate from measurements</Text></SectionLabel>
          <View style={styles.chipsWrap}>
            {STYLE_TAGS.map((t) => (
              <Chip key={t} label={t} active={ng.tags.includes(t)} onPress={() => store.toggleTag(t)} />
            ))}
          </View>
        </View>

        <Field label="Visual preference">
          <TextInput
            value={ng.notes}
            onChangeText={(v) => store.setNg('notes', v)}
            placeholder="e.g. Love the oversized silhouette, boxy through the body…"
            placeholderTextColor={COLORS.faintest}
            multiline
            style={[styles.input, styles.textarea]}
            accessibilityLabel="Visual preference"
          />
        </Field>

        <View>
          <SectionLabel top={0}>Garment photo</SectionLabel>
          <Pressable
            onPress={store.pickNgPhoto}
            accessibilityRole="button"
            accessibilityLabel={ng.photo ? 'Garment photo, tap to change' : 'Attach photo from library'}
          >
            {ng.photo ? (
              <View style={styles.photoPreview}>
                <FadeImage uri={ng.photo} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <View style={styles.photoChangeBadge}>
                  <Text style={styles.photoDropSub}>tap to change</Text>
                </View>
              </View>
            ) : (
              <View style={styles.photoDrop}>
                <Text style={styles.photoDropTitle}>Attach from photo library</Text>
                <Text style={styles.photoDropSub}>stays local · copied into app storage</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View style={{ paddingTop: SPACING.sm }}>
          <PrimaryButton label={isEditing ? 'Save changes' : 'Save to closet'} onPress={store.saveGarment} />
        </View>
      </View>
    </ScrollView>
  );
}

// A very small, one-shot shake on the field itself — the one deliberate
// exception to "no animation for errors" (see MOTION.shake) — fires only on the
// rising edge (field just failed a save attempt it hadn't already failed), never
// on every re-render while the error stays visible, and never on the whole
// screen: the red border + "Required" text already carry the state on their
// own, this just draws the eye to *which* field needs it.
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  const { style, shake } = useShake();
  const hadError = useRef(!!error);
  useEffect(() => {
    if (error && !hadError.current) shake();
    hadError.current = !!error;
  }, [error]);

  return (
    <View>
      <SectionLabel top={0}>{label}</SectionLabel>
      <Animated.View style={[{ marginTop: SPACING.sm }, style]}>{children}</Animated.View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: FONTS.semibold, fontSize: TYPE.focused, letterSpacing: -0.6, marginTop: SPACING.md + 2, color: COLORS.ink },
  sub: { fontSize: 13.5, color: '#6E6A60', marginTop: SPACING.sm, lineHeight: 19, fontFamily: FONTS.regular },
  labelMuted: { color: COLORS.faintest, letterSpacing: 0.4, textTransform: 'none' },
  measureHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: {
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.md,
    padding: 14, fontSize: 15, color: COLORS.ink, fontFamily: FONTS.regular,
  },
  inputError: { borderColor: COLORS.bad },
  errorText: { fontSize: 12, color: COLORS.bad, marginTop: 6, fontFamily: FONTS.regular },
  unknownLink: { minHeight: 44, justifyContent: 'center', marginTop: 2 },
  unknownLinkText: { fontSize: 12.5, color: COLORS.muted, fontFamily: FONTS.regular, textDecorationLine: 'underline' },
  textarea: { minHeight: 78, textAlignVertical: 'top' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: SPACING.sm },
  photoDrop: {
    marginTop: 8, height: 120, borderRadius: RADII.lg, borderWidth: 1, borderColor: 'rgba(22,21,15,0.22)', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0EEE8', gap: 6,
  },
  photoDropTitle: { fontSize: 14, fontFamily: FONTS.medium, color: COLORS.ink },
  photoDropSub: { fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: COLORS.muted },
  photoPreview: { marginTop: 8, height: 160, borderRadius: RADII.lg, overflow: 'hidden', position: 'relative' },
  photoChangeBadge: { position: 'absolute', right: 10, bottom: 10, backgroundColor: 'rgba(252,251,249,0.9)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
});

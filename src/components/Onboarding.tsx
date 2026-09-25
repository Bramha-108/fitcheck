import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADII } from '../theme';
import { useStore } from '../store';
import { Chip, PrimaryButton, UnitToggle, toneColor } from './UI';
import { CATEGORY_LABELS, FEEL, TOLERANCE, keysFor, obTagsFor } from '../data/constants';
import { toneFor } from '../engine/compare';
import { Category, OnboardingStep } from '../types';
import { cmToDisplay, formatDelta, formatMeasurement } from '../utils/units';
import { useShake } from '../utils/motion';

// Same honest-sentinel pattern as AddManualScreen.tsx — a value the user
// deliberately chose via a visible quick action, never a silent fallback.
const UNKNOWN_BRAND = 'Unknown brand';
const UNKNOWN_SIZE = 'Unknown size';

/** Order drives the progress bar's fill fraction — not a navigation stack, since
 * onboarding is forward-only (matching the source design: no back button anywhere
 * in the flow, only "skip"/"explore" exits). */
const OB_ORDER: OnboardingStep[] = ['welcome', 'pick', 'form', 'how', 'why', 'payoff', 'new', 'aha', 'outro'];

const METHODS: { key: string; title: string; sub: string }[] = [
  { key: 'photo', title: 'Add from photo', sub: 'Snap the size label — we read it on device.' },
  { key: 'manual', title: 'Enter measurements', sub: 'Lay the garment flat and type what you can.' },
  { key: 'shot', title: 'Add screenshot', sub: 'A product page you saved works too.' },
];

const MHINT: Partial<Record<string, string>> = {
  chest: 'Lay the garment flat and measure armpit to armpit.',
  shoulder: 'Seam to seam across the back.',
  length: 'From the highest point of the shoulder straight down.',
  sleeve: 'From the shoulder seam to the cuff.',
  waist: 'Across the waistband, flat, then double it.',
  rise: 'From the crotch seam up to the top of the waistband.',
  hip: 'Widest point below the waistband, doubled.',
  thigh: 'Straight across, just under the crotch seam.',
  knee: 'Straight across at the knee.',
  inseam: 'Crotch seam to hem along the inside leg.',
  legOpening: 'Straight across the hem.',
};

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const store = useStore();
  const { obStep } = store;
  if (!obStep) return null;

  const barOn = obStep !== 'welcome' && obStep !== 'outro';
  const pct = Math.round(((OB_ORDER.indexOf(obStep) + 1) / OB_ORDER.length) * 100);
  // Welcome/outro are short, bottom-pinned title screens with nothing to scroll —
  // a plain flex:1 view lays that out reliably. Every other step is a scrollable
  // form/list, so it gets a real ScrollView.
  const isBottomPinned = obStep === 'welcome' || obStep === 'outro';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {barOn && (
        <View
          style={styles.barWrap}
          accessibilityRole="progressbar"
          accessibilityLabel="Onboarding progress"
          accessibilityValue={{ min: 0, max: 100, now: pct }}
        >
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${pct}%` }]} />
          </View>
        </View>
      )}
      {isBottomPinned ? (
        <View style={{ flex: 1, paddingBottom: insets.bottom }}>
          {obStep === 'welcome' && <Welcome />}
          {obStep === 'outro' && <Outro />}
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 34 }} showsVerticalScrollIndicator={false}>
          {obStep === 'pick' && <Pick />}
          {obStep === 'form' && <Form />}
          {obStep === 'how' && <How />}
          {obStep === 'why' && <Why />}
          {obStep === 'payoff' && <Payoff />}
          {obStep === 'new' && <NewCompare />}
          {obStep === 'aha' && <Aha />}
        </ScrollView>
      )}
    </View>
  );
}

function Welcome() {
  const store = useStore();
  return (
    <View style={styles.bottomPad}>
      <Text style={styles.eyebrowMono}>FitCheck</Text>
      <Text style={styles.headline}>Remember what fits you.</Text>
      <Text style={[styles.sub, { maxWidth: 300 }]}>Compare new clothes with the ones you already know fit well.</Text>
      <View style={{ marginTop: 34 }}>
        <PrimaryButton label="Start with a garment →" onPress={store.obStart} />
      </View>
      <Pressable onPress={store.obExplore} style={styles.linkRow} accessibilityRole="button">
        <Text style={styles.linkText}>Explore first</Text>
      </Pressable>
    </View>
  );
}

function Pick() {
  const store = useStore();
  return (
    <View style={styles.pad}>
      <Text style={styles.title28}>Show us something you already know fits.</Text>
      <Text style={styles.sub}>This becomes your first fit reference. One garment is enough to start.</Text>
      <View style={{ gap: 10, marginTop: 26 }}>
        {METHODS.map((m) => (
          <Pressable
            key={m.key}
            onPress={() => store.obPickMethod(m.key)}
            style={({ pressed }) => [styles.methodCard, pressed && { backgroundColor: COLORS.chipBg }]}
            accessibilityRole="button"
            accessibilityLabel={`${m.title}. ${m.sub}`}
          >
            <Text style={styles.methodTitle}>{m.title}</Text>
            <Text style={styles.methodSub}>{m.sub}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={store.obExplore} style={styles.linkRowSmall} accessibilityRole="button">
        <Text style={styles.linkTextSmall}>I'll do this later</Text>
      </Pressable>
    </View>
  );
}

function Form() {
  const store = useStore();
  const { ob, units, obSuggested, obErrors } = store;
  const hasSuggestion = !!obSuggested;
  const obKeys = useMemo(() => keysFor(ob.cat).slice(0, ob.cat === 'pants' ? 5 : 4), [ob.cat]);
  const filled = Object.keys(ob.m).filter((k) => ob.m[k].trim() !== '').length;

  return (
    <View style={styles.pad}>
      <Text style={styles.title26}>{hasSuggestion ? 'Check what we read' : 'Tell us about it'}</Text>
      <Text style={styles.sub}>
        {hasSuggestion ? 'Nothing is filled in — the hints below are just what we read. Confirm what\'s accurate.' : 'Only the measurements you have. One is enough to begin.'}
      </Text>

      <View style={{ flexDirection: 'row', gap: 7, marginTop: 22 }}>
        {CATEGORY_LABELS.map(([cat, label]) => (
          <View key={cat} style={{ flex: 1 }}>
            <Chip label={label} active={ob.cat === cat} onPress={() => store.obSetCat(cat as Category)} />
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <View style={{ flex: 1.6 }}>
          <ObField label="Garment" error={obErrors?.name ? 'Required' : undefined}>
            <TextInput
              value={ob.name}
              onChangeText={(v) => store.obSet('name', v)}
              placeholder={obSuggested?.name ?? 'Linen shirt'}
              placeholderTextColor={COLORS.faintest}
              style={[styles.input, obErrors?.name && styles.inputError]}
              accessibilityLabel="Garment"
              accessibilityHint={obErrors?.name ? 'Required' : undefined}
            />
          </ObField>
        </View>
        <View style={{ flex: 1 }}>
          <ObField label="Size" error={obErrors?.size ? 'Required' : undefined}>
            <TextInput
              value={ob.size}
              onChangeText={(v) => store.obSet('size', v)}
              placeholder={obSuggested?.size ?? 'L'}
              placeholderTextColor={COLORS.faintest}
              style={[styles.input, { fontFamily: FONTS.mono }, obErrors?.size && styles.inputError]}
              accessibilityLabel="Size"
              accessibilityHint={obErrors?.size ? 'Required' : undefined}
            />
            {ob.size.trim() === '' && (
              <Pressable onPress={() => store.obSet('size', UNKNOWN_SIZE)} hitSlop={8} style={styles.unknownLink} accessibilityRole="button">
                <Text style={styles.unknownLinkText}>Don't know?</Text>
              </Pressable>
            )}
          </ObField>
        </View>
      </View>
      <View style={{ marginTop: 14 }}>
        <ObField label="Brand" error={obErrors?.brand ? 'Required' : undefined}>
          <TextInput
            value={ob.brand}
            onChangeText={(v) => store.obSet('brand', v)}
            placeholder={obSuggested?.brand ?? 'Uniqlo'}
            placeholderTextColor={COLORS.faintest}
            style={[styles.input, obErrors?.brand && styles.inputError]}
            accessibilityLabel="Brand"
            accessibilityHint={obErrors?.brand ? 'Required' : undefined}
          />
          {ob.brand.trim() === '' && (
            <Pressable onPress={() => store.obSet('brand', UNKNOWN_BRAND)} hitSlop={8} style={styles.unknownLink} accessibilityRole="button">
              <Text style={styles.unknownLinkText}>Don't know the brand?</Text>
            </Pressable>
          )}
        </ObField>
      </View>

      <View style={{ marginTop: 22 }}>
        <View style={styles.measureHeaderRow}>
          <Text style={[styles.fieldLabel, { flex: 1 }]} numberOfLines={1}>Measurements</Text>
          <UnitToggle units={units} onChange={store.setUnits} />
        </View>
        <Text style={[styles.fieldLabel, styles.fieldLabelOptional, { marginTop: 3 }]}>fill what you can</Text>
      </View>
      <View style={{ gap: 8, marginTop: 9 }}>
        {obKeys.map(([key, label]) => {
          const focused = store.obFocus === key;
          return (
            <View key={key} style={[styles.measureRow, focused && { borderColor: 'rgba(22,21,15,0.35)' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.measureRowLabel}>{label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
                  <TextInput
                    value={ob.m[key] ?? ''}
                    onChangeText={(v) => store.obSetM(key, v)}
                    onFocus={() => store.obFocusM(key)}
                    onBlur={store.obBlurM}
                    placeholder={obSuggested?.m?.[key] ?? '—'}
                    placeholderTextColor={COLORS.faintest}
                    keyboardType="numeric"
                    style={styles.measureRowInput}
                    accessibilityLabel={label}
                  />
                  <Text style={styles.measureRowUnit}>{units}</Text>
                </View>
              </View>
              {focused && MHINT[key] && <Text style={styles.measureHint}>{MHINT[key]}</Text>}
            </View>
          );
        })}
      </View>

      <View style={{ marginTop: 22 }}>
        <PrimaryButton label="Continue →" onPress={store.obSaveGarment} />
        <Text style={styles.footNote}>
          {obErrors
            ? 'Add the missing details above before continuing.'
            : filled > 0
              ? 'You can add the rest whenever you like.'
              : 'Add at least one measurement to continue.'}
        </Text>
      </View>
    </View>
  );
}

// Same one-shot shake exception as AddManualScreen.tsx's Field — fires only on
// the rising edge of a failed save attempt, never on every re-render.
function ObField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  const { style, shake } = useShake();
  const hadError = useRef(!!error);
  useEffect(() => {
    if (error && !hadError.current) shake();
    hadError.current = !!error;
  }, [error]);

  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Animated.View style={style}>{children}</Animated.View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

function How() {
  const store = useStore();
  const { ob } = store;
  const label = (ob.name.trim() || 'Your garment') + (ob.size.trim() ? ` — ${ob.size.trim()}` : '');
  return (
    <View style={styles.pad}>
      <Text style={styles.eyebrowMono}>{label}</Text>
      <Text style={[styles.title30, { marginTop: 12 }]}>How does this fit you?</Text>
      <View style={{ gap: 10, marginTop: 26 }}>
        <Pressable
          onPress={() => store.obSetVerdict('Fits great')}
          style={({ pressed }) => [styles.verdictCardDark, pressed && { backgroundColor: COLORS.inkActive }]}
          accessibilityRole="button"
          accessibilityLabel="Fits great. Becomes a strong reference for comparisons."
        >
          <Text style={styles.verdictTitleDark}>Fits great</Text>
          <Text style={styles.verdictSubDark}>Becomes a strong reference for comparisons.</Text>
        </Pressable>
        <Pressable
          onPress={() => store.obSetVerdict('Fits okay')}
          style={({ pressed }) => [styles.verdictCard, pressed && { backgroundColor: COLORS.chipBg }]}
          accessibilityRole="button"
          accessibilityLabel="Fits okay. Stored, but weighted lower."
        >
          <Text style={styles.verdictTitle}>Fits okay</Text>
          <Text style={styles.verdictSub}>Stored, but weighted lower.</Text>
        </Pressable>
        <Pressable
          onPress={() => store.obSetVerdict("Doesn't fit")}
          style={({ pressed }) => [styles.verdictCard, pressed && { backgroundColor: COLORS.chipBg }]}
          accessibilityRole="button"
          accessibilityLabel="Doesn't fit. Useful too — it marks a boundary."
        >
          <Text style={styles.verdictTitle}>Doesn't fit</Text>
          <Text style={styles.verdictSub}>Useful too — it marks a boundary.</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Why() {
  const store = useStore();
  const { ob } = store;
  const title = ob.verdict === 'Fits great' ? 'What makes the fit work?' : 'What stands out about the fit?';
  return (
    <View style={styles.pad}>
      <Text style={styles.title28}>{title}</Text>
      <Text style={styles.sub}>Pick anything that applies. Skip if nothing does.</Text>
      <View style={styles.tagsWrap}>
        {obTagsFor(ob.cat).map((t) => (
          <Chip key={t} label={t} active={ob.tags.includes(t)} onPress={() => store.obToggleTag(t)} />
        ))}
      </View>
      <Text style={[styles.fieldLabel, { marginTop: 26 }]}>Anything worth remembering?</Text>
      <TextInput
        value={ob.note}
        onChangeText={(v) => store.obSet('note', v)}
        placeholder="Sleeves sit right at the elbow."
        placeholderTextColor={COLORS.faintest}
        multiline
        style={[styles.input, styles.textarea]}
        accessibilityLabel="Anything worth remembering?"
      />
      <View style={{ marginTop: 20 }}>
        <PrimaryButton label="Save this fit →" onPress={store.obSaveFit} />
      </View>
      <Pressable onPress={store.obSaveFit} style={styles.linkRow} accessibilityRole="button">
        <Text style={styles.linkText}>Skip</Text>
      </Pressable>
    </View>
  );
}

function Payoff() {
  const store = useStore();
  const { garments, units } = store;
  const g = garments[0];

  return (
    <View style={styles.pad}>
      <Text style={styles.title28}>Got it. FitCheck remembers this one.</Text>
      {g && (
        <View style={styles.previewCard}>
          <View style={{ padding: 16 }}>
            <Text style={styles.eyebrowMono}>{g.brand}</Text>
            <Text style={styles.previewTitle}>
              {g.name}
              {g.size !== '—' ? ` — ${g.size}` : ''}
            </Text>
            <View style={{ marginTop: 14 }}>
              {keysFor(g.cat)
                .filter(([k]) => g.m[k] !== undefined)
                .map(([k, label], i, arr) => (
                  <View key={k} style={[styles.previewMeasureRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                    <Text style={styles.previewMeasureLabel}>{label}</Text>
                    <Text style={styles.previewMeasureVal}>{formatMeasurement(g.m[k] as number, units)}</Text>
                  </View>
                ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 15 }}>
              <View
                style={[styles.smallDot, { backgroundColor: toneColor(g.history[g.history.length - 1]?.tone ?? 'good') }]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              <Text style={styles.previewVerdict}>Known fit: {g.history[g.history.length - 1]?.note ?? 'Added to closet'}</Text>
            </View>
            {g.tags.length > 0 && (
              <View style={styles.tagsWrapTight}>
                {g.tags.map((t) => (
                  <View key={t} style={styles.previewTagChip}>
                    <Text style={styles.previewTagText}>{t}</Text>
                  </View>
                ))}
              </View>
            )}
            {g.visual !== 'No visual note yet.' && <Text style={styles.previewNote}>“{g.visual}”</Text>}
          </View>
        </View>
      )}
      <Text style={styles.title19}>Now let's compare something.</Text>
      <View style={{ marginTop: 14 }}>
        <PrimaryButton label="Compare another garment →" onPress={store.obToCompare} />
      </View>
      <Pressable onPress={store.obFinish} style={styles.linkRow} accessibilityRole="button">
        <Text style={styles.linkText}>Later — go to my closet</Text>
      </Pressable>
    </View>
  );
}

function NewCompare() {
  const store = useStore();
  const { garments, ob2, units } = store;
  const ref = garments[0];
  const refName = ref ? `${ref.brand} ${ref.name}` : 'reference';
  const hasPair = ref ? Object.keys(ref.m).some((k) => (ob2[k] ?? '').trim() !== '') : false;

  return (
    <View style={styles.pad}>
      <Text style={styles.title28}>Thinking about something new?</Text>
      <Text style={styles.sub}>Type the measurements from the product page. We'll hold them up against your {refName}.</Text>
      <View style={[styles.measureHeaderRow, { marginTop: 24 }]}>
        <Text style={[styles.fieldLabel, { flex: 1 }]} numberOfLines={1}>Measurements</Text>
        <UnitToggle units={units} onChange={store.setUnits} />
      </View>
      <View style={{ gap: 8, marginTop: 9 }}>
        {ref &&
          Object.keys(ref.m).map((k) => {
            const label = keysFor(ref.cat).find(([kk]) => kk === k)?.[1] ?? k;
            const ph = String(Math.round(cmToDisplay(ref.m[k as keyof typeof ref.m] as number, units) * 10) / 10);
            return (
              <View key={k} style={styles.newMeasureRow}>
                <Text style={styles.measureRowLabel}>{label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
                  <TextInput
                    value={ob2[k] ?? ''}
                    onChangeText={(v) => store.obSet2M(k, v)}
                    placeholder={ph}
                    placeholderTextColor={COLORS.faintest}
                    keyboardType="numeric"
                    style={styles.measureRowInput}
                    accessibilityLabel={label}
                  />
                  <Text style={styles.measureRowUnit}>{units}</Text>
                </View>
              </View>
            );
          })}
      </View>
      <View style={{ marginTop: 22 }}>
        <PrimaryButton label="Compare →" onPress={store.obCompare} disabled={!hasPair} />
      </View>
      <Pressable onPress={store.obFinish} style={styles.linkRow} accessibilityRole="button">
        <Text style={styles.linkText}>Skip</Text>
      </Pressable>
    </View>
  );
}

function Aha() {
  const store = useStore();
  const { garments, ob2, units } = store;
  const ref = garments[0];

  const diffs = useMemo(() => {
    if (!ref) return [];
    const labels: Record<string, string> = {};
    keysFor(ref.cat).forEach(([k, label]) => { labels[k] = label; });
    return Object.keys(ref.m)
      .filter((k) => (ob2[k] ?? '').trim() !== '')
      .map((k) => {
        const refVal = ref.m[k as keyof typeof ref.m] as number;
        const v = Number(ob2[k]) - refVal;
        const tol = TOLERANCE[k as keyof typeof TOLERANCE] ?? 3;
        const tone = toneFor(Math.abs(v), tol);
        const mag = Math.min(1, Math.abs(v) / (tol * 2));
        return {
          key: k,
          label: labels[k] ?? k,
          text: formatDelta(v, units),
          tone,
          barLeft: v >= 0 ? 50 : 50 - mag * 50,
          barW: mag * 50,
          v,
        };
      });
  }, [ref, ob2, units]);

  const expected = useMemo(() => {
    const phrases = diffs
      .map((d) => {
        const pair = FEEL[d.key as keyof typeof FEEL];
        if (d.v === 0 || !pair) return null;
        return pair[d.v > 0 ? 0 : 1].toLowerCase();
      })
      .filter((x): x is string => !!x);
    if (!phrases.length) return 'Effectively the same garment on the measurements you entered.';
    const text = phrases.length > 1 ? `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}.` : `${phrases[0]}.`;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }, [diffs]);

  const { conf, confBars } = useMemo(() => {
    if (!ref) return { conf: 'Low' as const, confBars: [1, 0, 0] };
    const pool = garments.filter((g) => g.cat === ref.cat);
    const refs = pool.filter((g) => g.ref).length;
    const conf = refs >= 3 && pool.length >= 4 ? 'High' : pool.length >= 1 ? 'Medium' : 'Low';
    const confBars = conf === 'High' ? [1, 1, 1] : conf === 'Medium' ? [1, 1, 0] : [1, 0, 0];
    return { conf, confBars };
  }, [ref, garments]);

  if (!ref) return null;

  return (
    <View style={styles.pad}>
      <Text style={styles.eyebrowMono}>Closest to your</Text>
      <Text style={[styles.title26, { marginTop: 8 }]}>{ref.brand} {ref.name}</Text>
      <View style={{ gap: 9, marginTop: 22 }}>
        {diffs.map((d) => (
          <View key={d.key} style={styles.diffCard}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text style={styles.diffLabel}>{d.label}</Text>
              <Text style={[styles.diffText, { color: toneColor(d.tone) }]}>{d.text}</Text>
            </View>
            <View style={styles.diffBarTrack}>
              <View style={styles.diffBarTick} />
              <View style={[styles.diffBarFill, { left: `${d.barLeft}%`, width: `${d.barW}%`, backgroundColor: toneColor(d.tone) }]} />
            </View>
          </View>
        ))}
      </View>
      <Text style={[styles.fieldLabel, { marginTop: 26 }]}>Expected</Text>
      <Text style={styles.expectedText}>{expected}</Text>
      <View style={styles.confRow}>
        <View>
          <Text style={styles.confTitle}>Confidence: {conf}</Text>
          <Text style={styles.confNote}>Based on {garments.length} saved garment{garments.length === 1 ? '' : 's'} in your closet</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {confBars.map((on, i) => (
            <View key={i} style={[styles.confBar, { backgroundColor: on ? COLORS.ink : 'rgba(22,21,15,0.13)' }]} />
          ))}
        </View>
      </View>
      <View style={{ marginTop: 22 }}>
        <PrimaryButton label="Makes sense →" onPress={store.obToOutro} />
      </View>
    </View>
  );
}


function Outro() {
  const store = useStore();
  return (
    <View style={styles.bottomPad}>
      <Text style={styles.title36}>That's FitCheck.</Text>
      <Text style={[styles.sub, { maxWidth: 310 }]}>The more clothes you remember, the more useful your fit references become.</Text>
      <View style={{ marginTop: 30 }}>
        <PrimaryButton label="Go to my closet →" onPress={store.obFinish} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 100, backgroundColor: COLORS.bg,
  },
  barWrap: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4 },
  barTrack: { height: 3, borderRadius: 99, backgroundColor: '#E4E1DA' },
  barFill: { height: 3, borderRadius: 99, backgroundColor: COLORS.ink },
  pad: { paddingHorizontal: 24, paddingTop: 34, paddingBottom: 10 },
  bottomPad: { flex: 1, paddingHorizontal: 24, paddingBottom: 10, justifyContent: 'flex-end' },
  eyebrowMono: { fontFamily: FONTS.mono, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: COLORS.muted },
  headline: { fontFamily: FONTS.semibold, fontSize: 40, letterSpacing: -1.2, lineHeight: 42, marginTop: 14, color: COLORS.ink },
  title36: { fontFamily: FONTS.semibold, fontSize: 36, letterSpacing: -1.2, lineHeight: 38, color: COLORS.ink },
  title30: { fontFamily: FONTS.semibold, fontSize: 30, letterSpacing: -0.9, lineHeight: 34, color: COLORS.ink },
  title28: { fontFamily: FONTS.semibold, fontSize: 28, letterSpacing: -0.8, lineHeight: 32, color: COLORS.ink },
  title26: { fontFamily: FONTS.semibold, fontSize: 26, letterSpacing: -0.8, lineHeight: 30, color: COLORS.ink },
  title19: { fontFamily: FONTS.semibold, fontSize: 19, letterSpacing: -0.5, marginTop: 26, color: COLORS.ink },
  sub: { fontSize: 15, lineHeight: 21, color: COLORS.mutedDark, marginTop: 12, fontFamily: FONTS.regular },
  linkRow: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  linkText: { fontSize: 14.5, color: COLORS.muted, fontFamily: FONTS.regular },
  linkRowSmall: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  linkTextSmall: { fontSize: 14, color: COLORS.faintest, fontFamily: FONTS.regular },
  methodCard: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.xl, padding: 18 },
  methodTitle: { fontSize: 16.5, fontFamily: FONTS.semibold, color: COLORS.ink },
  methodSub: { fontSize: 13.5, color: COLORS.mutedDark, marginTop: 6, lineHeight: 18.5, fontFamily: FONTS.regular },
  fieldLabel: { fontFamily: FONTS.semibold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: COLORS.muted },
  fieldLabelOptional: { color: COLORS.faintest, letterSpacing: 0.4, textTransform: 'none' },
  measureHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: {
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.md,
    padding: 14, marginTop: 8, fontSize: 15, color: COLORS.ink, fontFamily: FONTS.regular,
  },
  inputError: { borderColor: COLORS.bad },
  errorText: { fontSize: 12, color: COLORS.bad, marginTop: 6, fontFamily: FONTS.regular },
  unknownLink: { minHeight: 44, justifyContent: 'center', marginTop: 2 },
  unknownLinkText: { fontSize: 12.5, color: COLORS.muted, fontFamily: FONTS.regular, textDecorationLine: 'underline' },
  textarea: { minHeight: 78, textAlignVertical: 'top' },
  measureRow: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.md, padding: 13 },
  measureRowLabel: { fontSize: 14.5, color: COLORS.ink, fontFamily: FONTS.regular },
  measureRowInput: { width: 52, borderWidth: 0, backgroundColor: 'transparent', textAlign: 'right', fontFamily: FONTS.mono, fontSize: 16, color: COLORS.ink, padding: 0 },
  measureRowUnit: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.faintest },
  measureHint: { fontSize: 12.5, color: COLORS.muted, marginTop: 8, lineHeight: 18, fontFamily: FONTS.regular },
  footNote: { fontSize: 12, color: COLORS.muted, marginTop: 10, textAlign: 'center', lineHeight: 17, fontFamily: FONTS.regular },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 22 },
  tagsWrapTight: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  verdictCardDark: { backgroundColor: COLORS.ink, borderRadius: RADII.xl, padding: 22 },
  verdictTitleDark: { fontSize: 19, fontFamily: FONTS.semibold, letterSpacing: -0.4, color: COLORS.cream },
  verdictSubDark: { fontSize: 13.5, color: 'rgba(246,245,242,0.66)', marginTop: 5, lineHeight: 18.5, fontFamily: FONTS.regular },
  verdictCard: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: 'rgba(22,21,15,0.12)', borderRadius: RADII.xl, padding: 20 },
  verdictTitle: { fontSize: 17.5, fontFamily: FONTS.semibold, letterSpacing: -0.4, color: COLORS.ink },
  verdictSub: { fontSize: 13.5, color: COLORS.mutedDark, marginTop: 5, lineHeight: 18.5, fontFamily: FONTS.regular },
  previewCard: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: 'rgba(22,21,15,0.09)', borderRadius: RADII.xl, overflow: 'hidden', marginTop: 22 },
  previewTitle: { fontSize: 19, fontFamily: FONTS.semibold, letterSpacing: -0.4, marginTop: 4, color: COLORS.ink },
  previewMeasureRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.borderFaint },
  previewMeasureLabel: { fontSize: 14, color: '#4A473F', fontFamily: FONTS.regular },
  previewMeasureVal: { fontFamily: FONTS.mono, fontSize: 14, color: COLORS.ink },
  smallDot: { width: 8, height: 8, borderRadius: 99 },
  previewVerdict: { fontSize: 14.5, fontFamily: FONTS.semibold, color: COLORS.ink },
  previewTagChip: { backgroundColor: COLORS.chipBg, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6 },
  previewTagText: { fontSize: 12.5, color: '#4A473F', fontFamily: FONTS.regular },
  previewNote: { fontSize: 13.5, color: COLORS.mutedDark, marginTop: 12, lineHeight: 19, fontFamily: FONTS.regular },
  newMeasureRow: {
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.md, padding: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  diffCard: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: 'rgba(22,21,15,0.08)', borderRadius: RADII.lg, padding: 15, paddingHorizontal: 16 },
  diffLabel: { fontSize: 15, fontFamily: FONTS.medium, color: COLORS.ink },
  diffText: { fontFamily: FONTS.mono, fontSize: 19, fontWeight: '500' },
  diffBarTrack: { position: 'relative', height: 5, borderRadius: 99, backgroundColor: COLORS.chipBg, marginTop: 11 },
  diffBarTick: { position: 'absolute', left: '50%', top: -3, width: 1, height: 11, backgroundColor: 'rgba(22,21,15,0.22)' },
  diffBarFill: { position: 'absolute', top: 0, height: 5, borderRadius: 99 },
  expectedText: { fontSize: 17, lineHeight: 24, marginTop: 10, color: COLORS.ink, fontFamily: FONTS.regular },
  confRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: 'rgba(22,21,15,0.08)', borderRadius: RADII.lg, padding: 15, paddingHorizontal: 16, marginTop: 22,
  },
  confTitle: { fontSize: 14.5, fontFamily: FONTS.semibold, color: COLORS.ink },
  confNote: { fontSize: 12.5, color: COLORS.muted, marginTop: 3, fontFamily: FONTS.regular },
  confBar: { width: 7, height: 22, borderRadius: 3 },
});

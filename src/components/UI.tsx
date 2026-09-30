import React from 'react';
import { Animated, Easing, Image, ImageStyle, Pressable, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, RADII, SPACING, TYPE } from '../theme';
import { Units } from '../types';
import { MOTION, useReducedMotion } from '../utils/motion';

export function Eyebrow({ children, style, color }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; color?: string }) {
  return (
    <Text style={[styles.eyebrow, { color: color ?? COLORS.muted }, style as any]}>{children}</Text>
  );
}

/**
 * The one "SECTION LABEL" style used above every group across the app (Detail's
 * Measurements/How it fits/Fit history, Profile's What we've learned/Comfortable
 * ranges, Result's Closest match/Expected feel, FitCheck/Add's field labels) — a
 * single component so the caps size, tracking, weight, and color can't quietly
 * drift screen to screen (DESIGN_GUIDELINES.md's "Typography stays simple").
 * `top` sets the space above it (default = a new-section gap); pass 0 when it's
 * the first thing in its container.
 */
export function SectionLabel({ children, style, top = SPACING.section }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; top?: number }) {
  return <Text accessibilityRole="header" style={[styles.sectionLabel, { marginTop: top }, style as any]}>{children}</Text>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// Always rendered next to text that states the same verdict in words (Home's
// reference rows, Detail's "How it fits" rows) — hidden from the accessibility
// tree so a screen reader doesn't announce a redundant, colorless "image" stop
// for a control whose entire meaning is a color no assistive tech can read.
export function ToneDot({ tone }: { tone: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? COLORS.good : tone === 'warn' ? COLORS.warn : COLORS.bad;
  return <View style={[styles.dot, { backgroundColor: color }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}

export function toneColor(tone: 'good' | 'warn' | 'bad') {
  return tone === 'good' ? COLORS.good : tone === 'warn' ? COLORS.warn : COLORS.bad;
}

const PRESS_SCALE_DOWN = 0.97;
const PRESS_OPACITY_DOWN = 0.92;

/**
 * Universal press feedback — a subtle scale-down + opacity dip on press, released
 * on lift. One Animated.Value drives both (opacity interpolated off the same scale
 * value) so there's one timing pair per control, not two. Purely additive: callers
 * keep their own pressed-state styling (color swaps, disabled opacity) and merge
 * this style in alongside it. useNativeDriver: true throughout — scale and opacity
 * are both safe to drive natively, so this stays a separate Animated.Value from any
 * color-crossfade a control already has (which can't use the native driver).
 */
export function usePressScale() {
  const reducedMotion = useReducedMotion();
  const scale = React.useRef(new Animated.Value(1)).current;

  const animateTo = React.useCallback((toValue: number) => {
    if (reducedMotion) {
      scale.setValue(toValue);
      return;
    }
    Animated.timing(scale, {
      toValue,
      duration: MOTION.press,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reducedMotion]);

  const onPressIn = React.useCallback(() => animateTo(PRESS_SCALE_DOWN), [animateTo]);
  const onPressOut = React.useCallback(() => animateTo(1), [animateTo]);

  const style = {
    opacity: scale.interpolate({ inputRange: [PRESS_SCALE_DOWN, 1], outputRange: [PRESS_OPACITY_DOWN, 1] }),
    transform: [{ scale }],
  };

  return { style, onPressIn, onPressOut };
}

// Every Chip (category pickers, fit-type/tag lists) crossfades between its
// selected/unselected colors on the same MOTION.selection timing as UnitToggle,
// so a selection changing anywhere in the app reads as one consistent language.
export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const reducedMotion = useReducedMotion();
  const progress = React.useRef(new Animated.Value(active ? 1 : 0)).current;
  const pressScale = usePressScale();

  React.useEffect(() => {
    const toValue = active ? 1 : 0;
    if (reducedMotion) {
      progress.setValue(toValue);
      return;
    }
    Animated.timing(progress, {
      toValue,
      duration: MOTION.selection,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [active, reducedMotion]);

  const backgroundColor = progress.interpolate({ inputRange: [0, 1], outputRange: [COLORS.card, COLORS.ink] });
  const borderColor = progress.interpolate({ inputRange: [0, 1], outputRange: [COLORS.border, COLORS.ink] });
  const color = progress.interpolate({ inputRange: [0, 1], outputRange: [COLORS.chipText, COLORS.cream] });

  // Two nested Animated.Views, not one with a combined style array: the native-
  // driven press scale/opacity (pressScale.style, useNativeDriver: true) and the
  // JS-driven color crossfade (backgroundColor/borderColor, useNativeDriver: false)
  // must live on separate native view tags. Merging both onto a single Animated.View
  // crashes on Android/Fabric the moment the color animation restarts on a node the
  // native driver has already claimed ("Attempting to run JS driven animation on
  // animated node that has been moved to 'native'") — this is what made every Chip
  // press fatal in release builds even though it never reproduced on web.
  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      <Animated.View style={pressScale.style}>
        <Animated.View style={[styles.chip, { backgroundColor, borderColor }]}>
          <Animated.Text style={[styles.chipText, { color }]}>{label}</Animated.Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

// Fixed footprint so a header row can reserve this exact width for the toggle
// and let neighboring text wrap/truncate around it instead of overlapping it.
const UNIT_TOGGLE_WIDTH = 104;
const UNIT_TOGGLE_SEGMENT_WIDTH = UNIT_TOGGLE_WIDTH / 2;

/**
 * The one cm/in control every measurement-entry screen uses (FitCheck, Add/Edit
 * Garment, Onboarding, Profile's body measurements) — same component everywhere so
 * there's a single visual language and a single place that decides what "selected"
 * looks like, instead of each screen growing its own toggle (see
 * DESIGN_GUIDELINES.md's Measurement integrity section). A single segmented
 * container (not two independent pills) makes the mutual-exclusivity of the
 * choice obvious at a glance, with a fill that slides to the selected side.
 */
export function UnitToggle({ units, onChange }: { units: Units; onChange: (u: Units) => void }) {
  const reducedMotion = useReducedMotion();
  const progress = React.useRef(new Animated.Value(units === 'in' ? 1 : 0)).current;

  React.useEffect(() => {
    const toValue = units === 'in' ? 1 : 0;
    if (reducedMotion) {
      progress.setValue(toValue);
      return;
    }
    Animated.timing(progress, {
      toValue,
      duration: MOTION.selection,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [units, reducedMotion]);

  return (
    <View style={styles.unitToggle} accessibilityRole="radiogroup" accessibilityLabel="Measurement units">
      <Animated.View
        style={[
          styles.unitToggleThumb,
          { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, UNIT_TOGGLE_SEGMENT_WIDTH] }) }] },
        ]}
      />
      <Pressable
        style={styles.unitToggleSegment}
        onPress={() => onChange('cm')}
        hitSlop={4}
        accessibilityRole="radio"
        accessibilityLabel="Centimeters"
        accessibilityState={{ checked: units === 'cm' }}
      >
        <Text style={[styles.unitToggleText, units === 'cm' && styles.unitToggleTextActive]}>cm</Text>
      </Pressable>
      <Pressable
        style={styles.unitToggleSegment}
        onPress={() => onChange('in')}
        hitSlop={4}
        accessibilityRole="radio"
        accessibilityLabel="Inches"
        accessibilityState={{ checked: units === 'in' }}
      >
        <Text style={[styles.unitToggleText, units === 'in' && styles.unitToggleTextActive]}>in</Text>
      </Pressable>
    </View>
  );
}

/**
 * The title+subtitle block every top-level screen (Closet, FitCheck, Profile)
 * opens with — one shared shape so the relationship between title and subtitle
 * (size, weight, gap) can't drift screen to screen. Home keeps its own
 * eyebrow+greeting header since it's answering a different question ("what day
 * is it") rather than naming the screen, so it isn't forced through this.
 */
export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={right ? styles.headerRow : undefined}>
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" style={styles.screenTitle}>{title}</Text>
        {subtitle ? <Text style={styles.screenSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/**
 * The two-column measurement-entry grid duplicated across FitCheck, Add/Edit
 * Garment, and Profile's body measurements before this existed — one shared
 * shape for cell height/radius/border/type so they can't drift apart, and one
 * place that enforces Measurement integrity: an empty value renders as an
 * empty field, a ghost placeholder is the only thing that can ever look
 * pre-filled (DESIGN_GUIDELINES.md's Measurement integrity section).
 */
export function MeasurementGrid({
  items,
}: {
  items: { key: string; label: string; value: string; placeholder?: string; onChange: (v: string) => void }[];
}) {
  // The keyboard's submit key walks the grid in order (Waist → Hip → Inseam…),
  // keeping the keyboard up, and only the last cell's submit dismisses it — so
  // entering a full set of measurements never means closing and reopening the
  // keyboard between every field.
  const inputs = React.useRef<(TextInput | null)[]>([]);
  return (
    <View style={styles.measureGrid}>
      {items.map((it, i) => {
        const isLast = i === items.length - 1;
        return (
          <MeasureCell
            key={it.key}
            inputRef={(el) => { inputs.current[i] = el; }}
            label={it.label}
            value={it.value}
            placeholder={it.placeholder}
            onChange={it.onChange}
            isLast={isLast}
            onSubmit={isLast ? undefined : () => inputs.current[i + 1]?.focus()}
          />
        );
      })}
    </View>
  );
}

/**
 * A single measurement cell's border quietly crossfades to the ink color on
 * focus and back on blur — nothing elaborate (no scale/glow), just enough to
 * show which field is live, same MOTION.selection timing as every other
 * selection-style state change in the app (UnitToggle, Chip).
 */
function MeasureCell({
  inputRef,
  label,
  value,
  placeholder,
  onChange,
  isLast,
  onSubmit,
}: {
  inputRef: (el: TextInput | null) => void;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  isLast: boolean;
  onSubmit?: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const focusProgress = React.useRef(new Animated.Value(0)).current;

  const animateTo = React.useCallback((toValue: number) => {
    if (reducedMotion) {
      focusProgress.setValue(toValue);
      return;
    }
    Animated.timing(focusProgress, {
      toValue,
      duration: MOTION.selection,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [reducedMotion]);

  const borderColor = focusProgress.interpolate({ inputRange: [0, 1], outputRange: [COLORS.border, COLORS.ink] });

  return (
    <Animated.View style={[styles.measureCell, { borderColor }]}>
      <Text style={styles.measureCellLabel}>{label}</Text>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        returnKeyType={isLast ? 'done' : 'next'}
        submitBehavior={isLast ? 'blurAndSubmit' : 'submit'}
        onSubmitEditing={onSubmit}
        onFocus={() => animateTo(1)}
        onBlur={() => animateTo(0)}
        placeholder={placeholder ?? '—'}
        placeholderTextColor={COLORS.faintest}
        keyboardType="numeric"
        style={styles.measureCellInput}
        accessibilityLabel={label}
        accessibilityHint={placeholder ? `Typical value ${placeholder}` : undefined}
      />
    </Animated.View>
  );
}

/**
 * The real-empty-state shape (title, body, primary action, optional secondary)
 * shared by Closet's empty-closet/no-results states and Result's
 * NoComparisonYet — a real state with its own copy, never a placeholder
 * (DESIGN_GUIDELINES.md screen checklist #21).
 */
export function EmptyState({
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  style,
}: {
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.empty, style]}>
      <Text accessibilityRole="header" style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      <View style={styles.emptyActions}>
        <PrimaryButton label={primaryLabel} onPress={onPrimary} />
        {secondaryLabel && onSecondary ? <SecondaryButton label={secondaryLabel} onPress={onSecondary} /> : null}
      </View>
    </View>
  );
}

/**
 * A real garment photo fades in on decode rather than popping in fully-formed —
 * "Photos need contrast insurance"'s calmer sibling: a slow load shouldn't be a
 * visible flash. Reset to invisible whenever the source changes (a different
 * garment's photo, or a freshly-picked one) so a stale opacity=1 never carries
 * over onto the next image while it's still decoding.
 */
export function FadeImage({ uri, style, resizeMode, instant, accessibilityLabel }: { uri: string; style: StyleProp<ImageStyle>; resizeMode: 'cover'; instant?: boolean; accessibilityLabel?: string }) {
  const reducedMotion = useReducedMotion();
  const opacity = React.useRef(new Animated.Value(instant ? 1 : 0)).current;
  const mounted = React.useRef(false);

  // Only a genuine later change of `uri` resets to invisible — the first mount
  // already starts at the right opacity (0, or 1 for `instant`). A layout effect,
  // not a passive one: setValue(0) also cancels any running fade, and a passive
  // effect can run *after* a fast local file's onLoad has already started the
  // fade-in (a freshly-picked photo, just copied into app storage, is exactly
  // that) — which pinned the image at opacity 0 until the screen remounted. A
  // layout effect runs in the same commit that hands the Image its new source,
  // so the reset always lands before that source's onLoad can.
  React.useLayoutEffect(() => {
    if (mounted.current) opacity.setValue(0);
    mounted.current = true;
  }, [uri]);

  const onLoad = React.useCallback(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, {
      toValue: 1,
      duration: MOTION.imageFade,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [reducedMotion]);

  return (
    <Animated.Image
      source={{ uri }}
      onLoad={onLoad}
      style={[style, { opacity }]}
      resizeMode={resizeMode}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no'}
    />
  );
}

export function PhotoTile({
  bg,
  caption,
  height,
  uri,
  children,
  bordered = true,
  instant,
  accessibilityLabel,
}: {
  bg: [string, string];
  caption?: string;
  height: number;
  uri?: string | null;
  children?: React.ReactNode;
  bordered?: boolean;
  /** Skip the fade-in — used by Detail's hero photo when a shared-element
   * transition overlay is already animating this exact image into place. */
  instant?: boolean;
  /** What this photo shows (e.g. "Uniqlo Oxford Shirt") — announced by a screen
   * reader. Left unset, the photo is skipped entirely rather than announced as a
   * bare, uninformative "image" (e.g. a purely decorative preview tile). */
  accessibilityLabel?: string;
}) {
  return (
    <View style={[styles.photoTile, !bordered && styles.photoTileBorderless, { height }]}>
      {uri ? (
        <FadeImage uri={uri} style={StyleSheet.absoluteFill} resizeMode="cover" instant={instant} accessibilityLabel={accessibilityLabel} />
      ) : (
        <>
          <LinearGradient colors={bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {caption ? <Text style={styles.photoCaption}>{caption}</Text> : null}
        </>
      )}
      {children}
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress?: () => void; disabled?: boolean }) {
  const pressScale = usePressScale();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
    >
      {({ pressed }) => (
        <Animated.View style={[styles.primaryBtn, pressed && { backgroundColor: COLORS.inkActive }, pressScale.style, disabled && { opacity: 0.6 }]}>
          <Text style={styles.primaryBtnText}>{label}</Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled }: { label: string; onPress?: () => void; disabled?: boolean }) {
  const pressScale = usePressScale();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
    >
      {({ pressed }) => (
        <Animated.View style={[styles.secondaryBtn, pressed && { backgroundColor: '#EFEDE7' }, pressScale.style, disabled && { opacity: 0.6 }]}>
          <Text style={styles.secondaryBtnText}>{label}</Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

/**
 * Shared progressive-disclosure container — Detail's fit-history "Show all N",
 * the fit-type "+ More" chip reveal, and Profile's body-measurement history all
 * grow/shrink through this instead of an instant show/hide, so newly-revealed
 * content settles into the layout rather than jump-cutting it (DESIGN_GUIDELINES.md
 * screen checklist #19). `children` are measured through an off-screen, opacity-0
 * copy rather than inside the collapsing wrapper itself: a wrapper that starts at
 * `height: 0` with `overflow: hidden` measures its content reliably on web, but on
 * Android that same zero-height ancestor can make the child's own `onLayout` report
 * 0 too, leaving `measuredHeight` stuck at `null` forever — which freezes the
 * visible wrapper at `height: 0` even after `open` flips true (no chip, no
 * animation, nothing). Measuring an untouched, always-full-size copy avoids that
 * dependency entirely. Content whose height can change while open (an entry
 * added/removed) simply re-measures and snaps to the new height instantly, since
 * no animation is running at that point.
 */
export function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  const reducedMotion = useReducedMotion();
  const progress = React.useRef(new Animated.Value(open ? 1 : 0)).current;
  const [measuredHeight, setMeasuredHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (reducedMotion) {
      progress.setValue(open ? 1 : 0);
      return;
    }
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: MOTION.expand,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [open, reducedMotion]);

  return (
    <View>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && h !== measuredHeight) setMeasuredHeight(h);
        }}
      >
        {children}
      </View>
      <Animated.View
        style={{
          overflow: 'hidden',
          opacity: progress,
          height: measuredHeight == null ? 0 : progress.interpolate({ inputRange: [0, 1], outputRange: [0, measuredHeight] }),
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

export function BackRow({ label = '← Back', onPress }: { label?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={styles.backRow}
      accessibilityRole="button"
      accessibilityLabel={label.replace(/^←\s*/, '')}
    >
      <Text style={styles.backText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  sectionLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.muted,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: RADII.xl,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 99,
  },
  chip: {
    borderWidth: 1,
    borderRadius: RADII.pill,
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
  },
  unitToggle: {
    width: UNIT_TOGGLE_WIDTH,
    height: 44,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.card,
    overflow: 'hidden',
  },
  unitToggleThumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: UNIT_TOGGLE_SEGMENT_WIDTH,
    backgroundColor: COLORS.ink,
  },
  unitToggleSegment: {
    width: UNIT_TOGGLE_SEGMENT_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitToggleText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.chipText,
  },
  unitToggleTextActive: {
    fontFamily: FONTS.medium,
    color: COLORS.cream,
  },
  photoTile: {
    borderRadius: RADII.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.borderFaint,
    position: 'relative',
  },
  photoTileBorderless: {
    borderWidth: 0,
  },
  photoCaption: {
    position: 'absolute',
    left: 10,
    bottom: 9,
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(22,21,15,0.42)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  screenTitle: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE.display,
    letterSpacing: -0.6,
    color: COLORS.ink,
  },
  screenSubtitle: {
    fontSize: 14.5,
    color: COLORS.mutedDark,
    marginTop: SPACING.sm,
    lineHeight: 20,
    fontFamily: FONTS.regular,
  },
  measureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  measureCell: {
    width: '48.5%',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    minHeight: 44,
    paddingVertical: 11,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  measureCellLabel: {
    fontSize: 13,
    color: COLORS.mutedDark,
    fontFamily: FONTS.regular,
  },
  measureCellInput: {
    width: 48,
    fontFamily: FONTS.mono,
    fontSize: 15,
    color: COLORS.ink,
    textAlign: 'right',
    padding: 0,
  },
  empty: {
    borderWidth: 1,
    borderColor: 'rgba(22,21,15,0.18)',
    borderStyle: 'dashed',
    borderRadius: RADII.xl,
    padding: SPACING.xl,
    paddingVertical: 34,
    alignItems: 'center',
    backgroundColor: '#F0EEE8',
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: FONTS.semibold,
    color: COLORS.ink,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13.5,
    color: COLORS.mutedDark,
    marginTop: SPACING.sm,
    lineHeight: 19,
    textAlign: 'center',
    fontFamily: FONTS.regular,
  },
  emptyActions: {
    alignSelf: 'stretch',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  primaryBtn: {
    backgroundColor: COLORS.ink,
    borderRadius: RADII.lg,
    minHeight: 52,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: COLORS.cream,
    fontFamily: FONTS.medium,
    fontSize: 15,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: 'rgba(22,21,15,0.16)',
    borderRadius: RADII.lg,
    minHeight: 52,
    minWidth: 78,
    paddingVertical: 15,
    paddingHorizontal: 20,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
  },
  secondaryBtnText: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: COLORS.ink,
  },
  backRow: {
    minHeight: 44,
    justifyContent: 'center',
    marginLeft: -4,
    paddingHorizontal: 4,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 14,
    color: COLORS.muted,
    fontFamily: FONTS.regular,
  },
});

import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

/**
 * OS-level "reduce motion" accessibility setting. Animations should skip straight
 * to their end state rather than play when this is true (FitCheck Premium
 * Guideline: "Respect reduced-motion/accessibility settings where the
 * implementation supports them").
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (mounted) setReduced(v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/**
 * Central motion durations, one per interaction "personality" (see
 * DESIGN_GUIDELINES.md's Motion language section). Pull from here rather than
 * hand-picking a duration per screen, so FitCheck's motion stays recognizable
 * as one language instead of an accumulation of unrelated timings.
 */
export const MOTION = {
  /** Bottom sheet present/dismiss — physical, grounded. */
  sheet: 260,
  /** A new garment settling into the closet grid — subtle, reassuring. */
  save: 260,
  /** Result screen's staged reveal — analytical, revealing. */
  compareReveal: 420,
  /** A garment leaving its detail screen on delete — quick, deliberate. */
  delete: 180,
  /** Top-level swipe navigation settling into place — smooth, spatial, quiet. */
  nav: 240,
  /** A selection changing — segmented unit toggle, chip active state — quick, direct.
   * Shared across both so state changes feel like one consistent language rather
   * than each control inventing its own timing. */
  selection: 150,
  /** Press-down/release on any tappable control — buttons, chips — quick, tactile. */
  press: 140,
  /** A focused-workflow screen (detail/addManual) fading and rising in
   * through the plain screen switch — quiet arrival. Not used by Result (own staged
   * reveal) or by the top-level swipe destinations (TopLevelSwipeNavigator owns
   * their transition). */
  screenEnter: 240,
  /** A garment photo finishing its decode — quiet, so a slow image load never pops
   * in fully-formed. Used by `PhotoTile`. */
  imageFade: 220,
  /** Progressive disclosure opening/closing — fit history's "Show all N", the
   * fit-type "+ More" reveal, Profile's body-measurement history — unhurried, so
   * newly-revealed content settles in rather than jump-cutting the layout. Used by
   * `Collapsible`. */
  expand: 220,
  /** A Closet tile's photo morphing into Detail's hero photo — smooth, spatial,
   * the same personality as top-level swipe nav but slightly longer since it's
   * animating position+size, not just a horizontal offset. Used by
   * `PhotoTransitionOverlay`. */
  heroTransition: 320,
  /** A required field's border/label going from neutral to error state, and the
   * one deliberate exception to "no animation for errors" — a very small,
   * restrained shake (not a bounce) that draws the eye to *which* field needs
   * attention without touching anything else on screen. Used by `useShake`. */
  shake: 200,
} as const;

/**
 * A small, restrained horizontal shake (±4dp, settling to 0) for a field that
 * just failed validation — the one deliberate exception to "no animation for
 * errors" (see MOTION.shake). `shake()` is imperative and one-shot: call it only
 * on the rising edge (no error → error) so re-submitting an already-erroring
 * field doesn't nag with a repeat shake. No-ops entirely under reduced motion —
 * the (non-animated) red border/error text alone still carries the feedback.
 */
export function useShake() {
  const reducedMotion = useReducedMotion();
  const x = useRef(new Animated.Value(0)).current;

  const shake = useCallback(() => {
    if (reducedMotion) return;
    x.setValue(0);
    const leg = MOTION.shake / 5;
    Animated.sequence(
      [-4, 4, -3, 3, 0].map((toValue) =>
        Animated.timing(x, { toValue, duration: leg, easing: Easing.linear, useNativeDriver: true })
      )
    ).start();
  }, [reducedMotion]);

  return { style: { transform: [{ translateX: x }] }, shake };
}

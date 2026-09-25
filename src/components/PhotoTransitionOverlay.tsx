import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet } from 'react-native';
import { RADII } from '../theme';
import { useStore } from '../store';
import { MOTION, useReducedMotion } from '../utils/motion';

/**
 * The floating image that bridges a Closet tile and Detail's hero photo —
 * FitCheck's one true shared-element transition. It never needs a navigation
 * library: `store.screen` still just swaps components underneath it exactly as
 * before (see DESIGN_GUIDELINES.md's navigation decisions), this overlay only
 * sits on top of that swap for the ~1/3 second it takes the same image to travel
 * from where the tile was to where the hero now is.
 *
 * Lifecycle: `ClosetScreen`'s tile press measures itself and calls
 * `store.beginPhotoTransition` (sets `from`) in the same tick as `openGarment`.
 * `DetailScreen`'s hero mount measures itself and calls
 * `reportPhotoTransitionTarget` (sets `to`) once it has, at which point this
 * component animates from `from` to `to` and clears the transition on arrival —
 * matching Detail's own real hero image exactly, which renders with `instant`
 * so it doesn't also fade in underneath and double up the motion. If `to` never
 * arrives (a stale id, a garment that failed to load) a short timeout clears the
 * transition so the floating image can never get stuck on screen.
 */
export default function PhotoTransitionOverlay() {
  const store = useStore();
  const reducedMotion = useReducedMotion();
  const pt = store.photoTransition;
  const progress = useRef(new Animated.Value(0)).current;
  const clearRef = useRef(store.clearPhotoTransition);
  clearRef.current = store.clearPhotoTransition;

  useEffect(() => {
    if (!pt || !pt.to || reducedMotion) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: MOTION.heroTransition,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) clearRef.current();
    });
  }, [pt?.garmentId, !!pt?.to, reducedMotion]);

  useEffect(() => {
    if (!pt) return;
    const timeout = setTimeout(() => clearRef.current(), 1200);
    return () => clearTimeout(timeout);
  }, [pt?.garmentId]);

  if (!pt || reducedMotion) return null;
  const { from, to } = pt;
  const target = to ?? from;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.wrap,
        {
          left: progress.interpolate({ inputRange: [0, 1], outputRange: [from.x, target.x] }),
          top: progress.interpolate({ inputRange: [0, 1], outputRange: [from.y, target.y] }),
          width: progress.interpolate({ inputRange: [0, 1], outputRange: [from.width, target.width] }),
          height: progress.interpolate({ inputRange: [0, 1], outputRange: [from.height, target.height] }),
        },
      ]}
    >
      <Image source={{ uri: pt.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    borderRadius: RADII.lg,
    overflow: 'hidden',
  },
});

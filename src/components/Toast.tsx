import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text } from 'react-native';
import { COLORS, FONTS, RADII } from '../theme';
import { useStore } from '../store';

export default function Toast() {
  const store = useStore();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (store.toast) {
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      // A toast appears with nothing taking focus, so a screen reader never
      // encounters it on its own — announce it explicitly (iOS; Android gets the
      // same effect from accessibilityLiveRegion below) rather than leaving this
      // state change invisible to assistive tech.
      AccessibilityInfo.announceForAccessibility(store.toast);
    }
  }, [store.toast]);

  if (!store.toast) return null;

  return (
    <Animated.View style={[styles.toast, { opacity }]} accessibilityLiveRegion="polite" accessible>
      <Text style={styles.text}>{store.toast}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute', left: 20, right: 20, bottom: 96, backgroundColor: COLORS.ink,
    borderRadius: RADII.md, paddingVertical: 13, paddingHorizontal: 16, zIndex: 80,
  },
  text: { color: COLORS.cream, fontSize: 13.5, fontFamily: FONTS.regular },
});

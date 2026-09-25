import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS, RADII, SCREEN_PADDING, SPACING } from '../theme';
import { MOTION, useReducedMotion } from '../utils/motion';

/**
 * FitCheck's one destructive-action confirmation surface (Detail's "Remove from
 * closet", Profile's "Remove entry") — replaces React Native's Alert.alert, which
 * react-native-web doesn't implement: a tap on "Remove" silently did nothing on
 * web (see DESIGN_GUIDELINES.md's Known failure patterns). A plain React overlay
 * works identically on web, iOS, and Android, so delete has the same behavior on
 * every platform rather than web silently losing the feature.
 *
 * Presentational and reusable — driven entirely by props, mounted once in App.tsx
 * and wired to store.confirmRequest, so no screen builds its own modal. Motion
 * reuses MOTION.sheet (present/dismiss, physical and grounded), matching
 * FitSheet.tsx's personality for the same reason: this is also a small, in-context
 * decision surface, not a new motion language.
 */
export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  cancelLabel?: string;
  confirmLabel?: string;
  /** Renders the confirm button in the restrained destructive red (COLORS.bad)
   * instead of ink — visually distinct from Cancel without a dramatic warning
   * screen (DESIGN_GUIDELINES.md's "recognizable but restrained"). */
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmDialog({
  visible,
  title,
  message,
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
  destructive,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  // Stays mounted through the close animation, same reasoning as FitSheet's own
  // `visible` state — dismissing should be quick and deliberate, not an instant cut.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const duration = reduceMotion ? 0 : MOTION.sheet;
    if (visible) {
      setMounted(true);
      opacity.setValue(0);
      scale.setValue(reduceMotion ? 1 : 0.96);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.timing(opacity, { toValue: 0, duration, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityRole="button" accessibilityLabel={cancelLabel} />
      <View style={[styles.centerWrap, { pointerEvents: 'box-none' }]}>
        <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              hitSlop={4}
              style={({ pressed }) => [styles.btn, styles.cancelBtn, pressed && { backgroundColor: '#EFEDE7' }]}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              hitSlop={4}
              style={({ pressed }) => [
                styles.btn,
                destructive ? styles.destructiveBtn : styles.confirmBtn,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(22,21,15,0.4)' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SCREEN_PADDING },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.card,
    borderRadius: RADII.xl,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.xl,
  },
  title: { fontSize: 18, fontFamily: FONTS.semibold, color: COLORS.ink, letterSpacing: -0.2 },
  message: { fontSize: 13.5, color: COLORS.mutedDark, marginTop: SPACING.sm, lineHeight: 19, fontFamily: FONTS.regular },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xl - 4 },
  btn: { flex: 1, minHeight: 48, borderRadius: RADII.lg, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { borderWidth: 1, borderColor: 'rgba(22,21,15,0.16)', backgroundColor: COLORS.card },
  cancelText: { fontFamily: FONTS.medium, fontSize: 14.5, color: COLORS.ink },
  confirmBtn: { backgroundColor: COLORS.ink },
  destructiveBtn: { backgroundColor: COLORS.bad },
  confirmText: { fontFamily: FONTS.medium, fontSize: 14.5, color: COLORS.cream },
});

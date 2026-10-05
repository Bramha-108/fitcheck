import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold } from '@expo-google-fonts/archivo';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';

import { COLORS, FONTS, SCREEN_PADDING, SPACING } from './src/theme';
import { StoreProvider, useStore, isFocusedWorkflow } from './src/store';
import { MOTION, useReducedMotion } from './src/utils/motion';
import { PrimaryButton } from './src/components/UI';
import DetailScreen from './src/screens/DetailScreen';
import AddManualScreen from './src/screens/AddManualScreen';
import ResultScreen from './src/screens/ResultScreen';
import TopLevelSwipeNavigator from './src/components/TopLevelSwipeNavigator';
import TabBar from './src/components/TabBar';
import FitSheet from './src/components/FitSheet';
import Toast from './src/components/Toast';
import Onboarding from './src/components/Onboarding';
import ConfirmDialog from './src/components/ConfirmDialog';
import PhotoTransitionOverlay from './src/components/PhotoTransitionOverlay';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Focused workflows render directly, one at a time, exactly as before. The four
// top-level destinations (home/closet/fitcheck/profile) render through
// TopLevelSwipeNavigator instead, which owns swiping between them — see
// DESIGN_GUIDELINES.md's navigation decisions for why this stays a single
// state-driven `store.screen`, not a second navigation stack.
// Fade + rise entrance for the focused-workflow screens reached through the
// plain switch below. Result is deliberately excluded — it already has its own,
// more elaborate staged reveal (MOTION.compareReveal); layering a second generic
// fade+slide on top would be motion-on-motion. The four top-level destinations
// (default case) are also excluded — TopLevelSwipeNavigator already owns their
// transition. Mirrors the mount-effect idiom already used by ResultScreen's
// `reveal` and ClosetScreen's GarmentTile `progress`. Deliberately no exit/outgoing
// animation — see DESIGN_GUIDELINES.md's Motion language section for why.
function ScreenEnter({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: MOTION.screenEnter,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reduceMotion]);

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function CurrentScreen() {
  const store = useStore();
  switch (store.screen) {
    // Keyed so Detail → Edit (and back) remounts ScreenEnter and plays its
    // entrance; unkeyed, React reused the wrapper with its animation already done.
    case 'detail': return <ScreenEnter key="detail"><DetailScreen /></ScreenEnter>;
    case 'addManual': return <ScreenEnter key="addManual"><AddManualScreen /></ScreenEnter>;
    case 'result': return <ResultScreen />;
    default: return <TopLevelSwipeNavigator />;
  }
}

// Shown only when the initial database open/read itself fails (corrupt file, disk
// full, a migration error) — never a blank screen the user has no way to make
// sense of (DESIGN_GUIDELINES.md's "Never hide system state"). `retryInit` re-runs
// the exact same load; if it keeps failing, at least the user knows why, instead
// of assuming FitCheck is just frozen.
function InitErrorScreen() {
  const store = useStore();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, styles.initError, { paddingTop: insets.top + SPACING.xl, paddingBottom: insets.bottom + SPACING.xl }]}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={styles.initErrorTitle}>Couldn't open your closet</Text>
        <Text style={styles.initErrorBody}>{store.initError}</Text>
        <Text style={styles.initErrorNote}>Your data hasn't been touched — this is just FitCheck failing to read it right now.</Text>
      </View>
      <PrimaryButton label="Try again" onPress={store.retryInit} />
      <StatusBar style="dark" />
    </View>
  );
}

function Shell() {
  const store = useStore();
  if (store.initError) return <InitErrorScreen />;
  if (!store.ready) {
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
      </View>
    );
  }
  return (
    <View style={styles.root}>
      <View style={{ flex: 1 }}>
        <CurrentScreen />
      </View>
      {!isFocusedWorkflow(store.screen) && <TabBar />}
      <FitSheet />
      <Toast />
      <Onboarding />
      <ConfirmDialog
        visible={!!store.confirmRequest}
        title={store.confirmRequest?.title ?? ''}
        message={store.confirmRequest?.message ?? ''}
        cancelLabel={store.confirmRequest?.cancelLabel}
        confirmLabel={store.confirmRequest?.confirmLabel}
        destructive={store.confirmRequest?.destructive}
        onCancel={store.cancelConfirm}
        onConfirm={store.confirmAction}
      />
      <PhotoTransitionOverlay />
      <StatusBar style="dark" />
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold,
    JetBrainsMono_400Regular, JetBrainsMono_500Medium,
  });

  const onLayout = useCallback(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StoreProvider>
          <View style={{ flex: 1 }} onLayout={onLayout}>
            <Shell />
          </View>
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  initError: { paddingHorizontal: SCREEN_PADDING },
  initErrorTitle: { fontSize: 22, fontFamily: FONTS.semibold, color: COLORS.ink, letterSpacing: -0.2 },
  initErrorBody: { fontSize: 14.5, fontFamily: FONTS.regular, color: COLORS.mutedDark, marginTop: SPACING.sm, lineHeight: 20 },
  initErrorNote: { fontSize: 13, fontFamily: FONTS.regular, color: COLORS.muted, marginTop: SPACING.lg, lineHeight: 19 },
});

import React, { useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Screen, useStore } from '../store';
import { MOTION, useReducedMotion } from '../utils/motion';
import HomeScreen from '../screens/HomeScreen';
import ClosetScreen from '../screens/ClosetScreen';
import FitCheckScreen from '../screens/FitCheckScreen';
import ProfileScreen from '../screens/ProfileScreen';

/** The four top-level browsing destinations, in swipe order — the exact complement
 * of FOCUSED_WORKFLOW_SCREENS in store.tsx. Swiping never leaves this set and never
 * wraps past either end (DESIGN_GUIDELINES.md's navigation decisions). */
const TOP_LEVEL: Screen[] = ['home', 'closet', 'fitcheck', 'profile'];

type ScrollRefs = { home: React.RefObject<any>; closet: React.RefObject<any>; fitcheck: React.RefObject<any>; profile: React.RefObject<any> };

function renderTopLevel(screen: Screen, refs: ScrollRefs) {
  switch (screen) {
    case 'home': return <HomeScreen scrollRef={refs.home} />;
    case 'closet': return <ClosetScreen scrollRef={refs.closet} />;
    case 'fitcheck': return <FitCheckScreen scrollRef={refs.fitcheck} />;
    case 'profile': return <ProfileScreen scrollRef={refs.profile} />;
    default: return null;
  }
}

// How far (as a fraction of screen width) or how fast a swipe has to travel to
// commit to the neighboring screen rather than spring back — tuned so a normal
// deliberate swipe commits but a stray drag doesn't.
const COMMIT_DISTANCE_RATIO = 0.28;
const COMMIT_VELOCITY = 800;
// A swipe past the first/last screen only inches the current screen along,
// as a quiet "nothing past here" cue (DESIGN_GUIDELINES #11) — no neighbor pane.
const EDGE_RESISTANCE = 0.25;

type Drag = { dir: 'prev' | 'next'; screen: Screen };

export default function TopLevelSwipeNavigator() {
  const store = useStore();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const translateX = useRef(new Animated.Value(0)).current;
  // Constant node across renders: container position = base (which pane sits at
  // x=0) + however far the gesture has dragged so far.
  const baseX = useRef(new Animated.Value(0)).current;
  const containerX = useRef(Animated.add(baseX, translateX)).current;
  // Separate node for the "nothing past here" edge-resistance nudge (dragging
  // past the first/last screen — no neighbor pane, just the current one inching
  // along). Kept off translateX/baseX entirely: those two only ever mean "how far
  // into committing to a *different* screen," and folding the same-screen nudge
  // into them was what let a stale reset value leak into the wrong render — see
  // the idle branch below.
  const edgeX = useRef(new Animated.Value(0)).current;
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const widthRef = useRef(width);
  widthRef.current = width;
  const screenRef = useRef(store.screen);
  screenRef.current = store.screen;
  // The screen a just-released swipe is committing to, from the moment `settle`
  // starts until `store.go` actually lands. A new gesture can begin (finger back
  // down) before that commit's animation + store update have finished — without
  // this, its onUpdate would compute directions/targets against the stale
  // pre-commit screen, one step behind what's actually on screen mid-transition.
  const pendingScreenRef = useRef<Screen | null>(null);
  // Refs into each top-level screen's own outer ScrollView, so the pan gesture
  // below can be marked simultaneous with them. Without this, web's gesture-handler
  // implementation lets whichever recognizer notices pointer movement first win
  // exclusively — and a screen's own NativeViewGestureHandler-backed ScrollView
  // activates on ANY movement past the touch slop, regardless of direction, so it
  // wins the race even for a purely horizontal swipe and starves this Pan of
  // further events after onBegin. Native platforms arbitrate this correctly on
  // their own; web needs it spelled out explicitly.
  const homeScrollRef = useRef<any>(null);
  const closetScrollRef = useRef<any>(null);
  const fitcheckScrollRef = useRef<any>(null);
  const profileScrollRef = useRef<any>(null);
  const scrollRefs: ScrollRefs = { home: homeScrollRef, closet: closetScrollRef, fitcheck: fitcheckScrollRef, profile: profileScrollRef };

  const clearDrag = () => {
    dragRef.current = null;
    setDrag(null);
  };

  // `finished` is false when this animation was interrupted (most commonly: a new
  // gesture's onUpdate called .setValue on the same node before this one reached
  // its target). Callers must treat that as "this commit no longer owns the
  // shared state" rather than pressing on — see onEnd below.
  const settle = (toValue: number, after?: (finished: boolean) => void) => {
    Animated.timing(translateX, {
      toValue,
      duration: reduceMotion ? 0 : MOTION.nav,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => after?.(finished));
  };

  // Springs the edge-resistance nudge back to 0. No `finished`/state-transition
  // concerns here (unlike `settle`) — edgeX never gates which screen is showing.
  const settleEdge = (toValue: number) => {
    Animated.timing(edgeX, {
      toValue,
      duration: reduceMotion ? 0 : MOTION.nav,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .simultaneousWithExternalGesture(homeScrollRef, closetScrollRef, fitcheckScrollRef, profileScrollRef)
    .onUpdate((e) => {
      const w = widthRef.current;
      // A commit still in flight counts as "already there" for a new gesture's
      // own direction/target math — screenRef only updates once store.go actually
      // lands, which can be a frame or more behind the swipe that's already begun.
      const effectiveScreen = pendingScreenRef.current ?? screenRef.current;
      const i = TOP_LEVEL.indexOf(effectiveScreen);
      const dx = e.translationX;
      const dir: 'prev' | 'next' | null = dx > 0 ? 'prev' : dx < 0 ? 'next' : null;
      const targetIndex = dir === 'prev' ? i - 1 : dir === 'next' ? i + 1 : -1;
      const hasTarget = dir != null && targetIndex >= 0 && targetIndex < TOP_LEVEL.length;
      if (!hasTarget) {
        if (dragRef.current) clearDrag();
        edgeX.setValue(dx * EDGE_RESISTANCE);
        return;
      }
      const targetScreen = TOP_LEVEL[targetIndex];
      if (dragRef.current?.screen !== targetScreen) {
        baseX.setValue(dir === 'prev' ? -w : 0);
        dragRef.current = { dir, screen: targetScreen };
        setDrag(dragRef.current);
      }
      translateX.setValue(dx);
    })
    .onEnd((e) => {
      const w = widthRef.current;
      const d = dragRef.current;
      if (!d) {
        settleEdge(0);
        return;
      }
      const passedDistance = Math.abs(e.translationX) > w * COMMIT_DISTANCE_RATIO;
      const passedVelocity = Math.abs(e.velocityX) > COMMIT_VELOCITY && Math.sign(e.velocityX) === Math.sign(e.translationX);
      if (passedDistance || passedVelocity) {
        const toValue = d.dir === 'prev' ? w : -w;
        // Claimed immediately (not once the animation finishes) so a gesture that
        // begins mid-settle already sees where this one is headed — see
        // pendingScreenRef's declaration above.
        pendingScreenRef.current = d.screen;
        settle(toValue, (finished) => {
          // A new gesture interrupted this settle (its onUpdate called .setValue
          // on `translateX` before we got here) — it already owns dragRef/drag by
          // now, so clearing or reassigning either from here would stomp on it.
          // That new gesture's own onEnd is what gets to finish this job.
          if (!finished) return;
          clearDrag();
          store.go(d.screen);
          pendingScreenRef.current = null;
          // Deliberately NOT resetting translateX/baseX here. These are native-driven,
          // so a setValue reaches the native view immediately — a frame or more before
          // React commits the swap (just queued above) from the two-pane row to the idle
          // branch. Resetting here redrew the still-mounted row at offset 0 — the *old*
          // screen's pane — for one frame: a visible flash of the previous screen right
          // after every committed swipe (confirmed frame-by-frame on device). Leaving
          // them stale is safe because the two branches below have different `key`s: the
          // idle branch mounts a fresh native view (it never reads these values), and the
          // next drag's onUpdate sets both before its two-pane row mounts.
        });
      } else {
        settle(0, (finished) => { if (finished) clearDrag(); });
      }
    })
    // Safety net for a gesture that's interrupted rather than cleanly released
    // (e.g. an incoming call/system overlay stealing the touch) — onEnd may
    // never fire in that case, which would otherwise strand the screen mid-drag,
    // or leave an edge-resistance nudge stuck off-center.
    .onFinalize((_e, success) => {
      if (success) return;
      settleEdge(0);
      if (dragRef.current) settle(0, (finished) => { if (finished) clearDrag(); });
    });

  // The two branches carry different keys on purpose. Without them React reuses
  // one native view across the swap, and that view keeps the native-driven offset
  // from the drag (a full screen width) while now holding a single pane — a blank
  // screen after every committed swipe. Distinct keys mount a fresh view instead,
  // in the same commit that removes the two-pane row.
  let content: React.ReactNode;
  if (drag) {
    const panes = drag.dir === 'prev' ? [drag.screen, store.screen] : [store.screen, drag.screen];
    content = (
      <Animated.View key="pair" style={[styles.row, { width: width * 2, transform: [{ translateX: containerX }] }]}>
        {panes.map((s) => (
          <View key={s} style={{ width }}>
            {renderTopLevel(s, scrollRefs)}
          </View>
        ))}
      </Animated.View>
    );
  } else {
    // Deliberately reads edgeX here, never translateX/baseX — this is the idle/
    // settled state (plus the same-screen edge-resistance nudge, which is what
    // edgeX is for). Driving this off translateX/baseX, the same pair the
    // two-pane commit path above uses, was the source of a real bug: those two hold
    // stale commit-drag positions between swipes, and any imperative .setValue on
    // them takes effect on whatever view is mounted a frame or more before React's
    // own re-render commits — a visible snap back to the pre-drag position, with the
    // previous screen briefly showing again. (The same mechanism is why the commit
    // path above no longer resets them at all.) edgeX is never touched by the commit
    // path, so this branch can't replay a stale commit-drag position.
    content = (
      <Animated.View key="idle" style={{ flex: 1, transform: [{ translateX: edgeX }] }}>
        {renderTopLevel(store.screen, scrollRefs)}
      </Animated.View>
    );
  }

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.clip}>{content}</View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  clip: { flex: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', flex: 1 },
});

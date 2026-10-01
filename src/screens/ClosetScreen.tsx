import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
// From gesture-handler, not react-native — see HomeScreen.tsx's identical note;
// this screen has two horizontal filter rails plus its own vertical scroll.
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADII, SCREEN_PADDING, SPACING, TYPE } from '../theme';
import { Rect, useStore } from '../store';
import { Chip, EmptyState, Eyebrow, PhotoTile, ToneDot } from '../components/UI';
import { orderFits } from '../engine/compare';
import { CLOSET_FILTERS, FITS } from '../data/constants';
import { Category, Garment } from '../types';
import { MOTION, useReducedMotion } from '../utils/motion';

const CATEGORY_FOR_FILTER: Partial<Record<string, Category>> = {
  Tops: 'tops', Pants: 'pants', Jackets: 'jackets',
};

export default function ClosetScreen({ scrollRef }: { scrollRef?: React.RefObject<any> }) {
  const insets = useSafeAreaInsets();
  const store = useStore();
  const { garments, filter, closetFit, closetSearch } = store;
  const reduceMotion = useReducedMotion();

  // Captured once at mount, not read live — so the just-saved tile animates in
  // exactly the one time we land here right after saving, and doesn't replay on
  // every later visit to Closet (justSavedId is cleared immediately below).
  const [animateInId] = useState(store.justSavedId);
  // Same one-shot capture for the garment that was just deleted (from Detail) —
  // by the time we land here it's already gone from `garments`, so this snapshot
  // is what lets the grid render one exiting tile instead of just being silently
  // one item shorter. `exitedDeleted` clears it locally once the shrink/fade
  // finishes, so the ghost tile unmounts instead of lingering at opacity 0.
  const [deletedGarment] = useState(store.justDeletedGarment);
  const [exitedDeleted, setExitedDeleted] = useState(false);
  useEffect(() => {
    if (store.justSavedId != null) store.clearJustSaved();
    if (store.justDeletedGarment != null) store.clearJustDeleted();
  }, []);

  const activeCategory = CATEGORY_FOR_FILTER[filter];

  const fitChips = useMemo(() => {
    if (!activeCategory) return [];
    const present = new Set(garments.filter((g) => g.cat === activeCategory).map((g) => g.fit));
    return orderFits(activeCategory, garments, FITS[activeCategory]).filter((f) => present.has(f));
  }, [garments, activeCategory]);

  const items = useMemo(() => {
    let list = garments.slice();
    if (filter === 'Tops') list = list.filter((g) => g.cat === 'tops');
    else if (filter === 'Pants') list = list.filter((g) => g.cat === 'pants');
    else if (filter === 'Jackets') list = list.filter((g) => g.cat === 'jackets');
    else if (filter === 'Best fitting') list = list.filter((g) => g.ref);
    else if (filter === 'Recently added') list = list.slice(0, 6);

    if (closetFit) list = list.filter((g) => g.fit === closetFit);

    const q = closetSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((g) => [g.brand, g.name, g.fit, g.size, ...g.tags].join(' ').toLowerCase().includes(q));
    }
    return list;
  }, [garments, filter, closetFit, closetSearch]);

  // Explicit state, not just "items.length === 0" — search and filter fail for
  // different reasons and need different recovery copy (FitCheck Mobile UX
  // Guideline #17: a search miss must say so, not read as a generic filter miss).
  const searchTerm = closetSearch.trim();
  const hasSearch = searchTerm.length > 0;
  const hasFilter = filter !== 'All';
  type EmptyReason = 'search' | 'filter' | 'combined';
  const emptyReason: EmptyReason = hasSearch && hasFilter ? 'combined' : hasSearch ? 'search' : 'filter';

  const filterLabel = `"${filter}"${closetFit ? ` · ${closetFit}` : ''}`;
  const empty =
    emptyReason === 'search'
      ? {
          title: 'No garments found',
          body: `Nothing in your closet matches "${searchTerm}". Try a different spelling, brand, or category.`,
          clearLabel: 'Clear search',
          onClear: () => store.setClosetSearch(''),
        }
      : emptyReason === 'combined'
        ? {
            title: 'No garments found',
            body: `Nothing matches "${searchTerm}" with your current filters (${filterLabel}).`,
            clearLabel: 'Clear filters',
            onClear: store.clearFilter,
          }
        : {
            title: 'Nothing matches this filter',
            body: `No garments tagged ${filterLabel} yet.`,
            clearLabel: 'Clear filter',
            onClear: () => store.setFilter('All'),
          };

  return (
    <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: SPACING.xl }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: SCREEN_PADDING, paddingTop: insets.top + SPACING.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={styles.title}>Closet</Text>
          <Pressable onPress={() => store.go('addManual')} style={styles.addPill} accessibilityRole="button" accessibilityLabel="Add garment">
            <Text style={styles.addPillText}>+ Add</Text>
          </Pressable>
        </View>
        <Eyebrow style={{ marginTop: SPACING.sm }}>
          {items.length} of {garments.length} garments
        </Eyebrow>

        <View style={styles.searchRow}>
          <TextInput
            value={closetSearch}
            onChangeText={store.setClosetSearch}
            placeholder="Search brand, name, fit, tags…"
            placeholderTextColor={COLORS.faintest}
            style={styles.searchInput}
            accessibilityLabel="Search closet"
          />
          {closetSearch.length > 0 && (
            <Pressable
              onPress={() => store.setClosetSearch('')}
              hitSlop={8}
              style={styles.searchClear}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Text style={styles.searchClearText}>×</Text>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm - 1, paddingHorizontal: SCREEN_PADDING, paddingTop: SPACING.md, paddingBottom: fitChips.length ? SPACING.sm + 2 : SPACING.lg }}>
        {CLOSET_FILTERS.map((f) => (
          <Chip key={f} label={f} active={f === filter} onPress={() => store.setFilter(f)} />
        ))}
      </ScrollView>

      {fitChips.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm - 1, paddingHorizontal: SCREEN_PADDING, paddingBottom: SPACING.lg }}>
          {fitChips.map((f) => (
            <Chip key={f} label={f} active={f === closetFit} onPress={() => store.setClosetFit(f)} />
          ))}
        </ScrollView>
      )}

      {garments.length === 0 ? (
        <EmptyState
          style={{ marginHorizontal: SCREEN_PADDING, marginTop: SPACING.sm }}
          title="Your closet is empty"
          body="Add your first garment to start tracking fit and comparing new buys against it."
          primaryLabel="Add your first garment"
          onPrimary={() => store.go('addManual')}
        />
      ) : items.length === 0 ? (
        <EmptyState
          style={{ marginHorizontal: SCREEN_PADDING, marginTop: SPACING.sm }}
          title={empty.title}
          body={empty.body}
          primaryLabel="Add a garment"
          onPrimary={() => store.go('addManual')}
          secondaryLabel={empty.clearLabel}
          onSecondary={empty.onClear}
        />
      ) : (
        <View style={styles.grid}>
          {deletedGarment && !reduceMotion && !exitedDeleted && (
            <GarmentTile
              key={`exit-${deletedGarment.id}`}
              g={deletedGarment}
              animateIn={false}
              exiting
              onPress={() => {}}
              onExited={() => setExitedDeleted(true)}
            />
          )}
          {items.map((g) => (
            <GarmentTile
              key={g.id}
              g={g}
              animateIn={!reduceMotion && g.id === animateInId}
              onPress={(fromRect) => {
                if (fromRect && g.photo) store.beginPhotoTransition(g.id, g.photo, fromRect);
                store.openGarment(g.id);
              }}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

/** A plain grid tile, except for the one garment that was just saved — that one
 * settles in with a quick fade + rise instead of just appearing, so "Save"
 * visibly puts the garment into the closet (FitCheck Premium Guideline #3.A) —
 * or the one garment that was just removed (from Detail), which shrinks/fades
 * out instead of the grid just silently being one item shorter. Every other
 * tile skips the Animated wrapper entirely. */
function GarmentTile({
  g,
  animateIn,
  exiting,
  onPress,
  onExited,
}: {
  g: Garment;
  animateIn: boolean;
  exiting?: boolean;
  onPress: (fromRect?: Rect) => void;
  onExited?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const photoRef = useRef<View>(null);
  const progress = useRef(new Animated.Value(animateIn ? 0 : 1)).current;

  // Measures the tile's own photo before navigating away — the shared-element
  // transition (PhotoTransitionOverlay) needs this screen-space rect as its
  // starting point, and Closet unmounts as soon as the screen switches, so it
  // has to be captured now, not on some later frame.
  const handlePress = () => {
    if (reduceMotion || !g.photo || !photoRef.current) {
      onPress();
      return;
    }
    photoRef.current.measureInWindow((x, y, width, height) => onPress({ x, y, width, height }));
  };
  useEffect(() => {
    if (exiting) {
      Animated.timing(progress, {
        toValue: 0,
        duration: MOTION.delete,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => { if (finished) onExited?.(); });
      return;
    }
    if (!animateIn) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: MOTION.save,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    // Intentionally empty deps — animateIn/exiting never change within one
    // mounted tile's lifetime (a ghost tile is only ever rendered exiting, a
    // real tile only ever rendered animating-in or plain), so this plays once.
  }, []);

  // Normally every garment has at least its "Added to closet" entry, but a restored
  // backup (or a save interrupted between the garment row and its first observation)
  // can leave one with no history — show no tone dot rather than inventing a fit state.
  const latest = g.history[g.history.length - 1] as (typeof g.history)[number] | undefined;
  const tone = latest?.tone;
  const tileLabel = `${g.brand} ${g.name}, ${g.cat}, size ${g.size}, ${g.fit}.${latest ? ` ${latest.note}` : ''}`;

  const content = (
    <Pressable
      onPress={handlePress}
      style={styles.gridItemPressable}
      accessible
      accessibilityRole="button"
      accessibilityLabel={tileLabel}
    >
      <View ref={photoRef} collapsable={false}>
        <PhotoTile bg={g.bg} caption={g.cap} height={196} uri={g.photo}>
          {tone && (
            <View style={styles.cornerDotWrap}>
              <View
                style={[styles.cornerDot, { backgroundColor: tone === 'good' ? COLORS.good : tone === 'warn' ? COLORS.warn : COLORS.bad }]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            </View>
          )}
        </PhotoTile>
      </View>
      <Eyebrow style={{ marginTop: 10 }}>{g.brand}</Eyebrow>
      <Text style={styles.gName} numberOfLines={2}>{g.name}</Text>
      <Text style={styles.gMeta}>{g.cat.charAt(0).toUpperCase() + g.cat.slice(1)} · {g.size}</Text>
      <View style={styles.fitBadge}>
        <Text style={styles.fitBadgeText}>{g.fit}</Text>
      </View>
    </Pressable>
  );

  // The grid's `width: '47%'` must live on whichever element is actually the
  // flex-wrap child of `styles.grid` — never only on the inner Pressable. A
  // percentage width resolves against the nearest sized ancestor; wrapping the
  // Pressable in an Animated.View with no width of its own (as this branch
  // used to do) makes '47%' resolve against an undetermined shrink-to-fit
  // parent, which can render near-zero-width and throw off the whole wrapped
  // row until the screen remounts.
  if (!animateIn && !exiting) return <View style={styles.gridItem}>{content}</View>;
  return (
    <Animated.View
      pointerEvents={exiting ? 'none' : undefined}
      style={[
        styles.gridItem,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }, { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
        },
      ]}
    >
      {content}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: FONTS.semibold, fontSize: TYPE.display, letterSpacing: -0.6, color: COLORS.ink },
  addPill: { borderWidth: 1, borderColor: 'rgba(22,21,15,0.16)', borderRadius: 99, paddingHorizontal: SPACING.lg, minHeight: 44, justifyContent: 'center' },
  addPillText: { fontSize: 13, color: COLORS.ink, fontFamily: FONTS.regular },
  searchRow: { position: 'relative', justifyContent: 'center', marginTop: SPACING.md + 2 },
  searchInput: {
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.md,
    paddingVertical: 11, paddingLeft: SPACING.md + 2, paddingRight: 38, fontSize: 14, color: COLORS.ink, fontFamily: FONTS.regular,
  },
  searchClear: { position: 'absolute', right: 4, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  searchClearText: { fontSize: 18, color: COLORS.muted, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SCREEN_PADDING, paddingTop: SPACING.lg, gap: SPACING.md + 2, justifyContent: 'space-between' },
  gridItem: { width: '47%' },
  gridItemPressable: { width: '100%' },
  gName: { fontSize: 13.5, fontFamily: FONTS.medium, lineHeight: 18, height: 36, marginTop: 3, color: COLORS.ink },
  gMeta: { fontSize: 12, color: COLORS.muted, marginTop: 4, fontFamily: FONTS.regular },
  fitBadge: { alignSelf: 'flex-start', backgroundColor: COLORS.chipBg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginTop: 7 },
  fitBadgeText: { fontSize: 11, color: '#4A473F', fontFamily: FONTS.regular },
  cornerDotWrap: {
    position: 'absolute', right: 7, top: 7, width: 15, height: 15, borderRadius: 99,
    backgroundColor: 'rgba(252,251,249,0.92)', alignItems: 'center', justifyContent: 'center',
  },
  cornerDot: { width: 7, height: 7, borderRadius: 99 },
});

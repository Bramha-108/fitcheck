import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
// From gesture-handler, not react-native — see HomeScreen.tsx's identical note.
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADII, SCREEN_PADDING, SPACING } from '../theme';
import { useStore, sanitizeNumeric } from '../store';
import { Card, Collapsible, Eyebrow, MeasurementGrid, PrimaryButton, ScreenHeader, SecondaryButton, SectionLabel, UnitToggle } from '../components/UI';
import { BODY_MEASURES } from '../data/constants';
import { latestBodyMeasurements } from '../engine/profile';
import { whenLabel } from '../data/hydrate';
import { convertDraftUnits, formatValue } from '../utils/units';

export default function ProfileScreen({ scrollRef }: { scrollRef?: React.RefObject<any> }) {
  const insets = useSafeAreaInsets();
  const store = useStore();
  const tracked = store.garments.length;
  const { trend, prefs, ranges } = store.profile;
  const { units, bodyMeasurements } = store;

  const [bodyDraft, setBodyDraft] = useState<Record<string, string>>({});
  const [showHistory, setShowHistory] = useState(false);

  // bodyDraft holds raw strings in whatever unit was active when typed — this
  // screen's local draft isn't part of the global store, but the unit toggle is,
  // so a change made here (or on any other screen) still has to re-express
  // whatever's already typed rather than leaving the digits stale under a new
  // unit label. Mirrors store.tsx's applyUnits for every other measurement draft.
  const prevUnits = useRef(units);
  useEffect(() => {
    if (prevUnits.current !== units) {
      setBodyDraft((s) => convertDraftUnits(s, prevUnits.current, units));
      prevUnits.current = units;
    }
  }, [units]);

  const latest = useMemo(() => latestBodyMeasurements(bodyMeasurements), [bodyMeasurements]);
  const lastEntry = bodyMeasurements[bodyMeasurements.length - 1];

  const setBodyField = (k: string, v: string) => setBodyDraft((s) => ({ ...s, [k]: sanitizeNumeric(v) }));
  const handleSave = async () => {
    // Only clear what was typed once it's actually saved — a failed write
    // (store.saveBodyMeasurement already toasts why) must leave the draft
    // exactly as typed so the user doesn't lose it and can just retry.
    const saved = await store.saveBodyMeasurement(bodyDraft);
    if (saved) setBodyDraft({});
  };

  const confirmDeleteEntry = (id: number, when: string) => {
    store.confirm({
      title: 'Remove entry?',
      message: `The measurements logged on ${when} will be deleted.`,
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: () => store.deleteBodyMeasurementEntry(id),
    });
  };

  return (
    <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING, paddingTop: insets.top + SPACING.xl, paddingBottom: SPACING.xl }}>
      <ScreenHeader title="Fit profile" subtitle={`Learned from ${tracked} garments you own — not a universal size.`} />

      <View style={styles.trendCard}>
        <Eyebrow color="rgba(246,245,242,0.55)">Recent fit trend</Eyebrow>
        <Text style={styles.trendText}>{trend.headline}</Text>
        <Text style={styles.trendNote}>{trend.basis}</Text>
      </View>

      <SectionLabel>What we've learned</SectionLabel>
      <View style={{ gap: SPACING.sm, marginTop: SPACING.md - 1 }}>
        {prefs.length === 0 ? (
          <Card style={{ padding: SPACING.lg }}>
            <Text style={styles.prefText}>Nothing to learn yet</Text>
            <Text style={styles.prefBasis}>Add fit feedback on a few more garments in the same category to see patterns here.</Text>
          </Card>
        ) : (
          prefs.map((p) => (
            <Card key={p.text} style={{ padding: SPACING.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.prefText}>{p.text}</Text>
                <Text style={styles.prefBasis}>{p.basis}</Text>
              </View>
            </Card>
          ))
        )}
      </View>

      <SectionLabel>Comfortable ranges</SectionLabel>
      <Card style={{ paddingHorizontal: SPACING.lg, marginTop: SPACING.md - 1 }}>
        {ranges.map((r, i) => (
          <View key={r.label} style={[styles.rangeRow, i === ranges.length - 1 && { borderBottomWidth: 0 }]}>
            <Text style={styles.rangeLabel}>{r.label}</Text>
            <Text style={styles.rangeVal}>{r.val}</Text>
          </View>
        ))}
      </Card>

      <View style={styles.measureHeaderRow}>
        <SectionLabel top={0} style={{ flex: 1 }}>
          Body measurements <Text style={styles.sectionLabelMuted}>· optional</Text>
        </SectionLabel>
        <UnitToggle units={units} onChange={store.setUnits} />
      </View>
      <Text style={styles.bodySub}>
        Not required — FitCheck compares against garments you own, not your body. Log this only if you want a personal record.
      </Text>
      <MeasurementGrid
        items={BODY_MEASURES.map(([key, label]) => ({
          key,
          label,
          value: bodyDraft[key] ?? '',
          placeholder: latest[key] !== undefined ? formatValue(latest[key] as number, units) : '—',
          onChange: (v) => setBodyField(key, v),
        }))}
      />
      <View style={{ marginTop: SPACING.md }}>
        <PrimaryButton label="Save measurements" onPress={handleSave} />
      </View>

      {bodyMeasurements.length > 0 && (
        <>
          <Pressable
            onPress={() => setShowHistory((s) => !s)}
            hitSlop={8}
            style={{ marginTop: SPACING.md }}
            accessibilityRole="button"
            accessibilityState={{ expanded: showHistory }}
          >
            <Text style={styles.historyToggle}>
              Last recorded {whenLabel(lastEntry.at)} · logged {bodyMeasurements.length} time{bodyMeasurements.length === 1 ? '' : 's'} · {showHistory ? 'hide history' : 'show history'}
            </Text>
          </Pressable>
          <Collapsible open={showHistory}>
            <Card style={{ paddingHorizontal: SPACING.lg, marginTop: SPACING.md }}>
              {[...bodyMeasurements].reverse().map((e, i, arr) => (
                <View key={e.id} style={[styles.historyRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Eyebrow>{whenLabel(e.at)}</Eyebrow>
                    <Text style={styles.historyDetail}>
                      {BODY_MEASURES.filter(([k]) => e.m[k] !== undefined)
                        .map(([k, label]) => `${label} ${formatValue(e.m[k] as number, units)}`)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => confirmDeleteEntry(e.id, whenLabel(e.at))}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove entry from ${whenLabel(e.at)}`}
                  >
                    <Text style={styles.historyRemove}>Remove</Text>
                  </Pressable>
                </View>
              ))}
            </Card>
          </Collapsible>
        </>
      )}

      <View style={styles.privacyCard}>
        <Text style={styles.privacyTitle}>Everything stays on this phone</Text>
        <Text style={styles.privacyBody}>No account, no cloud, no retailer lookups. Measurements and history all stay local.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {['offline', 'no account', 'local photos'].map((b) => (
            <View key={b} style={styles.badge}>
              <Text style={styles.badgeText}>{b}</Text>
            </View>
          ))}
        </View>
      </View>

      <SectionLabel>Back up your closet</SectionLabel>
      <Text style={styles.bodySub}>
        Because everything above lives only on this phone, save a copy before switching devices or
        reinstalling — or import one to restore it. Garment photos aren't included in the file.
      </Text>
      <View style={{ gap: SPACING.sm, marginTop: SPACING.md }}>
        <PrimaryButton
          label={store.backupBusy === 'export' ? 'Preparing backup…' : 'Export backup'}
          onPress={store.exportBackup}
          disabled={store.backupBusy !== null || tracked === 0}
        />
        <SecondaryButton
          label={store.backupBusy === 'import' ? 'Reading file…' : 'Import backup'}
          onPress={store.importBackup}
          disabled={store.backupBusy !== null}
        />
      </View>
      {tracked === 0 && <Text style={styles.bodySub}>Add a garment first — there's nothing to back up yet.</Text>}

      {store.installedVersion && <AppUpdates />}
    </ScrollView>
  );
}

// The only place FitCheck goes online, and only when asked: a tap here, or the
// opt-in daily check. A found update is a quiet line in this section — never a
// badge or dot elsewhere (DESIGN_GUIDELINES.md's app-update decision).
function AppUpdates() {
  const store = useStore();
  const { updateStatus: status, availableUpdate } = store;
  const checking = status === 'checking';

  const statusLine =
    status === 'available' && availableUpdate
      ? `Version ${availableUpdate.version} is available. Installing it over this one keeps your closet.`
      : status === 'current'
        ? "You're on the latest version."
        : status === 'error'
          ? "Couldn't reach GitHub. Check your connection and try again."
          : null;

  return (
    <>
      <SectionLabel>App updates</SectionLabel>
      <Text style={styles.bodySub}>
        You're on version {store.installedVersion}. Checking asks GitHub for the latest release — nothing about
        your closet is sent.
      </Text>
      <View style={{ marginTop: SPACING.md }}>
        {status === 'available' && availableUpdate ? (
          <SecondaryButton label={`Download version ${availableUpdate.version}`} onPress={store.openUpdateDownload} />
        ) : (
          <SecondaryButton label={checking ? 'Checking…' : 'Check for updates'} onPress={store.checkForUpdate} disabled={checking} />
        )}
      </View>
      {statusLine && (
        <Text style={[styles.bodySub, status === 'available' && styles.updateAvailable]} accessibilityLiveRegion="polite">
          {statusLine}
        </Text>
      )}
      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rangeLabel}>Check automatically</Text>
          <Text style={styles.bodySub}>Once a day, when you open FitCheck.</Text>
        </View>
        <Switch
          value={store.autoUpdateCheck}
          onValueChange={store.setAutoUpdateCheck}
          trackColor={{ false: COLORS.border, true: COLORS.ink }}
          thumbColor={COLORS.card}
          accessibilityLabel="Check for updates automatically"
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.lg, minHeight: 44 },
  updateAvailable: { color: COLORS.ink },
  trendCard: { backgroundColor: COLORS.ink, borderRadius: RADII.xl, padding: SPACING.lg, paddingHorizontal: SPACING.xl, marginTop: SPACING.xl - 2 },
  trendText: { color: COLORS.cream, fontSize: 16, lineHeight: 22, marginTop: 9, fontFamily: FONTS.regular },
  trendNote: { color: 'rgba(246,245,242,0.6)', fontSize: 12.5, marginTop: 9, lineHeight: 18, fontFamily: FONTS.regular },
  sectionLabelMuted: { color: COLORS.faintest, letterSpacing: 0.4, textTransform: 'none' },
  measureHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.section },
  prefText: { fontSize: 14.5, fontFamily: FONTS.medium, lineHeight: 19, color: COLORS.ink },
  prefBasis: { fontSize: 12, color: COLORS.muted, marginTop: 4, fontFamily: FONTS.regular },
  rangeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderFaint },
  rangeLabel: { fontSize: 14, color: COLORS.ink, fontFamily: FONTS.regular },
  rangeVal: { fontFamily: FONTS.mono, fontSize: 13.5, color: COLORS.ink },
  bodySub: { fontSize: 12.5, color: COLORS.muted, marginTop: 6, lineHeight: 18, fontFamily: FONTS.regular },
  historyToggle: { fontSize: 12, color: COLORS.muted, fontFamily: FONTS.regular, textDecorationLine: 'underline' },
  historyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderFaint },
  historyDetail: { fontSize: 13, color: COLORS.ink, marginTop: 4, lineHeight: 18, fontFamily: FONTS.regular },
  historyRemove: { fontSize: 12, color: COLORS.bad, fontFamily: FONTS.regular, marginTop: 2 },
  privacyCard: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.borderSoft, borderRadius: RADII.xl, padding: SPACING.lg, marginTop: SPACING.xl - 2 },
  privacyTitle: { fontSize: 14.5, fontFamily: FONTS.semibold, color: COLORS.ink },
  privacyBody: { fontSize: 13, color: '#6E6A60', marginTop: 6, lineHeight: 19, fontFamily: FONTS.regular },
  badge: { backgroundColor: COLORS.ocrBadgeBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  badgeText: { fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: COLORS.good },
});

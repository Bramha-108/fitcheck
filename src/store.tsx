import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Linking } from 'react-native';
import { SQLiteDatabase } from 'expo-sqlite';
import * as Application from 'expo-application';
import { BodyMeasurement, Category, DetectedGarmentInfo, FitCheckDraft, FitCheckResult, FitProfile, Garment, NewGarmentDraft, NgValidationErrors, OnboardingDraft, OnboardingStep, StretchLevel, Units } from './types';
import { ALL_ZONE_KEYS, FITS, OB_SILHOUETTE_TAGS, keysFor } from './data/constants';
import { buildResult } from './engine/compare';
import { computeFitProfile } from './engine/profile';
import { hydrate } from './data/hydrate';
import {
  deleteBodyMeasurement as dbDeleteBodyMeasurement,
  deleteGarment as dbDeleteGarment,
  getDb,
  getOnboarded,
  getSetting,
  getUnits,
  insertBodyMeasurement,
  insertGarment,
  insertObservation,
  loadBodyMeasurements,
  loadGarments,
  replaceAllData,
  setOnboarded as dbSetOnboarded,
  setSetting,
  setUnits as dbSetUnits,
  updateGarment as dbUpdateGarment,
} from './db';
import { deleteGarmentPhoto, localPhotoExists, pickGarmentPhoto } from './utils/photo';
import { BackupFile, BackupParseError, buildBackupFile, pickBackupFile, shareBackupFile } from './utils/backup';
import { convertDraftUnits, displayToCm, formatValue } from './utils/units';
import { AUTO_CHECK_INTERVAL_MS, AvailableUpdate, UpdateCheckError, fetchLatestRelease, isNewerVersion } from './utils/updateCheck';

export type Screen =
  | 'home' | 'closet' | 'detail' | 'add' | 'addManual'
  | 'fitcheck' | 'result' | 'profile';

const FOCUSED_WORKFLOW_SCREENS: ReadonlySet<Screen> = new Set(['detail', 'add', 'addManual', 'result']);

export interface Rect { x: number; y: number; width: number; height: number }
export interface PhotoTransition { garmentId: number; uri: string; from: Rect; to: Rect | null }

/** Screens that are a focused, single-task workflow rather than one of the four
 * top-level browsing destinations — these hide the global tab bar (FitCheck
 * Mobile UX Guideline #5/#14) since each already carries its own way back
 * (BackRow or an in-photo back button), so nothing is lost by hiding it. */
export function isFocusedWorkflow(screen: Screen): boolean {
  return FOCUSED_WORKFLOW_SCREENS.has(screen);
}

// Deliberately blank, not a plausible-looking example set of numbers — a FitCheck
// comparison must run only on measurements the user actually typed. Ghost-text
// placeholders (fed from the category's own reference garment) already show the
// user what a typical value looks like without it silently counting as real input
// (see FitCheckScreen.tsx's `placeholder={ref?.m[key] ...}`, and DESIGN_GUIDELINES.md's
// "Never confuse missing information with inferred information").
const DEFAULT_FC: FitCheckDraft = { category: 'tops', size: '', fit: '', silhouette: '' };

const EMPTY_NG: NewGarmentDraft = {
  id: null, brand: '', name: '', category: 'tops', size: '', fit: '', silhouette: '', stretch: 'Some stretch', notes: '', tags: [], photo: null, m: {}, verdict: '',
};

const EMPTY_OB: OnboardingDraft = { cat: 'tops', brand: '', name: '', size: '', m: {}, verdict: '', tags: [], note: '' };

/** A pending destructive-action confirmation (Detail's "Remove from closet",
 * Profile's "Remove entry") — see components/ConfirmDialog.tsx for why this
 * replaced Alert.alert, which react-native-web doesn't implement. */
export interface ConfirmRequest {
  title: string;
  message: string;
  cancelLabel?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

// garments.id is a plain (non-autoincrement) SQLite PRIMARY KEY, so it has to be
// unique on its own — plain `Date.now()` collides if two garments are ever created
// within the same millisecond (a fast programmatic save, a future bulk-import
// feature), which would throw on insert and silently drop the save. A counter
// seeded once at module load and incremented per call is monotonic for the whole
// session, so two calls can never return the same value no matter how close
// together they happen.
let idCounter = Date.now();
function generateId(): number {
  idCounter += 1;
  return idCounter;
}

/** Only digits and a single decimal point — keeps measurement inputs numeric without blocking mid-typing states like "5." */
export function sanitizeNumeric(v: string): string {
  const cleaned = v.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}

interface Store {
  ready: boolean;
  /** Set only if the initial database load itself fails (corrupt file, disk
   * full, migration error) — distinct from `ready`, so Shell can render an
   * honest "something went wrong opening your data" state with a retry instead
   * of a blank screen forever (see DESIGN_GUIDELINES.md's "Never hide system
   * state" — a stuck blank screen is exactly that, just silent). */
  initError: string | null;
  retryInit: () => void;
  screen: Screen;
  garments: Garment[];
  selectedId: number;
  filter: string;
  closetFit: string | null;
  closetSearch: string;
  toast: string | null;
  confirmRequest: ConfirmRequest | null;
  confirm: (req: ConfirmRequest) => void;
  cancelConfirm: () => void;
  confirmAction: () => void;
  sheetOpen: boolean;
  sArea: string;
  sVerdict: string;
  sLook: string;
  sComfortNote: string;
  ng: NewGarmentDraft;
  /** Which required fields blocked the last save attempt, or null if the draft
   * hasn't been submitted yet / passed validation. Cleared on every edit so it
   * only ever reflects the most recent attempt. */
  ngErrors: NgValidationErrors | null;
  ngFitsOpen: boolean;
  fc: FitCheckDraft;
  fcFitsOpen: boolean;
  result: FitCheckResult | null;
  /** Why `result` is null when it is — Result screen needs this to show an
   * honest, specific empty state instead of rendering nothing. */
  noResultReason: 'noGarments' | 'noCategoryGarments' | 'noMeasurements' | 'noOverlap' | null;
  /** The id of the garment just created by `saveGarment`, so Closet can give it
   * a one-time entrance animation instead of just appearing. Cleared by
   * `clearJustSaved` once that's played. */
  justSavedId: number | null;
  clearJustSaved: () => void;
  /** A snapshot of the garment just removed by `deleteGarmentById`, so Closet can
   * render one exiting tile that shrinks/fades away instead of the grid just
   * silently being one item shorter. A full snapshot (not just an id) because by
   * the time Closet mounts, the garment is already gone from `garments`. Cleared
   * by `clearJustDeleted` once that's played. */
  justDeletedGarment: Garment | null;
  clearJustDeleted: () => void;
  units: Units;
  profile: FitProfile;
  bodyMeasurements: BodyMeasurement[];

  obStep: OnboardingStep | null;
  ob: OnboardingDraft;
  /** A simulated on-device "scan" result offered as ghost placeholder text on
   * Onboarding's own photo/screenshot method — never written into `ob` itself,
   * so it can never be silently saved without the user actually typing it. */
  obSuggested: DetectedGarmentInfo | null;
  ob2: Record<string, string>;
  obFocus: string;
  /** Which required identity fields blocked the last "Continue" attempt on
   * onboarding's form step — same shape/purpose as `ngErrors`. */
  obErrors: NgValidationErrors | null;
  obStart: () => void;
  obExplore: () => Promise<void>;
  obPickMethod: (key: string) => void;
  obSet: (k: keyof OnboardingDraft, v: string) => void;
  obSetM: (k: string, v: string) => void;
  obFocusM: (k: string) => void;
  obBlurM: () => void;
  obSetCat: (cat: Category) => void;
  obSaveGarment: () => void;
  obSetVerdict: (v: string) => void;
  obToggleTag: (tag: string) => void;
  obSaveFit: () => Promise<void>;
  obToCompare: () => void;
  obSet2M: (k: string, v: string) => void;
  obCompare: () => void;
  obToOutro: () => void;
  obFinish: () => Promise<void>;

  go: (to: Screen) => void;
  back: () => void;
  openGarment: (id: number) => void;
  /** In-flight Closet-tile → Detail-hero photo transition, or null when none is
   * running. `to` is null until Detail mounts and reports its own hero rect —
   * `PhotoTransitionOverlay` renders the floating image pinned at `from` in the
   * meantime, then animates it to `to` once both are known. */
  photoTransition: PhotoTransition | null;
  beginPhotoTransition: (garmentId: number, uri: string, from: Rect) => void;
  reportPhotoTransitionTarget: (garmentId: number, to: Rect) => void;
  clearPhotoTransition: () => void;
  setFilter: (v: string) => void;
  clearFilter: () => void;
  setClosetFit: (fit: string) => void;
  setClosetSearch: (v: string) => void;
  dismissToast: () => void;
  showToast: (msg: string) => void;
  toggleUnits: () => void;
  setUnits: (next: Units) => void;
  /** Resolves true on success, false on a failed write — callers that clear
   * their own local draft after saving (ProfileScreen.tsx's body-measurement
   * form) must check this rather than assuming the write succeeded, or a
   * failed save silently discards what the user typed. */
  saveBodyMeasurement: (m: Record<string, string>) => Promise<boolean>;
  deleteBodyMeasurementEntry: (id: number) => Promise<void>;

  setFc: (k: string, v: string) => void;
  setFcCategory: (cat: Category) => void;
  toggleFcFits: () => void;
  runCheck: () => void;

  setNg: (k: keyof NewGarmentDraft, v: string) => void;
  setNgMeasure: (k: string, v: string) => void;
  setNgCategory: (cat: Category) => void;
  setNgFit: (fit: string) => void;
  setNgStretch: (stretch: StretchLevel) => void;
  toggleNgFits: () => void;
  toggleTag: (tag: string) => void;
  saveGarment: () => Promise<void>;
  loadEditGarment: (id: number) => void;
  startGarmentFromResult: () => void;
  pickNgPhoto: () => Promise<void>;
  deleteGarmentById: (id: number) => Promise<void>;

  openSheet: () => void;
  closeSheet: () => void;
  setSheetArea: (v: string) => void;
  setSheetVerdict: (v: string) => void;
  setSheetLook: (v: string) => void;
  setSheetComfortNote: (v: string) => void;
  saveFit: () => Promise<void>;

  /** Which backup operation is in flight, or null when idle — Profile's Export/
   * Import buttons disable and relabel off this rather than leaving a tap with
   * no visible response (Screen checklist #22). */
  backupBusy: 'export' | 'import' | null;
  exportBackup: () => Promise<void>;
  importBackup: () => Promise<void>;

  /** The installed app's version, or null where there isn't one (web) — Profile
   * only shows the App updates section when this is set. */
  installedVersion: string | null;
  updateStatus: UpdateStatus;
  /** Why the last user-initiated check failed — only meaningful when updateStatus is 'error'. */
  updateError: UpdateCheckError['kind'] | null;
  availableUpdate: AvailableUpdate | null;
  /** Opt-in, off by default: check GitHub at most once a day on launch. */
  autoUpdateCheck: boolean;
  checkForUpdate: () => Promise<void>;
  setAutoUpdateCheck: (on: boolean) => void;
  openUpdateDownload: () => void;
}

/** idle = not checked this session · current = checked, nothing newer ·
 * error = a check the user asked for failed (automatic checks fail quietly). */
export type UpdateStatus = 'idle' | 'checking' | 'current' | 'available' | 'error';

const SETTING_AUTO_UPDATE = 'updates.auto';
const SETTING_LAST_UPDATE_CHECK = 'updates.lastCheck';
const SETTING_AVAILABLE_UPDATE = 'updates.available';
const INSTALLED_VERSION = Application.nativeApplicationVersion ?? null;

const StoreContext = createContext<Store | null>(null);

function draftFromGarment(g: Garment, units: Units): NewGarmentDraft {
  const m: Record<string, string> = {};
  Object.keys(g.m).forEach((k) => {
    const v = g.m[k as keyof typeof g.m];
    // Always derived fresh from the canonical cm value on the garment record,
    // never from a previously-displayed draft — this is the one hop from storage
    // to display unit, so re-opening for edit can never drift or compound rounding.
    if (v !== undefined) m[k] = formatValue(v, units);
  });
  return {
    id: g.id, brand: g.brand, name: g.name, category: g.cat, size: g.size, fit: g.fit,
    // Prefill with the garment's current visual-preference note so editing shows
    // what's actually stored, not a blank field — the placeholder fallback reads
    // as "nothing recorded" so it's excluded rather than shown as editable text.
    silhouette: g.sil, stretch: g.stretch, notes: g.visual === 'No visual note yet.' ? '' : g.visual, tags: g.tags, photo: g.photo, m,
    // Editing never re-asks "how does this fit" — that's FitSheet's job (Detail's
    // "Update how it fits"), which appends its own timestamped entry.
    verdict: '',
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [initAttempt, setInitAttempt] = useState(0);
  const retryInit = () => {
    setInitError(null);
    setInitAttempt((n) => n + 1);
  };
  const [screen, setScreen] = useState<Screen>('home');
  const [history, setHistory] = useState<Screen[]>([]);
  const [garments, setGarments] = useState<Garment[]>([]);
  const [selectedId, setSelectedId] = useState(1);
  const [filter, setFilterState] = useState('All');
  const [closetFit, setClosetFitState] = useState<string | null>(null);
  const [closetSearch, setClosetSearchState] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const confirm = (req: ConfirmRequest) => setConfirmRequest(req);
  const cancelConfirm = () => setConfirmRequest(null);
  const confirmAction = () => {
    const req = confirmRequest;
    setConfirmRequest(null);
    req?.onConfirm();
  };
  const [sheetOpen, setSheetOpen] = useState(false);
  // Every fit update starts blank — no area, verdict, or visual note the user
  // didn't pick (DESIGN_GUIDELINES.md's Measurement integrity). A pre-selected
  // "Good at the shoulder" would be saved as a real observation by a user who
  // only meant to add a note.
  const [sArea, setSArea] = useState('');
  const [sVerdict, setSVerdict] = useState('');
  const [sLook, setSLook] = useState('');
  const [sComfortNote, setSComfortNote] = useState('');
  const [ng, setNgState] = useState<NewGarmentDraft>(EMPTY_NG);
  const [ngErrors, setNgErrors] = useState<NgValidationErrors | null>(null);
  const [ngFitsOpen, setNgFitsOpen] = useState(false);
  const [fc, setFcState] = useState<FitCheckDraft>(DEFAULT_FC);
  const [fcFitsOpen, setFcFitsOpen] = useState(false);
  const [result, setResult] = useState<FitCheckResult | null>(null);
  const [noResultReason, setNoResultReason] = useState<Store['noResultReason']>(null);
  const [justSavedId, setJustSavedId] = useState<number | null>(null);
  const clearJustSaved = () => setJustSavedId(null);
  const [justDeletedGarment, setJustDeletedGarment] = useState<Garment | null>(null);
  const clearJustDeleted = () => setJustDeletedGarment(null);
  const [units, setUnitsState] = useState<Units>('cm');
  const [bodyMeasurements, setBodyMeasurements] = useState<BodyMeasurement[]>([]);
  const [obStep, setObStep] = useState<OnboardingStep | null>(null);
  const [ob, setObState] = useState<OnboardingDraft>(EMPTY_OB);
  const [obSuggested, setObSuggested] = useState<DetectedGarmentInfo | null>(null);
  const [ob2, setOb2State] = useState<Record<string, string>>({});
  const [obFocus, setObFocus] = useState('');
  const [obErrors, setObErrors] = useState<NgValidationErrors | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dbRef = useRef<SQLiteDatabase | null>(null);
  const [backupBusy, setBackupBusy] = useState<'export' | 'import' | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateError, setUpdateError] = useState<UpdateCheckError['kind'] | null>(null);
  const [availableUpdate, setAvailableUpdateState] = useState<AvailableUpdate | null>(null);
  // Mirrors availableUpdate for async callbacks that outlive the render they
  // started in (a failed automatic check restores 'available' from this).
  const availableUpdateRef = useRef<AvailableUpdate | null>(null);
  const setAvailableUpdate = (u: AvailableUpdate | null) => {
    availableUpdateRef.current = u;
    setAvailableUpdateState(u);
  };
  const [autoUpdateCheck, setAutoUpdateCheckState] = useState(false);
  const checkingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getDb();
        dbRef.current = db;
        const [gs, u, bm, onboarded] = await Promise.all([loadGarments(db), getUnits(db), loadBodyMeasurements(db), getOnboarded(db)]);
        if (cancelled) return;
        setGarments(gs);
        setUnitsState(u);
        setBodyMeasurements(bm);
        setNgState(EMPTY_NG);
        if (gs.length) setSelectedId(gs[0].id);
        if (!onboarded) setObStep('welcome');
        setReady(true);
        initUpdates(db);
      } catch {
        // A failed open/read here means the app has no data to show at all —
        // never leave Shell's `!ready` branch rendering an unexplained blank
        // screen forever (see DESIGN_GUIDELINES.md's Known failure patterns:
        // "Blank Result screen" is the same mistake, one level up the stack).
        if (!cancelled) setInitError("Couldn't open your closet data.");
      }
    })();
    return () => { cancelled = true; };
  }, [initAttempt]);

  const profile = useMemo(() => computeFitProfile(garments, units), [garments, units]);

  // App updates (utils/updateCheck.ts): the only network access FitCheck has,
  // and only on the user's say-so — a tap on "Check for updates", or the opt-in
  // daily check. Settings persistence here is best-effort: failing to remember
  // a timestamp must never surface as an error for something the user didn't do.
  const persistSetting = (key: string, value: string) => {
    const db = dbRef.current;
    if (db) setSetting(db, key, value).catch(() => {});
  };

  const lastUpdateCheckDue = async (db: SQLiteDatabase) =>
    Date.now() - Number((await getSetting(db, SETTING_LAST_UPDATE_CHECK)) ?? 0) >= AUTO_CHECK_INTERVAL_MS;

  // `userInitiated` decides whether a failure is shown: an automatic check that
  // can't reach GitHub (offline, say) stays silent and keeps whatever was known.
  const runUpdateCheck = async (userInitiated: boolean) => {
    if (!INSTALLED_VERSION || checkingRef.current) return;
    checkingRef.current = true;
    setUpdateStatus('checking');
    setUpdateError(null);
    try {
      const latest = await fetchLatestRelease();
      persistSetting(SETTING_LAST_UPDATE_CHECK, String(Date.now()));
      if (isNewerVersion(latest.version, INSTALLED_VERSION)) {
        setAvailableUpdate(latest);
        setUpdateStatus('available');
        persistSetting(SETTING_AVAILABLE_UPDATE, JSON.stringify(latest));
      } else {
        setAvailableUpdate(null);
        setUpdateStatus('current');
        persistSetting(SETTING_AVAILABLE_UPDATE, '');
      }
    } catch (e) {
      setUpdateError(e instanceof UpdateCheckError ? e.kind : 'server');
      setUpdateStatus(availableUpdateRef.current ? 'available' : userInitiated ? 'error' : 'idle');
    } finally {
      checkingRef.current = false;
    }
  };
  const checkForUpdate = () => runUpdateCheck(true);

  const initUpdates = async (db: SQLiteDatabase) => {
    if (!INSTALLED_VERSION) return;
    try {
      const [auto, saved] = await Promise.all([getSetting(db, SETTING_AUTO_UPDATE), getSetting(db, SETTING_AVAILABLE_UPDATE)]);
      setAutoUpdateCheckState(auto === '1');
      // A previously found update stays visible across launches — until the user
      // has installed it (or anything newer), at which point it's dropped.
      let parsed: AvailableUpdate | null = null;
      try { parsed = saved ? (JSON.parse(saved) as AvailableUpdate) : null; } catch { parsed = null; }
      if (parsed && typeof parsed.url === 'string' && parsed.url.startsWith('https://github.com/') && isNewerVersion(parsed.version, INSTALLED_VERSION)) {
        setAvailableUpdate(parsed);
        setUpdateStatus('available');
      } else if (saved) {
        persistSetting(SETTING_AVAILABLE_UPDATE, '');
      }
      if (auto === '1' && (await lastUpdateCheckDue(db))) runUpdateCheck(false);
    } catch {
      // Update bookkeeping is never worth blocking or erroring the app over.
    }
  };

  const setAutoUpdateCheck = (on: boolean) => {
    setAutoUpdateCheckState(on);
    persistSetting(SETTING_AUTO_UPDATE, on ? '1' : '0');
    // Turning it on checks right away if a check is due, rather than waiting
    // for the next launch to do anything visible.
    const db = dbRef.current;
    if (on && db) lastUpdateCheckDue(db).then((due) => { if (due) runUpdateCheck(false); }).catch(() => {});
  };

  const openUpdateDownload = () => {
    if (!availableUpdate) return;
    Linking.openURL(availableUpdate.url).catch(() => showToast("Couldn't open the download link."));
  };

  const refresh = async () => {
    const db = dbRef.current;
    if (!db) return;
    setGarments(await loadGarments(db));
  };

  const refreshBody = async () => {
    const db = dbRef.current;
    if (!db) return;
    setBodyMeasurements(await loadBodyMeasurements(db));
  };

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  };

  // Real back-stack (not a fixed screen->screen map) so Back always lands on
  // wherever the user actually came from, however they got there — within a
  // flow. The four top-level destinations are roots, not stack entries: going to
  // one (tab tap, swipe, or an in-screen link like Home's "Run a FitCheck")
  // clears the stack, so Back from any of them lands on Home and then exits,
  // instead of replaying every tab the user happened to visit on the way.
  const go = (to: Screen) => {
    if (!isFocusedWorkflow(to)) setHistory([]);
    else if (to !== screen) setHistory((h) => [...h, screen]);
    setScreen(to);
    setToast(null);
    if (to === 'addManual' && ng.id == null) {
      setNgState(EMPTY_NG);
      setNgErrors(null);
    }
  };
  const back = () => {
    setToast(null);
    if (history.length === 0) {
      // Not truly at the root screen — land there instead of exiting.
      if (screen !== 'home') setScreen('home');
      return;
    }
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setScreen(prev);
  };
  // A just-finished sub-flow (add garment, delete) shouldn't leave stale steps on
  // the stack for a later Back to land on, so this clears history rather than pushing.
  const finishFlowTo = (to: Screen) => {
    setHistory([]);
    setScreen(to);
    setToast(null);
  };
  const openGarment = (id: number) => {
    setSelectedId(id);
    if (screen !== 'detail') setHistory((h) => [...h, screen]);
    setScreen('detail');
  };

  const [photoTransition, setPhotoTransition] = useState<PhotoTransition | null>(null);
  const beginPhotoTransition = (garmentId: number, uri: string, from: Rect) => {
    setPhotoTransition({ garmentId, uri, from, to: null });
  };
  const reportPhotoTransitionTarget = (garmentId: number, to: Rect) => {
    setPhotoTransition((pt) => (pt && pt.garmentId === garmentId ? { ...pt, to } : pt));
  };
  const clearPhotoTransition = () => setPhotoTransition(null);

  // Hardware/gesture back: unwind the app's own stack first, only falling through
  // to the platform default (exit) once we're actually at the home root.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Onboarding is a linear, forward-only wizard with no in-flow back button
      // (matching the design) — hardware back dismisses it the same way "Explore
      // first"/"Skip" does, rather than stepping backward through it or exiting.
      if (obStep) {
        obExplore();
        return true;
      }
      if (sheetOpen) {
        setSheetOpen(false);
        return true;
      }
      if (history.length > 0) {
        back();
        return true;
      }
      if (screen !== 'home') {
        setScreen('home');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [obStep, sheetOpen, history, screen]);
  // Fit-type vocabulary is category-specific (FITS.pants !== FITS.tops), so switching the
  // top-level category/mode filter clears any fit-type refinement rather than leaving a
  // now-meaningless selection active.
  const setFilter = (v: string) => {
    setFilterState(v);
    setClosetFitState(null);
  };
  const clearFilter = () => {
    setFilterState('All');
    setClosetFitState(null);
    setClosetSearchState('');
  };
  const setClosetFit = (fit: string) => setClosetFitState((s) => (s === fit ? null : fit));
  const setClosetSearch = (v: string) => setClosetSearchState(v);
  const dismissToast = () => setToast(null);

  // Garment records are always stored in cm (types/index.ts), so switching the
  // display unit never touches saved data. It DOES need to update whatever the
  // user is mid-typing right now — every in-progress draft that stores raw display-
  // unit strings (fitcheck entry, add/edit garment, onboarding's two measurement
  // steps) — otherwise the number on screen stays the same while its unit label
  // silently changes underneath it, which would misrepresent what was entered.
  const applyUnits = async (next: Units) => {
    if (next === units) return;
    setFcState((s) => ({ ...s, ...convertDraftUnits(s as unknown as Record<string, string>, units, next, ALL_ZONE_KEYS) } as FitCheckDraft));
    setNgState((s) => ({ ...s, m: convertDraftUnits(s.m, units, next) }));
    setObState((s) => ({ ...s, m: convertDraftUnits(s.m, units, next) }));
    setOb2State((s) => convertDraftUnits(s, units, next));
    setUnitsState(next);
    const db = dbRef.current;
    if (!db) return;
    try {
      await dbSetUnits(db, next);
    } catch {
      // Never hide a failed write (DESIGN_GUIDELINES.md) — the display already
      // switched, so this only affects what's remembered next launch.
      showToast("Couldn't save your unit preference — it may reset next time you open the app.");
    }
  };
  const toggleUnits = () => applyUnits(units === 'cm' ? 'in' : 'cm');
  const setUnits = (next: Units) => applyUnits(next);

  // Entirely separate from garment fit data — a personal log the user can keep if
  // they want one, not something FitCheck's matching reads from (see the note on
  // BodyMeasurement in src/types/index.ts for why).
  const saveBodyMeasurement = async (m: Record<string, string>): Promise<boolean> => {
    const db = dbRef.current;
    if (!db) return false;
    const cm: Record<string, number> = {};
    Object.keys(m).forEach((k) => {
      if (m[k] !== '') {
        const n = Number(m[k]);
        if (!Number.isNaN(n)) cm[k] = displayToCm(n, units);
      }
    });
    if (!Object.keys(cm).length) {
      showToast('Enter at least one measurement first.');
      return false;
    }
    try {
      await insertBodyMeasurement(db, { at: Date.now(), m: cm });
      await refreshBody();
      showToast('Body measurements saved.');
      return true;
    } catch {
      showToast("Couldn't save that — try again.");
      return false;
    }
  };

  const deleteBodyMeasurementEntry = async (id: number) => {
    const db = dbRef.current;
    if (!db) return;
    try {
      await dbDeleteBodyMeasurement(db, id);
      await refreshBody();
      showToast('Entry removed.');
    } catch {
      showToast("Couldn't remove that — try again.");
    }
  };

  const setFc = (k: string, v: string) => setFcState((s) => ({ ...s, [k]: v }));
  // A full replace, not a merge — switching category must not carry the previous
  // category's typed measurements/fit/silhouette forward under new zone keys.
  const setFcCategory = (cat: Category) => {
    setFcState({ category: cat, size: '', fit: '', silhouette: '' });
    setFcFitsOpen(false);
  };
  const toggleFcFits = () => setFcFitsOpen(true);
  // Runs the comparison immediately — no artificial delay, no "Comparing…" state.
  // buildResult() is a deterministic, local computation; padding it with a fixed
  // setTimeout (or a loading label) just to make the wait feel earned would be
  // exactly the "artificial pause instead of a crafted experience" this was fixed
  // to remove. Whatever perceived motion the comparison needs comes from Result
  // screen's own staged reveal on mount, not from delaying navigation to it.
  const runCheck = () => {
    const labels: Record<string, string> = {};
    keysFor(fc.category).forEach(([k, l]) => { labels[k] = l; });
    const fcCm: FitCheckDraft = { ...fc };
    keysFor(fc.category).forEach(([k]) => {
      const raw = fc[k];
      if (typeof raw === 'string' && raw !== '') {
        const n = Number(raw);
        if (!Number.isNaN(n)) fcCm[k] = String(displayToCm(n, units));
      }
    });
    const built = buildResult(fcCm, garments, labels);
    setResult(built);
    if (built) {
      setNoResultReason(null);
    } else {
      // Mirrors compare()'s own null conditions (engine/compare.ts) so the
      // empty state on Result names the actual cause instead of a blank screen.
      // Four distinct causes, not three — compare() only requires a candidate to
      // share at least one typed zone now (not every one), so "you have category
      // garments but none share any zone you typed" is a real, separate case from
      // "you typed nothing at all." Conflating them was exactly §3.3's bug: a user
      // who'd already entered measurements was told to "enter at least one."
      const categoryPool = garments.filter((g) => g.cat === fc.category);
      const keys = keysFor(fc.category)
        .map(([k]) => k)
        .filter((k) => fcCm[k] !== undefined && fcCm[k] !== '');
      // If we're here with keys.length > 0 and categoryPool.length > 0, compare()
      // must have found zero candidates sharing any typed zone — that's the only
      // remaining way it returns null (see engine/compare.ts's compare()).
      setNoResultReason(
        garments.length === 0
          ? 'noGarments'
          : categoryPool.length === 0
            ? 'noCategoryGarments'
            : keys.length === 0
              ? 'noMeasurements'
              : 'noOverlap'
      );
    }
    setHistory((h) => [...h, screen]);
    setScreen('result');
  };

  const setNg = (k: keyof NewGarmentDraft, v: string) => {
    setNgState((s) => ({ ...s, [k]: v } as NewGarmentDraft));
    setNgErrors(null);
  };
  const setNgMeasure = (k: string, v: string) => {
    setNgState((s) => ({ ...s, m: { ...s.m, [k]: sanitizeNumeric(v) } }));
    setNgErrors(null);
  };
  const setNgCategory = (cat: Category) => {
    // Drop any measurement typed under the old category's zone keys — e.g. a
    // chest value entered while category was "tops" must not silently ride along
    // into a "pants" garment record just because the draft object still has the
    // key (see DESIGN_GUIDELINES.md's "Never confuse missing information with
    // inferred information"). Fit/silhouette are cleared for the same reason —
    // FITS.pants isn't FITS.tops, so a fit chip picked under the old category
    // is meaningless (and, per Measurement integrity, must never survive as a
    // silent selection) under the new one. Nothing here re-seeds a replacement
    // value from the user's other garments — AddManualScreen's own `seedNewGarment`
    // call offers that as a ghost placeholder hint only, never a real `value`.
    const validKeys = new Set<string>(keysFor(cat).map(([k]) => k));
    setNgState((s) => ({
      ...s,
      category: cat,
      fit: '',
      silhouette: '',
      m: Object.fromEntries(Object.entries(s.m).filter(([k]) => validKeys.has(k))),
    }));
    setNgFitsOpen(false);
    setNgErrors(null);
  };
  const setNgFit = (fit: string) => setNgState((s) => ({ ...s, fit }));
  const setNgStretch = (stretch: StretchLevel) => setNgState((s) => ({ ...s, stretch }));
  const toggleNgFits = () => setNgFitsOpen(true);
  const toggleTag = (tag: string) =>
    setNgState((s) => ({
      ...s,
      tags: s.tags.includes(tag) ? s.tags.filter((t) => t !== tag) : [...s.tags, tag],
    }));

  const loadEditGarment = (id: number) => {
    const g = garments.find((x) => x.id === id);
    if (!g) return;
    setNgState(draftFromGarment(g, units));
    setNgFitsOpen(false);
    setNgErrors(null);
    setHistory((h) => [...h, screen]);
    setScreen('addManual');
  };

  const startGarmentFromResult = () => {
    // fc.size/fit/silhouette are real values the user typed on the FitCheck
    // entry form for this exact comparison, so carrying them forward here isn't
    // fabrication — brand/name still start blank since nothing the user entered
    // speaks to those.
    const m: Record<string, string> = {};
    keysFor(fc.category).forEach(([k]) => {
      const raw = fc[k];
      if (typeof raw === 'string' && raw !== '') m[k] = raw;
    });
    setNgState({
      id: null, brand: '', name: '', category: fc.category, size: fc.size, fit: fc.fit,
      silhouette: fc.silhouette, stretch: 'Some stretch', notes: '', tags: [], photo: null, m, verdict: '',
    });
    setNgFitsOpen(false);
    setNgErrors(null);
    setHistory((h) => [...h, screen]);
    setScreen('addManual');
  };

  const pickNgPhoto = async () => {
    try {
      const uri = await pickGarmentPhoto();
      if (uri) setNgState((s) => ({ ...s, photo: uri }));
    } catch {
      showToast("Couldn't open the photo library.");
    }
  };

  // Garment name, brand, size, and at least one measurement are the minimum
  // meaningful identity for a fit record — see DESIGN_GUIDELINES.md's Measurement
  // integrity. A garment saved without them can't be found by search/brand later,
  // and an unmeasured one can never be compared against. Category can't actually
  // be "missing" — it's a mutually-exclusive chip picker that always holds one
  // of its three values — so it isn't checked here.
  const validateNg = (draft: NewGarmentDraft): NgValidationErrors | null => {
    const errors: NgValidationErrors = {};
    if (!draft.brand.trim()) errors.brand = true;
    if (!draft.name.trim()) errors.name = true;
    if (!draft.size.trim()) errors.size = true;
    if (!Object.values(draft.m).some((v) => v.trim() !== '')) errors.measurements = true;
    return Object.keys(errors).length ? errors : null;
  };

  const saveGarment = async () => {
    const db = dbRef.current;
    if (!db) return;

    const errors = validateNg(ng);
    if (errors) {
      // Reject the save outright rather than padding the missing fields with a
      // fallback value — the draft (everything already typed) is left exactly
      // as-is so the user only has to fill in what's actually missing.
      setNgErrors(errors);
      showToast('Add the missing details before saving.');
      return;
    }
    setNgErrors(null);

    const m: Record<string, number> = {};
    Object.keys(ng.m).forEach((k) => {
      if (ng.m[k] !== '') {
        const n = Number(ng.m[k]);
        if (!Number.isNaN(n)) m[k] = displayToCm(n, units);
      }
    });

    // Wraps both branches below — a failed write must never silently leave the
    // user thinking their garment saved when it didn't (DESIGN_GUIDELINES.md's
    // "never hide system state"). The draft is left exactly as typed on failure
    // so the user can just try again, same as the validation-rejection path above.
    try {
      if (ng.id != null) {
        const existing = garments.find((g) => g.id === ng.id);
        if (!existing) return;
        const updated: Garment = {
          ...existing,
          brand: ng.brand.trim(),
          name: ng.name.trim(),
          cat: ng.category,
          size: ng.size.trim(),
          // '—' (never 'Regular') for an unselected Fit Type — a fabricated default
          // here would be treated as real evidence by engine/compare.ts's fit-match
          // and preference scoring. See DESIGN_GUIDELINES.md's Measurement integrity.
          // Fit type stays genuinely optional — unlike brand/name/size above, it's
          // not required to save.
          fit: ng.fit || '—',
          sil: ng.silhouette || '—',
          stretch: ng.stretch,
          tags: ng.tags,
          m,
          visual: ng.notes.trim() || 'No visual note yet.',
          photo: ng.photo,
        };
        await dbUpdateGarment(db, updated);
        // The old photo file is orphaned the moment the record points at a new
        // one — nothing else on disk still references it, so it never gets
        // reclaimed unless we delete it here (see DESIGN_GUIDELINES.md audit
        // finding on unbounded local storage growth).
        if (existing.photo && existing.photo !== updated.photo) deleteGarmentPhoto(existing.photo);
        await refresh();
        setSelectedId(ng.id);
        back();
        showToast('Garment updated.');
        return;
      }

      const id = generateId();
      const draft: Garment = hydrate(
        {
          id,
          brand: ng.brand.trim(),
          name: ng.name.trim(),
          cat: ng.category,
          size: ng.size.trim(),
          // Same "never fabricate a fit type" rule as the update path above.
          fit: ng.fit || '—',
          sil: ng.silhouette || '—',
          stretch: ng.stretch,
          tags: ng.tags,
          cap: 'garment photo',
          bg: ['#E3E0DA', '#EDEAE4'],
          m,
          visual: ng.notes.trim() || 'No visual note yet.',
          photo: ng.photo,
          createdAt: Date.now(),
        },
        []
      );
      await insertGarment(db, draft);
      // Same rule as onboarding's obSaveFit: a holistic "Fits great" verdict is the
      // only one unambiguous enough to translate into a per-zone Good comfort read
      // (every zone actually measured) — "Fits okay"/"Doesn't fit" can't be turned
      // into a direction (tight vs. loose) without guessing, so they're recorded as
      // the note only, never a fabricated per-zone verdict. Answering nothing keeps
      // today's behavior exactly (comfort: [], generic note) — this step is optional.
      const verdictComfort = ng.verdict === 'Fits great'
        ? keysFor(ng.category).filter(([k]) => m[k] !== undefined).map(([, area]) => ({ area, verdict: 'Good' as const }))
        : [];
      await insertObservation(db, { garmentId: id, at: draft.createdAt, note: ng.verdict || 'Added to closet', comfort: verdictComfort });
      const count = garments.length + 1;
      await refresh();
      setJustSavedId(id);
      finishFlowTo('closet');
      // setFilterState directly, not setFilter — a stale closetFit sub-filter
      // (e.g. Pants → Slim) would otherwise keep silently filtering this list
      // with no chip visible to explain or clear it, since fit chips only
      // render for the Tops/Pants/Jackets filters, not "Recently added".
      setFilterState('Recently added');
      setClosetFitState(null);
      showToast(`Saved. That makes ${count} garments — your ${ng.category} comparisons just got stronger.`);
      setNgState(EMPTY_NG);
    } catch {
      showToast("Couldn't save — try again.");
    }
  };

  const deleteGarmentById = async (id: number) => {
    const db = dbRef.current;
    if (!db) return;
    const snapshot = garments.find((x) => x.id === id) ?? null;
    setJustDeletedGarment(snapshot);
    try {
      await dbDeleteGarment(db, id);
      // Nothing else references this file once the record's gone — reclaim it
      // rather than leaving it an orphan (see DESIGN_GUIDELINES.md audit finding
      // on unbounded local storage growth).
      deleteGarmentPhoto(snapshot?.photo);
      await refresh();
      finishFlowTo('closet');
      showToast('Garment removed.');
    } catch {
      // The garment is still there — undo the optimistic exit-animation
      // snapshot above so Closet doesn't render a ghost tile for a delete
      // that never actually happened.
      setJustDeletedGarment(null);
      showToast("Couldn't remove that — try again.");
    }
  };

  // ── onboarding ──
  const obStart = () => setObStep('pick');
  const obExplore = async () => {
    setObStep(null);
    setObSuggested(null);
    finishFlowTo('closet');
    const db = dbRef.current;
    if (!db) return;
    try {
      await dbSetOnboarded(db, true);
    } catch {
      showToast("Couldn't save that — you may see this again next time.");
    }
  };
  const obPickMethod = (key: string) => {
    // A UI-only simulation (no real photo/screenshot extraction in v1), so its
    // result is offered as a ghost placeholder on the form below, never written
    // into `ob` as if the user had actually typed or confirmed it.
    if (key !== 'manual') {
      setObSuggested({ brand: 'Uniqlo', name: 'Linen Blend Shirt', size: 'L', m: { chest: '54', shoulder: '45', length: '70' } });
      showToast(key === 'photo' ? 'Read from your photo — on device.' : 'Read from your screenshot — on device.');
    } else {
      setObSuggested(null);
    }
    setObStep('form');
  };
  const obSet = (k: keyof OnboardingDraft, v: string) => {
    setObState((s) => ({ ...s, [k]: v } as OnboardingDraft));
    setObErrors(null);
  };
  const obSetM = (k: string, v: string) => {
    setObState((s) => ({ ...s, m: { ...s.m, [k]: sanitizeNumeric(v) } }));
    setObErrors(null);
  };
  const obFocusM = (k: string) => setObFocus(k);
  const obBlurM = () => setObFocus('');
  const obSetCat = (cat: Category) => {
    setObState((s) => ({ ...s, cat, m: {} }));
    setObErrors(null);
  };
  // Same required-identity rule as validateNg/saveGarment (see DESIGN_GUIDELINES.md's
  // Measurement integrity) — onboarding's own save path (obSaveFit) must never
  // fabricate a brand/name/size it wasn't given, so this blocks advancing past
  // the form step until each is either typed or set via the "Don't know?" sentinel.
  const validateOb = (draft: OnboardingDraft): NgValidationErrors | null => {
    const errors: NgValidationErrors = {};
    if (!draft.brand.trim()) errors.brand = true;
    if (!draft.name.trim()) errors.name = true;
    if (!draft.size.trim()) errors.size = true;
    if (!Object.values(draft.m).some((v) => v.trim() !== '')) errors.measurements = true;
    return Object.keys(errors).length ? errors : null;
  };
  const obSaveGarment = () => {
    const errors = validateOb(ob);
    if (errors) {
      setObErrors(errors);
      showToast('Add the missing details before continuing.');
      return;
    }
    setObErrors(null);
    setObStep('how');
  };
  const obSetVerdict = (v: string) => {
    setObState((s) => ({ ...s, verdict: v }));
    setObStep('why');
  };
  const obToggleTag = (tag: string) =>
    setObState((s) => ({ ...s, tags: s.tags.includes(tag) ? s.tags.filter((t) => t !== tag) : [...s.tags, tag] }));

  // Verdict is holistic ("how does this fit overall"), not per-zone — so only the
  // unambiguous case (great fit) translates into per-zone comfort data (every zone
  // the user actually measured logged as Good). "Okay"/"doesn't fit" can't be
  // translated to a direction (tight vs. loose) without guessing, so those are
  // recorded as a note only, never fabricated per-zone verdicts.
  const obSaveFit = async () => {
    const db = dbRef.current;
    if (!db) return;
    // brand/name/size are guaranteed non-empty here — obSaveGarment already
    // blocked advancing past the form step otherwise (validateOb), so there is
    // no fallback string to fabricate (see DESIGN_GUIDELINES.md's Measurement
    // integrity — a saved garment's identity is required, not just its
    // measurements, and must never be silently padded with a default).
    const m: Record<string, number> = {};
    Object.keys(ob.m).forEach((k) => {
      if (ob.m[k].trim() !== '') {
        const n = Number(ob.m[k]);
        if (!Number.isNaN(n)) m[k] = displayToCm(n, units);
      }
    });
    const silTags = ob.tags.filter((t) => OB_SILHOUETTE_TAGS.includes(t));
    const styleTags = ob.tags.filter((t) => !OB_SILHOUETTE_TAGS.includes(t));
    const comfort = ob.verdict === 'Fits great'
      ? keysFor(ob.cat).filter(([k]) => m[k] !== undefined).map(([, area]) => ({ area, verdict: 'Good' as const }))
      : [];
    const id = generateId();
    const draft: Garment = hydrate(
      {
        id,
        brand: ob.brand.trim(),
        name: ob.name.trim(),
        cat: ob.cat,
        size: ob.size.trim(),
        // fit mirrors the first silhouette chip the user actually picked (a real
        // choice) — but falls back to '—', never 'Regular', when they picked none.
        fit: silTags[0] || '—',
        sil: silTags.join(', ') || '—',
        stretch: 'Some stretch',
        tags: styleTags,
        cap: 'garment photo',
        bg: ['#E3E0DA', '#EDEAE4'],
        m,
        visual: ob.note.trim() || 'No visual note yet.',
        photo: null,
        createdAt: id,
      },
      []
    );
    try {
      await insertGarment(db, draft);
      await insertObservation(db, { garmentId: id, at: id, note: ob.verdict || 'Added to closet', comfort });
      await refresh();
      setSelectedId(id);
      setObSuggested(null);
      setObStep('payoff');
    } catch {
      showToast("Couldn't save — try again.");
    }
  };

  const obToCompare = () => setObStep('new');
  const obSet2M = (k: string, v: string) => setOb2State((s) => ({ ...s, [k]: sanitizeNumeric(v) }));
  // No artificial delay here either — same reasoning as runCheck: this
  // comparison is real, deterministic, and fast, so there's nothing to pad.
  const obCompare = () => {
    const ref = garments[0];
    if (!ref) return;
    const hasPair = Object.keys(ref.m).some((k) => (ob2[k] ?? '').trim() !== '');
    if (!hasPair) return;
    setObStep('aha');
  };
  const obToOutro = () => setObStep('outro');
  const obFinish = async () => {
    setObStep(null);
    finishFlowTo('closet');
    setFilterState('All');
    const db = dbRef.current;
    if (!db) return;
    try {
      await dbSetOnboarded(db, true);
    } catch {
      showToast("Couldn't save that — you may see this again next time.");
    }
  };

  // Each update is a new timeline entry, so it never inherits the previous one's
  // picks either — that would be the same pre-fill, one session later.
  const openSheet = () => {
    setSArea('');
    setSVerdict('');
    setSLook('');
    setSComfortNote('');
    setSheetOpen(true);
  };
  const closeSheet = () => setSheetOpen(false);
  const setSheetArea = (v: string) => setSArea(v);
  const setSheetVerdict = (v: string) => setSVerdict(v);
  const setSheetLook = (v: string) => setSLook(v);
  const setSheetComfortNote = (v: string) => setSComfortNote(v);
  const saveFit = async () => {
    const db = dbRef.current;
    if (!db) return;
    // An entry means "this area felt like this" — both are required (FitSheet
    // keeps its button disabled until then; this is the backstop).
    if (!sArea || !sVerdict) return;
    setSheetOpen(false);
    // A typed note replaces the templated one (spec.md Feature 1: "a quick tag ...
    // plus optional free text") rather than sitting alongside it — the templated
    // version is just a sensible default when the user doesn't want to type anything.
    const note = sComfortNote.trim() || `${sVerdict} at the ${sArea.toLowerCase()}`;
    try {
      await insertObservation(db, {
        garmentId: selectedId,
        at: Date.now(),
        note,
        comfort: [{ area: sArea, verdict: sVerdict as any }],
        visual: sLook.trim() || undefined,
      });
      setSComfortNote('');
      await refresh();
      showToast('Added to fit history — earlier entries kept.');
    } catch {
      showToast("Couldn't save that update — try again.");
    }
  };

  // Backup file never carries a real photo — a device swap/reinstall never has the
  // original file on disk at that path, and a same-device re-import might not
  // either (the user may have deleted/replaced the garment's photo since). Rather
  // than saving a broken image reference, drop `photo` for any garment whose file
  // isn't actually present right now, exactly like Measurement integrity's rule
  // for a missing measurement: unknown stays unknown, never a stale-looking value.
  const sanitizeImportedGarments = (garments: BackupFile['garments']): BackupFile['garments'] =>
    garments.map((g) => (g.photo && localPhotoExists(g.photo) ? g : { ...g, photo: null }));

  const exportBackup = async () => {
    setBackupBusy('export');
    try {
      const backup = buildBackupFile(garments, bodyMeasurements);
      const shared = await shareBackupFile(backup);
      if (!shared) showToast("Sharing isn't available on this device.");
    } catch {
      showToast("Couldn't create a backup — try again.");
    } finally {
      setBackupBusy(null);
    }
  };

  const finishImport = async (backup: BackupFile) => {
    const db = dbRef.current;
    if (!db) return;
    setBackupBusy('import');
    try {
      const sanitized = sanitizeImportedGarments(backup.garments);
      await replaceAllData(db, { garments: sanitized, bodyMeasurements: backup.bodyMeasurements });
      await refresh();
      await refreshBody();
      setSelectedId(sanitized[0]?.id ?? 1);
      setNgState(EMPTY_NG);
      showToast(`Imported ${sanitized.length} garment${sanitized.length === 1 ? '' : 's'} from the backup.`);
    } catch {
      // The transaction in replaceAllData rolls back on any failure, so the
      // existing closet is genuinely untouched — safe to say so, not just hoped.
      showToast("Couldn't import that backup — your closet wasn't changed.");
    } finally {
      setBackupBusy(null);
    }
  };

  const importBackup = async () => {
    setBackupBusy('import');
    let picked: BackupFile | null;
    try {
      picked = await pickBackupFile();
    } catch (e) {
      setBackupBusy(null);
      showToast(e instanceof BackupParseError ? e.message : "Couldn't read that file.");
      return;
    }
    setBackupBusy(null);
    if (!picked) return; // user canceled the file picker — not an error, nothing to say
    const incoming = picked.garments.length;
    confirm({
      title: 'Import backup?',
      message: `This replaces your current closet (${garments.length} garment${garments.length === 1 ? '' : 's'}) with ${incoming} garment${incoming === 1 ? '' : 's'} from the backup file. Photos aren't included in backups, so garment photos won't carry over. This can't be undone.`,
      confirmLabel: 'Replace closet',
      destructive: true,
      onConfirm: () => { finishImport(picked as BackupFile); },
    });
  };

  const value: Store = {
    ready, initError, retryInit, screen, garments, selectedId, filter, closetFit, closetSearch, toast, confirmRequest, confirm, cancelConfirm, confirmAction,
    sheetOpen, sArea, sVerdict, sLook, sComfortNote,
    ng, ngErrors, ngFitsOpen, fc, fcFitsOpen, result, noResultReason, justSavedId, clearJustSaved, justDeletedGarment, clearJustDeleted, units, profile, bodyMeasurements,
    obStep, ob, obSuggested, ob2, obFocus, obErrors,
    obStart, obExplore, obPickMethod, obSet, obSetM, obFocusM, obBlurM, obSetCat,
    obSaveGarment, obSetVerdict, obToggleTag, obSaveFit, obToCompare, obSet2M, obCompare, obToOutro, obFinish,
    go, back, openGarment, photoTransition, beginPhotoTransition, reportPhotoTransitionTarget, clearPhotoTransition,
    setFilter, clearFilter, setClosetFit, setClosetSearch, dismissToast, showToast, toggleUnits, setUnits,
    saveBodyMeasurement, deleteBodyMeasurementEntry,
    setFc, setFcCategory, toggleFcFits, runCheck,
    setNg, setNgMeasure, setNgCategory, setNgFit, setNgStretch, toggleNgFits, toggleTag, saveGarment,
    loadEditGarment, startGarmentFromResult, pickNgPhoto, deleteGarmentById,
    openSheet, closeSheet, setSheetArea, setSheetVerdict, setSheetLook, setSheetComfortNote, saveFit,
    backupBusy, exportBackup, importBackup,
    installedVersion: INSTALLED_VERSION, updateStatus, updateError, availableUpdate, autoUpdateCheck, checkForUpdate, setAutoUpdateCheck, openUpdateDownload,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

export function fitsFor(cat: Category): string[] {
  return FITS[cat];
}

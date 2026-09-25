export const COLORS = {
  bg: '#F6F5F2',
  card: '#FCFBF9',
  ink: '#16150F',
  inkHover: '#2A281F',
  inkActive: '#0C0B07',
  cream: '#F6F5F2',
  border: 'rgba(22,21,15,0.10)',
  borderSoft: 'rgba(22,21,15,0.08)',
  borderFaint: 'rgba(22,21,15,0.06)',
  chipBg: '#EDEBE5',
  chipText: '#4A473F',
  muted: '#8A867C',
  mutedDark: '#6E6A60',
  faint: '#A29D92',
  faintest: '#B5B0A5',
  text: '#33312A',
  good: '#2F6F4F',
  goodBg: '#E9F1EB',
  goodBd: 'rgba(47,111,79,0.22)',
  warn: '#A8761F',
  warnBg: '#F6EEDF',
  warnBd: 'rgba(168,118,31,0.22)',
  bad: '#A8453A',
  badBg: '#F6E7E4',
  badBd: 'rgba(168,69,58,0.22)',
  ocrBadgeBg: '#E7F0E9',
  scaffoldBg: '#E7E4DD',
} as const;

export const FONTS = {
  regular: 'Archivo_400Regular',
  medium: 'Archivo_500Medium',
  semibold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

export const RADII = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  pill: 999,
};

/**
 * The one spacing scale every screen pulls from (DESIGN_GUIDELINES.md's "Establish
 * a single layout grid") — arbitrary one-off numbers (13, 19, 27…) shouldn't appear
 * in a screen's StyleSheet when one of these already expresses the relationship.
 */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  section: 32,
  major: 40,
  screen: 48,
} as const;

/** The one left/right content boundary every screen aligns to — title, cards,
 * buttons, inputs, empty states all share this edge (DESIGN_GUIDELINES.md
 * "Establish one screen horizontal margin"). */
export const SCREEN_PADDING = 24;

/** Screen title sizes: DISPLAY for the four top-level destinations (Home, Closet,
 * FitCheck, Profile), FOCUSED for a single-task flow's header (Add, Add Manual,
 * Add Photo) and any card-style title playing the same role (Detail's garment
 * name, Result's closest-match name). */
export const TYPE = {
  display: 30,
  focused: 26,
} as const;

import { Garment } from '../types';
import { whenLabel } from '../data/hydrate';
import { historyTone } from './compare';

/**
 * Home screen's "recent fit changes" — derived from the observation log, not a
 * hardcoded garment list. A "change" is any observation that carries real comfort
 * feedback (excludes the "Added to closet" bootstrap entry every garment gets on
 * creation, which logs no comfort at all).
 */

const RECENT_WINDOW_MS = 1000 * 60 * 60 * 24 * 90; // ~3 months

export interface FitChangeItem {
  garment: Garment;
  when: string;
  note: string;
  tone: 'good' | 'warn' | 'bad';
}

/** The most recent feedback event per garment, newest first, capped at `limit` garments. */
export function recentChanges(garments: Garment[], limit = 3): FitChangeItem[] {
  const flat = garments
    .flatMap((g) => g.observations.filter((o) => o.comfort.length > 0).map((o) => ({ g, o })))
    .sort((a, b) => b.o.at - a.o.at);

  const seen = new Set<number>();
  const items: FitChangeItem[] = [];
  for (const { g, o } of flat) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    items.push({ garment: g, when: whenLabel(o.at), note: o.note, tone: historyTone(o.note, o.comfort) });
    if (items.length >= limit) break;
  }
  return items;
}

/** Count of feedback events logged within the recency window — for the Home stat card. */
export function recentChangeCount(garments: Garment[]): number {
  const now = Date.now();
  return garments.reduce(
    (sum, g) => sum + g.observations.filter((o) => o.comfort.length > 0 && now - o.at <= RECENT_WINDOW_MS).length,
    0
  );
}

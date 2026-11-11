import type { ShowTreeNode } from './workspaceTypes.js';

/**
 * Expansion state for the TV tree.
 *
 * The tree has two *different* reasons for a show to be open, and conflating them
 * caused two bugs: selecting a series piled up stale expanded rows, and "collapse
 * all" was immediately undone by the selected row re-expanding itself.
 *
 *  - `pinnedShows` are open because the user pressed the caret. These persist when
 *    the user navigates elsewhere — that is the whole point of pinning.
 *  - the currently selected show is open purely *because* it is selected. It closes
 *    the moment something else is selected.
 *
 * `pinnedShows ∪ {selectedShow}` is the effective set, so selection never has to
 * write state and cannot resurrect a collapsed tree.
 */
export interface TreeExpansion {
  pinnedShows: ReadonlySet<number>;
  selectedShowId: number | null;
  expandedSeasons: ReadonlySet<string>;
}

export const seasonKey = (showId: number, seasonNumber: number): string => `${showId}:${seasonNumber}`;

export function parseSeasonKey(key: string): { showId: number; seasonNumber: number } | null {
  const [showIdRaw, seasonRaw] = key.split(':');
  const showId = Number(showIdRaw);
  const seasonNumber = Number(seasonRaw);
  if (!Number.isFinite(showId) || !Number.isFinite(seasonNumber)) return null;
  return { showId, seasonNumber };
}

/** The shows whose episode lists should be rendered. */
export function effectiveExpandedShows(expansion: TreeExpansion): Set<number> {
  const next = new Set<number>(expansion.pinnedShows);
  if (expansion.selectedShowId != null) next.add(expansion.selectedShowId);
  return next;
}

export function isShowExpanded(expansion: TreeExpansion, showId: number): boolean {
  return expansion.pinnedShows.has(showId) || expansion.selectedShowId === showId;
}

export function isSeasonExpanded(expansion: TreeExpansion, showId: number, seasonNumber: number): boolean {
  return expansion.expandedSeasons.has(seasonKey(showId, seasonNumber));
}

/**
 * Drop season rows that are no longer reachable — i.e. those belonging to a show
 * that is neither pinned nor currently selected. Without this, seasons stay in
 * state invisibly and pop back open when the show is re-expanded later.
 */
export function visibleSeasonKeys(expansion: TreeExpansion): Set<string> {
  const open = effectiveExpandedShows(expansion);
  const next = new Set<string>();
  for (const key of expansion.expandedSeasons) {
    const parsed = parseSeasonKey(key);
    if (parsed && open.has(parsed.showId)) next.add(key);
  }
  return next;
}

/** Toggle a show's caret. Selection is untouched, so this is purely a pin/unpin. */
export function togglePin(expansion: TreeExpansion, showId: number): TreeExpansion {
  const pinnedShows = new Set(expansion.pinnedShows);
  if (pinnedShows.has(showId)) pinnedShows.delete(showId);
  else pinnedShows.add(showId);
  return { ...expansion, pinnedShows };
}

/** Season carets behave the same way, but scoped to a show + season pair. */
export function toggleSeason(expansion: TreeExpansion, showId: number, seasonNumber: number): TreeExpansion {
  const expandedSeasons = new Set(expansion.expandedSeasons);
  const key = seasonKey(showId, seasonNumber);
  if (expandedSeasons.has(key)) expandedSeasons.delete(key);
  else expandedSeasons.add(key);
  return { ...expansion, expandedSeasons };
}

/**
 * "Collapse All" clears pins and seasons. `selectedShowId` is nulled too, but the
 * component additionally records a `suppressedShowId` so a still-selected show does
 * not immediately re-open the tree.
 */
export function collapseAll(): TreeExpansion {
  return { pinnedShows: new Set(), selectedShowId: null, expandedSeasons: new Set() };
}

export function expandAll(tree: ShowTreeNode[]): TreeExpansion {
  const pinnedShows = new Set<number>();
  const expandedSeasons = new Set<string>();
  for (const node of tree) {
    pinnedShows.add(node.show.id);
    for (const season of node.seasons) expandedSeasons.add(seasonKey(node.show.id, season.seasonNumber));
  }
  return { pinnedShows, selectedShowId: null, expandedSeasons };
}

/**
 * Season to auto-open for a show. Picking an episode should reveal that episode's
 * season; picking the series itself opens its first season so the row is not empty.
 */
export function seasonToReveal(
  tree: ShowTreeNode[],
  showId: number | null,
  selectedEpisodeId: number | null
): number | null {
  if (showId == null) return null;
  const node = tree.find((n) => n.show.id === showId);
  if (!node) return null;

  if (selectedEpisodeId != null) {
    const ep = node.episodes.find((e) => e.id === selectedEpisodeId);
    if (ep) return ep.displaySeason ?? ep.seasonNumber;
  }
  const first = [...node.seasons].sort((a, b) => a.seasonNumber - b.seasonNumber)[0];
  return first ? first.seasonNumber : null;
}

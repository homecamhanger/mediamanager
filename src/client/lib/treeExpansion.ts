import type { ShowTreeNode } from './workspaceTypes.js';

/**
 * Expansion state for the TV tree.
 *
 * Opening a series is always an *explicit* act, never a side effect of selection:
 *
 *  - single click selects a series and only fills the data pane — it never opens
 *    or closes anything;
 *  - double click opens a series (`pinShow`), and it stays open as you navigate;
 *  - the caret toggles open/closed (`togglePin`);
 *  - selecting an *episode* from elsewhere (e.g. search) reveals its season via
 *    `revealedShowId`, which holds at most one show and is replaced as you move.
 *
 * `pinnedShows ∪ {revealedShowId}` is the effective set. Because selection no
 * longer contributes, "collapse all" cannot be undone by the selected row and
 * navigation cannot leave a trail of stale open series.
 */
export interface TreeExpansion {
  pinnedShows: ReadonlySet<number>;
  revealedShowId: number | null;
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
  if (expansion.revealedShowId != null) next.add(expansion.revealedShowId);
  return next;
}

export function isShowExpanded(expansion: TreeExpansion, showId: number): boolean {
  return expansion.pinnedShows.has(showId) || expansion.revealedShowId === showId;
}

export function isSeasonExpanded(expansion: TreeExpansion, showId: number, seasonNumber: number): boolean {
  return expansion.expandedSeasons.has(seasonKey(showId, seasonNumber));
}

/**
 * Drop a reveal once the selection moves off that show. Only explicit opens
 * (caret / double click) are meant to survive navigation.
 */
export function clearStaleReveal(expansion: TreeExpansion, selectedShowId: number | null): TreeExpansion {
  if (expansion.revealedShowId == null || expansion.revealedShowId === selectedShowId) return expansion;
  return { ...expansion, revealedShowId: null };
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

/**
 * Toggle a show's caret. Closing also drops a reveal for the same show, otherwise
 * the row would stay open via the union and the caret would appear dead.
 */
export function togglePin(expansion: TreeExpansion, showId: number): TreeExpansion {
  const pinnedShows = new Set(expansion.pinnedShows);
  const isOpen = pinnedShows.has(showId) || expansion.revealedShowId === showId;

  if (isOpen) {
    pinnedShows.delete(showId);
    return {
      ...expansion,
      pinnedShows,
      revealedShowId: expansion.revealedShowId === showId ? null : expansion.revealedShowId,
    };
  }
  pinnedShows.add(showId);
  return { ...expansion, pinnedShows };
}

/**
 * Open a show explicitly (double click). Idempotent — double-clicking an already
 * open series must not close it the way a toggle would.
 */
export function pinShow(expansion: TreeExpansion, showId: number): TreeExpansion {
  if (expansion.pinnedShows.has(showId)) return expansion;
  const pinnedShows = new Set(expansion.pinnedShows);
  pinnedShows.add(showId);
  return {
    ...expansion,
    pinnedShows,
    revealedShowId: expansion.revealedShowId === showId ? null : expansion.revealedShowId,
  };
}

/** Reveal a show because one of its episodes was selected. Replaces any previous reveal. */
export function revealShow(expansion: TreeExpansion, showId: number): TreeExpansion {
  return expansion.revealedShowId === showId ? expansion : { ...expansion, revealedShowId: showId };
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
 * "Collapse All" clears pins, the reveal and every season. Nothing re-derives from
 * the current selection, so this stays collapsed even with a series still selected.
 */
export function collapseAll(): TreeExpansion {
  return { pinnedShows: new Set(), revealedShowId: null, expandedSeasons: new Set() };
}

export function expandAll(tree: ShowTreeNode[]): TreeExpansion {
  const pinnedShows = new Set<number>();
  const expandedSeasons = new Set<string>();
  for (const node of tree) {
    pinnedShows.add(node.show.id);
    for (const season of node.seasons) expandedSeasons.add(seasonKey(node.show.id, season.seasonNumber));
  }
  return { pinnedShows, revealedShowId: null, expandedSeasons };
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

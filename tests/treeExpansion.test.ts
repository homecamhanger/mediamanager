import { describe, expect, it } from 'vitest';
import {
  collapseAll,
  effectiveExpandedShows,
  expandAll,
  clearStaleReveal,
  isSeasonExpanded,
  isShowExpanded,
  parseSeasonKey,
  pinShow,
  revealShow,
  seasonKey,
  seasonToReveal,
  togglePin,
  toggleSeason,
  visibleSeasonKeys,
  type TreeExpansion,
} from '../src/client/lib/treeExpansion.js';
import type { ShowTreeNode } from '../src/client/lib/workspaceTypes.js';

const expansion = (over: Partial<TreeExpansion> = {}): TreeExpansion => ({
  pinnedShows: new Set<number>(),
  revealedShowId: null,
  expandedSeasons: new Set<string>(),
  ...over,
});

const node = (showId: number, seasons: number[], episodes: Array<[number, number, number?]> = []): ShowTreeNode =>
  ({
    show: { id: showId, title: `Show ${showId}` },
    seasons: seasons.map((seasonNumber) => ({ id: showId * 100 + seasonNumber, seasonNumber })),
    episodes: episodes.map(([id, seasonNumber, displaySeason]) => ({
      id,
      seasonNumber,
      displaySeason: displaySeason ?? null,
    })),
  }) as never;

describe('Tree expansion', () => {
  it('is closed by default — selection alone does not open a series', () => {
    const e = expansion();
    expect(effectiveExpandedShows(e)).toEqual(new Set());
    expect(isShowExpanded(e, 1)).toBe(false);
  });

  it('opens on double click and stays open while navigating', () => {
    const e = pinShow(expansion(), 1);
    expect(isShowExpanded(e, 1)).toBe(true);
    // Selection is not part of the model, so clicking elsewhere leaves it open.
    expect(effectiveExpandedShows(e)).toEqual(new Set([1]));
  });

  it('double-clicking an already open series is idempotent, not a toggle', () => {
    const once = pinShow(expansion(), 1);
    const twice = pinShow(once, 1);
    expect(isShowExpanded(twice, 1)).toBe(true);
    expect(twice).toBe(once); // no state churn
  });

  it('keeps other open series open when a second is double-clicked', () => {
    const e = pinShow(pinShow(expansion(), 1), 2);
    expect(effectiveExpandedShows(e)).toEqual(new Set([1, 2]));
  });

  it('caret toggles a series closed and open again', () => {
    let e = togglePin(expansion(), 1);
    expect(isShowExpanded(e, 1)).toBe(true);
    e = togglePin(e, 1);
    expect(isShowExpanded(e, 1)).toBe(false);
    expect(effectiveExpandedShows(e)).toEqual(new Set());
  });

  it('caret closes a row that was opened by double click', () => {
    const opened = pinShow(expansion(), 1);
    const closed = togglePin(opened, 1);
    expect(isShowExpanded(closed, 1)).toBe(false);
  });

  it('caret closes a row that was revealed by episode selection', () => {
    const revealed = revealShow(expansion(), 1);
    expect(isShowExpanded(revealed, 1)).toBe(true);
    const closed = togglePin(revealed, 1);
    // Would have stayed open via the union if the reveal were not cleared.
    expect(isShowExpanded(closed, 1)).toBe(false);
    expect(effectiveExpandedShows(closed)).toEqual(new Set());
  });

  it('reveals only one show at a time as episode selection moves', () => {
    const first = revealShow(expansion(), 1);
    const second = revealShow(first, 2);
    expect(second.revealedShowId).toBe(2);
    expect(effectiveExpandedShows(second)).toEqual(new Set([2]));
  });

  it('reveal does not disturb double-click-pinned series', () => {
    const e = revealShow(pinShow(expansion(), 1), 2);
    expect(effectiveExpandedShows(e)).toEqual(new Set([1, 2]));
  });

  it('drops a reveal once selection moves to another series', () => {
    const revealed = revealShow(expansion(), 1);
    expect(clearStaleReveal(revealed, 2).revealedShowId).toBeNull();
    // Still selected -> keep it open.
    expect(clearStaleReveal(revealed, 1).revealedShowId).toBe(1);
    // Pinned rows are unaffected by navigation.
    const mixed = revealShow(pinShow(expansion(), 5), 1);
    const moved = clearStaleReveal(mixed, 2);
    expect(moved.revealedShowId).toBeNull();
    expect(effectiveExpandedShows(moved)).toEqual(new Set([5]));
  });

  it('no reveal -> clearing is a no-op', () => {
    const e = pinShow(expansion(), 1);
    expect(clearStaleReveal(e, 2)).toBe(e);
  });

  it('"collapse all" clears everything and stays collapsed', () => {
    const busy = expansion({
      pinnedShows: new Set([1, 2]),
      revealedShowId: 3,
      expandedSeasons: new Set([seasonKey(1, 1), seasonKey(2, 1)]),
    });
    expect(effectiveExpandedShows(busy).size).toBe(3); // sanity: was open before

    const cleared = collapseAll();
    expect(cleared.pinnedShows.size).toBe(0);
    expect(cleared.revealedShowId).toBeNull();
    expect(cleared.expandedSeasons.size).toBe(0);
    // Nothing re-derives from selection, so this cannot bounce back open.
    expect(effectiveExpandedShows(cleared)).toEqual(new Set());
  });

  it('expands everything for "expand all"', () => {
    const tree = [node(1, [1, 2]), node(2, [1])];
    const e = expandAll(tree);
    expect(effectiveExpandedShows(e)).toEqual(new Set([1, 2]));
    expect(isSeasonExpanded(e, 1, 1)).toBe(true);
    expect(isSeasonExpanded(e, 1, 2)).toBe(true);
    expect(isSeasonExpanded(e, 2, 1)).toBe(true);
    expect(e.expandedSeasons.size).toBe(3);
  });

  it('toggles a season independently of its show', () => {
    let e = toggleSeason(expansion(), 1, 2);
    expect(isSeasonExpanded(e, 1, 2)).toBe(true);
    expect(isSeasonExpanded(e, 1, 1)).toBe(false);
    e = toggleSeason(e, 1, 2);
    expect(isSeasonExpanded(e, 1, 2)).toBe(false);
  });

  it('prunes seasons belonging to shows that are no longer open', () => {
    const e = expansion({
      pinnedShows: new Set([1]),
      revealedShowId: 2,
      expandedSeasons: new Set([seasonKey(1, 1), seasonKey(2, 1), seasonKey(3, 1)]),
    });
    const visible = visibleSeasonKeys(e);
    expect(visible).toEqual(new Set([seasonKey(1, 1), seasonKey(2, 1)]));
    // Show 3's season is dropped, so re-opening show 3 later starts clean.
    expect(visible.has(seasonKey(3, 1))).toBe(false);
  });

  it("reveals the selected episode's season, honouring display order", () => {
    const tree = [node(1, [1, 2], [[10, 2], [11, 1, 5]])];
    expect(seasonToReveal(tree, 1, 10)).toBe(2);
    // displaySeason overrides the on-disk season number.
    expect(seasonToReveal(tree, 1, 11)).toBe(5);
  });

  it('falls back to the first season when only the series is selected', () => {
    const tree = [node(1, [3, 1, 2])];
    expect(seasonToReveal(tree, 1, null)).toBe(1);
  });

  it('returns null when the show has no seasons or is unknown', () => {
    expect(seasonToReveal([node(1, [])], 1, null)).toBeNull();
    expect(seasonToReveal([node(1, [1])], 99, null)).toBeNull();
    expect(seasonToReveal([node(1, [1])], null, null)).toBeNull();
  });

  it('parses and round-trips season keys', () => {
    expect(seasonKey(3, 4)).toBe('3:4');
    expect(parseSeasonKey('3:4')).toEqual({ showId: 3, seasonNumber: 4 });
    expect(parseSeasonKey('garbage')).toBeNull();
  });

  it('does not mutate the input expansion', () => {
    const e = expansion({ pinnedShows: new Set([1]) });
    togglePin(e, 2);
    toggleSeason(e, 1, 1);
    pinShow(e, 3);
    revealShow(e, 4);
    expect(e.pinnedShows.has(2)).toBe(false);
    expect(e.pinnedShows.has(3)).toBe(false);
    expect(e.revealedShowId).toBeNull();
    expect(e.expandedSeasons.size).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  collapseAll,
  effectiveExpandedShows,
  expandAll,
  isSeasonExpanded,
  isShowExpanded,
  parseSeasonKey,
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
  selectedShowId: null,
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
  it('opens a show purely by being selected, without pinning it', () => {
    const e = expansion({ selectedShowId: 7 });
    expect(isShowExpanded(e, 7)).toBe(true);
    expect(e.pinnedShows.has(7)).toBe(false);
  });

  it('closes the previously selected show when another is selected', () => {
    // Selecting B is represented by changing selectedShowId — no state accumulates.
    const before = expansion({ selectedShowId: 1 });
    const after: TreeExpansion = { ...before, selectedShowId: 2 };
    expect(isShowExpanded(after, 1)).toBe(false);
    expect(isShowExpanded(after, 2)).toBe(true);
    expect(effectiveExpandedShows(after)).toEqual(new Set([2]));
  });

  it('keeps a caret-pinned show open when navigation moves elsewhere', () => {
    let e = expansion();
    e = togglePin(e, 1); // caret on show 1
    e = { ...e, selectedShowId: 2 }; // now select show 2
    expect(isShowExpanded(e, 1)).toBe(true);
    expect(isShowExpanded(e, 2)).toBe(true);
    expect(effectiveExpandedShows(e)).toEqual(new Set([1, 2]));
  });

  it('unpins on a second caret press', () => {
    let e = togglePin(expansion(), 1);
    expect(isShowExpanded(e, 1)).toBe(true);
    e = togglePin(e, 1);
    expect(isShowExpanded(e, 1)).toBe(false);
    // Still closed once the caret is released and nothing is selected.
    expect(effectiveExpandedShows(e)).toEqual(new Set());
  });

  it('"collapse all" clears pins, seasons and selection', () => {
    const busy = expansion({
      pinnedShows: new Set([1, 2]),
      selectedShowId: 3,
      expandedSeasons: new Set([seasonKey(1, 1), seasonKey(2, 1)]),
    });
    const cleared = collapseAll();
    expect(cleared.pinnedShows.size).toBe(0);
    expect(cleared.selectedShowId).toBeNull();
    expect(cleared.expandedSeasons.size).toBe(0);
    // Nothing is expanded after collapsing, and re-deriving stays empty.
    expect(effectiveExpandedShows(cleared)).toEqual(new Set());
    expect(isShowExpanded(busy, 1)).toBe(true); // sanity: was open before
  });

  it('stays fully collapsed when a show is still selected but suppressed', () => {
    // The component models "collapse all" as suppression of the selected show,
    // which resolves to selectedShowId === null.
    const suppressed: TreeExpansion = { pinnedShows: new Set(), selectedShowId: null, expandedSeasons: new Set() };
    expect(effectiveExpandedShows(suppressed)).toEqual(new Set());
    // A brand-new selection lifts the suppression.
    const afterNewSelection: TreeExpansion = { ...suppressed, selectedShowId: 9 };
    expect(effectiveExpandedShows(afterNewSelection)).toEqual(new Set([9]));
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
    let e = toggleSeason(expansion({ selectedShowId: 1 }), 1, 2);
    expect(isSeasonExpanded(e, 1, 2)).toBe(true);
    expect(isSeasonExpanded(e, 1, 1)).toBe(false);
    e = toggleSeason(e, 1, 2);
    expect(isSeasonExpanded(e, 1, 2)).toBe(false);
  });

  it('prunes seasons belonging to shows that are no longer open', () => {
    const e = expansion({
      pinnedShows: new Set([1]),
      selectedShowId: 2,
      expandedSeasons: new Set([seasonKey(1, 1), seasonKey(2, 1), seasonKey(3, 1)]),
    });
    const visible = visibleSeasonKeys(e);
    expect(visible).toEqual(new Set([seasonKey(1, 1), seasonKey(2, 1)]));
    // Show 3's season is dropped, so re-expanding show 3 later starts clean.
    expect(visible.has(seasonKey(3, 1))).toBe(false);
  });

  it('reveals the selected episode\'s season, honouring display order', () => {
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
    expect(e.pinnedShows.has(2)).toBe(false);
    expect(e.expandedSeasons.size).toBe(0);
  });
});

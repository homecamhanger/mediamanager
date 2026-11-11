import type { ActorEntry, MovieRecord, MovieSetRecord } from '../../shared/types.js';
import type { ShowTreeNode } from './workspaceTypes.js';

export function findActorMatch(actors: ActorEntry[], needle: string): ActorEntry | null {
  const norm = needle.trim().toLowerCase();
  if (!norm) return null;
  return actors.find((a) => a.name.trim().toLowerCase() === norm) ?? null;
}

export function actorsMatchText(actors: ActorEntry[], textNeedle: string): boolean {
  const norm = textNeedle.trim().toLowerCase();
  if (!norm) return true;
  return actors.some((a) => `${a.name} ${a.role}`.toLowerCase().includes(norm));
}

export function filterMoviesByActorAndQuery(
  movies: MovieRecord[],
  actorFilter: string | null,
  rawQuery: string
): MovieRecord[] {
  const actorNeedle = actorFilter?.trim().toLowerCase() || '';
  const q = rawQuery.trim().toLowerCase();
  const isActorPrefix = q.startsWith('actor:');
  const actorQuery = isActorPrefix ? q.slice(6).trim() : q;

  return movies.filter((m) => {
    if (actorNeedle && !findActorMatch(m.actors, actorNeedle)) return false;
    if (q) {
      if (isActorPrefix) {
        if (!actorsMatchText(m.actors, actorQuery)) return false;
      } else {
        const actorHay = m.actors.map((a) => `${a.name} ${a.role}`).join(' ');
        const hay = `${m.title} ${m.originalTitle} ${m.year ?? ''} ${m.setName ?? ''} ${m.fileName} ${actorHay}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
    }
    return true;
  });
}

export interface ScopedShowMatch {
  node: ShowTreeNode;
  showActorMatch: ActorEntry | null;
  guestEpisodeMatchCount: number;
}

export function filterShowTreeByActorAndQuery(
  showTree: ShowTreeNode[],
  actorFilter: string | null,
  rawQuery: string
): ScopedShowMatch[] {
  const actorNeedle = actorFilter?.trim().toLowerCase() || '';
  const q = rawQuery.trim().toLowerCase();
  const isActorPrefix = q.startsWith('actor:');
  const actorQuery = isActorPrefix ? q.slice(6).trim() : q;

  const out: ScopedShowMatch[] = [];

  for (const node of showTree) {
    const showActorMatch = actorNeedle ? findActorMatch(node.show.actors, actorNeedle) : null;
    const epActorMatches = actorNeedle
      ? node.episodes.filter((ep) => Boolean(findActorMatch(ep.actors, actorNeedle)))
      : [];

    if (actorNeedle && !showActorMatch && epActorMatches.length === 0) {
      continue;
    }

    let scopedNode = node;
    if (actorNeedle && !showActorMatch) {
      const seasonNums = new Set(epActorMatches.map((e) => e.displaySeason ?? e.seasonNumber));
      scopedNode = {
        show: node.show,
        seasons: node.seasons.filter((s) => seasonNums.has(s.seasonNumber)),
        episodes: epActorMatches,
      };
    }

    if (q) {
      const showActorHay = scopedNode.show.actors.map((a) => `${a.name} ${a.role}`).join(' ');
      const showMatch = isActorPrefix
        ? showActorHay.toLowerCase().includes(actorQuery)
        : `${scopedNode.show.title} ${scopedNode.show.year ?? ''} ${scopedNode.show.studio} ${showActorHay}`
            .toLowerCase()
            .includes(q);

      const matchingEps = scopedNode.episodes.filter((ep) => {
        const epActorHay = ep.actors.map((a) => `${a.name} ${a.role}`).join(' ');
        if (isActorPrefix) {
          return epActorHay.toLowerCase().includes(actorQuery);
        }
        const effSeason = ep.displaySeason ?? ep.seasonNumber;
        const effEp = ep.displayEpisode ?? ep.episodeNumber;
        const code = `s${String(ep.seasonNumber).padStart(2, '0')}e${String(ep.episodeNumber).padStart(2, '0')}`;
        const effCode = `s${String(effSeason).padStart(2, '0')}e${String(effEp).padStart(2, '0')}`;
        return `${ep.title} ${code} ${effCode} ${ep.fileName} ${epActorHay}`.toLowerCase().includes(q);
      });

      if (!showMatch && matchingEps.length === 0) continue;
      if (!showMatch) {
        const seasonNums = new Set(matchingEps.map((e) => e.displaySeason ?? e.seasonNumber));
        scopedNode = {
          show: scopedNode.show,
          seasons: scopedNode.seasons.filter((s) => seasonNums.has(s.seasonNumber)),
          episodes: matchingEps,
        };
      }
    }

    out.push({
      node: scopedNode,
      showActorMatch,
      guestEpisodeMatchCount: !showActorMatch ? epActorMatches.length : 0,
    });
  }

  return out;
}

export function filterSetsByActorAndQuery(
  sets: MovieSetRecord[],
  actorFilter: string | null,
  rawQuery: string
): MovieSetRecord[] {
  const actorNeedle = actorFilter?.trim().toLowerCase() || '';
  const q = rawQuery.trim().toLowerCase();
  const isActorPrefix = q.startsWith('actor:');
  const actorQuery = isActorPrefix ? q.slice(6).trim() : q;

  return sets
    .map((s) => {
      const scopedMovies = actorNeedle
        ? s.movies.filter((m) => Boolean(findActorMatch(m.actors, actorNeedle)))
        : s.movies;
      if (actorNeedle && scopedMovies.length === 0) return null;
      if (!q) return { ...s, movies: scopedMovies };

      const setMatches = !isActorPrefix && s.name.toLowerCase().includes(q);
      const matchingMovies = scopedMovies.filter((m) => {
        if (isActorPrefix) return actorsMatchText(m.actors, actorQuery);
        const actorHay = m.actors.map((a) => `${a.name} ${a.role}`).join(' ');
        return `${m.title} ${actorHay}`.toLowerCase().includes(q);
      });

      if (!setMatches && matchingMovies.length === 0) return null;
      return { ...s, movies: setMatches ? scopedMovies : matchingMovies };
    })
    .filter((x): x is MovieSetRecord => Boolean(x));
}

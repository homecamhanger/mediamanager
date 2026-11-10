# KodiVault — Kodi Media Library Manager

A full-featured, browser-based media manager built specifically for **Kodi** libraries (v19 Matrix / v20 Nexus / v21 Omega). Manage movies, TV shows, seasons, episodes, movie sets, multi-source metadata scrapers, Kodi NFO XML files, artwork, subtitles, and automated folder/file renaming.

## Key Features

- **Multi-Source Scraper Engine & Field Precedence Matrix**
  - Supports **TMDb**, **OMDb (IMDb, Rotten Tomatoes, Metacritic)**, **TheTVDB v4**, **Fanart.tv**, **Trakt.tv**, keyless public scrapers (**TVmaze**, **Jikan / MyAnimeList**, **Apple iTunes Search**, **Wikipedia / Wikidata**), and a built-in **Kodi Reference Catalog** fallback for offline/demo operation. Keyless scrapers always run when enabled regardless of API key configuration or demo mode.
  - Aggregates ratings across IMDb, TMDb, Rotten Tomatoes, Metacritic, Trakt, TVmaze, and MAL into Kodi's `<ratings>` XML schema.
  - Configure per-field source priority (`Title`, `Plot`, `Ratings`, `Cast`, `Genres`, `Certification`, `Artwork`, `Episode Guide`).
  - Interactive match picker with candidate confidence, multi-provider diff preview, and artwork selector (`poster`, `fanart`, `clearlogo`, `clearart`, `disc`, `banner`, `landscape`).

- **Kodi NFO Reader, Writer & Validator**
  - Parses and writes Kodi-compliant `movie.nfo`, `<filename>.nfo`, `tvshow.nfo`, `season.nfo`, and `<episode>.nfo` (including multi-episode `<episodedetails>` files).
  - Preserves `<uniqueid type="..." default="true">`, `<ratings>`, `<set>`, `<actor>`, `<playcount>`, `<watched>`, `<userrating>`, and `<fileinfo><streamdetails>`.
  - Built-in NFO XML Editor and Kodi v21 Omega schema validator with batch regeneration.

- **Subtitle Downloader & Sync Studio**
  - Computes official 64-bit **OpenSubtitles `moviehash`** on video files.
  - Searches **OpenSubtitles.com REST API v1**, **SubDL**, and the built-in local sync fallback engine.
  - Saves sidecar subtitles using Kodi naming conventions (`.en.srt`, `.en.forced.srt`, `.es.sdh.srt`).
  - Built-in SRT cue viewer, timestamp shifter (`+/- ms`), FPS rescaler (`23.976 ↔ 25.000`), Hearing-Impaired tag stripper, and Forced/SDH flag toggles.

- **Automatic File & Folder Renamer**
  - Customizable Movie Folder, Movie File, TV Show Folder, Season Folder, and Episode File templates with conditional blocks (e.g. `{ [imdbid-{imdb_id}]}`, `{ - {edition}}`).
  - Automatically moves and renames matching `.nfo`, subtitle, artwork, and trailer sidecar files, cleans empty directories, detects conflicts, and provides **1-click Undo / Rollback**.

- **Library Health Audit, Movie Sets & Kodi Integration**
  - Detects unscraped items, missing NFOs, missing artwork, missing preferred-language subtitles, duplicate movies/episodes, NFO schema warnings, and sub-1080p items.
  - Movie Sets (`<set>`) manager, technical media stream probe (`ffprobe` + pure-JS MP4 container inspector), **Kodi JSON-RPC** bridge (`Scan`, `Clean`, connection test), and **Smart Playlist (`.xsp`)**, `sources.xml`, CSV, and JSON exports.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. On first launch with no configured folders, KodiVault initializes a realistic sample library in `./sample-library` so you can immediately explore scraping, NFO editing, subtitle downloading, and batch renaming. Add your own Movie or TV Show folders anytime under **Settings & Kodi**.

### Production Build & Tests

```bash
npm test
npm run typecheck
npm run build
npm start
```

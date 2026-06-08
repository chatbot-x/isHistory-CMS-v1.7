/**
 * isHistory CMS Plugin — Content Cache
 *
 * Dual-collection, incremental content index.
 * v1.5.0: Fully dynamic tracks, statuses, and regex patterns
 * derived from settings rather than hardcoded constants.
 */

import { type App, type TFile } from "obsidian";
import {
  type ContentItem,
  type CollectionType,
  type CacheStats,
  type IsHistorySettings,
  type TrackCode,
  type ValidationResult,
  type ValidationConfig,
  type ArchiveFrontmatter,
  type VaultFrontmatter,
  normalizePathSetting,
  getValidationConfig,
  buildSeriesOrderRegex,
  RECENT_THRESHOLD_MS,
  DEFAULT_STALE_THRESHOLD_MS,
  type SortMode,
} from "./types";
import { validateArchive, validateVault, getStatus } from "./validator";
import { calculateArchiveSEO, calculateVaultSEO, type SEOConfig } from "./seo";

export class ContentCache {
  items: Map<string, ContentItem> = new Map();
  private _stats: CacheStats | null = null;
  private _statsDirty = true;

  // ─── Collection Detection ───

  _getCollection(path: string, settings: IsHistorySettings): CollectionType | null {
    const normalizedArchive = normalizePathSetting(settings.archivePath);
    const normalizedVault = normalizePathSetting(settings.vaultPath);
    // Boundary-aware: must match exact path or path + separator to avoid
    // "src/content/blog-vault" matching archivePath "src/content/blog"
    // Also skip empty paths to avoid matching every file in the vault
    if (normalizedArchive && (path === normalizedArchive || path.startsWith(normalizedArchive + "/"))) return "archive";
    if (normalizedVault && (path === normalizedVault || path.startsWith(normalizedVault + "/"))) return "vault";
    return null;
  }

  // ─── Build Item from File ───

  _buildItem(file: TFile, app: App, settings: IsHistorySettings, config?: ValidationConfig, seriesRegex?: RegExp): ContentItem | null {
    try {
      const collection = this._getCollection(file.path, settings);
      if (!collection) return null;

      const cache = app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter || {};
      const valConfig = config || getValidationConfig(settings);

      // Validate using the correct schema
      let validation: ValidationResult;
      if (collection === "archive") {
        validation = getStatus(validateArchive(fm as ArchiveFrontmatter | null, valConfig));
      } else {
        validation = getStatus(validateVault(fm as VaultFrontmatter | null, valConfig));
      }

      // Derive track from seriesOrder if track field missing (dynamic regex)
      let track: TrackCode | null = fm.track || null;
      const sRegex = seriesRegex || buildSeriesOrderRegex(settings.tracks);
      if (!track && fm.seriesOrder && typeof fm.seriesOrder === "string") {
        const m = fm.seriesOrder.match(sRegex);
        if (m) track = m[1] as TrackCode;
      }

      // Normalize tags and aliases: YAML shorthand (bare string) → single-element array
      const tags = Array.isArray(fm.tags)
        ? fm.tags as string[]
        : typeof fm.tags === "string"
          ? [fm.tags]
          : [];
      const aliases = Array.isArray(fm.aliases)
        ? fm.aliases as string[]
        : typeof fm.aliases === "string"
          ? [fm.aliases]
          : [];

      // v1.7.0: Calculate SEO score
      let seoScore: number | null = null;
      if (settings.showSeoScore) {
        try {
          // Body content is async to read; scoring works with frontmatter-only checks
          // Word count check will show as failed until body is read (acceptable tradeoff)
          const bodyContent = "";
          const seoConfig: SEOConfig = {
            titleOptimalMin: settings.seoTitleOptimalMin,
            titleOptimalMax: settings.seoTitleOptimalMax,
            descOptimalMin: settings.seoDescOptimalMin,
            descOptimalMax: settings.seoDescOptimalMax,
            minWordCount: settings.seoMinWordCount,
            minTags: settings.seoMinTags,
            imageRequired: true,
            internalLinksRequired: true,
          };
          if (collection === "archive") {
            const result = calculateArchiveSEO(fm as ArchiveFrontmatter | null, bodyContent, valConfig, seoConfig);
            seoScore = result.score;
          } else {
            const result = calculateVaultSEO(fm as VaultFrontmatter | null, bodyContent);
            seoScore = result.score;
          }
        } catch {
          seoScore = null;
        }
      }

      // v1.7.0: Stale content detection
      const isStale = _isItemStale(file, settings);

      return {
        file,
        path: file.path,
        collection,
        name: file.basename,
        title: fm.title || file.basename,
        description: fm.description || "",
        date: fm.date ? String(fm.date) : "",
        status: fm.status || "",
        draft: fm.draft === true,
        track,
        series: fm.series || "",
        seriesOrder: fm.seriesOrder || "",
        part: fm.part || "",
        era: fm.era || "",
        figures: fm.figures || "",
        connects: fm.connects || "",
        image: fm.image || "",
        tags,
        aliases,
        publish: fm.publish as boolean | undefined,
        order: fm.order as number | undefined,
        validation,
        seoScore,
        isStale,
      };
    } catch {
      return null;
    }
  }

  // ─── Full Scan ───

  scanAll(app: App, settings: IsHistorySettings): void {
    try {
      const files = app.vault.getMarkdownFiles();
      const contentFiles = files.filter((f) => this.isInCollection(f.path, settings));
      const currentPaths = new Set(contentFiles.map((f) => f.path));

      // Build config and regex once for all files (performance: avoids O(n) repeated construction)
      const config = getValidationConfig(settings);
      const seriesRegex = buildSeriesOrderRegex(settings.tracks);

      // Remove stale entries
      for (const path of [...this.items.keys()]) {
        if (!currentPaths.has(path)) {
          this.items.delete(path);
          this._statsDirty = true;
        }
      }

      // Rebuild items, only mark dirty if content actually changed
      for (const file of contentFiles) {
        const item = this._buildItem(file, app, settings, config, seriesRegex);
        if (item) {
          const existing = this.items.get(file.path);
          if (!existing || this._itemFingerprint(existing) !== this._itemFingerprint(item)) {
            this.items.set(file.path, item);
            this._statsDirty = true;
          }
        }
      }
    } catch (e) {
      console.error("isHistory CMS: scanAll failed", e);
    }
  }

  // ─── Incremental Update ───

  updateFile(file: TFile, app: App, settings: IsHistorySettings): void {
    try {
      if (!this._getCollection(file.path, settings)) return;
      const item = this._buildItem(file, app, settings);
      if (item) {
        this.items.set(file.path, item);
        this._statsDirty = true;
      }
    } catch (e) {
      console.error("isHistory CMS: updateFile failed", e);
    }
  }

  removeFile(path: string): void {
    if (this.items.has(path)) {
      this.items.delete(path);
      this._statsDirty = true;
    }
  }

  isInCollection(path: string, settings: IsHistorySettings): boolean {
    const normalizedArchive = normalizePathSetting(settings.archivePath);
    const normalizedVault = normalizePathSetting(settings.vaultPath);
    // Boundary-aware and skip empty paths
    return (
      (!!normalizedArchive && (path === normalizedArchive || path.startsWith(normalizedArchive + "/"))) ||
      (!!normalizedVault && (path === normalizedVault || path.startsWith(normalizedVault + "/")))
    );
  }

  // ─── Item Fingerprint (for change detection) ───

  private _itemFingerprint(item: ContentItem): string {
    return JSON.stringify({
      t: item.title, d: item.draft, s: item.status,
      v: item.validation.status, tr: item.track,
      desc: item.description, era: item.era, date: item.date,
      part: item.part, figures: item.figures, tags: item.tags,
      so: item.seriesOrder, errs: item.validation.errors.length,
      connects: item.connects, image: item.image,
      aliases: item.aliases, series: item.series,
      publish: item.publish, order: item.order,
    });
  }

  // ─── Statistics (dynamic tracks + v1.7.0 stale/seo) ───

  getStats(settings: IsHistorySettings): CacheStats {
    if (!this._statsDirty && this._stats) return this._stats;

    try {
      const items = [...this.items.values()];
      const archive = items.filter((i) => i.collection === "archive");
      const vault = items.filter((i) => i.collection === "vault");

      // Dynamic track counts from settings
      const trackCounts: Record<string, number> = {};
      for (const code of Object.keys(settings.tracks)) {
        trackCounts[code] = archive.filter((i) => i.track === code).length;
      }
      trackCounts["none"] = archive.filter((i) => !i.track).length;

      // v1.7.0: Stale count
      const staleCount = items.filter((i) => i.isStale).length;

      // v1.7.0: Average SEO score (only items with a score)
      const scoredItems = items.filter((i) => i.seoScore !== null);
      const avgSeoScore = scoredItems.length > 0
        ? Math.round(scoredItems.reduce((sum, i) => sum + (i.seoScore || 0), 0) / scoredItems.length)
        : 0;

      const stats: CacheStats = {
        total: items.length,
        archiveTotal: archive.length,
        vaultTotal: vault.length,
        drafts: archive.filter((i) => i.draft).length,
        published: archive.filter((i) => i.status === "published").length,
        upcoming: archive.filter((i) => i.status === "upcoming").length,
        planned: archive.filter((i) => i.status === "planned").length,
        ready: items.filter((i) => i.validation.status === "ready").length,
        errors: items.filter((i) => i.validation.status === "error").length,
        warnings: items.filter((i) => i.validation.status === "warning").length,
        trackCounts,
        uniqueTags: [...new Set(items.flatMap((i) => i.tags))],
        allEras: [...new Set(archive.map((i) => i.era).filter((e): e is string => !!e))],
        allSeries: [...new Set(archive.map((i) => i.series).filter((s): s is string => !!s))],
        stale: staleCount,
        avgSeoScore,
      };

      this._stats = stats;
      this._statsDirty = false;
      return stats;
    } catch (e) {
      console.error("isHistory CMS: getStats failed", e);
      return {
        total: 0, archiveTotal: 0, vaultTotal: 0, drafts: 0,
        published: 0, upcoming: 0, planned: 0, ready: 0,
        errors: 0, warnings: 0, trackCounts: {},
        uniqueTags: [], allEras: [], allSeries: [],
        stale: 0, avgSeoScore: 0,
      };
    }
  }

  // ─── Sorting (dynamic regex + SortMode) ───

  getSortedItems(collection?: CollectionType, tracks?: Record<string, unknown>, sortMode?: SortMode): ContentItem[] {
    const items = [...this.items.values()];
    const filtered = collection
      ? items.filter((i) => i.collection === collection)
      : items;
    const trackKeys = tracks ? Object.keys(tracks) : [];
    const mode = sortMode || "seriesOrder";

    // Build regex once before sort comparator (perf: avoids O(n log n) regex construction)
    const orderRegex = trackKeys.length > 0
      ? new RegExp(`^([${trackKeys.join("").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}])(\\d+)$`)
      : null;
    const parseOrder = (s: string) => {
      if (!orderRegex) return null;
      const m = s.match(orderRegex);
      return m ? { track: m[1], num: parseInt(m[2], 10) } : null;
    };

    return filtered.sort((a, b) => {
      // Sort by chosen mode
      switch (mode) {
        case "dateNewest": {
          const da = a.date ? Date.parse(a.date) || 0 : 0;
          const db = b.date ? Date.parse(b.date) || 0 : 0;
          return db - da;
        }
        case "dateOldest": {
          const da2 = a.date ? Date.parse(a.date) || Infinity : Infinity;
          const db2 = b.date ? Date.parse(b.date) || Infinity : Infinity;
          return da2 - db2;
        }
        case "titleAZ":
          return a.title.localeCompare(b.title);
        case "errorsFirst": {
          const va = a.validation.status === "error" ? 0 : a.validation.status === "warning" ? 1 : 2;
          const vb = b.validation.status === "error" ? 0 : b.validation.status === "warning" ? 1 : 2;
          return va - vb;
        }
        case "draftsFirst": {
          const da3 = a.draft ? 0 : 1;
          const db3 = b.draft ? 0 : 1;
          return da3 - db3;
        }
        case "seoScore": {
          const sa = a.seoScore ?? -1;
          const sb = b.seoScore ?? -1;
          return sa - sb; // lowest SEO first (needs improvement first)
        }
        case "seriesOrder":
        default: {
          const ao = a.seriesOrder || "";
          const bo = b.seriesOrder || "";

          if (ao && bo) {
            const pa = parseOrder(ao);
            const pb = parseOrder(bo);
            if (pa && pb) {
              if (pa.track !== pb.track) return pa.track.localeCompare(pb.track);
              return pa.num - pb.num;
            }
            return ao.localeCompare(bo);
          }
          if (ao) return -1;
          if (bo) return 1;
          return a.path.localeCompare(b.path);
        }
      }
    });
  }

  // ─── Filtering (multi-criterion AND logic) ───

  matchesFilter(
    item: ContentItem,
    activeFilters: Set<string>,
    searchQuery: string
  ): boolean {
    const hasAll = activeFilters.has("all");

    if (!hasAll) {
      for (const filter of activeFilters) {
        if (!this._matchesSingleFilter(item, filter)) return false;
      }
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.path.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q)) ||
        item.era.toLowerCase().includes(q) ||
        item.figures.toLowerCase().includes(q) ||
        item.seriesOrder.toLowerCase().includes(q)
      );
    }

    return true;
  }

  private _matchesSingleFilter(item: ContentItem, filter: string): boolean {
    if (filter === "archive" && item.collection !== "archive") return false;
    if (filter === "vault" && item.collection !== "vault") return false;
    // Dynamic track filters: "track-A", "track-P", etc.
    if (filter.startsWith("track-")) {
      const code = filter.slice(6);
      if (item.track !== code) return false;
    }
    if (filter === "drafts" && item.draft !== true) return false;
    if (filter === "ready" && item.validation.status !== "ready") return false;
    if (filter === "errors" && item.validation.status !== "error") return false;
    if (filter === "warnings" && item.validation.status !== "warning") return false;
    // Feature 8: Recently modified filter (24h)
    if (filter === "recent") {
      const mtime = item.file.stat?.mtime;
      if (!mtime) return false;
      return (Date.now() - mtime) < RECENT_THRESHOLD_MS;
    }
    // v1.7.0: Stale content filter
    if (filter === "stale" && !item.isStale) return false;
    // v1.7.0: Low SEO score filter (score < 55)
    if (filter === "lowSeo" && (item.seoScore === null || item.seoScore >= 55)) return false;
    return true;
  }

  /** Reset stats dirty flag (for testing). */
  resetStatsDirty(): void {
    this._statsDirty = true;
  }
}

// ─── v1.7.0: Stale Content Detection (module-level pure function) ───

/** Check if a content item is stale based on file modification time and settings */
function _isItemStale(file: TFile, settings: IsHistorySettings): boolean {
  try {
    const mtime = file.stat?.mtime;
    if (!mtime) return false;
    const thresholdMs = (settings.staleThresholdDays || 30) * 24 * 60 * 60 * 1000;
    return (Date.now() - mtime) > thresholdMs;
  } catch {
    return false;
  }
}

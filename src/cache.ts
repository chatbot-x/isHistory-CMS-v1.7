/**
 * isHistory CMS Plugin — Content Cache
 *
 * Dual-collection, incremental content index.
 * v1.9.0: Dynamic collections system — uses findCollectionByPath() for
 * longest-path-first matching, collection-aware SEO scoring and stats.
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
  type CollectionConfig,
  normalizePathSetting,
  getValidationConfig,
  buildSeriesOrderRegex,
  findCollectionByPath,
  getRecentThresholdMs,
  DEFAULT_STALE_THRESHOLD_MS,
  type SortMode,
} from "./types";
import { validateArchive, validateVault, validateForCollection, getStatus } from "./validator";
import { calculateArchiveSEO, calculateVaultSEO, calculateCollectionSEO, type SEOConfig, type SEOScoreResult, SEO_GRADE_COLORS, SEO_GRADE_THRESHOLDS } from "./seo";

export class ContentCache {
  items: Map<string, ContentItem> = new Map();
  private _stats: CacheStats | null = null;
  private _statsDirty = true;

  // ─── Collection Detection (v1.9.0: longest-path-first matching) ───

  _getCollection(path: string, settings: IsHistorySettings): CollectionType | null {
    const col = findCollectionByPath(settings, path);
    return col ? col.id : null;
  }

  // ─── Build Item from File ───

  _buildItem(file: TFile, app: App, settings: IsHistorySettings, config?: ValidationConfig, seriesRegex?: RegExp): ContentItem | null {
    try {
      const collection = this._getCollection(file.path, settings);
      if (!collection) return null;

      const cache = app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter || {};
      const valConfig = config || getValidationConfig(settings);
      const collectionConfig = findCollectionByPath(settings, file.path);

      // Validate using collection-aware validation
      let validation: ValidationResult;
      if (collectionConfig) {
        validation = getStatus(validateForCollection(fm, valConfig, collectionConfig));
      } else if (collection === "archive") {
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

      // v1.7.0 → v1.9.0: Calculate SEO score with collection-aware scoring
      let seoScore: number | null = null;
      let seoChecks: import("./seo").SEOCheck[] = [];
      if (settings.showSeoScore && collectionConfig) {
        try {
          let bodyContent = "";
          try {
            bodyContent = _readBodyFromCache(app, file, cache);
          } catch { /* body reading is best-effort */ }
          const seoConfig: SEOConfig = {
            titleOptimalMin: settings.seoTitleOptimalMin,
            titleOptimalMax: settings.seoTitleOptimalMax,
            descOptimalMin: settings.seoDescOptimalMin,
            descOptimalMax: settings.seoDescOptimalMax,
            minWordCount: settings.seoMinWordCount,
            minTags: settings.seoMinTags,
            imageRequired: collectionConfig.imageRequired,
            internalLinksRequired: true,
            seoMode: collectionConfig.seoMode,
          };

          const seoResult = calculateCollectionSEO(fm, bodyContent, valConfig, seoConfig);
          if (seoResult === null) {
            seoScore = null;
            seoChecks = [];
          } else {
            seoScore = seoResult.score;
            seoChecks = seoResult.checks;
          }
        } catch {
          seoScore = null;
          seoChecks = [];
        }
      } else if (settings.showSeoScore && !collectionConfig) {
        // Legacy fallback for items without a collection config
        try {
          let bodyContent = "";
          try {
            bodyContent = _readBodyFromCache(app, file, cache);
          } catch { /* body reading is best-effort */ }
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
          let seoResult: SEOScoreResult;
          if (collection === "archive") {
            seoResult = calculateArchiveSEO(fm as ArchiveFrontmatter | null, bodyContent, valConfig, seoConfig);
          } else {
            seoResult = calculateVaultSEO(fm as VaultFrontmatter | null, bodyContent);
          }
          seoScore = seoResult.score;
          seoChecks = seoResult.checks;
        } catch {
          seoScore = null;
          seoChecks = [];
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
        seoChecks,
      };
    } catch {
      return null;
    }
  }

  // ─── v1.8.0: Async body content refresh for accurate SEO word counts ───

  /** Async refresh: read file bodies and recalculate SEO scores with accurate word counts. */
  async refreshSEOWithBodies(app: App, settings: IsHistorySettings): Promise<void> {
    try {
      const config = getValidationConfig(settings);
      const seriesRegex = buildSeriesOrderRegex(settings.tracks);

      for (const [path, item] of this.items) {
        if (!settings.showSeoScore || item.seoScore === null) continue;
        try {
          const raw = await app.vault.read(item.file);
          const bodyContent = raw.replace(/^---[\s\S]*?---\n*/, "");
          const cache = app.metadataCache.getFileCache(item.file);
          const fm = cache?.frontmatter || {};
          const collectionConfig = findCollectionByPath(settings, item.path);

          let seoResult: SEOScoreResult | null;

          if (collectionConfig) {
            const seoConfig: SEOConfig = {
              titleOptimalMin: settings.seoTitleOptimalMin,
              titleOptimalMax: settings.seoTitleOptimalMax,
              descOptimalMin: settings.seoDescOptimalMin,
              descOptimalMax: settings.seoDescOptimalMax,
              minWordCount: settings.seoMinWordCount,
              minTags: settings.seoMinTags,
              imageRequired: collectionConfig.imageRequired,
              internalLinksRequired: true,
              seoMode: collectionConfig.seoMode,
            };
            seoResult = calculateCollectionSEO(fm, bodyContent, config, seoConfig);
          } else {
            // Legacy fallback
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
            if (item.collection === "archive") {
              seoResult = calculateArchiveSEO(fm as ArchiveFrontmatter | null, bodyContent, config, seoConfig);
            } else {
              seoResult = calculateVaultSEO(fm as VaultFrontmatter | null, bodyContent);
            }
          }

          if (seoResult === null) {
            // seoMode is "none"
            if (item.seoScore !== null) {
              item.seoScore = null;
              item.seoChecks = [];
              this._statsDirty = true;
            }
            continue;
          }

          // Only update if score changed (avoid unnecessary dirty flags)
          if (item.seoScore !== seoResult.score) {
            item.seoScore = seoResult.score;
            item.seoChecks = seoResult.checks;
            this._statsDirty = true;
          } else if (item.seoChecks.length !== seoResult.checks.length) {
            item.seoChecks = seoResult.checks;
            this._statsDirty = true;
          }
        } catch { /* skip files that can't be read */ }
      }
    } catch (e) {
      console.error("isHistory CMS: refreshSEOWithBodies failed", e);
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
    // v1.9.0: Use dynamic collection detection
    return findCollectionByPath(settings, path) !== undefined;
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
      seo: item.seoScore,
    });
  }

  // ─── Statistics (v1.9.0: dynamic collections + configurable thresholds) ───

  getStats(settings: IsHistorySettings): CacheStats {
    if (!this._statsDirty && this._stats) return this._stats;

    try {
      const items = [...this.items.values()];

      // v1.9.0: Per-collection totals
      const collectionTotals: Record<string, number> = {};
      for (const col of settings.collections) {
        collectionTotals[col.id] = items.filter((i) => i.collection === col.id).length;
      }

      // Legacy compat
      const archiveTotal = collectionTotals["archive"] ?? items.filter((i) => i.collection === "archive").length;
      const vaultTotal = collectionTotals["vault"] ?? items.filter((i) => i.collection === "vault").length;

      // Dynamic track counts from settings
      const trackCounts: Record<string, number> = {};
      for (const code of Object.keys(settings.tracks)) {
        trackCounts[code] = items.filter((i) => i.collection === "archive" && i.track === code).length;
      }
      trackCounts["none"] = items.filter((i) => i.collection === "archive" && !i.track).length;

      // v1.7.0: Stale count
      const staleCount = items.filter((i) => i.isStale).length;

      // v1.7.0: Average SEO score (only items with a score)
      const scoredItems = items.filter((i) => i.seoScore !== null);
      const avgSeoScore = scoredItems.length > 0
        ? Math.round(scoredItems.reduce((sum, i) => sum + (i.seoScore || 0), 0) / scoredItems.length)
        : 0;

      // v1.9.0: Dynamic status counts from settings.statuses
      const statusCounts: Record<string, number> = {};
      for (const status of settings.statuses) {
        statusCounts[status] = items.filter((i) => i.status === status).length;
      }

      const stats: CacheStats = {
        total: items.length,
        archiveTotal,
        vaultTotal,
        collectionTotals,
        drafts: items.filter((i) => i.draft).length,
        published: statusCounts["published"] ?? 0,
        upcoming: statusCounts["upcoming"] ?? 0,
        planned: statusCounts["planned"] ?? 0,
        ready: items.filter((i) => i.validation.status === "ready").length,
        errors: items.filter((i) => i.validation.status === "error").length,
        warnings: items.filter((i) => i.validation.status === "warning").length,
        trackCounts,
        uniqueTags: [...new Set(items.flatMap((i) => i.tags))],
        allEras: [...new Set(items.filter((i) => i.collection === "archive").map((i) => i.era).filter((e): e is string => !!e))],
        allSeries: [...new Set(items.filter((i) => i.collection === "archive").map((i) => i.series).filter((s): s is string => !!s))],
        stale: staleCount,
        avgSeoScore,
      };

      this._stats = stats;
      this._statsDirty = false;
      return stats;
    } catch (e) {
      console.error("isHistory CMS: getStats failed", e);
      return {
        total: 0, archiveTotal: 0, vaultTotal: 0, collectionTotals: {},
        drafts: 0, published: 0, upcoming: 0, planned: 0, ready: 0,
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

  private _matchesSingleFilter(item: ContentItem, filter: string, settings?: IsHistorySettings): boolean {
    // v1.9.0: Dynamic collection filters — "collection-{id}" pattern
    if (filter.startsWith("collection-")) {
      const collectionId = filter.slice("collection-".length);
      if (item.collection !== collectionId) return false;
    }
    // Legacy: "archive" and "vault" filters still work
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
    // Feature 8: Recently modified filter (configurable hours)
    if (filter === "recent") {
      const mtime = item.file.stat?.mtime;
      if (!mtime) return false;
      // Use configurable threshold — fallback to 24h if no settings available
      const thresholdMs = settings ? getRecentThresholdMs(settings) : 24 * 60 * 60 * 1000;
      return (Date.now() - mtime) < thresholdMs;
    }
    // v1.7.0: Stale content filter
    if (filter === "stale" && !item.isStale) return false;
    // v1.9.0: Low SEO score filter (configurable threshold)
    if (filter === "lowSeo") {
      const threshold = settings?.seoLowScoreThreshold ?? 55;
      if (item.seoScore === null || item.seoScore >= threshold) return false;
    }
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

/**
 * v1.8.0: Best-effort synchronous body content extraction from Obsidian's internal cache.
 */
function _readBodyFromCache(app: App, file: TFile, metadata: any): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fileCache = (app as any).metadataCache?.fileCache?.[file.path];
    if (fileCache?.hash) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = (app.vault as any).adapter;
      if (adapter?.files?.[file.path]?.stat) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vaultFiles = (app.vault as any).files;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const internalCache = (app as any).vault?.readCache?.[file.path];
        if (typeof internalCache === "string") {
          return _extractBody(internalCache);
        }
      }
    }

    // Strategy 2: If Obsidian has already opened this file
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeView = app.workspace.getActiveViewOfType({} as any);
    if (activeView && (activeView as any).file?.path === file.path) {
      const editor = (activeView as any).editor;
      if (editor?.getValue) {
        return _extractBody(editor.getValue());
      }
    }
  } catch { /* best-effort */ }

  return "";
}

/** Extract body content from a full markdown string (strip frontmatter) */
function _extractBody(fullContent: string): string {
  if (!fullContent) return "";
  const match = fullContent.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  if (match) {
    return fullContent.slice(match[0].length);
  }
  return fullContent;
}

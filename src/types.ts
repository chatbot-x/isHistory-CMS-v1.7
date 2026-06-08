/**
 * isHistory CMS Plugin — Type Definitions
 *
 * Central type declarations shared across all modules.
 * v1.9.0: Dynamic collections system replacing hardcoded archive/vault model.
 */

import { TFile } from "obsidian";
import type { SEOScoreResult, SEOCheck } from "./seo";

// ─── Track System (now fully dynamic) ───

export interface TrackInfo {
  name: string;
  emoji: string;
  color: string;
}

/** Track codes are now arbitrary strings, validated against settings.tracks keys */
export type TrackCode = string;

/** Default track definitions — used as initial settings value */
export const DEFAULT_TRACKS: Record<string, TrackInfo> = {
  A: { name: "Articles", emoji: "\u{1F4F0}", color: "#7c3aed" },
  P: { name: "Profiles", emoji: "\u{1F9E0}", color: "#3b82f6" },
  E: { name: "Events", emoji: "\u26A1", color: "#f59e0b" },
};

/** Default status values — used as initial settings value */
export const DEFAULT_STATUSES = ["published", "upcoming", "planned"] as const;
export type Status = string;

// ─── v1.9.0: Dynamic Collections ───

export interface CollectionConfig {
  /** Unique collection ID (e.g. "archive", "vault", "knowledge-base") */
  id: string;
  /** Display name (e.g. "Blog Posts", "Research Notes") */
  name: string;
  /** Content folder path (e.g. "src/content/blog") */
  path: string;
  /** Emoji for UI badges (e.g. "📝") */
  emoji: string;
  /** Color for dashboard (e.g. "#7c3aed") */
  color: string;
  /** What SEO scoring to apply */
  seoMode: "full" | "basic" | "none";
  /** Frontmatter fields required for this collection */
  requiredFields: string[];
  /** Whether image is required for full SEO score */
  imageRequired: boolean;
  /** Whether new posts can be created in this collection */
  canCreateNew: boolean;
  /** Default draft state for new items in this collection */
  defaultDraft: boolean;
}

/** Default collections — mirrors the original archive/vault model */
export const DEFAULT_COLLECTIONS: CollectionConfig[] = [
  {
    id: "archive",
    name: "Archive",
    path: "src/content/blog",
    emoji: "\u{1F4DD}",
    color: "#7c3aed",
    seoMode: "full",
    requiredFields: ["title", "date", "description"],
    imageRequired: true,
    canCreateNew: true,
    defaultDraft: true,
  },
  {
    id: "vault",
    name: "Vault",
    path: "src/content/vault",
    emoji: "\u{1F512}",
    color: "#3b82f6",
    seoMode: "basic",
    requiredFields: ["title"],
    imageRequired: false,
    canCreateNew: false,
    defaultDraft: true,
  },
];

// ─── Validation ───

export type Severity = "error" | "warning";

export interface ValidationError {
  field: string;
  message: string;
  severity: Severity;
}

export type ValidationStatus = "ready" | "error" | "warning";

export interface ValidationResult {
  status: ValidationStatus;
  label: string;
  errors: ValidationError[];
}

/**
 * Configuration passed to validation functions.
 * Extracted from settings so validators don't depend on the full settings object.
 */
export interface ValidationConfig {
  tracks: Record<string, TrackInfo>;
  statuses: string[];
  minTitleLength: number;
  maxTitleLength: number;
  minDescriptionLength: number;
  maxDescriptionLength: number;
  requiredArchiveFields: string[];
  imagePrefix: string;
}

/** Default validation config for tests and fallbacks */
export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  tracks: DEFAULT_TRACKS,
  statuses: [...DEFAULT_STATUSES],
  minTitleLength: 5,
  maxTitleLength: 120,
  minDescriptionLength: 15,
  maxDescriptionLength: 160,
  requiredArchiveFields: ["title", "date", "description"],
  imagePrefix: "/",
};

/** Extract ValidationConfig from full settings */
export function getValidationConfig(settings: IsHistorySettings): ValidationConfig {
  return {
    tracks: settings.tracks,
    statuses: settings.statuses,
    minTitleLength: settings.minTitleLength,
    maxTitleLength: settings.maxTitleLength,
    minDescriptionLength: settings.minDescriptionLength,
    maxDescriptionLength: settings.maxDescriptionLength,
    requiredArchiveFields: settings.requiredArchiveFields,
    imagePrefix: settings.imagePrefix,
  };
}

// ─── Content Items ───

/** v1.9.0: CollectionType is now a dynamic string (any collection ID) */
export type CollectionType = string;

export interface ContentItem {
  file: TFile;
  path: string;
  collection: CollectionType;
  name: string;
  title: string;
  description: string;
  date: string;
  status: string;
  draft: boolean;
  track: TrackCode | null;
  series: string;
  seriesOrder: string;
  part: string;
  era: string;
  figures: string;
  connects: string;
  image: string;
  tags: string[];
  aliases: string[];
  publish: boolean | undefined;
  order: number | undefined;
  validation: ValidationResult;
  /** v1.7.0: SEO score (0-100) */
  seoScore: number | null;
  /** v1.7.0: Whether content is stale */
  isStale: boolean;
  /** v1.8.0: SEO check breakdown */
  seoChecks: SEOCheck[];
}

// ─── Cache Stats

export interface CacheStats {
  total: number;
  /** @deprecated Use collectionTotals["archive"] instead */
  archiveTotal: number;
  /** @deprecated Use collectionTotals["vault"] instead */
  vaultTotal: number;
  /** v1.9.0: Per-collection item counts */
  collectionTotals: Record<string, number>;
  drafts: number;
  published: number;
  upcoming: number;
  planned: number;
  ready: number;
  errors: number;
  warnings: number;
  trackCounts: Record<string, number>;
  uniqueTags: string[];
  allEras: string[];
  allSeries: string[];
  /** v1.7.0: Stale content count */
  stale: number;
  /** v1.7.0: Average SEO score across all items */
  avgSeoScore: number;
}

// ─── Settings ───

export const SETTINGS_VERSION = 11;

export interface IsHistorySettings {
  _version: number;

  // ─── v1.9.0: Dynamic Collections ───
  collections: CollectionConfig[];

  // ─── Content Paths (deprecated — kept for backward compat) ───
  /** @deprecated Use collections[0].path instead */
  archivePath: string;
  /** @deprecated Use collections[1].path instead */
  vaultPath: string;

  // ─── Tracks & Statuses (fully dynamic) ───
  tracks: Record<string, TrackInfo>;
  statuses: string[];

  // ─── Validation ───
  minTitleLength: number;
  maxTitleLength: number;
  minDescriptionLength: number;
  maxDescriptionLength: number;
  requiredArchiveFields: string[];
  imagePrefix: string;

  // ─── Display ───
  cardsPerPage: number;
  showRibbonIcon: boolean;
  descriptionTruncation: number;
  figuresTruncation: number;
  maxTagsPerCard: number;
  maxErrorsPerCard: number;
  maxMetaTags: number;

  // ─── New Post Template ───
  defaultSeries: string;
  newPostSlug: string;
  newPostTitle: string;
  newPostImage: string;
  newPostStatus: string;
  newPostBody: string;

  // ─── Pre-flight ───
  preflightDraft: boolean;
  preflightStatus: string;
  preflightAutoDate: boolean;

  // ─── v1.7.0: Stale Content Alerts ───
  staleThresholdDays: number;
  showStaleBadge: boolean;

  // ─── v1.7.0: SEO Score Card ───
  showSeoScore: boolean;
  seoTitleOptimalMin: number;
  seoTitleOptimalMax: number;
  seoDescOptimalMin: number;
  seoDescOptimalMax: number;
  seoMinWordCount: number;
  seoMinTags: number;

  // ─── v1.8.0: Content Templates per Track ───
  /** Per-track template overrides. Key = track code, value = template fields */
  trackTemplates: Record<string, TrackTemplate>;

  // ─── v1.8.0: Content Health Report ───
  /** Path where health reports are saved */
  reportPath: string;

  // ─── v1.9.0: Configurable thresholds ───
  /** Low SEO score threshold (default 55) */
  seoLowScoreThreshold: number;
  /** Recent threshold in hours (default 24) */
  recentThresholdHours: number;
}

export const DEFAULT_SETTINGS: IsHistorySettings = {
  _version: SETTINGS_VERSION,
  archivePath: "src/content/blog",
  vaultPath: "src/content/vault",
  collections: DEFAULT_COLLECTIONS.map((c) => ({ ...c })),
  cardsPerPage: 40,
  showRibbonIcon: true,
  defaultSeries: "minds-and-machines",

  // Dynamic tracks & statuses
  tracks: { ...DEFAULT_TRACKS },
  statuses: [...DEFAULT_STATUSES],

  // Validation thresholds
  minTitleLength: 5,
  maxTitleLength: 120,
  minDescriptionLength: 15,
  maxDescriptionLength: 160,
  requiredArchiveFields: ["title", "date", "description"],
  imagePrefix: "/",

  // Display limits
  descriptionTruncation: 120,
  figuresTruncation: 60,
  maxTagsPerCard: 4,
  maxErrorsPerCard: 3,
  maxMetaTags: 30,

  // New post template
  newPostSlug: "{{seriesOrder}}-untitled-post",
  newPostTitle: "Untitled {{trackName}} Post",
  newPostImage: "/images/{{seriesOrderLower}}-hero.jpg",
  newPostStatus: "planned",
  newPostBody: "Start writing here...\n",

  // Pre-flight
  preflightDraft: false,
  preflightStatus: "published",
  preflightAutoDate: true,

  // v1.7.0: Stale Content Alerts
  staleThresholdDays: 30,
  showStaleBadge: true,

  // v1.7.0: SEO Score Card
  showSeoScore: true,
  seoTitleOptimalMin: 50,
  seoTitleOptimalMax: 60,
  seoDescOptimalMin: 120,
  seoDescOptimalMax: 160,
  seoMinWordCount: 300,
  seoMinTags: 2,

  // v1.8.0: Content Templates per Track
  trackTemplates: {},

  // v1.8.0: Content Health Report
  reportPath: "isHistory-Report.md",

  // v1.9.0: Configurable thresholds
  seoLowScoreThreshold: 55,
  recentThresholdHours: 24,
};

// ─── v1.8.0: Track Template ───

/** Per-track template override for new post creation */
export interface TrackTemplate {
  /** Override slug format for this track */
  slug?: string;
  /** Override title format for this track */
  title?: string;
  /** Override image path for this track */
  image?: string;
  /** Override default series for this track */
  series?: string;
  /** Override default status for this track */
  status?: string;
  /** Override body template for this track */
  body?: string;
  /** Extra frontmatter fields to include (key: value pairs, values are strings) */
  extraFrontmatter?: Record<string, string>;
}

// ─── Frontmatter Schemas ───

export interface ArchiveFrontmatter {
  title?: string;
  date?: string;
  description?: string;
  draft?: boolean;
  tags?: unknown;
  image?: string;
  series?: string;
  seriesOrder?: string;
  track?: string;
  status?: string;
  part?: string;
  figures?: string;
  connects?: string;
  era?: string;
  aliases?: unknown;
}

export interface VaultFrontmatter {
  title?: string;
  created?: string;
  updated?: string;
  author?: string;
  description?: string;
  publish?: boolean;
  tags?: unknown;
  order?: number;
  relatedChapters?: string;
}

// ─── Regex Builders (dynamic, derived from track codes) ───

/** Build seriesOrder regex from current track codes, e.g. /^([APE])(\d+)$/ */
export function buildSeriesOrderRegex(tracks: Record<string, TrackInfo>): RegExp {
  // Escape special regex chars to prevent injection from corrupted track codes
  const codes = Object.keys(tracks).map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("");
  if (!codes) return /^__NO_TRACKS__$/; // safe no-match regex when no tracks defined
  return new RegExp(`^([${codes}])(\\d+)$`);
}

/** Build connects reference regex from current track codes, e.g. /^[APE]\d+$/ */
export function buildConnectsRefRegex(tracks: Record<string, TrackInfo>): RegExp {
  const codes = Object.keys(tracks).map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("");
  if (!codes) return /^__NO_TRACKS__$/;
  return new RegExp(`^[${codes}]\\d+$`);
}

// ─── v1.9.0: Collection Helpers ───

/** Get a collection config by ID from settings */
export function getCollectionConfig(settings: IsHistorySettings, collectionId: string): CollectionConfig | undefined {
  return settings.collections.find((c) => c.id === collectionId);
}

/**
 * Find which collection a file path belongs to using longest-path-first matching.
 * This fixes the prefix bug where "src/content/blog-vault" would incorrectly match "src/content/blog".
 */
export function findCollectionByPath(settings: IsHistorySettings, filePath: string): CollectionConfig | undefined {
  // Sort by path length descending (longest first) to ensure most specific match wins
  const sorted = [...settings.collections]
    .filter((c) => c.path && c.path.trim() !== "")
    .sort((a, b) => b.path.length - a.path.length);

  for (const col of sorted) {
    const normalizedPath = normalizePathSetting(col.path);
    if (!normalizedPath) continue;
    // Boundary-aware: must match exact path or path + separator
    if (filePath === normalizedPath || filePath.startsWith(normalizedPath + "/")) {
      return col;
    }
  }
  return undefined;
}

// ─── Template Engine ───

/** Substitute {{variable}} placeholders in a template string */
export function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

/** Available template variables for the new-post template, with descriptions */
export const TEMPLATE_VARIABLES: { name: string; description: string }[] = [
  { name: "seriesOrder", description: "e.g. A1, P3, E14" },
  { name: "seriesOrderLower", description: "e.g. a1, p3, e14" },
  { name: "track", description: "e.g. A, P, E" },
  { name: "trackName", description: "e.g. Articles, Profiles, Events" },
  { name: "date", description: "e.g. 2024-01-15" },
  { name: "series", description: "e.g. minds-and-machines" },
];

// ─── Utility ───

/** Normalize a path setting: trim whitespace and remove leading/trailing slashes. */
export function normalizePathSetting(path: string): string {
  return path.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

/** Convert hex color to rgba string (safe — falls back to purple on invalid hex) */
export function hexToRgba(hex: string, alpha: number): string {
  if (!hex || hex[0] !== "#") return `rgba(124, 58, 237, ${alpha})`;
  // Expand 3-digit hex shorthand: #abc → #aabbcc
  if (hex.length === 4 && /^#[0-9a-fA-F]{3}$/.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (hex.length < 7) return `rgba(124, 58, 237, ${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(124, 58, 237, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Sort & Filter Types ───

export type SortMode = "seriesOrder" | "dateNewest" | "dateOldest" | "titleAZ" | "errorsFirst" | "draftsFirst" | "seoScore";

/** v1.9.0: RECENT_THRESHOLD_HOURS is now configurable via settings */
export const RECENT_THRESHOLD_HOURS_DEFAULT = 24;

/** Time threshold for "recently modified" filter (default 24 hours in ms) */
export function getRecentThresholdMs(settings: IsHistorySettings): number {
  return (settings.recentThresholdHours || RECENT_THRESHOLD_HOURS_DEFAULT) * 60 * 60 * 1000;
}

/** Legacy constant — kept for backward compat; prefer getRecentThresholdMs() */
export const RECENT_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** v1.7.0: Default stale threshold in ms (30 days) */
export const DEFAULT_STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

/** Deep-merge source into target (mutates target). Handles nested objects and arrays. */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key as keyof T];
    if (srcVal && typeof srcVal === "object" && !Array.isArray(srcVal) && tgtVal && typeof tgtVal === "object" && !Array.isArray(tgtVal)) {
      deepMerge(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else if (srcVal !== undefined) {
      (target as Record<string, unknown>)[key] = srcVal;
    }
  }
  return target;
}

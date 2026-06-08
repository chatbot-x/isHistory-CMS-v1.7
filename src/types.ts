/**
 * isHistory CMS Plugin — Type Definitions
 *
 * Central type declarations shared across all modules.
 * v1.5.0: Fully dynamic tracks, statuses, validation thresholds,
 * display limits, template engine, and pre-flight configuration.
 */

import { TFile } from "obsidian";
import type { SEOScoreResult } from "./seo";

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

export type CollectionType = "archive" | "vault";

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
}

// ─── Cache Stats ───

export interface CacheStats {
  total: number;
  archiveTotal: number;
  vaultTotal: number;
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

export const SETTINGS_VERSION = 9;

export interface IsHistorySettings {
  _version: number;

  // ─── Content Paths ───
  archivePath: string;
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
}

export const DEFAULT_SETTINGS: IsHistorySettings = {
  _version: SETTINGS_VERSION,
  archivePath: "src/content/blog",
  vaultPath: "src/content/vault",
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
};

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

/** Time threshold for "recently modified" filter (24 hours in ms) */
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

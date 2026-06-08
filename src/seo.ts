/**
 * isHistory CMS Plugin — SEO Score Engine
 *
 * Calculates a 0-100 SEO score for content items based on
 * frontmatter completeness, title/description optimization,
 * tags, image, internal links, and word count.
 * v1.9.0: Shared grade constants, seoMode parameter for collection-aware scoring.
 */

import type { ArchiveFrontmatter, VaultFrontmatter, ValidationConfig } from "./types";

// ─── SEO Score Result ───

export interface SEOScoreResult {
  /** 0-100 score */
  score: number;
  /** Letter grade: A, B, C, D, F */
  grade: string;
  /** Color for UI display */
  color: string;
  /** Individual check results */
  checks: SEOCheck[];
}

export interface SEOCheck {
  key: string;
  label: string;
  passed: boolean;
  /** Points awarded if passed (0 if failed) */
  points: number;
  /** Maximum possible points */
  maxPoints: number;
  /** Hint for improving this check */
  hint: string;
}

// ─── Shared Grade Constants (v1.9.0 — stop duplicating magic numbers) ───

export const SEO_GRADE_THRESHOLDS = {
  A: 90,
  B: 75,
  C: 55,
  D: 35,
} as const;

export const SEO_GRADE_COLORS = {
  A: "#10b981", // green
  B: "#3b82f6", // blue
  C: "#f59e0b", // amber
  D: "#f97316", // orange
  F: "#ef4444", // red
} as const;

// ─── SEO Config (extends ValidationConfig) ───

export interface SEOConfig {
  /** Optimal title length for SERP (default: 50-60) */
  titleOptimalMin: number;
  titleOptimalMax: number;
  /** Optimal description length for SERP (default: 120-160) */
  descOptimalMin: number;
  descOptimalMax: number;
  /** Minimum word count for good SEO (default: 300) */
  minWordCount: number;
  /** Minimum tags for discoverability (default: 2) */
  minTags: number;
  /** Whether image is required for full score */
  imageRequired: boolean;
  /** Whether connects (internal links) are required */
  internalLinksRequired: boolean;
  /** v1.9.0: SEO mode for this collection */
  seoMode?: "full" | "basic" | "none";
}

export const DEFAULT_SEO_CONFIG: SEOConfig = {
  titleOptimalMin: 50,
  titleOptimalMax: 60,
  descOptimalMin: 120,
  descOptimalMax: 160,
  minWordCount: 300,
  minTags: 2,
  imageRequired: true,
  internalLinksRequired: true,
};

// ─── Score Grading ───

export function getGrade(score: number): { grade: string; color: string } {
  if (score >= SEO_GRADE_THRESHOLDS.A) return { grade: "A", color: SEO_GRADE_COLORS.A };
  if (score >= SEO_GRADE_THRESHOLDS.B) return { grade: "B", color: SEO_GRADE_COLORS.B };
  if (score >= SEO_GRADE_THRESHOLDS.C) return { grade: "C", color: SEO_GRADE_COLORS.C };
  if (score >= SEO_GRADE_THRESHOLDS.D) return { grade: "D", color: SEO_GRADE_COLORS.D };
  return { grade: "F", color: SEO_GRADE_COLORS.F };
}

/** Get a short summary label for a score (uses shared thresholds) */
export function getSEOLabel(score: number): string {
  if (score >= SEO_GRADE_THRESHOLDS.A) return "Excellent";
  if (score >= SEO_GRADE_THRESHOLDS.B) return "Good";
  if (score >= SEO_GRADE_THRESHOLDS.C) return "Fair";
  if (score >= SEO_GRADE_THRESHOLDS.D) return "Needs Work";
  return "Poor";
}

// ─── v1.9.0: Collection-aware SEO scoring ───

/**
 * Calculate SEO score for any collection using the seoMode from its config.
 * - "none": returns null score
 * - "basic": simplified scoring (vault-style)
 * - "full": full scoring (archive-style)
 */
export function calculateCollectionSEO(
  fm: ArchiveFrontmatter | VaultFrontmatter | null | undefined,
  bodyContent: string,
  config: ValidationConfig,
  seoConfig: SEOConfig = DEFAULT_SEO_CONFIG,
): SEOScoreResult | null {
  const seoMode = seoConfig.seoMode || "full";

  if (seoMode === "none") {
    return null;
  }

  if (seoMode === "basic") {
    return calculateVaultSEO(fm as VaultFrontmatter | null | undefined, bodyContent);
  }

  // "full" mode
  return calculateArchiveSEO(fm as ArchiveFrontmatter | null | undefined, bodyContent, config, seoConfig);
}

// ─── Archive SEO Scoring ───

/**
 * Calculate SEO score for an archive (blog post) item.
 * Returns a 0-100 score with detailed check breakdown.
 *
 * Scoring breakdown (100 points total):
 * - Title present & length: 15 pts
 * - Title in optimal SERP range: 10 pts
 * - Description present & length: 15 pts
 * - Description in optimal range: 10 pts
 * - Image present: 10 pts
 * - Tags (minimum count): 10 pts
 * - Internal links (connects): 10 pts
 * - Word count threshold: 10 pts
 * - Draft status penalty: 5 pts (lost if draft)
 * - Series/track metadata: 5 pts
 */
export function calculateArchiveSEO(
  fm: ArchiveFrontmatter | null | undefined,
  bodyContent: string,
  config: ValidationConfig,
  seoConfig: SEOConfig = DEFAULT_SEO_CONFIG,
): SEOScoreResult {
  const checks: SEOCheck[] = [];

  // ─── Title Present & Length (15 pts) ───
  const titleLength = fm?.title?.length || 0;
  const titleMeetsMin = titleLength >= config.minTitleLength;
  const titleMeetsMax = titleLength <= config.maxTitleLength;
  checks.push({
    key: "title-present",
    label: "Title present & valid length",
    passed: titleMeetsMin && titleMeetsMax,
    points: (titleMeetsMin && titleMeetsMax) ? 15 : 0,
    maxPoints: 15,
    hint: titleLength === 0
      ? "Add a title to your post."
      : titleLength < config.minTitleLength
        ? `Title too short (${titleLength}/${config.minTitleLength} chars).`
        : `Title too long (${titleLength}/${config.maxTitleLength} chars).`,
  });

  // ─── Title in Optimal SERP Range (10 pts) ───
  const titleInOptimal = titleLength >= seoConfig.titleOptimalMin && titleLength <= seoConfig.titleOptimalMax;
  checks.push({
    key: "title-optimal",
    label: "Title in optimal SERP range",
    passed: titleInOptimal,
    points: titleInOptimal ? 10 : 0,
    maxPoints: 10,
    hint: titleLength < seoConfig.titleOptimalMin
      ? `Title shorter than ideal for SERP (${titleLength}/${seoConfig.titleOptimalMin} chars). Aim for ${seoConfig.titleOptimalMin}-${seoConfig.titleOptimalMax}.`
      : titleLength > seoConfig.titleOptimalMax
        ? `Title longer than ideal for SERP (${titleLength}/${seoConfig.titleOptimalMax} chars). Google may truncate.`
        : "Good title length for search results.",
  });

  // ─── Description Present & Length (15 pts) ───
  const descLength = fm?.description?.length || 0;
  const descMeetsMin = descLength >= config.minDescriptionLength;
  const descMeetsMax = descLength <= config.maxDescriptionLength;
  checks.push({
    key: "desc-present",
    label: "Description present & valid length",
    passed: descMeetsMin && descMeetsMax,
    points: (descMeetsMin && descMeetsMax) ? 15 : 0,
    maxPoints: 15,
    hint: descLength === 0
      ? "Add a meta description to improve click-through rates."
      : descLength < config.minDescriptionLength
        ? `Description too short (${descLength}/${config.minDescriptionLength} chars).`
        : `Description too long (${descLength}/${config.maxDescriptionLength} chars).`,
  });

  // ─── Description in Optimal SERP Range (10 pts) ───
  const descInOptimal = descLength >= seoConfig.descOptimalMin && descLength <= seoConfig.descOptimalMax;
  checks.push({
    key: "desc-optimal",
    label: "Description in optimal SERP range",
    passed: descInOptimal,
    points: descInOptimal ? 10 : 0,
    maxPoints: 10,
    hint: descLength < seoConfig.descOptimalMin
      ? `Description shorter than ideal (${descLength}/${seoConfig.descOptimalMin} chars). Aim for ${seoConfig.descOptimalMin}-${seoConfig.descOptimalMax}.`
      : descLength > seoConfig.descOptimalMax
        ? `Description longer than ideal. Google shows ~160 chars.`
        : "Good description length.",
  });

  // ─── Image Present (10 pts) ───
  const hasImage = !!(fm?.image && fm.image.trim() !== "");
  checks.push({
    key: "image-present",
    label: "Hero image set",
    passed: hasImage || !seoConfig.imageRequired,
    points: (hasImage || !seoConfig.imageRequired) ? 10 : 0,
    maxPoints: 10,
    hint: hasImage ? "Hero image is set." : "Add a hero image for social sharing and SEO.",
  });

  // ─── Tags Minimum (10 pts) ───
  const tags = Array.isArray(fm?.tags)
    ? fm.tags as string[]
    : typeof fm?.tags === "string"
      ? [fm.tags]
      : [];
  const hasMinTags = tags.length >= seoConfig.minTags;
  checks.push({
    key: "tags-min",
    label: `At least ${seoConfig.minTags} tag(s)`,
    passed: hasMinTags,
    points: hasMinTags ? 10 : 0,
    maxPoints: 10,
    hint: hasMinTags
      ? `Has ${tags.length} tag(s).`
      : `Only ${tags.length} tag(s). Add at least ${seoConfig.minTags} for discoverability.`,
  });

  // ─── Internal Links / Connects (10 pts) ───
  const hasConnects = !!(fm?.connects && fm.connects.trim() !== "");
  checks.push({
    key: "internal-links",
    label: "Internal links (connects)",
    passed: hasConnects || !seoConfig.internalLinksRequired,
    points: (hasConnects || !seoConfig.internalLinksRequired) ? 10 : 0,
    maxPoints: 10,
    hint: hasConnects
      ? "Internal links are set."
      : "Add connects to link related posts. Internal linking improves SEO.",
  });

  // ─── Word Count (10 pts) ───
  const wordCount = countWords(bodyContent);
  const meetsWordCount = wordCount >= seoConfig.minWordCount;
  checks.push({
    key: "word-count",
    label: `Word count >= ${seoConfig.minWordCount}`,
    passed: meetsWordCount,
    points: meetsWordCount ? 10 : 0,
    maxPoints: 10,
    hint: meetsWordCount
      ? `${wordCount} words — good content depth.`
      : `Only ${wordCount} words. Aim for at least ${seoConfig.minWordCount} for better SEO.`,
  });

  // ─── Not a Draft (5 pts) ───
  const isDraft = fm?.draft === true;
  checks.push({
    key: "not-draft",
    label: "Published (not draft)",
    passed: !isDraft,
    points: isDraft ? 0 : 5,
    maxPoints: 5,
    hint: isDraft
      ? "Post is still a draft. Pre-flight to publish."
      : "Post is published.",
  });

  // ─── Series & Track Metadata (5 pts) ───
  const hasTrack = !!(fm?.track && fm.track.trim() !== "");
  const hasSeries = !!(fm?.series && fm.series.trim() !== "");
  const hasMetadata = hasTrack || hasSeries;
  checks.push({
    key: "series-metadata",
    label: "Track/series metadata set",
    passed: hasMetadata,
    points: hasMetadata ? 5 : 0,
    maxPoints: 5,
    hint: hasMetadata
      ? "Track and series metadata is set."
      : "Add track and series for better content organization.",
  });

  // ─── Calculate Total ───
  const totalPoints = checks.reduce((sum, c) => sum + c.points, 0);
  const maxPoints = checks.reduce((sum, c) => sum + c.maxPoints, 0);
  // Scale to 0-100
  const score = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
  const { grade, color } = getGrade(score);

  return { score, grade, color, checks };
}

// ─── Vault SEO Scoring (simplified) ───

export function calculateVaultSEO(
  fm: VaultFrontmatter | null | undefined,
  bodyContent: string,
): SEOScoreResult {
  const checks: SEOCheck[] = [];

  const hasTitle = !!(fm?.title && fm.title.trim() !== "");
  checks.push({
    key: "title-present",
    label: "Title present",
    passed: hasTitle,
    points: hasTitle ? 30 : 0,
    maxPoints: 30,
    hint: hasTitle ? "Title is set." : "Add a title to this vault note.",
  });

  const hasTags = Array.isArray(fm?.tags) ? fm.tags.length > 0 : typeof fm?.tags === "string";
  checks.push({
    key: "tags-present",
    label: "Tags set",
    passed: hasTags,
    points: hasTags ? 20 : 0,
    maxPoints: 20,
    hint: hasTags ? "Tags are set." : "Add tags for organization.",
  });

  const wordCount = countWords(bodyContent);
  checks.push({
    key: "word-count",
    label: "Has content (word count > 0)",
    passed: wordCount > 0,
    points: wordCount > 0 ? 30 : 0,
    maxPoints: 30,
    hint: wordCount > 0 ? `${wordCount} words written.` : "Start writing content.",
  });

  const isPublished = fm?.publish === true;
  checks.push({
    key: "published",
    label: "Published flag set",
    passed: isPublished,
    points: isPublished ? 20 : 0,
    maxPoints: 20,
    hint: isPublished ? "Note is published." : "Set publish: true when ready.",
  });

  const totalPoints = checks.reduce((sum, c) => sum + c.points, 0);
  const maxPoints = checks.reduce((sum, c) => sum + c.maxPoints, 0);
  const score = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
  const { grade, color } = getGrade(score);

  return { score, grade, color, checks };
}

// ─── Utility ───

/** Count words in a string, handling CJK and whitespace */
function countWords(text: string): number {
  if (!text) return 0;
  // Remove frontmatter block if present
  const bodyOnly = text.replace(/^---[\s\S]*?---\n*/, "");
  // Count CJK characters as individual words
  const cjkChars = (bodyOnly.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
  // Remove CJK and count remaining words
  const withoutCjk = bodyOnly.replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, " ");
  const westernWords = withoutCjk.split(/\s+/).filter((w) => w.length > 0).length;
  return cjkChars + westernWords;
}

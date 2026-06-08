/**
 * isHistory CMS Plugin — Content Health Report Generator
 *
 * v1.9.0: Collection-aware health reports, configurable thresholds,
 * shared grade constants, per-collection breakdowns.
 */

import type { ContentItem, CacheStats, IsHistorySettings, CollectionConfig } from "./types";
import { SEO_GRADE_THRESHOLDS, SEO_GRADE_COLORS } from "./seo";

// ─── Report Types ───

export interface HealthReport {
  /** Report generation timestamp (ISO string) */
  generatedAt: string;
  /** Plugin version */
  version: string;
  /** Overall health score (0-100) */
  healthScore: number;
  /** Summary statistics */
  summary: ReportSummary;
  /** Per-track breakdown */
  trackBreakdown: TrackBreakdown[];
  /** v1.9.0: Per-collection breakdown */
  collectionBreakdown: CollectionBreakdown[];
  /** Items needing attention (sorted by severity) */
  attentionItems: AttentionItem[];
  /** Quick-win recommendations */
  recommendations: string[];
}

export interface ReportSummary {
  totalItems: number;
  readyItems: number;
  errorItems: number;
  warningItems: number;
  draftItems: number;
  staleItems: number;
  avgSeoScore: number;
  lowSeoItems: number;
  uniqueTags: number;
  uniqueEras: number;
}

export interface TrackBreakdown {
  code: string;
  name: string;
  count: number;
  errors: number;
  warnings: number;
  drafts: number;
  avgSeo: number;
}

/** v1.9.0: Per-collection breakdown */
export interface CollectionBreakdown {
  id: string;
  name: string;
  emoji: string;
  count: number;
  errors: number;
  warnings: number;
  drafts: number;
  avgSeo: number;
  seoMode: string;
}

export interface AttentionItem {
  path: string;
  title: string;
  seriesOrder: string;
  collection: string;
  track: string | null;
  issues: string[];
  seoScore: number | null;
  isStale: boolean;
  isDraft: boolean;
}

// ─── Report Generation (pure function) ───

/**
 * Generate a content health report from cached items.
 * v1.9.0: Accept version as parameter, collection-aware thresholds.
 */
export function generateHealthReport(
  items: ContentItem[],
  stats: CacheStats,
  settings: IsHistorySettings,
  version = "1.9.0",
): HealthReport {
  const summary = buildSummary(items, stats, settings);
  const trackBreakdown = buildTrackBreakdown(items, settings);
  const collectionBreakdown = buildCollectionBreakdown(items, settings);
  const attentionItems = buildAttentionItems(items, settings);
  const recommendations = buildRecommendations(items, stats, summary, settings);
  const healthScore = calculateHealthScore(summary);

  return {
    generatedAt: new Date().toISOString(),
    version,
    healthScore,
    summary,
    trackBreakdown,
    collectionBreakdown,
    attentionItems,
    recommendations,
  };
}

// ─── Summary Builder ───

function buildSummary(items: ContentItem[], stats: CacheStats, settings: IsHistorySettings): ReportSummary {
  const lowSeoThreshold = settings.seoLowScoreThreshold ?? 55;
  const lowSeoItems = items.filter(
    (i) => i.seoScore !== null && i.seoScore < lowSeoThreshold,
  ).length;

  return {
    totalItems: stats.total,
    readyItems: stats.ready,
    errorItems: stats.errors,
    warningItems: stats.warnings,
    draftItems: stats.drafts,
    staleItems: stats.stale,
    avgSeoScore: stats.avgSeoScore,
    lowSeoItems,
    uniqueTags: stats.uniqueTags.length,
    uniqueEras: stats.allEras.length,
  };
}

// ─── Track Breakdown ───

function buildTrackBreakdown(
  items: ContentItem[],
  settings: IsHistorySettings,
): TrackBreakdown[] {
  const breakdowns: TrackBreakdown[] = [];

  for (const [code, info] of Object.entries(settings.tracks)) {
    const trackItems = items.filter((i) => i.track === code);
    if (trackItems.length === 0) continue;

    const scored = trackItems.filter((i) => i.seoScore !== null);
    const avgSeo =
      scored.length > 0
        ? Math.round(
            scored.reduce((sum, i) => sum + (i.seoScore || 0), 0) /
              scored.length,
          )
        : 0;

    breakdowns.push({
      code,
      name: info.name,
      count: trackItems.length,
      errors: trackItems.filter((i) => i.validation.status === "error").length,
      warnings: trackItems.filter(
        (i) => i.validation.status === "warning",
      ).length,
      drafts: trackItems.filter((i) => i.draft).length,
      avgSeo,
    });
  }

  // Add "no track" group if any items lack a track
  const noTrack = items.filter(
    (i) => i.collection === "archive" && !i.track,
  );
  if (noTrack.length > 0) {
    breakdowns.push({
      code: "?",
      name: "No Track",
      count: noTrack.length,
      errors: noTrack.filter((i) => i.validation.status === "error").length,
      warnings: noTrack.filter((i) => i.validation.status === "warning")
        .length,
      drafts: noTrack.filter((i) => i.draft).length,
      avgSeo: 0,
    });
  }

  return breakdowns;
}

// ─── v1.9.0: Collection Breakdown ───

function buildCollectionBreakdown(
  items: ContentItem[],
  settings: IsHistorySettings,
): CollectionBreakdown[] {
  const breakdowns: CollectionBreakdown[] = [];

  for (const col of settings.collections) {
    const colItems = items.filter((i) => i.collection === col.id);
    const scored = colItems.filter((i) => i.seoScore !== null);
    const avgSeo =
      scored.length > 0
        ? Math.round(
            scored.reduce((sum, i) => sum + (i.seoScore || 0), 0) /
              scored.length,
          )
        : 0;

    breakdowns.push({
      id: col.id,
      name: col.name,
      emoji: col.emoji,
      count: colItems.length,
      errors: colItems.filter((i) => i.validation.status === "error").length,
      warnings: colItems.filter((i) => i.validation.status === "warning").length,
      drafts: colItems.filter((i) => i.draft).length,
      avgSeo,
      seoMode: col.seoMode,
    });
  }

  return breakdowns;
}

// ─── Attention Items ───

function buildAttentionItems(
  items: ContentItem[],
  settings: IsHistorySettings,
): AttentionItem[] {
  const attentionList: AttentionItem[] = [];
  const lowSeoThreshold = settings.seoLowScoreThreshold ?? 55;

  for (const item of items) {
    const issues: string[] = [];

    // Validation errors
    if (item.validation.status === "error") {
      const errorFields = item.validation.errors
        .filter((e) => e.severity === "error")
        .map((e) => e.field);
      issues.push(
        `Schema errors: ${errorFields.join(", ")}`,
      );
    }

    // Validation warnings
    if (item.validation.status === "warning") {
      const warnFields = item.validation.errors
        .filter((e) => e.severity === "warning")
        .map((e) => e.field);
      issues.push(`Warnings: ${warnFields.join(", ")}`);
    }

    // Low SEO score (configurable threshold)
    if (item.seoScore !== null && item.seoScore < lowSeoThreshold) {
      issues.push(`Low SEO score: ${item.seoScore}/100`);
    }

    // Stale content
    if (item.isStale) {
      issues.push(
        `Stale: not modified in ${settings.staleThresholdDays}+ days`,
      );
    }

    // Draft
    if (item.draft) {
      issues.push("Still in draft");
    }

    if (issues.length > 0) {
      attentionList.push({
        path: item.path,
        title: item.title,
        seriesOrder: item.seriesOrder,
        collection: item.collection,
        track: item.track,
        issues,
        seoScore: item.seoScore,
        isStale: item.isStale,
        isDraft: item.draft,
      });
    }
  }

  // Sort: errors first, then low SEO, then stale, then drafts
  const severityOrder = (a: AttentionItem): number => {
    if (a.issues.some((i) => i.startsWith("Schema errors"))) return 0;
    if (a.issues.some((i) => i.startsWith("Low SEO"))) return 1;
    if (a.isStale) return 2;
    if (a.isDraft) return 3;
    return 4;
  };

  attentionList.sort((a, b) => severityOrder(a) - severityOrder(b));
  return attentionList;
}

// ─── Recommendations ───

function buildRecommendations(
  items: ContentItem[],
  stats: CacheStats,
  summary: ReportSummary,
  settings: IsHistorySettings,
): string[] {
  const recs: string[] = [];
  const lowSeoThreshold = settings.seoLowScoreThreshold ?? 55;
  const minTags = settings.seoMinTags ?? 2;

  // Error items
  if (summary.errorItems > 0) {
    recs.push(
      `Fix ${summary.errorItems} item(s) with schema errors — these may fail to build in Astro.`,
    );
  }

  // Low SEO items
  if (summary.lowSeoItems > 0) {
    recs.push(
      `Improve SEO for ${summary.lowSeoItems} item(s) scoring below ${lowSeoThreshold} — add descriptions, tags, or images.`,
    );
  }

  // Stale items
  if (summary.staleItems > 0) {
    recs.push(
      `Review ${summary.staleItems} stale item(s) — update or archive content older than ${settings.staleThresholdDays} days.`,
    );
  }

  // Drafts
  if (summary.draftItems > 0) {
    recs.push(
      `Pre-flight ${summary.draftItems} draft(s) when they are ready for publication.`,
    );
  }

  // v1.9.0: Collection-aware recommendations
  for (const col of settings.collections) {
    const colItems = items.filter((i) => i.collection === col.id);

    // Missing descriptions (only for collections with full/basic SEO)
    if (col.seoMode !== "none") {
      const noDesc = colItems.filter((i) => !i.description).length;
      if (noDesc > 0) {
        recs.push(
          `Add descriptions to ${noDesc} ${col.name} post(s) — meta descriptions improve click-through rates.`,
        );
      }
    }

    // Missing images (only for collections where images are required)
    if (col.imageRequired) {
      const noImage = colItems.filter((i) => !i.image).length;
      if (noImage > 0) {
        recs.push(
          `Add hero images to ${noImage} ${col.name} post(s) — images improve social sharing and SEO.`,
        );
      }
    }

    // Low tag count (only for collections with full SEO)
    if (col.seoMode === "full") {
      const lowTags = colItems.filter((i) => i.tags.length < minTags).length;
      if (lowTags > 0) {
        recs.push(
          `Add tags to ${lowTags} ${col.name} post(s) — at least ${minTags} tags improve discoverability.`,
        );
      }
    }
  }

  if (recs.length === 0) {
    recs.push(
      "All content looks healthy! Keep up the great work.",
    );
  }

  return recs;
}

// ─── Health Score ───

/**
 * Calculate an overall health score (0-100) based on:
 * - % of items with errors (weighted -3x)
 * - % of items with warnings (weighted -1x)
 * - % of drafts (weighted -0.5x)
 * - Average SEO score
 * - % of stale items (weighted -2x)
 */
function calculateHealthScore(summary: ReportSummary): number {
  if (summary.totalItems === 0) return 100;

  const total = summary.totalItems;

  // Error penalty (0-30 pts lost)
  const errorPenalty = Math.min(30, (summary.errorItems / total) * 90);

  // Warning penalty (0-15 pts lost)
  const warningPenalty = Math.min(15, (summary.warningItems / total) * 45);

  // Draft penalty (0-10 pts lost)
  const draftPenalty = Math.min(10, (summary.draftItems / total) * 30);

  // Stale penalty (0-20 pts lost)
  const stalePenalty = Math.min(20, (summary.staleItems / total) * 60);

  // SEO component (0-25 pts)
  const seoPoints = (summary.avgSeoScore / 100) * 25;

  const score = Math.max(
    0,
    Math.round(100 - errorPenalty - warningPenalty - draftPenalty - stalePenalty + seoPoints - (seoPoints > 0 ? 0 : 0)),
  );

  return Math.min(100, Math.max(0, score));
}

// ─── Markdown Rendering (pure function) ───

/** Render a HealthReport to a markdown string suitable for saving as a .md file */
export function renderReportMarkdown(report: HealthReport): string {
  const lines: string[] = [];

  lines.push(`# isHistory CMS — Content Health Report`);
  lines.push(``);
  lines.push(
    `**Generated:** ${new Date(report.generatedAt).toLocaleString()}`,
  );
  lines.push(`**Version:** v${report.version}`);
  lines.push(
    `**Health Score:** ${report.healthScore}/100 ${_healthLabel(report.healthScore)}`,
  );
  lines.push(``);

  // Summary
  const s = report.summary;
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total items | ${s.totalItems} |`);
  lines.push(`| Ready | ${s.readyItems} |`);
  lines.push(`| Errors | ${s.errorItems} |`);
  lines.push(`| Warnings | ${s.warningItems} |`);
  lines.push(`| Drafts | ${s.draftItems} |`);
  lines.push(`| Stale | ${s.staleItems} |`);
  lines.push(`| Avg SEO Score | ${s.avgSeoScore}/100 |`);
  lines.push(`| Low SEO (<55) | ${s.lowSeoItems} |`);
  lines.push(`| Unique Tags | ${s.uniqueTags} |`);
  lines.push(`| Unique Eras | ${s.uniqueEras} |`);
  lines.push(``);

  // v1.9.0: Collection breakdown
  if (report.collectionBreakdown.length > 0) {
    lines.push(`## Collection Breakdown`);
    lines.push(``);
    lines.push(`| Collection | Items | Errors | Warnings | Drafts | Avg SEO | SEO Mode |`);
    lines.push(`|------------|-------|--------|----------|--------|---------|----------|`);
    for (const c of report.collectionBreakdown) {
      lines.push(
        `| ${c.emoji} ${c.name} | ${c.count} | ${c.errors} | ${c.warnings} | ${c.drafts} | ${c.avgSeo} | ${c.seoMode} |`,
      );
    }
    lines.push(``);
  }

  // Track breakdown
  if (report.trackBreakdown.length > 0) {
    lines.push(`## Track Breakdown`);
    lines.push(``);
    lines.push(`| Track | Count | Errors | Warnings | Drafts | Avg SEO |`);
    lines.push(`|-------|-------|--------|----------|--------|---------|`);
    for (const t of report.trackBreakdown) {
      lines.push(
        `| ${t.code} ${t.name} | ${t.count} | ${t.errors} | ${t.warnings} | ${t.drafts} | ${t.avgSeo} |`,
      );
    }
    lines.push(``);
  }

  // Items needing attention
  if (report.attentionItems.length > 0) {
    lines.push(`## Items Needing Attention`);
    lines.push(``);
    lines.push(
      `_Sorted by severity: errors first, then low SEO, stale, and drafts._`,
    );
    lines.push(``);
    for (const item of report.attentionItems.slice(0, 50)) {
      const code = item.seriesOrder || item.path;
      lines.push(`### ${code}: ${item.title}`);
      lines.push(``);
      lines.push(`- **Path:** \`${item.path}\``);
      lines.push(`- **Collection:** ${item.collection}`);
      if (item.track) lines.push(`- **Track:** ${item.track}`);
      if (item.seoScore !== null)
        lines.push(`- **SEO Score:** ${item.seoScore}/100`);
      lines.push(`- **Issues:**`);
      for (const issue of item.issues) {
        lines.push(`  - ${issue}`);
      }
      lines.push(``);
    }
    if (report.attentionItems.length > 50) {
      lines.push(
        `_...and ${report.attentionItems.length - 50} more items. Fix the above first, then regenerate the report._`,
      );
      lines.push(``);
    }
  }

  // Recommendations
  lines.push(`## Recommendations`);
  lines.push(``);
  for (let i = 0; i < report.recommendations.length; i++) {
    lines.push(`${i + 1}. ${report.recommendations[i]}`);
  }
  lines.push(``);

  return lines.join("\n");
}

/** v1.9.0: Use shared thresholds for health label */
function _healthLabel(score: number): string {
  if (score >= SEO_GRADE_THRESHOLDS.A) return "(Excellent)";
  if (score >= SEO_GRADE_THRESHOLDS.B) return "(Good)";
  if (score >= SEO_GRADE_THRESHOLDS.C) return "(Fair)";
  if (score >= SEO_GRADE_THRESHOLDS.D) return "(Needs Work)";
  return "(Poor)";
}

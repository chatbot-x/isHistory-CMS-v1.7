/**
 * isHistory CMS Plugin — Content Health Report Tests
 *
 * v1.8.0: Tests for report generation, health score calculation,
 * attention items, and markdown rendering.
 */

import { describe, it, expect } from "vitest";
import {
  generateHealthReport,
  renderReportMarkdown,
  type HealthReport,
} from "./report";
import type { ContentItem, CacheStats, IsHistorySettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

// ─── Test Helpers ───

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    file: {} as any,
    path: "src/content/blog/test.md",
    collection: "archive",
    name: "test",
    title: "Test Post",
    description: "A test post",
    date: "2024-01-15",
    status: "published",
    draft: false,
    track: "A",
    series: "minds-and-machines",
    seriesOrder: "A1",
    part: "",
    era: "ancient",
    figures: "",
    connects: "",
    image: "/images/a1-hero.jpg",
    tags: ["ai", "history"],
    aliases: ["A1"],
    publish: undefined,
    order: undefined,
    validation: { status: "ready", label: "Ready", errors: [] },
    seoScore: 75,
    isStale: false,
    seoChecks: [],
    ...overrides,
  };
}

function makeStats(overrides: Partial<CacheStats> = {}): CacheStats {
  return {
    total: 5,
    archiveTotal: 4,
    vaultTotal: 1,
    drafts: 1,
    published: 3,
    upcoming: 0,
    planned: 0,
    ready: 3,
    errors: 1,
    warnings: 1,
    trackCounts: { A: 3, P: 1, none: 0 },
    uniqueTags: ["ai", "history", "tech"],
    allEras: ["ancient", "modern"],
    allSeries: ["minds-and-machines"],
    stale: 1,
    avgSeoScore: 68,
    ...overrides,
  };
}

// ─── Tests ───

describe("generateHealthReport", () => {
  it("should generate a report with all fields", () => {
    const items: ContentItem[] = [
      makeItem(),
      makeItem({ path: "b.md", title: "Post B", draft: true, seoScore: 45 }),
      makeItem({
        path: "c.md",
        title: "Post C",
        validation: {
          status: "error",
          label: "Error",
          errors: [
            { field: "title", message: "Too short", severity: "error" },
          ],
        },
      }),
    ];
    const stats = makeStats({ total: 3 });
    const report = generateHealthReport(items, stats, DEFAULT_SETTINGS);

    expect(report.version).toBe("1.8.0");
    expect(report.generatedAt).toBeTruthy();
    expect(report.healthScore).toBeGreaterThanOrEqual(0);
    expect(report.healthScore).toBeLessThanOrEqual(100);
    expect(report.summary.totalItems).toBe(3);
    expect(report.summary.errorItems).toBe(1);
    expect(report.summary.draftItems).toBe(1);
    expect(report.trackBreakdown).toHaveLength(1); // A track
    expect(report.attentionItems.length).toBeGreaterThan(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it("should handle empty content", () => {
    const report = generateHealthReport([], makeStats({ total: 0 }), DEFAULT_SETTINGS);
    expect(report.healthScore).toBe(100);
    expect(report.summary.totalItems).toBe(0);
    expect(report.attentionItems).toHaveLength(0);
  });

  it("should detect stale items", () => {
    const items = [makeItem({ isStale: true })];
    const report = generateHealthReport(items, makeStats({ stale: 1 }), DEFAULT_SETTINGS);
    expect(report.summary.staleItems).toBe(1);
    const staleItem = report.attentionItems.find((a) => a.isStale);
    expect(staleItem).toBeTruthy();
    expect(staleItem!.issues).toContainEqual(
      expect.stringContaining("Stale"),
    );
  });

  it("should detect low SEO scores", () => {
    const items = [makeItem({ seoScore: 30 })];
    const report = generateHealthReport(items, makeStats(), DEFAULT_SETTINGS);
    expect(report.summary.lowSeoItems).toBe(1);
    const seoItem = report.attentionItems.find(
      (a) => a.seoScore !== null && a.seoScore < 55,
    );
    expect(seoItem).toBeTruthy();
  });

  it("should sort attention items by severity", () => {
    const items: ContentItem[] = [
      makeItem({
        path: "draft.md",
        title: "Draft Post",
        draft: true,
        validation: { status: "ready", label: "Ready", errors: [] },
      }),
      makeItem({
        path: "error.md",
        title: "Error Post",
        validation: {
          status: "error",
          label: "Error",
          errors: [
            { field: "title", message: "Missing", severity: "error" },
          ],
        },
      }),
      makeItem({
        path: "stale.md",
        title: "Stale Post",
        isStale: true,
        validation: { status: "ready", label: "Ready", errors: [] },
      }),
    ];
    const report = generateHealthReport(items, makeStats(), DEFAULT_SETTINGS);
    // Error item should come before stale, stale before draft
    const paths = report.attentionItems.map((a) => a.path);
    const errorIdx = paths.indexOf("error.md");
    const staleIdx = paths.indexOf("stale.md");
    const draftIdx = paths.indexOf("draft.md");
    expect(errorIdx).toBeLessThan(staleIdx);
    expect(staleIdx).toBeLessThan(draftIdx);
  });

  it("should generate track breakdown with correct stats", () => {
    const items: ContentItem[] = [
      makeItem({ track: "A", validation: { status: "ready", label: "Ready", errors: [] } }),
      makeItem({ track: "A", draft: true, seoScore: 50 }),
      makeItem({
        track: "P",
        validation: {
          status: "error",
          label: "Error",
          errors: [{ field: "date", message: "Missing", severity: "error" }],
        },
      }),
    ];
    const report = generateHealthReport(items, makeStats(), DEFAULT_SETTINGS);
    const trackA = report.trackBreakdown.find((t) => t.code === "A");
    expect(trackA).toBeTruthy();
    expect(trackA!.count).toBe(2);
    expect(trackA!.drafts).toBe(1);

    const trackP = report.trackBreakdown.find((t) => t.code === "P");
    expect(trackP).toBeTruthy();
    expect(trackP!.errors).toBe(1);
  });
});

describe("calculateHealthScore", () => {
  it("should return 100 for perfectly healthy content", () => {
    const items = [makeItem(), makeItem({ path: "b.md", title: "B" })];
    const stats = makeStats({
      total: 2,
      ready: 2,
      errors: 0,
      warnings: 0,
      drafts: 0,
      stale: 0,
      avgSeoScore: 100,
    });
    const report = generateHealthReport(items, stats, DEFAULT_SETTINGS);
    expect(report.healthScore).toBeGreaterThanOrEqual(90);
  });

  it("should penalize errors heavily", () => {
    const items = [
      makeItem({
        validation: {
          status: "error",
          label: "Error",
          errors: [{ field: "f", message: "m", severity: "error" }],
        },
      }),
    ];
    const stats = makeStats({
      total: 1,
      ready: 0,
      errors: 1,
      avgSeoScore: 0,
    });
    const report = generateHealthReport(items, stats, DEFAULT_SETTINGS);
    expect(report.healthScore).toBeLessThan(70);
  });
});

describe("renderReportMarkdown", () => {
  it("should produce valid markdown with all sections", () => {
    const items = [makeItem(), makeItem({ path: "b.md", title: "B", draft: true })];
    const stats = makeStats();
    const report = generateHealthReport(items, stats, DEFAULT_SETTINGS);
    const md = renderReportMarkdown(report);

    expect(md).toContain("# isHistory CMS — Content Health Report");
    expect(md).toContain("## Summary");
    expect(md).toContain("## Track Breakdown");
    expect(md).toContain("## Recommendations");
    expect(md).toContain("| Metric | Value |");
    expect(md).toContain("Health Score:");
  });

  it("should include attention items in markdown", () => {
    const items = [
      makeItem({
        validation: {
          status: "error",
          label: "Error",
          errors: [{ field: "title", message: "Missing", severity: "error" }],
        },
      }),
    ];
    const report = generateHealthReport(items, makeStats(), DEFAULT_SETTINGS);
    const md = renderReportMarkdown(report);
    expect(md).toContain("## Items Needing Attention");
    expect(md).toContain("Schema errors");
  });

  it("should cap attention items at 50", () => {
    const items = Array.from({ length: 60 }, (_, i) =>
      makeItem({
        path: `post-${i}.md`,
        title: `Post ${i}`,
        draft: true,
      }),
    );
    const report = generateHealthReport(items, makeStats({ total: 60, drafts: 60 }), DEFAULT_SETTINGS);
    const md = renderReportMarkdown(report);
    expect(md).toContain("more items");
  });

  it("should handle empty content gracefully", () => {
    const report = generateHealthReport([], makeStats({ total: 0 }), DEFAULT_SETTINGS);
    const md = renderReportMarkdown(report);
    expect(md).toContain("100/100");
    expect(md).toContain("Excellent");
  });
});

describe("buildRecommendations", () => {
  it("should recommend fixing errors", () => {
    const items = [
      makeItem({
        validation: {
          status: "error",
          label: "Error",
          errors: [{ field: "title", message: "Missing", severity: "error" }],
        },
      }),
    ];
    const report = generateHealthReport(items, makeStats({ errors: 1 }), DEFAULT_SETTINGS);
    expect(report.recommendations).toContainEqual(
      expect.stringContaining("Fix 1 item(s) with schema errors"),
    );
  });

  it("should show all-clear message when everything is healthy", () => {
    const items = [makeItem()];
    const stats = makeStats({ total: 1, ready: 1, errors: 0, warnings: 0, drafts: 0, stale: 0 });
    const report = generateHealthReport(items, stats, DEFAULT_SETTINGS);
    expect(report.recommendations).toContainEqual(
      expect.stringContaining("healthy"),
    );
  });
});

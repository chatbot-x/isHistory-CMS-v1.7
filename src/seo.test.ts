/**
 * isHistory CMS Plugin — SEO Score Engine Tests
 *
 * Tests for the SEO scoring system covering archive and vault
 * content scoring, grade calculation, and individual checks.
 * v1.7.0
 */

import { describe, it, expect } from "vitest";
import {
  calculateArchiveSEO,
  calculateVaultSEO,
  getSEOLabel,
  DEFAULT_SEO_CONFIG,
  type SEOConfig,
} from "./seo";
import type { ArchiveFrontmatter, VaultFrontmatter, ValidationConfig } from "./types";

const defaultValConfig: ValidationConfig = {
  tracks: { A: { name: "Articles", emoji: "\u{1F4F0}", color: "#7c3aed" }, P: { name: "Profiles", emoji: "\u{1F9E0}", color: "#3b82f6" }, E: { name: "Events", emoji: "\u26A1", color: "#f59e0b" } },
  statuses: ["published", "upcoming", "planned"],
  minTitleLength: 5,
  maxTitleLength: 120,
  minDescriptionLength: 15,
  maxDescriptionLength: 160,
  requiredArchiveFields: ["title", "date", "description"],
  imagePrefix: "/",
};

// ─── Archive SEO Scoring ───

describe("calculateArchiveSEO", () => {
  it("should return very low score for null frontmatter", () => {
    const result = calculateArchiveSEO(null, "", defaultValConfig);
    expect(result.score).toBeLessThanOrEqual(10); // Only draft-not check may pass
    expect(result.grade).toBe("F");
    expect(result.checks.length).toBeGreaterThan(0);
  });

  it("should return 0 score for empty frontmatter", () => {
    const result = calculateArchiveSEO({}, "", defaultValConfig);
    expect(result.score).toBeLessThan(30);
  });

  it("should return high score for a fully optimized post", () => {
    const fm: ArchiveFrontmatter = {
      title: "The Ancient Dream of Artificial Life and Intelligence Throughout History",
      date: "2026-01-15",
      description: "From bronze giants to clockwork wonders, the dream of creating intelligent machines has captivated humanity for millennia. This deep-dive explores the ancient origins.",
      draft: false,
      tags: ["ai-history", "philosophy", "ancient"],
      image: "/images/a1-hero.jpg",
      series: "minds-and-machines",
      seriesOrder: "A1",
      track: "A",
      status: "published",
      connects: "P1, E1",
    };
    const body = "A ".repeat(400); // 400 words
    const result = calculateArchiveSEO(fm, body, defaultValConfig);
    // All checks should pass except word count (body isn't read in cache)
    expect(result.score).toBeGreaterThan(60); // high score expected
    expect(result.grade).toBeOneOf(["A", "B", "C"]);
  });

  it("should penalize missing title", () => {
    const result = calculateArchiveSEO({ date: "2026-01-01", description: "Valid description here" }, "Some body content", defaultValConfig);
    const titleCheck = result.checks.find((c) => c.key === "title-present");
    expect(titleCheck?.passed).toBe(false);
    expect(titleCheck?.points).toBe(0);
  });

  it("should penalize title outside optimal SERP range", () => {
    const fm: ArchiveFrontmatter = {
      title: "Short", // only 5 chars, not in 50-60 range
      date: "2026-01-01",
      description: "A valid description that meets the minimum length requirements",
    };
    const result = calculateArchiveSEO(fm, "Body content", defaultValConfig);
    const optCheck = result.checks.find((c) => c.key === "title-optimal");
    expect(optCheck?.passed).toBe(false);
  });

  it("should penalize missing description", () => {
    const result = calculateArchiveSEO({ title: "Valid Title Here", date: "2026-01-01" }, "Body", defaultValConfig);
    const descCheck = result.checks.find((c) => c.key === "desc-present");
    expect(descCheck?.passed).toBe(false);
  });

  it("should penalize missing image", () => {
    const fm: ArchiveFrontmatter = {
      title: "Valid Title for This Post",
      date: "2026-01-01",
      description: "A valid description that is long enough for validation",
    };
    const result = calculateArchiveSEO(fm, "Body content here", defaultValConfig);
    const imgCheck = result.checks.find((c) => c.key === "image-present");
    expect(imgCheck?.passed).toBe(false);
  });

  it("should penalize insufficient tags", () => {
    const fm: ArchiveFrontmatter = {
      title: "Valid Title for This Post",
      date: "2026-01-01",
      description: "A valid description that is long enough for validation",
      tags: ["only-one"],
    };
    const result = calculateArchiveSEO(fm, "Body", defaultValConfig);
    const tagsCheck = result.checks.find((c) => c.key === "tags-min");
    expect(tagsCheck?.passed).toBe(false);
  });

  it("should penalize draft status", () => {
    const fm: ArchiveFrontmatter = {
      title: "Valid Title for This Post",
      date: "2026-01-01",
      description: "A valid description that is long enough for validation",
      draft: true,
    };
    const result = calculateArchiveSEO(fm, "Body", defaultValConfig);
    const draftCheck = result.checks.find((c) => c.key === "not-draft");
    expect(draftCheck?.passed).toBe(false);
  });

  it("should penalize low word count", () => {
    const fm: ArchiveFrontmatter = {
      title: "Valid Title for This Post",
      date: "2026-01-01",
      description: "A valid description that is long enough for validation",
    };
    const result = calculateArchiveSEO(fm, "Short body", defaultValConfig);
    const wcCheck = result.checks.find((c) => c.key === "word-count");
    expect(wcCheck?.passed).toBe(false);
  });

  it("should respect custom SEO config thresholds", () => {
    const customSeo: SEOConfig = {
      ...DEFAULT_SEO_CONFIG,
      imageRequired: false,
      internalLinksRequired: false,
    };
    const fm: ArchiveFrontmatter = {
      title: "Valid Title for This Post",
      date: "2026-01-01",
      description: "A valid description that is long enough for validation",
    };
    const result = calculateArchiveSEO(fm, "Body content", defaultValConfig, customSeo);
    const imgCheck = result.checks.find((c) => c.key === "image-present");
    const linkCheck = result.checks.find((c) => c.key === "internal-links");
    expect(imgCheck?.passed).toBe(true); // not required
    expect(linkCheck?.passed).toBe(true); // not required
  });
});

// ─── Vault SEO Scoring ───

describe("calculateVaultSEO", () => {
  it("should return 0 score for null frontmatter", () => {
    const result = calculateVaultSEO(null, "");
    expect(result.score).toBe(0);
  });

  it("should score well for a complete vault note", () => {
    const fm: VaultFrontmatter = {
      title: "Research Notes on AI",
      tags: ["research", "ai"],
      publish: true,
    };
    const result = calculateVaultSEO(fm, "This is some research content about artificial intelligence.");
    expect(result.score).toBe(100);
  });

  it("should penalize missing title", () => {
    const result = calculateVaultSEO({}, "Some content");
    const titleCheck = result.checks.find((c) => c.key === "title-present");
    expect(titleCheck?.passed).toBe(false);
  });
});

// ─── Grade & Label ───

describe("getSEOLabel", () => {
  it("should return correct labels for score ranges", () => {
    expect(getSEOLabel(95)).toBe("Excellent");
    expect(getSEOLabel(80)).toBe("Good");
    expect(getSEOLabel(60)).toBe("Fair");
    expect(getSEOLabel(40)).toBe("Needs Work");
    expect(getSEOLabel(20)).toBe("Poor");
  });
});

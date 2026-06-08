/**
 * isHistory CMS Plugin — ContentCache Tests
 *
 * Tests for sorting, filtering, and collection detection logic.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ContentCache } from "./cache";
import type { IsHistorySettings, ContentItem, ValidationResult } from "./types";

// ─── Mock helpers ───

const defaultSettings: IsHistorySettings = {
  _version: 9,
  archivePath: "src/content/blog",
  vaultPath: "src/content/vault",
  cardsPerPage: 40,
  showRibbonIcon: true,
  defaultSeries: "minds-and-machines",
  tracks: { A: { name: "Articles", emoji: "\u{1F4F0}", color: "#7c3aed" }, P: { name: "Profiles", emoji: "\u{1F9E0}", color: "#3b82f6" }, E: { name: "Events", emoji: "\u26A1", color: "#f59e0b" } },
  statuses: ["published", "upcoming", "planned"],
  minTitleLength: 5,
  maxTitleLength: 120,
  minDescriptionLength: 15,
  maxDescriptionLength: 160,
  requiredArchiveFields: ["title", "date", "description"],
  imagePrefix: "/",
  descriptionTruncation: 120,
  figuresTruncation: 60,
  maxTagsPerCard: 4,
  maxErrorsPerCard: 3,
  maxMetaTags: 30,
  newPostSlug: "{{seriesOrder}}-untitled-post",
  newPostTitle: "Untitled {{trackName}} Post",
  newPostImage: "/images/{{seriesOrderLower}}-hero.jpg",
  newPostStatus: "planned",
  newPostBody: "Start writing here...\n",
  preflightDraft: false,
  preflightStatus: "published",
  preflightAutoDate: true,
  staleThresholdDays: 30,
  showStaleBadge: true,
  showSeoScore: true,
  seoTitleOptimalMin: 50,
  seoTitleOptimalMax: 60,
  seoDescOptimalMin: 120,
  seoDescOptimalMax: 160,
  seoMinWordCount: 300,
  seoMinTags: 2,
};

function makeItem(overrides: Partial<ContentItem> & { path: string }): ContentItem {
  return {
    file: {} as any,
    collection: "archive",
    name: overrides.path.split("/").pop()?.replace(".md", "") || "test",
    title: "Test Post",
    description: "A test description",
    date: "2026-01-01",
    status: "published",
    draft: false,
    track: null,
    series: "",
    seriesOrder: "",
    part: "",
    era: "",
    figures: "",
    connects: "",
    image: "",
    tags: [],
    aliases: [],
    publish: undefined,
    order: undefined,
    validation: { status: "ready", label: "Ready", errors: [] },
    seoScore: null,
    isStale: false,
    ...overrides,
  };
}

// ─── Collection Detection ───

describe("ContentCache._getCollection", () => {
  const cache = new ContentCache();

  it("should identify archive paths", () => {
    expect(cache._getCollection("src/content/blog/post1.md", defaultSettings)).toBe("archive");
  });

  it("should identify vault paths", () => {
    expect(cache._getCollection("src/content/vault/notes.md", defaultSettings)).toBe("vault");
  });

  it("should return null for non-collection paths", () => {
    expect(cache._getCollection("other/path/file.md", defaultSettings)).toBeNull();
    expect(cache._getCollection("README.md", defaultSettings)).toBeNull();
  });

  it("should respect custom paths", () => {
    const customSettings: IsHistorySettings = {
      ...defaultSettings,
      archivePath: "posts",
      vaultPath: "notes",
    };
    expect(cache._getCollection("posts/my-post.md", customSettings)).toBe("archive");
    expect(cache._getCollection("notes/my-note.md", customSettings)).toBe("vault");
  });

  it("should handle trailing slashes in paths", () => {
    const slashSettings: IsHistorySettings = {
      ...defaultSettings,
      archivePath: "src/content/blog/",
      vaultPath: "src/content/vault/",
    };
    expect(cache._getCollection("src/content/blog/post.md", slashSettings)).toBe("archive");
    expect(cache._getCollection("src/content/vault/notes.md", slashSettings)).toBe("vault");
  });
});

// ─── isInCollection ───

describe("ContentCache.isInCollection", () => {
  const cache = new ContentCache();

  it("should return true for archive paths", () => {
    expect(cache.isInCollection("src/content/blog/post.md", defaultSettings)).toBe(true);
  });

  it("should return true for vault paths", () => {
    expect(cache.isInCollection("src/content/vault/notes.md", defaultSettings)).toBe(true);
  });

  it("should return false for other paths", () => {
    expect(cache.isInCollection("random/path.md", defaultSettings)).toBe(false);
  });
});

// ─── Sorting ───

describe("ContentCache.getSortedItems", () => {
  const cache = new ContentCache();

  beforeEach(() => {
    cache.items.clear();
    cache.resetStatsDirty();
  });

  it("should sort by seriesOrder track then number", () => {
    cache.items.set("a", makeItem({ path: "a", seriesOrder: "P3", track: "P" }));
    cache.items.set("b", makeItem({ path: "b", seriesOrder: "A1", track: "A" }));
    cache.items.set("c", makeItem({ path: "c", seriesOrder: "E2", track: "E" }));
    cache.items.set("d", makeItem({ path: "d", seriesOrder: "A5", track: "A" }));

    const sorted = cache.getSortedItems(undefined, defaultSettings.tracks);
    const orders = sorted.map((i) => i.seriesOrder);
    expect(orders).toEqual(["A1", "A5", "E2", "P3"]);
  });

  it("should sort numerically not lexicographically", () => {
    cache.items.set("a", makeItem({ path: "a", seriesOrder: "A10", track: "A" }));
    cache.items.set("b", makeItem({ path: "b", seriesOrder: "A2", track: "A" }));
    cache.items.set("c", makeItem({ path: "c", seriesOrder: "A1", track: "A" }));

    const sorted = cache.getSortedItems(undefined, defaultSettings.tracks);
    const orders = sorted.map((i) => i.seriesOrder);
    expect(orders).toEqual(["A1", "A2", "A10"]);
  });

  it("should place items with seriesOrder before items without", () => {
    cache.items.set("a", makeItem({ path: "a", seriesOrder: "A1", track: "A" }));
    cache.items.set("b", makeItem({ path: "b", seriesOrder: "" }));

    const sorted = cache.getSortedItems();
    expect(sorted[0].seriesOrder).toBe("A1");
    expect(sorted[1].seriesOrder).toBe("");
  });

  it("should sort items without seriesOrder by path", () => {
    cache.items.set("z", makeItem({ path: "z-post", seriesOrder: "" }));
    cache.items.set("a", makeItem({ path: "a-post", seriesOrder: "" }));

    const sorted = cache.getSortedItems();
    expect(sorted[0].path).toBe("a-post");
    expect(sorted[1].path).toBe("z-post");
  });

  it("should filter by collection type", () => {
    cache.items.set("a", makeItem({ path: "a", collection: "archive" }));
    cache.items.set("b", makeItem({ path: "b", collection: "vault" }));

    const archiveOnly = cache.getSortedItems("archive");
    expect(archiveOnly).toHaveLength(1);
    expect(archiveOnly[0].collection).toBe("archive");
  });
});

// ─── Filtering (multi-criterion AND) ───

describe("ContentCache.matchesFilter", () => {
  const cache = new ContentCache();

  const makeFilterItem = (overrides: Partial<ContentItem>): ContentItem =>
    makeItem({ path: "test", ...overrides });

  it("should match 'all' filter for any item", () => {
    const item = makeFilterItem({});
    expect(cache.matchesFilter(item, new Set(["all"]), "")).toBe(true);
  });

  it("should match 'archive' filter only for archive items", () => {
    expect(cache.matchesFilter(makeFilterItem({ collection: "archive" }), new Set(["archive"]), "")).toBe(true);
    expect(cache.matchesFilter(makeFilterItem({ collection: "vault" }), new Set(["archive"]), "")).toBe(false);
  });

  it("should match 'vault' filter only for vault items", () => {
    expect(cache.matchesFilter(makeFilterItem({ collection: "vault" }), new Set(["vault"]), "")).toBe(true);
    expect(cache.matchesFilter(makeFilterItem({ collection: "archive" }), new Set(["vault"]), "")).toBe(false);
  });

  it("should match track filters", () => {
    expect(cache.matchesFilter(makeFilterItem({ track: "A" }), new Set(["track-A"]), "")).toBe(true);
    expect(cache.matchesFilter(makeFilterItem({ track: "P" }), new Set(["track-A"]), "")).toBe(false);
    expect(cache.matchesFilter(makeFilterItem({ track: "E" }), new Set(["track-E"]), "")).toBe(true);
  });

  it("should match 'drafts' filter only for draft items", () => {
    expect(cache.matchesFilter(makeFilterItem({ draft: true }), new Set(["drafts"]), "")).toBe(true);
    expect(cache.matchesFilter(makeFilterItem({ draft: false }), new Set(["drafts"]), "")).toBe(false);
  });

  it("should match validation status filters", () => {
    const readyItem = makeFilterItem({ validation: { status: "ready", label: "Ready", errors: [] } });
    const errorItem = makeFilterItem({ validation: { status: "error", label: "Errors", errors: [{ field: "title", message: "Missing", severity: "error" }] } });

    expect(cache.matchesFilter(readyItem, new Set(["ready"]), "")).toBe(true);
    expect(cache.matchesFilter(errorItem, new Set(["ready"]), "")).toBe(false);
    expect(cache.matchesFilter(errorItem, new Set(["errors"]), "")).toBe(true);
    expect(cache.matchesFilter(readyItem, new Set(["errors"]), "")).toBe(false);
  });

  // ─── AND Logic ───

  it("should apply AND logic for multiple filters", () => {
    const item = makeFilterItem({ collection: "archive", track: "A", draft: true });
    // archive + track-A = match
    expect(cache.matchesFilter(item, new Set(["archive", "track-A"]), "")).toBe(true);
    // archive + vault = no match (mutually exclusive)
    expect(cache.matchesFilter(item, new Set(["archive", "vault"]), "")).toBe(false);
    // track-A + drafts = match
    expect(cache.matchesFilter(item, new Set(["track-A", "drafts"]), "")).toBe(true);
    // track-A + errors = no match
    expect(cache.matchesFilter(item, new Set(["track-A", "errors"]), "")).toBe(false);
  });

  it("should return false when no filter matches in AND set", () => {
    const item = makeFilterItem({ track: "A" });
    expect(cache.matchesFilter(item, new Set(["track-P", "drafts"]), "")).toBe(false);
  });

  // ─── Search ───

  it("should match search query in title", () => {
    const item = makeFilterItem({ title: "The Ancient Dream of AI" });
    expect(cache.matchesFilter(item, new Set(["all"]), "ancient")).toBe(true);
    expect(cache.matchesFilter(item, new Set(["all"]), "robotics")).toBe(false);
  });

  it("should match search query in path", () => {
    const item = makeFilterItem({ path: "src/content/blog/a1-ancient-dream.md" });
    expect(cache.matchesFilter(item, new Set(["all"]), "a1-ancient")).toBe(true);
  });

  it("should match search query in tags", () => {
    const item = makeFilterItem({ tags: ["ai-history", "philosophy"] });
    expect(cache.matchesFilter(item, new Set(["all"]), "philosophy")).toBe(true);
    expect(cache.matchesFilter(item, new Set(["all"]), "mathematics")).toBe(false);
  });

  it("should match search query in era", () => {
    const item = makeFilterItem({ era: "Ancient - 1850" });
    expect(cache.matchesFilter(item, new Set(["all"]), "ancient")).toBe(true);
  });

  it("should match search query in figures", () => {
    const item = makeFilterItem({ figures: "Ada Lovelace, Alan Turing" });
    expect(cache.matchesFilter(item, new Set(["all"]), "turing")).toBe(true);
  });

  it("should match search query in seriesOrder", () => {
    const item = makeFilterItem({ seriesOrder: "A1" });
    expect(cache.matchesFilter(item, new Set(["all"]), "a1")).toBe(true);
  });

  it("should be case-insensitive", () => {
    const item = makeFilterItem({ title: "The Ancient Dream" });
    expect(cache.matchesFilter(item, new Set(["all"]), "ANCIENT")).toBe(true);
    expect(cache.matchesFilter(item, new Set(["all"]), "the ancient")).toBe(true);
  });
});

// ─── File Operations ───

describe("ContentCache.removeFile", () => {
  const cache = new ContentCache();

  it("should remove an item by path", () => {
    cache.items.set("test/path.md", makeItem({ path: "test/path.md" }));
    expect(cache.items.has("test/path.md")).toBe(true);

    cache.removeFile("test/path.md");
    expect(cache.items.has("test/path.md")).toBe(false);
  });

  it("should not throw when removing non-existent path", () => {
    expect(() => cache.removeFile("nonexistent.md")).not.toThrow();
  });
});

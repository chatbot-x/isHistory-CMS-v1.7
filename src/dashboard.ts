/**
 * isHistory CMS Plugin — Dashboard View
 *
 * Full content management UI with differential rendering.
 * v1.9.0: Dynamic collection filters, stats, and SEO badge colors from shared constants.
 */

import { ItemView, type WorkspaceLeaf, Notice, Modal, TFile } from "obsidian";
import {
  type ContentItem,
  type TrackCode,
  type SortMode,
  DEFAULT_SETTINGS,
  findCollectionByPath,
} from "./types";
import IsHistoryPlugin from "./main";
import { SEO_GRADE_COLORS, SEO_GRADE_THRESHOLDS, getSEOLabel } from "./seo";

export const VIEW_TYPE_DASHBOARD = "ishistory-dashboard";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "seriesOrder", label: "Series Order" },
  { value: "dateNewest", label: "Newest First" },
  { value: "dateOldest", label: "Oldest First" },
  { value: "titleAZ", label: "Title A-Z" },
  { value: "errorsFirst", label: "Errors First" },
  { value: "draftsFirst", label: "Drafts First" },
  { value: "seoScore", label: "SEO Score (Low First)" },
];

export class IsHistoryDashboardView extends ItemView {
  plugin: IsHistoryPlugin;
  activeFilters: Set<string> = new Set(["all"]);
  searchQuery = "";
  sortMode: SortMode = "seriesOrder";
  private _visibleLimit: number;
  private _cardElements: Map<string, HTMLElement> = new Map();
  private _gridEl: HTMLElement | null = null;
  private _statsEl: HTMLElement | null = null;
  private _loadMoreEl: HTMLElement | null = null;
  private _totalVisible = 0;
  private _destroyed = false;
  private _ready = false;
  private _pendingPaths: Set<string> = new Set();
  private _updateTimer: ReturnType<typeof setTimeout> | null = null;
  private _itemSnapshots: Map<string, string> = new Map();
  private _rendering = false;
  private _renderTimer: ReturnType<typeof setTimeout> | null = null;
  private _searchTimer: ReturnType<typeof setTimeout> | null = null;
  // v1.8.0: Bulk select mode
  private _bulkMode = false;
  private _selectedPaths: Set<string> = new Set();

  constructor(leaf: WorkspaceLeaf, plugin: IsHistoryPlugin) {
    super(leaf);
    this.plugin = plugin;
    this._visibleLimit = plugin.settings.cardsPerPage || DEFAULT_SETTINGS.cardsPerPage;
  }

  getViewType() { return VIEW_TYPE_DASHBOARD; }
  getDisplayText() { return "isHistory CMS"; }
  getIcon() { return "book-open"; }

  async onOpen() {
    this._destroyed = false;

    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (!this.app.workspace.layoutReady || this._destroyed) return;
        if (!this.plugin.cache.isInCollection(file.path, this.plugin.settings)) return;
        this._queuePath(file.path);
      })
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!this.app.workspace.layoutReady || this._destroyed) return;
        if (!this.plugin.cache.isInCollection(file.path, this.plugin.settings) || !(file instanceof TFile)) return;
        this._queuePath(file.path);
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (!this.app.workspace.layoutReady || this._destroyed) return;
        if (!this.plugin.cache.isInCollection(file.path, this.plugin.settings)) return;
        this.plugin.cache.removeFile(file.path);
        this._queuePath(file.path);
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (!this.app.workspace.layoutReady || this._destroyed) return;
        if (this.plugin.cache.isInCollection(oldPath, this.plugin.settings)) {
          this.plugin.cache.removeFile(oldPath);
          this._queuePath(oldPath);
        }
        if (this.plugin.cache.isInCollection(file.path, this.plugin.settings) && file instanceof TFile) {
          this._queuePath(file.path);
        }
      })
    );

    if (this.app.workspace.layoutReady) {
      this._doInitialScan();
    } else {
      const ref = this.app.workspace.on("layout-ready" as never, () => {
        this.app.workspace.offref(ref);
        this._doInitialScan();
      });
      this.registerEvent(ref);
      this._showLoading();
    }
  }

  private _showLoading(): void {
    try {
      const c = this.contentEl;
      c.empty();
      c.addClass("ishistory-dashboard");
      c.createEl("div", { cls: "cms-loading-state" })
        .createEl("div", { text: "Loading isHistory CMS...", cls: "cms-empty-title" });
    } catch { /* ignore */ }
  }

  private _doInitialScan(): void {
    if (this._destroyed) return;
    try { this.plugin.cache.scanAll(this.app, this.plugin.settings); } catch (e) { console.error(e); }
    this.renderDashboard();
    this._ready = true;
  }

  private _queuePath(path: string): void {
    this._pendingPaths.add(path);
    this._scheduleUpdate();
  }

  private _scheduleUpdate(): void {
    if (!this._ready) return;
    if (this._updateTimer) clearTimeout(this._updateTimer);
    this._updateTimer = setTimeout(() => this._processPending(), 500);
  }

  private _processPending(): void {
    if (this._destroyed || this._pendingPaths.size === 0) return;
    const paths = new Set(this._pendingPaths);
    this._pendingPaths.clear();

    for (const path of paths) {
      try {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file && file instanceof TFile && this.plugin.cache.isInCollection(path, this.plugin.settings)) {
          this.plugin.cache.updateFile(file, this.app, this.plugin.settings);
        }
        if (!file && this.plugin.cache.items.has(path)) {
          this.plugin.cache.removeFile(path);
        }
      } catch (e) { console.error(e); }
    }

    if (!this._destroyed && this._ready) {
      try { this._differentialUpdate(); } catch (e) { console.error(e); }
    }
  }

  requestRender(): void {
    if (this._destroyed) return;
    if (this._renderTimer) clearTimeout(this._renderTimer);
    this._renderTimer = setTimeout(() => {
      this._renderTimer = null;
      this.renderDashboard();
    }, 100);
  }

  private _itemFingerprint(item: ContentItem): string {
    return JSON.stringify({
      t: item.title, d: item.draft, s: item.status,
      v: item.validation.status, tr: item.track,
      desc: item.description, era: item.era, date: item.date,
      part: item.part, figures: item.figures, tags: item.tags,
      so: item.seriesOrder, errs: item.validation.errors.length,
      connects: item.connects, image: item.image,
      aliases: item.aliases, series: item.series,
    });
  }

  // ─── Full Dashboard Render ───

  renderDashboard(): void {
    if (this._rendering || this._destroyed) return;
    this._rendering = true;

    try {
      const container = this.contentEl;
      container.empty();
      container.addClass("ishistory-dashboard");
      this._cardElements.clear();
      this._itemSnapshots.clear();

      const cache = this.plugin.cache;
      const settings = this.plugin.settings;

      // Header
      const header = container.createEl("div", { cls: "cms-dash-header" });
      header.createEl("h2", { text: "isHistory", cls: "cms-dash-title" });
      header.createEl("p", { text: "Content management for the AI history archive", cls: "cms-dash-subtitle" });

      // Stats
      this._statsEl = container.createEl("div", { cls: "cms-stats-row" });
      this._renderStats();

      // Toolbar
      const toolbar = container.createEl("div", { cls: "cms-toolbar" });
      const searchWrap = toolbar.createEl("div", { cls: "cms-search-wrap" });
      const searchInput = searchWrap.createEl("input", {
        type: "text", placeholder: "Search posts, figures, tags...",
        cls: "cms-search-input", value: this.searchQuery,
      });
      searchInput.setAttribute("aria-label", "Search posts, figures, tags");

      searchInput.addEventListener("input", () => {
        this.searchQuery = searchInput.value;
        if (this._searchTimer) clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => this.applyFilters(), 200);
      });

      const sortSelect = toolbar.createEl("select", { cls: "cms-sort-select" });
      sortSelect.setAttribute("aria-label", "Sort posts by");
      for (const opt of SORT_OPTIONS) {
        const optionEl = sortSelect.createEl("option", { value: opt.value, text: opt.label });
        if (opt.value === this.sortMode) optionEl.selected = true;
      }
      sortSelect.addEventListener("change", () => {
        this.sortMode = sortSelect.value as SortMode;
        this.renderDashboard();
      });

      // Dynamic filter buttons from settings
      const filterGroup = toolbar.createEl("div", { cls: "cms-filter-group" });
      const filters = this._buildFilterList();
      for (const f of filters) {
        const btn = filterGroup.createEl("button", {
          text: f.label,
          cls: `cms-filter-btn ${this.activeFilters.has(f.key) ? "cms-filter-btn-active" : ""}`,
        });
        btn.setAttribute("aria-pressed", String(this.activeFilters.has(f.key)));
        btn.addEventListener("click", () => {
          if (f.key === "all") {
            this.activeFilters.clear();
            this.activeFilters.add("all");
          } else {
            this.activeFilters.delete("all");
            if (this.activeFilters.has(f.key)) { this.activeFilters.delete(f.key); } else { this.activeFilters.add(f.key); }
            if (this.activeFilters.size === 0) this.activeFilters.add("all");
          }
          filterGroup.querySelectorAll(".cms-filter-btn").forEach((b) => {
            (b as HTMLElement).removeClass("cms-filter-btn-active");
            b.setAttribute("aria-pressed", "false");
          });
          for (const key of this.activeFilters) {
            const idx = filters.findIndex((fi) => fi.key === key);
            if (idx >= 0) {
              filterGroup.children[idx]?.addClass("cms-filter-btn-active");
              filterGroup.children[idx]?.setAttribute("aria-pressed", "true");
            }
          }
          this.applyFilters();
        });
      }

      const actionsGroup = toolbar.createEl("div", { cls: "cms-actions-group" });
      actionsGroup
        .createEl("button", { text: "+ New Post", cls: "cms-btn cms-btn-primary" })
        .addEventListener("click", () => { void this._newPost(); });
      actionsGroup
        .createEl("button", { text: "Refresh", cls: "cms-btn cms-btn-secondary" })
        .addEventListener("click", () => {
          try { this.plugin.cache.scanAll(this.app, this.plugin.settings); this.renderDashboard(); this.plugin._updateStatusBar(); }
          catch (e) { console.error(e); }
        });

      actionsGroup
        .createEl("button", {
          text: this._bulkMode ? "Exit Select" : "Select",
          cls: `cms-btn ${this._bulkMode ? "cms-btn-bulk-active" : "cms-btn-secondary"}`,
        })
        .addEventListener("click", () => {
          this._bulkMode = !this._bulkMode;
          this._selectedPaths.clear();
          this.renderDashboard();
        });

      actionsGroup
        .createEl("button", { text: "Health Report", cls: "cms-btn cms-btn-secondary" })
        .addEventListener("click", () => { void this.plugin.generateHealthReport(); });

      if (this._bulkMode && this._selectedPaths.size > 0) {
        const bulkBar = toolbar.createEl("div", { cls: "cms-bulk-bar" });
        bulkBar.createEl("span", {
          text: `${this._selectedPaths.size} selected`,
          cls: "cms-bulk-count",
        });
        bulkBar.createEl("button", { text: "Select All Visible", cls: "cms-btn cms-btn-sm cms-btn-secondary" })
          .addEventListener("click", () => { this._selectAllVisible(); });
        bulkBar.createEl("button", { text: "Deselect All", cls: "cms-btn cms-btn-sm cms-btn-secondary" })
          .addEventListener("click", () => { this._selectedPaths.clear(); this.renderDashboard(); });
        bulkBar.createEl("button", { text: "Toggle Draft", cls: "cms-btn cms-btn-sm cms-btn-primary" })
          .addEventListener("click", () => { void this._bulkActionToggleDraft(); });
        bulkBar.createEl("button", { text: "Validate", cls: "cms-btn cms-btn-sm cms-btn-secondary" })
          .addEventListener("click", () => { this._bulkActionValidate(); });
        bulkBar.createEl("button", { text: "Pre-flight", cls: "cms-btn cms-btn-sm cms-btn-primary" })
          .addEventListener("click", () => { void this._bulkActionPreflight(); });
      }

      // Grid
      this._gridEl = container.createEl("div", { cls: "cms-content-grid" });
      const items = cache.getSortedItems(undefined, settings.tracks, this.sortMode);
      if (items.length === 0) {
        const emptyEl = this._gridEl.createEl("div", { cls: "cms-empty-state" });
        emptyEl.createEl("div", { text: "No content found", cls: "cms-empty-title" });
        emptyEl.createEl("div", { text: "Check your content paths in Settings.", cls: "cms-empty-desc" });
      } else {
        for (const item of items) {
          this._createCardElement(item);
          this._itemSnapshots.set(item.path, this._itemFingerprint(item));
        }
      }

      // Load More
      this._loadMoreEl = container.createEl("div", { cls: "cms-load-more-wrap" });
      this._loadMoreEl
        .createEl("button", { text: "Load More", cls: "cms-btn cms-btn-secondary cms-btn-full" })
        .addEventListener("click", () => {
          this._visibleLimit += this.plugin.settings.cardsPerPage || DEFAULT_SETTINGS.cardsPerPage;
          this.applyFilters();
        });

      this.applyFilters();
      this._renderMetaSection(container);
    } catch (e) {
      console.error("isHistory Dashboard render error:", e);
      try {
        const container = this.contentEl;
        container.empty();
        const err = container.createEl("div", { cls: "cms-error-display" });
        err.createEl("h3", { text: "Error" });
        err.createEl("p", { text: (e as Error).message });
      } catch { /* last resort */ }
    } finally {
      this._rendering = false;
    }
  }

  /** v1.9.0: Build filter list dynamically from collections + tracks */
  private _buildFilterList(): { key: string; label: string }[] {
    const settings = this.plugin.settings;
    const filters: { key: string; label: string }[] = [
      { key: "all", label: "All" },
    ];
    // Dynamic collection filters
    for (const col of settings.collections) {
      filters.push({ key: `collection-${col.id}`, label: `${col.emoji} ${col.name}` });
    }
    // Legacy compat: also add "archive" and "vault" if they exist as collection IDs
    for (const trackCode of Object.keys(settings.tracks)) {
      const trackInfo = settings.tracks[trackCode];
      filters.push({ key: `track-${trackCode}`, label: `${trackCode} ${trackInfo.name}` });
    }
    filters.push({ key: "drafts", label: "Drafts" });
    filters.push({ key: "recent", label: "Recent" });
    filters.push({ key: "stale", label: "Stale" });
    filters.push({ key: "errors", label: "Errors" });
    if (settings.showSeoScore) {
      filters.push({ key: "lowSeo", label: "Low SEO" });
    }
    return filters;
  }

  // ─── Differential Update ───

  private _differentialUpdate(): void {
    if (!this._gridEl || this._destroyed) return;
    const cache = this.plugin.cache;
    const currentItems = new Map<string, ContentItem>();
    for (const item of cache.getSortedItems(undefined, this.plugin.settings.tracks, this.sortMode)) {
      currentItems.set(item.path, item);
    }

    for (const [path, cardEl] of this._cardElements) {
      if (!currentItems.has(path)) { cardEl.remove(); this._cardElements.delete(path); this._itemSnapshots.delete(path); }
    }

    for (const item of currentItems.values()) {
      const existingCard = this._cardElements.get(item.path);
      const prevSnapshot = this._itemSnapshots.get(item.path);
      const newSnapshot = this._itemFingerprint(item);
      if (!existingCard) {
        this._createCardElement(item);
        this._itemSnapshots.set(item.path, newSnapshot);
      } else if (prevSnapshot !== newSnapshot) {
        const parent = existingCard.parentElement;
        const nextSibling = existingCard.nextSibling;
        existingCard.remove();
        const newCard = this._buildCardDOM(item);
        if (parent) parent.insertBefore(newCard, nextSibling);
        this._cardElements.set(item.path, newCard);
        this._itemSnapshots.set(item.path, newSnapshot);
      }
    }

    if (this._statsEl) this._renderStats();
    this.applyFilters();
  }

  // ─── v1.9.0: Stats Rendering with dynamic collections ───

  private _renderStats(): void {
    if (!this._statsEl) return;
    try {
      this._statsEl.empty();
      const settings = this.plugin.settings;
      const s = this.plugin.cache.getStats(settings);
      const cards: { label: string; value: number; cls: string }[] = [];

      // Dynamic collection stats
      for (const col of settings.collections) {
        const total = s.collectionTotals[col.id] || 0;
        const colId = col.id.toLowerCase().replace(/[^a-z0-9-]/g, "-");
        cards.push({ label: col.name, value: total, cls: `cms-stat-collection-${colId}` });
      }
      // Track counts
      for (const [code, info] of Object.entries(settings.tracks)) {
        cards.push({ label: `${code} ${info.name}`, value: s.trackCounts[code] || 0, cls: `cms-stat-track-${code.toLowerCase()}` });
      }
      // SEO & Stale stats
      if (settings.showSeoScore) {
        cards.push({ label: "Avg SEO", value: s.avgSeoScore, cls: "cms-stat-seo" });
      }
      if (settings.showStaleBadge && s.stale > 0) {
        cards.push({ label: "Stale", value: s.stale, cls: "cms-stat-stale" });
      }
      cards.push(
        { label: "Drafts", value: s.drafts, cls: "cms-stat-warning" },
        { label: "Errors", value: s.errors, cls: "cms-stat-error" },
        { label: "Ready", value: s.ready, cls: "cms-stat-success" },
      );
      for (const c of cards) {
        const el = this._statsEl.createEl("div", { cls: `cms-stat-card ${c.cls}` });
        el.createEl("div", { text: String(c.value), cls: "cms-stat-value" });
        el.createEl("div", { text: c.label, cls: "cms-stat-label" });
      }
    } catch (e) { console.error(e); }
  }

  // ─── Card DOM Building ───

  private _buildCardDOM(item: ContentItem): HTMLElement {
    const settings = this.plugin.settings;
    const collectionConfig = findCollectionByPath(settings, item.path);
    const card = document.createElement("div");
    card.className = `cms-card cms-card-${item.validation.status} cms-card-${item.collection}${item.track ? " cms-card-track-" + item.track : ""}${this._bulkMode && this._selectedPaths.has(item.path) ? " cms-card-selected" : ""}`;
    card.setAttribute("data-path", item.path);
    card.setAttribute("data-collection", item.collection);
    card.setAttribute("data-track", item.track || "");
    card.setAttribute("data-validation", item.validation.status);
    card.setAttribute("data-draft", String(item.draft));
    card.setAttribute("data-status", item.status);

    // v1.8.0: Bulk select checkbox
    if (this._bulkMode) {
      const checkbox = card.createEl("input", {
        cls: "cms-bulk-checkbox",
        attr: {
          type: "checkbox",
          "aria-label": `Select ${item.title}`,
        },
      });
      if (this._selectedPaths.has(item.path)) {
        (checkbox as HTMLInputElement).checked = true;
      }
      checkbox.addEventListener("change", () => {
        if ((checkbox as HTMLInputElement).checked) {
          this._selectedPaths.add(item.path);
          card.addClass("cms-card-selected");
        } else {
          this._selectedPaths.delete(item.path);
          card.removeClass("cms-card-selected");
        }
        this.renderDashboard();
      });
    }

    // Header
    const cardHeader = card.createEl("div", { cls: "cms-card-header" });
    const titleArea = cardHeader.createEl("div", { cls: "cms-card-title-area" });
    if (item.seriesOrder) {
      titleArea.createEl("span", {
        text: item.seriesOrder,
        cls: `cms-card-code cms-card-code-${(item.track || "X").toLowerCase()}`,
      });
    }
    titleArea.createEl("span", { text: item.title, cls: "cms-card-title" });

    const badgeArea = cardHeader.createEl("div", { cls: "cms-card-badges" });

    // v1.9.0: Collection badge using config emoji/name
    if (collectionConfig) {
      badgeArea.createEl("span", {
        text: `${collectionConfig.emoji} ${collectionConfig.name}`,
        cls: "cms-badge cms-badge-collection",
      });
    }

    if (item.track && settings.tracks[item.track]) {
      const trackInfo = settings.tracks[item.track];
      badgeArea.createEl("span", {
        text: `${trackInfo.emoji} ${trackInfo.name}`,
        cls: "cms-badge cms-badge-track",
      });
    } else if (item.track) {
      badgeArea.createEl("span", { text: `${item.track} Track`, cls: "cms-badge cms-badge-track" });
    }
    badgeArea.createEl("span", {
      text: item.validation.label,
      cls: `cms-badge cms-badge-${item.validation.status === "ready" ? "success" : item.validation.status === "error" ? "error" : "warning"}`,
    });

    // v1.9.0: SEO Score badge using shared constants
    if (settings.showSeoScore && item.seoScore !== null) {
      const seoColor = item.seoScore >= SEO_GRADE_THRESHOLDS.A ? SEO_GRADE_COLORS.A
        : item.seoScore >= SEO_GRADE_THRESHOLDS.B ? SEO_GRADE_COLORS.B
        : item.seoScore >= SEO_GRADE_THRESHOLDS.C ? SEO_GRADE_COLORS.C
        : item.seoScore >= SEO_GRADE_THRESHOLDS.D ? SEO_GRADE_COLORS.D
        : SEO_GRADE_COLORS.F;
      badgeArea.createEl("span", {
        text: `SEO ${item.seoScore}`,
        cls: "cms-badge cms-badge-seo",
        attr: { style: `background-color: ${seoColor}20; color: ${seoColor}` },
      });
    }

    if (settings.showStaleBadge && item.isStale) {
      badgeArea.createEl("span", {
        text: "STALE",
        cls: "cms-badge cms-badge-stale",
      });
    }

    // Body
    const cardBody = card.createEl("div", { cls: "cms-card-body" });

    if (item.description) {
      const descLimit = settings.descriptionTruncation || 120;
      cardBody.createEl("div", {
        text: item.description.length > descLimit ? item.description.substring(0, descLimit) + "..." : item.description,
        cls: "cms-card-desc",
      });
    }

    const metaRow = cardBody.createEl("div", { cls: "cms-card-meta" });
    if (item.era) metaRow.createEl("span", { text: item.era, cls: "cms-meta-item cms-meta-era" });
    if (item.date) metaRow.createEl("span", { text: item.date, cls: "cms-meta-item" });
    if (item.status) metaRow.createEl("span", { text: item.status, cls: `cms-meta-item cms-status-${item.status}` });
    if (item.draft) metaRow.createEl("span", { text: "DRAFT", cls: "cms-meta-item cms-draft-yes" });
    if (item.part) metaRow.createEl("span", { text: item.part, cls: "cms-meta-item" });

    if (item.figures) {
      const figLimit = settings.figuresTruncation || 60;
      const figRow = cardBody.createEl("div", { cls: "cms-card-figures" });
      figRow.createEl("span", { text: "Figures: ", cls: "cms-figures-label" });
      figRow.createEl("span", {
        text: item.figures.length > figLimit ? item.figures.substring(0, figLimit) + "..." : item.figures,
        cls: "cms-figures-value",
      });
    }

    if (item.tags.length > 0) {
      const tagLimit = settings.maxTagsPerCard || 4;
      const tagRow = cardBody.createEl("div", { cls: "cms-card-tags" });
      for (const tag of item.tags.slice(0, tagLimit))
        tagRow.createEl("span", { text: tag, cls: "cms-card-tag" });
      if (item.tags.length > tagLimit)
        tagRow.createEl("span", { text: `+${item.tags.length - tagLimit}`, cls: "cms-card-tag cms-card-tag-more" });
    }

    if (item.validation.errors.length > 0) {
      const errLimit = settings.maxErrorsPerCard || 3;
      const errorList = cardBody.createEl("div", { cls: "cms-card-errors" });
      for (const err of item.validation.errors.slice(0, errLimit)) {
        errorList.createEl("div", {
          text: `${err.field}: ${err.message}`,
          cls: `cms-card-error cms-card-error-${err.severity}`,
        });
      }
      if (item.validation.errors.length > errLimit)
        errorList.createEl("div", { text: `+${item.validation.errors.length - errLimit} more`, cls: "cms-card-error-more" });
    }

    // Actions
    const cardActions = card.createEl("div", { cls: "cms-card-actions" });
    cardActions.createEl("button", { text: "Open", cls: "cms-btn cms-btn-sm", attr: { "aria-label": `Open ${item.title}` } })
      .addEventListener("click", () => {
        if (item.file) void this.app.workspace.getLeaf(false).openFile(item.file);
      });
    cardActions.createEl("button", { text: "Validate", cls: "cms-btn cms-btn-sm cms-btn-secondary", attr: { "aria-label": `Validate ${item.title}` } })
      .addEventListener("click", () => {
        try {
          const r = this.plugin.validateFile(item.file);
          new Notice(
            r.errors.length === 0
              ? `${item.seriesOrder || item.name}: All fields valid!`
              : `${item.seriesOrder || item.name}: ${r.errors.filter((err) => err.severity === "error").length} error(s), ${r.errors.filter((err) => err.severity === "warning").length} warning(s)`
          );
        } catch (e) { new Notice(`Validation failed: ${(e as Error).message}`); }
      });
    if (item.draft) {
      cardActions.createEl("button", { text: "Pre-flight", cls: "cms-btn cms-btn-sm cms-btn-primary", attr: { "aria-label": `Pre-flight ${item.title}` } })
        .addEventListener("click", () => { void this.plugin.preflightFile(item.file); });
    }

    return card;
  }

  private _createCardElement(item: ContentItem): HTMLElement | null {
    if (!this._gridEl) return null;
    try {
      const card = this._buildCardDOM(item);
      this._gridEl.appendChild(card);
      this._cardElements.set(item.path, card);
      return card;
    } catch (e) { console.error(e); return null; }
  }

  // ─── New Post (v1.9.0: collection picker + track picker) ───

  private async _newPost(): Promise<void> {
    try {
      const trackEntries = Object.entries(this.plugin.settings.tracks);
      if (trackEntries.length === 0) {
        new Notice("No tracks defined. Add a track in Settings first.");
        return;
      }

      // v1.9.0: Let user pick collection first, then track
      const creatableCollections = this.plugin.settings.collections.filter((c) => c.canCreateNew);

      if (creatableCollections.length === 0) {
        new Notice("No collections allow creating new posts. Check settings.");
        return;
      }

      // If only one creatable collection, skip collection picker
      let selectedCollectionId: string;
      if (creatableCollections.length === 1) {
        selectedCollectionId = creatableCollections[0].id;
      } else {
        // Show collection picker
        selectedCollectionId = await new Promise<string>((resolve) => {
          const colModal = new Modal(this.app);
          colModal.titleEl.setText("New Post — Select Collection");
          const body = colModal.contentEl.createEl("div", { cls: "cms-new-post-tracks" });

          for (const col of creatableCollections) {
            const btn = body.createEl("button", {
              text: `${col.emoji} ${col.name}`,
              cls: "cms-btn cms-btn-track-btn",
            });
            btn.addEventListener("click", () => {
              colModal.close();
              resolve(col.id);
            });
          }
          body.createEl("button", { text: "Cancel", cls: "cms-btn cms-btn-secondary" })
            .addEventListener("click", () => { colModal.close(); resolve(""); });
          colModal.open();
        });

        if (!selectedCollectionId) return;
      }

      // Show track picker
      const trackModal = new Modal(this.app);
      trackModal.titleEl.setText("New Post — Select Track");
      const body = trackModal.contentEl.createEl("div", { cls: "cms-new-post-tracks" });

      for (const [code, info] of trackEntries) {
        const btn = body.createEl("button", {
          text: `${info.emoji} ${info.name} (${code})`,
          cls: "cms-btn cms-btn-track-btn",
        });
        btn.addEventListener("click", async () => {
          trackModal.close();
          await this.plugin.newPost(code as TrackCode, selectedCollectionId);
        });
      }
      trackModal.open();
    } catch (e) { console.error(e); }
  }

  // ─── Filter Application ───

  applyFilters(): void {
    try {
      const search = this.searchQuery.toLowerCase().trim();
      let visibleCount = 0;
      for (const [path, cardEl] of this._cardElements) {
        const item = this.plugin.cache.items.get(path);
        if (!item) { cardEl.style.display = "none"; continue; }
        const matches = this.plugin.cache.matchesFilter(item, this.activeFilters, search);
        const beyondPage = matches && visibleCount >= this._visibleLimit;
        if (matches) visibleCount++;
        cardEl.style.display = !matches || beyondPage ? "none" : "";
      }
      this._totalVisible = visibleCount;
      if (this._loadMoreEl) {
        this._loadMoreEl.style.display = this._totalVisible > this._visibleLimit ? "" : "none";
        const btn = this._loadMoreEl.querySelector("button");
        if (btn) btn.textContent = `Load More (${Math.max(0, this._totalVisible - this._visibleLimit)} remaining)`;
      }
    } catch (e) { console.error(e); }
  }

  // ─── Meta Section ───

  private _renderMetaSection(container: HTMLElement): void {
    if (!container) return;
    try {
      const existing = container.querySelector(".cms-meta-section");
      if (existing) existing.remove();
      const settings = this.plugin.settings;
      const stats = this.plugin.cache.getStats(settings);
      if (stats.uniqueTags.length === 0 && stats.allEras.length === 0) return;

      const items = this.plugin.cache.getSortedItems(undefined, settings.tracks, this.sortMode);
      const section = container.createEl("div", { cls: "cms-meta-section" });

      const eraCounts = new Map<string, number>();
      const tagCounts = new Map<string, number>();
      for (const item of items) {
        if (item.era) eraCounts.set(item.era, (eraCounts.get(item.era) || 0) + 1);
        for (const tag of item.tags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }

      if (stats.allEras.length > 0) {
        const block = section.createEl("div", { cls: "cms-meta-block" });
        block.createEl("h4", { text: `Eras (${stats.allEras.length})`, cls: "cms-meta-heading" });
        const list = block.createEl("div", { cls: "cms-tag-list" });
        for (const era of stats.allEras.sort())
          list.createEl("span", { text: `${era} (${eraCounts.get(era) || 0})`, cls: "cms-tag-chip cms-era-chip" });
      }

      if (stats.uniqueTags.length > 0) {
        const tagLimit = settings.maxMetaTags || 30;
        const block = section.createEl("div", { cls: "cms-meta-block" });
        block.createEl("h4", { text: `Tags (${stats.uniqueTags.length})`, cls: "cms-meta-heading" });
        const list = block.createEl("div", { cls: "cms-tag-list" });
        for (const tag of stats.uniqueTags.sort().slice(0, tagLimit))
          list.createEl("span", { text: `${tag} (${tagCounts.get(tag) || 0})`, cls: "cms-tag-chip" });
        if (stats.uniqueTags.length > tagLimit)
          list.createEl("span", { text: `+${stats.uniqueTags.length - tagLimit} more`, cls: "cms-tag-chip" });
      }
    } catch (e) { console.error(e); }
  }

  async onClose() {
    this._destroyed = true;
    this._ready = false;
    if (this._updateTimer) clearTimeout(this._updateTimer);
    if (this._renderTimer) clearTimeout(this._renderTimer);
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._cardElements.clear();
    this._pendingPaths.clear();
    this._itemSnapshots.clear();
    this._selectedPaths.clear();
  }

  // ─── v1.8.0: Bulk Action Helpers ───

  private _selectAllVisible(): void {
    for (const [path, cardEl] of this._cardElements) {
      if (cardEl.style.display !== "none") {
        this._selectedPaths.add(path);
      }
    }
    this.renderDashboard();
  }

  private _bulkActionValidate(): void {
    let errors = 0;
    let warnings = 0;
    let ready = 0;
    for (const path of this._selectedPaths) {
      const item = this.plugin.cache.items.get(path);
      if (!item) continue;
      const r = this.plugin.validateFile(item.file);
      if (r.status === "error") errors++;
      else if (r.status === "warning") warnings++;
      else ready++;
    }
    new Notice(
      `${this._selectedPaths.size} posts: ${ready} ready, ${errors} errors, ${warnings} warnings`,
    );
  }

  private async _bulkActionToggleDraft(): Promise<void> {
    const items = [...this._selectedPaths]
      .map((p) => this.plugin.cache.items.get(p))
      .filter((i): i is ContentItem => !!i);

    if (items.length === 0) return;

    const confirmed = await new Promise<boolean>((resolve) => {
      const modal = new Modal(this.app);
      modal.titleEl.setText(`Toggle draft for ${items.length} post(s)?`);
      const body = modal.contentEl.createEl("div");
      body.createEl("p", {
        text: `This will toggle the draft flag on ${items.length} selected post(s).`,
      });
      const btnRow = body.createEl("div", { cls: "cms-modal-btn-row" });
      btnRow.createEl("button", { text: "Cancel", cls: "cms-btn cms-btn-secondary" })
        .addEventListener("click", () => { modal.close(); resolve(false); });
      btnRow.createEl("button", { text: "Toggle", cls: "cms-btn cms-btn-primary" })
        .addEventListener("click", () => { modal.close(); resolve(true); });
      modal.open();
    });

    if (!confirmed) return;

    let toggled = 0;
    for (const item of items) {
      try {
        await this.app.fileManager.processFrontMatter(item.file, (fm) => {
          fm.draft = !fm.draft;
        });
        toggled++;
      } catch (e) {
        console.error(`Failed to toggle ${item.path}:`, e);
      }
    }
    new Notice(`Toggled draft for ${toggled}/${items.length} post(s).`);
    this._selectedPaths.clear();
    this.plugin._updateStatusBar();
    this.renderDashboard();
  }

  private async _bulkActionPreflight(): Promise<void> {
    const items = [...this._selectedPaths]
      .map((p) => this.plugin.cache.items.get(p))
      .filter((i): i is ContentItem => !!i && i.draft);

    if (items.length === 0) {
      new Notice("No drafts selected for pre-flight.");
      return;
    }

    const confirmed = await new Promise<boolean>((resolve) => {
      const modal = new Modal(this.app);
      modal.titleEl.setText(`Pre-flight ${items.length} draft(s)?`);
      const body = modal.contentEl.createEl("div");
      body.createEl("p", {
        text: `This will pre-flight ${items.length} selected draft(s). They will be set to draft:${this.plugin.settings.preflightDraft}, status:"${this.plugin.settings.preflightStatus}".`,
      });
      const btnRow = body.createEl("div", { cls: "cms-modal-btn-row" });
      btnRow.createEl("button", { text: "Cancel", cls: "cms-btn cms-btn-secondary" })
        .addEventListener("click", () => { modal.close(); resolve(false); });
      btnRow.createEl("button", { text: "Pre-flight", cls: "cms-btn cms-btn-primary" })
        .addEventListener("click", () => { modal.close(); resolve(true); });
      modal.open();
    });

    if (!confirmed) return;

    let published = 0;
    for (const item of items) {
      try {
        await this.plugin.preflightFile(item.file, true);
        published++;
      } catch (e) {
        console.error(`Failed to pre-flight ${item.path}:`, e);
      }
    }
    new Notice(`Pre-flighted ${published}/${items.length} draft(s).`);
    this._selectedPaths.clear();
    this.plugin._updateStatusBar();
    this.renderDashboard();
  }
}

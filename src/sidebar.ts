/**
 * isHistory CMS Plugin — Sidebar View
 *
 * Context-aware validation panel for the currently active file.
 * v1.9.0: Fixed collection detection bug, uses findCollectionByPath(),
 * collection config for display, shared SEO constants.
 */

import { ItemView, type WorkspaceLeaf, Notice } from "obsidian";
import { findCollectionByPath, type CollectionConfig } from "./types";
import { calculateArchiveSEO, calculateVaultSEO, calculateCollectionSEO, type SEOConfig, getSEOLabel, SEO_GRADE_COLORS, SEO_GRADE_THRESHOLDS } from "./seo";
import { getValidationConfig } from "./types";
import IsHistoryPlugin from "./main";

export const VIEW_TYPE_SIDEBAR = "ishistory-sidebar";

export class IsHistorySidebarView extends ItemView {
  plugin: IsHistoryPlugin;
  private _updateTimer: ReturnType<typeof setTimeout> | null = null;
  private _destroyed = false;

  constructor(leaf: WorkspaceLeaf, plugin: IsHistoryPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return VIEW_TYPE_SIDEBAR; }
  getDisplayText() { return "isHistory Validate"; }
  getIcon() { return "checklist"; }

  async onOpen() {
    this._destroyed = false;

    this.registerEvent(
      this.app.workspace.on("file-open" as never, () => {
        if (!this.app.workspace.layoutReady || this._destroyed) return;
        this._debounceUpdate();
      })
    );

    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (!this.app.workspace.layoutReady || this._destroyed) return;
        const active = this.app.workspace.getActiveFile();
        if (active && file.path === active.path) this._debounceUpdate();
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (!this.app.workspace.layoutReady || this._destroyed) return;
        const active = this.app.workspace.getActiveFile();
        if (!active || file.path === active.path) this._debounceUpdate();
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file) => {
        if (!this.app.workspace.layoutReady || this._destroyed) return;
        const active = this.app.workspace.getActiveFile();
        if (active && file.path === active.path) this._debounceUpdate();
      })
    );

    if (this.app.workspace.layoutReady) {
      this._debounceUpdate();
    } else {
      const ref = this.app.workspace.on("layout-ready" as never, () => {
        this.app.workspace.offref(ref);
        this._debounceUpdate();
      });
      this.registerEvent(ref);
    }
  }

  private _debounceUpdate(): void {
    if (this._destroyed) return;
    if (this._updateTimer) clearTimeout(this._updateTimer);
    this._updateTimer = setTimeout(() => this.updateUI(), 400);
  }

  updateUI(): void {
    if (this._destroyed) return;
    try {
      const container = this.contentEl;
      container.empty();
      container.addClass("ishistory-sidebar");

      const activeFile = this.app.workspace.getActiveFile();
      const settings = this.plugin.settings;

      if (
        !activeFile ||
        activeFile.extension !== "md" ||
        !this.plugin.cache.isInCollection(activeFile.path, settings)
      ) {
        // v1.9.0: Use collection names dynamically
        const collectionNames = settings.collections.map((c) => c.name).join(" or ");
        container.createEl("div", {
          text: `Open a file in ${collectionNames || "a content collection"} to validate.`,
          cls: "cms-sidebar-empty-state",
        });
        return;
      }

      // v1.9.0: FIX BUG — use findCollectionByPath instead of broken startsWith
      const collectionConfig = findCollectionByPath(settings, activeFile.path);
      const collection = collectionConfig ? collectionConfig.id : this.plugin.cache._getCollection(activeFile.path, settings) || "unknown";

      const cached = this.plugin.cache.items.get(activeFile.path);
      const result = cached
        ? cached.validation
        : this.plugin.validateFile(activeFile);

      container.createEl("div", { text: "isHistory Validate", cls: "cms-sidebar-title" });

      const fileInfo = container.createEl("div", { cls: "cms-sidebar-file-info" });

      // v1.9.0: Show collection badge with emoji/name from config
      if (collectionConfig) {
        fileInfo.createEl("span", {
          text: `${collectionConfig.emoji} ${collectionConfig.name}`,
          cls: "cms-badge cms-badge-collection",
        });
      }

      if (cached && cached.seriesOrder) {
        fileInfo.createEl("span", {
          text: cached.seriesOrder,
          cls: `cms-card-code cms-card-code-${(cached.track || "X").toLowerCase()}`,
        });
      }
      fileInfo.createEl("span", { text: activeFile.path, cls: "cms-sidebar-file-title" });

      // v1.7.0 → v1.9.0: SEO Score display with check breakdown, shared constants
      if (settings.showSeoScore && cached && cached.seoScore !== null) {
        const seoResult = cached.seoScore;
        // v1.9.0: Use shared constants for SEO colors
        const seoColor = seoResult >= SEO_GRADE_THRESHOLDS.A ? SEO_GRADE_COLORS.A
          : seoResult >= SEO_GRADE_THRESHOLDS.B ? SEO_GRADE_COLORS.B
          : seoResult >= SEO_GRADE_THRESHOLDS.C ? SEO_GRADE_COLORS.C
          : seoResult >= SEO_GRADE_THRESHOLDS.D ? SEO_GRADE_COLORS.D
          : SEO_GRADE_COLORS.F;
        const seoLabel = getSEOLabel(seoResult);
        const seoWrapper = container.createEl("div", { cls: "cms-seo-wrapper" });
        const scoreEl = seoWrapper.createEl("div", { cls: "cms-seo-score" });
        scoreEl.createEl("span", { text: String(seoResult), cls: "cms-seo-number", attr: { style: `color: ${seoColor}` } });
        scoreEl.createEl("span", { text: `/100 ${seoLabel}`, cls: "cms-seo-label" });

        // Show individual SEO check breakdown
        if (cached.seoChecks && cached.seoChecks.length > 0) {
          const checksList = seoWrapper.createEl("div", { cls: "cms-seo-checks" });
          for (const check of cached.seoChecks) {
            const checkEl = checksList.createEl("div", {
              cls: `cms-seo-check ${check.passed ? "cms-seo-check-passed" : "cms-seo-check-failed"}`,
            });
            const icon = check.passed ? "\u2713" : "\u2717";
            checkEl.createEl("span", { text: icon, cls: "cms-seo-check-icon" });
            checkEl.createEl("span", { text: check.label, cls: "cms-seo-check-label" });
            checkEl.createEl("span", {
              text: `${check.points}/${check.maxPoints}`,
              cls: "cms-seo-check-points",
            });
            if (!check.passed) {
              checkEl.createEl("div", { text: check.hint, cls: "cms-seo-check-hint" });
            }
          }
        }
      }

      // Stale indicator
      if (settings.showStaleBadge && cached && cached.isStale) {
        container.createEl("div", {
          text: `Stale content — not modified in ${settings.staleThresholdDays}+ days`,
          cls: "cms-stale-warning",
        });
      }

      const badgeMap: Record<string, { text: string; cls: string }> = {
        ready: { text: "Ready for Production", cls: "cms-badge-success" },
        error: { text: "Schema Errors Found", cls: "cms-badge-error" },
        warning: { text: "Warnings", cls: "cms-badge-warning" },
      };
      const badge = badgeMap[result.status] || badgeMap.error;
      container
        .createEl("div", { cls: "cms-status-wrapper" })
        .createEl("span", { text: badge.text, cls: `cms-badge ${badge.cls}` });

      container.createEl("hr");
      const list = container.createEl("div", { cls: "cms-diagnostics-list" });

      if (result.errors.length === 0) {
        list.createEl("div", {
          text: "All fields valid! Ready to push to production.",
          cls: "cms-success-text",
        });
      } else {
        for (const error of result.errors) {
          const el = list.createEl("div", { cls: `cms-error-item severity-${error.severity}` });
          el.createEl("div", { text: error.field, cls: "cms-error-field" });
          el.createEl("p", { text: error.message, cls: "cms-error-message" });
        }
      }

      const actions = container.createEl("div", { cls: "cms-sidebar-actions" });
      // v1.9.0: Use collection config's canCreateNew to decide whether to show pre-flight
      const canCreateNew = collectionConfig ? collectionConfig.canCreateNew : collection === "archive";
      if (canCreateNew && cached && cached.draft) {
        actions
          .createEl("button", { text: "Pre-flight this post", cls: "cms-btn cms-btn-primary cms-btn-full" })
          .addEventListener("click", async () => {
            try {
              await this.plugin.preflightFile(activeFile);
              this._debounceUpdate();
            } catch (e) { new Notice(`Failed: ${(e as Error).message}`); }
          });
      }
      actions
        .createEl("button", { text: "Open Dashboard", cls: "cms-btn cms-btn-secondary cms-btn-full" })
        .addEventListener("click", () => { void this.plugin.activateDashboard(); });
    } catch (e) { console.error(e); }
  }

  async onClose() {
    this._destroyed = true;
    if (this._updateTimer) clearTimeout(this._updateTimer);
  }
}

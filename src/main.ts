/**
 * isHistory CMS Plugin — Main Entry Point
 *
 * Orchestrates all plugin components: cache, views, commands,
 * settings, and shared operations.
 * v1.9.0: Dynamic collections, collection-aware validation/SEO.
 */

import { Plugin, Notice, Modal, TFile, type Menu } from "obsidian";
import {
  type IsHistorySettings,
  type TrackCode,
  type TrackTemplate,
  type ValidationResult,
  type TrackInfo,
  type CollectionConfig,
  DEFAULT_SETTINGS,
  normalizePathSetting,
  substituteVars,
  getValidationConfig,
  hexToRgba,
  deepMerge,
  buildSeriesOrderRegex,
  findCollectionByPath,
  getCollectionConfig,
} from "./types";
import { ContentCache } from "./cache";
import { validateArchive, validateVault, validateForCollection, getStatus } from "./validator";
import { IsHistorySettingTab, migrateSettings } from "./settings";
import {
  IsHistoryDashboardView,
  VIEW_TYPE_DASHBOARD,
} from "./dashboard";
import {
  IsHistorySidebarView,
  VIEW_TYPE_SIDEBAR,
} from "./sidebar";
import { generateHealthReport, renderReportMarkdown } from "./report";
import { getSEOLabel } from "./seo";

export default class IsHistoryPlugin extends Plugin {
  settings!: IsHistorySettings;
  cache!: ContentCache;
  private _ribbonIcon: HTMLElement | null = null;
  private _dynamicStyleEl: HTMLElement | null = null;
  private _statusBarItem: HTMLElement | null = null;

  async onload() {
    try {
      await this.loadSettings();
      this.cache = new ContentCache();

      // Register views
      this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new IsHistoryDashboardView(leaf, this));
      this.registerView(VIEW_TYPE_SIDEBAR, (leaf) => new IsHistorySidebarView(leaf, this));

      // Inject dynamic CSS for track colors
      this._injectDynamicStyles();

      // ─── Feature 6: Status bar health indicator ───
      this._initStatusBar();

      // Ribbon icon
      if (this.settings.showRibbonIcon) {
        this._ribbonIcon = this.addRibbonIcon("book-open", "isHistory CMS", () =>
          void this.activateDashboard()
        );
      }

      // Commands
      this.addCommand({
        id: "open-dashboard",
        name: "Open isHistory dashboard",
        callback: () => { void this.activateDashboard(); },
      });
      this.addCommand({
        id: "open-sidebar",
        name: "Open quick validate",
        callback: () => { void this.activateSidebar(); },
      });
      this.addCommand({
        id: "validate-current",
        name: "Validate current post",
        callback: () => this.validateCurrent(),
      });
      this.addCommand({
        id: "publish-current",
        name: "Pre-flight current draft",
        callback: () => { void this.publishCurrent(); },
      });

      // Dynamic track commands — one per track
      this._registerTrackCommands();

      this.addCommand({
        id: "bulk-validate",
        name: "Validate all content",
        callback: () => this.bulkValidate(),
      });
      this.addCommand({
        id: "bulk-preflight",
        name: "Bulk pre-flight all drafts",
        callback: () => { void this.bulkPreFlight(); },
      });

      // ─── v1.7.0: Command Palette Integration ───
      this.addCommand({
        id: "toggle-draft-status",
        name: "Toggle draft status of current post",
        callback: () => { void this.toggleDraftStatus(); },
      });
      this.addCommand({
        id: "show-seo-score",
        name: "Show SEO score for current post",
        callback: () => this.showSEOScore(),
      });
      this.addCommand({
        id: "open-settings",
        name: "Open isHistory settings",
        callback: () => { void this.openPluginSettings(); },
      });
      this.addCommand({
        id: "refresh-cache",
        name: "Refresh content cache",
        callback: () => this.refreshCache(),
      });

      // ─── v1.8.0: Content Health Report ───
      this.addCommand({
        id: "generate-health-report",
        name: "Generate content health report",
        callback: () => { void this.generateHealthReport(); },
      });

      // ─── v1.8.0: Bulk Operations ───
      this.addCommand({
        id: "bulk-toggle-drafts",
        name: "Toggle draft status for all filtered items",
        callback: () => { void this.bulkToggleDrafts(); },
      });
      this.addCommand({
        id: "bulk-change-status",
        name: "Change status for all filtered items",
        callback: () => { void this.bulkChangeStatus(); },
      });

      // ─── v1.8.0: Refresh SEO with body content ───
      this.addCommand({
        id: "refresh-seo-scores",
        name: "Refresh SEO scores with body content",
        callback: () => { void this.refreshSEOScores(); },
      });

      // ─── Feature 9: Right-click context menus ───
      this._registerContextMenus();

      // Settings tab
      this.addSettingTab(new IsHistorySettingTab(this.app, this));
    } catch (e) {
      console.error("isHistory CMS: fatal onload error", e);
      new Notice("isHistory CMS failed to load.");
    }
  }

  async onunload() {
    try {
      this.app.workspace.detachLeavesOfType(VIEW_TYPE_DASHBOARD);
      this.app.workspace.detachLeavesOfType(VIEW_TYPE_SIDEBAR);
      this._dynamicStyleEl?.remove();
      this._dynamicStyleEl = null;
      this._statusBarItem = null;
    } catch (e) {
      console.error("isHistory CMS: onunload error", e);
    }
  }

  // ─── Feature 6: Status Bar Health Indicator ───

  private _initStatusBar(): void {
    this._statusBarItem = this.addStatusBarItem();
    this._statusBarItem.classList.add("ishistory-statusbar");
    this._statusBarItem.createEl("span", { cls: "ishistory-statusbar-icon", text: "isH" });
    this._statusBarItem.createEl("span", { cls: "ishistory-statusbar-text", text: " Loading..." });
    this.registerDomEvent(this._statusBarItem, "click", () => { void this.activateDashboard(); });
    this._updateStatusBar();
  }

  /** Update status bar text — call after cache changes */
  _updateStatusBar(): void {
    if (!this._statusBarItem) return;
    try {
      const stats = this.cache.getStats(this.settings);
      const textEl = this._statusBarItem.querySelector(".ishistory-statusbar-text");
      if (!textEl) return;
      if (stats.errors > 0) {
        textEl.textContent = ` ${stats.errors} error${stats.errors !== 1 ? "s" : ""}`;
        this._statusBarItem.classList.add("ishistory-statusbar-error");
        this._statusBarItem.classList.remove("ishistory-statusbar-ok");
      } else if (stats.warnings > 0) {
        textEl.textContent = ` ${stats.warnings} warning${stats.warnings !== 1 ? "s" : ""}`;
        this._statusBarItem.classList.remove("ishistory-statusbar-error", "ishistory-statusbar-ok");
      } else {
        textEl.textContent = ` ${stats.ready} ready`;
        this._statusBarItem.classList.add("ishistory-statusbar-ok");
        this._statusBarItem.classList.remove("ishistory-statusbar-error");
      }
    } catch {
      // Status bar is non-critical; never throw
    }
  }

  // ─── Feature 9: Right-click Context Menus ───

  private _registerContextMenus(): void {
    this.registerEvent(
      this.app.workspace.on("file-menu" as never, (menu: Menu, file) => {
        const abstractFile = file as unknown as { path?: string };
        if (typeof abstractFile.path !== "string" || !abstractFile.path.endsWith(".md")) return;
        if (!this.cache.isInCollection(abstractFile.path, this.settings)) return;
        const tFile = file as unknown as TFile;
        menu.addItem((item) => {
          item.setTitle("Validate with isHistory")
            .setIcon("checklist")
            .onClick(() => {
              const result = this.validateFile(tFile);
              new Notice(
                result.errors.length === 0
                  ? `${tFile.basename}: All fields valid!`
                  : `${tFile.basename}: ${result.errors.filter((e) => e.severity === "error").length} error(s), ${result.errors.filter((e) => e.severity === "warning").length} warning(s)`
              );
            });
        });
        menu.addItem((item) => {
          item.setTitle("Pre-flight with isHistory")
            .setIcon("upload-cloud")
            .onClick(() => { void this.preflightFile(tFile); });
        });
        menu.addItem((item) => {
          item.setTitle("Open in isHistory Dashboard")
            .setIcon("book-open")
            .onClick(() => { void this.activateDashboard(); });
        });
      })
    );

    this.registerEvent(
      this.app.workspace.on("editor-menu" as never, (menu: Menu) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !this.cache.isInCollection(file.path, this.settings)) return;
        menu.addItem((item) => {
          item.setTitle("Validate this post")
            .setIcon("checklist")
            .onClick(() => this.validateCurrent());
        });
        menu.addItem((item) => {
          item.setTitle("Pre-flight this post")
            .setIcon("upload-cloud")
            .onClick(() => { void this.publishCurrent(); });
        });
      })
    );
  }

  // ─── Dynamic Track Commands ───

  private _trackCommandIds: string[] = [];

  private _registerTrackCommands(): void {
    for (const id of this._trackCommandIds) {
      try {
        const cmds = (this.app as unknown as { commands?: { removeCommand?: (id: string) => void } }).commands;
        cmds?.removeCommand?.(`ishistory-cms:${id}`);
      } catch { /* ignore */ }
    }
    this._trackCommandIds = [];

    for (const [code, info] of Object.entries(this.settings.tracks)) {
      const cmdId = `new-${code.toLowerCase()}-track`;
      this.addCommand({
        id: cmdId,
        name: `New ${info.name} (${code}-track)`,
        callback: () => { void this.newPost(code); },
      });
      this._trackCommandIds.push(cmdId);
    }
  }

  // ─── Dynamic CSS Injection ───

  _injectDynamicStyles(): void {
    let el = document.getElementById("ishistory-dynamic-styles") as HTMLElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "ishistory-dynamic-styles";
      document.head.appendChild(el);
    }
    this._dynamicStyleEl = el;
    this._updateDynamicStyles();
  }

  _updateDynamicStyles(): void {
    if (!this._dynamicStyleEl) return;
    const rules: string[] = [];

    rules.push(":root {");
    for (const [code, info] of Object.entries(this.settings.tracks)) {
      rules.push(`--ish-track-${code.toLowerCase()}: ${info.color};`);
    }
    rules.push("}");

    for (const [code, info] of Object.entries(this.settings.tracks)) {
      const lc = code.toLowerCase();
      rules.push(`.cms-card-code-${lc} { background: ${hexToRgba(info.color, 0.15)}; color: ${info.color}; }`);
      rules.push(`.cms-card.cms-card-track-${code} { border-left-color: ${info.color}; }`);
      rules.push(`.cms-stat-track-${lc} .cms-stat-value { color: ${info.color}; }`);
    }

    // v1.9.0: Dynamic collection CSS
    for (const col of this.settings.collections) {
      const colId = col.id.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      rules.push(`.cms-stat-collection-${colId} .cms-stat-value { color: ${col.color}; }`);
      rules.push(`.cms-card.cms-card-collection-${colId} { border-left-color: ${col.color}; }`);
    }

    const primaryColor = Object.values(this.settings.tracks)[0]?.color || "#7c3aed";
    rules.push(`.cms-card-tag { background: ${hexToRgba(primaryColor, 0.1)}; color: var(--ish-track-a, ${primaryColor}); }`);
    rules.push(`.cms-tag-chip { background: ${hexToRgba(primaryColor, 0.08)}; color: var(--ish-track-a, ${primaryColor}); }`);

    this._dynamicStyleEl.textContent = rules.join("\n");
  }

  // ─── Settings ───

  async loadSettings() {
    try {
      const loaded = await this.loadData();
      const migrated = migrateSettings(loaded || {});
      // ─── Feature 5: Deep-merge instead of shallow assign ───
      this.settings = deepMerge(
        Object.assign({}, DEFAULT_SETTINGS) as unknown as Record<string, unknown>,
        migrated as Record<string, unknown>,
      ) as unknown as IsHistorySettings;
      this.settings._version = DEFAULT_SETTINGS._version;
      // v1.9.0: Normalize collection paths on load
      this.settings.archivePath = normalizePathSetting(this.settings.archivePath);
      this.settings.vaultPath = normalizePathSetting(this.settings.vaultPath);
      for (const col of this.settings.collections) {
        col.path = normalizePathSetting(col.path);
      }
      if (loaded && (loaded._version || 0) < DEFAULT_SETTINGS._version) {
        await this.saveData(this.settings);
      }
    } catch (e) {
      console.error("isHistory CMS: loadSettings failed", e);
      this.settings = Object.assign({}, DEFAULT_SETTINGS) as IsHistorySettings;
    }
  }

  async saveSettings() {
    try {
      await this.saveData(this.settings);
    } catch (e) {
      console.error("isHistory CMS: saveSettings failed", e);
      new Notice("Failed to save settings. Your changes may be lost on restart.");
    }
  }

  // ─── Cache Refresh ───

  rescanCache() {
    try {
      this.cache.scanAll(this.app, this.settings);
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
      for (const leaf of leaves) {
        if (leaf.view instanceof IsHistoryDashboardView) {
          leaf.view.requestRender();
        }
      }
      this._updateStatusBar();
    } catch (e) {
      console.error("isHistory CMS: rescanCache failed", e);
    }
  }

  // ─── Ribbon Icon ───

  updateRibbonIcon() {
    try {
      if (this._ribbonIcon) {
        this._ribbonIcon.remove();
        this._ribbonIcon = null;
      }
      if (this.settings.showRibbonIcon) {
        this._ribbonIcon = this.addRibbonIcon("book-open", "isHistory CMS", () =>
          void this.activateDashboard()
        );
      }
    } catch (e) {
      console.error("isHistory CMS: updateRibbonIcon failed", e);
    }
  }

  // ─── View Activation ───

  async activateDashboard() {
    try {
      const { workspace } = this.app;
      let leaf = workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD)[0];
      if (!leaf) {
        leaf = workspace.getLeaf(false);
        if (!leaf) {
          new Notice("Could not open dashboard view.");
          return;
        }
        await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
      }
      await workspace.revealLeaf(leaf);
    } catch (e) { console.error(e); }
  }

  async activateSidebar() {
    try {
      const { workspace } = this.app;
      let leaf = workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR)[0];
      if (!leaf) {
        const rightLeaf = workspace.getRightLeaf(false);
        if (!rightLeaf) {
          new Notice("Could not open sidebar view.");
          return;
        }
        leaf = rightLeaf;
        await leaf.setViewState({ type: VIEW_TYPE_SIDEBAR, active: true });
      }
      await workspace.revealLeaf(leaf);
    } catch (e) { console.error(e); }
  }

  // ─── Shared Validation ───

  validateFile(file: TFile): ValidationResult {
    try {
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      const config = getValidationConfig(this.settings);
      const collectionConfig = findCollectionByPath(this.settings, file.path);

      if (collectionConfig) {
        return getStatus(validateForCollection(fm || null, config, collectionConfig));
      }

      // Legacy fallback
      const collection = this.cache._getCollection(file.path, this.settings);
      if (collection === "archive") {
        return getStatus(validateArchive(fm, config));
      } else if (collection === "vault") {
        return getStatus(validateVault(fm, config));
      }
      return { status: "ready", label: "N/A", errors: [] };
    } catch {
      return {
        status: "error",
        label: "Error",
        errors: [{ field: "Validation", message: "Failed to validate.", severity: "error" }],
      };
    }
  }

  validateCurrent() {
    try {
      const file = this.app.workspace.getActiveFile();
      if (!file || !this.cache.isInCollection(file.path, this.settings)) {
        const firstCollection = this.settings.collections[0];
        const hint = firstCollection ? `Open a file in ${firstCollection.name} first.` : "Open a content file first.";
        new Notice(hint);
        return;
      }
      const result = this.validateFile(file);
      if (result.errors.length === 0) {
        new Notice(`${file.basename}: All fields valid!`);
      } else {
        new Notice(
          `${file.basename}: ${result.errors.filter((err) => err.severity === "error").length} error(s), ${result.errors.filter((err) => err.severity === "warning").length} warning(s)`
        );
      }
    } catch (e) {
      new Notice(`Validation failed: ${(e as Error).message}`);
    }
  }

  // ─── Feature 1: Pre-flight with validation gate ───

  async preflightFile(file: TFile, skipConfirm = false): Promise<void> {
    if (!file) return;
    try {
      const result = this.validateFile(file);
      const hasErrors = result.errors.some((e) => e.severity === "error");
      if (hasErrors && !skipConfirm) {
        const errorCount = result.errors.filter((e) => e.severity === "error").length;
        const warningCount = result.errors.filter((e) => e.severity === "warning").length;
        const confirmed = await new Promise<boolean>((resolve) => {
          const modal = new Modal(this.app);
          modal.titleEl.setText("Validation errors found");
          const body = modal.contentEl.createEl("div");
          body.createEl("p", {
            text: `This post has ${errorCount} error${errorCount !== 1 ? "s" : ""} and ${warningCount} warning${warningCount !== 1 ? "s" : ""}. Pre-flighting will mark it as ready for publication despite these issues.`,
          });
          const errList = body.createEl("ul", { cls: "cms-preflight-errors" });
          for (const err of result.errors.slice(0, 5)) {
            errList.createEl("li", { text: `${err.field}: ${err.message}` });
          }
          if (result.errors.length > 5) {
            errList.createEl("li", { text: `...and ${result.errors.length - 5} more`, cls: "cms-card-error-more" });
          }
          const btnRow = body.createEl("div", { cls: "cms-modal-btn-row" });
          btnRow.createEl("button", { text: "Cancel", cls: "cms-btn cms-btn-secondary" })
            .addEventListener("click", () => { modal.close(); resolve(false); });
          btnRow.createEl("button", { text: "Pre-flight anyway", cls: "cms-btn cms-btn-primary" })
            .addEventListener("click", () => { modal.close(); resolve(true); });
          modal.open();
        });
        if (!confirmed) return;
      }

      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm.draft = this.settings.preflightDraft;
        fm.status = this.settings.preflightStatus;
        if (this.settings.preflightAutoDate && !fm.date) {
          fm.date = new Date().toISOString().split("T")[0];
        }
      });
      new Notice(`Pre-flighted: ${file.basename}. Sync with Git to deploy.`);
      this._updateStatusBar();
    } catch (e) {
      new Notice(`Pre-flight failed: ${(e as Error).message}`);
    }
  }

  async publishCurrent() {
    try {
      const file = this.app.workspace.getActiveFile();
      if (!file || !this.cache.isInCollection(file.path, this.settings)) {
        const firstCollection = this.settings.collections[0];
        const hint = firstCollection ? `Open a file in ${firstCollection.name} first.` : "Open a content file first.";
        new Notice(hint);
        return;
      }
      await this.preflightFile(file);
    } catch (e) {
      new Notice(`Failed: ${(e as Error).message}`);
    }
  }

  // ─── New Post (v1.9.0: collection-aware template engine) ───

  /** Escape double quotes for YAML string values */
  private _yamlSafe(s: string): string {
    return s.replace(/"/g, '\\"');
  }

  async newPost(track: TrackCode, collectionId?: string) {
    try {
      const info: TrackInfo | undefined = this.settings.tracks[track];
      if (!info) {
        new Notice(`Unknown track: ${track}`);
        return;
      }

      // v1.9.0: Find the collection to create in
      let targetCollection: CollectionConfig;
      if (collectionId) {
        const found = getCollectionConfig(this.settings, collectionId);
        if (!found) {
          new Notice(`Unknown collection: ${collectionId}`);
          return;
        }
        targetCollection = found;
      } else {
        // Default: first collection that allows creating new posts
        targetCollection = this.settings.collections.find((c) => c.canCreateNew) || this.settings.collections[0];
      }

      if (!targetCollection) {
        new Notice("No collection available for creating new posts.");
        return;
      }

      // v1.8.0: Check for track-specific template overrides
      const trackTpl: TrackTemplate = this.settings.trackTemplates[track] || {};

      const vars: Record<string, string> = {};

      // Use dynamic regex from track codes
      const seriesRegex = buildSeriesOrderRegex(this.settings.tracks);
      const existingOrders = this.cache
        .getSortedItems(targetCollection.id, this.settings.tracks)
        .filter((i) => i.track === track && i.seriesOrder)
        .map((i) => {
          const m = i.seriesOrder.match(seriesRegex);
          return m ? parseInt(m[2], 10) : 0;
        });
      const nextNum = existingOrders.length > 0 ? Math.max(...existingOrders) + 1 : 1;
      const seriesOrder = `${track}${nextNum}`;

      vars.seriesOrder = seriesOrder;
      vars.seriesOrderLower = seriesOrder.toLowerCase();
      vars.track = track;
      vars.trackName = info.name;
      vars.date = new Date().toISOString().split("T")[0];
      vars.series = this.settings.defaultSeries || "";

      // v1.8.0: Use track-specific template or fall back to global template
      const slugTemplate = trackTpl.slug || this.settings.newPostSlug;
      const titleTemplate = trackTpl.title || this.settings.newPostTitle;
      const imageTemplate = trackTpl.image || this.settings.newPostImage;
      const seriesTemplate = trackTpl.series || this.settings.defaultSeries || "";
      const statusTemplate = trackTpl.status || this.settings.newPostStatus;
      const bodyTemplate = trackTpl.body || this.settings.newPostBody;

      const slug = substituteVars(slugTemplate, vars);
      let path = `${normalizePathSetting(targetCollection.path)}/${slug}.md`;

      let suffix = 0;
      while (this.app.vault.getAbstractFileByPath(path)) {
        suffix++;
        vars.seriesOrder = `${seriesOrder}-${suffix}`;
        vars.seriesOrderLower = `${seriesOrder.toLowerCase()}-${suffix}`;
        const collSlug = substituteVars(slugTemplate, vars);
        path = `${normalizePathSetting(targetCollection.path)}/${collSlug}.md`;
      }

      vars.seriesOrder = suffix > 0 ? `${seriesOrder}-${suffix}` : seriesOrder;
      vars.seriesOrderLower = vars.seriesOrder.toLowerCase();

      const title = substituteVars(titleTemplate, vars);
      const image = substituteVars(imageTemplate, vars);
      const series = substituteVars(seriesTemplate, vars);
      const status = substituteVars(statusTemplate, vars);
      const body = substituteVars(bodyTemplate, vars);

      // v1.9.0: Use collection's defaultDraft instead of hardcoded true
      const draftValue = targetCollection.defaultDraft;

      // v1.8.0: Build frontmatter with track-specific extra fields
      let extraFmLines = "";
      if (trackTpl.extraFrontmatter) {
        for (const [key, value] of Object.entries(trackTpl.extraFrontmatter)) {
          const resolved = substituteVars(value, vars);
          extraFmLines += `${key}: "${this._yamlSafe(resolved)}"\n`;
        }
      }

      const content = `---
title: "${this._yamlSafe(title)}"
date: ${vars.date}
description: ""
draft: ${draftValue}
tags: []
image: "${this._yamlSafe(image)}"
series: "${this._yamlSafe(series)}"
seriesOrder: "${this._yamlSafe(vars.seriesOrder)}"
track: "${this._yamlSafe(track)}"
status: "${this._yamlSafe(status)}"
part: ""
figures: ""
connects: ""
era: ""
aliases: ["${this._yamlSafe(vars.seriesOrder)}"]
${extraFmLines}---

${body}`;

      const createdFile = await this.app.vault.create(path, content);
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(createdFile);
      new Notice(`Created ${vars.seriesOrder} in ${targetCollection.name} — fill in the frontmatter!`);
    } catch (e) {
      new Notice(`Failed to create: ${(e as Error).message}`);
    }
  }

  // ─── Bulk Operations ───

  bulkValidate() {
    try {
      this.cache.scanAll(this.app, this.settings);
      const items = this.cache.getSortedItems();
      const errors = items.filter((i) => i.validation.status === "error").length;
      const warnings = items.filter((i) => i.validation.status === "warning").length;
      const ready = items.filter((i) => i.validation.status === "ready").length;
      new Notice(`${items.length} posts: ${ready} ready, ${errors} errors, ${warnings} warnings`);
      this._updateStatusBar();
    } catch (e) {
      new Notice(`Bulk validate failed: ${(e as Error).message}`);
    }
  }

  async bulkPreFlight() {
    try {
      this.cache.scanAll(this.app, this.settings);
      // v1.9.0: Get drafts from first canCreateNew collection or all items
      const targetCollection = this.settings.collections.find((c) => c.canCreateNew) || this.settings.collections[0];
      const drafts = this.cache.getSortedItems(targetCollection?.id, this.settings.tracks).filter((i) => i.draft);
      if (drafts.length === 0) {
        new Notice("No drafts to pre-flight.");
        return;
      }

      const confirmed = await new Promise<boolean>((resolve) => {
        const modal = new Modal(this.app);
        modal.titleEl.setText(`Pre-flight ${drafts.length} draft(s)?`);
        const body = modal.contentEl.createEl("div");
        body.createEl("p", {
          text: `This will set ${drafts.length} draft(s) to draft:${this.settings.preflightDraft}, status:"${this.settings.preflightStatus}". Continue?`,
        });
        const btnRow = body.createEl("div", { cls: "cms-modal-btn-row" });
        btnRow
          .createEl("button", { text: "Cancel", cls: "cms-btn cms-btn-secondary" })
          .addEventListener("click", () => {
            modal.close();
            resolve(false);
          });
        btnRow
          .createEl("button", { text: "Pre-flight all", cls: "cms-btn cms-btn-primary" })
          .addEventListener("click", () => {
            modal.close();
            resolve(true);
          });
        modal.open();
      });

      if (!confirmed) return;

      let published = 0;
      for (const item of drafts) {
        try {
          await this.preflightFile(item.file, true);
          published++;
        } catch (e) {
          console.error(`Failed to pre-flight ${item.path}:`, e);
        }
      }
      new Notice(
        `Pre-flighted ${published}/${drafts.length} draft(s). Sync with Git to deploy.`
      );
      this._updateStatusBar();
    } catch (e) {
      new Notice(`Bulk pre-flight failed: ${(e as Error).message}`);
    }
  }

  // ─── v1.7.0: Command Palette Actions ───

  async toggleDraftStatus() {
    try {
      const file = this.app.workspace.getActiveFile();
      if (!file || !this.cache.isInCollection(file.path, this.settings)) {
        const firstCollection = this.settings.collections[0];
        const hint = firstCollection ? `Open a file in ${firstCollection.name} first.` : "Open a content file first.";
        new Notice(hint);
        return;
      }
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm.draft = !fm.draft;
      });
      const cached = this.cache.items.get(file.path);
      const isNowDraft = !cached?.draft;
      new Notice(`${file.basename}: draft set to ${!isNowDraft}`);
      this._updateStatusBar();
    } catch (e) {
      new Notice(`Failed to toggle draft: ${(e as Error).message}`);
    }
  }

  showSEOScore() {
    try {
      const file = this.app.workspace.getActiveFile();
      if (!file || !this.cache.isInCollection(file.path, this.settings)) {
        const firstCollection = this.settings.collections[0];
        const hint = firstCollection ? `Open a file in ${firstCollection.name} first.` : "Open a content file first.";
        new Notice(hint);
        return;
      }
      const cached = this.cache.items.get(file.path);
      if (!cached || cached.seoScore === null) {
        new Notice("SEO score not available. Enable it in Settings.");
        return;
      }
      // v1.9.0: Use shared getSEOLabel instead of duplicated thresholds
      const label = getSEOLabel(cached.seoScore);
      new Notice(`${file.basename}: SEO Score ${cached.seoScore}/100 (${label})`);
    } catch (e) {
      new Notice(`Failed to get SEO score: ${(e as Error).message}`);
    }
  }

  async openPluginSettings() {
    try {
      const settingTab = (this.app as any).setting?.pluginTabs?.find(
        (t: any) => t.plugin?.manifest?.id === "ishistory-cms"
      );
      if (settingTab) {
        (this.app as any).setting?.open();
        (this.app as any).setting?.openTabById("ishistory-cms");
      } else {
        new Notice("Open Settings > Community Plugins > isHistory CMS");
      }
    } catch {
      new Notice("Open Settings > Community Plugins > isHistory CMS");
    }
  }

  refreshCache() {
    try {
      this.rescanCache();
      new Notice("Content cache refreshed.");
    } catch (e) {
      new Notice(`Refresh failed: ${(e as Error).message}`);
    }
  }

  // ─── v1.8.0: Content Health Report ───

  async generateHealthReport() {
    try {
      this.cache.scanAll(this.app, this.settings);
      await this.cache.refreshSEOWithBodies(this.app, this.settings);

      const items = [...this.cache.items.values()];
      const stats = this.cache.getStats(this.settings);
      // v1.9.0: Pass manifest version instead of hardcoded string
      const report = generateHealthReport(items, stats, this.settings, this.manifest.version);
      const markdown = renderReportMarkdown(report);

      const reportPath = this.settings.reportPath || "isHistory-Report.md";
      const existing = this.app.vault.getAbstractFileByPath(reportPath);
      if (existing) {
        await this.app.vault.modify(existing as TFile, markdown);
      } else {
        await this.app.vault.create(reportPath, markdown);
      }

      const file = this.app.vault.getAbstractFileByPath(reportPath);
      if (file instanceof TFile) {
        await this.app.workspace.getLeaf(false).openFile(file);
      }

      new Notice(
        `Health report generated! Score: ${report.healthScore}/100 — ${report.attentionItems.length} items need attention.`,
      );
    } catch (e) {
      new Notice(`Report generation failed: ${(e as Error).message}`);
    }
  }

  // ─── v1.8.0: Bulk Operations ───

  async bulkToggleDrafts() {
    try {
      this.cache.scanAll(this.app, this.settings);
      const drafts = [...this.cache.items.values()].filter((i) => i.draft);

      if (drafts.length === 0) {
        new Notice("No drafts found.");
        return;
      }

      const confirmed = await new Promise<boolean>((resolve) => {
        const modal = new Modal(this.app);
        modal.titleEl.setText(`Toggle draft status for ${drafts.length} post(s)?`);
        const body = modal.contentEl.createEl("div");
        body.createEl("p", {
          text: `This will toggle the draft flag on ${drafts.length} post(s). Drafts will be marked as published, and published posts will become drafts.`,
        });
        const btnRow = body.createEl("div", { cls: "cms-modal-btn-row" });
        btnRow.createEl("button", { text: "Cancel", cls: "cms-btn cms-btn-secondary" })
          .addEventListener("click", () => { modal.close(); resolve(false); });
        btnRow.createEl("button", { text: "Toggle All", cls: "cms-btn cms-btn-primary" })
          .addEventListener("click", () => { modal.close(); resolve(true); });
        modal.open();
      });

      if (!confirmed) return;

      let toggled = 0;
      for (const item of drafts) {
        try {
          await this.app.fileManager.processFrontMatter(item.file, (fm) => {
            fm.draft = !fm.draft;
          });
          toggled++;
        } catch (e) {
          console.error(`Failed to toggle ${item.path}:`, e);
        }
      }
      new Notice(`Toggled draft status for ${toggled}/${drafts.length} post(s).`);
      this._updateStatusBar();
    } catch (e) {
      new Notice(`Bulk toggle failed: ${(e as Error).message}`);
    }
  }

  async bulkChangeStatus() {
    try {
      this.cache.scanAll(this.app, this.settings);
      // v1.9.0: Use first canCreateNew collection or all items (not just archive)
      const targetCollection = this.settings.collections.find((c) => c.canCreateNew) || this.settings.collections[0];
      const targetItems = targetCollection
        ? [...this.cache.items.values()].filter((i) => i.collection === targetCollection.id)
        : [...this.cache.items.values()];

      if (targetItems.length === 0) {
        new Notice("No items found to update.");
        return;
      }

      // Show status picker modal
      const newStatus = await new Promise<string | null>((resolve) => {
        const modal = new Modal(this.app);
        const collectionName = targetCollection?.name || "all";
        modal.titleEl.setText(`Set status for all ${collectionName} posts`);
        const body = modal.contentEl.createEl("div");
        body.createEl("p", {
          text: `Choose the new status for ${targetItems.length} ${collectionName} post(s).`,
        });
        const btnRow = body.createEl("div", { cls: "cms-new-post-tracks" });
        for (const status of this.settings.statuses) {
          btnRow.createEl("button", { text: status, cls: "cms-btn cms-btn-track-btn" })
            .addEventListener("click", () => { modal.close(); resolve(status); });
        }
        btnRow.createEl("button", { text: "Cancel", cls: "cms-btn cms-btn-secondary" })
          .addEventListener("click", () => { modal.close(); resolve(null); });
        modal.open();
      });

      if (!newStatus) return;

      let changed = 0;
      for (const item of targetItems) {
        try {
          await this.app.fileManager.processFrontMatter(item.file, (fm) => {
            fm.status = newStatus;
          });
          changed++;
        } catch (e) {
          console.error(`Failed to update ${item.path}:`, e);
        }
      }
      new Notice(`Set status to "${newStatus}" for ${changed}/${targetItems.length} post(s).`);
      this._updateStatusBar();
    } catch (e) {
      new Notice(`Bulk status change failed: ${(e as Error).message}`);
    }
  }

  // ─── v1.8.0: Refresh SEO Scores with Body Content ───

  async refreshSEOScores() {
    try {
      this.cache.scanAll(this.app, this.settings);
      await this.cache.refreshSEOWithBodies(this.app, this.settings);
      this._updateStatusBar();

      // Update dashboard views
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
      for (const leaf of leaves) {
        if (leaf.view instanceof IsHistoryDashboardView) {
          leaf.view.requestRender();
        }
      }

      const stats = this.cache.getStats(this.settings);
      new Notice(`SEO scores refreshed! Average: ${stats.avgSeoScore}/100`);
    } catch (e) {
      new Notice(`SEO refresh failed: ${(e as Error).message}`);
    }
  }
}

/**
 * isHistory CMS Plugin — Settings Tab
 *
 * Configuration UI for all plugin settings.
 * v1.5.0: Full settings UI designed for non-technical users.
 *   - NO sliders: number inputs with unit labels and hints
 *   - Toggles for booleans, dropdowns for choices from lists
 *   - Visual track editor with color picker
 *   - Tag/chip editor for statuses and required fields
 *   - Template variable insert buttons above textareas
 *   - Reset-to-default buttons on every section
 */

import { PluginSettingTab, type App, Setting, Modal, Notice } from "obsidian";
import {
        type TrackInfo,
        SETTINGS_VERSION,
        DEFAULT_SETTINGS,
        DEFAULT_TRACKS,
        DEFAULT_STATUSES,
        normalizePathSetting,
        TEMPLATE_VARIABLES,
} from "./types";
import IsHistoryPlugin from "./main";

export class IsHistorySettingTab extends PluginSettingTab {
        plugin: IsHistoryPlugin;
        private _rescanTimer: ReturnType<typeof setTimeout> | null = null;

        constructor(app: App, plugin: IsHistoryPlugin) {
                super(app, plugin);
                this.plugin = plugin;
        }

        private _debouncedRescan(delay = 600): void {
                if (this._rescanTimer) clearTimeout(this._rescanTimer);
                this._rescanTimer = setTimeout(() => {
                        this.plugin.rescanCache();
                }, delay);
        }

        /** Helper: create a number input with unit label and optional reset */
        private _addNumberInput(
                containerEl: HTMLElement,
                opts: {
                        name: string;
                        desc: string;
                        value: number;
                        unit: string;
                        placeholder?: string;
                        min?: number;
                        max?: number;
                        step?: number;
                        defaultValue: number;
                        onChange: (v: number) => void;
                },
        ): void {
                const s = new Setting(containerEl)
                        .setName(opts.name)
                        .setDesc(opts.desc);
                s.addText((text) => {
                        text.inputEl.type = "number";
                        text.inputEl.classList.add("cms-number-input");
                        if (opts.min !== undefined) text.inputEl.min = String(opts.min);
                        if (opts.max !== undefined) text.inputEl.max = String(opts.max);
                        if (opts.step !== undefined) text.inputEl.step = String(opts.step);
                        if (opts.placeholder) text.inputEl.placeholder = opts.placeholder;
                        text.setValue(String(opts.value));
                        text.onChange(async (v) => {
                                const num = parseInt(v, 10);
                                if (!isNaN(num)) {
                                        opts.onChange(num);
                                        await this.plugin.saveSettings();
                                        this._debouncedRescan();
                                }
                        });
                });
                // Unit label
                const unitSpan = s.controlEl.createSpan({ text: opts.unit, cls: "cms-input-unit" });
                s.controlEl.appendChild(unitSpan);
                // Reset button
                s.addExtraButton((btn) => {
                        btn.setIcon("reset")
                                .setTooltip(`Reset to default (${opts.defaultValue} ${opts.unit})`)
                                .onClick(async () => {
                                        opts.onChange(opts.defaultValue);
                                        await this.plugin.saveSettings();
                                        this._debouncedRescan();
                                        this.display();
                                });
                });
        }

        display(): void {
                const { containerEl } = this;
                containerEl.empty();

                // ═══════════════════════════════════════════════════════════
                //  CONTENT PATHS
                // ═══════════════════════════════════════════════════════════
                containerEl.createEl("h2", { text: "Content Paths" });
                containerEl.createEl("p", {
                        text: "Where your blog posts and research notes live inside the vault. These should match your Astro project's content folder structure.",
                        cls: "cms-settings-hint",
                });

                new Setting(containerEl)
                        .setName("Archive path")
                        .setDesc("Folder with your blog posts (e.g. src/content/blog)")
                        .addText((text) =>
                                text
                                        .setPlaceholder("src/content/blog")
                                        .setValue(this.plugin.settings.archivePath)
                                        .onChange(async (v) => {
                                                this.plugin.settings.archivePath = normalizePathSetting(v);
                                                await this.plugin.saveSettings();
                                                this._debouncedRescan();
                                        })
                        )
                        .addExtraButton((btn) =>
                                btn.setIcon("reset").setTooltip("Reset to default").onClick(async () => {
                                        this.plugin.settings.archivePath = DEFAULT_SETTINGS.archivePath;
                                        await this.plugin.saveSettings();
                                        this._debouncedRescan();
                                        this.display();
                                })
                        );

                new Setting(containerEl)
                        .setName("Vault path")
                        .setDesc("Folder with your research notes (e.g. src/content/vault)")
                        .addText((text) =>
                                text
                                        .setPlaceholder("src/content/vault")
                                        .setValue(this.plugin.settings.vaultPath)
                                        .onChange(async (v) => {
                                                this.plugin.settings.vaultPath = normalizePathSetting(v);
                                                await this.plugin.saveSettings();
                                                this._debouncedRescan();
                                        })
                        )
                        .addExtraButton((btn) =>
                                btn.setIcon("reset").setTooltip("Reset to default").onClick(async () => {
                                        this.plugin.settings.vaultPath = DEFAULT_SETTINGS.vaultPath;
                                        await this.plugin.saveSettings();
                                        this._debouncedRescan();
                                        this.display();
                                })
                        );

                // ═══════════════════════════════════════════════════════════
                //  TRACKS
                // ═══════════════════════════════════════════════════════════
                containerEl.createEl("h2", { text: "Tracks" });
                containerEl.createEl("p", {
                        text: "Tracks organize your content by type. Each track has a short code (used in seriesOrder like A1, P3), a display name, an emoji, and a color. You can add, edit, or remove tracks to match your content categories.",
                        cls: "cms-settings-hint",
                });

                for (const [code, info] of Object.entries(this.plugin.settings.tracks)) {
                        new Setting(containerEl)
                                .setName(`${info.emoji} ${info.name}`)
                                .setDesc(`Code: ${code} \u00B7 Color: ${info.color}`)
                                .addButton((btn) =>
                                        btn.setButtonText("Edit").onClick(() => {
                                                new TrackEditorModal(this.app, this.plugin, code, info, () => this.display()).open();
                                        })
                                )
                                .addButton((btn) =>
                                        // Feature 2: Track deletion warning with orphan count
                                        btn.setButtonText("Remove").setWarning().onClick(() => {
                                                const orphanCount = [...this.plugin.cache.items.values()].filter((i) => i.track === code).length;
                                                if (orphanCount > 0) {
                                                        new TrackDeleteConfirmModal(this.app, this.plugin, code, info.name, orphanCount, () => {
                                                                this._debouncedRescan();
                                                                this.display();
                                                        }).open();
                                                } else {
                                                        void (async () => {
                                                                delete this.plugin.settings.tracks[code];
                                                                await this.plugin.saveSettings();
                                                                this.plugin._updateDynamicStyles();
                                                                this._debouncedRescan();
                                                                this.display();
                                                                new Notice(`Track "${code}" removed.`);
                                                        })();
                                                }
                                        })
                                );
                }

                new Setting(containerEl)
                        .setName("Add a new track")
                        .setDesc("Create a new content category with its own code, name, emoji, and color")
                        .addButton((btn) =>
                                btn.setButtonText("+ Add Track").setCta().onClick(() => {
                                        new TrackEditorModal(this.app, this.plugin, null, null, () => this.display()).open();
                                })
                        );

                // Reset tracks
                new Setting(containerEl)
                        .setName("Reset tracks to default")
                        .setDesc(`Restore the default tracks: ${Object.entries(DEFAULT_TRACKS).map(([c, i]) => `${i.emoji} ${i.name} (${c})`).join(", ")}`)
                        .addButton((btn) =>
                                btn.setButtonText("Reset").setWarning().onClick(async () => {
                                        this.plugin.settings.tracks = { ...DEFAULT_TRACKS };
                                        await this.plugin.saveSettings();
                                        this.plugin._updateDynamicStyles();
                                        this._debouncedRescan();
                                        this.display();
                                        new Notice("Tracks reset to defaults.");
                                })
                        );

                // ═══════════════════════════════════════════════════════════
                //  STATUSES — tag/chip editor
                // ═══════════════════════════════════════════════════════════
                containerEl.createEl("h2", { text: "Post Statuses" });
                containerEl.createEl("p", {
                        text: "Statuses describe the publication stage of a post (e.g. published, upcoming, planned). These appear as filter options and in the pre-flight settings.",
                        cls: "cms-settings-hint",
                });

                // Current statuses as removable chips
                const statusChipRow = containerEl.createEl("div", { cls: "cms-chip-row" });
                for (const status of this.plugin.settings.statuses) {
                        const chip = statusChipRow.createEl("span", { cls: "cms-chip" });
                        chip.createSpan({ text: status, cls: "cms-chip-text" });
                        const removeBtn = chip.createEl("button", { cls: "cms-chip-remove", attr: { "aria-label": `Remove ${status}` } });
                        removeBtn.setText("\u00D7");
                        removeBtn.addEventListener("click", async () => {
                                this.plugin.settings.statuses = this.plugin.settings.statuses.filter((s) => s !== status);
                                await this.plugin.saveSettings();
                                this._debouncedRescan();
                                this.display();
                        });
                }

                // Add new status
                const addStatusSetting = new Setting(containerEl)
                        .setName("Add a new status");
                addStatusSetting.addText((text) => {
                        text.setPlaceholder("e.g. archived, featured, draft");
                        text.inputEl.classList.add("cms-add-status-input");
                        text.onChange(() => { /* track input for button wiring */ });
                });
                addStatusSetting.addButton((btn) => {
                        btn.setButtonText("Add").setCta();
                        btn.buttonEl.classList.add("cms-add-status-btn");
                        btn.onClick(async () => {
                                const input = containerEl.querySelector(".cms-add-status-input") as HTMLInputElement | null;
                                const value = input?.value?.trim().toLowerCase();
                                if (!value) {
                                        new Notice("Please type a status name first.");
                                        return;
                                }
                                if (this.plugin.settings.statuses.includes(value)) {
                                        new Notice(`Status "${value}" already exists.`);
                                        return;
                                }
                                this.plugin.settings.statuses.push(value);
                                await this.plugin.saveSettings();
                                this._debouncedRescan();
                                this.display();
                                new Notice(`Added status: ${value}`);
                        });
                });

                // Reset statuses
                new Setting(containerEl)
                        .setName("Reset statuses to default")
                        .setDesc(`Restore: ${[...DEFAULT_STATUSES].join(", ")}`)
                        .addButton((btn) =>
                                btn.setButtonText("Reset").setWarning().onClick(async () => {
                                        this.plugin.settings.statuses = [...DEFAULT_STATUSES];
                                        await this.plugin.saveSettings();
                                        this._debouncedRescan();
                                        this.display();
                                        new Notice("Statuses reset to defaults.");
                                })
                        );

                // ═══════════════════════════════════════════════════════════
                //  Feature 4: Cross-field settings validation warnings
                // ═══════════════════════════════════════════════════════════
                const validationWarnings: string[] = [];
                const s = this.plugin.settings;
                if (s.minTitleLength >= s.maxTitleLength) validationWarnings.push("Min title length must be less than max title length.");
                if (s.minDescriptionLength >= s.maxDescriptionLength) validationWarnings.push("Min description length must be less than max description length.");
                if (Object.keys(s.tracks).length === 0) validationWarnings.push("You have no tracks defined. New posts cannot be created.");
                if (s.statuses.length === 0) validationWarnings.push("You have no statuses defined. Pre-flight may not work correctly.");
                if (s.archivePath === s.vaultPath && s.archivePath !== "") validationWarnings.push("Archive path and vault path should be different.");
                if (validationWarnings.length > 0) {
                        const warnBox = containerEl.createEl("div", { cls: "cms-settings-warnings" });
                        warnBox.createEl("strong", { text: "Settings issues:" });
                        for (const w of validationWarnings) {
                                warnBox.createEl("div", { text: w, cls: "cms-settings-warning" });
                        }
                }

                // ═══════════════════════════════════════════════════════════
                //  VALIDATION RULES — number inputs with unit labels
                // ═══════════════════════════════════════════════════════════
                containerEl.createEl("h2", { text: "Validation Rules" });
                containerEl.createEl("p", {
                        text: "These rules check your frontmatter for common mistakes. The plugin will flag titles and descriptions that are too short (errors) or too long (warnings). Adjust the thresholds to match your SEO requirements.",
                        cls: "cms-settings-hint",
                });

                this._addNumberInput(containerEl, {
                        name: "Minimum title length",
                        desc: "Titles shorter than this will be flagged as errors. Search engines prefer titles with at least a few words.",
                        value: this.plugin.settings.minTitleLength,
                        unit: "chars",
                        min: 1,
                        max: 50,
                        step: 1,
                        defaultValue: DEFAULT_SETTINGS.minTitleLength,
                        onChange: (v) => { this.plugin.settings.minTitleLength = v; },
                });

                this._addNumberInput(containerEl, {
                        name: "Maximum title length",
                        desc: "Titles longer than this will be flagged as warnings. Google truncates titles around 60 characters in results.",
                        value: this.plugin.settings.maxTitleLength,
                        unit: "chars",
                        min: 30,
                        max: 300,
                        step: 5,
                        defaultValue: DEFAULT_SETTINGS.maxTitleLength,
                        onChange: (v) => { this.plugin.settings.maxTitleLength = v; },
                });

                this._addNumberInput(containerEl, {
                        name: "Minimum description length",
                        desc: "Descriptions shorter than this will be flagged as errors. Good meta descriptions help with search engine optimization.",
                        value: this.plugin.settings.minDescriptionLength,
                        unit: "chars",
                        min: 1,
                        max: 100,
                        step: 1,
                        defaultValue: DEFAULT_SETTINGS.minDescriptionLength,
                        onChange: (v) => { this.plugin.settings.minDescriptionLength = v; },
                });

                this._addNumberInput(containerEl, {
                        name: "Maximum description length",
                        desc: "Descriptions longer than this will be flagged as warnings. Google typically shows about 155-160 characters of meta descriptions.",
                        value: this.plugin.settings.maxDescriptionLength,
                        unit: "chars",
                        min: 50,
                        max: 500,
                        step: 5,
                        defaultValue: DEFAULT_SETTINGS.maxDescriptionLength,
                        onChange: (v) => { this.plugin.settings.maxDescriptionLength = v; },
                });

                // Image prefix — text input
                new Setting(containerEl)
                        .setName("Image path must start with")
                        .setDesc("Hero image paths should begin with this prefix. Typically \"/\" for absolute paths or \"./\" for relative paths.")
                        .addText((text) =>
                                text.setValue(this.plugin.settings.imagePrefix).onChange(async (v) => {
                                        this.plugin.settings.imagePrefix = v;
                                        await this.plugin.saveSettings();
                                        this._debouncedRescan();
                                })
                        )
                        .addExtraButton((btn) =>
                                btn.setIcon("reset").setTooltip("Reset to default (\"/\")").onClick(async () => {
                                        this.plugin.settings.imagePrefix = DEFAULT_SETTINGS.imagePrefix;
                                        await this.plugin.saveSettings();
                                        this._debouncedRescan();
                                        this.display();
                                })
                        );

                // Required archive fields — tag/chip editor
                containerEl.createEl("h3", { text: "Required archive fields", cls: "cms-section-subheading" });
                containerEl.createEl("p", {
                        text: "These frontmatter fields must be present in every archive post. If a field is missing or empty, the validator will flag it as an error.",
                        cls: "cms-settings-hint",
                });

                const reqChipRow = containerEl.createEl("div", { cls: "cms-chip-row" });
                for (const field of this.plugin.settings.requiredArchiveFields) {
                        const chip = reqChipRow.createEl("span", { cls: "cms-chip" });
                        chip.createSpan({ text: field, cls: "cms-chip-text" });
                        const removeBtn = chip.createEl("button", { cls: "cms-chip-remove", attr: { "aria-label": `Remove ${field}` } });
                        removeBtn.setText("\u00D7");
                        removeBtn.addEventListener("click", async () => {
                                this.plugin.settings.requiredArchiveFields = this.plugin.settings.requiredArchiveFields.filter((f) => f !== field);
                                await this.plugin.saveSettings();
                                this._debouncedRescan();
                                this.display();
                        });
                }

                const addFieldSetting = new Setting(containerEl)
                        .setName("Add a required field");
                addFieldSetting.addText((text) => {
                        text.setPlaceholder("e.g. series, track, era");
                        text.inputEl.classList.add("cms-add-field-input");
                        text.onChange(() => { /* track input */ });
                });
                addFieldSetting.addButton((btn) => {
                        btn.setButtonText("Add").setCta();
                        btn.onClick(async () => {
                                const input = containerEl.querySelector(".cms-add-field-input") as HTMLInputElement | null;
                                const value = input?.value?.trim().toLowerCase();
                                if (!value) {
                                        new Notice("Please type a field name first.");
                                        return;
                                }
                                if (this.plugin.settings.requiredArchiveFields.includes(value)) {
                                        new Notice(`Field "${value}" is already required.`);
                                        return;
                                }
                                this.plugin.settings.requiredArchiveFields.push(value);
                                await this.plugin.saveSettings();
                                this._debouncedRescan();
                                this.display();
                                new Notice(`Added required field: ${value}`);
                        });
                });

                new Setting(containerEl)
                        .setName("Reset required fields to default")
                        .setDesc(`Restore: ${DEFAULT_SETTINGS.requiredArchiveFields.join(", ")}`)
                        .addButton((btn) =>
                                btn.setButtonText("Reset").setWarning().onClick(async () => {
                                        this.plugin.settings.requiredArchiveFields = [...DEFAULT_SETTINGS.requiredArchiveFields];
                                        await this.plugin.saveSettings();
                                        this._debouncedRescan();
                                        this.display();
                                })
                        );

                // ═══════════════════════════════════════════════════════════
                //  CARD DISPLAY — number inputs with context
                // ═══════════════════════════════════════════════════════════
                containerEl.createEl("h2", { text: "Card Display" });
                containerEl.createEl("p", {
                        text: "Control how much information is shown on each card in the dashboard. Higher values show more detail but make the page longer.",
                        cls: "cms-settings-hint",
                });

                this._addNumberInput(containerEl, {
                        name: "Cards per page",
                        desc: "How many cards to show before the \"Load More\" button appears. Lower values load faster.",
                        value: this.plugin.settings.cardsPerPage,
                        unit: "cards",
                        min: 5,
                        max: 200,
                        step: 5,
                        defaultValue: DEFAULT_SETTINGS.cardsPerPage,
                        onChange: (v) => { this.plugin.settings.cardsPerPage = v; },
                });

                this._addNumberInput(containerEl, {
                        name: "Description preview length",
                        desc: "How many characters of the description to show on each card before truncating with \"...\".",
                        value: this.plugin.settings.descriptionTruncation,
                        unit: "chars",
                        min: 20,
                        max: 500,
                        step: 10,
                        defaultValue: DEFAULT_SETTINGS.descriptionTruncation,
                        onChange: (v) => { this.plugin.settings.descriptionTruncation = v; },
                });

                this._addNumberInput(containerEl, {
                        name: "Figures preview length",
                        desc: "How many characters of the figures field to show on each card.",
                        value: this.plugin.settings.figuresTruncation,
                        unit: "chars",
                        min: 10,
                        max: 200,
                        step: 5,
                        defaultValue: DEFAULT_SETTINGS.figuresTruncation,
                        onChange: (v) => { this.plugin.settings.figuresTruncation = v; },
                });

                this._addNumberInput(containerEl, {
                        name: "Tags shown per card",
                        desc: "Maximum number of tags displayed on each card. Extra tags show as \"+3 more\".",
                        value: this.plugin.settings.maxTagsPerCard,
                        unit: "tags",
                        min: 1,
                        max: 20,
                        step: 1,
                        defaultValue: DEFAULT_SETTINGS.maxTagsPerCard,
                        onChange: (v) => { this.plugin.settings.maxTagsPerCard = v; },
                });

                this._addNumberInput(containerEl, {
                        name: "Errors shown per card",
                        desc: "Maximum number of validation errors displayed on each card. Extra errors show as \"+2 more\".",
                        value: this.plugin.settings.maxErrorsPerCard,
                        unit: "errors",
                        min: 1,
                        max: 20,
                        step: 1,
                        defaultValue: DEFAULT_SETTINGS.maxErrorsPerCard,
                        onChange: (v) => { this.plugin.settings.maxErrorsPerCard = v; },
                });

                this._addNumberInput(containerEl, {
                        name: "Tags in meta section",
                        desc: "Maximum number of unique tags shown in the \"Tags\" section at the bottom of the dashboard.",
                        value: this.plugin.settings.maxMetaTags,
                        unit: "tags",
                        min: 5,
                        max: 200,
                        step: 5,
                        defaultValue: DEFAULT_SETTINGS.maxMetaTags,
                        onChange: (v) => { this.plugin.settings.maxMetaTags = v; },
                });

                // ═══════════════════════════════════════════════════════════
                //  NEW POST TEMPLATE — with variable insert buttons
                // ═══════════════════════════════════════════════════════════
                containerEl.createEl("h2", { text: "New Post Template" });
                containerEl.createEl("p", {
                        text: "Customize how new posts are created. Click the variable buttons below each field to insert placeholders that get filled in automatically when you create a new post.",
                        cls: "cms-settings-hint",
                });

                // Variable reference card
                const varCard = containerEl.createEl("div", { cls: "cms-template-vars-card" });
                varCard.createEl("strong", { text: "Available Variables" });
                const varGrid = varCard.createEl("div", { cls: "cms-template-vars-grid" });
                for (const v of TEMPLATE_VARIABLES) {
                        const varItem = varGrid.createEl("div", { cls: "cms-template-var-item" });
                        varItem.createEl("code", { text: `{{${v.name}}}` });
                        varItem.createEl("span", { text: v.description, cls: "cms-template-var-desc" });
                }

                // Default series
                new Setting(containerEl)
                        .setName("Default series")
                        .setDesc("Series name applied to all new posts (e.g. minds-and-machines)")
                        .addText((text) =>
                                text.setPlaceholder("minds-and-machines")
                                        .setValue(this.plugin.settings.defaultSeries || "")
                                        .onChange(async (v) => {
                                                this.plugin.settings.defaultSeries = v.trim();
                                                await this.plugin.saveSettings();
                                        })
                        )
                        .addExtraButton((btn) =>
                                btn.setIcon("reset").setTooltip("Reset to default").onClick(async () => {
                                        this.plugin.settings.defaultSeries = DEFAULT_SETTINGS.defaultSeries;
                                        await this.plugin.saveSettings();
                                        this.display();
                                })
                        );

                // Slug format with variable buttons
                const slugSetting = new Setting(containerEl)
                        .setName("Slug format")
                        .setDesc("File name pattern for new posts. This becomes the .md file name.");
                slugSetting.addText((text) => {
                        text.inputEl.classList.add("cms-template-input");
                        text.setPlaceholder("{{seriesOrder}}-untitled-post")
                                .setValue(this.plugin.settings.newPostSlug)
                                .onChange(async (v) => {
                                        this.plugin.settings.newPostSlug = v;
                                        await this.plugin.saveSettings();
                                });
                });
                slugSetting.addExtraButton((btn) =>
                        btn.setIcon("reset").setTooltip("Reset to default").onClick(async () => {
                                this.plugin.settings.newPostSlug = DEFAULT_SETTINGS.newPostSlug;
                                await this.plugin.saveSettings();
                                this.display();
                        })
                );
                this._addVariableButtons(containerEl, "cms-template-input", ["seriesOrder", "seriesOrderLower", "track"]);

                // Title format with variable buttons
                const titleSetting = new Setting(containerEl)
                        .setName("Title format")
                        .setDesc("Default title for new posts");
                titleSetting.addText((text) => {
                        text.inputEl.classList.add("cms-template-input-title");
                        text.setPlaceholder("Untitled {{trackName}} Post")
                                .setValue(this.plugin.settings.newPostTitle)
                                .onChange(async (v) => {
                                        this.plugin.settings.newPostTitle = v;
                                        await this.plugin.saveSettings();
                                });
                });
                titleSetting.addExtraButton((btn) =>
                        btn.setIcon("reset").setTooltip("Reset to default").onClick(async () => {
                                this.plugin.settings.newPostTitle = DEFAULT_SETTINGS.newPostTitle;
                                await this.plugin.saveSettings();
                                this.display();
                        })
                );
                this._addVariableButtons(containerEl, "cms-template-input-title", ["trackName", "seriesOrder", "series"]);

                // Image path format with variable buttons
                const imageSetting = new Setting(containerEl)
                        .setName("Image path format")
                        .setDesc("Hero image path pattern for new posts");
                imageSetting.addText((text) => {
                        text.inputEl.classList.add("cms-template-input-image");
                        text.setPlaceholder("/images/{{seriesOrderLower}}-hero.jpg")
                                .setValue(this.plugin.settings.newPostImage)
                                .onChange(async (v) => {
                                        this.plugin.settings.newPostImage = v;
                                        await this.plugin.saveSettings();
                                });
                });
                imageSetting.addExtraButton((btn) =>
                        btn.setIcon("reset").setTooltip("Reset to default").onClick(async () => {
                                this.plugin.settings.newPostImage = DEFAULT_SETTINGS.newPostImage;
                                await this.plugin.saveSettings();
                                this.display();
                        })
                );
                this._addVariableButtons(containerEl, "cms-template-input-image", ["seriesOrderLower", "seriesOrder", "track"]);

                // Default status — dropdown from defined statuses
                new Setting(containerEl)
                        .setName("Default status for new posts")
                        .setDesc("What publication status to set on newly created posts")
                        .addDropdown((dd) => {
                                for (const s of this.plugin.settings.statuses) {
                                        dd.addOption(s, s);
                                }
                                dd.setValue(this.plugin.settings.newPostStatus || this.plugin.settings.statuses[0] || "planned");
                                dd.onChange(async (v) => {
                                        this.plugin.settings.newPostStatus = v;
                                        await this.plugin.saveSettings();
                                });
                        });

                // Body template with variable buttons
                const bodySetting = new Setting(containerEl)
                        .setName("Body template")
                        .setDesc("Default content for the body of new posts. This appears below the frontmatter.");
                bodySetting.addTextArea((text) => {
                        text.inputEl.classList.add("cms-template-textarea");
                        text.setPlaceholder("Start writing here...")
                                .setValue(this.plugin.settings.newPostBody)
                                .onChange(async (v) => {
                                        this.plugin.settings.newPostBody = v;
                                        await this.plugin.saveSettings();
                                });
                        text.inputEl.rows = 4;
                });
                bodySetting.addExtraButton((btn) =>
                        btn.setIcon("reset").setTooltip("Reset to default").onClick(async () => {
                                this.plugin.settings.newPostBody = DEFAULT_SETTINGS.newPostBody;
                                await this.plugin.saveSettings();
                                this.display();
                        })
                );
                this._addVariableButtons(containerEl, "cms-template-textarea", ["seriesOrder", "trackName", "date", "series"]);

                // ═══════════════════════════════════════════════════════════
                //  PRE-FLIGHT SETTINGS — toggles and dropdowns
                // ═══════════════════════════════════════════════════════════
                containerEl.createEl("h2", { text: "Pre-flight Settings" });
                containerEl.createEl("p", {
                        text: "Pre-flight prepares a draft for publishing. When you click \"Pre-flight\" on a post, these settings determine what changes are made to the frontmatter.",
                        cls: "cms-settings-hint",
                });

                new Setting(containerEl)
                        .setName("Set draft flag to")
                        .setDesc("What the draft field should be set to when pre-flighting. Choose \"false (publish)\" to mark the post as ready for publication.")
                        .addDropdown((dd) => {
                                dd.addOption("false", "false \u2014 publish the post");
                                dd.addOption("true", "true \u2014 keep as draft");
                                dd.setValue(String(this.plugin.settings.preflightDraft));
                                dd.onChange(async (v) => {
                                        this.plugin.settings.preflightDraft = v === "true";
                                        await this.plugin.saveSettings();
                                });
                        });

                new Setting(containerEl)
                        .setName("Set status to")
                        .setDesc("What the status field should be set to when pre-flighting")
                        .addDropdown((dd) => {
                                for (const s of this.plugin.settings.statuses) {
                                        dd.addOption(s, s);
                                }
                                dd.setValue(this.plugin.settings.preflightStatus || "published");
                                dd.onChange(async (v) => {
                                        this.plugin.settings.preflightStatus = v;
                                        await this.plugin.saveSettings();
                                });
                        });

                new Setting(containerEl)
                        .setName("Auto-fill today's date")
                        .setDesc("If the post has no date set, automatically fill it with today's date when pre-flighting")
                        .addToggle((toggle) =>
                                toggle.setValue(this.plugin.settings.preflightAutoDate).onChange(async (v) => {
                                        this.plugin.settings.preflightAutoDate = v;
                                        await this.plugin.saveSettings();
                                })
                        );

                // Reset pre-flight
                new Setting(containerEl)
                        .setName("Reset pre-flight to default")
                        .setDesc("Restore: draft=false, status=published, auto-fill date=true")
                        .addButton((btn) =>
                                btn.setButtonText("Reset").setWarning().onClick(async () => {
                                        this.plugin.settings.preflightDraft = DEFAULT_SETTINGS.preflightDraft;
                                        this.plugin.settings.preflightStatus = DEFAULT_SETTINGS.preflightStatus;
                                        this.plugin.settings.preflightAutoDate = DEFAULT_SETTINGS.preflightAutoDate;
                                        await this.plugin.saveSettings();
                                        this.display();
                                })
                        );

                // ═══════════════════════════════════════════════════════════
                //  v1.7.0: SEO SCORE CARD
                // ═══════════════════════════════════════════════════════════
                containerEl.createEl("h2", { text: "SEO Score Card" });
                containerEl.createEl("p", {
                        text: "The SEO score (0-100) rates your content's search engine optimization potential based on title length, description quality, tags, images, internal links, and more. Scores appear on dashboard cards and in the sidebar.",
                        cls: "cms-settings-hint",
                });

                new Setting(containerEl)
                        .setName("Show SEO scores")
                        .setDesc("Display SEO scores on dashboard cards, in the sidebar, and in stats")
                        .addToggle((toggle) =>
                                toggle.setValue(this.plugin.settings.showSeoScore).onChange(async (v) => {
                                        this.plugin.settings.showSeoScore = v;
                                        await this.plugin.saveSettings();
                                        this._debouncedRescan();
                                        this.display();
                                })
                        );

                if (this.plugin.settings.showSeoScore) {
                        this._addNumberInput(containerEl, {
                                name: "Optimal title min length",
                                desc: "Titles at least this long are considered optimal for Google SERP display.",
                                value: this.plugin.settings.seoTitleOptimalMin,
                                unit: "chars",
                                min: 20,
                                max: 80,
                                step: 5,
                                defaultValue: DEFAULT_SETTINGS.seoTitleOptimalMin,
                                onChange: (v) => { this.plugin.settings.seoTitleOptimalMin = v; },
                        });

                        this._addNumberInput(containerEl, {
                                name: "Optimal title max length",
                                desc: "Titles up to this length are considered optimal. Google truncates titles around 60 characters.",
                                value: this.plugin.settings.seoTitleOptimalMax,
                                unit: "chars",
                                min: 40,
                                max: 100,
                                step: 5,
                                defaultValue: DEFAULT_SETTINGS.seoTitleOptimalMax,
                                onChange: (v) => { this.plugin.settings.seoTitleOptimalMax = v; },
                        });

                        this._addNumberInput(containerEl, {
                                name: "Optimal description min length",
                                desc: "Descriptions at least this long are considered optimal for meta description display.",
                                value: this.plugin.settings.seoDescOptimalMin,
                                unit: "chars",
                                min: 50,
                                max: 200,
                                step: 5,
                                defaultValue: DEFAULT_SETTINGS.seoDescOptimalMin,
                                onChange: (v) => { this.plugin.settings.seoDescOptimalMin = v; },
                        });

                        this._addNumberInput(containerEl, {
                                name: "Optimal description max length",
                                desc: "Descriptions up to this length are considered optimal. Google shows about 155-160 characters.",
                                value: this.plugin.settings.seoDescOptimalMax,
                                unit: "chars",
                                min: 100,
                                max: 300,
                                step: 5,
                                defaultValue: DEFAULT_SETTINGS.seoDescOptimalMax,
                                onChange: (v) => { this.plugin.settings.seoDescOptimalMax = v; },
                        });

                        this._addNumberInput(containerEl, {
                                name: "Minimum word count",
                                desc: "Posts with at least this many words score higher. Thin content ranks poorly in search engines.",
                                value: this.plugin.settings.seoMinWordCount,
                                unit: "words",
                                min: 50,
                                max: 2000,
                                step: 50,
                                defaultValue: DEFAULT_SETTINGS.seoMinWordCount,
                                onChange: (v) => { this.plugin.settings.seoMinWordCount = v; },
                        });

                        this._addNumberInput(containerEl, {
                                name: "Minimum tags for SEO",
                                desc: "Posts with at least this many tags score higher for discoverability.",
                                value: this.plugin.settings.seoMinTags,
                                unit: "tags",
                                min: 1,
                                max: 10,
                                step: 1,
                                defaultValue: DEFAULT_SETTINGS.seoMinTags,
                                onChange: (v) => { this.plugin.settings.seoMinTags = v; },
                        });

                        new Setting(containerEl)
                                .setName("Reset SEO settings to default")
                                .addButton((btn) =>
                                        btn.setButtonText("Reset").setWarning().onClick(async () => {
                                                this.plugin.settings.seoTitleOptimalMin = DEFAULT_SETTINGS.seoTitleOptimalMin;
                                                this.plugin.settings.seoTitleOptimalMax = DEFAULT_SETTINGS.seoTitleOptimalMax;
                                                this.plugin.settings.seoDescOptimalMin = DEFAULT_SETTINGS.seoDescOptimalMin;
                                                this.plugin.settings.seoDescOptimalMax = DEFAULT_SETTINGS.seoDescOptimalMax;
                                                this.plugin.settings.seoMinWordCount = DEFAULT_SETTINGS.seoMinWordCount;
                                                this.plugin.settings.seoMinTags = DEFAULT_SETTINGS.seoMinTags;
                                                await this.plugin.saveSettings();
                                                this._debouncedRescan();
                                                this.display();
                                        })
                                );
                }

                // ═══════════════════════════════════════════════════════════
                //  v1.7.0: STALE CONTENT ALERTS
                // ═══════════════════════════════════════════════════════════
                containerEl.createEl("h2", { text: "Stale Content Alerts" });
                containerEl.createEl("p", {
                        text: "Stale content is draft or published content that hasn't been modified in a while. The plugin highlights stale posts with a \"STALE\" badge so you can review and update them before they hurt your site's SEO.",
                        cls: "cms-settings-hint",
                });

                new Setting(containerEl)
                        .setName("Show stale badges")
                        .setDesc("Display a \"STALE\" badge on dashboard cards and a warning in the sidebar for content that hasn't been modified recently")
                        .addToggle((toggle) =>
                                toggle.setValue(this.plugin.settings.showStaleBadge).onChange(async (v) => {
                                        this.plugin.settings.showStaleBadge = v;
                                        await this.plugin.saveSettings();
                                        this._debouncedRescan();
                                        this.display();
                                })
                        );

                this._addNumberInput(containerEl, {
                        name: "Stale threshold",
                        desc: "Content not modified within this many days will be flagged as stale.",
                        value: this.plugin.settings.staleThresholdDays,
                        unit: "days",
                        min: 7,
                        max: 365,
                        step: 7,
                        defaultValue: DEFAULT_SETTINGS.staleThresholdDays,
                        onChange: (v) => { this.plugin.settings.staleThresholdDays = v; },
                });

                new Setting(containerEl)
                        .setName("Reset stale settings to default")
                        .addButton((btn) =>
                                btn.setButtonText("Reset").setWarning().onClick(async () => {
                                        this.plugin.settings.staleThresholdDays = DEFAULT_SETTINGS.staleThresholdDays;
                                        this.plugin.settings.showStaleBadge = DEFAULT_SETTINGS.showStaleBadge;
                                        await this.plugin.saveSettings();
                                        this._debouncedRescan();
                                        this.display();
                                })
                        );

                // ═══════════════════════════════════════════════════════════
                //  v1.8.0: TRACK TEMPLATES
                // ═══════════════════════════════════════════════════════════
                containerEl.createEl("h2", { text: "Track Templates" });
                containerEl.createEl("p", {
                        text: "Override the default new-post template for specific tracks. When you create a new post for a track that has a template override, these values will be used instead of the global defaults. Leave fields empty to use the global template value.",
                        cls: "cms-settings-hint",
                });

                for (const [code, info] of Object.entries(this.plugin.settings.tracks)) {
                        const tpl = this.plugin.settings.trackTemplates[code] || {};
                        const section = containerEl.createEl("div", { cls: "cms-track-tpl-section" });
                        section.createEl("div", { text: `${info.emoji} ${info.name} (${code})`, cls: "cms-track-tpl-heading" });

                        // Initialize template if not exists
                        if (!this.plugin.settings.trackTemplates[code]) {
                                this.plugin.settings.trackTemplates[code] = {};
                        }

                        // Slug override
                        const slugDiv = section.createEl("div", { cls: "cms-track-tpl-field" });
                        slugDiv.createEl("label", { text: "Slug format (leave empty for global default)" });
                        const slugInput = slugDiv.createEl("input", {
                                cls: "cms-form-input",
                                attr: { placeholder: this.plugin.settings.newPostSlug, type: "text" },
                        });
                        slugInput.value = tpl.slug || "";
                        slugInput.addEventListener("change", async () => {
                                this.plugin.settings.trackTemplates[code].slug = slugInput.value || undefined;
                                await this.plugin.saveSettings();
                        });

                        // Title override
                        const titleDiv = section.createEl("div", { cls: "cms-track-tpl-field" });
                        titleDiv.createEl("label", { text: "Title format" });
                        const titleInput = titleDiv.createEl("input", {
                                cls: "cms-form-input",
                                attr: { placeholder: this.plugin.settings.newPostTitle, type: "text" },
                        });
                        titleInput.value = tpl.title || "";
                        titleInput.addEventListener("change", async () => {
                                this.plugin.settings.trackTemplates[code].title = titleInput.value || undefined;
                                await this.plugin.saveSettings();
                        });

                        // Series override
                        const seriesDiv = section.createEl("div", { cls: "cms-track-tpl-field" });
                        seriesDiv.createEl("label", { text: "Default series" });
                        const seriesInput = seriesDiv.createEl("input", {
                                cls: "cms-form-input",
                                attr: { placeholder: this.plugin.settings.defaultSeries, type: "text" },
                        });
                        seriesInput.value = tpl.series || "";
                        seriesInput.addEventListener("change", async () => {
                                this.plugin.settings.trackTemplates[code].series = seriesInput.value || undefined;
                                await this.plugin.saveSettings();
                        });

                        // Body override
                        const bodyDiv = section.createEl("div", { cls: "cms-track-tpl-field" });
                        bodyDiv.createEl("label", { text: "Body template" });
                        const bodyInput = bodyDiv.createEl("textarea", {
                                cls: "cms-form-input",
                                attr: { placeholder: this.plugin.settings.newPostBody, rows: "3" },
                        });
                        bodyInput.value = tpl.body || "";
                        bodyInput.addEventListener("change", async () => {
                                this.plugin.settings.trackTemplates[code].body = bodyInput.value || undefined;
                                await this.plugin.saveSettings();
                        });
                }

                if (Object.keys(this.plugin.settings.tracks).length === 0) {
                        containerEl.createEl("p", {
                                text: "No tracks defined. Add tracks above to configure per-track templates.",
                                cls: "cms-track-tpl-empty",
                        });
                }

                // Reset track templates
                new Setting(containerEl)
                        .setName("Reset all track templates")
                        .setDesc("Remove all per-track template overrides and use global defaults")
                        .addButton((btn) =>
                                btn.setButtonText("Reset").setWarning().onClick(async () => {
                                        this.plugin.settings.trackTemplates = {};
                                        await this.plugin.saveSettings();
                                        this.display();
                                        new Notice("Track templates reset to defaults.");
                                })
                        );

                // ═══════════════════════════════════════════════════════════
                //  v1.8.0: CONTENT HEALTH REPORT
                // ═══════════════════════════════════════════════════════════
                containerEl.createEl("h2", { text: "Health Report" });
                containerEl.createEl("p", {
                        text: "Generate a markdown report summarizing the health of your content vault. The report includes validation errors, SEO scores, stale content, and actionable recommendations.",
                        cls: "cms-settings-hint",
                });

                new Setting(containerEl)
                        .setName("Report file path")
                        .setDesc("Where to save the generated health report in your vault")
                        .addText((text) =>
                                text
                                        .setPlaceholder("isHistory-Report.md")
                                        .setValue(this.plugin.settings.reportPath || "isHistory-Report.md")
                                        .onChange(async (v) => {
                                                this.plugin.settings.reportPath = v.trim() || "isHistory-Report.md";
                                                await this.plugin.saveSettings();
                                        })
                        )
                        .addExtraButton((btn) =>
                                btn.setIcon("reset").setTooltip("Reset to default").onClick(async () => {
                                        this.plugin.settings.reportPath = DEFAULT_SETTINGS.reportPath;
                                        await this.plugin.saveSettings();
                                        this.display();
                                })
                        );

                new Setting(containerEl)
                        .setName("Generate report now")
                        .setDesc("Create a health report and open it in the editor")
                        .addButton((btn) =>
                                btn.setButtonText("Generate Report").setCta().onClick(() => {
                                        void this.plugin.generateHealthReport();
                                })
                        );

                // ═══════════════════════════════════════════════════════════
                //  APPEARANCE
                // ═══════════════════════════════════════════════════════════
                containerEl.createEl("h2", { text: "Appearance" });

                new Setting(containerEl)
                        .setName("Show ribbon icon")
                        .setDesc("Show the isHistory icon in the left sidebar ribbon for quick access")
                        .addToggle((toggle) =>
                                toggle.setValue(this.plugin.settings.showRibbonIcon).onChange(async (v) => {
                                        this.plugin.settings.showRibbonIcon = v;
                                        await this.plugin.saveSettings();
                                        this.plugin.updateRibbonIcon();
                                })
                        );

                // ═══════════════════════════════════════════════════════════
                //  DEPLOY HINT
                // ═══════════════════════════════════════════════════════════
                containerEl.createEl("h2", { text: "Deploying to Your Site" });
                new Setting(containerEl)
                        .setName("Git sync required")
                        .setDesc("This plugin manages frontmatter and validation. To deploy changes to your Astro site, use Obsidian Git or your preferred Git sync method.")
                        .addButton((btn) =>
                                btn.setButtonText("Open Obsidian Git").setCta().onClick(() => {
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        const appAny = this.app as any;
                                        const gitPlugin = appAny.plugins?.plugins?.["obsidian-git"];
                                        if (gitPlugin) {
                                                appAny.setting?.open();
                                                appAny.setting?.openTabById("obsidian-git");
                                        } else {
                                                window.open("https://github.com/Vinzent03/obsidian-git", "_blank");
                                        }
                                })
                        );

                // Version footer
                const versionEl = containerEl.createEl("div", { cls: "cms-settings-version" });
                versionEl.createEl("span", { text: `isHistory CMS v${this.plugin.manifest.version}` });
                versionEl.appendText(` \u00B7 Schema v${this.plugin.settings._version}`);
        }

        /** Add clickable variable insert buttons below a template input */
        private _addVariableButtons(
                containerEl: HTMLElement,
                inputClass: string,
                varNames: string[],
        ): void {
                const btnRow = containerEl.createEl("div", { cls: "cms-var-btn-row" });
                btnRow.createEl("span", { text: "Insert:", cls: "cms-var-btn-label" });
                for (const name of varNames) {
                        const btn = btnRow.createEl("button", {
                                text: `{{${name}}}`,
                                cls: "cms-var-btn",
                                attr: { "data-var": name },
                        });
                        btn.addEventListener("click", () => {
                                const input = containerEl.querySelector(`.${inputClass}`) as HTMLInputElement | HTMLTextAreaElement | null;
                                if (!input) return;
                                const start = input.selectionStart ?? input.value.length;
                                const end = input.selectionEnd ?? input.value.length;
                                const insertion = `{{${name}}}`;
                                const newValue = input.value.substring(0, start) + insertion + input.value.substring(end);
                                input.value = newValue;
                                // Set cursor position after insertion
                                const newPos = start + insertion.length;
                                input.setSelectionRange(newPos, newPos);
                                // Trigger the onChange (dispatch both events for compatibility)
                                input.dispatchEvent(new Event("input", { bubbles: true }));
                                input.dispatchEvent(new Event("change", { bubbles: true }));
                        });
                }
        }
}

// ─── Track Editor Modal ───

class TrackEditorModal extends Modal {
        private plugin: IsHistoryPlugin;
        private editCode: string | null;
        private editInfo: TrackInfo | null;
        private onSave: () => void;

        constructor(
                app: App,
                plugin: IsHistoryPlugin,
                code: string | null,
                info: TrackInfo | null,
                onSave: () => void,
        ) {
                super(app);
                this.plugin = plugin;
                this.editCode = code;
                this.editInfo = info;
                this.onSave = onSave;
        }

        onOpen(): void {
                const { titleEl, contentEl } = this;
                titleEl.setText(this.editCode ? `Edit Track: ${this.editCode}` : "Add New Track");

                const form = contentEl.createEl("div", { cls: "cms-track-editor" });

                // Code input
                const codeSetting = form.createEl("div", { cls: "cms-form-field" });
                codeSetting.createEl("label", { text: "Track code" });
                codeSetting.createEl("p", { text: "1-2 uppercase letters used in seriesOrder (e.g. A1, P3, E14). This cannot be changed after creation.", cls: "cms-form-hint" });
                const codeInput = codeSetting.createEl("input", {
                        type: "text", cls: "cms-form-input",
                });
                codeInput.value = this.editCode || "";
                codeInput.placeholder = "e.g. A, R, T";
                codeInput.maxLength = 2;
                if (this.editCode) codeInput.disabled = true;

                // Name input
                const nameSetting = form.createEl("div", { cls: "cms-form-field" });
                nameSetting.createEl("label", { text: "Display name" });
                nameSetting.createEl("p", { text: "The human-readable name shown in the dashboard and filters (e.g. \"Articles\", \"Photography\").", cls: "cms-form-hint" });
                const nameInput = nameSetting.createEl("input", {
                        type: "text", cls: "cms-form-input",
                });
                nameInput.value = this.editInfo?.name || "";
                nameInput.placeholder = "e.g. Articles, Reviews, Tutorials";

                // Emoji input
                const emojiSetting = form.createEl("div", { cls: "cms-form-field" });
                emojiSetting.createEl("label", { text: "Emoji" });
                emojiSetting.createEl("p", { text: "An emoji that represents this track. You can copy one from emojipedia.org.", cls: "cms-form-hint" });
                const emojiInput = emojiSetting.createEl("input", {
                        type: "text", cls: "cms-form-input cms-form-input-emoji",
                });
                emojiInput.value = this.editInfo?.emoji || "";
                emojiInput.placeholder = "\u{1F4F0}";

                // Color input — with native color picker
                const colorSetting = form.createEl("div", { cls: "cms-form-field" });
                colorSetting.createEl("label", { text: "Color" });
                colorSetting.createEl("p", { text: "The accent color for this track. Used for card borders, badges, and stats in the dashboard.", cls: "cms-form-hint" });
                const colorRow = colorSetting.createEl("div", { cls: "cms-color-input-row" });
                const colorPicker = colorRow.createEl("input", {
                        type: "color", cls: "cms-color-picker",
                });
                colorPicker.value = this.editInfo?.color || "#7c3aed";
                const colorInput = colorRow.createEl("input", {
                        type: "text", cls: "cms-form-input cms-form-input-color",
                });
                colorInput.value = this.editInfo?.color || "#7c3aed";
                colorInput.placeholder = "#7c3aed";
                const colorPreview = colorRow.createEl("div", { cls: "cms-color-preview" });
                colorPreview.style.backgroundColor = colorInput.value;
                // Sync picker → text + preview
                colorPicker.addEventListener("input", () => {
                        colorInput.value = colorPicker.value;
                        colorPreview.style.backgroundColor = colorPicker.value;
                });
                // Sync text → picker + preview
                colorInput.addEventListener("input", () => {
                        if (/^#[0-9a-fA-F]{6}$/.test(colorInput.value)) {
                                colorPicker.value = colorInput.value;
                                colorPreview.style.backgroundColor = colorInput.value;
                        }
                });

                // Error display area
                const errorArea = form.createEl("div", { cls: "cms-form-errors" });

                // Buttons
                const btnRow = form.createEl("div", { cls: "cms-modal-btn-row" });
                btnRow.createEl("button", { text: "Cancel", cls: "cms-btn cms-btn-secondary" })
                        .addEventListener("click", () => this.close());
                btnRow.createEl("button", { text: "Save Track", cls: "cms-btn cms-btn-primary" })
                        .addEventListener("click", async () => {
                                const code = codeInput.value.trim().toUpperCase();
                                const name = nameInput.value.trim();
                                const emoji = emojiInput.value.trim() || "\u{1F4CB}";
                                const color = colorInput.value.trim() || "#7c3aed";

                                // Validate with user-visible feedback
                                const errors: string[] = [];
                                if (!code || code.length === 0) {
                                        errors.push("Track code is required.");
                                }
                                if (code && !/^[A-Z]{1,2}$/.test(code)) {
                                        errors.push("Track code must be 1-2 uppercase letters (A-Z).");
                                }
                                if (!name) {
                                        errors.push("Display name is required.");
                                }
                                if (!this.editCode && code in this.plugin.settings.tracks) {
                                        errors.push(`Track code "${code}" already exists. Choose a different code.`);
                                }
                                if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
                                        errors.push("Color must be a valid hex code (e.g. #7c3aed).");
                                }

                                if (errors.length > 0) {
                                        errorArea.empty();
                                        for (const err of errors) {
                                                errorArea.createEl("div", { text: err, cls: "cms-form-error" });
                                        }
                                        return;
                                }

                                this.plugin.settings.tracks[code] = { name, emoji, color };
                                await this.plugin.saveSettings();
                                this.plugin._updateDynamicStyles();
                                this._debouncedRescan();
                                this.close();
                                this.onSave();
                                new Notice(`Track "${name}" (${code}) saved.`);
                        });
        }

        private _debouncedRescan(delay = 600): void {
                setTimeout(() => this.plugin.rescanCache(), delay);
        }
}

// ─── Feature 2: Track Deletion Confirmation Modal ───

class TrackDeleteConfirmModal extends Modal {
        private plugin: IsHistoryPlugin;
        private trackCode: string;
        private trackName: string;
        private orphanCount: number;
        private onDelete: () => void;

        constructor(
                app: App,
                plugin: IsHistoryPlugin,
                trackCode: string,
                trackName: string,
                orphanCount: number,
                onDelete: () => void,
        ) {
                super(app);
                this.plugin = plugin;
                this.trackCode = trackCode;
                this.trackName = trackName;
                this.orphanCount = orphanCount;
                this.onDelete = onDelete;
        }

        onOpen(): void {
                const { titleEl, contentEl } = this;
                titleEl.setText(`Delete track "${this.trackCode}"?`);

                const form = contentEl.createEl("div", { cls: "cms-track-editor" });
                form.createEl("p", {
                        text: `${this.orphanCount} post${this.orphanCount !== 1 ? "s" : ""} currently use the track "${this.trackCode}" (${this.trackName}). Deleting it will cause validation errors on those posts because their "track" field will no longer be recognized.`,
                        cls: "cms-form-hint",
                });
                form.createEl("p", {
                        text: "You can fix this later by editing each post's frontmatter to use a different track code.",
                        cls: "cms-form-hint",
                });

                const btnRow = form.createEl("div", { cls: "cms-modal-btn-row" });
                btnRow.createEl("button", { text: "Cancel", cls: "cms-btn cms-btn-secondary" })
                        .addEventListener("click", () => this.close());
                btnRow.createEl("button", { text: "Delete anyway", cls: "cms-btn cms-btn-primary" })
                        .addEventListener("click", async () => {
                                delete this.plugin.settings.tracks[this.trackCode];
                                await this.plugin.saveSettings();
                                this.plugin._updateDynamicStyles();
                                this.close();
                                this.onDelete();
                                new Notice(`Track "${this.trackCode}" deleted. ${this.orphanCount} post${this.orphanCount !== 1 ? "s" : ""} now orphaned.`);
                        });
        }
}

// ─── Settings Migration ───

export function migrateSettings(loaded: Record<string, unknown>): Record<string, unknown> {
        const version = (loaded._version as number) || 0;

        if (version < 5) {
                loaded.archivePath = loaded.archivePath || DEFAULT_SETTINGS.archivePath;
                loaded.vaultPath = loaded.vaultPath || DEFAULT_SETTINGS.vaultPath;
                loaded.cardsPerPage =
                        loaded.cardsPerPage !== undefined && loaded.cardsPerPage !== null
                                ? loaded.cardsPerPage
                                : DEFAULT_SETTINGS.cardsPerPage;
                loaded.showRibbonIcon =
                        loaded.showRibbonIcon !== undefined ? loaded.showRibbonIcon : true;
                delete loaded.contentPath;
                delete loaded.requiredFields;
                delete loaded.validateDraft;
                delete loaded.validateDate;
                delete loaded.autoSyncGraph;
        }

        if (version < 6) {
                if (!loaded.cardsPerPage || typeof loaded.cardsPerPage !== "number") {
                        loaded.cardsPerPage = DEFAULT_SETTINGS.cardsPerPage;
                }
        }

        if (version < 7) {
                loaded.defaultSeries = loaded.defaultSeries || DEFAULT_SETTINGS.defaultSeries;
        }

        // v1.5.0: Migrate from hardcoded tracks/statuses to dynamic settings
        if (version < 8) {
                // Initialize tracks from default if not present
                if (!loaded.tracks || typeof loaded.tracks !== "object") {
                        loaded.tracks = { ...DEFAULT_TRACKS };
                }
                // Initialize statuses from default if not present
                if (!Array.isArray(loaded.statuses)) {
                        loaded.statuses = [...DEFAULT_STATUSES];
                }
                // Validation thresholds
                if (typeof loaded.minTitleLength !== "number") loaded.minTitleLength = DEFAULT_SETTINGS.minTitleLength;
                if (typeof loaded.maxTitleLength !== "number") loaded.maxTitleLength = DEFAULT_SETTINGS.maxTitleLength;
                if (typeof loaded.minDescriptionLength !== "number") loaded.minDescriptionLength = DEFAULT_SETTINGS.minDescriptionLength;
                if (typeof loaded.maxDescriptionLength !== "number") loaded.maxDescriptionLength = DEFAULT_SETTINGS.maxDescriptionLength;
                if (!Array.isArray(loaded.requiredArchiveFields)) loaded.requiredArchiveFields = [...DEFAULT_SETTINGS.requiredArchiveFields];
                if (typeof loaded.imagePrefix !== "string") loaded.imagePrefix = DEFAULT_SETTINGS.imagePrefix;
                // Display limits
                if (typeof loaded.descriptionTruncation !== "number") loaded.descriptionTruncation = DEFAULT_SETTINGS.descriptionTruncation;
                if (typeof loaded.figuresTruncation !== "number") loaded.figuresTruncation = DEFAULT_SETTINGS.figuresTruncation;
                if (typeof loaded.maxTagsPerCard !== "number") loaded.maxTagsPerCard = DEFAULT_SETTINGS.maxTagsPerCard;
                if (typeof loaded.maxErrorsPerCard !== "number") loaded.maxErrorsPerCard = DEFAULT_SETTINGS.maxErrorsPerCard;
                if (typeof loaded.maxMetaTags !== "number") loaded.maxMetaTags = DEFAULT_SETTINGS.maxMetaTags;
                // Template
                if (typeof loaded.newPostSlug !== "string") loaded.newPostSlug = DEFAULT_SETTINGS.newPostSlug;
                if (typeof loaded.newPostTitle !== "string") loaded.newPostTitle = DEFAULT_SETTINGS.newPostTitle;
                if (typeof loaded.newPostImage !== "string") loaded.newPostImage = DEFAULT_SETTINGS.newPostImage;
                if (typeof loaded.newPostStatus !== "string") loaded.newPostStatus = DEFAULT_SETTINGS.newPostStatus;
                if (typeof loaded.newPostBody !== "string") loaded.newPostBody = DEFAULT_SETTINGS.newPostBody;
                // Pre-flight
                if (typeof loaded.preflightDraft !== "boolean") loaded.preflightDraft = DEFAULT_SETTINGS.preflightDraft;
                if (typeof loaded.preflightStatus !== "string") loaded.preflightStatus = DEFAULT_SETTINGS.preflightStatus;
                if (typeof loaded.preflightAutoDate !== "boolean") loaded.preflightAutoDate = DEFAULT_SETTINGS.preflightAutoDate;

                // v1.8.0: Track templates and health report path
                if (!loaded.trackTemplates || typeof loaded.trackTemplates !== "object") loaded.trackTemplates = {};
                if (typeof loaded.reportPath !== "string") loaded.reportPath = DEFAULT_SETTINGS.reportPath;
        }

        loaded._version = SETTINGS_VERSION;
        return loaded;
}

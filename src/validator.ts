/**
 * isHistory CMS Plugin — Validation Engine
 *
 * Validates frontmatter for archive and vault collections
 * against the content schema. All rules are pure functions
 * with clear inputs and outputs for testability.
 * v1.9.0: Collection-aware validation with per-collection required fields.
 */

import {
  type ValidationError,
  type ValidationResult,
  type ArchiveFrontmatter,
  type VaultFrontmatter,
  type ValidationConfig,
  type CollectionConfig,
  DEFAULT_VALIDATION_CONFIG,
  buildSeriesOrderRegex,
  buildConnectsRefRegex,
} from "./types";

// ─── Helper: normalize tags (YAML shorthand → array) ───

function normalizeTags(tags: unknown): unknown {
  if (typeof tags === "string") {
    return [tags];
  }
  return tags;
}

// ─── v1.9.0: Collection-aware validation ───

/**
 * Validate frontmatter for a specific collection.
 * Uses the collection's requiredFields and configuration.
 */
export function validateForCollection(
  fm: Record<string, unknown> | null | undefined,
  config: ValidationConfig,
  collectionConfig: CollectionConfig,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!fm) {
    errors.push({
      field: "Frontmatter",
      message: "Missing frontmatter block entirely.",
      severity: "error",
    });
    return errors;
  }

  // Use collection's seoMode to determine validation strictness
  if (collectionConfig.seoMode === "none") {
    // Minimal validation: just check required fields
    for (const field of collectionConfig.requiredFields) {
      const value = fm[field];
      if (value === undefined || value === null || value === "") {
        errors.push({
          field,
          message: `Required field "${field}" is missing or empty.`,
          severity: "error",
        });
      }
    }
    return errors;
  }

  // For "full" or "basic" seoMode, run the appropriate validation
  if (collectionConfig.id === "archive" || collectionConfig.seoMode === "full") {
    // Run archive-style validation with collection-specific required fields
    const archiveErrors = validateArchive(fm as ArchiveFrontmatter | null, config);
    // Replace the default requiredFields check with collection-specific ones
    const filteredErrors = archiveErrors.filter(
      (e) => !(e.field !== "title" && e.field !== "date" && e.field !== "description" && config.requiredArchiveFields.includes(e.field) && e.message.includes("Required field"))
    );
    // Add collection-specific required field checks
    for (const field of collectionConfig.requiredFields) {
      // Skip fields already validated with rich rules
      if (field === "title" || field === "date" || field === "description") continue;
      const value = fm[field];
      if (value === undefined || value === null || value === "") {
        // Only add if not already present
        if (!filteredErrors.some((e) => e.field === field)) {
          filteredErrors.push({
            field,
            message: `Required field "${field}" is missing or empty.`,
            severity: "error",
          });
        }
      }
    }
    return filteredErrors;
  }

  if (collectionConfig.id === "vault" || collectionConfig.seoMode === "basic") {
    const vaultErrors = validateVault(fm as VaultFrontmatter | null, config);
    // Add collection-specific required field checks
    for (const field of collectionConfig.requiredFields) {
      if (field === "title") continue; // Already checked by validateVault
      const value = fm[field];
      if (value === undefined || value === null || value === "") {
        if (!vaultErrors.some((e) => e.field === field)) {
          vaultErrors.push({
            field,
            message: `Required field "${field}" is missing or empty.`,
            severity: "error",
          });
        }
      }
    }
    return vaultErrors;
  }

  // Default: check required fields only
  for (const field of collectionConfig.requiredFields) {
    const value = fm[field];
    if (value === undefined || value === null || value === "") {
      errors.push({
        field,
        message: `Required field "${field}" is missing or empty.`,
        severity: "error",
      });
    }
  }
  return errors;
}

// ─── Archive Validation ───

export function validateArchive(
  fm: ArchiveFrontmatter | null | undefined,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!fm) {
    errors.push({
      field: "Frontmatter",
      message: "Missing frontmatter block entirely.",
      severity: "error",
    });
    return errors;
  }

  // title
  if (!fm.title || typeof fm.title !== "string" || fm.title.trim().length < config.minTitleLength) {
    errors.push({
      field: "title",
      message: `Required. Must be at least ${config.minTitleLength} characters for SEO.`,
      severity: "error",
    });
  } else if (fm.title.length > config.maxTitleLength) {
    errors.push({
      field: "title",
      message: `Too long (${fm.title.length}/${config.maxTitleLength} chars). Keep titles concise.`,
      severity: "warning",
    });
  }

  // date
  if (!fm.date) {
    errors.push({
      field: "date",
      message: "Required. Publication date for the article.",
      severity: "error",
    });
  } else if (isNaN(Date.parse(String(fm.date)))) {
    errors.push({
      field: "date",
      message: "Invalid date. Use YYYY-MM-DD format.",
      severity: "error",
    });
  } else if (new Date(String(fm.date)) > new Date()) {
    errors.push({
      field: "date",
      message: "Date is in the future. Articles should have a current or past date.",
      severity: "warning",
    });
  }

  // description
  if (
    !fm.description ||
    typeof fm.description !== "string" ||
    fm.description.trim().length < config.minDescriptionLength
  ) {
    errors.push({
      field: "description",
      message: `Required. Must be at least ${config.minDescriptionLength} characters for SEO meta.`,
      severity: "error",
    });
  } else if (fm.description.length > config.maxDescriptionLength) {
    errors.push({
      field: "description",
      message: `Too long (${fm.description.length}/${config.maxDescriptionLength} chars). Will be truncated in search results.`,
      severity: "warning",
    });
  }

  // track (dynamic — validated against config.tracks)
  if (fm.track && !(fm.track in config.tracks)) {
    errors.push({
      field: "track",
      message: `Invalid track "${fm.track}". Must be one of: ${Object.keys(config.tracks).join(", ")}.`,
      severity: "error",
    });
  }

  // status (dynamic — validated against config.statuses)
  if (fm.status && !config.statuses.includes(fm.status)) {
    errors.push({
      field: "status",
      message: `Invalid status "${fm.status}". Must be one of: ${config.statuses.join(", ")}.`,
      severity: "error",
    });
  }

  // series + seriesOrder pair
  if (fm.series && !fm.seriesOrder) {
    errors.push({
      field: "seriesOrder",
      message: `You set series="${fm.series}" but forgot seriesOrder (e.g. "A1", "P3", "E14").`,
      severity: "warning",
    });
  }
  if (fm.seriesOrder && !fm.series) {
    errors.push({
      field: "series",
      message: `You set seriesOrder="${fm.seriesOrder}" but have no series defined.`,
      severity: "warning",
    });
  }

  // seriesOrder format check (dynamic regex from track codes)
  if (fm.seriesOrder && typeof fm.seriesOrder === "string") {
    const match = fm.seriesOrder.match(buildSeriesOrderRegex(config.tracks));
    if (!match) {
      const codes = Object.keys(config.tracks).join(", ");
      errors.push({
        field: "seriesOrder",
        message: `Format should be track+number (e.g. "${Object.keys(config.tracks)[0] || "A"}1"). Got "${fm.seriesOrder}". Valid tracks: ${codes}.`,
        severity: "warning",
      });
    } else {
      const orderTrack = match[1];
      if (fm.track && fm.track !== orderTrack) {
        errors.push({
          field: "seriesOrder",
          message: `seriesOrder track (${orderTrack}) doesn't match track field (${fm.track}).`,
          severity: "error",
        });
      }
    }
  }

  // v1.9.0: draft + status conflict uses first status from settings instead of hardcoded "published"
  const firstStatus = config.statuses[0] || "published";
  if (fm.draft === true && fm.status === firstStatus) {
    errors.push({
      field: "draft",
      message: `Marked as draft but status is "${firstStatus}". Set draft:false or status:"${config.statuses[1] || "upcoming"}".`,
      severity: "warning",
    });
  }

  // tags format (accept YAML shorthand: bare string → single-element array)
  const normalizedTags = normalizeTags(fm.tags);
  if (normalizedTags !== undefined && !Array.isArray(normalizedTags)) {
    errors.push({
      field: "tags",
      message: "Must be a YAML list: [tag1, tag2, tag3]",
      severity: "error",
    });
  }

  // aliases format
  if (fm.aliases !== undefined && !Array.isArray(fm.aliases)) {
    errors.push({
      field: "aliases",
      message: 'Must be a YAML list: ["A1"]',
      severity: "error",
    });
  }

  // image path (configurable prefix)
  if (fm.image && typeof fm.image === "string" && !fm.image.startsWith(config.imagePrefix)) {
    errors.push({
      field: "image",
      message: `Hero image path should start with ${config.imagePrefix} (e.g. ${config.imagePrefix}images/a1-hero.jpg)`,
      severity: "warning",
    });
  }

  // connects format hint (dynamic regex from track codes)
  if (fm.connects && typeof fm.connects === "string") {
    const refRegex = buildConnectsRefRegex(config.tracks);
    const parts = fm.connects
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s);
    const badRefs = parts.filter((p) => !p.match(refRegex));
    if (badRefs.length > 0) {
      errors.push({
        field: "connects",
        message: `Invalid references: ${badRefs.join(", ")}. Use format "${Object.keys(config.tracks)[0] || "A"}1, ${Object.keys(config.tracks)[1] || "P"}5".`,
        severity: "warning",
      });
    }
  }

  // figures should be non-empty for profiles (or any track that needs it)
  if (fm.track && config.tracks[fm.track]) {
    const trackInfo = config.tracks[fm.track];
    if (trackInfo.name.toLowerCase().includes("profile") && (!fm.figures || fm.figures.trim() === "")) {
      errors.push({
        field: "figures",
        message: `${trackInfo.name} should list the key historic figure(s).`,
        severity: "warning",
      });
    }
  }

  // Check additional required fields from config
  for (const field of config.requiredArchiveFields) {
    // Skip fields already validated with rich rules above
    if (field === "title" || field === "date" || field === "description") continue;
    const value = (fm as Record<string, unknown>)[field];
    if (value === undefined || value === null || value === "") {
      errors.push({
        field,
        message: `Required field "${field}" is missing or empty.`,
        severity: "error",
      });
    }
  }

  return errors;
}

// ─── Vault Validation ───

export function validateVault(
  fm: VaultFrontmatter | null | undefined,
  _config: ValidationConfig = DEFAULT_VALIDATION_CONFIG,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!fm) {
    errors.push({
      field: "Frontmatter",
      message: "Missing frontmatter block.",
      severity: "error",
    });
    return errors;
  }

  if (!fm.title || typeof fm.title !== "string" || fm.title.trim() === "") {
    errors.push({
      field: "title",
      message: "Required. Every vault note needs a title.",
      severity: "error",
    });
  }

  // created date format
  if (fm.created && isNaN(Date.parse(String(fm.created)))) {
    errors.push({
      field: "created",
      message: "Invalid date. Use YYYY-MM-DD format.",
      severity: "warning",
    });
  }

  // updated date format
  if (fm.updated && isNaN(Date.parse(String(fm.updated)))) {
    errors.push({
      field: "updated",
      message: "Invalid date. Use YYYY-MM-DD format.",
      severity: "warning",
    });
  }

  if (fm.publish !== undefined && typeof fm.publish !== "boolean") {
    errors.push({
      field: "publish",
      message: "Must be true or false.",
      severity: "error",
    });
  }

  // tags format (accept YAML shorthand)
  const normalizedTags = normalizeTags(fm.tags);
  if (normalizedTags !== undefined && !Array.isArray(normalizedTags)) {
    errors.push({
      field: "tags",
      message: "Must be a YAML list: [tag1, tag2]",
      severity: "error",
    });
  }

  if (fm.order !== undefined && typeof fm.order !== "number") {
    errors.push({
      field: "order",
      message: "Must be a number for sorting.",
      severity: "error",
    });
  }

  return errors;
}

// ─── Status Derivation ───

export function getStatus(errors: ValidationError[]): ValidationResult {
  if (errors.length === 0) return { status: "ready", label: "Ready", errors };
  if (errors.some((e) => e.severity === "error"))
    return { status: "error", label: "Errors", errors };
  return { status: "warning", label: "Warnings", errors };
}

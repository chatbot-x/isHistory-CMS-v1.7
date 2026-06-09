# isHistory CMS

> **Your Astro website's control panel — inside Obsidian.**

Write your blog posts and research notes in Obsidian. This plugin checks they're perfect, then helps you publish them to your Astro website.

---

## What Does This Plugin Do?

Think of it like a **spell-checker for your blog posts**, but instead of checking spelling, it checks that every post has all the information your Astro website needs to display it properly.

Here's what you get:

| Feature | What It Means |
|---|---|
| **Dashboard** | See all your blog posts in one place, like a spreadsheet |
| **Validation** | The plugin tells you if a post is missing something (like a title or date) |
| **Pre-flight** | Marks a draft as ready for deployment (frontmatter only; deploy via Git sync) |
| **Quick validate sidebar** | See errors on the post you're currently editing |
| **Bulk pre-flight** | Mark many draft posts as ready for deployment at once |
| **Track system** | Organize posts by type — articles, profiles, or events |
| **Status bar** | See your content health at a glance in Obsidian's status bar |
| **Sort & filter** | Find posts fast with sort options, search, and filters |
| **Context menus** | Right-click files for quick validate and pre-flight actions |
| **Safe upgrades** | Settings automatically merge when you update — nothing is lost |

---

## Installation

### Option 1: Community Plugin Store (Recommended)

1. Open Obsidian
2. Go to **Settings** (the gear icon in the bottom left)
3. Click **Community plugins**
4. Click **Browse**
5. Search for **"isHistory CMS"**
6. Click **Install**, then click **Enable**

### Option 2: Manual Install

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/dr-ishaan/astro-cms-obsidian-plugin/releases/latest)
2. Create a folder at `.obsidian/plugins/ishistory-cms/` in your vault
3. Place the three files inside that folder
4. Open **Settings → Community plugins** and enable **"isHistory CMS"**

### Option 3: BRAT (For Beta Testers)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. Go to BRAT settings → **Add Beta plugin**
3. Paste: `https://github.com/dr-ishaan/astro-cms-obsidian-plugin`
4. Click **Add Plugin**
5. Enable **"isHistory CMS"** in Community plugins

### After Installation

1. Look at the left sidebar in Obsidian — you'll see a new dashboard icon (you can hide it in Settings → Appearance)
2. Click it to open your Astro CMS dashboard
3. Or press `Ctrl+P` (or `Cmd+P` on Mac) and search for **"Open isHistory dashboard"**

---

## How to Set Up Your Vault

Your Obsidian vault needs to look like your Astro project's content folder for the plugin to find your posts.

The plugin looks for content inside `src/content` by default. Your vault should have this structure:

```
your-vault/
  src/
    content/
      blog/           ← Your blog posts (archive collection)
        A1-the-ancient-dream-of-artificial-life.md
        P1-ada-lovelace.md
        E1-the-dartmouth-conference-1956.md
        ...
      vault/          ← Your research notes (vault collection)
        vision-and-architecture.md
        content-schema.md
        ...
```

**The easiest way:** Open your entire Astro project folder as your Obsidian vault. That way, the `src/content` path matches automatically.

### If Your Content Is Somewhere Else

1. Go to **Settings → isHistory CMS**
2. Change the **Archive path** or **Vault path** to wherever your content lives
3. For example, if you just have blog posts in a `posts/` folder, type `posts`

---

## How to Write a Blog Post

Every blog post needs a special block at the very top called **frontmatter**. It tells your Astro website everything it needs to know about the post.

### Blog Post Template (Archive Collection)

Copy this template and fill in your own information:

```markdown
---
title: "Your Post Title Here"
date: 2026-05-28
description: "A short one-line description of your post (15 to 160 characters)."
draft: false
tags: ["tag1", "tag2", "tag3"]
aliases: ["A1"]
image: "/images/your-hero-image.jpg"
series: "minds-and-machines"
seriesOrder: "A1"
track: "A"
status: "published"
part: "Part I · The Dream"
figures: "Person One, Person Two, Person Three"
connects: "P2, A5, E1"
era: "Ancient – 1850"
---

Your amazing blog post content goes here...
```

### Vault Note Template

```markdown
---
title: "Your Note Title"
created: 2026-05-28
updated: 2026-05-28
author: Ishaan
description: "What this note is about."
publish: true
tags: [meta, research, notes]
order: 1
relatedChapters: "A5, P2, E1"
---

Your research note content goes here...
```

---

## What Each Field Means

### Required Fields (Your Post WILL NOT Build Without These)

| Field | What to Write | Example |
|---|---|---|
| `title` | The name of your post (5–120 characters) | `"The Ancient Dream of Artificial Life"` |
| `date` | When this post is published (YYYY-MM-DD format) | `2026-05-28` |
| `description` | A short summary for search engines and previews (15–160 characters) | `"From bronze giants to clockwork wonders..."` |

### Series Fields (Only Needed if Your Post Belongs to a Series)

| Field | What to Write | Example |
|---|---|---|
| `series` | Which series this post belongs to | `"minds-and-machines"` |
| `seriesOrder` | The chapter code within the series | `"A1"` |
| `track` | Which track: `A` (Articles), `P` (Profiles), or `E` (Events) — or any custom track you define | `"A"` |
| `status` | Publication status: `published`, `upcoming`, or `planned` — or any custom status you define | `"published"` |
| `part` | The act/part label | `"Part I · The Dream"` |

### Connection Fields (Help Link Posts Together)

| Field | What to Write | Example |
|---|---|---|
| `figures` | Key people mentioned (comma-separated) | `"Ada Lovelace, Alan Turing"` |
| `connects` | Related chapter codes (comma-separated) | `"P2, A5, E1"` |
| `era` | The time period this post covers | `"1936-1954"` |

### Optional Fields

| Field | What to Write | Example |
|---|---|---|
| `draft` | Is this a work-in-progress? Must be `true` or `false` | `false` |
| `tags` | A list of topic tags | `["ai-history", "philosophy"]` |
| `aliases` | A list of alias names for linking (must be a YAML list) | `["A1"]` |
| `image` | Hero image path (must start with `/`) | `"/images/a1-hero.jpg"` |

---

## Common Mistakes the Plugin Catches

The plugin checks your posts and shows you exactly what's wrong. Here are the most common problems:

| Problem | What's Wrong | How to Fix |
|---|---|---|
| Missing title | No `title` field in frontmatter | Add `title: "Your Title"` |
| Missing date | No `date` field | Add `date: 2026-05-28` |
| Bad date format | Date is not in YYYY-MM-DD format | Use `2026-05-28` not `May 28, 2026` |
| Tags not a list | `tags` is a string instead of a list | Use `["tag1", "tag2"]` not `"tag1, tag2"` |
| Aliases not a list | `aliases` is a string instead of a list | Use `["A1"]` not `"A1"` |
| Has series but no order | `series` is set but `seriesOrder` is missing | Add `seriesOrder: "A1"` |
| Missing description | No `description` field | Add `description: "Your description here"` |
| Draft + published conflict | `draft: true` but `status: "published"` | Set `draft: false` or `status: "upcoming"` |
| Invalid track code | `track` is not one of your defined tracks | Use a track code from Settings |
| seriesOrder track mismatch | `seriesOrder` starts with a different track letter than `track` | Make them match |
| Profile missing figures | A Profile-track post has no `figures` field | Add `figures: "Person Name"` |

---

## Dashboard Features

### Stats Bar

At the top of the dashboard, you'll see:
- **Archive** — Number of blog/archive posts
- **Vault** — Number of research notes
- **Track counts** — Posts per track (dynamic, from your settings)
- **Drafts** — Posts with `draft: true`
- **Errors** — Posts missing required fields
- **Ready** — Posts that pass all checks

### Search and Filter

- **Search box** — Type to find posts by title, tag, era, figures, seriesOrder, or file path
- **Filter buttons** — Click to show only: All, Archive, track codes, Vault, Drafts, Recent, Errors
- **Sort dropdown** — Sort by Series Order, Newest, Oldest, Title A-Z, Errors First, Drafts First
- **Search debounce** — Search waits 200ms before filtering to keep things smooth

### Card Actions

Each post card has buttons:
- **Open** — Opens the post in the editor
- **Validate** — Shows a quick summary of what's right or wrong
- **Pre-flight** — Marks a draft as ready for deployment (sets `draft: false`, `status: "published"`, and today's date if none set)

### Bulk Pre-flight

Click the **Bulk pre-flight all drafts** command to mark all drafts as ready for deployment. It will ask you to confirm first.

### Right-click Context Menus

**File explorer** (right-click a file):
- **Validate with isHistory** — Check the post for errors
- **Pre-flight with isHistory** — Mark the post as ready for deployment
- **Open in isHistory Dashboard** — Jump to the dashboard

**Editor** (right-click inside a note):
- **Validate this post** — Check the post you're editing
- **Pre-flight this post** — Mark the current draft as ready

### Status Bar

The status bar at the bottom of Obsidian shows your content health:
- **"N ready"** (green) — All posts are valid
- **"N errors"** (red) — Some posts have errors that need fixing
- **"N warnings"** (default) — Some posts have warnings
- Click the status bar to open the dashboard

---

## Quick Validate Sidebar

This is a lightweight panel that shows you validation results for whatever post you're currently editing.

**How to open it:**
1. Press `Ctrl+P` (or `Cmd+P` on Mac)
2. Search for **"Open quick validate"**
3. The sidebar shows real-time validation as you type

---

## Commands

You can access these from the command palette (`Ctrl+P` or `Cmd+P`):

| Command | What It Does |
|---|---|
| `Open isHistory dashboard` | Opens the full content management dashboard |
| `Open quick validate` | Opens the sidebar validator |
| `Validate current post` | Checks the post you're editing for errors |
| `Pre-flight current draft` | Marks the draft you're editing as ready for deployment |
| `New Articles (A-track)` | Creates a new post for a track (one command per track) |
| `Validate all content` | Validates all content and shows summary |
| `Bulk pre-flight all drafts` | Marks all draft posts as ready for deployment |

---

## Deploying to Your Site

Pre-flighting a post marks it as ready for deployment, but doesn't push it live. To deploy changes to your Astro site:

1. Install [Obsidian Git](https://github.com/Vinzent03/obsidian-git)
2. Configure it to auto-commit and push on interval (e.g., every 5 minutes)
3. Your Astro site's CI/CD (Vercel, Netlify, Cloudflare Pages, etc.) detects the push and rebuilds automatically

That's the full pipeline: **Write → Pre-flight → Git sync → Auto-deploy**

You can also use any other Git sync method you prefer — the plugin only manages frontmatter, so any tool that commits and pushes your vault to your Astro repo will work.

> **Tip:** You can also open Obsidian Git directly from the plugin's Settings page — there's a quick-access button at the bottom.

---

## Settings

Go to **Settings → isHistory CMS** to configure:

### Content Paths
- **Archive path** — Path to blog/archive content. Default: `src/content/blog`
- **Vault path** — Path to vault/research content. Default: `src/content/vault`
- Each path has a reset button to restore the default

### Tracks
- Add, edit, or remove tracks with custom codes, names, emojis, and colors
- Each track gets its own "New post" command automatically
- **Warning** when deleting a track that has posts assigned to it
- Reset all tracks to defaults with one click

### Post Statuses
- Add or remove publication statuses (e.g., `published`, `upcoming`, `planned`)
- Statuses appear as filter options and in pre-flight settings

### Validation Rules
- **Min/Max title length** — Configurable thresholds for SEO compliance
- **Min/Max description length** — Meta description validation
- **Image path must start with** — Require hero images to start with `/` or another prefix
- **Required archive fields** — Add or remove fields that every archive post must have
- **Cross-field validation** — Warns when settings conflict (e.g., min > max, same paths)

### Card Display
- **Cards per page** — How many cards before "Load More"
- **Description preview length** — Characters shown before truncation
- **Figures preview length** — Characters shown for figures field
- **Tags shown per card** — Maximum tags displayed
- **Errors shown per card** — Maximum errors displayed
- **Tags in meta section** — Maximum unique tags in the dashboard footer

### New Post Template
- **Default series** — Series name applied to all new posts (e.g. `minds-and-machines`)
- **Template variables** — Use `{{seriesOrder}}`, `{{trackName}}`, `{{date}}`, etc.
- **Slug format** — File name pattern for new posts
- **Title format** — Default title for new posts
- **Image path format** — Hero image pattern
- **Default status** — Status for newly created posts
- **Body template** — Default content below the frontmatter

### Pre-flight Settings
- **Set draft flag to** — What `draft` becomes when pre-flighting
- **Set status to** — What `status` becomes when pre-flighting
- **Auto-fill today's date** — Automatically fill in today's date if missing
- Reset all pre-flight settings to defaults with one click

### Appearance
- **Show ribbon icon** — Toggle the isHistory dashboard icon in the left sidebar ribbon

### Deploying to Your Site (in Settings)
- Quick-access button to open the **Obsidian Git** plugin settings (or its GitHub page if not installed)

### Settings Validation
The settings page shows warnings when:
- Min length ≥ max length for any field
- No tracks or statuses are defined
- Archive path and vault path are the same

---

## Version History

### v1.6.0 — Trust & Workflow
- **Pre-flight Validation Gate** — Warns about errors before publishing
- **Track Deletion Warning** — Shows how many posts use a track before deleting
- **Failed Save Notice** — Alerts when settings can't be saved
- **Cross-field Settings Validation** — Catches conflicting settings
- **Deep-merge Settings** — Safe upgrades without data loss
- **Status Bar Health Indicator** — Content health at a glance
- **Sort Options Dropdown** — Six sort modes in the dashboard
- **Recently Modified Filter** — Posts edited in the last 24 hours
- **Right-click Context Menus** — Quick actions on files
- **Search Debounce (200ms)** — Smooth search performance

### v1.5.0 — Settings That Make Sense
- Full settings UX overhaul (no more sliders)
- Dynamic track system with custom codes, emojis, and colors
- Template engine with variable substitution
- Chip editors for statuses and required fields
- Color pickers and reset buttons

### v1.4.0 — Your Tracks, Your Way
- Dynamic track system — create any track type
- Color-coded tracks in dashboard and stats
- Regex-based scanning derived from track codes

### v1.3.0 — The Big Picture
- Dashboard view for browsing all posts
- Search, filter, and stats bar
- Pagination with "Load More"

### v1.2.0 — Side by Side
- Sidebar view for real-time validation
- Auto-updates when switching files

### v1.1.0 — Bug Squashing
- Fixed plugin freeze on file open
- Fixed sidebar not updating
- Fixed floating promise errors

### v1.0.0 — The Beginning
- Initial release with frontmatter validation
- Basic pre-flight and status management
- Dashboard view and status bar

---

## FAQ

### The dashboard shows "No content found"

Make sure your **Archive path** or **Vault path** in settings matches where your content actually is. If your posts are in `src/content/blog/`, the archive path should be `src/content/blog`.

### BRAT says "frozen" next to my plugin version

That's normal! In BRAT, "(frozen)" just means the plugin is pinned to a specific version. It does NOT mean the plugin is broken. Your plugin is working fine.

### How do I update the plugin?

**Community Store:** Settings → Community Plugins → Click "Check for updates" → Update
**Manual:** Download the latest release files and replace the old ones.
**BRAT:** BRAT settings → Check for updates → Update.

### The plugin is slow with many posts

Go to **Settings → isHistory CMS** and lower the **Cards per page** number. Try 20 instead of 40.

### I clicked Pre-flight but my site didn't update

Pre-flight only changes frontmatter in your vault. You still need to sync your vault to Git (using Obsidian Git or another tool) for your Astro site to rebuild and deploy. See the **Deploying to Your Site** section above.

### Will updating the plugin delete my settings?

No! The plugin uses a deep-merge strategy that reads your existing settings, keeps everything you configured, and only adds any new fields that didn't exist before. Your settings are always safe.

### Do I need to know regex to use custom tracks?

No! The default settings work great out of the box. Regex is only used internally to match seriesOrder patterns based on your track codes. You just pick a short code (like "A", "P", "E") and the plugin handles the rest.

---

## Built For

This plugin is designed for the **isHistory** Astro project — a deep-dive into the history of Artificial Intelligence. It uses:

- **Astro** with Content Collections
- **Two content collections**: `archive` (blog posts) and `vault` (research notes)
- **Series system**: Articles (A), Profiles (P), Events (E) — each organized into tracks

But it works with any Astro project that uses content collections!

---

## Security

- Release assets are built via GitHub Actions with **artifact attestations** for `main.js` and `styles.css` (cryptographic provenance verification)
- No `innerHTML` usage — DOM manipulation uses Obsidian's `createEl` API (with two minimal `document.createElement` calls for style injection and card rendering)
- No `!important` in CSS — proper selector specificity is used instead
- No `builtin-modules` npm dependency — uses Node.js built-in `module.builtinModules`
- Vault scanning uses `app.vault.getMarkdownFiles()` — the recommended Obsidian API that only accesses markdown files, not all vault files

---

## Requirements

- Obsidian v1.0.0 or later
- An Astro project with Content Collections

---

## Development

```bash
# Install dependencies
npm ci

# Build for production
npm run build

# Development mode (watch)
npm run dev

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint
```

---

## License

MIT

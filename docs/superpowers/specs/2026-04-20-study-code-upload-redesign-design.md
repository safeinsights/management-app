# Study Code Upload Screen Redesign (Card 54)

**Date:** 2026-04-20
**Figma:** https://www.figma.com/design/jqhZqgwEmGiaWg7eaZnXi0/Card-54-Study-code-redesign?node-id=350-3238

## Problem

The current study code upload page (`src/components/study/study-code-panel.tsx`) crams three things into one layout: the "Launch IDE" button, the dropzone, and the review-files table. The two paths researchers can take — upload files locally vs. write code in the IDE — aren't visually distinct. Researchers don't get a clear "recommended: use IDE" affordance, and once files exist, the IDE/upload controls and the file table fight for the same vertical space.

The Figma redesign splits the screen into two distinct states:

1. **Empty state:** two prominent, side-by-side-stacked cards — "Write and test your code in IDE (recommended)" above and "Upload your files" below, separated by a centered "OR" divider. The starter-code link lives inside the upload card.
2. **Review state:** a compact header row with the study title and two outline buttons ("Edit files in IDE", "Upload files"), then a "Review files" section with a star-based main-file picker in the table.

## Goals

- Make the choice between uploading and launching the IDE visually unambiguous when the researcher hasn't added any files yet.
- Keep the page calm and table-focused once files exist.
- Preserve every existing behavior of `useIDEFiles`: upload, delete, view, main-file selection, change-detection gating of submit, and IDE launch.

## Non-goals

- No changes to `useIDEFiles`, `submitStudyCodeAction`, workspace-launcher, starter-code download, routes, or permissions.
- No "without IDE" mode. The IDE section is always present.
- The star toggle is local to the file table — not a reusable design-system component.

## Behavior decisions

1. **View switch:** any file existing (uploaded OR created via the IDE) flips to the review view. Deleting the last file flips back to the empty view.
2. **IDE button:** a single button labeled "Edit files in IDE" (or "Launch IDE" in the big empty-view card) always; the underlying `launchWorkspace` handles both the first-launch and subsequent-open cases.
3. **Starter code link:** only appears inside the upload card in the empty view. Not shown in the review view.
4. **Submit enablement:** strict — requires the user to click a star to pick a main file. No auto-pick. Existing `filesChanged` gate is preserved.

## Architecture

`study-code-panel.tsx` becomes a thin router between two sibling views, driven by the existing `ide.showEmptyState`. All shared state stays in `useIDEFiles`; neither view owns mutations or queries.

```
StudyCodePanel (router)
├── if ide.showEmptyState → StudyCodeEmptyView
│    ├── IDE card (violet tint) → LaunchIdeButton variant="cta"
│    ├── OR divider
│    └── Upload card (bordered) → FileDropOverlay with dropzone content
│          └── starter code inline link
└── else → StudyCodeReviewView
     ├── header row: title + LaunchIdeButton variant="outline" + UploadFilesButton
     └── FileDropOverlay (showHelperText=false)
          └── FileReviewTable (modified: star instead of Radio)
```

### Components

**Refactored**

- `src/components/study/study-code-panel.tsx` — routes between the two views based on `ide.showEmptyState`. Renders `Paper`, step label, title, the `FilePreviewModal`, and the footer. Delegates body to one of the two views.

**New**

- `src/components/study/study-code-empty-view.tsx` — two-card layout with OR divider.
- `src/components/study/study-code-review-view.tsx` — header row + table. Wraps table in `FileDropOverlay`.
- `src/components/study/launch-ide-button.tsx` — extracts current button + `CompactStatusButton` logic from `study-code-panel.tsx`. Accepts `variant: 'cta' | 'outline'`.
- `src/components/study/upload-files-button.tsx` — Mantine `Button` with upload icon that calls the `FileDropOverlay`'s `openRef` to open the native picker. Needs the overlay's `openRef` lifted up, or a shared callback prop.

**Modified**

- `src/components/study/file-review-table.tsx` — swap `Radio` for a custom star toggle. Rename column header "Last modified" → "Last updated". Truncate long file names with a `Tooltip`.
- `src/components/study/file-drop-overlay.tsx` — add `showHelperText?: boolean` (default `true`). Lift `openRef` so the parent can trigger the picker from a sibling button.

### Wiring `UploadFilesButton` to `FileDropOverlay`

The overlay currently owns its `openRef` internally. Two options:

- **(Chosen)** Lift `openRef` into the parent view (`StudyCodeReviewView`) and pass it to both `FileDropOverlay` and `UploadFilesButton`. The button reads `openRef.current?.()`.
- Reject: pass a callback down through context. Too much plumbing for one call site.

## Layouts

### Empty view (matches Figma node 357:729)

Inside `Paper p="xl"`:

- Step label (e.g. "STEP 4"), `Title order={4}` "Study code", `Text` "Title: {studyTitle}"
- `Divider`
- Intro paragraph: _"To prepare your code, upload existing files or write new code in our Integrated Development Environment (IDE). Once ready, submit your files to the Data Organization to run against their dataset."_
- **Card A — IDE (recommended)** — light violet background (`bg="violet.0"` or equivalent):
    - Bold heading: "Write and test your code in IDE (recommended)"
    - Body: _"IDE is pre-configured to help you write your code and test it against sample data. It will open in a new tab and you can write your code there. All files created in the IDE will populate here."_
    - `LaunchIdeButton variant="cta"` → filled indigo, external-link icon, "Launch IDE"
    - Footer: **"Note:"** + _"After creating or editing files in the IDE, please return here to submit your code to the Data Organization."_
- **OR divider** — `Divider label="OR" labelPosition="center"`
- **Card B — Upload your files** — `Paper withBorder`:
    - Bold heading: "Upload your files"
    - Body with inline "Starter code" link (from `ide.starterFiles[0].url`): _"Make sure that your main file contains the Starter code provided by the Data Organization for accessing their datasets. You may also continue to edit your uploaded files in the IDE before submitting them to the Data Organization."_
    - Dropzone body: file-upload icon + "Drop your files or **Browse**" + accepted formats + "10MB max"
    - Wrapped in `FileDropOverlay` so drag-and-drop onto the card uploads

### Review view (matches Figma nodes 350:4448 and 350:4511)

Inside `Paper p="xl"`:

- Header `Group justify="space-between" align="flex-start" wrap="nowrap"`:
    - Left: step label, `Title order={4}` "Study code", `Text` "Title: {studyTitle}"
    - Right: `Group` `{LaunchIdeButton variant="outline"}` + `{UploadFilesButton variant="outline"}`
- Spacing, no divider (per Figma)
- "Review files" block:
    - `Text fw={600}` "Review files"
    - `Text size="sm" c="dimmed"` "If you're creating or uploading multiple files, please select your main file (i.e., the script that runs first)."
- `FileDropOverlay showHelperText={false}` wrapping `FileReviewTable`

### FileReviewTable changes

- Main-file column: custom star button with `aria-pressed` semantics inside a `Radio.Group` wrapper (for keyboard navigation). Unselected: outlined gray star. Selected: filled indigo star. Hover on unselected: indigo fill at 30% opacity.
- File name column: `Text truncate="end"` with `maw={<constrained>}`, wrapped in `Tooltip` showing the full name.
- Column header rename: "Last modified" → "Last updated".

## Data flow

No changes. `code-upload.tsx` → `useIDEFiles({ studyId })` → `StudyCodePanel` picks view based on `ide.showEmptyState` (`fileNames.length === 0 && !workspace.isLoading`).

The 15s poll in `useWorkspaceFiles` drives the auto-flip from empty → review when the IDE creates a file. Deleting the last file locally flips review → empty on the next render.

One small prop addition: `studyTitle: string` passed from `code-upload.tsx` through `StudyCodePanel` to both views. Source: existing study data already available in `code/page.tsx`.

## Loading / error states

- Initial `workspace.isLoading`: render a skeleton in `Paper`; don't render either view yet (avoids flashing the empty view before we know).
- IDE launching / launch error: handled inside `LaunchIdeButton` (reused logic from current code).
- Upload in progress: `FileDropOverlay disabled={ide.isUploading}` (existing).
- Delete in progress: no visual change (existing).
- File-type rejection: toast in `FileDropOverlay` (existing).

## Testing

Unit tests using `renderWithProviders` and mocked server actions:

1. **`study-code-panel.test.tsx`** — router picks empty vs review based on `showEmptyState`.
2. **`study-code-empty-view.test.tsx`** — "Launch IDE" click calls `ide.launchWorkspace`; "Browse" opens picker; drop calls `ide.uploadFiles`; starter-code link present when `starterFiles` non-empty.
3. **`study-code-review-view.test.tsx`** — header buttons present; clicking star calls `ide.setMainFile`; trash calls `ide.removeFile`; drop-onto-table calls `ide.uploadFiles`.
4. **`launch-ide-button.test.tsx`** — idle / launching / error states render correctly; idle click fires `onClick`.

E2E: existing researcher study-code flow test (if present) should still pass — the split is internal. Verify manually in the dev server before marking done per CLAUDE.md.

## Out of scope

- `useIDEFiles` behavior changes
- `submitStudyCodeAction` changes
- Coder workspace-launcher changes
- Route changes
- Making the star a reusable design-system component
- The Figma "WITHOUT IDE" variant

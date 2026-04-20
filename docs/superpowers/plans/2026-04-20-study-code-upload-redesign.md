# Study Code Upload Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the study code upload screen into two visually distinct states (empty-choice view with Launch IDE + Upload cards, review view with header buttons + file table) per the Card 54 Figma redesign.

**Architecture:** `study-code-panel.tsx` becomes a thin router that picks `StudyCodeEmptyView` or `StudyCodeReviewView` based on `ide.showEmptyState`. Shared state stays in `useIDEFiles` — no hook changes. Small reusable button components (`LaunchIdeButton`, `UploadFilesButton`) are used by both views.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Mantine UI, TanStack Query, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-04-20-study-code-upload-redesign-design.md`

---

## File Structure

**New files:**

- `src/components/study/launch-ide-button.tsx` — IDE launch button, `variant: 'cta' | 'outline'`, owns launching/error states
- `src/components/study/upload-files-button.tsx` — Outline button that triggers the dropzone's native picker via ref
- `src/components/study/study-code-empty-view.tsx` — Two-card layout (IDE + OR + Upload)
- `src/components/study/study-code-review-view.tsx` — Header row + FileReviewTable wrapped in FileDropOverlay
- `src/components/study/launch-ide-button.test.tsx` — Unit tests
- `src/components/study/study-code-empty-view.test.tsx` — Unit tests
- `src/components/study/study-code-review-view.test.tsx` — Unit tests

**Modified files:**

- `src/components/study/study-code-panel.tsx` — Becomes a thin router between the two views
- `src/components/study/file-review-table.tsx` — Replace `Radio` with star toggle, rename "Last modified" → "Last updated", truncate long file names with tooltip
- `src/components/study/file-drop-overlay.tsx` — Add `showHelperText?: boolean`, accept external `openRef` prop so a sibling button can trigger the picker
- `src/components/study/study-code.tsx` — Pass `studyTitle` prop to `StudyCodePanel`
- `src/app/[orgSlug]/study/[studyId]/code/code-upload.tsx` — Accept and forward `studyTitle`
- `src/app/[orgSlug]/study/[studyId]/code/page.tsx` — Pass `result.title` as `studyTitle`
- `src/components/study/study-code.test.tsx` — Update existing assertions for new empty-state copy, star-based main-file selection, and "Last updated" column

---

## Task 1: Extract `LaunchIdeButton` component

**Files:**

- Create: `src/components/study/launch-ide-button.tsx`
- Create: `src/components/study/launch-ide-button.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/study/launch-ide-button.test.tsx`:

```tsx
import { describe, expect, it, renderWithProviders, screen, userEvent, vi } from '@/tests/unit.helpers'
import { LaunchIdeButton } from './launch-ide-button'

describe('LaunchIdeButton', () => {
    const baseProps = {
        onClick: vi.fn(),
        isLaunching: false,
        launchError: null,
    }

    it('renders the idle outline variant with "Edit files in IDE"', async () => {
        renderWithProviders(<LaunchIdeButton {...baseProps} variant="outline" />)
        expect(screen.getByRole('button', { name: /edit files in ide/i })).toBeInTheDocument()
    })

    it('renders the idle cta variant with "Launch IDE"', async () => {
        renderWithProviders(<LaunchIdeButton {...baseProps} variant="cta" />)
        expect(screen.getByRole('button', { name: /launch ide/i })).toBeInTheDocument()
    })

    it('calls onClick when clicked in idle state', async () => {
        const user = userEvent.setup()
        const onClick = vi.fn()
        renderWithProviders(<LaunchIdeButton {...baseProps} onClick={onClick} variant="outline" />)
        await user.click(screen.getByRole('button', { name: /edit files in ide/i }))
        expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('shows the launching state with an animated message', async () => {
        renderWithProviders(<LaunchIdeButton {...baseProps} isLaunching={true} variant="outline" />)
        expect(screen.getByText(/launching ide/i)).toBeInTheDocument()
    })

    it('shows the error state with a retry affordance', async () => {
        const user = userEvent.setup()
        const onClick = vi.fn()
        renderWithProviders(
            <LaunchIdeButton {...baseProps} launchError={new Error('boom')} onClick={onClick} variant="outline" />,
        )
        expect(screen.getByText(/launch failed/i)).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: /launch failed/i }))
        expect(onClick).toHaveBeenCalledTimes(1)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/study/launch-ide-button.test.tsx`
Expected: FAIL — "Cannot find module './launch-ide-button'"

- [ ] **Step 3: Implement the component**

Create `src/components/study/launch-ide-button.tsx`:

```tsx
'use client'

import { Button } from '@mantine/core'
import { ArrowSquareOutIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { useLoadingMessages } from '@/hooks/use-loading-messages'
import { CompactStatusButton } from './compact-status-button'

export type LaunchIdeButtonVariant = 'cta' | 'outline'

interface LaunchIdeButtonProps {
    onClick: () => void
    isLaunching: boolean
    launchError: Error | null
    variant: LaunchIdeButtonVariant
}

export function LaunchIdeButton({ onClick, isLaunching, launchError, variant }: LaunchIdeButtonProps) {
    const { messageWithEllipsis } = useLoadingMessages(isLaunching)

    if (launchError) {
        return (
            <CompactStatusButton
                icon={<WarningCircleIcon size={14} weight="fill" />}
                primaryText="Launch failed"
                secondaryText="Please try again later"
                color="red"
                onClick={onClick}
            />
        )
    }

    if (isLaunching) {
        return <CompactStatusButton primaryText="Launching IDE" secondaryText={messageWithEllipsis} loading />
    }

    if (variant === 'cta') {
        return (
            <Button variant="primary" rightSection={<ArrowSquareOutIcon size={16} />} onClick={onClick}>
                Launch IDE
            </Button>
        )
    }

    return (
        <Button variant="outline" rightSection={<ArrowSquareOutIcon size={16} />} onClick={onClick}>
            Edit files in IDE
        </Button>
    )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/study/launch-ide-button.test.tsx`
Expected: PASS — all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/study/launch-ide-button.tsx src/components/study/launch-ide-button.test.tsx
git commit -m "feat: extract LaunchIdeButton with cta and outline variants"
```

---

## Task 2: Add `showHelperText` and external `openRef` support to `FileDropOverlay`

**Files:**

- Modify: `src/components/study/file-drop-overlay.tsx`

- [ ] **Step 1: Update the component signature and body**

Edit `src/components/study/file-drop-overlay.tsx`. Replace the current `FileDropOverlayProps` and the internal `openRef` usage so consumers can pass their own ref and hide the helper text.

```tsx
'use client'

import { useRef, useState, type ReactNode, type DragEvent, type RefObject } from 'react'
import { Anchor, Box, Paper, Stack, Text, ThemeIcon } from '@mantine/core'
import { Dropzone, type FileWithPath } from '@mantine/dropzone'
import { notifications } from '@mantine/notifications'
import { FileArrowUpIcon } from '@phosphor-icons/react/dist/ssr'
import { ACCEPTED_FILE_TYPES, ACCEPTED_FILE_FORMATS_TEXT } from '@/lib/types'

const ACCEPTED_EXTENSIONS = new Set(
    Object.values(ACCEPTED_FILE_TYPES)
        .flat()
        .map((ext) => ext.toLowerCase()),
)

function hasAcceptedExtension(fileName: string) {
    const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
    return ACCEPTED_EXTENSIONS.has(ext)
}

interface FileDropOverlayProps {
    onDrop: (files: FileWithPath[]) => void
    children: ReactNode
    disabled?: boolean
    showHelperText?: boolean
    openRef?: RefObject<(() => void) | null>
}

export function FileDropOverlay({
    onDrop,
    children,
    disabled,
    showHelperText = true,
    openRef: externalOpenRef,
}: FileDropOverlayProps) {
    const internalOpenRef = useRef<() => void>(null)
    const openRef = externalOpenRef ?? internalOpenRef
    const [isDragging, setIsDragging] = useState(false)
    const dragCounter = useRef(0)

    const handleDragEnter = (e: DragEvent) => {
        e.preventDefault()
        dragCounter.current++
        if (dragCounter.current === 1) setIsDragging(true)
    }

    const handleDragLeave = (e: DragEvent) => {
        e.preventDefault()
        dragCounter.current--
        if (dragCounter.current === 0) setIsDragging(false)
    }

    const handleDragDrop = () => {
        dragCounter.current = 0
        setIsDragging(false)
    }

    const handleDrop = (files: FileWithPath[]) => {
        const accepted = files.filter((f) => hasAcceptedExtension(f.name))
        const rejected = files.filter((f) => !hasAcceptedExtension(f.name))

        if (rejected.length > 0) {
            notifications.show({
                color: 'red',
                title: 'Unsupported file type',
                message: `${rejected.map((f) => f.name).join(', ')} — ${ACCEPTED_FILE_FORMATS_TEXT}`,
            })
        }

        if (accepted.length > 0) {
            onDrop(accepted)
        }
    }

    return (
        <Box pos="relative" onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDrop={handleDragDrop}>
            <Dropzone
                openRef={openRef}
                onDrop={handleDrop}
                accept={ACCEPTED_FILE_TYPES}
                activateOnClick={false}
                disabled={disabled}
                styles={{
                    root: {
                        border: 'none',
                        padding: 0,
                        backgroundColor: 'transparent',
                        color: 'inherit',
                    },
                    inner: { pointerEvents: 'all' },
                }}
            >
                {children}
            </Dropzone>

            {isDragging && !disabled && (
                <Box
                    pos="absolute"
                    top={0}
                    left={0}
                    right={0}
                    bottom={0}
                    bg="rgba(0, 0, 0, 0.45)"
                    style={{
                        zIndex: 10,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                    }}
                >
                    <Paper p="lg" radius="md" shadow="md">
                        <Stack align="center" gap="xs">
                            <ThemeIcon variant="light" color="blue" size="xl" radius="xl">
                                <FileArrowUpIcon size={28} />
                            </ThemeIcon>
                            <Text fw={600} size="md">
                                Drop files to include
                            </Text>
                            <Text size="xs" c="dimmed">
                                {ACCEPTED_FILE_FORMATS_TEXT}
                            </Text>
                        </Stack>
                    </Paper>
                </Box>
            )}

            {showHelperText && (
                <Text fs="italic" size="sm" c="dimmed" mt="xs">
                    Include additional files by dropping them above or by{' '}
                    <Anchor component="button" type="button" size="sm" fs="italic" onClick={() => openRef.current?.()}>
                        clicking here
                    </Anchor>
                    .
                </Text>
            )}
        </Box>
    )
}
```

- [ ] **Step 2: Verify nothing broke**

Run: `npx vitest run src/components/study/study-code.test.tsx`
Expected: PASS (existing integration tests still pass — defaults preserved).

- [ ] **Step 3: Commit**

```bash
git add src/components/study/file-drop-overlay.tsx
git commit -m "refactor: allow FileDropOverlay to hide helper text and accept external openRef"
```

---

## Task 3: Create `UploadFilesButton` component

**Files:**

- Create: `src/components/study/upload-files-button.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/study/upload-files-button.tsx`:

```tsx
'use client'

import { type RefObject } from 'react'
import { Button } from '@mantine/core'
import { UploadSimpleIcon } from '@phosphor-icons/react/dist/ssr'

interface UploadFilesButtonProps {
    openRef: RefObject<(() => void) | null>
    disabled?: boolean
}

export function UploadFilesButton({ openRef, disabled }: UploadFilesButtonProps) {
    return (
        <Button
            variant="outline"
            leftSection={<UploadSimpleIcon size={16} />}
            disabled={disabled}
            onClick={() => openRef.current?.()}
        >
            Upload files
        </Button>
    )
}
```

- [ ] **Step 2: Commit**

No dedicated tests yet — the component is a trivial wrapper whose behavior is exercised in the review-view integration test later.

```bash
git add src/components/study/upload-files-button.tsx
git commit -m "feat: add UploadFilesButton that triggers the dropzone picker"
```

---

## Task 4: Convert `FileReviewTable` to star-based main-file picker

**Files:**

- Modify: `src/components/study/file-review-table.tsx`

- [ ] **Step 1: Replace Radio with a star toggle and rename column header**

Edit `src/components/study/file-review-table.tsx` to use a visual star button instead of a Mantine `Radio`, while keeping `Radio.Group` semantics for accessibility. Also rename the "Last modified" column to "Last updated" and truncate long filenames with a tooltip.

```tsx
'use client'

import { ActionIcon, Divider, Group, Radio, Table, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { EyeIcon, StarIcon, TrashIcon } from '@phosphor-icons/react/dist/ssr'
import type { WorkspaceFileInfo } from '@/hooks/use-workspace-files'

interface FileReviewTableProps {
    files: WorkspaceFileInfo[]
    mainFile: string
    onMainFileChange: (file: string) => void
    onRemoveFile: (file: string) => void
    onViewFile: (file: string) => void
    jobCreatedAt: string | null
}

function formatModified(mtime: string, jobCreatedAt: string | null): string {
    if (!jobCreatedAt) return 'Never'
    if (new Date(mtime).getTime() <= new Date(jobCreatedAt).getTime()) return 'Never'
    return new Date(mtime).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    })
}

interface MainFileStarProps {
    fileName: string
    isSelected: boolean
    onSelect: (fileName: string) => void
}

function MainFileStar({ fileName, isSelected, onSelect }: MainFileStarProps) {
    return (
        <Tooltip label={isSelected ? 'Main file' : 'Set as main file'}>
            <UnstyledButton
                role="radio"
                aria-label={`Main file: ${fileName}`}
                aria-checked={isSelected}
                onClick={() => onSelect(fileName)}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
                <StarIcon
                    size={20}
                    weight={isSelected ? 'fill' : 'regular'}
                    color={isSelected ? 'var(--mantine-color-indigo-6)' : 'var(--mantine-color-gray-5)'}
                />
            </UnstyledButton>
        </Tooltip>
    )
}

export const FileReviewTable = ({
    files,
    mainFile,
    onMainFileChange,
    onRemoveFile,
    onViewFile,
    jobCreatedAt,
}: FileReviewTableProps) => {
    return (
        <>
            <Radio.Group value={mainFile} onChange={onMainFileChange}>
                <Table highlightOnHover verticalSpacing="md">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th w={100}>Main file</Table.Th>
                            <Table.Th>File name</Table.Th>
                            <Table.Th w={200}>Last updated</Table.Th>
                            <Table.Th w={80}>Actions</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {files.map((file) => (
                            <Table.Tr key={file.name}>
                                <Table.Td>
                                    <MainFileStar
                                        fileName={file.name}
                                        isSelected={mainFile === file.name}
                                        onSelect={onMainFileChange}
                                    />
                                </Table.Td>
                                <Table.Td>
                                    <Tooltip label={file.name} disabled={file.name.length <= 48}>
                                        <Text truncate="end" maw={380}>
                                            {file.name}
                                        </Text>
                                    </Tooltip>
                                </Table.Td>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        {formatModified(file.mtime, jobCreatedAt)}
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap="xs">
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            aria-label={`View ${file.name}`}
                                            onClick={() => onViewFile(file.name)}
                                        >
                                            <EyeIcon weight="fill" />
                                        </ActionIcon>
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            aria-label={`Remove ${file.name}`}
                                            onClick={() => onRemoveFile(file.name)}
                                        >
                                            <TrashIcon weight="fill" />
                                        </ActionIcon>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Radio.Group>
            <Divider />
        </>
    )
}
```

- [ ] **Step 2: Commit**

Tests for this change come through the review-view test and the updated `study-code.test.tsx`; no standalone test file added.

```bash
git add src/components/study/file-review-table.tsx
git commit -m "feat: swap radio for star toggle and rename Last modified column"
```

---

## Task 5: Stop auto-selecting the main file in `useIDEFiles`

**Files:**

- Modify: `src/hooks/use-ide-files.ts`

Per spec decision 4 ("Strict — requires the user to click a star"), remove the auto-pick fallbacks so an unselected state is possible.

- [ ] **Step 1: Update the `mainFile` memo**

Edit `src/hooks/use-ide-files.ts` lines 85-89. Replace:

```ts
const mainFile = useMemo(() => {
    if (mainFileOverride && fileNames.includes(mainFileOverride)) return mainFileOverride
    if (workspace.suggestedMain && fileNames.includes(workspace.suggestedMain)) return workspace.suggestedMain
    return fileNames[0] ?? ''
}, [mainFileOverride, workspace.suggestedMain, fileNames])
```

With:

```ts
const mainFile = useMemo(() => {
    if (mainFileOverride && fileNames.includes(mainFileOverride)) return mainFileOverride
    return ''
}, [mainFileOverride, fileNames])
```

Also remove `workspace.suggestedMain` from the hook if it's no longer referenced. Check with grep:

Run: `rg 'suggestedMain' src/hooks/use-ide-files.ts`
Expected after edit: no matches.

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-ide-files.ts
git commit -m "refactor: require explicit main file selection in useIDEFiles"
```

---

## Task 6: Create `StudyCodeEmptyView` component

**Files:**

- Create: `src/components/study/study-code-empty-view.tsx`
- Create: `src/components/study/study-code-empty-view.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/study/study-code-empty-view.test.tsx`:

```tsx
import { describe, expect, it, renderWithProviders, screen, userEvent, vi } from '@/tests/unit.helpers'
import { StudyCodeEmptyView } from './study-code-empty-view'

const baseProps = {
    launchWorkspace: vi.fn(),
    isLaunching: false,
    launchError: null,
    uploadFiles: vi.fn(),
    isUploading: false,
    starterFiles: [],
}

describe('StudyCodeEmptyView', () => {
    it('renders both cards with the OR divider and launch button', () => {
        renderWithProviders(<StudyCodeEmptyView {...baseProps} />)
        expect(screen.getByText(/write and test your code in ide/i)).toBeInTheDocument()
        expect(screen.getByText('OR')).toBeInTheDocument()
        expect(screen.getByText(/upload your files/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /launch ide/i })).toBeInTheDocument()
    })

    it('calls launchWorkspace when the Launch IDE button is clicked', async () => {
        const user = userEvent.setup()
        const launchWorkspace = vi.fn()
        renderWithProviders(<StudyCodeEmptyView {...baseProps} launchWorkspace={launchWorkspace} />)
        await user.click(screen.getByRole('button', { name: /launch ide/i }))
        expect(launchWorkspace).toHaveBeenCalledTimes(1)
    })

    it('shows a starter code link when starterFiles is non-empty', () => {
        renderWithProviders(
            <StudyCodeEmptyView
                {...baseProps}
                starterFiles={[{ name: 'starter.R', url: 'https://example.com/starter.R' }]}
            />,
        )
        const link = screen.getByRole('link', { name: /starter code/i })
        expect(link).toHaveAttribute('href', 'https://example.com/starter.R')
    })

    it('omits the starter code link when starterFiles is empty', () => {
        renderWithProviders(<StudyCodeEmptyView {...baseProps} />)
        expect(screen.queryByRole('link', { name: /starter code/i })).not.toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/study/study-code-empty-view.test.tsx`
Expected: FAIL — "Cannot find module './study-code-empty-view'"

- [ ] **Step 3: Implement the component**

Create `src/components/study/study-code-empty-view.tsx`:

```tsx
'use client'

import { Anchor, Box, Divider, Paper, Stack, Text, ThemeIcon } from '@mantine/core'
import { FileArrowUpIcon } from '@phosphor-icons/react/dist/ssr'
import type { FileWithPath } from '@mantine/dropzone'
import { ACCEPTED_FILE_FORMATS_TEXT } from '@/lib/types'
import { FileDropOverlay } from './file-drop-overlay'
import { LaunchIdeButton } from './launch-ide-button'

interface StarterFile {
    name: string
    url: string
}

interface StudyCodeEmptyViewProps {
    launchWorkspace: () => void
    isLaunching: boolean
    launchError: Error | null
    uploadFiles: (files: FileWithPath[]) => void
    isUploading: boolean
    starterFiles: StarterFile[]
}

export function StudyCodeEmptyView({
    launchWorkspace,
    isLaunching,
    launchError,
    uploadFiles,
    isUploading,
    starterFiles,
}: StudyCodeEmptyViewProps) {
    const starterLink = starterFiles[0]

    return (
        <Stack gap="md">
            <Text size="sm">
                To prepare your code, upload existing files or write new code in our Integrated Development Environment
                (IDE). Once ready, submit your files to the Data Organization to run against their dataset.
            </Text>

            <Paper bg="violet.0" p="lg" radius="md">
                <Stack gap="sm">
                    <Text fw={700}>Write and test your code in IDE (recommended)</Text>
                    <Text size="sm" c="dimmed">
                        IDE is pre-configured to help you write your code and test it against sample data. It will open
                        in a new tab and you can write your code there. All files created in the IDE will populate here.
                    </Text>
                    <Box>
                        <LaunchIdeButton
                            onClick={launchWorkspace}
                            isLaunching={isLaunching}
                            launchError={launchError}
                            variant="cta"
                        />
                    </Box>
                    <Text size="sm">
                        <Text span fw={700}>
                            Note:{' '}
                        </Text>
                        After creating or editing files in the IDE, please return here to submit your code to the Data
                        Organization.
                    </Text>
                </Stack>
            </Paper>

            <Divider label="OR" labelPosition="center" my="sm" />

            <FileDropOverlay onDrop={uploadFiles} disabled={isUploading} showHelperText={false}>
                <Paper withBorder p="lg" radius="md">
                    <Stack gap="sm">
                        <Text fw={700}>Upload your files</Text>
                        <Text size="sm" c="dimmed">
                            Make sure that your main file contains the{' '}
                            {starterLink ? (
                                <Anchor href={starterLink.url} target="_blank">
                                    Starter code
                                </Anchor>
                            ) : (
                                'starter code'
                            )}{' '}
                            provided by the Data Organization for accessing their datasets. You may also continue to
                            edit your uploaded files in the IDE before submitting them to the Data Organization.
                        </Text>
                        <Box mt="sm">
                            <Stack gap="xs" align="flex-start">
                                <ThemeIcon variant="light" color="gray" size="xl" radius="md">
                                    <FileArrowUpIcon size={24} />
                                </ThemeIcon>
                                <Text fw={600}>Drop your files</Text>
                                <Text size="xs" c="dimmed">
                                    {ACCEPTED_FILE_FORMATS_TEXT}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    10MB max
                                </Text>
                            </Stack>
                        </Box>
                    </Stack>
                </Paper>
            </FileDropOverlay>
        </Stack>
    )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/study/study-code-empty-view.test.tsx`
Expected: PASS — all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/study/study-code-empty-view.tsx src/components/study/study-code-empty-view.test.tsx
git commit -m "feat: add StudyCodeEmptyView with IDE and upload cards"
```

---

## Task 7: Create `StudyCodeReviewView` component

**Files:**

- Create: `src/components/study/study-code-review-view.tsx`
- Create: `src/components/study/study-code-review-view.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/study/study-code-review-view.test.tsx`:

```tsx
import { describe, expect, it, renderWithProviders, screen, userEvent, vi } from '@/tests/unit.helpers'
import type { WorkspaceFileInfo } from '@/hooks/use-workspace-files'
import { StudyCodeReviewView } from './study-code-review-view'

const sampleFiles: WorkspaceFileInfo[] = [
    { name: 'main.R', size: 10, mtime: '2026-04-20T12:00:00Z' },
    { name: 'helper.R', size: 10, mtime: '2026-04-20T12:00:00Z' },
]

const baseProps = {
    launchWorkspace: vi.fn(),
    isLaunching: false,
    launchError: null,
    uploadFiles: vi.fn(),
    isUploading: false,
    files: sampleFiles,
    mainFile: '',
    setMainFile: vi.fn(),
    removeFile: vi.fn(),
    viewFile: vi.fn(),
    jobCreatedAt: null,
}

describe('StudyCodeReviewView', () => {
    it('renders the header buttons and review-files instructions', () => {
        renderWithProviders(<StudyCodeReviewView {...baseProps} />)
        expect(screen.getByRole('button', { name: /edit files in ide/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /upload files/i })).toBeInTheDocument()
        expect(screen.getByText(/review files/i)).toBeInTheDocument()
        expect(screen.getByText(/select your main file/i)).toBeInTheDocument()
    })

    it('renders each file row', () => {
        renderWithProviders(<StudyCodeReviewView {...baseProps} />)
        expect(screen.getByText('main.R')).toBeInTheDocument()
        expect(screen.getByText('helper.R')).toBeInTheDocument()
    })

    it('calls setMainFile when a star is clicked', async () => {
        const user = userEvent.setup()
        const setMainFile = vi.fn()
        renderWithProviders(<StudyCodeReviewView {...baseProps} setMainFile={setMainFile} />)
        const stars = screen.getAllByRole('radio')
        await user.click(stars[0])
        expect(setMainFile).toHaveBeenCalledWith('main.R')
    })

    it('calls removeFile when the trash button is clicked', async () => {
        const user = userEvent.setup()
        const removeFile = vi.fn()
        renderWithProviders(<StudyCodeReviewView {...baseProps} removeFile={removeFile} />)
        await user.click(screen.getByRole('button', { name: /remove main\.R/i }))
        expect(removeFile).toHaveBeenCalledWith('main.R')
    })

    it('calls launchWorkspace when Edit files in IDE is clicked', async () => {
        const user = userEvent.setup()
        const launchWorkspace = vi.fn()
        renderWithProviders(<StudyCodeReviewView {...baseProps} launchWorkspace={launchWorkspace} />)
        await user.click(screen.getByRole('button', { name: /edit files in ide/i }))
        expect(launchWorkspace).toHaveBeenCalledTimes(1)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/study/study-code-review-view.test.tsx`
Expected: FAIL — "Cannot find module './study-code-review-view'"

- [ ] **Step 3: Implement the component**

Create `src/components/study/study-code-review-view.tsx`:

```tsx
'use client'

import { useRef } from 'react'
import { Group, Stack, Text } from '@mantine/core'
import type { FileWithPath } from '@mantine/dropzone'
import type { WorkspaceFileInfo } from '@/hooks/use-workspace-files'
import { FileDropOverlay } from './file-drop-overlay'
import { FileReviewTable } from './file-review-table'
import { LaunchIdeButton } from './launch-ide-button'
import { UploadFilesButton } from './upload-files-button'

interface StudyCodeReviewViewProps {
    launchWorkspace: () => void
    isLaunching: boolean
    launchError: Error | null
    uploadFiles: (files: FileWithPath[]) => void
    isUploading: boolean
    files: WorkspaceFileInfo[]
    mainFile: string
    setMainFile: (fileName: string) => void
    removeFile: (fileName: string) => void
    viewFile: (fileName: string) => void
    jobCreatedAt: string | null
}

export function StudyCodeReviewView({
    launchWorkspace,
    isLaunching,
    launchError,
    uploadFiles,
    isUploading,
    files,
    mainFile,
    setMainFile,
    removeFile,
    viewFile,
    jobCreatedAt,
}: StudyCodeReviewViewProps) {
    const openRef = useRef<() => void>(null)

    return (
        <Stack gap="md">
            <Group justify="flex-end" wrap="nowrap">
                <LaunchIdeButton
                    onClick={launchWorkspace}
                    isLaunching={isLaunching}
                    launchError={launchError}
                    variant="outline"
                />
                <UploadFilesButton openRef={openRef} disabled={isUploading} />
            </Group>

            <Stack gap={4}>
                <Text fw={600}>Review files</Text>
                <Text size="sm" c="dimmed">
                    If you&apos;re creating or uploading multiple files, please select your main file (i.e., the script
                    that runs first).
                </Text>
            </Stack>

            <FileDropOverlay onDrop={uploadFiles} disabled={isUploading} showHelperText={false} openRef={openRef}>
                <FileReviewTable
                    files={files}
                    mainFile={mainFile}
                    onMainFileChange={setMainFile}
                    onRemoveFile={removeFile}
                    onViewFile={viewFile}
                    jobCreatedAt={jobCreatedAt}
                />
            </FileDropOverlay>
        </Stack>
    )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/study/study-code-review-view.test.tsx`
Expected: PASS — all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/study/study-code-review-view.tsx src/components/study/study-code-review-view.test.tsx
git commit -m "feat: add StudyCodeReviewView with header buttons and file table"
```

---

## Task 8: Refactor `StudyCodePanel` as a router + thread `studyTitle` through

**Files:**

- Modify: `src/components/study/study-code-panel.tsx`
- Modify: `src/components/study/study-code.tsx`
- Modify: `src/app/[orgSlug]/study/[studyId]/code/code-upload.tsx`
- Modify: `src/app/[orgSlug]/study/[studyId]/code/page.tsx`

- [ ] **Step 1: Replace the `StudyCodePanel` body**

Replace the entire contents of `src/components/study/study-code-panel.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Paper, Skeleton, Stack, Text, Title } from '@mantine/core'
import { useIDEFiles } from '@/hooks/use-ide-files'
import { highlightLanguageForFile } from '@/lib/languages'
import { CodeViewer } from '@/components/code-viewer'
import { AppModal } from '@/components/modal'
import { StudyCodeEmptyView } from './study-code-empty-view'
import { StudyCodeReviewView } from './study-code-review-view'

function FilePreviewModal({ file, onClose }: { file: { name: string; contents: string } | null; onClose: () => void }) {
    if (!file) return null
    return (
        <AppModal isOpen onClose={onClose} title={file.name} size="xl" styles={{ body: { padding: 0 } }}>
            <CodeViewer code={file.contents} language={highlightLanguageForFile(file.name)} />
        </AppModal>
    )
}

export type StudyCodeIDE = ReturnType<typeof useIDEFiles>

interface StudyCodePanelProps {
    ide: StudyCodeIDE
    stepLabel?: string
    studyTitle: string
    footer: ReactNode
}

export const StudyCodePanel = ({ ide, stepLabel, studyTitle, footer }: StudyCodePanelProps) => {
    let body: ReactNode
    if (ide.isLoadingFiles) {
        body = <Skeleton height={240} radius="md" />
    } else if (ide.showEmptyState) {
        body = (
            <StudyCodeEmptyView
                launchWorkspace={ide.launchWorkspace}
                isLaunching={ide.isLaunching}
                launchError={ide.launchError}
                uploadFiles={ide.uploadFiles}
                isUploading={ide.isUploading}
                starterFiles={ide.starterFiles}
            />
        )
    } else {
        body = (
            <StudyCodeReviewView
                launchWorkspace={ide.launchWorkspace}
                isLaunching={ide.isLaunching}
                launchError={ide.launchError}
                uploadFiles={ide.uploadFiles}
                isUploading={ide.isUploading}
                files={ide.fileDetails}
                mainFile={ide.mainFile}
                setMainFile={ide.setMainFile}
                removeFile={ide.removeFile}
                viewFile={ide.viewFile}
                jobCreatedAt={ide.jobCreatedAt}
            />
        )
    }

    return (
        <>
            <Paper p="xl">
                <Stack gap="sm">
                    {stepLabel && (
                        <Text fz="sm" fw={700} c="gray.7">
                            {stepLabel}
                        </Text>
                    )}
                    <Title order={4}>Study code</Title>
                    <Text size="sm" c="dimmed">
                        Title: {studyTitle}
                    </Text>
                </Stack>
                {body}
            </Paper>

            {footer}

            <FilePreviewModal file={ide.viewingFile} onClose={ide.closeFileViewer} />
        </>
    )
}
```

- [ ] **Step 2: Update `StudyCode` to require `studyTitle`**

Edit `src/components/study/study-code.tsx`:

```tsx
'use client'

import type { Route } from 'next'
import { useIDEFiles } from '@/hooks/use-ide-files'
import { Button, Group, Stack, Text } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink } from '@/components/links'
import { StudyCodePanel } from './study-code-panel'

interface StudyCodeProps {
    studyId: string
    studyTitle: string
    previousHref: Route
    onSubmitSuccess?: () => void
}

export const StudyCode = ({ studyId, studyTitle, previousHref, onSubmitSuccess }: StudyCodeProps) => {
    const ide = useIDEFiles({ studyId, onSubmitSuccess })

    const footer = (
        <Group mt="xxl" justify="space-between" w="100%">
            <ButtonLink href={previousHref} size="md" variant="subtle" leftSection={<CaretLeftIcon />}>
                Previous
            </ButtonLink>
            <Stack align="flex-end" gap="xs">
                {ide.submitDisabledReason && (
                    <Text size="sm" c="dimmed">
                        {ide.submitDisabledReason}
                    </Text>
                )}
                <Button
                    variant="primary"
                    disabled={!ide.canSubmit}
                    loading={ide.isDirectSubmitting}
                    onClick={ide.submitDirectly}
                >
                    Submit code
                </Button>
            </Stack>
        </Group>
    )

    return <StudyCodePanel ide={ide} stepLabel="STEP 4 of 4" studyTitle={studyTitle} footer={footer} />
}
```

- [ ] **Step 3: Update `CodeUploadPage` to forward the title**

Edit `src/app/[orgSlug]/study/[studyId]/code/code-upload.tsx`:

```tsx
'use client'

import type { Route } from 'next'
import { StudyCode } from '@/components/study/study-code'

interface CodeUploadPageProps {
    studyId: string
    studyTitle: string
    previousHref: Route
}

export function CodeUploadPage({ studyId, studyTitle, previousHref }: CodeUploadPageProps) {
    return <StudyCode studyId={studyId} studyTitle={studyTitle} previousHref={previousHref} />
}
```

- [ ] **Step 4: Update `page.tsx` to pass the title**

Edit `src/app/[orgSlug]/study/[studyId]/code/page.tsx`. Inside the `<CodeUploadPage>` JSX, add `studyTitle={result.title}`:

```tsx
<CodeUploadPage
    studyId={studyId}
    studyTitle={result.title}
    previousHref={
        result.status === 'APPROVED'
            ? Routes.studyAgreements({ orgSlug, studyId })
            : Routes.studyEdit({ orgSlug, studyId })
    }
/>
```

- [ ] **Step 5: Verify type-check and lint pass**

Run: `pnpm tsc --noEmit`
Expected: no errors.

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/study/study-code-panel.tsx src/components/study/study-code.tsx \
  src/app/[orgSlug]/study/[studyId]/code/code-upload.tsx \
  src/app/[orgSlug]/study/[studyId]/code/page.tsx
git commit -m "refactor: split study code panel into empty and review views"
```

---

## Task 9: Update existing `study-code.test.tsx` integration tests

**Files:**

- Modify: `src/components/study/study-code.test.tsx`

The existing test file assumes the old behavior (auto-pick main file, `getByDisplayValue`, "Upload or edit files" heading, "Drop files here to upload" empty state). Update each assertion to match the new UI.

- [ ] **Step 1: Update `renderIDE` to pass `studyTitle`**

Around line 66, change:

```tsx
renderWithProviders(<StudyCode studyId={study.id} previousHref={previousHref} />)
```

To:

```tsx
renderWithProviders(<StudyCode studyId={study.id} studyTitle={study.title} previousHref={previousHref} />)
```

Also update the two other `renderWithProviders(<StudyCode .../>)` sites in the file (inside `renderWithCodeEnv` and the "session timeout regression" test) the same way.

- [ ] **Step 2: Update the empty-state test**

Replace the `it('renders the empty state...')` block with:

```tsx
it('renders the empty state when the workspace has no files', async () => {
    await renderIDE()

    await waitFor(() => {
        expect(screen.getByRole('button', { name: /launch ide/i })).toBeInTheDocument()
        expect(screen.getByText(/upload your files/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /submit code/i })).toBeDisabled()
    })
})
```

- [ ] **Step 3: Update the "renders workspace files and selects the suggested main file" test**

Rename and rewrite it to reflect the no-auto-pick behavior:

```tsx
it('renders workspace files with no main file selected by default', async () => {
    await renderIDE('openstax-lab', {
        'main.r': 'print("main")',
        'helper.r': 'print("helper")',
    })

    await waitFor(() => {
        expect(screen.getByText('main.r')).toBeInTheDocument()
        expect(screen.getByText('helper.r')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /submit code/i })).toBeDisabled()
    })

    expect(screen.getByText('Main file')).toBeInTheDocument()
    expect(screen.getByText('File name')).toBeInTheDocument()

    const stars = screen.getAllByRole('radio')
    expect(stars).toHaveLength(2)
    expect(stars[0]).toHaveAttribute('aria-checked', 'false')
    expect(stars[1]).toHaveAttribute('aria-checked', 'false')
})
```

- [ ] **Step 4: Update the "updates the selected main file" test**

```tsx
it('selects a main file when the star is clicked', async () => {
    const user = userEvent.setup()
    await renderIDE('openstax-lab', {
        'main.r': 'print("main")',
        'helper.r': 'print("helper")',
    })

    await waitFor(() => {
        expect(screen.getByText('helper.r')).toBeInTheDocument()
    })

    const stars = screen.getAllByRole('radio')
    await user.click(stars[0])
    expect(stars[0]).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
})
```

- [ ] **Step 5: Update the submission tests to click a star first**

The three submission tests (`submits IDE files and persists study job records`, `submits a single file as main`, and the session-timeout regression test) all currently rely on auto-selection. They must now click a star before submitting.

Example rewrite for `submits IDE files and persists study job records`:

```tsx
it('submits IDE files and persists study job records', async () => {
    const user = userEvent.setup()
    const { study } = await renderIDE('openstax-lab', {
        'main.R': 'print("main")',
        'helper.R': 'print("helper")',
    })

    await waitFor(() => {
        expect(screen.getByText('main.R')).toBeInTheDocument()
    })

    const stars = screen.getAllByRole('radio')
    await user.click(stars[0]) // select main.R as main file

    await waitFor(() => {
        expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: /submit code/i }))

    await waitFor(async () => {
        const updated = await db
            .selectFrom('study')
            .select(['status'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updated.status).toBe('PENDING-REVIEW')
    })

    await expectStudyJobRecords(study.id, [
        { name: 'main.R', fileType: 'MAIN-CODE' },
        { name: 'helper.R', fileType: 'SUPPLEMENTAL-CODE' },
    ])

    expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'green', title: 'Study Code Submitted' }),
    )
})
```

Apply the same pattern (click star before submit) to `submits a single file as main` and the regression test. The star order matches the `files` list order; in the regression test (`main.R` + `helper.R`), `stars[0]` is `main.R`.

- [ ] **Step 6: Remove the `auto-selects first file when no suggestedMain matches` test**

That behavior no longer exists. Delete the whole `it('auto-selects first file when no suggestedMain matches', ...)` block (lines ~195-224 in the original).

- [ ] **Step 7: Update the starter-code tests**

Replace the three starter-code tests to target the new UI. The "starter code download chips" test should check for the inline anchor in the empty view; the two submit-gating tests should click a star before asserting enabled/disabled submit:

```tsx
it('shows the inline starter code link when available', async () => {
    await renderWithCodeEnv()

    await waitFor(() => {
        const link = screen.getByRole('link', { name: /starter code/i })
        expect(link).toHaveAttribute('href', expect.stringContaining('mock-s3-url'))
    })
})

it('disables submit when starter file has not been modified since IDE launch', async () => {
    const user = userEvent.setup()
    await renderWithCodeEnv({ 'main.R': 'print("starter")' }, { backdate: false })

    await waitFor(() => {
        expect(screen.getAllByText('main.R').length).toBeGreaterThan(0)
    })

    const stars = screen.getAllByRole('radio')
    await user.click(stars[0])

    await waitFor(() => {
        expect(screen.getByRole('button', { name: /submit code/i })).toBeDisabled()
        expect(screen.getByText('Modify a file or upload new ones before submitting')).toBeInTheDocument()
    })
})

it('enables submit when files are newer than baseline job', async () => {
    const user = userEvent.setup()
    await renderWithCodeEnv({
        'main.R': 'print("starter")',
        'helper.R': 'print("helper")',
    })

    await waitFor(() => {
        expect(screen.getAllByText('main.R').length).toBeGreaterThan(0)
        expect(screen.getByText('helper.R')).toBeInTheDocument()
    })

    const stars = screen.getAllByRole('radio')
    await user.click(stars[0])

    await waitFor(() => {
        expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
    })
})
```

- [ ] **Step 8: Run the full suite**

Run: `npx vitest run src/components/study/study-code.test.tsx`
Expected: PASS — all tests.

- [ ] **Step 9: Commit**

```bash
git add src/components/study/study-code.test.tsx
git commit -m "test: update StudyCode integration tests for redesigned upload screen"
```

---

## Task 10: Run the full check suite and manually verify in the browser

**Files:** none modified.

- [ ] **Step 1: Run the full unit test suite**

Run: `pnpm test:unit` (or the project's configured command; check `package.json` — try `pnpm run test` if the named target is different).
Expected: all tests pass.

- [ ] **Step 2: Run lint and type-check**

Run: `pnpm lint && pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Start the dev server and verify both views manually**

Run: `pnpm dev` (in the background; check the local URL shown in logs, typically http://localhost:3000).

Navigate to an existing researcher study's code page. Confirm:

1. Empty state: IDE card on top (violet tint), OR divider, Upload card on bottom. "Launch IDE" button works. Starter code link is present if configured and opens in new tab. Drag-and-drop onto the Upload card uploads.
2. After uploading a file or launching the IDE (and it creates files): the view flips to the header-buttons + table layout. "Edit files in IDE" and "Upload files" header buttons both work.
3. Clicking the star in the Main file column toggles selection; Submit enables only with a star selected AND filesChanged.
4. Delete the last file → view flips back to the empty state.
5. Long filenames truncate with ellipsis and show the full name on hover.

Report any unresolved issues. If UI verification can't be performed (e.g., no running Coder backend), explicitly state that rather than claiming success (per CLAUDE.md).

- [ ] **Step 4: Final commit if any polish was needed**

If the manual pass surfaced nothing, skip. Otherwise commit fixes.

```bash
# only if tweaks were needed
git add -A
git commit -m "polish: address manual verification findings"
```

---

## Self-review

- Spec coverage: Router split (Task 8), empty view (Task 6), review view (Task 7), star picker (Task 4), strict main-file requirement (Task 5), starter-code link placement (Task 6), studyTitle threading (Task 8), test updates (Task 9). All spec sections covered.
- Placeholder scan: no TBDs, no "add error handling later," every code step has full code.
- Type consistency: `launchWorkspace`, `isLaunching`, `launchError`, `uploadFiles`, `isUploading`, `files`, `mainFile`, `setMainFile`, `removeFile`, `viewFile`, `jobCreatedAt`, `starterFiles` — names used consistently across all components and match the `useIDEFiles` return shape from `src/hooks/use-ide-files.ts:214-242`.
- One ambiguity resolved inline: spec mentioned "indigo" star color; I used `var(--mantine-color-indigo-6)` / `gray-5` explicitly to avoid guesswork during implementation.

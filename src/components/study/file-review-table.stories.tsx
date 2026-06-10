import type { Story } from '@ladle/react'
import { FileReviewTable } from './file-review-table'
import type { WorkspaceFileInfo } from '@/hooks/use-workspace-files'

// FileReviewTable is fully prop-driven: it takes a list of workspace files, the
// currently-selected main file, and a set of callbacks. No data fetching, so it
// renders cleanly through Ladle's real-theme pipeline with inline fixtures.
const meta = { title: 'Study / File review table' }
export default meta

const noop = () => {}

// A job-created timestamp that sits between the two mtimes below so that files
// modified before it read as "Never" and files modified after it show a date.
const JOB_CREATED_AT = '2026-06-01T12:00:00.000Z'

const typicalFiles: WorkspaceFileInfo[] = [
    { name: 'main.R', size: 4096, mtime: '2026-06-02T09:30:00.000Z' },
    { name: 'helpers.R', size: 1280, mtime: '2026-06-02T09:31:00.000Z' },
    { name: 'data-prep.py', size: 8192, mtime: '2026-06-02T10:15:00.000Z' },
    { name: 'requirements.txt', size: 256, mtime: '2026-05-30T08:00:00.000Z' },
]

export const Default: Story = () => (
    <div style={{ padding: 24 }}>
        <FileReviewTable
            files={typicalFiles}
            mainFile="main.R"
            onMainFileChange={noop}
            onRemoveFile={noop}
            onViewFile={noop}
            jobCreatedAt={JOB_CREATED_AT}
        />
    </div>
)

// No files uploaded yet — only the header and divider render.
export const Empty: Story = () => (
    <div style={{ padding: 24 }}>
        <FileReviewTable
            files={[]}
            mainFile=""
            onMainFileChange={noop}
            onRemoveFile={noop}
            onViewFile={noop}
            jobCreatedAt={JOB_CREATED_AT}
        />
    </div>
)

// A single file that is also the main file.
export const SingleMainFile: Story = () => (
    <div style={{ padding: 24 }}>
        <FileReviewTable
            files={[{ name: 'analysis.R', size: 2048, mtime: '2026-06-02T09:30:00.000Z' }]}
            mainFile="analysis.R"
            onMainFileChange={noop}
            onRemoveFile={noop}
            onViewFile={noop}
            jobCreatedAt={JOB_CREATED_AT}
        />
    </div>
)

const longNameFiles: WorkspaceFileInfo[] = [
    {
        name: 'a-very-long-and-descriptive-analysis-script-for-the-cohort-study-final-v3.R',
        size: 16384,
        mtime: '2026-06-02T11:00:00.000Z',
    },
    {
        name: 'supplemental-data-cleaning-and-imputation-utilities-shared-across-jobs.py',
        size: 9000,
        mtime: '2026-06-02T11:05:00.000Z',
    },
]

// Long file names exercise the truncation + hover tooltip on the file-name cell.
export const LongFileNames: Story = () => (
    <div style={{ padding: 24 }}>
        <FileReviewTable
            files={longNameFiles}
            mainFile="a-very-long-and-descriptive-analysis-script-for-the-cohort-study-final-v3.R"
            onMainFileChange={noop}
            onRemoveFile={noop}
            onViewFile={noop}
            jobCreatedAt={JOB_CREATED_AT}
        />
    </div>
)

// When no job has been created yet, every row's "Last updated" cell shows "Never".
export const NoJobYet: Story = () => (
    <div style={{ padding: 24 }}>
        <FileReviewTable
            files={typicalFiles}
            mainFile="main.R"
            onMainFileChange={noop}
            onRemoveFile={noop}
            onViewFile={noop}
            jobCreatedAt={null}
        />
    </div>
)

// Many rows, none selected as main, with a custom main-file column header.
export const ManyFilesCustomHeader: Story = () => (
    <div style={{ padding: 24 }}>
        <FileReviewTable
            files={Array.from({ length: 12 }, (_, i) => ({
                name: `script-${String(i + 1).padStart(2, '0')}.R`,
                size: 1024 * (i + 1),
                mtime: `2026-06-02T${String(8 + i).padStart(2, '0')}:00:00.000Z`,
            }))}
            mainFile=""
            onMainFileChange={noop}
            onRemoveFile={noop}
            onViewFile={noop}
            jobCreatedAt={JOB_CREATED_AT}
            mainFileColumnHeader="Entry point"
        />
    </div>
)

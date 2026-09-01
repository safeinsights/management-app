import type { Story } from '@ladle/react'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { FileReviewTable } from './file-review-table'
import type { WorkspaceFileInfo } from '@/hooks/use-workspace-files'

const meta = { title: 'Study / File review table', argTypes: pageBackgroundArgTypes }
export default meta

const noop = () => {}

// Sits between the two mtimes below, so earlier files read as "Never" and later ones show a date.
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

export const ManyFiles: Story = () => (
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
        />
    </div>
)

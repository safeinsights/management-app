import type { Story } from '@ladle/react'
import type { LatestJobForStudy } from '@/server/db/queries'
import { SubmittedCodeTableView } from './submitted-code-table-view'

// Stories target the presentational SubmittedCodeTableView (the SubmittedCodeTable
// container owns the preview query + modal, which need app data plumbing).
const meta = { title: 'Tables / Submitted code table' }
export default meta

type CodeFile = LatestJobForStudy['files'][number]
const file = (o: Partial<CodeFile>): CodeFile =>
    ({ name: 'main.r', fileType: 'MAIN-CODE', createdAt: '2026-05-20T14:30:00Z', ...o }) as CodeFile

const noop = () => {}

export const Default: Story = () => (
    <div style={{ padding: 24, maxWidth: 820 }}>
        <SubmittedCodeTableView
            jobId="job-1"
            files={[
                file({ name: 'main.r', fileType: 'MAIN-CODE' }),
                file({ name: 'helpers.r', fileType: 'SUPPLEMENTAL-CODE' }),
                file({ name: 'data-prep.r', fileType: 'SUPPLEMENTAL-CODE' }),
            ]}
            onPreview={noop}
        />
    </div>
)

export const SingleMainFile: Story = () => (
    <div style={{ padding: 24, maxWidth: 820 }}>
        <SubmittedCodeTableView jobId="job-1" files={[file({ name: 'analysis.r' })]} onPreview={noop} />
    </div>
)

export const LongFilenameTruncated: Story = () => (
    <div style={{ padding: 24, maxWidth: 820 }}>
        <SubmittedCodeTableView
            jobId="job-1"
            files={[
                file({
                    name: 'a-very-long-supplemental-code-filename-that-should-truncate-with-a-tooltip-on-hover.r',
                    fileType: 'SUPPLEMENTAL-CODE',
                }),
            ]}
            onPreview={noop}
        />
    </div>
)

export const Empty: Story = () => (
    <div style={{ padding: 24, maxWidth: 820 }}>
        <SubmittedCodeTableView jobId="job-1" files={[]} onPreview={noop} />
    </div>
)

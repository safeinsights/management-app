import type { Story } from '@ladle/react'
import type { ReactNode } from 'react'
import { Group, Stack, Text } from '@mantine/core'
import { Routes } from '@/lib/routes'
import { type FileType, type StudyJobStatus } from '@/database/types'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { StudyDetailsResearcherView } from './study-details-researcher-view'
import { JobResultsStatusMessageView } from './job-results-status-message-view'

// The researcher Study Details page-view (OTTER-538 results stage). StudyDetailsResearcherView
// is presentational; its status body is the real JobResultsStatusMessageView so the production
// copy/branching renders faithfully. JobResults fetches its files via useQuery, so here we pass
// an inert placeholder into the `results` slot (the real container injects <JobResults/>).
const meta = { title: 'Pages / Study details', argTypes: pageBackgroundArgTypes }
export default meta

const STUDY_ID = '11111111-1111-4111-8111-111111111111'
const JOB_ID = '22222222-2222-4222-8222-222222222222'
const ORG_SLUG = 'mars-university-lab'

const previousHref = Routes.studyView({ orgSlug: ORG_SLUG, studyId: STUDY_ID, from: 'code-submission' })

const statusChanges = (statuses: StudyJobStatus[]) => statuses.map((status) => ({ status }))

const files = (fileTypes: FileType[]) => fileTypes.map((fileType) => ({ fileType }))

// Stand-in for the approved-results listing the container injects via <JobResults/>.
const ResultsPlaceholder: ReactNode = (
    <Stack gap="xs">
        <Group gap="xs">
            <Text size="sm" fw={600}>
                Results:
            </Text>
            <Text size="sm" c="blue.7">
                View
            </Text>
            <Text size="sm" c="dimmed">
                |
            </Text>
            <Text size="sm" c="blue.7">
                Download
            </Text>
        </Group>
    </Stack>
)

function StatusBody({ statuses, fileTypes }: { statuses: StudyJobStatus[]; fileTypes: FileType[] }) {
    return (
        <JobResultsStatusMessageView
            statusChanges={statusChanges(statuses)}
            files={files(fileTypes)}
            jobId={JOB_ID}
            studyId={STUDY_ID}
            submittingOrgSlug={ORG_SLUG}
            results={ResultsPlaceholder}
        />
    )
}

// State 1: code submitted, no decision yet — the one-line "results pending" message.
export const AwaitingResults: Story = () => (
    <div style={{ padding: 24 }}>
        <StudyDetailsResearcherView
            studyId={STUDY_ID}
            orgSlug={ORG_SLUG}
            previousHref={previousHref}
            statusMessage={<StatusBody statuses={['CODE-SUBMITTED']} fileTypes={[]} />}
        />
    </div>
)

// State 2: results approved and available — approval message, results View/Download, Resubmit.
export const ResultsReady: Story = () => (
    <div style={{ padding: 24 }}>
        <StudyDetailsResearcherView
            studyId={STUDY_ID}
            orgSlug={ORG_SLUG}
            previousHref={previousHref}
            statusMessage={<StatusBody statuses={['FILES-APPROVED']} fileTypes={['APPROVED-RESULT']} />}
        />
    </div>
)

// State 3: approved code errored — error message, Job ID, Code Run Log View/Download, Resubmit.
export const CodeErrored: Story = () => (
    <div style={{ padding: 24 }}>
        <StudyDetailsResearcherView
            studyId={STUDY_ID}
            orgSlug={ORG_SLUG}
            previousHref={previousHref}
            statusMessage={
                <StatusBody statuses={['FILES-APPROVED', 'JOB-ERRORED']} fileTypes={['APPROVED-CODE-RUN-LOG']} />
            }
        />
    </div>
)

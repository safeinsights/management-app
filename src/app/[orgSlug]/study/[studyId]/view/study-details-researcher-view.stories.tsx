import type { Story } from '@ladle/react'
import type { ReactNode } from 'react'
import { Group, Stack, Text } from '@mantine/core'
import { Routes } from '@/lib/routes'
import { type FileType, type StudyJobStatus } from '@/database/types'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { StudyPageHeader } from '@/components/study/study-page-header'
import type { StepNav } from '@/lib/study-screen'
import { StudyDetailsResearcherView } from './study-details-researcher-view'
import { JobResultsStatusMessageView } from './job-results-status-message-view'

// JobResults fetches its files via useQuery, so the `results` slot gets an inert placeholder here.
const meta = { title: 'Pages / Study details', argTypes: pageBackgroundArgTypes }
export default meta

const STUDY_ID = '11111111-1111-4111-8111-111111111111'
const JOB_ID = '22222222-2222-4222-8222-222222222222'
const ORG_SLUG = 'mars-university-lab'

// The real screen builds this with resolveStepNav; a story only needs a representative shape.
const NAV: StepNav = {
    back: {
        label: 'Previous step',
        href: Routes.studyViewCode({ orgSlug: ORG_SLUG, studyId: STUDY_ID }),
        variant: 'subtle',
        testId: 'cta-previous-step',
    },
    secondary: {
        label: 'Edit code',
        href: Routes.studyResubmit({ orgSlug: ORG_SLUG, studyId: STUDY_ID }),
        variant: 'outline',
        testId: 'cta-edit-code',
    },
    forward: {
        label: 'Back to my studies',
        href: Routes.dashboard,
        variant: 'solid',
        testId: 'cta-back-to-my-studies',
    },
}

const header = (
    <StudyPageHeader
        study={{
            title: 'Reading comprehension cohort analysis',
            submittingLabName: 'Mars University Lab',
            submittedByOrgSlug: ORG_SLUG,
        }}
    />
)

const statusChanges = (statuses: StudyJobStatus[]) => statuses.map((status) => ({ status }))

const files = (fileTypes: FileType[]) => fileTypes.map((fileType) => ({ fileType }))

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
            results={ResultsPlaceholder}
        />
    )
}

export const AwaitingResults: Story = () => (
    <div style={{ padding: 24 }}>
        <StudyDetailsResearcherView
            header={header}
            nav={NAV}
            statusMessage={<StatusBody statuses={['CODE-SUBMITTED']} fileTypes={[]} />}
        />
    </div>
)

export const ResultsReady: Story = () => (
    <div style={{ padding: 24 }}>
        <StudyDetailsResearcherView
            header={header}
            nav={NAV}
            statusMessage={<StatusBody statuses={['FILES-APPROVED']} fileTypes={['APPROVED-RESULT']} />}
        />
    </div>
)

export const CodeErrored: Story = () => (
    <div style={{ padding: 24 }}>
        <StudyDetailsResearcherView
            header={header}
            nav={NAV}
            statusMessage={
                <StatusBody statuses={['FILES-APPROVED', 'JOB-ERRORED']} fileTypes={['APPROVED-CODE-RUN-LOG']} />
            }
        />
    </div>
)

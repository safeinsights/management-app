import type { Story } from '@ladle/react'
import { Stack, Text } from '@mantine/core'
import { ApprovalStatus } from './job-approval-status'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { AllStatus } from '@/lib/types'

// `ApprovalStatus` only reads `job.statusChanges` to find the relevant code/files
// decision, so the fixture is a minimal job cast to the full query type. It renders
// the Approved/Rejected line for the matching status pair, or null when absent.
const meta = { title: 'Study / Job approval status' }
export default meta

const createdAt = new Date('2026-05-14T12:00:00Z')

const jobWith = (statuses: AllStatus[]): LatestJobForStudy =>
    ({ statusChanges: statuses.map((status) => ({ status, createdAt })) }) as unknown as LatestJobForStudy

const codeApproved = jobWith(['CODE-APPROVED'])
const codeRejected = jobWith(['CODE-REJECTED'])
const filesApproved = jobWith(['FILES-APPROVED'])
const filesRejected = jobWith(['FILES-REJECTED'])
const noDecision = jobWith(['CODE-SUBMITTED', 'JOB-RUNNING'])

export const CodeDecisions: Story = () => (
    <Stack p="xl" align="flex-start" gap="lg">
        <ApprovalStatus job={codeApproved} orgSlug="openstax" type="code" />
        <ApprovalStatus job={codeRejected} orgSlug="openstax" type="code" />
        <Text size="xs" c="dimmed">
            (no code decision yet — renders nothing)
        </Text>
        <ApprovalStatus job={noDecision} orgSlug="openstax" type="code" />
    </Stack>
)

export const FilesDecisions: Story = () => (
    <Stack p="xl" align="flex-start" gap="lg">
        <ApprovalStatus job={filesApproved} orgSlug="openstax" type="files" />
        <ApprovalStatus job={filesRejected} orgSlug="openstax" type="files" />
    </Stack>
)

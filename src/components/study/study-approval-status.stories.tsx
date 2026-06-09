import type { Story } from '@ladle/react'
import { Stack } from '@mantine/core'
import StudyApprovalStatus from './study-approval-status'

// Only the APPROVED and REJECTED study statuses render; every other status (and a
// missing date) returns null, so those cases intentionally show nothing.
const meta = { title: 'Study / StudyApprovalStatus' }
export default meta

const date = new Date('2026-05-14T12:00:00Z')

export const States: Story = () => (
    <Stack p="xl" align="flex-start" gap="lg">
        <StudyApprovalStatus status="APPROVED" date={date} />
        <StudyApprovalStatus status="REJECTED" date={date} />
    </Stack>
)

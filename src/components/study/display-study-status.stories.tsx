import type { Story } from '@ladle/react'
import type { FC } from 'react'
import { Stack, Text } from '@mantine/core'
import { DisplayStudyStatus } from './display-study-status'
import { REVIEWER_STATUS_LABELS, RESEARCHER_STATUS_LABELS, type StatusLabel } from '@/lib/status-labels'

// Renders the real status pill for every status value the app defines, separately
// for each audience. Each pill carries its real tooltip — hover to read the copy.
const meta = { title: 'Study / Display study status' }
export default meta

type Entry = { key: string; label: StatusLabel }

const toEntries = (labels: Partial<Record<string, StatusLabel>>): Entry[] =>
    Object.entries(labels).map(([key, label]) => ({ key, label: label as StatusLabel }))

const StatusColumn: FC<{ entries: Entry[] }> = ({ entries }) => (
    <Stack p="xl" align="flex-start" gap="md">
        {entries.map(({ key, label }) => (
            <Stack key={key} gap={4} align="flex-start">
                <Text size="xs" c="dimmed" ff="monospace">
                    {key} — stage: {label.stage}
                </Text>
                <DisplayStudyStatus status={label} />
            </Stack>
        ))}
    </Stack>
)

export const AllStatusesReviewer: Story = () => <StatusColumn entries={toEntries(REVIEWER_STATUS_LABELS)} />

export const AllStatusesResearcher: Story = () => <StatusColumn entries={toEntries(RESEARCHER_STATUS_LABELS)} />

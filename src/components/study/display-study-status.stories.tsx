import type { Story } from '@ladle/react'
import type { FC } from 'react'
import { Stack, Text } from '@mantine/core'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { DisplayStudyStatus } from './display-study-status'
import { PILL_PRESENTATION, resolvePillPresentation, type PillContext, type PillId } from '@/lib/status-labels'

const meta = { title: 'Study / Display study status', argTypes: pageBackgroundArgTypes }
export default meta

const NAMES = { dataPartner: 'Openstax', researchLab: 'Openstax Lab' }
const ids = Object.keys(PILL_PRESENTATION) as PillId[]

const StatusColumn: FC<{ role: PillContext['role'] }> = ({ role }) => (
    <Stack p="xl" align="flex-start" gap="md">
        {ids.map((id) => (
            <Stack key={id} gap={4} align="flex-start">
                <Text size="xs" c="dimmed" ff="monospace">
                    {id}
                </Text>
                <DisplayStudyStatus status={resolvePillPresentation(id, { role, ...NAMES })} />
            </Stack>
        ))}
    </Stack>
)

export const AllStatusesReviewer: Story = () => <StatusColumn role="reviewer" />

export const AllStatusesResearcher: Story = () => <StatusColumn role="researcher" />

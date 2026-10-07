import { type FC } from 'react'
import { Group, HoverCard, Text } from '@mantine/core'
import { InfoIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import type { WorkspaceFileActivitySummary } from '@/hooks/use-workspace-files'
import { semanticColor } from '@/theme/tokens'

const MAIN_FILE_HOVER_CARD =
    'It is the file that runs first in the secure enclave. It can call other files in your study. Select your main file before submitting.'

const NO_ACTIVITY = 'No activity yet'

const ACTION_LABELS: Record<WorkspaceFileActivitySummary['action'], string> = {
    UPLOADED: 'Uploaded',
    EDITED_IN_IDE: 'Edited in IDE',
}

export const MAIN_FILE_COLUMN_WIDTH = 108

/** `{researcherName} · {action} · {MMM DD, YYYY}, {hh:mm am/pm}` per the card. */
const formatActivity = (activity: WorkspaceFileActivitySummary) =>
    [
        activity.actorName,
        ACTION_LABELS[activity.action],
        dayjs(activity.createdAt).format('MMM DD, YYYY, hh:mm a'),
    ].join(' · ')

export const LastActivityCell: FC<{ activity: WorkspaceFileActivitySummary | null | undefined }> = ({ activity }) => (
    <Text size="sm" c={semanticColor('text.secondary')}>
        {activity ? formatActivity(activity) : NO_ACTIVITY}
    </Text>
)

export const MainFileColumnHeader: FC = () => (
    <Group gap="xxs" wrap="nowrap" align="center">
        <Text component="span" inherit>
            Main file
        </Text>
        <HoverCard width={280} withArrow shadow="md" position="top">
            <HoverCard.Target>
                <Text component="span" display="inline-flex" aria-label="Main file info">
                    <InfoIcon size={14} aria-hidden />
                </Text>
            </HoverCard.Target>
            <HoverCard.Dropdown>
                <Text size="sm">{MAIN_FILE_HOVER_CARD}</Text>
            </HoverCard.Dropdown>
        </HoverCard>
    </Group>
)

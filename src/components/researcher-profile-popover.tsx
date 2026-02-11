'use client'

import { forwardRef, type FC } from 'react'
import {
    ActionIcon,
    Badge,
    Button,
    Divider,
    Group,
    Pill,
    Popover,
    Skeleton,
    Stack,
    Text,
    type FloatingPosition,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
    ArrowSquareOut,
    BookOpen,
    Certificate,
    ChalkboardTeacher,
    Info,
    SuitcaseSimple,
    XCircle,
} from '@phosphor-icons/react'
import { useResearcherPopoverProfile } from '@/hooks/use-researcher-popover-profile'
import { Routes } from '@/lib/routes'

interface ResearcherProfilePopoverProps {
    userId: string
    studyId: string
    orgSlug: string
    name: string
    position?: FloatingPosition
    withArrow?: boolean
    offset?: number
    arrowSize?: number
}

const PopoverAffiliation: FC<{ value?: string | null }> = ({ value }) => {
    if (!value) return null
    return (
        <Group gap="xs" align="center" wrap="nowrap">
            <ChalkboardTeacher size={20} />
            <Text size="sm" fw={600}>
                {value}
            </Text>
        </Group>
    )
}

const PopoverPositionTitle: FC<{ value?: string | null }> = ({ value }) => {
    if (!value) return null
    return (
        <Group gap="xs" align="center" wrap="nowrap">
            <SuitcaseSimple size={20} />
            <Text size="sm" fw={600}>
                {value}
            </Text>
        </Group>
    )
}

const PopoverEducation: FC<{ degree?: string | null }> = ({ degree }) => {
    if (!degree) return null

    return (
        <Group gap="xs" align="center" wrap="nowrap">
            <Certificate size={20} />
            <Text size="sm" fw={600}>
                {degree}
            </Text>
        </Group>
    )
}

const ResearchInterestsPills: FC<{ interests: string[] }> = ({ interests }) => {
    if (interests.length === 0) return null

    const pills = interests.map((interest, idx) => (
        <Pill key={`${interest}-${idx}`} size="sm">
            {interest}
        </Pill>
    ))

    return (
        <Group gap="xs" align="center" wrap="nowrap">
            <BookOpen size={20} />
            <Group gap={4}>{pills}</Group>
        </Group>
    )
}

const PopoverLinks: FC<{ profileUrl?: string | null; publicationsUrl?: string | null }> = ({
    profileUrl,
    publicationsUrl,
}) => {
    if (!profileUrl && !publicationsUrl) return null

    return (
        <Stack gap="xs">
            <Divider />
            <Text size="sm" fw={600} c="dimmed">
                Professional links
            </Text>
            <Group gap="xs">
                {profileUrl && (
                    <Badge
                        component="a"
                        href={profileUrl}
                        target="_blank"
                        variant="light"
                        color="blue"
                        rightSection={<ArrowSquareOut size={12} />}
                        style={{ cursor: 'pointer' }}
                        tt="none"
                        size="md"
                    >
                        University
                    </Badge>
                )}
                {publicationsUrl && (
                    <Badge
                        component="a"
                        href={publicationsUrl}
                        target="_blank"
                        variant="light"
                        color="blue"
                        rightSection={<ArrowSquareOut size={12} />}
                        style={{ cursor: 'pointer' }}
                        tt="none"
                        size="md"
                    >
                        Publication list
                    </Badge>
                )}
            </Group>
        </Stack>
    )
}

const PopoverContent: FC<{
    userId: string
    studyId: string
    orgSlug: string
    onClose: () => void
}> = ({ userId, studyId, orgSlug, onClose }) => {
    const { data, isLoading, fullName, firstPosition } = useResearcherPopoverProfile(userId, studyId)

    if (isLoading) {
        return (
            <Stack gap="xs">
                <Skeleton height={14} width="60%" />
                <Skeleton height={14} width="80%" />
                <Skeleton height={14} width="40%" />
            </Stack>
        )
    }

    if (!data) {
        return <Text size="sm">Profile not available</Text>
    }

    return (
        <Stack gap="md">
            <Group justify="space-between" align="center" wrap="nowrap">
                <Text fw={700} size="md">
                    {fullName}
                </Text>
                <ActionIcon variant="transparent" color="gray" onClick={onClose} size="sm">
                    <XCircle size={24} weight="fill" />
                </ActionIcon>
            </Group>

            <Stack gap="lg">
                <PopoverAffiliation value={firstPosition?.affiliation} />
                <PopoverEducation degree={data.profile.educationDegree} />
                <PopoverPositionTitle value={firstPosition?.position} />
                <ResearchInterestsPills interests={data.profile.researchInterests} />
            </Stack>

            <PopoverLinks
                profileUrl={firstPosition?.profileUrl}
                publicationsUrl={data.profile.detailedPublicationsUrl}
            />

            <Button
                component="a"
                href={Routes.researcherProfileView({ orgSlug, studyId })}
                target="_blank"
                variant="filled"
                color="blue.7"
                size="md"
                fullWidth
                radius="sm"
            >
                View full profile
            </Button>
        </Stack>
    )
}

const PopoverAnchor = forwardRef<HTMLDivElement, { onMouseEnter: () => void; name: string }>(
    ({ onMouseEnter, name, ...others }, ref) => (
        <Group gap={6} w="fit-content" style={{ cursor: 'pointer' }} onMouseEnter={onMouseEnter} wrap="nowrap">
            <Text size="sm">{name}</Text>
            <div ref={ref} {...others}>
                <Info weight="fill" size={16} color="gray" />
            </div>
        </Group>
    ),
)
PopoverAnchor.displayName = 'PopoverAnchor'

export const ResearcherProfilePopover: FC<ResearcherProfilePopoverProps> = ({
    userId,
    studyId,
    orgSlug,
    name,
    position,
    withArrow = true,
    offset = 8,
    arrowSize = 12,
}) => {
    const [opened, { close, open }] = useDisclosure(false)

    return (
        <Popover
            opened={opened}
            onClose={close}
            onDismiss={close}
            width={420}
            shadow="md"
            position={position}
            withArrow={withArrow}
            offset={offset}
            arrowSize={arrowSize}
            withRoles={false}
            clickOutsideEvents={['mousedown', 'touchstart']}
        >
            <Popover.Target>
                <PopoverAnchor name={name} onMouseEnter={open} />
            </Popover.Target>
            <Popover.Dropdown onMouseLeave={(e) => e.stopPropagation()}>
                <PopoverContent userId={userId} studyId={studyId} orgSlug={orgSlug} onClose={close} />
            </Popover.Dropdown>
        </Popover>
    )
}

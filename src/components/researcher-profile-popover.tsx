'use client'

import { forwardRef, type FC } from 'react'
import {
    ActionIcon,
    Anchor,
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
    ArrowSquareOutIcon,
    BookOpenIcon,
    CertificateIcon,
    ChalkboardTeacherIcon,
    InfoIcon,
    SuitcaseSimpleIcon,
    XCircleIcon,
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
            <ChalkboardTeacherIcon size={20} color="var(--mantine-color-gray-6)" />
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
            <SuitcaseSimpleIcon size={20} color="var(--mantine-color-gray-6)" />
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
            <CertificateIcon size={20} color="var(--mantine-color-gray-6)" />
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
            <BookOpenIcon size={20} color="var(--mantine-color-gray-6)" />
            <Group gap={4}>{pills}</Group>
        </Group>
    )
}

const PopoverLinkBadge: FC<{ url?: string | null; label: string }> = ({ url, label }) => {
    if (!url) return null

    return (
        <Badge
            component="a"
            href={url}
            target="_blank"
            variant="light"
            color="gray"
            rightSection={<ArrowSquareOutIcon size={14} />}
            style={{
                cursor: 'pointer',
                backgroundColor: 'var(--mantine-color-gray-1)',
                color: 'var(--mantine-color-gray-7)',
            }}
            tt="none"
            size="lg"
            radius="xs"
            h={32}
            px="md"
        >
            <Text fw={600} size="sm">
                {label}
            </Text>
        </Badge>
    )
}

const MoreAffiliationsLink: FC<{ count: number; orgSlug: string; studyId: string }> = ({ count, orgSlug, studyId }) => {
    if (count <= 1) return null

    return (
        <Anchor href={Routes.researcherProfileView({ orgSlug, studyId })} target="_blank" size="sm" fw={600}>
            + {count - 1} more current affiliation
        </Anchor>
    )
}

const PopoverLinks: FC<{ profileUrl?: string | null; publicationsUrl?: string | null }> = ({
    profileUrl,
    publicationsUrl,
}) => {
    if (!profileUrl && !publicationsUrl) return null

    return (
        <Stack gap="lg" mt={-8}>
            <Divider />
            <Stack gap="md">
                <Text size="sm" fw={600}>
                    Professional links
                </Text>
                <Group gap="md">
                    <PopoverLinkBadge url={profileUrl} label="University" />
                    <PopoverLinkBadge url={publicationsUrl} label="Publication list" />
                </Group>
            </Stack>
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

    const moreAffiliationsLink =
        data.positions.length > 1 ? (
            <MoreAffiliationsLink count={data.positions.length} orgSlug={orgSlug} studyId={studyId} />
        ) : null

    const viewFullProfileButton = (
        <Button
            component="a"
            href={Routes.researcherProfileView({ orgSlug, studyId })}
            target="_blank"
            variant="filled"
            size="md"
            fullWidth
            radius="sm"
        >
            View full profile
        </Button>
    )

    return (
        <Stack gap="xl">
            <Group justify="space-between" align="center" wrap="nowrap">
                <Text fw={700} size="md">
                    {fullName}
                </Text>
                <ActionIcon variant="transparent" color="gray.5" onClick={onClose} size="sm">
                    <XCircleIcon size={24} weight="fill" />
                </ActionIcon>
            </Group>

            <Stack gap="lg">
                <PopoverAffiliation value={firstPosition?.affiliation} />
                <PopoverPositionTitle value={firstPosition?.position} />
                <PopoverEducation degree={data.profile.educationDegree} />
                <ResearchInterestsPills interests={data.profile.researchInterests} />
                {moreAffiliationsLink}
            </Stack>

            <PopoverLinks
                profileUrl={firstPosition?.profileUrl}
                publicationsUrl={data.profile.detailedPublicationsUrl}
            />

            {viewFullProfileButton}
        </Stack>
    )
}

const PopoverAnchor = forwardRef<HTMLDivElement, { onMouseEnter: () => void; name: string }>(
    ({ onMouseEnter, name, ...others }, ref) => (
        <Group gap={6} w="fit-content" style={{ cursor: 'pointer' }} onMouseEnter={onMouseEnter} wrap="nowrap">
            <Text size="sm">{name}</Text>
            <div ref={ref} {...others}>
                <InfoIcon weight="fill" size={16} color="gray" />
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

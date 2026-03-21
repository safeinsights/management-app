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
    EnvelopeSimpleIcon,
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
    opened?: boolean
    onOpenChange?: (opened: boolean) => void
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
            bg="gray.1"
            c="gray.7"
            style={{ cursor: 'pointer' }}
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

const MoreAffiliationsLink: FC<{ count: number; orgSlug: string; studyId: string; userId: string }> = ({
    count,
    orgSlug,
    studyId,
    userId,
}) => {
    if (count <= 1) return null

    return (
        <Anchor
            href={`${Routes.researcherProfileView({ orgSlug, studyId })}?userId=${userId}`}
            target="_blank"
            size="sm"
            fw={600}
        >
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

const PopoverHeader: FC<{ fullName: string; onClose: () => void }> = ({ fullName, onClose }) => (
    <Group justify="space-between" align="center" wrap="nowrap">
        <Text fw={700} size="md" mt="xs">
            {fullName}
        </Text>
        <ActionIcon variant="transparent" color="gray.5" onClick={onClose} size="sm">
            <XCircleIcon size={24} weight="fill" />
        </ActionIcon>
    </Group>
)

const MinimalPopoverContent: FC<{ fullName: string; email: string; onClose: () => void }> = ({
    fullName,
    email,
    onClose,
}) => (
    <Stack gap="xl">
        <PopoverHeader fullName={fullName} onClose={onClose} />
        <Group gap="xs" align="center" wrap="nowrap">
            <EnvelopeSimpleIcon size={20} color="var(--mantine-color-gray-6)" />
            <Text size="sm" fw={600}>
                {email}
            </Text>
        </Group>
        <Text size="sm" c="dimmed">
            This user has no detailed profile information
        </Text>
    </Stack>
)

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

    const { profile } = data

    if (!profile) {
        return <MinimalPopoverContent fullName={fullName} email={data.user.email ?? ''} onClose={onClose} />
    }

    const profileUrl = `${Routes.researcherProfileView({ orgSlug, studyId })}?userId=${userId}`

    const viewFullProfileButton = (
        <Button component="a" href={profileUrl} target="_blank" variant="filled" size="md" fullWidth radius="sm">
            View full profile
        </Button>
    )

    return (
        <Stack gap="xl">
            <PopoverHeader fullName={fullName} onClose={onClose} />

            <Stack gap="lg">
                <PopoverAffiliation value={firstPosition?.affiliation} />
                <PopoverPositionTitle value={firstPosition?.position} />
                <PopoverEducation degree={profile.educationDegree} />
                <ResearchInterestsPills interests={profile.researchInterests} />
                <MoreAffiliationsLink
                    count={data.positions.length}
                    orgSlug={orgSlug}
                    studyId={studyId}
                    userId={userId}
                />
            </Stack>

            <PopoverLinks profileUrl={firstPosition?.profileUrl} publicationsUrl={profile.detailedPublicationsUrl} />

            {viewFullProfileButton}
        </Stack>
    )
}

const PopoverAnchor = forwardRef<HTMLDivElement, { onMouseEnter: () => void; name: string }>(
    ({ onMouseEnter, name, ...others }, ref) => (
        <Group gap={6} w="fit-content" style={{ cursor: 'pointer' }} onMouseEnter={onMouseEnter} wrap="nowrap">
            <Text size="sm">{name}</Text>
            <div
                ref={ref}
                {...others}
                style={{ display: 'flex', color: 'gray' }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--mantine-color-charcoal-5)'
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'gray'
                }}
            >
                <InfoIcon weight="fill" size={16} color="currentColor" />
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
    opened: controlledOpened,
    onOpenChange,
}) => {
    // Supports both controlled (parent manages state) and uncontrolled (self-managed) modes.
    // Controlled mode allows a parent to coordinate multiple popovers so only one is open at a time.
    const isControlled = controlledOpened !== undefined
    const [internalOpened, { close: internalClose, open: internalOpen }] = useDisclosure(false)
    const opened = isControlled ? controlledOpened : internalOpened

    const open = () => (isControlled ? onOpenChange?.(true) : internalOpen())
    const close = () => (isControlled ? onOpenChange?.(false) : internalClose())

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
            <Popover.Dropdown onMouseLeave={(e) => e.stopPropagation()} p="lg">
                <PopoverContent userId={userId} studyId={studyId} orgSlug={orgSlug} onClose={close} />
            </Popover.Dropdown>
        </Popover>
    )
}

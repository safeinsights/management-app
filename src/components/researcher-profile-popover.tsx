'use client'

import { type FC, type ReactNode } from 'react'
import { Anchor, Group, HoverCard, Pill, Skeleton, Stack, Text, type FloatingPosition } from '@mantine/core'
import { useResearcherPopoverProfile } from '@/hooks/use-researcher-popover-profile'
import { Link } from '@/components/links'
import { Routes } from '@/lib/routes'

interface ResearcherProfilePopoverProps {
    userId: string
    studyId: string
    orgSlug: string
    children: ReactNode
    position?: FloatingPosition
    withArrow?: boolean
    offset?: number
    arrowSize?: number
}

const PopoverAffiliation: FC<{ value?: string | null }> = ({ value }) => {
    if (!value) return null
    return (
        <Text size="xs" c="dimmed">
            {value}
        </Text>
    )
}

const PopoverPositionTitle: FC<{ value?: string | null }> = ({ value }) => {
    if (!value) return null
    return (
        <Text size="xs" c="dimmed">
            {value}
        </Text>
    )
}

const PopoverPosition: FC<{ affiliation?: string | null; position?: string | null }> = ({ affiliation, position }) => {
    if (!affiliation && !position) return null

    return (
        <>
            <PopoverAffiliation value={affiliation} />
            <PopoverPositionTitle value={position} />
        </>
    )
}

const PopoverEducation: FC<{ degree?: string | null }> = ({ degree }) => {
    if (!degree) return null

    return (
        <Text size="xs" c="dimmed">
            {degree}
        </Text>
    )
}

const ResearchInterestsPills: FC<{ interests: string[] }> = ({ interests }) => {
    if (interests.length === 0) return null

    const pills = interests.map((interest, idx) => (
        <Pill key={`${interest}-${idx}`} size="xs">
            {interest}
        </Pill>
    ))

    return <Group gap={4}>{pills}</Group>
}

const PopoverProfileLink: FC<{ url?: string | null }> = ({ url }) => {
    if (!url) return null
    return (
        <Anchor href={url} target="_blank" size="xs">
            Profile page
        </Anchor>
    )
}

const PopoverPublicationsLink: FC<{ url?: string | null }> = ({ url }) => {
    if (!url) return null
    return (
        <Anchor href={url} target="_blank" size="xs">
            Publications
        </Anchor>
    )
}

const PopoverLinks: FC<{ profileUrl?: string | null; publicationsUrl?: string | null }> = ({
    profileUrl,
    publicationsUrl,
}) => {
    if (!profileUrl && !publicationsUrl) return null

    return (
        <>
            <PopoverProfileLink url={profileUrl} />
            <PopoverPublicationsLink url={publicationsUrl} />
        </>
    )
}

const PopoverContent: FC<{ userId: string; studyId: string; orgSlug: string }> = ({ userId, studyId, orgSlug }) => {
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
        <Stack gap="xs">
            <Text fw={600} size="sm">
                {fullName}
            </Text>

            <PopoverPosition affiliation={firstPosition?.affiliation} position={firstPosition?.position} />
            <PopoverEducation degree={data.profile.educationDegree} />
            <ResearchInterestsPills interests={data.profile.researchInterests} />
            <PopoverLinks
                profileUrl={firstPosition?.profileUrl}
                publicationsUrl={data.profile.detailedPublicationsUrl}
            />

            <Link href={Routes.researcherProfileView({ orgSlug, studyId })} target="_blank" size="xs" c="blue.7">
                View full profile
            </Link>
        </Stack>
    )
}

export const ResearcherProfilePopover: FC<ResearcherProfilePopoverProps> = ({
    userId,
    studyId,
    orgSlug,
    children,
    position,
    withArrow = true,
    offset,
    arrowSize,
}) => {
    return (
        <HoverCard
            width={300}
            shadow="md"
            openDelay={300}
            position={position}
            withArrow={withArrow}
            offset={offset}
            arrowSize={arrowSize}
        >
            <HoverCard.Target>{children}</HoverCard.Target>
            <HoverCard.Dropdown>
                <PopoverContent userId={userId} studyId={studyId} orgSlug={orgSlug} />
            </HoverCard.Dropdown>
        </HoverCard>
    )
}

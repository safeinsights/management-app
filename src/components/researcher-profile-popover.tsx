'use client'

import { type FC, type ReactNode } from 'react'
import { Anchor, Group, HoverCard, Pill, Skeleton, Stack, Text } from '@mantine/core'
import { useResearcherPopoverProfile } from '@/hooks/use-researcher-popover-profile'
import { Link } from '@/components/links'
import { Routes } from '@/lib/routes'

interface ResearcherProfilePopoverProps {
    userId: string
    studyId: string
    orgSlug: string
    children: ReactNode
}

const PopoverPosition: FC<{ affiliation?: string | null; position?: string | null }> = ({ affiliation, position }) => {
    if (!affiliation && !position) return null

    return (
        <>
            {affiliation && (
                <Text size="xs" c="dimmed">
                    {affiliation}
                </Text>
            )}
            {position && (
                <Text size="xs" c="dimmed">
                    {position}
                </Text>
            )}
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

const PopoverLinks: FC<{ profileUrl?: string | null; publicationsUrl?: string | null }> = ({
    profileUrl,
    publicationsUrl,
}) => {
    if (!profileUrl && !publicationsUrl) return null

    return (
        <>
            {profileUrl && (
                <Anchor href={profileUrl} target="_blank" size="xs">
                    Profile page
                </Anchor>
            )}
            {publicationsUrl && (
                <Anchor href={publicationsUrl} target="_blank" size="xs">
                    Publications
                </Anchor>
            )}
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

export const ResearcherProfilePopover: FC<ResearcherProfilePopoverProps> = ({ userId, studyId, orgSlug, children }) => {
    return (
        <HoverCard width={300} shadow="md" openDelay={300}>
            <HoverCard.Target>{children}</HoverCard.Target>
            <HoverCard.Dropdown>
                <PopoverContent userId={userId} studyId={studyId} orgSlug={orgSlug} />
            </HoverCard.Dropdown>
        </HoverCard>
    )
}

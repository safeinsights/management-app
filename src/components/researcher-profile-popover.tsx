'use client'

import { type FC, type ReactNode } from 'react'
import { Anchor, Group, HoverCard, Pill, Skeleton, Stack, Text } from '@mantine/core'
import { useQuery } from '@/common'
import { getResearcherProfileByUserIdAction } from '@/server/actions/researcher-profile.actions'
import { Link } from '@/components/links'
import { Routes } from '@/lib/routes'
import { isActionError } from '@/lib/errors'

interface ResearcherProfilePopoverProps {
    userId: string
    studyId: string
    orgSlug: string
    children: ReactNode
}

const PopoverContent: FC<{ userId: string; studyId: string; orgSlug: string }> = ({ userId, studyId, orgSlug }) => {
    const { data, isLoading } = useQuery({
        queryKey: ['researcher-profile', userId],
        queryFn: () => getResearcherProfileByUserIdAction({ userId, studyId }),
    })

    if (isLoading) {
        return (
            <Stack gap="xs">
                <Skeleton height={14} width="60%" />
                <Skeleton height={14} width="80%" />
                <Skeleton height={14} width="40%" />
            </Stack>
        )
    }

    if (!data || isActionError(data)) {
        return <Text size="sm">Profile not available</Text>
    }

    const fullName = [data.user.firstName, data.user.lastName].filter(Boolean).join(' ')
    const firstPosition = data.positions[0]

    return (
        <Stack gap="xs">
            <Text fw={600} size="sm">
                {fullName}
            </Text>

            {firstPosition?.affiliation && (
                <Text size="xs" c="dimmed">
                    {firstPosition.affiliation}
                </Text>
            )}

            {data.profile.educationDegree && (
                <Text size="xs" c="dimmed">
                    {data.profile.educationDegree}
                </Text>
            )}

            {firstPosition?.position && (
                <Text size="xs" c="dimmed">
                    {firstPosition.position}
                </Text>
            )}

            {data.profile.researchInterests.length > 0 && (
                <Group gap={4}>
                    {data.profile.researchInterests.map((interest, idx) => (
                        <Pill key={`${interest}-${idx}`} size="xs">
                            {interest}
                        </Pill>
                    ))}
                </Group>
            )}

            {firstPosition?.profileUrl && (
                <Anchor href={firstPosition.profileUrl} target="_blank" size="xs">
                    Profile page
                </Anchor>
            )}

            {data.profile.detailedPublicationsUrl && (
                <Anchor href={data.profile.detailedPublicationsUrl} target="_blank" size="xs">
                    Publications
                </Anchor>
            )}

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

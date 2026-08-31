'use client'

import { StudiesTable } from '@/components/dashboard/studies-table'
import { JoinedOrgBanner } from '@/components/dashboard/joined-org-banner'
import { DashboardHeaderSkeleton, TableSkeleton } from '@/components/layout/skeleton/dashboard'
import { useInvitationNotices } from '@/hooks/use-invitation-notices'
import { useSession } from '@/hooks/session'
import { Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import type { Route } from 'next'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

type Audience = 'researcher' | 'reviewer'

function getAudienceFromQuery(audience: string | null): Audience | null {
    if (audience === 'researcher' || audience === 'reviewer') return audience
    return null
}

export default function UserStudiesDashboard() {
    const { session } = useSession()
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    useInvitationNotices()

    const hasMultipleOrgTypes = session ? new Set(Object.values(session.orgs).map((o) => o.type)).size > 1 : false
    const showTabs = hasMultipleOrgTypes
    const defaultTab: Audience = !hasMultipleOrgTypes && session?.belongsToEnclave ? 'reviewer' : 'researcher'
    const audienceFromQuery = getAudienceFromQuery(searchParams.get('audience'))
    const activeTab = audienceFromQuery ?? defaultTab

    const onAudienceChange = (value: string) => {
        const nextAudience = getAudienceFromQuery(value)
        if (!nextAudience) return

        const params = new URLSearchParams(searchParams.toString())
        params.set('audience', nextAudience)
        router.replace(`${pathname}?${params.toString()}` as Route)
    }

    if (!session) {
        return (
            <Stack p="xxl" gap="xxl">
                <DashboardHeaderSkeleton />
                <Paper shadow="xs" p="xl">
                    <TableSkeleton paperWrapper={false} />
                </Paper>
            </Stack>
        )
    }

    const audience = showTabs ? activeTab : defaultTab

    return (
        <Stack p="xxl" gap="xxl">
            <Title order={1}>My dashboard</Title>
            <JoinedOrgBanner />
            <Text>Welcome to your personal dashboard! Here, you can track the status of all your studies.</Text>

            <Paper shadow="xs" p="xl">
                <StudiesTable
                    audience={audience}
                    scope="user"
                    orgSlug=""
                    title="My studies"
                    showRefresher
                    headerActions={
                        showTabs ? (
                            <SegmentedControl
                                value={activeTab}
                                onChange={onAudienceChange}
                                data={[
                                    { label: 'Reviewer', value: 'reviewer' },
                                    { label: 'Researcher', value: 'researcher' },
                                ]}
                            />
                        ) : undefined
                    }
                />
            </Paper>
        </Stack>
    )
}

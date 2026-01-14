'use client'

import { StudiesTable } from '@/components/dashboard/studies-table'
import { DashboardHeaderSkeleton, TableSkeleton } from '@/components/layout/skeleton/dashboard'
import { useInvitationNotices } from '@/hooks/use-invitation-notices'
import { useSession } from '@/hooks/session'
import { Flex, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'

export default function UserStudiesDashboard() {
    const { session } = useSession()
    useInvitationNotices()

    const showTabs = session?.belongsToEnclave && session?.belongsToLab
    const defaultTab = session?.belongsToEnclave ? 'reviewer' : 'researcher'
    const [activeTab, setActiveTab] = useState<'researcher' | 'reviewer'>(defaultTab)

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
    const isResearcher = audience === 'researcher'

    return (
        <Stack p="xxl" gap="xxl">
            <Title order={1}>My dashboard</Title>
            <Text>Welcome to your personal dashboard! Here, you can track the status of all your studies.</Text>

            <Paper shadow="xs" p="xl">
                {showTabs && (
                    <Flex justify="flex-end" align="center">
                        <SegmentedControl
                            value={activeTab}
                            onChange={(value) => setActiveTab(value as 'researcher' | 'reviewer')}
                            mb="xl"
                            data={[
                                { label: 'Reviewer', value: 'reviewer' },
                                { label: 'Researcher', value: 'researcher' },
                            ]}
                        />
                    </Flex>
                )}

                <StudiesTable
                    audience={audience}
                    scope="user"
                    orgSlug=""
                    title="My studies"
                    description={
                        !isResearcher
                            ? "Review all the studies submitted to your organizations. Studies that need your attention will be labeled 'Needs review'."
                            : undefined
                    }
                    showNewStudyButton={isResearcher}
                    showRefresher
                />
            </Paper>
        </Stack>
    )
}

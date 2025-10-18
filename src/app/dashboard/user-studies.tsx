'use client'

import { ResearcherUserStudiesTable } from '@/components/dashboard/researcher-user-studies-table'
import { ReviewerUserStudiesTable } from '@/components/dashboard/reviewer-user-studies-table'
import { useSession } from '@/hooks/session'
import { getEnclaveOrg, getLabOrg } from '@/lib/types'
import { Flex, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'

export default function UserStudiesDashboard() {
    const { session } = useSession()
    const [activeTab, setActiveTab] = useState<'researcher' | 'reviewer'>('reviewer')

    if (!session) return null

    // Determine the org types the user belongs to
    const hasLabOrg = Boolean(getLabOrg(session))
    const hasDataOrg = Boolean(getEnclaveOrg(session))

    const renderTable = () => {
        if (hasLabOrg && hasDataOrg) {
            return activeTab === 'reviewer' ? <ReviewerUserStudiesTable /> : <ResearcherUserStudiesTable />
        }

        if (hasDataOrg) return <ReviewerUserStudiesTable />
        if (hasLabOrg) return <ResearcherUserStudiesTable />
    }

    return (
        <Stack p="xxl" gap="xxl">
            <Title order={1} mb="sm">
                My dashboard
            </Title>
            <Text>Welcome to your personal dashboard! Here, you can track the status of all your studies.</Text>

            <Paper shadow="xs" p="xl">
                {hasLabOrg && hasDataOrg && (
                    <Flex justify="flex-end" align="center" mb="sm">
                        <SegmentedControl
                            value={activeTab}
                            onChange={(value) => setActiveTab(value as 'researcher' | 'reviewer')}
                            size="sm"
                            data={[
                                { label: 'Reviewer', value: 'reviewer' },
                                { label: 'Researcher', value: 'researcher' },
                            ]}
                        />
                    </Flex>
                )}

                {renderTable()}
            </Paper>
        </Stack>
    )
}

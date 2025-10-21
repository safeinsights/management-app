'use client'

import { ResearcherUserStudiesTable } from '@/components/dashboard/researcher-user-studies-table'
import { ReviewerUserStudiesTable } from '@/components/dashboard/reviewer-user-studies-table'
import { useSession } from '@/hooks/session'
import { Flex, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'

export default function UserStudiesDashboard() {
    const { session } = useSession()
    const [activeTab, setActiveTab] = useState<'researcher' | 'reviewer'>(
        session?.belongsToEnclave ? 'reviewer' : 'researcher',
    )

    if (!session) return null

    const renderTable = () => {
        if (session.belongsToEnclave && session.belongsToLab) {
            return activeTab === 'reviewer' ? <ReviewerUserStudiesTable /> : <ResearcherUserStudiesTable />
        }

        if (session.belongsToEnclave) return <ReviewerUserStudiesTable />
        if (session.belongsToLab) return <ResearcherUserStudiesTable />
    }

    return (
        <Stack p="xxl" gap="xxl">
            <Title order={1} mb="sm">
                My dashboard
            </Title>
            <Text>Welcome to your personal dashboard! Here, you can track the status of all your studies.</Text>

            <Paper shadow="xs" p="xl">
                <Flex justify="flex-end" align="center">
                    {session.belongsToEnclave && session.belongsToLab ? (
                        <SegmentedControl
                            value={activeTab}
                            onChange={(value) => setActiveTab(value as 'researcher' | 'reviewer')}
                            data={[
                                { label: 'Reviewer', value: 'reviewer' },
                                { label: 'Researcher', value: 'researcher' },
                            ]}
                        />
                    ) : null}
                </Flex>

                {renderTable()}
            </Paper>
        </Stack>
    )
}

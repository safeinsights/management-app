'use client'

import { ResearcherStudiesTable } from '@/components/dashboard/researcher-table'
import { UserName } from '@/components/user-name'
import { useSession } from '@/hooks/session'
import { Flex, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'
import { ReviewerUserStudiesTable } from './user-tables/reviewer-user-studies-table'

export default function UserStudiesDashboard() {
    const { session } = useSession()
    const [activeTab, setActiveTab] = useState<'researcher' | 'reviewer'>('researcher')

    if (!session) return null

    return (
        <Stack p="xxl" gap="xxl">
            <Title order={1} mb="sm">
                <UserName />
                &apos;s dashboard
            </Title>
            <Text>
                Welcome to your dashboard. Here, you can view the status of all your studies across different teams and
                organizations, and stay informed about upcoming tasks and deadlines. We&apos;re always working to
                enhance your experience, so your feedback is greatly appreciated.
            </Text>

            <Paper shadow="xs" p="xl">
                <Flex justify="flex-end" align="center">
                    <SegmentedControl
                        value={activeTab}
                        onChange={(value) => setActiveTab(value as 'researcher' | 'reviewer')}
                        data={[
                            { label: 'Researcher', value: 'researcher' },
                            { label: 'Reviewer', value: 'reviewer' },
                        ]}
                    />
                </Flex>

                {activeTab === 'researcher' ? <ResearcherStudiesTable /> : <ReviewerUserStudiesTable />}
            </Paper>
        </Stack>
    )
}

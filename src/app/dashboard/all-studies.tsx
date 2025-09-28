'use client'

import { ResearcherStudiesTable } from '@/components/dashboard/researcher-table'
import { ReviewerStudiesTable } from '@/components/dashboard/reviewer-table'
import { UserName } from '@/components/user-name'
import { useSession } from '@/hooks/session'
import { Flex, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'

export default function AllStudiesDashboard() {
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

            <Flex justify="space-between" align="center" mb="md">
                <SegmentedControl
                    value={activeTab}
                    onChange={(value) => setActiveTab(value as 'researcher' | 'reviewer')}
                    data={[
                        { label: 'Researcher', value: 'researcher' },
                        { label: 'Reviewer', value: 'reviewer' },
                    ]}
                />
            </Flex>

            {activeTab === 'researcher' ? (
                <ResearcherStudiesTable />
            ) : (
                <Paper shadow="xs" p="xl">
                    <ReviewerStudiesTable />
                </Paper>
            )}
        </Stack>
    )
}

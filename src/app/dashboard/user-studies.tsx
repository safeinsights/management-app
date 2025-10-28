'use client'

import { ResearcherUserStudiesTable } from '@/components/dashboard/researcher-user-studies-table'
import { ReviewerUserStudiesTable } from '@/components/dashboard/reviewer-user-studies-table'
import { useSession } from '@/hooks/session'
import { Flex, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { Route } from 'next'

export default function UserStudiesDashboard() {
    const { session } = useSession()
    const router = useRouter()
    const searchParams = useSearchParams()
    const pathname = usePathname()
    const skippedOrg = searchParams.get('skip')
    const declinedOrg = searchParams.get('decline')
    const [activeTab, setActiveTab] = useState<'researcher' | 'reviewer'>(
        session?.belongsToEnclave ? 'reviewer' : 'researcher',
    )

    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString())
        if (skippedOrg) {
            notifications.show({
                id: 'skip-invitation',
                color: 'green',
                message: `You have opted to skip the invitation to ${skippedOrg}. The invitation can be found in your inbox and is valid for 7 days.`,
            })
            params.delete('skip')
        }
        if (declinedOrg) {
            notifications.show({
                id: 'decline-invitation',
                color: 'green',
                message: `You've declined ${declinedOrg}'s invitation.`,
            })
            params.delete('decline')
        }

        router.replace(`${pathname}?${params.toString()}` as Route)
    }, [skippedOrg, declinedOrg, pathname, searchParams, router])

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
            <Title order={1}>My dashboard</Title>
            <Text>Welcome to your personal dashboard! Here, you can track the status of all your studies.</Text>

            <Paper shadow="xs" p="xl">
                <Flex justify="flex-end" align="center">
                    {session.belongsToEnclave && session.belongsToLab ? (
                        <SegmentedControl
                            value={activeTab}
                            onChange={(value) => setActiveTab(value as 'researcher' | 'reviewer')}
                            mb="sm"
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

import * as React from 'react'
import {
    Alert,
    Button,
    Flex,
    Group,
    Paper,
    Stack,
    Table,
    TableCaption,
    TableTbody,
    TableTd,
    TableTh,
    TableThead,
    TableTr,
    Text,
    Title,
    Tooltip,
} from '@mantine/core'
import dayjs from 'dayjs'
import Link from 'next/link'
import { Plus } from '@phosphor-icons/react/dist/ssr'
import { getUserIdFromActionContext } from '@/server/actions/wrappers'
import { ensureUserIsMemberOfOrg } from '@/server/mutations'
import { ErrorAlert } from '@/components/errors'
import { fetchStudiesForCurrentResearcherAction } from '@/server/actions/study.actions'
import { DisplayStudyStatus } from '../../member/[memberIdentifier]/dashboard/display-study-status'
import { UserName } from '@/components/user-name'

export const dynamic = 'force-dynamic'

const NoStudiesCaption: React.FC<{ visible: boolean; slug: string }> = ({ visible, slug }) => {
    if (!visible) return null

    return (
        <TableCaption>
            <Alert variant="transparent">
                You haven&apos;t started a study yet
                <Stack>
                    <Link style={{ textDecoration: 'underline' }} href={`/researcher/study/request/${slug}`}>
                        Propose New Study
                    </Link>
                </Stack>
            </Alert>
        </TableCaption>
    )
}

export default async function ResearcherDashboardPage(): Promise<React.ReactElement> {
    const userId = await getUserIdFromActionContext()
    let org: { identifier: string } | null = null
    // FIXME: it should be possible to remove this once we ensure all users have an org
    try {
        org = await ensureUserIsMemberOfOrg()
    } catch {
        return <ErrorAlert error="Your account is not configured correctly. No organizations found" />
    }
    const { studies } = await fetchStudiesForCurrentResearcherAction(userId)

    const rows = studies.map((study) => (
        <TableTr key={study.id}>
            <TableTd>
                <Tooltip label={study.title}>
                    <Text lineClamp={2} style={{ cursor: 'pointer' }}>
                        {study.title}
                    </Text>
                </Tooltip>
            </TableTd>
            <TableTd>
                <Text>{dayjs(study.createdAt).format('MMM DD, YYYY')}</Text>
            </TableTd>
            <TableTd>{study.reviewerTeamName}</TableTd>
            <TableTd>
                <Stack gap="xs">
                    <DisplayStudyStatus studyStatus={study.status} jobStatus={study.latestJobStatus} />
                </Stack>
            </TableTd>
            <TableTd>
                <Link style={{ textDecoration: 'underline' }} href={`/researcher/study/${study.id}/review`}>
                    View
                </Link>
            </TableTd>
        </TableTr>
    ))

    return (
        <Stack p="md">
            <Title>
                Hi <UserName />!
            </Title>
            <Stack>
                <Text>
                    <strong>Welcome to SafeInsights!</strong> This is your dashboard. Here, you can submit new research
                    proposals, view their status and access its details. We continuously iterate to improve your
                    experience and welcome your feedback.
                </Text>
            </Stack>

            <Paper shadow="xs" p="xl">
                <Stack>
                    <Group justify="space-between">
                        <Title order={3}>Proposed Studies</Title>
                        <Flex justify="flex-end">
                            <Link href={`/researcher/study/request/${org.identifier}`}>
                                <Button leftSection={<Plus />}>Propose New Study</Button>
                            </Link>
                        </Flex>
                    </Group>
                    <Table layout="fixed" verticalSpacing="md" striped highlightOnHover>
                        <NoStudiesCaption visible={!studies.length} slug={org.identifier} />
                        <TableThead>
                            <TableTr>
                                <TableTh>Study Name</TableTh>
                                <TableTh>Submitted On</TableTh>
                                <TableTh>Submitted To</TableTh>
                                <TableTh>Status</TableTh>
                                <TableTh>Study Details</TableTh>
                            </TableTr>
                        </TableThead>
                        <TableTbody>{rows}</TableTbody>
                    </Table>
                </Stack>
            </Paper>
        </Stack>
    )
}

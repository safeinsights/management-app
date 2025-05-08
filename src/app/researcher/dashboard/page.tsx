import * as React from 'react'
import {
    Alert,
    Anchor,
    Button,
    Divider,
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
import { ensureUserIsMemberOfOrg } from '@/server/mutations'
import { ErrorAlert } from '@/components/errors'
import { fetchStudiesForCurrentResearcherAction } from '@/server/actions/study.actions'
import { UserName } from '@/components/user-name'
import { DisplayStudyStatus } from '@/components/study/display-study-status'

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
    let org: { slug: string } | null = null
    // FIXME: it should be possible to remove this once we ensure all users have an org
    try {
        org = await ensureUserIsMemberOfOrg()
    } catch {
        return <ErrorAlert error="Your account is not configured correctly. No organizations found" />
    }
    const studies = await fetchStudiesForCurrentResearcherAction()

    const rows = studies.map((study) => (
        <TableTr fz="md" key={study.id}>
            <TableTd>
                <Tooltip label={study.title}>
                    <Text lineClamp={2} style={{ cursor: 'pointer' }}>
                        {study.title}
                    </Text>
                </Tooltip>
            </TableTd>
            <TableTd>{dayjs(study.createdAt).format('MMM DD, YYYY')}</TableTd>
            <TableTd>{study.reviewerTeamName}</TableTd>
            <TableTd>
                <DisplayStudyStatus
                    studyStatus={study.status}
                    jobStatus={study.latestJobStatus}
                    jobId={study.latestStudyJobId}
                />
            </TableTd>
            <TableTd>
                <Anchor component={Link} href={`/researcher/study/${study.id}/review`}>
                    View
                </Anchor>
            </TableTd>
        </TableTr>
    ))

    return (
        <Stack p="xl">
            <Title order={1}>
                Hi <UserName />!
            </Title>
            <Group gap="sm">
                <Title order={4}>Welcome to SafeInsights!</Title>
                <Text>
                    This is your dashboard. Here, you can submit new research proposals, view their status and access
                    its details. We continuously iterate to improve your experience and welcome your feedback.
                </Text>
            </Group>
            <Paper shadow="xs" p="xl">
                <Stack>
                    <Group justify="space-between">
                        <Title order={3}>Proposed Studies</Title>
                        <Flex justify="flex-end">
                            <Link href={`/researcher/study/request/${org.slug}`}>
                                <Button leftSection={<Plus />}>Propose New Study</Button>
                            </Link>
                        </Flex>
                    </Group>
                    <Divider c="charcoal.1" />
                    <Text>Review submitted studies and check status below. </Text>
                    <Table layout="fixed" verticalSpacing="md" striped highlightOnHover stickyHeader>
                        <NoStudiesCaption visible={!studies.length} slug={org.slug} />
                        <TableThead fz="sm" bg="charcoal.1">
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

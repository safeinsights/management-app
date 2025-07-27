import * as React from 'react'
import {
    Alert,
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
    TableScrollContainer,
} from '@mantine/core'
import dayjs from 'dayjs'

import { fetchStudiesForCurrentResearcherAction } from '@/server/actions/study.actions'
import { UserName } from '@/components/user-name'
import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { ButtonLink, Link } from '@/components/links'
import { PlusIcon } from '@phosphor-icons/react/dist/ssr'
import { sessionFromClerk } from '@/server/clerk'
import { ErrorAlert } from '@/components/errors'

export const dynamic = 'force-dynamic'

const NewStudyLink: React.FC<{ orgSlug: string }> = ({ orgSlug }) => {
    return (
        <ButtonLink data-testid="new-study" leftSection={<PlusIcon />} href={`/researcher/study/request/${orgSlug}`}>
            Propose New Study
        </ButtonLink>
    )
}

const NoStudiesCaption: React.FC<{ visible: boolean; slug: string }> = ({ visible, slug }) => {
    if (!visible) return null

    return (
        <TableCaption>
            <Alert variant="transparent">
                You haven&apos;t started a study yet
                <Stack>
                    <NewStudyLink orgSlug={slug} />
                </Stack>
            </Alert>
        </TableCaption>
    )
}

export default async function ResearcherDashboardPage(): Promise<React.ReactElement> {
    const studies = await fetchStudiesForCurrentResearcherAction()
    const session = await sessionFromClerk()

    if (!session) {
        return <ErrorAlert error="Your account is not configured correctly. No organizations found" />
    }

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
                <DisplayStudyStatus studyStatus={study.status} jobStatus={study.latestJobStatus} />
            </TableTd>
            <TableTd>
                <Link href={`/researcher/study/${study.id}/review`}>View</Link>
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
                            <NewStudyLink orgSlug={session.team.slug} />
                        </Flex>
                    </Group>
                    <Divider c="charcoal.1" />
                    <TableScrollContainer minWidth={768}>
                        <Table layout="fixed" verticalSpacing="md" striped="even" highlightOnHover stickyHeader>
                            <NoStudiesCaption visible={!studies.length} slug={session.team.slug} />
                            <TableThead fz="sm">
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
                    </TableScrollContainer>
                </Stack>
            </Paper>
        </Stack>
    )
}

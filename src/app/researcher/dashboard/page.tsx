import * as React from 'react'
import {
    Divider,
    Flex,
    Group,
    Paper,
    Stack,
    Table,
    TableTbody,
    TableTd,
    TableTh,
    TableThead,
    TableTr,
    Text,
    Title,
} from '@mantine/core'
import dayjs from 'dayjs'

import { fetchStudiesForCurrentResearcherAction } from '@/server/actions/study.actions'
import { UserName } from '@/components/user-name'
import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { ButtonLink, Link } from '@/components/links'
import { PlusIcon } from '@phosphor-icons/react/dist/ssr'
import { sessionFromClerk } from '@/server/clerk'
import { ErrorAlert } from '@/components/errors'
import { isActionError, errorToString } from '@/lib/errors'
export const dynamic = 'force-dynamic'

const NewStudyLink: React.FC<{ orgSlug: string }> = ({ orgSlug }) => {
    return (
        <ButtonLink data-testid="new-study" leftSection={<PlusIcon />} href={`/researcher/study/request/${orgSlug}`}>
            Propose New Study
        </ButtonLink>
    )
}

const NoStudiesRow: React.FC<{ slug: string }> = ({ slug }) => (
    <TableTr>
        <TableTd colSpan={5}>
            <Stack align="center" gap="md" p="md">
                <Text>You haven&apos;t started a study yet</Text>
                <NewStudyLink orgSlug={slug} />
            </Stack>
        </TableTd>
    </TableTr>
)

export default async function ResearcherDashboardPage(): Promise<React.ReactElement> {
    const session = await sessionFromClerk()

    if (!session) {
        return <ErrorAlert error="Your account is not configured correctly. No organizations found" />
    }

    const studies = await fetchStudiesForCurrentResearcherAction()
    if (!studies || isActionError(studies)) {
        return <ErrorAlert error={`Failed to load studies: ${errorToString(studies)}`} />
    }

    const rows = studies.map((study) => (
        <TableTr fz="md" key={study.id}>
            <TableTd>{study.title}</TableTd>
            <TableTd>{dayjs(study.createdAt).format('MMM DD, YYYY')}</TableTd>
            <TableTd>{study.reviewerTeamName}</TableTd>
            <TableTd>
                <DisplayStudyStatus
                    studyStatus={study.status}
                    audience="researcher"
                    jobStatusChanges={study.jobStatusChanges}
                />
            </TableTd>
            <TableTd>
                <Link
                    href={`/researcher/study/${study.id}/review`}
                    aria-label={`View details for study ${study.title}`}
                >
                    View
                </Link>
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
                    <Table layout="fixed" verticalSpacing="md" striped="even" highlightOnHover stickyHeader>
                        <TableThead fz="sm">
                            <TableTr>
                                <TableTh>Study Name</TableTh>
                                <TableTh>Submitted On</TableTh>
                                <TableTh>Submitted To</TableTh>
                                <TableTh>Status</TableTh>
                                <TableTh>Study Details</TableTh>
                            </TableTr>
                        </TableThead>
                        <TableTbody>{studies.length > 0 ? rows : <NoStudiesRow slug={session.team.slug} />}</TableTbody>
                    </Table>
                </Stack>
            </Paper>
        </Stack>
    )
}

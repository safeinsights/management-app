'use client'

import * as React from 'react'
import {
    Text,
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
    Title,
} from '@mantine/core'
import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'

import { fetchStudiesForCurrentResearcherAction } from '@/server/actions/study.actions'
import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { ButtonLink, Link } from '@/components/links'
import { PlusIcon } from '@phosphor-icons/react/dist/ssr'
import { useSession } from '@/hooks/session'
import { ErrorAlert } from '@/components/errors'
import { isActionError, errorToString } from '@/lib/errors'

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

export const StudiesTable: React.FC = () => {
    const { data: studies, isLoading } = useQuery({
        queryKey: ['researcher-studies'],
        queryFn: () => fetchStudiesForCurrentResearcherAction(),
    })
    const { session } = useSession()

    if (!session || isLoading) return null

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
        <Paper shadow="xs" p="xl">
            <Stack>
                <Group justify="space-between">
                    <Title order={3}>Proposed Studies</Title>
                    <Flex justify="flex-end">
                        <NewStudyLink orgSlug={session.team.slug} />
                    </Flex>
                </Group>
                <Divider c="charcoal.1" />
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
            </Stack>
        </Paper>
    )
}

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
import { useQuery } from '@/common'
import { fetchStudiesForCurrentResearcherAction } from '@/server/actions/study.actions'
import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { ButtonLink, Link } from '@/components/links'
import { PlusIcon } from '@phosphor-icons/react/dist/ssr'
import { useSession } from '@/hooks/session'
import { ErrorAlert } from '@/components/errors'
import { isActionError, errorToString } from '@/lib/errors'
import { getStudyStage } from '@/lib/util'
import { getLabOrg } from '@/lib/types'

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
    const labOrg = session ? getLabOrg(session) : null

    if (!session || !labOrg || isLoading) return null

    if (!studies || isActionError(studies)) {
        return <ErrorAlert error={`Failed to load studies: ${errorToString(studies)}`} />
    }

    const rows = studies.map((study) => (
        <TableTr fz="md" key={study.id} bg={study.status === 'APPROVED' ? '#EAD4FC80' : undefined}>
            <TableTd>{study.title}</TableTd>
            <TableTd>{dayjs(study.createdAt).format('MMM DD, YYYY')}</TableTd>
            <TableTd>{study.reviewerTeamName}</TableTd>
            <TableTd>{getStudyStage(study.status, 'researcher')}</TableTd>
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
        <Paper shadow="xs" p="xxl">
            <Stack>
                <Group justify="space-between">
                    <Title order={3}>Proposed Studies</Title>
                    <Flex justify="flex-end">
                        <NewStudyLink orgSlug={labOrg.slug} />
                    </Flex>
                </Group>
                <Divider c="charcoal.1" />
                <Table layout="fixed" verticalSpacing="md" striped="even" highlightOnHover stickyHeader>
                    <TableThead>
                        <TableTr>
                            <TableTh fw={600}>Study Name</TableTh>
                            <TableTh fw={600}>Submitted On</TableTh>
                            <TableTh fw={600}>Submitted To</TableTh>
                            <TableTh fw={600}>Stage</TableTh>
                            <TableTh fw={600}>Status</TableTh>
                            <TableTh fw={600}>Study Details</TableTh>
                        </TableTr>
                    </TableThead>
                    <TableTbody>{studies.length > 0 ? rows : <NoStudiesRow slug={labOrg.slug} />}</TableTbody>
                </Table>
            </Stack>
        </Paper>
    )
}

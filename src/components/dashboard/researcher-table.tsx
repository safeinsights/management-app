'use client'

import { useQuery } from '@/common'
import { ErrorAlert } from '@/components/errors'
import { ButtonLink, Link } from '@/components/links'
import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { useSession } from '@/hooks/session'
import { errorToString } from '@/lib/errors'
import { getLabOrg, ActionSuccessType } from '@/lib/types'
import { fetchStudiesForOrgAction } from '@/server/actions/study.actions'

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
import { PlusIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { useParams } from 'next/navigation'
import * as React from 'react'
import { useStudyStatus } from '@/hooks/use-study-status'

type Studies = ActionSuccessType<typeof fetchStudiesForOrgAction>

const NewStudyLink: React.FC<{ orgSlug: string }> = ({ orgSlug }) => {
    return (
        <ButtonLink data-testid="new-study" leftSection={<PlusIcon />} href={`/${orgSlug}/study/request`}>
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

const StudyRow: React.FC<{ study: Studies[number]; orgSlug: string }> = ({ study, orgSlug }) => {
    const status = useStudyStatus({
        studyStatus: study.status,
        audience: 'researcher',
        jobStatusChanges: study.jobStatusChanges,
    })

    return (
        <TableTr fz={14} key={study.id} bg={study.status === 'APPROVED' ? '#EAD4FC80' : undefined}>
            <TableTd>{study.title}</TableTd>
            <TableTd>{dayjs(study.createdAt).format('MMM DD, YYYY')}</TableTd>
            <TableTd>{study.reviewingEnclaveName}</TableTd>
            <TableTd>{status.stage}</TableTd>
            <TableTd>
                <DisplayStudyStatus status={status} />
            </TableTd>
            <TableTd>
                <Link href={`/${orgSlug}/study/${study.id}/view`} aria-label={`View details for study ${study.title}`}>
                    View
                </Link>
            </TableTd>
        </TableTr>
    )
}

export const ResearcherStudiesTable: React.FC = () => {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const {
        data: studies = [],
        isLoading,
        isError,
    } = useQuery({
        queryKey: ['researcher-studies', orgSlug],
        placeholderData: [],
        queryFn: () => fetchStudiesForOrgAction({ orgSlug }),
    })
    const { session } = useSession()
    const labOrg = session ? session.orgs[orgSlug] || getLabOrg(session) : null

    if (!session || !labOrg || isLoading) return null

    if (isError) {
        return <ErrorAlert error={`Failed to load studies: ${errorToString(studies)}`} />
    }

    const rows = studies.map((study) => <StudyRow key={study.id} study={study} orgSlug={labOrg.slug} />)

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
                    <TableTbody>{rows.length > 0 ? rows : <NoStudiesRow slug={labOrg.slug} />}</TableTbody>
                </Table>
            </Stack>
        </Paper>
    )
}

'use client'

import { ActionReturnType } from '@/lib/types'
import dayjs from 'dayjs'
import { fetchStudiesForOrgAction } from '@/server/actions/study.actions'
import { DisplayStudyStatus } from '@/components/study/display-study-status'
import {
    Divider,
    Stack,
    Title,
    Table,
    TableTbody,
    TableTd,
    TableTh,
    TableThead,
    TableTr,
    Text,
    Tooltip,
    Flex,
} from '@mantine/core'
import { FC } from 'react'
import { Link } from '@/components/links'
import { useQuery } from '@tanstack/react-query'
import { StudyJobStatus } from '@/database/types'
import { Refresher } from '@/components/refresher'

type Studies = ActionReturnType<typeof fetchStudiesForOrgAction>

const Row: FC<{ study: Studies[number]; orgSlug: string }> = ({ study, orgSlug }) => {
    return (
        <TableTr key={study.id}>
            <TableTd>
                <Tooltip label={study.title}>
                    <Text lineClamp={2} style={{ cursor: 'pointer' }}>
                        {study.title}
                    </Text>
                </Tooltip>
            </TableTd>
            <TableTd>{dayjs(study.createdAt).format('MMM DD, YYYY')}</TableTd>
            <TableTd>{study.researcherName}</TableTd>
            <TableTd>{study.reviewerName}</TableTd>
            <TableTd>
                <DisplayStudyStatus
                    studyStatus={study.status}
                    jobStatus={study.latestJobStatus}
                    jobId={study.latestStudyJobId}
                />
            </TableTd>
            <TableTd>
                <Link href={`/reviewer/${orgSlug}/study/${study.id}/review`} c="blue.7">
                    View
                </Link>
            </TableTd>
        </TableTr>
    )
}

const FINAL_STATUS: StudyJobStatus[] = ['CODE-REJECTED', 'JOB-ERRORED', 'FILES-APPROVED', 'FILES-REJECTED']

export const StudiesTable: FC<{ studies: Studies; orgSlug: string }> = ({ studies: initialStudies, orgSlug }) => {
    const {
        data: studies,
        refetch,
        isRefetching,
    } = useQuery({
        enabled: false,
        initialData: initialStudies,
        queryKey: ['org-studies', orgSlug],
        queryFn: async () => await fetchStudiesForOrgAction({ orgSlug }),
    })

    if (!studies.length) return <Title order={5}>You have no studies to review.</Title>

    const needsRefreshed = !!studies.find((s) => !FINAL_STATUS.includes(s.latestJobStatus || 'INITIATED'))

    return (
        <Stack>
            <Flex justify={'space-between'} align={'center'}>
                <Title order={3}>Review Studies</Title>
                <Refresher isEnabled={needsRefreshed} refresh={refetch} isPending={isRefetching} />
            </Flex>
            <Divider c="charcoal.1" />
            <Table layout="fixed" verticalSpacing="md" striped="even" highlightOnHover stickyHeader>
                <TableThead>
                    <TableTr>
                        <TableTh fw={600}>Study Name</TableTh>
                        <TableTh fw={600}>Submitted On</TableTh>
                        <TableTh fw={600}>Submitted By</TableTh>
                        <TableTh fw={600}>Reviewed By</TableTh>
                        <TableTh fw={600}>Status</TableTh>
                        <TableTh fw={600}>Details</TableTh>
                    </TableTr>
                </TableThead>
                <TableTbody>
                    {studies.map((study) => (
                        <Row key={study.id} study={study} orgSlug={orgSlug} />
                    ))}
                </TableTbody>
            </Table>
        </Stack>
    )
}

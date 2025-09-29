'use client'

import { useQuery } from '@/common'
import { Link } from '@/components/links'
import { Refresher } from '@/components/refresher'
import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { StudyJobStatus } from '@/database/types'
import { ActionSuccessType } from '@/lib/types'
import { getStudyStage } from '@/lib/util'
import { fetchStudiesForOrgAction } from '@/server/actions/study.actions'
import {
    Divider,
    Flex,
    Stack,
    Table,
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
import { FC } from 'react'

type Studies = ActionSuccessType<typeof fetchStudiesForOrgAction>

const Row: FC<{ study: Studies[number]; orgSlug: string }> = ({ study, orgSlug }) => {
    return (
        <TableTr fz={14} key={study.id} bg={study.status === 'PENDING-REVIEW' ? '#EAD4FC80' : undefined}>
            <TableTd>
                <Tooltip label={study.title}>
                    <Text lineClamp={2} style={{ cursor: 'pointer' }}>
                        {study.title}
                    </Text>
                </Tooltip>
            </TableTd>
            <TableTd>{dayjs(study.createdAt).format('MMM DD, YYYY')}</TableTd>
            <TableTd>{study.createdBy}</TableTd>
            <TableTd>{orgSlug}</TableTd>
            <TableTd>{getStudyStage(study.status, 'reviewer')}</TableTd>
            <TableTd>
                <DisplayStudyStatus
                    audience="reviewer"
                    studyStatus={study.status}
                    jobStatusChanges={study.jobStatusChanges || []}
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

export const ReviewerStudiesTable: FC<{ studies: Studies; orgSlug: string }> = ({
    studies: initialStudies,
    orgSlug,
}) => {
    const {
        data: studies,
        refetch,
        isRefetching,
    } = useQuery({
        initialData: initialStudies,
        queryKey: ['org-studies', orgSlug],
        queryFn: async () => await fetchStudiesForOrgAction({ orgSlug }),
    })

    // Handle case where studies might be undefined or an error
    if (!studies?.length) return <Title order={5}>You have no studies to review.</Title>

    const needsRefreshed = studies.some((study) =>
        study.jobStatusChanges.some((change) => !FINAL_STATUS.includes(change.status)),
    )

    return (
        <Stack>
            <Flex justify={'space-between'} align={'center'}>
                <Title order={3}>Review Studies</Title>
                <Refresher isEnabled={needsRefreshed} refresh={refetch} isPending={isRefetching} />
            </Flex>
            <Divider c="charcoal.1" />
            <Text mb="md">
                Review all the studies submitted to your organization. Studies that need your attention will be labeled
                ‘Needs review’.
            </Text>
            <Table layout="fixed" verticalSpacing="md" striped="even" highlightOnHover stickyHeader>
                <TableThead>
                    <TableTr>
                        <TableTh fw={600}>Study Name</TableTh>
                        <TableTh fw={600}>Submitted On</TableTh>
                        <TableTh fw={600}>Submitted By</TableTh>
                        <TableTh fw={600}>Reviewed By</TableTh>
                        <TableTh fw={600}>Stage</TableTh>
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

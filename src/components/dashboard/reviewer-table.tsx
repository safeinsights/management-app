'use client'

import { useQuery } from '@/common'
import { Link } from '@/components/links'
import { Refresher } from '@/components/refresher'
import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { StudyJobStatus } from '@/database/types'
import { useStudyStatus } from '@/hooks/use-study-status'
import { ActionSuccessType } from '@/lib/types'

import { Routes } from '@/lib/routes'
import { fetchStudiesForOrgAction } from '@/server/actions/study.actions'
import {
    Divider,
    Flex,
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
import { FC } from 'react'
import { InfoTooltip } from '../tooltip'
import { TableSkeleton } from '../layout/skeleton/dashboard'

type Studies = ActionSuccessType<typeof fetchStudiesForOrgAction>

const Row: FC<{ study: Studies[number]; orgSlug: string }> = ({ study, orgSlug }) => {
    const status = useStudyStatus({
        studyStatus: study.status,
        audience: 'reviewer',
        jobStatusChanges: study.jobStatusChanges,
    })

    return (
        <TableTr fz={14} key={study.id} bg={study.status === 'PENDING-REVIEW' ? '#EAD4FC80' : undefined}>
            <TableTd>
                <InfoTooltip label={study.title}>
                    <Text lineClamp={2} style={{ cursor: 'pointer' }} size="sm">
                        {study.title}
                    </Text>
                </InfoTooltip>
            </TableTd>
            <TableTd>{dayjs(study.createdAt).format('MMM DD, YYYY')}</TableTd>
            <TableTd>{study.submittingLabName}</TableTd>
            <TableTd>{orgSlug}</TableTd>
            <TableTd>{status.stage}</TableTd>
            <TableTd>
                <DisplayStudyStatus status={status} />
            </TableTd>
            <TableTd>
                <Link href={Routes.studyReview({ orgSlug, studyId: study.id })} c="blue.7">
                    View
                </Link>
            </TableTd>
        </TableTr>
    )
}

const FINAL_STATUS: StudyJobStatus[] = ['CODE-REJECTED', 'JOB-ERRORED', 'FILES-APPROVED', 'FILES-REJECTED']

export const ReviewerStudiesTable: FC<{ orgSlug: string }> = ({ orgSlug }) => {
    const {
        data: studies,
        refetch,
        isRefetching,
        isFetching,
    } = useQuery({
        placeholderData: [],
        queryKey: ['org-studies', orgSlug],
        queryFn: async () => await fetchStudiesForOrgAction({ orgSlug }),
    })

    if (isFetching && studies?.length === 0) {
        return <TableSkeleton showActionButton={false} />
    }

    // Handle case where studies might be undefined or an error
    if (!studies?.length) return <Title order={5}>You have no studies to review.</Title>

    const needsRefreshed = studies.some((study) =>
        study.jobStatusChanges.some((change) => !FINAL_STATUS.includes(change.status)),
    )

    return (
        <Paper shadow="xs" p="xxl">
            <Stack>
                <Flex justify={'space-between'} align={'center'}>
                    <Title order={3}>Review Studies</Title>
                    <Refresher isEnabled={needsRefreshed} refresh={refetch} isPending={isRefetching} />
                </Flex>
                <Divider c="charcoal.1" />
                <Text mb="md">
                    Review all the studies submitted to your organization. Studies that need your attention will be
                    labeled ‘Needs review’.
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
        </Paper>
    )
}

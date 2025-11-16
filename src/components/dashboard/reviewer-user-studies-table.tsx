'use client'

import { useQuery } from '@/common'
import { Link } from '@/components/links'
import { Refresher } from '@/components/refresher'
import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { StudyJobStatus } from '@/database/types'
import { useSession } from '@/hooks/session'
import { useStudyStatus } from '@/hooks/use-study-status'
import { ActionSuccessType } from '@/lib/types'

import { Routes } from '@/lib/routes'
import { fetchStudiesForCurrentReviewerAction } from '@/server/actions/study.actions'
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
} from '@mantine/core'
import dayjs from 'dayjs'
import { InfoTooltip } from '../tooltip'
import { TableSkeleton } from '../layout/skeleton/dashboard'

const FINAL_STATUS: StudyJobStatus[] = ['CODE-REJECTED', 'JOB-ERRORED', 'FILES-APPROVED', 'FILES-REJECTED']

type Studies = ActionSuccessType<typeof fetchStudiesForCurrentReviewerAction>

export const ReviewerUserStudiesTable = () => {
    const { session } = useSession()

    const userId = session?.user.id

    const {
        data: studies = [],
        refetch,
        isFetching,
    } = useQuery({
        queryKey: ['user-reviewer-studies', userId],
        queryFn: () => fetchStudiesForCurrentReviewerAction(),
    })

    if (isFetching && studies?.length === 0) {
        return <TableSkeleton showActionButton={false} paperWrapper={false} />
    }

    if (!studies?.length) return <Title order={5}>You have no studies to review.</Title>

    // Filter studies: reviewer assignment or any status change authored by current user
    const relevantStudies = studies.filter(
        (study) =>
            study.reviewerId === userId ||
            study.jobStatusChanges.some((change: { userId?: string | null }) => change.userId === userId),
    )

    const needsRefreshed = relevantStudies.some((study) =>
        study.jobStatusChanges.some((change) => !FINAL_STATUS.includes(change.status)),
    )

    return (
        <Stack>
            <Flex justify={'space-between'} align={'center'}>
                <Title order={3}>My studies</Title>
                <Refresher isEnabled={needsRefreshed} refresh={refetch} isPending={isFetching} />
            </Flex>
            <Divider c="charcoal.1" />
            <Text mb="md">
                Review all the studies submitted to your organizations. Studies that need your attention will be labeled
                ‘Needs review’.
            </Text>
            <Table layout="fixed" verticalSpacing="md" striped="even" highlightOnHover stickyHeader>
                <TableThead>
                    <TableTr>
                        <TableTh fw={600}>Study Name</TableTh>
                        <TableTh fw={600}>Submitted On</TableTh>
                        <TableTh fw={600}>Submitted By</TableTh>
                        <TableTh fw={600}>Organization</TableTh>
                        <TableTh fw={600}>Stage</TableTh>
                        <TableTh fw={600}>Status</TableTh>
                        <TableTh fw={600}>Details</TableTh>
                    </TableTr>
                </TableThead>
                <TableTbody>
                    {relevantStudies.map((study) => (
                        <StudyRow key={study.id} study={study} />
                    ))}
                </TableTbody>
            </Table>
        </Stack>
    )
}

const StudyRow = ({ study }: { study: Studies[number] }) => {
    const status = useStudyStatus({
        studyStatus: study.status,
        audience: 'reviewer',
        jobStatusChanges: study.jobStatusChanges,
    })

    return (
        <TableTr fz={14} bg={study.status === 'PENDING-REVIEW' ? '#EAD4FC80' : undefined}>
            <TableTd>
                <InfoTooltip label={study.title}>
                    <Text lineClamp={2} style={{ cursor: 'pointer' }}>
                        {study.title}
                    </Text>
                </InfoTooltip>
            </TableTd>
            <TableTd>{dayjs(study.createdAt).format('MMM DD, YYYY')}</TableTd>
            <TableTd>{study.createdBy}</TableTd>
            <TableTd>{study.orgName}</TableTd>
            <TableTd>{status.stage}</TableTd>
            <TableTd>
                <DisplayStudyStatus status={status} />
            </TableTd>
            <TableTd>
                <Link href={Routes.studyReview({ orgSlug: study.orgSlug, studyId: study.id })} c="blue.7">
                    View
                </Link>
            </TableTd>
        </TableTr>
    )
}

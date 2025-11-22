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
    useMantineTheme,
} from '@mantine/core'
import dayjs from 'dayjs'
import { InfoTooltip } from '../tooltip'
import { TableSkeleton } from '../layout/skeleton/dashboard'

const FINAL_STATUS: StudyJobStatus[] = ['CODE-REJECTED', 'JOB-ERRORED', 'FILES-APPROVED', 'FILES-REJECTED']

// Status changes that represent reviewer approval/rejection actions
const REVIEWER_ACTION_STATUSES: StudyJobStatus[] = [
    'CODE-APPROVED',
    'CODE-REJECTED',
    'FILES-APPROVED',
    'FILES-REJECTED',
]

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

    // Show studies where user is assigned as reviewer OR has taken reviewer approval/rejection actions
    const relevantStudies = studies.filter(
        (study) =>
            study.reviewerId === userId ||
            study.jobStatusChanges.some(
                (change: { userId?: string | null; status: StudyJobStatus }) =>
                    change.userId === userId && REVIEWER_ACTION_STATUSES.includes(change.status),
            ),
    )

    if (!relevantStudies?.length) return <Title order={5}>You have no studies to review.</Title>

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
            <Table layout="fixed" verticalSpacing="md" highlightOnHover stickyHeader>
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
    const theme = useMantineTheme()
    const status = useStudyStatus({
        studyStatus: study.status,
        audience: 'reviewer',
        jobStatusChanges: study.jobStatusChanges,
    })

    return (
        <TableTr
            fz={14}
            style={
                study.status === 'PENDING-REVIEW'
                    ? { backgroundColor: `${theme.colors.purple[0]}80`, fontWeight: 600 }
                    : undefined
            }
        >
            <TableTd>
                <InfoTooltip label={study.title}>
                    <Text
                        lineClamp={2}
                        style={{ cursor: 'pointer' }}
                        fw={study.status === 'PENDING-REVIEW' ? 600 : undefined}
                    >
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
                <Link
                    href={Routes.studyReview({ orgSlug: study.orgSlug, studyId: study.id })}
                    c="blue.7"
                    fw={study.status === 'PENDING-REVIEW' ? 600 : undefined}
                >
                    View
                </Link>
            </TableTd>
        </TableTr>
    )
}

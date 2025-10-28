'use client'

import { useQuery } from '@/common'
import { ButtonLink, Link } from '@/components/links'
import { Refresher } from '@/components/refresher'
import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { StudyJobStatus } from '@/database/types'
import { useSession } from '@/hooks/session'
import { useStudyStatus } from '@/hooks/use-study-status'
import { ActionSuccessType, getLabOrg } from '@/lib/types'
import { Routes } from '@/lib/routes'
import { fetchStudiesForCurrentResearcherUserAction } from '@/server/actions/study.actions'
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

const FINAL_STATUS: StudyJobStatus[] = ['CODE-REJECTED', 'JOB-ERRORED', 'FILES-APPROVED', 'FILES-REJECTED']

type Studies = ActionSuccessType<typeof fetchStudiesForCurrentResearcherUserAction>

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
            <TableTd>{study.orgName}</TableTd>
            <TableTd>{status.stage}</TableTd>
            <TableTd>
                <DisplayStudyStatus status={status} />
            </TableTd>
            <TableTd>
                <Link href={Routes.studyView({ orgSlug, studyId: study.id })}>View</Link>
            </TableTd>
        </TableTr>
    )
}

export const ResearcherUserStudiesTable = () => {
    const { session } = useSession()
    const userId = session?.user.id

    const {
        data: studies,
        refetch,
        isFetching,
    } = useQuery({
        queryKey: ['user-researcher-studies'],
        queryFn: () => fetchStudiesForCurrentResearcherUserAction(),
    })

    // check if user can create a study
    const labOrg = session ? getLabOrg(session) : null

    // temp message
    if (!labOrg) {
        return <Title order={5}>You are not a member of any lab organizations.</Title>
    }

    // Show studies created by the current researcher OR those they have updated via status changes
    const relevantStudies = studies?.filter(
        (study) =>
            study.researcherId === userId ||
            study.jobStatusChanges.some((change: { userId?: string | null }) => change.userId === userId),
    )

    const needsRefreshed = relevantStudies?.some((study) =>
        study.jobStatusChanges.some((change) => !FINAL_STATUS.includes(change.status)),
    )

    if (!relevantStudies || relevantStudies.length === 0) {
        return (
            <Paper shadow="xs" p="xxl">
                <Stack align="center" gap="md">
                    <Text>You haven&apos;t started a study yet</Text>
                    <ButtonLink
                        leftSection={<PlusIcon />}
                        href={Routes.studyRequest({ orgSlug: labOrg.slug })}
                        data-testid="new-study"
                    >
                        Propose New Study
                    </ButtonLink>
                </Stack>
            </Paper>
        )
    }

    return (
        <Stack>
            <Group justify="space-between">
                <Title order={3}>My studies</Title>
                <Flex justify="flex-end">
                    <ButtonLink
                        leftSection={<PlusIcon />}
                        data-testid="new-study"
                        href={Routes.studyRequest({ orgSlug: labOrg.slug })}
                    >
                        Propose New Study
                    </ButtonLink>
                </Flex>
            </Group>
            <Divider c="charcoal.1" />
            <Refresher isEnabled={Boolean(needsRefreshed)} refresh={refetch} isPending={isFetching} />
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
                <TableTbody>
                    {relevantStudies.map((study) => (
                        <StudyRow orgSlug={labOrg.slug} study={study} key={study.id} />
                    ))}
                </TableTbody>
            </Table>
        </Stack>
    )
}

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
import { PlusIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { InfoTooltip } from '../tooltip'
import { TableSkeleton } from '../layout/skeleton/dashboard'

const FINAL_STATUS: StudyJobStatus[] = ['CODE-REJECTED', 'JOB-ERRORED', 'FILES-APPROVED', 'FILES-REJECTED']

type Studies = ActionSuccessType<typeof fetchStudiesForCurrentResearcherUserAction>

const StudyRow: React.FC<{ study: Studies[number]; orgSlug: string }> = ({ study, orgSlug }) => {
    const theme = useMantineTheme()
    const status = useStudyStatus({
        studyStatus: study.status,
        audience: 'researcher',
        jobStatusChanges: study.jobStatusChanges,
    })

    const hasFilesApproved = study.jobStatusChanges.some((change) => change.status === 'FILES-APPROVED')

    return (
        <TableTr
            fz={14}
            key={study.id}
            style={hasFilesApproved ? { backgroundColor: `${theme.colors.purple[0]}80`, fontWeight: 600 } : undefined}
        >
            <TableTd>
                <InfoTooltip label={study.title}>
                    <Text lineClamp={2} style={{ cursor: 'pointer' }} size="sm" fw={hasFilesApproved ? 600 : undefined}>
                        {study.title}
                    </Text>
                </InfoTooltip>
            </TableTd>
            <TableTd>{dayjs(study.createdAt).format('MMM DD, YYYY')}</TableTd>
            <TableTd>{study.orgName}</TableTd>
            <TableTd>{status.stage}</TableTd>
            <TableTd>
                <DisplayStudyStatus status={status} isResearchLabDashboard />
            </TableTd>
            <TableTd>
                {study.status === 'DRAFT' ? (
                    <Link href={Routes.studyDraftEdit({ orgSlug, studyId: study.id })}>Edit</Link>
                ) : (
                    <Link href={Routes.studyView({ orgSlug, studyId: study.id })} fw={hasFilesApproved ? 600 : undefined}>
                        View
                    </Link>
                )}
            </TableTd>
        </TableTr>
    )
}

export const ResearcherUserStudiesTable = () => {
    const { session } = useSession()
    const userId = session?.user.id

    const {
        data: studies = [],
        refetch,
        isFetching,
    } = useQuery({
        queryKey: ['user-researcher-studies'],
        queryFn: () => fetchStudiesForCurrentResearcherUserAction(),
    })
    // check if user can create a study
    const labOrg = session ? getLabOrg(session) : null
    if (!labOrg) return null

    if (isFetching && studies?.length === 0) {
        return <TableSkeleton paperWrapper={false} />
    }

    // Show only studies where the current user is the person who submitted the study
    const relevantStudies = studies?.filter((study) => study.researcherId === userId)

    const needsRefreshed = relevantStudies?.some((study) =>
        study.jobStatusChanges.some((change) => !FINAL_STATUS.includes(change.status)),
    )

    if (!relevantStudies || relevantStudies.length === 0) {
        return (
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
            <Table layout="fixed" verticalSpacing="md" highlightOnHover stickyHeader>
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

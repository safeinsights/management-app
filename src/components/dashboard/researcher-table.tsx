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
    useMantineTheme,
} from '@mantine/core'
import { PlusIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import * as React from 'react'
import { useStudyStatus } from '@/hooks/use-study-status'
import { Routes, useTypedParams } from '@/lib/routes'
import { InfoTooltip } from '../tooltip'
import { TableSkeleton } from '../layout/skeleton/dashboard'

type Studies = ActionSuccessType<typeof fetchStudiesForOrgAction>

const NewStudyLink: React.FC<{ orgSlug: string }> = ({ orgSlug }) => {
    return (
        <ButtonLink data-testid="new-study" leftSection={<PlusIcon />} href={Routes.studyRequest({ orgSlug })}>
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
            <TableTd>{study.reviewingEnclaveName}</TableTd>
            <TableTd>{status.stage}</TableTd>
            <TableTd>
                <DisplayStudyStatus status={status} isResearchLabDashboard />
            </TableTd>
            <TableTd>
                {study.status === 'DRAFT' ? (
                    <Link
                        href={Routes.studyDraftEdit({ orgSlug, studyId: study.id })}
                        aria-label={`Edit draft study ${study.title}`}
                    >
                        Edit
                    </Link>
                ) : (
                    <Link
                        href={Routes.studyView({ orgSlug, studyId: study.id })}
                        aria-label={`View details for study ${study.title}`}
                        fw={hasFilesApproved ? 600 : undefined}
                    >
                        View
                    </Link>
                )}
            </TableTd>
        </TableTr>
    )
}

export const ResearcherStudiesTable: React.FC = () => {
    const { orgSlug } = useTypedParams(Routes.orgDashboard.schema)
    const {
        data: studies = [],
        isError,
        isFetching,
    } = useQuery({
        queryKey: ['researcher-studies', orgSlug],
        placeholderData: [],
        queryFn: () => fetchStudiesForOrgAction({ orgSlug }),
    })
    const { session } = useSession()

    if (isFetching && studies?.length === 0) {
        return <TableSkeleton />
    }

    const labOrg = session ? session.orgs[orgSlug] || getLabOrg(session) : null

    if (!session || !labOrg) return null

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
                    <TableTbody>{rows.length > 0 ? rows : <NoStudiesRow slug={labOrg.slug} />}</TableTbody>
                </Table>
            </Stack>
        </Paper>
    )
}

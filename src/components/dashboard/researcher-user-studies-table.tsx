'use client'

import { useQuery } from '@/common'
import { ButtonLink, Link } from '@/components/links'
import { Refresher } from '@/components/refresher'
import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { StudyJobStatus } from '@/database/types'
import { useSession } from '@/hooks/session'
import { getStudyStage } from '@/lib/util'
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
} from '@mantine/core'
import { PlusIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { useMemo } from 'react'

const FINAL_STATUS: StudyJobStatus[] = ['CODE-REJECTED', 'JOB-ERRORED', 'FILES-APPROVED', 'FILES-REJECTED']

export const ResearcherUserStudiesTable = () => {
    const { session } = useSession()
    const {
        data: studies,
        refetch,
        isFetching,
    } = useQuery({
        queryKey: ['user-researcher-studies'],
        queryFn: () => fetchStudiesForCurrentResearcherUserAction(),
    })

    const labOrgs = useMemo(() => {
        if (!session) return []
        return Object.values(session.orgs).filter((org) => org.type === 'lab')
    }, [session])

    const enclaveOrgs = useMemo(() => {
        if (!session) return []
        return Object.values(session.orgs).filter((org) => org.type === 'enclave')
    }, [session])

    if (!labOrgs.length) {
        return <Title order={5}>You are not a member of any lab organizations.</Title>
    }

    if (!enclaveOrgs.length) {
        return <Title order={5}>No organizations are available for study proposals.</Title>
    }

    const primaryEnclaveOrg = enclaveOrgs[0]

    const needsRefreshed = studies?.some((study) =>
        study.jobStatusChanges.some((change) => !FINAL_STATUS.includes(change.status)),
    )

    if (!studies || studies.length === 0) {
        return (
            <Stack align="center" gap="md" p="xxl">
                    <Text>You haven&apos;t started a study yet</Text>
                    <ButtonLink
                        leftSection={<PlusIcon />}
                        href={`/${labOrg.slug}/study/request`}
                        data-testid="new-study"
                    >
                        Propose New Study
                    </ButtonLink>
                </Stack>
        )
    }

    return (
        <Stack pt="xl">
                <Group justify="space-between">
                    <Title order={3}>Proposed Studies</Title>
                    <Flex justify="flex-end">
                        <ButtonLink
                            leftSection={<PlusIcon />}
                            data-testid="new-study"
                            href={`/${labOrg.slug}/study/request`}
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
                        {studies.map((study) => (
                            <TableTr fz={14} key={study.id} bg={study.status === 'APPROVED' ? '#EAD4FC80' : undefined}>
                                <TableTd>{study.title}</TableTd>
                                <TableTd>{dayjs(study.createdAt).format('MMM DD, YYYY')}</TableTd>
                                <TableTd>{study.orgName}</TableTd>
                                <TableTd>{getStudyStage(study.status, 'researcher')}</TableTd>
                                <TableTd>
                                    <DisplayStudyStatus
                                        studyStatus={study.status}
                                        audience="researcher"
                                        jobStatusChanges={study.jobStatusChanges}
                                    />
                                </TableTd>
                                <TableTd>
                                    <Link href={`/${labOrg.slug}/study/${study.id}/review`}>View</Link>
                                </TableTd>
                            </TableTr>
                        ))}
                    </TableTbody>
                </Table>
            </Stack>
    )
}

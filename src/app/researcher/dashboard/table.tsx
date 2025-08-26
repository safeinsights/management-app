'use client'

import * as React from 'react'
import {
    Alert,
    Divider,
    Flex,
    Group,
    Paper,
    Stack,
    Table,
    TableCaption,
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
import { useQuery } from '@tanstack/react-query'

import { fetchStudiesForCurrentResearcherAction } from '@/server/actions/study.actions'
import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { ButtonLink, Link } from '@/components/links'
import { PlusIcon } from '@phosphor-icons/react/dist/ssr'
import { useSession } from '@/hooks/session'

const NewStudyLink: React.FC<{ orgSlug: string }> = ({ orgSlug }) => {
    return (
        <ButtonLink data-testid="new-study" leftSection={<PlusIcon />} href={`/researcher/study/request/${orgSlug}`}>
            Propose New Study
        </ButtonLink>
    )
}

const NoStudiesCaption: React.FC<{ visible: boolean; slug: string }> = ({ visible, slug }) => {
    if (!visible) return null

    return (
        <TableCaption>
            <Alert variant="transparent">
                You haven&apos;t started a study yet
                <Stack>
                    <NewStudyLink orgSlug={slug} />
                </Stack>
            </Alert>
        </TableCaption>
    )
}

export const StudiesTable: React.FC = () => {
    const { data: studies, isLoading } = useQuery({
        queryKey: ['researcher-studies'],
        queryFn: () => fetchStudiesForCurrentResearcherAction(),
    })
    const { session } = useSession()

    if (isLoading) return <Text>Loading studies...</Text>
    if (!session) return null

    const rows = studies?.map((study) => (
        <TableTr fz="md" key={study.id}>
            <TableTd>
                <Tooltip label={study.title}>
                    <Text lineClamp={2} style={{ cursor: 'pointer' }}>
                        {study.title}
                    </Text>
                </Tooltip>
            </TableTd>
            <TableTd>{dayjs(study.createdAt).format('MMM DD, YYYY')}</TableTd>
            <TableTd>{study.reviewerTeamName}</TableTd>
            <TableTd>
                <DisplayStudyStatus
                    studyStatus={study.status}
                    jobStatus={study.latestJobStatus}
                    jobErrored={!!study.errorStudyJobId}
                />
            </TableTd>
            <TableTd>
                <Link href={`/researcher/study/${study.id}/review`}>View</Link>
            </TableTd>
        </TableTr>
    ))

    return (
        <Paper shadow="xs" p="xl">
            <Stack>
                <Group justify="space-between">
                    <Title order={3}>Proposed Studies</Title>
                    <Flex justify="flex-end">
                        <NewStudyLink orgSlug={session.team.slug} />
                    </Flex>
                </Group>
                <Divider c="charcoal.1" />
                <Table layout="fixed" verticalSpacing="md" striped="even" highlightOnHover stickyHeader>
                    <NoStudiesCaption visible={!studies?.length} slug={session.team.slug} />
                    <TableThead fz="sm">
                        <TableTr>
                            <TableTh>Study Name</TableTh>
                            <TableTh>Submitted On</TableTh>
                            <TableTh>Submitted To</TableTh>
                            <TableTh>Status</TableTh>
                            <TableTh>Study Details</TableTh>
                        </TableTr>
                    </TableThead>
                    <TableTbody>{rows}</TableTbody>
                </Table>
            </Stack>
        </Paper>
    )
}

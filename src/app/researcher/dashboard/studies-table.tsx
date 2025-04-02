'use client'

import React, { FC } from 'react'
import { Alert, Button, Flex, Group, Paper, Stack, Table, Text, Title, Tooltip } from '@mantine/core'
import dayjs from 'dayjs'
import Link from 'next/link'
import { Plus } from '@phosphor-icons/react/dist/ssr'
import { useUser } from '@clerk/nextjs'
import { Study } from '@/schema/study'
import { StudyJobStatus, StudyStatus } from '@/database/types'
import { fetchReviewerTeamName } from '@/server/actions/study.actions'
import { useQuery } from '@tanstack/react-query'

export const StudiesTable: FC<{ studies: Partial<Study>[] }> = ({ studies }) => {
    const { user } = useUser()

    interface ReviewerInfo {
        studyId: string
        reviewer: string | null
    }

    const { data: reviewerNames } = useQuery({
        queryKey: ['reviewerTeam', studies.map((study) => study.id).join(',')],
        queryFn: async () => {
            const reviewer: ReviewerInfo[] = await Promise.all(
                studies
                    .filter((study) => study.id)
                    .map(async (study) => {
                        const reviewerName = await fetchReviewerTeamName(study.id!)
                        return {
                            studyId: study.id!,
                            reviewer: reviewerName,
                        }
                    }),
            )
            return reviewer
        },
    })

    const rows = studies.map((study) => (
        <Table.Tr key={study.id}>
            <Table.Td>
                <Tooltip label={study.title}>
                    <Text lineClamp={2} style={{ cursor: 'pointer' }}>
                        {study.title}
                    </Text>
                </Tooltip>
            </Table.Td>
            <Table.Td>
                <Text>{dayjs(study.createdAt).format('MMM DD, YYYY')}</Text>
            </Table.Td>
            <Table.Td>
                {reviewerNames?.find((reviewer: ReviewerInfo) => reviewer.studyId === study.id)?.reviewer}
            </Table.Td>
            <Table.Td>
                <Stack gap="xs">
                    <DisplayStudyStatus studyStatus={study.status!} jobStatus={study.latestJobStatus} />
                </Stack>
            </Table.Td>
            <Table.Td>
                <Link style={{ textDecoration: 'underline' }} href={`/researcher/study/${study.id}/review`}>
                    View
                </Link>
            </Table.Td>
        </Table.Tr>
    ))

    return (
        <Stack p="md">
            <Title>Hi {user?.firstName}!</Title>
            <Stack>
                <Text>
                    Welcome to SafeInsights! This is your dashboard. Here, you can submit new research proposals, view
                    their status and access its details. We continuously iterate to improve your experience and welcome
                    your feedback.
                </Text>
            </Stack>

            <Paper shadow="xs" p="xl">
                <Stack>
                    <Group justify="space-between">
                        <Title order={3}>Proposed Studies</Title>
                        <Flex justify="flex-end">
                            <Link href="/researcher/study/request/openstax">
                                <Button leftSection={<Plus />}>Propose New Study</Button>
                            </Link>
                        </Flex>
                    </Group>
                    <Text>Review submitted studies and check status below. </Text>
                    <Table layout="fixed" verticalSpacing="md" striped highlightOnHover>
                        {!rows.length && (
                            <Table.Caption>
                                <Alert variant="transparent">
                                    You haven&apos;t started a study yet
                                    <Stack>
                                        <Link
                                            style={{ textDecoration: 'underline' }}
                                            href="/researcher/study/request/openstax"
                                        >
                                            Propose New Study
                                        </Link>
                                    </Stack>
                                </Alert>
                            </Table.Caption>
                        )}
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th fw="semibold">Study Name</Table.Th>
                                <Table.Th>Submitted On</Table.Th>
                                <Table.Th>Submitted To</Table.Th>
                                <Table.Th>Status</Table.Th>
                                <Table.Th>Study Details</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>{rows}</Table.Tbody>
                    </Table>
                </Stack>
            </Paper>
        </Stack>
    )
}

export const DisplayStudyStatus: FC<{ studyStatus: StudyStatus; jobStatus: StudyJobStatus | null }> = ({
    studyStatus,
    jobStatus,
}) => {
    if (jobStatus === 'JOB-PACKAGING') {
        return (
            <Stack gap="0">
                <Text size="xs" c="#64707C">
                    Code
                </Text>
                <Text>Processing</Text>
            </Stack>
        )
    }

    if (jobStatus === 'JOB-ERRORED') {
        return (
            <Stack gap="0">
                <Text
                    size="xs"
                    c="#64707C"
                    pl={8}
                    style={{ width: '65px', backgroundColor: '#D9D9D9', textAlign: 'left', borderRadius: '2px' }}
                >
                    Code
                </Text>
                <Text>Errored</Text>
            </Stack>
        )
    }

    if (jobStatus === 'RUN-COMPLETE') {
        return (
            <Stack gap="0">
                <Text size="xs" c="#64707C">
                    Results
                </Text>
                <Text>Under Review</Text>
            </Stack>
        )
    }

    if (jobStatus === 'RESULTS-REJECTED') {
        return (
            <Stack gap="0">
                <Text size="xs" c="#64707C">
                    Results
                </Text>
                <Text>Rejected</Text>
            </Stack>
        )
    }

    if (jobStatus === 'RESULTS-APPROVED') {
        return (
            <Stack gap="0">
                <Text
                    size="xs"
                    pl={8}
                    c="#64707C"
                    style={{ width: '65px', backgroundColor: '#D9D9D9', textAlign: 'left', borderRadius: '2px' }}
                >
                    Results
                </Text>
                <Text>Approved</Text>
            </Stack>
        )
    }

    if (studyStatus === 'PENDING-REVIEW') {
        return (
            <Stack gap="0">
                <Text size="xs" c="#64707C">
                    Proposal
                </Text>
                <Text>Under Review</Text>
            </Stack>
        )
    }

    if (studyStatus === 'APPROVED') {
        return (
            <Stack gap="0">
                <Text size="xs" c="#64707C">
                    Proposal
                </Text>
                <Text>Approved</Text>
            </Stack>
        )
    }

    if (studyStatus === 'REJECTED') {
        return (
            <Stack gap="0">
                <Text
                    size="xs"
                    c="#64707C"
                    pl={8}
                    style={{ width: '65px', backgroundColor: '#D9D9D9', textAlign: 'left', borderRadius: '2px' }}
                >
                    Proposal
                </Text>
                <Text>Rejected</Text>
            </Stack>
        )
    }

    return null
}

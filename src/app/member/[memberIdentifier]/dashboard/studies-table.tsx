'use client'

import React, { FC } from 'react'
import { Member } from '@/schema/member'
import { Anchor, Paper, Stack, Table, Text, Title, Tooltip } from '@mantine/core'
import { fetchStudiesForCurrentMemberAction } from '@/server/actions/study.actions'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import Link from 'next/link'
import { StudyJobStatus, StudyStatus } from '@/database/types'

export const StudiesTable: FC<{ member: Member }> = ({ member }) => {
    const { data: studies = [] } = useQuery({
        queryKey: ['studiesForMember', member.identifier],
        queryFn: () => {
            return fetchStudiesForCurrentMemberAction()
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
            <Table.Td>{dayjs(study.createdAt).format('MMM DD, YYYY')}</Table.Td>
            <Table.Td>{study.researcherName}</Table.Td>
            <Table.Td>{study.reviewerName}</Table.Td>
            <Table.Td>
                <DisplayStudyStatus studyStatus={study.status} jobStatus={study.latestJobStatus} />
            </Table.Td>
            <Table.Td>
                <Anchor component={Link} href={`/member/${member.identifier}/study/${study.id}/review`}>
                    View
                </Anchor>
            </Table.Td>
        </Table.Tr>
    ))

    return (
        <Paper shadow="xs" p="xl">
            <Stack>
                <Title order={3}>Review Studies</Title>

                <Table layout="fixed" highlightOnHover withRowBorders>
                    {!rows.length && (
                        <Table.Caption>
                            <Text>You have no studies to review.</Text>
                        </Table.Caption>
                    )}

                    <Table.Thead>
                        <Table.Tr bg="#F1F3F5">
                            <Table.Th fw={600}>Study Name</Table.Th>
                            <Table.Th fw={600}>Submitted On</Table.Th>
                            <Table.Th fw={600}>Researcher</Table.Th>
                            <Table.Th fw={600}>Reviewed By</Table.Th>
                            <Table.Th fw={600}>Status</Table.Th>
                            <Table.Th fw={600}>Details</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>{rows}</Table.Tbody>
                </Table>
            </Stack>
        </Paper>
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
                <Text size="xs" c="#64707C">
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
                <Text size="xs" c="#64707C">
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
                <Text size="xs" c="#64707C">
                    Proposal
                </Text>
                <Text>Rejected</Text>
            </Stack>
        )
    }

    return null
}

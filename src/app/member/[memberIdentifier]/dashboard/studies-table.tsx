'use server'

import React, { FC } from 'react'
import { Member } from '@/schema/member'
import {
    Anchor,
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
import { fetchStudiesForCurrentMemberAction } from '@/server/actions/study.actions'
import dayjs from 'dayjs'
import Link from 'next/link'
import { StudyJobStatus, StudyStatus } from '@/database/types'

export const StudiesTable: FC<{ member: Member }> = async ({ member }) => {
    const studies = await fetchStudiesForCurrentMemberAction()

    const rows = studies.map((study) => (
        <TableTr key={study.id}>
            <TableTd>
                <Tooltip label={study.title}>
                    <Text lineClamp={2} style={{ cursor: 'pointer' }}>
                        {study.title}
                    </Text>
                </Tooltip>
            </TableTd>
            <TableTd>{dayjs(study.createdAt).format('MMM DD, YYYY')}</TableTd>
            <TableTd>{study.researcherName}</TableTd>
            <TableTd>{study.reviewerName}</TableTd>
            <TableTd>
                <DisplayStudyStatus studyStatus={study.status} jobStatus={study.latestJobStatus} />
            </TableTd>
            <TableTd>
                <Anchor component={Link} href={`/member/${member.identifier}/study/${study.id}/review`}>
                    View
                </Anchor>
            </TableTd>
        </TableTr>
    ))

    return (
        <Paper shadow="xs" p="xl">
            <Stack>
                <Title order={3}>Review Studies</Title>

                <Table layout="fixed" highlightOnHover withRowBorders>
                    {!rows.length && (
                        <TableCaption>
                            <Text>You have no studies to review.</Text>
                        </TableCaption>
                    )}

                    <TableThead>
                        <TableTr bg="#F1F3F5">
                            <TableTh fw={600}>Study Name</TableTh>
                            <TableTh fw={600}>Submitted On</TableTh>
                            <TableTh fw={600}>Researcher</TableTh>
                            <TableTh fw={600}>Reviewed By</TableTh>
                            <TableTh fw={600}>Status</TableTh>
                            <TableTh fw={600}>Details</TableTh>
                        </TableTr>
                    </TableThead>
                    <TableTbody>{rows}</TableTbody>
                </Table>
            </Stack>
        </Paper>
    )
}

export const DisplayStudyStatus: FC<{ studyStatus: StudyStatus; jobStatus: StudyJobStatus | null }> = async ({
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

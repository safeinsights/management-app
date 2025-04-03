'use server'

import React from 'react'
import { AlertNotFound } from '@/components/errors'
import { getMemberFromIdentifierAction } from '@/server/actions/member.actions'
import {
    Anchor,
    Divider,
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
import { DisplayStudyStatus } from './display-study-status'
import { UserName } from '@/components/user-name'

export default async function MemberDashboardPage(props: { params: Promise<{ memberIdentifier: string }> }) {
    const { memberIdentifier } = await props.params

    const member = await getMemberFromIdentifierAction(memberIdentifier)

    if (!member) {
        return <AlertNotFound title="Member was not found" message="no such member exists" />
    }

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
                <DisplayStudyStatus
                    studyStatus={study.status}
                    jobStatus={study.latestJobStatus}
                    jobId={study.latestStudyJobId}
                />
            </TableTd>
            <TableTd>
                <Anchor component={Link} href={`/member/${member.identifier}/study/${study.id}/review`}>
                    View
                </Anchor>
            </TableTd>
        </TableTr>
    ))

    return (
        <Stack p="md">
            <Title>
                Hi <UserName />!
            </Title>
            <Text>
                Welcome to your SafeInsights dashboard! Here you can find study proposals submitted to your
                organization, view their status and know when you need to take action. We continuously iterate to
                improve your experience and welcome your feedback.
            </Text>
            <Divider />
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
        </Stack>
    )
}

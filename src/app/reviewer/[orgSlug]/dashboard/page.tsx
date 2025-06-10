'use server'

import React from 'react'
import { AlertNotFound } from '@/components/errors'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
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
import { fetchStudiesForOrgAction } from '@/server/actions/study.actions'
import dayjs from 'dayjs'
import Link from 'next/link'
import { UserName } from '@/components/user-name'
import { DisplayStudyStatus } from '@/components/study/display-study-status'

export default async function OrgDashboardPage(props: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await props.params

    const org = await getOrgFromSlugAction(orgSlug)

    if (!org) {
        return <AlertNotFound title="Org was not found" message="no such org exists" />
    }

    const studies = await fetchStudiesForOrgAction({ orgSlug })

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
                <Anchor component={Link} href={`/reviewer/${org.slug}/study/${study.id}/review`} c="blue.7">
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
                <strong>Welcome to your SafeInsights dashboard!</strong> Here you can find study proposals submitted to
                your organization, view their status and know when you need to take action. We continuously iterate to
                improve your experience and welcome your feedback.
            </Text>
            <Paper shadow="xs" p="xl">
                <Stack>
                    <Title order={3}>Review Studies</Title>
                    <Divider c="charcoal.1" />
                    <Table layout="fixed" verticalSpacing="md" striped="even" highlightOnHover stickyHeader>
                        {!rows.length && (
                            <TableCaption>
                                <Text>You have no studies to review.</Text>
                            </TableCaption>
                        )}

                        <TableThead>
                            <TableTr>
                                <TableTh fw={600}>Study Name</TableTh>
                                <TableTh fw={600}>Submitted On</TableTh>
                                <TableTh fw={600}>Submitted By</TableTh>
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
